// help/ui/helpTheme.ts
// Design tokens for the Help UI, taken from the Taiga design system
// (BBookPage canonical). Inline styles are used throughout because arbitrary
// Tailwind classes are unreliable in this build.

export const T = {
  pageBg: '#1a1a1c',
  panel: '#232225',
  panel2: '#1e1e20',
  field: '#252429',
  border: '#3a3a3c',
  borderSoft: '#2d2d32',
  text: '#d2d6e2',
  textDim: '#8b8b93',
  textMute: '#6b6b73',
  accent: '#49b3b3',
  accentDim: '#2d7a7a',
  amber: '#c9b87c',
  danger: '#d07070',
  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  ui: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
} as const;

// Friendly labels for the six nav domains (corpus tree headers).
export const DOMAIN_LABEL: Record<string, string> = {
  summary: 'Summary',
  books: 'Books',
  execution: 'Execution',
  intel: 'Market Intelligence',
  reports: 'Reports',
  settings: 'Settings',
};

export const DOMAIN_ORDER = ['summary', 'books', 'execution', 'intel', 'reports', 'settings'];
