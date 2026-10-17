import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import WebSocket from 'ws';
import { config } from '../config.js';
import { nexriskApi } from '../services/nexrisk-api.js';
import { bindSocketToSession } from '../websocket/session-guard.js';

function backendWsUrl(): string {
  const restUrl = new URL(config.nexriskApiUrl);
  return `ws://${restUrl.hostname}:8081/ws/v1/mt5/events`;
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
    fastifyRef?.log.warn(`[MT5 WS] Upstream silent ${Math.round(silentMs / 1000)}s — terminating to force reconnect`);
    backendWs.terminate();
    return;
  }
  try { backendWs.ping(); } catch { /* terminate path above handles a dead socket */ }
}
let lastSnapshot: string | null = null;
let fastifyRef: FastifyInstance | null = null;

// POSITION_BATCH frames on mt5.position carry a symbol's entire position book
// with current price and P/L - measured at ~1.1 MB each, several per second.
// That is more than a browser can parse and still render, so they are coalesced
// to one per symbol per second.
//
// Two things this must get right:
//
//   1. Key by symbol. A single global slot would let EURUSD's batch be
//      overwritten by GBPUSD's within the same second, so every symbol but the
//      last would stop updating.
//
//   2. Coalesce POSITION_BATCH only. POSITION_ADD, POSITION_CHANGE and
//      POSITION_DELETE travel on this same topic and are NOT replaceable - each
//      is the sole carrier of its event. Holding one back risks a closed
//      position never leaving the grid. Those are forwarded immediately.
//
// A newer batch for a symbol supersedes the previous one for that symbol in
// full, so dropping the older one loses nothing.
const POSITION_FLUSH_MS = 1000;
const pendingPositionFrames = new Map<string, string>();
let positionFlushTimer: ReturnType<typeof setInterval> | null = null;

// ── cTrader positions (topic ctrader.position) ─────────────────────────────
// The service sends this topic's SNAPSHOT once, when the shared upstream
// connection subscribes. A browser that subscribes later would never get one,
// so the BFF follows the topic itself, by the rules of the cTrader Node Data
// API (v1.3), and hands each browser that subscribes a SNAPSHOT built from what
// it holds. The topic's frames go only to the browsers that subscribed to it:
// the once-a-second price updates are of no use to any other page.
// A position's key is (node_id, position_id): ids of two nodes can collide.
const CT_POSITION_TOPIC = 'ctrader.position';
type CtRow = { node_id: number; position_id: number } & Record<string, unknown>;
type CtNodeMeta = { node_id: number; seq: number; count: number } & Record<string, unknown>;
let ctKnown = false;                                    // a SNAPSHOT has arrived on this upstream connection
const ctListeners = new Set<WebSocket>();               // browsers subscribed to the topic
const ctRows  = new Map<number, Map<number, CtRow>>();  // node_id -> position_id -> row
const ctNodes = new Map<number, CtNodeMeta>();          // started nodes, as the snapshot lists them

function ctReset(): void {
  ctKnown = false;
  ctRows.clear();
  ctNodes.clear();
}

function ctNodeRows(nodeId: number): Map<number, CtRow> {
  let m = ctRows.get(nodeId);
  if (!m) { m = new Map(); ctRows.set(nodeId, m); }
  return m;
}

function ctFollow(type: string | undefined, data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  if (type === 'SNAPSHOT') {
    ctReset();
    ctKnown = true;
    for (const n of (d.nodes as CtNodeMeta[] | undefined) ?? []) ctNodes.set(n.node_id, { ...n });
    for (const r of (d.positions as CtRow[] | undefined) ?? []) ctNodeRows(r.node_id).set(r.position_id, r);
    return;
  }
  const nodeId = Number(d.node_id);
  if (!Number.isFinite(nodeId)) return;
  if (type === 'POSITION_SYNC') {
    const rows = (d.positions as CtRow[] | undefined) ?? [];
    const seq  = Number(d.seq ?? 0);
    if (seq === 0 && rows.length === 0) {               // the node was stopped: it holds nothing
      ctRows.delete(nodeId);
      ctNodes.delete(nodeId);
      return;
    }
    const m = new Map<number, CtRow>();
    for (const r of rows) m.set(r.position_id, r);
    ctRows.set(nodeId, m);
    const { positions: _p, total: _t, ...meta } = d;
    ctNodes.set(nodeId, { ...(ctNodes.get(nodeId) ?? {}), ...meta, node_id: nodeId, seq, count: m.size } as CtNodeMeta);
    return;
  }
  if (type === 'POSITION_PRICES') {
    // Two fields of rows already held; an entry whose row is not held is ignored.
    const rows = ctRows.get(nodeId);
    if (!rows) return;
    type PriceEntry = { position_id: number; price_current: unknown; profit: unknown; profit_usd?: unknown; usd_rate?: unknown };
    for (const e of (d.prices as PriceEntry[] | undefined) ?? []) {
      const r = rows.get(Number(e.position_id));
      if (!r) continue;
      r.price_current = e.price_current;
      r.profit = e.profit;
      if (e.profit_usd !== undefined) r.profit_usd = e.profit_usd;   // Data API 1.4
      if (e.usd_rate !== undefined) r.usd_rate = e.usd_rate;
    }
    return;
  }
  const pid = Number(d.position_id);
  if (!Number.isFinite(pid)) return;
  const rows = ctNodeRows(nodeId);
  if (type === 'POSITION_ADD' || type === 'POSITION_CHANGE') rows.set(pid, d as CtRow);
  else if (type === 'POSITION_DELETE') rows.delete(pid);
  else return;
  const meta = ctNodes.get(nodeId);
  if (meta) { meta.seq = Number(d.seq ?? meta.seq); meta.count = rows.size; }
}

