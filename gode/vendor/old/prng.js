/* gode/vendor/old/prng.js —— 宿主 B 的随机数与噪声，逐行抽自 index.html:358–503（V-7 抽副本；宿主 B 本身不改）。
   改动只有：加 export、去掉游戏用的全局 rng。与宿主 B 的一致性靠 old 生成器的区块哈希对拍（s13 V-7）。 */
export const CHUNK_W = 16, CHUNK_H = 128, SEA_LEVEL = 62;
export function bidx(x, y, z) { return (x << 11) | (z << 7) | y; }
export const DIRS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const floor = Math.floor;
export function hexToRgb(hex) { const n = parseInt(hex.replace('#',''), 16); return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255]; }

// ---- Seeded PRNG (mulberry32) ----------------------------------------------
export function hashString(str) {
  // cyrb53-ish 32-bit hash so string seeds map to integers
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}
export class Rand {
  constructor(seed) { this.s = (typeof seed === 'string' ? hashString(seed) : (seed | 0)) >>> 0; if (this.s === 0) this.s = 0x9e3779b9; }
  next() { // [0,1)
    let t = (this.s += 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return floor(this.next() * n); }                  // 0..n-1
  range(a, b) { return a + this.next() * (b - a); }
  irange(a, b) { return a + this.int(b - a + 1); }           // inclusive
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[this.int(arr.length)]; }
}

// ---- Simplex noise (2D + 3D), seeded --------------------------------------
export class Noise {
  constructor(seed) {
    const r = new Rand(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = r.int(i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.permMod12[i] = this.perm[i] % 12; }
  }
  static grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  noise2(xin, yin) {
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    const perm = this.perm, pm = this.permMod12, g = Noise.grad3;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = floor(xin + s), j = floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1, j1; if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const gi = pm[ii + perm[jj]]; t0 *= t0; n0 = t0 * t0 * (g[gi][0] * x0 + g[gi][1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const gi = pm[ii + i1 + perm[jj + j1]]; t1 *= t1; n1 = t1 * t1 * (g[gi][0] * x1 + g[gi][1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const gi = pm[ii + 1 + perm[jj + 1]]; t2 *= t2; n2 = t2 * t2 * (g[gi][0] * x2 + g[gi][1] * y2); }
    return 70 * (n0 + n1 + n2); // roughly [-1, 1]
  }
  noise3(xin, yin, zin) {
    const F3 = 1 / 3, G3 = 1 / 6;
    const perm = this.perm, pm = this.permMod12, g = Noise.grad3;
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;
    const s = (xin + yin + zin) * F3;
    const i = floor(xin + s), j = floor(yin + s), k = floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) { const gi = pm[ii + perm[jj + perm[kk]]]; t0 *= t0; n0 = t0 * t0 * (g[gi][0] * x0 + g[gi][1] * y0 + g[gi][2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) { const gi = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]]; t1 *= t1; n1 = t1 * t1 * (g[gi][0] * x1 + g[gi][1] * y1 + g[gi][2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) { const gi = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]]; t2 *= t2; n2 = t2 * t2 * (g[gi][0] * x2 + g[gi][1] * y2 + g[gi][2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) { const gi = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]]; t3 *= t3; n3 = t3 * t3 * (g[gi][0] * x3 + g[gi][1] * y3 + g[gi][2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  }
  // Fractal Brownian motion helpers
  fbm2(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * this.noise2(x * freq, y * freq); norm += amp; amp *= gain; freq *= lacunarity; }
    return sum / norm;
  }
  fbm3(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += amp * this.noise3(x * freq, y * freq, z * freq); norm += amp; amp *= gain; freq *= lacunarity; }
    return sum / norm;
  }
  // Ridged noise: sharp mountain ridges
  ridge2(x, y, octaves = 4) {
    let sum = 0, amp = 0.5, freq = 1, prev = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise2(x * freq, y * freq)); n *= n; sum += n * amp * prev; prev = n; freq *= 2; amp *= 0.5;
    }
    return sum;
  }
}
