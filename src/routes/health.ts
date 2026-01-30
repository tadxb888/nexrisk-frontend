import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi } from '../services/nexrisk-api.js';
import type { HealthStatus } from '../types/index.js';

const startTime = Date.now();

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /health
   * BFF health check - returns quickly, doesn't check dependencies
   */
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'healthy',
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  /**
   * GET /api/health
   * Comprehensive health check including backend services
   */
  fastify.get(
    '/api/health',
    {
      // No auth required for health checks
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const healthStatus: HealthStatus = {
        status: 'healthy',
        services: {
          nexriskApi: 'unhealthy',
        },
        uptime: Math.floor((Date.now() - startTime) / 1000),
      };

      // Check NexRisk C++ API
      try {
        const apiResponse = await nexriskApi.get<{
          status: string;
          mt5_connected: boolean;
          database_connected: boolean;
          redis_connected: boolean;
          phase5_hybrid_llm_enabled: boolean;
        }>('/health');

        if (apiResponse.ok && apiResponse.data?.status === 'healthy') {
          healthStatus.services.nexriskApi = 'healthy';

          // Add additional service status
          if (apiResponse.data.database_connected !== undefined) {
            healthStatus.services.database = apiResponse.data.database_connected
              ? 'healthy'
              : 'unhealthy';
          }
          if (apiResponse.data.redis_connected !== undefined) {
            healthStatus.services.redis = apiResponse.data.redis_connected
              ? 'healthy'
              : 'unhealthy';
          }

          // Check LLM status if hybrid LLM is enabled
          if (apiResponse.data.phase5_hybrid_llm_enabled) {
            try {
              const llmResponse = await nexriskApi.get<{
                claude: { available: boolean; circuit_state: string };
              }>('/api/v1/llm/status');

              if (llmResponse.ok && llmResponse.data) {
                healthStatus.services.claude = {
                  state: (llmResponse.data.claude?.circuit_state as 'CLOSED' | 'OPEN' | 'HALF_OPEN') ?? 'OPEN',
                };

                // Add fallback info if Claude is not available
                if (!llmResponse.data.claude?.available || llmResponse.data.claude?.circuit_state !== 'CLOSED') {
                  healthStatus.services.claude.fallback = 'ollama';
                }
              }
            } catch {
              // LLM status check failed, but don't mark overall as unhealthy
              healthStatus.services.claude = {
                state: 'OPEN',
                fallback: 'template',
              };
            }
          }
        }
      } catch {
        healthStatus.services.nexriskApi = 'unhealthy';
      }

      // Determine overall status
      if (healthStatus.services.nexriskApi === 'unhealthy') {
        healthStatus.status = 'unhealthy';
      } else if (
        healthStatus.services.database === 'unhealthy' ||
        healthStatus.services.redis === 'unhealthy' ||
        healthStatus.services.claude?.state === 'OPEN'
      ) {
        healthStatus.status = 'degraded';
      }

      // Return 503 if unhealthy
      const statusCode = healthStatus.status === 'unhealthy' ? 503 : 200;
      return reply.code(statusCode).send(healthStatus);
    }
  );

  /**
   * GET /api/stats
   * Get system statistics
   */
  fastify.get(
    '/api/stats',
    {
      preHandler: [fastify.authenticate],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/stats');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );
}
