#!/usr/bin/env node
// help/buildManifest.mjs
// Scans content/**/*.md, parses YAML frontmatter, and emits:
//   • manifest.json     — lightweight (frontmatter only), for the coverage tool
//   • help-bundle.json  — committed runtime bundle (frontmatter + bodies + anchors)
//                         the BFF reads at runtime. One file, ships with the code.
// Fails loudly on missing required fields or duplicate ids.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const CONTENT_DIR = new URL('./content/', import.meta.url).pathname;
const VERSION = process.env.APP_VERSION || 'draft';

const REQUIRED = ['id', 'title', 'type', 'domain', 'module', 'minLevel',
  'route', 'source', 'related', 'tags', 'status', 'version'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (extname(p) === '.md') out.push(p);
  }
  return out;
}

const stripQuotes = (s) => s.replace(/^["']|["']$/g, '');

function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`No frontmatter block in ${file}`);
  const [, fm, body] = m;
  const obj = {};
  const lines = fm.split('\n');
  let key = null;
  for (const line of lines) {
    if (/^\s+- /.test(line) && key) {
      obj[key].push(stripQuotes(line.replace(/^\s+-\s+/, '').trim())); continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === '') { obj[key] = []; }
    else if (val.startsWith('[')) {
      obj[key] = val.replace(/^\[|\]$/g, '').split(',').map((s) => stripQuotes(s.trim())).filter(Boolean);
    } else { obj[key] = stripQuotes(val); }
  }
  return { fm: obj, body };
}

function anchorsOf(body) {
  const out = [];
  const re = /\{#([a-z0-9-]+)\}/g;
  let m;
  while ((m = re.exec(body))) out.push(m[1]);
  return out;
}

const files = walk(CONTENT_DIR).sort();
const articles = [];
const seen = new Set();
const problems = [];

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  let parsed;
  try { parsed = parseFrontmatter(raw, file); }
  catch (e) { problems.push(e.message); continue; }
  const { fm, body } = parsed;

  const missing = REQUIRED.filter((k) => fm[k] === undefined);
  if (missing.length) problems.push(`${fm.id || file}: missing ${missing.join(', ')}`);
  if (fm.id && seen.has(fm.id)) problems.push(`duplicate id: ${fm.id}`);
  if (fm.id) seen.add(fm.id);

  articles.push({ ...fm, anchors: anchorsOf(body), body });
}

if (problems.length) {
  console.error('MANIFEST BUILD FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

const corpus = articles.filter((a) => a.status === 'reviewed').map((a) => a.id);

// Lightweight manifest (no bodies) — used by the coverage tool.
const manifest = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  articles: articles.map(({ anchors, body, ...fm }) => fm),
  corpus,
};
writeFileSync(join(CONTENT_DIR, '..', 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Committed runtime bundle — manifest + bodies + anchors in ONE file the BFF
// reads relative to its own location. No content/ scan, no cwd dependency.
const bundle = { version: VERSION, generatedAt: new Date().toISOString(), corpus, articles };
writeFileSync(join(CONTENT_DIR, '..', 'help-bundle.json'), JSON.stringify(bundle) + '\n');

console.log(`Scanned ${files.length} article(s).`);
console.log(`Browse set: ${articles.length}   Citable corpus (reviewed): ${corpus.length}`);
console.log('Wrote manifest.json and help-bundle.json.');
