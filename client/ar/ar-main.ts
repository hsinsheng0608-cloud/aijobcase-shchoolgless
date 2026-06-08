/**
 * ar-main.ts - Main AR application entry point
 * Orchestrates face detection, lens rendering, guidance, chat, and session recording
 */

import { initFaceDetector, detectFaceInImage, type FaceResult } from './modules/face-detector';
import { LensRenderer, type LensColor } from './modules/lens-renderer';
import { uploadGlassesImage, registerGlassesUrl, type GlassesAngle } from './modules/glasses-assets';
import { removeBackground } from '@imgly/background-removal';
import { Glasses3D } from './modules/glasses-3d';
import { GuidanceController } from './modules/guidance-controller';
import { VoiceInput } from './modules/voice-input';
import { sendChatMessage, getUserInfo } from './modules/ar-chat';
import { SessionRecorder, type OpticsSnapshot } from './modules/session-recorder';

const API_ORIGIN = import.meta.env.VITE_API_URL || '';

/** Resolve relative image URLs from server to full URL */
function resolveUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_ORIGIN}${url}`;
}

// DOM elements
const loadingScreen = document.getElementById('loading-screen')!;
const loadingStatus = document.getElementById('loading-status')!;
const loadingBar = document.getElementById('loading-bar')!;
const cameraDenied = document.getElementById('camera-denied')!;
const arApp = document.getElementById('ar-app')!;
const noFaceMsg = document.getElementById('no-face-msg')!;
const video = document.getElementById('camera-video') as HTMLVideoElement;
const canvas = document.getElementById('lens-canvas') as HTMLCanvasElement;
const stepsList = document.getElementById('steps-list')!;
const chatMessages = document.getElementById('chat-messages')!;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const btnMic = document.getElementById('btn-mic')!;
const btnSend = document.getElementById('btn-send')!;
const voiceTimer = document.getElementById('voice-timer')!;
const voiceCountdown = document.getElementById('voice-countdown')!;
const btnStart = document.getElementById('btn-start')!;
const btnPause = document.getElementById('btn-pause')!;
const btnResume = document.getElementById('btn-resume')!;
const btnEnd = document.getElementById('btn-end')!;
const sessionTimer = document.getElementById('session-timer')!;
const timerDisplay = document.getElementById('timer-display')!;
const userName = document.getElementById('user-name')!;

// State
let sessionActive = false;
let sessionPaused = false;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let latestFaceResult: FaceResult | null = null;
let usingCatalogGlasses = false; // true = use PNG canvas, false = use 3D scene

// Optics accumulator — running average of measurements while session is active
const opticsAcc = {
  pd: [] as number[], pdLeft: [] as number[], pdRight: [] as number[],
  irisL: [] as number[], irisR: [] as number[],
  heightDiff: [] as number[], tilt: [] as number[], frameW: [] as number[],
};
function clearOpticsAcc() {
  for (const k of Object.keys(opticsAcc)) (opticsAcc as any)[k] = [];
}
function avgOrNull(arr: number[]): number | undefined {
  if (arr.length === 0) return undefined;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}
function getOpticsSnapshot(): OpticsSnapshot | undefined {
  const pd = avgOrNull(opticsAcc.pd);
  if (pd === undefined) return undefined;
  return {
    pdMm: pd,
    pdLeftMm: avgOrNull(opticsAcc.pdLeft)!,
    pdRightMm: avgOrNull(opticsAcc.pdRight)!,
    irisLMm: avgOrNull(opticsAcc.irisL)!,
    irisRMm: avgOrNull(opticsAcc.irisR)!,
    eyeHeightDiffMm: avgOrNull(opticsAcc.heightDiff)!,
    frameTiltDeg: avgOrNull(opticsAcc.tilt)!,
    recommendedFrameWidthMm: Math.round(avgOrNull(opticsAcc.frameW)!),
  };
}

// Three.js 3D 眼鏡
const glasses3DCanvas = document.getElementById('glasses-3d-canvas') as HTMLCanvasElement;
const glasses3DScene  = new Glasses3D(glasses3DCanvas, video);
let glassesScale3D    = 1.0;

// Modules
const renderer = new LensRenderer(canvas);
const recorder = new SessionRecorder();
const guidance = new GuidanceController((type, stepId) => {
  recorder.logEvent(type, stepId);
  guidance.renderStepsList(stepsList);
});

const voiceInput = new VoiceInput(
  (text) => handleSendMessage(text),
  (listening, countdown) => {
    voiceTimer.classList.toggle('hidden', !listening);
    voiceCountdown.textContent = String(countdown);
    btnMic.classList.toggle('bg-red-500/50', listening);
    btnMic.classList.toggle('bg-white/10', !listening);
  }
);

// Check auth
const userInfo = getUserInfo();
if (!userInfo) {
  window.location.href = '/';
} else {
  userName.textContent = userInfo.name;
  // Hide "返回系統" link for students (AR is their main page)
  const backLink = document.querySelector('#top-bar a[href="/"]') as HTMLElement;
  if (userInfo.role === 'STUDENT' && backLink) {
    backLink.innerHTML = `
      <span class="text-sm cursor-pointer" onclick="localStorage.removeItem('edumind_token');localStorage.removeItem('edumind_user');window.location.href='/';">登出</span>
    `;
  }
}

// Initialize
async function init() {
  loadingStatus.textContent = '正在載入 AI 臉部辨識模型...';
  loadingBar.style.width = '30%';

  try {
    await initFaceDetector(
      video,
      onFaceResult,
      (pct) => {
        loadingBar.style.width = `${pct}%`;
        loadingStatus.textContent = pct < 50 ? '正在載入 AI 模型...' : pct < 90 ? '正在初始化攝影機...' : '載入完成！';
        if (pct >= 100) {
          setTimeout(() => {
            loadingScreen.classList.add('hidden');
            arApp.classList.remove('hidden');
            resizeCanvas();
          }, 500);
        }
      }
    );
  } catch (err: any) {
    console.error('Face detector init failed:', err);
    const msg = err?.message || String(err);
    if (msg.includes('getUserMedia') || msg.includes('Permission') || msg.includes('NotAllowed') || (err instanceof Event)) {
      loadingScreen.classList.add('hidden');
      cameraDenied.classList.remove('hidden');
      cameraDenied.classList.add('flex');
    } else {
      loadingStatus.textContent = `載入失敗: ${msg.substring(0, 100)}`;
    }
    return;
  }

  // Render initial guidance
  guidance.renderStepsList(stepsList);
}

// Resize canvas to match video
function resizeCanvas() {
  const w = video.videoWidth || window.innerWidth;
  const h = video.videoHeight || window.innerHeight;
  renderer.resize(w, h);
  glasses3DScene.resize();
  console.log(`Canvas resized: ${w}x${h}`);
}
window.addEventListener('resize', () => glasses3DScene.resize());

video.addEventListener('loadedmetadata', resizeCanvas);
video.addEventListener('playing', resizeCanvas);
window.addEventListener('resize', resizeCanvas);

// 60fps 獨立渲染迴圈，與偵測分離
let rafId = 0;
function renderLoop() {
  if (latestFaceResult?.detected) {
    if (renderer.getMode() === 'glasses') {
      renderer.clear();
      glasses3DScene.update(latestFaceResult, glassesScale3D);
    } else {
      glasses3DScene.hide();
      renderer.render(latestFaceResult.leftEye, latestFaceResult.rightEye, latestFaceResult.noseBridge, latestFaceResult.yaw);
    }
  } else {
    renderer.clear();
    glasses3DScene.hide();
  }
  rafId = requestAnimationFrame(renderLoop);
}
renderLoop();

// HMR cleanup — stop old renderLoop so stale contact-mode renderer doesn't keep drawing
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(rafId);
  });
}

// Face detection callback（只更新資料，不直接 render）
function onFaceResult(result: FaceResult) {
  latestFaceResult = result;
  if (!result.detected) {
    noFaceMsg.classList.remove('hidden');
    return;
  }
  noFaceMsg.classList.add('hidden');
  updateOpticsPanel(result);
}

// Size slider
const sizeRange = document.getElementById('size-range') as HTMLInputElement;
const sizeLabel = document.getElementById('size-label')!;

sizeRange.addEventListener('input', () => {
  const pct = parseInt(sizeRange.value, 10);
  sizeLabel.textContent = `${pct}%`;
  const mode = renderer.getMode();
  if (mode === 'glasses') {
    renderer.setGlassesScale(2.0 * (pct / 100));
    glassesScale3D = pct / 100;
  } else {
    renderer.setLensScale(1.8 * (pct / 100));
  }
});

// Fullscreen toggle
const btnFullscreen = document.getElementById('btn-fullscreen')!;
btnFullscreen.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

// Practice history modal
const btnHistory = document.getElementById('btn-history')!;
const historyModal = document.getElementById('history-modal')!;
const historyClose = document.getElementById('history-close')!;
const historyBackdrop = document.getElementById('history-backdrop')!;
const historyList = document.getElementById('history-list')!;

async function loadHistory() {
  const token = localStorage.getItem('edumind_token');
  if (!token) return;
  historyList.innerHTML = '<div class="text-center text-white/40 text-sm py-8">載入中...</div>';
  try {
    const res = await fetch(`${API_ORIGIN}/api/ar-practice/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json.success || !json.data.length) {
      historyList.innerHTML = '<div class="text-center text-white/40 text-sm py-8">尚無練習紀錄</div>';
      return;
    }
    historyList.innerHTML = json.data.map((s: any) => {
      const date = new Date(s.created_at || s.started_at).toLocaleString('zh-TW');
      const dur = s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}分${s.duration_seconds % 60}秒` : '--';
      const statusColor = s.status === 'COMPLETED' ? 'text-green-400' : s.status === 'IN_PROGRESS' ? 'text-yellow-400' : 'text-red-400';
      const statusText = s.status === 'COMPLETED' ? '已完成' : s.status === 'IN_PROGRESS' ? '進行中' : '未完成';
      return `<div class="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3 border border-white/10">
        <div>
          <div class="text-xs text-white/80">${date}</div>
          <div class="text-[10px] text-white/40 mt-0.5">完成 ${s.steps_completed ?? 0}/6 步驟 · ${dur}</div>
        </div>
        <span class="text-xs font-medium ${statusColor}">${statusText}</span>
      </div>`;
    }).join('');
  } catch {
    historyList.innerHTML = '<div class="text-center text-red-400 text-sm py-8">載入失敗</div>';
  }
}

btnHistory.addEventListener('click', () => {
  historyModal.classList.remove('hidden');
  loadHistory();
});
historyClose.addEventListener('click', () => historyModal.classList.add('hidden'));
historyBackdrop.addEventListener('click', () => historyModal.classList.add('hidden'));

// Mobile FAB: toggle bottom-sheet panels (guidance / chat)
const guidancePanel = document.getElementById('guidance-panel')!;
const chatPanel = document.getElementById('chat-panel')!;
const fabGuidance = document.getElementById('mobile-fab-guidance');
const fabChat = document.getElementById('mobile-fab-chat');
const mobileBackdrop = document.getElementById('mobile-panel-backdrop');

function closeMobilePanels() {
  guidancePanel.classList.remove('panel-open');
  chatPanel.classList.remove('panel-open');
  mobileBackdrop?.classList.remove('active');
}

fabGuidance?.addEventListener('click', () => {
  const willOpen = !guidancePanel.classList.contains('panel-open');
  closeMobilePanels();
  if (willOpen) {
    guidancePanel.classList.add('panel-open');
    mobileBackdrop?.classList.add('active');
  }
});
fabChat?.addEventListener('click', () => {
  const willOpen = !chatPanel.classList.contains('panel-open');
  closeMobilePanels();
  if (willOpen) {
    chatPanel.classList.add('panel-open');
    mobileBackdrop?.classList.add('active');
  }
});
mobileBackdrop?.addEventListener('click', closeMobilePanels);

// Mode toggle (contact lens / glasses)
const modeContact = document.getElementById('mode-contact')!;
const modeGlasses = document.getElementById('mode-glasses')!;
const contactOptions = document.getElementById('contact-options')!;
const glassesOptions = document.getElementById('glasses-options')!;

// Enforce initial display state (avoids stale DOM on HMR reload)
contactOptions.style.display = 'flex';
glassesOptions.style.display = 'none';
renderer.setMode('contact');
modeContact.classList.add('active');
modeGlasses.classList.remove('active');

modeContact.addEventListener('click', () => {
  renderer.setMode('contact');
  modeContact.classList.add('active');
  modeGlasses.classList.remove('active');
  contactOptions.style.display = 'flex';
  glassesOptions.style.display = 'none';
  // Reset size slider to current lens scale
  sizeRange.value = String(Math.round((renderer.getLensScale() / 1.8) * 100));
  sizeLabel.textContent = `${sizeRange.value}%`;
  applyOpticsMode();
});

modeGlasses.addEventListener('click', () => {
  renderer.setMode('glasses');
  modeGlasses.classList.add('active');
  modeContact.classList.remove('active');
  glassesOptions.style.display = 'flex';
  contactOptions.style.display = 'none';
  // Reset size slider and sync glassesScale3D
  const pct = Math.round((renderer.getGlassesScale() / 2.0) * 100);
  sizeRange.value = String(pct);
  sizeLabel.textContent = `${pct}%`;
  glassesScale3D = pct / 100;
  applyOpticsMode();
});

// Lens catalog — dynamic buttons from API
function buildLensButtons(items: { id: string; name: string; image_url: string; lens_color?: string }[]) {
  const container = document.getElementById('contact-options')!;
  container.innerHTML = '';
  items.forEach((item, i) => {
    const btn = document.createElement('button');
    btn.className = 'lens-catalog-btn flex-shrink-0 w-10 h-10 rounded-full border-2 border-transparent overflow-hidden transition hover:border-white/70 focus:outline-none';
    if (i === 0) btn.classList.add('ring-2', 'ring-white');
    btn.title = item.lens_color || item.name;
    const img = document.createElement('img');
    img.src = resolveUrl(item.image_url);
    img.className = 'w-full h-full object-cover rounded-full';
    img.draggable = false;
    btn.appendChild(img);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lens-catalog-btn').forEach((b) => {
        b.classList.remove('ring-2', 'ring-white');
      });
      btn.classList.add('ring-2', 'ring-white');
      renderer.setLensImage(resolveUrl(item.image_url));
      // 罐頭訊息
      const lensName = item.name || item.lens_color || '此款式';
      addChatMessage(
        `👁️ 已選擇【${lensName}】隱形眼鏡！\n` +
        `📌 佩戴小提示：\n` +
        `• 佩戴前請徹底洗手並擦乾\n` +
        `• 每日佩戴建議不超過 8 小時\n` +
        `• 取下後需用隱眼藥水清潔存放\n` +
        `• 若感覺乾澀、刺痛請立即取下\n` +
        `有任何疑問可以直接問我 😊`,
        'ai',
        {
          label: '💬 詳細問 AI（這款適不適合我？）',
          prompt: '請針對我目前選的這款隱形眼鏡，結合我的虹膜直徑(HVID)與用眼習慣，給我配戴適配與保養的個人化建議。',
        }
      );
    });
    container.appendChild(btn);
  });
  // Activate first item
  if (items.length > 0) renderer.setLensImage(resolveUrl(items[0].image_url));
}

async function fetchLensCatalog() {
  try {
    const res = await fetch(`${API_ORIGIN}/api/glasses?item_type=lens`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.success && data.data?.length) buildLensButtons(data.data);
  } catch { /* silent */ }
}
fetchLensCatalog();

const BUILTIN_TEMPLE_COLORS: Record<string, number> = {
  black: 0x111418, tortoise: 0x6b3a1f, gold: 0xc9a24a, red: 0x8a1f1f, sunglasses: 0x1a1a1a,
};

function applyBuiltinStyle(style: string) {
  usingCatalogGlasses = false;
  glasses3DScene.resetToBuiltinTexture();
  glasses3DScene.setColor(BUILTIN_TEMPLE_COLORS[style] ?? 0x111418);
}

// Glasses style selection
const GLASSES_CANNED: Record<string, string> = {
  black:       '🕶️ 已選擇【黑框眼鏡】！\n📌 配鏡小知識：\n• 黑色全框鏡架適合多種臉型，視覺上能修飾臉形\n• 正式場合與日常皆適用，為最百搭經典款\n• 建議定期清潔鼻墊與鏡腳，避免皮膚過敏\n有任何疑問可以直接問我 😊',
  tortoise:    '🕶️ 已選擇【玳瑁框眼鏡】！\n📌 配鏡小知識：\n• 玳瑁紋色調溫暖，適合膚色偏暖的配戴者\n• 醋酸纖維材質輕盈耐用，不易引發皮膚過敏\n• 避免長時間置於高溫環境，以免鏡框變形\n有任何疑問可以直接問我 😊',
  gold:        '🕶️ 已選擇【金屬框眼鏡】！\n📌 配鏡小知識：\n• 金屬框輕量耐用，無螺絲設計可減少鼻橋壓力\n• 適合長時間配戴，商務休閒兩相宜\n• 鈦合金材質對金屬過敏者較為友善\n有任何疑問可以直接問我 😊',
  red:         '🕶️ 已選擇【紅框眼鏡】！\n📌 配鏡小知識：\n• 鮮豔色系鏡框能展現個人風格與自信\n• 建議搭配簡約服裝，以突顯鏡框為主角\n• 彩色鏡框對膚色較亮者視覺效果更佳\n有任何疑問可以直接問我 😊',
  sunglasses:  '🕶️ 已選擇【墨鏡/飛行員款】！\n📌 配鏡小知識：\n• UV400 防護鏡片可阻隔 99% 以上紫外線\n• 戶外活動、開車時配戴保護眼睛免受強光傷害\n• 灰色/棕色鏡片對色彩失真最少，為戶外首選\n有任何疑問可以直接問我 😊',
};

document.querySelectorAll('.glasses-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.glasses-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const style = (btn as HTMLElement).dataset.glasses!;
    applyBuiltinStyle(style);
    // 罐頭訊息 + 可選「詳細問 AI」（混合模式）
    const msg = GLASSES_CANNED[style] ?? `🕶️ 已選擇眼鏡款式！有任何配鏡問題可以直接問我 😊`;
    addChatMessage(msg, 'ai', {
      label: '💬 詳細問 AI（依我的臉型／瞳距給個人化建議）',
      prompt: '請結合我目前選的這款眼鏡、我的臉型與即時估算的瞳距，給我個人化的配戴與挑選建議。',
    });
  });
});

// Chat
function addChatMessage(
  text: string,
  role: 'user' | 'ai',
  action?: { label: string; prompt: string },
) {
  const div = document.createElement('div');
  div.className = `chat-msg ${role}`;
  div.textContent = text;
  // 混合模式：罐頭訊息下方附「詳細問 AI」按鈕，點了才即時生成個人化回答
  if (action) {
    const btn = document.createElement('button');
    btn.textContent = action.label;
    btn.className = 'mt-2 inline-block text-xs font-medium text-indigo-300 hover:text-indigo-100 underline decoration-dotted';
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.style.opacity = '0.4';
      handleSendMessage(action.prompt);
    });
    div.appendChild(btn);
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

function getArContext(): string {
  const STYLE_ZH: Record<string, string> = {
    black: '黑框', tortoise: '玳瑁', gold: '金屬', red: '紅框', sunglasses: '墨鏡/飛行員',
  };
  const parts: string[] = [];

  if (renderer.getMode() === 'contact') {
    const activeBtn = document.querySelector<HTMLElement>('.lens-catalog-btn.ring-white, .lens-catalog-btn.ring-2');
    parts.push(`模式：隱形眼鏡（${activeBtn?.title || '未選款式'}）`);
  } else {
    const activeGlasses = document.querySelector<HTMLElement>('.glasses-btn.active');
    const style = activeGlasses?.dataset.glasses ?? '';
    parts.push(`模式：眼鏡（${STYLE_ZH[style] || style || '未選款式'}）`);
  }

  const selectedCard = document.querySelector<HTMLElement>('.face-shape-card.selected');
  if (selectedCard) {
    const label = selectedCard.querySelector<HTMLElement>('.text-xs.font-medium')?.textContent ?? '';
    if (label) parts.push(`已選臉型：${label}`);
  }

  if (sessionActive) {
    parts.push(`練習${sessionPaused ? '暫停' : '進行中'}（用時 ${timerDisplay.textContent}）`);
  } else {
    parts.push('練習尚未開始');
  }

  const pd = document.getElementById('tab-optics-pd')?.textContent;
  if (pd && pd !== '--') parts.push(`即時估算瞳距：${pd}`);

  return parts.join('；');
}

async function handleSendMessage(text: string) {
  if (!text.trim()) return;
  chatInput.value = '';

  addChatMessage(text, 'user');
  recorder.logEvent('CHAT_QUESTION', undefined, { text });

  const aiMsg = addChatMessage('', 'ai');
  let aiText = '';

  await sendChatMessage(
    text,
    null,
    (token) => {
      aiText += token;
      aiMsg.textContent = aiText;
      chatMessages.scrollTop = chatMessages.scrollHeight;
    },
    () => { /* done */ },
    (err) => { aiMsg.textContent = `錯誤: ${err}`; },
    getArContext()
  );
}

btnSend.addEventListener('click', () => handleSendMessage(chatInput.value));
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendMessage(chatInput.value);
});

// Voice
btnMic.addEventListener('click', () => {
  if (!voiceInput.isSupported()) {
    alert('您的瀏覽器不支援語音辨識');
    return;
  }
  voiceInput.start();
  recorder.logEvent('VOICE_QUESTION');
});

// Session controls
function updateTimer() {
  const secs = recorder.getElapsedSeconds();
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  timerDisplay.textContent = `${mm}:${ss}`;
}

btnStart.addEventListener('click', async () => {
  clearOpticsAcc();
  await recorder.startSession();
  guidance.reset();
  guidance.start();
  guidance.renderStepsList(stepsList);

  sessionActive = true;
  sessionPaused = false;
  btnStart.classList.add('hidden');
  btnPause.classList.remove('hidden');
  btnEnd.classList.remove('hidden');
  sessionTimer.classList.remove('hidden');

  timerInterval = setInterval(updateTimer, 1000);
});

btnPause.addEventListener('click', () => {
  sessionPaused = true;
  btnPause.classList.add('hidden');
  btnResume.classList.remove('hidden');
  recorder.logEvent('PAUSE');
});

btnResume.addEventListener('click', () => {
  sessionPaused = false;
  btnResume.classList.add('hidden');
  btnPause.classList.remove('hidden');
  recorder.logEvent('RESUME');
});

btnEnd.addEventListener('click', async () => {
  if (timerInterval) clearInterval(timerInterval);
  const completed = guidance.getCompletedCount();
  const status = guidance.isCompleted() ? 'COMPLETED' : 'ABANDONED';
  await recorder.endSession(completed, status, getOpticsSnapshot());

  sessionActive = false;
  sessionPaused = false;
  btnEnd.classList.add('hidden');
  btnPause.classList.add('hidden');
  btnResume.classList.add('hidden');
  btnStart.classList.remove('hidden');

  addChatMessage(
    `練習結束！完成 ${completed}/6 步驟，用時 ${timerDisplay.textContent}`,
    'ai'
  );
});

// 視光科學數據面板
const IRIS_REAL_MM = 11.5; // 成人平均虹膜直徑 mm，作為比例尺

const opticsPanel  = document.getElementById('optics-panel')!;
const btnOptics    = document.getElementById('btn-optics')!;
const opticsClose  = document.getElementById('optics-close')!;

btnOptics.addEventListener('click', () => opticsPanel.classList.toggle('hidden'));
opticsClose.addEventListener('click', () => opticsPanel.classList.add('hidden'));

// 依模式（眼鏡/隱眼）切換視光數據欄位顯示
function applyOpticsMode() {
  const mode = renderer.getMode() === 'contact' ? 'contact' : 'glasses';
  document.querySelectorAll<HTMLElement>('[data-optics-mode]').forEach((el) => {
    const m = el.dataset.opticsMode;
    el.style.display = (m === 'both' || m === mode) ? '' : 'none';
  });
  const title = document.getElementById('optics-title');
  if (title) title.textContent = mode === 'contact' ? '隱形眼鏡 · 視光數據' : '眼鏡 · 視光數據';
}
applyOpticsMode();

function updateOpticsPanel(result: FaceResult) {
  if (!result.detected) return;
  const { leftEye, rightEye, noseBridge } = result;

  // 用虹膜直徑當比例尺：px → mm
  const avgIrisRadiusPx = (leftEye.irisRadius + rightEye.irisRadius) / 2;
  const scale = IRIS_REAL_MM / (avgIrisRadiusPx * 2); // mm/px

  const eyeDistPx = Math.abs(rightEye.irisCenter.x - leftEye.irisCenter.x);
  const pd = (eyeDistPx * scale).toFixed(1);

  // 單眼瞳距：各眼到鼻中線距離
  const noseX = noseBridge?.x ?? (leftEye.irisCenter.x + rightEye.irisCenter.x) / 2;
  const pdLeft  = (Math.abs(noseX - leftEye.irisCenter.x)  * scale).toFixed(1);
  const pdRight = (Math.abs(rightEye.irisCenter.x - noseX) * scale).toFixed(1);

  // 虹膜直徑（隱眼模式即 HVID，決定鏡片直徑）
  const irisL = (leftEye.irisRadius  * 2 * scale).toFixed(1);
  const irisR = (rightEye.irisRadius * 2 * scale).toFixed(1);

  // 隱形眼鏡：建議鏡片直徑 ≈ HVID + 約 2.5mm 覆蓋（軟式鏡片需略大於角膜/虹膜可見直徑）
  const lensDiaMm = ((parseFloat(irisL) + parseFloat(irisR)) / 2 + 2.5).toFixed(1);

  // 眼高差
  const heightDiffMm = (Math.abs(leftEye.irisCenter.y - rightEye.irisCenter.y) * scale).toFixed(1);

  // 傾斜角
  const tiltDeg = (Math.atan2(
    rightEye.irisCenter.y - leftEye.irisCenter.y,
    rightEye.irisCenter.x - leftEye.irisCenter.x,
  ) * (180 / Math.PI)).toFixed(1);

  // 建議鏡框寬（眼距 × 2.8 scale，換算 mm）
  const frameWidthMm = (eyeDistPx * 2.8 * scale).toFixed(0);

  const setOptics = (id: string, val: string) => {
    const el1 = document.getElementById(id);
    const el2 = document.getElementById(`tab-${id}`);
    if (el1) el1.textContent = val;
    if (el2) el2.textContent = val;
  };
  setOptics('optics-pd',          `${pd} mm`);
  setOptics('optics-pd-left',     `${pdLeft} mm`);
  setOptics('optics-pd-right',    `${pdRight} mm`);
  setOptics('optics-iris-l',      `${irisL} mm`);
  setOptics('optics-iris-r',      `${irisR} mm`);
  setOptics('optics-lens-dia',    `${lensDiaMm} mm`);
  setOptics('optics-height-diff', `${heightDiffMm} mm`);
  setOptics('optics-tilt',        `${tiltDeg}°`);
  setOptics('optics-frame-width', `${frameWidthMm} mm`);

  // Accumulate into running average while session is active
  if (sessionActive && !sessionPaused) {
    opticsAcc.pd.push(parseFloat(pd));
    opticsAcc.pdLeft.push(parseFloat(pdLeft));
    opticsAcc.pdRight.push(parseFloat(pdRight));
    opticsAcc.irisL.push(parseFloat(irisL));
    opticsAcc.irisR.push(parseFloat(irisR));
    opticsAcc.heightDiff.push(parseFloat(heightDiffMm));
    opticsAcc.tilt.push(parseFloat(tiltDeg));
    opticsAcc.frameW.push(parseFloat(frameWidthMm));
  }
}

// 教學面板 Tab 切換
document.querySelectorAll('.edu-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = (tab as HTMLElement).dataset.tab!;
    document.querySelectorAll('.edu-tab').forEach(t => {
      t.classList.remove('active');
      (t as HTMLElement).style.color = '';
    });
    tab.classList.add('active');
    document.querySelectorAll('.edu-tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`tab-${target}`)?.classList.remove('hidden');
  });
});

// 臉型卡片點擊 → 顯示推薦眼鏡 + 套用
document.querySelectorAll('.face-shape-card').forEach((card) => {
  card.addEventListener('click', () => {
    const glassesStyle = (card as HTMLElement).dataset.glasses!;
    const label        = (card as HTMLElement).dataset.label!;
    const shape        = (card as HTMLElement).dataset.shape!;

    document.querySelectorAll('.face-shape-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    showFaceGlasses(shape);

    // 移除舊的 apply btn，加新的
    card.querySelector('.apply-btn')?.remove();
    const btn = document.createElement('span');
    btn.className = 'apply-btn';
    btn.textContent = `套用 ${label}`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderer.setMode('glasses');
      applyBuiltinStyle(glassesStyle);
      document.querySelectorAll('.glasses-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.glasses-btn[data-glasses="${glassesStyle}"]`)?.classList.add('active');
      modeGlasses.click();
    });
    card.querySelector('.flex-1')?.appendChild(btn);
  });
});

