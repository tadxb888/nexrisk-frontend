// =============================================================================
// chartsApi.ts — Frontend client for the NexRisk Charts API
//
// Per Q6: every call goes through the Fastify BFF on 8080. Frontend never
// hits the C++ backend (8090) directly. This file is the only place chart
// components touch HTTP.
//
// Per Q1: charts are aggregations — REST polling is the right tool.
// Polling intervals (Q4: only the visible chart polls):
//
//   Chart                         Interval
//   ─────────────────────────────────────
//   Hourly P&L      (Chart 2)     30s
//   Net Volume      (Chart 7)     30s
//   Most Traded     (Chart 1)     60s
//   Symbols Hedge   (Chart 4)     60s
//   Top Holders     (Chart 6)     60s
//   Portfolio Perf  (Chart 3)     5min
//   Cost Summary    (Chart 5)     5min
//
// Backed by:
//   • src/server/routes/charts.ts — BFF pass-through
//   • CHARTS_API.md                — backend contract
//   • src/types/charts.ts          — response shapes (single source of truth)
//
// =============================================================================

import type {
  ChartPeriod,
  DateRange,
  MostTradedResponse,
  HourlyPnlResponse,
  PnlHistoryResponse,
  SymbolsHedgeResponse,
  CostSummaryResponse,
  TopHoldersResponse,
  NetVolumeResponse,
} from '@/types/charts';

// ── Base URL ──────────────────────────────────────────────────────────────
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080';

// ── Generic fetch helper ──────────────────────────────────────────────────
// Mirrors src/services/api.ts's fetchAPI for consistency. Throws on non-OK
// so callers can catch and render error states.
async function fetchChart<T>(
  endpoint: string,
  query?: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(endpoint, API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const res = await fetch(url.toString());

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errBody.error || `HTTP ${res.status}: ${endpoint}`);
  }

  return res.json();
}

// ── Period → DateRange translation ────────────────────────────────────────
// The chart UI exposes named periods (Today, This Week, ...). The backend
// takes ISO 8601 from/to. This translation lives here so chart components
// don't reinvent it.
//
// Conventions:
//   • `from` is INCLUSIVE — start-of-period at 00:00:00 UTC.
//   • `to`   is EXCLUSIVE — moment of call (now) for in-progress periods,
//                            start-of-NEXT-period for fully-elapsed periods.
//   • All output is canonical ISO 8601 with `Z` suffix.
//
// The frontend treats periods as UTC for consistency with backend storage.
// If a future Period selector adds a TZ-aware mode, this is the function
// that changes.

