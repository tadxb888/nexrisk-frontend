// ============================================
// Sidebar — Primary Navigation (persistent left rail)
//
// Replaces the two-row TopBar switcher. Domains are always visible as a
// vertical rail; the active domain expands its children inline (accordion,
// one open at a time). Favourites sit at the top; Help sits at the bottom.
//
// Gating is identical to the old TopBar: a leaf is shown only when the user
// holds >= VIEW on its `module` (hasPermission). NAV_SECTIONS remains the
// single source of truth — this component adds no modules or paths to it.
//
// PROVISIONED (placeholder, wired later — see PROVISIONED_* / HELP_ITEMS):
//   • Network Cluster (/infra, module 'infra_monitor') — rendered ungated for
//     now so it's visible before the C++ module grant exists. Once the backend
//     grants 'infra_monitor', gate it like any other leaf (see renderLeaf call
//     under the 'settings' section).
//   • Help → Operational Manual (/help/manual, route not built yet) + frontend
//     / backend version strings (copy-to-clipboard; values are placeholders
//     until wired to the real build/health info).
//
// Colour convention mirrors the old TopBar:
//   #f5802c (orange) — the section that owns the current page ("you-are-here")
//   #49b3b3 (teal)   — active leaf + pinned star
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/AuthContext';
import { NAV_SECTIONS, type SubItem, type NavSection } from '@/config/navPermissions';

// ── Colours ──────────────────────────────────────────────────
const COLOR_OWNER        = '#f5802c'; // orange — section owning the current page
const COLOR_ACCENT       = '#49b3b3'; // teal   — active leaf + pinned star
const COLOR_SUB_DEFAULT  = '#ddd';    // soft white — inactive leaf text
const COLOR_TEXT_DEFAULT = '#fff';    // section label (inactive)
const RAIL_BG            = '#1b1a1d';
const HOVER_BG           = '#232327';
const BORDER             = '#2f2f33';

// ── Provisioned placeholders (wired later) ───────────────────
// Not part of NAV_SECTIONS (the gated contract). Rendered by this rail only.
const NETWORK_CLUSTER: SubItem = { path: '/infra', label: 'Network Cluster', module: 'infra_monitor' };

const HELP_ID = '__help__';
const FRONTEND_VERSION = '—'; // TODO wire to real build version
const BACKEND_VERSION  = '—'; // TODO wire from /health or build info

// ── Pin persistence (shares the existing key with legacy TopBar) ─────────────
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

// ── Path helpers ─────────────────────────────────────────────
function findItem(path: string): SubItem | undefined {
  for (const s of NAV_SECTIONS) {
    const found = s.items.find(i => i.path === path);
    if (found) return found;
  }
  return undefined;
}

/** Which section owns a given route (exact, then prefix). */
function sectionForPath(pathname: string): NavSection | undefined {
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => i.path === pathname)) return s;
  }
  for (const s of NAV_SECTIONS) {
    if (s.items.some(i => i.path !== '/' && pathname.startsWith(i.path))) return s;
  }
  if (pathname === '/') return NAV_SECTIONS[0];
  return undefined;
}