// 臉型推薦
const FACE_SHAPE_RULES: Record<string, { glasses: string; label: string; reason: string }> = {
  round:   { glasses: 'black',      label: '黑框方形',  reason: '方框增加臉部線條感，平衡圓潤輪廓' },
  square:  { glasses: 'tortoise',   label: '玳瑁圓框',  reason: '圓弧線條軟化方形輪廓，增添自然感' },
  oblong:  { glasses: 'gold',       label: '金屬大框',  reason: '大框增加橫向寬度，縮短臉部視覺比例' },
  heart:   { glasses: 'gold',       label: '金屬細框',  reason: '輕巧細框平衡額頭，不搶走視覺重心' },
  oval:    { glasses: 'black',      label: '任何框型',  reason: '鵝蛋臉比例均衡，各種框型都適合' },
};

const btnFaceShape = document.getElementById('btn-face-shape')!;
const faceShapeModal = document.getElementById('face-shape-modal')!;
const faceShapeClose = document.getElementById('face-shape-close')!;
const faceShapeBackdrop = document.getElementById('face-shape-backdrop')!;
const faceShapeResult = document.getElementById('face-shape-result')!;

document.querySelectorAll('.face-shape-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const shape = (btn as HTMLElement).dataset.shape!;
    const rule = FACE_SHAPE_RULES[shape];
    document.querySelectorAll('.face-shape-btn').forEach(b => b.classList.remove('ring-2', 'ring-indigo-400'));
    btn.classList.add('ring-2', 'ring-indigo-400');

    faceShapeResult.innerHTML = `
      <div class="bg-indigo-600/20 border border-indigo-500/40 rounded-xl p-4 text-sm">
        <div class="font-semibold text-white mb-1">推薦款式：${rule.label}</div>
        <div class="text-white/70 text-xs mb-3">${rule.reason}</div>
        <button id="apply-face-rec" data-glasses="${rule.glasses}"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-xs font-medium transition w-full">
          套用此款式
        </button>
      </div>`;

    document.getElementById('apply-face-rec')?.addEventListener('click', () => {
      renderer.setMode('glasses');
      applyBuiltinStyle(rule.glasses);
      document.querySelectorAll('.glasses-btn').forEach(b => b.classList.remove('active'));
      document.querySelector(`.glasses-btn[data-glasses="${rule.glasses}"]`)?.classList.add('active');
      modeGlasses.click();
      faceShapeModal.classList.add('hidden');
    });
  });
});

