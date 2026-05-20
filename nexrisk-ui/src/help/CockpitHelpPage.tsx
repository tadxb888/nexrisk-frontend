import { Link } from 'react-router-dom';
import { COCKPIT_HELP, type CardHelp } from './cockpitHelp';

export function CockpitHelpPage() {
  const cards = Object.values(COCKPIT_HELP);

  return (
    <div className="h-full p-6 overflow-y-auto">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Cockpit Help</h1>
          <p className="text-text-secondary">
            What each card shows, how it's calculated, and what to do about it.
          </p>
        </div>
        <Link
          to="/cockpit"
          className="text-sm text-text-secondary hover:text-text-primary underline"
        >
          ← Back to Cockpit
        </Link>
      </div>

      {/* Table of contents */}
      <nav className="panel p-4 mb-6">
        <h2 className="text-xs uppercase tracking-wider text-text-muted mb-2">Cards</h2>
        <ol className="text-sm grid grid-cols-1 md:grid-cols-3 gap-2 list-decimal list-inside">
          {cards.map((c) => (
            <li key={c.cardId}>
              <a href={`#${c.cardId}`} className="text-text-primary hover:underline">
                {c.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Each card */}
      <div className="space-y-6">
        {cards.map((help: CardHelp) => (
          <section
            key={help.cardId}
            id={help.cardId}
            className="panel p-6 scroll-mt-6"
          >
            <h2 className="text-xl font-semibold text-text-primary mb-1">{help.title}</h2>
            <p className="text-sm text-text-secondary mb-4">{help.oneLineSummary}</p>

            <div className="mb-4">
              <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">What it answers</h3>
              <p className="text-sm text-text-primary italic">{help.whatItAnswers}</p>
            </div>

            <div className="mb-4">
              <h3 className="text-xs uppercase tracking-wider text-text-muted mb-2">Rows</h3>
              <div className="space-y-4">
                {help.rows.map((row) => (
                  <div key={row.label} className="border-l-2 border-text-muted/30 pl-3">
                    <div className="text-sm font-semibold text-text-primary mb-1">{row.label}</div>
                    <dl className="text-sm space-y-1">
                      <div><dt className="text-text-muted inline">Shows: </dt><dd className="text-text-primary inline">{row.whatItShows}</dd></div>
                      <div><dt className="text-text-muted inline">Calculation: </dt><dd className="text-text-primary inline">{row.howCalculated}</dd></div>
                      <div><dt className="text-text-muted inline">Colors: </dt><dd className="text-text-primary inline">{row.colorThresholds}</dd></div>
                      <div><dt className="text-text-muted inline">Action: </dt><dd className="text-text-primary inline">{row.whatToDo}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
            </div>

            {help.extras && help.extras.map((extra) => (
              <div key={extra.heading} className="mb-4">
                <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">{extra.heading}</h3>
                <pre className="text-xs text-text-primary whitespace-pre-wrap font-mono">{extra.bodyMarkdown}</pre>
              </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">Scope</h3>
                <p className="text-text-primary">{help.scope}</p>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">Refresh</h3>
                <p className="text-text-primary">{help.refresh}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-wider text-text-muted mb-1">Worth knowing</h3>
              <ul className="text-sm text-text-primary space-y-1 list-disc list-inside">
                {help.gotchas.map((g, i) => <li key={i}>{g}</li>)}
              </ul>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}