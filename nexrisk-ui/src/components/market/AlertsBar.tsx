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
      {/* Reserved row of 4 slots. Each slot is a fixed minimum width so the
          row's total footprint never changes regardless of how many cells
          the user has saved. flexShrink: 0 on the row guarantees the
          escalation banner can never push into this real estate. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}
      >
        {[0, 1, 2, 3].map((slotIndex) => {
          const cell = cells[slotIndex];

          // Slot wrapper: fixed minimum width, content centred. Renders
          // either a cell, the add tile, or a transparent placeholder so
          // empty slots still reserve their width.
          const slotStyle: React.CSSProperties = {
            minWidth: 215,
            height: 38,
            display: 'flex',
            alignItems: 'stretch',
            flexShrink: 0,
          };

          if (cell) {
            const tick = getTick(cell);
            return (
              <div key={`${cell.source_id}|${cell.symbol}|${slotIndex}`} style={slotStyle}>
                <FxAskCell
                  sourceId={cell.source_id}
                  symbol={cell.symbol}
                  price={tick?.ask ?? null}
                  precision={getPrecision(cell)}
                  state={getState(cell)}
                  direction={getDirection(cell)}
                  onRemove={() => removeCell(slotIndex)}
                />
              </div>
            );
          }

          // First empty slot after the saved cells gets the add tile
          // (only after initial load so the picker button doesn't flash
          // in before the saved cells arrive).
          if (!loading && slotIndex === cells.length) {
            return (
              <div key={`add-${slotIndex}`} style={slotStyle}>
                <AddTile onClick={() => setPickerOpen(true)} />
              </div>
            );
          }

          // Remaining slots: empty placeholders that hold the row width.
          return <div key={`empty-${slotIndex}`} style={slotStyle} aria-hidden="true" />;
        })}
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