const ISO = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function periodToDateRange(period: ChartPeriod, now: Date = new Date()): DateRange {
  // Day buckets — start at 00:00 UTC of the named day.
  const today0      = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow0   = new Date(today0); tomorrow0.setUTCDate(today0.getUTCDate() + 1);
  const yesterday0  = new Date(today0); yesterday0.setUTCDate(today0.getUTCDate() - 1);

  // Week buckets — Monday-anchored. JS getUTCDay returns 0=Sun..6=Sat.
  const mondayOffset = (now.getUTCDay() + 6) % 7; // Mon=0, Sun=6
  const thisWeekStart = new Date(today0); thisWeekStart.setUTCDate(today0.getUTCDate() - mondayOffset);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 7);

  // Month buckets.
  const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  // Quarter buckets.
  const q = Math.floor(now.getUTCMonth() / 3);
  const thisQuarterStart = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
  const lastQuarterStart = new Date(Date.UTC(now.getUTCFullYear(), (q - 1) * 3, 1));

  // Half-year buckets — H1 = Jan-Jun, H2 = Jul-Dec (UTC).
  const h1Start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const h2Start = new Date(Date.UTC(now.getUTCFullYear(), 6, 1));

  // Year buckets.
  const thisYearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const nextYearStart = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));

  // Trailing-N-month buckets — (current month + N-1 prior months).
  // Anchored to the FIRST day of the start month so backend monthly
  // aggregations land cleanly. e.g. trailing_3m on Apr 28 → Feb 1 → now.
  const trailingMonthStart = (n: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1), 1));
  const trailing3mStart  = trailingMonthStart(3);
  const trailing6mStart  = trailingMonthStart(6);
  const trailing12mStart = trailingMonthStart(12);

  switch (period) {
    case 'today':         return { from: ISO(today0),         to: ISO(now) };
    case 'yesterday':     return { from: ISO(yesterday0),     to: ISO(today0) };
    case 'this_week':     return { from: ISO(thisWeekStart),  to: ISO(now) };
    case 'last_week':     return { from: ISO(lastWeekStart),  to: ISO(thisWeekStart) };
    case 'this_month':    return { from: ISO(thisMonthStart), to: ISO(now) };
    case 'last_month':    return { from: ISO(lastMonthStart), to: ISO(thisMonthStart) };
    case 'this_quarter':  return { from: ISO(thisQuarterStart), to: ISO(now) };
    case 'last_quarter':  return { from: ISO(lastQuarterStart), to: ISO(thisQuarterStart) };
    case 'h1':            return { from: ISO(h1Start),        to: ISO(h2Start) };
    case 'h2':            return { from: ISO(h2Start),        to: ISO(nextYearStart) };
    case 'this_year':     return { from: ISO(thisYearStart),  to: ISO(now) };
    case 'last_year':     return { from: ISO(lastYearStart),  to: ISO(thisYearStart) };
    case 'trailing_3m':   return { from: ISO(trailing3mStart),  to: ISO(now) };
    case 'trailing_6m':   return { from: ISO(trailing6mStart),  to: ISO(now) };
    case 'trailing_12m':  return { from: ISO(trailing12mStart), to: ISO(now) };
  }
}

// Chart 3 uses date-only YYYY-MM-DD (intentional per Ross — daily grain).
const dateOnly = (d: Date): string => d.toISOString().slice(0, 10);

export function periodToDateOnlyRange(period: ChartPeriod, now: Date = new Date()): { from: string; to: string } {
  const { from, to } = periodToDateRange(period, now);
  return { from: dateOnly(new Date(from)), to: dateOnly(new Date(to)) };
}

// ── The 7 chart endpoints ─────────────────────────────────────────────────
// Each function takes optional params, returns the typed response shape.
// Errors propagate via fetchChart's throw — caller handles loading/error/empty
// in the component (Stage 2+).

/** Chart 1 — Most Traded Symbols (B-Book). Default period: month-to-date. */
export async function fetchMostTradedSymbols(opts?: {
  from?:  string;
  to?:    string;
  limit?: number;
}): Promise<MostTradedResponse> {
  return fetchChart<MostTradedResponse>('/api/v1/charts/most-traded-symbols', opts);
}

/** Chart 2 — A/B/C Combination, Hourly P&L. Default period: today 00:00 UTC → now.
 *  Note: this chart is restricted to 24-hour windows (Q2 — frontend only
 *  exposes the 'today' option). Wider ranges work but produce more buckets. */
export async function fetchHourlyPnl(opts?: {
  from?: string;
  to?:   string;
}): Promise<HourlyPnlResponse> {
  return fetchChart<HourlyPnlResponse>('/api/v1/charts/hourly-pnl', opts);
}

/** Chart 3 — Portfolio Performance, Daily P&L History. Date-only YYYY-MM-DD. */
export async function fetchPnlHistory(opts?: {
  from?: string;
  to?:   string;
}): Promise<PnlHistoryResponse> {
  return fetchChart<PnlHistoryResponse>('/api/v1/portfolio/pnl-history', opts);
}

/** Chart 4 — Symbols Hedge. Default period: month-to-date. */
export async function fetchSymbolsHedge(opts?: {
  from?:  string;
  to?:    string;
  limit?: number;
}): Promise<SymbolsHedgeResponse> {
  return fetchChart<SymbolsHedgeResponse>('/api/v1/charts/symbols-hedge', opts);
}

