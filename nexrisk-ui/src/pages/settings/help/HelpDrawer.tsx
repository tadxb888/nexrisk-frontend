// ============================================
// HelpDrawer — slide-out help panel
//
// Two modes:
//   Modal (default)   — backdrop dims the page, body scroll locked, drawer
//                       is 480px. Click-outside, Esc, or × to close.
//   Pinned            — no backdrop, body scroll released, drawer widens to
//                       560px. Drawer floats over the right edge of the page;
//                       the user can scroll the page underneath while keeping
//                       the help visible. Only × (or Esc) closes in this mode
//                       — click-outside no longer dismisses (there's no
//                       "outside" — the area to the left of the drawer is
//                       the page itself and must remain interactive).
//
// The pin state is drawer-local and resets to unpinned each time the drawer
// is opened — pinning is an in-session choice, not a persisted preference.
//
// The drawer portals to document.body to avoid stacking-context issues.
// ============================================

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HelpContent } from './HelpContent';

interface HelpDrawerProps {
  open:    boolean;
  title:   string;
  content: string;    // raw markdown
  onClose: () => void;
}

const WIDTH_MODAL  = 480;
const WIDTH_PINNED = 560;

export function HelpDrawer({ open, title, content, onClose }: HelpDrawerProps): ReactNode {
  const [pinned, setPinned] = useState(false);

  // Reset pin state each time the drawer is opened — the pin is an
  // in-session choice, not a persisted preference.
  useEffect(() => {
    if (open) setPinned(false);
  }, [open]);

  // Esc to close, regardless of mode
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll only in modal mode. When pinned, the page behind the
  // drawer must remain scrollable.
  useEffect(() => {
    if (!open || pinned) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, pinned]);

  if (!open) return null;

  const width = pinned ? WIDTH_PINNED : WIDTH_MODAL;

  // In pinned mode, the outer wrapper sits at the right edge only, with a
  // transparent background and pointer-events off — clicks on the rest of
  // the viewport fall through to the page underneath. In modal mode, it's
  // a full-screen backdrop that dismisses on click.
  const outerStyle: CSSProperties = pinned
    ? {
        top:            0,
        right:          0,
        bottom:         0,
        width:          `${width}px`,
        maxWidth:       '100vw',
        background:     'transparent',
        pointerEvents:  'none',
      }
    : {
        top:            0,
        right:          0,
        bottom:         0,
        left:           0,
        background:     'rgba(10, 10, 12, 0.62)',
      };

  return createPortal(
    <div
      className="fixed z-50 flex justify-end"
      style={outerStyle}
      onClick={pinned ? undefined : onClose}
      aria-modal={pinned ? undefined : 'true'}
      role="dialog"
      aria-label={`Help — ${title}`}
    >
      <aside
        onClick={e => e.stopPropagation()}
        className="bg-surface border-l border-border flex flex-col shadow-xl"
        style={{
          width:         `${width}px`,
          maxWidth:      '100vw',
          height:        '100vh',
          pointerEvents: 'auto',
          animation:     'taigaHelpSlideIn 180ms ease-out',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 shrink-0"
          style={{ background: '#2a292c' }}
        >
          <div className="min-w-0">
            <div className="text-[10.5px] font-mono uppercase tracking-wide text-text-muted">
              Operator manual
            </div>
            <h2 className="text-base font-medium text-text-primary m-0 truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <PinButton pinned={pinned} onToggle={() => setPinned(p => !p)} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close help"
              title="Close help"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded cursor-pointer hover:bg-surface-hover text-text-secondary hover:text-text-primary"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <HelpContent markdown={content} />
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 border-t border-border shrink-0 flex items-center justify-between gap-2"
          style={{ background: '#2a292c' }}
        >
          <span className="text-[11px] text-text-muted truncate">
            {pinned
              ? <>Pinned — scroll the page freely</>
              : <>Press <span className="font-mono">Esc</span> to close</>}
          </span>
          <span className="text-[11px] text-text-muted shrink-0">
            Taiga System Administration
          </span>
        </div>
      </aside>

      {/* Slide-in keyframe — scoped via inline style tag so no global CSS edit needed */}
      <style>{`
        @keyframes taigaHelpSlideIn {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PinButton — small icon toggle in the drawer header
// ─────────────────────────────────────────────────────────────────────────────

function PinButton({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? 'Unpin help drawer' : 'Pin help drawer'}
      title={pinned ? 'Unpin drawer — restore modal' : 'Pin drawer — keep visible while scrolling page'}
      className="shrink-0 w-8 h-8 flex items-center justify-center rounded cursor-pointer transition-colors"
      style={{
        background: pinned ? '#49b3b3' : 'transparent',
        color:      pinned ? '#0b0c0e' : '#b6babf',
      }}
      onMouseEnter={e => {
        if (!pinned) {
          e.currentTarget.style.background = '#1a1a1d';
          e.currentTarget.style.color = '#E6E6E6';
        }
      }}
      onMouseLeave={e => {
        if (!pinned) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#b6babf';
        }
      }}
    >
      {/* Pushpin icon — colour filled by currentColor; state communicated via
          the button's background (teal when pinned). No rotation — the
          realistic pin shape reads better static. */}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M9.068,16.347l4.9,4.9.707-.707a7.977,7.977,0,0,0,2.075-7.619l-.246-1,2.086-2.086.217.217a3.085,3.085,0,0,0,3.938.4,3,3,0,0,0,.38-4.565L18.2.954a3.085,3.085,0,0,0-3.938-.4,3,3,0,0,0-.38,4.565l.293.293L12.085,7.5,11.1,7.258A7.985,7.985,0,0,0,3.464,9.33l-.707.707,4.9,4.895L.293,22.293l1.414,1.414ZM10.607,9.2l2.1.514,4.3-4.3L15.293,3.707a1,1,0,0,1,.134-1.528,1.084,1.084,0,0,1,1.356.19l4.924,4.924h0a1,1,0,0,1-.134,1.528,1.084,1.084,0,0,1-1.356-.19L18.586,7l-4.3,4.3.518,2.111a5.977,5.977,0,0,1-.9,4.946L5.646,10.1A5.986,5.986,0,0,1,10.607,9.2Z"/>
      </svg>
    </button>
  );
}

export default HelpDrawer;