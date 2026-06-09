/**
 * face-detector.ts - Face detection using MediaPipe FaceLandmarker
 * 478 landmarks (468 face + 10 iris), GPU-accelerated, 30fps
 */

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface EyeData {
  irisCenter: { x: number; y: number };
  irisRadius: number;
  contour: { x: number; y: number }[];
  aperture: number;
}

export interface FaceResult {
  leftEye: EyeData;
  rightEye: EyeData;
  noseBridge?: { x: number; y: number };
  yaw: number;        // -1(左轉) ~ 0(正面) ~ +1(右轉)（landmark 估算）
  // 從 MediaPipe facialTransformationMatrix 抽出的真實 3D 角度（弧度）
  pose?: { yaw: number; pitch: number; roll: number };
  detected: boolean;
  fallback?: boolean;
}

type OnResultCallback = (result: FaceResult) => void;

// MediaPipe landmark indices
const MP = {
  LEFT_IRIS_CENTER:  468,
  LEFT_IRIS_RING:    [469, 470, 471, 472],
  RIGHT_IRIS_CENTER: 473,
  RIGHT_IRIS_RING:   [474, 475, 476, 477],
  // Eye outline for contour/aperture
  LEFT_EYE_OUTER:    33,
  LEFT_EYE_INNER:    133,
  LEFT_EYE_TOP:      159,
  LEFT_EYE_BOTTOM:   145,
  LEFT_EYE_TOP2:     158,
  LEFT_EYE_BOT2:     153,
  RIGHT_EYE_OUTER:   263,
  RIGHT_EYE_INNER:   362,
  RIGHT_EYE_TOP:     386,
  RIGHT_EYE_BOTTOM:  374,
  RIGHT_EYE_TOP2:    385,
  RIGHT_EYE_BOT2:    380,
  // Nose
  NOSE_BRIDGE:       6,
  NOSE_TIP:          4,
  // Cheeks for yaw
  LEFT_CHEEK:        234,
  RIGHT_CHEEK:       454,
};

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const SMOOTH_FACTOR = 0.4;  // 降低敏感度，減少跳動／擺動
let prevLeft: EyeData | null = null;
let prevRight: EyeData | null = null;

function smooth(current: EyeData, prev: EyeData | null): EyeData {
  if (!prev) return current;
  const lerp = (a: number, b: number) => a + SMOOTH_FACTOR * (b - a);
  return {
    irisCenter: {
      x: lerp(prev.irisCenter.x, current.irisCenter.x),
      y: lerp(prev.irisCenter.y, current.irisCenter.y),
    },
    irisRadius: lerp(prev.irisRadius, current.irisRadius),
    contour: current.contour.map((pt, i) => ({
      x: lerp(prev.contour[i]?.x ?? pt.x, pt.x),
      y: lerp(prev.contour[i]?.y ?? pt.y, pt.y),
    })),
    aperture: lerp(prev.aperture, current.aperture),
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function denorm(lm: NormalizedLandmark, w: number, h: number) {
  return { x: lm.x * w, y: lm.y * h };
}

/**
 * 從 4x4 column-major 矩陣抽出 YXZ Euler 角度
 * 注意：CSS3D 透過 scaleX(-1) 父層鏡像時，rotateY 與 rotateZ 的視覺方向會反轉
 *       所以這裡輸出 RAW 角度，由消費端決定是否補償鏡像
 */
function extractEulerYXZ(m: number[]): { yaw: number; pitch: number; roll: number } {
  // column-major: m[col*4 + row]
  const m02 = m[8],  m12 = m[9],  m22 = m[10];
  const m10 = m[1],  m11 = m[5];
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m12)));
  const yaw   = Math.atan2(m02, m22);
  const roll  = Math.atan2(m10, m11);
  return { yaw, pitch, roll };
}

function extractEye(
  lms: NormalizedLandmark[],
  w: number,
  h: number,
  isLeft: boolean,
): EyeData {
  const irCenterIdx = isLeft ? MP.LEFT_IRIS_CENTER : MP.RIGHT_IRIS_CENTER;
  const irRingIdx   = isLeft ? MP.LEFT_IRIS_RING   : MP.RIGHT_IRIS_RING;

  const center    = denorm(lms[irCenterIdx], w, h);
  const ringPts   = irRingIdx.map(i => denorm(lms[i], w, h));
  const irisRadius = ringPts.reduce((sum, p) => sum + dist(center, p), 0) / ringPts.length;

  const outerIdx  = isLeft ? MP.LEFT_EYE_OUTER   : MP.RIGHT_EYE_OUTER;
  const innerIdx  = isLeft ? MP.LEFT_EYE_INNER    : MP.RIGHT_EYE_INNER;
  const topIdx    = isLeft ? MP.LEFT_EYE_TOP      : MP.RIGHT_EYE_TOP;
  const botIdx    = isLeft ? MP.LEFT_EYE_BOTTOM   : MP.RIGHT_EYE_BOTTOM;
  const top2Idx   = isLeft ? MP.LEFT_EYE_TOP2     : MP.RIGHT_EYE_TOP2;
  const bot2Idx   = isLeft ? MP.LEFT_EYE_BOT2     : MP.RIGHT_EYE_BOT2;

  const outerPt = denorm(lms[outerIdx], w, h);
  const innerPt = denorm(lms[innerIdx], w, h);
  const topPt   = denorm(lms[topIdx],   w, h);
  const botPt   = denorm(lms[botIdx],   w, h);
  const top2Pt  = denorm(lms[top2Idx],  w, h);
  const bot2Pt  = denorm(lms[bot2Idx],  w, h);

  const eyeWidth  = dist(outerPt, innerPt);
  const eyeHeight = Math.max(dist(topPt, botPt), dist(top2Pt, bot2Pt));
  const aperture  = eyeWidth > 0 ? eyeHeight / eyeWidth : 0.3;

  const contour = [outerPt, topPt, top2Pt, innerPt, bot2Pt, botPt];

  return { irisCenter: center, irisRadius, contour, aperture };
}

