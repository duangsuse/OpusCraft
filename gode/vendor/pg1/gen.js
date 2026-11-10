/* gode/vendor/pg1/gen.js —— goodPG1.html 的生成器副本（§1 核心工具 + §2 注册表 + §4 世界生成）。
   由 tools/build-pg1.mjs 切出；**本文件可改**（洞穴 / 地表 / 树密度），donor 原文不动。
   donor 更新后：node gode/tools/build-pg1.mjs --check 看差异，确认不影响手改再重建，然后重放本文件的改动。 */
// 1. CORE UTILITIES: math, RNG, hashing, noise
// ---------------------------------------------------------------------
const CS = 16, WH = 192, SECTIONS = WH / 16, SEA = 63;

// ---------------------------------------------------------------------
// gode：生成参数（s02 §2.1 的扁平表）。默认值 = SURV 调优后的值（不是供体原值）。
// 适配器 defl/g/pg1.js 用 resolveParams(meta.knobs, kw) 校验后调 setGenParams。
// ---------------------------------------------------------------------
const GEN_PARAMS = [
  { k: 'terrain.mount', def: 1, min: 0, max: 2, note: '山脉高度乘子（0 = 无山）' },
  { k: 'terrain.hills', def: 1, min: 0, max: 2.5, note: '丘陵起伏乘子' },
  { k: 'terrain.mountPct', def: 0.13, min: 0.02, max: 0.5, note: '山脉区域占比（SurvivalCraft ≈ 0.13）' },
  { k: 'terrain.coast', def: 0.8, min: 0, max: 1, note: '海岸带压平 / 浅滩（按 base 离海平面距离；0 = 关）' },
  { k: 'terrain.spike', def: 1, min: 0, max: 2, note: '高山尖峰/石柱强度' },
  { k: 'terrain.canyon', def: 1, min: 0, max: 2, note: '高山峡谷切割强度' },
  { k: 'mountain.hollow', def: 0.7, min: 0, max: 2, note: '山体中空/拱洞强度（0.7 ≈ 雪线山体空腔 19%）' },
  { k: 'cave.rate', def: 1.5, min: 0, max: 3, note: '洞穴体积乘子（1.5 = SURV 连通度）' },
  { k: 'cave.entrance', def: 1.5, min: 0, max: 3, note: '洞穴入口密度乘子（1.5 ≈ 每 64×64 格 82% 有入口）' },
  { k: 'tree.dens', def: 1, min: 0, max: 2, note: '树密度乘子（每块上限见 treeD）' },
  { k: 'ore.mul', def: 1, min: 0, max: 3, note: '矿脉数量乘子' },
];
const PG = {}; for (const p of GEN_PARAMS) PG[p.k] = p.def;
function setGenParams(o) { for (const p of GEN_PARAMS) if (o && o[p.k] !== undefined) PG[p.k] = Number(o[p.k]); }
const DIM_OVER = 0, DIM_NETHER = 1, DIM_END = 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fract = x => x - Math.floor(x);
const now = () => performance.now();
const $ = id => document.getElementById(id);

function ihash(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177) + Math.imul(s | 0, 1911520717)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h ^ (h >>> 15)) >>> 0;
}
const rhash = (x, y, z, s) => ihash(x, y, z, s) / 4294967296;

function RNG(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  const f = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  f.int = (n) => Math.floor(f() * n);
  f.range = (a, b) => a + f() * (b - a);
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  return f;
}
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; }

// Simplex noise (2D/3D), seeded
class Noise {
  constructor(seed) {
    const r = RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm12[i] = this.perm[i] % 12; }
  }
  n2(xin, yin) {
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713, perm = this.perm, pm = this.pm12, g = Noise.G3;
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 >= 0) { const gi = pm[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (g[gi] * x0 + g[gi + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 >= 0) { const gi = pm[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (g[gi] * x1 + g[gi + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 >= 0) { const gi = pm[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (g[gi] * x2 + g[gi + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  }
  n3(xin, yin, zin) {
    const F3 = 1 / 3, G3 = 1 / 6, perm = this.perm, pm = this.pm12, g = Noise.G3;
    const s = (xin + yin + zin) * F3; const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3; const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; } }
    else { if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt, gi;
    tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0; if (tt > 0) { gi = pm[ii + perm[jj + perm[kk]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x0 + g[gi + 1] * y0 + g[gi + 2] * z0); }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1; if (tt > 0) { gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x1 + g[gi + 1] * y1 + g[gi + 2] * z1); }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2; if (tt > 0) { gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x2 + g[gi + 1] * y2 + g[gi + 2] * z2); }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3; if (tt > 0) { gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; tt *= tt; n += tt * tt * (g[gi] * x3 + g[gi + 1] * y3 + g[gi + 2] * z3); }
    return 32 * n;
  }
  fbm2(x, y, oct, lac = 2, gain = 0.5) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * this.n2(x * f, y * f); n += a; a *= gain; f *= lac; } return s / n; }
  fbm3(x, y, z, oct, lac = 2, gain = 0.5) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * this.n3(x * f, y * f, z * f); n += a; a *= gain; f *= lac; } return s / n; }
  ridge2(x, y, oct) { let a = 1, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(this.n2(x * f, y * f))); n += a; a *= 0.5; f *= 2; } return s / n; }
}
Noise.G3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);

