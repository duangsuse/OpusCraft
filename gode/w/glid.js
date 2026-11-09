/* gode/w/glid.js —— 生成器方块 type → goodGL 方块 id（rgl 的方块空间）的名字映射，附光照 / 碰撞用的逐 type 属性表（s02 §4、s03 §2、s04 §1）。
   生成器、渲染器、存档之间都按名字对接：type 是各生成器自己的 id（V1），名字在 meta.names[type]。
   找不到同名的块：先查 SUBST（宿主 B 沿用的代用品表），再按后缀 / 前缀规则落到 goodGL 已有的块（s02 §4「缺失方块先 SUB 到已有方块」），
   实在没有就当石头并记进 miss（宿主在控制台列出，按画面影响分批补）。页面与 Worker 都能 import。 */
import { SH } from '../../vendor/gl/shared.js';
import { SUBST, SPECIAL } from '../../rgl/host-b.js';

const has = (n) => SH.BID[n] != null;
// 规则：[匹配, 目标名 | (m, name) => 名字]；按顺序试，目标不在 goodGL 里就继续往下
const RULES = [
  [/^(?:deepslate|cobbled_deepslate|tuff|polished_\w+)$/, (_, n) => n.startsWith('polished_') ? n.slice(9) : 'andesite'],
  [/^deepslate_(\w+_ore)$/, (m) => m[1]],
  [/^(?:copper|redstone)_ore$/, 'iron_ore'], [/^(?:redstone|copper)_block$|^\w*copper(?:_\w+)?$/, 'orange_terracotta'],
  [/_leaves$/, 'oak_leaves'], [/_(?:log|wood|stem)$/, 'oak_log'], [/_planks$/, 'oak_planks'], [/_sapling$/, 'oak_sapling'],
  [/^(?:coarse_dirt|podzol|mycelium|rooted_dirt)$/, 'dirt'], [/_terracotta$/, 'terracotta'], [/^red_sandstone$/, 'sandstone'],
  [/^(?:tall_grass|large_fern|seagrass|tall_seagrass|kelp|kelp_plant|vine|lily_pad)$/, 'short_grass'],
  [/^(?:sunflower|lilac|rose_bush|peony|blue_orchid|allium|azure_bluet|\w+_tulip|oxeye_daisy|lily_of_the_valley)$/, 'poppy'],
  [/_wool$|_carpet$/, 'white_wool'], [/^carved_pumpkin$/, 'orange_terracotta'], [/^melon$/, 'mossy_stone_bricks'],
  [/^(?:glass_pane|iron_bars)$/, 'glass'], [/^(?:sea_lantern|lantern)$/, 'lantern_block'], [/^lit_furnace$/, 'furnace_lit'], [/^redstone_torch$/, 'torch'],
  [/^(?:cracked|chiseled)_stone_bricks$/, 'stone_bricks'], [/^smooth_stone$/, 'stone'],
  [/^(?:soul_sand|netherrack)$/, 'red_terracotta'], [/^(?:cobweb|rail|powered_rail|nether_portal)$/, 'air'],
  // 台阶 / 楼梯 / 栅栏 / 墙 → 同材质的整块
  [/^(\w+?)_(?:slab|stairs|fence|wall|fence_gate|trapdoor|pressure_plate|button)$/, (m) => [m[1], m[1] + '_planks', m[1] + 's', m[1] + '_block', m[1].replace(/_brick$/, '_bricks'), m[1].replace(/^cut_|^oxidized_cut_/, '')].find(has) ?? 'stone'],
];

/** 一个方块名 → goodGL 名字（保证存在于 SH.BID；找不到回 null） */
export function glName(name) {
  if (!name || name === 'air') return 'air';
  if (SPECIAL.includes(name)) return 'air';
  const s = SUBST[name] ?? name;
  if (has(s)) return s;
  for (const [re, to] of RULES) {
    const m = name.match(re); if (!m) continue;
    const t = typeof to === 'function' ? to(m, name) : to;
    if (has(t)) return t;
  }
  return null;
}

/* 生成器的 meta.names → 表。type 超出 names 的当石头。
   lut[type] = goodGL id；opaque / opac / emit：光照用（OCC / OPACITY / EMIT 同 goodGL 的表）；solid：碰撞用（SOLID 表；水 / 岩浆不算）；
   plant：植物（碰撞忽略，渲染走交叉片）；fluid：水 / 岩浆；miss = 没有同名也没有代用品的名字（当石头）。 */
export function glTable(names) {
  const N = 4096, lut = new Uint8Array(N).fill(SH.BID.stone), miss = [];
  const opaque = new Uint8Array(N), opac = new Uint8Array(N), emit = new Uint8Array(N), solid = new Uint8Array(N), fluid = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    const n = names[t];
    let g = SH.BID.stone;
    if (n !== undefined) { const r = t === 0 ? 'air' : glName(n); if (r === null) miss.push(n); else g = SH.BID[r]; }
    else if (t >= names.length) g = SH.BID.stone;
    lut[t] = g;
    opaque[t] = SH.OCC[g]; opac[t] = SH.OPACITY[g]; emit[t] = SH.EMIT[g];
    fluid[t] = SH.RT[g] === SH.RT_LIQUID ? 1 : 0;
    solid[t] = g && !fluid[t] && SH.SOLID[g] ? 1 : 0;
  }
  return { lut, opaque, opac, emit, solid, fluid, miss };
}
