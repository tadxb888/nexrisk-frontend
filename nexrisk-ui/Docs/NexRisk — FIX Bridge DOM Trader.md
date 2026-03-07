# NexRisk — FIX Bridge DOM Trader
## Frontend Integration Brief v3.0
**March 2026 — TraderEvolution Sandbox Integration**

---

## Changelog v3.0
- WebSocket event type for fills corrected: `EXECUTION_REPORT` (not `TRADE_CAPTURE_REPORT`)
- WebSocket port confirmed: **8081**
- Explanation of why the type is `EXECUTION_REPORT` even though TE sends 35=AE internally
- All `TRADE_CAPTURE_REPORT` references removed from WebSocket section
- Brief converted to Markdown

---

## 1. Purpose & Scope

This document gives the frontend developer everything needed to build the DOM Trader panel in the NexRisk Risk Intelligence Center. It covers REST endpoints, WebSocket event contracts, request/response schemas, and the specific behaviour of the TraderEvolution (TE) Sandbox — the LP being integrated now.

All communication goes through `nexrisk_service`. There is no direct FIX connection from the browser.

---

## 2. Architecture & Verified Status

| | |
|---|---|
| **REST API base URL** | `http://localhost:8090/api/v1/fix` |
| **WebSocket URL** | `ws://localhost:8081` |
| **LP identifier** | `traderevolution` |
| **Symbol format** | No separator — `EURUSD` `GBPUSD` `XAUUSD` `US30` `DE40` |
| **Authentication** | None (internal network) |
| **Content-Type** | `application/json` for all POST bodies |
| **LP FIX version** | FIX 4.4 — TraderEvolution Sandbox |
| **MD update rate** | ~3–5 messages per 300 ms (confirmed live) |

**Verified end-to-end (March 2026 live tests):**
- ✅ Market order GBPUSD BUY 100k filled at 1.3349
- ✅ Position updated from qty=(3/0) to qty=(4/0) after fill
- ✅ MD streaming: `md_updates_received` incrementing continuously
- ✅ WebSocket fill event: `EXECUTION_REPORT` fires on TE fill
- ✅ WebSocket MD events: `MARKET_DATA_INCREMENTAL` streaming live
- ✅ WebSocket account: `ACCOUNT_STATUS` fires every ~2 s

---

## 3. TraderEvolution — Critical Behaviour ⚠

> Read this section before implementing any trading or state management logic.

### 3.1 Fill Confirmation — WebSocket delivers `EXECUTION_REPORT`

TraderEvolution internally uses TradeCaptureReport (FIX MsgType 35=AE) rather than the standard ExecutionReport (35=8) for market fills. **The frontend does not need to know or care about this.**

`nexrisk_service` normalises all LP fill events before forwarding to WebSocket. By the time the event reaches the browser, it always has:

```
type: "EXECUTION_REPORT"
```

This normalisation is intentional — it means the frontend works the same way regardless of which LP is connected (TE, LMAX, CMC). The raw TE payload fields (fill price, qty, symbol etc.) are preserved inside the event.

```js
ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);
  switch (event.type) {
    case 'EXECUTION_REPORT':
      // Fires for ALL LPs including TE
      // Do NOT add a separate TRADE_CAPTURE_REPORT case — it will never arrive
      handleFill(event);
      break;
    // ...
  }
};
```

> ⚠ Do NOT add a `case 'TRADE_CAPTURE_REPORT'` handler. That type is an internal FIX layer detail that never reaches the WebSocket. Your switch will never match it.

---

### 3.2 Position Quantities — Always Zero in TE Sandbox

The TE sandbox always returns `qty=0`, `long_qty=0`, `short_qty=0` and `side=FLAT` on all PositionReport messages, even for open positions. This is a confirmed sandbox quirk.

| Field | TE Sandbox | How to handle |
|---|---|---|
| `side` | Always `"FLAT"` | Do not use for open/close detection |
| `long_qty` | Always `0` | Do not use |
| `short_qty` | Always `0` | Do not use |
| `net_qty` | Always `0` | Do not use |
| `open_price` | ✅ Correct | **Use this** — non-zero = position is open |
| `position_id` | ✅ Correct | **Use this** — non-empty = position exists |