// Column-major 4x4 matrices
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  copy(o, a) { o.set(a); return o; },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far); o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  },
  ortho(o, l, r, b, t, n, f) {
    const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f); o.fill(0);
    o[0] = -2 * lr; o[5] = -2 * bt; o[10] = 2 * nf; o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1; return o;
  },
  lookAt(o, e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); o[15] = 1; return o;
  },
  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30; o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32; o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return null; det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  translate(o, a, x, y, z) {
    if (o !== a) o.set(a);
    o[12] = a[0] * x + a[4] * y + a[8] * z + a[12]; o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    o[14] = a[2] * x + a[6] * y + a[10] * z + a[14]; o[15] = a[3] * x + a[7] * y + a[11] * z + a[15]; return o;
  },
  scale(o, a, x, y, z) { if (o !== a) o.set(a); for (let i = 0; i < 4; i++) { o[i] *= x; o[4 + i] *= y; o[8 + i] *= z; } return o; },
  rotX(o, a, r) { const s = Math.sin(r), c = Math.cos(r); if (o !== a) o.set(a); for (let i = 0; i < 4; i++) { const y = a[4 + i], z = a[8 + i]; o[4 + i] = y * c + z * s; o[8 + i] = z * c - y * s; } return o; },
  rotY(o, a, r) { const s = Math.sin(r), c = Math.cos(r); if (o !== a) o.set(a); for (let i = 0; i < 4; i++) { const x = a[i], z = a[8 + i]; o[i] = x * c - z * s; o[8 + i] = x * s + z * c; } return o; },
  rotZ(o, a, r) { const s = Math.sin(r), c = Math.cos(r); if (o !== a) o.set(a); for (let i = 0; i < 4; i++) { const x = a[i], y = a[4 + i]; o[i] = x * c + y * s; o[4 + i] = y * c - x * s; } return o; },
  xform(m, x, y, z) { const w = m[3] * x + m[7] * y + m[11] * z + m[15]; return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w]; }
};
const V3 = {
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  dist2: (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; },
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
};
const FACE_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ckey = (cx, cz) => ((cx & 0xffff) << 16) | (cz & 0xffff);
function toRoman(n) { return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n); }
function titleCase(s) { return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

// ---------------------------------------------------------------------
// 2. REGISTRIES: blocks, items, recipes, smelting, enchantments, effects
// ---------------------------------------------------------------------
const COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const COLOR_RGB = {
  white: [233, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217], yellow: [248, 197, 39], lime: [112, 185, 25],
  pink: [237, 141, 172], gray: [62, 68, 71], light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
  brown: [114, 71, 40], green: [84, 109, 27], red: [160, 39, 34], black: [24, 25, 30]
};
const WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry'];
const SHAPES = ['none', 'cube', 'cross', 'crop', 'liquid', 'torch', 'slab', 'stairs', 'layer', 'carpet', 'cactus', 'wall', 'door', 'trapdoor', 'fence', 'pane', 'wire', 'plate', 'button', 'lever', 'lantern', 'rail', 'chest', 'bed', 'portal', 'endportal', 'fire', 'frame', 'etable', 'anvil', 'cauldron', 'brewing', 'campfire', 'lilypad', 'bamboo', 'chain', 'rod', 'egg', 'farmland', 'pickle', 'head', 'cake', 'chorus', 'vine'];
const SH = {}; SHAPES.forEach((s, i) => SH[s] = i);
const BLOCKS = [], BL = {};
const ST = { tool: 'pickaxe', tier: 1, snd: 'stone' };
const WD = { tool: 'axe', snd: 'wood', flam: 5 };
const PLANT = { shape: 'cross', render: 1, solid: false, opaque: false, filter: 0, hard: 0, snd: 'grass', cat: 'natural', replace: true, wave: 2 };
const THIN = { render: 1, solid: false, opaque: false, filter: 0 };

function defBlock(name, o = {}) {
  const b = Object.assign({
    id: BLOCKS.length, name, label: titleCase(name), shape: 'cube', render: 0, solid: true, opaque: true, light: 0, filter: 15,
    hard: 1, tool: null, tier: 0, snd: 'stone', tint: 0, drop: undefined, wave: 0, gravity: false, replace: false, climb: false, flam: 0,
    tex: name, item: true, cat: 'building', cullSame: false, xp: null, waterlogged: false, slip: 0.6, speedMul: 1, mat: 0
  }, o);
  if (b.shape !== 'cube' && o.opaque === undefined) { b.opaque = false; if (o.filter === undefined) b.filter = 0; }
  if (b.render > 0 && o.opaque === undefined) { b.opaque = false; if (o.filter === undefined) b.filter = b.render === 2 ? 1 : 0; }
  b.sh = SH[b.shape];
  if (b.sh === undefined) throw new Error('bad shape ' + b.shape);
  BLOCKS.push(b); BL[name] = b.id; return b;
}
const rnd = (a, b) => (r) => a + Math.floor(r() * (b - a + 1));
const oreDrop = (item, a = 1, b = 1) => (meta, ctx) => {
  let n = a + Math.floor(ctx.rng() * (b - a + 1));
  if (ctx.fortune) n *= Math.max(1, 1 + Math.floor(ctx.rng() * (ctx.fortune + 2)) - 1);
  return [[item, n]];
};

defBlock('air', { shape: 'none', solid: false, opaque: false, filter: 0, item: false, hard: 0, replace: true, tex: null });
// --- stone family
defBlock('stone', { ...ST, hard: 1.5, drop: 'cobblestone' });
defBlock('granite', { ...ST, hard: 1.5 }); defBlock('polished_granite', { ...ST, hard: 1.5 });
defBlock('diorite', { ...ST, hard: 1.5 }); defBlock('polished_diorite', { ...ST, hard: 1.5 });
defBlock('andesite', { ...ST, hard: 1.5 }); defBlock('polished_andesite', { ...ST, hard: 1.5 });
defBlock('deepslate', { ...ST, hard: 3, drop: 'cobbled_deepslate', tex: { t: 'deepslate_top', b: 'deepslate_top', s: 'deepslate' } });
defBlock('cobbled_deepslate', { ...ST, hard: 3.5 }); defBlock('deepslate_bricks', { ...ST, hard: 3.5 });
defBlock('tuff', { ...ST, hard: 1.5 }); defBlock('calcite', { ...ST, hard: 0.75 });
defBlock('smooth_stone', { ...ST, hard: 2 });
defBlock('stone_bricks', { ...ST, hard: 1.5 }); defBlock('mossy_stone_bricks', { ...ST, hard: 1.5 });
defBlock('cracked_stone_bricks', { ...ST, hard: 1.5 }); defBlock('chiseled_stone_bricks', { ...ST, hard: 1.5 });
defBlock('cobblestone', { ...ST, hard: 2 }); defBlock('mossy_cobblestone', { ...ST, hard: 2 });
defBlock('bedrock', { ...ST, hard: -1 });
defBlock('obsidian', { ...ST, hard: 50, tier: 4, mat: 2 });
defBlock('crying_obsidian', { ...ST, hard: 50, tier: 4, light: 10, mat: 2 });
defBlock('infested_stone', { ...ST, tier: 0, hard: 0.75, tex: 'stone', drop: null, cat: 'natural' });
defBlock('reinforced_deepslate', { ...ST, hard: -1, tex: { t: 'reinforced_deepslate_top', b: 'reinforced_deepslate_top', s: 'reinforced_deepslate' } });
// --- dirt family
const DT = { tool: 'shovel', snd: 'gravel', hard: 0.5, cat: 'natural' };
defBlock('grass_block', { ...DT, hard: 0.6, snd: 'grass', tint: 1, drop: 'dirt', tex: { t: 'grass_top', b: 'dirt', s: 'grass_side' } });
defBlock('dirt', DT); defBlock('coarse_dirt', DT); defBlock('rooted_dirt', DT);
defBlock('podzol', { ...DT, drop: 'dirt', tex: { t: 'podzol_top', b: 'dirt', s: 'podzol_side' } });
defBlock('mycelium', { ...DT, hard: 0.6, drop: 'dirt', tex: { t: 'mycelium_top', b: 'dirt', s: 'mycelium_side' } });
defBlock('mud', { ...DT, snd: 'mud', speedMul: 0.85 }); defBlock('packed_mud', { ...DT, tool: 'pickaxe', hard: 1, snd: 'stone' });
defBlock('mud_bricks', { ...ST, tier: 0, hard: 1.5 });
defBlock('clay', { ...DT, hard: 0.6, drop: (m, c) => [['clay_ball', 4]] });
defBlock('moss_block', { ...DT, tool: 'hoe', hard: 0.1, snd: 'grass' });
defBlock('farmland', { ...DT, hard: 0.6, shape: 'farmland', opaque: false, filter: 0, drop: 'dirt', tex: { t: 'farmland', b: 'dirt', s: 'dirt' } });
defBlock('dirt_path', { ...DT, hard: 0.65, shape: 'farmland', opaque: false, filter: 0, drop: 'dirt', tex: { t: 'dirt_path_top', b: 'dirt', s: 'dirt_path_side' } });
// --- sand family
defBlock('sand', { ...DT, snd: 'sand', gravity: true }); defBlock('red_sand', { ...DT, snd: 'sand', gravity: true });
defBlock('gravel', { ...DT, hard: 0.6, gravity: true, drop: (m, c) => [[c.rng() < 0.1 + c.fortune * 0.1 ? 'flint' : 'gravel', 1]] });
defBlock('sandstone', { ...ST, hard: 0.8, tex: { t: 'sandstone_top', b: 'sandstone_bottom', s: 'sandstone' } });
defBlock('cut_sandstone', { ...ST, hard: 0.8, tex: { t: 'sandstone_top', b: 'sandstone_top', s: 'cut_sandstone' } });
defBlock('chiseled_sandstone', { ...ST, hard: 0.8, tex: { t: 'sandstone_top', b: 'sandstone_top', s: 'chiseled_sandstone' } });
defBlock('smooth_sandstone', { ...ST, hard: 2, tex: 'sandstone_top' });
defBlock('red_sandstone', { ...ST, hard: 0.8, tex: { t: 'red_sandstone_top', b: 'red_sandstone_top', s: 'red_sandstone' } });
defBlock('cut_red_sandstone', { ...ST, hard: 0.8, tex: { t: 'red_sandstone_top', b: 'red_sandstone_top', s: 'cut_red_sandstone' } });
defBlock('soul_sand', { ...DT, snd: 'soul', speedMul: 0.45 }); defBlock('soul_soil', { ...DT, snd: 'soul' });
// --- ores
const ORE = (name, tier, drop, xp, hard = 3, extra = {}) => defBlock(name, { ...ST, tier, hard, drop, xp, cat: 'natural', mat: 1, ...extra });
ORE('coal_ore', 1, oreDrop('coal'), [0, 2]); ORE('deepslate_coal_ore', 1, oreDrop('coal'), [0, 2], 4.5);
ORE('iron_ore', 2, oreDrop('raw_iron'), null); ORE('deepslate_iron_ore', 2, oreDrop('raw_iron'), null, 4.5);
ORE('copper_ore', 2, oreDrop('raw_copper', 2, 5), null); ORE('deepslate_copper_ore', 2, oreDrop('raw_copper', 2, 5), null, 4.5);
ORE('gold_ore', 3, oreDrop('raw_gold'), null); ORE('deepslate_gold_ore', 3, oreDrop('raw_gold'), null, 4.5);
ORE('redstone_ore', 3, oreDrop('redstone', 4, 5), [1, 5]); ORE('deepslate_redstone_ore', 3, oreDrop('redstone', 4, 5), [1, 5], 4.5);
ORE('lapis_ore', 2, oreDrop('lapis_lazuli', 4, 9), [2, 5]); ORE('deepslate_lapis_ore', 2, oreDrop('lapis_lazuli', 4, 9), [2, 5], 4.5);
ORE('diamond_ore', 3, oreDrop('diamond'), [3, 7]); ORE('deepslate_diamond_ore', 3, oreDrop('diamond'), [3, 7], 4.5);
ORE('emerald_ore', 3, oreDrop('emerald'), [3, 7]); ORE('deepslate_emerald_ore', 3, oreDrop('emerald'), [3, 7], 4.5);
ORE('nether_quartz_ore', 1, oreDrop('quartz'), [2, 5], 3, { snd: 'nether' });
ORE('nether_gold_ore', 1, oreDrop('gold_nugget', 2, 6), [0, 1], 3, { snd: 'nether' });
ORE('ancient_debris', 4, undefined, null, 30, { tex: { t: 'ancient_debris_top', b: 'ancient_debris_top', s: 'ancient_debris_side' } });
// --- mineral blocks
const MB = (name, tier, hard, o = {}) => defBlock(name, { ...ST, tier, hard, snd: 'metal', mat: 3, ...o });
MB('coal_block', 1, 5, { snd: 'stone', mat: 0 }); MB('iron_block', 2, 5); MB('gold_block', 3, 3); MB('diamond_block', 3, 5, { mat: 4 });
MB('emerald_block', 3, 5, { mat: 4 }); MB('lapis_block', 2, 3, { snd: 'stone', mat: 0 }); MB('redstone_block', 1, 5, { mat: 0 });
MB('copper_block', 2, 3); MB('exposed_copper', 2, 3); MB('weathered_copper', 2, 3); MB('oxidized_copper', 2, 3, { mat: 0 });
MB('netherite_block', 4, 50); MB('raw_iron_block', 2, 5, { mat: 0, snd: 'stone' }); MB('raw_gold_block', 3, 5, { mat: 0, snd: 'stone' }); MB('raw_copper_block', 2, 5, { mat: 0, snd: 'stone' });
defBlock('quartz_block', { ...ST, hard: 0.8, tex: { t: 'quartz_block_top', b: 'quartz_block_top', s: 'quartz_block_side' } });
defBlock('quartz_pillar', { ...ST, hard: 0.8, tex: { t: 'quartz_pillar_top', b: 'quartz_pillar_top', s: 'quartz_pillar' } });
defBlock('chiseled_quartz_block', { ...ST, hard: 0.8 }); defBlock('smooth_quartz', { ...ST, hard: 2, tex: 'quartz_block_top' });
defBlock('amethyst_block', { ...ST, tier: 0, hard: 1.5, snd: 'amethyst', mat: 4 });
defBlock('budding_amethyst', { ...ST, tier: 0, hard: 1.5, snd: 'amethyst', drop: null, mat: 4, cat: 'natural' });
// --- wood
const LEAF_TINT = { oak: 2, spruce: 5, birch: 4, jungle: 2, acacia: 2, dark_oak: 2, mangrove: 2, cherry: 0 };
for (const w of WOODS) {
  defBlock(w + '_log', { ...WD, hard: 2, cat: 'natural', tex: { t: w + '_log_top', b: w + '_log_top', s: w + '_log' }, axis: true });
  defBlock(w + '_planks', { ...WD, hard: 2 });
  defBlock(w + '_leaves', {
    render: 1, filter: 1, hard: 0.2, tool: 'hoe', snd: 'grass', tint: LEAF_TINT[w], wave: 1, cat: 'natural', flam: 30, leaves: true,
    drop: (m, c) => { const r = []; const sap = w === 'mangrove' ? 'mangrove_propagule' : w + '_sapling'; if (c.rng() < 0.05 + c.fortune * 0.02) r.push([sap, 1]); if (c.rng() < 0.02) r.push(['stick', 1 + Math.floor(c.rng() * 2)]); if ((w === 'oak' || w === 'dark_oak') && c.rng() < 0.005 + c.fortune * 0.003) r.push(['apple', 1]); if (w === 'jungle' && c.rng() < 0.02) r.push(['cocoa_beans', 1]); return r; }
  });
  if (w !== 'mangrove') defBlock(w + '_sapling', { ...PLANT, wave: 0, replace: false, sapling: w });
}
defBlock('mangrove_propagule', { ...PLANT, wave: 0, replace: false, sapling: 'mangrove' });
defBlock('crimson_stem', { ...WD, flam: 0, hard: 2, cat: 'natural', tex: { t: 'crimson_stem_top', b: 'crimson_stem_top', s: 'crimson_stem' }, axis: true });
defBlock('warped_stem', { ...WD, flam: 0, hard: 2, cat: 'natural', tex: { t: 'warped_stem_top', b: 'warped_stem_top', s: 'warped_stem' }, axis: true });
defBlock('crimson_planks', { ...WD, flam: 0, hard: 2 }); defBlock('warped_planks', { ...WD, flam: 0, hard: 2 });
// --- glass & colored
defBlock('glass', { render: 1, hard: 0.3, snd: 'glass', drop: null, cullSame: true, mat: 5 });
for (const c of COLORS) defBlock(c + '_stained_glass', { render: 2, hard: 0.3, snd: 'glass', drop: null, cullSame: true, cat: 'colored', mat: 5, glassColor: COLOR_RGB[c] });
for (const c of COLORS) defBlock(c + '_wool', { hard: 0.8, tool: 'shears', snd: 'wool', cat: 'colored', flam: 30 });
for (const c of COLORS) defBlock(c + '_carpet', { shape: 'carpet', hard: 0.1, snd: 'wool', cat: 'colored', tex: c + '_wool', flam: 20 });
for (const c of COLORS) defBlock(c + '_concrete', { ...ST, hard: 1.8, cat: 'colored' });
defBlock('terracotta', { ...ST, hard: 1.25, cat: 'colored' });
for (const c of COLORS) defBlock(c + '_terracotta', { ...ST, hard: 1.25, cat: 'colored' });
// --- misc building / nature
defBlock('bricks', { ...ST, hard: 2 });
defBlock('bookshelf', { ...WD, hard: 1.5, tex: { t: 'oak_planks', b: 'oak_planks', s: 'bookshelf' }, drop: () => [['book', 3]] });
defBlock('nether_bricks', { ...ST, hard: 2, snd: 'nether' }); defBlock('red_nether_bricks', { ...ST, hard: 2, snd: 'nether' });
defBlock('prismarine', { ...ST, hard: 1.5 }); defBlock('prismarine_bricks', { ...ST, hard: 1.5 }); defBlock('dark_prismarine', { ...ST, hard: 1.5 });
defBlock('sea_lantern', { hard: 0.3, light: 15, snd: 'glass', drop: (m, c) => [['prismarine_crystals', 2 + Math.floor(c.rng() * 2)]] });
defBlock('purpur_block', { ...ST, hard: 1.5 });
defBlock('purpur_pillar', { ...ST, hard: 1.5, tex: { t: 'purpur_pillar_top', b: 'purpur_pillar_top', s: 'purpur_pillar' } });
defBlock('end_stone', { ...ST, hard: 3, cat: 'natural' }); defBlock('end_stone_bricks', { ...ST, hard: 3 });
defBlock('blackstone', { ...ST, hard: 1.5, cat: 'natural' }); defBlock('polished_blackstone', { ...ST, hard: 2 });
defBlock('polished_blackstone_bricks', { ...ST, hard: 1.5 });
defBlock('gilded_blackstone', { ...ST, hard: 1.5, cat: 'natural', drop: (m, c) => c.rng() < 0.1 ? [['gold_nugget', 2 + Math.floor(c.rng() * 4)]] : [['gilded_blackstone', 1]] });
defBlock('basalt', { ...ST, hard: 1.25, snd: 'basalt', cat: 'natural', axis: true, tex: { t: 'basalt_top', b: 'basalt_top', s: 'basalt_side' } });
defBlock('polished_basalt', { ...ST, hard: 1.25, snd: 'basalt', axis: true, tex: { t: 'polished_basalt_top', b: 'polished_basalt_top', s: 'polished_basalt_side' } });
defBlock('smooth_basalt', { ...ST, hard: 1.25, snd: 'basalt' });
defBlock('netherrack', { ...ST, hard: 0.4, snd: 'nether', cat: 'natural' });
defBlock('glowstone', { hard: 0.3, light: 15, snd: 'glass', cat: 'natural', drop: (m, c) => [['glowstone_dust', Math.min(4, 2 + Math.floor(c.rng() * (3 + c.fortune)))]] });
defBlock('magma_block', { ...ST, hard: 0.5, light: 3, cat: 'natural', hurt: 1 });
defBlock('bone_block', { ...ST, hard: 2, axis: true, tex: { t: 'bone_block_top', b: 'bone_block_top', s: 'bone_block_side' } });
defBlock('hay_block', { hard: 0.5, tool: 'hoe', snd: 'grass', axis: true, flam: 60, tex: { t: 'hay_block_top', b: 'hay_block_top', s: 'hay_block_side' } });
defBlock('honeycomb_block', { hard: 0.6, snd: 'coral' });
defBlock('slime_block', { render: 2, hard: 0, snd: 'slime', cat: 'redstone', bounce: true, cullSame: true });
defBlock('sponge', { hard: 0.6, tool: 'hoe', snd: 'grass' }); defBlock('wet_sponge', { hard: 0.6, tool: 'hoe', snd: 'grass' });
defBlock('snow_block', { hard: 0.2, tool: 'shovel', tier: 1, snd: 'snow', cat: 'natural', drop: () => [['snowball', 4]] });
defBlock('ice', { render: 2, filter: 1, hard: 0.5, tool: 'pickaxe', snd: 'glass', drop: null, cullSame: true, slip: 0.98, cat: 'natural', mat: 6 });
defBlock('packed_ice', { hard: 0.5, tool: 'pickaxe', snd: 'glass', drop: null, slip: 0.98, cat: 'natural', mat: 6 });
defBlock('blue_ice', { hard: 2.8, tool: 'pickaxe', snd: 'glass', drop: null, slip: 0.989, cat: 'natural', mat: 6 });
defBlock('dripstone_block', { ...ST, hard: 1.5, cat: 'natural' });
defBlock('sculk', { hard: 0.2, tool: 'hoe', snd: 'sculk', cat: 'natural', xp: [1, 1] });
defBlock('sculk_catalyst', { hard: 3, tool: 'hoe', snd: 'sculk', light: 6, cat: 'natural', xp: [5, 5], tex: { t: 'sculk_catalyst_top', b: 'sculk', s: 'sculk_catalyst_side' } });
defBlock('sculk_shrieker', { hard: 3, tool: 'hoe', snd: 'sculk', cat: 'natural', xp: [5, 5], tex: { t: 'sculk_shrieker_top', b: 'sculk', s: 'sculk_shrieker_side' } });
defBlock('crimson_nylium', { ...ST, hard: 0.4, snd: 'nether', drop: 'netherrack', cat: 'natural', tex: { t: 'crimson_nylium', b: 'netherrack', s: 'crimson_nylium_side' } });
defBlock('warped_nylium', { ...ST, hard: 0.4, snd: 'nether', drop: 'netherrack', cat: 'natural', tex: { t: 'warped_nylium', b: 'netherrack', s: 'warped_nylium_side' } });
defBlock('nether_wart_block', { hard: 1, tool: 'hoe', snd: 'grass', cat: 'natural' });
defBlock('warped_wart_block', { hard: 1, tool: 'hoe', snd: 'grass', cat: 'natural' });
defBlock('shroomlight', { hard: 1, tool: 'hoe', snd: 'grass', light: 15, cat: 'natural' });
defBlock('mushroom_stem', { hard: 0.2, tool: 'axe', snd: 'wood', cat: 'natural', drop: null });
defBlock('brown_mushroom_block', { hard: 0.2, tool: 'axe', snd: 'wood', cat: 'natural', drop: (m, c) => { const n = Math.max(0, Math.floor(c.rng() * 10) - 7); return n ? [['brown_mushroom', n]] : []; } });
defBlock('red_mushroom_block', { hard: 0.2, tool: 'axe', snd: 'wood', cat: 'natural', drop: (m, c) => { const n = Math.max(0, Math.floor(c.rng() * 10) - 7); return n ? [['red_mushroom', n]] : []; } });
defBlock('pumpkin', { hard: 1, tool: 'axe', snd: 'wood', cat: 'natural', tex: { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side' } });
defBlock('carved_pumpkin', { hard: 1, tool: 'axe', snd: 'wood', facing: true, tex: { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side', f: 'carved_pumpkin' } });
defBlock('jack_o_lantern', { hard: 1, tool: 'axe', snd: 'wood', facing: true, light: 15, tex: { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side', f: 'jack_o_lantern' } });
defBlock('melon', { hard: 1, tool: 'axe', snd: 'wood', cat: 'natural', tex: { t: 'melon_top', b: 'melon_top', s: 'melon_side' }, drop: (m, c) => [['melon_slice', Math.min(9, 3 + Math.floor(c.rng() * (5 + c.fortune)))]] });
defBlock('cactus', { shape: 'cactus', render: 1, hard: 0.4, snd: 'wool', cat: 'natural', hurt: 1, tex: { t: 'cactus_top', b: 'cactus_bottom', s: 'cactus_side' } });
defBlock('tnt', { hard: 0, snd: 'grass', cat: 'redstone', flam: 15, tex: { t: 'tnt_top', b: 'tnt_bottom', s: 'tnt_side' } });
defBlock('note_block', { ...WD, hard: 0.8, cat: 'redstone' });
defBlock('jukebox', { ...WD, hard: 2, cat: 'functional', tex: { t: 'jukebox_top', b: 'oak_planks', s: 'jukebox_side' } });
defBlock('crafting_table', { ...WD, hard: 2.5, cat: 'functional', facing: true, tex: { t: 'crafting_table_top', b: 'oak_planks', s: 'crafting_table_side', f: 'crafting_table_front' } });
defBlock('furnace', { ...ST, hard: 3.5, cat: 'functional', facing: true, tex: { t: 'furnace_top', b: 'furnace_top', s: 'furnace_side', f: 'furnace_front' } });
defBlock('lit_furnace', { ...ST, hard: 3.5, facing: true, light: 13, drop: 'furnace', item: false, tex: { t: 'furnace_top', b: 'furnace_top', s: 'furnace_side', f: 'furnace_front_on' } });
defBlock('smoker', { ...ST, hard: 3.5, cat: 'functional', facing: true, tex: { t: 'smoker_top', b: 'smoker_top', s: 'smoker_side', f: 'smoker_front' } });
defBlock('blast_furnace', { ...ST, hard: 3.5, cat: 'functional', facing: true, tex: { t: 'blast_furnace_top', b: 'blast_furnace_top', s: 'blast_furnace_side', f: 'blast_furnace_front' } });
defBlock('chest', { ...WD, shape: 'chest', hard: 2.5, cat: 'functional', facing: true, tex: { t: 'chest_top', b: 'chest_top', s: 'chest_side', f: 'chest_front' } });
defBlock('ender_chest', { ...ST, shape: 'chest', hard: 22.5, light: 7, cat: 'functional', facing: true, drop: () => [['obsidian', 8]], tex: { t: 'ender_chest_top', b: 'ender_chest_top', s: 'ender_chest_side', f: 'ender_chest_front' } });
defBlock('barrel', { ...WD, hard: 2.5, cat: 'functional', tex: { t: 'barrel_top', b: 'barrel_bottom', s: 'barrel_side' } });
defBlock('red_bed', { shape: 'bed', hard: 0.2, snd: 'wood', cat: 'functional', tex: { t: 'bed_top', b: 'oak_planks', s: 'bed_side' } });
defBlock('enchanting_table', { ...ST, shape: 'etable', hard: 5, light: 7, cat: 'functional', tex: { t: 'enchanting_table_top', b: 'obsidian', s: 'enchanting_table_side' } });
defBlock('anvil', { ...ST, shape: 'anvil', hard: 5, snd: 'metal', gravity: true, cat: 'functional', facing: true, tex: { t: 'anvil_top', b: 'anvil', s: 'anvil' } });
defBlock('cauldron', { ...ST, shape: 'cauldron', hard: 2, snd: 'metal', cat: 'functional', tex: { t: 'cauldron_top', b: 'cauldron_bottom', s: 'cauldron_side' } });
defBlock('brewing_stand', { ...ST, shape: 'brewing', hard: 0.5, light: 1, snd: 'metal', cat: 'functional', render: 1, tex: { t: 'brewing_stand_base', b: 'brewing_stand_base', s: 'brewing_stand' } });
defBlock('beacon', { render: 1, hard: 3, light: 15, snd: 'glass', cat: 'functional', mat: 5 });
defBlock('spawner', { ...ST, render: 1, hard: 5, drop: null, xp: [15, 43], cat: 'functional' });
defBlock('end_portal_frame', { ...ST, shape: 'frame', hard: -1, light: 1, cat: 'functional', tex: { t: 'end_portal_frame_top', b: 'end_stone', s: 'end_portal_frame_side' } });
defBlock('end_portal', { shape: 'endportal', solid: false, hard: -1, light: 15, item: false, tex: 'obsidian' });
defBlock('nether_portal', { shape: 'portal', render: 2, solid: false, hard: -1, light: 11, item: false, snd: 'glass' });
defBlock('end_gateway', { shape: 'endportal', solid: false, hard: -1, light: 15, item: false, tex: 'obsidian' });
defBlock('dragon_egg', { shape: 'egg', hard: 3, light: 1, gravity: true, cat: 'functional' });
defBlock('smithing_table', { ...WD, hard: 2.5, cat: 'functional', tex: { t: 'smithing_table_top', b: 'smithing_table_bottom', s: 'smithing_table_side' } });
defBlock('fletching_table', { ...WD, hard: 2.5, cat: 'functional', tex: { t: 'fletching_table_top', b: 'oak_planks', s: 'fletching_table_side' } });
defBlock('cartography_table', { ...WD, hard: 2.5, cat: 'functional', tex: { t: 'cartography_table_top', b: 'dark_oak_planks', s: 'cartography_table_side' } });
defBlock('loom', { ...WD, hard: 2.5, cat: 'functional', facing: true, tex: { t: 'loom_top', b: 'oak_planks', s: 'loom_side', f: 'loom_front' } });
for (const c of ['tube', 'brain', 'bubble', 'fire', 'horn']) {
  defBlock(c + '_coral_block', { ...ST, hard: 1.5, snd: 'coral', cat: 'natural' });
  defBlock(c + '_coral', { ...PLANT, replace: false, wave: 2, waterlogged: true, drop: null });
}
// --- plants
defBlock('short_grass', { ...PLANT, tint: 1, drop: (m, c) => c.rng() < 0.125 ? [['wheat_seeds', 1]] : [] });
defBlock('fern', { ...PLANT, tint: 1, drop: (m, c) => c.rng() < 0.125 ? [['wheat_seeds', 1]] : [] });
defBlock('tall_grass', { ...PLANT, tint: 1, drop: (m, c) => c.rng() < 0.125 ? [['wheat_seeds', 1]] : [] });
defBlock('dead_bush', { ...PLANT, wave: 0, drop: (m, c) => { const n = Math.floor(c.rng() * 3); return n ? [['stick', n]] : []; } });
const FLOWERS = ['dandelion', 'poppy', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'sunflower', 'lilac', 'rose_bush', 'peony', 'torchflower'];
for (const f of FLOWERS) defBlock(f, { ...PLANT, replace: false, flower: true });
defBlock('brown_mushroom', { ...PLANT, wave: 0, replace: false, light: 1 }); defBlock('red_mushroom', { ...PLANT, wave: 0, replace: false });
defBlock('crimson_fungus', { ...PLANT, wave: 0, replace: false }); defBlock('warped_fungus', { ...PLANT, wave: 0, replace: false });
defBlock('crimson_roots', { ...PLANT }); defBlock('warped_roots', { ...PLANT }); defBlock('nether_sprouts', { ...PLANT, drop: null });
defBlock('weeping_vines', { ...PLANT, wave: 0, climb: true, replace: false }); defBlock('twisting_vines', { ...PLANT, wave: 0, climb: true, replace: false });
defBlock('vine', { ...THIN, shape: 'vine', hard: 0.2, tool: 'shears', snd: 'grass', tint: 2, climb: true, cat: 'natural', replace: true, drop: null, flam: 15 });
defBlock('glow_lichen', { ...THIN, shape: 'vine', hard: 0.2, tool: 'shears', snd: 'grass', light: 7, cat: 'natural', replace: true, drop: null });
defBlock('lily_pad', { ...THIN, shape: 'lilypad', solid: true, hard: 0, snd: 'grass', tint: 6, cat: 'natural' });
defBlock('seagrass', { ...PLANT, waterlogged: true, drop: null, tex: 'seagrass' });
defBlock('kelp', { ...PLANT, waterlogged: true, replace: false });
defBlock('sugar_cane', { ...PLANT, wave: 0, replace: false });
defBlock('bamboo', { ...THIN, shape: 'bamboo', solid: true, hard: 1, tool: 'axe', snd: 'wood', cat: 'natural' });
defBlock('sweet_berry_bush', { ...PLANT, wave: 0, replace: false, item: false, hurt: 0.5, drop: (m) => m >= 2 ? [['sweet_berries', m === 3 ? 3 : 2]] : [['sweet_berries', 1]] });
defBlock('cobweb', { ...PLANT, wave: 0, replace: false, hard: 4, tool: 'sword', drop: () => [['string', 1]], web: true, cat: 'functional' });
defBlock('azalea', { render: 1, hard: 0, snd: 'grass', tint: 0, cat: 'natural', opaque: false, filter: 1 });
defBlock('flowering_azalea', { render: 1, hard: 0, snd: 'grass', cat: 'natural', opaque: false, filter: 1 });
defBlock('cave_vines', { ...PLANT, wave: 0, climb: true, replace: false, item: false, light: 0, drop: (m) => m ? [['glow_berries', 1]] : [] });
defBlock('cave_vines_lit', { ...PLANT, wave: 0, climb: true, replace: false, item: false, light: 14, drop: () => [['glow_berries', 1]] });
defBlock('moss_carpet', { shape: 'carpet', hard: 0.1, snd: 'grass', cat: 'natural', tex: 'moss_block' });
defBlock('pointed_dripstone', { ...PLANT, wave: 0, replace: false, hard: 1.5, tool: 'pickaxe', snd: 'stone' });
defBlock('amethyst_cluster', { ...PLANT, wave: 0, replace: false, hard: 1.5, tool: 'pickaxe', snd: 'amethyst', light: 5, drop: () => [['amethyst_shard', 4]] });
defBlock('chorus_plant', { shape: 'chorus', hard: 0.4, tool: 'axe', snd: 'wood', cat: 'natural', drop: (m, c) => c.rng() < 0.5 ? [['chorus_fruit', 1]] : [] });
defBlock('chorus_flower', { render: 1, hard: 0.4, tool: 'axe', snd: 'wood', cat: 'natural', opaque: false, filter: 0 });
defBlock('mangrove_roots', { render: 1, hard: 0.7, tool: 'axe', snd: 'wood', cat: 'natural', opaque: false, filter: 1 });
defBlock('sea_pickle', { shape: 'pickle', hard: 0, snd: 'slime', light: 6, cat: 'natural', solid: false });
defBlock('wheat', { ...PLANT, shape: 'crop', wave: 0, replace: false, item: false, crop: 7, tex: 'wheat_stage0', drop: (m, c) => m >= 7 ? [['wheat', 1], ['wheat_seeds', 1 + Math.floor(c.rng() * 3)]] : [['wheat_seeds', 1]] });
defBlock('carrots', { ...PLANT, shape: 'crop', wave: 0, replace: false, item: false, crop: 7, tex: 'carrots_stage0', drop: (m, c) => [['carrot', m >= 7 ? 2 + Math.floor(c.rng() * 3) : 1]] });
defBlock('potatoes', { ...PLANT, shape: 'crop', wave: 0, replace: false, item: false, crop: 7, tex: 'potatoes_stage0', drop: (m, c) => [['potato', m >= 7 ? 2 + Math.floor(c.rng() * 3) : 1]] });
defBlock('beetroots', { ...PLANT, shape: 'crop', wave: 0, replace: false, item: false, crop: 3, tex: 'beetroots_stage0', drop: (m, c) => m >= 3 ? [['beetroot', 1], ['beetroot_seeds', 1 + Math.floor(c.rng() * 3)]] : [['beetroot_seeds', 1]] });
defBlock('nether_wart', { ...PLANT, shape: 'crop', wave: 0, replace: false, item: false, crop: 3, tex: 'nether_wart_stage0', drop: (m, c) => [['nether_wart', m >= 3 ? 2 + Math.floor(c.rng() * 3) : 1]] });
// --- thin/functional
defBlock('torch', { ...THIN, shape: 'torch', hard: 0, light: 14, snd: 'wood', cat: 'functional' });
defBlock('soul_torch', { ...THIN, shape: 'torch', hard: 0, light: 10, snd: 'wood', cat: 'functional' });
defBlock('redstone_torch', { ...THIN, shape: 'torch', hard: 0, light: 7, snd: 'wood', cat: 'redstone', power: true });
defBlock('redstone_torch_off', { ...THIN, shape: 'torch', hard: 0, light: 0, snd: 'wood', item: false, drop: 'redstone_torch' });
defBlock('lantern', { ...THIN, shape: 'lantern', solid: true, hard: 3.5, tool: 'pickaxe', light: 15, snd: 'metal', cat: 'functional' });
defBlock('soul_lantern', { ...THIN, shape: 'lantern', solid: true, hard: 3.5, tool: 'pickaxe', light: 10, snd: 'metal', cat: 'functional' });
defBlock('ladder', { ...THIN, shape: 'wall', hard: 0.4, tool: 'axe', snd: 'wood', climb: true, cat: 'functional' });
defBlock('oak_door', { ...THIN, shape: 'door', solid: true, hard: 3, tool: 'axe', snd: 'wood', cat: 'redstone', tex: { t: 'oak_door_top', b: 'oak_door_bottom', s: 'oak_door_bottom' } });
defBlock('iron_door', { ...THIN, shape: 'door', solid: true, hard: 5, tool: 'pickaxe', tier: 1, snd: 'metal', cat: 'redstone', tex: { t: 'iron_door_top', b: 'iron_door_bottom', s: 'iron_door_bottom' } });
defBlock('oak_trapdoor', { ...THIN, shape: 'trapdoor', solid: true, hard: 3, tool: 'axe', snd: 'wood', cat: 'redstone' });
defBlock('oak_fence', { ...THIN, render: 0, shape: 'fence', solid: true, hard: 2, tool: 'axe', snd: 'wood', tex: 'oak_planks', cat: 'building' });
defBlock('nether_brick_fence', { ...THIN, render: 0, shape: 'fence', solid: true, hard: 2, tool: 'pickaxe', tier: 1, snd: 'nether', tex: 'nether_bricks' });
defBlock('glass_pane', { ...THIN, shape: 'pane', solid: true, hard: 0.3, snd: 'glass', drop: null, tex: 'glass' });
defBlock('iron_bars', { ...THIN, shape: 'pane', solid: true, hard: 5, tool: 'pickaxe', tier: 1, snd: 'metal' });
defBlock('chain', { ...THIN, shape: 'chain', solid: true, hard: 5, tool: 'pickaxe', tier: 1, snd: 'metal', cat: 'functional' });
defBlock('end_rod', { ...THIN, shape: 'rod', solid: true, hard: 0, light: 14, snd: 'wood', cat: 'functional' });
defBlock('campfire', { ...THIN, shape: 'campfire', solid: true, hard: 2, tool: 'axe', snd: 'wood', light: 15, hurt: 1, cat: 'functional', drop: () => [['charcoal', 2]] });
defBlock('soul_campfire', { ...THIN, shape: 'campfire', solid: true, hard: 2, tool: 'axe', snd: 'wood', light: 10, hurt: 2, cat: 'functional', drop: () => [['soul_soil', 1]] });
defBlock('fire', { ...THIN, shape: 'fire', hard: 0, light: 15, item: false, drop: null, replace: true, hurt: 1, snd: 'wool' });
defBlock('soul_fire', { ...THIN, shape: 'fire', hard: 0, light: 10, item: false, drop: null, replace: true, hurt: 2, snd: 'wool' });
defBlock('redstone_wire', { ...THIN, shape: 'wire', hard: 0, item: false, drop: 'redstone', snd: 'stone', tex: 'redstone_dust_dot' });
defBlock('lever', { ...THIN, shape: 'lever', hard: 0.5, snd: 'wood', cat: 'redstone', power: true, tex: 'cobblestone' });
defBlock('stone_button', { ...THIN, shape: 'button', hard: 0.5, snd: 'stone', cat: 'redstone', power: true, tex: 'stone' });
defBlock('oak_button', { ...THIN, shape: 'button', hard: 0.5, snd: 'wood', cat: 'redstone', power: true, tex: 'oak_planks' });
defBlock('stone_pressure_plate', { ...THIN, shape: 'plate', hard: 0.5, snd: 'stone', cat: 'redstone', power: true, tex: 'stone' });
defBlock('oak_pressure_plate', { ...THIN, shape: 'plate', hard: 0.5, snd: 'wood', cat: 'redstone', power: true, tex: 'oak_planks' });
defBlock('redstone_lamp', { hard: 0.3, snd: 'glass', cat: 'redstone' });
defBlock('lit_redstone_lamp', { hard: 0.3, snd: 'glass', light: 15, item: false, drop: 'redstone_lamp' });
defBlock('rail', { ...THIN, shape: 'rail', hard: 0.7, tool: 'pickaxe', snd: 'metal', cat: 'redstone' });
defBlock('snow', { shape: 'layer', hard: 0.1, tool: 'shovel', tier: 1, snd: 'snow', cat: 'natural', replace: true, drop: () => [['snowball', 1]], tex: 'snow_block' });
defBlock('cake', { shape: 'cake', hard: 0.5, snd: 'wool', cat: 'food', drop: null, tex: { t: 'cake_top', b: 'cake_bottom', s: 'cake_side' } });
for (const h of ['skeleton_skull', 'wither_skeleton_skull', 'zombie_head', 'creeper_head', 'player_head', 'dragon_head', 'piglin_head'])
  defBlock(h, { ...THIN, render: 0, shape: 'head', solid: true, hard: 1, snd: 'stone', cat: 'functional', facing: true, tex: { t: h + '_top', b: h + '_top', s: h + '_side', f: h + '_face' }, rarity: h === 'dragon_head' ? 'epic' : 'uncommon' });
// --- liquids
defBlock('water', { shape: 'liquid', render: 2, solid: false, opaque: false, filter: 2, hard: 100, item: false, replace: true, cullSame: true, drop: null, liquid: 1 });
defBlock('lava', { shape: 'liquid', render: 0, solid: false, opaque: false, filter: 0, hard: 100, item: false, replace: true, cullSame: true, drop: null, light: 15, liquid: 2, hurt: 4 });
// --- slabs & stairs
const SLAB_MATS = [['oak', 'oak_planks'], ['spruce', 'spruce_planks'], ['birch', 'birch_planks'], ['jungle', 'jungle_planks'], ['acacia', 'acacia_planks'], ['dark_oak', 'dark_oak_planks'], ['mangrove', 'mangrove_planks'], ['cherry', 'cherry_planks'], ['crimson', 'crimson_planks'], ['warped', 'warped_planks'],
  ['stone', 'stone'], ['cobblestone', 'cobblestone'], ['mossy_cobblestone', 'mossy_cobblestone'], ['stone_brick', 'stone_bricks'], ['mossy_stone_brick', 'mossy_stone_bricks'], ['smooth_stone', 'smooth_stone'], ['sandstone', 'sandstone'], ['red_sandstone', 'red_sandstone'], ['brick', 'bricks'], ['nether_brick', 'nether_bricks'],
  ['quartz', 'quartz_block'], ['purpur', 'purpur_block'], ['prismarine', 'prismarine'], ['blackstone', 'blackstone'], ['polished_blackstone_brick', 'polished_blackstone_bricks'], ['deepslate_brick', 'deepslate_bricks'], ['mud_brick', 'mud_bricks'], ['end_stone_brick', 'end_stone_bricks'], ['granite', 'granite'], ['diorite', 'diorite'], ['andesite', 'andesite'], ['cobbled_deepslate', 'cobbled_deepslate']];
for (const [n, base] of SLAB_MATS) {
  const bb = BLOCKS[BL[base]];
  const common = { tex: bb.tex, hard: bb.hard, tool: bb.tool, tier: bb.tier, snd: bb.snd, flam: bb.flam, cat: 'building', base: bb.id };
  defBlock(n + '_slab', { ...common, shape: 'slab', solid: true });
  defBlock(n + '_stairs', { ...common, shape: 'stairs', solid: true });
}

// Item registry
const ITEMS = [], IT = {};
function defItem(name, o = {}) {
  if (IT[name] !== undefined) { Object.assign(ITEMS[IT[name]], o); return ITEMS[IT[name]]; }
  const it = Object.assign({ id: ITEMS.length, name, label: titleCase(name), stack: 64, cat: 'ingredients', icon: name }, o);
  ITEMS.push(it); IT[name] = it.id; return it;
}
// block items first (same names as blocks)
for (const b of BLOCKS) if (b.item) defItem(b.name, { block: b.id, places: b.id, cat: b.cat, label: b.label, rarity: b.rarity });
// tools
const TIERS = { wooden: { tier: 1, dur: 59, speed: 2, mat: '#planks', ench: 15 }, stone: { tier: 2, dur: 131, speed: 4, mat: '#stone_tool', ench: 5 }, iron: { tier: 3, dur: 250, speed: 6, mat: 'iron_ingot', ench: 14 }, golden: { tier: 1, dur: 32, speed: 12, mat: 'gold_ingot', ench: 22 }, diamond: { tier: 4, dur: 1561, speed: 8, mat: 'diamond', ench: 10 }, netherite: { tier: 5, dur: 2031, speed: 9, mat: null, ench: 15 } };
const TOOL_DMG = { sword: [4, 5, 6, 4, 7, 8], axe: [7, 9, 9, 7, 9, 10], pickaxe: [2, 3, 4, 2, 5, 6], shovel: [2.5, 3.5, 4.5, 2.5, 5.5, 6.5], hoe: [1, 1, 1, 1, 1, 1] };
const TOOL_CD = { sword: 0.625, axe: 1.0, pickaxe: 0.83, shovel: 1, hoe: 0.5 };
Object.keys(TIERS).forEach((t, ti) => {
  for (const type of ['sword', 'pickaxe', 'axe', 'shovel', 'hoe']) {
    const T = TIERS[t];
    defItem(t + '_' + type, { stack: 1, cat: type === 'sword' || type === 'axe' ? 'combat' : 'tools', tool: { type, tier: T.tier, speed: T.speed, dmg: TOOL_DMG[type][ti], mat: t }, dur: T.dur, ench: T.ench, label: titleCase((t === 'golden' ? 'golden' : t) + ' ' + type), fireproof: t === 'netherite' });
  }
});
// armor
const ARMOR_MATS = { leather: { def: [1, 3, 2, 1], dur: 5, tough: 0, ench: 15 }, chainmail: { def: [2, 5, 4, 1], dur: 15, tough: 0, ench: 12 }, iron: { def: [2, 6, 5, 2], dur: 15, tough: 0, ench: 9 }, golden: { def: [2, 5, 3, 1], dur: 7, tough: 0, ench: 25 }, diamond: { def: [3, 8, 6, 3], dur: 33, tough: 2, ench: 10 }, netherite: { def: [3, 8, 6, 3], dur: 37, tough: 3, ench: 15 } };
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'], ARMOR_DURMUL = [11, 16, 15, 13];
for (const m in ARMOR_MATS) ARMOR_SLOTS.forEach((s, i) => defItem(m + '_' + s, { stack: 1, cat: 'combat', armor: { slot: i, def: ARMOR_MATS[m].def[i], tough: ARMOR_MATS[m].tough, mat: m }, dur: ARMOR_MATS[m].dur * ARMOR_DURMUL[i], ench: ARMOR_MATS[m].ench, fireproof: m === 'netherite' }));
defItem('turtle_helmet', { stack: 1, cat: 'combat', armor: { slot: 0, def: 2, tough: 0, mat: 'turtle' }, dur: 275, ench: 9 });
defItem('elytra', { stack: 1, cat: 'tools', armor: { slot: 1, def: 0, tough: 0, mat: 'elytra' }, dur: 432, rarity: 'uncommon' });
// other gear
const G = (n, o) => defItem(n, { stack: 1, cat: 'tools', ...o });
G('bow', { dur: 384, cat: 'combat', ench: 1, ranged: 'bow' }); G('crossbow', { dur: 465, cat: 'combat', ench: 1, ranged: 'crossbow' });
G('trident', { dur: 250, cat: 'combat', ench: 1, rarity: 'rare', tool: { type: 'trident', tier: 0, speed: 1, dmg: 9 } });
G('shield', { dur: 336, cat: 'combat' }); G('fishing_rod', { dur: 64, ench: 1 }); G('flint_and_steel', { dur: 64 }); G('shears', { dur: 238, tool: { type: 'shears', tier: 0, speed: 1.5, dmg: 1 } });
G('carrot_on_a_stick', { dur: 25 }); G('totem_of_undying', { cat: 'combat', rarity: 'uncommon' }); G('compass'); G('clock'); G('spyglass');
G('bucket', { stack: 16 }); G('water_bucket'); G('lava_bucket'); G('milk_bucket', { cat: 'food' }); G('saddle'); G('oak_boat', { label: 'Oak Boat' });
G('name_tag'); G('lead', { stack: 64 });
defItem('ender_pearl', { stack: 16, throwable: 'ender_pearl' }); defItem('ender_eye', { label: 'Eye of Ender', throwable: 'eye_of_ender' });
defItem('snowball', { stack: 16, throwable: 'snowball' }); defItem('egg', { stack: 16, throwable: 'egg' }); defItem('fire_charge');
defItem('experience_bottle', { label: 'Bottle o\' Enchanting', throwable: 'xp_bottle', rarity: 'uncommon' });
defItem('firework_rocket', { cat: 'tools' }); defItem('end_crystal', { rarity: 'rare', cat: 'functional' }); defItem('wind_charge', { throwable: 'wind_charge', cat: 'combat' });
for (const d of ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', 'wait', 'otherside', 'pigstep']) defItem('music_disc_' + d, { stack: 1, cat: 'tools', disc: d, label: 'Music Disc', rarity: 'rare' });
// food
const F = (n, h, s, o = {}) => defItem(n, { cat: 'food', food: [h, s], ...o });
F('apple', 4, 2.4); F('golden_apple', 4, 9.6, { rarity: 'rare', effects: [['regeneration', 5, 1], ['absorption', 120, 0]] });
F('enchanted_golden_apple', 4, 9.6, { rarity: 'epic', glint: true, effects: [['regeneration', 20, 1], ['absorption', 120, 3], ['resistance', 300, 0], ['fire_resistance', 300, 0]] });
F('bread', 5, 6); F('porkchop', 3, 1.8, { label: 'Raw Porkchop' }); F('cooked_porkchop', 8, 12.8); F('beef', 3, 1.8, { label: 'Raw Beef' }); F('cooked_beef', 8, 12.8, { label: 'Steak' });
F('chicken', 2, 1.2, { label: 'Raw Chicken', effects: [['hunger', 30, 0, 0.3]] }); F('cooked_chicken', 6, 7.2); F('mutton', 2, 1.2, { label: 'Raw Mutton' }); F('cooked_mutton', 6, 9.6);
F('rabbit', 3, 1.8, { label: 'Raw Rabbit' }); F('cooked_rabbit', 5, 6); F('rabbit_stew', 10, 12, { stack: 1 }); F('cod', 2, 0.4, { label: 'Raw Cod' }); F('cooked_cod', 5, 6);
F('salmon', 2, 0.4, { label: 'Raw Salmon' }); F('cooked_salmon', 6, 9.6); F('tropical_fish', 1, 0.2); F('pufferfish', 1, 0.2, { effects: [['poison', 60, 1], ['hunger', 15, 2], ['nausea', 15, 0]] });
F('carrot', 3, 3.6, { places: BL.carrots }); F('golden_carrot', 6, 14.4); F('potato', 1, 0.6, { places: BL.potatoes }); F('baked_potato', 5, 6); F('beetroot', 1, 1.2);
F('beetroot_soup', 6, 7.2, { stack: 1 }); F('mushroom_stew', 6, 7.2, { stack: 1 }); F('cookie', 2, 0.4); F('melon_slice', 2, 1.2); F('pumpkin_pie', 8, 4.8);
F('dried_kelp', 1, 0.6); F('sweet_berries', 2, 0.4, { places: BL.sweet_berry_bush }); F('glow_berries', 2, 0.4, { places: BL.cave_vines }); F('chorus_fruit', 4, 2.4, { teleport: true });
F('rotten_flesh', 4, 0.8, { effects: [['hunger', 30, 0, 0.8]] }); F('spider_eye', 2, 3.2, { effects: [['poison', 4, 0]] }); F('honey_bottle', 6, 1.2, { stack: 16 });
F('suspicious_stew', 6, 7.2, { stack: 1, effects: [['night_vision', 8, 0]] });
// materials
const MATS = ['stick', 'coal', 'charcoal', 'diamond', 'emerald', 'lapis_lazuli', 'quartz', 'amethyst_shard', 'raw_iron', 'raw_gold', 'raw_copper', 'iron_ingot', 'gold_ingot', 'copper_ingot',
  'netherite_scrap', 'netherite_ingot', 'iron_nugget', 'gold_nugget', 'flint', 'feather', 'leather', 'rabbit_hide', 'string', 'gunpowder', 'bone', 'bone_meal', 'slime_ball', 'blaze_rod', 'blaze_powder',
  'ghast_tear', 'magma_cream', 'glowstone_dust', 'sugar', 'paper', 'book', 'wheat', 'egg_shell', 'ink_sac', 'glow_ink_sac', 'clay_ball', 'brick', 'nether_brick', 'prismarine_shard', 'prismarine_crystals',
  'nautilus_shell', 'heart_of_the_sea', 'turtle_scute', 'phantom_membrane', 'shulker_shell', 'nether_star', 'dragon_breath', 'echo_shard', 'honeycomb', 'fermented_spider_eye', 'glistering_melon_slice',
  'rabbit_foot', 'cocoa_beans', 'popped_chorus_fruit', 'bowl', 'glass_bottle', 'armadillo_scute', 'breeze_rod', 'arrow', 'firework_star', 'enchanted_book', 'filled_map', 'map'];
for (const m of MATS) defItem(m);
defItem('redstone', { places: BL.redstone_wire, cat: 'redstone', label: 'Redstone Dust' });
defItem('wheat_seeds', { places: BL.wheat, cat: 'natural' }); defItem('beetroot_seeds', { places: BL.beetroots, cat: 'natural' });
defItem('pumpkin_seeds', { cat: 'natural' }); defItem('melon_seeds', { cat: 'natural' });
defItem('nether_wart', { places: BL.nether_wart, cat: 'ingredients' });
for (const c of COLORS) defItem(c + '_dye', { dye: c });
['nether_star', 'heart_of_the_sea', 'dragon_breath', 'experience_bottle', 'enchanted_book'].forEach(n => ITEMS[IT[n]].rarity = ITEMS[IT[n]].rarity || 'uncommon');
ITEMS[IT.nether_star].glint = true; ITEMS[IT.enchanted_book].glint = true; ITEMS[IT.enchanted_book].stack = 1; ITEMS[IT.experience_bottle].glint = true;
ITEMS[IT.egg_shell].hidden = true; ITEMS[IT.filled_map].hidden = true;
// potions
const EFFECTS = {
  speed: { c: '#7cafc6', l: 'Speed' }, slowness: { c: '#5a6c81', l: 'Slowness', bad: 1 }, haste: { c: '#d9c043', l: 'Haste' }, mining_fatigue: { c: '#4a4217', l: 'Mining Fatigue', bad: 1 },
  strength: { c: '#932423', l: 'Strength' }, instant_health: { c: '#f82423', l: 'Instant Health', inst: 1 }, instant_damage: { c: '#430a09', l: 'Instant Damage', bad: 1, inst: 1 },
  jump_boost: { c: '#22ff4c', l: 'Jump Boost' }, nausea: { c: '#551d4a', l: 'Nausea', bad: 1 }, regeneration: { c: '#cd5cab', l: 'Regeneration' }, resistance: { c: '#99453a', l: 'Resistance' },
  fire_resistance: { c: '#e49a3a', l: 'Fire Resistance' }, water_breathing: { c: '#2e5299', l: 'Water Breathing' }, invisibility: { c: '#7f8392', l: 'Invisibility' },
  blindness: { c: '#1f1f23', l: 'Blindness', bad: 1 }, night_vision: { c: '#1f1fa1', l: 'Night Vision' }, hunger: { c: '#587653', l: 'Hunger', bad: 1 }, weakness: { c: '#484d48', l: 'Weakness', bad: 1 },
  poison: { c: '#4e9331', l: 'Poison', bad: 1 }, wither: { c: '#352a27', l: 'Wither', bad: 1 }, absorption: { c: '#2552a5', l: 'Absorption' }, saturation: { c: '#f82423', l: 'Saturation' },
  levitation: { c: '#ceffff', l: 'Levitation', bad: 1 }, slow_falling: { c: '#f7f8e0', l: 'Slow Falling' }, darkness: { c: '#292721', l: 'Darkness', bad: 1 }, luck: { c: '#339900', l: 'Luck' }
};
const POTIONS = {
  water: { l: 'Water Bottle', c: '#385dc6' }, awkward: { l: 'Awkward Potion', c: '#385dc6' }, mundane: { l: 'Mundane Potion', c: '#385dc6' },
  swiftness: { e: ['speed', 180, 0] }, slowness: { e: ['slowness', 90, 0] }, strength: { e: ['strength', 180, 0] }, healing: { e: ['instant_health', 0, 0] }, harming: { e: ['instant_damage', 0, 0] },
  leaping: { e: ['jump_boost', 180, 0] }, regeneration: { e: ['regeneration', 45, 0] }, fire_resistance: { e: ['fire_resistance', 180, 0] }, water_breathing: { e: ['water_breathing', 180, 0] },
  invisibility: { e: ['invisibility', 180, 0] }, night_vision: { e: ['night_vision', 180, 0] }, poison: { e: ['poison', 45, 0] }, weakness: { e: ['weakness', 90, 0] }, slow_falling: { e: ['slow_falling', 90, 0] },
  strong_healing: { e: ['instant_health', 0, 1], l: 'Potion of Healing II' }, strong_strength: { e: ['strength', 90, 1], l: 'Potion of Strength II' }, strong_swiftness: { e: ['speed', 90, 1], l: 'Potion of Swiftness II' }, long_night_vision: { e: ['night_vision', 480, 0], l: 'Potion of Night Vision (8:00)' }
};
for (const p in POTIONS) {
  const P = POTIONS[p]; const col = P.c || EFFECTS[P.e[0]].c;
  defItem('potion_' + p, { stack: 1, cat: 'food', potion: p, color: col, label: P.l || ('Potion of ' + titleCase(p)), drink: true, glint: !!P.e });
}
const ENCH = {
  protection: { max: 4, on: 'armor' }, fire_protection: { max: 4, on: 'armor' }, blast_protection: { max: 4, on: 'armor' }, projectile_protection: { max: 4, on: 'armor' },
  feather_falling: { max: 4, on: 'boots' }, respiration: { max: 3, on: 'helmet' }, aqua_affinity: { max: 1, on: 'helmet' }, thorns: { max: 3, on: 'armor' }, depth_strider: { max: 3, on: 'boots' },
  sharpness: { max: 5, on: 'weapon' }, smite: { max: 5, on: 'weapon' }, bane_of_arthropods: { max: 5, on: 'weapon' }, knockback: { max: 2, on: 'sword' }, fire_aspect: { max: 2, on: 'sword' }, looting: { max: 3, on: 'sword' },
  efficiency: { max: 5, on: 'digger' }, silk_touch: { max: 1, on: 'digger' }, fortune: { max: 3, on: 'digger' }, unbreaking: { max: 3, on: 'any' }, mending: { max: 1, on: 'any', treasure: 1 },
  power: { max: 5, on: 'bow' }, punch: { max: 2, on: 'bow' }, flame: { max: 1, on: 'bow' }, infinity: { max: 1, on: 'bow' }, luck_of_the_sea: { max: 3, on: 'fishing_rod' }, lure: { max: 3, on: 'fishing_rod' },
  loyalty: { max: 3, on: 'trident' }, impaling: { max: 5, on: 'trident' }, channeling: { max: 1, on: 'trident' }
};
function enchApplies(it, e) {
  const on = ENCH[e].on;
  if (on === 'any') return !!it.dur;
  if (it.armor) return on === 'armor' || (on === 'boots' && it.armor.slot === 3) || (on === 'helmet' && it.armor.slot === 0);
  if (it.tool) { const t = it.tool.type; if (on === 'weapon') return t === 'sword' || t === 'axe'; if (on === 'sword') return t === 'sword'; if (on === 'digger') return t === 'pickaxe' || t === 'axe' || t === 'shovel' || t === 'hoe'; if (on === 'trident') return t === 'trident'; }
  if (it.name === 'bow' || it.name === 'crossbow') return on === 'bow';
  if (it.name === 'fishing_rod') return on === 'fishing_rod';
  if (it.name === 'book') return true;
  return false;
}
// tags
const TAGS = {
  planks: [...WOODS, 'crimson', 'warped'].map(w => w + '_planks'),
  logs: [...WOODS.map(w => w + '_log'), 'crimson_stem', 'warped_stem'],
  wool: COLORS.map(c => c + '_wool'), stone_tool: ['cobblestone', 'cobbled_deepslate', 'blackstone'], coals: ['coal', 'charcoal'],
  sand: ['sand', 'red_sand'], wooden_slabs: SLAB_MATS.slice(0, 10).map(s => s[0] + '_slab'), leaves: WOODS.map(w => w + '_leaves'),
  flowers: FLOWERS, saplings: [...WOODS.filter(w => w !== 'mangrove').map(w => w + '_sapling'), 'mangrove_propagule']
};
function matchIng(spec, id) {
  if (id == null) return false;
  if (spec[0] === '#') return TAGS[spec.slice(1)].some(n => IT[n] === id);
  return IT[spec] === id;
}
// recipes
const RECIPES = [];
function S(out, pattern, key) {
  const [on, oc] = out.split(':'); const rows = pattern.split('/'); const k = {};
  key.split(' ').forEach(p => { const [c, v] = p.split('='); k[c] = v; });
  if (IT[on] === undefined) throw new Error('recipe out ' + on);
  for (const c in k) if (k[c][0] !== '#' && IT[k[c]] === undefined) throw new Error('recipe ing ' + k[c]);
  RECIPES.push({ shaped: true, rows, key: k, w: Math.max(...rows.map(r => r.length)), h: rows.length, out: IT[on], count: +(oc || 1) });
}
function L(out, ings) {
  const [on, oc] = out.split(':'); const list = ings.split(' ');
  if (IT[on] === undefined) throw new Error('recipe out ' + on);
  for (const v of list) if (v[0] !== '#' && IT[v] === undefined) throw new Error('recipe ing ' + v);
  RECIPES.push({ shaped: false, ings: list, out: IT[on], count: +(oc || 1) });
}
for (const w of WOODS) { L(w + '_planks:4', w + '_log'); }
L('crimson_planks:4', 'crimson_stem'); L('warped_planks:4', 'warped_stem');
S('stick:4', '#/#', '#=#planks'); S('crafting_table', '##/##', '#=#planks'); S('chest', '###/# #/###', '#=#planks');
S('barrel', 'PSP/P P/PSP', 'P=#planks S=#wooden_slabs'); S('ladder:3', 'S S/SSS/S S', 'S=stick'); S('oak_door:3', '##/##/##', '#=#planks');
S('oak_trapdoor:2', '###/###', '#=#planks'); S('oak_fence:3', '#S#/#S#', '#=#planks S=stick'); S('oak_pressure_plate', '##', '#=#planks');
L('oak_button', '#planks'); S('bowl:4', '# #/ # ', '#=#planks'); S('oak_boat', '# #/###', '#=#planks');
S('bookshelf', '###/BBB/###', '#=#planks B=book'); S('torch:4', 'C/S', 'C=#coals S=stick'); S('soul_torch:4', 'C/S/D', 'C=#coals S=stick D=soul_sand');
S('lantern', 'NNN/NTN/NNN', 'N=iron_nugget T=torch'); S('soul_lantern', 'NNN/NTN/NNN', 'N=iron_nugget T=soul_torch');
S('campfire', ' S /SCS/LLL', 'S=stick C=#coals L=#logs'); S('soul_campfire', ' S /SCS/LLL', 'S=stick C=soul_sand L=#logs');
for (const [n, base] of SLAB_MATS) { const bk = base; S(n + '_slab:6', '###', '#=' + bk); S(n + '_stairs:4', '#  /## /###', '#=' + bk); }
for (const t in TIERS) {
  const m = TIERS[t].mat; if (!m) continue;
  S(t + '_pickaxe', 'MMM/ S / S ', 'M=' + m + ' S=stick'); S(t + '_axe', 'MM/MS/ S', 'M=' + m + ' S=stick'); S(t + '_shovel', 'M/S/S', 'M=' + m + ' S=stick');
  S(t + '_hoe', 'MM/ S/ S', 'M=' + m + ' S=stick'); S(t + '_sword', 'M/M/S', 'M=' + m + ' S=stick');
}
for (const type of ['sword', 'pickaxe', 'axe', 'shovel', 'hoe']) L('netherite_' + type, 'diamond_' + type + ' netherite_ingot');
for (const [m, mat] of [['leather', 'leather'], ['iron', 'iron_ingot'], ['golden', 'gold_ingot'], ['diamond', 'diamond'], ['chainmail', 'chain']]) {
  S(m + '_helmet', 'MMM/M M', 'M=' + mat); S(m + '_chestplate', 'M M/MMM/MMM', 'M=' + mat); S(m + '_leggings', 'MMM/M M/M M', 'M=' + mat); S(m + '_boots', 'M M/M M', 'M=' + mat);
}
for (const s of ARMOR_SLOTS) L('netherite_' + s, 'diamond_' + s + ' netherite_ingot');
S('turtle_helmet', 'SSS/S S', 'S=turtle_scute');
S('bow', ' TS/T S/ TS', 'T=stick S=string'); S('arrow:4', 'F/S/E', 'F=flint S=stick E=feather'); S('shield', 'WIW/WWW/ W ', 'W=#planks I=iron_ingot');
S('crossbow', 'SIS/T T/ S ', 'S=stick I=iron_ingot T=string');
L('flint_and_steel', 'iron_ingot flint'); S('shears', ' I/I ', 'I=iron_ingot'); S('bucket', 'I I/ I ', 'I=iron_ingot');
S('fishing_rod', '  S/ ST/S T', 'S=stick T=string'); S('compass', ' I /IRI/ I ', 'I=iron_ingot R=redstone'); S('clock', ' G /GRG/ G ', 'G=gold_ingot R=redstone');
L('carrot_on_a_stick', 'fishing_rod carrot'); S('spyglass', 'A/C/C', 'A=amethyst_shard C=copper_ingot'); S('lead:2', 'SS /SB /  S', 'S=string B=slime_ball');
S('furnace', '###/# #/###', '#=#stone_tool'); S('smoker', ' L /LFL/ L ', 'L=#logs F=furnace'); S('blast_furnace', 'III/IFI/SSS', 'I=iron_ingot F=furnace S=smooth_stone');
S('stone_bricks:4', '##/##', '#=stone'); L('mossy_cobblestone', 'cobblestone vine'); L('mossy_stone_bricks', 'stone_bricks vine'); L('mossy_cobblestone', 'cobblestone moss_block');
S('chiseled_stone_bricks', '#/#', '#=stone_brick_slab'); S('bricks', '##/##', '#=brick'); S('nether_bricks', '##/##', '#=nether_brick');
S('red_nether_bricks', 'NW/WN', 'N=nether_brick W=nether_wart'); S('sandstone', '##/##', '#=sand'); S('red_sandstone', '##/##', '#=red_sand');
S('cut_sandstone:4', '##/##', '#=sandstone'); S('cut_red_sandstone:4', '##/##', '#=red_sandstone'); S('chiseled_sandstone', '#/#', '#=sandstone_slab');
S('glowstone', '##/##', '#=glowstone_dust'); S('quartz_block', '##/##', '#=quartz'); S('quartz_pillar:2', '#/#', '#=quartz_block'); S('chiseled_quartz_block', '#/#', '#=quartz_slab');
S('prismarine', '##/##', '#=prismarine_shard'); S('prismarine_bricks', '###/###/###', '#=prismarine_shard'); S('dark_prismarine', '###/#I#/###', '#=prismarine_shard I=black_dye');
S('sea_lantern', 'SCS/CCC/SCS', 'S=prismarine_shard C=prismarine_crystals'); S('purpur_block:4', '##/##', '#=popped_chorus_fruit'); S('purpur_pillar', '#/#', '#=purpur_slab');
S('end_stone_bricks:4', '##/##', '#=end_stone'); S('polished_granite:4', '##/##', '#=granite'); S('polished_diorite:4', '##/##', '#=diorite'); S('polished_andesite:4', '##/##', '#=andesite');
L('granite', 'diorite quartz'); S('diorite:2', 'CQ/QC', 'C=cobblestone Q=quartz'); L('andesite:2', 'diorite cobblestone');
S('polished_blackstone:4', '##/##', '#=blackstone'); S('polished_blackstone_bricks:4', '##/##', '#=polished_blackstone'); S('polished_basalt:4', '##/##', '#=basalt');
S('deepslate_bricks:4', '##/##', '#=cobbled_deepslate'); S('mud_bricks:4', '##/##', '#=packed_mud'); L('packed_mud', 'mud wheat');
S('snow_block', '##/##', '#=snowball'); S('snow:6', '###', '#=snow_block'); S('packed_ice', '###/###/###', '#=ice'); S('blue_ice', '###/###/###', '#=packed_ice');
S('hay_block', '###/###/###', '#=wheat'); L('wheat:9', 'hay_block'); S('bone_block', '###/###/###', '#=bone_meal'); L('bone_meal:9', 'bone_block');
S('slime_block', '###/###/###', '#=slime_ball'); L('slime_ball:9', 'slime_block'); S('honeycomb_block', '##/##', '#=honeycomb');
for (const [b, i] of [['coal_block', 'coal'], ['iron_block', 'iron_ingot'], ['gold_block', 'gold_ingot'], ['diamond_block', 'diamond'], ['emerald_block', 'emerald'], ['lapis_block', 'lapis_lazuli'], ['redstone_block', 'redstone'], ['copper_block', 'copper_ingot'], ['netherite_block', 'netherite_ingot'], ['raw_iron_block', 'raw_iron'], ['raw_gold_block', 'raw_gold'], ['raw_copper_block', 'raw_copper']]) { S(b, '###/###/###', '#=' + i); L(i + ':9', b); }
S('iron_ingot', '###/###/###', '#=iron_nugget'); L('iron_nugget:9', 'iron_ingot'); S('gold_ingot', '###/###/###', '#=gold_nugget'); L('gold_nugget:9', 'gold_ingot');
L('netherite_ingot', 'netherite_scrap netherite_scrap netherite_scrap netherite_scrap gold_ingot gold_ingot gold_ingot gold_ingot');
S('tnt', 'GSG/SGS/GSG', 'G=gunpowder S=#sand'); S('glass_pane:16', '###/###', '#=glass'); S('iron_bars:16', '###/###', '#=iron_ingot'); S('chain', 'N/I/N', 'N=iron_nugget I=iron_ingot');
for (const c of COLORS) {
  S(c + '_stained_glass:8', '###/#D#/###', '#=glass D=' + c + '_dye');
  if (c !== 'white') L(c + '_wool', 'white_wool ' + c + '_dye');
  S(c + '_carpet:3', '##', '#=' + c + '_wool');
  S(c + '_concrete:8', 'SSG/GDG/GSS', 'S=sand G=gravel D=' + c + '_dye');
  S(c + '_terracotta:8', '###/#D#/###', '#=terracotta D=' + c + '_dye');
}
S('white_wool', '##/##', '#=string'); S('red_bed', 'WWW/PPP', 'W=#wool P=#planks');
S('rail:16', 'I I/ISI/I I', 'I=iron_ingot S=stick'); S('redstone_torch', 'R/S', 'R=redstone S=stick'); S('lever', 'S/C', 'S=stick C=cobblestone');
L('stone_button', 'stone'); S('stone_pressure_plate', '##', '#=stone'); S('redstone_lamp', ' R /RGR/ R ', 'R=redstone G=glowstone');
S('note_block', '###/#R#/###', '#=#planks R=redstone'); S('jukebox', '###/#D#/###', '#=#planks D=diamond');
S('enchanting_table', ' B /DOD/OOO', 'B=book D=diamond O=obsidian'); S('anvil', 'BBB/ I /III', 'B=iron_block I=iron_ingot');
S('cauldron', 'I I/I I/III', 'I=iron_ingot'); S('brewing_stand', ' B /CCC', 'B=blaze_rod C=#stone_tool'); S('beacon', 'GGG/GNG/OOO', 'G=glass N=nether_star O=obsidian');
S('ender_chest', 'OOO/OEO/OOO', 'O=obsidian E=ender_eye'); S('end_crystal', 'GGG/GEG/GTG', 'G=glass E=ender_eye T=ghast_tear'); S('end_rod:4', 'B/P', 'B=blaze_rod P=popped_chorus_fruit');
S('iron_door:3', '##/##/##', '#=iron_ingot'); S('smithing_table', 'II/PP/PP', 'I=iron_ingot P=#planks'); S('fletching_table', 'FF/PP/PP', 'F=flint P=#planks');
S('cartography_table', 'PP/WW/WW', 'P=paper W=#planks'); S('loom', 'SS/WW', 'S=string W=#planks'); S('moss_carpet:3', '##', '#=moss_block');
S('amethyst_block', '##/##', '#=amethyst_shard'); S('glass_bottle:3', '# #/ # ', '#=glass'); S('jack_o_lantern', 'P/T', 'P=carved_pumpkin T=torch');
L('ender_eye', 'ender_pearl blaze_powder'); L('blaze_powder:2', 'blaze_rod'); L('magma_cream', 'slime_ball blaze_powder'); L('fire_charge:3', 'gunpowder blaze_powder #coals');
L('fermented_spider_eye', 'spider_eye brown_mushroom sugar'); S('glistering_melon_slice', 'NNN/NMN/NNN', 'N=gold_nugget M=melon_slice'); S('golden_carrot', 'NNN/NCN/NNN', 'N=gold_nugget C=carrot');
S('golden_apple', 'GGG/GAG/GGG', 'G=gold_ingot A=apple'); S('bread', 'WWW', 'W=wheat'); S('cookie:8', 'WCW', 'W=wheat C=cocoa_beans');
S('cake', 'MMM/SES/WWW', 'M=milk_bucket S=sugar E=egg W=wheat'); L('pumpkin_pie', 'pumpkin sugar egg'); L('mushroom_stew', 'bowl brown_mushroom red_mushroom');
L('beetroot_soup', 'bowl beetroot beetroot beetroot beetroot beetroot beetroot'); L('rabbit_stew', 'bowl cooked_rabbit carrot baked_potato brown_mushroom');
L('suspicious_stew', 'bowl brown_mushroom red_mushroom oxeye_daisy');
L('sugar', 'sugar_cane'); S('paper:3', '###', '#=sugar_cane'); L('book', 'paper paper paper leather'); L('bone_meal:3', 'bone'); L('melon_seeds', 'melon_slice'); L('pumpkin_seeds:4', 'pumpkin');
S('leather', '##/##', '#=rabbit_hide'); L('firework_rocket:3', 'paper gunpowder'); S('map', '###/#C#/###', '#=paper C=compass'); S('wind_charge:4', 'B', 'B=breeze_rod');
S('saddle', 'LLL/S S', 'L=leather S=string'); S('name_tag', '  S/ P ', 'S=string P=paper');
const DYE_SRC = { red_dye: ['poppy', 'red_tulip', 'rose_bush', 'beetroot'], yellow_dye: ['dandelion', 'sunflower'], blue_dye: ['cornflower', 'lapis_lazuli'], white_dye: ['lily_of_the_valley', 'bone_meal'], light_blue_dye: ['blue_orchid'], magenta_dye: ['allium', 'lilac'], light_gray_dye: ['azure_bluet', 'white_tulip', 'oxeye_daisy'], orange_dye: ['orange_tulip', 'torchflower'], pink_dye: ['pink_tulip', 'peony'], black_dye: ['wither_rose', 'ink_sac'], brown_dye: ['cocoa_beans'] };
for (const d in DYE_SRC) for (const s of DYE_SRC[d]) L(d, s);
L('lime_dye:2', 'green_dye white_dye'); L('light_blue_dye:2', 'blue_dye white_dye'); L('pink_dye:2', 'red_dye white_dye'); L('orange_dye:2', 'red_dye yellow_dye');
L('purple_dye:2', 'blue_dye red_dye'); L('magenta_dye:2', 'purple_dye pink_dye'); L('gray_dye:2', 'black_dye white_dye'); L('light_gray_dye:2', 'gray_dye white_dye'); L('cyan_dye:2', 'blue_dye green_dye');
// smelting
const SMELT = {};
const SM = (inp, out, xp) => { SMELT[IT[inp]] = { out: IT[out], xp }; if (IT[inp] === undefined || IT[out] === undefined) throw new Error('smelt ' + inp); };
SM('raw_iron', 'iron_ingot', 0.7); SM('raw_gold', 'gold_ingot', 1); SM('raw_copper', 'copper_ingot', 0.7); SM('iron_ore', 'iron_ingot', 0.7); SM('deepslate_iron_ore', 'iron_ingot', 0.7);
SM('gold_ore', 'gold_ingot', 1); SM('deepslate_gold_ore', 'gold_ingot', 1); SM('copper_ore', 'copper_ingot', 0.7); SM('deepslate_copper_ore', 'copper_ingot', 0.7); SM('nether_gold_ore', 'gold_ingot', 1);
SM('ancient_debris', 'netherite_scrap', 2); SM('sand', 'glass', 0.1); SM('red_sand', 'glass', 0.1); SM('cobblestone', 'stone', 0.1); SM('stone', 'smooth_stone', 0.1); SM('cobbled_deepslate', 'deepslate', 0.1);
SM('clay_ball', 'brick', 0.3); SM('clay', 'terracotta', 0.35); SM('netherrack', 'nether_brick', 0.1); SM('cactus', 'green_dye', 1); SM('kelp', 'dried_kelp', 0.1); SM('wet_sponge', 'sponge', 0.15);
SM('chorus_fruit', 'popped_chorus_fruit', 0.1); SM('porkchop', 'cooked_porkchop', 0.35); SM('beef', 'cooked_beef', 0.35); SM('chicken', 'cooked_chicken', 0.35); SM('mutton', 'cooked_mutton', 0.35);
SM('rabbit', 'cooked_rabbit', 0.35); SM('cod', 'cooked_cod', 0.35); SM('salmon', 'cooked_salmon', 0.35); SM('potato', 'baked_potato', 0.35); SM('sea_pickle', 'lime_dye', 0.1);
SM('stone_bricks', 'cracked_stone_bricks', 0.1); SM('basalt', 'smooth_basalt', 0.1); SM('quartz_block', 'smooth_quartz', 0.1); SM('sandstone', 'smooth_sandstone', 0.1);
SM('nether_quartz_ore', 'quartz', 0.2); SM('coal_ore', 'coal', 0.1); SM('diamond_ore', 'diamond', 1); SM('lapis_ore', 'lapis_lazuli', 0.2); SM('redstone_ore', 'redstone', 0.7); SM('emerald_ore', 'emerald', 1);
for (const l of TAGS.logs) SM(l, 'charcoal', 0.15);
const FUEL = {};
const FU = (n, t) => { if (n[0] === '#') TAGS[n.slice(1)].forEach(x => FUEL[IT[x]] = t); else FUEL[IT[n]] = t; };
FU('lava_bucket', 20000); FU('coal_block', 16000); FU('blaze_rod', 2400); FU('coal', 1600); FU('charcoal', 1600); FU('#logs', 300); FU('#planks', 300); FU('#wooden_slabs', 150);
FU('stick', 100); FU('crafting_table', 300); FU('chest', 300); FU('bookshelf', 300); FU('ladder', 300); FU('#saplings', 100); FU('bowl', 100); FU('#wool', 100); FU('bamboo', 50);
FU('oak_fence', 300); FU('oak_door', 200); FU('oak_trapdoor', 300); FU('barrel', 300); FU('note_block', 300); FU('jukebox', 300); FU('oak_boat', 1200); FU('bow', 300); FU('fishing_rod', 300);
FU('dead_bush', 100); FU('wooden_pickaxe', 200); FU('wooden_axe', 200); FU('wooden_shovel', 200); FU('wooden_sword', 200); FU('wooden_hoe', 200); FU('dried_kelp', 200); FU('hay_block', 100);
for (const [n] of SLAB_MATS.slice(0, 10)) { FUEL[IT[n + '_stairs']] = 300; }
// brewing
const BREW = {
  'water:nether_wart': 'awkward', 'water:redstone': 'mundane', 'water:fermented_spider_eye': 'weakness',
  'awkward:sugar': 'swiftness', 'awkward:glistering_melon_slice': 'healing', 'awkward:blaze_powder': 'strength', 'awkward:ghast_tear': 'regeneration',
  'awkward:golden_carrot': 'night_vision', 'awkward:magma_cream': 'fire_resistance', 'awkward:pufferfish': 'water_breathing', 'awkward:rabbit_foot': 'leaping',
  'awkward:spider_eye': 'poison', 'awkward:phantom_membrane': 'slow_falling', 'swiftness:fermented_spider_eye': 'slowness', 'healing:fermented_spider_eye': 'harming',
  'night_vision:fermented_spider_eye': 'invisibility', 'poison:fermented_spider_eye': 'harming', 'leaping:fermented_spider_eye': 'slowness',
  'healing:glowstone_dust': 'strong_healing', 'strength:glowstone_dust': 'strong_strength', 'swiftness:glowstone_dust': 'strong_swiftness', 'night_vision:redstone': 'long_night_vision'
};
const RARITY_CLASS = { uncommon: 'r-uncommon', rare: 'r-rare', epic: 'r-epic' };

// ---------------------------------------------------------------------
// 4. WORLD GENERATION
// ---------------------------------------------------------------------
const idx = (x, y, z) => (y << 8) | (z << 4) | x;
class Chunk {
  constructor(dim, cx, cz) {
    this.dim = dim; this.cx = cx; this.cz = cz; this.key = ckey(cx, cz);
    this.blocks = new Uint16Array(16 * 16 * WH); this.meta = new Uint8Array(16 * 16 * WH); this.light = new Uint8Array(16 * 16 * WH);
    this.biomes = new Uint8Array(256); this.hmap = new Uint8Array(256);
    this.tiles = new Map(); this.spawns = []; this.state = 0; this.modified = false;
    this.mesh = new Array(SECTIONS).fill(null); this.dirty = new Uint8Array(SECTIONS).fill(1); this.empty = new Uint8Array(SECTIONS);
    this.lastSeen = 0; this.ticked = 0;
  }
  get(x, y, z) { return this.blocks[(y << 8) | (z << 4) | x]; }
  computeHeightmap() {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      let y = WH - 1; while (y > 0 && BLOCKS[this.blocks[(y << 8) | (z << 4) | x]].filter === 0) y--;
      this.hmap[(z << 4) | x] = y + 1;
    }
    for (let s = 0; s < SECTIONS; s++) { let e = 1; const a = s * 4096, b = a + 4096; for (let i = a; i < b; i++) if (this.blocks[i]) { e = 0; break; } this.empty[s] = e; }
  }
}
// Biomes
const BIOMES = [], BIO = {};
const C = h => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const PASS_STD = [['sheep', 12], ['pig', 10], ['chicken', 10], ['cow', 8]];
function defBiome(name, o) {
  const b = Object.assign({ id: BIOMES.length, name, label: titleCase(name), temp: 0.7, top: BL.grass_block, fill: BL.dirt, under: BL.sand, depth: 3, grass: C('91BD59'), foliage: C('77AB2F'), water: C('3F76E4'), trees: null, treeP: 0, grassP: 0.12, flowers: null, flowerP: 0.004, passive: PASS_STD, dim: 0, sky: null, fog: null }, o);
  BIOMES.push(b); BIO[name] = b.id; return b;
}
const OCEAN_P = [['cod', 10], ['squid', 6], ['salmon', 3]];
defBiome('ocean', { under: BL.sand, passive: [...OCEAN_P, ['dolphin', 2]], grassP: 0 });
defBiome('deep_ocean', { under: BL.gravel, passive: [...OCEAN_P, ['dolphin', 2], ['guardian', 0.3]], grassP: 0 });
defBiome('warm_ocean', { under: BL.sand, water: C('43D5EE'), passive: [['tropical_fish', 15], ['pufferfish', 3], ['dolphin', 2], ['turtle', 1]], grassP: 0 });
defBiome('lukewarm_ocean', { under: BL.sand, water: C('45ADF2'), passive: [['tropical_fish', 10], ['cod', 6], ['squid', 4], ['dolphin', 2]], grassP: 0 });
defBiome('cold_ocean', { under: BL.gravel, water: C('3D57D6'), temp: 0.3, passive: [['salmon', 10], ['cod', 6], ['squid', 4]], grassP: 0 });
defBiome('frozen_ocean', { under: BL.gravel, water: C('3938C9'), temp: -0.3, passive: [['salmon', 10], ['polar_bear', 1], ['squid', 2]], grassP: 0 });
defBiome('beach', { top: BL.sand, fill: BL.sand, depth: 4, passive: [['turtle', 5]], grassP: 0 });
defBiome('snowy_beach', { top: BL.sand, fill: BL.sand, temp: 0.05, depth: 4, passive: [], grassP: 0 });
defBiome('stony_shore', { top: BL.stone, fill: BL.stone, passive: [], grassP: 0 });
defBiome('river', { under: BL.sand, grass: C('8EB971'), passive: [['salmon', 5], ['squid', 2]], grassP: 0.05 });
defBiome('frozen_river', { under: BL.gravel, temp: 0, water: C('3938C9'), passive: [['salmon', 5]], grassP: 0 });
defBiome('plains', { trees: [['oak', 9], ['fancy_oak', 1]], treeP: 0.0012, grassP: 0.28, flowers: ['dandelion', 'poppy', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'red_tulip', 'white_tulip'], flowerP: 0.012, passive: [...PASS_STD, ['horse', 5], ['donkey', 1]] });
defBiome('sunflower_plains', { trees: [['oak', 1]], treeP: 0.0008, grassP: 0.3, flowers: ['sunflower', 'sunflower', 'dandelion', 'poppy'], flowerP: 0.04, passive: [...PASS_STD, ['horse', 5]] });
defBiome('forest', { grass: C('79C05A'), foliage: C('59AE30'), trees: [['oak', 7], ['birch', 2], ['fancy_oak', 1]], treeP: 0.07, grassP: 0.15, flowers: ['lily_of_the_valley', 'poppy', 'dandelion'], flowerP: 0.006, passive: [...PASS_STD, ['wolf', 3]] });
defBiome('flower_forest', { grass: C('79C05A'), foliage: C('59AE30'), trees: [['oak', 6], ['birch', 3]], treeP: 0.02, grassP: 0.08, flowers: FLOWERS.slice(0, 12).filter(f => f !== 'wither_rose'), flowerP: 0.25, passive: [...PASS_STD, ['rabbit', 4], ['bee', 3]] });
defBiome('birch_forest', { grass: C('88BB67'), foliage: C('6BA941'), trees: [['birch', 9], ['tall_birch', 2]], treeP: 0.06, grassP: 0.15, flowers: ['allium', 'lily_of_the_valley', 'dandelion'], flowerP: 0.006 });
defBiome('dark_forest', { grass: C('507A32'), foliage: C('59AE30'), trees: [['dark_oak', 12], ['huge_red_mushroom', 1], ['huge_brown_mushroom', 1], ['oak', 2]], treeP: 0.09, grassP: 0.08, flowers: ['brown_mushroom', 'red_mushroom', 'rose_bush'], flowerP: 0.01 });
defBiome('taiga', { grass: C('86B783'), foliage: C('68A464'), trees: [['spruce', 10], ['pine', 3]], treeP: 0.05, grassP: 0.15, flowers: ['fern', 'fern', 'sweet_berry_bush'], flowerP: 0.03, temp: 0.25, passive: [...PASS_STD, ['wolf', 4], ['fox', 4], ['rabbit', 3]] });
defBiome('snowy_taiga', { grass: C('80B497'), foliage: C('60A17B'), trees: [['spruce', 10], ['pine', 3]], treeP: 0.045, grassP: 0.08, flowers: ['fern', 'sweet_berry_bush'], flowerP: 0.02, temp: -0.5, passive: [['wolf', 4], ['fox', 4], ['rabbit', 4]] });
defBiome('old_growth_taiga', { grass: C('86B87F'), foliage: C('68A464'), top: BL.podzol, trees: [['mega_spruce', 6], ['spruce', 6], ['boulder', 1]], treeP: 0.05, grassP: 0.12, flowers: ['fern', 'brown_mushroom', 'red_mushroom'], flowerP: 0.04, temp: 0.3, passive: [...PASS_STD, ['wolf', 4], ['fox', 4]] });
defBiome('snowy_plains', { grass: C('80B497'), foliage: C('60A17B'), trees: [['spruce', 1]], treeP: 0.001, grassP: 0.03, flowers: null, temp: -0.5, passive: [['rabbit', 10], ['polar_bear', 1]] });
defBiome('ice_spikes', { grass: C('80B497'), top: BL.snow_block, fill: BL.snow_block, trees: [['ice_spike', 1]], treeP: 0.004, grassP: 0, temp: -0.5, passive: [['rabbit', 10], ['polar_bear', 1]] });
defBiome('desert', { top: BL.sand, fill: BL.sand, depth: 5, grass: C('BFB755'), foliage: C('AEA42A'), trees: [['cactus', 6], ['dead_bush', 4]], treeP: 0.008, grassP: 0, temp: 2, passive: [['rabbit', 4], ['camel', 1]] });
defBiome('savanna', { grass: C('BFB755'), foliage: C('AEA42A'), trees: [['acacia', 8], ['oak', 1]], treeP: 0.006, grassP: 0.45, flowers: ['tall_grass'], flowerP: 0.03, temp: 1.6, passive: [...PASS_STD, ['horse', 3], ['llama', 3], ['armadillo', 3]] });
defBiome('badlands', { top: BL.red_sand, fill: BL.terracotta, depth: 18, grass: C('90814D'), foliage: C('9E814D'), trees: [['dead_bush', 5], ['cactus', 1]], treeP: 0.006, grassP: 0, temp: 2, passive: [['armadillo', 3]] });
defBiome('jungle', { grass: C('59C93C'), foliage: C('30BB0B'), trees: [['jungle', 6], ['mega_jungle', 2], ['jungle_bush', 6], ['fancy_oak', 1]], treeP: 0.12, grassP: 0.3, flowers: ['fern', 'melon'], flowerP: 0.01, temp: 0.95, passive: [...PASS_STD, ['parrot', 6], ['ocelot', 2], ['panda', 1]] });
defBiome('bamboo_jungle', { grass: C('59C93C'), foliage: C('30BB0B'), top: BL.podzol, trees: [['bamboo', 10], ['jungle', 2], ['jungle_bush', 3]], treeP: 0.16, grassP: 0.25, flowers: ['fern'], flowerP: 0.02, temp: 0.95, passive: [...PASS_STD, ['panda', 6], ['parrot', 4]] });
defBiome('swamp', { grass: C('6A7039'), foliage: C('6A7039'), water: C('617B64'), under: BL.clay, trees: [['swamp_oak', 1]], treeP: 0.01, grassP: 0.12, flowers: ['blue_orchid', 'brown_mushroom', 'lily_pad'], flowerP: 0.02, passive: [...PASS_STD, ['frog', 6], ['slime', 0]] });
defBiome('mangrove_swamp', { grass: C('8DB127'), foliage: C('8DB127'), water: C('3A7A6A'), top: BL.mud, fill: BL.mud, under: BL.mud, trees: [['mangrove', 1]], treeP: 0.05, grassP: 0.05, flowers: ['lily_pad'], flowerP: 0.02, passive: [['frog', 8]] });
defBiome('mushroom_fields', { top: BL.mycelium, grass: C('55C93F'), foliage: C('2BBB0F'), trees: [['huge_red_mushroom', 1], ['huge_brown_mushroom', 1]], treeP: 0.006, grassP: 0, flowers: ['red_mushroom', 'brown_mushroom'], flowerP: 0.01, passive: [['mooshroom', 10]] });
defBiome('meadow', { grass: C('83BB6D'), foliage: C('63A948'), trees: [['oak', 1], ['birch', 1]], treeP: 0.0008, grassP: 0.4, flowers: ['allium', 'azure_bluet', 'oxeye_daisy', 'cornflower', 'dandelion', 'poppy'], flowerP: 0.05, temp: 0.5, passive: [['sheep', 6], ['rabbit', 4], ['donkey', 2], ['bee', 2]] });
defBiome('cherry_grove', { grass: C('B6DB61'), foliage: C('B6DB61'), trees: [['cherry', 1]], treeP: 0.025, grassP: 0.25, flowers: ['pink_tulip', 'peony', 'allium'], flowerP: 0.03, temp: 0.5, passive: [['pig', 2], ['rabbit', 4], ['bee', 3]] });
defBiome('snowy_slopes', { top: BL.snow_block, fill: BL.snow_block, grass: C('80B497'), grassP: 0, temp: -0.3, passive: [['goat', 4], ['rabbit', 3]] });
defBiome('jagged_peaks', { top: BL.snow_block, fill: BL.stone, grass: C('80B497'), grassP: 0, temp: -0.7, passive: [['goat', 3]] });
defBiome('stony_peaks', { top: BL.stone, fill: BL.stone, grass: C('9ABE4B'), grassP: 0, temp: 1, passive: [['goat', 1]] });
defBiome('windswept_hills', { grass: C('8AB689'), foliage: C('6DA36B'), trees: [['spruce', 2], ['oak', 1]], treeP: 0.005, grassP: 0.1, temp: 0.2, passive: [...PASS_STD, ['llama', 4], ['goat', 2]] });
defBiome('lush_caves', { dim: -1, passive: [['axolotl', 4]] }); defBiome('dripstone_caves', { dim: -1 }); defBiome('deep_dark', { dim: -1 });
defBiome('nether_wastes', { dim: 1, fog: [0.2, 0.03, 0.03], passive: [] });
defBiome('crimson_forest', { dim: 1, fog: [0.2, 0.02, 0.0], passive: [] });
defBiome('warped_forest', { dim: 1, fog: [0.03, 0.08, 0.1], passive: [] });
defBiome('soul_sand_valley', { dim: 1, fog: [0.1, 0.18, 0.2], passive: [] });
defBiome('basalt_deltas', { dim: 1, fog: [0.22, 0.2, 0.24], passive: [] });
defBiome('the_end', { dim: 2, passive: [] }); defBiome('end_highlands', { dim: 2, passive: [] }); defBiome('small_end_islands', { dim: 2, passive: [] });

// SURV：每块期望树数（4×4 格至多一棵 → 间距 ≥ 4）。SurvivalCraft 约 5 棵/块。
const TREE_D = {
  plains: 0.4, sunflower_plains: 0.3, forest: 4, flower_forest: 2, birch_forest: 3.5, dark_forest: 4.5,
  taiga: 3.2, snowy_taiga: 2.6, old_growth_taiga: 3.2, snowy_plains: 0.25, ice_spikes: 0.2,
  desert: 0.5, savanna: 0.5, badlands: 0.3, jungle: 4, bamboo_jungle: 4, swamp: 1, mangrove_swamp: 1.5,
  mushroom_fields: 0.3, meadow: 0.3, cherry_grove: 1, windswept_hills: 0.4,
};
for (const b of BIOMES) if (TREE_D[b.name] !== undefined) b.treeD = TREE_D[b.name];
const SNOWY = new Set(['frozen_ocean', 'snowy_beach', 'frozen_river', 'snowy_taiga', 'snowy_plains', 'ice_spikes', 'snowy_slopes', 'jagged_peaks'].map(n => BIO[n]));
const DRY = new Set(['desert', 'savanna', 'badlands'].map(n => BIO[n]));
const OCEANS = new Set(['ocean', 'deep_ocean', 'warm_ocean', 'lukewarm_ocean', 'cold_ocean', 'frozen_ocean'].map(n => BIO[n]));
const BADLANDS_BANDS = [BL.terracotta, BL.orange_terracotta, BL.terracotta, BL.yellow_terracotta, BL.brown_terracotta, BL.terracotta, BL.red_terracotta, BL.terracotta, BL.white_terracotta, BL.light_gray_terracotta, BL.orange_terracotta, BL.terracotta, BL.terracotta, BL.red_terracotta, BL.brown_terracotta, BL.orange_terracotta, BL.terracotta, BL.yellow_terracotta];
const LOOT = {
  village: [['bread', 1, 4, 10], ['apple', 1, 3, 8], ['iron_ingot', 1, 4, 6], ['wheat', 2, 7, 8], ['emerald', 1, 3, 4], ['oak_sapling', 1, 3, 5], ['iron_pickaxe', 1, 1, 2], ['saddle', 1, 1, 2], ['diamond', 1, 2, 1], ['iron_helmet', 1, 1, 2], ['torch', 2, 8, 5], ['carrot', 2, 5, 5]],
  desert_pyramid: [['bone', 4, 6, 25], ['rotten_flesh', 3, 7, 25], ['gunpowder', 1, 8, 10], ['sand', 1, 8, 10], ['string', 1, 8, 10], ['spider_eye', 1, 3, 10], ['diamond', 1, 3, 5], ['gold_ingot', 2, 7, 15], ['iron_ingot', 1, 5, 15], ['emerald', 1, 3, 15], ['saddle', 1, 1, 8], ['golden_apple', 1, 1, 10], ['enchanted_golden_apple', 1, 1, 1]],
  dungeon: [['bread', 1, 1, 15], ['wheat', 1, 4, 20], ['bucket', 1, 1, 10], ['coal', 1, 4, 15], ['redstone', 1, 4, 15], ['saddle', 1, 1, 20], ['golden_apple', 1, 1, 15], ['music_disc_13', 1, 1, 4], ['music_disc_cat', 1, 1, 4], ['iron_ingot', 1, 4, 10], ['gold_ingot', 1, 4, 5], ['string', 1, 4, 20], ['bone', 1, 8, 20], ['gunpowder', 1, 8, 20], ['rotten_flesh', 1, 8, 20], ['name_tag', 1, 1, 20], ['enchanted_golden_apple', 1, 1, 2], ['diamond', 1, 2, 3]],
  mineshaft: [['rail', 4, 8, 20], ['torch', 1, 16, 15], ['bread', 1, 3, 15], ['coal', 3, 8, 10], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5], ['lapis_lazuli', 4, 9, 5], ['diamond', 1, 2, 3], ['melon_seeds', 2, 4, 10], ['pumpkin_seeds', 2, 4, 10], ['beetroot_seeds', 2, 4, 10], ['golden_apple', 1, 1, 2]],
  stronghold: [['ender_pearl', 1, 1, 10], ['diamond', 1, 3, 3], ['iron_ingot', 1, 5, 10], ['gold_ingot', 1, 3, 5], ['redstone', 4, 9, 5], ['bread', 1, 3, 15], ['apple', 1, 3, 15], ['iron_pickaxe', 1, 1, 5], ['iron_sword', 1, 1, 5], ['iron_chestplate', 1, 1, 5], ['iron_helmet', 1, 1, 5], ['book', 1, 3, 10], ['paper', 2, 7, 10], ['ender_eye', 1, 2, 4]],
  fortress: [['diamond', 1, 3, 5], ['iron_ingot', 1, 5, 5], ['gold_ingot', 1, 3, 15], ['golden_sword', 1, 1, 5], ['golden_chestplate', 1, 1, 5], ['flint_and_steel', 1, 1, 5], ['nether_wart', 3, 7, 5], ['saddle', 1, 1, 10], ['obsidian', 2, 4, 2], ['blaze_rod', 1, 2, 4]],
  bastion: [['gold_block', 1, 2, 8], ['gold_ingot', 4, 9, 15], ['netherite_scrap', 1, 1, 4], ['ancient_debris', 1, 2, 6], ['diamond', 1, 3, 6], ['golden_carrot', 4, 12, 10], ['magma_cream', 2, 6, 8], ['crying_obsidian', 2, 6, 8], ['gilded_blackstone', 1, 5, 5], ['golden_apple', 1, 1, 6], ['netherite_ingot', 1, 1, 1], ['diamond_sword', 1, 1, 3], ['music_disc_pigstep', 1, 1, 1]],
  end_city: [['diamond', 2, 7, 5], ['iron_ingot', 4, 8, 10], ['gold_ingot', 2, 7, 15], ['emerald', 2, 6, 2], ['beetroot_seeds', 1, 10, 5], ['saddle', 1, 1, 3], ['diamond_sword', 1, 1, 3], ['diamond_chestplate', 1, 1, 3], ['diamond_pickaxe', 1, 1, 3], ['iron_pickaxe', 1, 1, 3], ['experience_bottle', 1, 4, 4]],
  ruined_portal: [['obsidian', 1, 2, 40], ['flint', 1, 4, 40], ['iron_nugget', 9, 18, 40], ['flint_and_steel', 1, 1, 40], ['fire_charge', 1, 1, 40], ['golden_apple', 1, 1, 15], ['gold_nugget', 4, 24, 15], ['golden_sword', 1, 1, 15], ['golden_axe', 1, 1, 15], ['golden_helmet', 1, 1, 15], ['golden_carrot', 4, 12, 15], ['clock', 1, 1, 5], ['gold_ingot', 2, 8, 5], ['enchanted_golden_apple', 1, 1, 1], ['gold_block', 1, 2, 1]],
  shipwreck: [['paper', 1, 10, 8], ['potato', 2, 6, 7], ['carrot', 4, 8, 7], ['wheat', 8, 21, 7], ['coal', 2, 8, 6], ['rotten_flesh', 5, 24, 5], ['gunpowder', 1, 5, 3], ['leather_chestplate', 1, 1, 3], ['emerald', 1, 5, 5], ['iron_ingot', 1, 5, 9], ['gold_ingot', 1, 5, 3], ['diamond', 1, 1, 1], ['experience_bottle', 1, 1, 5], ['heart_of_the_sea', 1, 1, 4], ['nautilus_shell', 1, 1, 2]],
  jungle_temple: [['bamboo', 1, 3, 15], ['bone', 4, 6, 20], ['gold_ingot', 2, 7, 15], ['iron_ingot', 1, 5, 15], ['rotten_flesh', 3, 7, 16], ['diamond', 1, 3, 3], ['emerald', 1, 3, 2], ['saddle', 1, 1, 3]],
  igloo: [['apple', 1, 3, 15], ['coal', 1, 4, 15], ['gold_nugget', 1, 3, 10], ['stone_axe', 1, 1, 2], ['rotten_flesh', 1, 1, 10], ['emerald', 1, 1, 1], ['wheat', 2, 3, 10], ['golden_apple', 1, 1, 1]],
  outpost: [['wheat', 3, 5, 7], ['potato', 2, 5, 5], ['carrot', 3, 5, 5], ['dark_oak_log', 2, 3, 10], ['string', 1, 6, 4], ['arrow', 2, 7, 4], ['iron_ingot', 1, 3, 3], ['crossbow', 1, 1, 1], ['experience_bottle', 1, 1, 2]],
  ocean_ruin: [['coal', 1, 4, 10], ['wheat', 2, 3, 10], ['gold_nugget', 1, 3, 5], ['emerald', 1, 1, 3], ['iron_ingot', 1, 2, 3], ['fishing_rod', 1, 1, 2], ['golden_apple', 1, 1, 1]],
  bonus: [['stick', 1, 12, 10], ['oak_planks', 1, 12, 10], ['oak_log', 1, 3, 10], ['stone_axe', 1, 1, 3], ['wooden_pickaxe', 1, 1, 5], ['apple', 1, 2, 5], ['bread', 1, 2, 3], ['salmon', 1, 2, 3]]
};
function makeLoot(table, rng, rolls = 0) {
  const T = LOOT[table]; const items = new Array(27).fill(null); const tw = T.reduce((s, e) => s + e[3], 0);
  const n = rolls || 4 + rng.int(5);
  for (let k = 0; k < n; k++) {
    let r = rng() * tw, e = T[0]; for (const t of T) { r -= t[3]; if (r <= 0) { e = t; break; } }
    const id = IT[e[0]]; if (id === undefined) continue; const it = ITEMS[id];
    const cnt = Math.min(it.stack, e[1] + rng.int(e[2] - e[1] + 1)); let slot = rng.int(27), tries = 0;
    while (items[slot] && tries++ < 30) slot = rng.int(27);
    const st = { id, count: cnt };
    if (it.dur && rng() < 0.3) st.ench = randomEnchant(it, 10 + rng.int(20), rng);
    items[slot] = st;
  }
  return items;
}
function randomEnchant(it, level, rng) {
  const cands = Object.keys(ENCH).filter(e => enchApplies(it, e) && !ENCH[e].treasure); if (!cands.length) return null;
  const res = {}; const n = 1 + (rng() < level / 40 ? 1 : 0) + (rng() < level / 80 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const e = cands[rng.int(cands.length)]; if (res[e]) continue;
    if ((e === 'silk_touch' && res.fortune) || (e === 'fortune' && res.silk_touch) || (e === 'infinity' && res.mending)) continue;
    if (['protection', 'fire_protection', 'blast_protection', 'projectile_protection'].includes(e) && Object.keys(res).some(k => k.endsWith('protection'))) continue;
    if (['sharpness', 'smite', 'bane_of_arthropods'].includes(e) && (res.sharpness || res.smite || res.bane_of_arthropods)) continue;
    res[e] = clamp(Math.ceil(ENCH[e].max * Math.min(1, (level + rng() * 10) / 30)), 1, ENCH[e].max);
  }
  return res;
}

// Chunk-local writer used by features/structures (world coordinates, clipped to chunk)
class Writer {
  constructor(ch) { this.ch = ch; this.x0 = ch.cx * 16; this.z0 = ch.cz * 16; }
  inside(x, z) { return x >= this.x0 && x < this.x0 + 16 && z >= this.z0 && z < this.z0 + 16; }
  set(x, y, z, id, meta = 0) { if (y < 0 || y >= WH || !this.inside(x, z)) return; const i = idx(x - this.x0, y, z - this.z0); this.ch.blocks[i] = id; this.ch.meta[i] = meta; }
  soft(x, y, z, id, meta = 0) { if (y < 0 || y >= WH || !this.inside(x, z)) return; const i = idx(x - this.x0, y, z - this.z0); const b = BLOCKS[this.ch.blocks[i]]; if (b.id === 0 || b.replace || b.leaves || b.shape === 'cross' || b.name === 'snow') { this.ch.blocks[i] = id; this.ch.meta[i] = meta; } }
  get(x, y, z) { if (y < 0 || y >= WH || !this.inside(x, z)) return -1; return this.ch.blocks[idx(x - this.x0, y, z - this.z0)]; }
  fill(x0, y0, z0, x1, y1, z1, id, meta = 0) { for (let y = y0; y <= y1; y++) for (let z = Math.max(z0, this.z0); z <= Math.min(z1, this.z0 + 15); z++) for (let x = Math.max(x0, this.x0); x <= Math.min(x1, this.x0 + 15); x++) this.set(x, y, z, id, meta); }
  hollow(x0, y0, z0, x1, y1, z1, id, inner = 0, meta = 0) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const e = x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1; if (e) this.set(x, y, z, id, meta); else if (inner !== null) this.set(x, y, z, inner); } }
  tile(x, y, z, t) { if (!this.inside(x, z) || y < 0 || y >= WH) return; this.ch.tiles.set(idx(x - this.x0, y, z - this.z0), t); }
  chest(x, y, z, table, rng, facing = 0) { if (!this.inside(x, z)) return; this.set(x, y, z, BL.chest, facing); this.tile(x, y, z, { type: 'chest', items: makeLoot(table, rng) }); }
  spawner(x, y, z, mob) { if (!this.inside(x, z)) return; this.set(x, y, z, BL.spawner); this.tile(x, y, z, { type: 'spawner', mob, delay: 200 }); }
  spawn(type, x, y, z, extra) { if (this.inside(Math.floor(x), Math.floor(z))) this.ch.spawns.push(Object.assign({ type, x, y, z }, extra || {})); }
}

class WorldGen {
  constructor(seed, wtype = 'default') {
    this.seed = seed | 0; this.wtype = wtype; const s = this.seed;
    this.nC = new Noise(s + 1); this.nE = new Noise(s + 2); this.nP = new Noise(s + 3); this.nT = new Noise(s + 4); this.nH = new Noise(s + 5);
    this.nR = new Noise(s + 6); this.nD = new Noise(s + 7); this.nCv1 = new Noise(s + 8); this.nCv2 = new Noise(s + 9); this.nCv3 = new Noise(s + 10);
    this.nSt = new Noise(s + 11); this.nMisc = new Noise(s + 12); this.nW = new Noise(s + 13); this.nN = new Noise(s + 20); this.nN2 = new Noise(s + 21); this.nEnd = new Noise(s + 30);
    this.colCache = new Map(); this.plans = new Map();
    this.bs = wtype === 'large' ? 4 : 1; this.amp = wtype === 'amplified' ? 2.1 : 1;
    this.strongholds = []; const r = RNG(s ^ 0x5f3759df); const a0 = r() * Math.PI * 2;
    for (let i = 0; i < 3; i++) { const a = a0 + i * Math.PI * 2 / 3, d = 640 + r() * 480; this.strongholds.push([Math.round(Math.cos(a) * d), 28, Math.round(Math.sin(a) * d)]); }
  }
  contH(c) {
    const P = [[-1, 26], [-0.45, 32], [-0.26, 46], [-0.13, 57], [-0.06, 62], [0.0, 65], [0.2, 71], [0.5, 80], [1, 90]];
    for (let i = 1; i < P.length; i++) if (c <= P[i][0]) { const t = (c - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return lerp(P[i - 1][1], P[i][1], t); }
    return 90;
  }
  // packed column: h | biome<<8 | riverbits
  column(x, z) {
    const key = x * 131072 + z; const c = this.colCache.get(key); if (c !== undefined) return c;
    if (this.colCache.size > 400000) this.colCache.clear();
    const o = this.colInfo(x, z), packed = o.h | (o.biome << 8) | ((Math.min(255, (o.mntW * 255) | 0)) << 16);
    this.colCache.set(key, packed); return packed;
  }
  /** 列气候 / 高度（SURV 版）：地形按低频山脉因子分三档 —— 平原 70% / 丘陵 17% / 山脉 13%（SurvivalCraft TG）。 */
  colInfo(x, z) {
    const bs = this.bs;
    let h, biome, cont, ero, temp, hum, weird, mfac = 0.5, mntW = 0, hillW = 0;
    if (this.wtype === 'flat') { h = 4; biome = BIO.plains; }
    else {
      cont = this.nC.fbm2(x / 1100, z / 1100, 5) * 1.25 + 0.08;
      ero = this.nE.fbm2(x / 650, z / 650, 3);
      const pvr = this.nP.ridge2(x / 380, z / 380, 4);
      temp = this.nT.fbm2(x / (1500 * bs), z / (1500 * bs), 3) * 1.4 + this.nD.n2(x / 60, z / 60) * 0.04;
      hum = this.nH.fbm2(x / (1300 * bs), z / (1300 * bs), 3) * 1.4 + this.nD.n2(z / 60, x / 60) * 0.04;
      weird = this.nW.fbm2(x / 500, z / 500, 2);
      // 低频山脉因子 → 三档（SurvivalCraft）：山脉约 13%，丘陵约 17%，其余平原
      mfac = 0.5 + 0.5 * this.nMisc.fbm2(x / 900, z / 900, 2);
      // 分位数（seed 20240607 实测）：mfac q70=0.59 / q87=0.69 / q95=0.77
      const mThr = 0.75 - (PG['terrain.mountPct'] - 0.13) * 0.9;      // 0.13 → 0.75（山心 ≈ q87）
      mntW = smoothstep(mThr - 0.12, mThr, mfac);
      hillW = (1 - mntW) * smoothstep(mThr - 0.24, mThr - 0.12, mfac);
      // 海岸带：按「基础高度离海平面的距离」压 base（不是压最终 h，避免 cont 抖动压出坑）
      const base = this.contH(cont);
      const shelf = 1 - smoothstep(0, 10, Math.abs(base - SEA));
      const coast = PG['terrain.coast'] * shelf;
      let hb = base;
      if (coast > 0) hb = hb < SEA ? SEA - (SEA - hb) * (1 - 0.65 * coast) : SEA + (hb - SEA) * (1 - 0.55 * coast);
      const hills = this.nD.fbm2(x / 110, z / 110, 4);
      h = hb + hills * (5 + 16 * hillW + 8 * mntW) * (1 - 0.6 * coast) * PG['terrain.hills'] * (this.wtype === 'amplified' ? 1.8 : 1);
      h += Math.pow(pvr, 1.7) * 130 * mntW * PG['terrain.mount'] * this.amp;
      // 高山造型（自然公园）：低频尖峰 + 平滑 V 形峡谷
      if (mntW > 0.12) {
        const spike = this.nP.ridge2(x / 90, z / 90, 2);
        h += Math.pow(spike, 4) * 10 * mntW * PG['terrain.spike'];
        const cn = this.nR.fbm2(x / 320 + 411, z / 320 - 277, 3);
        const can = (1 - smoothstep(0, 0.12, Math.abs(cn))) * mntW;
        if (can > 0) h = Math.max(h - 34 * can * PG['terrain.canyon'], SEA + 2);
      }
      // mushroom islands
      const mush = cont < -0.25 && weird > 0.55;
      if (mush) h = Math.max(h, SEA + 2 + (weird - 0.55) * 60);
      // rivers
      const rv = Math.abs(this.nR.fbm2(x / 560, z / 560, 4));
      let river = false;
      if (cont > -0.12 && h < 120 && !mush) {
        const rw = 0.028, bank = 0.07;
        if (rv < bank) { const t = smoothstep(bank, rw, rv); h = lerp(h, Math.min(h, SEA + 1), t * 0.85); if (rv < rw) { h = lerp(SEA - 4, h, rv / rw * 0.6); river = true; } }
      }
      // swamp flattening
      if (temp > -0.15 && temp < 0.3 && hum > 0.45 && h > SEA - 2 && h < SEA + 12 && !river) h = lerp(h, SEA + 0.4, 0.75);
      if (temp > 0.25 && hum > 0.4 && h > SEA - 2 && h < SEA + 8 && !river) h = lerp(h, SEA + 0.3, 0.7);
      h = Math.round(clamp(h, 4, WH - 8));
      const aT = temp - Math.max(0, h - 100) * 0.012;
      // biome selection
      if (mush && h >= SEA) biome = BIO.mushroom_fields;
      else if (h < SEA - 1 && !river) {
        if (temp < -0.45) biome = BIO.frozen_ocean; else if (temp < -0.15) biome = BIO.cold_ocean; else if (temp < 0.3) biome = cont < -0.38 ? BIO.deep_ocean : BIO.ocean; else if (temp < 0.55) biome = BIO.lukewarm_ocean; else biome = BIO.warm_ocean;
      }
      else if (river) biome = aT < -0.45 ? BIO.frozen_river : BIO.river;
      else if (h <= SEA + 3 && cont < 0.06) biome = mfac > 0.60 ? BIO.stony_shore : aT < -0.45 ? BIO.snowy_beach : BIO.beach;
      else if (h > 150) biome = aT < 0.2 ? BIO.jagged_peaks : BIO.stony_peaks;
      else if (h > 122) biome = aT < 0.1 ? BIO.snowy_slopes : (hum > 0.15 && temp > 0.05 && weird > 0 ? BIO.cherry_grove : (hum > -0.1 ? BIO.meadow : BIO.windswept_hills));
      else if (h > 104 && mntW > 0.35 && aT > -0.3) biome = BIO.windswept_hills;
      else if (aT < -0.45) biome = hum < -0.1 ? (weird > 0.45 ? BIO.ice_spikes : BIO.snowy_plains) : BIO.snowy_taiga;
      else if (temp < -0.15) biome = hum < -0.3 ? BIO.plains : hum < 0.2 ? BIO.taiga : BIO.old_growth_taiga;
      else if (temp < 0.3) {
        if (hum < -0.35) biome = weird > 0.35 ? BIO.sunflower_plains : BIO.plains;
        else if (hum < -0.05) biome = weird > 0.3 ? BIO.flower_forest : BIO.forest;
        else if (hum < 0.2) biome = BIO.birch_forest;
        else if (hum < 0.45) biome = BIO.dark_forest;
        else biome = h < SEA + 6 ? BIO.swamp : BIO.dark_forest;
      } else {
        if (hum < -0.25) biome = (temp > 0.6 && weird < -0.15) ? BIO.badlands : BIO.desert;
        else if (hum < 0.1) biome = BIO.savanna;
        else if (hum < 0.4) biome = weird > 0.35 ? BIO.bamboo_jungle : BIO.jungle;
        else biome = h < SEA + 5 ? BIO.mangrove_swamp : BIO.jungle;
      }
      if (biome === BIO.badlands) h = Math.round(h + Math.max(0, this.nD.n2(x / 45, z / 45)) * 14 * smoothstep(SEA + 2, SEA + 10, h));
    }
    return { h, biome, cont, ero, temp, hum, weird, mfac, mntW, hillW };
  }
  colH(x, z) { return this.column(x, z) & 255; }
  colB(x, z) { return (this.column(x, z) >> 8) & 255; }

  generate(ch) {
    if (ch.dim === DIM_NETHER) this.genNether(ch); else if (ch.dim === DIM_END) this.genEnd(ch); else this.genOverworld(ch);
    ch.computeHeightmap();
  }
  genOverworld(ch) {
    const X0 = ch.cx * 16, Z0 = ch.cz * 16, P = 8, PW = 32;
    const H = new Int16Array(PW * PW), B = new Uint8Array(PW * PW), MW = new Uint8Array(PW * PW);
    for (let dz = 0; dz < PW; dz++) for (let dx = 0; dx < PW; dx++) { const c = this.column(X0 - P + dx, Z0 - P + dz); H[dz * PW + dx] = c & 255; B[dz * PW + dx] = (c >> 8) & 255; MW[dz * PW + dx] = (c >> 16) & 255; }
    const hAt = (x, z) => H[(z - Z0 + P) * PW + (x - X0 + P)], bAt = (x, z) => B[(z - Z0 + P) * PW + (x - X0 + P)], mwAt = (x, z) => MW[(z - Z0 + P) * PW + (x - X0 + P)] / 255;
    const blocks = ch.blocks, meta = ch.meta, rng = RNG(ihash(ch.cx, ch.cz, 77, this.seed));
    const flat = this.wtype === 'flat';
    if (flat) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) { blocks[idx(x, 0, z)] = BL.bedrock; blocks[idx(x, 1, z)] = BL.dirt; blocks[idx(x, 2, z)] = BL.dirt; blocks[idx(x, 3, z)] = BL.dirt; blocks[idx(x, 4, z)] = BL.grass_block; ch.biomes[(z << 4) | x] = BIO.plains; }
      this.structures(ch, hAt); return;
    }
    // cave density grid (4x4x4)
    const GX = 5, GY = (WH >> 2) + 1, GZ = 5;
    const G1 = new Float32Array(GX * GY * GZ), G2 = new Float32Array(GX * GY * GZ), G3 = new Float32Array(GX * GY * GZ);
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GZ; gz++) for (let gx = 0; gx < GX; gx++) {
      const wx = X0 + gx * 4, wy = gy * 4, wz = Z0 + gz * 4, i = (gy * GZ + gz) * GX + gx;
      G1[i] = this.nCv1.fbm3(wx / 70, wy / 38, wz / 70, 2);
      G2[i] = this.nCv2.n3(wx / 42, wy / 26, wz / 42); G3[i] = this.nCv3.n3(wx / 42 + 100, wy / 26, wz / 42);
    }
    const tri = (G, x, y, z) => {
      const gx = x >> 2, gy = y >> 2, gz = z >> 2, fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4;
      const i000 = (gy * GZ + gz) * GX + gx, i100 = i000 + 1, i010 = i000 + GZ * GX, i001 = i000 + GX;
      const a = G[i000] + (G[i100] - G[i000]) * fx, b = G[i001] + (G[i001 + 1] - G[i001]) * fx;
      const c = G[i010] + (G[i010 + 1] - G[i010]) * fx, d = G[i010 + GX] + (G[i010 + GX + 1] - G[i010 + GX]) * fx;
      const e = a + (b - a) * fz, f = c + (d - c) * fz; return e + (f - e) * fy;
    };
    const stoneVar = (x, y, z) => {
      const n = this.nSt.n3(x / 22, y / 18, z / 22); if (n < 0.55) return 0;
      const t = this.nSt.n3(x / 90 + 50, y / 90, z / 90); return t < -0.3 ? BL.granite : t < 0.05 ? BL.diorite : t < 0.4 ? BL.andesite : BL.tuff;
    };
    const deepY = 12;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = X0 + x, wz = Z0 + z, h = hAt(wx, wz), bi = bAt(wx, wz), bio = BIOMES[bi], mw = mwAt(wx, wz);
      ch.biomes[(z << 4) | x] = bi;
      const slope = Math.max(Math.abs(hAt(wx + 1, wz) - h), Math.abs(hAt(wx - 1, wz) - h), Math.abs(hAt(wx, wz + 1) - h), Math.abs(hAt(wx, wz - 1) - h));
      const under = h < SEA;
      let top = under ? bio.under : bio.top, fill = under ? (bio.under === BL.mud ? BL.mud : bio.under === BL.clay ? BL.dirt : bio.under) : bio.fill, depth = bio.depth;
      if (!under && slope >= 4 && bi !== BI_DESERT && bi !== BIO.badlands) { top = BL.stone; fill = BL.stone; }
      if (bi === BIO.windswept_hills && slope >= 2 && rhash(wx, wz, 3, this.seed) < 0.5) { top = BL.stone; fill = BL.stone; }
      if ((bi === BIO.taiga || bi === BIO.old_growth_taiga) && !under && this.nMisc.n2(wx / 12, wz / 12) > 0.35) top = rhash(wx, wz, 4, this.seed) < 0.5 ? BL.podzol : BL.coarse_dirt;
      if (bi === BIO.savanna && !under && this.nMisc.n2(wx / 16, wz / 16) > 0.55) top = BL.coarse_dirt;
      if (under && bi !== BIO.warm_ocean && this.nMisc.n2(wx / 20, wz / 20) > 0.45) top = fill = (this.nMisc.n2(wz / 9, wx / 9) > 0.3 ? BL.clay : BL.gravel);
      if (bi === BIO.stony_peaks && this.nMisc.n2(wx / 14, y0n(wz)) > 0.4) top = BL.calcite;
      const bedTop = 1 + (rhash(wx, wz, 1, this.seed) * 3 | 0);
      const topY = Math.max(h, SEA);
      for (let y = 0; y <= topY; y++) {
        const i = (y << 8) | (z << 4) | x; let id = 0;
        if (y === 0 || y <= bedTop && rhash(wx, y, wz, this.seed) < 0.5) id = BL.bedrock;
        else if (y <= h) {
          const dd = h - y;
          if (bi === BIO.badlands && dd < depth && !under) id = dd === 0 ? (h > 96 ? BL.coarse_dirt : BL.red_sand) : BADLANDS_BANDS[(y + (this.nMisc.n2(wx / 40, wz / 40) * 3 | 0)) % BADLANDS_BANDS.length];
          else if (dd === 0) id = top;
          else if (dd <= depth) id = (bi === BIO.desert || bi === BIO.beach || bi === BIO.snowy_beach) && dd > depth - 2 ? BL.sandstone : fill;
          else id = y < deepY || (y < deepY + 4 && rhash(wx, y, wz, this.seed + 5) < (deepY + 4 - y) / 5) ? BL.deepslate : (stoneVar(wx, y, wz) || BL.stone);
          if (id === BL.grass_block && under) id = BL.dirt;
          // caves
          if (id !== BL.bedrock && y > 0) {
            let cave = false;
            const limit = under ? h - 6 : h;
            if (y < limit) {
              const s2 = tri(G2, x, y, z), s3 = tri(G3, x, y, z);
              const sp = s2 * s2 + s3 * s3;
              const cr = PG['cave.rate'];
              if (sp < (0.0055 + (y < 40 ? 0.003 : 0)) * cr) cave = !(under && y > h - 8);
              else if (y < h - 7) { const d = tri(G1, x, y, z); if (d > 0.5 - Math.max(0, (40 - y)) * 0.004 - (cr - 1) * 0.06) cave = true; }
            }
            if (cave) id = y <= 9 ? BL.lava : 0;
          }
          // 山体中空：大尺度 3D 噪声挖洞厅；贴近地表时成为拱 / 侧窗
          if (mw > 0.35 && id !== BL.bedrock && id !== 0 && y > 18 && y < h - 1) {
            const hv = this.nCv1.fbm3(wx / 110, y / 60, wz / 110, 2) + (mw - 0.35) * 0.25 * PG['mountain.hollow'];
            if (hv > 0.62) id = 0;
          }
        } else if (y <= SEA) {
          id = BL.water;
          if (y === SEA && (SNOWY.has(bi))) id = BL.ice;
        }
        blocks[i] = id;
      }
    }
    this.ores(ch, rng);
    this.caveDeco(ch, hAt, rng);
    this.entrances(ch, hAt);
    this.features(ch, hAt, bAt);
    this.structures(ch, hAt);
    // snow & ice pass
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const bi = ch.biomes[(z << 4) | x]; let y = WH - 2; while (y > 0 && blocks[idx(x, y, z)] === 0) y--;
      const top = blocks[idx(x, y, z)], tb = BLOCKS[top];
      const cold = SNOWY.has(bi) || (y > 125 && !DRY.has(bi)) || (y > 105 && BIOMES[bi].temp < 0.3 && !DRY.has(bi));
      if (!cold) continue;
      if (top === BL.water && meta[idx(x, y, z)] === 0) blocks[idx(x, y, z)] = BL.ice;
      else if ((tb.opaque || tb.leaves) && y + 1 < WH && top !== BL.ice && top !== BL.packed_ice) { blocks[idx(x, y + 1, z)] = BL.snow; meta[idx(x, y + 1, z)] = 0; if (top === BL.grass_block) meta[idx(x, y, z)] = 1; }
    }
  }
  ores(ch, rng) {
    const blocks = ch.blocks, X0 = ch.cx * 16, Z0 = ch.cz * 16;
    const mountain = ch.biomes.some(b => b === BIO.windswept_hills || b === BIO.jagged_peaks || b === BIO.stony_peaks || b === BIO.snowy_slopes || b === BIO.meadow);
    const badl = ch.biomes[136] === BIO.badlands;
    const vein = (ore, dore, n, y0, y1, size, tri = false) => {
      for (let k = 0; k < n * PG['ore.mul']; k++) {
        let x = rng.int(16), z = rng.int(16), y = tri ? Math.round(y0 + (rng() + rng()) * 0.5 * (y1 - y0)) : y0 + rng.int(y1 - y0 + 1);
        for (let s = 0; s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < WH) {
            const i = idx(x, y, z), b = blocks[i];
            if (b === BL.stone || b === BL.granite || b === BL.diorite || b === BL.andesite || b === BL.tuff) blocks[i] = ore;
            else if (b === BL.deepslate) blocks[i] = dore;
          }
          const r = rng.int(6); if (r === 0) x++; else if (r === 1) x--; else if (r === 2) z++; else if (r === 3) z--; else if (r === 4) y++; else y--;
        }
      }
    };
    vein(BL.coal_ore, BL.deepslate_coal_ore, 18, 8, 130, 12, true);
    vein(BL.iron_ore, BL.deepslate_iron_ore, 12, 2, 72, 8, true); if (mountain) vein(BL.iron_ore, BL.deepslate_iron_ore, 10, 80, 180, 9);
    vein(BL.copper_ore, BL.deepslate_copper_ore, 8, 0, 90, 10, true);
    vein(BL.gold_ore, BL.deepslate_gold_ore, badl ? 20 : 3, 1, badl ? 90 : 32, 8);
    vein(BL.redstone_ore, BL.deepslate_redstone_ore, 6, 1, 16, 7);
    vein(BL.lapis_ore, BL.deepslate_lapis_ore, 3, 1, 32, 6, true);
    vein(BL.diamond_ore, BL.deepslate_diamond_ore, rng() < 0.6 ? 2 : 1, 1, 15, 6);
    if (mountain) vein(BL.emerald_ore, BL.emerald_ore, 4, 30, 160, 1);
    if (mountain && rng() < 0.4) vein(BL.infested_stone, BL.deepslate, 4, 10, 60, 6);
    // dirt & gravel pockets
    for (const [id, n, sz] of [[BL.dirt, 6, 26], [BL.gravel, 5, 26]]) for (let k = 0; k < n; k++) {
      const cx = rng.int(16), cy = 4 + rng.int(100), cz = rng.int(16), r = 1.5 + rng() * 1.5;
      for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1) continue; if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 > r * r) continue;
        const i = idx(x, y, z); if (blocks[i] === BL.stone) blocks[i] = id;
      }
    }
  }
  caveDeco(ch, hAt, rng) {
    const blocks = ch.blocks, meta = ch.meta, X0 = ch.cx * 16, Z0 = ch.cz * 16;
    const lush = this.nH.fbm2(X0 / 300, Z0 / 300, 2) > 0.3, drip = !lush && this.nC.fbm2(X0 / 250 + 70, Z0 / 250, 2) > 0.25;
    const deepDark = this.nW.fbm2(X0 / 200 + 30, Z0 / 200, 2) > 0.3;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const h = hAt(X0 + x, Z0 + z);
      for (let y = 2; y < Math.min(h - 6, WH - 2); y++) {
        const i = idx(x, y, z); if (blocks[i] !== 0) continue;
        const below = blocks[i - 256], above = blocks[i + 256], bb = BLOCKS[below], ba = BLOCKS[above];
        const r = rng();
        if (deepDark && y < 22) {
          if (bb.opaque && below !== BL.bedrock) { if (r < 0.55) blocks[i - 256] = BL.sculk; if (r < 0.006) blocks[i] = BL.sculk_shrieker; else if (r < 0.012) blocks[i] = BL.sculk_catalyst; }
          if (ba.opaque && rng() < 0.3) blocks[i + 256] = BL.sculk;
          continue;
        }
        if (lush && y < h - 10) {
          if (bb.opaque) { blocks[i - 256] = r < 0.08 ? BL.clay : BL.moss_block; const q = rng(); if (q < 0.25) blocks[i] = BL.moss_carpet; else if (q < 0.4) { blocks[i] = BL.short_grass; } else if (q < 0.43) blocks[i] = BL.azalea; else if (q < 0.45) blocks[i] = BL.flowering_azalea; }
          else if (ba.opaque) { blocks[i + 256] = BL.moss_block; if (r < 0.12) { const len = 1 + rng.int(5); for (let k = 0; k < len; k++) { const j = i - k * 256; if (blocks[j] !== 0) break; const lit = rng() < 0.3; blocks[j] = lit ? BL.cave_vines_lit : BL.cave_vines; } } }
          continue;
        }
        if (drip) {
          if (bb.opaque && r < 0.08) { blocks[i - 256] = BL.dripstone_block; if (rng() < 0.6) blocks[i] = BL.pointed_dripstone; }
          else if (ba.opaque && r < 0.1) { blocks[i + 256] = BL.dripstone_block; if (rng() < 0.6) { blocks[i] = BL.pointed_dripstone; meta[i] = 1; } }
          continue;
        }
        if (r < 0.006 && (bb.opaque || ba.opaque)) { blocks[i] = BL.glow_lichen; meta[i] = bb.opaque ? 4 : 5; }
      }
    }
    // amethyst geode (rare, fully inside chunk)
    if (rng() < 0.03) {
      const cx = 7.5, cz = 7.5, cy = 10 + rng.int(40), R = 5.5;
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2); if (d > R || y < 1) continue; const i = idx(x, y, z);
        blocks[i] = d > R - 1 ? BL.smooth_basalt : d > R - 2 ? BL.calcite : d > R - 3 ? (rng() < 0.12 ? BL.budding_amethyst : BL.amethyst_block) : 0;
      }
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let z = 1; z < 15; z++) for (let x = 1; x < 15; x++) { const i = idx(x, y, z); if (y > 0 && y < WH - 1 && blocks[i] === 0 && blocks[i - 256] === BL.budding_amethyst && rng() < 0.6) blocks[i] = BL.amethyst_cluster; }
    }
    // dungeon
    if (rng() < 0.12) {
      const dx = 4 + rng.int(8), dz = 4 + rng.int(8), dy = 12 + rng.int(40);
      let open = 0; for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) if (blocks[idx(dx + x, dy + 1, dz + z)] === 0) open++;
      if (open > 3 && open < 30 && dy < hAt(X0 + dx, Z0 + dz) - 8) {
        const W = new Writer(ch), wx = X0 + dx, wz = Z0 + dz;
        for (let y = dy - 1; y <= dy + 4; y++) for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) {
          const e = Math.abs(x) === 3 || Math.abs(z) === 3 || y === dy - 1 || y === dy + 4;
          W.set(wx + x, y, wz + z, e ? (rng() < 0.4 && y === dy - 1 ? BL.mossy_cobblestone : rng() < 0.3 ? BL.mossy_cobblestone : BL.cobblestone) : 0);
        }
        W.spawner(wx, dy, wz, rng.pick(['zombie', 'zombie', 'skeleton', 'spider']));
        W.chest(wx - 2, dy, wz, 'dungeon', rng, 0); if (rng() < 0.5) W.chest(wx + 2, dy, wz + 2, 'dungeon', rng, 1);
      }
    }
  }
  /** 洞穴入口候选（64×64 格）：[x, z, h] 或 null。spawn 评分用它找「附近有洞」的出生点。 */
  entranceSite(gx, gz) {
    const CELL = 64, s = this.seed;
    if (rhash(gx, gz, 41, s) > 0.55 * PG['cave.entrance']) return null;
    const sx = gx * CELL + 6 + (ihash(gx, gz, 42, s) % (CELL - 16));
    const sz = gz * CELL + 6 + (ihash(gx, gz, 43, s) % (CELL - 16));
    const h = this.colInfo(sx, sz).h;
    return h >= SEA + 4 ? [sx, sz, h] : null;                  // 只挖陆地；海里留洞会灌水
  }
  /** 该格 （x,z 周围 r 格）是否会被 features 种树（锚点 + 密度 + 4 格间距）；spawn 用它避开树干。 */
  treeNear(x, z, r = 2) {
    const s = this.seed;
    const cand = (c4x, c4z) => {
      const ax = (c4x << 2) + (ihash(c4x, c4z, 31, s) & 3), az = (c4z << 2) + (ihash(c4x, c4z, 32, s) & 3);
      const b = BIOMES[this.column(ax, az) >> 8], d = (b.treeD ?? 0) * PG['tree.dens'];
      return b.trees && d > 0 && rhash(c4x, c4z, 33, s) < d / 16 ? [ax, az] : null;
    };
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const wx = x + dx, wz = z + dz, c4x = wx >> 2, c4z = wz >> 2, me = cand(c4x, c4z);
      if (!me || me[0] !== wx || me[1] !== wz) continue;
      let blocked = false;
      for (let nz = -1; nz <= 1 && !blocked; nz++) for (let nx = -1; nx <= 1; nx++) {
        if (!nx && !nz) continue;
        const o = cand(c4x + nx, c4z + nz); if (!o) continue;
        if (Math.max(Math.abs(o[0] - me[0]), Math.abs(o[1] - me[1])) < 4 &&
            ((c4x + nx) * 100003 + (c4z + nz)) < (c4x * 100003 + c4z)) { blocked = true; break; }
      }
      if (!blocked) return true;
    }
    return false;
  }
  /** 洞穴入口（SURV）：64×64 格一个候选；挖一条 2×2、盘旋下降的阶梯井，底部开小洞室接噪声洞穴。
      跨块一致：每块把周围 2 格内的候选整条重挖一遍，Writer 只保留本块；种子只取格子坐标。 */
  entrances(ch, hAt) {
    const W = new Writer(ch), s = this.seed, CELL = 64;
    const X0 = ch.cx * 16, Z0 = ch.cz * 16;
    const gx0 = Math.floor((X0 - 48) / CELL), gx1 = Math.floor((X0 + 63) / CELL);
    const gz0 = Math.floor((Z0 - 48) / CELL), gz1 = Math.floor((Z0 + 63) / CELL);
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const site = this.entranceSite(gx, gz); if (!site) continue;
      const [sx, sz] = site;
      const rr = RNG(ihash(gx, gz, 44, s));
      const depth = 16 + rr.int(14);
      let x = sx, z = sz, y = hAt(sx, sz) + 1, d = rr.int(4);
      for (let k = 0; k <= depth * 3; k++) {
        if (k & 1) y--;                                          // 每 2 步下 1 格 → 可跳回的阶梯
        if (k % 4 === 3) d = (d + 1) & 3;                        // 盘旋
        if (k % 2 === 1) { x += dirs[d][0]; z += dirs[d][1]; }
        if (y <= 8) break;
        for (let ax = 0; ax < 2; ax++) for (let az = 0; az < 2; az++) { W.set(x + ax, y, z + az, 0); W.set(x + ax, y + 1, z + az, 0); }
        if (k % 6 === 5) for (let ax = -1; ax <= 2; ax++) for (let az = -1; az <= 2; az++) { W.set(x + ax, y, z + az, 0); W.set(x + ax, y + 1, z + az, 0); }
      }
      for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dz * dz + dy * dy * 2 > 5) continue;
        W.set(x + dx, y + dy, z + dz, 0);
      }
      // 主巷道：从井底往外挖 2×2 隧道，遇到噪声洞穴就连上；每 12 步分一条支巷。
      // 路径只由格子种子决定，跨块一致（每块把整条重挖一遍，Writer 只留本块）。
      let dir = rr.int(4), tx = x, tz = z, ty = y;
      const carve = (px, py, pz) => { for (let ax = 0; ax < 2; ax++) for (let az = 0; az < 2; az++) { W.set(px + ax, py, pz + az, 0); W.set(px + ax, py + 1, pz + az, 0); } };
      for (let k = 0; k < 52; k++) {
        if (k % 9 === 0) dir = (dir + (rr() < 0.5 ? 5 : 3)) & 3;       // 左右摆动
        tx += dirs[dir][0]; tz += dirs[dir][1];
        if (rr() < 0.3) ty += rr() < 0.5 ? 1 : -1;
        ty = Math.max(12, Math.min(ty, hAt(tx, tz) - 8));
        carve(tx, ty, tz);
        if (k % 12 === 6) {
          let d2 = (dir + 1) & 3, bx = tx, bz = tz, by = ty;
          for (let j = 0; j < 14; j++) {
            bx += dirs[d2][0]; bz += dirs[d2][1];
            if (rr() < 0.25) d2 = (d2 + (rr() < 0.5 ? 1 : 3)) & 3;
            by = Math.max(12, Math.min(by, hAt(bx, bz) - 8));
            carve(bx, by, bz);
          }
        }
      }
    }
  }
  /** SC 的「树周围 4 格无阻挡」：半径 4（Chebyshev）内若有另一棵树，格子键小的那棵留下。 */
  treeBlocked(c4x, c4z, me, cellTree) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const o = cellTree(c4x + dx, c4z + dz); if (!o) continue;
      if (Math.max(Math.abs(o[0] - me[0]), Math.abs(o[1] - me[1])) < 4 &&
          ((c4x + dx) * 100003 + (c4z + dz)) < (c4x * 100003 + c4z)) return true;
    }
    return false;
  }
  features(ch, hAt, bAt) {
    const W = new Writer(ch), X0 = ch.cx * 16, Z0 = ch.cz * 16, s = this.seed;
    // 4×4 格树候选：返回该格的树锚点 [x,z] 或 null（密度 = 每块期望树数 / 16）
    // 邻居格可能超出 bAt 的 32×32 缓冲，超出时退回 column()（缓存过，代价小）。
    const biomeAtXZ = (x, z) => (x >= X0 - 8 && x < X0 + 24 && z >= Z0 - 8 && z < Z0 + 24)
      ? BIOMES[bAt(x, z)] : BIOMES[this.column(x, z) >> 8];
    const cellTree = (ccx, ccz) => {
      const ax = (ccx << 2) + (ihash(ccx, ccz, 31, s) & 3), az = (ccz << 2) + (ihash(ccx, ccz, 32, s) & 3);
      const b = biomeAtXZ(ax, az); if (!b) return null;
      const d = (b.treeD ?? 0) * PG['tree.dens'];
      return b.trees && d > 0 && rhash(ccx, ccz, 33, s) < d / 16 ? [ax, az] : null;
    };
    for (let wz = Z0 - 7; wz < Z0 + 23; wz++) for (let wx = X0 - 7; wx < X0 + 23; wx++) {
      const bi = bAt(wx, wz), bio = BIOMES[bi], h = hAt(wx, wz);
      const inside = wx >= X0 && wx < X0 + 16 && wz >= Z0 && wz < Z0 + 16;
      const r = rhash(wx, wz, 11, s);
      if (h >= SEA) {
        const c4x = wx >> 2, c4z = wz >> 2, me = cellTree(c4x, c4z);
        if (me && wx === me[0] && wz === me[1] && !this.treeBlocked(c4x, c4z, me, cellTree)) {
          const rr = RNG(ihash(wx, wz, 12, s)); const tot = bio.trees.reduce((a, t) => a + t[1], 0); let pick = rr() * tot, type = bio.trees[0][0];
          for (const t of bio.trees) { pick -= t[1]; if (pick <= 0) { type = t[0]; break; } }
          const base = inside ? W.get(wx, h, wz) : bio.top;
          if (type === 'cactus' || type === 'dead_bush' || type === 'ice_spike' || type === 'boulder' || base === BL.grass_block || base === BL.podzol || base === BL.dirt || base === BL.coarse_dirt || base === BL.mycelium || base === BL.mud || base === BL.snow_block || base === BL.moss_block) growTree(W, type, wx, h + 1, wz, rr, bi);
          continue;
        }
        if (!inside) continue;
        const above = W.get(wx, h + 1, wz), ground = W.get(wx, h, wz);
        if (above !== 0) continue;
        const r2 = rhash(wx, wz, 13, s);
        if (ground === BL.grass_block || ground === BL.podzol || ground === BL.moss_block) {
          if (bio.flowers && r2 < bio.flowerP) { const f = bio.flowers[ihash(wx, wz, 14, s) % bio.flowers.length]; if (f === 'melon') W.set(wx, h + 1, wz, BL.melon); else if (f === 'lily_pad') { } else W.set(wx, h + 1, wz, BL[f], f === 'sweet_berry_bush' ? 3 : 0); }
          else if (r2 < bio.flowerP + bio.grassP) W.set(wx, h + 1, wz, (bi === BIO.taiga || bi === BIO.old_growth_taiga || bi === BIO.jungle) && r2 > 0.7 * bio.grassP ? BL.fern : (bi === BIO.savanna && r2 < 0.1 ? BL.tall_grass : BL.short_grass));
          else if (r2 > 0.9993 && (bi === BIO.plains || bi === BIO.forest)) W.set(wx, h + 1, wz, BL.pumpkin);
        } else if ((ground === BL.sand || ground === BL.red_sand || ground === BL.terracotta) && DRY.has(bi) && r2 < 0.004) W.set(wx, h + 1, wz, BL.dead_bush);
        else if (ground === BL.mycelium && r2 < 0.01) W.set(wx, h + 1, wz, r2 < 0.005 ? BL.red_mushroom : BL.brown_mushroom);
        // sugar cane next to water
        if ((ground === BL.grass_block || ground === BL.sand || ground === BL.dirt) && h === SEA && r2 > 0.9) {
          let wet = false; for (const [dx, dz] of DIR4) if (hAt(wx + dx, wz + dz) < SEA) wet = true;
          if (wet) { const n = 1 + (ihash(wx, wz, 15, s) % 3); for (let k = 1; k <= n; k++) W.set(wx, h + k, wz, BL.sugar_cane); }
        }
      } else if (inside) {
        // underwater
        const r2 = rhash(wx, wz, 16, s), ground = W.get(wx, h, wz);
        if (bi === BIO.swamp || bi === BIO.mangrove_swamp) { if (h >= SEA - 3 && r2 < 0.06 && W.get(wx, SEA + 1, wz) === 0) W.set(wx, SEA + 1, wz, BL.lily_pad); if (bi === BIO.mangrove_swamp && r < 0.03) growTree(W, 'mangrove', wx, h + 1, wz, RNG(ihash(wx, wz, 12, s)), bi); continue; }
        if (bi === BIO.frozen_ocean) { if (r < 0.0015) growTree(W, 'iceberg', wx, SEA, wz, RNG(ihash(wx, wz, 17, s)), bi); continue; }
        if (bi === BIO.warm_ocean && h > SEA - 14 && this.nMisc.n2(wx / 18, wz / 18) > 0.1) {
          const cols = ['tube', 'brain', 'bubble', 'fire', 'horn'], c = cols[ihash(wx >> 2, wz >> 2, 18, s) % 5];
          if (r2 < 0.5) { const hh = 1 + (ihash(wx, wz, 19, s) % 3); for (let k = 0; k < hh; k++) W.set(wx, h + k, wz, BL[c + '_coral_block']); if (h + hh < SEA - 1 && r2 < 0.3) W.set(wx, h + hh, wz, BL[cols[ihash(wx, wz, 20, s) % 5] + '_coral']); }
          else if (r2 < 0.55) W.set(wx, h + 1, wz, BL.sea_pickle, ihash(wx, wz, 2, s) % 4);
          continue;
        }
        if (ground !== BL.sand && ground !== BL.gravel && ground !== BL.dirt && ground !== BL.clay) continue;
        if (r2 < 0.04 && SEA - h > 4 && bi !== BIO.river) { const len = 2 + (ihash(wx, wz, 21, s) % Math.max(1, SEA - h - 3)); for (let k = 1; k <= len && h + k < SEA - 1; k++) W.set(wx, h + k, wz, BL.kelp); }
        else if (r2 < 0.2) W.set(wx, h + 1, wz, BL.seagrass);
      }
    }
  }
  structures(ch, hAt) {
    const W = new Writer(ch); const dim = ch.dim;
    for (const S of STRUCTS) {
      if (S.dim !== dim) continue;
      const sp = S.spacing * 16, cx0 = ch.cx * 16 - S.radius, cx1 = ch.cx * 16 + 15 + S.radius, cz0 = ch.cz * 16 - S.radius, cz1 = ch.cz * 16 + 15 + S.radius;
      for (let rz = Math.floor(cz0 / sp); rz <= Math.floor(cz1 / sp); rz++) for (let rx = Math.floor(cx0 / sp); rx <= Math.floor(cx1 / sp); rx++) {
        const plan = this.plan(S, rx, rz); if (!plan) continue;
        for (const p of plan.pieces) {
          if (p.x1 < ch.cx * 16 || p.x0 > ch.cx * 16 + 15 || p.z1 < ch.cz * 16 || p.z0 > ch.cz * 16 + 15) continue;
          p.gen(W, RNG(ihash(p.x0, p.y0, p.z0, this.seed + 99)));
        }
      }
    }
    if (dim === DIM_OVER) for (const sh of this.strongholds) { const p = strongholdPiece(sh); if (!(p.x1 < ch.cx * 16 || p.x0 > ch.cx * 16 + 15 || p.z1 < ch.cz * 16 || p.z0 > ch.cz * 16 + 15)) p.gen(W, RNG(ihash(sh[0], sh[1], sh[2], this.seed))); }
  }
  plan(S, rx, rz) {
    const key = S.name + ':' + rx + ',' + rz; if (this.plans.has(key)) return this.plans.get(key);
    if (this.plans.size > 3000) this.plans.clear();
    const r = RNG(ihash(rx, rz, hashString(S.name), this.seed));
    const range = S.spacing - S.sep; const x = (rx * S.spacing + r.int(range)) * 16 + 8, z = (rz * S.spacing + r.int(range)) * 16 + 8;
    let plan = null;
    if (r() < (S.chance || 1)) plan = S.plan(this, x, z, r);
    this.plans.set(key, plan); return plan;
  }
  locate(name, px, pz) {
    if (name === 'stronghold') { let best = null, bd = 1e18; for (const s of this.strongholds) { const d = (s[0] - px) ** 2 + (s[2] - pz) ** 2; if (d < bd) { bd = d; best = s; } } return best; }
    const S = STRUCTS.find(s => s.name === name); if (!S) return null; const sp = S.spacing * 16;
    let best = null, bd = 1e18; const crx = Math.floor(px / sp), crz = Math.floor(pz / sp);
    for (let rz = crz - 6; rz <= crz + 6; rz++) for (let rx = crx - 6; rx <= crx + 6; rx++) { const p = this.plan(S, rx, rz); if (!p) continue; const d = (p.x - px) ** 2 + (p.z - pz) ** 2; if (d < bd) { bd = d; best = [p.x, p.y || 64, p.z]; } }
    return best;
  }
}
const BI_DESERT = BIO.desert;
function y0n(v) { return v / 14; }

