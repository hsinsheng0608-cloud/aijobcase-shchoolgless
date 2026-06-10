
import React, { useState, useEffect } from 'react';
import { UserRole, Course } from '../types';
import { IconBook, IconUser, IconZap, IconGraduation, IconPlus } from './Icons';
import { getCourses, createCourse, getAllCourses, joinCourse, updateCourse, deleteCourse, generateCourseQa } from '../services/courseService';
import { uploadMaterial, pollMaterialStatus, getMaterials, moveMaterial } from '../services/materialService';
import { Material } from '../types';

interface CourseListProps {
  userRole: UserRole;
  onSelectCourse: (courseId: string) => void;
}

const CourseList: React.FC<CourseListProps> = ({ userRole, onSelectCourse }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [createHint, setCreateHint] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [manageCourse, setManageCourse] = useState<Course | null>(null);

  const isStudent = userRole === UserRole.STUDENT;

  const reload = () => {
    // 學生用「全部課程＋joined 旗標」以支援自助加入；老師/Admin 維持自己的課程
    (isStudent ? getAllCourses() : getCourses())
      .then(setCourses).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(reload, [isStudent]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const course = await createCourse(newName, newDesc);
      // 建立課程時可直接附教材：上傳到新課程，教材管理頁同步可見
      if (newFile) {
        setCreateHint('課程已建立，教材上傳並建立 AI 索引中…');
        const { materialId } = await uploadMaterial(course.id, newFile);
        const result = await pollMaterialStatus(materialId);
        if (result.status === 'READY') {
          // 新版後端會自動生成問答（result 帶 qa_status）；舊版後端則由前端補呼叫，
          // 確保「建立課程＝問答就緒」，老師不用再跳去問答管理
          if ((result as any).qa_status === undefined) {
            setCreateHint('AI 正在從教材生成課後問答…');
            try { await generateCourseQa(course.id, 8); } catch { /* 失敗不擋建立流程 */ }
          }
          setCreateHint('');
        } else {
          setCreateHint('教材處理失敗，可至教材管理重新上傳');
        }
      }
      setCourses(prev => [course, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      setNewFile(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setCreating(false);
      setCreateHint('');
    }
  };

  const handleJoin = async (course: Course) => {
    setJoiningId(course.id);
    try {
      await joinCourse(course.id);
      setCourses(prev => prev.map(c => c.id === course.id
        ? { ...c, joined: true, student_count: (Number(c.student_count) || 0) + 1 } : c));
    } catch (err: any) {
      alert('加入失敗: ' + err.message);
    } finally {
      setJoiningId(null);
    }
  };

  if (loading) return <div className="text-center py-20 text-slate-400">載入課程中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800">我的課程</h2>
          <p className="text-sm text-slate-500">選擇課程後即可使用 AI 助教</p>
        </div>
        {(userRole === UserRole.TEACHER || userRole === UserRole.ADMIN) && (
          <button onClick={() => setShowCreate(!showCreate)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:bg-indigo-700 flex items-center gap-2">
            <IconPlus className="w-4 h-4" /> 建立新課程
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="課程名稱"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" required />
          <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="課程描述（選填）"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">課程教材（選填，PDF / Word / PPT / Excel，上傳後自動建立 AI 索引，也會出現在教材管理）</label>
            <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.xls"
              onChange={e => setNewFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 file:mr-3 file:px-4 file:py-2 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-600 file:text-sm file:font-bold hover:file:bg-indigo-100 file:cursor-pointer" />
          </div>
          {createHint && <p className="text-xs text-indigo-600 animate-pulse">{createHint}</p>}
          <button type="submit" disabled={creating}
            className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold disabled:opacity-50">
            {creating ? '建立中…' : '建立'}
          </button>
        </form>
      )}

      {isStudent && courses.some(c => !c.joined) && (
        <h3 className="text-sm font-bold text-slate-500 -mb-2">我的課程（已加入）</h3>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {(isStudent ? courses.filter(c => c.joined) : courses).map((course) => (
          <div key={course.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all p-6 group">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <IconBook className="w-6 h-6" />
              </div>
              {course.student_count !== undefined && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">
                  {course.student_count} 位學生
                </span>
              )}
            </div>

            <h3 className="text-xl font-black text-slate-800 mb-1">{course.name}</h3>
            {course.teacher_name && (
              <p className="text-sm text-slate-400 font-medium mb-4 flex items-center gap-2">
                <IconUser className="w-4 h-4" /> {course.teacher_name}
              </p>
            )}
            {course.description && <p className="text-sm text-slate-500 mb-4">{course.description}</p>}

            <div className="flex gap-2">
              <button onClick={() => onSelectCourse(course.id)}
                className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-2">
                <IconZap className="w-4 h-4" /> 進入該課程
              </button>
              {!isStudent && (
                <button onClick={() => setManageCourse(course)} title="管理課程（編輯/教材/刪除）"
                  className="px-3.5 py-2.5 rounded-xl text-sm font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                  管理
                </button>
              )}
            </div>
          </div>
        ))}
        {(isStudent ? courses.filter(c => c.joined) : courses).length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <p>{isStudent ? '尚未加入任何課程，從下方「可加入的課程」開始吧！' : '尚未建立任何課程'}</p>
          </div>
        )}
      </div>

      {/* 學生：可加入的課程（自助選課） */}
      {isStudent && courses.some(c => !c.joined) && (
        <>
          <h3 className="text-sm font-bold text-slate-500 -mb-2 mt-8">可加入的課程</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
            {courses.filter(c => !c.joined).map((course) => (
              <div key={course.id} className="bg-white rounded-2xl border border-dashed border-slate-300 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-slate-100 text-slate-500 p-3 rounded-2xl">
                    <IconBook className="w-6 h-6" />
                  </div>
                  {course.student_count !== undefined && (
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded-full font-bold">
                      {course.student_count} 位學生
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800 mb-1">{course.name}</h3>
                {course.teacher_name && (
                  <p className="text-sm text-slate-400 font-medium mb-4 flex items-center gap-2">
                    <IconUser className="w-4 h-4" /> {course.teacher_name}
                  </p>
                )}
                {course.description && <p className="text-sm text-slate-500 mb-4">{course.description}</p>}
                <button onClick={() => handleJoin(course)} disabled={joiningId === course.id}
                  className="w-full bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  <IconPlus className="w-4 h-4" /> {joiningId === course.id ? '加入中…' : '加入課程'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {manageCourse && (
        <CourseManageModal
          course={manageCourse}
          otherCourses={courses.filter(c => c.id !== manageCourse.id)}
          onClose={() => setManageCourse(null)}
          onUpdated={(c) => setCourses(prev => prev.map(x => x.id === c.id ? { ...x, ...c } : x))}
          onDeleted={(id) => { setCourses(prev => prev.filter(x => x.id !== id)); setManageCourse(null); }}
        />
      )}
    </div>
  );
};

/** 課程管理彈窗：編輯資訊 / 教材上傳與套用 / 刪除課程 */
const CourseManageModal: React.FC<{
  course: Course;
  otherCourses: Course[];
  onClose: () => void;
  onUpdated: (c: Course) => void;
  onDeleted: (id: string) => void;
}> = ({ course, otherCourses, onClose, onUpdated, onDeleted }) => {
  const [name, setName] = useState(course.name);
  const [desc, setDesc] = useState(course.description || '');
  const [saving, setSaving] = useState(false);
  const [mats, setMats] = useState<Material[]>([]);
  const [upFile, setUpFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  // 教材庫：列出「其他課程」的所有教材（即教材管理中非本課程的項目），可直接套用
  const [libMats, setLibMats] = useState<(Material & { courseName: string })[]>([]);

  const loadMats = () => { getMaterials(course.id).then(setMats).catch(() => {}); };
  useEffect(loadMats, [course.id]);
  useEffect(() => {
    Promise.all(
      otherCourses.map(c =>
        getMaterials(c.id)
          .then(list => list.map(m => ({ ...m, courseName: c.name })))
          .catch(() => [] as (Material & { courseName: string })[])
      )
    ).then(lists => setLibMats(lists.flat()));
  }, [course.id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateCourse(course.id, { name, description: desc });
      onUpdated(updated);
    } catch (e: any) { alert('儲存失敗: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleUpload = async () => {
    if (!upFile) return;
    setBusy('上傳並建立 AI 索引中…');
    try {
      const { materialId } = await uploadMaterial(course.id, upFile);
      const r = await pollMaterialStatus(materialId);
      if (r.status !== 'READY') alert('教材處理失敗: ' + (r.error_message || ''));
      setUpFile(null);
      loadMats();
    } catch (e: any) { alert('上傳失敗: ' + e.message); }
    finally { setBusy(''); }
  };

  const handleApply = async (m: Material) => {
    setBusy(`套用「${m.title}」中…`);
    try {
      await moveMaterial(m.id, course.id);
      setLibMats(prev => prev.filter(x => x.id !== m.id));
      loadMats();
    } catch (e: any) { alert('套用失敗: ' + e.message); }
    finally { setBusy(''); }
  };

  const handleGenQa = async () => {
    setBusy('AI 讀教材生成問答中…（約 10–30 秒）');
    try {
      const n = await generateCourseQa(course.id, 10);
      alert(`✅ 已為「${course.name}」生成 ${n} 筆課後問答，學生在「課後複習」頁即可看到；可至「問答管理」逐筆編修。`);
    } catch (e: any) { alert('生成失敗: ' + e.message); }
    finally { setBusy(''); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`確定刪除課程「${course.name}」？\n課程的教材、AI 索引與學生選課紀錄會一併刪除，無法復原。`)) return;
    try {
      await deleteCourse(course.id);
      onDeleted(course.id);
    } catch (e: any) { alert('刪除失敗: ' + e.message); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl relative max-h-[88vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-bold text-slate-800">管理課程</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full text-xl leading-none">✕</button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* 編輯資訊 */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500">課程資訊</h4>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="課程名稱"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="課程描述"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <button onClick={handleSave} disabled={saving || !name.trim()}
              className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
              {saving ? '儲存中…' : '儲存變更'}
            </button>
          </section>

          {/* 本課程教材 */}
          <section className="space-y-2">
            <h4 className="text-xs font-bold text-slate-500">課程教材（{mats.length}）</h4>
            {mats.length > 0 ? (
              <ul className="space-y-1">
                {mats.map(m => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="truncate flex-1">{m.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${m.status === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {m.status === 'READY' ? '已就緒' : m.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">尚無教材</p>}
            <div className="flex items-center gap-2 pt-1">
              <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.xls"
                onChange={e => setUpFile(e.target.files?.[0] ?? null)}
                className="flex-1 text-xs text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-indigo-50 file:text-indigo-600 file:text-xs file:font-bold file:cursor-pointer" />
              <button onClick={handleUpload} disabled={!upFile || !!busy}
                className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 shrink-0">上傳</button>
            </div>
            {mats.some(m => m.status === 'READY') && (
              <button onClick={handleGenQa} disabled={!!busy}
                className="w-full mt-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition disabled:opacity-40">
                ✨ AI 讀教材生成課後問答（學生「課後複習」頁會看到）
              </button>
            )}
          </section>

          {/* 套用教材庫（教材管理中其他課程的項目，直接列出） */}
          {libMats.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500">套用既有教材（從教材管理移轉到本課程）</h4>
              <ul className="space-y-1 max-h-44 overflow-y-auto">
                {libMats.map(m => (
                  <li key={m.id} className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="truncate flex-1">{m.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{m.courseName}</span>
                    <button onClick={() => handleApply(m)} disabled={!!busy}
                      className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-lg shrink-0 disabled:opacity-40">套用 →</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {busy && <p className="text-xs text-indigo-600 animate-pulse">{busy}</p>}

          {/* 危險區 */}
          <section className="border-t border-slate-100 pt-4">
            <button onClick={handleDelete}
              className="w-full py-2.5 rounded-xl bg-red-50 text-red-600 border border-red-100 hover:bg-red-100 text-sm font-bold transition">
              🗑 刪除課程（教材與選課紀錄一併刪除）
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CourseList;
