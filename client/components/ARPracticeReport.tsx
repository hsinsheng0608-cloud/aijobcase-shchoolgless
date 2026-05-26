
import React, { useEffect, useState } from 'react';
import { IconEye, IconUser, IconCheck, IconChart } from './Icons';
import { API_BASE } from '../apiBase';

interface StudentPractice {
  id: string;
  student_id: string;
  name: string;
  total_sessions: number;
  completed_sessions: number;
  last_practice: string | null;
  avg_duration: number;
}

interface SessionDetail {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: string;
  steps_completed: number;
  total_steps: number;
}


const ARPracticeReport: React.FC = () => {
  const [students, setStudents] = useState<StudentPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentPractice | null>(null);
  const [sessions, setSessions] = useState<SessionDetail[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const token = localStorage.getItem('edumind_token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/ar-practice/students`, { headers });
      const json = await res.json();
      if (json.success) {
        setStudents(json.data);
      } else {
        setError(json.error || 'Failed to load');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStudentSessions(studentId: string) {
    try {
      setSessionsLoading(true);
      const res = await fetch(`${API_BASE}/ar-practice/students/${studentId}/sessions`, { headers });
      const json = await res.json();
      if (json.success) {
        setSessions(json.data);
      }
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }

  function handleSelectStudent(student: StudentPractice) {
    setSelectedStudent(student);
    fetchStudentSessions(student.id);
  }

  const totalSessions = students.reduce((sum, s) => sum + Number(s.total_sessions), 0);
  const totalCompleted = students.reduce((sum, s) => sum + Number(s.completed_sessions), 0);
  const activeStudents = students.filter(s => Number(s.total_sessions) > 0).length;
  const avgCompletionRate = totalSessions > 0 ? Math.round((totalCompleted / totalSessions) * 100) : 0;

  function formatDuration(seconds: number | null) {
    if (!seconds) return '--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '尚未練習';
    return new Date(dateStr).toLocaleString('zh-TW', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function statusBadge(status: string) {
    if (status === 'COMPLETED') return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">已完成</span>;
    if (status === 'IN_PROGRESS') return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">進行中</span>;
    return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">未完成</span>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 text-red-500">
        <p className="text-lg font-bold mb-2">載入失敗</p>
        <p className="text-sm">{error}</p>
        <button onClick={fetchStudents} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">重試</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
          <IconEye className="w-6 h-6 text-indigo-600" />
          AR 練習報表
        </h2>
        <p className="text-slate-400 text-xs font-medium mt-1">查看學生 AR 模擬練習狀況</p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-indigo-500 w-9 h-9 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg">
            <IconUser className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">參與學生</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{activeStudents}<span className="text-sm text-slate-400 font-normal ml-1">/ {students.length}</span></h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-green-500 w-9 h-9 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg">
            <IconEye className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">總練習次數</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalSessions}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-emerald-500 w-9 h-9 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg">
            <IconCheck className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">完成次數</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{totalCompleted}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="bg-purple-500 w-9 h-9 rounded-xl flex items-center justify-center text-white mb-3 shadow-lg">
            <IconChart className="w-5 h-5" />
          </div>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">完成率</p>
          <h3 className="text-2xl font-bold text-slate-800 mt-1">{avgCompletionRate}%</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Student List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">學生練習一覽</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs">
                  <th className="text-left px-6 py-3 font-bold">學生</th>
                  <th className="text-center px-4 py-3 font-bold">總次數</th>
                  <th className="text-center px-4 py-3 font-bold">完成</th>
                  <th className="text-center px-4 py-3 font-bold">平均時長</th>
                  <th className="text-center px-4 py-3 font-bold">最近練習</th>
                  <th className="text-center px-4 py-3 font-bold"></th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const rate = Number(s.total_sessions) > 0
                    ? Math.round((Number(s.completed_sessions) / Number(s.total_sessions)) * 100)
                    : 0;
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-slate-50 hover:bg-indigo-50/50 transition cursor-pointer ${selectedStudent?.id === s.id ? 'bg-indigo-50' : ''}`}
                      onClick={() => handleSelectStudent(s)}
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-slate-800">{s.name}</p>
                            <p className="text-[10px] text-slate-400">{s.student_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-center px-4 py-3 text-slate-700 font-medium">{s.total_sessions}</td>
                      <td className="text-center px-4 py-3">
                        <span className="text-slate-700 font-medium">{s.completed_sessions}</span>
                        <span className="text-[10px] text-slate-400 ml-1">({rate}%)</span>
                      </td>
                      <td className="text-center px-4 py-3 text-slate-600">{formatDuration(s.avg_duration)}</td>
                      <td className="text-center px-4 py-3 text-slate-500 text-xs">{formatDate(s.last_practice)}</td>
                      <td className="text-center px-4 py-3">
                        <button className="text-indigo-600 text-xs font-bold hover:underline">詳細</button>
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400 text-sm">尚無學生資料</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Session Detail Panel */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="font-bold text-slate-800 text-sm">
              {selectedStudent ? `${selectedStudent.name} 的練習紀錄` : '選擇學生查看詳細'}
            </h3>
          </div>
          <div className="p-4 space-y-2 max-h-[500px] overflow-y-auto">
            {!selectedStudent ? (
              <div className="text-center py-12 text-slate-300">
                <IconUser className="w-12 h-12 mx-auto mb-3" />
                <p className="text-sm">點擊左側學生查看練習詳細</p>
              </div>
            ) : sessionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">此學生尚無練習紀錄</div>
            ) : (
              sessions.map((sess) => (
                <div key={sess.id} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600 font-medium">{formatDate(sess.started_at)}</span>
                    {statusBadge(sess.status)}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <div className="text-[10px] text-slate-500">
                      步驟: <span className="font-bold text-slate-700">{sess.steps_completed}/{sess.total_steps}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      時長: <span className="font-bold text-slate-700">{formatDuration(sess.duration_seconds)}</span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${sess.status === 'COMPLETED' ? 'bg-green-500' : 'bg-yellow-500'}`}
                      style={{ width: `${(sess.steps_completed / sess.total_steps) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ARPracticeReport;