**Open position detection rule:**
```js
const isOpen = position.position_id !== '' && position.open_price > 0;
```

> ⚠ Do NOT gate the Close button or any open-position UI on `side`, `long_qty`, `net_qty`, or `short_qty`.

---

### 3.3 Position Close Method — `nos_group`

`capabilities.close_position_method = "nos_group"` for TE. You do NOT send a dedicated close message. You send a **counter-direction MARKET order** with `open_close: "C"` and the `position_id`.

```js
// Close a LONG GBPUSD position:
POST /api/v1/fix/order
{
  "lp_id":         "traderevolution",
  "symbol":        "GBPUSD",
  "side":          "SELL",       // counter-direction
  "qty":           100000,
  "order_type":    "MARKET",
  "time_in_force": "GTC",
  "open_close":    "C",          // tag 77 = Close
  "position_id":   "3197793"     // from GET /positions
}
```

> ⚠ Standard FIX LPs (LMAX, CMC) use different close methods. Check `capabilities.close_position_method` at runtime to stay LP-agnostic.

---

### 3.4 Order Book — Null `best_bid` / `best_ask`

The top-level `best_bid`, `best_ask`, and `spread` fields are `null` even when the `bids`/`asks` arrays are populated. Always derive them:

```js
function enrichBook(data) {
  if (!data) return null;
  const bids    = data.bids || [];
  const asks    = data.asks || [];
  const bestBid = data.best_bid ?? bids[0]?.price ?? null;
  const bestAsk = data.best_ask ?? asks[0]?.price ?? null;
  const spread  = data.spread  ?? (bestBid && bestAsk ? bestAsk - bestBid : null);
  return { ...data, best_bid: bestBid, best_ask: bestAsk, spread };
}
```

> ⚠ Call `enrichBook()` on every snapshot and incremental tick before rendering the DOM ladder.

---

## 4. REST Endpoint Reference

### 4.1 LP Status

| Method | Endpoint | Body / Params | Notes |
|---|---|---|---|
| `GET` | `/api/v1/fix/status/{lp_id}` | — | Full LP + both session states |

**Key response fields:**

| Field | Type | Description |
|---|---|---|
| `state` | string | `CONNECTED` \| `ERROR` \| `DISCONNECTED` |
| `trading_session.state` | string | `LOGGED_ON` \| `DISCONNECTED` \| `RECONNECTING` |
| `trading_session.active_orders` | int | Open orders tracked by bridge |
| `trading_session.positions_loaded` | int | Positions in cache |
| `trading_session.instruments_loaded` | int | Instruments loaded (6 for TE sandbox) |
| `md_session.state` | string | `LOGGED_ON` \| `DISCONNECTED` |
| `capabilities.close_position_method` | string | `nos_group` for TE — see Section 3.3 |

---

### 4.2 Market Data

| Method | Endpoint | Body / Params | Notes |
|---|---|---|---|
| `POST` | `/api/v1/fix/md/subscribe` | `lp_id, symbol` | Subscribe to live order book |
| `POST` | `/api/v1/fix/md/unsubscribe` | `lp_id, symbol` | Unsubscribe |
| `GET` | `/api/v1/fix/md/book/{lp_id}/{symbol}` | — | Current order book snapshot |
| `GET` | `/api/v1/fix/md/books/{lp_id}` | — | All subscribed books |
| `GET` | `/api/v1/fix/md/prices/{lp_id}` | — | Best bid/ask for all symbols |

> ℹ Wait 300–500 ms after subscribe before polling the book — first snapshot arrives within that window.

---

### 4.3 Order Management

