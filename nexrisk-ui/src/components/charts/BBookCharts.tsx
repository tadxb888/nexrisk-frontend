import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// Muted gradient colors for each chart - no red, no green, no fluorescent
const BLUE_GRADIENT = ['#3d5a80', '#4a6a8f', '#577a9e', '#648aad', '#719abc', '#7eaacb'];
const PURPLE_GRADIENT = ['#5c4d7d', '#6b5c8c', '#7a6b9b', '#897aaa', '#9889b9', '#a798c8'];
const TEAL_GRADIENT = ['#3d7d7d', '#4c8c8c', '#5b9b9b', '#6aaaaa', '#79b9b9', '#88c8c8'];

// Contrasting colors for A/B Hedge
const HEDGE_COLORS = ['#a8a9ad', '#b87333']; // Silver, Copper

interface Position {
  login: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  volume: number;
  profit: number;
  hedge: string;
}

interface ChartItem {
  name: string;
  value: number;
  login?: number;
  long?: number;
  short?: number;
  pct?: string;
}

interface BBookChartsProps {
  positions: Position[];
  collapsed: boolean;
  onToggle: () => void;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartItem }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-xs">
      <p className="text-white font-medium">{d.name}</p>
      {d.login && <p className="text-[#999] font-mono">Login: {d.login}</p>}
      {d.long !== undefined && <p className="text-[#4ecdc4] font-mono">Long: {d.long.toFixed(2)}</p>}
      {d.short !== undefined && <p className="text-[#e0a020] font-mono">Short: {d.short.toFixed(2)}</p>}
      <p className="text-white font-mono">{d.value > 1000 ? `$${d.value.toLocaleString()}` : `${d.value.toFixed(2)} lots`}</p>
    </div>
  );
}

function TraderConcentrationChart({ positions }: { positions: Position[] }) {
  const [mode, setMode] = useState<'net' | 'gross'>('gross');

  const data = useMemo(() => {
    const byLogin: Record<number, { long: number; short: number }> = {};
    positions.forEach(p => {
      if (!byLogin[p.login]) byLogin[p.login] = { long: 0, short: 0 };
      if (p.type === 'BUY') byLogin[p.login].long += p.volume;
      else byLogin[p.login].short += p.volume;
    });

    const loginData = Object.entries(byLogin).map(([login, { long, short }]) => ({
      login: Number(login),
      gross: long + short,
      net: Math.abs(long - short),
      long, short,
    }));

    return loginData.sort((a, b) => b[mode] - a[mode]).slice(0, 6).map(d => ({
      name: `${d.login}`,
      value: d[mode],
      login: d.login,
      long: d.long,
      short: d.short,
    }));
  }, [positions, mode]);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold text-white">Trader Concentration</h4>
          <p className="text-xs text-white">Top traders by volume</p>
        </div>
        <select value={mode} onChange={(e) => setMode(e.target.value as 'net' | 'gross')} className="bg-[#232225] border border-[#808080] rounded px-1 py-0.5 text-xs text-white">
          <option value="gross">Gross</option>
          <option value="net">Net</option>
        </select>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={BLUE_GRADIENT[i % BLUE_GRADIENT.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {data.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: BLUE_GRADIENT[i % BLUE_GRADIENT.length] }} />
            <span className="text-[11px] text-white font-mono">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopSymbolsChart({ positions }: { positions: Position[] }) {
  const data = useMemo(() => {
    const bySymbol: Record<string, number> = {};
    positions.forEach(p => { bySymbol[p.symbol] = (bySymbol[p.symbol] || 0) + p.volume; });
    return Object.entries(bySymbol).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([symbol, volume]) => ({ name: symbol, value: volume }));
  }, [positions]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="mb-1">
        <h4 className="text-sm font-semibold text-white">Top Symbols</h4>
        <p className="text-xs text-white">Most traded by total volume</p>
        <p className="text-xs text-white">Total: {total.toFixed(2)} lots</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={PURPLE_GRADIENT[i % PURPLE_GRADIENT.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {data.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: PURPLE_GRADIENT[i % PURPLE_GRADIENT.length] }} />
            <span className="text-[11px] text-white">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HedgeRatioChart({ positions }: { positions: Position[] }) {
  const data = useMemo(() => {
    let aBook = 0, bBook = 0;
    positions.forEach(p => { if (p.hedge !== 'No') aBook += p.volume; else bBook += p.volume; });
    const total = aBook + bBook;
    return [
      { name: 'A-Book', value: aBook, pct: total > 0 ? ((aBook / total) * 100).toFixed(1) : '0' },
      { name: 'B-Book', value: bBook, pct: total > 0 ? ((bBook / total) * 100).toFixed(1) : '0' },
    ];
  }, [positions]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="mb-1">
        <h4 className="text-sm font-semibold text-white">A/B Hedge Ratio</h4>
        <p className="text-xs text-white">Total: {total.toFixed(2)} lots</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={3} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={HEDGE_COLORS[i]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-center gap-4 mt-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: HEDGE_COLORS[i] }} />
            <span className="text-[11px] text-white">{item.name}: <span className="font-semibold">{item.pct}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopProfitableChart({ positions }: { positions: Position[] }) {
  const data = useMemo(() => {
    const byLogin: Record<number, number> = {};
    positions.forEach(p => { byLogin[p.login] = (byLogin[p.login] || 0) + p.profit; });
    return Object.entries(byLogin)
      .map(([login, profit]) => ({ login: Number(login), profit }))
      .filter(d => d.profit > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 6)
      .map(d => ({ name: `${d.login}`, value: d.profit, login: d.login }));
  }, [positions]);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="mb-1">
        <h4 className="text-sm font-semibold text-white">Top Profitable</h4>
        <p className="text-xs text-white">Top 10 by realized P&L</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="50%" outerRadius="90%" paddingAngle={2} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={TEAL_GRADIENT[i % TEAL_GRADIENT.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {data.slice(0, 5).map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TEAL_GRADIENT[i % TEAL_GRADIENT.length] }} />
            <span className="text-[11px] text-white font-mono">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BBookCharts({ positions, collapsed, onToggle }: BBookChartsProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Collapse toggle - upper middle */}
      <div className="flex justify-center py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 px-3 py-1 text-xs text-white bg-[#232225] border border-[#808080] rounded hover:bg-[#3a3a3c] transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {collapsed ? 'Expand Charts' : 'Collapse Charts'}
        </button>
      </div>

      {/* Charts grid - collapsible */}
      {!collapsed && (
        <div className="grid grid-cols-4 gap-3 flex-1">
          <TraderConcentrationChart positions={positions} />
          <TopSymbolsChart positions={positions} />
          <HedgeRatioChart positions={positions} />
          <TopProfitableChart positions={positions} />
        </div>
      )}
    </div>
  );
}

export default BBookCharts;