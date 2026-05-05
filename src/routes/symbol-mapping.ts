// ============================================
// Symbol Mapping BFF Routes  (node-scoped — Migration 029)
// Exposes:  /api/v1/symbol-mappings/*   (frontend calls these)
// Proxies → /api/v1/mappings/lp/*       (C++ backend paths)
// NexDay mapping routes live in predictions.ts
// ============================================
//
// Change log for Patch 5 (Migration 029 frontend integration):
//   - GET  /symbol-mappings        accepts ?node_id=N (forwards to C++)
//   - POST /symbol-mappings        requires node_id in body
//   - PUT  /symbol-mappings/:id    PUT-by-id; node_id is recovered from the
//                                   existing row (we look it up before merge)
//   - DELETE /symbol-mappings/:id  unchanged (C++ recovers node_id from DB)
//   - POST /symbol-mappings/import requires node_id in body
//   - GET  /symbol-mappings/unmapped accepts ?node_id=N
//
// Rationale: every LP write now scopes to a specific MT5 node so each broker
// keeps its own symbol catalog. See migration 029 + SymbolMappingCache changes.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Schemas ──────────────────────────────────────────────────

const idParams = z.object({
  id: z.coerce.number().int().positive(),
});

const createBody = z.object({
  node_id:             z.number().int().positive(),     // NEW: required
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

// PUT body never carries node_id — node_id is bound to the row identity and
// cannot be changed in-place. To move a mapping to a different node, delete
// and re-create.
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
  node_id: z.number().int().positive(),                 // NEW: required
  lp_id:   z.string().optional(),
  rows:    z.array(z.object({
    mt5_symbol:         z.string().min(1).max(64),
    lp_symbol:          z.string().min(1).max(64),
    lp_id:              z.string().optional(),
    volume_multiplier:  z.number().positive().optional(),
    price_multiplier:   z.number().positive().optional(),
    lp_price_precision: z.number().int().min(0).max(10).optional(),
    mt5_volume_unit:    z.string().optional(),
    lp_volume_unit:     z.string().optional(),
  })).min(1).max(5000),
});

const listQuery = z.object({
  node_id: z.coerce.number().int().positive().optional(),  // NEW
  lp_id:   z.string().optional(),
  enabled: z.string().optional(),
  limit:   z.coerce.number().int().optional(),
  offset:  z.coerce.number().int().optional(),
});

