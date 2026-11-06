// Man-made / processed blocks: cobble, bricks, glass, wool, metal blocks, copper, furnace, TNT, lights, rails...
import {
  emboss, N, NN, rng, irand, rgb, lum, mixc, scalec, gray, wrap, newImg, cloneImg, setI, setP, getP, shadeP, mapImg,
  fromMap, stamp, normPal, vnoise, white, combine, normalize, blur, rankQuant, paintField, voronoi, clamp01, setSm, setF0,
} from './bt_core.js';

// ---------------- cobblestone ----------------
// hand placed stone centres (x, y, weight) for a vanilla-like layout of rounded stones (tileable)
const COBBLE_PTS = [[2.5, 2.2, 1], [8.5, 1.5, 0.95], [13.5, 3.5, 1], [5.2, 6.5, 0.9], [11, 7.8, 1.05], [1.5, 9.5, 1], [7, 11.5, 0.95], [13, 12.5, 1], [3.5, 14.2, 1.1], [10, 14.8, 1.1], [15.5, 8, 1.2]];
function cobbleBase(seed, pts, pal, gapC, gapD) {
  const R = rng(seed);
  const v = voronoi(pts);
  const W = white(R); const n = vnoise(R, 8, 8);
  const img = newImg(); const tone = pts.map(() => 0.92 + R() * 0.16);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const e = v.d2[i] - v.d1[i]; const p = pts[v.id[i]];
    let dx = x + 0.5 - p[0], dy = y + 0.5 - p[1]; if (dx > 8) dx -= 16; if (dx < -8) dx += 16; if (dy > 8) dy -= 16; if (dy < -8) dy += 16;
    if (e < 0.9) { setI(img, i, rgb(W[i] < 0.5 ? gapD : gapC)); img.h[i] = 0.05 + W[i] * 0.08; continue; }
    // shade: light top-left, dark bottom-right + noise
    let s = 0.55 - (dx + dy) * 0.07 + (n[i] - 0.5) * 0.4 + (W[i] - 0.5) * 0.35 + (tone[v.id[i]] - 1);
    if (e < 1.6) s -= 0.18; // rim of stone darker
    const k = Math.max(0, Math.min(pal.length - 1, Math.round(s * (pal.length - 1))));
    setI(img, i, rgb(pal[k])); img.h[i] = 0.45 + Math.min(e, 3.5) * 0.15;
  }
  return img;
}
export const cobblestone = () => cobbleBase('cobble', COBBLE_PTS, [0x5f5f5f, 0x6f6f6f, 0x7b7b7b, 0x888888, 0x979797, 0xa8a8a8], 0x515151, 0x3f3f3f);
const CDEEP_PTS = [[2, 2, 1], [7, 2.5, 1], [12.5, 2, 1], [4.5, 7, 1], [10, 6.5, 1], [14.5, 7.5, 1], [1.5, 11.5, 1], [7, 11, 1], [12, 12, 1], [4, 15.5, 1], [9.5, 15.5, 1], [15, 14.5, 1]];
export const cobbledDeepslate = () => cobbleBase('cdeep', CDEEP_PTS, [0x353539, 0x3e3e43, 0x47474c, 0x515156, 0x5c5c61, 0x67676b], 0x29292d, 0x1f1f23);

const MOSS = [0x3d5826, 0x4a6a2c, 0x577c33, 0x648e3b, 0x739e45];
function mossify(img, seed, amount) {
  const R = rng(seed); const f = combine([[vnoise(R, 4, 4), 0.6], [vnoise(R, 8, 8), 0.25], [white(R), 0.15]]);
  const W = white(R);
  for (let i = 0; i < NN; i++) {
    const low = img.h[i] < 0.3; // gaps get moss more easily
    if (f[i] + (low ? 0.15 : 0) > 1 - amount) {
      const k = Math.min(4, Math.max(0, Math.floor(W[i] * 3 + (f[i] - (1 - amount)) * 6)));
      setI(img, i, rgb(MOSS[k])); img.h[i] = Math.max(img.h[i], 0.45 + k * 0.05);
    }
  }
  return img;
}
export const mossyCobblestone = () => mossify(cobblestone(), 'mossycobble', 0.46);

