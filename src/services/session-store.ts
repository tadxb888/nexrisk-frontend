import { randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  email: string;
  /** Present on real login sessions; absent on setup-flow sessions. Added to
   *  the C++ /api/v1/auth/login response body (AuthEndpoint.cpp L677-678). */
  first_name?: string;
  last_name?: string;
  role: string;
  role_label: string;
  can_trade: boolean;
}

export interface BFFSession {
  sessionId: string;
  accessToken: string;
  user: SessionUser;
  permissions: Record<string, string>;
  /** Transient — held only between setup steps 1 and 3. Cleared on completion. */
  enrollmentToken?: string;
  createdAt: number;
  lastAccessedAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

/** 8 hours — mirrors the refresh token TTL */
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const _store = new Map<string, BFFSession>();

// Prune expired sessions every 30 minutes. .unref() prevents this from keeping
// the Node process alive after all real work is done.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of _store.entries()) {
    if (now - session.lastAccessedAt > SESSION_MAX_AGE_MS) {
      _store.delete(id);
    }
  }
}, 30 * 60 * 1000).unref();

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

export const sessionStore = {
  /**
   * Create a new session and return its ID.
   * The session ID is set as the `nexrisk_session` HttpOnly cookie.
   */
  create(
    data: Pick<BFFSession, 'accessToken' | 'user' | 'permissions'> &
      Partial<Pick<BFFSession, 'enrollmentToken'>>,
  ): string {
    const sessionId = randomBytes(32).toString('hex');
    const now = Date.now();
    _store.set(sessionId, {
      ...data,
      sessionId,
      createdAt: now,
      lastAccessedAt: now,
    });
    return sessionId;
  },

  /**
   * Look up a session by ID. Returns `undefined` if not found or expired.
   * Touching a session updates `lastAccessedAt`.
   */
  get(sessionId: string): BFFSession | undefined {
    const session = _store.get(sessionId);
    if (!session) return undefined;
    if (Date.now() - session.lastAccessedAt > SESSION_MAX_AGE_MS) {
      _store.delete(sessionId);
      return undefined;
    }
    session.lastAccessedAt = Date.now();
    return session;
  },

  /**
   * Partially update a session (e.g. after a silent token refresh).
   */
  update(
    sessionId: string,
    patch: Partial<Pick<BFFSession, 'accessToken' | 'permissions' | 'enrollmentToken'>>,
  ): boolean {
    const session = _store.get(sessionId);
    if (!session) return false;
    Object.assign(session, patch, { lastAccessedAt: Date.now() });
    return true;
  },

  /**
   * Destroy a session (logout or failed refresh).
   */
  delete(sessionId: string): void {
    _store.delete(sessionId);
  },

  /** Diagnostic — current number of live sessions. */
  size(): number {
    return _store.size;
  },
};