// iOS Safari 開啟檔案選擇器/相機或切到背景時，會暫停甚至中斷 getUserMedia 串流，
// 回到頁面後 <video> 不會自動恢復 → 黑屏。保留參照以便重新播放或重新取得串流。
let activeVideo: HTMLVideoElement | null = null;
let activeStream: MediaStream | null = null;
let resuming = false;

/** 從背景/檔案選擇器回到 AR 頁時呼叫：串流還活著就重播，已中斷就重新取得 */
export async function resumeCamera(): Promise<void> {
  const v = activeVideo;
  if (!v || resuming) return;
  resuming = true;
  try {
    const live = !!activeStream && activeStream.getVideoTracks().some(t => t.readyState === 'live');
    if (!live) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
        activeStream = s;
        v.srcObject = s;
      } catch (e) {
        console.warn('[camera] 恢復相機失敗:', e);
        return;
      }
    }
    try { await v.play(); } catch { /* iOS 偶爾需要使用者手勢，忽略 */ }
  } finally {
    resuming = false;
  }
}

export async function initFaceDetector(
  videoElement: HTMLVideoElement,
  onResult: OnResultCallback,
  onProgress: (pct: number) => void,
): Promise<void> {
  onProgress(10);

  // Load MediaPipe WASM + model
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  onProgress(40);

  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: true, // 取 3D 頭部姿態
  });
  onProgress(70);

  // Start camera
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  videoElement.srcObject = stream;
  await videoElement.play();
  // 保留參照，供 resumeCamera() 在 iOS 從檔案選擇器/背景回來後恢復畫面
  activeVideo = videoElement;
  activeStream = stream;
  onProgress(100);

  const INTERVAL = 33; // ~30fps cap
  let lastTs = 0;

  function detect() {
    const now = performance.now();
    if (!videoElement.paused && !videoElement.ended && videoElement.readyState >= 2 && (now - lastTs) >= INTERVAL) {
      lastTs = now;
      const w = videoElement.videoWidth;
      const h = videoElement.videoHeight;

      try {
        const results = landmarker.detectForVideo(videoElement, now);
        if (!results.faceLandmarks.length) {
          prevLeft = null;
          prevRight = null;
          onResult({ leftEye: null as any, rightEye: null as any, yaw: 0, detected: false });
        } else {
          const lms = results.faceLandmarks[0];

          let leftEye  = extractEye(lms, w, h, true);
          let rightEye = extractEye(lms, w, h, false);

          leftEye  = smooth(leftEye,  prevLeft);
          rightEye = smooth(rightEye, prevRight);
          prevLeft  = leftEye;
          prevRight = rightEye;

          const nb        = denorm(lms[MP.NOSE_BRIDGE], w, h);
          const noseBridge = { x: nb.x, y: nb.y };

          // Yaw from cheek landmarks + nose tip
          const leftCheek  = denorm(lms[MP.LEFT_CHEEK],  w, h);
          const rightCheek = denorm(lms[MP.RIGHT_CHEEK], w, h);
          const noseTip    = denorm(lms[MP.NOSE_TIP],    w, h);
          const faceCenter = (leftCheek.x + rightCheek.x) / 2;
          const halfWidth  = Math.abs(rightCheek.x - leftCheek.x) / 2;
          const yaw        = halfWidth > 0 ? (noseTip.x - faceCenter) / halfWidth : 0;

          // 抽 3D 頭部姿態（若有 transformation matrix）
          let pose: { yaw: number; pitch: number; roll: number } | undefined;
          const mat = results.facialTransformationMatrixes?.[0];
          if (mat?.data && mat.data.length >= 16) {
            pose = extractEulerYXZ(Array.from(mat.data));
          }

          onResult({ leftEye, rightEye, noseBridge, yaw, pose, detected: true });
        }
      } catch {
        // skip frame
      }
    }
    requestAnimationFrame(detect);
  }

  detect();
}

// 智慧防呆：偵測一張靜態圖片裡是否有人臉（用來擋「自拍臉」誤當眼鏡上傳）
let imageLandmarker: FaceLandmarker | null = null;
export async function detectFaceInImage(img: HTMLImageElement): Promise<boolean> {
  try {
    if (!imageLandmarker) {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      imageLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
      });
    }
    const res = imageLandmarker.detect(img);
    return !!(res.faceLandmarks && res.faceLandmarks.length > 0);
  } catch (e) {
    console.warn('[detectFaceInImage] 偵測失敗，跳過防呆:', e);
    return false; // 偵測失敗就放行，避免誤擋
  }
}
