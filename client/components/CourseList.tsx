
import React, { useState, useEffect } from 'react';
import { UserRole, Course } from '../types';
import { IconBook, IconUser, IconZap, IconGraduation, IconPlus } from './Icons';
import { getCourses, createCourse, getAllCourses, joinCourse } from '../services/courseService';
import { uploadMaterial, pollMaterialStatus } from '../services/materialService';

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
        setCreateHint(result.status === 'READY' ? '' : '教材處理失敗，可至教材管理重新上傳');
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

            <button onClick={() => onSelectCourse(course.id)}
              className="w-full bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 flex items-center justify-center gap-2">
              <IconZap className="w-4 h-4" /> 進入該課程
            </button>
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
    </div>
  );
};

export default CourseList;
