import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

const traderParams = z.object({
  login: z.coerce.number().int().positive(),
});

export async function explanationsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/explanations/trader/:login
   * Retrieve stored explanation for a trader (auto-generated or cached)
   */
  fastify.get(
    '/explanations/trader/:login',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.details')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/explanations/trader/${login}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * POST /api/explanations/trader/:login/generate
   * Trigger on-demand LLM explanation generation for any risk level
   */
  fastify.post(
    '/explanations/trader/:login/generate',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('traders.details')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { login } = traderParams.parse(request.params);

      const response = await nexriskApi.post(`/api/v1/explanations/trader/${login}/generate`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );
}