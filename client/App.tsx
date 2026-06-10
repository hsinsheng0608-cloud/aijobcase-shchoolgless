
import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import MaterialManagement from './components/MaterialManagement';
import AIChatView from './components/AIChatView';
import AdminArchitectureDoc from './components/AdminArchitectureDoc';
import CourseList from './components/CourseList';
import LoginView from './components/LoginView';
import AdminUserManagement from './components/AdminUserManagement';
import GlassesManagement from './components/GlassesManagement';
import KnowledgeManagement from './components/KnowledgeManagement';
import StudentStatusReport from './components/StudentStatusReport';
import MyGlassesPage from './components/MyGlassesPage';
import FaceShapeRecommendation from './components/FaceShapeRecommendation';
import QuizPage from './components/QuizPage';
import SystemManual from './components/SystemManual';
import { UserRole, User } from './types';
import { authService } from './services/authService';
import OnboardingTour from './components/OnboardingTour';
import AddToHomeBanner from './components/AddToHomeBanner';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(authService.getCurrentUser());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem('edumind_onboarded');
  });

  const completeOnboarding = () => {
    localStorage.setItem('edumind_onboarded', 'true');
    setShowOnboarding(false);
  };

  if (!user) {
    return <>
      <AddToHomeBanner />
      <LoginView onLoginSuccess={() => {
      const loggedInUser = authService.getCurrentUser();
      setUser(loggedInUser);
      // Students now land on main app (AR accessible via sidebar)
    }} />
    </>;
  }

  const handleLogout = () => {
    authService.logout();
    setUser(null);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard role={user.role} onNavigate={setActiveTab} />;
      case 'courses': return (
        <CourseList
          userRole={user.role}
          onSelectCourse={(id) => { setSelectedCourseId(id); setActiveTab('ai-chat'); }}
        />
      );
      case 'materials': return (
        <MaterialManagement courseId={selectedCourseId} />
      );
      case 'ai-chat': return (
        <AIChatView courseId={selectedCourseId || ''} onBack={() => setActiveTab('courses')} />
      );
      case 'glasses-mgmt': return <GlassesManagement />;
      case 'knowledge-mgmt': return <KnowledgeManagement />;
      case 'student-status': return <StudentStatusReport />;
      case 'my-glasses': return <MyGlassesPage />;
      case 'face-recommend': return (
        <FaceShapeRecommendation
          onSelectItem={(item) => {
            // 套用所選款式並重用同一個 AR 分頁（避免每點一張就開新分頁）
            if (item) window.open(`/ar/index.html?applyCatalog=${item.id}`, 'edumind_ar');
          }}
        />
      );
      case 'exams': return <QuizPage />;
      case 'admin': return <AdminArchitectureDoc />;
      case 'admin-users': return <AdminUserManagement />;
      case 'manual': return <SystemManual userRole={user.role} />;
      default: return <Dashboard role={user.role} onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {showOnboarding && <OnboardingTour onComplete={completeOnboarding} />}
      <AddToHomeBanner />
      <Sidebar
        currentRole={user.role}
        userName={user.name}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          // 從側欄進「教材管理 / 課後複習」時清掉殘留課程，才會顯示課程切換器 / 全部問答
          if (tab === 'materials' || tab === 'ai-chat') setSelectedCourseId(null);
          setActiveTab(tab); setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="md:ml-64 min-h-screen">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 pb-3 bg-slate-900 text-white sticky top-0 z-30 safe-area-top">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-800 transition"
            aria-label="開啟選單"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-indigo-400 font-bold text-sm">EduMind AI</span>
          <button
            onClick={handleLogout}
            className="text-xs text-red-400 px-2 py-1 rounded font-bold"
          >
            登出
          </button>
        </div>

        <div className="p-4 pb-20 md:p-8 md:pb-8">
          <div className="max-w-6xl mx-auto">
            {/* Desktop logout */}
            <div className="hidden md:flex justify-end mb-4">
              <button
                onClick={handleLogout}
                className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-bold border border-red-100 hover:bg-red-100 transition-colors"
              >
                登出
              </button>
            </div>
            {renderContent()}
          </div>
        </div>
        {/* Mobile Bottom Navigation */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 safe-area-bottom">
          <div className="flex items-center justify-around px-1 py-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${activeTab === 'dashboard' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[10px] font-medium">首頁</span>
            </button>
            <button
              onClick={() => setActiveTab(user.role === UserRole.STUDENT ? 'ai-chat' : 'courses')}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all ${(activeTab === 'courses' || activeTab === 'ai-chat') ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-[10px] font-medium">{user.role === UserRole.STUDENT ? '複習' : '課程'}</span>
            </button>
            <button
              onClick={() => window.open('/ar/index.html', '_blank')}
              className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all text-slate-400"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.869v6.262a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] font-medium">AR 練習</span>
            </button>
            <button
              onClick={() => setSidebarOpen(true)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all text-slate-400`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
              <span className="text-[10px] font-medium">更多</span>
            </button>
          </div>
        </nav>
      </main>
    </div>
  );
};

export default App;
