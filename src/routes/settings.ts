// ============================================================
// src/routes/settings.ts
// NexRisk Settings API — Phase 8
//
// Proxies all /api/settings/* requests to the C++ backend
// at /api/v1/settings/*. Covers:
//   GET  /api/settings                      → combined all-sections
//   GET  /api/settings/classifier           → classifier config
//   GET  /api/settings/detection            → detection thresholds
//   GET  /api/settings/llm                  → LLM config
//   GET  /api/settings/llm/usage            → live usage counters
//   GET  /api/settings/pending-restart      → pending restart fields
//   PUT  /api/settings/classifier/:sub      → update classifier section
//   PUT  /api/settings/detection/:sub       → update detection section
//   PUT  /api/settings/llm/:sub             → update LLM section
//   PUT  /api/settings/detection/thresholds/:behavior
//   PUT  /api/settings/llm/providers/claude/api-key (write-only)
//
// All PUT responses follow the common envelope:
//   { success, warnings, pending_restart, restart_notice? }
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nexriskApi, snakeToCamel, camelToSnake } from '../services/nexrisk-api.js';

// ── helpers ──────────────────────────────────────────────────

/**
 * Proxy a GET to the C++ backend and forward the response.
 * Applies snakeToCamel transformation so the frontend gets camelCase.
 */
async function proxyGet(
  path: string,
  reply: FastifyReply,
  params?: Record<string, unknown>
) {
  const response = await nexriskApi.get(path, params);
  if (!response.ok) {
    return reply.code(response.status).send(response.error);
  }
  return reply.send(snakeToCamel(response.data as Record<string, unknown>));
}

/**
 * Proxy a PUT/POST to the C++ backend, forward the common envelope response.
 * Transforms request body camelCase → snake_case before sending.
 */
async function proxyWrite(
  method: 'PUT' | 'POST',
  path: string,
  body: unknown,
  reply: FastifyReply
) {
  const response = method === 'PUT'
    ? await nexriskApi.put(path, body)
    : await nexriskApi.post(path, body);
  if (!response.ok) {
    return reply.code(response.status).send(response.error);
  }
  // Envelope: { success, warnings, pending_restart, restart_notice? }
  return reply.send(response.data);
}