btnFaceShape?.addEventListener('click', () => faceShapeModal.classList.remove('hidden'));
faceShapeClose?.addEventListener('click', () => faceShapeModal.classList.add('hidden'));
faceShapeBackdrop?.addEventListener('click', () => faceShapeModal.classList.add('hidden'));

// 眼鏡圖片上傳（3 角度）
const btnUploadGlasses  = document.getElementById('btn-upload-glasses')!;
const uploadModal       = document.getElementById('upload-glasses-modal')!;
const uploadClose       = document.getElementById('upload-glasses-close')!;
const uploadBackdrop    = document.getElementById('upload-glasses-backdrop')!;

btnUploadGlasses?.addEventListener('click', () => uploadModal.classList.remove('hidden'));
uploadClose?.addEventListener('click',      () => uploadModal.classList.add('hidden'));
uploadBackdrop?.addEventListener('click',   () => uploadModal.classList.add('hidden'));

// 📷 拍我的眼鏡：拍照 → 自動去背 → 立即套用到 AR
const btnMyGlasses   = document.getElementById('btn-my-glasses');
const myGlassesInput = document.getElementById('my-glasses-input') as HTMLInputElement | null;
const myGlassesToast = document.getElementById('my-glasses-toast');
const myGlassesToastText = document.getElementById('my-glasses-toast-text');

