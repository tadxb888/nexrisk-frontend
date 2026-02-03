// ============================================
// Settings Sub-Pages
// Individual pages for each settings section
// Following consistent layout: Status → Config → Tools → Recent Changes
// ============================================

import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

// Back arrow icon
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
    <path d="M10.957,12.354l3.5,3.5c.195.195.195.512,0,.707-.098.098-.226.146-.354.146s-.256-.049-.354-.146l-3.5-3.5c-.462-.463-.715-1.078-.715-1.732s.253-1.269.715-1.732l3.5-3.5c.195-.195.512-.195.707,0,.195.195.195.512,0,.707l-3.5,3.5c-.274.274-.424.638-.424,1.025s.15.751.424,1.025Z"/>
  </svg>
);

// Shared header component for all settings sub-pages
function SettingsHeader({ 
  title, 
  subtitle, 
  owner 
}: { 
  title: string; 
  subtitle: string; 
  owner: string;
}) {
  const navigate = useNavigate();
  
  return (
    <div className="mb-6">
      <button 
        onClick={() => navigate('/settings')}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-3 transition-colors"
      >
        <BackIcon />
        <span>Back to Settings</span>
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">{title}</h1>
          <p className="text-text-secondary">{subtitle}</p>
        </div>
        <span className={clsx(
          'px-3 py-1 rounded text-xs font-medium',
          owner.includes('IT') && 'bg-info-bg text-info border border-info-border',
          owner.includes('Risk') && !owner.includes('IT') && 'bg-accent-subtle text-accent border border-accent-muted',
          owner.includes('IT') && owner.includes('Risk') && 'bg-surface-active text-text-secondary border border-border-muted'
        )}>
          {owner}
        </span>
      </div>
    </div>
  );
}

// Status card component
function StatusCard({ 
  label, 
  value, 
  status 
}: { 
  label: string; 
  value: string; 
  status?: 'ok' | 'warning' | 'critical' | 'info';
}) {
  return (
    <div className="panel p-4">
      <span className="text-sm text-text-muted">{label}</span>
      <p className={clsx(
        'text-xl font-mono mt-1',
        status === 'ok' && 'text-pnl-positive',
        status === 'warning' && 'text-risk-medium',
        status === 'critical' && 'text-risk-critical',
        status === 'info' && 'text-info',
        !status && 'text-text-primary'
      )}>
        {value}
      </p>
    </div>
  );
}

// Placeholder content component
function PlaceholderContent({ module }: { module: string }) {
  return (
    <div className="flex-1 flex items-center justify-center panel">
      <div className="text-center">
        <p className="text-text-muted mb-2">{module} Configuration</p>
        <p className="text-sm text-text-secondary">Module implementation in progress</p>
      </div>
    </div>
  );
}