| Method | Endpoint | Body / Params | Notes |
|---|---|---|---|
| `POST` | `/api/v1/fix/order` | Section 5.1 | Place market or limit order |
| `POST` | `/api/v1/fix/replace` | Section 5.2 | Modify price / qty / SL / TP |
| `POST` | `/api/v1/fix/cancel` | Section 5.3 | Cancel open order |
| `GET` | `/api/v1/fix/orders/{lp_id}` | — | All orders including filled |
| `GET` | `/api/v1/fix/orders/{lp_id}/active` | — | Active orders only |

---

### 4.4 Positions

| Method | Endpoint | Body / Params | Notes |
|---|---|---|---|
| `GET` | `/api/v1/fix/positions/{lp_id}` | — | All positions |
| `POST` | `/api/v1/fix/positions/{lp_id}/close` | `position_id, qty, lp_id` | Close via nos_group |

---

### 4.5 Diagnostics

| Method | Endpoint | Notes |
|---|---|---|
| `GET` | `/api/v1/fix/client/stats` | Event counters — verify WebSocket health |

> ℹ After a fill: `executions_received` increments. `md_updates_received` counts continuously (~5/s).

---

## 5. Request Schemas

### 5.1 Place Order — `POST /api/v1/fix/order`

| Field | Type | Required | Description |
|---|---|---|---|
| `lp_id` | string | required | `"traderevolution"` |
| `symbol` | string | required | `"GBPUSD"` — no separators for TE |
| `side` | string | required | `"BUY"` or `"SELL"` |
| `qty` | number | required | `100000` = 1 standard lot |
| `order_type` | string | required | `"MARKET"` or `"LIMIT"` |
| `price` | number | LIMIT only | Limit price — omit for MARKET |
| `stop_loss` | number | optional | SL absolute price (TE tag 18205) |
| `take_profit` | number | optional | TP absolute price (TE tag 18206) |
| `time_in_force` | string | optional | `"GTC"` (default) \| `"DAY"` \| `"IOC"` \| `"FOK"` |
| `open_close` | string | optional | `"O"` open new (default) \| `"C"` close existing |
| `position_id` | string | close only | Required when `open_close: "C"` |

> ⚠ `stop_loss` and `take_profit` are **absolute 5-decimal prices** (e.g. `1.33714`), NOT pip offsets.

---

### 5.2 Replace Order — `POST /api/v1/fix/replace`

| Field | Type | Required | Description |
|---|---|---|---|
| `lp_id` | string | required | Liquidity provider |
| `orig_clord_id` | string | required | `clord_id` from original place order response |
| `qty` | number | optional | New quantity |
| `price` | number | optional | New limit price |
| `stop_loss` | number | optional | New SL price |
| `take_profit` | number | optional | New TP price |

---

### 5.3 Cancel Order — `POST /api/v1/fix/cancel`

| Field | Type | Required | Description |
|---|---|---|---|
| `lp_id` | string | required | Liquidity provider |
| `orig_clord_id` | string | required | `clord_id` of the order to cancel |
| `symbol` | string | optional | Recommended to include |

---

## 6. Key Response Schemas

### 6.1 Place Order Response

| Field | Type | Description |
|---|---|---|
| `success` | bool | `true` = accepted and sent to LP. Does NOT confirm fill. |
| `clord_id` | string | Store this. Monitor WebSocket `EXECUTION_REPORT` for fill. |

---

### 6.2 Order Book — `GET .../md/book/{lp_id}/{symbol}`

| Field | Type | Description |
|---|---|---|
| `data.symbol` | string | Instrument |
| `data.best_bid` | number | **May be null** — always call `enrichBook()` first |
| `data.best_ask` | number | **May be null** — always call `enrichBook()` first |
| `data.spread` | number | **May be null** — calculate from arrays if null |
| `data.bids[]` | array | `{ price, size, position }` — sorted best first |
| `data.asks[]` | array | `{ price, size, position }` — sorted best first |
| `data.last_update_ts` | int64 | Unix ms of last tick |

---

### 6.3 Positions — `GET .../positions/{lp_id}`