// ---------------- stone bricks ----------------
const SB_PAL = [0x6a6a6a, 0x747474, 0x7b7b7b, 0x828282, 0x8a8a8a, 0x939393];
export function stoneBricks(seed = 'stonebricks') {
  const R = rng(seed); const W = white(R); const n = vnoise(R, 8, 4);
  const img = newImg();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const row = y < 8 ? 0 : 1; const ly = y % 8;
    const seamX = row === 0 ? 15 : 7; // vertical mortar column
    const lx = row === 0 ? x : (x + 8) % 16; // position within brick (0..15), brick spans 16 incl. mortar at 15
    const mortar = ly === 7 || x === seamX;
    if (mortar) { setI(img, i, rgb(W[i] < 0.5 ? 0x5a5a5a : 0x525252)); img.h[i] = 0.1; continue; }
    let s = 0.5 + (n[i] - 0.5) * 0.5 + (W[i] - 0.5) * 0.5;
    if (ly === 0 || lx === 0) s += 0.3; // bevel light
    if (ly === 6 || lx === 14) s -= 0.3; // bevel dark
    const k = Math.max(0, Math.min(5, Math.round(s * 5)));
    setI(img, i, rgb(SB_PAL[k])); img.h[i] = 0.75 + (ly === 0 || lx === 0 ? 0.08 : 0) - (ly === 6 || lx === 14 ? 0.12 : 0);
  }
  return img;
}
export const mossyStoneBricks = () => mossify(stoneBricks('mossysb'), 'mossysb2', 0.48);
export function crackedStoneBricks() {
  const img = stoneBricks('crackedsb');
  const cracks = [
    [[3, 0], [4, 1], [4, 2], [5, 3], [6, 4], [6, 5], [7, 6]],
    [[11, 1], [10, 2], [10, 3], [9, 4], [9, 5]],
    [[2, 9], [3, 10], [4, 11], [4, 12], [5, 13], [6, 14]],
    [[12, 8], [12, 9], [13, 10], [14, 11], [13, 12], [13, 13], [12, 14]],
    [[0, 3], [1, 3], [2, 4]],
  ];
  for (const c of cracks) for (const [x, y] of c) { setP(img, x, y, 0x3e3e3e, 255, 0.05); shadeP(img, x + 1, y, 1.12, 0.05); }
  return img;
}
export function chiseledStoneBricks() {
  const R = rng('chiseled'); const f = combine([[vnoise(R, 8, 8), 0.5], [white(R), 0.5]]);
  const img = paintField(f, [[0x7a7a7a, 0.2], [0x838383, 0.4], [0x8c8c8c, 0.3], [0x969696, 0.1]], 0, 0.5);
  const hf = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const e = Math.min(x, y, 15 - x, 15 - y); const d = Math.hypot(x - 7.5, y - 7.5);
    let h = 0.55;
    if (e === 0) h = 0.1; else if (e <= 2) h = 0.85; // raised frame
    else if (d > 3 && d < 4.9) h = 0.9; // ring
    else if (d <= 1.6) h = 0.75; // boss
    else h = 0.45;
    hf[i] = h;
  }
  emboss(img, hf, 0.45);
  for (let i = 0; i < NN; i++) if (hf[i] <= 0.1) { setI(img, i, rgb(i % 3 ? 0x555555 : 0x4d4d4d)); }
  return img;
}

// ---------------- bricks ----------------
export function bricks() {
  const R = rng('bricks'); const W = white(R);
  const img = newImg(); const brickTone = {};
  const BP = [0x7c3c2a, 0x8c4632, 0x97503b, 0xa35a43, 0xb0664e, 0xbd7560];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const course = y >> 2, ly = y & 3; const off = course & 1 ? 4 : 0; const bx = (x + off) % 16; const lx = bx % 8;
    if (ly === 3 || lx === 7) { const m = W[i]; setI(img, i, rgb(m < 0.3 ? 0x8d8580 : m < 0.8 ? 0x9e9792 : 0xaba59f)); img.h[i] = 0.15; continue; }
    const id = course * 2 + (bx >> 3); if (brickTone[id] == null) brickTone[id] = (R() - 0.5) * 0.35;
    let s = 0.5 + brickTone[id] + (W[i] - 0.5) * 0.55;
    if (ly === 0) s += 0.22; if (ly === 2) s -= 0.15; if (lx === 0) s += 0.1; if (lx === 6) s -= 0.1;
    const k = Math.max(0, Math.min(5, Math.round(s * 5)));
    setI(img, i, rgb(BP[k])); img.h[i] = 0.75 + (ly === 0 ? 0.08 : 0) - (ly === 2 ? 0.08 : 0);
  }
  return img;
}

// ---------------- glass ----------------
export function glass() {
  const img = newImg(); for (let i = 0; i < NN; i++) { setI(img, i, [255, 255, 255], 0); img.h[i] = 0.5; }
  const F = [0xdbf0f4, 0xc6e3e8, 0xaccfd6];
  for (let i = 0; i < N; i++) {
    setP(img, i, 0, F[i % 5 === 2 ? 1 : 0], 255, 0.9); setP(img, 0, i, F[i % 6 === 3 ? 1 : 0], 255, 0.9);
    setP(img, i, 15, F[i % 4 === 1 ? 2 : 1], 255, 0.8); setP(img, 15, i, F[i % 5 === 1 ? 2 : 1], 255, 0.8);
  }
  setP(img, 0, 0, 0xffffff, 255, 0.95);
  // highlight streaks (diagonal)
  const streak = [[2, 4], [3, 3], [4, 2], [2, 6], [3, 5], [5, 3], [6, 2], [11, 13], [12, 12], [13, 11], [10, 13]];
  for (const [x, y] of streak) setP(img, x, y, 0xffffff, 255, 0.6);
  return img;
}
export function glassPaneTop() {
  const img = newImg(); for (let i = 0; i < NN; i++) { setI(img, i, [255, 255, 255], 0); img.h[i] = 0.5; }
  for (let y = 0; y < N; y++) { setP(img, 7, y, (y % 5 === 2) ? 0xc6e3e8 : 0xdbf0f4, 255, 0.9); setP(img, 8, y, (y % 4 === 1) ? 0xaccfd6 : 0xc6e3e8, 255, 0.8); }
  return img;
}

