import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi, snakeToCamel, camelToSnake } from '../services/nexrisk-api.js';

// Request schemas
const listAlertsQuery = z.object({
  limit: z.coerce.number().min(1).max(1000).default(100),
  status: z.enum(['pending', 'acknowledged', 'resolved']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

const alertParams = z.object({
  alertId: z.string().uuid(),
});

const acknowledgeBody = z.object({
  acknowledgedBy: z.string().min(1).optional(),
});

const resolveBody = z.object({
  resolvedBy: z.string().min(1).optional(),
  resolutionNotes: z.string().optional(),
});

export async function alertsRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/alerts
   * List all alerts with optional filters
   */
  fastify.get(
    '/alerts',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = listAlertsQuery.parse(request.query);

      const response = await nexriskApi.get('/api/v1/alerts', {
        limit: query.limit,
        status: query.status,
        severity: query.severity,
      });

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/alerts/:alertId
   * Get specific alert details
   */
  fastify.get(
    '/alerts/:alertId',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertParams.parse(request.params);

      const response = await nexriskApi.get(`/api/v1/alerts/${alertId}`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * PUT /api/alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  fastify.put(
    '/alerts/:alertId/acknowledge',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.ack')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertParams.parse(request.params);
      const body = acknowledgeBody.parse(request.body ?? {});

      // Use current user if not specified
      const acknowledgedBy = body.acknowledgedBy ?? request.nexriskUser?.email ?? 'unknown';

      const response = await nexriskApi.put(
        `/api/v1/alerts/${alertId}/acknowledge`,
        camelToSnake({ acknowledgedBy })
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send({ success: true, alertId, acknowledgedBy });
    }
  );

  /**
   * PUT /api/alerts/:alertId/resolve
   * Resolve an alert
   */
  fastify.put(
    '/alerts/:alertId/resolve',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.resolve')],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { alertId } = alertParams.parse(request.params);
      const body = resolveBody.parse(request.body ?? {});

      // Use current user if not specified
      const resolvedBy = body.resolvedBy ?? request.nexriskUser?.email ?? 'unknown';

      const response = await nexriskApi.put(
        `/api/v1/alerts/${alertId}/resolve`,
        camelToSnake({
          resolvedBy,
          resolutionNotes: body.resolutionNotes,
        })
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send({ success: true, alertId, resolvedBy });
    }
  );
}
