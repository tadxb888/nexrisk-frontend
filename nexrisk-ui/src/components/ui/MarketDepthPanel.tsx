// ============================================
// Market Depth Panel - with collapse
// ============================================

import { useState, useEffect } from 'react';
import { clsx } from 'clsx';

interface MarketDepthPanelProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
  onCollapse?: () => void;
  className?: string;
}

interface DepthLevel {
  price: number;
  size: number;
}

function generateMockDepth(symbol: string) {
  const basePrice = symbol === 'USDJPY' ? 154.5 : symbol === 'XAUUSD' ? 2024 : symbol === 'BTCUSD' ? 42000 : 1.08544;
  const spread = symbol.includes('XAU') ? 0.50 : 0.00012;
  const mid = basePrice;
  
  return {
    last: mid,
    open: mid - 0.00023,
    high: mid + 0.00089,
    low: mid - 0.00156,
    change: 0.00023,
    bids: Array.from({ length: 5 }, (_, i) => ({ price: mid - spread/2 - (i * spread * 0.5), size: Math.floor(Math.random() * 500 + 100) / 100 })),
    asks: Array.from({ length: 5 }, (_, i) => ({ price: mid + spread/2 + (i * spread * 0.5), size: Math.floor(Math.random() * 500 + 100) / 100 })),
  };
}

function formatPrice(price: number, symbol: string): string {
  if (symbol.includes('JPY')) return price.toFixed(3);
  if (symbol.includes('XAU') || symbol.includes('BTC')) return price.toFixed(2);
  return price.toFixed(5);
}

export function MarketDepthPanel({ symbol: initSymbol, onSymbolChange, onCollapse, className }: MarketDepthPanelProps) {
  const [symbol, setSymbol] = useState(initSymbol || 'EURUSD');
  const [data, setData] = useState<ReturnType<typeof generateMockDepth> | null>(null);
  const [orderSize, setOrderSize] = useState(0.01);

  useEffect(() => { setSymbol(initSymbol); }, [initSymbol]);
  useEffect(() => {
    setData(generateMockDepth(symbol));
    const iv = setInterval(() => setData(generateMockDepth(symbol)), 1000);
    return () => clearInterval(iv);
  }, [symbol]);

  const handleSymbolChange = (s: string) => { setSymbol(s); onSymbolChange?.(s); };

  if (!data) return <div className={clsx('flex items-center justify-center text-[#6b6b73]', className)}>Loading...</div>;

  const bestBid = data.bids[0]?.price || 0;
  const bestAsk = data.asks[0]?.price || 0;
  const spread = bestAsk - bestBid;

  return (
    <div className={clsx('flex flex-col bg-[#141416]', className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-[#2d2d32] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#8b8b93]">Market depth</span>
          <span className="text-xs font-mono text-[#2d7a7a]">{symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#448b55]" />
          {onCollapse && (
            <button onClick={onCollapse} className="p-0.5 hover:bg-[#2d2d32] rounded">
              <svg className="w-3.5 h-3.5 text-[#6b6b73]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Symbol Select */}
      <div className="px-3 py-2 border-b border-[#2d2d32]">
        <select value={symbol} onChange={(e) => handleSymbolChange(e.target.value)}
          className="w-full bg-[#0d0d0e] border border-[#2d2d32] rounded px-2 py-1 text-xs font-mono text-[#e6e6e6] focus:outline-none focus:border-[#3d5a5a]">
          <option value="EURUSD">EURUSD</option>
          <option value="GBPUSD">GBPUSD</option>
          <option value="USDJPY">USDJPY</option>
          <option value="XAUUSD">XAUUSD</option>
          <option value="BTCUSD">BTCUSD</option>
        </select>
      </div>

      {/* Price Stats */}
      <div className="px-3 py-2 border-b border-[#2d2d32] grid grid-cols-3 gap-2 text-[10px]">
        <div><span className="text-[#6b6b73]">Last</span><p className="font-mono text-[#e6e6e6]">{formatPrice(data.last, symbol)}</p></div>
        <div><span className="text-[#6b6b73]">Open</span><p className="font-mono text-[#e6e6e6]">{formatPrice(data.open, symbol)}</p></div>
        <div><span className="text-[#6b6b73]">Change</span><p className={clsx('font-mono', data.change >= 0 ? 'text-[#448b55]' : 'text-[#8b4444]')}>{data.change >= 0 ? '+' : ''}{formatPrice(data.change, symbol)}</p></div>
        <div><span className="text-[#6b6b73]">High</span><p className="font-mono text-[#e6e6e6]">{formatPrice(data.high, symbol)}</p></div>
        <div><span className="text-[#6b6b73]">Low</span><p className="font-mono text-[#e6e6e6]">{formatPrice(data.low, symbol)}</p></div>
      </div>

      {/* Depth Table */}
      <div className="flex-1 px-3 py-2 overflow-hidden">
        <div className="grid grid-cols-4 gap-1 text-[9px] text-[#6b6b73] mb-1">
          <span>Size</span><span className="text-right">Bid</span><span className="text-right">Ask</span><span className="text-right">Size</span>
        </div>
        <div className="space-y-0.5">
          {data.bids.slice(0, 5).map((bid, i) => (
            <div key={i} className="grid grid-cols-4 gap-1 text-[10px] font-mono">
              <span className="text-[#2d7a7a]">{bid.size.toFixed(2)}</span>
              <span className="text-right text-[#2d7a7a]">{formatPrice(bid.price, symbol)}</span>
              <span className="text-right text-[#c9a227]">{formatPrice(data.asks[i]?.price || 0, symbol)}</span>
              <span className="text-right text-[#c9a227]">{(data.asks[i]?.size || 0).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-[#2d2d32] text-[10px] text-center text-[#6b6b73]">
          Spread: {formatPrice(spread, symbol)} ({(spread / data.last * 10000).toFixed(1)} pips)
        </div>
      </div>

      {/* Order Entry */}
      <div className="px-3 py-2 border-t border-[#2d2d32] space-y-2">
        <input type="number" value={orderSize} onChange={(e) => setOrderSize(parseFloat(e.target.value) || 0.01)} step="0.01" min="0.01"
          className="w-full bg-[#0d0d0e] border border-[#2d2d32] rounded px-2 py-1.5 text-xs font-mono text-[#e6e6e6] text-center focus:outline-none focus:border-[#3d5a5a]" />
        <div className="grid grid-cols-3 gap-2">
          <button className="py-1.5 rounded text-xs font-medium bg-[#2d7a7a] hover:bg-[#358888] text-[#e6e6e6]">Buy</button>
          <button className="py-1.5 rounded text-xs font-medium bg-[#1e1e21] hover:bg-[#2d2d32] text-[#8b8b93] border border-[#2d2d32]">Cancel</button>
          <button className="py-1.5 rounded text-xs font-medium bg-[#8b4444] hover:bg-[#9b5454] text-[#e6e6e6]">Sell</button>
        </div>
      </div>
    </div>
  );
}

export default MarketDepthPanel;