// ---------------- wool ----------------
let WOOL_FIELD = null;
function woolField() {
  if (WOOL_FIELD) return WOOL_FIELD;
  const R = rng('wool2'); const wx = vnoise(R, 4, 4), wy = vnoise(R, 4, 4), W = white(R), n = vnoise(R, 8, 8);
  const f = new Float32Array(NN); const T = 2 * Math.PI / 16;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const X = x + (wx[i] - 0.5) * 5, Y = y + (wy[i] - 0.5) * 5;
    f[i] = Math.pow(0.5 + 0.5 * Math.sin(T * (3 * X + 2 * Y)), 2) * 0.7 + Math.pow(0.5 + 0.5 * Math.sin(T * (-2 * X + 3 * Y) + 1), 2) * 0.5 + W[i] * 0.35 + n[i] * 0.2;
  }
  return (WOOL_FIELD = rankQuant(f, [0.08, 0.2, 0.37, 0.25, 0.1]));
}
export function wool(hex) {
  const q = woolField(); const c = rgb(hex); const L = lum(...c);
  const img = newImg();
  // darker colours need stronger relative contrast
  const amp = L < 0.25 ? 0.2 : L > 0.7 ? 0.075 : 0.105;
  for (let i = 0; i < NN; i++) {
    const t = (q[i] - 2) * amp;
    const col = t >= 0 ? mixc(c, [255, 255, 255], t * (L > 0.8 ? 0.6 : 0.8)) : scalec(c, 1 + t * 1.15);
    setI(img, i, col); img.h[i] = 0.4 + q[i] * 0.1;
  }
  return img;
}
export const WOOL_COLORS = {
  white: 0xe9ecec, orange: 0xf07613, magenta: 0xbd44b3, light_blue: 0x3aafd9, yellow: 0xf8c627, lime: 0x70b919, pink: 0xed8dac, gray: 0x3e4447,
  light_gray: 0x8e8e86, cyan: 0x158991, purple: 0x792aac, blue: 0x35399d, brown: 0x724728, green: 0x546d1b, red: 0xa12722, black: 0x141519,
};

