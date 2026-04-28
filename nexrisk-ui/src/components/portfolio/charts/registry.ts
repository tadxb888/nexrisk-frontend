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

import {
  MostTradedSymbolsChart,
  PortfolioPerformanceChart,
  SymbolsHedgeChart,
  CostRevenuesExpensesChart,
  TopHoldersChart,
  AbcNetVolumeChart,
} from './ChartPlaceholders';

import { Chart2Combination } from './Chart2Combination';

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
  | 'this_year';

export const PERIOD_LABEL: Record<ChartPeriod, string> = {
  today:       'Today',
  this_week:   'This Week',
  this_month:  'This Month',
  last_month:  'Last Month',
  h1:          'H1 (Jan–Jun)',
  h2:          'H2 (Jul–Dec)',
  this_year:   'This Year',
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
  | 'abc-net-volume';

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
    Component:     MostTradedSymbolsChart,
  },
  {
    id:            'abc-combination',
    label:         'A/B/C Combination',
    description:   'Realised P/L across A, B and C books — daily for prior days, hourly for today.',
    defaultPeriod: 'this_month',
    periodOptions: ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    Icon:          AbcCombinationIcon,
    Component:     Chart2Combination,
  },
  {
    id:            'portfolio-performance',
    label:         'Portfolio Performance',
    description:   'Realized P/L across business days of the period.',
    defaultPeriod: 'this_month',
    periodOptions: ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    Icon:          PortfolioPerformanceIcon,
    Component:     PortfolioPerformanceChart,
  },
  {
    id:             'symbols-hedge',
    label:          'Symbols Hedge',
    description:    'Hedge coverage % per symbol; orange = over-hedge.',
    defaultPeriod:  'this_month',
    periodOptions:  ['today', 'this_week', 'this_month', 'last_month', 'h1', 'h2', 'this_year'],
    hasHedgeToggle: true,
    Icon:           SymbolsHedgeIcon,
    Component:      SymbolsHedgeChart,
  },
  {
    id:            'cost-revenues-expenses',
    label:         'Cost: Revenues & Expenses',
    thumbnailLabel:'Revenues & Expenses',
    description:   'Commissions, swaps, rebates — last 6 months. Negative = broker expense.',
    defaultPeriod: 'this_month',
    periodOptions: ['this_month'],
    Icon:          CostRevenuesExpensesIcon,
    Component:     CostRevenuesExpensesChart,
  },
  {
    id:            'top-holders',
    label:         'Top 30 Holders by Gross Volume',
    thumbnailLabel:'Top 30 Holders',
    description:   'Top 30 logins by long / short / total volume.',
    defaultPeriod: 'this_month',
    periodOptions: ['this_month'],
    Icon:          TopHoldersIcon,
    Component:     TopHoldersChart,
  },
  {
    id:            'abc-net-volume',
    label:         'A/B/C Net Volume',
    description:   'Share of net volume across A, B and C books.',
    defaultPeriod: 'this_month',
    periodOptions: ['this_month'],
    Icon:          AbcNetVolumeIcon,
    Component:     AbcNetVolumeChart,
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