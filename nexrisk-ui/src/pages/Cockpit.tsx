// ============================================
// Cockpit Page (Landing Page)
// 6 boxes linking to different sections
// ============================================

import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

interface CockpitBoxProps {
  title: string;
  subtitle: string;
  path: string;
  stats?: { label: string; value: string; status?: 'ok' | 'warning' | 'critical' }[];
}

function CockpitBox({ title, subtitle, path, stats }: CockpitBoxProps) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(path)}
      className={clsx(
        'panel p-5 text-left transition-all',
        'hover:border-accent-muted hover:bg-surface-hover',
        'focus:outline-none focus:ring-2 focus:ring-border-focus'
      )}
    >
      <h3 className="text-lg font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary mb-4">{subtitle}</p>
      
      {stats && stats.length > 0 && (
        <div className="space-y-2">
          {stats.map((stat, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{stat.label}</span>
              <span className={clsx(
                'font-mono',
                stat.status === 'ok' && 'text-pnl-positive',
                stat.status === 'warning' && 'text-risk-medium',
                stat.status === 'critical' && 'text-risk-critical',
                !stat.status && 'text-text-primary'
              )}>
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export function CockpitPage() {
  const boxes: CockpitBoxProps[] = [
    {
      title: 'Risk Command Center',
      subtitle: 'Executive situational awareness dashboard',
      path: '/command-center',
      stats: [
        { label: 'Toxic Flow Unhedged', value: '12.3%', status: 'warning' },
        { label: 'Risk Concentration', value: '47%', status: 'critical' },
        { label: 'Hedge Efficiency', value: '1.8x', status: 'ok' },
      ],
    },
    {
      title: 'Trader & Behavior Risk',
      subtitle: 'Who is causing risk and who is changing?',
      path: '/focus',
      stats: [
        { label: 'Critical Traders', value: '3', status: 'critical' },
        { label: 'High Risk Traders', value: '12', status: 'warning' },
        { label: 'Behavioral Drift', value: '2.4', status: 'warning' },
      ],
    },
    {
      title: 'Flow & Hedging',
      subtitle: 'What should we hedge, unwind, or keep?',
      path: '/flow-hedging',
      stats: [
        { label: 'A/B Ratio (Toxic)', value: '68/32' },
        { label: 'Hedged Coverage', value: '84%', status: 'ok' },
        { label: 'Mis-Hedge Ratio', value: '8%', status: 'warning' },
      ],
    },
    {
      title: 'Exposure & Market',
      subtitle: 'What happens if price moves now?',
      path: '/net-exposure',
      stats: [
        { label: 'Net Direction', value: 'LONG', status: 'ok' },
        { label: 'Top Symbol', value: 'XAUUSD' },
        { label: 'Compression', value: '1.2σ' },
      ],
    },
    {
      title: 'Business Performance',
      subtitle: 'Are we making the right money?',
      path: '/business',
      stats: [
        { label: 'Risk-Adj RPM', value: '$42.30', status: 'ok' },
        { label: 'B-Book Index', value: '0.87', status: 'ok' },
        { label: 'Over-Hedge Drag', value: '-$1.2K', status: 'warning' },
      ],
    },
    {
      title: 'RIAN Workspace',
      subtitle: 'Risk Intelligence Analysis Neutralizer',
      path: '/portfolio',
      stats: [
        { label: 'A-Book P&L', value: '-$221K', status: 'critical' },
        { label: 'B-Book P&L', value: '+$739K', status: 'ok' },
        { label: 'Net Total', value: '+$24K', status: 'ok' },
      ],
    },
  ];

  return (
    <div className="h-full p-6">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">NexRisk Cockpit</h1>
        <p className="text-text-secondary">
          Select a module to begin. Set any page as your default in Settings.
        </p>
      </div>

      {/* 6-Box Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boxes.map((box) => (
          <CockpitBox key={box.path} {...box} />
        ))}
      </div>

      {/* Quick Stats Footer */}
      <div className="mt-8 panel p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <span className="text-sm text-text-muted">Active Traders</span>
              <p className="text-xl font-mono text-text-primary">127</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Open Positions</span>
              <p className="text-xl font-mono text-text-primary">342</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Pending Alerts</span>
              <p className="text-xl font-mono text-risk-high">8</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Net Exposure</span>
              <p className="text-xl font-mono text-pnl-positive">+42.5 lots</p>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CockpitPage;
