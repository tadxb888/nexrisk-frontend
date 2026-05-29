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

/**
 * Payload schema for NEWS_IMMINENT and NEWS_RELEASED notifications.
 * Field names mirror GET /api/v1/calendar/events 1:1 (per
 * Calendar_Notifications_Frontend_Integration.md §4). The C++ backend
 * delivers numeric values as strings with units suffixed ("178K",
 * "2.3%"); render as received, do not parse.
 */
export interface CalendarPayload {
  calendar_id:    string;
  event_name:     string;
  country:        string;          // long-form, e.g. "United States"
  currency:       string | null;   // ISO-3, e.g. "USD"; null for non-FX events
  event_time_utc: string;          // ISO 8601 UTC, trailing 'Z'
  importance:     2 | 3;
  actual:         string | null;   // null for IMMINENT, populated for RELEASED
  previous:       string | null;
  consensus:      string | null;   // TE "Forecast" — market survey average
  forecast:       string | null;   // TE "TEForecast" — TE proprietary model
}

const NEWS_TYPES = new Set<NotificationType>(['NEWS_IMMINENT', 'NEWS_RELEASED']);
const isNewsType = (t: NotificationType): boolean => NEWS_TYPES.has(t);

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

// Strict hold for NEWS_RELEASED. Per spec: once a release lands in the slot
// it cannot be replaced by anything (CRITICAL escalations included) for this
// duration. Only the user's Dismiss action breaks the hold early. Incoming
// frames during the hold are stored in pendingRef (newest wins) and drained
// when the timer fires. NEWS_IMMINENT does NOT use this hold — it follows
// the existing replace-on-newest path so a later release for the same event
// (or any other notification) can supersede it cleanly.
const NEWS_RELEASED_HOLD_MS = 10_000;

// Severity → palette. Stripe is the left-edge accent; pillBg/pillText
// frame the type label. Tuned to read cleanly on #1c1b1e (Row 2 bg).
const SEVERITY_COLORS: Record<Severity, { stripe: string; pillBg: string; pillText: string }> = {
  CRITICAL: { stripe: '#c44545', pillBg: '#3a1818', pillText: '#e87575' },
  HIGH:     { stripe: '#d68c2c', pillBg: '#3a2a14', pillText: '#e8a44a' },
  MEDIUM:   { stripe: '#c9b237', pillBg: '#2e2810', pillText: '#d6c14a' },
  LOW:      { stripe: '#3d9970', pillBg: '#112620', pillText: '#5cb88c' },
  INFO:     { stripe: '#707075', pillBg: '#252528', pillText: '#a8a8ad' },
};

const FONT_MONO = 'IBM Plex Mono, ui-monospace, monospace';

