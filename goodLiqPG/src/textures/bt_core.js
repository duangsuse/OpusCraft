// Core helpers for procedural block texture painting (pure JS, no DOM).
// An "Img" is a mutable 16x16 working buffer: { c: Uint8ClampedArray(1024) RGBA, h: Float32Array(256) height,
//   e: Float32Array(256) emissive, sm: Float32Array|null smoothness, f0: Float32Array|null reflectance }.
export const N = 16;
export const NN = 256;

// ---------- RNG ----------
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const irand = (R, n) => (R() * n) | 0;

// ---------- colors ----------
export function rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
export function lum(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function scalec(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
export function gray(v) { return (v << 16) | (v << 8) | v; }
export const wrap = (v) => ((v % N) + N) % N;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---------- Img ----------
export function newImg(fill = null, a = 255) {
  const img = { c: new Uint8ClampedArray(NN * 4), h: new Float32Array(NN).fill(0.5), e: new Float32Array(NN), sm: null, f0: null };
  if (fill != null) { const c = typeof fill === 'number' ? rgb(fill) : fill; for (let i = 0; i < NN; i++) setI(img, i, c, a); }
  return img;
}
export function cloneImg(s) {
  return { c: new Uint8ClampedArray(s.c), h: new Float32Array(s.h), e: new Float32Array(s.e), sm: s.sm && new Float32Array(s.sm), f0: s.f0 && new Float32Array(s.f0) };
}
export function setI(img, i, c, a = 255) { const o = i * 4; img.c[o] = c[0]; img.c[o + 1] = c[1]; img.c[o + 2] = c[2]; img.c[o + 3] = a; }
export function setP(img, x, y, c, a = 255, h) { const i = wrap(y) * N + wrap(x); setI(img, i, typeof c === 'number' ? rgb(c) : c, a); if (h != null) img.h[i] = h; }
export function getP(img, x, y) { const o = (wrap(y) * N + wrap(x)) * 4; return [img.c[o], img.c[o + 1], img.c[o + 2], img.c[o + 3]]; }
export function alphaAt(img, x, y) { return img.c[(wrap(y) * N + wrap(x)) * 4 + 3]; }
export function setSm(img, i, v) { if (!img.sm) img.sm = new Float32Array(NN).fill(-1); img.sm[i] = v; }
export function setF0(img, i, v) { if (!img.f0) img.f0 = new Float32Array(NN).fill(-1); img.f0[i] = v; }
// multiply brightness of pixel
export function shadeP(img, x, y, s, dh = 0) {
  const i = wrap(y) * N + wrap(x), o = i * 4;
  img.c[o] = img.c[o] * s; img.c[o + 1] = img.c[o + 1] * s; img.c[o + 2] = img.c[o + 2] * s; img.h[i] += dh;
}
export function mapImg(img, fn) { // fn(r,g,b,a,x,y) -> [r,g,b] | null
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4; const r = fn(img.c[o], img.c[o + 1], img.c[o + 2], img.c[o + 3], x, y);
    if (r) { img.c[o] = r[0]; img.c[o + 1] = r[1]; img.c[o + 2] = r[2]; if (r.length > 3) img.c[o + 3] = r[3]; }
  }
  return img;
}
export function toGray(img) { return mapImg(img, (r, g, b) => { const v = Math.round(lum(r, g, b) * 255); return [v, v, v]; }); }
export function tintImg(img, hex, k = 1) { const t = rgb(hex); return mapImg(img, (r, g, b) => [r * (1 - k + k * t[0] / 255), g * (1 - k + k * t[1] / 255), b * (1 - k + k * t[2] / 255)]); }

// ---------- palette maps ----------
// pal: { ch: hex | [hex, height?, emissive?, alpha?] }. '.' and ' ' are transparent unless in pal.
function normEntry(v) {
  if (v == null) return null;
  if (typeof v === 'number') { const c = rgb(v); return { c, h: 0.25 + 0.5 * lum(...c), e: 0, a: 255 }; }
  const c = rgb(v[0]);
  return { c, h: v[1] != null ? v[1] : 0.25 + 0.5 * lum(...c), e: v[2] || 0, a: v[3] != null ? v[3] : 255 };
}
export function normPal(pal) { const o = {}; for (const k in pal) o[k] = normEntry(pal[k]); return o; }
export function fromMap(rows, pal, base = null) {
  const P = normPal(pal); const img = base || newImg();
  for (let y = 0; y < N; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < N; x++) {
      const ch = row[x] || '.'; const p = P[ch]; const i = y * N + x;
      if (!p) { if (!base) { setI(img, i, [0, 0, 0], 0); img.h[i] = 0; } continue; }
      setI(img, i, p.c, p.a); img.h[i] = p.h; img.e[i] = p.e;
    }
  }
  return img;
}
// stamp a small map onto img at ox,oy (wrapping). chars not in pal are skipped.
export function stamp(img, rows, pal, ox, oy, wrapIt = true) {
  const P = pal.__norm ? pal : normPal(pal);
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const p = P[rows[y][x]]; if (!p) continue;
    let X = ox + x, Y = oy + y; if (!wrapIt && (X < 0 || Y < 0 || X >= N || Y >= N)) continue;
    const i = wrap(Y) * N + wrap(X); setI(img, i, p.c, p.a); img.h[i] = p.h; img.e[i] = p.e;
  }
  return img;
}