// ── Icons ────────────────────────────────────────────────────
const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
    <path d="M9.068,16.347l4.9,4.9.707-.707a7.977,7.977,0,0,0,2.075-7.619l-.246-1,2.086-2.086.217.217a3.085,3.085,0,0,0,3.938.4,3,3,0,0,0,.38-4.565L18.2.954a3.085,3.085,0,0,0-3.938-.4,3,3,0,0,0-.38,4.565l.293.293L12.085,7.5,11.1,7.258A7.985,7.985,0,0,0,3.464,9.33l-.707.707,4.9,4.895L.293,22.293l1.414,1.414Z" />
  </svg>
);

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="10" height="10" viewBox="0 0 10 10"
    style={{ transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none', flexShrink: 0 }}
  >
    <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

// ══════════════════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════════════════
export function Sidebar() {
  const location = useLocation();
  const { hasPermission } = useAuth();
  const can = useCallback((module: string) => hasPermission(module, 'VIEW'), [hasPermission]);

  const [pins, setPins] = useState<string[]>(loadPins);
  const [copied, setCopied] = useState<string | null>(null);

  // Keep pins in sync if another surface (e.g. legacy TopBar) changes them.
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

  // Sections the user can see (>= 1 visible child).
  const accessibleGroups = NAV_SECTIONS.filter(s => s.items.some(i => can(i.module)));

  // Favourites, permission-filtered so a perm loss hides the pin.
  const visibleFavourites: SubItem[] = pins
    .map(findItem)
    .filter((i): i is SubItem => !!i && can(i.module));

  // Which accordion section is open. Follows the page's owning section.
  const owner = sectionForPath(location.pathname);
  const [openId, setOpenId] = useState<string>(() => owner?.id ?? accessibleGroups[0]?.id ?? '');

  useEffect(() => {
    const o = sectionForPath(location.pathname);
    if (o) setOpenId(o.id);
  }, [location.pathname]);

  const copy = useCallback((label: string, value: string) => {
    try { void navigator.clipboard.writeText(value); } catch { /* clipboard blocked */ }
    setCopied(label);
    setTimeout(() => setCopied(c => (c === label ? null : c)), 1200);
  }, []);

  // ── Render helpers ─────────────────────────────────────────
  const renderLeaf = (item: SubItem, opts: { showPin?: boolean } = {}) => {
    const showPin = opts.showPin ?? true;
    const isActive = location.pathname === item.path;
    const pinned = pins.includes(item.path);
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className="group flex items-center justify-between transition-colors"
        style={{
          padding: '6px 12px 6px 26px',
          fontSize: 13,
          color: isActive ? COLOR_ACCENT : COLOR_SUB_DEFAULT,
          borderLeft: `2px solid ${isActive ? COLOR_ACCENT : 'transparent'}`,
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = '#fff'; }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLAnchorElement).style.color = COLOR_SUB_DEFAULT; }}
      >
        <span className="truncate">{item.label}</span>
        {showPin && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(item.path); }}
            className={pinned ? 'inline-flex' : 'hidden group-hover:inline-flex'}
            style={{ color: pinned ? COLOR_ACCENT : '#888', padding: 0, lineHeight: 1, alignItems: 'center' }}
            title={pinned ? 'Unpin from favourites' : 'Pin to favourites'}
          >
            <PinIcon filled={pinned} />
          </button>
        )}
      </NavLink>
    );
  };

  const renderSectionHeader = (id: string, label: string, isOwner: boolean) => {
    const open = openId === id;
    return (
      <button
        onClick={() => setOpenId(prev => (prev === id ? '' : id))}
        className="w-full flex items-center gap-2 transition-colors"
        style={{
          padding: '9px 12px',
          fontSize: 14,
          color: isOwner ? COLOR_OWNER : open ? COLOR_TEXT_DEFAULT : '#cfcfcf',
          backgroundColor: open ? HOVER_BG : 'transparent',
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.backgroundColor = HOVER_BG; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <Chevron open={open} />
        <span className="truncate">{label}</span>
      </button>
    );
  };

  const renderVersionRow = (label: string, value: string) => (
    <button
      key={label}
      onClick={() => copy(label, value)}
      className="group w-full flex items-center justify-between transition-colors"
      style={{ padding: '5px 12px 5px 26px', fontSize: 12, color: COLOR_SUB_DEFAULT }}
      title={`Copy ${label.toLowerCase()}`}
    >
      <span>{label}</span>
      <span className="flex items-center gap-1.5" style={{ color: '#9a9a9a' }}>
        <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#bdbdbd' }}>{value}</span>
        <span style={{ color: copied === label ? COLOR_ACCENT : '#888' }}>
          {copied === label ? '✓' : <CopyIcon />}
        </span>
      </span>
    </button>
  );

  // ── Render ─────────────────────────────────────────────────
  return (
    <nav
      aria-label="Primary"
      className="shrink-0 flex flex-col overflow-y-auto"
      style={{ width: 240, height: '100%', backgroundColor: RAIL_BG, borderRight: `1px solid ${BORDER}`, userSelect: 'none' }}
    >
      {/* Favourites — always-open block at the top (when non-empty). */}
      {visibleFavourites.length > 0 && (
        <div style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 4 }}>
          <div style={{ padding: '9px 12px 4px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#8a8a8a' }}>
            Favourites
          </div>
          {visibleFavourites.map(item => renderLeaf(item))}
        </div>
      )}

      {/* Structural domains — permission-filtered accordion. */}
      {accessibleGroups.map(section => {
        const isOwner = owner?.id === section.id;
        const open = openId === section.id;
        const children = section.items.filter(i => can(i.module));
        return (
          <div key={section.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
            {renderSectionHeader(section.id, section.label, isOwner)}
            {open && (
              <div style={{ paddingBottom: 4 }}>
                {children.map(item => renderLeaf(item))}
                {/* PROVISIONED: Network Cluster lives under Settings, rendered
                    ungated until the C++ 'infra_monitor' module grant exists.
                    To gate later: wrap in `can(NETWORK_CLUSTER.module) && ...`. */}
                {section.id === 'settings' && renderLeaf(NETWORK_CLUSTER)}
              </div>
            )}
          </div>
        );
      })}

      {/* PROVISIONED: Help — always visible (ungated chrome). */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, marginTop: 'auto' }}>
        {renderSectionHeader(HELP_ID, 'Help', false)}
        {openId === HELP_ID && (
          <div style={{ paddingBottom: 6 }}>
            {renderLeaf({ path: '/help/manual', label: 'Operational Manual', module: '__help__' }, { showPin: false })}
            {renderVersionRow('Frontend version', FRONTEND_VERSION)}
            {renderVersionRow('Backend version', BACKEND_VERSION)}
          </div>
        )}
      </div>
    </nav>
  );
}

export default Sidebar;