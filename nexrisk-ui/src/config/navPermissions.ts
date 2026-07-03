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
//
// NOTE: `label` strings are display-only. The `module` keys and route
// `path`s are the stable contract (gates, guard, URLs, C++) and are NOT
// renamed here — only the human-facing labels are.
//
// Groups follow the risk-desk domain split (display-only; the `module`
// keys and `path`s below are unchanged by this regroup):
//   Summary             — at-a-glance firm view
//   Books               — B-Book, Coverage, Net Exposure
//   Execution           — hedging, fills, pricing, routing, LP + symbol config
//   Market Intelligence — trader behaviour, predictions, policy
//   Reports             — audit logs + operational reports
//   Settings            — system, users, MT5 servers
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
    id: 'summary',
    label: 'Summary',
    items: [
      { path: '/',          label: 'Cockpit',   module: 'cockpit' },
      { path: '/portfolio', label: 'Portfolio', module: 'portfolio' },
    ],
  },
  {
    id: 'books',
    label: 'Books',
    items: [
      { path: '/b-book',        label: 'B-Book',        module: 'bbook' },
      { path: '/coverage-book', label: 'Coverage Book', module: 'coverage' },
      { path: '/net-exposure',  label: 'Net Exposure',  module: 'net_exposure' },
    ],
  },
  {
    id: 'execution',
    label: 'Execution',
    items: [
      { path: '/hedging-strategies',  label: 'Hedging Strategies',  module: 'hedge_strat' },
      { path: '/execution-report',    label: 'Execution Report',    module: 'exec_report' },
      { path: '/price-rules',         label: 'Price Rules Engine',  module: 'price_rules' },
      { path: '/route-sanity',        label: 'Route Sanity',        module: 'route_sanity' },
      { path: '/liquidity-providers', label: 'Liquidity Providers', module: 'lp_admin' },
      { path: '/symbol-mapping',      label: 'Symbol Mapping',      module: 'symbol_map' },
    ],
  },
  {
    id: 'intel',
    label: 'Market Intelligence',
    items: [
      { path: '/flow',         label: 'Traders',            module: 'focus' },
      { path: '/archetypes',   label: 'Behaviour Rules',    module: 'archetype' },
      { path: '/predictions',  label: 'Market Predictions', module: 'predictions' },
      { path: '/risk-charter', label: 'Risk Policy',        module: 'charter' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { path: '/logs',    label: 'Audit Logs', module: 'logs' },
      { path: '/reports', label: 'Reports',    module: 'reports' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { path: '/settings',    label: 'System Settings', module: 'settings' },
      { path: '/users',       label: 'Users & Roles',   module: 'users' },
      { path: '/mt5-servers', label: 'MT5 Servers',     module: 'mt5_servers' },
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