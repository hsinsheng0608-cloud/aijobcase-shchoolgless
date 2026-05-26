/**
 * ar-chat.ts - AI chat panel for AR page (SSE streaming)
 * Reuses the same backend API as the main system's chatService
 */

const API_ORIGIN = import.meta.env.VITE_API_URL || '';

function getToken(): string | null {
  return localStorage.getItem('edumind_token');
}

function getHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function sendChatMessage(
  message: string,
  courseId: string | null,
  onToken: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  arContext?: string
) {
  try {
    const body: any = { message, mode: 'qa' };
    if (courseId) body.courseId = courseId;
    if (arContext) body.arContext = arContext;

    const res = await fetch(`${API_ORIGIN}/api/chat/stream`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      onError(`API 錯誤: ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError('無法讀取串流'); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'token' && parsed.text) {
            onToken(parsed.text);
          } else if (parsed.type === 'done') {
            onDone();
            return;
          }
        } catch {
          // non-JSON line, skip
        }
      }
    }
    onDone();
  } catch (err: any) {
    onError(err.message || '連線失敗');
  }
}

export function getUserInfo(): { name: string; role: string } | null {
  try {
    const saved = localStorage.getItem('edumind_user');
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}
