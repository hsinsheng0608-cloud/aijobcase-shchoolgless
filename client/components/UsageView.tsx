
import React, { useState, useEffect } from 'react';
import { IconZap, IconChart, IconInfo } from './Icons';
import { getAuthHeaders } from '../services/authService';
import { API_BASE } from '../apiBase';

const UsageView: React.FC = () => {
  const [usage, setUsage] = useState({ questionCount: 0, examCount: 0, questionLimit: 50, examLimit: 100 });

  useEffect(() => {
    fetch(`${API_BASE}/users/usage`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => { if (d.success) setUsage(d.data); })
      .catch(console.error);
  }, []);

  const qPercent = Math.round((usage.questionCount / usage.questionLimit) * 100);
  const ePercent = Math.round((usage.examCount / usage.examLimit) * 100);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-black text-slate-800">今日使用量</h2>
        <p className="text-sm text-slate-500">每日限額會在午夜重置</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg"><IconChart className="w-5 h-5" /></div>
            <h3 className="font-bold text-slate-800">AI 問答用量</h3>
          </div>
          <p className="text-2xl font-black text-slate-800">
            {usage.questionCount} <span className="text-sm text-slate-400">/ {usage.questionLimit} 題</span>
          </p>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mt-3">
            <div className={`h-full rounded-full transition-all ${qPercent > 80 ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${qPercent}%` }}></div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 text-emerald-600 p-2 rounded-lg"><IconZap className="w-5 h-5" /></div>
            <h3 className="font-bold text-slate-800">測驗作答用量</h3>
          </div>
          <p className="text-2xl font-black text-slate-800">
            {usage.examCount} <span className="text-sm text-slate-400">/ {usage.examLimit} 題</span>
          </p>
          <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mt-3">
            <div className={`h-full rounded-full transition-all ${ePercent > 80 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${ePercent}%` }}></div>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl flex gap-4 items-start">
        <IconInfo className="w-6 h-6 text-amber-500 shrink-0" />
        <div>
          <h4 className="text-sm font-black text-amber-900">用量提醒</h4>
          <p className="text-xs text-amber-700 mt-1">
            每日提問上限 {usage.questionLimit} 題、測驗上限 {usage.examLimit} 題。超過限額後需等待隔日重置。
          </p>
        </div>
      </div>
    </div>
  );
};

export default UsageView;
