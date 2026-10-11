// ============================================
// Risk Radar — the instrument map
//
// One fixed layout shared by every layer: an instrument keeps its place
// whatever is being measured, so the eye learns where EURUSD or XAUUSD
// lives. Position carries NO measurement — it is geography only.
//
// Families and positions are derived here from the symbol name until the
// service ships `asset_class` and a canonical layout (see the Risk Radar
// backend brief). Everything is in unit coordinates (0..1 of the map).
// ============================================

export type FamilyId =
  | 'fx_majors'
  | 'fx_crosses'
  | 'metals'
  | 'indices'
  | 'energy'
  | 'crypto'
  | 'other';

export interface Family {
  id: FamilyId;
  /** Region caption on the map. */
  label: string;
  /** Name in running text and tables. */
  name: string;
  /** Region on the map, unit coordinates. */
  rect: { x: number; y: number; w: number; h: number };
}

export const FAMILIES: Family[] = [
  { id: 'fx_majors',  label: 'FX MAJORS', name: 'FX Majors',  rect: { x: 0.012, y: 0.035, w: 0.392, h: 0.475 } },
  { id: 'fx_crosses', label: 'FX CROSSES', name: 'FX Crosses', rect: { x: 0.416, y: 0.035, w: 0.300, h: 0.475 } },
  { id: 'metals',     label: 'METALS', name: 'Metals',     rect: { x: 0.728, y: 0.035, w: 0.260, h: 0.475 } },
  { id: 'indices',    label: 'INDICES', name: 'Indices',    rect: { x: 0.012, y: 0.540, w: 0.300, h: 0.430 } },
  { id: 'energy',     label: 'ENERGY', name: 'Energy',     rect: { x: 0.324, y: 0.540, w: 0.196, h: 0.430 } },
  { id: 'crypto',     label: 'CRYPTO', name: 'Crypto',     rect: { x: 0.532, y: 0.540, w: 0.220, h: 0.430 } },
  { id: 'other',      label: 'OTHER', name: 'Other',      rect: { x: 0.764, y: 0.540, w: 0.224, h: 0.430 } },
];

const FAMILY_BY_ID = new Map(FAMILIES.map((f) => [f.id, f] as const));

export function familyName(id: FamilyId): string {
  return FAMILY_BY_ID.get(id)?.name ?? id;
}

// ── Symbol name → family ─────────────────────────────────────

const CURRENCIES = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'SEK', 'NOK', 'DKK',
  'PLN', 'HUF', 'CZK', 'TRY', 'ZAR', 'MXN', 'SGD', 'HKD', 'CNH', 'CNY', 'RUB',
  'ILS', 'THB', 'INR', 'BRL', 'KRW', 'RON', 'AED', 'SAR',
]);

const MAJORS = new Set(['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD']);

const METAL_PREFIXES  = ['XAU', 'XAG', 'XPT', 'XPD', 'GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM', 'COPPER'];
const CRYPTO_PREFIXES = [
  'BTC', 'ETH', 'LTC', 'XRP', 'SOL', 'ADA', 'DOGE', 'BNB', 'DOT', 'BCH', 'XLM', 'LINK',
  'AVAX', 'MATIC', 'UNI', 'TRX', 'EOS', 'XMR', 'SHIB', 'ATOM',
];
const ENERGY_PREFIXES = ['WTI', 'BRENT', 'USOIL', 'UKOIL', 'XTI', 'XBR', 'NGAS', 'NATGAS', 'XNG', 'OIL', 'CRUDE'];
const INDEX_PREFIXES  = [
  'US30', 'US500', 'US100', 'US2000', 'NAS100', 'NAS', 'USTEC', 'SPX', 'SP500', 'DJ30', 'DJI', 'WS30',
  'GER40', 'GER30', 'DE40', 'DE30', 'DAX', 'UK100', 'FTSE', 'JP225', 'JPN225', 'NIKKEI', 'NI225',
  'HK50', 'HSI', 'AUS200', 'AU200', 'FRA40', 'FR40', 'CAC', 'EU50', 'EUSTX50', 'STOXX', 'ESP35', 'ES35',
  'IT40', 'CHINA50', 'CN50', 'CHINAH', 'VIX', 'SWI20', 'NETH25', 'USDX', 'DXY',
];

/** Leading alphanumeric run, upper-cased: "#EURUSD.m" → "EURUSD", "US500.cash" → "US500". */
export function symbolCore(symbol: string): string {
  const m = symbol.toUpperCase().replace(/^[^A-Z0-9]+/, '').match(/^[A-Z0-9]+/);
  return m ? m[0] : symbol.toUpperCase();
}

function startsWithAny(core: string, prefixes: string[]): boolean {
  return prefixes.some((p) => core.startsWith(p));
}

/** Six-letter FX pair behind a broker symbol, or null ("EURUSDm" → "EURUSD"). */
function fxPair(core: string): string | null {
  if (core.length < 6) return null;
  const base = core.slice(0, 3);
  const quote = core.slice(3, 6);
  return CURRENCIES.has(base) && CURRENCIES.has(quote) && base !== quote ? base + quote : null;
}

export function familyOf(symbol: string): FamilyId {
  const core = symbolCore(symbol);
  if (startsWithAny(core, METAL_PREFIXES)) return 'metals';
  if (startsWithAny(core, CRYPTO_PREFIXES)) return 'crypto';
  if (startsWithAny(core, ENERGY_PREFIXES)) return 'energy';
  if (startsWithAny(core, INDEX_PREFIXES)) return 'indices';
  const pair = fxPair(core);
  if (pair) return MAJORS.has(pair) ? 'fx_majors' : 'fx_crosses';
  return 'other';
}

