/**
 * 考題系統路由
 */
const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../middleware/authMiddleware');
const safeError = require('../safeError');
const { generateQuestions, gradeShortAnswer } = require('../services/examGeneratorService');
const { parseXlsx } = require('../services/fileParserService');

const router = express.Router();

/**
 * POST /api/exams/upload
 * 老師上傳 Excel 考題
 */
router.post('/upload', requireRole('ADMIN', 'TEACHER'), (req, res) => {
  const upload = req.app.locals.upload;
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, error: err.message });
    if (!req.file) return res.status(400).json({ success: false, error: '請上傳檔案' });

    try {
      const { courseId } = req.body;
      if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

      const XLSX = require('xlsx');
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      const inserted = [];
      for (const row of rows) {
        const questionText = row['題目'] || row['question'] || row['question_text'];
        const correctAnswer = row['答案'] || row['answer'] || row['correct_answer'];
        if (!questionText || !correctAnswer) continue;

        const options = row['選項'] || row['options'];
        let parsedOptions = null;
        if (options) {
          try {
            parsedOptions = typeof options === 'string' ? JSON.parse(options) : options;
          } catch {
            // 嘗試以分號分割
            parsedOptions = options.split(/[;；]/).map((o, i) =>
              o.trim().match(/^[A-D]/) ? o.trim() : `${String.fromCharCode(65 + i)}. ${o.trim()}`
            );
          }
        }

        const questionType = row['題型'] || row['type'] ||
          (parsedOptions ? 'MULTIPLE_CHOICE' : 'SHORT_ANSWER');
        const difficulty = parseInt(row['難度'] || row['difficulty']) || 3;
        const explanation = row['解說'] || row['explanation'] || '';

        const { rows: insertedRows } = await pool.query(
          `INSERT INTO exam_questions (course_id, question_type, question_text, options, correct_answer, explanation, difficulty, source, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'UPLOAD', 'ACTIVE', $8) RETURNING id`,
          [courseId, questionType, questionText, parsedOptions ? JSON.stringify(parsedOptions) : null,
           correctAnswer, explanation, difficulty, req.user.id]
        );
        inserted.push(insertedRows[0].id);
      }

      res.json({
        success: true,
        data: { importedCount: inserted.length, totalRows: rows.length },
      });
    } catch (err) {
      safeError(res, err, 'POST /api/exams/upload');
    }
  });
});

/**
 * POST /api/exams/generate
 * AI 自動出題
 * Body: { courseId, materialId?, count, difficulty, questionTypes }
 */
router.post('/generate', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const { courseId, materialId, count = 5, difficulty = 'mixed', questionTypes = ['MULTIPLE_CHOICE'] } = req.body;
    if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

    // 取得教材 chunks 作為出題依據
    let query = `SELECT content FROM document_chunks dc
                 JOIN materials m ON dc.material_id = m.id
                 WHERE m.course_id = $1 AND m.status = 'READY'`;
    const params = [courseId];

    if (materialId) {
      query += ` AND dc.material_id = $2`;
      params.push(materialId);
    }
    query += ' ORDER BY RANDOM() LIMIT 20';

    const { rows: chunks } = await pool.query(query, params);
    if (chunks.length === 0) {
      return res.status(400).json({ success: false, error: '該課程沒有已處理的教材，請先上傳教材' });
    }

    const chunkTexts = chunks.map(c => c.content);
    // 【PM 決策 #6】每次最多 5 題，避免 JSON 超過 maxOutputTokens 被截斷
    const questions = await generateQuestions(chunkTexts, {
      count: Math.min(count, 5),
      types: questionTypes,
      difficulty,
    });

    // 存為草稿 (DRAFT)
    const savedQuestions = [];
    for (const q of questions) {
      const { rows } = await pool.query(
        `INSERT INTO exam_questions (course_id, material_id, question_type, question_text, options, correct_answer, explanation, difficulty, source, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AI', 'DRAFT', $9) RETURNING *`,
        [courseId, materialId || null, q.question_type, q.question_text,
         q.options ? JSON.stringify(q.options) : null, q.correct_answer,
         q.explanation, q.difficulty, req.user.id]
      );
      savedQuestions.push(rows[0]);
    }

    res.json({
      success: true,
      data: { generatedCount: savedQuestions.length, questions: savedQuestions },
    });
  } catch (err) {
    safeError(res, err, 'POST /api/exams/generate');
  }
});

/**
 * GET /api/exams/questions?courseId=xxx&status=ACTIVE&difficulty=3&limit=10
 */
