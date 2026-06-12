// ============================================================
// Portfolio — BFF Route Module
//
// Mount prefix: /api/v1  (the server adds this when registering)
//
// REGISTRATION — add to server.ts:
//
//   import { portfolioRoutes } from './routes/portfolio.js';
//   await api.register(portfolioRoutes);
//
// Endpoints:
//   GET /portfolio/summary?period=today|week|month
//   GET /portfolio/pnl-history?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Both endpoints return unwrapped plain objects directly from the
// C++ service (no { success, data } envelope).
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { moduleGate } from '../middleware/auth.js';
import { nexriskApi } from '../services/nexrisk-api.js';

export async function portfolioRoutes(fastify: FastifyInstance): Promise<void> {
  // RBAC: gate this whole plugin to the 'portfolio' module.
  // GET/HEAD require VIEW; mutations require EDIT. (Layered over existing
  // requireCapability checks — can only further restrict, never loosen.)
  fastify.addHook('preHandler', moduleGate('portfolio'));

  // ── GET /portfolio/summary ────────────────────────────────────
  // Returns portfolio table data: P&L, volumes, revenues by book.
  // Query params:
  //   period — 'today' | 'week' | 'month'  (default: 'today')
  fastify.get(
    '/portfolio/summary',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { period = 'today' } = request.query as { period?: string };

      const res = await nexriskApi.get<unknown>(
        '/api/v1/portfolio/summary',
        { period },
      );

      if (!res.ok) {
        return reply.code(res.status).send(res.error);
      }

      return reply.send(res.data);
    },
  );

  // ── GET /portfolio/pnl-history ────────────────────────────────
  // Returns daily cumulative P&L series for the area chart.
  // Query params:
  //   from — YYYY-MM-DD  (default: first day of current month on C++ side)
  //   to   — YYYY-MM-DD  (default: today on C++ side)
  fastify.get(
    '/portfolio/pnl-history',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { from, to } = request.query as { from?: string; to?: string };

      const query: Record<string, string> = {};
      if (from) query.from = from;
      if (to)   query.to   = to;

      const res = await nexriskApi.get<unknown>(
        '/api/v1/portfolio/pnl-history',
        query,
      );

      if (!res.ok) {
        return reply.code(res.status).send(res.error);
      }

      return reply.send(res.data);
    },
  );
}