/** Chart 5 — Cost: Revenues & Expenses, monthly. Default: trailing 12 months. */
export async function fetchCostSummary(opts?: {
  from?: string;
  to?:   string;
}): Promise<CostSummaryResponse> {
  return fetchChart<CostSummaryResponse>('/api/v1/charts/cost-summary', opts);
}

/** Chart 6 — Top 30 Holders. Period FIXED to MTD by backend; from/to ignored. */
export async function fetchTopHolders(opts?: {
  limit?: number;
}): Promise<TopHoldersResponse> {
  return fetchChart<TopHoldersResponse>('/api/v1/charts/top-holders', opts);
}

/** Chart 7 — A/B/C Net Volume. Snapshot — no period. */
export async function fetchNetVolumeByBook(opts?: {
  limit?: number;
}): Promise<NetVolumeResponse> {
  return fetchChart<NetVolumeResponse>('/api/v1/charts/net-volume-by-book', opts);
}

/** Chart 7 manual refresh button (Q5). Forces a recompute of the
 *  ExposureEngine snapshots. Call this then re-fetch fetchNetVolumeByBook. */
export async function refreshExposureSnapshot(): Promise<{ success?: boolean; [k: string]: unknown }> {
  const url = new URL('/api/v1/exposure/refresh', API_BASE);
  const res = await fetch(url.toString(), { method: 'POST' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errBody.error || `HTTP ${res.status}: /api/v1/exposure/refresh`);
  }
  return res.json();
}

// =============================================================================
// Chart 8 — Daily Volumes per Book (time series)
// =============================================================================
//
// Per-day volume per book over the period. Backend sums Portfolio (A+B+C)
// at read time. Days with no rows in book_pnl_daily are omitted from the
// response — frontend gap-fills the time axis if it wants continuity.

export interface DailyVolumeBookFields {
  volume_lots:           number;
  longs_lots:            number;
  shorts_lots:           number;
  volume_notional:       number;
  long_volume_notional:  number;
  short_volume_notional: number;
}

export interface DailyVolumePoint {
  date:      string;                       // YYYY-MM-DD
  b:         DailyVolumeBookFields;
  a:         DailyVolumeBookFields;
  c:         DailyVolumeBookFields;
  portfolio: DailyVolumeBookFields;
}

export interface DailyVolumesResponse {
  from:   string;
  to:     string;
  points: DailyVolumePoint[];
}

/** Chart 8 — Daily Volumes per Book. Default backend period: month-to-date. */
export async function fetchDailyVolumes(opts?: {
  from?: string;
  to?:   string;
}): Promise<DailyVolumesResponse> {
  return fetchChart<DailyVolumesResponse>('/api/v1/charts/daily-volumes', opts);
}

// =============================================================================
// Chart 9 — Daily Cost Breakdown per Book (single-period summary)
// =============================================================================
//
// SUM commissions/swaps/rebates across the period. Returns ONE set of
// totals per book (B/A/C/Portfolio), NOT a time series. The chart renders
// 8 bars: 2 per book (breakdown stacked + total).

export interface DailyCostBookFields {
  commissions: number;
  swaps:       number;
  rebates:     number;
  total:       number;   // commissions + swaps + rebates
}

export interface DailyCostsResponse {
  from:  string;
  to:    string;
  books: {
    b:         DailyCostBookFields;
    a:         DailyCostBookFields;
    c:         DailyCostBookFields;
    portfolio: DailyCostBookFields;
  };
}

/** Chart 9 — Daily Cost Breakdown per Book. Default backend period: month-to-date. */
export async function fetchDailyCosts(opts?: {
  from?: string;
  to?:   string;
}): Promise<DailyCostsResponse> {
  return fetchChart<DailyCostsResponse>('/api/v1/charts/daily-costs', opts);
}