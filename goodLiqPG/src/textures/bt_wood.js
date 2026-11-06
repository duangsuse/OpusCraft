// Wood: logs, log tops, planks, leaves, saplings, door, trapdoor, crafting table, bookshelf, chest, ladder.
import {
  N, NN, rng, irand, rgb, lum, mixc, scalec, gray, wrap, newImg, cloneImg, setI, setP, getP, shadeP, mapImg,
  fromMap, stamp, normPal, vnoise, white, combine, normalize, blur, rankQuant, paintField, setSm, setF0,
} from './bt_core.js';

export const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry'];
// plank palettes: [seamDark, seam, dark, mid, light, highlight]
export const PLANK = {
  oak: [0x4c3d26, 0x6b5428, 0x8f7348, 0x9f844d, 0xaf8f55, 0xc29d62],
  spruce: [0x3a2a16, 0x4f3a20, 0x5f4528, 0x6b4f2e, 0x775935, 0x86653d],
  birch: [0x86754a, 0x9e8d5e, 0xb5a36e, 0xc0ae78, 0xcbba84, 0xd7c98f],
  jungle: [0x553a24, 0x704b30, 0x8a6142, 0x9a6d4b, 0xa77955, 0xb88a62],
  acacia: [0x5c2f1a, 0x7a3c20, 0x934c2a, 0xa35730, 0xb06036, 0xc26d3f],
  dark_oak: [0x1f1409, 0x2c1c0d, 0x392512, 0x432c16, 0x4e341b, 0x5c3f22],
  cherry: [0x95615f, 0xb57f7b, 0xcf9d97, 0xdcaba4, 0xe6bbb3, 0xf0cdc5],
};
// bark palettes dark->light
export const BARK = {
  oak: [0x3a2c18, 0x4c3d26, 0x5c482c, 0x695333, 0x78603c, 0x8c724a],
  spruce: [0x1c1209, 0x26190c, 0x302011, 0x3a2815, 0x46321c, 0x553e24],
  birch: [0x262624, 0x5a5a55, 0xc9c9c2, 0xd8d8d1, 0xe5e5df, 0xf3f3ef],
  jungle: [0x382a0e, 0x463612, 0x544118, 0x614e1e, 0x725d25, 0x8a7433],
  acacia: [0x403b35, 0x4e4841, 0x5c554c, 0x686057, 0x766d62, 0x8a8174],
  dark_oak: [0x1b1308, 0x251b0d, 0x2f2312, 0x3a2b17, 0x45341d, 0x524026],
  cherry: [0x1d0f14, 0x29151d, 0x331b25, 0x3e212d, 0x4b2937, 0x5c3445],
};

// ---------------- planks ----------------
const JOINTS = [11, 3, 13, 6];
export function planks(w) {
  const P = PLANK[w].map(rgb); const R = rng('planks' + w); const W = white(R);
  const img = newImg(); const g = vnoise(R, 4, 16);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const b = y >> 2, ly = y & 3; const j = JOINTS[b];
    if (ly === 3) { setI(img, i, W[i] < 0.3 ? P[0] : P[1]); img.h[i] = 0.1; continue; }
    if (x === j) { setI(img, i, ly === 1 ? P[0] : P[1]); img.h[i] = 0.15; continue; }
    let s = 0.5 + (g[i] - 0.5) * 0.9 + (W[i] - 0.5) * 0.45;
    if (ly === 0) s += 0.18; if (ly === 2) s -= 0.15; if (x === wrap(j + 1)) s += 0.12;
    const k = Math.max(2, Math.min(5, 2 + Math.round(s * 3)));
    setI(img, i, P[k]); img.h[i] = 0.6 + (k - 2) * 0.08 - (ly === 2 ? 0.08 : 0);
  }
  // a few darker grain dashes
  for (let k = 0; k < 6; k++) { const b = irand(R, 4), y = b * 4 + irand(R, 3), x = irand(R, 13); for (let d = 0; d < 2 + irand(R, 3); d++) if (wrap(x + d) !== JOINTS[b]) { setP(img, x + d, y, P[2]); } }
  return img;
}