// 去背（首次會下載模型，之後快取）
function removeBg(source: Blob): Promise<Blob> {
  return removeBackground(source);
}

// 私人眼鏡 API 用的 auth header
function myGlassesAuth(): Record<string, string> {
  const t = localStorage.getItem('edumind_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// 上傳去背後的私人眼鏡到伺服器（綁定登入身份）
async function uploadMyGlasses(blob: Blob) {
  try {
    const fd = new FormData();
    fd.append('image', blob, 'my-glasses.png');
    await fetch(`${API_ORIGIN}/api/my-glasses/upload`, { method: 'POST', headers: myGlassesAuth(), body: fd });
  } catch (e) { console.warn('[my-glasses] 上傳伺服器失敗（仍可本機使用）:', e); }
}

// 把去背後的圖套用為 AR 正面眼鏡貼圖
function applyRemovedGlasses(blob: Blob, fromSnap: boolean) {
  const url = URL.createObjectURL(blob);
  usingCatalogGlasses = true;
  renderer.setMode('glasses');
  glasses3DScene.setCatalogTexture(url);
  applyOpticsMode();
  uploadMyGlasses(blob); // 存到「我的眼鏡」（伺服器，永久私人）
  addChatMessage(
    (fromSnap ? '📸 已套用您拍的眼鏡（去背完成）！' : '📷 已套用您的眼鏡（去背完成）！') +
      '可用滑桿調整大小，或對著鏡頭看效果。',
    'ai',
    {
      label: '💬 詳細問 AI（這副框適合我嗎？）',
      prompt: '我剛套用了一副自己的眼鏡，請結合我的臉型與瞳距，評估這類鏡框是否適合我、並給挑選建議。',
    },
  );
}

// 兩個拍照入口都改成「拍/選『眼鏡這個物件』的照片」（手機用後鏡頭、桌機選檔）
// 重要：不抓自拍鏡頭畫面，否則去背會把整張臉當主體 → 變成臉貼臉
const btnSnapGlasses    = document.getElementById('btn-snap-glasses');
const snapPreviewModal  = document.getElementById('snap-preview-modal');
const snapPreviewImg    = document.getElementById('snap-preview-img') as HTMLImageElement | null;
const snapRetake        = document.getElementById('snap-retake');
const snapConfirm        = document.getElementById('snap-confirm');
let pendingRemoval: Promise<Blob> | null = null;

// 把檔案載入成 Image 元素（給人臉偵測用）
function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// 共用：照片（拍的或選的）→ 智慧防呆 → 預覽確認 → 去背在確認時背景偷跑
async function processGlassesPhoto(file: Blob) {
  myGlassesToast?.classList.remove('hidden');
  if (myGlassesToastText) myGlassesToastText.textContent = '檢查照片中…';
  let isFace = false;
  try { isFace = await detectFaceInImage(await fileToImage(file)); } catch { /* 放行 */ }
  myGlassesToast?.classList.add('hidden');
  if (isFace) {
    addChatMessage(
      '🙅 偵測到這是「人臉照」。請改拍「只有眼鏡」的照片（眼鏡放畫面中央、背景單純），' +
      '這樣去背才會抓到眼鏡、而不是整張臉喔！',
      'ai',
    );
    return;
  }
  if (snapPreviewImg) snapPreviewImg.src = URL.createObjectURL(file);
  snapPreviewModal?.classList.remove('hidden');
  pendingRemoval = removeBg(file);
  pendingRemoval.catch(() => {});
}

// 檔案選擇（相機開不了時的退路）
myGlassesInput?.addEventListener('change', () => {
  const file = myGlassesInput.files?.[0];
  myGlassesInput.value = '';
  if (file) processGlassesPhoto(file);
});

// 自訂相機拍照視窗（桌機/手機通用，不走檔案選擇器）
const camModal   = document.getElementById('cam-modal');
const camVideo   = document.getElementById('cam-video') as HTMLVideoElement | null;
const camShutter = document.getElementById('cam-shutter');
const camCancel  = document.getElementById('cam-cancel');
const camFlip    = document.getElementById('cam-flip');
let camStream: MediaStream | null = null;
let camFacing: 'environment' | 'user' = 'environment';

async function startCamStream() {
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: camFacing } });
  if (camVideo) { camVideo.srcObject = camStream; await camVideo.play(); }
}
async function openCamera() {
  try {
    await startCamStream();
    camModal?.classList.remove('hidden');
  } catch (e) {
    console.warn('[camera] 開啟失敗，退回選檔:', e);
    myGlassesInput?.click(); // 退路：相機開不了就選檔
  }
}
function closeCamera() {
  camModal?.classList.add('hidden');
  camStream?.getTracks().forEach(t => t.stop());
  camStream = null;
}

