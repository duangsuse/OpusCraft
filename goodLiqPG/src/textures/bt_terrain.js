// Natural terrain textures: stone family, dirt family, sand, ores, deepslate, ice, nether...
import {
  N, NN, rng, irand, rgb, lum, mixc, scalec, gray, wrap, newImg, cloneImg, setI, setP, getP, shadeP, mapImg,
  fromMap, stamp, normPal, vnoise, white, combine, normalize, fbm, blur, rankQuant, paintField, voronoi, finish, clamp01,
} from './bt_core.js';

// ---------------- stone family ----------------
export function stoneImg(seed = 'stone') {
  const R = rng(seed);
  const f = combine([[vnoise(R, 4, 8), 0.5], [vnoise(R, 8, 16), 0.3], [white(R), 0.28]]);
  const img = paintField(f, [[0x666666, 0.07], [0x727272, 0.19], [0x7d7d7d, 0.36], [0x898989, 0.24], [0x979797, 0.14]], 0.5, 0.3);
  return img;
}
function speckled(seed, pal, wBig = 0.45, wFine = 0.55, sx = 1, sy = 1) {
  const R = rng(seed);
  const f = combine([[vnoise(R, Math.round(4 * sx), Math.round(4 * sy)), wBig * 0.6], [vnoise(R, 8, 8), wBig * 0.4], [white(R), wFine]]);
  return paintField(f, pal, 0.5, 0.3);
}
export const granite = () => speckled('granite', [[0x6c473a, 0.07], [0x7f5446, 0.15], [0x926252, 0.3], [0x9f6c5a, 0.25], [0xb07c69, 0.15], [0xc4958a, 0.08]], 0.35, 0.65);
export const diorite = () => {
  const R = rng('diorite');
  const f = combine([[vnoise(R, 8, 8), 0.45], [vnoise(R, 4, 4), 0.2], [white(R), 0.35]]);
  return paintField(f, [[0x737375, 0.05], [0x949495, 0.1], [0xb1b1b2, 0.2], [0xc0c0c0, 0.3], [0xd4d4d4, 0.23], [0xf2f2f2, 0.12]], 0.5, 0.3);
};
export const andesite = () => speckled('andesite', [[0x646465, 0.07], [0x767677, 0.18], [0x858586, 0.3], [0x909091, 0.23], [0x9e9e9f, 0.15], [0xb0b0b0, 0.07]], 0.6, 0.4);

// polished: one big tile with bevelled border (light top-left, dark bottom-right), interior subtle noise
function polished(seed, pal, edgeL, edgeD, corner) {
  const R = rng(seed);
  const f = combine([[vnoise(R, 4, 4), 0.5], [white(R), 0.5]]);
  const img = paintField(f, pal, 0.1, 0.65);
  for (let i = 0; i < N; i++) {
    setP(img, i, 0, edgeL, 255, 0.85); setP(img, 0, i, edgeL, 255, 0.85);
    setP(img, i, 15, edgeD, 255, 0.35); setP(img, 15, i, edgeD, 255, 0.35);
  }
  setP(img, 15, 0, corner, 255, 0.5); setP(img, 0, 15, corner, 255, 0.5);
  // inner shading line
  for (let i = 1; i < 15; i++) { shadeP(img, i, 14, 0.94, -0.05); shadeP(img, 14, i, 0.94, -0.05); shadeP(img, i, 1, 1.04, 0.05); shadeP(img, 1, i, 1.04, 0.05); }
  return img;
}
export const polished_granite = () => polished('pgranite', [[0x8b5e4e, 0.15], [0x9a6a59, 0.45], [0xa4725f, 0.3], [0xb07d6a, 0.1]], 0xb98a77, 0x6d4638, 0x8a5a49);
export const polished_diorite = () => polished('pdiorite', [[0xb4b4b6, 0.15], [0xc1c1c3, 0.45], [0xcbcbcc, 0.3], [0xd8d8d8, 0.1]], 0xe4e4e4, 0x8b8b8d, 0xb0b0b0);
export const polished_andesite = () => polished('pandesite', [[0x7c7e7e, 0.15], [0x858787, 0.45], [0x8e9090, 0.3], [0x989a9a, 0.1]], 0xa3a5a5, 0x5e6060, 0x7d7f7f);

