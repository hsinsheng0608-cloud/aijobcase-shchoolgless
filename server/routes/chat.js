/**
 * 聊天路由 - SSE 串流 + 歷史紀錄
 */
const express = require('express');
const { pool } = require('../db');
const safeError = require('../safeError');
const { chatStream } = require('../services/geminiService');
const { search } = require('../services/vectorSearchService');
const { acquire, release } = require('../services/geminiQueue');

const router = express.Router();

// ══════════════════════════════════════════
// 【成本控管 #1】每日次數上限：30 次
// 超過時直接擋在 Gemini 呼叫前，不消耗 Token
// ══════════════════════════════════════════
const DAILY_QUESTION_LIMIT = 30;

// 【成本控管 #2】Sliding Window：只保留最近 N 則對話
const HISTORY_WINDOW = 8;

/**
 * POST /api/chat/stream
 * SSE 串流聊天
 * Body: { message, courseId }
 */
router.post('/stream', async (req, res) => {
  const { message, courseId, arContext } = req.body;
  if (!message) {
    return res.status(400).json({ success: false, error: '請提供 message' });
  }
  // courseId 可為 null（AR 助教模式）：跳過 RAG、歷史按 course_id IS NULL 分組

  try {
    // 1. 【成本控管 #1】檢查每日用量，先計數再呼叫 API
    const usageResult = await pool.query(
      `INSERT INTO daily_usage (user_id, usage_date, question_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, usage_date)
       DO UPDATE SET question_count = daily_usage.question_count + 1
       RETURNING question_count`,
      [req.user.id]
    );
    const count = usageResult.rows[0].question_count;
    if (count > DAILY_QUESTION_LIMIT) {
      // 超限：扣回剛才加的 1，避免計數持續膨脹
      await pool.query(
        `UPDATE daily_usage SET question_count = question_count - 1
         WHERE user_id = $1 AND usage_date = CURRENT_DATE`,
        [req.user.id]
      );
      return res.status(429).json({
        success: false,
        error: '今日練習額度已滿，明天再加油',
        data: { used: DAILY_QUESTION_LIMIT, limit: DAILY_QUESTION_LIMIT },
      });
    }

    // 2. 向量搜尋相關教材（僅在有 courseId 時執行）
    let sources = [];
    let context = [];
    if (courseId) {
      try {
        sources = await search(message, courseId, 5, 0.3);
        context = sources.map(s => s.content);
      } catch (err) {
        console.warn('向量搜尋失敗，將無教材上下文回答:', err.message);
      }
    }

    // 3. 【成本控管 #2】Sliding Window：從 DB 取最近 8 則，新對話自動頂替舊的
    //    取 DESC 後 reverse 回正序，確保 Gemini history 時序正確
    //    有 courseId 按課程分組；無 courseId（AR 助教）按 course_id IS NULL 分組
    const historyQuery = courseId
      ? `SELECT role, content FROM chat_messages
         WHERE user_id = $1 AND course_id = $2
         ORDER BY created_at DESC, id DESC LIMIT $3`
      : `SELECT role, content FROM chat_messages
         WHERE user_id = $1 AND course_id IS NULL
         ORDER BY created_at DESC, id DESC LIMIT $2`;
    const historyParams = courseId
      ? [req.user.id, courseId, HISTORY_WINDOW]
      : [req.user.id, HISTORY_WINDOW];
    const { rows: historyRows } = await pool.query(historyQuery, historyParams);
    const history = historyRows.reverse(); // 轉回時間正序

    // 4. 設定 SSE headers（立刻開連線，前端進入「思考中」狀態）
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx/Zeabur 禁止緩衝
    res.flushHeaders();

    // 5. 排隊等候 Gemini 名額（期間每 3 秒送 heartbeat 保持連線）
    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, 3000);

    await acquire(); // 等到有空位才繼續
    clearInterval(heartbeat);

    try {
      // 6. 送出來源資訊
      const sourcesData = sources.map(s => ({
        content: s.content.slice(0, 200) + '...',
        metadata: s.metadata,
        similarity: Math.round(s.similarity * 100) / 100,
      }));
      res.write(`data: ${JSON.stringify({ type: 'sources', data: sourcesData })}\n\n`);

      // 7. 串流 Gemini 回覆（傳入 history，啟動記憶體）
      let fullResponse = '';
      const stream = chatStream(message, context, history, arContext);
      for await (const chunk of stream) {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({ type: 'token', text: chunk })}\n\n`);
      }

      // 8. 完成
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();

      // 9. 背景存聊天紀錄
      saveMessages(req.user.id, courseId ?? null, message, fullResponse, sourcesData)
        .catch(err => console.error('存聊天紀錄失敗:', err.message));

    } finally {
      release(); // 無論成功或失敗都要釋放名額
    }

  } catch (err) {
    // SSE 已開始就不能送 JSON error，改用 SSE error event
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    } else {
      safeError(res, err, 'POST /api/chat/stream');
    }
  }
});

async function saveMessages(userId, courseId, userMsg, aiMsg, sources) {
  await pool.query(
    `INSERT INTO chat_messages (user_id, course_id, role, content)
     VALUES ($1, $2, 'user', $3)`,
    [userId, courseId, userMsg]
  );
  await pool.query(
    `INSERT INTO chat_messages (user_id, course_id, role, content, sources)
     VALUES ($1, $2, 'model', $3, $4)`,
    [userId, courseId, aiMsg, JSON.stringify(sources)]
  );
}

/**
 * GET /api/chat/history?courseId=xxx&limit=50
 */
router.get('/history', async (req, res) => {
  try {
    const { courseId, limit = 50 } = req.query;
    if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

    const { rows } = await pool.query(
      `SELECT id, role, content, sources, mode, created_at
       FROM chat_messages
       WHERE user_id = $1 AND course_id = $2
       ORDER BY created_at DESC, id DESC LIMIT $3`,
      [req.user.id, courseId, parseInt(limit)]
    );

    res.json({ success: true, data: rows.reverse() }); // 時間正序
  } catch (err) {
    safeError(res, err, 'GET /api/chat/history');
  }
});

module.exports = router;
