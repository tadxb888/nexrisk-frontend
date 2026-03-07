import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Path / query schemas ──────────────────────────────────────

const lpIdParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
});

const symbolParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
  symbol: z.string().min(1),
});

const orderIdParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
  clord_id: z.string().min(1),
});

const positionIdParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
  position_id: z.string().min(1),
});

const auditQuery = z.object({
  limit: z.coerce.number().int().positive().optional(),
});

// ── Backend 404 quirk ─────────────────────────────────────────
// The C++ backend returns HTTP 404 when an in-memory cache is empty
// (OrderStateMachine, InstrumentCache, PositionCache, FIX message store).
// This is a semantic mismatch — it means "nothing yet", not "resource not found".
//
// Rules:
//   1. Only 404 is swallowed — 500/503/etc propagate as real errors.
//   2. Only swallow if the LP is actually registered. To distinguish "empty cache"
//      from "unknown lp_id", we check GET /api/v1/fix/lp/{lp_id} first.
//      If that also 404s, the LP doesn't exist — propagate the original error.
//   3. Empty envelope shape matches the real response so frontend destructuring
//      hits the same code path regardless.
type EmptyFallback = Record<string, unknown>;
async function emptyOn404(
  response: { ok: boolean; status: number; data?: unknown; error?: unknown },
  lp_id: string,
  fallback: EmptyFallback,
  reply: FastifyReply,
) {
  if (!response.ok) {
    if (response.status === 404) {
      // Verify the LP is actually registered before treating this as an empty cache.
      const lpCheck = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}`);
      if (lpCheck.status === 404) {
        // LP status itself 404s → lp_id is not registered → genuine error, not empty cache.
        return reply.code(404).send(response.error);
      }
      if (!lpCheck.ok) {
        // LP check errored (bridge down, timeout, 500, etc.) → propagate that error.
        return reply.code(lpCheck.status).send(lpCheck.error);
      }
      // LP is known — data cache just hasn't been populated yet.
      return reply.send({ success: true, data: fallback });
    }
    // All other errors (500, 503, etc.) propagate unchanged.
    return reply.code(response.status).send(response.error);
  }
  return reply.send(response.data);
}

// ── Route module ─────────────────────────────────────────────

export async function fixBridgeRoutes(fastify: FastifyInstance): Promise<void> {

  // ════════════════════════════════════════════════════════════
  // LP ADMIN API — /api/v1/fix/admin/*
  // ════════════════════════════════════════════════════════════

  fastify.post(
    '/fix/admin/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/fix/admin/lp', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/admin/lp');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/health',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/admin/health');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/lp/:lp_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/admin/lp/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.put(
    '/fix/admin/lp/:lp_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.put(`/api/v1/fix/admin/lp/${lp_id}`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.delete(
    '/fix/admin/lp/:lp_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/fix/admin/lp/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.put(
    '/fix/admin/lp/:lp_id/credentials',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.put(`/api/v1/fix/admin/lp/${lp_id}/credentials`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/lp/:lp_id/credentials/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/admin/lp/${lp_id}/credentials/status`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/admin/lp/:lp_id/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/admin/lp/${lp_id}/test`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/admin/lp/:lp_id/reload',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/admin/lp/${lp_id}/reload`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/lp/:lp_id/health',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/admin/lp/${lp_id}/health`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/admin/lp/:lp_id/audit',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const query = auditQuery.parse(request.query);
      const qs = query.limit ? `?limit=${query.limit}` : '';
      const response = await nexriskApi.get(`/api/v1/fix/admin/lp/${lp_id}/audit${qs}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ════════════════════════════════════════════════════════════
  // LP OPERATIONAL API — /api/v1/fix/*
  // ════════════════════════════════════════════════════════════

  // ── Bridge Status ───────────────────────────────────────────
  fastify.get(
    '/fix/status',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/status');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Start / Stop LP ─────────────────────────────────────────
  fastify.post(
    '/fix/lp/:lp_id/start',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/start`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/stop',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/stop`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── LP Full Status ──────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Capabilities ────────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id/capabilities',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/capabilities`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Quarantine / Resume ─────────────────────────────────────
  fastify.post(
    '/fix/lp/:lp_id/quarantine',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/quarantine`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/resume',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/resume`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Instruments (static routes before parametric) ───────────
  fastify.get(
    '/fix/lp/:lp_id/instruments',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, instruments: [] }, reply);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/instruments/summary',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments/summary`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/instruments/refresh',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/instruments/refresh`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/instruments/:symbol',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, symbol } = symbolParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments/${symbol}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Market Data ─────────────────────────────────────────────
  // C++ backend uses flat paths with lp_id in body, not in URL.
  // Frontend calls these directly: POST /api/v1/fix/md/subscribe

  fastify.post(
    '/fix/md/subscribe',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> ?? {};
      fastify.log.info({ body }, '[fix] md/subscribe');
      const response = await nexriskApi.post('/api/v1/fix/md/subscribe', {
        lp_id: body.lp_id,
        symbol: body.symbol,
      });
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/md/unsubscribe',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> ?? {};
      const response = await nexriskApi.post('/api/v1/fix/md/unsubscribe', {
        lp_id: body.lp_id,
        symbol: body.symbol,
      });
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/book/:symbol',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, symbol } = symbolParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/book/${symbol}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/books',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/books`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/prices',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/prices`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Orders ──────────────────────────────────────────────────
  // C++ backend: POST /api/v1/fix/order  { lp_id, symbol, side, ... }

  fastify.post(
    '/fix/order',
    async (request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.info({ body: request.body }, '[fix] place order');
      const response = await nexriskApi.post('/api/v1/fix/order', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/orders',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/orders`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/orders',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const active = (request.query as Record<string, string>).active;
      const qs = active === 'true' ? '?active=true' : '';
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/orders${qs}`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, orders: [] }, reply);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/orders/:clord_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, clord_id } = orderIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/orders/${clord_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.delete(
    '/fix/lp/:lp_id/orders/:clord_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, clord_id } = orderIdParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/fix/lp/${lp_id}/orders/${clord_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.put(
    '/fix/lp/:lp_id/orders/:clord_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, clord_id } = orderIdParams.parse(request.params);
      const response = await nexriskApi.put(`/api/v1/fix/lp/${lp_id}/orders/${clord_id}`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Positions (static routes before parametric) ─────────────
  fastify.get(
    '/fix/lp/:lp_id/positions',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, positions: [] }, reply);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/positions/summary',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions/summary`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/positions/refresh',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/positions/refresh`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/positions/:position_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, position_id } = positionIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions/${position_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/positions/:position_id/close',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, position_id } = positionIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/positions/${position_id}/close`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Routes ──────────────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id/routes',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/routes`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Trade History ───────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id/trades',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/trades`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/trades/refresh',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/trades/refresh`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Incident Export ─────────────────────────────────────────
  fastify.post(
    '/fix/lp/:lp_id/incidents',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/incidents`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── FIX Audit Trail (🟢 implemented in C++ backend) ─────────
  // 404 = message store empty (no orders/sessions yet) — treat as empty list.
  fastify.get(
    '/fix/lp/:lp_id/fix/messages',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const q = request.query as Record<string, string | undefined>;
      const qs = new URLSearchParams();
      if (q.direction) qs.set('direction', q.direction);
      if (q.msg_type)  qs.set('msg_type',  q.msg_type);
      if (q.limit)     qs.set('limit',     q.limit);
      if (q.offset)    qs.set('offset',    q.offset);
      const qstr = qs.toString() ? `?${qs.toString()}` : '';
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/fix/messages${qstr}`);
      return emptyOn404(response, lp_id, { lp_id, total_messages: 0, messages: [] }, reply);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/fix/messages/order/:clord_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, clord_id } = orderIdParams.parse(request.params);
      const q = request.query as Record<string, string | undefined>;
      const qs = new URLSearchParams();
      if (q.direction) qs.set('direction', q.direction);
      if (q.msg_type)  qs.set('msg_type',  q.msg_type);
      if (q.limit)     qs.set('limit',     q.limit);
      if (q.offset)    qs.set('offset',    q.offset);
      const qstr = qs.toString() ? `?${qs.toString()}` : '';
      const response = await nexriskApi.get(
        `/api/v1/fix/lp/${lp_id}/fix/messages/order/${encodeURIComponent(clord_id)}${qstr}`
      );
      return emptyOn404(response, lp_id, { lp_id, clord_id, message_count: 0, messages: [] }, reply);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/fix/session-log',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const q = request.query as Record<string, string | undefined>;
      const qs = new URLSearchParams();
      if (q.limit)  qs.set('limit',  q.limit);
      if (q.offset) qs.set('offset', q.offset);
      const qstr = qs.toString() ? `?${qs.toString()}` : '';
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/fix/session-log${qstr}`);
      return emptyOn404(response, lp_id, { lp_id, total_messages: 0, messages: [] }, reply);
    }
  );

  // ════════════════════════════════════════════════════════════
  // BRIEF v3 FLAT-PATH OPERATIONAL ROUTES
  // Paths verified March 2026 — NexRisk DOM Trader Frontend Brief v3.0
  // These mirror the C++ backend's actual URL structure (no /lp/ prefix).
  // ════════════════════════════════════════════════════════════

  // LP status with lp_id in path — Section 4.1
  // GET /api/v1/fix/status/{lp_id}  (existing /fix/status has no lp_id)
  fastify.get(
    '/fix/status/:lp_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/status/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // Market data book — flat path: /md/book/{lp_id}/{symbol} — Section 4.2 / 11
  fastify.get(
    '/fix/md/book/:lp_id/:symbol',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, symbol } = symbolParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/md/book/${lp_id}/${symbol}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // Positions flat path — Section 4.4
  fastify.get(
    '/fix/positions/:lp_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/positions/${lp_id}`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, positions: [] }, reply);
    }
  );

  // Orders flat path — active must be registered before :lp_id alone — Section 4.3
  fastify.get(
    '/fix/orders/:lp_id/active',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/orders/${lp_id}/active`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, orders: [] }, reply);
    }
  );

  fastify.get(
    '/fix/orders/:lp_id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/orders/${lp_id}`);
      return emptyOn404(response, lp_id, { lp_id, count: 0, orders: [] }, reply);
    }
  );

  // Replace order — Section 4.3 / 5.2
  fastify.post(
    '/fix/replace',
    async (request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.info({ body: request.body }, '[fix] replace order');
      const response = await nexriskApi.post('/api/v1/fix/replace', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // Cancel order — Section 4.3 / 5.3
  fastify.post(
    '/fix/cancel',
    async (request: FastifyRequest, reply: FastifyReply) => {
      fastify.log.info({ body: request.body }, '[fix] cancel order');
      const response = await nexriskApi.post('/api/v1/fix/cancel', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // Client stats / diagnostics — Section 4.5
  fastify.get(
    '/fix/client/stats',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/client/stats');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}