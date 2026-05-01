// ============================================
// ChartSelector
//
// Horizontal switcher rendered inside ChartHeader. Replaces the
// left-edge ThumbnailRail (Phase 1A relocation).
//
// Single dropdown for now — fits cleanly in the header strip alongside
// the Period selector and Get Insight button. Each entry shows the
// chart's icon + label so the user has the same visual cues the rail
// thumbnails provided. The pin (★) UX is preserved: a star button
// next to the dropdown toggles "use this as default chart on next
// visit" via the same setter the rail used.
//
// Why a dropdown not a tab strip:
//   • 7 entries (and growing) won't fit as a tab strip without
//     wrapping or horizontal scroll on narrower viewports.
//   • The header already hosts Period + Get Insight on the right;
//     a dropdown keeps the header clean.
// ============================================

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { CHART_REGISTRY, type ChartId } from './charts/registry';

interface Props {
  selectedChartId: ChartId;
  pinnedChartId:   ChartId;
  onSelect:        (id: ChartId) => void;
  onPin:           (id: ChartId) => void;
}

export function ChartSelector({
  selectedChartId,
  pinnedChartId,
  onSelect,
  onPin,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click. Ignored when already closed.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const selectedEntry = CHART_REGISTRY.find(c => c.id === selectedChartId)
                     ?? CHART_REGISTRY[0];

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {/* ── Trigger button ─────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={selectedEntry.description}
        className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs border transition-colors"
        style={{
          backgroundColor: open ? '#252429' : 'transparent',
          borderColor: '#49b3b366',
          color: '#FFFFFF',
        }}
      >
        <span className="font-semibold truncate max-w-[260px]">
          {selectedEntry.label}
        </span>
        <ChevronDown
          className="w-3 h-3 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* ── Dropdown panel ─────────────────────────────────── */}
      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 left-0 rounded shadow-lg overflow-hidden"
          style={{
            backgroundColor: '#1e1e20',
            border: '1px solid #3a3a3c',
            minWidth: 320,
          }}
        >
          <ul className="py-1 max-h-[420px] overflow-y-auto">
            {CHART_REGISTRY.map(entry => {
              const isSelected = entry.id === selectedChartId;
              const isPinned   = entry.id === pinnedChartId;
              return (
                <li key={entry.id}>
                  <div
                    className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
                    style={{
                      backgroundColor: isSelected ? '#252429' : 'transparent',
                      color: isSelected ? '#FFFFFF' : '#d2d6e2',
                      borderLeft: isSelected ? '2px solid #49b3b3' : '2px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#252527';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                    }}
                    onClick={() => {
                      onSelect(entry.id);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate" title={entry.description}>
                      {entry.label}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin(entry.id);
                      }}
                      title={isPinned ? 'Default chart on load' : 'Pin as default chart on load'}
                      aria-label={isPinned ? 'Unpin default chart' : 'Pin as default chart'}
                      className="leading-none p-1 rounded transition-colors"
                      style={{ color: isPinned ? '#c9b87c' : '#5a5a5e' }}
                    >
                      <Star filled={isPinned} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Star (same shape as ThumbnailRail's) ────────────────────────
function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={11}
      height={11}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="12,2 15,9 22,9.3 16.5,14 18.5,21 12,17.5 5.5,21 7.5,14 2,9.3 9,9" />
    </svg>
  );
}