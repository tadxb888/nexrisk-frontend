import { useState, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

// Muted gradient colors for charts
const DONUT_COLORS = ['#3d5a80', '#5c4d7d', '#3d7d7d', '#8b7355', '#6b5b95', '#88b04b'];
const LINE_COLOR = '#4ecdc4';
const GAUGE_COLORS = {
  success: '#66e07a',
  warning: '#e0d066',
  danger: '#ff6b6b',
  background: '#3a3a3c',
};

// ======================
// TYPES
// ======================
interface ABookHedge {
  id: string;
  time: string;
  login: number;
  symbol: string;
  position_id: number;
  side: 'BUY' | 'SELL';
  volume: number;
  lp: string;
  rule: string;
  profile: 'Low' | 'Medium' | 'High' | 'Critical';
  client_price: number;
  lp_price: number;
  slippage: number;
  status: 'Completed' | 'Failed' | 'Rejected';
  latency: number;
  hedge_pnl: number;
}

interface ChartItem {
  name: string;
  value: number;
  pct?: string;
}

interface ABookChartsProps {
  hedges: ABookHedge[];
  collapsed: boolean;
  onToggle: () => void;
}

// ======================
// TOOLTIP COMPONENT
// ======================
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartItem }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#232225] border border-[#808080] rounded px-2 py-1 text-xs">
      <p className="text-white font-medium">{d.name}</p>
      <p className="text-white font-mono">{d.value.toLocaleString()} {d.pct ? `(${d.pct}%)` : 'lots'}</p>
    </div>
  );
}

// ======================
// GAUGE CHART (Hedge Success Rate)
// ======================
function HedgeSuccessGauge({ hedges }: { hedges: ABookHedge[] }) {
  const stats = useMemo(() => {
    const total = hedges.length;
    const completed = hedges.filter(h => h.status === 'Completed').length;
    const failed = hedges.filter(h => h.status === 'Failed').length;
    const rejected = hedges.filter(h => h.status === 'Rejected').length;
    const rate = total > 0 ? (completed / total) * 100 : 0;
    return { total, completed, failed, rejected, rate };
  }, [hedges]);

  // Calculate gauge color based on rate
  const gaugeColor = stats.rate >= 95 ? GAUGE_COLORS.success 
    : stats.rate >= 80 ? GAUGE_COLORS.warning 
    : GAUGE_COLORS.danger;

  // Gauge arc data
  const gaugeData = [
    { name: 'Success', value: stats.rate },
    { name: 'Remaining', value: 100 - stats.rate },
  ];

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="mb-1">
        <h4 className="text-sm font-semibold text-white">Hedge Status Rate</h4>
        <p className="text-xs text-[#999]">Overall success rate</p>
      </div>
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={gaugeData}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={gaugeColor} />
              <Cell fill={GAUGE_COLORS.background} />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Centered percentage */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ top: '10%' }}>
          <div className="text-center">
            <span className="text-2xl font-bold text-white">{stats.rate.toFixed(1)}%</span>
            <p className="text-xs text-[#999]">{stats.completed} / {stats.total}</p>
          </div>
        </div>
      </div>
      {/* Stats breakdown */}
      <div className="flex justify-center gap-4 mt-1 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#66e07a' }} />
          <span className="text-white">{stats.completed}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#e0a020' }} />
          <span className="text-white">{stats.failed}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ff6b6b' }} />
          <span className="text-white">{stats.rejected}</span>
        </div>
      </div>
    </div>
  );
}

