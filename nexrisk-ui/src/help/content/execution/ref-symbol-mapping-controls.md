---
id: ref-symbol-mapping-controls
title: "Symbol Mapping — controls and actions"
type: reference
domain: execution
module: symbol_map
minLevel: VIEW
route: /symbol-mapping
source:
  - "NexRisk Symbol Mapping API Documentation (MT5 to LP)"
  - "SymbolMapping.tsx"
related: [ref-symbol-mapping-fields, ref-price-rules-states]
tags: [symbol-mapping, mapping, bulk, csv, auto-map, multiplier]
status: reviewed
version: exec-v1
---

## What the page does {#what}

Symbol Mapping links each LP symbol name to its MT5 symbol name so prices and
hedge orders route correctly. **Configured Mappings** lists the current links;
counters show total **Mappings**, **Nodes**, and **LPs**.

## Adding and editing mappings {#mappings}

**Add Mapping** creates a single LP-to-MT5 link, choosing the **LP Server** and
symbols. **Size ×** and **Price ×** are the volume and price multipliers applied
when the LP and MT5 contracts differ in size or quote scale. **Remove Mapping**
deletes a link. **Retry** re-attempts a failed mapping.

## Bulk import {#bulk}

**Bulk CSV Upload** imports many mappings at once from a CSV; **Auto-Map Review**
proposes LP-to-MT5 matches for you to adjust before committing. The **Bulk Import
Log** / **Import Log** records past bulk imports.
