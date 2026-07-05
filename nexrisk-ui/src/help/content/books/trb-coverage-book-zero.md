---
id: trb-coverage-book-zero
title: "Portfolio cBook shows 0.0 everywhere"
type: troubleshooting
domain: books
module: coverage
minLevel: VIEW
route: /coverage-book
source:
  - "Portfolio API Frontend Integration Brief §7 (Known Limitations — Phase 1)"
related: [gls-c-book, gls-coverage-book, ref-portfolio-book-fields, con-book-model]
tags: [coverage, c-book, cbook, zero, phase-1, known-limitation, dom-trader]
status: reviewed
version: books-v1
---

## Symptom {#symptom}

The Portfolio `cBook` column (the manual C-Book portion) reads `0.0` across
every metric row.

## Cause {#cause}

This is a documented Phase-1 limitation, not a bug. The `cBook` column is
populated from `hedge_records` rows carrying `execution_source = 'manual_dom'`.
Until the FIX Bridge endpoint is wired to write manual DOM executions into
`hedge_records`, there are no C-Book rows to aggregate, so every `cBook` value
is `0.0`.

## Resolution {#resolution}

No frontend action resolves this — it clears once the manual-execution write
path ships (a scheduled backend milestone). Until then `0.0` is the correct,
expected value; do not treat it as a data error or back-fill it client-side.
