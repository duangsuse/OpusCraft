// Plants: grass tufts, ferns, flowers, crops, cactus, cane, pumpkin, melon, vine, aquatic plants, mushrooms.
import {
  N, NN, rng, irand, rgb, lum, mixc, scalec, gray, wrap, newImg, cloneImg, setI, setP, getP, shadeP, mapImg,
  fromMap, stamp, normPal, vnoise, white, combine, normalize, blur, rankQuant, paintField, clamp01,
} from './bt_core.js';

const clear = () => { const img = newImg(); for (let i = 0; i < NN; i++) { setI(img, i, [0, 0, 0], 0); img.h[i] = 0; } return img; };
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
function put(img, x, y, c, h = 0.6) { if (!inside(x, y)) return; setP(img, x, y, c, 255, h); }

// ---------------- grass tufts (grayscale, tinted) ----------------
// blade: from (x0, bottom) upward `len` px, curving by `lean` px at the tip
function blade(img, x0, y0, len, lean, grays, wide = false) {
  for (let t = 0; t < len; t++) {
    const p = t / Math.max(1, len - 1); const x = Math.round(x0 + lean * p * p); const y = y0 - t;
    const k = Math.min(grays.length - 1, Math.floor(p * grays.length));
    put(img, x, y, grays[k], 0.4 + p * 0.5);
    if (wide && p < 0.45) put(img, x + 1, y, grays[Math.max(0, k - 1)], 0.4 + p * 0.4);
  }
}
const TUFT_G = [gray(0x6c), gray(0x82), gray(0x96), gray(0xa8), gray(0xbb)];
export function shortGrass() {
  const img = clear();
  const B = [[1, 9, -1], [2, 6, 0], [3, 12, 1], [4, 8, -1], [5, 14, -1], [6, 10, 1], [7, 7, 0], [8, 13, 1], [9, 9, -1], [10, 11, 2], [11, 7, 0], [12, 12, 1], [13, 8, 0], [14, 10, 1], [6, 5, -2], [10, 5, 2]];
  for (const [x, l, lean] of B) blade(img, x, 15, l, lean, TUFT_G, l > 10);
  return img;
}
export function tallGrass(top) {
  const img = clear(); const R = rng(top ? 'tallgt' : 'tallgb');
  if (!top) {
    for (let x = 0; x < 16; x++) { if (x === 0 || x === 15) continue; const l = x % 3 === 1 ? 10 + irand(R, 5) : 16; blade(img, x, 15, l, (R() - 0.5) * 2, [gray(0x70), gray(0x80), gray(0x8e), gray(0x9a), gray(0xa8)], false); }
    for (let k = 0; k < 40; k++) { const x = 1 + irand(R, 14), y = irand(R, 16); if (img.c[(y * N + x) * 4 + 3]) shadeP(img, x, y, R() < 0.5 ? 0.85 : 1.12); }
  } else {
    const B = [[1, 8, -1], [2, 12, 0], [3, 6, 1], [4, 14, -1], [5, 10, 0], [6, 15, 1], [7, 9, -1], [8, 13, 1], [9, 11, 0], [10, 15, -1], [11, 8, 1], [12, 12, 1], [13, 7, 0], [14, 10, 1]];
    for (const [x, l, lean] of B) blade(img, x, 15, l, lean, [gray(0x9a), gray(0xa6), gray(0xb2), gray(0xc0)], false);
  }
  return img;
}
// fern: fronds radiating from base; rachis darker, leaflets lighter pointing upward (herringbone)
function frond(img, x0, y0, x1, y1, g) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  const sx = Math.sign(x1 - x0);
  for (let t = 0; t <= n; t++) {
    const p = t / n; const x = Math.round(x0 + (x1 - x0) * p), y = Math.round(y0 + (y1 - y0) * p);
    put(img, x, y, g[Math.min(2, 1 + (p > 0.7 ? 1 : 0))], 0.5 + p * 0.3);
    if (t >= 2 && t < n && (t % 2 === 0)) {
      const len = p < 0.75 ? 2 : 1;
      for (let k = 1; k <= len; k++) {
        if (sx !== 0) { put(img, x - sx * k, y - k + 1, g[3 + (k === len ? 1 : 0)], 0.65); put(img, x + sx * (k - 1), y - k - 1 + 1 - (k === 1 ? 1 : 0), g[3], 0.6); }
        else { put(img, x - k, y - k + 1, g[3 + (k === len ? 1 : 0)], 0.65); put(img, x + k, y - k + 1, g[3 + (k === len ? 1 : 0)], 0.65); }
      }
    }
  }
  put(img, x1, y1, g[4], 0.8);
}
const FERN_G = [gray(0x5a), gray(0x6e), gray(0x82), gray(0x9e), gray(0xb6)];
export function fern() {
  const img = clear();
  frond(img, 6, 15, 1, 7, FERN_G); frond(img, 9, 15, 14, 6, FERN_G); frond(img, 7, 15, 4, 2, FERN_G); frond(img, 8, 15, 11, 1, FERN_G);
  return img;
}
export function largeFern(top) {
  const img = clear();
  if (top) { frond(img, 6, 15, 1, 4, FERN_G); frond(img, 9, 15, 14, 3, FERN_G); frond(img, 7, 15, 5, 0, FERN_G); frond(img, 8, 15, 10, 1, FERN_G); }
  else { frond(img, 5, 15, 0, 6, FERN_G); frond(img, 10, 15, 15, 5, FERN_G); frond(img, 7, 15, 3, 0, FERN_G); frond(img, 8, 15, 12, 0, FERN_G); frond(img, 7, 15, 7, 0, FERN_G); }
  return img;
}

