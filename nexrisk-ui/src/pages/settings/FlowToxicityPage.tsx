// ============================================
// Flow Toxicity — settings sub-page
// Route: /settings/flow-toxicity — menu: Settings → Flow Toxicity
//
// The window, the toxic classes and the bands of the Risk Radar's Flow
// toxicity layer. Backend section `flow_toxicity`,
// docs/NexRisk_Risk_Radar_Flow_API.md §3.
//
//   GET  /api/v1/settings/flow-toxicity            config.read
//   PUT  /api/v1/settings/flow-toxicity/window     config.write
//   PUT  /api/v1/settings/flow-toxicity/classes    config.write  (replaces the whole set)
//   PUT  /api/v1/settings/flow-toxicity/bands      config.write
//   PUT  /api/v1/settings/flow-toxicity/markout    config.write  (phase 2, API v1.1)
//
// Every PUT returns the whole section, which replaces the page's copy.
// Changes apply live: the radar shows them in its next figures.
// ============================================

import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  flowApi,
  type FlowToxicitySettings,
  type FlowToxicClass,
  type FlowSettingsSaveResult,
} from '@/services/api';
import { classLabel } from '@/pages/riskRadar/flowModel';

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

const C = {
  amber: '#c09060',
  red: '#d07070',
  field: '#232225',
  fieldBorder: '#44454f',
};

type Feedback = { tone: 'ok' | 'error'; lines: string[] } | null;

function feedbackOf(r: FlowSettingsSaveResult): Feedback {
  switch (r.kind) {
    case 'ok':        return { tone: 'ok', lines: ['Saved. The radar shows it within a second or two.', ...r.warnings] };
    case 'invalid':   return { tone: 'error', lines: r.errors };
    case 'standby':   return { tone: 'error', lines: [r.message] };
    case 'forbidden': return { tone: 'error', lines: [r.message] };
    case 'error':     return { tone: 'error', lines: [r.message] };
  }
}

