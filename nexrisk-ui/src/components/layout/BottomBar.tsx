// ============================================
// BottomBar Component
// Server CPU, RAM, disk usage, ping to LPs, latency
// ============================================

import { useQuery } from '@tanstack/react-query';
import { healthApi } from '@/services/api';
import { useSystemStore } from '@/stores';
import { useEffect } from 'react';
import { clsx } from 'clsx';

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface StatusItemProps {
  label: string;
  value: string | number;
  status?: 'ok' | 'warning' | 'error';
  unit?: string;
}

function StatusItem({ label, value, status = 'ok', unit }: StatusItemProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted">{label}:</span>
      <span className={clsx(
        'font-mono',
        status === 'ok' && 'text-text-primary',
        status === 'warning' && 'text-risk-medium',
        status === 'error' && 'text-risk-critical'
      )}>
        {value}{unit && <span className="text-text-muted text-xs ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

export function BottomBar() {
  const { setHealth, setConnected } = useSystemStore();

  // Health check query
  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: healthApi.getHealth,
    refetchInterval: 10000,
    retry: 3,
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: healthApi.getStats,
    refetchInterval: 5000,
  });

  // Update global state
  useEffect(() => {
    if (health) {
      setHealth(health);
      setConnected(health.status === 'healthy');
    } else if (isError) {
      setConnected(false);
    }
  }, [health, isError, setHealth, setConnected]);

  return (
    <footer className="h-7 bg-[#313032] border-t border-[#808080] flex items-center justify-between px-4 text-xs shrink-0">
      {/* Left Section - Server Resources */}
      <div className="flex items-center gap-4">
        <StatusItem 
          label="CPU" 
          value="24" 
          unit="%" 
          status="ok" 
        />
        <StatusItem 
          label="RAM" 
          value="4.2" 
          unit="GB" 
          status="ok" 
        />
        <StatusItem 
          label="Disk" 
          value="67" 
          unit="%" 
          status="ok" 
        />
        
        <div className="w-px h-4 bg-border-muted" />
        
        {/* Component Status */}
        <StatusItem 
          label="Redis" 
          value={health?.redis_connected ? 'OK' : 'ERR'} 
          status={health?.redis_connected ? 'ok' : 'error'} 
        />
        <StatusItem 
          label="PG" 
          value={health?.database_connected ? 'OK' : 'ERR'} 
          status={health?.database_connected ? 'ok' : 'error'} 
        />
        <StatusItem 
          label="MT5" 
          value={health?.mt5_connected ? 'OK' : 'ERR'} 
          status={health?.mt5_connected ? 'ok' : 'error'} 
        />
      </div>

      {/* Center Section - Activity Metrics */}
      <div className="flex items-center gap-4">
        {stats && (
          <>
            <StatusItem 
              label="Events/s" 
              value={stats.events_per_second.toFixed(1)} 
            />
            <StatusItem 
              label="Traders" 
              value={stats.traders_active} 
            />
            <StatusItem 
              label="Positions" 
              value={stats.positions_open} 
            />
            <StatusItem 
              label="Alerts" 
              value={stats.alerts_pending} 
              status={stats.alerts_pending > 5 ? 'warning' : 'ok'}
            />
          </>
        )}
      </div>

      {/* Right Section - LP Latency & Uptime */}
      <div className="flex items-center gap-4">
        {/* LP Ping (placeholder values) */}
        <div className="flex items-center gap-2">
          <span className="text-text-muted">LP Ping:</span>
          <span className="font-mono text-pnl-positive">LP1: 12ms</span>
          <span className="font-mono text-pnl-positive">LP2: 18ms</span>
        </div>
        
        <div className="w-px h-4 bg-border-muted" />
        
        {/* Uptime */}
        {health && (
          <StatusItem 
            label="Uptime" 
            value={formatUptime(health.uptime_seconds)} 
          />
        )}
      </div>
    </footer>
  );
}

export default BottomBar;
