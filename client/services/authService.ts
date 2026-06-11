
import { User, UserRole } from '../types';

import { API_BASE } from '../apiBase';

export class AuthService {
  private currentUser: User | null = null;

  constructor() {
    const saved = localStorage.getItem('edumind_user');
    if (saved) {
      try {
        this.currentUser = JSON.parse(saved);
      } catch {
        localStorage.removeItem('edumind_user');
      }
    }
  }

  getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * 驗證 localStorage 裡的 token 是否仍有效（JWT 24h 過期）。
   * 失效就清掉 session 回傳 false → App 導回登入頁，
   * 避免「看起來登入了但所有 API 默默 401、儀表板永遠載入中」。
   */
  async validateSession(): Promise<boolean> {
    if (!this.currentUser || !localStorage.getItem('edumind_token')) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) { this.logout(); return false; }
      return true;  // 200 或暫時性錯誤（後端冷啟動）都先放行
    } catch {
      return true;  // 離線/網路錯誤不強制登出
    }
  }

  async login(studentId: string, password: string): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || '登入失敗');

    const { token, user } = data.data;
    localStorage.setItem('edumind_token', token);

    const userObj: User = {
      id: user.id,
      studentId: user.studentId,
      name: user.name,
      role: user.role as UserRole,
      status: 'ACTIVE',
    };
    this.setSession(userObj);
    return userObj;
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const res = await fetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  }

  async batchCreateUsers(users: Array<{ studentId: string; name: string; password: string; role?: string }>): Promise<any> {
    const res = await fetch(`${API_BASE}/auth/batch-create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ users }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data;
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('edumind_token');
    localStorage.removeItem('edumind_user');
  }

  private setSession(user: User) {
    this.currentUser = user;
    localStorage.setItem('edumind_user', JSON.stringify(user));
  }
}

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('edumind_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const authService = new AuthService();
