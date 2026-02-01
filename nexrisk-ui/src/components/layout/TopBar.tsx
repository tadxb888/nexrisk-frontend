// ============================================
// TopBar Component
// Logo, KPI Cards with sparklines, Date/Time
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

// Mini Sparkline Component
interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

function Sparkline({ data, color = '#4ecdc4', width = 50, height = 20 }: SparklineProps) {
  if (!data.length) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((val - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// KPI Card Component (no box)
interface KPICardProps {
  label: string;
  value: string;
  change?: string;
  changePositive?: boolean;
  sparkData: number[];
  sparkColor?: string;
}

function KPICard({ label, value, change, changePositive, sparkData, sparkColor = '#4ecdc4' }: KPICardProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wide text-white">{label}</span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-white">{value}</span>
          {change && (
            <span className={`text-[10px] ${changePositive ? 'text-[#66e07a]' : 'text-[#ff6b6b]'}`}>
              {changePositive ? '▲' : '▼'}{change}
            </span>
          )}
        </div>
      </div>
      <Sparkline data={sparkData} color={sparkColor} />
    </div>
  );
}

// Mock data for 5 business days
const mockSparkData = {
  realizedPL: [12500, 14200, 11800, 15600, 16200],
  floatingPL: [3200, 2800, 4100, 3600, 4800],
  netPL: [15700, 17000, 15900, 19200, 21000],
  revenueExpense: [8200, 9100, 8800, 9500, 10200],
  totalVolume: [245, 280, 265, 310, 295],
};

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

  const currentMonth = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <header className="h-12 bg-[#313032] border-b border-[#808080] flex items-center justify-between px-4 shrink-0">
      {/* Left Section - Logo & Brand */}
      <div className="flex items-center gap-3 shrink-0">
        <NexRiskLogo />
        <div className="flex flex-col">
          <span className="text-white font-semibold text-base leading-tight">NexRisk</span>
          <span className="text-[9px] text-white">{currentMonth}</span>
        </div>
      </div>

      {/* Center Section - KPI Cards spaced out */}
      <div className="flex-1 flex items-center justify-center gap-20">
        <KPICard
          label="Realized P/L"
          value="$16.2K"
          change="4%"
          changePositive={true}
          sparkData={mockSparkData.realizedPL}
          sparkColor="#4ecdc4"
        />
        <KPICard
          label="Floating P/L"
          value="$4.8K"
          change="33%"
          changePositive={true}
          sparkData={mockSparkData.floatingPL}
          sparkColor="#4ecdc4"
        />
        <KPICard
          label="Net P/L"
          value="$21.0K"
          change="9%"
          changePositive={true}
          sparkData={mockSparkData.netPL}
          sparkColor="#66e07a"
        />
        <KPICard
          label="Rev & Exp"
          value="$10.2K"
          change="7%"
          changePositive={true}
          sparkData={mockSparkData.revenueExpense}
          sparkColor="#4ecdc4"
        />
        <KPICard
          label="Total Volume"
          value="295M"
          change="5%"
          changePositive={false}
          sparkData={mockSparkData.totalVolume}
          sparkColor="#e0a020"
        />
      </div>

      {/* Right Section - Date & Time */}
      <div className="flex items-center gap-2 text-sm shrink-0">
        <span className="text-[#999]">{formatDate(currentTime)}</span>
        <span className="font-mono text-white">{formatTime(currentTime)}</span>
      </div>
    </header>
  );
}

export default TopBar;