// ---------------- logs ----------------
export function logSide(w) {
  const R = rng('log' + w); const P = BARK[w];
  if (w === 'birch') return birchLog(R);
  const col = new Float32Array(16); for (let x = 0; x < 16; x++) col[x] = R();
  const n = vnoise(R, 16, 4), W = white(R);
  const f = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; f[i] = col[x] * 0.5 + n[i] * 0.3 + W[i] * 0.2; }
  const img = paintField(f, [[P[0], 0.07], [P[1], 0.15], [P[2], 0.25], [P[3], 0.25], [P[4], 0.18], [P[5], 0.1]], 0.7, 0.2);
  // vertical grooves
  for (let k = 0; k < 9; k++) {
    const x = irand(R, 16), y = irand(R, 16), len = 3 + irand(R, 6);
    for (let d = 0; d < len; d++) { setP(img, x, y + d, P[0], 255, 0.05); if (R() < 0.7) shadeP(img, x + 1, y + d, 1.12, 0.05); }
  }
  if (w === 'cherry') { // horizontal lenticels
    for (let k = 0; k < 8; k++) { const x = irand(R, 16), y = irand(R, 16), len = 2 + irand(R, 3); for (let d = 0; d < len; d++) setP(img, x + d, y, d === 0 || d === len - 1 ? 0x5c3445 : 0x75475a, 255, 0.7); }
  }
  if (w === 'jungle') { // light streaks
    for (let k = 0; k < 5; k++) { const x = irand(R, 16), y = irand(R, 16), len = 3 + irand(R, 4); for (let d = 0; d < len; d++) setP(img, x, y + d, 0x98803c, 255, 0.85); }
  }
  return img;
}
function birchLog(R) {
  const P = BARK.birch; const W = white(R); const n = vnoise(R, 8, 4);
  const img = newImg();
  for (let i = 0; i < NN; i++) { const s = n[i] * 0.6 + W[i] * 0.4; const k = s < 0.25 ? 2 : s < 0.5 ? 3 : s < 0.8 ? 4 : 5; setI(img, i, rgb(P[k])); img.h[i] = 0.6; }
  // black horizontal marks
  const marks = [[1, 1, 4], [9, 2, 3], [12, 5, 4], [4, 6, 2], [0, 9, 3], [7, 10, 5], [13, 12, 2], [3, 13, 3], [10, 15, 3], [6, 3, 1]];
  for (const [x, y, len] of marks) {
    for (let d = 0; d < len; d++) { setP(img, x + d, y, P[0], 255, 0.2); if (d > 0 && d < len - 1 && R() < 0.7) setP(img, x + d, y + 1, P[1], 255, 0.3); }
    setP(img, x - 1, y, P[1], 255, 0.3);
  }
  return img;
}
export function logTop(w) {
  const B = BARK[w].map(rgb); const P = PLANK[w].map(rgb); const R = rng('logtop' + w); const W = white(R);
  const img = newImg();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; const dx = x - 7.5, dy = y - 7.5;
    const d = Math.max(Math.abs(dx), Math.abs(dy)) * 0.55 + Math.hypot(dx, dy) * 0.45 + (W[i] - 0.5) * 0.5;
    const edge = Math.min(x, y, 15 - x, 15 - y);
    if (edge === 0) { // bark
      if (w === 'birch') setI(img, i, (x * 7 + y * 3) % 5 === 0 ? B[0] : B[3 + (W[i] * 2 | 0)]);
      else setI(img, i, B[1 + (W[i] * 3 | 0)]);
      img.h[i] = 0.9; continue;
    }
    if (edge === 1 && W[i] < 0.25) { setI(img, i, w === 'birch' ? B[2] : B[3]); img.h[i] = 0.8; continue; }
    const ring = Math.floor(d / 1.5);
    let k = ring % 2 === 0 ? 4 : 3; if (d < 1.2) k = 2; if (ring === 4 && edge > 1) k = 2;
    if (W[i] > 0.85) k = Math.min(5, k + 1);
    setI(img, i, P[k]); img.h[i] = 0.55 + (k - 3) * 0.08;
  }
  return img;
}

