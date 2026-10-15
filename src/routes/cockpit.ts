import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { moduleGate } from '../middleware/auth.js';
import { nexriskApi, snakeToCamel } from '../services/nexrisk-api.js';

export async function cockpitRoutes(fastify: FastifyInstance): Promise<void> {
  // RBAC: gate this whole plugin to the 'cockpit' module.
  // GET/HEAD require VIEW; mutations require EDIT. (Layered over existing
  // requireCapability checks — can only further restrict, never loosen.)
  fastify.addHook('preHandler', moduleGate('cockpit'));
  /**
   * GET /api/cockpit/trader-risk
   * Card 4 backing data — critical traders, behavioral severity counts,
   * active risk clusters. Polled by the cockpit page ~60s.
   */
  fastify.get(
    '/cockpit/trader-risk',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/cockpit/trader-risk');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/cockpit/predictions
   * Cards 7/8/9 backing data — NexDay daily outlook, intraday Co-Trending,
   * best opportunities. Polled by the cockpit page ~60 s. Underlying data
   * refreshes once daily (predictions_daily, opportunities_daily) and every
   * 15 min (predictions_intraday).
   */
  fastify.get(
    '/cockpit/predictions',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/cockpit/predictions');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const data = snakeToCamel(response.data as Record<string, unknown>);
      return reply.send(data);
    }
  );

  /**
   * GET /api/v1/risk/largest-1day
   * Card 3 Row 3 backing data — worst 1-day range fraction per MT5 symbol
   * (flat map: mt5_symbol -> worst_range_fraction; fraction, NOT percent).
   * Worst of the last 100 daily bars; changes at most once/day. Fetched
   * on-mount + hourly by the cockpit page — not fast-polled.
   *
   * NOTE: deliberately does NOT run snakeToCamel. The keys are raw MT5
   * symbols (EURUSD, XAUUSD, and any with underscores), which the frontend
   * looks up verbatim against WS by_symbol[].symbol. Camel-casing the keys
   * would corrupt them and break the lookup. C++ returns this unwrapped
   * (no { success, data } envelope), so forward response.data as-is.
   */
  fastify.get(
    '/risk/largest-1day',
    {
      preHandler: [fastify.authenticate, fastify.requireCapability('alerts.read')],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/risk/largest-1day');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/risk/daily-moves
   * Risk Radar adverse move per symbol: the configured percentile of the daily
   * absolute close-to-close moves over the lookback (Settings → Risk Limits).
   *   { as_of, percentile, lookback_days,
   *     symbols:         { <MT5 symbol>:     { move_pct, samples, source } },
   *     ctrader_symbols: { <cTrader symbol>: { move_pct, samples, source } } }
   * move_pct is in percent; null = unrated (too little history) — never
   * substituted. Read on page open, not polled.
   *
   * Same read right as the Risk Radar page (the 'cockpit' module). Sent raw:
   * the keys are raw symbol names, which snakeToCamel would corrupt.
   */
  fastify.get(
    '/risk/daily-moves',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<unknown>('/api/v1/risk/daily-moves');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/risk-radar/risk-limits
   * The Risk Limits settings section, read-only, for the Risk Radar page: the
   * monthly loss limit and the bands are what its levels are measured against.
   * Registered here so that it follows the Risk Radar access rule (the
   * 'cockpit' module); reading and changing the section in Settings stays on
   * /settings/risk-limits with config.read / config.write. Sent raw.
   */
  fastify.get(
    '/risk-radar/risk-limits',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<unknown>('/api/v1/settings/risk-limits');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/risk-radar/flow
   * Risk Radar, Flow toxicity layer — the last radar.flow.symbols payload
   * (docs/NexRisk_Risk_Radar_Flow_API.md v1.0). 503 until the backend has
   * built its first one; forwarded as is. Sent raw: keys are symbol names.
   */
  fastify.get(
    '/risk-radar/flow',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<unknown>('/api/v1/risk-radar/flow');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/risk-radar/flow/:symbol/accounts
   * The accounts behind one instrument's flow in the window, flagged first.
   * Fastify hands the symbol decoded; it is encoded again for the service,
   * since symbols may hold '#', '.' or '/'.
   */
  fastify.get(
    '/risk-radar/flow/:symbol/accounts',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { symbol } = request.params as { symbol: string };
      if (typeof symbol !== 'string' || !symbol || symbol.length > 64) {
        return reply.code(400).send({ success: false, error: 'Invalid symbol' });
      }
      const response = await nexriskApi.get<unknown>(`/api/v1/risk-radar/flow/${encodeURIComponent(symbol)}/accounts`);

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  /**
   * GET /api/v1/risk-radar/month-pnl
   * Realised P&L of the whole book, month to date, broker view — the loss the
   * book has already taken this month, which Risk Radar takes off the monthly
   * loss limit. Read from /api/v1/portfolio/summary?period=month (total) and
   * reduced to what the page uses, so that it follows the Risk Radar access
   * rule (the 'cockpit' module) instead of the Portfolio one. The live value
   * comes on the topic portfolio.summary.month.
   */
  fastify.get(
    '/risk-radar/month-pnl',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<{ from?: string; to?: string; total?: { realized?: unknown } }>(
        '/api/v1/portfolio/summary',
        { period: 'month' },
      );

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      const d = response.data;
      const realized = typeof d?.total?.realized === 'number' && Number.isFinite(d.total.realized) ? d.total.realized : null;
      return reply.send({ from: d?.from ?? null, to: d?.to ?? null, realized });
    }
  );

  /**
   * GET /api/v1/risk-radar/exposure
   * Risk Radar, Exposure layer — the per-symbol exposure snapshot the page
   * opens with (and all it has while the market is shut and the
   * portfolio.exposure.symbols topic is silent). Same payload as that topic.
   *
   * It is the snapshot /portfolio/exposure/symbols serves, registered here so
   * that it is gated on the 'cockpit' module: anyone who can open the Cockpit
   * can open Risk Radar, whatever their level on 'portfolio'.
   *
   * Sent raw (no snakeToCamel): by_symbol[] rows are consumed verbatim.
   */
  fastify.get(
    '/risk-radar/exposure',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get<unknown>('/api/v1/portfolio/exposure/symbols');

      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }

      return reply.send(response.data);
    }
  );

  // ── Risk Radar: what the MT5 servers themselves say ─────────────────────
  // Two small reads the page makes once when it opens. Both are composed here
  // from the per-node MT5 routes so that they follow the Risk Radar access
  // rule (the 'cockpit' module) and return only what the page draws.

  interface Mt5NodeRow { id: number; node_name: string; node_type: string; is_enabled: boolean; is_master?: boolean }
  interface Mt5SymbolRow { symbol: string; path?: string; description?: string }
  interface Mt5PositionRow { symbol: string; action: string; volume_lots: number; login: number }

  async function mt5Nodes(): Promise<Mt5NodeRow[] | null> {
    const res = await nexriskApi.get<{ nodes?: Mt5NodeRow[] }>('/api/v1/mt5/nodes');
    return res.ok && Array.isArray(res.data?.nodes) ? res.data.nodes : null;
  }

  // The symbol tree changes when the broker edits it, not from minute to minute.
  const TREE_TTL_MS = 10 * 60 * 1000;
  let treeCache: { at: number; body: unknown } | null = null;

  /**
   * GET /api/v1/risk-radar/instruments
   * The broker's own symbol tree: every symbol of the MT5 MASTER with the
   * path it sits under on that server (e.g. "Forex\\Majors\\EURUSD"). Risk
   * Radar groups its map by these folders — the grouping is the broker's,
   * nothing is inferred from symbol names.
   *
   * Always 200: without a reachable MASTER the list is empty and `error` says
   * why, and the page draws its instruments ungrouped.
   */
  fastify.get(
    '/risk-radar/instruments',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (treeCache && Date.now() - treeCache.at < TREE_TTL_MS) return reply.send(treeCache.body);

      const nodes = await mt5Nodes();
      const master = nodes?.find((n) => n.is_enabled && (n.node_type === 'MASTER' || n.is_master));
      if (!master) {
        return reply.send({ source: null, instruments: [], total: 0, error: nodes ? 'No enabled MT5 MASTER node' : 'MT5 nodes could not be read' });
      }

      const res = await nexriskApi.get<{ symbols?: Mt5SymbolRow[] }>(`/api/v1/mt5/nodes/${master.id}/symbols`);
      const source = { node_id: master.id, node_name: master.node_name };
      if (!res.ok || !Array.isArray(res.data?.symbols)) {
        return reply.send({ source, instruments: [], total: 0, error: `Symbols of ${master.node_name} could not be read` });
      }

      const instruments = res.data.symbols
        .filter((s) => s && typeof s.symbol === 'string' && s.symbol)
        .map((s) => ({ symbol: s.symbol, path: typeof s.path === 'string' ? s.path : '', description: s.description ?? '' }));
      const body = { source, instruments, total: instruments.length };
      if (instruments.length > 0) treeCache = { at: Date.now(), body };
      return reply.send(body);
    }
  );

  /**
   * GET /api/v1/risk-radar/mt5-book
   * Open B-Book positions per symbol, read from the MT5 servers at the moment
   * of the request (the positions the B-Book page lists), reduced to lots and
   * counts. Risk Radar compares it with the exposure feed, so that an
   * instrument the feed has no figure for is shown as such instead of being
   * absent — and an empty map can say whether MT5 is really flat.
   *
   * Lots are CLIENT side here (buy_lots / sell_lots), as MT5 reports them.
   */
  fastify.get(
    '/risk-radar/mt5-book',
    { preHandler: [fastify.authenticate] }, // module access via moduleGate('cockpit')
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const nodes = await mt5Nodes();
      if (!nodes) return reply.code(502).send({ error: 'MT5 nodes could not be read', status: 502 });

      const enabled = nodes.filter((n) => n.is_enabled);
      const results = await Promise.all(
        enabled.map(async (n) => {
          const res = await nexriskApi.get<{ positions?: Mt5PositionRow[] }>(`/api/v1/mt5/nodes/${n.id}/books/B/positions`);
          return { node: n, ok: res.ok, positions: res.ok && Array.isArray(res.data?.positions) ? res.data.positions : [] };
        }),
      );

      const bySymbol = new Map<string, { symbol: string; buy_lots: number; sell_lots: number; positions: number; logins: Set<number> }>();
      let total = 0;
      for (const r of results) {
        for (const pos of r.positions) {
          if (!pos || typeof pos.symbol !== 'string' || !pos.symbol) continue;
          const lots = Number(pos.volume_lots);
          if (!Number.isFinite(lots) || lots <= 0) continue;
          let row = bySymbol.get(pos.symbol);
          if (!row) { row = { symbol: pos.symbol, buy_lots: 0, sell_lots: 0, positions: 0, logins: new Set() }; bySymbol.set(pos.symbol, row); }
          if (pos.action === 'SELL') row.sell_lots += lots; else row.buy_lots += lots;
          row.positions++;
          row.logins.add(pos.login);
          total++;
        }
      }

      return reply.send({
        as_of: new Date().toISOString(),
        nodes: results.map((r) => ({ node_id: r.node.id, node_name: r.node.node_name, node_type: r.node.node_type, ok: r.ok, positions: r.positions.length })),
        total_positions: total,
        by_symbol: [...bySymbol.values()].map((r) => ({ symbol: r.symbol, buy_lots: r.buy_lots, sell_lots: r.sell_lots, positions: r.positions, logins: r.logins.size })),
      });
    }
  );
}