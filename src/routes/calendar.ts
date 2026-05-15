// ============================================================
// Calendar — BFF Route Module
//
// Thin proxy to the C++ backend calendar endpoints.
// The C++ backend handles all business logic, event ingestion
// from Trading Economics, and caching. The BFF simply forwards.
//
// Mount prefix: /api/v1  (added by server.ts registration)
//
// REGISTRATION — add to server.ts:
//
//   import { calendarRoutes } from './routes/calendar.js';
//   await api.register(calendarRoutes);
//
// Endpoints (all GET — read-only from frontend perspective):
//   GET /calendar/events          → browse picker events
//   GET /calendar/events/:id      → single event detail
//   GET /calendar/countries       → distinct country values
//   GET /calendar/categories      → distinct category values
//   GET /calendar/status          → service health & ingestion stats
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi } from '../services/nexrisk-api.js';

export async function calendarRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /calendar/events ───────────────────────────────────────
  // Picker data source. Passes all query params through to C++ backend.
  // Supported params: from, to, importance, country, category, status, limit
  fastify.get(
    '/calendar/events',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const qs = new URLSearchParams(request.query as Record<string, string>).toString();
      const path = qs ? `/api/v1/calendar/events?${qs}` : '/api/v1/calendar/events';
      const res = await nexriskApi.get(path);
      if (!res.ok) return reply.code(res.status).send(res.error);
      return reply.send(res.data);
    }
  );

  // ── GET /calendar/events/:id ───────────────────────────────────
  // Single event detail — used to populate picker display when loading
  // an existing rule/window that already has te_calendar_id set.
  fastify.get<{ Params: { id: string } }>(
    '/calendar/events/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const res = await nexriskApi.get(`/api/v1/calendar/events/${request.params.id}`);
      if (!res.ok) return reply.code(res.status).send(res.error);
      return reply.send(res.data);
    }
  );

  // ── GET /calendar/countries ────────────────────────────────────
  fastify.get(
    '/calendar/countries',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const res = await nexriskApi.get('/api/v1/calendar/countries');
      if (!res.ok) return reply.code(res.status).send(res.error);
      return reply.send(res.data);
    }
  );

  // ── GET /calendar/categories ───────────────────────────────────
  fastify.get(
    '/calendar/categories',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const res = await nexriskApi.get('/api/v1/calendar/categories');
      if (!res.ok) return reply.code(res.status).send(res.error);
      return reply.send(res.data);
    }
  );

  // ── GET /calendar/status ───────────────────────────────────────
  fastify.get(
    '/calendar/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const res = await nexriskApi.get('/api/v1/calendar/status');
      if (!res.ok) return reply.code(res.status).send(res.error);
      return reply.send(res.data);
    }
  );
}