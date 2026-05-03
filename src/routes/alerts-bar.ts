// ============================================================================
// BFF route — Alerts Bar cells
// ----------------------------------------------------------------------------
// Proxies GET/PUT /api/v1/alerts-bar/cells to the C++ backend.
//
// Auth flow (different from most routes — first user-scoped endpoint):
//   1. Browser sends `nexrisk_session` cookie (opaque session id).
//   2. fastify.authenticate validates the session and populates request.nexriskUser.
//   3. We pull the JWT off the session via sessionStore, then forward it as
//      Authorization: Bearer <jwt> on the backend call.
//
// The backend reads user_id from the JWT and keys cells per-user.
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';

const SESSION_COOKIE = 'nexrisk_session';

// ── Schemas (mirror backend validation rules) ────────────────────────────────

const cellSchema = z.object({
  source_type: z.literal('mt5'),
  source_id:   z.string().min(1).max(128),
  symbol:      z.string().min(1).max(64),
});

const saveCellsBody = z.object({
  cells: z.array(cellSchema).max(4),
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

export async function alertsBarRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/alerts-bar/cells
   * Returns the current user's saved cells (sorted by cell_index ascending).
   * Empty array when not yet configured.
   */
  fastify.get(
    '/alerts-bar/cells',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/alerts-bar/cells',
        undefined,
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * PUT /api/v1/alerts-bar/cells
   * Replaces the current user's cells with the supplied array.
   * cell_index is derived from array order (no need to send it).
   * Empty `cells` clears the bar. Maximum 4 entries.
   */
  fastify.put(
    '/alerts-bar/cells',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = saveCellsBody.parse(request.body);
      const response = await nexriskApi.put(
        '/api/v1/alerts-bar/cells',
        body,
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}