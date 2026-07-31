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
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let generation = 0;
let fastifyRef: FastifyInstance | null = null;

// Outbound keepalive. The upstream path was observed cutting idle sockets at
// ~140s. A 30s ping keeps the connection warm and, via the missed-pong check,
// detects half-open sockets that never emit 'close'.
const HEARTBEAT_MS = 30_000;
// Cap per-browser send buffering. A stalled browser must not be allowed to
// accumulate unbounded frames inside the BFF heap.
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/**
 * Detach every listener and hard-kill the socket.
 * close() alone can leave a half-open socket alive and still emitting
 * 'message' events, which is what caused orphaned upstreams to keep fanning
 * out frames after a reconnect.
 */
function teardownBackend(ws: WebSocket | null): void {
  if (!ws) return;
  ws.removeAllListeners();
  try { ws.terminate(); } catch { /* already gone */ }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return; // never double-schedule
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectBackend();
  }, 3000);
}

function fanout(frame: string): void {
  for (const client of browserClients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
      fastifyRef?.log.warn('[FIX WS] Browser backpressure — frame dropped');
      continue;
    }
    client.send(frame);
  }
}

function connectBackend() {
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;

  // Any previous socket is dead to us — detach and kill before replacing it.
  teardownBackend(backendWs);
  backendWs = null;
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }

  const myGen = ++generation;
  const isStale = () => myGen !== generation;

  const url = backendWsUrl();
  fastifyRef?.log.info(`[FIX WS] Connecting to backend ${url}`);
  const ws = new WebSocket(url);
  backendWs = ws;

  let alive = true;

  const handleDrop = (reason: string) => {
    if (isStale()) return;  // an older generation dying — ignore
    generation++;           // invalidate every handler bound to this socket
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    teardownBackend(ws);
    if (backendWs === ws) backendWs = null;
    fastifyRef?.log.warn(`[FIX WS] Backend disconnected (${reason}) — reconnecting in 3s`);
    scheduleReconnect();
  };

  ws.on('ping', (data) => {
    if (isStale()) return;
    fastifyRef?.log.debug('[FIX WS] Ping from backend — sending pong');
    ws.pong(data);
  });

  ws.on('pong', () => { alive = true; });

  ws.on('open', () => {
    if (isStale()) return;
    fastifyRef?.log.info('[FIX WS] Backend connected');
    // Subscribe to all topics so BroadcastRaw events (MD snapshots, executions,
    // session events) are delivered to this client. The C++ WebSocketManager
    // (websocketpp) only delivers BroadcastRaw messages to subscribed clients.
    // MT5 ZMQ events (POSITION_CHANGE) arrive unconditionally — this subscribe
    // is required only for FIX Bridge events pushed via BroadcastRaw.
    ws.send(JSON.stringify({ type: 'subscribe', topics: [''] }));

    alive = true;
    heartbeatTimer = setInterval(() => {
      if (isStale()) return;
      if (!alive) { handleDrop('heartbeat timeout'); return; }
      alive = false;
      try { ws.ping(); } catch { /* socket already dead */ }
    }, HEARTBEAT_MS);
  });

  ws.on('message', (data: WebSocket.RawData) => {
    if (isStale()) return;  // orphaned socket — must never fan out
    alive = true;
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp_ms: Date.now() }));
        return;
      }
    } catch { /**/ }
    fanout(data.toString());
  });

  ws.on('close', () => handleDrop('close'));

  ws.on('error', (err) => {
    fastifyRef?.log.error(`[FIX WS] Backend error: ${err.message}`);
    handleDrop(`error: ${err.message}`);
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
    generation++;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    teardownBackend(backendWs);
    backendWs = null;
  });
}