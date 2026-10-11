import type { FastifyRequest } from 'fastify';
import type WebSocket from 'ws';
import { config } from '../config.js';
import { sessionStore } from '../services/session-store.js';

/**
 * Session guard for the event WebSockets (/ws/v1/mt5/events, /ws/v1/fix/events,
 * /ws/v1/alerts-bar/events).
 *
 * Two parts:
 *   1. At the handshake — each route lists `fastify.authenticate` as a
 *      preHandler, so a request without a valid `nexrisk_session` cookie is
 *      answered 401 and never upgraded. The browser sends the cookie on the
 *      handshake because the socket is opened on the same host as the page.
 *   2. Afterwards — bindSocketToSession() ties the open socket to the session
 *      it was opened with and closes it once that session ends (logout or
 *      expiry). A handshake check alone would let a socket opened while
 *      logged in keep receiving data for as long as it stays open.
 *
 * The watch uses sessionStore.has(), which is not counted as activity, so an
 * open socket does not keep its session alive.
 *
 * With auth disabled (dev) both parts are no-ops, matching fastify.authenticate.
 */

// Mirrors SESSION_COOKIE in src/middleware/auth.ts and src/routes/auth.ts.
const SESSION_COOKIE = 'nexrisk_session';

/** How often open sockets are checked against their session. */
const SWEEP_INTERVAL_MS = 15_000;

/** Application close code: the session this socket was opened with has ended. */
export const WS_CLOSE_SESSION_ENDED = 4401;

const watched = new Map<WebSocket, string>(); // socket → session id
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function sweep(): void {
  for (const [socket, sessionId] of watched) {
    if (sessionStore.has(sessionId)) continue;
    watched.delete(socket);
    try { socket.close(WS_CLOSE_SESSION_ENDED, 'Session ended'); } catch { /* already closing */ }
  }
}

/**
 * Call first thing in a websocket route handler. Returns false when the socket
 * was refused and closed — the caller must not add it to its client set.
 */
export function bindSocketToSession(socket: WebSocket, request: FastifyRequest): boolean {
  if (!config.authEnabled) return true;

  const sessionId = (request.cookies as Record<string, string | undefined> | undefined)?.[SESSION_COOKIE];
  if (!sessionId || !sessionStore.has(sessionId)) {
    // fastify.authenticate has already passed, so this is only reachable if
    // the session ended between the hook and the upgrade.
    try { socket.close(WS_CLOSE_SESSION_ENDED, 'Session ended'); } catch { /* ignore */ }
    return false;
  }

  watched.set(socket, sessionId);
  socket.once('close', () => watched.delete(socket));
  if (!sweepTimer) {
    sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
    sweepTimer.unref();
  }
  return true;
}
