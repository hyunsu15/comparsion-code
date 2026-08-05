import React, { useEffect } from 'react';

// 아이콘은 외부 라이브러리 없이 인라인 SVG 로 둔다. (프로젝트는 이모지/Tailwind 기반, lucide 미사용)
// currentColor 를 쓰므로 부모의 text-* 색상을 그대로 따른다.
const Svg = ({ size = 18, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);
const CheckCircle2 = ({ size }) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></Svg>
);
const AlertCircle = ({ size }) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></Svg>
);
const Info = ({ size }) => (
  <Svg size={size}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></Svg>
);
const AlertTriangle = ({ size }) => (
  <Svg size={size}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></Svg>
);
const X = ({ size }) => (
  <Svg size={size}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);

export default function Toast({ message, type = 'success', onClose, duration }) {
  const isAlert = type === 'error' || type === 'warning';
  const resolvedDuration = duration ?? (isAlert ? 6000 : 3000);

  useEffect(() => {
    const timer = setTimeout(onClose, resolvedDuration);
    return () => clearTimeout(timer);
  }, [onClose, resolvedDuration]);

  const configs = {
    success: {
      color: 'border-[var(--success)]/50 bg-[var(--success)]/10 text-[var(--success)]',
      icon: <CheckCircle2 size={18} />
    },
    error: {
      color: 'border-[var(--error)]/50 bg-[var(--error)]/10 text-[var(--error)]',
      icon: <AlertCircle size={18} />
    },
    info: {
      color: 'border-[var(--accent)]/50 bg-[var(--accent)]/10 text-[var(--accent)]',
      icon: <Info size={18} />
    },
    warning: {
      color: 'border-[var(--warning)]/50 bg-[var(--warning)]/10 text-[var(--warning)]',
      icon: <AlertTriangle size={18} />
    }
  };

  const config = configs[type] || configs.success;

  return (
    <div
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
      className={`fixed top-10 right-10 z-[9999] flex items-center gap-3 px-5 py-4 rounded-2xl border shadow-2xl animate-in fade-in slide-in-from-top-5 duration-300 ${config.color} backdrop-blur-md`}
    >
      <div className="shrink-0">{config.icon}</div>
      <p className="text-sm font-bold tracking-tight whitespace-pre-wrap">{message}</p>
      <button
        onClick={onClose}
        aria-label="닫기"
        className="ml-2 p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
