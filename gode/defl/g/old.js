/* gode/defl/g/old.js —— `?g=old` 生成器 Worker：宿主 B gen.js 的抽副本（vendor/old/*，s02 §4、s13 V-7）。
   原生布局 xzy8（u8 id + u8 meta，x<<11|z<<7|y，H 128，列数组 x 主序）→ 运行时 xlate 成规范 YZX u16，y 原样（128 以上是空气）。
   跨块写入：宿主 B 写进已生成邻块或 pendingFeatures；这里本块直写，块外一律进 outside [x,y,z,v,soft]（soft 1 = 只覆盖空气 / 树叶），
   由 main 按宿主 B applyPending 的语义合并。差异：宿主先 applyPending 再装饰本块，这里邻块溢出总在本块装饰之后到达（树叶不幂等，C2 屏蔽）。 */
import { serve } from '../../w/slicer.js';
import { CHUNK_H, SEA_LEVEL } from '../../vendor/old/prng.js';
import { NAMES, AIR, isLeaves } from '../../vendor/old/blocks.js';
import { Terrain, BIOMES, W, PARAMS } from '../../vendor/old/terrain.js';
import { resolveParams } from '../../w/params.js';

const BIOME_COL = { 'Ocean': 0x000070, 'Plains': 0x8db360, 'Forest': 0x056621, 'Desert': 0xfa9418, 'Mountains': 0x707070, 'Snowy Tundra': 0xf0f8ff,
  'Taiga': 0x0b6a5f, 'Beach': 0xfade55, 'Birch Forest': 0x307444, 'Deep Ocean': 0x000030 };
export const meta = {
  id: 'old', ver: 1, knobs: PARAMS, sea: SEA_LEVEL, h: 256, h0: CHUNK_H, layout: 'xzy8',
  names: NAMES, biomes: BIOMES.map(b => b.name), colors: { biomes: BIOMES.map(b => BIOME_COL[b.name] ?? 0x808080) },
  over: { 1: NAMES.map((n, i) => isLeaves(i) ? i : -1).filter(i => i >= 0) },   // soft 规则 1 额外可覆盖的 type（空气总可覆盖）
};

let SEED = '';

// 宿主 B 的 Chunk 子集（index.html:1058）：gen.js 只读写 blocks / meta / height / biomes / tiles
class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.state = 0;
    this.blocks = new Uint8Array(16 * 16 * CHUNK_H); this.meta = new Uint8Array(16 * 16 * CHUNK_H);
    this.height = new Uint8Array(256); this.biomes = new Uint8Array(256); this.tiles = new Map();
  }
  updateHeight(x, z) { let y = CHUNK_H - 1; const base = (x << 11) | (z << 7); while (y >= 0 && this.blocks[base | y] === 0) y--; this.height[x * 16 + z] = y + 1; }
  recomputeHeights() { for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) this.updateHeight(x, z); }
}

let cur = null, outside = [];
// 宿主 B World.setBlockGen（index.html:1193）的本块分支；块外 → outside
W.setBlockGen = (x, y, z, id, meta = 0, replaceOnly = null) => {
  if (y < 0 || y >= CHUNK_H) return;
  const c = cur;
  if ((x >> 4) !== c.cx || (z >> 4) !== c.cz) { outside.push(x, y, z, id | meta << 12, replaceOnly ? 1 : 0); return; }
  const i = ((x & 15) << 11) | ((z & 15) << 7) | y, old = c.blocks[i];
  if (replaceOnly && !replaceOnly(old)) return;
  if (old === id && c.meta[i] === meta) return;
  c.blocks[i] = id; c.meta[i] = meta;
  const hi = (x & 15) * 16 + (z & 15);
  if (id !== AIR && y >= c.height[hi]) c.height[hi] = y + 1;
  else if (id === AIR && y === c.height[hi] - 1) c.updateHeight(x & 15, z & 15);
};
W.setTileGen = () => {};      // 方块实体（箱子 / 刷怪笼内容）V1 不传
W.applyPending = () => {};    // 挂起表在 main（s02 §3）

export function onkwarg({ seed, kw }) {
  SEED = String(seed);        // 宿主 B：Game.seed = String(seed)，Terrain.init(this.seed)
  Terrain.init(SEED);
  Terrain.setParams(resolveParams(PARAMS, kw));   // s02 §2.1
  return { meta };
}

export function gen({ cx, cz }, out) {
  const c = cur = new Chunk(cx, cz); outside = [];
  Terrain.generateChunk(c);
  out.blocks = c.blocks; out.meta = c.meta; out.biomes = c.biomes;
  const hs = out.heights = new Int16Array(256);
  for (let i = 0; i < 256; i++) hs[i] = c.height[i] - 1;          // 宿主 height = 顶格 + 1；仍是 x 主序，xlate 转
  return { outside: Int32Array.from(outside) };
}

export function sample({ x, z }) {
  const s = Terrain.sample(x, z);
  return { h: s.h, biome: s.biome, temp: +s.temp.toFixed(3), hum: +s.hum.toFixed(3), mountain: +s.mountain.toFixed(3) };
}

export function spawn() { return Terrain.findSpawn(); }

serve(import.meta.url);
