/* gode/defl/g/pg1.js —— `?g=pg1` 生成器 Worker：vendor/pg1/gen.js（goodPG1.html 的生成器副本，SURV 调优在副本里）。
   原生布局就是规范 YZX u16：(y<<8)|(z<<4)|x，WH 192，海 63；id 453 个（< 4096）、meta < 16 → v = id | meta<<12。
   生成是块内封闭的：结构 / 特征 / 入口隧道都走 Writer，越界写入直接丢，outside 恒为空（meta.outside = false）。
   河、洞穴、矿、树、结构、雪/冰后处理在副本的 generate() 里；适配器做布局、列数据、参数（meta.knobs ← GEN_PARAMS）。 */
import { serve } from '../../w/slicer.js';
import { loadPG1 } from '../../vendor/pg1/load.js';
import { resolveParams } from '../../w/params.js';

const G = await loadPG1();
const hex = (rgb) => Array.isArray(rgb) ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : 0x808080;

export const meta = {
  id: 'pg1', ver: 1, sea: G.SEA, h: 256, h0: G.WH, outside: false,
  names: G.BLOCKS.map(b => b.name),
  biomes: G.BIOMES.map(b => b.name),
  colors: { biomes: G.BIOMES.map(b => hex(b.grass)) },
  knobs: G.GEN_PARAMS,   // vendor/pg1/gen.js 的 SURV 参数表（树 / 洞 / 入口 / 山）
};

let W = null;

// 种子：整数串照供体（+seed | 0），其余字符串走 FNV（与其它适配器同约定，保证任意 seed 都确定）
function fixSeed(seed) {
  const s = String(seed ?? '').trim();
  const n = parseInt(s, 10);
  if (!isNaN(n) && String(n) === s) return n | 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

export function onkwarg({ seed, kw }) {
  G.setGenParams(resolveParams(meta.knobs, kw));     // s02 §2.1
  W = new G.WorldGen(fixSeed(seed), 'default');
  return { meta };
}

export function gen({ cx, cz }, out) {
  const ch = new G.Chunk(G.DIM_OVER, cx, cz);
  W.generate(ch);
  const src = ch.blocks, m = ch.meta, b = out.blocks, n = src.length;   // n = 16*16*192
  b.fill(0);
  for (let i = 0; i < n; i++) b[i] = src[i] | (m[i] << 12);
  out.biomes.set(ch.biomes);
  const hs = out.heights;                                                // 规范：最高非空气格（供体的 hmap 跳过 filter=0 的植物，口径不同）
  for (let c = 0; c < 256; c++) { let y = G.WH - 1; while (y >= 0 && !src[(y << 8) | c]) y--; hs[c] = y; }
  return {};
}

export function sample({ x, z }) {
  const o = W.colInfo(Math.floor(x), Math.floor(z)), r = (v) => +v.toFixed(3);
  return { h: o.h, biome: o.biome, temp: r(o.temp), hum: r(o.hum), cont: r(o.cont), ero: r(o.ero), mnt: r(o.mntW) };
}

// 只算列噪声：pgviz 外圈 2D 用（整块生成 ~ms 级，6400 块会超时；s13 §14）
export function col({ cx, cz }) {
  const out = new Int16Array(1024), x0 = cx * 16, z0 = cz * 16, SEA = G.SEA;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const c = W.column(x0 + x, z0 + z), h = c & 255, bi = (c >> 8) & 255;
    const bio = G.BIOMES[bi], i = (z * 16 + x) * 4;
    out[i] = (h < SEA ? bio.under : bio.top);      // 近似：真实地表还有雪 / 沙 / 石头变化（gen 里）
    out[i + 1] = h; out[i + 2] = bi; out[i + 3] = Math.max(0, SEA - h);
  }
  return { cx, cz, col: out };
}

/** 出生点评分（SurvivalCraft ScoreSpawnPosition 口径）：温带、平坦、近原点、非山、非水；附近有洞穴入口加分。 */
export function spawn() {
  const SEA = G.SEA, OCEANS = G.OCEANS, BIO = G.BIO, H = (x, z) => W.colInfo(x, z).h;
  const ENT = [];                                    // 入口候选（±768 格）一次算好
  for (let gz = -12; gz <= 12; gz++) for (let gx = -12; gx <= 12; gx++) { const e = W.entranceSite(gx, gz); if (e) ENT.push(e); }
  const nearD = (x, z) => { let m = Infinity; for (const e of ENT) { const dx = e[0] - x, dz = e[1] - z, d = dx * dx + dz * dz; if (d < m) m = d; } return Math.sqrt(m); };
  let best = null, bs = -1e9, near = null, ns = -1e9;
  for (let r = 0; r <= 640; r += 16) {
    const n = Math.max(1, Math.round(r / 4));
    for (let a = 0; a < n; a++) {
      const ang = a / n * Math.PI * 2, x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
      const o = W.colInfo(x, z), h = o.h;
      if (h < SEA + 1 || h > SEA + 80) continue;
      if (OCEANS.has(o.biome) || o.biome === BIO.river || o.biome === BIO.frozen_river) continue;
      if (W.treeNear(x, z, 2)) continue;              // 别生在树干 / 树冠里
      let ring = 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) ring = Math.max(ring, Math.abs(H(x + dx, z + dz) - h));
      const slope = Math.max(Math.abs(H(x + 1, z) - h), Math.abs(H(x - 1, z) - h), Math.abs(H(x, z + 1) - h), Math.abs(H(x, z - 1) - h));
      const t = (o.temp + 1) / 2, hu = (o.hum + 1) / 2, ed = nearD(x, z);
      let s = 0;
      if (r > 400) s -= 0.25;                       // 距原点
      if (h < SEA) s -= 1.5;
      if (o.mntW > 0.9) s -= 1.5;                   // 山顶
      if (t < 0.45 || t > 0.65) s -= 0.5;           // 太冷 / 太热
      if (hu < 0.15 || hu > 0.55) s -= 0.5;         // 太干 / 太湿
      if (h > SEA + 12) s -= 1;                     // 太高
      if (slope > 5) s -= 1;                        // 起伏大
      if (ring > 3) s -= 1.5; else if (ring > 1) s -= 0.4;   // 3×3 不平（贴墙）
      s -= slope * 0.06 + ring * 0.05 + r / 3000;   // 平地、近处优先
      if (ed <= 160) s += 0.6; else if (ed <= 320) s += 0.3;   // 矿洞可达
      if (s > bs) { bs = s; best = [x + 0.5, h + 1, z + 0.5]; }
      if (ed <= 160 && s > ns) { ns = s; near = [x + 0.5, h + 1, z + 0.5]; }
    }
  }
  const pick = near && ns >= bs - 1.2 ? near : best; // 附近有洞的平地只要不差太多就优先
  const x = pick ? pick[0] - 0.5 : 0.5, z = pick ? pick[2] - 0.5 : 0.5, y = pick ? pick[1] : SEA + 10;
  // 朝向：8 个方向里挑「看得远」的一侧（远处更低 + 近处不挡视线）
  let yaw = 0, bo = -1e9;
  for (const [dx, dz] of [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]) {
    const open = (SEA - H(x + dx * 10, z + dz * 10)) - Math.abs(H(x + dx * 4, z + dz * 4) - y);
    if (open > bo) { bo = open; yaw = Math.atan2(-dx, -dz); }
  }
  return pick ? [pick[0], y, pick[2], yaw, 0] : [0.5, y, 0.5, yaw, 0];
}

serve(import.meta.url);