// ============================================
// Identity & Security Page
// ============================================
export function SecuritySettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Identity & Security" 
        subtitle="Access control, users, roles, and MFA policies"
        owner="IT-owned"
      />
      
      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="Active Users" value="24" status="ok" />
        <StatusCard label="MFA Enabled" value="92%" status="warning" />
        <StatusCard label="Active Sessions" value="18" status="info" />
        <StatusCard label="Root Account" value="Disabled" status="ok" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Users & Roles Panel */}
        <div className="col-span-2 panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Users & Roles</span>
            <button className="btn btn-primary">+ Add User</button>
          </div>
          <div className="flex-1 p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2">User</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2">MFA</th>
                  <th className="pb-2">Last Login</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-muted">
                  <td className="py-3 text-text-primary">john.admin@broker.com</td>
                  <td className="py-3 text-accent">IT Admin</td>
                  <td className="py-3 text-pnl-positive">Enabled</td>
                  <td className="py-3 text-text-secondary font-mono">2h ago</td>
                  <td className="py-3"><span className="status-dot status-dot-low inline-block"></span></td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-3 text-text-primary">sarah.risk@broker.com</td>
                  <td className="py-3 text-accent">Risk Manager</td>
                  <td className="py-3 text-pnl-positive">Enabled</td>
                  <td className="py-3 text-text-secondary font-mono">5h ago</td>
                  <td className="py-3"><span className="status-dot status-dot-low inline-block"></span></td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-3 text-text-primary">mike.analyst@broker.com</td>
                  <td className="py-3 text-text-secondary">Risk Analyst</td>
                  <td className="py-3 text-risk-medium">Pending</td>
                  <td className="py-3 text-text-secondary font-mono">1d ago</td>
                  <td className="py-3"><span className="status-dot status-dot-medium inline-block"></span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* MFA & Policies Panel */}
        <div className="panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Security Policies</span>
          </div>
          <div className="flex-1 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Enforce MFA</span>
              <span className="text-sm text-pnl-positive font-mono">Enabled</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Session Timeout</span>
              <span className="text-sm text-text-primary font-mono">30 min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">IP Allowlist</span>
              <span className="text-sm text-text-muted font-mono">3 ranges</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">VPN Required</span>
              <span className="text-sm text-risk-medium font-mono">Disabled</span>
            </div>
            <hr className="border-border-muted" />
            <div className="p-3 rounded bg-risk-high-bg border border-risk-high-border">
              <p className="text-xs text-risk-high">
                ⚠ Root account was used 3 days ago. Consider disabling root access after admin bootstrap.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Changes Footer */}
      <div className="mt-4 panel p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Recent: User 'mike.analyst' created by john.admin • 2 days ago</span>
          <button className="text-accent hover:underline">View full audit log →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Connectivity Page
// ============================================
export function ConnectivitySettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Connectivity" 
        subtitle="MT5 servers, LPs, FIX sessions, and health monitoring"
        owner="IT + Risk"
      />
      
      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="MT5 Servers" value="3/3 Online" status="ok" />
        <StatusCard label="LP Sessions" value="2/2 Active" status="ok" />
        <StatusCard label="Avg Latency" value="12ms" status="ok" />
        <StatusCard label="Last Failover" value="Never" status="info" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-2 gap-4">
        {/* MT5 Servers Panel */}
        <div className="panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">MT5 Servers</span>
            <button className="btn btn-primary">+ Add Server</button>
          </div>
          <div className="flex-1 p-4 space-y-3">
            {/* Main Server */}
            <div className="p-3 rounded border border-border-muted bg-surface-hover">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">MT5-MAIN</span>
                <span className="px-2 py-0.5 rounded text-xs bg-risk-low-bg text-risk-low border border-risk-low-border">Primary</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-text-muted">Status</span>
                  <p className="text-pnl-positive font-mono">Connected</p>
                </div>
                <div>
                  <span className="text-text-muted">Latency</span>
                  <p className="text-text-primary font-mono">8ms</p>
                </div>
                <div>
                  <span className="text-text-muted">Last Sync</span>
                  <p className="text-text-secondary font-mono">2s ago</p>
                </div>
              </div>
            </div>
            
            {/* Backup Server */}
            <div className="p-3 rounded border border-border-muted">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">MT5-BACKUP</span>
                <span className="px-2 py-0.5 rounded text-xs bg-surface-active text-text-muted border border-border-muted">Standby</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-text-muted">Status</span>
                  <p className="text-pnl-positive font-mono">Ready</p>
                </div>
                <div>
                  <span className="text-text-muted">Latency</span>
                  <p className="text-text-primary font-mono">15ms</p>
                </div>
                <div>
                  <span className="text-text-muted">Last Sync</span>
                  <p className="text-text-secondary font-mono">5s ago</p>
                </div>
              </div>
            </div>
            
            {/* White Label */}
            <div className="p-3 rounded border border-border-muted">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">MT5-WL-ALPHA</span>
                <span className="px-2 py-0.5 rounded text-xs bg-info-bg text-info border border-info-border">White Label</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-text-muted">Status</span>
                  <p className="text-pnl-positive font-mono">Connected</p>
                </div>
                <div>
                  <span className="text-text-muted">Latency</span>
                  <p className="text-text-primary font-mono">22ms</p>
                </div>
                <div>
                  <span className="text-text-muted">Last Sync</span>
                  <p className="text-text-secondary font-mono">3s ago</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Liquidity Providers Panel */}
        <div className="panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Liquidity Providers</span>
            <button className="btn btn-primary">+ Add LP</button>
          </div>
          <div className="flex-1 p-4 space-y-3">
            {/* LP 1 */}
            <div className="p-3 rounded border border-border-muted bg-surface-hover">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">LP-PRIMEBROKER</span>
                <div className="flex gap-2">
                  <button className="text-xs text-accent hover:underline">Test Trade</button>
                  <button className="text-xs text-text-muted hover:text-text-primary">Edit</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <span className="text-text-muted">Quote Session</span>
                  <p className="text-pnl-positive font-mono">Active</p>
                </div>
                <div>
                  <span className="text-text-muted">Trade Session</span>
                  <p className="text-pnl-positive font-mono">Active</p>
                </div>
              </div>
              <div className="text-xs text-text-muted">
                FIX 4.4 • Last heartbeat: 1s ago • Cert expires: 89 days
              </div>
            </div>
            
            {/* LP 2 */}
            <div className="p-3 rounded border border-border-muted">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-text-primary">LP-SECONDARY</span>
                <div className="flex gap-2">
                  <button className="text-xs text-accent hover:underline">Test Trade</button>
                  <button className="text-xs text-text-muted hover:text-text-primary">Edit</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                <div>
                  <span className="text-text-muted">Quote Session</span>
                  <p className="text-pnl-positive font-mono">Active</p>
                </div>
                <div>
                  <span className="text-text-muted">Trade Session</span>
                  <p className="text-pnl-positive font-mono">Active</p>
                </div>
              </div>
              <div className="text-xs text-text-muted">
                FIX 4.4 • Last heartbeat: 2s ago • Cert expires: 234 days
              </div>
            </div>

            {/* Test Trade Sandbox Info */}
            <div className="p-3 rounded bg-accent-subtle border border-accent-muted">
              <p className="text-xs text-accent">
                🔒 Test trade sandbox: Max 0.01 lots, EURUSD only, market hours only
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Changes Footer */}
      <div className="mt-4 panel p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Recent: LP-PRIMEBROKER credentials rotated by john.admin • 12 days ago</span>
          <button className="text-accent hover:underline">View connection logs →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Market & Symbology Page
