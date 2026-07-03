// ============================================
// TopBar — status chrome (brand · clock · account · reserved strip)
//
// Navigation moved to the left rail (Sidebar.tsx). This bar now carries only
// the always-on chrome:
//   • Header (height 44): logo + clock + account dropdown
//   • Reserved strip (height 56): Alerts Bar FX cells + app-wide notification
//     slot + Portfolio card on /portfolio
//
// Still owns the one-time favourites seed and re-exports NAV_SECTIONS /
// moduleForPath / sectionForPath / loadPins / savePins so existing importers
// keep working after the rail split.
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { type SubItem, type NavSection, NAV_SECTIONS, moduleForPath } from '@/config/navPermissions';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { CardsPeriodToggle } from '@/components/portfolio/CardsPeriodToggle';
import { AlertsBar } from '@/components/market/AlertsBar';
import { AlertsBarNotifications } from '@/components/market/AlertsBarNotifications';

// ── Navigation definition ────────────────────────────────────
// SubItem / NavSection / NAV_SECTIONS / moduleForPath now live in
// @/config/navPermissions (single source shared with RoutePermissionGuard).
// Re-exported below so existing imports from this module keep working.
export { NAV_SECTIONS, moduleForPath };
export type { SubItem, NavSection };

// ── Pin persistence ──────────────────────────────────────────
// Reuses the existing storage key so users with pre-redesign pins keep them.
const PIN_KEY    = 'taiga:pinned-items';
const SEEDED_KEY = 'taiga:favourites-seeded';

/**
 * Default favourites — seeded ONCE on first mount when SEEDED_KEY is unset.
 * After that the user owns the list; clearing favourites stays cleared.
 */
const DEFAULT_FAVOURITES: string[] = [
  '/b-book',
  '/coverage-book',
  '/net-exposure',
  '/hedging-strategies',
  '/execution-report',
  '/flow',          // Traders
  '/portfolio',
];

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePins(pins: string[]) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

/**
 * One-time seed of default favourites.
 *
 * Runs only when SEEDED_KEY is unset. Respects any existing pins (e.g. from
 * the previous "pinned tabs" UX) — does not overwrite. After this runs once,
 * the user is in full control: clearing favourites stays cleared across
 * sessions.
 */
function seedDefaultsIfNeeded() {
  try {
    if (localStorage.getItem(SEEDED_KEY)) return;
    const existing = loadPins();
    if (existing.length === 0) {
      savePins(DEFAULT_FAVOURITES);
    }
    localStorage.setItem(SEEDED_KEY, '1');
  } catch { /* localStorage unavailable; skip seeding */ }
}

// ── Resolve which section owns a path ────────────────────────
export function sectionForPath(pathname: string): NavSection | undefined {
  // Exact match first
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => i.path === pathname)) return s;
  }
  // Prefix match (e.g. /settings/security still lands in control)
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => pathname.startsWith(i.path) && i.path !== '/')) return s;
  }
  // Default: overview owns "/"
  if (pathname === '/') return NAV_SECTIONS[0];
  return undefined;
}

// ── Account display helpers ──────────────────────────────────
function accountDisplayName(user: { email: string; first_name?: string; last_name?: string } | null): string {
  if (!user) return 'Account';
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return full || user.email;
}

function accountInitials(user: { email: string; first_name?: string; last_name?: string } | null): string {
  if (!user) return 'U';
  const f = user.first_name?.trim()[0];
  const l = user.last_name?.trim()[0];
  if (f && l) return (f + l).toUpperCase();
  if (f)      return f.toUpperCase();
  return user.email[0]?.toUpperCase() ?? 'U';
}

// Find a SubItem by path across all sections.
function findItem(path: string): SubItem | undefined {
  for (const s of NAV_SECTIONS) {
    const found = s.items.find(i => i.path === path);
    if (found) return found;
  }
  return undefined;
}

