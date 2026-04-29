// =============================================================================
// charts.ts — BFF pass-through for the NexRisk Charts API
//
// Per Q6 (Ross): every chart call goes through Fastify on 8080. Frontend never
// hits the C++ backend (8090) directly. Single consolidated route file — no
// transformation, no response shaping, no shims. The C++ backend's response
// shape is the contract; this file just relays it to the browser.
//
// Endpoints proxied (all GET, all read-only):
//   /api/v1/charts/most-traded-symbols       (Chart 1)
//   /api/v1/charts/hourly-pnl                (Chart 2)
//   /api/v1/portfolio/pnl-history            (Chart 3 — pre-existing endpoint)
//   /api/v1/charts/symbols-hedge             (Chart 4)
//   /api/v1/charts/cost-summary              (Chart 5)
//   /api/v1/charts/top-holders               (Chart 6)
//   /api/v1/charts/net-volume-by-book        (Chart 7)
//   /api/v1/exposure/refresh    [POST]       (Chart 7 manual refresh — Q5)
//
// Capability:
//   Charts don't have a dedicated capability today. Using `positions.read`
//   as the closest semantic match (operational broker data, read-only).
//   When/if a dedicated `charts.read` capability is added, change the
//   strings here in one place.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Query schemas ─────────────────────────────────────────────────────────
// All chart query params are optional. Validation is deliberately permissive:
// the C++ backend has its own validation and we don't want to double-validate.
// We only enforce that values are strings when present (Zod handles the
// type coercion via z.coerce).

/** Common ISO 8601 from/to + optional limit. Used by charts 1, 2, 4, 5. */
const periodWithLimitQuery = z.object({
  from:  z.string().optional(),
  to:    z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

/** Limit-only — Chart 6 (Top Holders) ignores from/to backend-side, Chart 7
 *  ignores from/to entirely (snapshot endpoint). */
const limitOnlyQuery = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────

/** Strip undefined values so the URL-builder doesn't emit `?from=undefined`. */
function clean(query: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  const out: Record<string, string | number | boolean | undefined> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v as string | number | boolean;
    }
  }
  return out;
}

// ── Route registration ────────────────────────────────────────────────────

export async function chartsRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Chart 1: Most Traded Symbols (B-Book) ──────────────────────────────
  fastify.get(
    '/charts/most-traded-symbols',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = periodWithLimitQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/most-traded-symbols', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 2: A/B/C Combination — Hourly P&L ─────────────────────────────
  fastify.get(
    '/charts/hourly-pnl',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = periodWithLimitQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/hourly-pnl', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 3: Portfolio Performance — Daily P&L History ─────────────────
  // INTENTIONALLY NOT REGISTERED HERE.
  //
  // /api/v1/portfolio/pnl-history is a pre-existing endpoint already served
  // by `portfolioRoutes` in server.ts. Registering it again in this file
  // causes Fastify to throw FST_ERR_DUPLICATED_ROUTE at register time,
  // which fails the entire /api/v1 plugin chain — breaking auth, users,
  // and every other route in that block.
  //
  // The frontend client (`chartsApi.ts → fetchPnlHistory()`) calls
  // `/api/v1/portfolio/pnl-history` directly and hits the existing
  // portfolioRoutes handler. No frontend change needed.
  //
  // If portfolioRoutes ever stops serving that path, restore here.

  // ── Chart 4: Symbols Hedge ─────────────────────────────────────────────
  fastify.get(
    '/charts/symbols-hedge',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = periodWithLimitQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/symbols-hedge', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 5: Cost: Revenues & Expenses — Monthly ───────────────────────
  fastify.get(
    '/charts/cost-summary',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = periodWithLimitQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/cost-summary', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 6: Top 30 Holders ────────────────────────────────────────────
  // Period FIXED to month-to-date — backend ignores from/to. Only `limit`
  // is meaningful here.
  fastify.get(
    '/charts/top-holders',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = limitOnlyQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/top-holders', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 7: A/B/C Net Volume ──────────────────────────────────────────
  // Snapshot endpoint — no period at all; just `limit`.
  fastify.get(
    '/charts/net-volume-by-book',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = limitOnlyQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/charts/net-volume-by-book', clean(query));
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ── Chart 7 manual refresh — POST /api/v1/exposure/refresh ─────────────
  // Per Q5: a Refresh button next to the as_of timestamp. Operator-driven,
  // not auto-fired. Forces the C++ ExposureEngine to recompute snapshots.
  fastify.post(
    '/exposure/refresh',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/exposure/refresh');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );
}