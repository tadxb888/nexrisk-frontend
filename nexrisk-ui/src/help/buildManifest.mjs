#!/usr/bin/env node
// ============================================================
// help/buildManifest.mjs
// Scans content/**/*.md, parses YAML frontmatter, and emits manifest.json.
//
// Two products in one manifest:
//   • articles — every article's frontmatter, for the browse UI + search.
//   • corpus   — ids of status:'reviewed' articles ONLY. This is the retrieval
//                allow-list: the assistant may cite nothing outside it.
//
// Minimal inline frontmatter parser (no dependency) so it runs anywhere.
// Also validates required keys and unique ids, and fails loudly on malformed
// frontmatter — a bad article must not silently enter the corpus.
// ============================================================

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

// Tiny YAML-frontmatter reader: handles scalars and simple [..] / block lists.
function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`No frontmatter block in ${file}`);
  const [, fm, body] = m;
  const obj = {};
  const lines = fm.split('\n');
  let key = null;
  for (const line of lines) {
    if (/^\s+- /.test(line) && key) {                 // block-list item
      obj[key].push(stripQuotes(line.replace(/^\s+-\s+/, '').trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    key = kv[1];
    const val = kv[2].trim();
    if (val === '') { obj[key] = []; }                // block list follows
    else if (val.startsWith('[')) {                   // inline list
      obj[key] = val.replace(/^\[|\]$/g, '').split(',')
        .map((s) => stripQuotes(s.trim())).filter(Boolean);
    } else { obj[key] = stripQuotes(val); }
  }
  return { fm: obj, body };
}

const stripQuotes = (s) => s.replace(/^["']|["']$/g, '');

// Anchors from "## Heading {#anchor}" for citation deep-links.
function slugify(t){return t.toLowerCase().replace(/\{#[a-z0-9-]+\}/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');}
function chaptersOf(body){
  const out=[];
  for(const line of body.split('\n')){
    const m=/^##\s+(.*)$/.exec(line);
    if(m){const t=m[1].replace(/\s*\{#[a-z0-9-]+\}\s*$/,'');out.push({title:t,id:'help-'+slugify(t)});}
  }
  return out;
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

  articles.push({ ...fm, anchors: anchorsOf(body), chapters: chaptersOf(body), body });
}

if (problems.length) {
  console.error('MANIFEST BUILD FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

const corpus = articles.filter((a) => a.status === 'reviewed').map((a) => a.id);

const manifest = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  articles: articles.map(({ anchors, body, ...fm }) => fm),
  corpus,
};

writeFileSync(join(CONTENT_DIR, '..', 'manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n');

// Committed runtime bundle: manifest + article bodies + anchors in ONE file the
// BFF reads relative to its own location. This is what ships and is read at
// runtime — no content/ scan, no cwd dependency, nothing gitignored.
const bundle = {
  version: VERSION,
  generatedAt: new Date().toISOString(),
  corpus,
  articles,   // full: frontmatter + anchors + body
};
writeFileSync(join(CONTENT_DIR, '..', 'help-bundle.json'),
  JSON.stringify(bundle) + '\n');

console.log(`Scanned ${files.length} article(s).`);
console.log(`Browse set: ${articles.length}   Citable corpus (reviewed): ${corpus.length}`);
const draft = articles.length - corpus.length;
if (draft) console.log(`${draft} draft article(s) held out of the corpus by the review gate.`);
