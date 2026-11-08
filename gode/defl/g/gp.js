/* gode/defl/g/gp.js —— `?g=gp` 生成器 Worker：goodGP World.generate（goodGP/js/world.js:153，经 vendor/gp/load.js 原文载入）。
   原生布局 (y<<8)|(z<<4)|x、H 256 与规范相同，只需 v = id | meta<<12（s02 §4）；树靠重算 3×3 树表、不外写，outside 恒为空。
   种子换算照 goodGP game.js:137（纯整数串 → parseInt，否则 hashStr）。 */
import { serve } from '../../w/slicer.js';
import { loadGP, newWorld } from '../../vendor/gp/load.js';

const G = await loadGP();
// goodGP 群系是中文名；地图色取 MC 群系图配色（goodLiqPG tools/preview_world.mjs BIOME_MAP_COL 同名项）
const BIOME_COL = [0x000070, 0xfade55, 0x8db360, 0x056621, 0x307444, 0x0b6a5f, 0xf0f8ff, 0xfa9418, 0x707070, 0x0000ff, 0xdcdcf0, 0x7070d6];
export const meta = {
  id: 'gp', ver: 1, sea: G.SEA, h: G.HEIGHT,
  names: G.BLOCKS.map(b => b?.key ?? ''), biomes: G.BIOMES.slice(), colors: { biomes: BIOME_COL },
};

let W = null;
export function onkwarg({ seed }) {
  const s = String(seed ?? '').trim(); let n = parseInt(s, 10);
  if (isNaN(n) || String(n) !== s) n = G.hashStr(s);
  W = newWorld(G, n);
  return { meta };
}

export function gen({ cx, cz }, out) {
  const ch = W.generate(cx, cz), b = ch.blocks, m = ch.meta, o = out.blocks;
  for (let i = 0; i < 65536; i++) o[i] = b[i] | m[i] << 12;
  out.biomes.set(ch.biome);
  for (let c = 0; c < 256; c++) { let y = 255; while (y >= 0 && !b[(y << 8) | c]) y--; out.heights[c] = y; }
  return {};
}

export function sample({ x, z }) {
  const c = W.column(x, z), r = (v) => +v.toFixed(3);
  return { h: c.h, biome: W.biomeOf(c), temp: r(c.temp), humid: r(c.humid), cont: r(c.cont), mount: r(c.mount), river: r(c.river) };
}

serve(import.meta.url);