// ---------------- metal / mineral blocks ----------------
function bevelBlock(seed, pal, opts = {}) {
  const R = rng(seed); const f = combine([[vnoise(R, 4, 4), 0.5], [white(R), 0.5]]);
  const img = paintField(f, pal.mid, 0.05, 0.7);
  for (let i = 0; i < N; i++) {
    setP(img, i, 0, pal.hi, 255, 0.9); setP(img, 0, i, pal.hi, 255, 0.9);
    setP(img, i, 15, pal.lo, 255, 0.45); setP(img, 15, i, pal.lo, 255, 0.45);
  }
  if (pal.hi2) for (let i = 1; i < 15; i++) { setP(img, i, 1, pal.hi2, 255, 0.85); setP(img, 1, i, pal.hi2, 255, 0.85); }
  if (pal.lo2) for (let i = 1; i < 15; i++) { setP(img, i, 14, pal.lo2, 255, 0.55); setP(img, 14, i, pal.lo2, 255, 0.55); }
  setP(img, 15, 0, pal.corner || pal.lo, 255, 0.6); setP(img, 0, 15, pal.corner || pal.lo, 255, 0.6);
  return img;
}
export function ironBlock() {
  const img = bevelBlock('iron', { mid: [[0xd2d2d2, 0.2], [0xdadada, 0.5], [0xe2e2e2, 0.3]], hi: 0xffffff, hi2: 0xf0f0f0, lo: 0x9a9a9a, lo2: 0xb8b8b8, corner: 0xc4c4c4 });
  for (let i = 3; i < 13; i++) { setP(img, i, 3, 0xc8c8c8, 255, 0.6); setP(img, 3, i, 0xc8c8c8, 255, 0.6); setP(img, i, 12, 0xeeeeee, 255, 0.8); setP(img, 12, i, 0xeeeeee, 255, 0.8); }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) setP(img, x, y, 0xb0b0b0, 255, 0.9); // rivets
  return img;
}
export function goldBlock() {
  const img = bevelBlock('gold', { mid: [[0xf2c43a, 0.25], [0xf8d340, 0.45], [0xfde24f, 0.3]], hi: 0xfffbbd, hi2: 0xffee6e, lo: 0xb0700f, lo2: 0xd99a20, corner: 0xe8b52b });
  const sp = [[4, 4], [5, 3], [3, 5], [10, 8], [11, 7], [6, 11]]; for (const [x, y] of sp) setP(img, x, y, 0xfffcd2, 255, 0.85);
  return img;
}
export function diamondBlock() {
  const img = bevelBlock('diamondb', { mid: [[0x5fe0d8, 0.25], [0x6deae2, 0.45], [0x84f4ec, 0.3]], hi: 0xe6fffd, hi2: 0xb4fbf5, lo: 0x2a9d97, lo2: 0x4cc8c0, corner: 0x5fd8d0 });
  // inner bevelled square + sparkles
  for (let i = 3; i < 13; i++) { setP(img, i, 3, 0x4cc8c0, 255, 0.55); setP(img, 3, i, 0x4cc8c0, 255, 0.55); setP(img, i, 12, 0xbffcf7, 255, 0.85); setP(img, 12, i, 0xbffcf7, 255, 0.85); }
  for (const [x, y] of [[5, 5], [6, 6], [6, 5], [9, 9], [10, 8], [5, 10], [10, 5]]) setP(img, x, y, 0xd8fffb, 255, 0.85);
  return img;
}
export function emeraldBlock() {
  const img = bevelBlock('emeraldb', { mid: [[0x2bc35a, 0.25], [0x36d468, 0.45], [0x45e278, 0.3]], hi: 0xc5ffd9, hi2: 0x7cf3a5, lo: 0x0c7a31, lo2: 0x1ea548, corner: 0x2ab55a });
  const rows = ['....aaaaaaaa....', '...abbbbbbbbc...', '..abbddddddbbc..', '..abddddddddbc..', '..abddddddddbc..', '..abbddddddbbc..', '...accccccccc...', '....cccccccc....'];
  stamp(img, rows.map((r) => r.replace(/\./g, ' ')), { a: [0x8cf8b3, 0.85], b: [0x4fe887, 0.75], c: [0x179a42, 0.4], d: [0x34cf68, 0.6] }, 0, 4);
  return img;
}
export function lapisBlock() {
  const R = rng('lapisb');
  const img = bevelBlock('lapisb', { mid: [[0x1b3d95, 0.25], [0x2047a8, 0.45], [0x2652b9, 0.3]], hi: 0x5d86e2, hi2: 0x3d68cc, lo: 0x10286a, lo2: 0x163785, corner: 0x1f45a3 });
  for (let k = 0; k < 22; k++) { const x = 2 + irand(R, 12), y = 2 + irand(R, 12); setP(img, x, y, R() < 0.5 ? 0x7fa3f5 : 0x5b85e6, 255, 0.85); if (R() < 0.5) setP(img, x + 1, y, 0x2e5bc9, 255, 0.75); }
  return img;
}
export function redstoneBlock() {
  const img = bevelBlock('redb', { mid: [[0xa31606, 0.25], [0xb01c08, 0.45], [0xbf260e, 0.3]], hi: 0xff5a40, hi2: 0xe03c22, lo: 0x5c0a02, lo2: 0x7d1004, corner: 0x9e1a07 });
  const R = rng('redb2');
  for (let k = 0; k < 26; k++) { const x = 2 + irand(R, 12), y = 2 + irand(R, 12); const lt = R() < 0.45; setP(img, x, y, lt ? 0xe8462a : 0x7d1004, 255, lt ? 0.85 : 0.4); if (R() < 0.5) setP(img, x + 1, y, lt ? 0xc82c14 : 0x8e1406, 255, 0.6); }
  return img;
}
export function coalBlock() {
  const R = rng('coalb'); const f = combine([[vnoise(R, 4, 4), 0.4], [vnoise(R, 8, 8), 0.3], [white(R), 0.3]]);
  const img = paintField(f, [[0x0a0a0a, 0.2], [0x111111, 0.35], [0x191919, 0.25], [0x242424, 0.13], [0x343434, 0.07]], 0.5, 0.3);
  return img;
}
// copper
export const COPPER = {
  copper: [0x8a4a33, 0xa85a3d, 0xbf6a4c, 0xc8735a, 0xd98a6c, 0xe7a083],
  exposed: [0x7b5b4b, 0x936c5a, 0xa47c66, 0xb08a71, 0x6f9f86, 0x86b49c],
  weathered: [0x3f7c5c, 0x4e8f6b, 0x5ea07c, 0x6aaf8a, 0x8d6c55, 0xa0806a],
  oxidized: [0x3a7b62, 0x468c71, 0x52a284, 0x5fb291, 0x6ec2a0, 0x84d2b4],
};
export function copperBlock(kind) {
  const R = rng('copper' + kind); const f = combine([[vnoise(R, 4, 4), 0.45], [vnoise(R, 8, 8), 0.3], [white(R), 0.25]]);
  const P = COPPER[kind];
  let pal;
  if (kind === 'exposed') pal = [[P[0], 0.08], [P[1], 0.2], [P[2], 0.3], [P[3], 0.22], [P[4], 0.12], [P[5], 0.08]];
  else if (kind === 'weathered') pal = [[P[0], 0.1], [P[1], 0.25], [P[2], 0.3], [P[3], 0.2], [P[4], 0.1], [P[5], 0.05]];
  else pal = [[P[0], 0.05], [P[1], 0.15], [P[2], 0.3], [P[3], 0.27], [P[4], 0.15], [P[5], 0.08]];
  const img = paintField(f, pal, 0.15, 0.6);
  for (let i = 0; i < N; i++) { shadeP(img, i, 0, 1.1); shadeP(img, 0, i, 1.1); shadeP(img, i, 15, 0.8, -0.2); shadeP(img, 15, i, 0.8, -0.2); }
  return img;
}
export function cutCopper(kind) {
  const img = copperBlock(kind);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const lx = x & 7, ly = y & 7;
    if (lx === 0 || ly === 0) shadeP(img, x, y, 1.14, 0.1);
    if (lx === 7 || ly === 7) { shadeP(img, x, y, 0.72, -0.35); }
  }
  return img;
}

