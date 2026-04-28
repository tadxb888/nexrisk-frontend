// ============================================
// ThumbnailRail
//
// Vertical column of chart thumbnails on the LEFT edge of the
// Portfolio workspace. Replaces the horizontal ChartHeaderStrip
// from the previous revision.
//
// Two states:
//   • Expanded (~140px wide): icon + 2-line label + ★ pin per thumb
//   • Collapsed (~44px wide): icon-only thumbs (label hidden), pin
//                              still visible. Tooltip carries the
//                              full label on hover.
//
// Chevron at the bottom toggles the rail. Persisted to localStorage
// so the rail's state survives a refresh.
// ============================================

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { CHART_REGISTRY, type ChartId } from './charts/registry';

const STORAGE_KEY = 'nexrisk.portfolio.railCollapsed';

interface Props {
  selectedChartId: ChartId;
  pinnedChartId:   ChartId;
  onSelect:        (id: ChartId) => void;
  onPin:           (id: ChartId) => void;
}

export function ThumbnailRail({
  selectedChartId,
  pinnedChartId,
  onSelect,
  onPin,
}: Props) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const width = collapsed ? 44 : 140;

  return (
    <div
      className="h-full flex flex-col flex-shrink-0 border-r border-[#3a3a3c] transition-[width] duration-150"
      style={{ backgroundColor: '#1e1e20', width }}
    >
      {/* Thumbnail list — scrolls vertically if rail height is constrained */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-2 space-y-1.5">
        {CHART_REGISTRY.map(entry => (
          <Thumb
            key={entry.id}
            entry={entry}
            collapsed={collapsed}
            selected={entry.id === selectedChartId}
            pinned={entry.id === pinnedChartId}
            onSelect={() => onSelect(entry.id)}
            onPin={() => onPin(entry.id)}
          />
        ))}
      </div>

      {/* Collapse / expand chevron — bottom of rail */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand thumbnail rail' : 'Collapse thumbnail rail'}
        aria-label={collapsed ? 'Expand thumbnail rail' : 'Collapse thumbnail rail'}
        className="flex items-center justify-center py-1.5 border-t border-[#3a3a3c] text-[#aaa] hover:text-white hover:bg-[#252527] transition-colors flex-shrink-0"
      >
        {collapsed
          ? <ChevronRight className="w-4 h-4" />
          : <ChevronLeft  className="w-4 h-4" />
        }
      </button>
    </div>
  );
}

// ── Single thumbnail ───────────────────────────────────────────
interface ThumbProps {
  entry:      typeof CHART_REGISTRY[number];
  collapsed:  boolean;
  selected:   boolean;
  pinned:     boolean;
  onSelect:   () => void;
  onPin:      () => void;
}

function Thumb({ entry, collapsed, selected, pinned, onSelect, onPin }: ThumbProps) {
  const Icon = entry.Icon;

  return (
    <div className="relative">
      <button
        onClick={onSelect}
        title={collapsed ? entry.label : entry.description}
        aria-pressed={selected}
        className="w-full flex flex-col items-center justify-center gap-1.5 px-1 py-1.5 rounded transition-colors"
        style={{
          backgroundColor: selected ? '#252429' : 'transparent',
          border: selected ? '1px solid #49b3b3' : '1px solid #3a3a3c',
          color: selected ? '#49b3b3' : '#d2d6e2',
          boxShadow: selected ? '0 0 0 1px #49b3b344 inset' : undefined,
          minHeight: collapsed ? 36 : 70,
        }}
      >
        <Icon width={collapsed ? 22 : 26} height={collapsed ? 22 : 26} />

        {!collapsed && (
          <span
            className="text-[10px] font-medium leading-[1.15] text-center w-full px-0.5"
            style={{
              color: selected ? '#FFF' : '#d2d6e2',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              wordBreak: 'normal',
              overflowWrap: 'break-word',
            }}
          >
            {entry.thumbnailLabel ?? entry.label}
          </span>
        )}
      </button>

      {/* ★ pin — top-right corner. Hidden in collapsed mode (no room). */}
      {!collapsed && (
        <button
          onClick={(e) => { e.stopPropagation(); onPin(); }}
          title={pinned ? 'Default chart' : 'Pin as default'}
          aria-label={pinned ? 'Unpin default chart' : 'Pin as default chart'}
          className="absolute top-0.5 right-0.5 leading-none p-0.5 rounded transition-colors"
          style={{ color: pinned ? '#c9b87c' : '#5a5a5e', backgroundColor: 'transparent' }}
        >
          <Star filled={pinned} />
        </button>
      )}
    </div>
  );
}

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