// ---------------- leaves ----------------
// grayscale (tinted) leaves with transparent holes, built from small shaded leaf stamps over a dark under-layer
const LEAF_SHAPES = [
  ['.a.', 'abc', '.cd'],
  ['ab.', 'bcc', '.cd'],
  ['.ab', 'abc', 'cd.'],
  ['ab', 'cd'],
  ['.a', 'bc', 'd.'],
  ['aab', 'bcd'],
];
const LEAF_CFG = {
  oak: { pal: [0x3c3c3c, 0x585858, 0x727272, 0x8c8c8c, 0xa6a6a6, 0xc2c2c2], n: 30, hole: 0.55, shapes: [0, 1, 2, 3, 4, 5] },
  dark_oak: { pal: [0x383838, 0x525252, 0x6c6c6c, 0x868686, 0xa0a0a0, 0xbababa], n: 34, hole: 0.45, shapes: [0, 1, 2, 3, 5] },
  acacia: { pal: [0x3e3e3e, 0x5a5a5a, 0x767676, 0x909090, 0xaaaaaa, 0xc4c4c4], n: 26, hole: 0.6, shapes: [3, 4, 5, 1] },
  birch: { pal: [0x464646, 0x626262, 0x7e7e7e, 0x989898, 0xb2b2b2, 0xcccccc], n: 30, hole: 0.5, shapes: [0, 1, 2, 3] },
  jungle: { pal: [0x363636, 0x525252, 0x6e6e6e, 0x8a8a8a, 0xa6a6a6, 0xc4c4c4], n: 16, hole: 0.4, shapes: [0, 1, 2], big: true },
  spruce: { pal: [0x383838, 0x525252, 0x6c6c6c, 0x868686, 0xa0a0a0, 0xbababa], n: 34, hole: 0.62, shapes: [4, 3, 5], needles: true },
  cherry: { pal: [0x9c4a70, 0xbb6189, 0xd680a3, 0xe9a0bf, 0xf4bcd3, 0xfcdbe9], n: 30, hole: 0.5, shapes: [0, 1, 2, 3, 5] },
};
const BIG_LEAF = ['..ab..', '.abbc.', 'abbccd', '.bccd.', '..cd..'];
export function leaves(w) {
  const R = rng('leaves' + w); const cfg = LEAF_CFG[w]; const P = cfg.pal;
  const img = newImg(); const cov = new Uint8Array(NN);
  // under-layer: dark leaves, with holes chosen by noise
  const hn = combine([[white(R), 0.6], [vnoise(R, 8, 8), 0.4]]);
  const q = rankQuant(hn, [cfg.hole, 1 - cfg.hole]);
  for (let i = 0; i < NN; i++) {
    if (q[i] === 0) { setI(img, i, [0, 0, 0], 0); img.h[i] = 0; } else { setI(img, i, rgb(R() < 0.5 ? P[0] : P[1])); img.h[i] = 0.25; }
  }
  const map = { a: 5, b: 4, c: 3, d: 2 };
  for (let k = 0; k < cfg.n; k++) {
    const sh = cfg.big && k % 3 === 0 ? BIG_LEAF : LEAF_SHAPES[cfg.shapes[irand(R, cfg.shapes.length)]];
    const ox = irand(R, 16), oy = irand(R, 16); const tone = R() < 0.3 ? -1 : 0;
    for (let y = 0; y < sh.length; y++) for (let x = 0; x < sh[y].length; x++) {
      const ch = sh[y][x]; if (ch === '.') continue;
      const i = wrap(oy + y) * N + wrap(ox + x); const kk = Math.max(1, map[ch] + tone);
      setI(img, i, rgb(P[kk])); img.h[i] = 0.4 + kk * 0.1; cov[i] = 1;
    }
  }
  if (cfg.needles) for (let k = 0; k < 18; k++) { const x = irand(R, 16), y = irand(R, 16); setP(img, x, y, P[3], 255, 0.7); setP(img, x + 1, y + 1, P[1], 255, 0.5); }
  if (w === 'cherry') for (let k = 0; k < 9; k++) { const x = irand(R, 16), y = irand(R, 16); if (img.c[(y * N + x) * 4 + 3]) setP(img, x, y, 0xfff2f8, 255, 0.95); }
  return img;
}

