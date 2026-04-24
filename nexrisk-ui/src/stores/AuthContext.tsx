import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  role_label: string;
  can_trade: boolean;
  first_name?: string;
  last_name?: string;
}

export const PERM_ORDER = ['NONE', 'VIEW', 'EDIT', 'FULL', 'CRUD', 'SU'] as const;
export type PermLevel = (typeof PERM_ORDER)[number];
export type Permissions = Record<string, string>;

export interface AuthContextValue {
  user: AuthUser | null;
  permissions: Permissions;
  isAuthenticated: boolean;
  /** True while the initial /auth/me probe is in-flight */
  isLoading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /** Called by SetupPage after successful TOTP verify to hydrate the session */
  completeSetup: (user: AuthUser, permissions: Permissions) => void;
  hasPermission: (module: string, required: PermLevel) => boolean;
}

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; gate: 'MUST_CHANGE_PASSWORD'; isRoot: boolean }
  | { ok: false; gate: 'TOTP_NOT_ENROLLED' }
  | { ok: false; needsTotp: true };

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<AuthUser | null>(null);
  const [permissions, setPermissions] = useState<Permissions>({});
  const [isLoading, setIsLoading]     = useState(true);

  // ── Restore session on mount ──────────────────────────────────────────────
  // The BFF /auth/me endpoint reads the nexrisk_session HttpOnly cookie and
  // returns the user + permissions without any token in the browser.
  useEffect(() => {
    let cancelled = false;

    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setPermissions(data.permissions ?? {});
        }
        // 401 = no active session — stay logged out, not an error
      })
      .catch(() => { /* network error — treat as unauthenticated */ })
      .finally(() => { if (!cancelled) setIsLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (
    email: string,
    password: string,
    totpCode?: string,
  ): Promise<LoginResult> => {
    const body: Record<string, string> = { email, password };
    if (totpCode) body.totp_code = totpCode;

    let res: Response;
    try {
      res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: 'Network error. Please check your connection.' };
    }

    const data = await res.json().catch(() => ({}));

    if (res.status === 403 && data.status === 'MUST_CHANGE_PASSWORD') {
      return { ok: false, gate: 'MUST_CHANGE_PASSWORD', isRoot: data.is_root === true };
    }
    if (res.status === 403 && data.status === 'TOTP_NOT_ENROLLED') {
      return { ok: false, gate: 'TOTP_NOT_ENROLLED' };
    }

    // 400 + error === 'Bad Request' means password was correct but totp_code was absent.
    // This is how the backend signals TOTP is needed — not a credentials error.
    if (res.status === 400 && data.error === 'Bad Request') {
      return { ok: false, needsTotp: true };
    }

    if (!res.ok) {
      return { ok: false, error: data.message ?? data.error ?? `Error ${res.status}` };
    }

    setUser(data.user);
    setPermissions(data.permissions ?? {});
    return { ok: true };
  }, []);

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
    setPermissions({});
  }, []);

  // ── completeSetup — called by SetupPage after TOTP verify ─────────────────
  const completeSetup = useCallback((u: AuthUser, p: Permissions) => {
    setUser(u);
    setPermissions(p);
  }, []);

  // ── hasPermission ─────────────────────────────────────────────────────────
  const hasPermission = useCallback((module: string, required: PermLevel): boolean => {
    const actual = (permissions[module] ?? 'NONE') as PermLevel;
    return PERM_ORDER.indexOf(actual) >= PERM_ORDER.indexOf(required);
  }, [permissions]);

  return (
    <AuthContext.Provider value={{
      user,
      permissions,
      isAuthenticated: user !== null,
      isLoading,
      login,
      logout,
      completeSetup,
      hasPermission,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}