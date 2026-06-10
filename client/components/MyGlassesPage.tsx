import React, { useEffect, useRef, useState } from 'react';
import { getAuthHeaders } from '../services/authService';
import { API_BASE } from '../apiBase';

/**
 * 我的眼鏡：在主系統先上傳自己的眼鏡照（自動去背），
 * 到 AR 模擬練習的「我的眼鏡收藏」即可直接套用試戴。
 * 圖片存資料庫、綁個人帳號。
 */
interface Item { id: string; label: string | null; created_at: string; }

const IS_MOBILE = /iPhone|iPad|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

async function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** 去背前縮圖：省記憶體（手機防當機）、加速 */
async function downscale(file: Blob, maxDim: number): Promise<Blob> {
  try {
    const img = await fileToImage(file);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || Math.max(w, h) <= maxDim) return file;
    const s = maxDim / Math.max(w, h);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>(res => cv.toBlob(b => res(b || file), 'image/png'));
  } catch { return file; }
}

/** 裁切到不透明內容的邊界框（AR 套用時眼鏡才會填滿、對得準） */
async function cropToContent(blob: Blob): Promise<Blob> {
  try {
    const img = await fileToImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return blob;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX <= minX || maxY <= minY) return blob;
    const padX = Math.round((maxX - minX) * 0.03), padY = Math.round((maxY - minY) * 0.06);
    minX = Math.max(0, minX - padX); maxX = Math.min(w - 1, maxX + padX);
    minY = Math.max(0, minY - padY); maxY = Math.min(h - 1, maxY + padY);
    const out = document.createElement('canvas');
    out.width = maxX - minX + 1; out.height = maxY - minY + 1;
    out.getContext('2d')!.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return await new Promise<Blob>(res => out.toBlob(b => res(b || blob), 'image/png'));
  } catch { return blob; }
}

/** 鏡片透明化：去背後鏡片內仍是「透過鏡片拍到的背景」，侵蝕找出鏡片核心將其壓到 10% 透明度 */
async function makeLensTransparent(blob: Blob): Promise<Blob> {
  try {
    const img = await fileToImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return blob;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data, n = w * h;
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3] > 24 ? 1 : 0;
    const R = Math.max(8, Math.round(Math.min(w, h) * 0.06));
    const tmp = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let m = 1;
        for (let k = -R; k <= R; k++) { const xx = x + k; if (xx < 0 || xx >= w || a[row + xx] === 0) { m = 0; break; } }
        tmp[row + x] = m;
      }
    }
    const inner = new Uint8Array(n);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 1;
        for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= h || tmp[yy * w + x] === 0) { m = 0; break; } }
        inner[y * w + x] = m;
      }
    }
    for (let i = 0; i < n; i++) if (inner[i]) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * 0.10);
    // 去白邊
    for (let i = 0; i < n; i++) {
      const o = i * 4, al = d[o + 3];
      if (al > 0 && al < 230 && Math.min(d[o], d[o + 1], d[o + 2]) > 190) d[o + 3] = Math.round(al * 0.35);
    }
    ctx.putImageData(imgData, 0, 0);
    return await new Promise<Blob>(res => cv.toBlob(b => res(b || blob), 'image/png'));
  } catch { return blob; }
}

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
      // 去背（手機用輕量模型避免記憶體不足）
      const small = await downscale(file, IS_MOBILE ? 1100 : 1600);
      setBusy('AI 去背中…（首次需下載模型，請稍候）');
      const { removeBackground } = await import('@imgly/background-removal');
      let cut: Blob;
      try {
        cut = await removeBackground(small, {
          model: IS_MOBILE ? 'isnet_quint8' : 'isnet',
          output: { format: 'image/png', quality: 1 },
          progress: (key: string, cur: number, total: number) => {
            if (key.startsWith('fetch') && total) setBusy(`下載模型 ${Math.round((cur / total) * 100)}%…`);
            else setBusy('AI 去背中…');
          },
        });
      } catch { cut = small; }
      setBusy('鏡片透明化…');
      const lensed = await makeLensTransparent(cut);
      setBusy('裁切上傳中…');
      const cropped = await cropToContent(lensed);
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
