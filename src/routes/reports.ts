import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { moduleGate } from '../middleware/auth.js';
import { request as undiciRequest } from 'undici';
import { config } from '../config.js';
import { nexriskApi } from '../services/nexrisk-api.js';

/**
 * Proxy all GET /api/v1/reports/* to the C++ backend.
 *
 * JSON  → nexriskApi (identical to every other BFF route, no special headers)
 * CSV   → undici direct (needed for raw body + Content-Disposition pass-through)
 */
export async function reportsRoutes(fastify: FastifyInstance): Promise<void> {
  // RBAC: gate this whole plugin to the 'reports' module.
  // GET/HEAD require VIEW; mutations require EDIT. (Layered over existing
  // requireCapability checks — can only further restrict, never loosen.)
  fastify.addHook('preHandler', moduleGate('reports'));
  fastify.get(
    '/reports/*',
    { preHandler: [fastify.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const wildcard = (req.params as { '*': string })['*'];

      // Parse the incoming query string once
      const rawUrl = req.raw.url ?? '';
      const qsIndex = rawUrl.indexOf('?');
      const rawQs   = qsIndex >= 0 ? rawUrl.slice(qsIndex + 1) : '';
      const params  = new URLSearchParams(rawQs);
      const isCsv   = params.get('format') === 'csv';

      // ── CSV export — stream raw body through ──────────────
      if (isCsv) {
        const upstream = `${config.nexriskApiUrl}/api/v1/reports/${wildcard}${qsIndex >= 0 ? rawUrl.slice(qsIndex) : ''}`;
        try {
          const { statusCode, headers, body } = await undiciRequest(upstream, {
            method: 'GET',
            headers: { Accept: 'text/csv' },
            bodyTimeout: config.nexriskApiTimeoutMs,
            headersTimeout: config.nexriskApiTimeoutMs,
          });

          if (statusCode >= 400) {
            const text = await body.text();
            let parsed: unknown;
            try { parsed = JSON.parse(text); }
            catch { parsed = { error: text || `HTTP ${statusCode}` }; }
            return reply.code(statusCode).send(parsed);
          }

          reply.header('Content-Type', 'text/csv');
          const cd = headers['content-disposition'];
          if (cd) reply.header('Content-Disposition', String(cd));
          return reply.send(await body.text());

        } catch (err) {
          fastify.log.error({ err, upstream }, '[reports] CSV upstream failed');
          return reply.code(503).send({ error: 'Reports service unavailable' });
        }
      }

      // ── JSON — use nexriskApi exactly like every other route ──
      // Convert URLSearchParams → plain object for nexriskApi
      const query: Record<string, string> = {};
      for (const [k, v] of params.entries()) {
        query[k] = v;
      }

      const response = await nexriskApi.get(`/api/v1/reports/${wildcard}`, query);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    },
  );
}