// ============================================
// Chart registry — single source of truth for the 7 portfolio charts.
//
// Adding a new chart? Append an entry here. Everything that renders
// the strip, the workspace, the per-chart header dropdowns, and the
// data-digest panel reads from this table.
//
// For the per-chart Period selector we keep the option set explicit
// per chart (some charts only support "This Month"; some default to
// "Today") rather than letting each chart override at render time.
// ============================================

import type { ComponentType, SVGProps } from 'react';

import {
  MostTradedSymbolsIcon,
  AbcCombinationIcon,
  PortfolioPerformanceIcon,
  SymbolsHedgeIcon,
  CostRevenuesExpensesIcon,
  TopHoldersIcon,
  AbcNetVolumeIcon,
} from '../icons/ChartIcons';

import { Chart1MostTradedSymbols }    from './Chart1MostTradedSymbols';
import { Chart2Combination }          from './Chart2Combination';
import { Chart3PortfolioPerformance } from './Chart3PortfolioPerformance';
import { Chart4SymbolsHedge }         from './Chart4SymbolsHedge';
import { Chart5CostRevenuesExpenses } from './Chart5CostRevenuesExpenses';
import { Chart6TopHolders }           from './Chart6TopHolders';
import { Chart7NetVolume }            from './Chart7NetVolume';
import { Chart8DailyVolumes }         from './Chart8DailyVolumes';
import { Chart9DailyCostBreakdown }   from './Chart9DailyCostBreakdown';

// ── Period domain ───────────────────────────────────────────────
// The full set of period keys any chart can support. Per-chart
// `periodOptions` arrays draw from this set. The labels live below
// in PERIOD_LABEL so consumers (selectors, digest, LLM prompt) all
// render the same wording.
export type ChartPeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'h1'
  | 'h2'
  | 'this_year'
  // Trailing-N-months periods. Used by Chart 5 (Cost: Revenues &
  // Expenses) which is monthly-aggregated by design — calendar
  // periods like "today" and "this_week" are meaningless for it.
  | 'trailing_3m'
  | 'trailing_6m'
  | 'trailing_12m';

export const PERIOD_LABEL: Record<ChartPeriod, string> = {
  today:         'Today',
  this_week:     'This Week',
  this_month:    'This Month',
  last_month:    'Last Month',
  h1:            'H1 (Jan–Jun)',
  h2:            'H2 (Jul–Dec)',
  this_year:     'This Year',
  trailing_3m:   'Last 3 Months',
  trailing_6m:   'Last 6 Months',
  trailing_12m:  'Last 12 Months',
};

// ── Per-chart props passed to chart components ──────────────────
// Every chart component receives the same shape so the workspace
// can render any of them through a single switch on chart id.
export interface ChartComponentProps {
  period: ChartPeriod;
  mt5NodeId: number | null;
  /** Symbols-Hedge-only toggle. Other charts ignore. */
  hedgeSide?: 'long' | 'short' | 'both';
}

export type ChartComponent = ComponentType<ChartComponentProps>;
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// ── Chart entry ─────────────────────────────────────────────────
export interface ChartEntry {
  id:             ChartId;
  /** Full descriptive label — shown in the chart header and AI prompt. */
  label:          string;
  /** Compact label for the thumbnail strip. Falls back to `label`
   *  when omitted. Use when the full label can't fit in two lines
   *  inside the thumbnail without ellipsis. */
  thumbnailLabel?: string;
  /** Tooltip / aria text shown on the thumbnail. */
  description:    string;
  defaultPeriod:  ChartPeriod;
  periodOptions:  ChartPeriod[];
  /** Symbols Hedge needs a long / short / both toggle in its header. */
  hasHedgeToggle?: boolean;
  Icon:           IconComponent;
  Component:      ChartComponent;
}

export type ChartId =
  | 'most-traded-symbols'
  | 'abc-combination'
  | 'portfolio-performance'
  | 'symbols-hedge'
  | 'cost-revenues-expenses'
  | 'top-holders'
  | 'abc-net-volume'
  | 'daily-volumes'
  | 'daily-cost-breakdown';

// Default chart loaded when the user lands on /portfolio with no
// localStorage pin yet. Per spec.
export const DEFAULT_CHART_ID: ChartId = 'abc-combination';

