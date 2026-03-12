// ============================================
// Symbol Mapping BFF Routes — LP only
// NexDay routes are in predictions.ts
// ============================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Schemas ──────────────────────────────────────────────────

const lpMappingIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const addLpBody = z.object({
  mt5_symbol: z.string().min(1).max(64),
  lp_symbol:  z.string().min(1).max(64),
  lp_name:    z.string().max(128).optional(),
  notes:      z.string().max(500).optional(),
});

const bulkLpBody = z.object({
  mappings: z.array(z.object({
    mt5_symbol: z.string().min(1).max(64),
    lp_symbol:  z.string().min(1).max(64),
    lp_name:    z.string().max(128).optional(),
    notes:      z.string().max(500).optional(),
  })).min(1).max(5000),
  filename: z.string().optional(),
});

const confirmQuery = z.object({
  confirm: z.literal('true'),
});

// ── Route Module ─────────────────────────────────────────────

export async function symbolMappingRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /api/v1/mappings/lp
  fastify.get(
    '/mappings/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mappings/lp');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // GET /api/v1/mappings/lp/unmapped — before /:id
  fastify.get(
    '/mappings/lp/unmapped',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mappings/lp/unmapped');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // POST /api/v1/mappings/lp/bulk — before /lp (plain POST)
  fastify.post(
    '/mappings/lp/bulk',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = bulkLpBody.parse(request.body);
      const response = await nexriskApi.post('/api/v1/mappings/lp/bulk', body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // POST /api/v1/mappings/lp/upload (CSV)
  fastify.post(
    '/mappings/lp/upload',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/mappings/lp/upload', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // POST /api/v1/mappings/lp — add single
  fastify.post(
    '/mappings/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = addLpBody.parse(request.body);
      const response = await nexriskApi.post('/api/v1/mappings/lp', body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // DELETE /api/v1/mappings/lp?confirm=true — clear all
  fastify.delete(
    '/mappings/lp',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      confirmQuery.parse(request.query);
      const response = await nexriskApi.delete('/api/v1/mappings/lp?confirm=true');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // DELETE /api/v1/mappings/lp/:id — delete single by mapping_id
  fastify.delete(
    '/mappings/lp/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = lpMappingIdParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/mappings/lp/${id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // GET /api/v1/mappings/unmapped — combined (both LP + NexDay gaps)
  fastify.get(
    '/mappings/unmapped',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mappings/unmapped');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}