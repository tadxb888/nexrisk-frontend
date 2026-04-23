// ============================================
// HelpContent — markdown renderer for the operator manual
//
// Renders the raw markdown files (nexrisk-ui/src/pages/settings/help/*.md)
// using react-markdown + remark-gfm. Every element is mapped to a component
// with Taiga-palette styling so the content feels native to the Settings
// surface rather than dropping the user into a default-browser-colored
// document.
//
// No prose library (Tailwind Typography) — we hand-style instead to match
// the rest of the Settings pages exactly: #313032 body bg, #d2d6e2 for
// running text, teal accent for links, IBM Plex Mono for code spans.
// ============================================

import type { ComponentType, ReactNode, HTMLAttributes } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface HelpContentProps {
  markdown: string;
}

export function HelpContent({ markdown }: HelpContentProps): ReactNode {
  return (
    <div className="help-content text-[14px] leading-relaxed" style={{ color: '#d2d6e2' }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={componentMap}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Element mappings
// ─────────────────────────────────────────────────────────────────────────────

type CompProps<T extends keyof HTMLElementTagNameMap> = HTMLAttributes<HTMLElementTagNameMap[T]> & {
  children?: ReactNode;
  node?: unknown;
};

const H1: ComponentType<CompProps<'h1'>> = ({ children }) => (
  <h1
    className="text-xl font-medium tracking-tight mt-0 mb-3 pb-2 border-b"
    style={{ color: '#E6E6E6', borderColor: '#44454f' }}
  >
    {children}
  </h1>
);

const H2: ComponentType<CompProps<'h2'>> = ({ children }) => (
  <h2
    className="text-[15px] font-medium mt-5 mb-2"
    style={{ color: '#E6E6E6' }}
  >
    {children}
  </h2>
);

const H3: ComponentType<CompProps<'h3'>> = ({ children }) => (
  <h3
    className="text-[13px] font-medium mt-4 mb-1.5 uppercase tracking-wide"
    style={{ color: '#b6babf' }}
  >
    {children}
  </h3>
);

const H4: ComponentType<CompProps<'h4'>> = ({ children }) => (
  <h4 className="text-[13px] font-medium mt-3 mb-1" style={{ color: '#d2d6e2' }}>
    {children}
  </h4>
);

const P: ComponentType<CompProps<'p'>> = ({ children }) => (
  <p className="my-2 leading-relaxed" style={{ color: '#d2d6e2' }}>
    {children}
  </p>
);

const UL: ComponentType<CompProps<'ul'>> = ({ children }) => (
  <ul className="my-2 pl-5 list-none flex flex-col gap-1">{children}</ul>
);

const OL: ComponentType<CompProps<'ol'>> = ({ children }) => (
  <ol className="my-2 pl-5 list-decimal flex flex-col gap-1">{children}</ol>
);

const LI: ComponentType<CompProps<'li'>> = ({ children }) => (
  <li className="leading-relaxed relative" style={{ color: '#d2d6e2' }}>
    <span
      className="absolute rounded-full"
      style={{ left: -15, top: 7, width: 5, height: 5, background: '#49b3b3' }}
    />
    {children}
  </li>
);

// GFM task list item — rendered differently from regular LI.
// react-markdown adds a <input type="checkbox"> before the content.
const InputCheckbox: ComponentType<HTMLAttributes<HTMLInputElement> & { checked?: boolean }> = ({ checked }) => (
  <span
    className="inline-flex items-center justify-center rounded mr-1.5 align-middle"
    style={{
      width:       13,
      height:      13,
      background:  checked ? '#49b3b3' : '#232225',
      border:      `1px solid ${checked ? '#49b3b3' : '#44454f'}`,
      marginTop:   -2,
    }}
  >
    {checked && (
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
        <path d="M2 5L4 7L8 3" stroke="#0b0c0e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

const STRONG: ComponentType<CompProps<'strong'>> = ({ children }) => (
  <strong className="font-semibold" style={{ color: '#E6E6E6' }}>
    {children}
  </strong>
);

const EM: ComponentType<CompProps<'em'>> = ({ children }) => (
  <em className="italic" style={{ color: '#d2d6e2' }}>{children}</em>
);

const A: ComponentType<CompProps<'a'> & { href?: string }> = ({ href, children }) => (
  <a
    href={href}
    target={href?.startsWith('http') ? '_blank' : undefined}
    rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    className="underline"
    style={{ color: '#49b3b3', textDecorationColor: '#2f8f8f' }}
  >
    {children}
  </a>
);

// Inline code — small mono pill.
// Fenced code blocks come through as <pre><code>, which we'll style via PRE.
const CODE: ComponentType<CompProps<'code'> & { inline?: boolean }> = ({ inline, children, className }) => {
  // react-markdown v9+ doesn't pass `inline` — detect by absence of `language-*` className
  const isInline = inline ?? !className;
  if (isInline) {
    return (
      <code
        className="font-mono text-[12px] px-1.5 py-0.5 rounded mx-[1px]"
        style={{ background: '#1a1a1d', color: '#E6E6E6', border: '1px solid #2a292c' }}
      >
        {children}
      </code>
    );
  }
  // Block code — let PRE wrapper handle surrounding chrome, just style the code
  return (
    <code className="font-mono text-[12px] block" style={{ color: '#d2d6e2' }}>
      {children}
    </code>
  );
};

const PRE: ComponentType<CompProps<'pre'>> = ({ children }) => (
  <pre
    className="my-3 p-3 rounded overflow-auto"
    style={{ background: '#1a1a1d', border: '1px solid #2a292c' }}
  >
    {children}
  </pre>
);

// Blockquote — rarely used in the manual but styled for completeness.
const BLOCKQUOTE: ComponentType<CompProps<'blockquote'>> = ({ children }) => (
  <blockquote
    className="my-3 pl-3 py-1"
    style={{ borderLeft: '3px solid #c9b87c', color: '#b6babf' }}
  >
    {children}
  </blockquote>
);

const HR: ComponentType<CompProps<'hr'>> = () => (
  <hr className="my-4 border-0" style={{ borderTop: '1px solid #2a292c' }} />
);

// GFM tables
const TABLE: ComponentType<CompProps<'table'>> = ({ children }) => (
  <div className="my-3 overflow-auto rounded" style={{ border: '1px solid #2a292c' }}>
    <table
      className="w-full border-collapse text-[12px]"
      style={{ background: '#1a1a1d' }}
    >
      {children}
    </table>
  </div>
);

const THEAD: ComponentType<CompProps<'thead'>> = ({ children }) => (
  <thead style={{ background: '#232225', borderBottom: '1px solid #2a292c' }}>{children}</thead>
);

const TH: ComponentType<CompProps<'th'>> = ({ children }) => (
  <th
    className="text-left px-3 py-2 font-medium uppercase tracking-wide text-[10.5px]"
    style={{ color: '#b6babf' }}
  >
    {children}
  </th>
);

const TR: ComponentType<CompProps<'tr'>> = ({ children }) => (
  <tr style={{ borderBottom: '1px solid #2a292c' }}>{children}</tr>
);

const TD: ComponentType<CompProps<'td'>> = ({ children }) => (
  <td className="px-3 py-2 align-top" style={{ color: '#d2d6e2' }}>
    {children}
  </td>
);

const componentMap: Components = {
  h1:         H1 as Components['h1'],
  h2:         H2 as Components['h2'],
  h3:         H3 as Components['h3'],
  h4:         H4 as Components['h4'],
  p:          P  as Components['p'],
  ul:         UL as Components['ul'],
  ol:         OL as Components['ol'],
  li:         LI as Components['li'],
  strong:     STRONG as Components['strong'],
  em:         EM as Components['em'],
  a:          A as Components['a'],
  code:       CODE as Components['code'],
  pre:        PRE as Components['pre'],
  blockquote: BLOCKQUOTE as Components['blockquote'],
  hr:         HR as Components['hr'],
  table:      TABLE as Components['table'],
  thead:      THEAD as Components['thead'],
  th:         TH as Components['th'],
  tr:         TR as Components['tr'],
  td:         TD as Components['td'],
  input:      InputCheckbox as Components['input'],
};

export default HelpContent;