btnMyGlasses?.addEventListener('click', openCamera);
btnSnapGlasses?.addEventListener('click', openCamera);
camCancel?.addEventListener('click', closeCamera);
camFlip?.addEventListener('click', async () => {
  camFacing = camFacing === 'environment' ? 'user' : 'environment';
  try { await startCamStream(); } catch (e) { console.warn('[camera] 翻轉失敗:', e); }
});
camShutter?.addEventListener('click', () => {
  if (!camVideo || !camVideo.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = camVideo.videoWidth;
  canvas.height = camVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(camVideo, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => { closeCamera(); if (blob) processGlassesPhoto(blob); }, 'image/png');
});

snapRetake?.addEventListener('click', () => {
  snapPreviewModal?.classList.add('hidden');
  pendingRemoval = null; // 背景去背繼續跑沒關係，模型會被快取，下次更快
});

snapConfirm?.addEventListener('click', async () => {
  snapPreviewModal?.classList.add('hidden');
  if (!pendingRemoval) return;
  const job = pendingRemoval;
  pendingRemoval = null;
  if (myGlassesToastText) myGlassesToastText.textContent = '正在自動去背…';
  myGlassesToast?.classList.remove('hidden');
  try { applyRemovedGlasses(await job, true); }
  catch (err) { addChatMessage('⚠️ 去背失敗了，請讓眼鏡正面、背景單純一點再試一次。', 'ai'); console.warn(err); }
  finally { myGlassesToast?.classList.add('hidden'); }
});

// ── 我的眼鏡收藏（伺服器，私人）─────────────────────────
const btnMyCollection   = document.getElementById('btn-my-collection');
const myCollectionModal = document.getElementById('my-collection-modal');
const myCollectionClose = document.getElementById('my-collection-close');
const myCollectionGrid  = document.getElementById('my-collection-grid');
const myCollectionClear = document.getElementById('my-collection-clear');

interface MyGlassesItem { id: string; image_url: string; label?: string }

async function loadMyCollection() {
  if (!myCollectionGrid) return;
  myCollectionGrid.innerHTML = '<p class="col-span-3 text-center text-white/40 text-xs py-8">載入中…</p>';
  try {
    const res = await fetch(`${API_ORIGIN}/api/my-glasses`, { headers: myGlassesAuth() });
    const data = await res.json();
    const items: MyGlassesItem[] = data.data ?? [];
    if (items.length === 0) {
      myCollectionGrid.innerHTML = '<p class="col-span-3 text-center text-white/40 text-xs py-8">還沒有收藏，拍一張眼鏡吧 📸</p>';
      return;
    }
    myCollectionGrid.innerHTML = '';
    items.forEach((item) => {
      const cell = document.createElement('div');
      cell.className = 'relative group';
      const img = document.createElement('img');
      img.src = resolveUrl(item.image_url);
      img.className = 'w-full h-20 object-contain bg-white/5 rounded-lg cursor-pointer border border-white/10 hover:border-amber-400';
      img.title = '點擊套用';
      img.addEventListener('click', () => {
        usingCatalogGlasses = true;
        renderer.setMode('glasses');
        glasses3DScene.setCatalogTexture(resolveUrl(item.image_url));
        applyOpticsMode();
        myCollectionModal?.classList.add('hidden');
      });
      const del = document.createElement('button');
      del.textContent = '✕';
      del.className = 'absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white/80 text-[10px] hidden group-hover:flex items-center justify-center hover:bg-red-500';
      del.title = '刪除這張';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch(`${API_ORIGIN}/api/my-glasses/${item.id}`, { method: 'DELETE', headers: myGlassesAuth() });
        loadMyCollection();
      });
      cell.append(img, del);
      myCollectionGrid.appendChild(cell);
    });
  } catch (e) {
    myCollectionGrid.innerHTML = '<p class="col-span-3 text-center text-red-400/70 text-xs py-8">載入失敗</p>';
    console.warn('[my-collection] 載入失敗:', e);
  }
}