// ---------------- furnace ----------------
function furnaceStone(seed) {
  const R = rng(seed); const f = combine([[vnoise(R, 8, 8), 0.4], [white(R), 0.6]]);
  return paintField(f, [[0x6c6c6c, 0.1], [0x787878, 0.25], [0x828282, 0.35], [0x8d8d8d, 0.22], [0x9a9a9a, 0.08]], 0.2, 0.55);
}
function frameEdges(img, lt, dk) {
  for (let i = 0; i < N; i++) { setP(img, i, 0, lt, 255, 0.8); setP(img, 0, i, lt, 255, 0.8); setP(img, i, 15, dk, 255, 0.3); setP(img, 15, i, dk, 255, 0.3); }
  return img;
}
export function furnaceTop() {
  const img = furnaceStone('furntop');
  frameEdges(img, 0x9e9e9e, 0x555555);
  for (let i = 1; i < 15; i++) { setP(img, i, 1, 0x929292, 255, 0.7); setP(img, 1, i, 0x929292, 255, 0.7); setP(img, i, 14, 0x6b6b6b, 255, 0.4); setP(img, 14, i, 0x6b6b6b, 255, 0.4); }
  for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) if (x === 3 || y === 3) shadeP(img, x, y, 0.82, -0.1); else if (x === 12 || y === 12) shadeP(img, x, y, 1.1, 0.05);
  return img;
}
export function furnaceSide() {
  const img = furnaceStone('furnside');
  frameEdges(img, 0x9e9e9e, 0x555555);
  for (let x = 0; x < N; x++) { setP(img, x, 1, 0x9a9a9a, 255, 0.85); setP(img, x, 2, 0x8a8a8a, 255, 0.8); setP(img, x, 3, 0x5b5b5b, 255, 0.2); }
  return img;
}
export function furnaceFront(lit) {
  const img = furnaceSide();
  // vent slot
  for (let x = 3; x < 13; x++) { setP(img, x, 6, 0x4a4a4a, 255, 0.1); setP(img, x, 7, 0x8e8e8e, 255, 0.7); }
  // opening
  for (let y = 9; y < 15; y++) for (let x = 2; x < 14; x++) {
    const rim = y === 9 || x === 2 || x === 13;
    if (rim) { setP(img, x, y, y === 9 ? 0x5a5a5a : 0x6a6a6a, 255, 0.35); continue; }
    setP(img, x, y, y < 12 ? 0x1c1c1c : 0x262626, 255, 0.0);
  }
  for (let x = 3; x < 13; x++) setP(img, x, 14, 0x444444, 255, 0.05);
  if (lit) {
    const fire = [
      '..f..y...f..',
      '.fyf.fy.fyf.',
      'fyYyfyYfyYyf',
      'yYWYyYWyYWYy',
      'YWWWYWWYWWWY',
    ];
    const P = { f: [0xd2541c, 0.1, 0.8], y: [0xf59a2a, 0.1, 0.95], Y: [0xfcc845, 0.1, 1], W: [0xfff3b0, 0.1, 1] };
    stamp(img, fire.map((r) => r.replace(/\./g, ' ')), P, 2, 10);
  }
  return img;
}

// ---------------- TNT ----------------
export function tntSide() {
  const rows = [
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
    'kkkkkkkkkkkkkkkk',
    'wwwwwwwwwwwwwwww',
    'wbbbwbwwbwbbbwwg',
    'wwbwwbbwbwwbwwwg',
    'wwbwwbwbbwwbwwwg',
    'wwbwwbwwbwwbwwwg',
    'gggggggggggggggg',
    'kkkkkkkkkkkkkkkk',
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
    'rRrrdrRrrdrRrrdd',
  ];
  return fromMap(rows, { r: [0xc43a14, 0.7], R: [0xdb5a2c, 0.8], d: [0x8a2a0c, 0.4], k: [0x5a1c0a, 0.3], w: [0xe8e8e8, 0.75], g: [0xb8b8b8, 0.6], b: [0x1c1c1c, 0.45] });
}
export function tntTop(bottom) {
  const cell = bottom ? ['dccd', 'crrc', 'crrc', 'dccd'] : ['dccd', 'cggc', 'cgGc', 'dccd'];
  const img = newImg();
  const P = { d: [0x5a1c0a, 0.2], c: [0xc43a14, 0.7], r: [0xa83010, 0.6], g: [0x9a9a9a, 0.8], G: [0x6a6a6a, 0.7] };
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) stamp(img, cell, P, cx * 4, cy * 4);
  if (!bottom) stamp(img, ['ff', 'ff'], { f: [0x2a2a2a, 0.9] }, 7, 7);
  return img;
}

