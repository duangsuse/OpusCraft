/* gode/viz/palette.js —— pgviz 方块着色与分类：按方块名（各生成器 meta.names 自带名字表），不按 id。
   色表取自 goodLiqPG tools/preview_world.mjs 的 COL（地图色），补上宿主 B / goodGP 有而它没有的名字；未知名字按模式猜，再不行按名字哈希出色。
   分类（LUT 的 alpha）：0 空气 · 1 实体 · 2 流体（水体，继续往下看床底）· 3 植物（地表图层跳过，草 / 花 / 藤 / 苗） */
const COL = {
  stone: 0x7d7d7d, granite: 0x956755, diorite: 0xc4c4c4, andesite: 0x8a8a8a, deepslate: 0x4f4f55, tuff: 0x6c6d66, bedrock: 0x2b2b2b,
  dirt: 0x866043, coarse_dirt: 0x77553b, podzol: 0x6a4a22, sand: 0xdbd3a0, red_sand: 0xbe6621, gravel: 0x847f7e, clay: 0xa0a6b3,
  sandstone: 0xd8cb9b, red_sandstone: 0xba631d, snow_block: 0xf6fbfb, snow: 0xf6fbfb, ice: 0x8fb0f0, packed_ice: 0x9fbcf2, blue_ice: 0x74a8f5, obsidian: 0x15111f,
  lava: 0xe8641a, terracotta: 0x985e43, white_terracotta: 0xd1b2a1, orange_terracotta: 0xa15325, yellow_terracotta: 0xba8523,
  brown_terracotta: 0x4d3323, red_terracotta: 0x8f3d2e, light_gray_terracotta: 0x876b62,
  coal_ore: 0x262626, iron_ore: 0xe0b090, copper_ore: 0xe0794a, gold_ore: 0xfcee4b, redstone_ore: 0xff2020, lapis_ore: 0x2050d0,
  diamond_ore: 0x5decf5, emerald_ore: 0x17dd62,
  deepslate_coal_ore: 0x161616, deepslate_iron_ore: 0xc09070, deepslate_copper_ore: 0xc06040, deepslate_gold_ore: 0xe0d030,
  deepslate_redstone_ore: 0xe00000, deepslate_lapis_ore: 0x1030b0, deepslate_diamond_ore: 0x40c8d8, deepslate_emerald_ore: 0x10b050,
  oak_log: 0x6b5332, spruce_log: 0x3b2912, birch_log: 0xd5cda5, jungle_log: 0x56441c, acacia_log: 0x6b6158, dark_oak_log: 0x3e2912, cherry_log: 0x3a1d26,
  oak_leaves: 0x4a7a2a, spruce_leaves: 0x3f6b3f, birch_leaves: 0x5f8040, jungle_leaves: 0x3a8a1a, acacia_leaves: 0x5a8a20, dark_oak_leaves: 0x3a6a1a,
  cherry_leaves: 0xe8a8c8, azalea_leaves: 0x5a8a3a, mangrove_leaves: 0x4a8a2a,
  cactus: 0x2f7a22, pumpkin: 0xe38a1d, melon: 0x7aa628, sugar_cane: 0x88c060, mossy_cobblestone: 0x6a7a5a, cobblestone: 0x7a7a7a,
  dead_bush: 0x8a6a3a, brown_mushroom: 0x9a7050, red_mushroom: 0xd03030, lily_pad: 0x208030,
  dandelion: 0xf0e020, poppy: 0xe02020, blue_orchid: 0x30a0e0, allium: 0xb060e0, azure_bluet: 0xe0e0f0, red_tulip: 0xe03030,
  orange_tulip: 0xf08020, white_tulip: 0xf0f0f0, pink_tulip: 0xf0a0c0, oxeye_daisy: 0xf0f0e0, cornflower: 0x4060e0, lily_of_the_valley: 0xffffff,
  sunflower: 0xf0d020, lilac: 0xc080d0, rose_bush: 0xd02040, peony: 0xe0a0d0, pink_petals: 0xf0a0c8,
  // 以下 preview_world 没有：宿主 B / goodGP / 地表常见
  grass_block: 0x7cad4c, water: 0x3f76e4, mud: 0x3c3a3e, moss_block: 0x5a7a2a, mycelium: 0x6f6265, magma_block: 0x8a3a10,
  netherrack: 0x6f3634, end_stone: 0xdbde9e, glowstone: 0xf0c060, spawner: 0x1a2a3a, chest: 0xa2782e, crafting_table: 0x9a6a3a,
  furnace: 0x6a6a6a, furnace_lit: 0x8a6a4a, lit_furnace: 0x8a6a4a, bookshelf: 0x8a6a3a, tnt: 0xd03a2a, farmland: 0x5a3a20, dirt_path: 0x9a7a40,
  glass: 0xc0e0f0, torch: 0xffd040, fire: 0xff7020, bricks: 0x96503a, stone_bricks: 0x7a7a7a, smooth_stone: 0x9e9e9e, hay_block: 0xb8a030,
  bone_block: 0xe0dcc8, quartz_block: 0xece6dc, prismarine: 0x5aa090, sea_lantern: 0xd0e8e0, calcite: 0xdfe0dc, dripstone_block: 0x866b5c,
  pointed_dripstone: 0x866b5c, amethyst_block: 0x8a60c0, budding_amethyst: 0x8460b8, smooth_basalt: 0x48484e, raw_iron_block: 0xa6876b,
  raw_copper_block: 0x9a6a4a, copper_ore_block: 0xc06a40, cobweb: 0xe0e0e0, rail: 0x7a6a50, wheat: 0xc8b040,
};
// 植物 / 装饰：地表图层跳过（显示下面的地面），探针仍报名字
const PLANT = /^(short_grass|tall_grass|grass|fern|large_fern|dead_bush|vine|cave_vines.*|glow_lichen|.*_sapling|wheat|.*_mushroom|sugar_cane|sweet_berry_bush|pink_petals|lily_pad|torch|.*_tulip|dandelion|poppy|blue_orchid|allium|azure_bluet|oxeye_daisy|cornflower|lily_of_the_valley|sunflower|lilac|rose_bush|peony|hanging_roots|spore_blossom|small_dripleaf.*|big_dripleaf.*|moss_carpet|snow)$/;
const FLUID = /^(water|seagrass|tall_seagrass|kelp|kelp_plant|bubble_column)$/;