btnMyCollection?.addEventListener('click', () => { myCollectionModal?.classList.remove('hidden'); loadMyCollection(); });
myCollectionClose?.addEventListener('click', () => myCollectionModal?.classList.add('hidden'));
myCollectionClear?.addEventListener('click', async () => {
  if (!confirm('確定要清除「我的眼鏡」全部照片嗎？此動作無法復原。')) return;
  await fetch(`${API_ORIGIN}/api/my-glasses`, { method: 'DELETE', headers: myGlassesAuth() });
  loadMyCollection();
});

// ── 拍眼鏡模式：隱藏上方款式縮圖列，讓畫面乾淨 ──────────
const btnCleanMode = document.getElementById('btn-clean-mode');
const modeSelector = document.getElementById('mode-selector');
let cleanMode = false;
btnCleanMode?.addEventListener('click', () => {
  cleanMode = !cleanMode;
  if (modeSelector) modeSelector.style.display = cleanMode ? 'none' : '';
  btnCleanMode.classList.toggle('bg-amber-500', cleanMode);
  btnCleanMode.classList.toggle('text-black', cleanMode);
  btnCleanMode.classList.toggle('bg-white/10', !cleanMode);
  btnCleanMode.title = cleanMode ? '結束拍眼鏡模式（顯示款式列）' : '拍眼鏡模式（隱藏款式列，畫面乾淨）';
});

