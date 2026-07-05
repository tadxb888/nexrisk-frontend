// ============================================================
// src/routes/helpRoutes.ts   (Fastify BFF plugin — ESM / NodeNext)
// Help assistant + corpus browsing, under /api/v1/help/*.
// Reaches C++ /api/v1/llm/complete via the shared nexriskApi helper (reuses
// X-Internal-Secret + NEXRISK_API_URL — no new env). Corpus is resolved from
// this file's own location, so it works regardless of the launch cwd.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nexriskApi } from '../services/nexrisk-api.js';

// dist/routes/helpRoutes.js -> two up is the repo root -> nexrisk-ui/src/help.
// Override with HELP_DIR only for non-standard layouts.
const HERE = __dirname;
const HELP_DIR = process.env.HELP_DIR || join(HERE, '..', '..', 'nexrisk-ui', 'src', 'help');
const esm = (name: string) => import(pathToFileURL(join(HELP_DIR, name)).href);

type CompleteResult = { ok: boolean; text?: string; circuitOpen?: boolean };

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

export async function helpRoutes(fastify: FastifyInstance): Promise<void> {
  const [{ getManifest, getArticle }, { answerQuestion }] = (await Promise.all([
    esm('helpRetrieval.mjs'),
    esm('helpAssistant.mjs'),
  ])) as [
    { getManifest: () => unknown; getArticle: (id: string) => unknown },
    { answerQuestion: (q: string, route: string | undefined, c: typeof complete) => Promise<unknown> },
  ];

  fastify.get(
    '/help/manifest',
    { preHandler: [fastify.authenticate] },
    async () => getManifest(),
  );

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
      const { question, route } = req.body || {};
      if (!question || typeof question !== 'string' || question.trim().length === 0 || question.length > 1000) {
        return reply.code(400).send({ error: 'question required (1-1000 chars)' });
      }
      return answerQuestion(question, typeof route === 'string' ? route : undefined, complete);
    },
  );
}
