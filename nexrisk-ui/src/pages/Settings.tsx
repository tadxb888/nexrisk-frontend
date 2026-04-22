// ============================================
// Settings Page (Hub)
// 9 tiles mapping to the System Administration panels in settings_api.md
// v1 scope:
//   - Gateway tile wired to live data via settingsApi.gateway.get()
//   - Other 8 tiles render with static summary placeholders (replaced as
//     their respective tickets land)
//   - Page-level role guard: root | administrator | sysadmin | broker_dealer
//   - Secret rotation tile hidden entirely for non-root users
//   - Restart banner driven from GET /settings/pending-restart-raw
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  settingsApi,
  type GatewayConfig,
  type NexriskConfig,
  type NexdayConfig,
  type TradingEconomicsConfig,
  type AuthConfig,
  type FixBridgeConfig,
  type LogServiceDescriptor,
  type LpProfilesResponse,
  type EncryptionKeyPreflight,
  type PendingRestartResponse,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Icons — stroke-based, 22×22, currentColor; sized via className at call site
// ─────────────────────────────────────────────────────────────────────────────

type IconProps = { className?: string; style?: React.CSSProperties };
const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const LpIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" />
    <path d="M12 7.5V11M12 11L6.5 17M12 11l5.5 6" />
  </svg>
);
const NexDayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M12 14v3M12 17l2-2" />
  </svg>
);
const TEIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M3 20h18" /><path d="M5 17l4-6 4 3 5-8" /><path d="M15 6h3v3" />
  </svg>
);
const AuthIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M12 2l8 3v6c0 5-4 9-8 11-4-2-8-6-8-11V5l8-3z" /><path d="M9 12l2 2 4-4" />
  </svg>
);
const AlertingIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);
const GatewayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <circle cx="12" cy="12" r="2" />
    <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
    <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);
const FixBridgeIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M3 12h18" /><path d="M7 8l-4 4 4 4" /><path d="M17 8l4 4-4 4" />
  </svg>
);
const LogsIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
    <path d="M14 3v6h6" /><path d="M8 13h8M8 17h5" />
  </svg>
);
const KeyIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <circle cx="7" cy="15" r="4" /><path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
  </svg>
);
const BellAlert = ({ className, style }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} style={style} {...strokeProps}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);
const RootStar = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M12 2l2.5 5 5.5 1-4 4 1 5.5-5-2.5-5 2.5 1-5.5-4-4 5.5-1z" />
  </svg>
);
const ShieldSmall = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" className={className} {...strokeProps}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Tile component
// ─────────────────────────────────────────────────────────────────────────────

type StatTone = 'ok' | 'warn' | 'info' | 'neutral';
type TileStat = { label: string; value: string; tone?: StatTone };

interface TileProps {
  title:          string;
  subtitle:       string;
  icon:           React.ReactNode;
  path:           string;
  rootOnly?:      boolean;
  ready:          boolean;
  stats:          TileStat[];
  pendingCount?:  number;
}

