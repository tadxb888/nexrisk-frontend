// ============================================
// PeriodSelector
//
// Per-chart period dropdown. The available options are passed in by
// the parent (drawn from each chart's `periodOptions` in
// CHART_REGISTRY) — some charts only support "This Month", others
// the full set including H1 / H2 / This Year.
//
// Visual matches Mt5NodeSelector for consistency in the chart header.
// ============================================

import {
  PERIOD_LABEL,
  type ChartPeriod,
} from '@/components/portfolio/charts/registry';

interface Props {
  value:    ChartPeriod;
  onChange: (p: ChartPeriod) => void;
  options:  ChartPeriod[];
}

export function PeriodSelector({ value, onChange, options }: Props) {
  // Single-option set — render as a static label rather than a useless
  // dropdown. Same visual treatment so the chart header stays balanced.
  if (options.length === 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-[#aaa]">Period:</span>
        <span className="bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white font-mono">
          {PERIOD_LABEL[options[0]]}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-[#aaa]">Period:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ChartPeriod)}
        className="bg-[#232225] border border-[#555] rounded px-2 py-0.5 text-xs text-white font-mono focus:outline-none focus:border-[#49b3b3]"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{PERIOD_LABEL[opt]}</option>
        ))}
      </select>
    </div>
  );
}