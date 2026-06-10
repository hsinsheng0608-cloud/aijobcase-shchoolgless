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

/** 背景色清除：用「被去背模型移除的區域」學出背景顏色群（k-means），
 *  把鏡框內顏色相同的殘留（透過鏡片拍到的桌面）一併變透明 */
async function removeBgColorRemnants(originalBlob: Blob, cutBlob: Blob): Promise<Blob> {
  try {
    const [oImg, cImg] = await Promise.all([fileToImage(originalBlob), fileToImage(cutBlob)]);
    const w = cImg.naturalWidth, h = cImg.naturalHeight;
    if (!w || !h || oImg.naturalWidth !== w || oImg.naturalHeight !== h) return cutBlob;
    const cvO = document.createElement('canvas'); cvO.width = w; cvO.height = h;
    const cvC = document.createElement('canvas'); cvC.width = w; cvC.height = h;
    const ctxO = cvO.getContext('2d', { willReadFrequently: true })!;
    const ctxC = cvC.getContext('2d', { willReadFrequently: true })!;
    ctxO.drawImage(oImg, 0, 0); ctxC.drawImage(cImg, 0, 0);
    const od = ctxO.getImageData(0, 0, w, h).data;
    const cData = ctxC.getImageData(0, 0, w, h);
    const cd = cData.data, n = w * h;

    // 1) 取樣被移除的背景像素（cut alpha=0 處的原圖顏色）
    const samples: number[][] = [];
    const step = Math.max(1, Math.floor(n / 6000));
    for (let i = 0; i < n; i += step) {
      if (cd[i * 4 + 3] <= 8) samples.push([od[i * 4], od[i * 4 + 1], od[i * 4 + 2]]);
    }
    if (samples.length < 50) return cutBlob;

    // 2) 簡易 k-means（k=3, 6 輪）
    const K = 3;
    let centers = [0, Math.floor(samples.length / 2), samples.length - 1].map(i => [...samples[i]]);
    const assign = new Array(samples.length).fill(0);
    const d2 = (a: number[], b: number[]) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < samples.length; i++) {
        let bi = 0, bd = Infinity;
        for (let k = 0; k < K; k++) { const dd = d2(samples[i], centers[k]); if (dd < bd) { bd = dd; bi = k; } }
        assign[i] = bi;
      }
      const sum = Array.from({ length: K }, () => [0, 0, 0, 0]);
      for (let i = 0; i < samples.length; i++) { const k = assign[i]; sum[k][0]+=samples[i][0]; sum[k][1]+=samples[i][1]; sum[k][2]+=samples[i][2]; sum[k][3]++; }
      for (let k = 0; k < K; k++) if (sum[k][3] > 0) centers[k] = [sum[k][0]/sum[k][3], sum[k][1]/sum[k][3], sum[k][2]/sum[k][3]];
    }
    // 每群容差 = 平均距離*1.6 + 14
    const tol = centers.map((c, k) => {
      let s = 0, cnt = 0;
      for (let i = 0; i < samples.length; i++) if (assign[i] === k) { s += Math.sqrt(d2(samples[i], c)); cnt++; }
      return cnt ? (s / cnt) * 1.6 + 14 : 0;
    });

    // 3) 不透明像素若顏色落在背景色群 → 視為鏡片殘留，變近透明
    for (let i = 0; i < n; i++) {
      const o = i * 4, al = cd[o + 3];
      if (al <= 8) continue;
      const px = [cd[o], cd[o + 1], cd[o + 2]];
      for (let k = 0; k < K; k++) {
        if (tol[k] > 0 && Math.sqrt(d2(px, centers[k])) < tol[k]) { cd[o + 3] = Math.round(al * 0.06); break; }
      }
    }
    ctxC.putImageData(cData, 0, 0);
    return await new Promise<Blob>(res => cvC.toBlob(b => res(b || cutBlob), 'image/png'));
  } catch { return cutBlob; }
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
  onStatus?.('清除鏡片殘留…');
  const colorCleaned = await removeBgColorRemnants(source, removed);
  onStatus?.('裁切與鏡片透明化…');
  const cropped = await cropToContent(colorCleaned);
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
    // 1) 侵蝕找「鏡片核心」（半徑要小於鏡片、大於鏡框粗細）
    const R = Math.max(6, Math.round(Math.min(w, h) * 0.045));
    const tmp = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let m = 1;
        for (let k = -R; k <= R; k++) { const xx = x + k; if (xx < 0 || xx >= w || a[row + xx] === 0) { m = 0; break; } }
        tmp[row + x] = m;
      }
    }
    const core = new Uint8Array(n);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 1;
        for (let k = -R; k <= R; k++) { const yy = y + k; if (yy < 0 || yy >= h || tmp[yy * w + x] === 0) { m = 0; break; } }
        core[y * w + x] = m;
      }
    }
    // 2) 把核心「膨脹」回去（R+輕微外擴），補回侵蝕掉的鏡片邊緣，直貼鏡框內緣
    const R2 = R + Math.max(3, Math.round(R * 0.4));
    const dil1 = new Uint8Array(n);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let m = 0;
        for (let k = -R2; k <= R2; k++) { const xx = x + k; if (xx >= 0 && xx < w && core[row + xx]) { m = 1; break; } }
        dil1[row + x] = m;
      }
    }
    const lens = new Uint8Array(n);
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 0;
        for (let k = -R2; k <= R2; k++) { const yy = y + k; if (yy >= 0 && yy < h && dil1[yy * w + x]) { m = 1; break; } }
        lens[y * w + x] = m && a[y * w + x] ? 1 : 0;
      }
    }
    for (let i = 0; i < n; i++) if (lens[i]) d[i * 4 + 3] = Math.round(d[i * 4 + 3] * 0.10);
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
