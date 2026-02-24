// ============================================================
// Charter.tsx — NexRisk Risk Charter
// Executive Risk Matrix: visual heat map, rule editing,
// modifier flags management, and full audit trail
//
// API: /api/v1/risk-matrix/* (primary)
//       /api/v1/config/risk-matrix/history (audit log)
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';

// ─── API base ─────────────────────────────────────────────────
const API_BASE = (import.meta as Record<string, unknown>).env
  ? (import.meta as { env: { VITE_API_URL?: string } }).env.VITE_API_URL || 'http://localhost:8080'
  : 'http://localhost:8080';

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    throw new Error((e as { error?: string }).error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────

// Valid risk levels per API spec
type RiskLevel = 'VERY_LOW' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// BehaviorType is whatever the backend returns — not constrained to a fixed set
type BehaviorType = string;

// ActionCode is whatever the backend returns — resolved from the action-codes endpoint
type ActionCode = string;

// Extended rule object returned by /api/v1/risk-matrix/* endpoints
interface PFBand {
  rule_id:             number;
  rule_name?:          string;
  behavior_type?:      BehaviorType;
  pf_min:              number;
  // NOTE: /api/v1/risk-matrix/pf-bands returns 999.0 for open-ended bands, NOT null
  //       /api/v1/config/risk-matrix/* returns null for open-ended bands
  //       We handle both: treat null or >= 999 as open-ended (∞)
  pf_max:              number | null;
  risk_level:          RiskLevel;
  action_code:         ActionCode;
  action_params:       Record<string, number>;
  priority?:           number;
  enabled?:            boolean;
  is_factory_default?: boolean;
  updated_at?:         string;
  updated_by?:         string;
}

// Action code descriptor returned by /api/v1/risk-matrix/action-codes
interface ActionCodeDef {
  code:              string;
  description:       string;
  severity_order:    number;
  requires_approval: boolean;
  auto_executable:   boolean;
  color_code:        string;
  icon?:             string;
  params_schema:     Record<string, { type: string; min: number; max: number; required: boolean }>;
}

interface AuditEntry {
  id:          number;
  table_name:  string;
  record_id:   number;
  change_type: string;
  old_values:  Record<string, unknown> | null;
  new_values:  Record<string, unknown> | null;
  changed_by:  string;
  changed_at:  string;
  reason:      string;
}

// ─── Reference data ───────────────────────────────────────────

// Behaviors are derived at runtime from whatever keys pf-bands returns — never hardcoded
function getBehaviors(pfBands: Record<BehaviorType, PFBand[]>): BehaviorType[] {
  return Object.keys(pfBands).sort();
}

const BEHAVIOR_META_MAP: Record<string, { label: string; description: string }> = {
  MANUAL:       { label: 'Manual Trader',  description: 'Human-driven discretionary trading' },
  SCALPER:      { label: 'Scalper',        description: 'High-frequency, short-duration positions' },
  EA_TRADER:    { label: 'EA / Bot',       description: 'Expert advisor or automated trading system' },
  EA_BOT:       { label: 'EA / Bot',       description: 'Expert advisor or automated trading system' },
  ARBITRAGE:    { label: 'Arbitrage',      description: 'Latency or statistical arbitrage patterns' },
  NEWS_TRADER:  { label: 'News Trader',    description: 'Event-driven entry around news releases' },
  REBATE_ABUSE: { label: 'Rebate Abuse',   description: 'Volume inflation to extract rebates' },
  DAY_TRADER:   { label: 'Day Trader',     description: 'Intraday positions, closed before end of session' },
  SWING_TRADER: { label: 'Swing Trader',   description: 'Multi-day positions following market momentum' },
  UNKNOWN:      { label: 'Unknown',        description: 'Insufficient data for classification' },
};

function getBehaviorMeta(btype: string): { label: string; description: string } {
  return BEHAVIOR_META_MAP[btype] ?? { label: btype.replace(/_/g, ' '), description: '' };
}

// Fallback labels used before the action-codes API responds
const ACTION_LABELS: Record<string, string> = {
  // API doc v2.0
  MONITOR:          'Monitor',
  WARN:             'Warn',
  WIDEN_SPREAD:     'Widen Spread',
  MIN_HOLDING_TIME: 'Min Hold Time',
  A_BOOK_REVIEW:    'A-Book Review',
  A_BOOK_PARTIAL:   'A-Book Partial',
  A_BOOK_FULL:      'A-Book Full',
  DISABLE_REBATES:  'Disable Rebates',
  RESTRICT_VOLUME:  'Restrict Volume',
  ACCOUNT_REVIEW:   'Account Review',
  NO_ACTION:        'No Action',
  // Live backend codes
  B_BOOK_SAFE:      'Safe for B-Book',
  B_BOOK_STD:       'Standard B-Book',
  SPREAD_WIDEN:     'Widen Spread',
  A_BOOK_CONSIDER:  'A-Book Consider',
  CLASSIFY:         'Classify',
  CLASSIFY_URGENT:  'Classify Urgent',
  REVIEW_TERMS:     'Review Terms',
};

const RISK_STYLE: Record<RiskLevel, { bg: string; text: string; border: string; bar: string; label: string }> = {
  VERY_LOW: { bg: '#0a1c0d', text: '#66e07a', border: '#1e4a2a', bar: '#2f6a3d', label: 'Very Low' },
  LOW:      { bg: '#0f200f', text: '#66e07a', border: '#2f6a3d', bar: '#3d8050', label: 'Low' },
  MEDIUM:   { bg: '#1a1900', text: '#e0d066', border: '#6a6530', bar: '#9a9040', label: 'Medium' },
  HIGH:     { bg: '#1c1200', text: '#e09a55', border: '#6a4a2f', bar: '#9a6a3a', label: 'High' },
  CRITICAL: { bg: '#1f0c0e', text: '#ff6b6b', border: '#7a2f36', bar: '#b03040', label: 'Critical' },
};

// ─── Factory Default Mock Data ────────────────────────────────
// Source: NexRisk_Risk_Matrix_API.md Appendix — Factory Default PF Bands
// Used as placeholderData while the API call is in flight.
// pf_max 999.0 matches what /api/v1/risk-matrix/pf-bands actually returns.

// Empty placeholder — real data always loaded from backend
const FACTORY_PF_BANDS: Record<string, PFBand[]> = {};


const MOCK_AUDIT: AuditEntry[] = [
  { id: 88, table_name: 'risk_matrix_rules',   record_id: 5,  change_type: 'UPDATE', old_values: { action_code: 'A_BOOK_REVIEW', action_params: {} }, new_values: { action_code: 'WIDEN_SPREAD', action_params: { multiplier: 1.8 } }, changed_by: 'r.martin', changed_at: '2026-02-10T14:23:00Z', reason: 'Aligning Scalper 3–5 PF band with LP feedback on spread tolerance' },
  { id: 62, table_name: 'risk_matrix_rules',   record_id: 4,  change_type: 'UPDATE', old_values: { action_params: { multiplier: 1.2 } }, new_values: { action_params: { multiplier: 1.3 } }, changed_by: 'r.martin', changed_at: '2026-01-28T16:45:00Z', reason: 'Increasing spread widen factor for 2.0–3.0 Scalper PF band per Q4 review' },
];

// ─── Helpers ──────────────────────────────────────────────────

// Handle both null (config API) and 999.0 (pf-bands API) as open-ended
function isOpenEnded(pf_max: number | null): boolean {
  return pf_max === null || pf_max >= 999;
}

function pfLabel(band: PFBand): string {
  const lo = band.pf_min.toFixed(2);
  const hi = isOpenEnded(band.pf_max) ? '∞' : (band.pf_max as number).toFixed(2);
  return `${lo} – ${hi}`;
}

function actionParamHint(band: PFBand): string | null {
  const p = band.action_params;
  if (band.action_code === 'WIDEN_SPREAD'     && p.multiplier)   return `×${p.multiplier}`;
  if (band.action_code === 'MIN_HOLDING_TIME' && p.min_seconds)  return `${p.min_seconds}s min`;
  if (band.action_code === 'RESTRICT_VOLUME'  && p.max_lots)     return `≤ ${p.max_lots}L`;
  if (band.action_code === 'A_BOOK_PARTIAL'   && p.hedge_pct)    return `${p.hedge_pct}% hedge`;


  return null;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function getActionLabel(code: string, actionDefs?: ActionCodeDef[]): string {
  if (actionDefs) {
    const def = actionDefs.find(d => d.code === code);
    if (def) return ACTION_LABELS[code as ActionCode] ?? def.description.split(' ').slice(0, 3).join(' ');
  }
  return ACTION_LABELS[code as ActionCode] ?? code;
}

// ─── Sub-components ───────────────────────────────────────────

function RiskBadge({ level }: { level: RiskLevel }) {
  const s = RISK_STYLE[level];
  return (
    <span className="px-2 py-0.5 rounded text-xs font-semibold"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function ActionBadge({ code, actionDefs }: { code: ActionCode; actionDefs?: ActionCodeDef[] }) {
  const safe   = ['NO_ACTION'];
  const watch  = ['MONITOR', 'WARN', 'ACCOUNT_REVIEW'];
  const mod    = ['WIDEN_SPREAD', 'MIN_HOLDING_TIME', 'RESTRICT_VOLUME', 'DISABLE_REBATES'];
  const abook  = ['A_BOOK_REVIEW', 'A_BOOK_PARTIAL', 'A_BOOK_FULL'];

  const color = safe.includes(code)  ? { bg: '#10201a', text: '#66e07a', border: '#2f6a3d' }
    : watch.includes(code)  ? { bg: '#1a1900', text: '#e0d066', border: '#6a6530' }
    : mod.includes(code)    ? { bg: '#1c1200', text: '#e09a55', border: '#6a4a2f' }
    : abook.includes(code)  ? { bg: '#1f0c0e', text: '#ff6b6b', border: '#7a2f36' }
    : { bg: '#1b1c22', text: '#d2d6e2', border: '#44454f' };

  return (
    <span className="px-1.5 py-0.5 rounded text-xs font-mono font-medium"
      style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}>
      {getActionLabel(code, actionDefs)}
    </span>
  );
}

function BandCell({ band, actionDefs, modifiedRuleIds, onClick }: {
  band: PFBand; actionDefs?: ActionCodeDef[]; modifiedRuleIds?: Set<number>; onClick: () => void;
}) {
  const s        = RISK_STYLE[band.risk_level];
  const hint     = actionParamHint(band);
  const modified = modifiedRuleIds ? modifiedRuleIds.has(band.rule_id) : band.is_factory_default === false;

  return (
    <button onClick={onClick}
      title={`Rule #${band.rule_id}${band.rule_name ? ` — ${band.rule_name}` : ''} · Click to edit`}
      className="group flex flex-col text-left rounded transition-all duration-150 hover:ring-1 hover:ring-accent"
      style={{
        background: s.bg,
        border: `1px solid ${modified ? '#9a7830' : s.border}`,
        minWidth: 0, flex: 1, position: 'relative', padding: 0, overflow: 'hidden',
      }}>
      <div style={{ height: 3, background: s.bar, width: '100%' }} />
      {modified && (
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full" style={{ background: '#e0b84a' }}
          title={`Modified by ${band.updated_by}`} />
      )}
      <div className="flex flex-col gap-0.5 p-2 flex-1">
        <span className="uppercase tracking-wider font-semibold" style={{ color: s.text, opacity: 0.7, fontSize: 10 }}>
          {s.label}
        </span>
        <span className="text-xs font-semibold leading-tight" style={{ color: s.text }}>
          {getActionLabel(band.action_code, actionDefs)}
        </span>
        {hint && <span className="text-xs font-mono" style={{ color: s.text, opacity: 0.65 }}>{hint}</span>}
        <span className="font-mono mt-auto pt-1" style={{ color: s.text, opacity: 0.75, fontSize: 10 }}>
          PF {pfLabel(band)}
        </span>
      </div>
    </button>
  );
}

// ─── Edit Rule Panel ──────────────────────────────────────────

interface EditPanelProps {
  band: PFBand; behaviorType: BehaviorType; actionDefs?: ActionCodeDef[];
  isCustomRule: boolean;
  onClose:      () => void;
  onSave:       (ruleId: number, patch: Record<string, unknown>) => void;
  onResetRule:  (ruleId: number) => void;
  isSaving:     boolean;
  isResetting:  boolean;
  saveError?:   string | null;
  resetError?:  string | null;
}

function EditRulePanel({ band, behaviorType, actionDefs, isCustomRule, onClose, onSave, onResetRule, isSaving, isResetting, saveError, resetError }: EditPanelProps) {
  const [actionCode,  setActionCode]  = useState<ActionCode>(band.action_code);
  const [riskLevel,   setRiskLevel]   = useState<RiskLevel>(band.risk_level);
  const [multiplier,  setMultiplier]  = useState(String(band.action_params.multiplier  ?? 1.5));
  const [hedgePct,    setHedgePct]    = useState(String(band.action_params.hedge_pct   ?? 50));
  const [minSecs,     setMinSecs]     = useState(String(band.action_params.min_seconds ?? 30));
  const [maxLots,     setMaxLots]     = useState(String(band.action_params.max_lots    ?? 1.0));
  const [reason,      setReason]      = useState('');
  const [reasonError, setReasonError] = useState(false);

  // Schema from API for the currently selected action
  const selectedDef = actionDefs?.find(d => d.code === actionCode);
  const schema      = selectedDef?.params_schema ?? {};

  const handleSave = useCallback(() => {
    if (!reason.trim()) { setReasonError(true); return; }
    const params: Record<string, number> = {};
    if (actionCode === 'WIDEN_SPREAD')     params.multiplier  = parseFloat(multiplier);
    if (actionCode === 'MIN_HOLDING_TIME') params.min_seconds = parseInt(minSecs);
    if (actionCode === 'RESTRICT_VOLUME')  params.max_lots    = parseFloat(maxLots);
    if (actionCode === 'A_BOOK_PARTIAL')   params.hedge_pct   = parseFloat(hedgePct);
    onSave(band.rule_id, {
      action_code:   actionCode,
      risk_level:    riskLevel,
      action_params: params,
      reason,
      updated_by:    'risk_manager',
    });
  }, [actionCode, riskLevel, multiplier, hedgePct, minSecs, maxLots, reason, band.rule_id, onSave]);

  // Build a human-readable description from the current param inputs
  function actionParamSummary(): string {
    if (actionCode === 'WIDEN_SPREAD')     return `Spread multiplier ×${multiplier}`;
    if (actionCode === 'MIN_HOLDING_TIME') return `Minimum hold ${minSecs} seconds`;
    if (actionCode === 'RESTRICT_VOLUME')  return `Max volume ${maxLots} lots`;
    if (actionCode === 'A_BOOK_PARTIAL')   return `Hedge ${hedgePct}% of exposure`;
    return '';
  }

  const isFactory = !isCustomRule;

  return (
    <div className="flex flex-col h-full" style={{ background: '#14151a', borderLeft: '1px solid #44454f' }}>
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #44454f' }}>
        <div>
          <div className="text-sm font-semibold text-white">
            {isFactory ? 'Edit Factory Rule' : 'Edit Custom Rule'} #{band.rule_id}
          </div>
          <div className="text-xs mt-0.5" style={{ color: '#a0a4b8' }}>
            {getBehaviorMeta(behaviorType).label} · PF {pfLabel(band)}
          </div>
        </div>
        <button onClick={onClose} className="btn-icon text-text-secondary hover:text-white">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

        {/* API error banners — shown when save or reset fails */}
        {saveError && (
          <div className="rounded p-3 text-xs" style={{ background: '#1f0c0e', border: '1px solid #7a2f36', color: '#ff6b6b' }}>
            <div className="font-semibold mb-0.5">Save failed</div>
            <div>{saveError}</div>
          </div>
        )}
        {resetError && (
          <div className="rounded p-3 text-xs" style={{ background: '#1f0c0e', border: '1px solid #7a2f36', color: '#ff6b6b' }}>
            <div className="font-semibold mb-0.5">Reset failed</div>
            <div>{resetError}</div>
          </div>
        )}

        {band.is_factory_default === false ? (
          <div className="rounded p-3 text-xs" style={{ background: '#1c1900', border: '1px solid #6a6530', color: '#e0d066' }}>
            <div className="font-semibold mb-1">Previously customised</div>
            <div>By <span className="font-mono">{band.updated_by}</span> · {formatDate(band.updated_at ?? '')}</div>
          </div>
        ) : (
          <div className="rounded p-3 text-xs" style={{ background: '#101820', border: '1px solid #2b3e57', color: '#5b86b8' }}>
            <div className="font-semibold mb-0.5">Factory Default</div>
            <div>This rule ships with NexRisk. Changes are tracked and can be individually reset via the API.</div>
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: '#a0a4b8' }}>
            Risk Level
          </label>
          <div className="flex gap-2 flex-wrap">
            {(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as RiskLevel[]).map(lvl => {
              const rs = RISK_STYLE[lvl];
              return (
                <button key={lvl} onClick={() => setRiskLevel(lvl)}
                  className="px-3 py-1.5 rounded text-xs font-semibold transition-all"
                  style={{
                    background: riskLevel === lvl ? rs.bg : '#1b1c22',
                    color:      riskLevel === lvl ? rs.text : '#a0a4b8',
                    border: `1px solid ${riskLevel === lvl ? rs.bar : '#44454f'}`,
                    boxShadow:  riskLevel === lvl ? `0 0 8px ${rs.bar}60` : 'none',
                  }}>
                  {rs.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: '#a0a4b8' }}>Action</label>
          <select value={actionCode} onChange={e => setActionCode(e.target.value as ActionCode)} className="select w-full">
            {actionDefs
              ? actionDefs.map(d => <option key={d.code} value={d.code}>{ACTION_LABELS[d.code as ActionCode] ?? d.code} — {d.description}</option>)
              : (Object.keys(ACTION_LABELS) as ActionCode[]).map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)
            }
          </select>
          {selectedDef && (
            <p className="text-xs mt-1.5" style={{ color: '#666' }}>
              {selectedDef.requires_approval && <span style={{ color: '#e0b84a' }}>⚠ Requires approval · </span>}
              {selectedDef.auto_executable ? 'Auto-executable' : 'Manual execution required'}
            </p>
          )}
        </div>

        {/* Schema-driven params — uses ranges from API */}
        {actionCode === 'WIDEN_SPREAD' && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#a0a4b8' }}>
              Spread Multiplier
            </label>
            <input type="number" min={schema.multiplier?.min ?? 1.01} max={schema.multiplier?.max ?? 10}
              step="0.1" value={multiplier} onChange={e => setMultiplier(e.target.value)} className="input w-full" />
            <p className="text-xs mt-1" style={{ color: '#666' }}>
              Range: {schema.multiplier?.min ?? 1.01} – {schema.multiplier?.max ?? 10}
            </p>
          </div>
        )}
        {actionCode === 'A_BOOK_PARTIAL' && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#a0a4b8' }}>
              Hedge Percentage (%)
            </label>
            <input type="number" min={schema.hedge_pct?.min ?? 1} max={schema.hedge_pct?.max ?? 99}
              step="1" value={hedgePct} onChange={e => setHedgePct(e.target.value)} className="input w-full" />
            <p className="text-xs mt-1" style={{ color: '#666' }}>Portion of exposure sent to LP. Range: 1 – 99%</p>
          </div>
        )}
        {actionCode === 'MIN_HOLDING_TIME' && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#a0a4b8' }}>
              Minimum Holding Time (seconds)
            </label>
            <input type="number" min={schema.min_seconds?.min ?? 5} max={schema.min_seconds?.max ?? 3600}
              step="5" value={minSecs} onChange={e => setMinSecs(e.target.value)} className="input w-full" />
            <p className="text-xs mt-1" style={{ color: '#666' }}>Range: 5 – 3,600 seconds</p>
          </div>
        )}
        {actionCode === 'RESTRICT_VOLUME' && (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: '#a0a4b8' }}>
              Maximum Volume (lots)
            </label>
            <input type="number" min={schema.max_lots?.min ?? 0.01} max={schema.max_lots?.max ?? 100}
              step="0.01" value={maxLots} onChange={e => setMaxLots(e.target.value)} className="input w-full" />
            <p className="text-xs mt-1" style={{ color: '#666' }}>Range: 0.01 – 100.0 lots</p>
          </div>
        )}

        <div className="rounded p-3" style={{ background: '#0f1015', border: '1px solid #2a2b33' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#a0a4b8' }}>Preview</div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-text-secondary">From:</span>
            <ActionBadge code={band.action_code} actionDefs={actionDefs} />
            <RiskBadge level={band.risk_level} />
            <span className="text-xs" style={{ color: '#555' }}>→</span>
            <ActionBadge code={actionCode} actionDefs={actionDefs} />
            <RiskBadge level={riskLevel} />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2 block"
            style={{ color: '#a0a4b8' }}>
            Reason for Change
            <span className="text-xs font-normal normal-case" style={{ color: '#ff6b6b' }}>Required for audit</span>
          </label>
          <textarea rows={3} value={reason}
            onChange={e => { setReason(e.target.value); setReasonError(false); }}
            placeholder="Describe why this rule is being changed…"
            className="input w-full resize-none"
            style={{ borderColor: reasonError ? '#ff6b6b' : undefined }}
          />
          {reasonError && (
            <p className="text-xs mt-1" style={{ color: '#ff6b6b' }}>A reason is mandatory for audit compliance.</p>
          )}
        </div>
      </div>

      <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderTop: '1px solid #44454f' }}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} disabled={isSaving || isResetting} className="btn btn-ghost text-sm">Cancel</button>
          {isFactory && (
            <button
              onClick={() => onResetRule(band.rule_id)}
              disabled={isSaving || isResetting}
              className="btn text-sm flex items-center gap-1.5"
              style={{ background: '#1c1900', color: '#e0b84a', border: '1px solid #6a6530' }}
              title="Revert this rule to its original factory shipped values"
            >
              {isResetting && <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />}
              <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Reset to factory
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || isResetting}
          className="btn btn-primary text-sm flex items-center gap-2"
        >
          {isSaving && <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />}
          Save Change
        </button>
      </div>
    </div>
  );
}

