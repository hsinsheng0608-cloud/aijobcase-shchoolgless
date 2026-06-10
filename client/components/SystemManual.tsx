import React, { useState } from 'react';
import { IconBook, IconUser, IconInfo } from './Icons';
import { UserRole } from '../types';

type Tab = 'teacher' | 'student' | 'admin';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-base font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">{title}</h3>
    <div className="space-y-2 text-sm text-slate-700 leading-relaxed">{children}</div>
  </div>
);

const Step: React.FC<{ n: number; text: string; sub?: string }> = ({ n, text, sub }) => (
  <div className="flex gap-3">
    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
    <div>
      <p className="font-medium">{text}</p>
      {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
    </div>
  </div>
);

const Note: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg p-3">
    <IconInfo className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
    <p className="text-xs text-amber-800">{children}</p>
  </div>
);

const TeacherManual: React.FC = () => (
  <div>
    <Section title="一、登入與工作台">
      <Step n={1} text="開啟系統網址，輸入教師帳號與密碼後點選「登入」。" />
      <Step n={2} text="登入後進入「數據儀表板」。" sub="顯示教材數量、修課人數、學生發問次數等即時數據。" />
    </Section>

    <Section title="二、課程與教材管理（AI 知識庫）">
      <Step n={1} text="點選左側「我的課程」查看課程清單。" />
      <Step n={2} text="點選「教材管理」上傳 PDF / DOCX / PPTX / XLSX 教材。" sub="系統自動解析 → 切片 → 向量化，建立可供 AI 檢索的知識庫（RAG）。" />
      <Step n={3} text="教材狀態顯示「READY（N chunks）」即表示建立索引完成。" />
      <Note>同一課程可上傳多份教材；學生在 AR 頁的「AI 助教」提問時，AI 會跨教材搜尋最相關段落並引用回答。</Note>
      <Step n={4} text="捷徑：在「我的課程 → 建立新課程」時可直接附上教材檔，系統會自動建索引並從教材生成課後問答，一步到位。" />
    </Section>

    <Section title="三、問答管理（課後複習題庫）">
      <Step n={1} text="點選「問答管理」，可新增、編輯、刪除問答（問題＋答案＋分類）。" />
      <Step n={2} text="這些問答會出現在學生的「課後複習」頁，供學生用關鍵字搜尋瀏覽。" />
      <Step n={3} text="同一批問答也會成為「測驗系統」的出題來源。" />
      <Note>「課後複習」是純題庫閱覽（老師建立或 AI 從教材生成的問答）；想自由問 AI 請用 AR 頁右側的「AI 助教」。</Note>
    </Section>

    <Section title="四、測驗系統">
      <Step n={1} text="測驗題目來自「問答管理」建立的問答題庫，依分類自動組卷。" />
      <Step n={2} text="學生於「測驗系統」選擇分類與題數作答，系統即時批改並記分。" />
    </Section>

    <Section title="五、學習狀況（學生監測）">
      <Step n={1} text="點選「學習狀況」，每位學生一列：最後活動、AI 提問數、測驗次數與正確率、AR 練習完成數。" />
      <Step n={2} text="系統自動標示 🔴 7 天未活動 / 🟡 測驗低分 / 🟢 正常，方便找出需要關心的學生。" />
      <Step n={3} text="點任一學生列可展開明細：最近提問、測驗逐題對錯、AR 練習紀錄。" />
    </Section>

    <Section title="六、眼鏡素材管理">
      <Step n={1} text="點選「眼鏡素材管理」，新增眼鏡框或隱形眼鏡品項。" />
      <Step n={2} text="填寫名稱、類型、框型、適合臉型等屬性後上傳圖片（PNG/JPG，最大 5MB）。" />
      <Step n={3} text="品項上架後，學生在「臉型眼鏡推薦」與 AR 試戴頁即可選用。" />
      <Note>建議使用去背、白底的正面商品圖，AR 疊戴效果最佳。</Note>
    </Section>

    <Section title="七、用戶管理">
      <Step n={1} text="點選「用戶管理」，查看學生帳號與每日用量。" />
      <Step n={2} text="可用 Excel 批次匯入帳號，或個別新增帳號。" />
    </Section>
  </div>
);

