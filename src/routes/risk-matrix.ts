import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi } from '../services/nexrisk-api.js';

/**
 * Risk Matrix Routes
 *
 * Route paths here are relative to the /api/v1 prefix set in server.ts.
 * nexriskApi calls use the full /api/v1/... path as expected by the C++ backend.
 */
export async function riskMatrixRoutes(fastify: FastifyInstance): Promise<void> {

  // ── /api/v1/config/risk-matrix ────────────────────────────────────────────

  fastify.get('/config/risk-matrix', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/config/risk-matrix', request.query as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/config/risk-matrix/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/config/risk-matrix/history', request.query as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/config/risk-matrix/lookup', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/config/risk-matrix/lookup', request.query as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/config/risk-matrix/behavior/:behavior_type', async (request: FastifyRequest, reply: FastifyReply) => {
    const { behavior_type } = request.params as { behavior_type: string };
    const response = await nexriskApi.get(`/api/v1/config/risk-matrix/behavior/${behavior_type}`);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/config/risk-matrix', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.post('/api/v1/config/risk-matrix', request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.code(201).send(response.data);
  });

  fastify.put('/config/risk-matrix/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const response = await nexriskApi.put(`/api/v1/config/risk-matrix/${id}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.delete('/config/risk-matrix/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const response = await nexriskApi.delete(`/api/v1/config/risk-matrix/${id}`);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/config/risk-matrix/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.post('/api/v1/config/risk-matrix/preview', request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/config/risk-matrix/reload', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.post('/api/v1/config/risk-matrix/reload', {});
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  // ── /api/v1/config/action-codes & modifier-flags ─────────────────────────

  fastify.get('/config/action-codes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/config/action-codes');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/config/modifier-flags', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/config/modifier-flags');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.put('/config/modifier-flags/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const response = await nexriskApi.put(`/api/v1/config/modifier-flags/${id}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  // ── /api/v1/risk-matrix/* (extended API) ─────────────────────────────────

  fastify.get('/risk-matrix/pf-bands', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/pf-bands');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.put('/risk-matrix/pf-bands/:behavior', async (request: FastifyRequest, reply: FastifyReply) => {
    const { behavior } = request.params as { behavior: string };
    const response = await nexriskApi.put(`/api/v1/risk-matrix/pf-bands/${behavior}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.patch('/risk-matrix/pf-bands/:behavior/action', async (request: FastifyRequest, reply: FastifyReply) => {
    const { behavior } = request.params as { behavior: string };
    const response = await nexriskApi.put(`/api/v1/risk-matrix/pf-bands/${behavior}/action`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.patch('/risk-matrix/pf-bands/:behavior/thresholds', async (request: FastifyRequest, reply: FastifyReply) => {
    const { behavior } = request.params as { behavior: string };
    const response = await nexriskApi.put(`/api/v1/risk-matrix/pf-bands/${behavior}/thresholds`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/diff', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/diff');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/action-codes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/action-codes');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/rules', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/rules', request.query as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/factory-defaults', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/factory-defaults');
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/rules/export', async (_request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.get('/api/v1/risk-matrix/rules/export');
    if (!response.ok) return reply.code(response.status).send(response.error);
    reply.header('Content-Disposition', 'attachment; filename="risk-matrix-export.json"');
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/rules/:rule_id/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.get(`/api/v1/risk-matrix/rules/${rule_id}/history`);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.get('/risk-matrix/rules/:rule_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.get(`/api/v1/risk-matrix/rules/${rule_id}`);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.patch('/risk-matrix/rules/:rule_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.put(`/api/v1/risk-matrix/rules/${rule_id}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.put('/risk-matrix/rules/:rule_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.put(`/api/v1/risk-matrix/rules/${rule_id}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/risk-matrix/rules/:rule_id/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.post(`/api/v1/risk-matrix/rules/${rule_id}/reset`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.delete('/risk-matrix/rules/:rule_id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { rule_id } = request.params as { rule_id: string };
    const response = await nexriskApi.delete(`/api/v1/risk-matrix/rules/${rule_id}`);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/risk-matrix/simulate', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.post('/api/v1/risk-matrix/simulate', request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/risk-matrix/reset/:behavior_type', async (request: FastifyRequest, reply: FastifyReply) => {
    const { behavior_type } = request.params as { behavior_type: string };
    const response = await nexriskApi.post(`/api/v1/risk-matrix/reset/${behavior_type}`, request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });

  fastify.post('/risk-matrix/reset/all', async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await nexriskApi.post('/api/v1/risk-matrix/reset/all', request.body as Record<string, unknown>);
    if (!response.ok) return reply.code(response.status).send(response.error);
    return reply.send(response.data);
  });
}