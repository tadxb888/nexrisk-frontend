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
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let generation = 0;
let lastSnapshot: string | null = null;
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
      fastifyRef?.log.warn('[MT5 WS] Browser backpressure — frame dropped');
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
  fastifyRef?.log.info(`[MT5 WS] Connecting to backend ${url}`);
  const ws = new WebSocket(url);
  backendWs = ws;

  let alive = true;

  const handleDrop = (reason: string) => {
    if (isStale()) return;  // an older generation dying — ignore
    generation++;           // invalidate every handler bound to this socket
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    teardownBackend(ws);
    if (backendWs === ws) backendWs = null;
    lastSnapshot = null;
    fastifyRef?.log.warn(`[MT5 WS] Backend disconnected (${reason}) — reconnecting in 3s`);
    scheduleReconnect();
  };

  ws.on('ping', (data) => {
    if (isStale()) return;
    fastifyRef?.log.debug('[MT5 WS] Ping from backend — sending pong');
    ws.pong(data);
  });

  ws.on('pong', () => { alive = true; });

  ws.on('open', async () => {
    if (isStale()) return;
    // Subscribe once on behalf of all browser clients. The shared backend
    // connection must receive every topic that any frontend page needs,
    // and the BFF fans out frames to all browser clients. Browser clients
    // receive everything and filter client-side.
    ws.send(JSON.stringify({
      type: 'subscribe',
      topics: ['mt5.position', 'mt5.node_status', 'mt5.deal',
               'portfolio.summary.today', 'portfolio.summary.month',
               'portfolio.exposure.symbols',
               'quote',
               'system.health']
    }));

    alive = true;
    heartbeatTimer = setInterval(() => {
      if (isStale()) return;
      if (!alive) { handleDrop('heartbeat timeout'); return; }
      alive = false;
      try { ws.ping(); } catch { /* socket already dead */ }
    }, HEARTBEAT_MS);

    fastifyRef?.log.info('[MT5 WS] Backend connected — fetching snapshot');
    try {
      const nodesRes = await nexriskApi.get<{ nodes: { id: number; node_name: string; connection_status: string; is_enabled: boolean }[] }>('/api/v1/mt5/nodes');
      if (isStale()) return;  // reconnected while awaiting — abandon this snapshot
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
      if (isStale()) return;  // reconnected while awaiting — abandon this snapshot
      lastSnapshot = JSON.stringify({ topic: 'mt5.position', type: 'SNAPSHOT', data: allPositions, timestamp_ms: Date.now() });
      fastifyRef?.log.info(`[MT5 WS] Snapshot ready — ${allPositions.length} positions`);
      fanout(lastSnapshot);
    } catch (err) { fastifyRef?.log.error(`[MT5 WS] Snapshot error: ${err}`); }
  });

  ws.on('message', (data: WebSocket.RawData) => {
    if (isStale()) return;  // orphaned socket — must never fan out
    alive = true;
    try {
      const msg = JSON.parse(data.toString()) as { type?: string; topic?: string };
      // Skip SNAPSHOTs only for mt5.position — that one is rebuilt locally
      // via REST above. SNAPSHOTs for any other topic (portfolio.summary,
      // future topics) must pass through to browser clients.
      if (msg.type === "SNAPSHOT" && msg.topic === "mt5.position") return;
      if (msg.type === "ping") { ws.send(JSON.stringify({ type: "pong", timestamp_ms: Date.now() })); return; }
    } catch { /**/ }
    fanout(data.toString());
  });

  ws.on('close', () => handleDrop('close'));

  ws.on('error', (err) => {
    fastifyRef?.log.error(`[MT5 WS] Backend error: ${err.message}`);
    handleDrop(`error: ${err.message}`);
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
      // Do not forward browser subscribe messages. The shared backend
      // connection is already subscribed to all topics; forwarding each
      // browser's subscribe would clobber subscriptions for everyone.
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe') return;
      } catch { /**/ }
      if (backendWs?.readyState === WebSocket.OPEN) backendWs.send(data);
    });

    socket.on('close', () => {
      browserClients.delete(socket);
      fastify.log.info(`[MT5 WS] Browser disconnected — total=${browserClients.size}`);
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