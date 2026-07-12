import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { COCKPIT_HELP, type CardHelp } from './cockpitHelp';

interface CockpitHelpModalProps {
  cardId:  string;
  onClose: () => void;
}

export function CockpitHelpModal({ cardId, onClose }: CockpitHelpModalProps) {
  const help: CardHelp | undefined = COCKPIT_HELP[cardId];

  // ESC closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!help) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`help-${cardId}-title`}
    >
      <div
        className="panel max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 id={`help-${cardId}-title`} className="text-xl font-semibold text-text-primary">
              {help.title}
            </h2>
            <p className="text-sm text-text-secondary mt-1">{help.oneLineSummary}</p>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-xl leading-none ml-4"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* What it answers */}
        <div className="mb-4">
          <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">What it answers</h3>
          <p className="text-sm text-text-primary italic">{help.whatItAnswers}</p>
        </div>

        {/* Rows */}
        <div className="mb-4">
          <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">Rows</h3>
          <div className="space-y-4">
            {help.rows.map((row) => (
              <div key={row.label} className="border-l-2 border-text-muted/30 pl-3">
                <div className="text-sm font-semibold text-text-primary mb-1">{row.label}</div>
                <dl className="text-sm space-y-1">
                  <div>
                    <dt className="text-text-muted inline">Shows: </dt>
                    <dd className="text-text-primary inline">{row.whatItShows}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted inline">Calculation: </dt>
                    <dd className="text-text-primary inline">{row.howCalculated}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted inline">Colors: </dt>
                    <dd className="text-text-primary inline">{row.colorThresholds}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted inline">Action: </dt>
                    <dd className="text-text-primary inline">{row.whatToDo}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </div>

        {/* Extras (e.g. tier reference table) */}
        {help.extras && help.extras.map((extra) => (
          <div key={extra.heading} className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">{extra.heading}</h3>
            <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono">{extra.bodyMarkdown}</pre>
          </div>
        ))}

        {/* Footer — link to full help */}
        <div className="pt-3 border-t border-text-muted/20 flex items-center justify-between text-sm">
          <Link to="/cockpit/help" className="text-text-secondary hover:text-text-primary underline">
            View full help page
          </Link>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}