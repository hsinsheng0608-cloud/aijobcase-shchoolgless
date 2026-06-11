/**
 * guidance-controller.ts - Step-by-step contact lens fitting procedure
 */

export interface Step {
  id: number;
  title: string;
  instruction: string;
  autoDetect?: 'eye-open' | 'blink';
  status: 'pending' | 'current' | 'completed';
}

// 隱形眼鏡配戴流程（規格項次 2）
const CONTACT_STEPS: Omit<Step, 'status'>[] = [
  { id: 1, title: '清洗雙手', instruction: '請先用肥皂清洗雙手，確保手部乾淨無油脂。' },
  { id: 2, title: '取出鏡片', instruction: '將隱形眼鏡從保存盒中取出，放在指尖上檢查正反面。' },
  { id: 3, title: '置於指尖', instruction: '將鏡片放在食指指尖上，確認鏡片呈碗狀（邊緣向上）。' },
  { id: 4, title: '張大眼睛', instruction: '用另一隻手撐開上下眼瞼，將眼睛張大。', autoDetect: 'eye-open' },
  { id: 5, title: '戴入鏡片', instruction: '將鏡片輕輕貼合到眼球上，確認鏡片居中覆蓋瞳孔。' },
  { id: 6, title: '眨眼確認', instruction: '輕輕眨眼數次，確認鏡片位置正確、視線清晰。', autoDetect: 'blink' },
];

// 眼鏡配戴與調整流程（規格項次 1）
const GLASSES_STEPS: Omit<Step, 'status'>[] = [
  { id: 1, title: '檢查鏡框', instruction: '檢查鏡框是否變形、鏡片有無刮痕，並用拭鏡布擦拭乾淨。' },
  { id: 2, title: '雙手取鏡', instruction: '雙手握住兩側鏡腳取出眼鏡，避免單手拉扯造成鏡框變形。' },
  { id: 3, title: '配戴上臉', instruction: '雙手平行將鏡腳滑入耳上，鏡框置於鼻樑正中。可在畫面選擇款式並用滑桿調整大小、高低。' },
  { id: 4, title: '確認位置', instruction: '看畫面確認：瞳孔位於鏡片中心、鏡框水平不歪斜、與眉毛距離適中。', autoDetect: 'eye-open' },
  { id: 5, title: '檢查貼合', instruction: '確認鼻墊貼合鼻樑、鏡腳鬆緊適中，低頭時眼鏡不滑落。' },
  { id: 6, title: '視線確認', instruction: '眨眼並左右轉動視線，確認視野清晰、無暈眩或變形感。', autoDetect: 'blink' },
];

const STEPS_TEMPLATE = CONTACT_STEPS;

// Eye aperture thresholds
const EYE_OPEN_THRESHOLD = 0.35;    // aperture ratio > this = eye is wide open
const BLINK_THRESHOLD = 0.15;       // aperture ratio < this = blink detected
const BLINK_CONFIRM_FRAMES = 3;     // need N blinks to confirm

type EventCallback = (type: string, stepId: number) => void;

export class GuidanceController {
  private steps: Step[];
  private template: Omit<Step, 'status'>[] = CONTACT_STEPS;
  private currentIndex = -1; // -1 = not started
  private onEvent: EventCallback;
  private blinkCount = 0;
  private wasBlinking = false;
  private eyeOpenFrames = 0;
  private autoDetectEnabled = true;

  constructor(onEvent: EventCallback) {
    this.steps = STEPS_TEMPLATE.map((s) => ({ ...s, status: 'pending' as const }));
    this.onEvent = onEvent;
  }

  /** 依試戴模式載入對應流程（contact=隱形眼鏡、glasses=眼鏡），會重置進度 */
  setMode(mode: 'contact' | 'glasses') {
    this.template = mode === 'glasses' ? GLASSES_STEPS : CONTACT_STEPS;
    this.steps = this.template.map((s) => ({ ...s, status: 'pending' as const }));
    this.currentIndex = -1;
    this.blinkCount = 0;
    this.wasBlinking = false;
    this.eyeOpenFrames = 0;
  }

