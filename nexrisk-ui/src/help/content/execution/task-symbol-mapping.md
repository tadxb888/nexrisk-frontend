---
id: task-symbol-mapping
title: "Symbol Mapping — operating guide"
type: task
domain: execution
module: symbol_map
minLevel: VIEW
route: /symbol-mapping
source:
  - "Symbol_Mapping_Guide.docx — operating guide (ingested verbatim)"
related: []
tags: [symbol-mapping, normalizer, lp-symbol, mt5-symbol, volume-multiplier, price-multiplier, symbol-misses, nexday]
status: reviewed
version: exec-v3
---

## 1. About This Reference

Symbol Mapping is the small page that everything else leans on. It is
where each MT5 symbol is tied to the matching instrument at a liquidity
provider, together with two conversion factors — the price and volume
normalizers — that make the two systems agree on price and size. Without
a mapping, a hedge for that symbol cannot be sent at all, and the price
feed for it is dropped. This reference explains the page in full, shows
exactly how the two normalizers work with worked examples, and sets out
why the page is mandatory for hedging.

It is written for whoever configures routing — dealers and
administrators. It explains the mechanics rather than summarising them,
because a wrong normalizer produces a hedge of the wrong size or price,
which is expensive.

## 2. Why This Page Is Mandatory

MT5 and a liquidity provider rarely use the same symbol name, the same
size unit, or the same price scale. The mapping is the translation layer
between them, and it is used in two directions:

- **Outbound (MT5 → LP), when hedging.** When a hedging strategy fires,
  the platform must turn an MT5 order into an LP order: translate the
  symbol name, convert the size, and convert the reference price. That
  conversion is this mapping.

- **Inbound (LP → MT5), when pricing and recording.** Incoming LP
  prices, and the fills that come back, must be translated back into MT5
  terms so quotes reach the right symbol and fills are recorded in MT5
  lots and price.

|                                                                                                                                                                                                                                                                      |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **No mapping = no hedge.** When a hedge is raised for a symbol that has no active mapping on the relevant node, the platform cannot build the LP order and the hedge dispatch is blocked outright — it does not guess. The symbol must have an active mapping first. |

The same gap breaks pricing: an incoming LP tick for an unmapped symbol
is **dropped**, and the "Symbol Misses" counter on the price pipeline
climbs. So an unmapped symbol is invisible in both directions — no price
in, no hedge out.

**This is why Hedging Strategies depends on this page.** A hedging rule
can be written for any symbol, but it can only ever **execute** for
symbols that are mapped. Mapping is the prerequisite that turns a rule
into a routable hedge. The page even flags this for you: any symbol that
traders hold a position in but which has no mapping is called out in an
amber warning (Section 7).

## 3. The Two Normalizers

A mapping is more than a name pair. Each mapping carries, per MT5 node:
the LP symbol name, a volume normalizer, a price normalizer, the size
units on each side (lots or units), and reference figures like minimum
size and standard lot. The two normalizers are the heart of it.

### 3.1 What each normalizer means

On the page, the two sit in the centre of the grid between the MT5
symbol and the LP symbol, labelled **Size ×** and **Price ×** (and, in
the bulk CSV, "Size Normalizer" and "Price Normalizer"):

- **Volume normalizer (Size ×)** — converts an MT5 order size into the
  size the LP expects. It exists because the two sides may measure size
  differently: MT5 in lots, the LP in base-currency units, or with
  different contract sizes.

- **Price normalizer (Price ×)** — converts an MT5 price into the LP’s
  price scale. It exists because the two sides may quote the same
  instrument on a different scale or in a different unit.

A normalizer of **1** means "no conversion — the two sides already
agree". For most straightforward FX pairs, both are 1. Both must always
be **positive**; a zero or negative value is rejected as corrupt,
because it would produce a wrong-sized or wrong-signed hedge.

### 3.2 The exact arithmetic

