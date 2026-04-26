// ============================================
// TopBar — Primary Navigation
//
// Layout (per Portfolio-redesign spec):
//   • Top strip (always visible): Pinned tabs on the left,
//     clock + account dropdown on the right.
//   • Main strip: Logo, primary nav sections, and a clickable
//     Portfolio Card on the right (replaces the old KPI ticker).
//     The Portfolio Card is the global aggregate (B + A + C + Cost,
//     net of expenses and revenue) and navigates to /portfolio.
// ============================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { clsx } from 'clsx';

import {
  usePortfolioStats,
  fmtHdrMoney,
  fmtHdrCompact,
  pnlColor,
} from '@/stores/PortfolioStatsContext';

// ── Types ────────────────────────────────────────────────────
export interface SubItem {
  path: string;
  label: string;
  /** Shortcut for root+administrator only. Kept for backwards compat. */
  adminOnly?: boolean;
  /** When set, visible only to users whose role is in this list. Takes
   *  precedence over adminOnly when both are present. Use this for
   *  finer-grained control (e.g. Settings: root/admin/sysadmin/broker-dealer). */
  rolesAllowed?: string[];
}

export interface NavSection {
  id: string;
  label: string;
  items: SubItem[];
}

// ── Navigation definition ────────────────────────────────────
// Exported so SubNav and Layout can consume the same source
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { path: '/',              label: 'Cockpit' },
      { path: '/portfolio',     label: 'Portfolio' },
      { path: '/net-exposure',  label: 'Net Exposure' },
    ],
  },
  {
    id: 'flow',
    label: 'Flow',
    items: [
      { path: '/flow',         label: 'Trader Intelligence' },
      { path: '/archetypes',   label: 'Archetypes' },
      { path: '/risk-charter', label: 'Risk Charter' },
    ],
  },
  {
    id: 'execution',
    label: 'Execution',
    items: [
      { path: '/b-book',              label: 'B-Book' },
      { path: '/coverage-book',       label: 'Coverage Book' },
      { path: '/hedging-strategies',   label: 'Hedging Strategies' },
      { path: '/execution-report',     label: 'Execution Report' },
    ],
  },
  {
    id: 'markets',
    label: 'Markets',
    items: [
      { path: '/liquidity-providers',  label: 'Liquidity Providers' },
      { path: '/symbol-mapping',       label: 'Symbol Mapping' },
      { path: '/route-sanity',         label: 'Route Sanity' },
      { path: '/price-rules',          label: 'Price Rules Engine' },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    items: [
      { path: '/logs',          label: 'Logs' },
      { path: '/reports',       label: 'Reports' },
      { path: '/users',         label: 'Users',    adminOnly: true },
      { path: '/settings',      label: 'Settings', rolesAllowed: ['root', 'administrator', 'sysadmin', 'broker_dealer'] },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { path: '/mt5-servers',  label: 'MT5 Servers' },
    ],
  },
];

// ── Pin persistence ──────────────────────────────────────────
const PIN_KEY = 'taiga:pinned-items';

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePins(pins: string[]) {
  localStorage.setItem(PIN_KEY, JSON.stringify(pins));
}

// ── Role-based item visibility ───────────────────────────────
// Single source of truth for "should this user see this nav item".
// Consulted by both TopBar's section filter and SubNav's items filter.
export function canSeeItem(item: SubItem, role: string | undefined): boolean {
  if (item.rolesAllowed) {
    return !!role && item.rolesAllowed.includes(role);
  }
  if (item.adminOnly) {
    return role === 'root' || role === 'administrator';
  }
  return true;
}

// ── Resolve which section owns a path ────────────────────────
export function sectionForPath(pathname: string): NavSection | undefined {
  // Exact match first
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => i.path === pathname)) return s;
  }
  // Prefix match (e.g. /settings/security still lands in system)
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => pathname.startsWith(i.path) && i.path !== '/')) return s;
  }
  // Default: overview owns "/"
  if (pathname === '/') return NAV_SECTIONS[0];
  return undefined;
}

// Find a SubItem by path across all sections
function findItem(path: string): SubItem | undefined {
  for (const s of NAV_SECTIONS) {
    const found = s.items.find(i => i.path === path);
    if (found) return found;
  }
  return undefined;
}

