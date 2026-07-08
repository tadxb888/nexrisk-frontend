// ============================================
// NexDay — settings sub-page
// Route: /settings/nexday
// Reads/writes nexrisk_config.json's `nexday` subsection via
// settingsApi.nexrisk.get() / .updateNexday()
//
// Layout: 40/60 split mirroring the other sub-pages.
//   Left  — Configuration form, four grouped sections:
//             Connection (enabled, api_server, license_id)
//             Polling (4 fields)
//             Retention (2 fields)
//             Hedging (3 fields)
//   Right — Feed summary · Recent changes · Service
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/04-nexday.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  type NexdayConfig,
  type NexdayUpdateBody,
  type LogServiceDescriptor,
} from '@/services/api';
import { useServiceHealth, ServiceHealthRows, RecentChangesPanel } from './SettingsSidePanels';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Form state — flat shape with underscored keys for nested fields. Makes the
// dirty diff and field-setter wiring cleaner than maintaining a real nested
// draft. Reconstructed into the nested PUT body at submit time.
// ─────────────────────────────────────────────────────────────────────────────

interface DraftState {
  // connection
  enabled:     boolean;
  api_server:  string;
  license_id:  string;    // always starts empty (secret)

  // polling
  polling_intraday_enabled:          boolean;
  polling_intraday_interval_minutes: string;
  polling_daily_enabled:             boolean;
  polling_daily_time_et:             string;

  // retention
  retention_daily_bars:    string;
  retention_intraday_bars: string;

  // hedging
  hedging_auto_suggest:              boolean;
  hedging_min_position_volume:       string;
  hedging_suggestion_expiry_minutes: string;
}

const EMPTY_DRAFT: DraftState = {
  enabled: false, api_server: '', license_id: '',
  polling_intraday_enabled: false, polling_intraday_interval_minutes: '',
  polling_daily_enabled: false,    polling_daily_time_et: '',
  retention_daily_bars: '', retention_intraday_bars: '',
  hedging_auto_suggest: false,
  hedging_min_position_volume: '',
  hedging_suggestion_expiry_minutes: '',
};

function draftFromConfig(c: NexdayConfig): DraftState {
  return {
    enabled:      c.enabled     ?? false,
    api_server:   c.api_server  ?? '',
    license_id:   '',   // never pre-fill secret

    polling_intraday_enabled:          c.polling?.intraday_enabled          ?? false,
    polling_intraday_interval_minutes: String(c.polling?.intraday_interval_minutes ?? ''),
    polling_daily_enabled:             c.polling?.daily_enabled             ?? false,
    polling_daily_time_et:             c.polling?.daily_time_et             ?? '',

    retention_daily_bars:    String(c.retention?.daily_bars    ?? ''),
    retention_intraday_bars: String(c.retention?.intraday_bars ?? ''),

    hedging_auto_suggest:              c.hedging?.auto_suggest              ?? false,
    hedging_min_position_volume:       String(c.hedging?.min_position_volume       ?? ''),
    hedging_suggestion_expiry_minutes: String(c.hedging?.suggestion_expiry_minutes ?? ''),
  };
}

