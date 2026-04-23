// ============================================
// FIX Bridge — settings sub-page
// Route: /settings/fixbridge
// Reads/writes the operational slice of fixbridge_config.json via
// settingsApi.fixbridge.get() / .update()
//
// Layout: 40/60 split mirroring the other sub-pages.
//   Left  — Configuration form, five grouped sections:
//             Log level          (1 field)
//             Audit · Raw FIX    (4 fields: enable, retention, segment, compression)
//             Audit · Normalized (4 fields: enable, retention, snapshot, segment)
//             Incident           (3 fields: path, max bundles, auto-export triggers)
//             Backpressure       (3 fields: three queue caps)
//   Right — Live status (501 stub today) · Recent changes · Service
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/05-fix-bridge.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  FIX_BRIDGE_LOG_LEVELS,
  FIX_BRIDGE_COMPRESSIONS,
  FIX_BRIDGE_AUTO_EXPORT_TRIGGERS,
  type FixBridgeConfig,
  type FixBridgeUpdateBody,
  type FixBridgeStatus,
  type FixBridgeLogLevel,
  type FixBridgeCompression,
  type FixBridgeAutoExportTrigger,
  type ApiResult,
  type LogServiceDescriptor,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Form state — flat shape, reconstructed into the nested body at submit.
// ─────────────────────────────────────────────────────────────────────────────

interface DraftState {
  log_level: FixBridgeLogLevel;

  // audit.raw_fix
  raw_enabled:         boolean;
  raw_retention_hours: string;
  raw_segment_size_mb: string;
  raw_compression:     FixBridgeCompression;

  // audit.normalized_dom
  dom_enabled:               boolean;
  dom_retention_hours:       string;
  dom_snapshot_interval_sec: string;
  dom_segment_size_mb:       string;

  // incident
  incident_bundle_path:    string;
  incident_max_bundles:    string;
  incident_auto_export_on: FixBridgeAutoExportTrigger[];

  // backpressure
  bp_trading_outbound_max: string;
  bp_md_inbound_max:       string;
  bp_dom_publish_max:      string;
}

const EMPTY_DRAFT: DraftState = {
  log_level: 'info',
  raw_enabled: false, raw_retention_hours: '', raw_segment_size_mb: '', raw_compression: 'none',
  dom_enabled: false, dom_retention_hours: '', dom_snapshot_interval_sec: '', dom_segment_size_mb: '',
  incident_bundle_path: '', incident_max_bundles: '', incident_auto_export_on: [],
  bp_trading_outbound_max: '', bp_md_inbound_max: '', bp_dom_publish_max: '',
};

function draftFromConfig(c: FixBridgeConfig): DraftState {
  return {
    log_level: c.log_level ?? 'info',

    raw_enabled:         c.audit?.raw_fix?.enabled         ?? false,
    raw_retention_hours: String(c.audit?.raw_fix?.retention_hours ?? ''),
    raw_segment_size_mb: String(c.audit?.raw_fix?.segment_size_mb ?? ''),
    raw_compression:     c.audit?.raw_fix?.compression     ?? 'none',

    dom_enabled:               c.audit?.normalized_dom?.enabled               ?? false,
    dom_retention_hours:       String(c.audit?.normalized_dom?.retention_hours       ?? ''),
    dom_snapshot_interval_sec: String(c.audit?.normalized_dom?.snapshot_interval_sec ?? ''),
    dom_segment_size_mb:       String(c.audit?.normalized_dom?.segment_size_mb       ?? ''),

    incident_bundle_path:    c.incident?.bundle_path    ?? '',
    incident_max_bundles:    String(c.incident?.max_bundles    ?? ''),
    incident_auto_export_on: [...(c.incident?.auto_export_on   ?? [])],

    bp_trading_outbound_max: String(c.backpressure?.trading_outbound_max ?? ''),
    bp_md_inbound_max:       String(c.backpressure?.md_inbound_max       ?? ''),
    bp_dom_publish_max:      String(c.backpressure?.dom_publish_max      ?? ''),
  };
}

function sameStringArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function FixBridgePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  const [initial,      setInitial]      = useState<FixBridgeConfig | null>(null);
  const [draft,        setDraft]        = useState<DraftState>(EMPTY_DRAFT);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [statusResult,    setStatusResult]    = useState<ApiResult<FixBridgeStatus> | null>(null);
  const [fixbridgeLogDir, setFixbridgeLogDir] = useState<string | null>(null);

  // ── load ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [getResp, statusResp, logsResp] = await Promise.all([
          settingsApi.fixbridge.get(),
          settingsApi.fixbridge.status(),
          settingsApi.logs.getServices().catch(() => null),
        ]);
        if (cancelled) return;
        setInitial(getResp.data);
        setDraft(draftFromConfig(getResp.data));
        setStatusResult(statusResp);
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'fixbridge');
          setFixbridgeLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load FIX Bridge configuration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── dirty ───────────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!initial) return false;

    if (draft.log_level !== initial.log_level) return true;

    const r = initial.audit?.raw_fix;
    if (draft.raw_enabled         !== (r?.enabled         ?? false)) return true;
    if (draft.raw_retention_hours !== String(r?.retention_hours ?? '')) return true;
    if (draft.raw_segment_size_mb !== String(r?.segment_size_mb ?? '')) return true;
    if (draft.raw_compression     !== (r?.compression     ?? 'none'))  return true;

    const d = initial.audit?.normalized_dom;
    if (draft.dom_enabled               !== (d?.enabled               ?? false)) return true;
    if (draft.dom_retention_hours       !== String(d?.retention_hours ?? ''))       return true;
    if (draft.dom_snapshot_interval_sec !== String(d?.snapshot_interval_sec ?? '')) return true;
    if (draft.dom_segment_size_mb       !== String(d?.segment_size_mb ?? ''))       return true;

    const i = initial.incident;
    if (draft.incident_bundle_path !== (i?.bundle_path ?? ''))   return true;
    if (draft.incident_max_bundles !== String(i?.max_bundles ?? '')) return true;
    if (!sameStringArray(draft.incident_auto_export_on, i?.auto_export_on ?? [])) return true;

    const bp = initial.backpressure;
    if (draft.bp_trading_outbound_max !== String(bp?.trading_outbound_max ?? '')) return true;
    if (draft.bp_md_inbound_max       !== String(bp?.md_inbound_max       ?? '')) return true;
    if (draft.bp_dom_publish_max      !== String(bp?.dom_publish_max      ?? '')) return true;

    return false;
  }, [draft, initial]);

  function setField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft(d => ({ ...d, [key]: value }));
    setSavedMessage(null);
    setSaveError(null);
  }

  function toggleExportTrigger(trigger: FixBridgeAutoExportTrigger) {
    setDraft(d => {
      const has = d.incident_auto_export_on.includes(trigger);
      return {
        ...d,
        incident_auto_export_on: has
          ? d.incident_auto_export_on.filter(t => t !== trigger)
          : [...d.incident_auto_export_on, trigger],
      };
    });
    setSavedMessage(null);
    setSaveError(null);
  }

  function handleRevert() {
    if (!initial) return;
    setDraft(draftFromConfig(initial));
    setSaveError(null);
    setSavedMessage(null);
  }

  async function handleSave() {
    if (!initial || !dirty || saving) return;

    // ── Validate numeric fields ────────────────────────────────
    const mustPositiveInt = (raw: string, label: string): [number, null] | [null, string] => {
      if (raw.trim() === '') return [null, `${label} is required`];
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) return [null, `${label} must be a positive integer`];
      return [n, null];
    };

    const [rawRetHrs, e1] = mustPositiveInt(draft.raw_retention_hours, 'Raw FIX retention hours');
    if (e1) { setSaveError(e1); return; }
    const [rawSegMb, e2] = mustPositiveInt(draft.raw_segment_size_mb, 'Raw FIX segment size');
    if (e2) { setSaveError(e2); return; }

    const [domRetHrs, e3] = mustPositiveInt(draft.dom_retention_hours, 'Normalized DOM retention hours');
    if (e3) { setSaveError(e3); return; }
    const [domSnapSec, e4] = mustPositiveInt(draft.dom_snapshot_interval_sec, 'Snapshot interval seconds');
    if (e4) { setSaveError(e4); return; }
    const [domSegMb, e5] = mustPositiveInt(draft.dom_segment_size_mb, 'Normalized DOM segment size');
    if (e5) { setSaveError(e5); return; }

    const bundlePath = draft.incident_bundle_path.trim();
    if (bundlePath === '') { setSaveError('Incident bundle path is required'); return; }
    const [maxBundles, e6] = mustPositiveInt(draft.incident_max_bundles, 'Maximum incident bundles');
    if (e6) { setSaveError(e6); return; }

    const [bpTrading, e7] = mustPositiveInt(draft.bp_trading_outbound_max, 'Trading outbound queue cap');
    if (e7) { setSaveError(e7); return; }
    const [bpMd, e8] = mustPositiveInt(draft.bp_md_inbound_max, 'Market data inbound queue cap');
    if (e8) { setSaveError(e8); return; }
    const [bpDom, e9] = mustPositiveInt(draft.bp_dom_publish_max, 'DOM publish queue cap');
    if (e9) { setSaveError(e9); return; }

    // ── Build body ─────────────────────────────────────────────
    const body: FixBridgeUpdateBody = {
      log_level: draft.log_level,
      audit: {
        raw_fix: {
          enabled:         draft.raw_enabled,
          retention_hours: rawRetHrs!,
          segment_size_mb: rawSegMb!,
          compression:     draft.raw_compression,
        },
        normalized_dom: {
          enabled:               draft.dom_enabled,
          retention_hours:       domRetHrs!,
          snapshot_interval_sec: domSnapSec!,
          segment_size_mb:       domSegMb!,
        },
      },
      incident: {
        bundle_path:    bundlePath,
        max_bundles:    maxBundles!,
        auto_export_on: [...draft.incident_auto_export_on],
      },
      backpressure: {
        trading_outbound_max: bpTrading!,
        md_inbound_max:       bpMd!,
        dom_publish_max:      bpDom!,
      },
    };

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.fixbridge.update(body);

      const fresh = await settingsApi.fixbridge.get();
      setInitial(fresh.data);
      setDraft(draftFromConfig(fresh.data));

      const services = res.restart_required ?? [];
      setSavedMessage(
        services.length > 0
          ? `Saved. Restart ${services.join(', ')} to apply.`
          : res.message ?? 'Saved.',
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>FIX bridge</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            FIX bridge
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Audit retention, incident bundling, and backpressure queue caps for the FIX
            bridge service. Changes persist to
            <span className="font-mono text-text-secondary"> config/fixbridge/fixbridge_config.json</span>
            {' '}and take effect on next service start. LP sessions and enablement are
            managed under LP management, not here.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
            style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
          >
            restart: fixbridge_service
          </span>
          <HelpIcon onClick={help.open} />
        </div>
      </div>

      {loadError ? (
        <div
          className="rounded p-3 mb-4"
          style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
        >
          <p className="text-sm font-medium m-0">Failed to load configuration</p>
          <p className="text-xs mt-1 text-text-secondary">{loadError}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[40fr_60fr] gap-3.5 items-start">

        {/* ─── LEFT: FORM PANEL ─── */}
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
            <h2 className="text-base font-medium text-text-primary m-0">Configuration</h2>
            <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
              Fifteen fields grouped into five sections. Scope is limited — other keys in
              the file (sessions, enabled LPs) are left untouched.
            </p>
          </div>

          <div className="px-5 pt-3 pb-1">

            {/* ── LOG LEVEL ── */}
            <SectionHeader label="Log level" />
            <SelectField
              label="Service log level"
              value={draft.log_level}
              options={FIX_BRIDGE_LOG_LEVELS}
              onChange={v => setField('log_level', v as FixBridgeLogLevel)}
              helper="Verbosity of fixbridge_service output. Debug/trace are heavy — use sparingly in production."
              disabled={loading}
            />

            {/* ── AUDIT · RAW FIX ── */}
            <SectionHeader label="Audit · Raw FIX" />
            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Raw FIX capture</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  Write every FIX message to disk segmented and rolling. Disables when off.
                </div>
              </div>
              <Toggle on={draft.raw_enabled} onChange={v => setField('raw_enabled', v)} disabled={loading} />
            </div>
            <Field
              label="Retention (hours)"
              value={draft.raw_retention_hours}
              onChange={v => setField('raw_retention_hours', v)}
              placeholder={loading ? 'Loading…' : '6'}
              helper="How long raw FIX segments stay on disk before they're pruned"
              disabled={loading || !draft.raw_enabled}
            />
            <Field
              label="Segment size (MB)"
              value={draft.raw_segment_size_mb}
              onChange={v => setField('raw_segment_size_mb', v)}
              placeholder={loading ? 'Loading…' : '50'}
              helper="Each raw FIX capture file rotates at this size"
              disabled={loading || !draft.raw_enabled}
            />
            <SelectField
              label="Compression"
              value={draft.raw_compression}
              options={FIX_BRIDGE_COMPRESSIONS}
              onChange={v => setField('raw_compression', v as FixBridgeCompression)}
              helper="zstd is the usual pick — smaller files with low CPU cost. gzip for portability, none to skip entirely."
              disabled={loading || !draft.raw_enabled}
            />

            {/* ── AUDIT · NORMALIZED DOM ── */}
            <SectionHeader label="Audit · Normalized DOM" />
            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Normalized DOM snapshots</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  Periodic snapshots of the normalized depth-of-market book state.
                </div>
              </div>
              <Toggle on={draft.dom_enabled} onChange={v => setField('dom_enabled', v)} disabled={loading} />
            </div>
            <Field
              label="Retention (hours)"
              value={draft.dom_retention_hours}
              onChange={v => setField('dom_retention_hours', v)}
              placeholder={loading ? 'Loading…' : '48'}
              helper="How long DOM snapshots stay on disk before they're pruned"
              disabled={loading || !draft.dom_enabled}
            />
            <Field
              label="Snapshot interval (seconds)"
              value={draft.dom_snapshot_interval_sec}
              onChange={v => setField('dom_snapshot_interval_sec', v)}
              placeholder={loading ? 'Loading…' : '1'}
              helper="How often the book state is captured. Lower = more detail, more disk."
              disabled={loading || !draft.dom_enabled}
            />
            <Field
              label="Segment size (MB)"
              value={draft.dom_segment_size_mb}
              onChange={v => setField('dom_segment_size_mb', v)}
              placeholder={loading ? 'Loading…' : '100'}
              helper="Each DOM snapshot file rotates at this size"
              disabled={loading || !draft.dom_enabled}
            />

            {/* ── INCIDENT ── */}
            <SectionHeader label="Incident" />
            <Field
              label="Bundle path"
              value={draft.incident_bundle_path}
              onChange={v => setField('incident_bundle_path', v)}
              placeholder={loading ? 'Loading…' : 'incidents'}
              helper="Directory for incident bundles, relative to service root"
              disabled={loading}
            />
            <Field
              label="Maximum bundles retained"
              value={draft.incident_max_bundles}
              onChange={v => setField('incident_max_bundles', v)}
              placeholder={loading ? 'Loading…' : '100'}
              helper="Oldest bundles are pruned when this count is exceeded"
              disabled={loading}
            />

            <div className="mb-3.5">
              <label className="text-[13px] font-medium text-text-secondary block mb-1.5">
                Auto-export triggers
              </label>
              <div className="flex flex-col gap-1.5">
                {FIX_BRIDGE_AUTO_EXPORT_TRIGGERS.map(trigger => (
                  <CheckboxRow
                    key={trigger}
                    checked={draft.incident_auto_export_on.includes(trigger)}
                    onChange={() => toggleExportTrigger(trigger)}
                    disabled={loading}
                    label={trigger}
                    description={TRIGGER_DESCRIPTIONS[trigger]}
                  />
                ))}
              </div>
              <span className="text-[11.5px] text-text-muted leading-snug mt-1.5 block">
                Any selected trigger exports an incident bundle automatically when that condition fires.
              </span>
            </div>

            {/* ── BACKPRESSURE ── */}
            <SectionHeader label="Backpressure" />
            <Field
              label="Trading outbound queue cap"
              value={draft.bp_trading_outbound_max}
              onChange={v => setField('bp_trading_outbound_max', v)}
              placeholder={loading ? 'Loading…' : '10000'}
              helper="Maximum messages queued for outbound trading sessions before dropping"
              disabled={loading}
            />
            <Field
              label="Market data inbound queue cap"
              value={draft.bp_md_inbound_max}
              onChange={v => setField('bp_md_inbound_max', v)}
              placeholder={loading ? 'Loading…' : '100000'}
              helper="Maximum inbound MD messages queued before dropping"
              disabled={loading}
            />
            <Field
              label="DOM publish queue cap"
              value={draft.bp_dom_publish_max}
              onChange={v => setField('bp_dom_publish_max', v)}
              placeholder={loading ? 'Loading…' : '50000'}
              helper="Maximum normalized DOM events queued to downstream consumers"
              disabled={loading}
            />
          </div>

          {(saveError || savedMessage) && (
            <div className="px-5 py-2">
              {saveError && (
                <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>{saveError}</p>
              )}
              {savedMessage && !saveError && (
                <p className="text-xs m-0" style={{ color: '#66e07a' }}>{savedMessage}</p>
              )}
            </div>
          )}

          <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3">
            <div className="text-[11.5px] text-text-muted leading-tight">
              Restart{' '}
              <span className="font-mono text-[11.5px]" style={{ color: '#e09a55' }}>
                fixbridge_service
              </span>
              {' '}after saving
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRevert}
                disabled={!dirty || saving || loading}
                className={clsx(
                  'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
                  'bg-transparent border-border text-text-secondary',
                  dirty && !saving && !loading
                    ? 'hover:bg-surface-hover cursor-pointer'
                    : 'opacity-50 cursor-not-allowed',
                )}
              >
                Revert
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!dirty || saving || loading}
                className={clsx(
                  'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
                  'bg-accent border-accent text-[#0b0c0e]',
                  dirty && !saving && !loading
                    ? 'hover:bg-accent-hover cursor-pointer'
                    : 'opacity-50 cursor-not-allowed',
                )}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: SUPPLEMENTARY PANELS ─── */}
        <div className="flex flex-col gap-3.5">

          {/* Live status */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border flex items-center justify-between gap-3">
              <h2 className="text-base font-medium text-text-primary m-0">Live status</h2>
              <StatusStub result={statusResult} />
            </div>
            <LiveStatusBody result={statusResult} />
          </div>

          {/* Recent changes */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Recent changes</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Last edits to this file, drawn from the audit log
              </p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs text-text-muted m-0 text-center">
                Audit log integration is scheduled for a follow-up ticket. This panel will
                populate with the last five edits to
                <span className="font-mono"> config/fixbridge/fixbridge_config.json</span> once wired.
              </p>
            </div>
          </div>

          {/* Service */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Service</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Process metadata. Status, uptime, and last-start require backend support.
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <ServiceField label="Process"     value="fixbridge_service" mono />
              <ServiceField label="Status"      value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Uptime"      value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Last start"  value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Config file" value="config/fixbridge/fixbridge_config.json" mono small />
              <ServiceField label="Log dir"     value={fixbridgeLogDir ?? '—'} mono small />
            </div>
          </div>

        </div>
      </div>

    <HelpDrawer
      open={help.isOpen}
      title="FIX bridge"
      content={helpContent}
      onClose={help.close}
    />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

const TRIGGER_DESCRIPTIONS: Record<FixBridgeAutoExportTrigger, string> = {
  SESSION_GAP:          'A FIX session dropped or reconnected with a sequence gap',
  BOOK_STALE_EXTENDED:  'The normalized book stayed stale beyond the alert threshold',
  MASS_REJECT:          'A burst of order rejects crossed the configured limit',
  SEQ_RESET_FORCED:     'A forced sequence reset was issued on a session',
};

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="flex-1 h-px" style={{ background: '#2a292c' }} />
    </div>
  );
}

interface FieldProps {
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  helper?:      string;
  type?:        'text' | 'password';
  disabled?:    boolean;
}

function Field({ label, value, onChange, placeholder, helper, type = 'text', disabled }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={clsx(
          'rounded px-3 py-1.5 text-[13px] font-mono w-full',
          'text-text-primary min-h-[34px]',
          'border focus:outline-none focus:border-accent',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        style={{ background: '#232225', borderColor: '#44454f' }}
      />
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

interface SelectFieldProps {
  label:     string;
  value:     string;
  options:   readonly string[];
  onChange:  (v: string) => void;
  helper?:   string;
  disabled?: boolean;
}

function SelectField({ label, value, options, onChange, helper, disabled }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={clsx(
          'rounded px-3 py-1.5 text-[13px] font-mono w-full',
          'text-text-primary min-h-[34px]',
          'border focus:outline-none focus:border-accent cursor-pointer',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
        style={{ background: '#232225', borderColor: '#44454f' }}
      >
        {options.map(opt => (
          <option key={opt} value={opt} style={{ background: '#232225', color: '#E6E6E6' }}>
            {opt}
          </option>
        ))}
      </select>
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

/** Sharp checkbox row with label + description. No opacity. */
interface CheckboxRowProps {
  checked:     boolean;
  onChange:    () => void;
  disabled?:   boolean;
  label:       string;
  description: string;
}

function CheckboxRow({ checked, onChange, disabled, label, description }: CheckboxRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => !disabled && onChange()}
      disabled={disabled}
      className={clsx(
        'flex items-start gap-2.5 px-2.5 py-2 rounded text-left transition-colors',
        'border bg-transparent',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-surface-hover',
      )}
      style={{ borderColor: '#2a292c' }}
    >
      <span
        className="shrink-0 flex items-center justify-center rounded"
        style={{
          width:      16,
          height:     16,
          marginTop:  1,
          background: checked ? '#49b3b3' : '#232225',
          border:     `1px solid ${checked ? '#49b3b3' : '#44454f'}`,
        }}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="#0b0c0e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12.5px] font-mono text-text-primary">{label}</span>
        <span className="text-[11.5px] text-text-muted leading-snug">{description}</span>
      </span>
    </button>
  );
}

/** Pill-style boolean toggle — same shape as NexDay / TE. No opacity. */
interface ToggleProps {
  on:        boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ on, onChange, disabled }: ToggleProps) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <span
        className="text-[11.5px] font-mono uppercase tracking-wide"
        style={{ color: on ? '#66e07a' : '#e09a55' }}
      >
        {on ? 'On' : 'Off'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => !disabled && onChange(!on)}
        disabled={disabled}
        className={clsx(
          'relative rounded-full transition-colors',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
        style={{
          width:  36,
          height: 20,
          background: on ? '#49b3b3' : '#232225',
          border:     `1px solid ${on ? '#49b3b3' : '#44454f'}`,
          padding:    0,
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width:    14,
            height:   14,
            margin:   1,
            background: '#fff',
            transform:  on ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 0.15s',
          }}
        />
      </button>
    </div>
  );
}

function StatusStub({ result }: { result: ApiResult<FixBridgeStatus> | null }) {
  if (!result || result.kind === 'ok') return null;
  const label =
    result.kind === 'not_implemented'
      ? 'GET /fixbridge/status — 501 stub'
      : `GET /fixbridge/status — ${result.status}`;
  return (
    <span
      className="font-mono text-[11px] px-2 py-0.5 rounded shrink-0"
      style={{ background: '#18202a', color: '#5b86b8', border: '1px solid #2b3e57' }}
    >
      {label}
    </span>
  );
}

function LiveStatusBody({ result }: { result: ApiResult<FixBridgeStatus> | null }) {
  const notLive = !result || result.kind !== 'ok';
  const data = result?.kind === 'ok' ? result.data : null;
  const val = (v: string | number | undefined | null) =>
    v === undefined || v === null ? '—' : String(v);

  return (
    <div className="px-5 pt-3.5 pb-4">
      <div className="grid grid-cols-4 gap-3.5 mb-2.5">
        <Metric label="Sessions"           value={val(data?.sessions_connected != null ? `${data.sessions_connected} / ${data.sessions_configured ?? '?'}` : undefined)} muted={notLive} />
        <Metric label="Last message"       value={val(data?.last_message_at)} muted={notLive} />
        <Metric label="Inbound msg/s"      value={val(data?.messages_per_sec_in)} muted={notLive} />
        <Metric label="Outbound msg/s"     value={val(data?.messages_per_sec_out)} muted={notLive} />
      </div>
      <p className="text-[11.5px] text-text-muted border-t border-border pt-2.5 leading-snug m-0">
        {notLive
          ? (
            <>
              Metrics populate once the FIX bridge exposes its control channel. The UI will
              poll <span className="font-mono text-text-muted">/fixbridge/status</span> once it returns 200.
            </>
          )
          : 'Live from the FIX bridge control channel.'}
      </p>
    </div>
  );
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className={clsx(
        'text-lg font-mono font-medium',
        muted ? 'text-text-muted' : 'text-text-primary',
      )}>
        {value}
      </span>
    </div>
  );
}

function ServiceField({
  label, value, mono, small, tone, note,
}: {
  label: string; value: string; mono?: boolean; small?: boolean;
  tone?: 'muted'; note?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className={clsx(
        mono ? 'font-mono' : '',
        small ? 'text-[11.5px]' : 'text-[13px]',
        tone === 'muted' ? 'text-text-muted' : 'text-text-primary',
      )}>
        {value}
      </span>
      {note && (
        <span className="text-[10px] text-text-muted italic">{note}</span>
      )}    </div>
  );
}

export default FixBridgePage;