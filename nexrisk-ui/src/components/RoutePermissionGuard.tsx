import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type PermLevel } from '@/stores/AuthContext';
import { NAV_SECTIONS, moduleForPath } from '@/config/navPermissions';

// ============================================
// RoutePermissionGuard
//
// Mounted as a pathless layout route INSIDE the authenticated <Layout>.
// Blocks any path whose owning permission module is NONE (or missing) for
// the current user and redirects them to their first accessible page.
//
// Paths with no module mapping (hidden/legacy routes — /a-book,
// /command-center, /flow-hedging, /business) pass through untouched.
//
// NOTE: this is UX defense only. Hiding a menu / blocking a route is NOT the
// security boundary — the Fastify server enforces the same `permissions`
// check before proxying to the C++ services (BFF commit, next).
// ============================================

const COLOR_BG     = '#313032';
const COLOR_PANEL  = '#2a292c';
const COLOR_BORDER = '#808080';
const COLOR_ACCENT = '#4ecdc4';
const COLOR_TEXT   = '#e6e6e6';
const COLOR_MUTED  = '#9a9a9a';

/** First nav path the user can VIEW — Cockpit if available, else scan order. */
function firstAccessiblePath(
  hasPermission: (module: string, required: PermLevel) => boolean,
): string | null {
  if (hasPermission('cockpit', 'VIEW')) return '/';
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (hasPermission(item.module, 'VIEW')) return item.path;
    }
  }
  return null;
}

export function RoutePermissionGuard() {
  const location = useLocation();
  const { hasPermission, logout } = useAuth();

  const mod = moduleForPath(location.pathname);

  if (mod && !hasPermission(mod, 'VIEW')) {
    const fallback = firstAccessiblePath(hasPermission);
    if (fallback && fallback !== location.pathname) {
      return <Navigate to={fallback} replace />;
    }
    // No accessible module at all — show a terminal no-access screen rather
    // than redirect-loop. (Shouldn't happen past login, but fail closed.)
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: '60vh', backgroundColor: COLOR_BG, padding: 24 }}
      >
        <div
          className="rounded"
          style={{
            backgroundColor: COLOR_PANEL,
            border: `1px solid ${COLOR_BORDER}`,
            padding: 28,
            maxWidth: 460,
            textAlign: 'center',
          }}
        >
          <div style={{ color: COLOR_ACCENT, fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
            No accessible modules
          </div>
          <div style={{ color: COLOR_TEXT, fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
            Your account doesn&apos;t have view access to any section. Contact an
            administrator to have permissions assigned.
          </div>
          <button
            onClick={() => void logout()}
            className="rounded transition-colors"
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${COLOR_BORDER}`,
              color: COLOR_MUTED,
              fontSize: 12,
              padding: '6px 14px',
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default RoutePermissionGuard;