// ============================================
export function SymbologySettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Market & Symbology" 
        subtitle="Symbol mapping, unifiers, and trading conditions"
        owner="Risk-owned"
      />
      
      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="Mapped Symbols" value="127/132" status="warning" />
        <StatusCard label="Unifier Groups" value="18" status="info" />
        <StatusCard label="Validation Issues" value="5" status="critical" />
        <StatusCard label="Last Updated" value="2h ago" status="info" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Symbol Mapping Panel */}
        <div className="col-span-2 panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Symbol Mapping (LP ↔ MT5)</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost">Validate All</button>
              <button className="btn btn-primary">+ Add Mapping</button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2">MT5 Symbol</th>
                  <th className="pb-2">LP Symbol</th>
                  <th className="pb-2">Unifier</th>
                  <th className="pb-2">Min/Max</th>
                  <th className="pb-2">Step</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-primary font-mono">EURUSD</td>
                  <td className="py-2 text-text-secondary font-mono">EUR/USD</td>
                  <td className="py-2 text-accent">EURUSD</td>
                  <td className="py-2 text-text-secondary font-mono">0.01 / 100</td>
                  <td className="py-2 text-text-secondary font-mono">0.01</td>
                  <td className="py-2"><span className="text-pnl-positive">✓</span></td>
                </tr>
                <tr className="border-b border-border-muted bg-risk-critical-bg">
                  <td className="py-2 text-text-primary font-mono">XAUUSD</td>
                  <td className="py-2 text-text-secondary font-mono">GOLD</td>
                  <td className="py-2 text-accent">XAUUSD</td>
                  <td className="py-2 text-risk-critical font-mono">0.01 / 50 ≠</td>
                  <td className="py-2 text-text-secondary font-mono">0.01</td>
                  <td className="py-2"><span className="text-risk-critical">⚠</span></td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-primary font-mono">GBPUSD</td>
                  <td className="py-2 text-text-secondary font-mono">GBP/USD</td>
                  <td className="py-2 text-accent">GBPUSD</td>
                  <td className="py-2 text-text-secondary font-mono">0.01 / 100</td>
                  <td className="py-2 text-text-secondary font-mono">0.01</td>
                  <td className="py-2"><span className="text-pnl-positive">✓</span></td>
                </tr>
                <tr className="border-b border-border-muted bg-risk-high-bg">
                  <td className="py-2 text-text-primary font-mono">USDJPY</td>
                  <td className="py-2 text-risk-high font-mono">— unmapped —</td>
                  <td className="py-2 text-text-muted">—</td>
                  <td className="py-2 text-text-muted font-mono">—</td>
                  <td className="py-2 text-text-muted font-mono">—</td>
                  <td className="py-2"><span className="text-risk-high">!</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Validation & Unifiers Panel */}
        <div className="flex flex-col gap-4">
          {/* Validation Report */}
          <div className="panel flex-1">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Validation Report</span>
            </div>
            <div className="p-4 space-y-2">
              <div className="p-2 rounded bg-risk-critical-bg border border-risk-critical-border text-sm">
                <span className="text-risk-critical">✗ </span>
                <span className="text-text-secondary">5 LP symbols without MT5 mapping</span>
              </div>
              <div className="p-2 rounded bg-risk-high-bg border border-risk-high-border text-sm">
                <span className="text-risk-high">⚠ </span>
                <span className="text-text-secondary">2 volume step mismatches</span>
              </div>
              <div className="p-2 rounded bg-risk-medium-bg border border-risk-medium-border text-sm">
                <span className="text-risk-medium">△ </span>
                <span className="text-text-secondary">3 trading hours differences</span>
              </div>
              <div className="p-2 rounded bg-risk-low-bg border border-risk-low-border text-sm">
                <span className="text-risk-low">✓ </span>
                <span className="text-text-secondary">122 symbols fully validated</span>
              </div>
            </div>
          </div>

          {/* Unifier Groups */}
          <div className="panel flex-1">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Unifier Groups</span>
            </div>
            <div className="p-4 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-text-secondary">FX Majors</span>
                <span className="text-text-primary font-mono">7 symbols</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">FX Minors</span>
                <span className="text-text-primary font-mono">12 symbols</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Metals</span>
                <span className="text-text-primary font-mono">4 symbols</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Indices</span>
                <span className="text-text-primary font-mono">8 symbols</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Crypto</span>
                <span className="text-text-primary font-mono">6 symbols</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Changes Footer */}
      <div className="mt-4 panel p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Recent: XAUUSD max lot changed from 100 to 50 by sarah.risk • 2h ago</span>
          <button className="text-accent hover:underline">View change history →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Operations & Audit Page
