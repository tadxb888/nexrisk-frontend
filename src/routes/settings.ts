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
import { moduleGate } from '../middleware/auth.js';
import { nexriskApi, snakeToCamel } from '../services/nexrisk-api.js';
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

// ── raw pass-through helpers (System Administration surface) ──
//
// The nexrisk/classifier/detection/llm handlers above apply snakeToCamel to
// GET responses as a historical convention. The System Administration API
// (/gateway, /fixbridge, /lp, /logs, /auth/rotate, /nexrisk/*) is documented
// in snake_case in settings_api.md and the frontend expects shapes to match
// that spec 1:1 — so these helpers pass bodies through verbatim in both
// directions. Error envelopes ({ success:false, error|errors, warnings })
// are preserved by forwarding response.error as-is.

async function proxyGetRaw(
  path: string,
  reply: FastifyReply,
  params?: Record<string, unknown>
) {
  const response = await nexriskApi.get(path, params);
  if (!response.ok) {
    return reply.code(response.status).send(response.error);
  }
  return reply.send(response.data);
}

async function proxyWriteRaw(
  method: 'PUT' | 'POST' | 'DELETE',
  path: string,
  body: unknown,
  reply: FastifyReply
) {
  let response;
  if (method === 'DELETE') {
    response = await nexriskApi.delete(path);
  } else if (method === 'PUT') {
    response = await nexriskApi.put(path, body);
  } else {
    response = await nexriskApi.post(path, body);
  }
  if (!response.ok) {
    return reply.code(response.status).send(response.error);
  }
  return reply.send(response.data);
}

// ─────────────────────────────────────────────────────────────

