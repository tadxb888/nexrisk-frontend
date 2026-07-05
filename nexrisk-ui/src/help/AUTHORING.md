# Authoring Help articles

How to add or change an article in the Taiga Help corpus. This lives at
`src/help/AUTHORING.md` — it is a developer doc, not an article, so the manifest
builder (which scans only `content/`) never picks it up.

## The one rule everything else serves

The assistant may only cite articles that are (a) in the corpus and (b) marked
`reviewed`. So every article is **grounded** — each factual claim traces to a
named source — and nothing becomes citable until a human has verified it against
the current code or docs. Draft freely; promote deliberately. If you can't
source a claim, you flag it and leave the article `draft` — you do not guess.
This is what keeps the assistant a help feature and not a liability on a
platform handling real broker money.

## Quickstart

1. Pick the domain folder and article type → this gives you the filename and `id`.
2. Copy the frontmatter template below into a new `.md` file under
   `content/<domain>/`.
3. Write the body in short sections, each with a `{#anchor}` for citations.
4. Fill `source` with the exact doc section or code file behind each claim.
5. Leave `status: draft`.
6. Run `npm run help:manifest` and fix any validation errors it reports.
7. Verify every claim against its named source. Correct anything that doesn't hold.
8. Flip `status: reviewed`, rebuild — the article is now in the citable corpus.

## Where files go, and how to name them

Articles live under `content/<domain>/`, where `<domain>` is a nav group id from
`navPermissions.ts` (`summary`, `books`, `execution`, `intel`, `reports`,
`settings`). The `id` is namespaced by a type prefix, kebab-case, and **stable
forever** — citations point at it, so it is never renamed once the article has
shipped.

| Type            | `id` prefix | Filename example                    |
| --------------- | ----------- | ----------------------------------- |
| glossary        | `gls-`      | `content/books/gls-c-book.md`       |
| concept         | `con-`      | `content/books/con-book-model.md`   |
| task            | `task-`     | `content/books/task-interpret-net-exposure.md` |
| reference       | `ref-`      | `content/books/ref-portfolio-book-fields.md` |
| troubleshooting | `trb-`      | `content/books/trb-coverage-book-zero.md` |

## Frontmatter template

```yaml
---
id: exe-add-lp-session          # type prefix + kebab slug. Stable forever.
title: "Add a liquidity provider session"
type: task                      # glossary | concept | task | reference | troubleshooting
domain: execution               # nav group id (navPermissions NAV_SECTIONS[].id)
module: lp_admin                # permission module key (navPermissions SubItem.module)
minLevel: VIEW                  # min level for the subject page to be visible
route: /liquidity-providers     # deep-link target (navPermissions SubItem.path)
source:                         # one line per claim's ground-truth origin
  - "NexRisk FIX Bridge LP Administration §3 (session config)"
  - "LiquidityProviders.tsx (form fields + validation)"
related: [gls-lp, con-fix-session]   # ids of cross-linked articles
tags: [lp, fix, session, onboarding]
status: draft                   # draft = browsable, NOT citable; reviewed = citable
version: books-v1               # app version / release tag the article was verified against
---
```

## Field reference

| Field      | Allowed values / source of truth |
| ---------- | -------------------------------- |
| `id`       | Type prefix + kebab. Unique, permanent. The citation key. |
| `type`     | `glossary` · `concept` · `task` · `reference` · `troubleshooting` (`types.ts` `ArticleType`). |
| `domain`   | `summary` · `books` · `execution` · `intel` · `reports` · `settings` · `assistant` (`types.ts` `HelpDomain`). |
| `module`   | A key from `navPermissions.ts` `SubItem.module` (the 20 module keys). `''` for ungated. **navPermissions.ts is authoritative** — don't invent keys. |
| `minLevel` | `NONE` · `VIEW` · `EDIT` · `FULL` · `CRUD` · `SU`. Usually `VIEW`. |
| `route`    | The `SubItem.path` for that module (e.g. `/coverage-book`). The "take me there" target. |
| `source`   | Free-text provenance, one entry per claim origin: `"<Doc> §<n>"` or `"<File>.tsx (what it shows)"`. |
| `related`  | Array of other article `id`s. Rendered as cross-links by the Help page. |
| `tags`     | Lowercase keywords; feed keyword retrieval. |
| `status`   | `draft` or `reviewed`. Only you flip it, and only after verifying. |
| `version`  | The app version / release tag the article was last verified against. |

## Body conventions

Write for a broker operator, not a developer — explain what a figure *means* and
what to do, not how the code computes it. Keep sections short.

- **Anchors are citation targets.** Each `## Heading {#anchor}` becomes a
  deep-link the assistant can cite (`/help/<id>#<anchor>`). Give every section a
  stable, kebab anchor. Don't rename an anchor that may already be cited.
- **Cross-link via `related`**, not by hand-writing URLs — the Help page renders
  those links and keeps them valid.
- **Cite in `source`, claim in the body.** If a sentence states a field name,
  endpoint, threshold, or behaviour, there must be a `source` entry that backs
  it. If there isn't, either find the source or cut the sentence.

## The review gate

`buildManifest.mjs` produces two lists: `articles` (everything, for browsing and
search) and `corpus` (the `id`s of `reviewed` articles only — the assistant's
allow-list). A `draft` article is fully visible to a human clicking the Help
page; it is simply invisible to the assistant. Nothing self-promotes: an
article — however it was drafted, including anything auto-generated — enters the
corpus only when a person sets `status: reviewed`.

## Hard rules

- **Never invent** a field name, endpoint, or numeric threshold. If it's not in
  a source, it doesn't go in an article.
- **No advice.** Explain how the tool works. Never advise on trading, hedging,
  execution, or risk decisions — that boundary is the point of the whole system.
- **Verify against current code before promoting.** Docs drift; the Books slice
  found "Coverage Book" meaning two different scopes. Check the live file.
- **Flag, don't guess.** Uncertain claim → mark it in the body and keep the
  article `draft`. A held-back article is safe; a wrong reviewed one is not.
- **`id`s and anchors are permanent** once shipped. Enrich by adding and
  editing, never renaming — or you break existing citations.

## Updating or retiring an article

- **Update:** edit the body, refresh `source`, re-verify against current code,
  keep the `id`. Every existing citation keeps resolving.
- **Correct at scale:** when a fact changes (a renamed field, a new behaviour),
  grep `source` and `related` for the affected `id`s and fix all touch points in
  one pass.
- **Retire:** if an article is wrong and can't be fixed, set `status: draft` to
  pull it from the corpus immediately, then repair or replace it. Don't delete a
  cited `id` out from under the assistant.

## Build and validation

```bash
npm run help:manifest      # scans content/, writes src/help/manifest.json
```

The build **fails loudly** — a malformed article never slips into the corpus
silently. It rejects:

- a missing frontmatter block,
- any missing required field,
- a duplicate `id`.

It reports the browse count and the reviewed corpus count, and names any drafts
held out of the corpus. Green build + your article in the `corpus` list = live.
