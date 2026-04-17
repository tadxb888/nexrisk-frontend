// ============================================================
// Hedging Strategies — Risk Manager Configuration Page
//
// Layout: master-detail, no AG Grid
//   Left  (380px) — Priority-sorted strategy cards
//   Right (flex-1) — 6-section structured form
//
// Sections:
//   1. Identity & Status
//   2. Source Targeting  (server · groups · logins · cohorts)
//   3. Instrument Targeting (symbols · direction)
//   4. Execution Parameters (hedge % · LP · guard clause)
//   5. Route & Fallback (sanity thresholds · breach · recovery)
//   6. Activation Window (always · schedule · pnl · manual)
//
// Polling: rules 30s · LP health 5s · no WebSocket
// Persistence: sessionStorage for selected rule_id
// Style reference: BBookPage color tokens
// ============================================================

import React, {
  useState, useEffect, useCallback, useMemo, useRef, type ReactNode,
  type KeyboardEvent, type ChangeEvent,
} from 'react';

// ══════════════════════════════════════════════════════════════
// CONSTANTS — color tokens (matches BBookPage / Cockpit reference)
// ══════════════════════════════════════════════════════════════
const BG_PAGE    = '#313032';                // Cockpit page bg
const BG_PANEL   = '#2a292c';                // filter-bar / sub-panel bg
const BG_SECTION = '#2a292c';                // card bg — flat, single surface
const BG_FIELD   = '#232225';                // input bg (matches Cockpit inputs)
const BORDER     = '#505050';                // subtle divider
const BORDER_MD  = '#606060';                // standard border (Cockpit input border)
const BORDER_HDR = '#808080';                // page header divider
const TEAL       = '#49b3b3';                // tailwind: accent (already muted)
const GREEN      = '#6aaa78';                // grey-blended green — readable, not neon
const AMBER      = '#c09060';                // grey-blended amber — warm, not bright
const RED        = '#d07070';                // grey-blended red — visible, not fluorescent
// ── Badge palettes (grey-blended to comply with branding: no neon, no bright) ──
const BADGE = {
  critical: { bg: '#313032', color: '#f79393ff', border: '#7a2f36' },
  high:     { bg: '#2a2016', color: '#c09060', border: '#6a4a2f' },
  low:      { bg: '#162a1c', color: '#6aaa78', border: '#2f6a3d' },
  neutral:  { bg: '#1a1a1d', color: '#d2d6e2', border: '#44454f' },
} as const;
const TEXT_PRI   = '#ffffff';
const TEXT_SEC   = '#cccccc';
const TEXT_MUT   = '#999999';                // Cockpit secondary (visible, not grey-on-grey)
// ── Right-panel specific tokens (brighter — smaller surface, denser info) ──
const RP_LABEL   = '#ffffff';
const RP_HINT    = '#999999';
// FONT_MONO is reserved for tabular/data contexts only (numbers, IDs, timestamps,
// LP/symbol codes, status codes). UI chrome (labels, buttons, titles) uses default sans.
const FONT_MONO  = 'IBM Plex Mono, monospace';

const SS_KEY = 'nexrisk:hedging:selected';

// ══════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════
type RuleStatus    = 'ACTIVE' | 'PAUSED' | 'STOPPED';
type ActivationType = 'ALWAYS' | 'SCHEDULE' | 'NEWS_EVENT' | 'PNL_TRIGGER' | 'MANUAL';
type Direction     = 'LONG' | 'SHORT' | 'BOTH';
type TraderClass   = 'EA' | 'SCALPER' | 'ARBITRAGE' | 'NEWS_TRADER' | 'NORMAL' | 'REBATE_ABUSER';
type ConditionType = 'NONE' | 'SYMBOL_REALIZED' | 'SYMBOL_COMBINED'
                   | 'OVERALL_REALIZED' | 'OVERALL_COMBINED';
// SYMBOL_UNREALIZED (17 chars) and OVERALL_UNREALIZED (18 chars) omitted —
// both exceed the DB column constraint varchar(16). Relay to C++ dev: ALTER TABLE
// hedging_rules ALTER COLUMN condition_type TYPE varchar(32);
type RoutingStatus = 'HEALTHY' | 'BREACHED' | 'FAILOVER_ACTIVE' | 'RECOVERY_HOLD';
type BreachAction  = 'PAUSE_RULE' | 'STOP_RULE' | 'FALLBACK_LP';
type RecoveryPolicy = 'AUTO_RESTORE' | 'HOLD_THEN_RESTORE' | 'MANUAL_ONLY';
type RestoreTarget = 'ORIGINAL_LP' | 'STAY_ON_FALLBACK';
type FinalFallback = 'B_BOOK' | 'REJECT' | 'REJECT_NOTIFY';
type LpConnectivity = 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';

// ── Trading Economics calendar event (from GET /api/v1/calendar/events) ──
interface CalendarEvent {
  calendar_id:    string;
  event_name:     string;
  country:        string;
  category:       string;
  currency:       string | null;
  event_time_utc: string;
  importance:     1 | 2 | 3;
  status:         'SCHEDULED' | 'RELEASED' | 'CANCELLED';
  actual:         string | null;
  previous:       string | null;
  consensus:      string | null;
  forecast:       string | null;
  ticker:         string | null;
}

interface HedgeRule {
  rule_id:               number;
  name:                  string;
  description:           string | null;
  priority:              number;
  status:                RuleStatus;
  created_by:            string | null;
  created_at:            string;
  updated_at:            string;
  activation_type:       ActivationType;
  schedule_days:         number | null;
  schedule_time_from:    string | null;
  schedule_time_to:      string | null;
  news_event_id:         number | null;
  te_calendar_id:        string | null;
  minutes_before:        number | null;
  minutes_after:         number | null;
  activation_pnl_type:   string | null;
  activation_operator:   string | null;
  activation_value:      number | null;
  mt5_servers:           string[];
  groups:                string[];
  login_ids:             number[];
  trader_classifications: TraderClass[];
  cluster_ids:           number[];
  symbols:               string[];
  direction:             Direction;
  hedge_volume_pct:      number;
  hedging_lp_id:         string;
  lp_account_id:         string;
  hedge_confirm_timeout_ms: number;
  condition_type:        ConditionType;
  condition_operator:    string | null;
  condition_value:       number | null;
  current_routing_status: RoutingStatus;
  active_lp_id:          string;
  paused_reason:         string | null;
  last_triggered_at:     string | null;
  last_hedge_sent_at:    string | null;
  total_hedges_sent:     number;
  total_volume_hedged:   number;
}

interface SanityConfig {
  config_id:             number;
  rule_id:               number | null;
  lp_id:                 string;
  is_global_default:     boolean;
  max_latency_ms:        number | null;
  min_fill_rate_pct:     number | null;
  max_reject_rate_pct:   number | null;
  max_slippage_pips:     number | null;
  heartbeat_timeout_ms:  number | null;
  rolling_window_seconds: number;
  breach_action:         BreachAction;
  fallback_lp_id:        string | null;
  fallback_lp_account_id: string | null;
  notify_on_breach:      boolean;
  notify_on_recovery:    boolean;
  recovery_policy:       RecoveryPolicy;
  hold_period_seconds:   number | null;
  stability_confirmations: number | null;
  restore_target:        RestoreTarget;
  final_fallback_action: FinalFallback;
}

interface LpHealth {
  lp_id:               string;
  connectivity_status: LpConnectivity;
  last_heartbeat_at:   string | null;
  latency_ms:          number | null;
  fill_rate_pct:       number | null;
  reject_rate_pct:     number | null;
  slippage_avg_pips:   number | null;
  last_checked_at:     string;
}

interface LpOption {
  lp_id:   string;
  lp_name: string;
  enabled: boolean;
}

interface Mt5Node {
  id:                number;
  node_name:         string;
  node_type:         string;  // MASTER | STANDBY | BACKUP | CLIENT | PARTNER
  connection_status: string;
  is_enabled:        boolean;
}

interface EscalatedPosition {
  record_id:         number;
  position_id:       number;
  login_id:          number;
  mt5_symbol:        string;
  direction:         'LONG' | 'SHORT';
  hedge_volume_mt5:  number;
  hedge_volume_lp:   number;
  rule_id:           number | null;
  rule_name:         string | null;
  hedging_lp_id:     string;
  hedge_state:       'TIMEOUT_ESCALATED' | 'REJECTED_ESCALATED' | 'NORMALIZER_ERROR';
  clord_id:          string;
  lp_position_id:    string | null;
  dispatched_at:     string;
  escalated_at:      string;
  escalation_reason: string | null;
  rejection_code:    string | null;
  acknowledged_by:   string | null;
  acknowledged_at:   string | null;
}

// ── Draft state (form working copy) ──────────────────────────
interface DraftRule {
  name:                  string;
  description:           string;
  priority:              number;
  status:                RuleStatus;
  // Activation
  activation_type:       ActivationType;
  schedule_days:         number;
  schedule_time_from:    string;
  schedule_time_to:      string;
  // NEWS_EVENT activation
  te_calendar_id:        string;   // selected TE calendar_id
  minutes_before:        string;
  minutes_after:         string;
  activation_pnl_type:   string;
  activation_operator:   string;
  activation_value:      string;
  // Source
  mt5_server_id:         string;
  groups:                string[];
  login_ids:             string;   // comma-separated integers
  trader_classifications: TraderClass[];
  cluster_ids:           string;   // comma-separated integers (freeform pending GET /api/v1/risk/clusters)
  // Instrument
  symbols:               string[];
  direction:             Direction;
  // Execution
  hedge_volume_pct:      string;
  hedging_lp_id:         string;
  lp_account_id:         string;
  hedge_confirm_timeout_ms: string;
  // Guard
  condition_type:        ConditionType;
  condition_operator:    string;
  condition_value:       string;
}

interface DraftSanity {
  lp_id:                 string;
  max_latency_ms:        string;
  min_fill_rate_pct:     string;
  max_reject_rate_pct:   string;
  max_slippage_pips:     string;
  heartbeat_timeout_ms:  string;
  rolling_window_seconds: string;
  breach_action:         BreachAction;
  fallback_lp_id:        string;
  fallback_lp_account_id: string;
  notify_on_breach:      boolean;
  notify_on_recovery:    boolean;
  recovery_policy:       RecoveryPolicy;
  hold_period_seconds:   string;
  stability_confirmations: string;
  restore_target:        RestoreTarget;
  final_fallback_action: FinalFallback;
}

// ── Default drafts ────────────────────────────────────────────
const EMPTY_RULE: DraftRule = {
  name: '',
  description: '',
  priority: 10,
  status: 'ACTIVE',
  activation_type: 'ALWAYS',
  schedule_days: 31,
  schedule_time_from: '00:00',
  schedule_time_to: '23:59',
  te_calendar_id: '',
  minutes_before: '10',
  minutes_after: '15',
  activation_pnl_type: 'OVERALL_PNL',
  activation_operator: 'LT',
  activation_value: '',
  mt5_server_id: '',
  groups: [],
  login_ids: '',
  trader_classifications: [],
  cluster_ids: '',
  symbols: [],
  direction: 'BOTH',
  hedge_volume_pct: '100',
  hedging_lp_id: '',
  lp_account_id: '',
  hedge_confirm_timeout_ms: '5000',
  condition_type: 'NONE',
  condition_operator: 'GT',
  condition_value: '',
};

const EMPTY_SANITY: DraftSanity = {
  lp_id: '',
  max_latency_ms: '',
  min_fill_rate_pct: '',
  max_reject_rate_pct: '',
  max_slippage_pips: '',
  heartbeat_timeout_ms: '',
  rolling_window_seconds: '60',
  breach_action: 'PAUSE_RULE',
  fallback_lp_id: '',
  fallback_lp_account_id: '',
  notify_on_breach: true,
  notify_on_recovery: true,
  recovery_policy: 'AUTO_RESTORE',
  hold_period_seconds: '',
  stability_confirmations: '',
  restore_target: 'ORIGINAL_LP',
  final_fallback_action: 'REJECT_NOTIFY',
};

// ══════════════════════════════════════════════════════════════
// HELPERS — serialization
// ══════════════════════════════════════════════════════════════
function parseInts(csv: string): number[] {
  return csv.split(',').map(s => s.trim()).filter(Boolean)
    .map(Number).filter(n => Number.isFinite(n) && n > 0);
}

