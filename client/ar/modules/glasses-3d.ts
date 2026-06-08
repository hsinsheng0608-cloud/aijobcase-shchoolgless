/**
 * glasses-3d.ts - Three.js 3D 眼鏡：正面用真實照片貼圖 + 程序化鏡腳
 */

import * as THREE from 'three';
import type { FaceResult } from './face-detector';
import frontUrl from '../assets/glasses-black-front.png';

/** 正面圖在「臉部單位」下的尺寸與鏡片中心位置 */
const FRONT = {
  imgW: 542, imgH: 267,
  pdPx: 272,
  // 實際鏡框（鏡片金屬圈）外緣 ≈ 0.86 PD；之前 0.92 太外面留下縫
  frameOuterPD: 0.86,
  templeAttachYRatio: 0.30,  // 鏡腳連接點（越大越低）
};

// 平滑（越小越平滑）：旋轉強平滑避免抖動，位置反應快避免拖移
const ROT_SMOOTH = 0.18;
const POS_SMOOTH = 0.75;  // 0.45 → 0.75：緊貼臉，不再 lag
const SIZE_SMOOTH = 0.20;

const STUB = {
  len:   1.80,    // 加長到 ≈108mm 接近耳朵
  tube:  0.010,
  bend:  0.07,
  inward: 0.12,
  tipR:  0.022,
  color: 0x111418,
};

// 鏡腳依 yaw 淡化：頭轉時遠側鏡腳變透明，避免戳眼
const FADE_START = 0.10;  // |yaw| > 0.10 開始淡化遠側
const FADE_RANGE = 0.35;  // 淡化過渡範圍

