// ============================================
// Archetype Intelligence Page
// 4 tabs: Classifier | Detection | Clustering | LLM
// Read-only overview + edit drawers for all sections
// API: GET /api/v1/settings (one-shot load), per-section PUT endpoints
//      GET /api/v1/settings/llm/usage  (live usage counters)
//      Clustering: /api/v1/clustering/*
// ============================================

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { clsx } from 'clsx';
import { clusteringApi } from '@/services/api';

// ─────────────────────────────────────────────
// API helpers — same base as every other page
// ─────────────────────────────────────────────

// Use relative URLs so Vite proxy routes /api/* → BFF (localhost:8080) → C++ backend
const API_BASE = '';

const api = {
  get:  (path: string) => fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json' } }).then(r => r.json()),
  put:  (path: string, body: unknown) => fetch(`${API_BASE}${path}`, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  post: (path: string, body: unknown) => fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
};

// ─────────────────────────────────────────────
// camelCase → snake_case for PUT payloads
// (BFF GET returns camelCase, C++ PUT expects snake_case)
const toSnake = (obj: Record<string, any>): Record<string, any> =>
  Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k.replace(/([A-Z])/g, '_$1').toLowerCase(),
      v
    ])
  );

// ─────────────────────────────────────────────
// Shared UI atoms
// ─────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-wider text-white/50 mb-2">{children}</div>;
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#2a2a2c] last:border-0">
      <span className="text-sm text-white">{label}</span>
      <span className="text-sm text-white font-mono">{value}</span>
    </div>
  );
}

function Bar({ value, label, color = '#4a7a8a' }: { value: number; label: string; color?: string }) {
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className="mb-2">
      <div className="flex justify-between text-sm mb-0.5">
        <span className="text-white">{label}</span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-1.5 bg-[#2a2a2c] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', on ? 'bg-green-950/40 text-green-500' : 'bg-zinc-800 text-white/40')}>
      {on ? 'ON' : 'OFF'}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    MONITOR:  'bg-zinc-800/60 text-white/60 border-white/10',
    WARN:     'bg-amber-950/40 text-amber-500 border-amber-900/40',
    RESTRICT: 'bg-orange-950/40 text-orange-400 border-orange-900/30',
    ESCALATE: 'bg-red-950/30 text-red-500 border-red-900/15',
  };
  return <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border', map[level] ?? 'bg-zinc-800 text-white border-zinc-700')}>{level}</span>;
}

// Card wrapper
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx('bg-[#252527] rounded border border-[#3a3a3c] p-4', className)}>{children}</div>;
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-xs text-white/50 hover:text-white border border-white/20 px-2 py-0.5 rounded transition-colors shrink-0">
      Edit
    </button>
  );
}

// ─────────────────────────────────────────────
// Edit Drawer shell
// ─────────────────────────────────────────────

