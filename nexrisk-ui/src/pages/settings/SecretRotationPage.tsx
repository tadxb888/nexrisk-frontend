// ============================================
// Secret rotation — settings sub-page
// Route: /settings/rotation
// Root role only.
//
// Two in-app rotatable secrets, each with its own modal:
//   Internal secret   — POST /auth/rotate/internal-secret   (live)
//   JWT secret        — POST /auth/rotate/jwt-secret        (live)
//
// Two at-rest encryption keys are NOT rotated in-app. Rotating either re-encrypts
// every stored ciphertext (an O(n) DB migration) and is performed OFFLINE with the
// controlled nxr_secret_rotation tool during a maintenance window, after a full DB
// backup. This page only shows guidance + "contact Taiga Support" for those:
//   NEXRISK_ENCRYPTION_KEY  — user TOTP secrets + MT5 node passwords
//   NEXRISK_LP_MASTER_KEY   — LP credentials (trading / market-data passwords)
//
// Layout: 60/40. Left column stacks the two rotation cards + two offline-key cards.
// Right column: hard-copy rotation policy + service panel.
//
// Rotation UX (the hard part):
//   1. Click "Rotate" → modal opens with warning + typed-confirmation input
//   2. User types the exact confirmation phrase → rotate button enables
//   3. POST fires, response returns once — new_secret is shown in a
//      copy-once display. Closing the modal discards the plaintext.
//      There is no retrieve-again endpoint.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  settingsApi,
  type RotateInternalResponse,
  type RotateJwtResponse,
} from '@/services/api';

// Help content for the operator manual — rendered in the help drawer
import helpContent from './help/07-secret-rotation.md?raw';
import { HelpIcon, HelpDrawer, useHelp } from './help';

// ─────────────────────────────────────────────────────────────────────────────
// Hard-copy policy strings — single source of truth
// ─────────────────────────────────────────────────────────────────────────────

type SecretKind = 'internal' | 'jwt';

interface SecretSpec {
  kind:             SecretKind;
  title:            string;
  envVar:           string;
  confirmPhrase:    string;       // UI-enforced typed confirmation
  restartTag:       string;       // what has to restart
  summary:          string;       // one-line "what is it"
  consequences:     string[];     // bullets shown in the modal warning box
  available:        boolean;      // false for endpoints that return 501
}

