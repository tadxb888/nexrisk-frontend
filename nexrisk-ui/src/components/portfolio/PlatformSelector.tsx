// ============================================
// PlatformSelector
//
// Page-level platform selector of the Portfolio page: All, MT5 (Master),
// cTrader (Master). Only the MASTER node of each platform counts in the
// books. A platform whose master is not connected cannot be chosen, as on
// the B-Book page. Default: All.
//
// Visual: matches the BBookPage filter-bar dropdown.
// ============================================

import type { PlatformMasters } from '@/hooks/usePlatformMasters';

export type PortfolioPlatform = 'All' | 'MT5' | 'cTrader';

interface Props {
  value:    PortfolioPlatform;
  onChange: (p: PortfolioPlatform) => void;
  masters:  PlatformMasters;
}

export function PlatformSelector({ value, onChange, masters }: Props) {
  const { mt5Active, ctActive, ctMaster } = masters;
  const ctTitle = ctMaster === undefined ? 'cTrader master: not known yet'
    : ctMaster === null ? 'No cTrader MASTER node is configured'
    : `cTrader master: ${ctMaster.name} (${ctMaster.status})`;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <label htmlFor="portfolio-platform" className="text-[#d2d6e2]">Platform</label>
      <select
        id="portfolio-platform"
        value={value}
        onChange={(e) => onChange(e.target.value as PortfolioPlatform)}
        aria-label="Platform"
        title={ctTitle}
        className="bg-[#232225] border border-[#606060] rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-[#49b3b3]"
      >
        <option value="All">All</option>
        <option value="MT5" disabled={!mt5Active}>
          {mt5Active ? 'MT5 (Master)' : 'MT5 (Master, not connected)'}
        </option>
        <option value="cTrader" disabled={!ctActive}>
          {ctActive ? 'cTrader (Master)' : 'cTrader (Master, not connected)'}
        </option>
      </select>
    </div>
  );
}
