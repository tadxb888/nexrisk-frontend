// ============================================
// LP profile editor — settings sub-page
// Route: /settings/lp/:lp_id
//
// Eight top-level sections, split into two groups:
//   Read-only (silently preserved by backend on PUT):
//     connection · custom_fields · instruments
//   Editable (replaced wholesale by what client sends):
//     trading · market_data · routes · limits · features
//
// The capability JSON schema isn't fully documented — inner shapes vary per
// LP type. Rather than invent field behaviour by guessing, each editable
// section gets a raw JSON editor with parse validation. Brief § 4 permits
// raw JSON for v1. Admins editing capability profiles know the shape.
//
// Layout: single column, wide content. Each section is a card that can
// be collapsed. Read-only sections start collapsed, editable start open.
// A single "Save profile" button at top and bottom saves all dirty
// editable sections in one PUT.
// ============================================

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate, useParams } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  settingsApi,
  LP_READONLY_SECTIONS,
  LP_EDITABLE_SECTIONS,
  type LpProfile,
  type LpReadonlySection,
  type LpEditableSection,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pretty-print a section's current value for the editor textarea.
 *  Falls back to "{}" if the value is missing entirely — gives the user
 *  something valid to edit rather than confusing them with "undefined". */
function formatSection(value: unknown): string {
  if (value === undefined || value === null) return '{}';
  return JSON.stringify(value, null, 2);
}

interface EditableDraft {
  text:  string;         // raw textarea content
  error: string | null;  // parse error if unparseable
}

function emptyDrafts(): Record<LpEditableSection, EditableDraft> {
  return {
    trading:     { text: '{}', error: null },
    market_data: { text: '{}', error: null },
    routes:      { text: '{}', error: null },
    limits:      { text: '{}', error: null },
    features:    { text: '{}', error: null },
  };
}