const SECRETS: Record<SecretKind, SecretSpec> = {
  internal: {
    kind:          'internal',
    title:         'Internal secret',
    envVar:        'NEXRISK_INTERNAL_SECRET',
    confirmPhrase: 'ROTATE',
    restartTag:    'nexrisk_service + bff',
    summary:
      'Shared secret used by the BFF to authenticate with the C++ backend on every request ' +
      '(X-Internal-Secret header). Both sides must match for the link to work.',
    consequences: [
      'A fresh 96-hex-character value will be generated and shown once.',
      'The new value must be written to NEXRISK_INTERNAL_SECRET in BOTH the BFF environment AND the nexrisk_service environment.',
      'Restart both processes after updating — the BFF first, then nexrisk_service.',
      'If the BFF is restarted with the old value, every BFF→backend call will fail with 401 until it catches up.',
    ],
    available: true,
  },
  jwt: {
    kind:          'jwt',
    title:         'JWT secret',
    envVar:        'NEXRISK_JWT_SECRET',
    confirmPhrase: 'ROTATE',
    restartTag:    'nexrisk_service',
    summary:
      'Signing key for access and refresh tokens. Rotating invalidates all outstanding access ' +
      'tokens on restart. Refresh tokens remain usable until they expire naturally.',
    consequences: [
      'A fresh 128-hex-character value will be generated and shown once.',
      'The new value must be written to NEXRISK_JWT_SECRET in the nexrisk_service environment.',
      'After restart, all active sessions will be forced to re-authenticate once their access tokens expire.',
      'Refresh tokens continue to work, so most users will not notice unless they are actively in the middle of a request.',
    ],
    available: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// At-rest encryption keys — NOT rotated in-app. These re-encrypt every stored
// ciphertext (O(n) DB migration) and are rotated OFFLINE with the controlled
// nxr_secret_rotation tool during a maintenance window, after a full DB backup.
// The two keys are independent, with different scopes and formats.
// ─────────────────────────────────────────────────────────────────────────────

interface OfflineKeySpec {
  title:  string;
  envVar: string;
  format: string;   // key format the operator supplies
  scope:  string;   // what it encrypts (corrected copy)
  note?:  string;   // extra operational caveat
}

const OFFLINE_KEYS: OfflineKeySpec[] = [
  {
    title:  'Encryption key',
    envVar: 'NEXRISK_ENCRYPTION_KEY',
    format: 'passphrase',
    scope:
      'At-rest key for user TOTP secrets and MT5 node passwords. Rotating re-encrypts ' +
      'every stored ciphertext with a new key — an O(n) migration over the database, ' +
      'not a config change.',
  },
  {
    title:  'LP master key',
    envVar: 'NEXRISK_LP_MASTER_KEY',
    format: 'raw 64-hex key',
    scope:
      'At-rest key for LP credentials (trading and market-data passwords). Rotating ' +
      're-encrypts every LP credential record — an O(n) migration, not a config change.',
    note:
      'This key must be set for LP encryption to work at all — there is no default. ' +
      'If it is unset, LP credentials cannot be stored.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

type OpenModal =
  | { kind: SecretKind }
  | null;

export function SecretRotationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Root-only — stricter than the other sub-pages (SETTINGS_PAGE_ROLES set)
  if (user && user.role !== 'root') {
    return <Navigate to="/settings" replace />;
  }

  const help = useHelp();
  const [openModal, setOpenModal] = useState<OpenModal>(null);

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Secret rotation</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Secret rotation
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Generate fresh cryptographic material for the BFF→backend internal link and the JWT
            signing key. Values are returned{' '}
            <span className="text-text-primary font-medium">exactly once</span> — not saved to
            disk, not retrievable again — and every rotation ends with you updating an environment
            variable and restarting a service. The at-rest encryption keys are handled differently:
            they are rotated offline during a maintenance window (see below).
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
            style={{ background: '#2c1417', color: '#ff9999', border: '1px solid #7a2f36' }}
          >
            root only
          </span>
          <HelpIcon onClick={help.open} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[60fr_40fr] gap-3.5 items-start">

        {/* ─── LEFT: ROTATION CARDS ─── */}
        <div className="flex flex-col gap-3.5">
          {(['internal', 'jwt'] as const).map(kind => (
            <RotationCard
              key={kind}
              spec={SECRETS[kind]}
              onRotate={() => setOpenModal({ kind })}
            />
          ))}
          {OFFLINE_KEYS.map(spec => (
            <OfflineKeyCard key={spec.envVar} spec={spec} />
          ))}
        </div>

        {/* ─── RIGHT: POLICY + SERVICE ─── */}
        <div className="flex flex-col gap-3.5">

          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Operator checklist</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Before you click Rotate, these should be true
              </p>
            </div>
            <div className="px-5 py-3.5">
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {[
                  'A password manager or encrypted vault is open and ready to receive the new secret.',
                  'You have SSH access to the host and can edit the service environment files.',
                  'The service restart has been coordinated with anyone on the desk — rotating the JWT secret mid-session forces re-auth.',
                  'The previous secret is archived in case a roll-back is needed (within the same service lifecycle, before restart).',
                  'For an encryption-key rotation: a full database backup has been taken beforehand.',
                  'For an encryption-key rotation: the affected service will be stopped during the migration (nexrisk_service for core, fixbridge_service for LP).',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-text-secondary leading-snug">
                    <span
                      className="shrink-0 rounded-full mt-1"
                      style={{ width: 6, height: 6, background: '#c9b87c' }}
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="bg-surface border border-border rounded overflow-hidden">
            <div className="px-5 pt-3.5 pb-2.5 border-b border-border">
              <h2 className="text-base font-medium text-text-primary m-0">Last rotation</h2>
              <p className="text-xs text-text-muted leading-snug m-0 mt-0.5">
                Timestamps and audit data require backend support
              </p>
            </div>
            <div className="px-5 py-3.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              <ServiceField label="Internal secret"  value="—" mono tone="muted" note="no GET endpoint" />
              <ServiceField label="JWT secret"       value="—" mono tone="muted" note="no GET endpoint" />
              <ServiceField label="Encryption key"   value="—" mono tone="muted" note="offline / vendor tool" />
              <ServiceField label="LP master key"    value="—" mono tone="muted" note="offline / vendor tool" />
              <ServiceField label="Audit log"        value="—" mono tone="muted" note="pending integration" />
            </div>
          </div>

        </div>
      </div>

      {openModal && (
        <RotationModal
          spec={SECRETS[openModal.kind]}
          onClose={() => setOpenModal(null)}
        />
      )}

      <HelpDrawer
        open={help.isOpen}
        title="Secret rotation"
        content={helpContent}
        onClose={help.close}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RotationCard — one per secret. Keep it compact, let the modal carry weight.
// ─────────────────────────────────────────────────────────────────────────────

function RotationCard({ spec, onRotate }: { spec: SecretSpec; onRotate: () => void }) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-text-primary m-0">{spec.title}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="font-mono text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: '#1a1a1d', color: '#b6babf', border: '1px solid #44454f' }}
            >
              {spec.envVar}
            </span>
            <span
              className="font-mono text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
            >
              restart: {spec.restartTag}
            </span>
            {!spec.available && (
              <span
                className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: '#18202a', color: '#5b86b8', border: '1px solid #2b3e57' }}
              >
                501 stub
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5">
        <p className="text-[13px] text-text-secondary leading-snug m-0">{spec.summary}</p>
      </div>

      <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3">
        <span className="text-[11.5px] text-text-muted leading-tight">
          Confirmation phrase: <span className="font-mono">{spec.confirmPhrase}</span>
        </span>
        <button
          type="button"
          onClick={onRotate}
          className={clsx(
            'px-3.5 py-1.5 rounded border text-sm font-medium cursor-pointer transition-colors',
          )}
          style={{
            background:  '#2c1417',
            borderColor: '#7a2f36',
            color:       '#ff9999',
          }}
        >
          Rotate {spec.title.toLowerCase()}…
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OfflineKeyCard — at-rest encryption keys. NOT a click-to-run action: these are
// rotated offline with the controlled nxr_secret_rotation tool during a
// maintenance window. The card is purely informational + guidance to support.
// ─────────────────────────────────────────────────────────────────────────────

function OfflineKeyCard({ spec }: { spec: OfflineKeySpec }) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="px-5 pt-3.5 pb-2.5 border-b border-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium text-text-primary m-0">{spec.title}</h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="font-mono text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: '#1a1a1d', color: '#b6babf', border: '1px solid #44454f' }}
            >
              {spec.envVar}
            </span>
            <span
              className="font-mono text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: '#1a1a1d', color: '#b6babf', border: '1px solid #44454f' }}
            >
              {spec.format}
            </span>
            <span
              className="font-mono text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: '#18202a', color: '#5b86b8', border: '1px solid #2b3e57' }}
            >
              offline rotation
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5 flex flex-col gap-2.5">
        <p className="text-[13px] text-text-secondary leading-snug m-0">{spec.scope}</p>
        {spec.note && (
          <div className="rounded p-2.5" style={{ background: '#2a2016', border: '1px solid #6a4a2f' }}>
            <p className="text-[12px] m-0 leading-snug" style={{ color: '#e09a55' }}>{spec.note}</p>
          </div>
        )}
      </div>

      {/* Guidance — not a click-to-run action */}
      <div className="px-5 py-3 border-t border-border">
        <div className="rounded p-3" style={{ background: '#18202a', border: '1px solid #2b3e57' }}>
          <p className="text-[12.5px] m-0 leading-snug" style={{ color: '#9fb8d8' }}>
            This rotation is an offline, maintenance-window operation — not a click-to-run
            action. It is performed with the controlled{' '}
            <span className="font-mono">nxr_secret_rotation</span> tool, after a full database
            backup, with the affected service stopped. The tool is not shipped to the deployment.
            Contact <span className="text-text-primary font-medium">Taiga Support</span> to obtain
            it and coordinate the rotation.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RotationModal — shared shell, four internal phases.
// ─────────────────────────────────────────────────────────────────────────────

type Phase =
  | { t: 'confirm' }
  | { t: 'rotating' }
  | { t: 'rotate_error'; error: string }
  | { t: 'reveal'; newSecret: string;
      restart: string[]; message: string; invalidatesSessions?: boolean };

function RotationModal({ spec, onClose }: { spec: SecretSpec; onClose: () => void }) {
  const [phase,   setPhase]   = useState<Phase>({ t: 'confirm' });
  const [typed,   setTyped]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the typed-confirmation input when confirm phase renders
  useEffect(() => {
    if (phase.t === 'confirm') {
      inputRef.current?.focus();
    }
  }, [phase.t]);

  // Esc closes — but only in non-reveal phases (reveal requires explicit Done
  // click to prevent accidental plaintext loss).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase.t !== 'reveal' && phase.t !== 'rotating') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase.t, onClose]);

  const canRotate =
    phase.t === 'confirm' &&
    typed === spec.confirmPhrase &&
    spec.available;

  async function handleRotate() {
    setPhase({ t: 'rotating' });
    try {
      if (spec.kind === 'internal') {
        const r: RotateInternalResponse = await settingsApi.rotation.rotateInternalSecret();
        setPhase({
          t: 'reveal',
          newSecret: r.new_secret,
          restart:   r.restart_required ?? [],
          message:   r.message,
        });
      } else {
        const r: RotateJwtResponse = await settingsApi.rotation.rotateJwtSecret();
        setPhase({
          t: 'reveal',
          newSecret:            r.new_secret,
          restart:              r.restart_required ?? [],
          message:              r.message,
          invalidatesSessions:  r.invalidates_sessions,
        });
      }
    } catch (err) {
      setPhase({
        t: 'rotate_error',
        error: err instanceof Error ? err.message : 'Rotation failed',
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(10, 10, 12, 0.82)' }}
    >
      <div
        className="bg-surface border border-border rounded overflow-hidden"
        style={{ width: 520, maxWidth: '92vw', maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-text-primary m-0">
              {phase.t === 'reveal' ? `New ${spec.title.toLowerCase()}` : `Rotate ${spec.title.toLowerCase()}`}
            </h2>
            <p className="text-xs text-text-muted m-0 mt-0.5 font-mono">{spec.envVar}</p>
          </div>
          {phase.t !== 'reveal' && phase.t !== 'rotating' && (
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-primary text-xl leading-none cursor-pointer"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>

          {phase.t === 'confirm' && (
            <>
              {/* Consequences */}
              <div className="px-5 pt-4 pb-3">
                <div
                  className="rounded p-3"
                  style={{ background: '#2a2016', border: '1px solid #6a4a2f' }}
                >
                  <p className="text-[12.5px] font-medium m-0 mb-2" style={{ color: '#e09a55' }}>
                    Before you rotate, know this:
                  </p>
                  <ul className="m-0 pl-4 flex flex-col gap-1.5">
                    {spec.consequences.map((c, i) => (
                      <li key={i} className="text-[12.5px] text-text-secondary leading-snug">{c}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Typed confirmation */}
              <div className="px-5 pb-4">
                <label className="text-[12.5px] font-medium text-text-secondary block mb-1.5">
                  Type <span className="font-mono text-text-primary">{spec.confirmPhrase}</span> to confirm
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  placeholder={spec.confirmPhrase}
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={clsx(
                    'rounded px-3 py-2 text-[14px] font-mono w-full',
                    'text-text-primary border focus:outline-none',
                  )}
                  style={{
                    background:   '#232225',
                    borderColor:  typed === spec.confirmPhrase ? '#49b3b3' : '#44454f',
                  }}
                />
                <p className="text-[11px] text-text-muted mt-1.5 m-0">
                  Case-sensitive. Spaces matter.
                </p>
              </div>
            </>
          )}

          {phase.t === 'rotating' && (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-text-secondary m-0 font-medium">Rotating {spec.title.toLowerCase()}…</p>
              <p className="text-[11.5px] text-text-muted mt-1.5 m-0">
                Do not close this window. The new value is in flight.
              </p>
            </div>
          )}

          {phase.t === 'rotate_error' && (
            <div className="px-5 py-4 flex flex-col gap-3">
              <div
                className="rounded p-3"
                style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
              >
                <p className="text-sm font-medium m-0">Rotation failed</p>
                <p className="text-xs mt-1 text-text-secondary">{phase.error}</p>
              </div>
              <p className="text-[11.5px] text-text-muted m-0">
                Nothing was changed. You can retry or close this dialog.
              </p>
            </div>
          )}

          {phase.t === 'reveal' && (
            <RevealPanel
              secret={phase.newSecret}
              envVar={spec.envVar}
              restart={phase.restart}
              message={phase.message}
              invalidatesSessions={phase.invalidatesSessions}
            />
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-between items-center gap-3">
          {phase.t === 'reveal' ? (
            <>
              <p className="text-[11.5px] text-text-muted m-0">
                Closing this dialog permanently discards the plaintext value.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded border text-sm font-medium bg-accent border-accent text-[#0b0c0e] hover:bg-accent-hover cursor-pointer"
              >
                Done
              </button>
            </>
          ) : phase.t === 'rotating' ? (
            <span className="text-[11.5px] text-text-muted">Please wait…</span>
          ) : phase.t === 'rotate_error' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-border text-sm text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setPhase({ t: 'confirm' })}
                className="px-3.5 py-1.5 rounded border text-sm font-medium bg-accent border-accent text-[#0b0c0e] hover:bg-accent-hover cursor-pointer"
              >
                Back
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded border border-border text-sm text-text-secondary hover:bg-surface-hover cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRotate}
                disabled={!canRotate}
                className={clsx(
                  'px-4 py-1.5 rounded border text-sm font-medium',
                  canRotate ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed',
                )}
                style={{
                  background:  '#2c1417',
                  borderColor: '#7a2f36',
                  color:       '#ff9999',
                }}
              >
                Rotate now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RevealPanel — the copy-once display. The only place the plaintext exists
// in the UI. Nothing in this subtree is persisted.
// ─────────────────────────────────────────────────────────────────────────────

function RevealPanel({
  secret, envVar, restart, message, invalidatesSessions,
}: {
  secret: string; envVar: string; restart: string[];
  message: string; invalidatesSessions?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      setCopyError('Clipboard API unavailable. Select the value manually and copy.');
    }
  }

  return (
    <div className="flex flex-col">
      {/* Big fat warning */}
      <div
        className="px-5 py-3"
        style={{ background: '#2a2016', borderBottom: '1px solid #6a4a2f' }}
      >
        <p className="text-[13px] font-medium m-0" style={{ color: '#e09a55' }}>
          This value will not be shown again.
        </p>
        <p className="text-[12px] m-0 mt-1 text-text-secondary leading-snug">
          Copy it now. It is not persisted to disk, not retrievable through any endpoint,
          and not logged. Once this dialog closes, it is gone.
        </p>
      </div>

      {/* The secret */}
      <div className="px-5 py-4">
        <label className="text-[11px] font-mono uppercase tracking-wide text-text-muted block mb-1.5">
          new value — {envVar}
        </label>
        <div
          className="rounded p-3 font-mono text-[12.5px] break-all select-all"
          style={{
            background: '#1a1a1d',
            color:      '#E6E6E6',
            border:     '1px solid #44454f',
            minHeight:  60,
          }}
        >
          {secret}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={copy}
            className="px-3 py-1 rounded border text-[12.5px] font-medium bg-accent border-accent text-[#0b0c0e] hover:bg-accent-hover cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
          {copyError && (
            <span className="text-[11.5px]" style={{ color: '#ff5c5c' }}>{copyError}</span>
          )}
        </div>
      </div>

      {/* Backend hard-copy message */}
      <div className="px-5 pb-3">
        <div
          className="rounded p-3"
          style={{ background: '#18202a', border: '1px solid #2b3e57' }}
        >
          <p className="text-[12px] m-0 leading-snug" style={{ color: '#9fb8d8' }}>
            {message}
          </p>
        </div>
      </div>

      {/* Restart + side-effects */}
      <div className="px-5 pb-4">
        <div className="rounded overflow-hidden" style={{ background: '#1a1a1d', border: '1px solid #2a292c' }}>
          <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wide text-text-muted">
            After you update the env var
          </div>
          <div className="px-3 py-2.5 flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] text-text-muted w-16 shrink-0">Restart:</span>
              <span className="font-mono text-[12px]" style={{ color: '#e09a55' }}>
                {restart.length > 0 ? restart.join(', ') : '—'}
              </span>
            </div>
            {invalidatesSessions && (
              <div className="flex items-center gap-2">
                <span className="text-[11.5px] text-text-muted w-16 shrink-0">Sessions:</span>
                <span className="font-mono text-[12px]" style={{ color: '#e09a55' }}>
                  all access tokens invalidated on restart
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
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

export default SecretRotationPage;