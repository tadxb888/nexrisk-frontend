// ============================================
// Risk Limits — settings sub-page
// Route: /settings/risk-limits — menu: Settings → Risk Limits
//
// The broker's monthly loss limit for the whole book, the level bands and the
// adverse-move settings that Risk Radar measures against
// (Briefs/Taiga Risk Radar - Risk Measure.md). Backend section `risk_limits`,
// docs/NexRisk_Risk_Limits_API.md.
//
//   GET  /api/v1/settings/risk-limits                 config.read
//   PUT  /api/v1/settings/risk-limits/limit           config.write
//   PUT  /api/v1/settings/risk-limits/bands           config.write
//   PUT  /api/v1/settings/risk-limits/adverse-move    config.write
//
// Every PUT returns the whole section, which replaces the page's copy.
// Months are UTC, the same boundary as the month-to-date P&L.
//
// Layout: 40/60 split as the other settings pages
//   Left  — Monthly loss limit (this month, next month) · Bands · Adverse move
//   Right — How the radar uses these · History
// ============================================

import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  riskLimitsApi,
  type RiskLimitsSection,
  type RiskLimitMonth,
  type RiskLimitsSaveResult,
} from '@/services/api';

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026-11" → "November 2026". */
function monthLabel(m: string | undefined | null): string {
  const hit = /^(\d{4})-(\d{2})$/.exec(m ?? '');
  if (!hit) return m || '—';
  const idx = Number(hit[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} ${hit[1]}` : (m as string);
}

function fmtMoney(v: number | null | undefined, currency: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  } catch {
    return `${v.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${currency}`;
  }
}

function fmtStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** Plain number from an input that may carry thousands separators. */
function parseAmount(raw: string): number | null {
  const t = raw.replace(/[,\s_]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Feedback = { tone: 'ok' | 'error'; lines: string[] } | null;

function feedbackOf(r: RiskLimitsSaveResult): Feedback {
  switch (r.kind) {
    case 'ok':        return { tone: 'ok', lines: ['Saved.'] };
    case 'invalid':   return { tone: 'error', lines: r.errors };
    case 'standby':   return { tone: 'error', lines: [r.message] };
    case 'forbidden': return { tone: 'error', lines: [r.message] };
    case 'error':     return { tone: 'error', lines: [r.message] };
  }
}

const C = {
  red:   '#d07070',
  green: '#6aaa78',
  amber: '#c09060',
  teal:  '#49b3b3',
  field: '#232225',
  fieldBorder: '#44454f',
  ink:   '#e8e8ea',
  soft:  '#c8c8cc',
};

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export function RiskLimitsPage() {
  const { user } = useAuth();

  const [section,   setSection]   = useState<RiskLimitsSection | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    riskLimitsApi.get()
      .then((s) => { if (!cancelled) setSection(s); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load risk limits'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  /** A PUT answered with the whole section: it becomes the page's copy. */
  function applied(r: RiskLimitsSaveResult) {
    if (r.kind === 'ok' && r.data) setSection(r.data);
  }

  const currency = section?.currency || 'USD';

  return (
    <div className="h-full p-6 overflow-auto">
      {/* Page header */}
      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">Risk limits</h1>
          <p className="text-text-secondary mt-1 leading-snug" style={{ fontSize: 13, maxWidth: 760 }}>
            The loss the book can take in a month, and the levels Risk Radar colours against.
            Changes apply at once. Months run on UTC, like the month-to-date P&amp;L.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="rounded p-3 mb-4" style={{ background: '#2c1417', color: '#ff6b6b', border: '1px solid #7a2f36' }}>
          <p className="font-medium m-0" style={{ fontSize: 14 }}>Failed to load risk limits</p>
          <p className="mt-1 text-text-secondary m-0" style={{ fontSize: 12 }}>{loadError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[40fr_60fr] gap-3.5 items-start">
        {/* ─── LEFT ─── */}
        <div className="flex flex-col gap-3.5">
          <Panel
            title="Monthly loss limit"
            subtitle="One limit for the whole book: all books, MT5 and cTrader. Only losses use it up; a profitable month adds nothing."
          >
            <LimitRow
              heading="This month"
              entry={section?.limit ?? null}
              currency={currency}
              loading={loading}
              kind="current"
              onSaved={applied}
            />
            <div className="border-t border-border" />
            <LimitRow
              heading="Next month"
              entry={section?.next_month ?? null}
              currency={currency}
              loading={loading}
              kind="next"
              fallback={section?.limit ?? null}
              onSaved={applied}
            />
          </Panel>

          <BandsPanel section={section} loading={loading} onSaved={applied} />
          <AdverseMovePanel section={section} loading={loading} onSaved={applied} />
        </div>

        {/* ─── RIGHT ─── */}
        <div className="flex flex-col gap-3.5">
          <Panel title="How Risk Radar uses these" subtitle="Per instrument, MT5 and cTrader together.">
            <div className="px-5 py-3.5 flex flex-col gap-2 text-text-secondary leading-snug" style={{ fontSize: 13 }}>
              <p className="m-0"><span className="text-text-primary">Net position</span> — B-Book + A-Book + C-Book, broker view.</p>
              <p className="m-0"><span className="text-text-primary">Move loss</span> — the net position moved against the broker by the adverse move of that instrument.</p>
              <p className="m-0"><span className="text-text-primary">Risk</span> — the loss part of unrealised P&amp;L less the move loss.</p>
              <p className="m-0"><span className="text-text-primary">Remaining capacity</span> — this month's limit less the realised loss of the month so far.</p>
              <p className="m-0"><span className="text-text-primary">Level</span> — risk as a share of remaining capacity, against the bands. The book level is the sum of the instrument risks.</p>
              <p className="m-0">An instrument without enough price history has no adverse move and is shown as unrated.</p>
            </div>
          </Panel>

          <Panel title="History" subtitle="Limits of past and current months, newest first.">
            <HistoryTable rows={section?.history ?? []} currency={currency} loading={loading} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly limit row — this month or next month
// ─────────────────────────────────────────────────────────────────────────────

function LimitRow({
  heading, entry, currency, loading, kind, fallback, onSaved,
}: {
  heading:   string;
  entry:     RiskLimitMonth | null;
  currency:  string;
  loading:   boolean;
  kind:      'current' | 'next';
  /** Next month: the limit that is reused when none is set. */
  fallback?: RiskLimitMonth | null;
  onSaved:   (r: RiskLimitsSaveResult) => void;
}) {
  const [draft,    setDraft]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const value = entry?.monthly_loss_limit ?? null;
  useEffect(() => { setDraft(value !== null ? String(value) : ''); }, [value, entry?.month]);

  const parsed = parseAmount(draft);
  const dirty  = parsed !== value && draft.trim() !== '';

  async function save() {
    if (!entry?.month || saving) return;
    if (parsed === null || !(parsed > 0)) {
      setFeedback({ tone: 'error', lines: ['Enter an amount greater than zero.'] });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const r = await riskLimitsApi.setLimit(entry.month, parsed);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <div className="px-5 py-3.5 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-text-primary font-medium" style={{ fontSize: 14 }}>{heading}</span>
          <span className="text-text-secondary" style={{ fontSize: 13 }}>{monthLabel(entry?.month)}</span>
        </div>
        {kind === 'current' && entry?.carried_over && (
          <span className="rounded px-2 py-0.5" style={{ fontSize: 11, color: C.amber, border: `1px solid ${C.amber}66`, background: '#2a2016' }}>
            Carried over
          </span>
        )}
        {kind === 'next' && value === null && !loading && (
          <span className="rounded px-2 py-0.5" style={{ fontSize: 11, color: C.amber, border: `1px solid ${C.amber}66`, background: '#2a2016' }}>
            Not set
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="font-mono text-text-primary" style={{ fontSize: 20 }}>
          {loading ? '…' : fmtMoney(value, currency)}
        </span>
      </div>

      <p className="m-0 text-text-secondary leading-snug" style={{ fontSize: 12 }}>
        {kind === 'current' && (
          value === null
            ? 'No limit has ever been set. Risk Radar cannot measure risk until one is.'
            : entry?.carried_over
              ? `Nobody set a limit for ${monthLabel(entry.month)}; last month's value is in use.`
              : <>Set by <Who v={entry?.set_by} /> on <span className="font-mono">{fmtStamp(entry?.set_at)}</span>.</>
        )}
        {kind === 'next' && (
          value === null
            ? `If none is set, ${monthLabel(fallback?.month)}'s limit of ${fmtMoney(fallback?.monthly_loss_limit ?? null, currency)} is used again. The alerts bar reminds you during the last 5 days of the month.`
            : <>Set by <Who v={entry?.set_by} /> on <span className="font-mono">{fmtStamp(entry?.set_at)}</span>.</>
        )}
      </p>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setFeedback(null); }}
          placeholder={loading ? 'Loading…' : `Amount in ${currency}`}
          disabled={loading || !entry?.month}
          aria-label={`${heading} loss limit`}
          className={clsx('rounded px-3 py-1.5 font-mono w-full text-text-primary border focus:outline-none focus:border-accent', loading && 'opacity-60')}
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, minHeight: 34 }}
        />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
      <FeedbackLines feedback={feedback} />
    </div>
  );
}

