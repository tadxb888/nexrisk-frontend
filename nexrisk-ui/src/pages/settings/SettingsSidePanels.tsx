// ============================================
// Settings side-panels — shared live wiring
//
// Encapsulates the two cross-cutting Settings panels so each sub-page drops
// them in with a single hook + component and stays consistent:
//   • G1  useServiceHealth() + <ServiceHealthRows>  — live Status / Uptime /
//         Last start, matched to a managed service by id.
//   • G2  <RecentChangesPanel>                      — audit trail of edits
//         (who changed what, when) from GET /settings/{section}/history.
//
// Both are poll-based (no WebSocket). Styling matches the existing Service /
// ServiceField panel idiom on the sub-pages (11px uppercase labels, mono
// data cells, muted palette) so these render seamlessly inside them.
// ============================================

import { useEffect, useState } from 'react';
import {
  settingsApi,
  type ServiceHealth,
  type SettingsHistoryEntry,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// G1 — service health
// ─────────────────────────────────────────────────────────────────────────────

type ServiceId = ServiceHealth['id'];

/** Default cadence. The action list suggests ~10-30s; 15s is a good middle. */
const HEALTH_POLL_MS = 15_000;

/**
 * Poll GET /settings/services/health and return the entry matching `id`.
 * Self-throttling via setTimeout chain; stops on unmount. Errors are surfaced
 * (not thrown) so the panel can degrade to "—" rather than break the page.
 */
export function useServiceHealth(id: ServiceId, pollMs: number = HEALTH_POLL_MS) {
  const [health,  setHealth]  = useState<ServiceHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const resp = await settingsApi.services.health();
        if (cancelled) return;
        setHealth(resp.services.find(s => s.id === id) ?? null);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'health unavailable');
      } finally {
        if (!cancelled) {
          setLoading(false);
          timer = setTimeout(tick, pollMs);
        }
      }
    }

    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [id, pollMs]);

  return { health, loading, error };
}

// Muted status palette (10-20% grey blend, per the design system — no neon).
const STATE_TONE: Record<string, { color: string; label: string }> = {
  RUNNING:          { color: '#6aaa78', label: 'Running' },
  STOPPED:          { color: '#d07070', label: 'Stopped' },
  START_PENDING:    { color: '#c09060', label: 'Starting' },
  STOP_PENDING:     { color: '#c09060', label: 'Stopping' },
  PAUSED:           { color: '#c09060', label: 'Paused' },
  PAUSE_PENDING:    { color: '#c09060', label: 'Pausing' },
  CONTINUE_PENDING: { color: '#c09060', label: 'Resuming' },
  UNKNOWN:          { color: '#808080', label: 'Unknown' },
};

