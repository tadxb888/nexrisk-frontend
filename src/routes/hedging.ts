// ============================================================
// Hedging Strategies — BFF Route Module
//
// Mount prefix: /api/v1 (registered in server.ts)
//
// REGISTRATION — add to server.ts:
//   import { hedgingRoutes } from './routes/hedging.js';
//   await api.register(hedgingRoutes);
//
// Section status mirrors C++ backend:
//   Section 3 — Rules CRUD         🟢 Implemented and live
//   Section 4 — Route Sanity Config 🟡 Pending C++ implementation
//   Section 6 — LP Health          🟢 Implemented and live
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Param schemas ─────────────────────────────────────────────
const ruleIdParams = z.object({
  rule_id: z.coerce.number().int().positive(),
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
  // Section 4 — Route Sanity Config  🟡
  // Table exists (migration 010). REST handlers pending C++.
  // ══════════════════════════════════════════════════════════

  /** GET /hedge/rules/:rule_id/sanity-config */
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

  /** PUT /hedge/sanity-config/default — upsert global default */
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
  // Section 6 — LP Health  🟢
  // ══════════════════════════════════════════════════════════

  /** GET /hedge/lp-health — all LPs, or ?lp_id= for single */
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
}