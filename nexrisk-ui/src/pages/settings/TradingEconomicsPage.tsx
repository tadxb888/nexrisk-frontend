// ============================================
// Trading Economics — settings sub-page
// Route: /settings/trading-economics
// Reads/writes nexrisk_config.json's `trading_economics` subsection via
// settingsApi.nexrisk.get() / .updateTradingEconomics()
//
// Layout: 40/60 split mirroring GatewayPage / AuthSessionPage
//   Left  — Configuration form (enabled toggle, masked api_key, 4 scalars)
//   Right — Feed summary · Recent changes · Service
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/03-trading-economics.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  type TradingEconomicsConfig,
  type TradingEconomicsUpdateBody,
  type LogServiceDescriptor,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface DraftState {
  enabled:               boolean;
  /** Always starts empty. Empty on submit = omit from PUT = leave unchanged. */
  api_key:               string;
  preload_days_back:     string;
  preload_days_ahead:    string;
  poll_interval_seconds: string;
  ws_endpoint:           string;
}

const EMPTY_DRAFT: DraftState = {
  enabled: false, api_key: '',
  preload_days_back: '', preload_days_ahead: '',
  poll_interval_seconds: '', ws_endpoint: '',
};

function draftFromConfig(c: TradingEconomicsConfig): DraftState {
  return {
    enabled:               c.enabled               ?? false,
    api_key:               '',   // never pre-fill secret input
    preload_days_back:     String(c.preload_days_back     ?? ''),
    preload_days_ahead:    String(c.preload_days_ahead    ?? ''),
    poll_interval_seconds: String(c.poll_interval_seconds ?? ''),
    ws_endpoint:           c.ws_endpoint           ?? '',
  };
}