export function smoothStone() {
  const R = rng('smoothstone');
  const f = combine([[vnoise(R, 4, 4), 0.4], [white(R), 0.6]]);
  const img = paintField(f, [[0x9a9a9a, 0.15], [0x9f9f9f, 0.5], [0xa6a6a6, 0.35]], 0.08, 0.66);
  for (let i = 0; i < N; i++) { setP(img, i, 0, 0xa8a8a8, 255, 0.7); setP(img, 0, i, 0xa8a8a8, 255, 0.7); setP(img, i, 15, 0x7c7c7c, 255, 0.35); setP(img, 15, i, 0x7c7c7c, 255, 0.35); }
  for (let i = 1; i < 15; i++) { setP(img, i, 0, 0x8f8f8f, 255, 0.45); setP(img, 0, i, 0x8f8f8f, 255, 0.45); }
  setP(img, 0, 0, 0x8f8f8f, 255, 0.45);
  for (let i = 0; i < 16; i++) { setP(img, i, 15, 0x7a7a7a, 255, 0.3); setP(img, 15, i, 0x7a7a7a, 255, 0.3); }
  return img;
}
export function smoothStoneSlabSide() {
  const R = rng('slabside');
  const f = combine([[vnoise(R, 4, 4), 0.4], [white(R), 0.6]]);
  const img = paintField(f, [[0x9a9a9a, 0.15], [0x9f9f9f, 0.5], [0xa6a6a6, 0.35]], 0.08, 0.66);
  for (const top of [0, 8]) {
    for (let x = 0; x < 16; x++) { setP(img, x, top, 0xb0b0b0, 255, 0.72); setP(img, x, top + 7, 0x777777, 255, 0.3); }
    for (let y = top; y < top + 8; y++) { setP(img, 0, y, 0x8f8f8f, 255, 0.45); setP(img, 15, y, 0x7a7a7a, 255, 0.3); }
  }
  return img;
}

// ---------------- deepslate / tuff ----------------
export function deepslateImg() {
  const R = rng('deepslate');
  const f = combine([[vnoise(R, 2, 8), 0.35], [vnoise(R, 4, 16), 0.35], [vnoise(R, 8, 16), 0.15], [white(R), 0.2]]);
  const img = paintField(f, [[0x2f2f34, 0.05], [0x3c3c41, 0.16], [0x48484d, 0.27], [0x535358, 0.27], [0x606064, 0.17], [0x6d6d71, 0.08]], 0.5, 0.25);
  // horizontal strata cracks
  const R2 = rng('deepslate-cr');
  for (let k = 0; k < 7; k++) {
    const y = irand(R2, 16), x0 = irand(R2, 16), len = 2 + irand(R2, 5);
    for (let i = 0; i < len; i++) { setP(img, x0 + i, y, 0x2a2a2f, 255, 0.05); if (R2() < 0.5) setP(img, x0 + i, y - 1, 0x666669, 255, 0.7); }
  }
  return img;
}
export function deepslateTop() {
  const R = rng('deepslatetop');
  const base = combine([[vnoise(R, 4, 4), 0.5], [vnoise(R, 8, 8), 0.3], [white(R), 0.2]]);
  const ridge = normalize(blur(blur(white(R))));
  const f = new Float32Array(NN);
  for (let i = 0; i < NN; i++) f[i] = base[i] - (Math.abs(ridge[i] - 0.5) < 0.05 ? 0.45 : 0);
  return paintField(f, [[0x2c2c31, 0.08], [0x3c3c41, 0.16], [0x48484d, 0.27], [0x545459, 0.27], [0x606064, 0.15], [0x6e6e72, 0.07]], 0.5, 0.25);
}
export function tuff() {
  const R = rng('tuff');
  const f = combine([[vnoise(R, 4, 4), 0.35], [vnoise(R, 8, 8), 0.25], [white(R), 0.4]]);
  const img = paintField(f, [[0x4c4d47, 0.05], [0x5a5b54, 0.15], [0x666760, 0.3], [0x6f706a, 0.27], [0x7c7d76, 0.15], [0x8f908a, 0.08]], 0.5, 0.25);
  // light pebbles
  const Rp = rng('tuff-p');
  for (let k = 0; k < 9; k++) {
    const x = irand(Rp, 16), y = irand(Rp, 16);
    setP(img, x, y, 0x9a9b94, 255, 0.8); if (Rp() < 0.6) setP(img, x + 1, y, 0x8a8b84, 255, 0.7); setP(img, x + 1, y + 1, 0x4e4f49, 255, 0.2);
  }
  return img;
}