function fmtWindowText(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600} h`;
  return `${Math.round(sec / 60)} min`;
}

// ─────────────────────────────────────────────────────────────────────────────

export function FlowToxicityPage() {
  const { user } = useAuth();
  const [section, setSection] = useState<FlowToxicitySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    flowApi.settings.get()
      .then((s) => { if (!cancelled) setSection(s); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load the settings'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  function applied(r: FlowSettingsSaveResult) {
    if (r.kind === 'ok' && r.data) setSection(r.data);
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">Flow toxicity</h1>
          <p className="text-text-secondary mt-1 leading-snug" style={{ fontSize: 13, maxWidth: 780 }}>
            Which accounts count as toxic on the Risk Radar's Flow toxicity layer, over what window, and at what
            share the colours change. Changes apply at once.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded p-3 mb-4" style={{ background: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
          <p className="font-medium m-0" style={{ fontSize: 14 }}>Failed to load the flow toxicity settings</p>
          <p className="mt-1 text-text-secondary m-0" style={{ fontSize: 12 }}>{loadError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-3.5 items-start">
        <div className="flex flex-col gap-3.5">
          <ClassesPanel section={section} loading={loading} onSaved={applied} />
        </div>
        <div className="flex flex-col gap-3.5">
          <WindowPanel section={section} loading={loading} onSaved={applied} />
          <BandsPanel section={section} loading={loading} onSaved={applied} />
          <MarkoutPanel section={section} loading={loading} onSaved={applied} />
          <Panel title="How the radar uses these" subtitle="Per instrument, both platforms, both books.">
            <div className="px-5 py-3.5 flex flex-col gap-2 text-text-secondary leading-snug" style={{ fontSize: 13 }}>
              <p className="m-0"><span className="text-text-primary">Flow</span> — client deals in the window, in USD notional.</p>
              <p className="m-0"><span className="text-text-primary">Flagged</span> — an account whose latest classification is a toxic class below, with at least that class's confidence and, when set, that risk level.</p>
              <p className="m-0"><span className="text-text-primary">Colour</span> — the share of the instrument's B-Book flow from flagged accounts, against the bands. Toxic flow sent to the A-Book is hedged and does not colour.</p>
              <p className="m-0">Accounts not classified are never flagged; the radar shows their flow apart.</p>
              <p className="m-0"><span className="text-text-primary">Markout</span> — for each fill, the price move the client's way 1, 5 and 30 s later. Positive costs the broker. The radar can colour by the B-Book markout at 5 s instead of the toxic share.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toxic classes
// ─────────────────────────────────────────────────────────────────────────────

interface ClassDraft { on: boolean; conf: string; level: string }

function ClassesPanel({
  section, loading, onSaved,
}: { section: FlowToxicitySettings | null; loading: boolean; onSaved: (r: FlowSettingsSaveResult) => void }) {
  const [draft, setDraft] = useState<Record<string, ClassDraft>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const reset = (s: FlowToxicitySettings) => {
    const d: Record<string, ClassDraft> = {};
    for (const cls of s.classes_available) {
      const t = s.toxic_classes[cls];
      d[cls] = { on: !!t, conf: t ? String(t.min_confidence) : '0.6', level: t?.min_risk_level ?? '' };
    }
    setDraft(d);
  };
  useEffect(() => { if (section) reset(section); }, [section]);

  const classes = section?.classes_available ?? [];
  const levels = section?.risk_levels_available ?? [];

  const built: Record<string, FlowToxicClass> = {};
  const problems: string[] = [];
  for (const cls of classes) {
    const d = draft[cls];
    if (!d?.on) continue;
    const n = Number(d.conf);
    if (!(d.conf.trim() !== '' && Number.isFinite(n) && n >= 0 && n <= 1)) problems.push(`${classLabel(cls)}: confidence must be from 0 to 1.`);
    built[cls] = { min_confidence: n, min_risk_level: d.level || null };
  }
  // Compared key by key in a fixed order: the backend's order is not the page's.
  const canon = (set: Record<string, FlowToxicClass>) => JSON.stringify(
    Object.keys(set).sort().map((k) => [k, set[k].min_confidence, set[k].min_risk_level ?? null]),
  );
  const dirty = !!section && canon(built) !== canon(section.toxic_classes);

  function set(cls: string, patch: Partial<ClassDraft>) {
    setDraft((d) => ({ ...d, [cls]: { ...d[cls], ...patch } }));
    setFeedback(null);
  }

  async function save() {
    if (saving) return;
    if (problems.length) { setFeedback({ tone: 'error', lines: problems }); return; }
    setSaving(true);
    setFeedback(null);
    const r = await flowApi.settings.setClasses(built);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <Panel
      title="Toxic classes"
      subtitle="Tick the classifications whose flow counts as toxic. Each has its own minimum confidence; a minimum risk level adds the profitability test (the risk matrix level)."
    >
      {loading && <p className="px-5 py-5 m-0 text-text-secondary" style={{ fontSize: 12 }}>Loading…</p>}
      {!loading && classes.length > 0 && (
        <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr className="border-b border-border text-text-secondary" style={{ fontSize: 12 }}>
              <th className="text-left font-medium px-5 py-2">Classification</th>
              <th className="text-left font-medium px-2 py-2">Toxic</th>
              <th className="text-left font-medium px-2 py-2">Min confidence</th>
              <th className="text-left font-medium px-5 py-2">Min risk level</th>
            </tr>
          </thead>
          <tbody>
            {classes.map((cls) => {
              const d = draft[cls] ?? { on: false, conf: '0.6', level: '' };
              return (
                <tr key={cls} className="border-b border-border last:border-b-0">
                  <td className="px-5 py-2 text-text-primary">
                    {classLabel(cls)}
                    <span className="font-mono text-text-secondary" style={{ fontSize: 11, marginLeft: 6 }}>{cls}</span>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={d.on}
                      onChange={(e) => set(cls, { on: e.target.checked })}
                      aria-label={`${classLabel(cls)} is toxic`}
                      style={{ width: 16, height: 16, accentColor: C.red }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="text" inputMode="decimal" value={d.conf} disabled={!d.on}
                      onChange={(e) => set(cls, { conf: e.target.value })}
                      aria-label={`${classLabel(cls)} minimum confidence`}
                      className={clsx('rounded px-2 py-1 font-mono text-text-primary border focus:outline-none focus:border-accent', !d.on && 'opacity-40')}
                      style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, width: 80 }}
                    />
                  </td>
                  <td className="px-5 py-2">
                    <select
                      value={d.level} disabled={!d.on}
                      onChange={(e) => set(cls, { level: e.target.value })}
                      aria-label={`${classLabel(cls)} minimum risk level`}
                      className={clsx('rounded px-2 py-1 text-text-primary border focus:outline-none focus:border-accent', !d.on && 'opacity-40')}
                      style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13 }}
                    >
                      <option value="">No minimum</option>
                      {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
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

// ─────────────────────────────────────────────────────────────────────────────
// Window
// ─────────────────────────────────────────────────────────────────────────────

function WindowPanel({
  section, loading, onSaved,
}: { section: FlowToxicitySettings | null; loading: boolean; onSaved: (r: FlowSettingsSaveResult) => void }) {
  const [minutes, setMinutes] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  useEffect(() => { if (section) setMinutes(String(section.window_sec / 60)); }, [section?.window_sec]);

  const minSec = section?.limits?.window_sec_min ?? 300;
  const maxSec = section?.limits?.window_sec_max ?? 86400;
  const n = Number(minutes);
  const sec = Math.round(n * 60);
  const dirty = !!section && minutes.trim() !== '' && sec !== section.window_sec;

  async function save() {
    if (saving) return;
    if (!(Number.isFinite(n) && sec >= minSec && sec <= maxSec)) {
      setFeedback({ tone: 'error', lines: [`The window must be from ${minSec / 60} to ${maxSec / 60} minutes.`] });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const r = await flowApi.settings.setWindow(sec);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <Panel title="Window" subtitle="How far back the radar looks at client deals.">
      <div className="px-5 pt-3.5 pb-1 flex items-center gap-2">
        <input
          type="text" inputMode="numeric" value={minutes} disabled={loading}
          onChange={(e) => { setMinutes(e.target.value); setFeedback(null); }}
          aria-label="Window in minutes"
          className="rounded px-3 py-1.5 font-mono text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, width: 110, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 13 }}>minutes</span>
        {section && <span className="text-text-secondary" style={{ fontSize: 12, marginLeft: 8 }}>now {fmtWindowText(section.window_sec)} · {minSec / 60}–{maxSec / 60} min</span>}
      </div>
      <p className="px-5 m-0 text-text-secondary leading-snug" style={{ fontSize: 12 }}>
        A longer window is rebuilt from the stored deals within seconds.
      </p>
      <div className="px-5 py-3.5 flex justify-between items-center gap-3">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bands
// ─────────────────────────────────────────────────────────────────────────────

function BandsPanel({
  section, loading, onSaved,
}: { section: FlowToxicitySettings | null; loading: boolean; onSaved: (r: FlowSettingsSaveResult) => void }) {
  const b = section?.bands;
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [c, setC] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!b) return;
    setW(String(b.warning_pct)); setH(String(b.high_pct)); setC(String(b.critical_pct));
  }, [b?.warning_pct, b?.high_pct, b?.critical_pct]);

  const nw = Number(w), nh = Number(h), nc = Number(c);
  const dirty = !!b && (nw !== b.warning_pct || nh !== b.high_pct || nc !== b.critical_pct);

  async function save() {
    if (saving) return;
    if (![nw, nh, nc].every((x) => Number.isFinite(x)) || !(nw > 0 && nw < nh && nh <= nc && nc <= 100)) {
      setFeedback({ tone: 'error', lines: ['Levels must satisfy 0 < Warning < High ≤ Critical ≤ 100.'] });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const r = await flowApi.settings.setBands({ warning_pct: nw, high_pct: nh, critical_pct: nc });
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  const field = (label: string, value: string, setter: (v: string) => void, swatch: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-text-secondary font-medium" style={{ fontSize: 13 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: 'inline-block' }} />
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={value} disabled={loading}
          onChange={(e) => { setter(e.target.value); setFeedback(null); }}
          aria-label={`${label} level, percent of B-Book flow`}
          className="rounded px-3 py-1.5 font-mono w-full text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 13 }}>%</span>
      </div>
    </div>
  );

  return (
    <Panel title="Levels" subtitle="Toxic share of an instrument's B-Book flow at which its colour changes. Below Warning is Low.">
      <div className="px-5 pt-3.5 pb-1 grid grid-cols-3 gap-3">
        {field('Warning', w, setW, C.amber)}
        {field('High', h, setH, '#d08850')}
        {field('Critical', c, setC, C.red)}
      </div>
      <div className="px-5 py-3.5 flex justify-between items-center gap-3">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Markout (phase 2)
// ─────────────────────────────────────────────────────────────────────────────

function MarkoutPanel({
  section, loading, onSaved,
}: { section: FlowToxicitySettings | null; loading: boolean; onSaved: (r: FlowSettingsSaveResult) => void }) {
  const mk = section?.markout;
  const lim = section?.limits;
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [c, setC] = useState('');
  const [fills, setFills] = useState('');
  const [age, setAge] = useState('');
  const [days, setDays] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!mk) return;
    setW(String(mk.markout_bands.warning_bps)); setH(String(mk.markout_bands.high_bps)); setC(String(mk.markout_bands.critical_bps));
    setFills(String(mk.min_fills)); setAge(String(mk.max_quote_age_sec)); setDays(String(mk.ctrader_symbol_days));
  }, [mk?.markout_bands.warning_bps, mk?.markout_bands.high_bps, mk?.markout_bands.critical_bps, mk?.min_fills, mk?.max_quote_age_sec, mk?.ctrader_symbol_days]);

  if (!loading && section && !mk) {
    return (
      <Panel title="Markout" subtitle="Price move after each client fill.">
        <p className="px-5 py-4 m-0 text-text-secondary" style={{ fontSize: 12.5 }}>The backend does not offer markout settings.</p>
      </Panel>
    );
  }

  const nw = Number(w), nh = Number(h), nc = Number(c), nf = Number(fills), na = Number(age), nd = Number(days);
  const dirty = !!mk && (nw !== mk.markout_bands.warning_bps || nh !== mk.markout_bands.high_bps || nc !== mk.markout_bands.critical_bps
    || nf !== mk.min_fills || na !== mk.max_quote_age_sec || nd !== mk.ctrader_symbol_days);

  const intIn = (v: number, lo?: number, hi?: number) => Number.isInteger(v) && (lo === undefined || v >= lo) && (hi === undefined || v <= hi);

  async function save() {
    if (saving || !mk) return;
    const problems: string[] = [];
    if (![nw, nh, nc].every((x) => Number.isFinite(x)) || !(nw > 0 && nw < nh && nh <= nc)) problems.push('Levels must satisfy 0 < Warning < High ≤ Critical, in bps.');
    if (!intIn(nf, lim?.min_fills_min, lim?.min_fills_max)) problems.push(`Minimum fills must be a whole number${lim?.min_fills_min !== undefined ? ` from ${lim.min_fills_min} to ${lim.min_fills_max}` : ''}.`);
    if (!intIn(na, lim?.max_quote_age_sec_min, lim?.max_quote_age_sec_max)) problems.push(`Quote age must be a whole number of seconds${lim?.max_quote_age_sec_min !== undefined ? ` from ${lim.max_quote_age_sec_min} to ${lim.max_quote_age_sec_max}` : ''}.`);
    if (!intIn(nd, lim?.ctrader_symbol_days_min, lim?.ctrader_symbol_days_max)) problems.push(`cTrader symbol days must be a whole number${lim?.ctrader_symbol_days_min !== undefined ? ` from ${lim.ctrader_symbol_days_min} to ${lim.ctrader_symbol_days_max}` : ''}.`);
    if (problems.length) { setFeedback({ tone: 'error', lines: problems }); return; }
    setSaving(true);
    setFeedback(null);
    const r = await flowApi.settings.setMarkout({
      markout_bands: { warning_bps: nw, high_bps: nh, critical_bps: nc },
      min_fills: nf, max_quote_age_sec: na, ctrader_symbol_days: nd,
    });
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  const input = (label: string, value: string, setter: (v: string) => void, suffix: string, helper?: string, swatch?: string) => (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-text-secondary font-medium" style={{ fontSize: 13 }}>
        {swatch && <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: 'inline-block' }} />}
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={value} disabled={loading}
          onChange={(e) => { setter(e.target.value); setFeedback(null); }}
          aria-label={label}
          className="rounded px-3 py-1.5 font-mono w-full text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 12 }}>{suffix}</span>
      </div>
      {helper && <span className="text-text-secondary" style={{ fontSize: 11.5 }}>{helper}</span>}
    </div>
  );

  return (
    <Panel
      title="Markout"
      subtitle="How far the price moves the clients' way after their fills. The radar colours by the B-Book markout at 5 s when 'Colour by: Markout' is chosen."
    >
      <div className="px-5 pt-3.5 pb-1 grid grid-cols-3 gap-3">
        {input('Warning', w, setW, 'bps', undefined, C.amber)}
        {input('High', h, setH, 'bps', undefined, '#d08850')}
        {input('Critical', c, setC, 'bps', undefined, C.red)}
      </div>
      <div className="px-5 pt-3 pb-1 grid grid-cols-3 gap-3">
        {input('Minimum fills', fills, setFills, 'fills', 'Below it: "too few fills"')}
        {input('Quote age', age, setAge, 's', 'Oldest quote that still counts')}
        {input('cTrader symbols', days, setDays, 'days', 'Traded this recently: kept priced')}
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

export default FlowToxicityPage;
