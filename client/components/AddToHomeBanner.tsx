import React, { useEffect, useState } from 'react';

/**
 * 「加入主畫面」提示橫幅（手機限定）
 * - Android：攔截到 beforeinstallprompt 時，按鈕直接叫出原生安裝視窗
 * - iOS：顯示「分享 → 加入主畫面」步驟說明
 * - 已是安裝版（standalone）或 7 天內關閉過 → 不顯示
 */
const DISMISS_KEY = 'edumind_a2hs_dismissed_at';
const REMIND_AFTER_DAYS = 7;

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

const AddToHomeBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState<boolean>(() => !!(window as any).__a2hsPrompt);
  const [showHelp, setShowHelp] = useState(false);
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isAndroid = /Android/i.test(navigator.userAgent);

  useEffect(() => {
    if (!(isIOS || isAndroid) || isStandalone()) return;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000) return;
    setVisible(true);
    // 原生安裝事件可能晚於元件掛載才觸發（或在小米等環境完全不觸發）
    const onReady = () => setCanInstall(true);
    window.addEventListener('a2hs-ready', onReady);
    // Android 安裝完成後自動收起
    const onInstalled = () => { setInstalled(true); setTimeout(() => setVisible(false), 2500); };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('a2hs-ready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleInstall = async () => {
    const p = (window as any).__a2hsPrompt;
    if (!p) return;
    p.prompt();
    try {
      const { outcome } = await p.userChoice;
      if (outcome === 'accepted') { setInstalled(true); setTimeout(() => setVisible(false), 2000); }
    } catch { /* ignore */ }
    (window as any).__a2hsPrompt = null;
  };

  const hasNativePrompt = isAndroid && canInstall && !!(window as any).__a2hsPrompt;

  return (
    <div className="fixed left-3 right-3 z-50 md:hidden"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 4.5rem)' }}>
      <div className="bg-slate-900 text-white rounded-2xl shadow-2xl shadow-black/30 border border-slate-700 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0">📲</span>
          <div className="flex-1 min-w-0">
            {installed ? (
              <p className="text-sm font-bold text-emerald-300">✅ 已加入主畫面！</p>
            ) : (
              <>
                <p className="text-sm font-bold">把 EduMind 加到主畫面</p>
                {isIOS ? (
                  <p className="text-xs text-slate-300 mt-0.5">
                    點下方「分享 <span className="inline-block border border-slate-500 rounded px-1">⎙</span>」→「<b>加入主畫面</b>」，下次像 App 一樣全螢幕開啟
                  </p>
                ) : (
                  <p className="text-xs text-slate-300 mt-0.5">像 App 一樣開啟，AR 試戴體驗更好</p>
                )}
              </>
            )}
          </div>
          {!installed && hasNativePrompt && (
            <button onClick={handleInstall}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
              加入主畫面
            </button>
          )}
          {!installed && isAndroid && !hasNativePrompt && (
            <button onClick={() => setShowHelp(v => !v)}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
              {showHelp ? '收起' : '怎麼加入？'}
            </button>
          )}
          <button onClick={dismiss} aria-label="關閉提示"
            className="shrink-0 text-slate-400 hover:text-white text-lg leading-none p-1">✕</button>
        </div>

        {/* Android 手動加入教學（小米等瀏覽器沒有原生安裝視窗時） */}
        {showHelp && !installed && (
          <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-300 space-y-2">
            <p className="font-bold text-white">依你的瀏覽器選一種方式：</p>
            <p>
              <b className="text-indigo-300">Chrome</b>：右上角「<b>⋮</b>」選單 →
              「<b>安裝應用程式</b>」或「<b>加到主畫面</b>」→ 確認
            </p>
            <p>
              <b className="text-indigo-300">小米瀏覽器</b>：下方「<b>☰</b>」選單 →
              「<b>添加到桌面</b>」（部分版本在「工具」內）
            </p>
            <p className="text-slate-400">
              💡 找不到選項的話，建議改用 <b>Chrome</b> 開啟本網站再加入，AR 功能支援度也最好。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddToHomeBanner;
