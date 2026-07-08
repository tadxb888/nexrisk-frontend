// ============================================
// LP management (list view) — settings sub-page
// Route: /settings/lp
//
// Two concerns on one page:
//   1. Which LPs are enabled (PUT /lp/enabled writes the list)
//   2. Navigate to a specific LP's profile editor
//
// Layout: 60/40. Left is the LP table with enabled checkboxes and a single
// Save button for the enabled_lps array. Right is a short policy note + the
// Service panel.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/08-lp-management.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  type LpProfileSummary,
  type LpProfilesResponse,
  type LogServiceDescriptor,
} from '@/services/api';
import { useServiceHealth, ServiceHealthRows } from './SettingsSidePanels';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((v, i) => v === bs[i]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function LpListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  // ── live service health (§ G1). LP recent-changes is deferred until the
  //    backend audits LP writes ("G2 LP tail"), so no history panel here. ──
  const { health, loading: healthLoading, error: healthError } = useServiceHealth('fixbridge');

  const [data,    setData]    = useState<LpProfilesResponse | null>(null);
  const [draft,   setDraft]   = useState<string[]>([]);   // which lp_ids are checked in the UI
  const [loading, setLoading] = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [fixbridgeLogDir, setFixbridgeLogDir] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [profiles, logsResp] = await Promise.all([
          settingsApi.lp.listProfiles(),
          settingsApi.logs.getServices().catch(() => null),
        ]);
        if (cancelled) return;
        setData(profiles);
        setDraft([...(profiles.enabled_lps ?? [])]);
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'fixbridge');
          setFixbridgeLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load LP profiles');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  const dirty = useMemo(() => {
    if (!data) return false;
    return !sameSet(draft, data.enabled_lps ?? []);
  }, [draft, data]);

  function toggle(lp_id: string) {
    setDraft(d => d.includes(lp_id) ? d.filter(x => x !== lp_id) : [...d, lp_id]);
    setSavedMessage(null);
    setSaveError(null);
  }

  function handleRevert() {
    if (!data) return;
    setDraft([...(data.enabled_lps ?? [])]);
    setSaveError(null);
    setSavedMessage(null);
  }

  async function handleSave() {
    if (!data || !dirty || saving) return;

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.lp.updateEnabled({ enabled_lps: draft });

      const fresh = await settingsApi.lp.listProfiles();
      setData(fresh);
      setDraft([...(fresh.enabled_lps ?? [])]);

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

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>LP management</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            LP management
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Enable or disable liquidity providers for the FIX bridge session manager, and
            open the capability profile editor for any individual LP. Enablement writes
            to <span className="font-mono text-text-secondary">fixbridge_config.json</span>;
            profiles live under <span className="font-mono text-text-secondary">config/fixbridge/lp/</span>.
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
          <p className="text-sm font-medium m-0">Failed to load LP profiles</p>
          <p className="text-xs mt-1 text-text-secondary">{loadError}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[60fr_40fr] gap-3.5 items-start">

        {/* ─── LEFT: LP TABLE ─── */}
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
            <h2 className="text-base font-medium text-text-primary m-0">Liquidity providers</h2>
            <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
              {loading
                ? 'Loading…'
                : data
                  ? `${data.profiles.length} profile${data.profiles.length === 1 ? '' : 's'} configured · ${draft.length} enabled in draft`
                  : '—'}
            </p>
          </div>

          {data && data.profiles.length === 0 ? (
            <div className="px-5 py-8">
              <p className="text-xs text-text-muted m-0 text-center">
                No LP profiles configured. Profiles are capability JSON files under
                <span className="font-mono"> config/fixbridge/lp/</span>.
                Drop one in and refresh to see it here.
              </p>
            </div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {(data?.profiles ?? []).map((lp, idx) => {
                const checked = draft.includes(lp.lp_id);
                const enabledInFile = data?.enabled_lps.includes(lp.lp_id) ?? false;
                const changed = checked !== enabledInFile;
                return (
                  <li
                    key={lp.lp_id}
                    className={clsx(
                      'px-5 py-3 flex items-center gap-3',
                      'transition-colors',
                    )}
                    style={{
                      borderTop: idx === 0 ? 'none' : '1px solid #2a292c',
                      background: changed ? '#1a2220' : 'transparent',
                    }}
                  >
                    <CheckboxCell checked={checked} onChange={() => toggle(lp.lp_id)} disabled={loading || saving} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] font-medium text-text-primary truncate">
                          {lp.lp_name || lp.lp_id}
                        </span>
                        {changed && (
                          <span
                            className="text-[10px] font-mono uppercase px-1 py-0.5 rounded tracking-wide"
                            style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
                          >
                            pending
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-mono text-text-muted">
                          {lp.lp_id}
                        </span>
                        {lp.version && (
                          <span className="text-[11px] font-mono text-text-muted">
                            v{lp.version}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/settings/lp/${encodeURIComponent(lp.lp_id)}`)}
                      className="shrink-0 px-3 py-1.5 rounded border text-[12.5px] font-medium border-border text-text-secondary hover:bg-surface-hover cursor-pointer"
                    >
                      Edit profile
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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
              Enablement changes restart{' '}
              <span className="font-mono" style={{ color: '#e09a55' }}>fixbridge_service</span>
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
                {saving ? 'Saving…' : 'Save enablement'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: HELP + SERVICE ─── */}
        <div className="flex flex-col gap-3.5">

          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">About LP profiles</h2>
            </div>
            <div className="px-5 py-3.5 flex flex-col gap-2.5 text-[12.5px] text-text-secondary leading-snug">
              <p className="m-0">
                A profile is a capability JSON file that describes how the FIX bridge
                should talk to one counterparty. The session manager reads every profile
                under <span className="font-mono">config/fixbridge/lp/</span> on startup
                but only spins up sessions for the ones listed in
                <span className="font-mono"> enabled_lps</span>.
              </p>
              <p className="m-0">
                Three sub-objects —{' '}
                <span className="font-mono">connection</span>,{' '}
                <span className="font-mono">custom_fields</span>,{' '}
                <span className="font-mono">instruments</span> — are read-only in this
                editor. They're set at onboarding and shouldn't drift without a
                deliberate LP-engineering change. The editable parts cover behaviour:
                trading, market data, routing, limits, feature flags.
              </p>
              <p className="m-0">
                For operational control (start / stop / reload / test) use the
                Liquidity Providers page — that one talks to{' '}
                <span className="font-mono">/fix/admin/lp/*</span> and is the live
                session surface.
              </p>
            </div>
          </div>

          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Service</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Live process state (§ G1), refreshed periodically.
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <ServiceField label="Process"     value="fixbridge_service" mono />
              <ServiceHealthRows health={health} loading={healthLoading} error={healthError} />
              <ServiceField label="Config file" value="config/fixbridge/fixbridge_config.json" mono small />
              <ServiceField label="Profile dir" value="config/fixbridge/lp/" mono small />
              <ServiceField label="Log dir"     value={fixbridgeLogDir ?? '—'} mono small />
            </div>
          </div>

        </div>
      </div>

      <HelpDrawer
        open={help.isOpen}
        title="LP management"
        content={helpContent}
        onClose={help.close}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function CheckboxCell({
  checked, onChange, disabled,
}: {
  checked: boolean; onChange: () => void; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => !disabled && onChange()}
      disabled={disabled}
      className={clsx(
        'shrink-0 flex items-center justify-center rounded transition-colors',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
      style={{
        width:       18,
        height:      18,
        background:  checked ? '#49b3b3' : '#232225',
        border:      `1px solid ${checked ? '#49b3b3' : '#44454f'}`,
      }}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 10 10" fill="none">
          <path d="M2 5L4 7L8 3" stroke="#0b0c0e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
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

export default LpListPage;