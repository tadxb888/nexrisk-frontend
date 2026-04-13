import { useAuth, PERM_ORDER, type PermLevel, type Permissions } from '@/stores/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper — usable outside React (e.g. in route config arrays)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the given permissions map satisfies the required level.
 *
 * Hierarchy (low → high): NONE < VIEW < EDIT < FULL < CRUD < SU
 *
 * @example
 * hasPermission(permissions, 'hedge_strat', 'EDIT')  // true for Dealer+
 * hasPermission(permissions, 'dom_trader',  'FULL')  // true for Broker-Dealer, Risk Mgr
 */
export function hasPermission(
  permissions: Permissions,
  module: string,
  required: PermLevel,
): boolean {
  const actual = (permissions[module] ?? 'NONE') as PermLevel;
  return PERM_ORDER.indexOf(actual) >= PERM_ORDER.indexOf(required);
}

// ─────────────────────────────────────────────────────────────────────────────
// React hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a `can(module, required)` function bound to the current user's permissions.
 *
 * @example
 * const { can, canTrade } = usePermission();
 * if (can('hedge_strat', 'EDIT')) { ... }
 */
export function usePermission() {
  const { permissions, user } = useAuth();
  return {
    can: (module: string, required: PermLevel): boolean =>
      hasPermission(permissions, module, required),
    /** true only for Broker-Dealer, Risk Manager, and Root */
    canTrade: user?.can_trade === true,
    permissions,
  };
}