// help/ui/helpTheme.ts
// Design tokens taken 1:1 from the app's own Sidebar + BBookPage, so the Help
// tree matches the real navigation tree. Inline styles throughout (arbitrary
// Tailwind is unreliable in this build).

export const T = {
  // surfaces
  railBg: '#1b1a1d',      // tree rail background (Sidebar RAIL_BG)
  pageBg: '#1a1a1c',
  panel: '#232225',       // content cards
  panel2: '#1e1e20',
  field: '#232327',       // inputs / hover (Sidebar HOVER_BG)
  hoverBg: '#232327',
  border: '#2f2f33',      // Sidebar BORDER
  borderSoft: '#2a2a2e',

  // text (from Sidebar: #fff labels, #ddd leaves; BBookPage: text-white content)
  text: '#ffffff',        // primary content + section labels
  textLeaf: '#dddddd',    // inactive tree leaf — readable soft white, NOT grey
  textBody: '#e6e7ea',    // article body copy
  textDim: '#9a9a9a',     // secondary
  textMute: '#888888',    // faint

  // semantic (BBookPage / Sidebar)
  accent: '#49b3b3',      // teal — active leaf, links, citations
  accentDim: '#2d7a7a',
  owner: '#f5802c',       // orange — active/owning section header
  amber: '#e0a020',
  danger: '#ff5c5c',

  mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace",
  ui: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
} as const;

export const DOMAIN_LABEL: Record<string, string> = {
  settings: 'Settings',
  intel: 'Market Intelligence',
  operations: 'Operations',
};

export const DOMAIN_ORDER = ['settings', 'intel', 'operations'];
