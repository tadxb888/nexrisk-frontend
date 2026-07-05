---
id: ref-symbol-mapping-fields
title: "Symbol Mapping — units"
type: reference
domain: execution
module: symbol_map
minLevel: VIEW
route: /symbol-mapping
source:
  - "Price Feed & Spread Management Architecture Reference (symbol mapping layer)"
  - "SymbolMapping.tsx"
related: [ref-price-rules-states]
tags: [symbol-mapping, lots, units, mt5, lp]
status: reviewed
version: exec-v1
---

## Volume units {#units}

Volume is displayed either in **LOTS** (broker lot units) or **UNITS** (the
underlying contract quantity). This is a display toggle; the mapping itself is
between the LP symbol name and the MT5 symbol name, applied before repricing and
order dispatch.
