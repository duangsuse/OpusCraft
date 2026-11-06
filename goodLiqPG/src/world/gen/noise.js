// Gradient noise modelled on Minecraft's ImprovedNoise / PerlinNoise / NormalNoise / BlendedNoise.
// All octaves of a noise are flattened into typed arrays so sampling is a tight loop.
import { Rand, mix, hashString } from './rng.js';

// Vanilla's 16 gradient vectors (12 cube edges + 4 repeats)
const GX = new Float64Array([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = new Float64Array([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = new Float64Array([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

function makePerm(rng, out, base) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 0; i < 256; i++) {
    const j = rng.nextInt(256 - i);
    const t = p[i]; p[i] = p[i + j]; p[i + j] = t;
  }
  for (let i = 0; i < 512; i++) out[base + i] = p[i & 255];
}

// Single-octave improved Perlin noise; P = doubled permutation table, b = base offset in P.
// x, y, z already include the octave's random offsets.
export function improved(P, b, x, y, z) {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const dx = x - fx, dy = y - fy, dz = z - fz;
  const X = fx & 255, Y = fy & 255, Z = fz & 255;
  const i = P[b + X], j = P[b + X + 1];
  const k = P[b + i + Y], l = P[b + i + Y + 1];
  const m = P[b + j + Y], n = P[b + j + Y + 1];
  let h;
  h = P[b + k + Z] & 15; const g000 = GX[h] * dx + GY[h] * dy + GZ[h] * dz;
  h = P[b + m + Z] & 15; const g100 = GX[h] * (dx - 1) + GY[h] * dy + GZ[h] * dz;
  h = P[b + l + Z] & 15; const g010 = GX[h] * dx + GY[h] * (dy - 1) + GZ[h] * dz;
  h = P[b + n + Z] & 15; const g110 = GX[h] * (dx - 1) + GY[h] * (dy - 1) + GZ[h] * dz;
  h = P[b + k + Z + 1] & 15; const g001 = GX[h] * dx + GY[h] * dy + GZ[h] * (dz - 1);
  h = P[b + m + Z + 1] & 15; const g101 = GX[h] * (dx - 1) + GY[h] * dy + GZ[h] * (dz - 1);
  h = P[b + l + Z + 1] & 15; const g011 = GX[h] * dx + GY[h] * (dy - 1) + GZ[h] * (dz - 1);
  h = P[b + n + Z + 1] & 15; const g111 = GX[h] * (dx - 1) + GY[h] * (dy - 1) + GZ[h] * (dz - 1);
  const u = dx * dx * dx * (dx * (dx * 6 - 15) + 10);
  const v = dy * dy * dy * (dy * (dy * 6 - 15) + 10);
  const w = dz * dz * dz * (dz * (dz * 6 - 15) + 10);
  const x00 = g000 + u * (g100 - g000), x10 = g010 + u * (g110 - g010);
  const x01 = g001 + u * (g101 - g001), x11 = g011 + u * (g111 - g011);
  const y0 = x00 + v * (x10 - x00), y1 = x01 + v * (x11 - x01);
  return y0 + w * (y1 - y0);
}

// A set of octaves: value = sum amp[i] * improved(freq[i] * p + offset[i])
class OctaveSet {
  constructor(count) {
    this.n = count;
    this.P = new Uint8Array(512 * Math.max(1, count));
    this.ox = new Float64Array(count); this.oy = new Float64Array(count); this.oz = new Float64Array(count);
    this.freq = new Float64Array(count); this.amp = new Float64Array(count);
  }
  setOctave(i, rng, freq, amp) {
    this.ox[i] = rng.nextDouble() * 256; this.oy[i] = rng.nextDouble() * 256; this.oz[i] = rng.nextDouble() * 256;
    makePerm(rng, this.P, i * 512);
    this.freq[i] = freq; this.amp[i] = amp;
  }
  sample(x, y, z) {
    const P = this.P, ox = this.ox, oy = this.oy, oz = this.oz, fr = this.freq, am = this.amp;
    let v = 0;
    for (let i = 0, n = this.n; i < n; i++) {
      const f = fr[i];
      v += am[i] * improved(P, i << 9, x * f + ox[i], y * f + oy[i], z * f + oz[i]);
    }
    return v;
  }
}

// Vanilla "NormalNoise": two PerlinNoise sums, second one sampled at a slightly different scale.
export class NormalNoise extends OctaveSet {
  constructor(seed, name, firstOctave, amplitudes) {
    let nz = 0, minI = -1, maxI = -1;
    amplitudes.forEach((a, i) => { if (a !== 0) { nz++; if (minI < 0) minI = i; maxI = i; } });
    super(nz * 2);
    const n = amplitudes.length;
    const valueFactor = (1 / 6) / (0.1 * (1 + 1 / (maxI - minI + 1)));
    const lowestValue = Math.pow(2, n - 1) / (Math.pow(2, n) - 1);
    const rng = new Rand(0);
    const base = mix(seed, hashString(name));
    let o = 0;
    for (let half = 0; half < 2; half++) {
      const scale = half === 0 ? 1 : 1.0181268882175227;
      for (let i = 0; i < n; i++) {
        if (amplitudes[i] === 0) continue;
        rng.setSeed(mix(mix(base, half * 7919 + 13), i + firstOctave * 31));
        const freq = Math.pow(2, firstOctave + i) * scale;
        const amp = amplitudes[i] * lowestValue / Math.pow(2, i) * valueFactor;
        this.setOctave(o++, rng, freq, amp);
      }
    }
    // rough bound of |value|
    let m = 0; for (let i = 0; i < this.n; i++) m += Math.abs(this.amp[i]);
    this.maxValue = m;
  }
}

// Legacy "BlendedNoise" (base_3d_noise) of 1.18+: min/max limit noises (16 octaves) blended by a main noise (8 octaves).
// Octaves whose weight is < ~0.5% of the total are skipped (visually irrelevant).
export class BlendedNoise {
  constructor(seed, xzScale = 0.25, yScale = 0.125, xzFactor = 80, yFactor = 160) {
    const rng = new Rand(0);
    const base = mix(seed, hashString('terrain_blended'));
    this.LIM_FROM = 7; this.MAIN_FROM = 2;
    const nl = 16 - this.LIM_FROM, nm = 8 - this.MAIN_FROM;
    this.minL = new OctaveSet(nl); this.maxL = new OctaveSet(nl); this.main = new OctaveSet(nm);
    this.xzMul = 684.412 * xzScale; this.yMul = 684.412 * yScale;
    this.xzFactor = xzFactor; this.yFactor = yFactor;
    for (let r = this.LIM_FROM; r < 16; r++) {
      const o = Math.pow(2, -r);
      rng.setSeed(mix(base, 100 + r)); this.minL.setOctave(r - this.LIM_FROM, rng, o, 1 / o);
      rng.setSeed(mix(base, 200 + r)); this.maxL.setOctave(r - this.LIM_FROM, rng, o, 1 / o);
    }
    for (let p = this.MAIN_FROM; p < 8; p++) {
      const o = Math.pow(2, -p);
      rng.setSeed(mix(base, 300 + p)); this.main.setOctave(p - this.MAIN_FROM, rng, o, 1 / o);
    }
  }
  sample(x, y, z) {
    const d = x * this.xzMul, e = y * this.yMul, f = z * this.xzMul;
    const n = this.main.sample(d / this.xzFactor, e / this.yFactor, f / this.xzFactor);
    const q = (n / 10 + 1) / 2;
    let l = 0, m = 0;
    if (q < 1) l = this.minL.sample(d, e, f);
    if (q > 0) m = this.maxL.sample(d, e, f);
    const t = q < 0 ? 0 : q > 1 ? 1 : q;
    return (l / 512 + t * (m / 512 - l / 512)) / 128;
  }
}

// Vanilla noise parameter table: name -> [firstOctave, amplitudes]
export const NOISES = {
  temperature: [-10, [1.5, 0, 1, 0, 0, 0]],
  vegetation: [-8, [1, 1, 0, 0, 0, 0]],
  continentalness: [-9, [1, 1, 2, 2, 2, 1, 1, 1, 1]],
  erosion: [-9, [1, 1, 0, 1, 1]],
  ridge: [-7, [1, 2, 1, 0, 0, 0]],
  offset: [-3, [1, 1, 1, 0]],
  jagged: [-16, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
  cave_layer: [-8, [1]],
  cave_cheese: [-8, [0.5, 1, 2, 1, 2, 1, 0, 2, 0]],
  cave_entrance: [-7, [0.4, 0.5, 1]],
  spaghetti_3d_1: [-7, [1]], spaghetti_3d_2: [-7, [1]], spaghetti_3d_rarity: [-11, [1]], spaghetti_3d_thickness: [-8, [1]],
  spaghetti_2d: [-7, [1]], spaghetti_2d_modulator: [-11, [1]], spaghetti_2d_elevation: [-8, [1]], spaghetti_2d_thickness: [-11, [1]],
  spaghetti_roughness: [-5, [1]], spaghetti_roughness_modulator: [-8, [1]],
  pillar: [-7, [1, 1]], pillar_rareness: [-8, [1]], pillar_thickness: [-8, [1]],
  noodle: [-8, [1]], noodle_thickness: [-8, [1]], noodle_ridge_a: [-7, [1]], noodle_ridge_b: [-7, [1]],
  ore_veininess: [-8, [1]], ore_vein_a: [-7, [1]], ore_vein_b: [-7, [1]], ore_gap: [-5, [1]],
  surface: [-6, [1, 1, 1]], surface_secondary: [-6, [1, 1, 0, 1]],
  clay_bands_offset: [-8, [1]],
  badlands_pillar: [-2, [1, 1, 1, 1]], badlands_pillar_roof: [-8, [1]], badlands_surface: [-6, [1, 1, 1]],
  iceberg_pillar: [-6, [1, 1, 1, 1]], iceberg_pillar_roof: [-3, [1]], iceberg_surface: [-6, [1, 1, 1]],
  swamp: [-2, [1]], calcite: [-9, [1, 1, 1, 1]], gravel: [-8, [1, 1, 1, 1]], powder_snow: [-6, [1, 1, 1, 1]],
  packed_ice: [-7, [1, 1, 1, 1]], ice: [-4, [1, 1, 1, 1]],
  // feature noises
  patch: [-4, [1, 1]], flower_type: [-6, [1]], kelp: [-5, [1, 1]],
  biome_info: [0, [1]], flower: [-7, [1, 1]], temperature_variation: [0, [1]], frozen_temperature: [-2, [1, 1, 1]],
};

export function makeNoise(seed, name) {
  const p = NOISES[name];
  return new NormalNoise(seed, name, p[0], p[1]);
}