// ── Fixed positions ──────────────────────────────────────────
// Hand-placed anchors for the instruments every book carries, as (u, v)
// inside the family region. Everything else takes a deterministic slot.

const ANCHORS: Record<string, [number, number]> = {
  // FX majors
  EURUSD: [0.36, 0.46], GBPUSD: [0.66, 0.40], USDJPY: [0.20, 0.78], USDCHF: [0.50, 0.80],
  AUDUSD: [0.78, 0.74], USDCAD: [0.89, 0.42], NZDUSD: [0.11, 0.42],
  // FX crosses
  EURGBP: [0.30, 0.42], EURJPY: [0.62, 0.38], GBPJPY: [0.76, 0.72], EURCHF: [0.20, 0.76],
  AUDJPY: [0.48, 0.78], EURAUD: [0.87, 0.42],
  // Metals
  XAUUSD: [0.42, 0.50], XAGUSD: [0.78, 0.76], GOLD: [0.20, 0.78], SILVER: [0.84, 0.40],
  XPTUSD: [0.16, 0.38], XPDUSD: [0.50, 0.86],
  // Indices
  NAS100: [0.62, 0.44], US500: [0.28, 0.56], US30: [0.46, 0.80], GER40: [0.82, 0.72],
  UK100: [0.86, 0.38], JP225: [0.13, 0.34],
  // Energy
  BRENT: [0.40, 0.42], WTI: [0.64, 0.72], NGAS: [0.24, 0.78],
  // Crypto
  BTCUSD: [0.40, 0.46], ETHUSD: [0.70, 0.74], SOLUSD: [0.20, 0.78], XRPUSD: [0.80, 0.40],
};

/** Broker spellings of the same anchor. */
const ANCHOR_ALIASES: Record<string, string> = {
  USTEC: 'NAS100', US100: 'NAS100', NAS: 'NAS100',
  SPX500: 'US500', SP500: 'US500', SPX: 'US500',
  DJ30: 'US30', WS30: 'US30', DJI: 'US30',
  DE40: 'GER40', GER30: 'GER40', DE30: 'GER40', DAX: 'GER40',
  FTSE: 'UK100', JPN225: 'JP225', NIKKEI: 'JP225', NI225: 'JP225',
  UKOIL: 'BRENT', XBRUSD: 'BRENT', USOIL: 'WTI', XTIUSD: 'WTI', CRUDE: 'WTI',
  NATGAS: 'NGAS', XNGUSD: 'NGAS',
  BTC: 'BTCUSD', BTCUSDT: 'BTCUSD', ETH: 'ETHUSD', ETHUSDT: 'ETHUSD',
};

function anchorKey(symbol: string, family: FamilyId): string | null {
  const core = symbolCore(symbol);
  if (family === 'fx_majors' || family === 'fx_crosses') {
    const pair = fxPair(core);
    return pair && ANCHORS[pair] ? pair : null;
  }
  if (ANCHORS[core]) return core;
  const alias = ANCHOR_ALIASES[core];
  return alias && ANCHORS[alias] ? alias : null;
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

// Free slots for instruments without an anchor: a staggered grid inside the
// region, kept clear of the label strip at the top.
const SLOT_COLS = 5;
const SLOT_ROWS = 4;
const SLOTS: Array<[number, number]> = [];
for (let r = 0; r < SLOT_ROWS; r++) {
  for (let c = 0; c < SLOT_COLS; c++) {
    const u = 0.10 + (c + (r % 2 ? 0.5 : 0)) * (0.80 / SLOT_COLS);
    const v = 0.30 + r * (0.58 / (SLOT_ROWS - 1));
    SLOTS.push([Math.min(u, 0.92), v]);
  }
}

const MIN_GAP = 0.15; // region units; below this two markers sit on each other

// Assignments are remembered for the session so an instrument never moves
// once it has been seen, whatever joins or leaves the book afterwards.
const assigned = new Map<string, { family: FamilyId; u: number; v: number }>();

function taken(family: FamilyId, u: number, v: number): boolean {
  for (const a of assigned.values()) {
    if (a.family === family && Math.hypot(a.u - u, a.v - v) < MIN_GAP) return true;
  }
  return false;
}

function assign(symbol: string): { family: FamilyId; u: number; v: number } {
  const family = familyOf(symbol);

  const key = anchorKey(symbol, family);
  if (key) {
    const [u, v] = ANCHORS[key];
    if (!taken(family, u, v)) {
      const pos = { family, u, v };
      assigned.set(symbol, pos);
      return pos;
    }
  }

  const start = hashSymbol(symbol) % SLOTS.length;
  let pick = SLOTS[start];
  for (let i = 0; i < SLOTS.length; i++) {
    const [u, v] = SLOTS[(start + i) % SLOTS.length];
    if (!taken(family, u, v)) { pick = [u, v]; break; }
  }
  const pos = { family, u: pick[0], v: pick[1] };
  assigned.set(symbol, pos);
  return pos;
}

export interface MapPosition {
  family: FamilyId;
  /** Unit coordinates of the whole map. */
  x: number;
  y: number;
}

/**
 * Fixed place of each instrument. New symbols are placed in name order so the
 * same book always produces the same map.
 */
export function layoutSymbols(symbols: string[]): Map<string, MapPosition> {
  const fresh = symbols.filter((s) => !assigned.has(s)).sort();
  for (const s of fresh) assign(s);

  const out = new Map<string, MapPosition>();
  for (const s of symbols) {
    const a = assigned.get(s);
    if (!a) continue;
    const rect = FAMILY_BY_ID.get(a.family)!.rect;
    out.set(s, { family: a.family, x: rect.x + a.u * rect.w, y: rect.y + a.v * rect.h });
  }
  return out;
}
