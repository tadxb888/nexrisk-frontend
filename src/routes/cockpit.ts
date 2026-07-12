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
}