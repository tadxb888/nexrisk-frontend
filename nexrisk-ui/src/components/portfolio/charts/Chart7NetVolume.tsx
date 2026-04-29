// ============================================
// Chart7NetVolume — A/B/C Net Volume
//
// Per Ross's spec (Chart 7) + design choices:
//   • Top: pie chart of A/B/C book net volumes.
//     - Slice SIZE  = absolute value of net_lots (pie can't show negatives).
//     - Slice LABEL = signed value (e.g. "A: +1240" or "B: -820").
//     - Slice COLOR = always the book's brand color regardless of sign.
//   • Click a slice → drill-down table of by_symbol contributors to
//     that book appears below. Click again to deselect.
//   • C-Book has NO per-symbol breakdown from the backend — clicking
//     the C slice shows an honest message instead of an empty table.
//   • Refresh button top-right next to the `as_of` timestamp:
//     POST /api/v1/exposure/refresh, then refetch this endpoint.
//   • Auto-refresh every 30s while visible.
//
// Backend snapshot quirk (per spec):
//   The ExposureEngine background job that updates snapshots is
//   currently stopped (known data gap). `as_of` may be stale. The
//   manual refresh button forces a one-shot recompute.
//
// `period` prop is in the signature for ChartComponentProps compat —
// this chart ignores it (snapshot endpoint, no period semantics).
// ============================================

import { useEffect, useRef, useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import type { ChartComponentProps } from './registry';
import { fetchNetVolumeByBook, refreshExposureSnapshot } from '@/services/chartsApi';
import type { NetVolumeResponse, NetSymbolRow } from '@/types/charts';

const POLL_INTERVAL_MS = 30_000;

// Brand palette per book — same mapping used in TopBar / Portfolio
// breakdown so colors stay consistent across the app.
const COLOR_A = '#4ecdc4';   // teal — A-Book
const COLOR_B = '#c9b87c';   // yellow — B-Book
const COLOR_C = '#f4a261';   // orange — C-Book

type BookKey = 'a' | 'b' | 'c';

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

/** "2026-04-28T13:42:11Z" → "13:42:11 UTC" */
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getUTCHours()  ).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
}

