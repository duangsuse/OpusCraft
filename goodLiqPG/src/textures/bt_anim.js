// Animated textures: water (still/flow), lava (still/flow), nether portal, fire. All loop & tile seamlessly.
import { N, NN, rng, rgb, gray, newImg, setI, lattice, sampleLattice, rankQuant, clamp01, mixc } from './bt_core.js';

const TAU = Math.PI * 2;
function field(L, x, y, ox = 0, oy = 0) { return sampleLattice(L.g, L.px, L.py, (x + ox) * L.px / N, (y + oy) * L.py / N); }

// periodic-in-time noise: rotate between two independent fields
function loopNoise(seed, specs, frames, fn) {
  const R = rng(seed);
  const L = specs.map(([px, py]) => [lattice(R, px, py), lattice(R, px, py)]);
  const out = [];
  for (let f = 0; f < frames; f++) {
    const v = new Float32Array(NN);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      specs.forEach(([, , w, speed], k) => {
        const th = TAU * f * (speed || 1) / frames;
        s += w * ((field(L[k][0], x, y) - 0.5) * Math.cos(th) + (field(L[k][1], x, y) - 0.5) * Math.sin(th));
      });
      v[y * N + x] = s + (fn ? fn(x, y, f) : 0);
    }
    out.push(v);
  }
  return out;
}
function quantFrames(fields, pal, weights, alpha, extra) {
  const cols = pal.map(rgb);
  return fields.map((f) => {
    const q = rankQuant(f, weights); const img = newImg();
    for (let i = 0; i < NN; i++) { setI(img, i, cols[q[i]], typeof alpha === 'function' ? alpha(q[i]) : alpha); img.h[i] = (q[i] + 0.5) / pal.length; if (extra) extra(img, i, q[i]); }
    return img;
  });
}

// domain-warped crest waves; waves: [kx, ky, speed, weight, sharpness]; scroll: px of downward scroll per loop
function warpWaves(seed, F, waves, amp, noiseW = 0.25, scroll = 0) {
  const R = rng(seed);
  const WX = [lattice(R, 4, 4), lattice(R, 4, 4)], WY = [lattice(R, 4, 4), lattice(R, 4, 4)], NZ = [lattice(R, 8, 8), lattice(R, 8, 8)];
  const out = [];
  for (let f = 0; f < F; f++) {
    const th = TAU * f / F, c = Math.cos(th), s = Math.sin(th); const sh = scroll * f / F;
    const v = new Float32Array(NN);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const yy = y - sh;
      const wx = scroll ? field(WX[0], x, yy) - 0.5 : (field(WX[0], x, y) - 0.5) * c + (field(WX[1], x, y) - 0.5) * s;
      const wy = scroll ? field(WY[0], x, yy) - 0.5 : (field(WY[0], x, y) - 0.5) * c + (field(WY[1], x, y) - 0.5) * s;
      let acc = scroll ? noiseW * field(NZ[0], x, yy) : noiseW * ((field(NZ[0], x, y) - 0.5) * c + (field(NZ[1], x, y) - 0.5) * s);
      for (const [kx, ky, sp, w, sharp] of waves) {
        const ph = TAU * (kx * (x + wx * amp) + ky * (yy + wy * amp)) / N + sp * th;
        acc += w * Math.pow(0.5 + 0.5 * Math.sin(ph), sharp);
      }
      v[y * N + x] = acc;
    }
    out.push(v);
  }
  return out;
}
const WATER_G = [gray(0x9c), gray(0xa8), gray(0xb2), gray(0xbc), gray(0xc8), gray(0xd8)];
const WATER_W = [0.08, 0.2, 0.3, 0.22, 0.13, 0.07];
export function waterStill() {
  const fields = warpWaves('water', 32, [[1, 2, 1, 0.6, 3], [2, -1, 2, 0.5, 3], [3, 1, -1, 0.25, 2]], 2.2, 0.35);
  return quantFrames(fields, WATER_G, WATER_W, (k) => 172 + k * 4);
}
export function waterFlow() {
  const fields = warpWaves('waterflow', 32, [[1, 1, 0, 0.6, 3], [2, 1, 0, 0.5, 3], [0, 2, 0, 0.3, 2]], 2.5, 0.4, 16);
  return quantFrames(fields, WATER_G, WATER_W, (k) => 176 + k * 4);
}

