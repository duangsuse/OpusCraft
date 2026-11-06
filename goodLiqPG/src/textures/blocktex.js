// Procedural 16x16 block textures imitating the vanilla Minecraft 1.20 default resource pack.
// Pure JS (no DOM / canvas). paintBlockTextures() -> { name: Tex } (see bt_core.finish for the Tex format).
import { finish } from './bt_core.js';
import * as T from './bt_terrain.js';
import * as B from './bt_built.js';
import * as W from './bt_wood.js';
import * as P from './bt_plants.js';
import * as A from './bt_anim.js';

export const TEX_SIZE = 16;

export function paintBlockTextures() {
  const out = {};
  const add = (name, img, opts) => { out[name] = finish(img, opts); };
  const rough = { smooth: 0.12 };

  // ---- stone family ----
  const stone = T.stoneImg();
  add('stone', stone, { smooth: 0.2 });
  add('granite', T.granite(), { smooth: 0.25 });
  add('polished_granite', T.polished_granite(), { smooth: 0.6, f0: 0.05 });
  add('diorite', T.diorite(), { smooth: 0.25 });
  add('polished_diorite', T.polished_diorite(), { smooth: 0.62, f0: 0.05 });
  add('andesite', T.andesite(), { smooth: 0.22 });
  add('polished_andesite', T.polished_andesite(), { smooth: 0.58, f0: 0.05 });
  const deep = T.deepslateImg();
  add('deepslate', deep, { smooth: 0.22 });
  add('deepslate_top', T.deepslateTop(), { smooth: 0.22 });
  add('tuff', T.tuff(), { smooth: 0.15 });
  add('smooth_stone', T.smoothStone(), { smooth: 0.45 });
  add('smooth_stone_slab_side', T.smoothStoneSlabSide(), { smooth: 0.45 });
  add('bedrock', T.bedrock(), { smooth: 0.15 });

  // ---- dirt / grass ----
  const dirt = T.dirtImg();
  add('dirt', dirt, rough);
  add('grass_block_top', T.grassTop(), { smooth: 0.18 });
  add('grass_block_side', T.dirtImg(), rough);
  add('grass_block_side_overlay', T.grassOverlay(), { smooth: 0.18 });
  add('grass_block_snow', T.grassSnow(), rough);
  add('coarse_dirt', T.coarseDirt(), rough);
  add('podzol_top', T.podzolTop(), rough);
  add('podzol_side', T.podzolSide(), rough);
  add('farmland', T.farmland(false), rough);
  add('farmland_moist', T.farmland(true), { smooth: 0.3 });
  add('dirt_path_top', T.pathTop(), rough);
  add('dirt_path_side', T.pathSide(), rough);
  add('sand', T.sand(), { smooth: 0.1 });
  add('red_sand', T.redSand(), { smooth: 0.1 });
  add('gravel', T.gravel(), { smooth: 0.15 });
  add('clay', T.clay(), { smooth: 0.35 });
  add('sandstone', T.sandstone(), { smooth: 0.15 });
  add('sandstone_top', T.sandstoneTopImg(), { smooth: 0.18 });
  add('sandstone_bottom', T.sandstoneBottomImg(), { smooth: 0.15 });
  add('red_sandstone', T.redSandstone(), { smooth: 0.15 });
  add('red_sandstone_top', T.redSandstoneTopImg(), { smooth: 0.18 });
  add('red_sandstone_bottom', T.redSandstoneBottomImg(), { smooth: 0.15 });
  add('snow', T.snow(), { smooth: 0.3 });
  add('ice', T.ice(), { smooth: 0.9, f0: 0.02 });
  add('packed_ice', T.packedIce(), { smooth: 0.75, f0: 0.02 });
  add('obsidian', T.obsidian(), { smooth: 0.75, f0: 0.05 });
  add('terracotta', T.terracotta(0x985e43, 'tc'), { smooth: 0.3 });
  const TC = { white: 0xd1b2a1, orange: 0xa15325, yellow: 0xba8523, brown: 0x4d3323, red: 0x8f3d2e, light_gray: 0x876b62 };
  for (const k in TC) add(k + '_terracotta', T.terracotta(TC[k], 'tc' + k), { smooth: 0.3 });
  add('netherrack', T.netherrack(), rough);
  add('soul_sand', T.soulSand(), rough);

  // ---- ores ----
  for (const k of T.ORE_KINDS) {
    add(k + '_ore', T.oreImg(k, stone), { smooth: 0.2 });
    add('deepslate_' + k + '_ore', T.oreImg(k, deep), { smooth: 0.22 });
  }

  // ---- mineral / metal blocks ----
  add('coal_block', B.coalBlock(), { smooth: 0.35 });
  add('iron_block', B.ironBlock(), { smooth: 0.7, f0: 1 });
  add('gold_block', B.goldBlock(), { smooth: 0.78, f0: 1 });
  add('diamond_block', B.diamondBlock(), { smooth: 0.85, f0: 0.17 });
  add('emerald_block', B.emeraldBlock(), { smooth: 0.82, f0: 0.15 });
  add('lapis_block', B.lapisBlock(), { smooth: 0.55, f0: 0.06 });
  add('redstone_block', B.redstoneBlock(), { smooth: 0.5, f0: 0.06 });
  for (const k of ['copper', 'exposed', 'weathered', 'oxidized']) {
    const nm = k === 'copper' ? 'copper_block' : k + '_copper';
    const metal = { copper: [0.72, 1], exposed: [0.6, 1], weathered: [0.4, 0.5], oxidized: [0.25, 0.06] }[k];
    add(nm, B.copperBlock(k), { smooth: metal[0], f0: metal[1] });
    add(k === 'copper' ? 'cut_copper' : k + '_cut_copper', B.cutCopper(k), { smooth: metal[0], f0: metal[1] });
  }

  // ---- wood ----
  for (const w of W.WOODS) {
    add(w + '_log', W.logSide(w), { smooth: 0.1 });
    add(w + '_log_top', W.logTop(w), { smooth: 0.2 });
    add(w + '_planks', W.planks(w), { smooth: 0.28 });
    add(w + '_leaves', W.leaves(w), { smooth: 0.3, sss: 0.85 });
    add(w + '_sapling', W.sapling(w), { smooth: 0.25, sss: 0.75 });
  }
  add('oak_door_top', W.oakDoorTop(), { smooth: 0.28 });
  add('oak_door_bottom', W.oakDoorBottom(), { smooth: 0.28 });
  add('oak_trapdoor', W.oakTrapdoor(), { smooth: 0.28 });
  add('crafting_table_top', W.craftingTableTop(), { smooth: 0.3 });
  add('crafting_table_front', W.craftingTableFront(), { smooth: 0.28 });
  add('crafting_table_side', W.craftingTableSide(), { smooth: 0.28 });
  add('bookshelf', W.bookshelf(), { smooth: 0.25 });
  add('chest_top', W.chestTop(), { smooth: 0.3 });
  add('chest_side', W.chestSide(false), { smooth: 0.3 });
  add('chest_front', W.chestSide(true), { smooth: 0.3 });
  add('ladder', W.ladder(), { smooth: 0.25 });

  // ---- plants ----
  const plant = { smooth: 0.25, sss: 0.75 };
  add('short_grass', P.shortGrass(), plant);
  add('tall_grass_top', P.tallGrass(true), plant);
  add('tall_grass_bottom', P.tallGrass(false), plant);
  add('fern', P.fern(), plant);
  add('large_fern_top', P.largeFern(true), plant);
  add('large_fern_bottom', P.largeFern(false), plant);
  for (const k in P.FLOWERS) add(k, P.FLOWERS[k](), { smooth: 0.3, sss: 0.7 });
  for (const k of ['front', 'back', 'top', 'bottom']) add('sunflower_' + k, P.sunflower(k), { smooth: 0.3, sss: 0.7 });
  for (const k in P.DOUBLE) add(k, P.DOUBLE[k](), { smooth: 0.3, sss: 0.7 });
  add('dead_bush', P.deadBush(), { smooth: 0.15, sss: 0.5 });
  add('cactus_top', P.cactusTop(false), { smooth: 0.35, sss: 0.3 });
  add('cactus_side', P.cactusSide(), { smooth: 0.35, sss: 0.3 });
  add('cactus_bottom', P.cactusTop(true), { smooth: 0.35, sss: 0.3 });
  add('sugar_cane', P.sugarCane(), { smooth: 0.35, sss: 0.6 });
  add('pumpkin_top', P.pumpkinTop(), { smooth: 0.35 });
  add('pumpkin_side', P.pumpkinSide(), { smooth: 0.35 });
  add('carved_pumpkin', P.carvedPumpkin(false), { smooth: 0.35 });
  add('jack_o_lantern', P.carvedPumpkin(true), { smooth: 0.35 });
  add('melon_top', P.melonTop(), { smooth: 0.4 });
  add('melon_side', P.melonSide(), { smooth: 0.4 });
  add('lily_pad', P.lilyPad(), { smooth: 0.5, sss: 0.6 });
  add('vine', P.vine(), { smooth: 0.3, sss: 0.8 });
  add('seagrass', P.seagrass('short'), plant);
  add('tall_seagrass_top', P.seagrass('tall_top'), plant);
  add('tall_seagrass_bottom', P.seagrass('tall_bottom'), plant);
  add('kelp', P.kelp(false), plant);
  add('kelp_plant', P.kelp(true), plant);
  add('brown_mushroom', P.mushroom(false), { smooth: 0.3, sss: 0.4 });
  add('red_mushroom', P.mushroom(true), { smooth: 0.4, sss: 0.4 });
  add('pink_petals', P.pinkPetals(false), { smooth: 0.3, sss: 0.7 });
  add('pink_petals_stem', P.pinkPetals(true), { smooth: 0.3, sss: 0.7 });
  for (let s = 0; s < 8; s++) add('wheat_stage' + s, P.wheat(s), plant);

  // ---- building blocks ----
  add('cobblestone', B.cobblestone(), { smooth: 0.18 });
  add('mossy_cobblestone', B.mossyCobblestone(), { smooth: 0.18 });
  add('cobbled_deepslate', B.cobbledDeepslate(), { smooth: 0.2 });
  add('stone_bricks', B.stoneBricks(), { smooth: 0.25 });
  add('mossy_stone_bricks', B.mossyStoneBricks(), { smooth: 0.22 });
  add('cracked_stone_bricks', B.crackedStoneBricks(), { smooth: 0.22 });
  add('chiseled_stone_bricks', B.chiseledStoneBricks(), { smooth: 0.3 });
  add('bricks', B.bricks(), { smooth: 0.25 });
  add('glass', B.glass(), { smooth: 0.95, f0: 0.04 });
  add('glass_pane_top', B.glassPaneTop(), { smooth: 0.95, f0: 0.04 });
  for (const k in B.WOOL_COLORS) add(k + '_wool', B.wool(B.WOOL_COLORS[k]), { smooth: 0.05 });

  // ---- functional ----
  add('furnace_front', B.furnaceFront(false), { smooth: 0.25 });
  add('furnace_front_on', B.furnaceFront(true), { smooth: 0.25 });
  add('furnace_side', B.furnaceSide(), { smooth: 0.25 });
  add('furnace_top', B.furnaceTop(), { smooth: 0.3 });
  add('tnt_top', B.tntTop(false), { smooth: 0.3 });
  add('tnt_side', B.tntSide(), { smooth: 0.3 });
  add('tnt_bottom', B.tntTop(true), { smooth: 0.3 });
  add('glowstone', B.glowstone(), { smooth: 0.4 });
  add('sea_lantern', B.seaLanternFrames(), { smooth: 0.75, f0: 0.05, frameTime: 5, emissive: 0.9 });
  add('lantern', B.lantern(), { smooth: 0.5 });
  add('torch', B.torch(false), { smooth: 0.2 });
  add('redstone_torch', B.torch(true), { smooth: 0.2 });
  add('rail', B.rail(), { smooth: 0.3 });
  add('rail_corner', B.railCorner(), { smooth: 0.3 });
  add('powered_rail', B.poweredRail(false), { smooth: 0.3 });
  add('powered_rail_on', B.poweredRail(true), { smooth: 0.3 });
  add('hay_block_top', B.hayTop(), { smooth: 0.15 });
  add('hay_block_side', B.haySide(), { smooth: 0.15 });
  add('iron_bars', B.ironBars(), { smooth: 0.45 });
  add('cobweb', B.cobweb(), { smooth: 0.3 });
  B.destroyStages().forEach((img, i) => add('destroy_stage_' + i, img, { smooth: 0.1 }));

  // ---- animated ----
  add('water_still', A.waterStill(), { smooth: 0.95, f0: 0.02, frameTime: 2 });
  add('water_flow', A.waterFlow(), { smooth: 0.92, f0: 0.02, frameTime: 1 });
  add('lava_still', A.lavaStill(), { smooth: 0.4, frameTime: 3, emissive: 1 });
  add('lava_flow', A.lavaFlow(), { smooth: 0.4, frameTime: 2, emissive: 1 });
  add('nether_portal', A.netherPortal(), { smooth: 0.9, frameTime: 1, emissive: 0.8 });
  add('fire_0', A.fire(), { smooth: 0.1, frameTime: 1, emissive: 1 });
  return out;
}
