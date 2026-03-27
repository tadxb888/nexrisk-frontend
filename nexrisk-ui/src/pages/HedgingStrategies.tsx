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
// CONSTANTS — color tokens (matches BBookPage reference)
// ══════════════════════════════════════════════════════════════
const BG_PAGE    = '#313032';
const BG_PANEL   = '#252429';
const BG_SECTION = '#1e1d21';
const BG_FIELD   = '#1a191e';
const BORDER     = '#3a3a3e';
const BORDER_MD  = '#505050';
const BORDER_HDR = '#808080';
const TEAL       = '#4ecdc4';
const GREEN      = '#66e07a';
const AMBER      = '#e0a020';
const RED        = '#ff6b6b';
const TEXT_PRI   = '#fff';
const TEXT_SEC   = '#ccc';
const TEXT_MUT   = '#888';
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
  connection_status: string;
  is_enabled:        boolean;
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

// ── Status pill ───────────────────────────────────────────────
function StatusPill({ status }: { status: RuleStatus }) {
  const cfg = {
    ACTIVE:  { color: GREEN,  bg: '#0f2018', label: 'ACTIVE'  },
    PAUSED:  { color: AMBER,  bg: '#201600', label: 'PAUSED'  },
    STOPPED: { color: RED,    bg: '#200c0c', label: 'STOPPED' },
  }[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '1px 7px', borderRadius: 3,
      backgroundColor: cfg.bg, border: `1px solid ${cfg.color}44`,
      fontFamily: FONT_MONO, fontSize: 10, color: cfg.color, letterSpacing: '0.04em',
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
          backgroundColor: '#0d2020', border: `1px solid ${TEAL}44`,
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
        <span style={{ fontSize: 11, color: TEXT_SEC, fontWeight: 500 }}>
          {label}{required && <span style={{ color: RED, marginLeft: 2 }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 10, color: TEXT_MUT }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Shared input style ────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`,
  borderRadius: 4, padding: '6px 10px',
  color: TEXT_PRI, fontFamily: FONT_MONO, fontSize: 12,
  outline: 'none', colorScheme: 'dark',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle, cursor: 'pointer', appearance: 'auto' as const, colorScheme: 'dark',
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
            padding: '3px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 11,
            border: `1px solid ${active ? color : BORDER}`,
            backgroundColor: active ? `${color}18` : BG_FIELD,
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
  chips, onChange, placeholder, suggestions = [],
}: {
  chips: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState('');
  const inputId = useMemo(() => `chipinput-${Math.random().toString(36).slice(2)}`, []);

  const addChip = useCallback((val: string) => {
    const v = val.trim().toUpperCase();
    if (v && !chips.includes(v)) onChange([...chips, v]);
    setInput('');
  }, [chips, onChange]);

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
  };

  return (
    <div style={{
      backgroundColor: BG_FIELD, border: `1px solid ${BORDER}`, borderRadius: 4,
      padding: '5px 8px', minHeight: 36, display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center',
    }}>
      {chips.map(c => (
        <span key={c} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '1px 7px', borderRadius: 3,
          backgroundColor: `${TEAL}14`, border: `1px solid ${TEAL}44`,
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
            fontFamily: FONT_MONO, fontSize: 11, fontWeight: 600,
            border: `1px solid ${active ? TEAL : BORDER}`,
            backgroundColor: active ? `${TEAL}18` : BG_FIELD,
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
  rule, selected, hasConflict, lpHealthMap, onClick,
}: {
  rule:        HedgeRule;
  selected:    boolean;
  hasConflict: boolean;
  lpHealthMap: Map<string, LpHealth>;
  onClick:     () => void;
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
          border: `1px solid ${TEAL}44`, borderRadius: 3, flexShrink: 0,
          fontFamily: FONT_MONO, fontSize: 11, color: TEAL, backgroundColor: '#0d2020',
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
            backgroundColor: '#122030', color: '#7bafd4', border: '1px solid #1e4060',
          }}>
            {rule.mt5_servers[0]}
          </span>
        )}
        <span style={{
          padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: FONT_MONO,
          backgroundColor: '#0f1e20', color: TEXT_SEC, border: `1px solid ${BORDER}`,
        }}>
          LP: {rule.hedging_lp_id}
        </span>
        {hasConflict && (
          <span style={{
            padding: '1px 6px', borderRadius: 2, fontSize: 10, fontFamily: FONT_MONO,
            backgroundColor: '#201400', color: AMBER, border: `1px solid ${AMBER}44`,
          }}>
            ⚠ Overlap
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
        backgroundColor: `${routingColor}55`,
      }} />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────
function EmptyState({ msg, sub }: { msg: string; sub?: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <span style={{ color: TEXT_MUT, fontSize: 13 }}>{msg}</span>
      {sub && <span style={{ color: TEXT_MUT, fontSize: 11, fontFamily: FONT_MONO }}>{sub}</span>}
    </div>
  );
}

// ── Info banner ───────────────────────────────────────────────
function InfoBanner({ msg }: { msg: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 4, marginBottom: 12,
      backgroundColor: '#101828', border: '1px solid #1e3a5f',
      fontSize: 11, color: '#7bafd4', fontFamily: FONT_MONO, lineHeight: 1.5,
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
      backgroundColor: '#201400', border: `1px solid ${AMBER}44`,
      fontSize: 11, color: AMBER, fontFamily: FONT_MONO, lineHeight: 1.5,
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
  const [statusFilter, setStatusFilter] = useState<'ALL' | RuleStatus>('ALL');
  const [loading,      setLoading]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

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
    const saved = sessionStorage.getItem(SS_KEY);
    if (saved) setSelectedId(parseInt(saved, 10));
    return () => { mountedRef.current = false; };
  }, [loadLpOptions, loadMt5Nodes]);

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

  // Selection change → load rule + sanity config
  useEffect(() => {
    if (selectedId === null) { sessionStorage.removeItem(SS_KEY); return; }
    sessionStorage.setItem(SS_KEY, String(selectedId));
    const rule = rules.find(r => r.rule_id === selectedId);
    if (rule) {
      setDraftRule(draftFromRule(rule));
      setIsRuleDirty(false);
      setIsSanityDirty(false);
      setSaveError(null);
      loadSanityConfig(selectedId);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load B-Book groups when server selection changes
  useEffect(() => {
    loadBBookGroups(draftRule.mt5_server_id);
  }, [draftRule.mt5_server_id, loadBBookGroups]);

  // Sync sanity lp_id with primary LP
  useEffect(() => {
    if (draftRule.hedging_lp_id && draftSanity.lp_id !== draftRule.hedging_lp_id) {
      setDraftSanity(s => ({ ...s, lp_id: draftRule.hedging_lp_id }));
    }
  }, [draftRule.hedging_lp_id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDraftRule(EMPTY_RULE);
    setDraftSanity(EMPTY_SANITY);
    setSanityIsGlobal(false);
    setSanityOverrideEnabled(false);
    setSanityUnavailable(false);
    setIsRuleDirty(false);
    setIsSanityDirty(false);
    setSaveError(null);
  }, []);

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

  const setSanity = useCallback((patch: Partial<DraftSanity>) => {
    setDraftSanity(d => ({ ...d, ...patch }));
    setIsSanityDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!draftRule.name.trim()) { setSaveError('Strategy name is required.'); return; }
    if (!draftRule.hedging_lp_id) { setSaveError('Primary LP is required.'); return; }
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

        // Save sanity config if override enabled and dirty
        if (sanityOverrideEnabled && isSanityDirty) {
          const sRes = await fetch(`/api/v1/hedge/rules/${selectedId}/sanity-config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sanityToApiBody(draftSanity)),
          });
          if (sRes.ok) {
            setIsSanityDirty(false);
            setSanityIsGlobal(false);
          } else {
            const sJson = await sRes.json();
            setSaveError(`Route config: ${sJson.error ?? `Error ${sRes.status}`}`);
            // Don't return — rule was saved OK, partial success
          }
        }
        await loadRules();
        showToast('Strategy saved');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [isCreating, selectedId, draftRule, draftSanity, sanityOverrideEnabled, isSanityDirty, loadRules, showToast]);

  const handleStatusAction = useCallback(async (action: 'activate' | 'pause' | 'stop') => {
    if (selectedId === null) return;
    try {
      const res = await fetch(`/api/v1/hedge/rules/${selectedId}/${action}`, { method: 'POST' });
      if (!res.ok) { const j = await res.json(); showToast(`Error: ${j.error ?? res.status}`); return; }
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

  // ══════════════════════════════════════════════════════════
  // DERIVED
  // ══════════════════════════════════════════════════════════
  const selectedRule = rules.find(r => r.rule_id === selectedId) ?? null;
  const panelVisible = isCreating || selectedId !== null;
  const isEditMode   = !isCreating && selectedId !== null;
  const isDirtyAny   = isRuleDirty || (sanityOverrideEnabled && isSanityDirty);
  const activeCount  = rules.filter(r => r.status === 'ACTIVE').length;
  const enabledLps   = lpOptions.filter(l => l.enabled);

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
          <p style={{ fontSize: 11, color: TEXT_SEC, margin: '2px 0 0', fontFamily: FONT_MONO }}>
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
          </div>
          {toast && (
            <span style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 11, fontFamily: FONT_MONO,
              backgroundColor: '#0f2018', color: GREEN, border: `1px solid ${GREEN}44`,
            }}>
              ✓ {toast}
            </span>
          )}
          <button
            onClick={handleNewStrategy}
            disabled={isCreating}
            style={{
              padding: '5px 14px', borderRadius: 4, cursor: isCreating ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: FONT_MONO,
              backgroundColor: isCreating ? '#0d2020' : `${TEAL}22`,
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
          padding: '6px 16px', borderBottom: `1px solid #5a2020`,
          backgroundColor: '#1c1010', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#ff8888' }}>⚠ {loadError}</span>
          <button onClick={loadRules} style={{ fontSize: 11, color: '#ff8888', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button>
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
            {(['ALL', 'ACTIVE', 'PAUSED', 'STOPPED'] as const).map(f => {
              const isActive = statusFilter === f;
              return (
                <button key={f} onClick={() => setStatusFilter(f)} style={{
                  flex: 1, padding: '7px 4px', border: 'none', cursor: 'pointer',
                  fontFamily: FONT_MONO, fontSize: 10, letterSpacing: '0.04em',
                  backgroundColor: 'transparent',
                  borderBottom: isActive ? `2px solid ${TEAL}` : '2px solid transparent',
                  color: isActive ? TEAL : TEXT_MUT,
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
                  lpHealthMap={lpHealthMap}
                  onClick={() => handleSelectRule(r.rule_id)}
                />
              ))
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════
            RIGHT PANEL — Detail form
        ════════════════════════════════════════════════════ */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!panelVisible ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: `${TEAL}10`, border: `1px solid ${TEAL}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: TEAL }}>
                ⇌
              </div>
              <span style={{ color: TEXT_MUT, fontSize: 13 }}>Select a strategy to view or edit</span>
              <span style={{ color: TEXT_MUT, fontSize: 11, fontFamily: FONT_MONO }}>or click + New Strategy to define one</span>
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
                      {selectedRule.status === 'ACTIVE'  && <ActionBtn label="Pause"    color={AMBER} onClick={() => handleStatusAction('pause')} />}
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
                      fontSize: 12, fontFamily: FONT_MONO,
                      background: 'none', border: `1px solid ${BORDER_MD}`, color: TEXT_SEC,
                    }}>
                      Cancel
                    </button>
                  )}
                  {/* Save */}
                  <button onClick={handleSave} disabled={saving} style={{
                    padding: '5px 16px', borderRadius: 4, cursor: saving ? 'default' : 'pointer',
                    fontSize: 12, fontWeight: 600, fontFamily: FONT_MONO,
                    backgroundColor: isDirtyAny || isCreating ? `${TEAL}22` : 'transparent',
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
                  padding: '6px 16px', borderBottom: `1px solid #5a2020`,
                  backgroundColor: '#1c1010', fontSize: 11, color: '#ff8888', fontFamily: FONT_MONO, flexShrink: 0,
                }}>
                  ⚠ {saveError}
                </div>
              )}

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

                  {/* MT5 Server */}
                  <FormRow label="MT5 Server" required hint="one per strategy">
                    <select value={draftRule.mt5_server_id} onChange={e => setRule({ mt5_server_id: e.target.value, groups: [] })} style={selectStyle}>
                      <option value="">— Apply to all servers —</option>
                      {mt5Nodes.filter(n => n.is_enabled).map(n => (
                        <option key={n.id} value={String(n.id)}>{n.node_name} ({n.connection_status})</option>
                      ))}
                    </select>
                  </FormRow>

                  {/* B-Book Groups */}
                  <FormRow label="B-Book Groups" hint={draftRule.mt5_server_id ? `${bBookGroups.length} assigned groups` : 'select a server first'}>
                    {bBookGroups.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {bBookGroups.map(g => {
                          const active = draftRule.groups.includes(g);
                          return (
                            <button key={g} onClick={() => setRule({ groups: active ? draftRule.groups.filter(x => x !== g) : [...draftRule.groups, g] })} style={{
                              padding: '2px 9px', borderRadius: 3, cursor: 'pointer', fontFamily: FONT_MONO, fontSize: 11,
                              border: `1px solid ${active ? TEAL : BORDER}`,
                              backgroundColor: active ? `${TEAL}14` : BG_FIELD,
                              color: active ? TEAL : TEXT_SEC,
                            }}>
                              {g.split('\\').pop() ?? g}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '6px 10px', borderRadius: 4, border: `1px solid ${BORDER}`, backgroundColor: BG_FIELD }}>
                        <span style={{ fontSize: 11, color: TEXT_MUT, fontFamily: FONT_MONO }}>
                          {draftRule.mt5_server_id ? 'No B-Book groups assigned to this server' : 'Select a server to load B-Book groups'}
                        </span>
                      </div>
                    )}
                    {draftRule.groups.length === 0 && bBookGroups.length > 0 && (
                      <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO }}>
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
                    <span style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO, letterSpacing: '0.06em' }}>COHORT TARGETING</span>
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
                          padding: '3px 10px', borderRadius: 3, fontFamily: FONT_MONO, fontSize: 11,
                          border: `1px solid ${BORDER}`, color: TEXT_MUT, opacity: 0.5, cursor: 'not-allowed',
                        }}>
                          {rc.label}
                        </span>
                      ))}
                    </div>
                    <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO }}>
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
                    />
                    {draftRule.symbols.length === 0 && (
                      <div style={{ marginTop: 5, fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO }}>
                        No symbols selected — strategy applies to all instruments
                      </div>
                    )}
                  </FormRow>

                  <FormRow label="Direction">
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['LONG', 'BOTH', 'SHORT'] as Direction[]).map(d => (
                        <button key={d} onClick={() => setRule({ direction: d })} style={{
                          flex: 1, padding: '6px 0', borderRadius: 4, cursor: 'pointer',
                          fontFamily: FONT_MONO, fontSize: 12, fontWeight: draftRule.direction === d ? 600 : 400,
                          border: `1px solid ${draftRule.direction === d ? TEAL : BORDER}`,
                          backgroundColor: draftRule.direction === d ? `${TEAL}18` : BG_FIELD,
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
                    <span style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO, letterSpacing: '0.06em' }}>GUARD CLAUSE</span>
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
                    SECTION 5 — Route & Fallback
                ───────────────────────────────────────────────── */}
                <SectionCard n={5} label="Route & Fallback">
                  {sanityUnavailable ? (
                    <WarnBanner msg="Route sanity config endpoint not yet available (🟡 pending C++ implementation). Configure thresholds once the endpoint is live." />
                  ) : (
                    <>
                      {sanityIsGlobal && !sanityOverrideEnabled && (
                        <div style={{
                          padding: '10px 12px', borderRadius: 4, marginBottom: 12,
                          backgroundColor: '#101828', border: '1px solid #1e3a5f',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                          <span style={{ fontSize: 11, color: '#7bafd4', fontFamily: FONT_MONO }}>
                            ℹ Inheriting global default config for LP <strong>{draftSanity.lp_id}</strong>.
                            No per-rule override is defined.
                          </span>
                          <button onClick={() => setSanityOverrideEnabled(true)} style={{
                            padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
                            fontSize: 11, fontFamily: FONT_MONO, backgroundColor: '#1e3a5f',
                            border: '1px solid #2a5080', color: '#a5c8f0',
                          }}>
                            Override
                          </button>
                        </div>
                      )}

                      {sanityOverrideEnabled && (
                        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
                          {!sanityIsGlobal && (
                            <button onClick={handleRevertSanity} style={{
                              fontSize: 10, fontFamily: FONT_MONO, background: 'none',
                              border: `1px solid ${BORDER}`, color: TEXT_MUT, borderRadius: 3, padding: '2px 8px', cursor: 'pointer',
                            }}>
                              ↩ Revert to global default
                            </button>
                          )}
                        </div>
                      )}

                      <fieldset disabled={!sanityOverrideEnabled && sanityIsGlobal} style={{ border: 'none', padding: 0, margin: 0, opacity: (!sanityOverrideEnabled && sanityIsGlobal) ? 0.45 : 1 }}>
                        {/* Thresholds grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
                          <FormRow label="Max Latency" hint="ms · null = disabled">
                            <input type="number" min={0} value={draftSanity.max_latency_ms} onChange={e => setSanity({ max_latency_ms: e.target.value })} placeholder="e.g. 500" style={inputStyle} />
                          </FormRow>
                          <FormRow label="Min Fill Rate" hint="% 0–100">
                            <input type="number" min={0} max={100} value={draftSanity.min_fill_rate_pct} onChange={e => setSanity({ min_fill_rate_pct: e.target.value })} placeholder="e.g. 90" style={inputStyle} />
                          </FormRow>
                          <FormRow label="Max Reject Rate" hint="% 0–100">
                            <input type="number" min={0} max={100} value={draftSanity.max_reject_rate_pct} onChange={e => setSanity({ max_reject_rate_pct: e.target.value })} placeholder="e.g. 5" style={inputStyle} />
                          </FormRow>
                          <FormRow label="Max Slippage" hint="pips">
                            <input type="number" min={0} step={0.1} value={draftSanity.max_slippage_pips} onChange={e => setSanity({ max_slippage_pips: e.target.value })} placeholder="e.g. 1.0" style={inputStyle} />
                          </FormRow>
                          <FormRow label="Heartbeat Timeout" hint="ms">
                            <input type="number" min={0} value={draftSanity.heartbeat_timeout_ms} onChange={e => setSanity({ heartbeat_timeout_ms: e.target.value })} placeholder="e.g. 10000" style={inputStyle} />
                          </FormRow>
                          <FormRow label="Rolling Window" hint="seconds">
                            <input type="number" min={10} value={draftSanity.rolling_window_seconds} onChange={e => setSanity({ rolling_window_seconds: e.target.value })} style={inputStyle} />
                          </FormRow>
                        </div>

                        {/* Breach action */}
                        <FormRow label="On Breach">
                          <div style={{ display: 'flex', gap: 8 }}>
                            {(['PAUSE_RULE', 'STOP_RULE', 'FALLBACK_LP'] as BreachAction[]).map(a => (
                              <button key={a} onClick={() => setSanity({ breach_action: a })} style={{
                                flex: 1, padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                                fontFamily: FONT_MONO, fontSize: 11,
                                border: `1px solid ${draftSanity.breach_action === a ? AMBER : BORDER}`,
                                backgroundColor: draftSanity.breach_action === a ? `${AMBER}14` : BG_FIELD,
                                color: draftSanity.breach_action === a ? AMBER : TEXT_SEC,
                              }}>
                                {a.replace('_', ' ')}
                              </button>
                            ))}
                          </div>
                        </FormRow>

                        {/* Fallback LP */}
                        {draftSanity.breach_action === 'FALLBACK_LP' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <FormRow label="Fallback LP" required>
                              <select value={draftSanity.fallback_lp_id} onChange={e => setSanity({ fallback_lp_id: e.target.value })} style={selectStyle}>
                                <option value="">— Select fallback LP —</option>
                                {enabledLps.filter(lp => lp.lp_id !== draftRule.hedging_lp_id).map(lp => (
                                  <option key={lp.lp_id} value={lp.lp_id}>{lp.lp_name}</option>
                                ))}
                              </select>
                              {draftSanity.fallback_lp_id && (
                                <div style={{ marginTop: 5 }}>
                                  <LpHealthInline health={lpHealthMap.get(draftSanity.fallback_lp_id)} />
                                </div>
                              )}
                            </FormRow>
                            <FormRow label="Fallback LP Account" hint="optional">
                              <input value={draftSanity.fallback_lp_account_id} onChange={e => setSanity({ fallback_lp_account_id: e.target.value })} placeholder="optional" style={inputStyle} />
                            </FormRow>
                          </div>
                        )}

                        {/* Notifications */}
                        <div style={{ display: 'flex', gap: 20, marginBottom: 12 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={draftSanity.notify_on_breach} onChange={e => setSanity({ notify_on_breach: e.target.checked })} />
                            <span style={{ fontSize: 11, color: TEXT_SEC }}>Notify on breach</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="checkbox" checked={draftSanity.notify_on_recovery} onChange={e => setSanity({ notify_on_recovery: e.target.checked })} />
                            <span style={{ fontSize: 11, color: TEXT_SEC }}>Notify on recovery</span>
                          </label>
                        </div>

                        {/* Recovery policy */}
                        <FormRow label="Recovery Policy">
                          <select value={draftSanity.recovery_policy} onChange={e => setSanity({ recovery_policy: e.target.value as RecoveryPolicy })} style={selectStyle}>
                            <option value="AUTO_RESTORE">Auto-restore — route back immediately on recovery</option>
                            <option value="HOLD_THEN_RESTORE">Hold then restore — wait + confirm stability before switching back</option>
                            <option value="MANUAL_ONLY">Manual only — operator must act to restore</option>
                          </select>
                        </FormRow>

                        {draftSanity.recovery_policy === 'HOLD_THEN_RESTORE' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <FormRow label="Hold Period" hint="seconds" required>
                              <input type="number" min={0} value={draftSanity.hold_period_seconds} onChange={e => setSanity({ hold_period_seconds: e.target.value })} placeholder="e.g. 300" style={inputStyle} />
                            </FormRow>
                            <FormRow label="Stability Checks" hint="consecutive" required>
                              <input type="number" min={1} value={draftSanity.stability_confirmations} onChange={e => setSanity({ stability_confirmations: e.target.value })} placeholder="e.g. 5" style={inputStyle} />
                            </FormRow>
                            <FormRow label="Restore Target">
                              <select value={draftSanity.restore_target} onChange={e => setSanity({ restore_target: e.target.value as RestoreTarget })} style={selectStyle}>
                                <option value="ORIGINAL_LP">Return to primary LP</option>
                                <option value="STAY_ON_FALLBACK">Stay on fallback LP</option>
                              </select>
                            </FormRow>
                          </div>
                        )}

                        {/* Final fallback */}
                        <div style={{ margin: '14px 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                          <span style={{ fontSize: 10, color: TEXT_MUT, fontFamily: FONT_MONO, letterSpacing: '0.06em' }}>FINAL FALLBACK — ALL LPs EXHAUSTED</span>
                          <div style={{ flex: 1, height: 1, backgroundColor: BORDER }} />
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          {(Object.entries(FINAL_FALLBACK_CFG) as [FinalFallback, typeof FINAL_FALLBACK_CFG[FinalFallback]][]).map(([k, v]) => (
                            <button key={k} onClick={() => setSanity({ final_fallback_action: k })} style={{
                              flex: 1, padding: '8px 10px', borderRadius: 4, cursor: 'pointer', textAlign: 'left' as const,
                              border: `1px solid ${draftSanity.final_fallback_action === k ? v.color : BORDER}`,
                              backgroundColor: draftSanity.final_fallback_action === k ? `${v.color}12` : BG_FIELD,
                            }}>
                              <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: draftSanity.final_fallback_action === k ? v.color : TEXT_SEC, fontWeight: 600, marginBottom: 3 }}>
                                {v.label}
                              </div>
                              <div style={{ fontSize: 10, color: TEXT_MUT, lineHeight: 1.4 }}>
                                {v.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  )}
                </SectionCard>

                {/* ─────────────────────────────────────────────────
                    SECTION 6 — Activation Window
                ───────────────────────────────────────────────── */}
                <SectionCard n={6} label="Activation Window">
                  <FormRow label="Activation Type">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(['ALWAYS', 'SCHEDULE', 'NEWS_EVENT', 'PNL_TRIGGER', 'MANUAL'] as ActivationType[]).map(t => {
                        const isNewsEvent = t === 'NEWS_EVENT';
                        const isActive = draftRule.activation_type === t;
                        return (
                          <button
                            key={t}
                            onClick={() => { if (!isNewsEvent) setRule({ activation_type: t }); }}
                            title={isNewsEvent ? 'Coming soon — news provider integration pending' : undefined}
                            style={{
                              padding: '5px 12px', borderRadius: 4,
                              cursor: isNewsEvent ? 'not-allowed' : 'pointer',
                              fontFamily: FONT_MONO, fontSize: 11,
                              border: `1px solid ${isActive ? TEAL : BORDER}`,
                              backgroundColor: isActive ? `${TEAL}18` : BG_FIELD,
                              color: isNewsEvent ? TEXT_MUT : isActive ? TEAL : TEXT_SEC,
                              opacity: isNewsEvent ? 0.45 : 1,
                            }}
                          >
                            {t === 'NEWS_EVENT' ? 'NEWS EVENT ·· soon' : t.replace('_', ' ')}
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
                      <span style={{ fontSize: 11, color: TEXT_SEC, fontFamily: FONT_MONO }}>
                        Manual activation — this strategy will only become ACTIVE via explicit manager action in the UI.
                      </span>
                    </div>
                  )}

                  {/* ALWAYS note */}
                  {draftRule.activation_type === 'ALWAYS' && (
                    <div style={{ padding: '8px 12px', borderRadius: 4, backgroundColor: '#0f1c20', border: `1px solid ${BORDER}` }}>
                      <span style={{ fontSize: 11, color: TEXT_SEC, fontFamily: FONT_MONO }}>
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
        </div>{/* end right panel */}
      </div>{/* end body */}
    </div>
  );
}

// ── Tiny action button ────────────────────────────────────────
function ActionBtn({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
      fontSize: 11, fontFamily: FONT_MONO,
      background: 'none', border: `1px solid ${color}55`, color,
      transition: 'background 0.1s',
    }}>
      {label}
    </button>
  );
}