// ---------------- lava ----------------
const LAVA = [0x9a2504, 0xbb340a, 0xd04a0d, 0xe2620f, 0xee8019, 0xf8a62e, 0xffcf5c, 0xffe89a];
const LAVA_W = [0.05, 0.12, 0.2, 0.22, 0.18, 0.12, 0.08, 0.03];
const lavaE = (img, i, k) => { img.e[i] = 0.75 + k * 0.035; };
export function lavaStill() {
  const F = 32;
  const fields = loopNoise('lava', [[2, 2, 0.6, 1], [4, 4, 1, 1], [8, 8, 0.35, 2]], F);
  return quantFrames(fields, LAVA, LAVA_W, 255, lavaE);
}
export function lavaFlow() {
  const F = 32; const R = rng('lavaflow');
  const A = lattice(R, 4, 4), B = lattice(R, 8, 8), C = lattice(R, 16, 16);
  const fields = [];
  for (let f = 0; f < F; f++) {
    const v = new Float32Array(NN); const sh = 16 * f / F;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) v[y * N + x] = field(A, x, y, 0, -sh) + 0.4 * field(B, x, y, 0, -sh) + 0.08 * field(C, x, y, 0, -2 * sh);
    fields.push(v);
  }
  return quantFrames(fields, LAVA, LAVA_W, 255, lavaE);
}

// ---------------- nether portal ----------------
const PORTAL = [0x2a0560, 0x3f0a88, 0x5512ac, 0x6c1ecb, 0x8a36e0, 0xac5cf0, 0xd29cfb];
const PORTAL_W = [0.1, 0.18, 0.22, 0.2, 0.15, 0.1, 0.05];
export function netherPortal() {
  const fields = warpWaves('portal', 32, [[2, 0, 1, 0.6, 2], [1, 1, -2, 0.45, 2], [3, -1, 1, 0.3, 3], [0, 1, 2, 0.2, 2]], 4.5, 0.5);
  return quantFrames(fields, PORTAL, PORTAL_W, (k) => 175 + k * 10, (img, i, k) => { img.e[i] = 0.55 + k * 0.07; });
}

// ---------------- fire ----------------
const FIRE = [0xa8300c, 0xcf4a10, 0xe86a16, 0xf38f22, 0xfbb534, 0xfdd55a, 0xfff0a8];
export function fire() {
  const F = 32; const R = rng('fire');
  const A = lattice(R, 4, 2), B = lattice(R, 8, 4), C = lattice(R, 16, 8);
  const colBias = new Float32Array(16); for (let x = 0; x < 16; x++) colBias[x] = 0.12 * Math.sin(TAU * (x * 3) / 16 + 1.3) + (R() - 0.5) * 0.1;
  const cols = FIRE.map(rgb);
  const frames = [];
  for (let f = 0; f < F; f++) {
    const img = newImg(); const sh = 16 * f / F;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x; const base = y / 15;
      const n = field(A, x, y, 0, sh) * 0.6 + field(B, x, y, 0, 2 * sh) * 0.3 + field(C, x, y, 0, 2 * sh) * 0.15;
      const v = base * 1.05 + (n - 0.5) * 1.5 + colBias[x];
      if (v < 0.18) { setI(img, i, [0, 0, 0], 0); img.h[i] = 0; continue; }
      const k = Math.max(0, Math.min(6, Math.floor((v - 0.18) / 0.13)));
      setI(img, i, cols[k]); img.e[i] = 1; img.h[i] = 0.5;
    }
    frames.push(img);
  }
  return frames;
}