// ---------- noise ----------
const sstep = (t) => t * t * (3 - 2 * t);
// tileable value noise on a px*py lattice (wraps over 16 pixels); returns Float32Array(256) in ~[0,1]
export function vnoise(R, px, py = px, ox = 0, oy = 0) {
  const g = new Float32Array(px * py); for (let i = 0; i < g.length; i++) g[i] = R();
  const out = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = sampleLattice(g, px, py, (x + ox) * px / N, (y + oy) * py / N);
  return out;
}
export function sampleLattice(g, px, py, u, v) {
  const x0 = Math.floor(u), y0 = Math.floor(v); const tx = sstep(u - x0), ty = sstep(v - y0);
  const a = ((x0 % px) + px) % px, b = (a + 1) % px, c = ((y0 % py) + py) % py, d = (c + 1) % py;
  const v00 = g[c * px + a], v10 = g[c * px + b], v01 = g[d * px + a], v11 = g[d * px + b];
  return (v00 + (v10 - v00) * tx) * (1 - ty) + (v01 + (v11 - v01) * tx) * ty;
}
export function lattice(R, px, py = px) { const g = new Float32Array(px * py); for (let i = 0; i < g.length; i++) g[i] = R(); return { g, px, py }; }
export function white(R) { const o = new Float32Array(NN); for (let i = 0; i < NN; i++) o[i] = R(); return o; }
// weighted sum of fields
export function combine(list) { // [[field, w], ...]
  const o = new Float32Array(NN);
  for (const [f, w] of list) for (let i = 0; i < NN; i++) o[i] += f[i] * w;
  return o;
}
export function normalize(f) {
  let lo = Infinity, hi = -Infinity; for (const v of f) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const o = new Float32Array(f.length); const d = hi - lo || 1; for (let i = 0; i < f.length; i++) o[i] = (f[i] - lo) / d; return o;
}
// fbm with octaves of tileable lattices
export function fbm(R, base = 2, oct = 4, gain = 0.5, sx = 1, sy = 1) {
  const parts = []; let w = 1, p = base;
  for (let k = 0; k < oct && p <= 16; k++) { parts.push([vnoise(R, Math.max(1, Math.round(p * sx)), Math.max(1, Math.round(p * sy))), w]); w *= gain; p *= 2; }
  return normalize(combine(parts));
}
export function blur(f, k = 1) { // wrap box blur radius 1
  const o = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { s += f[wrap(y + dy) * N + wrap(x + dx)]; n++; }
    o[y * N + x] = s / n;
  }
  return o;
}
// rank-quantize a field into palette indices with given weights (fractions)
export function rankQuant(f, weights) {
  const idx = Array.from({ length: f.length }, (_, i) => i).sort((a, b) => f[a] - f[b] || a - b);
  const tot = weights.reduce((a, b) => a + b, 0); const out = new Uint8Array(f.length);
  let k = 0, acc = weights[0] / tot;
  for (let r = 0; r < idx.length; r++) { while ((r + 0.5) / idx.length > acc && k < weights.length - 1) { k++; acc += weights[k] / tot; } out[idx[r]] = k; }
  return out;
}
// paint a field with a palette list [[hex, weight], ...] (ordered dark->light); height derived from field
export function paintField(f, pal, hScale = 1, hBase = 0) {
  const q = rankQuant(f, pal.map((p) => p[1]));
  const img = newImg(); const cols = pal.map((p) => rgb(p[0]));
  for (let i = 0; i < NN; i++) { setI(img, i, cols[q[i]]); img.h[i] = hBase + hScale * (q[i] + 0.5) / pal.length; }
  img.q = q;
  return img;
}

