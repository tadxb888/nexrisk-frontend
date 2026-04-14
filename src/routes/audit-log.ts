import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Path schemas ──────────────────────────────────────────────

const logIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

// ── Accepted query-param keys (forwarded verbatim to C++) ─────

const AUDIT_QUERY_KEYS = [
  'category',
  'action_type',
  'actor_user_id',
  'actor_email',
  'entity_type',
  'entity_id',
  'lp_id',
  'hedge_rule_id',
  'price_rule_id',
  'mt5_node_id',
  'severity',
  'from',
  'to',
  'source_service',
  'limit',
  'offset',
] as const;

// ── Route module ──────────────────────────────────────────────

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /api/v1/audit/logs ────────────────────────────────────
  // Returns: { total, limit, offset, count, entries[] }  — no { success, data } wrapper.
  fastify.get(
    '/audit/logs',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = request.query as Record<string, string | undefined>;
      const qs = new URLSearchParams();
      for (const key of AUDIT_QUERY_KEYS) {
        const v = q[key];
        if (v !== undefined && v !== '') qs.set(key, v);
      }
      const qstr = qs.toString() ? `?${qs.toString()}` : '';
      const response = await nexriskApi.get(`/api/v1/audit/logs${qstr}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── GET /api/v1/audit/logs/:id ────────────────────────────────
  // Returns: single entry object (same shape as entries[] item).
  fastify.get(
    '/audit/logs/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = logIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/audit/logs/${id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── GET /api/v1/audit/categories ─────────────────────────────
  // Returns: { categories: [{ value, label }] }
  // Static list — cache-friendly, rarely changes.
  fastify.get(
    '/audit/categories',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/audit/categories');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}