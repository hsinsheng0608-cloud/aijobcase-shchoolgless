require('dotenv').config({ path: __dirname + '/../.env' });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const COURSE_NAME = 'AI創新課程';
const COURSE_DESC = 'AI創新課程：結合AI工具與視光實作，涵蓋AI擬真訓練系統、眼鏡製作、鏡框調整、視光檢查診斷、眼睛疾病篩檢等實務訓練';

// 與「AI創新課程」相關的分類（對應課表單元）
const RELEVANT_CATEGORIES = [
  '眼鏡製作',
  '鏡框調整',
  '儀器操作',
  '裂隙燈操作',
  '眼睛疾病',
  '眼鏡保養',
  'AI學習工具',
  '醫病溝通與服務',
];

async function main() {
  try {
    // 1. 建立課程
    const existing = await pool.query(
      `SELECT id FROM courses WHERE name = $1 LIMIT 1`, [COURSE_NAME]
    );
    let courseId;
    if (existing.rows.length > 0) {
      courseId = existing.rows[0].id;
      console.log(`✅ 課程已存在: ${COURSE_NAME} (${courseId})`);
    } else {
      const ins = await pool.query(
        `INSERT INTO courses (name, description) VALUES ($1, $2) RETURNING id`,
        [COURSE_NAME, COURSE_DESC]
      );
      courseId = ins.rows[0].id;
      console.log(`✅ 建立課程: ${COURSE_NAME} (${courseId})`);
    }

    // 2. 找出相關分類的現有 Q&A（從另一門課複製，course_id 設為新課程）
    const { rows: existing_qa } = await pool.query(
      `SELECT category, question, answer FROM knowledge_qa
       WHERE is_active = TRUE
         AND category = ANY($1::text[])
       ORDER BY category, created_at`,
      [RELEVANT_CATEGORIES]
    );
    console.log(`\n找到 ${existing_qa.length} 筆相關問答可複製`);

    let inserted = 0, skipped = 0;
    for (const qa of existing_qa) {
      // 檢查是否已有同課程同問題
      const dup = await pool.query(
        `SELECT id FROM knowledge_qa WHERE course_id = $1 AND question = $2 LIMIT 1`,
        [courseId, qa.question]
      );
      if (dup.rows.length > 0) { skipped++; continue; }

      await pool.query(
        `INSERT INTO knowledge_qa (course_id, category, question, answer, created_by)
         VALUES ($1, $2, $3, $4, (SELECT id FROM users WHERE role='admin' LIMIT 1))`,
        [courseId, qa.category, qa.question, qa.answer]
      );
      inserted++;
    }

    console.log(`\n🎉 完成！插入 ${inserted} 筆，跳過 ${skipped} 筆`);

    // 3. 查詢各分類數量
    const { rows: summary } = await pool.query(
      `SELECT category, COUNT(*) as count FROM knowledge_qa
       WHERE course_id = $1 AND is_active = TRUE
       GROUP BY category ORDER BY category`,
      [courseId]
    );
    console.log('\n📊 AI創新課程問答統計:');
    summary.forEach(r => console.log(`  ${r.category}: ${r.count} 筆`));

  } finally {
    pool.end();
  }
}

main().catch(console.error);
