// ============================================
// Liquidity — settings sub-page
// Route: /settings/liquidity — menu: Settings → Liquidity
//
// What the Risk Radar's Liquidity layer accepts from an LP and what it does
// not: one Warning / High / Critical threshold per metric, and the two gates
// (minimum orders before an LP is judged, oldest usable quote for slippage).
// Backend section `liquidity`, docs/NexRisk_Risk_Radar_Liquidity_API.md §4.
//
//   GET  /api/v1/settings/liquidity              config.read
//   PUT  /api/v1/settings/liquidity/thresholds   config.write  (any metrics, any of the three values)
//   PUT  /api/v1/settings/liquidity/gates        config.write
//
// Every PUT returns the whole section, which replaces the page's copy.
// Changes apply live: the radar shows them in its next figures (within 5 s).
// Shares travel as fractions (0.01 = 1%); the page shows them in percent.
// ============================================

import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  liquidityApi,
  type LiquiditySettings,
  type LiquiditySettingsSaveResult,
  type LiqThresholds,
} from '@/services/api';
import { DIMENSIONS, METRICS, metricDef, type Unit } from '@/pages/riskRadar/liquidityModel';

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

const C = {
  field: '#232225',
  fieldBorder: '#44454f',
  warning: '#ffe01f',
  high: '#ff8a14',
  critical: '#ff3b30',
};

type Feedback = { tone: 'ok' | 'error'; lines: string[] } | null;

function feedbackOf(r: LiquiditySettingsSaveResult): Feedback {
  switch (r.kind) {
    case 'ok':        return { tone: 'ok', lines: ['Saved. The radar shows it within 5 seconds.', ...r.warnings] };
    case 'invalid':   return { tone: 'error', lines: r.errors };
    case 'standby':   return { tone: 'error', lines: [r.message] };
    case 'forbidden': return { tone: 'error', lines: [r.message] };
    case 'error':     return { tone: 'error', lines: [r.message] };
  }
}

/** Stored value → what the field shows (shares in percent). */
function toField(unit: Unit, v: number): string {
  if (unit === 'share') return String(Number((v * 100).toPrecision(10)));
  return String(v);
}

/** What the field holds → stored value, or null when it is not a number. */
function fromField(unit: Unit, text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return unit === 'share' ? Number((n / 100).toPrecision(10)) : n;
}

