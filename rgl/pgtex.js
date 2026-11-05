// rgl/pgtex.js —— 贴图补强：goodPG（EijunnN VoxelCraft）的草顶 / 雪 / 冰 / 浮冰生成器，连同它每个纹素自带的 高度 / 光滑度 / F0 / 散射 通道。
// 来源：goodPG/src/client/textures/{texCore,genSoil,genBiomes}.ts（经验见 goodPG/study-gl.md §1–3、§6）。
// 与 goodGL 的差别：goodGL 的 PBR.build 是从 albedo 反推（亮度 → 高度 / 光滑度），goodPG 是**先画高度和材质通道，再由高度求法线**，所以草叶、雪晶、冰裂纹都是画出来的，不是猜出来的。
// 用法：rgl/index.js 的 loadTextures：pgOverride(tx) 覆盖 albedo → 资源包覆盖 → PBR.build → pgApplyMaps(pbr, tx, own) 覆盖法线 / 光谱通道（资源包换过的层不覆盖）
//   → rgl/texpack.js finishSet：包自带 _n / _s 的层再被包覆盖（草顶 keep 也一样），spec.A 的 POM 深度挪进 pomTab。
// 输出布局 = goodGL（vendor/gl/pbr.js 头注释）：nrm = RG 法线（G = 图向下，DirectX 约定）· B 腔体 AO · A 高度（255 = 不做 POM）；spec = R 光滑度 · G F0 · B 孔隙 / 散射（≥65 为散射）· A POM 深度（0..255 → 0..0.25 格；rgl/texpack.js 再挪进 pomTab）。
import { SH } from '../vendor/gl/shared.js';

const S = 16, N = 256;
const lerp = (a, b, t) => a + (b - a) * t, mod = (v, m) => ((v % m) + m) % m;
const wrap = v => mod(v, S), idx = (x, y) => wrap(y) * S + wrap(x);
const gray = v => [v, v, v], mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
class Rng {
  constructor(seed) { this.s = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0; }
  next() { this.s = (this.s + 0x6d2b79f5) | 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  range(a, b) { return a + (b - a) * this.next(); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
}

/** 周期 16 的值噪声：cx × cy 个格点（平铺无缝） */
class Noise {
  constructor(rng, cx, cy = cx) { this.cx = cx; this.cy = cy; this.g = new Float32Array(cx * cy); for (let i = 0; i < this.g.length; i++) this.g[i] = rng.next(); }
  at(x, y) {
    const { cx, cy, g } = this, fx = (x + 0.5) * cx / S, fy = (y + 0.5) * cy / S, x0 = Math.floor(fx), y0 = Math.floor(fy);
    let tx = fx - x0, ty = fy - y0; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const xa = mod(x0, cx), xb = mod(x0 + 1, cx), ya = mod(y0, cy) * cx, yb = mod(y0 + 1, cy) * cx;
    const top = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx, bot = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx;
    return top + (bot - top) * ty;
  }
}
const pixelNoise = rng => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = rng.next(); return o; };
const field = fn => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = fn(i & 15, i >> 4, i); return o; };

/** 按名次分档：weights 决定每档占的像素比例（调色板分布精确，结果是成团的像素块）。mask 非零的才参与，其余 → 0 */
function rankLevels(values, weights, mask) {
  const order = []; for (let i = 0; i < values.length; i++) if (!mask || mask[i]) order.push(i);
  order.sort((a, b) => values[a] - values[b] || a - b);
  let total = 0; for (const w of weights) total += w;
  const out = new Uint8Array(values.length), n = order.length; let level = 0, limit = weights[0] / total * n;
  for (let r = 0; r < n; r++) { while (r >= limit - 1e-6 && level < weights.length - 1) { level++; limit += weights[level] / total * n; } out[order[r]] = level; }
  return out;
}

/** 一层贴图的画布（浮点）：col 0..255 · alpha · height（相对，烘焙时归一化到最高点 = 1）· smooth / f0 / sss（0..255） */
class Tex {
  constructor(name) {
    this.name = name; this.col = new Float32Array(N * 3); this.alpha = new Float32Array(N).fill(255); this.height = new Float32Array(N).fill(1);
    this.smooth = new Float32Array(N).fill(60); this.f0 = new Float32Array(N).fill(10); this.sss = new Float32Array(N);
    this.depth = 1;   // 法线陡度：Δ高度 / 像素 × depth
  }
  rng(sub = '') { return new Rng(this.name + '/' + sub); }
  setI(i, c) { this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2]; }
  getI(i) { return [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]]; }
}

