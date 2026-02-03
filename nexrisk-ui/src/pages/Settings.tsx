// ============================================
// Settings Page (Hub)
// 6 boxes linking to different settings sections
// Organized by risk + ownership per architecture doc
// ============================================

import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';

// Icons for each settings section
const SecurityIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="m17,8V6c0-2.757-2.243-5-5-5S7,3.243,7,6v2c-1.654,0-3,1.346-3,3v8c0,2.757,2.243,5,5,5h6c2.757,0,5-2.243,5-5v-8c0-1.654-1.346-3-3-3Zm-8-2c0-1.654,1.346-3,3-3s3,1.346,3,3v2h-6v-2Zm9,13c0,1.654-1.346,3-3,3h-6c-1.654,0-3-1.346-3-3v-8c0-.551.449-1,1-1h10c.551,0,1,.449,1,1v8Zm-5-6v4c0,.553-.448,1-1,1s-1-.447-1-1v-4c0-.553.448-1,1-1s1,.447,1,1Z"/>
  </svg>
);

const ConnectivityIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="m21.5,9.5c-1.025,0-1.903.618-2.289,1.5h-3.353c-.176-.677-.515-1.286-.987-1.774.45-.734,1.144-1.867,1.747-2.853.954.132,1.94-.295,2.475-1.169.721-1.177.351-2.717-.827-3.438-1.177-.721-2.717-.351-3.438.826-.535.874-.467,1.946.084,2.736-.607.991-1.304,2.131-1.753,2.863-.37-.113-.754-.192-1.16-.192s-.79.079-1.16.192c-.449-.733-1.147-1.872-1.753-2.863.551-.79.619-1.862.084-2.736-.721-1.177-2.26-1.548-3.438-.826-1.177.721-1.547,2.26-.826,3.438.535.874,1.521,1.3,2.474,1.169.604.986,1.298,2.119,1.747,2.853-.472.488-.811,1.098-.987,1.774h-3.353c-.386-.882-1.264-1.5-2.289-1.5C1.119,9.5,0,10.619,0,12s1.119,2.5,2.5,2.5c1.025,0,1.903-.618,2.289-1.5h3.353c.176.677.515,1.286.987,1.774l-1.747,2.853c-.954-.131-1.94.295-2.475,1.169-.721,1.177-.351,2.716.826,3.438,1.177.721,2.717.351,3.438-.827.535-.874.467-1.945-.084-2.735l1.753-2.863c.369.113.753.192,1.159.192s.79-.079,1.159-.192l1.754,2.864c-.551.79-.619,1.862-.084,2.735.721,1.177,2.26,1.548,3.438.827,1.177-.721,1.548-2.26.827-3.438-.535-.874-1.521-1.3-2.475-1.169l-1.747-2.853c.472-.488.811-1.098.987-1.774h3.353c.386.882,1.264,1.5,2.289,1.5,1.381,0,2.5-1.119,2.5-2.5s-1.119-2.5-2.5-2.5Zm-11.5,2.5c0-1.103.897-2,2-2s2,.897,2,2-.897,2-2,2-2-.897-2-2Z"/>
  </svg>
);

const SymbologyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="M7,0C4.243,0,2,2.243,2,5v14c0,2.757,2.243,5,5,5h10c2.757,0,5-2.243,5-5V5c0-2.757-2.243-5-5-5H7Zm10,22H7c-1.654,0-3-1.346-3-3V5c0-1.654,1.346-3,3-3h10c1.654,0,3,1.346,3,3v14c0,1.654-1.346,3-3,3Zm-5-15c-2.206,0-4,1.794-4,4s1.794,4,4,4,4-1.794,4-4-1.794-4-4-4Zm0,6c-1.103,0-2-.897-2-2s.897-2,2-2,2,.897,2,2-.897,2-2,2Zm4,4h-8c-.552,0-1,.448-1,1s.448,1,1,1h8c.552,0,1-.448,1-1s-.448-1-1-1Z"/>
  </svg>
);

const RiskLogicIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="m17.331,11.213c.422-.634.669-1.395.669-2.212,0-2.206-1.794-4-4-4h-2.5c-1.93,0-3.5,1.57-3.5,3.5v7c0,1.929,1.57,3.5,3.5,3.5h4.545c2.181,0,3.955-1.774,3.955-4.03,0-1.062-.41-2.06-1.155-2.808-.433-.435-.95-.756-1.514-.95Zm-7.331-2.713c0-.827.673-1.5,1.5-1.5h2.5c1.103,0,2,.897,2,2s-.897,2-2,2h-4v-2.501Zm6.045,8.501h-4.545c-.827,0-1.5-.674-1.5-1.5v-2.5h6.048c.521,0,1.011.203,1.379.573.369.371.573.867.573,1.472,0,1.078-.877,1.955-1.955,1.955ZM23,3.5v17c0,1.93-1.57,3.5-3.5,3.5H4.5c-1.93,0-3.5-1.57-3.5-3.5V3.5C1,1.57,2.57,0,4.5,0h15c1.93,0,3.5,1.57,3.5,3.5Zm-2,0c0-.827-.673-1.5-1.5-1.5H4.5c-.827,0-1.5.673-1.5,1.5v17c0,.827.673,1.5,1.5,1.5h15c.827,0,1.5-.673,1.5-1.5V3.5Z"/>
  </svg>
);

const AuditIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="m19,2h-1.101c-.465-1.167-1.588-2-2.899-2h-6c-1.311,0-2.434.833-2.899,2h-1.101C2.243,2,0,4.243,0,7v12c0,2.757,2.243,5,5,5h14c2.757,0,5-2.243,5-5V7c0-2.757-2.243-5-5-5Zm-10-1c0-.552.449-1,1-1h4c.551,0,1,.448,1,1v1c0,.552-.449,1-1,1h-4c-.551,0-1-.448-1-1v-1Zm13,18c0,1.654-1.346,3-3,3H5c-1.654,0-3-1.346-3-3V7c0-1.654,1.346-3,3-3h1v.172c0,1.068.574,2.062,1.5,2.596.462.267.98.402,1.5.402h5c.52,0,1.038-.135,1.5-.402.926-.534,1.5-1.528,1.5-2.596v-.172h1c1.654,0,3,1.346,3,3v12Zm-5-8h-6c-.552,0-1,.448-1,1s.448,1,1,1h6c.552,0,1-.448,1-1s-.448-1-1-1Zm-2,4h-4c-.552,0-1,.448-1,1s.448,1,1,1h4c.552,0,1-.448,1-1s-.448-1-1-1Z"/>
  </svg>
);

const NotificationsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
    <path d="m22.555,13.662l-1.9-6.836c-.894-3.218-3.802-5.46-7.074-5.757-.239-1.093-.799-1.069-1.059-1.069h-.045c-.26,0-.82-.024-1.059,1.069-3.271.298-6.18,2.54-7.074,5.756l-1.9,6.836c-.382,1.373.128,2.808,1.296,3.645-.003.032-.01.063-.01.095,0,1.457.787,2.792,2.054,3.485,1.269.693,2.829.698,4.103.014.512-.275.697-.905.423-1.417-.275-.512-.905-.695-1.417-.423-.695.373-1.533.372-2.225.007-.697-.369-1.128-1.087-1.128-1.874,0-.147-.031-.28-.068-.412.003-.001.007-.002.01-.003.941-.341,1.636-1.174,1.791-2.18l1.9-6.837c.646-2.323,2.748-3.946,5.114-3.946s4.469,1.624,5.114,3.948l1.9,6.835c.156,1.007.851,1.84,1.792,2.181.004.001.007.002.011.003-.037.132-.068.266-.068.413,0,.787-.43,1.505-1.123,1.871-.694.367-1.534.369-2.23-.004-.513-.272-1.143-.089-1.418.422-.274.512-.089,1.142.422,1.417,1.273.686,2.833.682,4.104-.012,1.267-.693,2.054-2.028,2.054-3.485,0-.033-.007-.064-.01-.096,1.168-.836,1.678-2.272,1.296-3.646Zm-10.555,8.338c-1.103,0-2-.897-2-2h4c0,1.103-.897,2-2,2Z"/>
  </svg>
);

interface SettingsBoxProps {
  title: string;
  subtitle: string;
  owner: string;
  path: string;
  icon: React.ReactNode;
  stats?: { label: string; value: string; status?: 'ok' | 'warning' | 'critical' | 'info' }[];
  phase?: 'mvp' | 'phase2';
}