function unitText(unit: Unit): string {
  switch (unit) {
    case 'share': return '%';
    case 'ms': return 'ms';
    case 'ratio': return '×';
    case 'minutes': return 'min';
    default: return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function LiquiditySettingsPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<LiquiditySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    liquidityApi.settings.get()
      .then((s) => { if (!cancelled) setSection(s); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load the settings'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  function applied(r: LiquiditySettingsSaveResult) {
    if (r.kind === 'ok' && r.data) setSection(r.data);
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">Liquidity</h1>
          <p className="text-text-secondary mt-1 leading-snug" style={{ fontSize: 13, maxWidth: 780 }}>
            What you accept from your LPs and what you do not. The Risk Radar's Liquidity layer levels every LP
            against these thresholds. Changes apply at once.
          </p>
        </div>
        {section?.updated_at && (
          <div className="text-text-secondary shrink-0" style={{ fontSize: 12 }}>
            Last changed {section.updated_at.replace('T', ' ').replace(/\.\d+/, '').replace('Z', ' UTC')}
            {section.updated_by ? ` by ${section.updated_by}` : ''}
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded p-3 mb-4" style={{ background: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
          <p className="font-medium m-0" style={{ fontSize: 14 }}>Failed to load the liquidity settings</p>
          <p className="mt-1 text-text-secondary m-0" style={{ fontSize: 12 }}>{loadError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[62fr_38fr] gap-3.5 items-start">
        <div className="flex flex-col gap-3.5">
          <ThresholdsPanel section={section} loading={loading} onSaved={applied} />
        </div>
        <div className="flex flex-col gap-3.5">
          <GatesPanel section={section} loading={loading} onSaved={applied} />
          <Panel title="How the radar uses these" subtitle="Per LP, real LPs and test LPs apart.">
            <div className="px-5 py-3.5 flex flex-col gap-2 text-text-secondary leading-snug" style={{ fontSize: 13 }}>
              <p className="m-0"><span className="text-text-primary">Level of a measure</span> — where its value falls against the thresholds on the left. Below Warning is acceptable (Low).</p>
              <p className="m-0"><span className="text-text-primary">Level of a dimension</span> — the worst of its measures: Rejecting, Slipping, Slow, Availability.</p>
              <p className="m-0"><span className="text-text-primary">Level of the LP</span> — its worst dimension. Two dimensions at High or worse make it Critical; so does being disconnected in trading hours while it holds open hedges.</p>
              <p className="m-0"><span className="text-text-primary">Ranks and medians</span> — context only, among your real LPs or among your test LPs, never across. If every LP is bad, every LP shows red.</p>
              <p className="m-0"><span className="text-text-primary">Taiga's own time</span> — levelled too, but never counted against an LP.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds
// ─────────────────────────────────────────────────────────────────────────────

type Draft = Record<string, { warning: string; high: string; critical: string }>;
const LEVELS = ['warning', 'high', 'critical'] as const;

function ThresholdsPanel({
  section, loading, onSaved,
}: { section: LiquiditySettings | null; loading: boolean; onSaved: (r: LiquiditySettingsSaveResult) => void }) {
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reset = (s: LiquiditySettings) => {
    const d: Draft = {};
    for (const [key, t] of Object.entries(s.thresholds)) {
      const unit = metricDef(key).unit;
      d[key] = { warning: toField(unit, t.warning), high: toField(unit, t.high), critical: toField(unit, t.critical) };
    }
    setDraft(d);
  };
  useEffect(() => { if (section) reset(section); }, [section]);

  const keys = section ? Object.keys(section.thresholds) : [];
  // Known measures in their dimension order, then anything new the backend adds.
  const groups: Array<{ id: string; label: string; keys: string[] }> = [
    ...DIMENSIONS.map((d) => ({ id: d.id, label: d.label, keys: METRICS.filter((m) => m.dimension === d.id && keys.includes(m.key)).map((m) => m.key) })),
    { id: 'broker_own', label: 'Taiga’s own time', keys: keys.filter((k) => k === 'taiga_latency_p95_ms') },
    { id: 'other', label: 'Other', keys: keys.filter((k) => !METRICS.some((m) => m.key === k)) },
  ].filter((g) => g.keys.length > 0);

  // What changed, and whether it is valid.
  const changed: Record<string, Partial<Pick<LiqThresholds, 'warning' | 'high' | 'critical'>>> = {};
  const problems: string[] = [];
  for (const key of keys) {
    const def = metricDef(key);
    const cur = section!.thresholds[key];
    const d = draft[key];
    if (!d) continue;
    const vals = LEVELS.map((l) => fromField(def.unit, d[l]));
    if (vals.some((v) => v === null)) { problems.push(`${def.label}: every value must be a number.`); continue; }
    const [w, h, c] = vals as number[];
    if (def.unit === 'share' && [w, h, c].some((v) => v < 0 || v > 1)) problems.push(`${def.label}: shares are from 0 to 100%.`);
    if ([w, h, c].some((v) => v < 0)) problems.push(`${def.label}: values cannot be negative.`);
    const lower = cur.worse === 'LOWER';
    if (lower ? !(w > h && h > c) : !(w < h && h < c)) {
      problems.push(`${def.label}: ${lower ? 'Warning must be above High, and High above Critical (lower is worse).' : 'Warning must be below High, and High below Critical.'}`);
    }
    const patch: Partial<Pick<LiqThresholds, 'warning' | 'high' | 'critical'>> = {};
    if (w !== cur.warning) patch.warning = w;
    if (h !== cur.high) patch.high = h;
    if (c !== cur.critical) patch.critical = c;
    if (Object.keys(patch).length) changed[key] = patch;
  }
  const dirty = Object.keys(changed).length > 0;

  function set(key: string, level: typeof LEVELS[number], value: string) {
    setDraft((d) => ({ ...d, [key]: { ...d[key], [level]: value } }));
    setFeedback(null);
  }

  async function save() {
    if (saving) return;
    if (problems.length) { setFeedback({ tone: 'error', lines: problems }); return; }
    setSaving(true);
    setFeedback(null);
    const r = await liquidityApi.settings.setThresholds(changed);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <Panel
      title="Thresholds"
      subtitle="Per measure, the value at which an LP becomes Warning, High and Critical. Below Warning is acceptable. Where lower is worse (volume filled, slippage in your favour, uptime) the thresholds run downwards."
    >
      {loading && <p className="px-5 py-5 m-0 text-text-secondary" style={{ fontSize: 12 }}>Loading…</p>}
      {!loading && groups.length > 0 && (
        <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b border-border text-text-secondary" style={{ fontSize: 12 }}>
              <th className="text-left font-medium px-5 py-2">Measure</th>
              {LEVELS.map((l) => (
                <th key={l} className="text-left font-medium px-2 py-2">
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: C[l], marginRight: 6 }} />
                  {l === 'warning' ? 'Warning' : l === 'high' ? 'High' : 'Critical'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <ThresholdGroup key={g.id} label={g.label} keys={g.keys} section={section!} draft={draft} onChange={set} />
            ))}
          </tbody>
        </table>
      )}
      <div className="px-5 py-3.5 flex justify-between items-center gap-3 border-t border-border">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

function ThresholdGroup({
  label, keys, section, draft, onChange,
}: {
  label: string; keys: string[]; section: LiquiditySettings; draft: Draft;
  onChange: (key: string, level: typeof LEVELS[number], value: string) => void;
}) {
  return (
    <>
      <tr className="border-b border-border">
        <td colSpan={4} className="px-5 pt-3 pb-1.5 text-text-primary font-medium" style={{ fontSize: 13 }}>{label}</td>
      </tr>
      {keys.map((key) => {
        const def = metricDef(key);
        const lower = section.thresholds[key]?.worse === 'LOWER';
        const d = draft[key] ?? { warning: '', high: '', critical: '' };
        return (
          <tr key={key} className="border-b border-border last:border-b-0">
            <td className="px-5 py-2 text-text-primary" title={def.hint}>
              {def.label}
              <div className="text-text-secondary" style={{ fontSize: 11.5 }}>{lower ? 'lower is worse · ' : ''}{def.hint}</div>
            </td>
            {LEVELS.map((l) => (
              <td key={l} className="px-2 py-2 whitespace-nowrap">
                {lower && <span className="text-text-secondary" style={{ fontSize: 11.5, marginRight: 4 }}>under</span>}
                <input
                  type="text" inputMode="decimal" value={d[l]}
                  onChange={(e) => onChange(key, l, e.target.value)}
                  aria-label={`${def.label}, ${l}`}
                  className="rounded px-2 py-1 font-mono text-text-primary border focus:outline-none focus:border-accent"
                  style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, width: 72 }}
                />
                <span className="text-text-secondary" style={{ fontSize: 12, marginLeft: 4 }}>{unitText(def.unit)}</span>
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────

function GatesPanel({
  section, loading, onSaved,
}: { section: LiquiditySettings | null; loading: boolean; onSaved: (r: LiquiditySettingsSaveResult) => void }) {
  const g = section?.gates;
  const [minOrders, setMinOrders] = useState('');
  const [quoteAge, setQuoteAge] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!g) return;
    setMinOrders(String(g.min_orders));
    setQuoteAge(String(g.max_quote_age_sec));
  }, [g?.min_orders, g?.max_quote_age_sec]);

  const mo = Number(minOrders), qa = Number(quoteAge);
  const dirty = !!g && (mo !== g.min_orders || qa !== g.max_quote_age_sec);

  async function save() {
    if (saving || !g) return;
    const problems: string[] = [];
    if (!(Number.isInteger(mo) && mo >= 1 && mo <= 100000)) problems.push('Minimum orders must be a whole number from 1 to 100,000.');
    if (!(Number.isInteger(qa) && qa >= 1 && qa <= 3600)) problems.push('Oldest quote must be a whole number of seconds from 1 to 3,600.');
    if (problems.length) { setFeedback({ tone: 'error', lines: problems }); return; }
    setSaving(true);
    setFeedback(null);
    const patch: { min_orders?: number; max_quote_age_sec?: number } = {};
    if (mo !== g.min_orders) patch.min_orders = mo;
    if (qa !== g.max_quote_age_sec) patch.max_quote_age_sec = qa;
    const r = await liquidityApi.settings.setGates(patch);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  const field = (value: string, set: (v: string) => void, label: string, unit: string, note: ReactNode) => (
    <div className="flex-1 min-w-0">
      <label className="block text-text-primary" style={{ fontSize: 13, marginBottom: 6 }}>{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="text" inputMode="numeric" value={value} disabled={loading}
          onChange={(e) => { set(e.target.value); setFeedback(null); }}
          aria-label={label}
          className="rounded px-3 py-1.5 font-mono text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, width: 100, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 13 }}>{unit}</span>
      </div>
      <p className="m-0 mt-1 text-text-secondary leading-snug" style={{ fontSize: 12 }}>{note}</p>
    </div>
  );

  return (
    <Panel title="Gates" subtitle="When there is enough to judge an LP fairly.">
      <div className="px-5 pt-3.5 pb-1 flex gap-4">
        {field(minOrders, setMinOrders, 'Minimum orders', 'orders',
          'Below this in a period, an LP is shown as “too few orders”: not levelled, not ranked, not in the median.')}
        {field(quoteAge, setQuoteAge, 'Oldest usable quote', 's',
          'Slippage is measured only against a quote at most this old at the moment the order was sent.')}
      </div>
      <div className="px-5 py-3.5 flex justify-between items-center gap-3">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
        <h2 className="font-medium text-text-primary m-0" style={{ fontSize: 16 }}>{title}</h2>
        {subtitle && <p className="text-text-secondary leading-snug m-0 mt-0.5" style={{ fontSize: 12 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SaveButton({ onClick, enabled, label }: { onClick: () => void; enabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      className={clsx(
        'px-3.5 py-1.5 rounded border font-medium transition-colors shrink-0',
        'bg-accent border-accent text-[#0b0c0e]',
        enabled ? 'hover:bg-accent-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
      )}
      style={{ fontSize: 14 }}
    >
      {label}
    </button>
  );
}

function FeedbackLines({ feedback }: { feedback: Feedback }) {
  if (!feedback) return <span />;
  const color = feedback.tone === 'ok' ? '#66e07a' : '#ff6b6b';
  return (
    <div className="flex flex-col gap-0.5">
      {feedback.lines.map((l, i) => (
        <p key={i} className="m-0" style={{ fontSize: 12, color: i > 0 && feedback.tone === 'ok' ? '#ffb020' : color }}>{l}</p>
      ))}
    </div>
  );
}

export default LiquiditySettingsPage;
