import React, { useState } from 'react';

interface OnboardingTourProps {
  onComplete: () => void;
}

const slides = [
  {
    emoji: '👋',
    title: '歡迎使用 EduMind AI',
    desc: '您的 AI 課程複習助教，結合人工智慧讓學習更有效率',
    bg: 'from-indigo-600 to-violet-700',
  },
  {
    emoji: '💬',
    title: '課後複習',
    desc: '用關鍵字搜尋老師建立的問答題庫，點開看詳解；想自由問 AI 請用 AR 的「AI 助教」',
    bg: 'from-blue-500 to-indigo-600',
  },
  {
    emoji: '👁️',
    title: 'AR 模擬練習',
    desc: '透過鏡頭即時試戴眼鏡與隱形眼鏡，系統自動偵測臉型並提供建議',
    bg: 'from-emerald-500 to-teal-600',
  },
  {
    emoji: '📝',
    title: '知識測驗',
    desc: '從題庫隨機抽題，測試專業知識，立即看到答對解析',
    bg: 'from-amber-500 to-orange-600',
  },
  {
    emoji: '🚀',
    title: '準備好了！',
    desc: '手機用底部導覽、電腦用左側選單切換功能，更多功能在選單裡',
    bg: 'from-pink-500 to-rose-600',
  },
];

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onComplete }) => {
  const [current, setCurrent] = useState(0);

  const next = () => {
    if (current < slides.length - 1) {
      setCurrent(c => c + 1);
    } else {
      onComplete();
    }
  };

  const slide = slides[current];
  const isLast = current === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col">
      {/* Background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${slide.bg} transition-all duration-500`} />

      {/* Skip button */}
      <div className="relative z-10 flex justify-end p-5">
        <button
          onClick={onComplete}
          className="text-white/70 text-sm font-medium px-3 py-1.5 rounded-full border border-white/30 hover:bg-white/10 transition"
        >
          跳過
        </button>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="text-8xl mb-6 animate-bounce" style={{ animationDuration: '2s' }}>
          {slide.emoji}
        </div>
        <h2 className="text-2xl font-black text-white mb-4 leading-tight">
          {slide.title}
        </h2>
        <p className="text-white/80 text-base leading-relaxed max-w-xs">
          {slide.desc}
        </p>
      </div>

      {/* Bottom */}
      <div className="relative z-10 px-8 pb-10 flex flex-col items-center gap-5">
        {/* Dots */}
        <div className="flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`rounded-full transition-all duration-300 ${
                i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Next button */}
        <button
          onClick={next}
          className="w-full max-w-xs bg-white text-slate-800 font-bold py-3.5 rounded-2xl text-base shadow-xl hover:shadow-2xl transition-all active:scale-95"
        >
          {isLast ? '開始使用 →' : '下一步'}
        </button>
      </div>
    </div>
  );
};

export default OnboardingTour;
