/**
 * glasses-cutout.ts — 眼鏡照片去背共用管線（AR 與「我的眼鏡」頁共用同一份程式）
 * 流程：縮圖 → AI 去背 → 背景色殘留清除 → 裁切 → 鏡片透明化
 */
import { removeBackground } from '@imgly/background-removal';

export function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 行動裝置記憶體有限：全精度 isnet 會讓 iOS WebKit 爆記憶體 →「重複發生問題」當機
const IS_MOBILE = /iPhone|iPad|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;

// 去背前先把照片縮到合理尺寸：省記憶體、快很多，去背品質幾乎無差
async function downscaleForRemoval(source: Blob, maxDim = 1400): Promise<Blob> {
  try {
    const img = await fileToImage(source);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h || Math.max(w, h) <= maxDim) return source;
    const s = maxDim / Math.max(w, h);
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    const ctx = cv.getContext('2d');
    if (!ctx) return source;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b || source), 'image/png'));
  } catch { return source; }
}

// 去背 → 再裁切掉四周透明空白，讓眼鏡填滿

/** 完整管線：跟 AR「拍我的眼鏡」一模一樣 */
export async function cutoutGlasses(
  rawSource: Blob,
  onStatus?: (msg: string) => void,
): Promise<Blob> {
  const source = await downscaleForRemoval(rawSource, IS_MOBILE ? 1100 : 1600);
  const removed = await removeBackground(source, {
    model: IS_MOBILE ? 'isnet_quint8' : 'isnet',
    progress: (key: string, cur: number, total: number) => {
      if (!onStatus) return;
      if (key.startsWith('fetch') && total) onStatus(`準備中 ${Math.round((cur / total) * 100)}%…（首次稍久）`);
      else onStatus('AI 去背中…');
    },
  });
  onStatus?.('裁切與鏡片透明化…');
  const cropped = await cropToContent(removed);
  return makeLensTransparent(cropped);
}

async function makeLensTransparent(blob: Blob): Promise<Blob> {
  try {
    const img = await fileToImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return blob;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;
    // 二值 alpha 遮罩（眼鏡=1）
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = d[i * 4 + 3] > 24 ? 1 : 0;

    // 距離變換（chamfer 3-4）：每個不透明像素到「透明區」的距離
    // 鏡框是細條 → 距離小；鏡片內部（殘留背景）→ 距離大，可精準分離
    const INF = 1 << 28;
    const D = new Int32Array(n);
    for (let i = 0; i < n; i++) D[i] = a[i] ? INF : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!D[p]) continue;
      let v = D[p];
      if (x > 0) v = Math.min(v, D[p - 1] + 3);
      if (y > 0) {
        v = Math.min(v, D[p - w] + 3);
        if (x > 0) v = Math.min(v, D[p - w - 1] + 4);
        if (x < w - 1) v = Math.min(v, D[p - w + 1] + 4);
      }
      D[p] = v;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const p = y * w + x;
      if (!D[p]) continue;
      let v = D[p];
      if (x < w - 1) v = Math.min(v, D[p + 1] + 3);
      if (y < h - 1) {
        v = Math.min(v, D[p + w] + 3);
        if (x < w - 1) v = Math.min(v, D[p + w + 1] + 4);
        if (x > 0) v = Math.min(v, D[p + w - 1] + 4);
      }
      D[p] = v;
    }

    // 門檻：~3.5% 短邊（鏡框厚度通常在此之下）；chamfer 單位 ×3
    const T = Math.max(8, Math.min(22, Math.round(Math.min(w, h) * 0.035))) * 3;
    const deep = new Uint8Array(n);
    for (let i = 0; i < n; i++) deep[i] = D[i] > T ? 1 : 0;

    // 只把「大面積」的深區域當鏡片（防止粗框中心被誤判）：連通區塊 ≥ 4% 像素才透明化
    const label = new Int32Array(n).fill(-1);
    const qx = new Int32Array(n), qy = new Int32Array(n);
    let nextId = 0;
    const minArea = Math.round(n * 0.04);
    for (let y0 = 0; y0 < h; y0++) for (let x0 = 0; x0 < w; x0++) {
      const p0 = y0 * w + x0;
      if (label[p0] !== -1 || !deep[p0]) continue;
      const id = nextId++; let head = 0, tail = 0;
      qx[tail] = x0; qy[tail] = y0; tail++; label[p0] = id;
      const members: number[] = [];
      while (head < tail) {
        const cx = qx[head], cy = qy[head]; head++;
        const cp = cy * w + cx; members.push(cp);
        if (cx > 0 && label[cp - 1] === -1 && deep[cp - 1]) { label[cp - 1] = id; qx[tail] = cx - 1; qy[tail] = cy; tail++; }
        if (cx < w - 1 && label[cp + 1] === -1 && deep[cp + 1]) { label[cp + 1] = id; qx[tail] = cx + 1; qy[tail] = cy; tail++; }
        if (cy > 0 && label[cp - w] === -1 && deep[cp - w]) { label[cp - w] = id; qx[tail] = cx; qy[tail] = cy - 1; tail++; }
        if (cy < h - 1 && label[cp + w] === -1 && deep[cp + w]) { label[cp + w] = id; qx[tail] = cx; qy[tail] = cy + 1; tail++; }
      }
      if (members.length >= minArea) {
        for (const m of members) {
          // 顏色洗成中性白＋6% 透明度：保留鏡片光澤感，但看不出照片內容
          const o = m * 4;
          d[o] = 245; d[o + 1] = 246; d[o + 2] = 248;
          d[o + 3] = Math.round(d[o + 3] * 0.06);
        }
      }
    }
    // 去白邊（defringe）：去背殘留的半透明淺色光暈再壓低，鏡框邊緣才乾淨
    for (let i = 0; i < n; i++) {
      const o = i * 4, a = d[o + 3];
      if (a > 0 && a < 230 && Math.min(d[o], d[o + 1], d[o + 2]) > 190) {
        d[o + 3] = Math.round(a * 0.35);
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return await new Promise<Blob>((res) => cv.toBlob((b) => res(b || blob), 'image/png'));
  } catch {
    return blob;
  }
}

// 裁切到「不透明內容」的邊界框（去掉去背後眼鏡四周的透明空白，套到臉上才對得準）

async function cropToContent(blob: Blob): Promise<Blob> {
  try {
    const img = await fileToImage(blob);
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return blob;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    const T = 16; // alpha 門檻
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > T) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX <= minX || maxY <= minY) return blob;
    const padX = Math.round((maxX - minX) * 0.03);
    const padY = Math.round((maxY - minY) * 0.06);
    minX = Math.max(0, minX - padX); maxX = Math.min(w - 1, maxX + padX);
    minY = Math.max(0, minY - padY); maxY = Math.min(h - 1, maxY + padY);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    out.getContext('2d')!.drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
    return await new Promise<Blob>((res) => out.toBlob((b) => res(b || blob), 'image/png'));
  } catch {
    return blob;
  }
}

// 私人眼鏡 API 用的 auth header
function myGlassesAuth(): Record<string, string> {
  const t = localStorage.getItem('edumind_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// 上傳到伺服器（綁定登入身份）。kind: 'glasses'=眼鏡素材、'tryon'=試戴照
