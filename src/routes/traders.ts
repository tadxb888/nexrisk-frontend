import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi, snakeToCamel } from '../services/nexrisk-api.js';

// Request schemas
const listTradersQuery = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
  group: z.string().optional(),
});

const traderParams = z.object({
  login: z.coerce.number().int().positive(),
});

const featuresQuery = z.object({
  window: z.enum(['5m', '15m', '1h', '1d']).default('15m'),
});

const historyQuery = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  type: z.string().optional(),
});

export async function tradersRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/traders
   * List all traders
   */
  fastify.get(
    '/traders',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listTradersQuery.parse(request.query);

      const response = await nexriskApi.get('/api/v1/traders', {
        limit: query.limit,
        offset: query.offset,
        group: query.group,
      });

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      // Transform response to camelCase
      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/traders/:login
   * Get trader details
   */
  fastify.get(
    '/traders/:login',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/traders/${login}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/traders/:login/dashboard
   * Get full trader dashboard with all metrics
   */
  fastify.get(
    '/traders/:login/dashboard',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.details')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/traders/${login}/dashboard`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/traders/:login/history
   * Get trader's trade history
   */
  fastify.get(
    '/traders/:login/history',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.details')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);
      const query = historyQuery.parse(request.query);

      const response = await nexriskApi.get(`/api/v1/traders/${login}/history`, {
        limit: query.limit,
        type: query.type,
      });

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/traders/:login/features
   * Get trader's feature vectors
   */
  fastify.get(
    '/traders/:login/features',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.details')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);
      const query = featuresQuery.parse(request.query);

      const response = await nexriskApi.get(`/api/v1/traders/${login}/features`, {
        window: query.window,
      });

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );
}
