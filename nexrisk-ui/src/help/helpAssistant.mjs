// ============================================================
// help/helpAssistant.mjs
// Orchestrates a grounded answer: retrieval -> grounding gate -> system prompt ->
// model completion (injected) -> citation validation -> refusal handling.
//
// The completion function is injected so this is testable without a live model
// and so the BFF owns the actual C++ call. This module NEVER lets an ungrounded
// or uncited answer through — every exit is either a validated, cited answer or
// a clean refusal that routes the user to Contact Technical Support.
// ============================================================

import { retrieve } from './helpRetrieval.mjs';

const SUPPORT = 'please contact Technical Support.';
const REFUSAL = {
  advice:      `I can explain how Taiga works, but I can't advise on trading, hedging, or execution decisions. For that, ${SUPPORT}`,
  'no-match':  `I don't have that documented in the Taiga help. For help with this, ${SUPPORT}`,
  'no-answer': `I don't have that documented in the Taiga help. For help with this, ${SUPPORT}`,
  unavailable: `The help assistant is temporarily unavailable — please try again shortly, or ${SUPPORT}`,
};

export function buildSystemPrompt(context) {
  return [
    'You are the Taiga help assistant. Taiga is an institutional forex/CFD broker',
    'risk-management platform. Answer the user question about how to use Taiga using',
    'ONLY the reference ARTICLES below.',
    '',
    'Rules:',
    '- Use ONLY the ARTICLES. Never use outside knowledge. Never invent field names,',
    '  endpoints, parameters, thresholds, or values that are not in the ARTICLES.',
    '- Cite every factual claim inline with the source article id, as [[article-id]]',
    '  or [[article-id#anchor]], using ids/anchors exactly as shown in the ARTICLES.',
    '- If the ARTICLES do not answer the question, reply with exactly: NO_ANSWER',
    '- Never give trading, hedging, execution, or risk advice. Explain how the tool',
    '  works; never tell the user what to trade/hedge/book or whether to. If asked',
    '  for such advice, reply with exactly: NO_ANSWER',
    '- Be concise and direct. No preamble, no sign-off.',
    '',
    'ARTICLES:',
    context,
  ].join('\n');
}

// keep only [[id]] / [[id#anchor]] citations whose id is in the allowed set;
// strip the rest. Returns cleaned text + the unique cited articles.
export function validateCitations(text, articles) {
  const allowed = new Map(articles.map((a) => [a.id, a]));
  const cited = new Map();
  const clean = text.replace(/\[\[([a-z0-9-]+)(?:#([a-z0-9-]+))?\]\]/g, (m, id, anchor) => {
    const a = allowed.get(id);
    if (!a) return '';                                   // invalid citation -> drop
    cited.set(id, { id, title: a.title, route: a.route });
    return anchor ? `[[${id}#${anchor}]]` : `[[${id}]]`;
  }).replace(/\s+([.,;:])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim();
  return { answer: clean, citations: [...cited.values()] };
}

const refuse = (reason) => ({ refused: true, reason, answer: REFUSAL[reason] || REFUSAL['no-answer'], citations: [] });

/**
 * answerQuestion(question, route, complete)
 *   complete: async ({system, question}) => { ok, text?, circuitOpen? }
 * returns { refused, reason?, answer, citations, sources? }
 */
export async function answerQuestion(question, route, complete) {
  if (!question || !question.trim()) return refuse('no-answer');

  const r = retrieve(question, route);
  if (!r.grounded) return refuse(r.reason === 'advice' ? 'advice' : 'no-match');

  let res;
  try {
    res = await complete({ system: buildSystemPrompt(r.context), question: question.trim() });
  } catch {
    return refuse('unavailable');
  }
  if (!res || !res.ok || !res.text || !res.text.trim()) return refuse('unavailable');

  const text = res.text.trim();
  if (/^NO_ANSWER\b/.test(text) || text === 'NO_ANSWER' || /\bNO_ANSWER\b/.test(text)) return refuse('no-answer');

  const { answer, citations } = validateCitations(text, r.articles);
  // Grounding backstop: a real answer must cite the corpus. No citations -> refuse.
  if (!citations.length) return refuse('no-answer');

  return { refused: false, answer, citations, sources: r.articles.map((a) => a.id) };
}