// ---- trees & big features
function growTree(W, type, x, y, z, r, biome) {
  const leaves = new Set(); const LK = (a, b, c) => a + ',' + b + ',' + c;
  const L = (a, b, c, id) => { W.soft(a, b, c, id); leaves.add(LK(a, b, c)); };
  const log = (a, b, c, id, ax = 0) => W.set(a, b, c, id, ax);
  const canopy = (cx, cy, cz, R, id, k = 1, prob = 1) => { for (let dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (let dz = -Math.ceil(R); dz <= Math.ceil(R); dz++) for (let dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) { if (dx * dx + dz * dz + dy * dy * k <= R * R + 0.3 && r() < prob) L(cx + dx, cy + dy, cz + dz, id); } };
  const vines = (prob) => { for (const k of leaves) { if (r() > prob) continue; const [a, b, c] = k.split(',').map(Number); const d = r.int(4); const [dx, dz] = DIR4[d]; if (leaves.has(LK(a + dx, b, c + dz))) continue; const len = 1 + r.int(4); for (let i = 0; i < len; i++) { if (leaves.has(LK(a + dx, b - i, c + dz))) break; W.soft(a + dx, b - i, c + dz, BL.vine, d ^ 1); } } };
  switch (type) {
    case 'oak': case 'birch': case 'swamp_oak': case 'tall_birch': {
      const isB = type === 'birch' || type === 'tall_birch'; const lg = isB ? BL.birch_log : BL.oak_log, lv = isB ? BL.birch_leaves : BL.oak_leaves;
      const h = (type === 'tall_birch' ? 8 : isB ? 5 : 4) + r.int(3);
      for (let ly = y + h - 3; ly <= y + h; ly++) { const R = ly >= y + h - 1 ? 1 : 2; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) { if (Math.abs(dx) === R && Math.abs(dz) === R && (ly === y + h || r() < 0.5)) continue; L(x + dx, ly, z + dz, lv); } }
      for (let i = 0; i < h; i++) log(x, y + i, z, lg);
      if (type === 'swamp_oak') vines(0.35);
      W.set(x, y - 1, z, BL.dirt); break;
    }
    case 'fancy_oak': {
      const h = 8 + r.int(5); for (let i = 0; i < h; i++) log(x, y + i, z, BL.oak_log);
      canopy(x, y + h, z, 2.8, BL.oak_leaves, 2);
      for (let b = 0; b < 4; b++) { const by = y + h - 2 - r.int(4), a = r() * Math.PI * 2, len = 2 + r.int(3); let ex = x, ez = z; for (let k = 1; k <= len; k++) { ex = Math.round(x + Math.cos(a) * k); ez = Math.round(z + Math.sin(a) * k); log(ex, by + (k >> 1), ez, BL.oak_log, Math.abs(Math.cos(a)) > 0.7 ? 1 : 2); } canopy(ex, by + (len >> 1) + 1, ez, 2.2, BL.oak_leaves, 2); }
      W.set(x, y - 1, z, BL.dirt); break;
    }
    case 'spruce': case 'pine': {
      const h = 6 + r.int(5); for (let i = 0; i < h; i++) log(x, y + i, z, BL.spruce_log);
      if (type === 'pine') { for (let ly = y + h - 4; ly <= y + h; ly++) { const R = ly >= y + h - 1 ? 1 : 2; for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (Math.abs(dx) + Math.abs(dz) <= R + (R > 1 ? 0 : 1)) L(x + dx, ly, z + dz, BL.spruce_leaves); } L(x, y + h + 1, z, BL.spruce_leaves); }
      else { let R = 0; for (let ly = y + h + 1; ly >= y + 2; ly--) { for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (Math.abs(dx) + Math.abs(dz) <= R + (R > 1 ? 1 : 0) && !(Math.abs(dx) === R && Math.abs(dz) === R && R > 1)) L(x + dx, ly, z + dz, BL.spruce_leaves); R = R >= 2 + (ly < y + h - 3 ? 1 : 0) ? 1 : R + 1; } }
      W.set(x, y - 1, z, BL.dirt); break;
    }
    case 'mega_spruce': {
      const h = 14 + r.int(10); for (let i = 0; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) log(x + dx, y + i, z + dz, BL.spruce_log);
      for (let ly = y + h + 1; ly >= y + Math.floor(h * 0.45); ly--) { const t = (y + h + 1 - ly) / (h * 0.55); const R = 0.6 + t * 3.6 * (0.75 + 0.25 * Math.sin(ly * 1.7)); for (let dz = -5; dz <= 6; dz++) for (let dx = -5; dx <= 6; dx++) if ((dx - 0.5) ** 2 + (dz - 0.5) ** 2 <= R * R) L(x + dx, ly, z + dz, BL.spruce_leaves); }
      for (const [dx, dz] of [[-1, -1], [2, -1], [-1, 2], [2, 2], [0, -1], [1, 2]]) W.set(x + dx, y - 1, z + dz, BL.podzol); break;
    }
    case 'jungle': case 'jungle_bush': case 'mega_jungle': {
      if (type === 'jungle_bush') { log(x, y, z, BL.jungle_log); canopy(x, y + 1, z, 2.3, BL.oak_leaves, 2.5); break; }
      const mega = type === 'mega_jungle', h = mega ? 18 + r.int(10) : 6 + r.int(5), w = mega ? 2 : 1;
      for (let i = 0; i < h; i++) for (let dx = 0; dx < w; dx++) for (let dz = 0; dz < w; dz++) log(x + dx, y + i, z + dz, BL.jungle_log);
      canopy(x + (w - 1) * 0.5, y + h, z + (w - 1) * 0.5, mega ? 4.2 : 2.6, BL.jungle_leaves, 2.2);
      if (mega) for (let b = 0; b < 3; b++) { const by = y + Math.floor(h * 0.55) + r.int(Math.floor(h * 0.3)), a = r() * Math.PI * 2; let ex, ez; for (let k = 1; k <= 3; k++) { ex = Math.round(x + Math.cos(a) * k); ez = Math.round(z + Math.sin(a) * k); log(ex, by + (k >> 1), ez, BL.jungle_log, Math.abs(Math.cos(a)) > 0.7 ? 1 : 2); } canopy(ex, by + 2, ez, 2.4, BL.jungle_leaves, 2.2); }
      for (let i = 0; i < h - 2; i++) for (const [dx, dz, d] of [[-1, 0, 0], [w, 0, 1], [0, -1, 2], [0, w, 3]]) if (r() < 0.35) W.soft(x + dx, y + i, z + dz, BL.vine, d);
      vines(0.25); break;
    }
    case 'acacia': {
      const h = 4 + r.int(2); for (let i = 0; i < h; i++) log(x, y + i, z, BL.acacia_log);
      const [ddx, ddz] = DIR4[r.int(4)]; let tx = x, tz = z, ty = y + h; for (let k = 0; k < 2 + r.int(2); k++) { tx += ddx; tz += ddz; log(tx, ty, tz, BL.acacia_log); ty++; }
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dz) <= 4) L(tx + dx, ty, tz + dz, BL.acacia_leaves);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) L(tx + dx, ty + 1, tz + dz, BL.acacia_leaves);
      if (r() < 0.5) { const [ex, ez] = DIR4[r.int(4)]; let bx = x, bz = z, by = y + h - 1; for (let k = 0; k < 2; k++) { bx -= ex; bz -= ez; log(bx, by, bz, BL.acacia_log); by++; } for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dz) <= 3) L(bx + dx, by, bz + dz, BL.acacia_leaves); }
      W.set(x, y - 1, z, BL.dirt); break;
    }
    case 'dark_oak': {
      const h = 6 + r.int(3); for (let i = 0; i < h; i++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) log(x + dx, y + i, z + dz, BL.dark_oak_log);
      for (let ly = y + h - 2; ly <= y + h + 1; ly++) { const R = ly === y + h + 1 ? 2.5 : 4.2; for (let dz = -4; dz <= 5; dz++) for (let dx = -4; dx <= 5; dx++) if ((dx - 0.5) ** 2 + (dz - 0.5) ** 2 <= R * R && r() < 0.95) L(x + dx, ly, z + dz, BL.dark_oak_leaves); }
      break;
    }
    case 'cherry': {
      const h = 5 + r.int(3); const [dx, dz] = DIR4[r.int(4)]; let tx = x, tz = z;
      for (let i = 0; i < h; i++) { if (i === h - 2) { tx += dx; tz += dz; } log(tx, y + i, tz, BL.cherry_log); }
      for (let ly = -1; ly <= 2; ly++) { const R = ly === 2 ? 2.2 : ly === -1 ? 3 : 4; for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) if (a * a + b * b <= R * R && r() < 0.92) L(tx + a, y + h + ly, tz + b, BL.cherry_leaves); }
      for (let k = 0; k < 8; k++) { const a = tx + r.int(7) - 3, b = tz + r.int(7) - 3; if (leaves.has(LK(a, y + h - 1, b))) W.soft(a, y + h - 2, b, BL.cherry_leaves); }
      W.set(x, y - 1, z, BL.dirt); break;
    }
    case 'mangrove': {
      const h = 6 + r.int(4), base = y + 2;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]]) { let rx = x, rz = z; for (let k = 0; k < 4; k++) { if (k > 0) { rx += Math.sign(dx); rz += Math.sign(dz); } W.soft(rx, base - k + 1, rz, BL.mangrove_roots); } for (let yy = base - 4; yy > y - 4; yy--) W.soft(rx, yy, rz, BL.mangrove_roots); }
      for (let i = 0; i < h; i++) log(x, base + i, z, BL.mangrove_log);
      canopy(x, base + h, z, 3.2, BL.mangrove_leaves, 2); vines(0.12); break;
    }
    case 'huge_brown_mushroom': case 'huge_red_mushroom': {
      const red = type === 'huge_red_mushroom', h = 5 + r.int(3);
      for (let i = 0; i < h; i++) W.set(x, y + i, z, BL.mushroom_stem);
      if (red) { for (let ly = y + h - 3; ly < y + h; ly++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if ((Math.abs(dx) === 2 || Math.abs(dz) === 2) && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) W.soft(x + dx, ly, z + dz, BL.red_mushroom_block); for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.soft(x + dx, y + h, z + dz, BL.red_mushroom_block); }
      else for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (!(Math.abs(dx) === 3 && Math.abs(dz) === 3)) W.soft(x + dx, y + h, z + dz, BL.brown_mushroom_block);
      break;
    }
    case 'cactus': { const h = 1 + r.int(3); for (let i = 0; i < h; i++) W.set(x, y + i, z, BL.cactus); break; }
    case 'dead_bush': W.soft(x, y, z, BL.dead_bush); break;
    case 'bamboo': { const h = 4 + r.int(9); for (let i = 0; i < h; i++) W.set(x, y + i, z, BL.bamboo, i >= h - 2 ? 1 : 0); break; }
    case 'boulder': { canopy(x, y, z, 1.8 + r() * 0.8, BL.mossy_cobblestone, 1.2); break; }
    case 'ice_spike': {
      const h = 8 + r.int(r() < 0.1 ? 30 : 10), R = 1.5 + r() * 1.4;
      for (let i = -2; i < h; i++) { const rr = R * (1 - i / h); for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= rr * rr + 0.2) W.set(x + dx, y + i, z + dz, BL.packed_ice); }
      break;
    }
    case 'iceberg': {
      const h = 6 + r.int(10), R = 3 + r() * 3;
      for (let i = -h; i < h; i++) { const rr = R * (1 - Math.abs(i) / h) * (i > 0 ? 0.8 : 1.1); for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) if (dx * dx + dz * dz <= rr * rr) W.set(x + dx, y + i, z + dz, r() < 0.1 ? BL.blue_ice : i > 0 && r() < 0.3 ? BL.snow_block : BL.packed_ice); }
      break;
    }
    case 'crimson_fungus': case 'warped_fungus': {
      const cr = type === 'crimson_fungus', stem = cr ? BL.crimson_stem : BL.warped_stem, wart = cr ? BL.nether_wart_block : BL.warped_wart_block, h = 5 + r.int(r() < 0.1 ? 10 : 5);
      for (let i = 0; i < h; i++) log(x, y + i, z, stem);
      for (let ly = y + h - 3; ly <= y + h; ly++) { const R = ly === y + h ? 1.5 : 2.6 + (y + h - ly) * 0.3; for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const d = dx * dx + dz * dz; if (d <= R * R && (d >= (R - 1.3) ** 2 || ly === y + h)) W.soft(x + dx, ly, z + dz, r() < 0.08 ? BL.shroomlight : wart); } }
      if (cr) for (let k = 0; k < 6; k++) { const a = x + r.int(5) - 2, b = z + r.int(5) - 2; const len = 1 + r.int(4); for (let i = 1; i <= len; i++) W.soft(a, y + h - 3 - i, b, BL.weeping_vines); }
      break;
    }
  }
}

