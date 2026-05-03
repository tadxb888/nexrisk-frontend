// ============================================================================
// FxAskCell
// ----------------------------------------------------------------------------
// Streaming Ask price cell for the reserved bar. Single-row layout so it
// fits inside the existing 40 px bar content area.
//
//   ┌──────────────────────────────────────────────────┐
//   │  Master · EURUSD   1.08 54 ²                  ×  │
//   └──────────────────────────────────────────────────┘
//
// Big-figure typography:
//   • Handle  — white, smaller       (digits that rarely change)
//   • Pip pair — accent, large       (the focal pair)
//   • Pipette — accent, superscript  (last decimal, fastest-moving)
//
// Splitting is precision-aware:
//   precision >= 3  → handle | pip pair | pipette
//   precision == 2  → handle | pip pair  (no pipette)
//   precision <  2  → entire price as handle
//
// State semantics:
//   live     — full opacity, normal accent
//   stale    — 55% opacity, last values shown
//   offline  — 45% opacity + small "OFFLINE" tag, last values shown
//   pending  — full opacity, em dash where price would be (no tick yet)
// ============================================================================

import { useMemo, useState } from 'react';

export type FxAskCellState = 'live' | 'stale' | 'offline' | 'pending';
export type FxAskCellDirection = 'up' | 'down' | 'flat';

export interface FxAskCellProps {
  symbol:       string;
  /** MT5 node_name. Shown as small gray text before the symbol. Truncated. */
  sourceId:     string;
  /** Live Ask price; null/undefined renders an em dash. */
  price:        number | null | undefined;
  precision:    number;
  state?:       FxAskCellState;
  /** Most recent tick direction relative to the previous ask. Default 'flat'. */
  direction?:   FxAskCellDirection;
  /** When provided, a × button appears on hover and calls this when clicked. */
  onRemove?:    () => void;
}

interface PriceParts { handle: string; pip: string; pipette: string | null }

function splitPrice(price: number, precision: number): PriceParts {
  const fixed = price.toFixed(Math.max(0, precision));
  if (precision >= 3) {
    return { handle: fixed.slice(0, -3), pip: fixed.slice(-3, -1), pipette: fixed.slice(-1) };
  }
  if (precision === 2) {
    return { handle: fixed.slice(0, -2), pip: fixed.slice(-2), pipette: null };
  }
  return { handle: fixed, pip: '', pipette: null };
}

/**
 * Compact source identifier shown on the cell. Splits on whitespace,
 * hyphens, and underscores; takes the first letter of each token.
 *   "Ross Weiler"          → "RW"
 *   "Highness Investments" → "HI"
 *   "MASTER"               → "MA"   (single word: first 2 chars)
 *   "broker-a"             → "BA"
 * Caps at 3 chars. The full source_id is always available in the cell tooltip.
 */
function sourceInitials(sourceId: string): string {
  const tokens = sourceId.split(/[\s\-_]+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return tokens.slice(0, 3).map(t => t[0]).join('').toUpperCase();
}

const FONT_MONO = "'IBM Plex Mono', monospace";

export function FxAskCell({
  symbol,
  sourceId,
  price,
  precision,
  state = 'live',
  direction = 'flat',
  onRemove,
}: FxAskCellProps) {
  const [hover, setHover] = useState(false);

  const parts = useMemo<PriceParts | null>(() => {
    if (price == null || !isFinite(price)) return null;
    return splitPrice(price, precision);
  }, [price, precision]);

  // ── Colour rules ───────────────────────────────────────────────────────────
  // stale (>60s no tick) and offline:    everything grey
  // up tick:                              pip pair + pipette green
  // down tick:                            pip pair + pipette red
  // flat / first tick / pending:          pip pair + pipette teal (default accent)
  // ----------------------------------------------------------------------------
  const greyedOut = state === 'stale' || state === 'offline';
  const symbolColor = greyedOut ? '#666' : '#fff';
  const handleColor = greyedOut ? '#666' : '#fff';
  const accentColor =
    greyedOut         ? '#666'  :
    direction === 'up'   ? '#66e07a' :
    direction === 'down' ? '#ff6b6b' :
                           '#4ecdc4';

  const opacity = state === 'offline' ? 0.6 : 1;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 12px',
        backgroundColor: '#232225',
        border: '1px solid #3a3a3e',
        borderRadius: 3,
        flexShrink: 0,
        opacity,
        transition: 'opacity 200ms ease',
      }}
    >
      {/* Source initials chip — vertical text. Tooltip shows the full source_id. */}
      <span
        title={sourceId}
        style={{
          color: '#aaa',
          backgroundColor: '#1e1e22',
          border: '1px solid #3a3a3e',
          fontFamily: FONT_MONO,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.08em',
          padding: '4px 2px',
          borderRadius: 2,
          flexShrink: 0,
          writingMode: 'vertical-rl',
          textOrientation: 'upright',
          lineHeight: 1,
          minHeight: 32,
          textAlign: 'center',
        }}
      >
        {sourceInitials(sourceId)}
      </span>

      {/* Symbol */}
      <span
        style={{
          color: symbolColor,
          fontFamily: FONT_MONO,
          fontSize: 18,
          fontWeight: 500,
          letterSpacing: '0.04em',
          flexShrink: 0,
          transition: 'color 200ms ease',
        }}
      >
        {symbol}
      </span>

      {/* Price */}
      {parts ? (
        <span style={{ display: 'inline-block', fontFamily: FONT_MONO, lineHeight: 1, flexShrink: 0 }}>
          <span style={{ color: handleColor, fontSize: 20, transition: 'color 200ms ease' }}>{parts.handle}</span>
          {parts.pip && (
            <span style={{ color: accentColor, fontSize: 32, fontWeight: 500, transition: 'color 200ms ease' }}>{parts.pip}</span>
          )}
          {parts.pipette && (
            <sup style={{ color: accentColor, fontSize: 18, fontWeight: 500, marginLeft: 1, transition: 'color 200ms ease' }}>
              {parts.pipette}
            </sup>
          )}
        </span>
      ) : (
        <span style={{ color: '#666', fontFamily: FONT_MONO, fontSize: 20, flexShrink: 0 }}>—</span>
      )}

      {/* Offline tag — only when source is disconnected */}
      {state === 'offline' && (
        <span
          style={{
            color: '#ff6b6b',
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: '0.08em',
            border: '1px solid #ff6b6b40',
            padding: '1px 4px',
            borderRadius: 2,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          OFFLINE
        </span>
      )}

      {/* Remove button — appears on hover */}
      {onRemove && hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${symbol}`}
          title="Remove cell"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 16,
            height: 16,
            background: '#1e1e22',
            border: '1px solid #555',
            borderRadius: 2,
            color: '#aaa',
            cursor: 'pointer',
            fontSize: 11,
            lineHeight: '12px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.borderColor = '#ff6b6b'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.borderColor = '#555'; }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default FxAskCell;