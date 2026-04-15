import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type PermLevel } from '@/stores/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, user must have at least this level on this module */
  module?: string;
  requiredLevel?: PermLevel;
}

/**
 * Wraps a route to enforce authentication (and optionally a permission level).
 *
 * - While the initial /auth/me probe is in-flight → neutral loading screen.
 * - Not authenticated → redirect to /login, preserving the intended URL.
 * - Authenticated but missing required permission → 403 screen.
 */
export function ProtectedRoute({ children, module, requiredLevel }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#232326',
        fontFamily: '"IBM Plex Mono", monospace',
        color: '#808080',
        fontSize: 13,
        letterSpacing: '0.05em',
      }}>
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (module && requiredLevel && !hasPermission(module, requiredLevel)) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#232326',
        fontFamily: '"IBM Plex Mono", monospace',
        color: '#808080',
        gap: 12,
      }}>
        <span style={{ fontSize: 32 }}>⛔</span>
        <span style={{ fontSize: 14, color: '#fff' }}>Access Denied</span>
        <span style={{ fontSize: 12 }}>
          You do not have {requiredLevel} permission for this module.
        </span>
      </div>
    );
  }

  return <>{children}</>;
}