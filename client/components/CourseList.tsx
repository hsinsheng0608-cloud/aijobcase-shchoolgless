
import React, { useState, useEffect } from 'react';
import { UserRole, Course } from '../types';
import { IconBook, IconUser, IconZap, IconGraduation, IconPlus } from './Icons';
import { getCourses, createCourse } from '../services/courseService';

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

  useEffect(() => {
    getCourses().then(setCourses).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const course = await createCourse(newName, newDesc);
      setCourses(prev => [course, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } catch (err: any) {
      alert(err.message);
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
          <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold">建立</button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {courses.map((course) => (
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
        {courses.length === 0 && (
          <div className="col-span-full text-center py-12 text-slate-400">
            <p>{userRole === UserRole.STUDENT ? '尚未加入任何課程' : '尚未建立任何課程'}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseList;