// Live NEWS_IMMINENT countdown accent. Amber, not yellow: the branding doc
// rules out yellow ("marketing/gaming") but blesses Orange/Amber for the
// "Elevated Risk — warning, not panic" semantic, which a release countdown
// is. Value is the app's established attention/transitional amber from
// BBookPage (#e0a020 — used there for SELL side and the "Connecting…"
// status). Swap this one constant to re-tone the countdown.
const ECOCAL_COUNTDOWN_COLOR = '#e0a020';

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

  // ── News-specific state ───────────────────────────────────────
  // seenNewsKeysRef: hard FE dedupe by (notification_type, calendar_id) per
  //   spec §8 — backend dedupe window is 60s; a TE actual revision arriving
  //   later still produces a second NEWS_RELEASED for the same calendar_id.
  //   This Set guarantees once-per-event on the FE.
  // holdTypeRef + latestSetAtRef: bookkeeping for the strict 10s hold.
  //   When the slot's current type is NEWS_RELEASED and (now - setAt) <
  //   NEWS_RELEASED_HOLD_MS, ingest() refuses to replace the slot.
  // pendingRef: single-slot queue (newest wins) for frames arriving during
  //   a hold. Drained when the holdTimer fires or when dismiss() is called.
  // holdTimerRef: drain timer handle.
  const seenNewsKeysRef   = useRef<Set<string>>(new Set());
  const holdTypeRef       = useRef<NotificationType | null>(null);
  const latestSetAtRef    = useRef<number>(0);
  const pendingRef        = useRef<AlertsBarNotification | null>(null);
  const holdTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    // Also seed the news (type, calendar_id) dedupe set so that a page
    // reload immediately after a NEWS_RELEASED doesn't re-fire the slot
    // when the same notification arrives over WS due to seed/WS overlap.
    seenNewsKeysRef.current = new Set(
      seedNotifs
        .filter(n => isNewsType(n.notification_type))
        .map(n => {
          const calId = (n.payload as Partial<CalendarPayload> | undefined)?.calendar_id;
          return calId ? `${n.notification_type}:${calId}` : null;
        })
        .filter((k): k is string => k !== null)
    );
    if (seedNotifs.length > 0) {
      // Newest first per backend ORDER BY created_at DESC.
      setLatest(seedNotifs[0]);
      latestSetAtRef.current = Date.now();
      holdTypeRef.current    = seedNotifs[0].notification_type;
      // Note: we do NOT arm the 10s hold timer for a seeded NEWS_RELEASED.
      // The hold protects the user's read window for a *fresh* release;
      // a seeded one was emitted before the page was open, so blocking
      // subsequent live frames against it would be wrong.
    }
  }, [seedQuery.data]);

  // ── Slot promotion: setLatest + arm 10s hold if needed ─────
  // Recursive: when the hold drains, this is called again with the
  // pending frame; if THAT is also a NEWS_RELEASED, a fresh hold is
  // armed. Defined as a stable callback so refs are shared.
  const promoteToSlot = useCallback((n: AlertsBarNotification) => {
    setLatest(n);
    latestSetAtRef.current = Date.now();
    holdTypeRef.current    = n.notification_type;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (n.notification_type === 'NEWS_RELEASED') {
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        holdTypeRef.current  = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) promoteToSlot(pending);
      }, NEWS_RELEASED_HOLD_MS);
    }
  }, []);

  // ── WS ingest: prepend to history, replace latest slot ──────
  const ingest = useCallback((n: AlertsBarNotification) => {
    // Defensive de-dup against late seed/WS interleave.
    if (seenIdsRef.current.has(n.id)) return;

    // News-specific dedupe by (type, calendar_id). Guards against a TE
    // actual revision producing a second NEWS_RELEASED for the same
    // event (spec §8). Only applies when the payload actually carries
    // a calendar_id — defensive against malformed frames.
    if (isNewsType(n.notification_type)) {
      const calId = (n.payload as Partial<CalendarPayload> | undefined)?.calendar_id;
      if (calId) {
        const newsKey = `${n.notification_type}:${calId}`;
        if (seenNewsKeysRef.current.has(newsKey)) return;
        seenNewsKeysRef.current.add(newsKey);
      }
      // Diagnostic: log raw frame on first arrival per (type, calId).
      // Keeps Ross's "console.log first" rule for new wire shapes.
      console.log('[AlertsBar] NEWS frame:', n.notification_type, n.payload);
    }

    seenIdsRef.current.add(n.id);

    // History always grows — independent of slot hold. Audit/CSV must
    // see every notification in arrival order even if the slot was
    // locked when it arrived.
    setHistory(prev => {
      const next = [n, ...prev];
      return next.length > MAX_HISTORY ? next.slice(0, MAX_HISTORY) : next;
    });

    // Slot strict-hold check. If the current slot is a NEWS_RELEASED
    // still inside its 10s window, queue this frame instead of
    // promoting. pendingRef is single-slot (newest wins) — older
    // queued frames are dropped from the slot but remain in history.
    if (
      holdTypeRef.current === 'NEWS_RELEASED' &&
      Date.now() < latestSetAtRef.current + NEWS_RELEASED_HOLD_MS
    ) {
      pendingRef.current = n;
      return;
    }

    promoteToSlot(n);
  }, [promoteToSlot]);

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
          // Per the locked contract (§2), live frames carry topic exactly
          // 'alerts_bar.notification' and type 'EVENT'. We pin both so a
          // future SNAPSHOT or control frame on the same topic is not
          // misread as a new notification. The discriminator for which
          // notification this is lives in `data.notification_type`, not
          // the envelope `type` — that field is constant 'EVENT' across
          // every alert kind on this topic (ESCALATION, PROFILE_DETECTED,
          // CLUSTER_FORMED, etc).
          if (
            frame.data &&
            frame.topic === 'alerts_bar.notification' &&
            frame.type  === 'EVENT'
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
      if (holdTimerRef.current)      clearTimeout(holdTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [ingest]);

  // Dismiss: user-initiated slot clear. Per spec, dismiss breaks the
  // strict hold immediately. If a frame was queued during the hold,
  // promote it to the slot now — leaving the slot empty when fresh
  // content is waiting would feel broken. The notification stays in
  // history regardless; nothing is lost.
  const dismiss = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdTypeRef.current = null;

    const pending = pendingRef.current;
    pendingRef.current = null;

    if (pending) {
      promoteToSlot(pending);
    } else {
      setLatest(null);
      latestSetAtRef.current = 0;
    }
  }, [promoteToSlot]);

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

