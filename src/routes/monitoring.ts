// ============================================================================
// BFF route — Monitoring settings (alert thresholds)
// ----------------------------------------------------------------------------
// Proxies GET/PUT /api/v1/monitoring/config to the C++ backend.
//
// Auth flow follows alerts-bar.ts: session cookie -> fastify.authenticate ->
// pull the JWT off sessionStore -> forward as Authorization: Bearer <jwt>.
// The backend audit-logs writes against the user id on that JWT, so the header
// is required on PUT even though the config itself is node-scoped, not
// user-scoped.
//
// No moduleGate here yet, deliberately. C++ already enforces EDIT/CRUD/FULL/SU
// on `alert_thresholds` for the write, so a BFF gate would be defence in depth,
// not the enforcement. moduleGate resolves session.permissions[module] and
// rankPerm(undefined) is NONE — so if the login permissions map does not carry
// an `alert_thresholds` key, adding the hook 403s every user including root,
// for no security gain. Add it once the key is confirmed present in /auth/me.
//
// A VIEW user reaches the GET and is refused the PUT. The page renders
// read-only for them rather than letting a save fail.
//
// Deliberately thin. The C++ service is authoritative for min/max, enum
// membership, cross-field rules (warn <= alert), row editability and unknown
// key rejection. This layer validates shape only — anything stricter here
// would duplicate a rule that can drift.
//
// Status codes are passed through unchanged: 422 carries errors[] that the
// page renders inline per field, 409 names where a read-only row is editable,
// 400 names an unknown key. Collapsing any of those to 500 breaks the form.
//
// nexriskFetch parses the upstream JSON body into `error` on any >= 400, so
// `reply.code(response.status).send(response.error)` forwards the whole 422
// payload — errors[] included — not just a message string. The ApiError type
// does not declare errors[], but the runtime value is the parsed body.
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';

const SESSION_COOKIE = 'nexrisk_session';

// ── Schemas ──────────────────────────────────────────────────────────────────
// Shape only. Row keys and field keys are open: the backend owns the catalogue
// and returns 400 naming anything it does not recognise. Hard-coding the twelve
// editable rows here would mean a BFF change every time a row is added.

const rowFieldValue = z.union([z.number(), z.boolean()]);

const writeBody = z
  .object({
    rows: z.record(z.string(), z.record(z.string(), rowFieldValue)).optional(),
    alerting: z
      .record(z.string(), z.union([z.number(), z.boolean(), z.string()]))
      .optional(),
  })
  .refine((b) => b.rows !== undefined || b.alerting !== undefined, {
    message: 'Body must contain at least one of "rows" or "alerting".',
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

export async function monitoringRoutes(fastify: FastifyInstance): Promise<void> {

  /**
   * GET /api/v1/monitoring/config
   * Effective monitoring configuration: every row with running / file / default
   * per field, plus node role and the restart_required flag.
   *
   * Not a live endpoint — no WebSocket, no polling. Fetch on mount, refetch
   * after a successful save.
   */
  fastify.get(
    '/monitoring/config',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/monitoring/config',
        undefined,
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * PUT /api/v1/monitoring/config
   * Writes only what changed — omitted rows and fields are left untouched.
   * All or nothing: if any field fails validation the backend writes nothing.
   *
   * Writes `file`, not `running`. A successful save does not change what the
   * service is enforcing; that needs a restart. The response's
   * restart_required and applied{} are what the page shows the user.
   */
  fastify.put(
    '/monitoring/config',
    { preHandler: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = writeBody.parse(request.body);
      const response = await nexriskApi.put(
        '/api/v1/monitoring/config',
        body,
        authHeaders(request)
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}