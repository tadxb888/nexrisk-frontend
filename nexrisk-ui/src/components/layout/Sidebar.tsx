// ============================================
// Sidebar — Primary Navigation (persistent, collapsible left rail)
//
// Domains are always visible as a vertical rail; the active domain expands
// its children inline (accordion, one open at a time). A "Menu" header with a
// collapse toggle sits at the top; collapsing shrinks the rail to a thin strip
// to reclaim real estate (state persisted in localStorage).
//
// Favourites are NOT shown here — pinned items render in the top bar's
// favourites strip (TopBar). Pinning from a leaf still works and syncs via the
// shared 'taiga:pinned-items' key + 'taiga:pins-changed' event.
//
// Gating is identical to the old TopBar: a leaf shows only when the user holds
// >= VIEW on its `module` (hasPermission). NAV_SECTIONS remains the single
// source of truth — this component adds no modules or paths to it.
//
// PROVISIONED (placeholder, wired later):
//   • Network Cluster (/infra, 'infra_monitor') — rendered ungated for now so
//     it's visible before the C++ module grant exists. To gate later, wrap the
//     renderLeaf(NETWORK_CLUSTER) call in `can(NETWORK_CLUSTER.module) && ...`.
//   • Help → Operational Manual (/help/manual, route not built) + frontend /
//     backend version strings (copy-to-clipboard; placeholder values).
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

const RAIL_W_OPEN     = 240;
const RAIL_W_COLLAPSED = 46;
const COLLAPSE_KEY    = 'taiga:rail-collapsed';

// ── Provisioned placeholders (wired later) ───────────────────
const NETWORK_CLUSTER: SubItem = { path: '/infra', label: 'Network Cluster', module: 'infra_monitor' };

const HELP_ID = '__help__';
const FRONTEND_VERSION = '—'; // TODO wire to real build version
const BACKEND_VERSION  = '—'; // TODO wire from /health or build info

// ── Pin persistence (shares the existing key with the top bar) ───────────────
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

// ── Path helper ──────────────────────────────────────────────
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

// Sidebar toggle glyph (from sidebar.svg) — panel with a rail divider.
const SidebarToggleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <g clipRule="evenodd" fillRule="evenodd">
      <path d="m4.5 3.75c-.41421 0-.75.33579-.75.75v15c0 .4142.33579.75.75.75h15c.4142 0 .75-.3358.75-.75v-15c0-.41421-.3358-.75-.75-.75zm-2.25.75c0-1.24264 1.00736-2.25 2.25-2.25h15c1.2426 0 2.25 1.00736 2.25 2.25v15c0 1.2426-1.0074 2.25-2.25 2.25h-15c-1.24264 0-2.25-1.0074-2.25-2.25z" />
      <path d="m8 2.25c.41421 0 .75.33579.75.75v18c0 .4142-.33579.75-.75.75s-.75-.3358-.75-.75v-18c0-.41421.33579-.75.75-.75z" />
      <path d="m5.75 21c0-.4142.33579-.75.75-.75h3c.41421 0 .75.3358.75.75s-.33579.75-.75.75h-3c-.41421 0-.75-.3358-.75-.75z" />
      <path d="m5.75 3c0-.41421.33579-.75.75-.75h3c.41421 0 .75.33579.75.75s-.33579.75-.75.75h-3c-.41421 0-.75-.33579-.75-.75z" />
    </g>
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
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Keep pins in sync if the top bar changes them.
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

  const accessibleGroups = NAV_SECTIONS.filter(s => s.items.some(i => can(i.module)));

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
      style={{
        width: collapsed ? RAIL_W_COLLAPSED : RAIL_W_OPEN,
        height: '100%',
        backgroundColor: RAIL_BG,
        borderRight: `1px solid ${BORDER}`,
        userSelect: 'none',
        transition: 'width 0.15s ease',
      }}
    >
      {/* Menu header + collapse/expand toggle. */}
      {collapsed ? (
        <div className="flex flex-col items-center gap-2" style={{ padding: '9px 0', borderBottom: `1px solid ${BORDER}` }}>
          <button
            onClick={toggleCollapsed}
            title="Expand menu"
            aria-label="Expand menu"
            style={{ color: COLOR_OWNER, display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <SidebarToggleIcon size={18} />
          </button>
          <span
            onClick={toggleCollapsed}
            style={{ writingMode: 'vertical-rl', fontSize: 15, letterSpacing: '0.14em', textTransform: 'uppercase', color: COLOR_OWNER, fontWeight: 500, cursor: 'pointer' }}
          >
            Menu
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2" style={{ padding: '8px 12px', borderBottom: `1px solid ${BORDER}` }}>
          <button
            onClick={toggleCollapsed}
            title="Collapse menu"
            aria-label="Collapse menu"
            style={{ color: COLOR_OWNER, display: 'flex', alignItems: 'center', padding: 2 }}
          >
            <SidebarToggleIcon size={18} />
          </button>
          <span style={{ fontSize: 15, letterSpacing: '0.10em', textTransform: 'uppercase', color: COLOR_OWNER, fontWeight: 500 }}>
            Menu
          </span>
        </div>
      )}

      {/* Nav — hidden while collapsed. */}
      {!collapsed && (
        <>
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
                    {/* PROVISIONED: Network Cluster under Settings, ungated for now. */}
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
        </>
      )}
    </nav>
  );
}

export default Sidebar;