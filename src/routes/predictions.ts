// ============================================================
// src/routes/predictions.ts
// NexDay Predictions & Symbol Mapping — proxied to NexRisk C++
// All routes registered under /api/v1 prefix (see server.ts).
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi } from '../services/nexrisk-api.js';

async function proxyGet(path: string, reply: FastifyReply, query?: Record<string, unknown>) {
  let fullPath = path;
  if (query && Object.keys(query).length > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) fullPath = `${path}?${qs}`;
  }
  const res = await nexriskApi.get(fullPath);
  if (!res.ok) return reply.code(res.status).send(res.error);
  return reply.send(res.data);
}

async function proxyPost(path: string, body: unknown, reply: FastifyReply) {
  const res = await nexriskApi.post(path, body);
  if (!res.ok) return reply.code(res.status).send(res.error);
  return reply.send(res.data);
}

async function proxyDelete(path: string, reply: FastifyReply) {
  const res = await nexriskApi.delete(path);
  if (!res.ok) return reply.code(res.status).send(res.error);
  return reply.send(res.data);
}

export async function predictionsRoutes(fastify: FastifyInstance): Promise<void> {

  fastify.get('/mappings/nexday',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_req, reply) => proxyGet('/api/v1/mappings/nexday', reply)
  );

  fastify.get('/mappings/nexday/available',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_req, reply) => proxyGet('/api/v1/mappings/nexday/available', reply)
  );

  fastify.get('/mappings/nexday/unmapped',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_req, reply) => proxyGet('/api/v1/mappings/nexday/unmapped', reply)
  );

  fastify.post('/mappings/nexday',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (req, reply) => proxyPost('/api/v1/mappings/nexday', req.body, reply)
  );

  fastify.post('/mappings/nexday/bulk',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (req, reply) => proxyPost('/api/v1/mappings/nexday/bulk', req.body, reply)
  );

  fastify.delete('/mappings/nexday',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (req: FastifyRequest, reply) => {
      const { confirm } = req.query as { confirm?: string };
      if (confirm !== 'true') return reply.code(400).send({ error: 'confirm=true query param required' });
      return proxyDelete('/api/v1/mappings/nexday?confirm=true', reply);
    }
  );

  fastify.delete('/mappings/nexday/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (req: FastifyRequest, reply) => {
      const { id } = req.params as { id: string };
      return proxyDelete(`/api/v1/mappings/nexday/${id}`, reply);
    }
  );

  fastify.get('/mappings/history',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (req, reply) => proxyGet('/api/v1/mappings/history', reply, req.query as Record<string, unknown>)
  );

  fastify.get('/predictions/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_req, reply) => proxyGet('/api/v1/predictions/status', reply)
  );

  fastify.get('/predictions/signals',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (req, reply) => proxyGet('/api/v1/predictions/signals', reply, req.query as Record<string, unknown>)
  );

  fastify.get('/predictions/intraday/:mt5_symbol',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (req: FastifyRequest, reply) => {
      const { mt5_symbol } = req.params as { mt5_symbol: string };
      return proxyGet(`/api/v1/predictions/intraday/${mt5_symbol}`, reply);
    }
  );

  fastify.get('/predictions/daily/:mt5_symbol',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (req: FastifyRequest, reply) => {
      const { mt5_symbol } = req.params as { mt5_symbol: string };
      return proxyGet(`/api/v1/predictions/daily/${mt5_symbol}`, reply);
    }
  );
}