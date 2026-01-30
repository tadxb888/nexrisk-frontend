// ============================================
// TopBar Component
// Broker info, Timeframe switcher, Settings, Alert drawer toggle
// ============================================

import { useState, useEffect } from 'react';
import { useUIStore, useAlertsStore, useSystemStore } from '@/stores';
import { clsx } from 'clsx';

// SVG Icons
const SettingsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="9" cy="9" r="2.5" />
    <path d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.4 3.4l1.4 1.4M13.2 13.2l1.4 1.4M3.4 14.6l1.4-1.4M13.2 4.8l1.4-1.4" />
  </svg>
);

const BellIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M13.5 6.75a4.5 4.5 0 1 0-9 0c0 5.25-2.25 6.75-2.25 6.75h13.5s-2.25-1.5-2.25-6.75" />
    <path d="M10.3 15a1.5 1.5 0 0 1-2.6 0" />
  </svg>
);

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3.5 5.25L7 8.75L10.5 5.25" />
  </svg>
);

const PanelRightClose = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="14" height="12" rx="1" />
    <path d="M12 3v12" />
    <path d="M8 7l-2 2 2 2" />
  </svg>
);

const PanelRightOpen = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="2" y="3" width="14" height="12" rx="1" />
    <path d="M12 3v12" />
    <path d="M6 7l2 2-2 2" />
  </svg>
);

export function TopBar() {
  const [currentTime, setCurrentTime] = useState(new Date());
  const { alertDrawerOpen, toggleAlertDrawer, timeframe, setTimeframe, bookFilter, setBookFilter } = useUIStore();
  const { pendingCount, criticalCount } = useAlertsStore();
  const { isConnected, health } = useSystemStore();

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <header className="h-11 bg-background-secondary border-b border-border flex items-center justify-between px-4 shrink-0">
      {/* Left Section - Broker Context */}
      <div className="flex items-center gap-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <span className={clsx(
            'status-dot',
            isConnected ? 'status-dot-low' : 'status-dot-critical'
          )} />
          <span className={clsx(
            'text-sm',
            isConnected ? 'text-pnl-positive' : 'text-pnl-negative'
          )}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Server Time */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary">{formatDate(currentTime)}</span>
          <span className="font-mono text-text-primary">{formatTime(currentTime)}</span>
          <span className="text-text-muted text-xs">UTC</span>
        </div>

        {/* MT5/DB Status */}
        {health && (
          <>
            <div className="w-px h-5 bg-border" />
            <div className="flex items-center gap-3 text-sm">
              <span className="text-text-muted">MT5:</span>
              <span className={health.mt5_connected ? 'text-pnl-positive' : 'text-pnl-negative'}>
                {health.mt5_connected ? 'OK' : 'ERR'}
              </span>
              <span className="text-text-muted">DB:</span>
              <span className={health.database_connected ? 'text-pnl-positive' : 'text-pnl-negative'}>
                {health.database_connected ? 'OK' : 'ERR'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Center Section - Timeframe & Book Type Switcher */}
      <div className="flex items-center gap-3">
        {/* Timeframe Switcher */}
        <div className="relative">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value as typeof timeframe)}
            className="select appearance-none pr-7 text-sm"
          >
            <option value="5m">Intraday (5m)</option>
            <option value="15m">Intraday (15m)</option>
            <option value="1h">Hourly</option>
            <option value="1d">Daily</option>
          </select>
          <ChevronDown />
        </div>

        {/* Book Type Filter */}
        <div className="relative">
          <select
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value as typeof bookFilter)}
            className="select appearance-none pr-7 text-sm"
          >
            <option value="ALL">All Books</option>
            <option value="A">A-Book</option>
            <option value="B">B-Book</option>
            <option value="C">C-Book</option>
          </select>
          <ChevronDown />
        </div>
      </div>

      {/* Right Section - Settings & Alert Toggle */}
      <div className="flex items-center gap-2">
        {/* Settings */}
        <button
          className="btn-icon text-text-secondary hover:text-text-primary"
          aria-label="Settings"
        >
          <SettingsIcon />
        </button>

        {/* Separator */}
        <div className="w-px h-5 bg-border" />

        {/* Alert Drawer Toggle - ICON ONLY */}
        <button
          onClick={toggleAlertDrawer}
          className={clsx(
            'btn-icon relative',
            alertDrawerOpen ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
          )}
          aria-label={alertDrawerOpen ? 'Close alerts' : 'Open alerts'}
        >
          {alertDrawerOpen ? <PanelRightClose /> : <PanelRightOpen />}
          
          {/* Alert Badge */}
          {pendingCount > 0 && (
            <span className={clsx(
              'absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center',
              'text-[10px] font-semibold text-text-primary rounded-full px-1',
              criticalCount > 0 ? 'bg-risk-critical' : 'bg-risk-high'
            )}>
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

export default TopBar;
