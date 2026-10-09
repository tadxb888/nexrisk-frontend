// ============================================
// cTrader Servers — Node Registry
// Node types: MASTER · STANDBY · CLIENT · PARTNER
//
// Sibling of NodeManagement.tsx (MT5 Servers); API: /api/v1/ctrader/nodes.
//
// Status model — WebSocket-first, no polling:
//   • The status route seeds the page once when it opens (and again only when
//     the operator presses Reload).
//   • Every write route answers with the node's state at that moment, and
//     connect waits for the outcome — the page updates from those responses.
//   • Changes that happen by themselves (lost connection, a retry that
//     succeeds, a login refused later) will arrive as a WebSocket event. That
//     event is not published yet. When its spec lands, feed it through
//     patchNode() below. Do NOT bridge the gap with a timer.
//
// Not here on purpose: books / groups / symbols tabs (no cTrader routes) and
// the cluster map (cTrader nodes are not in the /cluster/nodes feed yet).
// ============================================

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  ctraderApi,
  type CTraderNodeAPI,
  type CTraderNodeStatusAPI,
  type CTraderConnectResult,
  type CTraderTestResult,
  type CTraderNodeUpdate,
} from '@/services/api';
import { useAuth } from '@/stores/AuthContext';

// ============================================================
// ICONS — SVG only, no emojis
// ============================================================
const IcoPlus = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M19,11h-6V5c0-.553-.448-1-1-1s-1,.447-1,1v6H5c-.552,0-1,.447-1,1s.448,1,1,1h6v6c0,.553.448,1,1,1s1-.447,1-1v-6h6c.552,0,1-.447,1-1s-.448-1-1-1Z"/>
  </svg>
);
const IcoTrash = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="M21,4h-3.1c-.4-2.3-2.4-4-4.9-4h-2c-2.5,0-4.5,1.7-4.9,4H3C2.4,4,2,4.4,2,5s.4,1,1,1h1v14c0,2.2,1.8,4,4,4h8c2.2,0,4-1.8,4-4V6h1c.6,0,1-.4,1-1S21.6,4,21,4Zm-10,16c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm4,0c0,.6-.4,1-1,1s-1-.4-1-1v-7c0-.6.4-1,1-1s1,.4,1,1v7Zm1-14H8.2c.4-1.2,1.5-2,2.8-2h2c1.3,0,2.4.8,2.8,2H16Z"/>
  </svg>
);
const IcoWarning = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
    <path d="m23.119,20.998l-9.49-19.071c-.573-1.151-1.686-1.927-2.629-1.927s-2.056.776-2.629,1.927L-.001,20.998c-.543,1.09-.521,2.327.058,3.399.579,1.072,1.598,1.656,2.571,1.603l18.862-.002c.973.053,1.992-.531,2.571-1.603.579-1.072.601-2.309.058-3.397Zm-11.119.002c-.828,0-1.5-.671-1.5-1.5s.672-1.5,1.5-1.5,1.5.671,1.5,1.5-.672,1.5-1.5,1.5Zm1-5c0,.553-.447,1-1,1s-1-.447-1-1v-8c0-.553.447-1,1-1s1,.447,1,1v8Z"/>
  </svg>
);
const IcoX = ({ size = 13 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="m13.414,12l5.293-5.293c.391-.391.391-1.023,0-1.414s-1.023-.391-1.414,0l-5.293,5.293-5.293-5.293c-.391-.391-1.023-.391-1.414,0s-.391,1.023,0,1.414l5.293,5.293-5.293,5.293c-.391.391-.391,1.023,0,1.414.195.195.451.293.707.293s.512-.098.707-.293l5.293-5.293,5.293,5.293c.195.195.451.293.707.293s.512-.098.707-.293c.391-.391.391-1.023,0-1.414l-5.293-5.293Z"/>
  </svg>
);
const IcoEye = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M1.5 12s3.8-7 10.5-7 10.5 7 10.5 7-3.8 7-10.5 7S1.5 12 1.5 12Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);
const IcoEyeOff = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M3 3l18 18"/>
    <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.7 0 10.5 7 10.5 7a17.6 17.6 0 0 1-3.2 4.1M6.5 6.6A17.3 17.3 0 0 0 1.5 12s3.8 7 10.5 7c1.7 0 3.2-.4 4.6-1.1"/>
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
  </svg>
);
const IcoArrowUp = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="M12,2a1,1,0,0,0-.707.293l-8,8a1,1,0,0,0,1.414,1.414L11,5.414V22a1,1,0,0,0,2,0V5.414l6.293,6.293a1,1,0,0,0,1.414-1.414l-8-8A1,1,0,0,0,12,2Z"/>
  </svg>
);
const IcoInfo = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
    <path d="m12,0C5.383,0,0,5.383,0,12s5.383,12,12,12,12-5.383,12-12S18.617,0,12,0Zm0,22C6.486,22,2,17.514,2,12S6.486,2,12,2s10,4.486,10,10-4.486,10-10,10Zm0-13c-.553,0-1,.447-1,1v7c0,.553.447,1,1,1s1-.447,1-1v-7c0-.553-.447-1-1-1Zm0-4c-.828,0-1.5.672-1.5,1.5s.672,1.5,1.5,1.5,1.5-.672,1.5-1.5-.672-1.5-1.5-1.5Z"/>
  </svg>
);

// ============================================================
// TYPES
// ============================================================
type NodeType   = 'MASTER' | 'STANDBY' | 'CLIENT' | 'PARTNER';
type ConnStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED' | 'ERROR';

/** One row of the page: registry fields plus the live detail last heard. */
interface CTNode {
  id: number;
  node_name: string;
  node_type: NodeType;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: number;
  is_enabled: boolean;
  is_master: boolean;
  connection_status: ConnStatus;
  last_connected_at: string;
  last_error: string;
  // Live detail — carried by the status seed and the connect result only.
  message: string;
  last_error_code: string;
  server_version: string;
  permission_count: number;
  rtt_ms: number;
  next_retry_at_ms: number;
  sessions: number;
}

interface FormData {
  node_name: string;
  node_type: NodeType;
  server_address: string;
  plant_id: string;
  environment: string;
  manager_login: string;
  password: string;
  reconnect_interval_sec: string;
  heartbeat_interval_sec: string;
  is_enabled: boolean;
  connect_after_save: boolean;
}

type FieldErrors = Partial<Record<keyof FormData, string>>;

type TestOutcome =
  | { kind: 'result'; res: CTraderTestResult; stored: boolean }
  | { kind: 'error'; message: string };

type Notice = { type: 'success' | 'warn' | 'error'; text: string };

// ============================================================
// CONSTANTS
// ============================================================
// Connect and test wait on the remote server; the service lets two such
// requests wait at a time and answers a third with 429 at once.
const MAX_SLOW_REQUESTS = 2;

