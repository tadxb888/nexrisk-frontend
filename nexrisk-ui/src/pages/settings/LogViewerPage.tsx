// ============================================
// Log viewer — settings sub-page
// Route: /settings/logs
//
// Distinct from the form-shaped sub-pages: this is a viewer, not a form.
// Full-width layout, controls on top, viewer + file sidebar below.
//
//   Top      — Service tabs (4 services)
//              Mode toggle (Tail / Search), input row, action buttons
//   Main     — Log content (~70%) + File list sidebar (~30%)
//   Footer   — File · line count · truncated indicator · last refresh
//
// Auto-refresh in tail mode polls every 3s (brief § 2.4 cadence).
// Set-level is gated on hasPermission('settings','EDIT') AND the service's
// level_configurable flag (fix_messages is read-only).
// ============================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { clsx } from 'clsx';

import { useAuth } from '@/stores/AuthContext';
import {
  settingsApi,
  LOG_LEVELS,
  type LogServiceDescriptor,
  type LogServiceId,
  type LogLevel,
  type LogFileDescriptor,
  type LogTailResponse,
  type LogSearchResponse,
} from '@/services/api';

// ─────────────────────────────────────────────────────────────────────────────
// Access control — same set as the hub
// ─────────────────────────────────────────────────────────────────────────────

const SETTINGS_PAGE_ROLES = ['root', 'administrator', 'sysadmin', 'broker_dealer'] as const;

