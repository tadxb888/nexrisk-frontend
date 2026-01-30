import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi, snakeToCamel } from '../services/nexrisk-api.js';

// Request schemas
const paginationQuery = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
});

const loginParams = z.object({
  login: z.coerce.number().int().positive(),
});

export async function positionsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/positions
   * Get all open positions
   */
  fastify.get(
    '/positions',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = paginationQuery.parse(request.query);

      const response = await nexriskApi.get('/api/v1/positions', {
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
   * GET /api/positions/:login
   * Get positions for a specific trader
   */
  fastify.get(
    '/positions/:login',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('positions.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = loginParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/positions/${login}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );
}

export async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/orders
   * Get all pending orders
   */
  fastify.get(
    '/orders',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('orders.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = paginationQuery.parse(request.query);

      const response = await nexriskApi.get('/api/v1/orders', {
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
   * GET /api/orders/:login
   * Get orders for a specific trader
   */
  fastify.get(
    '/orders/:login',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('orders.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = loginParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/orders/${login}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );
}
