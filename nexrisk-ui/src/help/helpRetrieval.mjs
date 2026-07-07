// ============================================================
// help/helpRetrieval.mjs
// Server-side retrieval + grounding gate for the Help assistant.
//
// The assistant may only answer from REVIEWED corpus articles. This module
// scores the corpus against a question (biased toward the page the user is on),
// and decides whether there's enough grounding to answer at all. If not, the
// caller must refuse and route the user to Contact Technical Support — the model
// is never asked to free-generate.
//
// Pure, dependency-free, and framework-agnostic so the Fastify server can import
// it directly. In the BFF (CommonJS) use `__dirname`; here we resolve from
// import.meta.url.
// ============================================================

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;

// route -> module (mirror of navPermissions.ts SubItem.module).
const ROUTE_MODULE = {
  '/': 'cockpit', '/portfolio': 'portfolio', '/b-book': 'bbook',
  '/coverage-book': 'coverage', '/net-exposure': 'net_exposure',
  '/hedging-strategies': 'hedge_strat', '/execution-report': 'exec_report',
  '/price-rules': 'price_rules', '/route-sanity': 'route_sanity',
  '/liquidity-providers': 'lp_admin', '/symbol-mapping': 'symbol_map',
  '/flow': 'focus', '/archetypes': 'archetype', '/predictions': 'predictions',
  '/risk-charter': 'charter', '/logs': 'logs', '/reports': 'reports',
  '/settings': 'settings', '/users': 'users', '/mt5-servers': 'mt5_servers',
};
export const moduleForRoute = (r) => ROUTE_MODULE[r];

// Advice the assistant must never give, regardless of grounding.
const ADVICE_RX = /\b(should i|shall i|do you recommend|what should i (do|trade|hedge|book)|is it (safe|wise|a good idea) to|would you (hedge|book|trade)|recommend (i|me)|tell me what to (do|trade))\b/i;

const STOP = new Set(['the','a','an','of','to','in','on','for','and','or','is','are','what','how','do','does','i','my','me','this','that','it','with','from','can','you','be','as','at','by','if','so']);

function tokenize(s) {
  return [...new Set(String(s).toLowerCase().replace(/[^a-z0-9_%/. -]/g, ' ')
    .split(/[\s]+/).filter((t) => t.length >= 2 && !STOP.has(t)))];
}

let BUNDLE = null;
function loadBundle() {
  if (!BUNDLE) BUNDLE = JSON.parse(readFileSync(join(HERE, 'help-bundle.json'), 'utf8'));
  return BUNDLE;
}

let CORPUS = null;
function loadCorpus() {
  if (CORPUS) return CORPUS;
  const bundle = loadBundle();
  const reviewed = new Set(bundle.corpus);
  CORPUS = bundle.articles.filter((a) => reviewed.has(a.id)).map((a) => {
    const body = a.body || '';
    return {
      id: a.id, title: a.title, type: a.type, domain: a.domain,
      module: a.module, route: a.route, tags: a.tags || [], related: a.related || [],
      body, anchors: a.anchors || [],
      hay: (a.title + ' ' + (a.tags || []).join(' ') + ' ' + body).toLowerCase(),
      titleTokens: new Set(tokenize(a.title + ' ' + (a.tags || []).join(' '))),
    };
  });
  return CORPUS;
}

const MIN_SCORE = 6;   // below this, not enough grounding — refuse
const TOP_K = 4;

/**
 * retrieve(question, route?) -> {
 *   grounded: boolean, reason?: 'advice'|'no-match',
 *   articles: [{id,title,route,score,anchors}], context: string
 * }
 */
export function retrieve(question, route) {
  if (ADVICE_RX.test(question)) return { grounded: false, reason: 'advice', articles: [], context: '' };

  const corpus = loadCorpus();
  const terms = tokenize(question);
  const pageModule = moduleForRoute(route);

  const scored = corpus.map((a) => {
    let s = 0;
    for (const t of terms) {
      if (a.titleTokens.has(t)) s += 5;
      else {
        const n = a.hay.split(t).length - 1;
        if (n > 0) s += Math.min(3, 1 + n * 0.5);
      }
    }
    if (pageModule && a.module === pageModule) s += 6;       // current-page bias
    return { a, s };
  }).sort((x, y) => y.s - x.s);

  const top = scored[0];
  if (!top || top.s < MIN_SCORE) return { grounded: false, reason: 'no-match', articles: [], context: '' };

  // pull top-k above half the leader's score; pad with related for coherence
  const picked = scored.filter((x) => x.s >= Math.max(MIN_SCORE, top.s * 0.4)).slice(0, TOP_K);
  const articles = picked.map(({ a, s }) => ({ id: a.id, title: a.title, route: a.route, score: Math.round(s), anchors: a.anchors }));
  const context = picked.map(({ a }) =>
    `<article id="${a.id}" title="${a.title}" route="${a.route}">\n${a.body.trim()}\n</article>`).join('\n\n');

  return { grounded: true, articles, context };
}

/** Browse support: reviewed articles' frontmatter for the Help page index. */
export function getManifest() {
  const bundle = loadBundle();
  const reviewed = new Set(bundle.corpus);
  return {
    version: bundle.version,
    articles: bundle.articles.filter((a) => reviewed.has(a.id)).map((a) => ({
      id: a.id, title: a.title, type: a.type, domain: a.domain,
      module: a.module, route: a.route, tags: a.tags || [], related: a.related || [],
      order: a.order ?? null,
      chapters: a.chapters || [],
    })),
  };
}

/** Browse support: one reviewed article's frontmatter + markdown body, or null. */
export function getArticle(id) {
  if (!/^[a-z0-9-]+$/.test(id || '')) return null;               // guard path
  const a = loadCorpus().find((x) => x.id === id);
  if (!a) return null;
  return { id: a.id, title: a.title, type: a.type, domain: a.domain,
    module: a.module, route: a.route, tags: a.tags, related: a.related,
    anchors: a.anchors, body: a.body };
}
