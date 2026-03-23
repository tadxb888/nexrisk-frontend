// ============================================================
// Route Sanity — BFF Route Module
//
// Mount prefix: /api/v1  (the server adds this when registering)
//
// REGISTRATION — add to your server entry file:
//
//   import { routeSanityRoutes } from './routes/route-sanity.js';
//   fastify.register(routeSanityRoutes, { prefix: '/api/v1' });
//
// Endpoints:
//   GET /route-sanity/lps                   → enabled LPs + live status
//   GET /route-sanity/lp/:lp_id/status      → live FIX status for one LP
//   GET /route-sanity/lp/:lp_id/instruments → instrument list for symbol grid
// ============================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nexriskApi } from '../services/nexrisk-api.js';

// ── Param schema ──────────────────────────────────────────────
const lpIdParams = z.object({
  lp_id: z.string().regex(/^[a-z0-9][a-z0-9\-]{2,31}$/),
});

// ── Route module ──────────────────────────────────────────────
export async function routeSanityRoutes(fastify: FastifyInstance): Promise<void> {

  // ── GET /route-sanity/lps ────────────────────────────────────
  // Returns all enabled LP admin configs merged with live FIX status.
  // Live status fetch is best-effort per LP: failures produce null fields.
  fastify.get(
    '/route-sanity/lps',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (_request: FastifyRequest, reply: FastifyReply) => {

      // 1. Fetch LP admin config list
      const configRes = await nexriskApi.get('/api/v1/fix/admin/lp');
      if (!configRes.ok) {
        return reply.code(configRes.status).send(configRes.error);
      }

      // Defensive: backend returns { data: { lps: [...] } } shape
      const raw        = configRes.data as any;
      const allConfigs: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.lps)
          ? raw.lps
          : Array.isArray(raw?.data?.lps)
            ? raw.data.lps
            : Array.isArray(raw?.data)
              ? raw.data
              : [];

      const enabledConfigs = allConfigs.filter((c: any) => c.enabled === true);

      // 2. Global status for LP state + per-LP status for session detail — parallel
      const globalRes = await nexriskApi.get('/api/v1/fix/status');
      let globalStatusMap = new Map<string, any>();
      if (globalRes.ok) {
        const gd = globalRes.data as any;
        const statusLps: any[] = gd?.lps ?? gd?.data?.lps ?? [];
        for (const s of statusLps) {
          if (s.lp_id) globalStatusMap.set(s.lp_id, s);
        }
      }

      // Per-LP detail calls for connect_count + session states + metrics + MD prices — parallel
      const [detailResults, metricsResults, pricesResults] = await Promise.all([
        Promise.allSettled(enabledConfigs.map((c: any) => nexriskApi.get(`/api/v1/fix/status/${c.lp_id}`))),
        Promise.allSettled(enabledConfigs.map((c: any) => nexriskApi.get(`/api/v1/fix/lp/${c.lp_id}/metrics/symbols`))),
        Promise.allSettled(enabledConfigs.map((c: any) => nexriskApi.get(`/api/v1/fix/md/prices/${c.lp_id}`))),
      ]);

      const lps = enabledConfigs.map((c: any, idx: number) => {
        const globalStatus = globalStatusMap.get(c.lp_id) ?? null;
        const detailResult = detailResults[idx];
        const detail = detailResult.status === 'fulfilled' && detailResult.value.ok
          ? (detailResult.value.data as any)
          : null;

        // Aggregate LP-level latency and rejection from per-symbol metrics
        const metricsResult = metricsResults[idx];
        let latency_ms_day: number | null = null;
        let latency_ms_60min: number | null = null;
        let rejection_pct_day: number | null = null;
        let rejection_pct_60min: number | null = null;

        if (metricsResult.status === 'fulfilled' && metricsResult.value.ok) {
          const md = metricsResult.value.data as any;
          const metrics: Record<string, any> = md?.data?.metrics ?? md?.metrics ?? {};
          const syms = Object.values(metrics);
          if (syms.length > 0) {
            const rtDay   = syms.map((s: any) => s.avg_rt_ms_day).filter((v: any) => v != null);
            const rt60    = syms.map((s: any) => s.avg_rt_ms_60min).filter((v: any) => v != null);
            const rejDay  = syms.map((s: any) => s.rejection_pct_day).filter((v: any) => v != null);
            const rej60   = syms.map((s: any) => s.rejection_pct_60min).filter((v: any) => v != null);
            if (rtDay.length)  latency_ms_day    = Math.round(rtDay.reduce((a: number, b: number) => a + b, 0) / rtDay.length);
            if (rt60.length)   latency_ms_60min  = Math.round(rt60.reduce((a: number, b: number) => a + b, 0) / rt60.length);
            if (rejDay.length) rejection_pct_day  = Math.round(rejDay.reduce((a: number, b: number) => a + b, 0) / rejDay.length * 100) / 100;
            if (rej60.length)  rejection_pct_60min = Math.round(rej60.reduce((a: number, b: number) => a + b, 0) / rej60.length * 100) / 100;
          }
        }

        return {
          lp_id:                 c.lp_id,
          lp_name:               c.lp_name ?? c.lp_id,
          enabled:               c.enabled,
          provider_type:         c.provider_type ?? null,
          state:                 globalStatus?.state ?? detail?.state ?? null,
          connect_count:         detail?.connect_count ?? null,
          disconnect_count:      detail?.disconnect_count ?? null,
          trading_session_state: detail?.trading_session?.state ?? detail?.trading_session ?? null,
          md_session_state:      detail?.md_session?.state ?? detail?.md_session ?? null,
          latency_ms_day,
          latency_ms_60min,
          rejection_pct_day,
          rejection_pct_60min,
        };
      });

      return reply.send({ success: true, data: { lps } });
    }
  );

  // ── GET /route-sanity/lp/:lp_id/status ───────────────────────
  // Live FIX status for a single LP (used for future periodic refresh).
  fastify.get(
    '/route-sanity/lp/:lp_id/status',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);
      const response  = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}`);
      if (!response.ok) return reply.code(response.status).send(response.error);
      return reply.send(response.data);
    }
  );

  // ── GET /route-sanity/lp/:lp_id/instruments ──────────────────
  // Instrument list enriched with per-symbol metrics + true delta spread (LP vs MT5).
  fastify.get(
    '/route-sanity/lp/:lp_id/instruments',
    { preHandler: [fastify.authenticate, fastify.requireCapability('config.read')] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { lp_id } = lpIdParams.parse(request.params);

      // 1. Instruments (required)
      const instrRes = await nexriskApi.get(`/api/v1/fix/lp/${lp_id}/instruments`);
      if (!instrRes.ok) {
        if (instrRes.status === 404) {
          return reply.send({ success: true, data: { lp_id, count: 0, list_complete: false, instruments: [] } });
        }
        return reply.code(instrRes.status).send(instrRes.error);
      }

      const instrData      = instrRes.data as any;
      const instruments: any[] = instrData?.data?.instruments ?? instrData?.instruments ?? [];
      const listComplete: boolean = instrData?.data?.list_complete ?? instrData?.list_complete ?? false;

      if (instruments.length === 0) {
        return reply.send({ success: true, data: { lp_id, count: 0, list_complete: listComplete, instruments: [] } });
      }

      // 2. Symbol mappings, metrics, MT5 nodes — parallel
      const [mappingsRes, metricsRes, nodesRes] = await Promise.all([
        nexriskApi.get(`/api/v1/mappings/lp`),
        nexriskApi.get(`/api/v1/fix/lp/${lp_id}/metrics/symbols`),
        nexriskApi.get('/api/v1/mt5/nodes/status'),
      ]);

      // Parse symbol mappings: lp_symbol → mt5_symbol
      const lpToMt5 = new Map<string, string>();
      if (mappingsRes.ok) {
        const md = mappingsRes.data as any;
        const mappings: any[] = md?.mappings ?? [];
        for (const m of mappings) {
          if (m.lp_symbol && m.mt5_symbol) {
            lpToMt5.set(m.lp_symbol, m.mt5_symbol);
          }
        }
      }

      // Parse metrics
      type MetricEntry = {
        avg_rt_ms_day?: number | null;
        avg_rt_ms_60min?: number | null;
        rejection_pct_day?: number | null;
        rejection_pct_60min?: number | null;
        volume_day?: number;
      };
      const metricsMap = new Map<string, MetricEntry>();
      if (metricsRes.ok) {
        const md = metricsRes.data as any;
        const metrics = md?.data?.metrics ?? md?.metrics ?? {};
        for (const [sym, val] of Object.entries(metrics)) {
          metricsMap.set(sym, val as MetricEntry);
        }
      }

      // Get MT5 spreads from first connected node
      const mt5SpreadMap = new Map<string, number>();
      if (nodesRes.ok) {
        const nd = nodesRes.data as any;
        const nodes: any[] = nd?.nodes ?? [];
        const connectedNode = nodes.find((n: any) => n.connection_status === 'CONNECTED' && n.is_enabled !== false);
        if (connectedNode) {
          const nodeId = connectedNode.node_id ?? connectedNode.id;
          const symRes = await nexriskApi.get(`/api/v1/mt5/nodes/${nodeId}/symbols`);
          if (symRes.ok) {
            const syms: any[] = (symRes.data as any)?.symbols ?? [];
            for (const s of syms) {
              if (s.symbol != null && s.spread != null) {
                mt5SpreadMap.set(s.symbol, s.spread as number);
              }
            }
          }
        }
      }

      // Get LP book per symbol — parallel, best-effort
      const lpSymbols = instruments.map((i: any) => i.symbol as string);
      const bookResults = await Promise.allSettled(
        lpSymbols.map((sym: string) => nexriskApi.get(`/api/v1/fix/md/book/${lp_id}/${sym}`))
      );
      const lpSpreadMap = new Map<string, number>();
      lpSymbols.forEach((sym: string, idx: number) => {
        const r = bookResults[idx];
        if (r.status === 'fulfilled' && r.value.ok) {
          const bd = r.value.data as any;
          const spread = bd?.data?.spread ?? bd?.spread;
          if (spread != null) lpSpreadMap.set(sym, spread as number);
        }
      });

      // 3. Join and calculate true delta spread
      const enriched = instruments.map((instr: any) => {
        const lpSymbol  = instr.symbol as string;
        const mt5Symbol = lpToMt5.get(lpSymbol);
        const minIncr: number  = instr.min_price_increment ?? 0;
        const pricePrecision: number = instr.price_precision ?? 5;

        let delta_spread: number | null = null;
        const lpSpreadRaw  = lpSpreadMap.get(lpSymbol);
        const mt5SpreadPts = mt5Symbol != null ? mt5SpreadMap.get(mt5Symbol) : undefined;

        if (lpSpreadRaw != null && mt5SpreadPts != null && minIncr > 0) {
          const lpSpreadPips   = lpSpreadRaw / minIncr;
          const pointsPerPip   = pricePrecision >= 5 ? 10 : 1;
          const mt5SpreadPips  = mt5SpreadPts / pointsPerPip;
          delta_spread = Math.round((lpSpreadPips - mt5SpreadPips) * 100) / 100;
        }

        const m = metricsMap.get(lpSymbol);
        return {
          ...instr,
          mt5_symbol:          mt5Symbol ?? null,
          delta_spread,
          avg_rt_ms_day:       m?.avg_rt_ms_day       ?? null,
          avg_rt_ms_60min:     m?.avg_rt_ms_60min     ?? null,
          volume_day:          m?.volume_day           ?? null,
          rejection_pct_day:   m?.rejection_pct_day   ?? null,
          rejection_pct_60min: m?.rejection_pct_60min ?? null,
        };
      });

      return reply.send({ success: true, data: { lp_id, count: enriched.length, list_complete: listComplete, instruments: enriched } });
    }
  );
}