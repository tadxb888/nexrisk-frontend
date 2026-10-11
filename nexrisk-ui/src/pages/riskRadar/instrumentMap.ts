// ============================================
// Risk Radar — the instrument map
//
// One fixed layout shared by every layer: an instrument keeps its place
// whatever is being measured. Position carries NO measurement — it is
// geography only.
//
// THE GROUPS ARE THE BROKER'S OWN. Regions come from the symbol tree of the
// MT5 MASTER (the folder each symbol sits under on that server), in the order
// the server lists them. Nothing is inferred from a symbol's name. A symbol
// the tree does not contain — a cTrader symbol with no MT5 namesake, or any
// symbol while the tree cannot be read — is drawn under "Unclassified".
//
// Everything is in unit coordinates (0..1 of the map).
// ============================================

export interface TreeInstrument {
  symbol: string;
  /** Path on the MT5 server, e.g. "Forex\\Majors\\EURUSD". */
  path: string;
}

export interface Region {
  id: string;
  /** The folder name exactly as the broker wrote it. */
  name: string;
  rect: { x: number; y: number; w: number; h: number };
}

export interface MapPosition {
  region: string;
  /** Unit coordinates of the whole map. */
  x: number;
  y: number;
}

export interface InstrumentMap {
  regions: Region[];
  positions: Map<string, MapPosition>;
  /** Region name of a symbol, for text. */
  regionOf: (symbol: string) => string;
}

export const UNCLASSIFIED = 'Unclassified';
const MAX_REGIONS = 12;
const OVERFLOW = 'Other groups';

function folders(path: string, symbol: string): string[] {
  const parts = path.split(/[\\/]+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length && parts[parts.length - 1] === symbol) parts.pop();
  return parts;
}

/**
 * Symbol → group, from the tree. The group is the top-level folder. When one
 * top-level folder holds nearly everything (a server that keeps its whole
 * catalogue under a single root), its sub-folders are used instead, so the
 * map does not collapse into one region.
 */
export function groupsFromTree(tree: TreeInstrument[]): { groupOf: Map<string, string>; order: string[] } {
  const paths = new Map<string, string[]>();
  for (const t of tree) paths.set(t.symbol, folders(t.path ?? '', t.symbol));

  const count = (depth: number) => {
    const c = new Map<string, number>();
    for (const p of paths.values()) {
      const key = p.slice(0, depth + 1).join(' / ') || UNCLASSIFIED;
      c.set(key, (c.get(key) ?? 0) + 1);
    }
    return c;
  };

  let depth = 0;
  const top = count(0);
  const biggest = Math.max(0, ...top.values());
  const deeper = [...paths.values()].some((p) => p.length > 1);
  if (paths.size > 0 && deeper && biggest / paths.size > 0.9) depth = 1;

  const groupOf = new Map<string, string>();
  const order: string[] = [];
  const seen = new Set<string>();
  for (const [symbol, p] of paths) {
    const key = p.slice(0, depth + 1).join(' / ') || UNCLASSIFIED;
    groupOf.set(symbol, key);
    if (!seen.has(key)) { seen.add(key); order.push(key); }
  }
  return { groupOf, order };
}

/** FNV-1a — a stable number from a symbol name. */
export function hashSymbol(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Regions ──────────────────────────────────────────────────

function layoutRegions(names: string[]): Region[] {
  const n = names.length;
  if (n === 0) return [];
  const rows = n <= 3 ? 1 : n <= 10 ? 2 : 3;
  const perRow: number[] = [];
  let left = n;
  for (let r = 0; r < rows; r++) {
    const take = Math.ceil(left / (rows - r));
    perRow.push(take);
    left -= take;
  }

  const M = 0.012;          // outer margin
  const G = 0.012;          // gap between regions
  const top = 0.035;
  const bottom = 0.03;
  const rowH = (1 - top - bottom - G * (rows - 1)) / rows;

  const out: Region[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    const cols = perRow[r];
    const colW = (1 - 2 * M - G * (cols - 1)) / cols;
    for (let c = 0; c < cols; c++) {
      const name = names[i++];
      out.push({
        id: name,
        name,
        rect: { x: M + c * (colW + G), y: top + r * (rowH + G), w: colW, h: rowH },
      });
    }
  }
  return out;
}

// ── Places inside a region ───────────────────────────────────
// The n-th instrument of a region takes the n-th point of a Halton sequence:
// however many instruments a region holds, they are spread evenly over it, and
// the first one sits in the middle. The area keeps clear of the caption strip
// at the top and of the region's lower edge.

function halton(index: number, base: number): number {
  let f = 1;
  let r = 0;
  for (let i = index; i > 0; i = Math.floor(i / base)) {
    f /= base;
    r += f * (i % base);
  }
  return r;
}

// Places are remembered for the session, so an instrument never moves once it
// has been seen. They are tied to the set of regions: when that changes (the
// tree arrives, or the broker edits it) the map is laid out again.
let memoKey = '';
const assigned = new Map<string, { region: string; u: number; v: number }>();

function assign(symbol: string, region: string) {
  let n = 1;
  for (const a of assigned.values()) if (a.region === region) n++;
  assigned.set(symbol, {
    region,
    u: 0.13 + halton(n, 2) * 0.74,
    v: 0.36 + halton(n, 3) * 0.44,
  });
}

/**
 * The map for the instruments on screen.
 *
 * @param groupOf  symbol → group from the broker's tree (empty while unknown)
 * @param order    groups in the server's order
 * @param symbols  instruments to place
 */
export function buildMap(
  groupOf: Map<string, string>,
  order: string[],
  symbols: string[],
): InstrumentMap {
  // Every group of the tree is a region, so the map does not reshuffle when
  // exposure appears in a new group. Beyond MAX_REGIONS the tail is folded.
  let names = order.filter((g) => g !== UNCLASSIFIED);
  const folded = new Set<string>();
  if (names.length > MAX_REGIONS) {
    for (const g of names.slice(MAX_REGIONS - 1)) folded.add(g);
    names = [...names.slice(0, MAX_REGIONS - 1), OVERFLOW];
  }

  const regionNameOf = (symbol: string): string => {
    const g = groupOf.get(symbol);
    if (!g || g === UNCLASSIFIED) return UNCLASSIFIED;
    return folded.has(g) ? OVERFLOW : g;
  };

  if (symbols.some((s) => regionNameOf(s) === UNCLASSIFIED)) names = [...names, UNCLASSIFIED];

  const regions = layoutRegions(names);
  const byName = new Map(regions.map((r) => [r.name, r] as const));

  const key = names.join('|');
  if (key !== memoKey) { memoKey = key; assigned.clear(); }

  // New instruments are placed in name order, so the same book always gives
  // the same map.
  for (const s of symbols.filter((x) => !assigned.has(x)).sort()) assign(s, regionNameOf(s));

  const positions = new Map<string, MapPosition>();
  for (const s of symbols) {
    const a = assigned.get(s);
    const region = a ? byName.get(a.region) : undefined;
    if (!a || !region) continue;
    positions.set(s, {
      region: region.name,
      x: region.rect.x + a.u * region.rect.w,
      y: region.rect.y + a.v * region.rect.h,
    });
  }

  return { regions, positions, regionOf: regionNameOf };
}
