/**
 * 視光課程知識庫種子資料
 * 執行: node server/scripts/seed-knowledge.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { pool } = require('../db');
const { embedSingle } = require('../services/embeddingService');

const COURSE_NAME = 'AI與視光實作整合課程';

// ── 知識庫內容 ──────────────────────────────────────────────────────────────
const qaData = [

  // ── 第一章：台灣視光產業現況與核心能力 ──────────────────────────────
  {
    category: '視光產業現況',
    question: '台灣視光產業的市場規模與近年發展趨勢為何？',
    answer: `台灣視光產業年產值約 300–400 億元（含眼鏡零售、隱眼、儀器、手術），近視率居全球前列（學童近視率超 60%）。主要驅動因素：
1. 近視防控需求持續成長（OK 鏡、低濃度阿托品）
2. 高齡化帶動老花、白內障術後視力矯正需求
3. AI 智能驗光儀器普及，提升驗光精確度與效率
4. 電商與連鎖眼鏡行整合，品牌競爭加劇

挑戰：法規灰色地帶（視光師法尚未通過）、人才缺口、民眾驗光知識不足。`,
  },
  {
    category: '視光產業現況',
    question: '視光師與眼科醫師的執業範疇有何差異？',
    answer: `兩者分工如下：

眼科醫師（Ophthalmologist）
- 醫療行為：診斷眼疾、開立處方、手術（白內障、LASIK、青光眼）
- 法定資格：醫師執照 + 眼科專科

視光師（Optometrist）
- 驗光配鏡、視覺功能評估（調節、雙眼視覺）
- 初步篩查轉介（疑似青光眼、黃斑部病變）
- 台灣現況：視光師法草案仍待立法，目前以「驗光師」名稱於驗光師法規範

驗光生（Optician）
- 依處方配鏡、調整鏡架，不得獨立驗光

合作模式：眼科診所 + 驗光所合作，共同管理近視防控。`,
  },
  {
    category: '視光產業現況',
    question: '視光師需具備哪些核心能力？',
    answer: `視光師五大核心能力：

1. 臨床驗光技術
   - 主客觀驗光（電腦驗光 + 綜合驗光儀）
   - 雙眼視覺檢查（斜弱視評估）
   - 特殊鏡片適配（OK 鏡、硬式透氣隱眼）

2. 儀器操作與判讀
   - 裂隙燈、眼壓計、視野計、OCT 基本判讀
   - AI 智能驗光儀操作

3. 近視防控
   - 光學離焦原理、OK 鏡評估與追蹤
   - 低濃度阿托品治療衛教

4. 醫病溝通
   - 用淺顯語言解釋度數、散光、老花
   - 轉介時機判斷與說明

5. 數位工具應用
   - AI 輔助診斷工具（Lumenis、Carl Zeiss AI）
   - 電子病歷、遠距視光（Teleoptometry）`,
  },

  // ── 第二章：基礎度量衡與誤差分析 ────────────────────────────────────
  {
    category: '度量衡與誤差',
    question: '驗光中的系統誤差與隨機誤差有什麼差別？如何降低？',
    answer: `系統誤差（Systematic Error）
- 定義：每次量測均偏向同一方向的固定偏差
- 驗光例子：儀器未校正（如電腦驗光歸零偏移）、操作員習慣性過矯
- 降低方法：定期校正儀器、標準化操作程序（SOP）

隨機誤差（Random Error）
- 定義：每次量測結果隨機波動，無固定方向
- 驗光例子：受檢者調節波動、淚膜不穩定造成角膜曲率變化
- 降低方法：多次量測取平均、控制環境（暗室、穩定淚膜後再測）

精確度 vs 準確度：
- 精確度（Precision）= 重複性好（隨機誤差小）
- 準確度（Accuracy）= 接近真值（系統誤差小）`,
  },
  {
    category: '度量衡與誤差',
    question: '誤差傳播公式在驗光中如何應用？',
    answer: `誤差傳播（Error Propagation）基本規則：

若 Z = A + B，則 ΔZ = ΔA + ΔB（誤差相加）
若 Z = A × B，則 ΔZ/Z = ΔA/A + ΔB/B（相對誤差相加）

驗光應用範例：
- 光學十字法計算最終度數時，球面度 ΔS、柱面度 ΔC 的誤差會累積
- 角膜曲率測量 r（mm）轉換為 D（Diopter）：D = 337.5/r，若 r 有 ±0.05 mm 誤差，D 的誤差 ΔD ≈ 337.5 × Δr/r²

實務影響：
- OK 鏡設計以角膜曲率為基準，曲率誤差直接影響鏡片弧度設計
- 建議重複測量 ≥3 次，取平均以降低隨機誤差`,
  },
  {
    category: '度量衡與誤差',
    question: '視光量測中常見的統計分佈有哪些？臨床意義為何？',
    answer: `1. 常態分佈（Normal Distribution）
   - 應用：人群度數分佈、誤差分析
   - 意義：±1σ 涵蓋 68%，±2σ 涵蓋 95%（用於判斷個案是否為離群值）

2. t 分佈（Student's t-distribution）
   - 應用：小樣本（n<30）的平均數比較
   - 臨床：比較兩種驗光法的量測結果是否有顯著差異

3. 卡方分佈（Chi-square Distribution）
   - 應用：類別資料分析（如近視進展是否與配戴類型有關）

4. Bland-Altman 分析
   - 用於評估兩種量測方法的一致性（Agreement）
   - 重要指標：偏差（Bias）與 95% 一致性區間（Limits of Agreement）
   - 若區間超出臨床可接受範圍，兩法不可互換`,
  },

  // ── 第三章：AI 智能儀器 - OK 鏡 ─────────────────────────────────────
  {
    category: 'OK鏡與近視防控',
    question: '角膜塑型片（OK 鏡）的光學原理是什麼？',
    answer: `角膜塑型片（Orthokeratology Lens，OK 鏡）透過以下機制達到近視矯正與控制：

光學原理：
1. 中央壓平：反幾何設計的夜戴鏡片使角膜中央區上皮細胞重新分佈，中央曲率變平，近視度數降低
2. 周邊離焦（Peripheral Defocus）：矯正後角膜周邊形成相對近視性離焦，焦點落在視網膜前，抑制眼軸增長

近視控制效果：
- 臨床數據：可減緩眼軸增長約 40–60%（與單焦點眼鏡相比）
- 需每晚配戴 6–8 小時，效果持續約 12–16 小時

適應症：
- 近視度數 -0.50D 至 -6.00D（進階設計可至 -8.00D）
- 角膜曲率 40–46D
- 無乾眼症、角膜疾病`,
  },
  {
    category: 'OK鏡與近視防控',
    question: 'AI 數位配適在 OK 鏡評估中扮演什麼角色？',
    answer: `AI 數位配適（AI Digital Fitting）流程：

1. 角膜地形圖掃描
   - 儀器：Medmont E300、Pentacam、Orbscan
   - 採集：角膜曲率、離心率（e 值）、高度地圖

2. AI 演算法推薦
   - 輸入：角膜形態參數 + 近視度數 + 散光軸度
   - 輸出：初始鏡片弧度（BOZR）、直徑、治療區大小建議
   - 品牌例：Euclid Emerald、Paragon CRT 使用內建 AI 配適軟體

3. 螢光素評估（Fluorescein Pattern）
   - 理想圖型：中央輕觸、旁中央深弧染色（align curve），周邊適度排淚
   - AI 輔助：部分系統可自動識別配適圖型是否標準

4. 追蹤與調整
   - 1週、1月、3月定期回診
   - AI 比對地形圖變化，輔助決定是否更換參數

優勢：減少試戴次數、提高首次配適成功率（從 60% 提升至 80%+）`,
  },
  {
    category: 'OK鏡與近視防控',
    question: 'OK 鏡的臨床適合/不適合配戴標準為何？',
    answer: `適合配戴（Inclusion Criteria）：
✅ 年齡：6 歲以上（兒童需家長監護配合）
✅ 近視：-0.50D ~ -6.00D（高度數需特殊設計）
✅ 散光：≤ -2.50D（規則性散光）
✅ 角膜曲率：40–46D
✅ 角膜健康：無前節疾病、角膜厚度正常（>500μm）
✅ 淚液：TBUT ≥ 5 秒，Schirmer ≥ 5mm/5min
✅ 動機：願意遵守護理規範

不適合配戴（Exclusion Criteria）：
❌ 乾眼症（中重度）
❌ 角膜上皮細胞疾病、角膜疤痕
❌ 急性結膜炎、葡萄膜炎等活動性眼部感染
❌ 圓錐角膜（Keratoconus）
❌ 不規則散光（高度）
❌ 無法配合回診或衛教者

注意事項：
- 配戴期間不得游泳（角膜潰瘍風險）
- 需使用指定保存液、遵守清潔 SOP`,
  },

  // ── 第四章：AI 學習工具 ─────────────────────────────────────────────
  {
    category: 'AI學習工具',
    question: 'Perplexity AI 在視光學習與研究中如何使用？',
    answer: `Perplexity AI 是以搜尋為核心的 AI 問答工具，特色：

視光應用：
1. 快速文獻查詢
   - 輸入：「近視防控最新 RCT 2023-2024」
   - 輸出：附來源引用的摘要（含 PubMed、JAMA Ophthalmology 連結）

2. 臨床問題即時解答
   - 「OK 鏡角膜地形圖 smile pattern 意義」→ 附參考資料的解釋

3. 比較不同研究結論
   - 可追問「這個結論與 COMET 研究有何不同？」

使用技巧：
- 選擇「Academic」模式以優先顯示學術來源
- 使用 Pro Search 深入分析長篇問題
- 引用來源可直接點擊核實，培養 critical appraisal 能力

限制：
- 中文文獻覆蓋率較低，建議用英文查詢專業問題
- 仍需自行判斷資訊品質（非所有來源為高等級證據）`,
  },
  {
    category: 'AI學習工具',
    question: 'Notion AI 如何協助視光學習筆記與知識管理？',
    answer: `Notion AI 整合於 Notion 筆記系統，視光學習應用：

1. 筆記自動整理
   - 上課錄音轉文字後，AI 自動生成重點摘要
   - 將散亂筆記整理為「問題→原理→臨床應用」結構

2. 知識庫建立
   - 建立「近視防控知識庫」：每個條目含定義、機制、臨床要點
   - AI 可跨頁面搜尋並回答「OK 鏡和低濃度阿托品哪個效果更好？」

3. 學習計劃生成
   - 輸入考試日期，AI 自動生成複習時間表

4. 考題模擬
   - 選取一段筆記 → Ask AI：「根據這段內容出5題選擇題」

實用範例：
- 建立「國考重點摘要」資料庫，每章節以 AI 自動生成重點表格
- 搭配 Notion Calendar 安排臨床見習反思日誌`,
  },
  {
    category: 'AI學習工具',
    question: 'Napkin AI 和 Connected Papers 各有什麼用途？',
    answer: `Napkin AI（視覺化工具）：
- 功能：將文字筆記自動轉換為圖表、流程圖、概念圖
- 視光應用：
  • 輸入「OK 鏡配適流程」→ 自動生成流程圖
  • 將複雜的雙眼視覺評估步驟視覺化，方便記憶
  • 製作病患衛教圖片（將文字說明轉為圖解）
- 優點：無需設計技能，節省製作示意圖時間

Connected Papers（文獻關聯分析）：
- 功能：以視覺化方式呈現一篇論文與相關文獻的連結關係
- 視光應用：
  • 輸入一篇 OK 鏡 RCT → 找到所有引用它或被它引用的重要文獻
  • 快速了解一個研究領域的發展脈絡
  • 撰寫報告/論文前的文獻回顧
- 使用方法：至 connectedpapers.com 輸入 DOI 或標題`,
  },
  {
    category: 'AI學習工具',
    question: 'DeepL 在視光專業學習中如何應用？與 Google 翻譯有何不同？',
    answer: `DeepL 優勢：
- 學術與專業文本翻譯品質高於 Google 翻譯
- 能保留句子語意和醫學術語精確度
- 支援整份 PDF/Word 文件翻譯（保留格式）

視光學習應用：
1. 英文文獻快速理解
   - 上傳 PubMed PDF → 獲得高品質中文翻譯
   - 方法：閱讀翻譯版理解大意，再對照原文確認關鍵術語

2. 專業術語確認
   - DeepL 通常能正確翻譯：myopia control、orthokeratology、peripheral defocus
   - 避免 Google 翻譯將 accommodation 誤譯為「住宿」

3. 產出英文報告
   - 先用中文草稿 → DeepL 翻譯 → 人工微調術語

vs Google 翻譯：
- DeepL：自然語感、保留語境、適合長篇專業文本
- Google 翻譯：速度快、支援更多語言、適合短句即時翻譯
- 建議：兩者互補使用`,
  },

  // ── 第五章：創新服務模式 ────────────────────────────────────────────
  {
    category: '醫病溝通與服務',
    question: '視光師如何向患者有效溝通度數與視力問題？',
    answer: `有效醫病溝通原則（視光情境）：

1. 避免術語，使用生活比喻
   - ❌「您有 -3.00D 近視合併 -1.50D 順規散光」
   - ✅「您的眼睛看遠模糊，就像相機鏡頭沒對焦；散光讓影像有點扭曲，像哈哈鏡」

2. 重要訊息「三件事原則」
   - 每次回診只強調三個最重要的重點
   - 例：①度數增加了25度 ②OK鏡效果良好 ③下次帶家長來討論長期計畫

3. 確認理解（Teach-back Method）
   - 「可以請您用自己的話說說今天我們討論了什麼？」
   - 避免只問「聽懂了嗎？」（患者通常說有）

4. AI 輔助溝通工具
   - 使用 AR 模擬器讓患者看到配戴效果（如本系統）
   - 角膜地形圖 AI 報告自動生成中文解釋

5. 常見 FAQ 標準回答
   - 「OK鏡安全嗎？」→「長期研究（15年以上）顯示，正確護理下感染率與日拋隱眼相當，約每萬人1.5例」
   - 「近視會好嗎？」→「現有方法是控制不是治癒，18歲後度數穩定再考慮雷射」`,
  },
  {
    category: '醫病溝通與服務',
    question: '如何建立 AI 輔助視光服務的 SOP？',
    answer: `AI 整合視光服務 SOP（標準作業程序）：

階段一：預約與初診
- AI 預問卷（症狀、用眼習慣、配戴史）→ 自動生成初診摘要
- 工具：Line 官方帳號 + AI 表單

階段二：儀器量測
- 電腦驗光 → AI 異常標記（過高散光、不規則角膜提示轉介）
- 角膜地形圖 → AI 自動分型（WTR/ATR/Oblique）

階段三：主觀驗光
- 綜合驗光儀 + 雙眼平衡
- AI 建議初始度數（參考客觀驗光與歷史資料）

階段四：處方與衛教
- AI 生成個人化衛教單（根據近視度數、年齡、生活習慣）
- AR 模擬系統讓患者試戴不同鏡框/隱眼

階段五：追蹤管理
- AI 排程提醒（OK鏡回診、眼底檢查）
- 眼軸成長曲線自動比對（與同齡標準差比較）

效益：
- 減少人工作業 30–40%
- 提升患者依從性（準時回診率提升）`,
  },

  // ── 第六章：國考重點 ────────────────────────────────────────────────
  {
    category: '國考重點',
    question: '驗光師國考中，雙眼視覺功能評估的核心考點有哪些？',
    answer: `雙眼視覺國考核心考點：

1. Worth 四點燈（Worth 4-Dot Test）
   - 目的：檢查抑制（Suppression）與複視
   - 正常：4個燈（2紅+2綠）
   - 抑制右眼：只看到2個綠燈
   - 抑制左眼：只看到3個紅燈
   - 複視：看到5個燈

2. 稜鏡遮蓋試驗（Prism Cover Test）
   - 交替遮蓋：測量隱斜量（Phoria）
   - 單眼遮蓋：確認顯斜（Tropia）
   - 用稜鏡中和：量化偏斜量（△）

3. 調節（Accommodation）
   - 調節幅度（AA）= 近點距離的倒數（Diopter）
   - Hofstetter 公式：最小 AA = 15 - 0.25×年齡
   - 調節不足（Accommodative Insufficiency）：AA < 最小值，症狀：看近模糊、頭痛

4. 聚散（Vergence）
   - 正融像聚散（PFV）、負融像聚散（NFV）
   - 聚散不足（Convergence Insufficiency）：近點輻輳（NPC）退縮至 >10cm
   - 治療：Vision Therapy、稜鏡

5. AC/A 比值
   - 計算法：Gradient Method（加 -1.00D 透鏡前後斜位差）
   - 正常：4–6△/D
   - 高 AC/A：調節性內斜，低 AC/A：輻輳不足`,
  },
  {
    category: '國考重點',
    question: '隱形眼鏡相關的國考必考知識點有哪些？',
    answer: `隱形眼鏡國考必考重點：

1. 參數判讀
   - BC（Base Curve）：基弧，越大越平坦
   - DIA（Diameter）：鏡片直徑
   - Dk：氧氣滲透係數；Dk/t：氧氣傳導率（t=中心厚度）
   - 建議 Dk/t：日戴 ≥24、夜戴 ≥87（EOP 標準）

2. 配適評估（Soft Lens）
   - 理想：0.5–1mm 移動量，完整覆蓋角膜
   - 太緊（Tight Fit）：移動 <0.5mm，角膜染色3、9點
   - 太鬆（Loose Fit）：移動 >2mm，視力不穩

3. RGP（硬式透氣鏡）配適
   - 螢光素圖型判讀：
     • On K：平行配適（輕觸中央）
     • Steep：中央積液（dark central）
     • Flat：中央接觸（touch pattern）

4. 隱眼併發症
   - 角膜新生血管：長期缺氧，需換高 Dk/t 鏡片
   - SEAL（上緣角膜弓狀損傷）：上方角膜染色，換薄鏡片
   - GPC（巨乳頭結膜炎）：換日拋、或停戴

5. 驗光師法規重點
   - 15歲以下需有醫師診斷書才能配戴隱眼（OK鏡另有規定）
   - 延伸配戴需特別告知風險`,
  },
  {
    category: '國考重點',
    question: '散光的光學原理與臨床處理方式為何？',
    answer: `散光（Astigmatism）核心知識：

光學原理：
- 眼球不同子午線有不同屈光力 → 無法形成單一焦點，形成 Conoid of Sturm（史特姆錐）
- 最小彌散圓（Circle of Least Diffusion）位於兩焦線中間

分類：
1. 依軸向
   - 順規散光（WTR）：強主子午線在 90°±20°（最常見）
   - 逆規散光（ATR）：強主子午線在 180°±20°
   - 斜軸散光：30–60°或120–150°

2. 依屈光型
   - 複性近視散光（Compound Myopic）：兩主子午線均為近視
   - 混合散光（Mixed）：一主子午線近視、一主子午線遠視

處方原則：
- 使用負柱面形式（負柱面標準）或正柱面形式需互換
- 最終處方選最舒適視力的最少散光量（不一定全矯正）
- 老年患者逐漸適應的 ATR 散光，可部分矯正

隱眼散光處理：
- 環曲面軟式隱眼（Toric）：有穩定機制（稜鏡壓邊、動態穩定）
- 散光 ≤-0.75D：球面等效（Spherical Equivalent）即可
- 散光 ≥-1.00D：建議使用環曲面隱眼`,
  },
  {
    category: '國考重點',
    question: '老花眼的發生機制與矯正選項為何？',
    answer: `老花眼（Presbyopia）：

發生機制：
- 水晶體核硬化（Sclerosis）+ 睫狀肌功能下降
- 調節幅度隨年齡下降（約每10年減少3D）
- 40歲起出現症狀（看近需移遠），45歲普遍需矯正

症狀：
- 閱讀距離增加、閱讀後頭痛眼疲、暗光下看近更困難

老花加入度（Addition，ADD）決定：
- 計算：所需調節力 – 可用調節幅度（保留1/2–1/3調節幅度）
- 閱讀距離 33cm 需 +3.00D 調節，若可用 AA = 1.50D，則 ADD = 3.00 – 0.75 = +2.25D
- 範圍：+0.75D（早期）至 +3.50D（完全老花）

矯正選項：
1. 單焦點老花眼鏡：只矯正近距，需脫戴
2. 雙焦點鏡片（Bifocal）：上遠下近，有「跳影」問題
3. 漸進多焦點（Progressive Addition Lens, PAL）：無像跳，需適應期（1–4週）
4. 老花隱眼：單眼視（Monovision）或多焦點隱眼
5. 手術：老花雷射（PresbyLASIK）、多焦點人工水晶體`,
  },
  {
    category: '國考重點',
    question: '青光眼的篩查在視光實務中有什麼重要性？視光師如何判斷轉介時機？',
    answer: `青光眼視光篩查重點：

視光師的角色（非診斷，為篩查轉介）：
1. 眼壓量測
   - 非接觸眼壓（NCT）：篩查用，>21mmHg 提高警覺
   - 接觸式（Goldmann）：由眼科確認
   - 注意：正常眼壓型青光眼（NTG）眼壓正常也可能發病

2. 眼底鏡觀察（儀器輔助）
   - 視神經盤（Optic Disc）評估：
     • C/D ratio（杯碟比）>0.6 須轉介
     • C/D ratio 左右差 >0.2 須轉介
     • 神經纖維層缺損（RNFL defect）

3. 視野計（Humphrey VF）
   - 青光眼典型視野缺損：鼻側階梯（Nasal Step）、弓形暗點（Arcuate Scotoma）
   - MD（Mean Deviation）< -6dB 提示中度缺損

轉介指標（轉介眼科）：
✅ 眼壓 >21mmHg（重複量測確認）
✅ C/D ratio >0.6 或左右不對稱 >0.2
✅ 視野異常（可疑青光眼型缺損）
✅ 有青光眼家族史 + 高眼壓
✅ 患者自述視力周邊缺失

記錄要點：轉介時需附量測數值、眼底照片或 OCT 報告`,
  },

];

// ── 主程式 ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 開始植入知識庫種子資料...\n');

  // 1. 確保課程存在
  let courseId;
  const existing = await pool.query(
    `SELECT id FROM courses WHERE name = $1 LIMIT 1`,
    [COURSE_NAME]
  );
  if (existing.rows.length > 0) {
    courseId = existing.rows[0].id;
    console.log(`✅ 課程已存在: ${COURSE_NAME} (${courseId})`);
  } else {
    const ins = await pool.query(
      `INSERT INTO courses (name, description)
       VALUES ($1, $2) RETURNING id`,
      [COURSE_NAME, 'AI 視光整合課程知識庫，含視光產業、度量衡、OK鏡、AI工具、醫病溝通、國考重點']
    );
    courseId = ins.rows[0].id;
    console.log(`✅ 建立課程: ${COURSE_NAME} (${courseId})`);
  }

  // 2. 取得 admin user id
  const adminUser = await pool.query(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  );
  const createdBy = adminUser.rows[0]?.id ?? null;

  // 3. 插入 Q&A
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < qaData.length; i++) {
    const { category, question, answer } = qaData[i];
    process.stdout.write(`  [${i + 1}/${qaData.length}] ${question.slice(0, 40)}... `);

    // 檢查是否已存在（避免重複植入）
    const dup = await pool.query(
      `SELECT id FROM knowledge_qa WHERE question = $1 AND is_active = TRUE LIMIT 1`,
      [question]
    );
    if (dup.rows.length > 0) {
      console.log('(已存在，跳過)');
      skipped++;
      continue;
    }

    try {
      const embedding = await embedSingle(question);
      const embStr = `[${embedding.join(',')}]`;
      await pool.query(
        `INSERT INTO knowledge_qa (course_id, category, question, answer, embedding, created_by)
         VALUES ($1, $2, $3, $4, $5::vector, $6)`,
        [courseId, category, question, answer, embStr, createdBy]
      );
      console.log('✅');
      inserted++;

      // 短暫暫停避免 rate limit
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.log(`❌ 失敗: ${err.message}`);
    }
  }

  console.log(`\n🎉 完成！插入 ${inserted} 筆，跳過 ${skipped} 筆（已存在）`);
  await pool.end();
}

main().catch(err => {
  console.error('❌ 種子資料植入失敗:', err);
  process.exit(1);
});