// ---------------- dirt family ----------------
export function dirtImg(seed = 'dirt') {
  const R = rng(seed);
  const f = combine([[white(R), 0.62], [vnoise(R, 8, 8), 0.25], [vnoise(R, 4, 4), 0.13]]);
  const img = paintField(f, [[0x593d29, 0.06], [0x6c4b33, 0.12], [0x79553a, 0.22], [0x866043, 0.29], [0x966c4a, 0.21], [0xb9855c, 0.1]], 0.6, 0.2);
  // grey pebbles
  const Rp = rng(seed + '-p');
  for (let k = 0; k < 5; k++) {
    const x = irand(Rp, 16), y = irand(Rp, 16);
    setP(img, x, y, Rp() < 0.5 ? 0x8b8b8b : 0x777777, 255, 0.85);
    if (Rp() < 0.4) setP(img, x + 1, y, 0x6a6a6a, 255, 0.7);
  }
  return img;
}
export function coarseDirt() {
  const R = rng('coarse');
  const f = combine([[white(R), 0.5], [vnoise(R, 8, 8), 0.3], [vnoise(R, 4, 4), 0.2]]);
  const img = paintField(f, [[0x4a3222, 0.08], [0x5d4130, 0.15], [0x6f4d36, 0.24], [0x7e593f, 0.25], [0x8e6447, 0.18], [0xa5785a, 0.1]], 0.6, 0.15);
  const Rp = rng('coarse-p');
  for (let k = 0; k < 11; k++) {
    const x = irand(Rp, 16), y = irand(Rp, 16); const c = [0x8f8f8f, 0x7a7a7a, 0x6a6a6a][irand(Rp, 3)];
    setP(img, x, y, c, 255, 0.9);
    if (Rp() < 0.6) setP(img, x + 1, y, scalec(rgb(c), 0.85), 255, 0.8);
    if (Rp() < 0.4) setP(img, x, y + 1, scalec(rgb(c), 0.75), 255, 0.7);
  }
  return img;
}
// fringe lengths per column (rows covered from top)
const GRASS_FRINGE = [4, 5, 4, 3, 4, 6, 4, 3, 4, 5, 4, 3, 5, 7, 5, 4];
const SNOW_FRINGE = [3, 4, 5, 4, 3, 3, 4, 6, 5, 4, 3, 4, 3, 5, 4, 3];
const PODZOL_FRINGE = [3, 4, 3, 5, 4, 3, 3, 4, 5, 3, 4, 6, 4, 3, 3, 4];

