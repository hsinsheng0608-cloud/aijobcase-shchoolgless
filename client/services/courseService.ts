
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
