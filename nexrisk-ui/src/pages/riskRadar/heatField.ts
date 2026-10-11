// ============================================
// Risk Radar — heat field renderer
//
// Paints the weather-radar picture: one patch per instrument, hottest at the
// instrument and stepping down through the colour bands outwards.
//
// What the picture means:
//   • a patch peaks at its instrument's measured level (`heat`, 0..1);
//   • the rings around it are the same scale fading out — decoration;
//   • patch outline and area carry no measurement.
// The exact reading is the band-coloured dot the page draws on each
// instrument; a hotter neighbour's rings can pass under a cooler instrument.
// Patches are combined with a (smooth) maximum, never added, so two moderate
// neighbours cannot paint a "high" zone between them.
// ============================================

export interface HeatBlob {
  /** Centre, CSS pixels. */
  x: number;
  y: number;
  /** Reach of the patch, CSS pixels. */
  r: number;
  /** Level at the centre, 0..1. */
  heat: number;
  /** Stable per-instrument seed for the patch outline. */
  seed: number;
}

// ── Colour ramp ──────────────────────────────────────────────
// Stops sit on the band boundaries: 0.25 Low→Moderate, 0.50 Moderate→High,
// 0.75 High→Critical.
const RAMP: Array<[number, [number, number, number]]> = [
  [0.00, [4, 34, 30]],
  [0.07, [8, 70, 48]],
  [0.15, [22, 150, 62]],
  [0.24, [70, 222, 60]],
  [0.30, [168, 232, 44]],
  [0.40, [255, 232, 28]],
  [0.49, [255, 196, 0]],
  [0.56, [255, 150, 0]],
  [0.66, [255, 104, 0]],
  [0.74, [255, 62, 24]],
  [0.84, [236, 22, 36]],
  [0.93, [186, 6, 34]],
  [1.00, [128, 0, 28]],
];

