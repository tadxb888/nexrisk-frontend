// ============================================
// bookColors.ts
//
// Single source of truth for the book color palette used across the
// Portfolio page (charts, breakdown grid, status indicators, etc.).
// Changing a book's color = edit one line here, propagates everywhere.
//
// Design principles:
//   • Mid-saturation, similar luminance — readable on dark #1e1e20 BG,
//     no single book dominates visually.
//   • Four distinct hue families (blue / violet / orange / green) so
//     lines and slices are distinguishable at a glance even at thin
//     stroke widths or small slice sizes.
//   • Portfolio sits in a fourth hue family (teal-green) clearly
//     separate from C (warm orange) and A (cool blue) — avoids the
//     "is that C or Portfolio?" confusion the prior cream/peach
//     palette caused.
//
// Usage:
//   import { BOOK_COLORS } from './bookColors';
//   stroke={BOOK_COLORS.b}
//
// For sign-based colors (P/L positive/negative), see the per-chart
// COLOR_POSITIVE / COLOR_NEGATIVE constants — those are semantic, not
// book-identity, so they live with the chart that uses them.
// ============================================

/** Per-book brand colors. Use these wherever a book identity is shown. */
export const BOOK_COLORS = {
  a:         '#7ea8d4',   // mid blue
  b:         '#b89cc4',   // mid violet
  c:         '#e89968',   // warm orange
  portfolio: '#7dc4b5',   // soft teal-green
} as const;

/** Display labels matching the colors. Useful for legends and tooltips. */
export const BOOK_LABELS = {
  a:         'A-Book',
  b:         'B-Book',
  c:         'C-Book',
  portfolio: 'Portfolio',
} as const;

/** Canonical iteration order — used wherever charts list books. B/A/C
 *  matches the broker mental model (internal first, then hedge). */
export const BOOK_ORDER: Array<keyof typeof BOOK_COLORS> = ['b', 'a', 'c', 'portfolio'];