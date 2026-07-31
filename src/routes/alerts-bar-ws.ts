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
  backendWs = new WebSocket(url);

  backendWs.on('ping', (data) => {
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
    if (reconnectTimer) clearTimeout(reconnectTimer);
    backendWs?.close();
  });
}