// ---------------- light sources ----------------
export function glowstone() {
  const R = rng('glowstone');
  const pts = []; for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) pts.push([gx * 4 + R() * 3.5, gy * 4 + R() * 3.5, 0.8 + R() * 0.5]);
  const v = voronoi(pts); const W = white(R);
  const P = [0x6e4c22, 0x8f6a35, 0xb48a4f, 0xd8af6a, 0xf3d68e, 0xfff0bf];
  const img = newImg();
  for (let i = 0; i < NN; i++) {
    const e = v.d2[i] - v.d1[i]; let s = Math.min(1, e / 2.6) * 0.85 + (W[i] - 0.5) * 0.35 + (pts[v.id[i]][2] - 1) * 0.6;
    if (e < 0.6) s = 0.05 + W[i] * 0.15;
    const k = Math.max(0, Math.min(5, Math.round(s * 5)));
    setI(img, i, rgb(P[k])); img.h[i] = 0.3 + k * 0.12; img.e[i] = 0.45 + k * 0.11;
  }
  return img;
}
// sea lantern frames
export function seaLanternFrames() {
  const frames = [];
  const base = [
    'BbbbbbbbbbbbbbbB',
    'bLLLLLLmLLLLLLLb',
    'bLWWWWLmLWWWWWLb',
    'bLWwwWLmLWwwwWLb',
    'bLWwwWLmLWwwwWLb',
    'bLWWWWLmLWWWWWLb',
    'bLLLLLLmLLLLLLLb',
    'bmmmmmmmmmmmmmmb',
    'bLLLLLLmLLLLLLLb',
    'bLWWWWLmLWWWWWLb',
    'bLWwwWLmLWwwwWLb',
    'bLWwwWLmLWwwwWLb',
    'bLWWWWLmLWWWWWLb',
    'bLLLLLLmLLLLLLLb',
    'bLLLLLLmLLLLLLLb',
    'BbbbbbbbbbbbbbbB',
  ];
  const P = { B: 0x54706a, b: 0x7e9c94, m: 0xa3c0b6, L: 0xc3dad1, W: 0xe1eee8, w: 0xf6fbf8 };
  for (let f = 0; f < 5; f++) {
    const img = fromMap(base, P);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x; const o = i * 4;
      // moving diagonal glimmer band
      const d = ((x + y) - f * 6 + 64) % 30; const g = d < 4 ? 1.08 : d < 7 ? 1.03 : 0.97;
      img.c[o] *= g; img.c[o + 1] *= g; img.c[o + 2] *= g;
      const L = lum(img.c[o], img.c[o + 1], img.c[o + 2]);
      img.e[i] = 0.55 + 0.45 * clamp01((L - 0.45) / 0.5);
    }
    frames.push(img);
  }
  return frames;
}
// lantern (vanilla UV layout: body sides 0..5 x 2..8, top/bottom 0..5 x 9..14, cap 1..4 x 0..1, handle 11..13 x 1..2 & 10..11)
export function lantern() {
  const rows = [
    '.kkkk...........',
    '.kddk......kik..',
    'kkddkk.....i.i..',
    'kYYYYk..........',
    'kYWWYk..........',
    'kYWWYk..........',
    'kOYYOk..........',
    'kOOOOk..........',
    'kkddkk..........',
    'kkkkkk..........',
    'kddddk.....kik..',
    'kdkkdk.....i.i..',
    'kdkkdk..........',
    'kddddk..........',
    'kkkkkk..........',
    '................',
  ];
  const img = fromMap(rows, { k: [0x3b3e46, 0.7], d: [0x55596a, 0.8], i: [0x4a4d57, 0.7], Y: [0xffd77a, 0.4, 1], W: [0xfff5d0, 0.4, 1], O: [0xf3a13a, 0.4, 0.9] });
  for (let i = 0; i < NN; i++) if (img.c[i * 4 + 3] && img.e[i] === 0) { setF0(img, i, 1); setSm(img, i, 0.55); }
  return img;
}
// torch: stick 7..8 x 6..15, flame rows 6..7
export function torch(red) {
  const img = newImg(); for (let i = 0; i < NN; i++) setI(img, i, [0, 0, 0], 0);
  const flame = red ? [[0xff6a5a, 0xff2a1a], [0xd80000, 0x9e0000]] : [[0xfffbd6, 0xffe485], [0xffcf3d, 0xf3a32a]];
  for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) { setP(img, 7 + x, 6 + y, flame[y][x], 255, 0.9); img.e[(6 + y) * N + 7 + x] = 1; }
  const stick = red ? [[0x6b0000, 0x4a0000], [0x8b6d3f, 0x5f4a2b]] : [[0x4a3a22, 0x3a2c1a], [0x8b6d3f, 0x5f4a2b]];
  for (let y = 8; y < 16; y++) { const s = y === 8 ? stick[0] : stick[1]; setP(img, 7, y, s[0], 255, 0.7); setP(img, 8, y, s[1], 255, 0.6); }
  if (red) { img.e[8 * N + 7] = 0.4; img.e[8 * N + 8] = 0.4; }
  return img;
}