The direction of the multiply is what matters. Outbound (sending a hedge
to the LP) multiplies; inbound (interpreting an LP fill back into MT5
terms) divides.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Outbound — MT5 → LP (when hedging):</strong></p>
<p>LP size = MT5 size × Volume normalizer (Size ×)</p>
<p>LP price = MT5 price × Price normalizer (Price ×)</p>
<p><strong>Inbound — LP → MT5 (interpreting an LP fill):</strong></p>
<p>MT5 size = LP size ÷ Volume normalizer</p>
<p>MT5 price = LP price ÷ Price normalizer</p></td>
</tr>
</tbody>
</table>

So the value you enter is always "how many LP units per one MT5 unit"
for size, and "the LP price for a price of one in MT5 terms" for price.
Read that way, the examples are simple.

### 3.3 Worked examples

**Example A — a standard FX pair, no conversion**

EURUSD: both MT5 and the LP trade it in lots, and quote it on the same
scale. **Size × = 1**, **Price × = 1**. A 1-lot hedge in MT5 is sent as
1 lot to the LP at the same price; a 1-lot LP fill comes back as 1 lot.
This is the common case.

**Example B — size unit mismatch (lots vs units)**

Suppose MT5 trades EURUSD in **lots** (one lot = 100,000 units of the
base currency), but the LP expects the order size in **units**. Then one
MT5 lot equals 100,000 LP units, so **Size × = 100,000**. A 0.5-lot
hedge becomes 0.5 × 100,000 = 50,000 units to the LP. When the LP
reports a fill of 50,000 units, the platform divides by 100,000 to
record 0.5 lots in MT5. Price × stays 1 if the quote scale matches.

**Example C — price scale mismatch**

Suppose an instrument is quoted in MT5 at a price around 2,000 but the
LP quotes the same instrument one decimal place smaller — around 200 —
i.e. at one tenth of the MT5 scale. Then **Price × = 0.1**: the
reference price sent with a hedge is scaled to the LP’s convention
(2,000 × 0.1 = 200), and an LP fill at 200 is divided back to 2,000 for
MT5 records. Size × is set separately according to the size units.

**Example D — both at once**

A metal or index where the LP uses both a different size unit and a
different price scale simply combines the two: set Size × for the size
relationship and Price × for the price relationship. Each is
independent, and each is checked the same way — send one unit, see that
the LP side lands where you expect, and confirm the reverse divides back
cleanly.

|                                                                                                                                                                                                                                                                                        |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Get these right, and verify them.** A wrong Size × hedges the wrong quantity; a wrong Price × books the wrong reference price and distorts revenue. Use the Snap Quote (Section 10) to derive and cross-check both against live quotes before trusting a new mapping with real flow. |

## 4. How Hedging Uses the Mapping

Following a hedge through the mapping shows why the page sits on the
critical path:

1.  A hedging strategy fires and produces an MT5-side hedge (a symbol, a
    size, a fill price).

2.  The platform looks up the mapping for that MT5 node, LP and symbol.
    **If there is no active mapping, dispatch stops here**

3.  It translates the symbol to the LP’s name, multiplies the size by
    the volume normalizer, and multiplies the reference price by the
    price normalizer.

4.  The resulting LP order is sent to the provider.

5.  When the LP reports a fill, the size and price are divided back by
    the same normalizers so the fill is recorded in MT5 terms — which is
    also how volumes appear correctly in lots elsewhere in the platform,
    and how spread revenue is computed.

The reverse direction is used continuously by the price feed too: each
incoming LP tick is matched to its MT5 symbol through this same mapping
before it can be repriced and delivered.

## 5. The Page — Header and Layout

The header names the page and its purpose — "MT5 symbols → LP
instruments — STP routing prerequisite" — and shows live counts:
**Mappings** configured, **Nodes** and **LPs** available (green when
present), and an amber **unmapped** count when symbols need attention.
Two controls sit here: **Import Log** (a history of bulk imports) and
**Bulk CSV** (Section 11).

Below the header are, in order: the unmapped warning banner (when
relevant), the Add Mapping bar, a filter toolbar, and the mappings grid.

## 6. Node Scoping — One Catalog per MT5 Server

