// ============================================
// ChartIcons
//
// Static SVG thumbnail icons for the 7 portfolio charts.
// All icons share a 24×24 viewBox and use `currentColor` so they
// inherit colour from the parent (selected state, hover, etc.).
//
// Visual style: minimal line / fill compositions evocative of the
// Highcharts demo each chart is modelled on. Stroke width 1.5,
// no anti-aliasing tricks needed at this size.
// ============================================

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: IconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

// ── 1. Most Traded Symbols (vertical bars, varying heights) ──
export function MostTradedSymbolsIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="4.5"  y="13" width="2.2" height="8"  fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="8"    y="9"  width="2.2" height="12" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="11.5" y="6"  width="2.2" height="15" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="15"   y="11" width="2.2" height="10" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="18.5" y="15" width="2.2" height="6"  fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

// ── 2. A/B/C Combination (three stacked synchronized lines) ──
export function AbcCombinationIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="3" y1="7"  x2="21" y2="7"  opacity="0.25" />
      <line x1="3" y1="13" x2="21" y2="13" opacity="0.25" />
      <line x1="3" y1="19" x2="21" y2="19" opacity="0.25" />
      <polyline points="4,6 8,4 12,7 16,5 20,6" />
      <polyline points="4,13 8,11 12,14 16,12 20,13" opacity="0.7" />
      <polyline points="4,19 8,17 12,20 16,18 20,19" opacity="0.5" />
    </svg>
  );
}

// ── 3. Portfolio Performance (single ascending line w/ area) ──
export function PortfolioPerformanceIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="3" y1="21" x2="21" y2="21" />
      <path
        d="M4,17 L8,12 L12,14 L16,8 L20,5 L20,21 L4,21 Z"
        fill="currentColor"
        opacity="0.18"
        stroke="none"
      />
      <polyline points="4,17 8,12 12,14 16,8 20,5" />
      <circle cx="20" cy="5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── 4. Symbols Hedge (grouped columns, one orange-style highlight) ──
export function SymbolsHedgeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="3" y1="21" x2="21" y2="21" />
      <rect x="4.5"  y="11" width="2.5" height="10" fill="currentColor" stroke="none" opacity="0.55" />
      <rect x="8.5"  y="7"  width="2.5" height="14" fill="currentColor" stroke="none" opacity="0.55" />
      {/* Highlighted "over-hedge" bar — taller, distinct opacity */}
      <rect x="12.5" y="4"  width="2.5" height="17" fill="currentColor" stroke="none" />
      <rect x="16.5" y="9"  width="2.5" height="12" fill="currentColor" stroke="none" opacity="0.55" />
    </svg>
  );
}

// ── 5. Cost: Revenues & Expenses (columns above / below zero baseline) ──
export function CostRevenuesExpensesIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      {/* Zero baseline */}
      <line x1="3" y1="12" x2="21" y2="12" />
      {/* Above zero (revenue) */}
      <rect x="4.5"  y="6"  width="2.5" height="6" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="11"   y="4"  width="2.5" height="8" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="17.5" y="7"  width="2.5" height="5" fill="currentColor" stroke="none" opacity="0.85" />
      {/* Below zero (expense) */}
      <rect x="7.75" y="12" width="2.5" height="4" fill="currentColor" stroke="none" opacity="0.45" />
      <rect x="14.25" y="12" width="2.5" height="6" fill="currentColor" stroke="none" opacity="0.45" />
    </svg>
  );
}

// ── 6. Top 30 Holders by Gross Volume (horizontal bars descending) ──
export function TopHoldersIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <line x1="3" y1="3" x2="3" y2="21" />
      <rect x="3" y="5"  width="17" height="2.4" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="3" y="9"  width="13" height="2.4" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="3" y="13" width="9"  height="2.4" fill="currentColor" stroke="none" opacity="0.85" />
      <rect x="3" y="17" width="5"  height="2.4" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

// ── 7. A/B/C Net Volume (pie with 3 slices) ──
export function AbcNetVolumeIcon(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      {/* Pie outline */}
      <circle cx="12" cy="12" r="8" />
      {/* Slice dividers from center */}
      <line x1="12" y1="12" x2="12" y2="4"  />
      <line x1="12" y1="12" x2="19" y2="16" />
      <line x1="12" y1="12" x2="6"  y2="17" />
      {/* Slice fills via opacity layers */}
      <path d="M12,12 L12,4 A8,8 0 0,1 19,16 Z" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M12,12 L19,16 A8,8 0 0,1 6,17 Z" fill="currentColor" stroke="none" opacity="0.30" />
      <path d="M12,12 L6,17  A8,8 0 0,1 12,4 Z" fill="currentColor" stroke="none" opacity="0.15" />
    </svg>
  );
}