// ---------------- rails ----------------
const TIE = [0x6b5130, 0x5a4428, 0x7d6140];
function railBase(goldRail, on) {
  const img = newImg(); for (let i = 0; i < NN; i++) setI(img, i, [0, 0, 0], 0);
  const tie = goldRail ? [0x4b3a24, 0x3b2d1b, 0x5a4730] : TIE;
  for (const ty of [1, 5, 9, 13]) for (let x = 1; x < 15; x++) { setP(img, x, ty, tie[x === 1 ? 2 : 0], 255, 0.5); setP(img, x, ty + 1, tie[1], 255, 0.45); }
  const rl = goldRail ? [0xf9e15b, 0xc59a24, 0x8a6612] : [0xb5b5b5, 0x8a8a8a, 0x5a5a5a];
  for (let y = 0; y < 16; y++) for (const rx of [2, 12]) { setP(img, rx, y, rl[0], 255, 0.8); setP(img, rx + 1, y, rl[1], 255, 0.75); }
  if (goldRail) for (let y = 0; y < 16; y++) { const c = on ? (y % 2 ? 0xff3a2a : 0xd01010) : (y % 2 ? 0x6e1010 : 0x4e0a0a); setP(img, 7, y, c, 255, 0.6); setP(img, 8, y, on ? 0xb80c0c : 0x3e0808, 255, 0.55); if (on) { img.e[y * N + 7] = 0.8; img.e[y * N + 8] = 0.5; } }
  for (let i = 0; i < NN; i++) { const o = i * 4; if (img.c[o + 3] && img.h[i] >= 0.75) { setF0(img, i, 1); setSm(img, i, 0.6); } }
  return img;
}
export const rail = () => railBase(false);
export const poweredRail = (on) => railBase(true, on);
export function railCorner() {
  const img = newImg(); for (let i = 0; i < NN; i++) setI(img, i, [0, 0, 0], 0);
  // curve connects bottom (south) edge and right (east) edge; centre of curvature at (16,16)
  const cx = 16, cy = 16;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); const a = Math.atan2(cy - (y + 0.5), cx - (x + 0.5));
    // ties: radial segments every ~22 degrees
    const tiePh = ((a / (Math.PI / 2)) * 4.5) % 1;
    if (d > 2.5 && d < 15.5 && tiePh < 0.32) setP(img, x, y, tiePh < 0.16 ? TIE[0] : TIE[1], 255, 0.5);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    for (const r of [3.6, 13.6]) { if (Math.abs(d - r) < 0.55) setP(img, x, y, 0xb5b5b5, 255, 0.8); else if (Math.abs(d - (r + 1)) < 0.55) setP(img, x, y, 0x8a8a8a, 255, 0.75); }
  }
  for (let i = 0; i < NN; i++) { if (img.c[i * 4 + 3] && img.h[i] >= 0.75) { setF0(img, i, 1); setSm(img, i, 0.6); } }
  return img;
}