// ======================
// LINE CHART (Slippage / Latency)
// ======================
function SlippageLatencyChart({ hedges }: { hedges: ABookHedge[] }) {
  const [mode, setMode] = useState<'slippage' | 'latency'>('slippage');

  const data = useMemo(() => {
    // Group by time buckets (hourly for demo)
    const sortedHedges = [...hedges].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Take last 20 points for cleaner visualization
    const recentHedges = sortedHedges.slice(-100);
    
    return recentHedges.map((h, i) => ({
      name: new Date(h.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      value: mode === 'slippage' ? h.slippage : h.latency,
      symbol: h.symbol,
    }));
  }, [hedges, mode]);

  // Calculate stats
  const stats = useMemo(() => {
    if (data.length === 0) return { avg: 0, min: 0, max: 0 };
    const values = data.map(d => d.value);
    return {
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }, [data]);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h4 className="text-sm font-semibold text-white">
            {mode === 'slippage' ? 'Slippage & Latency Detection' : 'Hedge Latency'}
          </h4>
          <p className="text-xs text-[#999]">
            {mode === 'slippage' 
              ? `Avg: ${stats.avg.toFixed(2)} pips | Range: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}`
              : `Avg: ${stats.avg.toFixed(0)}ms | Range: ${stats.min.toFixed(0)} - ${stats.max.toFixed(0)}ms`
            }
          </p>
        </div>
        <select 
          value={mode} 
          onChange={(e) => setMode(e.target.value as 'slippage' | 'latency')} 
          className="bg-[#232225] border border-[#808080] rounded px-2 py-0.5 text-xs text-white min-w-[140px]"
        >
          <option value="slippage">Slippage Detection</option>
          <option value="latency">Latency Detection</option>
        </select>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#444" />
            <XAxis 
              dataKey="name" 
              tick={{ fill: '#999', fontSize: 10 }} 
              axisLine={{ stroke: '#555' }}
              interval="preserveStartEnd"
            />
            <YAxis 
              tick={{ fill: '#999', fontSize: 10 }} 
              axisLine={{ stroke: '#555' }}
              domain={['auto', 'auto']}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#232225', 
                border: '1px solid #808080',
                borderRadius: '4px',
                fontSize: '11px',
              }}
              labelStyle={{ color: '#fff' }}
              formatter={(value: number) => [
                mode === 'slippage' ? `${value.toFixed(2)} pips` : `${value.toFixed(0)}ms`,
                mode === 'slippage' ? 'Slippage' : 'Latency'
              ]}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={LINE_COLOR} 
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4, fill: LINE_COLOR }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ======================
// DONUT CHART (LP Volume Share)
// ======================
function LPVolumeShareChart({ hedges }: { hedges: ABookHedge[] }) {
  const data = useMemo(() => {
    const byLP: Record<string, number> = {};
    hedges.forEach(h => {
      byLP[h.lp] = (byLP[h.lp] || 0) + h.volume;
    });
    
    const total = Object.values(byLP).reduce((s, v) => s + v, 0);
    
    return Object.entries(byLP)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([lp, volume]) => ({
        name: lp,
        value: volume,
        pct: total > 0 ? ((volume / total) * 100).toFixed(1) : '0',
      }));
  }, [hedges]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="rounded p-2 flex flex-col h-full" style={{ backgroundColor: '#313032' }}>
      <div className="mb-1">
        <h4 className="text-sm font-semibold text-white">LP volume share</h4>
        <p className="text-xs text-[#999]">Total: {total.toFixed(2)} lots</p>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie 
              data={data} 
              cx="50%" 
              cy="50%" 
              innerRadius="50%" 
              outerRadius="90%" 
              paddingAngle={2} 
              dataKey="value" 
              stroke="none"
            >
              {data.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-2 mt-1">
        {data.slice(0, 4).map((item, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span className="text-[10px] text-white">{item.name}: {item.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ======================
// MAIN CHARTS COMPONENT
// ======================
export function ABookCharts({ hedges, collapsed, onToggle }: ABookChartsProps) {
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
        <div className="flex gap-3 flex-1">
          {/* Gauge - 1/4 width */}
          <div className="w-1/4">
            <HedgeSuccessGauge hedges={hedges} />
          </div>
          {/* Line Chart - 1/2 width */}
          <div className="w-1/2">
            <SlippageLatencyChart hedges={hedges} />
          </div>
          {/* Donut - 1/4 width */}
          <div className="w-1/4">
            <LPVolumeShareChart hedges={hedges} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ABookCharts;