function nullableFloat(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function nullableInt(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function ruleToApiBody(d: DraftRule): Record<string, unknown> {
  const isSchedule   = d.activation_type === 'SCHEDULE';
  const isPnlTrigger = d.activation_type === 'PNL_TRIGGER';
  const isNewsEvent  = d.activation_type === 'NEWS_EVENT';
  const hasGuard     = d.condition_type !== 'NONE';
  return {
    name:            d.name.trim(),
    description:     d.description.trim(),
    priority:        d.priority,
    status:          d.status,
    activation_type: d.activation_type,

    // SCHEDULE — omit time/int fields entirely when unused (DB check constraints reject "")
    ...(isSchedule ? {
      schedule_days:      d.schedule_days,
      schedule_time_from: d.schedule_time_from,
      schedule_time_to:   d.schedule_time_to,
    } : {}),

    // NEWS_EVENT — pass te_calendar_id + window config
    ...(isNewsEvent ? {
      te_calendar_id: d.te_calendar_id || undefined,
      minutes_before: nullableInt(d.minutes_before),
      minutes_after:  nullableInt(d.minutes_after),
    } : {}),

    // PNL_TRIGGER — omit entirely when unused (chk_activation_pnl_type rejects "")
    ...(isPnlTrigger ? {
      activation_pnl_type: d.activation_pnl_type,
      activation_operator: d.activation_operator,
      activation_value:    nullableFloat(d.activation_value),
    } : {}),

    // Source
    mt5_servers:            d.mt5_server_id ? [d.mt5_server_id] : [],
    groups:                 d.groups,
    login_ids:              parseInts(d.login_ids),
    trader_classifications: d.trader_classifications,
    cluster_ids:            parseInts(d.cluster_ids),

    // Instrument
    symbols:   d.symbols,
    direction: d.direction,

    // Execution
    hedge_volume_pct:         parseFloat(d.hedge_volume_pct) || 100,
    hedging_lp_id:            d.hedging_lp_id,
    lp_account_id:            d.lp_account_id,
    hedge_confirm_timeout_ms: parseInt(d.hedge_confirm_timeout_ms, 10) || 5000,

    // Guard clause — omit operator/value entirely when NONE (check constraints reject "")
    condition_type: d.condition_type,
    ...(hasGuard ? {
      condition_operator: d.condition_operator,
      condition_value:    nullableFloat(d.condition_value),
    } : {}),
  };
}

function sanityToApiBody(d: DraftSanity): Record<string, unknown> {
  return {
    lp_id:                  d.lp_id,
    max_latency_ms:         nullableFloat(d.max_latency_ms),
    min_fill_rate_pct:      nullableFloat(d.min_fill_rate_pct),
    max_reject_rate_pct:    nullableFloat(d.max_reject_rate_pct),
    max_slippage_pips:      nullableFloat(d.max_slippage_pips),
    heartbeat_timeout_ms:   nullableInt(d.heartbeat_timeout_ms),
    rolling_window_seconds: parseInt(d.rolling_window_seconds, 10) || 60,
    breach_action:          d.breach_action,
    fallback_lp_id:         d.fallback_lp_id || null,
    fallback_lp_account_id: d.fallback_lp_account_id || null,
    notify_on_breach:       d.notify_on_breach,
    notify_on_recovery:     d.notify_on_recovery,
    recovery_policy:        d.recovery_policy,
    hold_period_seconds:    d.recovery_policy === 'HOLD_THEN_RESTORE' ? nullableInt(d.hold_period_seconds) : null,
    stability_confirmations: d.recovery_policy === 'HOLD_THEN_RESTORE' ? nullableInt(d.stability_confirmations) : null,
    restore_target:         d.restore_target,
    final_fallback_action:  d.final_fallback_action,
  };
}

function draftFromRule(r: HedgeRule): DraftRule {
  return {
    name:             r.name,
    description:      r.description ?? '',
    priority:         r.priority,
    status:           r.status,
    activation_type:  r.activation_type,
    schedule_days:    r.schedule_days ?? 31,
    schedule_time_from: r.schedule_time_from ?? '00:00',
    schedule_time_to:   r.schedule_time_to ?? '23:59',
    te_calendar_id:       r.te_calendar_id ?? '',
    minutes_before:       r.minutes_before !== null ? String(r.minutes_before) : '10',
    minutes_after:        r.minutes_after  !== null ? String(r.minutes_after)  : '15',
    activation_pnl_type:  r.activation_pnl_type ?? 'OVERALL_PNL',
    activation_operator:  r.activation_operator ?? 'LT',
    activation_value:     r.activation_value !== null ? String(r.activation_value) : '',
    mt5_server_id:    r.mt5_servers[0] ?? '',
    groups:           r.groups,
    login_ids:        r.login_ids.join(', '),
    trader_classifications: r.trader_classifications,
    cluster_ids:      r.cluster_ids.join(', '),
    symbols:          r.symbols,
    direction:        r.direction,
    hedge_volume_pct: String(r.hedge_volume_pct),
    hedging_lp_id:    r.hedging_lp_id,
    lp_account_id:    r.lp_account_id,
    hedge_confirm_timeout_ms: String(r.hedge_confirm_timeout_ms),
    condition_type:     r.condition_type,
    condition_operator: r.condition_operator ?? 'GT',
    condition_value:    r.condition_value !== null ? String(r.condition_value) : '',
  };
}

function draftSanityFromConfig(c: SanityConfig): DraftSanity {
  return {
    lp_id:                  c.lp_id,
    max_latency_ms:         c.max_latency_ms !== null ? String(c.max_latency_ms) : '',
    min_fill_rate_pct:      c.min_fill_rate_pct !== null ? String(c.min_fill_rate_pct) : '',
    max_reject_rate_pct:    c.max_reject_rate_pct !== null ? String(c.max_reject_rate_pct) : '',
    max_slippage_pips:      c.max_slippage_pips !== null ? String(c.max_slippage_pips) : '',
    heartbeat_timeout_ms:   c.heartbeat_timeout_ms !== null ? String(c.heartbeat_timeout_ms) : '',
    rolling_window_seconds: String(c.rolling_window_seconds),
    breach_action:          c.breach_action,
    fallback_lp_id:         c.fallback_lp_id ?? '',
    fallback_lp_account_id: c.fallback_lp_account_id ?? '',
    notify_on_breach:       c.notify_on_breach,
    notify_on_recovery:     c.notify_on_recovery,
    recovery_policy:        c.recovery_policy,
    hold_period_seconds:    c.hold_period_seconds !== null ? String(c.hold_period_seconds) : '',
    stability_confirmations: c.stability_confirmations !== null ? String(c.stability_confirmations) : '',
    restore_target:         c.restore_target,
    final_fallback_action:  c.final_fallback_action,
  };
}

// ── Conflict detection (client-side) ─────────────────────────
// Two ACTIVE rules conflict when either has an empty scope array OR they share a value.
function detectConflicts(rules: HedgeRule[]): Set<number> {
  const active = rules.filter(r => r.status === 'ACTIVE');
  const conflicted = new Set<number>();
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i], b = active[j];
      const arrOverlap = (x: unknown[], y: unknown[]) =>
        x.length === 0 || y.length === 0 || x.some(v => y.includes(v));
      if (
        arrOverlap(a.symbols, b.symbols) &&
        arrOverlap(a.groups, b.groups) &&
        arrOverlap(a.trader_classifications, b.trader_classifications) &&
        arrOverlap(a.login_ids as unknown[], b.login_ids as unknown[])
      ) {
        conflicted.add(a.rule_id);
        conflicted.add(b.rule_id);
      }
    }
  }
  return conflicted;
}

// ── Day bitmask ───────────────────────────────────────────────
const DAYS = [
  { label: 'M', value: 1,  title: 'Monday'    },
  { label: 'T', value: 2,  title: 'Tuesday'   },
  { label: 'W', value: 4,  title: 'Wednesday' },
  { label: 'T', value: 8,  title: 'Thursday'  },
  { label: 'F', value: 16, title: 'Friday'    },
  { label: 'S', value: 32, title: 'Saturday'  },
  { label: 'S', value: 64, title: 'Sunday'    },
];

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

// ── Importance stars ──────────────────────────────────────────
function ImpStars({ v }: { v: 1 | 2 | 3 }) {
  const color = v === 3 ? RED : v === 2 ? AMBER : TEXT_MUT;
  return (
    <span style={{ fontFamily: FONT_MONO, fontSize: 10, color, letterSpacing: 1 }}>
      {'★'.repeat(v)}{'☆'.repeat(3 - v)}
    </span>
  );
}

// ── Status pill ───────────────────────────────────────────────
function StatusPill({ status }: { status: RuleStatus }) {
  const cfg = {
    ACTIVE:  { ...BADGE.low,      label: 'ACTIVE'  },
    PAUSED:  { ...BADGE.high,     label: 'PAUSED'  },
    STOPPED: { ...BADGE.critical, label: 'STOPPED' },
  }[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 3,
      backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
      fontFamily: FONT_MONO, fontSize: 10, color: cfg.color, letterSpacing: '0.04em', fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: cfg.color, display: 'inline-block' }} />
      {cfg.label}
    </span>
  );
}

// ── Routing health dot ────────────────────────────────────────
function RoutingDot({ status }: { status: RoutingStatus }) {
  const cfg = {
    HEALTHY:        { color: TEAL,  label: 'Healthy'    },
    BREACHED:       { color: AMBER, label: 'Breached'   },
    FAILOVER_ACTIVE:{ color: AMBER, label: 'Failover'   },
    RECOVERY_HOLD:  { color: AMBER, label: 'Hold'       },
  }[status] ?? { color: TEXT_MUT, label: status };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: FONT_MONO, fontSize: 10, color: cfg.color }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: cfg.color }} />
      {cfg.label}
    </span>
  );
}

// ── LP health inline indicator ────────────────────────────────
function LpHealthInline({ health }: { health: LpHealth | undefined }) {
  if (!health) return <span style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO }}>—</span>;
  const color = health.connectivity_status === 'CONNECTED' ? GREEN
              : health.connectivity_status === 'DEGRADED'  ? AMBER : RED;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: FONT_MONO, fontSize: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <span style={{ color }}>{health.connectivity_status}</span>
      {health.latency_ms !== null && (
        <span style={{ color: TEXT_MUT }}>{health.latency_ms.toFixed(0)}ms</span>
      )}
      {health.fill_rate_pct !== null && (
        <span style={{ color: TEXT_MUT }}>{health.fill_rate_pct.toFixed(1)}% fill</span>
      )}
    </span>
  );
}