// ---------------------------------------------------------------- 生成器（goodPG genSoil.ts / genBiomes.ts，逐行对应）

const GRASS_G = [116, 136, 154, 172, 192, 212];
function grassTop(t) {
  const r = t.rng(), n4 = new Noise(r, 4), n8 = new Noise(r, 8), px = pixelNoise(r);
  const lv = rankLevels(field((x, y, i) => 0.42 * n4.at(x, y) + 0.33 * n8.at(x, y) + 0.25 * px[i]), [6, 14, 24, 26, 18, 12]);
  for (let i = 0; i < N; i++) { t.setI(i, gray(GRASS_G[lv[i]])); t.height[i] = 0.6 + 0.3 * (lv[i] / 5); t.smooth[i] = 38 + 3 * lv[i]; t.sss[i] = 30; }
  const dirs = [[0, 1], [1, 1], [-1, 1], [1, 0]];   // 亮草叶：2 px 短笔画，高度 1（POM 里最高）；暗斑高度 0.45（最低）
  for (let k = 0; k < 22; k++) {
    let x = r.int(0, 15), y = r.int(0, 15); const [dx, dy] = r.pick(dirs), g = r.range(204, 226);
    for (let s = 0; s < 2; s++) { const i = idx(x, y); t.setI(i, gray(g - s * 10)); t.height[i] = 1; t.smooth[i] = 55; t.sss[i] = 40; x += dx; y += dy; }
  }
  for (let k = 0; k < 16; k++) { const i = idx(r.int(0, 15), r.int(0, 15)); t.setI(i, gray(r.range(112, 122))); t.height[i] = 0.45; }
  t.depth = 1.0;
}

const SNOW = [[210, 220, 235], [224, 232, 243], [236, 241, 248], [244, 247, 252], [250, 252, 254]];
function snow(t) {
  const r = t.rng(), n2 = new Noise(r, 2), n4 = new Noise(r, 4), n8 = new Noise(r, 8), m4 = new Noise(r, 4), px = pixelNoise(r);
  const pit = rankLevels(field((x, y, i) => 0.7 * m4.at(x, y) + 0.3 * px[(i * 53 + 11) & 255]), [16, 84]);   // 独立坑洼场：0 = 成团的小凹坑
  const lv = rankLevels(field((x, y, i) => 0.3 * n2.at(x, y) + 0.35 * n4.at(x, y) + 0.2 * n8.at(x, y) + 0.15 * px[i] - (pit[i] ? 0 : 0.35)), [8, 18, 34, 28, 12]);
  for (let i = 0; i < N; i++) { const d = pit[i] ? 0 : 1; t.setI(i, SNOW[lv[i]]); t.height[i] = 0.68 + 0.07 * lv[i] - 0.22 * d; t.smooth[i] = 62 + 6 * lv[i] - 18 * d; t.sss[i] = 110 + 8 * lv[i]; }
  for (let k = 0; k < 14; k++) { const i = idx(r.int(0, 15), r.int(0, 15)); if (!pit[i]) continue; const b = k < 5; t.setI(i, b ? [254, 255, 255] : [248, 251, 254]); t.smooth[i] = b ? 200 : 140; t.height[i] += 0.04; }   // 冰晶亮点：5 颗主亮 + 若干次亮，只落在坑外隆起处
  t.depth = 1.0;
}
const ICE = [[128, 168, 220], [142, 182, 230], [156, 195, 237], [172, 207, 242]], ICE_A = [184, 174, 166, 160];
function ice(t) {
  const r = t.rng(), n4 = new Noise(r, 4), n8 = new Noise(r, 8);
  const lv = rankLevels(field((x, y) => 0.6 * n4.at(x, y) + 0.4 * n8.at(x, y)), [15, 35, 35, 15]);
  for (let i = 0; i < N; i++) { t.setI(i, ICE[lv[i]]); t.alpha[i] = ICE_A[lv[i]]; t.height[i] = 1; t.smooth[i] = 230; }
  t.f0.fill(5); t.sss.fill(80);
  for (let k = 0; k < 3; k++) {   // 斜向亮纹
    let x = r.int(0, 15), y = r.int(0, 15); const len = r.int(4, 7);
    for (let s = 0; s < len; s++) { const i = idx(x, y); t.setI(i, mix([192, 220, 246], [206, 229, 249], s / len)); t.alpha[i] = 186; t.smooth[i] = 236; x += 1; y -= 1; }
  }
  const crack = (x, y, len, sx) => {   // 裂纹：下凹（高度 0.72）、变粗糙
    for (let s = 0; s < len; s++) {
      const i = idx(x, y); t.setI(i, [214, 234, 252]); t.alpha[i] = 200; t.height[i] = 0.72; t.smooth[i] = 150;
      const m = r.next(); if (m < 0.5) { x += sx; y += 1; } else if (m < 0.8) y += 1; else x += sx;
    }
  };
  crack(3, 2, 7, 1); crack(6, 6, 3, -1); crack(12, 9, 6, -1);
  t.depth = 0.8;
}
function packedIce(t) {
  ice(t); t.alpha.fill(255);
  for (let i = 0; i < N; i++) t.setI(i, mix(t.getI(i), [120, 160, 226], 0.35));
  t.sss.fill(40);
}

