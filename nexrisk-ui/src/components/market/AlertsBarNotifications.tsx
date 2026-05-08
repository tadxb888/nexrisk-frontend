// ============================================
// AlertsBarNotifications — TopBar Row 2 (right half)
// App-wide notification slot. Replace-on-newest with manual dismiss.
// Distributed via WebSocket; seeded via REST on mount; CSV export from
// REST at click-time so the file is canonical regardless of session age.
//
// Wire contract: see alerts_bar_notifications_backend_spec.md §7.
// Notification shape is snake_case end-to-end (matches the WS frames
// from C++ AlertsBarBroadcaster — no camelCase remap on either side).
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';

// ============================================
// Types
// ============================================

export type NotificationType =
  | 'ESCALATION'
  | 'PROFILE_DETECTED'
  | 'CLUSTER_FORMED'
  | 'NEWS_IMMINENT'
  | 'NEWS_RELEASED'
  | 'NODE_OFFLINE'
  | 'ROUTE_SANITY_BREACH'
  | 'ATR_BREACH';

export type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AlertsBarNotification {
  id: number;
  notification_type: NotificationType;
  severity: Severity;
  title: string;
  message: string;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  /**
   * Wire format from C++ is "YYYY-MM-DD HH:MM:SS.ffffff+TZ" — note the
   * space separator, not 'T'. JS `new Date(s)` parses both forms fine,
   * so formatTime() / new Date() below work without a custom parser.
   */
  created_at: string;
}

interface NotificationListResponse {
  count: number;
  max_count: number;
  notifications: AlertsBarNotification[];
}

interface NotificationWsFrame {
  topic?: string;
  type?: string;
  data?: AlertsBarNotification;
  timestamp_ms?: number;
}

// ============================================
// Constants
// ============================================

const MAX_HISTORY        = 1000;
const WS_PATH            = '/ws/v1/alerts-bar/events';
const REST_LIST          = '/api/v1/alerts-bar/notifications';
// REST_LATEST exists at /api/v1/alerts-bar/notifications/latest — currently
// unused because REST_LIST?limit=1 covers the same need. If used, note the
// envelope is { notification: <obj> | null } per contract §3 (200 + null on
// empty table, NOT 404), so consumers must unwrap `.notification` first.

const RECONNECT_INITIAL_MS = 1_000;
const RECONNECT_MAX_MS     = 30_000;

// Severity → palette. Stripe is the left-edge accent; pillBg/pillText
// frame the type label. Tuned to read cleanly on #1c1b1e (Row 2 bg).
const SEVERITY_COLORS: Record<Severity, { stripe: string; pillBg: string; pillText: string }> = {
  CRITICAL: { stripe: '#c44545', pillBg: '#3a1818', pillText: '#e87575' },
  HIGH:     { stripe: '#d68c2c', pillBg: '#3a2a14', pillText: '#e8a44a' },
  MEDIUM:   { stripe: '#c9b237', pillBg: '#2e2810', pillText: '#d6c14a' },
  LOW:      { stripe: '#3d9970', pillBg: '#112620', pillText: '#5cb88c' },
  INFO:     { stripe: '#707075', pillBg: '#252528', pillText: '#a8a8ad' },
};

// Notification type → short pill label. Raw enum strings (e.g.
// 'PROFILE_DETECTED', 'ROUTE_SANITY_BREACH') are too wide once uppercased
// with letter-spacing, especially at narrow widths when PortfolioCard is
// also rendered on /portfolio. These labels stay ≤ 12 chars while keeping
// each type unambiguous. Exhaustive Record<> ensures the linter flags any
// new NotificationType added later.
const TYPE_LABEL: Record<NotificationType, string> = {
  ESCALATION:          'ESCALATION',
  PROFILE_DETECTED:    'NEW PROFILE',
  CLUSTER_FORMED:      'NEW CLUSTER',
  NEWS_IMMINENT:       'NEWS SOON',
  NEWS_RELEASED:       'NEWS OUT',
  NODE_OFFLINE:        'NODE DOWN',
  ROUTE_SANITY_BREACH: 'ROUTE BREACH',
  ATR_BREACH:          'ATR BREACH',
};

const FONT_MONO = 'IBM Plex Mono, ui-monospace, monospace';

// ============================================
// Icons (match Focus.tsx 1:1 where they overlap)
// ============================================

const CopyIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className={className}
       width="14" height="14">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round" className={className}
       width="14" height="14">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const TelegramIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}
       width="14" height="14">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className={className}
       width="14" height="14">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" className={className}
       width="14" height="14">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);

// ============================================
// Hook: useAlertsBarNotifications
// REST seed (limit=1000) → in-memory ring → WS appends.
// Returns the latest slot, the full history (for callers that want it),
// a dismiss action, and a connection flag.
// ============================================

