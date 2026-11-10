/* gode/defl/g/pg1.js —— `?g=pg1` 生成器 Worker：goodPG1.html 的 WorldGen（vendor/pg1/load.js 运行时载入供体原文）。
   原生布局就是规范 YZX u16：(y<<8)|(z<<4)|x，WH 192，海 63；id 453 个（< 4096）、meta < 16 → v = id | meta<<12。
   生成是块内封闭的：结构 / 特征都走 Writer（goodPG1.html:2206），越界写入直接丢，outside 恒为空（meta.outside = false）。
   供体自带的河、洞穴、矿、树、结构、雪/冰后处理都在 generate() 里，适配器只做布局与列数据搬运。 */
import { serve } from '../../w/slicer.js';
import { loadPG1 } from '../../vendor/pg1/load.js';

const G = await loadPG1();
const hex = (rgb) => Array.isArray(rgb) ? (rgb[0] << 16) | (rgb[1] << 8) | rgb[2] : 0x808080;

export const meta = {
  id: 'pg1', ver: 1, sea: G.SEA, h: 256, h0: G.WH, outside: false,
  names: G.BLOCKS.map(b => b.name),
  biomes: G.BIOMES.map(b => b.name),
  colors: { biomes: G.BIOMES.map(b => hex(b.grass)) },
  knobs: [],   // 供体没有参数表（wtype 固定 default）
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

export function onkwarg({ seed }) {
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
  const c = W.column(Math.floor(x), Math.floor(z));
  return { h: c & 255, biome: (c >> 8) & 255 };
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

export function spawn() {
  const SEA = G.SEA, OCEANS = G.OCEANS, BIO = G.BIO;
  for (let r = 0; r < 1200; r += 16) for (let a = 0; a < Math.max(1, r / 4); a++) {
    const ang = a / Math.max(1, r / 4) * Math.PI * 2;
    const x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
    const c = W.column(x, z), h = c & 255, b = (c >> 8) & 255;
    if (h > SEA + 1 && h < 120 && !OCEANS.has(b) && b !== BIO.river && b !== BIO.frozen_river) return [x + 0.5, h + 1, z + 0.5];
  }
  return [0.5, 100, 0.5];
}

serve(import.meta.url);