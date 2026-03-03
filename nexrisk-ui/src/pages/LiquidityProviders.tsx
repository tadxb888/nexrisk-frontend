// ============================================
// Liquidity Providers — Multi-LP Management
// CRUD + Credentials + Test + Start/Stop + Health + Detail View
// Providers: TraderEvolution · LMAX · CMC (pending)
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';

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
const IcoWarning = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
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
// TYPES
// ============================================================
type ProviderType = 'traderevolution' | 'lmax' | 'cmc';
type LPState = 'DISCONNECTED' | 'STOPPED' | 'CONNECTING' | 'CONNECTED' | 'DEGRADED' | 'QUARANTINED' | 'SESSION_ERROR';
type SessionState = 'DISCONNECTED' | 'CONNECTING' | 'LOGGED_ON' | 'RECONNECTING' | 'SESSION_ERROR';
type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY' | 'UNKNOWN';
type DetailTab = 'overview' | 'instruments' | 'positions' | 'orders' | 'routes' | 'config' | 'audit';

interface SessionConfig {
  host: string;
  port: number;
  sender_comp_id: string;
  target_comp_id: string;
  fix_version?: string;
  heartbeat_interval?: number;
  reconnect_interval?: number;
  ssl?: boolean;
  state?: SessionState;
}

interface TradingConfig {
  account: string;
  security_exchange?: string;
  default_tif?: string;
  md_depth?: number;
}

interface LPConfig {
  lp_id: string;
  lp_name: string;
  provider_type: ProviderType;
  enabled: boolean;
  state: LPState;
  trading_session: SessionConfig & { state?: SessionState };
  md_session: (SessionConfig & { state?: SessionState }) | null;
  trading_config: TradingConfig;
  credentials_set: boolean;
  created_at: string;
  updated_at: string;
}

interface LPHealth {
  lp_id: string;
  overall_health: HealthStatus;
  trading_session: {
    state: SessionState;
    last_heartbeat_ts: number;
    heartbeat_interval: number;
    latency_ms: number;
    messages_sent: number;
    messages_received: number;
  };
  md_session?: {
    state: SessionState;
    subscriptions_active: number;
    updates_per_second: number;
    last_price_update_ts?: number;
  };
  instruments_loaded: number;
  open_positions: number;
  active_orders: number;
  uptime_seconds: number;
  warnings: Array<{ code: string; message: string }>;
  checked_at: string;
}

interface TestResult {
  lp_id: string;
  test_result: 'PASS' | 'FAIL';
  trading_session: { connected: boolean; logon_time_ms?: number; error?: string; server_version?: string };
  md_session?: { connected: boolean; logon_time_ms?: number; error?: string; server_version?: string };
  tested_at: string;
}

interface AuditEntry {
  timestamp: string;
  action: string;
  user: string;
  changes: Record<string, { old?: unknown; new?: unknown }>;
}

interface Instrument {
  symbol: string;
  canonical_symbol?: string;
  security_id?: string;
  security_type?: string;
  trade_route?: string;
  description?: string;
}

interface LPPosition {
  position_id: string;
  symbol: string;
  side: string;
  long_qty: number;
  short_qty: number;
  avg_price: number;
  unrealized_pnl?: number;
}

interface LPOrder {
  clord_id: string;
  symbol: string;
  side: string;
  order_type: string;
  quantity: number;
  price?: number;
  status: string;
  filled_qty?: number;
  avg_fill_price?: number;
  created_at?: string;
}

// ============================================================
// LP FORM STATE
// ============================================================
interface LPFormData {
  lp_id: string;
  lp_name: string;
  provider_type: ProviderType;
  enabled: boolean;
  // Trading session
  trading_host: string;
  trading_port: string;
  trading_sender: string;
  trading_target: string;
  fix_version: string;
  heartbeat_interval: string;
  reconnect_interval: string;
  trading_ssl: boolean;
  // MD session (TE only)
  md_host: string;
  md_port: string;
  md_sender: string;
  md_target: string;
  // Trading config
  account: string;
  security_exchange: string;
  default_tif: string;
  md_depth: string;
}

// ============================================================
// CONSTANTS
// ============================================================
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8090';

const PROVIDER_LABELS: Record<ProviderType, string> = {
  traderevolution: 'TraderEvolution',
  lmax: 'LMAX',
  cmc: 'CMC Markets',
};

const PROVIDER_BORDER: Record<ProviderType, string> = {
  traderevolution: '#4a90d9',
  lmax: '#d4a745',
  cmc: '#b060c0',
};

