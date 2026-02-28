import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Path / query schemas ──────────────────────────────────────

const nodeIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const bookParams = z.object({
  id:   z.coerce.number().int().positive(),
  book: z.enum(['A', 'B', 'C']),
});

const assignmentParams = z.object({
  id:            z.coerce.number().int().positive(),
  assignmentId:  z.coerce.number().int().positive(),
});

const bookNameParams = z.object({
  book_name: z.string().min(1).max(64),
});

const listNodesQuery = z.object({
  enabled_only: z.string().optional(),
  type:         z.string().optional(),
});

const nodePositionsQuery = z.object({
  login: z.coerce.number().int().positive().optional(),
  group: z.string().optional(),
});

const bookUsersQuery = z.object({
  snapshots: z.string().optional(),
});

// ── Route module ─────────────────────────────────────────────

export async function mt5Routes(fastify: FastifyInstance): Promise<void> {

  // ── Node Registry ──────────────────────────────────────────

  /**
   * GET /api/v1/mt5/nodes
   * List all MT5 nodes with live connection status
   */
  fastify.get(
    '/mt5/nodes',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listNodesQuery.parse(request.query);
      const response = await nexriskApi.get('/api/v1/mt5/nodes', {
        enabled_only: query.enabled_only,
        type:         query.type,
      });
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/status
   * Lightweight status summary — safe to poll every 5–10 s
   * NOTE: must be registered before /mt5/nodes/:id to avoid Fastify treating
   * "status" as an :id param.
   */
  fastify.get(
    '/mt5/nodes/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/mt5/nodes/status');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes/test
   * Test raw credentials before creating a node
   * NOTE: must be registered before /mt5/nodes/:id/* routes.
   */
  fastify.post(
    '/mt5/nodes/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/mt5/nodes/test', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes
   * Create a new MT5 node
   */
  fastify.post(
    '/mt5/nodes',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/mt5/nodes', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id
   * Get a single node with live status
   */
  fastify.get(
    '/mt5/nodes/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * PUT /api/v1/mt5/nodes/:id
   * Update a node (partial update — only include fields to change)
   */
  fastify.put(
    '/mt5/nodes/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.put(`/api/v1/mt5/nodes/${id}`, request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * DELETE /api/v1/mt5/nodes/:id
   * Delete a node (blocked if it is the primary)
   */
  fastify.delete(
    '/mt5/nodes/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/mt5/nodes/${id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes/:id/connect
   */
  fastify.post(
    '/mt5/nodes/:id/connect',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/mt5/nodes/${id}/connect`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes/:id/disconnect
   */
  fastify.post(
    '/mt5/nodes/:id/disconnect',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/mt5/nodes/${id}/disconnect`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes/:id/test
   * Test connectivity of a registered node without changing its state
   */
  fastify.post(
    '/mt5/nodes/:id/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.post(`/api/v1/mt5/nodes/${id}/test`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Node Data ──────────────────────────────────────────────

  /**
   * GET /api/v1/mt5/nodes/:id/symbols
   * Fetch live MT5 symbols from a connected node
   */
  fastify.get(
    '/mt5/nodes/:id/symbols',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/symbols`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id/groups
   * Fetch live MT5 groups from a connected node
   */
  fastify.get(
    '/mt5/nodes/:id/groups',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/groups`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id/positions
   * Fetch all open positions from a node (optionally filter by login or group)
   */
  fastify.get(
    '/mt5/nodes/:id/positions',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const query = nodePositionsQuery.parse(request.query);
      const params: Record<string, unknown> = {};
      if (query.login !== undefined) params.login = query.login;
      if (query.group  !== undefined) params.group  = query.group;
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/positions`, params);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Book Management ────────────────────────────────────────

  /**
   * GET /api/v1/mt5/nodes/:id/books
   * All group-to-book assignments for a node, grouped by book
   */
  fastify.get(
    '/mt5/nodes/:id/books',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = nodeIdParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/books`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id/books/:book/groups
   * Groups assigned to a specific book on this node
   */
  fastify.get(
    '/mt5/nodes/:id/books/:book/groups',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, book } = bookParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/books/${book}/groups`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/mt5/nodes/:id/books/:book/groups
   * Assign one or more groups to a book
   */
  fastify.post(
    '/mt5/nodes/:id/books/:book/groups',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, book } = bookParams.parse(request.params);
      const response = await nexriskApi.post(
        `/api/v1/mt5/nodes/${id}/books/${book}/groups`,
        request.body
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id/books/:book/positions  ⭐
   * All live positions for traders in this book's groups — core B/A/C-Book endpoint
   */
  fastify.get(
    '/mt5/nodes/:id/books/:book/positions',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, book } = bookParams.parse(request.params);
      const response = await nexriskApi.get(`/api/v1/mt5/nodes/${id}/books/${book}/positions`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/mt5/nodes/:id/books/:book/users
   * All traders in this book's groups (with optional balance snapshots)
   */
  fastify.get(
    '/mt5/nodes/:id/books/:book/users',
    { preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, book } = bookParams.parse(request.params);
      const query = bookUsersQuery.parse(request.query);
      const params: Record<string, unknown> = {};
      if (query.snapshots !== undefined) params.snapshots = query.snapshots;
      const response = await nexriskApi.get(
        `/api/v1/mt5/nodes/${id}/books/${book}/users`,
        params
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * DELETE /api/v1/mt5/nodes/:id/books/assignments/:assignmentId
   * Remove a single group-to-book assignment
   */
  fastify.delete(
    '/mt5/nodes/:id/books/assignments/:assignmentId',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, assignmentId } = assignmentParams.parse(request.params);
      const response = await nexriskApi.delete(
        `/api/v1/mt5/nodes/${id}/books/assignments/${assignmentId}`
      );
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── Book Definitions ───────────────────────────────────────

  /**
   * GET /api/v1/books
   * List all book definitions
   */
  fastify.get(
    '/books',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/books');
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  /**
   * POST /api/v1/books
   * Create or update a book definition (upsert by book_name)
   */
  fastify.post(
    '/books',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.post('/api/v1/books', request.body);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.code(201).send(response.data);
    }
  );

  /**
   * DELETE /api/v1/books/:book_name
   * Delete a book definition (blocked if assignments still reference it)
   */
  fastify.delete(
    '/books/:book_name',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { book_name } = bookNameParams.parse(request.params);
      const response = await nexriskApi.delete(`/api/v1/books/${book_name}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );
}