export class Glasses3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private glasses: THREE.Group;
  private videoEl: HTMLVideoElement;
  // 平滑 pose 與位置
  private smYaw = 0; private smPitch = 0; private smRoll = 0;
  private smCx  = 0; private smCy = 0; private smUnit = 0;
  private hasSmooth = false;
  // 各側鏡腳 material（依 yaw 控制 opacity）
  private templeMatRight!: THREE.MeshBasicMaterial;  // side=+1
  private templeMatLeft!:  THREE.MeshBasicMaterial;  // side=-1
  private frontMesh!: THREE.Mesh;
  private frontMat!: THREE.MeshBasicMaterial;
  private defaultTex!: THREE.Texture;
  private armsGroup!: THREE.Group;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    this.videoEl = video;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();

    // 用 ortho camera：螢幕座標 = 世界座標（簡化定位）
    this.camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
    this.camera.position.set(0, 0, 10);
    this.camera.lookAt(0, 0, 0);

    // 燈光
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(0.3, 0.3, 1);
    this.scene.add(ambient, dir);

    this.glasses = this.buildGlasses();
    this.scene.add(this.glasses);
    this.glasses.visible = false;
  }

  /** 建立眼鏡：正面圖貼平面 + 極短鏡腳 stub（從鏡框外緣往後一小段，僅側面可見） */
  private buildGlasses(): THREE.Group {
    const g = new THREE.Group();

    // 正面平面
    this.defaultTex = new THREE.TextureLoader().load(frontUrl);
    this.defaultTex.colorSpace = THREE.SRGBColorSpace;
    const planeW = FRONT.imgW / FRONT.pdPx;
    const planeH = FRONT.imgH / FRONT.pdPx;
    const frontGeo = new THREE.PlaneGeometry(planeW, planeH);
    this.frontMat = new THREE.MeshBasicMaterial({
      map: this.defaultTex,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });
    this.frontMesh = new THREE.Mesh(frontGeo, this.frontMat);
    g.add(this.frontMesh);

    // 鏡腳 stub：獨立 armsGroup 以便依模式整體平移
    this.armsGroup = new THREE.Group();
    g.add(this.armsGroup);
    const attachY = planeH / 2 - FRONT.templeAttachYRatio * planeH;
    this.templeMatRight = new THREE.MeshBasicMaterial({ color: STUB.color, transparent: true, opacity: 1 });
    this.templeMatLeft  = new THREE.MeshBasicMaterial({ color: STUB.color, transparent: true, opacity: 1 });
    const buildStub = (side: 1 | -1) => {
      const stubMat = side > 0 ? this.templeMatRight : this.templeMatLeft;
      const x0     = side * FRONT.frameOuterPD;
      const xEnd   = x0 - side * STUB.inward;
      const xStart = x0 - side * 0.04;
      const yEnd   = attachY - STUB.bend;
      const zEnd   = -STUB.len;
      const points = [
        new THREE.Vector3(xStart,                attachY,        0),
        new THREE.Vector3(xStart - side * 0.02,  attachY - 0.01, -STUB.len * 0.4),
        new THREE.Vector3(xStart - side * 0.05,  attachY - 0.02, -STUB.len * 0.75),
        new THREE.Vector3(xEnd,                  yEnd,           zEnd),
      ];
      const curve = new THREE.CatmullRomCurve3(points);
      const tube  = new THREE.TubeGeometry(curve, 28, STUB.tube, 8, false);
      this.armsGroup.add(new THREE.Mesh(tube, stubMat));

      const tipGeo = new THREE.SphereGeometry(STUB.tipR, 16, 12);
      tipGeo.scale(1.0, 0.85, 1.6);
      const tip = new THREE.Mesh(tipGeo, stubMat);
      tip.position.set(xEnd, yEnd, zEnd);
      this.armsGroup.add(tip);
    };
    buildStub(1);
    buildStub(-1);

    return g;
  }

  setColor(hex: number) {
    this.templeMatRight.color.setHex(hex);
    this.templeMatLeft.color.setHex(hex);
  }

  /**
   * catalog 眼鏡換貼圖：
   * - scale.y × (FRONT.imgW/FRONT.imgH) 修正 1000×1000 PNG 在 2:1 plane 上的比例
   * - position.y 讓鏡框 hinge (~37.5% from top) 對齊 arm attachY，消除斷層
   */
  setCatalogTexture(imageUrl: string) {
    const tex = new THREE.TextureLoader().load(imageUrl, (t) => {
      // 依「實際圖片長寬比」設定 plane 高度，避免眼鏡被拉長/壓扁
      const iw = (t.image && t.image.width) || 1;
      const ih = (t.image && t.image.height) || 1;
      this.frontMesh.scale.y = (FRONT.imgW / FRONT.imgH) * (ih / iw);
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    if (this.frontMat.map && this.frontMat.map !== this.defaultTex) {
      this.frontMat.map.dispose();
    }
    this.frontMat.map = tex;
    this.frontMat.needsUpdate = true;
    this.frontMesh.scale.y    = FRONT.imgW / FRONT.imgH;  // 暫定，onLoad 後依實際比例修正
    this.frontMesh.position.y = 0;
    this.frontMesh.visible    = true;
    this.armsGroup.position.y = -0.10;
  }

  /** 切回內建貼圖（black/tortoise/gold 等） */
  resetToBuiltinTexture() {
    if (this.frontMat.map && this.frontMat.map !== this.defaultTex) {
      this.frontMat.map.dispose();
    }
    this.frontMat.map = this.defaultTex;
    this.frontMat.needsUpdate = true;
    this.frontMesh.scale.y    = 1.0;
    this.frontMesh.position.y = 0;
    this.frontMesh.visible    = true;
    this.armsGroup.position.y = 0;
  }

  resize() {
    const w = this.videoEl.clientWidth;
    const h = this.videoEl.clientHeight;
    this.renderer.setSize(w, h, false);
    // ortho 範圍 = 螢幕像素，左上 (0,0)、右下 (w, h)
    this.camera.left   = 0;
    this.camera.right  = w;
    this.camera.top    = 0;
    this.camera.bottom = h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 每幀呼叫：用 MediaPipe 偵測結果定位 + 旋轉眼鏡
   * @param scale 整體縮放（user 可調）
   */
  update(face: FaceResult | null, scale = 1.0) {
    if (!face?.detected) {
      this.glasses.visible = false;
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Fall back to frontal pose when head-pose is unavailable (e.g. user wears real glasses)
    const pose = face.pose ?? { yaw: 0, pitch: 0, roll: 0 };
    const { leftEye, rightEye, noseBridge } = face;
    const videoW = this.videoEl.videoWidth;
    const videoH = this.videoEl.videoHeight;
    const dispW  = this.videoEl.clientWidth;
    const dispH  = this.videoEl.clientHeight;
    const sx = dispW / videoW;
    const sy = dispH / videoH;

    // 鼻樑為錨點，把 raw 像素轉成 ortho 螢幕座標（+ CSS 鏡像）
    const cxRaw = noseBridge ? noseBridge.x : (leftEye.irisCenter.x + rightEye.irisCenter.x) / 2;
    const cyRaw = (leftEye.irisCenter.y + rightEye.irisCenter.y) / 2;
    const cx = dispW - cxRaw * sx;  // 鏡像 X
    const cy = cyRaw * sy;

    // 還原 3D 真實眼距（補償 yaw 透視壓縮）
    const eyeDistPx = Math.hypot(
      rightEye.irisCenter.x - leftEye.irisCenter.x,
      rightEye.irisCenter.y - leftEye.irisCenter.y,
    ) * sx;
    const cosYaw   = Math.max(Math.abs(Math.cos(pose.yaw)), 0.3);
    const trueDist = eyeDistPx / cosYaw;
    const rawUnit  = trueDist * scale * 0.92;

    // ── 平滑：旋轉強平滑、位置反應快、大小中等 ──
    if (!this.hasSmooth) {
      this.smYaw = pose.yaw;     this.smPitch = pose.pitch;  this.smRoll = pose.roll;
      this.smCx  = cx;            this.smCy    = cy;          this.smUnit = rawUnit;
      this.hasSmooth = true;
    } else {
      this.smYaw   += ROT_SMOOTH * (pose.yaw   - this.smYaw);
      this.smPitch += ROT_SMOOTH * (pose.pitch - this.smPitch);
      this.smRoll  += ROT_SMOOTH * (pose.roll  - this.smRoll);
      this.smCx    += POS_SMOOTH * (cx      - this.smCx);
      this.smCy    += POS_SMOOTH * (cy      - this.smCy);
      this.smUnit  += SIZE_SMOOTH * (rawUnit - this.smUnit);
    }

    this.glasses.visible = true;
    this.glasses.position.set(this.smCx, this.smCy, 0);
    this.glasses.scale.set(this.smUnit, -this.smUnit, this.smUnit);
    this.glasses.rotation.set(-this.smPitch, -this.smYaw, this.smRoll, 'YXZ');

    // 鏡腳依 yaw 淡化：遠側透明（避免戳眼）
    // yaw > 0：subject 向左轉 → 看到右側臉 → side=+1 鏡腳要顯示，side=-1 淡化
    // yaw < 0：相反
    const fade = (sign: number) => {
      const projected = sign * this.smYaw;  // 該側面向遠端的程度
      if (projected >= -FADE_START) return 1.0;  // 該側仍朝向相機 → 全顯
      const t = (-projected - FADE_START) / FADE_RANGE;  // 0~1 淡化進度
      return Math.max(0, 1 - t);
    };
    this.templeMatRight.opacity = fade(+1);
    this.templeMatLeft.opacity  = fade(-1);

    this.renderer.render(this.scene, this.camera);
  }

  hide() {
    this.glasses.visible = false;
    this.renderer.render(this.scene, this.camera);
  }
}
