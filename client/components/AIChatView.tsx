import React, { useState, useEffect, useRef } from 'react';
import { getAuthHeaders } from '../services/authService';
import { chatStream } from '../services/chatService';
import { API_BASE } from '../apiBase';

interface QA {
  id: string;
  category: string;
  question: string;
  answer: string;
  course_id: string | null;
}

interface AIChatViewProps {
  courseId: string;
  onBack?: () => void;
}

const AIChatView: React.FC<AIChatViewProps> = ({ courseId, onBack }) => {
  // 問 AI（教材 RAG）對話狀態
  const [aiMsgs, setAiMsgs] = useState<{ role: 'user' | 'ai'; content: string; sources?: string[] }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  async function askAi() {
    const q = aiInput.trim();
    if (!q || aiBusy || !courseId) return;
    setAiInput('');
    setAiBusy(true);
    setAiMsgs(prev => [...prev, { role: 'user', content: q }, { role: 'ai', content: '' }]);
    try {
      for await (const ev of chatStream(q, courseId)) {
        if (ev.type === 'token' && ev.text) {
          setAiMsgs(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: next[next.length - 1].content + ev.text };
            return next;
          });
        } else if (ev.type === 'sources' && Array.isArray(ev.data)) {
          const names = Array.from(new Set(ev.data.map((d: any) => d

?.metadata?.filename).filter(Boolean))) as string[];
          setAiMsgs(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], sources: names };
            return next;
          });
        } else if (ev.type === 'error') {
          setAiMsgs(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: `⚠️ ${ev.message || '回覆失敗，請稍後再試'}` };
            return next;
          });
        }
      }
    } finally {
      setAiBusy(false);
    }
  }
  const [items, setItems] = useState<QA[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('全部');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<(QA & { similarity: number })[] | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 載入所有問答
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (courseId) params.set('course_id', courseId);
        const res = await fetch(`${API_BASE}/knowledge?${params}`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        setItems(data.data ?? []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [courseId]);

  // 即時搜尋（有輸入才用 API search）
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!search.trim()) { setSearchResults(null); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${API_BASE}/knowledge/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ query: search.trim(), course_id: courseId || undefined, top_k: 10 }),
        });
        const data = await res.json();
        setSearchResults(data.data ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [search, courseId]);

  const categories = ['全部', ...Array.from(new Set(items.map(i => i.category))).sort()];

  const displayItems: (QA & { similarity?: number })[] = searchResults !== null
    ? searchResults
    : items.filter(i => activeCategory === '全部' || i.category === activeCategory);

  const [expandedFull, setExpandedFull] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

  const renderAnswer = (text: string, isExpanded: boolean) => {
    const lines = text.split('\n').filter(l => l.trim());
    const displayLines = isExpanded ? lines : lines.slice(0, 3);

    return displayLines.map((line, i) => {
      const trimmed = line.trim();
      // Numbered item: "1. xxx" or "1）xxx"
      const numMatch = trimmed.match(/^(\d+)[.）、]\s*(.+)/);
      // Bullet item: "- xxx" or "• xxx" or "· xxx"
      const bulletMatch = trimmed.match(/^[-•·]\s*(.+)/);
      // Sub-item: "   - xxx" (indented)
      const subMatch = line.match(/^ {2,}[-•·]\s*(.+)/);
      // Header/title line (ends with ：or :)
      const isHeader = trimmed.endsWith('：') || trimmed.endsWith(':');

      if (numMatch) {
        return (
          <div key={i} className="flex gap-2 mt-1.5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{numMatch[1]}</span>
            <span className="text-sm text-slate-700 leading-relaxed">{numMatch[2]}</span>
          </div>
        );
      }
      if (subMatch) {
        return (
          <div key={i} className="flex gap-1.5 ml-7 mt-0.5">
            <span className="text-indigo-300 mt-1.5 flex-shrink-0">▸</span>
            <span className="text-xs text-slate-600 leading-relaxed">{subMatch[1]}</span>
          </div>
        );
      }
      if (bulletMatch) {
        return (
          <div key={i} className="flex gap-2 mt-1">
            <span className="text-indigo-400 mt-1.5 flex-shrink-0 text-xs">●</span>
            <span className="text-sm text-slate-700 leading-relaxed">{bulletMatch[1]}</span>
          </div>
        );
      }
      if (isHeader) {
        return <p key={i} className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-2 mb-0.5">{trimmed}</p>;
      }
      if (!trimmed) return null;
      return <p key={i} className="text-sm text-slate-700 leading-relaxed mt-1">{trimmed}</p>;
    });
  };

  const categoryColors: Record<string, string> = {
    '視光產業現況': 'bg-blue-50 text-blue-700 border-blue-200',
    '度量衡與誤差': 'bg-purple-50 text-purple-700 border-purple-200',
    'OK鏡與近視防控': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'AI學習工具': 'bg-amber-50 text-amber-700 border-amber-200',
    '醫病溝通與服務': 'bg-rose-50 text-rose-700 border-rose-200',
    '國考重點': 'bg-red-50 text-red-700 border-red-200',
  };
  const defaultColor = 'bg-slate-50 text-slate-600 border-slate-200';
  const catColor = (c: string) => categoryColors[c] ?? defaultColor;

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] md:h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

      {/* Header */}
      <div className="px-4 md:px-6 py-3 md:py-4 border-b bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} className="flex items-center justify-center w-8 h-8 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors flex-shrink-0" aria-label="返回課程">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base md:text-lg font-bold text-slate-800 whitespace-nowrap">課業問答</h2>
                <span className="hidden sm:inline text-xs bg-indigo-100 text-indigo-600 px-2.5 py-0.5 rounded-full font-medium whitespace-nowrap">課後複習</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 truncate">共 {items.length} 個問答 · 點擊展開解答</p>
            </div>
          </div>
          <span className="sm:hidden flex-shrink-0 text-xs bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-full font-medium whitespace-nowrap ml-2">
            課後複習
          </span>
        </div>

        {/* 搜尋框 */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searching && (
            <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          )}
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜尋關鍵字，例如：OK鏡、散光、老花眼..."
            className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-700 placeholder-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 分類 Tabs（搜尋時隱藏）*/}
      {!search && (
        <div className="flex gap-2 px-6 py-3 overflow-x-auto flex-shrink-0 border-b border-slate-100 bg-white scrollbar-hide">
          {categories.map(cat => (
            <button key={cat}
              onClick={() => { setActiveCategory(cat); setExpanded(null); }}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                activeCategory === cat
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
              }`}>
              {cat}
              {cat !== '全部' && (
                <span className="ml-1 opacity-60">
                  {items.filter(i => i.category === cat).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Q&A 列表 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">

        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <span className="text-sm">載入中...</span>
          </div>
        )}

        {!loading && displayItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <svg className="w-12 h-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <p className="text-sm">{search ? `找不到「${search}」相關問答` : '此課程尚無問答'}</p>
            {!search && (
              <p className="text-xs text-slate-400/80 mt-1 text-center leading-relaxed px-6">
                老師上傳教材後，系統會自動生成課後問答（約需 1 分鐘）。<br />
                若仍未出現，教師可至「問答管理」按「✨ AI 從教材生成」或手動新增。
              </p>
            )}
          </div>
        )}

        {!loading && displayItems.map((item) => (
          <div key={item.id}
            className={`rounded-xl border transition-all duration-200 overflow-hidden ${
              expanded === item.id
                ? 'border-indigo-200 shadow-md shadow-indigo-50'
                : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
            }`}>

            {/* 問題列 */}
            <button
              onClick={() => toggle(item.id)}
              className="w-full text-left px-5 py-4 flex items-start gap-3 bg-white group">

              {/* 展開箭頭 */}
              <svg className={`w-4 h-4 mt-0.5 text-slate-400 flex-shrink-0 transition-transform duration-200 ${expanded === item.id ? 'rotate-180 text-indigo-500' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
              </svg>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${catColor(item.category)}`}>
                    {item.category}
                  </span>
                  {'similarity' in item && item.similarity !== undefined && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                      相關度 {Math.round(item.similarity * 100)}%
                    </span>
                  )}
                </div>
                <p className={`text-sm font-medium leading-relaxed ${expanded === item.id ? 'text-indigo-700' : 'text-slate-700 group-hover:text-slate-900'}`}>
                  {item.question}
                </p>
              </div>
            </button>

            {/* 答案 */}
            {expanded === item.id && (
              <div className="px-4 pb-4 pt-2 bg-indigo-50/40 border-t border-indigo-100">
                {/* 重點摘要：取第一個有意義的非標題行 */}
                {(() => {
                  const firstKey = item.answer.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.endsWith('：') && !l.endsWith(':'))
                    .find(l => {
                      const clean = l.replace(/^(\d+[.）、]|[-•·])\s*/, '');
                      return clean.length > 5;
                    });
                  if (!firstKey) return null;
                  const clean = firstKey.replace(/^(\d+[.）、]|[-•·])\s*/, '');
                  return (
                    <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <span className="text-amber-500 text-sm flex-shrink-0 mt-0.5">💡</span>
                      <p className="text-xs text-amber-800 leading-relaxed font-medium">{clean}</p>
                    </div>
                  );
                })()}
                <div className="border-l-2 border-indigo-300 pl-3 space-y-0.5">
                  {renderAnswer(item.answer, expandedFull.has(item.id))}
                </div>
                {item.answer.split('\n').filter(l => l.trim()).length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedFull(prev => {
                        const next = new Set(prev);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        return next;
                      });
                    }}
                    className="mt-2 text-xs text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1"
                  >
                    {expandedFull.has(item.id) ? '收起 ▲' : `展開全文 ▼（共 ${item.answer.split('\n').filter(l=>l.trim()).length} 行）`}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 問 AI（教材 RAG）：題庫找不到答案時直接問，AI 會引用課程教材回答 */}
      {courseId && (
        <div className="border-t border-slate-200 bg-white flex-shrink-0">
          {aiMsgs.length > 0 && (
            <div className="max-h-56 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50/60">
              {aiMsgs.map((m, i) => (
                <div key={i} className={`text-sm rounded-xl px-3 py-2 max-w-[92%] whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user' ? 'bg-indigo-600 text-white ml-auto' : 'bg-white border border-slate-200 text-slate-700'
                }`}>
                  {m.content.replace(/\*\*/g, '') || (aiBusy && i === aiMsgs.length - 1 ? '思考中…' : '')}
                  {m.sources && m.sources.length > 0 && (
                    <p className="mt-1.5 text-[10px] text-slate-400">📎 資料來源：{m.sources.join('、')}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2.5">
            <input
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') askAi(); }}
              placeholder="題庫找不到？直接問 AI（會參考課程教材回答）…"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button onClick={askAi} disabled={aiBusy || !aiInput.trim()}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-40 transition">
              {aiBusy ? '…' : '問 AI'}
            </button>
          </div>
        </div>
      )}

      {/* 底部提示 */}
      <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/60 flex-shrink-0">
        <p className="text-xs text-slate-400 text-center">
          {search
            ? `搜尋到 ${displayItems.length} 個相關問答`
            : `${activeCategory} · ${displayItems.length} 個問答 · 點擊展開解答`}
        </p>
      </div>
    </div>
  );
};

export default AIChatView;