function Who({ v }: { v: string | null | undefined }) {
  return <span className="text-text-primary">{v || 'unknown'}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bands
// ─────────────────────────────────────────────────────────────────────────────

function BandsPanel({
  section, loading, onSaved,
}: { section: RiskLimitsSection | null; loading: boolean; onSaved: (r: RiskLimitsSaveResult) => void }) {
  const b = section?.bands;
  const [w, setW] = useState('');
  const [h, setH] = useState('');
  const [c, setC] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!b) return;
    setW(String(b.warning_pct)); setH(String(b.high_pct)); setC(String(b.critical_pct));
  }, [b?.warning_pct, b?.high_pct, b?.critical_pct]);

  const nw = Number(w), nh = Number(h), nc = Number(c);
  const dirty = !!b && (nw !== b.warning_pct || nh !== b.high_pct || nc !== b.critical_pct);

  async function save() {
    if (saving) return;
    if (![nw, nh, nc].every((n) => Number.isFinite(n)) || !(nw > 0 && nw < nh && nh <= nc)) {
      setFeedback({ tone: 'error', lines: ['Bands must satisfy 0 < Warning < High ≤ Critical.'] });
      return;
    }
    setSaving(true);
    setFeedback(null);
    const r = await riskLimitsApi.setBands({ warning_pct: nw, high_pct: nh, critical_pct: nc });
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <Panel title="Levels" subtitle="Share of the remaining capacity at which an instrument, or the book, changes level. Below Warning is Low.">
      <div className="px-5 pt-3.5 pb-1 grid grid-cols-3 gap-3">
        <PctField label="Warning"  value={w} onChange={(v) => { setW(v); setFeedback(null); }} disabled={loading} swatch={C.amber} />
        <PctField label="High"     value={h} onChange={(v) => { setH(v); setFeedback(null); }} disabled={loading} swatch="#d08850" />
        <PctField label="Critical" value={c} onChange={(v) => { setC(v); setFeedback(null); }} disabled={loading} swatch={C.red} />
      </div>
      <div className="px-5 pb-3.5 flex justify-between items-center gap-3">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Adverse move
// ─────────────────────────────────────────────────────────────────────────────

function AdverseMovePanel({
  section, loading, onSaved,
}: { section: RiskLimitsSection | null; loading: boolean; onSaved: (r: RiskLimitsSaveResult) => void }) {
  const a = section?.adverse_move;
  const [pct,  setPct]  = useState('');
  const [days, setDays] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!a) return;
    setPct(String(a.percentile)); setDays(String(a.lookback_days));
  }, [a?.percentile, a?.lookback_days]);

  const np = Number(pct), nd = Number(days);
  const dirty = !!a && (np !== a.percentile || nd !== a.lookback_days);

  async function save() {
    if (saving) return;
    const problems: string[] = [];
    if (!(Number.isFinite(np) && np >= 50 && np <= 99.9)) problems.push('Percentile must be between 50 and 99.9.');
    if (!(Number.isInteger(nd) && nd >= 20 && nd <= 500)) problems.push('Lookback must be a whole number of days between 20 and 500.');
    if (problems.length) { setFeedback({ tone: 'error', lines: problems }); return; }
    setSaving(true);
    setFeedback(null);
    const r = await riskLimitsApi.setAdverseMove(np, nd);
    setSaving(false);
    setFeedback(feedbackOf(r));
    onSaved(r);
  }

  return (
    <Panel
      title="Adverse move"
      subtitle="Per instrument, from its own daily closes: the chosen percentile of the absolute daily moves over the lookback."
    >
      <div className="px-5 pt-3.5 pb-1 grid grid-cols-3 gap-3">
        <NumField label="Percentile"     suffix="th" value={pct}  onChange={(v) => { setPct(v); setFeedback(null); }}  disabled={loading} helper="50 – 99.9" />
        <NumField label="Lookback"       suffix="days" value={days} onChange={(v) => { setDays(v); setFeedback(null); }} disabled={loading} helper="20 – 500 trading days" />
        <div className="flex flex-col gap-1.5">
          <span className="text-text-secondary font-medium" style={{ fontSize: 13 }}>Method</span>
          <span className="font-mono text-text-primary" style={{ fontSize: 13, paddingTop: 7 }}>{a?.method ?? '—'}</span>
        </div>
      </div>
      <p className="px-5 m-0 text-text-secondary leading-snug" style={{ fontSize: 12 }}>
        An instrument with fewer than 20 daily closes has no adverse move yet and shows as unrated on the radar.
      </p>
      <div className="px-5 py-3.5 flex justify-between items-center gap-3">
        <FeedbackLines feedback={feedback} />
        <SaveButton onClick={save} enabled={dirty && !saving && !loading} label={saving ? 'Saving…' : 'Save'} />
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTable({ rows, currency, loading }: { rows: RiskLimitMonth[]; currency: string; loading: boolean }) {
  if (loading) return <p className="px-5 py-5 m-0 text-text-secondary text-center" style={{ fontSize: 12 }}>Loading…</p>;
  if (rows.length === 0) return <p className="px-5 py-5 m-0 text-text-secondary text-center" style={{ fontSize: 12 }}>No limit has been set yet.</p>;
  const th = 'text-left font-medium text-text-secondary px-5 py-2';
  return (
    <table className="w-full" style={{ fontSize: 13, borderCollapse: 'collapse' }}>
      <thead>
        <tr className="border-b border-border" style={{ fontSize: 12 }}>
          <th className={th}>Month</th>
          <th className={clsx(th, 'text-right')}>Limit</th>
          <th className={th}>Set by</th>
          <th className={th}>Set at</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.month} className="border-b border-border last:border-b-0">
            <td className="px-5 py-2 text-text-primary">{monthLabel(r.month)}</td>
            <td className="px-5 py-2 text-right font-mono text-text-primary">{fmtMoney(r.monthly_loss_limit, currency)}</td>
            <td className="px-5 py-2 text-text-primary">
              {r.carried_over ? <span style={{ color: C.amber }}>Carried over</span> : (r.set_by || '—')}
            </td>
            <td className="px-5 py-2 font-mono text-text-primary" style={{ fontSize: 12 }}>
              {r.carried_over ? '—' : fmtStamp(r.set_at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small parts
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

function PctField({
  label, value, onChange, disabled, swatch,
}: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; swatch: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-text-secondary font-medium" style={{ fontSize: 13 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: swatch, display: 'inline-block' }} />
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} level, percent of capacity`}
          className="rounded px-3 py-1.5 font-mono w-full text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 13 }}>%</span>
      </div>
    </div>
  );
}

function NumField({
  label, value, onChange, disabled, suffix, helper,
}: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean; suffix: string; helper: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-text-secondary font-medium" style={{ fontSize: 13 }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text" inputMode="decimal" value={value} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="rounded px-3 py-1.5 font-mono w-full text-text-primary border focus:outline-none focus:border-accent"
          style={{ background: C.field, borderColor: C.fieldBorder, fontSize: 13, minHeight: 34 }}
        />
        <span className="text-text-secondary" style={{ fontSize: 12 }}>{suffix}</span>
      </div>
      <span className="text-text-secondary" style={{ fontSize: 11.5 }}>{helper}</span>
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
        <p key={i} className="m-0" style={{ fontSize: 12, color }}>{l}</p>
      ))}
    </div>
  );
}

export default RiskLimitsPage;
