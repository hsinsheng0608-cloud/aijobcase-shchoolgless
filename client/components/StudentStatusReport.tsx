import React, { useEffect, useState } from 'react';
import { getAuthHeaders } from '../services/authService';
import { API_BASE } from '../apiBase';

interface StudentRow {
  id: string; student_id: string; name: string;
  question_count: number;
  exam_attempts: number; exam_correct_rate: number | null;
  ar_sessions: number; ar_completed: number;
  enrolled_courses: number;
  last_active: string | null;
}
interface Activity {
  questions: { content: string; course_name: string | null; created_at: string }[];
  attempts: { is_correct: boolean; time_spent_seconds: number | null; created_at: string; question_text: string | null }[];
  ar_sessions: { status: string; steps_completed: number | null; total_steps: number | null; duration_seconds: number | null; created_at: string }[];
}

const DAY = 24 * 60 * 60 * 1000;

function timeAgo(iso: string | null): string {
  if (!iso) return '從未';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '剛剛';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`;
  if (diff < DAY) return `${Math.floor(diff / 3_600_000)} 小時前`;
  return `${Math.floor(diff / DAY)} 天前`;
}

/** 預警判定：🔴 7天無活動 / 🟡 正確率<60 / 🟢 正常 */
function statusOf(s: StudentRow): { icon: string; label: string; cls: string } {
  const inactive = !s.last_active || Date.now() - new Date(s.last_active).getTime() > 7 * DAY;
  if (inactive) return { icon: '🔴', label: '7天未活動', cls: 'bg-red-50 text-red-600' };
  if (s.exam_correct_rate !== null && s.exam_attempts >= 3 && s.exam_correct_rate < 60)
    return { icon: '🟡', label: '測驗低分', cls: 'bg-amber-50 text-amber-600' };
  return { icon: '🟢', label: '正常', cls: 'bg-emerald-50 text-emerald-600' };
}

const StudentStatusReport: React.FC = () => {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [actLoading, setActLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/stats/students-overview`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setRows(d.data); else setError(d.error || '載入失敗'); })
      .catch(() => setError('網路錯誤'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (s: StudentRow) => {
    if (openId === s.id) { setOpenId(null); setActivity(null); return; }
    setOpenId(s.id); setActivity(null); setActLoading(true);
    try {
      const r = await fetch(`${API_BASE}/stats/students/${s.id}/activity`, { headers: getAuthHeaders() });
      const d = await r.json();
      if (d.success) setActivity(d.data);
    } catch { /* 顯示空即可 */ }
    finally { setActLoading(false); }
  };

  const alerts = rows.filter(s => statusOf(s).icon !== '🟢').length;

  if (loading) return <div className="text-center py-20 text-slate-400">載入學習狀況…</div>;
  if (error) return <div className="text-center py-20 text-red-400">{error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-slate-800">學生學習狀況</h2>
        <p className="text-sm text-slate-500 mt-1">
          共 {rows.length} 位學生
          {alerts > 0 && <span className="ml-2 text-red-500 font-bold">· {alerts} 位需要關心</span>}
          <span className="ml-2 text-slate-400">點擊學生列展開活動明細</span>
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
              <th className="px-4 py-3">學生</th>
              <th className="px-3 py-3">最後活動</th>
              <th className="px-3 py-3 text-center">AI 提問</th>
              <th className="px-3 py-3 text-center">測驗（次／正確率）</th>
              <th className="px-3 py-3 text-center">AR 練習（完成／次）</th>
              <th className="px-3 py-3 text-center">修課</th>
              <th className="px-3 py-3">狀態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(s => {
              const st = statusOf(s);
              return (
                <React.Fragment key={s.id}>
                  <tr onClick={() => toggle(s)}
                    className={`border-b border-slate-50 cursor-pointer hover:bg-indigo-50/40 transition ${openId === s.id ? 'bg-indigo-50/60' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="font-bold text-slate-800">{s.name}</span>
                      <span className="ml-2 text-xs text-slate-400">{s.student_id}</span>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{timeAgo(s.last_active)}</td>
                    <td className="px-3 py-3 text-center font-mono">{s.question_count}</td>
                    <td className="px-3 py-3 text-center font-mono">
                      {s.exam_attempts > 0 ? `${s.exam_attempts} / ${s.exam_correct_rate ?? '--'}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-mono">
                      {s.ar_sessions > 0 ? `${s.ar_completed} / ${s.ar_sessions}` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center font-mono">{s.enrolled_courses}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-bold ${st.cls}`}>{st.icon} {st.label}</span>
                    </td>
                  </tr>
                  {openId === s.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={7} className="px-6 py-4">
                        {actLoading ? (
                          <p className="text-xs text-slate-400 animate-pulse">載入明細…</p>
                        ) : activity ? (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                            <div>
                              <h4 className="font-bold text-slate-600 mb-2">💬 最近提問（{activity.questions.length}）</h4>
                              {activity.questions.length ? (
                                <ul className="space-y-1.5">
                                  {activity.questions.slice(0, 8).map((q, i) => (
                                    <li key={i} className="text-slate-600">
                                      <span className="text-slate-800">{q.content.slice(0, 36)}</span>
                                      <span className="text-slate-400 ml-1">{q.course_name ? `· ${q.course_name}` : '· AR助教'} · {timeAgo(q.created_at)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-slate-400">尚無提問</p>}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-600 mb-2">📝 測驗紀錄（{activity.attempts.length}）</h4>
                              {activity.attempts.length ? (
                                <ul className="space-y-1.5">
                                  {activity.attempts.slice(0, 8).map((a, i) => (
                                    <li key={i} className="text-slate-600">
                                      <span>{a.is_correct ? '✅' : '❌'}</span>
                                      <span className="ml-1 text-slate-800">{a.question_text || '（題目已刪除）'}</span>
                                      <span className="text-slate-400 ml-1">{timeAgo(a.created_at)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-slate-400">尚無測驗</p>}
                            </div>
                            <div>
                              <h4 className="font-bold text-slate-600 mb-2">👓 AR 練習（{activity.ar_sessions.length}）</h4>
                              {activity.ar_sessions.length ? (
                                <ul className="space-y-1.5">
                                  {activity.ar_sessions.slice(0, 8).map((a, i) => (
                                    <li key={i} className="text-slate-600">
                                      <span>{a.status === 'COMPLETED' ? '✅ 完成' : '⏸ 未完成'}</span>
                                      <span className="ml-1">{a.steps_completed ?? 0}/{a.total_steps ?? '?'} 步</span>
                                      {a.duration_seconds != null && <span className="ml-1">· {Math.round(a.duration_seconds / 60)} 分</span>}
                                      <span className="text-slate-400 ml-1">{timeAgo(a.created_at)}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <p className="text-slate-400">尚無 AR 練習</p>}
                            </div>
                          </div>
                        ) : <p className="text-xs text-slate-400">載入失敗</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">尚無學生帳號</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        狀態規則：🔴 超過 7 天沒有任何活動；🟡 測驗 3 次以上且正確率低於 60%；🟢 正常。
      </p>
    </div>
  );
};

export default StudentStatusReport;
