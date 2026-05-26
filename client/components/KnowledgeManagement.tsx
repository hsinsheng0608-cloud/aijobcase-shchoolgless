import React, { useState, useEffect, useCallback } from 'react';
import { getAuthHeaders } from '../services/authService';

const ORIGIN = import.meta.env.VITE_API_URL || '';

interface QA {
  id: string;
  course_id: string | null;
  category: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

interface Course { id: string; name: string; }

const api = (path: string, opts?: RequestInit) =>
  fetch(`${ORIGIN}${path}`, { headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }, ...opts });

const KnowledgeManagement: React.FC = () => {
  const [items, setItems] = useState<QA[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [filterCourse, setFilterCourse] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<QA | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ course_id: '', category: '一般', question: '', answer: '' });
  const [error, setError] = useState('');

  const loadCourses = useCallback(async () => {
    const r = await api('/api/courses');
    const d = await r.json();
    setCourses(d.data ?? d.courses ?? []);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCourse)   params.set('course_id', filterCourse);
    if (filterCategory) params.set('category', filterCategory);
    const r = await api(`/api/knowledge?${params}`);
    const d = await r.json();
    setItems(d.data ?? []);
    setLoading(false);
  }, [filterCourse, filterCategory]);

  useEffect(() => { loadCourses(); }, [loadCourses]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const openNew = () => {
    setEditItem(null);
    setForm({ course_id: filterCourse || '', category: '一般', question: '', answer: '' });
    setError('');
    setShowForm(true);
  };

  const openEdit = (item: QA) => {
    setEditItem(item);
    setForm({ course_id: item.course_id || '', category: item.category, question: item.question, answer: item.answer });
    setError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) { setError('問題和答案為必填'); return; }
    setSaving(true);
    setError('');
    try {
      const body = JSON.stringify({ ...form, course_id: form.course_id || null });
      const r = editItem
        ? await api(`/api/knowledge/${editItem.id}`, { method: 'PUT', body })
        : await api('/api/knowledge', { method: 'POST', body });
      const d = await r.json();
      if (!d.success) { setError(d.error || '儲存失敗'); return; }
      setShowForm(false);
      loadItems();
    } catch {
      setError('網路錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定刪除這筆問答？')) return;
    await api(`/api/knowledge/${id}`, { method: 'DELETE' });
    loadItems();
  };

  const categories = Array.from(new Set(items.map(i => i.category))).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">課業問答管理</h2>
          <p className="text-sm text-slate-500 mt-1">新增知識庫問答，學生提問時系統自動比對</p>
        </div>
        <button onClick={openNew}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition">
          + 新增問答
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={filterCourse} onChange={e => setFilterCourse(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">全部課程</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">全部分類</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-sm text-slate-400 self-center">共 {items.length} 筆</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (

          <div className="py-16 text-center text-slate-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <p className="text-lg mb-2">尚無問答資料</p>
            <p className="text-sm">點擊「新增問答」開始建立知識庫</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium w-24 hidden md:table-cell">分類</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">問題</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium hidden lg:table-cell">答案（預覽）</th>
                <th className="px-4 py-3 text-slate-500 font-medium w-20">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap">{item.category}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="md:hidden inline-block bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium mb-1">{item.category}</span>
                    <p className="text-slate-700 font-medium leading-snug">{item.question}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                    {item.answer.length > 80 ? item.answer.slice(0, 80) + '…' : item.answer}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5 items-center">
                      <button onClick={() => openEdit(item)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">編輯</button>
                      <button onClick={() => handleDelete(item.id)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium">刪除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">{editItem ? '編輯問答' : '新增問答'}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">課程</label>
                  <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="">不限課程</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-medium block mb-1">分類</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="一般"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">問題 *</label>
                <input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
                  placeholder="輸入學生可能問到的問題..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-medium block mb-1">答案 *</label>
                <textarea value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))}
                  placeholder="輸入對應的答案..."
                  rows={5}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg transition">取消</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition disabled:opacity-50">
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeManagement;