// ---------------- flowers ----------------
const STEM = { g: [0x4a8a24, 0.6], G: [0x5f9e33, 0.65], D: [0x2f6116, 0.5] };
const F = (rows, pal) => fromMap(rows, Object.assign({}, STEM, pal));
export const FLOWERS = {
  dandelion: () => F([
    '................', '................', '................', '................', '................',
    '......yYy.......', '.....yYWYy......', '.....YWYYo......', '.....yYYoy......', '......yoy.......',
    '.......g........', '....G..g..G.....', '.....G.g.GG.....', '...GGG.gGG......', '....GGGgGGG.....', '......ggg.......',
  ], { y: 0xf5c61b, Y: 0xfee84a, W: 0xfff6a8, o: 0xd99a10 }),
  poppy: () => F([
    '................', '................', '................', '.....rr.Rr......', '....rRRrRRr.....',
    '....rRRkRRr.....', '.....rkKkr......', '....rRRkRRr.....', '.....rrgrr......', '.......g........',
    '.......g.GG.....', '..GG...gG.......', '....G..g........', '.....GGg........', '.......g........', '.......g........',
  ], { r: 0xb4161b, R: 0xe8302a, k: 0x2a1408, K: 0x4f3a0e }),
  blue_orchid: () => F([
    '................', '....bB.....Bb...', '...bBLB...bLBb..', '....BBb....Bb...', '.....g..bB.g....',
    '.....g.bLBbg....', '..bB.g..Bb.g....', '.bLBbg...g.g....', '..Bb.g...gg.....', '......g..g......',
    '......gg.g......', '...G...ggg..G...', '....GG..g..G....', '......G.g.G.....', '.......ggg......', '.......g........',
  ], { b: 0x1a8bc8, B: 0x2bb3ef, L: 0x92e2ff }),
  allium: () => F([
    '................', '.....pPpPp......', '....pPLPpPp.....', '...pPpPLPpPp....', '...PLPpPpPLP....',
    '...pPpPLPpPp....', '....pPpPpPp.....', '.....pPdPp......', '.......g........', '.......g........',
    '.......g........', '.......g........', '..G....g....G...', '...GG..g..GG....', '.....GGgGG......', '.......g........',
  ], { p: 0x9a59c4, P: 0xbd7fe6, L: 0xe2bbf9, d: 0x6e3a8e }),
  azure_bluet: () => F([
    '................', '................', '....w.....w.....', '...wyw...wyw....', '....w..w..w.....',
    '....g.wyw.g..w..', '....g..w..g.wyw.', '.w..g..g..g..w..', 'wyw.g..g.g...g..', '.w..g..g.g...g..',
    '.g...g.g.g..g...', '..g..g.ggg.g....', '...g..gggggg....', '....GggggG......', '...G..ggg..G....', '.......g........',
  ], { w: 0xe8ecf4, y: 0xe8d040 }),
  oxeye_daisy: () => F([
    '................', '................', '.....w.ww.w.....', '....wWwwwwWw....', '...wwwwyywwww...',
    '....wWyYYyWw....', '...wwwyYYywww...', '....wWwyywWw....', '...wwwwwwwww....', '.....w.wg.w.....',
    '.......g........', '.......g........', '....GG.g.GG.....', '.....GGgGG......', '.......g........', '.......g........',
  ], { w: 0xf2f2f2, W: 0xcfcfcf, y: 0xe9b81c, Y: 0xfadf4a }),
  cornflower: () => F([
    '................', '................', '......b..b......', '....b.BbbB.b....', '.....BBLLBB.....',
    '....bBLLLLBb....', '.....BBLLBB.....', '....b.BbbB.b....', '......b.gb......', '.......g........',
    '.......g........', '...G...g...G....', '....GG.g.GG.....', '.....GGgGG......', '.......g........', '.......g........',
  ], { b: 0x3554bf, B: 0x5577ea, L: 0x92adf7 }),
  lily_of_the_valley: () => F([
    '................', '................', '.......gg.......', '.....gg..g......', '....g.w...g.....',
    '...g.wWw...g....', '...w.www..www...', '..wWw.w..wWWw...', '..www.G..www....', '...w.GG...w.G...',
    '....GGG..GG.G...', '...GGGGGGGGG....', '..GGGgGGgGGG....', '...GGgGGgGG.....', '....GGgGgG......', '......ggg.......',
  ], { w: 0xf4f4f0, W: 0xd2d6cc }),
};
function tulip(c) {
  return F([
    '................', '................', '.....a.b.a......', '.....aBbBa......', '.....abBba......',
    '.....aBbBa......', '......aaa.......', '.......g........', '.......g........', '..G....g....G...',
    '..GG...g...GG...', '...GG..g..GG....', '....GG.g.GG.....', '.....GGgGG......', '......GgG.......', '.......g........',
  ], { a: c[0], b: c[1], B: c[2] });
}
FLOWERS.red_tulip = () => tulip([0xa8151b, 0xe0352b, 0xf06a55]);
FLOWERS.orange_tulip = () => tulip([0xc95a12, 0xf08a28, 0xf7b25a]);
FLOWERS.white_tulip = () => tulip([0xb8bcb8, 0xe8ece8, 0xffffff]);
FLOWERS.pink_tulip = () => tulip([0xd06aa0, 0xeea0c8, 0xf9cde3]);

