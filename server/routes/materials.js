/**
 * 教材管理路由 - 上傳、解析、向量化
 */
const express = require('express');
const { pool } = require('../db');
const { requireRole } = require('../middleware/authMiddleware');
const safeError = require('../safeError');
const { parseFile } = require('../services/fileParserService');
const { chunkText } = require('../services/chunkingService');
const { embedBatch } = require('../services/embeddingService');

const router = express.Router();

/**
 * POST /api/materials/upload
 * 上傳教材檔案（老師/Admin）
 */
router.post('/upload', requireRole('ADMIN', 'TEACHER'), (req, res) => {
  const upload = req.app.locals.upload;
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: '請上傳檔案' });
    }

    try {
      const { courseId, title } = req.body;
      if (!courseId) {
        return res.status(400).json({ success: false, error: '請指定課程 ID' });
      }

      const materialTitle = title || req.file.originalname;
      const ext = req.file.originalname.split('.').pop().toUpperCase();
      const fileType = ['PDF', 'DOCX', 'PPTX', 'XLSX'].includes(ext) ? ext : 'PDF';

      // 建立教材記錄
      const { rows } = await pool.query(
        `INSERT INTO materials (course_id, title, type, original_filename, status)
         VALUES ($1, $2, $3, $4, 'PROCESSING') RETURNING id`,
        [courseId, materialTitle, fileType, req.file.originalname]
      );
      const materialId = rows[0].id;

      // 回傳 202 立即響應，背景處理
      res.status(202).json({
        success: true,
        data: { materialId, status: 'PROCESSING', message: '上傳成功，正在建立 AI 索引' },
      });

      // 背景處理：解析 → 切片 → 向量化
      processUpload(materialId, req.file.buffer, req.file.mimetype, req.file.originalname, courseId)
        .catch(err => console.error(`❌ 教材處理失敗 ${materialId}:`, err.message));

    } catch (err) {
      safeError(res, err, 'POST /api/materials/upload');
    }
  });
});

/**
 * 背景處理：解析 → 切片 → embedding → 存 pgvector
 */
async function processUpload(materialId, buffer, mimetype, filename, courseId) {
  try {
    console.log(`📄 開始處理教材 ${materialId}: ${filename}`);

    // Step 1: 提取文字
    const parsed = await parseFile(buffer, mimetype, filename);
    console.log(`  ✅ 文字提取完成 (${parsed.text.length} 字元)`);

    if (!parsed.text || parsed.text.trim().length < 10) {
      throw new Error('教材內容太少，無法建立索引');
    }

    // Step 2: 切片
    const chunks = chunkText(parsed.text, { materialId, filename });
    console.log(`  ✅ 切片完成 (${chunks.length} chunks)`);

    if (chunks.length === 0) {
      throw new Error('切片結果為空');
    }

    // Step 3: 批次向量化
    const texts = chunks.map(c => c.content);
    const embeddings = await embedBatch(texts);
    console.log(`  ✅ 向量化完成 (${embeddings.length} embeddings)`);

    // Step 4: 存入 document_chunks（embedding 以 text 儲存 JSON 陣列，無 pgvector 依賴）
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(',')}]`;
      await pool.query(
        `INSERT INTO document_chunks (material_id, content, metadata, embedding)
         VALUES ($1, $2, $3, $4)`,
        [materialId, chunks[i].content, JSON.stringify(chunks[i].metadata), embeddingStr]
      );
    }

    // Step 5: 更新狀態
    await pool.query(
      `UPDATE materials SET status = 'READY', chunk_count = $1 WHERE id = $2`,
      [chunks.length, materialId]
    );
    console.log(`  ✅ 教材 ${materialId} 處理完成`);

  } catch (err) {
    console.error(`  ❌ 教材 ${materialId} 處理失敗:`, err.message);
    await pool.query(
      `UPDATE materials SET status = 'FAILED', error_message = $1 WHERE id = $2`,
      [err.message, materialId]
    );
  }
}

/**
 * GET /api/materials?courseId=xxx
 */
router.get('/', async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ success: false, error: '請指定 courseId' });

    const { rows } = await pool.query(
      `SELECT id, course_id, title, type, status, original_filename, chunk_count, error_message, created_at
       FROM materials WHERE course_id = $1 ORDER BY created_at DESC`,
      [courseId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    safeError(res, err, 'GET /api/materials');
  }
});

/**
 * GET /api/materials/:id/status
 */
router.get('/:id/status', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, status, chunk_count, error_message FROM materials WHERE id = $1',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: '教材不存在' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'GET /api/materials/:id/status');
  }
});

/**
 * PATCH /api/materials/:id/move — 移動教材到指定課程
 */
router.patch('/:id/move', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const { toCourseId } = req.body;
    if (!toCourseId) return res.status(400).json({ success: false, error: '請指定目標課程 toCourseId' });
    const { rowCount, rows } = await pool.query(
      'UPDATE materials SET course_id = $1 WHERE id = $2 RETURNING id, title, course_id',
      [toCourseId, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, error: '教材不存在' });
    // 同步更新 document_chunks 的 metadata
    await pool.query(
      `UPDATE document_chunks SET metadata = jsonb_set(metadata, '{course_id}', to_jsonb($1::text))
       WHERE material_id = $2`,
      [toCourseId, req.params.id]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    safeError(res, err, 'PATCH /api/materials/:id/move');
  }
});

/**
 * DELETE /api/materials/:id
 */
router.delete('/:id', requireRole('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM materials WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ success: false, error: '教材不存在' });
    res.json({ success: true, data: { message: '教材已刪除' } });
  } catch (err) {
    safeError(res, err, 'DELETE /api/materials/:id');
  }
});

module.exports = router;