// ---------------- saplings ----------------
const SAP = {
  oak: {
    rows: [
      '................',
      '......gGg.......',
      '....gGGgGgg.....',
      '...gGgDGGgGg....',
      '..gGGgGgDgGgg...',
      '..gDgGGDgGGDg...',
      '...gGDgtgDgg....',
      '....gg.tggD.....',
      '.....D.t.g......',
      '.......t........',
      '......tt........',
      '.......t........',
      '.......tT.......',
      '.......t........',
      '.......t........',
      '.......t........',
    ],
    pal: { G: 0x6db33c, g: 0x4a9228, D: 0x2f6a18, t: 0x6b5130, T: 0x4c3d26 },
  },
  spruce: {
    rows: [
      '.......g........',
      '......gGg.......',
      '......gDg.......',
      '.....gGgGg......',
      '....gDGgDGg.....',
      '.....ggtgg......',
      '....gGgtgGg.....',
      '...gDGgtgDGg....',
      '..gGgDgtgDgGg...',
      '....ggDtDgg.....',
      '...gGgDtDgGg....',
      '..gDGgDtgDGDg...',
      '.ggDgg.t.ggDgg..',
      '.......t........',
      '.......t........',
      '.......t........',
    ],
    pal: { G: 0x47704a, g: 0x335a37, D: 0x213e26, t: 0x3a2815 },
  },
  birch: {
    rows: [
      '................',
      '.....gGGg.......',
      '...gGGgGGgg.....',
      '..gGgGGgDGGg....',
      '..gGGDgGGgGg....',
      '...gGgGDgGg.g...',
      '....gDgwgDggGg..',
      '.......w..gGg...',
      '.......w........',
      '.......k........',
      '.......w........',
      '......ww........',
      '.......w........',
      '.......k........',
      '.......w........',
      '.......w........',
    ],
    pal: { G: 0x8fbf55, g: 0x6c9c38, D: 0x4a7524, w: 0xd8d8d0, k: 0x3a3a36 },
  },
  jungle: {
    rows: [
      '................',
      '...gGg....gGg...',
      '..gGGGg..gGGGg..',
      '..gGDGgggGDGGg..',
      '...gDgGGGgDgg...',
      '..ggGGGDGGGgg...',
      '.gGGGDgtgDGGGg..',
      '.gGDg..t..gDGg..',
      '..gg...t...gg...',
      '.......t........',
      '......tt........',
      '.......t........',
      '.......tt.......',
      '.......t........',
      '.......t........',
      '.......t........',
    ],
    pal: { G: 0x3f9a26, g: 0x2a7a18, D: 0x1b5510, t: 0x5a4518 },
  },
  acacia: {
    rows: [
      '................',
      '................',
      '..gGGgg.ggGGg...',
      '.gGGDGGgGGDGGg..',
      '.ggDgggGgggDgg..',
      '....g.tg.t.g....',
      '.......tt.......',
      '.......t........',
      '......t.........',
      '......t.........',
      '.......t........',
      '.......t........',
      '.......t........',
      '.......t........',
      '.......t........',
      '.......t........',
    ],
    pal: { G: 0x8a9a35, g: 0x6a7a24, D: 0x4b5a17, t: 0x6b6258 },
  },
  dark_oak: {
    rows: [
      '................',
      '................',
      '.....gGGgg......',
      '...gGGgGGDgg....',
      '..gGDGGgDGGgg...',
      '.gGGgDGGgGDGGg..',
      '.gDGGgDgGGgDGg..',
      '..gDgGgtgDGgg...',
      '...ggDgtgggD....',
      '.....g.t.g......',
      '.......t........',
      '......tt........',
      '.......t........',
      '.......tt.......',
      '.......t........',
      '.......t........',
    ],
    pal: { G: 0x3f7f22, g: 0x2b6216, D: 0x1a420c, t: 0x3a2b17 },
  },
  cherry: {
    rows: [
      '................',
      '.....pPPp.......',
      '...pPWPPpPp.....',
      '..pPPpPWPPPp....',
      '..pWPPDpPPWPp...',
      '...pPpPPDpPp....',
      '....pDp.tDp.....',
      '.......t........',
      '...g...t...g....',
      '..gLg..t..gLg...',
      '...g...t...g....',
      '.......t........',
      '......tt........',
      '.......t........',
      '.......t........',
      '.......t........',
    ],
    pal: { P: 0xf2b4cf, p: 0xe08ab0, D: 0xbe5f8a, W: 0xfde3ee, t: 0x3e212d, g: 0x4f8a2a, L: 0x6fae3a },
  },
};
export function sapling(w) { const s = SAP[w]; return fromMap(s.rows, s.pal); }