// ── Account display helpers ──────────────────────────────────
// Falls back gracefully when first_name / last_name are absent
// (e.g. root@taiga.internal, legacy users before the name feature).
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

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════
export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [pins, setPins] = useState<string[]>(loadPins);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Global Portfolio Card stats. Sourced from PortfolioStatsContext (Layout-
  // mounted) so the card stays live on every page. The provider owns the WS
  // subscriptions; this component just reads `total` (B + A + C + Cost).
  const { total: portfolioStats } = usePortfolioStats();

  // Sync pins when SubNav toggles them
  useEffect(() => {
    const sync = () => setPins(loadPins());
    window.addEventListener('taiga:pins-changed', sync);
    return () => window.removeEventListener('taiga:pins-changed', sync);
  }, []);

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

  // Active section
  const activeSection = sectionForPath(location.pathname);

  // Pin helpers
  const togglePin = useCallback((path: string) => {
    setPins(prev => {
      const next = prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path];
      savePins(next);
      window.dispatchEvent(new Event('taiga:pins-changed'));
      return next;
    });
  }, []);

  const isPinned = (path: string) => pins.includes(path);

  // Section click → navigate to first sub-item
  const handleSectionClick = (section: NavSection) => {
    const first = section.items.find(i => canSeeItem(i, user?.role));
    if (first) navigate(first.path);
  };

  const fmt = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="shrink-0 flex flex-col" style={{ userSelect: 'none' }}>
      {/* ── Top strip — pinned tabs (left) + clock + account (right) ──
          Always rendered so the clock and account dropdown have a stable
          home regardless of whether the user has pinned anything. */}
      <div
        className="flex items-center gap-2 px-4 shrink-0"
        style={{ height: 32, backgroundColor: '#1c1b1e', borderBottom: '1px solid #3a3a3e' }}
      >
        {/* Left: PINNED label + tabs (only when pins exist) */}
        {pins.length > 0 && (
          <>
            <span style={{ fontSize: 9, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 4 }}>
              Pinned
            </span>
            {pins.map(path => {
              const item = findItem(path);
              if (!item) return null;
              const isActive = location.pathname === path;
              return (
                <NavLink
                  key={path}
                  to={path}
                  className="flex items-center gap-1.5 group"
                  style={{
                    fontSize: 11,
                    padding: '2px 10px',
                    borderRadius: 4,
                    border: `1px solid #6B9AC4`,
                    color: isActive ? '#c9b87c' : '#fff',
                    backgroundColor: isActive ? '#2a1f14' : 'transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{item.label}</span>
                  <button
                    onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(path); }}
                    style={{
                      fontSize: 9,
                      color: '#fff',
                      marginLeft: 2,
                      lineHeight: 1,
                      transition: 'color 0.15s',
                    }}
                    className="hover:!text-[#ff5c5c]"
                    title="Unpin"
                  >
                    x
                  </button>
                </NavLink>
              );
            })}
          </>
        )}

        {/* Right: clock + account dropdown */}
        <div className="ml-auto flex items-center gap-3 shrink-0">
          {/* Date & Time */}
          <div className="flex items-center gap-2 shrink-0" style={{ fontSize: 11 }}>
            <span style={{ color: '#bbb' }}>{fmtDate(currentTime)}</span>
            <span className="font-mono" style={{ color: '#fff' }}>{fmt(currentTime)}</span>
          </div>

          <div className="w-px h-4" style={{ backgroundColor: '#555' }} />

          {/* Account dropdown */}
          <div ref={accountRef} className="relative">
            <button
              onClick={() => setAccountOpen(v => !v)}
              className="flex items-center gap-2 px-1.5 py-0.5 rounded transition-colors text-[#ccc] hover:text-white"
            >
              {/* Avatar circle — slightly smaller to fit pinned bar height */}
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
                style={{
                  minWidth: 240,
                  backgroundColor: '#2a292c',
                  border: '1px solid #555',
                }}
              >
                {/* Name header */}
                <div className="px-3 py-2" style={{ borderBottom: '1px solid #3a3a3e' }}>
                  <div
                    style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}
                    className="truncate"
                    title={accountDisplayName(user)}
                  >
                    {accountDisplayName(user)}
                  </div>
                </div>

                {/* Details */}
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

                {/* Sign out */}
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
      </div>

      {/* ── Main top bar ─────────────────────────────────── */}
      <header
        className="flex items-center justify-between px-4 shrink-0"
        style={{ height: 68, backgroundColor: '#232326', borderBottom: '1px solid #808080' }}
      >
        {/* Left — Logo */}
        <div className="flex items-center shrink-0" style={{ marginRight: 24 }}>
          <img
            src="/taiga-logo.png"
            alt="taiga"
            style={{ height: 34, objectFit: 'contain' }}
            draggable={false}
          />
        </div>

        {/* Center — Primary nav sections */}
        <nav className="flex items-center gap-1 flex-1">
          {NAV_SECTIONS.map(section => {
            // Hide sections whose only items the user can't see
            const visibleItems = section.items.filter(i => canSeeItem(i, user?.role));
            if (visibleItems.length === 0) return null;

            const isActive = activeSection?.id === section.id;
            return (
              <button
                key={section.id}
                onClick={() => handleSectionClick(section)}
                className={clsx(
                  'relative px-3 py-1.5 text-[15px] font-medium rounded transition-colors',
                  isActive
                    ? 'text-[#c9b87c]'
                    : 'text-[#ccc] hover:text-white'
                )}
              >
                {section.label}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                    style={{ backgroundColor: '#c9b87c' }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right — Global Portfolio Card (B + A + C + Cost aggregate).
            Clickable; navigates to /portfolio. Yellow side line (#c9b87c)
            ties the card to the nav system — same colour as the active
            section indicator and pinned-active tabs. Background stays
            constant (#252429) on every route so the card reads cleanly
            against the dark header bar; the active-on-/portfolio cue is
            already handled by the SubNav and the pinned-tab strip, no
            need to double up here. */}
        <div className="flex items-center shrink-0">
          <NavLink
            to="/portfolio"
            title="Open Portfolio (B + A + C + Cost — net of expenses and revenue)"
            className="inline-flex items-stretch gap-2 rounded px-2 py-2 transition-colors hover:bg-[#2a292e]"
            style={{
              backgroundColor: '#252429',
              border: '1px solid #c9b87c44',
              borderLeft: '3px solid #c9b87c',
            }}
          >
            <div>
              <div className="text-xs uppercase tracking-wider text-white mb-0.5">Portfolio</div>
              <div className="text-sm font-mono text-white">{portfolioStats.positions ?? 0} pos</div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white mb-0.5">Long / Short</div>
              <div className="text-sm font-mono">
                <span style={{ color: '#49b3b3' }}>{portfolioStats.buys ?? 0}</span>
                <span className="text-[#505050]"> / </span>
                <span style={{ color: '#e0a020' }}>{portfolioStats.sells ?? 0}</span>
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white mb-0.5">Volume</div>
              <div className="text-sm font-mono text-white">
                {portfolioStats.volume != null ? fmtHdrCompact(portfolioStats.volume) : '—'}
              </div>
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white mb-0.5">Unrealized P/L</div>
              {portfolioStats.unrealized != null ? (
                <div className="text-sm font-mono" style={{ color: pnlColor(portfolioStats.unrealized) }}>
                  {fmtHdrMoney(portfolioStats.unrealized)}
                </div>
              ) : (
                <div className="text-sm font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
            <div className="w-px self-stretch bg-[#3a3a3e]" />
            <div>
              <div className="text-xs uppercase tracking-wider text-white mb-0.5">Realized P/L</div>
              {portfolioStats.realized != null ? (
                <div className="text-sm font-mono" style={{ color: pnlColor(portfolioStats.realized) }}>
                  {fmtHdrMoney(portfolioStats.realized)}
                </div>
              ) : (
                <div className="text-sm font-mono text-[#d2d6e2]">—</div>
              )}
            </div>
          </NavLink>
        </div>
      </header>
    </div>
  );
}

// Re-export pin helpers for SubNav
export { loadPins, savePins };

export default TopBar;