function ctSnapshotFrame(): string | null {
  if (!ctKnown) return null;
  const positions: CtRow[] = [];
  for (const m of ctRows.values()) for (const r of m.values()) positions.push(r);
  return JSON.stringify({
    topic: CT_POSITION_TOPIC,
    type: 'SNAPSHOT',
    data: { nodes: Array.from(ctNodes.values()), positions, total: positions.length },
    timestamp_ms: Date.now(),
  });
}

function sendToAll(frame: string): void {
  for (const client of browserClients) {
    if (client.readyState === WebSocket.OPEN) client.send(frame);
  }
}

function flushPositionFrames(): void {
  if (pendingPositionFrames.size === 0) return;
  const frames = Array.from(pendingPositionFrames.values());
  pendingPositionFrames.clear();
  for (const frame of frames) sendToAll(frame);
}

// Build the mt5.position SNAPSHOT frame from REST (B-Book positions of every
// enabled node). Called on each upstream (re)connect AND for each browser
// connect: a snapshot cached at upstream-connect time goes stale as soon as a
// position opens, and the browser's reconcile would then delete every row
// opened since - visible as positions flashing up and vanishing.
async function buildSnapshot(): Promise<string | null> {
  try {
    const nodesRes = await nexriskApi.get<{ nodes: { id: number; node_name: string; connection_status: string; is_enabled: boolean }[] }>('/api/v1/mt5/nodes');
    if (!nodesRes.ok || !nodesRes.data) return null;
    // Filter by is_enabled only — connection_status from backend is unreliable.
    const connected = nodesRes.data.nodes.filter(n => n.is_enabled !== false);
    const allPositions: unknown[] = [];
    await Promise.allSettled(connected.map(async (node) => {
      const posRes = await nexriskApi.get<{ positions: unknown[] }>(`/api/v1/mt5/nodes/${node.id}/books/B/positions`);
      if (posRes.ok && posRes.data?.positions) {
        posRes.data.positions.forEach(p => allPositions.push({ ...(p as object), nodeName: node.node_name }));
      }
    }));
    fastifyRef?.log.info(`[MT5 WS] Snapshot ready — ${allPositions.length} positions`);
    return JSON.stringify({ topic: 'mt5.position', type: 'SNAPSHOT', data: allPositions, timestamp_ms: Date.now() });
  } catch (err) {
    fastifyRef?.log.error(`[MT5 WS] Snapshot error: ${err}`);
    return null;
  }
}

