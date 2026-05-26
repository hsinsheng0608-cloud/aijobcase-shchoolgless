const express = require('express');
const { pool } = require('../db');
const safeError = require('../safeError');
const router = express.Router();

/** GET /api/stats/overview — 管理員/教師 系統總覽 */
router.get('/overview', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int  FROM courses  WHERE status = 'ACTIVE')                       AS course_count,
        (SELECT COUNT(*)::int  FROM users    WHERE role = 'STUDENT' AND status = 'ACTIVE')  AS student_count,
        (SELECT COALESCE(SUM(question_count), 0)::int FROM daily_usage)                     AS total_ai_requests,
        (SELECT COUNT(*)::int  FROM materials WHERE status = 'READY')                       AS material_count
    `);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/overview');
  }
});

/** GET /api/stats/my-usage — 學生個人用量 */
router.get('/my-usage', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(SUM(question_count), 0) AS month_total,
        COALESCE(
          (SELECT question_count FROM daily_usage
           WHERE user_id = $1 AND usage_date = CURRENT_DATE), 0) AS today_used
      FROM daily_usage
      WHERE user_id = $1
        AND usage_date >= date_trunc('month', CURRENT_DATE)
    `, [req.user.id]);

    const todayUsed = parseInt(rows[0].today_used);
    res.json({
      success: true,
      data: {
        month_total:  parseInt(rows[0].month_total),
        today_used:   todayUsed,
        today_limit:  30,
        today_remain: Math.max(0, 30 - todayUsed),
      },
    });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/my-usage');
  }
});

/** GET /api/stats/teacher-overview — 教師個人課程統計 */
router.get('/teacher-overview', async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int
           FROM materials m
           JOIN courses c ON c.id = m.course_id
          WHERE c.teacher_id = $1 AND m.status = 'READY')             AS my_material_count,
        (SELECT COUNT(*)::int
           FROM course_enrollments ce
           JOIN courses c ON c.id = ce.course_id
          WHERE c.teacher_id = $1)                                     AS enrolled_students,
        (SELECT COALESCE(SUM(du.question_count), 0)::int
           FROM daily_usage du
           JOIN chat_messages cm ON cm.user_id = du.user_id
           JOIN courses c ON c.id = cm.course_id
          WHERE c.teacher_id = $1)                                     AS student_questions
    `, [uid]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/teacher-overview');
  }
});

/** GET /api/stats/weekly-trend — 近 7 日 AI 問答趨勢 */
router.get('/weekly-trend', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(d::date, 'MM/DD') AS name,
        COALESCE(SUM(du.question_count), 0)::int AS queries,
        COUNT(DISTINCT du.user_id)::int            AS active_users
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'
      ) AS d
      LEFT JOIN daily_usage du ON du.usage_date = d::date
      GROUP BY d
      ORDER BY d
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/weekly-trend');
  }
});

/** GET /api/stats/engagement — 學生參與度 (管理員/教師) */
router.get('/engagement', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      WITH total AS (
        SELECT COUNT(*)::float AS cnt FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE'
      )
      SELECT
        ROUND(
          (SELECT COUNT(DISTINCT user_id)::float FROM chat_messages WHERE role = 'user')
          / GREATEST(total.cnt, 1) * 100
        )::int AS chat_pct,
        ROUND(
          (SELECT COUNT(DISTINCT student_id)::float FROM student_attempts)
          / GREATEST(total.cnt, 1) * 100
        )::int AS exam_pct,
        ROUND(
          (SELECT COUNT(DISTINCT student_id)::float FROM ar_practice_sessions WHERE status = 'COMPLETED')
          / GREATEST(total.cnt, 1) * 100
        )::int AS ar_pct
      FROM total
    `);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/engagement');
  }
});

/** GET /api/stats/hot-topics — 熱門發問主題 (近 50 則 user 訊息取前 5) */
router.get('/hot-topics', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        cm.content AS question,
        c.name     AS course_name,
        cm.created_at
      FROM chat_messages cm
      JOIN courses c ON c.id = cm.course_id
      WHERE cm.role = 'user'
      ORDER BY cm.created_at DESC
      LIMIT 5
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/hot-topics');
  }
});

/** GET /api/stats/recent-activity — 學生最近互動課程 */
router.get('/recent-activity', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (cm.course_id)
        c.id                                              AS course_id,
        c.name                                            AS course_name,
        (SELECT COUNT(*)::int FROM materials
          WHERE course_id = c.id AND status = 'READY')   AS material_count,
        cm.created_at                                     AS last_chat
      FROM chat_messages cm
      JOIN courses c ON c.id = cm.course_id
      WHERE cm.user_id = $1 AND cm.role = 'user'
      ORDER BY cm.course_id, cm.created_at DESC
      LIMIT 5
    `, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/stats/recent-activity');
  }
});

module.exports = router;
