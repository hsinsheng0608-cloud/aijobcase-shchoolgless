/**
 * Knowledge Q&A API - 純文字比對，不使用 AI/embedding
 * GET    /api/knowledge?course_id=xxx  - list
 * POST   /api/knowledge                - create
 * PUT    /api/knowledge/:id            - update
 * DELETE /api/knowledge/:id            - soft delete
 * POST   /api/knowledge/search         - keyword search
 */
const express = require('express');
const { pool } = require('../db');
const safeError = require('../safeError');

const router = express.Router();

// ── List ────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { course_id, category } = req.query;
    const conditions = ['is_active = TRUE'];
    const params = [];

    if (course_id) { params.push(course_id); conditions.push(`course_id = $${params.length}`); }
    if (category)  { params.push(category);  conditions.push(`category  = $${params.length}`); }

    // 沒有指定課程時去重（同一題跨課程只取一筆）
    const query = course_id
      ? `SELECT id, course_id, category, question, answer, created_at, updated_at
         FROM knowledge_qa
         WHERE ${conditions.join(' AND ')}
         ORDER BY category, created_at DESC`
      : `SELECT DISTINCT ON (lower(trim(question))) id, course_id, category, question, answer, created_at, updated_at
         FROM knowledge_qa
         WHERE ${conditions.join(' AND ')}
         ORDER BY lower(trim(question)), created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/knowledge');
  }
});

// ── Create ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { role } = req.user;
  if (!['teacher', 'admin'].includes(role)) {
    return res.status(403).json({ success: false, error: '權限不足' });
  }
  try {
    const { course_id, category = '一般', question, answer } = req.body;
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ success: false, error: '問題與答案不能為空' });
    }
    const { rows } = await pool.query(
      `INSERT INTO knowledge_qa (course_id, category, question, answer, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, course_id, category, question, answer, created_at`,
      [course_id || null, category, question.trim(), answer.trim(), req.user.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'POST /api/knowledge');
  }
});

// ── Search（pg_trgm word_similarity，無需 AI）────────────────────────────
router.post('/search', async (req, res) => {
  try {
    const { query, course_id, top_k = 3 } = req.body;
    if (!query?.trim()) {
      return res.status(400).json({ success: false, error: '請提供查詢內容' });
    }
    const q = query.trim();

    const params = [q];
    const baseWhere = ['k.is_active = TRUE'];
    if (course_id) { params.push(course_id); baseWhere.push(`k.course_id = $${params.length}`); }
    params.push(top_k);

    // word_similarity: 問題命中 weight=3，答案命中 weight=1
    const scoreExpr = `(word_similarity($1, k.question) * 3 + word_similarity($1, k.answer))`;

    const { rows } = await pool.query(
      `SELECT k.id, k.category, k.question, k.answer, ${scoreExpr} AS score
       FROM knowledge_qa k
       WHERE ${baseWhere.join(' AND ')}
         AND (word_similarity($1, k.question) > 0.05 OR word_similarity($1, k.answer) > 0.05
              OR k.question ILIKE '%' || $1 || '%' OR k.answer ILIKE '%' || $1 || '%')
       ORDER BY ${scoreExpr} DESC, k.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const results = rows.map(r => ({
      ...r,
      // 最高 score ≈ 4（question=1 * 3 + answer=1），正規化到 0~1
      similarity: Math.min(1, Number(r.score) / 4),
    }));

    res.json({ success: true, data: results });
  } catch (err) {
    safeError(res, err, 'POST /api/knowledge/search');
  }
});

// ── Update ──────────────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { role } = req.user;
  if (!['teacher', 'admin'].includes(role)) {
    return res.status(403).json({ success: false, error: '權限不足' });
  }
  try {
    const { course_id, category, question, answer } = req.body;
    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ success: false, error: '問題與答案不能為空' });
    }
    const { rows } = await pool.query(
      `UPDATE knowledge_qa
       SET course_id = $1, category = $2, question = $3, answer = $4, updated_at = NOW()
       WHERE id = $5 AND is_active = TRUE
       RETURNING id, category, question, answer, updated_at`,
      [course_id || null, category || '一般', question.trim(), answer.trim(), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: '找不到該筆資料' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'PUT /api/knowledge/:id');
  }
});

// ── Delete (soft) ────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { role } = req.user;
  if (!['teacher', 'admin'].includes(role)) {
    return res.status(403).json({ success: false, error: '權限不足' });
  }
  try {
    await pool.query(`UPDATE knowledge_qa SET is_active = FALSE WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    safeError(res, err, 'DELETE /api/knowledge/:id');
  }
});

module.exports = router;