// ── Section card ──────────────────────────────────────────────
function SectionCard({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div style={{ backgroundColor: BG_SECTION, border: `1px solid ${BORDER}`, borderRadius: 6, marginBottom: 10 }}>
      <div style={{
        padding: '9px 14px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: 4,
          backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`,
          fontFamily: FONT_MONO, fontSize: 10, color: TEAL, fontWeight: 600, flexShrink: 0,
        }}>{n}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: TEXT_PRI, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
          {label}
        </span>
      </div>
      <div style={{ padding: '14px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Form row (label + field) ──────────────────────────────────
function FormRow({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 5, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 11, color: TEXT_PRI, fontWeight: 500 }}>
          {label}{required && <span style={{ color: RED, marginLeft: 2 }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 10, color: TEXT_SEC }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Shared input style ────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  backgroundColor: BG_FIELD, border: `1px solid ${BORDER_MD}`,
  borderRadius: 4, padding: '6px 10px',
  color: TEXT_PRI, fontSize: 12,
  outline: 'none', colorScheme: 'dark',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'auto' as const, colorScheme: 'dark',
};

const escalBtnStyle: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
  fontSize: 10, fontWeight: 600,
  border: '1px solid', transition: 'opacity 0.1s',
};

// ── Toggle chip set (fixed options) ──────────────────────────
function ToggleChips<T extends string>({
  options, selected, onChange, colorize,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onChange: (v: T[]) => void;
  colorize?: (v: T) => string;
}) {
  const toggle = (v: T) =>
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => {
        const active = selected.includes(o.value);
        const color = colorize ? colorize(o.value) : TEAL;
        return (
          <button key={o.value} onClick={() => toggle(o.value)} style={{
            padding: '3px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
            border: `1px solid ${active ? color : BORDER}`,
            backgroundColor: active ? BG_FIELD : BG_FIELD,
            color: active ? color : TEXT_SEC,
            transition: 'all 0.12s',
          }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Chip input (freeform entry → chips, used for symbols & groups) ──
function ChipInput({
  chips, onChange, placeholder, suggestions = [], validEntries,
}: {
  chips: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  validEntries?: string[];          // when provided + non-empty, only these are accepted
}) {
  const [input, setInput] = useState('');
  const [rejected, setRejected] = useState<string | null>(null);
  const inputId = useMemo(() => `chipinput-${Math.random().toString(36).slice(2)}`, []);

  const addChip = useCallback((val: string) => {
    const v = val.trim().toUpperCase();
    if (!v) { setInput(''); return; }
    // Validate against known entries when available
    if (validEntries && validEntries.length > 0 && !validEntries.includes(v)) {
      setRejected(v);
      setTimeout(() => setRejected(null), 2500);
      setInput('');
      return;
    }
    if (!chips.includes(v)) onChange([...chips, v]);
    setRejected(null);
    setInput('');
  }, [chips, onChange, validEntries]);

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(input); }
    if (e.key === 'Backspace' && !input && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v.endsWith(',')) { addChip(v.slice(0, -1)); return; }
    setInput(v);
    if (rejected) setRejected(null);
  };

  return (
    <div>
      <div style={{
        backgroundColor: BG_FIELD, border: `1px solid ${rejected ? RED : BORDER}`, borderRadius: 4,
        padding: '5px 8px', minHeight: 36, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
        transition: 'border-color 0.2s',
      }}>
        {chips.map(c => (
          <span key={c} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 7px', borderRadius: 3,
            backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`,
            fontFamily: FONT_MONO, fontSize: 11, color: TEAL,
          }}>
            {c}
            <button onClick={() => onChange(chips.filter(x => x !== c))} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: TEXT_MUT, fontSize: 13, padding: 0, lineHeight: 1, display: 'flex',
            }}>×</button>
          </span>
        ))}
        {suggestions.length > 0 && (
          <datalist id={inputId}>
            {suggestions.filter(s => !chips.includes(s)).map(s => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <input
          value={input}
          onChange={handleChange}
          onKeyDown={handleKey}
          onBlur={() => { if (input.trim()) addChip(input); }}
          list={suggestions.length > 0 ? inputId : undefined}
          placeholder={chips.length === 0 ? placeholder : undefined}
          style={{
            background: 'none', border: 'none', outline: 'none', flexGrow: 1, minWidth: 100,
            fontFamily: FONT_MONO, fontSize: 12, color: TEXT_PRI,
          }}
        />
      </div>
      {rejected && (
        <div style={{ marginTop: 4, fontSize: 10, color: RED, fontFamily: FONT_MONO }}>
          "{rejected}" is not a known MT5 symbol
        </div>
      )}
    </div>
  );
}

// ── Day picker (bitmask) ──────────────────────────────────────
function DayPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 5 }}>
      {DAYS.map(d => {
        const active = (value & d.value) !== 0;
        return (
          <button key={d.value} title={d.title} onClick={() => onChange(active ? value & ~d.value : value | d.value)} style={{
            width: 28, height: 28, borderRadius: 4, cursor: 'pointer',
            fontSize: 11, fontWeight: 600,
            border: `1px solid ${active ? TEAL : BORDER}`,
            backgroundColor: active ? BG_FIELD : BG_FIELD,
            color: active ? TEAL : TEXT_MUT,
          }}>
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Strategy card (left panel) ────────────────────────────────
function StrategyCard({
  rule, selected, hasConflict, escalationCount, lpHealthMap, onClick,
}: {
  rule:            HedgeRule;
  selected:        boolean;
  hasConflict:     boolean;
  escalationCount: number;
  lpHealthMap:     Map<string, LpHealth>;
  onClick:         () => void;
}) {
  const health = lpHealthMap.get(rule.hedging_lp_id);
  const hColor = health?.connectivity_status === 'CONNECTED' ? GREEN
               : health?.connectivity_status === 'DEGRADED'  ? AMBER : RED;
  const routingColor = {
    HEALTHY: TEAL, BREACHED: AMBER, FAILOVER_ACTIVE: AMBER, RECOVERY_HOLD: AMBER,
  }[rule.current_routing_status] ?? TEXT_MUT;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px', marginBottom: 1, cursor: 'pointer',
        borderLeft: `3px solid ${selected ? TEAL : 'transparent'}`,
        backgroundColor: selected ? '#1a2a2a' : 'transparent',
        borderBottom: `1px solid ${BORDER}`,
        transition: 'background 0.1s',
        position: 'relative',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        {/* Priority badge */}
        <span style={{
          minWidth: 28, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${BORDER}`, borderRadius: 3, flexShrink: 0,
          fontFamily: FONT_MONO, fontSize: 11, color: TEAL, backgroundColor: BG_FIELD,
        }}>
          {rule.priority}
        </span>
        {/* Name */}
        <span style={{ fontSize: 13, color: TEXT_PRI, fontWeight: 500, lineHeight: 1.35, flex: 1 }}>
          {rule.name}
        </span>
        {/* Status */}
        <StatusPill status={rule.status} />
      </div>

      {/* Middle row — chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 7, paddingLeft: 36 }}>
        {rule.mt5_servers.length > 0 && (
          <span style={{
            padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: FONT_MONO,
            backgroundColor: BG_FIELD, color: TEXT_SEC, border: `1px solid ${BORDER}`,
          }}>
            {rule.mt5_servers[0]}
          </span>
        )}
        <span style={{
          padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: FONT_MONO,
          backgroundColor: BG_FIELD, color: TEXT_SEC, border: `1px solid ${BORDER}`,
        }}>
          LP: {rule.hedging_lp_id}
        </span>
        {hasConflict && (
          <span style={{
            padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: FONT_MONO,
            backgroundColor: BG_FIELD, color: AMBER, border: `1px solid ${BORDER}`,
          }}>
            ⚠ Overlap
          </span>
        )}
        {escalationCount > 0 && (
          <span style={{
            padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, fontFamily: FONT_MONO,
            backgroundColor: BADGE.critical.bg, color: BADGE.critical.color, border: `1px solid ${BADGE.critical.border}`,
          }}>
            ⚠ {escalationCount} escalated
          </span>
        )}
      </div>

      {/* Bottom row — routing + LP dot */}
      <div style={{ paddingLeft: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <RoutingDot status={rule.current_routing_status} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: hColor ?? TEXT_MUT }} />
          {rule.total_hedges_sent > 0 && (
            <span style={{ fontSize: 10, fontFamily: FONT_MONO, color: TEXT_MUT }}>
              {rule.total_hedges_sent} sent
            </span>
          )}
        </div>
      </div>

      {/* Bottom color bar — routing status */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
        backgroundColor: routingColor,
      }} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span style={{ color: TEXT_MUT, fontSize: 13 }}>{msg}</span>
      {sub && <span style={{ color: TEXT_MUT, fontSize: 11 }}>{sub}</span>}
    </div>
  );
}

// ── Info banner ───────────────────────────────────────────────
function InfoBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 4, marginBottom: 12,
      backgroundColor: '#101828', border: '1px solid #1e3a5f',
      fontSize: 11, color: TEXT_SEC, lineHeight: 1.5,
    }}>
      ℹ {msg}
    </div>
  );
}

// ── Warn banner ───────────────────────────────────────────────
function WarnBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 4, marginBottom: 12,
      backgroundColor: '#2a2016', border: `1px solid ${BORDER}`,
      fontSize: 11, color: AMBER, lineHeight: 1.5,
    }}>
      ⚠ {msg}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ENUM OPTION LISTS
// ══════════════════════════════════════════════════════════════
const TRADER_CLASSES: { value: TraderClass; label: string }[] = [
  { value: 'EA',            label: 'EA' },
  { value: 'SCALPER',       label: 'Scalper' },
  { value: 'ARBITRAGE',     label: 'Arbitrage' },
  { value: 'NEWS_TRADER',   label: 'News' },
  { value: 'NORMAL',        label: 'Normal' },
  { value: 'REBATE_ABUSER', label: 'Rebate' },
];

const RISK_COHORTS: { value: string; label: string; color: string }[] = [
  { value: 'CRITICAL', label: 'Critical', color: RED   },
  { value: 'HIGH',     label: 'High',     color: '#e07050' },
  { value: 'MEDIUM',   label: 'Medium',   color: AMBER },
  { value: 'LOW',      label: 'Low',      color: GREEN },
];

const CONDITION_TYPES: { value: ConditionType; label: string }[] = [
  { value: 'NONE',              label: 'None (fires unconditionally)' },
  { value: 'SYMBOL_REALIZED',   label: 'Symbol — Realized P&L' },
  // SYMBOL_UNREALIZED omitted — 17 chars exceeds DB varchar(16); relay to C++ dev to widen column
  { value: 'SYMBOL_COMBINED',   label: 'Symbol — Combined P&L' },
  { value: 'OVERALL_REALIZED',  label: 'Overall — Realized P&L' },
  // OVERALL_UNREALIZED omitted — 18 chars exceeds DB varchar(16); relay to C++ dev to widen column
  { value: 'OVERALL_COMBINED',  label: 'Overall — Combined P&L' },
];

const FINAL_FALLBACK_CFG: Record<FinalFallback, { color: string; label: string; desc: string }> = {
  B_BOOK:       { color: AMBER, label: 'B-Book',         desc: 'Accept broker risk silently' },
  REJECT:       { color: RED,   label: 'Reject',          desc: 'Leave unhedged, no alert' },
  REJECT_NOTIFY:{ color: RED,   label: 'Reject + Notify', desc: 'Leave unhedged + escalation alert (recommended)' },
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export function HedgeRulesPage() {

  // ── Data state ──────────────────────────────────────────────
  const [rules,       setRules]       = useState<HedgeRule[]>([]);
  const [lpHealthMap, setLpHealthMap] = useState<Map<string, LpHealth>>(new Map());
  const [lpOptions,   setLpOptions]   = useState<LpOption[]>([]);
  const [mt5Nodes,    setMt5Nodes]    = useState<Mt5Node[]>([]);
  const [bBookGroups, setBBookGroups] = useState<string[]>([]);

  // ── Selection & mode ────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // ── Form state ──────────────────────────────────────────────
  const [draftRule,   setDraftRule]   = useState<DraftRule>(EMPTY_RULE);
  const [draftSanity, setDraftSanity] = useState<DraftSanity>(EMPTY_SANITY);
  const [sanityIsGlobal,       setSanityIsGlobal]       = useState(false);
  const [sanityOverrideEnabled, setSanityOverrideEnabled] = useState(false);
  const [sanityUnavailable,     setSanityUnavailable]     = useState(false);
  const [isRuleDirty,   setIsRuleDirty]   = useState(false);
  const [isSanityDirty, setIsSanityDirty] = useState(false);

  // ── UI state ────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<'ALL' | RuleStatus>('ACTIVE');
  const [rightTab,     setRightTab]     = useState<'lp_health' | 'route_sanity' | 'escalations'>('lp_health');
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [sanitySaving, setSanitySaving] = useState(false);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [sanityError,  setSanityError]  = useState<string | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

  // ── Escalations state ────────────────────────────────────────
  const [escalations,      setEscalations]      = useState<EscalatedPosition[]>([]);
  const [escalationBusy,   setEscalationBusy]   = useState<Record<number, boolean>>({});

  // ── Calendar / NEWS_EVENT picker state ───────────────────────
  const [calEvents,        setCalEvents]        = useState<CalendarEvent[]>([]);
  const [calLoading,       setCalLoading]       = useState(false);
  const [calSearch,        setCalSearch]        = useState('');
  const [calImportance,    setCalImportance]    = useState<number[]>([2, 3]);
  const [calPickerOpen,    setCalPickerOpen]    = useState(false);
  const [selectedCalEvent, setSelectedCalEvent] = useState<CalendarEvent | null>(null);
  const [mt5Symbols,       setMt5Symbols]       = useState<string[]>([]);

  const mountedRef = useRef(true);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => { if (mountedRef.current) setToast(null); }, 3000);
  }, []);

  // ── Conflict detection ──────────────────────────────────────
  const conflictSet = useMemo(() => detectConflicts(rules), [rules]);

  // ── Filtered list ───────────────────────────────────────────
  const filteredRules = useMemo(() => {
    const src = statusFilter === 'ALL' ? rules : rules.filter(r => r.status === statusFilter);
    return [...src].sort((a, b) => a.priority - b.priority);
  }, [rules, statusFilter]);

  // ══════════════════════════════════════════════════════════
  // DATA LOADING
  // ══════════════════════════════════════════════════════════
  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/hedge/rules');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const data: HedgeRule[] = json.data ?? json ?? [];
      setRules(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch {
      if (mountedRef.current) setLoadError('Could not load strategies');
    }
  }, []);

  const loadLpHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/hedge/lp-health');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const arr: LpHealth[] = json.data ?? json ?? [];
      const map = new Map<string, LpHealth>();
      for (const h of arr) map.set(h.lp_id, h);
      setLpHealthMap(map);
    } catch { /* best effort */ }
  }, []);

  const loadLpOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/fix/admin/lp');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const arr: LpOption[] = json.data?.lps ?? json.lps ?? json.data ?? json ?? [];
      setLpOptions(Array.isArray(arr) ? arr : []);
    } catch { /* silent */ }
  }, []);

  const loadMt5Nodes = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/mt5/nodes');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      // C++ response: { nodes: [...] } — also guard data/array fallbacks
      const arr: Mt5Node[] = json.nodes ?? json.data?.nodes ?? json.data ?? json ?? [];
      setMt5Nodes(Array.isArray(arr) ? arr : []);
    } catch { /* silent */ }
  }, []);

  const loadMt5Symbols = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/symbol-mappings/mt5-symbols');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const syms: { symbol: string }[] = json.symbols ?? [];
      setMt5Symbols(syms.map(s => s.symbol.toUpperCase()));
    } catch { /* silent — freeform entry still works if this fails */ }
  }, []);

  const loadBBookGroups = useCallback(async (nodeId: string) => {
    if (!nodeId) { setBBookGroups([]); return; }
    try {
      const res = await fetch(`/api/v1/mt5/nodes/${nodeId}/books/B/groups`);
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      // C++ response: { groups: [{ assignment_id, group_name, ... }] }
      const groups: { group_name: string }[] = json.groups ?? json.assignments ?? json.data ?? [];
      setBBookGroups(Array.isArray(groups) ? groups.map(g => g.group_name) : []);
    } catch { setBBookGroups([]); }
  }, []);

  const loadEscalations = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/hedge/positions/escalated');
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const arr: EscalatedPosition[] = json.data ?? json ?? [];
      setEscalations(Array.isArray(arr) ? arr : []);
    } catch { /* best effort */ }
  }, []);

  const loadCalendarEvents = useCallback(async () => {
    setCalLoading(true);
    try {
      const today = new Date();
      const from  = today.toISOString().slice(0, 10);
      const to    = new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
      const imp   = calImportance.join(',');
      const res   = await fetch(`/api/v1/calendar/events?importance=${imp}&from=${from}&to=${to}&limit=500`);
      if (!res.ok || !mountedRef.current) return;
      const json  = await res.json();
      const arr: CalendarEvent[] = Array.isArray(json) ? json : json.data ?? [];
      setCalEvents(arr);
    } catch { /* best effort */ }
    finally { if (mountedRef.current) setCalLoading(false); }
  }, [calImportance]);

  const loadSingleCalEvent = useCallback(async (calId: string) => {
    if (!calId) { setSelectedCalEvent(null); return; }
    try {
      const res = await fetch(`/api/v1/calendar/events/${calId}`);
      if (!res.ok || !mountedRef.current) return;
      const json = await res.json();
      const evt: CalendarEvent = json.data ?? json;
      if (evt && evt.calendar_id) setSelectedCalEvent(evt);
    } catch { /* best effort */ }
  }, []);

  const loadSanityConfig = useCallback(async (ruleId: number) => {
    setSanityUnavailable(false);
    setSanityIsGlobal(false);
    setSanityOverrideEnabled(false);
    try {
      const res = await fetch(`/api/v1/hedge/rules/${ruleId}/sanity-config`);
      if (!mountedRef.current) return;
      if (res.status === 404) {
        setSanityUnavailable(false);
        setDraftSanity(EMPTY_SANITY);
        return;
      }
      if (!res.ok) {
        setSanityUnavailable(true);
        return;
      }
      const json = await res.json();
      const cfg: SanityConfig = json.data ?? json;
      setDraftSanity(draftSanityFromConfig(cfg));
      setSanityIsGlobal(cfg.is_global_default);
      setSanityOverrideEnabled(!cfg.is_global_default);
    } catch {
      setSanityUnavailable(true);
    }
  }, []);

  // ── Mount effects ───────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    loadLpOptions();
    loadMt5Nodes();
    loadMt5Symbols();
    const saved = sessionStorage.getItem(SS_KEY);
    if (saved) setSelectedId(parseInt(saved, 10));
    return () => { mountedRef.current = false; };
  }, [loadLpOptions, loadMt5Nodes, loadMt5Symbols]);

  // 30s rules poll
  useEffect(() => {
    setLoading(true);
    loadRules().finally(() => { if (mountedRef.current) setLoading(false); });
    const t = setInterval(loadRules, 30_000);
    return () => clearInterval(t);
  }, [loadRules]);

  // 5s LP health poll
  useEffect(() => {
    loadLpHealth();
    const t = setInterval(loadLpHealth, 5_000);
    return () => clearInterval(t);
  }, [loadLpHealth]);

  // 10s escalation poll
  useEffect(() => {
    loadEscalations();
    const t = setInterval(loadEscalations, 10_000);
    return () => clearInterval(t);
  }, [loadEscalations]);

  // Reload calendar events when importance filter changes — only if picker was previously opened
  useEffect(() => {
    if (calEvents.length > 0) loadCalendarEvents();
  }, [calImportance]); // eslint-disable-line react-hooks/exhaustive-deps

  // When selecting an existing rule with te_calendar_id, resolve the event for display
  useEffect(() => {
    if (draftRule.te_calendar_id) {
      loadSingleCalEvent(draftRule.te_calendar_id);
    } else {
      setSelectedCalEvent(null);
    }
  }, [draftRule.te_calendar_id, loadSingleCalEvent]);

  // Selection change OR rules refresh → sync draft from backend data
  const prevSelectedIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId === null) { sessionStorage.removeItem(SS_KEY); prevSelectedIdRef.current = null; return; }
    sessionStorage.setItem(SS_KEY, String(selectedId));
    const rule = rules.find(r => r.rule_id === selectedId);
    const isNewSelection = selectedId !== prevSelectedIdRef.current;
    prevSelectedIdRef.current = selectedId;
    if (rule && (isNewSelection || !isRuleDirty)) {
      setDraftRule(draftFromRule(rule));
      if (isNewSelection) {
        setIsRuleDirty(false);
        setIsSanityDirty(false);
        setSaveError(null);
        loadSanityConfig(selectedId);
      }
    }
  }, [selectedId, rules]); // eslint-disable-line react-hooks/exhaustive-deps

  // Master node — declared here so all effects below can reference it safely
  const masterNode = mt5Nodes.find(n => n.node_type === 'MASTER' && n.is_enabled)
                  ?? mt5Nodes.find(n => n.is_enabled); // fallback: first enabled node

  // Load B-Book groups from master node whenever it is available
  useEffect(() => {
    if (masterNode) loadBBookGroups(String(masterNode.id));
    else setBBookGroups([]);
  }, [masterNode, loadBBookGroups]);

  // Sync sanity lp_id with primary LP
  useEffect(() => {
    if (draftRule.hedging_lp_id && draftSanity.lp_id !== draftRule.hedging_lp_id) {
      setDraftSanity(s => ({ ...s, lp_id: draftRule.hedging_lp_id }));
    }
  }, [draftRule.hedging_lp_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always keep mt5_server_id in sync with the master node.
  // Covers: new strategies, existing rules with empty mt5_servers[], late node loads.
  useEffect(() => {
    if (masterNode && draftRule.mt5_server_id !== String(masterNode.id)) {
      setDraftRule(d => ({ ...d, mt5_server_id: String(masterNode.id) }));
    }
  }, [masterNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ══════════════════════════════════════════════════════════
  // HANDLERS
  // ══════════════════════════════════════════════════════════
  const handleSelectRule = useCallback((id: number) => {
    setIsCreating(false);
    setSelectedId(id);
  }, []);

  const handleNewStrategy = useCallback(() => {
    setSelectedId(null);
    setIsCreating(true);
    setDraftRule({ ...EMPTY_RULE, mt5_server_id: masterNode ? String(masterNode.id) : '' });
    setDraftSanity(EMPTY_SANITY);
    setSanityIsGlobal(false);
    setSanityOverrideEnabled(false);
    setSanityUnavailable(false);
    setIsRuleDirty(false);
    setIsSanityDirty(false);
    setSaveError(null);
  }, [masterNode]);

  const handleCancel = useCallback(() => {
    setIsCreating(false);
    if (selectedId !== null) {
      const rule = rules.find(r => r.rule_id === selectedId);
      if (rule) { setDraftRule(draftFromRule(rule)); setIsRuleDirty(false); setSaveError(null); }
    }
  }, [selectedId, rules]);

  const setRule = useCallback((patch: Partial<DraftRule>) => {
    setDraftRule(d => ({ ...d, ...patch }));
    setIsRuleDirty(true);
  }, []);

  const handleOpenCalPicker = useCallback(() => {
    if (calEvents.length === 0) loadCalendarEvents();
    setCalPickerOpen(true);
  }, [calEvents.length, loadCalendarEvents]);

  const handleSelectCalEvent = useCallback((evt: CalendarEvent) => {
    setSelectedCalEvent(evt);
    setRule({ te_calendar_id: evt.calendar_id });
    setCalPickerOpen(false);
    setCalSearch('');
  }, [setRule]);

  const handleClearCalEvent = useCallback(() => {
    setSelectedCalEvent(null);
    setRule({ te_calendar_id: '' });
  }, [setRule]);

  const setSanity = useCallback((patch: Partial<DraftSanity>) => {
    setDraftSanity(d => ({ ...d, ...patch }));
    setIsSanityDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draftRule.name.trim()) { setSaveError('Strategy name is required.'); return; }
    if (!draftRule.hedging_lp_id) { setSaveError('Primary LP is required.'); return; }
    if (draftRule.activation_type === 'NEWS_EVENT' && !draftRule.te_calendar_id) {
      setSaveError('An economic event must be selected for NEWS_EVENT activation.'); return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (isCreating) {
        const body = ruleToApiBody(draftRule);
        console.log('[HedgingStrategies] POST /api/v1/hedge/rules payload:', JSON.stringify(body, null, 2));
        const res = await fetch('/api/v1/hedge/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { setSaveError(json.error ?? `Error ${res.status}`); return; }
        const newId: number = json.rule_id;
        await loadRules();
        setIsCreating(false);
        setSelectedId(newId);
        showToast('Strategy created');
      } else if (selectedId !== null) {
        const body = ruleToApiBody(draftRule);
        console.log(`[HedgingStrategies] PUT /api/v1/hedge/rules/${selectedId} payload:`, JSON.stringify(body, null, 2));
        const res = await fetch(`/api/v1/hedge/rules/${selectedId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) { setSaveError(json.error ?? `Error ${res.status}`); return; }
        setIsRuleDirty(false);
        await loadRules();
        showToast('Strategy saved');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [isCreating, selectedId, draftRule, loadRules, showToast]);

  const handleStatusAction = useCallback(async (action: 'activate' | 'pause' | 'stop') => {
    if (selectedId === null) return;
    try {
      const res = await fetch(`/api/v1/hedge/rules/${selectedId}/${action}`, { method: 'POST' });
      if (!res.ok) { const j = await res.json(); showToast(`Error: ${j.error ?? res.status}`); return; }
      setIsRuleDirty(false);
      await loadRules();
      showToast(`Strategy ${action}d`);
    } catch { showToast('Action failed'); }
  }, [selectedId, loadRules, showToast]);

  const handleDelete = useCallback(async () => {
    if (selectedId === null) return;
    const rule = rules.find(r => r.rule_id === selectedId);
    if (!confirm(`Delete "${rule?.name ?? selectedId}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/hedge/rules/${selectedId}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); showToast(`Error: ${j.error ?? res.status}`); return; }
      setSelectedId(null);
      setIsCreating(false);
      await loadRules();
      showToast('Strategy deleted');
    } catch { showToast('Delete failed'); }
  }, [selectedId, rules, loadRules, showToast]);

  const handleRevertSanity = useCallback(async () => {
    if (selectedId === null) return;
    if (!confirm('Remove per-rule route config and revert to global default?')) return;
    try {
      const res = await fetch(`/api/v1/hedge/rules/${selectedId}/sanity-config`, { method: 'DELETE' });
      if (res.ok) {
        setSanityOverrideEnabled(false);
        setSanityIsGlobal(true);
        setIsSanityDirty(false);
        await loadSanityConfig(selectedId);
        showToast('Reverted to global default');
      }
    } catch { /* silent */ }
  }, [selectedId, loadSanityConfig, showToast]);

  const handleSanitySave = useCallback(async () => {
    if (selectedId === null) return;
    setSanitySaving(true);
    setSanityError(null);
    try {
      const res = await fetch(`/api/v1/hedge/rules/${selectedId}/sanity-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanityToApiBody(draftSanity)),
      });
      const json = await res.json();
      if (!res.ok) { setSanityError(json.error ?? `Error ${res.status}`); return; }
      setIsSanityDirty(false);
      setSanityIsGlobal(false);
      setSanityOverrideEnabled(true);
      showToast('Route config saved');
    } catch (err) {
      setSanityError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      if (mountedRef.current) setSanitySaving(false);
    }
  }, [selectedId, draftSanity, showToast]);

  const handleEscalationAction = useCallback(async (
    recordId: number,
    action: 'retry' | 'force-close' | 'bbook' | 'acknowledge',
    lpPositionId: string | null,
  ) => {
    if (action === 'force-close' && !lpPositionId) return; // guard — endpoint will reject
    setEscalationBusy(b => ({ ...b, [recordId]: true }));
    try {
      const res = await fetch(`/api/v1/hedge/positions/${recordId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operator: 'manager' }),
      });
      const json = await res.json();
      if (!res.ok) { showToast(`Error: ${json.error ?? res.status}`); return; }
      await loadEscalations(); // refresh immediately after action
      showToast(`Position ${recordId} — ${action} sent`);
    } catch { showToast('Action failed'); }
    finally { setEscalationBusy(b => { const n = { ...b }; delete n[recordId]; return n; }); }
  }, [loadEscalations, showToast]);

  // ══════════════════════════════════════════════════════════
  // DERIVED
  // ══════════════════════════════════════════════════════════
  const selectedRule = rules.find(r => r.rule_id === selectedId) ?? null;
  const panelVisible = isCreating || selectedId !== null;
  const isEditMode   = !isCreating && selectedId !== null;
  const isDirtyAny   = isRuleDirty; // sanity saves independently in right panel
  const activeCount  = rules.filter(r => r.status === 'ACTIVE').length;
  const enabledLps   = lpOptions.filter(l => l.enabled);
  const totalEscalations = escalations.length;

  // Per-rule escalation counts for card badges
  const escalationsByRule = useMemo(() => {
    const map = new Map<number, number>();
    for (const e of escalations) {
      if (e.rule_id !== null) map.set(e.rule_id, (map.get(e.rule_id) ?? 0) + 1);
    }
    return map;
  }, [escalations]);

  // Escalations filtered to currently selected rule
  const ruleEscalations = useMemo(() =>
    selectedId !== null ? escalations.filter(e => e.rule_id === selectedId) : [],
  [escalations, selectedId]);

  // ── Completeness checklist — drives the "what's left to complete" banner
  //    at the top of the middle panel. Each item reports done/total for a
  //    logical section; done items turn green, missing ones stay amber.
  const completeness = useMemo(() => {
    const d = draftRule;
    const needsNewsEvent  = d.activation_type === 'NEWS_EVENT';
    const needsSchedule   = d.activation_type === 'SCHEDULE';
    const needsPnlTrigger = d.activation_type === 'PNL_TRIGGER';
    const needsGuard      = d.condition_type !== 'NONE';
    const hasEnabledNode  = mt5Nodes.some(n => n.is_enabled);

    const items: { key: string; label: string; done: boolean; required: boolean }[] = [
      { key: 'name',      label: 'Strategy name',      done: d.name.trim().length > 0,                      required: true },
      { key: 'source',    label: 'MT5 server',         done: hasEnabledNode,                                 required: true },
      { key: 'scope',     label: 'Scope (groups/logins/cohorts)', done: d.groups.length > 0 || d.login_ids.trim().length > 0 || d.trader_classifications.length > 0, required: false },
      { key: 'symbols',   label: 'Symbols',            done: d.symbols.length > 0,                          required: false },
      { key: 'volume',    label: 'Hedge volume %',     done: parseFloat(d.hedge_volume_pct) > 0,            required: true },
      { key: 'lp',        label: 'Primary LP',         done: d.hedging_lp_id.length > 0,                    required: true },
      { key: 'activation',label: `Activation (${d.activation_type.replace('_', ' ')})`,
        done: d.activation_type === 'ALWAYS' || d.activation_type === 'MANUAL'
              || (needsSchedule   && d.schedule_days > 0 && d.schedule_time_from !== '' && d.schedule_time_to !== '')
              || (needsNewsEvent  && d.te_calendar_id.length > 0)
              || (needsPnlTrigger && d.activation_value.length > 0),
        required: true },
      ...(needsGuard ? [{ key: 'guard', label: 'Guard threshold', done: d.condition_value.length > 0, required: true }] : []),
    ];
    const requiredItems = items.filter(i => i.required);
    const requiredDone  = requiredItems.filter(i => i.done).length;
    const optionalDone  = items.filter(i => !i.required && i.done).length;
    const allRequiredDone = requiredDone === requiredItems.length;
    return {
      items,
      requiredDone,
      requiredTotal: requiredItems.length,
      optionalDone,
      optionalTotal: items.filter(i => !i.required).length,
      allRequiredDone,
    };
  }, [draftRule, mt5Nodes]);

  // ══════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: BG_PAGE }}>

      {/* ── Page header ──────────────────────────────────────── */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${BORDER_HDR}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: TEXT_PRI, margin: 0 }}>Hedging Strategies</h1>
          <p style={{ fontSize: 11, color: TEXT_SEC, margin: '2px 0 0' }}>
            Define and control exposure routing from executed client trades
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
            <span style={{ color: TEXT_SEC }}>Strategies: <span style={{ color: TEXT_PRI, fontFamily: FONT_MONO }}>{rules.length}</span></span>
            <span style={{ color: TEXT_MUT }}>·</span>
            <span style={{ color: TEXT_SEC }}>Active: <span style={{ color: GREEN, fontFamily: FONT_MONO }}>{activeCount}</span></span>
            {conflictSet.size > 0 && (
              <>
                <span style={{ color: TEXT_MUT }}>·</span>
                <span style={{ color: AMBER, fontFamily: FONT_MONO }}>⚠ {Math.ceil(conflictSet.size / 2)} overlap{conflictSet.size > 2 ? 's' : ''}</span>
              </>
            )}
            {totalEscalations > 0 && (
              <>
                <span style={{ color: TEXT_MUT }}>·</span>
                <span style={{
                  padding: '2px 8px', borderRadius: 3, fontWeight: 600,
                  backgroundColor: BADGE.critical.bg, color: BADGE.critical.color,
                  border: `1px solid ${BADGE.critical.border}`,
                  fontFamily: FONT_MONO,
                }}>
                  ⚠ {totalEscalations} escalated (all strategies)
                </span>
              </>
            )}
          </div>
          {toast && (
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11,
              backgroundColor: BG_FIELD, color: GREEN, border: `1px solid ${BORDER}`,
            }}>
              ✓ {toast}
            </span>
          )}
          <button
            onClick={handleNewStrategy}
            disabled={isCreating}
            style={{
              padding: '5px 14px', borderRadius: 4, cursor: isCreating ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 600,
              backgroundColor: isCreating ? BG_FIELD : BG_FIELD,
              border: `1px solid ${isCreating ? TEAL + '33' : TEAL}`,
              color: isCreating ? TEAL + '88' : TEAL,
            }}
          >
            + New Strategy
          </button>
        </div>
      </div>

      {/* ── Load error banner ─────────────────────────────────── */}
      {loadError && (
        <div style={{
          padding: '6px 16px', borderBottom: `1px solid #7a2f36`,
          backgroundColor: '#2c1417', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: RED }}>⚠ {loadError}</span>
          <button onClick={loadRules} style={{ fontSize: 11, color: RED, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ════════════════════════════════════════════════════
            LEFT PANEL — Strategy list
        ════════════════════════════════════════════════════ */}
        <div style={{
          width: 380, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${BORDER_MD}`, overflow: 'hidden',
          backgroundColor: BG_PANEL,
        }}>
          {/* Status filter tabs */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${BORDER}`,
            backgroundColor: '#2a292c', flexShrink: 0,
          }}>
            {(['ACTIVE', 'PAUSED', 'STOPPED', 'ALL'] as const).map(f => {
              const isActive = statusFilter === f;
              return (
                <button key={f} onClick={() => setStatusFilter(f)} style={{
                  flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
                  fontSize: 11, letterSpacing: '0.04em', fontWeight: 500,
                  backgroundColor: 'transparent',
                  borderBottom: isActive ? `2px solid ${TEAL}` : '2px solid transparent',
                  color: isActive ? TEAL : TEXT_SEC,
                  transition: 'color 0.1s',
                }}>
                  {f}
                </button>
              );
            })}
          </div>

          {/* Cards */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && filteredRules.length === 0 ? (
              <EmptyState msg="Loading…" />
            ) : filteredRules.length === 0 ? (
              <EmptyState msg="No strategies" sub={statusFilter !== 'ALL' ? `No ${statusFilter} strategies` : 'Create one to get started'} />
            ) : (
              filteredRules.map(r => (
                <StrategyCard
                  key={r.rule_id}
                  rule={r}
                  selected={r.rule_id === selectedId}
                  hasConflict={conflictSet.has(r.rule_id)}
                  escalationCount={escalationsByRule.get(r.rule_id) ?? 0}
                  lpHealthMap={lpHealthMap}
                  onClick={() => handleSelectRule(r.rule_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            MIDDLE PANEL — Hedge Strategy Settings (widened — primary workspace)
        ════════════════════════════════════════════════════ */}
        <div style={{
          width: 860, flexShrink: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRight: `1px solid ${BORDER_MD}`,
        }}>

          {!panelVisible ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: BG_SECTION, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: TEAL }}>
                ⇌
              </div>
              <span style={{ color: TEXT_MUT, fontSize: 13 }}>Select a strategy to view or edit</span>
              <span style={{ color: TEXT_MUT, fontSize: 11 }}>or click + New Strategy to define one</span>
            </div>
          ) : (
            <>
              {/* ── Detail header ───────────────────────────────── */}
              <div style={{
                padding: '10px 16px', borderBottom: `1px solid ${BORDER_MD}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexShrink: 0, backgroundColor: BG_PANEL,
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT_PRI }}>
                    {isCreating ? 'New Strategy' : (selectedRule?.name ?? '—')}
                  </div>
                  {isEditMode && selectedRule && (
                    <div style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO, marginTop: 2 }}>
                      Rule #{selectedRule.rule_id} · Updated {new Date(selectedRule.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {/* Status actions — edit mode only */}
                  {isEditMode && selectedRule && (
                    <>
                      {selectedRule.status !== 'ACTIVE'  && <ActionBtn label="Activate" color={GREEN} onClick={() => handleStatusAction('activate')} />}
                      {selectedRule.status === 'ACTIVE'  && (
                        <button onClick={() => handleStatusAction('pause')} style={{
                          padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
                          fontSize: 11, fontWeight: 600,
                          backgroundColor: '#313032', border: `1px solid ${BADGE.high.border}`, color: BADGE.high.color,
                        }}>Pause</button>
                      )}
                      {selectedRule.status !== 'STOPPED' && <ActionBtn label="Stop"     color={RED}   onClick={() => handleStatusAction('stop')} />}
                      <span style={{ width: 1, height: 20, backgroundColor: BORDER_MD }} />
                      <ActionBtn label="Delete" color={RED} onClick={handleDelete} />
                      <span style={{ width: 1, height: 20, backgroundColor: BORDER_MD }} />
                    </>
                  )}
                  {/* Cancel */}
                  {(isDirtyAny || isCreating) && (
                    <button onClick={handleCancel} style={{
                      padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                      fontSize: 12,
                      background: 'none', border: `1px solid ${BORDER_MD}`, color: TEXT_SEC,
                    }}>
                      Cancel
                    </button>
                  )}
                  {/* Save */}
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: '5px 16px', borderRadius: 4, cursor: saving ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: 600,
                    backgroundColor: isDirtyAny || isCreating ? BG_FIELD : 'transparent',
                    border: `1px solid ${isDirtyAny || isCreating ? TEAL : BORDER}`,
                    color: isDirtyAny || isCreating ? TEAL : TEXT_MUT,
                    opacity: saving ? 0.6 : 1,
                  }}>
                    {saving ? 'Saving…' : isCreating ? 'Create Strategy' : (isDirtyAny ? '● Save Changes' : 'Saved')}
                  </button>
                </div>
              </div>

              {/* ── Save error ─────────────────────────────────── */}
              {saveError && (
                <div style={{
                  padding: '6px 16px', borderBottom: `1px solid #7a2f36`,
                  backgroundColor: '#2c1417', fontSize: 11, color: RED, flexShrink: 0,
                }}>
                  ⚠ {saveError}
                </div>
              )}

              {/* ── Completeness progress ──────────────────────── */}
              <div style={{
                padding: '10px 16px', borderBottom: `1px solid ${BORDER}`,
                backgroundColor: BG_SECTION,
                border: `1px solid ${BORDER}`,
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ 
                    fontSize: 12, 
                    color: completeness.allRequiredDone ? GREEN : AMBER, 
                    fontWeight: 600,
                  }}>
                    {completeness.allRequiredDone ? '✓ Strategy complete' : 'Setup progress'}
                  </span>
                  <span style={{ fontSize: 11, color: TEXT_SEC }}>
                    <span style={{ color: completeness.allRequiredDone ? GREEN : AMBER, fontFamily: FONT_MONO }}>
                      {completeness.requiredDone}/{completeness.requiredTotal}
                    </span> required
                    {completeness.optionalTotal > 0 && (
                      <span>
                        {' · '}
                        <span style={{ color: completeness.optionalDone > 0 ? GREEN : TEXT_MUT, fontFamily: FONT_MONO }}>
                          {completeness.optionalDone}/{completeness.optionalTotal}
                        </span> optional
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {completeness.items.map(item => (
                    <span key={item.key} style={{
                      padding: '2px 6px', borderRadius: 3, fontSize: 10,
                      backgroundColor: item.done ? BG_FIELD : (item.required ? BG_FIELD : BG_FIELD),
                      border: `1px solid ${BORDER}`,
                      color: item.done ? GREEN : (item.required ? AMBER : TEXT_MUT),
                    }}>
                      {item.done ? '✓' : (item.required ? '○' : '◦')} {item.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* ── Scrollable form ────────────────────────────── */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

                {/* ─────────────────────────────────────────────────
                    SECTION 1 — Identity & Status
                ───────────────────────────────────────────────── */}
                <SectionCard n={1} label="Identity & Status">
                  <FormRow label="Strategy Name" required>
                    <input
                      value={draftRule.name}
                      onChange={e => setRule({ name: e.target.value })}
                      placeholder="e.g. Hedge 60% — Scalper Group (Major FX)"
                      style={inputStyle}
                    />
                  </FormRow>
                  <FormRow label="Description" hint="optional">
                    <textarea
                      value={draftRule.description}
                      onChange={e => setRule({ description: e.target.value })}
                      placeholder="Describe the intent and scope of this strategy"
                      rows={2}
                      style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                    />
                  </FormRow>
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 12 }}>
                    <FormRow label="Priority" hint="lower = first">
                      <input
                        type="number" min={1} value={draftRule.priority}
                        onChange={e => setRule({ priority: parseInt(e.target.value, 10) || 1 })}
                        style={inputStyle}
                      />
                    </FormRow>
                    <FormRow label="Status">
                      <select value={draftRule.status} onChange={e => setRule({ status: e.target.value as RuleStatus })} style={selectStyle}>
                        <option value="ACTIVE">Active</option>
                        <option value="PAUSED">Paused</option>
                        <option value="STOPPED">Stopped</option>
                      </select>
                    </FormRow>
                    {isEditMode && selectedRule && (
                      <FormRow label="Routing Status">
                        <div style={{ padding: '7px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: BG_FIELD, display: 'flex', alignItems: 'center' }}>
                          <RoutingDot status={selectedRule.current_routing_status} />
                        </div>
                      </FormRow>
                    )}
                  </div>
                </SectionCard>

                {/* ─────────────────────────────────────────────────
                    SECTION 2 — Source Targeting
                ───────────────────────────────────────────────── */}
                <SectionCard n={2} label="Source Targeting">
                  <InfoBanner msg="Empty selections match all within B-Book scope. Groups must already be assigned to B-Book in MT5 Server configuration." />

                  {/* MT5 Server — always the Master node, shown as static (not a dropdown) */}
                  <FormRow label="MT5 Server" required hint="strategies always target the Master node">
                    {masterNode ? (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 12px', borderRadius: 4,
                        backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`,
                      }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, backgroundColor:
                          masterNode.connection_status === 'CONNECTED' ? GREEN :
                          masterNode.connection_status === 'DEGRADED'  ? AMBER : RED,
                        }} />
                        <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: TEXT_PRI, fontWeight: 500 }}>
                          {masterNode.node_name}
                        </span>
                        <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_MUT }}>
                          {masterNode.node_type}
                        </span>
                        <span style={{
                          marginLeft: 'auto', fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600,
                          color: masterNode.connection_status === 'CONNECTED' ? GREEN : AMBER,
                        }}>
                          {masterNode.connection_status}
                        </span>
                      </div>
                    ) : (
                      <div style={{ padding: '7px 12px', borderRadius: 4, backgroundColor: BG_FIELD, border: `1px solid ${BORDER}` }}>
                        <span style={{ fontSize: 12, color: TEXT_MUT }}>
                          No enabled MT5 node — configure one in MT5 Servers
                        </span>
                      </div>
                    )}
                  </FormRow>

                  {/* B-Book Groups */}
                  <FormRow label="B-Book Groups" hint={masterNode ? `${bBookGroups.length} B-Book group${bBookGroups.length !== 1 ? 's' : ''} on ${masterNode.node_name}` : 'loading…'}>
                    {bBookGroups.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {bBookGroups.map(g => {
                          const active = draftRule.groups.includes(g);
                          return (
                            <button key={g} onClick={() => setRule({ groups: active ? draftRule.groups.filter(x => x !== g) : [...draftRule.groups, g] })} style={{
                              padding: '2px 9px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                              border: `1px solid ${active ? TEAL : BORDER}`,
                              backgroundColor: active ? BG_FIELD : BG_FIELD,
                              color: active ? TEAL : TEXT_SEC,
                            }}>
                              {g.split('\\').pop() ?? g}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '6px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: BG_FIELD }}>
                        <span style={{ fontSize: 11, color: TEXT_MUT }}>
                          {masterNode ? 'No B-Book groups assigned on this server' : 'Loading…'}
                        </span>
                      </div>
                    )}
                    {draftRule.groups.length === 0 && bBookGroups.length > 0 && (
                      <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT }}>
                        None selected — strategy applies to all B-Book groups
                      </div>
                    )}
                  </FormRow>

                  {/* Login IDs */}
                  <FormRow label="Target Login IDs" hint="comma-separated integers · bypasses group selection · empty = use group targeting">
                    <input
                      value={draftRule.login_ids}
                      onChange={e => setRule({ login_ids: e.target.value })}
                      placeholder="e.g. 100234, 100567, 100891"
                      style={{ ...inputStyle, fontFamily: FONT_MONO }}
                    />
                  </FormRow>

                  {/* Cohort targeting separator */}
                  <div style={{ margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    <span style={{ fontSize: 10, color: TEXT_MUT, letterSpacing: '0.06em' }}>COHORT TARGETING</span>
                    <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                  </div>

                  {/* Classified cohorts */}
                  <FormRow label="Classified Cohorts" hint="behavioural classification · empty = all">
                    <ToggleChips<TraderClass>
                      options={TRADER_CLASSES}
                      selected={draftRule.trader_classifications}
                      onChange={v => setRule({ trader_classifications: v })}
                    />
                  </FormRow>

                  {/* Risk cohorts — display only, pending separate risk level API */}
                  <FormRow label="Risk Cohorts" hint="pending risk level API integration">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {RISK_COHORTS.map(rc => (
                        <span key={rc.value} title="Risk cohort targeting — pending API" style={{
                          padding: '3px 10px', borderRadius: 3, fontSize: 11,
                          border: `1px solid ${BORDER}`, color: TEXT_MUT, opacity: 0.5, cursor: 'not-allowed',
                        }}>
                          {rc.label}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT }}>
                      Coming soon — requires risk level endpoint
                    </div>
                  </FormRow>

                  {/* Cluster IDs */}
                  <FormRow label="HDBSCAN Cluster IDs" hint="comma-separated integers · empty = ignore clustering · requires GET /api/v1/risk/clusters">
                    <input
                      value={draftRule.cluster_ids}
                      onChange={e => setRule({ cluster_ids: e.target.value })}
                      placeholder="e.g. 3, 7, 12  (relay to C++ dev: GET /api/v1/risk/clusters needed)"
                      style={{ ...inputStyle, fontFamily: FONT_MONO }}
                    />
                  </FormRow>
                </SectionCard>

                {/* ─────────────────────────────────────────────────
                    SECTION 3 — Instrument Targeting
                ───────────────────────────────────────────────── */}
                <SectionCard n={3} label="Instrument Targeting">
                  <FormRow label="Symbols" hint="type + Enter or comma · empty = all symbols">
                    <ChipInput
                      chips={draftRule.symbols}
                      onChange={v => setRule({ symbols: v })}
                      placeholder="Type a symbol name and press Enter…"
                      suggestions={mt5Symbols}
                      validEntries={mt5Symbols}
                    />
                    {draftRule.symbols.length === 0 && (
                      <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT }}>
                        No symbols selected — strategy applies to all instruments
                      </div>
                    )}
                  </FormRow>

                  <FormRow label="Direction">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['LONG', 'BOTH', 'SHORT'] as Direction[]).map(d => (
                        <button key={d} onClick={() => setRule({ direction: d })} style={{
                          flex: 1, padding: '6px 0', borderRadius: 4, cursor: 'pointer',
                          fontSize: 12, fontWeight: draftRule.direction === d ? 600 : 400,
                          border: `1px solid ${draftRule.direction === d ? TEAL : BORDER}`,
                          backgroundColor: draftRule.direction === d ? BG_FIELD : BG_FIELD,
                          color: draftRule.direction === d ? TEAL : TEXT_SEC,
                        }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </FormRow>
                </SectionCard>

                {/* ─────────────────────────────────────────────────
                    SECTION 4 — Execution Parameters
                ───────────────────────────────────────────────── */}
                <SectionCard n={4} label="Execution Parameters">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <FormRow label="Hedge Volume %" hint="100 = full hedge · >100 = over-hedge" required>
                      <input
                        type="number" min={0} step={5} value={draftRule.hedge_volume_pct}
                        onChange={e => setRule({ hedge_volume_pct: e.target.value })}
                        style={inputStyle}
                      />
                    </FormRow>
                    <FormRow label="Confirm Timeout" hint="ms">
                      <input
                        type="number" min={1000} step={500} value={draftRule.hedge_confirm_timeout_ms}
                        onChange={e => setRule({ hedge_confirm_timeout_ms: e.target.value })}
                        style={inputStyle}
                      />
                    </FormRow>
                  </div>

                  <FormRow label="Primary LP" required>
                    <select value={draftRule.hedging_lp_id} onChange={e => setRule({ hedging_lp_id: e.target.value })} style={selectStyle}>
                      <option value="">— Select LP —</option>
                      {enabledLps.map(lp => (
                        <option key={lp.lp_id} value={lp.lp_id}>{lp.lp_name}</option>
                      ))}
                    </select>
                    {draftRule.hedging_lp_id && (
                      <div style={{ marginTop: 5 }}>
                        <LpHealthInline health={lpHealthMap.get(draftRule.hedging_lp_id)} />
                      </div>
                    )}
                  </FormRow>

                  <FormRow label="LP Sub-Account" hint="optional · leave empty for LP default">
                    <input
                      value={draftRule.lp_account_id}
                      onChange={e => setRule({ lp_account_id: e.target.value })}
                      placeholder="LP account ID (optional)"
                      style={inputStyle}
                    />
                  </FormRow>

                  {/* Guard clause */}
                  <div style={{ margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    <span style={{ fontSize: 10, color: TEXT_MUT, letterSpacing: '0.06em' }}>GUARD CLAUSE</span>
                    <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                  </div>

                  <FormRow label="Condition Type" hint="evaluated per incoming position against hot-cached P&L">
                    <select value={draftRule.condition_type} onChange={e => setRule({ condition_type: e.target.value as ConditionType })} style={selectStyle}>
                      {CONDITION_TYPES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </FormRow>

                  {draftRule.condition_type !== 'NONE' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
                      <FormRow label="Operator">
                        <select value={draftRule.condition_operator} onChange={e => setRule({ condition_operator: e.target.value })} style={selectStyle}>
                          <option value="LT">&lt; Less than</option>
                          <option value="LTE">≤ Less or equal</option>
                          <option value="GT">&gt; Greater than</option>
                          <option value="GTE">≥ Greater or equal</option>
                        </select>
                      </FormRow>
                      <FormRow label="Threshold (USD)" required>
                        <input
                          type="number" step={100} value={draftRule.condition_value}
                          onChange={e => setRule({ condition_value: e.target.value })}
                          placeholder="e.g. -5000"
                          style={inputStyle}
                        />
                      </FormRow>
                    </div>
                  )}
                </SectionCard>

                {/* ─────────────────────────────────────────────────
                    SECTION 5 — Activation Window
                ───────────────────────────────────────────────── */}
                <SectionCard n={5} label="Activation Window">
                  <FormRow label="Activation Type">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(['ALWAYS', 'SCHEDULE', 'NEWS_EVENT', 'PNL_TRIGGER', 'MANUAL'] as ActivationType[]).map(t => {
                        const isActive = draftRule.activation_type === t;
                        return (
                          <button
                            key={t}
                            onClick={() => {
                              setRule({ activation_type: t });
                              if (t !== 'NEWS_EVENT') {
                                setCalPickerOpen(false);
                              }
                            }}
                            style={{
                              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                              fontSize: 11,
                              border: `1px solid ${isActive ? TEAL : BORDER}`,
                              backgroundColor: isActive ? BG_FIELD : BG_FIELD,
                              color: isActive ? TEAL : TEXT_SEC,
                            }}
                          >
                            {t.replace('_', ' ')}
                          </button>
                        );
                      })}
                    </div>
                  </FormRow>

                  {/* SCHEDULE fields */}
                  {draftRule.activation_type === 'SCHEDULE' && (
                    <>
                      <FormRow label="Active Days">
                        <DayPicker value={draftRule.schedule_days} onChange={v => setRule({ schedule_days: v })} />
                      </FormRow>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <FormRow label="Time From (UTC)">
                          <input type="time" value={draftRule.schedule_time_from} onChange={e => setRule({ schedule_time_from: e.target.value })} style={inputStyle} />
                        </FormRow>
                        <FormRow label="Time To (UTC)">
                          <input type="time" value={draftRule.schedule_time_to} onChange={e => setRule({ schedule_time_to: e.target.value })} style={inputStyle} />
                        </FormRow>
                      </div>
                    </>
                  )}

                  {/* NEWS_EVENT fields */}
                  {draftRule.activation_type === 'NEWS_EVENT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* Selected event display / picker trigger */}
                      {selectedCalEvent && selectedCalEvent.calendar_id === draftRule.te_calendar_id ? (
                        <div style={{
                          backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`,
                          borderRadius: 5, padding: '10px 12px',
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: TEAL, fontWeight: 600 }}>
                                {selectedCalEvent.event_name}
                              </span>
                              <ImpStars v={selectedCalEvent.importance} />
                              <span style={{
                                fontSize: 10, fontFamily: FONT_MONO, padding: '1px 6px', borderRadius: 2,
                                backgroundColor: selectedCalEvent.status === 'SCHEDULED' ? BG_FIELD : '#2a2016',
                                color: selectedCalEvent.status === 'SCHEDULED' ? TEAL : AMBER,
                                border: `1px solid ${BORDER}`,
                              }}>
                                {selectedCalEvent.status}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, fontFamily: FONT_MONO }}>
                              <span style={{ color: TEXT_SEC }}>
                                {new Date(selectedCalEvent.event_time_utc).toLocaleString('en-GB', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                                })} UTC
                              </span>
                              <span style={{ color: TEXT_MUT }}>{selectedCalEvent.country}</span>
                              {selectedCalEvent.currency && (
                                <span style={{ color: TEXT_MUT }}>{selectedCalEvent.currency}</span>
                              )}
                              {selectedCalEvent.consensus && (
                                <span style={{ color: TEXT_MUT }}>Consensus: <span style={{ color: TEXT_SEC }}>{selectedCalEvent.consensus}</span></span>
                              )}
                              {selectedCalEvent.previous && (
                                <span style={{ color: TEXT_MUT }}>Prev: <span style={{ color: TEXT_SEC }}>{selectedCalEvent.previous}</span></span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={handleClearCalEvent}
                            title="Clear — choose a different event"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT, fontSize: 16, lineHeight: 1, padding: 2, flexShrink: 0 }}
                          >×</button>
                        </div>
                      ) : (
                        <button
                          onClick={handleOpenCalPicker}
                          style={{
                            padding: '8px 14px', borderRadius: 4, cursor: 'pointer',
                            fontSize: 11, textAlign: 'left',
                            border: `1px solid ${draftRule.te_calendar_id ? AMBER : BORDER}`,
                            backgroundColor: BG_FIELD, color: TEXT_SEC,
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                        >
                          <span style={{ color: TEAL }}>📅</span>
                          {draftRule.te_calendar_id
                            ? `Event ID ${draftRule.te_calendar_id} — click to resolve`
                            : 'Select Economic Event…'}
                        </button>
                      )}

                      {/* Inline calendar picker */}
                      {calPickerOpen && (
                        <div style={{
                          backgroundColor: BG_SECTION, border: `1px solid ${BORDER_MD}`,
                          borderRadius: 5, overflow: 'hidden',
                        }}>
                          {/* Picker toolbar */}
                          <div style={{
                            padding: '8px 10px', borderBottom: `1px solid ${BORDER}`,
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            backgroundColor: '#1a191e',
                          }}>
                            <input
                              value={calSearch}
                              onChange={e => setCalSearch(e.target.value)}
                              placeholder="Search events…"
                              autoFocus
                              style={{ ...inputStyle, width: 180, fontSize: 11, padding: '4px 8px' }}
                            />
                            {/* Importance filter chips */}
                            <div style={{ display: 'flex', gap: 4 }}>
                              {([3, 2] as const).map(imp => {
                                const on = calImportance.includes(imp);
                                const starsColor = imp === 3 ? RED : AMBER;
                                return (
                                  <button key={imp} onClick={() => {
                                    setCalImportance(prev =>
                                      on ? prev.filter(x => x !== imp) : [...prev, imp].sort((a, b) => b - a)
                                    );
                                  }} style={{
                                    padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                                    fontFamily: FONT_MONO, fontSize: 10,
                                    border: `1px solid ${on ? starsColor : BORDER}`,
                                    backgroundColor: on ? BG_FIELD : BG_FIELD,
                                    color: on ? starsColor : TEXT_MUT,
                                  }}>
                                    {'★'.repeat(imp)}{'☆'.repeat(3 - imp)}
                                  </button>
                                );
                              })}
                            </div>
                            {calLoading && <span style={{ fontSize: 10, color: TEXT_MUT }}>Loading…</span>}
                            <button
                              onClick={() => setCalPickerOpen(false)}
                              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUT, fontSize: 16, lineHeight: 1 }}
                            >×</button>
                          </div>

                          {/* Event list */}
                          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                            {(() => {
                              const q = calSearch.trim().toLowerCase();
                              const filtered = calEvents.filter(e =>
                                calImportance.includes(e.importance) &&
                                (q === '' || e.event_name.toLowerCase().includes(q) || e.country.toLowerCase().includes(q))
                              );
                              if (filtered.length === 0) {
                                return (
                                  <div style={{ padding: '16px 12px', textAlign: 'center', color: TEXT_MUT, fontSize: 11 }}>
                                    {calLoading ? 'Loading events…' : 'No events match current filters'}
                                  </div>
                                );
                              }
                              return filtered.map(evt => (
                                <div
                                  key={evt.calendar_id}
                                  onClick={() => handleSelectCalEvent(evt)}
                                  style={{
                                    padding: '8px 10px', cursor: 'pointer',
                                    borderBottom: `1px solid ${BORDER}`,
                                    backgroundColor: draftRule.te_calendar_id === evt.calendar_id ? BG_FIELD : 'transparent',
                                    transition: 'background 0.08s',
                                  }}
                                  onMouseEnter={e => { if (draftRule.te_calendar_id !== evt.calendar_id) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1e1d22'; }}
                                  onMouseLeave={e => { if (draftRule.te_calendar_id !== evt.calendar_id) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                    <ImpStars v={evt.importance} />
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: TEXT_PRI, fontWeight: 500 }}>
                                      {evt.event_name}
                                    </span>
                                    <span style={{ fontFamily: FONT_MONO, fontSize: 10, color: TEXT_MUT, marginLeft: 'auto' }}>
                                      {evt.country}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', gap: 10, fontSize: 10, fontFamily: FONT_MONO, color: TEXT_MUT }}>
                                    <span>
                                      {new Date(evt.event_time_utc).toLocaleString('en-GB', {
                                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                                      })} UTC
                                    </span>
                                    {evt.currency && <span>{evt.currency}</span>}
                                    {evt.consensus && <span>Cons: {evt.consensus}</span>}
                                    {evt.previous && <span>Prev: {evt.previous}</span>}
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>

                          {/* Picker footer */}
                          <div style={{ padding: '5px 10px', borderTop: `1px solid ${BORDER}`, backgroundColor: '#1a191e' }}>
                            <span style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO }}>
                              {calEvents.filter(e => calImportance.includes(e.importance)).length} events · next 14 days
                            </span>
                          </div>
                        </div>
                      )}

                      {/* minutes_before / minutes_after */}
                      {!calPickerOpen && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <FormRow label="Activate before event (min)" required>
                            <input
                              type="number" min={0} max={1440}
                              value={draftRule.minutes_before}
                              onChange={e => setRule({ minutes_before: e.target.value })}
                              style={inputStyle}
                            />
                          </FormRow>
                          <FormRow label="Deactivate after event (min)" required>
                            <input
                              type="number" min={0} max={1440}
                              value={draftRule.minutes_after}
                              onChange={e => setRule({ minutes_after: e.target.value })}
                              style={inputStyle}
                            />
                          </FormRow>
                        </div>
                      )}

                      {!draftRule.te_calendar_id && (
                        <div style={{ fontSize: 10, color: AMBER }}>
                          ⚠ An economic event must be selected before saving.
                        </div>
                      )}
                    </div>
                  )}

                  {/* PNL_TRIGGER fields */}
                  {draftRule.activation_type === 'PNL_TRIGGER' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 12 }}>
                      <FormRow label="P&L Scope">
                        <select value={draftRule.activation_pnl_type} onChange={e => setRule({ activation_pnl_type: e.target.value })} style={selectStyle}>
                          <option value="SYMBOL_PNL">Symbol P&L (matched symbol)</option>
                          <option value="OVERALL_PNL">Overall P&L (all positions)</option>
                        </select>
                      </FormRow>
                      <FormRow label="Operator">
                        <select value={draftRule.activation_operator} onChange={e => setRule({ activation_operator: e.target.value })} style={selectStyle}>
                          <option value="LT">&lt;</option>
                          <option value="LTE">≤</option>
                          <option value="GT">&gt;</option>
                          <option value="GTE">≥</option>
                        </select>
                      </FormRow>
                      <FormRow label="P&L Threshold (USD)" required>
                        <input type="number" step={100} value={draftRule.activation_value} onChange={e => setRule({ activation_value: e.target.value })} placeholder="e.g. -10000" style={inputStyle} />
                      </FormRow>
                    </div>
                  )}

                  {/* MANUAL note */}
                  {draftRule.activation_type === 'MANUAL' && (
                    <div style={{ padding: '8px 12px', borderRadius: 4, backgroundColor: '#0f1c20', border: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 11, color: TEXT_SEC }}>
                        Manual activation — this strategy will only become ACTIVE via explicit manager action in the UI.
                      </span>
                    </div>
                  )}

                  {/* ALWAYS note */}
                  {draftRule.activation_type === 'ALWAYS' && (
                    <div style={{ padding: '8px 12px', borderRadius: 4, backgroundColor: '#0f1c20', border: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 11, color: TEXT_SEC }}>
                        Always active — fires on every matching position while strategy status is ACTIVE.
                      </span>
                    </div>
                  )}
                </SectionCard>

                {/* Bottom padding */}
                <div style={{ height: 40 }} />

              </div>{/* end scroll */}
            </>
          )}
        </div>{/* end middle panel */}

        {/* ════════════════════════════════════════════════════
            RIGHT PANEL — Strategy Intelligence (flex-1)
            Tabs: LP Health · Route Sanity · Escalations
        ════════════════════════════════════════════════════ */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          backgroundColor: BG_PANEL,
        }}>
          {/* Panel tab bar */}
          <div style={{
            display: 'flex', borderBottom: `1px solid ${BORDER}`,
            backgroundColor: BG_SECTION, flexShrink: 0,
          }}>
            {([
              { key: 'lp_health',    label: 'LP Health' },
              { key: 'route_sanity', label: 'Route Sanity' },
              { key: 'escalations',  label: 'Escalations', badge: ruleEscalations.length },
            ] as { key: typeof rightTab; label: string; badge?: number }[]).map(t => (
              <button key={t.key} onClick={() => setRightTab(t.key)} style={{
                flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
                fontSize: 11, letterSpacing: '0.04em', fontWeight: 500,
                backgroundColor: 'transparent',
                borderBottom: rightTab === t.key ? `2px solid ${TEAL}` : '2px solid transparent',
                color: rightTab === t.key ? TEAL : TEXT_SEC,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>
                {t.label}
                {t.badge !== undefined && t.badge > 0 && (
                  <span style={{
                    backgroundColor: RED, color: '#fff', borderRadius: 8,
                    fontSize: 9, fontWeight: 700, padding: '0 5px', lineHeight: '14px',
                  }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {!panelVisible ? (
            <EmptyState msg="No strategy selected" sub="Select a strategy to view details" />
          ) : (

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

              {/* ══════════════════════════════════════════════
                  TAB: LP HEALTH
              ══════════════════════════════════════════════ */}
              {rightTab === 'lp_health' && (() => {
                const primaryLp  = selectedRule ? lpHealthMap.get(selectedRule.hedging_lp_id) : undefined;
                const fallbackLp = draftSanity.fallback_lp_id ? lpHealthMap.get(draftSanity.fallback_lp_id) : undefined;

                const metricRow = (
                  label: string,
                  actual: number | null,
                  threshold: number | null,
                  mode: 'lower_better' | 'higher_better',
                  unit: string,
                ) => {
                  let color = actual === null ? RP_HINT : RP_LABEL;
                  if (actual !== null && threshold !== null) {
                    const breach = mode === 'lower_better' ? actual > threshold : actual < threshold;
                    color = breach ? RED : GREEN;
                  }
                  return (
                    <div key={label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0', borderBottom: `1px solid ${BORDER}`,
                    }}>
                      <span style={{ fontSize: 13, color: RP_LABEL }}>{label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {threshold !== null && (
                          <span style={{ fontSize: 12, color: RP_HINT, fontFamily: FONT_MONO }}>
                            {mode === 'lower_better' ? '≤' : '≥'} {threshold}{unit}
                          </span>
                        )}
                        <span style={{ fontSize: 13, fontFamily: FONT_MONO, fontWeight: 600, color, minWidth: 80, textAlign: 'right' as const }}>
                          {actual !== null ? `${actual.toFixed(1)}${unit}` : '—'}
                        </span>
                      </div>
                    </div>
                  );
                };

                const LpCard = ({ lp, label, health }: { lp: string; label: string; health: LpHealth | undefined }) => {
                  const connColor = !health ? RP_HINT
                    : health.connectivity_status === 'CONNECTED' ? GREEN
                    : health.connectivity_status === 'DEGRADED'  ? AMBER : RED;
                  const allMetricsNull = health && (
                    health.latency_ms === null &&
                    health.fill_rate_pct === null &&
                    health.reject_rate_pct === null &&
                    health.slippage_avg_pips === null
                  );
                  return (
                    <div style={{
                      backgroundColor: BG_SECTION, border: `1px solid ${BORDER}`,
                      borderRadius: 6, marginBottom: 12, overflow: 'hidden',
                    }}>
                      <div style={{
                        padding: '8px 12px', borderBottom: `1px solid ${BORDER}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        backgroundColor: '#1a191e',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: RP_HINT, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>{label}</span>
                          <span style={{ fontSize: 14, color: TEXT_PRI, fontFamily: FONT_MONO, fontWeight: 600 }}>{lp}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: connColor }} />
                          <span style={{ fontSize: 12, color: connColor, fontFamily: FONT_MONO, fontWeight: 600 }}>
                            {health?.connectivity_status ?? 'UNKNOWN'}
                          </span>
                        </div>
                      </div>
                      <div style={{ padding: '4px 12px 10px' }}>
                        {metricRow('Latency',     health?.latency_ms         ?? null, nullableFloat(draftSanity.max_latency_ms),      'lower_better',  ' ms')}
                        {metricRow('Fill Rate',   health?.fill_rate_pct      ?? null, nullableFloat(draftSanity.min_fill_rate_pct),   'higher_better', '%')}
                        {metricRow('Reject Rate', health?.reject_rate_pct    ?? null, nullableFloat(draftSanity.max_reject_rate_pct), 'lower_better',  '%')}
                        {metricRow('Slippage',    health?.slippage_avg_pips  ?? null, nullableFloat(draftSanity.max_slippage_pips),   'lower_better',  ' pip')}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 }}>
                          <span style={{ fontSize: 11, color: RP_HINT, fontFamily: FONT_MONO }}>
                            Last heartbeat: {health?.last_heartbeat_at
                              ? new Date(health.last_heartbeat_at).toLocaleTimeString('en-GB')
                              : '—'}
                          </span>
                          <span style={{ fontSize: 11, color: RP_HINT, fontFamily: FONT_MONO }}>
                            Checked: {health?.last_checked_at
                              ? new Date(health.last_checked_at).toLocaleTimeString('en-GB')
                              : '—'}
                          </span>
                        </div>
                        {allMetricsNull && (
                          <div style={{
                            marginTop: 8, padding: '6px 8px', borderRadius: 3,
                            backgroundColor: '#101828', border: '1px solid #1e3a5f',
                            fontSize: 11, color: TEXT_SEC, lineHeight: 1.5,
                          }}>
                            ℹ Metrics populate once RouteSanityChecker has collected FIX session data.
                            Connectivity is live — metric sampling begins on first hedge dispatch.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {selectedRule && <LpCard lp={selectedRule.hedging_lp_id} label="Primary LP" health={primaryLp} />}
                    {draftSanity.breach_action === 'FALLBACK_LP' && draftSanity.fallback_lp_id && (
                      <LpCard lp={draftSanity.fallback_lp_id} label="Fallback LP" health={fallbackLp} />
                    )}
                    <div style={{ fontSize: 11, color: RP_HINT, marginTop: 4 }}>
                      Thresholds shown from Route Sanity config · Polled every 5s
                    </div>
                  </>
                );
              })()}

              {/* ══════════════════════════════════════════════
                  TAB: ROUTE SANITY
              ══════════════════════════════════════════════ */}
              {rightTab === 'route_sanity' && (
                <>
                  {/* Global default banner */}
                  {sanityIsGlobal && !sanityOverrideEnabled && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 4, marginBottom: 12,
                      backgroundColor: '#101828', border: '1px solid #1e3a5f',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 11, color: TEXT_SEC }}>
                        ℹ Inheriting global default for LP <strong>{draftSanity.lp_id || selectedRule?.hedging_lp_id}</strong>.
                        No per-rule override defined.
                      </span>
                      <button onClick={() => setSanityOverrideEnabled(true)} style={{
                        padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
                        fontSize: 11, backgroundColor: '#1e3a5f',
                        border: '1px solid #2a5080', color: '#a5c8f0', whiteSpace: 'nowrap' as const,
                      }}>
                        Override
                      </button>
                    </div>
                  )}

                  {/* Save error */}
                  {sanityError && (
                    <div style={{
                      padding: '6px 10px', borderRadius: 4, marginBottom: 10,
                      backgroundColor: '#2c1417', border: `1px solid #7a2f36`,
                      fontSize: 11, color: RED,
                    }}>
                      ⚠ {sanityError}
                    </div>
                  )}

                  <fieldset disabled={!sanityOverrideEnabled && sanityIsGlobal}
                    style={{ border: 'none', padding: 0, margin: 0, opacity: (!sanityOverrideEnabled && sanityIsGlobal) ? 0.45 : 1 }}>

                    {/* Thresholds */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <FormRow label="Max Latency" hint="ms">
                        <input type="number" min={0} value={draftSanity.max_latency_ms}
                          onChange={e => setSanity({ max_latency_ms: e.target.value })} placeholder="e.g. 500" style={inputStyle} />
                      </FormRow>
                      <FormRow label="Min Fill Rate" hint="%">
                        <input type="number" min={0} max={100} value={draftSanity.min_fill_rate_pct}
                          onChange={e => setSanity({ min_fill_rate_pct: e.target.value })} placeholder="e.g. 90" style={inputStyle} />
                      </FormRow>
                      <FormRow label="Max Reject Rate" hint="%">
                        <input type="number" min={0} max={100} value={draftSanity.max_reject_rate_pct}
                          onChange={e => setSanity({ max_reject_rate_pct: e.target.value })} placeholder="e.g. 5" style={inputStyle} />
                      </FormRow>
                      <FormRow label="Max Slippage" hint="pips">
                        <input type="number" min={0} step={0.1} value={draftSanity.max_slippage_pips}
                          onChange={e => setSanity({ max_slippage_pips: e.target.value })} placeholder="e.g. 1.0" style={inputStyle} />
                      </FormRow>
                      <FormRow label="Heartbeat Timeout" hint="ms">
                        <input type="number" min={0} value={draftSanity.heartbeat_timeout_ms}
                          onChange={e => setSanity({ heartbeat_timeout_ms: e.target.value })} placeholder="e.g. 10000" style={inputStyle} />
                      </FormRow>
                      <FormRow label="Rolling Window" hint="seconds">
                        <input type="number" min={10} value={draftSanity.rolling_window_seconds}
                          onChange={e => setSanity({ rolling_window_seconds: e.target.value })} style={inputStyle} />
                      </FormRow>
                    </div>

                    {/* Breach action */}
                    <FormRow label="On Breach">
                      <div style={{ display: 'flex', gap: 6 }}>
                        {(['PAUSE_RULE', 'STOP_RULE', 'FALLBACK_LP'] as BreachAction[]).map(a => (
                          <button key={a} onClick={() => setSanity({ breach_action: a })} style={{
                            flex: 1, padding: '6px 4px', borderRadius: 4, cursor: 'pointer',
                            fontSize: 10,
                            border: `1px solid ${draftSanity.breach_action === a ? AMBER : BORDER}`,
                            backgroundColor: draftSanity.breach_action === a ? BG_FIELD : BG_FIELD,
                            color: draftSanity.breach_action === a ? AMBER : TEXT_SEC,
                          }}>
                            {a.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </FormRow>

                    {draftSanity.breach_action === 'FALLBACK_LP' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <FormRow label="Fallback LP" required>
                          <select value={draftSanity.fallback_lp_id} onChange={e => setSanity({ fallback_lp_id: e.target.value })} style={selectStyle}>
                            <option value="">— Select —</option>
                            {enabledLps.filter(lp => lp.lp_id !== selectedRule?.hedging_lp_id).map(lp => (
                              <option key={lp.lp_id} value={lp.lp_id}>{lp.lp_name}</option>
                            ))}
                          </select>
                        </FormRow>
                        <FormRow label="Fallback Account" hint="optional">
                          <input value={draftSanity.fallback_lp_account_id}
                            onChange={e => setSanity({ fallback_lp_account_id: e.target.value })} style={inputStyle} />
                        </FormRow>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 16, margin: '8px 0 12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={draftSanity.notify_on_breach}
                          onChange={e => setSanity({ notify_on_breach: e.target.checked })} />
                        <span style={{ fontSize: 11, color: TEXT_SEC }}>Notify on breach</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={draftSanity.notify_on_recovery}
                          onChange={e => setSanity({ notify_on_recovery: e.target.checked })} />
                        <span style={{ fontSize: 11, color: TEXT_SEC }}>Notify on recovery</span>
                      </label>
                    </div>

                    <FormRow label="Recovery Policy">
                      <select value={draftSanity.recovery_policy}
                        onChange={e => setSanity({ recovery_policy: e.target.value as RecoveryPolicy })} style={selectStyle}>
                        <option value="AUTO_RESTORE">Auto-restore immediately</option>
                        <option value="HOLD_THEN_RESTORE">Hold then restore</option>
                        <option value="MANUAL_ONLY">Manual only</option>
                      </select>
                    </FormRow>

                    {draftSanity.recovery_policy === 'HOLD_THEN_RESTORE' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                        <FormRow label="Hold Period" hint="sec" required>
                          <input type="number" min={0} value={draftSanity.hold_period_seconds}
                            onChange={e => setSanity({ hold_period_seconds: e.target.value })} placeholder="300" style={inputStyle} />
                        </FormRow>
                        <FormRow label="Stability Checks" required>
                          <input type="number" min={1} value={draftSanity.stability_confirmations}
                            onChange={e => setSanity({ stability_confirmations: e.target.value })} placeholder="5" style={inputStyle} />
                        </FormRow>
                        <FormRow label="Restore To">
                          <select value={draftSanity.restore_target}
                            onChange={e => setSanity({ restore_target: e.target.value as RestoreTarget })} style={selectStyle}>
                            <option value="ORIGINAL_LP">Original LP</option>
                            <option value="STAY_ON_FALLBACK">Stay on fallback</option>
                          </select>
                        </FormRow>
                      </div>
                    )}

                    {/* Final fallback */}
                    <div style={{ margin: '12px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                      <span style={{ fontSize: 9, color: TEXT_MUT, letterSpacing: '0.05em' }}>FINAL FALLBACK — ALL LPs EXHAUSTED</span>
                      <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                      {(Object.entries(FINAL_FALLBACK_CFG) as [FinalFallback, typeof FINAL_FALLBACK_CFG[FinalFallback]][]).map(([k, v]) => (
                        <button key={k} onClick={() => setSanity({ final_fallback_action: k })} style={{
                          flex: 1, padding: '7px 6px', borderRadius: 4, cursor: 'pointer', textAlign: 'left' as const,
                          border: `1px solid ${draftSanity.final_fallback_action === k ? v.color : BORDER}`,
                          backgroundColor: draftSanity.final_fallback_action === k ? BG_FIELD : BG_FIELD,
                        }}>
                          <div style={{ fontSize: 10, color: draftSanity.final_fallback_action === k ? v.color : TEXT_SEC, fontWeight: 600, marginBottom: 2 }}>
                            {v.label}
                          </div>
                          <div style={{ fontSize: 9, color: TEXT_MUT, lineHeight: 1.4 }}>{v.desc}</div>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {/* Save / Revert row */}
                  {(sanityOverrideEnabled || !sanityIsGlobal) && (
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
                      {!sanityIsGlobal && (
                        <button onClick={handleRevertSanity} style={{
                          fontSize: 11, background: 'none',
                          border: `1px solid ${BORDER}`, color: TEXT_MUT, borderRadius: 3,
                          padding: '4px 10px', cursor: 'pointer',
                        }}>
                          ↩ Revert to global
                        </button>
                      )}
                      <button onClick={handleSanitySave} disabled={sanitySaving || !isSanityDirty} style={{
                        fontSize: 11, fontWeight: 600, borderRadius: 3,
                        padding: '4px 14px', cursor: isSanityDirty ? 'pointer' : 'default',
                        backgroundColor: isSanityDirty ? BG_FIELD : 'transparent',
                        border: `1px solid ${isSanityDirty ? TEAL : BORDER}`,
                        color: isSanityDirty ? TEAL : TEXT_MUT,
                        opacity: sanitySaving ? 0.6 : 1,
                      }}>
                        {sanitySaving ? 'Saving…' : isSanityDirty ? '● Save Config' : 'Saved'}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ══════════════════════════════════════════════
                  TAB: ESCALATIONS
              ══════════════════════════════════════════════ */}
              {rightTab === 'escalations' && (
                <>
                  {ruleEscalations.length === 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, paddingTop: 40 }}>
                      <span style={{ color: RP_LABEL, fontSize: 14 }}>No escalated positions</span>
                      <span style={{ color: RP_HINT, fontSize: 12 }}>All hedge orders for this strategy resolved normally</span>
                      {totalEscalations > 0 && (
                        <span style={{
                          marginTop: 8, padding: '5px 12px', borderRadius: 4, fontWeight: 600,
                          backgroundColor: BADGE.critical.bg, color: BADGE.critical.color,
                          border: `1px solid ${BADGE.critical.border}`,
                          fontSize: 12,
                        }}>
                          ⚠ {totalEscalations} escalation{totalEscalations > 1 ? 's' : ''} exist across other strategies
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      {ruleEscalations.map(e => {
                        const stateColor = e.hedge_state === 'TIMEOUT_ESCALATED' ? AMBER : RED;
                        const busy = escalationBusy[e.record_id] ?? false;
                        const canForceClose = !!e.lp_position_id;
                        return (
                          <div key={e.record_id} style={{
                            backgroundColor: BG_SECTION, border: `1px solid ${BORDER}`,
                            borderLeft: `3px solid ${stateColor}`,
                            borderRadius: 4, marginBottom: 8, padding: '10px 12px',
                          }}>
                            {/* Header row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: FONT_MONO, fontSize: 14, color: TEXT_PRI, fontWeight: 600 }}>{e.mt5_symbol}</span>
                                <span style={{
                                  padding: '1px 6px', borderRadius: 2, fontSize: 12, fontFamily: FONT_MONO,
                                  backgroundColor: e.direction === 'LONG' ? BG_FIELD : '#2c1417',
                                  color: e.direction === 'LONG' ? TEAL : RED,
                                  border: `1px solid ${BORDER}`,
                                }}>
                                  {e.direction}
                                </span>
                                <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: RP_LABEL }}>{e.hedge_volume_mt5 != null ? e.hedge_volume_mt5.toFixed(2) : '—'} lots</span>
                              </div>
                              <span style={{
                                padding: '2px 8px', borderRadius: 2, fontSize: 11, fontFamily: FONT_MONO,
                                backgroundColor: BG_FIELD, color: stateColor, border: `1px solid ${BORDER}`,
                                fontWeight: 600,
                              }}>
                                {e.hedge_state.replace(/_/g, ' ')}
                              </span>
                            </div>

                            {/* Detail row */}
                            <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                              <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: RP_HINT }}>
                                Login: <span style={{ color: RP_LABEL }}>{e.login_id}</span>
                              </span>
                              <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: RP_HINT }}>
                                LP: <span style={{ color: RP_LABEL }}>{e.hedging_lp_id}</span>
                              </span>
                              <span style={{ fontSize: 12, fontFamily: FONT_MONO, color: RP_HINT }}>
                                {e.escalated_at ? new Date(e.escalated_at).toLocaleTimeString('en-GB') : '—'}
                              </span>
                            </div>

                            {/* Reason */}
                            {e.escalation_reason && (
                              <div style={{ fontSize: 12, color: RP_HINT, marginBottom: 8, lineHeight: 1.5 }}>
                                {e.escalation_reason}
                                {e.rejection_code && <span style={{ color: RED }}> (code: {e.rejection_code})</span>}
                              </div>
                            )}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: 6 }}>
                              {e.hedge_state !== 'NORMALIZER_ERROR' && (
                                <button disabled={busy} onClick={() => handleEscalationAction(e.record_id, 'retry', e.lp_position_id)}
                                  style={{ ...escalBtnStyle, fontSize: 12, backgroundColor: BG_FIELD, borderColor: BORDER, color: TEAL, opacity: busy ? 0.5 : 1 }}>
                                  Retry
                                </button>
                              )}
                              <button
                                disabled={busy || !canForceClose}
                                title={!canForceClose ? 'Disabled — lp_position_id is null (LP fill not confirmed)' : undefined}
                                onClick={() => canForceClose && handleEscalationAction(e.record_id, 'force-close', e.lp_position_id)}
                                style={{ ...escalBtnStyle, fontSize: 12, backgroundColor: BADGE.high.bg, borderColor: BADGE.high.border, color: BADGE.high.color, opacity: (busy || !canForceClose) ? 0.35 : 1, cursor: !canForceClose ? 'not-allowed' : 'pointer' }}>
                                Force Close
                              </button>
                              <button disabled={busy} onClick={() => handleEscalationAction(e.record_id, 'bbook', e.lp_position_id)}
                                style={{ ...escalBtnStyle, fontSize: 12, backgroundColor: BADGE.critical.bg, borderColor: BADGE.critical.border, color: BADGE.critical.color, opacity: busy ? 0.5 : 1 }}>
                                B-Book
                              </button>
                              <button disabled={busy} onClick={() => handleEscalationAction(e.record_id, 'acknowledge', e.lp_position_id)}
                                style={{ ...escalBtnStyle, fontSize: 12, backgroundColor: BADGE.neutral.bg, borderColor: BADGE.neutral.border, color: BADGE.neutral.color, opacity: busy ? 0.5 : 1 }}>
                                Dismiss
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 12, color: RP_HINT, paddingTop: 4 }}>
                        Showing escalations for this strategy only · Polled every 10s
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{ height: 20 }} />
            </div>
          )}
        </div>{/* end right panel */}

      </div>{/* end body */}
    </div>
  );
}

// ── Tiny action button ────────────────────────────────────────
function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const b = color === RED ? BADGE.critical : color === AMBER ? BADGE.high : color === GREEN ? BADGE.low : BADGE.neutral;
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
      fontSize: 11, fontWeight: 600,
      backgroundColor: b.bg, border: `1px solid ${b.border}`, color: b.color,
      transition: 'background 0.1s',
    }}>
      {label}
    </button>
  );
}