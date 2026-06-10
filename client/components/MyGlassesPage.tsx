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

const MyGlassesPage: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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
      setBusy('裁切上傳中…');
      const cropped = await cropToContent(cut);
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
            <div key={item.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden group">
              <div className="aspect-[4/3] bg-gradient-to-br from-slate-100 to-slate-300 relative">
                <img src={`${API_BASE}/my-glasses/${item.id}/image`} alt={item.label || '我的眼鏡'}
                  className="w-full h-full object-contain p-2" />
                <button onClick={() => handleDelete(item)} title="刪除"
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
    </div>
  );
};

export default MyGlassesPage;
