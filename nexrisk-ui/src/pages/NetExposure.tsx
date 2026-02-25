import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-enterprise';

import type {
  ColDef,
  RowClickedEvent,
  GridReadyEvent,
  FirstDataRenderedEvent,
  GridSizeChangedEvent,
  ColumnVisibleEvent,
  ColumnRowGroupChangedEvent,
} from 'ag-grid-community';
import { themeQuartz } from 'ag-grid-community';
import { clsx } from 'clsx';

// ======================
// THEME (Quartz dark)
// ======================
const gridTheme = themeQuartz.withParams({
  backgroundColor: '#313032',
  browserColorScheme: 'dark',
  chromeBackgroundColor: { ref: 'foregroundColor', mix: 0.11, onto: 'backgroundColor' },
  fontFamily: { googleFont: 'IBM Plex Mono' },
  fontSize: 12,
  foregroundColor: '#FFF',
  headerFontSize: 11,
});

// ======================
// TYPES
// ======================
interface HedgeExposureRow {
  id: string;
  symbol: string;
  lp: string;
  lpAccount: string;
  clientNetVol: number;
  hedgeNetVol: number;
  brokerNetVol: number;
  clientNetNotional: number;
  hedgeNetNotional: number;
  brokerNetNotional: number;
  avgPrice: number;
  brokerFloatingPL: number;
  unhedgedLots: number;
  breakEvenPrice: number;
  probableIdp30: 'Up' | 'Down' | 'Neutral';
  bevh: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  marketMovePercent: number;
  plImpact: number;
}

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
  fix_execution_id: string;
  fix_message: string;
  lp_order_id: string;
  retry_attempts: number;
  reject_reason: string | null;
  commission: number;
  spread_at_execution: number;
  routing_node: string;
}

interface PredictionRow {
  id: string;
  symbol: string;
  description: string;
  targetTime: string;
  pred15High: number;
  pred15Trend: 'Up' | 'Down' | 'Neutral';
  pred15Low: number;
  pred30High: number;
  pred30Trend: 'Up' | 'Down' | 'Neutral';
  pred30Low: number;
  pred1hHigh: number;
  pred1hTrend: 'Up' | 'Down' | 'Neutral';
  pred1hLow: number;
  pred2hHigh: number;
  pred2hTrend: 'Up' | 'Down' | 'Neutral';
  pred2hLow: number;
}

// ======================
// MOCK DATA GENERATORS
// ======================
function generateMockHedges(count: number): ABookHedge[] {
  const symbols = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
  const sides: Array<'BUY' | 'SELL'> = ['BUY', 'SELL'];
  const lps = ['Lmax', 'Equity', 'CMC', 'FXCM', 'Currenex', 'Hotspot'];
  const rules = ['Default', 'High Volume', 'VIP Client', 'Scalper', 'News Event'];
  const profiles: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  const statuses: Array<'Completed' | 'Failed' | 'Rejected'> = ['Completed', 'Completed', 'Completed', 'Completed', 'Failed', 'Rejected'];

  const result: ABookHedge[] = [];
  for (let i = 0; i < count; i++) {
    const symbol = symbols[i % symbols.length];
    const isJPY = symbol.includes('JPY');
    const isXAU = symbol.includes('XAU');
    const isBTC = symbol.includes('BTC');
    const basePrice = isJPY ? 154.5 : isXAU ? 2024 : isBTC ? 42000 : 1.08 + Math.random() * 0.2;
    const client_price = basePrice + (Math.random() - 0.5) * 0.001 * basePrice;
    const lp_price = client_price + (Math.random() - 0.5) * 0.0005 * basePrice;
    const side = sides[Math.floor(Math.random() * 2)];
    const volume = Math.floor(Math.random() * 500 + 10) / 100;
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const lp = lps[Math.floor(Math.random() * lps.length)];
    const slippage = (lp_price - client_price) * (side === 'BUY' ? -1 : 1) * (isJPY ? 100 : 10000);

    result.push({
      id: `H${600000 + i}`,
      time: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
      login: 100000 + Math.floor(Math.random() * 900000),
      symbol,
      position_id: 600000 + i,
      side,
      volume,
      lp,
      rule: rules[Math.floor(Math.random() * rules.length)],
      profile: profiles[Math.floor(Math.random() * profiles.length)],
      client_price,
      lp_price,
      slippage: Math.round(slippage * 100) / 100,
      status,
      latency: Math.floor(Math.random() * 150 + 10),
      hedge_pnl: Math.round((Math.random() - 0.4) * 500 * 100) / 100,
      fix_execution_id: `FIX-${Date.now()}-${i}`,
      fix_message: `8=FIX.4.4|9=256|35=8|49=${lp}|56=NEXRISK|34=${i}|52=${new Date().toISOString()}|11=${600000 + i}|17=EXEC${i}|150=F|39=2|55=${symbol}|54=${side === 'BUY' ? '1' : '2'}|38=${volume}|44=${lp_price}|10=123|`,
      lp_order_id: `LP-${lp.toUpperCase()}-${Math.floor(Math.random() * 1000000)}`,
      retry_attempts: status === 'Completed' ? 0 : Math.floor(Math.random() * 3) + 1,
      reject_reason: status === 'Rejected' ? ['Price slippage', 'Insufficient liquidity', 'Quote expired'][Math.floor(Math.random() * 3)] : null,
      commission: Math.round(volume * 3.5 * 100) / 100,
      spread_at_execution: Math.round((Math.random() * 2 + 0.5) * 10) / 10,
      routing_node: `${lp.toLowerCase()}-gw${Math.floor(Math.random() * 4) + 1}.nexrisk.net:${9000 + Math.floor(Math.random() * 100)}`,
    });
  }
  return result;
}

