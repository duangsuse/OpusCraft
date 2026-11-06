// Procedural entity skins (recreations of the Java 1.20 look; no Mojang assets). Pure JS, no DOM.
// paintEntityTextures() -> { [name]: { w, h, data: Uint8ClampedArray (RGBA, row-major) } }
// Layouts follow the UVs in ./models.js (vanilla box-UV layout, plus the documented custom spots for the
// baked quadruped bodies and the boat). Alpha 0 = hole (render with alpha test).

// ------------------------------------------------------------------ small painting kit
function rng(seed) {
  let s = 2166136261 >>> 0;
  for (const ch of String(seed)) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (h, a = 255) => [(h >> 16) & 255, (h >> 8) & 255, h & 255, a];
const CLEAR = [0, 0, 0, 0];
const scale = (c, f) => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f), c[3] ?? 255];

class Img {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
  set(x, y, c) {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3] ?? 255;
  }
  get(x, y) { const i = (y * this.w + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]; }
  // fn(lx, ly, rect) -> colour | null(=leave) ; rect = {x,y,w,h}
  fill(r, fn) { for (let ly = 0; ly < r.h; ly++) for (let lx = 0; lx < r.w; lx++) this.set(r.x + lx, r.y + ly, fn(lx, ly, r)); }
  // apply a brightness factor to already painted pixels
  shade(r, fn) {
    for (let ly = 0; ly < r.h; ly++) for (let lx = 0; lx < r.w; lx++) {
      const f = fn(lx, ly, r); if (f === 1) continue;
      const c = this.get(r.x + lx, r.y + ly); if (!c[3]) continue;
      this.set(r.x + lx, r.y + ly, scale(c, f));
    }
  }
  out() { return { w: this.w, h: this.h, data: this.data }; }
}

// Box-UV face rectangles for a cube of size (w,h,d) at texture offset (u,v).
function box(u, v, w, h, d) {
  return {
    top: { x: u + d, y: v, w, h: d }, bottom: { x: u + d + w, y: v, w, h: d },
    right: { x: u, y: v + d, w: d, h }, front: { x: u + d, y: v + d, w, h },
    left: { x: u + d + w, y: v + d, w: d, h }, back: { x: u + 2 * d + w, y: v + d, w, h },
  };
}
const SIDES = ['right', 'front', 'left', 'back'];
const ALL = ['top', 'bottom', ...SIDES];

// Weighted palette sampler: pal = [[colour, weight], ...] or [colour, ...]
function sampler(pal, R) {
  const items = pal.map(p => (Array.isArray(p) && Array.isArray(p[0]) ? p : [p, 1]));
  const tot = items.reduce((s, [, w]) => s + w, 0);
  return () => { let r = R() * tot; for (const [c, w] of items) { if ((r -= w) <= 0) return c; } return items[items.length - 1][0]; };
}
const noiseFill = (img, r, pal, R) => { const s = sampler(pal, R); img.fill(r, () => s()); };

// Pixel-art stamp: rows of chars, map char -> colour | colour[] (random) | fn(lx,ly) | undefined/'.'(=skip).
function art(img, r, rows, map, R, flip = false) {
  for (let ly = 0; ly < rows.length; ly++) for (let lx = 0; lx < rows[ly].length; lx++) {
    const ch = rows[ly][flip ? rows[ly].length - 1 - lx : lx];
    if (ch === '.' || ch === ' ') continue;
    let c = map[ch];
    if (c === undefined) continue;
    if (typeof c === 'function') c = c(lx, ly);
    else if (Array.isArray(c) && Array.isArray(c[0])) c = c[(R() * c.length) | 0];
    img.set(r.x + lx, r.y + ly, c);
  }
}
const palette = (...hs) => hs.map(h => hex(h));