const GRASS_GRAYS = [[0x727272, 0.06], [0x828282, 0.15], [0x8f8f8f, 0.27], [0x9b9b9b, 0.27], [0xa8a8a8, 0.17], [0xb7b7b7, 0.08]];
export function grassTop() {
  const R = rng('grasstop');
  const f = combine([[white(R), 0.7], [vnoise(R, 16, 8), 0.2], [vnoise(R, 4, 4), 0.1]]);
  return paintField(f, GRASS_GRAYS, 0.5, 0.3);
}
export function grassOverlay() {
  const R = rng('grassside');
  const f = combine([[white(R), 0.8], [vnoise(R, 16, 8), 0.2]]);
  const g = paintField(f, GRASS_GRAYS, 0.4, 0.45);
  const img = newImg();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const L = GRASS_FRINGE[x];
    if (y < L) {
      const o = i * 4; let s = 1; if (y === L - 1) s = 0.86; if (y === 0) s = 1.04;
      setI(img, i, [g.c[o] * s, g.c[o + 1] * s, g.c[o + 2] * s]); img.h[i] = 0.75 - (y === L - 1 ? 0.12 : 0);
    } else { setI(img, i, [0, 0, 0], 0); img.h[i] = 0.4; }
  }
  return img;
}
export function withFringe(base, fringeImg) {
  const img = cloneImg(base);
  for (let i = 0; i < NN; i++) { const o = i * 4; if (fringeImg.c[o + 3] > 0) { img.c.set(fringeImg.c.subarray(o, o + 4), o); img.h[i] = fringeImg.h[i]; } }
  // shadow line under fringe
  for (let x = 0; x < N; x++) {
    let L = 0; for (let y = 0; y < N; y++) if (fringeImg.c[(y * N + x) * 4 + 3] > 0) L = y + 1;
    if (L < N) shadeP(img, x, L, 0.85, -0.1);
  }
  return img;
}
function fringe(lengths, pal, seed) {
  const R = rng(seed); const g = paintField(white(R), pal, 0.4, 0.45); const img = newImg();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (y < lengths[x]) { const o = i * 4; const s = y === lengths[x] - 1 ? 0.9 : 1; setI(img, i, [g.c[o] * s, g.c[o + 1] * s, g.c[o + 2] * s]); img.h[i] = 0.75; }
    else setI(img, i, [0, 0, 0], 0);
  }
  return img;
}
export function grassSnow() {
  return withFringe(dirtImg(), fringe(SNOW_FRINGE, [[0xc9dcdc, 0.08], [0xdbeaea, 0.2], [0xebf5f5, 0.35], [0xf6fbfb, 0.25], [0xffffff, 0.12]], 'snowfringe'));
}
export function podzolTop() {
  const R = rng('podzol');
  const f = combine([[vnoise(R, 8, 8), 0.35], [vnoise(R, 4, 4), 0.25], [white(R), 0.4]]);
  return paintField(f, [[0x3d2711, 0.08], [0x4b3215, 0.17], [0x5a3d1a, 0.27], [0x6a4920, 0.25], [0x7b5527, 0.16], [0x916530, 0.07]], 0.6, 0.2);
}
export function podzolSide() {
  return withFringe(dirtImg(), fringe(PODZOL_FRINGE, [[0x4b3215, 0.15], [0x5a3d1a, 0.3], [0x6a4920, 0.3], [0x7b5527, 0.18], [0x916530, 0.07]], 'podzolfringe'));
}
export function farmland(moist) {
  const R = rng('farmland');
  const f = combine([[white(R), 0.6], [vnoise(R, 8, 8), 0.4]]);
  const pal = moist
    ? [[0x24170b, 0.08], [0x2f1e0f, 0.2], [0x3a2614, 0.32], [0x45301a, 0.27], [0x543c22, 0.13]]
    : [[0x5b3e27, 0.08], [0x6b4a2f, 0.2], [0x7b5637, 0.32], [0x8b6240, 0.27], [0x9d714c, 0.13]];
  const img = paintField(f, pal, 0.4, 0.4);
  const W = white(R);
  // broken furrows (dark) with lit ridge pixels above them
  for (let y = 2; y < N; y += 4) for (let x = 0; x < N; x++) {
    if (W[y * N + x] < 0.22) continue;
    shadeP(img, x, y, 0.7, -0.3);
    if (W[(y - 1) * N + x] > 0.4) shadeP(img, x, y - 1, 1.12, 0.15);
  }
  for (let i = 0; i < N; i++) { shadeP(img, i, 0, 1.12, 0.1); shadeP(img, 0, i, 1.12, 0.1); shadeP(img, i, 15, 0.82, -0.1); shadeP(img, 15, i, 0.82, -0.1); }
  return img;
}
const PATH_PAL = [[0x6f5833, 0.07], [0x80673b, 0.17], [0x8f7442, 0.3], [0x9a7f48, 0.26], [0xa88b52, 0.14], [0xb79a60, 0.06]];
export function pathTop() {
  const R = rng('path');
  const f = combine([[white(R), 0.5], [vnoise(R, 8, 8), 0.3], [vnoise(R, 4, 4), 0.2]]);
  return paintField(f, PATH_PAL, 0.4, 0.35);
}
export function pathSide() {
  const L = [2, 3, 2, 2, 3, 2, 2, 3, 3, 2, 2, 3, 2, 2, 3, 2];
  return withFringe(dirtImg(), fringe(L, PATH_PAL, 'pathfringe'));
}

