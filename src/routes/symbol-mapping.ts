// ============================================
// Symbol Mapping BFF Routes
// Exposes:  /api/v1/symbol-mappings/*   (frontend calls these)
// Proxies → /api/v1/mappings/lp/*       (C++ backend paths)
// NexDay mapping routes live in predictions.ts
// ============================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Schemas ──────────────────────────────────────────────────

const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

const createBody = z.object({
  mt5_symbol:          z.string().min(1).max(64),
  lp_id:               z.string().min(1).max(64).optional(),
  lp_symbol:           z.string().min(1).max(64),
  lp_name:             z.string().max(128).optional(),
  volume_multiplier:   z.number().positive().optional(),
  price_multiplier:    z.number().positive().optional(),
  lp_price_precision:  z.number().int().min(0).max(10).optional(),
  enabled:             z.boolean().optional(),
  mt5_trades_in_lots:  z.boolean().optional(),
  mt5_trades_in_units: z.boolean().optional(),
  lp_trades_in_lots:   z.boolean().optional(),
  lp_trades_in_units:  z.boolean().optional(),
  min_size:            z.number().positive().optional(),
  step_size:           z.number().positive().optional(),
  lp_std_lot:          z.number().positive().optional(),
});

const updateBody = z.object({
  lp_symbol:           z.string().min(1).max(64).optional(),
  lp_name:             z.string().max(128).optional(),
  volume_multiplier:   z.number().positive().optional(),
  price_multiplier:    z.number().positive().optional(),
  lp_price_precision:  z.number().int().min(0).max(10).optional(),
  enabled:             z.boolean().optional(),
  approved:            z.boolean().optional(),
  mt5_trades_in_lots:  z.boolean().optional(),
  mt5_trades_in_units: z.boolean().optional(),
  lp_trades_in_lots:   z.boolean().optional(),
  lp_trades_in_units:  z.boolean().optional(),
  min_size:            z.number().positive().optional(),
  step_size:           z.number().positive().optional(),
  lp_std_lot:          z.number().positive().optional(),
});

const importBody = z.object({
  lp_id: z.string().optional(),
  rows:  z.array(z.object({
    mt5_symbol:         z.string().min(1).max(64),
    lp_symbol:          z.string().min(1).max(64),
    volume_multiplier:  z.number().positive().optional(),
    lp_price_precision: z.number().int().min(0).max(10).optional(),
  })).min(1).max(5000),
});

const listQuery = z.object({
  lp_id:   z.string().optional(),
  enabled: z.string().optional(),
  limit:   z.coerce.number().int().optional(),
  offset:  z.coerce.number().int().optional(),
});

// ── Route Module ─────────────────────────────────────────────

