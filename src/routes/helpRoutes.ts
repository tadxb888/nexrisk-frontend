// ============================================================
// src/routes/helpRoutes.ts   (Fastify BFF plugin — ESM / NodeNext)
// Help + live-data operations assistant, under /api/v1/help/*.
// Reaches C++ /api/v1/llm/complete via the shared nexriskApi helper for model
// completion, and read-only GET endpoints (WHITELISTED in helpAgent.mjs) for
// live business data. Corpus is resolved from this file's own location.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nexriskApi } from '../services/nexrisk-api.js';

const HERE = __dirname;
const HELP_DIR = process.env.HELP_DIR || join(HERE, '..', '..', 'nexrisk-ui', 'src', 'help');
const esm = (name: string) => import(pathToFileURL(join(HELP_DIR, name)).href);

type CompleteResult = { ok: boolean; text?: string; circuitOpen?: boolean };

// ── model completion (unchanged from the working help route) ──
async function complete({ system, question }: { system: string; question: string }): Promise<CompleteResult> {
  const res = await nexriskApi.post('/api/v1/llm/complete', {
    system,
    messages: [{ role: 'user', content: question }],
    max_tokens: 700,
    temperature: 0.2,
    purpose: 'help_assistant',
  });
  const body = (res.ok ? res.data : res.error) as {
    success?: boolean; provider?: string; data?: { text?: string };
  } | undefined;
  if (!res.ok || !body?.success || !body?.data?.text) {
    return { ok: false, circuitOpen: body?.provider === 'circuit_open' };
  }
  return { ok: true, text: body.data.text };
}

// ── live read-only data access. Second gate: the agent already whitelists, but
// we ONLY ever issue GETs here, and only for /api/v1/* paths. No writes ever. ──
async function api(path: string): Promise<{ ok: boolean; status?: number; data?: unknown }> {
  if (typeof path !== 'string' || !path.startsWith('/api/v1/')) return { ok: false };
  const res = await nexriskApi.get(path);
  return { ok: res.ok, status: res.status, data: res.ok ? (res.data as { data?: unknown })?.data ?? res.data : undefined };
}

// answer shape the frontend already expects
type AgentResult = { bucket: string; answer: string; refused?: boolean; tool?: string; sources?: string[] };

export async function helpRoutes(fastify: FastifyInstance): Promise<void> {
  const [{ getManifest, getArticle }, retrievalMod, { answerQuestion }] = (await Promise.all([
    esm('helpRetrieval.mjs'),
    esm('helpRetrieval.mjs'),
    esm('helpAgent.mjs'),
  ])) as [
    { getManifest: () => unknown; getArticle: (id: string) => unknown },
    { retrieve?: (q: string, route?: string) => unknown },
    { answerQuestion: (q: string, ctx: unknown) => Promise<AgentResult> },
  ];

  // corpus retrieval for the "howto" bucket (returns { context, articles } | null)
  const retrieve = (q: string) => {
    try { return (retrievalMod as { retrieve?: (x: string) => unknown }).retrieve?.(q) ?? null; }
    catch { return null; }
  };

  fastify.get('/help/manifest', { preHandler: [fastify.authenticate] }, async () => getManifest());

  fastify.get<{ Params: { id: string } }>(
    '/help/article/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const a = getArticle(req.params.id);
      if (!a) return reply.code(404).send({ error: 'not found' });
      return a;
    },
  );

  fastify.post<{ Body: { question?: string; route?: string } }>(
    '/help/ask',
    { preHandler: [fastify.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { question } = req.body || {};
      if (!question || typeof question !== 'string' || question.trim().length === 0 || question.length > 1000) {
        return reply.code(400).send({ error: 'question required (1-1000 chars)' });
      }
      const r = await answerQuestion(question, { complete, api, retrieve });
      // normalize to the { answer, citations, refused } shape the client already renders
      return {
        refused: !!r.refused,
        answer: r.answer,
        citations: [],
        sources: r.sources ?? [],
        bucket: r.bucket,
      };
    },
  );
}
