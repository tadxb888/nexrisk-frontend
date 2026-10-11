// ============================================================================
// BottomBar — system.health status surface
//
// Subscribes to the `system.health` WebSocket topic via the BFF and renders
// a row of cells across the bottom of the app:
//
//   [Master-MT5 cell] [Status cell] [Master-cTrader cell] [Status cell]
//   [CPU] [Mem] [Disk] [MT5] [LP] [Loss] [Time]
//
// The cTrader pair is shown only when cTrader has a MASTER. Its name and state
// are seeded once from GET /api/v1/ctrader/master and then follow the
// ctrader.node_status events that arrive on this same socket. No polling.
//
// The Master-MT5 + Status cells share a combined connection state machine:
//
//   connected    — WS open, master.connected: true
//   offline      — WS open, master.connected: false (MT5 master node down)
//   disconnected — WS dead (backend/BFF/network unknown — bar dims to 50%
//                  and every cell shows '—')
//
// Metric state (ok / warn / alert / no_data; LP also stale) is derived from
// server-supplied thresholds. On transition into alert the metric cell pulses
// red for ~600ms.
//
// References:
//   - NexRisk_System_Health_WebSocket_API.md (envelope, thresholds, stale
//     window, reconnect spec, disconnected rendering)
//   - Branding_and_Color_Guidelines.docx (color tokens)
//   - BBookPage.tsx (vivid green/red palette precedent for liveness pills)
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import {
  connectSystemHealthWebSocket,
  ctraderApi,
  type CTraderNodeWsEvent,
  type SystemHealthPayload,
  type SystemHealthThreshold,
  type SystemHealthWsStatus,
} from '@/services/api';

// ── Color tokens ────────────────────────────────────────────────────────────
// Liveness pills (WS conn + master) use the vivid palette to match the WS_BADGE
// precedent in BBookPage. Threshold states use the semantic palette from the
// branding doc — these are nuanced state indicators, not liveness signals.
const COLOR_BG          = '#252429';   // page bg from branding doc
const COLOR_DIVIDER     = '#3a3a3e';
const COLOR_LABEL       = '#d2d6e2';   // muted
const COLOR_OK          = '#E6E6E6';   // primary text
const COLOR_MUTED       = '#d2d6e2';
const COLOR_WARN        = '#c09060';   // semantic amber
const COLOR_ALERT       = '#d07070';   // semantic red
const COLOR_PILL_GREEN  = '#66e07a';   // vivid — matches BBookPage WS_BADGE
const COLOR_PILL_RED    = '#ff6b6b';   // vivid — matches BBookPage WS_BADGE

// ── Constants ───────────────────────────────────────────────────────────────
const STALE_WINDOW_MS = 300_000;   // 5 min — system_health_ws_api §5.1
const ALERT_PULSE_MS  = 600;

// ── Module-level CSS injection ──────────────────────────────────────────────
// Keyframes can't live inline on a style attribute, and we don't want to touch
// globals.css from a component. Inject once on first import.
if (typeof document !== 'undefined' && !document.getElementById('nexrisk-bottombar-styles')) {
  const el = document.createElement('style');
  el.id = 'nexrisk-bottombar-styles';
  el.textContent = `
    @keyframes nexrisk-alert-pulse {
      0%   { background-color: rgba(208, 112, 112, 0.50); }
      100% { background-color: transparent; }
    }
    .nexrisk-alert-pulse { animation: nexrisk-alert-pulse ${ALERT_PULSE_MS}ms ease-out; }
  `;
  document.head.appendChild(el);
}

// ── State derivation ────────────────────────────────────────────────────────
type MetricState = 'ok' | 'warn' | 'alert' | 'no_data' | 'stale';

function deriveState(
  value:     number | null | undefined,
  threshold: SystemHealthThreshold | undefined,
): MetricState {
  if (value == null || !threshold) return 'no_data';
  if (value < threshold.warn)      return 'ok';
  if (value < threshold.alert)     return 'warn';
  return 'alert';
}

/** LP RTT has its own rule: stale wins even if the numeric value would be ok. */
function deriveLpState(
  value:     number | null | undefined,
  ageMs:     number | null | undefined,
  threshold: SystemHealthThreshold | undefined,
): MetricState {
  if (value == null || !threshold) return 'no_data';
  if (ageMs != null && ageMs > STALE_WINDOW_MS) return 'stale';
  if (value < threshold.warn)  return 'ok';
  if (value < threshold.alert) return 'warn';
  return 'alert';
}