function formatInterval(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 60   && seconds % 60   === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function TradingEconomicsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  const [initial,      setInitial]      = useState<TradingEconomicsConfig | null>(null);
  const [draft,        setDraft]        = useState<DraftState>(EMPTY_DRAFT);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [nexriskLogDir, setNexriskLogDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [nexrisk, logsResp] = await Promise.all([
          settingsApi.nexrisk.get(),
          settingsApi.logs.getServices().catch(() => null),
        ]);
        if (cancelled) return;
        if (!nexrisk.trading_economics) {
          setLoadError('The nexrisk config is missing the "trading_economics" subsection. Check the backend defaults.');
        } else {
          setInitial(nexrisk.trading_economics);
          setDraft(draftFromConfig(nexrisk.trading_economics));
        }
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'nexrisk');
          setNexriskLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load Trading Economics configuration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const dirty = useMemo(() => {
    if (!initial) return false;
    if (draft.enabled                !== (initial.enabled                ?? false)) return true;
    if (draft.preload_days_back      !== String(initial.preload_days_back      ?? '')) return true;
    if (draft.preload_days_ahead     !== String(initial.preload_days_ahead     ?? '')) return true;
    if (draft.poll_interval_seconds  !== String(initial.poll_interval_seconds  ?? '')) return true;
    if (draft.ws_endpoint            !== (initial.ws_endpoint            ?? '')) return true;
    // Secret: dirty if user has typed anything.
    if (draft.api_key                !== '') return true;
    return false;
  }, [draft, initial]);

  function setField<K extends keyof DraftState>(key: K, value: DraftState[K]) {
    setDraft(d => ({ ...d, [key]: value }));
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

    // Validate integers.
    const back  = Number(draft.preload_days_back);
    const ahead = Number(draft.preload_days_ahead);
    const poll  = Number(draft.poll_interval_seconds);
    if (draft.preload_days_back === '' || !Number.isInteger(back) || back < 0) {
      setSaveError('Preload days back must be a non-negative integer'); return;
    }
    if (draft.preload_days_ahead === '' || !Number.isInteger(ahead) || ahead < 0) {
      setSaveError('Preload days ahead must be a non-negative integer'); return;
    }
    if (draft.poll_interval_seconds === '' || !Number.isInteger(poll) || poll <= 0) {
      setSaveError('Poll interval must be a positive integer'); return;
    }

    const ws = draft.ws_endpoint.trim();
    if (ws === '' || !(ws.startsWith('ws://') || ws.startsWith('wss://'))) {
      setSaveError('WebSocket endpoint must start with ws:// or wss://'); return;
    }

    // Build body. Send all editable fields; omit api_key if user didn't type
    // anything (brief § 2.2 — write-preserve).
    const body: TradingEconomicsUpdateBody = {
      enabled:               draft.enabled,
      preload_days_back:     back,
      preload_days_ahead:    ahead,
      poll_interval_seconds: poll,
      ws_endpoint:           ws,
    };
    if (draft.api_key !== '') {
      body.api_key = draft.api_key;
    }

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.nexrisk.updateTradingEconomics(body);

      const fresh = await settingsApi.nexrisk.get();
      if (fresh.trading_economics) {
        setInitial(fresh.trading_economics);
        setDraft(draftFromConfig(fresh.trading_economics));
      }

      setSavedMessage(
        res.pending_restart
          ? (res.restart_notice ?? 'Saved. Restart nexrisk_service to apply.')
          : 'Saved.',
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Trading Economics</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Trading Economics
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Economic calendar feed and event stream. Changes persist to
            <span className="font-mono text-text-secondary"> config/nexrisk_config.json</span>
            {' '}and take effect on next service start. Upstream is
            <span className="font-mono text-text-secondary"> tradingeconomics.com</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
            style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
          >
            restart: nexrisk_service
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
              Six fields. Blank API key leaves the current value untouched.
            </p>
          </div>

          <div className="px-5 pt-4 pb-1">

            {/* Enabled toggle */}
            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5 border-b border-[#2a292c]">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Feed enabled</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  When off, the service stops polling and consumes no API quota. Stored config is preserved.
                </div>
              </div>
              <Toggle
                on={draft.enabled}
                onChange={v => setField('enabled', v)}
                disabled={loading}
                labelOn="Enabled"
                labelOff="Disabled"
              />
            </div>

            <Field
              label="API key"
              secret
              type="password"
              value={draft.api_key}
              onChange={v => setField('api_key', v)}
              placeholder="Leave blank to keep current value"
              helper="Stored encrypted. Current value is masked on read — blank means unchanged."
              disabled={loading}
            />
            <Field
              label="WebSocket endpoint"
              value={draft.ws_endpoint}
              onChange={v => setField('ws_endpoint', v)}
              placeholder={loading ? 'Loading…' : 'wss://stream.tradingeconomics.com/'}
              helper="Upstream WebSocket URL. Must start with ws:// or wss://"
              disabled={loading}
            />
            <Field
              label="Poll interval (seconds)"
              value={draft.poll_interval_seconds}
              onChange={v => setField('poll_interval_seconds', v)}
              placeholder={loading ? 'Loading…' : '90'}
              helper={
                Number.isInteger(Number(draft.poll_interval_seconds)) && Number(draft.poll_interval_seconds) > 0
                  ? `Calendar poll frequency · currently ${formatInterval(Number(draft.poll_interval_seconds))}`
                  : 'Calendar poll frequency (integer seconds)'
              }
              disabled={loading}
            />
            <Field
              label="Preload window — days back"
              value={draft.preload_days_back}
              onChange={v => setField('preload_days_back', v)}
              placeholder={loading ? 'Loading…' : '2'}
              helper="How many days of historical calendar events to keep on startup"
              disabled={loading}
            />
            <Field
              label="Preload window — days ahead"
              value={draft.preload_days_ahead}
              onChange={v => setField('preload_days_ahead', v)}
              placeholder={loading ? 'Loading…' : '14'}
              helper="How many days of upcoming calendar events to prefetch on startup"
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
                nexrisk_service
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

          {/* Feed summary */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Feed summary</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Current form values in human terms. Updates live as you edit.
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <SummaryItem
                label="Status"
                value={draft.enabled ? 'Enabled' : 'Disabled'}
                tone={draft.enabled ? 'ok' : 'warn'}
              />
              <SummaryItem
                label="Poll cadence"
                value={
                  Number.isInteger(Number(draft.poll_interval_seconds)) && Number(draft.poll_interval_seconds) > 0
                    ? `every ${formatInterval(Number(draft.poll_interval_seconds))}`
                    : '—'
                }
              />
              <SummaryItem
                label="History window"
                value={draft.preload_days_back === '' ? '—' : `${draft.preload_days_back} days back`}
              />
              <SummaryItem
                label="Lookahead window"
                value={draft.preload_days_ahead === '' ? '—' : `${draft.preload_days_ahead} days ahead`}
              />
              <div className="col-span-2">
                <SummaryItem label="Upstream" value={draft.ws_endpoint || '—'} truncate />
              </div>
            </div>
          </div>

          {/* Recent changes */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Recent changes</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Last edits to this subsection, drawn from the audit log
              </p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs text-text-muted m-0 text-center">
                Audit log integration is scheduled for a follow-up ticket. This panel will
                populate with the last five edits to the <span className="font-mono">nexrisk.trading_economics</span>
                {' '}subsection once wired.
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
              <ServiceField label="Process"     value="nexrisk_service" mono />
              <ServiceField label="Status"      value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Uptime"      value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Last start"  value="—" mono tone="muted" note="awaiting backend" />
              <ServiceField label="Config file" value="config/nexrisk_config.json" mono small />
              <ServiceField label="Log dir"     value={nexriskLogDir ?? '—'} mono small />
            </div>
          </div>

        </div>
      </div>

    <HelpDrawer
      open={help.isOpen}
      title="Trading Economics"
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
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  helper?:      string;
  type?:        'text' | 'password';
  secret?:      boolean;
  disabled?:    boolean;
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
        style={{ background: '#232225', borderColor: '#44454f' }}
      />
      {helper && <span className="text-[11.5px] text-text-muted leading-snug">{helper}</span>}
    </div>
  );
}

/** Pill-style boolean toggle. No opacity/alpha — both states fully solid.
 *  On: accent teal track, dot slid right, label shows "Enabled".
 *  Off: neutral dark track, dot slid left, label shows "Disabled". */
interface ToggleProps {
  on:        boolean;
  onChange:  (v: boolean) => void;
  disabled?: boolean;
  labelOn?:  string;
  labelOff?: string;
}

function Toggle({ on, onChange, disabled, labelOn = 'On', labelOff = 'Off' }: ToggleProps) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <span
        className="text-[11.5px] font-mono uppercase tracking-wide"
        style={{ color: on ? '#66e07a' : '#e09a55' }}
      >
        {on ? labelOn : labelOff}
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
          width:           36,
          height:          20,
          background:      on ? '#49b3b3' : '#232225',
          border:          `1px solid ${on ? '#49b3b3' : '#44454f'}`,
          padding:         0,
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

function SummaryItem({
  label, value, tone, truncate,
}: {
  label: string; value: string; tone?: 'ok' | 'warn'; truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span
        className={clsx('text-[13px] font-mono', truncate && 'truncate')}
        style={{
          color:
            tone === 'ok'   ? '#66e07a' :
            tone === 'warn' ? '#e09a55' :
            undefined,
        }}
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

export default TradingEconomicsPage;