// ─────────────────────────────────────────────────────────────

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {

  // ══════════════════════════════════════════════════════════
  // GLOBAL
  // ══════════════════════════════════════════════════════════

  /**
   * GET /api/settings
   * All four sections in one response.
   * Response: { nexrisk, classifier, detection, llm, pending_restart }
   */
  fastify.get(
    '/settings',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings', reply);
    }
  );

  /**
   * GET /api/settings/pending-restart
   * Response: { has_pending, pending_fields[] }
   */
  fastify.get(
    '/settings/pending-restart',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/pending-restart', reply);
    }
  );

  /**
   * POST /api/settings/restart
   * Body: { confirm: true }
   */
  fastify.post(
    '/settings/restart',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('POST', '/api/v1/settings/restart', request.body, reply);
    }
  );

  // ══════════════════════════════════════════════════════════
  // CLASSIFIER
  // ══════════════════════════════════════════════════════════

  /**
   * GET /api/settings/classifier
   * Full classifier config: global, decision_engine, risk_severity,
   * anomaly_detector, ea, scalper, arbitrage, rebate, news
   */
  fastify.get(
    '/settings/classifier',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/classifier', reply);
    }
  );

  fastify.get(
    '/settings/classifier/defaults',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/classifier/defaults', reply);
    }
  );

  fastify.get(
    '/settings/classifier/diff',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/classifier/diff', reply);
    }
  );

  /** PUT /api/settings/classifier/global — min_trades_for_classification */
  fastify.put(
    '/settings/classifier/global',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/classifier/global', request.body, reply);
    }
  );

  /** PUT /api/settings/classifier/decision-engine */
  fastify.put(
    '/settings/classifier/decision-engine',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/classifier/decision-engine', request.body, reply);
    }
  );

  /** PUT /api/settings/classifier/risk-severity */
  fastify.put(
    '/settings/classifier/risk-severity',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/classifier/risk-severity', request.body, reply);
    }
  );

  /** PUT /api/settings/classifier/anomaly-detector */
  fastify.put(
    '/settings/classifier/anomaly-detector',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/classifier/anomaly-detector', request.body, reply);
    }
  );

  /**
   * PUT /api/settings/classifier/:detector
   * detector: ea | scalper | arbitrage | rebate | news
   */
  fastify.put(
    '/settings/classifier/:detector',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { detector } = request.params as { detector: string };
      const valid = ['ea', 'scalper', 'arbitrage', 'rebate', 'news'];
      if (!valid.includes(detector)) {
        return reply.code(400).send({ success: false, error: `Unknown detector: ${detector}` });
      }
      return proxyWrite('PUT', `/api/v1/settings/classifier/${detector}`, request.body, reply);
    }
  );

  /**
   * POST /api/settings/classifier/reset/:subsection
   */
  fastify.post(
    '/settings/classifier/reset/:subsection',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subsection } = request.params as { subsection: string };
      return proxyWrite('POST', `/api/v1/settings/classifier/reset/${subsection}`, {}, reply);
    }
  );

  fastify.get(
  '/settings/classifier/history',
  { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
  async (request, reply) => {
    return proxyGet(`/api/v1/settings/classifier/history`, reply, request.query as Record<string, unknown>);
  }
);

  // ══════════════════════════════════════════════════════════
  // DETECTION
  // ══════════════════════════════════════════════════════════

  /**
   * GET /api/settings/detection
   * Full detection config: risk_scoring, thresholds, processing, auto_escalation
   */
  fastify.get(
    '/settings/detection',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/detection', reply);
    }
  );

  fastify.get(
    '/settings/detection/defaults',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/detection/defaults', reply);
    }
  );

  fastify.get(
    '/settings/detection/diff',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/detection/diff', reply);
    }
  );

  /** GET /api/settings/detection/thresholds — all behavior threshold ladders */
  fastify.get(
    '/settings/detection/thresholds',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/detection/thresholds', reply);
    }
  );

  /** PUT /api/settings/detection/risk-scoring */
  fastify.put(
    '/settings/detection/risk-scoring',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/detection/risk-scoring', request.body, reply);
    }
  );

  /** PUT /api/settings/detection/processing */
  fastify.put(
    '/settings/detection/processing',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/detection/processing', request.body, reply);
    }
  );

  /** PUT /api/settings/detection/auto-escalation */
  fastify.put(
    '/settings/detection/auto-escalation',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/detection/auto-escalation', request.body, reply);
    }
  );

  /**
   * PUT /api/settings/detection/thresholds/:behavior
   * behavior: EA | SCALPER | ARBITRAGE | REBATE
   * Body: { MONITOR: {...}, WARN: {...}, RESTRICT: {...}, ESCALATE: {...} }
   */
  fastify.put(
    '/settings/detection/thresholds/:behavior',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { behavior } = request.params as { behavior: string };
      const valid = ['EA', 'SCALPER', 'ARBITRAGE', 'REBATE'];
      if (!valid.includes(behavior.toUpperCase())) {
        return reply.code(400).send({ success: false, error: `Unknown behavior: ${behavior}` });
      }
      return proxyWrite('PUT', `/api/v1/settings/detection/thresholds/${behavior.toUpperCase()}`, request.body, reply);
    }
  );

  /**
   * PUT /api/settings/detection/thresholds/:behavior/:level
   * level: MONITOR | WARN | RESTRICT | ESCALATE
   */
  fastify.put(
    '/settings/detection/thresholds/:behavior/:level',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { behavior, level } = request.params as { behavior: string; level: string };
      return proxyWrite(
        'PUT',
        `/api/v1/settings/detection/thresholds/${behavior.toUpperCase()}/${level.toUpperCase()}`,
        request.body,
        reply
      );
    }
  );

  /**
   * POST /api/settings/detection/reset/:subsection
   */
  fastify.post(
    '/settings/detection/reset/:subsection',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subsection } = request.params as { subsection: string };
      return proxyWrite('POST', `/api/v1/settings/detection/reset/${subsection}`, {}, reply);
    }
  );

  fastify.get(
  '/settings/detection/history',
  { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
  async (request, reply) => {
    return proxyGet(`/api/v1/settings/detection/history`, reply, request.query as Record<string, unknown>);
  }
);

  // ══════════════════════════════════════════════════════════
  // LLM
  // ══════════════════════════════════════════════════════════

  /**
   * GET /api/settings/llm
   * Full LLM config: providers, claude, ollama, routing, cost_controls, caching
   * Note: api_key is never returned.
   */
  fastify.get(
    '/settings/llm',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/settings/llm');
      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }
      // The C++ backend already returns camelCase JSON so snakeToCamel is a no-op here,
      // but we call it for consistency. The key path is data.llm.claude.apiKey.
      const data = snakeToCamel(response.data as Record<string, unknown>) as any;
      const claudeNode = data?.llm?.claude ?? data?.claude;
      if (claudeNode) {
        // Capture whether a key is set BEFORE deleting
        const hasKey = !!(claudeNode.apiKey ?? claudeNode.api_key);
        // Delete the key — it must never leave the BFF
        delete claudeNode.apiKey;
        delete claudeNode.api_key;
        // Inject boolean status so UI knows a key is configured
        claudeNode.apiKeyConfigured = hasKey;
      }
      return reply.send(data);
    }
  );

  fastify.get(
    '/settings/llm/defaults',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/llm/defaults', reply);
    }
  );

  fastify.get(
    '/settings/llm/diff',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/llm/diff', reply);
    }
  );

  /**
   * GET /api/settings/llm/usage
   * Live cost + cache counters. Resets daily at midnight UTC.
   */
  fastify.get(
    '/settings/llm/usage',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/llm/usage', reply);
    }
  );

  /** GET /api/settings/llm/cost-estimates — monthly projections */
  fastify.get(
    '/settings/llm/cost-estimates',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGet('/api/v1/settings/llm/cost-estimates', reply);
    }
  );

  /** PUT /api/settings/llm/providers — select default + fallback provider */
  fastify.put(
    '/settings/llm/providers',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/providers', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/providers/claude — model, timeout, max_tokens, temperature */
  fastify.put(
    '/settings/llm/providers/claude',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/providers/claude', request.body, reply);
    }
  );

  /**
   * PUT /api/settings/llm/providers/claude/api-key
   * Write-only. The key is stored securely and never returned in any GET.
   */
  fastify.put(
    '/settings/llm/providers/claude/api-key',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/providers/claude/api-key', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/providers/ollama */
  fastify.put(
    '/settings/llm/providers/ollama',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/providers/ollama', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/routing — risk-level routing matrix */
  fastify.put(
    '/settings/llm/routing',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/routing', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/routing/overrides — action code routing overrides */
  fastify.put(
    '/settings/llm/routing/overrides',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/routing/overrides', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/cost-controls */
  fastify.put(
    '/settings/llm/cost-controls',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/cost-controls', request.body, reply);
    }
  );

  /** PUT /api/settings/llm/caching */
  fastify.put(
    '/settings/llm/caching',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWrite('PUT', '/api/v1/settings/llm/caching', request.body, reply);
    }
  );

  /**
   * POST /api/settings/llm/reset/:subsection
   * subsection: claude | ollama | routing | cost_controls | caching
   */
  fastify.post(
    '/settings/llm/reset/:subsection',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { subsection } = request.params as { subsection: string };
      return proxyWrite('POST', `/api/v1/settings/llm/reset/${subsection}`, {}, reply);
    }
  );

  fastify.get(
  '/settings/llm/history',
  { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
  async (request, reply) => {
    return proxyGet(`/api/v1/settings/llm/history`, reply, request.query as Record<string, unknown>);
  }
);
}