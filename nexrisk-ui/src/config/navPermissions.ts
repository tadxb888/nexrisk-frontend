// ============================================
// Navigation + permission-module map
//
// Single source of truth for the menu structure AND the route→module
// mapping. Consumed by:
//   • TopBar              — menu/favourites visibility (>= VIEW to show)
//   • RoutePermissionGuard — route gating (NONE/missing blocks the route)
//
// Each item carries the permission `module` key it gates against. See
// Frontend_Role_Menu_Spec.md for the authoritative menu→module table.
// ============================================

export interface SubItem {
  path: string;
  label: string;
  /** Permission module key. Item is visible/routable only when the user's
   *  level for this module is >= VIEW. */
  module: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: SubItem[];
}

// ── Navigation definition ────────────────────────────────────
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { path: '/',              label: 'Cockpit',      module: 'cockpit' },
      { path: '/portfolio',     label: 'Portfolio',    module: 'portfolio' },
      { path: '/net-exposure',  label: 'Net Exposure', module: 'net_exposure' },
    ],
  },
  {
    id: 'flow',
    label: 'Intel',
    items: [
      { path: '/flow',         label: 'Profiler',     module: 'focus' },
      { path: '/predictions',  label: 'Predictions',  module: 'predictions' },
      { path: '/archetypes',   label: 'Archetypes',   module: 'archetype' },
      { path: '/risk-charter', label: 'Risk Charter', module: 'charter' },
    ],
  },
  {
    id: 'execution',
    label: 'Execution',
    items: [
      { path: '/b-book',              label: 'B-Book',             module: 'bbook' },
      { path: '/coverage-book',       label: 'Coverage Book',      module: 'coverage' },
      { path: '/hedging-strategies',  label: 'Hedging Strategies', module: 'hedge_strat' },
      { path: '/execution-report',    label: 'Execution Report',   module: 'exec_report' },
    ],
  },
  {
    id: 'markets',
    label: 'Markets',
    items: [
      { path: '/liquidity-providers', label: 'Liquidity Providers', module: 'lp_admin' },
      { path: '/symbol-mapping',      label: 'Symbol Mapping',      module: 'symbol_map' },
      { path: '/route-sanity',        label: 'Route Sanity',        module: 'route_sanity' },
      { path: '/price-rules',         label: 'Price Rules Engine',  module: 'price_rules' },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    items: [
      { path: '/logs',     label: 'Logs',     module: 'logs' },
      { path: '/reports',  label: 'Reports',  module: 'reports' },
      { path: '/users',    label: 'Users',    module: 'users' },
      { path: '/settings', label: 'Settings', module: 'settings' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { path: '/mt5-servers', label: 'MT5 Servers', module: 'mt5_servers' },
    ],
  },
];

// ── Path → permission module resolver ────────────────────────
/**
 * Resolve the permission module that owns a route path.
 *
 * Order: exact nav match → settings/cockpit sub-trees → generic prefix match.
 * Returns `undefined` for routes outside the nav (e.g. /a-book,
 * /command-center, /flow-hedging, /business, legacy redirects) — the guard
 * treats `undefined` as "no module gate" (session-only, no data/money).
 */
export function moduleForPath(pathname: string): string | undefined {
  for (const s of NAV_SECTIONS) {
    const exact = s.items.find((i) => i.path === pathname);
    if (exact) return exact.module;
  }
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/cockpit')) return 'cockpit';
  for (const s of NAV_SECTIONS) {
    const pref = s.items.find((i) => i.path !== '/' && pathname.startsWith(i.path));
    if (pref) return pref.module;
  }
  return undefined;
}