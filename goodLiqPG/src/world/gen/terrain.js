// Noise router: climate sampling and the overworld 3D density function (1.18+ style: sloped cheese terrain,
// cheese / spaghetti / noodle caves, pillars, cave entrances), evaluated on a coarse 4x8x4 grid.
import { makeNoise, BlendedNoise } from './noise.js';
import { evalSpline, overworldOffset, overworldFactor, overworldJaggedness, peaksAndValleys } from './spline.js';
import { pickBiome } from './biomes.js';

export const CELL_W = 4, CELL_H = 8;
export const NY = 49;               // vertical corner count: y = -64 + 8k, k = 0..48
export const VEIN_K = 16;           // vein corners cover y = -64 .. 56
const BASE3D_BOUND = 1.1;

const OFFSET_SPLINE = overworldOffset();
const FACTOR_SPLINE = overworldFactor();
const JAGGED_SPLINE = overworldJaggedness();

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const clampedMap = (v, a0, a1, b0, b1) => { const t = (v - a0) / (a1 - a0); return t <= 0 ? b0 : t >= 1 ? b1 : b0 + t * (b1 - b0); };

// Climate output layout (per sample point): T, H, C, E, W, PV, offset, factor, jaggedness, biome
export const CL_T = 0, CL_H = 1, CL_C = 2, CL_E = 3, CL_W = 4, CL_PV = 5, CL_OFF = 6, CL_FAC = 7, CL_JAG = 8, CL_BIOME = 9, CL_N = 10;

export class TerrainNoise {
  constructor(seed) {
    const n = (name) => makeNoise(seed, name);
    this.temperature = n('temperature'); this.vegetation = n('vegetation');
    this.continentalness = n('continentalness'); this.erosion = n('erosion'); this.ridge = n('ridge');
    this.shift = n('offset'); this.jagged = n('jagged');
    this.base3d = new BlendedNoise(seed);
    this.caveLayer = n('cave_layer'); this.caveCheese = n('cave_cheese'); this.caveEntrance = n('cave_entrance');
    this.sp3d1 = n('spaghetti_3d_1'); this.sp3d2 = n('spaghetti_3d_2'); this.sp3dRarity = n('spaghetti_3d_rarity'); this.sp3dThick = n('spaghetti_3d_thickness');
    this.sp2d = n('spaghetti_2d'); this.sp2dMod = n('spaghetti_2d_modulator'); this.sp2dElev = n('spaghetti_2d_elevation'); this.sp2dThick = n('spaghetti_2d_thickness');
    this.spRough = n('spaghetti_roughness'); this.spRoughMod = n('spaghetti_roughness_modulator');
    this.pillar = n('pillar'); this.pillarRare = n('pillar_rareness'); this.pillarThick = n('pillar_thickness');
    this.noodle = n('noodle'); this.noodleThick = n('noodle_thickness'); this.noodleA = n('noodle_ridge_a'); this.noodleB = n('noodle_ridge_b');
    this.veinToggle = n('ore_veininess'); this.veinA = n('ore_vein_a'); this.veinB = n('ore_vein_b'); this.veinGap = n('ore_gap');
    this._inp = new Float64Array(4);
  }

  // Sample climate + terrain shaping parameters at block (x, z) (vanilla samples these at quart corners).
  climate(x, z, out, o, withShape = true) {
    const sx = this.shift.sample(x * 0.25, 0, z * 0.25) * 4;
    const sz = this.shift.sample(z * 0.25, x * 0.25, 0) * 4;
    const px = x * 0.25 + sx, pz = z * 0.25 + sz;
    const T = this.temperature.sample(px, 0, pz);
    const H = this.vegetation.sample(px, 0, pz);
    const Cc = this.continentalness.sample(px, 0, pz);
    const Ee = this.erosion.sample(px, 0, pz);
    const Ww = this.ridge.sample(px, 0, pz);
    const pv = peaksAndValleys(Ww);
    out[o + CL_T] = T; out[o + CL_H] = H; out[o + CL_C] = Cc; out[o + CL_E] = Ee; out[o + CL_W] = Ww; out[o + CL_PV] = pv;
    if (withShape) {
      const inp = this._inp; inp[0] = Cc; inp[1] = Ee; inp[2] = Ww; inp[3] = pv;
      out[o + CL_OFF] = -0.50375 + evalSpline(OFFSET_SPLINE, inp);
      out[o + CL_FAC] = evalSpline(FACTOR_SPLINE, inp);
      out[o + CL_JAG] = evalSpline(JAGGED_SPLINE, inp);
    }
    out[o + CL_BIOME] = pickBiome(T, H, Cc, Ee, Ww);
  }

  // Density for a corner column. outF = final density (with caves), outT = terrain-only (sloped cheese + slide).
  // Returns nothing; fills NY entries.
  jagTerm(x, z, jaggedness) {
    if (!(jaggedness > 0)) return 0;
    const jn = this.jagged.sample(x * 1500, 0, z * 1500);
    return jaggedness * (jn > 0 ? jn : jn * 0.5);
  }