export function bedrock() {
  const R = rng('bedrock');
  const f = combine([[vnoise(R, 4, 4), 0.45], [vnoise(R, 8, 8), 0.35], [white(R), 0.2]]);
  return paintField(f, [[0x141414, 0.06], [0x333333, 0.17], [0x4d4d4d, 0.27], [0x666666, 0.25], [0x828282, 0.17], [0xa3a3a3, 0.08]], 0.7, 0.15);
}

// ---------------- sand / gravel / clay ----------------
export function sandImg(pal, seed) {
  const R = rng(seed);
  const f = combine([[white(R), 0.7], [vnoise(R, 8, 8), 0.2], [vnoise(R, 4, 4), 0.1]]);
  return paintField(f, pal, 0.3, 0.35);
}
export const SAND_PAL = [[0xc2b083, 0.04], [0xcfbf91, 0.12], [0xd8ca9b, 0.3], [0xdfd3a7, 0.3], [0xe6dcb5, 0.17], [0xeee7c8, 0.07]];
export const RED_SAND_PAL = [[0x99501a, 0.04], [0xab5a1d, 0.13], [0xb96320, 0.3], [0xc26a23, 0.3], [0xcc742b, 0.16], [0xd98538, 0.07]];
export const sand = () => sandImg(SAND_PAL, 'sand');
export const redSand = () => sandImg(RED_SAND_PAL, 'redsand');

export function gravel() {
  const R = rng('gravel');
  const pts = [];
  // jittered grid of pebbles (tileable)
  for (let tries = 0; tries < 400 && pts.length < 26; tries++) {
    const x = R() * 16, y = R() * 16; const r = 0.8 + R() * 0.5;
    let ok = true; for (const p of pts) { let dx = Math.abs(p[0] - x), dy = Math.abs(p[1] - y); if (dx > 8) dx = 16 - dx; if (dy > 8) dy = 16 - dy; if (Math.hypot(dx, dy) < 2.7) { ok = false; break; } }
    if (ok) pts.push([x, y, r]);
  }
  const v = voronoi(pts);
  const tones = [0x8c8685, 0x9e9897, 0x7b7574, 0x6d6868, 0xaba5a3, 0x857f7c, 0x948b86, 0x777271];
  const ptone = pts.map(() => rgb(tones[irand(R, tones.length)]));
  const img = newImg(); const W = white(R);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const edge = v.d2[i] - v.d1[i]; const p = pts[v.id[i]];
    let c = ptone[v.id[i]];
    let dx = x + 0.5 - p[0], dy = y + 0.5 - p[1]; if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
    let s = 1 - 0.07 * (dx + dy) + (W[i] - 0.5) * 0.12;
    let h = 0.8 - 0.08 * Math.hypot(dx, dy);
    if (edge < 0.7) { c = rgb(0x5a5555); s = 0.92 + W[i] * 0.15; h = 0.1; }
    setI(img, i, scalec(c, s)); img.h[i] = h;
  }
  return img;
}
export function clay() {
  const R = rng('clay');
  const f = combine([[vnoise(R, 4, 4), 0.4], [vnoise(R, 8, 8), 0.2], [white(R), 0.4]]);
  return paintField(f, [[0x8e94a0, 0.07], [0x979dab, 0.2], [0x9fa5b3, 0.38], [0xa8aebb, 0.25], [0xb3b9c5, 0.1]], 0.3, 0.4);
}

