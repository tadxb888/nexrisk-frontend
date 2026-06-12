import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { moduleGate } from '../middleware/auth.js';
import { z } from 'zod';
import { nexriskApi, nexriskFetch } from '../services/nexrisk-api.js';

// ─────────────────────────────────────────────────────────────
// Param / body schemas
// ─────────────────────────────────────────────────────────────

const feedIdParams = z.object({
  feed_id: z.coerce.number().int().positive(),
});

const ruleIdParams = z.object({
  feed_id: z.coerce.number().int().positive(),
  rule_id: z.coerce.number().int().positive(),
});

const eventIdParams = z.object({
  event_id: z.coerce.number().int().positive(),
});

const groupParams = z.object({
  group: z.string().min(1),
});

const groupSymbolParams = z.object({
  group: z.string().min(1),
  symbol: z.string().min(1).max(64),
});

const feedStatusBody = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'STOPPED']),
});

const ruleToggleBody = z.object({
  enabled: z.boolean(),
});

const reorderBody = z.object({
  order: z.array(
    z.object({
      rule_id: z.number().int().positive(),
      priority: z.number().int().positive(),
    })
  ),
});

const newsQuery = z.object({
  symbol: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ─────────────────────────────────────────────────────────────
// Route registration
// ─────────────────────────────────────────────────────────────

export async function priceRulesRoutes(fastify: FastifyInstance): Promise<void> {
  // RBAC: gate this whole plugin to the 'price_rules' module.
  // GET/HEAD require VIEW; mutations require EDIT. (Layered over existing
  // requireCapability checks — can only further restrict, never loosen.)
  fastify.addHook('preHandler', moduleGate('price_rules'));

  // ══════════════════════════════════════════════════════════
  // A. FEED CONFIGURATION
  // ══════════════════════════════════════════════════════════

  /** GET /feeds — list all feed configs (priority ASC) */
  fastify.get(
    '/feeds',
    { preHandler: [fastify.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.get('/api/v1/feeds');
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** GET /feeds/stats — pipeline statistics */
  fastify.get(
    '/feeds/stats',
    { preHandler: [fastify.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.get('/api/v1/feeds/stats');
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** GET /feeds/:feed_id — single feed config */
  fastify.get(
    '/feeds/:feed_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.get(`/api/v1/feeds/${feed_id}`);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /feeds — create feed config */
  fastify.post(
    '/feeds',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.post('/api/v1/feeds', req.body);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.code(201).send(r.data);
    }
  );

  /** PUT /feeds/:feed_id — update feed config (partial) */
  fastify.put(
    '/feeds/:feed_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.put(`/api/v1/feeds/${feed_id}`, req.body);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** DELETE /feeds/:feed_id */
  fastify.delete(
    '/feeds/:feed_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.delete(`/api/v1/feeds/${feed_id}`);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** PATCH /feeds/:feed_id/status — status-only update */
  fastify.patch(
    '/feeds/:feed_id/status',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const body = feedStatusBody.parse(req.body);
      const r = await nexriskFetch(`/api/v1/feeds/${feed_id}/status`, {
        method: 'PATCH',
        body,
      });
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /feeds/:feed_id/reload — force config reload on C++ service */
  fastify.post(
    '/feeds/:feed_id/reload',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.post(`/api/v1/feeds/${feed_id}/reload`);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  // ══════════════════════════════════════════════════════════
  // B. SPREAD RULES
  // ══════════════════════════════════════════════════════════

  /** GET /price-rules/feeds/:feed_id/rules — list rules (priority ASC) */
  fastify.get(
    '/price-rules/feeds/:feed_id/rules',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.get(`/api/v1/price-rules/feeds/${feed_id}/rules`);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /price-rules/feeds/:feed_id/rules — create rule */
  fastify.post(
    '/price-rules/feeds/:feed_id/rules',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const r = await nexriskApi.post(`/api/v1/price-rules/feeds/${feed_id}/rules`, req.body);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.code(201).send(r.data);
    }
  );

  /** PUT /price-rules/feeds/:feed_id/rules/:rule_id — update rule */
  fastify.put(
    '/price-rules/feeds/:feed_id/rules/:rule_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id, rule_id } = ruleIdParams.parse(req.params);
      const r = await nexriskApi.put(
        `/api/v1/price-rules/feeds/${feed_id}/rules/${rule_id}`,
        req.body
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** PATCH /price-rules/feeds/:feed_id/rules/:rule_id/toggle */
  fastify.patch(
    '/price-rules/feeds/:feed_id/rules/:rule_id/toggle',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id, rule_id } = ruleIdParams.parse(req.params);
      const body = ruleToggleBody.parse(req.body);
      const r = await nexriskFetch(
        `/api/v1/price-rules/feeds/${feed_id}/rules/${rule_id}/toggle`,
        { method: 'PATCH', body }
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** DELETE /price-rules/feeds/:feed_id/rules/:rule_id */
  fastify.delete(
    '/price-rules/feeds/:feed_id/rules/:rule_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id, rule_id } = ruleIdParams.parse(req.params);
      const r = await nexriskApi.delete(
        `/api/v1/price-rules/feeds/${feed_id}/rules/${rule_id}`
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /price-rules/feeds/:feed_id/rules/reorder — drag-drop priority update */
  fastify.post(
    '/price-rules/feeds/:feed_id/rules/reorder',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { feed_id } = feedIdParams.parse(req.params);
      const body = reorderBody.parse(req.body);
      const r = await nexriskApi.post(
        `/api/v1/price-rules/feeds/${feed_id}/rules/reorder`,
        body
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  // ══════════════════════════════════════════════════════════
  // C. NEWS EVENTS
  // ══════════════════════════════════════════════════════════

  /** GET /price-rules/news */
  fastify.get(
    '/price-rules/news',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const q = newsQuery.parse(req.query);
      const r = await nexriskApi.get('/api/v1/price-rules/news', {
        ...(q.symbol ? { symbol: q.symbol } : {}),
        ...(q.from ? { from: q.from } : {}),
        ...(q.to ? { to: q.to } : {}),
        limit: q.limit,
      });
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /price-rules/news — create news event */
  fastify.post(
    '/price-rules/news',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.post('/api/v1/price-rules/news', req.body);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.code(201).send(r.data);
    }
  );

  /** PUT /price-rules/news/:event_id */
  fastify.put(
    '/price-rules/news/:event_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { event_id } = eventIdParams.parse(req.params);
      const r = await nexriskApi.put(`/api/v1/price-rules/news/${event_id}`, req.body);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** DELETE /price-rules/news/:event_id */
  fastify.delete(
    '/price-rules/news/:event_id',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { event_id } = eventIdParams.parse(req.params);
      const r = await nexriskApi.delete(`/api/v1/price-rules/news/${event_id}`);
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  // ══════════════════════════════════════════════════════════
  // D. GROUP SPREAD MANAGEMENT
  // ══════════════════════════════════════════════════════════

  /** GET /group-spreads — all group spread rules */
  fastify.get(
    '/group-spreads',
    { preHandler: [fastify.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.get('/api/v1/group-spreads');
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** GET /group-spreads/:group — all rules for one MT5 group
   *  Fastify decodes %5C → \  so we re-encode before forwarding. */
  fastify.get(
    '/group-spreads/:group',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { group } = groupParams.parse(req.params);
      const r = await nexriskApi.get(
        `/api/v1/group-spreads/${encodeURIComponent(group)}`
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** GET /group-spreads/:group/:symbol — single rule with live MT5 diff */
  fastify.get(
    '/group-spreads/:group/:symbol',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { group, symbol } = groupSymbolParams.parse(req.params);
      const r = await nexriskApi.get(
        `/api/v1/group-spreads/${encodeURIComponent(group)}/${symbol}`
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** PUT /group-spreads/:group/:symbol — set spread (saves + applies to MT5) */
  fastify.put(
    '/group-spreads/:group/:symbol',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { group, symbol } = groupSymbolParams.parse(req.params);
      const r = await nexriskApi.put(
        `/api/v1/group-spreads/${encodeURIComponent(group)}/${symbol}`,
        req.body
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** DELETE /group-spreads/:group/:symbol — reset spread to floating (0) */
  fastify.delete(
    '/group-spreads/:group/:symbol',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { group, symbol } = groupSymbolParams.parse(req.params);
      const r = await nexriskApi.delete(
        `/api/v1/group-spreads/${encodeURIComponent(group)}/${symbol}`
      );
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );

  /** POST /group-spreads/sync — re-apply all DB rules to MT5 */
  fastify.post(
    '/group-spreads/sync',
    { preHandler: [fastify.authenticate] },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const r = await nexriskApi.post('/api/v1/group-spreads/sync');
      if (!r.ok) return reply.code(r.status).send(r.error);
      return reply.send(r.data);
    }
  );
}