const luma = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** goodGL 贴图名 → { gen, keep（装包也保留 goodPG 的材质通道）, under（包叠在蓝色半透底上）, tint, cut, pom }：tint = 烘焙成灰度（宿主按群系染色）；pom = 视差深度（格；goodGL spec.A 用 0.25 格满量程）；por = 没有散射时的孔隙度（雨天湿润） */
const DEFS = {
  grass_top: { gen: grassTop, keep: true, tint: true, pom: 0.07, alpha0: true },   // alpha = 0 = 整张都染（goodGL tintMode 2 的约定）
  snow: { gen: snow, pom: 0.08 },
  ice: { gen: ice, under: true },   // under：蓝色半透底，资源包的贴图叠在上面（pgUnder）
  packed_ice: { gen: packedIce, under: true },
};
const PG_NAMES = Object.keys(DEFS);
export const pgIsUnder = l => !!(DEFS[SH.TEX_NAMES[l]] && DEFS[SH.TEX_NAMES[l]].under);   // rgl/texpack.js underHD：HD 包也要叠在蓝色半透底上

const q = v => v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);

/** 透明纹素的颜色 / 光谱通道用邻域不透明纹素膨胀（mip 不出黑边）；goodPG texCore.bleed */
function bleed(t) {
  const known = new Uint8Array(N); let any = false; for (let i = 0; i < N; i++) if (t.alpha[i] > 0) { known[i] = 1; any = true; }
  if (!any) return;
  for (let pass = 0; pass < S; pass++) {
    const next = known.slice(); let changed = false;
    for (let i = 0; i < N; i++) {
      if (known[i]) continue; let n = 0, r = 0, g = 0, b = 0, sm = 0, f0 = 0, ss = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue; const j = idx((i & 15) + ox, (i >> 4) + oy); if (!known[j]) continue;
        n++; r += t.col[j * 3]; g += t.col[j * 3 + 1]; b += t.col[j * 3 + 2]; sm += t.smooth[j]; f0 += t.f0[j]; ss += t.sss[j];
      }
      if (!n) continue; t.setI(i, [r / n, g / n, b / n]); t.smooth[i] = sm / n; t.f0[i] = f0 / n; t.sss[i] = ss / n; next[i] = 1; changed = true;
    }
    known.set(next); if (!changed) break;
  }
}

