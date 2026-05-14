// ============================================================================
// BottomBar — system.health status surface
//
// Subscribes to the `system.health` WebSocket topic via the BFF and renders
// a row of cells across the bottom of the app:
//
//   [Master cell] [Status cell] [CPU] [Mem] [Disk] [MT5] [LP] [Loss] [Time]
//
// The Master + Status cells share a combined connection state machine:
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
  value:    number | null;
  unit:     string;
  state:    MetricState;
  pulsing:  boolean;
  dp:       number;     // display precision
  title?:   string;
}

function MetricCell({ label, value, unit, state, pulsing, dp, title }: MetricCellProps) {
  const color = colorForState(state);
  const showDash = state === 'no_data' || state === 'stale' || value == null;
  return (
    <div
      className={clsx(
        'flex-1 flex items-center justify-center gap-1.5 border-r',
        pulsing && 'nexrisk-alert-pulse',
      )}
      style={{ borderColor: COLOR_DIVIDER }}
      title={title}
    >
      <span style={{ color: COLOR_LABEL }}>{label}</span>
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

  // ── WebSocket lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
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
      (status) => setWsStatus(status),
    );
    return cleanup;
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
    masterDisplay = `Master: ${payload!.master.name}`;
  } else {
    masterDisplay = 'No master configured';
  }

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
        className="flex items-center gap-1.5 px-3 border-r"
        style={{ borderColor: COLOR_DIVIDER }}
        title={connTooltip}
      >
        <span
          className="w-2 h-2 rounded-full"
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

      {/* ── Six metric cells — flex-1 each, evenly distributed ────────────── */}
      <MetricCell
        label="CPU Saturation" unit="%" dp={1}
        value={m?.cpu_saturation_pct ?? null}
        state={cpuState}
        pulsing={pulseKeys.has('cpu_saturation_pct')}
        title={buildMetricTooltip(TIP_CPU, cpuState, t?.cpu_saturation_pct, '%')}
      />
      <MetricCell
        label="Mem Pressure" unit="%" dp={1}
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
        label="Packet Loss" unit="%" dp={2}
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