function formatInterval(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 60   && seconds % 60   === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

function isValidHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function NexDayPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  // ── live service health (§ G1) + recent-changes refresh (§ G2) ──
  const { health, loading: healthLoading, error: healthError } = useServiceHealth('nexrisk');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const [initial,      setInitial]      = useState<NexdayConfig | null>(null);
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
        if (!nexrisk.nexday) {
          setLoadError('The nexrisk config is missing the "nexday" subsection. Check the backend defaults.');
        } else {
          setInitial(nexrisk.nexday);
          setDraft(draftFromConfig(nexrisk.nexday));
        }
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'nexrisk');
          setNexriskLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load NexDay configuration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── dirty check ─────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!initial) return false;

    if (draft.enabled    !== (initial.enabled    ?? false)) return true;
    if (draft.api_server !== (initial.api_server ?? ''))    return true;
    if (draft.license_id !== '')                            return true;  // secret typed

    const p = initial.polling;
    if (draft.polling_intraday_enabled          !== (p?.intraday_enabled          ?? false)) return true;
    if (draft.polling_intraday_interval_minutes !== String(p?.intraday_interval_minutes ?? '')) return true;
    if (draft.polling_daily_enabled             !== (p?.daily_enabled             ?? false)) return true;
    if (draft.polling_daily_time_et             !== (p?.daily_time_et             ?? ''))    return true;

    const r = initial.retention;
    if (draft.retention_daily_bars    !== String(r?.daily_bars    ?? '')) return true;
    if (draft.retention_intraday_bars !== String(r?.intraday_bars ?? '')) return true;

    const h = initial.hedging;
    if (draft.hedging_auto_suggest              !== (h?.auto_suggest              ?? false)) return true;
    if (draft.hedging_min_position_volume       !== String(h?.min_position_volume       ?? '')) return true;
    if (draft.hedging_suggestion_expiry_minutes !== String(h?.suggestion_expiry_minutes ?? '')) return true;

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

    // ── Validate ────────────────────────────────────────────────
    const apiServer = draft.api_server.trim();
    if (apiServer === '') { setSaveError('API server is required'); return; }
    if (!(apiServer.startsWith('http://') || apiServer.startsWith('https://'))) {
      setSaveError('API server must start with http:// or https://'); return;
    }

    const intradayMin = Number(draft.polling_intraday_interval_minutes);
    if (draft.polling_intraday_interval_minutes === '' || !Number.isInteger(intradayMin) || intradayMin <= 0) {
      setSaveError('Intraday interval must be a positive integer (minutes)'); return;
    }

    const dailyTime = draft.polling_daily_time_et.trim();
    if (dailyTime === '' || !isValidHHMM(dailyTime)) {
      setSaveError('Daily time must be in HH:MM format (e.g. 17:01)'); return;
    }

    const dailyBars = Number(draft.retention_daily_bars);
    if (draft.retention_daily_bars === '' || !Number.isInteger(dailyBars) || dailyBars <= 0) {
      setSaveError('Daily bars retained must be a positive integer'); return;
    }
    const intradayBars = Number(draft.retention_intraday_bars);
    if (draft.retention_intraday_bars === '' || !Number.isInteger(intradayBars) || intradayBars <= 0) {
      setSaveError('Intraday bars retained must be a positive integer'); return;
    }

    const minVol = Number(draft.hedging_min_position_volume);
    if (draft.hedging_min_position_volume === '' || !Number.isFinite(minVol) || minVol <= 0) {
      setSaveError('Minimum position volume must be a positive number (decimals allowed)'); return;
    }
    const expiryMin = Number(draft.hedging_suggestion_expiry_minutes);
    if (draft.hedging_suggestion_expiry_minutes === '' || !Number.isInteger(expiryMin) || expiryMin <= 0) {
      setSaveError('Suggestion expiry must be a positive integer (minutes)'); return;
    }

    // ── Build nested body ───────────────────────────────────────
    const body: NexdayUpdateBody = {
      enabled:    draft.enabled,
      api_server: apiServer,
      polling: {
        intraday_enabled:          draft.polling_intraday_enabled,
        intraday_interval_minutes: intradayMin,
        daily_enabled:             draft.polling_daily_enabled,
        daily_time_et:             dailyTime,
      },
      retention: {
        daily_bars:    dailyBars,
        intraday_bars: intradayBars,
      },
      hedging: {
        auto_suggest:              draft.hedging_auto_suggest,
        min_position_volume:       minVol,
        suggestion_expiry_minutes: expiryMin,
      },
    };
    if (draft.license_id !== '') {
      body.license_id = draft.license_id;
    }

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.nexrisk.updateNexday(body);

      const fresh = await settingsApi.nexrisk.get();
      if (fresh.nexday) {
        setInitial(fresh.nexday);
        setDraft(draftFromConfig(fresh.nexday));
        setHistoryRefresh(k => k + 1);
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
        <span>NexDay integration</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            NexDay integration
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Daily bars, intraday market data, and hedging suggestions. Changes persist to
            <span className="font-mono text-text-secondary"> config/nexrisk_config.json</span>
            {' '}and take effect on next service start. Restart semantics are mixed — some
            fields apply live, others need <span className="font-mono">nexrisk_service</span> restart.
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
              Twelve fields grouped into four sections. Blank license ID leaves the current value untouched.
            </p>
          </div>

          <div className="px-5 pt-3 pb-1">

            {/* ── CONNECTION ── */}
            <SectionHeader label="Connection" />

            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">NexDay enabled</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  When off, the service stops all NexDay polling and hedging suggestions. Stored config preserved.
                </div>
              </div>
              <Toggle
                on={draft.enabled}
                onChange={v => setField('enabled', v)}
                disabled={loading}
              />
            </div>

            <Field
              label="API server"
              value={draft.api_server}
              onChange={v => setField('api_server', v)}
              placeholder={loading ? 'Loading…' : 'http://175.110.113.174:8080'}
              helper="Upstream NexDay API server URL. Must start with http:// or https://"
              disabled={loading}
            />
            <Field
              label="License ID"
              secret
              type="password"
              value={draft.license_id}
              onChange={v => setField('license_id', v)}
              placeholder="Leave blank to keep current value"
              helper="Stored encrypted. Current value is masked on read — blank means unchanged."
              disabled={loading}
            />

            {/* ── POLLING ── */}
            <SectionHeader label="Polling" />

            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Intraday polling</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  Fetch intraday bars on an interval throughout the trading day.
                </div>
              </div>
              <Toggle
                on={draft.polling_intraday_enabled}
                onChange={v => setField('polling_intraday_enabled', v)}
                disabled={loading}
              />
            </div>

            <Field
              label="Intraday interval (minutes)"
              value={draft.polling_intraday_interval_minutes}
              onChange={v => setField('polling_intraday_interval_minutes', v)}
              placeholder={loading ? 'Loading…' : '15'}
              helper={
                Number.isInteger(Number(draft.polling_intraday_interval_minutes)) &&
                Number(draft.polling_intraday_interval_minutes) > 0
                  ? `How often to pull intraday bars · currently every ${formatInterval(Number(draft.polling_intraday_interval_minutes) * 60)}`
                  : 'How often to pull intraday bars (positive integer)'
              }
              disabled={loading || !draft.polling_intraday_enabled}
            />

            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Daily polling</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  Fetch the closing daily bar once per day at a fixed time.
                </div>
              </div>
              <Toggle
                on={draft.polling_daily_enabled}
                onChange={v => setField('polling_daily_enabled', v)}
                disabled={loading}
              />
            </div>

            <Field
              label="Daily poll time (ET)"
              value={draft.polling_daily_time_et}
              onChange={v => setField('polling_daily_time_et', v)}
              placeholder={loading ? 'Loading…' : '17:01'}
              helper="HH:MM in US Eastern Time. Daily bars are pulled shortly after US market close (17:00 ET)."
              disabled={loading || !draft.polling_daily_enabled}
            />

            {/* ── RETENTION ── */}
            <SectionHeader label="Retention" />

            <Field
              label="Daily bars retained"
              value={draft.retention_daily_bars}
              onChange={v => setField('retention_daily_bars', v)}
              placeholder={loading ? 'Loading…' : '100'}
              helper="Number of historical daily bars to keep in memory per symbol"
              disabled={loading}
            />
            <Field
              label="Intraday bars retained"
              value={draft.retention_intraday_bars}
              onChange={v => setField('retention_intraday_bars', v)}
              placeholder={loading ? 'Loading…' : '12'}
              helper="Number of recent intraday bars to keep in memory per symbol"
              disabled={loading}
            />

            {/* ── HEDGING ── */}
            <SectionHeader label="Hedging" />

            <div className="flex items-start justify-between gap-3 pb-3.5 mb-3.5">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text-secondary">Auto-suggest hedges</div>
                <div className="text-[11.5px] text-text-muted leading-snug mt-0.5">
                  Surface hedging suggestions based on NexDay's market signals. Does not execute automatically.
                </div>
              </div>
              <Toggle
                on={draft.hedging_auto_suggest}
                onChange={v => setField('hedging_auto_suggest', v)}
                disabled={loading}
              />
            </div>

            <Field
              label="Minimum position volume (lots)"
              value={draft.hedging_min_position_volume}
              onChange={v => setField('hedging_min_position_volume', v)}
              placeholder={loading ? 'Loading…' : '0.01'}
              helper="Positions below this size don't trigger hedging suggestions. Decimals allowed."
              disabled={loading || !draft.hedging_auto_suggest}
            />
            <Field
              label="Suggestion expiry (minutes)"
              value={draft.hedging_suggestion_expiry_minutes}
              onChange={v => setField('hedging_suggestion_expiry_minutes', v)}
              placeholder={loading ? 'Loading…' : '60'}
              helper="How long a suggestion stays actionable before it's auto-dismissed"
              disabled={loading || !draft.hedging_auto_suggest}
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
              {' '}after saving (mixed — some fields apply live)
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

          {/* Integration summary */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Integration summary</h2>
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
                label="Intraday poll"
                value={
                  !draft.polling_intraday_enabled
                    ? 'Off'
                    : Number.isInteger(Number(draft.polling_intraday_interval_minutes)) && Number(draft.polling_intraday_interval_minutes) > 0
                      ? `every ${draft.polling_intraday_interval_minutes} min`
                      : '—'
                }
                tone={!draft.polling_intraday_enabled ? 'warn' : undefined}
              />
              <SummaryItem
                label="Daily poll"
                value={
                  !draft.polling_daily_enabled
                    ? 'Off'
                    : draft.polling_daily_time_et && isValidHHMM(draft.polling_daily_time_et)
                      ? `at ${draft.polling_daily_time_et} ET`
                      : '—'
                }
                tone={!draft.polling_daily_enabled ? 'warn' : undefined}
              />
              <SummaryItem
                label="Bars retained"
                value={
                  draft.retention_daily_bars && draft.retention_intraday_bars
                    ? `${draft.retention_daily_bars} daily · ${draft.retention_intraday_bars} intraday`
                    : '—'
                }
              />
              <SummaryItem
                label="Hedging suggestions"
                value={
                  !draft.hedging_auto_suggest
                    ? 'Off'
                    : draft.hedging_min_position_volume && draft.hedging_suggestion_expiry_minutes
                      ? `≥ ${draft.hedging_min_position_volume} lots · expires ${draft.hedging_suggestion_expiry_minutes} min`
                      : 'On'
                }
                tone={!draft.hedging_auto_suggest ? 'warn' : undefined}
              />
              <div className="col-span-2">
                <SummaryItem label="Upstream" value={draft.api_server || '—'} truncate />
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
            <RecentChangesPanel section="nexrisk" subsections={['nexday']} refreshKey={historyRefresh} />
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
              <ServiceField label="Process"     value="nexrisk_service" mono />
              <ServiceHealthRows health={health} loading={healthLoading} error={healthError} />
              <ServiceField label="Config file" value="config/nexrisk_config.json" mono small />
              <ServiceField label="Log dir"     value={nexriskLogDir ?? '—'} mono small />
            </div>
          </div>

        </div>
      </div>

      <HelpDrawer
        open={help.isOpen}
        title="NexDay integration"
        content={helpContent}
        onClose={help.close}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

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

/** Pill-style boolean toggle. No opacity/alpha — both states fully solid. */
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
      )}
    </div>
  );
}

export default NexDayPage;