export function rampColor(v: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, v));
  for (let i = 1; i < RAMP.length; i++) {
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1];
      const [t1, c1] = RAMP[i];
      const k = (t - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function rampCss(v: number): string {
  const [r, g, b] = rampColor(v);
  return `rgb(${r}, ${g}, ${b})`;
}

/** CSS gradient of the ramp, for the legend bar. */
export function rampGradientCss(): string {
  // Linear in ramp position, so the band boundaries fall on the quarter marks.
  const stops = RAMP.filter(([t]) => t >= 0.07).map(
    ([t, c]) => `rgb(${c[0]}, ${c[1]}, ${c[2]}) ${(t * 100).toFixed(0)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// Lookup table with the stepped, contour-line look of a radar plot.
const LUT_SIZE = 1024;
const STEPS = 20;
const LUT = new Uint8ClampedArray(LUT_SIZE * 4);
(function buildLut() {
  for (let i = 0; i < LUT_SIZE; i++) {
    const v = i / (LUT_SIZE - 1);
    const stepped = (Math.floor(v * STEPS) + 0.5) / STEPS;
    const mixed = v * 0.2 + stepped * 0.8;
    let [r, g, b] = rampColor(mixed);
    const frac = v * STEPS - Math.floor(v * STEPS);
    if (frac < 0.085 && v > 0.06) { r *= 0.78; g *= 0.78; b *= 0.78; }   // contour line
    // Fade in from nothing: a faint halo first, then solid colour.
    const a = v < 0.02 ? 0 : v < 0.12 ? ((v - 0.02) / 0.10) * 0.82 : 0.82 + Math.min(1, (v - 0.12) / 0.3) * 0.16;
    LUT[i * 4] = r;
    LUT[i * 4 + 1] = g;
    LUT[i * 4 + 2] = b;
    LUT[i * 4 + 3] = Math.round(a * 255);
  }
})();

// ── Value noise (for organic outlines) ───────────────────────
function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, seed: number): number {
  return (
    valueNoise(x, y, seed) * 0.55 +
    valueNoise(x * 2.1, y * 2.1, seed + 17) * 0.30 +
    valueNoise(x * 4.3, y * 4.3, seed + 31) * 0.15
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Renderer ─────────────────────────────────────────────────
const CELL = 3;          // coarse grid pitch, CSS px
const WARP_PX = 30;      // how far the outline wanders
const WARP_SCALE = 1 / 120;
const GRAIN_SCALE = 1 / 17;   // fine texture that frays the contour bands
const P = 8;             // smooth-max exponent

export class HeatRenderer {
  private w = 0;
  private h = 0;
  private gw = 0;
  private gh = 0;
  private warpX = new Float32Array(0);
  private warpY = new Float32Array(0);
  private grain = new Float32Array(0);
  private acc = new Float32Array(0);
  private image: ImageData | null = null;
  private buffer: HTMLCanvasElement = document.createElement('canvas');

  private resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.gw = Math.ceil(w / CELL) + 2;
    this.gh = Math.ceil(h / CELL) + 2;
    const n = this.gw * this.gh;
    this.warpX = new Float32Array(n);
    this.warpY = new Float32Array(n);
    this.grain = new Float32Array(n);
    this.acc = new Float32Array(n);
    for (let gy = 0; gy < this.gh; gy++) {
      for (let gx = 0; gx < this.gw; gx++) {
        const px = gx * CELL * WARP_SCALE, py = gy * CELL * WARP_SCALE;
        const i = gy * this.gw + gx;
        this.warpX[i] = (fbm(px, py, 11) - 0.5) * 2 * WARP_PX;
        this.warpY[i] = (fbm(px + 40.7, py + 13.3, 53) - 0.5) * 2 * WARP_PX;
        // 0.72 .. 1.28 — applied before the cap, so a patch still peaks at its level.
        this.grain[i] = 0.72 + 0.56 * fbm(gx * CELL * GRAIN_SCALE, gy * CELL * GRAIN_SCALE, 97);
      }
    }
    this.buffer.width = w;
    this.buffer.height = h;
    this.image = new ImageData(w, h);
  }

  /**
   * Draw the field for `blobs` onto `ctx` (already scaled so that one unit is
   * one CSS pixel), covering w × h CSS pixels.
   */
  render(ctx: CanvasRenderingContext2D, w: number, h: number, blobs: HeatBlob[]) {
    if (w < 8 || h < 8) return;
    this.resize(w, h);
    const { gw, gh, acc, warpX, warpY, grain } = this;
    acc.fill(0);

    let top = 0;
    for (const blob of blobs) {
      if (blob.heat <= 0.005 || blob.r <= 1) continue;
      top = Math.max(top, blob.heat);

      // A core plus a few satellite lobes, so no patch is a plain disc.
      const rnd = mulberry32(blob.seed);
      const lobes: Array<[number, number, number, number]> = [[blob.x, blob.y, blob.r, 1]];
      const count = 5 + Math.floor(rnd() * 3);
      for (let k = 0; k < count; k++) {
        const ang = rnd() * Math.PI * 2;
        const dist = blob.r * (0.32 + rnd() * 0.46);
        lobes.push([
          blob.x + Math.cos(ang) * dist,
          blob.y + Math.sin(ang) * dist * 0.8,
          blob.r * (0.40 + rnd() * 0.34),
          0.45 + rnd() * 0.4,
        ]);
      }

      const reach = blob.r * 1.75 + WARP_PX;
      const gx0 = Math.max(0, Math.floor((blob.x - reach) / CELL));
      const gx1 = Math.min(gw - 1, Math.ceil((blob.x + reach) / CELL));
      const gy0 = Math.max(0, Math.floor((blob.y - reach) / CELL));
      const gy1 = Math.min(gh - 1, Math.ceil((blob.y + reach) / CELL));

      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          const i = gy * gw + gx;
          // The outline wanders, the peak does not: no warp at the instrument,
          // full warp from 60 % of the reach outwards.
          const ox = gx * CELL - blob.x, oy = gy * CELL - blob.y;
          const near = (ox * ox + oy * oy) / (blob.r * blob.r * 0.36);
          const wk = near >= 1 ? 1 : near;
          const px = gx * CELL + warpX[i] * wk;
          const py = gy * CELL + warpY[i] * wk;
          // Lobes join by a smooth maximum: the level falls away steadily from
          // the instrument, which is what draws the nested bands.
          let sum = 0;
          let core = 0;
          for (let k = 0; k < lobes.length; k++) {
            const L = lobes[k];
            const dx = px - L[0], dy = py - L[1];
            const u2 = (dx * dx + dy * dy) / (L[2] * L[2]);
            if (u2 < 1) {
              const f = 1 - u2;
              if (k === 0) core = f;
              const val = L[3] * f * Math.sqrt(f);
              const val2 = val * val;
              sum += val2 * val2;
            }
          }
          if (sum <= 0) continue;
          let s = Math.sqrt(Math.sqrt(sum));
          // Grain frays the bands but fades out towards the instrument, so the
          // patch still reaches exactly its level there.
          s *= 1 + (grain[i] - 1) * (1 - core * core);
          const v = blob.heat * (s > 1 ? 1 : s);
          acc[i] += Math.pow(v, P);
        }
      }
    }

    // Coarse field → full-resolution colour, bilinear.
    const data = this.image!.data;
    const inv = 1 / P;
    for (let i = 0; i < acc.length; i++) {
      const v = acc[i] > 0 ? Math.pow(acc[i], inv) : 0;
      acc[i] = v > top ? top : v;
    }
    let o = 0;
    for (let y = 0; y < h; y++) {
      const fy = y / CELL;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const row0 = y0 * gw, row1 = (y0 + 1) * gw;
      for (let x = 0; x < w; x++) {
        const fx = x / CELL;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const a = acc[row0 + x0], b = acc[row0 + x0 + 1];
        const c = acc[row1 + x0], d = acc[row1 + x0 + 1];
        const v = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
        const li = (v >= 1 ? LUT_SIZE - 1 : v <= 0 ? 0 : (v * (LUT_SIZE - 1)) | 0) * 4;
        data[o++] = LUT[li];
        data[o++] = LUT[li + 1];
        data[o++] = LUT[li + 2];
        data[o++] = LUT[li + 3];
      }
    }
    this.buffer.getContext('2d')!.putImageData(this.image!, 0, 0);

    // A soft bloom under the crisp field gives the patches their glow.
    if ('filter' in ctx) {
      ctx.save();
      ctx.filter = 'blur(18px)';
      ctx.globalAlpha = 0.55;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(this.buffer, 0, 0, w, h);
      ctx.restore();
    }
    ctx.drawImage(this.buffer, 0, 0, w, h);
  }
}