/**
 * Render-time presentation helper: replaces underscores in enum-style
 * tokens with spaces (e.g. SCALPER_LIKE → SCALPER LIKE, REBATE_ABUSE
 * → REBATE ABUSE, CLUSTER_FORMED → CLUSTER FORMED). BE messages embed
 * enum names directly; the underscore is a serialization artifact, not
 * user-facing content. Applied to the slot's display surfaces (pill,
 * title, message) only — raw values are preserved verbatim in history,
 * CSV export, and clipboard/Telegram payloads for audit fidelity.
 */
function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

// ============================================
// EcoCal helpers — country mapping + value formatting
// ============================================

/**
 * TE-emitted long-form country names → ISO-2 (with two trader-friendly
 * deviations: UK instead of GB, EU instead of fictional code for Euro Area).
 * Backend confirmed it emits long-form ("United States", "United Kingdom",
 * "Euro Area"); this map exists to fit those into the top bar slot.
 *
 * Add entries as new TE countries appear in production. Unmapped names
 * fall back to the first 4 chars uppercased (see formatCountry below) —
 * a deliberately ugly fallback so misses are visible and get added here.
 */
const COUNTRY_ISO2 = new Map<string, string>([
  // Major FX
  ['United States',         'US'],
  ['Euro Area',             'EU'],
  ['United Kingdom',        'UK'],
  ['Japan',                 'JP'],
  ['China',                 'CN'],
  ['Germany',               'DE'],
  ['France',                'FR'],
  ['Italy',                 'IT'],
  ['Spain',                 'ES'],
  ['Canada',                'CA'],
  ['Australia',             'AU'],
  ['New Zealand',           'NZ'],
  ['Switzerland',           'CH'],
  // Asia-Pacific
  ['South Korea',           'KR'],
  ['India',                 'IN'],
  ['Hong Kong',             'HK'],
  ['Singapore',             'SG'],
  ['Taiwan',                'TW'],
  ['Indonesia',             'ID'],
  ['Thailand',              'TH'],
  ['Malaysia',              'MY'],
  ['Philippines',           'PH'],
  ['Vietnam',               'VN'],
  ['Pakistan',              'PK'],
  // Nordics + rest of Europe
  ['Norway',                'NO'],
  ['Sweden',                'SE'],
  ['Denmark',               'DK'],
  ['Finland',               'FI'],
  ['Iceland',               'IS'],
  ['Netherlands',           'NL'],
  ['Belgium',               'BE'],
  ['Austria',               'AT'],
  ['Ireland',               'IE'],
  ['Portugal',              'PT'],
  ['Greece',                'GR'],
  ['Poland',                'PL'],
  ['Czech Republic',        'CZ'],
  ['Hungary',               'HU'],
  ['Romania',               'RO'],
  ['Ukraine',               'UA'],
  ['Russia',                'RU'],
  ['Turkey',                'TR'],
  // Middle East
  ['Israel',                'IL'],
  ['Saudi Arabia',          'SA'],
  ['United Arab Emirates',  'AE'],
  ['Qatar',                 'QA'],
  ['Kuwait',                'KW'],
  ['Egypt',                 'EG'],
  // Latin America
  ['Brazil',                'BR'],
  ['Mexico',                'MX'],
  ['Argentina',             'AR'],
  ['Chile',                 'CL'],
  ['Colombia',              'CO'],
  ['Peru',                  'PE'],
  // Africa
  ['South Africa',          'ZA'],
  ['Nigeria',               'NG'],
]);

/** Map long-form country to ISO-2; fallback first 4 chars uppercased. */
function formatCountry(country: string | null | undefined): string {
  if (!country) return '?';
  return COUNTRY_ISO2.get(country) ?? country.slice(0, 4).toUpperCase();
}

/** Render TE numeric strings ("178K", "2.3%") verbatim; em-dash for null. */
function formatNumeric(v: string | null | undefined): string {
  return (v == null || v === '') ? '—' : v;
}

/**
 * Live countdown for NEWS_IMMINENT. Ticks toward the payload's absolute
 * release time (event_time_utc, ISO 8601 UTC) — NOT a hardcoded 15:00.
 * This matters: the backend scan window means an imminent frame can land
 * anywhere from ~5 to ~15 minutes out, so the old static "15 MIN" label
 * was wrong most of the time. Counting to a real timestamp is the only
 * honest option.
 *
 * Format "T-12:43" (mm:ss, minutes uncapped; "T-" disambiguates from the
 * absolute clock time also shown on the row). At or past the release time
 * we show "DUE" until the NEWS_RELEASED frame supersedes the slot. If
 * event_time_utc is missing/unparseable we can't count honestly, so we
 * fall back to the non-committal "SOON" rather than fabricate a number.
 */
