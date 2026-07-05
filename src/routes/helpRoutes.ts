// ============================================================
// src/routes/helpRoutes.ts   (Fastify BFF plugin — ESM / NodeNext)
// Help assistant + corpus browsing. Registered inside the /api/v1 group, so:
//   POST /api/v1/help/ask            { question, route? } -> grounded/cited or refusal
//   GET  /api/v1/help/manifest       reviewed articles (Help page index)
//   GET  /api/v1/help/article/:id    one reviewed article (frontmatter + markdown)
//
// Retrieval, grounding, citation validation, and refusal all live here (via the
// ESM helpRetrieval/helpAssistant modules in the frontend package). The C++
// service is a dumb completion pipe reached through the existing nexriskApi
// helper, which injects X-Internal-Secret and reads the C++ URL from config —
// so this route needs NO new env, only optional HELP_DIR for the corpus path.
// ============================================================

import type { FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nexriskApi } from '../services/nexrisk-api.js';

// Corpus + logic live in the frontend package. Default assumes the BFF is
// started from the repo root (dev). Override HELP_DIR for other deploy layouts.
const HELP_DIR = process.env.HELP_DIR || join(process.cwd(), 'nexrisk-ui', 'src', 'help');
const esm = (name: string) => import(pathToFileURL(join(HELP_DIR, name)).href);

type CompleteResult = { ok: boolean; text?: string; circuitOpen?: boolean };

// Calls C++ POST /api/v1/llm/complete via the shared helper. On any non-success
// or empty body returns ok:false so the assistant refuses cleanly (C++ sends no
// template body). circuit_open is surfaced for backoff.
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

  // Browse: index of reviewed articles. Session required (help itself is ungated).
  fastify.get(
    '/help/manifest',
    { preHandler: [fastify.authenticate] },
    async () => getManifest(),
  );

  // Browse: one reviewed article (id validated inside getArticle).
  fastify.get<{ Params: { id: string } }>(
    '/help/article/:id',
    { preHandler: [fastify.authenticate] },
    async (req, reply) => {
      const a = getArticle(req.params.id);
      if (!a) return reply.code(404).send({ error: 'not found' });
      return a;
    },
  );

  // Ask: grounded, cited answer or clean refusal. LLM calls cost money — rate-limit.
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