function Drawer({
  open, title, subtitle, onClose, onSave, saving, error, children,
}: {
  open: boolean; title: string; subtitle?: string;
  onClose: () => void; onSave: () => void; saving: boolean; error?: string | null;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <div className="w-[420px] h-full bg-[#1e1e20] border-l border-[#3a3a3c] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between px-5 py-4 border-b border-[#3a3a3c]">
          <div>
            <div className="text-sm font-semibold text-white">{title}</div>
            {subtitle && <div className="text-xs text-white/50 mt-0.5">{subtitle}</div>}
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white p-1 mt-0.5 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">{children}</div>
        {error && <div className="px-5 py-2 bg-red-950/20 border-t border-red-900/15 text-xs text-red-500">{error}</div>}
        <div className="border-t border-[#3a3a3c] px-5 py-4 flex gap-3">
          <button onClick={onSave} disabled={saving} className="flex-1 text-sm py-2 rounded bg-[#4a7a8a] text-[#1e1e20] font-semibold hover:bg-[#4a7a8a] disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="px-4 text-sm py-2 rounded border border-[#3a3a3c] text-white hover:text-white transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Form field components
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-white mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-white/40 mt-0.5">{hint}</p>}
    </div>
  );
}

function Num({ v, set, min, max, step = 0.01 }: { v: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input type="number" value={v} onChange={e => set(parseFloat(e.target.value))} min={min} max={max} step={step}
      className="w-full bg-[#1e1e20] border border-[#3a3a3c] rounded px-3 py-1.5 text-xs text-white font-mono focus:border-white/30 focus:outline-none" />
  );
}

function Sel({ v, set, opts }: { v: string; set: (s: string) => void; opts: { value: string; label: string }[] }) {
  return (
    <select value={v} onChange={e => set(e.target.value)}
      className="w-full bg-[#1e1e20] border border-[#3a3a3c] rounded px-3 py-1.5 text-xs text-white focus:border-white/30 focus:outline-none">
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─────────────────────────────────────────────
// CLASSIFIER TAB
// ─────────────────────────────────────────────

const DETECTORS = [
  { key: 'ea',        label: 'EA Bot',       color: '#7c6fa0', severity: 'ea' },
  { key: 'scalper',   label: 'Scalper',      color: '#b85c1a', severity: 'scalper' },
  { key: 'arbitrage', label: 'Arbitrage',    color: '#c0392b', severity: 'arbitrage' },
  { key: 'rebate',    label: 'Rebate Abuse', color: '#8a6d0a', severity: 'rebate' },
  { key: 'news',      label: 'News Trader',  color: '#4a7a8a', severity: 'news' },
] as const;

type DrawerKind = null | 'global' | 'risk_severity' | 'decision_engine' | 'anomaly' | { detector: string };

function ClassifierTab({ cfg }: { cfg: any }) {
  const qc = useQueryClient();
  const [dk, setDk] = useState<DrawerKind>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);

  const open = useCallback((kind: DrawerKind, init: Record<string, any> = {}) => {
    setErr(null); setForm(init); setDk(kind);
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (!dk) return;
      if (dk === 'global')          return api.put('/api/v1/settings/classifier/global', form);
      if (dk === 'risk_severity')   return api.put('/api/v1/settings/classifier/risk-severity', form);
      if (dk === 'decision_engine') return api.put('/api/v1/settings/classifier/decision-engine', form);
      if (dk === 'anomaly')         return api.put('/api/v1/settings/classifier/anomaly-detector', form);
      if (typeof dk === 'object')   return api.put(`/api/v1/settings/classifier/${dk.detector}`, form);
    },
    onSuccess: (d: any) => {
      if (d?.success === false) { setErr(d.errors?.join(', ') ?? 'Validation error'); return; }
      qc.invalidateQueries({ queryKey: ['all-settings'] });
      setDk(null);
    },
    onError: () => setErr('Request failed — check BFF connectivity.'),
  });

  const de = cfg?.decision_engine;
  const rs = cfg?.risk_severity;

  // Helper to get weight fields out of a detector config
  const weightFields = (det: Record<string, any>) =>
    Object.entries(det ?? {}).filter(([k]) => k.endsWith('_weight'));

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Row 1: Global Gate + Decision Engine */}
      <div className="grid grid-cols-4 gap-4">
        {/* Global gate */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Global Gate</SectionLabel>
            <EditBtn onClick={() => open('global', { min_trades_for_classification: cfg?.global?.min_trades_for_classification ?? 20 })} />
          </div>
          <div className="text-center py-2">
            <div className="text-4xl font-mono font-bold text-white">{cfg?.global?.min_trades_for_classification ?? '—'}</div>
            <div className="text-xs text-white/40 mt-1">min trades before any classification fires</div>
          </div>
        </Card>

        {/* Decision engine */}
        <Card className="col-span-3">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Decision Engine — Composite Weights + Action Thresholds</SectionLabel>
            <EditBtn onClick={() => open('decision_engine', de ? { ...de } : {})} />
          </div>
          {de ? (
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-xs text-white/50 mb-2">Composite Weights</div>
                <Bar value={de.behavior_weight}   label="Behaviour"   />
                <Bar value={de.anomaly_weight}    label="Anomaly"    color="#b85c1a" />
                <Bar value={de.persistence_weight} label="Persistence" color="#7c6fa0" />
                <div className="mt-3 pt-2 border-t border-[#3a3a3c]">
                  <KV label="Anomaly Boost"      value={`×${de.anomaly_risk_boost?.toFixed(1)}`} />
                  <KV label="Min Persistence"    value={`${de.min_persistence_sec}s / ${de.min_persistence_trades} trades`} />
                </div>
              </div>
              <div>
                <div className="text-sm text-white/50 mb-2">Action Thresholds</div>
                {[
                  ['monitor_threshold',       'Monitor ≥',       '#4a6fa5'],
                  ['warn_threshold',          'Warn ≥',          '#8a6d0a'],
                  ['restrict_threshold',      'Restrict ≥',      '#b85c1a'],
                  ['escalate_threshold',      'Escalate ≥',      '#c0392b'],
                  ['human_review_threshold',  'Human Review ≥',  '#8b7bb5'],
                ].map(([k, l, c]) => (
                  <div key={k} className="flex items-center justify-between py-1 border-b border-[#2a2a2c] last:border-0">
                    <span className="text-sm text-white">{l}</span>
                    <span className="text-sm font-mono font-bold" style={{ color: c }}>{de[k as string]?.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div className="text-xs text-white/40 text-center py-4">Not loaded</div>}
        </Card>
      </div>

      {/* Row 2: Severity Multipliers + Anomaly */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-3">
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Risk Severity Multipliers (0.10–1.00)</SectionLabel>
            <EditBtn onClick={() => open('risk_severity', rs ? { ...rs } : {})} />
          </div>
          <div className="grid grid-cols-5 gap-4">
            {DETECTORS.map(d => (
              <div key={d.key} className="text-center">
                <div className="text-xs text-white/50 mb-1">{d.label}</div>
                <div className="text-2xl font-mono font-bold" style={{ color: d.color }}>
                  {rs ? (rs[d.severity] as number)?.toFixed(2) : '—'}
                </div>
                <div className="h-1.5 bg-[#2a2a2c] rounded-full mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${((rs?.[d.severity] as number) ?? 0) * 100}%`, backgroundColor: d.color }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Anomaly Detector</SectionLabel>
            <EditBtn onClick={() => open('anomaly', { contamination: cfg?.anomaly_detector?.contamination ?? 0.05 })} />
          </div>
          <div className="text-center py-2">
            <div className="text-4xl font-mono font-bold text-white">
              {cfg?.anomaly_detector?.contamination !== undefined
                ? `${(cfg.anomaly_detector.contamination * 100).toFixed(0)}%`
                : '—'}
            </div>
            <div className="text-xs text-white/40 mt-1">expected anomalous fraction<br/>(Isolation Forest contamination)</div>
          </div>
        </Card>
      </div>

      {/* Row 3: Per-detector cards */}
      <div>
        <SectionLabel>Behaviour Detectors</SectionLabel>
        <div className="grid grid-cols-5 gap-3">
          {DETECTORS.map(d => {
            const det = cfg?.[d.key] as Record<string, any> | undefined;
            return (
              <Card key={d.key} className="!p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold" style={{ color: d.color }}>{d.label}</span>
                  <button onClick={() => open({ detector: d.key }, det ? { ...det } : {})} className="text-sm text-orange-500 hover:text-white transition-colors">Edit</button>
                </div>
                {det ? (
                  <div className="space-y-0.5">
                    <KV label="Min trades" value={String(det.min_trades ?? '—')} />
                    {/* All weight fields as bars */}
                    {Object.entries(det).filter(([k]) => k.endsWith('_weight')).map(([k, v]) => (
                      <Bar key={k} value={v as number} label={k.replace('_weight','').replace(/_/g,' ')} color={d.color} />
                    ))}
                    {/* All threshold / limit params as KV */}
                    {Object.entries(det)
                      .filter(([k]) => !k.endsWith('_weight') && k !== 'min_trades' && typeof det[k] === 'number')
                      .map(([k, v]) => (
                        <KV key={k} label={k.replace(/_/g,' ')} value={String(v)} />
                      ))}
                  </div>
                ) : (
                  <div className="text-xs text-white/40 text-center py-3">—</div>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Drawers ── */}

      <Drawer open={dk === 'global'} title="Global Classification Gate" subtitle="Min trades before any classification fires" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Min Trades for Classification" hint="5 – 500">
          <Num v={form.min_trades_for_classification ?? 20} set={v => setForm(f => ({ ...f, min_trades_for_classification: v }))} min={5} max={500} step={1} />
        </F>
      </Drawer>

      <Drawer open={dk === 'risk_severity'} title="Risk Severity Multipliers" subtitle="0.10 – 1.00 per behaviour type" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        {DETECTORS.map(d => (
          <F key={d.key} label={`${d.label} (${d.severity})`} hint="0.10 – 1.00">
            <Num v={form[d.severity] ?? 0.5} set={v => setForm(f => ({ ...f, [d.severity]: v }))} min={0.1} max={1.0} />
          </F>
        ))}
      </Drawer>

      <Drawer open={dk === 'decision_engine'} title="Decision Engine" subtitle="Composite weights must sum to 1.0 · thresholds must be ascending" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <SectionLabel>Composite Weights (sum = 1.0)</SectionLabel>
        {[['behavior_weight','Behaviour Weight'],['anomaly_weight','Anomaly Weight'],['persistence_weight','Persistence Weight']].map(([k,l]) => (
          <F key={k} label={l as string}><Num v={form[k] ?? 0} set={v => setForm(f => ({ ...f, [k]: v }))} min={0} max={1} /></F>
        ))}
        <SectionLabel>Action Thresholds (monitor &lt; warn &lt; restrict &lt; escalate)</SectionLabel>
        {[['monitor_threshold','Monitor'],['warn_threshold','Warn'],['restrict_threshold','Restrict'],['escalate_threshold','Escalate'],['human_review_threshold','Human Review']].map(([k,l]) => (
          <F key={k} label={l as string}><Num v={form[k] ?? 0} set={v => setForm(f => ({ ...f, [k]: v }))} min={0} max={100} step={1} /></F>
        ))}
        <SectionLabel>Anomaly Boost</SectionLabel>
        <F label="Anomaly Risk Boost" hint="1.0–3.0 — multiplier applied when anomaly is detected">
          <Num v={form.anomaly_risk_boost ?? 1.5} set={v => setForm(f => ({ ...f, anomaly_risk_boost: v }))} min={1.0} max={3.0} step={0.1} />
        </F>
        <F label="Min Persistence (seconds)" hint="60–3600">
          <Num v={form.min_persistence_sec ?? 300} set={v => setForm(f => ({ ...f, min_persistence_sec: v }))} min={60} max={3600} step={60} />
        </F>
        <F label="Min Persistence Trades" hint="5–200">
          <Num v={form.min_persistence_trades ?? 10} set={v => setForm(f => ({ ...f, min_persistence_trades: v }))} min={5} max={200} step={1} />
        </F>
      </Drawer>

      <Drawer open={dk === 'anomaly'} title="Anomaly Detector" subtitle="Isolation Forest contamination — expected fraction of anomalous traders" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Contamination" hint="0.01 – 0.30">
          <Num v={form.contamination ?? 0.05} set={v => setForm(f => ({ ...f, contamination: v }))} min={0.01} max={0.30} />
        </F>
      </Drawer>

      <Drawer
        open={typeof dk === 'object' && dk !== null && 'detector' in dk}
        title={`${DETECTORS.find(d => typeof dk === 'object' && dk !== null && 'detector' in dk && d.key === (dk as { detector: string }).detector)?.label ?? ''} Detector`}
        subtitle="All _weight fields must sum to 1.0 · send them all together"
        onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}
      >
        <F label="Min Trades" hint="Minimum trades before this detector fires">
          <Num v={form.min_trades ?? 10} set={v => setForm(f => ({ ...f, min_trades: v }))} min={5} max={500} step={1} />
        </F>
        {Object.entries(form)
          .filter(([k]) => k !== 'min_trades')
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => (
            <F key={k} label={k.replace(/_/g, ' ')}>
              <Num v={v as number} set={val => setForm(f => ({ ...f, [k]: val }))}
                min={0} max={typeof v === 'number' && v > 1 ? 10000 : 1}
                step={typeof v === 'number' && v > 1 ? 1 : 0.01} />
            </F>
          ))}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// DETECTION TAB
// ─────────────────────────────────────────────

const BEHAVIORS = ['EA', 'SCALPER', 'ARBITRAGE', 'REBATE'] as const;
const LEVELS    = ['MONITOR', 'WARN', 'RESTRICT', 'ESCALATE'] as const;
const LEVEL_CLR = { MONITOR: '#4a6fa5', WARN: '#8a6d0a', RESTRICT: '#b85c1a', ESCALATE: '#c0392b' };

type DetDrawerKind = null | 'risk_scoring' | 'processing' | 'auto_escalation' | { behavior: string };

function DetectionTab({ cfg }: { cfg: any }) {
  const qc = useQueryClient();
  const [dk, setDk] = useState<DetDrawerKind>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);

  const open = useCallback((kind: DetDrawerKind, init: Record<string, any> = {}) => {
    setErr(null); setForm(init); setDk(kind);
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (!dk) return;
      if (dk === 'risk_scoring')    return api.put('/api/v1/settings/detection/risk-scoring', form);
      if (dk === 'processing')      return api.put('/api/v1/settings/detection/processing', form);
      if (dk === 'auto_escalation') return api.put('/api/v1/settings/detection/auto-escalation', form);
      if (typeof dk === 'object' && 'behavior' in dk) {
        const payload: Record<string, any> = {};
        LEVELS.forEach(lv => {
          payload[lv] = {
            confidence_min:    form[`${lv}_confidence_min`],
            min_duration_sec:  form[`${lv}_min_duration_sec`],
            min_trades:        form[`${lv}_min_trades`],
          };
        });
        return api.put(`/api/v1/settings/detection/thresholds/${dk.behavior}`, payload);
      }
    },
    onSuccess: (d: any) => {
      if (d?.success === false) { setErr(d.errors?.join(', ') ?? 'Validation error'); return; }
      qc.invalidateQueries({ queryKey: ['all-settings'] });
      setDk(null);
    },
    onError: () => setErr('Request failed.'),
  });

  const rs   = cfg?.risk_scoring;
  const proc = cfg?.processing;
  const ae   = cfg?.auto_escalation;

  const fmtDur = (s: number) => s >= 3600 ? `${(s/3600).toFixed(0)}h` : s >= 60 ? `${(s/60).toFixed(0)}m` : `${s}s`;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Row 1: Risk Scoring + Processing + Auto-Escalation */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Risk Scoring</SectionLabel>
            <EditBtn onClick={() => open('risk_scoring', rs ? { ea_severity: rs.ea_severity, scalper_severity: rs.scalper_severity, arbitrage_severity: rs.arbitrage_severity, rebate_severity: rs.rebate_severity, news_severity: rs.news_severity, ...(rs.risk_levels ?? {}) } : {})} />
          </div>
          {rs ? (
            <>
              <Bar value={rs.ea_severity}        label="EA"        color="#7c6fa0" />
              <Bar value={rs.scalper_severity}   label="Scalper"   color="#b85c1a" />
              <Bar value={rs.arbitrage_severity} label="Arbitrage" color="#c0392b" />
              <Bar value={rs.rebate_severity}    label="Rebate"    color="#8a6d0a" />
              <Bar value={rs.news_severity}      label="News"      color="#4a7a8a" />
              {rs.risk_levels && (
                <div className="mt-3 pt-2 border-t border-[#3a3a3c] space-y-0.5">
                  <KV label="LOW ≤"    value={rs.risk_levels.low_max?.toFixed(0)} />
                  <KV label="MEDIUM ≤" value={rs.risk_levels.medium_max?.toFixed(0)} />
                  <KV label="HIGH ≤"   value={rs.risk_levels.high_max?.toFixed(0)} />
                  <KV label="CRITICAL" value="> above" />
                </div>
              )}
            </>
          ) : <div className="text-xs text-white/40 text-center py-4">Not loaded</div>}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Pipeline Processing</SectionLabel>
            <EditBtn onClick={() => open('processing', proc ? { ...proc } : {})} />
          </div>
          {proc ? (
            <>
              <KV label="Min Trades Gate" value={String(proc.min_trades_for_classification)} />
              <KV label="Snapshot Interval" value={`${proc.snapshot_interval_sec}s`} />
              <KV label="Classification Window" value={proc.classification_window} />
            </>
          ) : <div className="text-xs text-white/40 text-center py-4">Not loaded</div>}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Auto-Escalation</SectionLabel>
            <EditBtn onClick={() => open('auto_escalation', ae ? { enabled: ae.enabled, risk_score_threshold: ae.risk_score_threshold } : {})} />
          </div>
          {ae ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-white">Status</span>
                <Toggle on={ae.enabled} />
              </div>
              <div className="text-center py-2">
                <div className="text-4xl font-mono font-bold text-white">{ae.risk_score_threshold?.toFixed(0)}</div>
                <div className="text-xs text-white/40 mt-1">risk score auto-escalation trigger</div>
              </div>
            </>
          ) : <div className="text-xs text-white/40 text-center py-4">Not loaded</div>}
        </Card>
      </div>

      {/* Threshold Ladders */}
      <div>
        <SectionLabel>Behaviour Threshold Ladders</SectionLabel>
        <div className="space-y-3">
          {BEHAVIORS.map(beh => {
            const ladder = cfg?.thresholds?.[beh];
            return (
              <Card key={beh}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">{beh}</span>
                  <button
                    onClick={() => {
                      if (!ladder) return;
                      const init: Record<string, any> = {};
                      LEVELS.forEach(lv => {
                        init[`${lv}_confidence_min`]   = ladder[lv]?.confidence_min   ?? 0.6;
                        init[`${lv}_min_duration_sec`] = ladder[lv]?.min_duration_sec ?? 300;
                        init[`${lv}_min_trades`]       = ladder[lv]?.min_trades       ?? 20;
                      });
                      open({ behavior: beh }, init);
                    }}
                    className="text-xs text-white/50 hover:text-white border border-white/20 px-2 py-0.5 rounded transition-colors"
                  >
                    Edit Ladder
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {LEVELS.map(lv => {
                    const lvl = ladder?.[lv];
                    const c = LEVEL_CLR[lv];
                    return (
                      <div key={lv} className="rounded border p-2.5" style={{ borderColor: c + '40', backgroundColor: c + '08' }}>
                        <LevelBadge level={lv} />
                        {lvl ? (
                          <div className="mt-2 space-y-0">
                            <KV label="Confidence" value={`${(lvl.confidence_min * 100).toFixed(0)}%`} />
                            <KV label="Duration"   value={fmtDur(lvl.min_duration_sec)} />
                            <KV label="Min Trades" value={String(lvl.min_trades)} />
                          </div>
                        ) : <div className="text-xs text-white/40 mt-2 text-center">No data</div>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Drawers ── */}

      <Drawer open={dk === 'risk_scoring'} title="Risk Scoring" subtitle="Severity weights 0.10–1.00 · risk band boundaries must ascend" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <SectionLabel>Severity Weights</SectionLabel>
        {[['ea_severity','EA'],['scalper_severity','Scalper'],['arbitrage_severity','Arbitrage'],['rebate_severity','Rebate'],['news_severity','News']].map(([k,l]) => (
          <F key={k} label={l as string} hint="0.10 – 1.00"><Num v={form[k] ?? 0.5} set={v => setForm(f => ({ ...f, [k]: v }))} min={0.1} max={1.0} /></F>
        ))}
        <SectionLabel>Risk Band Boundaries</SectionLabel>
        <F label="LOW Band Max"    hint="Upper bound of LOW band"><Num v={form.low_max    ?? 25} set={v => setForm(f => ({ ...f, low_max: v }))}    min={0} max={100} step={1} /></F>
        <F label="MEDIUM Band Max" hint="Upper bound of MEDIUM band"><Num v={form.medium_max ?? 50} set={v => setForm(f => ({ ...f, medium_max: v }))} min={0} max={100} step={1} /></F>
        <F label="HIGH Band Max"   hint="CRITICAL = above this"><Num v={form.high_max   ?? 75} set={v => setForm(f => ({ ...f, high_max: v }))}   min={0} max={100} step={1} /></F>
      </Drawer>

      <Drawer open={dk === 'processing'} title="Pipeline Processing" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Min Trades for Classification" hint="5 – 500"><Num v={form.min_trades_for_classification ?? 20} set={v => setForm(f => ({ ...f, min_trades_for_classification: v }))} min={5} max={500} step={1} /></F>
        <F label="Snapshot Interval (seconds)"  hint="10 – 300"><Num v={form.snapshot_interval_sec ?? 60}         set={v => setForm(f => ({ ...f, snapshot_interval_sec: v }))}         min={10} max={300} step={10} /></F>
        <F label="Classification Window">
          <Sel v={form.classification_window ?? '1d'} set={v => setForm(f => ({ ...f, classification_window: v }))} opts={[{value:'5m',label:'5m'},{value:'15m',label:'15m'},{value:'1h',label:'1h'},{value:'1d',label:'1d'}]} />
        </F>
      </Drawer>

      <Drawer open={dk === 'auto_escalation'} title="Auto-Escalation" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Enabled"><Sel v={String(form.enabled ?? true)} set={v => setForm(f => ({ ...f, enabled: v === 'true' }))} opts={[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} /></F>
        <F label="Risk Score Threshold" hint="70.0 – 100.0 — escalation fires above this automatically">
          <Num v={form.risk_score_threshold ?? 80} set={v => setForm(f => ({ ...f, risk_score_threshold: v }))} min={70} max={100} step={1} />
        </F>
      </Drawer>

      <Drawer
        open={typeof dk === 'object' && dk !== null && 'behavior' in dk}
        title={`${typeof dk === 'object' && dk !== null && 'behavior' in dk ? (dk as { behavior: string }).behavior : ''} Threshold Ladder`}
        subtitle="confidence_min / min_duration_sec / min_trades must increase at each level"
        onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}
      >
        {LEVELS.map((lv, i) => (
          <div key={lv}>
            <div className="flex items-center gap-2 mb-2"><LevelBadge level={lv} /></div>
            <F label="Confidence Min (0.40–1.00)"><Num v={form[`${lv}_confidence_min`]   ?? 0.6}  set={v => setForm(f => ({ ...f, [`${lv}_confidence_min`]: v }))}   min={0.4} max={1.0} /></F>
            <F label="Min Duration (seconds)" hint="Must be greater than previous level">
              <Num v={form[`${lv}_min_duration_sec`] ?? 60*Math.pow(2,i)} set={v => setForm(f => ({ ...f, [`${lv}_min_duration_sec`]: v }))} min={30} max={86400} step={30} />
            </F>
            <F label="Min Trades" hint="Must be greater than previous level">
              <Num v={form[`${lv}_min_trades`]       ?? 10*Math.pow(2,i)} set={v => setForm(f => ({ ...f, [`${lv}_min_trades`]: v }))}       min={5} max={2000} step={5} />
            </F>
            {lv !== 'ESCALATE' && <hr className="border-[#2a2a2c] my-2" />}
          </div>
        ))}
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// CLUSTERING TAB
// ─────────────────────────────────────────────

function fmtRelTime(iso?: string) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

function ClusteringTab() {
  const qc = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [cfgDrawer, setCfgDrawer] = useState(false);
  const [cfgForm, setCfgForm] = useState<Record<string, any>>({});
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [explainState, setExplainState] = useState<{ loading: number | null; result: any | null }>({ loading: null, result: null });

  // Data — use clusteringApi (correct base URL) for existing methods
  const { data: configRaw }     = useQuery({ queryKey: ['cluster-config'],     queryFn: () => clusteringApi.getConfig() });
  const { data: runsRaw }       = useQuery({ queryKey: ['cluster-runs'],       queryFn: () => clusteringApi.getRuns(15), refetchInterval: 20000 });

  // Config may come back as { config: {...} } or flat — handle both
  const clusterCfg = (configRaw as any)?.config ?? (configRaw as any) ?? null;
  const runs        = (runsRaw     as any)?.runs        ?? [];
  // TODO: Archetype Library — restore when /api/v1/clustering/archetypes is implemented
  // const { data: archetypesRaw } = useQuery({ queryKey: ['cluster-archetypes'], queryFn: () => api.get('/api/v1/clustering/archetypes'), staleTime: 60000 });
  // const archetypes = (archetypesRaw as any)?.archetypes ?? [];
  const archetypes: any[] = []; // placeholder until archetype API is ready

  const activeRunId = selectedRunId ?? runs[0]?.runId ?? null;
  const activeRun   = runs.find((r: any) => r.runId === activeRunId) ?? runs[0] ?? null;

  const { data: profilesRaw, isLoading: loadingProfiles } = useQuery({
    queryKey: ['cluster-profiles', activeRunId],
    queryFn: () => api.get(`/api/v1/clustering/runs/${activeRunId}/profiles`),
    enabled: !!activeRunId,
  });
  const profiles = (profilesRaw as any)?.profiles ?? [];

  // Mutations
  const triggerRun = useMutation({
    mutationFn: () => clusteringApi.triggerRun(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-runs'] }),
  });

  const saveCfg = useMutation({
    mutationFn: () => clusteringApi.updateConfig({ ...cfgForm, updated_by: 'admin' }),
    onSuccess: (d: any) => {
      if (d?.success === false) { setCfgErr('Validation failed'); return; }
      qc.invalidateQueries({ queryKey: ['cluster-config'] });
      setCfgDrawer(false);
    },
    onError: () => setCfgErr('Request failed.'),
  });

  const mapArchetype = useMutation({
    mutationFn: ({ clusterId, archetypeId }: { clusterId: number; archetypeId: number }) =>
      api.put(`/api/v1/clustering/runs/${activeRunId}/clusters/${clusterId}/archetype`, { archetypeId, mappedBy: 'admin' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cluster-profiles', activeRunId] }),
  });

  const explainCluster = async (clusterId: number) => {
    setExplainState({ loading: clusterId, result: null });
    try {
      const r = await api.post(`/api/v1/clustering/runs/${activeRunId}/clusters/${clusterId}/explain`, {});
      setExplainState({ loading: null, result: { clusterId, ...r } });
    } catch {
      setExplainState({ loading: null, result: null });
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar: HDBSCAN config + archetype library */}
      <div className="w-60 shrink-0 border-r border-[#3a3a3c] overflow-y-auto p-4 space-y-5">
        {/* HDBSCAN Config */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>HDBSCAN Config</SectionLabel>
            <button
              onClick={() => { setCfgErr(null); setCfgForm(clusterCfg ? { ...clusterCfg } : {}); setCfgDrawer(true); }}
              className="text-xs text-white/50 border border-white/20 px-1.5 py-0.5 rounded hover:text-white transition-colors"
            >
              Edit
            </button>
          </div>
          {clusterCfg ? (
            <div className="space-y-0.5">
              <KV label="Min Cluster Size"  value={String(clusterCfg.minClusterSize ?? clusterCfg.min_cluster_size)} />
              <KV label="Min Samples"       value={String(clusterCfg.minSamples ?? clusterCfg.min_samples)} />
              <KV label="Distance Metric"   value={clusterCfg.distanceMetric ?? clusterCfg.distance_metric} />
              <KV label="Feature Window"    value={clusterCfg.featureWindow ?? clusterCfg.feature_window} />
              <KV label="Min Trades"        value={String(clusterCfg.minTradesForClustering ?? clusterCfg.min_trades_for_clustering)} />
              <KV label="Auto Run"          value={<Toggle on={!!(clusterCfg.autoRunEnabled ?? clusterCfg.auto_run_enabled)} />} />
              <KV label="High Outlier ≥"   value={(clusterCfg.highOutlierThreshold ?? clusterCfg.high_outlier_threshold)?.toFixed(2)} />
              <KV label="Med Outlier ≥"    value={(clusterCfg.mediumOutlierThreshold ?? clusterCfg.medium_outlier_threshold)?.toFixed(2)} />
            </div>
          ) : <div className="text-xs text-white/40 text-center py-3">Not loaded</div>}
        </div>

        {/* Archetype Library */}
        {/* TODO: Restore rendering when archetype API is implemented.
            Cluster IDs shift between HDBSCAN runs so stable named archetype
            mapping needs its own design. See /api/v1/clustering/archetypes. */}
        <div>
          <SectionLabel>Archetype Library</SectionLabel>
          <div className="mt-2 text-xs text-white/30 text-center py-3 border border-dashed border-[#3a3a3c] rounded">
            Coming soon
          </div>
        </div>
      </div>

      {/* Main: run bar + card list + detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Run bar */}
        <div className="shrink-0 px-4 py-2.5 border-b border-[#3a3a3c] flex items-center gap-3 flex-wrap">
          {runs.length > 0 && (
            <select
              value={activeRunId ?? ''}
              onChange={e => setSelectedRunId(e.target.value)}
              className="text-xs bg-[#252527] border border-[#3a3a3c] rounded px-2.5 py-1.5 text-white focus:border-white/30 focus:outline-none"
            >
              {runs.map((r: any) => (
                <option key={r.runId} value={r.runId}>
                  {r.startedAt ? fmtRelTime(r.startedAt) : 'Run'} · {r.nClusters ?? 0} clusters · {r.universeSize ?? 0} traders
                </option>
              ))}
            </select>
          )}
          {activeRun && (
            <div className="flex items-center gap-3 text-xs text-white/60">
              <span>Noise: <span className="text-white font-mono">{activeRun.nNoisePoints ?? '—'}</span></span>
              <span>High: <span className={clsx('font-mono', (activeRun.nOutliersHigh ?? 0) > 0 ? 'text-red-500' : 'text-white')}>{activeRun.nOutliersHigh ?? '—'}</span></span>
              <span>Med: <span className="font-mono text-white">{activeRun.nOutliersMedium ?? '—'}</span></span>
              {activeRun.executionTimeMs != null && <span>Exec: <span className="text-white font-mono">{activeRun.executionTimeMs}ms</span></span>}
              <span className={clsx('px-1.5 py-0.5 rounded text-xs',
                activeRun.status === 'completed' ? 'bg-green-950/40 text-green-500' : 'bg-amber-950/40 text-amber-500'
              )}>{activeRun.status?.toUpperCase()}</span>
            </div>
          )}
          {/* Footer stats inline */}
          <div className="flex items-center gap-4 text-xs text-white/60 ml-2">
            <span>Established: <span className="text-green-500 font-mono">{profiles.filter((p: any) => p.status === 'ESTABLISHED').length}</span></span>
            <span>Emerging: <span className="text-amber-500 font-mono">{profiles.filter((p: any) => p.status === 'EMERGING').length}</span></span>
            <span>Noise: <span className="font-mono">{profiles.filter((p: any) => p.clusterId === -1).length}</span></span>
            <span>Mapped: <span className="text-green-500 font-mono">{profiles.filter((p: any) => p.mappedArchetypeId).length}</span></span>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => triggerRun.mutate()}
              disabled={triggerRun.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-white/20 text-white/60 hover:bg-white/5 disabled:opacity-50 transition-all font-medium"
            >
              {triggerRun.isPending ? '⟳ Running…' : '▶ Run Clustering'}
            </button>
          </div>
        </div>

        {/* Card list + detail panel */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left: cluster cards */}
          <div className="w-80 shrink-0 border-r border-[#3a3a3c] overflow-y-auto p-3 space-y-2">
            {!activeRunId ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center py-12">
                  <div className="text-sm text-white/50 mb-3">No clustering runs found</div>
                  <button onClick={() => triggerRun.mutate()} className="text-xs px-4 py-2 rounded border border-white/20 text-white/60 hover:bg-white/5 transition-colors">
                    Run first clustering
                  </button>
                </div>
              </div>
            ) : loadingProfiles ? (
              <div className="flex items-center justify-center py-12 text-white/40 text-xs">Loading clusters…</div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-sm text-white/50 mb-1">No clusters formed</div>
                <div className="text-xs text-white/30">Insufficient data — need {5}+ traders with enough trades</div>
              </div>
            ) : (
              profiles.map((cluster: any) => {
                const severity = cluster.riskSeverity ?? cluster.risk_severity ?? 0.5;
                const isSelected = explainState.result?.clusterId === cluster.clusterId;
                const borderColor =
                  cluster.clusterId === -1 ? 'border-white/20' :
                  severity >= 0.8 ? 'border-red-500' :
                  severity >= 0.6 ? 'border-orange-500' :
                  severity >= 0.4 ? 'border-yellow-500' :
                  'border-green-500';
                const bgHover = isSelected ? 'bg-[#2a2a2c]' : 'hover:bg-[#252527]';

                return (
                  <button
                    key={cluster.clusterId}
                    onClick={() => explainCluster(cluster.clusterId)}
                    className={clsx(
                      'w-full p-3 rounded border-l-4 text-left transition-all',
                      borderColor, bgHover,
                      isSelected && 'ring-1 ring-[#4a7a8a]/40'
                    )}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="text-sm font-medium text-white">
                          {cluster.archetypeName ?? cluster.archetype_name ??
                           cluster.labelHint ?? cluster.label_hint ??
                           (cluster.clusterId === -1 ? 'Noise / Outliers' : `Cluster #${cluster.clusterId}`)}
                        </div>
                        <div className="text-xs font-mono text-white/70">
                          {cluster.archetypeCode ?? cluster.archetype_code ?? (cluster.clusterId === -1 ? 'NOISE' : `ID ${cluster.clusterId}`)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-white/50 text-xs shrink-0 ml-2">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                        <span className="font-mono">{cluster.memberCount ?? cluster.member_count ?? 0}</span>
                      </div>
                    </div>

                    {/* Description */}
                    {(cluster.description) && (
                      <p className="text-xs text-white/60 mb-1.5 line-clamp-2">{cluster.description}</p>
                    )}

                    {/* Risk stats */}
                    <div className="flex items-center gap-3 text-xs text-white/50">
                      {cluster.avgRiskScore != null && (
                        <span>Avg Risk: <span className="font-mono text-white">{(cluster.avgRiskScore ?? cluster.avg_risk_score ?? 0).toFixed(0)}</span></span>
                      )}
                      <span>Severity: <span className="font-mono" style={{
                        color: severity >= 0.8 ? '#c0392b' : severity >= 0.6 ? '#b85c1a' : severity >= 0.4 ? '#8a6d0a' : '#2e7d4f'
                      }}>{(severity * 100).toFixed(0)}%</span></span>
                      {(cluster.status) && (
                        <span className={clsx('px-1 py-0.5 rounded text-[9px]',
                          cluster.status === 'ESTABLISHED' ? 'bg-green-950/40 text-green-500' :
                          cluster.status === 'EMERGING' ? 'bg-amber-950/40 text-amber-500' :
                          'bg-zinc-800 text-white/40'
                        )}>{cluster.status}</span>
                      )}
                    </div>

                    {/* Members preview */}
                    {(cluster.members ?? cluster.memberLogins)?.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-[#3a3a3c] text-xs text-white/40">
                        {(cluster.members ?? cluster.memberLogins).slice(0, 5).join(', ')}
                        {(cluster.members ?? cluster.memberLogins).length > 5 && ` +${(cluster.members ?? cluster.memberLogins).length - 5} more`}
                      </div>
                    )}

                    {/* Map to archetype inline */}
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      <select
                        value={cluster.mappedArchetypeId ?? cluster.mapped_archetype_id ?? ''}
                        onChange={e => {
                          const id = parseInt(e.target.value);
                          if (!isNaN(id)) mapArchetype.mutate({ clusterId: cluster.clusterId, archetypeId: id });
                        }}
                        className="w-full text-xs bg-[#1e1e20] border border-[#3a3a3c] rounded px-2 py-1 text-white focus:border-white/30 focus:outline-none"
                      >
                        <option value="">— Map to archetype —</option>
                        {archetypes.map((a: any) => (
                          <option key={a.archetypeId} value={a.archetypeId}>{a.displayName ?? a.display_name}</option>
                        ))}
                      </select>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: detail panel */}
          <div className="flex-1 overflow-y-auto">
            {explainState.result ? (
              <div className="h-full flex flex-col">
                {/* Detail header */}
                <div className="px-5 py-4 border-b border-[#3a3a3c] flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {explainState.result.clusterId === -1 ? 'Noise / Outliers' : `Cluster #${explainState.result.clusterId}`} — Analysis
                    </div>
                    {explainState.result.llm_stats?.model && (
                      <div className="text-xs text-white/60 font-mono mt-0.5">{explainState.result.llm_stats.model}</div>
                    )}
                  </div>
                  <button onClick={() => setExplainState({ loading: null, result: null })} className="text-white/40 hover:text-white transition-colors p-1">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#252527] rounded border border-[#3a3a3c] p-3">
                      <div className="text-xs text-white/50 mb-1">Avg Risk Score</div>
                      <div className="text-2xl font-mono font-bold text-white">{explainState.result.avgRiskScore?.toFixed(0) ?? '—'}</div>
                    </div>
                    <div className="bg-[#252527] rounded border border-[#3a3a3c] p-3">
                      <div className="text-xs text-white/50 mb-1">Risk Severity</div>
                      <div className="text-2xl font-mono font-bold" style={{
                        color: (explainState.result.riskSeverity ?? 0) >= 0.8 ? '#c0392b' :
                               (explainState.result.riskSeverity ?? 0) >= 0.6 ? '#b85c1a' :
                               (explainState.result.riskSeverity ?? 0) >= 0.4 ? '#8a6d0a' : '#2e7d4f'
                      }}>{(((explainState.result.riskSeverity ?? explainState.result.risk_severity) ?? 0) * 100).toFixed(0)}%</div>
                    </div>
                  </div>

                  {/* AI analysis */}
                  {explainState.result.explanation && (
                    <div className="bg-[#252527] rounded border border-[#3a3a3c] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                          <span className="text-white/60">◎</span> AI Analysis
                        </div>
                        {explainState.result.explanation.generated_at && (
                          <span className="text-xs font-mono text-white/40">
                            {new Date(explainState.result.explanation.generated_at).toLocaleTimeString('en-GB')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed mb-3">
                        {explainState.result.explanation.behavior_description ?? explainState.result.explanation.behaviorDescription}
                      </p>
                      {(explainState.result.explanation.risk_indicators ?? explainState.result.explanation.riskIndicators)?.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs text-white/50 mb-1.5">Risk Indicators</div>
                          <ul className="space-y-1">
                            {(explainState.result.explanation.risk_indicators ?? explainState.result.explanation.riskIndicators).map((ind: string, i: number) => (
                              <li key={i} className="text-xs text-white/70 flex items-start gap-1.5">
                                <span className="text-orange-500 shrink-0 mt-0.5">▸</span>{ind}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {explainState.result.explanation.reasoning && (
                        <div className="text-xs text-white/40 italic mb-3">"{explainState.result.explanation.reasoning}"</div>
                      )}
                      {(explainState.result.explanation.suggested_archetype_code ?? explainState.result.explanation.suggestedArchetypeCode) && (
                        <div className="flex items-center justify-between pt-2 border-t border-[#3a3a3c] text-xs">
                          <span className="text-white/50">Suggested: <span className="font-mono text-white">
                            {explainState.result.explanation.suggestedArchetypeCode ?? explainState.result.explanation.suggested_archetype_code}
                          </span></span>
                          {explainState.result.explanation.confidence != null && (
                            <span className="text-white/50">Confidence: <span className="font-mono text-white">
                              {((explainState.result.explanation.confidence ?? 0) * 100).toFixed(0)}%
                            </span></span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Members */}
                  {explainState.result.members?.length > 0 && (
                    <div>
                      <div className="text-xs text-white/50 mb-2">Cluster Members</div>
                      <div className="space-y-1">
                        {explainState.result.members.map((login: number) => (
                          <div key={login} className="flex items-center justify-between px-3 py-1.5 bg-[#252527] rounded border border-[#3a3a3c]">
                            <span className="font-mono text-xs text-white">#{login}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer stats */}
                {explainState.result.llm_stats && (
                  <div className="shrink-0 border-t border-[#3a3a3c] px-5 py-2 flex gap-4 text-xs text-white/50">
                    {explainState.result.llm_stats.latency_ms && <span>Latency: <span className="font-mono text-white">{explainState.result.llm_stats.latency_ms}ms</span></span>}
                    {explainState.result.llm_stats.cost_usd && <span>Cost: <span className="font-mono text-white">${explainState.result.llm_stats.cost_usd.toFixed(4)}</span></span>}
                  </div>
                )}
              </div>
            ) : explainState.loading != null ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-sm text-white/50 mb-2">⟳ Analysing cluster…</div>
                  <div className="text-xs text-white/30">LLM generating explanation</div>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-white/30">
                  <div className="text-sm mb-1">Select a cluster</div>
                  <div className="text-xs">Click a card to analyse</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HDBSCAN Config Drawer */}
      <Drawer open={cfgDrawer} title="HDBSCAN Clustering Config" onClose={() => setCfgDrawer(false)} onSave={() => saveCfg.mutate()} saving={saveCfg.isPending} error={cfgErr}>
        <F label="Min Cluster Size" hint="2–50"><Num v={cfgForm.minClusterSize ?? cfgForm.min_cluster_size ?? 5} set={v => setCfgForm(f => ({ ...f, minClusterSize: v }))} min={2} max={50} step={1} /></F>
        <F label="Min Samples" hint="1–20"><Num v={cfgForm.minSamples ?? cfgForm.min_samples ?? 3} set={v => setCfgForm(f => ({ ...f, minSamples: v }))} min={1} max={20} step={1} /></F>
        <F label="High Outlier Threshold (0.0–1.0)"><Num v={cfgForm.highOutlierThreshold ?? cfgForm.high_outlier_threshold ?? 0.8} set={v => setCfgForm(f => ({ ...f, highOutlierThreshold: v }))} min={0.1} max={1.0} /></F>
        <F label="Medium Outlier Threshold (0.0–1.0)"><Num v={cfgForm.mediumOutlierThreshold ?? cfgForm.medium_outlier_threshold ?? 0.5} set={v => setCfgForm(f => ({ ...f, mediumOutlierThreshold: v }))} min={0.1} max={1.0} /></F>
        <F label="Min Trades for Clustering"><Num v={cfgForm.minTradesForClustering ?? cfgForm.min_trades_for_clustering ?? 10} set={v => setCfgForm(f => ({ ...f, minTradesForClustering: v }))} min={5} max={100} step={1} /></F>
        <F label="Auto Run">
          <Sel v={String(cfgForm.autoRunEnabled ?? cfgForm.auto_run_enabled ?? false)} set={v => setCfgForm(f => ({ ...f, autoRunEnabled: v === 'true' }))} opts={[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} />
        </F>
      </Drawer>

      {/* LLM Explain slide-in */}
      {explainState.result && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setExplainState({ loading: null, result: null })} />
          <div className="w-[420px] h-full bg-[#1e1e20] border-l border-[#3a3a3c] flex flex-col shadow-2xl">
            <div className="flex items-start justify-between px-5 py-4 border-b border-[#3a3a3c]">
              <div>
                <div className="text-sm font-semibold text-white">Cluster {explainState.result.clusterId === -1 ? 'Noise' : `#${explainState.result.clusterId}`} — LLM Analysis</div>
                <div className="text-xs text-white/50 mt-0.5 font-mono">{explainState.result.llm_stats?.model ?? 'Claude'}</div>
              </div>
              <button onClick={() => setExplainState({ loading: null, result: null })} className="text-white/50 hover:text-white p-1 transition-colors">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div>
                <SectionLabel>Behaviour Profile</SectionLabel>
                <p className="text-sm text-zinc-200 leading-relaxed">{explainState.result.explanation?.behavior_description}</p>
              </div>
              {(explainState.result.explanation?.suggestedArchetypeCode ?? explainState.result.explanation?.suggested_archetype_code) && (
                <div className="rounded border border-white/20 bg-[#4a7a8a]/5 p-3">
                  <SectionLabel>Suggested Archetype</SectionLabel>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{explainState.result.explanation.suggestedArchetypeCode ?? explainState.result.explanation.suggested_archetype_code}</span>
                    <span className="ml-auto text-xs font-mono text-white">{((explainState.result.explanation.confidence ?? 0) * 100).toFixed(0)}% confidence</span>
                  </div>
                </div>
              )}
              {explainState.result.explanation?.risk_indicators?.length > 0 && (
                <div>
                  <SectionLabel>Risk Indicators</SectionLabel>
                  <ul className="space-y-1.5">
                    {explainState.result.explanation.risk_indicators.map((ind: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-white"><span className="text-orange-500 shrink-0">▸</span>{ind}</li>
                    ))}
                  </ul>
                </div>
              )}
              {explainState.result.explanation?.reasoning && (
                <div>
                  <SectionLabel>Reasoning</SectionLabel>
                  <p className="text-xs text-white leading-relaxed italic border-l-2 border-[#3a3a3c] pl-3">
                    {explainState.result.explanation.reasoning}
                  </p>
                </div>
              )}
            </div>
            <div className="border-t border-[#3a3a3c] px-5 py-3 flex gap-4 text-xs text-white/50">
              <span>Latency: <span className="font-mono text-white">{explainState.result.llm_stats?.latency_ms}ms</span></span>
              <span>Cost: <span className="font-mono text-white">${explainState.result.llm_stats?.cost_usd?.toFixed(4)}</span></span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// LLM TAB
// ─────────────────────────────────────────────

const RISK_LEVELS = ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const RISK_CLR = { VERY_LOW: '#71717a', LOW: '#4a6fa5', MEDIUM: '#8a6d0a', HIGH: '#b85c1a', CRITICAL: '#c0392b' };

type LLMDrawer = null | 'providers' | 'claude' | 'ollama' | 'api_key' | 'routing' | 'cost_controls' | 'caching';

function LLMTab({ cfg, usage }: { cfg: any; usage: any }) {
  const qc = useQueryClient();
  const [dk, setDk] = useState<LLMDrawer>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null);

  const open = useCallback((kind: LLMDrawer, init: Record<string, any> = {}) => {
    setErr(null); setForm(init); setDk(kind);
  }, []);

  const save = useMutation({
    mutationFn: async () => {
      if (!dk) return;
      if (dk === 'providers')     return api.put('/api/v1/settings/llm/providers', form);
      if (dk === 'claude')        return api.put('/api/v1/settings/llm/providers/claude', form);
      if (dk === 'ollama')        return api.put('/api/v1/settings/llm/providers/ollama', form);
      if (dk === 'api_key')       return api.put('/api/v1/settings/llm/providers/claude/api-key', { api_key: form.api_key });
      if (dk === 'cost_controls') return api.put('/api/v1/settings/llm/cost-controls', form);
      if (dk === 'caching')       return api.put('/api/v1/settings/llm/caching', form);
      if (dk === 'routing') {
        const payload: Record<string, any> = {};
        RISK_LEVELS.forEach(lv => {
          payload[lv] = {
            use_llm:             !!form[`${lv}_use_llm`],
            auto_generate:       !!form[`${lv}_auto_generate`],
            on_demand_available: !!form[`${lv}_on_demand`],
          };
        });
        return api.put('/api/v1/settings/llm/routing', payload);
      }
    },
    onSuccess: (d: any) => {
      if (d?.success === false) { setErr(d.errors?.join(', ') ?? 'Validation error'); return; }
      qc.invalidateQueries({ queryKey: ['all-settings'] });
      qc.invalidateQueries({ queryKey: ['llm-usage'] });
      setDk(null);
    },
    onError: () => setErr('Request failed.'),
  });

  const prov   = cfg?.providers;
  const claude = cfg?.claude;
  const ollama = cfg?.ollama;
  const cc     = cfg?.cost_controls;
  const cache  = cfg?.caching;

  const usagePct   = usage?.daily_usage_pct ?? 0;
  const usageColor = usagePct >= 80 ? '#c0392b' : usagePct >= 50 ? '#b85c1a' : '#2e7d4f';
  const fmtTTL     = (s: number) => s >= 3600 ? `${(s/3600).toFixed(0)}h` : `${Math.floor(s/60)}m`;

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4">
      {/* Usage banner */}
      {usage && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Today's Usage</SectionLabel>
            <div className="flex items-center gap-3">
              <span className={clsx('text-xs px-2 py-0.5 rounded font-mono', claude?.api_key_configured ? 'bg-green-950/40 text-green-500' : 'bg-red-950/30 text-red-500')}>
                {claude?.api_key_configured ? 'API Key ✓' : 'API Key Not Set ✗'}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4 mb-4">
            {[
              { label: 'Cost Today',      value: `$${usage.today_cost_usd?.toFixed(3)}`,          sub: `of $${usage.daily_limit_usd} limit`,  color: usageColor },
              { label: 'API Calls',       value: String(usage.today_call_count),                   sub: 'calls today',                         color: 'white' },
              { label: 'Auto-Gen / hr',   value: String(usage.auto_gen_this_hour),                 sub: `of ${usage.hourly_auto_gen_limit} limit`, color: 'white' },
              { label: 'Cache Hit Rate',  value: `${usage.cache_hit_rate_pct?.toFixed(0)}%`,       sub: `${usage.cache_hits} hits / ${usage.cache_misses} misses`, color: 'white' },
              { label: 'Remaining',       value: `$${usage.daily_limit_remaining_usd?.toFixed(2)}`,sub: 'daily budget left',                   color: usagePct > 80 ? '#c0392b' : '#2e7d4f' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="text-center">
                <div className="text-2xl font-mono font-bold" style={{ color }}>{value}</div>
                <div className="text-xs text-white/50 mt-0.5">{sub}</div>
                <div className="text-xs text-white/40">{label}</div>
              </div>
            ))}
          </div>
          <div className="h-2 bg-[#2a2a2c] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(usagePct, 100)}%`, backgroundColor: usageColor }} />
          </div>
          <div className="text-xs text-white/50 mt-1 text-right">{usagePct.toFixed(1)}% of daily budget used</div>
        </Card>
      )}

      {/* Providers + Claude + Ollama */}
      <div className="grid grid-cols-3 gap-4">
        {/* Provider selection */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Provider Selection</SectionLabel>
            <EditBtn onClick={() => open('providers', { defaultProvider: prov?.default_provider ?? 'claude', fallbackProvider: prov?.fallback_provider ?? 'template' })} />
          </div>
          <KV label="Default"  value={<span className="text-white">{prov?.default_provider?.toUpperCase() ?? '—'}</span>} />
          <KV label="Fallback" value={prov?.fallback_provider?.toUpperCase() ?? '—'} />
        </Card>

        {/* Claude */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><SectionLabel>Claude</SectionLabel>{claude && <Toggle on={claude.enabled} />}</div>
            <div className="flex gap-1">
              <button onClick={() => open('api_key', { api_key: '' })} className="text-xs text-white/50 hover:text-white border border-zinc-700 px-1.5 py-0.5 rounded transition-colors">Key</button>
              <EditBtn onClick={() => open('claude', claude ? { enabled: claude.enabled, model: claude.model, timeout_sec: claude.timeout_sec, max_tokens: claude.max_tokens, temperature: claude.temperature } : {})} />
            </div>
          </div>
          {claude && (
            <>
              <KV label="Model"       value={claude.model} />
              <KV label="Timeout"     value={`${claude.timeout_sec}s`} />
              <KV label="Max Tokens"  value={String(claude.max_tokens)} />
              <KV label="Temperature" value={claude.temperature?.toFixed(1)} />
            </>
          )}
        </Card>

        {/* Ollama */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><SectionLabel>Ollama</SectionLabel>{ollama && <Toggle on={ollama.enabled} />}</div>
            <EditBtn onClick={() => open('ollama', ollama ? { enabled: ollama.enabled, model: ollama.model, timeout_sec: ollama.timeout_sec, max_tokens: ollama.max_tokens, temperature: ollama.temperature } : {})} />
          </div>
          {ollama && (
            <>
              <KV label="Model"      value={ollama.model?.length > 22 ? ollama.model.slice(0,20)+'…' : (ollama.model ?? '—')} />
              <KV label="Timeout"    value={`${ollama.timeout_sec}s`} />
              <KV label="Max Tokens" value={String(ollama.max_tokens)} />
            </>
          )}
        </Card>
      </div>

      {/* Routing Matrix */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel>Risk-Level Routing Matrix</SectionLabel>
          <EditBtn onClick={() => {
            const init: Record<string, any> = {};
            RISK_LEVELS.forEach(lv => {
              const r = cfg?.routing?.[lv];
              init[`${lv}_use_llm`]     = r?.use_llm            ?? false;
              init[`${lv}_auto_generate`]= r?.auto_generate      ?? false;
              init[`${lv}_on_demand`]    = r?.on_demand_available ?? false;
            });
            open('routing', init);
          }} />
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-xs text-white/50 border-b border-[#3a3a3c]">
              <th className="pb-2 text-left font-normal">Risk Level</th>
              <th className="pb-2 text-center font-normal w-24">Use LLM</th>
              <th className="pb-2 text-center font-normal w-28">Auto-Generate</th>
              <th className="pb-2 text-center font-normal w-28">On-Demand</th>
            </tr>
          </thead>
          <tbody>
            {RISK_LEVELS.map(lv => {
              const r = cfg?.routing?.[lv];
              return (
                <tr key={lv} className="border-b border-[#2a2a2c] last:border-0">
                  <td className="py-2 font-mono" style={{ color: RISK_CLR[lv] }}>{lv}</td>
                  {[r?.use_llm, r?.auto_generate, r?.on_demand_available].map((on, i) => (
                    <td key={i} className="py-2 text-center">
                      <span className={on ? 'text-green-500' : 'text-zinc-700'}>{on ? '●' : '○'}</span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Cost Controls + Caching */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Cost Controls</SectionLabel>
            <EditBtn onClick={() => open('cost_controls', cc ? { daily_cost_limit_usd: cc.daily_cost_limit_usd, max_auto_generates_per_hour: cc.max_auto_generates_per_hour } : {})} />
          </div>
          {cc && (
            <>
              <KV label="Daily Cost Limit"         value={`$${cc.daily_cost_limit_usd?.toFixed(2)}`} />
              <KV label="Max Auto-Gen / Hour"       value={String(cc.max_auto_generates_per_hour)} />
            </>
          )}
          <p className="text-xs text-white/40 mt-2">On-demand generation always available even when daily limit is reached. Auto-gen pauses.</p>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2"><SectionLabel>Explanation Cache</SectionLabel>{cache && <Toggle on={cache.enabled} />}</div>
            <EditBtn onClick={() => open('caching', cache ? { enabled: cache.enabled, ttl_seconds: cache.ttl_seconds, max_entries: cache.max_entries } : {})} />
          </div>
          {cache && (
            <>
              <KV label="TTL"         value={fmtTTL(cache.ttl_seconds)} />
              <KV label="Max Entries" value={String(cache.max_entries)} />
            </>
          )}
          {usage && <div className="mt-2 pt-2 border-t border-[#3a3a3c]"><KV label="Cache Hit Rate" value={<span className="text-white">{usage.cache_hit_rate_pct?.toFixed(0)}%</span>} /></div>}
        </Card>
      </div>

      {/* ── Drawers ── */}

      <Drawer open={dk === 'providers'} title="Provider Selection" subtitle="Default and fallback must differ" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Default Provider"><Sel v={form.defaultProvider ?? 'claude'} set={v => setForm(f => ({ ...f, defaultProvider: v }))} opts={[{value:'claude',label:'Claude'},{value:'ollama',label:'Ollama'},{value:'template',label:'Template'}]} /></F>
        <F label="Fallback Provider"><Sel v={form.fallbackProvider ?? 'template'} set={v => setForm(f => ({ ...f, fallbackProvider: v }))} opts={[{value:'claude',label:'Claude'},{value:'ollama',label:'Ollama'},{value:'template',label:'Template'}]} /></F>
      </Drawer>

      <Drawer open={dk === 'claude'} title="Claude Configuration" subtitle="Does not change the API key — use the Key button" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Enabled"><Sel v={String(form.enabled ?? true)} set={v => setForm(f => ({ ...f, enabled: v === 'true' }))} opts={[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} /></F>
        <F label="Model"><Sel v={form.model ?? 'haiku'} set={v => setForm(f => ({ ...f, model: v }))} opts={[{value:'haiku',label:'Haiku (cheapest)'},{value:'sonnet',label:'Sonnet'},{value:'opus',label:'Opus'}]} /></F>
        <F label="Timeout (seconds)" hint="5–120"><Num v={form.timeout_sec ?? 30} set={v => setForm(f => ({ ...f, timeout_sec: v }))} min={5} max={120} step={5} /></F>
        <F label="Max Tokens" hint="256–4096"><Num v={form.max_tokens ?? 1000} set={v => setForm(f => ({ ...f, max_tokens: v }))} min={256} max={4096} step={128} /></F>
        <F label="Temperature" hint="0.0–1.0"><Num v={form.temperature ?? 0.3} set={v => setForm(f => ({ ...f, temperature: v }))} min={0} max={1} step={0.1} /></F>
      </Drawer>

      <Drawer open={dk === 'ollama'} title="Ollama Configuration" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Enabled"><Sel v={String(form.enabled ?? false)} set={v => setForm(f => ({ ...f, enabled: v === 'true' }))} opts={[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} /></F>
        <F label="Model" hint="e.g. llama3.1:8b-instruct-q4_K_M">
          <input type="text" value={form.model ?? ''} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
            className="w-full bg-[#1e1e20] border border-[#3a3a3c] rounded px-3 py-1.5 text-xs text-white font-mono focus:border-white/30 focus:outline-none" />
        </F>
        <F label="Timeout (seconds)" hint="30–600 (Ollama is slow on CPU)"><Num v={form.timeout_sec ?? 120} set={v => setForm(f => ({ ...f, timeout_sec: v }))} min={30} max={600} step={30} /></F>
        <F label="Max Tokens" hint="100–2000"><Num v={form.max_tokens ?? 500} set={v => setForm(f => ({ ...f, max_tokens: v }))} min={100} max={2000} step={100} /></F>
      </Drawer>

      <Drawer open={dk === 'api_key'} title="Claude API Key" subtitle="Write-only · never returned in any GET response" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="API Key" hint="sk-ant-api03-… (20+ characters)">
          <input type="password" value={form.api_key ?? ''} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))}
            placeholder="sk-ant-api03-..."
            className="w-full bg-[#1e1e20] border border-[#3a3a3c] rounded px-3 py-1.5 text-xs text-white font-mono focus:border-white/30 focus:outline-none" />
        </F>
        <p className="text-xs text-white/40">⚠ The existing key will be replaced immediately. This cannot be undone.</p>
      </Drawer>

      <Drawer open={dk === 'routing'} title="Risk-Level Routing Matrix" subtitle="auto_generate forces use_llm + on_demand to true (enforced server-side)" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        {RISK_LEVELS.map((lv, i) => (
          <div key={lv}>
            <span className="text-xs font-semibold" style={{ color: RISK_CLR[lv] }}>{lv}</span>
            <div className="grid grid-cols-3 gap-2 mt-1.5">
              {[['use_llm','Use LLM'],['auto_generate','Auto-Gen'],['on_demand','On-Demand']].map(([k,l]) => (
                <div key={k}>
                  <div className="text-xs text-white/50 mb-1">{l}</div>
                  <Sel v={String(form[`${lv}_${k}`] ?? false)} set={v => setForm(f => ({ ...f, [`${lv}_${k}`]: v === 'true' }))} opts={[{value:'true',label:'ON'},{value:'false',label:'OFF'}]} />
                </div>
              ))}
            </div>
            {i < RISK_LEVELS.length - 1 && <hr className="border-[#2a2a2c] mt-3" />}
          </div>
        ))}
      </Drawer>

      <Drawer open={dk === 'cost_controls'} title="Cost Controls" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Daily Cost Limit (USD)" hint="1.00–500.00 — auto-gen pauses above this, on-demand still works">
          <Num v={form.daily_cost_limit_usd ?? 10} set={v => setForm(f => ({ ...f, daily_cost_limit_usd: v }))} min={1} max={500} step={1} />
        </F>
        <F label="Max Auto-Generates per Hour" hint="10–1000">
          <Num v={form.max_auto_generates_per_hour ?? 100} set={v => setForm(f => ({ ...f, max_auto_generates_per_hour: v }))} min={10} max={1000} step={10} />
        </F>
      </Drawer>

      <Drawer open={dk === 'caching'} title="Explanation Cache" onClose={() => setDk(null)} onSave={() => save.mutate()} saving={save.isPending} error={err}>
        <F label="Enabled"><Sel v={String(form.enabled ?? true)} set={v => setForm(f => ({ ...f, enabled: v === 'true' }))} opts={[{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}]} /></F>
        <F label="TTL (seconds)" hint="300–86400"><Num v={form.ttl_seconds ?? 3600} set={v => setForm(f => ({ ...f, ttl_seconds: v }))} min={300} max={86400} step={300} /></F>
        <F label="Max Entries" hint="100–10000"><Num v={form.max_entries ?? 1000} set={v => setForm(f => ({ ...f, max_entries: v }))} min={100} max={10000} step={100} /></F>
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT PAGE
// ─────────────────────────────────────────────

type TabId = 'classifier' | 'detection' | 'clustering' | 'llm';

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: 'classifier', label: 'Classifier', hint: 'EA · Scalper · Arbitrage · Rebate · News detector weights' },
  { id: 'detection',  label: 'Detection',  hint: 'MONITOR → WARN → RESTRICT → ESCALATE ladders' },
  { id: 'clustering', label: 'Clustering', hint: 'HDBSCAN config · run history · cluster archetype mapping' },
  { id: 'llm',        label: 'LLM',        hint: 'Provider routing · cost controls · caching' },
];


// ─── Response normalisers ──────────────────────────────────────────────────
// The C++ backend returns camelCase JSON. These functions map the actual API
// response shapes to the field names the component reads internally.

function normalizeClassifier(raw: any) {
  if (!raw) return null;
  // Classifier response shape:
  // { classifierConfig: { ea, scalper, arbitrage, rebate, news,
  //   global, decisionEngine, riskSeverity }, anomalyDetector }
  const cc = raw.classifierConfig ?? raw;

  // Global gate
  const g = cc.global ?? {};
  const global = {
    min_trades_for_classification:
      g.minTradesForClassification ?? g.min_trades_for_classification ?? 20,
  };

  // Decision engine — normalize camelCase → snake_case
  const rawDe = cc.decisionEngine ?? cc.decision_engine ?? raw.decisionEngine ?? null;
  const decision_engine = rawDe ? {
    behavior_weight:        rawDe.behaviorWeight       ?? rawDe.behavior_weight       ?? 0.60,
    anomaly_weight:         rawDe.anomalyWeight        ?? rawDe.anomaly_weight        ?? 0.25,
    persistence_weight:     rawDe.persistenceWeight    ?? rawDe.persistence_weight    ?? 0.15,
    anomaly_risk_boost:     rawDe.anomalyRiskBoost     ?? rawDe.anomaly_risk_boost    ?? 1.5,
    min_persistence_sec:    rawDe.minPersistenceSec    ?? rawDe.min_persistence_sec   ?? 300,
    min_persistence_trades: rawDe.minPersistenceTrades ?? rawDe.min_persistence_trades ?? 10,
    monitor_threshold:      rawDe.monitorThreshold     ?? rawDe.monitor_threshold     ?? 30,
    warn_threshold:         rawDe.warnThreshold        ?? rawDe.warn_threshold        ?? 50,
    restrict_threshold:     rawDe.restrictThreshold    ?? rawDe.restrict_threshold    ?? 65,
    escalate_threshold:     rawDe.escalateThreshold    ?? rawDe.escalate_threshold    ?? 80,
    human_review_threshold: rawDe.humanReviewThreshold ?? rawDe.human_review_threshold ?? 90,
  } : null;

  // Risk severity — normalize camelCase severity keys
  const rawRs = cc.riskSeverity ?? cc.risk_severity ?? raw.riskSeverity ?? null;
  const risk_severity = rawRs ? {
    ea:        rawRs.ea        ?? rawRs.eaSeverity        ?? 0.30,
    scalper:   rawRs.scalper   ?? rawRs.scalperSeverity   ?? 0.50,
    arbitrage: rawRs.arbitrage ?? rawRs.arbitrageSeverity ?? 1.00,
    rebate:    rawRs.rebate    ?? rawRs.rebateSeverity    ?? 0.80,
    news:      rawRs.news      ?? rawRs.newsSeverity      ?? 0.40,
  } : null;

  // Anomaly detector
  const rawAd = raw.anomalyDetector ?? raw.anomaly_detector ?? cc.anomalyDetector ?? {};
  const anomaly_detector = {
    contamination: rawAd.contamination ?? 0.05,
    num_trees:     rawAd.numTrees      ?? rawAd.num_trees     ?? 100,
    sample_size:   rawAd.sampleSize    ?? rawAd.sample_size   ?? 256,
    max_depth:     rawAd.maxDepth      ?? rawAd.max_depth     ?? 8,
  };

  // Per-detector configs — API returns camelCase, component renders snake_case
  // Convert each detector config to snake_case so rendering and PUT payloads are consistent
  const snakeKeys = (obj: Record<string, any> | null): Record<string, any> | null =>
    obj ? Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k.replace(/([A-Z])/g, '_$1').toLowerCase(), v])
    ) : null;

  return {
    global,
    decision_engine,
    risk_severity,
    anomaly_detector,
    ea:        snakeKeys(cc.ea        ?? null),
    scalper:   snakeKeys(cc.scalper   ?? null),
    arbitrage: snakeKeys(cc.arbitrage ?? null),
    rebate:    snakeKeys(cc.rebate    ?? null),
    news:      snakeKeys(cc.news      ?? null),
  };
}

function normalizeDetection(raw: any) {
  if (!raw) return null;

  // risk_scoring: normalize severity keys and risk_levels
  const rawRs = raw.riskScoring ?? raw.risk_scoring ?? null;
  const risk_scoring = rawRs ? {
    ea_severity:        rawRs.eaSeverity        ?? rawRs.ea_severity        ?? 0.30,
    scalper_severity:   rawRs.scalperSeverity   ?? rawRs.scalper_severity   ?? 0.50,
    arbitrage_severity: rawRs.arbitrageSeverity ?? rawRs.arbitrage_severity ?? 1.00,
    rebate_severity:    rawRs.rebateSeverity    ?? rawRs.rebate_severity    ?? 0.80,
    news_severity:      rawRs.newsSeverity      ?? rawRs.news_severity      ?? 0.40,
    risk_levels: {
      low_max:    (rawRs.riskLevels ?? rawRs.risk_levels)?.lowMax    ?? (rawRs.riskLevels ?? rawRs.risk_levels)?.low_max    ?? 25,
      medium_max: (rawRs.riskLevels ?? rawRs.risk_levels)?.mediumMax ?? (rawRs.riskLevels ?? rawRs.risk_levels)?.medium_max ?? 50,
      high_max:   (rawRs.riskLevels ?? rawRs.risk_levels)?.highMax   ?? (rawRs.riskLevels ?? rawRs.risk_levels)?.high_max   ?? 75,
    },
  } : null;

  // processing: normalize camelCase
  const rawProc = raw.processing ?? null;
  const processing = rawProc ? {
    classification_window:        rawProc.classificationWindow       ?? rawProc.classification_window       ?? '15m',
    min_trades_for_classification: rawProc.minTradesForClassification ?? rawProc.min_trades_for_classification ?? 5,
    snapshot_interval_sec:        rawProc.snapshotIntervalSec        ?? rawProc.snapshot_interval_sec        ?? 60,
  } : null;

  // auto_escalation
  const rawAe = raw.autoEscalation ?? raw.auto_escalation ?? null;
  const auto_escalation = rawAe ? {
    enabled:              rawAe.enabled             ?? true,
    risk_score_threshold: rawAe.riskScoreThreshold  ?? rawAe.risk_score_threshold ?? 90,
  } : null;

  // thresholds: keys are already uppercase (EA/SCALPER/...) — normalize level fields
  const thresholds: Record<string, any> = {};
  if (raw.thresholds) {
    for (const [beh, levels] of Object.entries(raw.thresholds as Record<string, any>)) {
      thresholds[beh] = {};
      for (const [level, val] of Object.entries(levels as Record<string, any>)) {
        thresholds[beh][level] = {
          confidence_min:   val.confidenceMin  ?? val.confidence_min  ?? 0,
          min_duration_sec: val.minDurationSec ?? val.min_duration_sec ?? 0,
          min_trades:       val.minTrades      ?? val.min_trades      ?? 0,
        };
      }
    }
  }

  return {
    risk_scoring,
    processing,
    auto_escalation,
    thresholds,
    classifier: raw.classifier ?? null,
  };
}

function normalizeLLM(raw: any) {
  if (!raw) return null;
  // Actual response structure from C++ backend (via BFF):
  // {
  //   llm: { defaultProvider, fallbackProvider, enabled,
  //          claude: { enabled, model, maxTokens, timeoutSec, temperature, apiKeyConfigured },
  //          ollama: { enabled, model, maxTokens, timeoutSec, temperature } },
  //   routing: { riskLevelRouting: { CRITICAL/HIGH/...: { useLlm, autoGenerate, onDemandAvailable } } },
  //   costControls: { dailyCostLimitUsd, maxAutoGeneratesPerHour },
  //   caching: { enabled, ttlSeconds, maxEntries }
  // }

  const llmNode = raw.llm ?? raw;  // top-level or nested under "llm"

  // providers
  const providers = {
    default_provider:  llmNode.defaultProvider  ?? llmNode.default_provider  ?? 'claude',
    fallback_provider: llmNode.fallbackProvider ?? llmNode.fallback_provider ?? 'template',
  };

  // claude — api key is stripped by BFF, apiKeyConfigured injected instead
  const cl = llmNode.claude ?? null;
  const claude = cl ? {
    enabled:            cl.enabled            ?? true,
    model:              cl.model              ?? 'haiku',
    timeout_sec:        cl.timeoutSec         ?? cl.timeout_sec         ?? 30,
    max_tokens:         cl.maxTokens          ?? cl.max_tokens          ?? 1000,
    temperature:        cl.temperature        ?? 0.3,
    api_key_configured: cl.apiKeyConfigured   ?? cl.api_key_configured  ?? false,
  } : null;

  // ollama
  const ol = llmNode.ollama ?? null;
  const ollama = ol ? {
    enabled:     ol.enabled     ?? false,
    model:       ol.model       ?? '',
    timeout_sec: ol.timeoutSec  ?? ol.timeout_sec  ?? 120,
    max_tokens:  ol.maxTokens   ?? ol.max_tokens   ?? 500,
    temperature: ol.temperature ?? 0.3,
  } : null;

  // routing — nested under routing.riskLevelRouting
  const rawRouting = raw.routing?.riskLevelRouting ?? raw.routing ?? {};
  const routing: Record<string, any> = {};
  for (const [level, val] of Object.entries(rawRouting as Record<string, any>)) {
    if (typeof val !== 'object' || val === null) continue;
    routing[level] = {
      use_llm:             val.useLlm             ?? val.use_llm             ?? false,
      auto_generate:       val.autoGenerate        ?? val.auto_generate       ?? false,
      on_demand_available: val.onDemandAvailable   ?? val.on_demand_available ?? false,
    };
  }

  // cost_controls
  const rawCc = raw.costControls ?? raw.cost_controls ?? null;
  const cost_controls = rawCc ? {
    daily_cost_limit_usd:        rawCc.dailyCostLimitUsd        ?? rawCc.daily_cost_limit_usd        ?? 10,
    max_auto_generates_per_hour: rawCc.maxAutoGeneratesPerHour  ?? rawCc.max_auto_generates_per_hour ?? 100,
  } : null;

  // caching
  const rawCache = raw.caching ?? null;
  const caching = rawCache ? {
    enabled:     rawCache.enabled    ?? true,
    ttl_seconds: rawCache.ttlSeconds ?? rawCache.ttl_seconds ?? 3600,
    max_entries: rawCache.maxEntries ?? rawCache.max_entries ?? 1000,
  } : null;

  return { providers, claude, ollama, routing, cost_controls, caching };
}

function normalizeUsage(raw: any) {
  if (!raw) return null;
  return {
    today_cost_usd:            raw.todayCostUsd            ?? raw.today_cost_usd            ?? 0,
    daily_limit_usd:           raw.dailyLimitUsd           ?? raw.daily_limit_usd           ?? 10,
    daily_limit_remaining_usd: raw.dailyLimitRemainingUsd  ?? raw.daily_limit_remaining_usd ?? 10,
    daily_usage_pct:           raw.dailyUsagePct           ?? raw.daily_usage_pct           ?? 0,
    today_call_count:          raw.todayCallCount          ?? raw.today_call_count          ?? 0,
    auto_gen_this_hour:        raw.autoGenThisHour         ?? raw.auto_gen_this_hour        ?? 0,
    hourly_auto_gen_limit:     raw.hourlyAutoGenLimit      ?? raw.hourly_auto_gen_limit     ?? 100,
    cache_hits:                raw.cacheHits               ?? raw.cache_hits               ?? 0,
    cache_misses:              raw.cacheMisses             ?? raw.cache_misses             ?? 0,
    cache_hit_rate_pct:        raw.cacheHitRatePct         ?? raw.cache_hit_rate_pct       ?? 0,
    claude_api_key_configured: raw.claudeApiKeyConfigured  ?? raw.claude_api_key_configured ?? false,
  };
}

export function ArchetypePage() {
  const [tab, setTab] = useState<TabId>('classifier');

  // ── Seeded defaults from detection_thresholds.json + classifier_config.json ──────────
  // The Settings API (Phase 8) is not yet implemented in the BFF.
  // These defaults keep the page fully functional until those routes are added.
  // When the API routes exist, the useQuery calls below will override these values.

  const DEFAULT_CLASSIFIER = {
    global: { min_trades_for_classification: 20 },
    decision_engine: {
      behavior_weight: 0.60, anomaly_weight: 0.25, persistence_weight: 0.15,
      anomaly_risk_boost: 1.5, min_persistence_sec: 300, min_persistence_trades: 10,
      monitor_threshold: 30, warn_threshold: 50, restrict_threshold: 65,
      escalate_threshold: 80, human_review_threshold: 90,
    },
    risk_severity: {
      ea: 0.30, scalper: 0.50, arbitrage: 1.00, rebate: 0.80, news: 0.40,
    },
    anomaly_detector: { contamination: 0.05 },
    ea: {
      min_trades: 50, timing_regularity_weight: 0.30, inter_trade_cv_weight: 0.20,
      sl_entropy_weight: 0.20, lot_entropy_weight: 0.15, session_independence_weight: 0.15,
      timing_regularity_threshold: 0.70, inter_trade_cv_threshold: 0.30,
      sl_entropy_threshold: 0.15, lot_entropy_threshold: 0.10,
    },
    scalper: {
      min_trades: 20, holding_time_weight: 0.35, pct_under_30s_weight: 0.25,
      frequency_weight: 0.20, profit_spread_weight: 0.20,
      max_mean_holding_sec: 120.0, pct_under_30s_threshold: 0.50,
      min_trades_per_hour: 10.0, profit_spread_ratio_threshold: 2.0,
    },
    arbitrage: {
      min_trades: 30, win_rate_weight: 0.30, holding_weight: 0.25,
      profit_factor_weight: 0.25, volume_profit_weight: 0.20,
      min_win_rate: 0.85, max_holding_sec: 30.0, min_profit_factor: 5.0,
    },
    rebate: {
      min_trades: 100, volume_weight: 0.40, expectancy_weight: 0.30, frequency_weight: 0.30,
      max_profit_per_volume: 0.10, max_mean_profit: 0.50, min_trades_per_day: 50.0,
    },
    news: {
      min_trades: 10, concentration_weight: 0.50, rollover_weight: 0.25, event_holding_weight: 0.25,
      concentration_threshold: 0.70,
    },
  };

  const DEFAULT_DETECTION = {
    risk_scoring: {
      ea_severity: 0.30, scalper_severity: 0.50, arbitrage_severity: 1.00,
      rebate_severity: 0.80, news_severity: 0.40,
      risk_levels: { low_max: 25.0, medium_max: 50.0, high_max: 75.0 },
    },
    thresholds: {
      EA: {
        MONITOR:  { confidence_min: 0.70, min_duration_sec: 300,  min_trades: 30  },
        WARN:     { confidence_min: 0.80, min_duration_sec: 600,  min_trades: 75  },
        RESTRICT: { confidence_min: 0.85, min_duration_sec: 900,  min_trades: 100 },
        ESCALATE: { confidence_min: 0.95, min_duration_sec: 1800, min_trades: 200 },
      },
      SCALPER: {
        MONITOR:  { confidence_min: 0.65, min_duration_sec: 300,  min_trades: 20  },
        WARN:     { confidence_min: 0.75, min_duration_sec: 450,  min_trades: 40  },
        RESTRICT: { confidence_min: 0.80, min_duration_sec: 600,  min_trades: 50  },
        ESCALATE: { confidence_min: 0.90, min_duration_sec: 1200, min_trades: 100 },
      },
      ARBITRAGE: {
        MONITOR:  { confidence_min: 0.60, min_duration_sec: 120, min_trades: 15 },
        WARN:     { confidence_min: 0.70, min_duration_sec: 180, min_trades: 20 },
        RESTRICT: { confidence_min: 0.85, min_duration_sec: 300, min_trades: 30 },
        ESCALATE: { confidence_min: 0.90, min_duration_sec: 600, min_trades: 50 },
      },
      REBATE: {
        MONITOR:  { confidence_min: 0.60, min_duration_sec: 600,  min_trades: 50  },
        WARN:     { confidence_min: 0.70, min_duration_sec: 900,  min_trades: 75  },
        RESTRICT: { confidence_min: 0.75, min_duration_sec: 1200, min_trades: 100 },
        ESCALATE: { confidence_min: 0.85, min_duration_sec: 1800, min_trades: 200 },
      },
    },
    processing: {
      classification_window: '15m', min_trades_for_classification: 5, snapshot_interval_sec: 60,
    },
    auto_escalation: { enabled: true, risk_score_threshold: 90.0 },
  };

  const DEFAULT_LLM = {
    providers: { default_provider: 'claude', fallback_provider: 'template' },
    claude: { enabled: true, model: 'haiku', timeout_sec: 30, max_tokens: 1000, temperature: 0.3, api_key_configured: false },
    ollama: { enabled: false, model: 'llama3.1:8b-instruct-q4_K_M', timeout_sec: 120, max_tokens: 500 },
    routing: {
      VERY_LOW: { use_llm: false, auto_generate: false, on_demand_available: false },
      LOW:      { use_llm: false, auto_generate: false, on_demand_available: true  },
      MEDIUM:   { use_llm: true,  auto_generate: false, on_demand_available: true  },
      HIGH:     { use_llm: true,  auto_generate: true,  on_demand_available: true  },
      CRITICAL: { use_llm: true,  auto_generate: true,  on_demand_available: true  },
    },
    cost_controls: { daily_cost_limit_usd: 10.0, max_auto_generates_per_hour: 100 },
    caching: { enabled: true, ttl_seconds: 3600, max_entries: 1000 },
  };

  // Try live API — falls back to defaults if route returns an error/404
  const apiOrDefault = async (path: string, fallback: unknown) => {
    try {
      const r = await api.get(path);
      // If BFF returns a 404 error object, use the fallback
      if (r && typeof r === 'object' && 'statusCode' in r) return fallback;
      return r;
    } catch {
      return fallback;
    }
  };

  const { data: classifierRaw } = useQuery({
    queryKey: ['all-settings', 'classifier'],
    queryFn: () => apiOrDefault('/api/v1/settings/classifier', DEFAULT_CLASSIFIER),
    staleTime: 15_000,
  });

  const { data: detectionRaw } = useQuery({
    queryKey: ['all-settings', 'detection'],
    queryFn: () => apiOrDefault('/api/v1/settings/detection', DEFAULT_DETECTION),
    staleTime: 15_000,
  });

  const { data: llmRaw } = useQuery({
    queryKey: ['all-settings', 'llm'],
    queryFn: () => apiOrDefault('/api/v1/settings/llm', DEFAULT_LLM),
    staleTime: 15_000,
  });

  const { data: llmUsage } = useQuery({
    queryKey: ['llm-usage'],
    queryFn: () => apiOrDefault('/api/v1/settings/llm/usage', null),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const isLoading = false;
  const settingsError = null;
  const allSettings = { classifier: classifierRaw, detection: detectionRaw, llm: llmRaw };

  const classifierCfg: any = normalizeClassifier(classifierRaw) ?? DEFAULT_CLASSIFIER;
  const detectionCfg:  any = normalizeDetection(detectionRaw)   ?? DEFAULT_DETECTION;
  const llmCfg:        any = normalizeLLM(llmRaw)               ?? DEFAULT_LLM;
  const llmUsageNorm:  any = normalizeUsage(llmUsage as any);
  const hasPendingRestart = false;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header + tabs */}
      <div className="shrink-0 px-5 pt-4 border-b border-[#3a3a3c]">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">Archetype Intelligence</h1>
            <p className="text-xs text-white/40">Behaviour classifier config · detection thresholds · HDBSCAN clustering · LLM explanation engine</p>
          </div>
          <div className="flex items-center gap-2">
            {settingsError && (
              <div className="text-xs text-red-500 bg-red-950/20 border border-red-900/15 px-3 py-1.5 rounded font-mono">
                ✗ {String(settingsError)}
              </div>
            )}
            {hasPendingRestart && (
              <div className="flex items-center gap-2 text-xs text-amber-500 bg-zinc-800/60 border border-white/10 px-3 py-1.5 rounded">
                ⚠ Restart pending
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-end">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'px-4 py-2 text-sm border-b-2 transition-colors -mb-px',
                tab === t.id
                  ? 'text-white border-white/20'
                  : 'text-white/50 border-transparent hover:text-white',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>



      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {tab === 'classifier' && <ClassifierTab cfg={classifierCfg} />}
        {tab === 'detection'  && <DetectionTab  cfg={detectionCfg}  />}
        {tab === 'clustering' && <ClusteringTab />}
        {tab === 'llm'        && <LLMTab cfg={llmCfg} usage={llmUsageNorm} />}
      </div>
    </div>
  );
}

export default ArchetypePage;