| Field | Type | Description |
|---|---|---|
| `data.positions[].position_id` | string | Unique position ID — use for close |
| `data.positions[].symbol` | string | Instrument |
| `data.positions[].open_price` | number | Fill price — **non-zero = position is open** |
| `data.positions[].side` | string | TE sandbox: always `FLAT` — do not use |
| `data.positions[].long_qty` | number | TE sandbox: always `0` — do not use |
| `data.positions[].net_qty` | number | TE sandbox: always `0` — do not use |
| `data.positions[].received_ts` | int64 | Unix ms of fill |
| `data.count` | int | Total positions returned |
| `data.initial_load_complete` | bool | `true` once initial position batch is done |

> ⚠ Open position detection: `position_id !== '' && open_price > 0`. Do NOT use `side` / `long_qty` / `net_qty`.

---

## 7. WebSocket Event Contracts

**URL:** `ws://localhost:8081`

All events are JSON with a top-level `type` field.

### Full handler skeleton

```js
const ws = new WebSocket('ws://localhost:8081');

ws.onmessage = (msg) => {
  const event = JSON.parse(msg.data);

  switch (event.type) {

    // ── FILLS ──────────────────────────────────────────────────────
    case 'EXECUTION_REPORT':
      // This fires for ALL LPs including TE.
      // nexrisk_service normalises TE's internal 35=AE TradeCaptureReport
      // into EXECUTION_REPORT before it reaches the WebSocket.
      // Do NOT add a TRADE_CAPTURE_REPORT case — it will never arrive.
      handleFill(event);
      break;

    // ── MARKET DATA ────────────────────────────────────────────────
    case 'MARKET_DATA_SNAPSHOT':
    case 'MD_SNAPSHOT':
    case 'MARKET_DATA_INCREMENTAL':
    case 'MD_INCREMENTAL':
      handleMDTick(enrichBook(event.data));
      break;

    // ── POSITIONS ──────────────────────────────────────────────────
    case 'POSITION_REPORT':
      handlePositionUpdate(event);
      break;
    case 'POSITION_CLOSED':
      handlePositionClosed(event);
      break;

    // ── ACCOUNT ────────────────────────────────────────────────────
    case 'ACCOUNT_STATUS':
      handleAccount(event);   // balance, equity, margin — fires every ~2 s
      break;

    // ── SESSION ────────────────────────────────────────────────────
    case 'SESSION_LOGON':
    case 'SESSION_LOGOUT':
    case 'INITIAL_DATA_SET_COMPLETE':
      handleSessionChange(event);
      break;
  }
};
```

---

### 7.1 `EXECUTION_REPORT` (fill confirmation — all LPs)

> This is the fill event for **all LPs including TE**.
> `nexrisk_service` normalises TE's internal TradeCaptureReport (35=AE) to `EXECUTION_REPORT` before broadcasting. The raw fill data (price, qty, symbol) is preserved in the payload.

| Field | Type | Description |
|---|---|---|
| `type` | string | `"EXECUTION_REPORT"` — always, for all LPs |
| `lp_id` | string | `"traderevolution"` |
| `data.symbol` | string | Instrument |
| `data.last_qty` | number | Fill quantity |
| `data.last_px` | number | Fill price |
| `data.side` | string | `"BUY"` or `"SELL"` |
| `data.order_id` | string | LP order ID |
| `data.trade_date` | string | Trade date `YYYYMMDD` |
| `data.transact_time` | string | Fill timestamp from TE |
| `timestamp_ms` | int64 | Unix ms — bridge receive time |

---

### 7.2 `MARKET_DATA_INCREMENTAL` / `MARKET_DATA_SNAPSHOT`

| Field | Type | Description |
|---|---|---|
| `type` | string | `"MARKET_DATA_INCREMENTAL"` or `"MARKET_DATA_SNAPSHOT"` |
| `lp_id` | string | LP identifier |
| `data.symbol` | string | Instrument |
| `data.best_bid` | number | May be null — call `enrichBook()` before render |
| `data.best_ask` | number | May be null — call `enrichBook()` before render |
| `data.bids[]` | array | `{ price, size }` |
| `data.asks[]` | array | `{ price, size }` |
| `timestamp_ms` | int64 | Unix ms |