/** 烘焙一层：返回 goodGL 布局的 { img, n, s }（各 1024 字节） */
function bake(name, def) {
  const t = new Tex(name); def.gen(t);
  if (def.cut) for (let i = 0; i < N; i++) t.alpha[i] = t.alpha[i] >= 128 ? 255 : 0;
  if (def.cut) bleed(t);
  if (def.tint) for (let i = 0; i < N; i++) { const l = luma(t.getI(i)); t.setI(i, gray(l)); }   // 宿主乘群系色：灰度
  let maxH = -1e9; for (let i = 0; i < N; i++) if (!def.cut || t.alpha[i] > 0) maxH = Math.max(maxH, t.height[i]);
  const h = new Float32Array(N), dh = isFinite(maxH) ? 1 - maxH : 0; for (let i = 0; i < N; i++) h[i] = t.height[i] + dh;   // 最高点 = 1
  const img = new Uint8Array(1024), n = new Uint8Array(1024), s = new Uint8Array(1024), pomB = def.pom ? q(Math.min(0.25, def.pom) / 0.25 * 255) : 0;
  const H = (x, y) => h[idx(x, y)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, o = i * 4, hole = def.cut && t.alpha[i] === 0;
    img[o] = q(t.col[i * 3]); img[o + 1] = q(t.col[i * 3 + 1]); img[o + 2] = q(t.col[i * 3 + 2]); img[o + 3] = def.alpha0 ? 0 : q(t.alpha[i]);
    if (hole) { n[o] = 128; n[o + 1] = 128; n[o + 2] = 255; n[o + 3] = 255; s[o] = q(t.smooth[i]); s[o + 1] = q(t.f0[i]); s[o + 2] = 0; s[o + 3] = 0; continue; }
    // Sobel（goodPG texCore.bake）：+X = 图右，+Z = 朝外；周期取邻。⚠ Y：goodPG 是 +Y = 图上，goodGL 的切线 B = uv.y 增大 = 图向下（PBR.build 的 ny = −(下 − 上)），
    //   所以这里写 −gy（原样搬 goodPG 的 +gy 时凹凸受光上下颠倒）
    const tl = H(x - 1, y - 1), tc = H(x, y - 1), tr = H(x + 1, y - 1), ml = H(x - 1, y), mr = H(x + 1, y), bl = H(x - 1, y + 1), bc = H(x, y + 1), br = H(x + 1, y + 1);
    const gx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) / 8 * t.depth, gy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) / 8 * t.depth, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
    let avg = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) avg += H(x + dx, y + dy); avg /= 25;   // 腔体 AO：低于邻域平均多少（与 goodGL pbr.js 同式，ns = 1）
    n[o] = q((-gx * inv * 0.5 + 0.5) * 255); n[o + 1] = q((-gy * inv * 0.5 + 0.5) * 255);
    n[o + 2] = q(Math.max(0.6, 1 - Math.max(0, avg - h[i]) * 1.3) * 255); n[o + 3] = pomB ? q(h[i] * 255) : 255;
    s[o] = q(t.smooth[i]); s[o + 1] = q(t.f0[i]);
    s[o + 2] = t.sss[i] > 20 ? q(65 + t.sss[i] / 255 * 190) : 0;   // goodGL：B ≥ 65 为次表面散射；< 65 是孔隙度（0..64）
    s[o + 3] = pomB;
  }
  return { img, n, s };
}

/** 第一步：覆盖 tx 里同名层的 albedo（在资源包之前）。返回 { 层号 → { img, n, s } }，供 pgApplyMaps 用 */
export function pgOverride(tx) {
  const own = new Map();
  for (const name of PG_NAMES) {
    const l = SH.TEX_NAMES.indexOf(name); if (l < 0) continue;
    const b = bake(name, DEFS[name]); tx.imgs[l] = b.img; tx.data.set(b.img, l * 1024); own.set(l, b);
  }
  return own;
}

/** 第二步：PBR.build 之后覆盖法线 / 光谱通道。资源包已经换过的层（草顶且 keep 开时除外）（tx.imgs[l] 不再是我们的 img）保持 PBR.build 的结果 */
export function pgApplyMaps(pbr, tx, own, keep = true) {
  let n = 0;
  for (const [l, b] of own) {   // keep：资源包换过 albedo 的层也保留 goodPG 的高度 / 反光（包的纹理 × goodPG 的材质通道）
    if (!(keep && DEFS[SH.TEX_NAMES[l]].keep) && tx.imgs[l] !== b.img) continue;   // 只有 DEFS 里标 keep 的层（草顶）装包后仍保留；侧面 / 雪 / 冰以包为准（冰走 pgUnder 叠底）
    pbr.n.set(b.n, l * 1024); pbr.s.set(b.s, l * 1024); n++;
  }
  return n;
}

/** 第三步（资源包之后）：under 层——资源包换过 albedo 时，不整张替换，而是把包的贴图 src-over 叠在我们的蓝色半透底上（冰：默认蓝色半透，包里的纹理盖上去）。叠完后 b.img 指向合成结果，pgApplyMaps 照常覆盖法线 / 光谱 */
export function pgUnder(tx, own) {
  for (const [l, b] of own) {
    if (!DEFS[SH.TEX_NAMES[l]].under || tx.imgs[l] === b.img) continue;
    const p = tx.imgs[l], o = new Uint8Array(1024);
    for (let i = 0; i < 1024; i += 4) {
      const pa = p[i + 3] / 255, ba = b.img[i + 3] / 255, a = pa + ba * (1 - pa);
      for (let k = 0; k < 3; k++) o[i + k] = a > 0 ? (p[i + k] * pa + b.img[i + k] * ba * (1 - pa)) / a : 0;
      o[i + 3] = a * 255;
    }
    b.img = o; tx.imgs[l] = o; tx.data.set(o, l * 1024);
  }
}
