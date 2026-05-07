// ============================================================================
// BFF route — Alerts Bar notifications
// ----------------------------------------------------------------------------
// Proxies GET /api/v1/alerts-bar/notifications
//         GET /api/v1/alerts-bar/notifications/latest
// to the C++ backend.
//
// Auth flow (mirrors alerts-bar.ts — the FX-cells route module):
//   1. Browser sends `nexrisk_session` cookie (opaque session id).
//   2. fastify.authenticate validates the session and populates request.nexriskUser.
//   3. We pull the JWT off the session via sessionStore, then forward it as
//      Authorization: Bearer <jwt> on the backend call.
//
// Notifications are app-wide (every authenticated user reads the same stream),
// so unlike the per-user FX cells the JWT is used purely to satisfy the
// backend's AuthMiddleware::Authenticate gate — not for scoping.
//
// No snakeToCamel here — the companion WS proxy (alerts-bar-ws.ts) forwards
// C++ frames verbatim (snake_case), and the frontend's AlertsBarNotification
// type is snake_case-faithful. Forcing camelCase here would create two shapes
// for one stream.
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';

const SESSION_COOKIE = 'nexrisk_session';

// ── Schemas ──────────────────────────────────────────────────────────────────

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
});

// ── Auth forwarding ──────────────────────────────────────────────────────────

/**
 * Build the Authorization header for the backend call by retrieving the
 * user's JWT from sessionStore. Returns an empty object if no session — the
 * preHandler should have caught that already, this is defence-in-depth.
 */
function authHeaders(request: FastifyRequest): Record<string, string> {
  const sessionId = request.cookies?.[SESSION_COOKIE];
  if (!sessionId) return {};
  const session = sessionStore.get(sessionId) as { accessToken?: string } | undefined;
  if (!session?.accessToken) return {};
  return { Authorization: `Bearer ${session.accessToken}` };
}

// ── Route module ─────────────────────────────────────────────────────────────

export async function alertsBarNotificationsRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/alerts-bar/notifications?limit=N
   * Newest-first. Used by:
   *   - frontend mount-time seed (limit=1000)
   *   - CSV export click (limit=1000, canonical from DB)
   */
  fastify.get(
    '/alerts-bar/notifications',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listQuery.parse(request.query);
      const response = await nexriskApi.get(
        '/api/v1/alerts-bar/notifications',
        { limit: query.limit },
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/alerts-bar/notifications/latest
   * Single most-recent notification, or { notification: null } when empty.
   * Used by the frontend on first render before WS connects.
   */
  fastify.get(
    '/alerts-bar/notifications/latest',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/alerts-bar/notifications/latest',
        undefined,
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}