function generateHedgeExposureData(hedges: ABookHedge[]): HedgeExposureRow[] {
  const symbolLpMap = new Map<string, Map<string, { clientNetVol: number; hedgeNetVol: number; avgPrice: number; lpAccount: string }>>();

  for (const h of hedges) {
    if (!symbolLpMap.has(h.symbol)) {
      symbolLpMap.set(h.symbol, new Map());
    }
    const lpMap = symbolLpMap.get(h.symbol)!;
    const lotValue = h.side === 'BUY' ? h.volume : -h.volume;
    const existing = lpMap.get(h.lp);

    if (existing) {
      existing.clientNetVol -= lotValue * (0.8 + Math.random() * 0.4);
      existing.hedgeNetVol += lotValue;
      existing.avgPrice = (existing.avgPrice + h.lp_price) / 2;
    } else {
      lpMap.set(h.lp, {
        clientNetVol: -lotValue * (0.8 + Math.random() * 0.4),
        hedgeNetVol: lotValue,
        avgPrice: h.lp_price,
        lpAccount: `${h.lp.toUpperCase()}-NET-${Math.floor(Math.random() * 100)}`,
      });
    }
  }

  const rows: HedgeExposureRow[] = [];
  let rowIndex = 0;
  const riskLevels: Array<'Low' | 'Medium' | 'High' | 'Critical'> = ['Low', 'Medium', 'High', 'Critical'];
  const trends: Array<'Up' | 'Down' | 'Neutral'> = ['Up', 'Down', 'Neutral'];

  symbolLpMap.forEach((lpMap, symbol) => {
    lpMap.forEach((data, lp) => {
      const isXAU = symbol.includes('XAU');
      const isBTC = symbol.includes('BTC');
      const isJPY = symbol.includes('JPY');
      const lotSize = isXAU ? 100 : isBTC ? 1 : 100000;

      const clientNetVol = Math.round(data.clientNetVol * 100) / 100;
      const hedgeNetVol = Math.round(data.hedgeNetVol * 100) / 100;
      const brokerNetVol = Math.round((clientNetVol + hedgeNetVol) * 100) / 100;

      const clientNetNotional = Math.round(clientNetVol * data.avgPrice * lotSize);
      const hedgeNetNotional = Math.round(hedgeNetVol * data.avgPrice * lotSize);
      const brokerNetNotional = Math.round(brokerNetVol * data.avgPrice * lotSize);

      const unhedgedLots = Math.abs(brokerNetVol);
      const marketMovePercent = Math.round((Math.random() * 2 + 0.1) * 100) / 100;
      const pipValue = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
      const plImpact = Math.round(unhedgedLots * lotSize * marketMovePercent * pipValue * 100) / 100;

      const breakEvenPrice = data.avgPrice + (brokerNetVol > 0 ? -1 : 1) * pipValue * Math.random() * 20;
      const bevh = Math.abs(brokerNetVol);
      const riskIdx = unhedgedLots > 5 ? 3 : unhedgedLots > 2 ? 2 : unhedgedLots > 0.5 ? 1 : 0;

      rows.push({
        id: `exp-${rowIndex++}`,
        symbol,
        lp,
        lpAccount: data.lpAccount,
        clientNetVol,
        hedgeNetVol,
        brokerNetVol,
        clientNetNotional,
        hedgeNetNotional,
        brokerNetNotional,
        avgPrice: data.avgPrice,
        brokerFloatingPL: Math.round((Math.random() - 0.4) * 5000 * 100) / 100,
        unhedgedLots,
        breakEvenPrice: Math.round(breakEvenPrice * 100000) / 100000,
        probableIdp30: trends[Math.floor(Math.random() * 3)],
        bevh: Math.round(bevh * 100) / 100,
        riskLevel: riskLevels[riskIdx],
        marketMovePercent,
        plImpact,
      });
    });
  });

  return rows;
}

const SYMBOL_DESCRIPTIONS: Record<string, string> = {
  EURUSD: 'EUR USD Spot',
  GBPUSD: 'GBP USD Spot',
  USDJPY: 'USD JPY Spot',
  XAUUSD: 'Gold Spot',
  BTCUSD: 'Bitcoin USD',
  AUDUSD: 'AUD USD Spot',
  NZDUSD: 'NZD USD Spot',
  USDCAD: 'USD CAD Spot',
  USDCHF: 'USD CHF Spot',
};

