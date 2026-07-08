// ============================================
// Price feed gateway — settings sub-page
// Route: /settings/gateway
// Reads/writes config/nexrisk_gateway.json via settingsApi.gateway
//
// Layout: 40/60 split
//   Left  — Configuration form (single column inside the narrow panel)
//   Right — Live status (501 stub today) · Recent changes · Service
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/01-gateway.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  type GatewayConfig,
  type GatewayUpdateBody,
  type GatewayStatus,
  type LogServiceDescriptor,
  type ApiResult,
} from '@/services/api';
import { useServiceHealth, ServiceHealthRows, RecentChangesPanel } from './SettingsSidePanels';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

type EditableKey = Exclude<keyof GatewayConfig, 'gateway_password'>;
const EDITABLE_KEYS: EditableKey[] = [
  'mt5_server',
  'gateway_login',
  'gateway_listen',
  'gateway_name',
  'timezone_minutes',
  'log_path',
];

interface DraftState {
  mt5_server:       string;
  gateway_login:    string;   // string for input; parsed to number on submit
  gateway_listen:   string;
  gateway_name:     string;
  timezone_minutes: string;
  log_path:         string;
  /** Always starts empty. Empty on submit = omit from PUT = leave unchanged. */
  gateway_password: string;
}

const EMPTY_DRAFT: DraftState = {
  mt5_server: '', gateway_login: '', gateway_listen: '',
  gateway_name: '', timezone_minutes: '', log_path: '',
  gateway_password: '',
};