const StudentManual: React.FC = () => (
  <div>
    <Section title="一、登入系統">
      <Step n={1} text="開啟系統網址，輸入學號與密碼後點選「登入」。" sub="預設密碼請向授課教師索取。" />
      <Step n={2} text="登入後進入「數據儀表板」首頁，從左側選單進入各功能。" />
    </Section>

    <Section title="二、課後複習（題庫閱覽）">
      <Step n={1} text="點選「課後複習」，選擇課程後在搜尋框輸入關鍵字（例如：OK鏡、散光）。" />
      <Step n={2} text="點選問題即可展開詳解，最上方💡會顯示重點摘要。" />
      <Step n={3} text="答案預設顯示前 3 行，點「展開全文」可看完整內容。" />
      <Note>題庫找不到答案時，可到 AR 模擬練習的「AI 助教」自由提問。</Note>
    </Section>

    <Section title="三、AR 模擬試戴（視光數據自動顯示）">
      <Step n={1} text="點選左側「AR 模擬練習」，開啟頁面後允許瀏覽器存取攝影機。" />
      <Step n={2} text="上方切換「眼鏡 / 隱形眼鏡」模式並選擇款式，下方滑桿可調整大小。" />
      <Step n={3} text="戴上後左下「視光量測數據」會自動即時顯示，無需額外操作。" sub="眼鏡模式：瞳距 PD、建議鏡框寬等；隱形眼鏡模式：虹膜直徑 HVID、建議鏡片直徑。" />
      <Step n={4} text="右側「AI 助教」可打字或點麥克風語音（最長 30 秒）即時提問配鏡問題。" />
      <Note>手機使用者：點畫面左下「📋」展開款式/教學面板，右下「💬」展開 AI 助教。</Note>
    </Section>

    <Section title="四、臉型眼鏡推薦">
      <Step n={1} text="點選「臉型眼鏡推薦」，選擇自己的臉型。" />
      <Step n={2} text="系統依臉型特徵推薦最適合的眼鏡框與隱形眼鏡，並說明推薦原因。" />
      <Step n={3} text="點選品項後回到 AR 頁面即可預覽試戴效果。" />
    </Section>

    <Section title="五、測驗系統">
      <Step n={1} text="點選「測驗系統」，選擇分類與題數後開始作答。" />
      <Step n={2} text="每題作答後點「確認作答」查看即時對錯與正確答案。" />
      <Step n={3} text="測驗結束後顯示得分與答題回顧，可再測一次。" />
    </Section>
  </div>
);

const AdminManual: React.FC = () => (
  <div>
    <Section title="一、管理員權限">
      <Step n={1} text="管理員擁有教師端所有功能，另有「用戶管理」與「系統架構」頁面。" />
      <Step n={2} text="「用戶管理」可新增 / 停用帳號，並查看全系統每日用量統計。" />
      <Step n={3} text="「系統架構」頁面說明技術棧與系統設計，供技術人員參考。" />
    </Section>

    <Section title="二、部署架構（概覽）">
      <Step n={1} text="前端：Cloudflare Pages（學生 / 教師操作介面）。" />
      <Step n={2} text="後端 API：Zeabur（Node.js + PostgreSQL 資料庫）。" />
      <Step n={3} text="AI 服務：Google Gemini，負責教材向量化與 AR「AI 助教」即時問答。" />
      <Note>連線字串、API Key 等機密資訊請參閱維運文件，切勿外流或寫入程式碼倉庫。</Note>
    </Section>

    <Section title="三、帳號與資料">
      <Step n={1} text="新帳號預設密碼格式為 student123 / teacher123，建議首次登入後更改。" />
      <Step n={2} text="可於「用戶管理」以 Excel 批次建立學生帳號。" />
    </Section>
  </div>
);

interface SystemManualProps {
  userRole: UserRole;
}

const ALL_TABS: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: 'teacher', label: '教師操作說明', Icon: IconBook },
  { id: 'student', label: '學生操作說明', Icon: IconUser },
  { id: 'admin',   label: '管理員說明',   Icon: IconInfo },
];

export default function SystemManual({ userRole }: SystemManualProps) {
  // 依身分決定可見的說明分頁：學生只看學生、教師只看教師、管理員可看全部
  const visibleTabs = React.useMemo(() => {
    if (userRole === UserRole.ADMIN) return ALL_TABS;
    if (userRole === UserRole.TEACHER) return ALL_TABS.filter(t => t.id === 'teacher');
    return ALL_TABS.filter(t => t.id === 'student');
  }, [userRole]);

  const [tab, setTab] = useState<Tab>(visibleTabs[0].id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-black text-slate-800">系統操作說明</h2>
          <p className="text-sm text-slate-400 mt-1">EduMind AI 視光教育平台使用手冊</p>
        </div>
        {/* 重看導覽 */}
        <button
          onClick={() => { localStorage.removeItem('edumind_onboarded'); window.location.reload(); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl border border-indigo-200 text-sm font-medium transition-all"
        >
          <span>🎯</span>
          重看新手導覽
        </button>
      </div>

      {/* Tab bar：只有管理員會看到多個分頁 */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          {visibleTabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.replace('操作說明', '').replace('說明', '')}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {tab === 'teacher' && <TeacherManual />}
        {tab === 'student' && <StudentManual />}
        {tab === 'admin'   && <AdminManual />}
      </div>

      <p className="text-xs text-slate-400 text-center">EduMind AI — 視光教育平台 · 如有問題請聯絡管理員</p>
    </div>
  );
}