// ---------------- door / trapdoor ----------------
const DOOR_PAL = { k: [0x5e4627, 0.25], d: [0x7e6237, 0.45], m: [0x9a7b49, 0.65], l: [0xb4925c, 0.8], h: [0xc7a46c, 0.9], i: [0x3a3a3a, 1], I: [0x8a8a8a, 1] };
export function oakDoorTop() {
  const rows = [
    'kkkkkkkkkkkkkkkk',
    'kllllllllllllllk',
    'klmmmmmmmmmmmmdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klmmmmmmmmmmmmdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klmmmmmmmmmmmmdk',
    'kldddddddddddddk',
    'kllllllllllllllk',
    'kmmmmmmmmmmmmmmk',
  ];
  const img = fromMap(rows, DOOR_PAL); grain(img, 'doortop'); return img;
}
export function oakDoorBottom() {
  const rows = [
    'kmmmmmmmmmmmmmmk',
    'klllllllllllliIk',
    'kldddddddddddiik',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'kldddddddddddddk',
    'kllllllllllllllk',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'klmhmmhmmhmmhmdk',
    'kldddddddddddddk',
    'kllllllllllllllk',
    'kkkkkkkkkkkkkkkk',
  ];
  const img = fromMap(rows, DOOR_PAL); grain(img, 'doorbot');
  for (const [x, y] of [[13, 1], [14, 1], [13, 2], [14, 2]]) { const i = y * N + x; setF0(img, i, 1); setSm(img, i, 0.5); }
  return img;
}
export function oakTrapdoor() {
  const rows = [
    'kkkkkkkkkkkkkkkk',
    'kllllllllllllllk',
    'klmmmmmmmmmmmmdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klmmmmmmmmmmmmdk',
    'kldddddddddddddk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klm....mm....mdk',
    'klmmmmmmmmmmmmdk',
    'kldddddddddddddk',
    'kkkkkkkkkkkkkkkk',
  ];
  const img = fromMap(rows, DOOR_PAL); grain(img, 'trapdoor'); return img;
}
function grain(img, seed) {
  const R = rng(seed);
  for (let i = 0; i < NN; i++) { if (!img.c[i * 4 + 3]) continue; const s = 0.95 + R() * 0.1; const o = i * 4; img.c[o] *= s; img.c[o + 1] *= s; img.c[o + 2] *= s; }
}

