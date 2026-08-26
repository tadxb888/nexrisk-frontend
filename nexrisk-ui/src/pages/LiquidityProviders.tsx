// ============================================
// Liquidity Providers — Multi-LP Management
// CRUD + Credentials + Test + Start/Stop + Health + Detail View
// Providers: TraderEvolution · LMAX · CMC (pending)
//
// Every panel on this page reads from the server. There is no local
// substitute for stored configuration: the config form saves through
// PUT /api/v1/fix/admin/lp/{lp_id}, then refetches and verifies that the
// server actually stored what was sent. Tabs whose backing endpoints are
// not wired yet say so rather than showing sample data.
// ============================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { useAuth } from '@/stores/AuthContext';
import {
  lpAdminApi,
  lpOpsApi,
  type LpConfig,
  type LpListRow,
  type LpHealthSummaryRow,
  type LpHealthDetail,
  type LpTestResult,
  type LpTestSession,
  type LpUpdateBody,
  type LpSessionConfig,
  type LpProviderType,
  type LpProviderInfo,
  type LpState,
  type LpSessionState,
  type LpHealthStatus,
} from '@/services/api';

// ============================================================
// ICONS — SVG only, no emojis
// ============================================================
const IcoPlus = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M19,11h-6V5c0-.553-.448-1-1-1s-1,.447-1,1v6H5c-.552,0-1,.447-1,1s.448,1,1,1h6v6c0,.553.448,1,1,1s1-.447,1-1v-6h6c.552,0,1-.447,1-1s-.448-1-1-1Z"/>
  </svg>
);
const IcoEdit = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M22.987,4.206l-3.193-3.193c-.663-.663-1.542-1.013-2.475-1.013s-1.812.35-2.475,1.013L1.707,14.146c-.286.286-.498.637-.616,1.022L.038,20.617c-.09.305-.004.633.224.855.169.163.393.251.624.251.077,0,.155-.01.231-.029l5.449-1.053c.385-.118.735-.33,1.021-.616l13.131-13.131c.663-.663,1.013-1.542,1.013-2.475s-.35-1.812-1.013-2.475Zm-7.397,1.51l1.697,1.697-10.004,10.004-1.697-1.697L15.59,5.716ZM2.281,21.719l.817-3.506,2.689,2.689-3.506.817Zm5.43-1.513l-1.917-1.917L15.798,8.285l1.917,1.917L7.711,20.206Zm12.983-12.983l-.552.552-1.917-1.917.552-.552c.33-.33.769-.512,1.237-.512s.906.182,1.237.512.512.769.512,1.237-.182.906-.512,1.237Z"/>
  </svg>
);
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/>
  </svg>
);
const IcoX = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/>
  </svg>
);
const IcoWarning = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/>
  </svg>
);
const IcoEye = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="m23.271,9.419c-1.02-2.264-2.469-4.216-4.277-5.796-1.85-1.614-4.052-2.831-6.549-3.616-.816-.254-1.717-.254-2.528,0-2.5.785-4.703,2.003-6.553,3.617C1.556,5.204.107,7.155-.913,9.419c-.463,1.026-.463,2.136,0,3.162,1.02,2.265,2.468,4.216,4.276,5.796,1.849,1.614,4.052,2.83,6.552,3.616.408.128.826.192,1.264.192s.856-.064,1.264-.192c2.5-.785,4.703-2.002,6.552-3.616,1.808-1.58,3.257-3.531,4.277-5.797.462-1.025.462-2.135-.001-3.161Zm-11.271,5.581c-2.757,0-5-2.243-5-5s2.243-5,5-5,5,2.243,5,5-2.243,5-5,5Zm0-8c-1.654,0-3,1.346-3,3s1.346,3,3,3,3-1.346,3-3-1.346-3-3-3Z"/>
  </svg>
);
const IcoEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="m4.707,3.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l.967.967C2.526,7.364.897,9.565,0,12c1.02,2.265,2.469,4.216,4.277,5.796,1.849,1.614,4.052,2.831,6.552,3.616.408.128.826.192,1.264.192s.856-.064,1.264-.192c1.338-.42,2.594-.991,3.744-1.698l2.192,2.192c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414L4.707,3.293Zm7.293,14.707c-2.757,0-5-2.243-5-5,0-1.028.319-1.979.853-2.77l1.454,1.454c-.197.41-.307.866-.307,1.316,0,1.654,1.346,3,3,3,.45,0,.906-.11,1.316-.307l1.454,1.454c-.791.534-1.742.853-2.77.853Zm10.729-3.204c-1.02,2.265-2.468,4.216-4.276,5.796l-1.414-1.414c1.535-1.354,2.777-3.002,3.633-4.878-1.052-2.334-2.645-4.343-4.665-5.789-1.96-1.404-4.27-2.211-6.705-2.211h-.3l-2-2c.762-.239,1.558-.369,2.3-.369,2.5,0,4.703,1.002,6.553,2.617,1.808,1.58,3.257,3.531,4.277,5.797.462,1.025.462,2.135-.003,3.451Z"/>
  </svg>
);
const IcoRefresh = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M12,2C6.486,2,2,6.486,2,12s4.486,10,10,10,10-4.486,10-10S17.514,2,12,2Zm4.95,14.95c-1.318,1.318-3.069,2.05-4.95,2.05s-3.632-.732-4.95-2.05c-1.318-1.318-2.05-3.069-2.05-4.95s.732-3.632,2.05-4.95c1.318-1.318,3.069-2.05,4.95-2.05,1.5,0,2.926.468,4.107,1.335l-2.107,2.115h4.5v-4.5l-1.736,1.741c-1.407-1.195-3.158-1.841-4.964-1.691-4.14.344-7.35,3.86-7.35,8.06v.94c0,4.418,3.582,8,8,8,3.86,0,7.128-2.78,7.841-6.483.078-.406-.19-.796-.597-.874-.404-.078-.796.19-.874.597-.571,2.967-3.19,5.198-6.37,5.198Z"/>
  </svg>
);
const IcoPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="M20.494,7.968l-9.54-7.29c-1.265-.967-2.907-1.064-4.199-.259C5.453,1.229,4.659,2.6,4.659,4.14v15.72c0,1.54.794,2.911,2.096,3.62.555.302,1.16.455,1.769.455.877,0,1.761-.318,2.43-.714l9.54-7.29c1.04-.795,1.659-2.046,1.659-3.347s-.619-2.552-1.659-3.347Zm-.819,5.473l-9.54,7.29c-.657.502-1.483.31-1.785.146-.607-.329-.891-.937-.891-1.517V3.64c0-.58.284-1.188.891-1.517.202-.11.465-.173.705-.173.33,0,.669.112.933.319l9.54,7.29c.52.398.821,1.018.821,1.7s-.301,1.302-.674,1.582Z"/>
  </svg>
);
const IcoStop = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="M16,2H8C4.686,2,2,4.686,2,8v8c0,3.314,2.686,6,6,6h8c3.314,0,6-2.686,6-6V8c0-3.314-2.686-6-6-6Zm4,14c0,2.206-1.794,4-4,4H8c-2.206,0-4-1.794-4-4V8c0-2.206,1.794-4,4-4h8c2.206,0,4,1.794,4,4v8Z"/>
  </svg>
);
const IcoKey = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M7.505,24A7.5,7.5,0,0,1,5.469,9.283l7.4-7.4A5.153,5.153,0,0,1,16.541.5L19.2.015a2,2,0,0,1,2.062.7l1.952,2.343a2.005,2.005,0,0,1,.148,2.2l-1.577,2.734a2,2,0,0,1-1.506.956l-2.2.19a1,1,0,0,0-.718.461l-.759,1.27a1,1,0,0,1-1.139.453l-1.5-.441L9.283,15.537A7.458,7.458,0,0,1,7.505,24ZM6,12a5.5,5.5,0,1,0,2.535,10.386,1,1,0,0,0,.465-.465c.227-.439.012-1-.465-1.465a3.5,3.5,0,1,1,4.95-4.95c.465.477,1.026.692,1.465.465a1,1,0,0,0,.465-.465A5.5,5.5,0,0,0,6,12ZM6,19a1,1,0,1,0,1,1A1,1,0,0,0,6,19Z"/>
  </svg>
);
const IcoCheck = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="M22.319,4.431,8.5,18.249a1,1,0,0,1-1.417,0L1.739,12.9a1,1,0,0,1,0-1.417,1,1,0,0,1,1.417,0l4.636,4.636L20.9,3.014a1,1,0,0,1,1.417,1.417Z"/>
  </svg>
);
const IcoArrowLeft = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
    <path d="M17.921,1.505a1.5,1.5,0,0,1-.44,1.06L9.809,10.237a2.5,2.5,0,0,0,0,3.536l7.662,7.662a1.5,1.5,0,0,1-2.121,2.121L7.688,15.9a5.506,5.506,0,0,1,0-7.779L15.36.444a1.5,1.5,0,0,1,2.561,1.061Z"/>
  </svg>
);
const IcoSignal = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M12,10a2,2,0,1,0,2,2A2,2,0,0,0,12,10Zm0-4a6,6,0,0,0-6,6,5.935,5.935,0,0,0,1.756,4.244,1,1,0,0,0,1.414-1.414A3.955,3.955,0,0,1,8,12a4,4,0,0,1,8,0,3.955,3.955,0,0,1-1.17,2.83,1,1,0,0,0,1.414,1.414A5.935,5.935,0,0,0,18,12,6,6,0,0,0,12,6Zm0-4A10,10,0,0,0,2,12a9.882,9.882,0,0,0,2.929,7.071,1,1,0,0,0,1.414-1.414A7.911,7.911,0,0,1,4,12,8,8,0,0,1,20,12a7.911,7.911,0,0,1-2.343,5.657,1,1,0,0,0,1.414,1.414A9.882,9.882,0,0,0,22,12,10,10,0,0,0,12,2Z"/>
  </svg>
);

// ============================================================
// LOCAL TYPES
// ============================================================
type DetailTab = 'overview' | 'config' | 'instruments' | 'positions' | 'orders' | 'routes' | 'audit';

/** Flat mirror of the editable surface of LpConfig. Numeric fields are held as
 *  strings so a half-typed port does not become NaN mid-keystroke. */
interface ConfigForm {
  lp_name:      string;
  environment:  string;
  enabled:      boolean;
  auto_connect: boolean;
  notes:        string;

  t_host: string; t_port: string; t_sender: string; t_target: string;
  t_fix:  string; t_hb:   string;

  md_present: boolean;
  m_host: string; m_port: string; m_sender: string; m_target: string;
  m_fix:  string; m_hb:   string; m_depth:  string;

  r_enabled:  boolean;
  r_interval: string;
  r_max:      string;

  /** provider_settings, primitives only, stringified for editing. */
  ps: Record<string, string>;
}

/** Fields the operator changed, as dotted paths, paired with the value that
 *  should be on the server once the write lands. Drives the post-save audit. */
interface IntendedChange {
  path:     string;
  expected: unknown;
}

// ============================================================
// CONSTANTS
// ============================================================
// Badge colours only. Names, status and settings keys come from the bridge
// (GET /fix/admin/providers) via useProviders(); unknown types fall back to
// NEUTRAL_BADGE.
const PROVIDER_BADGE: Record<string, [string, string, string]> = {
  traderevolution: ['#a5c8f0', '#0f2035', '#1e4270'],
  cmc:             ['#d4a5e0', '#1e1530', '#3d2860'],
  onezero:         ['#a5e0c8', '#0f2a20', '#1e5a40'],
};
const NEUTRAL_BADGE: [string, string, string] = ['#a0a0b0', '#2a2a2c', '#484848'];

// ------------------------------------------------------------
// Provider registry (fetched once per page load, shared by all consumers)
// ------------------------------------------------------------
let providersCache: LpProviderInfo[] | null = null;
let providersInflight: Promise<LpProviderInfo[]> | null = null;

function fetchProviders(): Promise<LpProviderInfo[]> {
  if (providersCache) return Promise.resolve(providersCache);
  if (!providersInflight) {
    providersInflight = lpAdminApi.providers()
      .then(r => { providersCache = r.providers; return providersCache; })
      .finally(() => { providersInflight = null; });
  }
  return providersInflight;
}