// ---------------- misc ----------------
export function hayTop() {
  const R = rng('haytop'); const W = white(R);
  const img = newImg(); const P = [0x7e6510, 0x96790f, 0xa98a18, 0xbc9d28, 0xcdb03a, 0xdcc152];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const edge = Math.min(x, y, 15 - x, 15 - y);
    let s = W[i] * 0.8 + 0.1;
    if (edge === 0) s = 0.2 + W[i] * 0.3; else if (edge === 1) s = 0.5 + W[i] * 0.4;
    const k = Math.round(s * 5); setI(img, i, rgb(P[k])); img.h[i] = 0.3 + k * 0.1;
  }
  return img;
}
export function haySide() {
  const R = rng('hayside'); const W = white(R); const n = vnoise(R, 16, 2);
  const img = newImg(); const P = [0x7e6510, 0x96790f, 0xa98a18, 0xbc9d28, 0xcdb03a, 0xdcc152];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (y === 2 || y === 3 || y === 12 || y === 13) {
      const c = (y === 2 || y === 12) ? (x % 3 === 0 ? 0x8e4a1e : 0x9e5a28) : (x % 3 === 1 ? 0x6e3512 : 0x7e4219);
      setI(img, i, rgb(c)); img.h[i] = 0.85; continue;
    }
    const s = n[i] * 0.65 + W[i] * 0.35; const k = Math.max(0, Math.min(5, Math.round(s * 5.4 - 0.2)));
    setI(img, i, rgb(P[k])); img.h[i] = 0.3 + k * 0.1;
  }
  return img;
}
export function ironBars() {
  const img = newImg(); for (let i = 0; i < NN; i++) setI(img, i, [0, 0, 0], 0);
  for (let y = 0; y < N; y++) for (const bx of [15, 3, 7, 11]) {
    setP(img, bx, y, y % 8 === 0 ? 0x9a9a9a : 0x8a8a8a, 255, 0.8); setP(img, bx + 1, y, y % 8 === 4 ? 0x3e3e3e : 0x4f4f4f, 255, 0.7);
  }
  for (const by of [0]) for (let x = 0; x < N; x++) { setP(img, x, by, 0x7a7a7a, 255, 0.8); }
  for (let i = 0; i < NN; i++) if (img.c[i * 4 + 3]) { setF0(img, i, 1); setSm(img, i, 0.45); }
  return img;
}
export function cobweb() {
  const img = newImg(); for (let i = 0; i < NN; i++) setI(img, i, [0, 0, 0], 0);
  const c = 0xe0e0e0, c2 = 0xc4c4c4;
  const seg = (x0, y0, x1, y1, col) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) || 1; for (let t = 0; t <= n; t++) { const x = Math.round(x0 + (x1 - x0) * t / n), y = Math.round(y0 + (y1 - y0) * t / n); if (x >= 0 && y >= 0 && x < 16 && y < 16) setP(img, x, y, col, 255, 0.6); } };
  const cx = 7.5, cy = 7.5; const ends = [];
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + 0.12 * Math.sin(k * 2.1); const corner = k % 2 === 1; const r = corner ? 10.6 : 8; ends.push([a, r]); seg(cx + Math.cos(a) * 1.2, cy + Math.sin(a) * 1.2, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c); }
  for (const R of [2.7, 5.8]) for (let k = 0; k < 8; k++) {
    if (R < 3 && k % 2) continue;
    const [a0] = ends[k], [a1] = ends[(k + 1) % 8]; const r0 = R * (k % 2 ? 1.15 : 1), r1 = R * ((k + 1) % 2 ? 1.15 : 1);
    const x0 = cx + Math.cos(a0) * r0, y0 = cy + Math.sin(a0) * r0, x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; const sx = cx + (mx - cx) * 0.85, sy = cy + (my - cy) * 0.85; // sag toward centre
    seg(x0, y0, sx, sy, c2); seg(sx, sy, x1, y1, c2);
  }
  return img;
}

// ---------------- destroy stages ----------------
export function destroyStages() {
  const R = rng('destroy');
  // grow a crack network from centre; record order of each pixel
  const order = new Int32Array(NN).fill(-1); let t = 0;
  const branches = [];
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let b = 0; b < 6; b++) branches.push({ x: 7 + (b % 2), y: 7 + ((b >> 1) % 2), d: (b * 8 / 6 + R() * 1.2) | 0, alive: true });
  const mark = (x, y) => { if (x < 0 || y < 0 || x > 15 || y > 15) return false; const i = y * N + x; if (order[i] < 0) order[i] = t++; return true; };
  mark(7, 7); mark(8, 8);
  for (let step = 0; step < 60; step++) {
    const cur = branches.slice();
    for (const br of cur) {
      if (!br.alive) continue;
      if (R() < 0.3) br.d = (br.d + (R() < 0.5 ? 1 : 7)) % 8;
      br.x += dirs[br.d][0]; br.y += dirs[br.d][1];
      if (!mark(br.x, br.y)) { br.alive = false; continue; }
      if (R() < 0.12 && branches.length < 40) branches.push({ x: br.x, y: br.y, d: (br.d + (R() < 0.5 ? 2 : 6)) % 8, alive: true });
    }
  }
  // fill remaining with "crumble" pixels near cracks for late stages
  const total = t;
  const stages = [];
  for (let s = 0; s < 10; s++) {
    const lim = Math.round(total * (0.06 + 0.94 * Math.pow(s / 9, 1.15)));
    const img = newImg(); for (let i = 0; i < NN; i++) { setI(img, i, [0, 0, 0], 0); img.h[i] = 0.5; }
    for (let i = 0; i < NN; i++) if (order[i] >= 0 && order[i] < lim) { setI(img, i, rgb(order[i] % 3 === 0 ? 0x101010 : 0x262626), 255); img.h[i] = 0.0; }
    // late stages: add chipped fragments next to cracks
    if (s >= 5) {
      const R2 = rng('chip' + s);
      for (let i = 0; i < NN; i++) {
        if (img.c[i * 4 + 3]) continue; const x = i % N, y = (i / N) | 0;
        let near = 0; for (const [dx, dy] of dirs) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && img.c[(Y * N + X) * 4 + 3] && img.h[Y * N + X] === 0) near++; }
        if (near && R2() < (s - 4) * 0.045) { setI(img, i, rgb(0x3a3a3a), 200); img.h[i] = 0.2; }
      }
    }
    stages.push(img);
  }
  return stages;
}
