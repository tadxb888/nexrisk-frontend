// ============================================================
// help/types.ts
// Typed contract for the Taiga Help knowledge base.
//
// Every article is a markdown file with YAML frontmatter matching
// ArticleFrontmatter. Frontmatter is parsed at build time into HelpArticle
// and consumed by:
//   • the Help page          — browse + client-side search
//   • the retrieval layer     — ONLY status:'reviewed' articles enter the corpus
//   • the citation resolver   — id (+ anchor) -> /help/:id#:anchor deep-link
//
// Taxonomy is anchored to nexrisk-ui/src/.../navPermissions.ts (the single
// source of truth for menu structure and route->module mapping). `domain`
// mirrors NAV_SECTIONS.id; `module` mirrors SubItem.module; `route` mirrors
// SubItem.path. Permission LEVEL semantics come from the RBAC matrix.
// ============================================================

export type ArticleType =
  | 'glossary'        // one canonical term
  | 'concept'         // how/why a mechanism works
  | 'task'            // permission-gated "how do I..." walkthrough
  | 'reference'       // field/endpoint tables derived from API docs
  | 'troubleshooting'; // symptom -> cause -> resolution

/** Live permission levels, low -> high. Mirrors navPermissions / RBAC. */
export type PermissionLevel =
  | 'NONE' | 'VIEW' | 'EDIT' | 'FULL' | 'CRUD' | 'SU';

/** Top-level nav groups, from navPermissions.ts NAV_SECTIONS[].id.
 *  'assistant' is Help-internal (how to use Help itself); it has no nav entry. */
export type HelpDomain =
  | 'summary' | 'books' | 'execution' | 'intel'
  | 'reports' | 'settings' | 'assistant';

/** Review gate. Only 'reviewed' articles are citable by the assistant. */
export type ArticleStatus = 'draft' | 'reviewed';

export interface ArticleFrontmatter {
  /** Stable, namespaced, kebab. This IS the citation key. Never renamed. */
  id: string;
  title: string;
  type: ArticleType;
  /** Nav group id (navPermissions NAV_SECTIONS[].id). */
  domain: HelpDomain;
  /** Permission module key (navPermissions SubItem.module). '' = ungated. */
  module: string;
  /** Minimum level for the SUBJECT page to be visible (navPermissions: >= VIEW). */
  minLevel: PermissionLevel;
  /** Deep-link target for "take me there" (navPermissions SubItem.path). */
  route: string;
  /** Provenance — the ground-truth doc section or code file each claim derives from. */
  source: string[];
  /** Related article ids (cross-links, rendered by the Help page). */
  related: string[];
  tags: string[];
  /** draft -> NOT citable by assistant; reviewed -> citable. */
  status: ArticleStatus;
  /** App version string that stamped this revision (build-injected). */
  version: string;
}

export interface HelpArticle extends ArticleFrontmatter {
  /** Parsed markdown body (frontmatter stripped). */
  body: string;
  /** Section anchors present in body, for citation deep-links (#anchor). */
  anchors: string[];
}

/** Aggregated, retrieval-ready index. Built from all content/**\/*.md.
 *  `articles` = everything (browse). `corpus` = reviewed-only ids (retrieval). */
export interface HelpManifest {
  version: string;
  generatedAt: string;
  articles: ArticleFrontmatter[];
  /** ids of status:'reviewed' articles — the ONLY ids the assistant may cite. */
  corpus: string[];
}