// ============================================
export function AuditSettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Operations & Audit" 
        subtitle="Logs, backups, retention policies, and compliance"
        owner="IT-owned"
      />
      
      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="Last Backup" value="2h ago" status="ok" />
        <StatusCard label="Log Retention" value="90 days" status="info" />
        <StatusCard label="Storage Used" value="42.3 GB" status="info" />
        <StatusCard label="Change Events Today" value="47" status="info" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Recent Changes Panel */}
        <div className="col-span-2 panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Change Audit Log</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost">Export</button>
              <button className="btn btn-ghost">Filter</button>
            </div>
          </div>
          <div className="flex-1 p-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2">Timestamp</th>
                  <th className="pb-2">User</th>
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Target</th>
                  <th className="pb-2">Source IP</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-secondary font-mono">14:32:18</td>
                  <td className="py-2 text-text-primary">sarah.risk</td>
                  <td className="py-2 text-risk-medium">Modified</td>
                  <td className="py-2 text-text-secondary">Symbol: XAUUSD max_lot</td>
                  <td className="py-2 text-text-muted font-mono">10.0.1.45</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-secondary font-mono">14:28:02</td>
                  <td className="py-2 text-text-primary">john.admin</td>
                  <td className="py-2 text-pnl-positive">Created</td>
                  <td className="py-2 text-text-secondary">User: mike.analyst</td>
                  <td className="py-2 text-text-muted font-mono">10.0.1.12</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-secondary font-mono">13:45:33</td>
                  <td className="py-2 text-text-primary">system</td>
                  <td className="py-2 text-info">Backup</td>
                  <td className="py-2 text-text-secondary">Full backup completed</td>
                  <td className="py-2 text-text-muted font-mono">—</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-secondary font-mono">12:15:44</td>
                  <td className="py-2 text-text-primary">sarah.risk</td>
                  <td className="py-2 text-risk-medium">Modified</td>
                  <td className="py-2 text-text-secondary">Unifier: METALS group</td>
                  <td className="py-2 text-text-muted font-mono">10.0.1.45</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2 text-text-secondary font-mono">11:02:18</td>
                  <td className="py-2 text-text-primary">john.admin</td>
                  <td className="py-2 text-risk-critical">Deleted</td>
                  <td className="py-2 text-text-secondary">User: old.user</td>
                  <td className="py-2 text-text-muted font-mono">10.0.1.12</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Backup & Retention Panel */}
        <div className="flex flex-col gap-4">
          {/* Backup Status */}
          <div className="panel">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Backup Status</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Last Full Backup</span>
                <span className="text-pnl-positive font-mono">2h ago</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Last Incremental</span>
                <span className="text-text-primary font-mono">15m ago</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Next Scheduled</span>
                <span className="text-text-primary font-mono">22:00 UTC</span>
              </div>
              <hr className="border-border-muted" />
              <button className="btn btn-primary w-full">Run Backup Now</button>
            </div>
          </div>

          {/* Retention Policies */}
          <div className="panel flex-1">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Retention Policies</span>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Audit Logs</span>
                <span className="text-text-primary font-mono">90 days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">FIX Logs</span>
                <span className="text-text-primary font-mono">30 days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Trade History</span>
                <span className="text-text-primary font-mono">7 years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Config Versions</span>
                <span className="text-text-primary font-mono">Forever</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Notifications Page