router.get('/questions', async (req, res) => {
  try {
    const { courseId, status, difficulty, type, limit = 50 } = req.query;
    if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

    let query = `SELECT * FROM exam_questions WHERE course_id = $1`;
    const params = [courseId];
    let paramIdx = 2;

    // 學生只看 ACTIVE 題目
    if (req.user.role === 'STUDENT') {
      query += ` AND status = 'ACTIVE'`;
    } else if (status) {
      query += ` AND status = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }

    if (difficulty) {
      query += ` AND difficulty = $${paramIdx}`;
      params.push(parseInt(difficulty));
      paramIdx++;
    }
    if (type) {
      query += ` AND question_type = $${paramIdx}`;
      params.push(type);
      paramIdx++;
    }

    query += ` ORDER BY ${req.user.role === 'STUDENT' ? 'RANDOM()' : 'created_at DESC'} LIMIT $${paramIdx}`;
    params.push(parseInt(limit));

    const { rows } = await pool.query(query, params);

    // 學生不顯示答案和解說
    const data = req.user.role === 'STUDENT'
      ? rows.map(({ correct_answer, explanation, ...rest }) => rest)
      : rows;

    res.json({ success: true, data });
  } catch (err) {
    safeError(res, err, 'GET /api/exams/questions');
  }
});

/**
 * POST /api/exams/attempt
 * 學生作答
 * Body: { questionId, studentAnswer }
 */
router.post('/attempt', async (req, res) => {
  try {
    const { questionId, studentAnswer } = req.body;
    if (!questionId || studentAnswer === undefined) {
      return res.status(400).json({ success: false, error: '請提供 questionId 和 studentAnswer' });
    }

    // 取得題目
    const { rows: questionRows } = await pool.query(
      'SELECT * FROM exam_questions WHERE id = $1', [questionId]
    );
    if (questionRows.length === 0) {
      return res.status(404).json({ success: false, error: '題目不存在' });
    }
    const question = questionRows[0];

    let isCorrect, feedback;

    if (question.question_type === 'SHORT_ANSWER') {
      // AI 批改
      const grade = await gradeShortAnswer(
        question.question_text, question.correct_answer, studentAnswer
      );
      isCorrect = grade.isCorrect;
      feedback = grade.feedback;
    } else {
      // 選擇題/是非題：精確比對
      isCorrect = studentAnswer.toUpperCase().trim() === question.correct_answer.toUpperCase().trim();
      feedback = isCorrect
        ? '正確！'
        : `錯誤。正確答案是 ${question.correct_answer}`;
      if (question.explanation) {
        feedback += `\n\n解說：${question.explanation}`;
      }
    }

    // 存入作答紀錄
    await pool.query(
      `INSERT INTO student_attempts (student_id, question_id, student_answer, is_correct, ai_feedback)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, questionId, studentAnswer, isCorrect, feedback]
    );

    // 更新每日用量
    await pool.query(
      `INSERT INTO daily_usage (user_id, usage_date, exam_count)
       VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (user_id, usage_date)
       DO UPDATE SET exam_count = daily_usage.exam_count + 1`,
      [req.user.id]
    );

    res.json({
      success: true,
      data: {
        isCorrect,
        feedback,
        correctAnswer: question.correct_answer,
        explanation: question.explanation,
      },
    });
  } catch (err) {
    safeError(res, err, 'POST /api/exams/attempt');
  }
});

/**
 * PUT /api/exams/questions/:id
 * 編輯題目（含審核 DRAFT → ACTIVE）
 */
router.put('/questions/:id', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const { question_text, options, correct_answer, explanation, difficulty, status } = req.body;
    const { rows } = await pool.query(
      `UPDATE exam_questions SET
       question_text = COALESCE($1, question_text),
       options = COALESCE($2, options),
       correct_answer = COALESCE($3, correct_answer),
       explanation = COALESCE($4, explanation),
       difficulty = COALESCE($5, difficulty),
       status = COALESCE($6, status)
       WHERE id = $7 RETURNING *`,
      [question_text, options ? JSON.stringify(options) : null, correct_answer,
       explanation, difficulty, status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: '題目不存在' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'PUT /api/exams/questions/:id');
  }
});

/**
 * DELETE /api/exams/questions/:id
 */
router.delete('/questions/:id', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM exam_questions WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ success: false, error: '題目不存在' });
    res.json({ success: true, data: { message: '題目已刪除' } });
  } catch (err) {
    safeError(res, err, 'DELETE /api/exams/questions/:id');
  }
});

