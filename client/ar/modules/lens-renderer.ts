/**
 * lens-renderer.ts - Canvas 2D contact lens & glasses overlay renderer
 * Glasses use realistic SVG image overlays positioned on detected eyes
 */

import type { EyeData } from './face-detector';
import { getGlassesSet } from './glasses-assets';


export type LensColor = 'clear' | 'blue' | 'green' | 'brown' | 'grey';
export type RenderMode = 'contact' | 'glasses';

// Cache for preloaded lens product images
const lensImageCache = new Map<string, HTMLImageElement>();

function loadLensImage(url: string): HTMLImageElement {
  if (!lensImageCache.has(url)) {
    const img = new Image();
    img.src = url;
    lensImageCache.set(url, img);
  }
  return lensImageCache.get(url)!;
}

const LENS_COLORS: Record<LensColor, { inner: string; outer: string; opacity: number }> = {
  clear:  { inner: 'rgba(180, 210, 255, 0.25)', outer: 'rgba(80, 130, 220, 0.50)',  opacity: 0.40 },
  blue:   { inner: 'rgba(60, 130, 246, 0.55)',  outer: 'rgba(30, 80, 200, 0.75)',   opacity: 0.65 },
  green:  { inner: 'rgba(34, 197, 94, 0.55)',   outer: 'rgba(20, 120, 60, 0.75)',   opacity: 0.65 },
  brown:  { inner: 'rgba(180, 120, 60, 0.55)',  outer: 'rgba(120, 70, 30, 0.75)',   opacity: 0.65 },
  grey:   { inner: 'rgba(150, 150, 150, 0.55)', outer: 'rgba(80, 80, 80, 0.75)',    opacity: 0.65 },
};

const LENS_SIZE_MULTIPLIER = 2.1;  // 1.8→2.1：隱形眼鏡套上去不再偏小
// 鏡片中心在圖片中佔 ~50% 寬度，要讓鏡片中心對齊瞳孔，需 1/0.5 ≈ 2.0
const DEFAULT_GLASSES_SCALE = 2.0;

const FRONT_IMG_LENS_Y = 0.50;
const YAW_THRESHOLD   = 0.5;
const SIDE_LENS_X_RATIO = 0.10;
const SIDE_SCALE        = 1.2;
// 側面圖內鏡片寬度佔比（≈10%），用此換算鏡片實際寬以對齊眼睛
const SIDE_LENS_W_RATIO = 0.20;

export class LensRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private color: LensColor = 'clear';
  private mode: RenderMode = 'contact';
  private glassesStyle = 'black';
  private glassesScale = DEFAULT_GLASSES_SCALE;
  private lensScale = LENS_SIZE_MULTIPLIER;
  private lensImageUrl: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setColor(color: LensColor) { this.color = color; this.lensImageUrl = null; }
  setLensImage(url: string | null) { this.lensImageUrl = url; }
  setMode(mode: RenderMode) { this.mode = mode; }
  setGlassesStyle(style: string) { this.glassesStyle = style; }
  getMode(): RenderMode { return this.mode; }
  setGlassesScale(scale: number) { this.glassesScale = scale; }
  setLensScale(scale: number) { this.lensScale = scale; }
  getGlassesScale() { return this.glassesScale; }
  getLensScale() { return this.lensScale; }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderContactLens(eye: EyeData) {
    const ctx = this.ctx;
    const { irisCenter, irisRadius } = eye;
    // Clamp to 3.5% of canvas height — prevents huge circles if MediaPipe mis-detects glasses as iris
    const maxIris = this.canvas.height * 0.045;  // 放寬上限，配合放大後的隱眼不被截小
    const lensRadius = Math.min(irisRadius, maxIris) * this.lensScale;

    ctx.save();

    // Product image overlay mode
    if (this.lensImageUrl) {
      const img = loadLensImage(this.lensImageUrl);
      if (img.complete && img.naturalWidth) {
        const d = lensRadius * 2;
        // multiply: dark ring tints the real iris, white/transparent areas show through
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.92;
        ctx.drawImage(img, irisCenter.x - lensRadius, irisCenter.y - lensRadius, d, d);
        ctx.restore();
        return;
      }
    }

    // Fallback: gradient colour overlay
    const colorDef = LENS_COLORS[this.color];
    const effectiveIris = Math.min(irisRadius, maxIris);
    const gradient = ctx.createRadialGradient(
      irisCenter.x, irisCenter.y, effectiveIris * 0.2,
      irisCenter.x, irisCenter.y, lensRadius
    );
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.25, colorDef.inner);
    gradient.addColorStop(0.6, colorDef.inner);
    gradient.addColorStop(0.85, colorDef.outer);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.arc(irisCenter.x, irisCenter.y, lensRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(irisCenter.x, irisCenter.y, lensRadius * 0.9, 0, Math.PI * 2);
    ctx.strokeStyle = colorDef.outer;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(irisCenter.x, irisCenter.y - effectiveIris * 0.1, effectiveIris * 0.7, -Math.PI * 0.75, -Math.PI * 0.25);
    ctx.strokeStyle = `rgba(255, 255, 255, ${colorDef.opacity * 0.6})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  private renderGlasses(leftEye: EyeData, rightEye: EyeData, noseBridge?: { x: number; y: number }, yaw = 0) {
    const ctx = this.ctx;
    const set = getGlassesSet(this.glassesStyle);

    const eyeMidX     = (leftEye.irisCenter.x + rightEye.irisCenter.x) / 2;
    const eyeMidY     = (leftEye.irisCenter.y + rightEye.irisCenter.y) / 2;
    const eyeDistance = Math.abs(rightEye.irisCenter.x - leftEye.irisCenter.x);
    const tiltAngle   = Math.atan2(
      rightEye.irisCenter.y - leftEye.irisCenter.y,
      rightEye.irisCenter.x - leftEye.irisCenter.x,
    ) * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    // 一律用正面圖。eyeDistance 已內含透視（轉頭時瞳孔距離縮短），不再額外做 cos 壓縮
    const img = set.front;
    if (!img.complete || !img.naturalWidth) { ctx.restore(); return; }

    const centerY = noseBridge ? eyeMidY + (noseBridge.y - eyeMidY) * 0.2 : eyeMidY;
    const anchorX = noseBridge ? noseBridge.x : eyeMidX;
    const drawW   = eyeDistance * this.glassesScale;
    const drawH   = drawW * (img.naturalHeight / img.naturalWidth);

    ctx.translate(anchorX, centerY);
    ctx.rotate(tiltAngle);
    ctx.drawImage(img,
      -drawW / 2,
      -drawH * FRONT_IMG_LENS_Y,
      drawW, drawH,
    );

    ctx.restore();
  }

  render(leftEye: EyeData | null, rightEye: EyeData | null, noseBridge?: { x: number; y: number }, yaw = 0) {
    this.clear();
    if (!leftEye || !rightEye) return;

    if (this.mode === 'glasses') {
      this.renderGlasses(leftEye, rightEye, noseBridge, yaw);
    } else {
      this.renderContactLens(leftEye);
      this.renderContactLens(rightEye);
    }
  }
}