function draftsFromProfile(p: LpProfile): Record<LpEditableSection, EditableDraft> {
  const out = emptyDrafts();
  for (const section of LP_EDITABLE_SECTIONS) {
    out[section] = { text: formatSection(p[section]), error: null };
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_HELP: Record<LpEditableSection | LpReadonlySection, string> = {
  connection:
    'FIX endpoints, sender/target comp IDs, and session parameters. Set at onboarding; editing requires an LP-engineering change.',
  custom_fields:
    'LP-specific FIX tags (e.g. account fields, broker codes). Static per-LP.',
  instruments:
    'Instrument metadata and symbol mappings. Managed through the symbol mapping page, not here.',
  trading:
    'Trading session behaviour — order types accepted, time-in-force whitelist, execution policy.',
  market_data:
    'Depth of book, subscription style, update frequency, snapshot cadence.',
  routes:
    'Per-symbol or per-client routing rules. Controls which LP sees which flow.',
  limits:
    'Per-instrument and per-session caps: size, rate, exposure ceilings.',
  features:
    'Feature flags for optional FIX workflows — cross trades, mass cancel, quote cancel replace.',
};

export function LpProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { lp_id } = useParams<{ lp_id: string }>();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (!lp_id) {
    return <Navigate to="/settings/lp" replace />;
  }

  const [initial,      setInitial]      = useState<LpProfile | null>(null);
  const [drafts,       setDrafts]       = useState<Record<LpEditableSection, EditableDraft>>(emptyDrafts);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);

  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Per-section collapsed state — read-only collapsed by default, editable open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    connection: true, custom_fields: true, instruments: true,
    trading: false, market_data: false, routes: false, limits: false, features: false,
  });

  // ── load ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const profile = await settingsApi.lp.getProfile(lp_id!);
        if (cancelled) return;
        setInitial(profile);
        setDrafts(draftsFromProfile(profile));
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : `Failed to load profile for ${lp_id}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [lp_id]);

  // ── dirty check ─────────────────────────────────────────────────
  const { dirty, dirtySections } = useMemo(() => {
    const dirtyList: LpEditableSection[] = [];
    if (!initial) return { dirty: false, dirtySections: dirtyList };
    for (const section of LP_EDITABLE_SECTIONS) {
      const baseline = formatSection(initial[section]);
      const current  = drafts[section].text;
      if (baseline !== current) dirtyList.push(section);
    }
    return { dirty: dirtyList.length > 0, dirtySections: dirtyList };
  }, [drafts, initial]);

  const hasParseError = useMemo(
    () => LP_EDITABLE_SECTIONS.some(s => drafts[s].error !== null),
    [drafts],
  );

  function setSectionText(section: LpEditableSection, text: string) {
    let error: string | null = null;
    try {
      JSON.parse(text);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Invalid JSON';
    }
    setDrafts(d => ({ ...d, [section]: { text, error } }));
    setSavedMessage(null);
    setSaveError(null);
  }

  function handleFormatSection(section: LpEditableSection) {
    const current = drafts[section].text;
    try {
      const parsed = JSON.parse(current);
      setDrafts(d => ({ ...d, [section]: { text: JSON.stringify(parsed, null, 2), error: null } }));
    } catch {
      // Leave as-is if unparseable; the error indicator is already showing.
    }
  }

  function handleRevertSection(section: LpEditableSection) {
    if (!initial) return;
    setDrafts(d => ({ ...d, [section]: { text: formatSection(initial[section]), error: null } }));
    setSavedMessage(null);
    setSaveError(null);
  }

  function handleRevertAll() {
    if (!initial) return;
    setDrafts(draftsFromProfile(initial));
    setSaveError(null);
    setSavedMessage(null);
  }

  async function handleSave() {
    if (!initial || !dirty || saving || hasParseError) return;

    setSaving(true);
    setSaveError(null);
    setSavedMessage(null);

    try {
      // Build the full profile: start from the initial (preserves read-only
      // sections and any unknown top-level keys), then overlay parsed drafts
      // for the five editable sections.
      const body: LpProfile = { ...initial };
      for (const section of LP_EDITABLE_SECTIONS) {
        try {
          body[section] = JSON.parse(drafts[section].text);
        } catch (err) {
          setSaveError(`${section}: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
          setSaving(false);
          return;
        }
      }

      const res = await settingsApi.lp.updateProfile(lp_id!, body);

      // Refetch to capture server-side normalisation (e.g. the read-only
      // sections in case anything was regenerated).
      const fresh = await settingsApi.lp.getProfile(lp_id!);
      setInitial(fresh);
      setDrafts(draftsFromProfile(fresh));

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

  const displayName = initial?.lp_name ?? lp_id;
  const version     = initial?.version;

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <button onClick={() => navigate('/settings/lp')} className="text-accent hover:text-accent-hover transition-colors">
          LP management
        </button>
        <span className="text-border">/</span>
        <span className="font-mono">{lp_id}</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight flex items-baseline gap-3 flex-wrap">
            {displayName}
            {version && (
              <span className="text-sm font-mono text-text-muted">v{version}</span>
            )}
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Capability profile at{' '}
            <span className="font-mono text-text-secondary">
              config/fixbridge/lp/{lp_id}.json
            </span>. Three sub-objects are read-only: the backend preserves them
            silently regardless of what the UI sends.
          </p>
        </div>
        <span
          className="shrink-0 font-mono text-xs px-2.5 py-1 rounded"
          style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
        >
          restart: fixbridge_service
        </span>
      </div>

      {loadError ? (
        <div
          className="rounded p-3 mb-4"
          style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
        >
          <p className="text-sm font-medium m-0">Failed to load profile</p>
          <p className="text-xs mt-1 text-text-secondary">{loadError}</p>
        </div>
      ) : null}

      {/* ─── TOP SAVE BAR ─── */}
      <div className="bg-surface border border-border rounded px-5 py-3 mb-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 text-[12.5px] text-text-secondary flex-wrap">
          {loading ? (
            <span>Loading…</span>
          ) : dirtySections.length === 0 ? (
            <span>No pending changes.</span>
          ) : (
            <>
              <span className="font-medium">Pending changes:</span>
              {dirtySections.map(s => (
                <span
                  key={s}
                  className="font-mono text-[11.5px] px-1.5 py-0.5 rounded"
                  style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
                >
                  {s}
                </span>
              ))}
            </>
          )}
          {hasParseError && (
            <span
              className="font-mono text-[11.5px] px-1.5 py-0.5 rounded"
              style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
            >
              JSON parse error
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRevertAll}
            disabled={!dirty || saving || loading}
            className={clsx(
              'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
              'bg-transparent border-border text-text-secondary',
              dirty && !saving && !loading
                ? 'hover:bg-surface-hover cursor-pointer'
                : 'opacity-50 cursor-not-allowed',
            )}
          >
            Revert all
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || loading || hasParseError}
            className={clsx(
              'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
              'bg-accent border-accent text-[#0b0c0e]',
              dirty && !saving && !loading && !hasParseError
                ? 'hover:bg-accent-hover cursor-pointer'
                : 'opacity-50 cursor-not-allowed',
            )}
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </div>

      {(saveError || savedMessage) && (
        <div className="mb-3.5">
          {saveError && (
            <div
              className="rounded p-3"
              style={{ background: '#2c1417', border: '1px solid #7a2f36' }}
            >
              <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>{saveError}</p>
            </div>
          )}
          {savedMessage && !saveError && (
            <div
              className="rounded p-3"
              style={{ background: '#162a1c', border: '1px solid #2f6a3f' }}
            >
              <p className="text-xs m-0" style={{ color: '#66e07a' }}>{savedMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* ─── READ-ONLY SECTIONS ─── */}
      <div className="mb-3.5">
        <div className="flex items-center gap-2 mb-2.5">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-text-muted m-0">
            Read-only · silently preserved on save
          </h3>
          <span className="flex-1 h-px" style={{ background: '#2a292c' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          {LP_READONLY_SECTIONS.map(section => (
            <ReadOnlySection
              key={section}
              section={section}
              value={initial?.[section]}
              collapsed={collapsed[section]}
              onToggleCollapsed={() => setCollapsed(c => ({ ...c, [section]: !c[section] }))}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* ─── EDITABLE SECTIONS ─── */}
      <div>
        <div className="flex items-center gap-2 mb-2.5">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-text-muted m-0">
            Editable · JSON per section
          </h3>
          <span className="flex-1 h-px" style={{ background: '#2a292c' }} />
        </div>
        <div className="flex flex-col gap-2.5">
          {LP_EDITABLE_SECTIONS.map(section => (
            <EditableSection
              key={section}
              section={section}
              draft={drafts[section]}
              dirty={dirtySections.includes(section)}
              collapsed={collapsed[section]}
              onToggleCollapsed={() => setCollapsed(c => ({ ...c, [section]: !c[section] }))}
              onChange={text => setSectionText(section, text)}
              onFormat={() => handleFormatSection(section)}
              onRevert={() => handleRevertSection(section)}
              loading={loading}
            />
          ))}
        </div>
      </div>

      {/* Bottom save bar — same buttons for long-scroll convenience */}
      {!loading && (
        <div className="bg-surface border border-border rounded px-5 py-3 mt-4 flex items-center justify-between gap-3">
          <div className="text-[12.5px] text-text-secondary">
            {dirty ? `${dirtySections.length} section${dirtySections.length === 1 ? '' : 's'} modified` : 'No pending changes.'}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRevertAll}
              disabled={!dirty || saving}
              className={clsx(
                'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
                'bg-transparent border-border text-text-secondary',
                dirty && !saving ? 'hover:bg-surface-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
              )}
            >
              Revert all
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving || hasParseError}
              className={clsx(
                'px-3.5 py-1.5 rounded border text-sm font-medium transition-colors',
                'bg-accent border-accent text-[#0b0c0e]',
                dirty && !saving && !hasParseError ? 'hover:bg-accent-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
              )}
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ReadOnlySection — pretty-printed JSON, selectable, no edit affordance
// ─────────────────────────────────────────────────────────────────────────────

function ReadOnlySection({
  section, value, collapsed, onToggleCollapsed, loading,
}: {
  section:           LpReadonlySection;
  value:             unknown;
  collapsed:         boolean;
  onToggleCollapsed: () => void;
  loading:           boolean;
}) {
  const formatted = formatSection(value);
  const isEmpty = !value || (typeof value === 'object' && Object.keys(value as object).length === 0);

  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full px-5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-hover"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-text-muted" style={{ width: 10 }}>
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="font-mono text-[13px] font-medium text-text-primary">{section}</span>
          <span className="text-[11px] text-text-muted truncate">
            {SECTION_HELP[section]}
          </span>
        </div>
        <span
          className="shrink-0 text-[10.5px] font-mono uppercase px-1.5 py-0.5 rounded tracking-wide"
          style={{ background: '#1a1a1d', color: '#b6babf', border: '1px solid #44454f' }}
        >
          read-only
        </span>
      </button>
      {!collapsed && (
        <div className="border-t border-border">
          {loading ? (
            <p className="text-xs text-text-muted px-5 py-3 m-0">Loading…</p>
          ) : isEmpty ? (
            <p className="text-xs text-text-muted px-5 py-3 m-0 italic">
              This section is empty in the profile file.
            </p>
          ) : (
            <pre
              className="m-0 px-4 py-3 font-mono text-[11.5px] leading-snug overflow-auto select-all"
              style={{
                background: '#1a1a1d',
                color:      '#d2d6e2',
                maxHeight:  320,
              }}
            >
              {formatted}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EditableSection — JSON textarea with live parse validation
// ─────────────────────────────────────────────────────────────────────────────

function EditableSection({
  section, draft, dirty, collapsed, onToggleCollapsed, onChange, onFormat, onRevert, loading,
}: {
  section:           LpEditableSection;
  draft:             EditableDraft;
  dirty:             boolean;
  collapsed:         boolean;
  onToggleCollapsed: () => void;
  onChange:          (text: string) => void;
  onFormat:          () => void;
  onRevert:          () => void;
  loading:           boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="w-full px-5 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-surface-hover"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] text-text-muted" style={{ width: 10 }}>
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="font-mono text-[13px] font-medium text-text-primary">{section}</span>
          <span className="text-[11px] text-text-muted truncate">
            {SECTION_HELP[section]}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {dirty && (
            <span
              className="text-[10.5px] font-mono uppercase px-1.5 py-0.5 rounded tracking-wide"
              style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
            >
              modified
            </span>
          )}
          {draft.error && (
            <span
              className="text-[10.5px] font-mono uppercase px-1.5 py-0.5 rounded tracking-wide"
              style={{ background: '#2c1417', color: '#ff5c5c', border: '1px solid #7a2f36' }}
            >
              invalid
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="border-t border-border">
          {loading ? (
            <p className="text-xs text-text-muted px-5 py-3 m-0">Loading…</p>
          ) : (
            <>
              <textarea
                value={draft.text}
                onChange={e => onChange(e.target.value)}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full font-mono text-[11.5px] px-4 py-3 leading-snug focus:outline-none"
                style={{
                  background:  '#1a1a1d',
                  color:       '#E6E6E6',
                  border:      'none',
                  borderBottom: draft.error ? '1px solid #7a2f36' : '1px solid transparent',
                  minHeight:   200,
                  resize:      'vertical',
                }}
              />
              {draft.error && (
                <p className="text-[11.5px] px-4 py-2 m-0" style={{ color: '#ff5c5c', background: '#2c1417' }}>
                  {draft.error}
                </p>
              )}
              <div className="px-4 py-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11px] text-text-muted">
                  Full JSON for this section. Whole object replaces the file's value on save.
                </span>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onFormat}
                    disabled={draft.error !== null}
                    className={clsx(
                      'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                      'bg-transparent border-border text-text-secondary',
                      draft.error ? 'opacity-50 cursor-not-allowed' : 'hover:bg-surface-hover cursor-pointer',
                    )}
                  >
                    Format
                  </button>
                  <button
                    type="button"
                    onClick={onRevert}
                    disabled={!dirty}
                    className={clsx(
                      'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                      'bg-transparent border-border text-text-secondary',
                      dirty ? 'hover:bg-surface-hover cursor-pointer' : 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    Revert this section
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default LpProfilePage;