/**
 * GET /api/exams/results?courseId=xxx
 */
router.get('/results', async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

    if (req.user.role === 'STUDENT') {
      // 學生看自己的成績
      const { rows } = await pool.query(
        `SELECT sa.*, eq.question_text, eq.question_type, eq.difficulty
         FROM student_attempts sa
         JOIN exam_questions eq ON sa.question_id = eq.id
         WHERE sa.student_id = $1 AND eq.course_id = $2
         ORDER BY sa.created_at DESC LIMIT 100`,
        [req.user.id, courseId]
      );
      const correct = rows.filter(r => r.is_correct).length;
      res.json({
        success: true,
        data: {
          attempts: rows,
          summary: { total: rows.length, correct, accuracy: rows.length > 0 ? Math.round(correct / rows.length * 100) : 0 },
        },
      });
    } else {
      // 老師看全班成績
      const { rows } = await pool.query(
        `SELECT u.student_id, u.name,
                COUNT(sa.id) as total_attempts,
                COUNT(CASE WHEN sa.is_correct THEN 1 END) as correct_count,
                ROUND(COUNT(CASE WHEN sa.is_correct THEN 1 END)::numeric / GREATEST(COUNT(sa.id), 1) * 100) as accuracy
         FROM users u
         JOIN course_enrollments ce ON u.id = ce.user_id
         LEFT JOIN student_attempts sa ON u.id = sa.student_id
         LEFT JOIN exam_questions eq ON sa.question_id = eq.id AND eq.course_id = $1
         WHERE ce.course_id = $1
         GROUP BY u.id, u.student_id, u.name
         ORDER BY accuracy DESC`,
        [courseId]
      );
      res.json({ success: true, data: rows });
    }
  } catch (err) {
    safeError(res, err, 'GET /api/exams/results');
  }
});

/**
 * GET /api/exams/qa-quiz?count=10&category=xxx
 * 從 knowledge_qa 隨機抽題，生成選擇題（1正確+3干擾選項）
 */
router.get('/qa-quiz', async (req, res) => {
  try {
    const count = Math.min(parseInt(req.query.count) || 10, 20);
    const { category, courseId } = req.query;

    let whereClause = 'WHERE q.is_active = true';
    const params = [];
    let paramIdx = 1;

    if (courseId) {
      whereClause += ` AND q.course_id = $${paramIdx}`;
      params.push(courseId);
      paramIdx++;
    }
    if (category) {
      whereClause += ` AND q.category = $${paramIdx}`;
      params.push(category);
      paramIdx++;
    }

    // 抽出題目
    const { rows: questions } = await pool.query(
      `SELECT id, question, answer, category FROM knowledge_qa q
       ${whereClause}
       ORDER BY RANDOM() LIMIT $${paramIdx}`,
      [...params, count]
    );

    if (questions.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // 為每題抽 3 個干擾選項（來自其他題目的答案）
    const allQuestionIds = questions.map(q => q.id);
    const { rows: distractorPool } = await pool.query(
      `SELECT id, answer FROM knowledge_qa
       WHERE is_active = true AND id != ALL($1)
       ORDER BY RANDOM() LIMIT $2`,
      [allQuestionIds, questions.length * 3 + 10]
    );

    const quizItems = questions.map((q, i) => {
      // 取 3 個干擾（循環取用，避免重複）
      const distractors = [];
      for (let d = 0; d < 3; d++) {
        const poolIdx = (i * 3 + d) % Math.max(distractorPool.length, 1);
        const distractor = distractorPool[poolIdx]?.answer;
        if (distractor && !distractors.includes(distractor)) {
          distractors.push(distractor);
        }
      }
      while (distractors.length < 3) {
        distractors.push('（無干擾選項）');
      }

      // 正確答案插入隨機位置
      const correctIndex = Math.floor(Math.random() * 4);
      const options = [...distractors];
      options.splice(correctIndex, 0, q.answer);

      return {
        id: q.id,
        category: q.category,
        question: q.question,
        options,
        correctIndex,
      };
    });

    res.json({ success: true, data: quizItems });
  } catch (err) {
    safeError(res, err, 'GET /api/exams/qa-quiz');
  }
});

/**
 * GET /api/exams/qa-categories
 * 取得所有可用分類
 */
router.get('/qa-categories', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, COUNT(*) as count
       FROM knowledge_qa WHERE is_active = true
       GROUP BY category ORDER BY category`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/exams/qa-categories');
  }
});

module.exports = router;
