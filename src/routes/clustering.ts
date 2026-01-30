import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi, snakeToCamel, camelToSnake } from '../services/nexrisk-api.js';

// Request schemas
const runParams = z.object({
  runId: z.string().uuid(),
});

const clusterParams = z.object({
  runId: z.string().uuid(),
  clusterId: z.coerce.number().int(),
});

const loginParams = z.object({
  login: z.coerce.number().int().positive(),
});

const runsQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
});

const runBody = z.object({
  sinceHours: z.coerce.number().min(1).max(168).default(24),
});

const configBody = z.object({
  minClusterSize: z.coerce.number().int().min(2).optional(),
  minSamples: z.coerce.number().int().min(1).optional(),
  highOutlierThreshold: z.coerce.number().min(0).max(1).optional(),
  mediumOutlierThreshold: z.coerce.number().min(0).max(1).optional(),
  autoRunEnabled: z.boolean().optional(),
  updatedBy: z.string().optional(),
});

const archetypeBody = z.object({
  archetypeId: z.coerce.number().int().min(1).max(9),
  mappedBy: z.string().optional(),
});

export async function clusteringRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/clustering/config
   * Get current clustering configuration
   */
  fastify.get(
    '/clustering/config',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/clustering/config');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * PUT /api/clustering/config
   * Update clustering configuration
   */
  fastify.put(
    '/clustering/config',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('config.write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = configBody.parse(request.body);

      // Use current user if not specified
      const updatedBy = body.updatedBy ?? request.nexriskUser?.email ?? 'unknown';

      const response = await nexriskApi.put(
        '/api/v1/clustering/config',
        camelToSnake({ ...body, updatedBy })
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send({ success: true });
    }
  );

  /**
   * POST /api/clustering/run
   * Trigger a new clustering run
   */
  fastify.post(
    '/clustering/run',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.run')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = runBody.parse(request.body ?? {});

      const response = await nexriskApi.post(
        '/api/v1/clustering/run',
        camelToSnake(body)
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);

      fastify.log.info({
        action: 'clustering.run',
        runId: (data as Record<string, unknown>).runId,
        user: request.nexriskUser?.email,
      });

      return reply.send(data);
    }
  );

  /**
   * GET /api/clustering/runs
   * Get clustering run history
   */
  fastify.get(
    '/clustering/runs',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = runsQuery.parse(request.query);

      const response = await nexriskApi.get('/api/v1/clustering/runs', {
        limit: query.limit,
      });

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/clustering/runs/:runId
   * Get details of a specific clustering run
   */
  fastify.get(
    '/clustering/runs/:runId',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { runId } = runParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/clustering/runs/${runId}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/clustering/runs/:runId/profiles
   * Get cluster profiles for a run
   */
  fastify.get(
    '/clustering/runs/:runId/profiles',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { runId } = runParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/clustering/runs/${runId}/profiles`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/clustering/traders/:login
   * Get cluster assignment for specific trader
   */
  fastify.get(
    '/clustering/traders/:login',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = loginParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/clustering/traders/${login}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/clustering/outliers
   * Get high outliers from latest run
   */
  fastify.get(
    '/clustering/outliers',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('clustering.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/clustering/outliers');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * PUT /api/clustering/runs/:runId/clusters/:clusterId/archetype
   * Map a cluster to an archetype
   */
  fastify.put(
    '/clustering/runs/:runId/clusters/:clusterId/archetype',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('config.write')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { runId, clusterId } = clusterParams.parse(request.params);
      const body = archetypeBody.parse(request.body);

      const mappedBy = body.mappedBy ?? request.nexriskUser?.email ?? 'unknown';

      const response = await nexriskApi.put(
        `/api/v1/clustering/runs/${runId}/clusters/${clusterId}/archetype`,
        camelToSnake({ ...body, mappedBy })
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send({ success: true });
    }
  );
}