function generatePredictionData(symbol: string, basePrice: number): PredictionRow {
  const trends: Array<'Up' | 'Down' | 'Neutral'> = ['Up', 'Down', 'Neutral'];
  const now = new Date();
  const targetTime = new Date(now);
  targetTime.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);

  const variance = symbol.includes('JPY') ? 0.5 : symbol.includes('XAU') ? 10 : symbol.includes('BTC') ? 500 : 0.002;

  return {
    id: `pred-${symbol}`,
    symbol,
    description: SYMBOL_DESCRIPTIONS[symbol] || symbol,
    targetTime: targetTime.toISOString(),
    pred15High: Math.round((basePrice + variance * (0.5 + Math.random() * 0.5)) * 10000) / 10000,
    pred15Trend: trends[Math.floor(Math.random() * 3)],
    pred15Low: Math.round((basePrice - variance * (0.5 + Math.random() * 0.5)) * 10000) / 10000,
    pred30High: Math.round((basePrice + variance * (0.8 + Math.random() * 0.5)) * 10000) / 10000,
    pred30Trend: trends[Math.floor(Math.random() * 3)],
    pred30Low: Math.round((basePrice - variance * (0.8 + Math.random() * 0.5)) * 10000) / 10000,
    pred1hHigh: Math.round((basePrice + variance * (1.0 + Math.random() * 0.8)) * 10000) / 10000,
    pred1hTrend: trends[Math.floor(Math.random() * 3)],
    pred1hLow: Math.round((basePrice - variance * (1.0 + Math.random() * 0.8)) * 10000) / 10000,
    pred2hHigh: Math.round((basePrice + variance * (1.5 + Math.random() * 1.0)) * 10000) / 10000,
    pred2hTrend: trends[Math.floor(Math.random() * 3)],
    pred2hLow: Math.round((basePrice - variance * (1.5 + Math.random() * 1.0)) * 10000) / 10000,
  };
}