// ============================================
export function NotificationsSettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Notifications" 
        subtitle="Channels, routing rules, and delivery monitoring"
        owner="IT + Risk"
      />
      
      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="Telegram" value="Connected" status="ok" />
        <StatusCard label="Alert Routes" value="12 Active" status="info" />
        <StatusCard label="Delivery Rate" value="99.2%" status="ok" />
        <StatusCard label="Alerts Today" value="23" status="info" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-3 gap-4">
        {/* Routing Rules Panel */}
        <div className="col-span-2 panel flex flex-col">
          <div className="panel-header">
            <span className="font-medium text-text-primary">Alert Routing Rules</span>
            <button className="btn btn-primary">+ Add Rule</button>
          </div>
          <div className="flex-1 p-4 overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border">
                  <th className="pb-2">Severity</th>
                  <th className="pb-2">Category</th>
                  <th className="pb-2">Channel</th>
                  <th className="pb-2">Recipients</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border-muted">
                  <td className="py-2"><span className="badge badge-critical">Critical</span></td>
                  <td className="py-2 text-text-secondary">All</td>
                  <td className="py-2 text-text-primary">Telegram + Email</td>
                  <td className="py-2 text-text-secondary">Risk Team, IT Admin</td>
                  <td className="py-2 text-pnl-positive">Active</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2"><span className="badge badge-high">High</span></td>
                  <td className="py-2 text-text-secondary">Hedging</td>
                  <td className="py-2 text-text-primary">Telegram</td>
                  <td className="py-2 text-text-secondary">Risk Team</td>
                  <td className="py-2 text-pnl-positive">Active</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2"><span className="badge badge-high">High</span></td>
                  <td className="py-2 text-text-secondary">Connection</td>
                  <td className="py-2 text-text-primary">Telegram + Email</td>
                  <td className="py-2 text-text-secondary">IT Admin</td>
                  <td className="py-2 text-pnl-positive">Active</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2"><span className="badge badge-medium">Medium</span></td>
                  <td className="py-2 text-text-secondary">Trader Risk</td>
                  <td className="py-2 text-text-primary">Telegram</td>
                  <td className="py-2 text-text-secondary">Risk Team</td>
                  <td className="py-2 text-pnl-positive">Active</td>
                </tr>
                <tr className="border-b border-border-muted">
                  <td className="py-2"><span className="badge badge-low">Low</span></td>
                  <td className="py-2 text-text-secondary">Daily Summary</td>
                  <td className="py-2 text-text-primary">Email</td>
                  <td className="py-2 text-text-secondary">All Stakeholders</td>
                  <td className="py-2 text-text-muted">Quiet Hours</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Channels & Testing Panel */}
        <div className="flex flex-col gap-4">
          {/* Channels */}
          <div className="panel">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Channels</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Telegram */}
              <div className="p-3 rounded border border-border-muted bg-surface-hover">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-text-primary">Telegram</span>
                  <span className="text-xs text-pnl-positive">Connected</span>
                </div>
                <div className="text-xs text-text-muted mb-2">
                  Bot: @NexRiskAlertBot • Chat: Risk Team
                </div>
                <button className="text-xs text-accent hover:underline">Send Test →</button>
              </div>
              
              {/* Email */}
              <div className="p-3 rounded border border-border-muted">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-text-primary">Email (SMTP)</span>
                  <span className="text-xs text-pnl-positive">Configured</span>
                </div>
                <div className="text-xs text-text-muted mb-2">
                  From: alerts@nexrisk.broker.com
                </div>
                <button className="text-xs text-accent hover:underline">Send Test →</button>
              </div>
              
              {/* Teams (Coming Soon) */}
              <div className="p-3 rounded border border-border-muted opacity-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-text-primary">MS Teams</span>
                  <span className="text-xs text-text-muted">Coming Soon</span>
                </div>
                <div className="text-xs text-text-muted">
                  Webhook integration planned
                </div>
              </div>
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="panel flex-1">
            <div className="panel-header">
              <span className="font-medium text-text-primary">Quiet Hours</span>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Weekdays</span>
                <span className="text-text-primary font-mono">22:00 - 06:00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Weekends</span>
                <span className="text-text-primary font-mono">All Day</span>
              </div>
              <hr className="border-border-muted" />
              <p className="text-xs text-text-muted">
                Critical alerts bypass quiet hours. Medium/Low alerts are queued.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Deliveries Footer */}
      <div className="mt-4 panel p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Last delivery: Critical hedge alert → Telegram → delivered 2m ago</span>
          <button className="text-accent hover:underline">View delivery log →</button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Risk Logic Page (Phase 2 Placeholder)
// ============================================
export function RiskLogicSettingsPage() {
  return (
    <div className="h-full flex flex-col p-6 overflow-auto">
      <SettingsHeader 
        title="Risk Logic" 
        subtitle="Feature engine, pricing rules, and hedging rules"
        owner="Risk-owned"
      />
      
      {/* Phase 2 Notice */}
      <div className="mb-6 p-4 rounded border border-risk-medium-border bg-risk-medium-bg">
        <p className="text-risk-medium font-medium mb-1">Phase 2 Module</p>
        <p className="text-sm text-text-secondary">
          This module requires backend support for config versioning, rollback, and maker/checker approval workflows.
          Expected features: classifier config editor, pricing rules with simulator, hedging rule templates.
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatusCard label="Config Version" value="v2.4.1" status="info" />
        <StatusCard label="Pending Approvals" value="0" status="ok" />
        <StatusCard label="Last Deploy" value="3d ago" status="info" />
        <StatusCard label="Environment" value="PROD" status="ok" />
      </div>

      {/* Placeholder Content */}
      <PlaceholderContent module="Risk Logic" />
    </div>
  );
}