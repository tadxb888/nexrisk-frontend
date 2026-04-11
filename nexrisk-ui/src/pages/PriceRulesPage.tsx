// ============================================================
// PriceRulesPage.tsx
// Feed Config · Spread Rules · Group Spreads
// ============================================================

import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';
import { themeQuartz } from 'ag-grid-community';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';

// ─────────────────────────────────────────────────────────────
// API helper
// ─────────────────────────────────────────────────────────────
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

async function bff<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let msg = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(raw);
      msg = j.error ?? j.message ?? j.detail ?? JSON.stringify(j);
    } catch { if (raw) msg = raw.slice(0, 200); }
    throw new Error(msg);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Colour palette
// ─────────────────────────────────────────────────────────────
const C = {
  page:         '#313032',
  panel:        '#252429',
  card:         '#2e2d32',
  cardHover:    '#353339',
  cardSel:      '#3a3840',
  input:        '#1e1d22',
  inputBorder:  '#4a4852',
  borderLight:  '#50505a',
  border:       '#3d3c42',
  text:         '#ffffff',
  textSec:      '#d4d3d8',
  textHint:     '#9896a8',
  label:        '#c0bfca',
  green:        '#5dd87f',
  amber:        '#e8a020',
  red:          '#f06060',
  teal:         '#4ecdc4',
  blue:         '#7b9cf7',
  orange:       '#f09820',
  purple:       '#c084fc',
  newsGray:     '#6b6a7a',
  divider:      '#3a3840',
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type FeedStatus = 'ACTIVE' | 'PAUSED' | 'STOPPED';
type ConditionType = 'ALWAYS' | 'SCHEDULE' | 'VOLATILITY' | 'NEWS';
type RepricingMethod = 'FIXED_PIPS' | 'PERCENTAGE_OF_SPREAD';
type SpreadMode = 'ASK_ONLY' | 'BID_ONLY' | 'BOTH_SYMMETRIC' | 'FROM_MID';

interface FeedConfig {
  feed_id: number;
  name: string;
  description: string;
  source_lp_id: string;
  mt5_server_id: number;
  target_groups: string[];
  target_logins: number[];
  symbols: string[];
  status: FeedStatus;
  priority: number;
  throttle_enabled: boolean;
  throttle_min_interval_ms: number;
  atr_fast_period: number;
  atr_slow_period: number;
  created_at: string;
  updated_at: string;
}

interface FeedStats {
  pipeline_running: boolean;
  active_feeds: number;
  ticks_delivered: number;
  ticks_dropped: number;
  ticks_throttled: number;
  symbol_misses: number;
  active_news_events: number;
  tracked_vol_symbols: number;
}

interface SpreadRule {
  rule_id: number;
  feed_id: number;
  name: string;
  priority: number;
  enabled: boolean;
  scope: { symbol: string; groups: string[]; logins: number[] };
  condition_type: ConditionType;
  schedule: { days_bitmask: number; hhmm_from: number; hhmm_to: number } | null;
  volatility: { atr_ratio_min: number | null; atr_ratio_max: number | null } | null;
  repricing: {
    method: RepricingMethod;
    bid_adjustment: number;
    ask_adjustment: number;
    rounding_decimals: number;
  };
}

interface NewsEvent {
  event_id: number;
  symbol: string | null;
  event_time: string;
  pre_minutes: number;
  post_minutes: number;
  description: string;
  active_now: boolean;
  window_start: string;
  window_end: string;
  te_calendar_id: string | null;
}

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

interface GroupSpreadRule {
  rule_id?: number;
  mt5_group: string;
  mt5_symbol: string;
  mode: SpreadMode;
  value_points: number;
  ask_offset: number;
  bid_offset: number;
  description: string;
  enabled: boolean;
  created_by: string;
}

interface LPAdmin {
  lp_id: string;
  lp_name: string;
  state: string;
  enabled: boolean;
}

interface MT5NodeMin {
  id: number;
  node_name: string;
  node_type: string;
  connection_status: string;
  is_master: boolean;
  is_enabled: boolean;
}

interface ClusterProfile {
  clusterId?: number;
  cluster_id?: number;
  archetypeId?: number;
  archetype_id?: number;
  archetypeName?: string;
  archetype_name?: string;
  memberCount?: number;
  member_count?: number;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const ARCHETYPE_NAMES: Record<number, string> = {
  1: 'Normal Trader', 2: 'Scalper', 3: 'Rebate Abuser',
  4: 'EA / Bot', 5: 'News Trader', 6: 'Spike Hunter',
  7: 'High Frequency', 8: 'Large Position', 9: 'Outlier',
};
const ARCHETYPE_COLORS: Record<number, string> = {
  1: C.teal, 2: C.red, 3: C.amber, 4: C.purple,
  5: C.blue, 6: C.orange, 7: C.red, 8: C.amber, 9: C.newsGray,
};
const TOXIC_IDS = new Set([2, 3, 4, 5, 6, 7]);

// Static trader classification profiles — always available, no clustering dependency
const TRADER_PROFILES = [
  { name: 'Scalper',         color: '#f06060', toxic: true  },
  { name: 'Rebate Abuser',   color: '#e8a020', toxic: true  },
  { name: 'EA / Bot',        color: '#c084fc', toxic: true  },
  { name: 'Arbitrage',       color: '#f09820', toxic: true  },
  { name: 'News Trader',     color: '#7b9cf7', toxic: true  },
  { name: 'Critical Risk',   color: '#f06060', toxic: true  },
  { name: 'High Risk',       color: '#e8a020', toxic: false },
  { name: 'Spike Hunter',    color: '#f09820', toxic: false },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_BITS = [1, 2, 4, 8, 16, 32, 64];

const ATR_TIERS = [
  { range: '< 0.8',    label: 'Quiet',    hint: 'Tighten spread',     color: C.teal  },
  { range: '0.8–1.2',  label: 'Normal',   hint: 'No change',          color: C.textHint },
  { range: '1.2–2.0',  label: 'Elevated', hint: 'Moderate widen',     color: C.amber },
  { range: '2.0–2.5',  label: 'High',     hint: 'Aggressive widen',   color: C.orange },
  { range: '> 2.5',    label: 'Extreme',  hint: 'Maximum widen',      color: C.red   },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const hhmmToTime = (hhmm: number): string => {
  const h = Math.floor(hhmm / 100).toString().padStart(2, '0');
  const m = (hhmm % 100).toString().padStart(2, '0');
  return `${h}:${m}`;
};
const timeToHhmm = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 100 + (m || 0);
};
const computeOffsets = (mode: SpreadMode, pts: number) => {
  switch (mode) {
    case 'ASK_ONLY':       return { ask: pts, bid: 0 };
    case 'BID_ONLY':       return { ask: 0, bid: pts };
    case 'BOTH_SYMMETRIC': return { ask: pts, bid: -pts };
    case 'FROM_MID':       return { ask: Math.ceil(pts / 2), bid: -Math.floor(pts / 2) };
    default:               return { ask: 0, bid: 0 };
  }
};
const fmtAdj = (v: number): string => (v >= 0 ? `+${v}` : `${v}`);
const conditionColor = (t: ConditionType) =>
  ({ ALWAYS: C.teal, SCHEDULE: C.blue, VOLATILITY: C.orange, NEWS: C.newsGray }[t] || C.textHint);

// ─────────────────────────────────────────────────────────────
// Tiny shared components
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: FeedStatus }) {
  const cfg: Record<FeedStatus, { color: string; bg: string }> = {
    ACTIVE:  { color: C.green, bg: 'rgba(93,216,127,0.1)' },
    PAUSED:  { color: C.amber, bg: 'rgba(232,160,32,0.1)' },
    STOPPED: { color: C.red,   bg: 'rgba(240,96,96,0.1)'  },
  };
  const { color, bg } = cfg[status] ?? cfg.STOPPED;
  return (
    <span style={{
      color, backgroundColor: bg,
      border: `1px solid ${color}33`,
      borderRadius: 4, padding: '1px 8px',
      fontSize: 12, fontWeight: 600, letterSpacing: '0.03em',
    }}>
      {status}
    </span>
  );
}

function ConditionBadge({ type }: { type: ConditionType }) {
  const color = conditionColor(type);
  return (
    <span style={{
      color, backgroundColor: `${color}18`,
      border: `1px solid ${color}44`,
      borderRadius: 4, padding: '1px 8px',
      fontSize: 12, fontWeight: 500,
    }}>
      {type}
    </span>
  );
}

function Toggle({ checked, onChange, size = 'md' }: {
  checked: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md';
}) {
  const w = size === 'sm' ? 32 : 40;
  const h = size === 'sm' ? 18 : 22;
  const d = size === 'sm' ? 12 : 16;
  const pad = 3;
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: w, height: h, borderRadius: h,
        backgroundColor: checked ? C.teal : C.border,
        border: 'none', cursor: 'pointer', position: 'relative',
        transition: 'background-color 0.18s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: pad, borderRadius: '50%',
        width: d, height: d, backgroundColor: '#fff',
        left: checked ? w - d - pad : pad,
        transition: 'left 0.18s',
      }} />
    </button>
  );
}

function DaySelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {DAYS.map((d, i) => {
        const active = (value & DAY_BITS[i]) !== 0;
        return (
          <button key={d} onClick={() => onChange(active ? value & ~DAY_BITS[i] : value | DAY_BITS[i])}
            style={{
              backgroundColor: active ? C.teal : C.card,
              color: active ? '#000' : C.textHint,
              border: `1px solid ${active ? C.teal : C.border}`,
              borderRadius: 4, padding: '3px 8px',
              fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400,
              transition: 'all 0.15s',
            }}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, color: C.label, fontWeight: 500 }}>
        {label}
        {required && <span style={{ color: C.red, marginLeft: 3 }}>*</span>}
      </label>
      {children}
      {hint && <span style={{ fontSize: 11, color: C.textHint }}>{hint}</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: C.input, border: `1px solid ${C.inputBorder}`,
  borderRadius: 5, padding: '6px 10px', color: C.text,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [raw, setRaw] = useState('');
  const safe = Array.isArray(values) ? values : [];
  const add = () => {
    const trimmed = raw.trim();
    if (trimmed && !safe.includes(trimmed)) onChange([...safe, trimmed]);
    setRaw('');
  };
  return (
    <Field label={label}>
      <div style={{
        backgroundColor: C.input, border: `1px solid ${C.inputBorder}`,
        borderRadius: 5, padding: '4px 8px', minHeight: 38, display: 'flex',
        flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}>
        {safe.map(v => (
          <span key={v} style={{
            backgroundColor: C.card, border: `1px solid ${C.border}`,
            borderRadius: 3, padding: '1px 6px', fontSize: 12, color: C.textSec,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {v}
            <span onClick={() => onChange(safe.filter(x => x !== v))}
              style={{ cursor: 'pointer', color: C.red, fontSize: 13, lineHeight: 1 }}>×</span>
          </span>
        ))}
        <input
          value={raw}
          onChange={e => setRaw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={safe.length === 0 ? (placeholder || 'Type and press Enter') : ''}
          style={{
            flex: 1, minWidth: 80, backgroundColor: 'transparent',
            border: 'none', outline: 'none', color: C.text, fontSize: 13,
          }}
        />
      </div>
    </Field>
  );
}

function LoginInput({ values, onChange }: {
  values: number[]; onChange: (v: number[]) => void;
}) {
  const [raw, setRaw] = useState('');
  const safe = Array.isArray(values) ? values : [];
  const add = () => {
    const n = parseInt(raw.trim(), 10);
    if (!isNaN(n) && n > 0 && !safe.includes(n)) onChange([...safe, n]);
    setRaw('');
  };
  return (
    <Field label="MT5 Logins">
      <div style={{
        backgroundColor: C.input, border: `1px solid ${C.inputBorder}`,
        borderRadius: 5, padding: '4px 8px', minHeight: 38, display: 'flex',
        flexWrap: 'wrap', gap: 4, alignItems: 'center',
      }}>
        {safe.map(v => (
          <span key={v} style={{
            backgroundColor: C.card, border: `1px solid ${C.border}`,
            borderRadius: 3, padding: '1px 6px', fontSize: 12, color: C.blue,
          }}>
            {v}
            <span onClick={() => onChange(safe.filter(x => x !== v))}
              style={{ cursor: 'pointer', color: C.red, marginLeft: 4, fontSize: 13 }}>×</span>
          </span>
        ))}
        <input value={raw} onChange={e => setRaw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={safe.length === 0 ? 'Login numbers, Enter to add' : ''}
          style={{
            flex: 1, minWidth: 80, backgroundColor: 'transparent',
            border: 'none', outline: 'none', color: C.text, fontSize: 13,
          }}
        />
      </div>
    </Field>
  );
}

// ─────────────────────────────────────────────────────────────
// Searchable tag input — validates entries against a candidate list
// ─────────────────────────────────────────────────────────────
function SearchableTagInput({ label, values, onChange, candidates, placeholder, required, hint, warn }: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  candidates: string[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  warn?: string; // shown when candidate list is empty
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const safe = Array.isArray(values) ? values : [];
  const isValid = (v: string) => candidates.length === 0 || candidates.includes(v);

  const filtered = query.length >= 1
    ? candidates.filter(c => c.toLowerCase().includes(query.toLowerCase()) && !safe.includes(c)).slice(0, 24)
    : [];

  const add = (sym: string) => {
    if (!safe.includes(sym)) onChange([...safe, sym]);
    setQuery('');
    setOpen(false);
  };

  return (
    <Field label={label} required={required} hint={hint}>
      <div style={{ position: 'relative' }}>
        <div style={{
          backgroundColor: C.input, border: `1px solid ${C.inputBorder}`,
          borderRadius: 5, padding: '4px 8px', minHeight: 38, display: 'flex',
          flexWrap: 'wrap', gap: 4, alignItems: 'center',
        }}>
          {safe.map(v => {
            const valid = isValid(v);
            return (
              <span key={v} style={{
                backgroundColor: valid ? C.card : '#3a1a1a',
                border: `1px solid ${valid ? C.border : C.red}`,
                borderRadius: 3, padding: '1px 6px', fontSize: 12,
                color: valid ? C.textSec : C.red,
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {!valid && <span title="Not found in mapping — add it on Symbol Mapping page">⚠</span>}
                {v}
                <span onClick={() => onChange(safe.filter(x => x !== v))}
                  style={{ cursor: 'pointer', color: C.red, fontSize: 13, lineHeight: 1 }}>×</span>
              </span>
            );
          })}
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 180)}
            placeholder={safe.length === 0 ? (placeholder || 'Type to search…') : ''}
            style={{
              flex: 1, minWidth: 100, backgroundColor: 'transparent',
              border: 'none', outline: 'none', color: C.text, fontSize: 13,
            }}
          />
        </div>

        {/* Dropdown suggestions */}
        {open && filtered.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 200,
            backgroundColor: C.card, border: `1px solid ${C.inputBorder}`,
            borderRadius: 5, maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            {filtered.map(sym => (
              <div key={sym}
                onMouseDown={e => { e.preventDefault(); add(sym); }}
                style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: C.textSec }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.cardHover)}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {sym}
              </div>
            ))}
          </div>
        )}

        {/* No match warning */}
        {open && query.length > 1 && filtered.length === 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 200,
            backgroundColor: '#2e1a1a', border: `1px solid ${C.red}55`,
            borderRadius: 5, padding: '8px 12px', fontSize: 12, color: C.red,
          }}>
            {candidates.length === 0
              ? (warn || 'No data loaded yet')
              : `"${query}" not found — add it first`}
          </div>
        )}
      </div>
    </Field>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 8px' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.textHint, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, backgroundColor: C.divider }} />
    </div>
  );
}

function BtnPrimary({ children, onClick, disabled, small }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; small?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      backgroundColor: disabled ? C.border : C.teal,
      color: disabled ? C.textHint : '#0a0a0a',
      border: 'none', borderRadius: 5,
      padding: small ? '5px 12px' : '7px 16px',
      fontSize: small ? 12 : 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
      transition: 'opacity 0.15s',
    }}>
      {children}
    </button>
  );
}

function BtnDanger({ children, onClick, small }: {
  children: React.ReactNode; onClick?: () => void; small?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: 'transparent',
      color: C.red, border: `1px solid ${C.red}55`,
      borderRadius: 5, padding: small ? '4px 10px' : '6px 14px',
      fontSize: small ? 12 : 13, cursor: 'pointer', transition: 'background 0.15s',
    }}>
      {children}
    </button>
  );
}

