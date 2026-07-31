/**
 * fix-ws.ts — BFF WebSocket proxy for FIX Bridge real-time event stream
 *
 * Browser connects to: ws://BFF:8080/ws/v1/fix/events
 * Proxied upstream to: ws://C++:8081/ws/v1/fix/events  (nexrisk_service)
 *
 * Events forwarded (ZMQ PUB/SUB via C++ WS server on port 8081):
 *   EXECUTION_REPORT          fills — nexrisk_service normalises TE 35=AE → this type
 *   MARKET_DATA_SNAPSHOT      full book snapshot
 *   MD_SNAPSHOT               alias
 *   MARKET_DATA_INCREMENTAL   incremental book tick
 *   MD_INCREMENTAL            alias
 *   POSITION_REPORT           position update after fill
 *   POSITION_CLOSED           position removed
 *   ACCOUNT_STATUS            balance/equity/margin — fires every ~2 s from TE
 *   SESSION_LOGON/LOGOUT      FIX session state changes
 *   INITIAL_DATA_SET_COMPLETE LP finished loading instruments/positions
 *
 * Modelled exactly on mt5WsRoutes (mt5-ws.ts).
 * No snapshot pre-fetch needed — FIX WS is a pure PUB/SUB stream.
 */

import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
import { config } from '../config.js';

function backendWsUrl(): string {
  const restUrl = new URL(config.nexriskApiUrl);
  // Brief Section 2 / 7: C++ FIX WS server is at ws://host:8081 — NO path (unlike MT5 which uses /ws/v1/mt5/events)
  return `ws://${restUrl.hostname}:8081`;
}

let backendWs: WebSocket | null = null;
const browserClients = new Set<WebSocket>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let fastifyRef: FastifyInstance | null = null;

function connectBackend() {
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;
  const url = backendWsUrl();
  fastifyRef?.log.info(`[FIX WS] Connecting to backend ${url}`);
  backendWs = new WebSocket(url);

  backendWs.on('ping', (data) => {
    fastifyRef?.log.debug('[FIX WS] Ping from backend — sending pong');
    backendWs?.pong(data);
  });

  backendWs.on('open', () => {
    fastifyRef?.log.info('[FIX WS] Backend connected');
    // Subscribe to all topics so BroadcastRaw events (MD snapshots, executions,
    // session events) are delivered to this client. The C++ WebSocketManager
    // (websocketpp) only delivers BroadcastRaw messages to subscribed clients.
    // MT5 ZMQ events (POSITION_CHANGE) arrive unconditionally — this subscribe
    // is required only for FIX Bridge events pushed via BroadcastRaw.
    backendWs?.send(JSON.stringify({ type: 'subscribe', topics: [''] }));
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'ping') {
        backendWs?.send(JSON.stringify({ type: 'pong', timestamp_ms: Date.now() }));
        return;
      }
    } catch { /**/ }
    const frame = data.toString();
    for (const client of browserClients) {
      if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
  });

  backendWs.on('close', () => {
    fastifyRef?.log.warn('[FIX WS] Backend disconnected — reconnecting in 3s');
    backendWs = null;
    reconnectTimer = setTimeout(() => connectBackend(), 3000);
  });

  backendWs.on('error', (err) => {
    fastifyRef?.log.error(`[FIX WS] Backend error: ${err.message}`);
  });
}

export async function fixWsRoutes(fastify: FastifyInstance): Promise<void> {
  fastifyRef = fastify;
  connectBackend();

  fastify.get('/ws/v1/fix/events', { websocket: true }, (connection: SocketStream) => {
    const socket = connection.socket;
    browserClients.add(socket);
    fastify.log.info(`[FIX WS] Browser connected — total=${browserClients.size}`);

    // Forward subscribe/unsubscribe messages from browser to backend
    socket.on('message', (data: Buffer) => {
      if (backendWs?.readyState === WebSocket.OPEN) backendWs.send(data);
    });

    socket.on('close', () => {
      browserClients.delete(socket);
      fastify.log.info(`[FIX WS] Browser disconnected — total=${browserClients.size}`);
    });

    socket.on('error', () => browserClients.delete(socket));
  });

  fastify.addHook('onClose', async () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    backendWs?.close();
  });
}