// ============================================
// Fallback Template Panel
// Template data when LLM unavailable
// ============================================

import { clsx } from 'clsx';

interface FallbackData {
  login: number | null;
  traderName: string;
  classification: string;
  riskLevel: string;
  riskScore: number;
  explanation: string;
  metrics: { label: string; value: string | number; status?: 'ok' | 'warning' | 'critical' }[];
  lastUpdated: string;
}

interface FallbackTemplatePanelProps {
  data: FallbackData | null;
  className?: string;
}

export function generateMockFallbackData(login: number | null): FallbackData | null {
  if (login === null) return null;
  const classifications = ['SCALPER', 'EA_BOT', 'MANUAL', 'NEWS_TRADER', 'ARBITRAGE'];
  const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const classification = classifications[login % classifications.length];
  const riskLevel = riskLevels[Math.floor(Math.random() * riskLevels.length)];
  const riskScore = Math.random() * 100;

  const templates: Record<string, string> = {
    SCALPER: `Trader ${login} exhibits scalping behavior with rapid trade execution.`,
    EA_BOT: `Trader ${login} shows algorithmic trading patterns.`,
    MANUAL: `Trader ${login} displays manual trading characteristics.`,
    NEWS_TRADER: `Trader ${login} concentrates around economic releases.`,
    ARBITRAGE: `Trader ${login} exhibits potential arbitrage behavior.`,
  };

  return {
    login,
    traderName: `Trader ${login}`,
    classification,
    riskLevel,
    riskScore,
    explanation: templates[classification] || templates.MANUAL,
    metrics: [
      { label: 'Win Rate', value: `${(40 + Math.random() * 30).toFixed(1)}%`, status: Math.random() > 0.5 ? 'ok' : 'warning' },
      { label: 'Profit Factor', value: (0.5 + Math.random() * 1.5).toFixed(2), status: Math.random() > 0.7 ? 'ok' : 'warning' },
      { label: 'Avg Hold Time', value: `${Math.floor(Math.random() * 120)} min` },
      { label: 'Trades Today', value: Math.floor(Math.random() * 50) },
      { label: 'Volume (Lots)', value: (Math.random() * 100).toFixed(2) },
      { label: 'Floating P&L', value: `$${((Math.random() - 0.5) * 5000).toFixed(2)}`, status: Math.random() > 0.5 ? 'ok' : 'critical' },
    ],
    lastUpdated: new Date().toISOString(),
  };
}

function getMetricColor(status?: 'ok' | 'warning' | 'critical'): string {
  if (status === 'ok') return '#448b55';
  if (status === 'warning') return '#c9a227';
  if (status === 'critical') return '#8b4444';
  return '#e6e6e6';
}

export function FallbackTemplatePanel({ data, className }: FallbackTemplatePanelProps) {
  if (!data || data.login === null) {
    return (
      <div className={clsx('flex flex-col bg-[#141416] border-t border-[#2d2d32]', className)}>
        <div className="px-3 py-2 border-b border-[#2d2d32]">
          <span className="text-xs font-medium text-[#8b8b93]">Fallback template data</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-xs text-[#6b6b73] text-center">Select a trade row to view<br/>trader template data</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex flex-col bg-[#141416] border-t border-[#2d2d32]', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2d2d32] flex items-center justify-between">
        <span className="text-xs font-medium text-[#8b8b93]">Fallback template data</span>
        <span className="text-[9px] text-[#6b6b73]">{new Date(data.lastUpdated).toLocaleTimeString()}</span>
      </div>

      {/* Trader Info */}
      <div className="px-3 py-2 border-b border-[#2d2d32]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-[#e6e6e6]">{data.login}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e21] text-[#c9a227]">{data.riskLevel}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[#6b6b73]">Classification: <span className="text-[#e6e6e6]">{data.classification}</span></span>
          <span className="text-[#6b6b73]">Risk: <span className="text-[#c9a227]">{data.riskScore.toFixed(0)}</span></span>
        </div>
      </div>

      {/* Explanation */}
      <div className="px-3 py-2 border-b border-[#2d2d32]">
        <p className="text-[10px] text-[#8b8b93] leading-relaxed">{data.explanation}</p>
      </div>

      {/* Metrics */}
      <div className="px-3 py-2 flex-1 overflow-auto">
        <span className="text-[9px] text-[#6b6b73] block mb-1.5">Key Metrics</span>
        <div className="space-y-1">
          {data.metrics.map((m, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-[#6b6b73]">{m.label}</span>
              <span className="font-mono" style={{ color: getMetricColor(m.status) }}>{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Action */}
      <div className="px-3 py-2 border-t border-[#2d2d32]">
        <button className="w-full text-[10px] text-[#2d7a7a] hover:text-[#358888]">Request Claude Explanation →</button>
      </div>
    </div>
  );
}

export default FallbackTemplatePanel;