function BtnGhost({ children, onClick, small }: {
  children: React.ReactNode; onClick?: () => void; small?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: 'transparent', color: C.textSec,
      border: `1px solid ${C.border}`, borderRadius: 5,
      padding: small ? '4px 10px' : '6px 14px',
      fontSize: small ? 12 : 13, cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss?: () => void }) {
  return (
    <div style={{
      backgroundColor: '#3a1f1f', border: `1px solid ${C.red}66`,
      borderRadius: 6, padding: '8px 14px', fontSize: 13, color: C.red,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span>⚠ {msg}</span>
      {onDismiss && <span onClick={onDismiss} style={{ cursor: 'pointer', marginLeft: 12 }}>×</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Pipeline status bar
// ─────────────────────────────────────────────────────────────

function PipelineBar({ stats }: { stats: FeedStats | null }) {
  if (!stats) return null;
  const dot = stats.pipeline_running ? C.green : C.red;
  const items = [
    { label: 'Active Feeds',      val: stats.active_feeds },
    { label: 'Ticks Delivered',   val: stats.ticks_delivered.toLocaleString() },
    { label: 'Ticks Dropped',     val: stats.ticks_dropped,    warn: stats.ticks_dropped > 0 },
    { label: 'Throttled',         val: stats.ticks_throttled },
    { label: 'Symbol Misses',     val: stats.symbol_misses,    warn: stats.symbol_misses > 0 },
    { label: 'Active News',       val: stats.active_news_events },
    { label: 'Vol Tracked',       val: stats.tracked_vol_symbols },
  ];
  return (
    <div style={{
      backgroundColor: C.panel, borderBottom: `1px solid ${C.border}`,
      padding: '7px 20px', display: 'flex', alignItems: 'center', gap: 20,
      fontSize: 12, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dot, display: 'inline-block' }} />
        <span style={{ color: dot, fontWeight: 600 }}>
          {stats.pipeline_running ? 'Pipeline Running' : 'Pipeline Stopped'}
        </span>
      </div>
      <div style={{ width: 1, height: 16, backgroundColor: C.border }} />
      {items.map(({ label, val, warn }) => (
        <div key={label} style={{ display: 'flex', gap: 5 }}>
          <span style={{ color: C.textHint }}>{label}:</span>
          <span style={{ color: warn ? C.amber : C.textSec, fontWeight: 500 }}>{val}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ── TAB 1 : FEED MANAGEMENT ──────────────────────────────────
// Grid listing of all feeds + right-drawer form for create/edit
// ─────────────────────────────────────────────────────────────

const THROTTLE_INTERVALS = [
  { value: '5',   label: '5 ms'                    },
  { value: '10',  label: '10 ms'                   },
  { value: '20',  label: '20 ms  (LP native)'      },
  { value: '25',  label: '25 ms'                   },
  { value: '50',  label: '50 ms'                   },
  { value: '100', label: '100 ms  (NexRisk default)'},
  { value: '200', label: '200 ms'                  },
  { value: '250', label: '250 ms'                  },
  { value: '500', label: '500 ms'                  },
];

const ATR_FAST_OPTIONS = ['20', '50', '100', '150', '200'];
const ATR_SLOW_OPTIONS = ['50', '100', '150', '200', '300', '500'];

interface FeedForm {
  name: string; description: string; source_lp_id: string; mt5_server_id: string;
  target_groups: string[]; target_logins: number[]; symbols: string[];
  status: FeedStatus; priority: string;
  throttle_enabled: boolean; throttle_min_interval_ms: string;
  atr_fast_period: string; atr_slow_period: string;
}

const blankFeedForm = (): FeedForm => ({
  name: '', description: '', source_lp_id: '', mt5_server_id: '',
  target_groups: [], target_logins: [], symbols: [],
  status: 'STOPPED', priority: '100',
  throttle_enabled: false, throttle_min_interval_ms: '100',
  atr_fast_period: '20', atr_slow_period: '200',
});

const feedToForm = (f: FeedConfig): FeedForm => ({
  name: f.name, description: f.description ?? '',
  source_lp_id: f.source_lp_id, mt5_server_id: String(f.mt5_server_id),
  target_groups: Array.isArray(f.target_groups) ? f.target_groups : [],
  target_logins: Array.isArray(f.target_logins) ? f.target_logins : [],
  symbols: Array.isArray(f.symbols) ? f.symbols : [],
  status: f.status, priority: String(f.priority),
  throttle_enabled: f.throttle_enabled,
  throttle_min_interval_ms: String(f.throttle_min_interval_ms),
  atr_fast_period: String(f.atr_fast_period),
  atr_slow_period: String(f.atr_slow_period),
});

function FeedConfigTab({ feeds, onFeedsChange, stats }: {
  feeds: FeedConfig[]; onFeedsChange: (f: FeedConfig[]) => void; stats: FeedStats | null;
}) {
  const [drawerFeedId, setDrawerFeedId] = useState<number | 'new' | null>(null);
  const [selFeedId,    setSelFeedId]    = useState<number | null>(null);
  const [form, setForm]   = useState<FeedForm>(blankFeedForm());
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [reloading, setReloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok,  setOk]  = useState<string | null>(null);

  // Reference data
  const [lps,           setLps]           = useState<LPAdmin[]>([]);
  const [nodes,         setNodes]         = useState<MT5NodeMin[]>([]);
  const [mappedSymbols, setMappedSymbols] = useState<string[]>([]);
  const [mt5Groups,     setMt5Groups]     = useState<string[]>([]);

  useEffect(() => {
    bff<{ success: boolean; data: { lps: LPAdmin[] } }>('/api/v1/fix/admin/lp')
      .then(r => setLps((r?.data?.lps ?? []).filter(l => l.enabled))).catch(() => {});
    bff<{ nodes: MT5NodeMin[] }>('/api/v1/mt5/nodes')
      .then(r => setNodes(r?.nodes ?? [])).catch(() => {});
    bff<{ mappings: { mt5_symbol: string }[] }>('/api/v1/symbol-mappings')
      .then(r => setMappedSymbols([...new Set((r?.mappings ?? []).map(m => m.mt5_symbol))].sort()))
      .catch(() => {});
  }, []);

  const masterNode = useMemo(() =>
    nodes.find(n => n.is_master && n.connection_status === 'CONNECTED') ??
    nodes.find(n => n.is_master) ??
    nodes.find(n => n.connection_status === 'CONNECTED') ?? null,
  [nodes]);

  useEffect(() => {
    if (!masterNode || mt5Groups.length > 0) return;
    bff<{ groups: { group: string }[] }>(`/api/v1/mt5/nodes/${masterNode.id}/groups`)
      .then(r => setMt5Groups((r?.groups ?? []).map(g => g.group).sort())).catch(() => {});
  }, [masterNode, mt5Groups.length]);

  const lpName   = (id: string)         => lps.find(l => l.lp_id === id)?.lp_name ?? id;
  const nodeName = (id: number | string) => nodes.find(n => n.id === Number(id))?.node_name ?? `MT5 #${id}`;

  const openNew = () => {
    const blank = blankFeedForm();
    if (masterNode) blank.mt5_server_id = String(masterNode.id);
    if (lps.length === 1) blank.source_lp_id = lps[0].lp_id;
    setForm(blank);
    setDrawerFeedId('new');
    setErr(null); setOk(null);
  };

  const openEdit = (f: FeedConfig) => {
    setForm(feedToForm(f));
    setDrawerFeedId(f.feed_id);
    setSelFeedId(f.feed_id);
    setErr(null); setOk(null);
  };

  const selectRow = (f: FeedConfig) => {
    if (selFeedId === f.feed_id) {
      // Clicking same row again collapses both panels
      setSelFeedId(null);
      setDrawerFeedId(null);
      setErr(null); setOk(null);
    } else {
      openEdit(f);
    }
  };

  const closeDrawer = () => { setDrawerFeedId(null); setSelFeedId(null); setErr(null); setOk(null); };

  const set = (k: keyof FeedForm, v: any) => setForm(x => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true); setErr(null); setOk(null);
    try {
      const body = {
        name: form.name, description: form.description,
        source_lp_id: form.source_lp_id, mt5_server_id: Number(form.mt5_server_id),
        target_groups: form.target_groups, target_logins: form.target_logins,
        symbols: form.symbols, status: form.status, priority: Number(form.priority),
        throttle_enabled: form.throttle_enabled,
        throttle_min_interval_ms: Number(form.throttle_min_interval_ms),
        atr_fast_period: Number(form.atr_fast_period),
        atr_slow_period: Number(form.atr_slow_period),
      };
      if (drawerFeedId === 'new') {
        await bff<{ feed_id: number }>('/api/v1/feeds', { method: 'POST', body: JSON.stringify(body) });
      } else {
        await bff('/api/v1/feeds/' + drawerFeedId, { method: 'PUT', body: JSON.stringify(body) });
      }
      const updated = await bff<FeedConfig[]>('/api/v1/feeds');
      onFeedsChange(updated);
      // Re-select so detail panel reads from the freshly fetched feed object
      if (typeof drawerFeedId === 'number') {
        setSelFeedId(null);
        setTimeout(() => setSelFeedId(drawerFeedId as number), 0);
      }
      setOk(drawerFeedId === 'new' ? 'Feed created' : 'Saved');
      if (drawerFeedId === 'new') closeDrawer();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  const patchStatus = async (feedId: number, status: FeedStatus) => {
    try {
      await bff(`/api/v1/feeds/${feedId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      const updated = await bff<FeedConfig[]>('/api/v1/feeds');
      onFeedsChange(updated);
      // keep form in sync if this feed is open in the drawer
      if (drawerFeedId === feedId) setForm(f => ({ ...f, status }));
    } catch (e: any) { setErr(e.message); }
  };

  const deleteFeed = async (feedId: number, name: string) => {
    if (!window.confirm(`Delete feed "${name}"?`)) return;
    setDeleting(feedId);
    try {
      await bff('/api/v1/feeds/' + feedId, { method: 'DELETE' });
      const updated = await bff<FeedConfig[]>('/api/v1/feeds');
      onFeedsChange(updated);
      if (drawerFeedId === feedId) closeDrawer();
    } catch (e: any) { setErr(e.message); }
    setDeleting(null);
  };

  const reload = async (feedId: number) => {
    setReloading(true);
    try {
      await bff(`/api/v1/feeds/${feedId}/reload`, { method: 'POST' });
      setOk('Config reloaded — ATR warm-up reset');
    } catch (e: any) { setErr(e.message); }
    setReloading(false);
  };

  const f = form;

  const STATUS_CFG: Record<FeedStatus, { color: string; bg: string }> = {
    ACTIVE:  { color: C.green,  bg: 'rgba(93,216,127,0.12)' },
    PAUSED:  { color: C.amber,  bg: 'rgba(232,160,32,0.12)' },
    STOPPED: { color: C.red,    bg: 'rgba(240,96,96,0.12)'  },
  };

  const drawerOpen = drawerFeedId !== null;
  const drawerFeed = typeof drawerFeedId === 'number' ? feeds.find(f => f.feed_id === drawerFeedId) ?? null : null;

  const selFeed = feeds.find(f => f.feed_id === selFeedId) ?? null;
  const panelOpen = selFeedId !== null;
  const selFeedForm = selFeed ? feedToForm(selFeed) : null;

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Grid column — shrinks when panels open ────────────── */}
      <div style={{ flex: panelOpen ? '0 0 38%' : 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, transition: 'flex 0.2s' }}>

        {/* Toolbar */}
        <div style={{
          padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          backgroundColor: C.panel,
        }}>
          <BtnPrimary small onClick={openNew}>+ New Feed</BtnPrimary>
          {err && <ErrorBanner msg={err} onDismiss={() => setErr(null)} />}
          {ok  && <span style={{ fontSize: 12, color: C.green }}>{ok}</span>}
        </div>

        {/* Feed grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {feeds.length === 0 && !drawerOpen && (
            <div style={{ marginTop: 60, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 14, color: C.textHint }}>No feeds configured yet.</span>
              <BtnPrimary onClick={openNew}>+ Create your first feed</BtnPrimary>
            </div>
          )}
          {feeds.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Feed', 'LP → MT5', 'Status', 'Priority', 'Throttle', 'ATR', ''].map(h => (
                    <th key={h} style={{
                      padding: '7px 12px', textAlign: 'left',
                      fontSize: 11, fontWeight: 600, color: C.textHint,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {feeds.map(feed => {
                  const sc = STATUS_CFG[feed.status] ?? STATUS_CFG.STOPPED;
                  const isOpen = drawerFeedId === feed.feed_id;
                  return (
                    <tr key={feed.feed_id}
                      onClick={() => selectRow(feed)}
                      style={{
                        borderBottom: `1px solid ${C.border}`,
                        backgroundColor: isOpen ? C.cardSel : 'transparent',
                        cursor: 'pointer', transition: 'background 0.12s',
                        borderLeft: isOpen ? `3px solid ${C.teal}` : '3px solid transparent',
                      }}
                      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = C.card; }}
                      onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent'; }}
                    >
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ fontWeight: 600, color: C.text }}>{feed.name}</div>
                        {feed.description && <div style={{ fontSize: 11, color: C.textHint, marginTop: 1 }}>{feed.description}</div>}
                      </td>
                      <td style={{ padding: '9px 12px', color: C.textSec }}>
                        {lpName(feed.source_lp_id)}
                        <span style={{ color: C.textHint, margin: '0 5px' }}>→</span>
                        {nodeName(feed.mt5_server_id)}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{
                            backgroundColor: sc.bg, color: sc.color,
                            border: `1px solid ${sc.color}44`,
                            borderRadius: 4, padding: '2px 8px',
                            fontSize: 11, fontWeight: 600, minWidth: 58, textAlign: 'center',
                          }}>{feed.status}</span>
                          {(['ACTIVE','STOPPED'] as FeedStatus[]).filter(s => s !== feed.status).map(s => {
                            const c2 = STATUS_CFG[s];
                            return (
                              <button key={s} onClick={e => { e.stopPropagation(); patchStatus(feed.feed_id, s); }} title={`Set ${s}`}
                                style={{ fontSize: 10, padding: '2px 5px', borderRadius: 3, cursor: 'pointer', backgroundColor: 'transparent', color: C.textHint, border: `1px solid ${C.border}` }}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = c2.color; (e.currentTarget as HTMLButtonElement).style.borderColor = c2.color; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.textHint; (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; }}
                              >{s[0]}</button>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', color: C.textSec, fontFamily: 'monospace' }}>{feed.priority}</td>
                      <td style={{ padding: '9px 12px', fontSize: 12 }}>
                        {feed.throttle_enabled
                          ? <span style={{ color: C.amber }}>On · {feed.throttle_min_interval_ms} ms</span>
                          : <span style={{ color: C.textHint }}>Off</span>}
                      </td>
                      <td style={{ padding: '9px 12px', color: C.textSec, fontFamily: 'monospace', fontSize: 12 }}>
                        {feed.atr_fast_period} / {feed.atr_slow_period}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'flex', gap: 5 }}>

                          <button onClick={e => { e.stopPropagation(); reload(feed.feed_id); }}
                            title="Force the C++ service to re-read this feed config from the database, reset ATR warm-up state, and refresh the news event cache. Use after a service restart or if settings appear out of sync."
                            style={{
                              fontSize: 12, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                              backgroundColor: C.card, color: C.textHint, border: `1px solid ${C.border}`,
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                            <span style={{ fontSize: 13 }}>↻</span> Sync
                          </button>
                          <button onClick={e => { e.stopPropagation(); deleteFeed(feed.feed_id, feed.name); }} disabled={deleting === feed.feed_id} style={{
                            fontSize: 12, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                            backgroundColor: 'transparent', color: C.red, border: `1px solid ${C.red}55`,
                          }}>{deleting === feed.feed_id ? 'Deleting…' : 'Delete'}</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>{/* end grid column */}

      {/* ── Middle: detail panel — selected feed info ─────────── */}
      {panelOpen && selFeed && (
        <div style={{
          width: '25%', minWidth: 220, borderLeft: `1px solid ${C.border}`,
          backgroundColor: C.card, display: 'flex', flexDirection: 'column',
          flexShrink: 0, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selFeed.name}</div>
            <div style={{ fontSize: 11, color: C.textHint, marginTop: 2 }}>{selFeed.description || 'No description'}</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Symbols table */}
            {(() => {
              const syms: string[] = selFeedForm?.symbols ?? [];
              return (
                <div>
                  <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
                    SYMBOL FILTER
                    <span style={{ color: C.textHint, fontWeight: 400, marginLeft: 6 }}>
                      {syms.length === 0 ? '(all symbols)' : `${syms.length} symbol${syms.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {syms.length === 0 ? (
                    <span style={{ fontSize: 12, color: C.textHint, fontStyle: 'italic' }}>All symbols — no filter applied</span>
                  ) : (
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                          {syms.map((s, i) => (
                            <tr key={s} style={{ borderBottom: i < syms.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: C.teal }}>{s}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Groups table */}
            {(() => {
              const grps: string[] = selFeedForm?.target_groups ?? [];
              return (
                <div>
                  <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
                    TARGET MT5 GROUPS
                    <span style={{ color: C.textHint, fontWeight: 400, marginLeft: 6 }}>
                      {grps.length === 0 ? '(all groups)' : `${grps.length} group${grps.length !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {grps.length === 0 ? (
                    <span style={{ fontSize: 12, color: C.textHint, fontStyle: 'italic' }}>All groups — no filter applied</span>
                  ) : (
                    <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <tbody>
                          {grps.map((g, i) => (
                            <tr key={g} style={{ borderBottom: i < grps.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: C.blue, wordBreak: 'break-all' }}>{g}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Pipeline stats */}
            {stats && (
              <div>
                <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>
                  PIPELINE STATS
                  <span style={{ fontSize: 10, color: C.textHint, fontWeight: 400, marginLeft: 5 }}>(all active feeds)</span>
                </div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <tbody>
                      {[
                        { label: 'Ticks Delivered', val: stats.ticks_delivered.toLocaleString(), warn: false },
                        { label: 'Ticks Dropped',   val: stats.ticks_dropped,   warn: stats.ticks_dropped > 0 },
                        { label: 'Throttled',        val: stats.ticks_throttled, warn: false },
                        { label: 'Symbol Misses',    val: stats.symbol_misses,   warn: stats.symbol_misses > 0 },
                        { label: 'Vol Tracked',      val: stats.tracked_vol_symbols, warn: false },
                      ].map(({ label, val, warn }, i, arr) => (
                        <tr key={label} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                          <td style={{ padding: '6px 10px', color: C.textHint }}>{label}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: warn ? C.amber : C.textSec, fontFamily: 'monospace' }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Audit — timestamps only, no dummy fields */}
            <div>
              <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>AUDIT</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 5, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <tbody>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '6px 10px', color: C.textHint }}>Created</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: C.textSec }}>
                        {selFeed.created_at ? new Date(selFeed.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ padding: '6px 10px', color: C.textHint }}>Last Updated</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', color: C.textSec }}>
                        {selFeed.updated_at ? new Date(selFeed.updated_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Right: edit/create panel ──────────────────────────── */}
      {drawerOpen && (
        <div style={{
          flex: 1, minWidth: 360,
          borderLeft: `1px solid ${C.border}`,
          backgroundColor: C.panel,
          display: 'flex', flexDirection: 'column',
          flexShrink: 0, overflow: 'hidden',
        }}>
          {/* Panel header */}
          <div style={{
            padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {drawerFeedId === 'new' ? 'New Feed' : `Edit — ${drawerFeed?.name ?? ''}`}
              </span>
              {ok  && <span style={{ fontSize: 12, color: C.green  }}>{ok}</span>}
              {err && <span style={{ fontSize: 12, color: C.red    }}>{err}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>

              <BtnPrimary small onClick={save} disabled={saving}>
                {saving ? 'Saving…' : drawerFeedId === 'new' ? 'Create' : 'Save'}
              </BtnPrimary>
              <button onClick={closeDrawer} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.textHint, fontSize: 20, lineHeight: 1,
              }}>×</button>
            </div>
          </div>

          {/* Panel body */}
          <div style={{ flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', minHeight: 0 }}>

            {/* Status — ACTIVE and STOP only */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([
                { s: 'ACTIVE'  as FeedStatus, sub: 'Ticks flow · ATR evaluates' },
                { s: 'STOPPED' as FeedStatus, sub: ''                           },
              ]).map(({ s, sub }) => {
                const active = f.status === s;
                const sc = STATUS_CFG[s];
                return (
                  <button key={s}
                    onClick={() => { set('status', s); if (drawerFeedId !== 'new') patchStatus(drawerFeedId as number, s); }}
                    style={{
                      padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                      backgroundColor: active ? sc.bg : C.input,
                      color: active ? sc.color : C.textHint,
                      border: `1px solid ${active ? sc.color : C.border}`,
                      textAlign: 'left', transition: 'all 0.15s',
                    }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s}</div>
                    {sub && <div style={{ fontSize: 10, marginTop: 2, color: active ? sc.color : C.textHint, opacity: 0.85, lineHeight: 1.3 }}>{sub}</div>}
                  </button>
                );
              })}
            </div>

            {/* Name + Priority */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <Field label="Feed Name" required>
                <input style={inputStyle} value={f.name}
                  onChange={e => set('name', e.target.value)} placeholder="e.g. TE Main Feed" />
              </Field>
              <Field label="Priority">
                <input style={{ ...inputStyle, width: 72 }} inputMode="numeric" value={f.priority}
                  onChange={e => set('priority', e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
            </div>

            {/* Description */}
            <Field label="Description" hint="Shown as subtitle under the feed name in the grid">
              <input style={{ ...inputStyle, fontSize: 12 }} value={f.description}
                onChange={e => set('description', e.target.value)} placeholder="Optional — e.g. Primary TE production feed" />
            </Field>

            {/* LP + MT5 on same line */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Liquidity Provider" required>
                {lps.length === 0
                  ? <div style={{ fontSize: 12, color: C.textHint, padding: '7px 0' }}>Loading…</div>
                  : <select style={selectStyle} value={f.source_lp_id} onChange={e => set('source_lp_id', e.target.value)}>
                      <option value="">— Select LP —</option>
                      {lps.map(lp => <option key={lp.lp_id} value={lp.lp_id}>{lp.lp_name}</option>)}
                    </select>
                }
              </Field>
              <Field label="MT5 Server" required hint="Master node only — symbol and group filters depend on it">
                {nodes.length === 0
                  ? <div style={{ fontSize: 12, color: C.textHint, padding: '7px 0' }}>Loading…</div>
                  : masterNode
                    ? <select style={selectStyle} value={f.mt5_server_id} onChange={e => set('mt5_server_id', e.target.value)}>
                        <option value="">— Select node —</option>
                        <option value={String(masterNode.id)}>
                          {masterNode.node_name} ★ — {masterNode.connection_status}
                        </option>
                      </select>
                    : <div style={{ fontSize: 12, color: C.red, padding: '7px 0' }}>
                        No master node connected — configure one in Node Management
                      </div>
                }
              </Field>
            </div>

            {/* Symbol + Groups on same line */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <SearchableTagInput
                label="Symbol Filter"
                values={f.symbols}
                onChange={v => set('symbols', v)}
                candidates={mappedSymbols}
                placeholder="All symbols"
                hint="Empty = all symbols"
                warn="Loading…"
              />
              <SearchableTagInput
                label="Target MT5 Groups"
                values={f.target_groups}
                onChange={v => set('target_groups', v)}
                candidates={mt5Groups}
                placeholder="All groups"
                hint="Empty = all groups"
                warn={masterNode ? 'Loading…' : 'No master node'}
              />
            </div>

            {/* Throttle */}
            <div style={{
              border: `1px solid ${f.throttle_enabled ? C.amber : 'rgba(255,255,255,0.18)'}`,
              borderRadius: 6, padding: '9px 12px', transition: 'border-color 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <Toggle checked={f.throttle_enabled} onChange={v => set('throttle_enabled', v)} size="sm" />
                <span style={{ fontSize: 12, fontWeight: 600, color: f.throttle_enabled ? C.amber : 'rgba(255,255,255,0.4)' }}>
                  Tick Throttle {f.throttle_enabled ? 'On' : 'Off'}
                </span>
              </div>
              <select style={{ ...selectStyle, opacity: f.throttle_enabled ? 1 : 0.4 }}
                value={f.throttle_min_interval_ms} onChange={e => set('throttle_min_interval_ms', e.target.value)}>
                {THROTTLE_INTERVALS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            {/* ATR */}
            <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em' }}>
              ATR VOLATILITY MODEL
              <span style={{ fontSize: 11, color: C.textHint, fontWeight: 400, marginLeft: 6 }}>
                running live · thresholds set in Spread Rules
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Fast EMA Period" hint="Sensitivity to spikes">
                <select style={selectStyle} value={f.atr_fast_period} onChange={e => set('atr_fast_period', e.target.value)}>
                  {ATR_FAST_OPTIONS.map(v => <option key={v} value={v}>{v} ticks</option>)}
                </select>
              </Field>
              <Field label="Slow EMA Period" hint="Baseline stability">
                <select style={selectStyle} value={f.atr_slow_period} onChange={e => set('atr_slow_period', e.target.value)}>
                  {ATR_SLOW_OPTIONS.filter(v => Number(v) > Number(f.atr_fast_period)).map(v => (
                    <option key={v} value={v}>{v} ticks{v === '200' ? ' (default)' : ''}</option>
                  ))}
                </select>
              </Field>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ── SYMBOL INPUT WITH TYPEAHEAD ──────────────────────────────
// ─────────────────────────────────────────────────────────────

function SymbolInput({ value, onChange, candidates }: {
  value: string; onChange: (v: string) => void; candidates: string[];
}) {
  const [query, setQuery] = useState('');
  const [open,  setOpen]  = useState(false);
  const selected = value.trim() !== '';
  const filtered = query.length >= 1
    ? candidates.filter(c => c.includes(query.toUpperCase())).slice(0, 20)
    : [];

  const select = (sym: string) => { onChange(sym); setQuery(''); setOpen(false); };
  const clear  = ()            => { onChange('');  setQuery(''); };

  return (
    <div style={{ position: 'relative' }}>
      {selected ? (
        <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: C.teal }}>{value}</span>
          <span onClick={clear} title="Clear"
            style={{ cursor: 'pointer', color: C.textHint, fontSize: 16, lineHeight: 1, marginLeft: 8 }}>×</span>
        </div>
      ) : (
        <input
          style={inputStyle}
          value={query}
          onChange={e => { setQuery(e.target.value.toUpperCase()); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="Type to search — empty = all symbols"
        />
      )}
      {open && !selected && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 300,
          backgroundColor: C.card, border: `1px solid ${C.inputBorder}`,
          borderRadius: 5, maxHeight: 180, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          {filtered.map(sym => (
            <div key={sym}
              onMouseDown={e => { e.preventDefault(); select(sym); }}
              style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: C.textSec }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >{sym}</div>
          ))}
        </div>
      )}
      {open && !selected && query.length > 1 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 300,
          backgroundColor: '#2e1a1a', border: `1px solid ${C.red}55`,
          borderRadius: 5, padding: '8px 12px', fontSize: 12, color: C.red,
        }}>
          "{query}" not in Symbol Mapping — add it on the Symbol Mapping page first
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ── RULE EDITOR (right-side panel) ───────────────────────────
// ─────────────────────────────────────────────────────────────

interface RuleFormState {
  name: string; enabled: boolean;
  feed_id: string;
  scope_symbol: string; scope_groups: string[];
  condition_type: ConditionType;
  days_bitmask: number; hhmm_from: string; hhmm_to: string;
  atr_min: string; atr_max: string;
  spread_mode: SpreadMode; value_points: string;
  // NEWS condition
  news_te_cal_id:  string;   // te_calendar_id from picker
  news_pre_min:    string;   // pre_minutes
  news_post_min:   string;   // post_minutes
  news_symbol:     string;   // optional symbol scope
}

const blankRule = (defaultFeedId?: number): RuleFormState => ({
  name: '', enabled: true,
  feed_id: defaultFeedId ? String(defaultFeedId) : '',
  scope_symbol: '', scope_groups: [],
  condition_type: 'ALWAYS',
  days_bitmask: 31, hhmm_from: '08:00', hhmm_to: '16:30',
  atr_min: '', atr_max: '',
  spread_mode: 'FROM_MID', value_points: '10',
  news_te_cal_id: '', news_pre_min: '5', news_post_min: '10', news_symbol: '',
});

const inferModeAndPoints = (bid: number, ask: number): { mode: SpreadMode; pts: number } => {
  if (bid === 0 && ask > 0)  return { mode: 'ASK_ONLY',       pts: Math.round(ask) };
  if (ask === 0 && bid > 0)  return { mode: 'BID_ONLY',        pts: Math.round(bid) };
  if (ask > 0 && bid < 0 && Math.abs(ask) === Math.abs(bid))
                              return { mode: 'BOTH_SYMMETRIC',  pts: Math.round(ask) };
  if (ask > 0 && bid < 0)    return { mode: 'FROM_MID',        pts: Math.round(ask - bid) };
  return { mode: 'FROM_MID', pts: 10 };
};

const ruleToForm = (r: SpreadRule): RuleFormState => {
  const { mode, pts } = inferModeAndPoints(r.repricing.bid_adjustment, r.repricing.ask_adjustment);
  return {
    name: r.name, enabled: r.enabled,
    feed_id: String(r.feed_id),
    scope_symbol: r.scope.symbol,
    scope_groups: Array.isArray(r.scope.groups) ? r.scope.groups : [],
    condition_type: r.condition_type,
    days_bitmask: r.schedule?.days_bitmask ?? 31,
    hhmm_from: hhmmToTime(r.schedule?.hhmm_from ?? 800),
    hhmm_to:   hhmmToTime(r.schedule?.hhmm_to   ?? 1630),
    atr_min: r.volatility?.atr_ratio_min != null ? String(r.volatility.atr_ratio_min) : '',
    atr_max: r.volatility?.atr_ratio_max != null ? String(r.volatility.atr_ratio_max) : '',
    spread_mode: mode, value_points: String(pts),
    // NEWS fields — populated separately when picker is opened
    news_te_cal_id: '', news_pre_min: '5', news_post_min: '10', news_symbol: '',
  };
};

function RuleEditor({ feeds, rule, nextPriority, mappedSymbols, mt5Groups, onToggle, onSave, onClose }: {
  feeds: FeedConfig[];
  rule: SpreadRule | null;
  nextPriority: number;
  mappedSymbols: string[];
  mt5Groups: string[];
  onToggle?: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const defaultFeedId = feeds.length === 1 ? feeds[0].feed_id : undefined;
  const [form, setForm] = useState<RuleFormState>(rule ? ruleToForm(rule) : blankRule(defaultFeedId));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ── Calendar / NEWS picker state ────────────────────────────
  const [calEvents,     setCalEvents]     = useState<CalendarEvent[]>([]);
  const [calLoading,    setCalLoading]    = useState(false);
  const [calSearch,     setCalSearch]     = useState('');
  const [calImportance, setCalImportance] = useState<number[]>([2, 3]);
  const [calPickerOpen, setCalPickerOpen] = useState(false);
  const [selCalEvt,     setSelCalEvt]     = useState<CalendarEvent | null>(null);
  const calMountedRef = useRef(true);
  useEffect(() => { calMountedRef.current = true; return () => { calMountedRef.current = false; }; }, []);

  const loadCalEvents = useCallback(async (imp: number[]) => {
    setCalLoading(true);
    try {
      const today = new Date();
      const from  = today.toISOString().slice(0, 10);
      const to    = new Date(today.getTime() + 14 * 86400_000).toISOString().slice(0, 10);
      const res   = await bff<CalendarEvent[]>(
        `/api/v1/calendar/events?importance=${imp.join(',')}&from=${from}&to=${to}&limit=500`
      );
      if (calMountedRef.current) setCalEvents(Array.isArray(res) ? res : []);
    } catch { /* best effort */ }
    finally { if (calMountedRef.current) setCalLoading(false); }
  }, []);

  const openCalPicker = () => {
    if (calEvents.length === 0) loadCalEvents(calImportance);
    setCalPickerOpen(true);
  };

  const selectCalEvt = (evt: CalendarEvent) => {
    setSelCalEvt(evt);
    sf('news_te_cal_id', evt.calendar_id);
    setCalPickerOpen(false);
    setCalSearch('');
  };

  const clearCalEvt = () => {
    setSelCalEvt(null);
    sf('news_te_cal_id', '');
  };

  // ── Form helpers ────────────────────────────────────────────
  const sf = (k: keyof RuleFormState, v: any) => setForm(x => ({ ...x, [k]: v }));
  const ct  = form.condition_type;
  const pts = Number(form.value_points) || 0;
  const off = computeOffsets(form.spread_mode, pts);

  const buildPayload = () => {
    const payload: Record<string, any> = {
      name: form.name, enabled: form.enabled,
      priority: rule?.priority ?? nextPriority,
      scope: { symbol: form.scope_symbol, groups: form.scope_groups, logins: [] },
      condition_type: ct,
      schedule: ct === 'SCHEDULE' ? {
        days_bitmask: form.days_bitmask,
        hhmm_from: timeToHhmm(form.hhmm_from),
        hhmm_to:   timeToHhmm(form.hhmm_to),
      } : null,
      volatility: ct === 'VOLATILITY' ? {
        atr_ratio_min: form.atr_min !== '' ? Number(form.atr_min) : null,
        atr_ratio_max: form.atr_max !== '' ? Number(form.atr_max) : null,
      } : null,
      repricing: { method: 'FIXED_PIPS', bid_adjustment: off.bid, ask_adjustment: off.ask },
    };
    return payload;
  };

  const save = async () => {
    if (!form.name.trim())  { setErr('Rule name is required'); return; }
    if (!form.feed_id)      { setErr('Select a feed'); return; }
    if (ct === 'NEWS' && !form.news_te_cal_id) {
      setErr('Select an economic event for the NEWS condition'); return;
    }
    setSaving(true); setErr(null);
    try {
      const feedId = Number(form.feed_id);

      // For NEWS condition: create/update the news window first
      if (ct === 'NEWS' && form.news_te_cal_id) {
        await bff('/api/v1/price-rules/news', {
          method: 'POST',
          body: JSON.stringify({
            te_calendar_id: form.news_te_cal_id,
            pre_minutes:    Number(form.news_pre_min)  || 5,
            post_minutes:   Number(form.news_post_min) || 10,
            ...(form.news_symbol ? { symbol: form.news_symbol } : {}),
          }),
        });
      }

      const payload = buildPayload();
      if (rule) {
        await bff(`/api/v1/price-rules/feeds/${feedId}/rules/${rule.rule_id}`, {
          method: 'PUT', body: JSON.stringify(payload),
        });
      } else {
        await bff(`/api/v1/price-rules/feeds/${feedId}/rules`, {
          method: 'POST', body: JSON.stringify(payload),
        });
      }
      onSave();
    } catch (e: any) { setErr(e.message); }
    setSaving(false);
  };

  // Importance star renderer (inline — no shared component in this file)
  const impStars = (v: 1 | 2 | 3) => {
    const color = v === 3 ? C.red : v === 2 ? C.amber : C.textHint;
    return <span style={{ fontFamily: 'monospace', fontSize: 11, color, letterSpacing: 1 }}>{'★'.repeat(v)}{'☆'.repeat(3 - v)}</span>;
  };

  return (
    <div style={{
      width: '40%', minWidth: 380, maxWidth: 560, borderLeft: `1px solid ${C.border}`,
      backgroundColor: C.panel, display: 'flex', flexDirection: 'column', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            {rule ? 'Edit Spread Rule' : 'New Spread Rule'}
          </span>
          {err && <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>{err}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Toggle checked={form.enabled} onChange={v => sf('enabled', v)} size="sm" />
          <span style={{ fontSize: 12, color: form.enabled ? C.green : C.textHint }}>
            {form.enabled ? 'Enabled' : 'Disabled'}
          </span>
          <BtnPrimary small onClick={save} disabled={saving}>
            {saving ? 'Saving…' : rule ? 'Save' : 'Create'}
          </BtnPrimary>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textHint, fontSize: 20 }}>×</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Feed selector — only shown when creating and multiple feeds exist */}
        {!rule && feeds.length > 1 && (
          <Field label="Feed" required>
            <select style={selectStyle} value={form.feed_id} onChange={e => sf('feed_id', e.target.value)}>
              <option value="">— Select feed —</option>
              {feeds.map(f => <option key={f.feed_id} value={String(f.feed_id)}>{f.name}</option>)}
            </select>
          </Field>
        )}

        <Field label="Rule Name" required>
          <input style={inputStyle} value={form.name}
            onChange={e => sf('name', e.target.value)}
            placeholder="e.g. London Session Tighten" />
        </Field>

        {/* Condition */}
        <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em' }}>CONDITION</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {(['ALWAYS', 'SCHEDULE', 'VOLATILITY', 'NEWS'] as ConditionType[]).map(condType => {
            const active = ct === condType;
            const clr = conditionColor(condType);
            return (
              <button key={condType}
                onClick={() => { sf('condition_type', condType); if (condType !== 'NEWS') setCalPickerOpen(false); }}
                style={{
                  padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                  backgroundColor: active ? `${clr}18` : C.input,
                  border: `1px solid ${active ? clr : C.border}`,
                  color: active ? clr : C.textSec,
                  textAlign: 'left', fontSize: 12, fontWeight: active ? 600 : 400,
                }}>
                {condType}
              </button>
            );
          })}
        </div>

        {ct === 'SCHEDULE' && (
          <div style={{ backgroundColor: `${C.blue}0c`, border: `1px solid ${C.blue}25`, borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Active Days">
              <DaySelector value={form.days_bitmask} onChange={v => sf('days_bitmask', v)} />
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="From (UTC)">
                <input style={{ ...inputStyle, width: 100 }} type="time" value={form.hhmm_from} onChange={e => sf('hhmm_from', e.target.value)} />
              </Field>
              <Field label="To (UTC)">
                <input style={{ ...inputStyle, width: 100 }} type="time" value={form.hhmm_to} onChange={e => sf('hhmm_to', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        {ct === 'VOLATILITY' && (
          <div style={{ backgroundColor: `${C.orange}0c`, border: `1px solid ${C.orange}25`, borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="ATR Ratio Min" hint="null = no lower bound">
                <input style={{ ...inputStyle, width: 90 }} type="text" inputMode="decimal"
                  value={form.atr_min} onChange={e => sf('atr_min', e.target.value)} placeholder="e.g. 2.0" />
              </Field>
              <Field label="ATR Ratio Max" hint="null = no upper bound">
                <input style={{ ...inputStyle, width: 90 }} type="text" inputMode="decimal"
                  value={form.atr_max} onChange={e => sf('atr_max', e.target.value)} placeholder="e.g. 2.5" />
              </Field>
            </div>
            {ATR_TIERS.map(t => (
              <div key={t.range} style={{ display: 'flex', gap: 6, fontSize: 11 }}>
                <span style={{ width: 50, color: t.color, fontFamily: 'monospace', fontWeight: 600 }}>{t.range}</span>
                <span style={{ color: C.textHint }}>{t.label} → {t.hint}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── NEWS condition ─────────────────────────────────── */}
        {ct === 'NEWS' && (
          <div style={{
            backgroundColor: `${C.newsGray}0a`, border: `1px solid ${C.newsGray}33`,
            borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em' }}>
              ECONOMIC EVENT WINDOW
            </div>

            {/* Selected event chip or picker trigger */}
            {selCalEvt && selCalEvt.calendar_id === form.news_te_cal_id ? (
              <div style={{
                backgroundColor: C.card, border: `1px solid ${C.teal}44`,
                borderRadius: 5, padding: '8px 10px',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                    {impStars(selCalEvt.importance)}
                    <span style={{ fontSize: 12, color: C.teal, fontWeight: 600 }}>{selCalEvt.event_name}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      backgroundColor: selCalEvt.status === 'SCHEDULED' ? `${C.teal}18` : `${C.amber}18`,
                      color: selCalEvt.status === 'SCHEDULED' ? C.teal : C.amber,
                      border: `1px solid ${selCalEvt.status === 'SCHEDULED' ? C.teal : C.amber}44`,
                    }}>{selCalEvt.status}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.textHint, flexWrap: 'wrap' }}>
                    <span>
                      {new Date(selCalEvt.event_time_utc).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                      })} UTC
                    </span>
                    <span>{selCalEvt.country}</span>
                    {selCalEvt.currency && <span>{selCalEvt.currency}</span>}
                    {selCalEvt.consensus && <span>Cons: <span style={{ color: C.textSec }}>{selCalEvt.consensus}</span></span>}
                    {selCalEvt.previous  && <span>Prev: <span style={{ color: C.textSec }}>{selCalEvt.previous}</span></span>}
                  </div>
                </div>
                <button onClick={clearCalEvt} title="Clear event"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textHint, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            ) : (
              <button onClick={openCalPicker} style={{
                padding: '8px 12px', borderRadius: 5, cursor: 'pointer',
                backgroundColor: C.input, textAlign: 'left',
                border: `1px solid ${form.news_te_cal_id ? C.amber : C.inputBorder}`,
                color: C.textSec, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: C.teal }}>📅</span>
                {form.news_te_cal_id
                  ? `Event ID ${form.news_te_cal_id} — click to resolve`
                  : 'Select Economic Event…'}
              </button>
            )}

            {/* Inline calendar picker */}
            {calPickerOpen && (
              <div style={{
                backgroundColor: C.card, border: `1px solid ${C.inputBorder}`,
                borderRadius: 5, overflow: 'hidden',
              }}>
                {/* Picker toolbar */}
                <div style={{
                  padding: '7px 10px', borderBottom: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  backgroundColor: C.input,
                }}>
                  <input
                    value={calSearch}
                    onChange={e => setCalSearch(e.target.value)}
                    placeholder="Search events…"
                    autoFocus
                    style={{ ...inputStyle, width: 160, fontSize: 11, padding: '4px 8px' }}
                  />
                  {/* Importance filter */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {([3, 2] as const).map(imp => {
                      const on = calImportance.includes(imp);
                      const starsColor = imp === 3 ? C.red : C.amber;
                      return (
                        <button key={imp} onClick={() => {
                          const next = on
                            ? calImportance.filter(x => x !== imp)
                            : [...calImportance, imp].sort((a, b) => b - a);
                          setCalImportance(next);
                          loadCalEvents(next);
                        }} style={{
                          padding: '3px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 10,
                          border: `1px solid ${on ? starsColor : C.border}`,
                          backgroundColor: on ? `${starsColor}18` : C.input,
                          color: on ? starsColor : C.textHint,
                        }}>
                          {'★'.repeat(imp)}{'☆'.repeat(3 - imp)}
                        </button>
                      );
                    })}
                  </div>
                  {calLoading && <span style={{ fontSize: 10, color: C.textHint }}>Loading…</span>}
                  <button onClick={() => setCalPickerOpen(false)}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: C.textHint, fontSize: 16 }}>×</button>
                </div>

                {/* Event list */}
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {(() => {
                    const q = calSearch.trim().toLowerCase();
                    const filtered = calEvents.filter(e =>
                      calImportance.includes(e.importance) &&
                      (q === '' || e.event_name.toLowerCase().includes(q) || e.country.toLowerCase().includes(q))
                    );
                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '14px 12px', textAlign: 'center', fontSize: 12, color: C.textHint }}>
                          {calLoading ? 'Loading events…' : 'No events match current filters'}
                        </div>
                      );
                    }
                    return filtered.map(evt => (
                      <div key={evt.calendar_id}
                        onMouseDown={e => { e.preventDefault(); selectCalEvt(evt); }}
                        style={{
                          padding: '7px 10px', cursor: 'pointer',
                          borderBottom: `1px solid ${C.border}`,
                          backgroundColor: form.news_te_cal_id === evt.calendar_id ? `${C.teal}12` : 'transparent',
                        }}
                        onMouseEnter={e => { if (form.news_te_cal_id !== evt.calendar_id) (e.currentTarget as HTMLDivElement).style.backgroundColor = C.cardHover; }}
                        onMouseLeave={e => { if (form.news_te_cal_id !== evt.calendar_id) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          {impStars(evt.importance)}
                          <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{evt.event_name}</span>
                          <span style={{ fontSize: 11, color: C.textHint, marginLeft: 'auto' }}>{evt.country}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: C.textHint }}>
                          <span>
                            {new Date(evt.event_time_utc).toLocaleString('en-GB', {
                              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
                            })} UTC
                          </span>
                          {evt.currency && <span>{evt.currency}</span>}
                          {evt.consensus && <span>Cons: {evt.consensus}</span>}
                          {evt.previous  && <span>Prev: {evt.previous}</span>}
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                {/* Footer */}
                <div style={{ padding: '4px 10px', borderTop: `1px solid ${C.border}`, backgroundColor: C.input }}>
                  <span style={{ fontSize: 10, color: C.textHint }}>
                    {calEvents.filter(e => calImportance.includes(e.importance)).length} events · next 14 days
                  </span>
                </div>
              </div>
            )}

            {/* Window timing */}
            {!calPickerOpen && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Pre-event (min)" hint="Activate N min before event">
                  <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" min={0} max={1440}
                    value={form.news_pre_min} onChange={e => sf('news_pre_min', e.target.value)} />
                </Field>
                <Field label="Post-event (min)" hint="Deactivate M min after event">
                  <input style={{ ...inputStyle, fontFamily: 'monospace' }} type="number" min={0} max={1440}
                    value={form.news_post_min} onChange={e => sf('news_post_min', e.target.value)} />
                </Field>
              </div>
            )}

            {/* Optional symbol scope */}
            {!calPickerOpen && (
              <Field label="Symbol scope" hint="Leave empty to apply across all symbols">
                <SymbolInput value={form.news_symbol} onChange={v => sf('news_symbol', v)} candidates={mappedSymbols} />
              </Field>
            )}

            {!form.news_te_cal_id && (
              <div style={{ fontSize: 11, color: C.amber }}>
                ⚠ An economic event must be selected before saving.
              </div>
            )}
          </div>
        )}

        {/* Scope */}
        <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em' }}>SCOPE</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Symbol" hint="Empty = all symbols">
            <SymbolInput value={form.scope_symbol} onChange={v => sf('scope_symbol', v)} candidates={mappedSymbols} />
          </Field>
          <SearchableTagInput
            label="MT5 Groups"
            values={form.scope_groups}
            onChange={v => sf('scope_groups', v)}
            candidates={mt5Groups}
            placeholder="Search groups"
            hint="Empty = all groups"
            warn="No master node"
          />
        </div>


        {/* Spread */}
        <div style={{ fontSize: 11, color: C.label, fontWeight: 600, letterSpacing: '0.06em' }}>SPREAD ADJUSTMENT</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
          {([
            { m: 'ASK_ONLY',       label: 'Ask Only',      desc: 'Ask moves · bid unchanged' },
            { m: 'BID_ONLY',       label: 'Bid Only',      desc: 'Bid moves · ask unchanged' },
            { m: 'BOTH_SYMMETRIC', label: 'Both Symmetric',desc: 'Ask ↑ · Bid ↓ equally'     },
            { m: 'FROM_MID',       label: 'From Mid ★',    desc: 'Split around mid price'     },
          ] as const).map(({ m, label, desc }) => (
            <button key={m} onClick={() => sf('spread_mode', m)} style={{
              padding: '6px 8px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
              backgroundColor: form.spread_mode === m ? `${C.teal}18` : C.input,
              border: `1px solid ${form.spread_mode === m ? C.teal : C.border}`,
              color: form.spread_mode === m ? C.teal : C.textSec,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 10, color: C.textHint, marginTop: 1 }}>{desc}</div>
            </button>
          ))}
        </div>
        <Field label="Spread Width" hint="Integer points — what the client sees as total spread">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input style={{ ...inputStyle, width: 80, fontFamily: 'monospace' }}
              type="text" inputMode="numeric" value={form.value_points}
              onChange={e => sf('value_points', e.target.value.replace(/[^0-9-]/g, ''))} />
            <span style={{ fontSize: 12, color: C.textHint }}>points</span>
          </div>
        </Field>
        <div style={{ backgroundColor: C.card, borderRadius: 5, padding: '8px 12px' }}>
          <div style={{ fontSize: 10, color: C.textHint, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 6 }}>OFFSETS APPLIED ON EACH TICK</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 10, color: C.textHint, marginBottom: 2 }}>Ask</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: off.ask > 0 ? C.amber : off.ask < 0 ? C.green : C.textSec }}>{fmtAdj(off.ask)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textHint, marginBottom: 2 }}>Bid</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: off.bid < 0 ? C.amber : off.bid > 0 ? C.green : C.textSec }}>{fmtAdj(off.bid)}</div>
            </div>
            <div style={{ backgroundColor: `${C.teal}12`, borderRadius: 4, padding: '2px 0' }}>
              <div style={{ fontSize: 10, color: C.textHint, marginBottom: 2 }}>Client sees</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: C.teal }}>{off.ask - off.bid} pts</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── TAB 2 : SPREAD RULES ────────────────────────────────────
// ─────────────────────────────────────────────────────────────

function SpreadRulesTab({ feeds }: { feeds: FeedConfig[] }) {
  const [allRules, setAllRules] = useState<SpreadRule[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [editRule, setEditRule] = useState<SpreadRule | null | 'new'>(null);
  const [err,      setErr]      = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SpreadRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [mappedSymbols, setMappedSymbols] = useState<string[]>([]);
  const [mt5Groups,     setMt5Groups]     = useState<string[]>([]);

  useEffect(() => {
    bff<{ mappings: { mt5_symbol: string }[] }>('/api/v1/symbol-mappings')
      .then(r => setMappedSymbols([...new Set((r?.mappings ?? []).map(m => m.mt5_symbol))].sort()))
      .catch(() => {});
    bff<{ nodes: MT5NodeMin[] }>('/api/v1/mt5/nodes')
      .then(async r => {
        const nodes = r?.nodes ?? [];
        const master = nodes.find(n => n.is_master && n.connection_status === 'CONNECTED')
          ?? nodes.find(n => n.is_master)
          ?? nodes.find(n => n.connection_status === 'CONNECTED');
        if (!master) return;
        const gr = await bff<{ groups: { group: string }[] }>(`/api/v1/mt5/nodes/${master.id}/groups`);
        setMt5Groups((gr?.groups ?? []).map(g => g.group).sort());
      }).catch(() => {});
  }, []);

  const loadAll = useCallback(async () => {
    if (feeds.length === 0) return;
    setLoading(true); setErr(null);
    try {
      const results = await Promise.allSettled(
        feeds.map(f => bff<SpreadRule[]>(`/api/v1/price-rules/feeds/${f.feed_id}/rules`))
      );
      const merged: SpreadRule[] = [];
      results.forEach(r => { if (r.status === 'fulfilled' && Array.isArray(r.value)) merged.push(...r.value); });
      merged.sort((a, b) => a.feed_id - b.feed_id || a.priority - b.priority);
      setAllRules(merged);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [feeds]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleRule = async (r: SpreadRule) => {
    const newEnabled = !r.enabled;
    setAllRules(prev => prev.map(x => x.rule_id === r.rule_id ? { ...x, enabled: newEnabled } : x));
    try {
      await bff(`/api/v1/price-rules/feeds/${r.feed_id}/rules/${r.rule_id}/toggle`, {
        method: 'PATCH', body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch (e: any) {
      setErr(e.message);
      setAllRules(prev => prev.map(x => x.rule_id === r.rule_id ? { ...x, enabled: r.enabled } : x));
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const r = confirmDelete;
    setConfirmDelete(null);
    setDeleting(true);
    try {
      await bff(`/api/v1/price-rules/feeds/${r.feed_id}/rules/${r.rule_id}`, { method: 'DELETE' });
      await loadAll();
      if (editRule !== null && editRule !== 'new' && (editRule as SpreadRule).rule_id === r.rule_id) {
        setEditRule(null);
      }
    } catch (e: any) { setErr(e.message); }
    setDeleting(false);
  };

  const nextPriority = (feedId: number) => {
    const feedRules = allRules.filter(r => r.feed_id === feedId);
    return feedRules.length > 0 ? Math.max(...feedRules.map(r => r.priority)) + 10 : 10;
  };

  const feedName = (id: number) => feeds.find(f => f.feed_id === id)?.name ?? `Feed #${id}`;
  const isEditing = editRule !== null;

  // AG Grid theme matching app
  const srGridTheme = useMemo(() => themeQuartz.withParams({
    backgroundColor:       '#313032',
    browserColorScheme:    'dark',
    chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.07, onto: 'backgroundColor' },
    fontFamily:            { googleFont: 'IBM Plex Mono' },
    fontSize:              13,
    foregroundColor:       '#FFF',
    headerFontSize:        12,
  }), []);

  const colDefs = useMemo((): ColDef<SpreadRule>[] => [
    {
      field: 'feed_id' as any,
      headerName: 'Feed',
      flex: 1,
      filter: 'agTextColumnFilter', sortable: true,
      valueFormatter: (p: any) => feedName(p.value),
      cellStyle: { color: C.text, fontSize: 12 },
    },
    {
      field: 'priority',
      headerName: 'Priority',
      flex: 0.5,
      filter: 'agNumberColumnFilter', sortable: true,
      cellStyle: { fontFamily: 'monospace', color: C.textHint },
    },
    {
      field: 'name',
      headerName: 'Rule',
      flex: 2,
      filter: 'agTextColumnFilter', sortable: true,
      cellStyle: { fontWeight: 600, color: C.text },
    },
    {
      field: 'condition_type',
      headerName: 'Condition',
      flex: 1,
      filter: 'agSetColumnFilter', sortable: true,
      cellRenderer: (p: ICellRendererParams<SpreadRule>) => {
        const clr = conditionColor(p.value as ConditionType);
        return (
          <span style={{
            color: clr, backgroundColor: `${clr}18`,
            border: `1px solid ${clr}44`,
            borderRadius: 4, padding: '1px 8px', fontSize: 12, fontWeight: 500,
          }}>{p.value}</span>
        );
      },
    },
    {
      field: 'scope' as any,
      headerName: 'Symbol',
      flex: 1,
      sortable: true,
      valueGetter: (p: any) => p.data?.scope?.symbol || 'All',
      cellStyle: { fontFamily: 'monospace', fontSize: 12, color: C.textSec },
    },
    {
      headerName: 'Spread',
      flex: 1.5,
      sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<SpreadRule>) => {
        const r = p.data;
        if (!r) return null;
        const { mode, pts } = inferModeAndPoints(r.repricing.bid_adjustment, r.repricing.ask_adjustment);
        const off = computeOffsets(mode, pts);
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ color: C.textHint, fontSize: 11 }}>{mode} · </span>
            <span style={{ color: C.amber }}>ask {fmtAdj(off.ask)}</span>
            <span style={{ color: C.textHint }}> · </span>
            <span style={{ color: C.teal }}>bid {fmtAdj(off.bid)}</span>
            <span style={{ color: C.textHint }}> · </span>
            <span style={{ color: C.text, fontWeight: 600 }}>{pts} pts</span>
          </span>
        );
      },
    },
    {
      field: 'enabled',
      headerName: 'Enabled',
      flex: 0.7,
      filter: 'agSetColumnFilter', sortable: true,
      cellRenderer: (p: ICellRendererParams<SpreadRule>) => (
        <span style={{ color: p.value ? C.green : C.red, fontWeight: 600 }}>
          {p.value ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      headerName: '',
      flex: 1,
      sortable: false, filter: false, pinned: 'right' as const,
      cellRenderer: (p: ICellRendererParams<SpreadRule>) => {
        const r = p.data;
        if (!r) return null;
        const isOpen = editRule !== null && editRule !== 'new' && (editRule as SpreadRule).rule_id === r.rule_id;
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: '100%' }}>
            <button
              onClick={() => setEditRule(isOpen ? null : r)}
              style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                backgroundColor: isOpen ? `${C.teal}18` : C.card,
                color: isOpen ? C.teal : C.textSec,
                border: `1px solid ${isOpen ? C.teal : C.border}`,
              }}>Edit</button>
            <button
              onClick={() => setConfirmDelete(r)}
              style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
                backgroundColor: 'transparent', color: C.red, border: `1px solid ${C.red}55`,
              }}>Delete</button>
          </div>
        );
      },
    },
  ], [editRule, allRules]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Left: AG Grid ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          backgroundColor: C.panel,
        }}>
          <BtnPrimary small onClick={() => setEditRule('new')}>+ New Rule</BtnPrimary>
          {loading && <span style={{ fontSize: 12, color: C.textHint }}>Loading…</span>}
          {err && <ErrorBanner msg={err} onDismiss={() => setErr(null)} />}
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {!loading && allRules.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, height: '100%' }}>
              <span style={{ fontSize: 14, color: C.textHint }}>No spread rules yet.</span>
              <BtnPrimary onClick={() => setEditRule('new')}>+ Create First Rule</BtnPrimary>
              <span style={{ fontSize: 12, color: C.textHint }}>Rules fire in priority order. First match wins.</span>
            </div>
          ) : (
            <AgGridReact<SpreadRule>
              theme={srGridTheme}
              rowData={allRules}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, minWidth: 80 }}
              rowHeight={34}
              headerHeight={36}
              loading={loading}
              getRowStyle={p => p.data && !p.data.enabled ? { opacity: 0.5 } : undefined}
              onGridReady={e => e.api.sizeColumnsToFit()}
              onFirstDataRendered={e => e.api.sizeColumnsToFit()}
              onGridSizeChanged={e => e.api.sizeColumnsToFit()}
            />
          )}
        </div>
      </div>

      {/* ── Right: rule editor panel (with enabled toggle) ───── */}
      {isEditing && (
        <RuleEditor
          feeds={feeds}
          rule={editRule === 'new' ? null : editRule as SpreadRule}
          nextPriority={editRule !== 'new' ? nextPriority((editRule as SpreadRule).feed_id) : (feeds[0] ? nextPriority(feeds[0].feed_id) : 10)}
          mappedSymbols={mappedSymbols}
          mt5Groups={mt5Groups}
          onToggle={editRule !== 'new' ? () => toggleRule(editRule as SpreadRule) : undefined}
          onSave={() => { setEditRule(null); loadAll(); }}
          onClose={() => setEditRule(null)}
        />
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <ConfirmModal
          title="Delete Spread Rule"
          message={`You are about to delete "${confirmDelete.name}". Are you sure?`}
          confirmLabel={deleting ? 'Deleting…' : 'Yes, delete!'}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}




// ─────────────────────────────────────────────────────────────
// Confirm Modal
// ─────────────────────────────────────────────────────────────
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: C.panel, borderRadius: 8, padding: '24px 28px',
        border: `1px solid ${C.border}`, maxWidth: 420, width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '7px 18px', fontSize: 13, borderRadius: 5, cursor: 'pointer',
            backgroundColor: C.input, color: C.textSec, border: `1px solid ${C.border}`,
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '7px 18px', fontSize: 13, fontWeight: 600, borderRadius: 5, cursor: 'pointer',
            backgroundColor: `${C.red}22`, color: C.red, border: `1px solid ${C.red}`,
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ── TAB 3 : GROUP SPREADS ────────────────────────────────────
// ─────────────────────────────────────────────────────────────

const gsGridTheme = themeQuartz.withParams({
  backgroundColor:       '#313032',
  browserColorScheme:    'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.07, onto: 'backgroundColor' },
  fontFamily:            { googleFont: 'IBM Plex Mono' },
  fontSize:              13,
  foregroundColor:       '#FFF',
  headerFontSize:        12,
});

interface GsRowData {
  rule_id?: number;
  mt5_group: string;
  mt5_symbol: string;
  mode: SpreadMode;
  value_points: number;
  ask_offset: number;
  bid_offset: number;
  client_sees: number;
  description: string;
  enabled: boolean;
}

function GroupSpreadsTab() {
  const [allRules, setAllRules]     = useState<GroupSpreadRule[]>([]);
  const [loading,  setLoading]      = useState(true);
  const [err,      setErr]          = useState<string | null>(null);
  const [syncing,  setSyncing]      = useState(false);
  const [syncMsg,  setSyncMsg]      = useState<string | null>(null);

  // Confirm dialog
  const [confirmRule, setConfirmRule] = useState<GroupSpreadRule | null>(null);

  // Form state
  const [formOpen,  setFormOpen]    = useState(false);
  const [editRule,  setEditRule]    = useState<GroupSpreadRule | null>(null);
  const [fGroup,    setFGroup]      = useState('');
  const [fSymbol,   setFSymbol]     = useState('');
  const [fMode,     setFMode]       = useState<SpreadMode>('FROM_MID');
  const [fPts,      setFPts]        = useState('20');
  const [fDesc,     setFDesc]       = useState('');
  const [saving,    setSaving]      = useState(false);
  const [formErr,   setFormErr]     = useState<string | null>(null);
  const [formOk,    setFormOk]      = useState<string | null>(null);

  // Reference data
  const [mt5Groups,     setMt5Groups]     = useState<string[]>([]);
  const [mappedSymbols, setMappedSymbols] = useState<string[]>([]);

  useEffect(() => {
    bff<{ nodes: MT5NodeMin[] }>('/api/v1/mt5/nodes')
      .then(async r => {
        const nodes = r?.nodes ?? [];
        const master = nodes.find(n => n.is_master && n.connection_status === 'CONNECTED')
          ?? nodes.find(n => n.is_master)
          ?? nodes.find(n => n.connection_status === 'CONNECTED');
        if (!master) return;
        const gr = await bff<{ groups: { group: string }[] }>(`/api/v1/mt5/nodes/${master.id}/groups`);
        setMt5Groups((gr?.groups ?? []).map(g => g.group).sort());
      }).catch(() => {});
    bff<{ mappings: { mt5_symbol: string }[] }>('/api/v1/symbol-mappings')
      .then(r => setMappedSymbols([...new Set((r?.mappings ?? []).map(m => m.mt5_symbol))].sort()))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bff<GroupSpreadRule[]>('/api/v1/group-spreads');
      setAllRules(Array.isArray(data) ? data : []);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rowData: GsRowData[] = useMemo(() => allRules.map(r => {
    const off = computeOffsets(r.mode, r.value_points);
    return {
      rule_id:     r.rule_id,
      mt5_group:   r.mt5_group,
      mt5_symbol:  r.mt5_symbol,
      mode:        r.mode,
      value_points: r.value_points,
      ask_offset:  off.ask,
      bid_offset:  off.bid,
      client_sees: off.ask - off.bid,
      description: r.description ?? '',
      enabled:     r.enabled,
    };
  }), [allRules]);

  const openNew = () => {
    setEditRule(null);
    setFGroup(mt5Groups[0] ?? '');
    setFSymbol(''); setFMode('FROM_MID'); setFPts('20'); setFDesc('');
    setFormErr(null); setFormOk(null);
    setFormOpen(true);
  };

  const openEdit = (r: GroupSpreadRule) => {
    setEditRule(r);
    setFGroup(r.mt5_group); setFSymbol(r.mt5_symbol);
    setFMode(r.mode); setFPts(String(r.value_points)); setFDesc(r.description ?? '');
    setFormErr(null); setFormOk(null);
    setFormOpen(true);
  };

  const saveSpread = async () => {
    if (!fGroup) { setFormErr('Select an MT5 group'); return; }
    if (!fSymbol) { setFormErr('Select a symbol'); return; }
    setSaving(true); setFormErr(null); setFormOk(null);
    try {
      const encodedGroup = encodeURIComponent(fGroup);
      const res = await bff<{ applied: boolean; ask_offset: number; bid_offset: number }>(
        `/api/v1/group-spreads/${encodedGroup}/${fSymbol}`, {
          method: 'PUT',
          body: JSON.stringify({ mode: fMode, value_points: Number(fPts), description: fDesc }),
        }
      );
      if (res.applied) {
        setFormOk(`Applied — ask ${fmtAdj(res.ask_offset)} · bid ${fmtAdj(res.bid_offset)}`);
        load();
      }
    } catch (e: any) { setFormErr(e.message); }
    setSaving(false);
  };

  const resetSpread = (r: GroupSpreadRule) => { setConfirmRule(r); };

  const doReset = async () => {
    if (!confirmRule) return;
    const r = confirmRule;
    setConfirmRule(null);
    try {
      await bff(`/api/v1/group-spreads/${encodeURIComponent(r.mt5_group)}/${r.mt5_symbol}`, { method: 'DELETE' });
      load();
    } catch (e: any) { setErr(e.message); }
  };

  const syncToMT5 = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await bff<{ rules_applied: number }>('/api/v1/group-spreads/sync', { method: 'POST' });
      setSyncMsg(`Re-synced ${res.rules_applied} rule${res.rules_applied !== 1 ? 's' : ''} to MT5`);
    } catch (e: any) { setSyncMsg('Error: ' + e.message); }
    setSyncing(false);
  };

  const preview = computeOffsets(fMode, Number(fPts) || 0);

  const colDefs = useMemo((): ColDef<GsRowData>[] => [
    {
      field: 'mt5_group', headerName: 'MT5 Group',
      flex: 2, filter: 'agTextColumnFilter', sortable: true,
      cellStyle: { color: C.blue, fontFamily: 'monospace', fontSize: 12 },
    },
    {
      field: 'mt5_symbol', headerName: 'Symbol',
      flex: 1, filter: 'agTextColumnFilter', sortable: true,
      cellStyle: { color: C.teal, fontFamily: 'monospace', fontWeight: 600 },
    },
    {
      field: 'mode', headerName: 'Spread Mode',
      flex: 1, filter: 'agSetColumnFilter', sortable: true,
      cellStyle: { color: C.textSec },
    },
    {
      field: 'value_points', headerName: 'Points',
      flex: 1, filter: 'agNumberColumnFilter', sortable: true, type: 'rightAligned',
      cellRenderer: (p: ICellRendererParams<GsRowData>) => (
        <span style={{ color: (p.value ?? 0) > 0 ? C.amber : (p.value ?? 0) < 0 ? C.green : C.textSec, fontFamily: 'monospace' }}>
          {(p.value ?? 0) > 0 ? '+' : ''}{p.value}
        </span>
      ),
    },
    {
      headerName: 'Computed Offsets',
      flex: 2, sortable: false, filter: false,
      cellRenderer: (p: ICellRendererParams<GsRowData>) => {
        const r = p.data;
        if (!r) return null;
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ color: C.amber }}>ask {fmtAdj(r.ask_offset)}</span>
            <span style={{ color: C.textHint }}> · </span>
            <span style={{ color: C.teal }}>bid {fmtAdj(r.bid_offset)}</span>
            <span style={{ color: C.textHint }}> · </span>
            <span style={{ color: C.text, fontWeight: 600 }}>{r.client_sees} pts</span>
          </span>
        );
      },
    },
    {
      field: 'enabled', headerName: 'Enabled',
      flex: 1, filter: 'agSetColumnFilter', sortable: true,
      cellRenderer: (p: ICellRendererParams<GsRowData>) => (
        <span style={{ color: p.value ? C.green : C.red }}>{p.value ? 'Yes' : 'No'}</span>
      ),
    },
    {
      headerName: '',
      flex: 1, sortable: false, filter: false, pinned: 'right',
      cellRenderer: (p: ICellRendererParams<GsRowData>) => {
        const r = p.data;
        if (!r) return null;
        const full = allRules.find(x => x.mt5_group === r.mt5_group && x.mt5_symbol === r.mt5_symbol);
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: '100%' }}>
            <button onClick={() => full && openEdit(full)} style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
              backgroundColor: C.card, color: C.textSec, border: `1px solid ${C.border}`,
            }}>Edit</button>
            <button onClick={() => full && resetSpread(full)} style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
              backgroundColor: 'transparent', color: C.red, border: `1px solid ${C.red}55`,
            }}>Reset</button>
          </div>
        );
      },
    },
  ], [allRules]);

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* ── Left: grid ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Toolbar */}
        <div style={{
          padding: '10px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          backgroundColor: C.panel,
        }}>
          <BtnPrimary small onClick={openNew}>+ Add New Symbol Spread</BtnPrimary>
          <button onClick={syncToMT5} disabled={syncing} style={{
            fontSize: 12, padding: '5px 12px', borderRadius: 4, cursor: syncing ? 'default' : 'pointer',
            backgroundColor: C.card, color: C.textSec, border: `1px solid ${C.border}`,
          }}>{syncing ? 'Syncing…' : '⟳ Re-sync to MT5'}</button>
          {syncMsg && <span style={{ fontSize: 12, color: syncMsg.startsWith('Error') ? C.red : C.green }}>{syncMsg}</span>}
          {err && <ErrorBanner msg={err} onDismiss={() => setErr(null)} />}
        </div>

        {/* AG Grid */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {!loading && allRules.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, height: '100%' }}>
              <span style={{ fontSize: 14, color: C.textHint }}>No group spread rules configured yet.</span>
              <BtnPrimary onClick={openNew}>+ Spread a New Symbol</BtnPrimary>
              <span style={{ fontSize: 12, color: C.textHint, maxWidth: 360, textAlign: 'center' }}>
                Group spreads apply directly to MT5 group configuration via SpreadDiff.
              </span>
            </div>
          ) : (
            <AgGridReact<GsRowData>
              theme={gsGridTheme}
              rowData={rowData}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, minWidth: 80 }}
              rowHeight={34}
              headerHeight={36}
              loading={loading}
              suppressMovableColumns={false}
              suppressCellFocus={false}
              onGridReady={e => e.api.sizeColumnsToFit()}
              onFirstDataRendered={e => e.api.sizeColumnsToFit()}
              onGridSizeChanged={e => e.api.sizeColumnsToFit()}
            />
          )}
        </div>
      </div>

      {/* ── Right: form panel (40%) ───────────────────────────── */}
      {formOpen && (
        <div style={{
          width: '40%', minWidth: 380, maxWidth: 560,
          borderLeft: `1px solid ${C.border}`,
          backgroundColor: C.panel, display: 'flex', flexDirection: 'column',
          flexShrink: 0,
        }}>
          {/* Header */}
          <div style={{
            padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                {editRule ? `Edit — ${editRule.mt5_group} / ${editRule.mt5_symbol}` : 'Add New Symbol Spread'}
              </span>
              {formOk  && <div style={{ fontSize: 12, color: C.green,  marginTop: 2 }}>{formOk}</div>}
              {formErr && <div style={{ fontSize: 12, color: C.red,    marginTop: 2 }}>{formErr}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <BtnPrimary small onClick={saveSpread} disabled={saving}>
                {saving ? 'Applying…' : 'Apply to MT5'}
              </BtnPrimary>
              <button onClick={() => setFormOpen(false)} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: C.textHint, fontSize: 20,
              }}>×</button>
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* MT5 Group */}
            <Field label="MT5 Group" required hint="Groups fetched from master MT5 node">
              {editRule ? (
                <div style={{ ...inputStyle, color: C.blue, fontFamily: 'monospace', cursor: 'default' }}>{fGroup}</div>
              ) : (
                <SearchableTagInput
                  label=""
                  values={fGroup ? [fGroup] : []}
                  onChange={v => setFGroup(v[v.length - 1] ?? '')}
                  candidates={mt5Groups}
                  placeholder="Search MT5 groups"
                  hint=""
                  warn="No master node connected"
                />
              )}
            </Field>

            {/* Symbol */}
            <Field label="Symbol" required hint="Must exist in Symbol Mapping">
              {editRule ? (
                <div style={{ ...inputStyle, color: C.teal, fontFamily: 'monospace', fontWeight: 600, cursor: 'default' }}>{fSymbol}</div>
              ) : (
                <SymbolInput value={fSymbol} onChange={setFSymbol} candidates={mappedSymbols} />
              )}
            </Field>

            {/* Mode */}
            <Field label="Spread Mode">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { m: 'ASK_ONLY',       desc: 'Ask only · bid unchanged'  },
                  { m: 'BID_ONLY',       desc: 'Bid only · ask unchanged'  },
                  { m: 'BOTH_SYMMETRIC', desc: 'Ask ↑ · Bid ↓ equally'    },
                  { m: 'FROM_MID',       desc: 'Split around mid ★'        },
                ] as { m: SpreadMode; desc: string }[]).map(({ m, desc }) => (
                  <button key={m} onClick={() => setFMode(m)} style={{
                    padding: '7px 10px', borderRadius: 5, cursor: 'pointer', textAlign: 'left',
                    backgroundColor: fMode === m ? `${C.orange}1a` : C.input,
                    color: fMode === m ? C.orange : C.textSec,
                    border: `1px solid ${fMode === m ? C.orange : C.border}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{m}</div>
                    <div style={{ fontSize: 10, color: C.textHint, marginTop: 2 }}>{desc}</div>
                  </button>
                ))}
              </div>
            </Field>

            {/* Value */}
            <Field label="Spread Width (MT5 Points)" hint="10 pts = 1 pip for 5-digit pairs · Positive = widen · Negative = tighten">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input style={{ ...inputStyle, width: 90, fontFamily: 'monospace', fontSize: 14 }}
                  type="text" inputMode="numeric" value={fPts}
                  onChange={e => setFPts(e.target.value.replace(/[^0-9-]/g, ''))} />
                <span style={{ fontSize: 12, color: C.textHint }}>points</span>
              </div>
            </Field>

            {/* Preview */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Ask Offset', sublabel: 'MT5 SpreadDiff', val: fmtAdj(preview.ask), color: preview.ask > 0 ? C.orange : preview.ask < 0 ? C.green : C.textSec },
                { label: 'Bid Offset', sublabel: 'Feed Repricing',  val: fmtAdj(preview.bid), color: preview.bid < 0 ? C.amber  : preview.bid > 0 ? C.green : C.textSec },
                { label: 'Client Sees', sublabel: 'Total spread',   val: `${preview.ask - preview.bid} pts`, color: C.teal },
              ].map(({ label, sublabel, val, color }) => (
                <div key={label} style={{ backgroundColor: C.card, borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: C.textHint, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color }}>{val}</div>
                  <div style={{ fontSize: 10, color: C.textHint, marginTop: 2 }}>{sublabel}</div>
                </div>
              ))}
            </div>

            {/* Description */}
            <Field label="Description" hint="Audit note">
              <input style={{ ...inputStyle, fontSize: 12 }} value={fDesc}
                onChange={e => setFDesc(e.target.value)} placeholder="Optional" />
            </Field>

            {/* MT5 Admin warning */}
            <div style={{ padding: '8px 12px', backgroundColor: `${C.red}0a`, border: `1px solid ${C.red}20`, borderRadius: 5, fontSize: 11, color: C.textHint }}>
              ⚠ Symbol must be added in MT5 Admin → Groups → [group] → Symbols before applying. The wildcard * is not sufficient.
            </div>
          </div>
        </div>
      )}
      {confirmRule && (
        <ConfirmModal
          title="Symbol Spread Reset"
          message={`You are about to reset spread for ${confirmRule.mt5_symbol} in ${confirmRule.mt5_group} to floating (0) / Default values. Are you sure?`}
          confirmLabel="Yes, reset!"
          onConfirm={doReset}
          onCancel={() => setConfirmRule(null)}
        />
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// ── PAGE ROOT ────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────

type MainTab = 'feeds' | 'rules' | 'group-spreads';

export function PriceRulesPage() {
  const [tab, setTab] = useState<MainTab>('feeds');
  const [feeds, setFeeds] = useState<FeedConfig[]>([]);
  const [stats, setStats] = useState<FeedStats | null>(null);
  const [loadingFeeds, setLoadingFeeds] = useState(true);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadFeeds = useCallback(async () => {
    setLoadingFeeds(true);
    try {
      const data = await bff<FeedConfig[]>('/api/v1/feeds');
      setFeeds(Array.isArray(data) ? data : []);
    } catch { setFeeds([]); }
    setLoadingFeeds(false);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const data = await bff<FeedStats>('/api/v1/feeds/stats');
      setStats(data);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadFeeds();
    loadStats();
    statsIntervalRef.current = setInterval(loadStats, 10_000);
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, [loadFeeds, loadStats]);

  const TABS: { id: MainTab; label: string }[] = [
    { id: 'feeds',         label: 'Feed Management' },
    { id: 'rules',         label: 'Spread Rules'    },
    { id: 'group-spreads', label: 'Group Spreads'   },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: C.page, color: C.text }}>
      {/* Header */}
      <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>Price Rules</h1>
          <p style={{ fontSize: 12, color: C.textHint, margin: '2px 0 0' }}>
            Feed configuration, conditional spread repricing, and MT5 group spread management
          </p>
        </div>
        {loadingFeeds && <span style={{ fontSize: 12, color: C.textHint }}>Loading…</span>}
      </div>

      {/* Pipeline status bar */}
      <PipelineBar stats={stats} />

      {/* Tab bar */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, backgroundColor: C.panel }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 18px', fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? C.teal : C.textSec,
            background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: tab === t.id ? `2px solid ${C.teal}` : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tab === 'feeds' && (
          <FeedConfigTab feeds={feeds} onFeedsChange={setFeeds} stats={stats} />
        )}
        {tab === 'rules' && (
          <SpreadRulesTab feeds={feeds} />
        )}
        {tab === 'group-spreads' && (
          <GroupSpreadsTab />
        )}
      </div>
    </div>
  );
}

export default PriceRulesPage;