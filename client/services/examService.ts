
import { getAuthHeaders } from './authService';
import { ExamQuestion } from '../types';

import { API_BASE } from '../apiBase';

/**
 * 上傳 Excel 考題
 */
export async function uploadExam(courseId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('courseId', courseId);

  const res = await fetch(`${API_BASE}/exams/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * AI 自動出題
 */
export async function generateQuestions(params: {
  courseId: string;
  materialId?: string;
  count?: number;
  difficulty?: string;
  questionTypes?: string[];
}): Promise<{ generatedCount: number; questions: ExamQuestion[] }> {
  const res = await fetch(`${API_BASE}/exams/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 取得題目
 */
export async function getQuestions(courseId: string, filters?: {
  status?: string;
  difficulty?: number;
  type?: string;
  limit?: number;
}): Promise<ExamQuestion[]> {
  const params = new URLSearchParams({ courseId });
  if (filters?.status) params.set('status', filters.status);
  if (filters?.difficulty) params.set('difficulty', String(filters.difficulty));
  if (filters?.type) params.set('type', filters.type);
  if (filters?.limit) params.set('limit', String(filters.limit));

  const res = await fetch(`${API_BASE}/exams/questions?${params}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 學生作答
 */
export async function submitAnswer(questionId: string, studentAnswer: string) {
  const res = await fetch(`${API_BASE}/exams/attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ questionId, studentAnswer }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 編輯題目（含審核）
 */
export async function updateQuestion(questionId: string, updates: Partial<ExamQuestion>) {
  const res = await fetch(`${API_BASE}/exams/questions/${questionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 刪除題目
 */
export async function deleteQuestion(questionId: string) {
  const res = await fetch(`${API_BASE}/exams/questions/${questionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * 取得成績
 */
export async function getResults(courseId: string) {
  const res = await fetch(`${API_BASE}/exams/results?courseId=${courseId}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}