---

### 7.3 `POSITION_REPORT`

| Field | Type | Description |
|---|---|---|
| `type` | string | `"POSITION_REPORT"` |
| `position_id` | string | Unique — use for close and deduplication |
| `symbol` | string | Instrument |
| `open_price` | number | Fill price — non-zero = open |
| `side` | string | TE sandbox: always `FLAT` |
| `long_qty` | number | TE sandbox: always `0` |
| `net_qty` | number | TE sandbox: always `0` |
| `commission` | number | Commission charged |
| `swap` | number | Overnight swap |
| `timestamp_ms` | int64 | Unix ms |

---

### 7.4 `ACCOUNT_STATUS`

Fires every ~2 seconds from TE. Use it to drive the account panel live without REST polling.

| Field | Type | Description |
|---|---|---|
| `type` | string | `"ACCOUNT_STATUS"` |
| `data.balance` | number | Account balance |
| `data.equity` | number | Equity (balance + floating P&L) |
| `data.margin_used` | number | Margin in use |
| `data.margin_available` | number | Free margin |
| `data.unrealized_pnl` | number | Floating P&L |
| `data.currency` | string | `"USD"` |
| `data.timestamp_ms` | int64 | Unix ms |

---

## 8. Recommended Startup Sequence

| # | Action | Purpose / Notes |
|---|---|---|
| 1 | `GET /status/{lp_id}` | Verify `trading_session.state === "LOGGED_ON"` AND `md_session.state === "LOGGED_ON"`. Show connection warning if either is not. |
| 2 | `POST /md/subscribe { lp_id, symbol }` | Subscribe to selected symbol. Returns `md_req_id`. |
| 3 | Wait 400 ms | Allow first MD snapshot to arrive from TE. |
| 4 | `GET /md/book/{lp_id}/{symbol}` | Prime DOM ladder. Call `enrichBook()` on `response.data` before rendering. |
| 5 | `GET /positions/{lp_id}` | Load positions panel. Use `position_id + open_price > 0` for open detection. |
| 6 | `GET /orders/{lp_id}/active` | Load active orders blotter. |
| 7 | Connect WebSocket `ws://localhost:8081` | Start receiving `EXECUTION_REPORT` fills, MD ticks, `POSITION_REPORT`, `ACCOUNT_STATUS`. |
| 8 | Poll `GET /md/book` every 1 s | Supplement WebSocket MD — guarantees a full refresh even if an incremental tick is missed. |

---

## 9. JavaScript Integration Examples

### 9.1 `enrichBook` helper (required for TE)

```js
function enrichBook(data) {
  if (!data) return null;
  const bids    = data.bids || [];
  const asks    = data.asks || [];
  const bestBid = data.best_bid ?? bids[0]?.price ?? null;
  const bestAsk = data.best_ask ?? asks[0]?.price ?? null;
  const spread  = data.spread  ?? (bestBid && bestAsk ? bestAsk - bestBid : null);
  return { ...data, best_bid: bestBid, best_ask: bestAsk, spread };
}
```

### 9.2 Subscribe + poll DOM ladder

