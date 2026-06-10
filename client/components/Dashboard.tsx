import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { UserRole } from '../types';
import { getAuthHeaders } from '../services/authService';
import {
  IconGraduation, IconUser, IconZap, IconDatabase, IconBook,
  IconChart, IconTarget, IconChat, IconInfo, IconDashboard, IconCheck
} from './Icons';

const API = import.meta.env.VITE_API_URL || '';

interface OverviewStats {
  course_count: number; student_count: number;
  total_ai_requests: number; material_count: number;
}
interface TeacherOverview {
  my_material_count: number; enrolled_students: number; student_questions: number;
}
interface MyUsage {
  month_total: number; today_used: number; today_limit: number; today_remain: number;
}
interface TrendRow { name: string; queries: number; active_users: number; }
interface Engagement { chat_pct: number; exam_pct: number; ar_pct: number; }
interface HotTopic { question: string; course_name: string; created_at: string; }
interface RecentActivity { course_id: string; course_name: string; material_count: number; last_chat: string; }

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.floor(h / 24)} 天前`;
}

export default function Dashboard({ role, onNavigate }: { role: UserRole; onNavigate?: (tab: string) => void }) {
  const headers = getAuthHeaders();
  const [overview, setOverview]             = useState<OverviewStats | null>(null);
  const [teacherStats, setTeacherStats]     = useState<TeacherOverview | null>(null);
  const [myUsage, setMyUsage]               = useState<MyUsage | null>(null);
  const [trend, setTrend]                   = useState<TrendRow[]>([]);
  const [engagement, setEngagement]         = useState<Engagement | null>(null);
  const [hotTopics, setHotTopics]           = useState<HotTopic[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  useEffect(() => {
    const get = (path: string) =>
      fetch(`${API}${path}`, { headers }).then(r => r.json());

    if (role === UserRole.ADMIN || role === UserRole.TEACHER) {
      get('/api/stats/overview').then(d => { if (d.success) setOverview(d.data); });
      get('/api/stats/weekly-trend').then(d => { if (d.success) setTrend(d.data); });
      get('/api/stats/engagement').then(d => { if (d.success) setEngagement(d.data); });
      get('/api/stats/hot-topics').then(d => { if (d.success) setHotTopics(d.data); });
    }
    if (role === UserRole.TEACHER) {
      get('/api/stats/teacher-overview').then(d => { if (d.success) setTeacherStats(d.data); });
    }
    if (role === UserRole.STUDENT) {
      get('/api/stats/my-usage').then(d => { if (d.success) setMyUsage(d.data); });
      get('/api/stats/recent-activity').then(d => { if (d.success) setRecentActivity(d.data); });
    }
  }, [role]);

  const engagementData = [
    { name: 'AI 問答', value: engagement?.chat_pct ?? 0, color: '#6366f1' },
    { name: '測驗作答', value: engagement?.exam_pct ?? 0, color: '#8b5cf6' },
    { name: 'AR 練習', value: engagement?.ar_pct ?? 0, color: '#ec4899' },
  ];

  // ── Admin ──
  const renderAdminStats = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6">
        {[
          { label: '總課程數',    value: overview ? String(overview.course_count)        : '--', Icon: IconGraduation, color: 'bg-blue-500' },
          { label: '活躍學生數',  value: overview ? String(overview.student_count)        : '--', Icon: IconUser,       color: 'bg-green-500' },
          { label: 'AI 累計問答', value: overview ? String(overview.total_ai_requests)   : '--', Icon: IconZap,        color: 'bg-purple-500' },
          { label: '教材數量',    value: overview ? String(overview.material_count)       : '--', Icon: IconDatabase,   color: 'bg-amber-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className={`${stat.color} w-10 h-10 rounded-xl flex items-center justify-center text-white mb-4 shadow-lg`}>
              <stat.Icon className="w-6 h-6" />
            </div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{stat.label}</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>
      {renderCharts()}
    </div>
  );

  // ── Teacher ──
  const renderTeacherStats = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl"><IconBook className="w-8 h-8" /></div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">我的課程教材</p>
            <h3 className="text-xl font-bold text-slate-800">
              {teacherStats ? `${teacherStats.my_material_count} 份` : '--'}
            </h3>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-emerald-100 text-emerald-600 p-3 rounded-xl"><IconChat className="w-8 h-8" /></div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">學生累計發問</p>
            <h3 className="text-xl font-bold text-slate-800">
              {teacherStats ? `${teacherStats.student_questions.toLocaleString()} 次` : '--'}
            </h3>
          </div>
        </div>
        <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="bg-amber-100 text-amber-600 p-3 rounded-xl"><IconTarget className="w-8 h-8" /></div>
          <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">課程修課人數</p>
            <h3 className="text-xl font-bold text-slate-800">
              {teacherStats ? `${teacherStats.enrolled_students} 人` : '--'}
            </h3>
          </div>
        </div>
      </div>
      {/* 快速操作 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5">
        <h3 className="font-bold text-slate-700 text-sm mb-3">快速操作</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: '教材管理', desc: '上傳課程教材', icon: '📄', color: 'bg-blue-50 border-blue-100 hover:bg-blue-100', tab: 'materials' },
            { label: '問答管理', desc: '新增知識庫問答', icon: '💬', color: 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100', tab: 'knowledge-mgmt' },
            { label: '測驗系統', desc: '題庫隨機測驗', icon: '📝', color: 'bg-amber-50 border-amber-100 hover:bg-amber-100', tab: 'exams' },
            { label: '學習狀況', desc: '學生活動與預警', icon: '📈', color: 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100', tab: 'student-status' },
          ].map(action => (
            <button
              type="button"
              key={action.label}
              onClick={() => onNavigate?.(action.tab)}
              className={`flex flex-col gap-1 p-3 rounded-xl border cursor-pointer transition-all text-left ${action.color}`}
            >
              <span className="text-xl">{action.icon}</span>
              <p className="text-xs font-bold text-slate-800">{action.label}</p>
              <p className="text-[10px] text-slate-500 hidden sm:block">{action.desc}</p>
            </button>
          ))}
        </div>
      </div>
      {renderCharts()}
    </div>
  );

  // ── Shared charts (Admin + Teacher) ──
  const renderCharts = () => (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
      {/* 7-day trend */}
      <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
          <IconChart className="w-5 h-5 text-indigo-600" />
          AI 問答趨勢（近 7 日）
        </h3>
        <div className="h-48 md:h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="cq" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,.1)' }} />
              <Area type="monotone" dataKey="queries" name="AI 問答數" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#cq)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Engagement + hot topics */}
      <div className="space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <IconZap className="w-5 h-5 text-indigo-600" />
            學生參與度
          </h3>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide domain={[0, 100]} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} width={52} />
                <Tooltip cursor={{ fill: 'transparent' }} formatter={(v: number) => [`${v}%`, '參與率']} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={16}>
                  {engagementData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
            <IconChat className="w-5 h-5 text-indigo-600" />
            最新發問
          </h3>
          <div className="space-y-2">
            {hotTopics.length === 0 ? (
              <p className="text-xs text-slate-400">尚無發問紀錄</p>
            ) : hotTopics.map((t, i) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                <span className="text-xs text-slate-700 flex-1 line-clamp-2">{t.question}</span>
                <span className="text-[10px] text-slate-400 flex-shrink-0 whitespace-nowrap">{timeAgo(t.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Student ──
  const renderStudentStats = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-700 p-8 rounded-3xl text-white shadow-xl">
        <h3 className="text-2xl font-bold">歡迎回來！</h3>
        <p className="text-indigo-100 mt-2">
          今日剩餘提問額度：
          <strong>{myUsage ? `${myUsage.today_remain} / ${myUsage.today_limit} 次` : '載入中…'}</strong>
        </p>
        <div className="flex gap-4 mt-6">
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20">
            <p className="text-xs text-indigo-200 font-bold uppercase tracking-widest">本月發問</p>
            <p className="text-2xl font-black mt-1">{myUsage ? myUsage.month_total : '--'}</p>
          </div>
          <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20">
            <p className="text-xs text-indigo-200 font-bold uppercase tracking-widest">今日已用</p>
            <p className="text-2xl font-black mt-1">{myUsage ? myUsage.today_used : '--'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <IconCheck className="w-5 h-5 text-indigo-600" />
          最近學習課程
        </h3>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400">尚無學習紀錄，快去發問吧！</p>
        ) : (
          <div className="space-y-3">
            {recentActivity.map((a) => (
              <div key={a.course_id} className="flex items-center gap-4">
                <div className="bg-slate-100 p-2 rounded-lg"><IconBook className="w-4 h-4 text-slate-400" /></div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">{a.course_name}</p>
                  <p className="text-[10px] text-slate-400">{a.material_count} 份教材 · {timeAgo(a.last_chat)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">
            {role === UserRole.ADMIN ? '系統管理面板' : role === UserRole.TEACHER ? '教學工作台' : '學習儀表板'}
          </h2>
          <p className="text-slate-400 text-xs font-medium mt-1">EduMind AI 課程複習助教</p>
        </div>
        <div className="flex gap-2">
          <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 shadow-sm flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            AI 系統在線
          </div>
        </div>
      </header>

      {role === UserRole.ADMIN    ? renderAdminStats()   :
       role === UserRole.TEACHER  ? renderTeacherStats() : renderStudentStats()}
    </div>
  );
}
