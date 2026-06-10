
import React from 'react';
import { UserRole } from '../types';
import {
  IconDashboard,
  IconBook,
  IconFile,
  IconChat,
  IconZap,
  IconSettings,
  IconUser,
  IconEye,
  IconChart,
  IconInfo,
} from './Icons';

interface SidebarProps {
  currentRole: UserRole;
  userName: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentRole, userName, activeTab, setActiveTab, isOpen = false, onClose }) => {
  const menuItems = [
    { id: 'dashboard', label: '數據儀表板', Icon: IconDashboard, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'courses', label: '我的課程', Icon: IconBook, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'materials', label: '教材管理', Icon: IconFile, roles: [UserRole.TEACHER, UserRole.ADMIN] },
    { id: 'ai-chat', label: '課業問答', Icon: IconChat, roles: [UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'knowledge-mgmt', label: '問答管理', Icon: IconFile, roles: [UserRole.TEACHER, UserRole.ADMIN] },
    { id: 'student-status', label: '學習狀況', Icon: IconChart, roles: [UserRole.TEACHER, UserRole.ADMIN] },
    { id: 'ar-practice', label: 'AR 模擬練習', Icon: IconEye, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT], external: '/ar/index.html' },
    { id: 'face-recommend', label: '臉型眼鏡推薦', Icon: IconEye, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'glasses-mgmt', label: '眼鏡素材管理', Icon: IconFile, roles: [UserRole.TEACHER, UserRole.ADMIN] },
    { id: 'exams', label: '測驗系統', Icon: IconZap, roles: [UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'admin-users', label: '用戶管理', Icon: IconUser, roles: [UserRole.ADMIN, UserRole.TEACHER] },
    { id: 'manual', label: '操作說明', Icon: IconInfo, roles: [UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT] },
    { id: 'admin', label: '系統架構', Icon: IconSettings, roles: [UserRole.ADMIN] },
  ] as const;

  const filteredMenu = menuItems.filter(item => (item.roles as readonly UserRole[]).includes(currentRole));

  const handleNav = (item: typeof filteredMenu[number]) => {
    if ('external' in item && item.external) {
      window.open(item.external, '_blank');
    } else {
      setActiveTab(item.id);
    }
    onClose?.();
  };

  const sidebarContent = (
    <div className="w-64 bg-slate-900 h-full text-white flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold text-indigo-400">EduMind AI</h1>
        <p className="text-xs text-slate-400 mt-1">AI 課程複習助教</p>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4 overflow-y-auto">
        {filteredMenu.map((item) => {
          const ActiveIcon = item.Icon;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ActiveIcon className="w-5 h-5" />
              <span className="font-medium text-sm">{item.label}</span>
              {'external' in item && item.external && (
                <svg className="w-3 h-3 ml-auto opacity-50" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-bold shadow-inner flex-shrink-0">
            <span className="text-xs">{userName?.charAt(0) || 'U'}</span>
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-tighter">
              {currentRole === UserRole.ADMIN ? '管理員' : currentRole === UserRole.TEACHER ? '教師' : '學生'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:flex fixed left-0 top-0 h-screen z-40">
        {sidebarContent}
      </div>

      {/* Mobile drawer + backdrop */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />
          <div className="fixed left-0 top-0 h-screen z-50 md:hidden flex">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
};

export default Sidebar;
