// ============================================================
// Hedging Strategies — BFF Route Module
//
// Mount prefix: /api/v1 (registered in server.ts)
//
// REGISTRATION — add to server.ts:
//   import { hedgingRoutes } from './routes/hedging.js';
//   await api.register(hedgingRoutes);
//
// Section status mirrors API v1.3:
//   Section 3 — Rules CRUD              🟢 Live
//   Section 4 — Route Sanity Config     🟢 Live
//   Section 5 — Escalated Positions     🟢 Live
//   Section 6 — LP Health               🟢 Live
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Param schemas ─────────────────────────────────────────────
const ruleIdParams = z.object({
  rule_id: z.coerce.number().int().positive(),
});

const recordIdParams = z.object({
  record_id: z.coerce.number().int().positive(),
});

// ── Route module ──────────────────────────────────────────────
export async function hedgingRoutes(fastify: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════
  // Section 3 — Hedging Rules CRUD  🟢
  // ══════════════════════════════════════════════════════════

  /** GET /hedge/rules — list all rules, optional ?status= filter */
  fastify.get(
    '/hedge/rules',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/hedge/rules',
        request.query as Record<string, unknown>,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** GET /hedge/rules/:rule_id — single rule */
  fastify.get(
    '/hedge/rules/:rule_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/hedge/rules/${rule_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** POST /hedge/rules — create strategy */
  fastify.post(
    '/hedge/rules',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/hedge/rules', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    },
  );

  /** PUT /hedge/rules/:rule_id — update strategy (partial) */
  fastify.put(
    '/hedge/rules/:rule_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.put(`/api/v1/hedge/rules/${rule_id}`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** DELETE /hedge/rules/:rule_id — delete strategy */
  fastify.delete(
    '/hedge/rules/:rule_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/hedge/rules/${rule_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** POST /hedge/rules/:rule_id/activate */
  fastify.post(
    '/hedge/rules/:rule_id/activate',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/hedge/rules/${rule_id}/activate`, {});
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** POST /hedge/rules/:rule_id/pause */
  fastify.post(
    '/hedge/rules/:rule_id/pause',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/hedge/rules/${rule_id}/pause`, {});
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** POST /hedge/rules/:rule_id/stop */
  fastify.post(
    '/hedge/rules/:rule_id/stop',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/hedge/rules/${rule_id}/stop`, {});
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ══════════════════════════════════════════════════════════
  // Section 4 — Route Sanity Config  🟢
  // ══════════════════════════════════════════════════════════

  /** GET /hedge/rules/:rule_id/sanity-config
   *  Returns per-rule config, or falls back to global default for the rule's LP.
   */
  fastify.get(
    '/hedge/rules/:rule_id/sanity-config',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/hedge/rules/${rule_id}/sanity-config`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** PUT /hedge/rules/:rule_id/sanity-config — upsert per-rule sanity config */
  fastify.put(
    '/hedge/rules/:rule_id/sanity-config',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.put(
        `/api/v1/hedge/rules/${rule_id}/sanity-config`,
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** DELETE /hedge/rules/:rule_id/sanity-config — revert to global default */
  fastify.delete(
    '/hedge/rules/:rule_id/sanity-config',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { rule_id } = ruleIdParams.parse(request.params);
      const response = await nexriskApi.delete(
        `/api/v1/hedge/rules/${rule_id}/sanity-config`,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** GET /hedge/sanity-config/default — global default(s), ?lp_id= filter */
  fastify.get(
    '/hedge/sanity-config/default',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/hedge/sanity-config/default',
        request.query as Record<string, unknown>,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /** PUT /hedge/sanity-config/default — upsert global default for an LP */
  fastify.put(
    '/hedge/sanity-config/default',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.put(
        '/api/v1/hedge/sanity-config/default',
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ══════════════════════════════════════════════════════════
  // Section 5 — Escalated Positions  🟢
  // All 5 endpoints live in EscalatedPositionsEndpoint.cpp.
  // Migrations 012 + 013 applied.
  // ══════════════════════════════════════════════════════════

  /**
   * GET /hedge/positions/escalated
   * Returns all unacknowledged escalated positions, oldest first.
   * Frontend filters client-side by rule_id for the per-strategy view.
   * Optional ?state= filter: TIMEOUT_ESCALATED | REJECTED_ESCALATED | NORMALIZER_ERROR
   */
  fastify.get(
    '/hedge/positions/escalated',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/hedge/positions/escalated',
        request.query as Record<string, unknown>,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /**
   * POST /hedge/positions/:record_id/retry
   * Re-sends the hedge order. Valid for TIMEOUT_ESCALATED and REJECTED_ESCALATED only.
   * Transitions to PENDING.
   */
  fastify.post(
    '/hedge/positions/:record_id/retry',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { record_id } = recordIdParams.parse(request.params);
      const response = await nexriskApi.post(
        `/api/v1/hedge/positions/${record_id}/retry`,
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /**
   * POST /hedge/positions/:record_id/force-close
   * Sends a close order to the LP using lp_position_id.
   * IMPORTANT: Only valid when lp_position_id is non-null.
   * C++ returns 400 if lp_position_id is null — UI must disable this button in that case.
   * Transitions to CLOSING.
   */
  fastify.post(
    '/hedge/positions/:record_id/force-close',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { record_id } = recordIdParams.parse(request.params);
      const response = await nexriskApi.post(
        `/api/v1/hedge/positions/${record_id}/force-close`,
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /**
   * POST /hedge/positions/:record_id/bbook
   * Marks position as broker risk-accepted. Transitions to B_BOOKED.
   * No LP order sent.
   */
  fastify.post(
    '/hedge/positions/:record_id/bbook',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { record_id } = recordIdParams.parse(request.params);
      const response = await nexriskApi.post(
        `/api/v1/hedge/positions/${record_id}/bbook`,
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /**
   * POST /hedge/positions/:record_id/acknowledge
   * Dismisses the escalation alert without trading action.
   * Sets acknowledged_by / acknowledged_at — removes from escalation queue.
   */
  fastify.post(
    '/hedge/positions/:record_id/acknowledge',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { record_id } = recordIdParams.parse(request.params);
      const response = await nexriskApi.post(
        `/api/v1/hedge/positions/${record_id}/acknowledge`,
        request.body,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ══════════════════════════════════════════════════════════
  // Section 6 — LP Health  🟢
  // Polled every 5s by the frontend.
  // ══════════════════════════════════════════════════════════

  /** GET /hedge/lp-health — all LPs, or ?lp_id= for a single LP */
  fastify.get(
    '/hedge/lp-health',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/hedge/lp-health',
        request.query as Record<string, unknown>,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  // ══════════════════════════════════════════════════════════════
  // Section 7 — Hedge Records  🟢
  // Both endpoints live in HedgeRecordsEndpoint.cpp.
  // Backend for the A-Book Hedge Ledger and strategy enrichment.
  // ══════════════════════════════════════════════════════════════

  /**
   * GET /hedge/records
   * Full hedge order history — filterable by rule_id, hedge_state,
   * hedging_lp_id, mt5_symbol, login_id, from/to, page, page_size.
   * Used by ExecutionReport to enrich fills with rule_id / rule_name.
   */
  fastify.get(
    '/hedge/records',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get(
        '/api/v1/hedge/records',
        request.query as Record<string, unknown>,
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );

  /**
   * GET /hedge/records/:record_id
   * Single hedge record with partial fill chain.
   */
  fastify.get(
    '/hedge/records/:record_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { record_id } = recordIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/hedge/records/${record_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );
}