// ---------------- double plants ----------------
const LEAF = { g: [0x4a8a24, 0.6], G: [0x64a336, 0.65], D: [0x2f6116, 0.5], L: [0x7fbf4a, 0.7] };
const BUSH_BOTTOM = [
  '..G..........G..', '.GG...G..G...GG.', '.GgG..GG.G..GgG.', '..GgG..GgG.GgG..', '.L.GgG.Gg.GgG.L.',
  '.GL.GgGgGgGg.LG.', '..GL.GggggG.LG..', '...GGgGggGgGG...', '.L..GgggggggG.L.', '.GLG.GgggggGLGG.',
  '..GGGgGgggGgGG..', '...GgGgDgDgGg...', '..GLGgGDgDGgGL..', '.GGLGGgDgDgGGLG.', '..GGGgGgDgGgGG..', '....GGgDgDgG....',
];
export function bushBottom() { return fromMap(BUSH_BOTTOM, LEAF); }
function bushTop(flowerPal, rows) { return fromMap(rows, Object.assign({}, LEAF, flowerPal)); }
export const DOUBLE = {
  lilac_top: () => bushTop({ p: 0xb07ab8, P: 0xd4a4d8, W: 0xeed4f0, d: 0x7e4f8a }, [
    '................', '.....pP..Pp.....', '....pPWP.PWPp...', '...pPdPpPpPdPp..', '..pPWPpPdPWPp...',
    '..PpPdPPWPpPdp..', '...pPWPdPpPWp...', '..pPdPpPWPdPp...', '...PpPWPpPdPp...', '....pPdgPpPp....',
    '.....pPgPdp.....', '.......g..G.....', '...G...g.GG.....', '....GG.gG.......', '.....GGgG.......', '.......g........',
  ]),
  rose_bush_top: () => bushTop({ r: 0xa8121e, R: 0xd9283a, W: 0xf06a76 }, [
    '................', '................', '...rR.....Rr....', '..rRWR...rWRr...', '..RRrr.G.rRRR...',
    '...rgGGgGGgr....', '.GGGgGgGgGgGG...', '.GgGrRgGgGRrGg..', '..GrRWRGgRWRrG..', '..GgRRrgGrRRgG..',
    '.GGgGgGgGgGgGGG.', '..GgGLGgGLGgGG..', '.GGLgGgggGgGLGG.', '..GGgGgggGgGGg..', '...GgGgggGgGG...', '....GGgggGGG....',
  ]),
  rose_bush_bottom: () => bushBottom(),
  peony_top: () => bushTop({ p: 0xc78bc4, P: 0xe6b5e4, W: 0xf8e2f6, d: 0x9a5e98 }, [
    '................', '................', '....pPPp........', '...pPWWPp..pPp..', '..pPWPPWPppPWPp.',
    '..pPPdPPpPPWPPp.', '...pPdPpGpPdPp..', '....ppGgGgpPp...', '.GG..GgGgG..GG..', '.GgG.GgggG.GgG..',
    '..GgGgGgGgGgG...', '.L.GgGgggGgG.L..', '.GL.GgggggG.LG..', '..GLGgGgGgGLG...', '...GGgGgGgGG....', '....GgggggG.....',
  ]),
  peony_bottom: () => bushBottom(),
  lilac_bottom: () => bushBottom(),
};
export function sunflower(part) {
  if (part === 'front') return fromMap([
    '................', '.....y.yy.y.....', '...yyYyYYyYyy...', '..yYYyYYYYyYYy..', '.yYYYybbbbyYYYy.',
    '..yYybBbbBbyYy..', '.yYYbbkBbbkbYYy.', '.yYybBbkkbBbyYy.', '.yYYbbBbbBbbYYy.', '.yYybkbbBbkbyYy.',
    '..yYbbbBbbbbYy..', '.yYYYybbbbyYYYy.', '..yYYyYYYYyYYy..', '...yyYyYYyYyy...', '.....y.yy.y.....', '................',
  ], { y: 0xf2b417, Y: 0xfddc3a, b: 0x6b4512, B: 0x8a5c1c, k: 0x3e2508 });
  if (part === 'back') return fromMap([
    '................', '.....y.yy.y.....', '...yyGyGGyGyy...', '..yGGgGGGGgGGy..', '.yGGgGGggGGgGGy.',
    '..GGgGggggGgGG..', '.yGgGgggggggGgy.', '.yGGggggggggGGy.', '.yGgGgggggggGgy.', '.yGGgGggggGgGGy.',
    '..GGgGGggGGgGG..', '.yGGgGGggGGgGGy.', '..yGGgGGGGgGGy..', '...yyGyGGyGyy...', '.....y.yy.y.....', '................',
  ], { y: 0xf2b417, G: 0x5c9a30, g: 0x4a8226 });
  if (part === 'top') return fromMap([
    '................', '................', '................', '................', '................',
    '................', '................', '................', '.......g........', '.......g........',
    '.......gGG......', '.......gGGG.....', '.......g.GGG....', '.......g..GG....', '.......g........', '.......g........',
  ], LEAF);
  return fromMap([
    '.......g........', '.......g........', '...GG..g........', '..GGGG.g........', '...GGGGg........',
    '.......g..GG....', '.......gGGGG....', '.......gGGG.....', '.......g........', '..G....g........',
    '..GGG..g........', '...GGGGg....G...', '.......g..GGG...', '.......gGGG.....', '.......g........', '.......g........',
  ], LEAF);
}

