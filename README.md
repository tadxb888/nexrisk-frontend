# NexRisk BFF (Backend-for-Frontend)

A TypeScript/Fastify-based API gateway for the NexRisk trading risk management UI.

## Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│                     │     │                     │     │                     │
│   Browser / UI      │────▶│   NexRisk BFF       │────▶│   NexRisk C++ API   │
│   (React + Vite)    │     │   (This Service)    │     │   localhost:8090    │
│                     │     │                     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
        │                           │
        │ WebSocket                 │ REST + Internal Events
        └───────────────────────────┘
```

## Features

- **Security Boundary**: Hides internal services (LLM, classifiers, ZeroMQ) from the browser
- **RBAC Enforcement**: Role-based access control with capability checks
- **Audit Logging**: All write operations are logged for compliance
- **WebSocket Multiplexing**: Single WS connection with topic-based subscriptions
- **Request Aggregation**: Reduces chatty UI calls
- **Error Handling**: Graceful fallbacks and structured error responses

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start development server (with hot reload)
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Configuration

All configuration is via environment variables. See `.env.example` for all options.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | BFF server port |
| `HOST` | 127.0.0.1 | Bind address (loopback for security) |
| `NEXRISK_API_URL` | http://127.0.0.1:8090 | C++ API URL |
| `AUTH_ENABLED` | false | Enable OIDC authentication |
| `LOG_LEVEL` | info | Logging verbosity |

## API Endpoints

### Health & Stats
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | BFF health (quick) |
| GET | `/api/health` | Full health with backend status |
| GET | `/api/stats` | System statistics |

### Traders
| Method | Path | Capability | Description |
|--------|------|------------|-------------|
| GET | `/api/traders` | `traders.read` | List all traders |
| GET | `/api/traders/:login` | `traders.read` | Get trader details |
| GET | `/api/traders/:login/dashboard` | `traders.details` | Full dashboard |
| GET | `/api/traders/:login/history` | `traders.details` | Trade history |
| GET | `/api/traders/:login/features` | `traders.details` | Feature vectors |

### Alerts
| Method | Path | Capability | Description |
|--------|------|------------|-------------|
| GET | `/api/alerts` | `alerts.read` | List alerts |
| GET | `/api/alerts/:alertId` | `alerts.read` | Get alert details |
| PUT | `/api/alerts/:alertId/acknowledge` | `alerts.ack` | Acknowledge alert |
| PUT | `/api/alerts/:alertId/resolve` | `alerts.resolve` | Resolve alert |

### Explanations (Hybrid LLM)
| Method | Path | Capability | Description |
|--------|------|------------|-------------|
| GET | `/api/explanations/trader/:login` | `traders.details` | Get explanations |
| POST | `/api/explanations/trader/:login/generate` | `explain.generate` | Generate Claude explanation |
| GET | `/api/explanations/costs` | `llm.status` | Cost tracking |
| GET | `/api/explanations/queue` | `llm.status` | Async queue status |
| GET | `/api/llm/status` | `llm.status` | LLM provider status |

### Positions & Orders
| Method | Path | Capability | Description |
|--------|------|------------|-------------|
| GET | `/api/positions` | `positions.read` | All open positions |
| GET | `/api/positions/:login` | `positions.read` | Trader positions |
| GET | `/api/orders` | `orders.read` | All pending orders |
| GET | `/api/orders/:login` | `orders.read` | Trader orders |

### Clustering
| Method | Path | Capability | Description |
|--------|------|------------|-------------|
| GET | `/api/clustering/config` | `clustering.read` | Get config |
| PUT | `/api/clustering/config` | `config.write` | Update config |
| POST | `/api/clustering/run` | `clustering.run` | Trigger run |
| GET | `/api/clustering/runs` | `clustering.read` | Run history |
| GET | `/api/clustering/runs/:runId` | `clustering.read` | Run details |
| GET | `/api/clustering/traders/:login` | `clustering.read` | Trader cluster |
| GET | `/api/clustering/outliers` | `clustering.read` | High outliers |

## WebSocket

Connect to `ws://localhost:8080/ws` (with auth token).

### Message Format
```typescript
interface WSMessage {
  v: 1;                    // Schema version
  type: 'subscribe' | 'unsubscribe' | 'event' | 'ack' | 'error' | 'heartbeat';
  topic: 'events' | 'alerts' | 'trader' | 'clustering' | 'health';
  key?: string;            // e.g., trader login for "trader" topic
  seq?: number;            // Monotonic sequence for gap detection
  ts: string;              // ISO timestamp
  data?: unknown;
}
```

### Subscribing
```javascript
// Subscribe to all alerts
ws.send(JSON.stringify({ type: 'subscribe', topic: 'alerts' }));

// Subscribe to specific trader
ws.send(JSON.stringify({ type: 'subscribe', topic: 'trader', key: '7000' }));
```

### Topic Permissions by Role
| Topic | exec_readonly | risk_ops | risk_admin | it_observer |
|-------|---------------|----------|------------|-------------|
| alerts | ✓ | ✓ | ✓ | ✓ |
| health | ✓ | ✓ | ✓ | ✓ |
| events | ✗ | ✓ | ✓ | ✗ |
| trader | ✗ | ✓ | ✓ | ✗ |
| clustering | ✗ | ✗ | ✓ | ✗ |

## RBAC Roles

| Role | Description |
|------|-------------|
| `exec_readonly` | Executive dashboards, read-only |
| `risk_ops` | Risk operations, can manage alerts |
| `risk_admin` | Full access including configuration |
| `it_observer` | IT monitoring, read-only |

## Project Structure

```
nexrisk-bff/
├── src/
│   ├── config.ts           # Environment config with Zod validation
│   ├── server.ts           # Main entry point
│   ├── middleware/
│   │   ├── auth.ts         # JWT authentication
│   │   ├── rbac.ts         # Role-capability mappings
│   │   └── audit.ts        # Audit logging
│   ├── routes/
│   │   ├── health.ts       # Health check routes
│   │   ├── traders.ts      # Trader routes
│   │   ├── alerts.ts       # Alert routes
│   │   ├── explanations.ts # LLM explanation routes
│   │   ├── positions-orders.ts
│   │   └── clustering.ts   # Clustering routes
│   ├── services/
│   │   └── nexrisk-api.ts  # C++ API client
│   ├── websocket/
│   │   └── handler.ts      # WS connection management
│   ├── types/
│   │   └── index.ts        # TypeScript type definitions
│   └── utils/
├── config/
├── package.json
├── tsconfig.json
└── .env.example
```

## Production Deployment

### systemd Service

```ini
[Unit]
Description=NexRisk BFF
After=network.target nexrisk-api.service

[Service]
Type=simple
User=nexrisk
WorkingDirectory=/opt/nexrisk/bff
Environment=NODE_ENV=production
Environment=NEXRISK_API_URL=http://127.0.0.1:8090
Environment=PORT=8080
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

```nginx
upstream bff {
    server 127.0.0.1:8080;
    keepalive 32;
}

location /api/ {
    proxy_pass http://bff;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /ws {
    proxy_pass http://bff;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400;
}
```

## Development

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Run with hot reload
npm run dev
```

## Dependencies

- **fastify**: Fast, low overhead web framework
- **@fastify/websocket**: WebSocket support
- **@fastify/jwt**: JWT authentication
- **zod**: Runtime validation
- **undici**: HTTP client (faster than node-fetch)
- **pino**: Fast JSON logger
