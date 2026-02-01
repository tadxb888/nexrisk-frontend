// ============================================
// B-Book Alert List
// ============================================

import { useMemo } from 'react';
import { clsx } from 'clsx';

interface Alert {
  id: string;
  type: 'risk' | 'exposure' | 'threshold' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  login?: number;
  symbol?: string;
  timestamp: string;
  acknowledged: boolean;
}

function generateMockAlerts(): Alert[] {
  return [
    { id: '1', type: 'risk', severity: 'critical', message: 'Trader 7045 exceeded risk threshold', login: 7045, timestamp: new Date(Date.now() - 120000).toISOString(), acknowledged: false },
    { id: '2', type: 'exposure', severity: 'high', message: 'XAUUSD net exposure > $500K', symbol: 'XAUUSD', timestamp: new Date(Date.now() - 300000).toISOString(), acknowledged: false },
    { id: '3', type: 'threshold', severity: 'medium', message: 'B-Book P&L approaching daily limit', timestamp: new Date(Date.now() - 600000).toISOString(), acknowledged: true },
    { id: '4', type: 'risk', severity: 'high', message: 'Scalper cluster detected (5 traders)', timestamp: new Date(Date.now() - 900000).toISOString(), acknowledged: false },
    { id: '5', type: 'system', severity: 'low', message: 'LP connection latency elevated', timestamp: new Date(Date.now() - 1800000).toISOString(), acknowledged: true },
  ];
}

function formatTime(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (diff < 1) return 'Just now';
  if (diff < 60) return `${diff}m ago`;
  return `${Math.floor(diff / 60)}h ago`;
}

function getSeverityColor(s: string): string {
  if (s === 'critical') return '#8b4444';
  if (s === 'high') return '#c9a227';
  if (s === 'medium') return '#6b6b73';
  return '#4a4a52';
}

// Alert icon - small triangle
function AlertIcon({ severity }: { severity: string }) {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill={getSeverityColor(severity)}>
      <path d="M12 2L1 21h22L12 2zm0 3.5L19.5 19h-15L12 5.5z"/>
      <path d="M11 10h2v5h-2zM11 16h2v2h-2z"/>
    </svg>
  );
}

export function BBookAlertList() {
  const alerts = useMemo(() => generateMockAlerts(), []);
  const unackCount = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="flex flex-col h-full bg-[#141416]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2d2d32] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#8b8b93]">Alert Drawer</span>
          {unackCount > 0 && <span className="text-[9px] px-1 py-0.5 rounded bg-[#8b4444] text-[#e6e6e6]">{unackCount}</span>}
        </div>
        <button className="text-[10px] text-[#2d7a7a] hover:text-[#358888]">View All</button>
      </div>

      {/* Alerts */}
      <div className="flex-1 overflow-auto">
        {alerts.map((a) => (
          <div key={a.id} className={clsx('px-3 py-2 border-b border-[#2d2d32] cursor-pointer hover:bg-[#1e1e21]', !a.acknowledged && 'bg-[#1a1a1c]')}>
            <div className="flex items-start gap-2">
              <AlertIcon severity={a.severity} />
              <div className="flex-1 min-w-0">
                <p className={clsx('text-[10px] leading-tight', a.acknowledged ? 'text-[#6b6b73]' : 'text-[#e6e6e6]')}>{a.message}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {a.login && <span className="text-[9px] font-mono text-[#2d7a7a]">#{a.login}</span>}
                  {a.symbol && <span className="text-[9px] font-mono text-[#6b6b73]">{a.symbol}</span>}
                  <span className="text-[9px] text-[#4a4a52]">{formatTime(a.timestamp)}</span>
                </div>
              </div>
              {!a.acknowledged && <div className="w-1.5 h-1.5 rounded-full bg-[#8b4444] mt-1" />}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-[#2d2d32] flex items-center justify-between">
        <button className="text-[10px] text-[#6b6b73] hover:text-[#8b8b93]">Mark all read</button>
        <button className="text-[10px] text-[#2d7a7a] hover:text-[#358888]">Configure →</button>
      </div>
    </div>
  );
}

export default BBookAlertList;