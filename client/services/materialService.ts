
import { getAuthHeaders } from './authService';
import { Material } from '../types';

import { API_BASE } from '../apiBase';

/**
 * 上傳教材
 */
export async function uploadMaterial(courseId: string, file: File, title?: string): Promise<{ materialId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('courseId', courseId);
  if (title) formData.append('title', title);

  const res = await fetch(`${API_BASE}/materials/upload`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: formData,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 列出課程教材
 */
export async function getMaterials(courseId: string): Promise<Material[]> {
  const res = await fetch(`${API_BASE}/materials?courseId=${courseId}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 查詢教材處理狀態
 */
export async function getMaterialStatus(materialId: string): Promise<Material> {
  const res = await fetch(`${API_BASE}/materials/${materialId}/status`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
  return data.data;
}

/**
 * 刪除教材
 */
export async function deleteMaterial(materialId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/materials/${materialId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error);
}

/**
 * 輪詢教材狀態直到完成
 */
export async function pollMaterialStatus(materialId: string, interval = 2000, maxAttempts = 30): Promise<Material> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getMaterialStatus(materialId);
    if (status.status === 'READY' || status.status === 'FAILED') {
      return status;
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('教材處理超時');
}
