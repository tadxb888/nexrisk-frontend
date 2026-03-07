#!/bin/bash
# Run from nexrisk-frontend root:  bash patch_bff.sh

set -e

# ── 1. Add mt5WsRoutes import to server.ts ──────────────────────────────
sed -i "s|import { fixBridgeRoutes } from './routes/fix-bridge.js';|import { fixBridgeRoutes } from './routes/fix-bridge.js';\nimport { mt5WsRoutes } from './routes/mt5-ws.js';|" src/server.ts

# ── 2. Register the route OUTSIDE the /api/v1 prefix block ─────────────
#    Anchor on the registerWebSocket call which is already outside the prefix
sed -i "s|await registerWebSocket(fastify);|await registerWebSocket(fastify);\n\n  // MT5 real-time WebSocket proxy (no /api/v1 prefix — raw WS path)\n  await fastify.register(mt5WsRoutes);|" src/server.ts

echo "server.ts patched"

# ── 3. Add VITE_WS_URL to .env (points at BFF, not C++ directly) ────────
if grep -q "VITE_WS_URL" .env 2>/dev/null; then
  sed -i "s|VITE_WS_URL=.*|VITE_WS_URL=ws://localhost:8080|" .env
else
  echo "" >> .env
  echo "# WebSocket — points at BFF which proxies to C++ backend port 8081" >> .env
  echo "VITE_WS_URL=ws://localhost:8080" >> .env
fi

echo ".env updated"
echo ""
echo "Done. Now:"
echo "  1. Copy src/routes/mt5-ws.ts into your project"
echo "  2. Restart the BFF:  npm run dev"
echo "  3. Rebuild frontend: npm run build  (or Vite will hot-reload)"