  getSteps(): Step[] {
    return this.steps;
  }

  getCurrentStep(): Step | null {
    return this.currentIndex >= 0 ? this.steps[this.currentIndex] : null;
  }

  getCompletedCount(): number {
    return this.steps.filter((s) => s.status === 'completed').length;
  }

  isCompleted(): boolean {
    return this.steps.every((s) => s.status === 'completed');
  }

  start() {
    this.currentIndex = 0;
    this.steps[0].status = 'current';
    this.onEvent('STEP_START', 1);
  }

  reset() {
    this.currentIndex = -1;
    this.blinkCount = 0;
    this.wasBlinking = false;
    this.eyeOpenFrames = 0;
    this.steps = this.template.map((s) => ({ ...s, status: 'pending' as const }));
  }

  confirmCurrentStep() {
    if (this.currentIndex < 0 || this.currentIndex >= this.steps.length) return;
    this.steps[this.currentIndex].status = 'completed';
    this.onEvent('STEP_COMPLETE', this.steps[this.currentIndex].id);

    this.currentIndex++;
    if (this.currentIndex < this.steps.length) {
      this.steps[this.currentIndex].status = 'current';
      this.onEvent('STEP_START', this.steps[this.currentIndex].id);
      // Reset detection state
      this.blinkCount = 0;
      this.wasBlinking = false;
      this.eyeOpenFrames = 0;
    }
  }

  /**
   * Called each frame with current eye aperture for auto-detection
   */
  updateEyeState(aperture: number) {
    if (!this.autoDetectEnabled || this.currentIndex < 0) return;

    const step = this.steps[this.currentIndex];
    if (!step?.autoDetect) return;

    if (step.autoDetect === 'eye-open') {
      if (aperture > EYE_OPEN_THRESHOLD) {
        this.eyeOpenFrames++;
        if (this.eyeOpenFrames > 15) { // ~0.5s at 30fps
          this.confirmCurrentStep();
        }
      } else {
        this.eyeOpenFrames = Math.max(0, this.eyeOpenFrames - 1);
      }
    }

    if (step.autoDetect === 'blink') {
      const isBlinking = aperture < BLINK_THRESHOLD;
      if (isBlinking && !this.wasBlinking) {
        this.blinkCount++;
        if (this.blinkCount >= BLINK_CONFIRM_FRAMES) {
          this.confirmCurrentStep();
        }
      }
      this.wasBlinking = isBlinking;
    }
  }

  renderStepsList(container: HTMLElement) {
    container.innerHTML = '';
    for (const step of this.steps) {
      const div = document.createElement('div');
      div.className = `step-item ${step.status}`;

      let icon = '';
      if (step.status === 'completed') {
        icon = '<svg class="step-icon text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>';
      } else if (step.status === 'current') {
        icon = '<svg class="step-icon text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';
      } else {
        icon = '<svg class="step-icon text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="3"/></svg>';
      }

      div.innerHTML = `
        ${icon}
        <div>
          <div class="text-xs font-medium ${step.status === 'current' ? 'text-white' : 'text-white/70'}">${step.title}</div>
          ${step.status === 'current' ? `<div class="text-xs text-white/50 mt-0.5">${step.instruction}</div>` : ''}
        </div>
      `;

      if (step.status === 'current' && !step.autoDetect) {
        const btn = document.createElement('button');
        btn.className = 'ml-auto text-xs bg-indigo-500/50 hover:bg-indigo-500/70 px-2 py-1 rounded transition flex-shrink-0';
        btn.textContent = '完成';
        btn.onclick = () => this.confirmCurrentStep();
        div.appendChild(btn);
      }

      container.appendChild(div);
    }
  }
}