// ── The registry ────────────────────────────────────────────────
// Order here is the order they appear in the strip (left → right).
export const CHART_REGISTRY: ChartEntry[] = [
  {
    id:            'most-traded-symbols',
    label:         'Most Traded Symbols',
    description:   'Top symbols by total volume (long + short).',
    defaultPeriod: 'this_month',
    periodOptions: ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    Icon:          MostTradedSymbolsIcon,
    Component:     Chart1MostTradedSymbols,
  },
  {
    id:            'abc-combination',
    label:         'Realised P/L per Book',
    description:   'Realised P/L across A, B and C books — daily for prior days, hourly for today.',
    defaultPeriod: 'this_month',
    periodOptions: ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    Icon:          AbcCombinationIcon,
    Component:     Chart2Combination,
  },
  {
    id:            'portfolio-performance',
    label:         'Portfolio Performance - Cumulative P/L',
    description:   'Cumulative realised P/L over the selected period. Green positive, red negative.',
    defaultPeriod: 'this_month',
    periodOptions: ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    Icon:          PortfolioPerformanceIcon,
    Component:     Chart3PortfolioPerformance,
  },
  {
    id:             'symbols-hedge',
    label:          'Symbols Hedge',
    description:    'Per-symbol B-Book volume with Coverage (A+C) drawn inside.',
    defaultPeriod:  'this_month',
    periodOptions:  ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    hasHedgeToggle: true,
    Icon:           SymbolsHedgeIcon,
    Component:      Chart4SymbolsHedge,
  },
  {
    id:            'cost-revenues-expenses',
    label:         'Cost: Revenues & Expenses',
    thumbnailLabel:'Revenues & Expenses',
    description:   'Monthly commission, swap, net revenue and LP commission paid. Negative = broker expense.',
    defaultPeriod: 'trailing_3m',
    periodOptions: ['trailing_3m', 'trailing_6m', 'trailing_12m'],
    Icon:          CostRevenuesExpensesIcon,
    Component:     Chart5CostRevenuesExpenses,
  },
  {
    id:            'top-holders',
    label:         'Top 30 Holders by Gross Volume',
    thumbnailLabel:'Top 30 Holders',
    description:   'Top 30 logins by gross traded volume — month-to-date (period fixed backend-side).',
    defaultPeriod: 'this_month',
    periodOptions: ['this_month'],
    Icon:          TopHoldersIcon,
    Component:     Chart6TopHolders,
  },
  {
    id:            'abc-net-volume',
    label:         'A/B/C Net Volume',
    description:   'Snapshot of net volume across A, B and C books. Click a slice to see contributing symbols.',
    defaultPeriod: 'this_month',
    periodOptions: ['this_month'],
    Icon:          AbcNetVolumeIcon,
    Component:     Chart7NetVolume,
  },
  {
    id:            'daily-volumes',
    label:         'Daily Volumes per Book',
    thumbnailLabel:'Daily Volumes',
    description:   'Per-day volume across A, B, C and Portfolio over the selected period. Lots/Notional toggle inside the chart.',
    defaultPeriod: 'this_month',
    // 'today' excluded — single-day data point isn't useful for a time-series view.
    periodOptions: ['this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    // Re-using MostTradedSymbolsIcon (bar/chart shape) as a placeholder.
    // Swap to a dedicated line-chart icon when ChartIcons gets one.
    Icon:          MostTradedSymbolsIcon,
    Component:     Chart8DailyVolumes,
  },
  {
    id:            'daily-cost-breakdown',
    label:         'Daily Cost Breakdown per Book',
    thumbnailLabel:'Cost Breakdown',
    description:   'Period-summed commissions, swaps and rebates per book. Two bars per book: stacked breakdown + total.',
    defaultPeriod: 'this_month',
    // 'today' excluded — daily-aggregate source data.
    periodOptions: ['this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    // Re-using CostRevenuesExpensesIcon (cost/$ shape) as a placeholder.
    Icon:          CostRevenuesExpensesIcon,
    Component:     Chart9DailyCostBreakdown,
  },
];

// ── Lookups ─────────────────────────────────────────────────────
export const CHART_BY_ID: Record<ChartId, ChartEntry> = CHART_REGISTRY.reduce(
  (acc, entry) => {
    acc[entry.id] = entry;
    return acc;
  },
  {} as Record<ChartId, ChartEntry>,
);

export function getChartById(id: ChartId | null | undefined): ChartEntry {
  if (id && CHART_BY_ID[id]) return CHART_BY_ID[id];
  return CHART_BY_ID[DEFAULT_CHART_ID];
}