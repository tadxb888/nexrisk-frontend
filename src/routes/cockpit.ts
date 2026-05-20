import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi, snakeToCamel } from '../services/nexrisk-api.js';

export async function cockpitRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/cockpit/trader-risk
   * Card 4 backing data — critical traders, behavioral severity counts,
   * active risk clusters. Polled by the cockpit page ~60s.
   */
  fastify.get(
    '/cockpit/trader-risk',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/cockpit/trader-risk');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/cockpit/predictions
   * Cards 7/8/9 backing data — NexDay daily outlook, intraday Co-Trending,
   * best opportunities. Polled by the cockpit page ~60 s. Underlying data
   * refreshes once daily (predictions_daily, opportunities_daily) and every
   * 15 min (predictions_intraday).
   */
  fastify.get(
    '/cockpit/predictions',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/cockpit/predictions');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );
}