// ── Component ──────────────────────────────────────────────────
export function Chart7NetVolume(_props: ChartComponentProps) {
  const [resp,    setResp]    = useState<NetVolumeResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error,   setError]   = useState<string | null>(null);

  // Which book's contributors are showing in the drill-down table.
  // null = pie shown alone, no table.
  const [selectedBook, setSelectedBook] = useState<BookKey | null>(null);

  // True while a refresh-then-fetch round-trip is in flight (button
  // disabled + spinner shown).
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const abortRef = useRef<AbortController | null>(null);

  // ── Data fetch ───────────────────────────────────────────────
  const load = async (signal?: AbortSignal) => {
    try {
      const json = await fetchNetVolumeByBook({ limit: 50 });
      if (signal?.aborted) return;
      setResp(json);
      setError(null);
    } catch (e: any) {
      if (signal?.aborted) return;
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const tick = async () => {
      if (!mounted) return;
      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      await load(ctrl.signal);
    };

    tick();
    const id = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(id);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Manual refresh handler ───────────────────────────────────
  const onRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // Fire-and-forget: refresh THEN fetch. We don't bail on refresh
      // failure — even if the recompute didn't run, the latest snapshot
      // (stale or not) is still worth seeing.
      await refreshExposureSnapshot().catch(() => undefined);
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Render branches ──────────────────────────────────────────
  if (loading && !resp) {
    return <BodyMessage>Loading…</BodyMessage>;
  }
  if (error && !resp) {
    return <BodyMessage tone="error">Failed to load: {error}</BodyMessage>;
  }
  if (!resp) {
    return <BodyMessage>No data</BodyMessage>;
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
    a: Math.abs(resp.totals.a_book_net_lots),
    b: Math.abs(resp.totals.b_book_net_lots),
    c: Math.abs(resp.totals.c_book_net_lots),
  };
  const maxAbs = Math.max(rawAbs.a, rawAbs.b, rawAbs.c);
  const placeholder = Math.max(maxAbs * 0.05, 1);

  const pieData: PieDatum[] = [
    {
      key:    'a',
      name:   'A-Book',
      value:  rawAbs.a > 0 ? rawAbs.a : placeholder,
      signed: resp.totals.a_book_net_lots,
      color:  COLOR_A,
    },
    {
      key:    'b',
      name:   'B-Book',
      value:  rawAbs.b > 0 ? rawAbs.b : placeholder,
      signed: resp.totals.b_book_net_lots,
      color:  COLOR_B,
    },
    {
      key:    'c',
      name:   'C-Book',
      value:  rawAbs.c > 0 ? rawAbs.c : placeholder,
      signed: resp.totals.c_book_net_lots,
      color:  COLOR_C,
    },
  ];

  const allZero = rawAbs.a === 0 && rawAbs.b === 0 && rawAbs.c === 0;

  return (
    <div className="h-full w-full flex flex-col">
      {/* ── Top bar: as_of timestamp + manual refresh button ───── */}
      <div
        className="flex items-center justify-end gap-2 px-2 py-1 font-mono text-[10px]"
        style={{ color: '#808080' }}
      >
        <span>as_of: {fmtTime(resp.as_of)}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="px-2 py-0.5 rounded font-mono text-[10px]"
          style={{
            backgroundColor: '#252429',
            border:          '1px solid #3a3a3c',
            color:           refreshing ? '#808080' : '#d2d6e2',
            cursor:          refreshing ? 'wait' : 'pointer',
          }}
          title="Force a fresh ExposureEngine snapshot"
        >
          {refreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
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
                // Center + radius — keep some breathing room for labels.
                cx="50%"
                cy="50%"
                outerRadius="75%"
                // Slice labels show signed values: "A-Book: +1240"
                label={({ payload }) => {
                  const p = payload as PieDatum;
                  return `${p.name}: ${fmtLots(p.signed)}`;
                }}
                labelLine={{ stroke: '#808080' }}
                isAnimationActive={false}
                onClick={(slice: any) => {
                  const key = slice?.payload?.key as BookKey | undefined;
                  if (!key) return;
                  // Toggle: click same slice again to clear selection.
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
          rows={resp.by_symbol}
          onClose={() => setSelectedBook(null)}
        />
      )}
    </div>
  );
}

// ── BookSymbolTable — drill-down detail ────────────────────────
interface BookSymbolTableProps {
  book:    BookKey;
  rows:    NetSymbolRow[];
  onClose: () => void;
}

function BookSymbolTable({ book, rows, onClose }: BookSymbolTableProps) {
  // C-Book has no per-symbol breakdown from the backend.
  if (book === 'c') {
    return (
      <div
        className="border-t px-3 py-3 font-mono text-xs"
        style={{ borderColor: '#3a3a3c', color: '#808080' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: '#f4a261' }}>C-Book contributors</span>
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] px-1"
            style={{ color: '#808080' }}
          >
            ✕ close
          </button>
        </div>
        Per-symbol C-Book breakdown not available — see total in the slice tooltip.
      </div>
    );
  }

  // A/B-Book: filter to symbols whose corresponding column is non-zero,
  // then sort by absolute value descending.
  const colKey: keyof NetSymbolRow = book === 'a' ? 'a_book_lots' : 'b_book_lots';
  const filtered = rows
    .filter(r => (r[colKey] as number) !== 0)
    .sort((a, b) => Math.abs(b[colKey] as number) - Math.abs(a[colKey] as number));

  const headerColor = book === 'a' ? COLOR_A : COLOR_B;
  const bookLabel   = book === 'a' ? 'A-Book' : 'B-Book';

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