// Smooth-ish value noise in [0,1] on an integer lattice of cell size `cell` (wraps per seed).
function valueNoise(R, cell) {
  const cache = new Map();
  const lat = (i, j) => { const k = i * 7919 + j; if (!cache.has(k)) cache.set(k, R()); return cache.get(k); };
  return (x, y) => {
    const fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const a = lat(i, j), b = lat(i + 1, j), c = lat(i, j + 1), d = lat(i + 1, j + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// ------------------------------------------------------------------ player (Steve-like)
function paintPlayer() {
  const img = new Img(64, 64), R = rng('steve');
  const H = palette(0x2b1d0e, 0x30200f, 0x3a2812, 0x271a0b, 0x2b1d0e);
  const Hl = hex(0x46301a);
  const S = palette(0xb4846d, 0xb98a70, 0xaa7d66, 0xb4846d, 0xbd8e74);
  const Sd = hex(0x9c6c55), Sdd = hex(0x8a5c46);
  const T = palette(0x00afaf, 0x00a8a8, 0x00b4b4, 0x00a3a3, 0x00afaf);
  const Td = hex(0x008f8f), Tl = hex(0x2cc5c5);
  const P = palette(0x463aa5, 0x3f349a, 0x4a3fae, 0x433799);
  const Pd = hex(0x342a80), Pl = hex(0x5549b8);
  const G = palette(0x6b6b6b, 0x646464, 0x737373);
  const Gd = hex(0x4f4f4f);
  const map = {
    H, h: Hl, S, s: Sd, e: Sdd, W: hex(0xffffff), I: hex(0x523d89), N: hex(0x94624a), M: hex(0x6a4030), m: hex(0x7e4c38),
    T, t: Td, l: Tl, P, p: Pd, q: Pl, G, g: Gd,
  };
  // head 8x8x8 @ (0,0)
  const hd = box(0, 0, 8, 8, 8);
  art(img, hd.top, [
    'HHHHHHHH', 'HHHhHHHH', 'HHHHHHhH', 'HhHHHHHH', 'HHHHHHHH', 'HHHHhHHH', 'HHHHHHHH', 'HHHHHHHH'], map, R);
  art(img, hd.bottom, [
    'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'sSSSSSSs', 'ssSSSSss', 'ssssssss'], map, R);
  art(img, hd.front, [
    'HHHHHHHH',
    'HHHHHHHH',
    'HSSSSSSH',
    'SSSSSSSS',
    'SWISSIWS',
    'SSSNNSSS',
    'SSMmmMSS',
    'SSSSSSSS'], map, R);
  const side = [
    'HHHHHHHH',
    'HHHHHHHH',
    'HHHHHHHH',
    'HHHHSSSS',
    'HHHseSSS',
    'HHHssSSS',
    'HHHSSSSS',
    'HHSSSSSS'];
  art(img, hd.right, side, map, R);           // right side: texture-left = back
  art(img, hd.left, side, map, R, true);      // left side: texture-left = front
  art(img, hd.back, [
    'HHHHHHHH', 'HHHHhHHH', 'HHHHHHHH', 'HhHHHHHH', 'HHHHHHhH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH'], map, R);

  // body 8x12x4 @ (16,16)
  const bd = box(16, 16, 8, 12, 4);
  noiseFill(img, bd.top, T, R);
  img.fill(bd.top, (x, y) => (x >= 3 && x <= 4 && y >= 1 && y <= 2 ? S[0] : null));
  noiseFill(img, bd.bottom, P, R);
  const shirt = (x, y, w) => (y >= 10 ? (y === 10 ? Pl : P[(R() * P.length) | 0]) : (y === 9 ? Td : T[(R() * T.length) | 0]));
  for (const f of SIDES) img.fill(bd[f], (x, y, r) => shirt(x, y, r.w));
  art(img, bd.front, ['...SS...', '...tt...'], map, R);
  img.fill(bd.front, (x, y) => (y >= 2 && y <= 8 && (x === 0 || x === 7) && R() < 0.5 ? Td : null));

  // arms 4x12x4 @ (40,16) right, (32,48) left
  for (const [u, v] of [[40, 16], [32, 48]]) {
    const a = box(u, v, 4, 12, 4);
    noiseFill(img, a.top, T, R);
    noiseFill(img, a.bottom, S, R);
    img.shade(a.bottom, () => 0.92);
    for (const f of SIDES) img.fill(a[f], (x, y) => (y < 4 ? (y === 3 ? Td : T[(R() * T.length) | 0]) : (y === 11 ? Sd : S[(R() * S.length) | 0])));
  }
  // legs 4x12x4 @ (0,16) right, (16,48) left
  for (const [u, v] of [[0, 16], [16, 48]]) {
    const l = box(u, v, 4, 12, 4);
    noiseFill(img, l.top, P, R);
    noiseFill(img, l.bottom, [Gd, G[0]], R);
    for (const f of SIDES) img.fill(l[f], (x, y) => (y >= 9 ? (y === 11 ? Gd : G[(R() * G.length) | 0]) : y === 8 ? Pd : P[(R() * P.length) | 0]));
    img.fill(l.front, (x, y) => (y < 8 && x === 1 && R() < 0.4 ? Pd : null));
  }
  return img.out();
}

// ------------------------------------------------------------------ zombie (64x64 humanoid)
function paintZombie() {
  const img = new Img(64, 64), R = rng('zombie');
  const Z = palette(0x5a8a42, 0x52823c, 0x649449, 0x5a8a42, 0x4f7d3a);
  const Zl = hex(0x76a85a), Zd = hex(0x416e30), Zdd = hex(0x2f5323);
  const T = palette(0x00a0a0, 0x009696, 0x00aaaa, 0x009a9a);
  const Td = hex(0x007878);
  const P = palette(0x3d3790, 0x37318a, 0x433d98);
  const Pd = hex(0x2c2770);
  const G = palette(0x4b4b4b, 0x444444, 0x525252);
  const map = { Z, z: Zd, x: Zdd, l: Zl, K: hex(0x0b0f0a), k: hex(0x1f2b1a), N: hex(0x416b2f), M: hex(0x2f5124), T, t: Td, P, p: Pd };
  const hd = box(0, 0, 8, 8, 8);
  // head: mottled green with darker "hair" patches on top
  const n = valueNoise(R, 2.5);
  for (const f of ALL) img.fill(hd[f], (x, y, r) => {
    const v = n(r.x + x, r.y + y) + (R() - 0.5) * 0.35;
    return v < 0.28 ? Zd : v > 0.78 ? Zl : Z[(R() * Z.length) | 0];
  });
  img.fill(hd.top, () => (R() < 0.35 ? Zd : R() < 0.15 ? Zdd : null));
  art(img, hd.front, [
    'zzZzzZzz',
    'z......z',
    '........',
    '........',
    '.KK..KK.',
    '.zz.....',
    '..xNNx..',
    '..MMMM..'], map, R);
  img.set(hd.front.x + 5, hd.front.y + 5, Zd); img.set(hd.front.x + 6, hd.front.y + 5, Zd);
  for (const f of ['right', 'left', 'back']) img.fill(hd[f], (x, y) => (y < 2 && R() < 0.45 ? Zd : null));
  // body 8x12x4 @ (16,16): shirt (ragged hem showing skin) + pants
  const bd = box(16, 16, 8, 12, 4);
  noiseFill(img, bd.top, T, R);
  noiseFill(img, bd.bottom, P, R);
  const hem = [9, 8, 9, 9, 8, 9, 10, 9, 8, 9, 9, 10, 9, 8, 9, 9, 10, 9, 9, 8, 9, 9, 8, 9];
  let hx = 0;
  for (const f of SIDES) {
    const r = bd[f];
    for (let x = 0; x < r.w; x++) {
      const e = hem[hx++ % hem.length];
      for (let y = 0; y < 12; y++) {
        let c;
        if (y >= 10) c = y === 10 ? Pd : P[(R() * P.length) | 0];
        else if (y >= e) c = R() < 0.3 ? Zd : Z[(R() * Z.length) | 0];
        else if (y === e - 1) c = Td;
        else c = R() < 0.08 ? Td : T[(R() * T.length) | 0];
        img.set(r.x + x, r.y + y, c);
      }
    }
  }
  art(img, bd.front, ['...ZZ...', '...t....'], map, R);
  // arms 4x12x4 @ (40,16): ragged sleeve at the shoulder then green skin
  const a = box(40, 16, 4, 12, 4);
  noiseFill(img, a.top, T, R);
  noiseFill(img, a.bottom, [Zd, Z[0], Z[1]], R);
  const sleeve = [3, 2, 3, 2, 1, 2, 3, 3, 2, 3, 2, 2, 3, 2, 3, 2];
  let k = 0;
  for (const f of SIDES) {
    const r = a[f];
    for (let x = 0; x < r.w; x++) {
      const s = sleeve[k++ % sleeve.length];
      for (let y = 0; y < 12; y++) {
        const c = y < s ? (y === s - 1 ? Td : T[(R() * T.length) | 0]) : y === 11 ? Zd : (R() < 0.12 ? Zd : R() < 0.1 ? Zl : Z[(R() * Z.length) | 0]);
        img.set(r.x + x, r.y + y, c);
      }
    }
  }
  // legs 4x12x4 @ (0,16)
  const l = box(0, 16, 4, 12, 4);
  noiseFill(img, l.top, P, R);
  noiseFill(img, l.bottom, G, R);
  for (const f of SIDES) img.fill(l[f], (x, y) => (y >= 10 ? G[(R() * G.length) | 0] : y === 9 ? Pd : R() < 0.1 ? Pd : P[(R() * P.length) | 0]));
  return img.out();
}

// ------------------------------------------------------------------ skeleton (64x32)
function paintSkeleton() {
  const img = new Img(64, 32), R = rng('skeleton');
  const B = palette(0xc6c6c6, 0xc1c1c1, 0xcbcbcb, 0xbcbcbc, 0xc6c6c6);
  const Bd = hex(0x9a9a9a), Bdd = hex(0x7a7a7a), Bl = hex(0xd8d8d8);
  const D = hex(0x2e2e2e), Dm = hex(0x4a4a4a);
  const map = { B, b: Bd, c: Bdd, l: Bl, D, d: Dm };
  const hd = box(0, 0, 8, 8, 8);
  for (const f of ALL) noiseFill(img, hd[f], [[B[0], 5], [B[1], 3], [B[2], 3], [B[3], 1], [Bd, 0.25]], R);
  art(img, hd.front, [
    '........',
    '........',
    '........',
    '.DD..DD.',
    '.dd..dd.',
    '...cc...',
    '.cBcBcB.',
    '.bbbbbb.'], map, R);
  img.shade(hd.bottom, () => 0.85);
  art(img, hd.back, ['........', '........', '........', '........', '........', '...b....', '....bb..', 'bbbbbbbb'], map, R);
  // body 8x12x4 @ (16,16): see-through ribcage
  const bd = box(16, 16, 8, 12, 4);
  noiseFill(img, bd.top, B, R);
  noiseFill(img, bd.bottom, B, R);
  img.fill(bd.top, (x, y) => (y >= 1 && y <= 2 && x >= 2 && x <= 5 ? CLEAR : null));
  img.fill(bd.bottom, (x, y) => (y >= 1 && y <= 2 && x >= 2 && x <= 5 ? CLEAR : null));
  art(img, bd.front, ([
    'BBBBBBBB',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '...BB...',
    '...BB...',
    'bBBBBBBb',
    'BBb..bBB']), map, R);
  art(img, bd.back, ([
    'BBBBBBBB',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '.bBBBBb.',
    '...BB...',
    '...BB...',
    '...BB...',
    'bBBBBBBb',
    'BBb..bBB']), map, R);
  const sideRibs = ['BBBB', '....', 'BBBB', '....', 'BBBB', '....', 'BBBB', '....', '....', '....', 'BBBB', 'BBBB'];
  art(img, bd.right, sideRibs, map, R);
  art(img, bd.left, sideRibs, map, R);
  // limbs 2x12x2 @ (40,16) arm, (0,16) leg
  for (const [u, v] of [[40, 16], [0, 16]]) {
    const l = box(u, v, 2, 12, 2);
    noiseFill(img, l.top, B, R);
    noiseFill(img, l.bottom, [Bd, B[0]], R);
    for (const f of SIDES) img.fill(l[f], (x, y) => (y === 5 || y === 6 ? (x === 0 ? Bd : Bl) : y === 11 ? Bd : x === 1 && R() < 0.4 ? Bd : B[(R() * B.length) | 0]));
  }
  return img.out();
}

// ------------------------------------------------------------------ creeper (64x32)
function creeperPal(R) {
  const n1 = valueNoise(R, 2), n2 = valueNoise(R, 5);
  const P = palette(0x1e4f1b, 0x2c6d27, 0x3b8f33, 0x4ba640, 0x5dc04e, 0x7fd06f, 0xaedca6);
  const grey = hex(0x8f9e8a);
  return (gx, gy) => {
    const v = n1(gx, gy) * 0.55 + n2(gx + 31, gy) * 0.25 + R() * 0.45;
    if (R() < 0.035) return grey;
    const k = Math.max(0, Math.min(P.length - 1, Math.floor((v - 0.12) * 7.2)));
    return P[k];
  };
}
function paintCreeper() {
  const img = new Img(64, 32), R = rng('creeper');
  const camo = creeperPal(R);
  const cubes = [box(0, 0, 8, 8, 8), box(16, 16, 8, 12, 4), box(0, 16, 4, 6, 4)];
  for (const b of cubes) for (const f of ALL) img.fill(b[f], (x, y, r) => camo(r.x + x, r.y + y));
  art(img, cubes[0].front, [
    '........',
    '........',
    '.KK..KK.',
    '.Kk..kK.',
    '...KK...',
    '..KKKK..',
    '..KKKK..',
    '..K..K..'], { K: hex(0x000000), k: hex(0x1c1c1c) }, R);
  // darker soles
  img.shade(cubes[2].bottom, () => 0.6);
  for (const f of SIDES) img.shade(cubes[2][f], (x, y) => (y === 5 ? 0.75 : 1));
  return img.out();
}

// ------------------------------------------------------------------ spider (64x32) + eyes
function spiderEyesArt() {
  return [
    '........',
    '........',
    'r......r',
    '..r..r..',
    '.RR..RR.',
    '.RL..LR.',
    '........',
    '........'];
}
function paintSpider(eyesOnly = false) {
  const img = new Img(64, 32), R = rng('spider');
  const P = palette(0x1b1714, 0x231e1a, 0x2c2621, 0x352e28, 0x3f362f);
  const hair = hex(0x5a4e44), hair2 = hex(0x6e6155);
  const n = valueNoise(R, 2);
  const paintBox = (b, dark = 1) => {
    for (const f of ALL) img.fill(b[f], (x, y, r) => {
      const v = n(r.x + x, r.y + y) * 0.6 + R() * 0.5;
      if (R() < 0.05) return hair;
      if (R() < 0.02) return hair2;
      return scale(P[Math.max(0, Math.min(4, Math.floor(v * 4.2)))], dark);
    });
  };
  const head = box(32, 4, 8, 8, 8), neck = box(0, 0, 6, 6, 6), body = box(0, 12, 10, 8, 12), leg = box(18, 0, 16, 2, 2);
  if (!eyesOnly) {
    paintBox(head); paintBox(neck, 0.9); paintBox(body); paintBox(leg);
    // abdomen: darker spine stripe and lighter bristle tufts
    img.fill(body.top, (x, y) => (x >= 4 && x <= 5 ? scale(P[0], 0.9) : (x === 2 || x === 7) && y % 3 === 1 ? hair : null));
    img.fill(body.back, (x, y) => (x >= 4 && x <= 5 && y >= 1 && y <= 6 ? P[0] : null));
    // legs: lighter joint bands and bristles
    for (const f of ['top', 'front', 'back', 'bottom']) img.fill(leg[f], (x, y) => (x === 5 || x === 11 ? hair : null));
    // head: mandibles at the bottom of the face
    art(img, head.front, ['........', '........', '........', '........', '........', '........', '...hh...', '..h..h..'], { h: hex(0x4d433b) }, R);
  }
  const eye = { R: hex(0xc80f0f), L: hex(0xff4a3a), r: hex(0xa00808) };
  art(img, head.front, spiderEyesArt(), eye, R);
  return img.out();
}

// ------------------------------------------------------------------ pig (64x64; body at (0,32))
function paintPig() {
  const img = new Img(64, 64), R = rng('pig');
  const P = palette(0xf0a8a2, 0xeea49e, 0xf2aca6, 0xf0a8a2, 0xeba19c);
  const Pl = hex(0xf7c2bd), Pd = hex(0xd88a86), Pdd = hex(0xc47a77);
  const pinkNoise = (r) => img.fill(r, () => { const q = R(); return q < 0.035 ? Pl : q < 0.06 ? Pd : P[(R() * P.length) | 0]; });
  const head = box(0, 0, 8, 8, 8), snout = box(16, 16, 4, 3, 1), legs = box(0, 16, 4, 6, 4), body = box(0, 32, 10, 8, 16);
  for (const b of [head, legs, body]) for (const f of ALL) pinkNoise(b[f]);
  const map = { W: hex(0xffffff), K: hex(0x000000), d: Pd, e: Pdd };
  art(img, head.front, [
    '........',
    '........',
    '........',
    '.WK..KW.',
    '........',
    '........',
    '........',
    'd......d'], map, R);
  img.shade(head.bottom, () => 0.93);
  // snout
  const Sn = palette(0xe7979a, 0xe39195, 0xeb9fa1);
  for (const f of ALL) noiseFill(img, snout[f], Sn, R);
  art(img, snout.front, ['....', 'N..N', '....'], { N: hex(0x9a5257) }, R);
  img.shade(snout.bottom, () => 0.9);
  // legs: darker hoof row
  for (const f of SIDES) img.fill(legs[f], (x, y) => (y === 5 ? Pdd : null));
  img.fill(legs.bottom, () => Pdd);
  // body: slightly darker belly, a few blemishes
  img.shade(body.bottom, () => 0.94);
  for (const f of SIDES) img.shade(body[f], (x, y) => (y === 7 ? 0.93 : 1));
  return img.out();
}

// ------------------------------------------------------------------ cow (64x64; body (0,32), udder (32,0))
function paintCow() {
  const img = new Img(64, 64), R = rng('cow');
  const Br = palette(0x47331f, 0x4c3623, 0x42301d, 0x4a3521, 0x503925);
  const Brd = hex(0x33241a);
  const Wh = palette(0xe8e8e4, 0xdcdcd6, 0xf0f0ec, 0xe2e2dd);
  const Whd = hex(0xc8c8c0);
  const brown = () => (R() < 0.04 ? Brd : Br[(R() * Br.length) | 0]);
  const white = () => (R() < 0.08 ? Whd : Wh[(R() * Wh.length) | 0]);
  const head = box(0, 0, 8, 8, 6), horn = box(22, 0, 1, 3, 1), legs = box(0, 16, 4, 12, 4), body = box(0, 32, 12, 10, 18), udder = box(32, 0, 4, 1, 6);
  // patches: a set of ellipses in "body space" (x across, z along, y up) -> decides white vs brown
  const patches = [[3, 6, -6, 4, 3.5, 4], [-5, 8, 2, 3.5, 4, 3], [5, 2, 3, 3, 3, 4], [-2, 14, -6, 4, 2.5, 3], [6, 9, -8, 2.5, 2.5, 2.5], [-6, 2, -5, 3, 3, 3], [0, 14, 4, 3, 2, 3]];
  const inPatch = (x, y, z) => patches.some(([cx, cy, cz, rx, ry, rz]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 < 1);
  // body box: x -6..6, y 12..22 (use 0..10), z -10..8. Map each face texel to a 3D point on the box surface.
  const B = { x0: -6, x1: 6, y0: 0, y1: 10, z0: -10, z1: 8 };
  const bodyPoint = {
    top: (x, y) => [B.x0 + x + 0.5, B.y1, B.z0 + y + 0.5],
    bottom: (x, y) => [B.x0 + x + 0.5, B.y0, B.z0 + y + 0.5],
    right: (x, y) => [B.x0, B.y1 - y - 0.5, B.z0 + x + 0.5],
    left: (x, y) => [B.x1, B.y1 - y - 0.5, B.z1 - x - 0.5],
    front: (x, y) => [B.x0 + x + 0.5, B.y1 - y - 0.5, B.z1],
    back: (x, y) => [B.x1 - x - 0.5, B.y1 - y - 0.5, B.z0],
  };
  for (const f of ALL) img.fill(body[f], (x, y) => (inPatch(...bodyPoint[f](x, y)) ? white() : brown()));
  img.shade(body.bottom, () => 0.9);
  // head
  for (const f of ALL) img.fill(head[f], () => brown());
  const map = { W: Wh, w: Whd, B: Br, K: hex(0x0a0a0a), E: hex(0xf2f2f2), M: palette(0xa58c80, 0x9c8276, 0xae968a), N: hex(0x3c2a24), m: hex(0x8a7166) };
  art(img, head.front, [
    '...WW...',
    '...WW...',
    '..WWWW..',
    'EK.WW.KE',
    '...WW...',
    '.MMMMMM.',
    '.NMMMMN.',
    '.mMMMMm.'], map, R);
  art(img, head.top, ['........', '...WW...', '...WW...', '...WW...', '...WW...', '...WW...'], map, R);
  art(img, head.bottom, ['........', '........', '........', '..MMMM..', '.MMMMMM.', '.MMMMMM.'], map, R);
  const sideArt = ['........', '........', '........', '.....W..', '....WW..', '.....MMM', '......MM', '......mM'];
  art(img, head.right, sideArt, map, R);
  art(img, head.left, sideArt, map, R, true);
  // horns: pale with a darker tip
  for (const f of ALL) img.fill(horn[f], (x, y, r) => (f === 'top' ? hex(0x8f8a80) : y === 0 && r.h === 3 ? hex(0xa49e92) : hex(0xd9d3c3)));
  // legs: brown upper, white lower, dark hoof
  for (const f of ALL) img.fill(legs[f], () => brown());
  for (const f of SIDES) img.fill(legs[f], (x, y) => (y >= 11 ? hex(0x2a221d) : y >= 6 ? white() : y === 5 && R() < 0.5 ? white() : null));
  img.fill(legs.bottom, () => hex(0x2a221d));
  // udder
  const U = palette(0xe8a7a7, 0xe09c9d, 0xefb3b2);
  for (const f of ALL) noiseFill(img, udder[f], U, R);
  img.fill(udder.bottom, (x, y) => ((x === 0 || x === 3) && (y === 1 || y === 4) ? hex(0xf6c8c6) : null));
  return img.out();
}

// ------------------------------------------------------------------ sheep (64x64 sheared body) + fur
function paintSheep() {
  const img = new Img(64, 64), R = rng('sheep');
  const S = palette(0xdcbcaa, 0xd6b5a2, 0xe2c4b3, 0xd9b8a6);
  const Sd = hex(0xc3a08e), Sl = hex(0xead2c4);
  const F = palette(0xe8d3c5, 0xe2cbbb, 0xedd9cc); // face (paler)
  const skin = () => { const q = R(); return q < 0.04 ? Sd : q < 0.07 ? Sl : S[(R() * S.length) | 0]; };
  const head = box(0, 0, 6, 6, 8), legs = box(0, 16, 4, 12, 4), body = box(0, 32, 8, 6, 16);
  for (const b of [head, legs, body]) for (const f of ALL) img.fill(b[f], () => skin());
  noiseFill(img, head.front, F, R);
  art(img, head.front, [
    '......',
    '......',
    'WK..KW',
    '......',
    '..nn..',
    '..mm..'], { W: hex(0xffffff), K: hex(0x0c0c0c), n: hex(0xc98f8a), m: hex(0xb5847c) }, R);
  for (const f of ['right', 'left']) img.fill(head[f], (x, y, r) => {
    const fx = f === 'right' ? x : r.w - 1 - x; // 0 = back .. 7 = front
    return fx >= 5 ? F[(R() * F.length) | 0] : null;
  });
  // legs: darker hooves
  for (const f of SIDES) img.fill(legs[f], (x, y) => (y === 11 ? hex(0x6e5a50) : y === 10 ? Sd : null));
  img.fill(legs.bottom, () => hex(0x6e5a50));
  img.shade(body.bottom, () => 0.93);
  return img.out();
}
function paintSheepFur() {
  const img = new Img(64, 64), R = rng('sheepfur');
  const W = palette(0xf4f4f4, 0xeeeeee, 0xfafafa, 0xe9e9e9);
  const Wd = hex(0xdadada), Wdd = hex(0xcdcdcd), Wl = hex(0xffffff);
  const n = valueNoise(R, 1.6);
  const wool = (gx, gy) => { const v = n(gx, gy) + (R() - 0.5) * 0.4; return v < 0.1 ? Wdd : v < 0.24 ? Wd : v > 0.85 ? Wl : W[(R() * W.length) | 0]; };
  const cubes = [box(0, 0, 6, 6, 6), box(0, 16, 4, 6, 4), box(0, 32, 8, 6, 16)];
  for (const b of cubes) for (const f of ALL) img.fill(b[f], (x, y, r) => wool(r.x + x, r.y + y));
  return img.out();
}

// ------------------------------------------------------------------ chicken (64x32; body at (0,18))
function paintChicken() {
  const img = new Img(64, 32), R = rng('chicken');
  const W = palette(0xffffff, 0xf7f7f7, 0xfdfdfd, 0xf2f2f2);
  const Wd = hex(0xe0e0e0), Wdd = hex(0xcfcfcf);
  const feather = () => { const q = R(); return q < 0.1 ? Wd : q < 0.13 ? Wdd : W[(R() * W.length) | 0]; };
  const head = box(0, 0, 4, 6, 3), beak = box(14, 0, 4, 2, 2), wattle = box(14, 4, 2, 2, 2), legs = box(26, 0, 3, 5, 3);
  const wing = box(24, 13, 1, 4, 6), body = box(0, 18, 6, 6, 8);
  for (const b of [head, wing, body]) for (const f of ALL) img.fill(b[f], () => feather());
  art(img, head.front, ['....', 'K..K', '....', '....', '....', '....'], { K: hex(0x000000) }, R);
  for (const f of ['right', 'left']) art(img, head[f], ['...', '...', '...'], {}, R);
  img.shade(body.bottom, () => 0.9);
  for (const f of SIDES) img.shade(wing[f], (x, y) => (y === 3 ? 0.88 : 1));
  // tail feathers hint on the back of the body
  art(img, body.back, ['.w..w.', 'ww..ww', '......'], { w: Wd }, R);
  // beak
  const Y = palette(0xf9b437, 0xf5aa2a, 0xfcbf45), Yd = hex(0xd88c1c);
  for (const f of ALL) noiseFill(img, beak[f], Y, R);
  img.fill(beak.front, (x, y) => (y === 1 ? Yd : null));
  img.shade(beak.bottom, () => 0.85);
  // wattle
  const Rd = palette(0xd41414, 0xc80e0e, 0xdc2020);
  for (const f of ALL) noiseFill(img, wattle[f], Rd, R);
  img.shade(wattle.bottom, () => 0.75);
  // legs: transparent box with a 1px leg column and toes
  const O = hex(0xe8a224), Od = hex(0xc07f15);
  for (const f of ALL) img.fill(legs[f], () => CLEAR);
  for (const f of SIDES) img.fill(legs[f], (x, y) => (x === 1 ? (y === 4 ? Od : O) : y === 4 && f === 'front' ? Od : null));
  img.fill(legs.bottom, (x, y) => (x === 1 || y === 2 ? Od : null));
  return img.out();
}

// ------------------------------------------------------------------ minecart (64x32)
function paintMinecart() {
  const img = new Img(64, 32), R = rng('minecart');
  const G = palette(0x979797, 0x8f8f8f, 0x9d9d9d, 0x939393);
  const Gl = hex(0xb9b9b9), Gd = hex(0x5e5e5e), Gdd = hex(0x3d3d3d), Gi = palette(0x6e6e6e, 0x686868, 0x747474);
  const metal = () => { const q = R(); return q < 0.06 ? Gl : q < 0.12 ? hex(0x858585) : G[(R() * G.length) | 0]; };
  const wall = box(0, 0, 16, 8, 2), floor = box(0, 10, 16, 20, 2);
  // outer face of a wall (box "back"): framed plate with rivets
  img.fill(wall.back, (x, y, r) => {
    if (y === 0) return Gl;
    if (y === r.h - 1 || x === 0 || x === r.w - 1) return Gdd;
    if (y === 1 || x === 1 || x === r.w - 2 || y === r.h - 2) return Gd;
    if ((x === 2 || x === r.w - 3) && (y === 2 || y === r.h - 3)) return Gl;
    if (x === 8 || x === 7) return y === 2 || y === r.h - 3 ? Gl : hex(0x7c7c7c);
    return metal();
  });
  // inner face (box "front"): darker, worn
  img.fill(wall.front, (x, y, r) => (y === 0 ? Gl : y === r.h - 1 ? Gdd : x === 0 || x === r.w - 1 ? Gd : Gi[(R() * Gi.length) | 0]));
  for (const f of ['top', 'bottom']) img.fill(wall[f], (x, y) => (y === 0 ? Gl : G[0]));
  img.fill(wall.bottom, () => Gd);
  for (const f of ['right', 'left']) img.fill(wall[f], (x, y) => (y === 0 ? Gl : x === 0 ? Gd : G[1]));
  // floor plate: "back" face = inside floor, "front" face = underside
  img.fill(floor.back, (x, y, r) => (x === 0 || x === r.w - 1 || y === 0 || y === r.h - 1 ? Gd : (y % 5 === 2 ? hex(0x5a5a5a) : Gi[(R() * Gi.length) | 0])));
  img.fill(floor.front, (x, y, r) => (x === 0 || x === r.w - 1 || y === 0 || y === r.h - 1 ? Gdd : x === 7 || x === 8 || y === 9 || y === 10 ? Gd : metal()));
  for (const f of ['top', 'bottom', 'right', 'left']) img.fill(floor[f], (x, y) => (G[1]));
  return img.out();
}

// ------------------------------------------------------------------ boats (128x64, custom layout, see models.js)
const PLANK = { // [seamDark, seam, dark, mid, light, highlight] (matches src/textures planks)
  oak: [0x4c3d26, 0x6b5428, 0x8f7348, 0x9f844d, 0xaf8f55, 0xc29d62],
  spruce: [0x3a2a16, 0x4f3a20, 0x5f4528, 0x6b4f2e, 0x775935, 0x86653d],
  birch: [0x86754a, 0x9e8d5e, 0xb5a36e, 0xc0ae78, 0xcbba84, 0xd7c98f],
  jungle: [0x553a24, 0x704b30, 0x8a6142, 0x9a6d4b, 0xa77955, 0xb88a62],
  acacia: [0x5c2f1a, 0x7a3c20, 0x934c2a, 0xa35730, 0xb06036, 0xc26d3f],
  dark_oak: [0x1f1409, 0x2c1c0d, 0x392512, 0x432c16, 0x4e341b, 0x5c3f22],
  cherry: [0x95615f, 0xb57f7b, 0xcf9d97, 0xdcaba4, 0xe6bbb3, 0xf0cdc5],
};
function paintBoat(wood) {
  const img = new Img(128, 64), R = rng('boat' + wood);
  const P = PLANK[wood].map(h => hex(h));
  const grain = () => { const q = R(); return q < 0.12 ? P[2] : q < 0.6 ? P[3] : q < 0.9 ? P[4] : P[5]; };
  // planks running along texture-x, each `ph` texels tall, with staggered butt joints
  const planksH = (r, ph = 4, seed = 0, edge = true) => {
    const joints = [];
    for (let i = 0; i < 16; i++) joints.push(((R() * r.w) | 0) + seed);
    img.fill(r, (x, y) => {
      const row = Math.floor(y / ph), ly = y % ph;
      if (edge && (y === r.h - 1)) return P[1];
      if (ly === ph - 1) return R() < 0.3 ? P[0] : P[1];
      if (x === joints[row % 16] % Math.max(1, r.w)) return P[1];
      let c = grain();
      if (ly === 0) c = R() < 0.6 ? P[4] : P[5];
      return c;
    });
  };
  // planks running along texture-y (columns)
  const planksV = (r, pw = 4) => {
    const joints = [];
    for (let i = 0; i < 16; i++) joints.push((R() * r.h) | 0);
    img.fill(r, (x, y) => {
      const col = Math.floor(x / pw), lx = x % pw;
      if (lx === pw - 1) return R() < 0.3 ? P[0] : P[1];
      if (y === joints[col % 16]) return P[1];
      if (lx === 0) return R() < 0.6 ? P[4] : P[5];
      return grain();
    });
  };
  const edgeFill = (r) => img.fill(r, (x, y) => (R() < 0.5 ? P[2] : P[3]));
  // bottom 16x3x28 @ (0,0)
  const bottom = box(0, 0, 16, 3, 28);
  planksV(bottom.top, 4);                  // inner floor: planks run along the boat
  planksV(bottom.bottom, 4);               // hull underside
  img.shade(bottom.bottom, () => 0.8);
  for (const f of ['right', 'left']) planksH(bottom[f], 3, 0, false);
  for (const f of ['front', 'back']) edgeFill(bottom[f]);
  // walls: back 18x6x2 @(0,31), front 16x6x2 @(40,31), right/left 28x6x2 @(0,39)/(60,39)
  for (const [u, v, w] of [[0, 31, 18], [40, 31, 16], [0, 39, 28], [60, 39, 28]]) {
    const b = box(u, v, w, 6, 2);
    planksH(b.back, 3);                    // outer face
    planksH(b.front, 3);                   // inner face
    img.shade(b.front, () => 0.85);
    img.fill(b.top, (x, y) => (y === 0 ? P[5] : P[4]));
    img.fill(b.bottom, () => P[1]);
    for (const f of ['right', 'left']) img.fill(b[f], (x, y) => (y % 3 === 2 ? P[1] : P[3]));
    // gunwale: lighter top rim
    img.fill(b.back, (x, y) => (y === 0 ? P[5] : null));
  }
  // paddles: shaft 18x2x2 (88,0)/(88,4); blade 7x6x1 (88,8)/(104,8)
  for (const [u, v] of [[88, 0], [88, 4]]) {
    const s = box(u, v, 18, 2, 2);
    for (const f of ALL) img.fill(s[f], (x, y, r) => (r.w === 2 ? P[2] : y === 0 ? P[5] : P[4]));
  }
  for (const [u, v] of [[88, 8], [104, 8]]) {
    const b = box(u, v, 7, 6, 1);
    for (const f of ALL) img.fill(b[f], (x, y, r) => (r.h === 1 || r.w === 1 ? P[2] : x === 0 || x === r.w - 1 || y === 0 || y === r.h - 1 ? P[2] : y === 3 ? P[1] : grain()));
  }
  return img.out();
}

// ------------------------------------------------------------------ entry point
export function paintEntityTextures() {
  const t = {
    player: paintPlayer(),
    zombie: paintZombie(),
    skeleton: paintSkeleton(),
    creeper: paintCreeper(),
    spider: paintSpider(false),
    spider_eyes: paintSpider(true),
    pig: paintPig(),
    cow: paintCow(),
    sheep: paintSheep(),
    sheep_fur: paintSheepFur(),
    chicken: paintChicken(),
    minecart: paintMinecart(),
  };
  for (const w of Object.keys(PLANK)) t['boat_' + w] = paintBoat(w);
  return t;
}