const TAIL_REFRESH_MS  = 3_000;     // brief § 2.4 cadence floor
const TAIL_LINE_CHOICES   = [50, 100, 250, 500, 1000];
const SEARCH_LIMIT_CHOICES = [50, 100, 250, 500];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024)            return `${n} B`;
  if (n < 1024 * 1024)     return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3)       return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const delta = Date.now() - t;
  if (delta < 60_000)        return 'just now';
  if (delta < 3_600_000)     return `${Math.floor(delta / 60_000)} min ago`;
  if (delta < 86_400_000)    return `${Math.floor(delta / 3_600_000)} h ago`;
  if (delta < 7 * 86_400_000) return `${Math.floor(delta / 86_400_000)} d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function LogViewerPage() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();

  if (user && !(SETTINGS_PAGE_ROLES as readonly string[]).includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  const canSetLevel = hasPermission?.('settings', 'EDIT') ?? false;

  // ── service / mode ─────────────────────────────────────────────
  const [services, setServices] = useState<LogServiceDescriptor[] | null>(null);
  const [service,  setService]  = useState<LogServiceId>('nexrisk');
  const [mode,     setMode]     = useState<'tail' | 'search'>('tail');

  // ── files ──────────────────────────────────────────────────────
  const [files,        setFiles]        = useState<LogFileDescriptor[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError,   setFilesError]   = useState<string | null>(null);

  // ── tail ───────────────────────────────────────────────────────
  const [tailLines,       setTailLines]       = useState(100);
  const [tailAutoRefresh, setTailAutoRefresh] = useState(true);
  const [tailData,        setTailData]        = useState<LogTailResponse | null>(null);
  const [tailLoading,     setTailLoading]     = useState(false);
  const [tailError,       setTailError]       = useState<string | null>(null);
  const [tailRefreshedAt, setTailRefreshedAt] = useState<Date | null>(null);

  // ── search ─────────────────────────────────────────────────────
  const [searchFile,    setSearchFile]    = useState<string>('');
  const [searchQuery,   setSearchQuery]   = useState<string>('');
  const [searchLimit,   setSearchLimit]   = useState(100);
  const [searchData,    setSearchData]    = useState<LogSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);

  // ── set-level ──────────────────────────────────────────────────
  const [levelMenuOpen,    setLevelMenuOpen]    = useState(false);
  const [levelPending,     setLevelPending]     = useState<LogLevel | null>(null);
  const [levelSaving,      setLevelSaving]      = useState(false);
  const [levelMessage,     setLevelMessage]     = useState<string | null>(null);
  const [levelError,       setLevelError]       = useState<string | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);

  // ── derive selected service descriptor ─────────────────────────
  const selectedService = useMemo(
    () => services?.find(s => s.id === service) ?? null,
    [services, service],
  );

  const levelConfigurableHere =
    canSetLevel && (selectedService?.level_configurable ?? false);

  // ── load services list once ────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    settingsApi.logs.getServices()
      .then(resp => { if (!cancelled) setServices(resp.services); })
      .catch(()   => { if (!cancelled) setServices([]); });
    return () => { cancelled = true; };
  }, []);

  // ── load file list when service changes ────────────────────────
  useEffect(() => {
    let cancelled = false;
    setFilesLoading(true);
    setFilesError(null);
    setFiles(null);

    settingsApi.logs.getFiles(service)
      .then(resp => {
        if (cancelled) return;
        setFiles(resp.files);
        // Default search file to newest if none picked
        if (resp.files.length > 0 && (!searchFile || !resp.files.some(f => f.name === searchFile))) {
          setSearchFile(resp.files[0].name);
        }
      })
      .catch(err => {
        if (!cancelled) setFilesError(err instanceof Error ? err.message : 'Failed to load files');
      })
      .finally(() => { if (!cancelled) setFilesLoading(false); });

    return () => { cancelled = true; };
    // searchFile intentionally omitted — we only re-default it on service swap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  // ── tail: initial fetch + auto-refresh ─────────────────────────
  useEffect(() => {
    if (mode !== 'tail') return undefined;

    let cancelled = false;

    const fetchOnce = async () => {
      setTailLoading(true);
      setTailError(null);
      try {
        const resp = await settingsApi.logs.getTail(service, tailLines);
        if (!cancelled) {
          setTailData(resp);
          setTailRefreshedAt(new Date());
        }
      } catch (err) {
        if (!cancelled) setTailError(err instanceof Error ? err.message : 'Failed to tail');
      } finally {
        if (!cancelled) setTailLoading(false);
      }
    };

    void fetchOnce();

    if (!tailAutoRefresh) return () => { cancelled = true; };

    const id = window.setInterval(() => { void fetchOnce(); }, TAIL_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [service, tailLines, tailAutoRefresh, mode]);

  // ── auto-scroll to bottom on new tail data when at bottom ──────
  useEffect(() => {
    const el = viewerRef.current;
    if (!el || mode !== 'tail') return;
    // Only auto-scroll if user is near the bottom (within 80px). Respects
    // the case where someone scrolled up to read older lines.
    const threshold = 80;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold + 200) {
      el.scrollTop = el.scrollHeight;
    }
  }, [tailData, mode]);

  // ── handlers ───────────────────────────────────────────────────
  function handleSwitchService(id: LogServiceId) {
    if (id === service) return;
    setService(id);
    setTailData(null);
    setSearchData(null);
    setSearchQuery('');
    setLevelMessage(null);
    setLevelError(null);
    setLevelMenuOpen(false);
    setLevelPending(null);
  }

  async function handleRunSearch() {
    if (!searchFile || searchQuery.trim() === '' || searchLoading) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchData(null);
    try {
      const resp = await settingsApi.logs.search(service, searchFile, searchQuery, searchLimit);
      setSearchData(resp);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }

  function handlePickLevel(level: LogLevel) {
    setLevelPending(level);
    setLevelMessage(null);
    setLevelError(null);
  }

  async function handleConfirmLevel() {
    if (!levelPending || levelSaving) return;
    setLevelSaving(true);
    setLevelError(null);
    setLevelMessage(null);
    try {
      const resp = await settingsApi.logs.setLevel(service, levelPending);
      const restartList = resp.restart_required ?? [];
      setLevelMessage(
        restartList.length > 0
          ? `Log level set to ${levelPending}. Restart ${restartList.join(', ')} to apply.`
          : (resp.message ?? `Log level set to ${levelPending}.`),
      );
      setLevelPending(null);
      setLevelMenuOpen(false);
    } catch (err) {
      setLevelError(err instanceof Error ? err.message : 'Set level failed');
    } finally {
      setLevelSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  const viewerLines  = mode === 'tail' ? tailData?.lines  : searchData?.lines;
  const viewerFile   = mode === 'tail' ? tailData?.file   : searchData?.file;
  const viewerTrunc  = mode === 'tail' ? tailData?.truncated : searchData?.truncated;
  const viewerError  = mode === 'tail' ? tailError       : searchError;
  const viewerLoading = mode === 'tail' ? tailLoading     : searchLoading;

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center gap-2 text-xs text-text-muted mb-2.5">
        <button onClick={() => navigate('/settings')} className="text-accent hover:text-accent-hover transition-colors">
          Settings
        </button>
        <span className="text-border">/</span>
        <span>Log viewer</span>
      </div>

      <div className="flex justify-between items-end mb-5 pb-3 border-b border-border gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium text-text-primary tracking-tight">
            Log viewer
          </h1>
          <p className="text-[13px] text-text-secondary mt-1 leading-snug max-w-[720px]">
            Tail and search service logs across all four backend services. Files are read
            from each service's log directory; downloads stream the raw text. Setting a
            log level requires settings ≥ EDIT and only affects services flagged as
            level-configurable.
          </p>
        </div>
      </div>

      {/* ─── SERVICE TABS ─── */}
      <ServiceTabs
        services={services}
        active={service}
        onSelect={handleSwitchService}
      />

      {/* ─── CONTROLS ROW ─── */}
      <div className="bg-surface border border-border border-t-0 px-3.5 py-2.5 flex items-center gap-2.5 flex-wrap">

        {/* Mode toggle */}
        <ModeTabs mode={mode} onChange={setMode} />

        <span className="h-6 w-px" style={{ background: '#2a292c' }} />

        {/* Mode-specific controls */}
        {mode === 'tail' ? (
          <>
            <label className="text-[11.5px] text-text-muted uppercase tracking-wide">Lines</label>
            <SmallSelect
              value={String(tailLines)}
              options={TAIL_LINE_CHOICES.map(n => ({ value: String(n), label: String(n) }))}
              onChange={v => setTailLines(Number(v))}
            />
            <CompactToggle
              on={tailAutoRefresh}
              onChange={setTailAutoRefresh}
              label="Auto-refresh 3s"
            />
            {tailRefreshedAt && (
              <span className="text-[11px] text-text-muted font-mono">
                last: {formatTime(tailRefreshedAt.toISOString())}
              </span>
            )}
          </>
        ) : (
          <>
            <label className="text-[11.5px] text-text-muted uppercase tracking-wide">File</label>
            <SmallSelect
              value={searchFile}
              options={(files ?? []).map(f => ({ value: f.name, label: f.name }))}
              onChange={setSearchFile}
              minWidth={170}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void handleRunSearch(); }}
              placeholder="Substring to find…"
              className={clsx(
                'rounded px-2.5 py-1 text-[13px] font-mono',
                'text-text-primary border focus:outline-none focus:border-accent',
              )}
              style={{ background: '#232225', borderColor: '#44454f', minWidth: 220 }}
            />
            <label className="text-[11.5px] text-text-muted uppercase tracking-wide">Limit</label>
            <SmallSelect
              value={String(searchLimit)}
              options={SEARCH_LIMIT_CHOICES.map(n => ({ value: String(n), label: String(n) }))}
              onChange={v => setSearchLimit(Number(v))}
            />
            <button
              type="button"
              onClick={handleRunSearch}
              disabled={searchQuery.trim() === '' || !searchFile || searchLoading}
              className={clsx(
                'px-3 py-1 rounded border text-[13px] font-medium transition-colors',
                'bg-accent border-accent text-[#0b0c0e]',
                searchQuery.trim() === '' || !searchFile || searchLoading
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-accent-hover cursor-pointer',
              )}
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </button>
          </>
        )}

        {/* Push set-level to the right */}
        <span className="flex-1" />

        {/* Set-level (admin only, configurable services only) */}
        {levelConfigurableHere && (
          <SetLevelControl
            open={levelMenuOpen}
            onToggle={() => { setLevelMenuOpen(o => !o); setLevelPending(null); }}
            pending={levelPending}
            saving={levelSaving}
            onPick={handlePickLevel}
            onConfirm={handleConfirmLevel}
            onCancel={() => { setLevelPending(null); setLevelMenuOpen(false); }}
            service={service}
          />
        )}
      </div>

      {/* ─── SET-LEVEL FEEDBACK BANNER ─── */}
      {(levelMessage || levelError) && (
        <div
          className="px-3.5 py-2 border border-border border-t-0"
          style={{
            background: levelError ? '#2c1417' : '#162a1c',
            borderColor: levelError ? '#7a2f36' : '#2f6a3f',
          }}
        >
          <p className="text-xs m-0" style={{ color: levelError ? '#ff5c5c' : '#66e07a' }}>
            {levelError ?? levelMessage}
          </p>
        </div>
      )}

      {/* ─── MAIN: VIEWER + FILE SIDEBAR ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-[70fr_30fr] gap-3.5 mt-3.5 items-start">

        {/* Viewer */}
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] text-text-muted uppercase tracking-wide">File</span>
              <span className="font-mono text-[12.5px] text-text-primary truncate">
                {viewerFile ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11.5px] font-mono shrink-0">
              {mode === 'search' && searchData && (
                <span className="text-text-secondary">
                  {searchData.match_count} match{searchData.match_count === 1 ? '' : 'es'}
                </span>
              )}
              {viewerLines && (
                <span className="text-text-muted">
                  {viewerLines.length} line{viewerLines.length === 1 ? '' : 's'}
                </span>
              )}
              {viewerTrunc && (
                <span
                  className="px-1.5 py-0.5 rounded"
                  style={{ background: '#2a2016', color: '#e09a55', border: '1px solid #6a4a2f' }}
                >
                  truncated
                </span>
              )}
            </div>
          </div>

          <div
            ref={viewerRef}
            className="p-3 overflow-auto"
            style={{
              background: '#1a1a1d',
              minHeight: 480,
              maxHeight: 'calc(100vh - 380px)',
            }}
          >
            {viewerError ? (
              <p className="text-xs m-0" style={{ color: '#ff5c5c' }}>
                {viewerError}
              </p>
            ) : viewerLoading && !viewerLines ? (
              <p className="text-xs text-text-muted m-0">Loading…</p>
            ) : !viewerLines ? (
              <p className="text-xs text-text-muted m-0">
                {mode === 'tail'
                  ? 'No data yet.'
                  : 'Pick a file and enter a search query.'}
              </p>
            ) : viewerLines.length === 0 ? (
              <p className="text-xs text-text-muted m-0">
                {mode === 'tail' ? 'File is empty.' : 'No matches.'}
              </p>
            ) : (
              <pre
                className="m-0 font-mono text-[11.5px] leading-snug whitespace-pre-wrap break-words"
                style={{ color: '#d2d6e2' }}
              >
                {viewerLines.map(l => l.text).join('\n')}
              </pre>
            )}
          </div>

          {viewerTrunc && (
            <div
              className="px-4 py-2 border-t border-border text-[11.5px] text-text-muted"
            >
              {mode === 'tail'
                ? <>Output was truncated. Increase the line count to see more.</>
                : <>Output was truncated. Narrow the query or increase the limit.</>}
            </div>
          )}
        </div>

        {/* File sidebar */}
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-primary m-0">Files</h3>
            <span className="text-[11px] text-text-muted font-mono">
              {files ? `${files.length} file${files.length === 1 ? '' : 's'}` : '—'}
            </span>
          </div>

          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 380px)' }}>
            {filesError ? (
              <p className="text-xs px-4 py-3 m-0" style={{ color: '#ff5c5c' }}>
                {filesError}
              </p>
            ) : filesLoading ? (
              <p className="text-xs text-text-muted px-4 py-3 m-0">Loading…</p>
            ) : !files || files.length === 0 ? (
              <p className="text-xs text-text-muted px-4 py-3 m-0">No files in this service's log directory.</p>
            ) : (
              <ul className="m-0 p-0 list-none">
                {files.map((f, idx) => (
                  <li
                    key={f.name}
                    className="px-4 py-2 flex flex-col gap-0.5"
                    style={{ borderTop: idx === 0 ? 'none' : '1px solid #2a292c' }}
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="font-mono text-[12px] text-text-primary truncate" title={f.name}>
                        {f.name}
                      </span>
                      <a
                        href={settingsApi.logs.downloadUrl(service, f.name)}
                        download={f.name}
                        className="shrink-0 text-[11px] text-accent hover:text-accent-hover font-medium"
                      >
                        download
                      </a>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-text-muted font-mono">
                      <span>{formatBytes(f.size_bytes)}</span>
                      <span title={new Date(f.modified_at).toLocaleString()}>
                        {formatRelative(f.modified_at)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedService && (
            <div className="px-4 py-2 border-t border-border">
              <div className="text-[10px] text-text-muted uppercase tracking-wide">Log directory</div>
              <div className="font-mono text-[11px] text-text-secondary mt-0.5 break-all">
                {selectedService.log_dir}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function ServiceTabs({
  services, active, onSelect,
}: {
  services: LogServiceDescriptor[] | null;
  active:   LogServiceId;
  onSelect: (id: LogServiceId) => void;
}) {
  const ids: LogServiceId[] = ['nexrisk', 'gateway', 'fixbridge', 'fix_messages'];
  const labelOf = (id: LogServiceId) =>
    services?.find(s => s.id === id)?.label ?? defaultLabel(id);

  return (
    <div className="flex border border-border border-b-0 rounded-t overflow-hidden bg-surface">
      {ids.map(id => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={clsx(
              'px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer',
              'border-r border-border last:border-r-0',
              isActive ? 'text-accent' : 'text-text-secondary hover:text-text-primary',
            )}
            style={{
              background: isActive ? '#2a1f14' : 'transparent',
              borderBottom: isActive ? '2px solid #c9b87c' : '2px solid transparent',
            }}
          >
            {labelOf(id)}
          </button>
        );
      })}
    </div>
  );
}

function defaultLabel(id: LogServiceId): string {
  switch (id) {
    case 'nexrisk':      return 'NexRisk';
    case 'gateway':      return 'Price feed gateway';
    case 'fixbridge':    return 'FIX bridge';
    case 'fix_messages': return 'FIX messages';
  }
}

function ModeTabs({
  mode, onChange,
}: {
  mode: 'tail' | 'search'; onChange: (m: 'tail' | 'search') => void;
}) {
  return (
    <div className="flex rounded overflow-hidden" style={{ border: '1px solid #44454f' }}>
      {(['tail', 'search'] as const).map(m => {
        const isActive = m === mode;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={clsx(
              'px-3 py-1 text-[12.5px] font-medium uppercase tracking-wide cursor-pointer transition-colors',
            )}
            style={{
              background: isActive ? '#49b3b3' : '#232225',
              color:      isActive ? '#0b0c0e' : '#d2d6e2',
            }}
          >
            {m}
          </button>
        );
      })}
    </div>
  );
}

function SmallSelect({
  value, options, onChange, minWidth,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  minWidth?: number;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded px-2 py-1 text-[12.5px] font-mono text-text-primary border focus:outline-none focus:border-accent cursor-pointer"
      style={{ background: '#232225', borderColor: '#44454f', minWidth }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} style={{ background: '#232225', color: '#E6E6E6' }}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function CompactToggle({
  on, onChange, label,
}: {
  on: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors hover:bg-surface-hover"
    >
      <span
        className="block rounded-full"
        style={{
          width:  28,
          height: 16,
          background: on ? '#49b3b3' : '#232225',
          border:     `1px solid ${on ? '#49b3b3' : '#44454f'}`,
          position:   'relative',
        }}
      >
        <span
          className="block rounded-full"
          style={{
            width:    10,
            height:   10,
            margin:   2,
            background: '#fff',
            transform:  on ? 'translateX(12px)' : 'translateX(0)',
            transition: 'transform 0.15s',
          }}
        />
      </span>
      <span className="text-[11.5px] text-text-secondary">{label}</span>
    </button>
  );
}

function SetLevelControl({
  open, onToggle, pending, saving, onPick, onConfirm, onCancel, service,
}: {
  open:      boolean;
  onToggle:  () => void;
  pending:   LogLevel | null;
  saving:    boolean;
  onPick:    (level: LogLevel) => void;
  onConfirm: () => void;
  onCancel:  () => void;
  service:   LogServiceId;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          'px-3 py-1 rounded border text-[12.5px] font-medium transition-colors cursor-pointer',
          'bg-transparent border-border text-text-secondary hover:bg-surface-hover',
        )}
      >
        Set log level ▾
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 z-10 rounded shadow-lg"
          style={{
            background:  '#2a292c',
            border:      '1px solid #44454f',
            minWidth:    260,
          }}
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="text-[11px] text-text-muted uppercase tracking-wide">
              {service}_service · runtime level
            </div>
          </div>

          <div className="px-2 py-2 flex flex-col gap-0.5">
            {LOG_LEVELS.map(lvl => {
              const isPicked = pending === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => onPick(lvl)}
                  disabled={saving}
                  className={clsx(
                    'px-3 py-1.5 rounded text-left font-mono text-[12.5px] cursor-pointer transition-colors',
                    saving && 'cursor-not-allowed',
                  )}
                  style={{
                    background: isPicked ? '#49b3b3' : 'transparent',
                    color:      isPicked ? '#0b0c0e' : '#d2d6e2',
                  }}
                >
                  {lvl}
                </button>
              );
            })}
          </div>

          {pending && (
            <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
              <span className="text-[11.5px] text-text-secondary">
                Set to <span className="font-mono">{pending}</span>?
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={saving}
                  className="px-2.5 py-1 rounded border border-border text-[11.5px] text-text-secondary hover:bg-surface-hover cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={saving}
                  className={clsx(
                    'px-2.5 py-1 rounded border text-[11.5px] font-medium',
                    'bg-accent border-accent text-[#0b0c0e]',
                    saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-hover cursor-pointer',
                  )}
                >
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default LogViewerPage;