function useProviders() {
  const [providers, setProviders] = useState<LpProviderInfo[]>(providersCache ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchProviders()
      .then(p => { if (alive) setProviders(p); })
      .catch(e => { if (alive) setError(errMessage(e)); });
    return () => { alive = false; };
  }, []);
  const labelOf = useCallback(
    (t: string) => providers.find(p => p.provider_type === t)?.display_name ?? t,
    [providers],
  );
  return { providers, labelOf, error };
}

const STATE_CFG: Record<LpState, { color: string; bg: string; border: string; label: string }> = {
  DISCONNECTED:  { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848', label: 'Disconnected' },
  STOPPED:       { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848', label: 'Stopped' },
  CONNECTING:    { color: '#e0d066', bg: '#2a2816', border: '#6a6530', label: 'Connecting' },
  CONNECTED:     { color: '#66e07a', bg: '#162a1c', border: '#2f6a3d', label: 'Connected' },
  DEGRADED:      { color: '#e09a55', bg: '#2a2016', border: '#6a4a2f', label: 'Degraded' },
  QUARANTINED:   { color: '#ff5c5c', bg: '#2c1417', border: '#7a2f36', label: 'Quarantined' },
  SESSION_ERROR: { color: '#ff5c5c', bg: '#2c1417', border: '#7a2f36', label: 'Session Error' },
};

const HEALTH_CFG: Record<LpHealthStatus, { color: string; bg: string; border: string }> = {
  HEALTHY:   { color: '#66e07a', bg: '#162a1c', border: '#2f6a3d' },
  DEGRADED:  { color: '#e09a55', bg: '#2a2016', border: '#6a4a2f' },
  UNHEALTHY: { color: '#ff5c5c', bg: '#2c1417', border: '#7a2f36' },
  UNKNOWN:   { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848' },
};

const SESSION_CFG: Record<LpSessionState, string> = {
  DISCONNECTED: '#a0a0b0',
  CONNECTING:   '#e0d066',
  LOGGED_ON:    '#66e07a',
  RECONNECTING: '#e09a55',
  SESSION_ERROR:'#ff5c5c',
};

const ENVIRONMENTS = ['SANDBOX', 'DEMO', 'PRODUCTION'];
const FIX_VERSIONS = ['FIX.4.2', 'FIX.4.4', 'FIX.5.0'];

/** Amber used for anything that is edited-but-not-stored. Deliberately not the
 *  same green as a persisted value — the whole bug was unsaved state reading
 *  as saved state. */
const DIRTY = '#e0a020';

const HEALTH_POLL_MS = 10_000;

// ============================================================
// HELPERS
// ============================================================
function fmtTs(ms?: number | null): string {
  if (!ms) return '—';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtUptime(sec?: number | null): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function isLiveState(state?: LpState): boolean {
  return state === 'CONNECTED' || state === 'CONNECTING' || state === 'DEGRADED'
      || state === 'QUARANTINED' || state === 'SESSION_ERROR';
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** provider_settings holds a provider-specific bag. Only primitives are
 *  editable; anything structured is preserved untouched on save. */
function primitiveSettings(ps: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ps ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = String(v);
    }
  }
  return out;
}

function configToForm(lp: LpConfig): ConfigForm {
  const t = lp.trading_session;
  const m = lp.md_session;
  const r = lp.reconnection;
  return {
    lp_name:      lp.lp_name ?? '',
    environment:  lp.environment ?? 'SANDBOX',
    enabled:      !!lp.enabled,
    auto_connect: !!lp.auto_connect,
    notes:        lp.notes ?? '',

    t_host:   t?.host ?? '',
    t_port:   t?.port != null ? String(t.port) : '',
    t_sender: t?.sender_comp_id ?? '',
    t_target: t?.target_comp_id ?? '',
    t_fix:    t?.fix_version ?? 'FIX.4.4',
    t_hb:     t?.heartbeat_interval != null ? String(t.heartbeat_interval) : '30',

    md_present: !!m,
    m_host:   m?.host ?? '',
    m_port:   m?.port != null ? String(m.port) : '',
    m_sender: m?.sender_comp_id ?? '',
    m_target: m?.target_comp_id ?? '',
    m_fix:    m?.fix_version ?? 'FIX.4.4',
    m_hb:     m?.heartbeat_interval != null ? String(m.heartbeat_interval) : '30',
    m_depth:  m?.depth != null ? String(m.depth) : '1',

    r_enabled:  !!r?.enabled,
    r_interval: r?.interval_seconds != null ? String(r.interval_seconds) : '',
    r_max:      r?.max_attempts != null ? String(r.max_attempts) : '',

    ps: primitiveSettings(lp.provider_settings),
  };
}

function sameForm(a: ConfigForm, b: ConfigForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Diff the edited form against the record as fetched, and produce the minimal
 * PUT body plus the list of changes we expect to see afterwards.
 *
 * Rules enforced here:
 *  - lp_id and provider_type are immutable and are never included (400).
 *  - Only sub-fields that actually changed are sent, so the backend's
 *    changed_fields receipt lines up 1:1 with what was intended.
 *  - provider_settings is replaced wholesale by the backend, so the fetched
 *    object is spread first and only edited keys are overridden. Without this,
 *    keys the form does not surface (fix_config_path_*, clord_prefix) would be
 *    silently destroyed on every save.
 */
function buildUpdate(orig: LpConfig, f: ConfigForm): { body: LpUpdateBody; intended: IntendedChange[] } {
  const body: LpUpdateBody = {};
  const intended: IntendedChange[] = [];

  const put = (path: string, expected: unknown) => intended.push({ path, expected });

  // ── top-level scalars ────────────────────────────────────────
  if (f.lp_name !== (orig.lp_name ?? ''))            { body.lp_name = f.lp_name;           put('lp_name', f.lp_name); }
  if (f.environment !== (orig.environment ?? ''))    { body.environment = f.environment;   put('environment', f.environment); }
  if (f.enabled !== !!orig.enabled)                  { body.enabled = f.enabled;           put('enabled', f.enabled); }
  if (f.auto_connect !== !!orig.auto_connect)        { body.auto_connect = f.auto_connect; put('auto_connect', f.auto_connect); }
  if (f.notes !== (orig.notes ?? ''))                { body.notes = f.notes;               put('notes', f.notes); }

  // ── trading session ──────────────────────────────────────────
  const t = orig.trading_session ?? ({} as LpSessionConfig);
  const ts: Partial<LpSessionConfig> = {};
  if (f.t_host !== (t.host ?? ''))                        { ts.host = f.t_host;                       put('trading_session.host', f.t_host); }
  if (Number(f.t_port) !== t.port)                        { ts.port = Number(f.t_port);               put('trading_session.port', Number(f.t_port)); }
  if (f.t_sender !== (t.sender_comp_id ?? ''))            { ts.sender_comp_id = f.t_sender;           put('trading_session.sender_comp_id', f.t_sender); }
  if (f.t_target !== (t.target_comp_id ?? ''))            { ts.target_comp_id = f.t_target;           put('trading_session.target_comp_id', f.t_target); }
  if (f.t_fix !== (t.fix_version ?? ''))                  { ts.fix_version = f.t_fix;                 put('trading_session.fix_version', f.t_fix); }
  if (Number(f.t_hb) !== t.heartbeat_interval)            { ts.heartbeat_interval = Number(f.t_hb);   put('trading_session.heartbeat_interval', Number(f.t_hb)); }
  if (Object.keys(ts).length) body.trading_session = ts;

  // ── market data session ──────────────────────────────────────
  if (f.md_present) {
    const m = orig.md_session;
    if (!m) {
      // No stored MD session. Send the block whole; the write receipt and the
      // refetch below are what confirm the backend accepted it.
      body.md_session = {
        host: f.m_host, port: Number(f.m_port),
        sender_comp_id: f.m_sender, target_comp_id: f.m_target,
        fix_version: f.m_fix, heartbeat_interval: Number(f.m_hb),
        depth: Number(f.m_depth),
      };
      put('md_session.host', f.m_host);
      put('md_session.port', Number(f.m_port));
      put('md_session.sender_comp_id', f.m_sender);
      put('md_session.target_comp_id', f.m_target);
    } else {
      const ms: Partial<LpSessionConfig> = {};
      if (f.m_host !== (m.host ?? ''))                { ms.host = f.m_host;                     put('md_session.host', f.m_host); }
      if (Number(f.m_port) !== m.port)                { ms.port = Number(f.m_port);             put('md_session.port', Number(f.m_port)); }
      if (f.m_sender !== (m.sender_comp_id ?? ''))    { ms.sender_comp_id = f.m_sender;         put('md_session.sender_comp_id', f.m_sender); }
      if (f.m_target !== (m.target_comp_id ?? ''))    { ms.target_comp_id = f.m_target;         put('md_session.target_comp_id', f.m_target); }
      if (f.m_fix !== (m.fix_version ?? ''))          { ms.fix_version = f.m_fix;               put('md_session.fix_version', f.m_fix); }
      if (Number(f.m_hb) !== m.heartbeat_interval)    { ms.heartbeat_interval = Number(f.m_hb); put('md_session.heartbeat_interval', Number(f.m_hb)); }
      if (Number(f.m_depth) !== m.depth)              { ms.depth = Number(f.m_depth);           put('md_session.depth', Number(f.m_depth)); }
      if (Object.keys(ms).length) body.md_session = ms;
    }
  }

  // ── reconnection ─────────────────────────────────────────────
  const r = orig.reconnection ?? ({ enabled: false, interval_seconds: 0, max_attempts: 0 });
  const rc: Partial<typeof r> = {};
  if (f.r_enabled !== !!r.enabled)                  { rc.enabled = f.r_enabled;                    put('reconnection.enabled', f.r_enabled); }
  if (Number(f.r_interval) !== r.interval_seconds)  { rc.interval_seconds = Number(f.r_interval);  put('reconnection.interval_seconds', Number(f.r_interval)); }
  if (Number(f.r_max) !== r.max_attempts)           { rc.max_attempts = Number(f.r_max);           put('reconnection.max_attempts', Number(f.r_max)); }
  if (Object.keys(rc).length) body.reconnection = rc as typeof r;

  // ── provider settings (replaced wholesale — preserve unedited keys) ──
  const origPs = primitiveSettings(orig.provider_settings);
  const psChanged = Object.keys(f.ps).filter(k => f.ps[k] !== origPs[k]);
  if (psChanged.length) {
    const merged: Record<string, unknown> = { ...(orig.provider_settings ?? {}) };
    for (const k of psChanged) {
      const before = (orig.provider_settings ?? {})[k];
      merged[k] = typeof before === 'number' ? Number(f.ps[k])
                : typeof before === 'boolean' ? f.ps[k] === 'true'
                : f.ps[k];
      put(`provider_settings.${k}`, merged[k]);
    }
    body.provider_settings = merged;
  }

  return { body, intended };
}

/** Read a dotted path off the refetched record. */
function readPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
    obj,
  );
}

/**
 * The real acceptance check. changed_fields is the backend's own account of
 * what it accepted; this compares the record as it now reads on the server
 * against what was sent. Anything listed here was dropped in transit and the
 * operator has to be told, because a silent no-op is the original defect.
 */
function auditWrite(fresh: LpConfig, intended: IntendedChange[]): string[] {
  const dropped: string[] = [];
  for (const { path, expected } of intended) {
    const actual = readPath(fresh, path);
    if (String(actual) !== String(expected)) {
      dropped.push(`${path} — sent ${JSON.stringify(expected)}, stored ${JSON.stringify(actual)}`);
    }
  }
  return dropped;
}

// ============================================================
// SHARED ATOMS
// ============================================================
function StateBadge({ state }: { state?: LpState }) {
  const c = state ? STATE_CFG[state] : undefined;
  if (!c) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
        style={{ color: '#a0a0b0', backgroundColor: '#2a2a2c', border: '1px solid #484848' }}>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#555' }} />
        No status
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color: c.color, backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
      {c.label}
    </span>
  );
}

function ProviderBadge({ type }: { type: LpProviderType }) {
  const { labelOf } = useProviders();
  const [color, bg, border] = PROVIDER_BADGE[type] ?? NEUTRAL_BADGE;
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {labelOf(type)}
    </span>
  );
}

