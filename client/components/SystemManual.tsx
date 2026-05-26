import React, { useState } from 'react';
import { IconBook, IconUser, IconEye, IconChat, IconZap, IconCheck, IconInfo } from './Icons';

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
    <Section title="一、登入系統">
      <Step n={1} text="開啟系統網址，輸入教師帳號與密碼後點選「登入」。" />
      <Step n={2} text="登入後自動進入「教學工作台」儀表板。" sub="儀表板顯示教材數量、修課人數、學生發問總次數等即時數據。" />
    </Section>

    <Section title="二、課程與教材管理">
      <Step n={1} text="點選左側「我的課程」，可查看所有課程清單。" />
      <Step n={2} text="點選課程進入後，點選「教材管理」上傳 PDF / DOCX / PPTX 教材。" sub="系統自動解析並建立 AI 可搜尋的知識庫（RAG）。" />
      <Step n={3} text="教材狀態顯示「READY」表示已建索引完成，學生可開始發問。" />
      <Note>同一課程可上傳多份教材，AI 會跨教材搜尋最相關段落回答學生。</Note>
    </Section>

    <Section title="三、問答管理（題庫）">
      <Step n={1} text="點選「問答管理」，可新增、編輯、刪除選擇題題庫。" />
      <Step n={2} text="每題需填入題目、四個選項、正確答案索引（0–3）及分類。" />
      <Step n={3} text="題目建立後學生可在「測驗系統」隨機抽題作答。" />
    </Section>

    <Section title="四、AR 練習報表">
      <Step n={1} text="點選「AR 練習報表」，可查看每位學生的練習次數與完成率。" />
      <Step n={2} text="點選學生姓名，展開每次練習的詳細時間與步驟完成狀況。" />
    </Section>

    <Section title="五、眼鏡素材管理">
      <Step n={1} text="點選「眼鏡素材管理」，新增眼鏡框或隱形眼鏡品項。" />
      <Step n={2} text="填寫名稱、類型、框型、適合臉型等屬性後上傳圖片（PNG/JPG，最大 5MB）。" />
      <Step n={3} text="品項上架後學生在「臉型眼鏡推薦」及 AR 試戴頁即可選用。" />
      <Note>建議使用去背白底圖片，AR 試戴效果最佳。</Note>
    </Section>

    <Section title="六、用戶管理">
      <Step n={1} text="點選「用戶管理」，可查看所有學生帳號及每日用量。" />
      <Step n={2} text="可批次匯入帳號（Excel 格式），或個別新增帳號。" />
    </Section>
  </div>
);

const StudentManual: React.FC = () => (
  <div>
    <Section title="一、登入系統">
      <Step n={1} text="開啟系統網址，輸入學號與密碼後點選「登入」。" sub="預設密碼請向教師索取。" />
      <Step n={2} text="學生登入後自動開啟 AR 模擬練習頁面。" />
    </Section>

    <Section title="二、AI 課業問答">
      <Step n={1} text="點選「課業問答」，選擇課程後輸入問題並送出。" />
      <Step n={2} text="AI 助教根據上傳教材內容，給出有來源引用的回答。" />
      <Step n={3} text="可切換「考題練習」模式，請 AI 出題並批改。" />
      <Note>每日問答上限 30 次，測驗上限 100 題。午夜重置。</Note>
    </Section>

    <Section title="三、測驗系統">
      <Step n={1} text="點選「測驗系統」，選擇分類與題數後開始作答。" />
      <Step n={2} text="每題作答後點「確認作答」查看即時對錯與正確答案。" />
      <Step n={3} text="測驗結束後顯示得分、答題回顧，可再測一次。" />
    </Section>

    <Section title="四、AR 模擬練習">
      <Step n={1} text="點選左側「AR 模擬練習」，開啟 AR 頁面後允許攝影機存取。" />
      <Step n={2} text="點選「開始練習」，依左側步驟引導完成視光量測流程。" sub="包含：瞳距量測、鏡框試戴、隱形眼鏡試色、臉型分析。" />
      <Step n={3} text="可切換右側 AI 助教面板隨時提問。" />
      <Step n={4} text="完成所有步驟後點選「結束練習」，系統自動記錄本次練習。" />
      <Note>手機使用者：點選畫面左下「📋」按鈕展開步驟面板，右下「💬」展開 AI 助教。</Note>
    </Section>

    <Section title="五、臉型眼鏡推薦">
      <Step n={1} text="點選「臉型眼鏡推薦」，選擇自己的臉型。" />
      <Step n={2} text="系統依臉型特徵推薦最適合的眼鏡框與隱形眼鏡，並說明推薦原因。" />
      <Step n={3} text="點選品項後回到 AR 頁面即可預覽試戴效果。" />
    </Section>
  </div>
);

const AdminManual: React.FC = () => (
  <div>
    <Section title="一、系統管理">
      <Step n={1} text="管理員擁有所有教師功能，另有「用戶管理」與「系統架構」頁面。" />
      <Step n={2} text="「用戶管理」可新增/停用帳號、查看全系統每日用量統計。" />
      <Step n={3} text="「系統架構」頁面說明技術棧與系統設計，供技術人員參考。" />
    </Section>

    <Section title="二、Render 雲端環境變數">
      <Step n={1} text="登入 Render Dashboard → 選擇 edumind-ai → Environment。" />
      <Step n={2} text="DATABASE_URL：確認密碼中的 ! 已 URL encode 為 %21。" />
      <Step n={3} text="GEMINI_API_KEY：填入從 aistudio.google.com/apikey 申請的 API Key。" />
      <Note>修改環境變數後需手動 Redeploy 才會生效。</Note>
    </Section>

    <Section title="三、資料庫">
      <Step n={1} text="正式資料庫：Supabase Asia-Pacific (Sydney)，已建好所有資料表。" />
      <Step n={2} text="本地開發：PostgreSQL 16，port 5432，DB: edumind，user: user。" />
      <Step n={3} text="新帳號預設密碼格式：student123 / teacher123，首次登入建議更改。" />
    </Section>
  </div>
);

export default function SystemManual() {
  const [tab, setTab] = useState<Tab>('teacher');

  const tabs: { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: 'teacher', label: '教師操作說明', Icon: IconBook },
    { id: 'student', label: '學生操作說明', Icon: IconUser },
    { id: 'admin',   label: '管理員說明',   Icon: IconInfo },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">系統操作說明</h2>
        <p className="text-sm text-slate-400 mt-1">EduMind AI 視光教育平台使用手冊</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split('操作')[0].split('說明')[0]}</span>
          </button>
        ))}
      </div>

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
