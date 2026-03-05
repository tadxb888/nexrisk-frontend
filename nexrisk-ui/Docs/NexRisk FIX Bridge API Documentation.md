# NexRisk FIX Bridge — API Documentation v2.0

**Document Status**: Living document — endpoints marked 🟢 are implemented and tested, endpoints marked 🟡 are planned for next release.

**Last Updated**: February 21, 2026

**Changelog v2.0** (from v1.0):
- Added Section 11: FIX Message Audit Trail (new — raw FIX message retrieval per order/session)
- Added Section 14: Adapter Architecture (new — ILPAdapter pattern, provider_type routing)
- Updated instrument responses with new fields: `canonical_symbol`, `last_fragment`
- Updated position responses with new fields: `canonical_symbol`, `security_type`, `last_fragment`
- Updated trade history responses with new fields: `canonical_symbol`, `trd_type`, `commission`
- Expanded LP-Specific Notes with CMC Markets details (previously "Planned")
- Updated REST API mapping with new FIX audit endpoints
- Marked previously-planned endpoints now implemented: `GET_ROUTE_STATUS` 🟢, `GET_TRADE_HISTORY` 🟢, `REQUEST_TRADE_HISTORY` 🟢, `CLOSE_POSITION` 🟢

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Transport Layer](#2-transport-layer)
3. [Request/Response Protocol](#3-requestresponse-protocol)
4. [LP Management](#4-lp-management)
5. [Instruments](#5-instruments)
6. [Market Data](#6-market-data)
7. [Order Management](#7-order-management)
8. [Positions](#8-positions)
9. [Account & Balance](#9-account--balance)
10. [Trade History](#10-trade-history)
11. [FIX Message Audit Trail](#11-fix-message-audit-trail) *(new in v2.0)*
12. [System Administration](#12-system-administration)
13. [Real-Time Event Stream](#13-real-time-event-stream)
14. [Adapter Architecture](#14-adapter-architecture) *(new in v2.0)*
15. [Error Reference](#15-error-reference)
16. [LP-Specific Notes](#16-lp-specific-notes)
17. [Data Types & Enums](#17-data-types--enums)
18. [REST API Mapping](#18-rest-api-mapping)

---

## 1. Architecture Overview

The FIX Bridge runs as a standalone service (`fixbridge_service.exe`) that manages FIX protocol connections to external Liquidity Providers. The frontend communicates with the bridge through `nexrisk_service`, which proxies requests via ZeroMQ.

```
Frontend (React)
    │
    ▼  HTTP REST
nexrisk_service (C++ REST API on :8080)
    │
    ├──► ZMQ REQ/REP (tcp://localhost:5561)  ── Command channel
    │                                            (request/response)
    │
    └──► ZMQ SUB (tcp://localhost:5560)      ── Event stream
                                                (real-time push)
                                                    │
                                            FIX Bridge Service
                                                    │
                                              ┌─────┤
                                              ▼     ▼
                                          LPRegistry
                                              │
                                    ┌─────────┼─────────┐
                                    ▼         ▼         ▼
                                TEAdapter  CMCAdapter  (future)
                                    │         │         │
                                LP: TE     LP: CMC    LP: LMAX
                              (FIX 4.4)  (FIX 4.4)  (FIX 4.4)
```

**Key change in v2.0**: Each LP connection now routes through an **ILPAdapter** implementation. The `provider_type` field in LP configuration determines which adapter handles FIX message building and parsing. See [Section 14: Adapter Architecture](#14-adapter-architecture).

The REST API on `nexrisk_service` translates HTTP requests to ZMQ commands and returns the JSON response. The event stream is forwarded via WebSocket (or SSE) to the frontend for real-time updates.

---

## 2. Transport Layer

### Command Channel (Request/Response)

- **Protocol**: ZeroMQ REQ/REP
- **Endpoint**: `tcp://localhost:5561`
- **Pattern**: Synchronous request/response — send one command, receive one response
- **Timeout**: Recommended 10 seconds client-side

### Event Stream (Pub/Sub)

- **Protocol**: ZeroMQ PUB/SUB
- **Endpoint**: `tcp://localhost:5560`
- **Pattern**: Subscribe to topic prefixes, receive real-time events
- **Topics**: See [Section 13: Real-Time Event Stream](#12-real-time-event-stream)

---

## 3. Request/Response Protocol

### Request Format

All commands follow this JSON structure:

```json
{
  "type": "COMMAND_NAME",
  "params": {
    "param1": "value1",
    "param2": "value2"
  }
}
```

### Response Format

**Success**:
```json
{
  "success": true,
  "data": { ... }
}
```

**Error**:
```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

### Common Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `lp_id` | string | Liquidity Provider identifier (e.g., `"traderevolution"`, `"lmax"`) |
| `symbol` | string | Instrument symbol (e.g., `"EURUSD"`, `"XAUUSD"`) |

---

## 4. LP Management

### GET_STATUS 🟢

Returns the overall FIX Bridge service status including all configured LPs.

**Request**:
```json
{ "type": "GET_STATUS", "params": {} }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "bridge_id": "fixbridge-01",
    "environment": "SANDBOX",
    "uptime_seconds": 3600,
    "lp_count": 1,
    "lps": {
      "traderevolution": {
        "state": "CONNECTED",
        "provider_type": "traderevolution",
        "trading_session": "LOGGED_ON",
        "md_session": "LOGGED_ON"
      }
    }
  }
}
```

### GET_LP_STATUS 🟢

Returns detailed status for a specific LP including session states, instruments, positions, and orders.

**Request**:
```json
{ "type": "GET_LP_STATUS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "lp_name": "TraderEvolution Sandbox",
    "provider_type": "traderevolution",
    "state": "CONNECTED",
    "connect_count": 1,
    "disconnect_count": 0,
    "capabilities": {
      "close_position_method": "nos_group",
      "has_account_status": true,
      "has_close_position_msg": true,
      "has_route_status": true,
      "instrument_request_type": "SecurityDefinitionRequest",
      "requires_ssl": false
    },
    "trading_session": {
      "connected": true,
      "state": "LOGGED_ON",
      "host": "sandbox-fixk1.traderevolution.com",
      "port": 9882,
      "sender_comp_id": "fix_connection_1_trd",
      "target_comp_id": "TEORDER",
      "lp_id": "traderevolution",
      "active_orders": 0,
      "instruments_loaded": 6,
      "instruments_complete": true,
      "positions_loaded": 0,
      "positions_initial_load": true
    },
    "md_session": {
      "connected": true,
      "state": "LOGGED_ON",
      "host": "sandbox-fixk1.traderevolution.com",
      "port": 9883,
      "sender_comp_id": "fix_connection_1",
      "target_comp_id": "TEPRICE",
      "session_type": "MARKETDATA",
      "depth": 1,
      "subscriptions": ["EURUSD"]
    }
  }
}
```

**Session State Values**:

| State | Description |
|-------|-------------|
| `DISCONNECTED` | No connection to LP |
| `CONNECTING` | TCP connection in progress |
| `LOGGED_ON` | FIX session established and authenticated |
| `RECONNECTING` | Connection lost, attempting reconnection |
| `SESSION_ERROR` | Unrecoverable session error |

**LP State Values**:

| State | Description |
|-------|-------------|
| `DISCONNECTED` | Both sessions down |
| `CONNECTING` | One or both sessions connecting |
| `CONNECTED` | Both sessions logged on |
| `STOPPED` | Explicitly stopped via `STOP_LP` |
| `DEGRADED` | One session down or unhealthy |
| `QUARANTINED` | Manually disabled by admin |

### GET_LP_CAPABILITIES 🟢

Returns the LP's supported order types, instruments, and trading limits.

**Request**:
```json
{ "type": "GET_LP_CAPABILITIES", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "order_types": ["MARKET", "LIMIT", "STOP"],
    "time_in_force": ["GTC", "IOC", "DAY"],
    "supported_operations": ["NEW", "CANCEL", "REPLACE"],
    "max_order_qty": 10000000,
    "min_order_qty": 1000,
    "supported_symbols": ["EURUSD", "GBPUSD", "AUDUSD", "USDCAD", "EURGBP", "XAUUSD"],
    "custom_fields": {
      "sl_tp": true,
      "product_type": true,
      "open_close": true
    }
  }
}
```

### START_LP 🟢

Start (or restart) all sessions for an LP.

**Request**:
```json
{ "type": "START_LP", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": { "message": "LP traderevolution started" }
}
```

### STOP_LP 🟢

Gracefully disconnect all sessions for an LP. Sends FIX Logout before closing.

**Request**:
```json
{ "type": "STOP_LP", "params": { "lp_id": "traderevolution" } }
```

### QUARANTINE_LP 🟢

Disable an LP and prevent automatic reconnection. Active orders are NOT cancelled — use this for investigation scenarios.

**Request**:
```json
{ "type": "QUARANTINE_LP", "params": { "lp_id": "traderevolution" } }
```

### RESUME_LP 🟢

Resume a quarantined LP, re-establishing connections.

**Request**:
```json
{ "type": "RESUME_LP", "params": { "lp_id": "traderevolution" } }
```

---

## 5. Instruments

Instruments are automatically loaded from the LP on logon via SecurityDefinition messages. The cache is refreshable on demand.

### GET_INSTRUMENTS 🟢

Returns all instruments loaded from the LP. Supports optional filtering by group.

**Request**:
```json
{ "type": "GET_INSTRUMENTS", "params": { "lp_id": "traderevolution" } }
```

**Optional filter by group**:
```json
{ "type": "GET_INSTRUMENTS", "params": { "lp_id": "traderevolution", "group": "FX" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "count": 6,
    "list_complete": true,
    "instruments": [
      {
        "symbol": "EURUSD",
        "canonical_symbol": "",
        "security_id": "56871",
        "currency": "USD",
        "description": "",
        "instrument_group": "",
        "min_price_increment": 0.00001,
        "contract_multiplier": 1.0,
        "min_trade_vol": 100000.0,
        "max_trade_vol": 100000.0,
        "round_lot": 1.0,
        "price_precision": 5,
        "has_trade_route": true,
        "has_info_route": true,
        "trade_route": "TRADE",
        "routes": [
          { "name": "TRADE", "type": "T" },
          { "name": "DX FX", "type": "Q" }
        ],
        "cross_instrument_type": 0,
        "text": "",
        "received_ts": 1771180550659
      },
      {
        "symbol": "XAUUSD",
        "security_id": "56931",
        "currency": "USD",
        "min_price_increment": 0.01,
        "min_trade_vol": 10.0,
        "max_trade_vol": 10.0,
        "price_precision": 2,
        "..."
      }
    ]
  }
}
```

**Instrument Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `symbol` | string | Trading symbol (e.g., `"EURUSD"`) |
| `security_id` | string | LP's internal instrument ID |
| `currency` | string | Quote currency (e.g., `"USD"`) |
| `description` | string | Human-readable description |
| `instrument_group` | string | LP grouping (e.g., `"FX"`, `"Metals"`) |
| `min_price_increment` | float | Tick size (e.g., `0.00001` for 5-digit FX) |
| `contract_multiplier` | float | Contract size multiplier |
| `min_trade_vol` | float | Minimum order quantity |
| `max_trade_vol` | float | Maximum order quantity |
| `round_lot` | float | Lot step increment |
| `price_precision` | int | Decimal places for pricing |
| `has_trade_route` | bool | Can execute trades |
| `has_info_route` | bool | Can receive quotes |
| `trade_route` | string | Primary trade route name |
| `routes` | array | All available routes with type (`T`=Trade, `Q`=Quote, `TQ`=Both) |
| `cross_instrument_type` | int | TE-specific cross type |
| `canonical_symbol` | string | LP-neutral symbol (e.g., `"EURUSD"` regardless of LP format). Empty if same as `symbol`. *(v2.0)* |
| `last_fragment` | bool | FIX tag 893 — true if this is the final instrument in the list. CMC uses this to signal end of security definitions. *(v2.0)* |
| `received_ts` | int64 | Timestamp when received (epoch ms) |

### GET_INSTRUMENT_INFO 🟢

Returns detailed info for a single instrument by symbol.

**Request**:
```json
{
  "type": "GET_INSTRUMENT_INFO",
  "params": { "lp_id": "traderevolution", "symbol": "EURUSD" }
}
```

**Response**: Same structure as a single instrument in `GET_INSTRUMENTS`.

**Error** (not found):
```json
{ "success": false, "error": "Instrument not found: ZZZZZ" }
```

### GET_INSTRUMENT_SUMMARY 🟢

Returns aggregate statistics about loaded instruments.

**Request**:
```json
{ "type": "GET_INSTRUMENT_SUMMARY", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "total_instruments": 6,
    "tradeable_instruments": 6,
    "list_complete": true,
    "groups": {
      "(none)": 6
    },
    "first_received_ts": 1771180550659,
    "last_received_ts": 1771180550767
  }
}
```

### REQUEST_SECURITY_LIST 🟢

Force a refresh of the instrument list from the LP. Clears existing cache and re-requests.

**Request**:
```json
{ "type": "REQUEST_SECURITY_LIST", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": { "message": "SecurityDefinitionRequest sent" }
}
```

**Note**: Instruments arrive asynchronously. Poll `GET_INSTRUMENT_SUMMARY` and check `list_complete: true` to know when all instruments have been received.

---

## 6. Market Data

Market data is delivered via the separate MarketData FIX session. Subscribe to symbols to start receiving price updates.

### SUBSCRIBE_MD 🟢

Subscribe to market data for a symbol. Starts receiving snapshots and incremental updates.

**Request**:
```json
{
  "type": "SUBSCRIBE_MD",
  "params": {
    "lp_id": "traderevolution",
    "symbol": "EURUSD",
    "depth": 1
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lp_id` | string | Yes | LP identifier |
| `symbol` | string | Yes | Instrument symbol |
| `depth` | int | No | Book depth levels (default: from LP config, max 20) |

**Note on symbol format**: Use LP-native format — `EURUSD` for TE, `EUR/USD` for CMC. The adapter handles any necessary translation.

**Response**:
```json
{
  "success": true,
  "data": { "message": "Subscribed to EURUSD" }
}
```

### UNSUBSCRIBE_MD 🟢

Stop receiving market data for a symbol.

**Request**:
```json
{
  "type": "UNSUBSCRIBE_MD",
  "params": { "lp_id": "traderevolution", "symbol": "EURUSD" }
}
```

### GET_BOOK 🟢

Returns the current order book (DOM) for a subscribed symbol.

**Request**:
```json
{
  "type": "GET_BOOK",
  "params": { "lp_id": "traderevolution", "symbol": "EURUSD" }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "symbol": "EURUSD",
    "lp_id": "traderevolution",
    "state": "HEALTHY",
    "last_update_ts": 1771180600123,
    "update_count": 1523,
    "bids": [
      { "price": 1.08542, "size": 100000.0, "level": 0 }
    ],
    "asks": [
      { "price": 1.08545, "size": 100000.0, "level": 0 }
    ],
    "spread": 0.00003,
    "mid_price": 1.085435,
    "best_bid": 1.08542,
    "best_ask": 1.08545
  }
}
```

**Book State Values**:

| State | Description |
|-------|-------------|
| `HEALTHY` | Receiving regular updates |
| `STALE` | No updates within `stale_threshold_ms` (default 10s) |
| `EMPTY` | Subscribed but no data yet |
| `RESYNCING` | Re-requesting full snapshot |

### GET_ALL_BOOKS 🟢

Returns DOM snapshots for all subscribed symbols.

**Request**:
```json
{ "type": "GET_ALL_BOOKS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "books": {
      "EURUSD": { "bids": [...], "asks": [...], "state": "HEALTHY", "..." },
      "GBPUSD": { "bids": [...], "asks": [...], "state": "HEALTHY", "..." }
    },
    "count": 2
  }
}
```

### GET_BEST_PRICES 🟢

Returns only the top-of-book (best bid/ask) for all subscribed symbols. Lighter than `GET_ALL_BOOKS`.

**Request**:
```json
{ "type": "GET_BEST_PRICES", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "prices": {
      "EURUSD": {
        "best_bid": 1.08542,
        "best_ask": 1.08545,
        "spread": 0.00003,
        "state": "HEALTHY",
        "last_update_ts": 1771180600123
      }
    }
  }
}
```

---

## 7. Order Management

### PLACE_ORDER 🟢

Submit a new order to the LP. Returns the assigned `clord_id` for tracking.

**Request**:
```json
{
  "type": "PLACE_ORDER",
  "params": {
    "lp_id": "traderevolution",
    "symbol": "EURUSD",
    "side": "BUY",
    "quantity": 100000,
    "order_type": "LIMIT",
    "price": 1.08500,
    "time_in_force": "GTC",
    "stop_loss": 1.08000,
    "take_profit": 1.09000,
    "product_type": "FOREX",
    "open_close": "O"
  }
}
```

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lp_id` | string | Yes | LP identifier |
| `symbol` | string | Yes | Instrument symbol |
| `side` | string | Yes | `"BUY"` or `"SELL"` |
| `quantity` | float | Yes | Order quantity |
| `order_type` | string | Yes | `"MARKET"`, `"LIMIT"`, `"STOP"` |
| `price` | float | Conditional | Required for `LIMIT` and `STOP` orders |
| `time_in_force` | string | No | `"GTC"` (default), `"IOC"`, `"DAY"` |
| `stop_loss` | float | No | Stop-loss price (TE tag 18205) |
| `take_profit` | float | No | Take-profit price (TE tag 18206) |
| `product_type` | string | No | `"FOREX"`, `"CFD"`, `"EQUITIES"` (TE tag 20017) |
| `open_close` | string | No | `"O"` (open), `"C"` (close) — FIX tag 77 |
| `security_id` | string | No | LP instrument ID (tag 48) — auto-resolved from symbol if omitted |
| `ex_destination` | string | No | Route identifier (tag 100) |

**Response**:
```json
{
  "success": true,
  "data": {
    "clord_id": "traderevolution_1_1708012345678",
    "message": "Order submitted"
  }
}
```

**Validation Errors**:
```json
{ "success": false, "error": "Symbol ZZZZZ not in LP capabilities" }
{ "success": false, "error": "Quantity 999999999 exceeds max 10000000" }
{ "success": false, "error": "Order type STOP_LIMIT not supported by LP" }
{ "success": false, "error": "Trading session not connected for LP: traderevolution" }
```

### CANCEL_ORDER 🟢

Cancel an active order by its original `clord_id`.

**Request**:
```json
{
  "type": "CANCEL_ORDER",
  "params": {
    "lp_id": "traderevolution",
    "orig_clord_id": "traderevolution_1_1708012345678",
    "symbol": "EURUSD"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": { "message": "Cancel request sent" }
}
```

### REPLACE_ORDER 🟢

Modify an active order (price, quantity). The LP assigns a new `clord_id`.

**Request**:
```json
{
  "type": "REPLACE_ORDER",
  "params": {
    "lp_id": "traderevolution",
    "orig_clord_id": "traderevolution_1_1708012345678",
    "symbol": "EURUSD",
    "side": "BUY",
    "quantity": 200000,
    "order_type": "LIMIT",
    "price": 1.08450
  }
}
```

### GET_ORDER_STATE 🟢

Returns the current state of an order (state machine view).

**Request**:
```json
{
  "type": "GET_ORDER_STATE",
  "params": { "lp_id": "traderevolution", "clord_id": "traderevolution_1_1708012345678" }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "clord_id": "traderevolution_1_1708012345678",
    "state": "FILLED",
    "state_history": [
      { "state": "PENDING_NEW", "timestamp_ms": 1708012345678 },
      { "state": "NEW", "timestamp_ms": 1708012345789 },
      { "state": "PARTIALLY_FILLED", "timestamp_ms": 1708012346000 },
      { "state": "FILLED", "timestamp_ms": 1708012346123 }
    ]
  }
}
```

**Order State Values**:

| State | Description |
|-------|-------------|
| `PENDING_NEW` | Submitted to LP, awaiting acknowledgment |
| `NEW` | Acknowledged by LP, working on book |
| `PARTIALLY_FILLED` | Some quantity executed |
| `FILLED` | Fully executed |
| `PENDING_CANCEL` | Cancel request sent |
| `CANCELLED` | Successfully cancelled |
| `PENDING_REPLACE` | Replace request sent |
| `REPLACED` | Successfully modified |
| `REJECTED` | Rejected by LP |
| `EXPIRED` | Expired per time-in-force |

### GET_ORDER_INFO 🟢

Returns full order details including execution information.

**Request**:
```json
{
  "type": "GET_ORDER_INFO",
  "params": { "lp_id": "traderevolution", "clord_id": "traderevolution_1_1708012345678" }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "clord_id": "traderevolution_1_1708012345678",
    "order_id": "LP_ORDER_12345",
    "symbol": "EURUSD",
    "side": "BUY",
    "order_type": "LIMIT",
    "price": 1.08500,
    "quantity": 100000,
    "state": "FILLED",
    "cum_qty": 100000,
    "leaves_qty": 0,
    "avg_px": 1.08500,
    "last_qty": 100000,
    "last_px": 1.08500,
    "exec_id": "EXEC_789",
    "exec_type": "F",
    "text": "",
    "created_ts": 1708012345678,
    "last_update_ts": 1708012346123
  }
}
```

### GET_ACTIVE_ORDERS 🟢

Returns all orders in active states (`PENDING_NEW`, `NEW`, `PARTIALLY_FILLED`, `PENDING_CANCEL`, `PENDING_REPLACE`).

**Request**:
```json
{ "type": "GET_ACTIVE_ORDERS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "count": 2,
    "orders": [
      { "clord_id": "...", "symbol": "EURUSD", "side": "BUY", "state": "NEW", "..." },
      { "clord_id": "...", "symbol": "GBPUSD", "side": "SELL", "state": "PARTIALLY_FILLED", "..." }
    ]
  }
}
```

### GET_ALL_ORDERS 🟢

Returns all orders including completed (filled, cancelled, rejected). Useful for order blotter.

**Request**:
```json
{ "type": "GET_ALL_ORDERS", "params": { "lp_id": "traderevolution" } }
```

### CLOSE_POSITION 🟢

Close an open position by position ID. Sends a close order with the position's inverse parameters. The adapter handles LP-specific close mechanics (TE uses `OpenClose` custom tag, CMC uses `SecurityType` in close message).

**Request**:
```json
{
  "type": "CLOSE_POSITION",
  "params": {
    "lp_id": "traderevolution",
    "position_id": "180311",
    "quantity": 100000
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lp_id` | string | Yes | LP identifier |
| `position_id` | string | Yes | Position ID from `GET_POSITIONS` |
| `quantity` | float | No | Partial close quantity. Omit for full close. |

**Response**:
```json
{
  "success": true,
  "data": {
    "clord_id": "traderevolution_close_180311_1708012345678",
    "message": "Close position order submitted"
  }
}
```

### GET_ORDER_STATUS 🟡

Request the current status of an order directly from the LP (FIX OrderStatusRequest, MsgType H). Useful when local state may be stale.

**Request**:
```json
{
  "type": "GET_ORDER_STATUS",
  "params": {
    "lp_id": "traderevolution",
    "clord_id": "traderevolution_1_1708012345678",
    "symbol": "EURUSD",
    "side": "BUY"
  }
}
```

**Response**: Returns the execution report received from the LP, same format as `GET_ORDER_INFO`.

---

## 8. Positions

Positions are automatically loaded from the LP on logon. The cache auto-completes after a 5-second quiet period following the request.

### GET_POSITIONS 🟢

Returns all open positions. Supports optional filtering by symbol.

**Request** (all positions):
```json
{ "type": "GET_POSITIONS", "params": { "lp_id": "traderevolution" } }
```

**Request** (filtered by symbol):
```json
{
  "type": "GET_POSITIONS",
  "params": { "lp_id": "traderevolution", "symbol": "EURUSD" }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "count": 2,
    "initial_load_complete": true,
    "positions": [
      {
        "position_id": "180311",
        "account": "fix_connection_1_trd",
        "symbol": "EURUSD",
        "canonical_symbol": "",
        "security_id": "56871",
        "security_exchange": "TRADE",
        "security_type": "",
        "open_price": 1.10908,
        "long_qty": 100000.0,
        "short_qty": 0.0,
        "net_qty": 100000.0,
        "side": "LONG",
        "commission": 3.50,
        "swap": -1.25,
        "type_id": 1,
        "ex_destination": "",
        "pos_req_id": "traderevolution_POSREQ_0",
        "pos_req_result": 0,
        "received_ts": 1771180600234
      },
      {
        "position_id": "180312",
        "symbol": "XAUUSD",
        "open_price": 2015.50,
        "long_qty": 0.0,
        "short_qty": 10.0,
        "net_qty": -10.0,
        "side": "SHORT",
        "commission": 5.00,
        "swap": -0.50,
        "..."
      }
    ]
  }
}
```

**Position Fields**:

| Field | Type | Description |
|-------|------|-------------|
| `position_id` | string | Unique position identifier from LP |
| `account` | string | Trading account |
| `symbol` | string | Instrument symbol |
| `security_id` | string | LP instrument ID |
| `security_exchange` | string | Exchange/route |
| `security_type` | string | FIX tag 167 — needed by CMC for close position logic *(v2.0)* |
| `canonical_symbol` | string | LP-neutral symbol. Empty if same as `symbol`. *(v2.0)* |
| `open_price` | float | Price at which position was opened |
| `long_qty` | float | Long (buy) quantity |
| `short_qty` | float | Short (sell) quantity |
| `net_qty` | float | `long_qty - short_qty` (positive=long, negative=short) |
| `side` | string | `"LONG"`, `"SHORT"`, `"HEDGED"`, or `"FLAT"` |
| `commission` | float | Accumulated commission |
| `swap` | float | Accumulated overnight swap |
| `type_id` | int | Product type (TE-specific) |
| `ex_destination` | string | Route identifier |
| `pos_req_id` | string | Request that returned this position |
| `pos_req_result` | int | `0` = success |
| `last_fragment` | bool | FIX tag 893 — true if final position in batch. CMC uses this. *(v2.0)* |
| `received_ts` | int64 | When this report was received (epoch ms) |

### GET_POSITION_INFO 🟢

Returns a single position by its position ID.

**Request**:
```json
{
  "type": "GET_POSITION_INFO",
  "params": { "lp_id": "traderevolution", "position_id": "180311" }
}
```

**Response**: Same structure as a single position in `GET_POSITIONS`.

### GET_POSITION_SUMMARY 🟢

Returns aggregate statistics about open positions.

**Request**:
```json
{ "type": "GET_POSITION_SUMMARY", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "total_positions": 2,
    "long_positions": 1,
    "short_positions": 1,
    "total_commission": 8.50,
    "total_swap": -1.75,
    "initial_load_complete": true,
    "total_reports_received": 2,
    "by_symbol": {
      "EURUSD": 1,
      "XAUUSD": 1
    },
    "first_received_ts": 1771180600234,
    "last_received_ts": 1771180600345
  }
}
```

### REQUEST_POSITIONS 🟢

Force a refresh of open positions from the LP. Clears the cache and re-requests.

**Request**:
```json
{ "type": "REQUEST_POSITIONS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": { "message": "RequestForPositions sent" }
}
```

**Note**: Positions arrive asynchronously. The `initial_load_complete` flag auto-sets to `true` after a 5-second quiet period. Poll `GET_POSITION_SUMMARY` to check.

---

## 9. Account & Balance

### GET_ACCOUNT_STATUS 🟡

Returns account balance, equity, margin, and P&L information.

**Request**:
```json
{ "type": "GET_ACCOUNT_STATUS", "params": { "lp_id": "traderevolution" } }
```

**Response** (planned):
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "account": "fix_connection_1_trd",
    "balance": 100000.00,
    "equity": 99850.25,
    "used_margin": 1500.00,
    "available_margin": 98350.25,
    "margin_level_pct": 6656.68,
    "unrealized_pnl": -149.75,
    "realized_pnl": 0.00,
    "currency": "USD",
    "updated_ts": 1771180700000
  }
}
```

### REQUEST_ACCOUNT_STATUS 🟡

Force a refresh of account status from the LP.

**Request**:
```json
{ "type": "REQUEST_ACCOUNT_STATUS", "params": { "lp_id": "traderevolution" } }
```

---

## 10. Trade History

### GET_TRADE_HISTORY 🟢

Request trade capture reports (historical trades) from the LP.

**Request**:
```json
{
  "type": "GET_TRADE_HISTORY",
  "params": {
    "lp_id": "traderevolution",
    "symbol": "EURUSD",
    "start_time": "2026-02-14T00:00:00Z",
    "end_time": "2026-02-15T23:59:59Z"
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lp_id` | string | Yes | LP identifier |
| `symbol` | string | No | Filter by symbol (omit for all) |
| `start_time` | string | No | ISO 8601 start time |
| `end_time` | string | No | ISO 8601 end time |

**Response** (planned):
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "count": 15,
    "trades": [
      {
        "trade_report_id": "TR_12345",
        "exec_id": "EXEC_789",
        "symbol": "EURUSD",
        "canonical_symbol": "",
        "security_id": "56871",
        "side": "BUY",
        "last_qty": 100000,
        "last_px": 1.08500,
        "trd_type": 0,
        "commission": 3.50,
        "order_id": "LP_ORDER_12345",
        "account": "fix_connection_1_trd",
        "transact_time": "20260215-10:30:00",
        "trade_date": "20260215",
        "previously_reported": true,
        "last_rpt_requested": true,
        "received_ts": 1771180600234
      }
    ]
  }
}
```

### REQUEST_TRADE_HISTORY 🟢

Trigger a TradeCaptureReportRequest (FIX MsgType AD) to the LP.

**Request**:
```json
{
  "type": "REQUEST_TRADE_HISTORY",
  "params": {
    "lp_id": "traderevolution",
    "start_time": "2026-02-14T00:00:00Z",
    "end_time": "2026-02-15T23:59:59Z"
  }
}
```

---


## 11. FIX Message Audit Trail

**New in v2.0.** These endpoints provide raw FIX protocol messages for conformance testing, debugging, and frontend display. Messages are captured by the QuickFIX FileStore and indexed by session.

### GET_FIX_MESSAGES 🟡

Retrieve raw FIX messages for an LP session. Supports filtering by time range, direction, and message type.

**Request**:
```json
{
  "type": "GET_FIX_MESSAGES",
  "params": {
    "lp_id": "traderevolution",
    "session": "trading",
    "direction": "both",
    "msg_type": "D",
    "limit": 50,
    "offset": 0,
    "start_seq": 1,
    "end_seq": 100
  }
}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `lp_id` | string | Yes | LP identifier |
| `session` | string | No | `"trading"` (default), `"marketdata"`, or `"both"` |
| `direction` | string | No | `"sent"`, `"received"`, or `"both"` (default) |
| `msg_type` | string | No | Filter by FIX MsgType: `"A"` (Logon), `"D"` (NewOrderSingle), `"8"` (ExecutionReport), `"V"` (MarketDataRequest), `"W"` (Snapshot), etc. |
| `limit` | int | No | Max results (default 50, max 500) |
| `offset` | int | No | Pagination offset |
| `start_seq` | int | No | Start sequence number (inclusive) |
| `end_seq` | int | No | End sequence number (inclusive) |

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "session": "trading",
    "sender_comp_id": "fix_connection_1_trd",
    "target_comp_id": "TEORDER",
    "total_messages": 2,
    "messages": [
      {
        "seq_num": 11,
        "direction": "sent",
        "msg_type": "D",
        "msg_type_name": "NewOrderSingle",
        "timestamp": "20260220-03:05:00.123",
        "raw": "8=FIX.4.4|9=180|35=D|34=11|49=fix_connection_1_trd|52=20260220-03:05:00|56=TEORDER|11=ORD_001|1=fix_connection_1_trd|55=EURUSD|48=56871|207=TRADE|54=1|38=100000|40=1|60=20260220-03:05:00|10=xxx|",
        "parsed": {
          "ClOrdID": "ORD_001",
          "Symbol": "EURUSD",
          "Side": "1",
          "OrderQty": "100000",
          "OrdType": "1"
        }
      },
      {
        "seq_num": 11,
        "direction": "received",
        "msg_type": "8",
        "msg_type_name": "ExecutionReport",
        "timestamp": "20260220-03:05:00.256",
        "raw": "8=FIX.4.4|9=250|35=8|34=11|49=TEORDER|52=20260220-03:05:00|56=fix_connection_1_trd|37=TE_ORD_001|11=ORD_001|17=EXEC_001|150=0|39=0|55=EURUSD|54=1|38=100000|32=0|31=0|14=0|151=100000|6=0|10=xxx|",
        "parsed": {
          "OrderID": "TE_ORD_001",
          "ClOrdID": "ORD_001",
          "ExecID": "EXEC_001",
          "ExecType": "0",
          "OrdStatus": "0",
          "Symbol": "EURUSD"
        }
      }
    ]
  }
}
```

**Notes**:
- The `raw` field contains the complete FIX message with `|` as a visual delimiter (actual SOH byte `0x01` replaced for display)
- The `parsed` field contains a key-value extraction of the most commonly referenced tags
- Messages are sourced from the QuickFIX FileStore (`.body` files in `store/trading/` and `store/marketdata/`)
- Historical messages persist across service restarts (stored on disk)

### GET_FIX_MESSAGES_FOR_ORDER 🟡

Retrieve all FIX messages associated with a specific order (by `clord_id`). This includes the outbound NewOrderSingle (D), all ExecutionReports (8), and any Cancel (F) or Replace (G) requests.

**Request**:
```json
{
  "type": "GET_FIX_MESSAGES_FOR_ORDER",
  "params": {
    "lp_id": "traderevolution",
    "clord_id": "traderevolution_1_1708012345678"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "clord_id": "traderevolution_1_1708012345678",
    "message_count": 3,
    "messages": [
      {
        "seq_num": 11,
        "direction": "sent",
        "msg_type": "D",
        "msg_type_name": "NewOrderSingle",
        "timestamp": "20260220-03:05:00.123",
        "raw": "8=FIX.4.4|9=180|35=D|...|11=traderevolution_1_1708012345678|...|10=xxx|"
      },
      {
        "seq_num": 11,
        "direction": "received",
        "msg_type": "8",
        "msg_type_name": "ExecutionReport",
        "timestamp": "20260220-03:05:00.256",
        "raw": "8=FIX.4.4|...|11=traderevolution_1_1708012345678|150=0|39=0|...|10=xxx|"
      },
      {
        "seq_num": 12,
        "direction": "received",
        "msg_type": "8",
        "msg_type_name": "ExecutionReport",
        "timestamp": "20260220-03:05:00.312",
        "raw": "8=FIX.4.4|...|11=traderevolution_1_1708012345678|150=F|39=2|31=1.08550|32=100000|...|10=xxx|"
      }
    ]
  }
}
```

**How it works**: The bridge indexes outbound ClOrdIDs and scans the FileStore for messages containing that ID in tag 11 (ClOrdID) or tag 41 (OrigClOrdID). This provides a complete lifecycle view of every order.

### GET_FIX_SESSION_LOG 🟡

Retrieve session-level messages (Logon, Logout, Heartbeat, TestRequest) for diagnostics and conformance.

**Request**:
```json
{
  "type": "GET_FIX_SESSION_LOG",
  "params": {
    "lp_id": "traderevolution",
    "session": "trading",
    "limit": 20
  }
}
```

**Response**: Same format as `GET_FIX_MESSAGES` but pre-filtered to session-level message types (`35=A`, `35=5`, `35=0`, `35=1`, `35=2`, `35=3`, `35=4`).

---

## 12. System Administration

### EXPORT_INCIDENT 🟢

Export a diagnostic bundle containing FIX logs, event logs, and state snapshots for a given time window. Used for debugging and compliance.

**Request**:
```json
{
  "type": "EXPORT_INCIDENT",
  "params": {
    "lp_id": "traderevolution",
    "reason": "Order rejected unexpectedly",
    "time_range_minutes": 30
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "incident_id": "INC-20260215-143000",
    "bundle_path": "incidents/INC-20260215-143000/",
    "files": ["fix_messages.log", "event.log", "state_snapshot.json"]
  }
}
```

### GET_ROUTE_STATUS 🟢

Returns the status of available routes/exchanges for an LP. TE uses multiple routes (TRADE, DX FX, etc.).

**Request**:
```json
{ "type": "GET_ROUTE_STATUS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "routes": [
      {
        "route_name": "TRADE",
        "route_type": 2,
        "gateway_status": 2,
        "exchange_gateway": "TRADE",
        "quote_exchange": "DX FX",
        "node_id": "2",
        "received_ts": 1771617692043
      },
      {
        "route_name": "DX FX",
        "route_type": 1,
        "gateway_status": 2,
        "exchange_gateway": "DX FX",
        "quote_exchange": "DX FX",
        "node_id": "2",
        "received_ts": 1771617692045
      }
    ]
  }
}
```

**gateway_status Values**: `2` = Active/Open, `1` = Connecting, `0` = Closed

---

## 13. Real-Time Event Stream

The event stream delivers real-time updates via ZeroMQ PUB/SUB (forwarded to frontend via WebSocket). Subscribe to topic prefixes to receive specific event types.

### Topics

| Topic | Description | Payload |
|-------|-------------|---------|
| `session` | Session state changes, logon/logout, IDS complete | See below |
| `execution` | Order fills, cancellations, rejects | See below |
| `position` | Position report updates | See below |
| `instrument` | SecurityDefinition arrivals | See below |
| `md.snapshot.{SYMBOL}` | Full book snapshot for symbol | See below |
| `md.incremental` | Incremental book updates | See below |
| `session.md.logon` | Market data session logged on | See below |
| `session.md.logout` | Market data session logged out | See below |

### Event: Session State Change

Published on topic `session` when trading session state changes.

```json
{
  "type": "SESSION_STATE_CHANGE",
  "lp_id": "traderevolution",
  "old_state": "CONNECTING",
  "new_state": "LOGGED_ON",
  "timestamp_ms": 1771180550000
}
```

### Event: Execution Report

Published on topic `execution` for every execution report from the LP.

```json
{
  "type": "EXECUTION_REPORT",
  "lp_id": "traderevolution",
  "clord_id": "traderevolution_1_1708012345678",
  "exec_id": "EXEC_789",
  "order_id": "LP_ORDER_12345",
  "exec_type": "F",
  "ord_status": "2",
  "symbol": "EURUSD",
  "side": "BUY",
  "last_qty": 100000,
  "last_px": 1.08500,
  "cum_qty": 100000,
  "leaves_qty": 0,
  "text": "",
  "timestamp_ms": 1771180600123
}
```

**ExecType Values**:

| Value | Meaning |
|-------|---------|
| `0` | New (order acknowledged) |
| `4` | Cancelled |
| `5` | Replaced |
| `8` | Rejected |
| `C` | Expired |
| `F` | Trade (partial or full fill) |

**OrdStatus Values**:

| Value | Meaning |
|-------|---------|
| `0` | New |
| `1` | Partially Filled |
| `2` | Filled |
| `4` | Cancelled |
| `6` | Pending Cancel |
| `8` | Rejected |
| `E` | Pending Replace |

### Event: Order Cancel Reject

Published on topic `execution` when a cancel/replace request is rejected by the LP.

```json
{
  "type": "ORDER_CANCEL_REJECT",
  "lp_id": "traderevolution",
  "clord_id": "traderevolution_1_1708012346000",
  "orig_clord_id": "traderevolution_1_1708012345678",
  "ord_status": "0",
  "cxl_rej_reason": "1",
  "text": "Unknown order",
  "timestamp_ms": 1771180600500
}
```

### Event: Position Report

Published on topic `position` for every position report received from the LP.

```json
{
  "type": "POSITION_REPORT",
  "lp_id": "traderevolution",
  "position_id": "180311",
  "account": "fix_connection_1_trd",
  "symbol": "EURUSD",
  "security_id": "56871",
  "open_price": 1.10908,
  "long_qty": 100000.0,
  "short_qty": 0.0,
  "net_qty": 100000.0,
  "side": "LONG",
  "commission": 3.50,
  "swap": -1.25,
  "timestamp_ms": 1771180600234
}
```

### Event: Security Definition

Published on topic `instrument` for each instrument definition received.

```json
{
  "type": "SECURITY_DEFINITION",
  "lp_id": "traderevolution",
  "req_id": "traderevolution_SECREQ_0",
  "response_type": 4,
  "symbol": "EURUSD",
  "security_id": "56871",
  "currency": "USD",
  "description": "",
  "min_trade_vol": 100000.0,
  "max_trade_vol": 100000.0,
  "price_precision": 5,
  "timestamp_ms": 1771180550659
}
```

### Event: Initial Data Set Complete

Published on topic `session` when the LP has finished sending all initial data (instruments + positions).

```json
{
  "type": "INITIAL_DATA_SET_COMPLETE",
  "lp_id": "traderevolution",
  "positions_loaded": 2,
  "instruments_loaded": 6,
  "timestamp_ms": 1771180555000
}
```

### Event: Market Data Snapshot

Published on topic `md.snapshot.{SYMBOL}` for full book refreshes.

```json
{
  "type": "MARKET_DATA_SNAPSHOT",
  "lp_id": "traderevolution",
  "symbol": "EURUSD",
  "bids": [
    { "price": 1.08542, "size": 100000.0 }
  ],
  "asks": [
    { "price": 1.08545, "size": 100000.0 }
  ],
  "timestamp_ms": 1771180600123
}
```

### Event: Market Data Incremental

Published on topic `md.incremental` for book updates.

```json
{
  "type": "MARKET_DATA_INCREMENTAL",
  "lp_id": "traderevolution",
  "symbol": "EURUSD",
  "entries": [
    {
      "action": "CHANGE",
      "entry_type": "BID",
      "price": 1.08543,
      "size": 150000.0,
      "level": 0
    }
  ],
  "timestamp_ms": 1771180600456
}
```

**MDEntryAction Values**: `"NEW"`, `"CHANGE"`, `"DELETE"`

**MDEntryType Values**: `"BID"`, `"ASK"`, `"TRADE"`, `"OPEN"`, `"CLOSE"`, `"HIGH"`, `"LOW"`

### Event: Account Status Update 🟡

Published on topic `account` when account balance/equity/margin changes.

```json
{
  "type": "ACCOUNT_STATUS",
  "lp_id": "traderevolution",
  "account": "fix_connection_1_trd",
  "balance": 100000.00,
  "equity": 99850.25,
  "used_margin": 1500.00,
  "unrealized_pnl": -149.75,
  "timestamp_ms": 1771180700000
}
```

---

## 14. Adapter Architecture

**New in v2.0.** The FIX Bridge uses the **ILPAdapter** pattern to abstract LP-specific FIX protocol differences. Each LP's `provider_type` determines which adapter implementation handles message building and parsing.

### How It Works

1. LP config includes `provider_type` (e.g., `"traderevolution"`, `"cmc"`)
2. On `START_LP`, `AdapterFactory` creates the correct adapter: `TEAdapter`, `CMCAdapter`, etc.
3. `TradingSession` and `MarketDataSession` delegate FIX message construction/parsing to the adapter
4. All ZMQ commands (`PLACE_ORDER`, `SUBSCRIBE_MD`, etc.) work identically regardless of LP — the adapter handles differences internally

### Adapter Responsibilities

| Method | Purpose |
|--------|---------|
| `CustomizeLogon()` | Add LP-specific logon fields (TE: Password; CMC: Username, Brand, PartyID) |
| `BuildNewOrderSingle()` | Construct order message (TE: SecurityExchange+custom tags; CMC: PartyID groups) |
| `BuildCancelOrder()` | Construct cancel request |
| `BuildReplaceOrder()` | Construct modify request |
| `BuildClosePositionOrder()` | Close position (TE: OpenClose tag; CMC: SecurityType in NOS) |
| `BuildMarketDataRequest()` | Construct MD subscription (TE: direct symbol; CMC: SecurityIDSource+SecurityID) |
| `ParseSecurityDefinition()` | Extract instrument info from SecurityDef (d) messages |
| `ParseExecutionReport()` | Extract order/fill info from ExecReport (8) messages |
| `ParsePositionReport()` | Extract position info from PositionReport (AP) messages |
| `ParseTradeCaptureReport()` | Extract trade info from TCR (AE) messages |
| `ToLPSymbol()` / `FromLPSymbol()` | Symbol translation (e.g., `"EURUSD"` ↔ `"EUR/USD"`) |

### Supported Adapters

| `provider_type` | Adapter | Status | Notes |
|-----------------|---------|--------|-------|
| `traderevolution` | `TEAdapter` | 🟢 Production | Custom tags 18205/18206 (SL/TP), 20010-20016 (OpenClose/Position), cluster discovery |
| `cmc` | `CMCAdapter` | 🟢 Code-complete | SSL required, PartyID groups on logon/orders, SecurityIDSource for non-FX |
| `lmax` | `LMAXAdapter` | 🟡 Planned | Standard FIX 4.4, linked orders for SL/TP |

### Impact on Frontend

The adapter is transparent to the frontend. All API commands use the same request/response format regardless of which LP is targeted. LP-specific behavior is noted in the `capabilities` object returned by `GET_LP_STATUS` and `GET_LP_CAPABILITIES`.

When the frontend needs to display LP-specific information (e.g., symbol format differences), use the `canonical_symbol` field — it normalizes symbols across LPs (e.g., both TE's `"EURUSD"` and CMC's `"EUR/USD"` resolve to canonical `"EURUSD"`).

---

## 15. Error Reference

### Common Error Messages

| Error | Cause | Resolution |
|-------|-------|------------|
| `Missing lp_id` | Required parameter not provided | Include `lp_id` in params |
| `LP not found or no trading session: {id}` | LP not configured or not started | Check LP config, use `START_LP` |
| `Trading session not connected for LP: {id}` | Session is down | Wait for reconnect or use `START_LP` |
| `Failed to send order` | LP is stopped or session disconnected | Verify LP state with `GET_LP_STATUS`, then `START_LP` |
| `Failed to subscribe` | MD session not connected | Check MD session state in `GET_LP_STATUS` |
| `Symbol {X} not in LP capabilities` | Order validation failure | Check `GET_LP_CAPABILITIES` |
| `Quantity {N} exceeds max {M}` | Order exceeds risk limits | Reduce quantity |
| `Order type {T} not supported by LP` | LP doesn't support this type | Check `GET_LP_CAPABILITIES` |
| `Instrument not found: {symbol}` | Symbol not loaded | Check `GET_INSTRUMENTS`, refresh with `REQUEST_SECURITY_LIST` |
| `Position not found: {id}` | Position ID not in cache | Refresh with `REQUEST_POSITIONS` |
| `Unknown command type: {cmd}` | Invalid command name | Check documentation |

---

## 16. LP-Specific Notes

### TraderEvolution (TE)

**Provider type**: `traderevolution`
**FIX version**: FIX 4.4
**SSL**: Not required (sandbox)
**Symbol format**: No separators — `EURUSD`, `GBPUSD`, `XAUUSD`

**Custom Order Fields**:
- `stop_loss` → mapped to TE tag 18205
- `take_profit` → mapped to TE tag 18206
- `product_type` → mapped to TE tag 20017 (`"FOREX"` = 1, `"CFD"` = 2)
- `open_close` → FIX tag 77 (`"O"` = Open, `"C"` = Close)

**ClOrdID Format**: TE requires integer-only ClOrdIDs. The bridge generates compliant IDs automatically.

**Instrument Identification**: TE supports two modes:
- Standard: symbol (tag 55) + exchange (tag 207)
- Direct ID: `SecurityID` (tag 48) + `ExDestination` (tag 100) = 101

**Routes**: TE uses separate routes for trading and market data. Instruments may have multiple routes. The `trade_route` field in instrument info indicates the primary execution route.

**Market Data**: TE MarketData uses separate FIX session on a different port. Snapshots (MsgType W) and Incremental Refresh (MsgType X) are supported, with up to 20 depth levels.

**Session Management**: TE may reject connections to the wrong cluster node. If cluster discovery (tags 20005-20009) is enabled, the bridge will reconnect to the correct node automatically (planned).

### LMAX (Planned)

**Expected differences**: Standard FIX 4.4 with minimal custom tags. Uses standard SL/TP via linked orders rather than custom tags. No separate market data session — uses single session with MDReqID-based subscriptions.

### CMC Markets

**Provider type**: `cmc`
**FIX version**: FIX 4.4
**SSL**: Required (via stunnel or native TLS)
**Symbol format**: FX uses slashes — `EUR/USD`, `GBP/USD`. Non-FX uses `[N/A]` in tag 55 with SecurityIDSource (22) + SecurityID (48).

**Logon Requirements**: CMC requires additional fields on Logon:
- Tag 553: Username
- Tag 554: Password
- Tag 141: ResetSeqNumFlag = `Y` (mandatory)
- Tag 21001: Brand code (for RETAIL/PARTNER accounts)
- PartyID group (tag 453) with username

**Symbol Handling for non-FX**:
- Tag 55 = `[N/A]`
- Tag 22 = SecurityIDSource (`5`=RIC, `A`=Bloomberg, `4`=ISIN, `101`=CMC API Code)
- Tag 48 = SecurityID (e.g., `X-AARDJ` for CMC API Code)

**Position Close**: CMC uses `SecurityType` (tag 167) in the close order message rather than TE's OpenClose tag.

**Last Fragment**: CMC sends tag 893 (`LastFragment=Y`) on the final SecurityDefinition and PositionReport in a batch, allowing the bridge to know when all data has been received.

---

## 17. Data Types & Enums

### Side

| Value | Meaning |
|-------|---------|
| `"BUY"` | Buy/Long |
| `"SELL"` | Sell/Short |

### Order Type

| Value | FIX OrdType | Description |
|-------|-------------|-------------|
| `"MARKET"` | `1` | Execute at best available price |
| `"LIMIT"` | `2` | Execute at specified price or better |
| `"STOP"` | `3` | Trigger market order at specified price |
| `"STOP_LIMIT"` | `4` | Trigger limit order at specified price |

### Time In Force

| Value | FIX TIF | Description |
|-------|---------|-------------|
| `"GTC"` | `1` | Good Till Cancel |
| `"IOC"` | `3` | Immediate or Cancel |
| `"DAY"` | `0` | Valid for trading day only |
| `"FOK"` | `4` | Fill or Kill |
| `"GTD"` | `6` | Good Till Date (requires `expire_date`) |

### Position Side

| Value | Description |
|-------|-------------|
| `"LONG"` | `long_qty > 0`, `short_qty == 0` |
| `"SHORT"` | `short_qty > 0`, `long_qty == 0` |
| `"HEDGED"` | Both `long_qty > 0` and `short_qty > 0` |
| `"FLAT"` | Both zero |

### Timestamps

All timestamps (`*_ts` fields) are **Unix epoch milliseconds** (int64). Example: `1771180550659` = February 15, 2026, 18:15:50.659 UTC.

Convert in JavaScript:
```javascript
const date = new Date(timestamp_ms);
```

---

## 18. REST API Mapping

The following table maps ZMQ commands to the recommended REST endpoints on `nexrisk_service`. These REST routes proxy to the FIX Bridge via ZMQ internally.

| HTTP Method | REST Endpoint | ZMQ Command |
|-------------|---------------|-------------|
| **LP Management** | | |
| `GET` | `/api/v1/fix/status` | `GET_STATUS` |
| `GET` | `/api/v1/fix/lp/{lp_id}` | `GET_LP_STATUS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/capabilities` | `GET_LP_CAPABILITIES` |
| `POST` | `/api/v1/fix/lp/{lp_id}/start` | `START_LP` |
| `POST` | `/api/v1/fix/lp/{lp_id}/stop` | `STOP_LP` |
| `POST` | `/api/v1/fix/lp/{lp_id}/quarantine` | `QUARANTINE_LP` |
| `POST` | `/api/v1/fix/lp/{lp_id}/resume` | `RESUME_LP` |
| **Instruments** | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/instruments` | `GET_INSTRUMENTS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/instruments/{symbol}` | `GET_INSTRUMENT_INFO` |
| `GET` | `/api/v1/fix/lp/{lp_id}/instruments/summary` | `GET_INSTRUMENT_SUMMARY` |
| `POST` | `/api/v1/fix/lp/{lp_id}/instruments/refresh` | `REQUEST_SECURITY_LIST` |
| **Market Data** | | |
| `POST` | `/api/v1/fix/lp/{lp_id}/md/subscribe` | `SUBSCRIBE_MD` |
| `POST` | `/api/v1/fix/lp/{lp_id}/md/unsubscribe` | `UNSUBSCRIBE_MD` |
| `GET` | `/api/v1/fix/lp/{lp_id}/md/book/{symbol}` | `GET_BOOK` |
| `GET` | `/api/v1/fix/lp/{lp_id}/md/books` | `GET_ALL_BOOKS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/md/prices` | `GET_BEST_PRICES` |
| **Orders** | | |
| `POST` | `/api/v1/fix/lp/{lp_id}/orders` | `PLACE_ORDER` |
| `DELETE` | `/api/v1/fix/lp/{lp_id}/orders/{clord_id}` | `CANCEL_ORDER` |
| `PUT` | `/api/v1/fix/lp/{lp_id}/orders/{clord_id}` | `REPLACE_ORDER` |
| `GET` | `/api/v1/fix/lp/{lp_id}/orders/{clord_id}` | `GET_ORDER_INFO` |
| `GET` | `/api/v1/fix/lp/{lp_id}/orders/{clord_id}/state` | `GET_ORDER_STATE` |
| `GET` | `/api/v1/fix/lp/{lp_id}/orders?active=true` | `GET_ACTIVE_ORDERS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/orders` | `GET_ALL_ORDERS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/orders/{clord_id}/status` | `GET_ORDER_STATUS` 🟡 |
| **Positions** | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/positions` | `GET_POSITIONS` |
| `GET` | `/api/v1/fix/lp/{lp_id}/positions/{position_id}` | `GET_POSITION_INFO` |
| `GET` | `/api/v1/fix/lp/{lp_id}/positions/summary` | `GET_POSITION_SUMMARY` |
| `POST` | `/api/v1/fix/lp/{lp_id}/positions/refresh` | `REQUEST_POSITIONS` |
| `POST` | `/api/v1/fix/lp/{lp_id}/positions/{position_id}/close` | `CLOSE_POSITION` 🟢 |
| **Account** | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/account` | `GET_ACCOUNT_STATUS` 🟡 |
| `POST` | `/api/v1/fix/lp/{lp_id}/account/refresh` | `REQUEST_ACCOUNT_STATUS` 🟡 |
| **Trade History** | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/trades` | `GET_TRADE_HISTORY` 🟢 |
| `POST` | `/api/v1/fix/lp/{lp_id}/trades/refresh` | `REQUEST_TRADE_HISTORY` 🟢 |
| **FIX Audit Trail** *(new in v2.0)* | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/fix/messages` | `GET_FIX_MESSAGES` 🟡 |
| `GET` | `/api/v1/fix/lp/{lp_id}/fix/messages/order/{clord_id}` | `GET_FIX_MESSAGES_FOR_ORDER` 🟡 |
| `GET` | `/api/v1/fix/lp/{lp_id}/fix/session-log` | `GET_FIX_SESSION_LOG` 🟡 |
| **Routes** | | |
| `GET` | `/api/v1/fix/lp/{lp_id}/routes` | `GET_ROUTE_STATUS` 🟢 |
| **Administration** | | |
| `POST` | `/api/v1/fix/lp/{lp_id}/incidents` | `EXPORT_INCIDENT` |
| **WebSocket** | | |
| `WS` | `/ws/v1/fix/events` | ZMQ SUB stream |

### WebSocket Event Delivery

The WebSocket connection at `/ws/v1/fix/events` delivers all ZMQ PUB events in real time. The frontend can filter by topic on the client side:

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/v1/fix/events');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'EXECUTION_REPORT':
      updateOrderBlotter(data);
      break;
    case 'POSITION_REPORT':
      updatePositionGrid(data);
      break;
    case 'MARKET_DATA_SNAPSHOT':
      updatePricePanel(data);
      break;
    case 'SESSION_STATE_CHANGE':
      updateConnectivityBadge(data);
      break;
    case 'ACCOUNT_STATUS':
      updateAccountPanel(data);
      break;
  }
};
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | Implemented and tested |
| 🟡 | Planned — specification defined, implementation pending |

---

*Document maintained by NexRisk development team. For LP administration (config CRUD, credentials, connection testing), see the companion document: NexRisk FIX Bridge LP Administration API v1.0.*