Mappings are **scoped to each MT5 node**. Every mapping belongs to a
specific MT5 server, because different servers can carry different
symbol sets and contract specifications. The node selector at the top of
the Add Mapping bar chooses which server’s catalog you are viewing and
editing ("All Servers" shows everything).

|                                                                                                                                                                                                                                                                         |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Do not treat per-node duplicates as duplicates.** The same MT5 symbol legitimately appears once per node — one row for each server that trades it. These are not accidental duplicates and must not be de-duplicated or deleted; each node needs its own mapping row. |

## 7. The Unmapped Warning and Auto-Map

When symbols that traders hold positions in have no mapping, an amber
banner lists them: "N symbols with open positions have no LP mapping".
This is the direct signal that hedging for those symbols is currently
impossible. A **Review & Map** button opens the Auto-Map review.

**Auto-Map** proposes an LP instrument for each unmapped symbol by
matching names — exact matches first, then normalised and common
variants — and labels each proposal by confidence:

| **Confidence** | **Meaning**                                                                 |
|----------------|-----------------------------------------------------------------------------|
| Exact          | The LP has an instrument whose name matches exactly — safe to accept.       |
| Derived        | A confident match after normalising punctuation or format — check it.       |
| Fallback       | No match found; the MT5 name was used as a placeholder — must be corrected. |

You review the proposed pairs, adjust any that are wrong, and commit
them as a batch. Auto-Map fills in the names; you still set or verify
the normalizers (Sections 3 and 10).

## 8. Adding a Mapping Manually

The Add Mapping bar builds one mapping left to right, mirroring the
translation itself:

| **Control** | **What you choose**                                                                 |
|-------------|-------------------------------------------------------------------------------------|
| Node        | The MT5 server this mapping belongs to.                                             |
| MT5 Symbol  | The MT5 symbol to map (its live symbol list is offered).                            |
| LP          | The liquidity provider; a small indicator shows whether it is connected.            |
| LP Symbol   | The provider’s instrument to map it to (the provider’s instrument list is offered). |
| Size ×      | The volume normalizer (Section 3).                                                  |
| Price ×     | The price normalizer (Section 3).                                                   |

The button reads Add, or Update if that symbol is already mapped for the
pair. The MT5 symbol must be the exact symbol name, not a folder path.

|                                                                                                                                                                                                          |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Use the exact MT5 symbol name.** Enter the plain symbol name as MT5 reports it (for example "XAUUSD"), not a tree path such as "Forex\XAUUSD". A path will not match and the mapping will not resolve. |

## 9. The Mappings Grid

The grid is a wide table in three bands, with the mapping itself pinned
in the centre so it stays visible as you scroll the reference data on
either side:

| **Band**                   | **Columns**                                    | **Purpose**                                                                               |
|----------------------------|------------------------------------------------|-------------------------------------------------------------------------------------------|
| MT5 Server (left)          | Snap Quote, Server, Std Lot, Units, Lots       | The MT5 side’s live quote and contract facts — the reference for setting the normalizers. |
| ↔ Mapping (centre, pinned) | MT5 Symbol, Size ×, Price ×, LP Symbol         | The mapping you are editing — the name pair and the two normalizers.                      |
| LP Server (right)          | Snap Quote, LP, Std Lot, Lots, Units, Min Size | The LP side’s live quote and contract facts — the other half of the reference.            |
| Actions                    | Quote, Edit, Delete                            | Per-row actions (Section 10 and 12).                                                      |

Reading a row left to right is the translation itself: the MT5 symbol,
times Size × and Price ×, becomes the LP symbol. A filter box narrows
the list, and a count shows how many of the total are shown.

## 10. Snap Quote — Deriving the Normalizers Automatically

You do not have to work the normalizers out by hand. The **Quote**
action on a row fetches a live snapshot of both sides — the MT5 quote
and contract size, and the LP quote and contract facts — and **derives a
recommended set of values**: the volume and price normalizers, the size
units on each side (lots or units), the standard lot, the minimum size,
and the price precision. It reports a **confidence** of high, partial or
none, and lists any warnings.

