
import { getAuthHeaders } from './authService';
import { Course } from '../types';

import { API_BASE } from '../apiBase';

export async function getCourses(): Promise<Course[]> {
  const res = await fetch(`${API_BASE}/courses`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function createCourse(name: string, description?: string): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ name, description }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function updateCourse(id: string, updates: Partial<Course>): Promise<Course> {
  const res = await fetch(`${API_BASE}/courses/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function enrollStudents(courseId: string, studentIds: string[]) {
  const res = await fetch(`${API_BASE}/courses/${courseId}/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ studentIds }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

export async function getCourseStudents(courseId: string) {
  const res = await fetch(`${API_BASE}/courses/${courseId}/students`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/** 學生瀏覽全部開放課程（含 joined 旗標） */
export async function getAllCourses(): Promise<Course[]> {
  const res = await fetch(`${API_BASE}/courses/all`, { headers: getAuthHeaders() });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/** 學生自助加入課程 */
export async function joinCourse(courseId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${courseId}/join`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/** 刪除課程（老師限自己的課；教材與選課紀錄連動刪除） */
export async function deleteCourse(courseId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/courses/${courseId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/** AI 讀本課程教材生成課後問答（寫入課業問答） */
export async function generateCourseQa(courseId: string, count = 10): Promise<number> {
  const res = await fetch(`${API_BASE}/knowledge/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ courseId, count }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data.length;
}
