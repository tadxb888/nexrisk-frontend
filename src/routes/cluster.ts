import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';

// Shape is owned by the C++ service (see backend-brief-cluster-nodes.md); we
// only need to touch `nodes[].role` / `nodes[].users_connected` here, so the
// rest is passed through untyped.
interface ClusterNode {
  role?: string;
  users_connected?: number | null;
  [key: string]: unknown;
}
interface ClusterPayload {
  generated_at?: string;
  nodes?: ClusterNode[];
  lps?: unknown[];
}

/**
 * GET /api/v1/cluster/nodes
 *
 * Proxies the C++ cluster feed to the frontend. `nexriskApi` attaches the
 * internal secret, so this succeeds where a bare request to :8090 is rejected.
 * The BFF fills `users_connected` on the frontend node from the live session
 * store — only the BFF knows that count.
 */
export async function clusterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/cluster/nodes',
    {
      // Authenticated only for now — matches the still-ungated nav item.
      // TODO: once the C++ RBAC registers + grants `infra_monitor`, add the
      // gate below so the route and nav flip together:
      //   fastify.requirePermission('infra_monitor', 'VIEW'),
      preHandler: [fastify.authenticate],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<ClusterPayload>('/api/v1/cluster/nodes');
      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = response.data ?? {};
      // Only the BFF knows the live frontend session count.
      const activeUsers = sessionStore.size();
      if (Array.isArray(data.nodes)) {
        for (const n of data.nodes) {
          if (n.role === 'frontend') n.users_connected = activeUsers;
        }
      }

      return reply.send(data);
    },
  );
}