Use it two ways: to fill in a new mapping’s normalizers from live data
rather than guessing, and to cross-check an existing mapping — if the
derived values disagree with what is stored, investigate before trusting
the mapping. If the LP book is still warming, the snapshot returns
"cold" and retries shortly.

|                                                                                                                                                                                                                                                                         |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Confidence is a prompt, not a guarantee.** A "high" confidence derivation is a strong starting point, but confirm the size and price relationships make sense for the instrument — especially for metals, indices and anything not a vanilla FX pair — before saving. |

## 11. Bulk CSV

For onboarding many symbols at once, **Bulk CSV** downloads a
spreadsheet pre-filled with the node’s MT5 symbols and columns for the
mapping fields — MT5 symbol, the units flags for each side, the Price
Normalizer and Size Normalizer, the LP symbol, and minimum size. You
fill in the LP names and normalizers, upload it, and the platform
applies the rows, reporting how many were inserted, updated, skipped,
and any conflicts or errors. The **Import Log** keeps a history of these
bulk imports.

The CSV columns use the same two normalizer names as the grid: "Price
Normalizer" is Price ×, and "Size Normalizer" is Size ×. The arithmetic
in Section 3 applies identically to bulk-loaded rows.

## 12. Editing and Deleting

Edit on a row opens the mapping’s fields in place — the LP symbol, the
two normalizers, the size units, minimum size and standard lot — for
adjustment. Delete removes a mapping after a confirmation; because a
mapping is what makes a symbol hedgeable, deleting one takes that symbol
off-route until it is mapped again.

## 13. How This Page Connects to Others

- **Hedging Strategies** — rules can only execute for mapped symbols;
  this page is the prerequisite that makes a rule routable.

- **Liquidity Providers** — the LP and its instrument list come from
  there; a provider must be configured and (ideally) connected to offer
  instruments to map to.

- **Price Rules / the price feed** — incoming LP ticks are matched to
  MT5 symbols through this mapping before repricing; an unmapped symbol
  drops ticks and raises "Symbol Misses".

- **Execution Report, Coverage and Net Exposure** — volumes are shown
  correctly in MT5 lots because the reverse normalizers convert LP fill
  sizes back; a wrong normalizer distorts these figures.

## 14. Pitfalls and Notes

- **Unmapped means blocked.** No mapping = no hedge out and no price in
  for that symbol.

- **Exact symbol name only.** Use the plain MT5 name, not a folder path.

- **Per-node rows are correct.** One row per server for the same symbol
  — never de-duplicate.

- **Normalizers must be positive; 1 = identity.** Zero or negative is
  rejected; 1 means no conversion.

- **Verify with Snap Quote.** Derive and cross-check both normalizers
  against live quotes before going live.

- **Size × and Price × are independent.** Set each for its own
  relationship; getting one right does not fix the other.

## 15. Quick Reference

### 15.1 Normalizer formula card

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr class="odd">
<td><p><strong>Volume normalizer</strong> (grid: "Size ×" · CSV: "Size
Normalizer")</p>
<p>LP size = MT5 size × vol MT5 size = LP size ÷ vol</p>
<p><strong>Price normalizer</strong> (grid: "Price ×" · CSV: "Price
Normalizer")</p>
<p>LP price = MT5 price × px MT5 price = LP price ÷ px</p>
<p><em>1 = no conversion · must be positive · outbound ×, inbound
÷</em></p></td>
</tr>
</tbody>
</table>

### 15.2 Mapping fields

| **Field**                  | **Meaning**                                               |
|----------------------------|-----------------------------------------------------------|
| MT5 Symbol                 | The MT5 instrument (exact name).                          |
| LP Symbol                  | The matching instrument at the provider.                  |
| Size × (volume normalizer) | LP size per one MT5 unit of size.                         |
| Price × (price normalizer) | LP price per a price of one in MT5 terms.                 |
| Units / Lots (each side)   | Whether that side measures size in lots or units.         |
| Min Size                   | The minimum order size the LP accepts.                    |
| Std Lot                    | The standard lot / contract reference for the instrument. |
| Node                       | The MT5 server this mapping belongs to.                   |

*End of reference.*
