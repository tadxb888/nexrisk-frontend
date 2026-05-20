import { useState } from 'react';
import { CockpitHelpModal } from './CockpitHelpModal';

interface HelpIconProps {
  cardId: string;
}

export function HelpIcon({ cardId }: HelpIconProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ml-2 text-text-muted hover:text-text-primary focus:outline-none transition-colors"
        aria-label="Card help"
        title="What does this card show?"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.2"/>
          <text x="8" y="11" textAnchor="middle" fontSize="9" fontFamily="sans-serif" fontWeight="600">i</text>
        </svg>
      </button>
      {open && (
        <CockpitHelpModal
          cardId={cardId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}