// ---- structures
const piece = (x0, y0, z0, x1, y1, z1, gen) => ({ x0, y0, z0, x1, y1, z1, gen });
const VSTYLE = {
  oak: { wall: BL.oak_planks, log: BL.oak_log, roof: BL.oak_stairs, roofB: BL.oak_planks, base: BL.cobblestone, floor: BL.oak_planks, path: BL.dirt_path, fence: BL.oak_fence },
  desert: { wall: BL.cut_sandstone, log: BL.chiseled_sandstone, roof: BL.sandstone_stairs, roofB: BL.smooth_sandstone, base: BL.sandstone, floor: BL.smooth_sandstone, path: BL.dirt_path, fence: BL.oak_fence, flat: true },
  acacia: { wall: BL.acacia_planks, log: BL.acacia_log, roof: BL.acacia_stairs, roofB: BL.acacia_planks, base: BL.cobblestone, floor: BL.acacia_planks, path: BL.dirt_path, fence: BL.oak_fence },
  spruce: { wall: BL.spruce_planks, log: BL.spruce_log, roof: BL.spruce_stairs, roofB: BL.spruce_planks, base: BL.cobblestone, floor: BL.spruce_planks, path: BL.dirt_path, fence: BL.oak_fence },
  snowy: { wall: BL.white_terracotta, log: BL.spruce_log, roof: BL.spruce_stairs, roofB: BL.spruce_planks, base: BL.cobblestone, floor: BL.spruce_planks, path: BL.dirt_path, fence: BL.oak_fence, snow: true }
};
const VILLAGE_STYLE = { [BIO.plains]: 'oak', [BIO.sunflower_plains]: 'oak', [BIO.meadow]: 'oak', [BIO.desert]: 'desert', [BIO.savanna]: 'acacia', [BIO.taiga]: 'spruce', [BIO.snowy_plains]: 'snowy' };
function foundation(W, gen, x0, z0, x1, z1, gy, S) {
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!W.inside(x, z)) continue; const h = gen.colH(x, z);
    for (let y = Math.min(h, gy - 1); y <= gy - 1; y++) W.set(x, y, z, S.base);
    for (let y = gy; y < gy + 9; y++) W.set(x, y, z, 0);
  }
}
function vHouse(W, gen, cx, cz, face, S, r, big) {
  const w = big ? 7 : 5, d = big ? 9 : 5, hx = w >> 1, hz = d >> 1;
  const x0 = cx - hx, x1 = cx + hx, z0 = cz - hz, z1 = cz + hz; const gy = gen.colH(cx, cz) + 1;
  if (gy <= SEA + 1) return;
  foundation(W, gen, x0 - 1, z0 - 1, x1 + 1, z1 + 1, gy, S);
  const wallH = big ? 4 : 3;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    W.set(x, gy - 1, z, S.floor);
    const edge = x === x0 || x === x1 || z === z0 || z === z1, corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    for (let y = gy; y < gy + wallH; y++) if (edge) W.set(x, y, z, corner ? S.log : S.wall);
  }
  // windows
  for (let y = gy + 1; y < gy + 2 + (big ? 1 : 0); y++) { W.set(cx, y, z0, BL.glass_pane); W.set(cx, y, z1, BL.glass_pane); W.set(x0, y, cz, BL.glass_pane); W.set(x1, y, cz, BL.glass_pane); if (big) { W.set(x0, y, cz - 2, BL.glass_pane); W.set(x1, y, cz + 2, BL.glass_pane); } }
  // door on face side
  const [fx, fz] = DIR4[face]; const dx = fx ? (fx > 0 ? x1 : x0) : cx + (big ? 1 : 0), dz = fz ? (fz > 0 ? z1 : z0) : cz;
  W.set(dx, gy, dz, BL.oak_door, face); W.set(dx, gy + 1, dz, BL.oak_door, face | 8);
  W.set(dx + fx, gy - 1, dz + fz, S.path); W.set(dx + fx, gy, dz + fz, 0); W.set(dx + fx, gy + 1, dz + fz, 0);
  W.set(dx - fx * 1 + (fz ? 1 : 0), gy + 2, dz - fz + (fx ? 1 : 0), BL.torch, 0);
  // roof
  const ry = gy + wallH;
  if (S.flat) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) W.set(x, ry, z, S.roofB); for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x === x0 || x === x1 || z === z0 || z === z1) W.set(x, ry + 1, z, BL.sandstone_slab); }
  else {
    for (let k = 0; k <= hx + 1; k++) {
      const yy = ry + k; const xa = x0 - 1 + k, xb = x1 + 1 - k; if (xa > xb) break;
      for (let z = z0 - 1; z <= z1 + 1; z++) { if (xa === xb) { W.set(xa, yy, z, S.roofB); continue; } W.set(xa, yy, z, S.roof, 0); W.set(xb, yy, z, S.roof, 1); if (z === z0 || z === z1) for (let x = xa + 1; x < xb; x++) W.set(x, yy, z, S.wall); }
      if (S.snow) for (let z = z0 - 1; z <= z1 + 1; z++) { W.set(xa, yy + 1, z, BL.snow); W.set(xb, yy + 1, z, BL.snow); }
    }
  }
  // interior
  W.set(x0 + 1, gy, z0 + 1, BL.crafting_table); W.set(x1 - 1, gy, z0 + 1, BL.red_bed, 2); W.set(x1 - 1, gy, z0 + 2, BL.red_bed, 2 | 4);
  if (big) { W.chest(x0 + 1, gy, z1 - 1, 'village', r, 0); W.set(x1 - 1, gy, z1 - 1, BL.furnace, 1); W.set(x0 + 1, gy, cz, BL.bookshelf); }
  W.set(cx, gy + wallH - 1, cz, BL.lantern, 1);
  W.spawn('villager', cx + 0.5, gy, cz + 0.5, { prof: r.pick(['farmer', 'librarian', 'cleric', 'armorer', 'butcher', 'fletcher', 'cartographer', 'toolsmith', 'weaponsmith', 'shepherd', 'leatherworker', 'mason']) });
}
function vFarm(W, gen, cx, cz, S, r) {
  const gy = gen.colH(cx, cz) + 1; if (gy <= SEA + 1) return;
  const crop = r.pick([BL.wheat, BL.wheat, BL.carrots, BL.potatoes, BL.beetroots]);
  foundation(W, gen, cx - 4, cz - 3, cx + 4, cz + 3, gy, S);
  for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 4; x <= cx + 4; x++) {
    const edge = x === cx - 4 || x === cx + 4 || z === cz - 3 || z === cz + 3;
    if (edge) W.set(x, gy - 1, z, S.log, x === cx - 4 || x === cx + 4 ? 2 : 1);
    else if (x === cx) W.set(x, gy - 1, z, BL.water);
    else { W.set(x, gy - 1, z, BL.farmland, 7); W.set(x, gy, z, crop, r.int(crop === BL.beetroots ? 4 : 8)); }
  }
}
function vWell(W, x, y, z, S) {
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { for (let yy = y - 4; yy < y; yy++) W.set(x + dx, yy, z + dz, S.base); for (let yy = y; yy < y + 6; yy++) W.set(x + dx, yy, z + dz, 0); }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let yy = y - 3; yy < y; yy++) W.set(x + dx, yy, z + dz, BL.water);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) W.set(x + dx, y, z + dz, S.base);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { W.set(x + dx, y + 1, z + dz, S.fence); W.set(x + dx, y + 2, z + dz, S.fence); }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y + 3, z + dz, S.base === BL.sandstone ? BL.sandstone_slab : BL.cobblestone_slab);
  W.set(x, y + 4, z, BL.lantern, 0);
}
function vLamp(W, gen, x, z, S) { const gy = gen.colH(x, z) + 1; if (gy <= SEA + 1) return; W.set(x, gy - 1, z, S.base); for (let i = 0; i < 3; i++) W.set(x, gy + i, z, S.fence); W.set(x, gy + 3, z, S.wall); W.set(x + 1, gy + 3, z, BL.torch, 2); W.set(x - 1, gy + 3, z, BL.torch, 1); }
function tower(W, x0, y0, z0, w, h, wall, corner, floorB, every = 5) {
  for (let y = y0; y < y0 + h; y++) for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) {
    const edge = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + w - 1, cor = (x === x0 || x === x0 + w - 1) && (z === z0 || z === z0 + w - 1);
    if (edge) W.set(x, y, z, cor ? corner : wall); else W.set(x, y, z, (y - y0) % every === 0 ? floorB : 0);
  }
}
const STRUCTS = [
  { name: 'village', dim: 0, spacing: 34, sep: 8, radius: 60, plan(g, x, z, r) {
    const st = VILLAGE_STYLE[g.colB(x, z)]; if (!st) return null; const y = g.colH(x, z) + 1; if (y <= SEA + 1 || y > 115) return null;
    const S = VSTYLE[st], pieces = [piece(x - 3, y - 4, z - 3, x + 3, y + 6, z + 3, (W) => vWell(W, x, y, z, S))];
    pieces.push(piece(x - 1, y, z - 1, x + 1, y + 2, z + 1, (W) => W.spawn('iron_golem', x + 2.5, y, z + 0.5)));
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIR4[d], len = 18 + r.int(16);
      const bx0 = Math.min(x, x + dx * len) - 1, bx1 = Math.max(x, x + dx * len) + 1, bz0 = Math.min(z, z + dz * len) - 1, bz1 = Math.max(z, z + dz * len) + 1;
      pieces.push(piece(bx0, 0, bz0, bx1, WH, bz1, (W) => { for (let k = 3; k <= len; k++) for (let w = -1; w <= 1; w++) { const px = x + dx * k + (dz ? w : 0), pz = z + dz * k + (dx ? w : 0); const h = g.colH(px, pz); if (h < SEA) W.set(px, SEA, pz, S.floor); else { W.set(px, h, pz, S.path); if (W.get(px, h + 1, pz) > 0 && BLOCKS[W.get(px, h + 1, pz)].replace) W.set(px, h + 1, pz, 0); } } }));
      for (let k = 9; k < len; k += 10 + r.int(4)) for (const side of [-1, 1]) {
        if (r() < 0.25) continue; const off = 7; const hx = x + dx * k + (dz ? side * off : 0), hz = z + dz * k + (dx ? side * off : 0);
        const face = dz ? (side > 0 ? 1 : 0) : (side > 0 ? 3 : 2); const t = r(); const R2 = RNG(ihash(hx, hz, 5, g.seed));
        if (t < 0.45) pieces.push(piece(hx - 4, 0, hz - 4, hx + 4, WH, hz + 4, (W) => vHouse(W, g, hx, hz, face, S, R2, false)));
        else if (t < 0.7) pieces.push(piece(hx - 5, 0, hz - 6, hx + 5, WH, hz + 6, (W) => vHouse(W, g, hx, hz, face, S, R2, true)));
        else if (t < 0.92) pieces.push(piece(hx - 5, 0, hz - 4, hx + 5, WH, hz + 4, (W) => vFarm(W, g, hx, hz, S, R2)));
        else pieces.push(piece(hx - 1, 0, hz - 1, hx + 1, WH, hz + 1, (W) => vLamp(W, g, hx, hz, S)));
      }
    }
    return { x, y, z, pieces };
  } },
  { name: 'desert_pyramid', dim: 0, spacing: 32, sep: 8, radius: 12, plan(g, x, z, r) {
    if (g.colB(x, z) !== BIO.desert) return null; const y = g.colH(x, z) + 1; if (y < SEA + 2) return null;
    return { x, y, z, pieces: [piece(x - 11, y - 16, z - 11, x + 11, y + 14, z + 11, (W, R) => {
      for (let k = 0; k <= 10; k++) for (let dz = -10 + k; dz <= 10 - k; dz++) for (let dx = -10 + k; dx <= 10 - k; dx++) { const edge = Math.abs(dx) === 10 - k || Math.abs(dz) === 10 - k; W.set(x + dx, y + k, z + dz, edge ? (k % 3 === 2 ? BL.cut_sandstone : BL.sandstone) : 0); }
      for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) { W.set(x + dx, y - 1, z + dz, BL.sandstone); for (let yy = g.colH(x + dx, z + dz); yy < y - 1; yy++) W.set(x + dx, yy, z + dz, BL.sandstone); }
      for (let dz = -1; dz <= 1; dz++) for (let k = 0; k < 3; k++) W.set(x + dz, y + k, z + 10, 0); W.set(x, y + 3, z + 10, BL.chiseled_sandstone);
      for (const [dx, dz] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [-1, 1], [1, -1]]) W.set(x + dx, y - 1, z + dz, BL.orange_terracotta); W.set(x, y - 1, z, BL.blue_terracotta);
      for (let yy = y - 14; yy < y - 1; yy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) W.set(x + dx, yy, z + dz, (Math.abs(dx) === 4 || Math.abs(dz) === 4 || yy === y - 14) ? BL.sandstone : 0);
      W.set(x, y - 1, z, 0); for (let yy = y - 13; yy < y - 1; yy++) W.set(x, yy, z, 0);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y - 15, z + dz, BL.tnt); W.set(x, y - 13, z, BL.stone_pressure_plate);
      W.chest(x - 3, y - 13, z, 'desert_pyramid', R, 0); W.chest(x + 3, y - 13, z, 'desert_pyramid', R, 1); W.chest(x, y - 13, z - 3, 'desert_pyramid', R, 2); W.chest(x, y - 13, z + 3, 'desert_pyramid', R, 3);
      for (const [tx, tz] of [[-8, 8], [8, 8]]) tower(W, x + tx - 2, y, z + tz - 2, 5, 13, BL.sandstone, BL.cut_sandstone, BL.sandstone, 13);
    })] };
  } },
  { name: 'jungle_temple', dim: 0, spacing: 32, sep: 8, radius: 10, plan(g, x, z, r) {
    const b = g.colB(x, z); if (b !== BIO.jungle && b !== BIO.bamboo_jungle) return null; const y = g.colH(x, z) + 1; if (y < SEA + 2) return null;
    return { x, y, z, pieces: [piece(x - 7, y - 4, z - 8, x + 7, y + 14, z + 8, (W, R) => {
      const M = () => R() < 0.5 ? BL.mossy_cobblestone : BL.cobblestone;
      for (let dz = -7; dz <= 7; dz++) for (let dx = -6; dx <= 6; dx++) for (let yy = g.colH(x + dx, z + dz); yy < y; yy++) W.set(x + dx, yy, z + dz, M());
      for (let lvl = 0; lvl < 3; lvl++) { const s = 6 - lvl * 2, yb = y + lvl * 4; for (let yy = yb; yy < yb + 4; yy++) for (let dz = -s - 1; dz <= s + 1; dz++) for (let dx = -s; dx <= s; dx++) { const e = Math.abs(dx) === s || Math.abs(dz) === s + 1 || yy === yb + 3; W.set(x + dx, yy, z + dz, e ? M() : 0); } }
      for (let k = 0; k < 3; k++) W.set(x, y + k, z + 7, 0); W.set(x, y + 1, z + 6, 0);
      W.chest(x - 4, y, z - 5, 'jungle_temple', R, 0); W.chest(x + 3, y + 4, z - 2, 'jungle_temple', R, 1);
      W.set(x, y, z - 4, BL.chiseled_stone_bricks); W.set(x + 4, y + 8, z, BL.chiseled_stone_bricks);
    })] };
  } },
  { name: 'igloo', dim: 0, spacing: 32, sep: 8, radius: 6, plan(g, x, z, r) {
    const b = g.colB(x, z); if (b !== BIO.snowy_plains && b !== BIO.snowy_taiga) return null; const y = g.colH(x, z) + 1; if (y < SEA + 1) return null;
    return { x, y, z, pieces: [piece(x - 5, y - 2, z - 6, x + 5, y + 6, z + 5, (W, R) => {
      for (let dy = 0; dy <= 4; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const d = Math.sqrt(dx * dx + dz * dz + dy * dy * 1.6); if (d <= 4.2) W.set(x + dx, y + dy, z + dz, d > 3.2 ? BL.snow_block : 0); }
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= 18) { W.set(x + dx, y - 1, z + dz, BL.snow_block); }
      for (let k = 0; k < 2; k++) { W.set(x, y + k, z - 4, 0); W.set(x, y + k, z - 5, 0); } W.set(x - 1, y, z - 5, BL.snow_block); W.set(x + 1, y, z - 5, BL.snow_block); W.set(x - 1, y + 1, z - 5, BL.snow_block); W.set(x + 1, y + 1, z - 5, BL.snow_block); W.set(x, y + 2, z - 5, BL.snow_block);
      W.set(x - 2, y, z + 1, BL.red_bed, 2); W.set(x - 2, y, z + 2, BL.red_bed, 6); W.set(x + 2, y, z + 1, BL.furnace, 1); W.set(x + 2, y, z, BL.crafting_table); W.set(x + 2, y, z + 2, BL.white_carpet); W.chest(x + 1, y, z + 2, 'igloo', R, 3); W.set(x, y + 3, z, BL.lantern, 1);
    })] };
  } },
  { name: 'witch_hut', dim: 0, spacing: 32, sep: 8, radius: 6, plan(g, x, z, r) {
    if (g.colB(x, z) !== BIO.swamp) return null; const y = SEA + 3;
    return { x, y, z, pieces: [piece(x - 4, y - 8, z - 5, x + 4, y + 7, z + 5, (W) => {
      for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) for (let yy = g.colH(x + dx, z + dz); yy < y; yy++) W.set(x + dx, yy, z + dz, BL.oak_log);
      for (let dz = -3; dz <= 4; dz++) for (let dx = -3; dx <= 3; dx++) W.set(x + dx, y, z + dz, BL.spruce_planks);
      for (let yy = y + 1; yy <= y + 3; yy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const e = Math.abs(dx) === 3 || Math.abs(dz) === 3, c = Math.abs(dx) === 3 && Math.abs(dz) === 3; W.set(x + dx, yy, z + dz, e ? (c ? BL.oak_log : BL.spruce_planks) : 0); }
      W.set(x, y + 1, z + 3, 0); W.set(x, y + 2, z + 3, 0); W.set(x - 3, y + 2, z, BL.glass_pane); W.set(x + 3, y + 2, z, BL.glass_pane);
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) W.set(x + dx, y + 4, z + dz, Math.abs(dx) === 4 || Math.abs(dz) === 4 ? BL.spruce_slab : BL.spruce_planks);
      W.set(x - 2, y + 1, z - 2, BL.cauldron, 2); W.set(x + 2, y + 1, z - 2, BL.crafting_table);
      W.spawn('witch', x + 0.5, y + 1, z + 0.5); W.spawn('cat', x - 1.5, y + 1, z + 0.5, { color: 'black' });
    })] };
  } },
  { name: 'pillager_outpost', dim: 0, spacing: 36, sep: 8, radius: 8, chance: 0.5, plan(g, x, z, r) {
    const b = g.colB(x, z); if (![BIO.plains, BIO.desert, BIO.savanna, BIO.taiga, BIO.snowy_plains, BIO.meadow].includes(b)) return null; const y = g.colH(x, z) + 1; if (y < SEA + 2) return null;
    return { x, y, z, pieces: [piece(x - 5, y - 3, z - 5, x + 5, y + 24, z + 5, (W, R) => {
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) for (let yy = g.colH(x + dx, z + dz); yy < y; yy++) W.set(x + dx, yy, z + dz, BL.cobblestone);
      tower(W, x - 3, y, z - 3, 7, 20, BL.birch_planks, BL.dark_oak_log, BL.dark_oak_planks, 5);
      for (let fl = 0; fl < 4; fl++) { const yy = y + fl * 5; for (let k = 1; k < 5; k++) W.set(x + 2, yy + k, z + 2, BL.ladder, 0); W.set(x + 2, yy, z + 2, 0); W.set(x - 3, yy + 2, z, BL.glass_pane); W.set(x + 3, yy + 2, z, BL.glass_pane); W.set(x, yy + 2, z - 3, BL.glass_pane); }
      for (let k = 1; k < 3; k++) W.set(x, y + k, z + 3, 0);
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { W.set(x + dx, y + 20, z + dz, BL.dark_oak_planks); if (Math.abs(dx) === 4 || Math.abs(dz) === 4) W.set(x + dx, y + 21, z + dz, BL.oak_fence); }
      W.set(x + 2, y + 20, z + 2, 0); W.chest(x - 2, y + 21, z - 2, 'outpost', R, 0); W.set(x, y + 22, z, BL.dark_oak_log); W.set(x, y + 23, z, BL.white_wool);
      for (let k = 0; k < 3; k++) W.spawn('pillager', x + 0.5 + k, y + 1 + k * 7, z + 0.5);
      W.spawn('pillager', x - 1.5, y + 21, z + 1.5);
    })] };
  } },
  { name: 'ruined_portal', dim: 0, spacing: 25, sep: 6, radius: 7, chance: 0.75, plan(g, x, z, r) {
    const y = Math.max(g.colH(x, z) + 1, SEA + 1);
    return { x, y, z, pieces: [piece(x - 6, y - 3, z - 6, x + 6, y + 8, z + 6, (W, R) => ruinedPortal(W, x, y, z, R, g.colH.bind(g)))] };
  } },
  { name: 'shipwreck', dim: 0, spacing: 24, sep: 4, radius: 12, plan(g, x, z, r) {
    if (!OCEANS.has(g.colB(x, z)) && g.colB(x, z) !== BIO.beach) return null; const y = g.colH(x, z) + 1; const ax = r() < 0.5;
    return { x, y, z, pieces: [piece(x - 10, y - 2, z - 10, x + 10, y + 10, z + 10, (W, R) => {
      const L = 14, Wd = 2, tilt = R.int(3) - 1;
      for (let k = -L / 2; k <= L / 2; k++) { const taper = Math.abs(k) > L / 2 - 2 ? 1 : 0; for (let w = -Wd + taper; w <= Wd - taper; w++) for (let h = 0; h < 4; h++) {
        const px = ax ? x + k : x + w, pz = ax ? z + w : z + k, py = y + h + (w === Wd ? tilt : 0); if (R() < 0.18) continue;
        const side = Math.abs(w) === Wd - taper, bottom = h === 0;
        if (bottom || side) W.set(px, py, pz, h === 3 ? BL.spruce_slab : bottom ? BL.spruce_planks : BL.oak_planks); else if (h === 2 && Math.abs(k) < 4) W.set(px, py, pz, BL.spruce_planks); else W.set(px, py, pz, py <= SEA ? BL.water : 0);
      } }
      for (let h = 1; h < 8; h++) if (R() < 0.85) W.set(x, y + h, z, BL.spruce_log);
      W.chest(ax ? x - 4 : x, y + 1, ax ? z : z - 4, 'shipwreck', R, 0); W.chest(ax ? x + 4 : x, y + 1, ax ? z : z + 4, 'shipwreck', R, 1);
    })] };
  } },
  { name: 'ocean_ruin', dim: 0, spacing: 20, sep: 4, radius: 6, plan(g, x, z, r) {
    if (!OCEANS.has(g.colB(x, z))) return null; const y = g.colH(x, z) + 1;
    return { x, y, z, pieces: [piece(x - 4, y - 1, z - 4, x + 4, y + 6, z + 4, (W, R) => {
      const warm = g.colB(x, z) === BIO.warm_ocean || g.colB(x, z) === BIO.lukewarm_ocean;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { W.set(x + dx, y - 1, z + dz, warm ? BL.sandstone : BL.stone_bricks); if (Math.abs(dx) === 3 || Math.abs(dz) === 3) { const hh = 1 + R.int(4); for (let h = 0; h < hh; h++) W.set(x + dx, y + h, z + dz, warm ? (R() < 0.3 ? BL.chiseled_sandstone : BL.cut_sandstone) : R() < 0.35 ? BL.mossy_stone_bricks : R() < 0.3 ? BL.cracked_stone_bricks : BL.stone_bricks); } }
      W.chest(x, y, z, 'ocean_ruin', R, 0); W.spawn('drowned', x + 1.5, y, z + 1.5);
    })] };
  } },
  { name: 'desert_well', dim: 0, spacing: 16, sep: 4, radius: 3, chance: 0.15, plan(g, x, z, r) {
    if (g.colB(x, z) !== BIO.desert) return null; const y = g.colH(x, z) + 1;
    return { x, y, z, pieces: [piece(x - 2, y - 3, z - 2, x + 2, y + 4, z + 2, (W) => {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { W.set(x + dx, y - 1, z + dz, BL.sandstone); W.set(x + dx, y - 2, z + dz, BL.sandstone); if (Math.abs(dx) === 2 || Math.abs(dz) === 2) W.set(x + dx, y, z + dz, BL.sandstone_slab); }
      W.set(x, y - 1, z, BL.water); W.set(x, y - 2, z, BL.water); for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) W.set(x + dx, y, z + dz, BL.sandstone);
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { W.set(x + dx, y + 1, z + dz, BL.sandstone); W.set(x + dx, y + 2, z + dz, BL.sandstone); }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y + 3, z + dz, BL.sandstone_slab); W.set(x, y + 3, z, BL.sandstone);
    })] };
  } },
  { name: 'fossil', dim: 0, spacing: 20, sep: 4, radius: 6, chance: 0.3, plan(g, x, z, r) {
    const b = g.colB(x, z); if (b !== BIO.desert && b !== BIO.swamp) return null; const y = g.colH(x, z) - 12 - r.int(10); const ax = r() < 0.5;
    return { x, y, z, pieces: [piece(x - 6, y - 1, z - 6, x + 6, y + 6, z + 6, (W, R) => {
      for (let k = -4; k <= 4; k += 2) { for (let a = 0; a <= Math.PI; a += 0.15) { const px = Math.round(Math.cos(a) * 3), py = Math.round(Math.sin(a) * 4); W.set(ax ? x + k : x + px, y + py, ax ? z + px : z + k, BL.bone_block); } }
      for (let k = -5; k <= 5; k++) W.set(ax ? x + k : x, y + 4, ax ? z : z + k, BL.bone_block);
    })] };
  } },
  { name: 'mineshaft', dim: 0, spacing: 14, sep: 2, radius: 46, chance: 0.4, plan(g, x, z, r) {
    const y = 18 + r.int(24); const pieces = [];
    pieces.push(piece(x - 3, y - 1, z - 3, x + 3, y + 4, z + 3, (W) => { for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { W.set(x + dx, y - 1, z + dz, BL.dirt); for (let h = 0; h < 4; h++) W.set(x + dx, y + h, z + dz, 0); } }));
    for (let d = 0; d < 4; d++) {
      if (r() < 0.25) continue; const [dx, dz] = DIR4[d], len = 20 + r.int(24);
      const x1 = x + dx * len, z1 = z + dz * len;
      pieces.push(piece(Math.min(x, x1) - 2, y - 1, Math.min(z, z1) - 2, Math.max(x, x1) + 2, y + 3, Math.max(z, z1) + 2, (W, R) => {
        for (let k = 3; k <= len; k++) {
          const cx = x + dx * k, cz = z + dz * k;
          for (let w = -1; w <= 1; w++) { const px = cx + (dz ? w : 0), pz = cz + (dx ? w : 0); for (let h = 0; h < 3; h++) W.set(px, y + h, pz, 0); if (W.get(px, y - 1, pz) === 0 || W.get(px, y - 1, pz) === BL.water || W.get(px, y - 1, pz) === BL.lava) W.set(px, y - 1, pz, BL.oak_planks); }
          if (R() < 0.75) W.set(cx, y, cz, BL.rail, dx ? 1 : 0);
          if (k % 4 === 0) { const ax = dz ? 1 : 0, az = dx ? 1 : 0; W.set(cx + ax, y, cz + az, BL.oak_fence); W.set(cx + ax, y + 1, cz + az, BL.oak_fence); W.set(cx - ax, y, cz - az, BL.oak_fence); W.set(cx - ax, y + 1, cz - az, BL.oak_fence); for (let w = -1; w <= 1; w++) W.set(cx + ax * w, y + 2, cz + az * w, BL.oak_planks); if (R() < 0.3) W.set(cx, y + 1, cz, BL.torch, 0); }
          if (R() < 0.06) W.set(cx + (dz ? (R() < 0.5 ? 1 : -1) : 0), y + 2, cz + (dx ? (R() < 0.5 ? 1 : -1) : 0), BL.cobweb);
          if (R() < 0.015) W.chest(cx + (dz ? 1 : 0), y, cz + (dx ? 1 : 0), 'mineshaft', R, 0);
          if (k === (len >> 1) && R() < 0.3) W.spawner(cx, y, cz, 'cave_spider');
        }
      }));
    }
    return { x, y, z, pieces };
  } },
  // ---- nether
  { name: 'nether_fortress', dim: 1, spacing: 22, sep: 4, radius: 64, plan(g, x, z, r) {
    const y = 64 + r.int(8), pieces = [];
    const room = (cx, cz, spawner, wart) => piece(cx - 6, y - 1, cz - 6, cx + 6, y + 8, cz + 6, (W, R) => {
      for (let yy = y - 1; yy <= y + 7; yy++) for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) { const e = Math.abs(dx) === 6 || Math.abs(dz) === 6 || yy === y - 1 || yy === y + 7; W.set(cx + dx, yy, cz + dz, e ? BL.nether_bricks : 0); }
      for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) for (let w = -2; w <= 2; w++) for (let h = 0; h < 4; h++) W.set(cx + dx + (dz ? w : 0), y + h, cz + dz + (dx ? w : 0), 0);
      for (let yy = 8; yy < y - 1; yy++) for (const [dx, dz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) W.soft(cx + dx, yy, cz + dz, BL.nether_bricks);
      if (spawner) { for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(cx + dx, y, cz + dz, BL.nether_bricks); W.spawner(cx, y + 1, cz, 'blaze'); for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { W.set(cx + dx, y, cz + dz, BL.nether_brick_fence); W.set(cx + dx, y + 1, cz + dz, BL.nether_brick_fence); } }
      if (wart) { for (let dz = -4; dz <= 4; dz++) for (const dx of [-4, -3, 3, 4]) { W.set(cx + dx, y - 1, cz + dz, BL.soul_sand); W.set(cx + dx, y, cz + dz, BL.nether_wart, R.int(4)); } W.chest(cx, y, cz - 4, 'fortress', R, 3); }
      W.set(cx + 5, y + 5, cz, BL.lantern, 1);
    });
    pieces.push(room(x, z, true, false));
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIR4[d], len = 26 + r.int(26), x1 = x + dx * len, z1 = z + dz * len;
      pieces.push(piece(Math.min(x, x1) - 3, 6, Math.min(z, z1) - 3, Math.max(x, x1) + 3, y + 6, Math.max(z, z1) + 3, (W, R) => {
        for (let k = 6; k <= len; k++) {
          const cx = x + dx * k, cz = z + dz * k, covered = k < 16 || (k > len - 8);
          for (let w = -2; w <= 2; w++) {
            const px = cx + (dz ? w : 0), pz = cz + (dx ? w : 0);
            W.set(px, y - 1, pz, BL.nether_bricks); W.set(px, y - 2, pz, Math.abs(w) < 2 ? BL.nether_bricks : 0);
            for (let h = 0; h < 5; h++) W.set(px, y + h, pz, 0);
            if (Math.abs(w) === 2) { W.set(px, y, pz, covered ? BL.nether_bricks : BL.nether_brick_fence); if (covered) { W.set(px, y + 1, pz, k % 3 === 0 ? BL.nether_brick_fence : BL.nether_bricks); W.set(px, y + 2, pz, BL.nether_bricks); } }
            if (covered) W.set(px, y + 3, pz, BL.nether_bricks);
          }
          if (k % 9 === 0) for (let yy = 8; yy < y - 2; yy++) for (let w = -1; w <= 1; w++) W.soft(cx + (dz ? w : 0), yy, cz + (dx ? w : 0), BL.nether_bricks);
          if (k === len - 10 && R() < 0.6) W.chest(cx + (dz ? 1 : 0), y, cz + (dx ? 1 : 0), 'fortress', R, 0);
        }
      }));
      if (d === 1) pieces.push(room(x1 + dx * 6, z1 + dz * 6, false, true));
      if (d === 2) pieces.push(room(x1 + dx * 6, z1 + dz * 6, true, false));
    }
    return { x, y, z, pieces, bbox: [x - 64, z - 64, x + 64, z + 64] };
  } },
  { name: 'bastion_remnant', dim: 1, spacing: 26, sep: 5, radius: 14, chance: 0.6, plan(g, x, z, r) {
    const y = 33;
    return { x, y, z, pieces: [piece(x - 12, 8, z - 12, x + 12, y + 22, z + 12, (W, R) => {
      const BB = () => R() < 0.15 ? BL.cracked_stone_bricks && BL.gilded_blackstone : R() < 0.5 ? BL.polished_blackstone_bricks : BL.blackstone;
      for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) { for (let yy = 10; yy < y; yy++) if (Math.abs(dx) > 7 || Math.abs(dz) > 7 || yy > y - 4) W.soft(x + dx, yy, z + dz, BL.blackstone); W.set(x + dx, y, z + dz, BL.polished_blackstone_bricks); }
      for (let yy = y + 1; yy < y + 16; yy++) for (let dz = -10; dz <= 10; dz++) for (let dx = -10; dx <= 10; dx++) {
        const e = Math.abs(dx) === 10 || Math.abs(dz) === 10, inner = Math.abs(dx) === 4 || Math.abs(dz) === 4;
        if (e && R() < 0.9 - (yy - y) * 0.03) W.set(x + dx, yy, z + dz, BB()); else if (!e) W.set(x + dx, yy, z + dz, (inner && Math.abs(dx) <= 4 && Math.abs(dz) <= 4 && yy < y + 10 && R() < 0.85) ? BB() : (yy === y + 6 && Math.abs(dx) < 10 && Math.abs(dz) < 10 && (Math.abs(dx) > 4 || Math.abs(dz) > 4)) ? BL.polished_blackstone : 0);
      }
      for (let k = 1; k < 4; k++) { W.set(x, y + k, z + 10, 0); W.set(x, y + k, z + 4, 0); W.set(x + 1, y + k, z + 10, 0); }
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y, z + dz, BL.gold_block);
      W.chest(x - 2, y + 1, z - 2, 'bastion', R, 0); W.chest(x + 6, y + 7, z + 6, 'bastion', R, 1); W.set(x + 2, y + 1, z + 2, BL.magma_block);
      for (let k = 0; k < 4; k++) W.spawn('piglin', x - 6 + k * 3 + 0.5, y + 1, z + 7.5); W.spawn('piglin_brute', x + 0.5, y + 1, z + 2.5); W.spawn('hoglin', x + 6.5, y + 1, z - 6.5);
    })] };
  } },
  { name: 'ruined_portal_nether', dim: 1, spacing: 25, sep: 6, radius: 7, chance: 0.5, plan(g, x, z, r) { const y = 33; return { x, y, z, pieces: [piece(x - 6, y - 3, z - 6, x + 6, y + 8, z + 6, (W, R) => { for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) W.set(x + dx, y - 1, z + dz, BL.blackstone); ruinedPortal(W, x, y, z, R, null); })] }; } },
  // ---- end
  { name: 'end_city', dim: 2, spacing: 20, sep: 6, radius: 14, plan(g, x, z, r) {
    if (x * x + z * z < 1000 * 1000) return null; const top = g.endTop(x, z); if (top < 0) return null; const y = top + 1, floors = 3 + r.int(4);
    return { x, y, z, pieces: [piece(x - 7, y - 8, z - 7, x + 7, y + floors * 6 + 10, z + 7, (W, R) => {
      for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) for (let yy = y - 6; yy < y; yy++) W.soft(x + dx, yy, z + dz, BL.end_stone);
      tower(W, x - 5, y, z - 5, 11, 6, BL.purpur_block, BL.purpur_pillar, BL.end_stone_bricks, 6);
      for (let f = 0; f < floors; f++) { const yb = y + 6 + f * 6; tower(W, x - 3, yb, z - 3, 7, 6, BL.purpur_block, BL.purpur_pillar, BL.end_stone_bricks, 6); for (const [dx, dz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) { W.set(x + dx, yb + 2, z + dz, BL.magenta_stained_glass); W.set(x + dx, yb + 3, z + dz, BL.magenta_stained_glass); } }
      for (let yy = y; yy < y + 6 + floors * 6; yy++) { W.set(x + 2, yy, z + 2, BL.ladder, 0); if (yy % 6 === (y % 6)) W.set(x + 2, yy, z + 2, BL.ladder, 0); }
      for (let k = 1; k < 4; k++) { W.set(x, y + k, z - 5, 0); }
      const ty = y + 6 + floors * 6; for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { W.set(x + dx, ty, z + dz, BL.purpur_block); if (Math.abs(dx) === 4 || Math.abs(dz) === 4) W.set(x + dx, ty + 1, z + dz, BL.purpur_slab); }
      for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) W.set(x + dx, ty + 2, z + dz, BL.end_rod);
      W.set(x + 2, ty, z + 2, BL.ladder, 0);
      W.chest(x - 2, ty + 1, z - 2, 'end_city', R, 0); W.chest(x + 2, ty + 1, z - 2, 'end_city', R, 0);
      W.tile(x - 2, ty + 1, z - 2, { type: 'chest', items: (() => { const it = makeLoot('end_city', R); it[13] = { id: IT.elytra, count: 1 }; return it; })() });
      for (let f = 0; f < floors; f += 2) W.spawn('shulker', x + 0.5, y + 7 + f * 6, z - 1.5);
      W.spawn('shulker', x + 0.5, ty + 1, z + 1.5);
    })] };
  } }
];
function ruinedPortal(W, x, y, z, R, colH) {
  for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = R() * 5; const px = Math.round(x + Math.cos(a) * d), pz = Math.round(z + Math.sin(a) * d); const py = colH ? colH(px, pz) : y - 1; W.set(px, py, pz, R() < 0.12 ? BL.magma_block : R() < 0.5 ? BL.netherrack : BL.blackstone); if (R() < 0.08) W.set(px, py + 1, pz, BL.fire); }
  const ax = R() < 0.5;
  for (let i = -2; i <= 1; i++) for (let j = 0; j < 5; j++) {
    const edge = i === -2 || i === 1 || j === 0 || j === 4; const px = ax ? x + i : x, pz = ax ? z : z + i;
    if (edge) { if (R() < 0.72) W.set(px, y + j, pz, R() < 0.18 ? BL.crying_obsidian : BL.obsidian); } else W.set(px, y + j, pz, 0);
  }
  if (R() < 0.7) W.set(x + 2, y, z + 2, BL.gold_block);
  W.chest(x + (ax ? 0 : 2), y, z + (ax ? 2 : 0), 'ruined_portal', R, 0);
}
function strongholdPiece(sh) {
  const [x, y, z] = sh;
  return piece(x - 30, y - 4, z - 30, x + 30, y + 10, z + 30, (W, R) => {
    const SB = () => { const q = R(); return q < 0.2 ? BL.mossy_stone_bricks : q < 0.35 ? BL.cracked_stone_bricks : q < 0.37 ? BL.infested_stone : BL.stone_bricks; };
    // portal room 11 x 16
    for (let yy = y - 1; yy <= y + 7; yy++) for (let dz = -8; dz <= 8; dz++) for (let dx = -5; dx <= 5; dx++) { const e = Math.abs(dx) === 5 || Math.abs(dz) === 8 || yy === y - 1 || yy === y + 7; W.set(x + dx, yy, z + dz, e ? SB() : 0); }
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { W.set(x + dx, y, z + dz + 3, Math.abs(dx) === 2 || Math.abs(dz) === 2 ? BL.stone_bricks : BL.lava); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y, z + dz + 3, BL.lava);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y + 1, z + dz + 3, 0);
    const F = BL.end_portal_frame;
    for (let k = -1; k <= 1; k++) { W.set(x + k, y + 1, z + 1, F, 2 | (R() < 0.1 ? 4 : 0)); W.set(x + k, y + 1, z + 5, F, 3 | (R() < 0.1 ? 4 : 0)); W.set(x - 2, y + 1, z + 3 + k, F, 0 | (R() < 0.1 ? 4 : 0)); W.set(x + 2, y + 1, z + 3 + k, F, 1 | (R() < 0.1 ? 4 : 0)); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.set(x + dx, y + 1, z + dz + 3, 0);
    for (let k = 0; k < 3; k++) W.set(x + k - 1, y + 1, z - 2, BL.stone_brick_stairs, 2);
    W.spawner(x, y + 1, z - 5, 'silverfish');
    for (const dz of [-6, 0, 6]) { W.set(x - 5, y + 3, z + dz, BL.iron_bars); W.set(x + 5, y + 3, z + dz, BL.iron_bars); W.set(x - 4, y + 4, z + dz, BL.torch, 2); W.set(x + 4, y + 4, z + dz, BL.torch, 1); }
    // corridors
    for (let d = 0; d < 4; d++) {
      const [dx, dz] = DIR4[d];
      for (let k = (dx ? 6 : 9); k < 28; k++) {
        const cx = x + dx * k, cz = z + dz * k;
        for (let w = -2; w <= 2; w++) for (let h = -1; h <= 4; h++) { const px = cx + (dz ? w : 0), pz = cz + (dx ? w : 0); const e = Math.abs(w) === 2 || h === -1 || h === 4; W.set(px, y + h, pz, e ? SB() : 0); }
        if (k % 7 === 0) W.set(cx + (dz ? 1 : 0), y + 2, cz + (dx ? 1 : 0), BL.torch, 0);
      }
      const ex = x + dx * 28, ez = z + dz * 28;
      for (let yy = y - 1; yy <= y + 6; yy++) for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) { const e = Math.abs(a) === 4 || Math.abs(b) === 4 || yy === y - 1 || yy === y + 6; W.set(ex + a, yy, ez + b, e ? SB() : (d === 0 && (Math.abs(a) === 3 || Math.abs(b) === 3) && yy < y + 4 ? BL.bookshelf : 0)); }
      W.chest(ex, y, ez, 'stronghold', R, d);
    }
    for (let k = 0; k < 2; k++) W.set(x, y + k, z - 8, 0);
  });
}
// ---- Nether & End terrain
WorldGen.prototype.netherBiome = function (x, z) {
  const a = this.nN.fbm2(x / 320, z / 320, 2), b = this.nN2.fbm2(x / 320, z / 320, 2);
  if (a > 0.32) return BIO.crimson_forest; if (a < -0.32) return BIO.warped_forest; if (b > 0.3) return BIO.soul_sand_valley; if (b < -0.35) return BIO.basalt_deltas; return BIO.nether_wastes;
};
WorldGen.prototype.genNether = function (ch) {
  const X0 = ch.cx * 16, Z0 = ch.cz * 16, NH = 128, blocks = ch.blocks, meta = ch.meta, rng = RNG(ihash(ch.cx, ch.cz, 91, this.seed));
  const GX = 5, GY = NH / 4 + 1, GZ = 5, G = new Float32Array(GX * GY * GZ);
  for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GZ; gz++) for (let gx = 0; gx < GX; gx++) {
    const wx = X0 + gx * 4, wy = gy * 4, wz = Z0 + gz * 4;
    let d = this.nN.fbm3(wx / 85, wy / 42, wz / 85, 3) * 1.15 + this.nN2.n3(wx / 30, wy / 22, wz / 30) * 0.18;
    d += wy < 36 ? (36 - wy) * 0.045 : 0; d += wy > 92 ? (wy - 92) * 0.05 : 0; d -= 0.08;
    G[(gy * GZ + gz) * GX + gx] = d;
  }
  const tri = (x, y, z) => { const gx = x >> 2, gy = y >> 2, gz = z >> 2, fx = (x & 3) / 4, fy = (y & 3) / 4, fz = (z & 3) / 4, i = (gy * GZ + gz) * GX + gx; const a = G[i] + (G[i + 1] - G[i]) * fx, b = G[i + GX] + (G[i + GX + 1] - G[i + GX]) * fx, c = G[i + GZ * GX] + (G[i + GZ * GX + 1] - G[i + GZ * GX]) * fx, d = G[i + GZ * GX + GX] + (G[i + GZ * GX + GX + 1] - G[i + GZ * GX + GX]) * fx; const e = a + (b - a) * fz, f = c + (d - c) * fz; return e + (f - e) * fy; };
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = X0 + x, wz = Z0 + z, bi = this.netherBiome(wx, wz); ch.biomes[(z << 4) | x] = bi;
    const bf = 1 + (rhash(wx, wz, 1, this.seed) * 4 | 0), bc = NH - 2 - (rhash(wx, wz, 2, this.seed) * 4 | 0);
    for (let y = 0; y < NH; y++) {
      let id;
      if (y <= bf || y >= bc) id = BL.bedrock;
      else if (tri(x, y, z) > 0) id = bi === BIO.basalt_deltas ? (this.nN2.n3(wx / 9, y / 9, wz / 9) > 0.2 ? BL.basalt : BL.blackstone) : bi === BIO.soul_sand_valley && y < 50 && this.nN2.n3(wx / 14, y / 10, wz / 14) > 0.3 ? BL.soul_soil : BL.netherrack;
      else id = y <= 31 ? BL.lava : 0;
      blocks[(y << 8) | (z << 4) | x] = id;
    }
  }
  // surfaces
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const bi = ch.biomes[(z << 4) | x], wx = X0 + x, wz = Z0 + z;
    for (let y = 2; y < NH - 3; y++) {
      const i = (y << 8) | (z << 4) | x, b = blocks[i], up = blocks[i + 256];
      if (b !== 0 && b !== BL.lava && b !== BL.bedrock && up === 0) {
        const r = rng();
        if (bi === BIO.crimson_forest) { blocks[i] = BL.crimson_nylium; if (r < 0.12) blocks[i + 256] = r < 0.02 ? BL.crimson_fungus : BL.crimson_roots; }
        else if (bi === BIO.warped_forest) { blocks[i] = BL.warped_nylium; if (r < 0.15) blocks[i + 256] = r < 0.02 ? BL.warped_fungus : r < 0.08 ? BL.warped_roots : BL.nether_sprouts; else if (r < 0.17) { const len = 1 + rng.int(6); for (let k = 1; k <= len && y + k < NH - 4; k++) if (blocks[i + k * 256] === 0) blocks[i + k * 256] = BL.twisting_vines; } }
        else if (bi === BIO.soul_sand_valley) { blocks[i] = r < 0.55 ? BL.soul_sand : BL.soul_soil; if (r < 0.01) blocks[i + 256] = BL.soul_fire; }
        else if (bi === BIO.basalt_deltas) { if (r < 0.06) blocks[i] = BL.magma_block; else if (r < 0.1 && x > 0 && x < 15 && z > 0 && z < 15) blocks[i] = BL.lava; }
        else { if (y >= 29 && y <= 34 && r < 0.5) blocks[i] = r < 0.25 ? BL.gravel : BL.soul_sand; else if (r < 0.006) blocks[i + 256] = BL.fire; else if (r < 0.014) blocks[i + 256] = r < 0.01 ? BL.brown_mushroom : BL.red_mushroom; }
      }
      if (b !== 0 && b !== BL.lava && blocks[i - 256] === 0 && y < NH - 3) {
        if (bi === BIO.crimson_forest && rng() < 0.04) { const len = 1 + rng.int(5); for (let k = 1; k <= len; k++) if (blocks[i - k * 256] === 0) blocks[i - k * 256] = BL.weeping_vines; }
      }
    }
  }
  // glowstone clusters
  for (let k = 0; k < 2; k++) { if (rng() > 0.6) continue; const x = 3 + rng.int(10), z = 3 + rng.int(10); for (let y = NH - 6; y > 40; y--) { const i = (y << 8) | (z << 4) | x; if (blocks[i] === 0 && blocks[i + 256] === BL.netherrack) { for (let n = 0; n < 40; n++) { const px = clamp(x + rng.int(5) - 2, 0, 15), pz = clamp(z + rng.int(5) - 2, 0, 15), py = y - rng.int(5); const j = (py << 8) | (pz << 4) | px; if (blocks[j] === 0) blocks[j] = BL.glowstone; } break; } } }
  // ores
  const vein = (ore, n, y0, y1, size, onlyIn = BL.netherrack) => { for (let k = 0; k < n; k++) { let x = rng.int(16), y = y0 + rng.int(y1 - y0), z = rng.int(16); for (let s = 0; s < size; s++) { if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < NH) { const i = (y << 8) | (z << 4) | x; if (blocks[i] === onlyIn) blocks[i] = ore; } const r = rng.int(6); if (r === 0) x++; else if (r === 1) x--; else if (r === 2) z++; else if (r === 3) z--; else if (r === 4) y++; else y--; } } };
  vein(BL.nether_quartz_ore, 14, 10, 117, 10); vein(BL.nether_gold_ore, 9, 10, 117, 8); vein(BL.magma_block, 4, 26, 37, 18); if (rng() < 0.4) vein(BL.ancient_debris, 1, 8, 24, 2);
  vein(BL.gravel, 2, 5, 40, 20); vein(BL.blackstone, 2, 5, 40, 16);
  // fungus trees & basalt pillars fully inside chunk
  const W = new Writer(ch);
  for (let k = 0; k < 6; k++) {
    const x = 3 + rng.int(10), z = 3 + rng.int(10); let y = 33; while (y < NH - 20 && !(blocks[((y) << 8) | (z << 4) | x] !== 0 && blocks[((y + 1) << 8) | (z << 4) | x] === 0)) y++;
    if (y >= NH - 20) continue; const top = blocks[(y << 8) | (z << 4) | x], bi = ch.biomes[(z << 4) | x];
    if (top === BL.crimson_nylium && rng() < 0.7) growTree(W, 'crimson_fungus', X0 + x, y + 1, Z0 + z, rng, bi);
    else if (top === BL.warped_nylium && rng() < 0.7) growTree(W, 'warped_fungus', X0 + x, y + 1, Z0 + z, rng, bi);
    else if (bi === BIO.soul_sand_valley && rng() < 0.25) { for (let yy = y + 1; yy < NH - 3 && blocks[(yy << 8) | (z << 4) | x] === 0; yy++) blocks[(yy << 8) | (z << 4) | x] = BL.basalt; }
    else if (bi === BIO.soul_sand_valley && rng() < 0.08) { for (let a = 0; a <= Math.PI; a += 0.2) W.set(X0 + x + Math.round(Math.cos(a) * 3), y + Math.round(Math.sin(a) * 4), Z0 + z, BL.bone_block); }
    else if (bi === BIO.basalt_deltas && rng() < 0.4) { const hh = 2 + rng.int(6); for (let yy = y + 1; yy < y + hh; yy++) for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) W.set(X0 + x + dx, yy, Z0 + z + dz, BL.basalt); }
  }
  this.structures(ch, null);
};
WorldGen.prototype.endTop = function (x, z) {
  const d = Math.hypot(x, z);
  if (d < 150) { const R = 80 + this.nEnd.n2(Math.atan2(z, x) * 3, 0) * 10; if (d > R) return -1; return Math.round(62 + this.nEnd.n2(x / 40, z / 40) * 3 - (d / R) ** 2 * 6); }
  if (d < 950) { const cx = Math.floor(x / 96), cz = Math.floor(z / 96); if (rhash(cx, cz, 5, this.seed) > 0.2) return -1; const ix = cx * 96 + 20 + rhash(cx, cz, 6, this.seed) * 56, iz = cz * 96 + 20 + rhash(cx, cz, 7, this.seed) * 56; const r = 5 + rhash(cx, cz, 8, this.seed) * 7; const dd = Math.hypot(x - ix, z - iz); return dd < r ? Math.round(55 + rhash(cx, cz, 9, this.seed) * 20 - dd * 0.3) : -1; }
  const v = this.nEnd.fbm2(x / 220, z / 220, 3) + this.nEnd.n2(x / 40, z / 40) * 0.12; if (v < 0.22) return -1;
  return Math.round(56 + (v - 0.22) * 40);
};
WorldGen.prototype.endBottom = function (x, z, top) { const d = Math.hypot(x, z); if (d < 150) { const R = 80 + this.nEnd.n2(Math.atan2(z, x) * 3, 0) * 10; return Math.round(top - 6 - Math.sqrt(Math.max(0, 1 - d / R)) * 44 - this.nEnd.n2(x / 15, z / 15) * 3); } if (d < 950) return top - 6 - (rhash(Math.floor(x / 96), Math.floor(z / 96), 4, this.seed) * 8 | 0); const v = this.nEnd.fbm2(x / 220, z / 220, 3); return Math.round(top - 4 - Math.max(0, v - 0.22) * 90); };
WorldGen.prototype.genEnd = function (ch) {
  const X0 = ch.cx * 16, Z0 = ch.cz * 16, blocks = ch.blocks, rng = RNG(ihash(ch.cx, ch.cz, 93, this.seed)), W = new Writer(ch);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const wx = X0 + x, wz = Z0 + z, top = this.endTop(wx, wz); const d = Math.hypot(wx, wz);
    ch.biomes[(z << 4) | x] = d < 150 ? BIO.the_end : d < 950 ? BIO.small_end_islands : BIO.end_highlands;
    if (top < 0) continue; const bot = this.endBottom(wx, wz, top);
    for (let y = Math.max(1, bot); y <= top; y++) blocks[(y << 8) | (z << 4) | x] = BL.end_stone;
    if (d > 950 && rng() < 0.003 && x > 2 && x < 13 && z > 2 && z < 13) growChorus(W, wx, top + 1, wz, rng);
  }
  // obsidian pillars
  if (Math.abs(ch.cx) < 6 && Math.abs(ch.cz) < 6) {
    for (const p of END_PILLARS) {
      if (p.x + p.r < X0 || p.x - p.r > X0 + 15 || p.z + p.r < Z0 || p.z - p.r > Z0 + 15) continue;
      for (let y = 40; y <= p.h; y++) for (let dz = -p.r; dz <= p.r; dz++) for (let dx = -p.r; dx <= p.r; dx++) if (dx * dx + dz * dz <= p.r * p.r + 1) W.set(p.x + dx, y, p.z + dz, BL.obsidian);
      W.set(p.x, p.h + 1, p.z, BL.bedrock);
      if (p.cage) for (let y = p.h + 1; y <= p.h + 4; y++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || y === p.h + 4) W.set(p.x + dx, y, p.z + dz, BL.iron_bars);
      W.spawn('end_crystal', p.x + 0.5, p.h + 2, p.z + 0.5);
    }
    // exit portal fountain
    const ey = END_PORTAL_Y;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { const d = Math.hypot(dx, dz); if (d <= 3.6) { W.set(dx, ey - 1, dz, BL.bedrock); if (d > 2.6) W.set(dx, ey, dz, BL.bedrock); else W.set(dx, ey, dz, 0); } }
    for (let y = ey; y < ey + 4; y++) W.set(0, y, 0, BL.bedrock);
    for (const [dx, dz, m] of [[1, 0, 2], [-1, 0, 1], [0, 1, 4], [0, -1, 3]]) W.set(dx, ey + 2, dz, BL.torch, m);
  }
  this.structures(ch, null);
};
const END_PORTAL_Y = 63;
const END_PILLARS = []; for (let i = 0; i < 10; i++) { const a = i * Math.PI * 2 / 10; END_PILLARS.push({ x: Math.round(Math.cos(a) * 42), z: Math.round(Math.sin(a) * 42), r: 2 + (i * 7 % 4), h: 76 + ((i * 3) % 10) * 3, cage: i === 2 || i === 7 }); }
function growChorus(W, x, y, z, r, depth = 0) {
  const h = 2 + r.int(4); for (let i = 0; i < h; i++) W.set(x, y + i, z, BL.chorus_plant);
  if (depth < 3) for (const [dx, dz] of DIR4) if (r() < 0.45) { W.set(x + dx, y + h - 1, z + dz, BL.chorus_plant); growChorus(W, x + dx, y + h, z + dz, r, depth + 1); }
  W.set(x, y + h, z, BL.chorus_flower);
}

// ---------------------------------------------------------------------