function formatCountdown(eventTimeUtc: string | null | undefined, nowMs: number): string {
  if (!eventTimeUtc) return 'SOON';
  const eventMs = new Date(eventTimeUtc).getTime();
  if (Number.isNaN(eventMs)) return 'SOON';
  const remaining = eventMs - nowMs;
  if (remaining <= 0) return 'DUE';
  const totalSec = Math.floor(remaining / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `T-${m}:${String(s).padStart(2, '0')}`;
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

  // Live-countdown driver for NEWS_IMMINENT. nowMs is bumped every second by
  // the ticker effect below — but ONLY while an imminent event holds the slot,
  // since nothing else needs a per-second re-render. Lazy init to now so the
  // first imminent frame paints a correct countdown without waiting one tick.
  // State is local to this component, so the ticker re-renders only the slot,
  // not TopBar.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const isImminent = latest?.notification_type === 'NEWS_IMMINENT';

  // Notify parent when slot fills/empties (drives /portfolio compact mode).
  const slotFilled = latest !== null;
  useEffect(() => {
    onSlotFilledChange?.(slotFilled);
  }, [slotFilled, onSlotFilledChange]);

  // 1s countdown ticker — armed only while an imminent event is in the slot,
  // and torn down the moment it's superseded (e.g. by its NEWS_RELEASED frame
  // or a dismiss). No imminent event → no interval running.
  useEffect(() => {
    if (!isImminent) return;
    setNowMs(Date.now()); // sync immediately so the first paint isn't stale
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [isImminent]);

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

      {/* Type pill + content — branches on news type.
          For NEWS_*, the pill reads "EcoCal" and the content row is a
          pipe-delimited record of (status, country event_name, prev,
          forecast, consensus, +actual on release). Severity colors
          drive the pill (HIGH=amber, MEDIUM=yellow per existing palette).
          For all other notification types, the original pill + title +
          em-dash + message layout is preserved verbatim. */}
      {isNewsType(latest.notification_type) ? (
        <>
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
            EcoCal
          </span>

          {(() => {
            const p = (latest.payload ?? {}) as Partial<CalendarPayload>;
            const released = latest.notification_type === 'NEWS_RELEASED';
            // Imminent: live countdown to the real release timestamp.
            // Released: static label (the event has already happened).
            const status   = released
              ? 'RELEASED'
              : formatCountdown(p.event_time_utc, nowMs);
            const country  = formatCountry(p.country);
            const evt      = p.event_name ?? '—';
            // Released rows surface Actual first; Imminent has no Actual yet.
            const rest: string[] = [
              `${country} ${evt}`,
              ...(released ? [`Actual ${formatNumeric(p.actual)}`] : []),
              `Prev ${formatNumeric(p.previous)}`,
              `Fcst ${formatNumeric(p.forecast)}`,
              `Cons ${formatNumeric(p.consensus)}`,
            ];
            const restText = rest.join(' | ');
            const fullText = `${status} | ${restText}`;
            return (
              <span
                style={{
                  fontSize: 13,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={fullText}
              >
                {/* The live countdown is the one time-sensitive element on
                    the row, so it gets the amber accent + bold weight to
                    read at a glance. RELEASED is a settled state — it stays
                    in the row's default white like every other field. */}
                <span
                  style={{
                    color: released ? '#fff' : ECOCAL_COUNTDOWN_COLOR,
                    fontWeight: released ? 400 : 600,
                  }}
                >
                  {status}
                </span>
                <span style={{ color: '#fff' }}>{` | ${restText}`}</span>
              </span>
            );
          })()}
        </>
      ) : (
        <>
          {/* Type pill — humanize() strips the underscore from enum tokens
              (CLUSTER_FORMED → CLUSTER FORMED). Display only; raw value
              stays in payload, history, CSV, clipboard, and Telegram. */}
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
            {humanize(latest.notification_type)}
          </span>

          {/* Title — humanized (e.g. "New REBATE ABUSE detected"). */}
          <span style={{ fontSize: 13, color: '#fff', flexShrink: 0, fontWeight: 500 }}>
            {humanize(latest.title)}
          </span>

          <span style={{ color: '#555', flexShrink: 0, fontSize: 13 }}>—</span>

          {/* Message — fills remaining space, ellipsises at narrow widths.
              Humanized in both visible text and the hover tooltip so the
              full row reads "Cluster 4 · 14 traders · SCALPER LIKE". */}
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
            title={humanize(latest.message)}
          >
            {humanize(latest.message)}
          </span>
        </>
      )}

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