const STATE_CFG: Record<LPState, { color: string; bg: string; border: string; label: string }> = {
  DISCONNECTED:  { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848', label: 'Disconnected' },
  STOPPED:       { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848', label: 'Stopped' },
  CONNECTING:    { color: '#e0d066', bg: '#2a2816', border: '#6a6530', label: 'Connecting...' },
  CONNECTED:     { color: '#66e07a', bg: '#162a1c', border: '#2f6a3d', label: 'Connected' },
  DEGRADED:      { color: '#e09a55', bg: '#2a2016', border: '#6a4a2f', label: 'Degraded' },
  QUARANTINED:   { color: '#ff6b6b', bg: '#2c1417', border: '#7a2f36', label: 'Quarantined' },
  SESSION_ERROR: { color: '#ff6b6b', bg: '#2c1417', border: '#7a2f36', label: 'Session Error' },
};

const HEALTH_CFG: Record<HealthStatus, { color: string; bg: string; border: string }> = {
  HEALTHY:   { color: '#66e07a', bg: '#162a1c', border: '#2f6a3d' },
  DEGRADED:  { color: '#e09a55', bg: '#2a2016', border: '#6a4a2f' },
  UNHEALTHY: { color: '#ff6b6b', bg: '#2c1417', border: '#7a2f36' },
  UNKNOWN:   { color: '#a0a0b0', bg: '#2a2a2c', border: '#484848' },
};

const SESSION_CFG: Record<SessionState, string> = {
  DISCONNECTED: '#a0a0b0',
  CONNECTING: '#e0d066',
  LOGGED_ON: '#66e07a',
  RECONNECTING: '#e09a55',
  SESSION_ERROR: '#ff6b6b',
};

// ============================================================
// API HELPERS
// ============================================================
async function apiFetch<T>(endpoint: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const lpAdminApi = {
  list: () => apiFetch<{ success: boolean; data: { count: number; lps: LPConfig[] } }>('/api/v1/fix/admin/lp'),
  get: (id: string) => apiFetch<{ success: boolean; data: LPConfig }>(`/api/v1/fix/admin/lp/${id}`),
  create: (body: unknown) => apiFetch<{ success: boolean; data: unknown }>('/api/v1/fix/admin/lp', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: unknown) => apiFetch<{ success: boolean; data: unknown }>(`/api/v1/fix/admin/lp/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => apiFetch<{ success: boolean }>(`/api/v1/fix/admin/lp/${id}`, { method: 'DELETE' }),
  setCredentials: (id: string, body: unknown) => apiFetch<{ success: boolean; data: unknown }>(`/api/v1/fix/admin/lp/${id}/credentials`, { method: 'PUT', body: JSON.stringify(body) }),
  credentialStatus: (id: string) => apiFetch<{ success: boolean; data: { password_set: boolean; username_set: boolean; brand_set: boolean; last_updated: string } }>(`/api/v1/fix/admin/lp/${id}/credentials/status`),
  test: (id: string) => apiFetch<{ success: boolean; data: TestResult }>(`/api/v1/fix/admin/lp/${id}/test`, { method: 'POST' }),
  reload: (id: string) => apiFetch<{ success: boolean }>(`/api/v1/fix/admin/lp/${id}/reload`, { method: 'POST' }),
  health: (id: string) => apiFetch<{ success: boolean; data: LPHealth }>(`/api/v1/fix/admin/lp/${id}/health`),
  healthAll: () => apiFetch<{ success: boolean; data: LPHealth[] }>('/api/v1/fix/admin/health'),
  audit: (id: string) => apiFetch<{ success: boolean; data: { lp_id: string; entries: AuditEntry[] } }>(`/api/v1/fix/admin/lp/${id}/audit`),
};

const lpOpsApi = {
  start: (id: string) => apiFetch<{ success: boolean }>(`/api/v1/fix/lp/${id}/start`, { method: 'POST' }),
  stop: (id: string) => apiFetch<{ success: boolean }>(`/api/v1/fix/lp/${id}/stop`, { method: 'POST' }),
  instruments: (id: string) => apiFetch<{ success: boolean; data: { instruments: Instrument[] } }>(`/api/v1/fix/lp/${id}/instruments`),
  positions: (id: string) => apiFetch<{ success: boolean; data: { positions: LPPosition[] } }>(`/api/v1/fix/lp/${id}/positions`),
  orders: (id: string) => apiFetch<{ success: boolean; data: { orders: LPOrder[] } }>(`/api/v1/fix/lp/${id}/orders`),
  routes: (id: string) => apiFetch<{ success: boolean; data: unknown }>(`/api/v1/fix/lp/${id}/routes`),
};

// ============================================================
// MOCK DATA (used until BFF wiring is complete)
// ============================================================
const MOCK_LPS: LPConfig[] = [
  {
    lp_id: 'traderevolution',
    lp_name: 'TraderEvolution Sandbox',
    provider_type: 'traderevolution',
    enabled: true,
    state: 'CONNECTED',
    trading_session: {
      host: 'sandbox-fixk1.traderevolution.com', port: 9882,
      sender_comp_id: 'fix_connection_1_trd', target_comp_id: 'TEORDER',
      fix_version: 'FIX.4.4', heartbeat_interval: 30, ssl: false,
      state: 'LOGGED_ON',
    },
    md_session: {
      host: 'sandbox-fixk1.traderevolution.com', port: 9883,
      sender_comp_id: 'fix_connection_1', target_comp_id: 'TEPRICE',
      fix_version: 'FIX.4.4', heartbeat_interval: 30, ssl: false,
      state: 'LOGGED_ON',
    },
    trading_config: { account: 'fix_connection_1_trd', security_exchange: 'TRADE', default_tif: 'GTC', md_depth: 1 },
    credentials_set: true,
    created_at: '2026-02-15T10:00:00Z',
    updated_at: '2026-02-20T14:30:00Z',
  },
  {
    lp_id: 'lmax-demo',
    lp_name: 'LMAX Demo',
    provider_type: 'lmax',
    enabled: false,
    state: 'DISCONNECTED',
    trading_session: {
      host: 'fix-marketdata.lmaxtrader.com', port: 443,
      sender_comp_id: 'DEMO_001', target_comp_id: 'LMAX',
      fix_version: 'FIX.4.4', heartbeat_interval: 30, ssl: true,
    },
    md_session: null,
    trading_config: { account: 'DEMO_001', default_tif: 'GTC' },
    credentials_set: false,
    created_at: '2026-03-01T09:00:00Z',
    updated_at: '2026-03-01T09:00:00Z',
  },
];

const MOCK_HEALTH: Record<string, LPHealth> = {
  traderevolution: {
    lp_id: 'traderevolution', overall_health: 'HEALTHY',
    trading_session: { state: 'LOGGED_ON', last_heartbeat_ts: Date.now(), heartbeat_interval: 30, latency_ms: 12, messages_sent: 145, messages_received: 523 },
    md_session: { state: 'LOGGED_ON', subscriptions_active: 3, updates_per_second: 8.5 },
    instruments_loaded: 6, open_positions: 2, active_orders: 0, uptime_seconds: 7200,
    warnings: [], checked_at: new Date().toISOString(),
  },
};

const MOCK_INSTRUMENTS: Instrument[] = [
  { symbol: 'EURUSD', canonical_symbol: 'EURUSD', security_type: 'FOREX', trade_route: 'TRADE', description: 'Euro vs US Dollar' },
  { symbol: 'GBPUSD', canonical_symbol: 'GBPUSD', security_type: 'FOREX', trade_route: 'TRADE', description: 'British Pound vs US Dollar' },
  { symbol: 'USDJPY', canonical_symbol: 'USDJPY', security_type: 'FOREX', trade_route: 'TRADE', description: 'US Dollar vs Japanese Yen' },
  { symbol: 'XAUUSD', canonical_symbol: 'XAUUSD', security_type: 'CFD', trade_route: 'TRADE', description: 'Gold vs US Dollar' },
  { symbol: 'AUDUSD', canonical_symbol: 'AUDUSD', security_type: 'FOREX', trade_route: 'TRADE', description: 'Australian Dollar vs US Dollar' },
  { symbol: 'USDCAD', canonical_symbol: 'USDCAD', security_type: 'FOREX', trade_route: 'TRADE', description: 'US Dollar vs Canadian Dollar' },
];

const MOCK_POSITIONS: LPPosition[] = [
  { position_id: 'TE-001', symbol: 'EURUSD', side: 'LONG', long_qty: 100000, short_qty: 0, avg_price: 1.08452, unrealized_pnl: 342.50 },
  { position_id: 'TE-002', symbol: 'XAUUSD', side: 'SHORT', long_qty: 0, short_qty: 10, avg_price: 2945.30, unrealized_pnl: -180.20 },
];

const MOCK_ORDERS: LPOrder[] = [];

const MOCK_AUDIT: AuditEntry[] = [
  { timestamp: '2026-02-20T14:30:00Z', action: 'UPDATE_CONFIG', user: 'admin', changes: { 'trading_config.md_depth': { old: 1, new: 5 } } },
  { timestamp: '2026-02-15T10:05:00Z', action: 'SET_CREDENTIALS', user: 'admin', changes: { password: { new: '***' } } },
  { timestamp: '2026-02-15T10:00:00Z', action: 'CREATE_CONFIG', user: 'admin', changes: {} },
];

// ============================================================
// HELPERS
// ============================================================
function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtUptime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function emptyForm(): LPFormData {
  return {
    lp_id: '', lp_name: '', provider_type: 'traderevolution', enabled: true,
    trading_host: '', trading_port: '', trading_sender: '', trading_target: '',
    fix_version: 'FIX.4.4', heartbeat_interval: '30', reconnect_interval: '5', trading_ssl: false,
    md_host: '', md_port: '', md_sender: '', md_target: '',
    account: '', security_exchange: 'TRADE', default_tif: 'GTC', md_depth: '1',
  };
}

function lpToForm(lp: LPConfig): LPFormData {
  return {
    lp_id: lp.lp_id, lp_name: lp.lp_name,
    provider_type: lp.provider_type, enabled: lp.enabled,
    trading_host: lp.trading_session.host,
    trading_port: String(lp.trading_session.port),
    trading_sender: lp.trading_session.sender_comp_id,
    trading_target: lp.trading_session.target_comp_id,
    fix_version: lp.trading_session.fix_version || 'FIX.4.4',
    heartbeat_interval: String(lp.trading_session.heartbeat_interval || 30),
    reconnect_interval: String(lp.trading_session.reconnect_interval || 5),
    trading_ssl: lp.trading_session.ssl || false,
    md_host: lp.md_session?.host || '',
    md_port: lp.md_session ? String(lp.md_session.port) : '',
    md_sender: lp.md_session?.sender_comp_id || '',
    md_target: lp.md_session?.target_comp_id || '',
    account: lp.trading_config.account || '',
    security_exchange: lp.trading_config.security_exchange || 'TRADE',
    default_tif: lp.trading_config.default_tif || 'GTC',
    md_depth: String(lp.trading_config.md_depth || 1),
  };
}

function formToPayload(f: LPFormData) {
  const payload: Record<string, unknown> = {
    lp_id: f.lp_id,
    lp_name: f.lp_name,
    provider_type: f.provider_type,
    enabled: f.enabled,
    trading_session: {
      host: f.trading_host,
      port: Number(f.trading_port),
      sender_comp_id: f.trading_sender,
      target_comp_id: f.trading_target,
      fix_version: f.fix_version,
      heartbeat_interval: Number(f.heartbeat_interval) || 30,
      reconnect_interval: Number(f.reconnect_interval) || 5,
      ssl: f.trading_ssl,
    },
    trading_config: {
      account: f.account,
      security_exchange: f.security_exchange,
      default_tif: f.default_tif,
      md_depth: Number(f.md_depth) || 1,
    },
  };
  // Only include md_session for providers that use it
  if (f.provider_type === 'traderevolution' && f.md_host) {
    payload.md_session = {
      host: f.md_host,
      port: Number(f.md_port),
      sender_comp_id: f.md_sender,
      target_comp_id: f.md_target,
      fix_version: f.fix_version,
      heartbeat_interval: Number(f.heartbeat_interval) || 30,
      ssl: f.trading_ssl,
    };
  }
  return payload;
}

function isStopped(state: LPState): boolean {
  return state === 'DISCONNECTED' || state === 'STOPPED';
}

function isActive(state: LPState): boolean {
  return state === 'CONNECTED' || state === 'CONNECTING' || state === 'DEGRADED' || state === 'QUARANTINED' || state === 'SESSION_ERROR';
}

// ============================================================
// SHARED ATOMS
// ============================================================
function StateBadge({ state }: { state: LPState }) {
  const c = STATE_CFG[state] || STATE_CFG.DISCONNECTED;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color: c.color, backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
      {c.label}
    </span>
  );
}

function ProviderBadge({ type }: { type: ProviderType }) {
  const cfg: Record<ProviderType, [string, string, string]> = {
    traderevolution: ['#a5c8f0', '#0f2035', '#1e4270'],
    lmax: ['#f0d0a5', '#2a1f0f', '#5a4020'],
    cmc:  ['#d4a5e0', '#1e1530', '#3d2860'],
  };
  const [color, bg, border] = cfg[type];
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {PROVIDER_LABELS[type]}
    </span>
  );
}

function SessionDot({ state, label }: { state?: SessionState; label: string }) {
  const color = state ? SESSION_CFG[state] : '#555';
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-text-muted">{label}:</span>
      <span style={{ color }}>{state || 'N/A'}</span>
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        display: 'inline-flex', alignItems: 'center',
        width: 36, height: 20, borderRadius: 10, padding: 3,
        backgroundColor: checked ? '#163a3a' : '#383838',
        border: `1.5px solid ${checked ? '#4ecdc4' : '#505050'}`,
        cursor: 'pointer', flexShrink: 0, outline: 'none',
        transition: 'background-color .15s, border-color .15s',
      }}>
      <span style={{
        display: 'block', width: 12, height: 12, borderRadius: '50%',
        backgroundColor: checked ? '#4ecdc4' : '#888',
        transform: checked ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform .15s, background-color .15s',
      }} />
    </button>
  );
}

// Toast hook
function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, showToast: show };
}

// ============================================================
// LP CARD
// ============================================================
function LPCard({ lp, health, onEdit, onDelete, onStart, onStop, onTest, onCredentials, onDetail }: {
  lp: LPConfig;
  health?: LPHealth;
  onEdit: () => void;
  onDelete: () => void;
  onStart: () => void;
  onStop: () => void;
  onTest: () => void;
  onCredentials: () => void;
  onDetail: () => void;
}) {
  const stopped = isStopped(lp.state);
  const active  = isActive(lp.state);
  const busy = lp.state === 'CONNECTING';

  return (
    <div className="panel flex flex-col overflow-hidden cursor-pointer hover:border-[#555] transition-colors"
      onClick={onDetail}
      style={{
        opacity: lp.enabled ? 1 : 0.55,
        borderTop: `2px solid ${PROVIDER_BORDER[lp.provider_type]}`,
      }}>

      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <ProviderBadge type={lp.provider_type} />
            {!lp.enabled && <span className="text-xs" style={{ color: '#666' }}>DISABLED</span>}
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate">{lp.lp_name}</h3>
          <span className="text-xs font-mono text-text-muted">{lp.lp_id}</span>
        </div>
        <StateBadge state={lp.state} />
      </div>

      {/* Body */}
      <div className="px-3 pb-3 space-y-1.5 text-xs flex-1">
        {/* Session states */}
        <div className="flex items-center gap-3">
          <SessionDot state={lp.trading_session.state} label="Trading" />
          {lp.md_session && <SessionDot state={lp.md_session.state} label="MD" />}
          {!lp.md_session && lp.provider_type !== 'traderevolution' && (
            <span className="text-xs text-text-muted">Single session</span>
          )}
        </div>

        {/* Stats row when connected */}
        {health && active && (
          <div className="flex items-center gap-3 text-xs">
            <span><span className="text-text-primary font-mono">{health.instruments_loaded}</span> <span className="text-text-muted">instruments</span></span>
            <span className="opacity-30">·</span>
            <span><span className="text-text-primary font-mono">{health.open_positions}</span> <span className="text-text-muted">positions</span></span>
            <span className="opacity-30">·</span>
            <span><span className="text-text-primary font-mono">{health.active_orders}</span> <span className="text-text-muted">orders</span></span>
          </div>
        )}

        {/* Health indicator */}
        {health && active && (
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
              style={{
                color: HEALTH_CFG[health.overall_health].color,
                backgroundColor: HEALTH_CFG[health.overall_health].bg,
                border: `1px solid ${HEALTH_CFG[health.overall_health].border}`,
              }}>
              {health.overall_health}
            </span>
            {health.trading_session.latency_ms > 0 && (
              <span className="text-text-muted">{health.trading_session.latency_ms}ms latency</span>
            )}
            {health.uptime_seconds > 0 && (
              <span className="text-text-muted">Up {fmtUptime(health.uptime_seconds)}</span>
            )}
          </div>
        )}

        {/* Credential warning */}
        {!lp.credentials_set && (
          <div className="flex items-start gap-1.5 p-1.5 rounded"
            style={{ backgroundColor: '#2a2016', border: '1px solid #6a4a2f' }}>
            <span className="flex-shrink-0 mt-px" style={{ color: '#e09a55' }}><IcoWarning /></span>
            <span style={{ color: '#e09a55' }} className="leading-tight">Credentials not configured</span>
          </div>
        )}

        {/* Warnings */}
        {health?.warnings?.map((w, i) => (
          <div key={i} className="flex items-start gap-1.5 p-1.5 rounded"
            style={{ backgroundColor: '#2a2016', border: '1px solid #6a4a2f' }}>
            <span className="flex-shrink-0 mt-px" style={{ color: '#e09a55' }}><IcoWarning /></span>
            <span style={{ color: '#e09a55' }} className="leading-tight">{w.message}</span>
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2.5 border-t border-border flex items-center gap-1.5 flex-wrap"
        onClick={e => e.stopPropagation()}>

        {/* Start / Stop */}
        {active ? (
          <button onClick={onStop}
            className="btn text-xs px-2.5 py-1 flex items-center gap-1"
            style={{ backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            <IcoStop /> Stop
          </button>
        ) : (
          <button onClick={onStart} disabled={busy || !lp.credentials_set}
            className="btn text-xs px-2.5 py-1 flex items-center gap-1"
            style={busy || !lp.credentials_set
              ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
              : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
            <IcoPlay /> {busy ? 'Starting...' : 'Start'}
          </button>
        )}

        {/* Test connection */}
        <button onClick={onTest}
          className="btn btn-ghost text-xs border border-border px-2.5 py-1 flex items-center gap-1">
          <IcoSignal /> Test
        </button>

        {/* Credentials */}
        {!lp.credentials_set && (
          <button onClick={onCredentials}
            className="btn text-xs px-2.5 py-1 flex items-center gap-1"
            style={{ backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}>
            <IcoKey /> Set Credentials
          </button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button onClick={onEdit} disabled={!stopped}
            className="btn btn-ghost text-xs border border-border px-2.5 py-1"
            style={!stopped ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}>
            Edit
          </button>
          <button onClick={onDelete} disabled={!stopped}
            className="btn text-xs px-2 py-1"
            style={!stopped
              ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
              : { backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            <IcoTrash />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ADD / EDIT LP MODAL — provider-aware dynamic fields
// ============================================================
function LPFormModal({ mode, lp, onClose, onSave }: {
  mode: 'add' | 'edit';
  lp?: LPConfig;
  onClose: () => void;
  onSave: (f: LPFormData) => void;
}) {
  const [form, setForm] = useState<LPFormData>(
    mode === 'edit' && lp ? lpToForm(lp) : emptyForm()
  );
  const upd = (k: keyof LPFormData, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const needsMdSession = form.provider_type === 'traderevolution';
  const isLmax = form.provider_type === 'lmax';

  const canSave = form.lp_id.length >= 3 && form.lp_name && form.trading_host && form.trading_port && form.trading_sender && form.trading_target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#2a2a2c' }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            {mode === 'add' ? 'Add Liquidity Provider' : `Edit — ${lp?.lp_name}`}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded"><IcoX /></button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-5">

          {/* Basic Info */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Basic Info</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">LP ID</label>
                <input className="input w-full text-sm" value={form.lp_id}
                  disabled={mode === 'edit'}
                  placeholder="e.g. traderevolution"
                  onChange={e => upd('lp_id', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  style={mode === 'edit' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined} />
                <span className="text-[10px] text-text-muted mt-0.5 block">Lowercase + hyphens, 3-32 chars</span>
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Display Name</label>
                <input className="input w-full text-sm" value={form.lp_name}
                  placeholder="e.g. TraderEvolution Sandbox"
                  onChange={e => upd('lp_name', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Provider Type</label>
                <select className="select w-full text-sm" value={form.provider_type}
                  disabled={mode === 'edit'}
                  onChange={e => {
                    const pt = e.target.value as ProviderType;
                    upd('provider_type', pt);
                    if (pt === 'lmax') {
                      setForm(f => ({ ...f, provider_type: pt, trading_ssl: true, md_host: '', md_port: '', md_sender: '', md_target: '' }));
                    }
                  }}
                  style={mode === 'edit' ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  <option value="traderevolution">TraderEvolution</option>
                  <option value="lmax">LMAX</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Toggle checked={form.enabled} onChange={v => upd('enabled', v)} />
                <span className="text-sm text-text-secondary">{form.enabled ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>
          </div>

          {/* Trading Session */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Trading Session</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Host</label>
                <input className="input w-full text-sm font-mono" value={form.trading_host}
                  placeholder="sandbox-fixk1.example.com"
                  onChange={e => upd('trading_host', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Port</label>
                <input className="input w-full text-sm font-mono" value={form.trading_port}
                  type="number" placeholder="9882"
                  onChange={e => upd('trading_port', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">SenderCompID</label>
                <input className="input w-full text-sm font-mono" value={form.trading_sender}
                  placeholder="fix_connection_1_trd"
                  onChange={e => upd('trading_sender', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">TargetCompID</label>
                <input className="input w-full text-sm font-mono" value={form.trading_target}
                  placeholder="TEORDER"
                  onChange={e => upd('trading_target', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">FIX Version</label>
                <input className="input w-full text-sm font-mono" value={form.fix_version}
                  onChange={e => upd('fix_version', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Heartbeat (s)</label>
                <input className="input w-full text-sm font-mono" value={form.heartbeat_interval}
                  type="number" onChange={e => upd('heartbeat_interval', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Reconnect (s)</label>
                <input className="input w-full text-sm font-mono" value={form.reconnect_interval}
                  type="number" onChange={e => upd('reconnect_interval', e.target.value)} />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <Toggle checked={form.trading_ssl} onChange={v => upd('trading_ssl', v)} />
                <span className="text-sm text-text-secondary">SSL</span>
              </div>
            </div>
          </div>

          {/* Market Data Session (TE only) */}
          {needsMdSession && (
            <div>
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Market Data Session</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">MD Host</label>
                  <input className="input w-full text-sm font-mono" value={form.md_host}
                    placeholder="Same as trading host"
                    onChange={e => upd('md_host', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">MD Port</label>
                  <input className="input w-full text-sm font-mono" value={form.md_port}
                    type="number" placeholder="9883"
                    onChange={e => upd('md_port', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">MD SenderCompID</label>
                  <input className="input w-full text-sm font-mono" value={form.md_sender}
                    placeholder="fix_connection_1"
                    onChange={e => upd('md_sender', e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary mb-1">MD TargetCompID</label>
                  <input className="input w-full text-sm font-mono" value={form.md_target}
                    placeholder="TEPRICE"
                    onChange={e => upd('md_target', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* LMAX note */}
          {isLmax && (
            <div className="p-3 rounded text-xs"
              style={{ backgroundColor: '#1a1e28', border: '1px solid #3a4050', color: '#a5b0c0' }}>
              LMAX uses a single FIX session for both trading and market data. No separate MD session configuration is needed.
            </div>
          )}

          {/* Trading Config */}
          <div>
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Trading Config</h3>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-text-secondary mb-1">Account</label>
                <input className="input w-full text-sm font-mono" value={form.account}
                  onChange={e => upd('account', e.target.value)} />
              </div>
              {needsMdSession && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">Security Exchange</label>
                  <input className="input w-full text-sm font-mono" value={form.security_exchange}
                    onChange={e => upd('security_exchange', e.target.value)} />
                </div>
              )}
              <div>
                <label className="block text-xs text-text-secondary mb-1">Default TIF</label>
                <select className="select w-full text-sm" value={form.default_tif}
                  onChange={e => upd('default_tif', e.target.value)}>
                  <option value="GTC">GTC</option>
                  <option value="IOC">IOC</option>
                  <option value="DAY">DAY</option>
                  <option value="FOK">FOK</option>
                </select>
              </div>
              {needsMdSession && (
                <div>
                  <label className="block text-xs text-text-secondary mb-1">MD Depth</label>
                  <input className="input w-full text-sm font-mono" value={form.md_depth}
                    type="number" min="1" max="20"
                    onChange={e => upd('md_depth', e.target.value)} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
          <button onClick={() => onSave(form)} disabled={!canSave}
            className="btn text-xs px-4 py-1.5"
            style={canSave
              ? { backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }
              : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
            {mode === 'add' ? 'Create LP' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CREDENTIALS MODAL
// ============================================================
function CredentialsModal({ lp, onClose, onSave }: {
  lp: LPConfig;
  onClose: () => void;
  onSave: (data: { password: string; username?: string; brand?: string }) => void;
}) {
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [brand, setBrand] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const isCmc = lp.provider_type === 'cmc';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Set Credentials — {lp.lp_name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded"><IcoX /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Password (FIX Logon)</label>
            <div className="relative">
              <input className="input w-full text-sm font-mono pr-9"
                type={showPwd ? 'text' : 'password'}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter FIX password" />
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                onClick={() => setShowPwd(!showPwd)}>
                {showPwd ? <IcoEyeOff /> : <IcoEye />}
              </button>
            </div>
          </div>
          {isCmc && (
            <>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Username (Tag 553)</label>
                <input className="input w-full text-sm font-mono" value={username}
                  onChange={e => setUsername(e.target.value)} placeholder="CMC username" />
              </div>
              <div>
                <label className="block text-xs text-text-secondary mb-1">Brand Code (Tag 21001)</label>
                <input className="input w-full text-sm font-mono" value={brand}
                  onChange={e => setBrand(e.target.value)} placeholder="Brand code" />
              </div>
            </>
          )}
          <div className="p-2.5 rounded text-xs"
            style={{ backgroundColor: '#1a1e28', border: '1px solid #3a4050', color: '#a5b0c0' }}>
            Credentials are stored with AES-256 encryption. Actual values are never returned by the API.
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
          <button onClick={() => { const data: Record<string, string> = { password }; if (username) data.username = username; if (brand) data.brand = brand; onSave(data as any); }}
            disabled={!password}
            className="btn text-xs px-4 py-1.5"
            style={password
              ? { backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }
              : { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }}>
            Save Credentials
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DELETE CONFIRMATION MODAL
// ============================================================
function DeleteModal({ lp, onClose, onConfirm }: {
  lp: LPConfig;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Delete LP Configuration</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-text-secondary">
            Permanently delete <span className="text-text-primary font-semibold">{lp.lp_name}</span> ({lp.lp_id})?
          </p>
          <p className="text-sm text-text-muted">
            This will remove all configuration, credentials, and audit history. This action cannot be undone.
          </p>
        </div>
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs border border-border px-4 py-1.5">Cancel</button>
          <button onClick={onConfirm}
            className="btn text-xs px-4 py-1.5"
            style={{ backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
            Delete LP
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CONNECTION TEST MODAL
// ============================================================
function TestModal({ lp, onClose }: {
  lp: LPConfig;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'testing' | 'done'>('testing');
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    // Using mock for now — swap to lpAdminApi.test(lp.lp_id)
    const timer = setTimeout(() => {
      setResult({
        lp_id: lp.lp_id, test_result: lp.credentials_set ? 'PASS' : 'FAIL',
        trading_session: lp.credentials_set
          ? { connected: true, logon_time_ms: 245, server_version: 'FIX.4.4' }
          : { connected: false, error: 'Credentials not configured' },
        md_session: lp.md_session
          ? (lp.credentials_set
            ? { connected: true, logon_time_ms: 198, server_version: 'FIX.4.4' }
            : { connected: false, error: 'Credentials not configured' })
          : undefined,
        tested_at: new Date().toISOString(),
      });
      setStatus('done');
    }, 2000);
    return () => clearTimeout(timer);
  }, [lp]);

  const pass = result?.test_result === 'PASS';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,.6)' }}>
      <div className="panel w-full max-w-md" style={{ backgroundColor: '#2a2a2c' }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Connection Test — {lp.lp_name}</h2>
          <button onClick={onClose} className="p-1 hover:bg-surface-hover rounded"><IcoX /></button>
        </div>
        <div className="p-5">
          {status === 'testing' && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#4ecdc4 transparent transparent transparent' }} />
              <span className="text-sm text-text-secondary">Testing FIX connectivity...</span>
            </div>
          )}
          {status === 'done' && result && (
            <div className="space-y-4">
              {/* Overall result */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-sm font-semibold"
                  style={pass
                    ? { color: '#66e07a', backgroundColor: '#162a1c', border: '1px solid #2f6a3d' }
                    : { color: '#ff6b6b', backgroundColor: '#2c1417', border: '1px solid #7a2f36' }}>
                  {pass ? <IcoCheck /> : <IcoX size={12} />}
                  {pass ? 'PASS' : 'FAIL'}
                </span>
                <span className="text-xs text-text-muted">{fmtDate(result.tested_at)}</span>
              </div>

              {/* Trading session */}
              <div className="p-3 rounded space-y-1" style={{ backgroundColor: '#232225', border: '1px solid #404040' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-text-secondary">Trading Session</span>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: result.trading_session.connected ? '#66e07a' : '#ff6b6b' }} />
                </div>
                {result.trading_session.connected ? (
                  <div className="text-xs text-text-muted">
                    Logon: <span className="text-text-primary font-mono">{result.trading_session.logon_time_ms}ms</span>
                    {result.trading_session.server_version && (
                      <> · Version: <span className="text-text-primary font-mono">{result.trading_session.server_version}</span></>
                    )}
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: '#ff6b6b' }}>{result.trading_session.error}</div>
                )}
              </div>

              {/* MD session */}
              {result.md_session && (
                <div className="p-3 rounded space-y-1" style={{ backgroundColor: '#232225', border: '1px solid #404040' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-secondary">Market Data Session</span>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: result.md_session.connected ? '#66e07a' : '#ff6b6b' }} />
                  </div>
                  {result.md_session.connected ? (
                    <div className="text-xs text-text-muted">
                      Logon: <span className="text-text-primary font-mono">{result.md_session.logon_time_ms}ms</span>
                    </div>
                  ) : (
                    <div className="text-xs" style={{ color: '#ff6b6b' }}>{result.md_session.error}</div>
                  )}
                </div>
              )}
            </div>
          )}
          {error && (
            <div className="p-3 rounded text-xs" style={{ backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
              {error}
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
function LPListView({ lps, healthMap, onAdd, onEdit, onDelete, onStart, onStop, onTest, onCredentials, onDetail }: {
  lps: LPConfig[];
  healthMap: Record<string, LPHealth>;
  onAdd: () => void;
  onEdit: (lp: LPConfig) => void;
  onDelete: (lp: LPConfig) => void;
  onStart: (lp: LPConfig) => void;
  onStop: (lp: LPConfig) => void;
  onTest: (lp: LPConfig) => void;
  onCredentials: (lp: LPConfig) => void;
  onDetail: (lp: LPConfig) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Add button row */}
      <div className="flex items-center justify-end">
        <button onClick={onAdd}
          className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
          style={{ backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }}>
          <IcoPlus /> Add LP
        </button>
      </div>

      {/* Cards grid */}
      {lps.length === 0 ? (
        <div className="panel p-12 flex flex-col items-center justify-center">
          <span className="text-text-muted text-sm mb-2">No liquidity providers configured</span>
          <button onClick={onAdd}
            className="btn text-xs px-3 py-1.5 flex items-center gap-1.5"
            style={{ backgroundColor: '#163a3a', color: '#4ecdc4', border: '1px solid #2a6a6a' }}>
            <IcoPlus /> Add your first LP
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {lps.map(lp => (
            <LPCard key={lp.lp_id} lp={lp} health={healthMap[lp.lp_id]}
              onEdit={() => onEdit(lp)}
              onDelete={() => onDelete(lp)}
              onStart={() => onStart(lp)}
              onStop={() => onStop(lp)}
              onTest={() => onTest(lp)}
              onCredentials={() => onCredentials(lp)}
              onDetail={() => onDetail(lp)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// DETAIL VIEW — Overview + Tabs
// ============================================================
function DetailView({ lp, health, onBack, onCredentials, onStart, onStop, showToast }: {
  lp: LPConfig;
  health?: LPHealth;
  onBack: () => void;
  onCredentials: () => void;
  onStart: () => void;
  onStop: () => void;
  showToast: (msg: string) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [positions, setPositions] = useState<LPPosition[]>([]);
  const [orders, setOrders] = useState<LPOrder[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [routes, setRoutes] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const isLive = isActive(lp.state);

  // Load tab data
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(() => {
      switch (tab) {
        case 'instruments':
          setInstruments(MOCK_INSTRUMENTS);
          break;
        case 'positions':
          setPositions(MOCK_POSITIONS);
          break;
        case 'orders':
          setOrders(MOCK_ORDERS);
          break;
        case 'audit':
          setAuditEntries(MOCK_AUDIT);
          break;
      }
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [tab, lp.lp_id]);

  const tabs: { id: DetailTab; label: string; live?: boolean }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'instruments', label: 'Instruments', live: true },
    { id: 'positions', label: 'Positions', live: true },
    { id: 'orders', label: 'Orders', live: true },
    { id: 'routes', label: 'Routes', live: true },
    { id: 'config', label: 'Configuration' },
    { id: 'audit', label: 'Audit Log' },
  ];

  return (
    <div className="space-y-0">
      {/* Back + header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-1 hover:bg-surface-hover rounded text-text-muted hover:text-text-primary">
          <IcoArrowLeft />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary truncate">{lp.lp_name}</h2>
            <ProviderBadge type={lp.provider_type} />
            <StateBadge state={lp.state} />
          </div>
          <span className="text-xs font-mono text-text-muted">{lp.lp_id}</span>
        </div>
        <div className="flex items-center gap-2">
          {!lp.credentials_set && (
            <button onClick={onCredentials}
              className="btn text-xs px-2.5 py-1 flex items-center gap-1"
              style={{ backgroundColor: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}>
              <IcoKey /> Set Credentials
            </button>
          )}
          {isLive ? (
            <button onClick={onStop}
              className="btn text-xs px-2.5 py-1 flex items-center gap-1"
              style={{ backgroundColor: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
              <IcoStop /> Stop
            </button>
          ) : (
            <button onClick={onStart} disabled={!lp.credentials_set}
              className="btn text-xs px-2.5 py-1 flex items-center gap-1"
              style={!lp.credentials_set
                ? { backgroundColor: '#2a2a2c', color: '#555', cursor: 'not-allowed', border: '1px solid #383838' }
                : { backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
              <IcoPlay /> Start
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex mb-4">
        {tabs.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            disabled={t.live && !isLive}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
              tab === t.id
                ? 'text-[#4ecdc4] border-[#4ecdc4]'
                : t.live && !isLive
                  ? 'text-[#555] border-transparent cursor-not-allowed'
                  : 'text-text-secondary border-transparent hover:text-text-primary'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: '#4ecdc4 transparent transparent transparent' }} />
        </div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab lp={lp} health={health} />}
          {tab === 'instruments' && <InstrumentsTab instruments={instruments} />}
          {tab === 'positions' && <PositionsTab positions={positions} />}
          {tab === 'orders' && <OrdersTab orders={orders} />}
          {tab === 'routes' && <RoutesTab lp={lp} />}
          {tab === 'config' && <ConfigTab lp={lp} />}
          {tab === 'audit' && <AuditTab entries={auditEntries} />}
        </>
      )}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────
function OverviewTab({ lp, health }: { lp: LPConfig; health?: LPHealth }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Health panel */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Health</h3>
        {health ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold"
                style={{
                  color: HEALTH_CFG[health.overall_health].color,
                  backgroundColor: HEALTH_CFG[health.overall_health].bg,
                  border: `1px solid ${HEALTH_CFG[health.overall_health].border}`,
                }}>
                {health.overall_health}
              </span>
              <span className="text-xs text-text-muted">Up {fmtUptime(health.uptime_seconds)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-2 rounded" style={{ backgroundColor: '#232225' }}>
                <div className="text-lg font-mono text-text-primary">{health.instruments_loaded}</div>
                <div className="text-[10px] text-text-muted">Instruments</div>
              </div>
              <div className="p-2 rounded" style={{ backgroundColor: '#232225' }}>
                <div className="text-lg font-mono text-text-primary">{health.open_positions}</div>
                <div className="text-[10px] text-text-muted">Positions</div>
              </div>
              <div className="p-2 rounded" style={{ backgroundColor: '#232225' }}>
                <div className="text-lg font-mono text-text-primary">{health.active_orders}</div>
                <div className="text-[10px] text-text-muted">Orders</div>
              </div>
            </div>
            {health.warnings.length > 0 && (
              <div className="space-y-1">
                {health.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 p-2 rounded text-xs"
                    style={{ backgroundColor: '#2a2016', border: '1px solid #6a4a2f', color: '#e09a55' }}>
                    <IcoWarning /> {w.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-sm text-text-muted">LP not running — no health data</span>
        )}
      </div>

      {/* Trading Session panel */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Trading Session</h3>
        <div className="space-y-2 text-xs">
          <Row label="State"><SessionDot state={lp.trading_session.state} label="" /></Row>
          <Row label="Host"><span className="font-mono">{lp.trading_session.host}:{lp.trading_session.port}</span></Row>
          <Row label="SenderCompID"><span className="font-mono">{lp.trading_session.sender_comp_id}</span></Row>
          <Row label="TargetCompID"><span className="font-mono">{lp.trading_session.target_comp_id}</span></Row>
          {health && (
            <>
              <Row label="Latency"><span className="font-mono">{health.trading_session.latency_ms}ms</span></Row>
              <Row label="Sent"><span className="font-mono">{health.trading_session.messages_sent.toLocaleString()}</span></Row>
              <Row label="Received"><span className="font-mono">{health.trading_session.messages_received.toLocaleString()}</span></Row>
            </>
          )}
        </div>
      </div>

      {/* MD Session panel */}
      {lp.md_session && (
        <div className="panel p-4 space-y-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Market Data Session</h3>
          <div className="space-y-2 text-xs">
            <Row label="State"><SessionDot state={lp.md_session.state} label="" /></Row>
            <Row label="Host"><span className="font-mono">{lp.md_session.host}:{lp.md_session.port}</span></Row>
            <Row label="SenderCompID"><span className="font-mono">{lp.md_session.sender_comp_id}</span></Row>
            <Row label="TargetCompID"><span className="font-mono">{lp.md_session.target_comp_id}</span></Row>
            {health?.md_session && (
              <>
                <Row label="Subscriptions"><span className="font-mono">{health.md_session.subscriptions_active}</span></Row>
                <Row label="Updates/sec"><span className="font-mono">{health.md_session.updates_per_second}</span></Row>
              </>
            )}
          </div>
        </div>
      )}

      {/* Meta panel */}
      <div className="panel p-4 space-y-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Configuration</h3>
        <div className="space-y-2 text-xs">
          <Row label="Account"><span className="font-mono">{lp.trading_config.account}</span></Row>
          <Row label="Default TIF">{lp.trading_config.default_tif}</Row>
          {lp.trading_config.security_exchange && <Row label="Exchange"><span className="font-mono">{lp.trading_config.security_exchange}</span></Row>}
          <Row label="Credentials"><span className="inline-flex items-center gap-1" style={{ color: lp.credentials_set ? '#66e07a' : '#e09a55' }}>
            {lp.credentials_set ? <><IcoCheck /> Configured</> : <><IcoWarning /> Not set</>}
          </span></Row>
          <Row label="Created">{fmtDate(lp.created_at)}</Row>
          <Row label="Updated">{fmtDate(lp.updated_at)}</Row>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-text-primary">{children}</span>
    </div>
  );
}

// ── Instruments Tab ──────────────────────────────────────────
function InstrumentsTab({ instruments }: { instruments: Instrument[] }) {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border" style={{ backgroundColor: '#232225' }}>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Symbol</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Canonical</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Type</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Route</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Description</th>
          </tr>
        </thead>
        <tbody>
          {instruments.map(inst => (
            <tr key={inst.symbol} className="border-b border-border hover:bg-[#2a2a2c]">
              <td className="px-3 py-2 font-mono text-text-primary font-semibold">{inst.symbol}</td>
              <td className="px-3 py-2 font-mono text-text-secondary">{inst.canonical_symbol || '—'}</td>
              <td className="px-3 py-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  style={inst.security_type === 'FOREX'
                    ? { color: '#4ecdc4', backgroundColor: '#163a3a', border: '1px solid #2a6a6a' }
                    : { color: '#e0d066', backgroundColor: '#2a2816', border: '1px solid #6a6530' }}>
                  {inst.security_type}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-text-muted">{inst.trade_route || '—'}</td>
              <td className="px-3 py-2 text-text-secondary">{inst.description || '—'}</td>
            </tr>
          ))}
          {instruments.length === 0 && (
            <tr><td colSpan={5} className="px-3 py-8 text-center text-text-muted">No instruments loaded</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Positions Tab ────────────────────────────────────────────
function PositionsTab({ positions }: { positions: LPPosition[] }) {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border" style={{ backgroundColor: '#232225' }}>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Position ID</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Symbol</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Side</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Long Qty</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Short Qty</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Avg Price</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Unrealized P&L</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.position_id} className="border-b border-border hover:bg-[#2a2a2c]">
              <td className="px-3 py-2 font-mono text-text-secondary">{p.position_id}</td>
              <td className="px-3 py-2 font-mono text-text-primary font-semibold">{p.symbol}</td>
              <td className="px-3 py-2">
                <span style={{ color: p.side === 'LONG' ? '#66e07a' : '#ff6b6b' }}>{p.side}</span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">{p.long_qty > 0 ? p.long_qty.toLocaleString() : '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">{p.short_qty > 0 ? p.short_qty.toLocaleString() : '—'}</td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">{p.avg_price.toFixed(5)}</td>
              <td className={clsx('px-3 py-2 text-right font-mono', (p.unrealized_pnl || 0) >= 0 ? 'pnl-positive' : 'pnl-negative')}>
                {(p.unrealized_pnl || 0) >= 0 ? '+' : ''}{(p.unrealized_pnl || 0).toFixed(2)}
              </td>
            </tr>
          ))}
          {positions.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted">No open positions</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Orders Tab ───────────────────────────────────────────────
function OrdersTab({ orders }: { orders: LPOrder[] }) {
  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border" style={{ backgroundColor: '#232225' }}>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">ClOrdID</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Symbol</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Side</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Type</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Qty</th>
            <th className="text-right px-3 py-2 text-text-muted font-semibold">Price</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => (
            <tr key={o.clord_id} className="border-b border-border hover:bg-[#2a2a2c]">
              <td className="px-3 py-2 font-mono text-text-secondary">{o.clord_id}</td>
              <td className="px-3 py-2 font-mono text-text-primary font-semibold">{o.symbol}</td>
              <td className="px-3 py-2"><span style={{ color: o.side === 'BUY' ? '#66e07a' : '#ff6b6b' }}>{o.side}</span></td>
              <td className="px-3 py-2 text-text-secondary">{o.order_type}</td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">{o.quantity.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-mono text-text-primary">{o.price?.toFixed(5) || 'MKT'}</td>
              <td className="px-3 py-2 text-text-secondary">{o.status}</td>
            </tr>
          ))}
          {orders.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-text-muted">No active orders</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Routes Tab ───────────────────────────────────────────────
function RoutesTab({ lp }: { lp: LPConfig }) {
  return (
    <div className="panel p-6 text-center">
      <span className="text-sm text-text-muted">Route data loads from <span className="font-mono text-text-secondary">GET /api/v1/fix/lp/{lp.lp_id}/routes</span></span>
    </div>
  );
}

// ── Config Tab ───────────────────────────────────────────────
function ConfigTab({ lp }: { lp: LPConfig }) {
  return (
    <div className="panel p-4">
      <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap leading-relaxed">
        {JSON.stringify({
          lp_id: lp.lp_id,
          lp_name: lp.lp_name,
          provider_type: lp.provider_type,
          enabled: lp.enabled,
          trading_session: {
            host: lp.trading_session.host,
            port: lp.trading_session.port,
            sender_comp_id: lp.trading_session.sender_comp_id,
            target_comp_id: lp.trading_session.target_comp_id,
            fix_version: lp.trading_session.fix_version,
            heartbeat_interval: lp.trading_session.heartbeat_interval,
            ssl: lp.trading_session.ssl,
          },
          md_session: lp.md_session ? {
            host: lp.md_session.host,
            port: lp.md_session.port,
            sender_comp_id: lp.md_session.sender_comp_id,
            target_comp_id: lp.md_session.target_comp_id,
          } : null,
          trading_config: lp.trading_config,
        }, null, 2)}
      </pre>
    </div>
  );
}

// ── Audit Tab ────────────────────────────────────────────────
function AuditTab({ entries }: { entries: AuditEntry[] }) {
  const actionColor: Record<string, string> = {
    CREATE_CONFIG: '#66e07a',
    UPDATE_CONFIG: '#4ecdc4',
    DELETE_CONFIG: '#ff6b6b',
    SET_CREDENTIALS: '#e0d066',
    START_LP: '#66e07a',
    STOP_LP: '#e09a55',
    TEST_CONNECTION: '#a5c8f0',
  };

  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border" style={{ backgroundColor: '#232225' }}>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Timestamp</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Action</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">User</th>
            <th className="text-left px-3 py-2 text-text-muted font-semibold">Changes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} className="border-b border-border hover:bg-[#2a2a2c]">
              <td className="px-3 py-2 text-text-secondary whitespace-nowrap">{fmtDate(e.timestamp)}</td>
              <td className="px-3 py-2">
                <span className="font-mono font-semibold" style={{ color: actionColor[e.action] || '#a0a0b0' }}>
                  {e.action}
                </span>
              </td>
              <td className="px-3 py-2 text-text-secondary">{e.user}</td>
              <td className="px-3 py-2 text-text-muted font-mono">
                {Object.keys(e.changes).length > 0
                  ? Object.entries(e.changes).map(([k, v]) => (
                    <span key={k} className="mr-2">
                      {k}: {v.old !== undefined ? <span style={{ color: '#ff6b6b' }}>{String(v.old)}</span> : ''}
                      {v.old !== undefined && v.new !== undefined ? ' → ' : ''}
                      {v.new !== undefined ? <span style={{ color: '#66e07a' }}>{String(v.new)}</span> : ''}
                    </span>
                  ))
                  : <span className="text-text-muted">—</span>}
              </td>
            </tr>
          ))}
          {entries.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-8 text-center text-text-muted">No audit entries</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export function LiquidityProvidersPage() {
  const [lps, setLps] = useState<LPConfig[]>(MOCK_LPS);
  const [healthMap, setHealthMap] = useState<Record<string, LPHealth>>(MOCK_HEALTH);
  const { toast, showToast } = useToast();

  // View state
  const [selectedLp, setSelectedLp] = useState<LPConfig | null>(null);

  // Modal state
  const [formModal, setFormModal] = useState<{ mode: 'add' | 'edit'; lp?: LPConfig } | null>(null);
  const [credModal, setCredModal] = useState<LPConfig | null>(null);
  const [deleteModal, setDeleteModal] = useState<LPConfig | null>(null);
  const [testModal, setTestModal] = useState<LPConfig | null>(null);

  // Derived
  const connected = lps.filter(l => l.state === 'CONNECTED').length;
  const total = lps.length;

  // ── Handlers ────────────────────────────────────────────────

  const handleSave = (f: LPFormData) => {
    if (formModal?.mode === 'add') {
      const newLp: LPConfig = {
        lp_id: f.lp_id, lp_name: f.lp_name,
        provider_type: f.provider_type, enabled: f.enabled,
        state: 'DISCONNECTED',
        trading_session: {
          host: f.trading_host, port: Number(f.trading_port),
          sender_comp_id: f.trading_sender, target_comp_id: f.trading_target,
          fix_version: f.fix_version, heartbeat_interval: Number(f.heartbeat_interval),
          reconnect_interval: Number(f.reconnect_interval), ssl: f.trading_ssl,
        },
        md_session: f.provider_type === 'traderevolution' && f.md_host ? {
          host: f.md_host, port: Number(f.md_port),
          sender_comp_id: f.md_sender, target_comp_id: f.md_target,
          fix_version: f.fix_version, heartbeat_interval: Number(f.heartbeat_interval),
          ssl: f.trading_ssl,
        } : null,
        trading_config: {
          account: f.account, security_exchange: f.security_exchange,
          default_tif: f.default_tif, md_depth: Number(f.md_depth) || 1,
        },
        credentials_set: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setLps(prev => [...prev, newLp]);
      showToast(`${f.lp_name} created`);
    } else if (formModal?.mode === 'edit' && formModal.lp) {
      setLps(prev => prev.map(l => l.lp_id === formModal.lp!.lp_id ? {
        ...l,
        lp_name: f.lp_name, enabled: f.enabled,
        trading_session: { ...l.trading_session,
          host: f.trading_host, port: Number(f.trading_port),
          sender_comp_id: f.trading_sender, target_comp_id: f.trading_target,
          fix_version: f.fix_version, heartbeat_interval: Number(f.heartbeat_interval),
          reconnect_interval: Number(f.reconnect_interval), ssl: f.trading_ssl,
        },
        md_session: f.provider_type === 'traderevolution' && f.md_host ? {
          ...l.md_session,
          host: f.md_host, port: Number(f.md_port),
          sender_comp_id: f.md_sender, target_comp_id: f.md_target,
        } as SessionConfig : l.md_session,
        trading_config: {
          account: f.account, security_exchange: f.security_exchange,
          default_tif: f.default_tif, md_depth: Number(f.md_depth) || 1,
        },
        updated_at: new Date().toISOString(),
      } : l));
      showToast(`${f.lp_name} updated`);
    }
    setFormModal(null);
  };

  const handleCredentials = (data: { password: string; username?: string; brand?: string }) => {
    if (!credModal) return;
    setLps(prev => prev.map(l => l.lp_id === credModal.lp_id ? { ...l, credentials_set: true, updated_at: new Date().toISOString() } : l));
    showToast(`Credentials saved for ${credModal.lp_name}`);
    setCredModal(null);
  };

  const handleDelete = () => {
    if (!deleteModal) return;
    setLps(prev => prev.filter(l => l.lp_id !== deleteModal.lp_id));
    setHealthMap(prev => { const m = { ...prev }; delete m[deleteModal.lp_id]; return m; });
    showToast(`${deleteModal.lp_name} deleted`);
    setDeleteModal(null);
    if (selectedLp?.lp_id === deleteModal.lp_id) setSelectedLp(null);
  };

  const handleStart = (lp: LPConfig) => {
    setLps(prev => prev.map(l => l.lp_id === lp.lp_id ? {
      ...l, state: 'CONNECTING' as LPState,
      trading_session: { ...l.trading_session, state: 'CONNECTING' as SessionState },
    } : l));
    // Simulate connection
    setTimeout(() => {
      setLps(prev => prev.map(l => l.lp_id === lp.lp_id ? {
        ...l, state: 'CONNECTED' as LPState,
        trading_session: { ...l.trading_session, state: 'LOGGED_ON' as SessionState },
        md_session: l.md_session ? { ...l.md_session, state: 'LOGGED_ON' as SessionState } : null,
      } : l));
      setHealthMap(prev => ({
        ...prev,
        [lp.lp_id]: {
          lp_id: lp.lp_id, overall_health: 'HEALTHY' as HealthStatus,
          trading_session: { state: 'LOGGED_ON' as SessionState, last_heartbeat_ts: Date.now(), heartbeat_interval: 30, latency_ms: 15, messages_sent: 0, messages_received: 0 },
          ...(lp.md_session ? { md_session: { state: 'LOGGED_ON' as SessionState, subscriptions_active: 0, updates_per_second: 0 } } : {}),
          instruments_loaded: 0, open_positions: 0, active_orders: 0, uptime_seconds: 0,
          warnings: [], checked_at: new Date().toISOString(),
        },
      }));
      showToast(`${lp.lp_name} connected`);
    }, 2000);
  };

  const handleStop = (lp: LPConfig) => {
    setLps(prev => prev.map(l => l.lp_id === lp.lp_id ? {
      ...l, state: 'DISCONNECTED' as LPState,
      trading_session: { ...l.trading_session, state: 'DISCONNECTED' as SessionState },
      md_session: l.md_session ? { ...l.md_session, state: 'DISCONNECTED' as SessionState } : null,
    } : l));
    setHealthMap(prev => { const m = { ...prev }; delete m[lp.lp_id]; return m; });
    showToast(`${lp.lp_name} stopped`);
  };

  // Keep selectedLp in sync with lps list
  const currentSelectedLp = selectedLp ? lps.find(l => l.lp_id === selectedLp.lp_id) || null : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Liquidity Providers</h1>
            <p className="text-sm text-text-secondary mt-0.5">
              Configure and monitor FIX connections to external LPs
            </p>
          </div>
          <div className="flex items-center gap-4">
            {toast && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
                style={{ backgroundColor: '#162a1c', color: '#66e07a', border: '1px solid #2f6a3d' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#66e07a', display: 'inline-block' }} />
                {toast}
              </span>
            )}
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span><span className="text-text-primary font-mono">{total}</span> providers</span>
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
        {currentSelectedLp ? (
          <DetailView
            lp={currentSelectedLp}
            health={healthMap[currentSelectedLp.lp_id]}
            onBack={() => setSelectedLp(null)}
            onCredentials={() => setCredModal(currentSelectedLp)}
            onStart={() => handleStart(currentSelectedLp)}
            onStop={() => handleStop(currentSelectedLp)}
            showToast={showToast}
          />
        ) : (
          <LPListView
            lps={lps}
            healthMap={healthMap}
            onAdd={() => setFormModal({ mode: 'add' })}
            onEdit={lp => setFormModal({ mode: 'edit', lp })}
            onDelete={lp => setDeleteModal(lp)}
            onStart={handleStart}
            onStop={handleStop}
            onTest={lp => setTestModal(lp)}
            onCredentials={lp => setCredModal(lp)}
            onDetail={lp => setSelectedLp(lp)}
          />
        )}
      </div>

      {/* Modals */}
      {formModal && (
        <LPFormModal mode={formModal.mode} lp={formModal.lp}
          onClose={() => setFormModal(null)} onSave={handleSave} />
      )}
      {credModal && (
        <CredentialsModal lp={credModal}
          onClose={() => setCredModal(null)} onSave={handleCredentials} />
      )}
      {deleteModal && (
        <DeleteModal lp={deleteModal}
          onClose={() => setDeleteModal(null)} onConfirm={handleDelete} />
      )}
      {testModal && (
        <TestModal lp={testModal}
          onClose={() => setTestModal(null)} />
      )}
    </div>
  );
}