function draftFromConfig(c: GatewayConfig): DraftState {
  return {
    mt5_server:       c.mt5_server       ?? '',
    gateway_login:    String(c.gateway_login    ?? ''),
    gateway_listen:   c.gateway_listen   ?? '',
    gateway_name:     c.gateway_name     ?? '',
    timezone_minutes: String(c.timezone_minutes ?? ''),
    log_path:         c.log_path         ?? '',
    gateway_password: '',   // never pre-fill secret input
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function GatewayPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  // ── live service health (§ G1) + recent-changes refresh (§ G2) ──
  const { health, loading: healthLoading, error: healthError } = useServiceHealth('gateway');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // ── remote state ─────────────────────────────────────────────────
  const [initial,      setInitial]      = useState<GatewayConfig | null>(null);
  const [draft,        setDraft]        = useState<DraftState>(EMPTY_DRAFT);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [statusResult, setStatusResult] = useState<ApiResult<GatewayStatus> | null>(null);
  const [gatewayLogDir, setGatewayLogDir] = useState<string | null>(null);

  // ── initial load ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [gResp, statusResp, logsResp] = await Promise.all([
          settingsApi.gateway.get(),
          settingsApi.gateway.status(),
          settingsApi.logs.getServices().catch(() => null),
        ]);
        if (cancelled) return;
        setInitial(gResp.data);
        setDraft(draftFromConfig(gResp.data));
        setStatusResult(statusResp);
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'gateway');
          setGatewayLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load gateway configuration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── live status poll (§ G3) — gateway status refreshes ~every 60s ──
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const r = await settingsApi.gateway.status();
        if (!cancelled) setStatusResult(r);
      } catch { /* keep last good value */ }
      finally { if (!cancelled) timer = setTimeout(tick, 45_000); }
    }
    timer = setTimeout(tick, 45_000);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);

  // ── dirty check ──────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!initial) return false;
    // Non-secret fields: any text mismatch against the initial snapshot.
    if (draft.mt5_server       !== (initial.mt5_server       ?? '')) return true;
    if (draft.gateway_login    !== String(initial.gateway_login    ?? '')) return true;
    if (draft.gateway_listen   !== (initial.gateway_listen   ?? '')) return true;
    if (draft.gateway_name     !== (initial.gateway_name     ?? '')) return true;
    if (draft.timezone_minutes !== String(initial.timezone_minutes ?? '')) return true;
    if (draft.log_path         !== (initial.log_path         ?? '')) return true;
    // Secret: dirty if user has typed anything.
    if (draft.gateway_password !== '') return true;
    return false;
  }, [draft, initial]);

  // ── handlers ─────────────────────────────────────────────────────
  function setField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft(d => ({ ...d, [key]: value }));
    // Clear save feedback when the user starts editing again.
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

    // Build the PUT body with ONLY changed editable fields, plus the password
    // if and only if the user typed something. This is the write-preserve
    // contract from the brief § 2.2 — omitting gateway_password means
    // "leave existing unchanged"; sending the masked "***" back would write
    // that literal string into the config.
    const body: GatewayUpdateBody = {};

    if (draft.mt5_server       !== initial.mt5_server)       body.mt5_server       = draft.mt5_server;
    if (draft.gateway_listen   !== initial.gateway_listen)   body.gateway_listen   = draft.gateway_listen;
    if (draft.gateway_name     !== initial.gateway_name)     body.gateway_name     = draft.gateway_name;
    if (draft.log_path         !== initial.log_path)         body.log_path         = draft.log_path;

    // Numeric fields: parse and validate before submitting.
    if (draft.gateway_login !== String(initial.gateway_login)) {
      const n = Number(draft.gateway_login);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        setSaveError('Gateway login must be an integer');
        return;
      }
      body.gateway_login = n;
    }
    if (draft.timezone_minutes !== String(initial.timezone_minutes)) {
      const n = Number(draft.timezone_minutes);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        setSaveError('Timezone offset must be an integer');
        return;
      }
      body.timezone_minutes = n;
    }

    if (draft.gateway_password !== '') {
      body.gateway_password = draft.gateway_password;
    }

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.gateway.update(body);

      // Success — re-fetch from the backend so we see the persisted state
      // (including gateway_password re-masked to "***"). This also gives us
      // a canonical snapshot to diff against going forward.
      const fresh = await settingsApi.gateway.get();
      setInitial(fresh.data);
      setDraft(draftFromConfig(fresh.data));
      setHistoryRefresh(k => k + 1);
      settingsApi.gateway.status().then(setStatusResult).catch(() => { /* keep last */ });

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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Price feed gateway</span>
      </div>

      {/* Page header */}
      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Price feed gateway
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Upstream MT5 connection and downstream terminal listener served by the NexRisk gateway process.
            Changes persist to <span className="font-mono text-text-secondary">config/nexrisk_gateway.json</span>
            {' '}and take effect on next service start.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
            style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
          >
            restart: nexrisk_gateway_service
          </span>
          <HelpIcon onClick={help.open} />
        </div>
      </div>

      {/* Load/error states */}
      {loadError ? (
        <div
          className="rounded p-3 mb-4"
          style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
        >
          <p className="text-sm font-medium m-0">Failed to load configuration</p>
          <p className="text-xs mt-1 text-text-secondary">{loadError}</p>
        </div>
      ) : null}

      {/* 40/60 split */}
      <div className="grid grid-cols-1 lg:grid-cols-[40fr_60fr] gap-3.5 items-start">

        {/* ─── LEFT: FORM PANEL ─── */}
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
            <h2 className="text-base font-medium text-text-primary m-0">Configuration</h2>
            <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
              Seven fields. Blank password leaves the current value untouched.
            </p>
          </div>

          <div className="px-5 pt-4 pb-1">
            <Field
              label="MT5 server"
              value={draft.mt5_server}
              onChange={v => setField('mt5_server', v)}
              placeholder={loading ? 'Loading…' : '175.110.113.174:15024'}
              helper="Upstream MT5 server address, host:port"
              disabled={loading}
            />
            <Field
              label="Gateway login"
              value={draft.gateway_login}
              onChange={v => setField('gateway_login', v)}
              placeholder={loading ? 'Loading…' : '10'}
              helper="MT5 manager login number"
              disabled={loading}
            />
            <Field
              label="Gateway password"
              secret
              type="password"
              value={draft.gateway_password}
              onChange={v => setField('gateway_password', v)}
              placeholder="Leave blank to keep current value"
              helper="Stored encrypted. Current value is masked on read."
              disabled={loading}
            />
            <Field
              label="Listen address"
              value={draft.gateway_listen}
              onChange={v => setField('gateway_listen', v)}
              placeholder={loading ? 'Loading…' : '0.0.0.0:16390'}
              helper="Local address the gateway binds to for downstream terminals"
              disabled={loading}
            />
            <Field
              label="Gateway name"
              value={draft.gateway_name}
              onChange={v => setField('gateway_name', v)}
              placeholder={loading ? 'Loading…' : 'NexRisk Price Feed'}
              helper="Displayed on downstream terminal connections"
              disabled={loading}
            />
            <Field
              label="Timezone offset (minutes)"
              value={draft.timezone_minutes}
              onChange={v => setField('timezone_minutes', v)}
              placeholder={loading ? 'Loading…' : '0'}
              helper="UTC offset applied to server timestamps"
              disabled={loading}
            />
            <Field
              label="Log path"
              value={draft.log_path}
              onChange={v => setField('log_path', v)}
              placeholder={loading ? 'Loading…' : 'logs'}
              helper="Directory for gateway log files, relative to service root"
              disabled={loading}
            />
          </div>

          {/* Save feedback row */}
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

          {/* Footer actions */}
          <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3">
            <div className="text-[11.5px] text-text-muted leading-tight">
              Restart{' '}
              <span className="font-mono text-[11.5px]" style={{ color: '#e09a55' }}>
                nexrisk_gateway_service
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

          {/* Recent changes (§ G2) */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Recent changes</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Last edits to this configuration, drawn from the audit log
              </p>
            </div>
            <RecentChangesPanel section="gateway" refreshKey={historyRefresh} />
          </div>

          {/* Service */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Service</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Live process state (§ G1), refreshed periodically.
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <ServiceField label="Process"     value="nexrisk_gateway_service" mono />
              <ServiceHealthRows health={health} loading={healthLoading} error={healthError} />
              <ServiceField label="Config file" value="config/nexrisk_gateway.json" mono small />
              <ServiceField label="Log dir"     value={gatewayLogDir ?? '—'} mono small />
            </div>
          </div>

        </div>
      </div>

    <HelpDrawer
      open={help.isOpen}
      title="Price feed gateway"
      content={helpContent}
      onClose={help.close}
    />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  helper?:     string;
  type?:       'text' | 'password';
  secret?:     boolean;
  disabled?:   boolean;
}

function Field({ label, value, onChange, placeholder, helper, type = 'text', secret, disabled }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary flex items-center gap-2">
        {label}
        {secret && (
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded tracking-wide"
            style={{ background: '#163a3a', color: '#49b3b3', border: '1px solid #2f8f8f' }}
          >
            secret
          </span>
        )}
      </label>
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
        style={{
          background: '#232225',
          borderColor: '#44454f',
        }}
      />
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

const GW_STATE_BADGE: Record<string, { color: string; label: string }> = {
  live:             { color: '#6aaa78', label: 'live' },
  warming_up:       { color: '#c09060', label: 'warming up' },
  no_recent_status: { color: '#c09060', label: 'no recent status' },
  stale:            { color: '#c09060', label: 'stale' },
  down:             { color: '#d07070', label: 'down' },
  unknown:          { color: '#808080', label: 'unknown' },
};

function StatusStub({ result }: { result: ApiResult<GatewayStatus> | null }) {
  if (!result) return null;
  let color = '#808080';
  let label: string;
  if (result.kind === 'not_implemented')      label = 'unavailable';
  else if (result.kind === 'error')         { label = `error ${result.status}`; color = '#c09060'; }
  else {
    const b = GW_STATE_BADGE[result.data.state] ?? { color: '#808080', label: result.data.state };
    color = b.color; label = b.label;
  }
  return (
    <span
      className="font-mono text-[11px] px-2 py-0.5 rounded shrink-0 uppercase tracking-wide"
      style={{ color, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}

function LiveStatusBody({ result }: { result: ApiResult<GatewayStatus> | null }) {
  const data = result?.kind === 'ok' ? result.data : null;
  const live = data?.state === 'live';

  const num  = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));
  const rate = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toFixed(2));

  const mt5Value =
    !data ? '—'
    : data.state !== 'live' ? '—'
    : data.mt5_connected ? 'Linked' : 'No link';
  const mt5Tone: MetricTone =
    live && data ? (data.mt5_connected ? 'ok' : 'crit') : undefined;

  let footer: React.ReactNode;
  if (!result || result.kind === 'not_implemented') {
    footer = 'Live status is not currently reported by the gateway.';
  } else if (result.kind === 'error') {
    footer = `Status request failed (${result.status}).`;
  } else if (data) {
    const age = data.status_age_sec !== null && data.status_age_sec !== undefined
      ? ` (${data.status_age_sec}s ago)` : '';
    const asOf = data.status_line_time ? `as of ${data.status_line_time}${age}` : '';
    footer = (
      <>
        {live ? '' : 'Metrics are stale until a fresh status line arrives. '}
        {asOf}{asOf && data.note ? ' · ' : ''}{data.note}
      </>
    );
  }

  return (
    <div className="px-5 pt-3.5 pb-4">
      <div className="grid grid-cols-4 gap-3.5 mb-2.5">
        <Metric label="MT5 link"   value={mt5Value}                     muted={!live} tone={mt5Tone} />
        <Metric label="Ticks recv" value={num(data?.ticks_received)}    muted={!live} />
        <Metric label="Ticks sent" value={num(data?.ticks_sent)}        muted={!live} />
        <Metric label="Tick rate"  value={rate(data?.tick_rate_per_sec)} muted={!live} />
      </div>
      <p className="text-[11.5px] text-text-muted border-t border-border pt-2.5 leading-snug m-0">
        {footer}
      </p>
    </div>
  );
}

type MetricTone = 'ok' | 'crit' | undefined;

function Metric({ label, value, muted, tone }: {
  label: string; value: string; muted?: boolean; tone?: MetricTone;
}) {
  const color = tone === 'ok' ? '#6aaa78' : tone === 'crit' ? '#d07070' : undefined;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span
        className={clsx('text-lg font-mono font-medium', muted ? 'text-text-muted' : 'text-text-primary')}
        style={color && !muted ? { color } : undefined}
      >
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

export default GatewayPage;