// ---------------- crafting table ----------------
const CT = { k: [0x3b2a14, 0.2], K: [0x4f3a1f, 0.3], d: [0x6b4f2a, 0.5], m: [0x8a6a3c, 0.65], l: [0xa98352, 0.8], h: [0xc29d62, 0.9], s: [0xb8b8b8, 0.9], S: [0x8a8a8a, 0.85], z: [0x5a5a5a, 0.7], w: [0x6b5130, 0.7], W: [0x4c3d26, 0.6] };
export function craftingTableTop() {
  // dark rim, light bevel, 3x3 crafting grid of bevelled wooden squares separated by dark grooves
  const rows = [];
  const cell = ['hll', 'llm', 'lmm'];
  for (let y = 0; y < 16; y++) {
    let r = '';
    for (let x = 0; x < 16; x++) {
      let ch;
      if (x === 0 || y === 0 || x === 15 || y === 15) ch = (x === 0 || x === 15) && (y === 0 || y === 15) ? 'k' : 'K';
      else if (x === 1 || y === 1) ch = 'h';
      else if (x === 14 || y === 14) ch = 'd';
      else if ((x - 2) % 4 === 0 || (y - 2) % 4 === 0) ch = 'K';
      else ch = cell[(y - 3) % 4][(x - 3) % 4];
      r += ch;
    }
    rows.push(r);
  }
  const img = fromMap(rows, CT); grain(img, 'cttop'); return img;
}
const CT_BODY_TOP = [
  'kKKKKKKKKKKKKKKk',
  'KhllhlllhllllhlK',
  'KmmmmmmmmmmmmmmK',
  'kkkkkkkkkkkkkkkk',
];
export function craftingTableFront() {
  const rows = CT_BODY_TOP.concat([
    'KlmmmmdKlmmmmmdK',
    'KlsssSdKlmmzzmdK',
    'KlszSSdKlmzSSzdK',
    'KlsSzSdKlmzSSzdK',
    'KlsSSzdKlmmwwmdK',
    'KlsSSSdKlmmwwmdK',
    'KlswwSdKlmmwwmdK',
    'KlmwwmdKlmmwwmdK',
    'KlmWWmdKlmmWWmdK',
    'KlmmmmdKlmmmmmdK',
    'KdddddkKddddddkK',
    'kKKKKKKKKKKKKKKk',
  ]);
  const img = fromMap(rows, CT); grain(img, 'ctfront'); return img;
}
export function craftingTableSide() {
  const rows = CT_BODY_TOP.concat([
    'KlmmmmmmmmmmmmdK',
    'KlmzzzzzzmmmmmdK',
    'KlmmzSSSzwmmmmdK',
    'KlmmmzzzwmmzmmdK',
    'KlmmmmmwmmzSzmdK',
    'KlmmmmwmmmzSzmdK',
    'KlmmmwmmmmmwmmdK',
    'KlmmwmmmmmmwmmdK',
    'KlmWmmmmmmmWmmdK',
    'KlmmmmmmmmmmmmdK',
    'KdddddddddddddkK',
    'kKKKKKKKKKKKKKKk',
  ]);
  const img = fromMap(rows, CT); grain(img, 'ctside'); return img;
}