function Tile({ title, subtitle, icon, path, rootOnly, ready, stats, pendingCount }: TileProps) {
  const navigate = useNavigate();
  const onClick  = ready ? () => navigate(path) : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-disabled={!ready}
      className={clsx(
        'relative flex flex-col gap-2.5 text-left p-4 rounded',
        'bg-surface border border-border',
        'transition-colors duration-150',
        ready
          ? 'hover:border-accent-muted hover:bg-surface-hover cursor-pointer'
          : 'cursor-default',
        'focus:outline-none focus:ring-2 focus:ring-border-focus',
      )}
    >
      {/* Pending-restart marker */}
      {pendingCount && pendingCount > 0 ? (
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
          style={{
            background: '#2a2016',
            color:      '#e09a55',
            border:     '1px solid #6a4a2f',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#e09a55' }} />
          {pendingCount} pending
        </span>
      ) : null}

      {/* Header: icon + title + subtitle */}
      <div className="flex gap-2.5 items-start pr-16">
        <span className="w-[22px] h-[22px] shrink-0 mt-0.5 text-accent">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium text-text-primary leading-tight">{title}</h3>
          <p className="text-xs text-text-muted leading-snug mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* Root-only tag, only when relevant */}
      {rootOnly ? (
        <span
          className="inline-flex self-start items-center text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
          style={{
            background: '#2a1f14',
            color:      '#c9b87c',
            border:     '1px solid #6a4f2f',
          }}
        >
          Root only
        </span>
      ) : null}

      {/* 3-row stat grid */}
      <div className="flex flex-col gap-1.5 border-t border-[#2a292c] pt-2.5 mt-auto">
        {stats.map((stat, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2.5 text-xs">
            <span className="text-text-muted shrink-0">{stat.label}</span>
            <span
              className={clsx(
                'font-mono text-[11.5px] text-right truncate',
                stat.tone === 'ok'   && 'text-pnl-positive',
                stat.tone === 'warn' && 'text-risk-high',
                stat.tone === 'info' && 'text-info',
                (!stat.tone || stat.tone === 'neutral') && 'text-text-primary',
              )}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile summary builders
// ─────────────────────────────────────────────────────────────────────────────

function buildGatewayStats(config: GatewayConfig | null): TileStat[] {
  if (!config) {
    return [
      { label: 'Upstream MT5',   value: '—' },
      { label: 'Listen',         value: '—' },
      { label: 'Gateway login',  value: '—' },
    ];
  }
  return [
    { label: 'Upstream MT5',  value: config.mt5_server },
    { label: 'Listen',        value: config.gateway_listen },
    { label: 'Gateway login', value: String(config.gateway_login) },
  ];
}

function buildNexDayStats(config: NexdayConfig | undefined): TileStat[] {
  if (!config) {
    return [
      { label: 'Status',           value: '—' },
      { label: 'Intraday poll',    value: '—' },
      { label: 'Daily bars kept',  value: '—' },
    ];
  }
  return [
    {
      label: 'Status',
      value: config.enabled ? 'Enabled' : 'Disabled',
      tone:  config.enabled ? 'ok'      : 'warn',
    },
    {
      label: 'Intraday poll',
      value: config.polling?.intraday_enabled
        ? `every ${config.polling.intraday_interval_minutes} min`
        : 'off',
    },
    {
      label: 'Daily bars kept',
      value: String(config.retention?.daily_bars ?? '—'),
    },
  ];
}

function buildTradingEconomicsStats(config: TradingEconomicsConfig | undefined): TileStat[] {
  if (!config) {
    return [
      { label: 'Status',         value: '—' },
      { label: 'Poll interval',  value: '—' },
      { label: 'Window',         value: '—' },
    ];
  }
  return [
    {
      label: 'Status',
      value: config.enabled ? 'Enabled' : 'Disabled',
      tone:  config.enabled ? 'ok'      : 'warn',
    },
    { label: 'Poll interval', value: `${config.poll_interval_seconds}s` },
    {
      label: 'Window',
      value: `-${config.preload_days_back}d / +${config.preload_days_ahead}d`,
    },
  ];
}

function buildAuthStats(config: AuthConfig | undefined): TileStat[] {
  if (!config) {
    return [
      { label: 'Access token',  value: '—' },
      { label: 'Refresh token', value: '—' },
      { label: 'Password min',  value: '—' },
    ];
  }
  return [
    { label: 'Access token',  value: formatTTL(config.access_token_ttl_seconds) },
    { label: 'Refresh token', value: formatTTL(config.refresh_token_ttl_seconds) },
    { label: 'Password min',  value: `${config.password_min_length} chars` },
  ];
}

function buildFixBridgeStats(config: FixBridgeConfig | null): TileStat[] {
  if (!config) {
    return [
      { label: 'Log level',         value: '—' },
      { label: 'Raw FIX retention', value: '—' },
      { label: 'Incident bundles',  value: '—' },
    ];
  }
  const rawFix = config.audit?.raw_fix;
  return [
    { label: 'Log level',         value: config.log_level ?? '—' },
    {
      label: 'Raw FIX retention',
      value: rawFix?.enabled
        ? `${rawFix.retention_hours} h · ${rawFix.compression}`
        : 'disabled',
      tone: rawFix?.enabled ? undefined : 'warn',
    },
    { label: 'Incident bundles',  value: `${config.incident?.max_bundles ?? '—'} max` },
  ];
}

/** Render a TTL in the most compact sensible unit (min / h / d). */
function formatTTL(seconds: number): string {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} d TTL`;
  if (seconds >= 3600  && seconds % 3600  === 0) return `${seconds / 3600} h TTL`;
  if (seconds >= 60    && seconds % 60    === 0) return `${seconds / 60} min TTL`;
  return `${seconds} s TTL`;
}

// Static placeholders for tiles not yet wired — replaced as each ticket ships.
function buildLpStats(resp: LpProfilesResponse | null): TileStat[] {
  if (!resp) {
    return [
      { label: 'Profiles',  value: '—' },
      { label: 'Enabled',   value: '—' },
      { label: 'Disabled',  value: '—' },
    ];
  }
  const total    = resp.profiles.length;
  const enabled  = resp.enabled_lps.length;
  const disabled = Math.max(0, total - enabled);
  return [
    { label: 'Profiles',  value: `${total} configured` },
    { label: 'Enabled',   value: `${enabled} active`,   tone: enabled > 0 ? 'ok' : undefined },
    { label: 'Disabled',  value: `${disabled} inactive` },
  ];
}
function buildAlertingStats(config: NexriskConfig | null): TileStat[] {
  const alerts   = config?.alerts;
  const telegram = config?.telegram;
  const webhooks = config?.webhooks;
  if (!config) {
    return [
      { label: 'Telegram chats', value: '—' },
      { label: 'Webhooks',       value: '—' },
      { label: 'Min severity',   value: '—' },
    ];
  }
  const chatCount     = telegram?.chats?.length ?? 0;
  const endpointCount = webhooks?.endpoints?.length ?? 0;
  const enabledEndpoints = (webhooks?.endpoints ?? []).filter(e => e.enabled).length;
  return [
    {
      label: 'Telegram chats',
      value: chatCount === 0 ? 'none'
        : (telegram?.enabled ? `${chatCount} configured` : `${chatCount} (channel off)`),
      tone: telegram?.enabled && chatCount > 0 ? 'ok' : undefined,
    },
    {
      label: 'Webhooks',
      value: endpointCount === 0 ? 'none'
        : (webhooks?.enabled ? `${enabledEndpoints} of ${endpointCount} active` : `${endpointCount} (channel off)`),
      tone: webhooks?.enabled && enabledEndpoints > 0 ? 'ok' : undefined,
    },
    {
      label: 'Min severity',
      value: alerts?.enabled ? (alerts.min_severity ?? '—') : 'alerts off',
      tone: alerts?.enabled ? undefined : 'warn',
    },
  ];
}
function buildLogsStats(services: LogServiceDescriptor[] | null): TileStat[] {
  if (!services) {
    return [
      { label: 'Services',     value: '—' },
      { label: 'Configurable', value: '—' },
      { label: 'Browser',      value: 'Ready' },
    ];
  }
  const configurable = services.filter(s => s.level_configurable).length;
  return [
    { label: 'Services',     value: `${services.length} indexed` },
    { label: 'Configurable', value: `${configurable} of ${services.length}` },
    { label: 'Browser',      value: 'Ready' },
  ];
}

function buildRotationStats(preflight: EncryptionKeyPreflight | null): TileStat[] {
  const encryption: TileStat =
    preflight === null
      ? { label: 'Encryption key', value: '—' }
      : preflight.ok_to_proceed
        ? { label: 'Encryption key', value: 'preflight ok', tone: 'ok' }
        : { label: 'Encryption key', value: 'blocked',      tone: 'warn' };

  return [
    { label: 'Internal secret', value: 'Rotatable' },
    { label: 'JWT secret',      value: 'Rotatable' },
    encryption,
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { user } = useAuth();

  // Role gate: redirect anyone outside the four permitted roles.
  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  const isRoot = user?.role === 'root';

  // ── live data: gateway + nexrisk + fixbridge + lp + logs + preflight + pending ──
  const [gateway,          setGateway]          = useState<GatewayConfig | null>(null);
  const [nexrisk,          setNexrisk]          = useState<NexriskConfig | null>(null);
  const [fixbridge,        setFixbridge]        = useState<FixBridgeConfig | null>(null);
  const [lpProfiles,       setLpProfiles]       = useState<LpProfilesResponse | null>(null);
  const [logServices,      setLogServices]      = useState<LogServiceDescriptor[] | null>(null);
  const [encryptPreflight, setEncryptPreflight] = useState<EncryptionKeyPreflight | null>(null);
  const [pending,          setPending]          = useState<PendingRestartResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [g, n, f, lp, l, p, pre] = await Promise.all([
          settingsApi.gateway.get().catch(() => null),
          settingsApi.nexrisk.get().catch(() => null),
          settingsApi.fixbridge.get().catch(() => null),
          settingsApi.lp.listProfiles().catch(() => null),
          settingsApi.logs.getServices().catch(() => null),
          settingsApi.getPendingRestart().catch(() => null),
          // Only probe encryption-key preflight for root users — the endpoint
          // is root-only at the backend and would 403 for anyone else.
          isRoot
            ? settingsApi.rotation.encryptionKeyPreflight().catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (g)   setGateway(g.data);
        if (n)   setNexrisk(n);
        if (f)   setFixbridge(f.data);
        if (lp)  setLpProfiles(lp);
        if (l)   setLogServices(l.services);
        if (p)   setPending(p);
        if (pre) setEncryptPreflight(pre);
      } catch {
        // silent — tiles fall back to placeholder shape
      }
    }

    void load();
    const id = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isRoot]);

  // Map pending fields to tile keys (matches the `section` string the backend
  // emits on /settings/pending-restart-raw). Standalone file-backed sections
  // — gateway, fixbridge, lp — are included here so that if the backend does
  // surface them, the hub lights up correctly. If it doesn't, the banner will
  // still show them via the mutation-response restart_required array when
  // the user comes back from a sub-page that just saved.
  const pendingByTile = useMemo(() => {
    const map: Record<string, number> = {};
    if (!pending?.pending_fields) return map;
    for (const f of pending.pending_fields) {
      const key = pendingTileKey(f.section, f.subsection);
      if (key) map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [pending]);

  const hasPending     = pending?.has_pending ?? false;
  const pendingCount   = pending?.pending_fields?.length ?? 0;
  const pendingServices = useMemo(() => {
    const s = new Set<string>();
    for (const f of pending?.pending_fields ?? []) {
      const svc = serviceForSection(f.section);
      if (svc) s.add(svc);
    }
    return Array.from(s);
  }, [pending]);

  // ─ tiles ─
  const tiles: (TileProps & { key: string })[] = [
    {
      key: 'lp',     title: 'LP management',       subtitle: 'Liquidity provider profiles and routing',
      icon: <LpIcon className="w-full h-full" />, path: '/settings/lp', ready: true,
      stats: buildLpStats(lpProfiles), pendingCount: pendingByTile.lp,
    },
    {
      key: 'nexday', title: 'NexDay integration',  subtitle: 'Daily bars and intraday market data',
      icon: <NexDayIcon className="w-full h-full" />, path: '/settings/nexday', ready: true,
      stats: buildNexDayStats(nexrisk?.nexday), pendingCount: pendingByTile.nexday,
    },
    {
      key: 'te',     title: 'Trading Economics',   subtitle: 'Calendar feed and event stream',
      icon: <TEIcon className="w-full h-full" />, path: '/settings/trading-economics', ready: true,
      stats: buildTradingEconomicsStats(nexrisk?.trading_economics), pendingCount: pendingByTile.te,
    },
    {
      key: 'auth',   title: 'Auth & session',      subtitle: 'Token TTLs and password policy',
      icon: <AuthIcon className="w-full h-full" />, path: '/settings/auth', ready: true,
      stats: buildAuthStats(nexrisk?.auth), pendingCount: pendingByTile.auth,
    },
    {
      key: 'alerts', title: 'Alerting',            subtitle: 'Telegram, webhooks, severity routing',
      icon: <AlertingIcon className="w-full h-full" />, path: '/settings/alerts', ready: true,
      stats: buildAlertingStats(nexrisk), pendingCount: pendingByTile.alerts,
    },
    // ─── GATEWAY: the only tile wired to live data in v1 ───
    {
      key: 'gateway', title: 'Price feed gateway', subtitle: gatewaySubtitle(gateway),
      icon: <GatewayIcon className="w-full h-full" />, path: '/settings/gateway', ready: true,
      stats: buildGatewayStats(gateway), pendingCount: pendingByTile.gateway,
    },
    {
      key: 'fixbridge', title: 'FIX bridge',       subtitle: 'Audit, incident bundles, backpressure',
      icon: <FixBridgeIcon className="w-full h-full" />, path: '/settings/fixbridge', ready: true,
      stats: buildFixBridgeStats(fixbridge), pendingCount: pendingByTile.fixbridge,
    },
    {
      key: 'logs',  title: 'Log viewer',           subtitle: 'Tail, search, download across services',
      icon: <LogsIcon className="w-full h-full" />, path: '/settings/logs', ready: true,
      stats: buildLogsStats(logServices), pendingCount: pendingByTile.logs,
    },
    // ─── SECRET ROTATION: root-only, filtered below ───
    {
      key: 'rotation', title: 'Secret rotation',   subtitle: 'Internal, JWT, and encryption keys',
      icon: <KeyIcon className="w-full h-full" />, path: '/settings/rotation', rootOnly: true, ready: true,
      stats: buildRotationStats(encryptPreflight), pendingCount: pendingByTile.rotation,
    },
  ];

  const visibleTiles = tiles.filter(t => !t.rootOnly || isRoot);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-6 overflow-auto">
      {/* Page header */}
      <div className="flex justify-between items-end mb-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            System administration
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            IT office configuration — nine areas, each restart-managed
          </p>
        </div>
        {user ? (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded font-mono"
            style={
              isRoot
                ? { background: '#2a1f14', color: '#c9b87c', border: '1px solid #6a4f2f' }
                : { background: '#163a3a', color: '#49b3b3', border: '1px solid #2f8f8f' }
            }
          >
            {isRoot
              ? <RootStar className="w-3 h-3" />
              : <ShieldSmall className="w-3 h-3" />}
            {user.role}
          </span>
        ) : null}
      </div>

      {/* Restart banner */}
      {hasPending ? (
        <div
          className="rounded p-3 mb-5 flex gap-3 items-start"
          style={{ background: '#2a2016', border: '1px solid #6a4a2f' }}
        >
          <BellAlert className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#e09a55' } as React.CSSProperties} />
          <div className="flex-1 text-sm">
            <p className="font-medium m-0" style={{ color: '#e09a55' }}>
              Restart required — {pendingCount} field{pendingCount === 1 ? '' : 's'} pending
              {pendingServices.length > 0
                ? ` across ${pendingServices.length} service${pendingServices.length === 1 ? '' : 's'}`
                : ''}
            </p>
            <p className="text-text-secondary mt-1 mb-0 text-[13px] leading-snug">
              Changes saved but not yet applied.
              {pendingServices.length > 0 && (
                <>
                  {' '}Restart{' '}
                  {pendingServices.map((s, i) => (
                    <span key={s}>
                      <span
                        className="inline-block font-mono text-[11px] px-1.5 py-0.5 rounded mx-0.5"
                        style={{ background: '#1a1a1d', color: '#e09a55', border: '1px solid #6a4a2f' }}
                      >
                        {s}
                      </span>
                      {i < pendingServices.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                  {' '}to pick them up.
                </>
              )}
              {' '}Affected tiles are flagged with a <span style={{ color: '#e09a55', fontWeight: 500 }}>pending</span> marker.
            </p>
          </div>
        </div>
      ) : null}

      {/* 3×3 tile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleTiles.map(({ key, ...rest }) => (
          <Tile key={key} {...rest} />
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-border flex justify-between items-center text-xs text-text-muted">
        <span>
          <span className="mr-1.5">Environment</span>
          <span className="font-mono text-text-primary">{import.meta.env.MODE}</span>
        </span>
        <span>
          <span className="mr-1.5">Last sync</span>
          <span className="font-mono text-text-primary">
            {new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function gatewaySubtitle(config: GatewayConfig | null): string {
  if (!config) return 'Upstream MT5 and downstream terminal listener';
  return `${config.gateway_name} · Enabled`;
}

function pendingTileKey(section: string, subsection?: string): string | null {
  // Matches the section/subsection strings documented in settings_api.md § 2.
  // Standalone file-backed sections are included on the assumption that the
  // backend will eventually emit them in /settings/pending-restart — if it
  // doesn't, these just never match and the tile marker stays dark.
  if (section === 'nexrisk') {
    if (subsection === 'nexday')             return 'nexday';
    if (subsection === 'trading-economics')  return 'te';
    if (subsection === 'auth')               return 'auth';
    if (subsection === 'alerts')             return 'alerts';
    if (subsection === 'telegram')           return 'alerts';
    if (subsection === 'webhooks')           return 'alerts';
    return null;
  }
  if (section === 'gateway')   return 'gateway';
  if (section === 'fixbridge') return 'fixbridge';
  if (section === 'lp')        return 'lp';
  if (section === 'logs')      return 'logs';
  return null;
}

function serviceForSection(section: string): string | null {
  if (section === 'gateway')   return 'nexrisk_gateway_service';
  if (section === 'fixbridge') return 'fixbridge_service';
  if (section === 'lp')        return 'fixbridge_service';
  if (section === 'nexrisk')   return 'nexrisk_service';
  return null;
}

export default SettingsPage;