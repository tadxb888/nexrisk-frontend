// ============================================
// Alert Thresholds
//
// Tunes what the health monitor alerts on. It does not show health — that is
// the Cockpit and the status bar. Every Telegram alert carries its row code in
// the title, so the codes are the primary key here: shown as a badge on every
// row, matched by the search box, and addressable via ?row=D3 so an alert can
// link straight to the setting behind it.
//
// Three things the payload makes true and the UI has to respect:
//   • Saving writes `file`, not `running`. Nothing changes until the service
//     restarts. Anything pending is amber, using the same palette the Settings
//     hub already uses for the same meaning.
//   • `editable: false` rows are not "locked" — they are edited somewhere else,
//     and `edit_location` / `edit_href` say where. Present them that way.
//   • A row's on/off state is the field named `enabled`, not a row-level flag.
//
// Read-only for anyone below EDIT on `alert_thresholds`. C++ enforces this on
// the write; rendering read-only means a VIEW user never composes a change that
// is going to be refused.
// ============================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  alertThresholdsApi,
  type AlertThresholdsConfig,
  type AlertThresholdsWrite,
  type AlertThresholdsSaveResponse,
  type ConfigField,
  type ConfigRow,
  type ThresholdFieldError,
  type ThresholdValue,
} from '@/services/api';

// ── Palette ──────────────────────────────────────────────────
// Amber mirrors the Settings hub's pending-restart treatment exactly. Same
// meaning — saved but not yet in force — so it should not look different.
const AMBER_BG     = '#2a2016';
const AMBER_BORDER = '#6a4a2f';
const AMBER_TEXT   = '#e09a55';

// ── Group display map ────────────────────────────────────────
// `group` is an opaque key, not a letter: `uptime` is a word and a future row
// could add another. Unknown keys fall back to the raw value.
const GROUP_LABELS: Record<string, string> = {
  A:      'The server',
  B:      'The process',
  C:      'MT5',
  D:      'Prices',
  E:      'Provider link',
  F:      'Execution quality',
  G:      'Infrastructure',
  I:      'The backup server',
  uptime: 'Provider availability',
};

const groupLabel = (g: string) => GROUP_LABELS[g] ?? g;

// Row codes are the prefix of the row key: D3_stale_ticks -> D3
const rowCode = (rowKey: string) => rowKey.split('_')[0].toUpperCase();

// ── Served-caution fallback ──────────────────────────────────
// The master does not emit `caution` yet. This is the one case from the
// catalogue that has actually bitten, kept here until the field ships — at
// which point the served value wins and this can be deleted.
function cautionFor(row: ConfigRow, field: ConfigField, value: ThresholdValue): string | undefined {
  if (field.caution) return field.caution;
  if (
    row.row === 'D3_stale_ticks' &&
    field.key === 'stale_secs' &&
    typeof value === 'number' &&
    !Number.isNaN(value) &&
    value < 60
  ) {
    return 'Below typical provider quiet gaps. 30s produced 658 messages overnight.';
  }
  return undefined;
}

// ── Value helpers ────────────────────────────────────────────

/** What is on disk, falling back to what the service is running. */
function savedValue(field: ConfigField): ThresholdValue {
  return field.file === null || field.file === undefined ? field.running : field.file;
}

/** Saved value differs from the shipped default. */
function isDrifted(field: ConfigField): boolean {
  return savedValue(field) !== field.default;
}

/** Written to file but not yet in force — needs a restart. */
function isPending(field: ConfigField): boolean {
  return field.file !== null && field.file !== undefined && field.file !== field.running;
}

function formatValue(field: ConfigField, v: ThresholdValue): string {
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (typeof v === 'number' && Number.isNaN(v)) return '—';
  return field.unit ? `${v} ${field.unit}` : String(v);
}

const ALERTING_ROW = '__alerting__';
const errKey = (row: string, field: string) => `${row}.${field}`;

// ── Small components ─────────────────────────────────────────

