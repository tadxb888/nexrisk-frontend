// help/ui/Markdown.tsx
// Minimal, dependency-free markdown renderer for help articles and answers.
// Handles: ## / ### headings, - / * bullet lists, > blockquotes, paragraphs,
// and inline **bold**, `code`, and [[article-id#anchor]] citation chips.
// Citations render as clickable chips; onCite deep-links to the article.

import React from 'react';
import { T } from './helpTheme';

type Props = { text: string; onCite?: (id: string, anchor?: string) => void };

// Inline: split on **bold**, `code`, and [[cite]] while preserving order.
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
      out.push(<code key={`${keyBase}c${k++}`} style={{ fontFamily: T.mono, fontSize: 12, background: T.field, border: `1px solid ${T.borderSoft}`, borderRadius: 4, padding: '1px 5px', color: T.amber }}>{tok.slice(1, -1)}</code>);
    } else {
      const cm = /\[\[([a-z0-9-]+)(?:#([a-z0-9-]+))?\]\]/.exec(tok)!;
      const id = cm[1], anchor = cm[2];
      out.push(
        <button
          key={`${keyBase}cite${k++}`}
          onClick={() => onCite?.(id, anchor)}
          title={id}
          style={{
            fontFamily: T.mono, fontSize: 11, color: T.accent, background: 'transparent',
            border: `1px solid ${T.accentDim}`, borderRadius: 4, padding: '0 5px',
            margin: '0 2px', cursor: 'pointer', verticalAlign: 'baseline', lineHeight: '16px',
          }}
        >
          {id}
        </button>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, onCite }: Props) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0, key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // heading (strip trailing {#anchor})
    const h = /^(#{2,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const txt = h[2].replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
      const size = level === 2 ? 15 : level === 3 ? 13 : 12;
      blocks.push(
        <div key={key++} style={{ color: T.text, fontWeight: 600, fontSize: size, margin: '14px 0 6px' }}>
          {inline(txt, onCite, `h${key}`)}
        </div>,
      );
      i++; continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push(
        <div key={key++} style={{ borderLeft: `2px solid ${T.accentDim}`, padding: '4px 0 4px 10px', margin: '8px 0', color: T.textDim, fontSize: 13 }}>
          {inline(buf.join(' '), onCite, `q${key}`)}
        </div>,
      );
      continue;
    }

    // list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      blocks.push(
        <ul key={key++} style={{ margin: '6px 0', paddingLeft: 18, color: T.text, fontSize: 13 }}>
          {items.map((it, n) => (
            <li key={n} style={{ margin: '3px 0', lineHeight: 1.55 }}>{inline(it, onCite, `l${key}_${n}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // paragraph (gather until blank line)
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|>\s?|\s*[-*]\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
    blocks.push(
      <p key={key++} style={{ margin: '6px 0', color: T.text, fontSize: 13, lineHeight: 1.6 }}>
        {inline(buf.join(' '), onCite, `p${key}`)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
