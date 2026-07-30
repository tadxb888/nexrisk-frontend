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

// mt5.position frames carry the entire position book - roughly 1.1 MB each -
// and arrive several times a second. That is ~4.6 MB/s of JSON for the browser
// to parse, which starves the main thread and makes every page slow to load,
// slow to switch to, and slow to repaint.
//
// Coalesce them: hold only the newest frame and release at most one per second.
// Each frame is a complete book, so an older one carries no information the
// newer one lacks - dropping it loses nothing. Every other topic is untouched
// and still forwarded immediately.
const POSITION_FLUSH_MS = 1000;
// Every browser socket sends a subscribe frame naming the topics it wants, and
// this proxy used to discard them and fan every frame to every client. Six
// separate connections are opened per session from api.ts - B-Book positions,
// portfolio summary, portfolio exposure, cockpit, quotes and system health -
// and five of the six have no use for position data at all. All six were
// receiving and JSON.parsing the ~1 MB mt5.position batches and throwing them
// away. Profiling attributed 38.9% of a recording to one of those handlers
// alone, with the others alongside it.
//
// Subscriptions are now honoured per client. Prefix matching, same semantics
// as the C++ WebSocketManager. A client that never subscribes still receives
// everything, so nothing regresses if a caller is added that does not send the
// frame.
const clientTopics = new Map<WebSocket, string[]>();

function clientWants(client: WebSocket, topic: string | undefined): boolean {
  const subs = clientTopics.get(client);
  if (!subs || subs.length === 0) return true;  // never subscribed - send all
  if (!topic) return true;                      // acks, pongs, untopiced frames
  for (const prefix of subs) if (topic.startsWith(prefix)) return true;
  return false;
}

function fanout(frame: string, topic: string | undefined): void {
  for (const client of browserClients) {
    if (client.readyState !== WebSocket.OPEN) continue;
    if (!clientWants(client, topic)) continue;
    client.send(frame);
  }
}

let pendingPositionFrame: string | null = null;
let positionFlushTimer: ReturnType<typeof setInterval> | null = null;

function flushPositionFrame(): void {
  if (!pendingPositionFrame) return;
  const frame = pendingPositionFrame;
  pendingPositionFrame = null;
  fanout(frame, 'mt5.position');
}

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
    // Subscribe once on behalf of all browser clients. The shared backend
    // connection must receive every topic that any frontend page needs,
    // and the BFF fans out frames to all browser clients. Browser clients
    // receive everything and filter client-side.
    backendWs?.send(JSON.stringify({
      type: 'subscribe',
      topics: ['mt5.position', 'mt5.node_status', 'mt5.deal',
               'portfolio.summary.today', 'portfolio.summary.month',
               'portfolio.exposure.symbols',
               'quote',
               'system.health']
    }));

    fastifyRef?.log.info('[MT5 WS] Backend connected — fetching snapshot');
    try {
      const nodesRes = await nexriskApi.get<{ nodes: { id: number; node_name: string; connection_status: string; is_enabled: boolean }[] }>
('/api/v1/mt5/nodes');                                                                                                                           if (!nodesRes.ok || !nodesRes.data) return;
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
      fanout(lastSnapshot!, 'mt5.position');
    } catch (err) { fastifyRef?.log.error(`[MT5 WS] Snapshot error: ${err}`); }
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    let topic: string | undefined;
    try {
      const msg = JSON.parse(data.toString()) as { type?: string; topic?: string };
      topic = msg.topic;
      // Skip SNAPSHOTs only for mt5.position — that one is rebuilt locally
      // via REST above. SNAPSHOTs for any other topic (portfolio.summary,
      // future topics) must pass through to browser clients.
      if (msg.type === "SNAPSHOT" && msg.topic === "mt5.position") return;
      if (msg.type === "ping") { backendWs?.send(JSON.stringify({ type: "pong", timestamp_ms: Date.now() })); return; }
      // Full-book position frame: keep only the newest, flushed on the timer.
      if (msg.topic === "mt5.position") { pendingPositionFrame = data.toString(); return; }
    } catch { /**/ }
    fanout(data.toString(), topic);
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

  if (!positionFlushTimer) positionFlushTimer = setInterval(flushPositionFrame, POSITION_FLUSH_MS);

  fastify.get('/ws/v1/mt5/events', { websocket: true }, (connection: SocketStream) => {
    const socket = connection.socket;
    browserClients.add(socket);
    fastify.log.info(`[MT5 WS] Browser connected — total=${browserClients.size}`);

    // The position snapshot is deliberately NOT sent here. A client subscribes
    // immediately after connecting, and sending before that arrives would push
    // a ~1 MB frame to all six sockets a session opens, five of which discard
    // it. It is sent from the subscribe handler below instead, only to clients
    // that ask for positions.

    socket.on('message', (data: Buffer) => {
      // Do not forward browser subscribe messages. The shared backend
      // connection is already subscribed to all topics; forwarding each
      // browser's subscribe would clobber subscriptions for everyone.
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe') {
          const topics = Array.isArray(msg.topics)
            ? (msg.topics as unknown[]).map(String).filter(t => t.length > 0)
            : [];
          if (topics.length > 0) clientTopics.set(socket, topics);
          // Now that we know what this client wants, hand it the current
          // position book if that is among them.
          if (lastSnapshot
              && socket.readyState === WebSocket.OPEN
              && clientWants(socket, 'mt5.position')) {
            socket.send(lastSnapshot);
          }
          return;
        }
      } catch { /**/ }
      if (backendWs?.readyState === WebSocket.OPEN) backendWs.send(data);
    });

    socket.on('close', () => {
      browserClients.delete(socket);
      clientTopics.delete(socket);
      fastify.log.info(`[MT5 WS] Browser disconnected — total=${browserClients.size}`);
    });

    socket.on('error', () => { browserClients.delete(socket); clientTopics.delete(socket); });
  });

  fastify.addHook('onClose', async () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (positionFlushTimer) { clearInterval(positionFlushTimer); positionFlushTimer = null; }
    pendingPositionFrame = null;
    clientTopics.clear();
    backendWs?.close();
  });
}