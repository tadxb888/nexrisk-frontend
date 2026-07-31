/**
 * alerts-bar-ws.ts — BFF WebSocket proxy for app-wide TopBar notifications
 *
 * Browser connects to: ws://BFF:8080/ws/v1/alerts-bar/events
 * Proxied upstream to: ws://C++:8081  (nexrisk_service WebSocketManager)
 *
 * Subscribed upstream to topic prefix "alerts_bar" only — the C++
 * WebSocketManager::HandleSubscribe does literal-prefix matching, so this
 * single subscription captures every alerts_bar.notification.<TYPE> frame
 * the AlertsBarBroadcaster emits. Keeps this stream isolated from the FIX
 * and MT5 firehoses so a busy market never starves the notifications.
 *
 * One-way channel: BFF → browser only. Browser does not subscribe or
 * unsubscribe; every connected user sees the same stream because the
 * notifications themselves are app-wide.
 *
 * Modelled on fix-ws.ts. Differences from fix-ws.ts:
 *   - Topic subscription is ['alerts_bar'] not [''] (FIX subscribes to all).
 *   - No browser→backend forwarding loop (FIX allows clients to
 *     subscribe/unsubscribe at runtime; we don't expose that here).
 */

import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
import { config } from '../config.js';

function backendWsUrl(): string {
  const restUrl = new URL(config.nexriskApiUrl);
  // C++ WebSocketManager listens on :8081 (no path), same as fix-ws.ts.
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

/**
 * Fan a frame out to every connected browser. Exported so dev/test routes
 * can push synthetic frames without going through the C++ upstream — see
 * alerts-bar-dev.ts for the dev injector. Production code path also uses
 * this from the upstream `message` handler below.
 *
 * Accepts either a pre-stringified frame or a plain object that will be
 * JSON.stringified once before fanout. Clients that have fallen behind
 * MAX_BUFFERED_BYTES are skipped rather than buffered without limit.
 */
export function broadcastAlertsBarFrame(frame: unknown): void {
  const payload = typeof frame === 'string' ? frame : JSON.stringify(frame);
  for (const client of browserClients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
      fastifyRef?.log.warn('[AlertsBar WS] Browser backpressure — frame dropped');
      continue;
    }
    client.send(payload);
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
  fastifyRef?.log.info(`[AlertsBar WS] Connecting to backend ${url}`);
  const ws = new WebSocket(url);
  backendWs = ws;

  let alive = true;

  const handleDrop = (reason: string) => {
    if (isStale()) return;  // an older generation dying — ignore
    generation++;           // invalidate every handler bound to this socket
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    teardownBackend(ws);
    if (backendWs === ws) backendWs = null;
    fastifyRef?.log.warn(`[AlertsBar WS] Backend disconnected (${reason}) — reconnecting in 3s`);
    scheduleReconnect();
  };

  ws.on('ping', (data) => {
    if (isStale()) return;
    ws.pong(data);
  });

  ws.on('pong', () => { alive = true; });

  ws.on('open', () => {
    if (isStale()) return;
    fastifyRef?.log.info('[AlertsBar WS] Backend connected');
    // Prefix subscription — see header note.
    ws.send(JSON.stringify({ type: 'subscribe', topics: ['alerts_bar'] }));

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
    // Handle backend-initiated keepalive pings without forwarding them.
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp_ms: Date.now() }));
        return;
      }
    } catch {
      /* not JSON — fall through to fanout */
    }

    broadcastAlertsBarFrame(data.toString());
  });

  ws.on('close', () => handleDrop('close'));

  ws.on('error', (err) => {
    fastifyRef?.log.error(`[AlertsBar WS] Backend error: ${err.message}`);
    handleDrop(`error: ${err.message}`);
  });
}

export async function alertsBarWsRoutes(fastify: FastifyInstance): Promise<void> {
  fastifyRef = fastify;
  connectBackend();

  fastify.get(
    '/ws/v1/alerts-bar/events',
    { websocket: true },
    (connection: SocketStream) => {
      const socket = connection.socket;
      browserClients.add(socket);
      fastify.log.info(
        `[AlertsBar WS] Browser connected — total=${browserClients.size}`,
      );

      socket.on('close', () => {
        browserClients.delete(socket);
        fastify.log.info(
          `[AlertsBar WS] Browser disconnected — total=${browserClients.size}`,
        );
      });

      socket.on('error', () => browserClients.delete(socket));

      // No browser→backend forwarding by design — see header note.
    },
  );

  fastify.addHook('onClose', async () => {
    generation++;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    teardownBackend(backendWs);
    backendWs = null;
  });
}