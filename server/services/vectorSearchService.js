/**
 * 向量搜尋服務 - JS 端 cosine similarity
 * （Zeabur 託管 PostgreSQL 無 pgvector，embedding 以 text 儲存 JSON 陣列，
 *   在 Node.js 計算餘弦相似度。資料量小，效能無虞。）
 */
const { pool } = require('../db');
const { embedSingle } = require('./embeddingService');

/** 解析 text 形式的 embedding（"[0.1,0.2,...]"）為 number[] */
function parseEmbedding(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/** 餘弦相似度 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 語意搜尋相關教材片段
 * @param {string} query - 用戶問題
 * @param {string} courseId - 課程 ID
 * @param {number} topK - 回傳數量
 * @param {number} threshold - 最低相似度
 */
async function search(query, courseId, topK = 5, threshold = 0.3) {
  // 1. 將問題向量化
  const queryEmbedding = await embedSingle(query);

  // 2. 撈出該課程所有 READY 教材的 chunks（embedding 為 text）
  const { rows } = await pool.query(
    `SELECT dc.id, dc.content, dc.metadata, dc.embedding
     FROM document_chunks dc
     JOIN materials m ON dc.material_id = m.id
     WHERE m.course_id = $1 AND m.status = 'READY'`,
    [courseId]
  );

  // 3. JS 端計算餘弦相似度，排序取 topK
  const scored = rows
    .map(r => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata,
      similarity: cosineSimilarity(queryEmbedding, parseEmbedding(r.embedding)),
    }))
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return scored;
}

module.exports = { search };
