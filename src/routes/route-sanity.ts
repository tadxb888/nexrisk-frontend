// ============================================================
// Route Sanity — BFF Route Module
// Aggregates LP admin configs + FIX live status for the
// Route Sanity page. Instruments are proxied directly.
//
// Mount prefix: /api/v1  (routes registered without it)
// Endpoints:
//   GET /route-sanity/lps                    → aggregated LP list + live status
//   GET /route-sanity/lp/:lp_id/status       → live FIX status for one LP
//   GET /route-sanity/lp/:lp_id/instruments  → instrument list for symbol grid
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Param schemas ─────────────────────────────────────────────
const lpIdParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
});

// ── Route module ──────────────────────────────────────────────
export async function routeSanityRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /route-sanity/lps ────────────────────────────────────
  // Fetches all enabled LP admin configs, then for each fetches
  // live FIX status (connect_count, disconnect_count, state).
  // Status fetch failures are non-fatal — field will be null.
  fastify.get(
    '/route-sanity/lps',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {

      // 1. All LP admin configs
      const configRes = await nexriskApi.get('/api/v1/fix/admin/lp');
      if (!configRes.ok) {
        return reply.code(configRes.status).send(configRes.error);
      }

      const allConfigs: any[] = (configRes.data as any)?.lps ?? [];
      const enabledConfigs = allConfigs.filter((c: any) => c.enabled === true);

      // 2. Live FIX status per enabled LP — best-effort, parallel
      const statusResults = await Promise.allSettled(
        enabledConfigs.map((c: any) => nexriskApi.get(`/api/v1/fix/lp/${c.lp_id}`))
      );

      const lps = enabledConfigs.map((c: any, idx: number) => {
        const result  = statusResults[idx];
        const ok      = result.status === 'fulfilled' && result.value.ok;
        const status  = ok ? (result.value as any).data : null;

        return {
          lp_id:                 c.lp_id,
          lp_name:               c.lp_name ?? c.lp_id,
          enabled:               c.enabled,
          provider_type:         c.provider_type ?? null,
          // Live FIX status fields (null when bridge unavailable)
          state:                 status?.state                          ?? null,
          connect_count:         status?.connect_count                  ?? null,
          disconnect_count:      status?.disconnect_count               ?? null,
          trading_session_state: status?.trading_session?.state         ?? null,
          md_session_state:      status?.md_session?.state              ?? null,
        };
      });

      return reply.send({ success: true, data: { lps } });
    }
  );

  // ── GET /route-sanity/lp/:lp_id/status ───────────────────────
  // Live FIX status for a single LP.
  // Used for periodic status refresh after initial page load.
  fastify.get(
    '/route-sanity/lp/:lp_id/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response  = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── GET /route-sanity/lp/:lp_id/instruments ──────────────────
  // Instrument list for the symbol sanity grid (right-hand grid).
  // 404 from the C++ backend means cache empty — return empty list.
  fastify.get(
    '/route-sanity/lp/:lp_id/instruments',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response  = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments`);

      if (!response.ok) {
        // 404 = instrument cache empty (C++ backend quirk — not a genuine missing resource)
        if (response.status === 404) {
          return reply.send({ success: true, data: { lp_id, count: 0, instruments: [] } });
        }
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );
}