// ---------------- bookshelf ----------------
export function bookshelf() {
  const P = PLANK.oak.map(rgb); const img = planks('oak');
  const R = rng('bookshelf');
  const BOOK = [0x8e2b25, 0x2f4a8a, 0x3c6b2a, 0x7a5a2a, 0x6a3b83, 0xa98a3a, 0x2d6b6b, 0x9a4a1e, 0x5c2a1e];
  for (const [y0, y1] of [[1, 7], [9, 15]]) {
    // shelf back (dark)
    for (let y = y0; y < y1; y++) for (let x = 0; x < N; x++) setP(img, x, y, 0x2a1d10, 255, 0.05);
    let x = 0;
    while (x < 16) {
      const w = R() < 0.2 ? 2 : 1 + (R() < 0.5 ? 1 : 0); const top = y0 + (R() < 0.4 ? 1 : 0) + (R() < 0.15 ? 1 : 0);
      const c = rgb(BOOK[irand(R, BOOK.length)]); const lean = R() < 0.1;
      for (let dx = 0; dx < w && x + dx < 16; dx++) for (let y = top; y < y1; y++) {
        let s = dx === 0 ? 1.12 : dx === w - 1 && w > 1 ? 0.85 : 1;
        if (y === top) s *= 1.15; if ((y - y0) === 2 || (y - y0) === 4) s *= 0.78; // bands on spine
        setP(img, x + dx, y, scalec(c, s), 255, 0.6 + (dx === 0 ? 0.1 : 0));
      }
      x += w + (R() < 0.25 ? 1 : 0); if (lean) x++;
    }
    // shelf boards
  }
  for (let x = 0; x < N; x++) { setP(img, x, 0, P[4], 255, 0.8); setP(img, x, 7, P[3], 255, 0.8); setP(img, x, 8, P[1], 255, 0.6); setP(img, x, 15, P[1], 255, 0.6); }
  return img;
}

// ---------------- chest (block-style) ----------------
const CH = { k: [0x2e1e0e, 0.2], d: [0x6e4a20, 0.55], m: [0x8f6127, 0.7], l: [0xa6742f, 0.8], h: [0xb9853a, 0.88], i: [0xd8d8d8, 1], I: [0x9a9a9a, 0.95], z: [0x3a3a3a, 0.9] };
export function chestTop() {
  const rows = [
    'kkkkkkkkkkkkkkkk',
    'khhhhhhhhhhhhhlk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'kmmmmmmmmmmmmmdk',
    'kkkkkkkkkkkkkkkk',
  ];
  const img = fromMap(rows, CH); grain(img, 'chesttop'); return img;
}
function chestSideRows(front) {
  return [
    'kkkkkkkkkkkkkkkk',
    'khhhhhhhhhhhhhlk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    front ? 'khlmmmmzzmmmmlmk' : 'khlmmmmmmmmmmlmk',
    front ? 'kdddddziIzdddddk' : 'kddddddddddddddk',
    front ? 'kkkkkkzIIzkkkkkk' : 'kkkkkkkkkkkkkkkk',
    front ? 'khhhhhzIIzhhhhlk' : 'khhhhhhhhhhhhhlk',
    front ? 'khllllzzzzllllmk' : 'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'khllllllllllllmk',
    'khlmmmmmmmmmmlmk',
    'khldddddddddddmk',
    'kmmmmmmmmmmmmmdk',
    'kkkkkkkkkkkkkkkk',
  ];
}
export function chestSide(front) {
  const img = fromMap(chestSideRows(front), CH); grain(img, front ? 'chestfront' : 'chestside');
  if (front) for (let i = 0; i < NN; i++) { const o = i * 4; if (img.c[o] === img.c[o + 1] && img.c[o + 1] === img.c[o + 2] && img.c[o + 3]) { setF0(img, i, 1); setSm(img, i, 0.55); } }
  return img;
}

// ---------------- ladder ----------------
export function ladder() {
  const rows = [
    '.lm..........lm.',
    '.ldhhhhhhhhhhld.',
    '.lddmmmmmmmmmld.',
    '.lm..........lm.',
    '.lm..........lm.',
    '.ldhhhhhhhhhhld.',
    '.lddmmmmmmmmmld.',
    '.lm..........lm.',
    '.lm..........lm.',
    '.ldhhhhhhhhhhld.',
    '.lddmmmmmmmmmld.',
    '.lm..........lm.',
    '.lm..........lm.',
    '.ldhhhhhhhhhhld.',
    '.lddmmmmmmmmmld.',
    '.lm..........lm.',
  ];
  return fromMap(rows, { l: [0x9a7b49, 0.85], m: [0x7e6237, 0.7], d: [0x5e4627, 0.5], h: [0xaa8a55, 0.85] });
}
