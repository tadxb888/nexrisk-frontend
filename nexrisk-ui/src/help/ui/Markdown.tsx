// help/ui/Markdown.tsx
// Dependency-free markdown renderer for help articles and answers.
// Handles: ## / ### / #### headings, - / * bullet lists, > blockquotes,
// | pipe tables |, paragraphs, and inline **bold**, `code`, and
// [[article-id#anchor]] citation chips. Tuned to render operator manuals
// (chapters, sections, reference tables) cleanly on the Taiga dark theme.

import React from 'react';
import { T } from './helpTheme';

type Props = { text: string; onCite?: (id: string, anchor?: string) => void };

// colour words in reference tables get a subtle status tint
const STATUS_TINT: Record<string, string> = {
  green: '#66e07a', teal: '#49b3b3', amber: '#e0a020',
  red: '#ff5c5c', grey: '#9a9a9a', gray: '#9a9a9a', orange: '#f5802c',
};

function inline(text: string, onCite?: Props['onCite'], keyBase = 'i'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const rx = /(\*\*[^*]+\*\*|`[^`]+`|\[\[[a-z0-9-]+(?:#[a-z0-9-]+)?\]\])/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = rx.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) {
      out.push(<strong key={`${keyBase}b${k++}`} style={{ color: T.text, fontWeight: 600 }}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(<code key={`${keyBase}c${k++}`} style={{ fontFamily: T.mono, fontSize: 13, background: T.field, border: `1px solid ${T.border}`, borderRadius: 4, padding: '1px 5px', color: T.amber }}>{tok.slice(1, -1)}</code>);
    } else {
      const cm = /\[\[([a-z0-9-]+)(?:#([a-z0-9-]+))?\]\]/.exec(tok)!;
      out.push(
        <button key={`${keyBase}cite${k++}`} onClick={() => onCite?.(cm[1], cm[2])} title={cm[1]}
          style={{ fontFamily: T.mono, fontSize: 12, color: T.accent, background: 'transparent', border: `1px solid ${T.accentDim}`, borderRadius: 4, padding: '0 5px', margin: '0 2px', cursor: 'pointer', verticalAlign: 'baseline', lineHeight: '18px' }}>
          {cm[1]}
        </button>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// tint a lone status word (Green / Amber / Red / Teal) inside a table cell
function cellContent(txt: string, onCite: Props['onCite'], kb: string): React.ReactNode[] {
  const tint = STATUS_TINT[txt.trim().toLowerCase()];
  if (tint) return [<span key={kb} style={{ color: tint, fontWeight: 600 }}>{txt.trim()}</span>];
  return inline(txt, onCite, kb);
}

export default function Markdown({ text, onCite }: Props) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0, key = 0;

  const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
  const isTableSep = (s: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(s) && s.includes('-');

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // ---- table ----
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const cells = (s: string) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const header = cells(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
      blocks.push(
        <div key={key++} style={{ overflowX: 'auto', margin: '14px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14, border: `1px solid ${T.border}` }}>
            <thead>
              <tr>{header.map((h, n) => (
                <th key={n} style={{ textAlign: 'left', padding: '9px 12px', background: '#242427', color: T.text, fontWeight: 600, borderBottom: `1px solid ${T.border}`, borderRight: n < header.length - 1 ? `1px solid ${T.border}` : 'none', whiteSpace: 'nowrap' }}>
                  {inline(h, onCite, `th${key}_${n}`)}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r, rn) => (
                <tr key={rn} style={{ background: rn % 2 ? '#1d1d20' : 'transparent' }}>
                  {r.map((c, cn) => (
                    <td key={cn} style={{ padding: '8px 12px', color: T.textBody, verticalAlign: 'top', borderTop: `1px solid ${T.border}`, borderRight: cn < r.length - 1 ? `1px solid ${T.border}` : 'none', lineHeight: 1.5 }}>
                      {cellContent(c, onCite, `td${key}_${rn}_${cn}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // ---- heading ----
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const txt = h[2].replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
      if (level === 2) {
        blocks.push(
          <div key={key++} style={{ color: T.text, fontWeight: 700, fontSize: 19, margin: '26px 0 10px', paddingBottom: 7, borderBottom: `1px solid ${T.border}` }}>
            {inline(txt, onCite, `h${key}`)}
          </div>,
        );
      } else if (level === 3) {
        blocks.push(
          <div key={key++} style={{ color: T.text, fontWeight: 600, fontSize: 16, margin: '18px 0 6px' }}>
            {inline(txt, onCite, `h${key}`)}
          </div>,
        );
      } else {
        blocks.push(
          <div key={key++} style={{ color: T.accent, fontWeight: 600, fontSize: 14, letterSpacing: 0.2, margin: '14px 0 4px' }}>
            {inline(txt, onCite, `h${key}`)}
          </div>,
        );
      }
      i++; continue;
    }

    // ---- blockquote ----
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push(
        <div key={key++} style={{ borderLeft: `3px solid ${T.accentDim}`, background: '#1d1d20', padding: '8px 12px', margin: '12px 0', color: T.textBody, fontSize: 14, borderRadius: '0 4px 4px 0' }}>
          {inline(buf.join(' '), onCite, `q${key}`)}
        </div>,
      );
      continue;
    }

    // ---- list ----
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(
        <ul key={key++} style={{ margin: '8px 0', paddingLeft: 22, color: T.textBody, fontSize: 16 }}>
          {items.map((it, n) => (
            <li key={n} style={{ margin: '5px 0', lineHeight: 1.6 }}>{inline(it, onCite, `l${key}_${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // ---- paragraph ----
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|>\s?|\s*[-*]\s)/.test(lines[i]) && !isTableRow(lines[i])) { buf.push(lines[i]); i++; }
    blocks.push(
      <p key={key++} style={{ margin: '8px 0', color: T.textBody, fontSize: 16, lineHeight: 1.7 }}>
        {inline(buf.join(' '), onCite, `p${key}`)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
