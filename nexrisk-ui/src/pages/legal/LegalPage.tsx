import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { AuthLogo, AuthFooter } from '../authStyles';

// ─────────────────────────────────────────────────────────────────────────────
// Shared legal document page — Terms, Disclosure, Privacy.
// Reuses the Taiga auth theme (#131214 / #1e1c20 / #49b3b3 · IBM Plex Mono).
// Renders a small, dependency-free subset of Markdown so each document can be
// authored/edited as a plain string in its page file.
// ─────────────────────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#131214',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '120px 24px 56px',
    fontFamily: '"IBM Plex Mono", monospace',
    position: 'relative',
  },
  card: {
    width: '100%',
    maxWidth: 860,
    background: '#1e1c20',
    border: '1px solid #3a3840',
    borderRadius: 8,
    padding: '40px 48px 44px',
  },
  back: {
    display: 'inline-block',
    fontSize: 13,
    color: '#c8c6d0',
    textDecoration: 'none',
    marginBottom: 24,
    letterSpacing: '0.02em',
    transition: 'color 0.15s',
  },
  h1: { fontSize: 26, fontWeight: 700, color: '#ffffff', margin: '0 0 4px', letterSpacing: '0.01em' },
  h2: { fontSize: 17, fontWeight: 600, color: '#ffffff', margin: '34px 0 12px' },
  h3: { fontSize: 14, fontWeight: 600, color: '#ffffff', margin: '22px 0 8px' },
  p: { fontSize: 13.5, color: '#c4c2cc', lineHeight: 1.75, margin: '0 0 13px' },
  strong: { color: '#ffffff', fontWeight: 700 },
  link: { color: '#49b3b3', textDecoration: 'none' },
  code: {
    fontFamily: '"IBM Plex Mono", monospace',
    background: '#131214',
    padding: '1px 5px',
    borderRadius: 3,
    fontSize: 12.5,
    color: '#49b3b3',
  },
  ul: { margin: '0 0 13px', paddingLeft: 22 },
  li: { fontSize: 13.5, color: '#c4c2cc', lineHeight: 1.7, margin: '0 0 6px' },
  table: { width: '100%', borderCollapse: 'collapse', margin: '6px 0 16px' },
  th: {
    border: '1px solid #3a3840',
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 12.5,
    color: '#ffffff',
    background: '#131214',
    fontWeight: 600,
  },
  td: {
    border: '1px solid #3a3840',
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 12.5,
    color: '#c4c2cc',
    lineHeight: 1.6,
    verticalAlign: 'top',
  },
  hr: { border: 'none', borderTop: '1px solid #2a2830', margin: '26px 0' },
  quote: {
    borderLeft: '3px solid #3a3840',
    padding: '2px 0 2px 16px',
    margin: '0 0 16px',
    color: '#a0a0b0',
    fontSize: 13,
    lineHeight: 1.7,
  },
};

// Inline formatting: **bold**, [text](url), `code`.
function renderInline(text: string, kp: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)/g;
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<Fragment key={`${kp}-t${n}`}>{text.slice(last, m.index)}</Fragment>);
    }
    if (m[1]) {
      nodes.push(<strong key={`${kp}-b${n}`} style={S.strong}>{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(
        <a key={`${kp}-a${n}`} href={m[5]} style={S.link} target="_blank" rel="noreferrer">{m[4]}</a>,
      );
    } else if (m[6]) {
      nodes.push(<code key={`${kp}-c${n}`} style={S.code}>{m[7]}</code>);
    }
    last = m.index + m[0].length;
    n++;
  }
  if (last < text.length) {
    nodes.push(<Fragment key={`${kp}-tail`}>{text.slice(last)}</Fragment>);
  }
  return nodes;
}

const isListLine = (l: string) => /^\s*-\s+/.test(l);
const isTableLine = (l: string) => l.trim().startsWith('|');
const isQuoteLine = (l: string) => l.startsWith('> ');
const isHeading = (l: string) => /^#{1,6}\s+/.test(l);
const isHr = (l: string) => /^---+$/.test(l.trim());

function parseRow(r: string): string[] {
  return r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const nextKey = () => `blk-${key++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    if (isHr(line)) { out.push(<hr key={nextKey()} style={S.hr} />); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const k = nextKey();
      if (lvl === 1) out.push(<h1 key={k} style={S.h1}>{renderInline(h[2], k)}</h1>);
      else if (lvl === 2) out.push(<h2 key={k} style={S.h2}>{renderInline(h[2], k)}</h2>);
      else out.push(<h3 key={k} style={S.h3}>{renderInline(h[2], k)}</h3>);
      i++; continue;
    }

    if (isQuoteLine(line)) {
      const buf: string[] = [];
      while (i < lines.length && isQuoteLine(lines[i])) { buf.push(lines[i].slice(2)); i++; }
      const k = nextKey();
      out.push(<blockquote key={k} style={S.quote}>{renderInline(buf.join(' '), k)}</blockquote>);
      continue;
    }

    if (isTableLine(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) { rows.push(lines[i]); i++; }
      const k = nextKey();
      const header = parseRow(rows[0]);
      const body = rows.slice(2); // rows[1] is the |---| separator
      out.push(
        <table key={k} style={S.table}>
          <thead>
            <tr>{header.map((c, ci) => <th key={`${k}-h${ci}`} style={S.th}>{renderInline(c, `${k}-h${ci}`)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, ri) => {
              const cells = parseRow(r);
              return (
                <tr key={`${k}-r${ri}`}>
                  {cells.map((c, ci) => <td key={`${k}-r${ri}c${ci}`} style={S.td}>{renderInline(c, `${k}-r${ri}c${ci}`)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>,
      );
      continue;
    }

    if (isListLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isListLine(lines[i])) { items.push(lines[i].replace(/^\s*-\s+/, '')); i++; }
      const k = nextKey();
      out.push(
        <ul key={k} style={S.ul}>
          {items.map((it, ii) => <li key={`${k}-i${ii}`} style={S.li}>{renderInline(it, `${k}-i${ii}`)}</li>)}
        </ul>,
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines; preserve intra-block line breaks
    // (used by the contact/address block).
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isHeading(lines[i]) &&
      !isHr(lines[i]) &&
      !isQuoteLine(lines[i]) &&
      !isTableLine(lines[i]) &&
      !isListLine(lines[i])
    ) {
      buf.push(lines[i]); i++;
    }
    const k = nextKey();
    out.push(
      <p key={k} style={S.p}>
        {buf.map((ln, li) => (
          <Fragment key={`${k}-l${li}`}>
            {li > 0 && <br />}
            {renderInline(ln, `${k}-l${li}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return out;
}

export function LegalPage({ content }: { content: string }) {
  return (
    <div style={S.page}>
      <AuthLogo />

      <div style={S.card}>
        <a
          href="/login"
          style={S.back}
          onMouseEnter={e => (e.currentTarget.style.color = '#49b3b3')}
          onMouseLeave={e => (e.currentTarget.style.color = '#c8c6d0')}
        >
          ← Back to sign in
        </a>

        {renderMarkdown(content)}
      </div>

      <AuthFooter />
    </div>
  );
}