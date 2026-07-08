// ============================================
// Auth & session — settings sub-page
// Route: /settings/auth
// Reads/writes nexrisk_config.json's `auth` subsection via
// settingsApi.nexrisk.get() / .updateAuth()
//
// Layout: 40/60 split mirroring GatewayPage
//   Left  — Configuration form (6 fields: 1 string, 4 TTL integers, 1 length)
//   Right — Policy preview · Recent changes · Service
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/02-auth-session.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';
import {
  settingsApi,
  type AuthConfig,
  type LogServiceDescriptor,
} from '@/services/api';
import { useServiceHealth, ServiceHealthRows, RecentChangesPanel } from './SettingsSidePanels';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Form state — numerics held as strings so the inputs don't coerce empties
// back to 0. Parsed and validated at submit time.
// ─────────────────────────────────────────────────────────────────────────────

interface DraftState {
  totp_issuer:                string;
  access_token_ttl_seconds:   string;
  refresh_token_ttl_seconds:  string;
  invite_token_ttl_seconds:   string;
  password_min_length:        string;
  password_reset_ttl_seconds: string;
}

const EMPTY_DRAFT: DraftState = {
  totp_issuer: '', access_token_ttl_seconds: '', refresh_token_ttl_seconds: '',
  invite_token_ttl_seconds: '', password_min_length: '', password_reset_ttl_seconds: '',
};

function draftFromConfig(c: AuthConfig): DraftState {
  return {
    totp_issuer:                c.totp_issuer                ?? '',
    access_token_ttl_seconds:   String(c.access_token_ttl_seconds   ?? ''),
    refresh_token_ttl_seconds:  String(c.refresh_token_ttl_seconds  ?? ''),
    invite_token_ttl_seconds:   String(c.invite_token_ttl_seconds   ?? ''),
    password_min_length:        String(c.password_min_length        ?? ''),
    password_reset_ttl_seconds: String(c.password_reset_ttl_seconds ?? ''),
  };
}