export async function symbolMappingRoutes(fastify: FastifyInstance): Promise<void> {

  // ── Reference data ───────────────────────────────────────────
  // NOTE: specific sub-paths registered BEFORE /:id wildcard

  // GET /api/v1/symbol-mappings/mt5-symbols
  // Aggregates symbols from all connected MT5 nodes
  fastify.get(
    '/symbol-mappings/mt5-symbols',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Fetch node list first
      const nodesRes = await nexriskApi.get('/api/v1/mt5/nodes/status');
      if (!nodesRes.ok) return reply.code(nodesRes.status).send(nodesRes.error);
      const nodes: any[] = (nodesRes.data as any)?.nodes ?? [];
      const connected = nodes.filter((n: any) => n.connection_status === 'CONNECTED' && n.is_enabled);

      // Fetch symbols from all connected nodes in parallel
      const results = await Promise.allSettled(
        connected.map((n: any) => nexriskApi.get(`/api/v1/mt5/nodes/${n.node_id}/symbols`))
      );

      // Deduplicate by symbol name
      const seen = new Set<string>();
      const symbols: any[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          const syms: any[] = (r.value.data as any)?.symbols ?? [];
          for (const s of syms) {
            if (!seen.has(s.symbol)) { seen.add(s.symbol); symbols.push(s); }
          }
        }
      }

      return reply.send({ symbols, total: symbols.length, source_nodes: connected.length });
    }
  );

  // GET /api/v1/symbol-mappings/unmapped
  // → C++: GET /api/v1/mappings/lp/unmapped
  fastify.get(
    '/symbol-mappings/unmapped',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mappings/lp/unmapped');
      if (!response.ok) return reply.code(response.status).send(response.error);
      // Normalise: C++ returns { unmapped_symbols: [...] }, frontend expects { unmapped: [...] }
      const data = response.data as any;
      const unmapped = data?.unmapped_symbols ?? data?.unmapped ?? [];
      return reply.send({ unmapped, total: unmapped.length });
    }
  );

  // POST /api/v1/symbol-mappings/import — bulk
  // → C++: POST /api/v1/mappings/lp/bulk
  fastify.post(
    '/symbol-mappings/import',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = importBody.parse(request.body);
      // C++ bulk endpoint expects { mappings: [...], filename? }
      const response = await nexriskApi.post('/api/v1/mappings/lp/bulk', {
        mappings: body.rows,
        filename: 'import',
      });
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── CRUD ─────────────────────────────────────────────────────

  // GET /api/v1/symbol-mappings — list all
  // → C++: GET /api/v1/mappings/lp
  fastify.get(
    '/symbol-mappings',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mappings/lp');
      if (!response.ok) return reply.code(response.status).send(response.error);
      // Normalise: C++ returns { mappings: [...], total, generated_at }
      // Frontend expects same shape — pass through
      return reply.send(response.data);
    }
  );

  // POST /api/v1/symbol-mappings — create / upsert
  // → C++: POST /api/v1/mappings/lp
  fastify.post(
    '/symbol-mappings',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createBody.parse(request.body);
      const response = await nexriskApi.post('/api/v1/mappings/lp', body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // PUT /api/v1/symbol-mappings/:id — update
  // → C++: POST /api/v1/mappings/lp (upsert by mt5_symbol — C++ has no PUT by id yet)
  // We fetch the existing mapping first so we can re-POST with merged fields.
  fastify.put(
    '/symbol-mappings/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id }  = idParams.parse(request.params);
      const patch   = updateBody.parse(request.body);

      // Fetch existing to merge
      const existing = await nexriskApi.get('/api/v1/mappings/lp');
      if (!existing.ok) return reply.code(existing.status).send(existing.error);
      const mappings = (existing.data as any)?.mappings ?? [];
      const row      = mappings.find((m: any) => m.id === id);
      if (!row) return reply.code(404).send({ error: 'Mapping not found' });

      const merged = {
        mt5_symbol:          row.mt5_symbol,
        lp_symbol:           patch.lp_symbol           ?? row.lp_symbol,
        lp_name:             patch.lp_name              ?? row.lp_name,
        volume_multiplier:   patch.volume_multiplier    ?? row.volume_multiplier,
        price_multiplier:    patch.price_multiplier     ?? row.price_multiplier,
        lp_price_precision:  patch.lp_price_precision   ?? row.lp_price_precision,
        enabled:             patch.enabled              ?? row.enabled,
        mt5_trades_in_lots:  patch.mt5_trades_in_lots   ?? row.mt5_trades_in_lots,
        mt5_trades_in_units: patch.mt5_trades_in_units  ?? row.mt5_trades_in_units,
        lp_trades_in_lots:   patch.lp_trades_in_lots    ?? row.lp_trades_in_lots,
        lp_trades_in_units:  patch.lp_trades_in_units   ?? row.lp_trades_in_units,
        min_size:            patch.min_size             ?? row.min_size,
        step_size:           patch.step_size            ?? row.step_size,
        lp_std_lot:          patch.lp_std_lot           ?? row.lp_std_lot,
      };

      const response = await nexriskApi.post('/api/v1/mappings/lp', merged);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // DELETE /api/v1/symbol-mappings/:id
  // → C++: DELETE /api/v1/mappings/lp/:id
  fastify.delete(
    '/symbol-mappings/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = idParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/mappings/lp/${id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}