function colorForState(state: MetricState): string {
  switch (state) {
    case 'alert':   return COLOR_ALERT;
    case 'warn':    return COLOR_WARN;
    case 'ok':      return COLOR_OK;
    case 'stale':
    case 'no_data': return COLOR_MUTED;
  }
}

// ── MetricCell ──────────────────────────────────────────────────────────────
interface MetricCellProps {
  label:    string;
  /** Shown instead of `label` below 1536 px when `compact` is set. */
  shortLabel?: string;
  /** The bar carries the extra cTrader cells: use the short label on narrower screens. */
  compact?: boolean;
  value:    number | null;
  unit:     string;
  state:    MetricState;
  pulsing:  boolean;
  dp:       number;     // display precision
  title?:   string;
}

function MetricCell({ label, shortLabel, compact, value, unit, state, pulsing, dp, title }: MetricCellProps) {
  const color = colorForState(state);
  const showDash = state === 'no_data' || state === 'stale' || value == null;
  const shorten = !!compact && !!shortLabel;
  return (
    <div
      className={clsx(
        'flex-1 flex items-center justify-center gap-1.5 border-r whitespace-nowrap',
        pulsing && 'nexrisk-alert-pulse',
      )}
      style={{ borderColor: COLOR_DIVIDER }}
      title={shorten && title ? `${label}\n\n${title}` : title}
    >
      <span style={{ color: COLOR_LABEL }}>
        {shorten
          ? (<><span className="hidden 2xl:inline">{label}</span><span className="2xl:hidden">{shortLabel}</span></>)
          : label}
      </span>
      <span
        className="font-mono"
        style={{ color, fontWeight: state === 'alert' ? 700 : 400 }}
      >
        {showDash ? '—' : value!.toFixed(dp)}
        {!showDash && (
          <span className="ml-0.5 text-[10px]" style={{ color: COLOR_LABEL }}>
            {unit}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Connection state machine ────────────────────────────────────────────────
// Combines wsStatus + master.connected into one operator-facing state.
//
//   connected    — WS open, master.connected: true. Everything fine.
//   offline      — WS open, master.connected: false. Backend reachable but the
//                  MT5 master node specifically is down. MT5-side problem.
//   disconnected — WS dead. Black box — could be backend, BFF, or network.
//
// The distinction between offline and disconnected matters: it tells the
// operator whether to look at MT5 or at the platform itself.
type ConnState = 'connected' | 'offline' | 'disconnected';

interface ConnConfig {
  dotColor:    string;
  statusText:  string;
  statusColor: string;
}

const CONN_CONFIG: Record<ConnState, ConnConfig> = {
  connected:    { dotColor: COLOR_PILL_GREEN, statusText: 'Connected',    statusColor: COLOR_OK    },
  offline:      { dotColor: COLOR_PILL_RED,   statusText: 'Offline',      statusColor: COLOR_ALERT },
  disconnected: { dotColor: '#808080',        statusText: 'Disconnected', statusColor: COLOR_MUTED },
};

function deriveConnState(
  wsStatus: SystemHealthWsStatus,
  payload:  SystemHealthPayload | null,
): ConnState {
  if (wsStatus !== 'open' || !payload) return 'disconnected';
  if (!payload.master.connected)       return 'offline';
  return 'connected';
}

// ── cTrader MASTER ──────────────────────────────────────────────────────────
// The five connection states of a cTrader node, in the bar's vocabulary.
// "Offline" has the same meaning as for MT5: the platform is up, this node is
// not connected. "Disconnected" stays reserved for the browser's own socket.
interface CTraderMaster { id: number; name: string; status: string; }

interface CTraderConnConfig { dotColor: string; statusText: string; statusColor: string; bold: boolean; tooltip: string; }

function ctraderConn(status: string): CTraderConnConfig {
  switch (status) {
    case 'CONNECTED':
      return { dotColor: COLOR_PILL_GREEN, statusText: 'Connected', statusColor: COLOR_OK, bold: false,
        tooltip: 'Master cTrader node is online.' };
    case 'CONNECTING':
      return { dotColor: COLOR_WARN, statusText: 'Connecting', statusColor: COLOR_WARN, bold: false,
        tooltip: 'The master cTrader node is connecting.' };
    case 'RECONNECTING':
      return { dotColor: COLOR_WARN, statusText: 'Reconnecting', statusColor: COLOR_WARN, bold: true,
        tooltip: 'The connection to the master cTrader node failed or was lost. It retries by itself.\n\nDetails: Settings → cTrader Servers.' };
    case 'ERROR':
      return { dotColor: COLOR_PILL_RED, statusText: 'Error', statusColor: COLOR_ALERT, bold: true,
        tooltip: 'The master cTrader server refused the login or the manager\'s rights. It does not retry.\n\nCorrect the node in Settings → cTrader Servers.' };
    default:
      return { dotColor: COLOR_PILL_RED, statusText: 'Offline', statusColor: COLOR_ALERT, bold: true,
        tooltip: 'The master cTrader node is not connected: it was stopped or is disabled.\n\nConnect it in Settings → cTrader Servers.' };
  }
}

// ── Tooltip helpers ─────────────────────────────────────────────────────────
function formatThreshold(value: number, unit: string): string {
  return unit === '%' ? `${value}${unit}` : `${value} ${unit}`;
}

/**
 * Build a metric tooltip. Appends a threshold sentence when the metric is in
 * warn or alert state so the operator immediately sees whether the current
 * reading is "just noticed" or "actively bad".
 */
function buildMetricTooltip(
  base:       string,
  state:      MetricState,
  threshold:  SystemHealthThreshold | undefined,
  unit:       string,
): string {
  if (!threshold || (state !== 'warn' && state !== 'alert')) return base;
  const warn  = formatThreshold(threshold.warn,  unit);
  const alert = formatThreshold(threshold.alert, unit);
  return `${base}\n\nWarning above ${warn}, critical above ${alert}.`;
}

// ── BottomBar ───────────────────────────────────────────────────────────────
export function BottomBar() {
  const [payload, setPayload]   = useState<SystemHealthPayload | null>(null);
  const [wsStatus, setWsStatus] = useState<SystemHealthWsStatus>('closed');
  const [pulseKeys, setPulseKeys] = useState<Set<string>>(new Set());

  // Previous state per metric — drives pulse-on-transition logic.
  const prevStateRef = useRef<Map<string, MetricState>>(new Map());
  // Most recent as_of timestamp where master.connected was true.
  // Used in the Offline tooltip so the operator knows how stale the situation is.
  const lastSeenOnlineRef = useRef<string | null>(null);
  // Scoped diagnostic — first frame only, per the notification-milestone pattern.
  const loggedFirstFrameRef = useRef<boolean>(false);

  // cTrader MASTER: null until known, and when cTrader has none.
  const [ctMaster, setCtMaster] = useState<CTraderMaster | null>(null);
  // Counts the cTrader events seen. A seed read that an event overtook is
  // older than that event and is dropped.
  const ctEventSeqRef = useRef(0);
  const everOpenedRef = useRef(false);

  // ── WebSocket lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    // Seed: once when the bar mounts, and again when the socket comes back
    // after a drop (events sent meanwhile are lost). Never on a timer.
    const seedCTraderMaster = () => {
      const seqAtStart = ctEventSeqRef.current;
      ctraderApi.getMaster()
        .then((res) => {
          if (cancelled || ctEventSeqRef.current !== seqAtStart) return;
          const m = res.master;
          setCtMaster(m ? { id: m.node_id, name: m.node_name, status: m.connection_status } : null);
        })
        .catch(() => { /* unknown: the cells stay as they are; events still update them */ });
    };

    const onCTraderEvent = (e: CTraderNodeWsEvent) => {
      ctEventSeqRef.current += 1;
      if (e.kind === 'snapshot') {
        const m = e.nodes.find(n => n.is_master || n.node_type === 'MASTER');
        setCtMaster(m ? { id: m.node_id, name: m.node_name, status: m.connection_status } : null);
        return;
      }
      if (e.kind === 'type_change') {
        // Promotion. The new MASTER's own CONNECTING event follows this one.
        if (e.promoted.new_type === 'MASTER') {
          setCtMaster({ id: e.promoted.node_id, name: e.promoted.node_name, status: 'CONNECTING' });
        }
        return;
      }
      // Status change. Only the MASTER matters here: a first MASTER that was
      // just created is adopted from its first event, and the old MASTER's
      // DISCONNECTED during a promotion (its type already reads STANDBY) is
      // ignored. A deleted MASTER is not announced; it clears on the next seed.
      const node = e.node;
      if (node) {
        if (node.node_type !== 'MASTER' && !node.is_master) return;
        setCtMaster({ id: node.node_id, name: node.node_name, status: node.connection_status });
        return;
      }
      setCtMaster(prev => (prev && prev.id === e.nodeId ? { ...prev, status: e.status } : prev));
    };

    seedCTraderMaster();
    const cleanup = connectSystemHealthWebSocket(
      (p) => {
        if (!loggedFirstFrameRef.current) {
          // eslint-disable-next-line no-console
          console.log('[BottomBar] first system.health envelope:', p);
          loggedFirstFrameRef.current = true;
        }
        if (p.master.connected) lastSeenOnlineRef.current = p.as_of;
        setPayload(p);
      },
      (status) => {
        setWsStatus(status);
        if (status === 'open') {
          if (everOpenedRef.current) seedCTraderMaster();
          everOpenedRef.current = true;
        }
      },
      onCTraderEvent,
    );
    return () => { cancelled = true; cleanup(); };
  }, []);

  // ── Detect transitions INTO alert and trigger the pulse ───────────────────
  useEffect(() => {
    if (!payload) return;
    const { metrics, thresholds } = payload;

    const newStates: Record<string, MetricState> = {
      cpu_saturation_pct:  deriveState(metrics.cpu_saturation_pct,  thresholds.cpu_saturation_pct),
      memory_pressure_pct: deriveState(metrics.memory_pressure_pct, thresholds.memory_pressure_pct),
      disk_io_latency_ms:  deriveState(metrics.disk_io_latency_ms,  thresholds.disk_io_latency_ms),
      mt5_rtt_ms:          deriveState(metrics.mt5_rtt_ms,          thresholds.mt5_rtt_ms),
      lp_execution_rtt_ms: deriveLpState(
        metrics.lp_execution_rtt_ms,
        metrics.lp_execution_age_ms,
        thresholds.lp_execution_rtt_ms,
      ),
      packet_loss_pct:     deriveState(metrics.packet_loss_pct,     thresholds.packet_loss_pct),
    };

    const newAlerts: string[] = [];
    for (const [key, state] of Object.entries(newStates)) {
      const prev = prevStateRef.current.get(key);
      if (state === 'alert' && prev !== 'alert') newAlerts.push(key);
      prevStateRef.current.set(key, state);
    }

    if (newAlerts.length > 0) {
      setPulseKeys((prev) => {
        const next = new Set(prev);
        newAlerts.forEach((k) => next.add(k));
        return next;
      });
      // Animation is 600ms; clear class after the same window so it can re-fire
      // on the next transition.
      setTimeout(() => {
        setPulseKeys((prev) => {
          const next = new Set(prev);
          newAlerts.forEach((k) => next.delete(k));
          return next;
        });
      }, ALERT_PULSE_MS);
    }
  }, [payload]);

  // ── Derived render values ─────────────────────────────────────────────────
  // Per §7.4: when WS is not 'open', do not show stale values — render '—'
  // and dim the whole bar. We honor this by treating metrics/thresholds as
  // null whenever wsStatus !== 'open'.
  const live = wsStatus === 'open' && payload != null;
  const m = live ? payload!.metrics    : null;
  const t = live ? payload!.thresholds : null;

  const cpuState  = deriveState(m?.cpu_saturation_pct,  t?.cpu_saturation_pct);
  const memState  = deriveState(m?.memory_pressure_pct, t?.memory_pressure_pct);
  const diskState = deriveState(m?.disk_io_latency_ms,  t?.disk_io_latency_ms);
  const mt5State  = deriveState(m?.mt5_rtt_ms,          t?.mt5_rtt_ms);
  const lpState   = m
    ? deriveLpState(m.lp_execution_rtt_ms, m.lp_execution_age_ms, t?.lp_execution_rtt_ms)
    : 'no_data';
  const lossState = deriveState(m?.packet_loss_pct, t?.packet_loss_pct);

  // ── Derived: connection state + operator-friendly tooltips ────────────────
  const connState  = deriveConnState(wsStatus, payload);
  const connConfig = CONN_CONFIG[connState];

  // Master cell display text
  let masterDisplay: string;
  if (connState === 'disconnected') {
    masterDisplay = '—';
  } else if (payload!.master.name) {
    masterDisplay = `Master-MT5: ${payload!.master.name}`;
  } else {
    masterDisplay = 'No MT5 master configured';
  }

  // cTrader MASTER cells. Like every other cell, no stale value while the
  // socket is down: the pair shows dashes until it is back.
  const ctConn = ctMaster ? ctraderConn(ctMaster.status) : null;
  // With the cTrader pair in the bar the metric cells get less room.
  const compact = !!ctMaster;

  // Connection-state tooltip, shared by both left cells
  let connTooltip: string;
  if (connState === 'connected') {
    connTooltip = 'Master MT5 node is online and the platform is receiving live data.';
  } else if (connState === 'offline') {
    let base = 'The platform is running but the master MT5 node is unreachable. Check MT5 server, credentials, and network to the MT5 host.';
    if (lastSeenOnlineRef.current) {
      const seenAt = new Date(lastSeenOnlineRef.current)
        .toLocaleTimeString('en-GB', { hour12: false, timeZone: 'UTC' });
      base += `\n\nLast seen online at ${seenAt} UTC.`;
    }
    connTooltip = base;
  } else {
    connTooltip = 'The browser has lost its connection to the platform. This could be the backend, the BFF, or your network. The platform itself may still be running normally.';
  }

  // LP tooltip — three branches: fresh, stale, no_data. Plus threshold suffix
  // when fresh-and-elevated.
  let lpTitle: string;
  if (lpState === 'stale') {
    lpTitle = 'LP latency data is more than 5 minutes old — the fixbridge service has stopped reporting health. The LP itself may be fine, we just don\'t know.';
  } else if (lpState === 'no_data' || !m || m.lp_execution_rtt_ms == null || !m.lp_execution_lp_id) {
    lpTitle = 'Slowest execution round-trip across all connected liquidity providers. This is your A-Book and C-Book hedge latency.\n\nNo fresh data available — the LP pipeline has not reported yet.';
  } else {
    const ageS = m.lp_execution_age_ms != null
      ? ` (measured ${Math.round(m.lp_execution_age_ms / 1000)}s ago)`
      : '';
    const base = `Slowest execution round-trip across all connected liquidity providers. This is your A-Book and C-Book hedge latency.\n\nCurrent worst LP: ${m.lp_execution_lp_id} — ${m.lp_execution_rtt_ms.toFixed(1)} ms${ageS}.`;
    lpTitle = buildMetricTooltip(base, lpState, t?.lp_execution_rtt_ms, 'ms');
  }

  // Operator-friendly metric tooltips (Ross's copy)
  const TIP_CPU  = "Percentage of time the server's CPU has more threads waiting to run than it has cores. High values mean the hedge engine is fighting for CPU and orders may be delayed even though CPU usage looks normal.";
  const TIP_MEM  = "How heavily the server is shuffling memory between RAM and disk. Anything above zero means Windows is paging — expect latency spikes across the whole platform until it clears.";
  const TIP_DISK = "Average time the disk takes to complete a read or write, in milliseconds. On a healthy SSD this should be under 1 ms. High values slow down Database writes, log files, and FIX message storage.";
  const TIP_MT5  = "Round-trip time to the master MT5 server, measured every 10 seconds. This is your B-Book latency floor. If it climbs, every MT5 operation — quotes, positions, orders — gets slower.";
  const TIP_LOSS = "Percentage of network packets the server had to resend. Anything above 0.75% in a colocated setup signals a network problem — expect FIX session drops, price gaps, and missed fills if this stays elevated.";

  return (
    <footer
      className={clsx(
        'h-7 border-t flex items-stretch text-xs shrink-0',
        'transition-opacity duration-300',
        !live && 'opacity-50',
      )}
      style={{ backgroundColor: COLOR_BG, borderColor: COLOR_DIVIDER }}
    >
      {/* ── Master cell — dot + master node name ──────────────────────────── */}
      <div
        className="flex items-center gap-1.5 px-3 border-r whitespace-nowrap"
        style={{ borderColor: COLOR_DIVIDER }}
        title={connTooltip}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: connConfig.dotColor }}
        />
        <span
          className="font-mono"
          style={{ color: connState === 'disconnected' ? COLOR_MUTED : COLOR_OK }}
        >
          {masterDisplay}
        </span>
      </div>

      {/* ── Status text cell — Connected / Offline / Disconnected ─────────── */}
      <div
        className="flex items-center px-3 border-r"
        style={{ borderColor: COLOR_DIVIDER }}
        title={connTooltip}
      >
        <span style={{
          color: connConfig.statusColor,
          fontWeight: connState === 'offline' ? 600 : 400,
        }}>
          {connConfig.statusText}
        </span>
      </div>

      {/* ── cTrader MASTER — same pair of cells; absent when cTrader has none ── */}
      {ctMaster && ctConn && (
        <>
          <div
            className="flex items-center gap-1.5 px-3 border-r min-w-0"
            style={{ borderColor: COLOR_DIVIDER }}
            title={live ? `${ctMaster.name}\n\n${ctConn.tooltip}` : connTooltip}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: live ? ctConn.dotColor : '#808080' }}
            />
            <span
              className="font-mono truncate"
              style={{ color: live ? COLOR_OK : COLOR_MUTED, maxWidth: 'min(260px, 16vw)' }}
            >
              {live ? `Master-cTrader: ${ctMaster.name}` : '—'}
            </span>
          </div>
          <div
            className="flex items-center px-3 border-r"
            style={{ borderColor: COLOR_DIVIDER }}
            title={live ? ctConn.tooltip : connTooltip}
          >
            <span style={{
              color: live ? ctConn.statusColor : COLOR_MUTED,
              fontWeight: live && ctConn.bold ? 600 : 400,
            }}>
              {live ? ctConn.statusText : '—'}
            </span>
          </div>
        </>
      )}

      {/* ── Six metric cells — flex-1 each, evenly distributed ────────────── */}
      <MetricCell
        label="CPU Saturation" shortLabel="CPU Sat." compact={compact} unit="%" dp={1}
        value={m?.cpu_saturation_pct ?? null}
        state={cpuState}
        pulsing={pulseKeys.has('cpu_saturation_pct')}
        title={buildMetricTooltip(TIP_CPU, cpuState, t?.cpu_saturation_pct, '%')}
      />
      <MetricCell
        label="Mem Pressure" shortLabel="Mem" compact={compact} unit="%" dp={1}
        value={m?.memory_pressure_pct ?? null}
        state={memState}
        pulsing={pulseKeys.has('memory_pressure_pct')}
        title={buildMetricTooltip(TIP_MEM, memState, t?.memory_pressure_pct, '%')}
      />
      <MetricCell
        label="Disk I/O" unit="ms" dp={1}
        value={m?.disk_io_latency_ms ?? null}
        state={diskState}
        pulsing={pulseKeys.has('disk_io_latency_ms')}
        title={buildMetricTooltip(TIP_DISK, diskState, t?.disk_io_latency_ms, 'ms')}
      />
      <MetricCell
        label="MT5 RTT" unit="ms" dp={1}
        value={m?.mt5_rtt_ms ?? null}
        state={mt5State}
        pulsing={pulseKeys.has('mt5_rtt_ms')}
        title={buildMetricTooltip(TIP_MT5, mt5State, t?.mt5_rtt_ms, 'ms')}
      />
      <MetricCell
        label="LP RTT" unit="ms" dp={1}
        value={lpState === 'stale' ? null : (m?.lp_execution_rtt_ms ?? null)}
        state={lpState}
        pulsing={pulseKeys.has('lp_execution_rtt_ms')}
        title={lpTitle}
      />
      <MetricCell
        label="Packet Loss" shortLabel="Pkt Loss" compact={compact} unit="%" dp={2}
        value={m?.packet_loss_pct ?? null}
        state={lossState}
        pulsing={pulseKeys.has('packet_loss_pct')}
        title={buildMetricTooltip(TIP_LOSS, lossState, t?.packet_loss_pct, '%')}
      />

      {/* ── Timestamp cell ────────────────────────────────────────────────── */}
      <div className="flex items-center px-3">
        {live
          ? (
            <span
              className="font-mono text-[10px]"
              style={{ color: COLOR_MUTED }}
              title={`Last update from SystemHealthMonitor (${payload!.as_of})`}
            >
              {new Date(payload!.as_of).toLocaleTimeString('en-GB', { hour12: false })}
            </span>
          )
          : <span style={{ color: COLOR_MUTED }}>—</span>}
      </div>
    </footer>
  );
}

export default BottomBar;