const TYPE_DESCRIPTIONS: Record<NodeType, string> = {
  MASTER:  "The broker's own cTrader environment. One per deployment.",
  STANDBY: 'Registered replacement for the MASTER. Not connected until it is promoted.',
  CLIENT:  'White-label / family-office environment. Counts against the license.',
  PARTNER: 'Introducing-broker environment. Counts against the license.',
};

const RED    = '#ff5c5c';
const GREEN  = '#66e07a';
const YELLOW = '#e0d066';

const DISABLED_BTN = { backgroundColor: '#2a2a2c', color: '#a0a0b0', cursor: 'not-allowed', border: '1px solid #484848', opacity: 0.7 } as const;

// ============================================================
// HELPERS
// ============================================================

/**
 * The API returns PostgreSQL timestamp text ("2026-10-08 21:24:57.09996+00"),
 * which is not ISO-8601 and does not parse in every browser. Normalise it.
 */
function parseApiTime(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const frac = m[3] ? m[3].slice(0, 4) : '';
  let tz = m[4] ?? 'Z';
  if (tz !== 'Z') {
    const digits = tz.slice(1).replace(':', '');
    tz = `${tz[0]}${digits.slice(0, 2)}:${digits.slice(2, 4) || '00'}`;
  }
  const d = new Date(`${m[1]}T${m[2]}${frac}${tz}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(s: string) {
  const d = parseApiTime(s);
  if (!d) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtClock(ms: number) {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

function fromStatus(s: CTraderNodeStatusAPI): CTNode {
  return {
    id: s.node_id,
    node_name: s.node_name,
    node_type: s.node_type as NodeType,
    server_address: s.server_address ?? '',
    plant_id: s.plant_id ?? '',
    environment: s.environment ?? '',
    manager_login: s.manager_login,
    is_enabled: s.is_enabled,
    is_master: s.is_master,
    connection_status: s.connection_status as ConnStatus,
    last_connected_at: s.last_connected_at ?? '',
    last_error: s.last_error ?? '',
    message: s.message ?? '',
    last_error_code: s.last_error_code ?? '',
    server_version: s.server_version ?? '',
    permission_count: s.permission_count ?? 0,
    rtt_ms: s.rtt_ms ?? 0,
    next_retry_at_ms: s.next_retry_at_ms ?? 0,
    sessions: s.sessions ?? 0,
  };
}

const NO_LIVE_DETAIL = {
  message: '', last_error_code: '', server_version: '',
  permission_count: 0, rtt_ms: 0, next_retry_at_ms: 0, sessions: 0,
};

/**
 * Fold a Node Object (answer of create / update) into a row. The Node Object
 * has no live detail; what we held is kept only while the status is unchanged.
 */
function fromNodeObject(n: CTraderNodeAPI, prev?: CTNode): CTNode {
  const sameStatus = prev && prev.connection_status === n.connection_status;
  return {
    ...(sameStatus ? prev : { ...NO_LIVE_DETAIL }),
    id: n.id,
    node_name: n.node_name,
    node_type: n.node_type as NodeType,
    server_address: n.server_address ?? '',
    plant_id: n.plant_id ?? '',
    environment: n.environment ?? '',
    manager_login: n.manager_login,
    is_enabled: n.is_enabled,
    is_master: n.is_master,
    connection_status: n.connection_status as ConnStatus,
    last_connected_at: n.last_connected_at ?? '',
    last_error: n.last_error ?? '',
  } as CTNode;
}

function emptyForm(hasMaster: boolean): FormData {
  return {
    node_name: '', node_type: hasMaster ? 'STANDBY' : 'MASTER',
    server_address: '', plant_id: '', environment: '',
    manager_login: '', password: '',
    reconnect_interval_sec: '5', heartbeat_interval_sec: '25',
    is_enabled: true, connect_after_save: true,
  };
}

function nodeToForm(n: CTraderNodeAPI): FormData {
  return {
    node_name: n.node_name, node_type: n.node_type as NodeType,
    server_address: n.server_address, plant_id: n.plant_id, environment: n.environment,
    manager_login: String(n.manager_login), password: '',
    reconnect_interval_sec: String(n.reconnect_interval_sec ?? 5),
    heartbeat_interval_sec: String(n.heartbeat_interval_sec ?? 25),
    is_enabled: n.is_enabled, connect_after_save: false,
  };
}

const isWholeNumber = (s: string) => /^\d+$/.test(s.trim());

/** Mirrors the ranges the API enforces, so the operator sees them before the round trip. */
function validate(f: FormData, mode: 'add' | 'edit'): FieldErrors {
  const e: FieldErrors = {};
  const name = f.node_name.trim();
  if (!name) e.node_name = 'Required';
  else if (name.length > 128) e.node_name = 'Max 128 characters';

  if (!f.server_address.trim()) e.server_address = 'Required';
  else if (/\s/.test(f.server_address.trim())) e.server_address = 'host or host:port, no spaces';

  if (!f.plant_id.trim()) e.plant_id = 'Required';
  else if (f.plant_id.trim().length > 64) e.plant_id = 'Max 64 characters';

  if (!f.environment.trim()) e.environment = 'Required';
  else if (f.environment.trim().length > 32) e.environment = 'Max 32 characters';

  if (!f.manager_login.trim()) e.manager_login = 'Required';
  else if (!isWholeNumber(f.manager_login) || Number(f.manager_login) < 1) e.manager_login = 'Whole number, 1 or more';

  if (mode === 'add' && !f.password) e.password = 'Required';

  if (!isWholeNumber(f.reconnect_interval_sec) || Number(f.reconnect_interval_sec) < 1 || Number(f.reconnect_interval_sec) > 3600) {
    e.reconnect_interval_sec = '1 to 3600';
  }
  if (!isWholeNumber(f.heartbeat_interval_sec) || Number(f.heartbeat_interval_sec) < 1 || Number(f.heartbeat_interval_sec) > 25) {
    e.heartbeat_interval_sec = '1 to 25';
  }
  return e;
}

/** Only the fields that differ: an update that names a connection setting restarts the node. */
function buildPatch(f: FormData, orig: CTraderNodeAPI): CTraderNodeUpdate {
  const p: CTraderNodeUpdate = {};
  if (f.node_name.trim() !== orig.node_name) p.node_name = f.node_name.trim();
  if (f.node_type !== orig.node_type) p.node_type = f.node_type;
  if (f.server_address.trim() !== orig.server_address) p.server_address = f.server_address.trim();
  if (f.plant_id.trim() !== orig.plant_id) p.plant_id = f.plant_id.trim();
  if (f.environment.trim() !== orig.environment) p.environment = f.environment.trim();
  if (Number(f.manager_login) !== orig.manager_login) p.manager_login = Number(f.manager_login);
  if (f.password) p.password = f.password;
  if (Number(f.reconnect_interval_sec) !== orig.reconnect_interval_sec) p.reconnect_interval_sec = Number(f.reconnect_interval_sec);
  if (Number(f.heartbeat_interval_sec) !== orig.heartbeat_interval_sec) p.heartbeat_interval_sec = Number(f.heartbeat_interval_sec);
  if (f.is_enabled !== orig.is_enabled) p.is_enabled = f.is_enabled;
  return p;
}

// ============================================================
// SHARED ATOMS
// ============================================================
function ConnBadge({ status }: { status: ConnStatus }) {
  const cfg: Record<ConnStatus, [string, string, string]> = {
    CONNECTED:    ['#66e07a', '#162a1c', '#2f6a3d'],
    CONNECTING:   ['#e0d066', '#2a2816', '#6a6530'],
    RECONNECTING: ['#e09a55', '#2a2016', '#6a4a2f'],
    DISCONNECTED: ['#a0a0b0', '#2a2a2c', '#484848'],
    ERROR:        ['#ff5c5c', '#2c1417', '#7a2f36'],
  };
  const [color, bg, border] = cfg[status] ?? cfg.DISCONNECTED;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: NodeType }) {
  const cfg: Record<NodeType, [string, string, string]> = {
    MASTER:  ['#a5c8f0', '#0f2035', '#1e4270'],
    STANDBY: ['#b8d4a5', '#1a2810', '#3a5830'],
    CLIENT:  ['#f0d0a5', '#2a1f0f', '#5a4020'],
    PARTNER: ['#d4a5c8', '#2a1025', '#5a2855'],
  };
  const [color, bg, border] = cfg[type] ?? ['#a0a0b0', '#2a2a2c', '#484848'];
  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-semibold"
      style={{ color, backgroundColor: bg, border: `1px solid ${border}` }}>
      {type}
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
        border: `1.5px solid ${checked ? '#49b3b3' : '#505050'}`,
        cursor: 'pointer', flexShrink: 0, outline: 'none',
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

function Callout({ tone, children }: { tone: 'error' | 'warn' | 'info'; children: ReactNode }) {
  const cfg = {
    error: [RED, '#2c1417', '#7a2f36'],
    warn:  [YELLOW, '#28220a', '#6a6530'],
    info:  ['#a5c8f0', '#0f1e35', '#1e4270'],
  }[tone];
  return (
    <div className="flex items-start gap-2 p-2.5 rounded text-xs leading-relaxed"
      style={{ backgroundColor: cfg[1], border: `1px solid ${cfg[2]}`, color: cfg[0] }}>
      <span className="flex-shrink-0" style={{ marginTop: 2 }}>{tone === 'info' ? <IcoInfo /> : <IcoWarning />}</span>
      <div className="min-w-0" style={{ overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  );
}

function ModalShell({ title, titleColor, width = 'max-w-sm', onClose, children }: {
  title: string; titleColor?: string; width?: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,.72)' }}>
      <div className={`panel w-full ${width} mx-4 overflow-y-auto`} style={{ backgroundColor: '#232225', maxHeight: '90vh' }}>
        <div className="panel-header">
          <span className="text-sm font-semibold text-text-primary" style={titleColor ? { color: titleColor } : undefined}>{title}</span>
          <button onClick={onClose} className="btn-icon text-text-muted hover:text-text-primary" aria-label="Close">
            <IcoX size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** One line for a test outcome — used on the card and in the form. */
function TestLine({ outcome }: { outcome: TestOutcome }) {
  if (outcome.kind === 'error') {
    return <span style={{ color: RED, overflowWrap: 'anywhere' }}>{outcome.message}</span>;
  }
  const { res, stored } = outcome;
  const prefix = stored ? 'Stored settings: ' : '';
  if (!res.success) {
    return (
      <span style={{ color: RED, overflowWrap: 'anywhere' }}>
        {prefix}{res.message || 'Test failed'}
        {res.error_code && !(res.message ?? '').includes(res.error_code) && <span className="font-mono"> ({res.error_code})</span>}
      </span>
    );
  }
  return (
    <span style={{ color: GREEN }}>
      {prefix}{res.message || 'Connection test passed'}
      <span className="font-mono"> · {res.latency_ms} ms</span>
      {res.rtt_ms > 0 && <span className="font-mono"> · RTT {res.rtt_ms} ms</span>}
      {res.server_version && <span className="font-mono"> · v{res.server_version}</span>}
      {res.used_live_connection && <span> · live connection</span>}
    </span>
  );
}

// ============================================================
// NODE CARD
// ============================================================
function NodeCard({ node, canEdit, busy, slowFull, testOutcome, onEdit, onDelete, onConnect, onDisconnect, onTest, onPromote, onClearTest }: {
  node: CTNode;
  canEdit: boolean;
  busy?: 'connect' | 'disconnect' | 'test';
  slowFull: boolean;
  testOutcome?: TestOutcome;
  onEdit:       (n: CTNode) => void;
  onDelete:     (n: CTNode) => void;
  onConnect:    (n: CTNode) => void;
  onDisconnect: (n: CTNode) => void;
  onTest:       (n: CTNode) => void;
  onPromote:    (n: CTNode) => void;
  onClearTest:  (n: CTNode) => void;
}) {
  const st        = node.connection_status;
  const isMaster  = node.node_type === 'MASTER';
  const isStandby = node.node_type === 'STANDBY';
  // A node that is retrying can be stopped, and can be made to try at once.
  const canStop   = st === 'CONNECTED' || st === 'CONNECTING' || st === 'RECONNECTING';
  const showConnect = !isStandby && st !== 'CONNECTED' && st !== 'CONNECTING';
  const connectBlocked = !!busy || !node.is_enabled || slowFull;
  const testBlocked    = !!busy || slowFull;
  const showError = !!node.last_error && (st === 'ERROR' || st === 'RECONNECTING');

  return (
    <div className="panel flex flex-col overflow-hidden"
      style={{
        opacity: node.is_enabled ? 1 : 0.6,
        borderTop: isMaster ? '2px solid #a5c8f0' : isStandby ? '2px solid #b8d4a5' : '2px solid transparent',
      }}>

      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <TypeBadge type={node.node_type} />
            {!node.is_enabled && <span className="text-xs text-text-muted">· DISABLED</span>}
          </div>
          <h3 className="text-sm font-semibold text-text-primary truncate" title={node.node_name}>{node.node_name}</h3>
        </div>
        <ConnBadge status={st} />
      </div>

      {/* Body */}
      <div className="px-3 pb-3 space-y-1.5 text-xs flex-1">
        <div className="flex gap-2">
          <span className="text-text-muted w-14 flex-shrink-0">Server</span>
          <span className="font-mono text-text-secondary truncate" title={node.server_address}>{node.server_address}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-text-muted w-14 flex-shrink-0">Plant</span>
          <span className="font-mono text-text-secondary truncate" title={`${node.plant_id} / ${node.environment}`}>
            {node.plant_id} / {node.environment}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="text-text-muted w-14 flex-shrink-0">Login</span>
          <span className="font-mono text-text-primary">{node.manager_login}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-text-muted w-14 flex-shrink-0">Last on</span>
          <span className="font-mono text-text-secondary">{fmtDate(node.last_connected_at)}</span>
        </div>

        {st === 'CONNECTED' && (node.server_version || node.rtt_ms > 0 || node.permission_count > 0) && (
          <div className="flex gap-2">
            <span className="text-text-muted w-14 flex-shrink-0">Session</span>
            <span className="font-mono text-text-secondary">
              {[
                node.server_version && `v${node.server_version}`,
                node.rtt_ms > 0 && `RTT ${node.rtt_ms} ms`,
                node.permission_count > 0 && `${node.permission_count} permissions`,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        {isStandby ? (
          <p className="text-text-secondary leading-snug pt-0.5">Held until promoted. A STANDBY is not connected.</p>
        ) : node.message && !showError ? (
          <p className="text-text-secondary leading-snug pt-0.5" style={{ overflowWrap: 'anywhere' }}>{node.message}</p>
        ) : null}

        {st === 'CONNECTED' && node.sessions > 1 && (
          <p className="text-text-secondary leading-snug">
            Reconnected <span className="font-mono">{node.sessions - 1}</span>× since it was started.
          </p>
        )}

        {showError && (
          <div className="mt-1">
            <Callout tone="error">
              {node.last_error}
              {node.last_error_code && !node.last_error.includes(node.last_error_code) && (
                <span className="font-mono"> ({node.last_error_code})</span>
              )}
              {st === 'ERROR' && <div className="mt-1">Not retrying. Correct the node's settings and it restarts.</div>}
              {st === 'RECONNECTING' && node.next_retry_at_ms > 0 && (
                <div className="mt-1">Next attempt at <span className="font-mono">{fmtClock(node.next_retry_at_ms)}</span>.</div>
              )}
            </Callout>
          </div>
        )}

        {busy === 'test' && <p className="text-text-secondary pt-0.5">Testing — this can take up to 17 seconds…</p>}
        {busy !== 'test' && testOutcome && (
          <div className="flex items-start gap-2 pt-0.5">
            <span className="text-text-muted w-14 flex-shrink-0">Test</span>
            <span className="flex-1 min-w-0 leading-snug"><TestLine outcome={testOutcome} /></span>
            <button onClick={() => onClearTest(node)} className="text-text-muted hover:text-text-primary flex-shrink-0" aria-label="Dismiss test result">
              <IcoX size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Footer — write controls; hidden without EDIT */}
      {canEdit && (
        <div className="px-3 py-2.5 border-t border-border flex items-center gap-1.5 flex-wrap">
          {showConnect && (
            <button onClick={() => onConnect(node)} disabled={connectBlocked}
              title={!node.is_enabled ? 'A disabled node is not connected' : slowFull && !busy ? 'Two connect / test requests are already waiting' : undefined}
              className="btn text-xs px-2.5 py-1"
              style={connectBlocked ? DISABLED_BTN : { backgroundColor: '#162a1c', color: GREEN, border: '1px solid #2f6a3d' }}>
              {busy === 'connect' ? 'Connecting…' : st === 'RECONNECTING' ? 'Retry now' : 'Connect'}
            </button>
          )}
          {!isStandby && canStop && (
            <button onClick={() => onDisconnect(node)} disabled={!!busy}
              className="btn btn-ghost text-xs border border-border px-2.5 py-1"
              style={busy ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          )}
          {!isStandby && (
            <button onClick={() => onTest(node)} disabled={testBlocked}
              title={slowFull && !busy ? 'Two connect / test requests are already waiting' : undefined}
              className="btn btn-ghost text-xs border border-border px-2.5 py-1"
              style={testBlocked ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
              {busy === 'test' ? 'Testing…' : 'Test'}
            </button>
          )}
          {isStandby && (
            <button onClick={() => onPromote(node)} disabled={!node.is_enabled}
              title={node.is_enabled
                ? 'Promote this node to MASTER — the current MASTER is disconnected and becomes the STANDBY'
                : 'A disabled node cannot be promoted'}
              className="btn text-xs px-2.5 py-1 flex items-center gap-1"
              style={node.is_enabled ? { backgroundColor: '#1a3020', color: '#b8d4a5', border: '1px solid #3a5830' } : DISABLED_BTN}>
              <IcoArrowUp /> Promote to MASTER
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => onEdit(node)} className="btn btn-ghost text-xs border border-border px-2.5 py-1">
              Edit
            </button>
            <button onClick={() => onDelete(node)} className="btn text-xs px-2 py-1" aria-label={`Delete ${node.node_name}`}
              style={{ backgroundColor: '#2c1417', color: RED, border: '1px solid #7a2f36' }}>
              <IcoTrash />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// NODE FORM MODAL — create / edit
// ============================================================
function FieldLabel({ label, required, hint, error }: { label: string; required?: boolean; hint?: string; error?: string }) {
  return (
    <label className="block text-xs text-text-muted mb-1">
      {label}
      {required && <span style={{ color: RED }}> *</span>}
      {hint && <span className="font-normal ml-1">{hint}</span>}
      {error && <span className="ml-2" style={{ color: RED }}>{error}</span>}
    </label>
  );
}

function NodeModal({ mode, node, hasMaster, slowFull, runSlow, onClose, onCreate, onUpdate }: {
  mode: 'add' | 'edit';
  node?: CTNode;
  hasMaster: boolean;
  slowFull: boolean;
  runSlow: <T,>(fn: () => Promise<T>) => Promise<T>;
  onClose: () => void;
  onCreate: (f: FormData) => Promise<void>;
  onUpdate: (orig: CTraderNodeAPI, patch: CTraderNodeUpdate) => Promise<void>;
}) {
  const [form, setForm]       = useState<FormData>(() => emptyForm(hasMaster));
  // Edit: the stored node, read fresh when the form opens. The status seed
  // does not carry the intervals or has_password, and the diff needs a base.
  const [orig, setOrig]       = useState<CTraderNodeAPI | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors]   = useState<FieldErrors>({});
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testOutcome, setTestOutcome] = useState<TestOutcome | null>(null);

  const editId = mode === 'edit' ? node?.id : undefined;
  useEffect(() => {
    if (editId === undefined) return;
    let cancelled = false;
    ctraderApi.getNode(editId)
      .then(n => { if (!cancelled) { setOrig(n); setForm(nodeToForm(n)); } })
      .catch(e => { if (!cancelled) setLoadErr(errText(e, 'Failed to load the node')); });
    return () => { cancelled = true; };
  }, [editId]);

  const upd = <K extends keyof FormData>(k: K, v: FormData[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => (e[k] ? { ...e, [k]: undefined } : e));
    setSaveErr(null);
  };

  const ready = mode === 'add' || !!orig;
  const isMasterEdit = mode === 'edit' && orig?.node_type === 'MASTER';
  const connectionEdited = !!orig && (
    form.server_address.trim() !== orig.server_address ||
    form.plant_id.trim() !== orig.plant_id ||
    form.environment.trim() !== orig.environment ||
    Number(form.manager_login) !== orig.manager_login
  );
  const willStop = !!orig && orig.node_type !== 'STANDBY' && form.node_type === 'STANDBY';
  const connectAfterApplies = form.node_type !== 'STANDBY' && form.is_enabled;

  // Raw test needs all five settings. On edit with no password typed, the
  // stored node is tested instead — it reuses the live connection.
  const rawTest = mode === 'add' || !!form.password;
  const rawTestReady = !!(form.server_address.trim() && form.plant_id.trim() && form.environment.trim()
    && isWholeNumber(form.manager_login) && Number(form.manager_login) >= 1 && form.password);
  const storedStandby = !rawTest && orig?.node_type === 'STANDBY';
  const testDisabled = testing || saving || slowFull || !ready || (rawTest ? !rawTestReady : storedStandby);

  const runTest = async () => {
    setTesting(true);
    setTestOutcome(null);
    try {
      const res = await runSlow(() => rawTest
        ? ctraderApi.testRaw({
            server_address: form.server_address.trim(),
            plant_id:       form.plant_id.trim(),
            environment:    form.environment.trim(),
            manager_login:  Number(form.manager_login),
            password:       form.password,
          })
        : ctraderApi.testNode(orig!.id));
      setTestOutcome({ kind: 'result', res, stored: !rawTest && connectionEdited });
    } catch (e) {
      setTestOutcome({ kind: 'error', message: errText(e, 'Test failed') });
    } finally {
      setTesting(false);
    }
  };

  const submit = async () => {
    const found = validate(form, mode);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    setSaveErr(null);
    try {
      if (mode === 'add') {
        await onCreate(form);
      } else if (orig) {
        await onUpdate(orig, buildPatch(form, orig));
      }
    } catch (e) {
      // The API's error text is written for the operator — show it as it is.
      setSaveErr(errText(e, 'Save failed'));
      setSaving(false);
    }
  };

  return (
    <ModalShell title={mode === 'add' ? 'Add cTrader Node' : `Edit — ${node?.node_name ?? ''}`} width="max-w-2xl" onClose={onClose}>
      <div className="p-5 space-y-4">
        {loadErr && <Callout tone="error">{loadErr}</Callout>}
        {mode === 'edit' && !orig && !loadErr && <p className="text-sm text-text-secondary">Loading node…</p>}

        {ready && (
          <>
            {mode === 'edit' && orig && orig.node_type !== 'STANDBY' && orig.is_enabled && (
              <Callout tone="info">
                Changing the name, server, plant, environment, login, password or either interval
                restarts this node's connection with the new settings. Fields left as they are are not sent.
              </Callout>
            )}

            {/* Row 1: name + type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Node Name" required error={errors.node_name} />
                <input className="input w-full text-sm" placeholder="e.g. cTrader Live" maxLength={128}
                  value={form.node_name} onChange={e => upd('node_name', e.target.value)} />
                <p className="text-xs text-text-muted mt-1 leading-snug">Unique across MT5 and cTrader nodes.</p>
              </div>
              <div>
                <FieldLabel label="Node Type" required />
                <select className="select w-full text-sm" value={form.node_type} disabled={isMasterEdit}
                  style={isMasterEdit ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
                  onChange={e => upd('node_type', e.target.value as NodeType)}>
                  {/* MASTER is offered on Add only while cTrader has none; after that it is reached by promotion. */}
                  {(isMasterEdit || (mode === 'add' && !hasMaster)) && <option value="MASTER">MASTER</option>}
                  {!isMasterEdit && <option value="STANDBY">STANDBY</option>}
                  {!isMasterEdit && <option value="CLIENT">CLIENT</option>}
                  {!isMasterEdit && <option value="PARTNER">PARTNER</option>}
                </select>
                <p className="text-xs text-text-muted mt-1 leading-snug">
                  {isMasterEdit
                    ? 'The MASTER is changed by promoting a STANDBY, not by editing its type.'
                    : TYPE_DESCRIPTIONS[form.node_type]}
                </p>
                {willStop && (
                  <p className="text-xs mt-1 flex items-start gap-1" style={{ color: YELLOW }}>
                    <span style={{ marginTop: 2 }}><IcoWarning /></span> Saving stops this node: a STANDBY is not connected.
                  </p>
                )}
              </div>
            </div>

            {/* Row 2: server */}
            <div>
              <FieldLabel label="Server Address" required hint="(Manager API proxy; port defaults to 5011)" error={errors.server_address} />
              <input className="input w-full text-sm font-mono" placeholder="host or host:port — e.g. live.p.ctrader.com:5011"
                value={form.server_address} onChange={e => upd('server_address', e.target.value)} />
            </div>

            {/* Row 3: plant + environment */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Plant ID" required error={errors.plant_id} />
                <input className="input w-full text-sm font-mono" placeholder="From Spotware, per broker environment" maxLength={64}
                  value={form.plant_id} onChange={e => upd('plant_id', e.target.value)} />
              </div>
              <div>
                <FieldLabel label="Environment" required error={errors.environment} />
                <input className="input w-full text-sm font-mono" placeholder="live or demo" maxLength={32}
                  value={form.environment} onChange={e => upd('environment', e.target.value)} />
              </div>
            </div>

            {/* Row 4: login + password */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Manager Login" required error={errors.manager_login} />
                <input className="input w-full text-sm font-mono" type="text" inputMode="numeric" placeholder="e.g. 10051"
                  value={form.manager_login} onChange={e => upd('manager_login', e.target.value)} />
              </div>
              <div>
                <FieldLabel label="Password" required={mode === 'add'} error={errors.password}
                  hint={mode === 'edit' ? (orig?.has_password ? '(blank = keep the stored one)' : '(none stored)') : undefined} />
                <div style={{ position: 'relative' }}>
                  <input className="input w-full text-sm" style={{ paddingRight: 36 }}
                    type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                    placeholder={mode === 'edit' && orig?.has_password ? '••••••••' : 'Password'}
                    value={form.password} onChange={e => upd('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPwd(s => !s)} aria-label={showPwd ? 'Hide password' : 'Show password'}
                    style={{
                      position: 'absolute', right: 0, top: 0, bottom: 0,
                      width: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderLeft: '1px solid #444',
                    }}
                    className="text-text-muted hover:text-text-primary transition-colors">
                    {showPwd ? <IcoEyeOff /> : <IcoEye />}
                  </button>
                </div>
              </div>
            </div>

            {/* Test */}
            <div className="flex items-start gap-3">
              <button type="button" onClick={runTest} disabled={testDisabled}
                title={slowFull && !testing ? 'Two connect / test requests are already waiting' : storedStandby ? 'A STANDBY is not connected; enter the password to test these settings directly' : undefined}
                className="btn btn-ghost text-xs border border-border px-3 py-1.5 flex-shrink-0"
                style={testDisabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              <div className="text-xs leading-snug min-w-0" style={{ paddingTop: 6 }}>
                {testing && <span className="text-text-secondary">This can take up to 17 seconds.</span>}
                {!testing && testOutcome && <TestLine outcome={testOutcome} />}
                {!testing && !testOutcome && mode === 'edit' && !form.password && (
                  <span className="text-text-muted">
                    Tests the stored settings. Enter the password to test what is typed here instead.
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-border" />

            {/* Intervals + toggles */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <FieldLabel label="Reconnect (sec)" hint="1–3600; doubles up to 60 s" error={errors.reconnect_interval_sec} />
                <input className="input w-full text-sm font-mono" type="text" inputMode="numeric"
                  value={form.reconnect_interval_sec} onChange={e => upd('reconnect_interval_sec', e.target.value)} />
              </div>
              <div>
                <FieldLabel label="Heartbeat (sec)" hint="1–25" error={errors.heartbeat_interval_sec} />
                <input className="input w-full text-sm font-mono" type="text" inputMode="numeric"
                  value={form.heartbeat_interval_sec} onChange={e => upd('heartbeat_interval_sec', e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2.5">
                <Toggle checked={form.is_enabled} onChange={v => upd('is_enabled', v)} />
                <span className="text-sm text-text-primary">Enabled</span>
              </div>
              {mode === 'add' && (
                <div className="flex items-center gap-2.5" style={{ opacity: connectAfterApplies ? 1 : 0.6 }}>
                  <Toggle checked={form.connect_after_save && connectAfterApplies}
                    onChange={v => { if (connectAfterApplies) upd('connect_after_save', v); }} />
                  <span className="text-sm text-text-primary">Connect after saving</span>
                  {!connectAfterApplies && (
                    <span className="text-xs text-text-muted">
                      {form.node_type === 'STANDBY' ? '(a STANDBY is not connected)' : '(a disabled node is not connected)'}
                    </span>
                  )}
                </div>
              )}
            </div>

            {saveErr && <Callout tone="error">{saveErr}</Callout>}
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          {ready && (
            <button onClick={submit} disabled={saving} className="btn btn-primary text-sm"
              style={saving ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}>
              {saving ? 'Saving…' : mode === 'add' ? 'Add Node' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// DELETE MODAL
// ============================================================
function DeleteModal({ node, nodeCount, onClose, onConfirm }: {
  node: CTNode; nodeCount: number; onClose: () => void; onConfirm: () => Promise<void>;
}) {
  // The MASTER can go only when it is the last cTrader node.
  const blocked = node.node_type === 'MASTER' && nodeCount > 1;
  const [working, setWorking] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const confirm = async () => {
    setWorking(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      // 409 when the node is still referenced: nothing was changed.
      setError(errText(e, 'Delete failed'));
      setWorking(false);
    }
  };

  return (
    <ModalShell title="Delete Node" titleColor={RED} onClose={onClose}>
      <div className="p-5 space-y-4">
        {blocked && (
          <Callout tone="warn">
            The <strong>MASTER</strong> can be deleted only when it is the last cTrader node.
            Promote the STANDBY first, or delete the other nodes.
          </Callout>
        )}
        <p className="text-sm text-text-primary">
          Permanently delete <strong>{node.node_name}</strong>?
        </p>
        {error && <Callout tone="error">{error}</Callout>}
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button onClick={confirm} disabled={blocked || working} className="btn text-sm"
            style={blocked || working ? DISABLED_BTN : { backgroundColor: '#2c1417', color: RED, border: '1px solid #7a2f36' }}>
            {working ? 'Deleting…' : 'Delete Node'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// PROMOTE MODAL — confirm, then report what the API answered
// ============================================================
function PromoteModal({ standbyNode, masterNode, onClose, onConfirm }: {
  standbyNode: CTNode;
  masterNode?: CTNode;
  onClose: () => void;
  onConfirm: () => Promise<{ status: string; demotedName?: string }>;
}) {
  const [phase, setPhase]   = useState<'confirm' | 'working' | 'done'>('confirm');
  const [error, setError]   = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; demotedName?: string } | null>(null);

  const confirm = async () => {
    setPhase('working');
    setError(null);
    try {
      setResult(await onConfirm());
      setPhase('done');
    } catch (e) {
      setError(errText(e, 'Promotion failed'));
      setPhase('confirm');
    }
  };

  return (
    <ModalShell title={phase === 'done' ? 'Promoted to MASTER' : 'Promote to MASTER'} onClose={onClose}>
      {phase !== 'done' ? (
        <div className="p-5 space-y-4">
          <div className="text-sm text-text-primary space-y-2">
            <p><strong>{standbyNode.node_name}</strong> will become the cTrader <strong>MASTER</strong> and start connecting.</p>
            {masterNode && (
              <p className="text-text-secondary">
                <strong>{masterNode.node_name}</strong> will be disconnected and become the <strong>STANDBY</strong>.
              </p>
            )}
          </div>
          <Callout tone="warn">
            A STANDBY is never connected, so the stored settings of <strong>{standbyNode.node_name}</strong> are
            used for the first time now. They have not been checked against the server.
          </Callout>
          {error && <Callout tone="error">{error} The previous MASTER is unchanged.</Callout>}
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} disabled={phase === 'working'} className="btn btn-ghost text-sm">Cancel</button>
            <button onClick={confirm} disabled={phase === 'working'} className="btn btn-primary text-sm"
              style={phase === 'working' ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}>
              {phase === 'working' ? 'Promoting…' : 'Confirm Promotion'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="text-sm text-text-primary space-y-2">
            <p>
              <strong>{standbyNode.node_name}</strong> is now the <strong>MASTER</strong>
              {result?.status && <> — <span className="font-mono">{result.status}</span></>}.
            </p>
            {result?.demotedName && (
              <p className="text-text-secondary">
                <strong>{result.demotedName}</strong> was disconnected and is now the <strong>STANDBY</strong>.
              </p>
            )}
            {result?.status !== 'CONNECTED' && (
              <p className="text-text-secondary">
                It connects in the background. Live status for cTrader nodes is not pushed to this page yet —
                press Reload on the page to see the outcome.
                {result?.demotedName && <> If it ends in ERROR, promote <strong>{result.demotedName}</strong> back.</>}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-3">
            <button onClick={onClose} className="btn btn-primary text-sm">OK</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ============================================================
// DISCONNECT MASTER CONFIRMATION MODAL
// ============================================================
function DisconnectMasterModal({ node, onClose, onConfirm }: {
  node: CTNode; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <ModalShell title="Disconnect cTrader MASTER" titleColor={YELLOW} onClose={onClose}>
      <div className="p-5 space-y-4">
        <Callout tone="warn">
          <strong>{node.node_name}</strong> is the cTrader <strong>MASTER</strong>. Once disconnected it stays
          disconnected until it is connected again or the service restarts.
        </Callout>
        <p className="text-sm text-text-primary">Disconnect the MASTER node?</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button onClick={onConfirm} className="btn text-sm"
            style={{ backgroundColor: '#28220a', color: YELLOW, border: '1px solid #6a6530' }}>
            Disconnect Anyway
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================
export function CTraderNodesPage() {
  const { hasPermission } = useAuth();
  // Same permission module as MT5 Servers, by design: access to one is access to both.
  const canEdit = hasPermission('mt5_servers', 'EDIT');

  const [nodes,     setNodes]     = useState<CTNode[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [reloading, setReloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy,      setBusy]      = useState<Record<number, 'connect' | 'disconnect' | 'test'>>({});
  const [tests,     setTests]     = useState<Record<number, TestOutcome>>({});
  const [slowCount, setSlowCount] = useState(0);
  const [notice,    setNotice]    = useState<Notice | null>(null);

  const [formModal,       setFormModal]       = useState<{ mode: 'add' | 'edit'; node?: CTNode } | null>(null);
  const [deleteModal,     setDeleteModal]     = useState<CTNode | null>(null);
  const [promoteModal,    setPromoteModal]    = useState<CTNode | null>(null);
  const [disconnectModal, setDisconnectModal] = useState<CTNode | null>(null);

  // Success notices clear themselves; warnings and errors stay until dismissed.
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string, type: Notice['type'] = 'success') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ type, text });
    noticeTimer.current = type === 'success' ? setTimeout(() => setNotice(null), 4000) : null;
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  /** Single place a node row changes. The WebSocket node event plugs in here. */
  const patchNode = useCallback((id: number, fn: (n: CTNode) => CTNode) => {
    setNodes(prev => prev.map(n => (n.id === id ? fn(n) : n)));
  }, []);

  const setNodeBusy = (id: number, op?: 'connect' | 'disconnect' | 'test') =>
    setBusy(prev => {
      const next = { ...prev };
      if (op) next[id] = op; else delete next[id];
      return next;
    });

  const runSlow = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSlowCount(c => c + 1);
    try { return await fn(); } finally { setSlowCount(c => c - 1); }
  }, []);
  const slowFull = slowCount >= MAX_SLOW_REQUESTS;

  // ── Seed load: once on open, and on Reload. Never on a timer. ──
  const load = useCallback(async () => {
    try {
      const res = await ctraderApi.getNodeStatus();
      setNodes((res.nodes ?? []).map(fromStatus));
      setLoadError(null);
    } catch (e) {
      setLoadError(errText(e, 'Failed to load cTrader nodes'));
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reload = () => { setReloading(true); void load(); };

  const connected = nodes.filter(n => n.connection_status === 'CONNECTED').length;
  const master    = nodes.find(n => n.node_type === 'MASTER');
  const standby   = nodes.find(n => n.node_type === 'STANDBY');
  // Nodes left mid-attempt by a response: their outcome is a later status change.
  const awaiting  = nodes.some(n => !busy[n.id]
    && (n.connection_status === 'CONNECTING' || n.connection_status === 'RECONNECTING'));

  // ── Connect ───────────────────────────────────────────────
  const doConnect = async (node: CTNode) => {
    setNodeBusy(node.id, 'connect');
    try {
      const res: CTraderConnectResult = await runSlow(() => ctraderApi.connectNode(node.id));
      patchNode(node.id, n => ({
        ...n,
        connection_status: res.connection_status as ConnStatus,
        // The 202 text still tells the reader to poll; it is not shown.
        message: res.pending ? '' : (res.message ?? ''),
        last_error_code: res.last_error_code ?? '',
        last_error: res.last_error ?? '',
        server_version: res.server_version ?? '',
        next_retry_at_ms: res.next_retry_at_ms ?? 0,
        // An already-connected node is left alone, so only a fresh login moves the time.
        last_connected_at: res.success && n.connection_status !== 'CONNECTED' ? new Date().toISOString() : n.last_connected_at,
      }));
      if (res.success) {
        say(`${node.node_name} connected`);
      } else if (res.pending) {
        say(`${node.node_name} is still connecting after 12 seconds. The attempt continues in the background.`, 'warn');
      } else {
        const reason = res.last_error || res.message || 'Connection failed';
        say(`${node.node_name}: ${reason}${res.will_retry ? ' It keeps retrying by itself.' : ''}`, 'error');
      }
    } catch (e) {
      // 404 / 409 / 429 or an unreachable service: the node's state is unknown, leave the row as it is.
      say(`${node.node_name}: ${errText(e, 'Connect failed')}`, 'error');
    } finally {
      setNodeBusy(node.id);
    }
  };

  // ── Disconnect ────────────────────────────────────────────
  const doDisconnect = async (node: CTNode) => {
    setNodeBusy(node.id, 'disconnect');
    try {
      const res = await ctraderApi.disconnectNode(node.id);
      patchNode(node.id, n => ({
        ...n, ...NO_LIVE_DETAIL,
        connection_status: (res.connection_status as ConnStatus) ?? 'DISCONNECTED',
        last_error: '',
      }));
      clearTests(node.id);
      if (res.warning) say(res.warning, 'warn');
      else if (res.was_running === false) say(`${node.node_name} was not running`);
      else say(`${node.node_name} disconnected`);
    } catch (e) {
      say(`${node.node_name}: ${errText(e, 'Disconnect failed')}`, 'error');
    } finally {
      setNodeBusy(node.id);
    }
  };

  const handleDisconnect = (node: CTNode) => {
    if (node.node_type === 'MASTER') { setDisconnectModal(node); return; }
    void doDisconnect(node);
  };

  // ── Test a stored node (does not change its state) ────────
  const doTest = async (node: CTNode) => {
    setNodeBusy(node.id, 'test');
    try {
      const res = await runSlow(() => ctraderApi.testNode(node.id));
      setTests(prev => ({ ...prev, [node.id]: { kind: 'result', res, stored: false } }));
    } catch (e) {
      setTests(prev => ({ ...prev, [node.id]: { kind: 'error', message: errText(e, 'Test failed') } }));
    } finally {
      setNodeBusy(node.id);
    }
  };

  // A test result describes the node as it was: drop it when the node changes.
  const clearTests = (...ids: number[]) =>
    setTests(prev => {
      if (!ids.some(id => id in prev)) return prev;
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });
  const clearTest = (node: CTNode) => clearTests(node.id);

  // ── Create ────────────────────────────────────────────────
  // Create with auto_connect off, then connect: the connect route waits for the
  // login and answers with the outcome, where auto_connect would leave the node
  // in CONNECTING with nothing to tell the page how it ended.
  const handleCreate = async (form: FormData) => {
    const res = await ctraderApi.createNode({
      node_name:              form.node_name.trim(),
      node_type:              form.node_type,
      server_address:         form.server_address.trim(),
      plant_id:               form.plant_id.trim(),
      environment:            form.environment.trim(),
      manager_login:          Number(form.manager_login),
      password:               form.password,
      reconnect_interval_sec: Number(form.reconnect_interval_sec),
      heartbeat_interval_sec: Number(form.heartbeat_interval_sec),
      is_enabled:             form.is_enabled,
      auto_connect:           false,
      // created_by is stamped by the server from the session.
    });
    setFormModal(null);
    if (!res.node || typeof res.node.id !== 'number') {
      say(`Node "${form.node_name.trim()}" created`);
      void load();
      return;
    }
    const created = fromNodeObject(res.node);
    setNodes(prev => [...prev.filter(n => n.id !== created.id), created]);
    say(`Node "${created.node_name}" created`);
    if (form.connect_after_save && created.node_type !== 'STANDBY' && created.is_enabled) {
      void doConnect(created);
    }
  };

  // ── Update ────────────────────────────────────────────────
  const handleUpdate = async (orig: CTraderNodeAPI, patch: CTraderNodeUpdate) => {
    if (Object.keys(patch).length === 0) {
      setFormModal(null);
      say('No changes to save');
      return;
    }
    const res = await ctraderApi.updateNode(orig.id, patch);
    patchNode(orig.id, n => fromNodeObject(res.node, n));
    clearTests(orig.id);
    setFormModal(null);
    say(`Node "${res.node.node_name}" updated`);
  };

  // ── Promote a STANDBY to MASTER ───────────────────────────
  const handlePromote = async () => {
    if (!promoteModal) throw new Error('No node selected');
    const res = await ctraderApi.updateNode(promoteModal.id, { node_type: 'MASTER' });
    // One request, two nodes: apply both in a single update.
    setNodes(prev => prev.map(n => {
      if (n.id === res.node.id) return fromNodeObject(res.node, n);
      if (res.demoted_node_id !== undefined && n.id === res.demoted_node_id) {
        return { ...n, ...NO_LIVE_DETAIL, node_type: 'STANDBY', is_master: false, connection_status: 'DISCONNECTED', last_error: '' };
      }
      return n;
    }));
    clearTests(res.node.id, ...(res.demoted_node_id !== undefined ? [res.demoted_node_id] : []));
    return { status: res.node.connection_status, demotedName: res.demoted_node_name };
  };

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteModal) return;
    const target = deleteModal;
    await ctraderApi.deleteNode(target.id);
    setNodes(prev => prev.filter(n => n.id !== target.id));
    clearTest(target);
    setDeleteModal(null);
    say(`${target.node_name} deleted`);
  };

  const noticeStyle = (t: Notice['type']) =>
    t === 'success' ? { backgroundColor: '#162a1c', color: GREEN, border: '1px solid #2f6a3d' }
    : t === 'warn'  ? { backgroundColor: '#28220a', color: YELLOW, border: '1px solid #6a6530' }
    :                 { backgroundColor: '#2c1417', color: RED, border: '1px solid #7a2f36' };

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Page header */}
      <div className="px-6 pt-5 pb-4 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">cTrader Servers</h1>
            <p className="text-sm text-text-secondary mt-0.5">Manage cTrader node connections</p>
          </div>
          <div className="flex items-center gap-4">
            {!loading && !loadError && (
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span><span className="text-text-primary font-mono">{nodes.length}</span> nodes</span>
                <span className="opacity-30">·</span>
                <span>
                  <span className="font-mono" style={{ color: connected > 0 ? GREEN : '#a0a0b0' }}>{connected}</span> connected
                </span>
                <span className="opacity-30">·</span>
                <span>Master: <span className="text-text-primary">{master?.node_name ?? '—'}</span></span>
                {standby && (
                  <>
                    <span className="opacity-30">·</span>
                    <span>StandBy: <span className="text-text-primary">{standby.node_name}</span></span>
                  </>
                )}
              </div>
            )}
            <button onClick={reload} disabled={loading || reloading}
              title="Read the current status of every cTrader node again"
              className="btn btn-ghost text-xs border border-border px-2.5 py-1"
              style={loading || reloading ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
              {reloading ? 'Reloading…' : 'Reload'}
            </button>
            {canEdit && (
              <button onClick={() => setFormModal({ mode: 'add' })} className="btn btn-primary text-xs flex items-center gap-1.5">
                <IcoPlus /> Add Node
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {notice && (
          <div className="flex items-start gap-2.5 px-3 py-2 rounded text-xs leading-relaxed" style={noticeStyle(notice.type)}>
            <span className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>{notice.text}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="flex-shrink-0" style={{ marginTop: 2 }}>
              <IcoX size={12} />
            </button>
          </div>
        )}

        {awaiting && !loading && (
          <Callout tone="info">
            A node is still connecting or retrying. Status changes that happen by themselves are not
            pushed to this page yet — press Reload to see the latest.
          </Callout>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <span className="text-sm text-text-muted">Loading nodes…</span>
          </div>
        ) : loadError ? (
          <div className="panel p-5 space-y-3">
            <Callout tone="error">{loadError}</Callout>
            <button onClick={reload} className="btn btn-ghost text-xs border border-border px-2.5 py-1">Try again</button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="panel flex items-center justify-center" style={{ minHeight: 220 }}>
            <div className="text-center">
              <p className="text-text-muted text-sm mb-3">No cTrader nodes configured</p>
              {canEdit && (
                <button onClick={() => setFormModal({ mode: 'add' })} className="btn btn-primary text-xs flex items-center gap-1.5 mx-auto">
                  <IcoPlus /> Add Node
                </button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {nodes.map(node => (
              <NodeCard key={node.id} node={node} canEdit={canEdit}
                busy={busy[node.id]} slowFull={slowFull} testOutcome={tests[node.id]}
                onEdit={n => setFormModal({ mode: 'edit', node: n })}
                onDelete={n => setDeleteModal(n)}
                onConnect={n => void doConnect(n)}
                onDisconnect={handleDisconnect}
                onTest={n => void doTest(n)}
                onPromote={n => setPromoteModal(n)}
                onClearTest={clearTest} />
            ))}
          </div>
        )}
      </div>

      {formModal && (
        <NodeModal mode={formModal.mode} node={formModal.node} hasMaster={!!master}
          slowFull={slowFull} runSlow={runSlow}
          onClose={() => setFormModal(null)} onCreate={handleCreate} onUpdate={handleUpdate} />
      )}
      {deleteModal && (
        <DeleteModal node={deleteModal} nodeCount={nodes.length}
          onClose={() => setDeleteModal(null)} onConfirm={handleDelete} />
      )}
      {promoteModal && (
        <PromoteModal standbyNode={promoteModal} masterNode={master}
          onClose={() => setPromoteModal(null)} onConfirm={handlePromote} />
      )}
      {disconnectModal && (
        <DisconnectMasterModal node={disconnectModal}
          onClose={() => setDisconnectModal(null)}
          onConfirm={() => {
            const node = disconnectModal;
            setDisconnectModal(null);
            void doDisconnect(node);
          }} />
      )}
    </div>
  );
}

export default CTraderNodesPage;