function fmtUptime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function fmtLastStart(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/** One grid cell matching the sub-pages' ServiceField markup. */
function Cell({ label, note, children }: {
  label: string; note?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-text-muted uppercase tracking-wide">{label}</span>
      <span className="font-mono text-[13px] text-text-primary flex items-center gap-1.5">
        {children}
      </span>
      {note && <span className="text-[10px] text-text-muted italic">{note}</span>}
    </div>
  );
}

/**
 * The three live Service rows (Status / Uptime / Last start). Renders as a
 * fragment of three grid cells so it drops straight into the existing
 * two-column Service grid alongside the static Process / Config / Log rows.
 */
export function ServiceHealthRows({ health, loading, error }: {
  health: ServiceHealth | null; loading: boolean; error?: string | null;
}) {
  if (loading && !health) {
    return (
      <>
        <Cell label="Status"><span className="text-text-muted">…</span></Cell>
        <Cell label="Uptime"><span className="text-text-muted">…</span></Cell>
        <Cell label="Last start"><span className="text-text-muted">…</span></Cell>
      </>
    );
  }

  if (!health) {
    const note = error ? 'health unavailable' : 'service not reported';
    return (
      <>
        <Cell label="Status" note={note}><span className="text-text-muted">—</span></Cell>
        <Cell label="Uptime"><span className="text-text-muted">—</span></Cell>
        <Cell label="Last start"><span className="text-text-muted">—</span></Cell>
      </>
    );
  }

  const tone = STATE_TONE[health.state] ?? STATE_TONE.UNKNOWN;
  return (
    <>
      <Cell label="Status">
        <span className="shrink-0 rounded-full" style={{ width: 7, height: 7, background: tone.color }} />
        <span style={{ color: tone.color }}>{tone.label}</span>
      </Cell>
      <Cell label="Uptime">{fmtUptime(health.uptime_seconds)}</Cell>
      <Cell label="Last start">{fmtLastStart(health.last_start)}</Cell>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// G2 — recent changes (audit trail)
// ─────────────────────────────────────────────────────────────────────────────

/** Sections that expose a working history endpoint via settingsApi. */
export type HistorySection = 'gateway' | 'fixbridge' | 'nexrisk';

const HISTORY_LIMIT = 100;   // fetch depth (backend caps at 1000)
const HISTORY_SHOWN = 5;     // rows rendered in the panel

function historyFor(section: HistorySection) {
  const params = { limit: HISTORY_LIMIT };
  switch (section) {
    case 'gateway':   return settingsApi.gateway.history(params);
    case 'fixbridge': return settingsApi.fixbridge.history(params);
    case 'nexrisk':   return settingsApi.nexrisk.history(params);
  }
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtVal(v: unknown): string {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function diffPairs(entry: SettingsHistoryEntry): { key: string; from: unknown; to: unknown }[] {
  const keys = new Set<string>([
    ...Object.keys(entry.new_values ?? {}),
    ...Object.keys(entry.old_values ?? {}),
  ]);
  return [...keys].map(key => ({
    key,
    from: entry.old_values?.[key],
    to:   entry.new_values?.[key],
  }));
}

const CHANGE_TONE: Record<string, string> = {
  UPDATE: '#c09060',
  CREATE: '#6aaa78',
  DELETE: '#d07070',
};

/**
 * Body for the "Recent changes" panel. Drops inside the existing panel
 * shell (the outer card + header stay on the page). Optional `subsections`
 * filters client-side — the `nexrisk` section aggregates many subsections,
 * so a page passes the ones it owns (e.g. ['auth']).
 *
 * A `refreshKey` that changes after a successful save re-pulls the trail.
 */
export function RecentChangesPanel({
  section, subsections, refreshKey,
}: {
  section: HistorySection;
  subsections?: string[];
  refreshKey?: number;
}) {
  const [entries, setEntries] = useState<SettingsHistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const filterKey = subsections?.join(',') ?? '';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const resp = await historyFor(section);
        if (cancelled) return;
        let rows = resp.history ?? [];
        if (subsections && subsections.length > 0) {
          rows = rows.filter(r => subsections.includes(r.subsection));
        }
        setEntries(rows.slice(0, HISTORY_SHOWN));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [section, filterKey, refreshKey]);

  if (loading && entries === null) {
    return (
      <div className="px-5 py-5">
        <p className="text-xs text-text-muted m-0 text-center">Loading recent changes…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-5 py-5">
        <p className="text-xs text-text-muted m-0 text-center">
          Couldn't load recent changes ({error}).
        </p>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="px-5 py-5">
        <p className="text-xs text-text-muted m-0 text-center">No recent changes recorded.</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-3.5 flex flex-col gap-3">
      {entries.map(entry => {
        const pairs = diffPairs(entry);
        const tone = CHANGE_TONE[entry.change_type] ?? '#808080';
        return (
          <div key={entry.id} className="flex flex-col gap-1.5 pb-3 border-b border-border last:border-b-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide"
                  style={{ color: tone, border: `1px solid ${tone}55` }}
                >
                  {entry.change_type}
                </span>
                <span className="text-[12px] text-text-secondary truncate">{entry.subsection}</span>
              </span>
              <span className="font-mono text-[10px] text-text-muted shrink-0">{fmtWhen(entry.changed_at)}</span>
            </div>

            {pairs.length > 0 && (
              <div className="flex flex-col gap-0.5 pl-0.5">
                {pairs.slice(0, 4).map(p => (
                  <div key={p.key} className="text-[11px] leading-snug flex items-baseline gap-1.5">
                    <span className="font-mono text-text-muted shrink-0">{p.key}</span>
                    <span className="font-mono text-text-muted line-through opacity-70">{fmtVal(p.from)}</span>
                    <span className="text-text-muted">→</span>
                    <span className="font-mono text-text-primary">{fmtVal(p.to)}</span>
                  </div>
                ))}
                {pairs.length > 4 && (
                  <span className="text-[10px] text-text-muted italic">+{pairs.length - 4} more field(s)</span>
                )}
              </div>
            )}

            <span className="text-[10px] text-text-muted">
              by <span className="font-mono">{entry.changed_by || 'unknown'}</span>
              {entry.reason ? ` · ${entry.reason}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}