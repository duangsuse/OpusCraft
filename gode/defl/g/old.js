/* gode/defl/g/old.js —— `?g=old` 生成器 Worker：VoxelCraft.html（仓库根）的地形生成抽副本（vendor/old/voxelcraft.js，s02 §4、s13 §12）。
   原生布局：u8 id，(x*16+z)*96 + y（CH 96，海平面 40，没有 meta），这里直接写进规范 YZX u16（y 原样，96 以上是空气），不走 xlate。
   VoxelCraft 没有群系：biome 由 vendor 的 surface() 按地表分类（海 / 滩 / 平原 / 林 / 石峰 / 雪坡）。树全在块内（x,z ∈ 2..13），outside 恒为空，meta.outside = false。 */
import { serve } from '../../w/slicer.js';
import { resolveParams } from '../../w/params.js';
import * as V from '../../vendor/old/voxelcraft.js';

// 原版 B 表的 id → 名字（id = 下标；名字对齐各生成器通用的 palette / species 命名）
const NAMES = ['air', 'grass_block', 'dirt', 'stone', 'cobblestone', 'oak_log', 'oak_leaves', 'oak_planks', 'sand', 'water',
  'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'bedrock', 'glass', 'crafting_table', 'furnace',
  'torch', 'tall_grass', 'poppy', 'dandelion', 'snow_block', 'stone_bricks', 'tnt', 'gold_block'];
const BIOME_COL = { ocean: 0x000070, beach: 0xfade55, plains: 0x8db360, forest: 0x056621, stony_peaks: 0x7b7b7b, snowy_slopes: 0xc4c4c4 };
const CH = V.CH;

export const meta = {
  id: 'old', ver: 1, knobs: V.PARAMS, sea: V.SEA, h: 256, h0: CH, outside: false,
  names: NAMES, biomes: V.BIOMES.slice(), colors: { biomes: V.BIOMES.map(b => BIOME_COL[b] ?? 0x808080) },
};

const tmp = new Uint8Array(16 * 16 * CH), bio = new Uint8Array(256);

export function onkwarg({ seed, kw }) {
  const s = String(seed ?? '').trim();
  V.initNoise(/^-?\d+$/.test(s) ? parseInt(s, 10) | 0 : V.hashStr(s) | 0);   // 原版：URL ?seed= 用 parseInt(…,10)|0
  V.setParams(resolveParams(meta.knobs, kw));                               // s02 §2.1
  return { meta };
}

export function gen({ cx, cz }, out) {
  tmp.fill(0);
  V.generateChunk(cx, cz, tmp, bio);
  const b = out.blocks;
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const src = (x * 16 + z) * CH, c = z * 16 + x;
    let top = -1;
    for (let y = 0; y < CH; y++) { const v = tmp[src + y]; if (v) { b[(y << 8) | c] = v; top = y; } }
    out.heights[c] = top;
    out.biomes[c] = bio[x * 16 + z];
  }
  return { outside: new Int32Array(0) };
}

export function sample({ x, z }) {
  const h = V.heightAt(x, z), slope = Math.max(Math.abs(V.heightAt(x + 1, z) - V.heightAt(x - 1, z)), Math.abs(V.heightAt(x, z + 1) - V.heightAt(x, z - 1)));
  return { h, biome: V.surface(h, slope, x, z).biome, slope };
}

export function spawn() {
  for (let r = 0; r < 64; r += 2) for (let a = 0; a < 8; a++) {
    const x = Math.round(Math.cos(a * Math.PI / 4) * r * 4), z = Math.round(Math.sin(a * Math.PI / 4) * r * 4), h = V.heightAt(x, z);
    if (h > V.SEA + 1 && h < 60) return [x + 0.5, h + 2, z + 0.5];
  }
  return [0.5, V.SEA + 10, 0.5];
}

serve(import.meta.url);