function Switch({
  checked, disabled, onChange, label,
}: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex items-center rounded-full transition-colors shrink-0',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      )}
      style={{
        width: 34,
        height: 18,
        background: checked ? '#2f8f8f' : '#4a4a4f',
      }}
    >
      <span
        className="rounded-full transition-transform"
        style={{
          width: 14, height: 14, background: '#fff',
          transform: `translateX(${checked ? 18 : 2}px)`,
        }}
      />
    </button>
  );
}

function CodeBadge({ code, dim }: { code: string; dim?: boolean }) {
  return (
    <span
      className="font-mono rounded px-1.5 py-0.5 shrink-0"
      style={{
        fontSize: 11,
        background: dim ? '#232326' : '#163a3a',
        color:      dim ? '#8a8a90' : '#49b3b3',
        border:     `1px solid ${dim ? '#3a3a3e' : '#2f8f8f'}`,
      }}
    >
      {code}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════
export function AlertThresholdsPage() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('alert_thresholds', 'EDIT');

  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkRow = searchParams.get('row');

  const [config,    setConfig]    = useState<AlertThresholdsConfig | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Edited values, keyed row -> field. Alerting lives under ALERTING_ROW so a
  // single map covers both and the diff view needs no special case.
  const [edits, setEdits] = useState<Record<string, Record<string, ThresholdValue>>>({});

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [lastApplied, setLastApplied] = useState<AlertThresholdsSaveResponse | null>(null);

  const [query, setQuery]           = useState('');
  const [onlyDrift, setOnlyDrift]   = useState(false);
  const [showDiff, setShowDiff]     = useState(false);
  const [saving, setSaving]         = useState(false);

  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Load ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await alertThresholdsApi.get();
      setConfig(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Deep link: ?row=D3 scrolls to and highlights that row ───
  useEffect(() => {
    if (!deepLinkRow || !config) return;
    const target = config.rows.find(
      r => rowCode(r.row) === deepLinkRow.toUpperCase() || r.row === deepLinkRow,
    );
    if (!target) return;
    const el = rowRefs.current[target.row];
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [deepLinkRow, config]);

  // ── Derived ────────────────────────────────────────────────
  const editableRows = useMemo(
    () => config?.rows.filter(r => r.editable) ?? [],
    [config],
  );

  const driftCount = useMemo(() => {
    if (!config) return 0;
    let n = 0;
    for (const r of editableRows) for (const f of r.fields) if (isDrifted(f)) n++;
    for (const f of Object.values(config.alerting)) if (isDrifted(f)) n++;
    return n;
  }, [config, editableRows]);

  const disabledRows = useMemo(
    () => editableRows.filter(r => {
      const f = r.fields.find(x => x.key === 'enabled');
      return f ? savedValue(f) === false : false;
    }),
    [editableRows],
  );

  const pendingCount = useMemo(() => {
    if (!config) return 0;
    let n = 0;
    for (const r of config.rows) for (const f of r.fields) if (isPending(f)) n++;
    for (const f of Object.values(config.alerting)) if (isPending(f)) n++;
    return n;
  }, [config]);

  /** Changes staged locally, flattened for the diff view. */
  const changes = useMemo(() => {
    if (!config) return [];
    const out: {
      rowKey: string; rowLabel: string; code: string;
      field: ConfigField; from: ThresholdValue; to: ThresholdValue;
    }[] = [];

    for (const [rowKey, fields] of Object.entries(edits)) {
      const isAlerting = rowKey === ALERTING_ROW;
      const row = isAlerting ? undefined : config.rows.find(r => r.row === rowKey);
      for (const [fieldKey, to] of Object.entries(fields)) {
        const field = isAlerting
          ? config.alerting[fieldKey]
          : row?.fields.find(f => f.key === fieldKey);
        if (!field) continue;
        if (typeof to === 'number' && Number.isNaN(to)) continue;
        const from = savedValue(field);
        if (from === to) continue;
        out.push({
          rowKey,
          rowLabel: isAlerting ? 'Alert delivery' : row?.label ?? rowKey,
          code:     isAlerting ? 'ALERTS' : rowCode(rowKey),
          field, from, to,
        });
      }
    }
    return out;
  }, [edits, config]);

  const hasIncomplete = useMemo(
    () => Object.values(edits).some(f =>
      Object.values(f).some(v => typeof v === 'number' && Number.isNaN(v)),
    ),
    [edits],
  );

  // ── Editing ────────────────────────────────────────────────
  const setField = useCallback((rowKey: string, fieldKey: string, value: ThresholdValue) => {
    setEdits(prev => ({ ...prev, [rowKey]: { ...(prev[rowKey] ?? {}), [fieldKey]: value } }));
    setFieldErrors(prev => {
      if (!(errKey(rowKey, fieldKey) in prev)) return prev;
      const next = { ...prev };
      delete next[errKey(rowKey, fieldKey)];
      return next;
    });
  }, []);

  const valueOf = useCallback(
    (rowKey: string, field: ConfigField): ThresholdValue => {
      const staged = edits[rowKey]?.[field.key];
      return staged === undefined ? savedValue(field) : staged;
    },
    [edits],
  );

  const discard = useCallback(() => {
    setEdits({});
    setFieldErrors({});
    setShowDiff(false);
  }, []);

  // ── Save ───────────────────────────────────────────────────
  const save = useCallback(async () => {
    if (!changes.length) return;
    setSaving(true);
    setBanner(null);

    const payload: AlertThresholdsWrite = {};
    for (const c of changes) {
      if (c.rowKey === ALERTING_ROW) {
        payload.alerting = { ...(payload.alerting ?? {}), [c.field.key]: c.to };
      } else {
        payload.rows = {
          ...(payload.rows ?? {}),
          [c.rowKey]: { ...(payload.rows?.[c.rowKey] ?? {}), [c.field.key]: c.to },
        };
      }
    }

    const result = await alertThresholdsApi.save(payload);
    setSaving(false);
    setShowDiff(false);

    if (result.kind === 'ok') {
      setEdits({});
      setFieldErrors({});
      setLastApplied(result.data);
      setBanner(null);
      await load();   // take the server's word for what is now on disk
      return;
    }

    if (result.kind === 'invalid') {
      const map: Record<string, string> = {};
      for (const e of result.errors as ThresholdFieldError[]) {
        map[errKey(e.row, e.field)] = e.message;
      }
      setFieldErrors(map);
      setBanner({
        tone: 'error',
        text: `Nothing was saved — ${result.errors.length} value${result.errors.length === 1 ? '' : 's'} rejected. See the messages below.`,
      });
      return;
    }

    if (result.kind === 'forbidden') {
      setBanner({ tone: 'error', text: result.message });
      return;
    }

    setBanner({ tone: 'error', text: result.message });
  }, [changes, load]);

  // ── Filtering ──────────────────────────────────────────────
  const matches = useCallback((row: ConfigRow) => {
    if (onlyDrift && !row.fields.some(isDrifted)) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      rowCode(row.row).toLowerCase().includes(q) ||
      row.row.toLowerCase().includes(q) ||
      row.label.toLowerCase().includes(q) ||
      (row.description ?? '').toLowerCase().includes(q) ||
      row.fields.some(f => f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q))
    );
  }, [query, onlyDrift]);

  // ── Sections ───────────────────────────────────────────────
  const sections = useMemo(() => {
    const rows = config?.rows ?? [];
    const visible = rows.filter(matches);
    return {
      platform: visible.filter(r => r.editable),
      provider: visible.filter(r => !r.editable && r.source === 'db'),
      external: visible.filter(r => !r.editable && r.source === 'witness'),
      inactive: visible.filter(r => !r.editable && r.source === 'config'),
    };
  }, [config, matches]);

  const platformByGroup = useMemo(() => {
    const map = new Map<string, ConfigRow[]>();
    for (const r of sections.platform) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return Array.from(map.entries());
  }, [sections.platform]);

  // ══════════════════════════════════════════════════════════
  // Field renderer
  // ══════════════════════════════════════════════════════════
  const renderField = (rowKey: string, row: ConfigRow | null, field: ConfigField) => {
    const v         = valueOf(rowKey, field);
    const err       = fieldErrors[errKey(rowKey, field.key)];
    const pending   = isPending(field);
    const drifted   = isDrifted(field);
    const editable  = canEdit && !field.readonly && (row?.editable ?? true);
    const caution   = row ? cautionFor(row, field, v) : undefined;
    const changed   = v !== savedValue(field);

    return (
      <div key={field.key} className="py-2">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-text-secondary" style={{ minWidth: 190 }}>
            {field.label}
          </label>

          {/* Control */}
          {field.type === 'boolean' ? (
            <Switch
              checked={v === true}
              disabled={!editable}
              label={field.label}
              onChange={next => setField(rowKey, field.key, next)}
            />
          ) : field.options ? (
            <select
              value={String(v)}
              disabled={!editable}
              onChange={e => setField(rowKey, field.key, e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary disabled:opacity-60"
            >
              {field.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : field.type === 'string' ? (
            <input
              type="text"
              value={String(v)}
              disabled={!editable}
              onChange={e => setField(rowKey, field.key, e.target.value)}
              className="bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary font-mono disabled:opacity-60"
              style={{ width: 160 }}
            />
          ) : (
            <input
              type="number"
              // step comes from `type`, never from min/max: doubles legitimately
              // carry float bounds and integers carry integer bounds, and A3
              // has one of each in the same row.
              step={field.type === 'integer' ? 1 : 'any'}
              min={field.min}
              max={field.max}
              value={typeof v === 'number' && Number.isNaN(v) ? '' : String(v)}
              disabled={!editable}
              onChange={e => setField(
                rowKey, field.key,
                e.target.value === '' ? Number.NaN : Number(e.target.value),
              )}
              className={clsx(
                'bg-surface border rounded px-2 py-1 text-sm text-text-primary font-mono text-right disabled:opacity-60',
                err ? 'border-risk-high' : 'border-border',
              )}
              style={{ width: 120 }}
            />
          )}

          {field.unit ? <span className="text-xs text-text-muted">{field.unit}</span> : null}

          <span className="text-xs text-text-muted font-mono">
            Default {formatValue(field, field.default)}
          </span>

          {drifted && !changed ? (
            <span className="text-[10px] uppercase tracking-wider" style={{ color: '#8a8a90' }}>
              non-default
            </span>
          ) : null}

          {changed ? (
            <span className="text-[10px] uppercase tracking-wider text-accent">unsaved</span>
          ) : null}

          {pending ? (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
              style={{ background: AMBER_BG, color: AMBER_TEXT, border: `1px solid ${AMBER_BORDER}` }}
            >
              <span className="rounded-full" style={{ width: 5, height: 5, background: AMBER_TEXT }} />
              pending restart
            </span>
          ) : null}
        </div>

        {field.help ? (
          <p className="text-xs text-text-muted mt-1" style={{ marginLeft: 190 }}>{field.help}</p>
        ) : null}

        {caution ? (
          <p className="text-xs mt-1" style={{ marginLeft: 190, color: AMBER_TEXT }}>
            ⚠ {caution}
          </p>
        ) : null}

        {err ? (
          <p className="text-xs text-risk-high mt-1" style={{ marginLeft: 190 }}>{err}</p>
        ) : null}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // Row card
  // ══════════════════════════════════════════════════════════
  const renderRow = (row: ConfigRow) => {
    const enabledField = row.fields.find(f => f.key === 'enabled');
    const others       = row.fields.filter(f => f.key !== 'enabled');
    const isOff        = enabledField ? valueOf(row.row, enabledField) === false : false;
    const highlighted  = deepLinkRow
      && (rowCode(row.row) === deepLinkRow.toUpperCase() || row.row === deepLinkRow);

    return (
      <div
        key={row.row}
        ref={el => { rowRefs.current[row.row] = el; }}
        className="panel p-4 scroll-mt-6"
        style={highlighted ? { boxShadow: '0 0 0 2px #49b3b3' } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <CodeBadge code={rowCode(row.row)} dim={!row.editable} />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-text-primary leading-tight">{row.label}</h3>
              {row.description ? (
                <p className="text-xs text-text-muted mt-0.5 leading-snug">{row.description}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Class {row.tunable_class}
            </span>
            {row.editable && enabledField ? (
              <Switch
                checked={valueOf(row.row, enabledField) === true}
                disabled={!canEdit || !row.supports_enable_toggle}
                label={`${row.label} enabled`}
                onChange={next => setField(row.row, 'enabled', next)}
              />
            ) : null}
          </div>
        </div>

        {/* An off row never alerts. Nothing else on the page would say so. */}
        {isOff ? (
          <p className="text-xs mt-2 text-risk-high">
            Disabled — this row will not alert.
          </p>
        ) : null}

        {row.editable ? (
          <div className="mt-2 divide-y divide-border-muted">
            {others.map(f => renderField(row.row, row, f))}
          </div>
        ) : (
          <div className="mt-3">
            {/* Not a w-full table: auto layout distributes the spare width
                between two columns, so the value column started in a
                different place on every card. Same 190px label gutter as the
                editable rows, so read-only values line up with the inputs
                above them. */}
            <div className="space-y-1">
              {row.fields.map(f => (
                <div key={f.key} className="flex items-baseline gap-3">
                  <span className="text-xs text-text-muted shrink-0" style={{ minWidth: 190 }}>
                    {f.label}
                  </span>
                  <span className="text-xs font-mono text-text-secondary">
                    {formatValue(f, savedValue(f))}
                  </span>
                </div>
              ))}
            </div>
            {row.edit_location ? (
              <p className="text-xs text-text-muted mt-2">
                {row.edit_href ? (
                  <>
                    Edited in{' '}
                    <Link to={row.edit_href} className="text-accent hover:underline">
                      {row.edit_location}
                    </Link>
                  </>
                ) : (
                  row.edit_location
                )}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════
  if (loading) {
    return <div className="h-full p-6 text-sm text-text-muted">Loading thresholds…</div>;
  }

  if (loadError || !config) {
    return (
      <div className="h-full p-6">
        <div className="panel p-4">
          <p className="text-sm text-risk-high">Could not load alert thresholds.</p>
          <p className="text-xs text-text-muted mt-1">{loadError}</p>
          <button className="btn btn-primary mt-3" onClick={() => void load()}>Retry</button>
        </div>
      </div>
    );
  }

  const tunableCount = editableRows.length;
  const isStandby    = config.node.role === 'standby';

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-6">

        {/* Header */}
        <div className="flex justify-between items-end mb-4 pb-3 border-b border-border">
          <div>
            <h1 className="text-2xl font-medium text-text-primary tracking-tight">
              Alert Thresholds
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              What the health monitor alerts on — {config.rows.length} rows, {tunableCount} tunable here
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-text-muted font-mono">{config.config_path}</span>
            <div className="text-xs text-text-muted mt-0.5">
              node{' '}
              <span
                className="font-mono"
                style={isStandby
                  ? { color: AMBER_TEXT, fontWeight: 500 }
                  : { color: 'var(--text-secondary, #d2d6e2)' }}
              >
                {config.node.role}
              </span>
            </div>
          </div>
        </div>

        {/* Master and Standby each hold their own copy of this file and each
            answer this endpoint independently — a change saved here is not a
            change on the other node. Editing the backup is rarely intended,
            so it gets the first banner on the page. */}
        {isStandby ? (
          <div
            className="rounded p-3 mb-4"
            style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}` }}
          >
            <p className="font-medium m-0 text-sm" style={{ color: AMBER_TEXT }}>
              You are editing the Standby server
            </p>
            <p className="text-text-secondary mt-1 mb-0 text-[13px] leading-snug">
              The Master keeps its own copy of this file. Saving here changes the
              backup server only — the two will then disagree, which is what row
              I5 alerts on.
            </p>
          </div>
        ) : null}

        {/* Config file problems come before anything else — if the file is
            missing or unparseable, every value below is a compiled default. */}
        {!config.config_present || !config.config_parseable ? (
          <div className="rounded p-3 mb-4 bg-risk-high-bg border border-risk-high-border">
            <p className="text-sm text-risk-high">
              {!config.config_present
                ? 'No config file on this node — every value below is a compiled default.'
                : 'Config file could not be parsed — the service is running on compiled defaults.'}
            </p>
          </div>
        ) : null}

        {/* Restart banner */}
        {config.restart_required ? (
          <div
            className="rounded p-3 mb-4 flex gap-3 items-start"
            style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}` }}
          >
            <div className="text-sm flex-1">
              <p className="font-medium m-0" style={{ color: AMBER_TEXT }}>
                Restart required — {pendingCount} field{pendingCount === 1 ? '' : 's'} saved but not in force
              </p>
              <p className="text-text-secondary mt-1 mb-0 text-[13px] leading-snug">
                The service is still enforcing its previous values. Pending fields are marked below.
              </p>
            </div>
          </div>
        ) : null}

        {/* Save result */}
        {lastApplied ? (
          <div className="rounded p-3 mb-4 bg-surface border border-border">
            <p className="text-sm text-text-primary m-0">{lastApplied.message}</p>
            {Object.keys(lastApplied.applied).length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {Object.entries(lastApplied.applied).flatMap(([rk, fields]) =>
                  Object.entries(fields).map(([fk, ch]) => (
                    <li key={`${rk}.${fk}`} className="text-xs font-mono text-text-secondary">
                      {rowCode(rk)} {fk}: {String(ch.from)} → {String(ch.to)}
                    </li>
                  )),
                )}
              </ul>
            ) : null}
            <button
              className="text-xs text-text-muted hover:text-text-primary mt-2"
              onClick={() => setLastApplied(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {/* Error banner */}
        {banner ? (
          <div className="rounded p-3 mb-4 bg-risk-high-bg border border-risk-high-border">
            <p className="text-sm text-risk-high m-0">{banner.text}</p>
          </div>
        ) : null}

        {/* Read-only notice */}
        {!canEdit ? (
          <div className="rounded p-3 mb-4 bg-surface border border-border">
            <p className="text-sm text-text-secondary m-0">
              You have view access to these settings. Changing them needs EDIT on alert thresholds.
            </p>
          </div>
        ) : null}

        {/* Counts + search */}
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search code, name or field — try D3"
            className="bg-surface border border-border rounded px-2 py-1 text-sm text-text-primary"
            style={{ width: 280 }}
          />

          <button
            type="button"
            onClick={() => setOnlyDrift(v => !v)}
            className={clsx(
              'text-xs rounded px-2 py-1 border transition-colors',
              onlyDrift
                ? 'border-accent-muted text-accent bg-accent-subtle'
                : 'border-border text-text-secondary hover:text-text-primary',
            )}
          >
            {driftCount} field{driftCount === 1 ? '' : 's'} differ from defaults
            {onlyDrift ? ' — showing only these' : ''}
          </button>

          {disabledRows.length > 0 ? (
            <span className="text-xs rounded px-2 py-1 bg-risk-high-bg border border-risk-high-border text-risk-high">
              {disabledRows.length} row{disabledRows.length === 1 ? '' : 's'} disabled —{' '}
              {disabledRows.map(r => rowCode(r.row)).join(', ')} will never alert
            </span>
          ) : null}
        </div>

        {/* ── 1. Platform limits ── */}
        {platformByGroup.map(([group, rows]) => (
          <section key={group} className="mb-5">
            <h2 className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              {groupLabel(group)}
            </h2>
            <div className="space-y-3">{rows.map(renderRow)}</div>
          </section>
        ))}

        {/* ── Alert delivery ── */}
        {Object.keys(config.alerting).length > 0 && !onlyDrift && !query ? (
          <section className="mb-5">
            <h2 className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
              Alert delivery
            </h2>
            <div className="panel p-4 divide-y divide-border-muted">
              {Object.values(config.alerting).map(f => renderField(ALERTING_ROW, null, f))}
            </div>
          </section>
        ) : null}

        {/* ── 2. Per-provider limits ── */}
        {sections.provider.length > 0 ? (
          <section className="mb-5">
            <h2 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Per-provider limits
            </h2>
            <p className="text-xs text-text-muted mb-2">
              Set per liquidity provider, not here.
            </p>
            <div className="space-y-3">{sections.provider.map(renderRow)}</div>
          </section>
        ) : null}

        {/* ── 3. External monitoring ── */}
        {sections.external.length > 0 ? (
          <section className="mb-5">
            <h2 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              External monitoring
            </h2>
            <p className="text-xs text-text-muted mb-2">
              Runs on the Taiga Witness host by design — it has to survive this
              server being the thing that failed. Changes are a request to Taiga.
            </p>
            <div className="space-y-3">{sections.external.map(renderRow)}</div>
          </section>
        ) : null}

        {/* ── 4. Not in service ── */}
        {sections.inactive.length > 0 ? (
          <section className="mb-5">
            <h2 className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
              Not in service
            </h2>
            <p className="text-xs text-text-muted mb-2">
              Listed so a row code from an older alert or document still resolves here.
            </p>
            <div className="space-y-3">{sections.inactive.map(renderRow)}</div>
          </section>
        ) : null}

        {sections.platform.length === 0 &&
         sections.provider.length === 0 &&
         sections.external.length === 0 &&
         sections.inactive.length === 0 ? (
          <p className="text-sm text-text-muted">No rows match “{query}”.</p>
        ) : null}
      </div>

      {/* ── Save bar ── */}
      {canEdit && changes.length > 0 ? (
        <div
          className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-t border-border"
          style={{ background: '#1b1a1d' }}
        >
          <span className="text-sm text-text-secondary">
            {changes.length} change{changes.length === 1 ? '' : 's'} staged
            {hasIncomplete ? ' — some fields are empty' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="text-sm text-text-muted hover:text-text-primary px-3 py-1"
              onClick={discard}
            >
              Discard
            </button>
            <button
              className="btn btn-primary"
              disabled={hasIncomplete || saving}
              onClick={() => setShowDiff(true)}
            >
              Review &amp; save
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Diff modal ── */}
      {showDiff ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowDiff(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm threshold changes"
        >
          <div
            className="panel max-w-xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-text-primary mb-1">
              {changes.length} change{changes.length === 1 ? '' : 's'}
            </h2>
            <p className="text-sm text-text-secondary mb-4">
              Saved to file. The service keeps enforcing its current values until it restarts.
            </p>

            <table className="w-full text-sm">
              <tbody>
                {changes.map(c => (
                  <tr key={`${c.rowKey}.${c.field.key}`} className="border-b border-border-muted">
                    <td className="py-2 pr-3 align-top" style={{ width: 62 }}>
                      <CodeBadge code={c.code} />
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <div className="text-text-primary">{c.field.label}</div>
                      <div className="text-xs text-text-muted">{c.rowLabel}</div>
                    </td>
                    <td className="py-2 text-right align-top font-mono whitespace-nowrap">
                      <span className="text-text-muted">{formatValue(c.field, c.from)}</span>
                      <span className="text-text-muted mx-2">→</span>
                      <span className="text-accent">{formatValue(c.field, c.to)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end gap-2 mt-5">
              <button
                className="text-sm text-text-muted hover:text-text-primary px-3 py-1"
                onClick={() => setShowDiff(false)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving…' : `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AlertThresholdsPage;