// ---------------- sandstone ----------------
function sandstoneSide(P) {
  // P: [darkline, dark, mid, light, lighter]
  const R = rng('sandstone' + P[2]);
  const img = newImg(); const W = white(R); const n = vnoise(R, 4, 16);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; let c, h = 0.6;
    const w = W[i];
    if (y <= 2) { c = w < 0.25 ? P[2] : w < 0.85 ? P[3] : P[4]; h = 0.75; }
    else if (y === 3) { c = w < 0.6 ? P[0] : P[1]; h = 0.3; }
    else if (y >= 12) {
      c = y === 12 ? (w < 0.5 ? P[1] : P[2]) : (w < 0.3 ? P[1] : w < 0.85 ? P[2] : P[3]); h = 0.55;
      if (y === 15 && w < 0.5) c = P[1];
    } else {
      // layered middle: horizontal stripes
      const band = (y + (n[i] > 0.6 ? 1 : 0)) % 3;
      c = band === 0 ? (w < 0.5 ? P[1] : P[2]) : band === 1 ? (w < 0.3 ? P[2] : P[3]) : (w < 0.7 ? P[3] : P[4]);
      h = 0.45 + band * 0.1;
    }
    setI(img, i, rgb(c)); img.h[i] = h;
  }
  return img;
}
const SS = [0xa8955f, 0xc8b77f, 0xd6c896, 0xe0d4a8, 0xe9dfb7];
const RSS = [0x8a4214, 0xa0501a, 0xb45d21, 0xbe6a2b, 0xc87635];
export const sandstone = () => sandstoneSide(SS);
export const redSandstone = () => sandstoneSide(RSS);
function sandstoneTop(P, seed) {
  const R = rng(seed);
  const f = combine([[white(R), 0.6], [vnoise(R, 4, 4), 0.4]]);
  return paintField(f, [[P[1], 0.1], [P[2], 0.35], [P[3], 0.4], [P[4], 0.15]], 0.2, 0.55);
}
export const sandstoneTopImg = () => sandstoneTop(SS, 'sstop');
export const redSandstoneTopImg = () => sandstoneTop(RSS, 'rsstop');
function sandstoneBottom(P, seed) {
  const R = rng(seed);
  const f = combine([[white(R), 0.6], [vnoise(R, 8, 8), 0.4]]);
  const img = paintField(f, [[P[0], 0.06], [P[1], 0.24], [P[2], 0.35], [P[3], 0.25], [P[4], 0.1]], 0.5, 0.3);
  return img;
}
export const sandstoneBottomImg = () => sandstoneBottom(SS, 'ssbot');
export const redSandstoneBottomImg = () => sandstoneBottom(RSS, 'rssbot');

// ---------------- snow / ice / obsidian ----------------
export function snow() {
  const R = rng('snow');
  const f = combine([[white(R), 0.6], [vnoise(R, 4, 4), 0.4]]);
  return paintField(f, [[0xdbecec, 0.06], [0xe8f3f3, 0.2], [0xf2f9f9, 0.4], [0xf9fdfd, 0.24], [0xffffff, 0.1]], 0.25, 0.5);
}
function iceStreaks(img, R, col, alpha, count) {
  for (let k = 0; k < count; k++) {
    let x = irand(R, 16), y = irand(R, 16); const len = 3 + irand(R, 6);
    for (let i = 0; i < len; i++) { setP(img, x, y, col, alpha, 0.7); x++; if (R() < 0.6) y--; }
  }
}
export function ice() {
  const R = rng('ice');
  const f = combine([[vnoise(R, 4, 4), 0.6], [white(R), 0.4]]);
  const img = paintField(f, [[0x7ea8f2, 0.2], [0x88b1f8, 0.4], [0x93baff, 0.3], [0xa2c4ff, 0.1]], 0.1, 0.8);
  for (let i = 0; i < NN; i++) img.c[i * 4 + 3] = 150;
  iceStreaks(img, R, 0xc8dcff, 175, 5);
  return img;
}
export function packedIce() {
  const R = rng('packedice');
  const f = combine([[vnoise(R, 4, 4), 0.6], [white(R), 0.4]]);
  const img = paintField(f, [[0x7ea6ee, 0.15], [0x87aff6, 0.4], [0x8fb6fa, 0.3], [0x9bbefc, 0.15]], 0.1, 0.8);
  iceStreaks(img, R, 0xb7d0ff, 255, 7);
  return img;
}
export function obsidian() {
  const R = rng('obsidian');
  const f = combine([[vnoise(R, 8, 8), 0.4], [white(R), 0.6]]);
  const img = paintField(f, [[0x07060b, 0.2], [0x0f0c18, 0.45], [0x16111f, 0.25], [0x1d1729, 0.1]], 0.2, 0.4);
  // purple blobs (elongated, diagonal)
  const blobs = [[2, 2, 3], [9, 1, 2], [13, 5, 3], [5, 7, 2], [1, 11, 3], [10, 10, 3], [6, 13, 2], [14, 13, 2], [12, 0, 1], [4, 4, 1]];
  for (const [bx, by, sz] of blobs) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < sz + 1; dx++) {
      const x = bx + dx - dy, y = by + dy; const centre = dy === 0 && dx > 0 && dx < sz;
      setP(img, x, y, centre ? 0x4f3b74 : (dx === 0 || dx === sz) ? 0x2a1f40 : 0x3b2b58, 255, centre ? 0.85 : 0.7);
    }
  }
  return img;
}

