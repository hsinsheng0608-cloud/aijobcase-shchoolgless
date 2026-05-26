/**
 * session-recorder.ts - Records AR practice sessions to backend
 */

const API_ORIGIN = import.meta.env.VITE_API_URL || '';

export interface OpticsSnapshot {
  pdMm: number;
  pdLeftMm: number;
  pdRightMm: number;
  irisLMm: number;
  irisRMm: number;
  eyeHeightDiffMm: number;
  frameTiltDeg: number;
  recommendedFrameWidthMm: number;
}

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('edumind_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export class SessionRecorder {
  private sessionId: string | null = null;
  private startTime: number = 0;

  async startSession(): Promise<string | null> {
    try {
      const res = await fetch(`${API_ORIGIN}/api/ar-practice/sessions`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      this.sessionId = data.data?.id || null;
      this.startTime = Date.now();
      return this.sessionId;
    } catch {
      return null;
    }
  }

  async logEvent(eventType: string, stepNumber?: number, metadata?: any) {
    if (!this.sessionId) return;
    try {
      await fetch(`${API_ORIGIN}/api/ar-practice/sessions/${this.sessionId}/events`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ eventType, stepNumber, metadata }),
      });
    } catch {
      // silent fail
    }
  }

  async endSession(
    stepsCompleted: number,
    status: 'COMPLETED' | 'ABANDONED' = 'COMPLETED',
    optics?: OpticsSnapshot,
  ) {
    if (!this.sessionId) return;
    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    try {
      await fetch(`${API_ORIGIN}/api/ar-practice/sessions/${this.sessionId}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({
          status,
          stepsCompleted,
          durationSeconds: duration,
          ...(optics ? {
            pdMm: optics.pdMm,
            pdLeftMm: optics.pdLeftMm,
            pdRightMm: optics.pdRightMm,
            irisLMm: optics.irisLMm,
            irisRMm: optics.irisRMm,
            eyeHeightDiffMm: optics.eyeHeightDiffMm,
            frameTiltDeg: optics.frameTiltDeg,
            recommendedFrameWidthMm: optics.recommendedFrameWidthMm,
          } : {}),
        }),
      });
    } catch {
      // silent fail
    }
    this.sessionId = null;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getElapsedSeconds(): number {
    if (!this.startTime) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}
