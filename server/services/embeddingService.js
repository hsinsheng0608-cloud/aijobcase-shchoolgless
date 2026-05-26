/**
 * 向量化服務 - 使用 Gemini text-embedding-004
 */
// 本地開發時若有 VPN/Proxy 造成 TLS 憑證錯誤，略過驗證
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { GoogleGenAI } = require('@google/genai');
const { geminiLimit } = require('./geminiLimiter');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY 未設定，embedding 功能將無法使用');
}

const genAI = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMS = 768;
const BATCH_SIZE = 50;

/**
 * 單一文字向量化
 */
async function embedSingle(text) {
  if (!genAI) throw new Error('Gemini API 未設定');

  return geminiLimit(async () => {
    const result = await genAI.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: EMBEDDING_DIMS },
    });
    const emb = result.embedding?.values
      ?? result.embeddings?.[0]?.values
      ?? result.embeddings?.[0];
    if (!emb) throw new Error('Embedding response missing values');
    return emb;
  });
}

/**
 * 批次向量化
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
async function embedBatch(texts) {
  if (!genAI) throw new Error('Gemini API 未設定');

  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(text => embedSingle(text))
    );
    results.push(...batchResults);

    // 批次間暫停避免 rate limit
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
}

module.exports = { embedSingle, embedBatch, EMBEDDING_DIMS };