function guess(n) {
  if (COL[n] !== undefined) return COL[n];
  if (/_leaves$/.test(n)) return 0x4a7a2a;
  if (/_(log|wood|stem)$/.test(n)) return COL[n.replace(/_(wood|stem)$/, '_log')] ?? 0x6b5332;
  if (/_planks$/.test(n)) return 0xa8864f;
  if (/_ore$/.test(n)) return COL[n.replace(/^deepslate_/, '')] ?? 0xb0a080;
  if (/_(slab|stairs|wall)$/.test(n)) return guess(n.replace(/_(slab|stairs|wall)$/, '')) ?? 0x8a8a8a;
  if (/wool|concrete|terracotta|glass/.test(n)) {
    const w = { white: 0xf0f0f0, orange: 0xf08020, magenta: 0xc04ec0, light_blue: 0x3ab3da, yellow: 0xfed83d, lime: 0x80c71f, pink: 0xf38baa, gray: 0x474f52,
      light_gray: 0x9d9d97, cyan: 0x169c9c, purple: 0x8932b8, blue: 0x3c44aa, brown: 0x835432, green: 0x5e7c16, red: 0xb02e26, black: 0x1d1d21 };
    for (const k of Object.keys(w).sort((a, b) => b.length - a.length)) if (n.startsWith(k + '_')) return w[k];
  }
  let h = 2166136261; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619);
  return ((h >>> 8) & 0x7f7f7f) + 0x303030;    // 未知名字：稳定的中等亮度色
}

export function cls(n) { return !n || n === 'air' || n === 'cave_air' || n === 'void_air' ? 0 : FLUID.test(n) ? 2 : PLANT.test(n) ? 3 : 1; }

// 4096 项 RGBA8：rgb = 方块色，a = 分类 × 64
export function blockLUT(names) {
  const lut = new Uint8Array(4096 * 4);
  names.forEach((n, i) => {
    if (i >= 4096) return;
    const c = cls(n), rgb = c ? guess(n) : 0;
    lut[i * 4] = rgb >> 16 & 255; lut[i * 4 + 1] = rgb >> 8 & 255; lut[i * 4 + 2] = rgb & 255; lut[i * 4 + 3] = c * 64;
  });
  return lut;
}

// 256 项群系色 RGBA8
export function biomeLUT(meta) {
  const lut = new Uint8Array(256 * 4), cs = meta.colors?.biomes ?? [];
  (meta.biomes ?? []).forEach((n, i) => {
    let c = cs[i];
    if (c === undefined) { let h = 2166136261; for (const ch of String(n)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); c = (h >>> 8) & 0xffffff; }
    lut[i * 4] = c >> 16 & 255; lut[i * 4 + 1] = c >> 8 & 255; lut[i * 4 + 2] = c & 255; lut[i * 4 + 3] = 255;
  });
  return lut;
}

export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