function connectBackend() {
  if (backendWs && (backendWs.readyState === WebSocket.OPEN || backendWs.readyState === WebSocket.CONNECTING)) return;
  const url = backendWsUrl();
  fastifyRef?.log.info(`[MT5 WS] Connecting to backend ${url}`);
  backendWs = new WebSocket(url, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });
  lastUpstreamMs = Date.now();

  backendWs.on('pong', () => {
    lastUpstreamMs = Date.now();
  });

  backendWs.on('ping', (data) => {
    lastUpstreamMs = Date.now();
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
      // 'ctrader.node_status' must be the exact topic name: a prefix would
      // receive the events but not the snapshot sent on subscribe.
      topics: ['mt5.position', 'mt5.node_status', 'mt5.deal',
               'ctrader.node_status', CT_POSITION_TOPIC,
               'portfolio.summary.today', 'portfolio.summary.month',
               'portfolio.exposure.symbols',
               // Risk Radar, Flow toxicity layer (NexRisk_Risk_Radar_Flow_API.md).
               'radar.flow.symbols',
               // Risk Radar, Liquidity layer (NexRisk_Risk_Radar_Liquidity_API.md).
               'radar.liquidity.lps',
               'quote',
               'system.health']
    }));

    fastifyRef?.log.info('[MT5 WS] Backend connected — fetching snapshot');
    const snap = await buildSnapshot();
    if (snap) {
      lastSnapshot = snap;
      sendToAll(snap);
    }
  });

  backendWs.on('message', (data: WebSocket.RawData) => {
    lastUpstreamMs = Date.now();
    try {
      const msg = JSON.parse(data.toString()) as { type?: string; topic?: string };
      // Skip SNAPSHOTs only for mt5.position — that one is rebuilt locally
      // via REST above. SNAPSHOTs for any other topic (portfolio.summary,
      // future topics) must pass through to browser clients.
      if (msg.type === "SNAPSHOT" && msg.topic === "mt5.position") return;
      if (msg.type === "ping") { backendWs?.send(JSON.stringify({ type: "pong", timestamp_ms: Date.now() })); return; }
      if (msg.topic === CT_POSITION_TOPIC) {
        ctFollow(msg.type, (msg as { data?: unknown }).data);
        const frame = data.toString();
        for (const client of ctListeners) if (client.readyState === WebSocket.OPEN) client.send(frame);
        return;
      }

      // Replaceable per-tick P/L batch: hold the newest per symbol.
      // Everything else on this topic passes straight through.
      const inner = (msg as { data?: { type?: string; broker?: string; symbol?: string } }).data ?? {};
      if (msg.type === "POSITION_BATCH" || inner.type === "POSITION_BATCH") {
        const key = `${inner.broker ?? ''}|${inner.symbol ?? ''}`;
        pendingPositionFrames.set(key, data.toString());
        return;
      }
    } catch { /**/ }
    sendToAll(data.toString());
  });

  backendWs.on('close', () => {
    fastifyRef?.log.warn('[MT5 WS] Backend disconnected — reconnecting in 3s');
    backendWs = null;
    lastSnapshot = null;
    pendingPositionFrames.clear();
    ctReset();            // the next connection's SNAPSHOT replaces everything
    reconnectTimer = setTimeout(() => connectBackend(), 3000);
  });

  backendWs.on('error', (err) => {
    fastifyRef?.log.error(`[MT5 WS] Backend error: ${err.message}`);
  });
}

export async function mt5WsRoutes(fastify: FastifyInstance): Promise<void> {
  fastifyRef = fastify;
  connectBackend();
  if (!watchdogTimer) watchdogTimer = setInterval(checkUpstream, WATCHDOG_INTERVAL_MS);

  if (!positionFlushTimer) positionFlushTimer = setInterval(flushPositionFrames, POSITION_FLUSH_MS);

  // A signed-in session is required: without the session cookie the handshake
  // is answered 401, and the socket is closed when its session ends.
  fastify.get('/ws/v1/mt5/events', { websocket: true, preHandler: [fastify.authenticate] }, (connection: SocketStream, request: FastifyRequest) => {
    const socket = connection.socket;
    if (!bindSocketToSession(socket, request)) return;
    browserClients.add(socket);
    fastify.log.info(`[MT5 WS] Browser connected — total=${browserClients.size}`);

    // Fresh snapshot per browser (see buildSnapshot). Fall back to the cached
    // one only if REST is unavailable right now.
    void buildSnapshot().then((snap) => {
      const frame = snap ?? lastSnapshot;
      if (snap) lastSnapshot = snap;
      if (frame && socket.readyState === WebSocket.OPEN) socket.send(frame);
    });

    socket.on('message', (data: Buffer) => {
      // Do not forward browser subscribe messages. The shared backend
      // connection is already subscribed to all topics; forwarding each
      // browser's subscribe would clobber subscriptions for everyone.
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'subscribe') {
          // The browser's own list decides only whether it receives the cTrader
          // positions. Named exactly, as on the service: a SNAPSHOT of what the
          // BFF holds, sent at once so no frame of the topic slips in between.
          const topics: unknown[] = Array.isArray(msg.topics) ? msg.topics : [];
          if (topics.includes(CT_POSITION_TOPIC)) {
            if (!ctListeners.has(socket)) {
              ctListeners.add(socket);
              const snap = ctSnapshotFrame();
              if (snap) socket.send(snap);
            }
          } else {
            ctListeners.delete(socket);
          }
          return;
        }
      } catch { /**/ }
      if (backendWs?.readyState === WebSocket.OPEN) backendWs.send(data);
    });

    socket.on('close', () => {
      browserClients.delete(socket);
      ctListeners.delete(socket);
      fastify.log.info(`[MT5 WS] Browser disconnected — total=${browserClients.size}`);
    });

    socket.on('error', () => { browserClients.delete(socket); ctListeners.delete(socket); });
  });

  fastify.addHook('onClose', async () => {
    if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (positionFlushTimer) { clearInterval(positionFlushTimer); positionFlushTimer = null; }
    pendingPositionFrames.clear();
    backendWs?.close();
  });
}