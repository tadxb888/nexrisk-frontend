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

// Upstream liveness watchdog. A half-open TCP connection (the C++ side
// restarted and the FIN/RST never arrived) raises no 'close' event, so without
// this the BFF can sit on a dead upstream indefinitely - it once did for 32
// days. Every WATCHDOG_INTERVAL_MS we send a protocol ping; any inbound frame
// or pong counts as alive. Silence beyond UPSTREAM_SILENCE_MS terminates the
// socket, which fires 'close' and the existing 3 s reconnect.
const WATCHDOG_INTERVAL_MS = 10_000;
const UPSTREAM_SILENCE_MS  = 45_000;
const HANDSHAKE_TIMEOUT_MS = 10_000;
let lastUpstreamMs = 0;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

function checkUpstream(): void {
  if (!backendWs || backendWs.readyState !== WebSocket.OPEN) return;
  const silentMs = Date.now() - lastUpstreamMs;
  if (silentMs > UPSTREAM_SILENCE_MS) {
    fastifyRef?.log.warn(`[AlertsBar WS] Upstream silent ${Math.round(silentMs / 1000)}s — terminating to force reconnect`);
    backendWs.terminate();
    return;
  }
  try { backendWs.ping(); } catch { /* terminate path above handles a dead socket */ }
}
let fastifyRef: FastifyInstance | null = null;

/**
 * Fan a frame out to every connected browser. Exported so dev/test routes
 * can push synthetic frames without going through the C++ upstream — see
 * alerts-bar-dev.ts for the dev injector. Production code path also uses
 * this from the upstream `message` handler below.
 *
 * Accepts either a pre-stringified frame or a plain object that will be
 * JSON.stringified once before fanout.
 */
export function broadcastAlertsBarFrame(frame: unknown): void {
  const payload = typeof frame === 'string' ? frame : JSON.stringify(frame);
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function connectBackend() {
  if (
    backendWs &&
    (backendWs.readyState === WebSocket.OPEN ||
      backendWs.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  const url = backendWsUrl();
  fastifyRef?.log.info(`[AlertsBar WS] Connecting to backend ${url}`);
  backendWs = new WebSocket(url, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });
  lastUpstreamMs = Date.now();

  backendWs.on('pong', () => {
    lastUpstreamMs = Date.now();
  });

  backendWs.on('ping', (data) => {
    lastUpstreamMs = Date.now();
    backendWs?.pong(data);
  });

  backendWs.on('open', () => {
    fastifyRef?.log.info('[AlertsBar WS] Backend connected');
    // Prefix subscription — see header note.
    backendWs?.send(
      JSON.stringify({ type: 'subscribe', topics: ['alerts_bar'] }),
    );
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    lastUpstreamMs = Date.now();
    // Handle backend-initiated keepalive pings without forwarding them.
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === 'ping') {
        backendWs?.send(
          JSON.stringify({ type: 'pong', timestamp_ms: Date.now() }),
        );
        return;
      }
    } catch {
      /* not JSON — fall through to fanout */
    }

    broadcastAlertsBarFrame(data.toString());
  });

  backendWs.on('close', () => {
    fastifyRef?.log.warn(
      '[AlertsBar WS] Backend disconnected — reconnecting in 3s',
    );
    backendWs = null;
    reconnectTimer = setTimeout(() => connectBackend(), 3_000);
  });

  backendWs.on('error', (err) => {
    fastifyRef?.log.error(`[AlertsBar WS] Backend error: ${err.message}`);
  });
}

export async function alertsBarWsRoutes(fastify: FastifyInstance): Promise<void> {
  fastifyRef = fastify;
  connectBackend();
  if (!watchdogTimer) watchdogTimer = setInterval(checkUpstream, WATCHDOG_INTERVAL_MS);

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
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    backendWs?.close();
  });
}