export async function settingsRoutes(fastify: FastifyInstance): Promise<void> {
  // RBAC: the classifier / detection / llm settings ARE the Archetype
  // Intelligence page's data, so those routes gate on the 'archetype' module.
  // Everything else in this plugin is genuine platform settings ('settings').
  // GET/HEAD require VIEW; mutations require EDIT. (Layered over existing
  // requireCapability checks — can only further restrict, never loosen.)
  const settingsGate  = moduleGate('settings');
  const archetypeGate = moduleGate('archetype');
  fastify.addHook('preHandler', async (request, reply) => {
    const path = request.url;
    const isArchetypeData =
      path.includes('/settings/classifier') ||
      path.includes('/settings/detection') ||
      path.includes('/settings/llm');
    return (isArchetypeData ? archetypeGate : settingsGate)(request, reply);
  });

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

  // ══════════════════════════════════════════════════════════
  // SYSTEM ADMINISTRATION — snake_case pass-through (settings_api.md)
  //
  // Scope of this block: only the endpoints needed to light up the Settings
  // hub tile for Gateway and its sub-page end-to-end. The other eight panels
  // (LP, NexDay, TE, Auth, Alerting, FIX Bridge, Logs, Rotation) will be
  // added in follow-up tickets using the same proxyGetRaw / proxyWriteRaw
  // pattern below.
  // ══════════════════════════════════════════════════════════

  // ── Global ──

  /**
   * GET /api/v1/settings/pending-restart
   * Response: { has_pending, pending_fields:[{ section, subsection, field }] }
   * Powers the page-level restart banner and per-tile pending markers.
   */
  fastify.get(
    '/settings/pending-restart-raw',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/pending-restart', reply);
    }
  );

  // Note: an existing route at '/settings/pending-restart' (line ~90) runs
  // the response through snakeToCamel. The hub and new panels consume the
  // raw snake_case shape to match settings_api.md — they hit the -raw
  // variant above. The legacy camelCase route is left intact so any
  // existing consumers (classifier/detection/LLM pages) are unaffected.

  // ── Price Feed Gateway (§ 7) ──

  /**
   * GET /api/v1/settings/gateway
   * Response: { success, data: { mt5_server, gateway_login, gateway_password:"***",
   *             gateway_listen, gateway_name, timezone_minutes, log_path } }
   * gateway_password is always masked on read.
   */
  fastify.get(
    '/settings/gateway',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/gateway', reply);
    }
  );

  /**
   * PUT /api/v1/settings/gateway
   * Body: any subset of the fields above. Send gateway_password:null (or omit)
   * to leave the existing password unchanged — never forward the masked
   * "***" value back. Client is responsible for that discipline.
   * Response: { success, restart_required:["nexrisk_gateway_service"], message }
   */
  fastify.put(
    '/settings/gateway',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/gateway', request.body, reply);
    }
  );

  /**
   * GET /api/v1/settings/gateway/status  (§ G3 — live)
   * Live probe, derived from the gateway status log + SCM process state.
   * Envelope: { success, service_state, running, state, mt5_connected,
   *   ticks_received, ticks_sent, tick_rate_per_sec, status_line_time,
   *   status_age_sec, source, note }. `state` ∈ live | warming_up |
   *   no_recent_status | stale | down | unknown. Metrics are null unless
   *   state === 'live'. Forwarded verbatim (snake_case). Poll ~30-60s.
   */
  fastify.get(
    '/settings/gateway/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/gateway/status', reply);
    }
  );

  // ══════════════════════════════════════════════════════════
  // SERVICE HEALTH (§ G1) + SETTINGS AUDIT HISTORY (§ G2)
  // Cross-cutting: every Settings sub-page reads these. Raw pass-through
  // to preserve the exact snake_case shapes captured live in the FE
  // action list. Both are poll-based (no WebSocket).
  // ══════════════════════════════════════════════════════════

  /**
   * GET /api/v1/settings/services/health  (§ G1) — poll ~10-30s.
   * Live process state for the three managed services (nexrisk / gateway /
   * fixbridge) from the Windows SCM, with uptime + last_start from the real
   * app process.
   * Envelope: { success, services:[{ id, label, state, running,
   *   uptime_seconds, last_start }] }. state ∈ RUNNING | STOPPED |
   *   START_PENDING | STOP_PENDING | PAUSED | PAUSE_PENDING |
   *   CONTINUE_PENDING | UNKNOWN. uptime_seconds/last_start are null when
   *   the service isn't running. Snake_case forwarded verbatim.
   */
  fastify.get(
    '/settings/services/health',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/services/health', reply);
    }
  );

  /**
   * GET /api/v1/settings/{section}/history?limit=&from=&to=  (§ G2)
   * Audit trail of settings edits with real JWT-email attribution.
   * Envelope: { history:[{ id, subsection, change_type, old_values,
   *   new_values, changed_by, changed_at, reason }], total } — no success
   *   wrapper. Newest-first. limit default 100, capped 1000.
   *
   * Raw pass-through (snake_case) — distinct from the classifier/detection/
   * llm history routes above, which camelCase-transform for the archetype
   * surface. These three belong to the System Administration surface and
   * match the FE action list 1:1.
   *
   * Caveat: the `nexrisk` section history covers all NexRisk subsections
   * (alerts, mt5, analysis, detection-system, memory, llm-system, nexday,
   * telegram, webhooks) — the Auth/TE/NexDay/Alerting panels all read it and
   * filter client-side on `subsection`. LP history is not audited yet
   * (backend "G2 LP tail" pending) — no LP history route until it ships.
   */
  fastify.get(
    '/settings/nexrisk/history',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/nexrisk/history', reply, request.query as Record<string, unknown>);
    }
  );

  fastify.get(
    '/settings/gateway/history',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/gateway/history', reply, request.query as Record<string, unknown>);
    }
  );

  fastify.get(
    '/settings/fixbridge/history',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/fixbridge/history', reply, request.query as Record<string, unknown>);
    }
  );

  // ── Log services directory (§ 9) — used by the Gateway Service panel ──

  /**
   * GET /api/v1/settings/logs/services
   * Response: { success, services:[{ id, label, log_dir, level_configurable }] }
   * The Gateway sub-page's Service panel reads log_dir from the entry with
   * id === "gateway". Not to be confused with service health/uptime, which
   * isn't exposed by the backend yet — those fields render as "—" with an
   * "awaiting backend" indicator.
   */
  fastify.get(
    '/settings/logs/services',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/logs/services', reply);
    }
  );

  /**
   * GET /api/v1/settings/logs/:service/files
   * Response: { success, files:[{ name, size_bytes, modified_at }] }
   * Used by the Log Viewer sub-page's file sidebar and the Search-mode file picker.
   */
  fastify.get(
    '/settings/logs/:service/files',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { service } = request.params as { service: string };
      return proxyGetRaw(`/api/v1/settings/logs/${encodeURIComponent(service)}/files`, reply);
    }
  );

  /**
   * GET /api/v1/settings/logs/:service/tail?lines=N
   * Response: { success, file, lines:[{ text }], truncated }
   * Always tails the newest file for the service. lines capped at 5000.
   */
  fastify.get(
    '/settings/logs/:service/tail',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { service } = request.params as { service: string };
      return proxyGetRaw(
        `/api/v1/settings/logs/${encodeURIComponent(service)}/tail`,
        reply,
        request.query as Record<string, unknown>,
      );
    }
  );

  /**
   * GET /api/v1/settings/logs/:service/search?file=X&q=Y&limit=N
   * Response: { success, file, match_count, lines:[{ text }], truncated }
   * Both file and q are required. Backend rejects filenames with /, \, or ..
   */
  fastify.get(
    '/settings/logs/:service/search',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { service } = request.params as { service: string };
      return proxyGetRaw(
        `/api/v1/settings/logs/${encodeURIComponent(service)}/search`,
        reply,
        request.query as Record<string, unknown>,
      );
    }
  );

  /**
   * GET /api/v1/settings/logs/:service/download?file=X
   * Streams the file as text/plain (or application/gzip for .gz) with
   * Content-Disposition set by the C++ backend. Consumed as a direct
   * <a href> from the UI so cookie auth applies naturally.
   *
   * The shared proxyGetRaw helper parses JSON and can't handle streams, so
   * this handler uses native fetch + buffered arrayBuffer response. Files
   * are expected to be bounded by the backend's retention/segment settings
   * so full buffering is acceptable for v1.
   */
  fastify.get(
    '/settings/logs/:service/download',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { service } = request.params as { service: string };
      const { file }    = request.query  as { file?: string };

      if (!file || typeof file !== 'string') {
        return reply.code(400).send({ success: false, error: 'file query parameter is required' });
      }

      const baseUrl = process.env.NEXRISK_API_URL         ?? 'http://localhost:8090';
      const secret  = process.env.NEXRISK_INTERNAL_SECRET ?? '';
      const upstreamUrl =
        `${baseUrl}/api/v1/settings/logs/${encodeURIComponent(service)}/download?file=${encodeURIComponent(file)}`;

      try {
        const upstream = await fetch(upstreamUrl, {
          headers: { 'X-Internal-Secret': secret },
        });

        if (!upstream.ok) {
          const body = await upstream.text().catch(() => '');
          return reply.code(upstream.status).type('application/json').send(
            body || JSON.stringify({ success: false, error: `Upstream returned ${upstream.status}` }),
          );
        }

        const ct = upstream.headers.get('content-type')        ?? 'text/plain; charset=utf-8';
        const cd = upstream.headers.get('content-disposition') ?? `attachment; filename="${file}"`;
        reply.header('content-type',        ct);
        reply.header('content-disposition', cd);

        const buf = await upstream.arrayBuffer();
        return reply.send(Buffer.from(buf));
      } catch (err) {
        fastify.log.error({ err }, 'log download proxy failed');
        return reply.code(502).send({ success: false, error: 'Upstream proxy failed' });
      }
    }
  );

  /**
   * 🔒 PUT /api/v1/settings/logs/:service/level
   * Body: { level: "trace"|"debug"|"info"|"warn"|"error" }
   * Response: { success, restart_required:[service], message }
   *
   * Requires settings >= EDIT at the C++ layer. The BFF uses config.write
   * capability as the gate — the nexrisk_service re-checks the JWT role
   * on receipt. Not valid for fix_messages (level_configurable: false).
   */
  fastify.put(
    '/settings/logs/:service/level',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { service } = request.params as { service: string };
      return proxyWriteRaw('PUT', `/api/v1/settings/logs/${encodeURIComponent(service)}/level`, request.body, reply);
    }
  );

  // ── Secret rotation (§ 10) — root-only at the C++ layer ─────────────
  //
  // These paths live under /auth/rotate/* in the backend, not /settings/*.
  // Registered here to keep all System Administration routes in one file;
  // the BFF route namespace matches the backend for clarity. The C++
  // service re-checks role == "root" on receipt — config.write is a
  // coarse gate that keeps non-admins out before they hit the backend.
  //
  // Generated secrets are returned exactly once and are NOT persisted
  // anywhere Claude or the BFF can retrieve them later. The frontend's
  // copy-once modal is the only opportunity to capture the value.

  /**
   * 🔑 POST /api/v1/auth/rotate/internal-secret
   * Body:    { confirm: true }
   * Returns: { success, status:"rotated", new_secret, restart_required:[nexrisk_service,bff], message }
   * Secret:  96-hex-char string. Used for BFF→C++ internal auth
   *          (X-Internal-Secret header). Both sides must be updated.
   */
  fastify.post(
    '/auth/rotate/internal-secret',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/auth/rotate/internal-secret', request.body, reply);
    }
  );

  /**
   * 🔑 POST /api/v1/auth/rotate/jwt-secret
   * Body:    { confirm: true }
   * Returns: { success, status:"rotated", new_secret, invalidates_sessions:true,
   *            restart_required:[nexrisk_service], message }
   * Secret:  128-hex-char string. Used to sign access/refresh tokens.
   *          On restart, all access tokens become invalid — refresh tokens
   *          remain usable until they expire.
   */
  fastify.post(
    '/auth/rotate/jwt-secret',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/auth/rotate/jwt-secret', request.body, reply);
    }
  );

  /**
   * 🔑 GET /api/v1/auth/rotate/encryption-key/preflight
   * Returns: { success, lp_accounts, users_with_totp, estimated_duration_sec,
   *            ok_to_proceed, blockers:[] }
   *
   * Read-only probe — counts encrypted rows that would need re-encryption.
   * Shown before the destructive rotation to give the operator visibility
   * into scope and duration. Not 501 — this endpoint is live today.
   */
  fastify.get(
    '/auth/rotate/encryption-key/preflight',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/auth/rotate/encryption-key/preflight', reply);
    }
  );

  /**
   * 🔑 POST /api/v1/auth/rotate/encryption-key
   * Body:    { confirm: true, confirmation_phrase: "ROTATE ENCRYPTION KEY" }
   * Returns: 501 NOT_IMPLEMENTED today. Once wired, re-encrypts LP credentials
   *          and user TOTP secrets with a freshly generated key.
   *
   * Frontend MUST call /preflight first and display counts before offering
   * the destructive action. During the operation (once implemented), settings
   * writes and user enrolments will be blocked — the UI should surface this.
   */
  fastify.post(
    '/auth/rotate/encryption-key',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/auth/rotate/encryption-key', request.body, reply);
    }
  );

  // ── LP Management (§ 6) — fixbridge_config.json + per-LP capability files ──

  /**
   * GET /api/v1/settings/lp/profiles
   * Returns: { success, enabled_lps:[...], profiles:[{ lp_id, lp_name, version, enabled }] }
   *
   * enabled_lps is the authoritative list of which LPs participate in the FIX
   * bridge session manager. The profiles array is every capability file that
   * exists under config/fixbridge/lp/ — some may be present but disabled.
   */
  fastify.get(
    '/settings/lp/profiles',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/lp/profiles', reply);
    }
  );

  /**
   * GET /api/v1/settings/lp/profiles/:lp_id
   * Returns the full capability JSON for one LP. Structure is loose — eight
   * known top-level keys (connection, custom_fields, instruments, trading,
   * market_data, routes, limits, features) plus identifiers — but the inner
   * schema varies per LP type and isn't fully documented. The frontend
   * handles it generically.
   */
  fastify.get(
    '/settings/lp/profiles/:lp_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = request.params as { lp_id: string };
      return proxyGetRaw(`/api/v1/settings/lp/profiles/${encodeURIComponent(lp_id)}`, reply);
    }
  );

  /**
   * PUT /api/v1/settings/lp/profiles/:lp_id
   * Writes the profile JSON. Restart:fixbridge.
   *
   * The backend silently preserves three sub-objects from the existing file,
   * ignoring any values the client sends for them:
   *   connection, custom_fields, instruments
   *
   * Everything else (trading, market_data, routes, limits, features) is
   * replaceable. The frontend surfaces the read-only sections as collapsed
   * display rather than hiding them, so the admin can see what's being
   * preserved.
   */
  fastify.put(
    '/settings/lp/profiles/:lp_id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = request.params as { lp_id: string };
      return proxyWriteRaw('PUT', `/api/v1/settings/lp/profiles/${encodeURIComponent(lp_id)}`, request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/lp/enabled
   * Body: { enabled_lps: ["traderevolution", "lmax"] }
   * Writes the top-level enabled_lps array in fixbridge_config.json.
   * Restart:fixbridge.
   */
  fastify.put(
    '/settings/lp/enabled',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/lp/enabled', request.body, reply);
    }
  );

  // ── Alerting (§§ 3.2 alerts, 4 telegram, 5 webhooks) ──────────────────
  //
  // The three subsections share a single UI page but hit different endpoints:
  //   § 3.2 /nexrisk/alerts     — core alerts config
  //   § 4   /nexrisk/telegram   — core Telegram config + chat CRUD + live probes
  //   § 5   /nexrisk/webhooks   — core webhook switches + endpoint CRUD + test

  /**
   * PUT /api/v1/settings/nexrisk/alerts (§ 3.2)
   * Body: { enabled, min_severity, cooldown_seconds, max_per_trader_per_hour }
   * Tag:  mixed (some fields live, some restart:nexrisk)
   */
  fastify.put(
    '/settings/nexrisk/alerts',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/alerts', request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/telegram (§ 3.2, 4)
   * Bulk PUT that replaces the whole Telegram config object including the
   * chats array. The chat CRUD endpoints are the primary path for chat
   * mutations — this one is for core settings (enabled, bot_token).
   * Tag: restart:nexrisk.
   *
   * Secret: bot_token. Write-preserve — omit or send null to leave unchanged.
   */
  fastify.put(
    '/settings/nexrisk/telegram',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/telegram', request.body, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/telegram/validate (§ 4)
   * Body:    { bot_token: "..." }
   * Returns: { ok, bot_username, bot_id } — or 501 today.
   * Live probe. Does not persist anything; exists so the admin can verify
   * the token works before committing it via the core PUT.
   */
  fastify.post(
    '/settings/nexrisk/telegram/validate',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/settings/nexrisk/telegram/validate', request.body, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/telegram/resolve-chat (§ 4)
   * Body:    { username_or_link: "@myroom" | "https://t.me/..." }
   * Returns: { chat_id, title, type } — or 501 today.
   * Live probe. Converts a human-readable handle into a numeric chat_id.
   */
  fastify.post(
    '/settings/nexrisk/telegram/resolve-chat',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/settings/nexrisk/telegram/resolve-chat', request.body, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/telegram/test (§ 4)
   * Body:    { chat_id: "...", message: "..." }
   * Returns: { ok, message_id } — or 501 today.
   * Live probe. Sends an actual Telegram message — safe to call but visible
   * to anyone in that chat.
   */
  fastify.post(
    '/settings/nexrisk/telegram/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/settings/nexrisk/telegram/test', request.body, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/telegram/chats (§ 4)
   * Body:    { chat_id, label, alert_levels:[...] }
   * Returns: 201 { success, chat: { id, chat_id, label, alert_levels }, pending_restart }
   * The server generates the internal id (`chat_<12hex>`).
   */
  fastify.post(
    '/settings/nexrisk/telegram/chats',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/settings/nexrisk/telegram/chats', request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/telegram/chats/:id (§ 4)
   * Body: { chat_id?, label?, alert_levels? } — partial patch over the chat.
   */
  fastify.put(
    '/settings/nexrisk/telegram/chats/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return proxyWriteRaw('PUT', `/api/v1/settings/nexrisk/telegram/chats/${encodeURIComponent(id)}`, request.body, reply);
    }
  );

  /**
   * DELETE /api/v1/settings/nexrisk/telegram/chats/:id (§ 4)
   * Returns the usual SettingsManager envelope.
   */
  fastify.delete(
    '/settings/nexrisk/telegram/chats/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return proxyWriteRaw('DELETE', `/api/v1/settings/nexrisk/telegram/chats/${encodeURIComponent(id)}`, null, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/webhooks (§ 3.2, 5)
   * Bulk PUT that replaces the whole webhooks config object including the
   * endpoints array. Use the endpoint CRUD for endpoint-level changes.
   * Tag: restart:nexrisk.
   */
  fastify.put(
    '/settings/nexrisk/webhooks',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/webhooks', request.body, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/webhooks/endpoints (§ 5)
   * Body:    { url, auth_header?, alert_levels:[...], enabled }
   * Returns: 201 { success, webhook: { id, ... }, pending_restart }
   */
  fastify.post(
    '/settings/nexrisk/webhooks/endpoints',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('POST', '/api/v1/settings/nexrisk/webhooks/endpoints', request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/webhooks/endpoints/:id (§ 5)
   */
  fastify.put(
    '/settings/nexrisk/webhooks/endpoints/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return proxyWriteRaw('PUT', `/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}`, request.body, reply);
    }
  );

  /**
   * DELETE /api/v1/settings/nexrisk/webhooks/endpoints/:id (§ 5)
   */
  fastify.delete(
    '/settings/nexrisk/webhooks/endpoints/:id',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return proxyWriteRaw('DELETE', `/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}`, null, reply);
    }
  );

  /**
   * POST /api/v1/settings/nexrisk/webhooks/endpoints/:id/test (§ 5)
   * Returns: { ok, status_code, duration_ms, message } — or 501 today.
   * Live probe. Fires an actual HTTP request to the configured URL with a
   * test payload; logs whatever the endpoint returns.
   */
  fastify.post(
    '/settings/nexrisk/webhooks/endpoints/:id/test',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return proxyWriteRaw('POST', `/api/v1/settings/nexrisk/webhooks/endpoints/${encodeURIComponent(id)}/test`, request.body, reply);
    }
  );

  // ── Nexrisk subsections (§ 3) — powers three hub tiles ──

  /**
   * GET /api/v1/settings/nexrisk (raw pass-through)
   *
   * Returns the full nexrisk_config.json surface in one call. Used by the hub
   * to fill the NexDay, Trading Economics, and Auth & Session tiles without
   * three separate round-trips.
   *
   * Response shape: { nexrisk: { alerts, nexday, trading_economics, auth, ... } }
   *   — or possibly flattened depending on the C++ layer's serialisation.
   *   The frontend unwraps defensively: data.nexrisk ?? data.
   *
   * Secrets in the sub-objects (nexday.license_id, trading_economics.api_key,
   * telegram.bot_token) are masked per the brief §2.2 — frontend never pre-fills
   * these into editable inputs, and their PUTs must omit them to preserve.
   *
   * Note: this uses the '-raw' suffix in line with /settings/pending-restart-raw
   * so that if/when a camelCase-transforming /settings/nexrisk route is added
   * for other consumers (matching the classifier/detection/LLM convention),
   * there's no collision. The hub always hits the -raw variant to keep shapes
   * aligned with settings_api.md.
   */
  fastify.get(
    '/settings/nexrisk-raw',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/nexrisk', reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/auth (§ 3.2)
   * Updates token TTLs, issuer, and password policy. All fields require a
   * nexrisk_service restart to apply (tag: restart:nexrisk).
   *
   * Request body shape (settings_api.md § 3.3):
   *   { totp_issuer, access_token_ttl_seconds, refresh_token_ttl_seconds,
   *     invite_token_ttl_seconds, password_min_length, password_reset_ttl_seconds }
   *
   * Response envelope (SettingsManager-backed):
   *   { success, warnings:[], pending_restart:bool, restart_notice?:string }
   *   — distinct from the standalone file envelope used by /gateway.
   *
   * Secrets note: this subsection has none. jwt_secret / internal_api_secret /
   * encryption_key are not settable here; see §10 rotation endpoints.
   */
  fastify.put(
    '/settings/nexrisk/auth',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/auth', request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/trading-economics (§ 3.2)
   * Updates the Trading Economics calendar feed config. All fields restart:nexrisk.
   *
   * Request body shape (settings_api.md § 3.3):
   *   { enabled, api_key, preload_days_back, preload_days_ahead,
   *     poll_interval_seconds, ws_endpoint }
   *
   * Response envelope: SettingsManager-backed (success/warnings/pending_restart).
   *
   * Secret: api_key. Frontend write-preserve contract — omit the field entirely
   * (or send null) to leave it unchanged. Never forward the server's masked
   * value back verbatim.
   */
  fastify.put(
    '/settings/nexrisk/trading-economics',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/trading-economics', request.body, reply);
    }
  );

  /**
   * PUT /api/v1/settings/nexrisk/nexday (§ 3.2)
   * Updates the NexDay market-data integration config. Mixed restart semantics
   * per field_metadata.json (tag: mixed) — some fields live, some restart.
   *
   * Request body shape (settings_api.md § 3.3):
   *   { enabled, api_server, license_id,
   *     polling:   { intraday_enabled, intraday_interval_minutes,
   *                  daily_enabled, daily_time_et },
   *     retention: { daily_bars, intraday_bars },
   *     hedging:   { auto_suggest, min_position_volume,
   *                  suggestion_expiry_minutes } }
   *
   * Response envelope: SettingsManager-backed (success/warnings/pending_restart).
   *
   * Secret: license_id. Frontend write-preserve contract — omit the field
   * entirely (or send null) to leave it unchanged. Never forward the server's
   * masked value back verbatim.
   */
  fastify.put(
    '/settings/nexrisk/nexday',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/nexrisk/nexday', request.body, reply);
    }
  );

  // ── FIX Bridge operational (§ 8) — standalone file-backed ──

  /**
   * GET /api/v1/settings/fixbridge
   * Returns the operational slice of fixbridge_config.json:
   *   { success, data: { log_level, audit, incident, backpressure } }
   *
   * Other fields in the file (enabled_lps, session config, etc.) are
   * not exposed here — they live under /lp/enabled and LP profiles.
   */
  fastify.get(
    '/settings/fixbridge',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/fixbridge', reply);
    }
  );

  /**
   * PUT /api/v1/settings/fixbridge
   * Scope is limited to log_level, audit, incident, backpressure — other
   * fields in the file are left untouched on write. All changes are
   * restart:fixbridge.
   *
   * Validation vocabularies enforced at the C++ layer:
   *   log_level      ∈ trace | debug | info | warn | error
   *   raw_fix.compression ∈ none | zstd | gzip
   *   incident.auto_export_on[] ⊆ SESSION_GAP | BOOK_STALE_EXTENDED |
   *                                MASS_REJECT | SEQ_RESET_FORCED
   *
   * Response: { success, restart_required: ["fixbridge_service"], message }
   */
  fastify.put(
    '/settings/fixbridge',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.write')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return proxyWriteRaw('PUT', '/api/v1/settings/fixbridge', request.body, reply);
    }
  );

  /**
   * GET /api/v1/settings/fixbridge/status  (§ G4 — live)
   * Queries the bridge over its command channel + core service client view.
   * Envelope: { success, connected, client:{ connected, commands_sent,
   *   commands_failed, events_received, executions_received,
   *   md_updates_received, last_event_timestamp_us, last_heartbeat_us },
   *   bridge:{ bridge_id, environment, state, uptime_sec, commands_processed,
   *   commands_failed, lps:[{ lp_id, provider_type, state }] } }.
   * Degraded: { success, connected:false, state:'unavailable', message } when
   *   the bridge client is uninitialised; or bridge:null + bridge_error string
   *   when the round-trip fails while the SUB link is up. Forwarded verbatim.
   * Caveat: use client.last_event_timestamp_us for "last message" — NOT
   *   last_heartbeat_us (currently 0). Poll ~10-15s; each call round-trips
   *   the shared command channel, so keep cadence modest.
   */
  fastify.get(
    '/settings/fixbridge/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return proxyGetRaw('/api/v1/settings/fixbridge/status', reply);
    }
  );
}