function EnvBadge({ env }: { env: string }) {
  const prod = env === 'PRODUCTION';
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold tracking-wide"
      style={prod
        ? { color: '#ff9a9a', backgroundColor: '#2c1417', border: '1px solid #7a2f36' }
        : { color: '#a0a0b0', backgroundColor: '#232225', border: '1px solid #484848' }}>
      {env}
    </span>
  );
}

function SessionDot({ state, label }: { state?: LpSessionState; label: string }) {
  const color = state ? SESSION_CFG[state] : '#555';
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-text-muted">{label}:</span>
      <span style={{ color }}>{state || 'unknown'}</span>
    </span>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center',
        width: 36, height: 20, borderRadius: 10, padding: 3,
        backgroundColor: checked ? '#163a3a' : '#383838',
        border: `1.5px solid ${checked ? '#49b3b3' : '#505050'}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0, outline: 'none',
        transition: 'background-color .15s, border-color .15s',
      }}>
      <span style={{
        display: 'block', width: 12, height: 12, borderRadius: '50%',
        backgroundColor: checked ? '#49b3b3' : '#888',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .15s, background-color .15s',
      }} />
    </button>
  );
}

/** Text field that shows an amber rail while its value differs from the value
 *  currently stored on the server. */
function Field({ label, value, stored, onChange, mono, disabled, placeholder, hint }: {
  label: string;
  value: string;
  stored: string;
  onChange: (v: string) => void;
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  const dirty = value !== stored;
  return (
    <div>
      <label className="flex items-center gap-1.5 text-text-secondary mb-1" style={{ fontSize: 11 }}>
        {label}
        {dirty && <span style={{ color: DIRTY, fontSize: 10 }}>edited</span>}
      </label>
      <input
        className={clsx('input w-full text-sm', mono && 'font-mono')}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{
          borderLeft: dirty ? `2px solid ${DIRTY}` : '2px solid transparent',
          opacity: disabled ? 0.5 : 1,
        }} />
      {hint && <div className="text-text-muted mt-1" style={{ fontSize: 10 }}>{hint}</div>}
    </div>
  );
}

function SelectField({ label, value, stored, options, onChange }: {
  label: string; value: string; stored: string; options: string[]; onChange: (v: string) => void;
}) {
  const dirty = value !== stored;
  return (
    <div>
      <label className="flex items-center gap-1.5 text-text-secondary mb-1" style={{ fontSize: 11 }}>
        {label}
        {dirty && <span style={{ color: DIRTY, fontSize: 10 }}>edited</span>}
      </label>
      <select className="select w-full text-sm" value={value} onChange={e => onChange(e.target.value)}
        style={{ borderLeft: dirty ? `2px solid ${DIRTY}` : '2px solid transparent' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-semibold text-text-muted uppercase tracking-wider" style={{ fontSize: 11 }}>{children}</h3>
      {right}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border last:border-0">
      <span className="text-xs text-text-muted flex-shrink-0">{label}</span>
      <span className="text-xs text-text-primary text-right break-all">{children}</span>
    </div>
  );
}

function ErrorPanel({ title, lines, onDismiss }: { title: string; lines: string[]; onDismiss?: () => void }) {
  return (
    <div className="p-3 rounded space-y-1.5"
      style={{ backgroundColor: '#2c1417', border: '1px solid #7a2f36' }}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#ff5c5c' }}>
          <IcoWarning /> {title}
        </span>
        {onDismiss && (
          <button onClick={onDismiss} className="p-0.5 rounded hover:bg-[#3a1a1e]" style={{ color: '#ff5c5c' }}>
            <IcoX size={11} />
          </button>
        )}
      </div>
      {lines.map((l, i) => (
        <div key={i} className="font-mono" style={{ fontSize: 11, color: '#ffb0b0' }}>{l}</div>
      ))}
    </div>
  );
}

function EmptyTab({ title, detail, endpoint }: { title: string; detail: string; endpoint: string }) {
  return (
    <div className="panel p-6 space-y-2">
      <div className="text-sm font-semibold text-text-primary">{title}</div>
      <div className="text-xs text-text-secondary max-w-xl leading-relaxed">{detail}</div>
      <div className="font-mono text-text-muted pt-1" style={{ fontSize: 11 }}>{endpoint}</div>
    </div>
  );
}

// Toast hook
function useToast() {
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = useCallback((msg: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ msg, tone });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { toast, showToast: show };
}

// ============================================================
// LP CARD
// ============================================================
function LPCard({ lp, health, busy, onDelete, onStart, onStop, onTest, onCredentials, onDetail }: {
  lp: LpListRow;
  health?: LpHealthSummaryRow;
  busy: boolean;
  onDelete: () => void;
  onStart: () => void;
  onStop: () => void;
  onTest: () => void;
  onCredentials: () => void;
  onDetail: () => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('lp_admin', 'EDIT');
  const live = isLiveState(health?.state);
  const hcfg = health ? HEALTH_CFG[health.health] : undefined;
  return (
    <div className="p-4 pt-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <button onClick={onDetail}
            className="text-sm font-semibold text-text-primary hover:text-[#49b3b3] text-left truncate block">
            {lp.lp_name}
          </button>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <ProviderBadge type={lp.provider_type} />
            <EnvBadge env={lp.environment} />
            <span className="font-mono text-text-muted" style={{ fontSize: 11 }}>{lp.lp_id}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <StateBadge state={health?.state} />
          {hcfg && (
            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: hcfg.color, backgroundColor: hcfg.bg, border: `1px solid ${hcfg.border}` }}>
              {health!.health}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <SessionDot state={health?.trading_state} label="Trading" />
        <SessionDot state={health?.md_state} label="MD" />
      </div>

      <div className="flex items-center gap-3 flex-wrap text-text-muted" style={{ fontSize: 11 }}>
        <span>Uptime <span className="font-mono text-text-secondary">{fmtUptime(health?.uptime_seconds)}</span></span>
        {!!health?.warnings_count && (
          <span style={{ color: '#e09a55' }}>{health.warnings_count} warning{health.warnings_count === 1 ? '' : 's'}</span>
        )}
        {!!health?.errors_24h_count && (
          <span style={{ color: '#ff5c5c' }}>{health.errors_24h_count} errors 24h</span>
        )}
        {/* This flag is a summary across every stored secret, so it reads true
            even when only one session has a password. Per-session state lives
            on the Configuration tab and in the credentials dialog. */}
        <span title="Summary only. Open Credentials for per-session state."
          style={{ color: lp.credentials_set ? '#66e07a' : '#e09a55' }}>
          {lp.credentials_set ? 'Credentials recorded' : 'No credentials'}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap pt-1">
        <button onClick={onDetail} className="btn btn-ghost border border-border px-2.5 py-1 flex items-center gap-1.5" style={{ fontSize: 11 }}>
          <IcoEdit /> Configure
        </button>
        <button onClick={onCredentials} disabled={!canEdit}
          className="btn btn-ghost border border-border px-2.5 py-1 flex items-center gap-1.5"
          style={{ fontSize: 11, opacity: canEdit ? 1 : 0.4 }}>
          <IcoKey /> Credentials
        </button>
        <button onClick={onTest} disabled={!canEdit || busy}
          className="btn btn-ghost border border-border px-2.5 py-1 flex items-center gap-1.5"
          style={{ fontSize: 11, opacity: canEdit && !busy ? 1 : 0.4 }}>
          <IcoSignal /> Test
        </button>
        {live ? (
          <button onClick={onStop} disabled={!canEdit || busy}
            className="btn px-2.5 py-1 flex items-center gap-1.5"
            style={{ fontSize: 11, backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f', opacity: canEdit && !busy ? 1 : 0.4 }}>
            <IcoStop /> Stop
          </button>
        ) : (
          <button onClick={onStart} disabled={!canEdit || busy}
            className="btn px-2.5 py-1 flex items-center gap-1.5"
            style={{ fontSize: 11, backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d', opacity: canEdit && !busy ? 1 : 0.4 }}>
            <IcoPlay /> Start
          </button>
        )}
        <button onClick={onDelete} disabled={!canEdit || live}
          title={live ? 'Stop the LP before deleting' : undefined}
          className="btn btn-ghost border border-border px-2.5 py-1 flex items-center gap-1.5"
          style={{ fontSize: 11, color: '#ff5c5c', opacity: canEdit && !live ? 1 : 0.4 }}>
          <IcoTrash /> Delete
        </button>
      </div>
    </div>
  );
}

// ============================================================
// CREATE LP MODAL
// ============================================================
interface CreateForm {
  lp_id: string; lp_name: string; provider_type: LpProviderType;
  environment: string; enabled: boolean; auto_connect: boolean;
  t_host: string; t_port: string; t_sender: string; t_target: string; t_fix: string; t_hb: string;
  md_present: boolean;
  m_host: string; m_port: string; m_sender: string; m_target: string; m_depth: string;
  /** provider_settings values keyed by the selected provider's
   *  provider_settings_keys. Rendered generically; no per-provider fields. */
  ps: Record<string, string>;
}

function emptyCreateForm(): CreateForm {
  return {
    lp_id: '', lp_name: '', provider_type: '',
    environment: 'SANDBOX', enabled: true, auto_connect: false,
    t_host: '', t_port: '', t_sender: '', t_target: '', t_fix: 'FIX.4.4', t_hb: '30',
    md_present: true,
    m_host: '', m_port: '', m_sender: '', m_target: '', m_depth: '1',
    ps: {},
  };
}

/** Segmented choice — replaces a <select> where there are ≤4 fixed options,
 *  so the whole choice set is visible without opening anything. */
function Seg<T extends string>({ value, options, onChange, danger }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** option that should read as a warning when selected (PRODUCTION) */
  danger?: T;
}) {
  return (
    <div className="inline-flex rounded overflow-hidden" style={{ border: '1px solid #404040', backgroundColor: '#232225' }}>
      {options.map((o, i) => {
        const on = o.value === value;
        const isDanger = on && danger === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className="px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              color: isDanger ? '#ff9a9a' : on ? '#49b3b3' : '#8a8a94',
              backgroundColor: isDanger ? '#2c1417' : on ? '#163a3a' : 'transparent',
              borderLeft: i === 0 ? 'none' : '1px solid #404040',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Compact labelled input for the create dialog. Hints live in the
 *  placeholder and the tooltip, not under the field, so a row of inputs is
 *  one row tall. `required` draws a teal tick once the field has a value. */
function CField({ label, value, onChange, placeholder, hint, mono = true, required, span }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  required?: boolean;
  span?: number;
}) {
  const filled = value.trim().length > 0;
  return (
    <div style={span ? { gridColumn: `span ${span} / span ${span}` } : undefined}>
      <label className="flex items-center justify-between text-text-secondary mb-1" style={{ fontSize: 11 }}>
        <span>{label}</span>
        {required && (
          <span style={{ fontSize: 10, color: filled ? '#49b3b3' : '#6a6a72' }}>{filled ? '✓' : 'required'}</span>
        )}
      </label>
      <input
        className={clsx('input w-full text-sm', mono && 'font-mono')}
        value={value}
        placeholder={placeholder}
        title={hint}
        onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function SessionCard({ title, subtitle, accent, right, children, muted }: {
  title: string; subtitle: string; accent: string;
  right?: React.ReactNode; children: React.ReactNode; muted?: boolean;
}) {
  return (
    <div className="rounded flex flex-col"
      style={{ backgroundColor: '#232225', border: '1px solid #404040', borderTop: `2px solid ${muted ? '#404040' : accent}`, opacity: muted ? 0.6 : 1 }}>
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text-primary">{title}</div>
          <div className="text-text-muted" style={{ fontSize: 11 }}>{subtitle}</div>
        </div>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

/** Friendly labels for provider_settings keys. The bridge only reports the
 *  snake_case identifiers; anything not listed here is humanised. */
const PS_LABELS: Record<string, string> = {
  account:              'Account',
  security_exchange:    'Security exchange',
  md_security_exchange: 'MD security exchange',
  clord_prefix:         'ClOrdID prefix',
  brand:                'Brand',
  margin_account:       'Margin account',
  taker_portfolio_id:   'Taker portfolio ID',
  on_behalf_of_comp_id: 'OnBehalfOfCompID',
  sender_sub_id:        'SenderSubID',
};
const psLabel = (k: string) =>
  PS_LABELS[k] ?? k.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

/** Searchable single-select over the bridge's adapter registry. Renders
 *  only what the backend reports; no fallback list. */
function ProviderSelect({ providers, value, onSelect, loading, error }: {
  providers: LpProviderInfo[];
  value: string;
  onSelect: (p: LpProviderInfo) => void;
  loading: boolean;
  error: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...providers].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [providers],
  );
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? sorted.filter(p => p.display_name.toLowerCase().includes(needle) || p.provider_type.includes(needle))
    : sorted;
  const selected = providers.find(p => p.provider_type === value);
  const [selColor] = PROVIDER_BADGE[value] ?? NEUTRAL_BADGE;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    search.current?.focus();
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => { setCursor(0); }, [needle]);

  const choose = (p: LpProviderInfo) => { onSelect(p); setOpen(false); setQ(''); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[cursor]) choose(shown[cursor]); }
    else if (e.key === 'Escape') { setOpen(false); setQ(''); }
  };

  const disabled = loading || !!error || providers.length === 0;

  return (
    <div ref={root} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className="input w-full text-sm flex items-center gap-2 text-left"
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
        {selected ? (
          <>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: selColor }} />
            <span className="truncate text-text-primary">{selected.display_name}</span>
          </>
        ) : (
          <span className="text-text-muted">{loading ? 'Loading providers…' : error ? 'Provider list unavailable' : 'Select a provider'}</span>
        )}
        <span className="ml-auto text-text-muted" style={{ fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 rounded shadow-lg z-20 overflow-hidden"
          style={{ backgroundColor: '#232225', border: '1px solid #484848' }}>
          <div className="p-1.5" style={{ borderBottom: '1px solid #383838' }}>
            <input ref={search} className="input w-full text-sm" value={q} placeholder="Search…"
              onChange={e => setQ(e.target.value)} onKeyDown={onKey} />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 260 }} role="listbox">
            {shown.length === 0 && (
              <div className="px-3 py-3 text-text-muted" style={{ fontSize: 11 }}>No provider matches “{q}”.</div>
            )}
            {shown.map((p, i) => {
              const [c] = PROVIDER_BADGE[p.provider_type] ?? NEUTRAL_BADGE;
              const on = p.provider_type === value;
              return (
                <div key={p.provider_type} role="option" aria-selected={on}
                  onMouseEnter={() => setCursor(i)} onMouseDown={e => { e.preventDefault(); choose(p); }}
                  className="px-3 py-2 flex items-center gap-2 cursor-pointer"
                  style={{ backgroundColor: i === cursor ? '#2f2e32' : 'transparent' }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                  <span className="text-sm" style={{ color: on ? '#49b3b3' : '#e0e0e0' }}>{p.display_name}</span>
                  <span className="font-mono text-text-muted ml-1 truncate" style={{ fontSize: 10 }}>{p.provider_type}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {on && <span style={{ color: '#49b3b3', fontSize: 11 }}>✓</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {error && <div className="mt-1.5" style={{ fontSize: 10, color: '#e0a5a5' }}>Provider list unavailable: {error}</div>}
    </div>
  );
}

function CreateLPModal({ onClose, onCreated, showToast }: {
  onClose: () => void;
  onCreated: () => void;
  showToast: (m: string, t?: 'ok' | 'warn') => void;
}) {
  const [f, setF] = useState<CreateForm>(emptyCreateForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upd = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setF(p => ({ ...p, [k]: v }));

  const idValid = /^[a-z0-9][a-z0-9-]{2,31}$/.test(f.lp_id);
  const missing: string[] = [];
  if (!idValid)   missing.push('LP ID');
  if (!f.provider_type) missing.push('Provider');
  if (!f.lp_name) missing.push('Display name');
  if (!f.t_host)  missing.push('Trading host');
  if (!f.t_port)  missing.push('Trading port');
  if (!f.t_sender) missing.push('Trading SenderCompID');
  if (!f.t_target) missing.push('Trading TargetCompID');
  const canSave = missing.length === 0;

  const { providers, error: provError } = useProviders();
  const prov = providers.find(p => p.provider_type === f.provider_type);
  const [provColor] = PROVIDER_BADGE[f.provider_type] ?? ['#49b3b3'];

  const selectProvider = (p: LpProviderInfo) => {
    setF(prev => ({
      ...prev,
      provider_type: p.provider_type,
      md_present: p.md_session === 'separate',
      ps: Object.fromEntries(p.provider_settings_keys.map(k => [k, prev.ps[k] ?? ''])),
    }));
  };
  const updPs = (k: string, v: string) => setF(p => ({ ...p, ps: { ...p.ps, [k]: v } }));

  // Default to the first production provider once the registry arrives.
  useEffect(() => {
    if (f.provider_type || providers.length === 0) return;
    selectProvider(providers.find(p => p.status === 'production') ?? providers[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers]);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await lpAdminApi.create({
        lp_id: f.lp_id,
        provider_type: f.provider_type,
        lp_name: f.lp_name,
        environment: f.environment,
        enabled: f.enabled,
        auto_connect: f.auto_connect,
        trading_session: {
          host: f.t_host, port: Number(f.t_port),
          sender_comp_id: f.t_sender, target_comp_id: f.t_target,
          fix_version: f.t_fix, heartbeat_interval: Number(f.t_hb),
        },
        ...(f.md_present && f.m_host ? {
          md_session: {
            host: f.m_host, port: Number(f.m_port),
            sender_comp_id: f.m_sender, target_comp_id: f.m_target,
            fix_version: f.t_fix, heartbeat_interval: Number(f.t_hb),
            depth: Number(f.m_depth),
          },
        } : {}),
        // Send every key the adapter declares, even when empty, so the
        // Configuration tab renders them for editing.
        ...(Object.keys(f.ps).length ? { provider_settings: f.ps } : {}),
      });
      showToast(`${f.lp_name} created — set credentials before starting it`);
      onCreated();
      onClose();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-h-[92vh] flex flex-col" style={{ maxWidth: 1120, backgroundColor: '#2a2a2c' }}>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: provColor }} />
            <h2 className="text-base font-semibold text-text-primary whitespace-nowrap">Add liquidity provider</h2>
            <span className="text-text-muted truncate" style={{ fontSize: 11 }}>
              Identity and FIX sessions now · passwords are set separately after the LP exists
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded flex-shrink-0"><IcoX /></button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {error && <ErrorPanel title="Could not create the LP" lines={[error]} onDismiss={() => setError(null)} />}

          <div className="grid gap-4" style={{ gridTemplateColumns: '300px 1fr' }}>

            {/* Identity rail */}
            <div className="rounded p-4 space-y-4" style={{ backgroundColor: '#232225', border: '1px solid #404040' }}>
              <div>
                <div className="text-text-secondary mb-1.5" style={{ fontSize: 11 }}>Provider</div>
                <ProviderSelect providers={providers} value={f.provider_type} onSelect={selectProvider}
                  loading={providers.length === 0 && !provError} error={provError} />
              </div>

              <CField label="LP ID" value={f.lp_id} required
                placeholder="lmax-demo"
                hint="Lowercase letters, digits and hyphens, 3–32 characters. Cannot be changed later."
                onChange={v => upd('lp_id', v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
              <CField label="Display name" value={f.lp_name} required mono={false}
                placeholder="LMAX Demo" onChange={v => upd('lp_name', v)} />

              <div>
                <div className="text-text-secondary mb-1.5" style={{ fontSize: 11 }}>Environment</div>
                <Seg value={f.environment} danger="PRODUCTION"
                  options={ENVIRONMENTS.map(e => ({ value: e, label: e === 'PRODUCTION' ? 'PROD' : e }))}
                  onChange={v => upd('environment', v)} />
              </div>

              <div className="space-y-2 pt-1" style={{ borderTop: '1px solid #383838' }}>
                <label className="flex items-center justify-between gap-2 text-xs text-text-secondary pt-2">
                  Enabled <Toggle checked={f.enabled} onChange={v => upd('enabled', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                  Connect on service start <Toggle checked={f.auto_connect} onChange={v => upd('auto_connect', v)} />
                </label>
              </div>
            </div>

            {/* Sessions + provider settings */}
            <div className="space-y-4 min-w-0">
              <div className="grid grid-cols-2 gap-4">
                <SessionCard title="Trading session" subtitle="Orders, executions, position reports" accent={provColor}
                  right={<span className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: '#49b3b3', backgroundColor: '#163a3a', border: '1px solid #2a6a6a' }}>required</span>}>
                  <div className="grid grid-cols-3 gap-3">
                    <CField label="Host" span={2} value={f.t_host} required placeholder="fix.lp.example.com" onChange={v => upd('t_host', v)} />
                    <CField label="Port" value={f.t_port} required placeholder="443" onChange={v => upd('t_port', v.replace(/\D/g, ''))} />
                    <CField label="SenderCompID" span={3} value={f.t_sender} required
                      placeholder="Your side — the login the LP issued you"
                      hint="Your side. The login the LP issued you."
                      onChange={v => upd('t_sender', v)} />
                    <CField label="TargetCompID" span={3} value={f.t_target} required
                      placeholder="Their side — the trading gateway, e.g. TEORDER"
                      hint="Their side. The LP's trading gateway, e.g. TEORDER."
                      onChange={v => upd('t_target', v)} />
                    <div className="col-span-2">
                      <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>FIX version</label>
                      <select className="select w-full text-sm" value={f.t_fix} onChange={e => upd('t_fix', e.target.value)}>
                        {FIX_VERSIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <CField label="Heartbeat (s)" value={f.t_hb} onChange={v => upd('t_hb', v.replace(/\D/g, ''))} />
                  </div>
                </SessionCard>

                {prov?.md_session !== 'shared' && (
                <SessionCard title="Market data session" subtitle="Quotes and book depth" accent={provColor} muted={!f.md_present}
                  right={
                    <label className="flex items-center gap-2 text-xs text-text-secondary">
                      {f.md_present ? 'On' : 'Off'} <Toggle checked={f.md_present} onChange={v => upd('md_present', v)} />
                    </label>
                  }>
                  {f.md_present ? (
                    <div className="grid grid-cols-3 gap-3">
                      <CField label="Host" span={2} value={f.m_host} placeholder="Leave blank to skip the MD session" onChange={v => upd('m_host', v)} />
                      <CField label="Port" value={f.m_port} placeholder="443" onChange={v => upd('m_port', v.replace(/\D/g, ''))} />
                      <CField label="SenderCompID" span={3} value={f.m_sender}
                        placeholder="Your side — the login the LP issued you"
                        hint="Your side. The login the LP issued you."
                        onChange={v => upd('m_sender', v)} />
                      <CField label="TargetCompID" span={3} value={f.m_target}
                        placeholder="Their side — the price gateway, e.g. TEPRICE"
                        hint="Their side. The LP's price gateway, e.g. TEPRICE."
                        onChange={v => upd('m_target', v)} />
                      <div className="col-span-2 flex items-end pb-2 text-text-muted" style={{ fontSize: 10 }}>
                        FIX version and heartbeat follow the trading session.
                      </div>
                      <CField label="Book depth" value={f.m_depth} placeholder="1" onChange={v => upd('m_depth', v.replace(/\D/g, ''))} />
                    </div>
                  ) : (
                    <div className="text-text-muted py-6 text-center" style={{ fontSize: 11 }}>
                      No market data session. Turn it on to stream prices from this LP.
                    </div>
                  )}
                </SessionCard>
                )}
              </div>

              <div className="rounded px-4 py-3" style={{ backgroundColor: '#232225', border: '1px solid #404040' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-text-primary">
                    {prov?.display_name ?? f.provider_type} settings
                  </div>
                  <div className="text-text-muted" style={{ fontSize: 10 }}>
                    Optional · more keys can be added from the Configuration tab
                  </div>
                </div>
                {prov && prov.provider_settings_keys.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {prov.provider_settings_keys.map(k => (
                      <CField key={k} label={psLabel(k)} value={f.ps[k] ?? ''} hint={k} onChange={v => updPs(k, v)} />
                    ))}
                  </div>
                ) : (
                  <div className="text-text-muted" style={{ fontSize: 11 }}>This provider reads no settings.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-border flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0" style={{ fontSize: 11 }}>
            {canSave ? (
              <span className="inline-flex items-center gap-1.5" style={{ color: '#66e07a' }}>
                <IcoCheck /> Ready to create
              </span>
            ) : (
              <>
                <span className="text-text-muted">Still needed:</span>
                {missing.map(m => (
                  <span key={m} className="px-1.5 py-0.5 rounded font-mono"
                    style={{ fontSize: 10, color: '#a0a0b0', backgroundColor: '#232225', border: '1px solid #484848' }}>{m}</span>
                ))}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
            <button onClick={submit} disabled={!canSave || saving}
              className="btn text-xs px-4 py-1.5"
              style={canSave && !saving
                ? { backgroundColor: '#163a3a', color: '#49b3b3', border: '1px solid #2a6a6a' }
                : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
              {saving ? 'Creating…' : 'Create LP'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CREDENTIALS MODAL
// ============================================================
function CredentialsModal({ lpId, lpName, providerType, credentials, onClose, onSaved, showToast }: {
  lpId: string;
  lpName: string;
  providerType: LpProviderType;
  credentials?: LpConfig['credentials'];
  onClose: () => void;
  onSaved: () => void;
  showToast: (m: string, t?: 'ok' | 'warn') => void;
}) {
  const [password, setPassword] = useState('');
  const [mdPassword, setMdPassword] = useState('');
  const [username, setUsername] = useState('');
  const [brand, setBrand] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  // The list card opens this dialog without the full record. Fetch it so the
  // per-session state below is always the server's, never inferred from the
  // list's single credentials_set flag.
  const [cred, setCred] = useState(credentials);
  const isCmc = providerType === 'cmc';

  useEffect(() => {
    let cancelled = false;
    if (credentials) return;
    lpAdminApi.get(lpId)
      .then(c => { if (!cancelled) setCred(c.credentials); })
      .catch(() => { /* the dialog still works without the summary */ });
    return () => { cancelled = true; };
  }, [lpId, credentials]);

  /**
   * A credentials write reports success whether or not the backend recognised
   * the field names it was given, so the response is not evidence of anything.
   * The stored `*_set_at` timestamps are. Read them before and after and
   * require the relevant one to have moved.
   */
  const submit = async () => {
    setSaving(true); setError(null); setProblems([]);
    try {
      const before = await lpAdminApi.get(lpId);
      const beforeTrading = before.credentials?.trading_password_set_at ?? 0;
      const beforeMd      = before.credentials?.md_password_set_at ?? 0;

      await lpAdminApi.setCredentials(lpId, {
        ...(password ? { trading_password: password } : {}),
        ...(mdPassword ? { md_password: mdPassword } : {}),
        ...(username ? { username } : {}),
        ...(brand ? { brand } : {}),
      });

      const after = await lpAdminApi.get(lpId);
      const found: string[] = [];
      if (password && (after.credentials?.trading_password_set_at ?? 0) <= beforeTrading) {
        found.push('trading_password — the server accepted the request but did not record a new trading password');
      }
      if (mdPassword && (after.credentials?.md_password_set_at ?? 0) <= beforeMd) {
        found.push('md_password — the server accepted the request but did not record a new market data password');
      }

      if (found.length) {
        setProblems(found);
        return;   // leave the dialog open; the operator has not finished
      }

      showToast(`Credentials saved for ${lpName}`);
      onSaved();
      onClose();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Credentials — {lpName}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded"><IcoX /></button>
        </div>
        <div className="p-5 space-y-4">
          {error && <ErrorPanel title="Could not save credentials" lines={[error]} onDismiss={() => setError(null)} />}

          {!!problems.length && (
            <ErrorPanel
              title="The password was not stored"
              lines={problems}
              onDismiss={() => setProblems([])} />
          )}

          {cred && (
            <div className="space-y-1">
              <Row label="Trading password">
                {cred.trading_password_set_at
                  ? <span style={{ color: '#66e07a' }}>Set {fmtTs(cred.trading_password_set_at)}</span>
                  : <span style={{ color: '#e09a55' }}>Never set</span>}
              </Row>
              <Row label="Market data password">
                {cred.md_password_set_at
                  ? <span style={{ color: '#66e07a' }}>Set {fmtTs(cred.md_password_set_at)}</span>
                  : <span style={{ color: '#e09a55' }}>Never set</span>}
              </Row>
            </div>
          )}

          <div>
            <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>Trading password (FIX logon)</label>
            <div className="relative">
              <input className="input w-full text-sm font-mono pr-9"
                type={showPwd ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Leave blank to keep the stored password" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? <IcoEyeOff /> : <IcoEye />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>Market data password</label>
            <input className="input w-full text-sm font-mono"
              type={showPwd ? 'text' : 'password'}
              value={mdPassword} onChange={e => setMdPassword(e.target.value)}
              placeholder="Leave blank to keep the stored password" />
          </div>

          {isCmc && (
            <>
              <div>
                <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>Username (tag 553)</label>
                <input className="input w-full text-sm font-mono" value={username}
                  onChange={e => setUsername(e.target.value)} placeholder="CMC username" />
              </div>
              <div>
                <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>Brand code (tag 21001)</label>
                <input className="input w-full text-sm font-mono" value={brand}
                  onChange={e => setBrand(e.target.value)} placeholder="Brand code" />
              </div>
            </>
          )}

          <div className="p-2.5 rounded text-xs"
            style={{ backgroundColor: '#1a1e28', border: '1px solid #3a4050', color: '#a5b0c0' }}>
            Passwords are stored encrypted and are never returned by the API. Changing them takes effect on the
            running session only after a reload.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
          <button onClick={submit} disabled={saving || (!password && !mdPassword && !username && !brand)}
            className="btn text-xs px-4 py-1.5"
            style={!saving && (password || mdPassword || username || brand)
              ? { backgroundColor: '#163a3a', color: '#49b3b3', border: '1px solid #2a6a6a' }
              : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
            {saving ? 'Saving…' : 'Save credentials'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DELETE CONFIRMATION MODAL
// ============================================================
function DeleteModal({ lpId, lpName, onClose, onDeleted, showToast }: {
  lpId: string; lpName: string;
  onClose: () => void;
  onDeleted: () => void;
  showToast: (m: string, t?: 'ok' | 'warn') => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await lpAdminApi.remove(lpId);
      showToast(`${lpName} deleted`);
      onDeleted();
      onClose();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Delete LP configuration</h2>
        </div>
        <div className="p-5 space-y-3">
          {error && <ErrorPanel title="Could not delete the LP" lines={[error]} onDismiss={() => setError(null)} />}
          <p className="text-sm text-text-secondary">
            Permanently delete <span className="text-text-primary font-semibold">{lpName}</span>
            <span className="font-mono text-text-muted"> ({lpId})</span>?
          </p>
          <p className="text-sm text-text-muted">
            This removes the configuration and its stored credentials. It cannot be undone.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="btn text-xs px-4 py-1.5"
            style={{ backgroundColor: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Deleting…' : 'Delete LP'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONNECTION TEST MODAL
// ============================================================

/** SKIPPED is not a pass. A skipped session gets a grey dot and says so in
 *  words, because an operator reading grey-as-green is how an untested session
 *  gets mistaken for a working one. */
function testSessionStyle(result?: LpTestSession['result']): { dot: string; label: string; color: string } {
  switch (result) {
    case 'OK':      return { dot: '#66e07a', label: 'Connected',  color: '#66e07a' };
    case 'SKIPPED': return { dot: '#6a6a6a', label: 'Not tested', color: '#a0a0b0' };
    case 'TIMEOUT': return { dot: '#e09a55', label: 'Timed out',  color: '#e09a55' };
    case 'FAILED':  return { dot: '#ff5c5c', label: 'Failed',     color: '#ff5c5c' };
    default:        return { dot: '#6a6a6a', label: 'No result',  color: '#a0a0b0' };
  }
}

function TestSessionPanel({ title, session }: { title: string; session?: LpTestSession }) {
  const s = testSessionStyle(session?.result);
  return (
    <div className="p-3 rounded space-y-1.5" style={{ backgroundColor: '#232225', border: '1px solid #404040' }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary">{title}</span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: s.color }}>
          {s.label}
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.dot }} />
        </span>
      </div>
      {/* The venue's own rejection text goes first. `message` is our backend's
          canned line per error_code and is generic by design — on a
          LOGON_REJECTED it reads "Check SenderCompID, TargetCompID, and
          password" regardless of what the LP actually said, which sends the
          operator after the wrong thing when the real reason is something
          like a disabled session. */}
      {session?.error && (
        <div style={{ fontSize: 11, color: '#ff5c5c' }}>{session.error}</div>
      )}
      {session?.message && (
        <div className="text-text-muted" style={{ fontSize: 11 }}>
          {session.error ? `Usual causes: ${session.message}` : session.message}
        </div>
      )}
      <div className="flex items-center gap-3 flex-wrap text-text-muted" style={{ fontSize: 11 }}>
        {session?.latency_ms != null && (
          <span>Logon <span className="font-mono text-text-primary">{session.latency_ms} ms</span></span>
        )}
        {session?.server_comp_id && (
          <span>Server <span className="font-mono text-text-primary">{session.server_comp_id}</span></span>
        )}
        {session?.error_code && (
          <span className="font-mono" style={{ color: '#ff9a9a' }}>{session.error_code}</span>
        )}
      </div>
    </div>
  );
}

function TestModal({ lpId, lpName, onClose }: { lpId: string; lpName: string; onClose: () => void }) {
  const [status, setStatus] = useState<'testing' | 'done' | 'error'>('testing');
  const [result, setResult] = useState<LpTestResult | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await lpAdminApi.test(lpId);
        if (cancelled) return;
        setResult(r);
        setStatus('done');
      } catch (e) {
        if (cancelled) return;
        setError(errMessage(e));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [lpId]);

  const overall = result?.overall;
  const overallStyle = overall === 'PASS'
    ? { color: '#66e07a', backgroundColor: '#162a1c', border: '1px solid #2f6a3d' }
    : overall === 'PARTIAL'
      ? { color: '#e09a55', backgroundColor: '#2a2016', border: '1px solid #6a4a2f' }
      : { color: '#ff5c5c', backgroundColor: '#2c1417', border: '1px solid #7a2f36' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Connection test — {lpName}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded"><IcoX /></button>
        </div>
        <div className="p-5">
          {status === 'testing' && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#49b3b3 transparent transparent transparent' }} />
              <span className="text-sm text-text-secondary">Opening FIX sessions…</span>
            </div>
          )}

          {status === 'error' && <ErrorPanel title="The test could not run" lines={[error]} />}

          {status === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-semibold" style={overallStyle}>
                  {overall === 'PASS' ? <IcoCheck /> : <IcoX size={12} />}
                  {overall}
                </span>
                <span className="text-xs text-text-muted">{fmtTs(result.tested_at)}</span>
                <span className="font-mono text-text-muted" style={{ fontSize: 11 }}>{result.test_scope}</span>
              </div>

              <TestSessionPanel title="Trading session" session={result.trading_session} />
              <TestSessionPanel title="Market data session" session={result.md_session} />

              <div className="text-text-muted leading-relaxed" style={{ fontSize: 11 }}>
                The test connects to the configuration stored on the server, not to anything unsaved on screen.
                Save first, then test.
              </div>
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Close</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// LP LIST VIEW
// ============================================================
// ============================================================
// LIST — filter toolbar + collapsible rows
// ============================================================
type LpStatusBucket = 'connected' | 'stopped' | 'degraded' | 'paused';
const STATUS_BUCKETS: { key: LpStatusBucket; label: string; color: string }[] = [
  { key: 'connected', label: 'Connected', color: '#66e07a' },
  { key: 'degraded',  label: 'Degraded',  color: '#e09a55' },
  { key: 'stopped',   label: 'Stopped',   color: '#a0a0b0' },
  { key: 'paused',    label: 'Paused',    color: '#6a6a72' },
];
const ENV_CHIPS: { key: string; label: string }[] = [
  { key: 'PRODUCTION', label: 'Prod' },
  { key: 'DEMO',       label: 'Demo' },
  { key: 'SANDBOX',    label: 'Sandbox' },
];

/** Paused = record disabled by an admin; otherwise bucket on live state. */
function statusBucket(lp: LpListRow, h?: LpHealthSummaryRow): LpStatusBucket {
  if (lp.enabled === false) return 'paused';
  switch (h?.state) {
    case 'CONNECTED':
    case 'CONNECTING': return 'connected';
    case 'DEGRADED':   return 'degraded';
    default:           return 'stopped';
  }
}

// Filter and expand state live at module level so they survive the
// list ↔ detail round trip without being written anywhere.
const listMemory = {
  status: new Set<LpStatusBucket>(['connected', 'degraded', 'stopped']),
  env: new Set<string>(),                // empty = all environments
  expanded: new Set<string>(),
  search: '',
};

function Chip({ on, label, count, color, onClick }: {
  on: boolean; label: string; count: number; color?: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="px-2 py-1 rounded flex items-center gap-1.5 transition-colors"
      style={{
        fontSize: 11,
        color: on ? '#e0e0e0' : '#6a6a72',
        backgroundColor: on ? '#2f2e32' : 'transparent',
        border: `1px solid ${on ? '#4a4a50' : '#383838'}`,
      }}>
      {color && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: on ? color : '#484848' }} />}
      {label}
      <span className="font-mono" style={{ fontSize: 10, color: on ? '#a0a0b0' : '#555' }}>{count}</span>
    </button>
  );
}

function LPRow({ lp, health, busy, expanded, onToggle, onDelete, onStart, onStop, onTest, onCredentials, onDetail, onPause, onEnable }: {
  lp: LpListRow;
  health?: LpHealthSummaryRow;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onStart: () => void;
  onStop: () => void;
  onTest: () => void;
  onCredentials: () => void;
  onDetail: () => void;
  onPause: () => void;
  onEnable: () => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('lp_admin', 'EDIT');
  const [color] = PROVIDER_BADGE[lp.provider_type] ?? ['#484848'];
  const paused = lp.enabled === false;
  const hcfg = health ? HEALTH_CFG[health.health] : undefined;

  return (
    <div className="panel overflow-hidden" style={{ borderLeft: `3px solid ${paused ? '#484848' : color}`, opacity: paused && !expanded ? 0.7 : 1 }}>
      <div className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none hover:bg-surface-hover" onClick={onToggle}>
        <span className="text-text-muted flex-shrink-0" style={{ fontSize: 10, width: 10 }}>{expanded ? '▾' : '▸'}</span>
        <button onClick={e => { e.stopPropagation(); onDetail(); }}
          className="text-sm font-semibold text-text-primary hover:text-[#49b3b3] text-left truncate"
          style={{ width: 220 }}>
          {lp.lp_name}
        </button>
        <span className="font-mono text-text-muted truncate" style={{ fontSize: 11, width: 150 }}>{lp.lp_id}</span>
        <ProviderBadge type={lp.provider_type} />
        <EnvBadge env={lp.environment} />
        <div className="flex items-center gap-3 ml-2">
          <SessionDot state={health?.trading_state} label="Trading" />
          <SessionDot state={health?.md_state} label="MD" />
        </div>
        <span className="ml-auto flex items-center gap-2 flex-shrink-0">
          {paused && (
            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: '#8a8a94', backgroundColor: '#2a2a2c', border: '1px solid #484848' }}>PAUSED</span>
          )}
          {hcfg && (
            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, color: hcfg.color, backgroundColor: hcfg.bg, border: `1px solid ${hcfg.border}` }}>
              {health!.health}
            </span>
          )}
          <StateBadge state={health?.state} />
          {canEdit && (
            paused ? (
              <button onClick={e => { e.stopPropagation(); onEnable(); }} disabled={busy}
                className="btn px-2 py-0.5" style={{ fontSize: 11, backgroundColor: '#163a3a', color: '#49b3b3', border: '1px solid #2a6a6a', opacity: busy ? 0.4 : 1 }}>
                Enable
              </button>
            ) : (
              <button onClick={e => { e.stopPropagation(); onPause(); }} disabled={busy}
                title="Disable this LP. It stays configured and can be enabled again later."
                className="btn btn-ghost border border-border px-2 py-0.5" style={{ fontSize: 11, opacity: busy ? 0.4 : 1 }}>
                Pause
              </button>
            )
          )}
        </span>
      </div>
      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid #383838' }}>
          <LPCard lp={lp} health={health} busy={busy}
            onDetail={onDetail} onDelete={onDelete} onStart={onStart} onStop={onStop}
            onTest={onTest} onCredentials={onCredentials} />
        </div>
      )}
    </div>
  );
}

function LPListView({ lps, healthMap, loading, error, busyId, onAdd, onReload, onDelete, onStart, onStop, onTest, onCredentials, onDetail, onSetEnabled }: {
  lps: LpListRow[];
  healthMap: Record<string, LpHealthSummaryRow>;
  loading: boolean;
  error: string | null;
  busyId: string | null;
  onAdd: () => void;
  onReload: () => void;
  onDelete: (lp: LpListRow) => void;
  onStart: (lp: LpListRow) => void;
  onStop: (lp: LpListRow) => void;
  onTest: (lp: LpListRow) => void;
  onCredentials: (lp: LpListRow) => void;
  onDetail: (lp: LpListRow) => void;
  onSetEnabled: (lp: LpListRow, enabled: boolean) => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('lp_admin', 'EDIT');

  const [status, setStatus] = useState(() => new Set(listMemory.status));
  const [env, setEnv] = useState(() => new Set(listMemory.env));
  const [expanded, setExpanded] = useState(() => new Set(listMemory.expanded));
  const [search, setSearch] = useState(listMemory.search);
  useEffect(() => { listMemory.status = status; listMemory.env = env; listMemory.expanded = expanded; listMemory.search = search; },
    [status, env, expanded, search]);

  const toggleIn = <T,>(set: Set<T>, v: T) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); return n; };

  const buckets = useMemo(() => {
    const m = new Map<string, LpStatusBucket>();
    lps.forEach(lp => m.set(lp.lp_id, statusBucket(lp, healthMap[lp.lp_id])));
    return m;
  }, [lps, healthMap]);
  const countStatus = (k: LpStatusBucket) => lps.filter(lp => buckets.get(lp.lp_id) === k).length;
  const countEnv = (k: string) => lps.filter(lp => lp.environment === k).length;

  const needle = search.trim().toLowerCase();
  const shown = useMemo(() => lps.filter(lp =>
    status.has(buckets.get(lp.lp_id)!) &&
    (env.size === 0 || env.has(lp.environment)) &&
    (!needle || lp.lp_name.toLowerCase().includes(needle) || lp.lp_id.includes(needle)),
  ), [lps, buckets, status, env, needle]);

  const hidden = lps.length - shown.length;
  const allOpen = shown.length > 0 && shown.every(lp => expanded.has(lp.lp_id));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-text-muted flex-shrink-0 mr-1">
          {loading ? 'Loading providers…' : `${lps.length} configured`}
        </span>

        {STATUS_BUCKETS.map(b => (
          <Chip key={b.key} on={status.has(b.key)} label={b.label} color={b.color} count={countStatus(b.key)}
            onClick={() => setStatus(s => toggleIn(s, b.key))} />
        ))}
        <span className="w-px h-4 mx-1" style={{ backgroundColor: '#404040' }} />
        {ENV_CHIPS.map(e => (
          <Chip key={e.key} on={env.size === 0 || env.has(e.key)} label={e.label} count={countEnv(e.key)}
            onClick={() => setEnv(s => toggleIn(s, e.key))} />
        ))}
        <input className="input text-xs" style={{ width: 180, padding: '4px 8px' }} value={search}
          placeholder="Search name or ID…" onChange={e => setSearch(e.target.value)} />
        {hidden > 0 && <span className="text-text-muted" style={{ fontSize: 11 }}>{hidden} hidden</span>}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setExpanded(allOpen ? new Set() : new Set(shown.map(lp => lp.lp_id)))}
            className="btn btn-ghost text-xs border border-border px-3 py-1.5">
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button onClick={onReload} className="btn btn-ghost text-xs border border-border px-3 py-1.5 flex items-center gap-1.5">
            <IcoRefresh /> Refresh
          </button>
          <button onClick={onAdd} disabled={!canEdit}
            className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
            style={canEdit
              ? { backgroundColor: '#163a3a', color: '#49b3b3', border: '1px solid #2a6a6a' }
              : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
            <IcoPlus /> Add LP
          </button>
        </div>
      </div>

      {error && <ErrorPanel title="Could not load providers" lines={[error]} />}

      {!loading && !error && lps.length === 0 && (
        <div className="panel p-8 text-center space-y-2">
          <div className="text-sm text-text-primary">No liquidity providers configured</div>
          <div className="text-xs text-text-secondary">Add one to start routing hedges to an external venue.</div>
        </div>
      )}
      {!loading && !error && lps.length > 0 && shown.length === 0 && (
        <div className="panel p-6 text-center text-xs text-text-secondary">
          Nothing matches the current filters.
        </div>
      )}

      <div className="space-y-1.5">
        {shown.map(lp => (
          <LPRow key={lp.lp_id} lp={lp} health={healthMap[lp.lp_id]} busy={busyId === lp.lp_id}
            expanded={expanded.has(lp.lp_id)}
            onToggle={() => setExpanded(s => toggleIn(s, lp.lp_id))}
            onDetail={() => onDetail(lp)}
            onDelete={() => onDelete(lp)}
            onStart={() => onStart(lp)}
            onStop={() => onStop(lp)}
            onTest={() => onTest(lp)}
            onCredentials={() => onCredentials(lp)}
            onPause={() => onSetEnabled(lp, false)}
            onEnable={() => onSetEnabled(lp, true)} />
        ))}
      </div>
    </div>
  );
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function OverviewTab({ config, health }: { config: LpConfig; health?: LpHealthDetail }) {
  const { labelOf } = useProviders();
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="panel p-4">
        <SectionTitle>Session health</SectionTitle>
        {!health ? (
          <div className="text-xs text-text-muted">No health data returned for this LP.</div>
        ) : (
          <div className="space-y-1">
            <Row label="Overall">
              <span style={{ color: HEALTH_CFG[health.health]?.color }}>{health.health}</span>
            </Row>
            <Row label="State">{health.state}</Row>
            <Row label="Trading">
              <span style={{ color: SESSION_CFG[health.trading_session?.state] }}>
                {health.trading_session?.state}
              </span>
              <span className="font-mono text-text-muted"> · {health.trading_session?.host}:{health.trading_session?.port}</span>
            </Row>
            <Row label="Market data">
              {health.md_session ? (
                <>
                  <span style={{ color: SESSION_CFG[health.md_session.state] }}>{health.md_session.state}</span>
                  <span className="font-mono text-text-muted"> · {health.md_session.host}:{health.md_session.port}</span>
                </>
              ) : <span className="text-text-muted">Not configured</span>}
            </Row>
            <Row label="Uptime">{fmtUptime(health.uptime_seconds)}</Row>
            <Row label="Last connected">{fmtTs(health.last_connected_at)}</Row>
            <Row label="Average latency">
              {health.avg_latency_ms != null ? `${health.avg_latency_ms} ms` : <span className="text-text-muted">No traffic yet</span>}
            </Row>
            <Row label="Fill rate">
              {health.fill_rate_pct != null ? `${health.fill_rate_pct}%` : <span className="text-text-muted">No traffic yet</span>}
            </Row>
            <Row label="Reject rate">
              {health.reject_rate_pct != null ? `${health.reject_rate_pct}%` : <span className="text-text-muted">No traffic yet</span>}
            </Row>
            <Row label="Errors (24h)">{health.errors_24h_count}</Row>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="panel p-4">
          <SectionTitle>Record</SectionTitle>
          <div className="space-y-1">
            <Row label="LP ID"><span className="font-mono">{config.lp_id}</span></Row>
            <Row label="Provider">{labelOf(config.provider_type)}</Row>
            <Row label="Environment">{config.environment}</Row>
            <Row label="Enabled">{config.enabled ? 'Yes' : 'No'}</Row>
            <Row label="Connect on start">{config.auto_connect ? 'Yes' : 'No'}</Row>
            <Row label="Created">{fmtTs(config.created_at)} <span className="text-text-muted">by {config.created_by || '—'}</span></Row>
            <Row label="Last updated">
              {config.updated_at === config.created_at
                ? <span className="text-text-muted">Never modified since creation</span>
                : <>{fmtTs(config.updated_at)} <span className="text-text-muted">by {config.updated_by || '—'}</span></>}
            </Row>
          </div>
        </div>

        {!!health?.warnings?.length && (
          <div className="panel p-4">
            <SectionTitle>Warnings</SectionTitle>
            <div className="space-y-2">
              {health.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span style={{ color: '#e09a55', marginTop: 1 }}><IcoWarning size={11} /></span>
                  <div>
                    <div className="font-mono" style={{ fontSize: 11, color: '#e09a55' }}>{w.code}</div>
                    <div className="text-xs text-text-secondary">{w.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CONFIGURATION TAB — the editable form
// ============================================================
function ConfigTab({ config, live, onSaved, showToast }: {
  config: LpConfig;
  live: boolean;
  onSaved: (fresh: LpConfig) => void;
  showToast: (m: string, t?: 'ok' | 'warn') => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('lp_admin', 'EDIT');
  const { labelOf } = useProviders();

  const stored = useMemo(() => configToForm(config), [config]);
  const [form, setForm] = useState<ConfigForm>(stored);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<string[] | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [reloading, setReloading] = useState(false);

  // Re-baseline whenever the record is refetched from the server.
  useEffect(() => { setForm(stored); }, [stored]);

  const dirty = !sameForm(form, stored);
  const upd = <K extends keyof ConfigForm>(k: K, v: ConfigForm[K]) => setForm(p => ({ ...p, [k]: v }));
  const updPs = (k: string, v: string) => setForm(p => ({ ...p, ps: { ...p.ps, [k]: v } }));

  const save = async () => {
    const { body, intended } = buildUpdate(config, form);
    if (!intended.length) { showToast('Nothing to save'); return; }

    setSaving(true); setError(null); setDropped([]); setReceipt(null);
    try {
      const res = await lpAdminApi.update(config.lp_id, body);
      const fresh = await lpAdminApi.get(config.lp_id);
      const missing = auditWrite(fresh, intended);

      setReceipt(res.changed_fields ?? []);
      onSaved(fresh);

      if (missing.length) {
        setDropped(missing);
        showToast('Saved with problems — some fields were not stored', 'warn');
      } else {
        showToast(`Saved. ${intended.length} field${intended.length === 1 ? '' : 's'} updated.`);
        const touchedConnection = intended.some(i =>
          i.path.startsWith('trading_session') || i.path.startsWith('md_session') || i.path.startsWith('reconnection'));
        if (live && touchedConnection) setNeedsReload(true);
      }
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const doReload = async () => {
    setReloading(true);
    try {
      await lpAdminApi.reload(config.lp_id);
      setNeedsReload(false);
      showToast('LP reloaded — the running session now uses the saved configuration');
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setReloading(false);
    }
  };

  const psKeys = Object.keys(form.ps).sort();

  return (
    <div className="space-y-4">
      {/* Save bar */}
      <div className="panel px-4 py-3 flex items-center justify-between gap-4 flex-wrap sticky top-0 z-10">
        <div className="flex items-center gap-2 flex-wrap">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded" style={{ fontSize: 11, color: DIRTY, backgroundColor: '#2a2216', border: `1px solid ${DIRTY}55` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: DIRTY }} />
              Unsaved changes
            </span>
          ) : (
            <span className="text-text-muted" style={{ fontSize: 11 }}>
              Showing the configuration stored on the server.
            </span>
          )}
          {!canEdit && (
            <span className="text-text-muted" style={{ fontSize: 11 }}>You have read-only access to LP configuration.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setForm(stored)} disabled={!dirty || saving}
            className="btn btn-ghost text-xs border border-border px-3 py-1.5"
            style={{ opacity: dirty && !saving ? 1 : 0.4 }}>
            Discard changes
          </button>
          <button onClick={save} disabled={!dirty || saving || !canEdit}
            className="btn text-xs px-4 py-1.5"
            style={dirty && !saving && canEdit
              ? { backgroundColor: '#163a3a', color: '#49b3b3', border: '1px solid #2a6a6a' }
              : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {error && <ErrorPanel title="The save did not go through" lines={[error]} onDismiss={() => setError(null)} />}

      {!!dropped.length && (
        <ErrorPanel
          title="The server did not store every change"
          lines={dropped}
          onDismiss={() => setDropped([])} />
      )}

      {needsReload && (
        <div className="p-3 rounded flex items-center justify-between gap-4 flex-wrap"
          style={{ backgroundColor: '#2a2016', border: '1px solid #6a4a2f' }}>
          <span className="text-xs" style={{ color: '#e09a55' }}>
            Saved. The running session is still using the previous connection settings until the LP is reloaded.
          </span>
          <button onClick={doReload} disabled={reloading}
            className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
            style={{ backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}>
            <IcoRefresh /> {reloading ? 'Reloading…' : 'Reload LP now'}
          </button>
        </div>
      )}

      {receipt && !dropped.length && (
        <div className="p-2.5 rounded" style={{ backgroundColor: '#162a1c', border: '1px solid #2f6a3d' }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: '#66e07a' }}>
            <IcoCheck /> Stored: <span className="font-mono">{receipt.length ? receipt.join(', ') : 'no fields reported'}</span>
          </div>
        </div>
      )}

      {/* Identity */}
      <div className="panel p-4">
        <SectionTitle>Identity</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Display name" value={form.lp_name} stored={stored.lp_name} disabled={!canEdit}
            onChange={v => upd('lp_name', v)} />
          <SelectField label="Environment" value={form.environment} stored={stored.environment}
            options={Array.from(new Set([...ENVIRONMENTS, form.environment]))}
            onChange={v => upd('environment', v)} />
          <div>
            <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>LP ID</label>
            <input className="input w-full text-sm font-mono" value={config.lp_id} disabled
              style={{ opacity: 0.5, cursor: 'not-allowed' }} />
            <div className="text-text-muted mt-1" style={{ fontSize: 10 }}>Immutable. Not sent on save.</div>
          </div>
          <div>
            <label className="block text-text-secondary mb-1" style={{ fontSize: 11 }}>Provider</label>
            <input className="input w-full text-sm" value={labelOf(config.provider_type)} disabled
              style={{ opacity: 0.5, cursor: 'not-allowed' }} />
            <div className="text-text-muted mt-1" style={{ fontSize: 10 }}>Immutable. Not sent on save.</div>
          </div>
        </div>
        <div className="flex items-center gap-6 mt-3 flex-wrap">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <Toggle checked={form.enabled} onChange={v => upd('enabled', v)} disabled={!canEdit} />
            Enabled {form.enabled !== stored.enabled && <span style={{ color: DIRTY, fontSize: 10 }}>edited</span>}
          </label>
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <Toggle checked={form.auto_connect} onChange={v => upd('auto_connect', v)} disabled={!canEdit} />
            Connect on service start {form.auto_connect !== stored.auto_connect && <span style={{ color: DIRTY, fontSize: 10 }}>edited</span>}
          </label>
        </div>
        <div className="mt-3">
          <Field label="Notes" value={form.notes} stored={stored.notes} disabled={!canEdit}
            onChange={v => upd('notes', v)} />
        </div>
      </div>

      {/* Trading session */}
      <div className="panel p-4">
        <SectionTitle>Trading session</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Host" value={form.t_host} stored={stored.t_host} mono disabled={!canEdit} onChange={v => upd('t_host', v)} />
          <Field label="Port" value={form.t_port} stored={stored.t_port} mono disabled={!canEdit} onChange={v => upd('t_port', v.replace(/\D/g, ''))} />
          <SelectField label="FIX version" value={form.t_fix} stored={stored.t_fix}
            options={Array.from(new Set([...FIX_VERSIONS, form.t_fix]))} onChange={v => upd('t_fix', v)} />
          <Field label="SenderCompID" value={form.t_sender} stored={stored.t_sender} mono disabled={!canEdit}
            hint="Your side. The login the LP issued you."
            onChange={v => upd('t_sender', v)} />
          <Field label="TargetCompID" value={form.t_target} stored={stored.t_target} mono disabled={!canEdit}
            hint="Their side. The LP's trading gateway, e.g. TEORDER."
            onChange={v => upd('t_target', v)} />
          <Field label="Heartbeat (s)" value={form.t_hb} stored={stored.t_hb} mono disabled={!canEdit} onChange={v => upd('t_hb', v.replace(/\D/g, ''))} />
        </div>
      </div>

      {/* Market data session */}
      <div className="panel p-4">
        <SectionTitle right={
          !config.md_session && canEdit
            ? <label className="flex items-center gap-2 text-xs text-text-secondary">
                <Toggle checked={form.md_present} onChange={v => upd('md_present', v)} /> Add session
              </label>
            : undefined
        }>
          Market data session
        </SectionTitle>
        {!config.md_session && !form.md_present ? (
          <div className="text-xs text-text-muted">
            This LP has no market data session. Turn on "Add session" to configure one.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Host" value={form.m_host} stored={stored.m_host} mono disabled={!canEdit} onChange={v => upd('m_host', v)} />
            <Field label="Port" value={form.m_port} stored={stored.m_port} mono disabled={!canEdit} onChange={v => upd('m_port', v.replace(/\D/g, ''))} />
            <SelectField label="FIX version" value={form.m_fix} stored={stored.m_fix}
              options={Array.from(new Set([...FIX_VERSIONS, form.m_fix]))} onChange={v => upd('m_fix', v)} />
            <Field label="SenderCompID" value={form.m_sender} stored={stored.m_sender} mono disabled={!canEdit}
              hint="Your side. The login the LP issued you."
              onChange={v => upd('m_sender', v)} />
            <Field label="TargetCompID" value={form.m_target} stored={stored.m_target} mono disabled={!canEdit}
              hint="Their side. The LP's price gateway, e.g. TEPRICE."
              onChange={v => upd('m_target', v)} />
            <Field label="Heartbeat (s)" value={form.m_hb} stored={stored.m_hb} mono disabled={!canEdit} onChange={v => upd('m_hb', v.replace(/\D/g, ''))} />
            <Field label="Book depth" value={form.m_depth} stored={stored.m_depth} mono disabled={!canEdit} onChange={v => upd('m_depth', v.replace(/\D/g, ''))} />
          </div>
        )}
      </div>

      {/* Reconnection */}
      <div className="panel p-4">
        <SectionTitle>Reconnection</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="flex items-center gap-2 text-xs text-text-secondary pb-2">
            <Toggle checked={form.r_enabled} onChange={v => upd('r_enabled', v)} disabled={!canEdit} />
            Reconnect automatically {form.r_enabled !== stored.r_enabled && <span style={{ color: DIRTY, fontSize: 10 }}>edited</span>}
          </label>
          <Field label="Interval (s)" value={form.r_interval} stored={stored.r_interval} mono disabled={!canEdit}
            onChange={v => upd('r_interval', v.replace(/\D/g, ''))} />
          <Field label="Max attempts" value={form.r_max} stored={stored.r_max} mono disabled={!canEdit}
            onChange={v => upd('r_max', v.replace(/\D/g, ''))} />
        </div>
      </div>

      {/* Provider settings */}
      <div className="panel p-4">
        <SectionTitle>Provider settings</SectionTitle>
        {psKeys.length === 0 ? (
          <div className="text-xs text-text-muted">This provider has no additional settings stored.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {psKeys.map(k => (
                <Field key={k} label={k} value={form.ps[k]} stored={stored.ps[k] ?? ''} mono disabled={!canEdit}
                  onChange={v => updPs(k, v)} />
              ))}
            </div>
            <div className="text-text-muted mt-3 leading-relaxed" style={{ fontSize: 10 }}>
              The backend replaces this whole block on save, so every key above is sent back together —
              editing one does not drop the others.
            </div>
          </>
        )}
      </div>

      {/* Credentials state */}
      <div className="panel p-4">
        <SectionTitle>Credentials</SectionTitle>
        <div className="space-y-1">
          <Row label="Trading password">
            {config.credentials?.trading_password_set_at
              ? <span style={{ color: '#66e07a' }}>Set {fmtTs(config.credentials.trading_password_set_at)}</span>
              : <span style={{ color: '#e09a55' }}>Never set</span>}
          </Row>
          <Row label="Market data password">
            {config.credentials?.md_password_set_at
              ? <span style={{ color: '#66e07a' }}>Set {fmtTs(config.credentials.md_password_set_at)}</span>
              : <span style={{ color: '#e09a55' }}>Never set</span>}
          </Row>
          <Row label="TLS">{config.credentials?.tls_configured ? 'Configured' : 'Not configured'}</Row>
        </div>
        <div className="text-text-muted mt-3" style={{ fontSize: 10 }}>
          Passwords are written through a separate endpoint and are never part of this form.
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DETAIL VIEW
// ============================================================
function DetailView({ lpId, onBack, onChanged, showToast }: {
  lpId: string;
  onBack: () => void;
  onChanged: () => void;
  showToast: (m: string, t?: 'ok' | 'warn') => void;
}) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('lp_admin', 'EDIT');

  const [tab, setTab] = useState<DetailTab>('overview');
  const [config, setConfig] = useState<LpConfig | null>(null);
  const [health, setHealth] = useState<LpHealthDetail | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credOpen, setCredOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const c = await lpAdminApi.get(lpId);
      setConfig(c);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [lpId]);

  const loadHealth = useCallback(async () => {
    try {
      setHealth(await lpAdminApi.healthDetail(lpId));
    } catch {
      setHealth(undefined);
    }
  }, [lpId]);

  useEffect(() => { setLoading(true); loadConfig(); loadHealth(); }, [loadConfig, loadHealth]);

  useEffect(() => {
    const t = setInterval(loadHealth, HEALTH_POLL_MS);
    return () => clearInterval(t);
  }, [loadHealth]);

  const live = isLiveState(health?.state);

  const startStop = async (action: 'start' | 'stop') => {
    if (!config) return;
    setBusy(true);
    try {
      if (action === 'start') await lpOpsApi.start(config.lp_id);
      else await lpOpsApi.stop(config.lp_id);
      showToast(action === 'start' ? `${config.lp_name} starting…` : `${config.lp_name} stopped`);
      await loadHealth();
      onChanged();
    } catch (e) {
      showToast(errMessage(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="panel p-8 text-center text-sm text-text-secondary">Loading configuration…</div>;
  }

  if (error || !config) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="btn btn-ghost text-xs border border-border px-3 py-1.5 flex items-center gap-1.5">
          <IcoArrowLeft /> Back to providers
        </button>
        <ErrorPanel title="Could not load this LP" lines={[error ?? 'No configuration returned']} />
      </div>
    );
  }

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'overview',    label: 'Overview' },
    { id: 'config',      label: 'Configuration' },
    { id: 'instruments', label: 'Instruments' },
    { id: 'positions',   label: 'Positions' },
    { id: 'orders',      label: 'Orders' },
    { id: 'routes',      label: 'Routes' },
    { id: 'audit',       label: 'Audit log' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="btn btn-ghost text-xs border border-border px-2.5 py-1.5 mt-0.5">
            <IcoArrowLeft />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{config.lp_name}</h2>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <ProviderBadge type={config.provider_type} />
              <EnvBadge env={config.environment} />
              <StateBadge state={health?.state} />
              <span className="font-mono text-text-muted" style={{ fontSize: 11 }}>{config.lp_id}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCredOpen(true)} disabled={!canEdit}
            className="btn btn-ghost text-xs border border-border px-3 py-1.5 flex items-center gap-1.5"
            style={{ opacity: canEdit ? 1 : 0.4 }}>
            <IcoKey /> Credentials
          </button>
          <button onClick={() => setTestOpen(true)} disabled={!canEdit}
            className="btn btn-ghost text-xs border border-border px-3 py-1.5 flex items-center gap-1.5"
            style={{ opacity: canEdit ? 1 : 0.4 }}>
            <IcoSignal /> Test connection
          </button>
          {live ? (
            <button onClick={() => startStop('stop')} disabled={!canEdit || busy}
              className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={{ backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f', opacity: canEdit && !busy ? 1 : 0.4 }}>
              <IcoStop /> Stop
            </button>
          ) : (
            <button onClick={() => startStop('start')} disabled={!canEdit || busy}
              className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
              style={{ backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d', opacity: canEdit && !busy ? 1 : 0.4 }}>
              <IcoPlay /> Start
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={clsx('px-3 py-2 text-xs whitespace-nowrap border-b-2 -mb-px transition-colors')}
            style={tab === t.id
              ? { borderColor: '#49b3b3', color: '#49b3b3' }
              : { borderColor: 'transparent', color: '#a0a0b0' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab config={config} health={health} />}

      {tab === 'config' && (
        <ConfigTab config={config} live={live} showToast={showToast}
          onSaved={fresh => { setConfig(fresh); onChanged(); loadHealth(); }} />
      )}

      {tab === 'instruments' && (
        <EmptyTab
          title="Instruments are not wired to the server yet"
          detail="This tab previously rendered sample rows that were indistinguishable from live data. They have been removed rather than left in place. The endpoint exists and is proxied; the table is the outstanding work."
          endpoint="GET /api/v1/fix/lp/{lp_id}/instruments" />
      )}
      {tab === 'positions' && (
        <EmptyTab
          title="Positions are not wired to the server yet"
          detail="Sample rows have been removed. The endpoint exists and is proxied; the table is the outstanding work."
          endpoint="GET /api/v1/fix/lp/{lp_id}/positions" />
      )}
      {tab === 'orders' && (
        <EmptyTab
          title="Orders are not wired to the server yet"
          detail="Sample rows have been removed. The endpoint exists and is proxied; the blotter is the outstanding work."
          endpoint="GET /api/v1/fix/lp/{lp_id}/orders" />
      )}
      {tab === 'routes' && (
        <EmptyTab
          title="Routes are not wired to the server yet"
          detail="The endpoint exists and is proxied; the table is the outstanding work."
          endpoint="GET /api/v1/fix/lp/{lp_id}/routes" />
      )}
      {tab === 'audit' && (
        <EmptyTab
          title="The LP audit endpoint has been retired"
          detail="The old per-LP audit route is now a stub that always returns an empty array. Configuration changes are recorded in the central audit log instead, which this tab has not been pointed at yet."
          endpoint="GET /api/v1/audit/logs?category=LP_ADMIN&lp_id={lp_id}" />
      )}

      {credOpen && (
        <CredentialsModal lpId={config.lp_id} lpName={config.lp_name} providerType={config.provider_type}
          credentials={config.credentials}
          onClose={() => setCredOpen(false)}
          onSaved={() => { loadConfig(); onChanged(); }}
          showToast={showToast} />
      )}
      {testOpen && (
        <TestModal lpId={config.lp_id} lpName={config.lp_name} onClose={() => setTestOpen(false)} />
      )}
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export function LiquidityProvidersPage() {
  const [lps, setLps] = useState<LpListRow[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, LpHealthSummaryRow>>({});
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [credFor, setCredFor] = useState<LpListRow | null>(null);
  const [deleteFor, setDeleteFor] = useState<LpListRow | null>(null);
  const [testFor, setTestFor] = useState<LpListRow | null>(null);

  const loadList = useCallback(async () => {
    try {
      const res = await lpAdminApi.list();
      setLps(res.lps ?? []);
      setListError(null);
    } catch (e) {
      setListError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const res = await lpAdminApi.health();
      const map: Record<string, LpHealthSummaryRow> = {};
      for (const row of res.lps ?? []) map[row.lp_id] = row;
      setHealthMap(map);
    } catch {
      // Health is supplementary — a failure here leaves the cards showing
      // "No status" rather than blanking the page.
    }
  }, []);

  useEffect(() => { loadList(); loadHealth(); }, [loadList, loadHealth]);

  useEffect(() => {
    const t = setInterval(loadHealth, HEALTH_POLL_MS);
    return () => clearInterval(t);
  }, [loadHealth]);

  const startStop = async (lp: LpListRow, action: 'start' | 'stop') => {
    setBusyId(lp.lp_id);
    try {
      if (action === 'start') await lpOpsApi.start(lp.lp_id);
      else await lpOpsApi.stop(lp.lp_id);
      showToast(action === 'start' ? `${lp.lp_name} starting…` : `${lp.lp_name} stopped`);
      await loadHealth();
    } catch (e) {
      showToast(errMessage(e), 'warn');
    } finally {
      setBusyId(null);
    }
  };

  const setEnabled = async (lp: LpListRow, enabled: boolean) => {
    setBusyId(lp.lp_id);
    try {
      if (!enabled && isLiveState(healthMap[lp.lp_id]?.state)) await lpOpsApi.stop(lp.lp_id);
      await lpAdminApi.update(lp.lp_id, { enabled });
      showToast(enabled ? `${lp.lp_name} enabled — start it when ready` : `${lp.lp_name} paused`);
      await loadList(); await loadHealth();
    } catch (e) {
      showToast(errMessage(e), 'warn');
    } finally {
      setBusyId(null);
    }
  };

  const connected = useMemo(
    () => Object.values(healthMap).filter(h => h.state === 'CONNECTED').length,
    [healthMap]);

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Liquidity Providers</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure and monitor FIX connections to external LPs
            </p>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            {toast && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                style={toast.tone === 'warn'
                  ? { backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }
                  : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' }} />
                {toast.msg}
              </span>
            )}
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span><span className="text-text-primary font-mono">{lps.length}</span> providers</span>
              <span className="opacity-30">·</span>
              <span><span className="font-mono" style={{ color: connected > 0 ? '#66e07a' : '#a0a0b0' }}>{connected}</span> connected</span>
            </div>
            <span className="px-2.5 py-1 rounded text-xs font-medium"
              style={{ backgroundColor: '#0f2035', color: '#a5c8f0', border: '1px solid #1e4270' }}>
              LP Admin
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedId ? (
          <DetailView
            lpId={selectedId}
            onBack={() => setSelectedId(null)}
            onChanged={() => { loadList(); loadHealth(); }}
            showToast={showToast} />
        ) : (
          <LPListView
            lps={lps}
            healthMap={healthMap}
            loading={loading}
            error={listError}
            busyId={busyId}
            onAdd={() => setAddOpen(true)}
            onReload={() => { loadList(); loadHealth(); }}
            onDelete={lp => setDeleteFor(lp)}
            onStart={lp => startStop(lp, 'start')}
            onStop={lp => startStop(lp, 'stop')}
            onTest={lp => setTestFor(lp)}
            onCredentials={lp => setCredFor(lp)}
            onDetail={lp => setSelectedId(lp.lp_id)}
            onSetEnabled={setEnabled} />
        )}
      </div>

      {/* Modals */}
      {addOpen && (
        <CreateLPModal onClose={() => setAddOpen(false)}
          onCreated={() => { loadList(); loadHealth(); }}
          showToast={showToast} />
      )}
      {credFor && (
        <CredentialsModal lpId={credFor.lp_id} lpName={credFor.lp_name} providerType={credFor.provider_type}
          onClose={() => setCredFor(null)}
          onSaved={loadList}
          showToast={showToast} />
      )}
      {deleteFor && (
        <DeleteModal lpId={deleteFor.lp_id} lpName={deleteFor.lp_name}
          onClose={() => setDeleteFor(null)}
          onDeleted={() => { loadList(); loadHealth(); }}
          showToast={showToast} />
      )}
      {testFor && (
        <TestModal lpId={testFor.lp_id} lpName={testFor.lp_name} onClose={() => setTestFor(null)} />
      )}
    </div>
  );
}