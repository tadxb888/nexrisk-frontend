// ============================================================================
// AlertsBar
// ----------------------------------------------------------------------------
// Drop-in component for the reserved bar's left side.
//
// Renders:
//   • The user's saved cells (0..4) via FxAskCell
//   • An "+ add" tile while cells.length < 4
//   • The picker modal (controlled here)
//
// State / persistence is owned by useAlertsBar.
// ============================================================================

import { useState } from 'react';
import { useAlertsBar } from './useAlertsBar';
import { FxAskCell } from './FxAskCell';
import { FxCellPicker } from './FxCellPicker';

const FONT_MONO = "'IBM Plex Mono', monospace";

export function AlertsBar() {
  const {
    cells, nodes, loading, getTick, getPrecision, getState, getDirection, addCell, removeCell,
  } = useAlertsBar();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flex: '0 1 50%',
          maxWidth: '50%',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        {cells.map((cell, i) => {
          const tick = getTick(cell);
          return (
            <FxAskCell
              key={`${cell.source_id}|${cell.symbol}|${i}`}
              sourceId={cell.source_id}
              symbol={cell.symbol}
              price={tick?.ask ?? null}
              precision={getPrecision(cell)}
              state={getState(cell)}
              direction={getDirection(cell)}
              onRemove={() => removeCell(i)}
            />
          );
        })}

        {!loading && cells.length < 4 && (
          <AddTile onClick={() => setPickerOpen(true)} />
        )}
      </div>

      <FxCellPicker
        open={pickerOpen}
        nodes={nodes}
        onClose={() => setPickerOpen(false)}
        onConfirm={async (source_id, symbol, digits) => {
          setPickerOpen(false);
          await addCell(source_id, symbol, digits);
        }}
      />
    </>
  );
}

// ── Add tile (+ button) ──────────────────────────────────────────────────────

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add FX cell"
      title="Add FX cell"
      style={{
        height: 38,
        minWidth: 56,
        padding: '0 16px',
        background: 'transparent',
        border: '1px dashed #555',
        borderRadius: 3,
        color: '#888',
        cursor: 'pointer',
        fontFamily: FONT_MONO,
        fontSize: 22,
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'border-color 150ms ease, color 150ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#888'; e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#888'; }}
    >
      +
    </button>
  );
}

export default AlertsBar;