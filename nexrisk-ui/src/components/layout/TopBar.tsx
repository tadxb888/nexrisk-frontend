// ============================================
// TopBar Component
// Logo, Date/Time
// ============================================

import { useState, useEffect } from 'react';

// NexRisk Logo Component
const NexRiskLogo = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32">
    <defs>
      <linearGradient id="dustyMauveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#6B9AC4' }} />
        <stop offset="100%" style={{ stopColor: '#C4A6B8' }} />
      </linearGradient>
      <filter id="pulseGlow">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g transform="translate(24, 24)">
      <path 
        d="M -12 -2 L 0 14 L 18 -14" 
        stroke="url(#dustyMauveGrad)" 
        strokeWidth="5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none"
      />
      <path 
        d="M -12 2 L 0 -14 L 18 14" 
        stroke="url(#dustyMauveGrad)" 
        strokeWidth="5" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none"
      />
    </g>
  </svg>
);

export function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <header className="h-11 bg-[#313032] border-b border-[#808080] flex items-center justify-between px-4 shrink-0">
      {/* Left Section - Logo & Brand */}
      <div className="flex items-center gap-3">
        <NexRiskLogo />
        <span className="text-white font-semibold text-lg">NexRisk</span>
      </div>

      {/* Right Section - Date & Time */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[#999]">{formatDate(currentTime)}</span>
        <span className="font-mono text-white">{formatTime(currentTime)}</span>
      </div>
    </header>
  );
}

export default TopBar;