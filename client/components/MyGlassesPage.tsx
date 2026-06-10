import React, { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../services/authService';
import { API_BASE } from '../apiBase';
import { cutoutGlasses } from '../ar/modules/glasses-cutout';

/**
 * 我的眼鏡：在主系統先上傳自己的眼鏡照（自動去背），
 * 到 AR 模擬練習的「我的眼鏡收藏」即可直接套用試戴。
 * 圖片存資料庫、綁個人帳號。
 */
interface Item { id: string; label: string | null; created_at: string; }

const MyGlassesPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Item | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    if (!preview || !editName.trim()) return;
    setSavingName(true);
    try {
      const r = await fetch(`${API_BASE}/my-glasses/${preview.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ label: editName.trim() }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || '儲存失敗');
      setItems(prev => prev.map(x => x.id === preview.id ? { ...x, label: editName.trim() } : x));
      setPreview(p => p ? { ...p, label: editName.trim() } : p);
    } catch (e: any) { alert('改名失敗: ' + e.message); }
    finally { setSavingName(false); }
  }

  const load = () => {
    fetch(`${API_BASE}/my-glasses?kind=glasses`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setItems(d.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  async function handleUpload(file: File) {
    setBusy('準備中…');
    try {
      // 與 AR「拍我的眼鏡」完全同一條去背管線（共用模組）
      const cropped = await cutoutGlasses(file, setBusy);
      setBusy('上傳中…');
      const fd = new FormData();
      fd.append('image', cropped, 'my-glasses.png');
      fd.append('kind', 'glasses');
      fd.append('label', file.name.replace(/\.[^.]+$/, '').slice(0, 30));
      const r = await fetch(`${API_BASE}/my-glasses/upload`, {
        method: 'POST', headers: getAuthHeaders(), body: fd,
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || '上傳失敗');
      load();
    } catch (e: any) {
      alert('上傳失敗: ' + e.message);
    } finally {
      setBusy('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(item: Item) {
    if (!window.confirm('確定刪除這副眼鏡？')) return;
    await fetch(`${API_BASE}/my-glasses/${item.id}`, { method: 'DELETE', headers: getAuthHeaders() }).catch(() => {});
    setItems(prev => prev.filter(x => x.id !== item.id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">我的眼鏡</h2>
        <p className="text-sm text-slate-500 mt-1">
          先在這裡上傳自己的眼鏡照（系統自動去背），到「AR 模擬練習 → ⋯更多 → 我的眼鏡收藏」即可直接試戴。
        </p>
      </div>

      {/* 上傳區 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="w-full md:w-auto bg-amber-500 hover:bg-amber-400 text-black font-bold px-6 py-3 rounded-xl transition disabled:opacity-50">
          {busy || '＋ 上傳眼鏡照片（自動去背）'}
        </button>
        <p className="text-xs text-slate-400 mt-2">
          📷 請拍「只有眼鏡」的照片：平放桌上、背景單純，不要連臉一起拍。支援 PNG / JPG，6MB 內。
        </p>
      </div>

      {/* 清單 */}
      {loading ? (
        <p className="text-center py-10 text-slate-400">載入中…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <p>還沒有上傳過眼鏡</p>
          <p className="text-xs mt-1">上傳後會出現在這裡，AR 試戴的「我的眼鏡收藏」也會同步看到</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(item => (
            <div key={item.id} onClick={() => { setPreview(item); setEditName(item.label || ''); }}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden group cursor-pointer hover:shadow-md transition">
              <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-300 relative">
                <img src={`${API_BASE}/my-glasses/${item.id}/image`} alt={item.label || '我的眼鏡'}
                  className="w-full h-full object-contain p-2" />
                <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} title="刪除"
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 hover:bg-red-500 transition">✕</button>
              </div>
              <div className="px-3 py-2">
                <p className="text-xs font-bold text-slate-700 truncate">{item.label || '我的眼鏡'}</p>
                <p className="text-[10px] text-slate-400">{new Date(item.created_at).toLocaleDateString('zh-TW')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 預覽彈窗：大圖 + 改名 + 前往 AR 試戴 */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setPreview(null)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative overflow-hidden">
            <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-300">
              <img src={`${API_BASE}/my-glasses/${preview.id}/image`} alt={preview.label || '我的眼鏡'}
                className="w-full h-full object-contain p-4" />
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="眼鏡名稱"
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button onClick={saveName} disabled={savingName || !editName.trim() || editName.trim() === (preview.label || '')}
                  className="shrink-0 bg-indigo-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl disabled:opacity-40">
                  {savingName ? '…' : '儲存'}
                </button>
              </div>
              <button onClick={() => window.open(`/ar/index.html?applyMine=${preview.id}`, '_blank')}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl transition">
                👓 前往 AR 模擬練習試戴這副
              </button>
              <div className="flex gap-2">
                <button onClick={() => { handleDelete(preview); setPreview(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-sm font-bold">刪除</button>
                <button onClick={() => setPreview(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 text-sm font-bold">關閉</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyGlassesPage;
