import type { FastifyInstance } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
import { config } from '../config.js';
import { nexriskApi } from '../services/nexrisk-api.js';

function backendWsUrl(): string {
  const restUrl = new URL(config.nexriskApiUrl);
  return `ws://${restUrl.hostname}:8081/ws/v1/mt5/events`;
}

let backendWs: WebSocket | null = null;
const browserClients = new Set<WebSocket>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let lastSnapshot: string | null = null;
let fastifyRef: FastifyInstance | null = null;

function connectBackend() {
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;
  const url = backendWsUrl();
  fastifyRef?.log.info(`[MT5 WS] Connecting to backend ${url}`);
  backendWs = new WebSocket(url);

  backendWs.on('ping', (data) => {
    fastifyRef?.log.debug('[MT5 WS] Ping from backend — sending pong');
    backendWs?.pong(data);
  });

  backendWs.on('open', async () => {
    fastifyRef?.log.info('[MT5 WS] Backend connected — fetching snapshot');
    try {
      const nodesRes = await nexriskApi.get<{ nodes: { id: number; node_name: string; connection_status: string; is_enabled: boolean }[] }>('/api/v1/mt5/nodes');
      if (!nodesRes.ok || !nodesRes.data) return;
      // Filter by is_enabled only — connection_status from backend is unreliable.
      const connected = nodesRes.data.nodes.filter(n => n.is_enabled !== false);
      const allPositions: unknown[] = [];
      await Promise.allSettled(connected.map(async (node) => {
        const posRes = await nexriskApi.get<{ positions: unknown[] }>(`/api/v1/mt5/nodes/${node.id}/books/B/positions`);
        if (posRes.ok && posRes.data?.positions) {
          posRes.data.positions.forEach(p => allPositions.push({ ...(p as object), nodeName: node.node_name }));
        }
      }));
      lastSnapshot = JSON.stringify({ topic: 'mt5.position', type: 'SNAPSHOT', data: allPositions, timestamp_ms: Date.now() });
      fastifyRef?.log.info(`[MT5 WS] Snapshot ready — ${allPositions.length} positions`);
      for (const client of browserClients) {
        if (client.readyState === WebSocket.OPEN) client.send(lastSnapshot!);
      }
    } catch (err) { fastifyRef?.log.error(`[MT5 WS] Snapshot error: ${err}`); }
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(data.toString()) as { type?: string };
      if (msg.type === "SNAPSHOT") return;
      if (msg.type === "ping") { backendWs?.send(JSON.stringify({ type: "pong", timestamp_ms: Date.now() })); return; }
    } catch { /**/ }
    const frame = data.toString();
    for (const client of browserClients) {
      if (client.readyState === WebSocket.OPEN) client.send(frame);
    }
  });

  backendWs.on('close', () => {
    fastifyRef?.log.warn('[MT5 WS] Backend disconnected — reconnecting in 3s');
    backendWs = null;
    lastSnapshot = null;
    reconnectTimer = setTimeout(() => connectBackend(), 3000);
  });

  backendWs.on('error', (err) => {
    fastifyRef?.log.error(`[MT5 WS] Backend error: ${err.message}`);
  });
}

export async function mt5WsRoutes(fastify: FastifyInstance): Promise<void> {
  fastifyRef = fastify;
  connectBackend();

  fastify.get('/ws/v1/mt5/events', { websocket: true }, (connection: SocketStream) => {
    const socket = connection.socket;
    browserClients.add(socket);
    fastify.log.info(`[MT5 WS] Browser connected — total=${browserClients.size}`);

    if (lastSnapshot && socket.readyState === WebSocket.OPEN) {
      socket.send(lastSnapshot);
    }

    socket.on('message', (data: Buffer) => {
      if (backendWs?.readyState === WebSocket.OPEN) backendWs.send(data);
    });

    socket.on('close', () => {
      browserClients.delete(socket);
      fastify.log.info(`[MT5 WS] Browser disconnected — total=${browserClients.size}`);
    });

    socket.on('error', () => browserClients.delete(socket));
  });

  fastify.addHook('onClose', async () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    backendWs?.close();
  });
}