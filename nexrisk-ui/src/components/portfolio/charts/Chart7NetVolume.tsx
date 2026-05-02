// ============================================
// Chart7NetVolume — A/B/C Net Volume (WS-driven)
//
// Subscribes to portfolio.exposure.symbols, a live WebSocket topic
// pushed by the C++ broadcaster on its standard ≈1 Hz Recompute
// cadence (debounced under tick storms). Replaces the legacy REST
// polling + manual refresh + as_of staleness UX, which depended on
// the now-retired ExposureEngine snapshot writer.
//
// Layout:
//   • Pie chart of A/B/C book net volumes.
//     - Slice SIZE  = absolute value of net_lots (pie can't show negatives).
//     - Slice LABEL = signed value (e.g. "A: +1240" or "B: -820").
//     - Slice COLOR = book brand color regardless of sign.
//   • Click a slice → drill-down table of by_symbol contributors to
//     that book appears below. Click again to deselect.
//   • Now includes per-symbol C-Book breakdown (c_book_lots), which
//     the legacy REST shape lacked. The "no C breakdown" placeholder
//     is gone.
//
// `period` prop is in the signature for ChartComponentProps compat —
// this chart ignores it (live snapshot, no period semantics).
// ============================================

import { useEffect, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import {
  connectPortfolioExposureWebSocket,
  type PortfolioExposureSymbolsData,
  type PortfolioExposureSymbolRow,
} from '@/services/api';
import { BOOK_COLORS } from './bookColors';

const COLOR_A = BOOK_COLORS.a;
const COLOR_B = BOOK_COLORS.b;
const COLOR_C = BOOK_COLORS.c;

type BookKey = 'a' | 'b' | 'c';
type WsStatus = 'connecting' | 'open' | 'closed' | 'error';

interface PieDatum {
  key:    BookKey;
  name:   string;
  value:  number;     // absolute value, drives slice size
  signed: number;     // original signed value, for labels/tooltip
  color:  string;
}

// ── Format helpers ─────────────────────────────────────────────
function fmtLots(n: number | null | undefined): string {
  if (n == null) return '—';
  const abs  = Math.abs(n);
  const sign = n < 0 ? '-' : (n > 0 ? '+' : '');
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(2)}k`;
  return `${sign}${abs.toFixed(2)}`;
}

// ── Component ──────────────────────────────────────────────────
export function Chart7NetVolume(_props: ChartComponentProps) {
  const [data,    setData]    = useState<PortfolioExposureSymbolsData | null>(null);
  const [status,  setStatus]  = useState<WsStatus>('connecting');

  // Which book's contributors are showing in the drill-down table.
  // null = pie shown alone, no table.
  const [selectedBook, setSelectedBook] = useState<BookKey | null>(null);

  // ── WS subscription ──────────────────────────────────────────
  useEffect(() => {
    setStatus('connecting');
    const cleanup = connectPortfolioExposureWebSocket(
      (event) => {
        if (event.type === 'SNAPSHOT') {
          setData(event.data);
        }
      },
      (s) => setStatus(s),
    );
    return cleanup;
  }, []);

  // ── Render branches ──────────────────────────────────────────
  if (!data && status === 'connecting') {
    return <BodyMessage>Connecting…</BodyMessage>;
  }
  if (!data && status === 'error') {
    return <BodyMessage tone="error">Connection error</BodyMessage>;
  }
  if (!data && status === 'closed') {
    return <BodyMessage tone="error">Disconnected</BodyMessage>;
  }
  if (!data) {
    return <BodyMessage>Waiting for data…</BodyMessage>;
  }

  // ── Build pie data ───────────────────────────────────────────
  // Slices stay in canonical A/B/C order regardless of magnitude so
  // colors map consistently turn-to-turn.
  //
  // Zero-net handling: a slice with value=0 is drawn as zero size →
  // entirely missing from the pie, which reads as a bug. Substitute a
  // small placeholder size (5% of the max real |net|, floor 1) so the
  // user always sees three colored slices labelled with real values.
  // The `signed` field carries the true value through to label and
  // tooltip — only the rendering size is fudged.
  const rawAbs = {
    a: Math.abs(data.totals.a_book_net_lots),
    b: Math.abs(data.totals.b_book_net_lots),
    c: Math.abs(data.totals.c_book_net_lots),
  };
  const maxAbs = Math.max(rawAbs.a, rawAbs.b, rawAbs.c);
  const placeholder = Math.max(maxAbs * 0.05, 1);

  const pieData: PieDatum[] = [
    {
      key:    'a',
      name:   'A-Book',
      value:  rawAbs.a > 0 ? rawAbs.a : placeholder,
      signed: data.totals.a_book_net_lots,
      color:  COLOR_A,
    },
    {
      key:    'b',
      name:   'B-Book',
      value:  rawAbs.b > 0 ? rawAbs.b : placeholder,
      signed: data.totals.b_book_net_lots,
      color:  COLOR_B,
    },
    {
      key:    'c',
      name:   'C-Book',
      value:  rawAbs.c > 0 ? rawAbs.c : placeholder,
      signed: data.totals.c_book_net_lots,
      color:  COLOR_C,
    },
  ];

  const allZero = rawAbs.a === 0 && rawAbs.b === 0 && rawAbs.c === 0;

  return (
    <div className="h-full w-full flex flex-col">
      {/* ── Top-right: live indicator ────────────────────────────── */}
      <div
        className="flex items-center justify-end gap-2 px-2 py-1 font-mono text-[10px]"
        style={{ color: '#808080' }}
      >
        <span
          style={{
            display:      'inline-block',
            width:        6,
            height:       6,
            borderRadius: '50%',
            background:   status === 'open'
              ? '#6aaa78'
              : status === 'connecting'
                ? '#d2d6e2'
                : '#d07070',
          }}
        />
        <span>
          {status === 'open'       ? 'live'
            : status === 'connecting' ? 'connecting'
            : status === 'error'      ? 'error'
            :                           'disconnected'}
        </span>
      </div>

      {/* ── Pie ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {allZero ? (
          <BodyMessage>All books at zero net exposure</BodyMessage>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="75%"
                label={({ payload }) => {
                  const p = payload as PieDatum;
                  return `${p.name}: ${fmtLots(p.signed)}`;
                }}
                labelLine={{ stroke: '#808080' }}
                isAnimationActive={false}
                onClick={(slice: any) => {
                  const key = slice?.payload?.key as BookKey | undefined;
                  if (!key) return;
                  setSelectedBook(prev => (prev === key ? null : key));
                }}
                style={{ cursor: 'pointer' }}
              >
                {pieData.map(d => (
                  <Cell
                    key={d.key}
                    fill={d.color}
                    stroke={selectedBook === d.key ? '#ffffff' : '#252429'}
                    strokeWidth={selectedBook === d.key ? 2 : 1}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#252429',
                  border:          '1px solid #3a3a3c',
                  fontFamily:      'IBM Plex Mono, monospace',
                  fontSize:        12,
                }}
                formatter={(_value: number, _name: string, item: any) => {
                  const p = item?.payload as PieDatum | undefined;
                  if (!p) return ['', ''];
                  return [`${fmtLots(p.signed)} lots`, p.name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Drill-down table for the selected book ─────────────── */}
      {selectedBook && (
        <BookSymbolTable
          book={selectedBook}
          rows={data.by_symbol}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </div>
  );
}

// ── BookSymbolTable — drill-down detail ────────────────────────
interface BookSymbolTableProps {
  book:    BookKey;
  rows:    PortfolioExposureSymbolRow[];
  onClose: () => void;
}

function BookSymbolTable({ book, rows, onClose }: BookSymbolTableProps) {
  // For each book, filter to symbols whose corresponding column is
  // non-zero, then sort by absolute value descending.
  //
  // C-Book is now a first-class citizen here — the broadcaster emits
  // c_book_lots per symbol, unlike the legacy REST shape which had
  // only A/B per-symbol breakdown.
  const colKey: keyof PortfolioExposureSymbolRow =
    book === 'a' ? 'a_book_lots'
      : book === 'b' ? 'b_book_lots'
      :                'c_book_lots';

  const filtered = rows
    .filter(r => (r[colKey] as number) !== 0)
    .sort((a, b) => Math.abs(b[colKey] as number) - Math.abs(a[colKey] as number));

  const headerColor = book === 'a' ? COLOR_A : book === 'b' ? COLOR_B : COLOR_C;
  const bookLabel   = book === 'a' ? 'A-Book' : book === 'b' ? 'B-Book' : 'C-Book';

  return (
    <div
      className="border-t flex flex-col min-h-0"
      style={{ borderColor: '#3a3a3c', maxHeight: '40%' }}
    >
      <div
        className="flex items-center justify-between px-3 py-2 font-mono text-xs"
        style={{ color: headerColor, borderBottom: '1px solid #3a3a3c' }}
      >
        <span>{bookLabel} contributors ({filtered.length} symbol{filtered.length === 1 ? '' : 's'})</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] px-1"
          style={{ color: '#808080' }}
        >
          ✕ close
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div
            className="px-3 py-3 font-mono text-xs"
            style={{ color: '#808080' }}
          >
            No symbols contribute to {bookLabel} net exposure.
          </div>
        ) : (
          <table
            className="w-full font-mono text-[11px]"
            style={{ color: '#d2d6e2' }}
          >
            <thead>
              <tr style={{ color: '#808080', borderBottom: '1px solid #3a3a3c' }}>
                <th className="text-left  px-3 py-1">Symbol</th>
                <th className="text-right px-3 py-1">Net Exposure</th>
                <th className="text-right px-3 py-1">Long</th>
                <th className="text-right px-3 py-1">Short</th>
                <th className="text-right px-3 py-1">{bookLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const colVal = r[colKey] as number;
                return (
                  <tr key={r.symbol} style={{ borderBottom: '1px solid #2a292c' }}>
                    <td className="text-left  px-3 py-1">{r.symbol}</td>
                    <td
                      className="text-right px-3 py-1"
                      style={{
                        color: r.net_exposure_lots > 0
                          ? '#6aaa78'
                          : r.net_exposure_lots < 0
                            ? '#d07070'
                            : '#d2d6e2',
                      }}
                    >
                      {fmtLots(r.net_exposure_lots)}
                    </td>
                    <td className="text-right px-3 py-1">{fmtLots(r.long_lots)}</td>
                    <td className="text-right px-3 py-1">{fmtLots(r.short_lots)}</td>
                    <td
                      className="text-right px-3 py-1"
                      style={{
                        color: colVal > 0
                          ? '#6aaa78'
                          : colVal < 0
                            ? '#d07070'
                            : '#d2d6e2',
                      }}
                    >
                      {fmtLots(colVal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── BodyMessage — centered status text ─────────────────────────
function BodyMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?:    'error';
}) {
  return (
    <div
      className="h-full w-full flex items-center justify-center font-mono text-xs"
      style={{ color: tone === 'error' ? '#d07070' : '#808080' }}
    >
      {children}
    </div>
  );
}