```js
const LP   = 'traderevolution';
const BASE = 'http://localhost:8090/api/v1/fix';

async function subscribeAndPoll(symbol) {
  await fetch(`${BASE}/md/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lp_id: LP, symbol })
  });
  await new Promise(r => setTimeout(r, 400));

  setInterval(async () => {
    const res  = await fetch(`${BASE}/md/book/${LP}/${symbol}`);
    const json = await res.json();
    renderDOMBook(enrichBook(json.data));
  }, 1000);
}
```

### 9.3 Place market order

```js
async function placeMarket(symbol, side, qty) {
  const res  = await fetch(`${BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lp_id: LP, symbol, side, qty,
      order_type: 'MARKET', time_in_force: 'GTC', open_close: 'O'
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  // Store clord_id — fill arrives via EXECUTION_REPORT on WebSocket
  return json.clord_id;
}
```

### 9.4 Close position (TE `nos_group` method)

```js
async function closePosition(position, openSide) {
  const closeSide = openSide === 'BUY' ? 'SELL' : 'BUY';
  const res = await fetch(`${BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lp_id:         LP,
      symbol:        position.symbol,
      side:          closeSide,
      qty:           100000,          // use actual lot size
      order_type:    'MARKET',
      time_in_force: 'GTC',
      open_close:    'C',             // tag 77 = Close
      position_id:   position.position_id
    })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  // Fill confirmed by EXECUTION_REPORT on WebSocket
  return json.clord_id;
}
```

### 9.5 Handle fill event

```js
function handleFill(event) {
  // event.type is always "EXECUTION_REPORT" for all LPs
  // nexrisk_service normalises TE's internal format before broadcast
  const fill = {
    symbol:  event.data?.symbol  ?? event.symbol,
    side:    event.data?.side    ?? event.side,
    qty:     event.data?.last_qty ?? event.last_qty,
    price:   event.data?.last_px  ?? event.last_px,
    time:    event.data?.transact_time ?? event.timestamp_ms,
    orderId: event.data?.order_id ?? event.cl_ord_id,
  };
  updateTradeBlotter(fill);
  refreshPositions();  // re-fetch GET /positions after fill
}
```

> ℹ `refreshPositions()` is needed after a fill because TE delivers the updated position via `POSITION_REPORT` on WebSocket — but also worth a REST refresh to ensure consistency.

---

## 10. Error Handling

| HTTP | Condition | UI Action |
|---|---|---|
| `200` | `{ success: true, clord_id }` | Store `clord_id`. Monitor WebSocket `EXECUTION_REPORT` for fill. |
| `200` | `{ success: false, error: ... }` | Some logic errors return HTTP 200. Always check `success` field first. |
| `400` | Validation error | Show error toast with `error` field text. |
| `503` | Bridge not connected | Show connectivity warning. Check `GET /status/{lp_id}`. |

> ⚠ HTTP 200 + `success: true` means the order was queued and sent to TE via FIX. It does **not** mean filled. Fill arrives via `EXECUTION_REPORT` on the WebSocket.

---

## 11. Verified Endpoint Status (March 2026)

| Endpoint | Status |
|---|---|
| `GET  /api/v1/fix/status/{lp_id}` | ✅ Tested |
| `POST /api/v1/fix/md/subscribe` | ✅ Tested |
| `POST /api/v1/fix/md/unsubscribe` | ✅ Tested |
| `GET  /api/v1/fix/md/book/{lp_id}/{symbol}` | ✅ Tested — 5-level depth, live ticks |
| `GET  /api/v1/fix/md/prices/{lp_id}` | ✅ Tested |
| `POST /api/v1/fix/order  (MARKET)` | ✅ Tested — fill confirmed |
| `POST /api/v1/fix/order  (LIMIT + SL/TP)` | ✅ Tested |
| `POST /api/v1/fix/order  (open_close=C)` | ✅ Tested — counter-order close |
| `POST /api/v1/fix/replace` | ✅ Tested |
| `POST /api/v1/fix/cancel` | ✅ Tested |
| `GET  /api/v1/fix/positions/{lp_id}` | ✅ Tested — `position_id` + `open_price` correct |
| `GET  /api/v1/fix/orders/{lp_id}/active` | ✅ Tested |
| `GET  /api/v1/fix/client/stats` | ✅ Tested — both counters active |
| `WS   ws://localhost:8081  (MD events)` | ✅ Live — `MARKET_DATA_INCREMENTAL` streaming |
| `WS   ws://localhost:8081  (fill events)` | ✅ Live — `EXECUTION_REPORT` fires on TE fill |
| `WS   ws://localhost:8081  (ACCOUNT_STATUS)` | ✅ Live — fires every ~2 s |
| `WS   ws://localhost:8081  (POSITION_REPORT)` | ✅ Live — fires after each fill |

---

*NexRisk — Internal Technical Documentation — March 2026 — v3.0*