function SettingsBox({ title, subtitle, owner, path, icon, stats, phase }: SettingsBoxProps) {
  const navigate = useNavigate();
  const isPhase2 = phase === 'phase2';

  return (
    <button
      onClick={() => !isPhase2 && navigate(path)}
      disabled={isPhase2}
      className={clsx(
        'panel p-5 text-left transition-all relative',
        isPhase2 
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-accent-muted hover:bg-surface-hover cursor-pointer',
        'focus:outline-none focus:ring-2 focus:ring-border-focus'
      )}
    >
      {/* Phase 2 Badge */}
      {isPhase2 && (
        <div className="absolute top-3 right-3">
          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-surface-active text-text-muted border border-border-muted">
            Phase 2
          </span>
        </div>
      )}

      {/* Header with Icon */}
      <div className="flex items-start gap-3 mb-3">
        <div className="text-accent">{icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary">{subtitle}</p>
        </div>
      </div>

      {/* Owner Badge */}
      <div className="mb-4">
        <span className={clsx(
          'px-2 py-0.5 rounded text-[10px] font-medium',
          owner.includes('IT') && 'bg-info-bg text-info border border-info-border',
          owner.includes('Risk') && !owner.includes('IT') && 'bg-accent-subtle text-accent border border-accent-muted',
          owner.includes('IT') && owner.includes('Risk') && 'bg-surface-active text-text-secondary border border-border-muted'
        )}>
          {owner}
        </span>
      </div>

      {/* Status Stats */}
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
                stat.status === 'info' && 'text-info',
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

export function SettingsPage() {
  const boxes: SettingsBoxProps[] = [
    // MVP Phase 1
    {
      title: 'Identity & Security',
      subtitle: 'Users, roles, MFA, and access control',
      owner: 'IT-owned',
      path: '/settings/security',
      icon: <SecurityIcon />,
      phase: 'mvp',
      stats: [
        { label: 'Active Users', value: '24', status: 'ok' },
        { label: 'MFA Enabled', value: '92%', status: 'warning' },
        { label: 'Root Status', value: 'Disabled', status: 'ok' },
      ],
    },
    {
      title: 'Connectivity',
      subtitle: 'MT5 servers and LP connections',
      owner: 'IT + Risk',
      path: '/settings/connectivity',
      icon: <ConnectivityIcon />,
      phase: 'mvp',
      stats: [
        { label: 'MT5 Servers', value: '3 Online', status: 'ok' },
        { label: 'LP Sessions', value: '2/2 Active', status: 'ok' },
        { label: 'Avg Latency', value: '12ms', status: 'ok' },
      ],
    },
    {
      title: 'Market & Symbology',
      subtitle: 'Symbol mapping, unifiers, trading conditions',
      owner: 'Risk-owned',
      path: '/settings/symbology',
      icon: <SymbologyIcon />,
      phase: 'mvp',
      stats: [
        { label: 'Mapped Symbols', value: '127/132', status: 'warning' },
        { label: 'Unifier Groups', value: '18', status: 'info' },
        { label: 'Validation', value: '5 Issues', status: 'critical' },
      ],
    },
    {
      title: 'Operations & Audit',
      subtitle: 'Logs, backups, retention, compliance',
      owner: 'IT-owned',
      path: '/settings/audit',
      icon: <AuditIcon />,
      phase: 'mvp',
      stats: [
        { label: 'Last Backup', value: '2h ago', status: 'ok' },
        { label: 'Log Retention', value: '90 days', status: 'info' },
        { label: 'Change Events', value: '47 today', status: 'info' },
      ],
    },
    {
      title: 'Notifications',
      subtitle: 'Channels, routing rules, delivery',
      owner: 'IT + Risk',
      path: '/settings/notifications',
      icon: <NotificationsIcon />,
      phase: 'mvp',
      stats: [
        { label: 'Telegram', value: 'Connected', status: 'ok' },
        { label: 'Alert Routes', value: '12 Active', status: 'info' },
        { label: 'Delivery Rate', value: '99.2%', status: 'ok' },
      ],
    },
    // Phase 2
    {
      title: 'Risk Logic',
      subtitle: 'Feature engine, pricing rules, hedging rules',
      owner: 'Risk-owned',
      path: '/settings/risk-logic',
      icon: <RiskLogicIcon />,
      phase: 'phase2',
      stats: [
        { label: 'Config Version', value: 'v2.4.1', status: 'info' },
        { label: 'Pending Approvals', value: '0', status: 'ok' },
        { label: 'Last Deploy', value: '3d ago', status: 'info' },
      ],
    },
  ];

  return (
    <div className="h-full p-6 overflow-auto">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
        <p className="text-text-secondary">
          System configuration organized by risk level and ownership
        </p>
      </div>

      {/* 6-Box Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {boxes.map((box) => (
          <SettingsBox key={box.path} {...box} />
        ))}
      </div>

      {/* System Health Footer */}
      <div className="mt-8 panel p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div>
              <span className="text-sm text-text-muted">Environment</span>
              <p className="text-lg font-mono text-accent">PRODUCTION</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Config Version</span>
              <p className="text-lg font-mono text-text-primary">v1.6.2</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">Pending Changes</span>
              <p className="text-lg font-mono text-text-primary">0</p>
            </div>
            <div>
              <span className="text-sm text-text-muted">System Status</span>
              <p className="text-lg font-mono text-pnl-positive">Healthy</p>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            Last sync: {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Phase Legend */}
      <div className="mt-4 text-xs text-text-muted">
        <span className="mr-4">● MVP Phase 1: Currently available</span>
        <span>○ Phase 2: Requires backend support for versioning/approval workflows</span>
      </div>
    </div>
  );
}

export default SettingsPage;