// ---------------- misc plants ----------------
export function deadBush() {
  return fromMap([
    '................', '..b.......b.....', '...b..b..b...b..', '....b.b.b...b...', '.b...bbb...b....',
    '..b...b...b..b..', '...bb.b..b..b...', '.....bbbbbbb....', '..bb...bb.......', '....bb.b..bb....',
    '......bbbb..b...', '.......bb.......', '.......b........', '.......B........', '.......B........', '.......B........',
  ], { b: 0x8c5a24, B: 0x6b421a });
}
const CAC = [0x0b4a0f, 0x135c18, 0x1d7024, 0x2a8530, 0x3d9a40, 0x5aad5a];
export function cactusSide() {
  const img = clear(); const R = rng('cactus');
  const colk = [0, 3, 2, 4, 3, 2, 1, 3, 4, 2, 3, 2, 1, 3, 2, 0];
  for (let y = 0; y < N; y++) for (let x = 1; x < 15; x++) { let k = colk[x]; if (R() < 0.15) k = Math.max(1, k - 1); setP(img, x, y, CAC[k], 255, 0.4 + k * 0.1); }
  // spines
  for (const [x, y] of [[2, 1], [6, 3], [10, 2], [13, 5], [3, 7], [8, 8], [12, 10], [4, 12], [9, 13], [1, 14], [13, 14]]) { setP(img, x, y, 0x101410, 255, 0.95); setP(img, x, y - 1, 0xd8d8c8, 255, 1); }
  for (let y = 0; y < N; y++) { setP(img, 1, y, CAC[1], 255, 0.4); setP(img, 14, y, CAC[1], 255, 0.4); }
  return img;
}
export function cactusTop(bottom) {
  const img = clear(); const R = rng(bottom ? 'cacb' : 'cact');
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let k = d > 6 ? 1 : d > 5 ? 3 : d > 3 ? 4 : d > 1.5 ? 3 : 5; if (bottom) k = Math.max(0, k - 1); if (R() < 0.15) k = Math.max(0, k - 1);
    setP(img, x, y, CAC[k], 255, 0.4 + k * 0.1);
  }
  if (!bottom) for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11], [7, 2], [2, 8], [13, 7], [8, 13]]) setP(img, x, y, 0xd8d8c8, 255, 1);
  return img;
}
export function sugarCane() {
  const img = clear();
  const stalks = [[2, [3, 9, 14]], [7, [1, 6, 12]], [12, [4, 10, 15]]];
  for (const [x, nodes] of stalks) for (let y = 0; y < N; y++) {
    const node = nodes.includes(y);
    setP(img, x, y, node ? gray(0x7a) : gray(0xc4), 255, node ? 0.5 : 0.8); setP(img, x + 1, y, node ? gray(0x68) : gray(0xa2), 255, node ? 0.45 : 0.7);
  }
  // leaves
  const L = [[4, 2, 1], [9, 8, -1], [14, 13, -1], [1, 11, 1], [6, 4, 1], [11, 0, 1]];
  for (const [x, y, d] of L) { setP(img, x, y, gray(0xa8), 255, 0.6); setP(img, x + d, y - 1, gray(0x96), 255, 0.6); setP(img, x + 2 * d, y - 1, gray(0x86), 255, 0.6); }
  return img;
}
const PUMP = [0x8a4a0a, 0xb8620f, 0xcf7618, 0xe38a1d, 0xee9c2c, 0xf6b04a];
export function pumpkinSide() {
  const img = newImg(); const R = rng('pumpkin');
  const colk = [1, 3, 4, 4, 3, 2, 3, 4, 5, 4, 3, 2, 3, 4, 4, 3];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let k = colk[x]; if (y === 0 || y === 15) k = Math.max(0, k - 1); if (R() < 0.18) k = Math.max(1, Math.min(5, k + (R() < 0.5 ? -1 : 1)));
    setP(img, x, y, PUMP[k], 255, 0.4 + k * 0.1);
  }
  return img;
}
export function pumpkinTop() {
  const img = newImg(); const R = rng('pumpkintop');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - 7.5, dy = y - 7.5; const d = Math.hypot(dx, dy); const a = Math.atan2(dy, dx);
    let k = 3 + Math.round(Math.cos(a * 8) * 0.8) - (d > 7 ? 1 : 0); if (R() < 0.15) k--; k = Math.max(0, Math.min(5, k));
    setP(img, x, y, PUMP[k], 255, 0.4 + k * 0.1);
  }
  stamp(img, ['.ss.', 'sSSs', 'sSSs', '.ss.'], { s: [0x5a4a1a, 0.9], S: [0x7a6a2a, 1] }, 6, 6);
  return img;
}
export function carvedPumpkin(lit) {
  const img = pumpkinSide();
  const face = [
    '................', '................', '................', '................',
    '...o......o.....', '..ooo....ooo....', '.ooooo..ooooo...', '................',
    '..o..........o..', '..oo.oooooo.oo..', '..oooooooooooo..', '...oooo..oooo...', '.....oo..oo.....', '................', '................', '................',
  ];
  const P = lit ? { o: [0xffd34a, 0.1, 1] } : { o: [0x3a1d05, 0.05] };
  stamp(img, face.map((r) => r.replace(/\./g, ' ')), P, 0, 0);
  if (lit) { // inner gradient
    for (let i = 0; i < NN; i++) if (img.e[i] > 0) {
      const y = (i / N) | 0, x = i % N; const above = img.e[i - N] > 0, below = i + N < NN && img.e[i + N] > 0;
      setI(img, i, rgb(!above ? 0xfff2a0 : !below ? 0xf5b02a : (x + y) % 3 ? 0xffd94e : 0xffe470));
    }
  }
  return img;
}
const MEL = [0x2f5a0c, 0x47740f, 0x5a8a18, 0x6e9e22, 0x88b42e, 0xa5c84a];
export function melonSide() {
  const img = newImg(); const R = rng('melon');
  const colk = [1, 3, 4, 2, 5, 3, 1, 4, 3, 5, 2, 3, 4, 1, 4, 3];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let k = colk[x]; if (R() < 0.2) k = Math.max(0, Math.min(5, k + (R() < 0.5 ? -1 : 1))); setP(img, x, y, MEL[k], 255, 0.4 + k * 0.1); }
  return img;
}
export function melonTop() {
  const img = newImg(); const R = rng('melontop');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); const ring = Math.floor(d) % 3;
    let k = ring === 0 ? 4 : ring === 1 ? 2 : 3; if (R() < 0.2) k = Math.max(0, k - 1);
    setP(img, x, y, MEL[k], 255, 0.4 + k * 0.1);
  }
  stamp(img, ['ss', 'ss'], { s: [0x5a6a1a, 1] }, 7, 7);
  return img;
}
export function lilyPad() {
  const img = clear(); const R = rng('lily');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x - 7.5, dy = y - 7.5; const d = Math.hypot(dx, dy); const a = Math.atan2(dy, dx);
    if (d > 7.3) continue; if (a > 0.95 && a < 1.65 && d > 1) continue; // notch
    let v = 0xa4 + Math.round(R() * 22);
    if (d > 6.3) v -= 22; if (Math.abs(Math.sin(a * 3)) < 0.18 && d > 1.5) v += 24; // veins
    v = Math.min(255, v);
    setP(img, x, y, gray(v), 255, 0.5 + (d < 6.3 ? 0.1 : 0));
  }
  return img;
}
function line(img, pts, c, h) {
  for (let k = 0; k + 1 < pts.length; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1]; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let t = 0; t <= n; t++) setP(img, Math.round(x0 + (x1 - x0) * t / n), Math.round(y0 + (y1 - y0) * t / n), c, 255, h);
  }
}
export function vine() {
  const img = clear(); const R = rng('vine4');
  const stem = gray(0x58);
  line(img, [[1, 0], [3, 2], [5, 4], [6, 7], [5, 9], [3, 11], [2, 13], [1, 15]], stem, 0.5);
  line(img, [[12, 0], [10, 2], [10, 4], [12, 6], [13, 9], [12, 12], [12, 15]], stem, 0.5);
  line(img, [[6, 7], [8, 8], [10, 8]], stem, 0.5);
  const LS = [['ab', 'cd'], ['.ab', 'abc', '.cd'], ['ab.', 'bcd'], ['.a', 'bc', 'cd']];
  const G = { a: gray(0xc4), b: gray(0xa6), c: gray(0x8a), d: gray(0x6c) };
  const spots = [[2, 3], [6, 2], [3, 7], [0, 10], [3, 14], [8, 0], [13, 3], [8, 5], [11, 9], [14, 11], [9, 12], [14, 14], [6, 11], [15, 7]];
  for (const [x, y] of spots) {
    const sh = LS[irand(R, LS.length)];
    for (let yy = 0; yy < sh.length; yy++) for (let xx = 0; xx < sh[yy].length; xx++) { const ch = sh[yy][xx]; if (ch !== '.') setP(img, x + xx, y + yy, G[ch], 255, 0.6 + (ch === 'a' ? 0.25 : ch === 'b' ? 0.15 : 0)); }
  }
  return img;
}
const SEA = [0x1f6a2a, 0x2a7f34, 0x37953f, 0x48aa4c, 0x5cbf5c];
export function seagrass(kind) {
  const img = clear();
  const B = kind === 'tall_bottom' ? [[2, 16, 1], [5, 16, -1], [8, 16, 1], [11, 16, -1], [13, 16, 1], [4, 16, 0], [10, 16, 0]]
    : kind === 'tall_top' ? [[2, 9, 1], [5, 14, -1], [8, 12, 1], [11, 15, -1], [13, 8, 1], [4, 6, 0]]
      : [[3, 12, 1], [5, 9, -1], [7, 14, 1], [9, 11, -1], [11, 13, 1], [13, 8, -1], [2, 6, 0]];
  for (const [x, l, lean] of B) blade(img, x, 15, l, lean * 2, SEA, false);
  return img;
}
export function kelp(plant) {
  const K = { s: [0x5c8a28, 0.7], S: [0x416a1c, 0.6], L: [0x78a83a, 0.75], l: [0x568a26, 0.65], B: [0xc2b44a, 0.9], b: [0x8e8228, 0.8] };
  const rows = plant ? [
    '.......sS.......', '....LL.sS.......', '...LllLsS.......', '......lsSb......', '.......sSBlL....',
    '.......sS.llL...', '.......sS...L...', '......bsS.......', '...LlBlsS.......', '..Llll.sS.......',
    '..L....sSb......', '.......sSBlL....', '.......sS.lllL..', '.......sS....L..', '......bsS.......', '......BsS.......',
  ] : [
    '................', '................', '.........L......', '........Ll......', '........sl......',
    '....LL.sS.......', '...LllLsS.......', '......lsS.......', '.......sSb......', '.......sSBlL....',
    '.......sS.lllL..', '.......sS....L..', '......bsS.......', '..LllBlsS.......', '..L....sS.......', '.......sS.......',
  ];
  return fromMap(rows, K);
}
export function mushroom(red) {
  if (red) return fromMap([
    '................', '................', '................', '................', '.....rrrrrr.....',
    '....rRwRRwRr....', '...rRRRRwRRRr...', '...rwRRRRRRwr...', '...dddddddddd...', '......sSs.......',
    '......sSs.......', '......sSs.......', '......sSs.......', '......tSt.......', '................', '................',
  ], { r: 0xa8121a, R: 0xd9281e, w: 0xf0e8e8, d: 0x7a0e12, s: 0xd8ccb8, S: 0xece2d2, t: 0xb8a890 });
  return fromMap([
    '................', '................', '................', '................', '................',
    '................', '.....bBBBBb.....', '....bBLBBBBb....', '....dddddddd....', '.......sS.......',
    '.......sS.......', '.......sS.......', '.......sS.......', '.......tS.......', '................', '................',
  ], { b: 0x8a6448, B: 0xa47e5e, L: 0xbc9878, d: 0x6a4a34, s: 0xd2c4b0, S: 0xe6dccb, t: 0xb4a490 });
}
export function pinkPetals(stem) {
  if (stem) return fromMap([
    '................', '................', '................', '................', '................', '................',
    '....g.......g...', '....g.......g...', '....g.......g...', '....g.......g...', '................', '................',
    '................', '................', '................', '................',
  ], { g: [0x5a8a2a, 0.6] });
  return fromMap([
    '................', '..pP........Pp..', '.pPWPp....pPWPp.', '..PPp......pPP..', '...p...gg...p...',
    '......g..g......', '...............', '..g..........g..', '..g..........g..', '................',
    '...p.......pP...', '.pPWP.....pPWPp.', '..PpP......PPp..', '...p.....g..p...', '........g.......', '................',
  ], { p: 0xe58ab8, P: 0xf5b4d6, W: 0xfde4f0, g: 0x5a8a2a });
}

