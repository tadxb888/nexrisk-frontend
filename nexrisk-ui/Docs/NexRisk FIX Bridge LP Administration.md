# NexRisk FIX Bridge — LP Administration API v1.0

**Document Status**: Implemented — core endpoints marked 🟢 (verified working), future endpoints marked 🟡 (planned)

**Last Updated**: February 18, 2026

**Companion to**: [NexRisk FIX Bridge API Documentation v2.0](./NexRisk_FIX_Bridge_API_Documentation_v2.md)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Design Decisions](#2-design-decisions)
3. [Database Schema](#3-database-schema)
4. [LP Configuration CRUD](#4-lp-configuration-crud)
5. [Credential Management](#5-credential-management)
6. [Connection Testing](#6-connection-testing)
7. [Session Control](#7-session-control)
8. [Health & Monitoring](#8-health--monitoring)
9. [Audit Log](#9-audit-log)
10. [Real-Time Events](#10-real-time-events)
11. [REST API Mapping](#11-rest-api-mapping)
12. [Frontend Integration Guide](#12-frontend-integration-guide)
13. [Security Notes](#13-security-notes)
14. [Migration from Config File](#14-migration-from-config-file)
15. [Implementation Notes](#15-implementation-notes)

---

## 1. Overview

This document describes the **LP Administration API** — the management layer that enables frontend UI control over Liquidity Provider configurations. It extends the existing FIX Bridge API (which covers operational commands like placing orders and viewing positions) with CRUD operations for LP configs, credential security, and lifecycle management.

### What This Enables

- Add, edit, and remove LP configurations from the UI
- Securely manage FIX session credentials without direct server access
- Test LP connectivity before going live
- Monitor LP health with detailed diagnostics
- Support multi-LP environments with independent lifecycle control
- Full audit trail for all administrative actions

### Relationship to Existing API

The existing FIX Bridge API (v2.0) already provides session control commands (`START_LP`, `STOP_LP`, `QUARANTINE_LP`, `RESUME_LP`) and read-only status queries (`GET_STATUS`, `GET_LP_STATUS`, `GET_LP_CAPABILITIES`). This spec adds the configuration management layer that feeds those commands — you can't start an LP if you haven't configured one first.

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
└─────────────────┬───────────────────────────────────────┘
                  │ HTTP REST
┌─────────────────▼───────────────────────────────────────┐
│              nexrisk_service (:8080)                      │
│                                                           │
│  ┌──────────────────┐    ┌────────────────────────────┐  │
│  │  LP Admin API     │    │  FIX Bridge Proxy API       │  │
│  │  (THIS SPEC)      │    │  (Existing v2.0 doc)        │  │
│  │                    │    │                              │  │
│  │  • CRUD configs    │    │  • Orders, positions         │  │
│  │  • Credentials     │    │  • Market data               │  │
│  │  • Test connection  │    │  • Session control           │  │
│  └────────┬───────────┘    └──────────┬───────────────┘  │
│           │                            │                  │
│           ▼ ZMQ                        ▼ ZMQ              │
│    ┌──────────────────────────────────────────────┐      │
│    │          FIX Bridge Service                   │      │
│    │  CommandHandler → LPConfigRepository → PG     │      │
│    │  ConnectionTester (raw FIX handshake)          │      │
│    │  LPHealthAggregator (session diagnostics)      │      │
│    └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

**Architecture note**: All LP Admin commands flow through ZMQ to the FIX Bridge service, which owns the database connection and handles all CRUD, encryption, and session operations. This is consistent with the existing operational command architecture — `nexrisk_service` acts purely as an HTTP-to-ZMQ proxy.

### Configuration Flow

1. Admin creates LP config via REST API → stored in Postgres (via FIX Bridge)
2. Admin sets credentials via separate credential endpoint → encrypted at rest (AES-256-GCM)
3. Admin triggers `TEST_LP_CONNECTION` → FIX Bridge attempts raw FIX Logon handshake with LP
4. On success, admin triggers `START_LP` (existing API) → sessions go live
5. Runtime: `STOP_LP`, `QUARANTINE_LP`, `RESUME_LP` (existing API) for lifecycle
6. Config changes: `UPDATE_LP_CONFIG` → optional `RELOAD_LP` to apply without restart

---

## 2. Design Decisions

### Credential Security — Pragmatic Approach

We use **AES-256-GCM encryption at the application level** with a master key stored as an environment variable (`NEXRISK_LP_MASTER_KEY`). This provides adequate protection without the complexity of KMS, vault, or secret rotation infrastructure.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Encryption | AES-256-GCM | Industry standard, built into OpenSSL |
| Key storage | Environment variable | Simple, works with Docker/systemd, no external deps |
| Key format | 64 hex characters (32 bytes) | Validated on startup, rejected if wrong length |
| API exposure | Masked values only (`••••••`) | Credentials never leave the server in cleartext |
| Password updates | Separate endpoint | Audit trail, can't accidentally overwrite via config update |
| Certificate files | Base64 upload, stored encrypted | Self-contained, no filesystem path dependencies |
| Backend swappability | Encryption behind interface | Can migrate to KMS/Vault later without API changes |

### Config Storage — Postgres over Config Files

LP configurations move from `fix_bridge_config.json` to PostgreSQL. Benefits: UI-manageable, audit trail, multi-instance support, credential encryption at rest. The FIX Bridge reads configs from Postgres on startup and on `RELOAD_LP` commands.

### LP Identifier Convention

Each LP gets a unique `lp_id` (lowercase alphanumeric + hyphens, 3-32 chars, must start with a letter). This ID is used across both this spec and the existing FIX Bridge API. Examples: `traderevolution`, `lmax-prod`, `cmc-uat`.

---

## 3. Database Schema

All tables reside in the existing `risk` schema.

### Table: `risk.lp_configs`

Stores non-sensitive LP configuration. One row per LP.

```sql
CREATE TABLE risk.lp_configs (
    lp_id               VARCHAR(32) PRIMARY KEY,
    lp_name             VARCHAR(128) NOT NULL,
    provider_type       VARCHAR(32) NOT NULL,          -- 'traderevolution', 'lmax', 'cmc', etc.
    environment         VARCHAR(16) NOT NULL DEFAULT 'SANDBOX',  -- SANDBOX | UAT | PRODUCTION
    enabled             BOOLEAN NOT NULL DEFAULT false,
    auto_connect        BOOLEAN NOT NULL DEFAULT false, -- connect on service boot?

    -- Trading Session
    trading_host        VARCHAR(256) NOT NULL,
    trading_port        INTEGER NOT NULL,
    trading_sender_comp VARCHAR(64) NOT NULL,
    trading_target_comp VARCHAR(64) NOT NULL,
    trading_fix_version VARCHAR(8) NOT NULL DEFAULT 'FIX.4.4',
    trading_heartbeat   INTEGER NOT NULL DEFAULT 30,

    -- Market Data Session
    md_host             VARCHAR(256),
    md_port             INTEGER,
    md_sender_comp      VARCHAR(64),
    md_target_comp      VARCHAR(64),
    md_fix_version      VARCHAR(8) DEFAULT 'FIX.4.4',
    md_heartbeat        INTEGER DEFAULT 30,
    md_depth            INTEGER DEFAULT 1,

    -- Reconnection
    reconnect_enabled   BOOLEAN NOT NULL DEFAULT true,
    reconnect_interval  INTEGER NOT NULL DEFAULT 5,     -- seconds
    reconnect_max       INTEGER NOT NULL DEFAULT 10,    -- max attempts before giving up

    -- Provider-specific settings (flexible JSON)
    provider_settings   JSONB DEFAULT '{}',

    -- Metadata
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          VARCHAR(64),
    updated_by          VARCHAR(64)
);

CREATE INDEX idx_lp_configs_provider ON risk.lp_configs(provider_type);
CREATE INDEX idx_lp_configs_env ON risk.lp_configs(environment);
```

### Table: `risk.lp_credentials`

Stores encrypted credentials separately from config. All sensitive fields are AES-256-GCM encrypted.

```sql
CREATE TABLE risk.lp_credentials (
    lp_id               VARCHAR(32) PRIMARY KEY REFERENCES risk.lp_configs(lp_id) ON DELETE CASCADE,

    -- Trading session credentials (encrypted)
    trading_password    BYTEA,                          -- AES-256-GCM encrypted
    trading_password_iv BYTEA,                          -- GCM IV (12 bytes)

    -- Market data session credentials (encrypted)
    md_password         BYTEA,
    md_password_iv      BYTEA,

    -- TLS/SSL certificates (encrypted, base64 of cert file)
    tls_cert            BYTEA,
    tls_cert_iv         BYTEA,
    tls_key             BYTEA,
    tls_key_iv          BYTEA,
    tls_ca              BYTEA,
    tls_ca_iv           BYTEA,

    -- Metadata
    trading_pw_set_at   TIMESTAMPTZ,
    md_pw_set_at        TIMESTAMPTZ,
    tls_set_at          TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by          VARCHAR(64)
);
```

### Table: `risk.lp_audit_log`

Tracks all configuration changes for compliance.

```sql
CREATE TABLE risk.lp_audit_log (
    id                  BIGSERIAL PRIMARY KEY,
    lp_id               VARCHAR(32) NOT NULL,
    action              VARCHAR(32) NOT NULL,           -- CREATE, UPDATE, DELETE, CRED_UPDATE, CONNECT_TEST, etc.
    actor               VARCHAR(64),
    details             JSONB,                          -- what changed (never contains cleartext secrets)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lp_audit_lp ON risk.lp_audit_log(lp_id);
CREATE INDEX idx_lp_audit_time ON risk.lp_audit_log(created_at);
```

---

## 4. LP Configuration CRUD

### CREATE_LP_CONFIG 🟢

Register a new Liquidity Provider configuration. Does **not** connect — just persists the config.

**Request**:
```json
{
  "type": "CREATE_LP_CONFIG",
  "params": {
    "lp_id": "lmax-prod",
    "lp_name": "LMAX Production",
    "provider_type": "lmax",
    "environment": "PRODUCTION",
    "enabled": false,
    "auto_connect": false,
    "trading_session": {
      "host": "fix.lmax.com",
      "port": 443,
      "sender_comp_id": "NEXRISK_001",
      "target_comp_id": "LMXBLP",
      "fix_version": "FIX.4.4",
      "heartbeat_interval": 30
    },
    "md_session": {
      "host": "md.lmax.com",
      "port": 443,
      "sender_comp_id": "NEXRISK_MD_001",
      "target_comp_id": "LMXBMD",
      "fix_version": "FIX.4.4",
      "heartbeat_interval": 30,
      "depth": 5
    },
    "reconnection": {
      "enabled": true,
      "interval_seconds": 5,
      "max_attempts": 10
    },
    "provider_settings": {
      "route_id": "FX",
      "product_type": "SPOT"
    },
    "notes": "LMAX production feed - approved by compliance 2026-02-17"
  }
}
```

**Response (success)**:
```json
{
  "success": true,
  "data": {
    "lp_id": "lmax-prod",
    "lp_name": "LMAX Production",
    "provider_type": "lmax",
    "environment": "PRODUCTION",
    "enabled": false,
    "state": "UNCONFIGURED",
    "created_at": 1771286400000,
    "message": "LP configuration created. Set credentials via UPDATE_LP_CREDENTIALS before connecting."
  }
}
```

**Validation Rules**:
- `lp_id`: 3-32 chars, lowercase alphanumeric + hyphens, must start with a letter, must be unique
- `provider_type`: required, stored as metadata for future adapter selection
- `trading_session.host`, `trading_session.port`, `sender_comp_id`, `target_comp_id`: required
- `md_session`: optional (some LPs deliver MD on the trading session)

**Error Cases**:

| Error | Code | Condition |
|-------|------|-----------|
| `LP_ALREADY_EXISTS` | 409 | `lp_id` already registered |
| `INVALID_LP_ID` | 400 | `lp_id` format violation |
| `MISSING_FIELD` | 400 | Required field not provided |

---

### GET_LP_CONFIG 🟢

Returns full configuration for an LP, with credentials **masked**.

**Request**:
```json
{ "type": "GET_LP_CONFIG", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "lp_name": "TraderEvolution Sandbox",
    "provider_type": "traderevolution",
    "environment": "SANDBOX",
    "enabled": true,
    "auto_connect": true,
    "trading_session": {
      "host": "sandbox-fixk1.traderevolution.com",
      "port": 9882,
      "sender_comp_id": "fix_connection_1_trd",
      "target_comp_id": "TEORDER",
      "fix_version": "FIX.4.4",
      "heartbeat_interval": 30
    },
    "md_session": {
      "host": "sandbox-fixk1.traderevolution.com",
      "port": 9883,
      "sender_comp_id": "fix_connection_1",
      "target_comp_id": "TEPRICE",
      "fix_version": "FIX.4.4",
      "heartbeat_interval": 30,
      "depth": 1
    },
    "reconnection": {
      "enabled": true,
      "interval_seconds": 5,
      "max_attempts": 10
    },
    "provider_settings": {
      "route_name": "TRADE",
      "product_type": "DELIVERABLE"
    },
    "credentials": {
      "trading_password": "••••••",
      "trading_password_set_at": 1771200000000,
      "md_password": "••••••",
      "md_password_set_at": 1771200000000,
      "tls_configured": false,
      "tls_set_at": null
    },
    "notes": "Primary sandbox for development and testing",
    "created_at": 1771100000000,
    "updated_at": 1771200000000,
    "created_by": "admin",
    "updated_by": "admin"
  }
}
```

**Key points**:
- Passwords are **always** returned as `"••••••"` — never cleartext
- `*_set_at` timestamps let the UI show whether credentials are configured and when they were last changed
- `tls_configured` is a boolean flag indicating whether TLS certs are uploaded

---

### LIST_LP_CONFIGS 🟢

Returns summary of all configured LPs.

**Request**:
```json
{ "type": "LIST_LP_CONFIGS", "params": {} }
```

Optional filters:
```json
{
  "type": "LIST_LP_CONFIGS",
  "params": {
    "environment": "PRODUCTION",
    "enabled": true,
    "provider_type": "traderevolution"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "total": 2,
    "lps": [
      {
        "lp_id": "traderevolution",
        "lp_name": "TraderEvolution Sandbox",
        "provider_type": "traderevolution",
        "environment": "SANDBOX",
        "enabled": true,
        "auto_connect": true,
        "credentials_set": true,
        "created_at": 1771100000000,
        "updated_at": 1771200000000
      },
      {
        "lp_id": "lmax-prod",
        "lp_name": "LMAX Production",
        "provider_type": "lmax",
        "environment": "PRODUCTION",
        "enabled": false,
        "auto_connect": false,
        "credentials_set": false,
        "created_at": 1771286400000,
        "updated_at": 1771286400000
      }
    ]
  }
}
```

---

### UPDATE_LP_CONFIG 🟢

Update non-credential configuration fields. If the LP is currently connected, changes take effect on next `RELOAD_LP` or `STOP_LP` → `START_LP` cycle.

**Request**:
```json
{
  "type": "UPDATE_LP_CONFIG",
  "params": {
    "lp_id": "traderevolution",
    "lp_name": "TraderEvolution Sandbox v2",
    "trading_session": {
      "heartbeat_interval": 15
    },
    "md_session": {
      "depth": 5
    },
    "reconnection": {
      "max_attempts": 20
    },
    "notes": "Updated heartbeat and MD depth for testing"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "updated_fields": ["lp_name", "trading_session.heartbeat_interval", "md_session.depth", "reconnection.max_attempts", "notes"],
    "message": "LP config updated"
  }
}
```

**Rules**:
- Partial updates supported — only provided fields are modified
- `lp_id` and `provider_type` cannot be changed after creation (immutable)
- Credentials are **never** accepted through this endpoint — use `UPDATE_LP_CREDENTIALS`

**Error Cases**:

| Error | Code | Condition |
|-------|------|-----------|
| `LP_NOT_FOUND` | 404 | `lp_id` doesn't exist |
| `IMMUTABLE_FIELD` | 400 | Attempting to change `lp_id` or `provider_type` |
| `VALIDATION_ERROR` | 400 | Invalid value for a field |

---

### DELETE_LP_CONFIG 🟢

Remove an LP configuration entirely.

**Request**:
```json
{
  "type": "DELETE_LP_CONFIG",
  "params": {
    "lp_id": "lmax-prod"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "lmax-prod",
    "message": "LP config deleted"
  }
}
```

**Safety rules**:
- If LP is currently loaded/connected, it is stopped and unloaded before deletion
- Cascades: deletes from `lp_configs`, `lp_credentials`, and logs a `DELETE` entry in `lp_audit_log`
- Does **not** delete audit log entries (retained for compliance)

**Error Cases**:

| Error | Code | Condition |
|-------|------|-----------|
| `LP_NOT_FOUND` | 404 | `lp_id` doesn't exist |

---

## 5. Credential Management

Credentials are managed through a **separate endpoint** from config CRUD. This provides a clear audit trail and prevents accidental credential overwrites during config updates.

### UPDATE_LP_CREDENTIALS 🟢

Set or update FIX session passwords and TLS certificates.

**Request — Set passwords**:
```json
{
  "type": "UPDATE_LP_CREDENTIALS",
  "params": {
    "lp_id": "traderevolution",
    "trading_password": "my_trading_pw_123",
    "md_password": "my_md_pw_456"
  }
}
```

**Request — Set TLS certificates** (base64-encoded PEM files):
```json
{
  "type": "UPDATE_LP_CREDENTIALS",
  "params": {
    "lp_id": "lmax-prod",
    "trading_password": "lmax_pw_789",
    "tls_cert": "LS0tLS1CRUdJTi...<base64>...",
    "tls_key": "LS0tLS1CRUdJTi...<base64>...",
    "tls_ca": "LS0tLS1CRUdJTi...<base64>..."
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "updated_fields": ["trading_password", "md_password"],
    "message": "Credentials updated"
  }
}
```

**Encryption flow**:
1. Cleartext password received over HTTPS
2. Server generates random 12-byte IV
3. AES-256-GCM encrypt with master key from `NEXRISK_LP_MASTER_KEY` env var
4. Store encrypted blob + IV in `risk.lp_credentials`
5. Cleartext immediately zeroed from memory

**Rules**:
- Only provided fields are updated (partial update supported)
- Passwords have no minimum length enforced by us (LP determines requirements)
- TLS fields must all be provided together (cert + key + ca) or not at all
- If LP is connected, credentials update in the database but the active session continues with old credentials until reconnected

---

### GET_CREDENTIAL_STATUS 🟢

Check whether credentials are configured (without revealing them).

**Request**:
```json
{ "type": "GET_CREDENTIAL_STATUS", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "trading_password_set": true,
    "trading_password_set_at": 1771200000000,
    "md_password_set": true,
    "md_password_set_at": 1771200000000,
    "tls_configured": false,
    "tls_set_at": null
  }
}
```

This is a lightweight check for the frontend to render credential status indicators (green checkmarks, warning icons) without making a full `GET_LP_CONFIG` call.

---

## 6. Connection Testing

### TEST_LP_CONNECTION 🟢

Attempt a FIX Logon handshake with the LP using the stored config and credentials, then immediately disconnect. Used to validate configuration before going live. Does **not** change the LP's operational state.

**Implementation**: Uses raw TCP sockets and hand-crafted FIX protocol messages (bypasses QuickFIX/FIX8) for a lightweight, standalone connectivity test: DNS resolve → TCP connect → FIX Logon → parse response → FIX Logout → close.

**Request**:
```json
{
  "type": "TEST_LP_CONNECTION",
  "params": {
    "lp_id": "traderevolution",
    "test_scope": "BOTH"
  }
}
```

`test_scope` values: `TRADING_ONLY`, `MD_ONLY`, `BOTH` (default)

**Response (success)**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "test_scope": "BOTH",
    "trading_session": {
      "result": "OK",
      "latency_ms": 145,
      "fix_logon_accepted": true,
      "server_comp_id": "TEORDER",
      "message": "Logon successful, logout completed cleanly"
    },
    "md_session": {
      "result": "OK",
      "latency_ms": 132,
      "fix_logon_accepted": true,
      "server_comp_id": "TEPRICE",
      "message": "Logon successful, logout completed cleanly"
    },
    "overall": "PASS",
    "tested_at": 1771290500000
  }
}
```

**Response (failure)**:
```json
{
  "success": true,
  "data": {
    "lp_id": "lmax-prod",
    "test_scope": "BOTH",
    "trading_session": {
      "result": "FAILED",
      "latency_ms": null,
      "fix_logon_accepted": false,
      "error": "FIX Logon rejected: Invalid SenderCompID",
      "error_code": "LOGON_REJECTED",
      "message": "Check SenderCompID, TargetCompID, and password."
    },
    "md_session": {
      "result": "SKIPPED",
      "message": "MD session not configured for this LP"
    },
    "overall": "FAIL",
    "tested_at": 1771290500000
  }
}
```

**Result values**: `OK`, `FAILED`, `TIMEOUT`, `SKIPPED`

**Error codes for failures**:

| Error Code | Meaning |
|------------|---------|
| `TCP_CONNECT_FAILED` | Cannot reach host:port (DNS, firewall, host down) |
| `TLS_HANDSHAKE_FAILED` | TLS negotiation failed (cert issue) |
| `LOGON_REJECTED` | FIX Logon message was rejected by LP |
| `LOGON_TIMEOUT` | Logon sent but no response within 10s |
| `CREDENTIALS_MISSING` | No credentials stored for this LP |
| `CONFIG_INVALID` | Required config fields are missing/malformed |

**Notes**:
- The ZMQ response may take up to 15 seconds (two sessions × socket timeout)
- A test audit entry is written to `lp_audit_log` with the result
- If MD session fails but trading succeeds, overall is `PARTIAL`
- If MD session is not configured, it is `SKIPPED` (not a failure)

---

## 7. Session Control

These commands extend the existing `START_LP` / `STOP_LP` workflow with config-aware operations.

### RELOAD_LP 🟢

Apply configuration changes to a running LP without a full stop/start cycle. Performs a graceful session restart: logout → re-read config from Postgres → logon with new settings.

**Request**:
```json
{ "type": "RELOAD_LP", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "message": "LP reloaded"
  }
}
```

**Behavior**:
- Reads latest config + credentials from Postgres
- Graceful logout (FIX Logout message sent)
- Reconnect with new parameters
- If reconnection fails, LP enters `RECONNECTING` state per normal reconnection logic
- Active orders are **not** cancelled — they persist on the LP side
- **Requires the LP to be loaded/running** — returns failure if LP is not in the LPRegistry (see [Implementation Notes](#15-implementation-notes))

### ENABLE_LP / DISABLE_LP 🟡

Toggle the `enabled` flag. A disabled LP will not auto-connect on service restart and cannot be started manually.

**Request**:
```json
{ "type": "ENABLE_LP", "params": { "lp_id": "lmax-prod" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "lmax-prod",
    "enabled": true,
    "message": "LP enabled. Use START_LP to connect."
  }
}
```

`DISABLE_LP` also stops the LP if currently connected (implicit `STOP_LP`).

**Note**: These are planned for a future release. Currently, the `enabled` flag can be toggled via `UPDATE_LP_CONFIG` with `{"enabled": true/false}`.

---

## 8. Health & Monitoring

### GET_LP_HEALTH 🟢

Returns comprehensive health diagnostics for an LP. Richer than `GET_LP_STATUS` — includes latency metrics, error rates, and recent issues.

**Request**:
```json
{ "type": "GET_LP_HEALTH", "params": { "lp_id": "traderevolution" } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "state": "CONNECTED",
    "uptime_seconds": 7200,
    "last_connected_at": 1771283200000,
    "trading_session": {
      "state": "LOGGED_ON",
      "heartbeat_latency_ms": 12,
      "last_heartbeat_at": 1771290500000,
      "messages_sent": 1452,
      "messages_received": 3891,
      "last_error": null,
      "reconnect_count": 0
    },
    "md_session": {
      "state": "LOGGED_ON",
      "heartbeat_latency_ms": 8,
      "last_heartbeat_at": 1771290500000,
      "subscriptions_active": 3,
      "ticks_received_1m": 247,
      "last_tick_at": 1771290499000,
      "stale_threshold_ms": 5000,
      "is_stale": false,
      "reconnect_count": 0
    },
    "errors_24h": [],
    "warnings": []
  }
}
```

**Warning examples**:
```json
{
  "warnings": [
    {
      "code": "MD_STALE",
      "message": "No market data ticks received for 8.2 seconds",
      "since": 1771290492000
    },
    {
      "code": "HIGH_LATENCY",
      "message": "Heartbeat latency 450ms (threshold: 200ms)",
      "value_ms": 450
    }
  ]
}
```

### LIST_LP_HEALTH 🟢

Batch health summary for all LPs — designed for dashboard overview panels.

**Request**:
```json
{ "type": "LIST_LP_HEALTH", "params": {} }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lps": [
      {
        "lp_id": "traderevolution",
        "state": "CONNECTED",
        "health": "HEALTHY",
        "trading_state": "LOGGED_ON",
        "md_state": "LOGGED_ON",
        "heartbeat_latency_ms": 12,
        "uptime_seconds": 7200,
        "warnings_count": 0,
        "errors_24h_count": 0
      },
      {
        "lp_id": "lmax-prod",
        "state": "DISCONNECTED",
        "health": "UNCONFIGURED",
        "trading_state": "DISCONNECTED",
        "md_state": "DISCONNECTED",
        "heartbeat_latency_ms": null,
        "uptime_seconds": 0,
        "warnings_count": 0,
        "errors_24h_count": 0
      }
    ]
  }
}
```

**Health values**:

| Health | Meaning |
|--------|---------|
| `HEALTHY` | Connected, both sessions good, no warnings |
| `DEGRADED` | Connected but with warnings (latency, stale data, one session down) |
| `ERROR` | Connected but experiencing errors |
| `DISCONNECTED` | Not connected (may be intentional) |
| `QUARANTINED` | Manually disabled |
| `UNCONFIGURED` | Config exists but credentials not set or never connected |

---

## 9. Audit Log

### GET_LP_AUDIT_LOG 🟢

Retrieve recent audit log entries for an LP. All administrative actions are automatically logged.

**Request**:
```json
{ "type": "GET_LP_AUDIT_LOG", "params": { "lp_id": "traderevolution", "limit": 50 } }
```

**Response**:
```json
{
  "success": true,
  "data": {
    "lp_id": "traderevolution",
    "count": 3,
    "entries": [
      {
        "id": 42,
        "action": "CONNECT_TEST",
        "actor": "system",
        "details": {
          "test_scope": "BOTH",
          "overall": "PASS",
          "trading_result": "OK",
          "md_result": "OK",
          "trading_latency_ms": 145,
          "md_latency_ms": 132
        },
        "created_at": 1771290500000
      },
      {
        "id": 41,
        "action": "CRED_UPDATE",
        "actor": "api",
        "details": {
          "updated_fields": ["trading_password", "md_password"]
        },
        "created_at": 1771290000000
      },
      {
        "id": 40,
        "action": "CREATE",
        "actor": "api",
        "details": {
          "lp_id": "traderevolution",
          "provider_type": "traderevolution"
        },
        "created_at": 1771286400000
      }
    ]
  }
}
```

**Action types**:

| Action | Trigger |
|--------|---------|
| `CREATE` | LP config created |
| `UPDATE` | LP config updated (details include changed fields) |
| `DELETE` | LP config deleted |
| `CRED_UPDATE` | Credentials updated (never logs cleartext values) |
| `CONNECT_TEST` | Connection test executed (includes results) |
| `RELOAD` | LP config reloaded |

---

## 10. Real-Time Events

These events are published on the existing ZMQ PUB/SUB stream (topic prefix: `lp.admin`).

### Event: LP Config Changed

Published when any LP configuration is created, updated, or deleted.

**Topic**: `lp.admin.config`

```json
{
  "type": "LP_CONFIG_CHANGED",
  "lp_id": "traderevolution",
  "action": "UPDATED",
  "changed_fields": ["trading_session.heartbeat_interval", "md_session.depth"],
  "requires_reload": true,
  "actor": "admin",
  "timestamp": 1771290000000
}
```

`action` values: `CREATED`, `UPDATED`, `DELETED`, `CREDENTIALS_UPDATED`

### Event: LP Connection Test Result

Published when a connection test completes.

**Topic**: `lp.admin.test`

```json
{
  "type": "LP_CONNECTION_TEST",
  "lp_id": "traderevolution",
  "overall": "PASS",
  "trading_result": "OK",
  "md_result": "OK",
  "tested_at": 1771290500000
}
```

### Event: LP Health Warning

Published when an LP health state changes or a new warning is detected.

**Topic**: `lp.admin.health`

```json
{
  "type": "LP_HEALTH_CHANGE",
  "lp_id": "traderevolution",
  "previous_health": "HEALTHY",
  "current_health": "DEGRADED",
  "warnings": [
    { "code": "MD_STALE", "message": "No market data for 8.2 seconds" }
  ],
  "timestamp": 1771290500000
}
```

---

## 11. REST API Mapping

All admin REST endpoints are served by `nexrisk_service` on port 8080, which proxies to the FIX Bridge via ZMQ. The `lp_id` in URL paths must match the format: `[a-z0-9][a-z0-9\-]{2,31}`.

| HTTP Method | REST Endpoint | ZMQ Command | Status |
|-------------|---------------|-------------|--------|
| **LP Configuration CRUD** | | | |
| `POST` | `/api/v1/fix/admin/lp` | `CREATE_LP_CONFIG` | 🟢 |
| `GET` | `/api/v1/fix/admin/lp` | `LIST_LP_CONFIGS` | 🟢 |
| `GET` | `/api/v1/fix/admin/lp/{lp_id}` | `GET_LP_CONFIG` | 🟢 |
| `PUT` | `/api/v1/fix/admin/lp/{lp_id}` | `UPDATE_LP_CONFIG` | 🟢 |
| `DELETE` | `/api/v1/fix/admin/lp/{lp_id}` | `DELETE_LP_CONFIG` | 🟢 |
| **Credentials** | | | |
| `PUT` | `/api/v1/fix/admin/lp/{lp_id}/credentials` | `UPDATE_LP_CREDENTIALS` | 🟢 |
| `GET` | `/api/v1/fix/admin/lp/{lp_id}/credentials/status` | `GET_CREDENTIAL_STATUS` | 🟢 |
| **Connection Testing** | | | |
| `POST` | `/api/v1/fix/admin/lp/{lp_id}/test` | `TEST_LP_CONNECTION` | 🟢 |
| **Session Control** | | | |
| `POST` | `/api/v1/fix/admin/lp/{lp_id}/reload` | `RELOAD_LP` | 🟢 |
| **Audit** | | | |
| `GET` | `/api/v1/fix/admin/lp/{lp_id}/audit` | `GET_LP_AUDIT_LOG` | 🟢 |
| **Health** | | | |
| `GET` | `/api/v1/fix/admin/lp/{lp_id}/health` | `GET_LP_HEALTH` | 🟢 |
| `GET` | `/api/v1/fix/admin/health` | `LIST_LP_HEALTH` | 🟢 |

**Total: 12 endpoints implemented** (all verified working February 18, 2026)

**Planned (not yet implemented)**:

| HTTP Method | REST Endpoint | ZMQ Command | Status |
|-------------|---------------|-------------|--------|
| `POST` | `/api/v1/fix/admin/lp/{lp_id}/enable` | `ENABLE_LP` | 🟡 |
| `POST` | `/api/v1/fix/admin/lp/{lp_id}/disable` | `DISABLE_LP` | 🟡 |

**Note**: All admin endpoints are under `/api/v1/fix/admin/` to separate them from the operational endpoints (`/api/v1/fix/lp/`). This supports applying different auth/RBAC policies in the future (e.g., only admins can manage configs, but traders can view status).

---

## 12. Frontend Integration Guide

### LP Management Page — Suggested Layout

```
┌─────────────────────────────────────────────────────────────┐
│  LP Management                                    [+ Add LP] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ 🟢 TraderEvolution Sandbox        SANDBOX   CONNECTED   │ │
│  │    traderevolution | Trading: LOGGED_ON | MD: LOGGED_ON  │ │
│  │    Latency: 12ms | Uptime: 2h 00m                       │ │
│  │    [Configure] [Credentials] [Test] [Stop] [Health]      │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ⚪ LMAX Production                PRODUCTION DISCONNECTED│ │
│  │    lmax-prod | Credentials: ⚠️ Not Set                   │ │
│  │    [Configure] [Credentials] [Test] [Enable] [Delete]    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Typical Workflows

**Add a new LP**:
1. `POST /api/v1/fix/admin/lp` — create config
2. `PUT /api/v1/fix/admin/lp/{lp_id}/credentials` — set passwords
3. `POST /api/v1/fix/admin/lp/{lp_id}/test` — verify connectivity
4. `PUT /api/v1/fix/admin/lp/{lp_id}` — set `enabled: true`
5. `POST /api/v1/fix/lp/{lp_id}/start` — connect (existing API)

**Update credentials for running LP**:
1. `PUT /api/v1/fix/admin/lp/{lp_id}/credentials` — update passwords
2. `POST /api/v1/fix/admin/lp/{lp_id}/reload` — apply without full restart

**Remove an LP**:
1. `POST /api/v1/fix/lp/{lp_id}/stop` — disconnect (existing API)
2. `DELETE /api/v1/fix/admin/lp/{lp_id}` — remove config

### Data Polling Recommendations

| Data | Poll Interval | Endpoint | Notes |
|------|---------------|----------|-------|
| LP list with states | 30s | `LIST_LP_CONFIGS` | Main LP management table |
| Health overview | 10s | `LIST_LP_HEALTH` | Dashboard health badges |
| Individual LP detail | On-demand | `GET_LP_CONFIG` | Config edit modal |
| Credential status | On-demand | `GET_CREDENTIAL_STATUS` | Credential form |

For real-time state changes, subscribe to the WebSocket at `/ws/v1/fix/events` and filter for `lp.admin.*` topics.

---

## 13. Security Notes

### Master Key Management

The encryption master key (`NEXRISK_LP_MASTER_KEY`) must be:
- Exactly 64 hex characters (32 bytes / 256 bits)
- Set as an environment variable on the server (not in config files)
- Identical across all service instances (if running multiple)
- Rotated by: generate new key → re-encrypt all credentials → swap env var → restart

**Key generation** (PowerShell):
```powershell
$key = -join ((1..32) | ForEach-Object { "{0:x2}" -f (Get-Random -Max 256) })
[Environment]::SetEnvironmentVariable("NEXRISK_LP_MASTER_KEY", $key, "User")
```

**Key generation** (Linux):
```bash
openssl rand -hex 32
export NEXRISK_LP_MASTER_KEY=<output>
```

**Example** (systemd):
```ini
[Service]
Environment="NEXRISK_LP_MASTER_KEY=a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0"
```

**Example** (Docker):
```yaml
environment:
  - NEXRISK_LP_MASTER_KEY=a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0
```

**Key loss**: If the master key is lost, all encrypted credentials become unrecoverable. Passwords must be re-entered through the API. Store the key in a secure recovery document accessible to authorized personnel.

### What's Encrypted

| Field | Encrypted | Rationale |
|-------|-----------|-----------|
| FIX passwords | ✅ Yes | Authentication secrets |
| TLS certificates/keys | ✅ Yes | Private key material |
| Host/port | ❌ No | Non-secret, needed for diagnostics |
| SenderCompID/TargetCompID | ❌ No | Non-secret, needed for session identification |
| Provider settings | ❌ No | Operational parameters, not secrets |

### Future Upgrades Path

When enterprise clients require it, the encryption backend can be swapped:

| Current | Upgrade Path |
|---------|-------------|
| AES-256-GCM with env var key | AWS KMS envelope encryption |
| Environment variable | AWS Secrets Manager / HashiCorp Vault |
| No rotation | Automated key rotation with dual-key overlap |
| Application-level | Hardware Security Module (HSM) |

The API contract (masked credentials, separate credential endpoint, status checks) remains unchanged regardless of backend.

---

## 14. Migration from Config File

### One-Time Migration

Existing `fix_bridge_config.json` configurations need to be migrated to Postgres. A migration script will:

1. Read the existing JSON config file
2. Parse LP configurations
3. Insert into `risk.lp_configs` and `risk.lp_credentials`
4. Encrypt credentials with the master key
5. Verify by reading back and decrypting
6. Rename the original file to `fix_bridge_config.json.migrated`

**Migration command** (planned):
```bash
./fixbridge_service.exe --migrate-config --config fix_bridge_config.json
```

### Backward Compatibility

During the transition period:
- If Postgres has LP configs → use those (preferred)
- If Postgres is empty AND config file exists → use config file (legacy mode)
- If both exist → Postgres takes precedence, log a warning

This ensures the service can start even if the migration hasn't been run yet.

---

## 15. Implementation Notes

### Verified Endpoint Summary

All 12 REST endpoints were verified working on February 18, 2026 against the TraderEvolution sandbox environment. The test suite creates a temporary LP (`test-lp`), exercises all CRUD operations, sets credentials, runs a connection test, and cleans up.

### Known Behaviors

**RELOAD_LP requires a running LP**: The `RELOAD_LP` command only works on LPs that are currently loaded into the LPRegistry (i.e., have active or recently-active FIX sessions). If the LP exists only in the database but has never been started, `RELOAD_LP` returns `"Failed to reload LP"`. This is correct — use `START_LP` to initially load an LP.

**TEST_LP_CONNECTION is independent of LP state**: Connection testing creates a standalone TCP socket and performs a raw FIX handshake. It works regardless of whether the LP is loaded, started, or stopped. The test does not affect the LP's operational state.

**DELETE cascades automatically**: Deleting an LP config automatically stops and unloads the LP from the registry (if running), deletes credentials (via `ON DELETE CASCADE`), and logs the action. Audit log entries are preserved.

### Component Architecture

| Component | File | Responsibility |
|-----------|------|----------------|
| `LPAdminEndpoint` | `src/fix/LPAdminEndpoint.cpp` | HTTP REST → ZMQ proxy (12 routes) |
| `CommandHandler` | `src/fixbridge/publisher/CommandHandler.cpp` | ZMQ command dispatch (13 LP admin handlers) |
| `LPConfigRepository` | `src/fixbridge/storage/LPConfigRepository.cpp` | Database CRUD + credential encryption |
| `ConnectionTester` | `src/fixbridge/session/ConnectionTester.cpp` | Raw TCP + FIX Logon/Logout handshake |
| `LPHealthAggregator` | `src/fixbridge/health/LPHealthAggregator.cpp` | Session diagnostics aggregation |
| `LPAuditLogger` | `src/fixbridge/storage/LPAuditLogger.cpp` | Audit trail writer |
| `CredentialEncryptor` | `src/fixbridge/security/CredentialEncryptor.cpp` | AES-256-GCM encrypt/decrypt |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🟢 | Implemented and tested |
| 🟡 | Planned — specification defined, implementation pending |

---

*This document is a companion to the NexRisk FIX Bridge API Documentation v2.0. For operational commands (orders, positions, market data), refer to the main document. For LP configuration management, use this spec.*