// ── 儲存試戴照：合成 鏡頭 + 鏡片 + 眼鏡 三層 → 下載 ──────────
const btnSaveShot = document.getElementById('btn-save-shot');

// 鏡頭以 object-cover + 鏡像 畫到輸出畫布（對齊使用者看到的）
function drawVideoCover(ctx: CanvasRenderingContext2D, src: HTMLVideoElement, dw: number, dh: number) {
  const sw = src.videoWidth || dw, sh = src.videoHeight || dh;
  const scale = Math.max(dw / sw, dh / sh);
  const cw = sw * scale, ch = sh * scale;
  const dx = (dw - cw) / 2, dy = (dh - ch) / 2;
  ctx.save();
  ctx.translate(dw, 0); ctx.scale(-1, 1);
  ctx.drawImage(src, dx, dy, cw, ch);
  ctx.restore();
}

btnSaveShot?.addEventListener('click', () => {
  const w = video.clientWidth || video.videoWidth;
  const h = video.clientHeight || video.videoHeight;
  if (!w || !h) { addChatMessage('⚠️ 畫面還沒準備好，請稍候再試。', 'ai'); return; }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  // 1) 鏡頭（鏡像 + cover）
  drawVideoCover(ctx, video, w, h);
  // 2) 鏡片 canvas（鏡像，stretch）
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.drawImage(canvas, 0, 0, w, h); ctx.restore();
  // 3) 眼鏡 WebGL canvas（不鏡像）
  ctx.drawImage(glasses3DCanvas, 0, 0, w, h);
  // 下載
  out.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `我的試戴.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    addChatMessage('📸 已儲存試戴照（已下載到你的裝置）！', 'ai');
  }, 'image/png');
});

// 處理每個檔案選擇器
document.querySelectorAll<HTMLInputElement>('.glasses-file-input').forEach((input) => {
  input.addEventListener('change', () => {
    const file    = input.files?.[0];
    const style   = input.dataset.style!;
    const angle   = input.dataset.angle as GlassesAngle;
    const preview = document.getElementById(`preview-${style}-${angle}`) as HTMLImageElement | null;

    if (!file) return;
    const url = URL.createObjectURL(file);
    uploadGlassesImage(style, angle, url);
    if (preview) { preview.src = url; preview.classList.remove('hidden'); }

    // 顯示成功標記
    const label = input.closest('label');
    if (label) label.classList.add('border-green-500/60', 'bg-green-500/10');
  });
});

// ── Glasses catalog from API ──────────────────────────────────────────────

interface GlassesCatalogItem {
  id: string;
  name: string;
  image_url: string;
  frame_shape: string;
  suitable_face_types: string[];
  temple_color?: string;
}

// HTML data-shape → English FaceShape used in DB
const SHAPE_MAP: Record<string, string> = {
  oval: 'oval', heart: 'heart', oblong: 'long',
  square: 'square', round: 'round', diamond: 'oval',
};

let catalogItems: GlassesCatalogItem[] = [];

function buildGlassesButtons(items: { id: string; name: string; image_url: string; temple_color?: string }[]) {
  const container = document.getElementById('glasses-options')!;
  container.innerHTML = '';
  items.forEach((item, idx) => {
    registerGlassesUrl(item.id, resolveUrl(item.image_url));
    const btn = document.createElement('button');
    btn.dataset.glasses = item.id;
    btn.className = `glasses-btn shrink-0 px-2 py-1 rounded-lg text-xs border transition flex flex-col items-center gap-1 ${idx === 0 ? 'active border-white/60 bg-white/20' : 'border-transparent bg-white/5'}`;
    btn.title = item.name;
    const thumb = document.createElement('img');
    thumb.src = resolveUrl(item.image_url);
    thumb.className = 'w-12 h-8 object-contain';
    thumb.alt = item.name;
    const label = document.createElement('span');
    label.textContent = item.name.replace(/三麗鷗夢幻隊[▪︎\s]+/, '').replace(/｜.*$/, '').trim().slice(0, 5);
    btn.append(thumb, label);
    btn.addEventListener('click', () => {
      document.querySelectorAll('.glasses-btn').forEach((b) => {
        b.classList.remove('active', 'border-white/60', 'bg-white/20');
        b.classList.add('border-transparent', 'bg-white/5');
      });
      btn.classList.add('active', 'border-white/60', 'bg-white/20');
      btn.classList.remove('border-transparent', 'bg-white/5');
      usingCatalogGlasses = true;
      glasses3DScene.setCatalogTexture(resolveUrl(item.image_url));
      glasses3DScene.setColor(item.temple_color ? parseInt(item.temple_color.replace('#', ''), 16) : 0x111418);
    });
    container.appendChild(btn);
  });
  if (items.length > 0) {
    usingCatalogGlasses = true;
    glasses3DScene.setCatalogTexture(resolveUrl(items[0].image_url));
    const tc0 = items[0].temple_color;
    glasses3DScene.setColor(tc0 ? parseInt(tc0.replace('#', ''), 16) : 0x111418);
  }
  console.log(`[glasses] loaded ${items.length} items`);
}

async function loadGlassesCatalog() {
  const token = localStorage.getItem('edumind_token');
  console.log('[glasses] token:', token ? 'found' : 'missing');
  if (!token) return;

  try {
    const res = await fetch(`${API_ORIGIN}/api/glasses?item_type=glasses`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log('[glasses] API status:', res.status);
    if (!res.ok) return;
    const data = await res.json();
    const items: GlassesCatalogItem[] = data.data ?? data.glasses ?? [];
    console.log('[glasses] items count:', items.length);
    if (Array.isArray(items) && items.length > 0) {
      catalogItems = items;
      buildGlassesButtons(items);
    }
  } catch (e) {
    console.warn('[glasses] API failed:', e);
  }
}

function showFaceGlasses(htmlShape: string) {
  const faceShape = SHAPE_MAP[htmlShape] ?? htmlShape;
  const matched = catalogItems.filter(g =>
    g.suitable_face_types.includes(faceShape)
  );
  const panel = document.getElementById('face-glasses-panel')!;
  const grid  = document.getElementById('face-glasses-grid')!;
  const count = document.getElementById('face-glasses-count')!;

  panel.classList.remove('hidden');
  count.textContent = `（${matched.length} 款）`;
  grid.innerHTML = '';

  matched.forEach((item) => {
    const card = document.createElement('button');
    card.className = 'bg-white/5 hover:bg-white/15 border border-white/10 hover:border-indigo-400/60 rounded-lg p-1 flex flex-col items-center gap-0.5 transition';
    card.title = item.name;

    const thumb = document.createElement('img');
    thumb.src = resolveUrl(item.image_url);
    thumb.className = 'w-full h-10 object-contain bg-white rounded';
    thumb.alt = item.name;

    const label = document.createElement('span');
    label.className = 'text-[9px] text-white/60 text-center leading-tight line-clamp-1 w-full';
    label.textContent = item.name.replace(/三麗鷗夢幻隊[▪︎\s]+/, '').replace(/｜.*$/, '').trim();

    card.append(thumb, label);
    card.addEventListener('click', () => {
      usingCatalogGlasses = true;
      renderer.setMode('glasses');
      glasses3DScene.setCatalogTexture(resolveUrl(item.image_url));
      glasses3DScene.setColor(item.temple_color ? parseInt(item.temple_color.replace('#', ''), 16) : 0x111418);
      modeGlasses.click();
      // highlight in top bar if present
      document.querySelectorAll('.glasses-btn').forEach(b => {
        b.classList.remove('active', 'border-white/60', 'bg-white/20');
        b.classList.add('border-transparent', 'bg-white/5');
      });
      document.querySelector(`.glasses-btn[data-glasses="${item.id}"]`)
        ?.classList.add('active', 'border-white/60', 'bg-white/20');
    });

    grid.appendChild(card);
  });
}

// Start
init();
loadGlassesCatalog();
