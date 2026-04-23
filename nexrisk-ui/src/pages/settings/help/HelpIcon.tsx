// ============================================
// HelpIcon — the "?" button that opens the help drawer
//
// Designed to sit in a sub-page header, to the right of the restart pill
// (or wherever the page has a natural top-right slot).
// ============================================

import { type ReactNode } from 'react';

interface HelpIconProps {
  onClick:     () => void;
  'aria-label'?: string;
}

export function HelpIcon({ onClick, 'aria-label': ariaLabel = 'Open help' }: HelpIconProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title="Open help"
      className="shrink-0 w-7 h-7 flex items-center justify-center rounded cursor-pointer transition-colors"
      style={{
        background:  'transparent',
        border:      '1px solid #44454f',
        color:       '#b6babf',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#2a292c';
        e.currentTarget.style.color = '#E6E6E6';
        e.currentTarget.style.borderColor = '#49b3b3';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = '#b6babf';
        e.currentTarget.style.borderColor = '#44454f';
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.25" />
        <path
          d="M6 6.2a2 2 0 1 1 3 1.73c-.7.41-1 .9-1 1.57"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="8" cy="11.5" r="0.7" fill="currentColor" />
      </svg>
    </button>
  );
}

export default HelpIcon;