/** Render a TTL in the most compact sensible unit. */
function formatTTL(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} d`;
  if (seconds >= 3600  && seconds % 3600  === 0) return `${seconds / 3600} h`;
  if (seconds >= 60    && seconds % 60    === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

/** Parse a TTL input and return [value, error]. Empty/non-integer/non-positive → error. */
function parseTTL(raw: string, label: string): [number, null] | [null, string] {
  const trimmed = raw.trim();
  if (trimmed === '') return [null, `${label} is required`];
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return [null, `${label} must be an integer`];
  if (n <= 0)                                      return [null, `${label} must be positive`];
  return [n, null];
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function AuthSessionPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const help = useHelp();

  // ── live service health (§ G1) + recent-changes refresh (§ G2) ──
  const { health, loading: healthLoading, error: healthError } = useServiceHealth('nexrisk');
  const [historyRefresh, setHistoryRefresh] = useState(0);

  // ── remote state ─────────────────────────────────────────────────
  const [initial,      setInitial]      = useState<AuthConfig | null>(null);
  const [draft,        setDraft]        = useState<DraftState>(EMPTY_DRAFT);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const [nexriskLogDir, setNexriskLogDir] = useState<string | null>(null);

  // ── initial load ─────────────────────────────────────────────────
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
        if (!nexrisk.auth) {
          setLoadError('The nexrisk config is missing the "auth" subsection. Check the backend defaults.');
        } else {
          setInitial(nexrisk.auth);
          setDraft(draftFromConfig(nexrisk.auth));
        }
        if (logsResp) {
          const svc = logsResp.services.find((s: LogServiceDescriptor) => s.id === 'nexrisk');
          setNexriskLogDir(svc?.log_dir ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load auth configuration');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  // ── dirty check ──────────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!initial) return false;
    if (draft.totp_issuer                !== (initial.totp_issuer                ?? '')) return true;
    if (draft.access_token_ttl_seconds   !== String(initial.access_token_ttl_seconds   ?? '')) return true;
    if (draft.refresh_token_ttl_seconds  !== String(initial.refresh_token_ttl_seconds  ?? '')) return true;
    if (draft.invite_token_ttl_seconds   !== String(initial.invite_token_ttl_seconds   ?? '')) return true;
    if (draft.password_min_length        !== String(initial.password_min_length        ?? '')) return true;
    if (draft.password_reset_ttl_seconds !== String(initial.password_reset_ttl_seconds ?? '')) return true;
    return false;
  }, [draft, initial]);

  // ── handlers ─────────────────────────────────────────────────────
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

    // Validate all fields before hitting the network. The backend enforces
    // authoritative ranges via field_metadata.json — here we only catch
    // type/shape errors early.
    const issuer = draft.totp_issuer.trim();
    if (issuer === '') { setSaveError('TOTP issuer is required'); return; }

    const [accessTTL, e1] = parseTTL(draft.access_token_ttl_seconds,   'Access token TTL');
    if (e1) { setSaveError(e1); return; }
    const [refreshTTL, e2] = parseTTL(draft.refresh_token_ttl_seconds, 'Refresh token TTL');
    if (e2) { setSaveError(e2); return; }
    const [inviteTTL, e3] = parseTTL(draft.invite_token_ttl_seconds,   'Invite token TTL');
    if (e3) { setSaveError(e3); return; }
    const [resetTTL, e4] = parseTTL(draft.password_reset_ttl_seconds,  'Password reset TTL');
    if (e4) { setSaveError(e4); return; }

    const pwdMinRaw = draft.password_min_length.trim();
    const pwdMin = Number(pwdMinRaw);
    if (pwdMinRaw === '' || !Number.isInteger(pwdMin) || pwdMin <= 0) {
      setSaveError('Password minimum length must be a positive integer');
      return;
    }

    // /nexrisk/auth replaces the whole subsection — send all fields.
    const body: AuthConfig = {
      totp_issuer:                issuer,
      access_token_ttl_seconds:   accessTTL!,
      refresh_token_ttl_seconds:  refreshTTL!,
      invite_token_ttl_seconds:   inviteTTL!,
      password_min_length:        pwdMin,
      password_reset_ttl_seconds: resetTTL!,
    };

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      const res = await settingsApi.nexrisk.updateAuth(body);

      // Re-fetch for the canonical persisted state and a clean diff baseline.
      const fresh = await settingsApi.nexrisk.get();
      if (fresh.auth) {
        setInitial(fresh.auth);
        setDraft(draftFromConfig(fresh.auth));
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Auth &amp; session</span>
      </div>

      {/* Page header */}
      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Auth &amp; session
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Token lifetimes, TOTP issuer, and password policy. Changes persist to
            <span className="font-mono text-text-secondary"> config/nexrisk_config.json</span>
            {' '}and take effect on next service start. Secrets (JWT, encryption key) are not
            managed here — see Secret rotation.
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
              Six fields. TTLs are integers in seconds; the helper beside each shows the human equivalent.
            </p>
          </div>

          <div className="px-5 pt-4 pb-1">
            <Field
              label="TOTP issuer"
              value={draft.totp_issuer}
              onChange={v => setField('totp_issuer', v)}
              placeholder={loading ? 'Loading…' : 'NexRisk'}
              helper="Name shown in authenticator apps (e.g. Google Authenticator, 1Password)"
              disabled={loading}
            />
            <TTLField
              label="Access token TTL"
              value={draft.access_token_ttl_seconds}
              onChange={v => setField('access_token_ttl_seconds', v)}
              placeholder={loading ? 'Loading…' : '900'}
              helperBase="Lifetime of a session's access token before a refresh is required"
              disabled={loading}
            />
            <TTLField
              label="Refresh token TTL"
              value={draft.refresh_token_ttl_seconds}
              onChange={v => setField('refresh_token_ttl_seconds', v)}
              placeholder={loading ? 'Loading…' : '28800'}
              helperBase="Maximum session duration before the user must log in again"
              disabled={loading}
            />
            <TTLField
              label="Invite token TTL"
              value={draft.invite_token_ttl_seconds}
              onChange={v => setField('invite_token_ttl_seconds', v)}
              placeholder={loading ? 'Loading…' : '86400'}
              helperBase="How long an emailed invite link stays valid before it expires"
              disabled={loading}
            />
            <TTLField
              label="Password reset TTL"
              value={draft.password_reset_ttl_seconds}
              onChange={v => setField('password_reset_ttl_seconds', v)}
              placeholder={loading ? 'Loading…' : '3600'}
              helperBase="How long a password reset link stays valid after it's sent"
              disabled={loading}
            />
            <Field
              label="Password minimum length"
              value={draft.password_min_length}
              onChange={v => setField('password_min_length', v)}
              placeholder={loading ? 'Loading…' : '10'}
              helper="Minimum character count for new passwords. Does not retroactively invalidate existing ones."
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

          {/* Policy preview */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Policy preview</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Current form values translated into human terms. Updates live as you edit.
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <PolicyItem label="Access token" value={formatTTL(Number(draft.access_token_ttl_seconds))} />
              <PolicyItem label="Max session"  value={formatTTL(Number(draft.refresh_token_ttl_seconds))} />
              <PolicyItem label="Invite valid for"  value={formatTTL(Number(draft.invite_token_ttl_seconds))} />
              <PolicyItem label="Reset link valid for" value={formatTTL(Number(draft.password_reset_ttl_seconds))} />
              <PolicyItem label="Password minimum"   value={draft.password_min_length ? `${draft.password_min_length} characters` : '—'} />
              <PolicyItem label="TOTP issuer"  value={draft.totp_issuer || '—'} />
            </div>
          </div>

          {/* Recent changes (§ G2) */}
          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Recent changes</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Last edits to this subsection, drawn from the audit log
              </p>
            </div>
            <RecentChangesPanel section="nexrisk" subsections={['auth']} refreshKey={historyRefresh} />
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
      title="Auth & session"
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
  disabled?:    boolean;
}

function Field({ label, value, onChange, placeholder, helper, disabled }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[13px] font-medium text-text-secondary">{label}</label>
      <input
        type="text"
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

/** TTL field with a live "= X h" suffix appended to the helper text. */
interface TTLFieldProps {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  helperBase:  string;
  disabled?:   boolean;
}

function TTLField({ label, value, onChange, placeholder, helperBase, disabled }: TTLFieldProps) {
  const n        = Number(value);
  const parsed   = Number.isInteger(n) && n > 0;
  const humanTTL = parsed ? formatTTL(n) : null;
  const helper   = humanTTL ? `${helperBase} · currently ${humanTTL}` : helperBase;

  return <Field label={label} value={value} onChange={onChange} placeholder={placeholder} helper={helper} disabled={disabled} />;
}

function PolicyItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className="text-[13px] font-mono text-text-primary">{value}</span>
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

export default AuthSessionPage;