/* gode/defl/g/veg.js —— `?g=veg` 生成器 Worker：goodPG（VoxelCraft v3）的地形生成，
   `vendor/v3/terrain.mjs`（`src/shared/world/terrain.ts` 的 96 模块打包，勿手改，重生成见 tools/build-v3.mjs）。
   坐标：原生 y −64…319 → 规范 y = 原生 + 64（同 liq，s02 §5）；只保留 0…255，> 255 的格计入 clip。
   类型：v3 的 id 是**方块状态**（6 244 个，超出规范的 12 位），这里按去掉尾部 `_<n>` 的名字压成规范 type（≈1 132 个）：
   朝向 / 水位等状态丢失，meta 位恒 0。名字表在 meta.names（viz / glid / 光照都按它对接）。
   外写：没有。树按全局 4×4 网格算、结构按全局网格算，每个块只写自己那份（terrain.ts 的 set / Canvas.inside 都裁到本块），
   所以跨块树冠 / 建筑由邻块各自补齐，`meta.outside = false`（同 gp）。箱内容 / 村民 / 结构刷怪 / 下界流体源在 GenResult 里，
   gode 的 gen 应答没有这些通道，V1 丢弃。 */
import { serve } from '../../w/slicer.js';
import { TerrainGenerator, BLOCKS, MIN_Y, SEA_LEVEL, BIOME_NAMES } from '../../vendor/v3/terrain.mjs';

const DY = -MIN_Y;                    // 64
const VOL = 65536;                    // 规范的 16×16×256
const SEA = SEA_LEVEL + DY;           // 127

// ---- v3 状态 id → 规范 type（按去状态后缀的名字合并；air = 0） ----
const names = ['air'];
const lut = (() => {
  let max = 0;
  for (const b of BLOCKS) if (b && b.id > max) max = b.id;
  const arr = new Uint16Array(max + 1), byName = new Map([['air', 0]]);
  for (const b of BLOCKS) {
    if (!b || b.id === 0) continue;
    const k = b.key.replace(/(_\d+)+$/, '');
    let id = byName.get(k);
    if (id === undefined) { id = names.length; if (id > 4095) throw new Error('veg: meta.names 超过 12 位 type 空间'); byName.set(k, id); names.push(k); }
    arr[b.id] = id;
  }
  return arr;
})();

// 群系色（viz 的「群系色」着色 / 地图色）：按 BIOME_NAMES 下标，取 MC 群系图配色
const BIOME_COL = [
  0x000070, 0x7070d6, 0xfade55, 0x8db360, 0x056621, 0x307444, 0x0b6a5f, 0x31554a, 0xfa9418, 0xbdb25f,
  0x606060, 0xc4c4c4, 0x07f9b2, 0x537b09, 0x40511a, 0xd94515, 0xff00ff, 0xffa0d0, 0x60a445, 0xb4dcdc,
  0x0000ac, 0x202070, 0x000030, 0x0000ff, 0xa0a0ff, 0xfaf0c0, 0xa2a284, 0x000090, 0x000040, 0x202038,
  0x404090, 0xb5db88, 0x2d8e49, 0x589c6c, 0x888888, 0x507050, 0x47726c, 0xa0a0d0, 0xdcdcf0, 0x7b7b7b,
  0xffffff, 0x596651, 0x818e79, 0x628b17, 0x8bb31b, 0xff6d3d, 0xb09765, 0xa79d64, 0xe5da87, 0x4c763c,
  0x4c7a3a, 0x8b6b4a, 0x6b1e1e, 0x4b3d31, 0x7a1f1f, 0x1f6b62, 0x3a3a3a, 0xdbd8bf, 0xbfb99e, 0xbfb99e,
  0xa7a48d, 0x8f8b76,
];

export const meta = {
  id: 'veg', ver: 1, h: 256, sea: SEA, y0: MIN_Y, outside: false,
  names, biomes: BIOME_NAMES.slice(), colors: { biomes: BIOME_COL },
};

let G = null;

export function onkwarg({ seed }) {
  const s = String(seed ?? '').trim();
  G = new TerrainGenerator(/^-?\d+$/.test(s) ? (Number(s) | 0) : hashStr(s));
  return { meta };
}

export function gen({ cx, cz }, out) {
  const r = G.generate(cx, cz), src = r.blocks, dst = out.blocks;
  for (let i = 0; i < VOL; i++) { const v = src[i]; dst[i] = v ? lut[v] : 0; }
  let clip = 0;
  for (let i = VOL; i < src.length; i++) if (src[i]) clip++;

  const bio = out.biomes;
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) bio[(z << 4) | x] = G.biomeAt(cx * 16 + x, cz * 16 + z);

  const hs = out.heights;
  for (let c = 0; c < 256; c++) { let y = 255; while (y >= 0 && !dst[(y << 8) | c]) y--; hs[c] = y; }

  return clip ? { clip } : {};
}

export function sample({ x, z }) {
  const i = G.columnInfo(x, z), r = (v) => +v.toFixed(3);
  return { h: Math.round(i.height) + DY, biome: i.biome, temp: r(i.temp), humid: r(i.humid), mount: r(i.mount), cont: r(i.cont) };
}

export function spawn() {
  for (let r = 0; r < 96; r += 4) for (let a = 0; a < 8; a++) {
    const x = Math.round(Math.cos(a * Math.PI / 4) * r * 4), z = Math.round(Math.sin(a * Math.PI / 4) * r * 4);
    const i = G.columnInfo(x, z), h = Math.round(i.height) + DY;
    if (h > SEA + 1 && h < 220) return [x + 0.5, h + 2, z + 0.5];
  }
  return [0.5, SEA + 10, 0.5];
}

// 种子换算同 gp / liq：纯整数串按数，其余字符串哈希（Jenkins one-at-a-time，与原生成器无关，只要稳定）
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

serve(import.meta.url);