// ======================
// COMPONENT
// ======================
export function NetExposurePage() {
  const exposureGridRef = useRef<AgGridReact<HedgeExposureRow>>(null);

  const [selectedExposureRow, setSelectedExposureRow] = useState<HedgeExposureRow | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedLp, setSelectedLp] = useState<string | null>(null);
  const [volumeDisplayMode, setVolumeDisplayMode] = useState<'Lots' | 'Notional'>('Notional');

  const [domQuantity, setDomQuantity] = useState<string>('');
  const [domOrderType, setDomOrderType] = useState<'Market' | 'Limit'>('Market');
  const [domTif, setDomTif] = useState<'IOC' | 'FOK' | 'GTC'>('IOC');

  const [hedges] = useState<ABookHedge[]>(() => generateMockHedges(100));
  const hedgeExposureData = useMemo(() => generateHedgeExposureData(hedges), [hedges]);

  // Get available LPs for the selected symbol
  const availableLps = useMemo(() => {
    if (!selectedSymbol) return [];
    return [...new Set(hedgeExposureData.filter(r => r.symbol === selectedSymbol).map(r => r.lp))].sort();
  }, [selectedSymbol, hedgeExposureData]);

  // Get the active row based on symbol + LP selection
  const activeRow = useMemo(() => {
    if (!selectedSymbol || !selectedLp) return null;
    return hedgeExposureData.find(r => r.symbol === selectedSymbol && r.lp === selectedLp) || null;
  }, [selectedSymbol, selectedLp, hedgeExposureData]);

  const predictionData = useMemo<PredictionRow[]>(() => {
    if (!selectedSymbol) return [];
    const exposureRow = hedgeExposureData.find((r) => r.symbol === selectedSymbol);
    const basePrice = exposureRow?.avgPrice || 1.1;
    return [generatePredictionData(selectedSymbol, basePrice)];
  }, [selectedSymbol, hedgeExposureData]);

  // ======================
  // AUTO-FIT COLUMNS
  // ======================
  const fitColumns = useCallback(() => {
    const api = exposureGridRef.current?.api;
    if (!api) return;

    // getGridBodyClientRect was removed in AG Grid v32 — use the eGridDiv wrapper instead
    const eGrid = (exposureGridRef.current as any)?.eGridDiv as HTMLElement | undefined;
    const gridWidth = eGrid?.clientWidth ?? 0;
    if (gridWidth < 50) return;

    const displayedCols = api.getAllDisplayedColumns();
    if (!displayedCols || displayedCols.length === 0) return;

    try {
      api.autoSizeAllColumns(false);
    } catch {
      // no-op
    }

    const totalWidth = displayedCols.reduce((sum, c) => sum + (c.getActualWidth?.() ?? 0), 0);

    if (totalWidth > gridWidth) {
      try {
        api.sizeColumnsToFit();
      } catch {
        // no-op
      }
    }
  }, []);

  const onFirstDataRendered = useCallback(
    (_e: FirstDataRenderedEvent<HedgeExposureRow>) => {
      requestAnimationFrame(() => fitColumns());
      setTimeout(() => fitColumns(), 50);
    },
    [fitColumns]
  );

  const onGridSizeChanged = useCallback(
    (_e: GridSizeChangedEvent<HedgeExposureRow>) => {
      fitColumns();
    },
    [fitColumns]
  );

  const onColumnVisible = useCallback(
    (_e: ColumnVisibleEvent) => {
      fitColumns();
    },
    [fitColumns]
  );

  const onColumnRowGroupChanged = useCallback(
    (_e: ColumnRowGroupChangedEvent) => {
      fitColumns();
    },
    [fitColumns]
  );

  useEffect(() => {
    setTimeout(() => fitColumns(), 50);
  }, [fitColumns]);

  useEffect(() => {
    setTimeout(() => fitColumns(), 50);
  }, [volumeDisplayMode, fitColumns]);

  // ======================
  // COLUMN DEFINITIONS - NEW SIMPLER STRUCTURE
  // ======================
  const exposureColDefs = useMemo<ColDef<HedgeExposureRow>[]>(() => {
    const fmtLots = (val: number) => `${val > 0 ? '+' : ''}${val.toFixed(2)}`;
    const fmtNotional = (val: number) => {
      const absVal = Math.abs(val);
      let formatted: string;
      if (absVal >= 1000000) {
        formatted = `${(absVal / 1000000).toFixed(2)}M`;
      } else if (absVal >= 1000) {
        formatted = `${(absVal / 1000).toFixed(1)}K`;
      } else {
        formatted = absVal.toFixed(0);
      }
      return `${val < 0 ? '-' : '+'}$${formatted}`;
    };
    const volColor = (val: number) => ({ color: val > 0 ? '#4ecdc4' : val < 0 ? '#ff6b6b' : '#999' });
    const plColor = (val: number) => ({ color: val > 0 ? '#4ecdc4' : val < 0 ? '#ff6b6b' : '#999' });

    const signalColor = (signal: string) => {
      if (signal.startsWith('Hdg')) return '#4ecdc4';
      if (signal.startsWith('Opp')) return '#e0a020';
      return '#666';
    };

    return [
      { field: 'symbol', headerName: 'Symbol', rowGroup: true, hide: true },
      { field: 'lp', headerName: 'LP', filter: 'agSetColumnFilter' },
      { field: 'lpAccount', headerName: 'Account', filter: 'agTextColumnFilter' },
      {
        field: volumeDisplayMode === 'Lots' ? 'brokerNetVol' : 'brokerNetNotional',
        headerName: 'Net Vol.',
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
        aggFunc: 'sum',
        valueFormatter: (p) => (p.value == null ? '' : volumeDisplayMode === 'Lots' ? fmtLots(Number(p.value)) : fmtNotional(Number(p.value))),
        cellStyle: (p) => (p.value != null ? volColor(Number(p.value)) : {}),
      },
      {
        field: 'breakEvenPrice',
        headerName: 'Break-Even Px',
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
        aggFunc: 'avg',
        valueFormatter: (p) => (p.value != null ? Number(p.value).toFixed(5) : ''),
      },
      {
        field: 'avgPrice',
        headerName: 'Mkt Px',
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
        aggFunc: 'avg',
        valueFormatter: (p) => (p.value != null ? Number(p.value).toFixed(5) : ''),
      },
      {
        field: 'brokerFloatingPL',
        headerName: 'Broker P/L',
        filter: 'agNumberColumnFilter',
        type: 'rightAligned',
        aggFunc: 'sum',
        valueFormatter: (p) => {
          if (p.value == null) return '';
          const val = Number(p.value);
          return `${val >= 0 ? '+' : ''}$${val.toFixed(0)}`;
        },
        cellStyle: (p) => (p.value != null ? plColor(Number(p.value)) : {}),
      },
      {
        field: 'signal',
        headerName: 'Signal',
        valueGetter: (p) => {
          if (!p.data) return '—';
          // Generate signal based on row data
          const signals = ['Hdg@15m', 'Hdg@30m', 'Hdg@1h', 'Hdg@2h', 'Opp@15m', 'Opp@30m', 'Opp@1h', 'Opp@2h', '—'];
          const idx = Math.abs(p.data.id.charCodeAt(4) || 0) % signals.length;
          return signals[idx];
        },
        cellStyle: (p) => ({ color: signalColor(p.value || '—') }),
      },
    ];
  }, [volumeDisplayMode]);

  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      suppressSizeToFit: false,
    }),
    []
  );

  const autoGroupColumnDef = useMemo<ColDef>(
    () => ({
      headerName: 'Symbol',
      minWidth: 150,
      cellRendererParams: { suppressCount: false },
    }),
    []
  );

  const onExposureGridReady = useCallback(
    (event: GridReadyEvent<HedgeExposureRow>) => {
      setTimeout(() => {
        const firstRowNode = event.api.getDisplayedRowAtIndex(0);
        if (firstRowNode && firstRowNode.group) {
          firstRowNode.setExpanded(true);
        }
        fitColumns();
      }, 100);
    },
    [fitColumns]
  );

  const onExposureRowClicked = useCallback((event: RowClickedEvent<HedgeExposureRow>) => {
    if (event.data) {
      // LP row clicked - set both symbol and LP
      setSelectedExposureRow(event.data);
      setSelectedSymbol(event.data.symbol);
      setSelectedLp(event.data.lp);
      setDomQuantity(Math.abs(event.data.brokerNetNotional).toString());
    } else if (event.node.group && event.node.key) {
      // Symbol row clicked - set symbol, clear LP
      setSelectedSymbol(event.node.key);
      setSelectedLp(null);
      setSelectedExposureRow(null);
      setDomQuantity('');
    }
  }, []);

  const onExposureCellClicked = useCallback((event: { data?: HedgeExposureRow; node?: { group?: boolean; key?: string } }) => {
    if (event.data) {
      // LP row clicked - set both symbol and LP
      setSelectedExposureRow(event.data);
      setSelectedSymbol(event.data.symbol);
      setSelectedLp(event.data.lp);
      setDomQuantity(Math.abs(event.data.brokerNetNotional).toString());
    } else if (event.node?.group && event.node?.key) {
      // Symbol row clicked - set symbol, clear LP
      setSelectedSymbol(event.node.key);
      setSelectedLp(null);
      setSelectedExposureRow(null);
      setDomQuantity('');
    }
  }, []);

  const domData = useMemo(() => {
    if (!activeRow) return null;

    const basePrice = activeRow.avgPrice;
    const isJPY = activeRow.symbol.includes('JPY');
    const isXAU = activeRow.symbol.includes('XAU');
    const isBTC = activeRow.symbol.includes('BTC');
    const pipSize = isJPY ? 0.01 : isXAU ? 0.1 : isBTC ? 1 : 0.0001;
    const decimals = isJPY ? 3 : isXAU ? 2 : isBTC ? 2 : 5;

    const spread = pipSize * (2 + Math.random() * 3);
    const bidBase = basePrice - spread / 2;
    const askBase = basePrice + spread / 2;

    const levels = 5;
    const bids: Array<{ price: number; size: number }> = [];
    const asks: Array<{ price: number; size: number }> = [];

    for (let i = 0; i < levels; i++) {
      bids.push({ price: bidBase - i * pipSize, size: Math.round((10 + Math.random() * 200) * 100) / 100 });
      asks.push({ price: askBase + i * pipSize, size: Math.round((10 + Math.random() * 200) * 100) / 100 });
    }

    const last = bidBase + Math.random() * spread;
    const open = last * (1 + (Math.random() - 0.5) * 0.002);
    const high = Math.max(last, open) * (1 + Math.random() * 0.001);
    const low = Math.min(last, open) * (1 - Math.random() * 0.001);
    const change = ((last - open) / open) * 100;

    return {
      symbol: activeRow.symbol,
      lp: activeRow.lp,
      last: last.toFixed(decimals),
      open: open.toFixed(decimals),
      high: high.toFixed(decimals),
      low: low.toFixed(decimals),
      change: change.toFixed(2),
      volume: '-',
      bids,
      asks,
      decimals,
    };
  }, [activeRow]);

  // Format time helper
  const formatTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: '#313032' }}>
      {/* Page Header */}
      <div className="px-4 py-2 border-b border-[#808080]">
        <h1 className="text-lg font-semibold text-white">Net Exposure</h1>
        <p className="text-xs text-[#999]">Live hedge exposure by symbol and LP</p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden px-2 pt-2 pb-12">
        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-2">
          <button
            onClick={() => exposureGridRef.current?.api?.expandAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={() => exposureGridRef.current?.api?.collapseAll()}
            className="px-3 py-1 text-xs text-[#999] hover:text-white border border-[#555] hover:border-[#666] rounded transition-colors"
          >
            Collapse All
          </button>

          <div className="h-4 w-px bg-[#555]" />

          {/* iOS-style Toggle Switch */}
          <div className="flex items-center gap-2">
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Lots' ? 'text-white' : 'text-[#666]')}>Lots</span>
            <button
              onClick={() => setVolumeDisplayMode(volumeDisplayMode === 'Lots' ? 'Notional' : 'Lots')}
              className={clsx(
                'relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out p-0.5',
                volumeDisplayMode === 'Notional' ? 'bg-[#4ecdc4]' : 'bg-[#555]'
              )}
            >
              <span
                className={clsx(
                  'block w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ease-in-out',
                  volumeDisplayMode === 'Notional' ? 'translate-x-5' : 'translate-x-0'
                )}
              />
            </button>
            <span className={clsx('text-xs transition-colors', volumeDisplayMode === 'Notional' ? 'text-white' : 'text-[#666]')}>Notional</span>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden gap-2 min-h-0">
          {/* Left Column */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Main Grid */}
            <div className="flex-1 min-h-0">
              <AgGridReact<HedgeExposureRow>
                ref={exposureGridRef}
                theme={gridTheme}
                rowData={hedgeExposureData}
                columnDefs={exposureColDefs}
                defaultColDef={defaultColDef}
                autoGroupColumnDef={autoGroupColumnDef}
                groupDefaultExpanded={0}
                suppressAggFuncInHeader={true}
                autoSizeStrategy={{ type: 'fitCellContents' }}
                rowHeight={28}
                headerHeight={36}
                onGridReady={onExposureGridReady}
                onFirstDataRendered={onFirstDataRendered}
                onGridSizeChanged={onGridSizeChanged}
                onColumnVisible={onColumnVisible}
                onColumnRowGroupChanged={onColumnRowGroupChanged}
                onRowClicked={onExposureRowClicked}
                onCellClicked={onExposureCellClicked}
                rowSelection={{ mode: 'singleRow', enableClickSelection: true }}
                sideBar={{
                  toolPanels: [
                    {
                      id: 'columns',
                      labelDefault: 'Columns',
                      labelKey: 'columns',
                      iconKey: 'columns',
                      toolPanel: 'agColumnsToolPanel',
                      toolPanelParams: {
                        suppressRowGroups: true,
                        suppressValues: true,
                        suppressPivots: true,
                        suppressPivotMode: true,
                      },
                    },
                  ],
                  defaultToolPanel: '',
                }}
              />
            </div>

            {/* Prediction Section */}
            <div className="border-t border-[#555] mt-2 pt-2 mb-8" style={{ height: '140px', flexShrink: 0 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Intraday: Monitor</span>
                  {selectedSymbol && <span className="text-xs text-[#4ecdc4] bg-[#333] px-2 py-0.5 rounded">{selectedSymbol}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-[#666]">
                  <span>
                    Current:{' '}
                    {new Date().toLocaleString('en-US', {
                      month: 'numeric',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                    })}{' '}
                    ET
                  </span>
                </div>
              </div>

              {selectedSymbol && predictionData[0] ? (
                <table className="w-full text-xs border border-[#555]" style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
                  <colgroup>
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                    <col style={{ width: '25%' }} />
                  </colgroup>
                  <thead>
                    <tr style={{ backgroundColor: '#1a1a1c' }}>
                      {(['15 Minutes', '30 Minutes', '1 Hour', '2 Hours'] as const).map((period, i) => {
                        const now = new Date();
                        const target = new Date(now);
                        target.setMinutes(Math.floor(now.getMinutes() / 15) * 15, 0, 0);
                        const offsets = [15, 30, 60, 120];
                        const start = new Date(target.getTime() - offsets[i] * 60000);
                        return (
                          <th key={period} className="py-2 px-3 text-left border-r border-[#555] last:border-r-0">
                            <div className="text-white font-medium">{period}</div>
                            <div className="text-[#4ecdc4] text-[10px] font-normal">
                              {formatTime(start)} - {formatTime(target)}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                    <tr style={{ backgroundColor: '#232225' }}>
                      {[0, 1, 2, 3].map((i) => (
                        <th key={i} className="border-r border-[#555] last:border-r-0 p-0">
                          <div className="grid grid-cols-3 text-[#999] font-normal">
                            <span className="py-1 px-2 text-right border-r border-[#444]">High</span>
                            <span className="py-1 px-2 text-center border-r border-[#444]">Trend</span>
                            <span className="py-1 px-2 text-right">Low</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ backgroundColor: '#313032' }}>
                      <td className="border-r border-[#555] p-0">
                        <div className="grid grid-cols-3 text-white font-mono">
                          <span className="py-2 px-2 text-right border-r border-[#444]">{predictionData[0].pred15High.toFixed(4)}</span>
                          <span className={clsx('py-2 px-2 text-center border-r border-[#444]', predictionData[0].pred15Trend === 'Up' ? 'text-[#4ecdc4]' : predictionData[0].pred15Trend === 'Down' ? 'text-[#ff6b6b]' : 'text-[#999]')}>
                            {predictionData[0].pred15Trend}
                          </span>
                          <span className="py-2 px-2 text-right">{predictionData[0].pred15Low.toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="border-r border-[#555] p-0">
                        <div className="grid grid-cols-3 text-white font-mono">
                          <span className="py-2 px-2 text-right border-r border-[#444]">{predictionData[0].pred30High.toFixed(4)}</span>
                          <span className={clsx('py-2 px-2 text-center border-r border-[#444]', predictionData[0].pred30Trend === 'Up' ? 'text-[#4ecdc4]' : predictionData[0].pred30Trend === 'Down' ? 'text-[#ff6b6b]' : 'text-[#999]')}>
                            {predictionData[0].pred30Trend}
                          </span>
                          <span className="py-2 px-2 text-right">{predictionData[0].pred30Low.toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="border-r border-[#555] p-0">
                        <div className="grid grid-cols-3 text-white font-mono">
                          <span className="py-2 px-2 text-right border-r border-[#444]">{predictionData[0].pred1hHigh.toFixed(4)}</span>
                          <span className={clsx('py-2 px-2 text-center border-r border-[#444]', predictionData[0].pred1hTrend === 'Up' ? 'text-[#4ecdc4]' : predictionData[0].pred1hTrend === 'Down' ? 'text-[#ff6b6b]' : 'text-[#999]')}>
                            {predictionData[0].pred1hTrend}
                          </span>
                          <span className="py-2 px-2 text-right">{predictionData[0].pred1hLow.toFixed(4)}</span>
                        </div>
                      </td>
                      <td className="p-0">
                        <div className="grid grid-cols-3 text-white font-mono">
                          <span className="py-2 px-2 text-right border-r border-[#444]">{predictionData[0].pred2hHigh.toFixed(4)}</span>
                          <span className={clsx('py-2 px-2 text-center border-r border-[#444]', predictionData[0].pred2hTrend === 'Up' ? 'text-[#4ecdc4]' : predictionData[0].pred2hTrend === 'Down' ? 'text-[#ff6b6b]' : 'text-[#999]')}>
                            {predictionData[0].pred2hTrend}
                          </span>
                          <span className="py-2 px-2 text-right">{predictionData[0].pred2hLow.toFixed(4)}</span>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <div className="h-20 flex items-center justify-center text-[#555] text-sm border border-[#555] rounded">
                  Select an instrument to view prediction data
                </div>
              )}
            </div>
          </div>

          {/* DOM Panel */}
          <div className="flex flex-col border border-[#555] rounded overflow-hidden" style={{ width: '320px', backgroundColor: '#232225' }}>
            <div className="px-3 py-2 border-b border-[#555] flex items-center justify-between" style={{ backgroundColor: '#1a1a1c' }}>
              <span className="text-sm font-medium text-white">Market Depth</span>
              <div className="flex items-center gap-2">
                <div
                  className={clsx('w-2 h-2 rounded-full', activeRow ? 'bg-[#4ecdc4]' : 'bg-[#555]')}
                  title={activeRow ? 'Connected' : 'No LP Selected'}
                />
              </div>
            </div>

            <div className="px-3 py-2 border-b border-[#555]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#666] bg-[#333] px-1.5 py-0.5 rounded">FX</span>
                  <span className="text-sm font-semibold text-white">{selectedSymbol || '—'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-[#666]">LP:</span>
                  <select
                    value={selectedLp || ''}
                    onChange={(e) => {
                      const lp = e.target.value;
                      if (lp) {
                        setSelectedLp(lp);
                        const row = hedgeExposureData.find(r => r.symbol === selectedSymbol && r.lp === lp);
                        if (row) {
                          setSelectedExposureRow(row);
                          setDomQuantity(Math.abs(row.brokerNetNotional).toString());
                        }
                      } else {
                        setSelectedLp(null);
                        setSelectedExposureRow(null);
                        setDomQuantity('');
                      }
                    }}
                    disabled={!selectedSymbol || availableLps.length === 0}
                    className={clsx(
                      'bg-[#2a2a2c] border border-[#555] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#4ecdc4]',
                      (!selectedSymbol || availableLps.length === 0) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <option value="">Select LP</option>
                    {availableLps.map(lp => (
                      <option key={lp} value={lp}>{lp}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="px-3 py-2 border-b border-[#555] grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-[#666]">Last </span>
                <span className="text-white font-mono">{domData?.last || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Open </span>
                <span className="text-white font-mono">{domData?.open || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Chg </span>
                <span className={clsx('font-mono', domData && Number(domData.change) >= 0 ? 'text-[#4ecdc4]' : domData ? 'text-[#ff6b6b]' : 'text-[#555]')}>
                  {domData ? `${Number(domData.change) >= 0 ? '+' : ''}${domData.change}` : '—'}
                </span>
              </div>
              <div>
                <span className="text-[#666]">High </span>
                <span className="text-white font-mono">{domData?.high || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Vol </span>
                <span className="text-white font-mono">{domData?.volume || '—'}</span>
              </div>
              <div>
                <span className="text-[#666]">Low </span>
                <span className="text-white font-mono">{domData?.low || '—'}</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-2 py-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[#666]">
                    <th className="text-right py-1 pr-2 font-medium">Size</th>
                    <th className="text-center py-1 font-medium">Bid</th>
                    <th className="text-center py-1 font-medium">Ask</th>
                    <th className="text-left py-1 pl-2 font-medium">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {domData ? (
                    domData.bids.map((bid, i) => {
                      const ask = domData.asks[i];
                      const maxSize = Math.max(...domData.bids.map((b) => b.size), ...domData.asks.map((a) => a.size));
                      const bidWidth = (bid.size / maxSize) * 100;
                      const askWidth = (ask.size / maxSize) * 100;
                      return (
                        <tr key={i} className="relative">
                          <td className="text-right py-1 pr-2 relative">
                            <div className="absolute right-0 top-0 bottom-0 opacity-40" style={{ width: `${bidWidth}%`, backgroundColor: '#4ecdc4' }} />
                            <span className="relative text-[#4ecdc4] font-mono">{bid.size.toFixed(2)}</span>
                          </td>
                          <td className="text-center py-1">
                            <span className="text-[#4ecdc4] font-mono font-medium">{bid.price.toFixed(domData.decimals)}</span>
                          </td>
                          <td className="text-center py-1">
                            <span className="text-[#e0a020] font-mono font-medium">{ask.price.toFixed(domData.decimals)}</span>
                          </td>
                          <td className="text-left py-1 pl-2 relative">
                            <div className="absolute left-0 top-0 bottom-0 opacity-40" style={{ width: `${askWidth}%`, backgroundColor: '#e0a020' }} />
                            <span className="relative text-[#e0a020] font-mono">{ask.size.toFixed(2)}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    [0, 1, 2, 3, 4].map((i) => (
                      <tr key={i} className="relative">
                        <td className="text-right py-1 pr-2 text-[#555] font-mono">—</td>
                        <td className="text-center py-1 text-[#555] font-mono">—</td>
                        <td className="text-center py-1 text-[#555] font-mono">—</td>
                        <td className="text-left py-1 pl-2 text-[#555] font-mono">—</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Order Entry */}
            <div className="px-3 py-3 border-t border-[#555]" style={{ backgroundColor: '#1a1a1c' }}>
              <div className="flex gap-2 mb-3">
                <select
                  value={domOrderType}
                  onChange={(e) => setDomOrderType(e.target.value as 'Market' | 'Limit')}
                  disabled={!activeRow}
                  className={clsx(
                    'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]',
                    !activeRow && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <option value="Market">Market</option>
                  <option value="Limit">Limit</option>
                </select>
                <select
                  value={domTif}
                  onChange={(e) => setDomTif(e.target.value as 'IOC' | 'FOK' | 'GTC')}
                  disabled={!activeRow}
                  className={clsx(
                    'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#4ecdc4]',
                    !activeRow && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <option value="IOC">IOC</option>
                  <option value="FOK">FOK</option>
                  <option value="GTC">GTC</option>
                </select>
              </div>

              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={domQuantity}
                    onChange={(e) => {
                      if (!activeRow) return;
                      const val = e.target.value.replace(/[^0-9.]/g, '');
                      const maxVal = Math.abs(activeRow.brokerNetNotional);
                      const numVal = parseFloat(val) || 0;
                      if (numVal <= maxVal) setDomQuantity(val);
                    }}
                    disabled={!activeRow}
                    className={clsx(
                      'flex-1 bg-[#2a2a2c] border border-[#555] rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ecdc4]',
                      !activeRow && 'opacity-50 cursor-not-allowed'
                    )}
                    placeholder="Quantity"
                  />
                  <div className="flex flex-col">
                    <button
                      onClick={() => {
                        if (!activeRow) return;
                        const current = parseFloat(domQuantity) || 0;
                        const maxVal = Math.abs(activeRow.brokerNetNotional);
                        const step = maxVal * 0.1;
                        setDomQuantity(Math.min(current + step, maxVal).toFixed(0));
                      }}
                      disabled={!activeRow}
                      className={clsx('px-1 py-0.5 text-[#999] hover:text-white text-[10px]', !activeRow && 'opacity-50 cursor-not-allowed')}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => {
                        if (!activeRow) return;
                        const current = parseFloat(domQuantity) || 0;
                        const step = Math.abs(activeRow.brokerNetNotional) * 0.1;
                        setDomQuantity(Math.max(current - step, 0).toFixed(0));
                      }}
                      disabled={!activeRow}
                      className={clsx('px-1 py-0.5 text-[#999] hover:text-white text-[10px]', !activeRow && 'opacity-50 cursor-not-allowed')}
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-[#666] mt-1">
                  Max: {activeRow ? `$${Math.abs(activeRow.brokerNetNotional).toLocaleString()}` : '—'}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={!activeRow || activeRow.brokerNetNotional >= 0}
                  className={clsx(
                    'flex-1 py-2 rounded text-xs font-semibold transition-colors',
                    activeRow && activeRow.brokerNetNotional < 0
                      ? 'bg-[#4ecdc4] hover:bg-[#3dbdb5] text-black'
                      : 'bg-[#3a3a3c] text-[#555] cursor-not-allowed'
                  )}
                >
                  Close Buy
                </button>
                <button
                  disabled={!activeRow}
                  className={clsx(
                    'flex-1 py-2 rounded text-xs font-medium bg-[#2a2a2c] border border-[#555] transition-colors',
                    activeRow ? 'text-[#999] hover:text-white hover:border-[#666]' : 'text-[#555] cursor-not-allowed'
                  )}
                >
                  Cancel All
                </button>
                <button
                  disabled={!activeRow || activeRow.brokerNetNotional <= 0}
                  className={clsx(
                    'flex-1 py-2 rounded text-xs font-semibold transition-colors',
                    activeRow && activeRow.brokerNetNotional > 0
                      ? 'bg-[#e0a020] hover:bg-[#c89018] text-black'
                      : 'bg-[#3a3a3c] text-[#555] cursor-not-allowed'
                  )}
                >
                  Close Sell
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-[#555]">
                <div className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Order Execution</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#666]">Position ID: </span>
                    <span className="text-white font-mono">{activeRow ? `POS-${activeRow.id.split('-')[1] || '000'}` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[#666]">FIX ID: </span>
                    <span className="text-white font-mono">{activeRow ? `FIX-${Date.now().toString().slice(-8)}` : '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NetExposurePage;