// ── Pin icon ─────────────────────────────────────────────────
const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <path d="M9.068,16.347l4.9,4.9.707-.707a7.977,7.977,0,0,0,2.075-7.619l-.246-1,2.086-2.086.217.217a3.085,3.085,0,0,0,3.938.4,3,3,0,0,0,.38-4.565L18.2.954a3.085,3.085,0,0,0-3.938-.4,3,3,0,0,0-.38,4.565l.293.293L12.085,7.5,11.1,7.258A7.985,7.985,0,0,0,3.464,9.33l-.707.707,4.9,4.895L.293,22.293l1.414,1.414Z" />
  </svg>
);

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════

export function TopBar() {
  const location = useLocation();
  const { user, logout, hasPermission } = useAuth();

  // One-time default favourites seed (consumed by the left rail, Sidebar.tsx).
  useEffect(() => { seedDefaultsIfNeeded(); }, []);

  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Whether the AlertsBar notification slot is filled — drives the /portfolio
  // compact-mode swap of PortfolioCard. Toggled by AlertsBarNotifications.
  const [notificationActive, setNotificationActive] = useState(false);

  // Favourites (pinned pages) — shared with the rail via the pin key + event.
  const [pins, setPins] = useState<string[]>(loadPins);
  useEffect(() => {
    const sync = () => setPins(loadPins());
    window.addEventListener('taiga:pins-changed', sync);
    return () => window.removeEventListener('taiga:pins-changed', sync);
  }, []);
  const togglePin = useCallback((path: string) => {
    setPins(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      savePins(next);
      window.dispatchEvent(new Event('taiga:pins-changed'));
      return next;
    });
  }, []);
  const visibleFavourites: SubItem[] = pins
    .map(findItem)
    .filter((i): i is SubItem => !!i && hasPermission(i.module, 'VIEW'));

  // Clock
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmt     = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="shrink-0 flex flex-col" style={{ userSelect: 'none' }}>
      {/* ── Header: brand + status chrome ───────────────────────────── */}
      <header
        className="flex items-center px-4 shrink-0 gap-3"
        style={{ height: 44, backgroundColor: '#232326', borderBottom: '1px solid #3a3a3e' }}
      >
        {/* Logo */}
        <div className="flex items-center shrink-0" style={{ marginRight: 12 }}>
          <img src="/taiga-mark.svg" alt="taiga" style={{ height: 28, objectFit: 'contain' }} draggable={false} />
        </div>

        {/* Favourites — pinned pages (synced with the rail's pin toggles). */}
        <nav className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto" aria-label="Favourites">
          {visibleFavourites.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="group flex items-center gap-1 shrink-0 rounded transition-colors"
                style={{
                  height: 28, padding: '0 8px', fontSize: 14,
                  color: isActive ? '#49b3b3' : '#cfcfcf',
                  backgroundColor: isActive ? '#2c2b2f' : 'transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = '#cfcfcf'; }}
              >
                <span className="truncate" style={{ maxWidth: 150 }}>{item.label}</span>
                <button
                  onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(item.path); }}
                  className="hidden group-hover:inline-flex items-center"
                  style={{ color: '#49b3b3', padding: 0, lineHeight: 1 }}
                  title="Unpin from favourites"
                >
                  <PinIcon filled />
                </button>
              </NavLink>
            );
          })}
        </nav>

        {/* Right — clock + account dropdown */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 shrink-0" style={{ fontSize: 11 }}>
            <span style={{ color: '#bbb' }}>{fmtDate(currentTime)}</span>
            <span className="font-mono" style={{ color: '#fff' }}>{fmt(currentTime)}</span>
          </div>

          <div className="w-px h-4" style={{ backgroundColor: '#555' }} />

          <div ref={accountRef} className="relative">
            <button
              onClick={() => setAccountOpen(v => !v)}
              className="flex items-center gap-2 px-1.5 py-0.5 rounded transition-colors text-[#ccc] hover:text-white"
            >
              <div
                className="flex items-center justify-center rounded-full"
                style={{ width: 22, height: 22, backgroundColor: '#3a3a3e', fontSize: 10, fontWeight: 600, color: '#fff' }}
              >
                {accountInitials(user)}
              </div>
              <span style={{ fontSize: 11, maxWidth: 180 }} className="truncate">
                {accountDisplayName(user)}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ color: '#bbb' }}>
                <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            </button>

            {accountOpen && (
              <div
                className="absolute right-0 mt-1 rounded shadow-lg z-50"
                style={{ minWidth: 240, backgroundColor: '#2a292c', border: '1px solid #555' }}
              >
                <div className="px-3 py-2" style={{ borderBottom: '1px solid #3a3a3e' }}>
                  <div
                    style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}
                    className="truncate"
                    title={accountDisplayName(user)}
                  >
                    {accountDisplayName(user)}
                  </div>
                </div>

                <div className="px-3 py-2" style={{ borderBottom: '1px solid #3a3a3e' }}>
                  <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Email
                    </span>
                    <span
                      className="font-mono truncate"
                      style={{ fontSize: 11, color: '#ddd', maxWidth: 170 }}
                      title={user?.email}
                    >
                      {user?.email ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Role
                    </span>
                    <span style={{ fontSize: 11, color: '#ddd' }}>
                      {user?.role_label ?? user?.role ?? '—'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => { setAccountOpen(false); void logout(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors text-[#ccc] hover:text-[#ff5c5c] hover:bg-[#3a2020]"
                  style={{ fontSize: 12 }}
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                    <path d="M17,2H7A3,3,0,0,0,4,5V11h9.586L11.293,8.707a1,1,0,0,1,1.414-1.414l4,4a1,1,0,0,1,0,1.414l-4,4a1,1,0,0,1-1.414-1.414L13.586,13H4v6a3,3,0,0,0,3,3H17a3,3,0,0,0,3-3V5A3,3,0,0,0,17,2Z"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Reserved strip ────────────────────────────────────
          Left half: Alerts Bar FX cells (≤ 4 user-chosen ticks).
          Right half: app-wide notification slot (escalations, news,
          node offline, etc.) — always visible; replaced on newest, can
          be dismissed manually.

          On /portfolio when a notification is active, PortfolioCard
          renders compact (only its first cell) so the notification has
          room. Dismissing the notification re-expands the card.

          Bottom border uses #808080 to mark the page boundary, matching
          the BBookPage reference. */}
      <div
        className="shrink-0 flex items-center px-4 gap-2"
        style={{ height: 56, paddingTop: 8, paddingBottom: 8, backgroundColor: '#1c1b1e', borderTop: '1px solid rgba(78,205,196,0.35)', borderBottom: '1px solid #808080' }}
        aria-label="Reserved strip — FX cells (left); app-wide notifications + portfolio card on /portfolio (right)"
      >
        {/* Left half — Alerts Bar (FX cells, ≤ 50% of bar width). */}
        <AlertsBar />

        {/* Right half — app-wide notification slot. Replaces the bare
            spacer; flex-1 + min-w-0 lets it both fill empty space and
            shrink with ellipsis when PortfolioCard is also visible. */}
        <AlertsBarNotifications
          className="flex-1 min-w-0"
          onSlotFilledChange={setNotificationActive}
        />

        {/* Right side — Portfolio card on /portfolio only. Collapses to
            first cell while a notification is active. */}
        {location.pathname === '/portfolio' && (
          <>
            <CardsPeriodToggle title="Period applied to the Portfolio card" />
            <PortfolioCard compact={notificationActive} />
          </>
        )}
      </div>
    </div>
  );
}

// Re-export pin helpers for any future consumer that wants to read/write
// favourites without going through the TopBar component itself.
export { loadPins, savePins };

export default TopBar;