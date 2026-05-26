
import { getAuthHeaders } from './authService';

import { API_BASE } from '../apiBase';

export interface StreamEvent {
  type: 'sources' | 'token' | 'done' | 'error';
  text?: string;
  data?: any;
  message?: string;
}

/**
 * SSE 串流聊天 - 讀取後端 Gemini 串流回覆
 */
export async function* chatStream(message: string, courseId: string): AsyncGenerator<StreamEvent> {
  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ message, courseId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '連線失敗' }));
    yield { type: 'error', message: err.error || `HTTP ${response.status}` };
    return;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // 解析 SSE 事件 (data: {...}\n\n)
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const match = line.match(/^data:\s*(.*)/);
      if (match) {
        try {
          const event: StreamEvent = JSON.parse(match[1]);
          yield event;
        } catch {
          // 忽略非 JSON 行
        }
      }
    }
  }
}

/**
 * 取得聊天歷史
 */
export async function getChatHistory(courseId: string, limit = 50) {
  const res = await fetch(`${API_BASE}/chat/history?courseId=${courseId}&limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