// ---------------- terracotta ----------------
export function terracotta(hex, seed) {
  const R = rng(seed);
  const f = combine([[white(R), 0.6], [vnoise(R, 4, 4), 0.4]]);
  const base = rgb(hex);
  const img = newImg(); const q = rankQuant(f, [0.08, 0.25, 0.4, 0.2, 0.07]);
  const s = [0.9, 0.95, 1, 1.04, 1.08];
  for (let i = 0; i < NN; i++) { setI(img, i, scalec(base, s[q[i]])); img.h[i] = 0.4 + q[i] * 0.05; }
  return img;
}

// ---------------- nether ----------------
export function netherrack() {
  const R = rng('netherrack');
  const f = combine([[vnoise(R, 8, 4), 0.35], [vnoise(R, 4, 4), 0.2], [white(R), 0.45]]);
  return paintField(f, [[0x481313, 0.07], [0x581b1b, 0.17], [0x6a2525, 0.28], [0x7a3030, 0.25], [0x8d3d3d, 0.16], [0xa55252, 0.07]], 0.6, 0.2);
}
export function soulSand() {
  const R = rng('soulsand');
  const f = combine([[white(R), 0.6], [vnoise(R, 8, 8), 0.4]]);
  const img = paintField(f, [[0x3f3027, 0.08], [0x4b3a2f, 0.22], [0x564235, 0.35], [0x624c3d, 0.25], [0x725a48, 0.1]], 0.4, 0.4);
  const fp = { a: [0x21170f, 0.02], r: [0x7a6450, 0.75], d: [0x3a2b20, 0.15] };
  const face = ['rr.rr', 'ad.ad', 'r.r.r', '.aaa.', '.ddd.'];
  const face2 = ['r..r', 'a..a', '.rr.', '.aa.'];
  stamp(img, face.map((r) => r.replace(/\./g, ' ')), fp, 1, 1); stamp(img, face2.map((r) => r.replace(/\./g, ' ')), fp, 9, 7); stamp(img, face2.map((r) => r.replace(/\./g, ' ')), fp, 2, 11); stamp(img, ['a.a', '.d.'].map((r) => r.replace(/\./g, ' ')), fp, 12, 1);
  return img;
}

