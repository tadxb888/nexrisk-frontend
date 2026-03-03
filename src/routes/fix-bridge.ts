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

// ── Route module ─────────────────────────────────────────────

export async function fixBridgeRoutes(fastify: FastifyInstance): Promise<void> {

  // ════════════════════════════════════════════════════════════
  // LP ADMIN API — /api/v1/fix/admin/*
  // Config CRUD, credentials, testing, health, audit
  // ════════════════════════════════════════════════════════════

  // ── 1. Create LP Configuration ──────────────────────────────
  fastify.post(
    '/fix/admin/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/fix/admin/lp', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    }
  );

  // ── 2. List All LP Configurations ───────────────────────────
  fastify.get(
    '/fix/admin/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/admin/lp');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── 11. All LP Health (before /:lp_id to avoid param clash) ─
  fastify.get(
    '/fix/admin/health',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/admin/health');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── 3. Get Single LP Configuration ──────────────────────────
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

  // ── 4. Update LP Configuration ──────────────────────────────
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

  // ── 5. Delete LP Configuration ──────────────────────────────
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

  // ── 6. Set/Update Credentials ───────────────────────────────
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

  // ── 7. Credential Status ────────────────────────────────────
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

  // ── 8. Test Connection ──────────────────────────────────────
  fastify.post(
    '/fix/admin/lp/:lp_id/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      // Connection tests may take longer — use default timeout
      const response = await nexriskApi.post(`/api/v1/fix/admin/lp/${lp_id}/test`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── 9. Reload LP ────────────────────────────────────────────
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

  // ── 10. LP Health (Single) ──────────────────────────────────
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

  // ── 12. Audit Trail ─────────────────────────────────────────
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
  // Start/stop, instruments, orders, positions, market data
  // ════════════════════════════════════════════════════════════

  // ── Bridge Status ───────────────────────────────────────────
  fastify.get(
    '/fix/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/fix/status');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Start LP ────────────────────────────────────────────────
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

  // ── Stop LP ─────────────────────────────────────────────────
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
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
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
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
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

  // ── Instruments ─────────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id/instruments',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/instruments/summary',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments/summary`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/instruments/:symbol',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, symbol } = symbolParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments/${symbol}`);
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

  // ── Market Data ─────────────────────────────────────────────
  fastify.post(
    '/fix/lp/:lp_id/md/subscribe',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/md/subscribe`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.post(
    '/fix/lp/:lp_id/md/unsubscribe',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/md/unsubscribe`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/book/:symbol',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, symbol } = symbolParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/book/${symbol}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/books',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/books`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/md/prices',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/md/prices`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Orders ──────────────────────────────────────────────────
  fastify.post(
    '/fix/lp/:lp_id/orders',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/fix/lp/${lp_id}/orders`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/orders',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const active = (request.query as Record<string, string>).active;
      const qs = active === 'true' ? '?active=true' : '';
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/orders${qs}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/orders/:clord_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
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

  // ── Positions ───────────────────────────────────────────────
  fastify.get(
    '/fix/lp/:lp_id/positions',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/positions/summary',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions/summary`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/positions/:position_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, position_id } = positionIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/positions/${position_id}`);
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
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
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
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
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

  // ── FIX Audit Trail (Section 11 — 🟡 not yet implemented) ──
  // These three endpoints are mocked for now. When the backend
  // implements them, simply remove the mock and proxy like the
  // rest. The frontend can call them and get a consistent shape.

  fastify.get(
    '/fix/lp/:lp_id/fix/messages',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      // 🟡 Mocked — proxy when backend is ready:
      // const response = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/fix/messages`);
      return reply.send({
        success: true,
        data: { lp_id, messages: [], total: 0, note: 'FIX message audit trail — pending backend implementation' },
      });
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/fix/messages/order/:clord_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id, clord_id } = orderIdParams.parse(request.params);
      // 🟡 Mocked
      return reply.send({
        success: true,
        data: { lp_id, clord_id, messages: [], note: 'FIX order audit trail — pending backend implementation' },
      });
    }
  );

  fastify.get(
    '/fix/lp/:lp_id/fix/session-log',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      // 🟡 Mocked
      return reply.send({
        success: true,
        data: { lp_id, entries: [], note: 'FIX session log — pending backend implementation' },
      });
    }
  );
}