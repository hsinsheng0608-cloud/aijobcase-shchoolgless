
import React, { useState, useEffect, useRef } from 'react';
import { UserRole } from '../types';
import { IconUser, IconZap } from './Icons';
import { getAuthHeaders, authService } from '../services/authService';
import { API_BASE } from '../apiBase';

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pwd = '';
  for (let i = 0; i < length; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

interface CreatedAccount {
  studentId: string;
  name: string;
  password: string;
  role: string;
}

const AdminUserManagement: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [createdAccounts, setCreatedAccounts] = useState<CreatedAccount[]>([]);
  const [errors, setErrors] = useState<Array<{ studentId: string; error: string }>>([]);
  const [message, setMessage] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ studentId: '', name: '', password: '', role: 'STUDENT' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUser = authService.getCurrentUser();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  useEffect(() => {
    fetchUsers();
  }, []);

  function fetchUsers() {
    fetch(`${API_BASE}/users`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setUsers(d.data); })
      .catch(console.error);
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('');
    setCreatedAccounts([]);
    setErrors([]);

    try {
      // Dynamic import xlsx
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) {
        setMessage('Excel 檔案中沒有資料');
        setUploading(false);
        return;
      }

      // Map columns: look for 學號/studentId and 姓名/name
      const newUsers: CreatedAccount[] = rows.map((row) => {
        const studentId = String(row['學號'] || row['studentId'] || row['student_id'] || row['帳號'] || '').trim();
        const name = String(row['姓名'] || row['name'] || row['名字'] || '').trim();
        const password = generatePassword();
        return { studentId, name: name || studentId, password, role: 'STUDENT' };
      }).filter(u => u.studentId);

      if (newUsers.length === 0) {
        setMessage('找不到「學號」欄位，請確認 Excel 含有「學號」和「姓名」欄位');
        setUploading(false);
        return;
      }

      if (newUsers.length > 200) {
        setMessage('單次最多建立 200 個帳號');
        setUploading(false);
        return;
      }

      // Call API
      const result = await authService.batchCreateUsers(
        newUsers.map(u => ({ studentId: u.studentId, name: u.name, password: u.password }))
      );

      // Map passwords back to created accounts
      const created: CreatedAccount[] = result.created.map((c: any) => {
        const match = newUsers.find(u => u.studentId === c.student_id);
        return {
          studentId: c.student_id,
          name: c.name,
          password: match?.password || '(已建立)',
          role: c.role,
        };
      });

      setCreatedAccounts(created);
      setErrors(result.errors || []);
      setMessage(`成功建立 ${result.createdCount} 個帳號` + (result.errorCount > 0 ? `，${result.errorCount} 個失敗` : ''));
      fetchUsers();
    } catch (err: any) {
      setMessage(`上傳失敗：${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function downloadAccountList() {
    if (createdAccounts.length === 0) return;
    const header = '學號,姓名,密碼,角色\n';
    const csv = header + createdAccounts.map(a => `${a.studentId},${a.name},${a.password},${a.role}`).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `學生帳號_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateOne(e: React.FormEvent) {
    e.preventDefault();
    if (!newUser.studentId.trim() || !newUser.password.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API_BASE}/auth/batch-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ users: [{
          studentId: newUser.studentId.trim(),
          name: newUser.name.trim() || newUser.studentId.trim(),
          password: newUser.password,
          role: newUser.role,
        }] }),
      });
      const d = await r.json();
      if (d.success && d.data?.created?.length) {
        setMessage(`✅ 已建立 ${d.data.created[0].student_id}（${newUser.role === 'ADMIN' ? '管理員' : newUser.role === 'TEACHER' ? '教師' : '學生'}）`);
        setNewUser({ studentId: '', name: '', password: '', role: 'STUDENT' });
        setShowCreate(false);
        fetchUsers();
      } else {
        const err = d.data?.errors?.[0]?.error || d.error || '建立失敗';
        alert('建立失敗: ' + err);
      }
    } catch { alert('網路錯誤'); }
    finally { setCreating(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800">用戶管理</h2>
          <p className="text-sm text-slate-500">管理系統用戶帳號</p>
        </div>{/* header-actions 之後接 */}
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={() => { setShowCreate(!showCreate); setShowUpload(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            新增用戶
          </button>
          <button
            onClick={() => { setShowUpload(!showUpload); setShowCreate(false); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            批次建立學生帳號
          </button>
        </div>
      </div>

      {message && !showUpload && (
        <div className="p-3 rounded-xl text-sm font-medium bg-green-50 text-green-800 border border-green-200">{message}</div>
      )}
      {/* 新增單一用戶（管理員可選任何身分；老師只能建學生） */}
      {showCreate && (
        <form onSubmit={handleCreateOne} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm">新增用戶</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={newUser.studentId} onChange={e => setNewUser(v => ({ ...v, studentId: e.target.value }))}
              placeholder="學號 / 帳號（必填）" required
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <input value={newUser.name} onChange={e => setNewUser(v => ({ ...v, name: e.target.value }))}
              placeholder="姓名（選填）"
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <input value={newUser.password} onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))}
              placeholder="密碼（必填）" required
              className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <select value={newUser.role} onChange={e => setNewUser(v => ({ ...v, role: e.target.value }))}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
              <option value="STUDENT">學生</option>
              {currentUser?.role === UserRole.ADMIN && <option value="TEACHER">教師</option>}
              {currentUser?.role === UserRole.ADMIN && <option value="ADMIN">管理員</option>}
            </select>
          </div>
          {currentUser?.role !== UserRole.ADMIN && (
            <p className="text-xs text-slate-400">教師身分只能建立學生帳號；建立教師/管理員請用 admin 登入。</p>
          )}
          <button type="submit" disabled={creating}
            className="bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
            {creating ? '建立中…' : '建立帳號'}
          </button>
        </form>
      )}

      {/* Excel Upload Panel */}
      {showUpload && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <IconZap className="w-5 h-5 text-indigo-600" />
            上傳 Excel 批次建立學生帳號
          </h3>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
            <p className="text-xs text-indigo-800 leading-relaxed">
              Excel 檔案須包含以下欄位：<strong>學號</strong>（必填）、<strong>姓名</strong>（選填，未填則以學號代替）。
              系統會自動產生密碼，建立完成後可下載帳號密碼清單。
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer transition ${
                uploading ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                {uploading ? '處理中...' : '選擇 Excel 檔案'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleExcelUpload}
                  disabled={uploading}
                />
              </label>
              <span className="text-[10px] text-slate-400">支援 .xlsx / .xls / .csv</span>
            </div>
          </div>

          {/* Result Message */}
          {message && (
            <div className={`p-3 rounded-xl text-sm font-medium ${
              errors.length > 0 ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-green-50 text-green-800 border border-green-200'
            }`}>
              {message}
            </div>
          )}

          {/* Error List */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs font-bold text-red-700 mb-1">失敗項目：</p>
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600">{e.studentId}：{e.error}</p>
              ))}
            </div>
          )}

          {/* Created Accounts Table */}
          {createdAccounts.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-700">已建立帳號（請下載保存密碼）</h4>
                <button
                  onClick={downloadAccountList}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold hover:bg-green-700 transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  下載帳號密碼 CSV
                </button>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase font-black sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">學號</th>
                      <th className="px-4 py-2 text-left">姓名</th>
                      <th className="px-4 py-2 text-left">密碼</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {createdAccounts.map((a, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2 font-medium text-slate-700">{a.studentId}</td>
                        <td className="px-4 py-2 text-slate-600">{a.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-indigo-600">{a.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 用戶清單：每位一列，點擊向下展開詳細資料（手機/桌機通用） */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
        {users.map((u) => {
          const open = expandedId === u.id;
          return (
            <div key={u.id}>
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : u.id)}
                className={`w-full flex items-center gap-3 px-4 md:px-6 py-3.5 text-left transition ${open ? 'bg-indigo-50/50' : 'hover:bg-slate-50/60'}`}
              >
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <IconUser className="w-4 h-4 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">{u.name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.student_id}</p>
                </div>
                <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${
                  u.role === 'ADMIN' ? 'bg-purple-100 text-purple-600' :
                  u.role === 'TEACHER' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                }`}>{u.role === 'ADMIN' ? '管理員' : u.role === 'TEACHER' ? '教師' : '學生'}</span>
                <svg className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {open && (
                <div className="px-4 md:px-6 pb-4 pt-1 bg-indigo-50/30">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">學號 / 帳號</p>
                      <p className="text-slate-700 font-mono">{u.student_id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">狀態</p>
                      <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
                      }`}>{u.status === 'ACTIVE' ? '啟用' : '停用'}</span>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">角色</p>
                      <p className="text-slate-700">{u.role === 'ADMIN' ? '管理員' : u.role === 'TEACHER' ? '教師' : '學生'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-black text-slate-400 tracking-widest">建立時間</p>
                      <p className="text-slate-700">{u.created_at ? new Date(u.created_at).toLocaleDateString('zh-TW') : '—'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {users.length === 0 && (
          <div className="px-6 py-12 text-center text-slate-400">尚無用戶資料</div>
        )}
      </div>
    </div>
  );
};

export default AdminUserManagement;