// ---------------- ores ----------------
// stamp shapes: 1 highlight, 2 main, 3 shade, 4 deep shade, 5 = shadow darkening of base
const ORE_SHAPES = {
  A: [' 12', '1223', '2334', ' 45'],
  B: ['12', '234', ' 45'],
  C: [' 112', '12223', '22334', ' 3345', '  55'],
  D: ['1', '23', ' 5'],
  E: ['122', '2334', '345'],
  G: [' 1 ', '123', ' 34', '  5'], // gem
  H: [' 12 ', '1223', '2234', ' 345', '  5 '],
};
const ORE_LAYOUTS = {
  coal: [['C', 1, 1], ['H', 10, 1], ['A', 6, 6], ['C', 0, 10], ['A', 11, 9], ['B', 7, 12], ['D', 14, 6]],
  iron: [['H', 1, 1], ['A', 10, 2], ['C', 6, 6], ['A', 1, 10], ['B', 12, 8], ['A', 9, 11], ['D', 14, 14]],
  copper: [['C', 2, 1], ['A', 11, 2], ['H', 6, 7], ['E', 1, 11], ['A', 11, 10], ['D', 6, 13], ['D', 14, 6]],
  gold: [['A', 1, 2], ['H', 10, 0], ['B', 6, 6], ['C', 10, 8], ['A', 2, 10], ['D', 8, 13], ['D', 14, 14]],
  redstone: [['H', 1, 1], ['A', 10, 2], ['D', 6, 5], ['C', 7, 8], ['A', 1, 10], ['B', 12, 12], ['D', 5, 14]],
  lapis: [['C', 1, 2], ['A', 10, 1], ['H', 7, 7], ['B', 2, 9], ['E', 11, 11], ['D', 4, 13], ['D', 14, 6]],
  diamond: [['H', 1, 1], ['G', 10, 1], ['H', 5, 6], ['G', 12, 8], ['G', 1, 11], ['H', 8, 11]],
  emerald: [['G', 3, 1], ['H', 9, 3], ['H', 2, 8], ['G', 12, 10], ['G', 7, 12]],
};
const ORE_PAL = {
  coal: [0x525252, 0x393939, 0x272727, 0x181818],
  iron: [0xecd0b7, 0xd8af93, 0xaf8e77, 0x89644f],
  copper: [0xf09e78, 0xd57a52, 0xa9583a, 0x7d8e64],
  gold: [0xfffbb0, 0xfce74c, 0xf0b52a, 0xb57a1b],
  redstone: [0xff7a7a, 0xf20000, 0xaa0000, 0x6e0000],
  lapis: [0x7fa3f5, 0x3c6ad8, 0x2047a8, 0x152f75],
  diamond: [0xd8fff9, 0x63f0e2, 0x29c7b8, 0x137f78],
  emerald: [0xc0ffd7, 0x41f384, 0x14c64f, 0x087a2e],
};
const ORE_F0 = { iron: 1, gold: 1, copper: 1 };
export function oreImg(kind, baseImg) {
  const img = cloneImg(baseImg);
  const P = ORE_PAL[kind];
  const metal = ORE_F0[kind];
  img.f0 = new Float32Array(NN).fill(-1); img.sm = new Float32Array(NN).fill(-1);
  for (const [sh, ox, oy] of ORE_LAYOUTS[kind]) {
    const rows = ORE_SHAPES[sh];
    for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]; if (ch === ' ') continue; const X = wrap(ox + x), Y = wrap(oy + y), i = Y * N + X;
      if (ch === '5') { const o = i * 4; if (img.h[i] < 0.9) { img.c[o] *= 0.8; img.c[o + 1] *= 0.8; img.c[o + 2] *= 0.8; img.h[i] = 0.2; } continue; }
      let c = rgb(P[+ch - 1]);
      if (kind === 'copper' && ch === '4' && ((X + Y) & 1)) c = rgb(0x5a9e78);
      setI(img, i, c); img.h[i] = 1.0 - (+ch - 1) * 0.08;
      img.sm[i] = kind === 'diamond' || kind === 'emerald' ? 0.85 : metal ? 0.6 : kind === 'lapis' || kind === 'redstone' ? 0.5 : 0.35;
      img.f0[i] = metal ? 1 : kind === 'diamond' || kind === 'emerald' ? 0.17 : 0.05;
      if (kind === 'redstone') img.e[i] = 0; // only lit when touched in vanilla
    }
  }
  return img;
}
export const ORE_KINDS = ['coal', 'iron', 'copper', 'gold', 'redstone', 'lapis', 'diamond', 'emerald'];