// Snap-quote query — every field required (no fallbacks here; the C++
// endpoint rejects partial requests with 400).
const snapQuoteQuery = z.object({
  node_id:    z.coerce.number().int().positive(),
  mt5_symbol: z.string().min(1).max(64),
  lp_id:      z.string().min(1).max(64),
  lp_symbol:  z.string().min(1).max(64),
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
      // C++ returns `id` on the node object, not `node_id`
      const results = await Promise.allSettled(
        connected.map((n: any) => {
          const nodeId = n.id ?? n.node_id;
          return nexriskApi.get(`/api/v1/mt5/nodes/${nodeId}/symbols`);
        })
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

  // GET /api/v1/symbol-mappings/snap-quote
  //   ?node_id=N&mt5_symbol=X&lp_id=Y&lp_symbol=Z (all required)
  // → C++: GET /api/v1/symbol-mappings/snap-quote (same path on 8090)
  // Composes one MT5-side and one LP-side lookup; returns {mt5, lp, derived}.
  fastify.get(
    '/symbol-mappings/snap-quote',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = snapQuoteQuery.parse(request.query);
      const params = new URLSearchParams({
        node_id:    String(q.node_id),
        mt5_symbol: q.mt5_symbol,
        lp_id:      q.lp_id,
        lp_symbol:  q.lp_symbol,
      });
      const response = await nexriskApi.get(
        `/api/v1/symbol-mappings/snap-quote?${params.toString()}`
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // GET /api/v1/symbol-mappings/unmapped
  //   ?node_id=N (optional — passed through to C++ to scope the unmapped view)
  // → C++: GET /api/v1/mappings/lp/unmapped[?node_id=N]
  fastify.get(
    '/symbol-mappings/unmapped',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = listQuery.parse(request.query);
      const cppPath = q.node_id != null
        ? `/api/v1/mappings/lp/unmapped?node_id=${q.node_id}`
        : '/api/v1/mappings/lp/unmapped';
      const response = await nexriskApi.get(cppPath);
      if (!response.ok) return reply.code(response.status).send(response.error);
      // Normalise: C++ returns { unmapped_symbols: [...] } where items are
      // objects with at least { mt5_symbol, node_id, ... }. Always produce a
      // plain string array for backward compatibility with the frontend.
      const data = response.data as any;
      const rawList: any[] = data?.unmapped_symbols ?? data?.unmapped ?? [];
      const unmapped = rawList.map((item: any) =>
        typeof item === 'string' ? item : (item?.mt5_symbol ?? item?.symbol ?? String(item))
      );
      return reply.send({ unmapped, total: unmapped.length });
    }
  );

  // POST /api/v1/symbol-mappings/import — bulk
  // Required: { node_id, rows: [...], lp_id? }
  // → C++: POST /api/v1/mappings/lp/bulk { node_id, mappings, filename? }
  fastify.post(
    '/symbol-mappings/import',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = importBody.parse(request.body);
      // If lp_id is supplied at the top level, propagate it onto any rows that
      // don't already specify their own. This matches the prior shape the
      // frontend produces (top-level lp_id in the import payload).
      const rows = body.lp_id
        ? body.rows.map(r => ({ ...r, lp_id: r.lp_id ?? body.lp_id }))
        : body.rows;
      const response = await nexriskApi.post('/api/v1/mappings/lp/bulk', {
        node_id:  body.node_id,
        mappings: rows,
        filename: 'import',
      });
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── CRUD ─────────────────────────────────────────────────────

  // GET /api/v1/symbol-mappings — list
  //   ?node_id=N (optional — filter to a specific node)
  //   ?lp_id=X   (optional — filter to a specific LP)
  // → C++: GET /api/v1/mappings/lp[?node_id=N][&lp_id=X]
  fastify.get(
    '/symbol-mappings',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const q = listQuery.parse(request.query);
      const params = new URLSearchParams();
      if (q.node_id != null) params.set('node_id', String(q.node_id));
      if (q.lp_id)           params.set('lp_id',   q.lp_id);
      const cppPath = params.toString()
        ? `/api/v1/mappings/lp?${params.toString()}`
        : '/api/v1/mappings/lp';
      const response = await nexriskApi.get(cppPath);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // POST /api/v1/symbol-mappings — create / upsert
  // Required: { node_id, mt5_symbol, lp_symbol } (+ optionals)
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
  // node_id is bound to the existing row and is not modifiable here. We fetch
  // the existing row (which now carries node_id) and re-POST with the merged
  // fields plus the row's own node_id so the C++ upsert lands on the same row.
  // → C++: POST /api/v1/mappings/lp (node_id from existing row)
  fastify.put(
    '/symbol-mappings/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id }  = idParams.parse(request.params);
      const patch   = updateBody.parse(request.body);

      // Fetch existing to merge. We don't filter the GET by node_id since the
      // mapping_id is globally unique; we simply find the row by id.
      const existing = await nexriskApi.get('/api/v1/mappings/lp');
      if (!existing.ok) return reply.code(existing.status).send(existing.error);
      const mappings = (existing.data as any)?.mappings ?? [];
      const row      = mappings.find((m: any) => m.id === id);
      if (!row) return reply.code(404).send({ error: 'Mapping not found' });

      // Verify the existing row carries a node_id. After migration 029 every
      // row must have one — if one is missing the DB is inconsistent.
      if (typeof row.node_id !== 'number' || row.node_id <= 0) {
        return reply.code(500).send({
          error: 'Existing mapping is missing node_id — DB state inconsistent with migration 029',
        });
      }

      const merged = {
        node_id:             row.node_id,             // bound to existing row
        mt5_symbol:          row.mt5_symbol,
        lp_id:               row.lp_id,
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
  // C++ recovers node_id from the row itself (RETURNING clause) for cache
  // invalidation. No client input changes here.
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