export function useAlertsBarNotifications() {
  const [history, setHistory]         = useState<AlertsBarNotification[]>([]);
  const [latest, setLatest]           = useState<AlertsBarNotification | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs to avoid stale closures inside the WS handler.
  const wsRef             = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_INITIAL_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenIdsRef        = useRef<Set<number>>(new Set());

  // ── REST seed: fetch initial 1000 on mount ──────────────────
  const seedQuery = useQuery({
    queryKey: ['alerts-bar', 'notifications', 'seed'],
    queryFn: async (): Promise<NotificationListResponse> => {
      const res = await fetch(`${REST_LIST}?limit=${MAX_HISTORY}`);
      if (!res.ok) throw new Error(`Seed fetch failed: ${res.status}`);
      return res.json();
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Apply seed once it arrives.
  useEffect(() => {
    if (!seedQuery.data) return;
    const seedNotifs = seedQuery.data.notifications ?? [];
    setHistory(seedNotifs);
    seenIdsRef.current = new Set(seedNotifs.map(n => n.id));
    if (seedNotifs.length > 0) {
      // Newest first per backend ORDER BY created_at DESC.
      setLatest(seedNotifs[0]);
    }
  }, [seedQuery.data]);

  // ── WS ingest: prepend to history, replace latest slot ──────
  const ingest = useCallback((n: AlertsBarNotification) => {
    // Defensive de-dup against late seed/WS interleave.
    if (seenIdsRef.current.has(n.id)) return;
    seenIdsRef.current.add(n.id);
    setHistory(prev => {
      const next = [n, ...prev];
      return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
    });
    setLatest(n);
  }, []);

  // ── WS connection with exponential backoff ──────────────────
  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const wsScheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl    = `${wsScheme}//${window.location.host}${WS_PATH}`;
      const ws       = new WebSocket(wsUrl);
      wsRef.current  = ws;

      ws.onopen = () => {
        setIsConnected(true);
        reconnectDelayRef.current = RECONNECT_INITIAL_MS;
      };

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as NotificationWsFrame;
          // Topic pin guards against future SNAPSHOT / control frames on
          // sibling topics. Type accepts either 'EVENT' (original ESCALATION
          // milestone) or 'BROADCAST' (PROFILE_DETECTED milestone, per
          // Profile_Detected_Notifications-Frontend_Integration.md §3 — and
          // the standard WebSocketManager fan-out envelope). We accept both
          // so the slot stays populated regardless of which value the
          // C++ AlertsBarBroadcaster ends up emitting per type.
          if (
            frame.data &&
            frame.topic === 'alerts_bar.notification' &&
            (frame.type === 'EVENT' || frame.type === 'BROADCAST')
          ) {
            ingest(frame.data);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (cancelled) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, RECONNECT_MAX_MS);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose handles reconnect; intentional no-op here.
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [ingest]);

  const dismiss = useCallback(() => setLatest(null), []);

  return { latest, history, dismiss, isConnected };
}

// ============================================
// CSV export — RFC 4180-safe, hits REST at click-time.
// ============================================

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows: AlertsBarNotification[]): string {
  const header = [
    'id', 'created_at', 'notification_type', 'severity',
    'title', 'message', 'dedupe_key', 'payload_json',
  ];
  const lines: string[] = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.id,
      r.created_at,
      r.notification_type,
      r.severity,
      r.title,
      r.message,
      r.dedupe_key ?? '',
      r.payload, // csvEscape will JSON.stringify it
    ].map(csvEscape).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

async function downloadCsv(): Promise<void> {
  const res = await fetch(`${REST_LIST}?limit=${MAX_HISTORY}`);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const data: NotificationListResponse = await res.json();
  const csv  = buildCsv(data.notifications ?? []);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href     = url;
  a.download = `nexrisk_notifications_${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

// ============================================
// Helpers — format + clipboard/telegram payloads
// ============================================

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function buildClipboardText(n: AlertsBarNotification): string {
  // Mirrors Focus.tsx Copy idiom (═══ banner + body + footer).
  const header = `═══════════════════════════════════════
NEXRISK NOTIFICATION
═══════════════════════════════════════
Type:     ${n.notification_type}
Severity: ${n.severity}
Time:     ${new Date(n.created_at).toLocaleString('en-GB')}
───────────────────────────────────────
${n.title}
${n.message}
───────────────────────────────────────`;
  const payloadStr = Object.keys(n.payload ?? {}).length > 0
    ? `\nDetails:\n${JSON.stringify(n.payload, null, 2)}\n`
    : '';
  const footer = `═══════════════════════════════════════`;
  return header + payloadStr + footer;
}

function buildTelegramText(n: AlertsBarNotification): string {
  return `NEXRISK ${n.severity}\n\n${n.notification_type}: ${n.title}\n${n.message}\n\nTime: ${new Date(n.created_at).toLocaleString('en-GB')}`;
}

// ============================================
// IconButton — flat hover state, mirrors TopBar.tsx idiom.
// ============================================

interface IconButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  hoverColor?: string;
}

function IconButton({ children, onClick, title, disabled, hoverColor }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 24, height: 24,
        borderRadius: 3,
        color: '#888',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        border: 'none',
        padding: 0,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = '#2a292c';
        e.currentTarget.style.color      = hoverColor ?? '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color      = '#888';
      }}
    >
      {children}
    </button>
  );
}

// ============================================
// Component
// ============================================

interface Props {
  className?: string;
  /**
   * Fired when the slot transitions between filled and empty.
   * TopBar uses this to swap PortfolioCard between full and compact mode
   * on /portfolio (slot filled → compact; dismissed → full).
   */
  onSlotFilledChange?: (filled: boolean) => void;
}

export function AlertsBarNotifications({ className, onSlotFilledChange }: Props) {
  const { latest, dismiss } = useAlertsBarNotifications();
  const [copied, setCopied]           = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Notify parent when slot fills/empties (drives /portfolio compact mode).
  const slotFilled = latest !== null;
  useEffect(() => {
    onSlotFilledChange?.(slotFilled);
  }, [slotFilled, onSlotFilledChange]);

  const handleCopy = useCallback(() => {
    if (!latest) return;
    navigator.clipboard.writeText(buildClipboardText(latest));
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }, [latest]);

  const handleTelegram = useCallback(() => {
    if (!latest) return;
    const text = encodeURIComponent(buildTelegramText(latest));
    window.open(`https://t.me/share/url?url=&text=${text}`, '_blank', 'width=550,height=450');
  }, [latest]);

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadCsv();
    } catch (err) {
      console.error('[AlertsBarNotifications] CSV download failed:', err);
    } finally {
      setDownloading(false);
    }
  }, [downloading]);

  // ── Empty state ────────────────────────────────────────────
  // Slot dismissed or never populated: muted hint text + CSV-only icon.
  // History is preserved in the in-memory ring; CSV always works.
  if (!latest) {
    return (
      <div
        className={clsx('flex items-center gap-2 min-w-0', className)}
        style={{ height: 36, fontFamily: FONT_MONO }}
      >
        <span style={{ fontSize: 13, color: '#555', flex: 1 }}>
          No active notifications
        </span>
        <IconButton
          title="Download history as CSV"
          onClick={handleDownload}
          disabled={downloading}
        >
          <DownloadIcon />
        </IconButton>
      </div>
    );
  }

  // ── Active notification ───────────────────────────────────
  const colors = SEVERITY_COLORS[latest.severity];

  return (
    <div
      className={clsx('flex items-center min-w-0', className)}
      style={{ height: 36, gap: 8, fontFamily: FONT_MONO }}
    >
      {/* Left actions: Copy, Telegram */}
      <IconButton
        title={copied ? 'Copied' : 'Copy this notification'}
        onClick={handleCopy}
      >
        {copied
          ? <CheckIcon className="text-[#5cb88c]" />
          : <CopyIcon />}
      </IconButton>
      <IconButton
        title="Share via Telegram"
        onClick={handleTelegram}
        hoverColor="#26A5E4"
      >
        <TelegramIcon />
      </IconButton>

      <span style={{ width: 1, height: 16, background: '#333', flexShrink: 0 }} />

      {/* Severity stripe */}
      <span
        style={{ width: 3, height: 28, background: colors.stripe, flexShrink: 0 }}
        aria-label={`${latest.severity} severity`}
      />

      {/* Type pill */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          padding: '2px 6px',
          letterSpacing: '0.06em',
          flexShrink: 0,
          background: colors.pillBg,
          color: colors.pillText,
          textTransform: 'uppercase',
        }}
      >
        {TYPE_LABEL[latest.notification_type]}
      </span>

      {/* Title */}
      <span style={{ fontSize: 13, color: '#fff', flexShrink: 0, fontWeight: 500 }}>
        {latest.title}
      </span>

      <span style={{ color: '#555', flexShrink: 0, fontSize: 13 }}>—</span>

      {/* Message — fills remaining space, ellipsises at narrow widths */}
      <span
        style={{
          fontSize: 13,
          color: '#bbb',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={latest.message}
      >
        {latest.message}
      </span>

      {/* Timestamp */}
      <span style={{ fontSize: 12, color: '#707075', flexShrink: 0 }}>
        {formatTime(latest.created_at)}
      </span>

      <span style={{ width: 1, height: 16, background: '#333', flexShrink: 0 }} />

      {/* Right actions: Dismiss, Download CSV */}
      <IconButton title="Dismiss (clear slot)" onClick={dismiss}>
        <XIcon />
      </IconButton>
      <IconButton
        title="Download history as CSV"
        onClick={handleDownload}
        disabled={downloading}
      >
        <DownloadIcon />
      </IconButton>
    </div>
  );
}

export default AlertsBarNotifications;