// ---------------- crops ----------------
export function wheat(stage) {
  const img = clear();
  const xs = [1, 4, 7, 10, 13], off = [-2, 0, -1, -3, 0];
  const H = [3, 5, 7, 9, 10, 12, 13, 14][stage];
  const ripe = Math.max(0, (stage - 4) / 3);
  const stalkC = mixc(rgb(0x3f9a1a), rgb(0xb08a3a), ripe), leafC = mixc(rgb(0x58b028), rgb(0xc8a448), ripe);
  for (let s = 0; s < 5; s++) {
    const x = xs[s], hh = Math.max(1, H + Math.round(off[s] * (0.4 + stage / 10)));
    for (let t = 0; t < hh; t++) {
      const y = 15 - t; setP(img, x, y, t === 0 ? scalec(stalkC, 0.75) : stalkC, 255, 0.5 + t * 0.02);
      if (t > 0 && t % 3 === (s % 3) && t < hh - 1) setP(img, x + ((t + s) % 2 ? 1 : -1), y - 1, leafC, 255, 0.55);
    }
    if (stage >= 4) {
      const top = 16 - hh; const ear = stage === 7 ? [0xe0c070, 0xb8903a, 0x8a6424] : stage >= 5 ? mixc(rgb(0xb8c050), rgb(0xd8b860), stage - 5).map(Math.round) : [0x78b838, 0x5a9a28, 0x3e7a1a];
      const E = Array.isArray(ear[0]) ? ear : ear.length === 3 && typeof ear[0] === 'number' && ear[0] > 255 ? ear.map(rgb) : null;
      const cols = E || [rgb(0xd0c860), ear, scalec(ear, 0.75)];
      const len = Math.min(stage >= 6 ? 5 : 4, hh);
      for (let t = 0; t < len; t++) {
        const y = top + t;
        setP(img, x, y, cols[t % 2 ? 1 : 0], 255, 0.85);
        setP(img, x + (t % 2 ? -1 : 1), y, cols[t % 2 ? 2 : 1], 255, 0.75);
      }
    }
  }
  return img;
}