// ─── Rule Lookup Panel ───────────────────────────────────────

function RuleLookupPanel({
  pfBands, actionDefs, modifiedRuleIds, onClose, onCellClick,
}: {
  pfBands:         Record<BehaviorType, PFBand[]>;
  actionDefs?:     ActionCodeDef[];
  modifiedRuleIds: Set<number>;
  onClose:         () => void;
  onCellClick:     (behavior: BehaviorType, band: PFBand) => void;
}) {
  const [filterBehavior,  setFilterBehavior]  = useState<BehaviorType | 'ALL'>('ALL');
  const [filterRiskLevel, setFilterRiskLevel] = useState<RiskLevel | 'ALL'>('ALL');
  const [filterAction,    setFilterAction]    = useState<ActionCode | 'ALL'>('ALL');
  const [filterPF,        setFilterPF]        = useState('');

  const results = useMemo(() => {
    const pfVal = filterPF !== '' ? parseFloat(filterPF) : null;
    const rows: Array<{ behavior: BehaviorType; band: PFBand }> = [];
    for (const [btype, bands] of Object.entries(pfBands)) {
      if (filterBehavior !== 'ALL' && btype !== filterBehavior) continue;
      for (const band of bands) {
        if (filterRiskLevel !== 'ALL' && band.risk_level !== filterRiskLevel) continue;
        if (filterAction    !== 'ALL' && band.action_code !== filterAction)   continue;
        if (pfVal !== null && !(band.pf_min <= pfVal && (isOpenEnded(band.pf_max) || (band.pf_max as number) > pfVal))) continue;
        rows.push({ behavior: btype, band });
      }
    }
    return rows;
  }, [pfBands, filterBehavior, filterRiskLevel, filterAction, filterPF]);

  const hasFilters = filterBehavior !== 'ALL' || filterRiskLevel !== 'ALL' || filterAction !== 'ALL' || filterPF !== '';
  const allActionCodes = useMemo(() => {
    const codes = new Set<ActionCode>();
    for (const bands of Object.values(pfBands)) for (const b of bands) codes.add(b.action_code);
    return [...codes].sort();
  }, [pfBands]);

  return (
    <div className="panel flex flex-col" style={{ minWidth: 340, maxWidth: 420 }}>
      <div className="panel-header">
        <div>
          <div className="text-sm font-semibold text-white">Rule Lookup</div>
          <div className="text-xs mt-0.5 text-text-secondary">Filter rules by any combination of fields</div>
        </div>
        <button onClick={onClose} className="btn-icon text-text-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="panel-body flex flex-col gap-3">

        {/* Filters */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#a0a4b8' }}>Behavior</label>
            <select value={filterBehavior} onChange={e => setFilterBehavior(e.target.value as BehaviorType | 'ALL')} className="select w-full text-xs">
              <option value="ALL">All behaviors</option>
              {getBehaviors(pfBands).map(b => <option key={b} value={b}>{getBehaviorMeta(b).label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#a0a4b8' }}>Risk Level</label>
            <select value={filterRiskLevel} onChange={e => setFilterRiskLevel(e.target.value as RiskLevel | 'ALL')} className="select w-full text-xs">
              <option value="ALL">All levels</option>
              {(['VERY_LOW','LOW','MEDIUM','HIGH','CRITICAL'] as RiskLevel[]).map(l =>
                <option key={l} value={l}>{RISK_STYLE[l].label}</option>
              )}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#a0a4b8' }}>Action</label>
            <select value={filterAction} onChange={e => setFilterAction(e.target.value as ActionCode | 'ALL')} className="select w-full text-xs">
              <option value="ALL">All actions</option>
              {allActionCodes.map(c => <option key={c} value={c}>{ACTION_LABELS[c] ?? c}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1" style={{ color: '#a0a4b8' }}>Profit Factor</label>
            <input
              type="number" min="0" step="0.01" value={filterPF}
              onChange={e => setFilterPF(e.target.value)}
              className="input w-full font-mono text-xs" placeholder="e.g. 1.85"
            />
          </div>
        </div>

        {hasFilters && (
          <button onClick={() => { setFilterBehavior('ALL'); setFilterRiskLevel('ALL'); setFilterAction('ALL'); setFilterPF(''); }}
            className="text-xs text-text-muted hover:text-white transition-colors text-left">
            ✕ Clear filters
          </button>
        )}

        {/* Divider */}
        <div style={{ borderTop: '1px solid #2a2b35' }} />

        {/* Results */}
        <div className="text-xs text-text-muted">
          {results.length === 0
            ? 'No rules match'
            : `${results.length} rule${results.length !== 1 ? 's' : ''} matched`}
        </div>

        <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: 420 }}>
          {results.map(({ behavior, band }) => {
            const s        = RISK_STYLE[band.risk_level];
            const hint     = actionParamHint(band);
            const modified = modifiedRuleIds.has(band.rule_id);
            return (
              <button key={band.rule_id}
                onClick={() => onCellClick(behavior, band)}
                className="text-left rounded transition-all hover:ring-1 hover:ring-accent"
                style={{ background: s.bg, border: `1px solid ${modified ? '#9a7830' : s.border}`, position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: 2, background: s.bar, width: '100%' }} />
                {modified && <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full" style={{ background: '#e0b84a' }} />}
                <div className="p-3 flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: s.text, opacity: 0.7 }}>
                        {s.label}
                      </span>
                      {modified && <span className="text-xs" style={{ color: '#e0b84a' }}>Modified</span>}
                    </div>
                    <span className="text-sm font-semibold" style={{ color: s.text }}>
                      {getActionLabel(band.action_code, actionDefs)}
                    </span>
                    {hint && <span className="text-xs font-mono" style={{ color: s.text, opacity: 0.65 }}>{hint}</span>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                    <span className="text-xs text-text-muted">{getBehaviorMeta(behavior).label}</span>
                    <span className="text-xs font-mono" style={{ color: s.text, opacity: 0.75 }}>PF {pfLabel(band)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────

interface ConfirmModalProps {
  title:                 string;
  body:                  string;
  confirmLabel:          string;
  danger?:               boolean;
  onConfirm:             () => void;
  onCancel:              () => void;
  isWorking?:            boolean;
  requireDoubleConfirm?: boolean;
  doubleConfirmLabel?:   string;
}

function ConfirmModal({
  title, body, confirmLabel, danger = false,
  onConfirm, onCancel, isWorking,
  requireDoubleConfirm = false, doubleConfirmLabel,
}: ConfirmModalProps) {
  const [checked, setChecked] = useState(false);
  const blocked = requireDoubleConfirm && !checked;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-lg flex flex-col w-full max-w-md mx-4"
        style={{ background: '#1b1c22', border: '1px solid #44454f', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}>

        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid #44454f' }}>
          {danger && (
            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
              style={{ background: '#1f0c0e', border: '1px solid #7a2f36' }}>
              <svg width="14" height="14" fill="none" stroke="#ff6b6b" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          )}
          <div className="text-sm font-semibold text-white">{title}</div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <p className="text-sm text-text-secondary leading-relaxed">{body}</p>
          {requireDoubleConfirm && (
            <div className="rounded p-3" style={{ background: '#1f0c0e', border: '1px solid #7a2f36' }}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
                  className="mt-0.5 shrink-0" style={{ accentColor: '#ff6b6b', width: 14, height: 14 }} />
                <span className="text-xs leading-relaxed font-semibold" style={{ color: '#ff6b6b' }}>
                  {doubleConfirmLabel ?? 'I understand this action cannot be undone.'}
                </span>
              </label>
              {!checked && (
                <p className="text-xs mt-2 ml-5" style={{ color: '#7a4040' }}>
                  Tick the box above to enable the confirm button.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid #44454f' }}>
          <button onClick={onCancel} disabled={isWorking} className="btn btn-ghost text-sm">Cancel</button>
          <button onClick={onConfirm} disabled={isWorking || blocked}
            className="btn text-sm flex items-center gap-2"
            style={{
              background: danger ? '#1f0c0e' : '#163a3a',
              color:      danger ? '#ff6b6b' : '#49b3b3',
              border:     `1px solid ${danger ? '#7a2f36' : '#2f6a3d'}`,
              opacity:    blocked ? 0.4 : 1,
            }}>
            {isWorking && <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Matrix Tab ────────────────────────────────────────────────

function MatrixTab({ pfBands, actionDefs, modifiedRuleIds, onCellClick, onResetBehavior }: {
  pfBands: Record<BehaviorType, PFBand[]>; actionDefs?: ActionCodeDef[];
  modifiedRuleIds: Set<number>;
  onCellClick:     (behavior: BehaviorType, band: PFBand) => void;
  onResetBehavior: (behavior: BehaviorType) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 flex-wrap">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a0a4b8' }}>Risk Level</span>
        {(['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as RiskLevel[]).map(lvl => {
          const s = RISK_STYLE[lvl];
          return (
            <div key={lvl} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.bar }} />
              <span className="text-xs" style={{ color: s.text }}>{s.label}</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#e0b84a' }} />
          <span className="text-xs text-text-secondary">Modified from default</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {getBehaviors(pfBands).map(btype => {
          const bands = pfBands[btype] ?? [];
          return (
            <div key={btype} className="flex gap-2 items-stretch">
              <div className="flex flex-col justify-center shrink-0" style={{ width: 136 }}>
                <div className="text-sm font-semibold text-white">{getBehaviorMeta(btype).label}</div>
                <div className="text-xs mt-0.5 leading-snug" style={{ color: '#666' }}>
                  {getBehaviorMeta(btype).description}
                </div>
                <button
                  onClick={() => onResetBehavior(btype)}
                  className="mt-1.5 text-xs flex items-center gap-1 transition-colors"
                  style={{ color: '#e0b84a' }}
                  title={`Reset all ${getBehaviorMeta(btype).label} rules to factory defaults`}
                >
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                  Reset row
                </button>
              </div>
              <div className="flex gap-1 flex-1" style={{ minHeight: 86 }}>
                {bands.length > 0 ? (
                  bands.map(band => (
                    <BandCell key={band.rule_id} band={band} actionDefs={actionDefs}
                      modifiedRuleIds={modifiedRuleIds} onClick={() => onCellClick(btype, band)} />
                  ))
                ) : (
                  <div className="flex-1 rounded flex items-center justify-center text-xs text-text-muted"
                    style={{ background: '#1b1c22', border: '1px solid #323340' }}>
                    No rules defined
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: '#555', marginTop: 4 }}>
        Click any cell to view or edit that rule. Changes require a reason and are written to the audit log.
      </p>
    </div>
  );
}

// ─── Rules Tab ─────────────────────────────────────────────────

function RulesTab({ pfBands, actionDefs, modifiedRuleIds }: { pfBands: Record<BehaviorType, PFBand[]>; actionDefs?: ActionCodeDef[]; modifiedRuleIds: Set<number> }) {
  const [filterBehavior, setFilterBehavior] = useState<BehaviorType | 'ALL'>('ALL');
  const [filterSource,   setFilterSource]   = useState<'ALL' | 'FACTORY' | 'MODIFIED'>('ALL');

  const allRules = useMemo(() => {
    const rows: Array<{ behavior: BehaviorType; band: PFBand }> = [];
    getBehaviors(pfBands).forEach(b => { (pfBands[b] ?? []).forEach(band => rows.push({ behavior: b, band })); });
    return rows;
  }, [pfBands]);

  const filtered = useMemo(() => allRules.filter(r => {
    if (filterBehavior !== 'ALL' && r.behavior !== filterBehavior) return false;
    if (filterSource === 'FACTORY'  && r.band.is_factory_default === false) return false;
    if (filterSource === 'MODIFIED' && r.band.is_factory_default !== false) return false;
    return true;
  }), [allRules, filterBehavior, filterSource]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterBehavior}
          onChange={e => setFilterBehavior(e.target.value as BehaviorType | 'ALL')} className="select text-sm">
          <option value="ALL">All Behaviors</option>
          {getBehaviors(pfBands).map(b => <option key={b} value={b}>{getBehaviorMeta(b).label}</option>)}
        </select>
        <div className="flex rounded overflow-hidden" style={{ border: '1px solid #44454f' }}>
          {(['ALL', 'FACTORY', 'MODIFIED'] as const).map(v => (
            <button key={v} onClick={() => setFilterSource(v)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{ background: filterSource === v ? '#163a3a' : 'transparent', color: filterSource === v ? '#49b3b3' : '#a0a4b8' }}>
              {v === 'ALL' ? 'All' : v === 'FACTORY' ? 'Factory Default' : 'Modified'}
            </button>
          ))}
        </div>
        <span className="text-xs text-text-muted ml-auto">{filtered.length} rules</span>
      </div>
      <div className="rounded overflow-hidden" style={{ border: '1px solid #44454f' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#14151a', borderBottom: '1px solid #44454f' }}>
              {['#', 'Behavior', 'PF Range', 'Risk Level', 'Action', 'Params', 'Source', 'Modified By'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#a0a4b8' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ behavior, band }, i) => {
              const modified = modifiedRuleIds ? modifiedRuleIds.has(band.rule_id) : band.is_factory_default === false;
              return (
                <tr key={band.rule_id} style={{
                  background: i % 2 === 0 ? '#1b1c22' : '#181920',
                  borderBottom: '1px solid #2a2b33',
                  borderLeft: `2px solid ${modified ? '#9a7830' : 'transparent'}`,
                }}>
                  <td className="px-3 py-2 font-mono text-xs text-text-muted">{band.rule_id}</td>
                  <td className="px-3 py-2 text-xs text-white">{getBehaviorMeta(behavior).label}</td>
                  <td className="px-3 py-2 font-mono text-xs text-text-secondary">{pfLabel(band)}</td>
                  <td className="px-3 py-2"><RiskBadge level={band.risk_level} /></td>
                  <td className="px-3 py-2"><ActionBadge code={band.action_code} actionDefs={actionDefs} /></td>
                  <td className="px-3 py-2 text-xs font-mono text-text-muted">{actionParamHint(band) ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs" style={{ color: modified ? '#e0b84a' : '#5b86b8' }}>
                      {modified ? 'Modified' : 'Default'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {modified && band.updated_by ? (
                      <div>
                        <div className="text-xs font-mono text-white">{band.updated_by}</div>
                        <div className="text-xs" style={{ color: '#666' }}>{formatDate(band.updated_at ?? '')}</div>
                      </div>
                    ) : <span className="text-xs text-text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ─── Audit Tab ────────────────────────────────────────────────

function AuditTab({ history, pfBands }: { history: AuditEntry[]; pfBands: Record<BehaviorType, PFBand[]> }) {
  const CHANGE_COLORS: Record<string, { color: string; bg: string }> = {
    CREATE:               { color: '#66e07a', bg: '#162a1c' },
    UPDATE:               { color: '#e0d066', bg: '#1a1900' },
    DELETE:               { color: '#ff6b6b', bg: '#1f0c0e' },
    RESET_SINGLE:         { color: '#5b86b8', bg: '#101820' },
    RESET_BEHAVIOR:       { color: '#5b86b8', bg: '#101820' },
    RESET_ALL:            { color: '#5b86b8', bg: '#101820' },
    REPLACE_LADDER:       { color: '#e09a55', bg: '#1c1200' },
    BULK_TOGGLE:          { color: '#a0a4b8', bg: '#1b1c22' },
    BULK_ACTION:          { color: '#e09a55', bg: '#1c1200' },
    IMPORT_MERGE:         { color: '#66e07a', bg: '#162a1c' },
    IMPORT_REPLACE_CUSTOM:{ color: '#e09a55', bg: '#1c1200' },
  };

  // Build rule_id → behavior_type map from pfBands
  const ruleIdToBehavior = useMemo(() => {
    const m: Record<number, string> = {};
    for (const [btype, bands] of Object.entries(pfBands)) {
      for (const b of bands) m[b.rule_id] = btype;
    }
    return m;
  }, [pfBands]);

  // Derive unique values for filter dropdowns
  const allOperators  = useMemo(() => [...new Set(history.map(e => e.changed_by))].sort(), [history]);
  const allChangeTypes = useMemo(() => [...new Set(history.map(e => e.change_type))].sort(), [history]);
  const allBehaviors   = useMemo(() => [...new Set(history.map(e => ruleIdToBehavior[e.record_id]).filter(Boolean))].sort(), [history, ruleIdToBehavior]);

  const [fromDate,    setFromDate]    = useState('');
  const [toDate,      setToDate]      = useState('');
  const [filterOp,    setFilterOp]    = useState('ALL');
  const [filterType,  setFilterType]  = useState('ALL');
  const [filterBeh,   setFilterBeh]   = useState('ALL');

  const filtered = useMemo(() => {
    return history.filter(e => {
      if (filterOp   !== 'ALL' && e.changed_by   !== filterOp)   return false;
      if (filterType !== 'ALL' && e.change_type   !== filterType) return false;
      if (filterBeh  !== 'ALL' && ruleIdToBehavior[e.record_id] !== filterBeh) return false;
      if (fromDate) {
        const from = new Date(fromDate + 'T00:00:00');
        if (new Date(e.changed_at) < from) return false;
      }
      if (toDate) {
        const to = new Date(toDate + 'T23:59:59');
        if (new Date(e.changed_at) > to) return false;
      }
      return true;
    });
  }, [history, filterOp, filterType, filterBeh, fromDate, toDate, ruleIdToBehavior]);

  const hasFilters = filterOp !== 'ALL' || filterType !== 'ALL' || filterBeh !== 'ALL' || fromDate || toDate;

  const clearFilters = () => {
    setFromDate(''); setToDate(''); setFilterOp('ALL'); setFilterType('ALL'); setFilterBeh('ALL');
  };

  const inputStyle: React.CSSProperties = {
    background: '#131418', border: '1px solid #2a2b35', color: '#d2d6e2',
    borderRadius: 4, padding: '4px 8px', fontSize: 12, width: '100%',
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Filter bar */}
      <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: '#131418', border: '1px solid #2a2b35' }}>
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>

          {/* From date */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#a0a4b8' }}>From</div>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inputStyle} />
          </div>

          {/* To date */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#a0a4b8' }}>To</div>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inputStyle} />
          </div>

          {/* Change type */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#a0a4b8' }}>Change Type</div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="select w-full text-xs">
              <option value="ALL">All types</option>
              {allChangeTypes.map(t => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Behavior */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#a0a4b8' }}>Behavior</div>
            <select value={filterBeh} onChange={e => setFilterBeh(e.target.value)} className="select w-full text-xs">
              <option value="ALL">All behaviors</option>
              {allBehaviors.map(b => (
                <option key={b} value={b}>{getBehaviorMeta(b).label}</option>
              ))}
            </select>
          </div>

          {/* Operator */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#a0a4b8' }}>Operator</div>
            <select value={filterOp} onChange={e => setFilterOp(e.target.value)} className="select w-full text-xs">
              <option value="ALL">All operators</option>
              {allOperators.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#a0a4b8' }}>
            {filtered.length} of {history.length} change{history.length !== 1 ? 's' : ''}
            {hasFilters && ' (filtered)'}
          </span>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs hover:text-white transition-colors" style={{ color: '#666' }}>
              ✕ Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-3xl mb-3 opacity-20">◎</div>
          <div className="text-sm text-text-secondary">
            {history.length === 0 ? 'No changes recorded' : 'No changes match the current filters'}
          </div>
        </div>
      ) : (
        filtered.map(entry => {
          const c        = CHANGE_COLORS[entry.change_type] ?? { color: '#d2d6e2', bg: '#1b1c22' };
          const behavior = ruleIdToBehavior[entry.record_id];
          return (
            <div key={entry.id} className="panel" style={{ borderLeft: `3px solid ${c.color}` }}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
                      style={{ background: c.bg, color: c.color, border: `1px solid ${c.color}50` }}>
                      {entry.change_type.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs" style={{ color: '#a0a4b8' }}>Rule #{entry.record_id}</span>
                    {behavior && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#1b1c22', border: '1px solid #2a2b35', color: '#d2d6e2' }}>
                        {getBehaviorMeta(behavior).label}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-semibold text-white">{entry.changed_by}</div>
                    <div className="text-xs mt-0.5" style={{ color: '#666' }}>{formatDateTime(entry.changed_at)}</div>
                  </div>
                </div>
                {(entry.old_values && Object.keys(entry.old_values).length > 0 || entry.new_values && Object.keys(entry.new_values).length > 0) && (
                  <div className="flex gap-3 mb-3 text-xs font-mono flex-wrap">
                    {entry.old_values && Object.keys(entry.old_values).length > 0 && (
                      <div className="rounded p-2 flex-1" style={{ background: '#200c0f', border: '1px solid #5a1f25', minWidth: 140 }}>
                        <div className="font-semibold mb-1" style={{ color: '#ff6b6b' }}>Before</div>
                        {Object.entries(entry.old_values).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span style={{ color: '#888' }}>{k}:</span>
                            <span style={{ color: '#ff6b6b' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {entry.new_values && Object.keys(entry.new_values).length > 0 && (
                      <div className="rounded p-2 flex-1" style={{ background: '#0c200f', border: '1px solid #1f5a25', minWidth: 140 }}>
                        <div className="font-semibold mb-1" style={{ color: '#66e07a' }}>After</div>
                        {Object.entries(entry.new_values).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <span style={{ color: '#888' }}>{k}:</span>
                            <span style={{ color: '#66e07a' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {entry.reason && (
                  <div className="text-xs rounded p-2.5 italic"
                    style={{ background: '#14151a', border: '1px solid #2a2b33', color: '#a0a4b8' }}>
                    "{entry.reason}"
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}


// ─── Main Page ─────────────────────────────────────────────────

type Tab = 'matrix' | 'rules' | 'history';

export function CharterPage() {
  const qc = useQueryClient();
  const [activeTab,    setActiveTab]    = useState<Tab>('matrix');
  const [showLookup, setShowLookup] = useState(false);
  const [editTarget,   setEditTarget]   = useState<{ behavior: BehaviorType; band: PFBand } | null>(null);

  // Confirm modal state — covers both behavior-level and full factory reset
  const [confirmModal, setConfirmModal] = useState<{
    type:     'behavior' | 'all';
    behavior?: BehaviorType;
  } | null>(null);

  // GET /api/v1/risk-matrix/pf-bands — confirmed live, returns grouped by behavior_type
  // pf_max: 999.0 for open-ended bands (isOpenEnded handles this)
  const { data: pfBandsData, isLoading: bandsLoading } = useQuery({
    queryKey: ['risk-matrix-pf-bands'],
    queryFn:  () => apiFetch<Record<BehaviorType, PFBand[]>>('/api/v1/risk-matrix/pf-bands'),
    placeholderData: FACTORY_PF_BANDS,
    retry: 1,
  });

  // GET /api/v1/risk-matrix/diff — confirmed live
  const { data: diffData } = useQuery({
    queryKey: ['risk-matrix-diff'],
    queryFn:  () => apiFetch<{
      total_changes:          number;
      modified_factory_rules: Array<{ rule_id: number }>;
      disabled_factory_rules: Array<{ rule_id: number }>;
      custom_rules:           Array<{ rule_id: number }>;
    }>('/api/v1/risk-matrix/diff'),
    placeholderData: { total_changes: 0, modified_factory_rules: [], disabled_factory_rules: [], custom_rules: [] },
  });

  // GET /api/v1/risk-matrix/action-codes — includes params_schema
  const { data: actionCodesData } = useQuery({
    queryKey: ['risk-matrix-action-codes'],
    queryFn:  () => apiFetch<{ action_codes: ActionCodeDef[] }>('/api/v1/risk-matrix/action-codes'),
    staleTime: Infinity,
  });



  // GET /api/v1/config/risk-matrix/history?limit=100
  // Single global endpoint — implemented by backend 2026-02-24
  const { data: historyData, isLoading: historyLoading, error: historyError } = useQuery({
    queryKey: ['risk-matrix-history'],
    queryFn:  () => apiFetch<{ history: AuditEntry[]; total: number }>('/api/v1/config/risk-matrix/history?limit=500'),
    enabled:  activeTab === 'history',
  });

  // PATCH /api/v1/risk-matrix/rules/:rule_id
  // Confirmed live — returns { success: true, rule_id }
  const updateRule = useMutation({
    mutationFn: ({ ruleId, patch }: { ruleId: number; patch: Record<string, unknown> }) =>
      apiFetch<{ success: boolean; rule_id: number }>(
        `/api/v1/risk-matrix/rules/${ruleId}`,
        { method: 'PATCH', body: JSON.stringify(patch) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risk-matrix-pf-bands'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-diff'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-history'] });
      setEditTarget(null);
    },
  });

  // Reset endpoints live in the extended /api/v1/risk-matrix/* API — not yet implemented.
  // Stubs defined so the UI renders; they will return 404 until the backend ships them.
  const resetRule = useMutation({
    mutationFn: (ruleId: number) =>
      apiFetch<{ success: boolean; message: string }>(
        `/api/v1/risk-matrix/rules/${ruleId}/reset`,
        { method: 'POST', body: JSON.stringify({ confirm: true, updated_by: 'risk_manager' }) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risk-matrix-pf-bands'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-diff'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-history'] });
      setEditTarget(null);
    },
  });

  const resetBehavior = useMutation({
    mutationFn: (behavior: BehaviorType) =>
      apiFetch<{ success: boolean; message: string }>(
        `/api/v1/risk-matrix/reset/${behavior}`,
        { method: 'POST', body: JSON.stringify({ confirm: true, updated_by: 'risk_manager' }) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risk-matrix-pf-bands'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-diff'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-history'] });
      setConfirmModal(null);
    },
  });

  const resetAll = useMutation({
    mutationFn: () =>
      apiFetch<{ success: boolean; message: string }>(
        '/api/v1/risk-matrix/reset/all',
        { method: 'POST', body: JSON.stringify({ confirm: true, confirm_delete_custom: true, updated_by: 'risk_manager' }) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risk-matrix-pf-bands'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-diff'] });
      qc.invalidateQueries({ queryKey: ['risk-matrix-history'] });
      setConfirmModal(null);
    },
  });

  // GET /api/v1/risk-matrix/rules/export
  // Returns a file attachment — open in new tab to trigger download
  const handleExport = useCallback(() => {
    window.open(`${API_BASE}/api/v1/risk-matrix/rules/export`, '_blank');
  }, []);

  const pfBands    = pfBandsData   ?? FACTORY_PF_BANDS;
  const actionDefs = actionCodesData?.action_codes;
  const history    = historyData?.history ?? [];
  const diffCount       = diffData?.total_changes ?? 0;
  // Set of rule_ids that have been modified from factory — drives yellow dot on matrix cells
  const modifiedRuleIds = useMemo(() => {
    const ids = new Set<number>();
    for (const r of diffData?.modified_factory_rules ?? []) ids.add(r.rule_id);
    for (const r of diffData?.custom_rules ?? [])           ids.add(r.rule_id);
    return ids;
  }, [diffData]);

  // Clear stale mutation errors whenever a new card is opened
  useEffect(() => {
    updateRule.reset();
    resetRule.reset();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget?.band.rule_id]);

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'matrix',    label: 'Risk Matrix' },
    { id: 'rules',     label: 'All Rules' },
      { id: 'history',   label: 'Change History', badge: history.length || undefined },
  ];

  return (
    <div className="h-full flex overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Page header */}
        <div className="px-5 pt-5 pb-0" style={{ borderBottom: '1px solid #44454f' }}>
          <div className="flex items-start justify-between gap-4 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold text-white">Risk Charter</h1>
                {bandsLoading && (
                  <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin" />
                )}
                {diffCount > 0 ? (
                  <span className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{ background: '#1c1900', color: '#e0b84a', border: '1px solid #6a6530' }}>
                    {diffCount} change{diffCount !== 1 ? 's' : ''} from factory defaults
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded font-semibold"
                    style={{ background: '#0f200f', color: '#66e07a', border: '1px solid #2f6a3d' }}>
                    At factory defaults
                  </span>
                )}
              </div>
              <p className="text-sm mt-1 text-text-secondary max-w-2xl">
                Defines the risk posture for each trader classification based on Profit Factor.
                Rules govern whether positions are internalised, monitored, or routed to a liquidity provider.
                All changes are attributed and auditable.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setShowLookup(s => !s)}
                className={clsx('btn text-sm flex items-center gap-2', showLookup ? 'btn-primary' : 'btn-ghost')}>
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Rule Lookup
              </button>
              <button onClick={handleExport} className="btn btn-ghost text-sm">Export JSON</button>
              <button
                onClick={() => setConfirmModal({ type: 'all' })}
                className="btn text-sm flex items-center gap-1.5"
                style={{ background: '#1f0c0e', color: '#ff6b6b', border: '1px solid #7a2f36' }}
                title="Restore all factory rules and delete all custom rules"
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                  <path d="M3 3v5h5" />
                </svg>
                Reset to Factory
              </button>
            </div>
          </div>
          <div className="flex gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className="px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  color:        activeTab === t.id ? '#49b3b3' : '#a0a4b8',
                  borderBottom: `2px solid ${activeTab === t.id ? '#49b3b3' : 'transparent'}`,
                  background:   'transparent',
                }}>
                {t.label}
                {t.badge !== undefined && (
                  <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                    style={{ background: '#1c1900', color: '#e0b84a', fontSize: 10 }}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'matrix' && (
            <MatrixTab pfBands={pfBands} actionDefs={actionDefs} modifiedRuleIds={modifiedRuleIds}
              onCellClick={(behavior, band) => setEditTarget({ behavior, band })}
              onResetBehavior={(behavior) => setConfirmModal({ type: 'behavior', behavior })} />
          )}
          {activeTab === 'rules'     && <RulesTab pfBands={pfBands} actionDefs={actionDefs} modifiedRuleIds={modifiedRuleIds} />}
          {activeTab === 'history' && (
            historyLoading
              ? <div className="flex items-center justify-center py-16 text-sm text-text-secondary gap-2">
                  <span className="w-4 h-4 border border-white/20 border-t-white rounded-full animate-spin" />
                  Loading change history…
                </div>
              : historyError
                ? <div className="p-4 text-xs rounded" style={{ background: '#1f0c0e', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
                    {(historyError as Error).message}
                  </div>
                : <AuditTab history={history} pfBands={pfBands} />
          )}
        </div>
      </div>

      {/* Rule Lookup sidebar */}
      {showLookup && !editTarget && (
        <div className="shrink-0 overflow-y-auto" style={{ borderLeft: '1px solid #44454f' }}>
          <RuleLookupPanel
            pfBands={pfBands}
            actionDefs={actionDefs}
            modifiedRuleIds={modifiedRuleIds}
            onClose={() => setShowLookup(false)}
            onCellClick={(behavior, band) => { setEditTarget({ behavior, band }); setShowLookup(false); }}
          />
        </div>
      )}

      {/* Edit rule sidebar */}
      {editTarget && (
        <div className="shrink-0 w-96 overflow-hidden flex flex-col" style={{ borderLeft: '1px solid #44454f' }}>
          <EditRulePanel
            band={editTarget.band}
            behaviorType={editTarget.behavior}
            actionDefs={actionDefs}
            isCustomRule={diffData?.custom_rules?.some(r => r.rule_id === editTarget.band.rule_id) ?? false}
            onClose={() => setEditTarget(null)}
            onSave={(ruleId, patch) => updateRule.mutate({ ruleId, patch })}
            onResetRule={(ruleId) => resetRule.mutate(ruleId)}
            isSaving={updateRule.isPending}
            isResetting={resetRule.isPending}
            saveError={updateRule.error ? (updateRule.error as Error).message : null}
            resetError={resetRule.error ? (resetRule.error as Error).message : null}
          />
        </div>
      )}

      {/* Confirm modal — behavior-level or full factory reset */}
      {confirmModal && (
        <ConfirmModal
          danger
          title={
            confirmModal.type === 'all'
              ? 'Full Factory Reset'
              : `Reset ${getBehaviorMeta(confirmModal.behavior!).label} to Factory`
          }
          body={
            confirmModal.type === 'all'
              ? 'This will restore all 57 factory rules to their shipped values and permanently delete every custom rule you have added. This cannot be undone.'
              : `This will restore all factory rules for ${getBehaviorMeta(confirmModal.behavior!).label} to their original shipped values. Your custom rules for this behavior are not affected.`
          }
          confirmLabel={confirmModal.type === 'all' ? 'Reset Everything' : 'Reset This Row'}
          requireDoubleConfirm={confirmModal.type === 'all'}
          doubleConfirmLabel="I understand all custom rules will be permanently deleted."
          isWorking={confirmModal.type === 'all' ? resetAll.isPending : resetBehavior.isPending}
          onCancel={() => setConfirmModal(null)}
          onConfirm={() => {
            if (confirmModal.type === 'all') {
              resetAll.mutate();
            } else {
              resetBehavior.mutate(confirmModal.behavior!);
            }
          }}
        />
      )}
    </div>
  );
}

export default CharterPage;