  column(x, z, off, fac, jag, outF, outT, ob) {
    // 2D cave terms (cached per column)
    const elev = 8 * this.sp2dElev.sample(x, 0, z);
    for (let k = NY - 1; k >= 0; k--) {
      const y = -64 + k * CELL_H;
      const depth = 1.5 - 3 * (y + 64) / 384 + off;
      const t = (depth + jag) * fac;
      const sc0 = 4 * (t > 0 ? t : t * 0.25);
      let sc;
      if (sc0 < -BASE3D_BOUND) sc = sc0;
      else if (sc0 > 3.5) sc = sc0;
      else sc = sc0 + this.base3d.sample(x, y, z);
      // terrain-only
      const terr = slide(sc, y);
      outT[ob + k] = terr;
      if (sc <= 0) { outF[ob + k] = terr; continue; }
      let d;
      if (sc < 1.5625) d = Math.min(sc, 5 * this.entrances(x, y, z));
      else d = this.underground(x, y, z, sc, elev);
      d = slide(d, y);
      if (d > 0 && y >= -60) d = this.noodleMin(x, y, z, d);
      outF[ob + k] = d;
    }
  }

  // Ore vein fields at a corner column for k = 0..VEIN_K-1 (y = -64 .. 56): toggle and ridged
  veinColumn(x, z, outTog, outRid, ob) {
    for (let k = 0; k < VEIN_K; k++) {
      const y = -64 + k * CELL_H;
      outTog[ob + k] = this.veinToggle.sample(x * 1.5, y * 1.5, z * 1.5);
      outRid[ob + k] = -0.08 + Math.max(Math.abs(this.veinA.sample(x * 4, y * 4, z * 4)), Math.abs(this.veinB.sample(x * 4, y * 4, z * 4)));
    }
  }

  roughness(x, y, z) {
    const mod = -0.05 - 0.05 * this.spRoughMod.sample(x, y, z);
    return mod * (Math.abs(this.spRough.sample(x, y, z)) - 0.4);
  }

  entrances(x, y, z) {
    const ce = this.caveEntrance.sample(x * 0.75, y * 0.5, z * 0.75);
    const e = ce + 0.37 + clampedMap(y, -10, 30, 0.3, 0);
    const rar = this.sp3dRarity.sample(x * 2, y, z * 2);
    const r = rar < -0.5 ? 0.75 : rar < 0 ? 1 : rar < 0.5 ? 1.5 : 2;
    const ir = 1 / r;
    const s1 = r * Math.abs(this.sp3d1.sample(x * ir, y * ir, z * ir));
    const s2 = r * Math.abs(this.sp3d2.sample(x * ir, y * ir, z * ir));
    const th = -0.0765 - 0.0115 * this.sp3dThick.sample(x, y, z);
    const sp = clamp(Math.max(s1, s2) + th, -1, 1);
    if (e < sp - 0.06) return e; // roughness magnitude is <= ~0.06, can't go below e
    return Math.min(e, this.roughness(x, y, z) + sp);
  }

  spaghetti2d(x, y, z, elev) {
    const m = this.sp2dMod.sample(x * 2, y, z * 2);
    const r = m < -0.75 ? 0.5 : m < -0.5 ? 0.75 : m < 0.5 ? 1 : m < 0.75 ? 2 : 3;
    const ir = 1 / r;
    const s = r * Math.abs(this.sp2d.sample(x * ir, y * ir, z * ir));
    const thick = -0.95 - 0.35 * this.sp2dThick.sample(x * 2, y, z * 2);
    const e = Math.abs(elev + clampedMap(y, -64, 320, 8, -40));
    const f = (e + thick); const f3 = f * f * f;
    const g = s + 0.083 * thick;
    return clamp(Math.max(g, f3), -1, 1);
  }

  underground(x, y, z, sc, elev) {
    const cl = this.caveLayer.sample(x, y * 8, z);
    const layerized = 4 * cl * cl;
    const ch = this.caveCheese.sample(x, y * 0.6666666666666666, z);
    let caves = layerized + clamp(0.27 + ch, -1, 1) + clamp(1.5 - 0.64 * sc, 0, 0.5);
    const ent = this.entrances(x, y, z);
    if (ent < caves) caves = ent;
    const sp = this.spaghetti2d(x, y, z, elev);
    if (sp - 0.06 < caves) {
      const s2 = sp + this.roughness(x, y, z);
      if (s2 < caves) caves = s2;
    }
    if (caves < 0.03) {
      // pillars can only make it solid again
      const pl = this.pillar.sample(x * 25, y * 0.3, z * 25);
      const rare = -1 - this.pillarRare.sample(x, y, z);
      const th = 0.55 + 0.55 * this.pillarThick.sample(x, y, z);
      const p = (pl * 2 + rare) * th * th * th;
      if (p >= 0.03 && p > caves) caves = p;
    }
    return caves;
  }

  // min(d, noodle(x,y,z))
  noodleMin(x, y, z, d) {
    if (this.noodle.sample(x, y, z) < 0) return d;
    const th = -0.075 - 0.025 * this.noodleThick.sample(x, y, z);
    const s = 2.6666666666666665;
    const a = Math.abs(this.noodleA.sample(x * s, y * s, z * s));
    if (th + 1.5 * a >= d) return d;
    const b = Math.abs(this.noodleB.sample(x * s, y * s, z * s));
    const n = th + 1.5 * (a > b ? a : b);
    return n < d ? n : d;
  }
}

// Vanilla overworld slide: fade to air near the top (y 240..256) and to solid near the bottom (y -64..-40).
function slide(d, y) {
  const top = clampedMap(y, 240, 256, 1, 0);
  d = -0.078125 + top * (d + 0.078125);
  const bot = clampedMap(y, -64, -40, 0, 1);
  return 0.1171875 + bot * (d - 0.1171875);
}