// tileable voronoi: pts [[x,y],...] in pixel coords. returns {id, d1, d2}
export function voronoi(pts, sx = 1, sy = 1) {
  const id = new Int16Array(NN), d1 = new Float32Array(NN), d2 = new Float32Array(NN);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let b1 = 1e9, b2 = 1e9, bi = 0;
    for (let k = 0; k < pts.length; k++) {
      let dx = Math.abs(x + 0.5 - pts[k][0]), dy = Math.abs(y + 0.5 - pts[k][1]);
      if (dx > 8) dx = 16 - dx; if (dy > 8) dy = 16 - dy;
      const d = Math.sqrt(dx * dx * sx + dy * dy * sy) * (pts[k][2] || 1);
      if (d < b1) { b2 = b1; b1 = d; bi = k; } else if (d < b2) b2 = d;
    }
    id[y * N + x] = bi; d1[y * N + x] = b1; d2[y * N + x] = b2;
  }
  return { id, d1, d2 };
}

// shade an image by the slope of a height field (light from top-left), and store heights
export function emboss(img, hf, k = 0.6, setH = true) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const d = (hf[wrap(y - 1) * N + wrap(x - 1)] - hf[wrap(y + 1) * N + wrap(x + 1)]) * 0.5 + (hf[y * N + wrap(x - 1)] - hf[y * N + wrap(x + 1)]) * 0.25 + (hf[wrap(y - 1) * N + x] - hf[wrap(y + 1) * N + x]) * 0.25;
    const s = 1 - d * k; const o = i * 4;
    img.c[o] = img.c[o] * s; img.c[o + 1] = img.c[o + 1] * s; img.c[o + 2] = img.c[o + 2] * s;
    if (setH) img.h[i] = hf[i];
  }
  return img;
}

// ---------- finishing ----------
// opts: smooth, f0, emissive (number), sss, frameTime
export function finish(imgOrFrames, opts = {}) {
  const frames = Array.isArray(imgOrFrames) ? imgOrFrames : [imgOrFrames];
  const first = frames[0];
  const tex = { frames: frames.map((f) => f.c), height: first.h };
  if (opts.frameTime) tex.frameTime = opts.frameTime;
  tex.smooth = mergeChan(first.sm, opts.smooth != null ? opts.smooth : 0.15);
  tex.f0 = mergeChan(first.f0, opts.f0 != null ? opts.f0 : 0.04);
  const eBase = opts.emissive || 0;
  let anyE = false, sumE = 0, cntE = 0;
  for (let i = 0; i < NN; i++) { if (first.e[i] > 0) anyE = true; if (first.c[i * 4 + 3]) { sumE += first.e[i]; cntE++; } }
  if (frames.length > 1) tex.emissive = opts.emissive != null ? opts.emissive : anyE ? Math.round(sumE / Math.max(1, cntE) * 100) / 100 : 0; // per-frame emissive varies: use a scalar
  else tex.emissive = anyE ? Float32Array.from(first.e, (v) => Math.max(v, eBase)) : eBase;
  tex.sss = opts.sss || 0;
  // clamp heights
  for (let i = 0; i < NN; i++) tex.height[i] = clamp01(tex.height[i]);
  return tex;
}
function mergeChan(arr, def) {
  if (!arr) return def;
  return Float32Array.from(arr, (v) => (v < 0 ? def : v));
}
