/* gode/defl/g/liq.js —— `?g=liq` 生成器 Worker：goodLiqPG Generator（ESM，直接 import 供体，不复制）。
   编码相同（12 位 type + 4 位 meta），布局 (yi*16+z)*16+x 与规范相同；y_gode = y_liq + 64，即 yi 直接当规范 y，255 以上裁掉（s02 §5）。
   outside 原样 [x,y,z,v] → [x, y+64, z, v, 2]（soft 2 = 只覆盖空气或非流体可替换格，同 goodLiqPG world.js applyFeatureBlocks）。 */
import { serve } from '../../w/slicer.js';
import { resolveParams } from '../../w/params.js';
import { Generator, GEN_PARAMS, BIOMES, SEA_LEVEL, MIN_Y } from '../../../goodLiqPG/src/world/gen/generator.js';
import { BLOCKS, T_REPLACEABLE, T_FLUID } from '../../../goodLiqPG/src/world/blocks.js';

// 群系地图色：goodLiqPG tools/preview_world.mjs BIOME_MAP_COL
const MAPCOL = {
  ocean: 0x000070, deep_ocean: 0x000030, frozen_ocean: 0x7070d6, deep_frozen_ocean: 0x404090, cold_ocean: 0x202070, deep_cold_ocean: 0x202038,
  lukewarm_ocean: 0x000090, deep_lukewarm_ocean: 0x000040, warm_ocean: 0x0000ac, river: 0x0000ff, frozen_river: 0xa0a0ff, beach: 0xfade55,
  snowy_beach: 0xfaf0c0, stony_shore: 0xa2a284, plains: 0x8db360, sunflower_plains: 0xb5db88, snowy_plains: 0xffffff, ice_spikes: 0xb4dcdc,
  desert: 0xfa9418, swamp: 0x07f9b2, forest: 0x056621, flower_forest: 0x2d8e49, birch_forest: 0x307444, old_growth_birch_forest: 0x589c6c,
  dark_forest: 0x40511a, taiga: 0x0b6a5f, snowy_taiga: 0x31554a, old_growth_pine_taiga: 0x596651, old_growth_spruce_taiga: 0x818e79,
  jungle: 0x537b09, sparse_jungle: 0x628b17, savanna: 0xbdb25f, savanna_plateau: 0xa79d64, windswept_savanna: 0xe5da87,
  windswept_hills: 0x606060, windswept_gravelly_hills: 0x888888, windswept_forest: 0x507050, meadow: 0x60a445, cherry_grove: 0xffa0d0,
  grove: 0x47726c, snowy_slopes: 0xc4c4c4, frozen_peaks: 0xa0a0d0, jagged_peaks: 0xdcdcf0, stony_peaks: 0x7b7b7b, badlands: 0xd94515,
  eroded_badlands: 0xff6d3d, wooded_badlands: 0xb09765, mushroom_fields: 0xff00ff,
};
const DY = -MIN_Y;   // 64
export const meta = {
  id: 'liq', ver: 1, knobs: GEN_PARAMS, sea: SEA_LEVEL + DY, h: 256, y0: MIN_Y,     // y0：供体原生坐标的零点，探针卡显示「liq y」用
  names: BLOCKS.map(b => b.name), biomes: BIOMES.map(b => b.name), colors: { biomes: BIOMES.map(b => MAPCOL[b.name] ?? 0x808080) },
  over: { 2: BLOCKS.map((b, i) => T_REPLACEABLE[i] && !T_FLUID[i] ? i : -1).filter(i => i > 0) },
};

let G = null, tmp = new Uint16Array(16 * 16 * 384);
export function onkwarg({ seed, kw }) {
  const s = String(seed ?? '').trim();
  G = new Generator(/^-?\d+$/.test(s) ? Number(s) : s);   // 纯整数串当数，其余字符串由供体 seedWords 哈希
  G.setParams(resolveParams(meta.knobs, kw));             // s02 §2.1
  return { meta };
}

export function gen({ cx, cz }, out) {
  const r = G.generateChunk(cx, cz, tmp), b = out.blocks;
  b.set(tmp.subarray(0, 65536));
  let clip = 0;
  for (let i = 65536; i < tmp.length; i++) if (tmp[i]) clip++;
  out.biomes.set(r.biomes);
  for (let c = 0; c < 256; c++) {
    const h = r.heightmap[c] + DY;
    if (h <= 255) { out.heights[c] = h; continue; }
    let y = 255; while (y >= 0 && !b[(y << 8) | c]) y--; out.heights[c] = y;   // 被裁的列重算
  }
  const src = r.outside, o = [];
  for (let i = 0; i < src.length; i += 4) { const y = src[i + 1] + DY; if (y >= 0 && y < 256) o.push(src[i], y, src[i + 2], src[i + 3], 2); else clip++; }
  return { outside: Int32Array.from(o), clip };
}

export function sample({ x, z }) {
  const tn = G.tn, cl = new Float64Array(16);
  tn.climate(x, z, cl, 0, true);
  const r = (v) => +v.toFixed(3), jag = tn.jagTerm(x, z, cl[8]);
  // 0 T 1 H 2 C 3 E 4 W 5 PV 6 OFF 7 FAC 8 JAG（goodLiqPG terrain.js CL_*）；hEst = 平滑地表估计（generator.js prelimG 同式），规范 y
  return { biome: G.biomeAt(x, 64, z), hEst: Math.round(-64 + 128 * (1.5 + cl[6] + jag)) + DY,
    temp: r(cl[0]), humid: r(cl[1]), cont: r(cl[2]), ero: r(cl[3]), weird: r(cl[4]), pv: r(cl[5]) };
}

export function spawn() { const p = G.findSpawn(); p[1] += DY; return p; }

serve(import.meta.url);
