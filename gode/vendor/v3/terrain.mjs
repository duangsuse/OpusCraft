/* gode/vendor/v3/terrain.mjs —— 生成物，勿手改（goodPG v3 生成器，96 模块打包）。
   重新生成：node gode/tools/build-v3.mjs   来源：goodPG/src/shared/world/terrain.ts + blocks/ + constants.ts
   包 sha256:7466c5c394f4be91（只对打包产物；对应供体标签不在包内） */
// goodPG/src/shared/blockModels.ts
var DIR_X = [0, 1, 0, -1];
var DIR_Z = [-1, 0, 1, 0];
var DIR_FACE = [5, 0, 4, 1];
function mbox(x0, y0, z0, x1, y1, z1, tex) {
  return { x0, y0, z0, x1, y1, z1, tex: typeof tex === "number" ? [tex, tex, tex, tex, tex, tex] : tex.slice() };
}
function rotateBoxes(boxes, dir) {
  let out = boxes;
  for (let k = 0;k < (dir & 3); k++) {
    out = out.map((b) => {
      const ax = 16 - b.z0, bx = 16 - b.z1;
      const t = b.tex;
      return {
        x0: Math.min(ax, bx),
        x1: Math.max(ax, bx),
        y0: b.y0,
        y1: b.y1,
        z0: b.x0,
        z1: b.x1,
        tex: [t[5], t[4], t[2], t[3], t[0], t[1]]
      };
    });
  }
  return out;
}
function flatBoxes(boxes) {
  const out = [];
  for (const b of boxes)
    out.push(b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16);
  return out;
}
function unionBox(flat) {
  if (flat.length === 0)
    return [0, 0, 0, 1, 1, 1];
  const u = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0;i < flat.length; i += 6) {
    for (let k = 0;k < 3; k++) {
      u[k] = Math.min(u[k], flat[i + k]);
      u[k + 3] = Math.max(u[k + 3], flat[i + 3 + k]);
    }
  }
  return u;
}
function rotateFlat(flat, dir) {
  let out = flat;
  for (let k = 0;k < (dir & 3); k++) {
    const r = [];
    for (let i = 0;i < out.length; i += 6) {
      const ax = 1 - out[i + 2], bx = 1 - out[i + 5];
      r.push(Math.min(ax, bx), out[i + 1], out[i], Math.max(ax, bx), out[i + 4], out[i + 3]);
    }
    out = r;
  }
  return out;
}
function autoUV(f, px, py, pz) {
  switch (f) {
    case 0:
      return [16 - pz, 16 - py];
    case 1:
      return [pz, 16 - py];
    case 2:
      return [px, pz];
    case 3:
      return [px, 16 - pz];
    case 4:
      return [px, 16 - py];
    default:
      return [16 - px, 16 - py];
  }
}

// goodPG/src/shared/paintings.ts
var PAINTINGS = [
  { key: "dawn", name: "黎明", w: 1, h: 1 },
  { key: "meadow", name: "草原", w: 1, h: 1 },
  { key: "lighthouse", name: "灯塔", w: 1, h: 1 },
  { key: "still_life", name: "静物画", w: 1, h: 1 },
  { key: "mountains", name: "山脉", w: 2, h: 1 },
  { key: "river", name: "河流", w: 2, h: 1 },
  { key: "cypress", name: "柏树", w: 1, h: 2 },
  { key: "castle", name: "城堡", w: 2, h: 2 }
];
function paintingCellTexture(v, cx, cy) {
  return `painting_${v.key}_${cy * v.w + cx}`;
}
var PAINTING_TEXTURES = PAINTINGS.flatMap((v) => {
  const out = [];
  for (let cy = 0;cy < v.h; cy++)
    for (let cx = 0;cx < v.w; cx++)
      out.push(paintingCellTexture(v, cx, cy));
  return out;
});
var HANGING_DEPTH = 1 / 16;

// goodPG/src/shared/textureDefs.ts
var COLOR_KEYS_65 = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black"
];
var OLD_WOOL_65 = ["white", "black", "red", "orange", "yellow", "lime", "blue", "purple"];
var OLD_TERRACOTTA_65 = ["white", "orange", "yellow", "brown", "red", "light_gray"];
var TEXTURE_DEFS = [
  { name: "stone" },
  { name: "cobblestone" },
  { name: "mossy_cobblestone" },
  { name: "stone_bricks" },
  { name: "granite" },
  { name: "diorite" },
  { name: "andesite" },
  { name: "bedrock" },
  { name: "obsidian" },
  { name: "dirt" },
  { name: "grass_top", tint: 1 },
  { name: "grass_side", tint: 2 },
  { name: "grass_side_snowy" },
  { name: "snow", sss: 0.25 },
  { name: "ice", special: 3 },
  { name: "sand" },
  { name: "gravel" },
  { name: "clay" },
  { name: "sandstone_top" },
  { name: "sandstone_side" },
  { name: "sandstone_bottom" },
  { name: "terracotta" },
  { name: "oak_log_side" },
  { name: "oak_log_top" },
  { name: "oak_planks" },
  { name: "oak_leaves", tint: 3, wave: 1, sss: 0.85, cutout: true },
  { name: "birch_log_side" },
  { name: "birch_log_top" },
  { name: "birch_planks" },
  { name: "birch_leaves", wave: 1, sss: 0.85, cutout: true },
  { name: "spruce_log_side" },
  { name: "spruce_log_top" },
  { name: "spruce_planks" },
  { name: "spruce_leaves", wave: 1, sss: 0.7, cutout: true },
  { name: "short_grass", tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: "fern", tint: 1, wave: 2, sss: 0.8, cutout: true },
  { name: "poppy", wave: 2, sss: 0.7, cutout: true },
  { name: "dandelion", wave: 2, sss: 0.7, cutout: true },
  { name: "cornflower", wave: 2, sss: 0.7, cutout: true },
  { name: "dead_bush", wave: 2, sss: 0.3, cutout: true },
  { name: "sugar_cane", sss: 0.5, cutout: true },
  { name: "red_mushroom", sss: 0.3, cutout: true },
  { name: "brown_mushroom", sss: 0.3, cutout: true },
  { name: "cactus_side", sss: 0.2 },
  { name: "cactus_top", sss: 0.2, cutout: true },
  { name: "cactus_bottom", cutout: true },
  { name: "water", special: 1 },
  { name: "lava", special: 2 },
  { name: "coal_ore" },
  { name: "iron_ore" },
  { name: "gold_ore" },
  { name: "diamond_ore" },
  { name: "lapis_ore" },
  { name: "redstone_ore" },
  { name: "torch", cutout: true },
  { name: "glowstone" },
  { name: "sea_lantern" },
  { name: "bricks" },
  { name: "glass", cutout: true },
  { name: "bookshelf" },
  { name: "crafting_table_top" },
  { name: "crafting_table_side" },
  { name: "crafting_table_front" },
  { name: "pumpkin_top" },
  { name: "pumpkin_side" },
  { name: "hay_bale_top" },
  { name: "hay_bale_side" },
  { name: "quartz_block" },
  { name: "gold_block" },
  { name: "iron_block" },
  { name: "diamond_block" },
  { name: "copper_block" },
  { name: "white_wool" },
  { name: "black_wool" },
  { name: "red_wool" },
  { name: "orange_wool" },
  { name: "yellow_wool" },
  { name: "lime_wool" },
  { name: "blue_wool" },
  { name: "purple_wool" },
  { name: "furnace_front" },
  { name: "furnace_front_lit" },
  { name: "furnace_side" },
  { name: "furnace_top" },
  { name: "chest_front" },
  { name: "chest_side" },
  { name: "chest_top" },
  { name: "oak_sapling", wave: 2, sss: 0.75, cutout: true },
  { name: "birch_sapling", wave: 2, sss: 0.75, cutout: true },
  { name: "spruce_sapling", wave: 2, sss: 0.7, cutout: true },
  { name: "destroy_0", cutout: true },
  { name: "destroy_1", cutout: true },
  { name: "destroy_2", cutout: true },
  { name: "destroy_3", cutout: true },
  { name: "destroy_4", cutout: true },
  { name: "destroy_5", cutout: true },
  { name: "destroy_6", cutout: true },
  { name: "destroy_7", cutout: true },
  { name: "destroy_8", cutout: true },
  { name: "destroy_9", cutout: true },
  { name: "oak_door_top", cutout: true },
  { name: "oak_door_bottom", cutout: true },
  { name: "birch_door_top", cutout: true },
  { name: "birch_door_bottom", cutout: true },
  { name: "spruce_door_top", cutout: true },
  { name: "spruce_door_bottom", cutout: true },
  { name: "oak_trapdoor", cutout: true },
  { name: "birch_trapdoor", cutout: true },
  { name: "spruce_trapdoor", cutout: true },
  { name: "ladder", cutout: true },
  { name: "farmland_dry" },
  { name: "farmland_wet" },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s) => ({ name: `wheat_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  ...["carrots", "potatoes", "beetroots"].flatMap((c) => [0, 1, 2, 3].map((s) => ({ name: `${c}_stage${s}`, wave: 2, sss: 0.55, cutout: true }))),
  { name: "cake_top" },
  { name: "cake_side" },
  { name: "cake_inner" },
  { name: "cake_bottom" },
  { name: "melon_side" },
  { name: "melon_top" },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((s) => ({ name: `stem_stage${s}`, wave: 2, sss: 0.5, cutout: true })),
  { name: "stem_attached", wave: 2, sss: 0.5, cutout: true },
  { name: "carved_pumpkin" },
  { name: "jack_o_lantern" },
  { name: "composter_side" },
  { name: "composter_top" },
  { name: "composter_bottom" },
  { name: "compost" },
  { name: "compost_ready" },
  { name: "chest_front_seam_right" },
  { name: "chest_front_seam_left" },
  { name: "chest_side_seam_right" },
  { name: "chest_side_seam_left" },
  ...["smoker", "blast_furnace"].flatMap((k) => [
    { name: `${k}_front` },
    { name: `${k}_front_lit` },
    { name: `${k}_side` },
    { name: `${k}_top` }
  ]),
  { name: "campfire_log_lit" },
  { name: "campfire_fire", wave: 2, cutout: true },
  { name: "campfire_embers" },
  { name: "campfire_ash" },
  { name: "stonecutter_top" },
  { name: "stonecutter_side" },
  { name: "stonecutter_bottom" },
  { name: "stonecutter_saw", cutout: true },
  ...["jungle", "acacia", "dark_oak", "cherry"].flatMap((k) => [
    { name: `${k}_log_side` },
    { name: `${k}_log_top` },
    { name: `${k}_planks` },
    k === "cherry" ? { name: `${k}_leaves`, wave: 1, sss: 0.9, cutout: true } : { name: `${k}_leaves`, tint: 3, wave: 1, sss: 0.85, cutout: true },
    { name: `${k}_sapling`, wave: 2, sss: 0.75, cutout: true },
    { name: `${k}_door_top`, cutout: true },
    { name: `${k}_door_bottom`, cutout: true },
    { name: `${k}_trapdoor`, cutout: true }
  ]),
  { name: "vine", tint: 3, wave: 1, sss: 0.8, cutout: true },
  { name: "lily_pad", sss: 0.5, cutout: true },
  { name: "mycelium_top" },
  { name: "mycelium_side" },
  { name: "red_mushroom_block" },
  { name: "brown_mushroom_block" },
  { name: "mushroom_stem" },
  { name: "mushroom_block_inside" },
  { name: "red_sand" },
  { name: "red_sandstone_top" },
  { name: "red_sandstone_side" },
  { name: "red_sandstone_bottom" },
  ...["white", "orange", "yellow", "brown", "red", "light_gray"].map((c) => ({ name: `${c}_terracotta` })),
  { name: "packed_ice" },
  ...[
    "blue_orchid",
    "allium",
    "azure_bluet",
    "red_tulip",
    "orange_tulip",
    "white_tulip",
    "pink_tulip",
    "oxeye_daisy",
    "lily_of_the_valley"
  ].map((k) => ({ name: k, wave: 2, sss: 0.7, cutout: true })),
  { name: "pink_petals", sss: 0.6, cutout: true },
  { name: "deepslate" },
  { name: "deepslate_top" },
  { name: "cobbled_deepslate" },
  { name: "tuff" },
  { name: "calcite" },
  { name: "smooth_basalt" },
  { name: "dripstone_block" },
  { name: "pointed_dripstone" },
  { name: "copper_ore" },
  { name: "emerald_ore" },
  ...["coal", "iron", "copper", "gold", "redstone", "lapis", "diamond", "emerald"].map((k) => ({ name: `deepslate_${k}_ore` })),
  { name: "emerald_block" },
  { name: "moss_block", sss: 0.3 },
  { name: "azalea", wave: 2, sss: 0.7, cutout: true },
  { name: "flowering_azalea", wave: 2, sss: 0.7, cutout: true },
  { name: "cave_vines", wave: 2, sss: 0.7, cutout: true },
  { name: "cave_vines_lit", wave: 2, sss: 0.7, cutout: true },
  { name: "amethyst_block" },
  { name: "budding_amethyst" },
  ...["small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"].map((k) => ({ name: k, sss: 0.4, cutout: true })),
  { name: "tinted_glass", special: 3 },
  { name: "spawner", cutout: true },
  { name: "cobweb", cutout: true },
  { name: "chiseled_sandstone" },
  { name: "cut_sandstone" },
  { name: "mossy_stone_bricks" },
  { name: "cracked_stone_bricks" },
  { name: "netherrack" },
  { name: "crying_obsidian" },
  ...[
    "lectern_top",
    "lectern_side",
    "lectern_front",
    "cartography_table_top",
    "cartography_table_side1",
    "cartography_table_side2",
    "fletching_table_top",
    "fletching_table_side",
    "fletching_table_front",
    "barrel_top",
    "barrel_side",
    "barrel_bottom",
    "loom_top",
    "loom_side",
    "loom_front",
    "grindstone_side",
    "grindstone_round",
    "smithing_table_top",
    "smithing_table_side",
    "smithing_table_front",
    "cauldron_side",
    "cauldron_top",
    "cauldron_inner",
    "cauldron_bottom"
  ].map((name) => ({ name })),
  { name: "turtle_egg" },
  { name: "turtle_egg_slightly_cracked" },
  { name: "turtle_egg_very_cracked" },
  ...[
    "bee_nest_top",
    "bee_nest_bottom",
    "bee_nest_side",
    "bee_nest_front",
    "bee_nest_front_honey",
    "beehive_end",
    "beehive_side",
    "beehive_front",
    "beehive_front_honey",
    "honey_block",
    "honeycomb_block"
  ].map((name) => ({ name })),
  ...["mangrove", "pale_oak"].flatMap((k) => [
    { name: `${k}_log_side` },
    { name: `${k}_log_top` },
    { name: `${k}_planks` },
    k === "mangrove" ? { name: `${k}_leaves`, tint: 3, wave: 1, sss: 0.85, cutout: true } : { name: `${k}_leaves`, wave: 1, sss: 0.8, cutout: true },
    { name: k === "mangrove" ? "mangrove_propagule" : `${k}_sapling`, wave: 2, sss: 0.75, cutout: true },
    { name: `${k}_door_top`, cutout: true },
    { name: `${k}_door_bottom`, cutout: true },
    { name: `${k}_trapdoor`, cutout: true }
  ]),
  { name: "mangrove_roots", sss: 0.2, cutout: true },
  { name: "muddy_mangrove_roots_top" },
  { name: "muddy_mangrove_roots_side" },
  { name: "bamboo_stalk", sss: 0.4, cutout: true },
  { name: "bamboo_small_leaves", sss: 0.8, cutout: true },
  { name: "bamboo_large_leaves", sss: 0.8, cutout: true },
  ...[
    "bamboo_block_side",
    "bamboo_block_top",
    "stripped_bamboo_block_side",
    "stripped_bamboo_block_top",
    "bamboo_planks",
    "bamboo_mosaic"
  ].map((name) => ({ name })),
  { name: "bamboo_door_top", cutout: true },
  { name: "bamboo_door_bottom", cutout: true },
  { name: "bamboo_trapdoor", cutout: true },
  ...["oak", "birch", "spruce", "jungle", "acacia", "dark_oak", "cherry", "mangrove", "pale_oak"].flatMap((k) => [
    { name: `stripped_${k}_log_side` },
    { name: `stripped_${k}_log_top` }
  ]),
  ...COLOR_KEYS_65.filter((c) => !OLD_WOOL_65.includes(c)).map((c) => ({ name: `${c}_wool` })),
  ...COLOR_KEYS_65.filter((c) => !OLD_TERRACOTTA_65.includes(c)).map((c) => ({ name: `${c}_terracotta` })),
  ...COLOR_KEYS_65.map((c) => ({ name: `${c}_concrete` })),
  ...COLOR_KEYS_65.map((c) => ({ name: `${c}_concrete_powder` })),
  ...COLOR_KEYS_65.map((c) => ({ name: `${c}_stained_glass`, special: 4 })),
  ...COLOR_KEYS_65.map((c) => ({ name: `${c}_glazed_terracotta` })),
  { name: "candle" },
  { name: "candle_flame" },
  ...[
    "smooth_stone",
    "smooth_stone_slab_side",
    "chiseled_stone_bricks",
    "polished_granite",
    "polished_diorite",
    "polished_andesite",
    "polished_deepslate",
    "deepslate_bricks",
    "cracked_deepslate_bricks",
    "deepslate_tiles",
    "cracked_deepslate_tiles",
    "chiseled_deepslate",
    "polished_tuff",
    "tuff_bricks",
    "chiseled_tuff",
    "chiseled_tuff_top",
    "chiseled_tuff_bricks",
    "chiseled_tuff_bricks_top",
    "cut_red_sandstone",
    "chiseled_red_sandstone",
    "mud",
    "packed_mud",
    "mud_bricks",
    "cinnabar",
    "polished_cinnabar",
    "cinnabar_bricks",
    "chiseled_cinnabar",
    "sulfur",
    "polished_sulfur",
    "sulfur_bricks",
    "chiseled_sulfur"
  ].map((name) => ({ name })),
  { name: "raw_copper_block" },
  { name: "copper_torch", cutout: true },
  ...["", "exposed_", "weathered_", "oxidized_"].flatMap((p) => [
    ...p ? [{ name: `${p}copper` }] : [],
    { name: `${p}cut_copper` },
    { name: `${p}chiseled_copper` },
    ...["copper_grate", "copper_door_top", "copper_door_bottom", "copper_trapdoor", "copper_bars", "copper_chain", "copper_lantern"].map((n) => ({ name: p + n, cutout: true }))
  ]),
  ...[
    "flower_pot",
    "flower_pot_top",
    "flower_pot_soil",
    "lantern",
    "lantern_top",
    "chain",
    "chain_h",
    "iron_bars",
    "scaffolding_top",
    "scaffolding_side"
  ].map((name) => ({ name, cutout: true })),
  ...["bell", "decorated_pot_side", "decorated_pot_top", "item_frame", ...PAINTING_TEXTURES].map((name) => ({ name })),
  ...["tube", "brain", "bubble", "fire", "horn"].flatMap((c) => ["", "dead_"].flatMap((d) => [
    { name: `${d}${c}_coral_block` },
    { name: `${d}${c}_coral`, wave: 2, sss: 0.4, cutout: true },
    { name: `${d}${c}_coral_fan`, wave: 2, sss: 0.4, cutout: true }
  ])),
  { name: "kelp", wave: 2, sss: 0.6, cutout: true },
  { name: "kelp_plant", sss: 0.6, cutout: true },
  { name: "dried_kelp_top" },
  { name: "dried_kelp_side" },
  { name: "seagrass", wave: 2, sss: 0.7, cutout: true },
  { name: "tall_seagrass_bottom", sss: 0.7, cutout: true },
  { name: "tall_seagrass_top", wave: 2, sss: 0.7, cutout: true },
  { name: "sea_pickle", sss: 0.5 },
  { name: "prismarine" },
  { name: "prismarine_bricks" },
  { name: "dark_prismarine" },
  { name: "sponge" },
  { name: "wet_sponge" },
  ...["sunflower", "lilac", "rose_bush", "peony", "pitcher_plant", "small_dripleaf"].flatMap((k) => [
    { name: `${k}_bottom`, sss: 0.7, cutout: true },
    { name: `${k}_top`, wave: 2, sss: 0.7, cutout: true }
  ]),
  ...["tall_grass", "large_fern"].flatMap((k) => [
    { name: `${k}_bottom`, tint: 1, sss: 0.8, cutout: true },
    { name: `${k}_top`, tint: 1, wave: 2, sss: 0.8, cutout: true }
  ]),
  { name: "torchflower", wave: 2, sss: 0.7, cutout: true },
  ...[0, 1, 2, 3].map((s) => ({ name: `sweet_berry_bush_stage${s}`, wave: 2, sss: 0.7, cutout: true })),
  { name: "azalea_leaves", wave: 1, sss: 0.8, cutout: true },
  { name: "flowering_azalea_leaves", wave: 1, sss: 0.8, cutout: true },
  { name: "big_dripleaf_top", sss: 0.6, cutout: true },
  { name: "big_dripleaf_stem", sss: 0.6, cutout: true },
  { name: "glow_lichen", sss: 0.4, cutout: true },
  { name: "hanging_roots", sss: 0.5, cutout: true },
  { name: "spore_blossom", sss: 0.6, cutout: true },
  { name: "chiseled_bookshelf_empty" },
  { name: "chiseled_bookshelf_occupied" },
  { name: "chiseled_bookshelf_top" },
  { name: "chiseled_bookshelf_side" },
  { name: "lectern_book" },
  ...[
    "raw_iron_block",
    "raw_gold_block",
    "coal_block",
    "lapis_block",
    "bone_block_side",
    "bone_block_top",
    "blue_ice",
    "coarse_dirt",
    "podzol_top",
    "podzol_side",
    "rooted_dirt",
    "dirt_path_top",
    "dirt_path_side"
  ].map((name) => ({ name })),
  { name: "powder_snow", sss: 0.3 },
  { name: "slime_block", special: 4, sss: 0.3 },
  { name: "frogspawn", sss: 0.4, cutout: true },
  ...["zombie", "skeleton", "creeper", "player", "wither_skeleton", "piglin", "dragon"].flatMap((k) => ["right", "left", "top", "bottom", "back", "front"].map((f) => ({ name: `${k}_head_${f}` }))),
  { name: "piglin_head_snout" },
  { name: "piglin_head_ear" },
  { name: "dragon_head_snout" },
  { name: "dragon_head_horn" },
  { name: "dragon_head_nostril" },
  { name: "jukebox_side" },
  { name: "jukebox_top" },
  { name: "jukebox_bottom" },
  { name: "glow_item_frame" },
  { name: "fire", special: 5, cutout: true },
  { name: "conduit_closed" },
  { name: "conduit_open" },
  { name: "brewing_stand_base" },
  { name: "brewing_stand_rod" },
  { name: "brewing_stand_bottle" },
  { name: "brewing_stand_bottle_top" },
  ...[
    "rail",
    "rail_corner",
    "powered_rail",
    "powered_rail_on",
    "detector_rail",
    "detector_rail_on",
    "activator_rail",
    "activator_rail_on"
  ].map((name) => ({ name, cutout: true })),
  { name: "enchanting_table_top" },
  { name: "enchanting_table_side" },
  { name: "enchanting_table_bottom" },
  { name: "anvil" },
  { name: "anvil_top" },
  { name: "chipped_anvil_top" },
  { name: "damaged_anvil_top" },
  ...[0, 1, 2, 3].map((a) => ({ name: `frosted_ice_${a}`, special: 3 })),
  { name: "enchanting_book_cover" },
  { name: "enchanting_book_pages" },
  ...Array.from({ length: 16 }, (_, p) => ({ name: `redstone_dust_${p}`, cutout: true })),
  { name: "redstone_torch", cutout: true },
  { name: "redstone_torch_off", cutout: true },
  ...["redstone_torch_side_on", "redstone_torch_side_off", "redstone_torch_top_on", "redstone_torch_top_off"].map((name) => ({ name })),
  ...["repeater", "comparator"].flatMap((k) => ["off", "on"].flatMap((m) => [0, 1, 2, 3].map((f) => ({ name: `${k}_${m}_${f}` })))),
  ...[
    "lever_handle",
    "redstone_block",
    "redstone_lamp",
    "redstone_lamp_on",
    "daylight_detector_top",
    "daylight_detector_inverted_top",
    "daylight_detector_side",
    "target_side",
    "target_top",
    "note_block",
    "tripwire",
    "trapped_chest_front",
    "trapped_chest_front_seam_left",
    "trapped_chest_front_seam_right",
    "lightning_rod_on",
    "iron_door_top",
    "iron_door_bottom",
    "iron_trapdoor"
  ].map((name) => ({ name })),
  ...["", "exposed_", "weathered_", "oxidized_"].flatMap((p) => ["lightning_rod", "copper_bulb", "copper_bulb_lit"].map((k) => ({ name: p + k }))),
  ...[
    "piston_top",
    "piston_top_sticky",
    "piston_bottom",
    "piston_inner",
    "observer_front",
    "observer_side",
    "observer_back",
    "observer_back_on",
    "hopper_outside",
    "hopper_inside",
    "hopper_top",
    "dispenser_front",
    "dispenser_front_vertical",
    "dropper_front",
    "dropper_front_vertical",
    "tnt_side",
    "tnt_top",
    "tnt_bottom"
  ].map((name) => ({ name })),
  ...["piston_side", "observer_top"].flatMap((k) => ["", "_r1", "_r2", "_r3"].map((r) => ({ name: k + r }))),
  ...[
    "sculk",
    "sculk_catalyst_top",
    "sculk_catalyst_side",
    "sculk_catalyst_bottom",
    "sculk_catalyst_top_bloom",
    "sculk_catalyst_side_bloom",
    "sculk_sensor_top",
    "sculk_sensor_side",
    "sculk_sensor_bottom",
    "calibrated_sculk_sensor_top",
    "calibrated_sculk_sensor_side",
    "calibrated_sculk_sensor_input_side",
    "sculk_shrieker_top",
    "sculk_shrieker_side",
    "sculk_shrieker_bottom",
    "sculk_shrieker_inner_top",
    "sculk_shrieker_can_summon_inner_top",
    "reinforced_deepslate_top",
    "reinforced_deepslate_side",
    "reinforced_deepslate_bottom",
    "soul_sand",
    "soul_soil",
    "soul_lantern"
  ].map((name) => ({ name })),
  ...[
    "sculk_vein",
    "sculk_sensor_tendril",
    "sculk_sensor_tendril_active",
    "calibrated_sculk_sensor_amethyst",
    "calibrated_sculk_sensor_amethyst_active",
    "soul_torch"
  ].map((name) => ({ name, cutout: true })),
  { name: "soul_fire", special: 5, cutout: true },
  { name: "nether_portal", special: 4 },
  ...["nether_quartz_ore", "nether_gold_ore", "magma"].map((name) => ({ name })),
  ...["crimson", "warped"].flatMap((k) => [
    ...[
      `${k}_stem_side`,
      `${k}_stem_top`,
      `stripped_${k}_stem_side`,
      `stripped_${k}_stem_top`,
      `${k}_planks`,
      `${k}_nylium`,
      `${k}_nylium_side`
    ].map((name) => ({ name })),
    ...[`${k}_door_top`, `${k}_door_bottom`, `${k}_trapdoor`].map((name) => ({ name, cutout: true })),
    ...[`${k}_fungus`, `${k}_roots`].map((name) => ({ name, cutout: true, wave: 2, sss: 0.4 }))
  ]),
  { name: "nether_sprouts", cutout: true, wave: 2, sss: 0.4 },
  ...["weeping_vines", "weeping_vines_plant", "twisting_vines", "twisting_vines_plant"].map((name) => ({ name, cutout: true, sss: 0.4 })),
  ...[
    "nether_wart_block",
    "warped_wart_block",
    "shroomlight",
    "basalt_top",
    "basalt_side",
    "polished_basalt_top",
    "polished_basalt_side",
    "blackstone",
    "blackstone_top",
    "polished_blackstone",
    "polished_blackstone_bricks",
    "cracked_polished_blackstone_bricks",
    "chiseled_polished_blackstone",
    "gilded_blackstone",
    "nether_bricks",
    "cracked_nether_bricks",
    "chiseled_nether_bricks",
    "red_nether_bricks"
  ].map((name) => ({ name })),
  ...[0, 1, 2].map((s) => ({ name: `nether_wart_stage${s}`, sss: 0.35, cutout: true })),
  ...[
    "ancient_debris_side",
    "ancient_debris_top",
    "netherite_block",
    "quartz_bricks",
    "quartz_pillar",
    "quartz_pillar_top",
    "chiseled_quartz_block",
    "chiseled_quartz_block_top",
    "smooth_quartz",
    "lodestone_top",
    "lodestone_side",
    "soul_campfire_log_lit",
    "soul_campfire_embers",
    "respawn_anchor_top_off",
    "respawn_anchor_top",
    "respawn_anchor_bottom",
    "beacon",
    ...[0, 1, 2, 3, 4].map((c) => `respawn_anchor_side${c}`)
  ].map((name) => ({ name })),
  { name: "soul_campfire_fire", wave: 2, cutout: true },
  ...["end_stone", "end_stone_bricks", "purpur_block", "purpur_pillar", "purpur_pillar_top", "end_rod"].map((name) => ({ name })),
  ...["chorus_plant", "chorus_flower", "chorus_flower_dead"].map((name) => ({ name, sss: 0.3 })),
  ...["end_portal_frame_top", "end_portal_frame_side", "end_portal_frame_eye"].map((name) => ({ name })),
  { name: "end_portal", special: 6 },
  { name: "dragon_egg" },
  ...[
    "",
    "white_",
    "orange_",
    "magenta_",
    "light_blue_",
    "yellow_",
    "lime_",
    "pink_",
    "gray_",
    "light_gray_",
    "cyan_",
    "purple_",
    "blue_",
    "brown_",
    "green_",
    "red_",
    "black_"
  ].flatMap((c) => ["top", "lid", "base", "bottom"].map((p) => ({ name: `${c}shulker_box_${p}` }))),
  ...["ender_chest_side", "ender_chest_top", "ender_chest_front", "ender_chest_lock"].map((name) => ({ name })),
  ...["ochre", "verdant", "pearlescent"].flatMap((k) => ["top", "side"].map((p) => ({ name: `${k}_froglight_${p}`, sss: 0.4 }))),
  { name: "wither_rose", wave: 2, sss: 0.4, cutout: true }
];
var TEXTURE_NAMES = TEXTURE_DEFS.map((t) => t.name);
var TEXTURE_COUNT = TEXTURE_DEFS.length;
var layerByName = new Map;
TEXTURE_DEFS.forEach((t, i) => layerByName.set(t.name, i));
function textureLayer(name) {
  const layer = layerByName.get(name);
  if (layer === undefined)
    throw new Error("Textura desconocida: " + name);
  return layer;
}

// goodPG/src/shared/constants.ts
var CHUNK_SIZE = 16;
var MIN_Y = -64;
var MAX_Y = 320;
var WORLD_HEIGHT = MAX_Y - MIN_Y;
var VOID_Y = MIN_Y - 64;
var CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
var CHUNK_VOLUME = CHUNK_AREA * WORLD_HEIGHT;
var SEA_LEVEL = 63;
var MAX_BLOCK_ID = 8192;
var FIRST_EXTENDED_BLOCK = 1024;
function blockIndex(x, y, z) {
  return y - MIN_Y << 8 | z << 4 | x;
}
function hash2(x, z, seed) {
  let h = Math.imul(x | 0, 668265261) ^ Math.imul(z | 0, 374761393) ^ Math.imul(seed | 0, 2654435761);
  h = Math.imul(h ^ h >>> 15, 2246822507);
  h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^ h >>> 16) >>> 0;
}
function hash3(x, y, z, seed) {
  return hash2(x ^ Math.imul(y | 0, 1013904242), z, seed);
}
function hashToFloat(h) {
  return h / 4294967296;
}

// goodPG/src/shared/blocks/registry.ts
var R_NONE = 0;
var R_CUBE = 1;
var R_CUTOUT = 2;
var R_CROSS = 3;
var R_WATER = 4;
var R_TRANSLUCENT = 5;
var R_TORCH = 6;
var R_CACTUS = 7;
var R_LAVA = 8;
var R_MODEL = 9;
var R_CROP = 10;
var R_RAIL = 21;
var defs = [];
function def(id, key, name, o) {
  const side = o.side ?? o.all ?? "stone";
  const top = o.top ?? o.all ?? side;
  const bottom = o.bottom ?? o.top ?? o.all ?? side;
  const tex = o.tex ?? [side, side, top, bottom, side, side];
  const render = o.render ?? R_CUBE;
  const opaque = o.opaque ?? render === R_CUBE;
  defs[id] = {
    id,
    key,
    name,
    render,
    solid: o.solid ?? true,
    opaque,
    lightOpacity: o.lightOpacity ?? (opaque ? 15 : 0),
    emission: o.emission ?? 0,
    tex,
    sound: o.sound ?? "stone",
    replaceable: o.replaceable ?? false,
    breakable: o.breakable ?? true,
    category: o.category === undefined ? "construccion" : o.category,
    hardness: o.hardness ?? 1.5,
    tool: o.tool === undefined ? null : o.tool,
    tier: o.tier ?? 0,
    fluid: o.fluid ?? 0,
    level: o.level ?? 0,
    model: o.model,
    shape: o.shape,
    itemModel: o.itemModel,
    collision: o.collision,
    selection: o.selection,
    base: o.base,
    climbable: o.climbable,
    wall: o.wall,
    walkThrough: o.walkThrough,
    flatItem: o.flatItem,
    noItem: o.noItem,
    support: o.support,
    texRot: o.texRot
  };
}
var FAMILY_OF = [];
var nextFamilyId = FIRST_EXTENDED_BLOCK;
function decodeState(props, index) {
  const st = {};
  let r = index;
  for (const [name, n] of props) {
    st[name] = r % n;
    r = Math.floor(r / n);
  }
  return st;
}
function family(key, name, props, make) {
  const count = props.reduce((a, [, n]) => a * n, 1);
  const base = nextFamilyId;
  const fam = { key, base, props, count };
  for (let i = 0;i < count; i++) {
    const o = make(decodeState(props, i));
    const category = i === 0 ? o.category === undefined ? "construccion" : o.category : null;
    def(base + i, i === 0 ? key : `${key}_${i}`, name, { ...o, category, base: o.base ?? base });
    FAMILY_OF[base + i] = fam;
  }
  nextFamilyId += count;
  return base;
}
function familyStates(id) {
  const fam = FAMILY_OF[id];
  if (!fam)
    return [id];
  return Array.from({ length: fam.count }, (_, i) => fam.base + i);
}
function stateOf(base, st) {
  const fam = FAMILY_OF[base];
  if (!fam)
    return base;
  let idx = 0, mul = 1;
  for (const [name, n] of fam.props) {
    idx += ((st[name] ?? 0) % n + n) % n * mul;
    mul *= n;
  }
  return fam.base + idx;
}
function stateProps(id) {
  const fam = FAMILY_OF[id];
  return fam ? decodeState(fam.props, id - fam.base) : null;
}
function familyBase(id) {
  return FAMILY_OF[id]?.base ?? id;
}
var L = (name) => textureLayer(name);
var texOf = (block) => defs[block].tex.map(L);
var BLOCK_RENDER = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_SOLID = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_OPAQUE = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_AO = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_LIGHT_OPACITY = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_EMISSION = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_SOUL_LIGHT = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_REPLACEABLE = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_TEX = new Uint16Array(MAX_BLOCK_ID * 6);
var BLOCK_TEXROT = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_FLUID = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_FLUID_LEVEL = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_HARDNESS = new Float32Array(MAX_BLOCK_ID);
var BLOCK_BASE = new Uint16Array(MAX_BLOCK_ID);
var BLOCK_COLLIDE = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_CLIMB = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_WALKTHROUGH = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_WALL = new Int8Array(MAX_BLOCK_ID);
var BLOCK_MODEL_CUTOUT = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_MODEL_TRANSLUCENT = new Uint8Array(MAX_BLOCK_ID);
var STATIC_COLLISION = [];
var KIND_DOOR = 1;
var KIND_TRAPDOOR = 2;
var KIND_GATE = 3;
var KIND_BED = 4;
var KIND_SLAB = 5;
var KIND_STAIRS = 6;
var KIND_CROP = 7;
var KIND_CAKE = 8;
var KIND_FARMLAND = 9;
var KIND_FENCE = 10;
var KINDS = {
  door: KIND_DOOR,
  trapdoor: KIND_TRAPDOOR,
  gate: KIND_GATE,
  bed: KIND_BED,
  slab: KIND_SLAB,
  stairs: KIND_STAIRS,
  crop: KIND_CROP,
  cake: KIND_CAKE,
  farmland: KIND_FARMLAND,
  fence: KIND_FENCE
};
var BLOCK_KIND = new Uint8Array(MAX_BLOCK_ID);
var FAMILY_KINDS = new Map;
var BLOCK_NEEDS_SUPPORT = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_TALL = new Uint8Array(MAX_BLOCK_ID);
function finalizeBlocks(kindOf) {
  for (const b of defs) {
    if (!b)
      continue;
    const k = kindOf.get(familyBase(b.id)) ?? FAMILY_KINDS.get(familyBase(b.id)) ?? 0;
    BLOCK_KIND[b.id] = k;
    BLOCK_TALL[b.id] = k === KIND_FENCE || k === KIND_GATE && b.solid ? 1 : 0;
    BLOCK_NEEDS_SUPPORT[b.id] = k === KIND_DOOR || k === KIND_BED || k === KIND_CROP || k === KIND_CAKE || b.wall !== undefined && b.wall >= 0 || !!b.support ? 1 : 0;
  }
  for (const b of defs) {
    if (!b)
      continue;
    BLOCK_FLUID[b.id] = b.fluid;
    BLOCK_FLUID_LEVEL[b.id] = b.level;
    BLOCK_HARDNESS[b.id] = b.hardness;
    BLOCK_RENDER[b.id] = b.render;
    BLOCK_SOLID[b.id] = b.solid ? 1 : 0;
    BLOCK_OPAQUE[b.id] = b.opaque ? 1 : 0;
    BLOCK_AO[b.id] = b.opaque || b.render === R_CUTOUT && b.lightOpacity > 0 ? 1 : 0;
    BLOCK_LIGHT_OPACITY[b.id] = b.lightOpacity;
    BLOCK_EMISSION[b.id] = b.emission;
    BLOCK_SOUL_LIGHT[b.id] = b.emission > 0 && b.key.startsWith("soul_") ? 1 : 0;
    BLOCK_REPLACEABLE[b.id] = b.replaceable ? 1 : 0;
    for (let f = 0;f < 6; f++)
      BLOCK_TEX[b.id * 6 + f] = b.render === R_NONE ? 0 : textureLayer(b.tex[f]);
    BLOCK_TEXROT[b.id] = b.texRot ?? 0;
    BLOCK_BASE[b.id] = b.base ?? b.id;
    BLOCK_COLLIDE[b.id] = !b.solid ? 0 : b.render === R_MODEL || b.collision ? 2 : 1;
    BLOCK_CLIMB[b.id] = b.climbable ? 1 : 0;
    BLOCK_WALKTHROUGH[b.id] = b.walkThrough ? 1 : 0;
    BLOCK_WALL[b.id] = b.wall ?? -1;
    const boxes = b.model ?? b.itemModel ?? [];
    BLOCK_MODEL_CUTOUT[b.id] = boxes.some((m) => m.tex.some((l) => l >= 0 && !!TEXTURE_DEFS[l]?.cutout)) || b.render === R_MODEL && b.tex.some((n) => !!TEXTURE_DEFS[textureLayer(n)]?.cutout) ? 1 : 0;
    BLOCK_MODEL_TRANSLUCENT[b.id] = b.render === R_MODEL && b.tex.some((n) => [3, 4].includes(TEXTURE_DEFS[textureLayer(n)]?.special ?? 0)) ? 1 : 0;
    if (b.render === R_MODEL && !b.shape)
      STATIC_COLLISION[b.id] = typeof b.collision === "object" ? b.collision : flatBoxes(b.model ?? []);
  }
}
function isTrapdoor(id) {
  return BLOCK_KIND[id] === KIND_TRAPDOOR;
}
function isFenceGate(id) {
  return BLOCK_KIND[id] === KIND_GATE;
}
function isSlab(id) {
  return BLOCK_KIND[id] === KIND_SLAB;
}
function isFarmland(id) {
  return BLOCK_KIND[id] === KIND_FARMLAND;
}
function isStairs(id) {
  return BLOCK_KIND[id] === KIND_STAIRS;
}

// goodPG/src/shared/blocks/classic.ts
var AIR = 0;
var STONE = 1;
var GRASS = 2;
var DIRT = 3;
var COBBLESTONE = 4;
var OAK_PLANKS = 5;
var BEDROCK = 6;
var SAND = 7;
var GRAVEL = 8;
var OAK_LOG = 9;
var OAK_LEAVES = 10;
var GLASS = 11;
var WATER = 12;
var COAL_ORE = 13;
var IRON_ORE = 14;
var GOLD_ORE = 15;
var DIAMOND_ORE = 16;
var LAPIS_ORE = 17;
var REDSTONE_ORE = 18;
var SANDSTONE = 19;
var SNOWY_GRASS = 20;
var SNOW_BLOCK = 21;
var ICE = 22;
var CLAY = 23;
var CACTUS = 24;
var BIRCH_LOG = 25;
var BIRCH_LEAVES = 26;
var SPRUCE_LOG = 27;
var SPRUCE_LEAVES = 28;
var SHORT_GRASS = 29;
var FERN = 30;
var POPPY = 31;
var DANDELION = 32;
var CORNFLOWER = 33;
var DEAD_BUSH = 34;
var SUGAR_CANE = 35;
var RED_MUSHROOM = 36;
var BROWN_MUSHROOM = 37;
var TORCH = 38;
var GLOWSTONE = 39;
var SEA_LANTERN = 40;
var LAVA = 41;
var BRICKS = 42;
var STONE_BRICKS = 43;
var MOSSY_COBBLESTONE = 44;
var OBSIDIAN = 45;
var BOOKSHELF = 46;
var CRAFTING_TABLE = 47;
var PUMPKIN = 48;
var HAY_BALE = 49;
var BIRCH_PLANKS = 50;
var SPRUCE_PLANKS = 51;
var GRANITE = 52;
var DIORITE = 53;
var ANDESITE = 54;
var TERRACOTTA = 55;
var QUARTZ_BLOCK = 56;
var GOLD_BLOCK = 57;
var IRON_BLOCK = 58;
var DIAMOND_BLOCK = 59;
var COPPER_BLOCK = 60;
var WHITE_WOOL = 61;
var BLACK_WOOL = 62;
var RED_WOOL = 63;
var ORANGE_WOOL = 64;
var YELLOW_WOOL = 65;
var LIME_WOOL = 66;
var BLUE_WOOL = 67;
var PURPLE_WOOL = 68;
var WATER_FLOW_1 = 69;
var WATER_FALL = 76;
var LAVA_FLOW_1 = 77;
var LAVA_FALL = 80;
var FURNACE = 81;
var FURNACE_LIT = 85;
var CHEST = 89;
var OAK_SAPLING = 93;
var BIRCH_SAPLING = 94;
var SPRUCE_SAPLING = 95;
var plant = (o) => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  replaceable: false,
  category: "naturaleza",
  ...o
});
def(AIR, "air", "空气", { render: R_NONE, solid: false, opaque: false, replaceable: true, all: "stone", category: null });
def(STONE, "stone", "石头", { all: "stone" });
def(GRASS, "grass_block", "草方块", { top: "grass_top", bottom: "dirt", side: "grass_side", sound: "grass", category: "naturaleza" });
def(DIRT, "dirt", "泥土", { all: "dirt", sound: "dirt", category: "naturaleza" });
def(COBBLESTONE, "cobblestone", "圆石", { all: "cobblestone" });
def(OAK_PLANKS, "oak_planks", "橡木木板", { all: "oak_planks", sound: "wood" });
def(BEDROCK, "bedrock", "基岩", { all: "bedrock", breakable: false, category: null });
def(SAND, "sand", "沙子", { all: "sand", sound: "sand", category: "naturaleza" });
def(GRAVEL, "gravel", "砂砾", { all: "gravel", sound: "gravel", category: "naturaleza" });
def(OAK_LOG, "oak_log", "橡木原木", { top: "oak_log_top", side: "oak_log_side", sound: "wood", category: "naturaleza" });
def(OAK_LEAVES, "oak_leaves", "橡木树叶", { all: "oak_leaves", render: R_CUTOUT, lightOpacity: 1, sound: "leaves", category: "naturaleza" });
def(GLASS, "glass", "玻璃", { all: "glass", render: R_CUTOUT, lightOpacity: 0, sound: "glass" });
def(WATER, "water", "水", { all: "water", render: R_WATER, solid: false, lightOpacity: 2, sound: "water", replaceable: true, category: "naturaleza" });
def(COAL_ORE, "coal_ore", "煤矿石", { all: "coal_ore", category: "minerales" });
def(IRON_ORE, "iron_ore", "铁矿石", { all: "iron_ore", category: "minerales" });
def(GOLD_ORE, "gold_ore", "金矿石", { all: "gold_ore", category: "minerales" });
def(DIAMOND_ORE, "diamond_ore", "钻石矿石", { all: "diamond_ore", category: "minerales" });
def(LAPIS_ORE, "lapis_ore", "青金石矿石", { all: "lapis_ore", category: "minerales" });
def(REDSTONE_ORE, "redstone_ore", "红石矿石", { all: "redstone_ore", category: "minerales" });
def(SANDSTONE, "sandstone", "砂岩", { top: "sandstone_top", bottom: "sandstone_bottom", side: "sandstone_side" });
def(SNOWY_GRASS, "snowy_grass_block", "积雪草方块", { top: "snow", bottom: "dirt", side: "grass_side_snowy", sound: "snow", category: "naturaleza" });
def(SNOW_BLOCK, "snow_block", "雪块", { all: "snow", sound: "snow", category: "naturaleza" });
def(ICE, "ice", "冰", { all: "ice", render: R_TRANSLUCENT, lightOpacity: 2, sound: "glass", category: "naturaleza" });
def(CLAY, "clay", "黏土", { all: "clay", sound: "dirt", category: "naturaleza" });
def(CACTUS, "cactus", "仙人掌", { top: "cactus_top", bottom: "cactus_bottom", side: "cactus_side", render: R_CACTUS, lightOpacity: 0, sound: "wool", category: "naturaleza" });
def(BIRCH_LOG, "birch_log", "白桦原木", { top: "birch_log_top", side: "birch_log_side", sound: "wood", category: "naturaleza" });
def(BIRCH_LEAVES, "birch_leaves", "白桦树叶", { all: "birch_leaves", render: R_CUTOUT, lightOpacity: 1, sound: "leaves", category: "naturaleza" });
def(SPRUCE_LOG, "spruce_log", "云杉原木", { top: "spruce_log_top", side: "spruce_log_side", sound: "wood", category: "naturaleza" });
def(SPRUCE_LEAVES, "spruce_leaves", "云杉树叶", { all: "spruce_leaves", render: R_CUTOUT, lightOpacity: 1, sound: "leaves", category: "naturaleza" });
def(SHORT_GRASS, "short_grass", "矮草丛", plant({ all: "short_grass", replaceable: true }));
def(FERN, "fern", "蕨", plant({ all: "fern", replaceable: true }));
def(POPPY, "poppy", "虞美人", plant({ all: "poppy" }));
def(DANDELION, "dandelion", "蒲公英", plant({ all: "dandelion" }));
def(CORNFLOWER, "cornflower", "矢车菊", plant({ all: "cornflower" }));
def(DEAD_BUSH, "dead_bush", "枯萎的灌木", plant({ all: "dead_bush", replaceable: true }));
def(SUGAR_CANE, "sugar_cane", "甘蔗", plant({ all: "sugar_cane" }));
def(RED_MUSHROOM, "red_mushroom", "红色蘑菇", plant({ all: "red_mushroom" }));
def(BROWN_MUSHROOM, "brown_mushroom", "棕色蘑菇", plant({ all: "brown_mushroom" }));
def(TORCH, "torch", "火把", { all: "torch", render: R_TORCH, solid: false, lightOpacity: 0, emission: 14, sound: "wood", category: "decoracion" });
def(GLOWSTONE, "glowstone", "荧石", { all: "glowstone", emission: 15, sound: "glass", category: "decoracion" });
def(SEA_LANTERN, "sea_lantern", "海晶灯", { all: "sea_lantern", emission: 15, sound: "glass", category: "decoracion" });
def(LAVA, "lava", "熔岩", { all: "lava", render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: "lava", replaceable: true, category: "naturaleza" });
def(BRICKS, "bricks", "红砖块", { all: "bricks" });
def(STONE_BRICKS, "stone_bricks", "石砖", { all: "stone_bricks" });
def(MOSSY_COBBLESTONE, "mossy_cobblestone", "苔石", { all: "mossy_cobblestone" });
def(OBSIDIAN, "obsidian", "黑曜石", { all: "obsidian" });
def(BOOKSHELF, "bookshelf", "书架", { top: "oak_planks", side: "bookshelf", sound: "wood", category: "decoracion" });
def(CRAFTING_TABLE, "crafting_table", "工作台", {
  tex: ["crafting_table_side", "crafting_table_side", "crafting_table_top", "oak_planks", "crafting_table_front", "crafting_table_side"],
  sound: "wood",
  category: "decoracion"
});
def(PUMPKIN, "pumpkin", "南瓜", { top: "pumpkin_top", side: "pumpkin_side", sound: "wood", category: "decoracion" });
def(HAY_BALE, "hay_bale", "干草捆", { top: "hay_bale_top", side: "hay_bale_side", sound: "grass", category: "decoracion" });
def(BIRCH_PLANKS, "birch_planks", "白桦木板", { all: "birch_planks", sound: "wood" });
def(SPRUCE_PLANKS, "spruce_planks", "云杉木板", { all: "spruce_planks", sound: "wood" });
def(GRANITE, "granite", "花岗岩", { all: "granite" });
def(DIORITE, "diorite", "闪长岩", { all: "diorite" });
def(ANDESITE, "andesite", "安山岩", { all: "andesite" });
def(TERRACOTTA, "terracotta", "陶瓦", { all: "terracotta" });
def(QUARTZ_BLOCK, "quartz_block", "石英块", { all: "quartz_block" });
def(GOLD_BLOCK, "gold_block", "金块", { all: "gold_block", sound: "metal", category: "minerales" });
def(IRON_BLOCK, "iron_block", "铁块", { all: "iron_block", sound: "metal", category: "minerales" });
def(DIAMOND_BLOCK, "diamond_block", "钻石块", { all: "diamond_block", sound: "metal", category: "minerales" });
def(COPPER_BLOCK, "copper_block", "铜块", { all: "copper_block", sound: "metal", category: "minerales" });
def(WHITE_WOOL, "white_wool", "白色羊毛", { all: "white_wool", sound: "wool", category: "colores" });
def(BLACK_WOOL, "black_wool", "黑色羊毛", { all: "black_wool", sound: "wool", category: "colores" });
def(RED_WOOL, "red_wool", "红色羊毛", { all: "red_wool", sound: "wool", category: "colores" });
def(ORANGE_WOOL, "orange_wool", "橙色羊毛", { all: "orange_wool", sound: "wool", category: "colores" });
def(YELLOW_WOOL, "yellow_wool", "黄色羊毛", { all: "yellow_wool", sound: "wool", category: "colores" });
def(LIME_WOOL, "lime_wool", "黄绿色羊毛", { all: "lime_wool", sound: "wool", category: "colores" });
def(BLUE_WOOL, "blue_wool", "蓝色羊毛", { all: "blue_wool", sound: "wool", category: "colores" });
def(PURPLE_WOOL, "purple_wool", "紫色羊毛", { all: "purple_wool", sound: "wool", category: "colores" });
for (let l = 1;l <= 7; l++) {
  def(WATER_FLOW_1 + l - 1, "water_flow_" + l, "水", {
    all: "water",
    render: R_WATER,
    solid: false,
    lightOpacity: 2,
    sound: "water",
    replaceable: true,
    category: null,
    fluid: 1,
    level: l,
    hardness: -1
  });
}
def(WATER_FALL, "water_fall", "水", {
  all: "water",
  render: R_WATER,
  solid: false,
  lightOpacity: 2,
  sound: "water",
  replaceable: true,
  category: null,
  fluid: 1,
  level: 8,
  hardness: -1
});
for (let l = 1;l <= 3; l++) {
  def(LAVA_FLOW_1 + l - 1, "lava_flow_" + l, "熔岩", {
    all: "lava",
    render: R_LAVA,
    solid: false,
    opaque: false,
    lightOpacity: 15,
    emission: 15,
    sound: "lava",
    replaceable: true,
    category: null,
    fluid: 2,
    level: l * 2,
    hardness: -1
  });
}
def(LAVA_FALL, "lava_fall", "熔岩", {
  all: "lava",
  render: R_LAVA,
  solid: false,
  opaque: false,
  lightOpacity: 15,
  emission: 15,
  sound: "lava",
  replaceable: true,
  category: null,
  fluid: 2,
  level: 8,
  hardness: -1
});
defs[WATER].fluid = 1;
defs[LAVA].fluid = 2;
defs[WATER].hardness = -1;
defs[LAVA].hardness = -1;
var FACING_FACE = [5, 0, 4, 1];
function oriented(base, key, name, front, side, top, o) {
  for (let f = 0;f < 4; f++) {
    const tex = [side, side, top, top, side, side];
    tex[FACING_FACE[f]] = front;
    def(base + f, f === 0 ? key : key + "_" + f, name, { ...o, tex, category: f === 0 ? o.category ?? "decoracion" : null });
  }
}
oriented(FURNACE, "furnace", "熔炉", "furnace_front", "furnace_side", "furnace_top", { hardness: 3.5, tool: "pickaxe", tier: 1 });
oriented(FURNACE_LIT, "furnace_lit", "熔炉", "furnace_front_lit", "furnace_side", "furnace_top", {
  hardness: 3.5,
  tool: "pickaxe",
  tier: 1,
  emission: 13,
  category: null
});
for (let f = 0;f < 4; f++)
  defs[FURNACE_LIT + f].category = null;
oriented(CHEST, "chest", "箱子", "chest_front", "chest_side", "chest_top", { hardness: 2.5, tool: "axe", sound: "wood" });
def(OAK_SAPLING, "oak_sapling", "橡木树苗", plant({ all: "oak_sapling", hardness: 0 }));
def(BIRCH_SAPLING, "birch_sapling", "白桦树苗", plant({ all: "birch_sapling", hardness: 0 }));
def(SPRUCE_SAPLING, "spruce_sapling", "云杉树苗", plant({ all: "spruce_sapling", hardness: 0 }));
var MINING = {
  stone: [1.5, "pickaxe", 1],
  cobblestone: [2, "pickaxe", 1],
  mossy_cobblestone: [2, "pickaxe", 1],
  stone_bricks: [1.5, "pickaxe", 1],
  bricks: [2, "pickaxe", 1],
  granite: [1.5, "pickaxe", 1],
  diorite: [1.5, "pickaxe", 1],
  andesite: [1.5, "pickaxe", 1],
  sandstone: [0.8, "pickaxe", 1],
  terracotta: [1.25, "pickaxe", 1],
  quartz_block: [0.8, "pickaxe", 1],
  obsidian: [50, "pickaxe", 4],
  coal_ore: [3, "pickaxe", 1],
  iron_ore: [3, "pickaxe", 2],
  gold_ore: [3, "pickaxe", 3],
  diamond_ore: [3, "pickaxe", 3],
  lapis_ore: [3, "pickaxe", 2],
  redstone_ore: [3, "pickaxe", 3],
  gold_block: [3, "pickaxe", 3],
  iron_block: [5, "pickaxe", 2],
  diamond_block: [5, "pickaxe", 3],
  copper_block: [3, "pickaxe", 2],
  ice: [0.5, "pickaxe", 0],
  grass_block: [0.6, "shovel", 0],
  dirt: [0.5, "shovel", 0],
  sand: [0.5, "shovel", 0],
  gravel: [0.6, "shovel", 0],
  clay: [0.6, "shovel", 0],
  snow_block: [0.2, "shovel", 0],
  snowy_grass_block: [0.6, "shovel", 0],
  oak_log: [2, "axe", 0],
  birch_log: [2, "axe", 0],
  spruce_log: [2, "axe", 0],
  oak_planks: [2, "axe", 0],
  birch_planks: [2, "axe", 0],
  spruce_planks: [2, "axe", 0],
  bookshelf: [1.5, "axe", 0],
  crafting_table: [2.5, "axe", 0],
  pumpkin: [1, "axe", 0],
  oak_leaves: [0.2, null, 0],
  birch_leaves: [0.2, null, 0],
  spruce_leaves: [0.2, null, 0],
  glass: [0.3, null, 0],
  glowstone: [0.3, null, 0],
  sea_lantern: [0.3, null, 0],
  hay_bale: [0.5, null, 0],
  cactus: [0.4, null, 0],
  white_wool: [0.8, null, 0],
  black_wool: [0.8, null, 0],
  red_wool: [0.8, null, 0],
  orange_wool: [0.8, null, 0],
  yellow_wool: [0.8, null, 0],
  lime_wool: [0.8, null, 0],
  blue_wool: [0.8, null, 0],
  purple_wool: [0.8, null, 0],
  torch: [0, null, 0],
  short_grass: [0, null, 0],
  fern: [0, null, 0],
  poppy: [0, null, 0],
  dandelion: [0, null, 0],
  cornflower: [0, null, 0],
  dead_bush: [0, null, 0],
  sugar_cane: [0, null, 0],
  red_mushroom: [0, null, 0],
  brown_mushroom: [0, null, 0],
  bedrock: [-1, null, 0],
  air: [0, null, 0]
};
for (const [key, [h, tool, tier]] of Object.entries(MINING)) {
  const b = defs.find((d) => d && d.key === key);
  if (!b)
    throw new Error("MINING 中有未知方块：" + key);
  b.hardness = h;
  b.tool = tool;
  b.tier = tier;
}
for (let f = 0;f < 4; f++) {
  defs[FURNACE + f].base = FURNACE;
  defs[FURNACE_LIT + f].base = FURNACE;
  defs[CHEST + f].base = CHEST;
}

// goodPG/src/shared/blocks/building.ts
var MATERIALS = [
  { key: "oak", name: "橡木", block: OAK_PLANKS, hardness: 2, tool: "axe", tier: 0, sound: "wood" },
  { key: "birch", name: "白桦木", block: BIRCH_PLANKS, hardness: 2, tool: "axe", tier: 0, sound: "wood" },
  { key: "spruce", name: "云杉木", block: SPRUCE_PLANKS, hardness: 2, tool: "axe", tier: 0, sound: "wood" },
  { key: "cobblestone", name: "圆石", block: COBBLESTONE, hardness: 2, tool: "pickaxe", tier: 1, sound: "stone" },
  { key: "stone", name: "石头", block: STONE, hardness: 1.5, tool: "pickaxe", tier: 1, sound: "stone" },
  { key: "stone_brick", name: "石砖", block: STONE_BRICKS, hardness: 1.5, tool: "pickaxe", tier: 1, sound: "stone" },
  { key: "brick", name: "红砖", block: BRICKS, hardness: 2, tool: "pickaxe", tier: 1, sound: "stone" },
  { key: "sandstone", name: "砂岩", block: SANDSTONE, hardness: 0.8, tool: "pickaxe", tier: 1, sound: "stone" }
];
var WOODS = MATERIALS.slice(0, 3);
var matOpts = (m) => ({ hardness: m.hardness, tool: m.tool, tier: m.tier, sound: m.sound, tex: defs[m.block].tex });
var SLABS = {};
var STAIRS = {};
function addMaterialShapes(m) {
  if (!MATERIALS.includes(m))
    MATERIALS.push(m);
  const t = texOf(m.block);
  SLABS[m.key] = family(`${m.key}_slab`, `${m.name}台阶`, [["type", 3]], (st) => {
    if (st.type === 2)
      return { ...matOpts(m), render: R_CUBE };
    return { ...matOpts(m), render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
  });
  STAIRS[m.key] = family(`${m.key}_stairs`, `${m.name}楼梯`, [["facing", 4], ["half", 2]], (st) => {
    const boxes = st.half === 0 ? [mbox(0, 0, 0, 16, 8, 16, t), mbox(0, 8, 0, 16, 16, 8, t)] : [mbox(0, 8, 0, 16, 16, 16, t), mbox(0, 0, 0, 16, 8, 8, t)];
    return { ...matOpts(m), render: R_MODEL, model: rotateBoxes(boxes, st.facing) };
  });
}
for (const m of [...MATERIALS])
  addMaterialShapes(m);
var FENCES = {};
var FENCE_GATES = {};
var DOORS = {};
var TRAPDOORS = {};
var FENCE_IDS = new Set;
var NON_WOOD_FENCES = new Set;
function isFence(id) {
  return FENCE_IDS.has(id);
}
var GATE_BASES = new Set;
function isGate(id) {
  return GATE_BASES.has(familyBase(id));
}
function fenceConnectsTo(wooden, id) {
  return id > 0 && (FENCE_IDS.has(id) && NON_WOOD_FENCES.has(id) !== wooden || isGate(id) || BLOCK_OPAQUE[id] === 1);
}
function addFence(w, wooden = true, key = `${w.key}_fence`, name = `${w.name}栅栏`) {
  const t = texOf(w.block);
  const post = mbox(6, 0, 6, 10, 16, 10, t);
  const arm = (d) => rotateBoxes([mbox(7, 6, 0, 9, 9, 6, t), mbox(7, 12, 0, 9, 15, 6, t)], d);
  const fenceConnects = (id) => fenceConnectsTo(wooden, id);
  const fence = family(key, name, [], () => ({
    ...matOpts(w),
    render: R_MODEL,
    shape: (get) => {
      const boxes = [post];
      for (let d = 0;d < 4; d++)
        if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d])))
          boxes.push(...arm(d));
      return boxes;
    },
    itemModel: [mbox(6, 0, 0, 10, 16, 4, t), mbox(6, 0, 12, 10, 16, 16, t), mbox(7, 6, 4, 9, 9, 12, t), mbox(7, 12, 4, 9, 15, 12, t)],
    collision: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1.5, 0.625];
      for (let d = 0;d < 4; d++)
        if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d])))
          out.push(...rotateFlat([0.375, 0, 0, 0.625, 1.5, 0.375], d));
      return out;
    },
    selection: (get) => {
      const out = [0.375, 0, 0.375, 0.625, 1, 0.625];
      for (let d = 0;d < 4; d++)
        if (fenceConnects(get(DIR_X[d], 0, DIR_Z[d])))
          out.push(...rotateFlat([0.375, 0, 0, 0.625, 1, 0.375], d));
      return out;
    }
  }));
  FENCES[w.key] = fence;
  FENCE_IDS.add(fence);
  if (!wooden)
    NON_WOOD_FENCES.add(fence);
  return fence;
}
function addWoodShapes(w) {
  if (!WOODS.includes(w))
    WOODS.push(w);
  const t = texOf(w.block);
  addFence(w);
  FENCE_GATES[w.key] = family(`${w.key}_fence_gate`, `${w.name}栅栏门`, [["facing", 4], ["open", 2]], (st) => {
    const closed = [
      mbox(0, 5, 7, 2, 16, 9, t),
      mbox(14, 5, 7, 16, 16, 9, t),
      mbox(2, 6, 7, 14, 9, 9, t),
      mbox(2, 12, 7, 14, 15, 9, t),
      mbox(6, 9, 7, 10, 12, 9, t)
    ];
    const open = [
      mbox(0, 5, 7, 2, 16, 9, t),
      mbox(14, 5, 7, 16, 16, 9, t),
      mbox(0, 6, 1, 2, 15, 3, t),
      mbox(14, 6, 1, 16, 15, 3, t),
      mbox(0, 6, 3, 2, 9, 7, t),
      mbox(0, 12, 3, 2, 15, 7, t),
      mbox(14, 6, 3, 16, 9, 7, t),
      mbox(14, 12, 3, 16, 15, 7, t)
    ];
    return {
      ...matOpts(w),
      render: R_MODEL,
      model: rotateBoxes(st.open ? open : closed, st.facing),
      solid: !st.open,
      walkThrough: st.open === 1,
      collision: st.open ? [] : rotateFlat([0, 0, 0.375, 1, 1.5, 0.625], st.facing),
      selection: rotateFlat([0, 0, 0.375, 1, 1, 0.625], st.facing)
    };
  });
  GATE_BASES.add(FENCE_GATES[w.key]);
  DOORS[w.key] = family(`${w.key}_door`, `${w.name}门`, [["facing", 4], ["half", 2], ["open", 2], ["hinge", 2]], (st) => {
    const tx = L(`${w.key}_door_${st.half ? "top" : "bottom"}`);
    const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
    const name = `${w.key}_door_bottom`;
    return {
      hardness: 3,
      tool: "axe",
      sound: "wood",
      render: R_MODEL,
      model: rotateBoxes([panel], st.facing),
      tex: [name, name, name, name, name, name],
      walkThrough: st.open === 1
    };
  });
  TRAPDOORS[w.key] = family(`${w.key}_trapdoor`, `${w.name}活板门`, [["facing", 4], ["half", 2], ["open", 2]], (st) => {
    const name = `${w.key}_trapdoor`;
    const tx = L(name);
    const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing) : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
    return { hardness: 3, tool: "axe", sound: "wood", render: R_MODEL, model: box, tex: [name, name, name, name, name, name] };
  });
}
for (const w of [...WOODS])
  addWoodShapes(w);
var LADDER = family("ladder", "梯子", [["facing", 4]], (st) => {
  const tl = L("ladder");
  return {
    render: R_MODEL,
    hardness: 0.4,
    tool: "axe",
    sound: "wood",
    all: "ladder",
    category: "decoracion",
    model: rotateBoxes([mbox(0, 0, 15, 16, 16, 16, [-1, -1, -1, -1, tl, tl])], st.facing),
    collision: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    selection: rotateFlat([0, 0, 13 / 16, 1, 1, 1], st.facing),
    climbable: true,
    wall: st.facing,
    flatItem: "ladder"
  };
});
var PANE_IDS = new Set;
function paneConnects(id) {
  return id > 0 && (PANE_IDS.has(id) || id === GLASS || BLOCK_OPAQUE[id] === 1);
}
var GLASS_PANE = family("glass_pane", "玻璃板", [], () => {
  const g = L("glass");
  const arm = (d) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, g)], d);
  const flat = (d) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
  return {
    render: R_MODEL,
    hardness: 0.3,
    sound: "glass",
    all: "glass",
    flatItem: "glass",
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, g)];
      for (let d = 0;d < 4; d++)
        if (paneConnects(get(DIR_X[d], 0, DIR_Z[d])))
          boxes.push(...arm(d));
      return boxes;
    },
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0;d < 4; d++)
        if (paneConnects(get(DIR_X[d], 0, DIR_Z[d])))
          out.push(...flat(d));
      return out;
    }
  };
});
PANE_IDS.add(GLASS_PANE);
var WALL_TORCH = family("wall_torch", "火把", [["facing", 4]], (st) => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: 14,
  sound: "wood",
  all: "torch",
  hardness: 0,
  category: null,
  wall: st.facing,
  base: TORCH,
  selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing)
}));
var RED_BED = family("red_bed", "红色床", [["facing", 4], ["part", 2]], (st) => {
  const red = L("red_wool"), white = L("white_wool"), wood = L("oak_planks");
  const mattress = mbox(0, 3, 0, 16, 9, 16, [red, red, red, wood, red, red]);
  const boxes = st.part === 0 ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)] : [mattress, mbox(1, 9, 1, 15, 11, 7, white), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
  return {
    render: R_MODEL,
    hardness: 0.2,
    sound: "wool",
    all: "red_wool",
    category: "decoracion",
    model: rotateBoxes(boxes, st.facing),
    collision: [0, 0, 0, 1, 9 / 16, 1]
  };
});

// goodPG/src/shared/blocks/farm.ts
var FARMLAND = family("farmland", "耕地", [["moist", 2]], (st) => {
  const dirt = L("dirt"), top = L(st.moist ? "farmland_wet" : "farmland_dry");
  return {
    render: R_MODEL,
    hardness: 0.6,
    tool: "shovel",
    sound: "dirt",
    category: null,
    noItem: true,
    top: st.moist ? "farmland_wet" : "farmland_dry",
    side: "dirt",
    bottom: "dirt",
    model: [mbox(0, 0, 0, 16, 15, 16, [dirt, dirt, top, dirt, dirt, dirt])]
  };
});
function crop(key, name, ages, tex, h) {
  return family(key, name, [["age", ages]], (st) => ({
    render: R_CROP,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    sound: "grass",
    hardness: 0,
    category: null,
    noItem: true,
    all: tex(st.age),
    selection: [0, 0, 0, 1, h(st.age) / 16, 1]
  }));
}
var quarter = (age) => age < 2 ? 0 : age < 4 ? 1 : age < 7 ? 2 : 3;
var WHEAT_CROP = crop("wheat_crop", "小麦", 8, (a) => `wheat_stage${a}`, (a) => 2 + a * 2);
var CARROTS = crop("carrots", "胡萝卜", 8, (a) => `carrots_stage${quarter(a)}`, (a) => 2 + a);
var POTATOES = crop("potatoes", "马铃薯", 8, (a) => `potatoes_stage${quarter(a)}`, (a) => 2 + a);
var BEETROOTS = crop("beetroots", "甜菜根", 4, (a) => `beetroots_stage${a}`, (a) => 2 + a * 2);
var CROP_MAX_AGE = { [WHEAT_CROP]: 7, [CARROTS]: 7, [POTATOES]: 7, [BEETROOTS]: 3 };
var CAKE = family("cake", "蛋糕", [["bites", 7]], (st) => {
  const top = L("cake_top"), side = L("cake_side"), bottom = L("cake_bottom"), inner = L("cake_inner");
  return {
    render: R_MODEL,
    hardness: 0.5,
    sound: "wool",
    category: "decoracion",
    top: "cake_top",
    side: "cake_side",
    bottom: "cake_bottom",
    model: [mbox(1 + st.bites * 2, 0, 1, 15, 8, 15, [side, st.bites ? inner : side, top, bottom, side, side])]
  };
});
var MELON = family("melon", "西瓜", [], () => ({
  top: "melon_top",
  side: "melon_side",
  hardness: 1,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
function stem(key, name) {
  return family(key, name, [["age", 8]], (st) => ({
    render: R_CROSS,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    sound: "grass",
    hardness: 0,
    category: null,
    noItem: true,
    all: `stem_stage${st.age}`,
    selection: [0.375, 0, 0.375, 0.625, (st.age * 2 + 2) / 16, 0.625]
  }));
}
function attachedStem(key, name) {
  return family(key, name, [["facing", 4]], (st) => {
    const l = L("stem_attached");
    return {
      render: R_MODEL,
      solid: false,
      opaque: false,
      lightOpacity: 0,
      sound: "grass",
      hardness: 0,
      category: null,
      noItem: true,
      all: "stem_attached",
      selection: [0.375, 0, 0.375, 0.625, 0.625, 0.625],
      model: rotateBoxes([mbox(8, -1, 0, 8, 15, 16, [l, l, -1, -1, -1, -1])], st.facing)
    };
  });
}
var PUMPKIN_STEM = stem("pumpkin_stem", "南瓜茎");
var MELON_STEM = stem("melon_stem", "西瓜茎");
var ATTACHED_PUMPKIN_STEM = attachedStem("attached_pumpkin_stem", "南瓜茎");
var ATTACHED_MELON_STEM = attachedStem("attached_melon_stem", "西瓜茎");
function facingCube(key, name, front, o) {
  return family(key, name, [["facing", 4]], (st) => {
    const tex = ["pumpkin_side", "pumpkin_side", "pumpkin_top", "pumpkin_top", "pumpkin_side", "pumpkin_side"];
    tex[DIR_FACE[st.facing]] = front;
    return { hardness: 1, tool: "axe", sound: "wood", category: "decoracion", ...o, tex };
  });
}
var CARVED_PUMPKIN = facingCube("carved_pumpkin", "雕刻南瓜", "carved_pumpkin", {});
var JACK_O_LANTERN = facingCube("jack_o_lantern", "南瓜灯", "jack_o_lantern", { emission: 15 });
var COMPOSTER = family("composter", "堆肥桶", [["level", 9]], (st) => {
  const side = L("composter_side"), top = L("composter_top"), bottom = L("composter_bottom");
  const wall = [side, side, top, -1, side, side];
  const model = [
    mbox(0, 0, 0, 16, 2, 16, [side, side, bottom, bottom, side, side]),
    mbox(0, 2, 0, 2, 16, 16, wall),
    mbox(14, 2, 0, 16, 16, 16, wall),
    mbox(2, 2, 0, 14, 16, 2, wall),
    mbox(2, 2, 14, 14, 16, 16, wall)
  ];
  if (st.level > 0) {
    const h = st.level >= 7 ? 15 : 1 + st.level * 2;
    model.push(mbox(2, 2, 2, 14, h, 14, [-1, -1, L(st.level === 8 ? "compost_ready" : "compost"), -1, -1, -1]));
  }
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.6,
    tool: "axe",
    sound: "wood",
    category: "decoracion",
    side: "composter_side",
    top: "composter_top",
    bottom: "composter_bottom",
    model,
    selection: [0, 0, 0, 1, 1, 1]
  };
});
var STEM_FRUIT = {
  [PUMPKIN_STEM]: [PUMPKIN, ATTACHED_PUMPKIN_STEM],
  [MELON_STEM]: [MELON, ATTACHED_MELON_STEM]
};
Object.assign(CROP_MAX_AGE, { [PUMPKIN_STEM]: 7, [MELON_STEM]: 7, [ATTACHED_PUMPKIN_STEM]: 0, [ATTACHED_MELON_STEM]: 0 });

// goodPG/src/shared/blocks/decoration.ts
var WALL_MATERIALS = [
  { key: "cobblestone", name: "圆石", block: COBBLESTONE, hardness: 2 },
  { key: "mossy_cobblestone", name: "苔石", block: MOSSY_COBBLESTONE, hardness: 2 },
  { key: "stone_brick", name: "石砖", block: STONE_BRICKS, hardness: 1.5 },
  { key: "brick", name: "红砖", block: BRICKS, hardness: 2 },
  { key: "sandstone", name: "砂岩", block: SANDSTONE, hardness: 0.8 },
  { key: "granite", name: "花岗岩", block: GRANITE, hardness: 1.5 },
  { key: "diorite", name: "闪长岩", block: DIORITE, hardness: 1.5 },
  { key: "andesite", name: "安山岩", block: ANDESITE, hardness: 1.5 }
];
var WALLS = {};
var WALL_SOURCE = {};
var WALL_IDS = new Set;
function wallConnects(id) {
  return id > 0 && (WALL_IDS.has(id) || isFenceGate(id) || BLOCK_OPAQUE[id] === 1);
}
function addWall(m) {
  const t = texOf(m.block);
  const post = mbox(4, 0, 4, 12, 16, 12, t);
  const side = (d) => rotateBoxes([mbox(5, 0, 0, 11, 14, 8, t)], d);
  const conns = (get) => [0, 1, 2, 3].map((d) => wallConnects(get(DIR_X[d], 0, DIR_Z[d])));
  const needsPost = (c, above) => !(c[0] && c[2] && !c[1] && !c[3] || c[1] && c[3] && !c[0] && !c[2]) || above > 0;
  const wall = family(`${m.key}_wall`, `${m.name}墙`, [], () => ({
    hardness: m.hardness,
    tool: "pickaxe",
    tier: 1,
    sound: "stone",
    render: R_MODEL,
    tex: defs[m.block].tex,
    shape: (get) => {
      const c = conns(get);
      const boxes = needsPost(c, get(0, 1, 0)) ? [post] : [];
      for (let d = 0;d < 4; d++)
        if (c[d])
          boxes.push(...side(d));
      return boxes;
    },
    itemModel: [post, ...side(0), ...side(2)],
    collision: (get) => {
      const c = conns(get);
      const out = [0.25, 0, 0.25, 0.75, 1.5, 0.75];
      for (let d = 0;d < 4; d++)
        if (c[d])
          out.push(...rotateFlat([5 / 16, 0, 0, 11 / 16, 1.5, 0.5], d));
      return out;
    },
    selection: (get) => {
      const c = conns(get);
      const out = [0.25, 0, 0.25, 0.75, 1, 0.75];
      for (let d = 0;d < 4; d++)
        if (c[d])
          out.push(...rotateFlat([5 / 16, 0, 0, 11 / 16, 14 / 16, 0.5], d));
      return out;
    }
  }));
  WALLS[m.key] = wall;
  WALL_SOURCE[wall] = m.block;
  WALL_IDS.add(wall);
  return wall;
}
for (const m of WALL_MATERIALS)
  addWall(m);
var BED_COLORS = [
  ["white", "白色"],
  ["black", "黑色"],
  ["orange", "橙色"],
  ["yellow", "黄色"],
  ["lime", "黄绿色"],
  ["blue", "蓝色"],
  ["purple", "紫色"]
];
var BEDS = { red: RED_BED };
for (const [color, name] of BED_COLORS) {
  BEDS[color] = family(`${color}_bed`, `${name}床`, [["facing", 4], ["part", 2]], (st) => {
    const wool = L(`${color}_wool`), pillow = L("white_wool"), wood = L("oak_planks");
    const mattress = mbox(0, 3, 0, 16, 9, 16, [wool, wool, wool, wood, wool, wool]);
    const boxes = st.part === 0 ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)] : [mattress, mbox(1, 9, 1, 15, 11, 7, pillow), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
    return {
      render: R_MODEL,
      hardness: 0.2,
      sound: "wool",
      all: `${color}_wool`,
      category: "decoracion",
      model: rotateBoxes(boxes, st.facing),
      collision: [0, 0, 0, 1, 9 / 16, 1]
    };
  });
}
var SIGN_WOODS = [["oak", "橡木"], ["birch", "白桦木"], ["spruce", "云杉木"]];
var SIGNS = {};
var WALL_SIGNS = {};
var SIGN_WALL_OF = {};
var SIGN_BASES = new Set;
function addSign(wood, name) {
  const common = {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 1,
    tool: "axe",
    sound: "wood",
    all: `${wood}_planks`,
    category: null
  };
  SIGNS[wood] = family(`${wood}_sign`, `${name}告示牌`, [["facing", 4]], (st) => {
    const t = L(`${wood}_planks`);
    return {
      ...common,
      category: "decoracion",
      model: rotateBoxes([mbox(7, 0, 7, 9, 8, 9, t), mbox(0, 8, 7, 16, 16, 9, t)], st.facing),
      selection: rotateFlat([0, 0, 7 / 16, 1, 1, 9 / 16], st.facing)
    };
  });
  WALL_SIGNS[wood] = family(`${wood}_wall_sign`, `${name}告示牌`, [["facing", 4]], (st) => {
    const t = L(`${wood}_planks`);
    return {
      ...common,
      model: rotateBoxes([mbox(0, 4, 14, 16, 12, 16, t)], st.facing),
      selection: rotateFlat([0, 4 / 16, 14 / 16, 1, 12 / 16, 1], st.facing),
      wall: st.facing,
      base: SIGNS[wood]
    };
  });
  SIGN_WALL_OF[SIGNS[wood]] = WALL_SIGNS[wood];
  SIGN_BASES.add(SIGNS[wood]);
  SIGN_BASES.add(WALL_SIGNS[wood]);
}
for (const [wood, name] of SIGN_WOODS)
  addSign(wood, name);
function addSignBase(id) {
  SIGN_BASES.add(id);
}
function isWall(id) {
  return WALL_IDS.has(id);
}

// goodPG/src/shared/blocks/workstations.ts
var CHEST_DOUBLE = family("chest_double", "箱子", [["facing", 4], ["side", 2]], (st) => {
  const tex = ["chest_side", "chest_side", "chest_top", "chest_top", "chest_side", "chest_side"];
  tex[DIR_FACE[st.facing]] = st.side === 0 ? "chest_front_seam_right" : "chest_front_seam_left";
  tex[DIR_FACE[st.facing + 2 & 3]] = st.side === 0 ? "chest_side_seam_left" : "chest_side_seam_right";
  return { tex, hardness: 2.5, tool: "axe", sound: "wood", category: null, base: CHEST };
});
function fastFurnace(key, name) {
  return family(key, name, [["facing", 4], ["lit", 2]], (st) => {
    const tex = [`${key}_side`, `${key}_side`, `${key}_top`, `${key}_top`, `${key}_side`, `${key}_side`];
    tex[DIR_FACE[st.facing]] = st.lit ? `${key}_front_lit` : `${key}_front`;
    return { tex, hardness: 3.5, tool: "pickaxe", tier: 1, sound: "stone", emission: st.lit ? 13 : 0, category: "decoracion" };
  });
}
var SMOKER = fastFurnace("smoker", "烟熏炉");
var BLAST_FURNACE = fastFurnace("blast_furnace", "高炉");
var CAMPFIRE = family("campfire", "营火", [["lit", 2]], (st) => campfireOpts(st.lit === 1, false));
function campfireOpts(lit, soul) {
  const p = soul ? "soul_campfire" : "campfire";
  const log = L("oak_log_side"), end = L("oak_log_top"), litLog = L(lit ? `${p}_log_lit` : "oak_log_side");
  const fire = L(`${p}_fire`), ash = L(lit ? `${p}_embers` : "campfire_ash");
  const along = [end, end, log, log, litLog, litLog];
  const across = [litLog, litLog, log, log, end, end];
  const model = [
    mbox(0, 0, 1, 16, 4, 5, along),
    mbox(0, 0, 11, 16, 4, 15, along),
    mbox(1, 3, 0, 5, 7, 16, across),
    mbox(11, 3, 0, 15, 7, 16, across),
    mbox(5, 0, 5, 11, 1, 11, [-1, -1, ash, -1, -1, -1])
  ];
  if (lit) {
    model.push(mbox(8, 1, 2, 8, 16, 14, [fire, fire, -1, -1, -1, -1]), mbox(2, 1, 8, 14, 16, 8, [-1, -1, -1, -1, fire, fire]));
  }
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    emission: lit ? soul ? 10 : 15 : 0,
    hardness: 2,
    tool: "axe",
    sound: "wood",
    category: "decoracion",
    side: "oak_log_side",
    top: "oak_log_top",
    model,
    collision: [0, 0, 0, 1, 7 / 16, 1],
    selection: [0, 0, 0, 1, 7 / 16, 1]
  };
}
var STONECUTTER = family("stonecutter", "切石机", [["facing", 4]], (st) => {
  const side = L("stonecutter_side"), top = L("stonecutter_top"), bottom = L("stonecutter_bottom"), saw = L("stonecutter_saw");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 3.5,
    tool: "pickaxe",
    tier: 1,
    sound: "stone",
    category: "decoracion",
    side: "stonecutter_side",
    top: "stonecutter_top",
    bottom: "stonecutter_bottom",
    model: [
      mbox(0, 0, 0, 16, 9, 16, [side, side, top, bottom, side, side]),
      ...rotateBoxes([mbox(8, 9, 1, 8, 16, 15, [saw, saw, -1, -1, -1, -1])], st.facing)
    ],
    collision: [0, 0, 0, 1, 9 / 16, 1],
    selection: rotateFlat([0, 0, 0, 1, 9 / 16, 1], st.facing)
  };
});

// goodPG/src/shared/blocks/biomes.ts
var plant2 = (tex, o = {}) => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: tex,
  category: "naturaleza",
  ...o
});
function newWood(key, name, wood) {
  const log = family(`${key}_log`, `${name}原木`, [], () => ({
    top: `${key}_log_top`,
    side: `${key}_log_side`,
    sound: "wood",
    hardness: 2,
    tool: "axe",
    category: "naturaleza"
  }));
  const planks = family(`${key}_planks`, `${name}木板`, [], () => ({
    all: `${key}_planks`,
    sound: "wood",
    hardness: 2,
    tool: "axe"
  }));
  const leaves = family(`${key}_leaves`, `${name}树叶`, [], () => ({
    all: `${key}_leaves`,
    render: R_CUTOUT,
    lightOpacity: 1,
    sound: "leaves",
    hardness: 0.2,
    category: "naturaleza"
  }));
  const sapling = family(`${key}_sapling`, `${name}树苗`, [], () => plant2(`${key}_sapling`));
  const m = { key, name: wood, block: planks, hardness: 2, tool: "axe", tier: 0, sound: "wood" };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign(key, wood);
  return { key, name, wood, log, planks, leaves, sapling };
}
var JUNGLE = newWood("jungle", "丛林", "丛林木");
var ACACIA = newWood("acacia", "金合欢", "金合欢木");
var DARK_OAK = newWood("dark_oak", "深色橡木", "深色橡木");
var CHERRY = newWood("cherry", "樱花", "樱花木");
var JUNGLE_LOG = JUNGLE.log;
var JUNGLE_PLANKS = JUNGLE.planks;
var JUNGLE_LEAVES = JUNGLE.leaves;
var JUNGLE_SAPLING = JUNGLE.sapling;
var ACACIA_LOG = ACACIA.log;
var ACACIA_PLANKS = ACACIA.planks;
var ACACIA_LEAVES = ACACIA.leaves;
var ACACIA_SAPLING = ACACIA.sapling;
var DARK_OAK_LOG = DARK_OAK.log;
var DARK_OAK_PLANKS = DARK_OAK.planks;
var DARK_OAK_LEAVES = DARK_OAK.leaves;
var DARK_OAK_SAPLING = DARK_OAK.sapling;
var CHERRY_LOG = CHERRY.log;
var CHERRY_PLANKS = CHERRY.planks;
var CHERRY_LEAVES = CHERRY.leaves;
var CHERRY_SAPLING = CHERRY.sapling;
var WOOD_TYPES = [
  { key: "oak", name: "橡木", wood: "橡木", log: OAK_LOG, planks: OAK_PLANKS, leaves: OAK_LEAVES, sapling: OAK_SAPLING },
  { key: "birch", name: "白桦", wood: "白桦木", log: BIRCH_LOG, planks: BIRCH_PLANKS, leaves: BIRCH_LEAVES, sapling: BIRCH_SAPLING },
  { key: "spruce", name: "云杉", wood: "云杉木", log: SPRUCE_LOG, planks: SPRUCE_PLANKS, leaves: SPRUCE_LEAVES, sapling: SPRUCE_SAPLING },
  JUNGLE,
  ACACIA,
  DARK_OAK,
  CHERRY
];
var ALL_LOGS = WOOD_TYPES.map((w) => w.log);
var ALL_PLANKS = WOOD_TYPES.map((w) => w.planks);
var ALL_LEAVES = WOOD_TYPES.map((w) => w.leaves);
var ALL_SAPLINGS = WOOD_TYPES.map((w) => w.sapling);
var LEAF_SET = new Set(ALL_LEAVES);
var LOG_SET = new Set(ALL_LOGS);
var SAPLING_SET = new Set(ALL_SAPLINGS);
var isLeaves = (id) => LEAF_SET.has(id);
var isLog = (id) => LOG_SET.has(id);
var VARIANT_WOOD = new Map;
function addLogVariant(id, wood) {
  LOG_SET.add(id);
  VARIANT_WOOD.set(id, wood);
}
var VINE = family("vine", "藤蔓", [["facing", 4]], (st) => {
  const t = L("vine");
  const f = st.facing;
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    replaceable: true,
    hardness: 0.2,
    sound: "leaves",
    category: "naturaleza",
    walkThrough: true,
    climbable: true,
    wall: f,
    flatItem: "vine",
    model: rotateBoxes([mbox(0, 0, 15.2, 16, 16, 15.2, [-1, -1, -1, -1, t, t])], f),
    collision: [],
    selection: rotateFlat([0, 0, 15 / 16, 1, 1, 1], f),
    support: (get) => {
      const behind = get(-DIR_X[f], 0, -DIR_Z[f]);
      if (behind < 0 || BLOCK_OPAQUE[behind] === 1 || isLeaves(behind))
        return true;
      const above = get(0, 1, 0);
      return above < 0 || isVine(above);
    }
  };
});
var isVine = (id) => id >= VINE && id < VINE + 4;
var LILY_PAD = family("lily_pad", "睡莲", [], () => {
  const t = L("lily_pad");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "grass",
    category: "naturaleza",
    flatItem: "lily_pad",
    model: [mbox(0, 0, 0, 16, 0.25, 16, [-1, -1, t, t, -1, -1])],
    collision: [0, 0, 0, 1, 1.5 / 16, 1],
    selection: [0, 0, 0, 1, 1.5 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_FLUID[b] === 1 && BLOCK_FLUID_LEVEL[b] === 0;
    }
  };
});
var MYCELIUM = family("mycelium", "菌丝体", [], () => ({
  top: "mycelium_top",
  side: "mycelium_side",
  bottom: "dirt",
  sound: "grass",
  hardness: 0.6,
  tool: "shovel",
  category: "naturaleza"
}));
var RED_MUSHROOM_BLOCK = family("red_mushroom_block", "红色蘑菇方块", [], () => ({
  all: "red_mushroom_block",
  sound: "wood",
  hardness: 0.2,
  tool: "axe",
  category: "naturaleza"
}));
var BROWN_MUSHROOM_BLOCK = family("brown_mushroom_block", "棕色蘑菇方块", [], () => ({
  all: "brown_mushroom_block",
  sound: "wood",
  hardness: 0.2,
  tool: "axe",
  category: "naturaleza"
}));
var MUSHROOM_STEM = family("mushroom_stem", "蘑菇柄", [], () => ({
  side: "mushroom_stem",
  top: "mushroom_block_inside",
  sound: "wood",
  hardness: 0.2,
  tool: "axe",
  category: "naturaleza"
}));
var RED_SAND = family("red_sand", "红沙", [], () => ({
  all: "red_sand",
  sound: "sand",
  hardness: 0.5,
  tool: "shovel",
  category: "naturaleza"
}));
var RED_SANDSTONE = family("red_sandstone", "红砂岩", [], () => ({
  top: "red_sandstone_top",
  side: "red_sandstone_side",
  bottom: "red_sandstone_bottom",
  hardness: 0.8,
  tool: "pickaxe",
  tier: 1
}));
var TERRACOTTA_COLORS = ["white", "orange", "yellow", "brown", "red", "light_gray"];
var TERRACOTTA_NAMES = {
  white: "白色",
  orange: "橙色",
  yellow: "黄色",
  brown: "棕色",
  red: "红色",
  light_gray: "淡灰色"
};
var COLORED_TERRACOTTA = {};
for (const c of TERRACOTTA_COLORS) {
  COLORED_TERRACOTTA[c] = family(`${c}_terracotta`, `${TERRACOTTA_NAMES[c]}陶瓦`, [], () => ({
    all: `${c}_terracotta`,
    hardness: 1.25,
    tool: "pickaxe",
    tier: 1,
    category: "colores"
  }));
}
var PACKED_ICE = family("packed_ice", "浮冰", [], () => ({
  all: "packed_ice",
  sound: "glass",
  hardness: 0.5,
  tool: "pickaxe",
  category: "naturaleza"
}));
var FLOWER_KEYS = [
  "blue_orchid",
  "allium",
  "azure_bluet",
  "red_tulip",
  "orange_tulip",
  "white_tulip",
  "pink_tulip",
  "oxeye_daisy",
  "lily_of_the_valley"
];
var FLOWER_NAMES = {
  blue_orchid: "兰花",
  allium: "绒球葱",
  azure_bluet: "蓝花美耳草",
  red_tulip: "红色郁金香",
  orange_tulip: "橙色郁金香",
  white_tulip: "白色郁金香",
  pink_tulip: "粉红色郁金香",
  oxeye_daisy: "滨菊",
  lily_of_the_valley: "铃兰"
};
var FLOWERS = {};
for (const k of FLOWER_KEYS)
  FLOWERS[k] = family(k, FLOWER_NAMES[k], [], () => plant2(k));
var PINK_PETALS = family("pink_petals", "粉红色花瓣", [], () => {
  const t = L("pink_petals");
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "grass",
    replaceable: true,
    category: "naturaleza",
    walkThrough: true,
    flatItem: "pink_petals",
    model: [mbox(0, 0, 0, 16, 1, 16, [-1, -1, t, -1, -1, -1])],
    collision: [],
    selection: [0, 0, 0, 1, 3 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    }
  };
});
function addWoodType(key, name, wood) {
  const w = newWood(key, name, wood);
  WOOD_TYPES.push(w);
  ALL_LOGS.push(w.log);
  ALL_PLANKS.push(w.planks);
  ALL_LEAVES.push(w.leaves);
  ALL_SAPLINGS.push(w.sapling);
  LOG_SET.add(w.log);
  LEAF_SET.add(w.leaves);
  SAPLING_SET.add(w.sapling);
  return w;
}
function addWoodLog(id, wood) {
  ALL_LOGS.push(id);
  addLogVariant(id, wood);
}
function addPlanks(id) {
  ALL_PLANKS.push(id);
}

// goodPG/src/shared/blocks/underground.ts
var rock = (tex, hardness, o = {}) => ({
  all: tex,
  hardness,
  tool: "pickaxe",
  tier: 1,
  category: "naturaleza",
  ...o
});
var DEEPSLATE = family("deepslate", "深板岩", [], () => rock("deepslate", 3, { top: "deepslate_top", side: "deepslate" }));
var COBBLED_DEEPSLATE = family("cobbled_deepslate", "深板岩圆石", [], () => rock("cobbled_deepslate", 3.5, { category: "construccion" }));
var TUFF = family("tuff", "凝灰岩", [], () => rock("tuff", 1.5));
var CALCITE = family("calcite", "方解石", [], () => rock("calcite", 0.75));
var SMOOTH_BASALT = family("smooth_basalt", "平滑玄武岩", [], () => rock("smooth_basalt", 1.25));
var DRIPSTONE_BLOCK = family("dripstone_block", "滴水石块", [], () => rock("dripstone_block", 1.5));
addMaterialShapes({
  key: "cobbled_deepslate",
  name: "深板岩圆石",
  block: COBBLED_DEEPSLATE,
  hardness: 3.5,
  tool: "pickaxe",
  tier: 1,
  sound: "stone"
});
var ore = (tex, hardness, tier) => ({ all: tex, hardness, tool: "pickaxe", tier, category: "minerales" });
var COPPER_ORE = family("copper_ore", "铜矿石", [], () => ore("copper_ore", 3, 2));
var EMERALD_ORE = family("emerald_ore", "绿宝石矿石", [], () => ore("emerald_ore", 3, 3));
var DEEPSLATE_ORE = {};
var SURFACE_ORE = {};
var DEEP_ORES = [
  [COAL_ORE, "coal", "煤", 1],
  [IRON_ORE, "iron", "铁", 2],
  [COPPER_ORE, "copper", "铜", 2],
  [GOLD_ORE, "gold", "金", 3],
  [REDSTONE_ORE, "redstone", "红石", 3],
  [LAPIS_ORE, "lapis", "青金石", 2],
  [DIAMOND_ORE, "diamond", "钻石", 3],
  [EMERALD_ORE, "emerald", "绿宝石", 3]
];
for (const [base, key, name, tier] of DEEP_ORES) {
  const id = family(`deepslate_${key}_ore`, `深层${name}矿石`, [], () => ore(`deepslate_${key}_ore`, 4.5, tier));
  DEEPSLATE_ORE[base] = id;
  SURFACE_ORE[id] = base;
}
var EMERALD_BLOCK = family("emerald_block", "绿宝石块", [], () => ({
  all: "emerald_block",
  hardness: 5,
  tool: "pickaxe",
  tier: 3,
  sound: "metal",
  category: "minerales"
}));
var needsFloor = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1;
};
var MOSS_BLOCK = family("moss_block", "苔藓块", [], () => ({
  all: "moss_block",
  hardness: 0.1,
  tool: "axe",
  sound: "grass",
  category: "naturaleza"
}));
var MOSS_CARPET = family("moss_carpet", "苔藓地毯", [], () => {
  const t = L("moss_block");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.1,
    sound: "grass",
    all: "moss_block",
    category: "naturaleza",
    model: [mbox(0, 0, 0, 16, 1, 16, t)],
    collision: [0, 0, 0, 1, 1 / 16, 1],
    support: needsFloor
  };
});
var plant3 = (tex) => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: tex,
  category: "naturaleza"
});
var AZALEA = family("azalea", "杜鹃花丛", [], () => plant3("azalea"));
var FLOWERING_AZALEA = family("flowering_azalea", "盛开的杜鹃花丛", [], () => plant3("flowering_azalea"));
var CAVE_VINES = family("cave_vines", "洞穴藤蔓", [["berries", 2]], (st) => ({
  ...plant3(st.berries ? "cave_vines_lit" : "cave_vines"),
  emission: st.berries ? 14 : 0,
  climbable: true,
  noItem: true,
  support: (get) => {
    const above = get(0, 1, 0);
    return above < 0 || BLOCK_OPAQUE[above] === 1 || isCaveVines(above);
  }
}));
var isCaveVines = (id) => id === CAVE_VINES || id === CAVE_VINES + 1;
var POINTED_DRIPSTONE = family("pointed_dripstone", "滴水石锥", [["dir", 2], ["part", 3]], (st) => {
  const t = L("pointed_dripstone");
  const w = [3, 5, 6][st.part];
  const a = 8 - w / 2, b = 8 + w / 2;
  const box = st.part === 0 ? st.dir === 0 ? mbox(a, 0, a, b, 11, b, t) : mbox(a, 5, a, b, 16, b, t) : mbox(a, 0, a, b, 16, b, t);
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 1.5,
    tool: "pickaxe",
    sound: "stone",
    category: "naturaleza",
    all: "pointed_dripstone",
    model: [box],
    collision: [a / 16, box.y0 / 16, a / 16, b / 16, box.y1 / 16, b / 16],
    flatItem: "pointed_dripstone",
    support: (get) => {
      const n = get(0, st.dir === 0 ? -1 : 1, 0);
      return n < 0 || BLOCK_SOLID[n] === 1;
    }
  };
});
var AMETHYST_BLOCK = family("amethyst_block", "紫水晶块", [], () => ({
  all: "amethyst_block",
  hardness: 1.5,
  tool: "pickaxe",
  sound: "glass",
  category: "minerales"
}));
var BUDDING_AMETHYST = family("budding_amethyst", "紫水晶母岩", [], () => ({
  all: "budding_amethyst",
  hardness: 1.5,
  tool: "pickaxe",
  sound: "glass",
  category: "minerales"
}));
var AMETHYST_BUD = family("amethyst_bud", "紫水晶簇", [["stage", 4]], (st) => ({
  ...plant3(["small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"][st.stage]),
  sound: "glass",
  hardness: 1.5,
  tool: "pickaxe",
  category: "minerales",
  emission: [1, 2, 4, 5][st.stage],
  support: needsFloor
}));
var TINTED_GLASS = family("tinted_glass", "遮光玻璃", [], () => ({
  all: "tinted_glass",
  render: R_TRANSLUCENT,
  lightOpacity: 15,
  hardness: 0.3,
  sound: "glass"
}));

// goodPG/src/shared/blocks/structures.ts
var MOB_SPAWNER = family("spawner", "刷怪笼", [], () => ({
  all: "spawner",
  render: R_CUTOUT,
  lightOpacity: 1,
  hardness: 5,
  tool: "pickaxe",
  tier: 1,
  sound: "metal",
  category: "decoracion"
}));
var COBWEB = family("cobweb", "蜘蛛网", [], () => ({
  all: "cobweb",
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 1,
  hardness: 4,
  tool: "axe",
  sound: "wool",
  category: "decoracion",
  walkThrough: true
}));
var CHISELED_SANDSTONE = family("chiseled_sandstone", "雕纹砂岩", [], () => ({
  top: "sandstone_top",
  bottom: "sandstone_bottom",
  side: "chiseled_sandstone",
  hardness: 0.8,
  tool: "pickaxe",
  tier: 1
}));
var CUT_SANDSTONE = family("cut_sandstone", "切制砂岩", [], () => ({
  top: "sandstone_top",
  bottom: "sandstone_bottom",
  side: "cut_sandstone",
  hardness: 0.8,
  tool: "pickaxe",
  tier: 1
}));
var MOSSY_STONE_BRICKS = family("mossy_stone_bricks", "苔石砖", [], () => ({
  all: "mossy_stone_bricks",
  hardness: 1.5,
  tool: "pickaxe",
  tier: 1
}));
var CRACKED_STONE_BRICKS = family("cracked_stone_bricks", "裂纹石砖", [], () => ({
  all: "cracked_stone_bricks",
  hardness: 1.5,
  tool: "pickaxe",
  tier: 1
}));
var NETHERRACK = family("netherrack", "下界岩", [], () => ({
  all: "netherrack",
  hardness: 0.4,
  tool: "pickaxe",
  tier: 1,
  category: "naturaleza",
  sound: "netherrack"
}));
var CRYING_OBSIDIAN = family("crying_obsidian", "哭泣的黑曜石", [], () => ({
  all: "crying_obsidian",
  hardness: 50,
  tool: "pickaxe",
  tier: 4,
  emission: 10,
  category: "naturaleza"
}));

// goodPG/src/shared/blocks/weather.ts
var SNOW_LAYER = family("snow_layer", "雪", [["layers", 8]], (st) => {
  const n = st.layers + 1;
  const t = L("snow");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: n >= 8 ? 15 : 0,
    hardness: 0.1,
    tool: "shovel",
    sound: "snow",
    all: "snow",
    category: "naturaleza",
    replaceable: n === 1,
    solid: n > 1,
    walkThrough: n === 1,
    model: [mbox(0, 0, 0, 16, n * 2, 16, t)],
    collision: n === 1 ? [] : [0, 0, 0, 1, (n - 1) * 2 / 16, 1],
    selection: [0, 0, 0, 1, n * 2 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_OPAQUE[b] === 1 || isLeaves(b) || b === SNOW_LAYER + 7;
    }
  };
});
var isSnowLayer = (id) => id >= SNOW_LAYER && id < SNOW_LAYER + 8;

// goodPG/src/shared/blocks/aquaticBlocks.ts
var EGG_BOXES = [
  [5, 0, 4, 9, 7, 8],
  [1, 0, 9, 5, 5, 13],
  [10, 0, 9, 14, 5, 13],
  [10, 0, 1, 13, 4, 4]
];
var EGG_TEXTURES = ["turtle_egg", "turtle_egg_slightly_cracked", "turtle_egg_very_cracked"];
var TURTLE_EGG = family("turtle_egg", "海龟蛋", [["eggs", 4], ["hatch", 3]], (st) => {
  const tex = EGG_TEXTURES[st.hatch];
  const t = L(tex);
  const model = EGG_BOXES.slice(0, st.eggs + 1).map(([x0, y0, z0, x1, y1, z1]) => mbox(x0, y0, z0, x1, y1, z1, t));
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.5,
    sound: "stone",
    all: tex,
    category: "naturaleza",
    model,
    collision: [1 / 16, 0, 1 / 16, 15 / 16, 7 / 16, 15 / 16],
    selection: [1 / 16, 0, 1 / 16, 15 / 16, 7 / 16, 15 / 16],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    }
  };
});
// goodPG/src/shared/blocks/queries.ts
var CACTUS_BOX = [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16];
var LAVA_FLOW_ODD = 0;
function registerOddLava(base) {
  LAVA_FLOW_ODD = base;
}
function baseBlock(id) {
  return BLOCK_BASE[id] || id;
}
var ORIENTED = new Set([FURNACE, CHEST, FURNACE_LIT, CARVED_PUMPKIN, JACK_O_LANTERN, SMOKER, BLAST_FURNACE, STONECUTTER]);
function isChest(id) {
  return id >= CHEST && id < CHEST + 4 || familyBase(id) === CHEST_DOUBLE || defs[id]?.key === "barrel" || /shulker_box$/.test(defs[familyBase(id)]?.key ?? "") || id > 0 && !!extraChest(familyBase(id));
}
var EXTRA_CHESTS = [];
function extraChest(base) {
  for (const c of EXTRA_CHESTS)
    if (base === c.single || base === c.double)
      return c;
  return;
}
var CONTAINER_KEYS = new Set(["brewing_stand", "hopper", "dispenser", "dropper", "ender_chest"]);
// goodPG/src/shared/blocks/villagerBlocks.ts
function sides(top, bottom, side, front = side, back = front) {
  return [side, side, top, bottom, back, front];
}
var LECTERN = family("lectern", "讲台", [], () => {
  const top = L("lectern_top"), side = L("lectern_side"), front = L("lectern_front"), base = L("oak_planks");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2.5,
    tool: "axe",
    sound: "wood",
    category: "decoracion",
    top: "lectern_top",
    side: "lectern_side",
    bottom: "oak_planks",
    model: [
      mbox(0, 0, 0, 16, 2, 16, [base, base, base, base, base, base]),
      mbox(4, 2, 4, 12, 13, 12, [front, front, -1, -1, front, front]),
      mbox(0, 13, 1, 16, 16, 15, [side, side, top, base, side, side])
    ],
    collision: [0, 0, 0, 1, 2 / 16, 1, 4 / 16, 2 / 16, 4 / 16, 12 / 16, 1, 12 / 16],
    selection: [0, 0, 0, 1, 1, 1]
  };
});
var CARTOGRAPHY_TABLE = family("cartography_table", "制图台", [], () => ({
  tex: [
    "cartography_table_side1",
    "cartography_table_side1",
    "cartography_table_top",
    "dark_oak_planks",
    "cartography_table_side2",
    "cartography_table_side2"
  ],
  hardness: 2.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var FLETCHING_TABLE = family("fletching_table", "制箭台", [], () => ({
  tex: sides("fletching_table_top", "birch_planks", "fletching_table_side", "fletching_table_front"),
  hardness: 2.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var BARREL = family("barrel", "木桶", [], () => ({
  tex: sides("barrel_top", "barrel_bottom", "barrel_side"),
  hardness: 2.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var LOOM = family("loom", "织布机", [], () => ({
  tex: sides("loom_top", "oak_planks", "loom_side", "loom_front"),
  hardness: 2.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var GRINDSTONE = family("grindstone", "砂轮", [], () => {
  const face = L("grindstone_side"), round = L("grindstone_round"), leg = L("dark_oak_planks");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2,
    tool: "pickaxe",
    sound: "stone",
    category: "decoracion",
    side: "grindstone_side",
    top: "grindstone_round",
    bottom: "dark_oak_planks",
    model: [
      mbox(1, 0, 6, 3, 10, 10, leg),
      mbox(13, 0, 6, 15, 10, 10, leg),
      mbox(3, 6, 6, 4, 10, 10, leg),
      mbox(12, 6, 6, 13, 10, 10, leg),
      mbox(4, 4, 2, 12, 16, 14, [face, face, round, round, round, round])
    ],
    collision: [1 / 16, 0, 2 / 16, 15 / 16, 1, 14 / 16],
    selection: [1 / 16, 0, 2 / 16, 15 / 16, 1, 14 / 16]
  };
});
var SMITHING_TABLE = family("smithing_table", "锻造台", [], () => ({
  tex: sides("smithing_table_top", "dark_oak_planks", "smithing_table_side", "smithing_table_front"),
  hardness: 2.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var CAULDRON = family("cauldron", "炼药锅", [], () => {
  const out = L("cauldron_side"), inner = L("cauldron_inner"), top = L("cauldron_top"), bottom = L("cauldron_bottom");
  const wx0 = [inner, out, top, bottom, out, out];
  const wx1 = [out, inner, top, bottom, out, out];
  const wz0 = [out, out, top, bottom, inner, out];
  const wz1 = [out, out, top, bottom, out, inner];
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2,
    tool: "pickaxe",
    sound: "metal",
    category: "decoracion",
    side: "cauldron_side",
    top: "cauldron_top",
    bottom: "cauldron_bottom",
    model: [
      mbox(0, 3, 0, 2, 16, 16, wx0),
      mbox(14, 3, 0, 16, 16, 16, wx1),
      mbox(2, 3, 0, 14, 16, 2, wz0),
      mbox(2, 3, 14, 14, 16, 16, wz1),
      mbox(2, 3, 2, 14, 4, 14, [-1, -1, inner, bottom, -1, -1]),
      mbox(0, 0, 0, 4, 3, 2, out),
      mbox(0, 0, 2, 2, 3, 4, out),
      mbox(12, 0, 0, 16, 3, 2, out),
      mbox(14, 0, 2, 16, 3, 4, out),
      mbox(0, 0, 14, 4, 3, 16, out),
      mbox(0, 0, 12, 2, 3, 14, out),
      mbox(12, 0, 14, 16, 3, 16, out),
      mbox(14, 0, 12, 16, 3, 14, out)
    ],
    collision: [0, 0, 0, 1, 4 / 16, 1, 0, 0, 0, 2 / 16, 1, 1, 14 / 16, 0, 0, 1, 1, 1, 0, 0, 0, 1, 1, 2 / 16, 0, 0, 14 / 16, 1, 1, 1],
    selection: [0, 0, 0, 1, 1, 1]
  };
});
var VILLAGER_BLOCKS = [
  LECTERN,
  CARTOGRAPHY_TABLE,
  FLETCHING_TABLE,
  BARREL,
  LOOM,
  GRINDSTONE,
  SMITHING_TABLE,
  CAULDRON
];
// goodPG/src/shared/blocks/monsterBlocks.ts
var infested = (tex, hardness) => () => ({
  all: tex,
  hardness,
  tool: "pickaxe",
  category: "naturaleza"
});
var INFESTED_STONE = family("infested_stone", "虫蚀石头", [], infested("stone", 0.75));
var INFESTED_COBBLESTONE = family("infested_cobblestone", "虫蚀圆石", [], infested("cobblestone", 1));
var INFESTED_STONE_BRICKS = family("infested_stone_bricks", "虫蚀石砖", [], infested("stone_bricks", 0.75));
var INFESTED_OF = {
  [INFESTED_STONE]: STONE,
  [INFESTED_COBBLESTONE]: COBBLESTONE,
  [INFESTED_STONE_BRICKS]: STONE_BRICKS
};
function addInfested(block, mimics) {
  INFESTED_OF[block] = mimics;
}
// goodPG/src/shared/blocks/beeBlocks.ts
var HONEY_MAX = 5;
function beeHome(key, name, t, hardness, category) {
  return family(key, name, [["facing", 4], ["honey", HONEY_MAX + 1]], (st) => {
    const tex = [t.side, t.side, t.top, t.bottom, t.side, t.side];
    tex[DIR_FACE[st.facing]] = st.honey >= HONEY_MAX ? t.frontHoney : t.front;
    return { hardness, tool: "axe", sound: "wood", category, tex };
  });
}
var BEE_NEST = beeHome("bee_nest", "蜂巢", {
  top: "bee_nest_top",
  bottom: "bee_nest_bottom",
  side: "bee_nest_side",
  front: "bee_nest_front",
  frontHoney: "bee_nest_front_honey"
}, 0.3, "naturaleza");
var BEEHIVE = beeHome("beehive", "蜂箱", {
  top: "beehive_end",
  bottom: "beehive_end",
  side: "beehive_side",
  front: "beehive_front",
  frontHoney: "beehive_front_honey"
}, 0.6, "decoracion");
var HONEY_BLOCK = family("honey_block", "蜂蜜块", [], () => ({
  all: "honey_block",
  hardness: 0,
  sound: "wool",
  category: "decoracion"
}));
var HONEYCOMB_BLOCK = family("honeycomb_block", "蜜脾块", [], () => ({
  all: "honeycomb_block",
  hardness: 0.6,
  sound: "wood",
  category: "decoracion"
}));
var BEE_INVENTORY = [BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK];
// goodPG/src/shared/blocks/logAxis.ts
var AXIS_X = 0;
var AXIS_Z = 1;
var LOG_AXIS = {};
var LOG_OF = new Map;
var AXIS_OF_LOG = new Map;
var PX = 1;
var NX = 2;
var UP = 4;
var DN = 8;
var PZ = 16;
var NZ = 32;
for (const w of WOOD_TYPES) {
  const top = `${w.key}_log_top`, side = `${w.key}_log_side`;
  const base = family(`${w.key}_log_axis`, `${w.name}原木`, [["axis", 2]], (st) => {
    const alongX = st.axis === AXIS_X;
    const tex = alongX ? [top, top, side, side, side, side] : [side, side, side, side, top, top];
    return {
      tex,
      texRot: alongX ? UP | DN | PZ | NZ : PX | NX,
      sound: "wood",
      hardness: 2,
      tool: "axe",
      category: null,
      base: w.log
    };
  });
  LOG_AXIS[w.key] = base;
  for (const a of [AXIS_X, AXIS_Z]) {
    LOG_OF.set(base + a, w.log);
    addLogVariant(base + a, w);
  }
  AXIS_OF_LOG.set(w.log, base);
}
function horizontalLog(log, axis) {
  const b = AXIS_OF_LOG.get(log);
  return b === undefined ? log : b + axis;
}
function addAxisLogs(key, name, log, top, side, wood, extra = {}) {
  const base = family(`${key}_log_axis`, name, [["axis", 2]], (st) => {
    const alongX = st.axis === AXIS_X;
    const tex = alongX ? [top, top, side, side, side, side] : [side, side, side, side, top, top];
    return {
      tex,
      texRot: alongX ? UP | DN | PZ | NZ : PX | NX,
      sound: "wood",
      hardness: 2,
      tool: "axe",
      category: null,
      base: log,
      ...extra
    };
  });
  LOG_AXIS[key] = base;
  for (const a of [AXIS_X, AXIS_Z]) {
    LOG_OF.set(base + a, log);
    if (wood)
      addLogVariant(base + a, wood);
  }
  AXIS_OF_LOG.set(log, base);
  return base;
}
// goodPG/src/shared/blocks/woods2.ts
var MANGROVE = addWoodType("mangrove", "红树", "红树木");
var PALE_OAK = addWoodType("pale_oak", "苍白橡木", "苍白橡木");
{
  const d = defs[MANGROVE.sapling];
  d.key = "mangrove_propagule";
  d.name = "红树胎生苗";
  d.tex = ["mangrove_propagule", "mangrove_propagule", "mangrove_propagule", "mangrove_propagule", "mangrove_propagule", "mangrove_propagule"];
}
var MANGROVE_LOG = MANGROVE.log;
var MANGROVE_PLANKS = MANGROVE.planks;
var MANGROVE_LEAVES = MANGROVE.leaves;
var MANGROVE_PROPAGULE = MANGROVE.sapling;
var PALE_OAK_LOG = PALE_OAK.log;
var PALE_OAK_PLANKS = PALE_OAK.planks;
var PALE_OAK_LEAVES = PALE_OAK.leaves;
var PALE_OAK_SAPLING = PALE_OAK.sapling;
for (const w of [MANGROVE, PALE_OAK])
  addAxisLogs(w.key, `${w.name}原木`, w.log, `${w.key}_log_top`, `${w.key}_log_side`, w);
var HANGING_PROPAGULE = family("mangrove_propagule_hanging", "红树胎生苗", [], () => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: "mangrove_propagule",
  category: null,
  base: MANGROVE.sapling,
  support: (get) => {
    const above = get(0, 1, 0);
    return above < 0 || above === MANGROVE.leaves;
  }
}));
var MANGROVE_ROOTS = family("mangrove_roots", "红树根", [], () => ({
  all: "mangrove_roots",
  render: R_CUTOUT,
  lightOpacity: 1,
  sound: "wood",
  hardness: 0.7,
  tool: "axe",
  category: "naturaleza"
}));
var MUDDY_MANGROVE_ROOTS = family("muddy_mangrove_roots", "泥泞的红树根", [], () => ({
  top: "muddy_mangrove_roots_top",
  side: "muddy_mangrove_roots_side",
  sound: "dirt",
  hardness: 0.7,
  tool: "shovel",
  category: "naturaleza"
}));
var BAMBOO_SOIL = new Set([GRASS, DIRT, SAND, GRAVEL, SNOWY_GRASS, CLAY, MOSS_BLOCK]);
var BAMBOO_LARGE_LEAVES = 2;
var BAMBOO = family("bamboo", "竹子", [["leaves", 3]], (st) => {
  const stalk = L("bamboo_stalk"), end = L("bamboo_block_top");
  const boxes = [mbox(6, 0, 6, 9, 16, 9, [stalk, stalk, end, end, stalk, stalk])];
  if (st.leaves > 0) {
    const t = L(st.leaves === BAMBOO_LARGE_LEAVES ? "bamboo_large_leaves" : "bamboo_small_leaves");
    boxes.push(mbox(0, 0, 7.5, 16, 16, 7.5, [-1, -1, -1, -1, t, t]), mbox(7.5, 0, 0, 7.5, 16, 16, [t, t, -1, -1, -1, -1]));
  }
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    sound: "wood",
    hardness: 1,
    tool: "axe",
    category: "naturaleza",
    all: "bamboo_stalk",
    flatItem: "bamboo_stalk",
    model: boxes,
    collision: [6 / 16, 0, 6 / 16, 9 / 16, 1, 9 / 16],
    selection: [5 / 16, 0, 5 / 16, 10 / 16, 1, 10 / 16],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || bambooGrowsOn(b);
    }
  };
});
var isBamboo = (id) => id >= BAMBOO && id < BAMBOO + 3;
var WOOD_OPTS = { sound: "wood", hardness: 2, tool: "axe" };
var BAMBOO_BLOCK = family("bamboo_block", "竹块", [], () => ({
  ...WOOD_OPTS,
  top: "bamboo_block_top",
  side: "bamboo_block_side"
}));
var STRIPPED_BAMBOO_BLOCK = family("stripped_bamboo_block", "去皮竹块", [], () => ({
  ...WOOD_OPTS,
  top: "stripped_bamboo_block_top",
  side: "stripped_bamboo_block_side"
}));
var BAMBOO_BLOCK_AXIS = addAxisLogs("bamboo_block", "竹块", BAMBOO_BLOCK, "bamboo_block_top", "bamboo_block_side");
var STRIPPED_BAMBOO_AXIS = addAxisLogs("stripped_bamboo_block", "去皮竹块", STRIPPED_BAMBOO_BLOCK, "stripped_bamboo_block_top", "stripped_bamboo_block_side");
var BAMBOO_PLANKS = family("bamboo_planks", "竹板", [], () => ({ ...WOOD_OPTS, all: "bamboo_planks" }));
addPlanks(BAMBOO_PLANKS);
{
  const m = { key: "bamboo", name: "竹", block: BAMBOO_PLANKS, hardness: 2, tool: "axe", tier: 0, sound: "wood" };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign("bamboo", "竹");
}
var BAMBOO_MOSAIC = family("bamboo_mosaic", "竹马赛克", [], () => ({ ...WOOD_OPTS, all: "bamboo_mosaic" }));
addMaterialShapes({ key: "bamboo_mosaic", name: "竹马赛克", block: BAMBOO_MOSAIC, hardness: 2, tool: "axe", tier: 0, sound: "wood" });
var STRIP = new Map;
var WOOD_EXTRAS = WOOD_TYPES.map((w) => {
  const k = w.key;
  const sTop = `stripped_${k}_log_top`, sSide = `stripped_${k}_log_side`;
  const strippedLog = family(`stripped_${k}_log`, `去皮${w.name}原木`, [], () => ({
    ...WOOD_OPTS,
    top: sTop,
    side: sSide
  }));
  const sAxis = addAxisLogs(`stripped_${k}`, `去皮${w.name}原木`, strippedLog, sTop, sSide, w);
  const woodBlock = family(`${k}_wood`, w.wood, [], () => ({ ...WOOD_OPTS, all: `${k}_log_side` }));
  const strippedWood = family(`stripped_${k}_wood`, `去皮${w.wood}`, [], () => ({ ...WOOD_OPTS, all: sSide }));
  for (const id of [strippedLog, woodBlock, strippedWood])
    addWoodLog(id, w);
  STRIP.set(w.log, strippedLog);
  STRIP.set(woodBlock, strippedWood);
  for (const a of [AXIS_X, AXIS_Z])
    STRIP.set(LOG_AXIS[k] + a, sAxis + a);
  return { wood: w, strippedLog, woodBlock, strippedWood };
});
STRIP.set(BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK);
for (const a of [AXIS_X, AXIS_Z])
  STRIP.set(BAMBOO_BLOCK_AXIS + a, STRIPPED_BAMBOO_AXIS + a);
function addStrip(from, to) {
  STRIP.set(from, to);
}
var WOODS2_INVENTORY = [
  ...WOOD_EXTRAS.flatMap((e) => [e.strippedLog, e.woodBlock, e.strippedWood]),
  MANGROVE_ROOTS,
  MUDDY_MANGROVE_ROOTS,
  BAMBOO,
  BAMBOO_BLOCK,
  STRIPPED_BAMBOO_BLOCK,
  BAMBOO_PLANKS,
  BAMBOO_MOSAIC
];
function bambooGrowsOn(below) {
  return isBamboo(below) || BAMBOO_SOIL.has(below);
}
// goodPG/src/shared/blocks/colors.ts
var DYE_COLORS = [
  "white",
  "orange",
  "magenta",
  "light_blue",
  "yellow",
  "lime",
  "pink",
  "gray",
  "light_gray",
  "cyan",
  "purple",
  "blue",
  "brown",
  "green",
  "red",
  "black"
];
var COLOR_NAMES = {
  white: ["白色", "白色"],
  orange: ["橙色", "橙色"],
  magenta: ["品红色", "品红色"],
  light_blue: ["淡蓝色", "淡蓝色"],
  yellow: ["黄色", "黄色"],
  lime: ["黄绿色", "黄绿色"],
  pink: ["粉红色", "粉红色"],
  gray: ["灰色", "灰色"],
  light_gray: ["淡灰色", "淡灰色"],
  cyan: ["青色", "青色"],
  purple: ["紫色", "紫色"],
  blue: ["蓝色", "蓝色"],
  brown: ["棕色", "棕色"],
  green: ["绿色", "绿色"],
  red: ["红色", "红色"],
  black: ["黑色", "黑色"]
};
var masc = (c) => COLOR_NAMES[c][0];
var fem = (c) => COLOR_NAMES[c][1];
var needsFloor2 = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1;
};
var WOOL = {
  white: WHITE_WOOL,
  black: BLACK_WOOL,
  red: RED_WOOL,
  orange: ORANGE_WOOL,
  yellow: YELLOW_WOOL,
  lime: LIME_WOOL,
  blue: BLUE_WOOL,
  purple: PURPLE_WOOL
};
for (const c of DYE_COLORS) {
  if (WOOL[c] !== undefined)
    continue;
  WOOL[c] = family(`${c}_wool`, `${fem(c)}羊毛`, [], () => ({ all: `${c}_wool`, sound: "wool", hardness: 0.8, category: "colores" }));
}
for (const c of DYE_COLORS) {
  if (COLORED_TERRACOTTA[c] !== undefined)
    continue;
  COLORED_TERRACOTTA[c] = family(`${c}_terracotta`, `${fem(c)}陶瓦`, [], () => ({
    all: `${c}_terracotta`,
    hardness: 1.25,
    tool: "pickaxe",
    tier: 1,
    category: "colores"
  }));
}
var CARPETS = {};
for (const c of DYE_COLORS) {
  CARPETS[c] = family(`${c}_carpet`, `${fem(c)}地毯`, [], () => ({
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.1,
    sound: "wool",
    all: `${c}_wool`,
    category: "colores",
    model: [mbox(0, 0, 0, 16, 1, 16, L(`${c}_wool`))],
    collision: [0, 0, 0, 1, 1 / 16, 1],
    support: needsFloor2
  }));
}
var CONCRETE = {};
var CONCRETE_POWDER = {};
var POWDER_TO_CONCRETE = new Map;
for (const c of DYE_COLORS) {
  CONCRETE[c] = family(`${c}_concrete`, `${masc(c)}混凝土`, [], () => ({
    all: `${c}_concrete`,
    hardness: 1.8,
    tool: "pickaxe",
    tier: 1,
    category: "colores"
  }));
}
for (const c of DYE_COLORS) {
  CONCRETE_POWDER[c] = family(`${c}_concrete_powder`, `${masc(c)}混凝土粉末`, [], () => ({
    all: `${c}_concrete_powder`,
    hardness: 0.5,
    tool: "shovel",
    sound: "sand",
    category: "colores"
  }));
  POWDER_TO_CONCRETE.set(CONCRETE_POWDER[c], CONCRETE[c]);
}
var STAINED_GLASS = {};
var STAINED_GLASS_PANES = {};
var STAINED_GLASS_IDS = new Set;
for (const c of DYE_COLORS) {
  STAINED_GLASS[c] = family(`${c}_stained_glass`, `${masc(c)}染色玻璃`, [], () => ({
    all: `${c}_stained_glass`,
    render: R_TRANSLUCENT,
    lightOpacity: 0,
    hardness: 0.3,
    sound: "glass",
    category: "colores"
  }));
  STAINED_GLASS_IDS.add(STAINED_GLASS[c]);
  PANE_IDS.add(STAINED_GLASS[c]);
}
for (const c of DYE_COLORS) {
  const name = `${c}_stained_glass`;
  STAINED_GLASS_PANES[c] = family(`${c}_stained_glass_pane`, `${masc(c)}染色玻璃板`, [], () => {
    const g = L(name);
    const arm = (d) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, g)], d);
    const flat = (d) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
    return {
      render: R_MODEL,
      hardness: 0.3,
      sound: "glass",
      all: name,
      flatItem: name,
      category: "colores",
      shape: (get) => {
        const boxes = [mbox(7, 0, 7, 9, 16, 9, g)];
        for (let d = 0;d < 4; d++)
          if (paneConnects(get(DIR_X[d], 0, DIR_Z[d])))
            boxes.push(...arm(d));
        return boxes;
      },
      collision: (get) => {
        const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
        for (let d = 0;d < 4; d++)
          if (paneConnects(get(DIR_X[d], 0, DIR_Z[d])))
            out.push(...flat(d));
        return out;
      }
    };
  });
  STAINED_GLASS_IDS.add(STAINED_GLASS_PANES[c]);
  PANE_IDS.add(STAINED_GLASS_PANES[c]);
}
var GLAZED_TERRACOTTA = {};
var GLAZED_BASES = new Set;
for (const c of DYE_COLORS) {
  GLAZED_TERRACOTTA[c] = family(`${c}_glazed_terracotta`, `${fem(c)}带釉陶瓦`, [["facing", 4]], (st) => ({
    all: `${c}_glazed_terracotta`,
    hardness: 1.4,
    tool: "pickaxe",
    tier: 1,
    category: "colores",
    texRot: st.facing & 1 ? 63 : 0
  }));
  GLAZED_BASES.add(GLAZED_TERRACOTTA[c]);
}
for (const c of DYE_COLORS) {
  if (BEDS[c] !== undefined)
    continue;
  BEDS[c] = family(`${c}_bed`, `${fem(c)}床`, [["facing", 4], ["part", 2]], (st) => {
    const wool = L(`${c}_wool`), pillow = L("white_wool"), wood = L("oak_planks");
    const mattress = mbox(0, 3, 0, 16, 9, 16, [wool, wool, wool, wood, wool, wool]);
    const boxes = st.part === 0 ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)] : [mattress, mbox(1, 9, 1, 15, 11, 7, pillow), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
    return {
      render: R_MODEL,
      hardness: 0.2,
      sound: "wool",
      all: `${c}_wool`,
      category: "decoracion",
      model: rotateBoxes(boxes, st.facing),
      collision: [0, 0, 0, 1, 9 / 16, 1]
    };
  });
}
var MAX_CANDLES = 4;
var CANDLE_SPOTS = [
  [[7, 7, 6]],
  [[5, 7, 6], [9, 6, 5]],
  [[7, 5, 6], [5, 9, 5], [9, 8, 4]],
  [[5, 5, 6], [9, 5, 5], [5, 9, 5], [9, 9, 4]]
];
var CANDLE_BASES = new Set;
function candleFamily(key, name, bodyTex) {
  const base = family(key, name, [["count", MAX_CANDLES], ["lit", 2]], (st) => {
    const body = L(bodyTex), wick = L("black_concrete"), flame = L("candle_flame");
    const spots = CANDLE_SPOTS[st.count];
    const boxes = [];
    const bodies = [];
    for (const [x, z, h] of spots) {
      boxes.push(mbox(x, 0, z, x + 2, h, z + 2, body), mbox(x, h, z, x + 1, h + 1, z + 1, wick));
      if (st.lit)
        boxes.push(mbox(x, h + 1, z, x + 1, h + 3, z + 1, flame));
      bodies.push(x / 16, 0, z / 16, (x + 2) / 16, h / 16, (z + 2) / 16);
    }
    return {
      render: R_MODEL,
      opaque: false,
      lightOpacity: 0,
      hardness: 0.1,
      sound: "wool",
      all: bodyTex,
      category: "colores",
      emission: st.lit ? 3 * (st.count + 1) : 0,
      model: boxes,
      collision: bodies,
      selection: unionBox(bodies.concat(flatBoxes(boxes.filter((b) => b.tex[0] === wick)))),
      itemModel: [mbox(6, 0, 6, 10, 11, 10, body), mbox(7, 11, 7, 8, 13, 8, wick)],
      support: needsFloor2
    };
  });
  CANDLE_BASES.add(base);
  return base;
}
var CANDLE = candleFamily("candle", "蜡烛", "candle");
var CANDLES = {};
for (const c of DYE_COLORS)
  CANDLES[c] = candleFamily(`${c}_candle`, `${fem(c)}蜡烛`, `${c}_concrete`);
function candleState(id, count, lit) {
  return stateOf(familyBase(id), { count: Math.max(1, Math.min(MAX_CANDLES, count)) - 1, lit: lit ? 1 : 0 });
}
var BANNERS = {};
var WALL_BANNERS = {};
var BANNER_BASES = new Set;
for (const c of DYE_COLORS) {
  const common = {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 1,
    tool: "axe",
    sound: "wood",
    all: `${c}_wool`,
    category: null
  };
  BANNERS[c] = family(`${c}_banner`, `${masc(c)}旗帜`, [["facing", 4]], (st) => {
    const w = L(`${c}_wool`), p = L("oak_planks");
    return {
      ...common,
      category: "colores",
      model: rotateBoxes([
        mbox(7, 0, 7, 9, 16, 9, p),
        mbox(7, 16, 7, 9, 30, 9, p),
        mbox(1, 28, 6, 15, 30, 8, p),
        mbox(1, 3, 5, 15, 28, 6, w)
      ], st.facing),
      itemModel: [mbox(7, 0, 7, 9, 16, 9, p), mbox(2, 14, 6, 14, 15, 8, p), mbox(3, 3, 5, 13, 14, 6, w)],
      selection: rotateFlat([1 / 16, 0, 5 / 16, 15 / 16, 1, 9 / 16], st.facing),
      support: needsFloor2
    };
  });
  WALL_BANNERS[c] = family(`${c}_wall_banner`, `${masc(c)}旗帜`, [["facing", 4]], (st) => {
    const w = L(`${c}_wool`), p = L("oak_planks");
    return {
      ...common,
      model: rotateBoxes([mbox(1, 14, 14, 15, 16, 16, p), mbox(1, -12, 15, 15, 14, 16, w)], st.facing),
      selection: rotateFlat([1 / 16, 0, 13 / 16, 15 / 16, 1, 1], st.facing),
      wall: st.facing,
      base: BANNERS[c]
    };
  });
  SIGN_WALL_OF[BANNERS[c]] = WALL_BANNERS[c];
  BANNER_BASES.add(BANNERS[c]);
  BANNER_BASES.add(WALL_BANNERS[c]);
}
var COLOR_INVENTORY = [
  ...DYE_COLORS.filter((c) => ![WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL].includes(WOOL[c])).map((c) => WOOL[c]),
  ...DYE_COLORS.map((c) => CARPETS[c]),
  ...DYE_COLORS.map((c) => CONCRETE[c]),
  ...DYE_COLORS.map((c) => CONCRETE_POWDER[c]),
  ...DYE_COLORS.map((c) => STAINED_GLASS[c]),
  ...DYE_COLORS.map((c) => STAINED_GLASS_PANES[c]),
  ...DYE_COLORS.map((c) => GLAZED_TERRACOTTA[c]),
  CANDLE,
  ...DYE_COLORS.map((c) => CANDLES[c]),
  ...DYE_COLORS.map((c) => BANNERS[c])
];
// goodPG/src/shared/blocks/stoneBlocks.ts
var stone = (tex, hardness, o = {}) => ({
  all: tex,
  hardness,
  tool: "pickaxe",
  tier: 1,
  sound: "stone",
  ...o
});
var block = (key, name, o) => family(key, name, [], () => o);
var SMOOTH_STONE = block("smooth_stone", "平滑石头", stone("smooth_stone", 2));
var CHISELED_STONE_BRICKS = block("chiseled_stone_bricks", "雕纹石砖", stone("chiseled_stone_bricks", 1.5));
var POLISHED_GRANITE = block("polished_granite", "磨制花岗岩", stone("polished_granite", 1.5));
var POLISHED_DIORITE = block("polished_diorite", "磨制闪长岩", stone("polished_diorite", 1.5));
var POLISHED_ANDESITE = block("polished_andesite", "磨制安山岩", stone("polished_andesite", 1.5));
var POLISHED_DEEPSLATE = block("polished_deepslate", "磨制深板岩", stone("polished_deepslate", 3.5));
var DEEPSLATE_BRICKS = block("deepslate_bricks", "深板岩砖", stone("deepslate_bricks", 3.5));
var CRACKED_DEEPSLATE_BRICKS = block("cracked_deepslate_bricks", "裂纹深板岩砖", stone("cracked_deepslate_bricks", 3.5));
var DEEPSLATE_TILES = block("deepslate_tiles", "深板岩瓦", stone("deepslate_tiles", 3.5));
var CRACKED_DEEPSLATE_TILES = block("cracked_deepslate_tiles", "裂纹深板岩瓦", stone("cracked_deepslate_tiles", 3.5));
var CHISELED_DEEPSLATE = block("chiseled_deepslate", "雕纹深板岩", stone("chiseled_deepslate", 3.5));
var POLISHED_TUFF = block("polished_tuff", "磨制凝灰岩", stone("polished_tuff", 1.5));
var TUFF_BRICKS = block("tuff_bricks", "凝灰岩砖", stone("tuff_bricks", 1.5));
var CHISELED_TUFF = block("chiseled_tuff", "雕纹凝灰岩", stone("chiseled_tuff", 1.5, { top: "chiseled_tuff_top" }));
var CHISELED_TUFF_BRICKS = block("chiseled_tuff_bricks", "雕纹凝灰岩砖", stone("chiseled_tuff_bricks", 1.5, { top: "chiseled_tuff_bricks_top" }));
var SMOOTH_SANDSTONE = block("smooth_sandstone", "平滑砂岩", stone("sandstone_top", 2));
var SMOOTH_RED_SANDSTONE = block("smooth_red_sandstone", "平滑红砂岩", stone("red_sandstone_top", 2));
var CUT_RED_SANDSTONE = block("cut_red_sandstone", "切制红砂岩", stone("cut_red_sandstone", 0.8, {
  top: "red_sandstone_top",
  bottom: "red_sandstone_bottom"
}));
var CHISELED_RED_SANDSTONE = block("chiseled_red_sandstone", "雕纹红砂岩", stone("chiseled_red_sandstone", 0.8, {
  top: "red_sandstone_top",
  bottom: "red_sandstone_bottom"
}));
var MUD = block("mud", "泥", {
  all: "mud",
  hardness: 0.5,
  tool: "shovel",
  sound: "dirt",
  category: "naturaleza",
  collision: [0, 0, 0, 1, 14 / 16, 1]
});
var PACKED_MUD = block("packed_mud", "泥坯", { all: "packed_mud", hardness: 1, tool: "pickaxe", sound: "dirt" });
var MUD_BRICKS = block("mud_bricks", "泥砖", stone("mud_bricks", 1.5));
var CINNABAR = block("cinnabar", "朱砂", stone("cinnabar", 1.5, { category: "naturaleza" }));
var POLISHED_CINNABAR = block("polished_cinnabar", "磨制朱砂", stone("polished_cinnabar", 1.5));
var CINNABAR_BRICKS = block("cinnabar_bricks", "朱砂砖", stone("cinnabar_bricks", 1.5));
var CHISELED_CINNABAR = block("chiseled_cinnabar", "雕纹朱砂", stone("chiseled_cinnabar", 1.5));
var SULFUR = block("sulfur", "硫磺", stone("sulfur", 1.5, { category: "naturaleza" }));
var POLISHED_SULFUR = block("polished_sulfur", "磨制硫磺", stone("polished_sulfur", 1.5));
var SULFUR_BRICKS = block("sulfur_bricks", "硫磺砖", stone("sulfur_bricks", 1.5));
var CHISELED_SULFUR = block("chiseled_sulfur", "雕纹硫磺", stone("chiseled_sulfur", 1.5));
var mat = (key, name, b, hardness, tier = 1, sound = "stone") => ({
  key,
  name,
  block: b,
  hardness,
  tool: "pickaxe",
  tier,
  sound
});
var SHAPED = [
  mat("mossy_cobblestone", "苔石", MOSSY_COBBLESTONE, 2),
  mat("mossy_stone_brick", "苔石砖", MOSSY_STONE_BRICKS, 1.5),
  mat("granite", "花岗岩", GRANITE, 1.5),
  mat("diorite", "闪长岩", DIORITE, 1.5),
  mat("andesite", "安山岩", ANDESITE, 1.5),
  mat("polished_granite", "磨制花岗岩", POLISHED_GRANITE, 1.5),
  mat("polished_diorite", "磨制闪长岩", POLISHED_DIORITE, 1.5),
  mat("polished_andesite", "磨制安山岩", POLISHED_ANDESITE, 1.5),
  mat("polished_deepslate", "磨制深板岩", POLISHED_DEEPSLATE, 3.5),
  mat("deepslate_brick", "深板岩砖", DEEPSLATE_BRICKS, 3.5),
  mat("deepslate_tile", "深板岩瓦", DEEPSLATE_TILES, 3.5),
  mat("tuff", "凝灰岩", TUFF, 1.5),
  mat("polished_tuff", "磨制凝灰岩", POLISHED_TUFF, 1.5),
  mat("tuff_brick", "凝灰岩砖", TUFF_BRICKS, 1.5),
  mat("smooth_sandstone", "平滑砂岩", SMOOTH_SANDSTONE, 2),
  mat("red_sandstone", "红砂岩", RED_SANDSTONE, 0.8),
  mat("smooth_red_sandstone", "平滑红砂岩", SMOOTH_RED_SANDSTONE, 2),
  mat("mud_brick", "泥砖", MUD_BRICKS, 1.5),
  mat("cinnabar", "朱砂", CINNABAR, 1.5),
  mat("polished_cinnabar", "磨制朱砂", POLISHED_CINNABAR, 1.5),
  mat("cinnabar_brick", "朱砂砖", CINNABAR_BRICKS, 1.5),
  mat("sulfur", "硫磺", SULFUR, 1.5),
  mat("polished_sulfur", "磨制硫磺", POLISHED_SULFUR, 1.5),
  mat("sulfur_brick", "硫磺砖", SULFUR_BRICKS, 1.5)
];
for (const m of SHAPED)
  addMaterialShapes(m);
function addSlab(m, side) {
  const base = defs[m.block].tex;
  const tex = side ? [side, side, base[2], base[3], side, side] : base;
  const t = tex.map(L);
  const opts = { hardness: m.hardness, tool: m.tool, tier: m.tier, sound: m.sound, tex };
  const id = family(`${m.key}_slab`, `${m.name}台阶`, [["type", 3]], (st) => {
    if (st.type === 2)
      return { ...opts, render: R_CUBE };
    return { ...opts, render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
  });
  SLABS[m.key] = id;
  return id;
}
var SLAB_ONLY = [
  mat("smooth_stone", "平滑石头", SMOOTH_STONE, 2),
  mat("cut_sandstone", "切制砂岩", CUT_SANDSTONE, 0.8),
  mat("cut_red_sandstone", "切制红砂岩", CUT_RED_SANDSTONE, 0.8)
];
for (const m of SLAB_ONLY)
  addSlab(m, m.key === "smooth_stone" ? "smooth_stone_slab_side" : undefined);
var WALLED = [
  ["mossy_stone_brick", "苔石砖", MOSSY_STONE_BRICKS, 1.5],
  ["cobbled_deepslate", "深板岩圆石", COBBLED_DEEPSLATE, 3.5],
  ["polished_deepslate", "磨制深板岩", POLISHED_DEEPSLATE, 3.5],
  ["deepslate_brick", "深板岩砖", DEEPSLATE_BRICKS, 3.5],
  ["deepslate_tile", "深板岩瓦", DEEPSLATE_TILES, 3.5],
  ["tuff", "凝灰岩", TUFF, 1.5],
  ["polished_tuff", "磨制凝灰岩", POLISHED_TUFF, 1.5],
  ["tuff_brick", "凝灰岩砖", TUFF_BRICKS, 1.5],
  ["red_sandstone", "红砂岩", RED_SANDSTONE, 0.8],
  ["mud_brick", "泥砖", MUD_BRICKS, 1.5],
  ["cinnabar", "朱砂", CINNABAR, 1.5],
  ["polished_cinnabar", "磨制朱砂", POLISHED_CINNABAR, 1.5],
  ["cinnabar_brick", "朱砂砖", CINNABAR_BRICKS, 1.5],
  ["sulfur", "硫磺", SULFUR, 1.5],
  ["polished_sulfur", "磨制硫磺", POLISHED_SULFUR, 1.5],
  ["sulfur_brick", "硫磺砖", SULFUR_BRICKS, 1.5]
];
for (const [key, name, b, hardness] of WALLED)
  addWall({ key, name, block: b, hardness });
var STONE_INVENTORY = [
  SMOOTH_STONE,
  CHISELED_STONE_BRICKS,
  POLISHED_GRANITE,
  POLISHED_DIORITE,
  POLISHED_ANDESITE,
  POLISHED_DEEPSLATE,
  DEEPSLATE_BRICKS,
  CRACKED_DEEPSLATE_BRICKS,
  DEEPSLATE_TILES,
  CRACKED_DEEPSLATE_TILES,
  CHISELED_DEEPSLATE,
  POLISHED_TUFF,
  TUFF_BRICKS,
  CHISELED_TUFF,
  CHISELED_TUFF_BRICKS,
  SMOOTH_SANDSTONE,
  SMOOTH_RED_SANDSTONE,
  CUT_RED_SANDSTONE,
  CHISELED_RED_SANDSTONE,
  MUD,
  PACKED_MUD,
  MUD_BRICKS,
  CINNABAR,
  POLISHED_CINNABAR,
  CINNABAR_BRICKS,
  CHISELED_CINNABAR,
  SULFUR,
  POLISHED_SULFUR,
  SULFUR_BRICKS,
  CHISELED_SULFUR,
  ...SLAB_ONLY.map((m) => SLABS[m.key])
];
// goodPG/src/shared/blocks/copperBlocks.ts
var OXIDATION_STAGES = 4;
var STAGE_PREFIX = ["", "exposed_", "weathered_", "oxidized_"];
var STAGE_NAME = ["", "斑驳的", "风化的", "氧化的"];
function copperTexture(base, stage) {
  if (base === "copper_block")
    return stage === 0 ? "copper_block" : `${STAGE_PREFIX[stage]}copper`;
  return STAGE_PREFIX[stage] + base;
}
var COPPER = {};
var INFO = new Map;
var INVENTORY = [];
var metal = (hardness, category) => ({ hardness, tool: "pickaxe", tier: 1, sound: "metal", category });
function copperName(noun, stage, waxed) {
  return (waxed ? "涂蜡的" : "") + STAGE_NAME[stage] + noun;
}
function copperKey(base, stage, waxed) {
  const k = base === "copper_block" && stage > 0 ? `${STAGE_PREFIX[stage]}copper` : STAGE_PREFIX[stage] + base;
  return (waxed ? "waxed_" : "") + k;
}
function variants(kind, keyBase, noun, props, make, existing) {
  COPPER[kind] = [[], []];
  for (const waxed of [false, true]) {
    for (let stage = 0;stage < OXIDATION_STAGES; stage++) {
      const id = existing !== undefined && !waxed && stage === 0 ? existing : family(copperKey(keyBase, stage, waxed), copperName(noun, stage, waxed), props, make(stage));
      COPPER[kind][waxed ? 1 : 0][stage] = id;
      INFO.set(id, { kind, stage, waxed });
      if (id !== existing)
        INVENTORY.push(id);
    }
  }
}
function addCopperVariants(kind, keyBase, noun, props, make) {
  variants(kind, keyBase, noun, props, make);
  return COPPER[kind];
}
var RAW_COPPER_BLOCK = family("raw_copper_block", "粗铜块", [], () => ({
  all: "raw_copper_block",
  hardness: 5,
  tool: "pickaxe",
  tier: 2,
  sound: "stone",
  category: "minerales"
}));
INVENTORY.push(RAW_COPPER_BLOCK);
Object.assign(defs[COPPER_BLOCK], { hardness: 3, tool: "pickaxe", tier: 1 });
variants("block", "copper_block", "铜块", [], (s) => () => ({
  ...metal(3, "minerales"),
  all: copperTexture("copper_block", s)
}), COPPER_BLOCK);
variants("cut", "cut_copper", "切制铜块", [], (s) => () => ({ ...metal(3, "construccion"), all: copperTexture("cut_copper", s) }));
variants("chiseled", "chiseled_copper", "雕纹铜块", [], (s) => () => ({
  ...metal(3, "construccion"),
  all: copperTexture("chiseled_copper", s)
}));
variants("grate", "copper_grate", "铜格栅", [], (s) => () => ({
  ...metal(3, "construccion"),
  all: copperTexture("copper_grate", s),
  render: R_CUTOUT,
  lightOpacity: 0
}));
variants("cut_slab", "cut_copper_slab", "切制铜台阶", [["type", 3]], (s) => (st) => {
  const cut = COPPER.cut[0][s];
  const t = texOf(cut);
  const o = { ...metal(3, "construccion"), tex: defs[cut].tex };
  if (st.type === 2)
    return { ...o, render: R_CUBE };
  return { ...o, render: R_MODEL, model: [st.type === 0 ? mbox(0, 0, 0, 16, 8, 16, t) : mbox(0, 8, 0, 16, 16, 16, t)] };
});
variants("cut_stairs", "cut_copper_stairs", "切制铜楼梯", [["facing", 4], ["half", 2]], (s) => (st) => {
  const cut = COPPER.cut[0][s];
  const t = texOf(cut);
  const boxes = st.half === 0 ? [mbox(0, 0, 0, 16, 8, 16, t), mbox(0, 8, 0, 16, 16, 8, t)] : [mbox(0, 8, 0, 16, 16, 16, t), mbox(0, 0, 0, 16, 8, 8, t)];
  return { ...metal(3, "construccion"), tex: defs[cut].tex, render: R_MODEL, model: rotateBoxes(boxes, st.facing) };
});
variants("door", "copper_door", "铜门", [["facing", 4], ["half", 2], ["open", 2], ["hinge", 2]], (s) => (st) => {
  const name = copperTexture(st.half ? "copper_door_top" : "copper_door_bottom", s);
  const tx = L(name);
  const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
  const bottom = copperTexture("copper_door_bottom", s);
  return {
    ...metal(3, "decoracion"),
    render: R_MODEL,
    model: rotateBoxes([panel], st.facing),
    tex: [bottom, bottom, bottom, bottom, bottom, bottom],
    walkThrough: st.open === 1
  };
});
variants("trapdoor", "copper_trapdoor", "铜活板门", [["facing", 4], ["half", 2], ["open", 2]], (s) => (st) => {
  const name = copperTexture("copper_trapdoor", s);
  const tx = L(name);
  const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing) : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
  return { ...metal(3, "decoracion"), render: R_MODEL, model: box, tex: [name, name, name, name, name, name] };
});
function barsConnect(id) {
  return id > 0 && (INFO.get(familyBase(id))?.kind === "bars" || BLOCK_OPAQUE[id] === 1);
}
variants("bars", "copper_bars", "铜栏杆", [], (s) => () => {
  const name = copperTexture("copper_bars", s);
  const b = L(name);
  const arm = (d) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, b)], d);
  const flat = (d) => rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 7 / 16], d);
  return {
    ...metal(5, "decoracion"),
    render: R_MODEL,
    all: name,
    flatItem: name,
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, b)];
      for (let d = 0;d < 4; d++)
        if (barsConnect(get(DIR_X[d], 0, DIR_Z[d])))
          boxes.push(...arm(d));
      return boxes;
    },
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0;d < 4; d++)
        if (barsConnect(get(DIR_X[d], 0, DIR_Z[d])))
          out.push(...flat(d));
      return out;
    }
  };
});
var CHAIN_X = 1;
var CHAIN_Z = 2;
function chainBoxes(axis, t) {
  const n = -1;
  if (axis === CHAIN_X)
    return [mbox(0, 6, 8, 16, 10, 8, [n, n, n, n, t, t]), mbox(0, 8, 6, 16, 8, 10, [n, n, t, t, n, n])];
  if (axis === CHAIN_Z)
    return [mbox(8, 6, 0, 8, 10, 16, [t, t, n, n, n, n]), mbox(6, 8, 0, 10, 8, 16, [n, n, t, t, n, n])];
  return [mbox(6, 0, 8, 10, 16, 8, [n, n, n, n, t, t]), mbox(8, 0, 6, 8, 16, 10, [t, t, n, n, n, n])];
}
var CHAIN_BOX = [
  [6.5 / 16, 0, 6.5 / 16, 9.5 / 16, 1, 9.5 / 16],
  [0, 6.5 / 16, 6.5 / 16, 1, 9.5 / 16, 9.5 / 16],
  [6.5 / 16, 6.5 / 16, 0, 9.5 / 16, 9.5 / 16, 1]
];
variants("chain", "copper_chain", "铜链", [["axis", 3]], (s) => (st) => {
  const name = copperTexture("copper_chain", s);
  return {
    ...metal(5, "decoracion"),
    render: R_MODEL,
    all: name,
    flatItem: name,
    model: chainBoxes(st.axis, L(name)),
    collision: CHAIN_BOX[st.axis],
    selection: CHAIN_BOX[st.axis]
  };
});
function lanternBoxes(hanging, side, top) {
  const n = -1;
  const f = [side, side, top, top, side, side];
  const y = hanging ? 1 : 0;
  const boxes = [mbox(5, y, 5, 11, y + 7, 11, f), mbox(6, y + 7, 6, 10, y + 9, 10, f)];
  const y0 = y + 9, y1 = hanging ? 16 : y + 11;
  boxes.push(mbox(7, y0, 8, 9, y1, 8, [n, n, n, n, side, side]), mbox(8, y0, 7, 8, y1, 9, [side, side, n, n, n, n]));
  return boxes;
}
variants("lantern", "copper_lantern", "铜灯笼", [["hanging", 2]], (s) => (st) => {
  const name = copperTexture("copper_lantern", s);
  const hanging = st.hanging === 1;
  const box = hanging ? [5 / 16, 1 / 16, 5 / 16, 11 / 16, 10 / 16, 11 / 16] : [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16];
  return {
    ...metal(3.5, "decoracion"),
    render: R_MODEL,
    all: name,
    flatItem: name,
    emission: 15,
    lightOpacity: 0,
    model: lanternBoxes(hanging, L(name), L(copperTexture("copper_block", s))),
    collision: box,
    selection: box,
    support: (get) => {
      const b = hanging ? get(0, 1, 0) : get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    }
  };
});
var COPPER_TORCH = family("copper_torch", "铜火把", [], () => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: 14,
  sound: "wood",
  all: "copper_torch",
  hardness: 0,
  category: "decoracion"
}));
var COPPER_WALL_TORCH = family("copper_wall_torch", "铜火把", [["facing", 4]], (st) => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: 14,
  sound: "wood",
  all: "copper_torch",
  hardness: 0,
  category: null,
  wall: st.facing,
  base: COPPER_TORCH,
  selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing)
}));
INVENTORY.push(COPPER_TORCH);
for (const [kind, k] of [["cut_slab", KINDS.slab], ["cut_stairs", KINDS.stairs], ["door", KINDS.door], ["trapdoor", KINDS.trapdoor]]) {
  for (const row of COPPER[kind])
    for (const id of row)
      FAMILY_KINDS.set(id, k);
}
var COPPER_INVENTORY = INVENTORY;
// goodPG/src/shared/blocks/decorBlocks.ts
var POT_STATES = 64;
var NOT_POTTABLE = new Set(["short_grass", "sugar_cane", "cobweb", "tall_grass", "large_fern", "pointed_dripstone"]);
var POTTABLE_WITH_SUPPORT = new Set([
  "torchflower",
  "wither_rose",
  "crimson_fungus",
  "warped_fungus",
  "crimson_roots",
  "warped_roots"
]);
var pottable = null;
var pottableIndex = null;
function pottablePlants() {
  if (!pottable) {
    pottable = [];
    for (const b of defs) {
      if (!b || b.base !== undefined && b.base !== b.id || b.noItem || NOT_POTTABLE.has(b.key))
        continue;
      if (b.render === R_CROSS && (!b.support || POTTABLE_WITH_SUPPORT.has(b.key)) && b.category !== null || b.id === CACTUS)
        pottable.push(b.id);
    }
    pottable = pottable.slice(0, POT_STATES - 1);
    pottableIndex = new Map(pottable.map((id, i) => [id, i + 1]));
  }
  return pottable;
}
var potModels = [];
function potModel(k) {
  const cached = potModels[k];
  if (cached)
    return cached;
  const side = L("flower_pot");
  const plant = k > 0 ? pottablePlants()[k - 1] ?? 0 : 0;
  const top = L(plant ? "flower_pot_soil" : "flower_pot_top");
  const boxes = [mbox(5, 0, 5, 11, 6, 11, [side, side, top, side, side, side])];
  if (plant === CACTUS) {
    const t = defs[CACTUS].tex.map(L);
    boxes.push(mbox(6, 6, 6, 10, 16, 10, [t[0], t[1], t[2], -1, t[4], t[5]]));
  } else if (plant) {
    const p = L(defs[plant].tex[0]);
    boxes.push(mbox(8, 4, 1, 8, 16, 15, [p, p, -1, -1, -1, -1]));
    boxes.push(mbox(1, 4, 8, 15, 16, 8, [-1, -1, -1, -1, p, p]));
  }
  potModels[k] = boxes;
  return boxes;
}
var POT_BOX = [5 / 16, 0, 5 / 16, 11 / 16, 6 / 16, 11 / 16];
var FLOWER_POT = family("flower_pot", "花盆", [["plant", POT_STATES]], (st) => ({
  render: R_MODEL,
  hardness: 0,
  sound: "stone",
  category: "decoracion",
  all: "flower_pot",
  lightOpacity: 0,
  shape: () => potModel(st.plant),
  itemModel: potModel(0),
  collision: POT_BOX,
  selection: POT_BOX
}));
function potWith(plant) {
  pottablePlants();
  const k = pottableIndex.get(plant);
  return k === undefined ? 0 : stateOf(FLOWER_POT, { plant: k });
}
var CHAIN_AXIS_Y = 0;
var CHAIN_AXIS_X = 1;
function chainBoxes2(axis) {
  const v = L("chain"), h = L("chain_h");
  if (axis === CHAIN_AXIS_Y)
    return [mbox(8, 0, 6, 8, 16, 10, [v, v, -1, -1, -1, -1]), mbox(6, 0, 8, 10, 16, 8, [-1, -1, -1, -1, v, v])];
  if (axis === CHAIN_AXIS_X)
    return [mbox(0, 6, 8, 16, 10, 8, [-1, -1, -1, -1, h, h]), mbox(0, 8, 6, 16, 8, 10, [-1, -1, h, h, -1, -1])];
  return [mbox(8, 6, 0, 8, 10, 16, [h, h, -1, -1, -1, -1]), mbox(6, 8, 0, 10, 8, 16, [-1, -1, v, v, -1, -1])];
}
var CHAIN_SEL = [
  [6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16],
  [0, 6 / 16, 6 / 16, 1, 10 / 16, 10 / 16],
  [6 / 16, 6 / 16, 0, 10 / 16, 10 / 16, 1]
];
var IRON_CHAIN = family("iron_chain", "铁链", [["axis", 3]], (st) => ({
  render: R_MODEL,
  hardness: 5,
  tool: "pickaxe",
  sound: "metal",
  category: "decoracion",
  all: "chain",
  lightOpacity: 0,
  model: chainBoxes2(st.axis),
  collision: CHAIN_SEL[st.axis],
  selection: CHAIN_SEL[st.axis],
  flatItem: "chain"
}));
function isChain(id) {
  return familyBase(id) === IRON_CHAIN;
}
function holds(id) {
  return id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);
}
function lanternBoxes2(hanging) {
  const s = L("lantern"), t = L("lantern_top"), c = L("chain");
  const dy = hanging ? 1 : 0;
  const out = [
    mbox(5, dy, 5, 11, 7 + dy, 11, [s, s, t, t, s, s]),
    mbox(6, 7 + dy, 6, 10, 9 + dy, 10, [s, s, t, -1, s, s])
  ];
  if (hanging)
    out.push(mbox(8, 10, 6, 8, 16, 10, [c, c, -1, -1, -1, -1]), mbox(6, 10, 8, 10, 16, 8, [-1, -1, -1, -1, c, c]));
  return out;
}
var LANTERN = family("lantern", "灯笼", [["hanging", 2]], (st) => {
  const boxes = lanternBoxes2(st.hanging === 1);
  const sel = flatBoxes(boxes.slice(0, 2));
  return {
    render: R_MODEL,
    hardness: 3.5,
    tool: "pickaxe",
    sound: "metal",
    category: "decoracion",
    all: "lantern",
    emission: 15,
    lightOpacity: 0,
    model: boxes,
    collision: sel,
    selection: sel,
    itemModel: lanternBoxes2(false),
    support: (get) => st.hanging ? holds(get(0, 1, 0)) : holds(get(0, -1, 0))
  };
});
var BAR_IDS = new Set;
function barsConnect2(id) {
  return id > 0 && (BAR_IDS.has(id) || id === GLASS || familyBase(id) === GLASS_PANE || BLOCK_OPAQUE[id] === 1);
}
var IRON_BARS = family("iron_bars", "铁栏杆", [], () => {
  const b = L("iron_bars");
  const arm = (d) => rotateBoxes([mbox(7, 0, 0, 9, 16, 7, b)], d);
  const flat = (d) => flatBoxes(arm(d));
  return {
    render: R_MODEL,
    hardness: 5,
    tool: "pickaxe",
    sound: "metal",
    category: "decoracion",
    all: "iron_bars",
    lightOpacity: 0,
    flatItem: "iron_bars",
    shape: (get) => {
      const boxes = [mbox(7, 0, 7, 9, 16, 9, b)];
      for (let d = 0;d < 4; d++)
        if (barsConnect2(get(DIR_X[d], 0, DIR_Z[d])))
          boxes.push(...arm(d));
      return boxes;
    },
    itemModel: [mbox(7, 0, 0, 9, 16, 16, b)],
    collision: (get) => {
      const out = [7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16];
      for (let d = 0;d < 4; d++)
        if (barsConnect2(get(DIR_X[d], 0, DIR_Z[d])))
          out.push(...flat(d));
      return out;
    }
  };
});
BAR_IDS.add(IRON_BARS);
var BELL_FLOOR = 0;
var BELL_CEILING = 1;
function bellBoxes(facing, attach) {
  const b = L("bell"), post = L("stone"), bar = L("dark_oak_planks");
  const bell = [mbox(5, 6, 5, 11, 13, 11, b), mbox(4, 4, 4, 12, 6, 12, b)];
  const frame = attach === BELL_FLOOR ? [mbox(0, 0, 6, 2, 16, 10, post), mbox(14, 0, 6, 16, 16, 10, post), mbox(2, 13, 7, 14, 15, 9, bar)] : [mbox(7, 13, 7, 9, 16, 9, bar)];
  return rotateBoxes([...frame, ...bell], facing);
}
var BELL = family("bell", "钟", [["facing", 4], ["attach", 2]], (st) => {
  const boxes = bellBoxes(st.facing, st.attach);
  return {
    render: R_MODEL,
    hardness: 5,
    tool: "pickaxe",
    sound: "metal",
    category: "decoracion",
    all: "bell",
    lightOpacity: 0,
    model: boxes,
    collision: flatBoxes(boxes),
    selection: flatBoxes(boxes),
    support: (get) => st.attach === BELL_CEILING ? holds(get(0, 1, 0)) : holds(get(0, -1, 0))
  };
});
var SCAFFOLD_MAX_DISTANCE = 6;
var SCAFFOLD_SEARCH = 4096;
var SCAFFOLD_ID = -1;
function scaffoldSupported(get) {
  const seen = new Set;
  const queue = [[0, 0, 0, 0]];
  seen.add("0,0,0");
  for (let qi = 0;qi < queue.length && qi < SCAFFOLD_SEARCH; qi++) {
    const [x, y, z, d] = queue[qi];
    const below = get(x, y - 1, z);
    if (below < 0)
      return true;
    if (familyBase(below) === SCAFFOLD_ID) {
      const k = `${x},${y - 1},${z}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([x, y - 1, z, d]);
      }
      continue;
    }
    if (below > 0 && BLOCK_SOLID[below] === 1)
      return true;
    if (d >= SCAFFOLD_MAX_DISTANCE)
      continue;
    for (let dir = 0;dir < 4; dir++) {
      const nx = x + DIR_X[dir], nz = z + DIR_Z[dir];
      const k = `${nx},${y},${nz}`;
      if (seen.has(k))
        continue;
      const n = get(nx, y, nz);
      if (n < 0)
        return true;
      if (familyBase(n) !== SCAFFOLD_ID)
        continue;
      seen.add(k);
      queue.push([nx, y, nz, d + 1]);
    }
  }
  return false;
}
var SCAFFOLDING = family("scaffolding", "脚手架", [], () => ({
  render: R_CUTOUT,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  hardness: 0,
  sound: "wood",
  category: "decoracion",
  top: "scaffolding_top",
  bottom: "scaffolding_top",
  side: "scaffolding_side",
  walkThrough: true,
  support: scaffoldSupported
}));
SCAFFOLD_ID = SCAFFOLDING;
var DECORATED_POT = family("decorated_pot", "饰纹陶罐", [], () => {
  const s = L("decorated_pot_side"), t = L("decorated_pot_top");
  const boxes = [
    mbox(1, 0, 1, 15, 13, 15, [s, s, t, t, s, s]),
    mbox(4, 13, 4, 12, 14, 12, [s, s, -1, -1, s, s]),
    mbox(3, 14, 3, 13, 16, 13, [s, s, t, t, s, s])
  ];
  return {
    render: R_MODEL,
    hardness: 0,
    sound: "stone",
    category: "decoracion",
    all: "decorated_pot_side",
    lightOpacity: 0,
    model: boxes,
    collision: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16],
    selection: flatBoxes(boxes)
  };
});
var PAINTING_CELLS = PAINTINGS.map((v) => {
  const cells = [];
  for (let cy = 0;cy < v.h; cy++) {
    for (let cx = 0;cx < v.w; cx++) {
      const art = paintingCellTexture(v, cx, cy);
      cells.push(family(`painting_${v.key}_${cy * v.w + cx}`, `画作《${v.name}》`, [], () => ({
        tex: ["birch_planks", "birch_planks", "birch_planks", "birch_planks", art, "birch_planks"],
        noItem: true,
        category: null,
        hardness: 0,
        sound: "wood"
      })));
    }
  }
  return cells;
});
var ITEM_FRAME_MODEL = family("item_frame_model", "物品展示框", [], () => ({
  tex: ["oak_planks", "oak_planks", "oak_planks", "oak_planks", "item_frame", "oak_planks"],
  noItem: true,
  category: null,
  hardness: 0,
  sound: "wood"
}));
var DECOR_INVENTORY = [
  FLOWER_POT,
  LANTERN,
  IRON_CHAIN,
  IRON_BARS,
  BELL,
  SCAFFOLDING,
  DECORATED_POT
];
// goodPG/src/shared/blocks/ocean.ts
var BLOCK_WATERLOGGED = new Uint8Array(MAX_BLOCK_ID);
var BLOCK_LEAVES_WATER = new Uint8Array(MAX_BLOCK_ID);
function markWet(base) {
  for (let id = base;defs[id] && familyBase(id) === base; id++)
    if (defs[id].fluid === 1)
      BLOCK_WATERLOGGED[id] = 1;
}
var WET = { fluid: 1, level: 0, lightOpacity: 2 };
var solidBelow = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
};
var seaPlant = (tex, o = {}) => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: tex,
  category: "naturaleza",
  ...o
});
var CORAL_TYPES = ["tube", "brain", "bubble", "fire", "horn"];
var CORAL_NAMES = {
  tube: "管",
  brain: "脑纹",
  bubble: "气泡",
  fire: "火",
  horn: "鹿角"
};
var CORALS = {};
var DEAD_CORALS = {};
var DEAD_OF = new Map;
var LIVE_CORAL_BASES = new Set;
var CORAL_BLOCKS = new Set;
var CORAL_PLANT_BASES = new Set;
var WALL_FAN_BASES = new Set;
function wallFanBoxes(t) {
  return [mbox(0, 6, 5, 16, 7, 16, [-1, -1, t, t, -1, -1]), mbox(2, 7, 9, 14, 8, 16, [-1, -1, t, -1, -1, -1])];
}
function coralSet(type, dead) {
  const pre = dead ? "dead_" : "";
  const name = CORAL_NAMES[type];
  const deadPrefix = dead ? "失活的" : "";
  const blockTex = `${pre}${type}_coral_block`, plantTex = `${pre}${type}_coral`, fanTex = `${pre}${type}_coral_fan`;
  const block = family(`${pre}${type}_coral_block`, `${deadPrefix}${name}珊瑚块`, [], () => ({
    all: blockTex,
    hardness: 1.5,
    tool: "pickaxe",
    tier: 1,
    sound: "stone",
    category: "naturaleza"
  }));
  const coral = family(`${pre}${type}_coral`, `${deadPrefix}${name}珊瑚`, [["water", 2]], (st) => ({
    ...seaPlant(plantTex, { sound: "stone" }),
    ...st.water ? WET : {},
    support: solidBelow
  }));
  const fan = family(`${pre}${type}_coral_fan`, `${deadPrefix}${name}珊瑚扇`, [["water", 2]], (st) => ({
    ...seaPlant(fanTex, { sound: "stone" }),
    ...st.water ? WET : {},
    support: solidBelow
  }));
  const wallFan = family(`${pre}${type}_coral_wall_fan`, `${deadPrefix}${name}珊瑚扇`, [["water", 2], ["facing", 4]], (st) => {
    const d = st.facing;
    return {
      render: R_MODEL,
      solid: false,
      opaque: false,
      lightOpacity: 0,
      hardness: 0,
      sound: "stone",
      all: fanTex,
      category: null,
      noItem: true,
      base: fan,
      walkThrough: true,
      ...st.water ? WET : {},
      model: rotateBoxes(wallFanBoxes(L(fanTex)), d),
      collision: [],
      selection: rotateFlat([0, 4 / 16, 5 / 16, 1, 9 / 16, 1], d),
      support: (get) => {
        const b = get(-DIR_X[d], 0, -DIR_Z[d]);
        return b < 0 || BLOCK_SOLID[b] === 1;
      }
    };
  });
  for (const b of [coral, fan, wallFan])
    markWet(b);
  CORAL_BLOCKS.add(block);
  CORAL_PLANT_BASES.add(coral).add(fan).add(wallFan);
  WALL_FAN_BASES.add(wallFan);
  return { block, coral, fan, wallFan };
}
for (const type of CORAL_TYPES) {
  CORALS[type] = coralSet(type, false);
  DEAD_CORALS[type] = coralSet(type, true);
  const a = CORALS[type], d = DEAD_CORALS[type];
  for (const k of ["block", "coral", "fan", "wallFan"]) {
    DEAD_OF.set(a[k], d[k]);
    LIVE_CORAL_BASES.add(a[k]);
  }
}
var KELP = family("kelp", "海带", [["part", 3]], (st) => ({
  ...seaPlant(st.part === 2 ? "kelp_plant" : "kelp"),
  ...st.part ? WET : {},
  support: (get) => {
    if (st.part === 0)
      return false;
    const b = get(0, -1, 0);
    return b < 0 || isKelp(b) || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
  }
}));
markWet(KELP);
var KELP_TOP = KELP + 1;
var KELP_STEM = KELP + 2;
var isKelp = (id) => id === KELP_TOP || id === KELP_STEM;
var DRIED_KELP_BLOCK = family("dried_kelp_block", "干海带块", [], () => ({
  top: "dried_kelp_top",
  side: "dried_kelp_side",
  hardness: 0.5,
  sound: "grass",
  category: "naturaleza"
}));
var SEAGRASS = family("seagrass", "海草", [["kind", 4]], (st) => ({
  ...seaPlant(["seagrass", "seagrass", "tall_seagrass_bottom", "tall_seagrass_top"][st.kind]),
  ...st.kind ? WET : {},
  replaceable: st.kind > 0,
  noItem: false,
  support: (get) => {
    if (st.kind === 0)
      return false;
    if (st.kind === 3) {
      const b = get(0, -1, 0);
      return b < 0 || b === SEAGRASS + 2;
    }
    if (!solidBelow(get))
      return false;
    if (st.kind === 2) {
      const a = get(0, 1, 0);
      return a < 0 || a === SEAGRASS + 3;
    }
    return true;
  }
}));
markWet(SEAGRASS);
var SEAGRASS_SHORT = SEAGRASS + 1;
var TALL_SEAGRASS_LOWER = SEAGRASS + 2;
var TALL_SEAGRASS_UPPER = SEAGRASS + 3;
var PICKLE_BOXES = [
  [6, 0, 6, 10, 6, 10],
  [2, 0, 3, 6, 4, 7],
  [9, 0, 9, 13, 6, 13],
  [10, 0, 2, 13, 5, 5]
];
var SEA_PICKLE = family("sea_pickle", "海泡菜", [["count", 4], ["water", 2]], (st) => {
  const t = L("sea_pickle");
  const model = PICKLE_BOXES.slice(0, st.count + 1).map(([x0, y0, z0, x1, y1, z1]) => mbox(x0, y0, z0, x1, y1, z1, t));
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "wool",
    all: "sea_pickle",
    category: "naturaleza",
    solid: false,
    walkThrough: true,
    ...st.water ? { ...WET, emission: [6, 9, 12, 15][st.count] } : {},
    model,
    collision: [],
    selection: [2 / 16, 0, 2 / 16, 14 / 16, 6 / 16, 14 / 16],
    support: solidBelow
  };
});
markWet(SEA_PICKLE);
function seaPickleBlock(n, water) {
  return stateOf(SEA_PICKLE, { count: Math.max(1, Math.min(4, n)) - 1, water: water ? 1 : 0 });
}
var prismarine = (key, name, tex) => family(key, name, [], () => ({
  all: tex,
  hardness: 1.5,
  tool: "pickaxe",
  tier: 1,
  sound: "stone"
}));
var PRISMARINE = prismarine("prismarine", "海晶石", "prismarine");
var PRISMARINE_BRICKS = prismarine("prismarine_bricks", "海晶石砖", "prismarine_bricks");
var DARK_PRISMARINE = prismarine("dark_prismarine", "暗海晶石", "dark_prismarine");
addMaterialShapes({ key: "prismarine", name: "海晶石", block: PRISMARINE, hardness: 1.5, tool: "pickaxe", tier: 1, sound: "stone" });
addMaterialShapes({
  key: "prismarine_brick",
  name: "海晶石砖",
  block: PRISMARINE_BRICKS,
  hardness: 1.5,
  tool: "pickaxe",
  tier: 1,
  sound: "stone"
});
addMaterialShapes({
  key: "dark_prismarine",
  name: "暗海晶石",
  block: DARK_PRISMARINE,
  hardness: 1.5,
  tool: "pickaxe",
  tier: 1,
  sound: "stone"
});
var PRISMARINE_WALL = addWall({ key: "prismarine", name: "海晶石", block: PRISMARINE, hardness: 1.5 });
var SPONGE = family("sponge", "海绵", [], () => ({
  all: "sponge",
  hardness: 0.6,
  sound: "grass",
  category: "naturaleza"
}));
var WET_SPONGE = family("wet_sponge", "湿海绵", [], () => ({
  all: "wet_sponge",
  hardness: 0.6,
  sound: "grass",
  category: "naturaleza"
}));
var OCEAN_INVENTORY = [
  ...CORAL_TYPES.flatMap((t) => [CORALS[t].block, CORALS[t].coral, CORALS[t].fan]),
  ...CORAL_TYPES.flatMap((t) => [DEAD_CORALS[t].block, DEAD_CORALS[t].coral, DEAD_CORALS[t].fan]),
  KELP,
  DRIED_KELP_BLOCK,
  SEAGRASS,
  SEA_PICKLE,
  PRISMARINE,
  PRISMARINE_BRICKS,
  DARK_PRISMARINE,
  SPONGE,
  WET_SPONGE
];

// goodPG/src/shared/blocks/wildPlants.ts
var plant4 = (tex, o = {}) => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: tex,
  category: "naturaleza",
  ...o
});
var onGround = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
};
var underCeiling = (get) => {
  const a = get(0, 1, 0);
  return a < 0 || BLOCK_OPAQUE[a] === 1;
};
var TALL_BASES = new Set;
function tallPlant(key, name, o = {}) {
  const id = family(key, name, [["half", 2]], (st) => ({
    ...plant4(st.half ? `${key}_top` : `${key}_bottom`, o),
    flatItem: `${key}_top`,
    support: st.half === 0 ? (get) => {
      const a = get(0, 1, 0);
      return onGround(get) && (a < 0 || a === id + 1);
    } : (get) => {
      const b = get(0, -1, 0);
      return b < 0 || b === id;
    }
  }));
  TALL_BASES.add(id);
  return id;
}
var SUNFLOWER = tallPlant("sunflower", "向日葵");
var LILAC = tallPlant("lilac", "丁香");
var ROSE_BUSH = tallPlant("rose_bush", "玫瑰丛");
var PEONY = tallPlant("peony", "牡丹");
var PITCHER_PLANT = tallPlant("pitcher_plant", "瓶子草");
var TALL_GRASS = tallPlant("tall_grass", "高草丛", { replaceable: true });
var LARGE_FERN = tallPlant("large_fern", "大型蕨", { replaceable: true });
var SMALL_DRIPLEAF = tallPlant("small_dripleaf", "小型垂滴叶");
var GROWS_TALL = new Map([[SHORT_GRASS, TALL_GRASS], [FERN, LARGE_FERN]]);
var TORCHFLOWER = family("torchflower", "火把花", [], () => plant4("torchflower", { support: onGround }));
var BERRY_SOIL = new Set([GRASS, DIRT, SNOWY_GRASS, FARMLAND, FARMLAND + 1, MOSS_BLOCK]);
var SWEET_BERRY_BUSH = family("sweet_berry_bush", "甜浆果丛", [["age", 4]], (st) => ({
  ...plant4(`sweet_berry_bush_stage${st.age}`),
  noItem: true,
  walkThrough: true,
  support: (get) => {
    const b = get(0, -1, 0);
    return b < 0 || BERRY_SOIL.has(b);
  }
}));
var AZALEA_LEAVES = family("azalea_leaves", "杜鹃花叶", [], () => ({
  all: "azalea_leaves",
  render: R_CUTOUT,
  lightOpacity: 1,
  sound: "leaves",
  hardness: 0.2,
  category: "naturaleza"
}));
var FLOWERING_AZALEA_LEAVES = family("flowering_azalea_leaves", "盛开的杜鹃花叶", [], () => ({
  all: "flowering_azalea_leaves",
  render: R_CUTOUT,
  lightOpacity: 1,
  sound: "leaves",
  hardness: 0.2,
  category: "naturaleza"
}));
var BIG_DRIPLEAF = family("big_dripleaf", "大型垂滴叶", [["tilt", 3]], (st) => {
  const leaf = L("big_dripleaf_top"), stem = L("big_dripleaf_stem");
  const y = [15, 13, 9][st.tilt];
  const plate = st.tilt < 2 ? mbox(0, y, 0, 16, y + 1, 16, [-1, -1, leaf, leaf, -1, -1]) : mbox(0, y, 3, 16, y + 1, 16, [-1, -1, leaf, leaf, -1, -1]);
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.1,
    tool: "axe",
    sound: "grass",
    all: "big_dripleaf_top",
    category: st.tilt === 0 ? "naturaleza" : null,
    solid: st.tilt < 2,
    flatItem: "big_dripleaf_top",
    model: [plate, mbox(7, 0, 7, 9, y, 9, [stem, stem, -1, -1, stem, stem])],
    itemModel: [mbox(0, 15, 0, 16, 16, 16, [-1, -1, leaf, leaf, -1, -1]), mbox(7, 0, 7, 9, 15, 9, [stem, stem, -1, -1, stem, stem])],
    collision: st.tilt < 2 ? [0, (y - 4) / 16, 0, 1, (y + 1) / 16, 1] : [],
    selection: [0, 0, 0, 1, (y + 1) / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || b === BIG_DRIPLEAF_STEM || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS && !isBigDripleaf(b);
    }
  };
});
var BIG_DRIPLEAF_STEM = family("big_dripleaf_stem", "大型垂滴叶", [], () => ({
  ...plant4("big_dripleaf_stem"),
  noItem: true,
  base: BIG_DRIPLEAF,
  support: (get) => {
    const b = get(0, -1, 0), a = get(0, 1, 0);
    const below = b < 0 || b === BIG_DRIPLEAF_STEM || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
    return below && (a < 0 || a === BIG_DRIPLEAF_STEM || isBigDripleaf(a));
  }
}));
var isBigDripleaf = (id) => id >= BIG_DRIPLEAF && id < BIG_DRIPLEAF + 3;
var GLOW_LICHEN = family("glow_lichen", "发光地衣", [["face", 6]], (st) => {
  const t = L("glow_lichen");
  const f = st.face;
  const box = f < 4 ? rotateBoxes([mbox(0, 0, 0, 16, 16, 1, t)], f)[0] : f === 4 ? mbox(0, 15, 0, 16, 16, 16, t) : mbox(0, 0, 0, 16, 1, 16, t);
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.2,
    sound: "grass",
    all: "glow_lichen",
    category: "naturaleza",
    emission: 7,
    walkThrough: true,
    replaceable: true,
    flatItem: "glow_lichen",
    model: [box],
    collision: [],
    selection: [box.x0 / 16, box.y0 / 16, box.z0 / 16, box.x1 / 16, box.y1 / 16, box.z1 / 16],
    support: (get) => {
      const d = LICHEN_DIRS[f];
      const b = get(d[0], d[1], d[2]);
      return b < 0 || BLOCK_OPAQUE[b] === 1;
    }
  };
});
var LICHEN_DIRS = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
var isGlowLichen = (id) => id >= GLOW_LICHEN && id < GLOW_LICHEN + 6;
var HANGING_ROOTS = family("hanging_roots", "垂根", [], () => plant4("hanging_roots", { replaceable: true, support: underCeiling }));
var SPORE_BLOSSOM = family("spore_blossom", "孢子花", [], () => {
  const t = L("spore_blossom");
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "grass",
    all: "spore_blossom",
    category: "naturaleza",
    flatItem: "spore_blossom",
    walkThrough: true,
    model: [mbox(1, 15, 1, 15, 16, 15, [-1, -1, -1, t, -1, -1]), mbox(4, 13, 4, 12, 14, 12, [-1, -1, t, t, -1, -1])],
    collision: [],
    selection: [2 / 16, 12 / 16, 2 / 16, 14 / 16, 1, 14 / 16],
    support: underCeiling
  };
});
var WILD_PLANT_INVENTORY = [
  SUNFLOWER,
  LILAC,
  ROSE_BUSH,
  PEONY,
  TORCHFLOWER,
  PITCHER_PLANT,
  TALL_GRASS,
  LARGE_FERN,
  AZALEA_LEAVES,
  FLOWERING_AZALEA_LEAVES,
  BIG_DRIPLEAF,
  SMALL_DRIPLEAF,
  GLOW_LICHEN,
  HANGING_ROOTS,
  SPORE_BLOSSOM
];
// goodPG/src/shared/blocks/hangingSigns.ts
var HANGING_SIGNS = {};
var WALL_HANGING_SIGNS = {};
var HANGING_WALL_OF = {};
var HANGING_SIGN_LOG = {};
var CEILING = new Set;
var WALL = new Set;
function holds2(id) {
  return id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);
}
function chainBoxes3(x, z, y0, y1) {
  const c = L("chain");
  return [mbox(x, y0, z - 1, x, y1, z + 1, [c, c, -1, -1, -1, -1]), mbox(x - 1, y0, z, x + 1, y1, z, [-1, -1, -1, -1, c, c])];
}
function addHangingSign(key, name, log, logTex) {
  const opts = {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 1,
    tool: "axe",
    sound: "wood",
    all: logTex
  };
  HANGING_SIGNS[key] = family(`${key}_hanging_sign`, `${name}悬挂式告示牌`, [["facing", 4]], (st) => {
    const t = L(logTex);
    return {
      ...opts,
      category: "decoracion",
      model: rotateBoxes([mbox(1, 0, 7, 15, 10, 9, t), ...chainBoxes3(3, 8, 10, 16), ...chainBoxes3(13, 8, 10, 16)], st.facing),
      selection: rotateFlat([1 / 16, 0, 7 / 16, 15 / 16, 1, 9 / 16], st.facing),
      support: (get) => holds2(get(0, 1, 0))
    };
  });
  WALL_HANGING_SIGNS[key] = family(`${key}_wall_hanging_sign`, `${name}悬挂式告示牌`, [["facing", 4]], (st) => {
    const t = L(logTex);
    return {
      ...opts,
      category: null,
      model: rotateBoxes([
        mbox(7, 14, 0, 9, 16, 16, t),
        mbox(7, 0, 1, 9, 10, 15, t),
        ...chainBoxes3(8, 3, 10, 14),
        ...chainBoxes3(8, 13, 10, 14)
      ], st.facing),
      selection: rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 1], st.facing),
      wall: st.facing,
      base: HANGING_SIGNS[key]
    };
  });
  HANGING_WALL_OF[HANGING_SIGNS[key]] = WALL_HANGING_SIGNS[key];
  HANGING_SIGN_LOG[key] = log;
  CEILING.add(HANGING_SIGNS[key]);
  WALL.add(WALL_HANGING_SIGNS[key]);
  addSignBase(HANGING_SIGNS[key]);
  addSignBase(WALL_HANGING_SIGNS[key]);
}
for (const { wood, strippedLog } of WOOD_EXTRAS)
  addHangingSign(wood.key, wood.wood, strippedLog, `stripped_${wood.key}_log_side`);
addHangingSign("bamboo", "竹", STRIPPED_BAMBOO_BLOCK, "stripped_bamboo_block_side");
var HANGING_SIGN_INVENTORY = Object.values(HANGING_SIGNS);
// goodPG/src/shared/blocks/chiseledBookshelf.ts
var SHELF_SLOTS = 6;
var COLS = [[11, 16], [5, 11], [0, 5]];
function shelfBoxes(books) {
  const side = L("chiseled_bookshelf_side"), top = L("chiseled_bookshelf_top");
  const empty = L("chiseled_bookshelf_empty"), full = L("chiseled_bookshelf_occupied");
  const out = [mbox(0, 0, 0, 16, 16, 16, [side, side, top, top, side, -1])];
  for (let k = 0;k < SHELF_SLOTS; k++) {
    const [x0, x1] = COLS[k % 3];
    const y0 = k < 3 ? 8 : 0;
    out.push(mbox(x0, y0, 0, x1, y0 + 8, 0, [-1, -1, -1, -1, -1, books & 1 << k ? full : empty]));
  }
  return out;
}
var CHISELED_BOOKSHELF = family("chiseled_bookshelf", "雕纹书架", [["facing", 4], ["books", 64]], (st) => ({
  render: R_MODEL,
  opaque: true,
  hardness: 1.5,
  tool: "axe",
  sound: "wood",
  category: "decoracion",
  all: "chiseled_bookshelf_side",
  model: rotateBoxes(shelfBoxes(st.books), st.facing),
  itemModel: rotateBoxes(shelfBoxes(0), 2)
}));
var SHELF_BOOK_KEYS = new Set(["book", "writable_book", "written_book", "enchanted_book", "knowledge_book"]);
// goodPG/src/shared/blocks/lecternBook.ts
var LECTERN_BOOK = family("lectern_book", "讲台", [], () => {
  const lectern = defs[LECTERN];
  const pages = L("lectern_book"), cover = L("brown_concrete");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2.5,
    tool: "axe",
    sound: "wood",
    category: null,
    top: "lectern_top",
    side: "lectern_side",
    bottom: "oak_planks",
    model: [...lectern.model, mbox(2, 16, 3, 14, 17, 13, [cover, cover, pages, cover, cover, cover])],
    collision: lectern.collision,
    selection: lectern.selection,
    base: LECTERN
  };
});
// goodPG/src/shared/blocks/materialBlocks.ts
var block2 = (key, name, o) => family(key, name, [], () => o);
var mineral = (tex, hardness, tier, o = {}) => ({
  all: tex,
  hardness,
  tool: "pickaxe",
  tier,
  sound: "stone",
  category: "minerales",
  ...o
});
var RAW_IRON_BLOCK = block2("raw_iron_block", "粗铁块", mineral("raw_iron_block", 5, 2));
var RAW_GOLD_BLOCK = block2("raw_gold_block", "粗金块", mineral("raw_gold_block", 5, 3));
var COAL_BLOCK = block2("coal_block", "煤炭块", mineral("coal_block", 5, 1));
var LAPIS_BLOCK = block2("lapis_block", "青金石块", mineral("lapis_block", 3, 2));
var BONE_BLOCK = block2("bone_block", "骨块", {
  top: "bone_block_top",
  side: "bone_block_side",
  hardness: 2,
  tool: "pickaxe",
  tier: 1,
  sound: "stone",
  category: "construccion"
});
var BONE_BLOCK_AXIS = addAxisLogs("bone_block", "骨块", BONE_BLOCK, "bone_block_top", "bone_block_side", undefined, {
  hardness: 2,
  tool: "pickaxe",
  tier: 1,
  sound: "stone"
});
var SLIME_BLOCK = block2("slime_block", "黏液块", {
  all: "slime_block",
  render: R_TRANSLUCENT,
  lightOpacity: 1,
  hardness: 0,
  sound: "wool",
  category: "decoracion"
});
var BLUE_ICE = block2("blue_ice", "蓝冰", {
  all: "blue_ice",
  hardness: 2.8,
  tool: "pickaxe",
  sound: "glass",
  category: "naturaleza"
});
var soil = (o) => ({ hardness: 0.5, tool: "shovel", sound: "dirt", category: "naturaleza", ...o });
var COARSE_DIRT = block2("coarse_dirt", "砂土", soil({ all: "coarse_dirt", sound: "gravel" }));
var PODZOL = block2("podzol", "灰化土", soil({ top: "podzol_top", side: "podzol_side", bottom: "dirt" }));
var ROOTED_DIRT = block2("rooted_dirt", "缠根泥土", soil({ all: "rooted_dirt" }));
var DIRT_PATH = family("dirt_path", "土径", [], () => {
  const top = L("dirt_path_top"), side = L("dirt_path_side"), bottom = L("dirt");
  return {
    render: R_MODEL,
    top: "dirt_path_top",
    side: "dirt_path_side",
    bottom: "dirt",
    hardness: 0.65,
    tool: "shovel",
    sound: "grass",
    category: "naturaleza",
    lightOpacity: 15,
    model: [mbox(0, 0, 0, 16, 15, 16, [side, side, top, bottom, side, side])],
    collision: [0, 0, 0, 1, 15 / 16, 1]
  };
});
var PATHABLE = new Set([GRASS, SNOWY_GRASS, DIRT, COARSE_DIRT, PODZOL, MYCELIUM, ROOTED_DIRT]);
var POWDER_SNOW = block2("powder_snow", "细雪", {
  all: "powder_snow",
  solid: false,
  hardness: 0.25,
  tool: "shovel",
  sound: "snow",
  category: null,
  noItem: true
});
var infested2 = (key, name, mimics, hardness) => {
  const b = defs[mimics];
  const id = family(key, name, [], () => ({ tex: b.tex, hardness, tool: "pickaxe", sound: "stone", category: "naturaleza" }));
  addInfested(id, mimics);
  return id;
};
var INFESTED_CRACKED_STONE_BRICKS = infested2("infested_cracked_stone_bricks", "虫蚀裂纹石砖", CRACKED_STONE_BRICKS, 0.75);
var INFESTED_MOSSY_STONE_BRICKS = infested2("infested_mossy_stone_bricks", "虫蚀苔石砖", MOSSY_STONE_BRICKS, 0.75);
var INFESTED_CHISELED_STONE_BRICKS = infested2("infested_chiseled_stone_bricks", "虫蚀雕纹石砖", CHISELED_STONE_BRICKS, 0.75);
var INFESTED_DEEPSLATE = infested2("infested_deepslate", "虫蚀深板岩", DEEPSLATE, 1.5);
var onFloor = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || BLOCK_SOLID[b] === 1 && BLOCK_RENDER[b] !== R_CROSS;
};
var CANDLE_CAKES = new Map;
var CANDLE_OF_CAKE = new Map;
function candleCake(candle, key, name, bodyTex) {
  const id = family(key, name, [["lit", 2]], (st) => {
    const top = L("cake_top"), side = L("cake_side"), bottom = L("cake_bottom");
    const body = L(bodyTex), wick = L("black_concrete"), flame = L("candle_flame");
    const boxes = [
      mbox(1, 0, 1, 15, 8, 15, [side, side, top, bottom, side, side]),
      mbox(7, 8, 7, 9, 13, 9, body),
      mbox(7, 13, 7, 8, 14, 8, wick)
    ];
    if (st.lit)
      boxes.push(mbox(7, 14, 7, 8, 16, 8, flame));
    return {
      render: R_MODEL,
      opaque: false,
      lightOpacity: 0,
      hardness: 0.5,
      sound: "wool",
      top: "cake_top",
      side: "cake_side",
      bottom: "cake_bottom",
      category: null,
      base: CAKE,
      emission: st.lit ? 3 : 0,
      model: boxes,
      collision: [1 / 16, 0, 1 / 16, 15 / 16, 0.5, 15 / 16],
      selection: unionBox(flatBoxes(boxes.slice(0, 3))),
      support: onFloor
    };
  });
  CANDLE_CAKES.set(candle, id);
  CANDLE_OF_CAKE.set(id, candle);
  CANDLE_OF_CAKE.set(id + 1, candle);
  return id;
}
candleCake(CANDLE, "candle_cake", "蜡烛蛋糕", "candle");
for (const c of DYE_COLORS)
  candleCake(CANDLES[c], `${c}_candle_cake`, `${COLOR_NAMES[c][1]}蜡烛蛋糕`, `${c}_concrete`);
var FROGSPAWN = family("frogspawn", "青蛙卵", [], () => {
  const t = L("frogspawn");
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "grass",
    category: "naturaleza",
    flatItem: "frogspawn",
    walkThrough: true,
    model: [mbox(0, 0, 0, 16, 0.25, 16, [-1, -1, t, t, -1, -1])],
    collision: [],
    selection: [0, 0, 0, 1, 1.5 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_FLUID[b] === 1 && BLOCK_FLUID_LEVEL[b] === 0;
    }
  };
});
var MATERIAL_INVENTORY = [
  RAW_IRON_BLOCK,
  RAW_GOLD_BLOCK,
  COAL_BLOCK,
  LAPIS_BLOCK,
  BONE_BLOCK,
  SLIME_BLOCK,
  BLUE_ICE,
  COARSE_DIRT,
  PODZOL,
  ROOTED_DIRT,
  DIRT_PATH,
  INFESTED_CRACKED_STONE_BRICKS,
  INFESTED_MOSSY_STONE_BRICKS,
  INFESTED_CHISELED_STONE_BRICKS,
  INFESTED_DEEPSLATE,
  FROGSPAWN
];
// goodPG/src/shared/blocks/collections.ts
var SKULL_KINDS = ["zombie", "skeleton", "creeper", "player"];
var ALL_SKULL_KINDS = [];
var SKULL_NAMES = {
  zombie: "僵尸头颅",
  skeleton: "骷髅头颅",
  creeper: "苦力怕头颅",
  player: "玩家头颅",
  wither_skeleton: "凋灵骷髅头颅",
  piglin: "猪灵头颅",
  dragon: "龙首"
};
var SKULL_FACES = ["right", "left", "top", "bottom", "back", "front"];
function skullTexture(kind, face) {
  return `${kind}_head_${face}`;
}
var SKULL_TEXTURES = [];
function skullBoxes(kind) {
  return [mbox(4, 4, 4, 12, 12, 12, SKULL_FACES.map((f) => L(skullTexture(kind, f))))];
}
var SKULLS = {};
var WALL_SKULLS = {};
var SKULL_WALL_OF = {};
var POSE = [];
var KIND_OF = new Map;
function registerSkull(kind, boxes = skullBoxes(kind), halfWidth = 4) {
  ALL_SKULL_KINDS.push(kind);
  SKULL_TEXTURES.push(...SKULL_FACES.map((f) => skullTexture(kind, f)));
  const common = {
    render: R_MODEL,
    solid: true,
    opaque: false,
    lightOpacity: 0,
    hardness: 1,
    sound: "stone",
    all: skullTexture(kind, "left"),
    itemModel: boxes
  };
  const lo = (8 - halfWidth) / 16, hi = (8 + halfWidth) / 16;
  const floorBox = [lo, 0, 4 / 16, hi, 8 / 16, 12 / 16];
  SKULLS[kind] = family(`${kind}_head`, SKULL_NAMES[kind], [["rot", 16]], () => ({
    ...common,
    category: "decoracion",
    model: boxes,
    selection: floorBox,
    collision: floorBox
  }));
  WALL_SKULLS[kind] = family(`${kind}_wall_head`, SKULL_NAMES[kind], [["facing", 4]], (st) => {
    const box = rotateFlat([lo, 4 / 16, 8 / 16, hi, 12 / 16, 1], st.facing);
    return { ...common, category: null, model: boxes, selection: box, collision: box, wall: st.facing, base: SKULLS[kind] };
  });
  SKULL_WALL_OF[SKULLS[kind]] = WALL_SKULLS[kind];
  for (let r = 0;r < 16; r++) {
    const a = r * Math.PI / 8;
    POSE[SKULLS[kind] + r] = [Math.cos(a), Math.sin(a), 0, -4, 0];
    KIND_OF.set(SKULLS[kind] + r, kind);
  }
  for (let f = 0;f < 4; f++) {
    const a = f * Math.PI / 2;
    POSE[WALL_SKULLS[kind] + f] = [Math.round(Math.cos(a)), Math.round(Math.sin(a)), -DIR_X[f] * 4, 0, -DIR_Z[f] * 4];
    KIND_OF.set(WALL_SKULLS[kind] + f, kind);
  }
}
for (const kind of SKULL_KINDS)
  registerSkull(kind);
var JUKEBOX = family("jukebox", "唱片机", [["disc", 2]], () => ({
  side: "jukebox_side",
  top: "jukebox_top",
  bottom: "jukebox_bottom",
  hardness: 2,
  tool: "axe",
  sound: "wood",
  category: "decoracion"
}));
var GLOW_ITEM_FRAME_MODEL = family("glow_item_frame_model", "荧光物品展示框", [], () => ({
  tex: ["birch_planks", "birch_planks", "birch_planks", "birch_planks", "glow_item_frame", "birch_planks"],
  noItem: true,
  category: null,
  hardness: 0,
  sound: "wood"
}));
var COLLECTION_INVENTORY = [...SKULL_KINDS.map((k) => SKULLS[k]), JUKEBOX];
// goodPG/src/shared/blocks/equipmentBlocks.ts
var FIRE_AGES = 16;
function fireBoxes() {
  const f = L("fire");
  const x = [f, f, -1, -1, -1, -1], z = [-1, -1, -1, -1, f, f];
  return [
    mbox(8, 0, 0, 8, 16, 16, x),
    mbox(0, 0, 8, 16, 16, 8, z),
    mbox(1, 0, 0, 1, 15, 16, x),
    mbox(15, 0, 0, 15, 15, 16, x),
    mbox(0, 0, 1, 16, 15, 1, z),
    mbox(0, 0, 15, 16, 15, 15, z)
  ];
}
function fireShape(get) {
  const below = get(0, -1, 0);
  if (below < 0 || BLOCK_SOLID[below] === 1)
    return fireBoxes();
  const f = L("fire");
  const x = [f, f, -1, -1, -1, -1], z = [-1, -1, -1, -1, f, f];
  const out = [];
  if (flameEncouragement(get(1, 0, 0)) > 0)
    out.push(mbox(15, 0, 0, 15, 16, 16, x));
  if (flameEncouragement(get(-1, 0, 0)) > 0)
    out.push(mbox(1, 0, 0, 1, 16, 16, x));
  if (flameEncouragement(get(0, 0, 1)) > 0)
    out.push(mbox(0, 0, 15, 16, 16, 15, z));
  if (flameEncouragement(get(0, 0, -1)) > 0)
    out.push(mbox(0, 0, 1, 16, 16, 1, z));
  if (flameEncouragement(get(0, 1, 0)) > 0)
    out.push(mbox(0, 14, 0, 16, 14, 16, [-1, -1, f, f, -1, -1]));
  return out.length ? out : fireBoxes();
}
function fireSupport(get) {
  const below = get(0, -1, 0);
  if (below < 0 || BLOCK_SOLID[below] === 1)
    return true;
  for (const [dx, dy, dz] of NEIGHBORS6)
    if (flameEncouragement(get(dx, dy, dz)) > 0)
      return true;
  return false;
}
var FIRE = family("fire", "火", [["age", FIRE_AGES]], () => ({
  render: R_MODEL,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  emission: 15,
  hardness: 0,
  sound: "wool",
  all: "fire",
  replaceable: true,
  walkThrough: true,
  noItem: true,
  category: null,
  model: fireBoxes(),
  shape: fireShape,
  collision: [],
  selection: [0, 0, 0, 1, 1 / 16, 1],
  support: fireSupport
}));
var NEIGHBORS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
var FLAME_RULES = [
  [/_leaves$/, 30, 60],
  [/_wool$|^dried_kelp_block$/, 30, 60],
  [/_carpet$|^hay_bale$|^pink_petals$/, 60, 20],
  [/^(chiseled_)?bookshelf$|^lectern$/, 30, 20],
  [/^bamboo_block$|^stripped_bamboo_block$/, 5, 5],
  [/(^|_)(log|wood)$|^mangrove_roots$/, 5, 5],
  [/_planks$|_slab$|_stairs$|_fence$|_fence_gate$|^bamboo_mosaic$|^composter$|^bee_nest$|^beehive$|_table$/, 5, 20],
  [/^vine$|^glow_lichen$|^big_dripleaf$|^cave_vines$/, 15, 100],
  [/^moss_block$|^moss_carpet$/, 5, 100],
  [/^azalea$|^flowering_azalea$|^hanging_roots$/, 30, 60],
  [/^scaffolding$|^bamboo$/, 60, 60],
  [/^tnt$/, 15, 100]
];
var NETHER_WOOD_KEY = /^(stripped_)?(crimson|warped)_/;
var PLANT_FLAMES = [60, 100];
var NOT_FLAMMABLE_PLANT = /sapling|propagule|mushroom|crop|carrots|potatoes|beetroots|stem|sugar_cane|kelp|seagrass|coral|lily_pad|cobweb|dripstone|amethyst/;
var flameTable = null;
function buildFlames() {
  const t = new Int16Array(defs.length * 2);
  for (const b of defs) {
    if (!b || b.fluid)
      continue;
    const base = defs[familyBase(b.id)] ?? b;
    const key = base.key;
    if (NETHER_WOOD_KEY.test(key))
      continue;
    let rule = null;
    for (const [re, enc, burn] of FLAME_RULES) {
      if (!re.test(key))
        continue;
      if (/_slab$|_stairs$|_fence$|_fence_gate$|_table$/.test(key) && base.sound !== "wood")
        continue;
      rule = [enc, burn];
      break;
    }
    if (!rule && b.render === R_CROSS && base.sound === "grass" && !NOT_FLAMMABLE_PLANT.test(key))
      rule = PLANT_FLAMES;
    if (rule) {
      t[b.id * 2] = rule[0];
      t[b.id * 2 + 1] = rule[1];
    }
  }
  return t;
}
function flameEncouragement(id) {
  if (id <= 0)
    return 0;
  flameTable ??= buildFlames();
  return flameTable[id * 2] ?? 0;
}
function conduitBoxes(active) {
  const t = L(active ? "conduit_open" : "conduit_closed");
  return [mbox(5, 5, 5, 11, 11, 11, t)];
}
var CONDUIT = family("conduit", "潮涌核心", [["water", 2], ["active", 2]], (st) => ({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  emission: 15,
  hardness: 3,
  tool: "pickaxe",
  sound: "stone",
  all: "conduit_closed",
  category: "decoracion",
  model: conduitBoxes(st.active === 1),
  itemModel: conduitBoxes(false),
  collision: [5 / 16, 5 / 16, 5 / 16, 11 / 16, 11 / 16, 11 / 16],
  selection: [5 / 16, 5 / 16, 5 / 16, 11 / 16, 11 / 16, 11 / 16],
  ...st.water ? { fluid: 1, level: 0, lightOpacity: 2 } : {}
}));
for (let id = CONDUIT;defs[id] && familyBase(id) === CONDUIT; id++)
  if (defs[id].fluid === 1)
    BLOCK_WATERLOGGED[id] = 1;
var EQUIPMENT_INVENTORY = [CONDUIT];
// goodPG/src/shared/blocks/cauldrons.ts
function filled(surface, level) {
  const base = defs[CAULDRON].model ?? [];
  const top = 6 + level * 3;
  const s = L(surface);
  return [...base, mbox(2, 4, 2, 14, top, 14, [-1, -1, s, -1, -1, -1])];
}
function cauldronOpts(surface, level) {
  const d = defs[CAULDRON];
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2,
    tool: "pickaxe",
    sound: "metal",
    category: null,
    side: "cauldron_side",
    top: "cauldron_top",
    bottom: "cauldron_bottom",
    base: CAULDRON,
    model: filled(surface, level),
    collision: d.collision,
    selection: d.selection
  };
}
var WATER_CAULDRON = family("water_cauldron", "装有水的炼药锅", [["level", 3]], (st) => cauldronOpts("water", st.level + 1));
var LAVA_CAULDRON = family("lava_cauldron", "装有熔岩的炼药锅", [], () => ({ ...cauldronOpts("lava", 3), emission: 15 }));
var POWDER_SNOW_CAULDRON = family("powder_snow_cauldron", "装有细雪的炼药锅", [["level", 3]], (st) => cauldronOpts("powder_snow", st.level + 1));
// goodPG/src/shared/blocks/brewingBlocks.ts
var BREWING_BOTTLE_AT = [[12, 8], [5, 4], [5, 12]];
function standBoxes(mask) {
  const base = L("brewing_stand_base"), rod = L("brewing_stand_rod");
  const side = L("brewing_stand_bottle"), cap = L("brewing_stand_bottle_top");
  const out = [
    mbox(9, 0, 5, 15, 2, 11, base),
    mbox(2, 0, 1, 8, 2, 7, base),
    mbox(2, 0, 9, 8, 2, 15, base),
    mbox(7, 0, 7, 9, 14, 9, rod),
    mbox(9, 11, 7.5, 12.5, 12, 8.5, rod),
    mbox(4.5, 11, 7.5, 7, 12, 8.5, rod),
    mbox(4.5, 11, 3.5, 5.5, 12, 7.5, rod),
    mbox(4.5, 11, 8.5, 5.5, 12, 12.5, rod)
  ];
  BREWING_BOTTLE_AT.forEach(([x, z], i) => {
    if (!(mask & 1 << i))
      return;
    const tex = [side, side, cap, cap, side, side];
    out.push(mbox(x - 2, 2, z - 2, x + 2, 7, z + 2, tex), mbox(x - 1, 7, z - 1, x + 1, 10, z + 1, tex));
    out.push(mbox(x - 0.5, 10, z - 0.5, x + 0.5, 11, z + 0.5, rod));
  });
  return out;
}
var BREWING_STAND = family("brewing_stand", "酿造台", [["bottles", 8]], (st) => ({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  emission: 1,
  hardness: 0.5,
  tool: "pickaxe",
  sound: "stone",
  category: "decoracion",
  all: "brewing_stand_base",
  model: standBoxes(st.bottles),
  itemModel: standBoxes(7),
  collision: [0, 0, 0, 1, 2 / 16, 1, 7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16],
  selection: [0, 0, 0, 1, 2 / 16, 1, 7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16]
}));
// goodPG/src/shared/blocks/rails.ts
var RAIL_NS = 0;
var RAIL_EW = 1;
var RAIL_ASC_E = 2;
var RAIL_ASC_W = 3;
var RAIL_ASC_N = 4;
var RAIL_ASC_S = 5;
var RAIL_SE = 6;
var RAIL_PLAIN = 1;
var RAIL_POWERED = 2;
var RAIL_DETECTOR = 3;
var RAIL_ACTIVATOR = 4;
var RAIL_SHAPE = new Int8Array(MAX_BLOCK_ID).fill(-1);
var RAIL_KIND = new Uint8Array(MAX_BLOCK_ID);
var UPHILL = {
  [RAIL_ASC_E]: [1, 0],
  [RAIL_ASC_W]: [-1, 0],
  [RAIL_ASC_N]: [0, -1],
  [RAIL_ASC_S]: [0, 1]
};
function firmFloor(id) {
  return id < 0 || BLOCK_SOLID[id] === 1 && BLOCK_COLLIDE[id] === 1;
}
var FLAT_BOX = [0, 0, 0, 1, 2 / 16, 1];
var SLOPE_BOX = [0, 0, 0, 1, 8 / 16, 1];
function railOpts(tex, item, shape) {
  const up = UPHILL[shape];
  return {
    render: R_RAIL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    all: tex,
    flatItem: item,
    sound: "metal",
    hardness: 0.7,
    tool: "pickaxe",
    category: "decoracion",
    selection: up ? SLOPE_BOX : FLAT_BOX,
    support: (get) => firmFloor(get(0, -1, 0)) && (!up || firmFloor(get(up[0], 0, up[1])))
  };
}
function register(base, count, kind) {
  for (let i = 0;i < count; i++) {
    RAIL_SHAPE[base + i] = stateProps(base + i).shape;
    RAIL_KIND[base + i] = kind;
  }
}
var RAIL = family("rail", "铁轨", [["shape", 10]], (st) => railOpts(st.shape >= RAIL_SE ? "rail_corner" : "rail", "rail", st.shape));
register(RAIL, 10, RAIL_PLAIN);
function poweredFamily(key, name, kind) {
  const base = family(key, name, [["shape", 6], ["powered", 2]], (st) => railOpts(st.powered ? `${key}_on` : key, key, st.shape));
  register(base, 12, kind);
  return base;
}
var POWERED_RAIL = poweredFamily("powered_rail", "动力铁轨", RAIL_POWERED);
var DETECTOR_RAIL = poweredFamily("detector_rail", "探测铁轨", RAIL_DETECTOR);
var ACTIVATOR_RAIL = poweredFamily("activator_rail", "激活铁轨", RAIL_ACTIVATOR);
var RAIL_BASES = {
  [RAIL_PLAIN]: RAIL,
  [RAIL_POWERED]: POWERED_RAIL,
  [RAIL_DETECTOR]: DETECTOR_RAIL,
  [RAIL_ACTIVATOR]: ACTIVATOR_RAIL
};
var RAIL_INVENTORY = [RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL];
// goodPG/src/shared/blocks/enchantBlocks.ts
var ENCHANTING_TABLE = family("enchanting_table", "附魔台", [], () => {
  const side = L("enchanting_table_side"), top = L("enchanting_table_top"), bottom = L("enchanting_table_bottom");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    emission: 7,
    hardness: 5,
    tool: "pickaxe",
    tier: 1,
    sound: "stone",
    category: "decoracion",
    side: "enchanting_table_side",
    top: "enchanting_table_top",
    bottom: "enchanting_table_bottom",
    model: [mbox(0, 0, 0, 16, 12, 16, [side, side, top, bottom, side, side])],
    collision: [0, 0, 0, 1, 12 / 16, 1],
    selection: [0, 0, 0, 1, 12 / 16, 1]
  };
});
function anvilBoxes(topTex) {
  const body = L("anvil"), top = L(topTex);
  return [
    mbox(2, 0, 2, 14, 4, 14, body),
    mbox(4, 4, 3, 12, 5, 13, body),
    mbox(6, 5, 4, 10, 10, 12, body),
    mbox(3, 10, 0, 13, 16, 16, [body, body, top, body, body, body])
  ];
}
function anvil(key, name, topTex) {
  return family(key, name, [["facing", 4]], (st) => ({
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 5,
    tool: "pickaxe",
    tier: 1,
    sound: "metal",
    category: "decoracion",
    side: "anvil",
    top: topTex,
    bottom: "anvil",
    model: rotateBoxes(anvilBoxes(topTex), st.facing),
    collision: rotateFlat([2 / 16, 0, 2 / 16, 14 / 16, 10 / 16, 14 / 16, 3 / 16, 10 / 16, 0, 13 / 16, 1, 1], st.facing),
    selection: rotateFlat([2 / 16, 0, 2 / 16, 14 / 16, 10 / 16, 14 / 16, 3 / 16, 10 / 16, 0, 13 / 16, 1, 1], st.facing)
  }));
}
var ANVIL = anvil("anvil", "铁砧", "anvil_top");
var CHIPPED_ANVIL = anvil("chipped_anvil", "开裂的铁砧", "chipped_anvil_top");
var DAMAGED_ANVIL = anvil("damaged_anvil", "损坏的铁砧", "damaged_anvil_top");
var FROSTED_ICE_AGES = 4;
var FROSTED_ICE = family("frosted_ice", "霜冰", [["age", FROSTED_ICE_AGES]], (st) => ({
  all: `frosted_ice_${st.age}`,
  render: R_TRANSLUCENT,
  lightOpacity: 2,
  hardness: 0.5,
  sound: "glass",
  noItem: true,
  category: null
}));
for (let a = 0;a < FROSTED_ICE_AGES; a++)
  BLOCK_LEAVES_WATER[FROSTED_ICE + a] = 1;
var ENCHANT_INVENTORY = [ENCHANTING_TABLE, ANVIL, CHIPPED_ANVIL, DAMAGED_ANVIL];
// goodPG/src/shared/redstone/api.ts
var FACE_X = [1, -1, 0, 0, 0, 0];
var FACE_Y = [0, 0, 1, -1, 0, 0];
var FACE_Z = [0, 0, 0, 0, 1, -1];
var EAST = 0;
var WEST = 1;
var UP2 = 2;
var DOWN = 3;
var SOUTH = 4;
var NORTH = 5;
var HFACE = [NORTH, EAST, SOUTH, WEST];
var UPDATE_NEIGHBORS = 1;
var UPDATE_CLIENTS = 2;
var UPDATE_ALL = UPDATE_NEIGHBORS | UPDATE_CLIENTS;
var EMITTERS = [];
var NEIGHBOR = [];
var TICKS = [];
var ANALOG = [];
var CHANGED = [];
var STEPPED = [];
var PROJECTILE = [];
var USES = [];
var PERIODIC = [];
var PLACED = [];
var REMOVED = [];
var SHAPES = [];
var EVENTS = [];
var CONDUCTOR = new Uint8Array(MAX_BLOCK_ID);
var KNOWN = new Uint8Array(MAX_BLOCK_ID);
var bases = (b) => typeof b === "number" ? [b] : b;
function registerRedstone(base, b) {
  for (const id of bases(base)) {
    const f = familyBase(id);
    KNOWN[f] = 1;
    if (b.emitter)
      EMITTERS[f] = b.emitter;
    if (b.neighbor)
      (NEIGHBOR[f] ??= []).push(b.neighbor);
    if (b.tick)
      TICKS[f] = b.tick;
    if (b.analog)
      ANALOG[f] = b.analog;
    if (b.changed)
      (CHANGED[f] ??= []).push(b.changed);
    if (b.stepped)
      STEPPED[f] = b.stepped;
    if (b.projectile)
      PROJECTILE[f] = b.projectile;
    if (b.use)
      USES[f] = b.use;
    if (b.periodic)
      PERIODIC[f] = b.periodic;
    if (b.placed)
      (PLACED[f] ??= []).push(b.placed);
    if (b.removed)
      (REMOVED[f] ??= []).push(b.removed);
    if (b.shape)
      SHAPES[f] = b.shape;
    if (b.event)
      EVENTS[f] = b.event;
  }
}
function setConductor(ids, conducts) {
  for (const id of bases(ids))
    CONDUCTOR[id] = conducts ? 1 : 2;
}
function emitterOf(id) {
  return id > 0 ? EMITTERS[familyBase(id)] : undefined;
}
function isConductor(id) {
  if (id <= 0)
    return false;
  const o = CONDUCTOR[id];
  if (o)
    return o === 1;
  return BLOCK_OPAQUE[id] === 1 && BLOCK_COLLIDE[id] === 1;
}

// goodPG/src/shared/blocks/redstoneBlocks.ts
var N = -1;
var flat = (x0, z0, x1, z1, t) => mbox(x0, 0, z0, x1, 1, z1, [N, N, t, N, N, N]);
var MOUNT_FLOOR = 0;
var MOUNT_WALL = 1;
var MOUNT_CEILING = 2;
function mounted(boxes, mount, facing) {
  let out = boxes;
  if (mount === MOUNT_WALL) {
    out = out.map((b) => ({
      x0: b.x0,
      x1: b.x1,
      y0: 16 - b.z1,
      y1: 16 - b.z0,
      z0: 16 - b.y1,
      z1: 16 - b.y0,
      tex: [b.tex[0], b.tex[1], b.tex[5], b.tex[4], b.tex[3], b.tex[2]]
    }));
  } else if (mount === MOUNT_CEILING) {
    out = out.map((b) => ({
      x0: b.x0,
      x1: b.x1,
      y0: 16 - b.y1,
      y1: 16 - b.y0,
      z0: 16 - b.z1,
      z1: 16 - b.z0,
      tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[5], b.tex[4]]
    }));
  }
  return rotateBoxes(out, facing);
}
function mountFace(mount, facing) {
  return mount === MOUNT_FLOOR ? DOWN : mount === MOUNT_CEILING ? UP2 : HFACE[facing + 2 & 3];
}
function atFace(get, face) {
  return face === DOWN ? get(0, -1, 0) : face === UP2 ? get(0, 1, 0) : get(FX[face], 0, FZ[face]);
}
var FX = [1, -1, 0, 0, 0, 0];
var FZ = [0, 0, 0, 0, 1, -1];
function sturdy(id) {
  return id > 0 && BLOCK_COLLIDE[id] === 1;
}
function sturdyTop(id) {
  if (id <= 0)
    return false;
  if (BLOCK_COLLIDE[id] === 1)
    return true;
  if (isSlab(id))
    return stateProps(id).type !== 0;
  if (isStairs(id))
    return stateProps(id).half === 1;
  return false;
}
var supportAt = (get, face) => {
  const b = atFace(get, face);
  return b < 0 || sturdy(b);
};
var topSupport = (get) => {
  const b = get(0, -1, 0);
  return b < 0 || sturdyTop(b);
};
var WIRE_NONE = 0;
var WIRE_SIDE = 1;
var WIRE_UP = 2;
var REDSTONE_WIRE = family("redstone_wire", "红石粉", [["power", 16], ["dot", 2]], (st) => {
  const t = L(`redstone_dust_${st.power}`);
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "stone",
    all: `redstone_dust_${st.power}`,
    walkThrough: true,
    noItem: true,
    category: null,
    collision: [],
    selection: [0, 0, 0, 1, 1 / 16, 1],
    shape: (get) => wireShape(get, st.dot === 1, t),
    support: topSupport
  };
});
function isWire(id) {
  return id >= REDSTONE_WIRE && id < REDSTONE_WIRE + 32;
}
function wirePower(id) {
  return id - REDSTONE_WIRE & 15;
}
function wireDot(id) {
  return id - REDSTONE_WIRE >= 16;
}
function dustConnectsTo(id, dir) {
  if (id <= 0)
    return false;
  if (isWire(id))
    return true;
  const e = emitterOf(id);
  if (!e)
    return false;
  return e.connects ? e.connects(id, HFACE[dir + 2 & 3]) : true;
}
function wireSide(get, dir, canUp) {
  const dx = DIR_X[dir], dz = DIR_Z[dir];
  const n = get(dx, 0, dz);
  if (canUp && isWire(get(dx, 1, dz)) && (sturdyTop(n) || isTrapdoor(n)))
    return sturdy(n) ? WIRE_UP : WIRE_SIDE;
  if (dustConnectsTo(n, dir))
    return WIRE_SIDE;
  if (!isConductor(n) && isWire(get(dx, -1, dz)))
    return WIRE_SIDE;
  return WIRE_NONE;
}
function wireConnections(get, dot, out) {
  const canUp = !isConductor(get(0, 1, 0));
  let real = 0;
  for (let d = 0;d < 4; d++) {
    out[d] = wireSide(get, d, canUp);
    if (out[d])
      real++;
  }
  if (real === 0 && dot)
    return 0;
  const ns = !out[0] && !out[2], ew = !out[1] && !out[3];
  if (ns) {
    if (!out[3])
      out[3] = WIRE_SIDE;
    if (!out[1])
      out[1] = WIRE_SIDE;
  }
  if (ew) {
    if (!out[0])
      out[0] = WIRE_SIDE;
    if (!out[2])
      out[2] = WIRE_SIDE;
  }
  return real;
}
var tmpConn = [0, 0, 0, 0];
var emitConn = [0, 0, 0, 0];
function wireShape(get, dot, t) {
  const c = tmpConn;
  wireConnections(get, dot, c);
  const blob = () => [flat(5, 5, 11, 11, t), flat(5, 4, 11, 5, t), flat(5, 11, 11, 12, t), flat(4, 5, 5, 11, t), flat(11, 5, 12, 11, t)];
  if (!c[0] && !c[1] && !c[2] && !c[3])
    return blob();
  const out = [];
  if (c[0] && c[2] && !c[1] && !c[3])
    out.push(flat(5, 0, 11, 16, t));
  else if (c[1] && c[3] && !c[0] && !c[2])
    out.push(flat(0, 5, 16, 11, t));
  else {
    out.push(...blob());
    if (c[0])
      out.push(flat(5, 0, 11, 4, t));
    if (c[1])
      out.push(flat(12, 5, 16, 11, t));
    if (c[2])
      out.push(flat(5, 12, 11, 16, t));
    if (c[3])
      out.push(flat(0, 5, 4, 11, t));
  }
  if (c[0] === WIRE_UP)
    out.push(mbox(5, 0, 0, 11, 16, 1, [N, N, N, N, t, N]));
  if (c[1] === WIRE_UP)
    out.push(mbox(15, 0, 5, 16, 16, 11, [N, t, N, N, N, N]));
  if (c[2] === WIRE_UP)
    out.push(mbox(5, 0, 15, 11, 16, 16, [N, N, N, N, N, t]));
  if (c[3] === WIRE_UP)
    out.push(mbox(0, 0, 5, 1, 16, 11, [t, N, N, N, N, N]));
  return out;
}
function relGet(v, x, y, z) {
  return (dx, dy, dz) => v.getBlock(x + dx, y + dy, z + dz);
}
registerRedstone(REDSTONE_WIRE, {
  emitter: {
    weak: (v, x, y, z, id, face) => {
      const p = wirePower(id);
      if (p === 0 || face === UP2)
        return 0;
      if (face === DOWN)
        return p;
      wireConnections(relGet(v, x, y, z), wireDot(id), emitConn);
      return emitConn[HFACE.indexOf(face)] ? p : 0;
    },
    strong: (v, x, y, z, id, face) => {
      const e = emitterOf(id);
      return e.weak(v, x, y, z, id, face);
    }
  }
});
var REDSTONE_TORCH = family("redstone_torch", "红石火把", [["off", 2]], (st) => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: st.off ? 0 : 7,
  sound: "wood",
  hardness: 0,
  category: "redstone",
  all: st.off ? "redstone_torch_off" : "redstone_torch",
  walkThrough: true
}));
var REDSTONE_WALL_TORCH = family("redstone_wall_torch", "红石火把", [["facing", 4], ["off", 2]], (st) => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: st.off ? 0 : 7,
  sound: "wood",
  hardness: 0,
  category: null,
  all: st.off ? "redstone_torch_off" : "redstone_torch",
  wall: st.facing,
  base: REDSTONE_TORCH,
  walkThrough: true,
  selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing)
}));
function torchLit(id) {
  return id === REDSTONE_TORCH || id >= REDSTONE_WALL_TORCH && id < REDSTONE_WALL_TORCH + 4;
}
function torchAttachFace(id) {
  return familyBase(id) === REDSTONE_TORCH ? DOWN : HFACE[(id - REDSTONE_WALL_TORCH & 3) + 2 & 3];
}
registerRedstone([REDSTONE_TORCH, REDSTONE_WALL_TORCH], {
  emitter: {
    weak: (_v, _x, _y, _z, id, face) => torchLit(id) && face !== torchAttachFace(id) ? 15 : 0,
    strong: (_v, _x, _y, _z, id, face) => torchLit(id) && face === UP2 ? 15 : 0
  }
});
var MOUNTED_PROPS = [["mount", 3], ["facing", 4], ["powered", 2]];
function mountOf(id) {
  return (id - familyBase(id)) % 3;
}
function mountFacing(id) {
  return Math.floor((id - familyBase(id)) / 3) & 3;
}
function mountedPowered(id) {
  return id - familyBase(id) >= 12;
}
function mountedAttachFace(id) {
  return mountFace(mountOf(id), mountFacing(id));
}
function mountedSupport(mount, facing) {
  const face = mountFace(mount, facing);
  return (get) => supportAt(get, face);
}
var LEVER = family("lever", "拉杆", MOUNTED_PROPS, (st) => {
  const base = L("cobblestone"), h = L("lever_handle");
  const steps = st.powered ? [[7, 9], [8, 10], [9, 11], [10, 12]] : [[7, 9], [6, 8], [5, 7], [4, 6]];
  const boxes = [mbox(5, 0, 4, 11, 3, 12, base), ...steps.map(([z0, z1], k) => mbox(7, 3 + k * 2, z0, 9, 5 + k * 2, z1, h))];
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.5,
    sound: "wood",
    all: "cobblestone",
    category: "redstone",
    walkThrough: true,
    collision: [],
    model: mounted(boxes, st.mount, st.facing),
    itemModel: mounted(boxes, MOUNT_WALL, 0),
    support: mountedSupport(st.mount, st.facing)
  };
});
var BUTTONS = {};
var WOODEN_BUTTONS = new Set;
function button(key, name, tex, sound) {
  return family(`${key}_button`, `${name}按钮`, MOUNTED_PROPS, (st) => {
    const t = L(tex);
    const box = [mbox(5, 0, 6, 11, st.powered ? 1 : 2, 10, t)];
    return {
      render: R_MODEL,
      solid: false,
      opaque: false,
      lightOpacity: 0,
      hardness: 0.5,
      sound,
      all: tex,
      category: "redstone",
      walkThrough: true,
      collision: [],
      model: mounted(box, st.mount, st.facing),
      itemModel: [mbox(5, 6, 6, 11, 10, 10, t)],
      support: mountedSupport(st.mount, st.facing)
    };
  });
}
var BUTTON_BASES = new Set;
function addButton(key, name, tex, sound, wooden) {
  const id = button(key, name, tex, sound);
  BUTTONS[key] = id;
  BUTTON_BASES.add(id);
  if (wooden)
    WOODEN_BUTTONS.add(id);
  registerRedstone(id, { emitter: mountedEmitter });
  return id;
}
BUTTONS.stone = button("stone", "石", "stone", "stone");
for (const w of WOODS) {
  BUTTONS[w.key] = button(w.key, w.name, defs[w.block].tex[0], "wood");
  WOODEN_BUTTONS.add(BUTTONS[w.key]);
}
for (const id of Object.values(BUTTONS))
  BUTTON_BASES.add(id);
var mountedEmitter = {
  weak: (_v, _x, _y, _z, id) => mountedPowered(id) ? 15 : 0,
  strong: (_v, _x, _y, _z, id, face) => mountedPowered(id) && face === mountedAttachFace(id) ? 15 : 0
};
registerRedstone([LEVER, ...BUTTON_BASES], { emitter: mountedEmitter });
var PRESSURE_PLATES = {};
var WOODEN_PLATES = new Set;
function plateSupport(get) {
  const b = get(0, -1, 0);
  return b < 0 || sturdyTop(b) || isFence(b) || isWall(familyBase(b));
}
function plateModel(t, pressed) {
  return [mbox(1, 0, 1, 15, pressed ? 1 : 2, 15, t)];
}
function plateOpts(tex, sound, pressed) {
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.5,
    sound,
    all: tex,
    category: "redstone",
    walkThrough: true,
    collision: [],
    model: plateModel(L(tex), pressed),
    support: plateSupport
  };
}
function plate(key, name, tex, sound) {
  return family(`${key}_pressure_plate`, `${name}压力板`, [["powered", 2]], (st) => plateOpts(tex, sound, st.powered === 1));
}
PRESSURE_PLATES.stone = plate("stone", "石质", "stone", "stone");
for (const w of WOODS) {
  PRESSURE_PLATES[w.key] = plate(w.key, w.name, defs[w.block].tex[0], "wood");
  WOODEN_PLATES.add(PRESSURE_PLATES[w.key]);
}
var PLATE_BASES = new Set(Object.values(PRESSURE_PLATES));
function addPressurePlate(key, name, tex, sound, wooden) {
  const id = plate(key, name, tex, sound);
  PRESSURE_PLATES[key] = id;
  PLATE_BASES.add(id);
  if (wooden)
    WOODEN_PLATES.add(id);
  registerRedstone(id, { emitter: plateEmitter });
  return id;
}
var LIGHT_WEIGHTED_PLATE = family("light_weighted_pressure_plate", "轻质测重压力板", [["power", 16]], (st) => ({ ...plateOpts("gold_block", "metal", st.power > 0), tool: "pickaxe" }));
var HEAVY_WEIGHTED_PLATE = family("heavy_weighted_pressure_plate", "重质测重压力板", [["power", 16]], (st) => ({ ...plateOpts("iron_block", "metal", st.power > 0), tool: "pickaxe" }));
function isPressurePlate(id) {
  return id > 0 && PLATE_BASES.has(familyBase(id));
}
function isWeightedPlate(id) {
  const b = familyBase(id);
  return id > 0 && (b === LIGHT_WEIGHTED_PLATE || b === HEAVY_WEIGHTED_PLATE);
}
function platePower(id) {
  if (isPressurePlate(id))
    return id - familyBase(id) ? 15 : 0;
  if (isWeightedPlate(id))
    return id - familyBase(id);
  return 0;
}
var plateEmitter = {
  weak: (_v, _x, _y, _z, id) => platePower(id),
  strong: (_v, _x, _y, _z, id, face) => face === DOWN ? platePower(id) : 0
};
registerRedstone([...PLATE_BASES, LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE], { emitter: plateEmitter });
function torchBit(x, z, h, on) {
  const s = L(on ? "redstone_torch_side_on" : "redstone_torch_side_off"), t = L(on ? "redstone_torch_top_on" : "redstone_torch_top_off");
  return mbox(x, 2, z, x + 2, 2 + h, z + 2, [s, s, t, N, s, s]);
}
function diodeBase(top) {
  const side = L("smooth_stone_slab_side");
  return mbox(0, 0, 0, 16, 2, 16, [side, side, L(top), L("smooth_stone"), side, side]);
}
var REPEATER = family("repeater", "红石中继器", [["facing", 4], ["delay", 4], ["powered", 2], ["locked", 2]], (st) => {
  const on = st.powered === 1;
  const z = 6 + st.delay * 2;
  const boxes = [diodeBase(`repeater_${on ? "on" : "off"}_${st.facing}`), torchBit(7, 2, 5, on)];
  if (st.locked)
    boxes.push(mbox(2, 2, z, 14, 4, z + 2, L("bedrock")));
  else
    boxes.push(torchBit(7, z, 5, on));
  const model = rotateBoxes(boxes.slice(1), st.facing);
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "stone",
    all: "smooth_stone",
    category: "redstone",
    model: [boxes[0], ...model],
    collision: [0, 0, 0, 1, 2 / 16, 1],
    selection: [0, 0, 0, 1, 2 / 16, 1],
    support: topSupport
  };
});
function isRepeater(id) {
  return id >= REPEATER && id < REPEATER + 64;
}
function diodeFacing(id) {
  return id - familyBase(id) & 3;
}
function diodePowered(id) {
  return isRepeater(id) ? (id - REPEATER & 16) !== 0 : isComparator(id) ? (id - COMPARATOR & 8) !== 0 : false;
}
var COMPARATOR = family("comparator", "红石比较器", [["facing", 4], ["subtract", 2], ["powered", 2]], (st) => {
  const on = st.powered === 1;
  const boxes = [
    diodeBase(`comparator_${on ? "on" : "off"}_${st.facing}`),
    torchBit(4, 11, 5, on),
    torchBit(10, 11, 5, on),
    torchBit(7, 2, st.subtract ? 4 : 3, st.subtract === 1)
  ];
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "stone",
    all: "smooth_stone",
    category: "redstone",
    model: [boxes[0], ...rotateBoxes(boxes.slice(1), st.facing)],
    collision: [0, 0, 0, 1, 2 / 16, 1],
    selection: [0, 0, 0, 1, 2 / 16, 1],
    support: topSupport
  };
});
function isComparator(id) {
  return id >= COMPARATOR && id < COMPARATOR + 16;
}
function diodeOutFace(id) {
  return HFACE[diodeFacing(id)];
}
registerRedstone(REPEATER, {
  emitter: {
    weak: (_v, _x, _y, _z, id, face) => diodePowered(id) && face === diodeOutFace(id) ? 15 : 0,
    strong: (_v, _x, _y, _z, id, face) => diodePowered(id) && face === diodeOutFace(id) ? 15 : 0,
    connects: (id, face) => face === diodeOutFace(id) || face === (diodeOutFace(id) ^ 1)
  }
});
registerRedstone(COMPARATOR, {
  emitter: {
    weak: (v, x, y, z, id, face) => diodePowered(id) && face === diodeOutFace(id) ? v.getData(x, y, z) : 0,
    strong: (v, x, y, z, id, face) => diodePowered(id) && face === diodeOutFace(id) ? v.getData(x, y, z) : 0
  }
});
var REDSTONE_BLOCK = family("redstone_block", "红石块", [], () => ({
  all: "redstone_block",
  hardness: 5,
  tool: "pickaxe",
  tier: 1,
  sound: "metal",
  category: "redstone"
}));
registerRedstone(REDSTONE_BLOCK, { emitter: { weak: () => 15 } });
var REDSTONE_LAMP = family("redstone_lamp", "红石灯", [["lit", 2]], (st) => ({
  all: st.lit ? "redstone_lamp_on" : "redstone_lamp",
  hardness: 0.3,
  sound: "glass",
  emission: st.lit ? 15 : 0,
  category: "redstone"
}));
var DAYLIGHT_DETECTOR = family("daylight_detector", "阳光探测器", [["power", 16], ["inverted", 2]], (st) => {
  const side = L("daylight_detector_side");
  const top = L(st.inverted ? "daylight_detector_inverted_top" : "daylight_detector_top");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.2,
    sound: "wood",
    all: "daylight_detector_side",
    category: "redstone",
    model: [mbox(0, 0, 0, 16, 6, 16, [side, side, top, L("oak_planks"), side, side])],
    collision: [0, 0, 0, 1, 6 / 16, 1]
  };
});
var TARGET = family("target", "标靶", [["power", 16]], () => ({
  tex: ["target_side", "target_side", "target_top", "target_top", "target_side", "target_side"],
  hardness: 0.5,
  sound: "grass",
  category: "redstone"
}));
var NOTE_BLOCK = family("note_block", "音符盒", [["note", 25], ["powered", 2]], () => ({
  all: "note_block",
  hardness: 0.8,
  tool: "axe",
  sound: "wood",
  category: "redstone"
}));
var levelEmitter = (base) => ({ weak: (_v, _x, _y, _z, id) => id - base & 15 });
registerRedstone(DAYLIGHT_DETECTOR, { emitter: levelEmitter(DAYLIGHT_DETECTOR) });
registerRedstone(TARGET, { emitter: levelEmitter(TARGET) });
var TRIPWIRE_HOOK = family("tripwire_hook", "绊线钩", [["facing", 4], ["attached", 2], ["powered", 2]], (st) => {
  const wood = L("oak_planks"), iron = L("iron_block");
  const y = st.attached ? -2 : 0;
  const boxes = [
    mbox(6, 1, 14, 10, 10, 16, wood),
    mbox(7, 6 + y, 10, 9, 7 + y, 14, iron),
    mbox(6, 4 + y, 8, 7, 9 + y, 10, iron),
    mbox(9, 4 + y, 8, 10, 9 + y, 10, iron),
    mbox(7, 8 + y, 8, 9, 9 + y, 10, iron),
    mbox(7, 4 + y, 8, 9, 5 + y, 10, iron)
  ];
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "wood",
    all: "oak_planks",
    category: "redstone",
    walkThrough: true,
    collision: [],
    model: rotateBoxes(boxes, st.facing),
    selection: rotateFlat([5 / 16, 0, 10 / 16, 11 / 16, 10 / 16, 1], st.facing),
    support: (get) => supportAt(get, HFACE[st.facing + 2 & 3])
  };
});
function isTripwireHook(id) {
  return id >= TRIPWIRE_HOOK && id < TRIPWIRE_HOOK + 16;
}
function hookFacing(id) {
  return id - TRIPWIRE_HOOK & 3;
}
function hookPowered(id) {
  return (id - TRIPWIRE_HOOK & 8) !== 0;
}
var TRIPWIRE = family("tripwire", "绊线", [["powered", 2], ["attached", 2], ["disarmed", 2]], (st) => {
  const t = L("tripwire");
  const y = st.attached ? 1 : 2;
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0,
    sound: "wool",
    all: "tripwire",
    noItem: true,
    category: null,
    walkThrough: true,
    collision: [],
    selection: [0, 0, 0, 1, 2 / 16, 1],
    shape: (get) => {
      const c = [0, 1, 2, 3].map((d) => tripwireConnects(get(DIR_X[d], 0, DIR_Z[d]), d));
      const line = (d) => {
        if (d === 0)
          return mbox(7, y, 0, 8, y, 8, [N, N, t, t, N, N]);
        if (d === 2)
          return mbox(7, y, 8, 8, y, 16, [N, N, t, t, N, N]);
        if (d === 1)
          return mbox(8, y, 7, 16, y, 8, [N, N, t, t, N, N]);
        return mbox(0, y, 7, 8, y, 8, [N, N, t, t, N, N]);
      };
      if (!c[1] && !c[3])
        return [line(0), line(2)];
      if (!c[0] && !c[2])
        return [line(1), line(3)];
      return [0, 1, 2, 3].filter((d) => c[d]).map(line);
    }
  };
});
function isTripwire(id) {
  return id >= TRIPWIRE && id < TRIPWIRE + 8;
}
function tripwireConnects(id, dir) {
  return isTripwire(id) || isTripwireHook(id) && hookFacing(id) === (dir + 2 & 3);
}
registerRedstone(TRIPWIRE_HOOK, {
  emitter: {
    weak: (_v, _x, _y, _z, id) => hookPowered(id) ? 15 : 0,
    strong: (_v, _x, _y, _z, id, face) => hookPowered(id) && face === HFACE[hookFacing(id) + 2 & 3] ? 15 : 0
  }
});
var TRAPPED_CHEST = family("trapped_chest", "陷阱箱", [["facing", 4]], (st) => {
  const tex = ["chest_side", "chest_side", "chest_top", "chest_top", "chest_side", "chest_side"];
  tex[DIR_FACE[st.facing]] = "trapped_chest_front";
  return { tex, hardness: 2.5, tool: "axe", sound: "wood", category: "redstone" };
});
var TRAPPED_CHEST_DOUBLE = family("trapped_chest_double", "陷阱箱", [["facing", 4], ["side", 2]], (st) => {
  const tex = ["chest_side", "chest_side", "chest_top", "chest_top", "chest_side", "chest_side"];
  tex[DIR_FACE[st.facing]] = st.side === 0 ? "trapped_chest_front_seam_right" : "trapped_chest_front_seam_left";
  tex[DIR_FACE[st.facing + 2 & 3]] = st.side === 0 ? "chest_side_seam_left" : "chest_side_seam_right";
  return { tex, hardness: 2.5, tool: "axe", sound: "wood", category: null, base: TRAPPED_CHEST };
});
EXTRA_CHESTS.push({ single: TRAPPED_CHEST, double: TRAPPED_CHEST_DOUBLE });
registerRedstone([TRAPPED_CHEST, TRAPPED_CHEST_DOUBLE], {
  emitter: {
    weak: (v, x, y, z) => Math.min(15, v.getData(x, y, z)),
    strong: (v, x, y, z, _id, face) => face === DOWN ? Math.min(15, v.getData(x, y, z)) : 0
  }
});
var IRON_DOOR = family("iron_door", "铁门", [["facing", 4], ["half", 2], ["open", 2], ["hinge", 2]], (st) => {
  const tx = L(st.half ? "iron_door_top" : "iron_door_bottom");
  const panel = !st.open ? mbox(0, 0, 13, 16, 16, 16, tx) : st.hinge === 0 ? mbox(0, 0, 0, 3, 16, 16, tx) : mbox(13, 0, 0, 16, 16, 16, tx);
  return {
    hardness: 5,
    tool: "pickaxe",
    tier: 1,
    sound: "metal",
    render: R_MODEL,
    model: rotateBoxes([panel], st.facing),
    all: "iron_door_bottom",
    walkThrough: st.open === 1,
    category: "redstone"
  };
});
var IRON_TRAPDOOR = family("iron_trapdoor", "铁活板门", [["facing", 4], ["half", 2], ["open", 2]], (st) => {
  const tx = L("iron_trapdoor");
  const box = st.open ? rotateBoxes([mbox(0, 0, 13, 16, 16, 16, tx)], st.facing) : [st.half ? mbox(0, 13, 0, 16, 16, 16, tx) : mbox(0, 0, 0, 16, 3, 16, tx)];
  return { hardness: 5, tool: "pickaxe", tier: 1, sound: "metal", render: R_MODEL, model: box, all: "iron_trapdoor", category: "redstone" };
});
FAMILY_KINDS.set(IRON_DOOR, KINDS.door);
FAMILY_KINDS.set(IRON_TRAPDOOR, KINDS.trapdoor);
var LIT_REDSTONE_ORE = family("lit_redstone_ore", "红石矿石", [], () => ({
  tex: defs[REDSTONE_ORE].tex,
  hardness: defs[REDSTONE_ORE].hardness,
  tool: "pickaxe",
  tier: defs[REDSTONE_ORE].tier,
  sound: "stone",
  emission: 9,
  category: null,
  base: REDSTONE_ORE
}));
var DEEP_REDSTONE = DEEPSLATE_ORE[REDSTONE_ORE];
var LIT_DEEPSLATE_REDSTONE_ORE = family("lit_deepslate_redstone_ore", "深层红石矿石", [], () => ({
  tex: defs[DEEP_REDSTONE].tex,
  hardness: defs[DEEP_REDSTONE].hardness,
  tool: "pickaxe",
  tier: defs[DEEP_REDSTONE].tier,
  sound: "stone",
  emission: 9,
  category: null,
  base: DEEP_REDSTONE
}));
SURFACE_ORE[LIT_DEEPSLATE_REDSTONE_ORE] = REDSTONE_ORE;
SURFACE_ORE[LIT_REDSTONE_ORE] = REDSTONE_ORE;
var BULB_LIGHT = [15, 12, 8, 4];
var COPPER_BULB = addCopperVariants("bulb", "copper_bulb", "铜灯", [["lit", 2], ["powered", 2]], (s) => (st) => ({
  all: copperTexture(st.lit ? "copper_bulb_lit" : "copper_bulb", s),
  hardness: 3,
  tool: "pickaxe",
  tier: 1,
  sound: "metal",
  category: "redstone",
  emission: st.lit ? BULB_LIGHT[s] : 0
}));
var BULB_BASES = new Set(COPPER_BULB.flat());
function rodBoxes(t) {
  return [mbox(7, 0, 7, 9, 12, 9, t), mbox(6, 12, 6, 10, 16, 10, t)];
}
function pointTo(boxes, face) {
  if (face === UP2)
    return boxes;
  if (face === DOWN)
    return boxes.map((b) => ({ ...b, y0: 16 - b.y1, y1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[4], b.tex[5]] }));
  const north = boxes.map((b) => ({
    x0: b.x0,
    x1: b.x1,
    y0: b.z0,
    y1: b.z1,
    z0: 16 - b.y1,
    z1: 16 - b.y0,
    tex: [b.tex[0], b.tex[1], b.tex[4], b.tex[5], b.tex[3], b.tex[2]]
  }));
  return rotateBoxes(north, HFACE.indexOf(face));
}
var ROD_SEL = [0, 1, 2, 3, 4, 5].map((f) => {
  const [b] = pointTo([mbox(6, 0, 6, 10, 16, 10, 0)], f);
  return [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
});
var LIGHTNING_ROD = addCopperVariants("lightning_rod", "lightning_rod", "避雷针", [["facing", 6], ["powered", 2]], (s) => (st) => {
  const tex = st.powered ? "lightning_rod_on" : copperTexture("lightning_rod", s);
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    all: tex,
    hardness: 3,
    tool: "pickaxe",
    tier: 1,
    sound: "metal",
    category: "redstone",
    model: pointTo(rodBoxes(L(tex)), st.facing),
    itemModel: rodBoxes(L(copperTexture("lightning_rod", s))),
    collision: ROD_SEL[st.facing],
    selection: ROD_SEL[st.facing]
  };
});
var ROD_BASES = new Set(LIGHTNING_ROD.flat());
function rodFacing(id) {
  return (id - familyBase(id)) % 6;
}
function rodPowered(id) {
  return id - familyBase(id) >= 6;
}
registerRedstone([...ROD_BASES], {
  emitter: {
    weak: (_v, _x, _y, _z, id) => rodPowered(id) ? 15 : 0,
    strong: (_v, _x, _y, _z, id, face) => rodPowered(id) && face === (rodFacing(id) ^ 1) ? 15 : 0
  }
});
setConductor([GLOWSTONE, REDSTONE_BLOCK, ...[0, 1, 2, 3].map((f) => CHEST + f)], false);
for (let i = 0;i < 4; i++)
  setConductor(TRAPPED_CHEST + i, false);
for (let i = 0;i < 8; i++)
  setConductor(TRAPPED_CHEST_DOUBLE + i, false);
var REDSTONE_INVENTORY = [
  REDSTONE_TORCH,
  REDSTONE_BLOCK,
  REPEATER,
  COMPARATOR,
  LEVER,
  ...Object.values(BUTTONS),
  ...Object.values(PRESSURE_PLATES),
  LIGHT_WEIGHTED_PLATE,
  HEAVY_WEIGHTED_PLATE,
  REDSTONE_LAMP,
  DAYLIGHT_DETECTOR,
  TARGET,
  TRIPWIRE_HOOK,
  NOTE_BLOCK,
  TRAPPED_CHEST,
  IRON_DOOR,
  IRON_TRAPDOOR
];
// goodPG/src/shared/blocks/mechanismBlocks.ts
function edgeTurn(f, dir) {
  const [u0, v0] = autoUV(f, 8, 8, 8);
  const [u1, v1] = autoUV(f, 8 + FACE_X[dir], 8 + FACE_Y[dir], 8 + FACE_Z[dir]);
  const du = u1 - u0, dv = v1 - v0;
  return dv < 0 ? 0 : du > 0 ? 1 : dv > 0 ? 2 : 3;
}
var turned = (name, turn) => turn & 3 ? `${name}_r${turn & 3}` : name;
function pointBoxes(boxes, face) {
  if (face === UP2)
    return boxes;
  if (face === DOWN)
    return boxes.map((b) => ({ ...b, y0: 16 - b.y1, y1: 16 - b.y0, tex: [b.tex[0], b.tex[1], b.tex[3], b.tex[2], b.tex[4], b.tex[5]] }));
  const north = boxes.map((b) => ({
    x0: b.x0,
    x1: b.x1,
    y0: b.z0,
    y1: b.z1,
    z0: 16 - b.y1,
    z1: 16 - b.y0,
    tex: [b.tex[0], b.tex[1], b.tex[4], b.tex[5], b.tex[3], b.tex[2]]
  }));
  return rotateBoxes(north, HFACE.indexOf(face));
}
var FACING_ORDER = new Map;
var ORDER_UP = [UP2, DOWN, NORTH, SOUTH, WEST, EAST];
var ORDER_SOUTH = [SOUTH, NORTH, EAST, WEST, UP2, DOWN];
function sixWay(key, name, order, props, make) {
  const base = family(key, name, [["facing", 6], ...props], (st) => make(order[st.facing], st));
  FACING_ORDER.set(base, order);
  return base;
}
function facingOf(id) {
  const b = familyBase(id);
  const v = (id - b) % 6;
  return FACING_ORDER.get(b)?.[v] ?? v;
}
var T_FRONT = 100;
var T_BACK = 101;
var T_SIDE = 102;
var T_ARM = 103;
var T_INNER = 104;
var T_HEAD_BACK = 105;
function pistonTextures(boxes, facing, sticky) {
  const layer = (tag, f) => {
    switch (tag) {
      case T_FRONT:
        return L(sticky ? "piston_top_sticky" : "piston_top");
      case T_HEAD_BACK:
        return L("piston_top");
      case T_BACK:
        return L("piston_bottom");
      case T_INNER:
        return L("piston_inner");
      case T_ARM:
        return L("oak_planks");
      case T_SIDE:
        return L(turned("piston_side", edgeTurn(f, facing)));
      default:
        return tag;
    }
  };
  return boxes.map((b) => ({ ...b, tex: b.tex.map((t, f) => layer(t, f)) }));
}
var N2 = -1;
var BASE_UP = [
  mbox(0, 0, 0, 16, 12, 16, [T_SIDE, T_SIDE, T_INNER, T_BACK, T_SIDE, T_SIDE]),
  mbox(6, 12, 6, 10, 16, 10, [T_ARM, T_ARM, N2, N2, T_ARM, T_ARM])
];
var HEAD_UP = [
  mbox(0, 12, 0, 16, 16, 16, [T_SIDE, T_SIDE, T_FRONT, T_HEAD_BACK, T_SIDE, T_SIDE]),
  mbox(6, 0, 6, 10, 12, 10, [T_ARM, T_ARM, N2, N2, T_ARM, T_ARM])
];
function pistonCube(facing, sticky) {
  const tex = [0, 1, 2, 3, 4, 5].map((f) => turned("piston_side", edgeTurn(f, facing)));
  tex[facing] = sticky ? "piston_top_sticky" : "piston_top";
  tex[facing ^ 1] = "piston_bottom";
  return tex;
}
function piston(key, name, sticky) {
  return sixWay(key, name, ORDER_UP, [["extended", 2]], (facing, st) => {
    const tex = pistonCube(facing, sticky);
    const base = { hardness: 1.5, tool: "pickaxe", sound: "stone", category: "redstone" };
    if (!st.extended)
      return { ...base, tex };
    return {
      ...base,
      tex,
      render: R_MODEL,
      opaque: false,
      lightOpacity: 0,
      model: pistonTextures(pointBoxes(BASE_UP, facing), facing, sticky),
      itemModel: undefined
    };
  });
}
var PISTON = piston("piston", "活塞", false);
var STICKY_PISTON = piston("sticky_piston", "黏性活塞", true);
var PISTON_HEAD = sixWay("piston_head", "活塞头", ORDER_UP, [["sticky", 2]], (facing, st) => ({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  hardness: 1.5,
  tool: "pickaxe",
  sound: "stone",
  noItem: true,
  category: null,
  all: "piston_top",
  model: pistonTextures(pointBoxes(HEAD_UP, facing), facing, st.sticky === 1)
}));
var MOVING_BLOCK = family("moving_piston", "移动的活塞", [], () => ({
  render: R_NONE,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  hardness: -1,
  breakable: false,
  noItem: true,
  category: null,
  all: "piston_side",
  collision: [],
  selection: []
}));
for (let i = 0;i < 12; i++)
  setConductor([PISTON + i, STICKY_PISTON + i], false);
var OBSERVER = sixWay("observer", "侦测器", ORDER_SOUTH, [["powered", 2]], (facing, st) => {
  const tex = [0, 1, 2, 3, 4, 5].map((f) => {
    const vertical = facing === UP2 || facing === DOWN;
    const arrowFace = vertical ? f === 4 || f === 5 : f === UP2 || f === DOWN;
    return arrowFace ? turned("observer_top", edgeTurn(f, facing ^ 1)) : "observer_side";
  });
  tex[facing] = "observer_front";
  tex[facing ^ 1] = st.powered ? "observer_back_on" : "observer_back";
  return { tex, hardness: 3, tool: "pickaxe", tier: 1, sound: "stone", category: "redstone" };
});
function observerPowered(id) {
  return id - OBSERVER >= 6;
}
registerRedstone(OBSERVER, {
  emitter: {
    weak: (_v, _x, _y, _z, id, face) => observerPowered(id) && face === (facingOf(id) ^ 1) ? 15 : 0,
    strong: (_v, _x, _y, _z, id, face) => observerPowered(id) && face === (facingOf(id) ^ 1) ? 15 : 0,
    connects: (id, face) => face === (facingOf(id) ^ 1)
  }
});
for (let i = 0;i < 12; i++)
  setConductor(OBSERVER + i, false);
var HOPPER_DOWN = 0;
function hopperBoxes(facing) {
  const out = L("hopper_outside"), inside = L("hopper_inside"), top = L("hopper_top");
  const boxes = [
    mbox(0, 10, 0, 16, 11, 16, [out, out, inside, out, out, out]),
    mbox(0, 11, 0, 2, 16, 16, [inside, out, top, N2, out, out]),
    mbox(14, 11, 0, 16, 16, 16, [out, inside, top, N2, out, out]),
    mbox(2, 11, 0, 14, 16, 2, [N2, N2, top, N2, inside, out]),
    mbox(2, 11, 14, 14, 16, 16, [N2, N2, top, N2, out, inside]),
    mbox(4, 4, 4, 12, 10, 12, out)
  ];
  if (facing === HOPPER_DOWN)
    boxes.push(mbox(6, 0, 6, 10, 4, 10, out));
  else
    boxes.push(...rotateBoxes([mbox(6, 4, 0, 10, 8, 4, out)], facing - 1));
  return boxes;
}
var HOPPER = family("hopper", "漏斗", [["facing", 5], ["locked", 2]], (st) => ({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  hardness: 3,
  tool: "pickaxe",
  tier: 1,
  sound: "metal",
  category: "redstone",
  all: "hopper_outside",
  model: hopperBoxes(st.facing),
  itemModel: hopperBoxes(HOPPER_DOWN)
}));
function dispenserLike(key, name, front) {
  return sixWay(key, name, ORDER_SOUTH, [["triggered", 2]], (facing) => {
    const vertical = facing === UP2 || facing === DOWN;
    const tex = [0, 1, 2, 3, 4, 5].map((f) => vertical || f === UP2 || f === DOWN ? "furnace_top" : "furnace_side");
    tex[facing] = vertical ? `${front}_vertical` : front;
    return { tex, hardness: 3.5, tool: "pickaxe", tier: 1, sound: "stone", category: "redstone" };
  });
}
var DISPENSER = dispenserLike("dispenser", "发射器", "dispenser_front");
var DROPPER = dispenserLike("dropper", "投掷器", "dropper_front");
var TNT = family("tnt", "TNT", [], () => ({
  side: "tnt_side",
  top: "tnt_top",
  bottom: "tnt_bottom",
  hardness: 0,
  sound: "grass",
  category: "redstone"
}));
setConductor(TNT, false);
var MECHANISM_INVENTORY = [PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT];
// goodPG/src/shared/blocks/deepDarkBlocks.ts
var N3 = -1;
var WET2 = { fluid: 1, level: 0, lightOpacity: 2 };
function markWet2(base) {
  for (let id = base;defs[id] && familyBase(id) === base; id++)
    if (defs[id].fluid === 1)
      BLOCK_WATERLOGGED[id] = 1;
}
var INVENTORY2 = [];
var sculkish = (o) => ({ tool: "hoe", sound: "sculk", category: "naturaleza", ...o });
var SCULK = family("sculk", "幽匿块", [], () => sculkish({ all: "sculk", hardness: 0.2 }));
var VEIN_FACES = 64;
var FACE_DX = [1, -1, 0, 0, 0, 0];
var FACE_DY = [0, 0, 1, -1, 0, 0];
var FACE_DZ = [0, 0, 0, 0, 1, -1];
function veinBoxes(mask) {
  const t = L("sculk_vein");
  const out = [];
  const faces = (outer) => [t, t, t, t, t, t].map((v, i) => i === outer ? N3 : v);
  const d = 0.1;
  if (mask & 1)
    out.push(mbox(16 - d, 0, 0, 16, 16, 16, faces(0)));
  if (mask & 2)
    out.push(mbox(0, 0, 0, d, 16, 16, faces(1)));
  if (mask & 4)
    out.push(mbox(0, 16 - d, 0, 16, 16, 16, faces(2)));
  if (mask & 8)
    out.push(mbox(0, 0, 0, 16, d, 16, faces(3)));
  if (mask & 16)
    out.push(mbox(0, 0, 16 - d, 16, 16, 16, faces(4)));
  if (mask & 32)
    out.push(mbox(0, 0, 0, 16, 16, d, faces(5)));
  return out;
}
var SCULK_VEIN = family("sculk_vein", "幽匿脉络", [["faces", VEIN_FACES]], (st) => {
  const mask = st.faces;
  const boxes = veinBoxes(mask || 8);
  const sel = [];
  for (const b of boxes)
    sel.push(b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16);
  return sculkish({
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.2,
    all: "sculk_vein",
    flatItem: "sculk_vein",
    replaceable: true,
    walkThrough: true,
    model: veinBoxes(mask),
    itemModel: veinBoxes(8),
    collision: [],
    selection: sel,
    category: mask === 0 ? "naturaleza" : null,
    support: (get) => mask !== 0 && veinAttached(mask, get) !== 0
  });
});
function veinWith(mask) {
  return mask & 63 ? SCULK_VEIN + (mask & 63) : 0;
}
function veinCanStick(b) {
  return b < 0 || BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1;
}
function veinAttached(mask, get) {
  let out = 0;
  for (let f = 0;f < 6; f++)
    if (mask & 1 << f && veinCanStick(get(FACE_DX[f], FACE_DY[f], FACE_DZ[f])))
      out |= 1 << f;
  return out;
}
var VEIN_DIRS = FACE_DX.map((dx, f) => [dx, FACE_DY[f], FACE_DZ[f]]);
var SCULK_CATALYST = family("sculk_catalyst", "幽匿催发体", [["bloom", 2]], (st) => sculkish({
  top: st.bloom ? "sculk_catalyst_top_bloom" : "sculk_catalyst_top",
  side: st.bloom ? "sculk_catalyst_side_bloom" : "sculk_catalyst_side",
  bottom: "sculk_catalyst_bottom",
  hardness: 3,
  emission: 6
}));
var PHASE_ACTIVE = 1;
function sensorBoxes(active, calibrated, facing) {
  const side = L(calibrated ? "calibrated_sculk_sensor_side" : "sculk_sensor_side");
  const top = L(calibrated ? "calibrated_sculk_sensor_top" : "sculk_sensor_top");
  const bottom = L("sculk_sensor_bottom");
  const tex = [side, side, top, bottom, side, side];
  if (calibrated)
    tex[[5, 0, 4, 1][facing]] = L("calibrated_sculk_sensor_input_side");
  const out = [mbox(0, 0, 0, 16, 8, 16, tex)];
  const tendril = L(active ? "sculk_sensor_tendril_active" : "sculk_sensor_tendril");
  const x = [tendril, tendril, N3, N3, N3, N3], z = [N3, N3, N3, N3, tendril, tendril];
  out.push(mbox(2, 8, 4, 8, 16, 4, z), mbox(12, 8, 2, 12, 16, 8, x), mbox(8, 8, 12, 14, 16, 12, z), mbox(4, 8, 8, 4, 16, 14, x));
  if (calibrated) {
    const a = L(active ? "calibrated_sculk_sensor_amethyst_active" : "calibrated_sculk_sensor_amethyst");
    out.push(mbox(5, 8, 8, 11, 16, 8, [N3, N3, N3, N3, a, a]), mbox(8, 8, 5, 8, 16, 11, [a, a, N3, N3, N3, N3]));
  }
  return out;
}
var HALF_BOX = [0, 0, 0, 1, 0.5, 1];
var SCULK_SENSOR = family("sculk_sensor", "幽匿感测体", [["phase", 3], ["water", 2]], (st) => sculkish({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  hardness: 1.5,
  emission: 1,
  category: "redstone",
  all: "sculk_sensor_side",
  model: sensorBoxes(st.phase === PHASE_ACTIVE, false, 0),
  itemModel: sensorBoxes(false, false, 0),
  collision: HALF_BOX,
  selection: HALF_BOX,
  ...st.water ? WET2 : {}
}));
markWet2(SCULK_SENSOR);
var CALIBRATED_SCULK_SENSOR = family("calibrated_sculk_sensor", "校准幽匿感测体", [["facing", 4], ["phase", 3], ["water", 2]], (st) => sculkish({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  hardness: 1.5,
  emission: 1,
  category: "redstone",
  all: "calibrated_sculk_sensor_side",
  model: sensorBoxes(st.phase === PHASE_ACTIVE, true, st.facing),
  itemModel: sensorBoxes(false, true, 2),
  collision: HALF_BOX,
  selection: HALF_BOX,
  ...st.water ? WET2 : {}
}));
markWet2(CALIBRATED_SCULK_SENSOR);
function isSculkSensor(id) {
  return id > 0 && familyBase(id) === SCULK_SENSOR;
}
function isCalibratedSensor(id) {
  return id > 0 && familyBase(id) === CALIBRATED_SCULK_SENSOR;
}
function isAnySensor(id) {
  return isSculkSensor(id) || isCalibratedSensor(id);
}
function sensorPhase(id) {
  return isAnySensor(id) ? stateProps(id).phase : -1;
}
function calibratedInputFace(id) {
  return HFACE[stateProps(id)?.facing ?? 0];
}
var signalPower = (data) => data & 15;
var signalFrequency = (data) => data >> 4 & 15;
var activePower = (v, x, y, z, id) => sensorPhase(id) === PHASE_ACTIVE ? signalPower(v.getData(x, y, z)) : 0;
registerRedstone(SCULK_SENSOR, {
  emitter: {
    weak: (v, x, y, z, id) => activePower(v, x, y, z, id),
    strong: (v, x, y, z, id, face) => face === DOWN ? activePower(v, x, y, z, id) : 0
  },
  analog: (api, x, y, z, id) => sensorPhase(id) === PHASE_ACTIVE ? signalFrequency(api.getData(x, y, z)) : 0
});
registerRedstone(CALIBRATED_SCULK_SENSOR, {
  emitter: {
    weak: (v, x, y, z, id, face) => face === calibratedInputFace(id) ? 0 : activePower(v, x, y, z, id),
    strong: (v, x, y, z, id, face) => face === DOWN ? activePower(v, x, y, z, id) : 0,
    connects: (id, face) => face !== calibratedInputFace(id)
  },
  analog: (api, x, y, z, id) => sensorPhase(id) === PHASE_ACTIVE ? signalFrequency(api.getData(x, y, z)) : 0
});
function shriekerBoxes(canSummon) {
  const side = L("sculk_shrieker_side"), top = L("sculk_shrieker_top"), bottom = L("sculk_shrieker_bottom");
  const inner = L(canSummon ? "sculk_shrieker_can_summon_inner_top" : "sculk_shrieker_inner_top");
  return [
    mbox(0, 0, 0, 16, 8, 16, [side, side, top, bottom, side, side]),
    mbox(1, 8, 1, 15, 15, 15, [side, side, inner, N3, side, side])
  ];
}
var SCULK_SHRIEKER = family("sculk_shrieker", "幽匿尖啸体", [["shrieking", 2], ["can_summon", 2], ["water", 2]], (st) => sculkish({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  hardness: 3,
  all: "sculk_shrieker_side",
  category: "redstone",
  model: shriekerBoxes(st.can_summon === 1),
  itemModel: shriekerBoxes(false),
  collision: HALF_BOX,
  selection: HALF_BOX,
  ...st.water ? WET2 : {}
}));
markWet2(SCULK_SHRIEKER);
function shriekerFor(canSummon, wet = false) {
  return stateOf(SCULK_SHRIEKER, { shrieking: 0, can_summon: canSummon ? 1 : 0, water: wet ? 1 : 0 });
}
INVENTORY2.push(SCULK, SCULK_VEIN, SCULK_CATALYST, SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER);
var REINFORCED_DEEPSLATE = family("reinforced_deepslate", "强化深板岩", [], () => ({
  top: "reinforced_deepslate_top",
  side: "reinforced_deepslate_side",
  bottom: "reinforced_deepslate_bottom",
  hardness: 55,
  sound: "stone",
  category: "construccion"
}));
INVENTORY2.push(REINFORCED_DEEPSLATE);
var SOUL_SAND = family("soul_sand", "灵魂沙", [], () => ({
  all: "soul_sand",
  hardness: 0.5,
  tool: "shovel",
  sound: "soul_sand",
  category: "naturaleza",
  collision: [0, 0, 0, 1, 14 / 16, 1],
  selection: [0, 0, 0, 1, 1, 1]
}));
var SOUL_SOIL = family("soul_soil", "灵魂土", [], () => ({
  all: "soul_soil",
  hardness: 0.5,
  tool: "shovel",
  sound: "soul_soil",
  category: "naturaleza"
}));
function isSoulGround(id) {
  return id === SOUL_SAND || id === SOUL_SOIL;
}
function soulFireBoxes() {
  const f = L("soul_fire");
  const x = [f, f, N3, N3, N3, N3], z = [N3, N3, N3, N3, f, f];
  return [
    mbox(8, 0, 0, 8, 16, 16, x),
    mbox(0, 0, 8, 16, 16, 8, z),
    mbox(1, 0, 0, 1, 15, 16, x),
    mbox(15, 0, 0, 15, 15, 16, x),
    mbox(0, 0, 1, 16, 15, 1, z),
    mbox(0, 0, 15, 16, 15, 15, z)
  ];
}
var SOUL_FIRE = family("soul_fire", "灵魂火", [], () => ({
  render: R_MODEL,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  emission: 10,
  hardness: 0,
  sound: "wool",
  all: "soul_fire",
  replaceable: true,
  walkThrough: true,
  noItem: true,
  category: null,
  model: soulFireBoxes(),
  collision: [],
  selection: [0, 0, 0, 1, 1 / 16, 1],
  support: (get) => isSoulGround(get(0, -1, 0))
}));
var SOUL_TORCH = family("soul_torch", "灵魂火把", [], () => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: 10,
  sound: "wood",
  all: "soul_torch",
  hardness: 0,
  category: "decoracion"
}));
var SOUL_WALL_TORCH = family("soul_wall_torch", "灵魂火把", [["facing", 4]], (st) => ({
  render: R_TORCH,
  solid: false,
  lightOpacity: 0,
  emission: 10,
  sound: "wood",
  all: "soul_torch",
  hardness: 0,
  category: null,
  wall: st.facing,
  base: SOUL_TORCH,
  selection: rotateFlat([5.5 / 16, 3 / 16, 11 / 16, 10.5 / 16, 13 / 16, 1], st.facing)
}));
var holds3 = (id) => id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);
function soulLanternBoxes(hanging) {
  const s = L("soul_lantern"), t = L("lantern_top"), c = L("chain");
  const dy = hanging ? 1 : 0;
  const out = [
    mbox(5, dy, 5, 11, 7 + dy, 11, [s, s, t, t, s, s]),
    mbox(6, 7 + dy, 6, 10, 9 + dy, 10, [s, s, t, N3, s, s])
  ];
  if (hanging)
    out.push(mbox(8, 10, 6, 8, 16, 10, [c, c, N3, N3, N3, N3]), mbox(6, 10, 8, 10, 16, 8, [N3, N3, N3, N3, c, c]));
  return out;
}
var SOUL_LANTERN = family("soul_lantern", "灵魂灯笼", [["hanging", 2]], (st) => {
  const hanging = st.hanging === 1;
  const box = hanging ? [5 / 16, 1 / 16, 5 / 16, 11 / 16, 10 / 16, 11 / 16] : [5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16];
  return {
    render: R_MODEL,
    hardness: 3.5,
    tool: "pickaxe",
    sound: "metal",
    category: "decoracion",
    all: "soul_lantern",
    emission: 10,
    lightOpacity: 0,
    model: soulLanternBoxes(hanging),
    collision: box,
    selection: box,
    itemModel: soulLanternBoxes(false),
    support: (get) => hanging ? holds3(get(0, 1, 0)) : holds3(get(0, -1, 0))
  };
});
INVENTORY2.push(SOUL_SAND, SOUL_SOIL, SOUL_TORCH, SOUL_LANTERN);
var DEEP_DARK_INVENTORY = INVENTORY2;
var REPLACEABLE_KEYS = /^(stone|granite|diorite|andesite|deepslate|tuff|calcite|smooth_basalt|dirt|coarse_dirt|rooted_dirt|podzol|mycelium|grass_block|snowy_grass_block|moss_block|mud|clay|sand|red_sand|gravel|soul_sand|soul_soil|sandstone|red_sandstone|dripstone_block|terracotta|[a-z_]+_terracotta|netherrack|cobbled_deepslate|cobblestone|mossy_cobblestone)$/;
var replaceableTable = null;
function sculkReplaceable(id) {
  if (id <= 0)
    return false;
  if (!replaceableTable) {
    replaceableTable = new Uint8Array(defs.length);
    for (const b of defs) {
      if (!b || b.fluid || /glazed/.test(b.key))
        continue;
      const key = defs[familyBase(b.id)]?.key ?? b.key;
      if (familyBase(b.id) === b.id && REPLACEABLE_KEYS.test(key))
        replaceableTable[b.id] = 1;
    }
  }
  return replaceableTable[id] === 1;
}
// goodPG/src/shared/blocks/netherBlocks.ts
var INVENTORY3 = [];
var NETHER_PORTAL = family("nether_portal", "下界传送门", [["axis", 2]], (st) => {
  const t = L("nether_portal");
  const box = st.axis === 0 ? mbox(0, 0, 6, 16, 16, 10, t) : mbox(6, 0, 0, 10, 16, 16, t);
  return {
    render: R_MODEL,
    all: "nether_portal",
    model: [box],
    solid: false,
    opaque: false,
    lightOpacity: 0,
    emission: 11,
    hardness: -1,
    breakable: false,
    sound: "glass",
    noItem: true,
    category: null,
    walkThrough: true
  };
});
var NETHER_QUARTZ_ORE = family("nether_quartz_ore", "下界石英矿石", [], () => ({
  all: "nether_quartz_ore",
  hardness: 3,
  tool: "pickaxe",
  tier: 1,
  category: "minerales",
  sound: "nether_ore"
}));
var NETHER_GOLD_ORE = family("nether_gold_ore", "下界金矿石", [], () => ({
  all: "nether_gold_ore",
  hardness: 3,
  tool: "pickaxe",
  tier: 1,
  category: "minerales",
  sound: "nether_ore"
}));
var MAGMA_BLOCK = family("magma_block", "岩浆块", [], () => ({
  all: "magma",
  hardness: 0.5,
  tool: "pickaxe",
  tier: 1,
  emission: 3,
  category: "naturaleza"
}));
INVENTORY3.push(NETHER_QUARTZ_ORE, NETHER_GOLD_ORE, MAGMA_BLOCK);
var NETHER_INVENTORY = INVENTORY3;
// goodPG/src/shared/blocks/netherBiomeBlocks.ts
var INVENTORY4 = [];
function rename(id, name) {
  for (const s of familyStates(familyBase(id)))
    defs[s].name = name;
}
function resound(id, sound) {
  for (const s of familyStates(familyBase(id)))
    defs[s].sound = sound;
}
var STEM_OPTS = { sound: "stem", hardness: 2, tool: "axe", category: "naturaleza" };
function netherWood(key, name, wood) {
  const side = `${key}_stem_side`, top = `${key}_stem_top`, sSide = `stripped_${key}_stem_side`, sTop = `stripped_${key}_stem_top`;
  const stem = family(`${key}_stem`, `${name}菌柄`, [], () => ({ ...STEM_OPTS, top, side }));
  const axis = addAxisLogs(`${key}_stem`, `${name}菌柄`, stem, top, side, undefined, { sound: "stem" });
  const strippedStem = family(`stripped_${key}_stem`, `去皮${name}菌柄`, [], () => ({ ...STEM_OPTS, top: sTop, side: sSide }));
  const sAxis = addAxisLogs(`stripped_${key}_stem`, `去皮${name}菌柄`, strippedStem, sTop, sSide, undefined, { sound: "stem" });
  const hyphae = family(`${key}_hyphae`, `${name}菌核`, [], () => ({ ...STEM_OPTS, all: side }));
  const strippedHyphae = family(`stripped_${key}_hyphae`, `去皮${name}菌核`, [], () => ({ ...STEM_OPTS, all: sSide }));
  addStrip(stem, strippedStem);
  addStrip(hyphae, strippedHyphae);
  for (const a2 of [AXIS_X, AXIS_Z])
    addStrip(axis + a2, sAxis + a2);
  const planks = family(`${key}_planks`, `${name}木板`, [], () => ({
    all: `${key}_planks`,
    sound: "nether_wood",
    hardness: 2,
    tool: "axe"
  }));
  addPlanks(planks);
  const m = { key, name: wood, block: planks, hardness: 2, tool: "axe", tier: 0, sound: "nether_wood" };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign(key, wood);
  addHangingSign(key, wood, strippedStem, sSide);
  addButton(key, wood, `${key}_planks`, "nether_wood", true);
  addPressurePlate(key, wood, `${key}_planks`, "nether_wood", true);
  rename(STAIRS[key], `${wood}楼梯`);
  rename(FENCE_GATES[key], `${wood}栅栏门`);
  for (const id of [DOORS[key], TRAPDOORS[key], SIGNS[key], WALL_SIGNS[key], HANGING_SIGNS[key], WALL_HANGING_SIGNS[key]])
    resound(id, "nether_wood");
  INVENTORY4.push(stem, strippedStem, hyphae, strippedHyphae, planks);
  return { key, stem, strippedStem, hyphae, strippedHyphae, planks };
}
var CRIMSON = netherWood("crimson", "绯红", "绯红木");
var WARPED = netherWood("warped", "诡异", "诡异木");
var CRIMSON_STEM = CRIMSON.stem;
var WARPED_STEM = WARPED.stem;
var CRIMSON_PLANKS = CRIMSON.planks;
var WARPED_PLANKS = WARPED.planks;
var NETHER_WOOD_KEYS = /^(stripped_)?(crimson|warped)_/;
function isNetherWood(key) {
  return NETHER_WOOD_KEYS.test(key);
}
function nylium(key, name) {
  return family(`${key}_nylium`, name, [], () => ({
    top: `${key}_nylium`,
    side: `${key}_nylium_side`,
    bottom: "netherrack",
    hardness: 0.4,
    tool: "pickaxe",
    tier: 1,
    sound: "nylium",
    category: "naturaleza"
  }));
}
var CRIMSON_NYLIUM = nylium("crimson", "绯红菌岩");
var WARPED_NYLIUM = nylium("warped", "诡异菌岩");
function isNylium(id) {
  return id === CRIMSON_NYLIUM || id === WARPED_NYLIUM;
}
var VEGETATION_SOIL = new Set([DIRT, COARSE_DIRT, ROOTED_DIRT, MUD, MUDDY_MANGROVE_ROOTS, MOSS_BLOCK, GRASS, SNOWY_GRASS, PODZOL, MYCELIUM]);
function isVegetationSoil(b) {
  return VEGETATION_SOIL.has(b) || isFarmland(b);
}
function netherPlantSoil(b, fungus) {
  if (b < 0)
    return true;
  if (VEGETATION_SOIL.has(b) || isFarmland(b) || isNylium(b) || b === SOUL_SOIL)
    return true;
  return fungus && b === MYCELIUM;
}
var PLANT = { render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, hardness: 0, category: "naturaleza", walkThrough: true };
function netherPlant(key, name, sound, fungus, selection, extra = {}) {
  return family(key, name, [], () => ({
    ...PLANT,
    sound,
    all: key,
    selection,
    ...extra,
    support: (get) => netherPlantSoil(get(0, -1, 0), fungus)
  }));
}
var px = (v) => v / 16;
var FUNGUS_BOX = [px(4), 0, px(4), px(12), px(9), px(12)];
var ROOTS_BOX = [px(2), 0, px(2), px(14), px(13), px(14)];
var SPROUTS_BOX = [px(2), 0, px(2), px(14), px(3), px(14)];
var CRIMSON_FUNGUS = netherPlant("crimson_fungus", "绯红菌", "fungus", true, FUNGUS_BOX);
var WARPED_FUNGUS = netherPlant("warped_fungus", "诡异菌", "fungus", true, FUNGUS_BOX);
var CRIMSON_ROOTS = netherPlant("crimson_roots", "绯红菌索", "roots", false, ROOTS_BOX, { replaceable: true });
var WARPED_ROOTS = netherPlant("warped_roots", "诡异菌索", "roots", false, ROOTS_BOX, { replaceable: true });
var NETHER_SPROUTS = netherPlant("nether_sprouts", "下界苗", "roots", false, SPROUTS_BOX, { replaceable: true });
var VINE_MAX_AGE = 25;
function sturdyBottom(b) {
  if (sturdy(b))
    return true;
  if (isSlab(b))
    return stateProps(b).type !== 0;
  if (isStairs(b))
    return stateProps(b).half === 0;
  return false;
}
function sturdyTopFace(b) {
  if (sturdy(b))
    return true;
  if (isSlab(b))
    return stateProps(b).type !== 0;
  if (isStairs(b))
    return stateProps(b).half === 1;
  return false;
}
function netherVine(key, name, down) {
  const dy = down ? 1 : -1;
  let head = 0, body = 0;
  const attached = (get) => {
    const b = get(0, dy, 0);
    if (b < 0)
      return true;
    const fb = familyBase(b);
    if (fb === head || fb === body)
      return true;
    return down ? sturdyBottom(b) : sturdyTopFace(b);
  };
  const common = {
    ...PLANT,
    sound: "vines",
    climbable: true,
    collision: [],
    support: attached
  };
  head = family(key, name, [["age", VINE_MAX_AGE + 1]], () => ({
    ...common,
    all: key,
    selection: down ? [px(4), px(9), px(4), px(12), 1, px(12)] : [px(4), 0, px(4), px(12), px(15), px(12)]
  }));
  body = family(`${key}_plant`, name, [], () => ({
    ...common,
    all: `${key}_plant`,
    category: null,
    base: head,
    selection: [px(1), 0, px(1), px(15), 1, px(15)]
  }));
  return { head, body };
}
var WEEPING = netherVine("weeping_vines", "垂泪藤", true);
var TWISTING = netherVine("twisting_vines", "缠怨藤", false);
var WEEPING_VINES = WEEPING.head;
var WEEPING_VINES_PLANT = WEEPING.body;
var TWISTING_VINES = TWISTING.head;
var TWISTING_VINES_PLANT = TWISTING.body;
var NETHER_WART_BLOCK = family("nether_wart_block", "下界疣块", [], () => ({
  all: "nether_wart_block",
  hardness: 1,
  tool: "hoe",
  sound: "wart",
  category: "naturaleza"
}));
var WARPED_WART_BLOCK = family("warped_wart_block", "诡异疣块", [], () => ({
  all: "warped_wart_block",
  hardness: 1,
  tool: "hoe",
  sound: "wart",
  category: "naturaleza"
}));
var SHROOMLIGHT = family("shroomlight", "菌光体", [], () => ({
  all: "shroomlight",
  hardness: 1,
  tool: "hoe",
  sound: "shroomlight",
  emission: 15,
  category: "naturaleza"
}));
INVENTORY4.push(CRIMSON_NYLIUM, WARPED_NYLIUM, CRIMSON_FUNGUS, WARPED_FUNGUS, CRIMSON_ROOTS, WARPED_ROOTS, NETHER_SPROUTS, WEEPING_VINES, TWISTING_VINES, NETHER_WART_BLOCK, WARPED_WART_BLOCK, SHROOMLIGHT);
var PICK = (hardness, sound) => ({ hardness, tool: "pickaxe", tier: 1, sound });
var BASALT = family("basalt", "玄武岩", [], () => ({ ...PICK(1.25, "basalt"), top: "basalt_top", side: "basalt_side", category: "naturaleza" }));
addAxisLogs("basalt", "玄武岩", BASALT, "basalt_top", "basalt_side", undefined, PICK(1.25, "basalt"));
var POLISHED_BASALT = family("polished_basalt", "磨制玄武岩", [], () => ({
  ...PICK(1.25, "basalt"),
  top: "polished_basalt_top",
  side: "polished_basalt_side"
}));
addAxisLogs("polished_basalt", "磨制玄武岩", POLISHED_BASALT, "polished_basalt_top", "polished_basalt_side", undefined, PICK(1.25, "basalt"));
var BLACKSTONE = family("blackstone", "黑石", [], () => ({
  ...PICK(1.5, "stone"),
  top: "blackstone_top",
  side: "blackstone",
  category: "naturaleza"
}));
var POLISHED_BLACKSTONE = family("polished_blackstone", "磨制黑石", [], () => ({ ...PICK(2, "stone"), all: "polished_blackstone" }));
var POLISHED_BLACKSTONE_BRICKS = family("polished_blackstone_bricks", "磨制黑石砖", [], () => ({
  ...PICK(1.5, "stone"),
  all: "polished_blackstone_bricks"
}));
var CRACKED_POLISHED_BLACKSTONE_BRICKS = family("cracked_polished_blackstone_bricks", "裂纹磨制黑石砖", [], () => ({
  ...PICK(1.5, "stone"),
  all: "cracked_polished_blackstone_bricks"
}));
var CHISELED_POLISHED_BLACKSTONE = family("chiseled_polished_blackstone", "雕纹磨制黑石", [], () => ({
  ...PICK(1.5, "stone"),
  all: "chiseled_polished_blackstone"
}));
var GILDED_BLACKSTONE = family("gilded_blackstone", "镶金黑石", [], () => ({
  ...PICK(1.5, "nether_ore"),
  all: "gilded_blackstone",
  category: "minerales"
}));
var NETHER_BRICKS = family("nether_bricks", "下界砖块", [], () => ({ ...PICK(2, "nether_bricks"), all: "nether_bricks" }));
var CRACKED_NETHER_BRICKS = family("cracked_nether_bricks", "裂纹下界砖块", [], () => ({
  ...PICK(2, "nether_bricks"),
  all: "cracked_nether_bricks"
}));
var CHISELED_NETHER_BRICKS = family("chiseled_nether_bricks", "雕纹下界砖块", [], () => ({
  ...PICK(2, "nether_bricks"),
  all: "chiseled_nether_bricks"
}));
var RED_NETHER_BRICKS = family("red_nether_bricks", "红色下界砖块", [], () => ({
  ...PICK(2, "nether_bricks"),
  all: "red_nether_bricks"
}));
var SHAPED2 = [
  ["blackstone", "黑石", BLACKSTONE, 1.5, "stone"],
  ["polished_blackstone", "磨制黑石", POLISHED_BLACKSTONE, 2, "stone"],
  ["polished_blackstone_brick", "磨制黑石砖", POLISHED_BLACKSTONE_BRICKS, 1.5, "stone"],
  ["nether_brick", "下界砖", NETHER_BRICKS, 2, "nether_bricks"],
  ["red_nether_brick", "红色下界砖", RED_NETHER_BRICKS, 2, "nether_bricks"]
];
for (const [key, name, block, hardness, sound] of SHAPED2) {
  addMaterialShapes({ key, name, block, hardness, tool: "pickaxe", tier: 1, sound });
  resound(addWall({ key, name, block, hardness }), sound);
}
var NETHER_BRICK_FENCE = addFence({ key: "nether_brick", name: "下界砖", block: NETHER_BRICKS, hardness: 2, tool: "pickaxe", tier: 1, sound: "nether_bricks" }, false, "nether_brick_fence");
var POLISHED_BLACKSTONE_BUTTON = addButton("polished_blackstone", "磨制黑石", "polished_blackstone", "stone", false);
var POLISHED_BLACKSTONE_PRESSURE_PLATE = addPressurePlate("polished_blackstone", "磨制黑石", "polished_blackstone", "stone", false);
INVENTORY4.push(BASALT, POLISHED_BASALT, BLACKSTONE, POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS, CHISELED_POLISHED_BLACKSTONE, GILDED_BLACKSTONE, NETHER_BRICKS, CRACKED_NETHER_BRICKS, CHISELED_NETHER_BRICKS, RED_NETHER_BRICKS, NETHER_BRICK_FENCE);
var LAVA_FLOW_ODD2 = family("lava_flow_odd", "熔岩", [["n", 4]], (st) => ({
  all: "lava",
  render: R_LAVA,
  solid: false,
  opaque: false,
  lightOpacity: 15,
  emission: 15,
  sound: "lava",
  replaceable: true,
  category: null,
  fluid: 2,
  level: 1 + st.n * 2,
  hardness: -1,
  noItem: true
}));
registerOddLava(LAVA_FLOW_ODD2);
var NETHER_BIOME_INVENTORY = INVENTORY4;
var NETHER_STONE_SHAPES = SHAPED2.map(([key]) => key);
// goodPG/src/shared/blocks/netherMobBlocks.ts
var PIGLIN_HEAD_SNOUT = "piglin_head_snout";
var PIGLIN_HEAD_EAR = "piglin_head_ear";
function piglinHeadBoxes() {
  const faces = SKULL_FACES.map((f) => L(skullTexture("piglin", f)));
  const snout = L(PIGLIN_HEAD_SNOUT);
  const ear = L(PIGLIN_HEAD_EAR);
  return [
    mbox(3, 4, 4, 13, 12, 12, faces),
    mbox(6, 4, 3, 10, 8, 4, snout),
    mbox(5, 4, 3, 6, 6, 4, snout),
    mbox(10, 4, 3, 11, 6, 4, snout),
    mbox(13, 8, 6, 14, 11, 10, ear),
    mbox(14, 5, 6, 15, 8, 10, ear),
    mbox(2, 8, 6, 3, 11, 10, ear),
    mbox(1, 5, 6, 2, 8, 10, ear)
  ];
}
registerSkull("wither_skeleton");
registerSkull("piglin", piglinHeadBoxes(), 5);
var NETHER_MOB_INVENTORY = [SKULLS.wither_skeleton, SKULLS.piglin];
// goodPG/src/shared/blocks/netherStructureBlocks.ts
var NETHER_WART_CROP = family("nether_wart", "下界疣", [["age", 4]], (st) => ({
  render: R_CROP,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  category: null,
  noItem: true,
  all: `nether_wart_stage${st.age === 0 ? 0 : st.age < 3 ? 1 : 2}`,
  selection: [0, 0, 0, 1, (5 + st.age * 3) / 16, 1],
  support: (get) => get(0, -1, 0) === SOUL_SAND
}));
// goodPG/src/shared/blocks/netherGoodsBlocks.ts
var ANCIENT_DEBRIS = family("ancient_debris", "远古残骸", [], () => ({
  side: "ancient_debris_side",
  top: "ancient_debris_top",
  bottom: "ancient_debris_top",
  hardness: 30,
  tool: "pickaxe",
  tier: 4,
  sound: "ancient_debris",
  category: "minerales"
}));
var NETHERITE_BLOCK = family("netherite_block", "下界合金块", [], () => ({
  all: "netherite_block",
  hardness: 50,
  tool: "pickaxe",
  tier: 4,
  sound: "netherite",
  category: "minerales"
}));
var QUARTZ = (hardness) => ({ hardness, tool: "pickaxe", tier: 1, sound: "stone", category: "construccion" });
var QUARTZ_BRICKS = family("quartz_bricks", "石英砖", [], () => ({ ...QUARTZ(0.8), all: "quartz_bricks" }));
var QUARTZ_PILLAR = family("quartz_pillar", "石英柱", [], () => ({
  ...QUARTZ(0.8),
  top: "quartz_pillar_top",
  side: "quartz_pillar"
}));
addAxisLogs("quartz_pillar", "石英柱", QUARTZ_PILLAR, "quartz_pillar_top", "quartz_pillar", undefined, { ...QUARTZ(0.8), category: null });
var CHISELED_QUARTZ_BLOCK = family("chiseled_quartz_block", "雕纹石英块", [], () => ({
  ...QUARTZ(0.8),
  top: "chiseled_quartz_block_top",
  side: "chiseled_quartz_block"
}));
var SMOOTH_QUARTZ = family("smooth_quartz", "平滑石英块", [], () => ({ ...QUARTZ(2), all: "smooth_quartz" }));
addMaterialShapes({ key: "quartz", name: "石英", block: QUARTZ_BLOCK, hardness: 0.8, tool: "pickaxe", tier: 1, sound: "stone" });
addMaterialShapes({ key: "smooth_quartz", name: "平滑石英", block: SMOOTH_QUARTZ, hardness: 2, tool: "pickaxe", tier: 1, sound: "stone" });
var LODESTONE = family("lodestone", "磁石", [], () => ({
  top: "lodestone_top",
  bottom: "lodestone_top",
  side: "lodestone_side",
  hardness: 3.5,
  tool: "pickaxe",
  tier: 1,
  sound: "lodestone",
  category: "decoracion"
}));
var SOUL_CAMPFIRE = family("soul_campfire", "灵魂营火", [["lit", 2]], (st) => campfireOpts(st.lit === 1, true));
var RESPAWN_ANCHOR = family("respawn_anchor", "重生锚", [["charges", 5]], (st) => ({
  side: `respawn_anchor_side${st.charges}`,
  top: st.charges > 0 ? "respawn_anchor_top" : "respawn_anchor_top_off",
  bottom: "respawn_anchor_bottom",
  emission: [0, 3, 7, 11, 15][st.charges],
  hardness: 50,
  tool: "pickaxe",
  tier: 4,
  sound: "stone",
  category: "decoracion"
}));
var BEACON = family("beacon", "信标", [], () => {
  const glass = L("glass"), core = L("beacon"), obs = L("obsidian");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    emission: 15,
    hardness: 3,
    sound: "glass",
    category: "decoracion",
    all: "glass",
    model: [
      mbox(2, 0.1, 2, 14, 3, 14, obs),
      mbox(3, 3, 3, 13, 14, 13, core),
      mbox(0, 0, 0, 16, 16, 16, glass)
    ]
  };
});
var BUBBLE_COLUMN = family("bubble_column", "气泡柱", [["drag", 2]], () => ({
  all: "water",
  render: R_WATER,
  solid: false,
  lightOpacity: 2,
  sound: "water",
  replaceable: true,
  category: null,
  fluid: 1,
  level: 0,
  noItem: true
}));
var NETHER_GOODS_INVENTORY = [
  ANCIENT_DEBRIS,
  NETHERITE_BLOCK,
  QUARTZ_BRICKS,
  QUARTZ_PILLAR,
  CHISELED_QUARTZ_BLOCK,
  SMOOTH_QUARTZ,
  LODESTONE,
  SOUL_CAMPFIRE,
  RESPAWN_ANCHOR,
  BEACON
];
// goodPG/src/shared/blocks/endBlocks.ts
var PICK2 = (hardness, sound = "stone") => ({ hardness, tool: "pickaxe", tier: 1, sound, category: "construccion" });
var END_STONE = family("end_stone", "末地石", [], () => ({ ...PICK2(3), all: "end_stone", category: "naturaleza" }));
var END_STONE_BRICKS = family("end_stone_bricks", "末地石砖", [], () => ({ ...PICK2(3), all: "end_stone_bricks" }));
addMaterialShapes({ key: "end_stone_brick", name: "末地石砖", block: END_STONE_BRICKS, hardness: 3, tool: "pickaxe", tier: 1, sound: "stone" });
addWall({ key: "end_stone_brick", name: "末地石砖", block: END_STONE_BRICKS, hardness: 3 });
var PURPUR_BLOCK = family("purpur_block", "紫珀块", [], () => ({ ...PICK2(1.5), all: "purpur_block" }));
var PURPUR_PILLAR = family("purpur_pillar", "紫珀柱", [], () => ({ ...PICK2(1.5), top: "purpur_pillar_top", side: "purpur_pillar" }));
addAxisLogs("purpur_pillar", "紫珀柱", PURPUR_PILLAR, "purpur_pillar_top", "purpur_pillar", undefined, { ...PICK2(1.5), category: null });
addMaterialShapes({ key: "purpur", name: "紫珀", block: PURPUR_BLOCK, hardness: 1.5, tool: "pickaxe", tier: 1, sound: "stone" });
function rodBoxes2(t) {
  return [mbox(6, 0, 6, 10, 1, 10, t), mbox(7, 1, 7, 9, 16, 9, t)];
}
var END_ROD = family("end_rod", "末地烛", [["facing", 6]], (st) => {
  const t = L("end_rod");
  const [b] = pointTo([mbox(6, 0, 6, 10, 16, 10, t)], st.facing);
  const box = [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    emission: 14,
    hardness: 0,
    sound: "wood",
    all: "end_rod",
    category: "decoracion",
    model: pointTo(rodBoxes2(t), st.facing),
    itemModel: rodBoxes2(t),
    collision: box,
    selection: box
  };
});
var DIRS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function chorusConnects(id, down) {
  const b = id > 0 ? familyBase(id) : -1;
  return b === CHORUS_PLANT || b === CHORUS_FLOWER || down && b === END_STONE;
}
function chorusShape(get, t) {
  const boxes = [mbox(4, 4, 4, 12, 12, 12, t)];
  const arm = [
    mbox(12, 4, 4, 16, 12, 12, t),
    mbox(0, 4, 4, 4, 12, 12, t),
    mbox(4, 12, 4, 12, 16, 12, t),
    mbox(4, 0, 4, 12, 4, 12, t),
    mbox(4, 4, 12, 12, 12, 16, t),
    mbox(4, 4, 0, 12, 12, 4, t)
  ];
  DIRS6.forEach(([dx, dy, dz], i) => {
    if (chorusConnects(get(dx, dy, dz), i === 3))
      boxes.push(arm[i]);
  });
  return boxes;
}
function chorusPlantSurvives(get) {
  const below = get(0, -1, 0), above = get(0, 1, 0);
  const blocked = above > 0 && below > 0;
  for (const [dx, , dz] of [DIRS6[0], DIRS6[1], DIRS6[4], DIRS6[5]]) {
    if (get(dx, 0, dz) > 0 && familyBase(get(dx, 0, dz)) === CHORUS_PLANT) {
      if (blocked)
        return false;
      const b2 = get(dx, -1, dz);
      if (b2 > 0 && (familyBase(b2) === CHORUS_PLANT || b2 === END_STONE))
        return true;
    }
  }
  return below < 0 || below > 0 && (familyBase(below) === CHORUS_PLANT || below === END_STONE);
}
var CHORUS_PLANT = family("chorus_plant", "紫颂植物", [], () => {
  const t = L("chorus_plant");
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 0.4,
    tool: "axe",
    sound: "wood",
    all: "chorus_plant",
    category: "naturaleza",
    shape: (get) => chorusShape(get, t),
    itemModel: [mbox(4, 4, 4, 12, 12, 12, t)],
    collision: [0.25, 0.25, 0.25, 0.75, 0.75, 0.75],
    selection: [0.25, 0.25, 0.25, 0.75, 0.75, 0.75],
    support: chorusPlantSurvives
  };
});
var CHORUS_FLOWER_DEAD_AGE = 5;
function chorusFlowerSurvives(get) {
  const below = get(0, -1, 0);
  if (below < 0 || below > 0 && (familyBase(below) === CHORUS_PLANT || below === END_STONE))
    return true;
  if (below !== 0)
    return false;
  let plant = false;
  for (const [dx, , dz] of [DIRS6[0], DIRS6[1], DIRS6[4], DIRS6[5]]) {
    const n = get(dx, 0, dz);
    if (n > 0 && familyBase(n) === CHORUS_PLANT) {
      if (plant)
        return false;
      plant = true;
    } else if (n !== 0)
      return false;
  }
  return plant;
}
var CHORUS_FLOWER = family("chorus_flower", "紫颂花", [["age", 6]], (st) => {
  const tex = st.age >= CHORUS_FLOWER_DEAD_AGE ? "chorus_flower_dead" : "chorus_flower";
  const t = L(tex);
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 1,
    hardness: 0.4,
    tool: "axe",
    sound: "wood",
    all: tex,
    category: "naturaleza",
    model: [
      mbox(2, 2, 2, 14, 14, 14, t),
      mbox(4, 14, 4, 12, 16, 12, t),
      mbox(4, 0, 4, 12, 2, 12, t),
      mbox(0, 4, 4, 2, 12, 12, t),
      mbox(14, 4, 4, 16, 12, 12, t),
      mbox(4, 4, 0, 12, 12, 2, t),
      mbox(4, 4, 14, 12, 12, 16, t)
    ],
    collision: [0.125, 0.125, 0.125, 0.875, 0.875, 0.875],
    selection: [0, 0, 0, 1, 1, 1],
    support: chorusFlowerSurvives
  };
});
var END_PORTAL_FRAME = family("end_portal_frame", "末地传送门框架", [["facing", 4], ["eye", 2]], (st) => {
  const top = L("end_portal_frame_top"), side = L("end_portal_frame_side"), bottom = L("end_stone"), eye = L("end_portal_frame_eye");
  const boxes = [mbox(0, 0, 0, 16, 13, 16, [side, side, top, bottom, side, side])];
  if (st.eye)
    boxes.push(mbox(4, 13, 4, 12, 16, 12, eye));
  const shape = st.eye ? [0, 0, 0, 1, 13 / 16, 1, 0.25, 13 / 16, 0.25, 0.75, 1, 0.75] : [0, 0, 0, 1, 13 / 16, 1];
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    emission: 1,
    hardness: -1,
    breakable: false,
    sound: "glass",
    top: "end_portal_frame_top",
    side: "end_portal_frame_side",
    category: "decoracion",
    model: rotateBoxes(boxes, st.facing),
    itemModel: [mbox(0, 0, 0, 16, 13, 16, [side, side, top, bottom, side, side])],
    collision: shape,
    selection: shape
  };
});
var END_PORTAL = family("end_portal", "末地传送门", [], () => {
  const t = L("end_portal");
  return {
    render: R_MODEL,
    all: "end_portal",
    solid: false,
    opaque: false,
    lightOpacity: 0,
    emission: 15,
    hardness: -1,
    breakable: false,
    sound: "glass",
    noItem: true,
    category: null,
    walkThrough: true,
    collision: [],
    selection: [],
    model: [mbox(0, 12, 0, 16, 12, 16, [-1, -1, t, -1, -1, -1]), mbox(0, 6, 0, 16, 6, 16, [-1, -1, -1, t, -1, -1])]
  };
});
var END_GATEWAY = family("end_gateway", "末地折跃门", [], () => ({
  render: R_MODEL,
  all: "end_portal",
  solid: false,
  opaque: false,
  lightOpacity: 0,
  emission: 15,
  hardness: -1,
  breakable: false,
  sound: "glass",
  noItem: true,
  category: null,
  walkThrough: true,
  collision: [],
  selection: [],
  model: [mbox(0, 0, 0, 16, 16, 16, L("end_portal"))]
}));
var DRAGON_EGG = family("dragon_egg", "龙蛋", [], () => {
  const t = L("dragon_egg");
  const layers = [[6, 15, 16], [5, 14, 15], [4, 13, 14], [3, 11, 13], [2, 8, 11], [1, 3, 8], [2, 1, 3], [3, 0, 1]];
  return {
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    emission: 1,
    hardness: 3,
    sound: "stone",
    all: "dragon_egg",
    category: "decoracion",
    model: layers.map(([m, y0, y1]) => mbox(m, y0, m, 16 - m, y1, 16 - m, t)),
    collision: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16],
    selection: [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]
  };
});
var SHULKER_BOX_COLORS = ["", ...DYE_COLORS];
function shulkerBoxBoxes(prefix) {
  const lid = L(`${prefix}shulker_box_lid`), base = L(`${prefix}shulker_box_base`);
  return [
    mbox(0, 4, 0, 16, 16, 16, [lid, lid, L(`${prefix}shulker_box_top`), -1, lid, lid]),
    mbox(0, 0, 0, 16, 4, 16, [base, base, -1, L(`${prefix}shulker_box_bottom`), base, base])
  ];
}
var SHULKER_BOXES = Object.fromEntries(SHULKER_BOX_COLORS.map((c) => {
  const prefix = c ? `${c}_` : "";
  const name = c ? `${COLOR_NAMES[c][1]}潜影盒` : "潜影盒";
  const id = family(`${prefix}shulker_box`, name, [["facing", 6]], (st) => ({
    render: R_MODEL,
    opaque: false,
    lightOpacity: 0,
    hardness: 2,
    tool: "pickaxe",
    sound: "stone",
    all: `${prefix}shulker_box_top`,
    category: "decoracion",
    model: pointTo(shulkerBoxBoxes(prefix), st.facing),
    itemModel: shulkerBoxBoxes(prefix)
  }));
  return [c, id];
}));
var SHULKER_BOX_BASES = new Map(SHULKER_BOX_COLORS.map((c) => [SHULKER_BOXES[c], c]));
function enderChestBoxes() {
  const side = L("ender_chest_side"), top = L("ender_chest_top"), front = L("ender_chest_front"), lock = L("ender_chest_lock");
  return [
    mbox(1, 0, 1, 15, 10, 15, [side, side, -1, top, side, front]),
    mbox(1, 10, 1, 15, 14, 15, [side, side, top, -1, side, front]),
    mbox(7, 7, 0, 9, 11, 1, lock)
  ];
}
var ENDER_CHEST = family("ender_chest", "末影箱", [["facing", 4]], (st) => ({
  render: R_MODEL,
  opaque: false,
  lightOpacity: 0,
  emission: 7,
  hardness: 22.5,
  tool: "pickaxe",
  tier: 1,
  sound: "stone",
  all: "ender_chest_top",
  category: "decoracion",
  model: rotateBoxes(enderChestBoxes(), st.facing),
  itemModel: enderChestBoxes(),
  collision: [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16],
  selection: [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]
}));
var DRAGON_HEAD_SNOUT = "dragon_head_snout";
var DRAGON_HEAD_HORN = "dragon_head_horn";
var DRAGON_HEAD_NOSTRIL = "dragon_head_nostril";
function dragonHeadBoxes() {
  const faces = SKULL_FACES.map((f) => L(skullTexture("dragon", f)));
  const snout = L(DRAGON_HEAD_SNOUT), horn = L(DRAGON_HEAD_HORN), nostril = L(DRAGON_HEAD_NOSTRIL);
  return [
    mbox(2, 6, 0.5, 14, 18, 12.5, faces),
    mbox(3.5, 9, -10, 12.5, 12.75, 0.5, snout),
    mbox(3.5, 6, -10, 12.5, 9, 0.5, snout),
    mbox(4.25, 12.75, -8.5, 5.75, 14.25, -5.5, nostril),
    mbox(10.25, 12.75, -8.5, 11.75, 14.25, -5.5, nostril),
    mbox(4.25, 18, 5, 5.75, 21, 9.5, horn),
    mbox(10.25, 18, 5, 11.75, 21, 9.5, horn)
  ];
}
registerSkull("dragon", dragonHeadBoxes());
var END_INVENTORY = [
  SKULLS.dragon,
  END_STONE,
  END_STONE_BRICKS,
  PURPUR_BLOCK,
  PURPUR_PILLAR,
  END_ROD,
  CHORUS_PLANT,
  CHORUS_FLOWER,
  END_PORTAL_FRAME,
  DRAGON_EGG,
  ENDER_CHEST,
  ...SHULKER_BOX_COLORS.map((c) => SHULKER_BOXES[c])
];
// goodPG/src/shared/blocks/frogBlocks.ts
var FROGLIGHT = { hardness: 0.3, emission: 15, sound: "shroomlight", category: "decoracion" };
function froglight(key, name) {
  const id = family(`${key}_froglight`, name, [], () => ({ ...FROGLIGHT, top: `${key}_froglight_top`, side: `${key}_froglight_side` }));
  addAxisLogs(`${key}_froglight`, name, id, `${key}_froglight_top`, `${key}_froglight_side`, undefined, { ...FROGLIGHT, category: null });
  return id;
}
var OCHRE_FROGLIGHT = froglight("ochre", "赭黄蛙明灯");
var VERDANT_FROGLIGHT = froglight("verdant", "翠绿蛙明灯");
var PEARLESCENT_FROGLIGHT = froglight("pearlescent", "珠光蛙明灯");
var FROG_INVENTORY = [OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT];
// goodPG/src/shared/blocks/amethystBuds.ts
var STAGE_TEX = ["small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"];
var STAGE_NAMES = ["小型紫水晶芽", "中型紫水晶芽", "大型紫水晶芽", "紫水晶簇"];
var SHAPE = [[3, 4], [4, 3], [5, 3], [7, 3]];
var DIR_VEC = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
var SIDE_DIRS = [0, 2, 3, 4, 5];
var POINT_FACE = { 0: 3, 2: 5, 3: 4, 4: 1, 5: 0 };
for (let s = 0;s < 4; s++) {
  defs[AMETHYST_BUD + s].base = AMETHYST_BUD + s;
  defs[AMETHYST_BUD + s].name = STAGE_NAMES[s];
}
function crossBoxes(t) {
  return [mbox(8, 0, 0.5, 8, 16, 15.5, [t, t, -1, -1, -1, -1]), mbox(0.5, 0, 8, 15.5, 16, 8, [-1, -1, -1, -1, t, t])];
}
var AMETHYST_BUD_SIDE = family("amethyst_bud_side", "紫水晶芽", [["stage", 4], ["facing", 5]], (st) => {
  const dir = SIDE_DIRS[st.facing];
  const face = POINT_FACE[dir];
  const [h, o] = SHAPE[st.stage];
  const [b] = pointTo([mbox(o, 0, o, 16 - o, h, 16 - o, 0)], face);
  const box = [b.x0 / 16, b.y0 / 16, b.z0 / 16, b.x1 / 16, b.y1 / 16, b.z1 / 16];
  const [dx, dy, dz] = DIR_VEC[dir];
  return {
    render: R_MODEL,
    solid: false,
    opaque: false,
    lightOpacity: 0,
    sound: "glass",
    hardness: 1.5,
    tool: "pickaxe",
    category: null,
    emission: [1, 2, 4, 5][st.stage],
    all: STAGE_TEX[st.stage],
    model: pointTo(crossBoxes(L(STAGE_TEX[st.stage])), face),
    selection: box,
    collision: [],
    walkThrough: true,
    support: (get) => {
      const back = get(-dx, -dy, -dz);
      return back < 0 || BLOCK_SOLID[back] === 1;
    }
  };
});
for (let s = 0;s < 4; s++) {
  for (let f = 0;f < 5; f++) {
    const id = stateOf(AMETHYST_BUD_SIDE, { stage: s, facing: f });
    defs[id].base = AMETHYST_BUD + s;
    defs[id].name = STAGE_NAMES[s];
  }
}
function amethystBudAt(stage, dir) {
  if (dir === 1)
    return AMETHYST_BUD + stage;
  return stateOf(AMETHYST_BUD_SIDE, { stage, facing: SIDE_DIRS.indexOf(dir) });
}
var AMETHYST_BUD_ITEM_KEYS = ["small_amethyst_bud", "medium_amethyst_bud", "large_amethyst_bud", "amethyst_cluster"];
// goodPG/src/shared/blocks/witherBlocks.ts
function supportsWitherRose(b) {
  return b < 0 || isVegetationSoil(b) || b === NETHERRACK || b === SOUL_SAND || b === SOUL_SOIL;
}
var WITHER_ROSE = family("wither_rose", "凋灵玫瑰", [], () => ({
  render: R_CROSS,
  solid: false,
  opaque: false,
  lightOpacity: 0,
  sound: "grass",
  hardness: 0,
  all: "wither_rose",
  category: "naturaleza",
  walkThrough: true,
  selection: [5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16],
  support: (get) => supportsWitherRose(get(0, -1, 0))
}));
var WITHER_INVENTORY = [WITHER_ROSE];

// goodPG/src/shared/blocks/index.ts
{
  const kindOf = new Map;
  for (const v of Object.values(DOORS))
    kindOf.set(v, KINDS.door);
  for (const v of Object.values(TRAPDOORS))
    kindOf.set(v, KINDS.trapdoor);
  for (const v of Object.values(FENCE_GATES))
    kindOf.set(v, KINDS.gate);
  for (const v of Object.values(FENCES))
    kindOf.set(v, KINDS.fence);
  for (const v of Object.values(SLABS))
    kindOf.set(v, KINDS.slab);
  for (const v of Object.values(STAIRS))
    kindOf.set(v, KINDS.stairs);
  kindOf.set(RED_BED, KINDS.bed);
  for (const v of Object.values(BEDS))
    kindOf.set(v, KINDS.bed);
  for (const v of Object.values(WALLS))
    kindOf.set(v, KINDS.fence);
  for (const v of [WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM]) {
    kindOf.set(v, KINDS.crop);
  }
  kindOf.set(CAKE, KINDS.cake);
  kindOf.set(FARMLAND, KINDS.farmland);
  finalizeBlocks(kindOf);
}
var BLOCKS = defs;
var BLOCK_COUNT = defs.length;
var INVENTORY_ORDER = [
  GRASS,
  DIRT,
  STONE,
  COBBLESTONE,
  MOSSY_COBBLESTONE,
  STONE_BRICKS,
  BRICKS,
  GRANITE,
  DIORITE,
  ANDESITE,
  SAND,
  SANDSTONE,
  GRAVEL,
  CLAY,
  TERRACOTTA,
  SNOW_BLOCK,
  SNOWY_GRASS,
  ICE,
  OBSIDIAN,
  QUARTZ_BLOCK,
  OAK_LOG,
  OAK_PLANKS,
  BIRCH_LOG,
  BIRCH_PLANKS,
  SPRUCE_LOG,
  SPRUCE_PLANKS,
  OAK_LEAVES,
  BIRCH_LEAVES,
  SPRUCE_LEAVES,
  GLASS,
  BOOKSHELF,
  CRAFTING_TABLE,
  FURNACE,
  CHEST,
  PUMPKIN,
  HAY_BALE,
  TORCH,
  GLOWSTONE,
  SEA_LANTERN,
  CACTUS,
  SUGAR_CANE,
  OAK_SAPLING,
  BIRCH_SAPLING,
  SPRUCE_SAPLING,
  SHORT_GRASS,
  FERN,
  POPPY,
  DANDELION,
  CORNFLOWER,
  DEAD_BUSH,
  RED_MUSHROOM,
  BROWN_MUSHROOM,
  WATER,
  LAVA,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  DIAMOND_ORE,
  LAPIS_ORE,
  REDSTONE_ORE,
  IRON_BLOCK,
  GOLD_BLOCK,
  DIAMOND_BLOCK,
  COPPER_BLOCK,
  WHITE_WOOL,
  BLACK_WOOL,
  RED_WOOL,
  ORANGE_WOOL,
  YELLOW_WOOL,
  LIME_WOOL,
  BLUE_WOOL,
  PURPLE_WOOL,
  ...MATERIALS.flatMap((m) => [SLABS[m.key], STAIRS[m.key]]),
  ...WOODS.flatMap((w) => [FENCES[w.key], FENCE_GATES[w.key], DOORS[w.key], TRAPDOORS[w.key]]),
  LADDER,
  GLASS_PANE,
  RED_BED,
  MELON,
  CARVED_PUMPKIN,
  JACK_O_LANTERN,
  COMPOSTER,
  ...Object.values(WALLS),
  ...Object.values(BEDS).filter((b) => b !== RED_BED),
  ...Object.values(SIGNS),
  SMOKER,
  BLAST_FURNACE,
  CAMPFIRE,
  STONECUTTER,
  ...WOOD_TYPES.slice(3).flatMap((w) => [w.log, w.planks, w.leaves, w.sapling]),
  MYCELIUM,
  RED_MUSHROOM_BLOCK,
  BROWN_MUSHROOM_BLOCK,
  MUSHROOM_STEM,
  RED_SAND,
  RED_SANDSTONE,
  PACKED_ICE,
  ...Object.values(COLORED_TERRACOTTA),
  VINE,
  LILY_PAD,
  ...Object.values(FLOWERS),
  PINK_PETALS,
  DEEPSLATE,
  COBBLED_DEEPSLATE,
  TUFF,
  CALCITE,
  SMOOTH_BASALT,
  DRIPSTONE_BLOCK,
  POINTED_DRIPSTONE,
  COPPER_ORE,
  EMERALD_ORE,
  ...Object.values(DEEPSLATE_ORE),
  EMERALD_BLOCK,
  MOSS_BLOCK,
  MOSS_CARPET,
  AZALEA,
  FLOWERING_AZALEA,
  AMETHYST_BLOCK,
  BUDDING_AMETHYST,
  AMETHYST_BUD,
  AMETHYST_BUD + 1,
  AMETHYST_BUD + 2,
  AMETHYST_BUD + 3,
  TINTED_GLASS,
  MOB_SPAWNER,
  COBWEB,
  CHISELED_SANDSTONE,
  CUT_SANDSTONE,
  MOSSY_STONE_BRICKS,
  CRACKED_STONE_BRICKS,
  NETHERRACK,
  CRYING_OBSIDIAN,
  SNOW_LAYER,
  ...VILLAGER_BLOCKS,
  TURTLE_EGG
];
INVENTORY_ORDER.push(...BEE_INVENTORY);
INVENTORY_ORDER.push(...WOODS2_INVENTORY);
INVENTORY_ORDER.push(...COLOR_INVENTORY);
INVENTORY_ORDER.push(...STONE_INVENTORY);
INVENTORY_ORDER.push(...COPPER_INVENTORY);
INVENTORY_ORDER.push(...DECOR_INVENTORY);
INVENTORY_ORDER.push(...OCEAN_INVENTORY, ...WILD_PLANT_INVENTORY);
INVENTORY_ORDER.push(...HANGING_SIGN_INVENTORY);
INVENTORY_ORDER.push(CHISELED_BOOKSHELF);
INVENTORY_ORDER.push(...MATERIAL_INVENTORY);
INVENTORY_ORDER.push(...COLLECTION_INVENTORY);
INVENTORY_ORDER.push(...EQUIPMENT_INVENTORY);
INVENTORY_ORDER.push(BREWING_STAND);
INVENTORY_ORDER.push(...RAIL_INVENTORY);
INVENTORY_ORDER.push(...ENCHANT_INVENTORY);
INVENTORY_ORDER.push(...REDSTONE_INVENTORY);
INVENTORY_ORDER.push(...MECHANISM_INVENTORY);
INVENTORY_ORDER.push(...DEEP_DARK_INVENTORY);
INVENTORY_ORDER.push(...NETHER_INVENTORY);
INVENTORY_ORDER.push(...NETHER_BIOME_INVENTORY);
INVENTORY_ORDER.push(...NETHER_MOB_INVENTORY);
INVENTORY_ORDER.push(...NETHER_GOODS_INVENTORY);
INVENTORY_ORDER.push(...END_INVENTORY);
INVENTORY_ORDER.push(...FROG_INVENTORY);
INVENTORY_ORDER.push(...WITHER_INVENTORY);

// goodPG/src/shared/world/noise.ts
var F2 = 0.5 * (Math.sqrt(3) - 1);
var G2 = (3 - Math.sqrt(3)) / 6;
var F3 = 1 / 3;
var G3 = 1 / 6;
var GRAD3 = new Float64Array([
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1,
  0,
  1,
  0,
  1,
  -1,
  0,
  1,
  1,
  0,
  -1,
  -1,
  0,
  -1,
  0,
  1,
  1,
  0,
  -1,
  1,
  0,
  1,
  -1,
  0,
  -1,
  -1
]);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class Simplex {
  perm = new Uint8Array(512);
  permMod12 = new Uint8Array(512);
  constructor(seed) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0;i < 256; i++)
      p[i] = i;
    for (let i = 255;i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0;i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  noise2(xin, yin) {
    const perm = this.perm;
    const pm = this.permMod12;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const g = pm[ii + perm[jj]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const g = pm[ii + i1 + perm[jj + j1]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const g = pm[ii + 1 + perm[jj + 1]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2);
    }
    return 70 * n;
  }
  noise3(xin, yin, zin) {
    const perm = this.perm;
    const pm = this.permMod12;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else if (x0 < z0) {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const g = pm[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD3[g] * x0 + GRAD3[g + 1] * y0 + GRAD3[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD3[g] * x1 + GRAD3[g + 1] * y1 + GRAD3[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD3[g] * x2 + GRAD3[g + 1] * y2 + GRAD3[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD3[g] * x3 + GRAD3[g + 1] * y3 + GRAD3[g + 2] * z3);
    }
    return 32 * n;
  }
  fbm2(x, y, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0;o < octaves; o++) {
      sum += this.noise2(x * f + o * 17.31, y * f - o * 11.17) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
  fbm3(x, y, z, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    for (let o = 0;o < octaves; o++) {
      sum += this.noise3(x * f + o * 13.7, y * f - o * 7.3, z * f + o * 5.1) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
  ridged2(x, y, octaves) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let f = 1;
    let weight = 1;
    for (let o = 0;o < octaves; o++) {
      let n = 1 - Math.abs(this.noise2(x * f + o * 31.7, y * f + o * 23.3));
      n *= n;
      n *= weight;
      weight = n < 0 ? 0 : n > 1 ? 1 : n;
      sum += n * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum / norm;
  }
}
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function smoothstep(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function spline(points, x) {
  const n = points.length;
  if (x <= points[0])
    return points[1];
  for (let i = 2;i < n; i += 2) {
    const x1 = points[i];
    if (x <= x1) {
      const x0 = points[i - 2];
      const t = (x - x0) / (x1 - x0);
      const s = t * t * (3 - 2 * t);
      return points[i - 1] + (points[i + 1] - points[i - 1]) * s;
    }
  }
  return points[n - 1];
}

// goodPG/src/shared/world/biomeIds.ts
var BIOME_OCEAN = 0;
var BIOME_FROZEN_OCEAN = 1;
var BIOME_BEACH = 2;
var BIOME_PLAINS = 3;
var BIOME_FOREST = 4;
var BIOME_BIRCH_FOREST = 5;
var BIOME_TAIGA = 6;
var BIOME_SNOWY = 7;
var BIOME_DESERT = 8;
var BIOME_SAVANNA = 9;
var BIOME_MOUNTAINS = 10;
var BIOME_SNOWY_PEAKS = 11;
var BIOME_SWAMP = 12;
var BIOME_JUNGLE = 13;
var BIOME_DARK_FOREST = 14;
var BIOME_BADLANDS = 15;
var BIOME_MUSHROOM_FIELDS = 16;
var BIOME_CHERRY_GROVE = 17;
var BIOME_MEADOW = 18;
var BIOME_ICE_SPIKES = 19;
var BIOME_WARM_OCEAN = 20;
var BIOME_COLD_OCEAN = 21;
var BIOME_DEEP_OCEAN = 22;
var BIOME_RIVER = 23;
var BIOME_FROZEN_RIVER = 24;
var BIOME_SNOWY_BEACH = 25;
var BIOME_STONY_SHORE = 26;
var BIOME_LUKEWARM_OCEAN = 27;
var BIOME_DEEP_LUKEWARM_OCEAN = 28;
var BIOME_DEEP_COLD_OCEAN = 29;
var BIOME_DEEP_FROZEN_OCEAN = 30;
var BIOME_SUNFLOWER_PLAINS = 31;
var BIOME_FLOWER_FOREST = 32;
var BIOME_OLD_GROWTH_BIRCH_FOREST = 33;
var BIOME_WINDSWEPT_GRAVELLY_HILLS = 34;
var BIOME_WINDSWEPT_FOREST = 35;
var BIOME_GROVE = 36;
var BIOME_FROZEN_PEAKS = 37;
var BIOME_JAGGED_PEAKS = 38;
var BIOME_STONY_PEAKS = 39;
var BIOME_SNOWY_PLAINS = 40;
var BIOME_OLD_GROWTH_PINE_TAIGA = 41;
var BIOME_OLD_GROWTH_SPRUCE_TAIGA = 42;
var BIOME_SPARSE_JUNGLE = 43;
var BIOME_BAMBOO_JUNGLE = 44;
var BIOME_ERODED_BADLANDS = 45;
var BIOME_WOODED_BADLANDS = 46;
var BIOME_SAVANNA_PLATEAU = 47;
var BIOME_WINDSWEPT_SAVANNA = 48;
var BIOME_MANGROVE_SWAMP = 49;
var BIOME_NETHER_WASTES = 52;
var BIOME_SOUL_SAND_VALLEY = 53;
var BIOME_CRIMSON_FOREST = 54;
var BIOME_WARPED_FOREST = 55;
var BIOME_BASALT_DELTAS = 56;
var BIOME_THE_END = 57;
var BIOME_END_HIGHLANDS = 58;
var BIOME_END_MIDLANDS = 59;
var BIOME_SMALL_END_ISLANDS = 60;
var BIOME_END_BARRENS = 61;
var BIOME_NAMES = [
  "海洋",
  "冰冻海洋",
  "沙滩",
  "平原",
  "森林",
  "桦木森林",
  "针叶林",
  "积雪针叶林",
  "沙漠",
  "热带草原",
  "风袭丘陵",
  "积雪山坡",
  "沼泽",
  "丛林",
  "黑森林",
  "恶地",
  "蘑菇岛",
  "樱花树林",
  "草甸",
  "冰刺之地",
  "暖水海洋",
  "冷水海洋",
  "深海",
  "河流",
  "冻河",
  "积雪沙滩",
  "石岸",
  "温水海洋",
  "温水深海",
  "冷水深海",
  "冰冻深海",
  "向日葵平原",
  "繁花森林",
  "原始桦木森林",
  "风袭沙砾丘陵",
  "风袭森林",
  "雪林",
  "冰封山峰",
  "尖峭山峰",
  "裸岩山峰",
  "雪原",
  "原始松木针叶林",
  "原始云杉针叶林",
  "稀疏丛林",
  "竹林",
  "风蚀恶地",
  "疏林恶地",
  "热带高原",
  "风袭热带草原",
  "红树林沼泽",
  "溶洞",
  "繁茂洞穴",
  "下界荒地",
  "灵魂沙峡谷",
  "绯红森林",
  "诡异森林",
  "玄武岩三角洲",
  "末地",
  "末地高地",
  "末地内陆",
  "末地小型岛屿",
  "末地荒地"
];
var PARENT = {
  [BIOME_RIVER]: BIOME_OCEAN,
  [BIOME_FROZEN_RIVER]: BIOME_OCEAN,
  [BIOME_SNOWY_BEACH]: BIOME_BEACH,
  [BIOME_STONY_SHORE]: BIOME_BEACH,
  [BIOME_LUKEWARM_OCEAN]: BIOME_OCEAN,
  [BIOME_DEEP_LUKEWARM_OCEAN]: BIOME_DEEP_OCEAN,
  [BIOME_DEEP_COLD_OCEAN]: BIOME_DEEP_OCEAN,
  [BIOME_DEEP_FROZEN_OCEAN]: BIOME_DEEP_OCEAN,
  [BIOME_SUNFLOWER_PLAINS]: BIOME_PLAINS,
  [BIOME_FLOWER_FOREST]: BIOME_FOREST,
  [BIOME_OLD_GROWTH_BIRCH_FOREST]: BIOME_BIRCH_FOREST,
  [BIOME_WINDSWEPT_GRAVELLY_HILLS]: BIOME_MOUNTAINS,
  [BIOME_WINDSWEPT_FOREST]: BIOME_MOUNTAINS,
  [BIOME_GROVE]: BIOME_SNOWY,
  [BIOME_FROZEN_PEAKS]: BIOME_SNOWY_PEAKS,
  [BIOME_JAGGED_PEAKS]: BIOME_SNOWY_PEAKS,
  [BIOME_STONY_PEAKS]: BIOME_MOUNTAINS,
  [BIOME_SNOWY_PLAINS]: BIOME_SNOWY,
  [BIOME_OLD_GROWTH_PINE_TAIGA]: BIOME_TAIGA,
  [BIOME_OLD_GROWTH_SPRUCE_TAIGA]: BIOME_TAIGA,
  [BIOME_SPARSE_JUNGLE]: BIOME_JUNGLE,
  [BIOME_BAMBOO_JUNGLE]: BIOME_JUNGLE,
  [BIOME_ERODED_BADLANDS]: BIOME_BADLANDS,
  [BIOME_WOODED_BADLANDS]: BIOME_BADLANDS,
  [BIOME_SAVANNA_PLATEAU]: BIOME_SAVANNA,
  [BIOME_WINDSWEPT_SAVANNA]: BIOME_SAVANNA,
  [BIOME_MANGROVE_SWAMP]: BIOME_SWAMP
};
function baseBiome(b) {
  return PARENT[b] ?? b;
}
function isOceanBiome(b) {
  if (b === BIOME_RIVER || b === BIOME_FROZEN_RIVER)
    return false;
  const p = baseBiome(b);
  return p === BIOME_OCEAN || p === BIOME_FROZEN_OCEAN || p === BIOME_WARM_OCEAN || p === BIOME_COLD_OCEAN || p === BIOME_DEEP_OCEAN;
}

// goodPG/src/shared/world/materialDecor.ts
var ROW = 256;
var NOISES = new Map;
function noisesFor(seed) {
  let n = NOISES.get(seed);
  if (!n) {
    n = { soil: new Simplex(seed ^ 40224), powder: new Simplex(seed ^ 23055) };
    NOISES.set(seed, n);
  }
  return n;
}
function decorateMaterials(seed, blocks, tops, infos, cx, cz) {
  const nz = noisesFor(seed);
  const x0 = cx * 16, z0 = cz * 16;
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const specific = infos[lz * 16 + lx].biome;
      const biome = specific === BIOME_GROVE ? BIOME_SNOWY_PEAKS : baseBiome(specific);
      if (biome !== BIOME_TAIGA && biome !== BIOME_SNOWY_PEAKS && biome !== BIOME_MOUNTAINS)
        continue;
      const y = tops[lz * 16 + lx];
      if (y <= MIN_Y + 3 || y >= MAX_Y - 2)
        continue;
      const i = blockIndex(lx, y, lz);
      const top = blocks[i];
      const wx = x0 + lx, wz = z0 + lz;
      if (biome === BIOME_TAIGA) {
        if (top !== GRASS)
          continue;
        const v = nz.soil.noise2(wx / 22, wz / 22);
        const old = specific === BIOME_OLD_GROWTH_PINE_TAIGA || specific === BIOME_OLD_GROWTH_SPRUCE_TAIGA;
        if (old && v < -0.2)
          blocks[i] = COARSE_DIRT;
        else if (v > (old ? -0.2 : 0.38))
          blocks[i] = PODZOL;
        else if (v < -0.62 && hashToFloat(hash2(wx, wz, seed ^ 49317)) < 0.6)
          blocks[i] = COARSE_DIRT;
        continue;
      }
      if (top !== SNOW_BLOCK && top !== SNOWY_GRASS)
        continue;
      const v = nz.powder.noise2(wx / 14, wz / 14);
      if (v < 0.42)
        continue;
      const depth = v > 0.62 ? 3 : v > 0.52 ? 2 : 1;
      if (isSnowLayer(blocks[i + ROW]))
        blocks[i + ROW] = AIR;
      for (let k = 0;k < depth; k++) {
        const b = blocks[i - k * ROW];
        if (b !== SNOW_BLOCK && b !== SNOWY_GRASS && b !== DIRT && b !== STONE && b !== GRAVEL)
          break;
        blocks[i - k * ROW] = POWDER_SNOW;
      }
    }
  }
  placeInfestedDeepslate(seed, blocks, cx, cz);
}
function placeInfestedDeepslate(seed, blocks, cx, cz) {
  const rng = mulberry32(hash2(cx, cz, seed ^ 1924730 | 0));
  for (let n = 0;n < 3; n++) {
    let x = Math.floor(rng() * 16), y = MIN_Y + 6 + Math.floor(rng() * 60), z = Math.floor(rng() * 16);
    for (let s = 0;s < 9; s++) {
      if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y && y < 0) {
        const i = blockIndex(x, y, z);
        if (blocks[i] === DEEPSLATE)
          blocks[i] = INFESTED_DEEPSLATE;
      }
      const dir = Math.floor(rng() * 6);
      if (dir === 0)
        x++;
      else if (dir === 1)
        x--;
      else if (dir === 2)
        y++;
      else if (dir === 3)
        y--;
      else if (dir === 4)
        z++;
      else
        z--;
    }
  }
}
function rootColumn(blocks, lx, top, lz) {
  let y = top;
  for (let k = 0;k < 24 && y > MIN_Y + 1; k++, y--) {
    const i = blockIndex(lx, y, lz);
    const b = blocks[i];
    if (b === AIR)
      break;
    if (k > 0 && !BLOCK_OPAQUE[b])
      return;
    blocks[i] = ROOTED_DIRT;
  }
  if (y > MIN_Y + 1 && blocks[blockIndex(lx, y, lz)] === AIR)
    blocks[blockIndex(lx, y, lz)] = HANGING_ROOTS;
}
function iglooBrick(x, y, z, seed) {
  const k = hash3(x, y, z, seed ^ 90368);
  const kind = k % 10 < 6 ? 0 : k % 10 < 8 ? 1 : 2;
  const infested = (k >>> 8 & 7) === 0;
  if (kind === 1)
    return infested ? INFESTED_MOSSY_STONE_BRICKS : MOSSY_STONE_BRICKS;
  if (kind === 2)
    return infested ? INFESTED_CRACKED_STONE_BRICKS : CRACKED_STONE_BRICKS;
  return infested ? INFESTED_STONE_BRICKS : STONE_BRICKS;
}

// goodPG/src/shared/world/villages.ts
var VILLAGE_RADIUS = 38;
var VILLAGE_BIOMES = new Set([
  BIOME_PLAINS,
  BIOME_MEADOW,
  BIOME_DESERT,
  BIOME_SAVANNA,
  BIOME_TAIGA,
  BIOME_SNOWY,
  BIOME_SUNFLOWER_PLAINS,
  BIOME_SAVANNA_PLATEAU,
  BIOME_SNOWY_PLAINS
]);
var isVillageBiome = (b) => VILLAGE_BIOMES.has(b);
var DX = [0, 1, 0, -1];
var DZ = [-1, 0, 1, 0];
function styleFor(biome) {
  const wood = (planks, log, key, bed, ridge = 0) => ({
    planks,
    log,
    base: COBBLESTONE,
    path: DIRT_PATH,
    stairs: STAIRS[key],
    slab: SLABS[key],
    door: DOORS[key],
    fence: FENCES[key],
    flat: false,
    ridge: ridge || planks,
    accent: log,
    bed: BEDS[bed]
  });
  switch (baseBiome(biome)) {
    case BIOME_DESERT:
      return {
        planks: SANDSTONE,
        log: CUT_SANDSTONE,
        base: SANDSTONE,
        path: SANDSTONE,
        stairs: STAIRS.sandstone,
        slab: SLABS.sandstone,
        door: DOORS.oak,
        fence: FENCES.oak,
        flat: true,
        ridge: CHISELED_SANDSTONE,
        accent: COLORED_TERRACOTTA.orange,
        bed: BEDS.yellow
      };
    case BIOME_SAVANNA: {
      const s = wood(ACACIA_PLANKS, ACACIA_LOG, "acacia", "orange");
      s.accent = COLORED_TERRACOTTA.orange;
      return s;
    }
    case BIOME_TAIGA:
      return wood(SPRUCE_PLANKS, SPRUCE_LOG, "spruce", "blue");
    case BIOME_SNOWY:
      return wood(SPRUCE_PLANKS, SPRUCE_LOG, "spruce", "white", SNOW_BLOCK);
    default:
      return wood(OAK_PLANKS, OAK_LOG, "oak", "red");
  }
}
var ROAD_HALF = 1;
var layoutCache = new Map;
var tmp = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
var overlaps = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;
function pieceBox(x, z, dir, w, d, pad) {
  const along = dir === 0 || dir === 2;
  const hx = (along ? w : d) + pad, hz = (along ? d : w) + pad;
  return { x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz };
}
function villageLayout(gen, s) {
  const key = `${gen.seed}:${s.x},${s.z}`;
  const cached = layoutCache.get(key);
  if (cached)
    return cached;
  if (layoutCache.size > 200)
    layoutCache.clear();
  const rnd = mulberry32(s.rng);
  const style = styleFor(gen.columnInfo(s.x, s.z, tmp).biome);
  const taken = [{ x0: s.x - 4, z0: s.z - 4, x1: s.x + 4, z1: s.z + 4 }];
  const roads = [];
  for (let dir = 0;dir < 4; dir++) {
    const len = 18 + Math.floor(rnd() * 12);
    const ex = s.x + DX[dir] * len, ez = s.z + DZ[dir] * len;
    const box = {
      x0: Math.min(s.x, ex) - ROAD_HALF,
      z0: Math.min(s.z, ez) - ROAD_HALF,
      x1: Math.max(s.x, ex) + ROAD_HALF,
      z1: Math.max(s.z, ez) + ROAD_HALF
    };
    roads.push({ dir, len, box });
    taken.push(box);
  }
  const slots = [];
  for (const r of roads)
    for (let a = 7;a <= r.len - 2; a += 3)
      for (const side of [1, -1])
        slots.push([r.dir, a, side]);
  for (let i = slots.length - 1;i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const pieces = [];
  const wantFarms = 1 + Math.floor(rnd() * 2), wantHouses = 4 + Math.floor(rnd() * 5);
  let farms = 0, houses = 0, chests = 1 + Math.floor(rnd() * 2);
  const tryPlace = (kind, w, d) => {
    for (let k = 0;k < slots.length; k++) {
      const [rd, a, side] = slots[k];
      const sideDir = rd + (side > 0 ? 1 : 3) & 3;
      const dir = sideDir + 2 & 3;
      const off = ROAD_HALF + 2 + d;
      const x = s.x + DX[rd] * a + DX[sideDir] * off, z = s.z + DZ[rd] * a + DZ[sideDir] * off;
      const box = pieceBox(x, z, dir, w, d, 1);
      if (Math.max(Math.abs(box.x0 - s.x), Math.abs(box.x1 - s.x), Math.abs(box.z0 - s.z), Math.abs(box.z1 - s.z)) > VILLAGE_RADIUS)
        continue;
      if (taken.some((t) => overlaps(t, box)))
        continue;
      const y = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
      if (y < SEA_LEVEL || Math.abs(y - s.y) > 7) {
        slots.splice(k--, 1);
        continue;
      }
      slots.splice(k, 1);
      taken.push(box);
      const chest = kind === "house" && chests > 0;
      if (chest)
        chests--;
      pieces.push({ kind, x, z, y, dir, w, d, chest, seed: Math.floor(rnd() * 2 ** 31), box: pieceBox(x, z, dir, w, d, 0) });
      return true;
    }
    return false;
  };
  while (farms < wantFarms && tryPlace("farm", 4, 3))
    farms++;
  while (houses < wantHouses) {
    const big = rnd() < 0.4;
    if (!tryPlace("house", big ? 3 : 2, big ? 3 : 2))
      break;
    houses++;
  }
  const lamps = [[s.x - 3, s.z - 3], [s.x + 3, s.z - 3], [s.x - 3, s.z + 3], [s.x + 3, s.z + 3]];
  for (const r of roads) {
    const sd = r.dir + 1 & 3;
    for (let a = 12;a <= r.len; a += 12) {
      const lx = s.x + DX[r.dir] * a + DX[sd] * (ROAD_HALF + 1), lz = s.z + DZ[r.dir] * a + DZ[sd] * (ROAD_HALF + 1);
      if (!pieces.some((p) => overlaps(p.box, { x0: lx - 1, z0: lz - 1, x1: lx + 1, z1: lz + 1 })))
        lamps.push([lx, lz]);
    }
  }
  const layout = { style, roads, pieces, lamps };
  layoutCache.set(key, layout);
  return layout;
}
function groundAt(c, x, z, y) {
  for (let yy = y + 16;yy >= y - 16; yy--) {
    const b = c.get(x, yy, z);
    if (b < 0)
      return null;
    if (b === AIR || isLeaves(b) || isLog(b))
      continue;
    if (BLOCK_FLUID[b] || BLOCK_OPAQUE[b])
      return yy;
  }
  return null;
}
function inChunk(c, r) {
  return r.x1 >= c.x0 && r.x0 <= c.x0 + 15 && r.z1 >= c.z0 && r.z0 <= c.z0 + 15;
}
function pathCell(c, x, z, y, id, bridge) {
  if (x < c.x0 || x > c.x0 + 15 || z < c.z0 || z > c.z0 + 15)
    return;
  const g = groundAt(c, x, z, y);
  if (g === null)
    return;
  const b = c.get(x, g, z);
  c.set(x, g, z, BLOCK_FLUID[b] ? bridge : id);
  c.clearAbove(x, g + 1, z, 3);
}
function buildVillage(c, s, gen) {
  const L = villageLayout(gen, s);
  const st = L.style;
  for (const r of L.roads) {
    if (!inChunk(c, r.box))
      continue;
    for (let z = Math.max(r.box.z0, c.z0);z <= Math.min(r.box.z1, c.z0 + 15); z++) {
      for (let x = Math.max(r.box.x0, c.x0);x <= Math.min(r.box.x1, c.x0 + 15); x++)
        pathCell(c, x, z, s.y, st.path, st.planks);
    }
  }
  if (inChunk(c, { x0: s.x - 4, z0: s.z - 4, x1: s.x + 4, z1: s.z + 4 })) {
    for (let dz = -4;dz <= 4; dz++)
      for (let dx = -4;dx <= 4; dx++)
        pathCell(c, s.x + dx, s.z + dz, s.y, st.path, st.planks);
    buildWell(c, s, st);
  }
  if (c.villager && s.x >= c.x0 && s.x <= c.x0 + 15 && s.z >= c.z0 && s.z <= c.z0 + 15)
    placeVillagers(c, s, L);
  for (const p of L.pieces) {
    if (!inChunk(c, { x0: p.box.x0 - 1, z0: p.box.z0 - 1, x1: p.box.x1 + 1, z1: p.box.z1 + 1 }))
      continue;
    if (p.kind === "house")
      buildHouse(c, p, st);
    else
      buildFarm(c, p, st);
  }
  for (const [x, z] of L.lamps) {
    if (x < c.x0 || x > c.x0 + 15 || z < c.z0 || z > c.z0 + 15)
      continue;
    const g = groundAt(c, x, z, s.y);
    if (g === null || BLOCK_FLUID[c.get(x, g, z)])
      continue;
    c.set(x, g + 1, z, st.base);
    c.set(x, g + 2, z, st.fence);
    c.set(x, g + 3, z, TORCH);
  }
}
var HOUSE_WORKSTATIONS = [
  COMPOSTER,
  SMOKER,
  BLAST_FURNACE,
  STONECUTTER,
  LECTERN,
  CARTOGRAPHY_TABLE,
  FLETCHING_TABLE,
  BARREL,
  LOOM,
  GRINDSTONE,
  SMITHING_TABLE,
  CAULDRON
];
function placeVillagers(c, s, L) {
  const rnd = mulberry32(s.rng ^ 24301);
  const n = 3 + Math.floor(rnd() * 4);
  const homes = L.pieces.filter((p) => p.kind === "house").map((p) => [p.x, p.y + 1, p.z]);
  const ring = [];
  for (let k = -2;k <= 2; k++)
    ring.push([k, -2], [k, 2], [-2, k], [2, k]);
  const spots = [...new Map(ring.map((r) => [r.join(","), r])).values()];
  for (let i = 0;i < n && spots.length > 0; i++) {
    const [dx, dz] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
    c.villager({
      x: s.x + dx,
      y: s.y + 1,
      z: s.z + dz,
      home: homes.length ? homes[i % homes.length] : null,
      meet: [s.x, s.y + 1, s.z]
    });
  }
}
function buildWell(c, s, st) {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -2;dz <= 2; dz++) {
    for (let dx = -2;dx <= 2; dx++) {
      const x = ox + dx, z = oz + dz;
      c.foundation(x, oy - 1, z, st.base);
      c.set(x, oy, z, st.base);
      c.clearAbove(x, oy + 1, z, 5);
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) <= 1;
      if (!ring)
        continue;
      if (dx === 0 && dz === 0) {
        for (let y = oy - 3;y <= oy; y++)
          c.set(x, y, z, WATER);
        c.set(x, oy - 4, z, st.base);
      } else {
        c.set(x, oy + 1, z, st.base);
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1) {
          c.set(x, oy + 2, z, st.fence);
          c.set(x, oy + 3, z, st.fence);
        }
      }
    }
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.set(ox + dx, oy, oz + dz, WATER);
    c.set(ox + dx, oy - 1, oz + dz, st.base);
  }
  for (let dz = -1;dz <= 1; dz++)
    for (let dx = -1;dx <= 1; dx++)
      c.set(ox + dx, oy + 4, oz + dz, stateOf(st.slab, { type: 0 }));
  c.set(ox, oy + 4, oz, st.base);
}
function toWorld(p, u, v) {
  const r = p.dir + 1 & 3;
  return [p.x + DX[r] * u + DX[p.dir] * v, p.z + DZ[r] * u + DZ[p.dir] * v];
}
function buildHouse(c, p, st) {
  const { w: W, d: D, y: hy, dir } = p;
  const back = dir + 2 & 3;
  const set = (u, v, y, id) => {
    const [x, z] = toWorld(p, u, v);
    c.set(x, y, z, id);
  };
  for (let v = -D - 1;v <= D + 1; v++) {
    for (let u = -W - 1;u <= W + 1; u++) {
      const [x, z] = toWorld(p, u, v);
      c.clearAbove(x, hy + 1, z, D + 8);
      if (Math.abs(u) > W || Math.abs(v) > D)
        continue;
      c.foundation(x, hy - 1, z, st.base);
      c.set(x, hy, z, Math.abs(u) === W || Math.abs(v) === D ? st.base : st.planks);
    }
  }
  const top = hy + 4;
  for (let y = hy + 1;y <= top; y++) {
    for (let v = -D;v <= D; v++) {
      for (let u = -W;u <= W; u++) {
        const edgeU = Math.abs(u) === W, edgeV = Math.abs(v) === D;
        if (!edgeU && !edgeV)
          continue;
        const corner = edgeU && edgeV;
        set(u, v, y, corner ? st.log : y === top ? st.flat ? st.accent : st.log : st.planks);
      }
    }
  }
  set(-W, 0, hy + 2, GLASS_PANE);
  set(W, 0, hy + 2, GLASS_PANE);
  set(0, -D, hy + 2, GLASS_PANE);
  if (W >= 3) {
    set(-2, D, hy + 2, GLASS_PANE);
    set(2, D, hy + 2, GLASS_PANE);
  }
  if (st.flat) {
    for (let v = -D;v <= D; v++)
      for (let u = -W;u <= W; u++)
        set(u, v, top + 1, Math.abs(u) === W || Math.abs(v) === D ? stateOf(st.slab, { type: 0 }) : st.planks);
    set(0, 0, top + 1, st.ridge);
  } else {
    for (let k = 0;k <= D + 1; k++) {
      const y = top + k, row = D + 1 - k;
      for (let u = -W - 1;u <= W + 1; u++) {
        if (row === 0) {
          set(u, 0, y, st.ridge === st.planks ? stateOf(st.slab, { type: 0 }) : st.ridge);
          continue;
        }
        set(u, row, y, stateOf(st.stairs, { facing: back, half: 0 }));
        set(u, -row, y, stateOf(st.stairs, { facing: dir, half: 0 }));
      }
      if (k >= 1)
        for (let v = -row + 1;v <= row - 1; v++)
          for (const u of [-W, W])
            set(u, v, y, st.planks);
    }
  }
  const facing = back;
  set(0, D, hy + 1, stateOf(st.door, { facing, half: 0, open: 0, hinge: 0 }));
  set(0, D, hy + 2, stateOf(st.door, { facing, half: 1, open: 0, hinge: 0 }));
  const [sx, sz] = toWorld(p, 0, D + 1);
  c.foundation(sx, hy - 1, sz, st.base);
  c.set(sx, hy, sz, st.path);
  set(1, D + 1, hy + 3, stateOf(WALL_TORCH, { facing: dir }));
  set(0, -D + 1, hy + 3, stateOf(WALL_TORCH, { facing: dir }));
  set(-W + 1, -D + 1, hy + 1, stateOf(st.bed, { facing: back, part: 1 }));
  set(-W + 1, -D + 2, hy + 1, stateOf(st.bed, { facing: back, part: 0 }));
  set(W - 1, -D + 1, hy + 1, p.seed % 2 ? CRAFTING_TABLE : FURNACE + dir);
  if (p.chest) {
    const [x, z] = toWorld(p, W - 1, D - 1 > -D + 1 ? 0 : -D + 1);
    c.chest(x, hy + 1, z, dir + 3 & 3, "village");
  } else if (W >= 3)
    set(W - 1, 0, hy + 1, HAY_BALE);
  if (p.seed % 3 !== 0)
    set(-W + 1, D - 1, hy + 1, HOUSE_WORKSTATIONS[(p.seed >>> 5) % HOUSE_WORKSTATIONS.length]);
}
function buildFarm(c, p, st) {
  const { w: W, d: D, y: fy } = p;
  const crops = [WHEAT_CROP, CARROTS, POTATOES];
  const left = crops[p.seed % 3], right = crops[(p.seed >>> 4) % 3];
  for (let v = -D;v <= D; v++) {
    for (let u = -W;u <= W; u++) {
      const [x, z] = toWorld(p, u, v);
      c.foundation(x, fy - 1, z, DIRT);
      c.clearAbove(x, fy + 1, z, 6);
      const border = Math.abs(u) === W || Math.abs(v) === D;
      if (border) {
        c.set(x, fy, z, st.log);
        continue;
      }
      if (u === 0) {
        c.set(x, fy, z, WATER);
        c.set(x, fy - 1, z, DIRT);
        continue;
      }
      c.set(x, fy, z, stateOf(FARMLAND, { moist: 1 }));
      const age = 2 + (p.seed >>> (u + W) * 3 + v + D) % 6;
      c.set(x, fy + 1, z, stateOf(u < 0 ? left : right, { age }));
    }
  }
}

// goodPG/src/shared/armor.ts
var ARMOR_PIECES = ["helmet", "chestplate", "leggings", "boots"];
var ARMOR_MATERIALS = ["leather", "iron", "golden", "diamond"];
var COPPER_ARMOR = "copper";
var CHAINMAIL_ARMOR = "chainmail";
var TURTLE_ARMOR = "turtle";
var NETHERITE_ARMOR = "netherite";
var ELYTRA_ARMOR = "elytra";
var ALL_ARMOR_MATERIALS = [...ARMOR_MATERIALS, COPPER_ARMOR, CHAINMAIL_ARMOR, TURTLE_ARMOR, NETHERITE_ARMOR];
var ARMOR_STATS = {
  leather: { points: [1, 3, 2, 1], durability: [55, 80, 75, 65], toughness: 0 },
  golden: { points: [2, 5, 3, 1], durability: [77, 112, 105, 91], toughness: 0 },
  iron: { points: [2, 6, 5, 2], durability: [165, 240, 225, 195], toughness: 0 },
  diamond: { points: [3, 8, 6, 3], durability: [363, 528, 495, 429], toughness: 2 },
  copper: { points: [2, 4, 3, 1], durability: [121, 176, 165, 143], toughness: 0 },
  chainmail: { points: [2, 5, 4, 1], durability: [165, 240, 225, 195], toughness: 0 },
  turtle: { points: [2, 0, 0, 0], durability: [275, 0, 0, 0], toughness: 0 },
  netherite: { points: [3, 8, 6, 3], durability: [407, 592, 555, 481], toughness: 3 },
  elytra: { points: [0, 0, 0, 0], durability: [0, 432, 0, 0], toughness: 0 }
};
var ARMOR_BYPASS = new Set([
  "fall",
  "void",
  "suffocate",
  "drown",
  "starve",
  "kill",
  "poison",
  "wither",
  "guardian_laser",
  "fly_into_wall"
]);

// goodPG/src/shared/effects.ts
var EFFECT_SPEED = 1;
var EFFECT_SLOWNESS = 2;
var EFFECT_STRENGTH = 3;
var EFFECT_WEAKNESS = 4;
var EFFECT_REGENERATION = 5;
var EFFECT_POISON = 6;
var EFFECT_HUNGER = 7;
var EFFECT_FIRE_RESISTANCE = 8;
var EFFECT_NIGHT_VISION = 9;
var EFFECT_WATER_BREATHING = 10;
var EFFECT_ABSORPTION = 11;
var EFFECT_BAD_OMEN = 12;
var EFFECT_HERO = 13;
var EFFECT_RESISTANCE = 14;
var EFFECT_CONDUIT_POWER = 15;
var EFFECT_JUMP_BOOST = 16;
var EFFECT_INVISIBILITY = 17;
var EFFECT_SLOW_FALLING = 18;
var EFFECT_LUCK = 19;
var EFFECT_UNLUCK = 20;
var EFFECT_INSTANT_HEALTH = 21;
var EFFECT_INSTANT_DAMAGE = 22;
var EFFECT_HASTE = 23;
var EFFECT_MINING_FATIGUE = 24;
var EFFECT_NAUSEA = 25;
var EFFECT_BLINDNESS = 26;
var EFFECT_SATURATION = 27;
var EFFECT_GLOWING = 28;
var EFFECT_DOLPHINS_GRACE = 29;
var EFFECT_HEALTH_BOOST = 30;
var EFFECT_DARKNESS = 31;
var EFFECT_WITHER = 32;
var EFFECT_LEVITATION = 33;
var EFFECTS = {
  [EFFECT_SPEED]: { id: EFFECT_SPEED, key: "speed", name: "速度", color: [51, 235, 255], good: true },
  [EFFECT_SLOWNESS]: { id: EFFECT_SLOWNESS, key: "slowness", name: "缓慢", color: [139, 175, 224], good: false },
  [EFFECT_STRENGTH]: { id: EFFECT_STRENGTH, key: "strength", name: "力量", color: [255, 199, 0], good: true },
  [EFFECT_WEAKNESS]: { id: EFFECT_WEAKNESS, key: "weakness", name: "虚弱", color: [72, 77, 72], good: false },
  [EFFECT_REGENERATION]: { id: EFFECT_REGENERATION, key: "regeneration", name: "生命恢复", color: [205, 92, 171], good: true },
  [EFFECT_POISON]: { id: EFFECT_POISON, key: "poison", name: "中毒", color: [135, 163, 99], good: false },
  [EFFECT_HUNGER]: { id: EFFECT_HUNGER, key: "hunger", name: "饥饿", color: [88, 118, 83], good: false },
  [EFFECT_FIRE_RESISTANCE]: { id: EFFECT_FIRE_RESISTANCE, key: "fire_resistance", name: "抗火", color: [255, 153, 0], good: true },
  [EFFECT_NIGHT_VISION]: { id: EFFECT_NIGHT_VISION, key: "night_vision", name: "夜视", color: [194, 255, 102], good: true },
  [EFFECT_WATER_BREATHING]: { id: EFFECT_WATER_BREATHING, key: "water_breathing", name: "水肺", color: [152, 218, 192], good: true },
  [EFFECT_ABSORPTION]: { id: EFFECT_ABSORPTION, key: "absorption", name: "伤害吸收", color: [37, 82, 165], good: true },
  [EFFECT_BAD_OMEN]: { id: EFFECT_BAD_OMEN, key: "bad_omen", name: "不祥之兆", color: [11, 97, 56], good: false },
  [EFFECT_HERO]: { id: EFFECT_HERO, key: "hero_of_the_village", name: "村庄英雄", color: [68, 255, 68], good: true },
  [EFFECT_RESISTANCE]: { id: EFFECT_RESISTANCE, key: "resistance", name: "抗性提升", color: [145, 70, 240], good: true },
  [EFFECT_CONDUIT_POWER]: { id: EFFECT_CONDUIT_POWER, key: "conduit_power", name: "潮涌能量", color: [29, 194, 209], good: true },
  [EFFECT_JUMP_BOOST]: { id: EFFECT_JUMP_BOOST, key: "jump_boost", name: "跳跃提升", color: [253, 255, 132], good: true },
  [EFFECT_INVISIBILITY]: { id: EFFECT_INVISIBILITY, key: "invisibility", name: "隐身", color: [246, 246, 246], good: true },
  [EFFECT_SLOW_FALLING]: { id: EFFECT_SLOW_FALLING, key: "slow_falling", name: "缓降", color: [243, 207, 185], good: true },
  [EFFECT_LUCK]: { id: EFFECT_LUCK, key: "luck", name: "幸运", color: [89, 193, 6], good: true },
  [EFFECT_UNLUCK]: { id: EFFECT_UNLUCK, key: "unluck", name: "霉运", color: [192, 164, 77], good: false },
  [EFFECT_INSTANT_HEALTH]: { id: EFFECT_INSTANT_HEALTH, key: "instant_health", name: "瞬间治疗", color: [248, 36, 35], good: true, instant: true },
  [EFFECT_INSTANT_DAMAGE]: { id: EFFECT_INSTANT_DAMAGE, key: "instant_damage", name: "瞬间伤害", color: [169, 101, 106], good: false, instant: true },
  [EFFECT_HASTE]: { id: EFFECT_HASTE, key: "haste", name: "急迫", color: [217, 192, 67], good: true },
  [EFFECT_MINING_FATIGUE]: { id: EFFECT_MINING_FATIGUE, key: "mining_fatigue", name: "挖掘疲劳", color: [74, 66, 23], good: false },
  [EFFECT_NAUSEA]: { id: EFFECT_NAUSEA, key: "nausea", name: "反胃", color: [85, 29, 74], good: false },
  [EFFECT_BLINDNESS]: { id: EFFECT_BLINDNESS, key: "blindness", name: "失明", color: [31, 31, 35], good: false },
  [EFFECT_SATURATION]: { id: EFFECT_SATURATION, key: "saturation", name: "饱和", color: [248, 36, 35], good: true },
  [EFFECT_GLOWING]: { id: EFFECT_GLOWING, key: "glowing", name: "发光", color: [148, 160, 97], good: true },
  [EFFECT_DOLPHINS_GRACE]: { id: EFFECT_DOLPHINS_GRACE, key: "dolphins_grace", name: "海豚的恩惠", color: [136, 163, 190], good: true },
  [EFFECT_HEALTH_BOOST]: { id: EFFECT_HEALTH_BOOST, key: "health_boost", name: "生命提升", color: [248, 125, 35], good: true },
  [EFFECT_DARKNESS]: { id: EFFECT_DARKNESS, key: "darkness", name: "黑暗", color: [41, 39, 33], good: false },
  [EFFECT_WITHER]: { id: EFFECT_WITHER, key: "wither", name: "凋零", color: [115, 97, 86], good: false },
  [EFFECT_LEVITATION]: { id: EFFECT_LEVITATION, key: "levitation", name: "飘浮", color: [206, 255, 255], good: false }
};
var BAD_OMEN_SECONDS = 3600;
var MAX_EFFECT_AMP = 5;
function maxHealthWith(boostAmp) {
  return 20 + (boostAmp >= 0 ? 4 * (boostAmp + 1) : 0);
}
var MAX_HEALTH_CAP = maxHealthWith(MAX_EFFECT_AMP);
var EF_GLOWING = 1 << 11;
var STATE_GLOWING = 1 << 15;

// goodPG/src/shared/equipment.ts
var WOLF_ARMOR_DURABILITY = 64;
var CONDUIT_FRAME = (() => {
  const out = [];
  for (let i = -2;i <= 2; i++) {
    for (let j = -2;j <= 2; j++) {
      for (let k = -2;k <= 2; k++) {
        const a = Math.abs(i), b = Math.abs(j), c = Math.abs(k);
        if (a <= 1 && b <= 1 && c <= 1)
          continue;
        if (i === 0 && (b === 2 || c === 2) || j === 0 && (a === 2 || c === 2) || k === 0 && (a === 2 || b === 2))
          out.push([i, j, k]);
      }
    }
  }
  return out;
})();

// goodPG/src/shared/spawnEggs.ts
var egg = (mob, name, base, spots) => ({ mob, name, base, spots });
var SPAWN_EGG_DEFS = [
  egg("pig", "猪", [240, 160, 156], [219, 99, 94]),
  egg("cow", "牛", [68, 54, 37], [161, 161, 161]),
  egg("sheep", "羊", [231, 231, 231], [255, 181, 181]),
  egg("chicken", "鸡", [161, 161, 161], [230, 30, 30]),
  egg("zombie", "僵尸", [0, 175, 175], [121, 156, 101]),
  egg("husk", "尸壳", [121, 118, 87], [230, 204, 148]),
  egg("skeleton", "骷髅", [193, 193, 193], [73, 73, 73]),
  egg("stray", "流浪者", [97, 118, 118], [221, 234, 234]),
  egg("creeper", "苦力怕", [13, 168, 0], [20, 20, 20]),
  egg("spider", "蜘蛛", [52, 45, 39], [163, 0, 0]),
  egg("enderman", "末影人", [22, 22, 22], [60, 20, 70]),
  egg("squid", "鱿鱼", [34, 61, 77], [112, 131, 145]),
  egg("fox", "狐狸", [213, 178, 138], [202, 102, 34]),
  egg("goat", "山羊", [165, 148, 125], [85, 73, 62]),
  egg("polar_bear", "北极熊", [242, 242, 242], [149, 149, 148]),
  egg("rabbit", "兔子", [153, 93, 60], [115, 84, 59]),
  egg("wolf", "狼", [215, 211, 211], [206, 173, 145]),
  egg("villager", "村民", [86, 60, 50], [189, 139, 114]),
  egg("wandering_trader", "流浪商人", [69, 97, 145], [234, 169, 69]),
  egg("iron_golem", "铁傀儡", [219, 205, 193], [116, 168, 83]),
  egg("snow_golem", "雪傀儡", [217, 242, 242], [129, 166, 166]),
  egg("cat", "猫", [239, 197, 142], [149, 120, 83]),
  egg("horse", "马", [192, 158, 127], [238, 229, 0]),
  egg("donkey", "驴", [83, 69, 57], [134, 117, 102]),
  egg("mule", "骡", [27, 2, 0], [81, 51, 29]),
  egg("llama", "羊驼", [194, 165, 120], [153, 83, 52]),
  egg("camel", "骆驼", [252, 174, 76], [204, 137, 56]),
  egg("cod", "鳕鱼", [193, 167, 100], [229, 196, 138]),
  egg("salmon", "鲑鱼", [161, 0, 0], [14, 131, 119]),
  egg("tropical_fish", "热带鱼", [239, 112, 19], [255, 249, 239]),
  egg("pufferfish", "河豚", [246, 178, 15], [55, 194, 240]),
  egg("dolphin", "海豚", [34, 58, 74], [249, 249, 249]),
  egg("turtle", "海龟", [231, 231, 231], [0, 175, 175]),
  egg("axolotl", "美西螈", [251, 193, 227], [166, 19, 145]),
  egg("frog", "青蛙", [213, 120, 70], [255, 197, 108]),
  egg("tadpole", "蝌蚪", [109, 83, 65], [22, 17, 13]),
  egg("glow_squid", "发光鱿鱼", [9, 93, 105], [133, 241, 188]),
  egg("drowned", "溺尸", [143, 241, 215], [121, 156, 101]),
  egg("witch", "女巫", [52, 0, 0], [81, 160, 50]),
  egg("slime", "史莱姆", [81, 160, 50], [126, 191, 110]),
  egg("phantom", "幻翼", [67, 81, 138], [136, 255, 0]),
  egg("silverfish", "蠹虫", [110, 110, 110], [48, 48, 48]),
  egg("cave_spider", "洞穴蜘蛛", [12, 66, 77], [163, 0, 0]),
  egg("zombie_villager", "僵尸村民", [86, 60, 50], [121, 156, 101]),
  egg("bee", "蜜蜂", [237, 193, 57], [67, 36, 27]),
  egg("panda", "熊猫", [231, 231, 231], [27, 27, 27]),
  egg("parrot", "鹦鹉", [13, 168, 0], [255, 0, 0]),
  egg("armadillo", "犰狳", [173, 113, 108], [130, 71, 72]),
  egg("pillager", "掠夺者", [83, 47, 54], [149, 154, 151]),
  egg("vindicator", "卫道士", [149, 154, 151], [39, 93, 96]),
  egg("evoker", "唤魔者", [149, 154, 151], [30, 30, 30]),
  egg("vex", "恼鬼", [122, 144, 164], [232, 237, 241]),
  egg("ravager", "劫掠兽", [117, 114, 110], [91, 80, 74])
];
var NO_SPAWN_EGG = new Set(["slime_medium", "slime_small", "evoker_fangs", "magma_cube_medium", "magma_cube_small"]);
var LATE_SPAWN_EGG_DEFS = [
  egg("guardian", "守卫者", [90, 130, 114], [241, 125, 48]),
  egg("elder_guardian", "远古守卫者", [206, 205, 186], [116, 118, 147]),
  egg("warden", "监守者", [15, 70, 73], [57, 214, 224]),
  egg("bat", "蝙蝠", [76, 62, 48], [15, 15, 15]),
  egg("ocelot", "豹猫", [239, 222, 125], [86, 68, 52]),
  egg("mooshroom", "哞菇", [160, 15, 16], [183, 183, 183]),
  egg("trader_llama", "商队羊驼", [234, 164, 48], [69, 98, 150]),
  egg("skeleton_horse", "骷髅马", [104, 104, 79], [229, 229, 216]),
  egg("zombie_horse", "僵尸马", [49, 82, 52], [151, 194, 132]),
  egg("allay", "悦灵", [0, 218, 255], [0, 173, 255])
];
var NETHER_SPAWN_EGG_DEFS = [
  egg("piglin", "猪灵", [153, 93, 59], [249, 243, 164]),
  egg("piglin_brute", "猪灵蛮兵", [89, 40, 5], [249, 243, 164]),
  egg("zombified_piglin", "僵尸猪灵", [234, 147, 147], [76, 112, 48]),
  egg("ghast", "恶魂", [249, 249, 249], [188, 188, 188]),
  egg("blaze", "烈焰人", [246, 178, 0], [255, 249, 127]),
  egg("magma_cube", "岩浆怪", [52, 0, 0], [252, 252, 0]),
  egg("hoglin", "疣猪兽", [198, 131, 101], [95, 102, 102]),
  egg("zoglin", "僵尸疣猪兽", [198, 131, 101], [230, 230, 230]),
  egg("strider", "炽足兽", [156, 61, 62], [77, 73, 77]),
  egg("wither_skeleton", "凋灵骷髅", [20, 20, 20], [71, 77, 77])
];
var END_SPAWN_EGG_DEFS = [
  egg("endermite", "末影螨", [22, 22, 22], [110, 110, 110]),
  egg("ender_dragon", "末影龙", [28, 28, 28], [224, 121, 250]),
  egg("shulker", "潜影贝", [148, 103, 148], [77, 56, 82])
];
var WITHER_SPAWN_EGG_DEFS = [
  egg("wither", "凋灵", [21, 21, 21], [79, 84, 94])
];

// goodPG/src/shared/discs.ts
var DISCS = [
  { key: "13", title: "13", seconds: 150 },
  { key: "cat", title: "cat", seconds: 124 },
  { key: "blocks", title: "blocks", seconds: 168 },
  { key: "chirp", title: "chirp", seconds: 118 },
  { key: "far", title: "far", seconds: 152 },
  { key: "mall", title: "mall", seconds: 140 },
  { key: "mellohi", title: "mellohi", seconds: 98 },
  { key: "stal", title: "stal", seconds: 128 },
  { key: "strad", title: "strad", seconds: 112 },
  { key: "ward", title: "ward", seconds: 172 },
  { key: "11", title: "11", seconds: 71 },
  { key: "wait", title: "wait", seconds: 160 },
  { key: "otherside", title: "otherside", seconds: 134 },
  { key: "5", title: "5", seconds: 178 },
  { key: "tears", title: "Tears", seconds: 175 },
  { key: "pigstep", title: "Pigstep", seconds: 148 }
];

// goodPG/src/shared/items.ts
var ITEMS = [];
for (let id = 1;id < BLOCK_COUNT; id++) {
  const b = BLOCKS[id];
  if (!b || b.render === R_NONE || b.level !== 0 || baseBlock(id) !== id || b.noItem)
    continue;
  ITEMS[id] = { id, key: b.key, name: b.name, stack: 64, block: id };
}
AMETHYST_BUD_ITEM_KEYS.forEach((k, s) => {
  if (ITEMS[AMETHYST_BUD + s])
    ITEMS[AMETHYST_BUD + s].key = k;
});
for (const [wood, id] of Object.entries(DOORS))
  ITEMS[id].sprite = `${wood}_door`;
for (const [color, id] of Object.entries(BEDS)) {
  ITEMS[id].sprite = `${color}_bed`;
  ITEMS[id].stack = 1;
}
for (const [wood, id] of Object.entries(SIGNS)) {
  ITEMS[id].sprite = `${wood}_sign`;
  ITEMS[id].stack = 16;
}
var nextId = 256;
function item(key, name, o = {}) {
  const id = nextId++;
  ITEMS[id] = { id, key, name, stack: 64, sprite: key, ...o };
  return id;
}
var STICK = item("stick", "木棍", { fuel: 5 });
var COAL = item("coal", "煤炭", { fuel: 80 });
var CHARCOAL = item("charcoal", "木炭", { fuel: 80 });
var IRON_INGOT = item("iron_ingot", "铁锭");
var GOLD_INGOT = item("gold_ingot", "金锭");
var DIAMOND = item("diamond", "钻石");
var LAPIS = item("lapis_lazuli", "青金石");
var REDSTONE = item("redstone", "红石粉");
var FLINT = item("flint", "燧石");
var CLAY_BALL = item("clay_ball", "黏土球");
var BRICK = item("brick", "红砖");
var BONE = item("bone", "骨头");
var STRING = item("string", "线");
var FEATHER = item("feather", "羽毛");
var GUNPOWDER = item("gunpowder", "火药");
var LEATHER = item("leather", "皮革");
var ROTTEN_FLESH = item("rotten_flesh", "腐肉", { food: { hunger: 4, saturation: 0.8 } });
var PAPER = item("paper", "纸");
var BOOK = item("book", "书");
var ENDER_PEARL = item("ender_pearl", "末影珍珠", { stack: 16 });
var APPLE = item("apple", "苹果", { food: { hunger: 4, saturation: 2.4 } });
var RAW_PORKCHOP = item("raw_porkchop", "生猪排", { food: { hunger: 3, saturation: 1.8 } });
var COOKED_PORKCHOP = item("cooked_porkchop", "熟猪排", { food: { hunger: 8, saturation: 12.8 } });
var RAW_BEEF = item("raw_beef", "生牛肉", { food: { hunger: 3, saturation: 1.8 } });
var STEAK = item("steak", "牛排", { food: { hunger: 8, saturation: 12.8 } });
var RAW_CHICKEN = item("raw_chicken", "生鸡肉", { food: { hunger: 2, saturation: 1.2 } });
var COOKED_CHICKEN = item("cooked_chicken", "熟鸡肉", { food: { hunger: 6, saturation: 7.2 } });
var RAW_MUTTON = item("raw_mutton", "生羊肉", { food: { hunger: 2, saturation: 1.2 } });
var COOKED_MUTTON = item("cooked_mutton", "熟羊肉", { food: { hunger: 6, saturation: 9.6 } });
var BREAD = item("bread", "面包", { food: { hunger: 5, saturation: 6 } });
var BUCKET = item("bucket", "桶", { stack: 16 });
var WATER_BUCKET = item("water_bucket", "水桶", { stack: 1, block: WATER });
var LAVA_BUCKET = item("lava_bucket", "熔岩桶", { stack: 1, block: LAVA, fuel: 1000 });
var BOW = item("bow", "弓", { stack: 1, fuel: 15, tool: { kind: "bow", tier: 0, speed: 1, durability: 384, damage: 1 } });
var ARROW = item("arrow", "箭");
var SHEARS = item("shears", "剪刀", { stack: 1, tool: { kind: "shears", tier: 0, speed: 1.5, durability: 238, damage: 1 } });
var MATERIALS2 = [
  ["wooden", "木", 1, 2, 59],
  ["stone", "石", 2, 4, 131],
  ["iron", "铁", 3, 6, 250],
  ["golden", "金", 1, 12, 32],
  ["diamond", "钻石", 4, 8, 1561]
];
var KINDS2 = [["pickaxe", "镐"], ["axe", "斧"], ["shovel", "锹"], ["sword", "剑"]];
var COMBAT = {
  sword: [[4, 5, 6, 4, 7], [1.6, 1.6, 1.6, 1.6, 1.6]],
  axe: [[7, 9, 9, 7, 9], [0.8, 0.8, 0.9, 1, 1]],
  pickaxe: [[2, 3, 4, 2, 5], [1.2, 1.2, 1.2, 1.2, 1.2]],
  shovel: [[2.5, 3.5, 4.5, 2.5, 5.5], [1, 1, 1, 1, 1]],
  hoe: [[1, 1, 1, 1, 1], [1, 2, 3, 1, 4]]
};
var TOOLS = {};
MATERIALS2.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat] = {};
  for (const [kind, kindName] of KINDS2) {
    TOOLS[mat][kind] = item(`${mat}_${kind}`, `${matName}${kindName}`, {
      stack: 1,
      fuel: mat === "wooden" ? 10 : undefined,
      tool: { kind, tier, speed, durability: dur, damage: COMBAT[kind][0][m], attackSpeed: COMBAT[kind][1][m] }
    });
  }
});
var WHEAT_SEEDS = item("wheat_seeds", "小麦种子", { block: WHEAT_CROP });
var WHEAT = item("wheat", "小麦");
var CARROT = item("carrot", "胡萝卜", { block: CARROTS, food: { hunger: 3, saturation: 3.6 } });
var POTATO = item("potato", "马铃薯", { block: POTATOES, food: { hunger: 1, saturation: 0.6 } });
var BAKED_POTATO = item("baked_potato", "烤马铃薯", { food: { hunger: 5, saturation: 6 } });
var BEETROOT = item("beetroot", "甜菜根", { food: { hunger: 1, saturation: 1.2 } });
var BEETROOT_SEEDS = item("beetroot_seeds", "甜菜种子", { block: BEETROOTS });
var BONE_MEAL = item("bone_meal", "骨粉");
var EGG = item("egg", "鸡蛋", { stack: 16 });
var MILK_BUCKET = item("milk_bucket", "牛奶桶", { stack: 1, drink: true });
var SUGAR = item("sugar", "糖");
MATERIALS2.forEach(([mat, matName, tier, speed, dur], m) => {
  TOOLS[mat].hoe = item(`${mat}_hoe`, `${matName}锄`, {
    stack: 1,
    fuel: mat === "wooden" ? 10 : undefined,
    tool: { kind: "hoe", tier, speed, durability: dur, damage: COMBAT.hoe[0][m], attackSpeed: COMBAT.hoe[1][m] }
  });
});
ITEMS[CAKE].stack = 1;
var ARMOR_NAMES = {
  leather: ["皮革", "皮革"],
  golden: ["金", "金"],
  iron: ["铁", "铁"],
  diamond: ["钻石", "钻石"]
};
var PIECE_NAMES = ["头盔", "胸甲", "护腿", "靴子"];
var ARMOR = {};
for (const mat of ARMOR_MATERIALS) {
  ARMOR[mat] = {};
  const st = ARMOR_STATS[mat];
  ARMOR_PIECES.forEach((piece, slot) => {
    ARMOR[mat][piece] = item(`${mat}_${piece}`, `${ARMOR_NAMES[mat][0]}${PIECE_NAMES[slot]}`, {
      stack: 1,
      armor: { slot, material: mat, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] }
    });
  });
}
var GOLDEN_APPLE = item("golden_apple", "金苹果", {
  food: { hunger: 4, saturation: 9.6, always: true, effects: [[EFFECT_REGENERATION, 5, 1, 1], [EFFECT_ABSORPTION, 120, 0, 1]] }
});
var SPIDER_EYE = item("spider_eye", "蜘蛛眼", {
  food: { hunger: 2, saturation: 3.2, effects: [[EFFECT_POISON, 5, 0, 1]] }
});
var SHIELD = item("shield", "盾牌", {
  stack: 1,
  fuel: 15,
  tool: { kind: "shield", tier: 0, speed: 1, durability: 336, damage: 1 }
});
var PUMPKIN_SEEDS = item("pumpkin_seeds", "南瓜种子", { block: PUMPKIN_STEM });
var MELON_SEEDS = item("melon_seeds", "西瓜种子", { block: MELON_STEM });
var MELON_SLICE = item("melon_slice", "西瓜片", { food: { hunger: 2, saturation: 1.2 } });
var PUMPKIN_PIE = item("pumpkin_pie", "南瓜派", { food: { hunger: 8, saturation: 4.8 } });
var FISHING_ROD = item("fishing_rod", "钓鱼竿", {
  stack: 1,
  fuel: 15,
  tool: { kind: "fishing_rod", tier: 0, speed: 1, durability: 64, damage: 1 }
});
var COD = item("cod", "生鳕鱼", { food: { hunger: 2, saturation: 0.4 } });
var COOKED_COD = item("cooked_cod", "熟鳕鱼", { food: { hunger: 5, saturation: 6 } });
var SALMON = item("salmon", "生鲑鱼", { food: { hunger: 2, saturation: 0.4 } });
var COOKED_SALMON = item("cooked_salmon", "熟鲑鱼", { food: { hunger: 6, saturation: 9.6 } });
var TROPICAL_FISH = item("tropical_fish", "热带鱼", { food: { hunger: 1, saturation: 0.2 } });
var PUFFERFISH = item("pufferfish", "河豚", {
  food: { hunger: 1, saturation: 0.2, effects: [[EFFECT_HUNGER, 15, 2, 1], [EFFECT_POISON, 60, 1, 1], [EFFECT_NAUSEA, 15, 0, 1]] }
});
var COPPER_INGOT = item("copper_ingot", "铜锭");
var EMERALD = item("emerald", "绿宝石");
var AMETHYST_SHARD = item("amethyst_shard", "紫水晶碎片");
var GLOW_BERRIES = item("glow_berries", "荧光浆果", { block: CAVE_VINES, food: { hunger: 2, saturation: 0.4 } });
var COMPASS = item("compass", "指南针");
var EMPTY_MAP = item("map", "空地图");
var FILLED_MAP = item("filled_map", "地图");
var SNOWBALL = item("snowball", "雪球", { stack: 16 });
var SADDLE = item("saddle", "鞍", { stack: 1 });
var SLIME_BALL = item("slime_ball", "黏液球");
var PHANTOM_MEMBRANE = item("phantom_membrane", "幻翼膜");
var SPLASH_HARMING = item("splash_potion_harming", "喷溅型伤害药水", { stack: 1 });
var SPLASH_SLOWNESS = item("splash_potion_slowness", "喷溅型迟缓药水", { stack: 1 });
var SPLASH_POISON = item("splash_potion_poison", "喷溅型剧毒药水", { stack: 1 });
var COD_BUCKET = item("cod_bucket", "鳕鱼桶", { stack: 1, block: WATER });
var SALMON_BUCKET = item("salmon_bucket", "鲑鱼桶", { stack: 1, block: WATER });
var TROPICAL_FISH_BUCKET = item("tropical_fish_bucket", "热带鱼桶", { stack: 1, block: WATER });
var PUFFERFISH_BUCKET = item("pufferfish_bucket", "河豚桶", { stack: 1, block: WATER });
var AXOLOTL_BUCKET = item("axolotl_bucket", "美西螈桶", { stack: 1, block: WATER });
var TADPOLE_BUCKET = item("tadpole_bucket", "蝌蚪桶", { stack: 1, block: WATER });
var GLASS_BOTTLE = item("glass_bottle", "玻璃瓶", { stack: 16 });
var HONEY_BOTTLE = item("honey_bottle", "蜂蜜瓶", { stack: 16, food: { hunger: 6, saturation: 1.2, always: true } });
var HONEYCOMB = item("honeycomb", "蜜脾");
var RAW_RABBIT = item("raw_rabbit", "生兔肉", { food: { hunger: 3, saturation: 1.8 } });
var COOKED_RABBIT = item("cooked_rabbit", "熟兔肉", { food: { hunger: 5, saturation: 6 } });
var RABBIT_HIDE = item("rabbit_hide", "兔子皮");
var ARMADILLO_SCUTE = item("armadillo_scute", "犰狳鳞甲");
var BRUSH = item("brush", "刷子", { stack: 1, tool: { kind: "brush", tier: 0, speed: 1, durability: 64, damage: 1 } });
var OMINOUS_BOTTLE = item("ominous_bottle", "不祥之瓶", { food: { hunger: 0, saturation: 0, always: true } });
var TOTEM_OF_UNDYING = item("totem_of_undying", "不死图腾", { stack: 1 });
var DYES = {};
for (const c of DYE_COLORS)
  DYES[c] = item(`${c}_dye`, `${COLOR_NAMES[c][0]}染料`);
for (const c of DYE_COLORS) {
  ITEMS[BANNERS[c]].stack = 16;
  ITEMS[BANNERS[c]].fuel = 15;
  ITEMS[CARPETS[c]].fuel = 3.35;
}
var RAW_COPPER = item("raw_copper", "粗铜");
var COPPER_NUGGET = item("copper_nugget", "铜粒");
TOOLS.copper = {};
for (const [kind, kindName, damage, attackSpeed] of [
  ["pickaxe", "镐", 3, 1.2],
  ["axe", "斧", 9, 0.8],
  ["shovel", "锹", 3.5, 1],
  ["sword", "剑", 5, 1.6],
  ["hoe", "锄", 1, 2]
]) {
  TOOLS.copper[kind] = item(`copper_${kind}`, `铜${kindName}`, {
    stack: 1,
    tool: { kind, tier: 2, speed: 5, durability: 190, damage, attackSpeed }
  });
}
ARMOR[COPPER_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[COPPER_ARMOR];
  ARMOR[COPPER_ARMOR][piece] = item(`copper_${piece}`, `铜${PIECE_NAMES[slot]}`, {
    stack: 1,
    armor: { slot, material: COPPER_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] }
  });
});
COPPER.door.forEach((row) => row.forEach((id, stage) => ITEMS[id].sprite = copperTexture("copper_door", stage)));
var DRIED_KELP = item("dried_kelp", "干海带", { food: { hunger: 1, saturation: 0.6 } });
var SWEET_BERRIES = item("sweet_berries", "甜浆果", { block: SWEET_BERRY_BUSH, food: { hunger: 2, saturation: 0.4 } });
var PRISMARINE_SHARD = item("prismarine_shard", "海晶碎片");
var PRISMARINE_CRYSTALS = item("prismarine_crystals", "海晶砂粒");
ITEMS[KELP].smelt = DRIED_KELP;
ITEMS[WET_SPONGE].smelt = SPONGE;
ITEMS[DRIED_KELP_BLOCK].fuel = 200;
ITEMS[OMINOUS_BOTTLE].food.effects = [[EFFECT_BAD_OMEN, BAD_OMEN_SECONDS, 0, 1]];
ITEMS[ROTTEN_FLESH].food.effects = [[EFFECT_HUNGER, 30, 0, 0.8]];
ITEMS[RAW_CHICKEN].food.effects = [[EFFECT_HUNGER, 30, 0, 0.3]];
var BREED_FOOD = {
  cow: [WHEAT],
  sheep: [WHEAT],
  pig: [CARROT, POTATO, BEETROOT],
  chicken: [WHEAT_SEEDS, BEETROOT_SEEDS, PUMPKIN_SEEDS, MELON_SEEDS],
  goat: [WHEAT],
  rabbit: [CARROT],
  fox: [GLOW_BERRIES],
  horse: [GOLDEN_APPLE, WHEAT],
  donkey: [GOLDEN_APPLE, WHEAT],
  llama: [HAY_BALE],
  camel: [CACTUS],
  panda: [BAMBOO],
  armadillo: [SPIDER_EYE]
};
BREED_FOOD.fox.push(SWEET_BERRIES);
var BOWL = item("bowl", "碗", { fuel: 5 });
var IRON_NUGGET = item("iron_nugget", "铁粒");
var GOLD_NUGGET = item("gold_nugget", "金粒");
var COCOA_BEANS = item("cocoa_beans", "可可豆");
var COOKIE = item("cookie", "曲奇", { food: { hunger: 2, saturation: 0.4 } });
var MUSHROOM_STEW = item("mushroom_stew", "蘑菇煲", { stack: 1, food: { hunger: 6, saturation: 7.2 } });
var RABBIT_STEW = item("rabbit_stew", "兔肉煲", { stack: 1, food: { hunger: 10, saturation: 12 } });
var BEETROOT_SOUP = item("beetroot_soup", "甜菜汤", { stack: 1, food: { hunger: 6, saturation: 7.2 } });
var SUSPICIOUS_STEW = item("suspicious_stew", "迷之炖菜", { stack: 1, food: { hunger: 6, saturation: 7.2, always: true } });
var GOLDEN_CARROT = item("golden_carrot", "金胡萝卜", { food: { hunger: 6, saturation: 14.4 } });
var GLISTERING_MELON_SLICE = item("glistering_melon_slice", "闪烁的西瓜片");
var SPYGLASS = item("spyglass", "望远镜", { stack: 1 });
var CLOCK = item("clock", "时钟");
var PAINTING = item("painting", "画");
var ITEM_FRAME = item("item_frame", "物品展示框");
var SPAWN_EGGS = {};
for (const e of SPAWN_EGG_DEFS)
  SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `${e.name}刷怪蛋`);
var INK_SAC = item("ink_sac", "墨囊");
var NAME_TAG = item("name_tag", "命名牌");
var LEAD = item("lead", "拴绳");
var BUNDLE = item("bundle", "收纳袋", { stack: 1 });
var DYED_BUNDLES = {};
for (const c of DYE_COLORS)
  DYED_BUNDLES[c] = item(`${c}_bundle`, `${COLOR_NAMES[c][0]}收纳袋`, { stack: 1 });
var ARMOR_STAND = item("armor_stand", "盔甲架", { stack: 16 });
var WRITABLE_BOOK = item("writable_book", "书与笔", { stack: 1 });
var WRITTEN_BOOK = item("written_book", "成书", { stack: 16 });
var BANNER_PATTERN_ITEMS = {
  flower: item("flower_banner_pattern", "花朵盾徽旗帜图案", { stack: 1 }),
  creeper: item("creeper_banner_pattern", "苦力怕盾徽旗帜图案", { stack: 1 }),
  skull: item("skull_banner_pattern", "骷髅盾徽旗帜图案", { stack: 1 }),
  thing: item("thing_banner_pattern", "Mojang标志旗帜图案", { stack: 1 }),
  globe: item("globe_banner_pattern", "地球旗帜图案", { stack: 1 }),
  curly_border: item("bordure_indented_banner_pattern", "锯齿框边旗帜图案", { stack: 1 }),
  bricks: item("field_masoned_banner_pattern", "砖纹旗帜图案", { stack: 1 })
};
var RAW_IRON = item("raw_iron", "粗铁");
var RAW_GOLD = item("raw_gold", "粗金");
var POWDER_SNOW_BUCKET = item("powder_snow_bucket", "细雪桶", { stack: 1, block: POWDER_SNOW });
var GLOW_INK_SAC = item("glow_ink_sac", "荧光墨囊");
var GLOW_ITEM_FRAME = item("glow_item_frame", "荧光物品展示框");
var MUSIC_DISCS = DISCS.filter((d) => d.key !== "5" && d.key !== "tears" && d.key !== "pigstep").map((d) => item(`music_disc_${d.key}`, "音乐唱片", { stack: 1 }));
for (const k of ALL_SKULL_KINDS)
  ITEMS[SKULLS[k]].armor = { slot: 0, material: "leather", points: 0, toughness: 0, durability: 0 };
var FLINT_AND_STEEL = item("flint_and_steel", "打火石", {
  stack: 1,
  tool: { kind: "lighter", tier: 0, speed: 1, durability: 64, damage: 1 }
});
ARMOR[CHAINMAIL_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[CHAINMAIL_ARMOR];
  ARMOR[CHAINMAIL_ARMOR][piece] = item(`chainmail_${piece}`, `锁链${PIECE_NAMES[slot]}`, {
    stack: 1,
    armor: { slot, material: CHAINMAIL_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] }
  });
});
var CROSSBOW = item("crossbow", "弩", { stack: 1, tool: { kind: "crossbow", tier: 0, speed: 1, durability: 465, damage: 1 } });
var CROSSBOW_CHARGED = item("crossbow_charged", "弩", { stack: 1, tool: { kind: "crossbow", tier: 0, speed: 1, durability: 465, damage: 1 } });
var TRIDENT = item("trident", "三叉戟", { stack: 1, tool: { kind: "trident", tier: 0, speed: 1, durability: 250, damage: 9, attackSpeed: 1.1 } });
var TURTLE_SCUTE = item("turtle_scute", "海龟鳞甲");
var TURTLE_HELMET = item("turtle_helmet", "海龟壳", {
  stack: 1,
  armor: { slot: 0, material: TURTLE_ARMOR, points: 2, toughness: 0, durability: ARMOR_STATS[TURTLE_ARMOR].durability[0] }
});
var HORSE_ARMOR = {};
for (const [mat, name] of [["leather", "皮革"], ["iron", "铁"], ["golden", "金"], ["diamond", "钻石"]]) {
  HORSE_ARMOR[mat] = item(`${mat}_horse_armor`, `${name}马铠`, { stack: 1 });
}
var WOLF_ARMOR = item("wolf_armor", "狼铠", {
  stack: 1,
  tool: { kind: "body_armor", tier: 0, speed: 1, durability: WOLF_ARMOR_DURABILITY, damage: 1 }
});
var CARROT_ON_A_STICK = item("carrot_on_a_stick", "胡萝卜钓竿", {
  stack: 1,
  tool: { kind: "carrot_stick", tier: 0, speed: 1, durability: 25, damage: 1 }
});
var GOAT_HORN = item("goat_horn", "山羊角", { stack: 1 });
var RABBIT_FOOT = item("rabbit_foot", "兔子脚");
var POISONOUS_POTATO = item("poisonous_potato", "毒马铃薯", {
  food: { hunger: 2, saturation: 1.2, effects: [[EFFECT_POISON, 5, 0, 0.6]] }
});
var ENCHANTED_GOLDEN_APPLE = item("enchanted_golden_apple", "附魔金苹果", {
  food: {
    hunger: 4,
    saturation: 9.6,
    always: true,
    effects: [[EFFECT_REGENERATION, 20, 1, 1], [EFFECT_ABSORPTION, 120, 3, 1], [EFFECT_RESISTANCE, 300, 0, 1], [EFFECT_FIRE_RESISTANCE, 300, 0, 1]]
  }
});
var HEART_OF_THE_SEA = item("heart_of_the_sea", "海洋之心");
var NAUTILUS_SHELL = item("nautilus_shell", "鹦鹉螺壳");
var FIREWORK_ROCKET = item("firework_rocket", "烟花火箭");
var FIREWORK_STAR = item("firework_star", "烟花之星");
var ENCHANTED_BOOK = item("enchanted_book", "附魔书", { stack: 1 });
var EXPERIENCE_BOTTLE = item("experience_bottle", "附魔之瓶");
var POTION = item("potion", "药水", { stack: 1, drink: true });
var SPLASH_POTION = item("splash_potion", "喷溅药水", { stack: 1 });
var LINGERING_POTION = item("lingering_potion", "滞留药水", { stack: 1 });
var TIPPED_ARROW = item("tipped_arrow", "药箭");
var FERMENTED_SPIDER_EYE = item("fermented_spider_eye", "发酵蜘蛛眼");
var GLOWSTONE_DUST = item("glowstone_dust", "荧石粉");
var NETHER_WART = item("nether_wart", "下界疣", { block: NETHER_WART_CROP });
var BLAZE_ROD = item("blaze_rod", "烈焰棒", { fuel: 120 });
var BLAZE_POWDER = item("blaze_powder", "烈焰粉");
var MAGMA_CREAM = item("magma_cream", "岩浆膏");
var GHAST_TEAR = item("ghast_tear", "恶魂之泪");
var DRAGON_BREATH = item("dragon_breath", "龙息");
ITEMS[BREWING_STAND].sprite = "brewing_stand";
var BOAT_NAMES = [
  ["oak", "橡木"],
  ["spruce", "云杉"],
  ["birch", "白桦"],
  ["jungle", "丛林"],
  ["acacia", "金合欢"],
  ["dark_oak", "深色橡木"],
  ["mangrove", "红树"],
  ["cherry", "樱花木"],
  ["pale_oak", "苍白橡木"],
  ["bamboo", "竹"]
];
var BOAT_ITEMS = {};
var CHEST_BOAT_ITEMS = {};
for (const [wood, name] of BOAT_NAMES) {
  const raft = wood === "bamboo";
  BOAT_ITEMS[wood] = item(raft ? "bamboo_raft" : `${wood}_boat`, raft ? "竹筏" : `${name}船`, { stack: 1, fuel: 60 });
  CHEST_BOAT_ITEMS[wood] = item(raft ? "bamboo_chest_raft" : `${wood}_chest_boat`, raft ? "竹运输筏" : `${name}运输船`, { stack: 1 });
}
var MINECART = item("minecart", "矿车", { stack: 1 });
var CHEST_MINECART = item("chest_minecart", "运输矿车", { stack: 1 });
var FURNACE_MINECART = item("furnace_minecart", "动力矿车", { stack: 1 });
ITEMS[REDSTONE].block = REDSTONE_WIRE;
ITEMS[STRING].block = TRIPWIRE;
ITEMS[IRON_DOOR].sprite = "iron_door";
var QUARTZ2 = item("quartz", "下界石英");
ITEMS[HOPPER].sprite = "hopper";
var HOPPER_MINECART = item("hopper_minecart", "漏斗矿车", { stack: 1 });
var TNT_MINECART = item("tnt_minecart", "TNT矿车", { stack: 1 });
for (const e of LATE_SPAWN_EGG_DEFS)
  SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `${e.name}刷怪蛋`);
var ECHO_SHARD = item("echo_shard", "回响碎片");
var RECOVERY_COMPASS = item("recovery_compass", "追溯指针");
var DISC_FRAGMENT_5 = item("disc_fragment_5", "唱片残片");
var MUSIC_DISC_5 = item("music_disc_5", "音乐唱片", { stack: 1 });
MUSIC_DISCS.push(MUSIC_DISC_5);
var NETHER_BRICK = item("nether_brick", "下界砖");
var WARPED_FUNGUS_ON_A_STICK = item("warped_fungus_on_a_stick", "诡异菌钓竿", {
  stack: 1,
  tool: { kind: "carrot_stick", tier: 0, speed: 1, durability: 100, damage: 1 }
});
var FIRE_CHARGE = item("fire_charge", "火焰弹");
var SPECTRAL_ARROW = item("spectral_arrow", "光灵箭");
var MUSIC_DISC_TEARS = item("music_disc_tears", "音乐唱片", { stack: 1 });
MUSIC_DISCS.push(MUSIC_DISC_TEARS);
for (const e of NETHER_SPAWN_EGG_DEFS)
  SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `${e.name}刷怪蛋`);
var MUSIC_DISC_PIGSTEP = item("music_disc_pigstep", "音乐唱片", { stack: 1 });
MUSIC_DISCS.push(MUSIC_DISC_PIGSTEP);
var PIGLIN_BANNER_PATTERN = item("piglin_banner_pattern", "猪鼻旗帜图案", { stack: 1 });
BANNER_PATTERN_ITEMS.piglin = PIGLIN_BANNER_PATTERN;
var NETHERITE_SCRAP = item("netherite_scrap", "下界合金碎片");
var NETHERITE_INGOT = item("netherite_ingot", "下界合金锭");
var NETHERITE_UPGRADE_SMITHING_TEMPLATE = item("netherite_upgrade_smithing_template", "下界合金升级锻造模板");
TOOLS.netherite = {};
for (const [kind, kindName, damage, attackSpeed] of [
  ["sword", "剑", 8, 1.6],
  ["pickaxe", "镐", 6, 1.2],
  ["axe", "斧", 10, 1],
  ["shovel", "锹", 6.5, 1],
  ["hoe", "锄", 1, 4]
]) {
  TOOLS.netherite[kind] = item(`netherite_${kind}`, `下界合金${kindName}`, {
    stack: 1,
    tool: { kind, tier: 4, speed: 9, durability: 2031, damage, attackSpeed }
  });
}
ARMOR[NETHERITE_ARMOR] = {};
ARMOR_PIECES.forEach((piece, slot) => {
  const st = ARMOR_STATS[NETHERITE_ARMOR];
  ARMOR[NETHERITE_ARMOR][piece] = item(`netherite_${piece}`, `下界合金${PIECE_NAMES[slot]}`, {
    stack: 1,
    armor: { slot, material: NETHERITE_ARMOR, points: st.points[slot], toughness: st.toughness, durability: st.durability[slot] }
  });
});
HORSE_ARMOR.netherite = item("netherite_horse_armor", "下界合金马铠", { stack: 1 });
var NETHER_STAR = item("nether_star", "下界之星");
var FIRE_RESISTANT_ITEMS = new Set([
  NETHERITE_SCRAP,
  NETHERITE_INGOT,
  ...Object.values(TOOLS.netherite),
  ...Object.values(ARMOR[NETHERITE_ARMOR]),
  HORSE_ARMOR.netherite
]);
var EXPLOSION_RESISTANT_ITEMS = new Set([NETHER_STAR]);
var CHORUS_FRUIT = item("chorus_fruit", "紫颂果", { food: { hunger: 4, saturation: 2.4, always: true } });
var POPPED_CHORUS_FRUIT = item("popped_chorus_fruit", "爆裂紫颂果");
var ENDER_EYE = item("ender_eye", "末影之眼");
for (const e of END_SPAWN_EGG_DEFS)
  SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `${e.name}刷怪蛋`);
var END_CRYSTAL = item("end_crystal", "末地水晶");
for (const c of SHULKER_BOX_COLORS)
  if (ITEMS[SHULKER_BOXES[c]])
    ITEMS[SHULKER_BOXES[c]].stack = 1;
var SHULKER_SHELL = item("shulker_shell", "潜影壳");
var ELYTRA = item("elytra", "鞘翅", {
  stack: 1,
  armor: { slot: 1, material: ELYTRA_ARMOR, points: 0, toughness: 0, durability: ARMOR_STATS[ELYTRA_ARMOR].durability[1] }
});
for (const e of WITHER_SPAWN_EGG_DEFS)
  SPAWN_EGGS[e.mob] = item(`${e.mob}_spawn_egg`, `${e.name}刷怪蛋`);
var ITEM_COUNT = nextId;
if (ITEM_COUNT > 1024)
  throw new Error("Demasiados objetos: el rango 256..1023 está lleno");
var fuel = (id, s) => {
  if (ITEMS[id])
    ITEMS[id].fuel = s;
};
for (const id of [...ALL_LOGS, ...ALL_PLANKS, CRAFTING_TABLE, BOOKSHELF, CHEST])
  fuel(id, 15);
for (const id of ALL_SAPLINGS)
  fuel(id, 5);
for (const { key: wood } of WOOD_TYPES) {
  for (const id of [FENCES[wood], FENCE_GATES[wood], STAIRS[wood], TRAPDOORS[wood]])
    fuel(id, 15);
  fuel(SLABS[wood], 7.5);
  fuel(DOORS[wood], 10);
}
fuel(LADDER, 15);
for (const id of Object.values(SIGNS))
  fuel(id, 10);
var smelt = (from, to) => {
  if (ITEMS[from])
    ITEMS[from].smelt = to;
};
smelt(SAND, GLASS);
smelt(COBBLESTONE, STONE);
smelt(IRON_ORE, IRON_INGOT);
smelt(GOLD_ORE, GOLD_INGOT);
for (const log of ALL_LOGS)
  smelt(log, CHARCOAL);
smelt(RED_SAND, GLASS);
smelt(COPPER_ORE, COPPER_INGOT);
smelt(DEEPSLATE_ORE[IRON_ORE], IRON_INGOT);
smelt(DEEPSLATE_ORE[GOLD_ORE], GOLD_INGOT);
smelt(DEEPSLATE_ORE[COPPER_ORE], COPPER_INGOT);
smelt(COBBLED_DEEPSLATE, DEEPSLATE);
smelt(CLAY_BALL, BRICK);
smelt(CLAY, TERRACOTTA);
smelt(CACTUS, LIME_WOOL);
smelt(RAW_PORKCHOP, COOKED_PORKCHOP);
smelt(RAW_BEEF, STEAK);
smelt(RAW_CHICKEN, COOKED_CHICKEN);
smelt(RAW_MUTTON, COOKED_MUTTON);
smelt(POTATO, BAKED_POTATO);
smelt(COD, COOKED_COD);
smelt(SALMON, COOKED_SALMON);
smelt(RAW_RABBIT, COOKED_RABBIT);
smelt(RAW_COPPER, COPPER_INGOT);
for (const id of [...Object.values(TOOLS.copper), ...Object.values(ARMOR[COPPER_ARMOR])])
  smelt(id, COPPER_NUGGET);
var ITEM_SPRITES = ITEMS.filter((i) => i && i.sprite).map((i) => i.sprite);
var spriteIndex = new Map;
ITEM_SPRITES.forEach((n, i) => spriteIndex.set(n, i));
var CREATIVE_ITEMS = [
  STICK,
  COAL,
  CHARCOAL,
  IRON_INGOT,
  GOLD_INGOT,
  DIAMOND,
  LAPIS,
  REDSTONE,
  FLINT,
  CLAY_BALL,
  BRICK,
  BONE,
  STRING,
  FEATHER,
  GUNPOWDER,
  LEATHER,
  ROTTEN_FLESH,
  PAPER,
  BOOK,
  ENDER_PEARL,
  APPLE,
  BREAD,
  RAW_PORKCHOP,
  COOKED_PORKCHOP,
  RAW_BEEF,
  STEAK,
  RAW_CHICKEN,
  COOKED_CHICKEN,
  RAW_MUTTON,
  COOKED_MUTTON,
  BUCKET,
  WATER_BUCKET,
  LAVA_BUCKET,
  BOW,
  ARROW,
  SHEARS,
  WHEAT_SEEDS,
  WHEAT,
  CARROT,
  POTATO,
  BAKED_POTATO,
  BEETROOT,
  BEETROOT_SEEDS,
  BONE_MEAL,
  EGG,
  SUGAR,
  MILK_BUCKET,
  ...Object.values(TOOLS).flatMap((t) => Object.values(t)),
  ...Object.values(ARMOR).flatMap((a) => Object.values(a)),
  GOLDEN_APPLE,
  SPIDER_EYE,
  SHIELD,
  PUMPKIN_SEEDS,
  MELON_SEEDS,
  MELON_SLICE,
  PUMPKIN_PIE,
  FISHING_ROD,
  COD,
  COOKED_COD,
  SALMON,
  COOKED_SALMON,
  TROPICAL_FISH,
  PUFFERFISH,
  COPPER_INGOT,
  EMERALD,
  AMETHYST_SHARD,
  GLOW_BERRIES,
  COMPASS,
  EMPTY_MAP,
  SNOWBALL,
  SADDLE,
  SLIME_BALL,
  PHANTOM_MEMBRANE,
  COD_BUCKET,
  SALMON_BUCKET,
  TROPICAL_FISH_BUCKET,
  PUFFERFISH_BUCKET,
  AXOLOTL_BUCKET,
  TADPOLE_BUCKET,
  GLASS_BOTTLE,
  HONEY_BOTTLE,
  HONEYCOMB,
  RAW_RABBIT,
  COOKED_RABBIT,
  RABBIT_HIDE,
  ARMADILLO_SCUTE,
  BRUSH,
  OMINOUS_BOTTLE,
  TOTEM_OF_UNDYING,
  ...DYE_COLORS.map((c) => DYES[c]),
  RAW_COPPER,
  COPPER_NUGGET,
  BOWL,
  IRON_NUGGET,
  GOLD_NUGGET,
  COCOA_BEANS,
  COOKIE,
  MUSHROOM_STEW,
  RABBIT_STEW,
  BEETROOT_SOUP,
  SUSPICIOUS_STEW,
  GOLDEN_CARROT,
  GLISTERING_MELON_SLICE,
  SPYGLASS,
  CLOCK,
  PAINTING,
  ITEM_FRAME,
  ...Object.values(SPAWN_EGGS),
  DRIED_KELP,
  SWEET_BERRIES,
  PRISMARINE_SHARD,
  PRISMARINE_CRYSTALS,
  INK_SAC,
  NAME_TAG,
  LEAD,
  BUNDLE,
  ...DYE_COLORS.map((c) => DYED_BUNDLES[c]),
  ARMOR_STAND,
  WRITABLE_BOOK,
  ...Object.values(BANNER_PATTERN_ITEMS),
  GLOW_INK_SAC,
  GLOW_ITEM_FRAME,
  ...MUSIC_DISCS
];
CREATIVE_ITEMS.push(FLINT_AND_STEEL, CROSSBOW, TRIDENT, TURTLE_SCUTE, TURTLE_HELMET, ...Object.values(HORSE_ARMOR), WOLF_ARMOR, CARROT_ON_A_STICK, GOAT_HORN, RABBIT_FOOT, POISONOUS_POTATO, ENCHANTED_GOLDEN_APPLE, HEART_OF_THE_SEA, NAUTILUS_SHELL, FIREWORK_ROCKET, FIREWORK_STAR);
var PLACEABLE_BLOCKS = new Set(ITEMS.filter((i) => i && i.block !== undefined && !i.tool).map((i) => i.block));
fuel(BAMBOO, 2.5);
for (const id of [BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_MOSAIC, STAIRS.bamboo_mosaic])
  fuel(id, 15);
fuel(SLABS.bamboo_mosaic, 7.5);
for (const id of [FENCES.bamboo, FENCE_GATES.bamboo, STAIRS.bamboo, TRAPDOORS.bamboo])
  fuel(id, 15);
fuel(SLABS.bamboo, 7.5);
fuel(DOORS.bamboo, 10);
smelt(CACTUS, DYES.green);
for (const c of DYE_COLORS)
  smelt(COLORED_TERRACOTTA[c], GLAZED_TERRACOTTA[c]);
smelt(STONE, SMOOTH_STONE);
smelt(STONE_BRICKS, CRACKED_STONE_BRICKS);
smelt(DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS);
smelt(DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES);
smelt(SANDSTONE, SMOOTH_SANDSTONE);
smelt(RED_SANDSTONE, SMOOTH_RED_SANDSTONE);
smelt(RAW_IRON, IRON_INGOT);
smelt(RAW_GOLD, GOLD_INGOT);
for (const [ore, out] of [[COAL_ORE, COAL], [DIAMOND_ORE, DIAMOND], [EMERALD_ORE, EMERALD], [LAPIS_ORE, LAPIS], [REDSTONE_ORE, REDSTONE]]) {
  smelt(ore, out);
  smelt(DEEPSLATE_ORE[ore], out);
}
for (const id of [...Object.values(TOOLS.iron), ...Object.values(ARMOR.iron), ...Object.values(ARMOR.chainmail), HORSE_ARMOR.iron])
  smelt(id, IRON_NUGGET);
for (const id of [...Object.values(TOOLS.golden), ...Object.values(ARMOR.golden), HORSE_ARMOR.golden])
  smelt(id, GOLD_NUGGET);
smelt(SEA_PICKLE, DYES.lime);
fuel(COAL_BLOCK, 800);
BREED_FOOD.frog = [SLIME_BALL];
Object.assign(BREED_FOOD, { ocelot: [COD, SALMON], mooshroom: [WHEAT], trader_llama: [HAY_BALE] });
CREATIVE_ITEMS.push(RAW_IRON, RAW_GOLD, POWDER_SNOW_BUCKET);
CREATIVE_ITEMS.push(FERMENTED_SPIDER_EYE, GLOWSTONE_DUST, NETHER_WART, BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, GHAST_TEAR, DRAGON_BREATH);
CREATIVE_ITEMS.push(...Object.values(BOAT_ITEMS).flatMap((b, i) => [b, Object.values(CHEST_BOAT_ITEMS)[i]]), MINECART, CHEST_MINECART, FURNACE_MINECART);
CREATIVE_ITEMS.push(EXPERIENCE_BOTTLE);
CREATIVE_ITEMS.push(QUARTZ2);
CREATIVE_ITEMS.push(HOPPER_MINECART, TNT_MINECART);
CREATIVE_ITEMS.push(...LATE_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));
CREATIVE_ITEMS.push(ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5);
smelt(NETHER_QUARTZ_ORE, QUARTZ2);
smelt(NETHER_GOLD_ORE, GOLD_INGOT);
for (const it of ITEMS)
  if (it && isNetherWood(it.key))
    delete it.fuel;
smelt(NETHERRACK, NETHER_BRICK);
smelt(NETHER_BRICKS, CRACKED_NETHER_BRICKS);
smelt(POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS);
smelt(BASALT, SMOOTH_BASALT);
CREATIVE_ITEMS.push(NETHER_BRICK);
Object.assign(BREED_FOOD, { strider: [WARPED_FUNGUS], hoglin: [CRIMSON_FUNGUS] });
CREATIVE_ITEMS.push(WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, MUSIC_DISC_TEARS, ...NETHER_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));
CREATIVE_ITEMS.push(MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN);
smelt(ANCIENT_DEBRIS, NETHERITE_SCRAP);
smelt(QUARTZ_BLOCK, SMOOTH_QUARTZ);
CREATIVE_ITEMS.push(NETHERITE_SCRAP, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE, ...Object.values(TOOLS.netherite), ...Object.values(ARMOR[NETHERITE_ARMOR]), HORSE_ARMOR.netherite, NETHER_STAR);
smelt(CHORUS_FRUIT, POPPED_CHORUS_FRUIT);
CREATIVE_ITEMS.push(CHORUS_FRUIT, POPPED_CHORUS_FRUIT, ENDER_EYE, END_CRYSTAL, ELYTRA, SHULKER_SHELL, ...END_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));
CREATIVE_ITEMS.push(...WITHER_SPAWN_EGG_DEFS.map((e) => SPAWN_EGGS[e.mob]));

// goodPG/src/shared/aquaticMobs.ts
var MOB_COD = 30;
var MOB_SALMON = 31;
var MOB_TROPICAL_FISH = 32;
var MOB_PUFFERFISH = 33;
var MOB_DOLPHIN = 34;
var MOB_TURTLE = 35;
var MOB_AXOLOTL = 36;
var MOB_FROG = 37;
var WARM_FROG_BIOMES = new Set([
  BIOME_DESERT,
  BIOME_WARM_OCEAN,
  BIOME_JUNGLE,
  BIOME_SPARSE_JUNGLE,
  BIOME_BAMBOO_JUNGLE,
  BIOME_SAVANNA,
  BIOME_SAVANNA_PLATEAU,
  BIOME_WINDSWEPT_SAVANNA,
  BIOME_BADLANDS,
  BIOME_ERODED_BADLANDS,
  BIOME_WOODED_BADLANDS,
  BIOME_MANGROVE_SWAMP,
  BIOME_NETHER_WASTES,
  BIOME_SOUL_SAND_VALLEY,
  BIOME_CRIMSON_FOREST,
  BIOME_WARPED_FOREST,
  BIOME_BASALT_DELTAS
]);
var COLD_FROG_BIOMES = new Set([
  BIOME_SNOWY_PLAINS,
  BIOME_ICE_SPIKES,
  BIOME_FROZEN_PEAKS,
  BIOME_JAGGED_PEAKS,
  BIOME_SNOWY_PEAKS,
  BIOME_FROZEN_OCEAN,
  BIOME_DEEP_FROZEN_OCEAN,
  BIOME_GROVE,
  BIOME_FROZEN_RIVER,
  BIOME_SNOWY,
  BIOME_SNOWY_BEACH,
  BIOME_THE_END,
  BIOME_END_HIGHLANDS,
  BIOME_END_MIDLANDS,
  BIOME_SMALL_END_ISLANDS,
  BIOME_END_BARRENS
]);
var MOB_TADPOLE = 38;
var MOB_GLOW_SQUID = 39;
var MOB_BUCKETS = {
  [MOB_COD]: COD_BUCKET,
  [MOB_SALMON]: SALMON_BUCKET,
  [MOB_TROPICAL_FISH]: TROPICAL_FISH_BUCKET,
  [MOB_PUFFERFISH]: PUFFERFISH_BUCKET,
  [MOB_AXOLOTL]: AXOLOTL_BUCKET,
  [MOB_TADPOLE]: TADPOLE_BUCKET
};
function packParts(W, specs) {
  const parts = [];
  const byName = new Map;
  let x = 0, y = 0, shelf = 0;
  for (const s of specs) {
    const { share, ...rest } = s;
    let uv;
    if (share) {
      const o = byName.get(share);
      if (!o)
        throw new Error(`Parte compartida desconocida: ${share}`);
      uv = [o.uv[0], o.uv[1]];
    } else {
      const [w, h, d] = s.size.map((v) => Math.ceil(v));
      const rw = 2 * (d + w), rh = d + h;
      if (rw > W)
        throw new Error(`Parte ${s.name} más ancha que el atlas`);
      if (x + rw > W) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      uv = [x, y];
      x += rw;
      shelf = Math.max(shelf, rh);
    }
    const p = { ...rest, uv };
    parts.push(p);
    byName.set(p.name, p);
  }
  let H = 16;
  while (H < y + shelf)
    H *= 2;
  return { parts, atlas: [W, H] };
}
function model(base, W, specs) {
  const { parts, atlas } = packParts(W, specs);
  return { ...base, parts, atlas };
}
function fishSpecs(o) {
  const y = o.y ?? 0;
  const half = Math.floor(o.len / 2);
  return [
    { name: "body", pivot: [0, y, 0], from: [-o.w / 2, 0, -half], size: [o.w, o.h, o.len] },
    { name: "head", parent: "body", pivot: [0, 0, -half], from: [-o.w / 2, 0.5, -o.head], size: [o.w, o.h - 1, o.head] },
    { name: "nose", parent: "head", pivot: [0, 0, -o.head], from: [-o.w / 2 + 0.5, 1, -1], size: [Math.max(1, o.w - 1), Math.max(1, o.h - 3), 1] },
    { name: "finTop", parent: "body", pivot: [0, o.h, -1], from: [-0.5, 0, 0], size: [1, o.fin, Math.max(2, half)] },
    { name: "finR", parent: "body", pivot: [o.w / 2, 1, -half + 2], from: [0, 0, 0], size: [2, 1, 2], rot: [0, -0.5, 0.5] },
    { name: "finL", parent: "body", pivot: [-o.w / 2, 1, -half + 2], from: [-2, 0, 0], size: [2, 1, 2], rot: [0, 0.5, -0.5], share: "finR" },
    { name: "tail", parent: "body", pivot: [0, o.h / 2, o.len - half], from: [-0.5, -o.tail / 2, 0], size: [1, o.tail, o.tail] }
  ];
}
function tentacles() {
  const t = [];
  for (let i = 0;i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    t.push({ name: `tent${i}`, parent: "body", pivot: [Math.cos(a) * 5, -8, Math.sin(a) * 5], from: [-1, -18, -1], size: [2, 18, 2], share: i ? "tent0" : undefined });
  }
  return t;
}
function spikes() {
  const s = [];
  const spots = [
    [-3, 8, -3, -0.5, 0, 0.5],
    [3, 8, -3, -0.5, 0, -0.5],
    [-3, 8, 3, 0.5, 0, 0.5],
    [3, 8, 3, 0.5, 0, -0.5],
    [-4, 4, 0, 0, 0, 1.2],
    [4, 4, 0, 0, 0, -1.2],
    [0, 0, -4, -1.8, 0, 0],
    [0, 0, 4, 1.8, 0, 0],
    [-4, 1, -4, -1, 0, 1],
    [4, 1, 4, 1, 0, -1],
    [0, 8, 0, 0, 0, 0],
    [0, 4, -4, -1.57, 0, 0]
  ];
  spots.forEach(([x, y, z, rx, ry, rz], i) => {
    s.push({ name: `spike${i}`, parent: "body", pivot: [x, y, z], from: [-0.5, 0, -0.5], size: [1, 2, 1], rot: [rx, ry, rz], share: i ? "spike0" : undefined });
  });
  return s;
}
var common = { hostile: false, burnsInSun: false, damage: 0 };
var AQUATIC_MOBS = [
  model({ ...common, id: MOB_COD, key: "cod", name: "鳕鱼", health: 3, walk: 1.4, run: 3.2, width: 0.5, height: 0.3, drops: [[COD, 1, 1]], anim: "fish", scale: 0.75 }, 32, fishSpecs({ w: 2, h: 4, len: 7, head: 3, fin: 1, tail: 4 })),
  model({ ...common, id: MOB_SALMON, key: "salmon", name: "鲑鱼", health: 3, walk: 1.6, run: 3.6, width: 0.6, height: 0.4, drops: [[SALMON, 1, 1]], anim: "fish", scale: 0.8 }, 32, fishSpecs({ w: 3, h: 5, len: 8, head: 3, fin: 2, tail: 5 })),
  model({ ...common, id: MOB_TROPICAL_FISH, key: "tropical_fish", name: "热带鱼", health: 3, walk: 1.3, run: 3.2, width: 0.5, height: 0.4, drops: [[TROPICAL_FISH, 1, 1]], anim: "fish", scale: 0.7 }, 32, [
    { name: "body", pivot: [0, 1, 0], from: [-1, 0, -3], size: [2, 5, 6] },
    { name: "finTop", parent: "body", pivot: [0, 5, -2], from: [-0.5, 0, 0], size: [1, 3, 4] },
    { name: "finBottom", parent: "body", pivot: [0, 0, -1], from: [-0.5, -1, 0], size: [1, 1, 3] },
    { name: "finR", parent: "body", pivot: [1, 2, -1], from: [0, 0, 0], size: [2, 1, 2], rot: [0, -0.5, 0.5] },
    { name: "finL", parent: "body", pivot: [-1, 2, -1], from: [-2, 0, 0], size: [2, 1, 2], rot: [0, 0.5, -0.5], share: "finR" },
    { name: "tail", parent: "body", pivot: [0, 2.5, 3], from: [-0.5, -2.5, 0], size: [1, 5, 3] }
  ]),
  model({ ...common, id: MOB_PUFFERFISH, key: "pufferfish", name: "河豚", health: 3, walk: 1.1, run: 2.4, width: 0.6, height: 0.6, drops: [[PUFFERFISH, 1, 1]], anim: "puffer", scale: 0.8 }, 64, [
    { name: "body", pivot: [0, 0, 0], from: [-4, 0, -4], size: [8, 8, 8] },
    { name: "finR", parent: "body", pivot: [4, 4, -2], from: [0, -1, 0], size: [1, 3, 3] },
    { name: "finL", parent: "body", pivot: [-4, 4, -2], from: [-1, -1, 0], size: [1, 3, 3], share: "finR" },
    { name: "finTop", parent: "body", pivot: [0, 8, 1], from: [-0.5, 0, 0], size: [1, 2, 3] },
    { name: "tail", parent: "body", pivot: [0, 4, 4], from: [-0.5, -2, 0], size: [1, 4, 3] },
    ...spikes()
  ]),
  model({ ...common, id: MOB_DOLPHIN, key: "dolphin", name: "海豚", health: 10, walk: 2.6, run: 6, width: 0.9, height: 0.6, damage: 3, neutral: true, drops: [[COD, 0, 1]], anim: "dolphin", scale: 0.8 }, 64, [
    { name: "body", pivot: [0, 0, 0], from: [-4, 0, -6], size: [8, 7, 13] },
    { name: "head", parent: "body", pivot: [0, 0, -6], from: [-4, 0, -6], size: [8, 7, 6] },
    { name: "nose", parent: "head", pivot: [0, 0, -6], from: [-1, 0, -4], size: [2, 2, 4] },
    { name: "finTop", parent: "body", pivot: [0, 7, 1], from: [-0.5, 0, 0], size: [1, 4, 5], rot: [0.5, 0, 0] },
    { name: "finR", parent: "body", pivot: [4, 1, -3], from: [0, 0, -1], size: [6, 1, 4], rot: [0, 0.3, 0.6] },
    { name: "finL", parent: "body", pivot: [-4, 1, -3], from: [-6, 0, -1], size: [6, 1, 4], rot: [0, -0.3, -0.6], share: "finR" },
    { name: "tail", parent: "body", pivot: [0, 1, 7], from: [-2, 0, 0], size: [4, 5, 11] },
    { name: "tailFin", parent: "tail", pivot: [0, 2, 10], from: [-5, 0, 0], size: [10, 1, 6] }
  ]),
  model({ ...common, id: MOB_TURTLE, key: "turtle", name: "海龟", health: 30, walk: 0.7, run: 1.4, width: 1.2, height: 0.4, drops: [], anim: "turtle", scale: 1 }, 128, [
    { name: "body", pivot: [0, 2, 0], from: [-8, 0, -9], size: [16, 5, 18] },
    { name: "belly", parent: "body", pivot: [0, 0, 0], from: [-7, -1, -8], size: [14, 1, 16] },
    { name: "head", pivot: [0, 3, -9], from: [-3, -1, -6], size: [6, 5, 6] },
    { name: "legFR", pivot: [7, 3, -6], from: [0, -1, -2], size: [8, 1, 4], rot: [0, 0.3, 0] },
    { name: "legFL", pivot: [-7, 3, -6], from: [-8, -1, -2], size: [8, 1, 4], rot: [0, -0.3, 0], share: "legFR" },
    { name: "legBR", pivot: [5, 2, 8], from: [-2, -1, 0], size: [4, 1, 6] },
    { name: "legBL", pivot: [-5, 2, 8], from: [-2, -1, 0], size: [4, 1, 6], share: "legBR" }
  ]),
  model({ ...common, id: MOB_AXOLOTL, key: "axolotl", name: "美西螈", health: 14, walk: 0.6, run: 2.4, width: 0.75, height: 0.42, damage: 2, drops: [], anim: "axolotl", scale: 1 }, 64, [
    { name: "body", pivot: [0, 2, 0], from: [-4, 0, -5], size: [8, 4, 10] },
    { name: "head", parent: "body", pivot: [0, 0, -5], from: [-4, 0, -5], size: [8, 5, 5] },
    { name: "gillTop", parent: "head", pivot: [0, 5, -2], from: [-4, 0, 0], size: [8, 3, 1] },
    { name: "gillR", parent: "head", pivot: [4, 0, -2], from: [0, 0, 0], size: [3, 7, 1], rot: [0, -0.3, 0] },
    { name: "gillL", parent: "head", pivot: [-4, 0, -2], from: [-3, 0, 0], size: [3, 7, 1], rot: [0, 0.3, 0], share: "gillR" },
    { name: "legFR", parent: "body", pivot: [4, 1, -3], from: [0, -3, -1], size: [2, 3, 2] },
    { name: "legFL", parent: "body", pivot: [-4, 1, -3], from: [-2, -3, -1], size: [2, 3, 2], share: "legFR" },
    { name: "legBR", parent: "body", pivot: [4, 1, 3], from: [0, -3, -1], size: [2, 3, 2], share: "legFR" },
    { name: "legBL", parent: "body", pivot: [-4, 1, 3], from: [-2, -3, -1], size: [2, 3, 2], share: "legFR" },
    { name: "tail", parent: "body", pivot: [0, 0, 5], from: [-0.5, 0, 0], size: [1, 4, 9] }
  ]),
  model({ ...common, id: MOB_FROG, key: "frog", name: "青蛙", health: 10, walk: 1.4, run: 2.8, width: 0.5, height: 0.5, drops: [], anim: "frog", scale: 1 }, 64, [
    { name: "body", pivot: [0, 1, 0], from: [-3.5, 0, -4], size: [7, 3, 8] },
    { name: "head", parent: "body", pivot: [0, 3, 2], from: [-3.5, 0, -7], size: [7, 2, 7] },
    { name: "eyeR", parent: "head", pivot: [0, 2, -5], from: [0.5, 0, -1], size: [3, 2, 3] },
    { name: "eyeL", parent: "head", pivot: [0, 2, -5], from: [-3.5, 0, -1], size: [3, 2, 3], share: "eyeR" },
    { name: "armR", pivot: [3, 2, -3], from: [-1, -2, -1], size: [2, 2, 2] },
    { name: "armL", pivot: [-3, 2, -3], from: [-1, -2, -1], size: [2, 2, 2], share: "armR" },
    { name: "legR", pivot: [3.5, 2, 2], from: [-1, -2, -2], size: [3, 2, 5] },
    { name: "legL", pivot: [-3.5, 2, 2], from: [-2, -2, -2], size: [3, 2, 5], share: "legR" },
    { name: "tongue", parent: "body", pivot: [0, 3.1, -4], from: [-2, 0, -7], size: [4, 0.01, 7] }
  ]),
  model({ ...common, id: MOB_TADPOLE, key: "tadpole", name: "蝌蚪", health: 6, walk: 1, run: 2.2, width: 0.4, height: 0.3, drops: [], anim: "tadpole", scale: 1 }, 32, [
    { name: "body", pivot: [0, 0, 0], from: [-1.5, 0, -2], size: [3, 2, 3] },
    { name: "tail", parent: "body", pivot: [0, 1, 1], from: [-0.5, -1, 0], size: [1, 2, 5] }
  ]),
  model({ ...common, id: MOB_GLOW_SQUID, key: "glow_squid", name: "发光鱿鱼", health: 10, walk: 1.2, run: 2.5, width: 0.8, height: 0.8, drops: [[GLOW_INK_SAC, 1, 3]], anim: "squid", scale: 0.8, aquatic: true }, 64, [{ name: "body", pivot: [0, 18, 0], from: [-6, -8, -6], size: [12, 16, 12] }, ...tentacles()])
];

// goodPG/src/shared/allay.ts
var MOB_ALLAY = 76;
var EF_ALLAY_DANCING = 1 << 19;
var ALLAY_DEF = (() => {
  const { parts, atlas } = packParts(32, [
    { name: "body", pivot: [0, 6, 0], from: [-1.5, -5, -1], size: [3, 5, 2] },
    { name: "head", pivot: [0, 6, 0], from: [-2.5, 0, -2.5], size: [5, 5, 5] },
    { name: "armR", pivot: [1.75, 5.75, 0], from: [-0.5, -4, -1], size: [1, 4, 2] },
    { name: "armL", pivot: [-1.75, 5.75, 0], from: [-0.5, -4, -1], size: [1, 4, 2], share: "armR" },
    { name: "wingR", pivot: [0.5, 5.5, 1], from: [0, -5, 0], size: [0, 5, 8], rot: [0, 0.35, 0] },
    { name: "wingL", pivot: [-0.5, 5.5, 1], from: [0, -5, 0], size: [0, 5, 8], rot: [0, -0.35, 0], share: "wingR" }
  ]);
  return {
    id: MOB_ALLAY,
    key: "allay",
    name: "悦灵",
    hostile: false,
    health: 20,
    walk: 3.2,
    run: 5.5,
    width: 0.35,
    height: 0.6,
    damage: 0,
    burnsInSun: false,
    drops: [],
    anim: "allay",
    scale: 1,
    flying: true,
    parts,
    atlas
  };
})();

// goodPG/src/shared/world/outposts.ts
var OUTPOST_RADIUS = 13;
var OUTPOST_VILLAGE_GAP = 160;
var OUTPOST_DECK = 15;
function outpostCandidate(biome, x, z, seed) {
  return isVillageBiome(biome) && hash2(x, z, seed ^ 369607) % 3 === 0;
}
function buildOutpost(c, s) {
  const { x: ox, y: oy, z: oz } = s;
  const rnd = mulberry32(s.rng);
  const R = OUTPOST_RADIUS;
  if (ox + R < c.x0 || ox - R > c.x0 + 15 || oz + R < c.z0 || oz - R > c.z0 + 15)
    return;
  const fence = FENCES.dark_oak;
  const slab = stateOf(SLABS.dark_oak, { type: 0 });
  for (let dz = -4;dz <= 4; dz++) {
    for (let dx = -4;dx <= 4; dx++) {
      const x = ox + dx, z = oz + dz;
      const id = rnd() < 0.2 ? MOSSY_COBBLESTONE : COBBLESTONE;
      c.set(x, oy, z, id);
      c.foundation(x, oy - 1, z, COBBLESTONE);
      c.clearAbove(x, oy + 1, z, OUTPOST_DECK + 6);
    }
  }
  const top = oy + OUTPOST_DECK - 1;
  for (let y = oy + 1;y <= top; y++) {
    for (let dz = -3;dz <= 3; dz++) {
      for (let dx = -3;dx <= 3; dx++) {
        const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        const corner = Math.abs(dx) === 3 && Math.abs(dz) === 3;
        const floor = (y - oy) % 5 === 0;
        let id = AIR;
        if (corner)
          id = DARK_OAK_LOG;
        else if (edge)
          id = floor ? DARK_OAK_PLANKS : BIRCH_PLANKS;
        else if (floor)
          id = DARK_OAK_PLANKS;
        c.set(ox + dx, y, oz + dz, id);
      }
    }
    if ((y - oy) % 5 === 2 || (y - oy) % 5 === 3) {
      for (const [dx, dz] of [[0, -3], [0, 3], [-3, 0], [3, 0]])
        c.set(ox + dx, y, oz + dz, AIR);
    }
  }
  c.set(ox, oy + 1, oz - 3, AIR);
  c.set(ox, oy + 2, oz - 3, AIR);
  for (let y = oy + 1;y <= oy + OUTPOST_DECK; y++)
    c.set(ox, y, oz + 2, stateOf(LADDER, { facing: 0 }));
  const deck = oy + OUTPOST_DECK;
  for (let dz = -4;dz <= 4; dz++) {
    for (let dx = -4;dx <= 4; dx++) {
      if (!(dx === 0 && dz === 2))
        c.set(ox + dx, deck, oz + dz, DARK_OAK_PLANKS);
      const rim = Math.abs(dx) === 4 || Math.abs(dz) === 4;
      const post = Math.abs(dx) === 4 && Math.abs(dz) === 4;
      for (let y = deck + 1;y <= deck + 4; y++)
        c.set(ox + dx, y, oz + dz, AIR);
      if (post)
        for (let y = deck + 1;y <= deck + 3; y++)
          c.set(ox + dx, y, oz + dz, DARK_OAK_LOG);
      else if (rim)
        c.set(ox + dx, deck + 1, oz + dz, fence);
      c.set(ox + dx, deck + 4, oz + dz, rim ? slab : DARK_OAK_PLANKS);
    }
  }
  c.set(ox, deck + 1, oz + 2, stateOf(LADDER, { facing: 0 }));
  c.chest(ox - 2, deck + 1, oz - 2, 2, "pillager_outpost");
  c.set(ox + 2, deck + 1, oz - 3, TORCH);
  c.set(ox - 2, deck + 1, oz + 3, TORCH);
  const spots = [[8, -2], [-8, 3], [3, 9], [-4, -9], [9, 7], [-9, -7]];
  for (let i = 0;i < spots.length; i++) {
    const [dx, dz] = spots[i];
    const x = ox + dx, z = oz + dz;
    const g = ground(c, x, z, oy);
    if (g === null)
      continue;
    const kind = (i + Math.floor(rnd() * 3)) % 4;
    if (kind === 0)
      tent(c, x, g + 1, z, dx > 0);
    else if (kind === 1) {
      for (let k = 0;k < 3; k++)
        c.set(x + k, g + 1, z, DARK_OAK_LOG);
      c.set(x + 1, g + 2, z, DARK_OAK_LOG);
    } else if (kind === 2) {
      c.set(x, g + 1, z, HAY_BALE);
      c.set(x + 1, g + 1, z, HAY_BALE);
      c.set(x, g + 2, z, HAY_BALE);
    } else {
      c.set(x, g + 1, z, fence);
      c.set(x, g + 2, z, CARVED_PUMPKIN);
    }
  }
  const cr = mulberry32(s.rng ^ 659879);
  if (cr() < 0.5) {
    const [dx, dz] = cr() < 0.5 ? [-9, 9] : [9, -9];
    cage(c, ox + dx, oz + dz, oy, 1 + Math.floor(cr() * 3));
  }
}
function cage(c, x, z, oy, n) {
  const g = oy;
  const fence = FENCES.dark_oak;
  for (let dz = -2;dz <= 2; dz++) {
    for (let dx = -2;dx <= 2; dx++) {
      const px = x + dx, pz = z + dz;
      c.foundation(px, g - 1, pz, COBBLESTONE);
      c.set(px, g, pz, DARK_OAK_PLANKS);
      c.clearAbove(px, g + 1, pz, 6);
      const rim = Math.abs(dx) === 2 || Math.abs(dz) === 2;
      const post = Math.abs(dx) === 2 && Math.abs(dz) === 2;
      for (let y = g + 1;y <= g + 3; y++)
        c.set(px, y, pz, post ? DARK_OAK_LOG : rim ? fence : AIR);
      c.set(px, g + 4, pz, stateOf(SLABS.dark_oak, { type: 0 }));
    }
  }
  for (let k = 0;k < n; k++)
    c.mob?.(MOB_ALLAY, x + 0.5 + (k - 1) * 0.6, g + 1.5, z + 0.5);
}
function tent(c, x, y, z, alongX) {
  for (let k = -1;k <= 1; k++) {
    const [ax, az] = alongX ? [x + k, z] : [x, z + k];
    const [lx, lz, rx, rz] = alongX ? [ax, az - 1, ax, az + 1] : [ax - 1, az, ax + 1, az];
    c.set(lx, y, lz, WHITE_WOOL);
    c.set(rx, y, rz, WHITE_WOOL);
    c.set(ax, y + 1, az, WHITE_WOOL);
  }
  const [ex, ez] = alongX ? [x + 2, z] : [x, z + 2];
  c.set(ex, y, ez, FENCES.dark_oak);
}
function ground(c, x, z, ref) {
  for (let y = ref + 6;y >= ref - 8; y--) {
    const b = c.get(x, y, z);
    if (b < 0)
      return null;
    if (b !== AIR && BLOCK_OPAQUE[b] && !BLOCK_FLUID[b])
      return y;
  }
  return null;
}

// goodPG/src/shared/world/deepDark.ts
var DEEP_DARK_TOP = 0;
var STATES = new WeakMap;
function stateOf22(gen) {
  let s = STATES.get(gen);
  if (!s) {
    s = { patch: new Simplex(gen.seed ^ 57069), cover: new Simplex(gen.seed ^ 376860), grid: new Map };
    STATES.set(gen, s);
  }
  return s;
}
var tmpInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
function mountAt(gen, s, gx, gz) {
  const k = (gx + 131072) * 262144 + (gz + 131072);
  let m = s.grid.get(k);
  if (m === undefined) {
    if (s.grid.size > 20000)
      s.grid.clear();
    m = gen.columnInfo(gx * 16, gz * 16, tmpInfo).mount;
    s.grid.set(k, m);
  }
  return m;
}
function deepDarkWeight(gen, x, z) {
  const s = stateOf22(gen);
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  const fx = (x - gx * 16) / 16, fz = (z - gz * 16) / 16;
  const a = mountAt(gen, s, gx, gz), b = mountAt(gen, s, gx + 1, gz);
  const c = mountAt(gen, s, gx, gz + 1), d = mountAt(gen, s, gx + 1, gz + 1);
  const mount = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
  return mount - 0.62 + 0.2 * s.patch.noise2(x / 260, z / 260);
}
function deepDarkColumn(gen, x, z) {
  return deepDarkWeight(gen, x, z) > 0;
}
function isDeepDark(gen, x, y, z) {
  return y <= DEEP_DARK_TOP && deepDarkColumn(gen, x, z);
}
var DX2 = [1, -1, 0, 0, 0, 0];
var DY = [0, 0, 1, -1, 0, 0];
var DZ2 = [0, 0, 0, 0, 1, -1];
function decorateDeepDark(gen, blocks, x0, z0) {
  const mask = new Uint8Array(256);
  let any = false;
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      if (!deepDarkColumn(gen, x0 + lx, z0 + lz))
        continue;
      mask[lz * 16 + lx] = 1;
      any = true;
    }
  }
  if (!any)
    return;
  const s = stateOf22(gen);
  const seed = gen.seed;
  const y0 = MIN_Y + 6, y1 = DEEP_DARK_TOP;
  const get = (lx, y, lz) => lx < 0 || lx > 15 || lz < 0 || lz > 15 || y <= MIN_Y || y > y1 + 1 ? -1 : blocks[blockIndex(lx, y, lz)];
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      if (!mask[lz * 16 + lx])
        continue;
      const wx = x0 + lx, wz = z0 + lz;
      for (let y = y0;y <= y1; y++) {
        const i = blockIndex(lx, y, lz);
        if (!sculkReplaceable(blocks[i]))
          continue;
        let open = false;
        for (let f = 0;f < 6 && !open; f++)
          open = get(lx + DX2[f], y + DY[f], lz + DZ2[f]) === AIR;
        if (!open)
          continue;
        const n = s.cover.noise3(wx / 13, y / 9, wz / 13);
        if (n > -0.32)
          blocks[i] = SCULK;
      }
    }
  }
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      if (!mask[lz * 16 + lx])
        continue;
      const wx = x0 + lx, wz = z0 + lz;
      for (let y = y0;y <= y1; y++) {
        const i = blockIndex(lx, y, lz);
        if (blocks[i] !== AIR)
          continue;
        const h = hash3(wx, y, wz, seed ^ 14604924);
        const below = get(lx, y - 1, lz);
        if (below === SCULK) {
          const r = h % 7600;
          if (r < 190) {
            blocks[i] = stateOf(SCULK_SENSOR, { phase: 0, water: 0 });
            continue;
          }
          if (r < 230) {
            blocks[i] = shriekerFor(true);
            continue;
          }
          if (r < 254) {
            blocks[i] = SCULK_CATALYST;
            continue;
          }
        }
        const n = s.cover.noise3(wx / 13, y / 9, wz / 13);
        const edge = n > -0.5 && n <= -0.32;
        if ((h >>> 13 & 1023) >= (edge ? 560 : 90))
          continue;
        let faces = 0;
        for (let f = 0;f < 6; f++) {
          const b = get(lx + DX2[f], y + DY[f], lz + DZ2[f]);
          if (b > 0 && b !== SCULK && BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1 && h >>> f + 3 & 1)
            faces |= 1 << f;
        }
        if (faces)
          blocks[i] = veinWith(faces);
      }
    }
  }
}

// goodPG/src/shared/world/ancientCity.ts
var ANCIENT_CITY_Y = -51;
var ANCIENT_CITY_RADIUS = 58;
var DOME = 26;
var tmp2 = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
function ancientCitySite(gen, x, z) {
  const r = ANCIENT_CITY_RADIUS - 10;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]])
    if (!deepDarkColumn(gen, x + dx, z + dz))
      return null;
  const top = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp2));
  return top > ANCIENT_CITY_Y + DOME + 24 ? ANCIENT_CITY_Y : null;
}
var plans = new Map;
function planOf(s) {
  const key = `${s.x},${s.z},${s.rng}`;
  let p = plans.get(key);
  if (p)
    return p;
  if (plans.size > 64)
    plans.clear();
  const rnd = mulberry32(s.rng);
  const lots = [];
  const kinds = ["house", "house", "barracks", "tower", "camp", "ruin", "statue", "garden", "ice_box", "ruin", "house", "tower"];
  const R = ANCIENT_CITY_RADIUS - 6;
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      for (let i = 0;i < 3; i++) {
        for (let j = 0;j < 3; j++) {
          const size = 11;
          const a = 21 + i * 13, b = 21 + j * 13;
          if (Math.hypot(a + size, b + size) > R + 4)
            continue;
          const u = su > 0 ? a : -a - size + 1, v = sv > 0 ? b : -b - size + 1;
          const kind = kinds[Math.floor(rnd() * kinds.length)];
          const door = a < b ? su > 0 ? 3 : 1 : sv > 0 ? 0 : 2;
          lots.push({ kind, u, v, size, seed: Math.floor(rnd() * 2 ** 31), door });
        }
      }
    }
  }
  if (!lots.some((l) => l.kind === "ice_box") && lots.length)
    lots[Math.floor(rnd() * lots.length)].kind = "ice_box";
  const bridges = [];
  lots.forEach((a, i) => lots.forEach((b, j) => {
    if (j <= i || a.kind !== "tower" || b.kind !== "tower")
      return;
    const near = a.u === b.u && Math.abs(a.v - b.v) === 13 || a.v === b.v && Math.abs(a.u - b.u) === 13;
    if (near && towerHeight(a) >= BRIDGE_Y + 3 && towerHeight(b) >= BRIDGE_Y + 3)
      bridges.push([i, j]);
  }));
  p = { lots, alongX: (s.rng & 1) === 0, bridges };
  plans.set(key, p);
  return p;
}

class Draw {
  c;
  cx;
  y0;
  cz;
  seed;
  constructor(c, cx, y0, cz, seed) {
    this.c = c;
    this.cx = cx;
    this.y0 = y0;
    this.cz = cz;
    this.seed = seed;
  }
  touches(u0, v0, u1, v1) {
    const x0 = this.cx + u0, x1 = this.cx + u1, z0 = this.cz + v0, z1 = this.cz + v1;
    return x1 >= this.c.x0 && x0 <= this.c.x0 + 15 && z1 >= this.c.z0 && z0 <= this.c.z0 + 15;
  }
  set(u, y, v, id) {
    this.c.set(this.cx + u, y, this.cz + v, id);
  }
  get(u, y, v) {
    return this.c.get(this.cx + u, y, this.cz + v);
  }
  each(u0, v0, u1, v1, fn) {
    const a0 = Math.max(u0, this.c.x0 - this.cx), a1 = Math.min(u1, this.c.x0 + 15 - this.cx);
    const b0 = Math.max(v0, this.c.z0 - this.cz), b1 = Math.min(v1, this.c.z0 + 15 - this.cz);
    for (let v = b0;v <= b1; v++)
      for (let u = a0;u <= a1; u++)
        fn(u, v);
  }
  fill(u0, y0, v0, u1, y1, v1, id) {
    this.each(u0, v0, u1, v1, (u, v) => {
      for (let y = y0;y <= y1; y++) {
        const b = typeof id === "number" ? id : id(u, y, v);
        if (b >= 0)
          this.set(u, y, v, b);
      }
    });
  }
  chest(u, y, v, facing, table) {
    this.c.chest(this.cx + u, y, this.cz + v, facing, table);
  }
  r(u, y, v, salt = 0) {
    return (hash3(this.cx + u, y, this.cz + v, this.seed ^ salt) & 65535) / 65536;
  }
}
var brick = (d, u, y, v) => d.r(u, y, v, 1) < 0.18 ? CRACKED_DEEPSLATE_BRICKS : DEEPSLATE_BRICKS;
var tile = (d, u, y, v) => d.r(u, y, v, 2) < 0.15 ? CRACKED_DEEPSLATE_TILES : DEEPSLATE_TILES;
var unlitCandles = (n) => candleState(CANDLE, n, false);
function buildAncientCity(c, s) {
  const R = ANCIENT_CITY_RADIUS;
  if (s.x + R < c.x0 || s.x - R > c.x0 + 15 || s.z + R < c.z0 || s.z - R > c.z0 + 15)
    return;
  const plan = planOf(s);
  const d = new Draw(c, s.x, s.y, s.z, s.rng);
  carveCavern(d);
  streets(d);
  centerPiece(d, plan.alongX);
  for (const lot of plan.lots)
    if (d.touches(lot.u - 1, lot.v - 1, lot.u + lot.size, lot.v + lot.size))
      buildLot(d, lot);
  for (const [i, j] of plan.bridges)
    bridge(d, plan.lots[i], plan.lots[j]);
  overgrow(d);
}
function carveCavern(d) {
  const R = ANCIENT_CITY_RADIUS, y0 = d.y0;
  d.each(-R, -R, R, R, (u, v) => {
    const r = Math.hypot(u, v);
    if (r > R)
      return;
    const wob = (hash2(d.cx + u, d.cz + v, d.seed ^ 51838) & 3) - 1;
    const h = Math.floor(DOME * Math.sqrt(Math.max(0, 1 - (r / R) ** 2))) + wob;
    for (let y = y0;y <= y0 + h; y++)
      d.set(u, y, v, AIR);
    d.set(u, y0 - 1, v, d.r(u, y0, v, 3) < 0.12 ? COBBLED_DEEPSLATE : DEEPSLATE);
    for (let y = y0 - 6;y < y0 - 1; y++) {
      const b = d.get(u, y, v);
      if (b === AIR || b > 0 && BLOCK_FLUID[b])
        d.set(u, y, v, DEEPSLATE);
    }
    const top = d.get(u, y0 + h + 1, v);
    if (top > 0 && BLOCK_FLUID[top])
      d.set(u, y0 + h + 1, v, DEEPSLATE);
  });
}
function streets(d) {
  const y = d.y0 - 1, R = ANCIENT_CITY_RADIUS - 7;
  d.each(-19, -19, 19, 19, (u, v) => {
    const edge = Math.max(Math.abs(u), Math.abs(v)) === 19;
    d.set(u, y, v, edge ? POLISHED_DEEPSLATE : u + v & 1 ? tile(d, u, y, v) : POLISHED_DEEPSLATE);
  });
  const avenue = (u, v, off) => {
    if (Math.abs(off) > 3)
      return;
    d.set(u, y, v, Math.abs(off) === 3 ? POLISHED_DEEPSLATE : brick(d, u, y, v));
  };
  d.each(-R, -3, R, 3, (u, v) => {
    if (Math.abs(u) > 19)
      avenue(u, v, v);
  });
  d.each(-3, -R, 3, R, (u, v) => {
    if (Math.abs(v) > 19)
      avenue(u, v, u);
  });
  for (const k of [26, 40])
    for (const [pu, pv] of [[k, 4], [-k, -4], [4, -k], [-4, k]])
      lampPost(d, pu, pv);
}
var PORTAL = [
  "RR.................RR",
  "RRR...............RRR",
  ".RRR.............RRR.",
  "..RRRRRRRRRRRRRRRRR..",
  "..RRR...........RRR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RR.............RR..",
  "..RRR...........RRR..",
  ".RRRRRRRRRRRRRRRRRRR.",
  "RRRRRRRRRRRRRRRRRRRRR"
];
function centerPiece(d, alongX) {
  const y = d.y0;
  const P = (a, b) => alongX ? [a, b] : [b, a];
  const box = (a0, b0, a1, b1, y0, y1, id) => {
    const [u0, v0] = P(a0, b0), [u1, v1] = P(a1, b1);
    d.fill(Math.min(u0, u1), y0, Math.min(v0, v1), Math.max(u0, u1), y1, Math.max(v0, v1), id);
  };
  box(-14, -8, 14, 8, y, y, (u, yy, v) => brick(d, u, yy, v));
  box(-12, -5, 12, 5, y + 1, y + 1, (u, yy, v) => tile(d, u, yy, v));
  for (let a = -4;a <= 4; a++) {
    for (const b of [9, -9, 6, -6]) {
      const [u, v] = P(a, b);
      const facing = alongX ? b > 0 ? 0 : 2 : b > 0 ? 3 : 1;
      d.set(u, Math.abs(b) === 9 ? y : y + 1, v, stateOf(STAIRS.deepslate_tile, { facing, half: 0 }));
    }
  }
  for (let row = 0;row < PORTAL.length; row++) {
    const yy = y + 2 + (PORTAL.length - 1 - row);
    for (let col = 0;col < 21; col++) {
      if (PORTAL[row][col] !== "R")
        continue;
      for (const b of [0, 1]) {
        const [u, v] = P(col - 10, b);
        d.set(u, yy, v, REINFORCED_DEEPSLATE);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (let b = -7;b <= 7; b++) {
      const [u, v] = P(side * 13, b);
      const top = y + 9 - Math.floor(Math.abs(b) / 3);
      if (Math.abs(b) % 3 === 0) {
        for (let yy = y + 1;yy < top; yy++)
          d.set(u, yy, v, yy === top - 1 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE);
      } else {
        const toward = Math.abs(b) % 3 === 1 ? -Math.sign(b) || 1 : Math.sign(b);
        const [tu, tv] = P(0, toward);
        const facing = tu > 0 ? 1 : tu < 0 ? 3 : tv > 0 ? 2 : 0;
        d.set(u, top - 1, v, stateOf(STAIRS.deepslate_tile, { facing, half: 1 }));
        if (Math.abs(b) % 3 === 2 && Math.abs(b) < 7)
          d.set(u, top - 2, v, stateOf(SOUL_LANTERN, { hanging: 1 }));
      }
      d.set(u, top, v, stateOf(SLABS.deepslate_tile, { type: 0 }));
    }
  }
  for (const a of [-5, 5]) {
    for (const b of [9, -9, 8, -8, 7, -7, 6, -6]) {
      const [u, v] = P(a, b);
      d.set(u, Math.abs(b) >= 8 ? y : y + 1, v, stateOf(WALLS.deepslate_tile, {}));
    }
  }
  for (const [a, b] of [[-11, -3], [11, -3], [-11, 4], [11, 4]]) {
    const [u, v] = P(a, b);
    d.set(u, y + 2, v, unlitCandles(1 + Math.floor(d.r(u, y, v, 4) * 4)));
  }
  for (const [a, b, id] of [[-8, -4, shriekerFor(true)], [8, 4, shriekerFor(true)], [0, -4, SCULK_CATALYST]]) {
    const [u, v] = P(a, b);
    d.set(u, y + 2, v, id);
  }
  for (const [u, v] of [[-17, -17], [17, -17], [-17, 17], [17, 17]]) {
    for (let k = 0;k < 3; k++)
      d.set(u, y + k, v, k === 2 ? CHISELED_DEEPSLATE : DEEPSLATE_BRICKS);
    d.set(u, y + 3, v, SOUL_LANTERN);
  }
}
function buildLot(d, lot) {
  switch (lot.kind) {
    case "house":
      return house(d, lot, false);
    case "barracks":
      return house(d, lot, true);
    case "tower":
      return tower(d, lot);
    case "ice_box":
      return iceBox(d, lot);
    case "camp":
      return camp(d, lot);
    case "ruin":
      return ruin(d, lot);
    case "statue":
      return statue(d, lot);
    case "garden":
      return garden(d, lot);
  }
}
function doorCell(u0, v0, n, door) {
  const m = Math.floor(n / 2);
  return door === 0 ? [u0 + m, v0] : door === 1 ? [u0 + n - 1, v0 + m] : door === 2 ? [u0 + m, v0 + n - 1] : [u0, v0 + m];
}
var DU = [0, 1, 0, -1];
var DV = [-1, 0, 1, 0];
var wall = (id) => stateOf(id, {});
var stair = (id, facing, top = false) => stateOf(id, { facing: facing & 3, half: top ? 1 : 0 });
var slab = (id, top = false) => stateOf(id, { type: top ? 1 : 0 });
function lampPost(d, u, v) {
  const y = d.y0;
  d.set(u, y, v, CHISELED_DEEPSLATE);
  d.set(u, y + 1, v, wall(WALLS.deepslate_brick));
  d.set(u, y + 2, v, wall(WALLS.deepslate_brick));
  d.set(u, y + 3, v, SOUL_LANTERN);
}
function house(d, lot, barracks) {
  const n = barracks ? 11 : 9, off = barracks ? 0 : 1;
  const u0 = lot.u + off, v0 = lot.v + off, u1 = u0 + n - 1, v1 = v0 + n - 1;
  const y = d.y0, H = barracks ? 6 : 5;
  const rnd = mulberry32(lot.seed);
  const [du, dv] = doorCell(u0, v0, n, lot.door);
  d.fill(u0, y, v0, u1, y + H - 1, v1, (u, yy, v) => {
    const edgeU = u === u0 || u === u1, edgeV = v === v0 || v === v1;
    if (!edgeU && !edgeV)
      return AIR;
    if (edgeU && edgeV)
      return yy === y + H - 1 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE;
    if (yy === y)
      return POLISHED_DEEPSLATE;
    if (yy === y + H - 1)
      return tile(d, u, yy, v);
    const along = edgeU ? v - v0 : u - u0;
    if (along % 4 === 0)
      return POLISHED_DEEPSLATE;
    if (along % 4 === 2 && yy === y + 2)
      return wall(WALLS.deepslate_tile);
    if (along % 4 === 2 && yy === y + 3 && barracks)
      return AIR;
    return brick(d, u, yy, v);
  });
  d.set(du, y, dv, AIR);
  d.set(du, y + 1, dv, AIR);
  d.set(du, y + 2, dv, CHISELED_DEEPSLATE);
  d.fill(u0 + 1, y - 1, v0 + 1, u1 - 1, y - 1, v1 - 1, DARK_OAK_PLANKS);
  d.fill(u0 + 1, y + H - 1, v0 + 1, u1 - 1, y + H - 1, v1 - 1, DARK_OAK_PLANKS);
  roof(d, u0, v0, u1, v1, y + H - 1, lot.door === 0 || lot.door === 2);
  const inner = (a) => Math.floor(a * (n - 3)) + 1;
  d.set(u0 + Math.floor(n / 2), y + H - 2, v0 + Math.floor(n / 2), stateOf(SOUL_LANTERN, { hanging: 1 }));
  for (let k = 1;k < n - 1; k++) {
    const [cu, cv] = lot.door === 0 || lot.door === 2 ? [du, v0 + k] : [u0 + k, dv];
    d.set(cu, y, cv, CARPETS.gray);
  }
  const beds = barracks ? 4 : 2;
  for (let k = 0;k < beds; k++) {
    const side = k % 2 === 0;
    const along = 2 + Math.floor(k / 2) * 3;
    const [bu, bv] = lot.door === 0 || lot.door === 2 ? [side ? u0 + 1 : u1 - 1, v0 + along] : [u0 + along, side ? v0 + 1 : v1 - 1];
    d.set(bu, y, bv, k % 3 === 2 ? WOOL.light_blue : WOOL.gray);
    d.set(bu, y + 1, bv, CARPETS.light_gray);
  }
  if (rnd() < 0.7) {
    const cu = lot.door === 0 || lot.door === 2 ? u0 + inner(rnd()) : lot.door === 1 ? u0 + 1 : u1 - 1;
    const cv = lot.door === 0 ? v1 - 1 : lot.door === 2 ? v0 + 1 : v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR || d.get(cu, y, cv) === CARPETS.gray)
      d.chest(cu, y, cv, lot.door + 2 & 3, "ancient_city");
  }
  for (let k = 0;k < 2; k++) {
    const cu = u0 + inner(rnd()), cv = v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR)
      d.set(cu, y, cv, unlitCandles(1 + Math.floor(rnd() * 4)));
  }
  if (rnd() < 0.6) {
    const cu = u0 + inner(rnd()), cv = v0 + inner(rnd());
    if (d.get(cu, y, cv) === AIR)
      d.set(cu, y, cv, stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  }
}
function roof(d, u0, v0, u1, v1, y, ridgeU) {
  const P = (a, b) => ridgeU ? [a, b] : [b, a];
  const [a0, a1, b0, b1] = ridgeU ? [u0, u1, v0, v1] : [v0, v1, u0, u1];
  for (let k = 0;; k++) {
    const lo = b0 - 1 + k, hi = b1 + 1 - k, yy = y + k;
    if (lo > hi)
      break;
    for (let a = a0 - 1;a <= a1 + 1; a++) {
      if (lo === hi) {
        const [u, v] = P(a, lo);
        d.set(u, yy, v, slab(SLABS.deepslate_tile));
        continue;
      }
      const [nu, nv] = P(a, lo), [su, sv] = P(a, hi);
      d.set(nu, yy, nv, stair(STAIRS.deepslate_tile, ridgeU ? 2 : 1));
      d.set(su, yy, sv, stair(STAIRS.deepslate_tile, ridgeU ? 0 : 3));
      if (a === a0 || a === a1) {
        for (let b = lo + 1;b < hi; b++) {
          const [gu, gv] = P(a, b);
          if (k > 0)
            d.set(gu, yy, gv, brick(d, gu, yy, gv));
        }
      }
    }
  }
}
function tower(d, lot) {
  const rnd = mulberry32(lot.seed ^ 28901);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  const H = towerHeight(lot);
  const door = lot.door, back = door + 2 & 3;
  d.fill(cu - 3, y, cv - 3, cu + 3, y + 3, cv + 3, (u, yy, v) => {
    const eu = Math.abs(u - cu) === 3, ev = Math.abs(v - cv) === 3;
    if (!eu && !ev)
      return AIR;
    if (eu && ev)
      return yy === y + 3 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE;
    return yy === y ? POLISHED_DEEPSLATE : brick(d, u, yy, v);
  });
  d.each(cu - 3, cv - 3, cu + 3, cv + 3, (u, v) => {
    const ru = u - cu, rv = v - cv;
    if (Math.max(Math.abs(ru), Math.abs(rv)) !== 3)
      return;
    const facing = Math.abs(ru) === 3 && Math.abs(rv) === 3 ? -1 : rv === -3 ? 2 : rv === 3 ? 0 : ru === -3 ? 1 : 3;
    d.set(u, y + 4, v, facing < 0 ? POLISHED_DEEPSLATE : stair(STAIRS.deepslate_brick, facing));
  });
  d.fill(cu - 2, y + 4, cv - 2, cu + 2, y + H, cv + 2, (u, yy, v) => {
    const eu = Math.abs(u - cu) === 2, ev = Math.abs(v - cv) === 2;
    if (!eu && !ev)
      return AIR;
    if (eu && ev)
      return POLISHED_DEEPSLATE;
    if ((yy - y) % 5 === 0)
      return CHISELED_DEEPSLATE;
    if ((u === cu || v === cv) && (yy - y) % 5 === 2)
      return AIR;
    return tile(d, u, yy, v);
  });
  d.each(cu - 3, cv - 3, cu + 3, cv + 3, (u, v) => {
    const ru = u - cu, rv = v - cv;
    const ring = Math.max(Math.abs(ru), Math.abs(rv)) === 3;
    if (ring) {
      const corner = Math.abs(ru) === 3 && Math.abs(rv) === 3;
      const facing = rv === -3 ? 2 : rv === 3 ? 0 : ru === -3 ? 1 : 3;
      if (!corner)
        d.set(u, y + H, v, stair(STAIRS.deepslate_tile, facing, true));
      d.set(u, y + H + 1, v, corner ? POLISHED_DEEPSLATE : slab(SLABS.polished_deepslate, true));
      d.set(u, y + H + 2, v, corner ? CHISELED_DEEPSLATE : wall(WALLS.polished_deepslate));
      if (corner)
        d.set(u, y + H + 3, v, wall(WALLS.polished_deepslate));
    } else
      d.set(u, y + H + 1, v, slab(SLABS.polished_deepslate, true));
  });
  for (let k = 2;k <= 4; k++)
    d.set(cu, y + H + k, cv, wall(WALLS.deepslate_brick));
  d.set(cu, y + H + 5, cv, SOUL_LANTERN);
  const [pu, pv] = [cu + DU[door] * 3, cv + DV[door] * 3];
  d.set(pu, y, pv, AIR);
  d.set(pu, y + 1, pv, AIR);
  d.set(pu, y + 2, pv, CHISELED_DEEPSLATE);
  const [lu, lv] = [cu + DU[back], cv + DV[back]];
  for (let yy = y;yy <= y + H + 1; yy++)
    d.set(lu, yy, lv, stateOf(LADDER, { facing: back + 2 & 3 }));
  d.set(lu, y + H + 1, lv, stateOf(TRAPDOORS.dark_oak, { facing: door, half: 1, open: 1 }));
  for (let yy = y;yy <= y + H; yy++) {
    const wu = cu + DU[back] * 2, wv = cv + DV[back] * 2;
    if (d.get(wu, yy, wv) === AIR)
      d.set(wu, yy, wv, tile(d, wu, yy, wv));
  }
  if (rnd() < 0.5)
    d.chest(cu + DU[door + 1 & 3] * 2, y, cv + DV[door + 1 & 3] * 2, door + 3 & 3, "ancient_city");
  d.set(cu + DU[door + 3 & 3] * 2, y, cv + DV[door + 3 & 3] * 2, unlitCandles(1 + Math.floor(rnd() * 4)));
}
var BRIDGE_Y = 9;
function towerHeight(lot) {
  const cu = lot.u + 5, cv = lot.v + 5;
  const r = Math.hypot(Math.abs(cu) + 3, Math.abs(cv) + 3);
  const room = Math.floor(DOME * Math.sqrt(Math.max(0, 1 - (r / ANCIENT_CITY_RADIUS) ** 2))) - 7;
  return Math.max(6, Math.min(13 + Math.floor(mulberry32(lot.seed)() * 7), room));
}
function bridge(d, a, b) {
  const y = d.y0 + BRIDGE_Y;
  const ac = [a.u + 5, a.v + 5], bc = [b.u + 5, b.v + 5];
  const alongU = ac[1] === bc[1];
  const [c0, c1] = alongU ? [Math.min(ac[0], bc[0]), Math.max(ac[0], bc[0])] : [Math.min(ac[1], bc[1]), Math.max(ac[1], bc[1])];
  const mid = alongU ? ac[1] : ac[0];
  for (let t = c0 + 2;t <= c1 - 2; t++) {
    for (let w = -1;w <= 1; w++) {
      const [u, v] = alongU ? [t, mid + w] : [mid + w, t];
      const inside = t > c0 + 2 && t < c1 - 2;
      if (Math.abs(w) <= 1)
        d.set(u, y - 1, v, inside ? slab(SLABS.deepslate_brick, true) : POLISHED_DEEPSLATE);
      if (!inside && w === 0) {
        d.set(u, y, v, AIR);
        d.set(u, y + 1, v, AIR);
      }
      if (inside && Math.abs(w) === 1)
        d.set(u, y, v, wall(WALLS.deepslate_brick));
    }
    if (t === Math.floor((c0 + c1) / 2)) {
      const [u, v] = alongU ? [t, mid] : [mid, t];
      d.set(u, y - 2, v, stateOf(SOUL_LANTERN, { hanging: 1 }));
    }
  }
}
function iceBox(d, lot) {
  const u0 = lot.u + 2, v0 = lot.v + 2, u1 = u0 + 6, v1 = v0 + 6, y = d.y0;
  d.fill(u0, y - 1, v0, u1, y + 4, v1, (u, yy, v) => {
    const edge = u === u0 || u === u1 || v === v0 || v === v1;
    if (yy === y - 1)
      return BLUE_ICE;
    if (yy === y + 4)
      return SNOW_BLOCK;
    if (!edge)
      return AIR;
    return (u + yy + v) % 4 === 0 ? BLUE_ICE : PACKED_ICE;
  });
  d.fill(u0 - 1, y, v0 - 1, u1 + 1, y, v1 + 1, (u, _y, v) => u === u0 - 1 || u === u1 + 1 || v === v0 - 1 || v === v1 + 1 ? stateOf(SLABS.polished_deepslate, { type: 0 }) : -1);
  const [du, dv] = doorCell(u0, v0, 7, lot.door);
  d.set(du, y, dv, AIR);
  d.set(du, y + 1, dv, AIR);
  d.chest(u0 + 3, y, lot.door === 0 ? v1 - 1 : v0 + 1, lot.door === 0 ? 0 : 2, "ancient_city_ice_box");
  d.set(u0 + 1, y, v0 + 1, SNOW_BLOCK);
  d.set(u1 - 1, y, v1 - 1, SNOW_BLOCK);
}
function camp(d, lot) {
  const rnd = mulberry32(lot.seed);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.each(cu - 4, cv - 4, cu + 4, cv + 4, (u, v) => {
    const r = Math.max(Math.abs(u - cu), Math.abs(v - cv));
    if (r === 4 && (u + v) % 2 === 0)
      d.set(u, y, v, stateOf(WALLS.deepslate_brick, {}));
    if (r <= 3)
      d.set(u, y - 1, v, tile(d, u, y - 1, v));
  });
  d.set(cu, y - 1, cv, SOUL_SAND);
  d.set(cu, y, cv, SOUL_FIRE);
  for (const [du, dv] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
    d.set(cu + du, y, cv + dv, stateOf(SLABS.deepslate_brick, { type: 0 }));
  d.set(cu - 2, y, cv - 2, SKULLS.skeleton + Math.floor(rnd() * 16));
  d.set(cu + 2, y, cv + 2, SKULLS.skeleton + Math.floor(rnd() * 16));
  d.set(cu + 2, y, cv - 2, unlitCandles(1 + Math.floor(rnd() * 4)));
  d.set(cu - 2, y, cv + 2, WOOL.gray);
  d.set(cu - 2, y + 1, cv + 2, CARPETS.light_gray);
  if (rnd() < 0.35)
    d.chest(cu + 3, y, cv, 3, "ancient_city");
}
function ruin(d, lot) {
  const rnd = mulberry32(lot.seed);
  const u0 = lot.u + 1, v0 = lot.v + 1, n = 9, y = d.y0;
  d.each(u0, v0, u0 + n - 1, v0 + n - 1, (u, v) => {
    const edge = u === u0 || u === u0 + n - 1 || v === v0 || v === v0 + n - 1;
    if (!edge) {
      if (d.r(u, y, v, 7) < 0.08)
        d.set(u, y, v, COBBLED_DEEPSLATE);
      return;
    }
    const h = Math.floor(d.r(u, y, v, 8) * 6);
    for (let k = 0;k < h; k++)
      d.set(u, y + k, v, d.r(u, y + k, v, 9) < 0.4 ? COBBLED_DEEPSLATE : CRACKED_DEEPSLATE_BRICKS);
  });
  d.set(u0 + 4, y, v0 + 4, shriekerFor(true));
  if (rnd() < 0.25)
    d.chest(u0 + 2, y, v0 + 2, Math.floor(rnd() * 4), "ancient_city");
}
function statue(d, lot) {
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.fill(cu - 1, y, cv - 1, cu + 1, y, cv + 1, (u, yy, v) => brick(d, u, yy, v));
  d.fill(cu - 1, y + 1, cv - 1, cu + 1, y + 1, cv + 1, (u, _y, v) => u === cu && v === cv ? CHISELED_DEEPSLATE : stateOf(SLABS.deepslate_tile, { type: 0 }));
  for (let k = 2;k < 7; k++)
    d.set(cu, y + k, cv, k % 2 ? CHISELED_DEEPSLATE : POLISHED_DEEPSLATE);
  d.set(cu, y + 7, cv, SKULLS.skeleton + (lot.seed & 15));
  for (const [du, dv] of [[-3, 0], [3, 0], [0, -3], [0, 3]])
    d.set(cu + du, y, cv + dv, unlitCandles(1 + (lot.seed >> 4 & 3)));
}
function garden(d, lot) {
  const rnd = mulberry32(lot.seed);
  const cu = lot.u + 5, cv = lot.v + 5, y = d.y0;
  d.each(cu - 4, cv - 4, cu + 4, cv + 4, (u, v) => {
    const r = Math.max(Math.abs(u - cu), Math.abs(v - cv));
    if (r === 4) {
      if ((u + v) % 3 !== 0)
        d.set(u, y, v, FENCES.dark_oak);
    } else
      d.set(u, y - 1, v, SCULK);
  });
  d.set(cu, y, cv, SCULK_CATALYST);
  for (let k = 0;k < 4; k++) {
    const u = cu - 3 + Math.floor(rnd() * 7), v = cv - 3 + Math.floor(rnd() * 7);
    if (u === cu && v === cv)
      continue;
    d.set(u, y, v, k === 0 ? shriekerFor(true) : stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  }
}
function overgrow(d) {
  const R = ANCIENT_CITY_RADIUS, y = d.y0;
  d.each(-R, -R, R, R, (u, v) => {
    const r = Math.hypot(u, v);
    if (r > R - 1)
      return;
    const road = (Math.abs(u) <= 3 || Math.abs(v) <= 3 || Math.max(Math.abs(u), Math.abs(v)) <= 19) && r < R - 7;
    const floor = d.get(u, y - 1, v);
    const n = d.r(u >> 2, y, v >> 2, 11) * 0.6 + d.r(u, y, v, 12) * 0.4;
    if (floor === DEEPSLATE || floor === COBBLED_DEEPSLATE ? n < 0.72 : road && n < 0.1 && floor > 0 && BLOCK_OPAQUE[floor]) {
      d.set(u, y - 1, v, SCULK);
    }
    if (d.r(u, y, v, 13) < 0.12) {
      for (let yy = y;yy < y + 4; yy++) {
        if (d.get(u, yy, v) !== AIR)
          continue;
        let faces = 0;
        const sides = [[1, 0, 1], [-1, 0, 2], [0, 1, 16], [0, -1, 32]];
        for (const [du, dv, bit] of sides) {
          const b = d.get(u + du, yy, v + dv);
          if (b > 0 && BLOCK_OPAQUE[b] && b !== SCULK)
            faces |= bit;
        }
        if (faces && d.r(u, yy, v, 14) < 0.5)
          d.set(u, yy, v, veinWith(faces));
      }
    }
    if (d.get(u, y - 1, v) === SCULK && d.get(u, y, v) === AIR && d.r(u, y, v, 15) < 0.012)
      d.set(u, y, v, stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  });
}

// goodPG/src/shared/fauna.ts
var EF_FAUNA_A = 1 << 19;
var EF_FAUNA_B = 1 << 20;

// goodPG/src/shared/oceanMobs.ts
var MOB_GUARDIAN = 73;
var MOB_ELDER_GUARDIAN = 74;
var LASER_CHARGE = { [MOB_GUARDIAN]: 4, [MOB_ELDER_GUARDIAN]: 3 };
var SPIKE_SPOTS = [
  [0, -8, 8],
  [0, -8, -8],
  [8, -8, 0],
  [-8, -8, 0],
  [-8, 0, -8],
  [8, 0, -8],
  [8, 0, 8],
  [-8, 0, 8],
  [0, 8, 8],
  [0, 8, -8],
  [8, 8, 0],
  [-8, 8, 0]
];
function guardianSpecs() {
  const specs = [
    { name: "body", pivot: [0, 8, 0], from: [-6, -6, -8], size: [12, 12, 16] },
    { name: "plateR", parent: "body", pivot: [0, 0, 0], from: [6, -6, -6], size: [2, 12, 12] },
    { name: "plateL", parent: "body", pivot: [0, 0, 0], from: [-8, -6, -6], size: [2, 12, 12], share: "plateR" },
    { name: "plateTop", parent: "body", pivot: [0, 0, 0], from: [-6, 6, -6], size: [12, 2, 12] },
    { name: "plateBottom", parent: "body", pivot: [0, 0, 0], from: [-6, -8, -6], size: [12, 2, 12], share: "plateTop" },
    { name: "eye", parent: "body", pivot: [0, 0, 0], from: [-1, -1, -8.25], size: [2, 2, 1] },
    { name: "tail0", parent: "body", pivot: [0, 0, 8], from: [-2, -2, -1], size: [4, 4, 8] },
    { name: "tail1", parent: "tail0", pivot: [0, 0, 7], from: [-1.5, -1.5, 0], size: [3, 3, 7] },
    { name: "tail2", parent: "tail1", pivot: [0, 0, 7], from: [-1, -1, 0], size: [2, 2, 6] },
    { name: "fin", parent: "tail2", pivot: [0, 0, 3], from: [-0.5, -4.5, 0], size: [1, 9, 9] }
  ];
  SPIKE_SPOTS.forEach(([x, y, z], i) => {
    const r = Math.hypot(x, y, z);
    const a = Math.acos(y / r), b = Math.atan2(x, z);
    specs.push({
      name: `spike${i}`,
      parent: "body",
      pivot: [0, 0, 0],
      from: [-1, r - 4.5, -1],
      size: [2, 9, 2],
      rot: [a, b, 0],
      share: i ? "spike0" : undefined
    });
  });
  return specs;
}
function model2(base) {
  const { parts, atlas } = packParts(64, guardianSpecs());
  return { ...base, parts, atlas };
}
var common2 = { hostile: true, burnsInSun: false, anim: "guardian", sound: "guardian" };
var OCEAN_MOBS = [
  model2({
    ...common2,
    id: MOB_GUARDIAN,
    key: "guardian",
    name: "守卫者",
    health: 30,
    walk: 2.2,
    run: 4.2,
    width: 0.85,
    height: 0.85,
    damage: 6,
    drops: [[PRISMARINE_SHARD, 0, 2]],
    scale: 0.85,
    xp: 10
  }),
  model2({
    ...common2,
    id: MOB_ELDER_GUARDIAN,
    key: "elder_guardian",
    name: "远古守卫者",
    health: 80,
    walk: 1.2,
    run: 1.9,
    width: 1.9975,
    height: 1.9975,
    damage: 8,
    drops: [[PRISMARINE_SHARD, 0, 2]],
    scale: 2,
    xp: 10,
    sound: "elder_guardian"
  })
];

// goodPG/src/shared/world/monument.ts
var MONUMENT_Y = SEA_LEVEL - 24;
var MONUMENT_RADIUS = 29;
var MONUMENT_TOP = MONUMENT_Y + 22;
var B = MONUMENT_Y;
var KEEP = -1;
var LEG = -2;
function cellExists(i, k, s) {
  if (s < 2)
    return i >= 0 && i < 6 && k >= 0 && k < 6;
  return s === 2 && i >= 1 && i <= 4 && k >= 1 && k <= 4;
}
var isCore = (i, k, s) => s < 2 && i >= 2 && i <= 3 && k >= 2 && k <= 3;
var isLobby = (i, k, s) => s === 0 && k === 0 && (i === 2 || i === 3);
function edgeKey(a, b) {
  const ka = a.join(","), kb = b.join(",");
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}
var layoutCache2 = new Map;
function monumentLayout(s) {
  const key = `${s.x},${s.z},${s.rng}`;
  const hit = layoutCache2.get(key);
  if (hit)
    return hit;
  if (layoutCache2.size > 64)
    layoutCache2.clear();
  const rnd = mulberry32(s.rng);
  const sponge = new Set;
  const n = 1 + Math.floor(rnd() * 3);
  for (let t = 0;t < 20 && sponge.size < n; t++) {
    const i = Math.floor(rnd() * 6), k = 1 + Math.floor(rnd() * 5);
    if (!isCore(i, k, 0) && !(i >= 1 && i <= 4 && k >= 1 && k <= 4 && rnd() < 0.5))
      sponge.add(`${i},${k}`);
  }
  const node = (i, k, s2) => isCore(i, k, s2) ? "core" : isLobby(i, k, s2) ? "lobby" : s2 < 2 && sponge.has(`${i},${k}`) ? `sp${i},${k}` : `${i},${k},${s2}`;
  const cells = [];
  for (let s2 = 0;s2 < 3; s2++)
    for (let k = 0;k < 6; k++)
      for (let i = 0;i < 6; i++)
        if (cellExists(i, k, s2))
          cells.push([i, k, s2]);
  const edges = [];
  for (const c of cells) {
    const [i, k, s2] = c;
    for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const o = [i + d[0], k + d[1], s2 + d[2]];
      if (!cellExists(o[0], o[1], o[2]) || node(i, k, s2) === node(o[0], o[1], o[2]))
        continue;
      edges.push([c, o]);
    }
  }
  const adj = new Map;
  for (const [a, b] of edges) {
    const na = node(...a), nb = node(...b), ek = edgeKey(a, b);
    if (!adj.has(na))
      adj.set(na, []);
    if (!adj.has(nb))
      adj.set(nb, []);
    adj.get(na).push([nb, ek]);
    adj.get(nb).push([na, ek]);
  }
  const open = new Set;
  const seen = new Set(["lobby"]);
  const stack = ["lobby"];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const next = (adj.get(cur) ?? []).filter(([nb]) => !seen.has(nb));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const [nb, ek] = next[Math.floor(rnd() * next.length)];
    open.add(ek);
    seen.add(nb);
    stack.push(nb);
  }
  for (const [a, b] of edges)
    if (rnd() < 0.2)
      open.add(edgeKey(a, b));
  const L = { open, sponge, rot: s.rng % 4, seed: s.rng };
  layoutCache2.set(key, L);
  return L;
}
function cellOf(c) {
  const r = c + 21;
  return r % 7 === 0 ? -1 : Math.floor(r / 7);
}
function inDoor(c) {
  const r = (c + 21) % 7;
  return r === 3 || r === 4;
}
function isOpen(L, a, b) {
  return L.open.has(edgeKey(a, b));
}
function monumentBlock(L, u, y, v) {
  const au = Math.abs(u), av = Math.abs(v), m = Math.max(au, av);
  if (m > MONUMENT_RADIUS || y > SEA_LEVEL - 1)
    return KEEP;
  if (y < B) {
    const grid = (c) => c % 7 === 0 || Math.abs(c) === MONUMENT_RADIUS;
    return grid(u) && grid(v) && (m >= 21 || au % 14 === 0 && av % 14 === 0) ? LEG : KEEP;
  }
  const h = hash3(u, y, v, L.seed);
  if (y === B) {
    if (m === MONUMENT_RADIUS)
      return DARK_PRISMARINE;
    if (au <= 21 && av <= 21) {
      if (au <= 6 && av <= 6)
        return DARK_PRISMARINE;
      return (u + 21) % 7 === 0 || (v + 21) % 7 === 0 ? DARK_PRISMARINE : PRISMARINE;
    }
    if (u % 7 === 0 && v % 7 === 0)
      return u % 14 === 0 && v % 14 === 0 ? SEA_LANTERN : DARK_PRISMARINE;
    return h % 9 === 0 ? PRISMARINE_BRICKS : PRISMARINE;
  }
  if (au >= 22 && av <= 10 && y <= B + 14)
    return wing(u, y, v, au, av);
  if (v <= -22 && au <= 8 && y <= B + 8)
    return portico(u, y, v, au);
  if (m <= 21 && y <= B + 8)
    return building2(L, u, y, v, au, av, m, h);
  if (m <= 14 && y <= B + 12) {
    if (y === B + 12) {
      if (m <= 7)
        return penthouseFloor(u, v);
      return m === 14 ? DARK_PRISMARINE : lanternRoof(u, v) ? SEA_LANTERN : PRISMARINE_BRICKS;
    }
    return building2(L, u, y, v, au, av, m, h);
  }
  if (m <= 7 && y <= B + 20)
    return penthouse(u, y, v, au, av, m);
  if (au === 7 && av === 7 && y <= B + 22)
    return y === B + 22 ? SEA_LANTERN : DARK_PRISMARINE;
  return WATER;
}
function lanternRoof(u, v) {
  const cu = cellOf(u), cv = cellOf(v);
  return cu >= 0 && cv >= 0 && (u + 21) % 7 === 3 && (v + 21) % 7 === 3 && (cu + cv) % 2 === 0;
}
function wing(u, y, v, au, av) {
  if (au <= 22 && (v === 3 || v === 4) && y >= B + 1 && y <= B + 2)
    return WATER;
  const shell = au === 22 || au === MONUMENT_RADIUS || av === 10 || y === B + 14;
  if (!shell) {
    if ((au === 23 || au === 28) && av === 9 && y >= B + 1)
      return y === B + 7 ? SEA_LANTERN : DARK_PRISMARINE;
    return WATER;
  }
  const edge = (au === 22 || au === MONUMENT_RADIUS) && av === 10;
  if (edge || y === B + 14 && (au === 22 || au === MONUMENT_RADIUS || av === 10))
    return DARK_PRISMARINE;
  if (y === B + 14)
    return au === 25 && v % 3 === 0 ? SEA_LANTERN : PRISMARINE_BRICKS;
  if (au === MONUMENT_RADIUS && (y - B) % 4 === 2 && v % 4 === 0)
    return SEA_LANTERN;
  if (y === B + 7)
    return DARK_PRISMARINE;
  return PRISMARINE_BRICKS;
}
function portico(u, y, v, au) {
  if (y === B + 8)
    return au === 8 || v === -29 ? DARK_PRISMARINE : u === 0 && v % 2 === 0 ? SEA_LANTERN : PRISMARINE_BRICKS;
  if ((au === 8 || au === 4) && (v === -29 || v === -25))
    return DARK_PRISMARINE;
  if (au === 8)
    return y === B + 4 ? DARK_PRISMARINE : y === B + 2 && v === -27 ? SEA_LANTERN : PRISMARINE_BRICKS;
  return WATER;
}
function penthouseFloor(u, v) {
  if ((u === -4 || u === -3) && (v === -4 || v === -3))
    return WATER;
  return Math.abs(u) === 7 || Math.abs(v) === 7 ? DARK_PRISMARINE : PRISMARINE;
}
function penthouse(u, y, v, au, av, m) {
  if (y === B + 20)
    return au <= 1 && av <= 1 ? SEA_LANTERN : m === 7 ? DARK_PRISMARINE : PRISMARINE_BRICKS;
  if (m === 7) {
    if (au === 7 && av === 7)
      return DARK_PRISMARINE;
    if (y === B + 16 && (au === 0 || av === 0 || au === 1 || av === 1) && (au === 7 || av === 7))
      return SEA_LANTERN;
    return y === B + 13 || y === B + 19 ? DARK_PRISMARINE : PRISMARINE_BRICKS;
  }
  if (au === 4 && av === 4)
    return y === B + 16 ? SEA_LANTERN : DARK_PRISMARINE;
  return WATER;
}
function building2(L, u, y, v, au, av, m, h) {
  const ry = y - B;
  if (au <= 7 && av <= 7 && ry <= 8) {
    if (ry === 8) {
      if (au === 7 || av === 7)
        return DARK_PRISMARINE;
      const i = cellOf(u), k = cellOf(v);
      if (i >= 0 && k >= 0 && inDoor(u) && inDoor(v) && isOpen(L, [i, k, 1], [i, k, 2]))
        return WATER;
      return au <= 1 && av <= 1 ? SEA_LANTERN : DARK_PRISMARINE;
    }
    if (au <= 6 && av <= 6) {
      if ((u === -1 || u === 0) && (v === -1 || v === 0) && (ry === 3 || ry === 4))
        return GOLD_BLOCK;
      if (u >= -2 && u <= 1 && v >= -2 && v <= 1 && ry >= 2 && ry <= 5)
        return DARK_PRISMARINE;
      if (au === 6 && av === 6)
        return ry === 4 ? SEA_LANTERN : DARK_PRISMARINE;
      return WATER;
    }
    if (au === 7 && av === 7)
      return DARK_PRISMARINE;
    const door = coreDoor(L, u, ry, v, au);
    return door ? WATER : DARK_PRISMARINE;
  }
  const onU = (u + 21) % 7 === 0, onV = (v + 21) % 7 === 0;
  const s = Math.floor((ry - 1) / 4);
  if (ry % 4 === 0) {
    if (m === 21 || m === 14 && ry === 12)
      return DARK_PRISMARINE;
    if (onU || onV)
      return ry === 8 && m > 14 ? PRISMARINE_BRICKS : DARK_PRISMARINE;
    const i = cellOf(u), k = cellOf(v), below = ry / 4 - 1;
    if (ry === 4 && L.sponge.has(`${i},${k}`))
      return WATER;
    if (inDoor(u) && inDoor(v) && cellExists(i, k, below + 1) && isOpen(L, [i, k, below], [i, k, below + 1]))
      return WATER;
    if (ry === 8 && m > 14)
      return lanternRoof(u, v) ? SEA_LANTERN : PRISMARINE_BRICKS;
    if ((u + 21) % 7 === 3 && (v + 21) % 7 === 3 && hash2(i * 7 + below, k, L.seed) % 2 === 0)
      return SEA_LANTERN;
    return PRISMARINE;
  }
  const low = ry % 4 <= 2;
  if (m === 21 || s === 2 && m === 14) {
    if (v === -21 && au <= 2 && s === 0)
      return WATER;
    if (au === 21 && (v === 3 || v === 4) && s === 0 && low)
      return WATER;
    if (au === av)
      return DARK_PRISMARINE;
    const along = au === m ? v : u;
    if (ry % 4 === 2 && (along + 21) % 7 === 3)
      return SEA_LANTERN;
    return PRISMARINE_BRICKS;
  }
  if (onU && onV)
    return DARK_PRISMARINE;
  if (onU || onV) {
    if (onU && u === 0 && s === 0 && cellOf(v) === 0)
      return WATER;
    if (low) {
      if (onU && inDoor(v)) {
        const k = cellOf(v), i = (u + 21) / 7;
        if (isOpen(L, [i - 1, k, s], [i, k, s]))
          return WATER;
      }
      if (onV && inDoor(u)) {
        const i = cellOf(u), k = (v + 21) / 7;
        if (isOpen(L, [i, k - 1, s], [i, k, s]))
          return WATER;
      }
    }
    return PRISMARINE_BRICKS;
  }
  if (ry === 7 && L.sponge.has(`${cellOf(u)},${cellOf(v)}`))
    return h % 4 !== 0 ? WET_SPONGE : WATER;
  return WATER;
}
function coreDoor(L, u, ry, v, au) {
  const s = ry <= 4 ? 0 : 1;
  if (ry % 4 === 0 || ry % 4 === 3)
    return false;
  if (au === 7) {
    if (!inDoor(v))
      return false;
    const k = cellOf(v), inner = u > 0 ? 3 : 2, outer = u > 0 ? 4 : 1;
    return isOpen(L, [inner, k, s], [outer, k, s]);
  }
  if (!inDoor(u))
    return false;
  const i = cellOf(u), inner = v > 0 ? 3 : 2, outer = v > 0 ? 4 : 1;
  return isOpen(L, [i, inner, s], [i, outer, s]);
}
function toLocal(dx, dz, rot) {
  switch (rot & 3) {
    case 0:
      return [dx, dz];
    case 1:
      return [dz, -dx];
    case 2:
      return [-dx, -dz];
    default:
      return [-dz, dx];
  }
}
function toWorld2(u, v, rot) {
  switch (rot & 3) {
    case 0:
      return [u, v];
    case 1:
      return [-v, u];
    case 2:
      return [-u, -v];
    default:
      return [v, -u];
  }
}
function buildMonument(c, s) {
  const L = monumentLayout(s);
  const R = MONUMENT_RADIUS;
  const xa = Math.max(c.x0, s.x - R), xb = Math.min(c.x0 + 15, s.x + R);
  const za = Math.max(c.z0, s.z - R), zb = Math.min(c.z0 + 15, s.z + R);
  for (let z = za;z <= zb; z++) {
    for (let x = xa;x <= xb; x++) {
      const [u, v] = toLocal(x - s.x, z - s.z, L.rot);
      for (let y = SEA_LEVEL - 1;y >= B; y--) {
        const id = monumentBlock(L, u, y, v);
        if (id >= 0)
          c.set(x, y, z, id);
      }
      if (monumentBlock(L, u, B - 1, v) === LEG) {
        for (let y = B - 1;y > B - 40; y--) {
          const cur = c.get(x, y, z);
          if (cur < 0 || cur !== AIR && BLOCK_OPAQUE[cur])
            break;
          c.set(x, y, z, PRISMARINE_BRICKS);
        }
      }
    }
  }
  for (const [u, y, v] of MONUMENT_ELDERS) {
    const [dx, dz] = toWorld2(u, v, L.rot);
    c.mob(MOB_ELDER_GUARDIAN, s.x + dx + 0.5, y, s.z + dz + 0.5);
  }
}
var MONUMENT_ELDERS = [[0, B + 14, 0], [25, B + 3, 0], [-26, B + 3, 0]];
// goodPG/src/shared/illagers.ts
var MOB_PILLAGER = 60;
var MOB_VINDICATOR = 61;
var MOB_EVOKER = 62;
var MOB_VEX = 63;
var MOB_RAVAGER = 64;
var MOB_EVOKER_FANGS = 65;
function illagerSpecs() {
  return [
    { name: "head", pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8] },
    { name: "nose", parent: "head", pivot: [0, 2, -4], from: [-1, -1, -2], size: [2, 4, 2] },
    { name: "body", pivot: [0, 12, 0], from: [-4, 0, -3], size: [8, 12, 6] },
    { name: "jacket", parent: "body", pivot: [0, 0, 0], from: [-4.5, -6, -3.5], size: [9, 18, 7] },
    { name: "armR", pivot: [6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4] },
    { name: "armL", pivot: [-6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], share: "armR" },
    { name: "legR", pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4] },
    { name: "legL", pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], share: "legR" }
  ];
}
function bannerSpecs() {
  return [
    { name: "bannerPole", parent: "body", pivot: [0, 0, 4], from: [-0.5, 0, -0.5], size: [1, 28, 1] },
    { name: "bannerBar", parent: "bannerPole", pivot: [0, 27, 0], from: [-5.5, 0, -0.5], size: [11, 1, 1] },
    { name: "banner", parent: "bannerPole", pivot: [0, 27, 0.5], from: [-5, -20, 0], size: [10, 20, 1] }
  ];
}
function model3(base, W, specs) {
  const { parts, atlas } = packParts(W, specs);
  return { ...base, parts, atlas };
}
var illagerBase = { hostile: true, burnsInSun: false, width: 0.6, height: 1.95, anim: "illager", scale: 0.94, sound: "illager" };
var ILLAGER_MOBS = [
  model3({
    ...illagerBase,
    id: MOB_PILLAGER,
    key: "pillager",
    name: "掠夺者",
    health: 24,
    walk: 1.2,
    run: 2.8,
    damage: 2,
    drops: [[ARROW, 0, 2]]
  }, 64, [
    ...illagerSpecs(),
    { name: "crossbow", parent: "armR", pivot: [0, -9, 0], from: [-0.5, -0.5, -9], size: [1, 1, 10] },
    { name: "crossbowLimbs", parent: "crossbow", pivot: [0, 0, -7], from: [-5, -0.5, -0.5], size: [10, 1, 1] },
    ...bannerSpecs()
  ]),
  model3({
    ...illagerBase,
    id: MOB_VINDICATOR,
    key: "vindicator",
    name: "卫道士",
    health: 24,
    walk: 1.2,
    run: 3.3,
    damage: 13,
    drops: [[EMERALD, 0, 1]]
  }, 64, [
    ...illagerSpecs(),
    { name: "axe", parent: "armR", pivot: [0, -9, 0], from: [-0.5, -0.5, -9], size: [1, 1, 11] },
    { name: "axeHead", parent: "axe", pivot: [0, 0, -8], from: [-0.5, -4, -1], size: [1, 5, 3] },
    ...bannerSpecs()
  ]),
  model3({
    ...illagerBase,
    id: MOB_EVOKER,
    key: "evoker",
    name: "唤魔者",
    health: 24,
    walk: 1.1,
    run: 2.2,
    damage: 0,
    drops: [[TOTEM_OF_UNDYING, 1, 1], [EMERALD, 0, 1]]
  }, 64, illagerSpecs()),
  model3({
    id: MOB_VEX,
    key: "vex",
    name: "恼鬼",
    hostile: true,
    burnsInSun: false,
    health: 14,
    walk: 3,
    run: 6.5,
    width: 0.4,
    height: 0.8,
    damage: 9,
    drops: [],
    anim: "vex",
    scale: 0.45,
    flying: true,
    sound: "vex"
  }, 64, [
    { name: "body", pivot: [0, 14, 0], from: [-4, 0, -2], size: [8, 10, 4] },
    { name: "head", parent: "body", pivot: [0, 10, 0], from: [-4, 0, -4], size: [8, 8, 8] },
    { name: "tail", parent: "body", pivot: [0, 0, 0], from: [-2, -8, -1.5], size: [4, 8, 3] },
    { name: "armR", parent: "body", pivot: [5.5, 9, 0], from: [-1.5, -9, -1.5], size: [3, 10, 3] },
    { name: "armL", parent: "body", pivot: [-5.5, 9, 0], from: [-1.5, -9, -1.5], size: [3, 10, 3], share: "armR" },
    { name: "sword", parent: "armR", pivot: [0, -8, 0], from: [-0.5, -0.5, -12], size: [1, 1, 13] },
    { name: "swordGuard", parent: "sword", pivot: [0, 0, -1], from: [-2, -0.5, -0.5], size: [4, 1, 1] },
    { name: "wingR", parent: "body", pivot: [1.5, 8, 2], from: [0, -10, 0], size: [12, 14, 1], rot: [0, -0.5, 0.2] },
    { name: "wingL", parent: "body", pivot: [-1.5, 8, 2], from: [-12, -10, 0], size: [12, 14, 1], rot: [0, 0.5, -0.2], share: "wingR" }
  ]),
  model3({
    id: MOB_RAVAGER,
    key: "ravager",
    name: "劫掠兽",
    hostile: true,
    burnsInSun: false,
    health: 100,
    walk: 1.2,
    run: 3.1,
    width: 1.95,
    height: 2.2,
    damage: 12,
    drops: [[SADDLE, 1, 1]],
    anim: "ravager",
    scale: 1,
    sound: "ravager"
  }, 128, [
    { name: "body", pivot: [0, 17, 0], from: [-7, 0, -11], size: [14, 15, 23] },
    { name: "neck", pivot: [0, 26, -10], from: [-5, -6, -9], size: [10, 11, 10] },
    { name: "head", parent: "neck", pivot: [0, 0, -9], from: [-8, -9, -12], size: [16, 16, 12] },
    { name: "jaw", parent: "head", pivot: [0, -8, -2], from: [-7, -3, -10], size: [14, 3, 11] },
    { name: "hornR", parent: "head", pivot: [8, 4, -6], from: [0, -1, -1], size: [5, 2, 2], rot: [0, 0, -0.5] },
    { name: "hornL", parent: "head", pivot: [-8, 4, -6], from: [-5, -1, -1], size: [5, 2, 2], rot: [0, 0, 0.5], share: "hornR" },
    { name: "leg0", pivot: [-4.5, 17, -7], from: [-3, -17, -3], size: [6, 17, 6] },
    { name: "leg1", pivot: [4.5, 17, -7], from: [-3, -17, -3], size: [6, 17, 6], share: "leg0" },
    { name: "leg2", pivot: [-4.5, 17, 8], from: [-3, -17, -3], size: [6, 17, 6], share: "leg0" },
    { name: "leg3", pivot: [4.5, 17, 8], from: [-3, -17, -3], size: [6, 17, 6], share: "leg0" }
  ]),
  model3({
    id: MOB_EVOKER_FANGS,
    key: "evoker_fangs",
    name: "唤魔者尖牙",
    hostile: true,
    burnsInSun: false,
    health: 1,
    walk: 0,
    run: 0,
    width: 0.5,
    height: 0.8,
    damage: 6,
    drops: [],
    anim: "fangs",
    scale: 1,
    inert: true
  }, 64, [
    { name: "base", pivot: [0, 0, 0], from: [-5, 0, -5], size: [10, 2, 10] },
    { name: "jawA", pivot: [0, 1, 0], from: [-4, 0, -1], size: [8, 12, 2], rot: [0.2, 0, 0] },
    { name: "jawB", pivot: [0, 1, 0], from: [-4, 0, -1], size: [8, 12, 2], rot: [-0.2, Math.PI, 0], share: "jawA" }
  ])
];
var OMEN_SECONDS = 100 * 60;
// goodPG/src/shared/warden.ts
ARMOR_BYPASS.add("sonic_boom");
var MOB_WARDEN = 70;
var WARDEN_POSE_SHIFT = 12;
var WARDEN_POSE_MASK = 7 << WARDEN_POSE_SHIFT;
var WARDEN_TENDRILS = 1 << 15;
var WARDEN_ANGER_SHIFT = 19;
var WARDEN_ANGER_MASK = 3 << WARDEN_ANGER_SHIFT;
var WARDEN_DEF = (() => {
  const { parts, atlas } = packParts(128, [
    { name: "body", pivot: [0, 13, 0], from: [-9, 0, -4], size: [18, 21, 11] },
    { name: "ribR", parent: "body", pivot: [0, 0, -4.1], from: [0, 0, 0], size: [9, 21, 0] },
    { name: "ribL", parent: "body", pivot: [0, 0, -4.1], from: [-9, 0, 0], size: [9, 21, 0] },
    { name: "heart", parent: "body", pivot: [0, 14, -4.05], from: [-3.5, -3.5, 0], size: [7, 7, 0] },
    { name: "head", parent: "body", pivot: [0, 21, 0], from: [-8, 0, -5], size: [16, 16, 10] },
    { name: "tendrilR", parent: "head", pivot: [8, 12, 0], from: [0, -3, 0], size: [16, 16, 0] },
    { name: "tendrilL", parent: "head", pivot: [-8, 12, 0], from: [-16, -3, 0], size: [16, 16, 0] },
    { name: "armR", parent: "body", pivot: [13, 21, 1], from: [-4, -28, -4], size: [8, 28, 8] },
    { name: "armL", parent: "body", pivot: [-13, 21, 1], from: [-4, -28, -4], size: [8, 28, 8] },
    { name: "legR", pivot: [5.9, 13, 0], from: [-3, -13, -3], size: [6, 13, 6] },
    { name: "legL", pivot: [-5.9, 13, 0], from: [-3, -13, -3], size: [6, 13, 6], share: "legR" }
  ]);
  return {
    id: MOB_WARDEN,
    key: "warden",
    name: "监守者",
    hostile: true,
    health: 500,
    walk: 2,
    run: 5,
    width: 0.9,
    height: 2.9,
    damage: 30,
    burnsInSun: false,
    drops: [[SCULK_CATALYST, 1, 1]],
    xp: 5,
    anim: "warden",
    scale: 1,
    sound: "warden",
    parts,
    atlas
  };
})();
// goodPG/src/shared/critters.ts
var MOB_BAT = 78;
var MOB_OCELOT = 79;
var MOB_MOOSHROOM = 80;
var MOB_TRADER_LLAMA = 81;
var MOB_SKELETON_HORSE = 82;
var MOB_ZOMBIE_HORSE = 83;
var OCELOT_TRUST_CHANCE = 1 / 3;
function batSpecs() {
  return [
    { name: "body", pivot: [0, 5, 0], from: [-1.5, 0, -1], size: [3, 5, 2] },
    { name: "head", pivot: [0, 10, 0], from: [-2, 0, -2], size: [4, 3, 3] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [0.5, 3, -1], size: [1, 2, 1] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-1.5, 3, -1], size: [1, 2, 1], share: "earR" },
    { name: "wingR", parent: "body", pivot: [1.5, 4.5, 0.5], from: [0, -5, 0], size: [5, 5, 0] },
    { name: "wingTipR", parent: "wingR", pivot: [5, 0, 0], from: [0, -4, 0], size: [4, 4, 0] },
    { name: "wingL", parent: "body", pivot: [-1.5, 4.5, 0.5], from: [-5, -5, 0], size: [5, 5, 0] },
    { name: "wingTipL", parent: "wingL", pivot: [-5, 0, 0], from: [-4, -4, 0], size: [4, 4, 0] },
    { name: "feet", parent: "body", pivot: [0, 0, 0], from: [-1.5, -1, -0.5], size: [3, 1, 1] }
  ];
}
function mushroomParts() {
  const out = [];
  const spots = [["head", "mushHead", [0, 4, -3]], ["body", "mushFront", [2, 10, -3]], ["body", "mushBack", [-2, 10, 4]]];
  for (const [parent, name, pivot] of spots) {
    for (const [k, a] of [["A", Math.PI / 4], ["B", -Math.PI / 4]]) {
      out.push({ name: `${name}${k}`, parent, pivot, from: [-4, 0, 0], size: [8, 8, 0], uv: [16, 44], rot: [0, a, 0] });
    }
  }
  return out;
}
var clone = (parts) => parts.map((p) => ({ ...p }));
function critterMobs(base, ids) {
  const cat = base[ids.cat], cow = base[ids.cow], llama = base[ids.llama], horse = base[ids.horse];
  const bat = packParts(32, batSpecs());
  const horseLike = (b) => ({ ...b, parts: clone(horse.parts), atlas: [horse.atlas[0], horse.atlas[1]] });
  return [
    {
      id: MOB_BAT,
      key: "bat",
      name: "蝙蝠",
      hostile: false,
      health: 6,
      walk: 3,
      run: 5,
      width: 0.5,
      height: 0.9,
      damage: 0,
      burnsInSun: false,
      drops: [],
      xp: 0,
      anim: "flyer",
      scale: 1,
      flying: true,
      parts: bat.parts,
      atlas: bat.atlas
    },
    {
      id: MOB_OCELOT,
      key: "ocelot",
      name: "豹猫",
      hostile: false,
      health: 10,
      walk: 1.4,
      run: 4.2,
      width: 0.6,
      height: 0.7,
      damage: 3,
      burnsInSun: false,
      drops: [],
      anim: "quadruped",
      scale: 1,
      parts: clone(cat.parts.filter((p) => p.name !== "collar")),
      atlas: [cat.atlas[0], cat.atlas[1]]
    },
    {
      id: MOB_MOOSHROOM,
      key: "mooshroom",
      name: "哞菇",
      hostile: false,
      health: 10,
      walk: 1.1,
      run: 2.4,
      width: 0.9,
      height: 1.4,
      damage: 0,
      burnsInSun: false,
      drops: [[LEATHER, 0, 2], [RAW_BEEF, 1, 3]],
      anim: "quadruped",
      scale: 1,
      sound: "cow",
      parts: [...clone(cow.parts), ...mushroomParts()],
      atlas: [cow.atlas[0], cow.atlas[1]]
    },
    {
      id: MOB_TRADER_LLAMA,
      key: "trader_llama",
      name: "商队羊驼",
      hostile: false,
      neutral: true,
      health: 20,
      walk: 1.2,
      run: 2.8,
      width: 0.9,
      height: 1.87,
      damage: 1,
      burnsInSun: false,
      drops: [[LEATHER, 0, 2]],
      anim: "quadruped",
      scale: llama.scale,
      parts: [...clone(llama.parts), { name: "decor", parent: "body", pivot: [0, 0, 0], from: [-6.5, 4.5, -9.5], size: [13, 6, 19], uv: [0, 64] }],
      atlas: [llama.atlas[0], 96]
    },
    horseLike({
      id: MOB_SKELETON_HORSE,
      key: "skeleton_horse",
      name: "骷髅马",
      hostile: false,
      health: 15,
      walk: 1.4,
      run: 3.4,
      width: 1.3,
      height: 1.6,
      damage: 0,
      burnsInSun: false,
      drops: [[BONE, 0, 2]],
      anim: "quadruped",
      scale: 1
    }),
    horseLike({
      id: MOB_ZOMBIE_HORSE,
      key: "zombie_horse",
      name: "僵尸马",
      hostile: false,
      health: 15,
      walk: 1.4,
      run: 3.4,
      width: 1.3,
      height: 1.6,
      damage: 0,
      burnsInSun: false,
      drops: [[ROTTEN_FLESH, 0, 2]],
      anim: "quadruped",
      scale: 1
    })
  ];
}
// goodPG/src/shared/netherMobs.ts
var MOB_PIGLIN = 84;
var MOB_PIGLIN_BRUTE = 85;
var MOB_ZOMBIFIED_PIGLIN = 86;
var MOB_GHAST = 87;
var MOB_BLAZE = 88;
var MOB_MAGMA_CUBE = 89;
var MOB_MAGMA_CUBE_MEDIUM = 90;
var MOB_MAGMA_CUBE_SMALL = 91;
var MOB_HOGLIN = 92;
var MOB_ZOGLIN = 93;
var MOB_STRIDER = 94;
var MOB_WITHER_SKELETON = 95;
var PIGLINS = new Set([MOB_PIGLIN, MOB_PIGLIN_BRUTE]);
var MAGMAS = [MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL];
var NETHER = new Set([
  MOB_PIGLIN,
  MOB_PIGLIN_BRUTE,
  MOB_ZOMBIFIED_PIGLIN,
  MOB_GHAST,
  MOB_BLAZE,
  ...MAGMAS,
  MOB_HOGLIN,
  MOB_ZOGLIN,
  MOB_STRIDER,
  MOB_WITHER_SKELETON
]);
var MAGMA_SPLIT = {
  [MOB_MAGMA_CUBE]: MOB_MAGMA_CUBE_MEDIUM,
  [MOB_MAGMA_CUBE_MEDIUM]: MOB_MAGMA_CUBE_SMALL
};
var GOLD_ARMOR_PIECES = [ARMOR.golden.helmet, ARMOR.golden.chestplate, ARMOR.golden.leggings, ARMOR.golden.boots];
var STRIDER_SPEED = 0.175;
function javaGroundSpeed(s) {
  return 20 * s * s / (1 - 0.6 * 0.91);
}
var BARTER = [
  { id: BOOK, weight: 5, min: 1, max: 1, mod: "soul_speed" },
  { id: ARMOR.iron.boots, weight: 8, min: 1, max: 1, mod: "soul_speed" },
  { id: POTION, weight: 8, min: 1, max: 1, mod: "fire_resistance" },
  { id: SPLASH_POTION, weight: 8, min: 1, max: 1, mod: "fire_resistance" },
  { id: POTION, weight: 10, min: 1, max: 1, mod: "water" },
  { id: IRON_NUGGET, weight: 10, min: 10, max: 36 },
  { id: ENDER_PEARL, weight: 10, min: 2, max: 4 },
  { id: STRING, weight: 20, min: 3, max: 9 },
  { id: QUARTZ2, weight: 20, min: 5, max: 12 },
  { id: OBSIDIAN, weight: 40, min: 1, max: 1 },
  { id: CRYING_OBSIDIAN, weight: 40, min: 1, max: 3 },
  { id: FIRE_CHARGE, weight: 40, min: 1, max: 1 },
  { id: LEATHER, weight: 40, min: 2, max: 4 },
  { id: SOUL_SAND, weight: 40, min: 2, max: 8 },
  { id: NETHER_BRICK, weight: 40, min: 2, max: 8 },
  { id: SPECTRAL_ARROW, weight: 40, min: 6, max: 12 },
  { id: GRAVEL, weight: 40, min: 8, max: 16 },
  { id: BLACKSTONE, weight: 40, min: 8, max: 16 }
];
var OVERWORLD_IN_NETHER = { skeleton: 7, enderman: 11 };
var FORTRESS_ENEMIES = [
  [MOB_BLAZE, 10, 2, 3],
  [MOB_ZOMBIFIED_PIGLIN, 5, 4, 4],
  [MOB_WITHER_SKELETON, 8, 5, 5],
  [OVERWORLD_IN_NETHER.skeleton, 2, 5, 5],
  [MOB_MAGMA_CUBE, 3, 4, 4]
];
var NETHER_SPAWNS = {
  nether_wastes: {
    monsters: [[MOB_GHAST, 50, 4, 4], [MOB_ZOMBIFIED_PIGLIN, 100, 4, 4], [MOB_MAGMA_CUBE, 2, 4, 4], [OVERWORLD_IN_NETHER.enderman, 1, 4, 4], [MOB_PIGLIN, 15, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]]
  },
  soul_sand_valley: {
    monsters: [[OVERWORLD_IN_NETHER.skeleton, 20, 5, 5], [MOB_GHAST, 50, 4, 4], [OVERWORLD_IN_NETHER.enderman, 1, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
    costs: {
      [OVERWORLD_IN_NETHER.skeleton]: [0.7, 0.15],
      [MOB_GHAST]: [0.7, 0.15],
      [OVERWORLD_IN_NETHER.enderman]: [0.7, 0.15],
      [MOB_STRIDER]: [0.7, 0.15]
    }
  },
  basalt_deltas: {
    monsters: [[MOB_GHAST, 40, 1, 1], [MOB_MAGMA_CUBE, 100, 2, 5]],
    creatures: [[MOB_STRIDER, 60, 1, 2]]
  },
  crimson_forest: {
    monsters: [[MOB_ZOMBIFIED_PIGLIN, 1, 2, 4], [MOB_HOGLIN, 9, 3, 4], [MOB_PIGLIN, 5, 3, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]]
  },
  warped_forest: {
    monsters: [[OVERWORLD_IN_NETHER.enderman, 1, 4, 4]],
    creatures: [[MOB_STRIDER, 60, 1, 2]],
    costs: { [OVERWORLD_IN_NETHER.enderman]: [1, 0.12] }
  }
};
function jb(p) {
  const [ox, oy, oz] = p.o;
  const [x, y, z, w, h, d] = p.box;
  const part = {
    name: p.name,
    pivot: [-ox, p.parent ? -oy : 24 - oy, oz],
    from: [-(x + w), -(y + h), z],
    size: [w, h, d],
    uv: [p.uv[0], p.uv[1]]
  };
  if (p.parent)
    part.parent = p.parent;
  if (p.r)
    part.rot = [-p.r[0], -p.r[1], -p.r[2]];
  if (p.grow)
    part.grow = p.grow;
  return part;
}
var PI6 = Math.PI / 6;
function piglinParts() {
  return [
    jb({ name: "head", o: [0, 0, 0], box: [-5, -8, -4, 10, 8, 8], uv: [0, 0] }),
    jb({ name: "snout", parent: "head", o: [0, 0, 0], box: [-2, -4, -5, 4, 4, 1], uv: [31, 1] }),
    jb({ name: "tuskL", parent: "head", o: [0, 0, 0], box: [2, -2, -5, 1, 2, 1], uv: [2, 4] }),
    jb({ name: "tuskR", parent: "head", o: [0, 0, 0], box: [-3, -2, -5, 1, 2, 1], uv: [2, 0] }),
    jb({ name: "earL", parent: "head", o: [4.5, -6, 0], box: [0, 0, -2, 1, 5, 4], uv: [51, 6], r: [0, 0, -PI6] }),
    jb({ name: "earR", parent: "head", o: [-4.5, -6, 0], box: [-1, 0, -2, 1, 5, 4], uv: [39, 6], r: [0, 0, PI6] }),
    jb({ name: "body", o: [0, 0, 0], box: [-4, 0, -2, 8, 12, 4], uv: [16, 16] }),
    jb({ name: "armR", o: [-5, 2, 0], box: [-3, -2, -2, 4, 12, 4], uv: [40, 16] }),
    jb({ name: "armL", o: [5, 2, 0], box: [-1, -2, -2, 4, 12, 4], uv: [32, 48] }),
    jb({ name: "legR", o: [-1.9, 12, 0], box: [-2, 0, -2, 4, 12, 4], uv: [0, 16] }),
    jb({ name: "legL", o: [1.9, 12, 0], box: [-2, 0, -2, 4, 12, 4], uv: [16, 48] })
  ];
}
var GHAST_TENTACLES = [
  [-3.75, -5, 8],
  [1.25, -5, 13],
  [6.25, -5, 9],
  [-6.25, 0, 11],
  [-1.25, 0, 11],
  [3.75, 0, 10],
  [-3.75, 5, 12],
  [1.25, 5, 9],
  [6.25, 5, 12]
];
function ghastParts() {
  const parts = [jb({ name: "body", o: [0, 17.6, 0], box: [-8, -8, -8, 16, 16, 16], uv: [0, 0] })];
  GHAST_TENTACLES.forEach(([xo, zo, len], i) => {
    parts.push(jb({ name: `tent${i}`, o: [xo, 24.6, zo], box: [-1, 0, -1, 2, len, 2], uv: [i % 8 * 8, i < 8 ? 32 : 48] }));
  });
  return parts;
}
function blazeRodPos(i, t) {
  if (i < 4) {
    const a = t * Math.PI * -0.1 + i;
    return [Math.cos(a) * 9, -2 + Math.cos((i * 2 + t) * 0.25), Math.sin(a) * 9];
  }
  if (i < 8) {
    const a = Math.PI / 4 + t * Math.PI * 0.03 + (i - 4);
    return [Math.cos(a) * 7, 2 + Math.cos((i * 2 + t) * 0.25), Math.sin(a) * 7];
  }
  const a = 0.47123894 + t * Math.PI * -0.05 + (i - 8);
  return [Math.cos(a) * 5, 11 + Math.cos((i * 1.5 + t) * 0.5), Math.sin(a) * 5];
}
function blazeParts() {
  const parts = [jb({ name: "head", o: [0, 0, 0], box: [-4, -4, -4, 8, 8, 8], uv: [0, 0] })];
  for (let i = 0;i < 12; i++)
    parts.push(jb({ name: `rod${i}`, o: blazeRodPos(i, 0), box: [0, 0, 0, 2, 8, 2], uv: [0, 16] }));
  return parts;
}
function magmaParts() {
  const parts = [];
  for (let i = 0;i < 8; i++) {
    const uv = i < 4 ? [0, 9 * i] : [32, 9 * i - 36];
    parts.push(jb({ name: `cube${i}`, o: [0, 0, 0], box: [-4, 16 + i, -4, 8, 1, 8], uv }));
  }
  parts.push(jb({ name: "core", o: [0, 0, 0], box: [-2, 18, -2, 4, 4, 4], uv: [24, 40] }));
  return parts;
}
var HOGLIN_EAR = Math.PI * 2 / 9;
var HOGLIN_HEAD_REST = 0.87266463;
function hoglinParts() {
  return [
    jb({ name: "body", o: [0, 7, 0], box: [-8, -7, -13, 16, 14, 26], uv: [1, 1] }),
    jb({ name: "mane", parent: "body", o: [0, -14, -7], box: [0, 0, -9, 0, 10, 19], uv: [90, 33] }),
    jb({ name: "head", o: [0, 2, -12], box: [-7, -3, -19, 14, 6, 19], uv: [61, 1], r: [HOGLIN_HEAD_REST, 0, 0] }),
    jb({ name: "earR", parent: "head", o: [-6, -2, -3], box: [-6, -1, -2, 6, 1, 4], uv: [1, 1], r: [0, 0, -HOGLIN_EAR] }),
    jb({ name: "earL", parent: "head", o: [6, -2, -3], box: [0, -1, -2, 6, 1, 4], uv: [1, 6], r: [0, 0, HOGLIN_EAR] }),
    jb({ name: "hornR", parent: "head", o: [-7, 2, -12], box: [-1, -11, -1, 2, 11, 2], uv: [10, 13] }),
    jb({ name: "hornL", parent: "head", o: [7, 2, -12], box: [-1, -11, -1, 2, 11, 2], uv: [1, 13] }),
    jb({ name: "legFR", o: [-4, 10, -8.5], box: [-3, 0, -3, 6, 14, 6], uv: [66, 42] }),
    jb({ name: "legFL", o: [4, 10, -8.5], box: [-3, 0, -3, 6, 14, 6], uv: [41, 42] }),
    jb({ name: "legBR", o: [-5, 13, 10], box: [-2.5, 0, -2.5, 5, 11, 5], uv: [21, 45] }),
    jb({ name: "legBL", o: [5, 13, 10], box: [-2.5, 0, -2.5, 5, 11, 5], uv: [0, 45] })
  ];
}
var STRIDER_BRISTLES = {
  bristleRB: -1.2217305,
  bristleRM: -1.134464,
  bristleRT: -0.87266463,
  bristleLT: 0.87266463,
  bristleLM: 1.134464,
  bristleLB: 1.2217305
};
function striderParts() {
  const b = STRIDER_BRISTLES;
  return [
    jb({ name: "legR", o: [-4, 8, 0], box: [-2, 0, -2, 4, 16, 4], uv: [0, 32] }),
    jb({ name: "legL", o: [4, 8, 0], box: [-2, 0, -2, 4, 16, 4], uv: [0, 55] }),
    jb({ name: "body", o: [0, 1, 0], box: [-8, -6, -8, 16, 14, 16], uv: [0, 0] }),
    jb({ name: "bristleRB", parent: "body", o: [-8, 4, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 65], r: [0, 0, b.bristleRB] }),
    jb({ name: "bristleRM", parent: "body", o: [-8, -1, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 49], r: [0, 0, b.bristleRM] }),
    jb({ name: "bristleRT", parent: "body", o: [-8, -5, -8], box: [-12, 0, 0, 12, 0, 16], uv: [16, 33], r: [0, 0, b.bristleRT] }),
    jb({ name: "bristleLT", parent: "body", o: [8, -6, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 33], r: [0, 0, b.bristleLT] }),
    jb({ name: "bristleLM", parent: "body", o: [8, -2, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 49], r: [0, 0, b.bristleLM] }),
    jb({ name: "bristleLB", parent: "body", o: [8, 3, -8], box: [0, 0, 0, 12, 0, 16], uv: [16, 65], r: [0, 0, b.bristleLB] }),
    jb({ name: "saddle", parent: "body", o: [0, 0, 0], box: [-8, -6, -8, 16, 7, 16], uv: [0, 90], grow: 0.5 })
  ];
}
function witherSkeletonParts() {
  return [
    jb({ name: "head", o: [0, 0, 0], box: [-4, -8, -4, 8, 8, 8], uv: [0, 0] }),
    jb({ name: "body", o: [0, 0, 0], box: [-4, 0, -2, 8, 12, 4], uv: [16, 16] }),
    jb({ name: "armR", o: [-5, 2, 0], box: [-1, -2, -1, 2, 12, 2], uv: [40, 16] }),
    jb({ name: "armL", o: [5, 2, 0], box: [-1, -2, -1, 2, 12, 2], uv: [40, 16] }),
    jb({ name: "legR", o: [-2, 12, 0], box: [-1, 0, -1, 2, 12, 2], uv: [0, 16] }),
    jb({ name: "legL", o: [2, 12, 0], box: [-1, 0, -1, 2, 12, 2], uv: [0, 16] })
  ];
}
var piglinBase = (health, damage) => ({
  hostile: true,
  neutral: true,
  health,
  walk: javaGroundSpeed(0.6 * 0.35),
  run: javaGroundSpeed(0.35),
  width: 0.6,
  height: 1.95,
  damage,
  burnsInSun: false,
  drops: []
});
var magma = (id, key, name, size) => ({
  id,
  key,
  name,
  hostile: true,
  health: size * size,
  walk: javaGroundSpeed(0.2 + 0.1 * size),
  run: javaGroundSpeed(0.2 + 0.1 * size),
  width: 0.52 * size,
  height: 0.52 * size,
  damage: size + 2,
  burnsInSun: false,
  drops: size >= 2 ? [[MAGMA_CREAM, -2, 1]] : [],
  atlas: [64, 64],
  parts: magmaParts(),
  anim: "magma",
  scale: size,
  fireImmune: true,
  fullBright: true,
  xp: size,
  sound: size === 1 ? "magma_cube_small" : "magma_cube"
});
function netherMobs() {
  return [
    {
      id: MOB_PIGLIN,
      key: "piglin",
      name: "猪灵",
      ...piglinBase(16, 5),
      atlas: [64, 64],
      parts: piglinParts(),
      anim: "piglin",
      scale: 1,
      xp: 5
    },
    {
      id: MOB_PIGLIN_BRUTE,
      key: "piglin_brute",
      name: "猪灵蛮兵",
      ...piglinBase(50, 7),
      atlas: [64, 64],
      parts: piglinParts(),
      anim: "piglin",
      scale: 1,
      xp: 20
    },
    {
      id: MOB_ZOMBIFIED_PIGLIN,
      key: "zombified_piglin",
      name: "僵尸猪灵",
      hostile: true,
      neutral: true,
      health: 20,
      walk: javaGroundSpeed(0.23),
      run: javaGroundSpeed(0.28),
      width: 0.6,
      height: 1.95,
      damage: 5,
      burnsInSun: false,
      drops: [[ROTTEN_FLESH, 0, 1], [GOLD_NUGGET, 0, 1]],
      atlas: [64, 64],
      parts: piglinParts(),
      anim: "piglin",
      scale: 1,
      fireImmune: true,
      xp: 5,
      babyXp: 12
    },
    {
      id: MOB_GHAST,
      key: "ghast",
      name: "恶魂",
      hostile: true,
      health: 10,
      walk: 1.2,
      run: 1.2,
      width: 4,
      height: 4,
      damage: 0,
      burnsInSun: false,
      drops: [[GHAST_TEAR, 0, 1], [GUNPOWDER, 0, 2]],
      atlas: [64, 64],
      parts: ghastParts(),
      anim: "ghast",
      scale: 4.5,
      flying: true,
      fireImmune: true,
      xp: 5
    },
    {
      id: MOB_BLAZE,
      key: "blaze",
      name: "烈焰人",
      hostile: true,
      health: 20,
      walk: javaGroundSpeed(0.23),
      run: javaGroundSpeed(0.23),
      width: 0.6,
      height: 1.8,
      damage: 6,
      burnsInSun: false,
      drops: [],
      atlas: [64, 32],
      parts: blazeParts(),
      anim: "blaze",
      scale: 1,
      fireImmune: true,
      fullBright: true,
      xp: 10
    },
    magma(MOB_MAGMA_CUBE, "magma_cube", "岩浆怪", 4),
    magma(MOB_MAGMA_CUBE_MEDIUM, "magma_cube_medium", "中型岩浆怪", 2),
    magma(MOB_MAGMA_CUBE_SMALL, "magma_cube_small", "小型岩浆怪", 1),
    {
      id: MOB_HOGLIN,
      key: "hoglin",
      name: "疣猪兽",
      hostile: true,
      health: 40,
      walk: javaGroundSpeed(0.4 * 0.3),
      run: javaGroundSpeed(0.3),
      width: 1.3964844,
      height: 1.4,
      damage: 6,
      burnsInSun: false,
      drops: [[RAW_PORKCHOP, 2, 4], [LEATHER, 0, 1]],
      atlas: [128, 64],
      parts: hoglinParts(),
      anim: "hoglin",
      scale: 1,
      xp: 5,
      babyXp: 3
    },
    {
      id: MOB_ZOGLIN,
      key: "zoglin",
      name: "僵尸疣猪兽",
      hostile: true,
      health: 40,
      walk: javaGroundSpeed(0.4 * 0.3),
      run: javaGroundSpeed(0.3),
      width: 1.3964844,
      height: 1.4,
      damage: 6,
      burnsInSun: false,
      drops: [[ROTTEN_FLESH, 1, 3]],
      atlas: [128, 64],
      parts: hoglinParts(),
      anim: "hoglin",
      scale: 1,
      fireImmune: true,
      xp: 5,
      babyXp: 5
    },
    {
      id: MOB_STRIDER,
      key: "strider",
      name: "炽足兽",
      hostile: false,
      health: 20,
      walk: javaGroundSpeed(STRIDER_SPEED),
      run: javaGroundSpeed(STRIDER_SPEED * 1.65),
      width: 0.9,
      height: 1.7,
      damage: 0,
      burnsInSun: false,
      drops: [[STRING, 2, 5]],
      atlas: [64, 128],
      parts: striderParts(),
      anim: "strider",
      scale: 1,
      fireImmune: true
    },
    {
      id: MOB_WITHER_SKELETON,
      key: "wither_skeleton",
      name: "凋灵骷髅",
      hostile: true,
      health: 20,
      walk: javaGroundSpeed(0.25),
      run: javaGroundSpeed(0.25 * 1.2),
      width: 0.7,
      height: 2.4,
      damage: 8,
      burnsInSun: false,
      drops: [[COAL, -1, 1], [BONE, 0, 2]],
      atlas: [64, 32],
      parts: witherSkeletonParts(),
      anim: "wither_skeleton",
      scale: 1.2,
      fireImmune: true,
      xp: 5
    }
  ];
}
// goodPG/src/shared/endMobs.ts
var MOB_ENDERMITE = 96;
var MOB_ENDER_DRAGON = 97;
var MOB_SHULKER = 98;
var SHULKER_HEALTH = 30;
var DRAGON_HEALTH = 200;
function endermiteParts() {
  const sizes = [[4, 3, 2], [6, 4, 5], [3, 3, 1], [1, 2, 1]];
  const uvs = [[0, 0], [0, 5], [0, 14], [0, 18]];
  const out = [];
  let z = -3.5;
  for (let i = 0;i < 4; i++) {
    const s = sizes[i];
    out.push({ name: `seg${i}`, pivot: [0, 0, z], from: [-s[0] / 2, 0, -s[2] / 2], size: s, uv: uvs[i] });
    if (i < 3)
      z += (s[2] + sizes[i + 1][2]) * 0.5;
  }
  return out;
}
function shulkerParts() {
  return [
    { name: "lid", pivot: [0, 0, 0], from: [-8, 4, -8], size: [16, 12, 16], uv: [0, 0] },
    { name: "base", pivot: [0, 0, 0], from: [-8, 0, -8], size: [16, 8, 16], uv: [0, 28] },
    { name: "head", pivot: [0, 12, 0], from: [-3, -6, -3], size: [6, 6, 6], uv: [0, 52] }
  ];
}
function endMobs() {
  return [
    {
      id: MOB_ENDERMITE,
      key: "endermite",
      name: "末影螨",
      hostile: true,
      health: 8,
      walk: 1.4,
      run: javaGroundSpeed(0.25),
      width: 0.4,
      height: 0.3,
      damage: 2,
      burnsInSun: false,
      drops: [],
      atlas: [64, 32],
      parts: endermiteParts(),
      anim: "endermite",
      scale: 1,
      xp: 3
    },
    {
      id: MOB_ENDER_DRAGON,
      key: "ender_dragon",
      name: "末影龙",
      hostile: true,
      health: DRAGON_HEALTH,
      walk: 0,
      run: 0,
      width: 16,
      height: 8,
      damage: 10,
      burnsInSun: false,
      drops: [],
      atlas: [256, 256],
      parts: [],
      anim: "dragon",
      scale: 1,
      flying: true,
      fireImmune: true,
      xp: 0
    },
    {
      id: MOB_SHULKER,
      key: "shulker",
      name: "潜影贝",
      hostile: true,
      health: SHULKER_HEALTH,
      walk: 0,
      run: 0,
      width: 1,
      height: 1,
      damage: 0,
      burnsInSun: false,
      drops: [],
      atlas: [64, 64],
      parts: shulkerParts(),
      anim: "shulker",
      scale: 1,
      xp: 5
    }
  ];
}
var END = new Set([MOB_ENDERMITE, MOB_ENDER_DRAGON, MOB_SHULKER]);
// goodPG/src/shared/witherMobs.ts
var MOB_WITHER = 99;
var WITHER_HEALTH = 300;
var WITHER_XP = 50;
function witherParts() {
  const ribX = 0.20420352;
  return [
    jb({ name: "shoulders", o: [0, 0, 0], box: [-10, 3.9, -0.5, 20, 3, 3], uv: [0, 16] }),
    jb({ name: "ribcage", o: [-2, 6.9, -0.5], box: [0, 0, 0, 3, 10, 3], uv: [0, 22], r: [ribX, 0, 0] }),
    jb({ name: "rib0", parent: "ribcage", o: [0, 0, 0], box: [-4, 1.5, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: "rib1", parent: "ribcage", o: [0, 0, 0], box: [-4, 4, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: "rib2", parent: "ribcage", o: [0, 0, 0], box: [-4, 6.5, 0.5, 11, 2, 2], uv: [24, 22] }),
    jb({ name: "tail", o: [-2, 6.9 + Math.cos(ribX) * 10, -0.5 + Math.sin(ribX) * 10], box: [0, 0, 0, 3, 6, 3], uv: [12, 22], r: [0.83252203, 0, 0] }),
    jb({ name: "center_head", o: [0, 0, 0], box: [-4, -4, -4, 8, 8, 8], uv: [0, 0] }),
    jb({ name: "right_head", o: [-8, 4, 0], box: [-4, -4, -4, 6, 6, 6], uv: [32, 0] }),
    jb({ name: "left_head", o: [10, 4, 0], box: [-4, -4, -4, 6, 6, 6], uv: [32, 0] }),
    jb({ name: "skull", o: [0, 0, 0], box: [-4, -8, -4, 8, 8, 8], uv: [0, 35] })
  ];
}
function witherMobs() {
  return [
    {
      id: MOB_WITHER,
      key: "wither",
      name: "凋灵",
      hostile: true,
      health: WITHER_HEALTH,
      walk: 0.6 * 20,
      run: 0.6 * 20,
      width: 0.9,
      height: 3.5,
      damage: 0,
      burnsInSun: false,
      drops: [],
      atlas: [64, 64],
      parts: witherParts(),
      anim: "wither",
      scale: 2,
      flying: true,
      fireImmune: true,
      fullBright: true,
      xp: WITHER_XP
    }
  ];
}

// goodPG/src/shared/mobs.ts
var MOB_PIG = 1;
var MOB_COW = 2;
var MOB_SHEEP = 3;
var MOB_CHICKEN = 4;
var MOB_ZOMBIE = 5;
var MOB_HUSK = 6;
var MOB_SKELETON = 7;
var MOB_STRAY = 8;
var MOB_CREEPER = 9;
var MOB_SPIDER = 10;
var MOB_ENDERMAN = 11;
var MOB_SQUID = 12;
var MOB_FOX = 13;
var MOB_GOAT = 14;
var MOB_POLAR_BEAR = 15;
var MOB_RABBIT = 16;
var MOB_WOLF = 17;
var MOB_VILLAGER = 18;
var MOB_WANDERING_TRADER = 19;
var MOB_HORSE = 25;
var MOB_DONKEY = 26;
var MOB_MULE = 27;
var MOB_LLAMA = 28;
var MOB_CAMEL = 29;
var MOB_DROWNED = 40;
var MOB_WITCH = 41;
var MOB_SLIME = 42;
var MOB_PHANTOM = 43;
var MOB_SILVERFISH = 44;
var MOB_CAVE_SPIDER = 45;
var MOB_ZOMBIE_VILLAGER = 46;
var MOB_SLIME_MEDIUM = 47;
var MOB_SLIME_SMALL = 48;
var MOB_IRON_GOLEM = 20;
var MOB_SNOW_GOLEM = 21;
var MOB_CAT = 22;
var MOB_BEE = 50;
var MOB_PANDA = 51;
var MOB_PARROT = 52;
var MOB_ARMADILLO = 53;
var quadLegs = (h, xs, zs, uv, w = 4) => [
  { name: "leg0", pivot: [-xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: "leg1", pivot: [xs, h, zs[0]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: "leg2", pivot: [-xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv },
  { name: "leg3", pivot: [xs, h, zs[1]], from: [-w / 2, -h, -w / 2], size: [w, h, w], uv }
];
var humanoid = (thin) => {
  const limb = thin ? 2 : 4;
  return [
    { name: "head", pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: "body", pivot: [0, 12, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    { name: "armR", pivot: [thin ? 5 : 6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: [40, 16] },
    { name: "armL", pivot: [thin ? -5 : -6, 22, 0], from: [-limb / 2, -10, -limb / 2], size: [limb, 12, limb], uv: thin ? [40, 32] : [32, 48] },
    { name: "legR", pivot: [2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: [0, 16] },
    { name: "legL", pivot: [-2, 12, 0], from: [-limb / 2, -12, -limb / 2], size: [limb, 12, limb], uv: thin ? [0, 32] : [16, 48] }
  ];
};
var spiderLegs = () => {
  const legs = [];
  const zs = [-1, 0, 1, 2];
  for (let i = 0;i < 4; i++) {
    const yaw = [0.75, 0.3, -0.3, -0.75][i];
    legs.push({ name: `leg${i * 2}`, parent: "thorax", pivot: [3, 0, zs[i]], from: [0, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, yaw, 0.6] });
    legs.push({ name: `leg${i * 2 + 1}`, parent: "thorax", pivot: [-3, 0, zs[i]], from: [-16, -1, -1], size: [16, 2, 2], uv: [0, 40], rot: [0, -yaw, -0.6] });
  }
  return legs;
};
var squidTentacles = () => {
  const t = [];
  for (let i = 0;i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    t.push({ name: `tent${i}`, parent: "body", pivot: [Math.cos(a) * 5, -8, Math.sin(a) * 5], from: [-1, -18, -1], size: [2, 18, 2], uv: [48, 0] });
  }
  return t;
};
var MOBS = [];
function mob(d) {
  MOBS[d.id] = d;
}
mob({
  id: MOB_PIG,
  key: "pig",
  name: "猪",
  hostile: false,
  health: 10,
  walk: 1.2,
  run: 2.6,
  width: 0.9,
  height: 0.9,
  damage: 0,
  burnsInSun: false,
  drops: [[RAW_PORKCHOP, 1, 3]],
  atlas: [64, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 6, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 32] },
    { name: "head", pivot: [0, 12, -8], from: [-4, -4, -8], size: [8, 8, 8], uv: [0, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 3, 1], uv: [16, 16] },
    ...quadLegs(6, 3, [-5, 5], [0, 16]),
    { name: "saddle", pivot: [0, 6, 0], from: [-5.5, 5, -4], size: [11, 4, 8], uv: [26, 16] }
  ]
});
mob({
  id: MOB_COW,
  key: "cow",
  name: "牛",
  hostile: false,
  health: 10,
  walk: 1.1,
  run: 2.4,
  width: 0.9,
  height: 1.4,
  damage: 0,
  burnsInSun: false,
  drops: [[LEATHER, 0, 2], [RAW_BEEF, 1, 3]],
  atlas: [64, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 12, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 16] },
    { name: "head", pivot: [0, 20, -9], from: [-4, -4, -6], size: [8, 8, 6], uv: [0, 0] },
    { name: "hornR", parent: "head", pivot: [0, 0, 0], from: [4, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    { name: "hornL", parent: "head", pivot: [0, 0, 0], from: [-5, 2, -4], size: [1, 3, 1], uv: [28, 0] },
    ...quadLegs(12, 4, [-6, 7], [0, 44])
  ]
});
mob({
  id: MOB_SHEEP,
  key: "sheep",
  name: "羊",
  hostile: false,
  health: 8,
  walk: 1.1,
  run: 2.4,
  width: 0.9,
  height: 1.3,
  damage: 0,
  burnsInSun: false,
  drops: [[WHITE_WOOL, 1, 1], [RAW_MUTTON, 1, 2]],
  atlas: [64, 96],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 12, 0], from: [-5, 0, -8], size: [10, 8, 16], uv: [0, 14] },
    { name: "wool", parent: "body", pivot: [0, 0, 0], from: [-6, -1, -9], size: [12, 10, 18], uv: [0, 56] },
    { name: "head", pivot: [0, 18, -8], from: [-3, -4, -8], size: [6, 6, 8], uv: [0, 0] },
    ...quadLegs(12, 3, [-5, 6], [0, 38])
  ]
});
mob({
  id: MOB_CHICKEN,
  key: "chicken",
  name: "鸡",
  hostile: false,
  health: 4,
  walk: 1,
  run: 2.2,
  width: 0.4,
  height: 0.7,
  damage: 0,
  burnsInSun: false,
  drops: [[FEATHER, 0, 2], [RAW_CHICKEN, 1, 1]],
  atlas: [64, 64],
  anim: "chicken",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 5, 0], from: [-3, 0, -4], size: [6, 6, 8], uv: [0, 9] },
    { name: "head", pivot: [0, 9, -4], from: [-2, 0, -3], size: [4, 6, 3], uv: [0, 0] },
    { name: "beak", parent: "head", pivot: [0, 0, 0], from: [-2, 3, -5], size: [4, 2, 2], uv: [14, 0] },
    { name: "wattle", parent: "head", pivot: [0, 0, 0], from: [-1, 1, -4], size: [2, 2, 2], uv: [14, 4] },
    { name: "legR", pivot: [1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: "legL", pivot: [-1.5, 5, 1], from: [-1.5, -5, -1.5], size: [3, 5, 3], uv: [26, 0] },
    { name: "wingR", pivot: [3, 10, 0], from: [0, -4, -3], size: [1, 4, 6], uv: [28, 9] },
    { name: "wingL", pivot: [-3, 10, 0], from: [-1, -4, -3], size: [1, 4, 6], uv: [28, 9] }
  ]
});
mob({
  id: MOB_ZOMBIE,
  key: "zombie",
  name: "僵尸",
  hostile: true,
  health: 20,
  walk: 1,
  run: 2.4,
  width: 0.6,
  height: 1.95,
  damage: 3,
  burnsInSun: true,
  drops: [[ROTTEN_FLESH, 0, 2]],
  atlas: [64, 64],
  anim: "zombie",
  scale: 1,
  parts: humanoid(false)
});
mob({
  id: MOB_HUSK,
  key: "husk",
  name: "尸壳",
  hostile: true,
  health: 20,
  walk: 1,
  run: 2.4,
  width: 0.6,
  height: 1.95,
  damage: 3,
  burnsInSun: false,
  drops: [[ROTTEN_FLESH, 0, 2]],
  atlas: [64, 64],
  anim: "zombie",
  scale: 1.06,
  parts: humanoid(false)
});
mob({
  id: MOB_SKELETON,
  key: "skeleton",
  name: "骷髅",
  hostile: true,
  health: 20,
  walk: 1.1,
  run: 2.3,
  width: 0.6,
  height: 1.99,
  damage: 2,
  burnsInSun: true,
  drops: [[BONE, 0, 2], [ARROW, 0, 2]],
  atlas: [64, 64],
  anim: "skeleton",
  scale: 1,
  parts: humanoid(true)
});
mob({
  id: MOB_STRAY,
  key: "stray",
  name: "流浪者",
  hostile: true,
  health: 20,
  walk: 1.1,
  run: 2.3,
  width: 0.6,
  height: 1.99,
  damage: 2,
  burnsInSun: true,
  drops: [[BONE, 0, 2], [ARROW, 0, 2]],
  atlas: [64, 64],
  anim: "skeleton",
  scale: 1,
  parts: humanoid(true)
});
mob({
  id: MOB_CREEPER,
  key: "creeper",
  name: "苦力怕",
  hostile: true,
  health: 20,
  walk: 1,
  run: 2.2,
  width: 0.6,
  height: 1.7,
  damage: 0,
  burnsInSun: false,
  drops: [[GUNPOWDER, 0, 2]],
  atlas: [64, 64],
  anim: "creeper",
  scale: 1,
  parts: [
    { name: "head", pivot: [0, 18, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: "body", pivot: [0, 6, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [16, 16] },
    ...quadLegs(6, 2, [-4, 4], [0, 16])
  ]
});
mob({
  id: MOB_SPIDER,
  key: "spider",
  name: "蜘蛛",
  hostile: true,
  neutral: true,
  health: 16,
  walk: 1.3,
  run: 3,
  width: 1.4,
  height: 0.9,
  damage: 2,
  burnsInSun: false,
  drops: [[STRING, 0, 2], [SPIDER_EYE, 0, 1]],
  atlas: [64, 64],
  anim: "spider",
  scale: 1,
  parts: [
    { name: "thorax", pivot: [0, 9, 0], from: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] },
    { name: "head", parent: "thorax", pivot: [0, 0, -3], from: [-4, -4, -8], size: [8, 8, 8], uv: [32, 4] },
    { name: "abdomen", parent: "thorax", pivot: [0, 0, 3], from: [-5, -4, 0], size: [10, 8, 12], uv: [0, 20] },
    ...spiderLegs()
  ]
});
mob({
  id: MOB_ENDERMAN,
  key: "enderman",
  name: "末影人",
  hostile: true,
  neutral: true,
  health: 40,
  walk: 1.2,
  run: 3.4,
  width: 0.6,
  height: 2.9,
  damage: 7,
  burnsInSun: false,
  drops: [[ENDER_PEARL, 0, 1]],
  atlas: [64, 64],
  anim: "enderman",
  scale: 0.93,
  parts: [
    { name: "head", pivot: [0, 42, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: "body", pivot: [0, 30, 0], from: [-4, 0, -2], size: [8, 12, 4], uv: [32, 16] },
    { name: "armR", pivot: [5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: "armL", pivot: [-5, 40, 0], from: [-1, -28, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: "legR", pivot: [2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] },
    { name: "legL", pivot: [-2, 30, 0], from: [-1, -30, -1], size: [2, 30, 2], uv: [56, 0] }
  ]
});
mob({
  id: MOB_SQUID,
  key: "squid",
  name: "鱿鱼",
  hostile: false,
  health: 10,
  walk: 1.2,
  run: 2.5,
  width: 0.8,
  height: 0.8,
  damage: 0,
  burnsInSun: false,
  drops: [[INK_SAC, 1, 3]],
  atlas: [64, 32],
  anim: "squid",
  scale: 0.8,
  aquatic: true,
  parts: [{ name: "body", pivot: [0, 18, 0], from: [-6, -8, -6], size: [12, 16, 12], uv: [0, 0] }, ...squidTentacles()]
});
mob({
  id: MOB_FOX,
  key: "fox",
  name: "狐狸",
  hostile: false,
  health: 10,
  walk: 1.3,
  run: 3.2,
  width: 0.6,
  height: 0.7,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [64, 48],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 6, 0], from: [-3, 0, -6], size: [6, 6, 11], uv: [0, 12] },
    { name: "head", pivot: [0, 10, -6], from: [-4, -3, -6], size: [8, 6, 6], uv: [0, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-2, -3, -9], size: [4, 2, 3], uv: [28, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [1, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-3, 3, -4], size: [2, 2, 1], uv: [44, 0] },
    { name: "tail", pivot: [0, 10, 5], from: [-2, -2, 0], size: [4, 4, 9], uv: [34, 12], rot: [0.7, 0, 0] },
    ...quadLegs(6, 2, [-4, 3], [0, 30], 2)
  ]
});
mob({
  id: MOB_GOAT,
  key: "goat",
  name: "山羊",
  hostile: false,
  health: 10,
  walk: 1.2,
  run: 2.8,
  width: 0.9,
  height: 1.3,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [64, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 10, 0], from: [-4, 0, -7], size: [8, 8, 14], uv: [0, 20] },
    { name: "head", pivot: [0, 17, -7], from: [-2.5, -2, -6], size: [5, 6, 6], uv: [0, 0] },
    { name: "hornR", parent: "head", pivot: [0, 0, 0], from: [1, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: "hornL", parent: "head", pivot: [0, 0, 0], from: [-2, 4, -2], size: [1, 5, 1], uv: [28, 0] },
    { name: "beard", parent: "head", pivot: [0, 0, 0], from: [-0.5, -5, -6], size: [1, 3, 1], uv: [34, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [2.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-5.5, 2, -2], size: [3, 1, 2], uv: [40, 0] },
    ...quadLegs(10, 2.5, [-5, 5], [0, 44], 3)
  ]
});
mob({
  id: MOB_POLAR_BEAR,
  key: "polar_bear",
  name: "北极熊",
  hostile: false,
  neutral: true,
  health: 30,
  walk: 1,
  run: 2.6,
  width: 1.4,
  height: 1.4,
  damage: 6,
  burnsInSun: false,
  drops: [[COD, 0, 2], [SALMON, 0, 2]],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 10, 0], from: [-6, 0, -11], size: [12, 12, 22], uv: [0, 20] },
    { name: "head", pivot: [0, 19, -11], from: [-4, -4, -7], size: [8, 8, 7], uv: [0, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-2.5, -4, -10], size: [5, 3, 3], uv: [32, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [2, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-4, 4, -3], size: [2, 2, 1], uv: [50, 0] },
    ...quadLegs(10, 4, [-8, 8], [70, 20], 5)
  ]
});
mob({
  id: MOB_RABBIT,
  key: "rabbit",
  name: "兔子",
  hostile: false,
  health: 3,
  walk: 1.6,
  run: 3.6,
  width: 0.4,
  height: 0.5,
  damage: 0,
  burnsInSun: false,
  drops: [[RAW_RABBIT, 0, 1], [RABBIT_HIDE, 0, 1]],
  atlas: [32, 32],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 3, 0], from: [-2, 0, -3], size: [4, 4, 6], uv: [0, 0] },
    { name: "head", pivot: [0, 6, -3], from: [-2, -1, -4], size: [4, 4, 4], uv: [0, 10] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [0, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-2, 3, -2], size: [2, 4, 1], uv: [16, 10] },
    { name: "tail", pivot: [0, 5, 3], from: [-1, -1, 0], size: [2, 2, 2], uv: [22, 10] },
    ...quadLegs(3, 1.5, [-2, 2], [0, 18], 2)
  ]
});
mob({
  id: MOB_WOLF,
  key: "wolf",
  name: "狼",
  hostile: false,
  neutral: true,
  health: 8,
  walk: 1.2,
  run: 3.4,
  width: 0.6,
  height: 0.85,
  damage: 4,
  burnsInSun: false,
  drops: [],
  atlas: [64, 48],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 8, 0], from: [-3, 0, -2], size: [6, 6, 9], uv: [30, 10] },
    { name: "mane", pivot: [0, 8, -2], from: [-4, -0.5, -6], size: [8, 7, 6], uv: [0, 10] },
    { name: "head", pivot: [0, 13, -8], from: [-3, -3, -4], size: [6, 6, 4], uv: [0, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-1.5, -3, -7], size: [3, 3, 3], uv: [20, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [1, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-3, 3, -2], size: [2, 2, 1], uv: [36, 0] },
    { name: "tail", pivot: [0, 13, 7], from: [-1, -1, 0], size: [2, 2, 8], uv: [0, 26], rot: [0.9, 0, 0] },
    ...quadLegs(8, 2, [-5, 5], [24, 26], 2),
    { name: "collar", pivot: [0, 8, -2], from: [-4.5, -1, -5.5], size: [9, 8, 2], uv: [34, 26] }
  ]
});
mob({
  id: MOB_IRON_GOLEM,
  key: "iron_golem",
  name: "铁傀儡",
  hostile: false,
  health: 100,
  walk: 0.9,
  run: 2.2,
  width: 1.4,
  height: 2.7,
  damage: 11,
  burnsInSun: false,
  drops: [[IRON_INGOT, 3, 5], [POPPY, 0, 2]],
  atlas: [128, 64],
  anim: "golem",
  scale: 1,
  parts: [
    { name: "head", pivot: [0, 33, -2], from: [-4, 0, -5.5], size: [8, 10, 8], uv: [0, 0] },
    { name: "nose", parent: "head", pivot: [0, 0, 0], from: [-1, 1, -7.5], size: [2, 4, 2], uv: [32, 0] },
    { name: "body", pivot: [0, 21, 0], from: [-9, 0, -5.5], size: [18, 12, 11], uv: [0, 18] },
    { name: "waist", pivot: [0, 16, 0], from: [-4.5, 0, -3], size: [9, 5, 6], uv: [60, 18] },
    { name: "armR", pivot: [11, 31, 0], from: [-2, -28, -3], size: [4, 30, 6], uv: [90, 0] },
    { name: "armL", pivot: [-11, 31, 0], from: [-2, -28, -3], size: [4, 30, 6], uv: [90, 0] },
    { name: "legR", pivot: [4, 16, 0], from: [-3, -16, -2.5], size: [6, 16, 5], uv: [0, 41] },
    { name: "legL", pivot: [-4, 16, 0], from: [-3, -16, -2.5], size: [6, 16, 5], uv: [0, 41] }
  ]
});
mob({
  id: MOB_SNOW_GOLEM,
  key: "snow_golem",
  name: "雪傀儡",
  hostile: false,
  health: 4,
  walk: 1,
  run: 1.6,
  width: 0.7,
  height: 1.9,
  damage: 0,
  burnsInSun: false,
  drops: [[SNOWBALL, 0, 15]],
  atlas: [64, 64],
  anim: "golem",
  scale: 1,
  parts: [
    { name: "lower", pivot: [0, 0, 0], from: [-6, 0, -6], size: [12, 12, 12], uv: [0, 36] },
    { name: "upper", pivot: [0, 11, 0], from: [-5, 0, -5], size: [10, 10, 10], uv: [0, 16] },
    { name: "head", pivot: [0, 21, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] },
    { name: "armR", pivot: [4, 18, 0], from: [0, -1, -1], size: [12, 2, 2], uv: [32, 0], rot: [0, 0, -0.5] },
    { name: "armL", pivot: [-4, 18, 0], from: [-12, -1, -1], size: [12, 2, 2], uv: [32, 0], rot: [0, 0, 0.5] }
  ]
});
mob({
  id: MOB_CAT,
  key: "cat",
  name: "猫",
  hostile: false,
  health: 10,
  walk: 1.1,
  run: 3,
  width: 0.6,
  height: 0.7,
  damage: 0,
  burnsInSun: false,
  drops: [[STRING, 0, 2]],
  atlas: [64, 32],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 5, 0], from: [-2, 0, -7], size: [4, 5, 14], uv: [0, 13] },
    { name: "head", pivot: [0, 9, -7], from: [-2.5, -2, -5], size: [5, 4, 5], uv: [0, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-1.5, -2, -6], size: [3, 2, 1], uv: [20, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [0.5, 2, -3], size: [1, 1, 2], uv: [28, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-1.5, 2, -3], size: [1, 1, 2], uv: [28, 0] },
    { name: "tail", pivot: [0, 9, 7], from: [-0.5, -0.5, 0], size: [1, 1, 8], uv: [36, 13], rot: [0.9, 0, 0] },
    ...quadLegs(5, 1.1, [-5, 5], [36, 22], 2),
    { name: "collar", parent: "head", pivot: [0, 0, 0], from: [-3, -2.5, -3], size: [6, 1, 4], uv: [44, 22] }
  ]
});
var horseParts = (earH) => [
  { name: "body", pivot: [0, 11, 0], from: [-5, 0, -11], size: [10, 10, 22], uv: [0, 32] },
  { name: "neck", pivot: [0, 17, -8], from: [-2, 0, -3], size: [4, 12, 7], uv: [0, 0], rot: [-0.52, 0, 0] },
  { name: "head", parent: "neck", pivot: [0, 11, 0], from: [-3, -1, -4], size: [6, 5, 7], uv: [24, 0] },
  { name: "mouth", parent: "head", pivot: [0, 0, 0], from: [-2, -1, -10], size: [4, 4, 6], uv: [52, 0] },
  { name: "earR", parent: "head", pivot: [0, 0, 0], from: [0.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-2.5, 4, 0.5], size: [2, earH, 1], uv: [74, 0] },
  { name: "mane", parent: "neck", pivot: [0, 0, 0], from: [-1, 1, 4], size: [2, 14, 2], uv: [82, 0] },
  { name: "tail", pivot: [0, 20, 11], from: [-1.5, -12, 0], size: [3, 12, 4], uv: [92, 0], rot: [-0.4, 0, 0] },
  ...quadLegs(11, 3, [-8, 8], [24, 14]),
  { name: "saddle", pivot: [0, 21, -1], from: [-6, -2, -5], size: [12, 3, 10], uv: [64, 32] },
  { name: "stirrupR", pivot: [6, 19, -1], from: [0, -6, -1], size: [1, 6, 2], uv: [108, 0] },
  { name: "stirrupL", pivot: [-6, 19, -1], from: [-1, -6, -1], size: [1, 6, 2], uv: [108, 0] }
];
mob({
  id: MOB_HORSE,
  key: "horse",
  name: "马",
  hostile: false,
  health: 22,
  walk: 1.4,
  run: 3.4,
  width: 1.3,
  height: 1.6,
  damage: 0,
  burnsInSun: false,
  drops: [[LEATHER, 0, 2]],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 1,
  parts: horseParts(3)
});
mob({
  id: MOB_DONKEY,
  key: "donkey",
  name: "驴",
  hostile: false,
  health: 20,
  walk: 1.3,
  run: 3,
  width: 1.2,
  height: 1.4,
  damage: 0,
  burnsInSun: false,
  drops: [[LEATHER, 0, 2]],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 0.87,
  parts: horseParts(7)
});
mob({
  id: MOB_MULE,
  key: "mule",
  name: "骡",
  hostile: false,
  health: 22,
  walk: 1.3,
  run: 3,
  width: 1.25,
  height: 1.5,
  damage: 0,
  burnsInSun: false,
  drops: [[LEATHER, 0, 2]],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 0.92,
  parts: horseParts(6)
});
mob({
  id: MOB_LLAMA,
  key: "llama",
  name: "羊驼",
  hostile: false,
  neutral: true,
  health: 20,
  walk: 1.2,
  run: 2.8,
  width: 0.9,
  height: 1.87,
  damage: 1,
  burnsInSun: false,
  drops: [[LEATHER, 0, 2]],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 0.85,
  parts: [
    { name: "body", pivot: [0, 13, 0], from: [-6, 0, -9], size: [12, 10, 18], uv: [0, 36] },
    { name: "neck", pivot: [0, 20, -7], from: [-4, 0, -3], size: [8, 11, 6], uv: [0, 0] },
    { name: "head", parent: "neck", pivot: [0, 11, 0], from: [-4, 0, -3], size: [8, 6, 6], uv: [30, 0] },
    { name: "snout", parent: "head", pivot: [0, 0, 0], from: [-2, 0, -7], size: [4, 4, 4], uv: [60, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [1.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-3.5, 6, -1], size: [2, 3, 2], uv: [78, 0] },
    { name: "tail", pivot: [0, 21, 9], from: [-2, -4, 0], size: [4, 5, 2], uv: [88, 0], rot: [-0.2, 0, 0] },
    ...quadLegs(13, 3.5, [-6, 6], [0, 18])
  ]
});
mob({
  id: MOB_CAMEL,
  key: "camel",
  name: "骆驼",
  hostile: false,
  health: 32,
  walk: 1.1,
  run: 2.6,
  width: 1.5,
  height: 2.3,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 18, 0], from: [-7, 0, -11], size: [14, 11, 22], uv: [0, 28] },
    { name: "hump", parent: "body", pivot: [0, 11, 0], from: [-4, 0, -5], size: [8, 5, 9], uv: [74, 28] },
    { name: "neck", pivot: [0, 24, -10], from: [-2.5, -1, -4], size: [5, 14, 5], uv: [0, 0], rot: [-0.7, 0, 0] },
    { name: "head", parent: "neck", pivot: [0, 13, 0], from: [-3, -1, -9], size: [6, 5, 10], uv: [22, 0], rot: [0.6, 0, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [2.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-4.5, 3, 0], size: [2, 1, 2], uv: [56, 0] },
    { name: "tail", pivot: [0, 27, 11], from: [-1, -9, 0], size: [2, 9, 1], uv: [66, 0] },
    ...quadLegs(18, 4, [-8, 8], [80, 0]),
    { name: "saddle", parent: "body", pivot: [0, 11, 0], from: [-5, -1, -6], size: [10, 7, 11], uv: [74, 44] },
    { name: "stirrupR", pivot: [7, 28, -1], from: [0, -7, -1], size: [1, 7, 2], uv: [98, 0] },
    { name: "stirrupL", pivot: [-7, 28, -1], from: [-1, -7, -1], size: [1, 7, 2], uv: [98, 0] }
  ]
});
var villagerParts = () => [
  { name: "head", pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8], uv: [0, 0] },
  { name: "nose", parent: "head", pivot: [0, 0, 0], from: [-1, 1, -6], size: [2, 4, 2], uv: [32, 0] },
  { name: "body", pivot: [0, 24, 0], from: [-4, -18, -3], size: [8, 18, 6], uv: [16, 20] },
  { name: "arms", pivot: [0, 22, -1], from: [-4, -6, -2], size: [8, 4, 4], uv: [40, 44], rot: [0.75, 0, 0] },
  { name: "armR", parent: "arms", pivot: [0, 0, 0], from: [4, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: "armL", parent: "arms", pivot: [0, 0, 0], from: [-8, -8, -2], size: [4, 8, 4], uv: [44, 22] },
  { name: "legR", pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
  { name: "legL", pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] }
];
mob({
  id: MOB_VILLAGER,
  key: "villager",
  name: "村民",
  hostile: false,
  health: 20,
  walk: 0.9,
  run: 2.2,
  width: 0.6,
  height: 1.95,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [64, 64],
  anim: "villager",
  scale: 0.94,
  parts: villagerParts()
});
mob({
  id: MOB_WANDERING_TRADER,
  key: "wandering_trader",
  name: "流浪商人",
  hostile: false,
  health: 20,
  walk: 0.9,
  run: 2.2,
  width: 0.6,
  height: 1.95,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [64, 64],
  anim: "villager",
  scale: 0.94,
  parts: villagerParts()
});
var villagerLike = () => [
  { name: "head", pivot: [0, 24, 0], from: [-4, 0, -4], size: [8, 10, 8], uv: [0, 0] },
  { name: "nose", parent: "head", pivot: [0, 0, 0], from: [-1, 1, -6], size: [2, 4, 2], uv: [32, 0] },
  { name: "body", pivot: [0, 12, 0], from: [-4, 0, -3], size: [8, 12, 6], uv: [16, 20] },
  { name: "armR", pivot: [6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], uv: [44, 22] },
  { name: "armL", pivot: [-6, 22, 0], from: [-2, -10, -2], size: [4, 12, 4], uv: [44, 22] },
  { name: "legR", pivot: [2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] },
  { name: "legL", pivot: [-2, 12, 0], from: [-2, -12, -2], size: [4, 12, 4], uv: [0, 22] }
];
var slime = (id, key, name, size, health, damage) => mob({
  id,
  key,
  name,
  hostile: true,
  health,
  walk: 1.2,
  run: 2.2 + size * 0.1,
  width: 0.51 * size,
  height: 0.51 * size,
  damage,
  burnsInSun: false,
  drops: size === 1 ? [[SLIME_BALL, 0, 2]] : [],
  atlas: [32, 16],
  anim: "slime",
  scale: size,
  sound: "slime",
  parts: [{ name: "body", pivot: [0, 0, 0], from: [-4, 0, -4], size: [8, 8, 8], uv: [0, 0] }]
});
mob({
  id: MOB_DROWNED,
  key: "drowned",
  name: "溺尸",
  hostile: true,
  health: 20,
  walk: 1,
  run: 2.2,
  width: 0.6,
  height: 1.95,
  damage: 3,
  burnsInSun: true,
  drops: [[ROTTEN_FLESH, 0, 2]],
  atlas: [64, 64],
  anim: "zombie",
  scale: 1,
  sound: "zombie",
  parts: humanoid(false)
});
mob({
  id: MOB_WITCH,
  key: "witch",
  name: "女巫",
  hostile: true,
  health: 26,
  walk: 1,
  run: 1.7,
  width: 0.6,
  height: 1.95,
  damage: 0,
  burnsInSun: false,
  atlas: [64, 72],
  anim: "humanoid",
  scale: 1,
  drops: [[STICK, 0, 2], [SUGAR, 0, 2], [GUNPOWDER, 0, 1], [REDSTONE, 0, 2], [SPIDER_EYE, 0, 1]],
  parts: [
    ...villagerLike(),
    { name: "hat1", parent: "head", pivot: [0, 10, 0], from: [-5, 0, -5], size: [10, 2, 10], uv: [0, 40] },
    { name: "hat2", parent: "hat1", pivot: [0, 2, 0.5], from: [-3.5, 0, -3.5], size: [7, 4, 7], uv: [0, 54], rot: [-0.08, 0, 0.04] },
    { name: "hat3", parent: "hat2", pivot: [0, 4, 0.5], from: [-2, 0, -2], size: [4, 4, 4], uv: [44, 0], rot: [-0.14, 0, 0.06] },
    { name: "hat4", parent: "hat3", pivot: [0, 4, 0.5], from: [-0.5, 0, -0.5], size: [1, 2, 1], uv: [40, 0], rot: [-0.22, 0, 0.1] }
  ]
});
slime(MOB_SLIME, "slime", "史莱姆", 4, 16, 4);
slime(MOB_SLIME_MEDIUM, "slime_medium", "中型史莱姆", 2, 4, 2);
slime(MOB_SLIME_SMALL, "slime_small", "小型史莱姆", 1, 1, 0);
mob({
  id: MOB_PHANTOM,
  key: "phantom",
  name: "幻翼",
  hostile: true,
  health: 20,
  walk: 5,
  run: 9,
  width: 0.9,
  height: 0.5,
  damage: 4,
  burnsInSun: true,
  drops: [[PHANTOM_MEMBRANE, 0, 1]],
  atlas: [64, 48],
  anim: "phantom",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 4, 0], from: [-2.5, -1.5, -4.5], size: [5, 3, 9], uv: [0, 8] },
    { name: "head", parent: "body", pivot: [0, 0, -4.5], from: [-3.5, -1, -5], size: [7, 3, 5], uv: [0, 0] },
    { name: "wingR", parent: "body", pivot: [2.5, 1, -4.5], from: [0, -1, 0], size: [6, 2, 9], uv: [0, 20] },
    { name: "wingTipR", parent: "wingR", pivot: [6, 0, 0], from: [0, -0.5, 0], size: [13, 1, 9], uv: [0, 32] },
    { name: "wingL", parent: "body", pivot: [-2.5, 1, -4.5], from: [-6, -1, 0], size: [6, 2, 9], uv: [0, 20] },
    { name: "wingTipL", parent: "wingL", pivot: [-6, 0, 0], from: [-13, -0.5, 0], size: [13, 1, 9], uv: [0, 32] },
    { name: "tail", parent: "body", pivot: [0, 0.5, 4.5], from: [-1.5, -1, 0], size: [3, 2, 6], uv: [30, 20] },
    { name: "tailTip", parent: "tail", pivot: [0, 0, 6], from: [-0.5, -0.5, 0], size: [1, 1, 6], uv: [48, 20] }
  ]
});
mob({
  id: MOB_SILVERFISH,
  key: "silverfish",
  name: "蠹虫",
  hostile: true,
  health: 8,
  walk: 1.3,
  run: 2.8,
  width: 0.4,
  height: 0.3,
  damage: 1,
  burnsInSun: false,
  drops: [],
  atlas: [32, 32],
  anim: "silverfish",
  scale: 1,
  parts: [
    [[3, 2, 2], -7, [0, 0]],
    [[4, 3, 2], -5, [0, 4]],
    [[6, 4, 3], -2.5, [0, 9]],
    [[3, 3, 3], 0.5, [0, 16]],
    [[2, 2, 3], 3.5, [0, 22]],
    [[2, 1, 2], 6, [12, 0]],
    [[1, 1, 2], 8, [20, 0]]
  ].map(([size, z, uv], i) => ({
    name: `seg${i}`,
    pivot: [0, 0, z],
    from: [-size[0] / 2, 0, -size[2] / 2],
    size,
    uv
  }))
});
mob({
  id: MOB_CAVE_SPIDER,
  key: "cave_spider",
  name: "洞穴蜘蛛",
  hostile: true,
  neutral: true,
  health: 12,
  walk: 1.3,
  run: 3.1,
  width: 0.7,
  height: 0.5,
  damage: 2,
  burnsInSun: false,
  drops: [[STRING, 0, 2], [SPIDER_EYE, 0, 1]],
  atlas: [64, 64],
  anim: "spider",
  scale: 0.7,
  sound: "spider",
  parts: [
    { name: "thorax", pivot: [0, 9, 0], from: [-3, -3, -3], size: [6, 6, 6], uv: [0, 0] },
    { name: "head", parent: "thorax", pivot: [0, 0, -3], from: [-4, -4, -8], size: [8, 8, 8], uv: [32, 4] },
    { name: "abdomen", parent: "thorax", pivot: [0, 0, 3], from: [-5, -4, 0], size: [10, 8, 12], uv: [0, 20] },
    ...spiderLegs()
  ]
});
mob({
  id: MOB_ZOMBIE_VILLAGER,
  key: "zombie_villager",
  name: "僵尸村民",
  hostile: true,
  health: 20,
  walk: 1,
  run: 2.4,
  width: 0.6,
  height: 2,
  damage: 3,
  burnsInSun: true,
  drops: [[ROTTEN_FLESH, 0, 2]],
  atlas: [64, 64],
  anim: "zombie",
  scale: 1,
  sound: "zombie",
  parts: villagerLike()
});
for (const d of AQUATIC_MOBS)
  mob(d);
mob({
  id: MOB_BEE,
  key: "bee",
  name: "蜜蜂",
  hostile: false,
  neutral: true,
  health: 10,
  walk: 2.2,
  run: 4.2,
  width: 0.7,
  height: 0.6,
  damage: 2,
  burnsInSun: false,
  drops: [],
  atlas: [64, 32],
  anim: "flyer",
  scale: 1,
  flying: true,
  parts: [
    { name: "body", pivot: [0, 3, 0], from: [-3.5, 0, -5], size: [7, 7, 10], uv: [0, 0] },
    { name: "stinger", parent: "body", pivot: [0, 0, 0], from: [-0.5, 2, 5], size: [1, 1, 2], uv: [36, 0] },
    { name: "antennaR", parent: "body", pivot: [0, 0, 0], from: [0.5, 5, -8], size: [1, 2, 3], uv: [44, 0] },
    { name: "antennaL", parent: "body", pivot: [0, 0, 0], from: [-1.5, 5, -8], size: [1, 2, 3], uv: [44, 0] },
    { name: "wingR", parent: "body", pivot: [1, 7, -2], from: [0, 0, 0], size: [9, 0, 6], uv: [0, 18] },
    { name: "wingL", parent: "body", pivot: [-1, 7, -2], from: [-9, 0, 0], size: [9, 0, 6], uv: [0, 18] },
    { name: "leg0", parent: "body", pivot: [0, 0, -2], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] },
    { name: "leg1", parent: "body", pivot: [0, 0, 0], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] },
    { name: "leg2", parent: "body", pivot: [0, 0, 2], from: [-2.5, -2, 0], size: [5, 2, 1], uv: [34, 8] }
  ]
});
mob({
  id: MOB_PANDA,
  key: "panda",
  name: "熊猫",
  hostile: false,
  neutral: true,
  health: 20,
  walk: 0.9,
  run: 2.2,
  width: 1.3,
  height: 1.25,
  damage: 6,
  burnsInSun: false,
  drops: [],
  atlas: [128, 64],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 8, 0], from: [-7.5, 0, -11], size: [15, 12, 22], uv: [0, 17] },
    { name: "head", pivot: [0, 17, -11], from: [-5.5, -4, -8], size: [11, 9, 8], uv: [0, 0] },
    { name: "nose", parent: "head", pivot: [0, 0, 0], from: [-2.5, -4, -10], size: [5, 3, 2], uv: [40, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [3, 4, -3], size: [3, 3, 1], uv: [56, 0] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-6, 4, -3], size: [3, 3, 1], uv: [56, 0] },
    { name: "tail", pivot: [0, 17, 11], from: [-1.5, -1.5, 0], size: [3, 3, 2], uv: [66, 0] },
    ...quadLegs(8, 4.5, [-7, 7], [76, 17], 5)
  ]
});
mob({
  id: MOB_PARROT,
  key: "parrot",
  name: "鹦鹉",
  hostile: false,
  health: 6,
  walk: 3,
  run: 5.5,
  width: 0.5,
  height: 0.7,
  damage: 0,
  burnsInSun: false,
  drops: [[FEATHER, 1, 2]],
  atlas: [32, 32],
  anim: "flyer",
  scale: 1,
  flying: true,
  parts: [
    { name: "body", pivot: [0, 2, 0], from: [-1.5, 0, -1.5], size: [3, 6, 3], uv: [0, 0], rot: [-0.28, 0, 0] },
    { name: "head", parent: "body", pivot: [0, 6, -0.5], from: [-1, 0, -1], size: [2, 3, 2], uv: [12, 0] },
    { name: "beak", parent: "head", pivot: [0, 0, 0], from: [-0.5, 1, -2], size: [1, 2, 1], uv: [20, 0] },
    { name: "crest", parent: "head", pivot: [0, 3, 0.5], from: [-0.5, -1, 0], size: [1, 3, 2], uv: [20, 4], rot: [-0.6, 0, 0] },
    { name: "wingR", parent: "body", pivot: [1.5, 5.5, 0], from: [0, -5, -1.5], size: [1, 5, 3], uv: [0, 9] },
    { name: "wingL", parent: "body", pivot: [-1.5, 5.5, 0], from: [-1, -5, -1.5], size: [1, 5, 3], uv: [0, 9] },
    { name: "tail", parent: "body", pivot: [0, 0.5, 1.5], from: [-1.5, -3, -0.5], size: [3, 3, 1], uv: [10, 9], rot: [-0.5, 0, 0] },
    { name: "legR", pivot: [1, 2, 0], from: [-0.5, -2, -0.5], size: [1, 2, 1], uv: [20, 10] },
    { name: "legL", pivot: [-1, 2, 0], from: [-0.5, -2, -0.5], size: [1, 2, 1], uv: [20, 10] }
  ]
});
mob({
  id: MOB_ARMADILLO,
  key: "armadillo",
  name: "犰狳",
  hostile: false,
  health: 12,
  walk: 1.1,
  run: 2.6,
  width: 0.7,
  height: 0.65,
  damage: 0,
  burnsInSun: false,
  drops: [],
  atlas: [64, 32],
  anim: "quadruped",
  scale: 1,
  parts: [
    { name: "body", pivot: [0, 3, 0], from: [-3.5, 0, -5], size: [7, 6, 10], uv: [0, 0] },
    { name: "head", pivot: [0, 6, -5], from: [-1.5, -3.5, -4], size: [3, 4, 4], uv: [36, 0], rot: [-0.3, 0, 0] },
    { name: "earR", parent: "head", pivot: [0, 0, 0], from: [0.5, 0, -1], size: [2, 3, 1], uv: [50, 0], rot: [0, 0, -0.35] },
    { name: "earL", parent: "head", pivot: [0, 0, 0], from: [-2.5, 0, -1], size: [2, 3, 1], uv: [50, 0], rot: [0, 0, 0.35] },
    { name: "tail", pivot: [0, 4, 5], from: [-1, -1, 0], size: [2, 2, 5], uv: [36, 8], rot: [0.9, 0, 0] },
    ...quadLegs(3, 2, [-3, 3], [0, 18], 2)
  ]
});
for (const d of ILLAGER_MOBS)
  mob(d);
mob(WARDEN_DEF);
for (const d of OCEAN_MOBS)
  mob(d);
for (const d of critterMobs(MOBS, { cat: MOB_CAT, cow: MOB_COW, llama: MOB_LLAMA, horse: MOB_HORSE }))
  mob(d);
mob(ALLAY_DEF);
for (const d of netherMobs())
  mob(d);
for (const d of endMobs())
  mob(d);
for (const d of witherMobs())
  mob(d);
var MOB_TYPES = MOBS.filter(Boolean).map((m) => m.id);

// goodPG/src/shared/world/oceanRuins.ts
var RUINS_RADIUS = 27;
var cache = new Map;
function ruinsLayout(s, warm) {
  const key = `${s.x},${s.z},${s.rng}`;
  const hit = cache.get(key);
  if (hit)
    return hit;
  if (cache.size > 128)
    cache.clear();
  const rnd = mulberry32(s.rng);
  const big = rnd() < 0.3;
  const size = (b) => b ? 5 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2);
  const pieces = [{ x: s.x, z: s.z, hw: size(big), hd: size(big), big, seed: Math.floor(rnd() * 2 ** 31) }];
  if (big && rnd() < 0.9) {
    const n = 4 + Math.floor(rnd() * 5);
    for (let t = 0;t < n * 4 && pieces.length < n + 1; t++) {
      const a = rnd() * Math.PI * 2, r = 12 + rnd() * 10;
      const p = {
        x: Math.round(s.x + Math.cos(a) * r),
        z: Math.round(s.z + Math.sin(a) * r),
        hw: size(false),
        hd: size(false),
        big: false,
        seed: Math.floor(rnd() * 2 ** 31)
      };
      if (pieces.some((o) => Math.abs(o.x - p.x) <= o.hw + p.hw + 2 && Math.abs(o.z - p.z) <= o.hd + p.hd + 2))
        continue;
      pieces.push(p);
    }
  }
  const L = { warm, pieces };
  cache.set(key, L);
  return L;
}
function ruinBlock(warm, x, y, z, seed) {
  const r = hash3(x, y, z, seed) % 100;
  if (warm)
    return r < 45 ? SANDSTONE : r < 75 ? CUT_SANDSTONE : r < 90 ? SMOOTH_SANDSTONE : CHISELED_SANDSTONE;
  return r < 50 ? STONE_BRICKS : r < 80 ? MOSSY_STONE_BRICKS : r < 95 ? CRACKED_STONE_BRICKS : CHISELED_STONE_BRICKS;
}
function buildOceanRuins(c, s, gen, warm) {
  const L = ruinsLayout(s, warm);
  for (const p of L.pieces) {
    if (p.x + p.hw < c.x0 || p.x - p.hw > c.x0 + 15 || p.z + p.hd < c.z0 || p.z - p.hd > c.z0 + 15)
      continue;
    buildPiece(c, p, gen, warm);
  }
}
function buildPiece(c, p, gen, warm) {
  const rnd = mulberry32(p.seed);
  const y0 = Math.min(SEA_LEVEL - 4, gen.surfaceAt(p.x, p.z, gen.columnInfo(p.x, p.z, info)));
  const integrity = 0.75 + rnd() * 0.15;
  const maxH = p.big ? 5 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 3);
  const doorSide = Math.floor(rnd() * 4), fallen = Math.floor(rnd() * 4);
  const midX = p.x + Math.floor((rnd() - 0.5) * p.hw), midZ = p.z + Math.floor((rnd() - 0.5) * p.hd);
  const stands = (x, y, z) => hash3(x, y, z, p.seed ^ 24301) % 1000 < integrity * 1000;
  for (let z = p.z - p.hd;z <= p.z + p.hd; z++) {
    for (let x = p.x - p.hw;x <= p.x + p.hw; x++) {
      const ex = x === p.x - p.hw || x === p.x + p.hw, ez = z === p.z - p.hd || z === p.z + p.hd;
      for (let y = y0 - 1;y > y0 - 6; y--) {
        const b = c.get(x, y, z);
        if (b < 0 || b !== AIR && !BLOCK_FLUID[b] && BLOCK_OPAQUE[b])
          break;
        c.set(x, y, z, ruinBlock(warm, x, y, z, p.seed));
      }
      c.set(x, y0, z, stands(x, y0, z) ? ruinBlock(warm, x, y0, z, p.seed) : warm ? SAND : GRAVEL);
      const inner = p.big && (x === midX || z === midZ);
      let h = 0;
      if (ex || ez || inner) {
        const cx = fallen & 1 ? p.x + p.hw : p.x - p.hw, cz = fallen & 2 ? p.z + p.hd : p.z - p.hd;
        const far = (Math.abs(x - cx) + Math.abs(z - cz)) / (p.hw + p.hd);
        h = Math.max(0, Math.round(maxH * Math.min(1, 0.25 + far)) - (inner ? 1 : 0) - hash3(x, 0, z, p.seed) % 2);
      }
      const door = doorSide === 0 && ez && z < p.z && Math.abs(x - p.x) <= 1 || doorSide === 1 && ex && x > p.x && Math.abs(z - p.z) <= 1 || doorSide === 2 && ez && z > p.z && Math.abs(x - p.x) <= 1 || doorSide === 3 && ex && x < p.x && Math.abs(z - p.z) <= 1 || inner && !ex && !ez && (Math.abs(x - p.x) === 2 || Math.abs(z - p.z) === 2);
      for (let y = y0 + 1;y <= y0 + 7; y++) {
        const wall = y <= y0 + h && !(door && y <= y0 + 2);
        if (wall && stands(x, y, z))
          c.set(x, y, z, ruinBlock(warm, x, y, z, p.seed));
        else if (y < SEA_LEVEL) {
          const b = c.get(x, y, z);
          if (b > 0)
            c.set(x, y, z, WATER);
        }
      }
      if (ex && ez && h >= 2 && stands(x, y0 + h + 1, z))
        c.set(x, y0 + h, z, warm ? CHISELED_SANDSTONE : CHISELED_STONE_BRICKS);
    }
  }
  const chest = (x, z, facing) => c.chest(x, y0 + 1, z, facing, p.big ? "underwater_ruin_big" : "underwater_ruin_small");
  chest(p.x - p.hw + 1, p.z - p.hd + 1, 2);
  if (p.big)
    chest(p.x + p.hw - 1, p.z + p.hd - 1, 0);
  const drowned = p.big ? 2 + Math.floor(rnd() * 2) : rnd() < 0.5 ? 1 : 0;
  for (let i = 0;i < drowned; i++) {
    const dx = Math.floor((rnd() - 0.5) * (p.hw - 1) * 2), dz = Math.floor((rnd() - 0.5) * (p.hd - 1) * 2);
    c.mob(MOB_DROWNED, p.x + dx + 0.5, y0 + 1, p.z + dz + 0.5);
  }
}
var info = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
function buildBuriedTreasure(c, s) {
  const { x, z } = s, y = s.y - 2;
  if (c.get(x, y, z) < 0)
    return;
  c.chest(x, y, z, s.rng % 4, "buried_treasure");
  for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
    const b = c.get(x + dx, y + dy, z + dz);
    if (b >= 0 && (b === AIR || BLOCK_FLUID[b] || !BLOCK_OPAQUE[b]))
      c.set(x + dx, y + dy, z + dz, dy === 1 ? SAND : SANDSTONE);
  }
}

// goodPG/src/shared/world/oceanStructures.ts
var tmp3 = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
var TREASURE_SPACING = 4;
var TREASURE_CHANCE = TREASURE_SPACING * TREASURE_SPACING * 0.01;
var OCEAN_STRUCTURES = [
  {
    key: "monument",
    spacing: 32,
    separation: 5,
    salt: 10387313,
    radius: MONUMENT_RADIUS,
    site: (gen, x, z, inf) => {
      if (baseBiome(inf.biome) !== BIOME_DEEP_OCEAN)
        return null;
      for (const [dx, dz] of [[16, 0], [-16, 0], [0, 16], [0, -16]]) {
        if (baseBiome(gen.columnInfo(x + dx, z + dz, tmp3).biome) !== BIOME_DEEP_OCEAN)
          return null;
      }
      for (const [dx, dz] of [[29, 29], [-29, 29], [29, -29], [-29, -29]]) {
        if (!isOceanBiome(gen.columnInfo(x + dx, z + dz, tmp3).biome))
          return null;
      }
      return MONUMENT_Y;
    },
    build: (c, s) => buildMonument(c, s)
  },
  {
    key: "ocean_ruins",
    spacing: 20,
    separation: 8,
    salt: 14357621,
    radius: RUINS_RADIUS,
    site: (gen, x, z, inf) => {
      if (!isOceanBiome(inf.biome))
        return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp3));
      return h <= SEA_LEVEL - 5 ? h : null;
    },
    build: (c, s, gen) => buildOceanRuins(c, s, gen, [BIOME_WARM_OCEAN, BIOME_LUKEWARM_OCEAN, BIOME_DEEP_LUKEWARM_OCEAN].includes(gen.columnInfo(s.x, s.z, tmp3).biome))
  },
  {
    key: "buried_treasure",
    spacing: TREASURE_SPACING,
    separation: 1,
    salt: 10387320,
    radius: 1,
    site: (gen, x, z, inf) => {
      if (inf.biome !== BIOME_BEACH && inf.biome !== BIOME_SNOWY_BEACH || hash2(x, z, gen.seed ^ 32346) % 1000 / 1000 >= TREASURE_CHANCE)
        return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp3));
      return h >= SEA_LEVEL - 3 ? h : null;
    },
    build: (c, s) => buildBuriedTreasure(c, s)
  }
];
var OCEAN_STRUCTURE_NAMES = {
  monument: "海底神殿",
  ocean_ruins: "海底废墟",
  buried_treasure: "埋藏的宝藏"
};

// goodPG/src/shared/protocol.ts
var STATE_GLIDE = 1 << 16;
var EF_SADDLE = 1 << 12;
var EF_TAMED = 1 << 13;
var EF_RIDDEN = 1 << 14;
var EF_SITTING = 1 << 15;
var EF_VARIANT_SHIFT = 16;
var EF_VARIANT_MASK = 7 << EF_VARIANT_SHIFT;
var EF_CAPTAIN = 1 << 21;
var EF_GLINT = 1 << 22;

// goodPG/src/shared/companions.ts
var TAME_CHANCE = 1 / 3;
var TAME_ITEMS = {
  [MOB_WOLF]: [BONE],
  [MOB_CAT]: [COD, SALMON]
};
var PET_FOOD = {
  [MOB_WOLF]: [RAW_PORKCHOP, COOKED_PORKCHOP, RAW_BEEF, STEAK, RAW_CHICKEN, COOKED_CHICKEN, RAW_MUTTON, COOKED_MUTTON, ROTTEN_FLESH],
  [MOB_CAT]: [COD, SALMON]
};
var CAT_SKINS = ["atigrado", "pelirrojo", "negro", "siamés", "blanco"];

// goodPG/src/shared/world/swampHut.ts
var SWAMP_HUT_RADIUS = 5;
var SWAMP_HUT_SALT = 14357620;
var HEIGHT = 7;
function swampHutSite(biome, surface) {
  if (biome !== BIOME_SWAMP)
    return null;
  return Math.max(surface + 1, SEA_LEVEL);
}
function turnOf(seed, x, z) {
  return hash2(x, z, seed ^ SWAMP_HUT_SALT) % 4;
}
function toWorld3(turn, ox, oz, a, b) {
  switch (turn) {
    case 1:
      return [ox - b, oz + a];
    case 2:
      return [ox - a, oz - b];
    case 3:
      return [ox + b, oz - a];
    default:
      return [ox + a, oz + b];
  }
}
function buildSwampHut(c, s, gen) {
  const turn = turnOf(gen.seed, s.x, s.z);
  const y0 = s.y;
  const put = (u, h, v, id) => {
    const [x, z] = toWorld3(turn, s.x, s.z, u - 3, v - 4);
    c.set(x, y0 + h, z, id);
  };
  const box = (u0, h0, v0, u1, h1, v1, id) => {
    for (let h = h0;h <= h1; h++)
      for (let v = v0;v <= v1; v++)
        for (let u = u0;u <= u1; u++)
          put(u, h, v, id);
  };
  for (let v = 0;v <= 8; v++) {
    for (let u = 0;u <= 6; u++) {
      const [x, z] = toWorld3(turn, s.x, s.z, u - 3, v - 4);
      c.clearAbove(x, y0 + 1, z, HEIGHT + 2);
    }
  }
  const stairs = (dir) => stateOf(STAIRS.spruce, { facing: (dir + turn) % 4, half: 0 });
  box(1, 1, 1, 5, 1, 7, SPRUCE_PLANKS);
  box(1, 4, 2, 5, 4, 7, SPRUCE_PLANKS);
  box(2, 1, 0, 4, 1, 0, SPRUCE_PLANKS);
  box(2, 2, 2, 3, 3, 2, SPRUCE_PLANKS);
  box(1, 2, 3, 1, 3, 6, SPRUCE_PLANKS);
  box(5, 2, 3, 5, 3, 6, SPRUCE_PLANKS);
  box(2, 2, 7, 4, 3, 7, SPRUCE_PLANKS);
  for (const [u, v] of [[1, 2], [5, 2], [1, 7], [5, 7]])
    box(u, 0, v, u, 3, v, OAK_LOG);
  box(2, 2, 3, 4, 3, 6, AIR);
  box(4, 2, 2, 4, 3, 2, AIR);
  const fence = FENCES.oak;
  put(2, 3, 2, fence);
  put(3, 3, 7, fence);
  put(1, 3, 4, AIR);
  put(5, 3, 4, AIR);
  put(5, 3, 5, AIR);
  put(1, 3, 5, potWith(RED_MUSHROOM) || AIR);
  put(3, 2, 6, CRAFTING_TABLE);
  put(4, 2, 6, CAULDRON);
  put(1, 2, 1, fence);
  put(5, 2, 1, fence);
  box(0, 4, 1, 6, 4, 1, stairs(0));
  box(0, 4, 2, 0, 4, 7, stairs(3));
  box(6, 4, 2, 6, 4, 7, stairs(1));
  box(0, 4, 8, 6, 4, 8, stairs(2));
  for (const [u, v] of [[1, 2], [5, 2], [1, 7], [5, 7]]) {
    const [x, z] = toWorld3(turn, s.x, s.z, u - 3, v - 4);
    c.foundation(x, y0 - 1, z, OAK_LOG);
  }
  const [sx, sy, sz] = swampHutSpawnSpot(gen.seed, s.x, s.y, s.z);
  c.mob?.(MOB_WITCH, sx, sy, sz);
  c.mob?.(MOB_CAT, sx, sy, sz, CAT_SKINS.indexOf("negro"));
}
function swampHutSpawnSpot(seed, ox, oy, oz) {
  const [x, z] = toWorld3(turnOf(seed, ox, oz), ox, oz, 2 - 3, 5 - 4);
  return [x + 0.5, oy + 2, z + 0.5];
}

// goodPG/src/shared/world/fossils.ts
var FOSSIL_RADIUS = 8;
var FOSSIL_INTEGRITY = 0.9;
var FOSSIL_ORE_INTEGRITY = 0.1;
function fossilSite(gen, x, z, biome, surface) {
  if (biome !== BIOME_DESERT && baseBiome(biome) !== BIOME_SWAMP)
    return null;
  const h = hash2(x, z, gen.seed ^ 61525);
  const y = h % 2 === 0 ? Math.max(surface - 15 - (h >>> 3) % 10, MIN_Y + 10) : -56 + (h >>> 5) % 47;
  const { pieces } = fossilPieces(gen.seed, x, z);
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of pieces) {
    for (let k = 0;k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }
  let empty = 0;
  for (const cx of [lo[0], hi[0]])
    for (const cy of [lo[1], hi[1]])
      for (const cz of [lo[2], hi[2]])
        if (gen.caveAt(x + cx, y + cy, z + cz))
          empty++;
  return empty > 4 ? null : y;
}
function spine(len, ribDepth, neck) {
  const out = [];
  const top = ribDepth + 1;
  for (let x = 0;x < len; x++) {
    const lift = neck && x >= len - 3 ? x - (len - 3) + 1 : 0;
    out.push([x, top + lift, 0, lift ? "y" : "x"]);
    const tail = x < 2;
    if (x % 2 === 1 && !tail && !(neck && x >= len - 3)) {
      for (const side of [-1, 1]) {
        out.push([x, top, side, "z"]);
        for (let d = 1;d <= ribDepth; d++)
          out.push([x, top - d, side * 2, "y"]);
        if (ribDepth >= 3)
          out.push([x, top - ribDepth, side, "z"]);
      }
    }
  }
  if (neck)
    out.push([len - 1, top + 4, -1, "x"], [len - 1, top + 4, 1, "x"]);
  return out;
}
function skull(w, h, d, extra) {
  const out = [];
  const snout = extra === "snout" ? 3 : 0;
  for (let y = 0;y < h; y++) {
    for (let z = 0;z < d; z++) {
      for (let x = 0;x < w; x++) {
        const shell = x === 0 || x === w - 1 || y === 0 || y === h - 1 || z === 0 || z === d - 1;
        if (!shell)
          continue;
        if (z === 0 && y === h - 2 && (x === 1 || x === w - 2))
          continue;
        if (z === 0 && y === 1 && x === Math.floor(w / 2))
          continue;
        if (y === 1 && (x === 0 || x === w - 1) && z > 0 && z < d - 2)
          continue;
        out.push([x, y, z + snout, y === 0 || y === h - 1 ? "z" : "y"]);
      }
    }
  }
  if (snout) {
    for (let z = 0;z < snout; z++) {
      for (let x = 1;x < w - 1; x++) {
        out.push([x, 0, z, "z"]);
        if (x === 1 || x === w - 2)
          out.push([x, 1, z, "z"]);
      }
    }
  }
  if (extra === "horns") {
    for (const x of [0, w - 1])
      for (let k = 1;k <= 2; k++)
        out.push([x, h - 1 + k, 1, "y"]);
  } else if (extra === "teeth") {
    for (let x = 1;x < w - 1; x += 2)
      out.push([x, -1, 0, "y"]);
  }
  return out;
}
var FOSSIL_SHAPES = [
  skull(5, 4, 5, "none"),
  skull(7, 5, 7, "horns"),
  skull(5, 4, 6, "snout"),
  skull(6, 5, 6, "teeth"),
  spine(7, 2, false),
  spine(9, 3, false),
  spine(11, 3, false),
  spine(13, 2, true)
];
function fossilPieces(seed, x, z) {
  const h = hash2(x, z, seed ^ 984401);
  const shape = h % FOSSIL_SHAPES.length;
  const turn = (h >>> 4) % 4;
  const src = FOSSIL_SHAPES[shape];
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [px, , pz] of src) {
    x0 = Math.min(x0, px);
    x1 = Math.max(x1, px);
    z0 = Math.min(z0, pz);
    z1 = Math.max(z1, pz);
  }
  const cx = Math.floor((x0 + x1) / 2), cz = Math.floor((z0 + z1) / 2);
  const pieces = src.map(([px, py, pz, axis]) => {
    const a = px - cx, b = pz - cz;
    const [ra, rb] = turn === 1 ? [-b, a] : turn === 2 ? [-a, -b] : turn === 3 ? [b, -a] : [a, b];
    const ax = axis === "y" ? "y" : turn % 2 === 1 === (axis === "x") ? "z" : "x";
    return [ra, py, rb, ax];
  });
  return { shape, turn, pieces };
}
function replaceable(id) {
  return id > 0 && id !== AIR && !BLOCK_FLUID[id] && id !== MOB_SPAWNER && !isChest(id);
}
function buildFossil(c, s, seed) {
  const { pieces } = fossilPieces(seed, s.x, s.z);
  const deep = s.y < 0;
  for (const [a, py, b, axis] of pieces) {
    const x = s.x + a, y = s.y + py, z = s.z + b;
    const cur = c.get(x, y, z);
    if (!replaceable(cur))
      continue;
    const k = hash3(x, y, z, seed ^ 45182);
    if ((k >>> 8) % 1000 < FOSSIL_ORE_INTEGRITY * 1000) {
      const ore = deep ? DIAMOND_ORE : COAL_ORE;
      c.set(x, y, z, deep || cur === DEEPSLATE ? DEEPSLATE_ORE[ore] ?? ore : ore);
      continue;
    }
    if (k % 1000 >= FOSSIL_INTEGRITY * 1000)
      continue;
    c.set(x, y, z, axis === "y" ? BONE_BLOCK : BONE_BLOCK_AXIS + (axis === "x" ? AXIS_X : AXIS_Z));
  }
}

// goodPG/src/shared/world/mansion.ts
var G = 7;
var CELL = 8;
var MANSION_FLOOR_H = 7;
var FH = MANSION_FLOOR_H;
var FLOORS = 3;
var N4 = G * CELL + 1;
var MANSION_RADIUS = Math.ceil(N4 / 2) + 3;
var MANSION_LOOT = "woodland_mansion";
var OUT = -1;
var CORR = -2;
var FREE = -3;
var DX3 = [0, 1, 0, -1];
var DZ3 = [-1, 0, 1, 0];
var EDGE_OPEN = 1;
var EDGE_BARS = 2;
var EDGE_ENTRANCE = 3;
var YARD = 3;
var NY = N4 + 2 * YARD;
var tmp4 = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
function mansionSite(gen, x, z, inf) {
  if (inf.biome !== BIOME_DARK_FOREST)
    return null;
  const hs = [];
  const r = (N4 - 1) / 2 - 2;
  for (const dz of [-r, 0, r])
    for (const dx of [-r, 0, r])
      hs.push(gen.surfaceAt(x + dx, z + dz, gen.columnInfo(x + dx, z + dz, tmp4)));
  hs.sort((a, b) => a - b);
  return hs[0] >= SEA_LEVEL && hs[8] - hs[0] <= 16 ? Math.max(SEA_LEVEL + 1, hs[4]) : null;
}
var cache2 = new Map;
function mansionLayout(s) {
  const key = `${s.rng}:${s.x},${s.y},${s.z}`;
  let L = cache2.get(key);
  if (L)
    return L;
  if (cache2.size > 16)
    cache2.clear();
  L = generateLayout(s);
  cache2.set(key, L);
  return L;
}
var idx = (i, j) => j * G + i;
function generateLayout(s) {
  const rnd = mulberry32(s.rng ^ 239079);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const F = [new Uint8Array(G * G).fill(1), new Uint8Array(G * G), new Uint8Array(G * G)];
  const corners = [[0, 0], [5, 0], [0, 5], [5, 5]];
  for (const [ci, cj] of corners) {
    const r = rnd();
    if (r < 0.25)
      for (let dj = 0;dj < 2; dj++)
        for (let di = 0;di < 2; di++)
          F[0][idx(ci + di, cj + dj)] = 0;
    else if (r < 0.55)
      F[0][idx(ci + (ci ? 1 : 0), cj + (cj ? 1 : 0))] = 0;
  }
  const e = Math.floor(rnd() * 4);
  const ENTRY = [[[3, 0], [3, 1]], [[6, 3], [5, 3]], [[3, 6], [3, 5]], [[0, 3], [1, 3]]];
  const entryCells = ENTRY[e];
  F[1].set(F[0]);
  for (const [ci, cj] of corners) {
    const full = [0, 1].every((dj) => [0, 1].every((di) => F[0][idx(ci + di, cj + dj)]));
    if (full && rnd() < 0.35)
      for (let dj = 0;dj < 2; dj++)
        for (let di = 0;di < 2; di++)
          F[1][idx(ci + di, cj + dj)] = 0;
  }
  if (rnd() < 0.5)
    for (const [i, j] of entryCells)
      F[1][idx(i, j)] = 0;
  const [ri0, ri1, rj0, rj1] = pick([[1, 5, 1, 5], [2, 4, 1, 5], [1, 5, 2, 4]]);
  for (let j = rj0;j <= rj1; j++)
    for (let i = ri0;i <= ri1; i++)
      F[2][idx(i, j)] = F[1][idx(i, j)];
  const cells = F.map((f, fl) => {
    const a = new Int16Array(G * G);
    for (let j = 0;j < G; j++) {
      for (let i = 0;i < G; i++) {
        const corr = fl < 2 ? i === 2 || i === 4 || j === 2 || j === 4 : i === 3 || j === 3;
        a[idx(i, j)] = !f[idx(i, j)] ? OUT : corr ? CORR : FREE;
      }
    }
    return a;
  });
  for (const [i, j] of entryCells)
    cells[0][idx(i, j)] = CORR;
  const rooms = [];
  const stairs = [];
  const addStairs = (fl, i, j, dir) => {
    stairs.push({ floor: fl, i, j, dir });
    cells[fl][idx(i, j)] = rooms.length;
    cells[fl + 1][idx(i, j)] = CORR;
    rooms.push({ floor: fl, i, j, w: 1, h: 1, type: "stairs", door: { i, j, dir }, seed: Math.floor(rnd() * 2 ** 31), mobs: [] });
  };
  const edgeStairs = [[3, 1, 2], [5, 3, 3], [3, 5, 0], [1, 3, 1]];
  const lower = edgeStairs.filter(([i, j]) => cells[0][idx(i, j)] === FREE && cells[1][idx(i, j)] === FREE);
  if (lower.length)
    addStairs(0, ...pick(lower));
  if (cells[1][idx(3, 3)] === FREE && cells[2][idx(3, 3)] !== OUT)
    addStairs(1, 3, 3, Math.floor(rnd() * 4));
  for (let fl = 0;fl < FLOORS; fl++) {
    const a = cells[fl];
    const free = (i, j) => i >= 0 && j >= 0 && i < G && j < G && a[idx(i, j)] === FREE;
    for (let j = 0;j < G; j++) {
      for (let i = 0;i < G; i++) {
        if (!free(i, j))
          continue;
        const shapes = [];
        const r = rnd();
        if (r < 0.4)
          shapes.push([2, 2]);
        if (r < 0.85)
          shapes.push(...rnd() < 0.5 ? [[2, 1], [1, 2]] : [[1, 2], [2, 1]]);
        shapes.push([1, 1]);
        const [w, h] = shapes.find(([w, h]) => {
          for (let dj = 0;dj < h; dj++)
            for (let di = 0;di < w; di++)
              if (!free(i + di, j + dj))
                return false;
          return true;
        });
        for (let dj = 0;dj < h; dj++)
          for (let di = 0;di < w; di++)
            a[idx(i + di, j + dj)] = rooms.length;
        rooms.push({ floor: fl, i, j, w, h, type: "secret", door: null, seed: Math.floor(rnd() * 2 ** 31), mobs: [] });
      }
    }
  }
  for (const room of rooms) {
    if (room.type === "stairs")
      continue;
    const opts = [];
    for (let dj = 0;dj < room.h; dj++) {
      for (let di = 0;di < room.w; di++) {
        for (let d = 0;d < 4; d++) {
          const ni = room.i + di + DX3[d], nj = room.j + dj + DZ3[d];
          if (ni >= 0 && nj >= 0 && ni < G && nj < G && cells[room.floor][idx(ni, nj)] === CORR)
            opts.push({ i: room.i + di, j: room.j + dj, dir: d });
        }
      }
    }
    if (opts.length)
      room.door = pick(opts);
  }
  assignRooms(rooms, rnd);
  const entrance = { i: entryCells[0][0], j: entryCells[0][1], dir: e };
  const L = {
    x0: s.x - (N4 - 1) / 2,
    z0: s.z - (N4 - 1) / 2,
    y: s.y,
    cells,
    rooms,
    stairs,
    entrance,
    vEdges: cells.map(() => new Uint8Array((G + 1) * G)),
    hEdges: cells.map(() => new Uint8Array(G * (G + 1))),
    topF: new Int8Array(N4 * N4),
    roof: new Int8Array(N4 * N4),
    roofDir: new Int8Array(N4 * N4),
    yard: new Uint8Array(NY * NY)
  };
  for (const room of rooms)
    if (room.door)
      setEdge(L, room.floor, room.door.i, room.door.j, room.door.dir, room.type === "jail" ? EDGE_BARS : EDGE_OPEN);
  setEdge(L, 0, entrance.i, entrance.j, entrance.dir, EDGE_ENTRANCE);
  computeRoofs(L);
  for (let z = 0;z < NY; z++) {
    for (let x = 0;x < NY; x++) {
      let near = false;
      for (let dz = -YARD;dz <= YARD && !near; dz++) {
        for (let dx = -YARD;dx <= YARD && !near; dx++) {
          const lx = x - YARD + dx, lz = z - YARD + dz;
          near = lx >= 0 && lz >= 0 && lx < N4 && lz < N4 && L.topF[lz * N4 + lx] >= 0;
        }
      }
      L.yard[z * NY + x] = near ? 1 : 0;
    }
  }
  return L;
}
function setEdge(L, fl, i, j, dir, kind) {
  if (dir === 0)
    L.hEdges[fl][j * G + i] = kind;
  else if (dir === 2)
    L.hEdges[fl][(j + 1) * G + i] = kind;
  else if (dir === 3)
    L.vEdges[fl][j * (G + 1) + i] = kind;
  else
    L.vEdges[fl][j * (G + 1) + i + 1] = kind;
}
var TYPES_1 = ["bedroom_small", "flower", "office", "checker", "pumpkin", "storage", "birch_pillar", "cobweb"];
var TYPES_2 = ["bedroom", "library", "wool_x", "dining_small", "bedroom", "library"];
var TYPES_4 = ["dining", "conference", "map_room", "chess", "garden", "statue"];
var ATTIC_1 = ["attic_storage", "bedroom_small", "cobweb", "flower", "storage"];
var ATTIC_2 = ["attic_storage", "bedroom", "library"];
var ATTIC_4 = ["statue", "attic_storage", "conference"];
function assignRooms(rooms, rnd) {
  const shuffled = (a) => {
    const out = [...a];
    for (let k = out.length - 1;k > 0; k--) {
      const m = Math.floor(rnd() * (k + 1));
      [out[k], out[m]] = [out[m], out[k]];
    }
    return out;
  };
  const open = rooms.filter((r) => r.type !== "stairs" && r.door);
  const small = shuffled(open.filter((r) => r.w * r.h === 1 && r.floor < 2));
  for (let k = 0;k < Math.min(small.length, 1 + (rnd() < 0.5 ? 1 : 0)); k++)
    small[k].type = "jail";
  const long = shuffled(open.filter((r) => r.w * r.h === 2)).sort((a, b) => b.floor - a.floor);
  if (long.length)
    long[0].type = "fake_portal";
  const big0 = open.find((r) => r.w * r.h === 4 && r.floor === 0);
  if (big0)
    big0.type = "dining";
  const bags = new Map;
  const next = (list, key) => {
    let bag = bags.get(key);
    if (!bag || bag.length === 0)
      bags.set(key, bag = shuffled(list));
    return bag.pop();
  };
  for (const r of rooms) {
    if (r.type !== "secret" || !r.door)
      continue;
    const size = r.w * r.h;
    const attic = r.floor === 2;
    if (size === 1)
      r.type = next(attic ? ATTIC_1 : TYPES_1, `1${attic}`);
    else if (size === 2)
      r.type = next(attic ? ATTIC_2 : TYPES_2, `2${attic}`);
    else
      r.type = next(attic ? ATTIC_4 : TYPES_4, `4${attic}`);
  }
  let evokers = 0;
  for (const r of rooms) {
    const size = r.w * r.h;
    if (r.type === "jail") {
      r.mobs.push(MOB_ALLAY);
      if (rnd() < 0.5)
        r.mobs.push(MOB_ALLAY);
    } else if (r.type === "stairs" || r.type === "secret")
      continue;
    else if (size === 4) {
      if (rnd() < 0.5) {
        r.mobs.push(MOB_EVOKER);
        evokers++;
      }
      r.mobs.push(MOB_VINDICATOR);
      if (rnd() < 0.5)
        r.mobs.push(MOB_VINDICATOR);
    } else if (rnd() < (size === 2 ? 0.6 : 0.3))
      r.mobs.push(MOB_VINDICATOR);
  }
  const halls = rooms.filter((q) => q.door && q.type !== "jail" && q.type !== "stairs" && !q.mobs.includes(MOB_EVOKER)).sort((a, b) => b.w * b.h - a.w * a.h);
  for (let k = 0;evokers < 2 && k < halls.length; k++, evokers++)
    halls[k].mobs.unshift(MOB_EVOKER);
}
function covers(L, fl, lx, lz) {
  const is = lx % CELL === 0 ? [lx / CELL - 1, lx / CELL] : [Math.floor(lx / CELL)];
  const js = lz % CELL === 0 ? [lz / CELL - 1, lz / CELL] : [Math.floor(lz / CELL)];
  for (const j of js)
    for (const i of is)
      if (i >= 0 && j >= 0 && i < G && j < G && L.cells[fl][idx(i, j)] !== OUT)
        return true;
  return false;
}
function chebyshev(src, outside) {
  const INF = 999;
  const d = new Int16Array(N4 * N4);
  for (let k = 0;k < N4 * N4; k++)
    d[k] = src(k) ? 0 : INF;
  const at = (x, z) => x < 0 || z < 0 || x >= N4 || z >= N4 ? outside ? 0 : INF : d[z * N4 + x];
  for (let z = 0;z < N4; z++) {
    for (let x = 0;x < N4; x++) {
      const k = z * N4 + x;
      d[k] = Math.min(d[k], at(x - 1, z) + 1, at(x, z - 1) + 1, at(x - 1, z - 1) + 1, at(x + 1, z - 1) + 1);
    }
  }
  for (let z = N4 - 1;z >= 0; z--) {
    for (let x = N4 - 1;x >= 0; x--) {
      const k = z * N4 + x;
      d[k] = Math.min(d[k], at(x + 1, z) + 1, at(x, z + 1) + 1, at(x + 1, z + 1) + 1, at(x - 1, z + 1) + 1);
    }
  }
  return d;
}
function computeRoofs(L) {
  const inF = [0, 1, 2].map((fl) => {
    const m = new Uint8Array(N4 * N4);
    for (let lz = 0;lz < N4; lz++)
      for (let lx = 0;lx < N4; lx++)
        m[lz * N4 + lx] = covers(L, fl, lx, lz) ? 1 : 0;
    return m;
  });
  L.topF.fill(-1);
  for (let k = 0;k < N4 * N4; k++)
    for (let fl = 0;fl < FLOORS; fl++)
      if (inF[fl][k])
        L.topF[k] = fl;
  const inside = inF.map((m) => chebyshev((k) => !m[k], true));
  const near = inF.map((m) => chebyshev((k) => m[k] === 1, false));
  for (let k = 0;k < N4 * N4; k++) {
    const fl = L.topF[k];
    if (fl < 0)
      continue;
    const lim = fl + 1 < FLOORS ? Math.max(0, near[fl + 1][k] - 2) : 99;
    L.roof[k] = Math.min(inside[fl][k], 4, lim);
  }
  for (let lz = 0;lz < N4; lz++) {
    for (let lx = 0;lx < N4; lx++) {
      const k = lz * N4 + lx;
      L.roofDir[k] = -1;
      const fl = L.topF[k];
      if (fl < 0)
        continue;
      let best = L.roof[k];
      for (let d = 0;d < 4; d++) {
        const x = lx + DX3[d], z = lz + DZ3[d];
        if (x < 0 || z < 0 || x >= N4 || z >= N4)
          continue;
        const q = z * N4 + x;
        if (L.topF[q] === fl && L.roof[q] > best) {
          best = L.roof[q];
          L.roofDir[k] = d;
        }
      }
    }
  }
}
var cellAt = (L, fl, i, j) => i < 0 || j < 0 || i >= G || j >= G ? OUT : L.cells[fl][idx(i, j)];
var wallBetween = (a, b) => (a !== OUT || b !== OUT) && !(a === b && a !== OUT) && !(a === CORR && b === CORR);
var stairsOf = (m, facing, half = 0) => stateOf(STAIRS[m], { facing, half });
function buildMansion(c, s) {
  const L = mansionLayout(s);
  const X0 = Math.max(c.x0, L.x0 - YARD), X1 = Math.min(c.x0 + 15, L.x0 + N4 - 1 + YARD);
  const Z0 = Math.max(c.z0, L.z0 - YARD), Z1 = Math.min(c.z0 + 15, L.z0 + N4 - 1 + YARD);
  if (X0 > X1 || Z0 > Z1)
    return;
  const y = L.y;
  for (let z = Z0;z <= Z1; z++) {
    for (let x = X0;x <= X1; x++) {
      const lx = x - L.x0, lz = z - L.z0;
      const k = lz * N4 + lx;
      if (lx >= 0 && lz >= 0 && lx < N4 && lz < N4 && L.topF[k] >= 0) {
        c.clearAbove(x, y + 1, z, FLOORS * FH + 12);
        c.foundation(x, y - 1, z, COBBLESTONE);
      } else if (L.yard[(lz + YARD) * NY + lx + YARD]) {
        c.clearAbove(x, y + 1, z, FLOORS * FH + 6);
        const b = c.get(x, y, z);
        if (b >= 0 && (b === AIR || !BLOCK_OPAQUE[b] || isLeaves(b) || isLog(b))) {
          c.foundation(x, y, z, DIRT);
          c.set(x, y, z, GRASS);
        }
      }
    }
  }
  for (let fl = 0;fl < FLOORS; fl++) {
    for (let z = Z0;z <= Z1; z++)
      for (let x = X0;x <= X1; x++)
        drawColumn(c, L, fl, x, z);
  }
  drawRoofs(c, L, X0, X1, Z0, Z1);
  drawEntrance(c, L);
  for (const room of L.rooms) {
    const x0 = L.x0 + room.i * CELL, z0 = L.z0 + room.j * CELL;
    if (x0 > c.x0 + 15 || z0 > c.z0 + 15 || x0 + room.w * CELL < c.x0 || z0 + room.h * CELL < c.z0)
      continue;
    furnish(new RoomDraw(c, L, room));
  }
  for (const st of L.stairs)
    drawStairs(c, L, st);
}
function drawColumn(c, L, fl, x, z) {
  const lx = x - L.x0, lz = z - L.z0;
  if (lx < 0 || lz < 0 || lx >= N4 || lz >= N4 || L.topF[lz * N4 + lx] < fl)
    return;
  const yf = L.y + fl * FH;
  const onX = lx % CELL === 0, onZ = lz % CELL === 0;
  const i = Math.floor(lx / CELL), j = Math.floor(lz / CELL);
  let wall = false, exterior = false, post = false, edge = 0, off = 0, corridor = false;
  if (onX && onZ) {
    const a = cellAt(L, fl, i - 1, j - 1), b = cellAt(L, fl, i, j - 1), cc = cellAt(L, fl, i - 1, j), d = cellAt(L, fl, i, j);
    post = wallBetween(a, b) || wallBetween(cc, d) || wallBetween(a, cc) || wallBetween(b, d);
    exterior = [a, b, cc, d].includes(OUT);
    corridor = a === CORR && b === CORR && cc === CORR && d === CORR;
  } else if (onX) {
    const a = cellAt(L, fl, i - 1, j), b = cellAt(L, fl, i, j);
    wall = wallBetween(a, b);
    exterior = a === OUT || b === OUT;
    edge = L.vEdges[fl][j * (G + 1) + i];
    off = lz - j * CELL;
    corridor = a === CORR && b === CORR;
  } else if (onZ) {
    const a = cellAt(L, fl, i, j - 1), b = cellAt(L, fl, i, j);
    wall = wallBetween(a, b);
    exterior = a === OUT || b === OUT;
    edge = L.hEdges[fl][j * G + i];
    off = lx - i * CELL;
    corridor = a === CORR && b === CORR;
  } else
    corridor = cellAt(L, fl, i, j) === CORR;
  c.set(x, yf, z, exterior ? fl === 0 ? COBBLESTONE : BIRCH_PLANKS : DARK_OAK_PLANKS);
  for (let dy = 1;dy < FH; dy++) {
    let id = AIR;
    if (post)
      id = DARK_OAK_LOG;
    else if (wall) {
      id = exterior ? fl === 0 && dy === 1 ? COBBLESTONE : DARK_OAK_PLANKS : dy === 1 || dy === FH - 1 ? DARK_OAK_PLANKS : BIRCH_PLANKS;
      if (edge === EDGE_OPEN && off >= 3 && off <= 5 && dy <= 3)
        id = AIR;
      else if (edge === EDGE_ENTRANCE && off >= 3 && off <= 5 && dy <= 4)
        id = AIR;
      else if (edge === EDGE_BARS && dy <= 4)
        id = IRON_BARS;
      else if (exterior && !edge && (off === 2 || off === 3 || off === 5 || off === 6) && dy >= 2 && dy <= 4)
        id = GLASS_PANE;
    }
    c.set(x, yf + dy, z, id);
  }
  if (corridor) {
    c.set(x, yf + 1, z, CARPETS.gray);
    if (lx % CELL === 4 && lz % CELL === 4)
      c.set(x, yf + FH - 1, z, stateOf(LANTERN, { hanging: 1 }));
  }
}
function drawRoofs(c, L, X0, X1, Z0, Z1) {
  for (let z = Z0;z <= Z1; z++) {
    for (let x = X0;x <= X1; x++) {
      const lx = x - L.x0, lz = z - L.z0;
      const k = lz * N4 + lx;
      const inside = lx >= 0 && lz >= 0 && lx < N4 && lz < N4;
      const fl = inside ? L.topF[k] : -1;
      if (fl >= 0) {
        const yr = L.y + (fl + 1) * FH;
        c.set(x, yr, z, DARK_OAK_PLANKS);
        const p = L.roof[k];
        if (p > 0)
          c.set(x, yr + p, z, L.roofDir[k] >= 0 ? stairsOf("dark_oak", L.roofDir[k]) : DARK_OAK_PLANKS);
      }
      let eave = -1, eaveDir = 0;
      for (let d = 0;d < 4; d++) {
        const nx = lx + DX3[d], nz = lz + DZ3[d];
        if (nx < 0 || nz < 0 || nx >= N4 || nz >= N4)
          continue;
        const nf = L.topF[nz * N4 + nx];
        if (nf > fl && nf > eave) {
          eave = nf;
          eaveDir = d;
        }
      }
      if (eave >= 0 && (fl < 0 || !coversAt(L, eave, lx, lz)))
        c.set(x, L.y + (eave + 1) * FH, z, stairsOf("dark_oak", eaveDir));
    }
  }
}
var coversAt = (L, fl, lx, lz) => lx >= 0 && lz >= 0 && lx < N4 && lz < N4 && covers(L, fl, lx, lz);
function drawEntrance(c, L) {
  const { i, j, dir } = L.entrance;
  const out = dir, r = dir + 1 & 3;
  const cx = L.x0 + i * CELL + 4 + DX3[out] * 4, cz = L.z0 + j * CELL + 4 + DZ3[out] * 4;
  const at = (u, v) => [cx + DX3[r] * u + DX3[out] * v, cz + DZ3[r] * u + DZ3[out] * v];
  for (let v = 1;v <= 3; v++) {
    for (let u = -3;u <= 3; u++) {
      const [x, z] = at(u, v);
      c.clearAbove(x, L.y + 1, z, 8);
      c.foundation(x, L.y - 1, z, COBBLESTONE);
      c.set(x, L.y, z, Math.abs(u) === 3 || v === 3 ? COBBLESTONE : MOSSY_COBBLESTONE);
      if ((u === -3 || u === 3) && v === 3)
        for (let dy = 1;dy <= 4; dy++)
          c.set(x, L.y + dy, z, DARK_OAK_LOG);
      c.set(x, L.y + 5, z, stateOf(SLABS.dark_oak, { type: 0 }));
    }
  }
  for (const u of [-2, 2]) {
    const [x, z] = at(u, 1);
    c.set(x, L.y + 4, z, stateOf(LANTERN, { hanging: 1 }));
  }
}
function drawStairs(c, L, st) {
  const room = L.rooms.find((r) => r.type === "stairs" && r.floor === st.floor && r.i === st.i && r.j === st.j);
  if (!room)
    return;
  const rd = new RoomDraw(c, L, room);
  const up = rd.face(0);
  for (let v = 0;v < 7; v++) {
    for (let u = 2;u <= 4; u++) {
      for (let dy = 1;dy <= v; dy++)
        rd.set(u, v, dy, DARK_OAK_PLANKS);
      rd.set(u, v, v + 1, stairsOf("dark_oak", up));
      if (v >= 1 && v <= 5)
        rd.set(u, v, FH, AIR);
      if (v >= 1)
        rd.set(u, v, FH + 1, AIR);
    }
  }
  for (let v = 0;v <= 5; v++)
    for (const u of [1, 5])
      rd.set(u, v, FH + 1, FENCES.dark_oak);
  for (let u = 2;u <= 4; u++)
    rd.set(u, 0, FH + 1, FENCES.dark_oak);
  rd.lantern(0, 6);
}

class RoomDraw {
  c;
  L;
  room;
  y;
  W;
  D;
  doorU;
  rnd;
  ox;
  oz;
  a;
  r;
  constructor(c, L, room) {
    this.c = c;
    this.L = L;
    this.room = room;
    this.y = L.y + room.floor * FH;
    this.rnd = mulberry32(room.seed);
    const d = room.door?.dir ?? 2;
    this.a = d + 2 & 3;
    this.r = this.a + 1 & 3;
    const x0 = L.x0 + room.i * CELL + 1, x1 = L.x0 + (room.i + room.w) * CELL - 1;
    const z0 = L.z0 + room.j * CELL + 1, z1 = L.z0 + (room.j + room.h) * CELL - 1;
    const ax = DX3[this.a], az = DZ3[this.a], rx = DX3[this.r], rz = DZ3[this.r];
    this.ox = ax ? ax > 0 ? x0 : x1 : rx > 0 ? x0 : x1;
    this.oz = az ? az > 0 ? z0 : z1 : rz > 0 ? z0 : z1;
    this.W = rx ? x1 - x0 + 1 : z1 - z0 + 1;
    this.D = ax ? x1 - x0 + 1 : z1 - z0 + 1;
    if (room.door) {
      const dx = L.x0 + room.door.i * CELL + 4, dz = L.z0 + room.door.j * CELL + 4;
      this.doorU = (dx - this.ox) * rx + (dz - this.oz) * rz;
    } else
      this.doorU = this.W >> 1;
  }
  at(u, v) {
    return [this.ox + DX3[this.r] * u + DX3[this.a] * v, this.oz + DZ3[this.r] * u + DZ3[this.a] * v];
  }
  face(local) {
    return this.a + local & 3;
  }
  set(u, v, dy, id) {
    if (id < 0)
      return;
    const [x, z] = this.at(u, v);
    this.c.set(x, this.y + dy, z, id);
  }
  fill(u0, v0, u1, v1, dy, id) {
    for (let v = v0;v <= v1; v++)
      for (let u = u0;u <= u1; u++)
        this.set(u, v, dy, typeof id === "number" ? id : id(u, v));
  }
  chest(u, v, local, chance = 1) {
    if (this.rnd() >= chance)
      return;
    const [x, z] = this.at(u, v);
    this.c.chest(x, this.y + 1, z, this.face(local), MANSION_LOOT);
  }
  front(u, v) {
    return v <= 1 && Math.abs(u - this.doorU) <= 1 && !!this.room.door;
  }
  lantern(u, v) {
    this.set(u, v, FH - 1, stateOf(LANTERN, { hanging: 1 }));
  }
  perimeter(fn) {
    for (let u = 0;u < this.W; u++) {
      if (!this.front(u, 0))
        fn(u, 0, 2);
      fn(u, this.D - 1, 0);
    }
    for (let v = 1;v < this.D - 1; v++) {
      fn(0, v, 3);
      fn(this.W - 1, v, 1);
    }
  }
  pot() {
    const plants = [POPPY, DANDELION, CORNFLOWER, FLOWERS.allium, FLOWERS.blue_orchid, FLOWERS.white_tulip, FLOWERS.oxeye_daisy];
    return potWith(plants[Math.floor(this.rnd() * plants.length)]) || potWith(POPPY);
  }
}
var FURNISH = {
  jail,
  secret,
  bedroom_small: bedroomSmall,
  flower,
  office,
  checker,
  pumpkin,
  storage,
  birch_pillar: birchPillar,
  cobweb,
  bedroom,
  library,
  wool_x: woolX,
  dining_small: diningSmall,
  fake_portal: fakePortal,
  dining,
  conference,
  map_room: mapRoom,
  chess,
  garden: garden2,
  statue: statue2,
  attic_storage: atticStorage
};
function furnish(r) {
  FURNISH[r.room.type]?.(r);
  const room = r.room;
  room.mobs.forEach((type, k) => {
    const flying = type === MOB_ALLAY;
    const u = flying ? r.W >> 1 : Math.max(0, Math.min(r.W - 1, r.doorU - 1 + k % 3));
    const v = flying ? r.D >> 1 : 1;
    const [x, z] = r.at(u, v);
    if (x < r.c.x0 || x > r.c.x0 + 15 || z < r.c.z0 || z > r.c.z0 + 15)
      return;
    r.c.mob(type, x + 0.5, r.y + (flying ? 2 : 1), z + 0.5);
  });
}
function jail(r) {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, () => r.rnd() < 0.4 ? MOSSY_COBBLESTONE : COBBLESTONE);
  r.set(0, r.D - 1, FH - 1, COBWEB);
  r.set(r.W - 1, r.D - 1, FH - 1, COBWEB);
  r.set(r.W - 1, r.D - 2, FH - 1, COBWEB);
  r.set(0, r.D - 1, 1, HAY_BALE);
  r.set(1, r.D - 1, 1, CARPETS.brown);
}
function secret(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  r.chest(cu - 1, r.D - 1, 2);
  r.chest(cu + 1, r.D - 1, 2);
  if (r.W * r.D > 60 && r.rnd() < 0.6) {
    for (let dy = 1;dy <= 3; dy++)
      for (let du = -1;du <= 1; du++)
        for (let dv = -1;dv <= 1; dv++)
          r.set(cu + du, cv + dv, dy, OBSIDIAN);
    r.set(cu, cv, 2, DIAMOND_BLOCK);
  }
  for (let k = 0;k < 6; k++)
    r.set(Math.floor(r.rnd() * r.W), Math.floor(r.rnd() * r.D), FH - 1 - Math.floor(r.rnd() * 2), COBWEB);
  r.lantern(cu, cv);
}
function bedroomSmall(r) {
  const bed = BEDS[["red", "blue", "light_gray", "brown"][Math.floor(r.rnd() * 4)]] ?? BEDS.red;
  const bu = r.doorU > r.W / 2 ? 1 : r.W - 2;
  r.fill(1, 2, r.W - 2, r.D - 2, 1, CARPETS.white);
  r.set(bu, r.D - 1, 1, stateOf(bed, { facing: r.face(0), part: 1 }));
  r.set(bu, r.D - 2, 1, stateOf(bed, { facing: r.face(0), part: 0 }));
  const side = bu === 1 ? 0 : r.W - 1;
  r.set(side, r.D - 1, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(side, r.D - 1, 2, r.pot());
  r.chest(side, r.D - 3, bu === 1 ? 1 : 3, 0.4);
  r.lantern(r.W >> 1, r.D >> 1);
}
function flower(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let dy = 1;dy <= 2; dy++)
    r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -1;du <= 1; du++)
    for (let dv = -1;dv <= 1; dv++)
      if (du || dv)
        r.set(cu + du, cv + dv, 3, DARK_OAK_LEAVES);
  r.set(cu, cv, 3, DARK_OAK_LEAVES);
  r.perimeter((u, v) => {
    if ((u + v) % 2 === 0)
      return;
    r.set(u, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    r.set(u, v, 2, r.pot());
  });
  r.lantern(cu, 1);
}
function office(r) {
  const cu = r.W >> 1;
  for (let u = 0;u < r.W; u++)
    for (let dy = 1;dy <= 3; dy++)
      r.set(u, r.D - 1, dy, BOOKSHELF);
  for (let u = cu - 1;u <= cu + 1; u++)
    r.set(u, r.D - 3, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(cu, r.D - 4, 1, stateOf(STAIRS.dark_oak, { facing: r.face(2), half: 0 }));
  r.set(cu - 1, r.D - 3, 2, stateOf(LANTERN, { hanging: 0 }));
  r.set(0, 2, 1, LECTERN);
  r.chest(r.W - 1, 2, 3, 0.5);
}
function checker(r) {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, (u, v) => (u + v) % 2 ? WOOL.black : WOOL.white);
  const cu = r.W >> 1, cv = r.D >> 1;
  r.set(cu, cv, 1, FENCES.dark_oak);
  r.set(cu, cv, 2, CARPETS.white);
  r.lantern(cu, cv);
}
function pumpkin(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let dy = 1;dy <= FH - 1; dy++)
    r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -2;du <= 2; du++) {
    for (let dv = -2;dv <= 2; dv++) {
      if (Math.max(Math.abs(du), Math.abs(dv)) !== 2 || r.front(cu + du, cv + dv))
        continue;
      const toCenter = Math.abs(du) > Math.abs(dv) ? du > 0 ? 3 : 1 : dv > 0 ? 2 : 0;
      r.set(cu + du, cv + dv, 1, r.rnd() < 0.5 ? PUMPKIN : stateOf(JACK_O_LANTERN, { facing: r.face(toCenter) }));
    }
  }
}
function storage(r) {
  r.perimeter((u, v) => {
    if (r.rnd() < 0.45)
      r.set(u, v, 1, r.rnd() < 0.5 ? BARREL : HAY_BALE);
    else if (r.rnd() < 0.25)
      r.set(u, v, 1, CRAFTING_TABLE);
  });
  r.chest(1, r.D - 1, 2, 0.8);
  r.chest(r.W - 2, r.D - 1, 2, 0.5);
  r.lantern(r.W >> 1, r.D >> 1);
}
function birchPillar(r) {
  for (const u of [1, r.W - 2]) {
    for (const v of [2, r.D - 2]) {
      for (let dy = 1;dy < FH; dy++)
        r.set(u, v, dy, BIRCH_LOG);
      r.set(u, v - 1, 3, stateOf(LANTERN, { hanging: 0 }));
    }
  }
  r.fill(2, 3, r.W - 3, r.D - 3, 1, CARPETS.light_gray);
}
function cobweb(r) {
  for (let k = 0;k < 10; k++) {
    const u = Math.floor(r.rnd() * r.W), v = Math.floor(r.rnd() * r.D);
    if (!r.front(u, v))
      r.set(u, v, 1 + Math.floor(r.rnd() * (FH - 1)), COBWEB);
  }
  r.chest(r.W >> 1, r.D - 1, 2, 0.7);
}
function bedroom(r) {
  const bed = BEDS[["red", "white", "blue", "light_gray"][Math.floor(r.rnd() * 4)]] ?? BEDS.red;
  r.fill(1, 2, r.W - 2, r.D - 2, 1, CARPETS[["red", "light_gray", "brown"][Math.floor(r.rnd() * 3)]]);
  const cu = r.W >> 1;
  for (const u of [cu - 2, cu + 2]) {
    r.set(u, r.D - 1, 1, stateOf(bed, { facing: r.face(0), part: 1 }));
    r.set(u, r.D - 2, 1, stateOf(bed, { facing: r.face(0), part: 0 }));
  }
  r.set(cu, r.D - 1, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(cu, r.D - 1, 2, r.pot());
  r.chest(0, r.D - 2, 1, 0.6);
  for (let dy = 1;dy <= 2; dy++)
    r.set(r.W - 1, r.D - 1, dy, BOOKSHELF);
  r.set(r.W - 1, r.D - 3, 1, CRAFTING_TABLE);
  r.lantern(cu, r.D >> 1);
}
function library(r) {
  r.perimeter((u, v) => {
    for (let dy = 1;dy <= 4; dy++)
      r.set(u, v, dy, BOOKSHELF);
  });
  const cu = r.W >> 1;
  for (let v = 3;v < r.D - 3; v += 3)
    for (const u of [2, r.W - 3])
      for (let dy = 1;dy <= 3; dy++)
        if (u !== cu)
          r.set(u, v, dy, BOOKSHELF);
  r.set(cu, r.D - 3, 1, LECTERN);
  r.fill(cu - 1, 3, cu + 1, 3, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.chest(cu, r.D - 2, 2, 0.4);
  r.lantern(cu, r.D >> 1);
  r.lantern(cu, 2);
}
function woolX(r) {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, (u, v) => {
    const a = u * (r.D - 1) / Math.max(1, r.W - 1);
    return Math.abs(a - v) < 1 || Math.abs(r.D - 1 - a - v) < 1 ? WOOL.gray : WOOL.white;
  });
  r.lantern(r.W >> 1, r.D >> 1);
}
function diningSmall(r) {
  const cu = r.W >> 1;
  for (let v = 3;v <= r.D - 3; v++) {
    r.set(cu, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    if (v % 2 === 0) {
      r.set(cu - 1, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(3), half: 0 }));
      r.set(cu + 1, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(1), half: 0 }));
    }
  }
  r.set(cu, r.D >> 1, 2, CAKE);
  r.lantern(cu, r.D >> 1);
}
function fakePortal(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let du = -2;du <= 2; du++) {
    for (let dv = -2;dv <= 2; dv++) {
      const ring = Math.max(Math.abs(du), Math.abs(dv)) === 2;
      if (ring) {
        if (Math.abs(du) !== 2 || Math.abs(dv) !== 2)
          r.set(cu + du, cv + dv, 1, OBSIDIAN);
      } else
        r.set(cu + du, cv + dv, 0, WOOL.black);
    }
  }
  r.chest(cu, cv, 2);
  r.perimeter((u, v) => {
    if ((u + v) % 3 === 0)
      for (let dy = 1;dy <= 3; dy++)
        r.set(u, v, dy, BOOKSHELF);
  });
  r.lantern(cu - 2, cv - 2);
  r.lantern(cu + 2, cv + 2);
}
function dining(r) {
  const cu = r.W >> 1;
  for (let v = 3;v <= r.D - 3; v++) {
    for (const u of [cu - 1, cu, cu + 1])
      r.set(u, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    if (v % 2 === 1) {
      r.set(cu - 2, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(3), half: 0 }));
      r.set(cu + 2, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(1), half: 0 }));
    }
    if (v % 4 === 1)
      r.set(cu, v, 2, CAKE);
    else if (v % 4 === 3)
      r.set(cu, v, 2, stateOf(LANTERN, { hanging: 0 }));
  }
  r.set(cu, r.D - 2, 1, stateOf(STAIRS.dark_oak, { facing: r.face(0), half: 0 }));
  r.fill(1, 1, r.W - 2, 1, 1, (u) => Math.abs(u - r.doorU) <= 1 ? AIR : CARPETS.red);
  for (const v of [4, r.D - 5])
    for (const u of [cu - 4, cu + 4])
      r.lantern(u, v);
}
function conference(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let du = -2;du <= 2; du++) {
    for (let dv = -2;dv <= 2; dv++) {
      const d = Math.max(Math.abs(du), Math.abs(dv));
      if (d === 1 || d === 2 && Math.abs(du) !== Math.abs(dv) && (du === 0 || dv === 0))
        r.set(cu + du, cv + dv, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    }
  }
  r.set(cu, cv, 1, DARK_OAK_LOG);
  r.set(cu, cv, 2, stateOf(LANTERN, { hanging: 0 }));
  for (const [du, dv, f] of [[0, -3, 2], [0, 3, 0], [-3, 0, 3], [3, 0, 1], [-2, -2, 2], [2, 2, 0], [-2, 2, 0], [2, -2, 2]]) {
    r.set(cu + du, cv + dv, 1, stateOf(STAIRS.dark_oak, { facing: r.face(f), half: 0 }));
  }
  r.fill(cu - 4, cv - 4, cu + 4, cv + 4, 0, (u, v) => Math.max(Math.abs(u - cu), Math.abs(v - cv)) === 4 ? WOOL.red : DARK_OAK_PLANKS);
  r.lantern(cu - 4, cv - 4);
  r.lantern(cu + 4, cv + 4);
  r.lantern(cu - 4, cv + 4);
  r.lantern(cu + 4, cv - 4);
}
function mapRoom(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  const seed = r.room.seed;
  r.fill(2, 2, r.W - 3, r.D - 3, 0, (u, v) => {
    const n = Math.sin(u * 0.9 + seed) + Math.cos(v * 0.7 + seed * 0.3) + Math.sin((u + v) * 0.4);
    return n > 1.1 ? WOOL.blue : n > 0.2 ? WOOL.green : n > -0.8 ? WOOL.lime : WOOL.brown;
  });
  r.set(cu, r.D - 1, 1, CARTOGRAPHY_TABLE);
  r.set(cu - 1, r.D - 1, 1, BOOKSHELF);
  r.set(cu + 1, r.D - 1, 1, BOOKSHELF);
  r.chest(r.W - 1, cv, 3, 0.8);
  r.lantern(cu - 3, cv);
  r.lantern(cu + 3, cv);
}
function chess(r) {
  const u0 = (r.W >> 1) - 4, v0 = (r.D >> 1) - 3;
  r.fill(u0, v0, u0 + 7, v0 + 7, 0, (u, v) => (u + v) % 2 ? WOOL.black : WOOL.white);
  for (let u = u0;u <= u0 + 7; u++) {
    for (const [v, row] of [[v0, 0], [v0 + 7, 1]])
      if (r.rnd() < 0.8)
        r.set(u, v, 1, row ? PUMPKIN : stateOf(JACK_O_LANTERN, { facing: r.face(0) }));
  }
  r.lantern(r.W >> 1, r.D >> 1);
}
function garden2(r) {
  const cu = r.W >> 1, cv = r.D >> 1;
  r.fill(2, 2, r.W - 3, r.D - 3, 0, GRASS);
  for (let dy = 1;dy <= 4; dy++)
    r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -2;du <= 2; du++) {
    for (let dv = -2;dv <= 2; dv++) {
      for (let dy = 4;dy <= 5; dy++)
        if (Math.abs(du) + Math.abs(dv) <= (dy === 4 ? 3 : 2) && (du || dv || dy === 5))
          r.set(cu + du, cv + dv, dy, DARK_OAK_LEAVES);
    }
  }
  for (let k = 0;k < 10; k++) {
    const u = 2 + Math.floor(r.rnd() * (r.W - 4)), v = 2 + Math.floor(r.rnd() * (r.D - 4));
    if (Math.abs(u - cu) + Math.abs(v - cv) > 1)
      r.set(u, v, 1, [POPPY, DANDELION, CORNFLOWER, FLOWERS.allium, FLOWERS.azure_bluet][k % 5]);
  }
  r.perimeter((u, v) => {
    if ((u + v) % 4 === 0)
      r.set(u, v, 1, r.pot());
  });
}
function statue2(r) {
  const cu = r.W >> 1, cv = (r.D >> 1) + 1;
  r.fill(cu - 3, cv - 3, cu + 3, cv + 3, 1, (u, v) => Math.max(Math.abs(u - cu), Math.abs(v - cv)) === 3 ? stateOf(SLABS.cobblestone, { type: 0 }) : COBBLESTONE);
  for (let dy = 2;dy <= 6; dy++) {
    for (let du = -2;du <= 2; du++) {
      for (let dv = -2;dv <= 2; dv++) {
        let id = WOOL.light_gray;
        if (dv === -2) {
          if (dy === 5)
            id = WOOL.gray;
          else if (dy === 4 && Math.abs(du) === 1)
            id = WOOL.green;
          else if (dy === 4 && Math.abs(du) === 2)
            id = WOOL.white;
          else if (dy === 2 && Math.abs(du) <= 1)
            id = WOOL.gray;
        }
        if (dy === 6 && Math.max(Math.abs(du), Math.abs(dv)) === 2)
          continue;
        r.set(cu + du, cv + dv, dy, id);
      }
    }
  }
  r.set(cu, cv - 3, 3, WOOL.light_gray);
  r.set(cu, cv - 3, 4, WOOL.light_gray);
  r.lantern(1, 1);
  r.lantern(r.W - 2, 1);
  r.lantern(1, r.D - 2);
  r.lantern(r.W - 2, r.D - 2);
}
function atticStorage(r) {
  r.perimeter((u, v) => {
    const k = r.rnd();
    if (k < 0.3)
      r.set(u, v, 1, BARREL);
    else if (k < 0.45)
      r.set(u, v, 1, HAY_BALE);
    else if (k < 0.55)
      r.set(u, v, 1, PUMPKIN);
    if (r.rnd() < 0.15)
      r.set(u, v, FH - 1, COBWEB);
  });
  r.chest(1, r.D - 1, 2, 0.7);
  if (r.W * r.D > 60)
    r.chest(r.W - 2, r.D - 1, 2, 0.7);
  r.lantern(r.W >> 1, r.D >> 1);
}

// goodPG/src/shared/world/netherFortress.ts
var N5 = 0;
var E = 1;
var S = 2;
var W = 3;

class FortressRandom {
  r;
  constructor(seed) {
    this.r = mulberry32(seed | 0);
  }
  nextInt(n) {
    if (n === undefined)
      return this.r() * 4294967296 | 0;
    return Math.floor(this.r() * n);
  }
  nextFloat() {
    return this.r();
  }
}

class Box {
  x0;
  y0;
  z0;
  x1;
  y1;
  z1;
  constructor(x0, y0, z0, x1, y1, z1) {
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.x1 = x1;
    this.y1 = y1;
    this.z1 = z1;
  }
  intersects(o) {
    return this.x1 >= o.x0 && this.x0 <= o.x1 && this.z1 >= o.z0 && this.z0 <= o.z1 && this.y1 >= o.y0 && this.y0 <= o.y1;
  }
  isInside(x, y, z) {
    return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1 && z >= this.z0 && z <= this.z1;
  }
}
function orientBox(fx, fy, fz, ox, oy, oz, w, h, d, dir) {
  switch (dir) {
    case N5:
      return new Box(fx + ox, fy + oy, fz - d + 1 + oz, fx + w - 1 + ox, fy + h - 1 + oy, fz + oz);
    case W:
      return new Box(fx - d + 1 + oz, fy + oy, fz + ox, fx + oz, fy + h - 1 + oy, fz + w - 1 + ox);
    case E:
      return new Box(fx + oz, fy + oy, fz + ox, fx + d - 1 + oz, fy + h - 1 + oy, fz + w - 1 + ox);
    default:
      return new Box(fx + ox, fy + oy, fz + oz, fx + w - 1 + ox, fy + h - 1 + oy, fz + d - 1 + oz);
  }
}
function turn(dir, facing) {
  let f = facing;
  if (dir === S || dir === W)
    f = f === N5 ? S : f === S ? N5 : f;
  if (dir === W || dir === E)
    f = (f + 1) % 4;
  return f;
}

class Drawer {
  c;
  p;
  ticks;
  constructor(c, p, ticks) {
    this.c = c;
    this.p = p;
    this.ticks = ticks;
  }
  wx(x, z) {
    const b = this.p.box;
    return this.p.dir === W ? b.x1 - z : this.p.dir === E ? b.x0 + z : b.x0 + x;
  }
  wy(y) {
    return this.p.box.y0 + y;
  }
  wz(x, z) {
    const b = this.p.box;
    return this.p.dir === N5 ? b.z1 - z : this.p.dir === S ? b.z0 + z : b.z0 + x;
  }
  place(id, x, y, z) {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z))
      return;
    this.c.set(X, Y, Z, id);
    if (id > 0 && BLOCK_FLUID[id])
      this.ticks.push(X, Y, Z);
  }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0;y <= y1; y++)
      for (let x = x0;x <= x1; x++)
        for (let z = z0;z <= z1; z++)
          this.place(id, x, y, z);
  }
  stairs(facing) {
    return stateOf(STAIRS.nether_brick, { facing: turn(this.p.dir, facing), half: 0 });
  }
  column(id, x, y, z) {
    const X = this.wx(x, z), Z = this.wz(x, z);
    let Y = this.wy(y);
    if (!this.c.inside(X, Y, Z))
      return;
    for (;Y > 1; Y--) {
      const b = this.c.get(X, Y, Z);
      if (b < 0 || b !== AIR && !BLOCK_FLUID[b])
        return;
      this.c.set(X, Y, Z, id);
    }
  }
  chest(x, y, z, table) {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z))
      return;
    const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
    let solid = -1, count = 0;
    for (let d = 0;d < 4; d++) {
      const b = this.c.get(X + DX[d], Y, Z + DZ[d]);
      if (b > 0 && BLOCK_OPAQUE[b]) {
        solid = d;
        count++;
      }
    }
    let facing = count === 1 ? (solid + 2) % 4 : N5;
    if (count !== 1) {
      const blocked = (d) => {
        const b = this.c.get(X + DX[d], Y, Z + DZ[d]);
        return b > 0 && BLOCK_OPAQUE[b];
      };
      if (blocked(facing))
        facing = (facing + 2) % 4;
      if (blocked(facing))
        facing = (facing + 1) % 4;
      if (blocked(facing))
        facing = (facing + 2) % 4;
    }
    this.c.chest(X, Y, Z, facing, table);
  }
}

// goodPG/src/shared/world/stronghold.ts
var N6 = 0;
var E2 = 1;
var S2 = 2;
var W2 = 3;
var OPENING = 0;
var WOOD_DOOR = 1;
var GRATES = 2;
var IRON = 3;
var w = (kind, weight, max, minDepth = 0) => ({ kind, weight, max, placed: 0, minDepth });
var WEIGHTS = () => [
  w("straight", 40, 0),
  w("prison_hall", 5, 5),
  w("left_turn", 20, 0),
  w("right_turn", 20, 0),
  w("room_crossing", 10, 6),
  w("straight_stairs_down", 5, 5),
  w("stairs_down", 5, 5),
  w("five_crossing", 5, 4),
  w("chest_corridor", 5, 4),
  w("library", 10, 2, 5),
  w("portal_room", 20, 1, 6)
];
var canPlace = (p, depth) => (p.max === 0 || p.placed < p.max) && depth >= p.minDepth;
var SHAPE2 = {
  straight: [-1, -1, 0, 5, 5, 7],
  prison_hall: [-1, -1, 0, 9, 5, 11],
  left_turn: [-1, -1, 0, 5, 5, 5],
  right_turn: [-1, -1, 0, 5, 5, 5],
  room_crossing: [-4, -1, 0, 11, 7, 11],
  straight_stairs_down: [-1, -7, 0, 5, 11, 8],
  stairs_down: [-1, -7, 0, 5, 11, 5],
  five_crossing: [-4, -3, 0, 10, 9, 11],
  chest_corridor: [-1, -1, 0, 5, 5, 7],
  library: [-4, -1, 0, 14, 11, 15],
  portal_room: [-4, -1, 0, 11, 8, 16]
};
var collision = (g, b) => g.pieces.find((p) => p.box.intersects(b));
var okBox = (b) => b.y0 > 10;
function randomDoor(r) {
  const s = r.nextInt(5);
  return s === 2 ? WOOD_DOOR : s === 3 ? GRATES : s === 4 ? IRON : OPENING;
}
function createPiece(g, kind, fx, fy, fz, dir, depth) {
  if (kind === "start" || kind === "filler_corridor")
    return null;
  const [ox, oy, oz, sw, sh, sd] = SHAPE2[kind];
  let box = orientBox(fx, fy, fz, ox, oy, oz, sw, sh, sd, dir);
  if (kind === "library" && (!okBox(box) || collision(g, box)))
    box = orientBox(fx, fy, fz, ox, oy, oz, sw, 6, sd, dir);
  if (!okBox(box) || collision(g, box))
    return null;
  const r = g.rng;
  const p = { kind, box, dir, depth, door: OPENING };
  if (kind !== "portal_room")
    p.door = randomDoor(r);
  if (kind === "straight") {
    p.left = r.nextInt(2) === 0;
    p.right = r.nextInt(2) === 0;
  } else if (kind === "room_crossing")
    p.type = r.nextInt(5);
  else if (kind === "five_crossing") {
    p.left = r.nextInt(2) === 0;
    p.leftHigh = r.nextInt(2) === 0;
    p.right = r.nextInt(2) === 0;
    p.rightHigh = r.nextInt(3) > 0;
  } else if (kind === "library")
    p.tall = box.y1 - box.y0 + 1 > 6;
  else if (kind === "portal_room")
    p.seed = r.nextInt();
  return p;
}
function fillerBox(g, fx, fy, fz, dir) {
  let box = orientBox(fx, fy, fz, -1, -1, 0, 5, 5, 4, dir);
  const hit = collision(g, box);
  if (!hit)
    return null;
  if (hit.box.y0 === box.y0) {
    for (let d = 2;d >= 1; d--) {
      box = orientBox(fx, fy, fz, -1, -1, 0, 5, 5, d, dir);
      if (!hit.box.intersects(box))
        return orientBox(fx, fy, fz, -1, -1, 0, 5, 5, d + 1, dir);
    }
  }
  return null;
}
function updateWeights(g) {
  let any = false;
  g.total = 0;
  for (const p of g.list) {
    if (p.max > 0 && p.placed < p.max)
      any = true;
    g.total += p.weight;
  }
  return any;
}
function generatePiece(g, fx, fy, fz, dir, depth) {
  if (!updateWeights(g))
    return null;
  if (g.imposed) {
    const p = createPiece(g, g.imposed, fx, fy, fz, dir, depth);
    g.imposed = null;
    if (p)
      return p;
  }
  for (let attempts = 0;attempts < 5; attempts++) {
    let sel = g.rng.nextInt(g.total);
    for (const p of g.list) {
      sel -= p.weight;
      if (sel < 0) {
        if (!canPlace(p, depth) || p === g.previous)
          break;
        const piece = createPiece(g, p.kind, fx, fy, fz, dir, depth);
        if (piece) {
          p.placed++;
          g.previous = p;
          if (p.max !== 0 && p.placed >= p.max)
            g.list.splice(g.list.indexOf(p), 1);
          return piece;
        }
      }
    }
  }
  const box = fillerBox(g, fx, fy, fz, dir);
  if (!box || box.y0 <= 1)
    return null;
  return { kind: "filler_corridor", box, dir, depth, door: OPENING, steps: dir === N6 || dir === S2 ? box.z1 - box.z0 + 1 : box.x1 - box.x0 + 1 };
}
function addPiece(g, fx, fy, fz, dir, depth) {
  if (depth > 50)
    return;
  if (Math.abs(fx - g.start.box.x0) > 112 || Math.abs(fz - g.start.box.z0) > 112)
    return;
  const p = generatePiece(g, fx, fy, fz, dir, depth + 1);
  if (p) {
    g.pieces.push(p);
    g.pending.push(p);
  }
}
function forward(g, p, xOff, yOff) {
  const b = p.box;
  switch (p.dir) {
    case N6:
      return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z0 - 1, p.dir, p.depth);
    case S2:
      return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z1 + 1, p.dir, p.depth);
    case W2:
      return addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth);
    case E2:
      return addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth);
  }
}
function left(g, p, yOff, zOff) {
  const b = p.box;
  if (p.dir === N6 || p.dir === S2)
    addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + zOff, W2, p.depth);
  else
    addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z0 - 1, N6, p.depth);
}
function right(g, p, yOff, zOff) {
  const b = p.box;
  if (p.dir === N6 || p.dir === S2)
    addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + zOff, E2, p.depth);
  else
    addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z1 + 1, S2, p.depth);
}
function addChildren(g, p) {
  switch (p.kind) {
    case "start":
      g.imposed = "five_crossing";
      return forward(g, p, 1, 1);
    case "straight":
      forward(g, p, 1, 1);
      if (p.left)
        left(g, p, 1, 2);
      if (p.right)
        right(g, p, 1, 2);
      return;
    case "prison_hall":
    case "chest_corridor":
    case "straight_stairs_down":
    case "stairs_down":
      return forward(g, p, 1, 1);
    case "left_turn":
      return p.dir !== N6 && p.dir !== E2 ? right(g, p, 1, 1) : left(g, p, 1, 1);
    case "right_turn":
      return p.dir !== N6 && p.dir !== E2 ? left(g, p, 1, 1) : right(g, p, 1, 1);
    case "room_crossing":
      forward(g, p, 4, 1);
      left(g, p, 1, 4);
      right(g, p, 1, 4);
      return;
    case "five_crossing": {
      let a = 3, b = 5;
      if (p.dir === W2 || p.dir === N6) {
        a = 8 - a;
        b = 8 - b;
      }
      forward(g, p, 5, 1);
      if (p.left)
        left(g, p, 1, a);
      if (p.leftHigh)
        left(g, p, 7, b);
      if (p.right)
        right(g, p, 1, a);
      if (p.rightHigh)
        right(g, p, 7, b);
      return;
    }
    case "portal_room":
      g.portalRoom = true;
      return;
  }
}
function strongholdPieces(seed, cx, cz) {
  for (let tries = 0;; tries++) {
    const rng = new FortressRandom(hash2(tries, 87, seed));
    const dir = [N6, E2, S2, W2][rng.nextInt(4)];
    const x = cx * 16 + 2, z = cz * 16 + 2;
    const box = new Box(x, 64, z, x + 4, 74, z + 4);
    const start = { kind: "start", box, dir, depth: 0, door: OPENING };
    const g = { rng, start, list: WEIGHTS(), total: 0, previous: null, imposed: null, portalRoom: false, pending: [], pieces: [start] };
    addChildren(g, start);
    while (g.pending.length > 0)
      addChildren(g, g.pending.splice(rng.nextInt(g.pending.length), 1)[0]);
    if (!g.portalRoom && tries < 40)
      continue;
    const b = strongholdBounds(g.pieces);
    const maxY = SEA_LEVEL - 10;
    let top = b.y1 - b.y0 + 1 + MIN_Y + 1;
    if (top < maxY)
      top += rng.nextInt(maxY - top);
    const dy = top - b.y1;
    for (const p of g.pieces) {
      p.box.y0 += dy;
      p.box.y1 += dy;
    }
    return g.pieces;
  }
}
function strongholdBounds(pieces) {
  const b = new Box(1e9, 1e9, 1e9, -1e9, -1e9, -1e9);
  for (const p of pieces) {
    b.x0 = Math.min(b.x0, p.box.x0);
    b.y0 = Math.min(b.y0, p.box.y0);
    b.z0 = Math.min(b.z0, p.box.z0);
    b.x1 = Math.max(b.x1, p.box.x1);
    b.y1 = Math.max(b.y1, p.box.y1);
    b.z1 = Math.max(b.z1, p.box.z1);
  }
  return b;
}

class StrongholdDrawer extends Drawer {
  seed;
  constructor(c, p, ticks, seed) {
    super(c, p, ticks);
    this.seed = seed;
  }
  rnd(x, y, z, salt) {
    return hash3(this.wx(x, z), this.wy(y), this.wz(x, z), this.seed ^ salt) / 4294967296;
  }
  stone(x0, y0, z0, x1, y1, z1, skipAir) {
    for (let y = y0;y <= y1; y++) {
      for (let x = x0;x <= x1; x++) {
        for (let z = z0;z <= z1; z++) {
          if (skipAir && this.c.get(this.wx(x, z), this.wy(y), this.wz(x, z)) === AIR)
            continue;
          const edge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
          let id = AIR;
          if (edge) {
            const f = this.rnd(x, y, z, 1505);
            id = f < 0.2 ? CRACKED_STONE_BRICKS : f < 0.5 ? MOSSY_STONE_BRICKS : f < 0.55 ? INFESTED_STONE_BRICKS : STONE_BRICKS;
          }
          this.place(id, x, y, z);
        }
      }
    }
  }
  maybe(chance, id, x, y, z) {
    if (this.rnd(x, y, z, 935) < chance)
      this.place(id, x, y, z);
  }
  maybeBox(chance, x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0;y <= y1; y++)
      for (let x = x0;x <= x1; x++)
        for (let z = z0;z <= z1; z++)
          this.maybe(chance, id, x, y, z);
  }
  facing(block, facing, extra = {}) {
    return stateOf(block, { facing: turn(this.p.dir, facing), ...extra });
  }
  torch(facing) {
    return this.facing(WALL_TORCH, facing);
  }
  door(type, x, y, z) {
    const SB = STONE_BRICKS;
    if (type === OPENING) {
      this.box(x, y, z, x + 2, y + 2, z, AIR);
      return;
    }
    if (type === GRATES) {
      this.place(AIR, x + 1, y, z);
      this.place(AIR, x + 1, y + 1, z);
      for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]])
        this.place(IRON_BARS, x + dx, y + dy, z);
      return;
    }
    for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]])
      this.place(SB, x + dx, y + dy, z);
    const door = type === WOOD_DOOR ? DOORS.oak : IRON_DOOR;
    this.place(this.facing(door, N6, { half: 0, open: 0, hinge: 0 }), x + 1, y, z);
    this.place(this.facing(door, N6, { half: 1, open: 0, hinge: 0 }), x + 1, y + 1, z);
    if (type === IRON) {
      this.place(this.facing(BUTTONS.stone, N6, { mount: MOUNT_WALL, powered: 0 }), x + 2, y + 1, z + 1);
      this.place(this.facing(BUTTONS.stone, S2, { mount: MOUNT_WALL, powered: 0 }), x + 2, y + 1, z - 1);
    }
  }
}
var SB = STONE_BRICKS;
var BRICK_SLAB = () => stateOf(SLABS.stone_brick, { type: 0 });
var SMOOTH_SLAB = () => stateOf(SLABS.smooth_stone, { type: 0 });
function drawStraight(d, p) {
  d.stone(0, 0, 0, 4, 4, 6, true);
  d.door(p.door, 1, 1, 0);
  d.door(OPENING, 1, 1, 6);
  d.maybe(0.1, d.torch(E2), 1, 2, 1);
  d.maybe(0.1, d.torch(W2), 3, 2, 1);
  d.maybe(0.1, d.torch(E2), 1, 2, 5);
  d.maybe(0.1, d.torch(W2), 3, 2, 5);
  if (p.left)
    d.box(0, 1, 2, 0, 3, 4, AIR);
  if (p.right)
    d.box(4, 1, 2, 4, 3, 4, AIR);
}
function drawChestCorridor(d, p) {
  d.stone(0, 0, 0, 4, 4, 6, true);
  d.door(p.door, 1, 1, 0);
  d.door(OPENING, 1, 1, 6);
  d.box(3, 1, 2, 3, 1, 4, SB);
  d.place(BRICK_SLAB(), 3, 1, 1);
  d.place(BRICK_SLAB(), 3, 1, 5);
  d.place(BRICK_SLAB(), 3, 2, 2);
  d.place(BRICK_SLAB(), 3, 2, 4);
  for (let z = 2;z <= 4; z++)
    d.place(BRICK_SLAB(), 2, 1, z);
  d.chest(3, 2, 3, "stronghold_corridor");
}
function drawTurn(d, p) {
  d.stone(0, 0, 0, 4, 4, 4, true);
  d.door(p.door, 1, 1, 0);
  const mirrored = p.dir !== N6 && p.dir !== E2;
  const toRight = p.kind === "left_turn" === mirrored;
  if (toRight)
    d.box(4, 1, 1, 4, 3, 3, AIR);
  else
    d.box(0, 1, 1, 0, 3, 3, AIR);
}
function drawStairsDown(d, p) {
  d.stone(0, 0, 0, 4, 10, 4, true);
  d.door(p.door, 1, 7, 0);
  d.door(OPENING, 1, 1, 4);
  const slab = SMOOTH_SLAB();
  d.place(SB, 2, 6, 1);
  d.place(SB, 1, 5, 1);
  d.place(slab, 1, 6, 1);
  d.place(SB, 1, 5, 2);
  d.place(SB, 1, 4, 3);
  d.place(slab, 1, 5, 3);
  d.place(SB, 2, 4, 3);
  d.place(SB, 3, 3, 3);
  d.place(slab, 3, 4, 3);
  d.place(SB, 3, 3, 2);
  d.place(SB, 3, 2, 1);
  d.place(slab, 3, 3, 1);
  d.place(SB, 2, 2, 1);
  d.place(SB, 1, 1, 1);
  d.place(slab, 1, 2, 1);
  d.place(SB, 1, 1, 2);
  d.place(slab, 1, 1, 3);
}
function drawStraightStairsDown(d, p) {
  d.stone(0, 0, 0, 4, 10, 7, true);
  d.door(p.door, 1, 7, 0);
  d.door(OPENING, 1, 1, 7);
  const stairs = d.facing(STAIRS.cobblestone, S2, { half: 0 });
  for (let i = 0;i < 6; i++) {
    for (let x = 1;x <= 3; x++) {
      d.place(stairs, x, 6 - i, 1 + i);
      if (i < 5)
        d.place(SB, x, 5 - i, 1 + i);
    }
  }
}
function drawPrisonHall(d, p) {
  d.stone(0, 0, 0, 8, 4, 10, true);
  d.door(p.door, 1, 1, 0);
  d.box(1, 1, 10, 3, 3, 10, AIR);
  d.stone(4, 1, 1, 4, 3, 1, false);
  d.stone(4, 1, 3, 4, 3, 3, false);
  d.stone(4, 1, 7, 4, 3, 7, false);
  d.stone(4, 1, 9, 4, 3, 9, false);
  for (let y = 1;y <= 3; y++) {
    d.place(IRON_BARS, 4, y, 4);
    d.place(IRON_BARS, 4, y, 5);
    d.place(IRON_BARS, 4, y, 6);
    d.place(IRON_BARS, 5, y, 5);
    d.place(IRON_BARS, 6, y, 5);
    d.place(IRON_BARS, 7, y, 5);
  }
  d.place(IRON_BARS, 4, 3, 2);
  d.place(IRON_BARS, 4, 3, 8);
  d.place(d.facing(IRON_DOOR, W2, { half: 0, open: 0, hinge: 0 }), 4, 1, 2);
  d.place(d.facing(IRON_DOOR, W2, { half: 1, open: 0, hinge: 0 }), 4, 2, 2);
  d.place(d.facing(IRON_DOOR, W2, { half: 0, open: 0, hinge: 0 }), 4, 1, 8);
  d.place(d.facing(IRON_DOOR, W2, { half: 1, open: 0, hinge: 0 }), 4, 2, 8);
}
function drawRoomCrossing(d, p) {
  d.stone(0, 0, 0, 10, 6, 10, true);
  d.door(p.door, 4, 1, 0);
  d.box(4, 1, 10, 6, 3, 10, AIR);
  d.box(0, 1, 4, 0, 3, 6, AIR);
  d.box(10, 1, 4, 10, 3, 6, AIR);
  const slab = SMOOTH_SLAB();
  switch (p.type) {
    case 0:
      d.box(5, 1, 5, 5, 3, 5, SB);
      d.place(d.torch(W2), 4, 3, 5);
      d.place(d.torch(E2), 6, 3, 5);
      d.place(d.torch(S2), 5, 3, 4);
      d.place(d.torch(N6), 5, 3, 6);
      for (const [x, z] of [[4, 4], [4, 5], [4, 6], [6, 4], [6, 5], [6, 6], [5, 4], [5, 6]])
        d.place(slab, x, 1, z);
      break;
    case 1:
      for (let i = 0;i < 5; i++) {
        d.place(SB, 3, 1, 3 + i);
        d.place(SB, 7, 1, 3 + i);
        d.place(SB, 3 + i, 1, 3);
        d.place(SB, 3 + i, 1, 7);
      }
      d.box(5, 1, 5, 5, 3, 5, SB);
      d.place(WATER, 5, 4, 5);
      break;
    case 2: {
      for (let z = 1;z <= 9; z++) {
        d.place(COBBLESTONE, 1, 3, z);
        d.place(COBBLESTONE, 9, 3, z);
      }
      for (let x = 1;x <= 9; x++) {
        d.place(COBBLESTONE, x, 3, 1);
        d.place(COBBLESTONE, x, 3, 9);
      }
      for (const [x, y, z] of [[5, 1, 4], [5, 1, 6], [5, 3, 4], [5, 3, 6], [4, 1, 5], [6, 1, 5], [4, 3, 5], [6, 3, 5]])
        d.place(COBBLESTONE, x, y, z);
      for (let y = 1;y <= 3; y++) {
        d.place(COBBLESTONE, 4, y, 4);
        d.place(COBBLESTONE, 6, y, 4);
        d.place(COBBLESTONE, 4, y, 6);
        d.place(COBBLESTONE, 6, y, 6);
      }
      d.place(d.torch(N6), 5, 3, 5);
      for (let z = 2;z <= 8; z++) {
        d.place(OAK_PLANKS, 2, 3, z);
        d.place(OAK_PLANKS, 3, 3, z);
        if (z <= 3 || z >= 7) {
          d.place(OAK_PLANKS, 4, 3, z);
          d.place(OAK_PLANKS, 5, 3, z);
          d.place(OAK_PLANKS, 6, 3, z);
        }
        d.place(OAK_PLANKS, 7, 3, z);
        d.place(OAK_PLANKS, 8, 3, z);
      }
      const ladder = d.facing(LADDER, W2);
      for (let y = 1;y <= 3; y++)
        d.place(ladder, 9, y, 3);
      d.chest(3, 4, 8, "stronghold_crossing");
      break;
    }
  }
}
function drawFiveCrossing(d, p) {
  d.stone(0, 0, 0, 9, 8, 10, true);
  d.door(p.door, 4, 3, 0);
  if (p.left)
    d.box(0, 3, 1, 0, 5, 3, AIR);
  if (p.right)
    d.box(9, 3, 1, 9, 5, 3, AIR);
  if (p.leftHigh)
    d.box(0, 5, 7, 0, 7, 9, AIR);
  if (p.rightHigh)
    d.box(9, 5, 7, 9, 7, 9, AIR);
  d.box(5, 1, 10, 7, 3, 10, AIR);
  d.stone(1, 2, 1, 8, 2, 6, false);
  d.stone(4, 1, 5, 4, 4, 9, false);
  d.stone(8, 1, 5, 8, 4, 9, false);
  d.stone(1, 4, 7, 3, 4, 9, false);
  d.stone(1, 3, 5, 3, 3, 6, false);
  const slab = SMOOTH_SLAB();
  d.box(1, 3, 4, 3, 3, 4, slab);
  d.box(1, 4, 6, 3, 4, 6, slab);
  d.stone(5, 1, 7, 7, 1, 8, false);
  d.box(5, 1, 9, 7, 1, 9, slab);
  d.box(5, 2, 7, 7, 2, 7, slab);
  d.box(4, 5, 7, 4, 5, 9, slab);
  d.box(8, 5, 7, 8, 5, 9, slab);
  d.box(5, 5, 7, 7, 5, 9, stateOf(SLABS.smooth_stone, { type: 2 }));
  d.place(d.torch(S2), 6, 5, 6);
}
function drawLibrary(d, p) {
  const height = p.tall ? 11 : 6;
  d.stone(0, 0, 0, 13, height - 1, 14, true);
  d.door(p.door, 4, 1, 0);
  d.maybeBox(0.07, 2, 1, 1, 11, 4, 13, COBWEB);
  for (let z = 1;z <= 13; z++) {
    const shelf = (z - 1) % 4 === 0 ? OAK_PLANKS : BOOKSHELF;
    d.box(1, 1, z, 1, 4, z, shelf);
    d.box(12, 1, z, 12, 4, z, shelf);
    if (shelf === OAK_PLANKS) {
      d.place(d.torch(E2), 2, 3, z);
      d.place(d.torch(W2), 11, 3, z);
    }
    if (p.tall) {
      d.box(1, 6, z, 1, 9, z, shelf);
      d.box(12, 6, z, 12, 9, z, shelf);
    }
  }
  for (let z = 3;z < 12; z += 2) {
    d.box(3, 1, z, 4, 3, z, BOOKSHELF);
    d.box(6, 1, z, 7, 3, z, BOOKSHELF);
    d.box(9, 1, z, 10, 3, z, BOOKSHELF);
  }
  if (p.tall) {
    d.box(1, 5, 1, 3, 5, 13, OAK_PLANKS);
    d.box(10, 5, 1, 12, 5, 13, OAK_PLANKS);
    d.box(4, 5, 1, 9, 5, 2, OAK_PLANKS);
    d.box(4, 5, 12, 9, 5, 13, OAK_PLANKS);
    d.place(OAK_PLANKS, 9, 5, 11);
    d.place(OAK_PLANKS, 8, 5, 11);
    d.place(OAK_PLANKS, 9, 5, 10);
    const fence = FENCES.oak;
    d.box(3, 6, 3, 3, 6, 11, fence);
    d.box(10, 6, 3, 10, 6, 9, fence);
    d.box(4, 6, 2, 9, 6, 2, fence);
    d.box(4, 6, 12, 7, 6, 12, fence);
    d.place(fence, 3, 6, 2);
    d.place(fence, 3, 6, 12);
    d.place(fence, 10, 6, 2);
    for (let i = 0;i <= 2; i++) {
      d.place(fence, 8 + i, 6, 12 - i);
      if (i !== 2)
        d.place(fence, 8 + i, 6, 11 - i);
    }
    const ladder = d.facing(LADDER, S2);
    for (let y = 1;y <= 7; y++)
      d.place(ladder, 10, y, 13);
    for (const [x, y, z] of [[6, 9, 7], [7, 9, 7], [6, 8, 7], [7, 8, 7], [6, 7, 7], [7, 7, 7], [5, 7, 7], [8, 7, 7], [6, 7, 6], [6, 7, 8], [7, 7, 6], [7, 7, 8]]) {
      d.place(fence, x, y, z);
    }
    for (const [x, y, z] of [[5, 8, 7], [8, 8, 7], [6, 8, 6], [6, 8, 8], [7, 8, 6], [7, 8, 8]])
      d.place(TORCH, x, y, z);
  }
  d.chest(3, 3, 5, "stronghold_library");
  if (p.tall) {
    d.place(AIR, 12, 9, 1);
    d.chest(12, 8, 1, "stronghold_library");
  }
}
function drawPortalRoom(d, p) {
  d.stone(0, 0, 0, 10, 7, 15, false);
  d.door(GRATES, 4, 1, 0);
  d.stone(1, 6, 1, 1, 6, 14, false);
  d.stone(9, 6, 1, 9, 6, 14, false);
  d.stone(2, 6, 1, 8, 6, 2, false);
  d.stone(2, 6, 14, 8, 6, 14, false);
  d.stone(1, 1, 1, 2, 1, 4, false);
  d.stone(8, 1, 1, 9, 1, 4, false);
  d.box(1, 1, 1, 1, 1, 3, LAVA);
  d.box(9, 1, 1, 9, 1, 3, LAVA);
  d.stone(3, 1, 8, 7, 1, 12, false);
  d.box(4, 1, 9, 6, 1, 11, LAVA);
  for (let z = 3;z < 14; z += 2) {
    d.box(0, 3, z, 0, 4, z, IRON_BARS);
    d.box(10, 3, z, 10, 4, z, IRON_BARS);
  }
  for (let x = 2;x < 9; x += 2)
    d.box(x, 3, 15, x, 4, 15, IRON_BARS);
  const stairs = d.facing(STAIRS.stone_brick, N6, { half: 0 });
  d.stone(4, 1, 5, 6, 1, 7, false);
  d.stone(4, 2, 6, 6, 2, 7, false);
  d.stone(4, 3, 7, 6, 3, 7, false);
  for (let x = 4;x <= 6; x++) {
    d.place(stairs, x, 1, 4);
    d.place(stairs, x, 2, 5);
    d.place(stairs, x, 3, 6);
  }
  const r = new FortressRandom(p.seed ?? 0);
  const eyes = [];
  let all = true;
  for (let i = 0;i < 12; i++) {
    eyes.push(r.nextFloat() > 0.9 ? 1 : 0);
    all &&= eyes[i] === 1;
  }
  const frame = (f, i) => d.facing(END_PORTAL_FRAME, f, { eye: eyes[i] });
  for (let i = 0;i < 3; i++) {
    d.place(frame(N6, i), 4 + i, 3, 8);
    d.place(frame(S2, 3 + i), 4 + i, 3, 12);
    d.place(frame(E2, 6 + i), 3, 3, 9 + i);
    d.place(frame(W2, 9 + i), 7, 3, 9 + i);
  }
  if (all)
    d.box(4, 3, 9, 6, 3, 11, END_PORTAL);
  d.place(MOB_SPAWNER, 5, 3, 6);
}
function drawFiller(d, p) {
  for (let i = 0;i < (p.steps ?? 0); i++) {
    d.box(0, 0, i, 4, 0, i, SB);
    for (let y = 1;y <= 3; y++) {
      d.place(SB, 0, y, i);
      d.box(1, y, i, 3, y, i, AIR);
      d.place(SB, 4, y, i);
    }
    d.box(0, 4, i, 4, 4, i, SB);
  }
}
function drawStronghold(c, pieces, ticks, seed) {
  const { x0, z0 } = c;
  for (const p of pieces) {
    const b = p.box;
    if (b.x1 < x0 || b.x0 > x0 + 15 || b.z1 < z0 || b.z0 > z0 + 15)
      continue;
    const d = new StrongholdDrawer(c, p, ticks, seed);
    switch (p.kind) {
      case "start":
      case "stairs_down":
        drawStairsDown(d, p);
        break;
      case "straight":
        drawStraight(d, p);
        break;
      case "chest_corridor":
        drawChestCorridor(d, p);
        break;
      case "left_turn":
      case "right_turn":
        drawTurn(d, p);
        break;
      case "straight_stairs_down":
        drawStraightStairsDown(d, p);
        break;
      case "prison_hall":
        drawPrisonHall(d, p);
        break;
      case "room_crossing":
        drawRoomCrossing(d, p);
        break;
      case "five_crossing":
        drawFiveCrossing(d, p);
        break;
      case "library":
        drawLibrary(d, p);
        break;
      case "portal_room":
        drawPortalRoom(d, p);
        break;
      case "filler_corridor":
        drawFiller(d, p);
        break;
    }
  }
}
var STRONGHOLD_RINGS = { distance: 32, spread: 3, count: 128 };
var ringCache = new Map;
function ringStarts(seed) {
  const hit = ringCache.get(seed);
  if (hit)
    return hit;
  const { distance, count } = STRONGHOLD_RINGS;
  let spread = STRONGHOLD_RINGS.spread;
  const r = mulberry32(hash2(seed, 22432, 15949));
  let angle = r() * Math.PI * 2;
  let inCircle = 0, circle = 0;
  const out = [];
  for (let i = 0;i < count; i++) {
    const dist = 4 * distance + distance * circle * 6 + (r() - 0.5) * (distance * 2.5);
    out.push({ cx: Math.round(Math.cos(angle) * dist), cz: Math.round(Math.sin(angle) * dist), search: r() * 4294967296 >>> 0 });
    angle += Math.PI * 2 / spread;
    if (++inCircle === spread) {
      circle++;
      inCircle = 0;
      spread += Math.floor(2 * spread / (circle + 1));
      spread = Math.min(spread, count - i);
      angle += r() * Math.PI * 2;
    }
  }
  if (ringCache.size > 8)
    ringCache.clear();
  ringCache.set(seed, out);
  return out;
}
function landBiome(b) {
  return !isOceanBiome(b) && b !== BIOME_RIVER && b !== BIOME_FROZEN_RIVER && baseBiome(b) !== BIOME_BEACH;
}
var startCache = new Map;
function strongholdStart(gen, i) {
  const k = `${gen.seed}:${i}`;
  const hit = startCache.get(k);
  if (hit)
    return hit;
  const s0 = ringStarts(gen.seed)[i];
  const bx = s0.cx * 16 + 8, bz = s0.cz * 16 + 8;
  const r = mulberry32(s0.search);
  let found = null, n = 0;
  for (let dz = -112;dz <= 112; dz += 8) {
    for (let dx = -112;dx <= 112; dx += 8) {
      if (dx * dx + dz * dz > 112 * 112)
        continue;
      if (!landBiome(gen.biomeAt(bx + dx, bz + dz)))
        continue;
      if (Math.floor(r() * ++n) === 0)
        found = [bx + dx, bz + dz];
    }
  }
  const cx = found ? found[0] >> 4 : s0.cx, cz = found ? found[1] >> 4 : s0.cz;
  const pieces = strongholdPieces(hash2(cx, cz, gen.seed ^ 22281), cx, cz);
  const s = { cx, cz, pieces, bounds: strongholdBounds(pieces) };
  if (startCache.size > 32)
    startCache.clear();
  startCache.set(k, s);
  return s;
}
var REACH = 112 + 112 + 32;
function strongholdsNear(gen, x0, z0, x1, z1) {
  const out = [];
  const starts = ringStarts(gen.seed);
  for (let i = 0;i < starts.length; i++) {
    const s0 = starts[i];
    const sx = s0.cx * 16, sz = s0.cz * 16;
    if (sx + REACH < x0 || sx - REACH > x1 || sz + REACH < z0 || sz - REACH > z1)
      continue;
    const s = strongholdStart(gen, i);
    const b = s.bounds;
    if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1)
      continue;
    out.push(s);
  }
  return out;
}
function placeStrongholds(gen, c, ticks) {
  for (const s of strongholdsNear(gen, c.x0, c.z0, c.x0 + 15, c.z0 + 15))
    drawStronghold(c, s.pieces, ticks, gen.seed ^ s.cx * 31 + s.cz);
}
function locateStronghold(gen, x, z) {
  const starts = ringStarts(gen.seed);
  const order = starts.map((s, i) => [Math.hypot(s.cx * 16 + 8 - x, s.cz * 16 + 8 - z), i]).sort((a, b) => a[0] - b[0]);
  let best = null, bd = Infinity;
  for (const [d0, i] of order) {
    if (d0 - 160 > bd)
      break;
    const s = strongholdStart(gen, i);
    const d = Math.hypot(s.cx * 16 - x, s.cz * 16 - z);
    if (d < bd) {
      bd = d;
      best = [s.cx * 16, s.pieces[0].box.y0 + 1, s.cz * 16];
    }
  }
  return best;
}

// goodPG/src/shared/world/mineshaft.ts
var N7 = 0;
var E3 = 1;
var S3 = 2;
var W3 = 3;

class MineRandom {
  s;
  constructor(seed) {
    this.s = seed | 0;
  }
  next() {
    let t = this.s = this.s + 1831565813 | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  nextInt(n) {
    return n <= 0 ? 0 : Math.floor(this.next() * n);
  }
  nextFloat() {
    return this.next();
  }
  nextDouble() {
    return this.next();
  }
  nextBoolean() {
    return this.next() < 0.5;
  }
}

class Builder {
  pieces = [];
  collides(b) {
    for (const p of this.pieces)
      if (p.box.intersects(b))
        return true;
    return false;
  }
}
var move = (b, x, y, z) => new Box(b.x0 + x, b.y0 + y, b.z0 + z, b.x1 + x, b.y1 + y, b.z1 + z);
function findCorridor(g, r, x, y, z, dir) {
  for (let len = r.nextInt(3) + 2;len > 0; len--) {
    const l = len * 5;
    const b = dir === S3 ? new Box(0, 0, 0, 2, 2, l - 1) : dir === W3 ? new Box(-(l - 1), 0, 0, 0, 2, 2) : dir === E3 ? new Box(0, 0, 0, l - 1, 2, 2) : new Box(0, 0, -(l - 1), 2, 2, 0);
    const box = move(b, x, y, z);
    if (!g.collides(box))
      return box;
  }
  return null;
}
function findCrossing(g, r, x, y, z, dir) {
  const y1 = r.nextInt(4) === 0 ? 6 : 2;
  const b = dir === S3 ? new Box(-1, 0, 0, 3, y1, 4) : dir === W3 ? new Box(-4, 0, -1, 0, y1, 3) : dir === E3 ? new Box(0, 0, -1, 4, y1, 3) : new Box(-1, 0, -4, 3, y1, 0);
  const box = move(b, x, y, z);
  return g.collides(box) ? null : box;
}
function findStairs(g, x, y, z, dir) {
  const b = dir === S3 ? new Box(0, -5, 0, 2, 2, 8) : dir === W3 ? new Box(-8, -5, 0, 0, 2, 2) : dir === E3 ? new Box(0, -5, 0, 8, 2, 2) : new Box(0, -5, -8, 2, 2, 0);
  const box = move(b, x, y, z);
  return g.collides(box) ? null : box;
}
function randomPiece(g, r, x, y, z, dir, depth) {
  const sel = r.nextInt(100);
  if (sel >= 80) {
    const box = findCrossing(g, r, x, y, z, dir);
    if (box)
      return { kind: "crossing", box, dir: -1, depth, seed: 0, cdir: dir, twoFloored: box.y1 - box.y0 + 1 > 3 };
  } else if (sel >= 70) {
    const box = findStairs(g, x, y, z, dir);
    if (box)
      return { kind: "stairs", box, dir, depth, seed: 0 };
  } else {
    const box = findCorridor(g, r, x, y, z, dir);
    if (box) {
      const rails = r.nextInt(3) === 0;
      const spider = !rails && r.nextInt(23) === 0;
      const sections = (dir === N7 || dir === S3 ? box.z1 - box.z0 + 1 : box.x1 - box.x0 + 1) / 5;
      return { kind: "corridor", box, dir, depth, seed: 0, rails, spider, sections };
    }
  }
  return null;
}
function addPiece2(start, g, r, x, y, z, dir, depth) {
  if (depth > 8)
    return null;
  if (Math.abs(x - start.box.x0) > 80 || Math.abs(z - start.box.z0) > 80)
    return null;
  const p = randomPiece(g, r, x, y, z, dir, depth + 1);
  if (p) {
    p.seed = r.nextDouble() * 2147483647 | 0;
    g.pieces.push(p);
    addChildren2(p, start, g, r);
  }
  return p;
}
function addChildren2(p, start, g, r) {
  const { box: b, depth: d } = p;
  if (p.kind === "room") {
    let hs = b.y1 - b.y0 + 1 - 3 - 1;
    if (hs <= 0)
      hs = 1;
    const xs = b.x1 - b.x0 + 1, zs = b.z1 - b.z0 + 1;
    const entrances = p.entrances;
    const side = (span, place, entrance) => {
      let pos = 0;
      while (pos < span) {
        pos += r.nextInt(span);
        if (pos + 3 > span)
          break;
        const child = place(pos, b.y0 + r.nextInt(hs) + 1);
        if (child)
          entrances.push(entrance(child.box));
        pos += 4;
      }
    };
    side(xs, (pos, y) => addPiece2(start, g, r, b.x0 + pos, y, b.z0 - 1, N7, d), (c) => new Box(c.x0, c.y0, b.z0, c.x1, c.y1, b.z0 + 1));
    side(xs, (pos, y) => addPiece2(start, g, r, b.x0 + pos, y, b.z1 + 1, S3, d), (c) => new Box(c.x0, c.y0, b.z1 - 1, c.x1, c.y1, b.z1));
    side(zs, (pos, y) => addPiece2(start, g, r, b.x0 - 1, y, b.z0 + pos, W3, d), (c) => new Box(b.x0, c.y0, c.z0, b.x0 + 1, c.y1, c.z1));
    side(zs, (pos, y) => addPiece2(start, g, r, b.x1 + 1, y, b.z0 + pos, E3, d), (c) => new Box(b.x1 - 1, c.y0, c.z0, b.x1, c.y1, c.z1));
    return;
  }
  if (p.kind === "corridor") {
    const end = r.nextInt(4);
    const o = p.dir;
    const yy = () => b.y0 - 1 + r.nextInt(3);
    if (o === N7) {
      if (end <= 1)
        addPiece2(start, g, r, b.x0, yy(), b.z0 - 1, o, d);
      else if (end === 2)
        addPiece2(start, g, r, b.x0 - 1, yy(), b.z0, W3, d);
      else
        addPiece2(start, g, r, b.x1 + 1, yy(), b.z0, E3, d);
    } else if (o === S3) {
      if (end <= 1)
        addPiece2(start, g, r, b.x0, yy(), b.z1 + 1, o, d);
      else if (end === 2)
        addPiece2(start, g, r, b.x0 - 1, yy(), b.z1 - 3, W3, d);
      else
        addPiece2(start, g, r, b.x1 + 1, yy(), b.z1 - 3, E3, d);
    } else if (o === W3) {
      if (end <= 1)
        addPiece2(start, g, r, b.x0 - 1, yy(), b.z0, o, d);
      else if (end === 2)
        addPiece2(start, g, r, b.x0, yy(), b.z0 - 1, N7, d);
      else
        addPiece2(start, g, r, b.x0, yy(), b.z1 + 1, S3, d);
    } else {
      if (end <= 1)
        addPiece2(start, g, r, b.x1 + 1, yy(), b.z0, o, d);
      else if (end === 2)
        addPiece2(start, g, r, b.x1 - 3, yy(), b.z0 - 1, N7, d);
      else
        addPiece2(start, g, r, b.x1 - 3, yy(), b.z1 + 1, S3, d);
    }
    if (d < 8) {
      if (o !== N7 && o !== S3) {
        for (let x = b.x0 + 3;x + 3 <= b.x1; x += 5) {
          const sel = r.nextInt(5);
          if (sel === 0)
            addPiece2(start, g, r, x, b.y0, b.z0 - 1, N7, d + 1);
          else if (sel === 1)
            addPiece2(start, g, r, x, b.y0, b.z1 + 1, S3, d + 1);
        }
      } else {
        for (let z = b.z0 + 3;z + 3 <= b.z1; z += 5) {
          const sel = r.nextInt(5);
          if (sel === 0)
            addPiece2(start, g, r, b.x0 - 1, b.y0, z, W3, d + 1);
          else if (sel === 1)
            addPiece2(start, g, r, b.x1 + 1, b.y0, z, E3, d + 1);
        }
      }
    }
    return;
  }
  if (p.kind === "crossing") {
    const c = p.cdir;
    if (c === S3) {
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S3, d);
      addPiece2(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W3, d);
      addPiece2(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E3, d);
    } else if (c === W3) {
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N7, d);
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S3, d);
      addPiece2(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W3, d);
    } else if (c === E3) {
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N7, d);
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S3, d);
      addPiece2(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E3, d);
    } else {
      addPiece2(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N7, d);
      addPiece2(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W3, d);
      addPiece2(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E3, d);
    }
    if (p.twoFloored) {
      if (r.nextBoolean())
        addPiece2(start, g, r, b.x0 + 1, b.y0 + 4, b.z0 - 1, N7, d);
      if (r.nextBoolean())
        addPiece2(start, g, r, b.x0 - 1, b.y0 + 4, b.z0 + 1, W3, d);
      if (r.nextBoolean())
        addPiece2(start, g, r, b.x1 + 1, b.y0 + 4, b.z0 + 1, E3, d);
      if (r.nextBoolean())
        addPiece2(start, g, r, b.x0 + 1, b.y0 + 4, b.z1 + 1, S3, d);
    }
    return;
  }
  const o = p.dir;
  if (o === S3)
    addPiece2(start, g, r, b.x0, b.y0, b.z1 + 1, S3, d);
  else if (o === W3)
    addPiece2(start, g, r, b.x0 - 1, b.y0, b.z0, W3, d);
  else if (o === E3)
    addPiece2(start, g, r, b.x1 + 1, b.y0, b.z0, E3, d);
  else
    addPiece2(start, g, r, b.x0, b.y0, b.z0 - 1, N7, d);
}
var mineCache = new Map;
function mineshaftAt(site, cx, cz) {
  const key = `${site.seed}:${cx},${cz}`;
  const cached = mineCache.get(key);
  if (cached !== undefined)
    return cached;
  if (mineCache.size > 8000)
    mineCache.clear();
  let m = null;
  if (hashToFloat(hash2(cx, cz, site.seed ^ 238053)) < 0.004)
    m = buildMineshaft(site, cx, cz);
  mineCache.set(key, m);
  return m;
}
function buildMineshaft(site, cx, cz) {
  const r = new MineRandom(hash2(cx, cz, site.seed ^ 369022));
  r.nextDouble();
  const mesa = site.isBadlands(cx * 16 + 8, cz * 16);
  const west = cx * 16 + 2, north = cz * 16 + 2;
  const room = {
    kind: "room",
    dir: -1,
    depth: 0,
    seed: 0,
    entrances: [],
    box: new Box(west, 50, north, west + 7 + r.nextInt(6), 54 + r.nextInt(6), north + 7 + r.nextInt(6))
  };
  room.seed = r.nextDouble() * 2147483647 | 0;
  const g = new Builder;
  g.pieces.push(room);
  addChildren2(room, room, g, r);
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  for (const p of g.pieces) {
    bx0 = Math.min(bx0, p.box.x0);
    by0 = Math.min(by0, p.box.y0);
    bz0 = Math.min(bz0, p.box.z0);
    bx1 = Math.max(bx1, p.box.x1);
    by1 = Math.max(by1, p.box.y1);
    bz1 = Math.max(bz1, p.box.z1);
  }
  let dy;
  if (mesa) {
    const cxm = Math.floor((bx0 + bx1) / 2), czm = Math.floor((bz0 + bz1) / 2), cym = Math.floor((by0 + by1) / 2);
    const surface = site.surface(cxm, czm);
    const target = surface <= SEA_LEVEL ? SEA_LEVEL : SEA_LEVEL + r.nextInt(surface - SEA_LEVEL + 1);
    dy = target - cym;
  } else {
    const maxY = SEA_LEVEL - 10;
    let y = by1 - by0 + 1 + MIN_Y + 1;
    if (y < maxY)
      y += r.nextInt(maxY - y);
    dy = y - by1;
  }
  const pieces = g.pieces.map((p) => ({ ...p, box: move(p.box, 0, dy, 0), entrances: p.entrances?.map((e) => move(e, 0, dy, 0)) }));
  const start = pieces[0].box;
  if (site.isDeepDark(start.x0, start.y0, start.z0))
    return null;
  return { x: start.x0, y: start.y0, z: start.z0, mesa, pieces, bounds: new Box(bx0, by0 + dy, bz0, bx1, by1 + dy, bz1) };
}
function mineshaftsNear(site, cx, cz) {
  const out = [];
  const x0 = cx * 16, z0 = cz * 16;
  for (let dz = -6;dz <= 6; dz++) {
    for (let dx = -6;dx <= 6; dx++) {
      const m = mineshaftAt(site, cx + dx, cz + dz);
      if (m && m.bounds.x1 >= x0 && m.bounds.x0 <= x0 + 15 && m.bounds.z1 >= z0 && m.bounds.z0 <= z0 + 15)
        out.push(m);
    }
  }
  return out;
}

class MineDrawer {
  c;
  p;
  m;
  site;
  carts;
  planks;
  wood;
  fence;
  constructor(c, p, m, site, carts) {
    this.c = c;
    this.p = p;
    this.m = m;
    this.site = site;
    this.carts = carts;
    this.planks = m.mesa ? DARK_OAK_PLANKS : OAK_PLANKS;
    this.wood = m.mesa ? DARK_OAK_LOG : OAK_LOG;
    this.fence = m.mesa ? FENCES.dark_oak : FENCES.oak;
  }
  wx(x, z) {
    const b = this.p.box, d = this.p.dir;
    return d < 0 ? x : d === W3 ? b.x1 - z : d === E3 ? b.x0 + z : b.x0 + x;
  }
  wy(y) {
    return this.p.dir < 0 ? y : this.p.box.y0 + y;
  }
  wz(x, z) {
    const b = this.p.box, d = this.p.dir;
    return d < 0 ? z : d === N7 ? b.z1 - z : d === S3 ? b.z0 + z : b.z0 + x;
  }
  chance(x, y, z, salt) {
    return hashToFloat(hash3(this.wx(x, z) * 31 + salt, this.wy(y), this.wz(x, z), this.p.seed));
  }
  get(x, y, z) {
    const b = this.c.get(this.wx(x, z), this.wy(y), this.wz(x, z));
    return b < 0 ? AIR : b;
  }
  isOwn(id) {
    return id === this.planks || id === this.wood || id === this.fence || id === IRON_CHAIN;
  }
  place(id, x, y, z) {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z))
      return;
    if (this.isOwn(this.c.get(X, Y, Z)))
      return;
    this.c.set(X, Y, Z, id);
  }
  box(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0;y <= y1; y++)
      for (let x = x0;x <= x1; x++)
        for (let z = z0;z <= z1; z++)
          this.place(id, x, y, z);
  }
  interior(x, y, z) {
    const X = this.wx(x, z), Y = this.wy(y + 1), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z))
      return false;
    return Y <= this.site.floorTop(X, Z);
  }
  sturdy(id) {
    return id > 0 && BLOCK_COLLIDE[id] === 1 && BLOCK_SOLID[id] === 1;
  }
  replaceable(id) {
    return id === AIR || id > 0 && BLOCK_FLUID[id] > 0 || isGlowLichen(id) || id >= SEAGRASS && id < SEAGRASS + 4;
  }
  planksAt(x, y, z) {
    if (!this.interior(x, y, z))
      return;
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z))
      return;
    if (!this.sturdy(this.c.get(X, Y, Z)))
      this.c.set(X, Y, Z, this.planks);
  }
  invalid() {
    const b = this.p.box, c = this.c;
    const X0 = c.x0, X1 = c.x0 + 15, Z0 = c.z0, Z1 = c.z0 + 15;
    const x0 = Math.max(b.x0 - 1, X0), x1 = Math.min(b.x1 + 1, X1);
    const z0 = Math.max(b.z0 - 1, Z0), z1 = Math.min(b.z1 + 1, Z1);
    const y0 = b.y0 - 1, y1 = b.y1 + 1;
    if (x0 > x1 || z0 > z1)
      return true;
    if (this.site.isDeepDark(x0 + x1 >> 1, y0 + y1 >> 1, z0 + z1 >> 1))
      return true;
    const liquid = (x, y, z) => {
      const id = c.get(x, y, z);
      return id > 0 && BLOCK_FLUID[id] > 0;
    };
    for (let x = x0;x <= x1; x++)
      for (let z = z0;z <= z1; z++)
        if (liquid(x, y0, z) || liquid(x, y1, z))
          return true;
    for (let x = x0;x <= x1; x++)
      for (let y = y0;y <= y1; y++)
        if (liquid(x, y, z0) || liquid(x, y, z1))
          return true;
    for (let z = z0;z <= z1; z++)
      for (let y = y0;y <= y1; y++)
        if (liquid(x0, y, z) || liquid(x1, y, z))
          return true;
    const out = (x, y, z) => this.site.fluidOutside(x, y, z);
    for (let y = y0;y <= y1; y++) {
      if (b.x0 - 1 < X0) {
        for (let z = z0;z <= z1; z++)
          if (out(X0 - 1, y, z))
            return true;
      }
      if (b.x1 + 1 > X1) {
        for (let z = z0;z <= z1; z++)
          if (out(X1 + 1, y, z))
            return true;
      }
      if (b.z0 - 1 < Z0) {
        for (let x = x0;x <= x1; x++)
          if (out(x, y, Z0 - 1))
            return true;
      }
      if (b.z1 + 1 > Z1) {
        for (let x = x0;x <= x1; x++)
          if (out(x, y, Z1 + 1))
            return true;
      }
    }
    return false;
  }
  room() {
    const b = this.p.box;
    this.box(b.x0, b.y0 + 1, b.z0, b.x1, Math.min(b.y0 + 3, b.y1), b.z1, AIR);
    for (const e of this.p.entrances ?? [])
      this.box(e.x0, e.y1 - 2, e.z0, e.x1, e.y1, e.z1, AIR);
    const x0 = b.x0, y0 = b.y0 + 4, { z0, x1, y1, z1 } = b;
    const dx = x1 - x0 + 1, dyy = y1 - y0 + 1, dz = z1 - z0 + 1;
    const cx = x0 + dx / 2, cz = z0 + dz / 2;
    for (let y = y0;y <= y1; y++) {
      const ny = (y - y0) / dyy;
      for (let x = x0;x <= x1; x++) {
        const nx = (x - cx) / (dx * 0.5);
        for (let z = z0;z <= z1; z++) {
          const nz = (z - cz) / (dz * 0.5);
          if (nx * nx + ny * ny + nz * nz <= 1.05)
            this.place(AIR, x, y, z);
        }
      }
    }
  }
  corridor() {
    const p = this.p;
    const n = p.sections;
    const len = n * 5 - 1;
    this.box(0, 0, 0, 2, 1, len, AIR);
    for (let x = 0;x <= 2; x++)
      for (let z = 0;z <= len; z++)
        if (this.chance(x, 2, z, 1) <= 0.8)
          this.place(AIR, x, 2, z);
    if (p.spider) {
      for (let y = 0;y <= 1; y++)
        for (let x = 0;x <= 2; x++)
          for (let z = 0;z <= len; z++) {
            if (this.chance(x, y, z, 2) <= 0.6 && this.interior(x, y, z)) {
              const edge = y === 0 || y === 1 || x === 0 || x === 2 || z === 0 || z === len;
              this.place(edge ? COBWEB : AIR, x, y, z);
            }
          }
    }
    const spiderSection = p.spider ? p.seed % n : -1;
    for (let s = 0;s < n; s++) {
      const z = 2 + s * 5;
      this.support(z, s);
      this.maybeCobweb(0.1, 0, 2, z - 1, 3);
      this.maybeCobweb(0.1, 2, 2, z - 1, 4);
      this.maybeCobweb(0.1, 0, 2, z + 1, 5);
      this.maybeCobweb(0.1, 2, 2, z + 1, 6);
      this.maybeCobweb(0.05, 0, 2, z - 2, 7);
      this.maybeCobweb(0.05, 2, 2, z - 2, 8);
      this.maybeCobweb(0.05, 0, 2, z + 2, 9);
      this.maybeCobweb(0.05, 2, 2, z + 2, 10);
      if (this.chance(0, 0, z, 11) < 0.01)
        this.cart(2, 0, z - 1);
      if (this.chance(0, 0, z, 12) < 0.01)
        this.cart(0, 0, z + 1);
      if (s === spiderSection) {
        const nz = z - 1 + (p.seed >>> 5) % 3;
        if (this.interior(1, 0, nz))
          this.place(MOB_SPAWNER, 1, 0, nz);
      }
    }
    for (let x = 0;x <= 2; x++)
      for (let z = 0;z <= len; z++)
        this.planksAt(x, -1, z);
    this.doubleSupport(0, -1, 2);
    if (n > 1)
      this.doubleSupport(0, -1, len - 2);
    if (p.rails) {
      const rail = stateOf(RAIL, { shape: p.dir === E3 || p.dir === W3 ? RAIL_EW : RAIL_NS });
      for (let z = 0;z <= len; z++) {
        const floor = this.get(1, -1, z);
        if (floor !== AIR && this.sturdy(floor)) {
          const prob = this.interior(1, 0, z) ? 0.7 : 0.9;
          if (this.chance(1, 0, z, 13) < prob)
            this.place(rail, 1, 0, z);
        }
      }
    }
  }
  cart(x, y, z) {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z) || this.c.get(X, Y, Z) !== AIR || this.c.get(X, Y - 1, Z) === AIR)
      return;
    const shape = this.chance(x, y, z, 14) < 0.5 ? RAIL_NS : RAIL_EW;
    this.place(stateOf(RAIL, { shape }), x, y, z);
    this.carts.push({ x: X + 0.5, y: Y + 0.5, z: Z + 0.5 });
  }
  maybeCobweb(prob, x, y, z, salt) {
    if (!this.interior(x, y, z) || this.chance(x, y, z, salt) >= prob)
      return;
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    let n = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (this.sturdy(this.c.get(X + dx, Y + dy, Z + dz)) && ++n >= 2)
        break;
    }
    if (n >= 2)
      this.place(COBWEB, x, y, z);
  }
  support(z, s) {
    for (let x = 0;x <= 2; x++)
      if (this.get(x, 3, z) === AIR)
        return;
    this.box(0, 0, z, 0, 1, z, this.fence);
    this.box(2, 0, z, 2, 1, z, this.fence);
    if (this.chance(0, 2, z, 20 + s) < 0.25) {
      this.place(this.planks, 0, 2, z);
      this.place(this.planks, 2, 2, z);
    } else {
      this.box(0, 2, z, 2, 2, z, this.planks);
      if (this.chance(1, 2, z - 1, 30) < 0.05)
        this.place(stateOf(WALL_TORCH, { facing: turn(this.p.dir, S3) }), 1, 2, z - 1);
      if (this.chance(1, 2, z + 1, 31) < 0.05)
        this.place(stateOf(WALL_TORCH, { facing: turn(this.p.dir, N7) }), 1, 2, z + 1);
    }
  }
  doubleSupport(x, y, z) {
    if (this.get(x, y, z) === this.planks)
      this.pillar(x, y, z);
    if (this.get(x + 2, y, z) === this.planks)
      this.pillar(x + 2, y, z);
  }
  pillar(x, y, z) {
    const X = this.wx(x, z), Y0 = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y0, Z))
      return;
    let below = true, above = true;
    for (let d = 1;below || above; d++) {
      if (below) {
        const id = this.c.get(X, Y0 - d, Z);
        const empty = id < 0 ? false : this.replaceable(id) && !(id > 0 && BLOCK_FLUID[id] === 2);
        if (!empty && this.sturdy(id)) {
          for (let yy = Y0 - d + 1;yy < Y0; yy++)
            this.c.set(X, yy, Z, this.wood);
          return;
        }
        below = d <= 20 && empty && Y0 - d > MIN_Y + 1;
      }
      if (above) {
        const id = this.c.get(X, Y0 + d, Z);
        const empty = id >= 0 && this.replaceable(id);
        if (!empty && this.sturdy(id)) {
          this.c.set(X, Y0 + 1, Z, this.fence);
          for (let yy = Y0 + 2;yy < Y0 + d; yy++)
            this.c.set(X, yy, Z, IRON_CHAIN);
          return;
        }
        above = d <= 50 && empty;
      }
    }
  }
  crossing() {
    const b = this.p.box;
    if (this.p.twoFloored) {
      this.box(b.x0 + 1, b.y0, b.z0, b.x1 - 1, b.y0 + 2, b.z1, AIR);
      this.box(b.x0, b.y0, b.z0 + 1, b.x1, b.y0 + 2, b.z1 - 1, AIR);
      this.box(b.x0 + 1, b.y1 - 2, b.z0, b.x1 - 1, b.y1, b.z1, AIR);
      this.box(b.x0, b.y1 - 2, b.z0 + 1, b.x1, b.y1, b.z1 - 1, AIR);
      this.box(b.x0 + 1, b.y0 + 3, b.z0 + 1, b.x1 - 1, b.y0 + 3, b.z1 - 1, AIR);
    } else {
      this.box(b.x0 + 1, b.y0, b.z0, b.x1 - 1, b.y1, b.z1, AIR);
      this.box(b.x0, b.y0, b.z0 + 1, b.x1, b.y1, b.z1 - 1, AIR);
    }
    for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z0 + 1], [b.x1 - 1, b.z1 - 1]]) {
      if (this.get(x, b.y1 + 1, z) !== AIR)
        this.box(x, b.y0, z, x, b.y1, z, this.planks);
    }
    for (let x = b.x0;x <= b.x1; x++)
      for (let z = b.z0;z <= b.z1; z++)
        this.planksAt(x, b.y0 - 1, z);
  }
  stairs() {
    this.box(0, 5, 0, 2, 7, 1, AIR);
    this.box(0, 0, 7, 2, 2, 8, AIR);
    for (let i = 0;i < 5; i++)
      this.box(0, 5 - i - (i < 4 ? 1 : 0), 2 + i, 2, 7 - i, 2 + i, AIR);
  }
}
function drawMineshaft(c, m, site, carts) {
  for (const p of m.pieces) {
    const b = p.box;
    if (b.x1 < c.x0 - 1 || b.x0 > c.x0 + 16 || b.z1 < c.z0 - 1 || b.z0 > c.z0 + 16)
      continue;
    const d = new MineDrawer(c, p, m, site, carts);
    if (d.invalid())
      continue;
    if (p.kind === "room")
      d.room();
    else if (p.kind === "corridor")
      d.corridor();
    else if (p.kind === "crossing")
      d.crossing();
    else
      d.stairs();
  }
}

// goodPG/src/shared/vehicles.ts
var ENT_MINECART = 162;
var ENT_CHEST_MINECART = 163;
var ENT_FURNACE_MINECART = 164;
var BOAT_WOODS = ["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak", "bamboo"];
var RAFT_VARIANT = BOAT_WOODS.indexOf("bamboo");
var CART_TYPES = new Set([ENT_MINECART, ENT_CHEST_MINECART, ENT_FURNACE_MINECART]);
var VF_PADDLE_L = 1 << 24;
var VF_PADDLE_R = 1 << 25;
var VF_LIT = 1 << 26;
var VF_HURT_FLIP = 1 << 27;
var VF_PRIMED = 1 << 28;

// goodPG/src/shared/world/structures.ts
class Canvas {
  blocks;
  x0;
  z0;
  chests;
  villagers;
  mobs;
  constructor(blocks, x0, z0, chests, villagers = [], mobs = []) {
    this.blocks = blocks;
    this.x0 = x0;
    this.z0 = z0;
    this.chests = chests;
    this.villagers = villagers;
    this.mobs = mobs;
  }
  mob(type, x, y, z, variant) {
    if (this.inside(Math.floor(x), Math.floor(y), Math.floor(z)))
      this.mobs.push(variant === undefined ? { type, x, y, z } : { type, x, y, z, variant });
  }
  inside(x, y, z) {
    return x >= this.x0 && x < this.x0 + CHUNK_SIZE && z >= this.z0 && z < this.z0 + CHUNK_SIZE && y > MIN_Y + 4 && y < MAX_Y;
  }
  get(x, y, z) {
    return this.inside(x, y, z) ? this.blocks[blockIndex(x - this.x0, y, z - this.z0)] : -1;
  }
  set(x, y, z, id) {
    if (this.inside(x, y, z))
      this.blocks[blockIndex(x - this.x0, y, z - this.z0)] = id;
  }
  clear(x, y, z, wet = false) {
    this.set(x, y, z, wet && y < SEA_LEVEL ? WATER : AIR);
  }
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0;y <= y1; y++) {
      for (let z = z0;z <= z1; z++) {
        for (let x = x0;x <= x1; x++)
          this.set(x, y, z, typeof id === "number" ? id : id(x, y, z));
      }
    }
  }
  villager(v) {
    this.villagers.push(v);
  }
  chest(x, y, z, facing, table) {
    if (!this.inside(x, y, z))
      return;
    this.set(x, y, z, CHEST + facing);
    this.chests.push({ x, y, z, table });
  }
  foundation(x, y, z, id) {
    for (let yy = y;yy > y - 14; yy--) {
      const b = this.get(x, yy, z);
      if (b < 0)
        return;
      if (b !== AIR && BLOCK_OPAQUE[b] && !isLeaves(b) && !isLog(b))
        return;
      this.set(x, yy, z, id);
    }
  }
  clearAbove(x, y, z, h) {
    for (let yy = y;yy < y + h; yy++) {
      const b = this.get(x, yy, z);
      if (b > 0 && !BLOCK_FLUID[b])
        this.set(x, yy, z, AIR);
    }
  }
}
var tmp5 = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
function flatness(gen, x, z, r) {
  let lo = 1e9, hi = -1e9;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const h = gen.surfaceAt(x + dx, z + dz, gen.columnInfo(x + dx, z + dz, tmp5));
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return [gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp5)), hi - lo];
}
var GRID = [
  {
    key: "desert_pyramid",
    spacing: 32,
    separation: 8,
    salt: 14357617,
    radius: 11,
    site: (gen, x, z, inf) => {
      if (inf.biome !== BIOME_DESERT)
        return null;
      const [h, slope] = flatness(gen, x, z, 9);
      return slope <= 6 && h >= SEA_LEVEL ? h : null;
    },
    build: buildDesertPyramid
  },
  {
    key: "jungle_temple",
    spacing: 32,
    separation: 8,
    salt: 14357619,
    radius: 9,
    site: (gen, x, z, inf) => {
      if (baseBiome(inf.biome) !== BIOME_JUNGLE)
        return null;
      const [h, slope] = flatness(gen, x, z, 6);
      return slope <= 6 && h >= SEA_LEVEL ? h : null;
    },
    build: buildJungleTemple
  },
  {
    key: "shipwreck",
    spacing: 24,
    separation: 4,
    salt: 165745295,
    radius: 11,
    site: (gen, x, z, inf) => {
      if (!(isOceanBiome(inf.biome) && inf.biome !== BIOME_FROZEN_OCEAN) && baseBiome(inf.biome) !== BIOME_BEACH)
        return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp5));
      return h < SEA_LEVEL - 4 ? h : null;
    },
    build: buildShipwreck
  },
  {
    key: "ruined_portal",
    spacing: 40,
    separation: 15,
    salt: 34222645,
    radius: 7,
    site: (gen, x, z, inf) => {
      if (isOceanBiome(inf.biome))
        return null;
      const [h, slope] = flatness(gen, x, z, 4);
      return slope <= 5 && h >= SEA_LEVEL ? h : null;
    },
    build: buildRuinedPortal
  },
  {
    key: "igloo",
    spacing: 32,
    separation: 8,
    salt: 14357618,
    radius: 5,
    site: (gen, x, z, inf) => {
      if (baseBiome(inf.biome) !== BIOME_SNOWY && inf.biome !== BIOME_ICE_SPIKES)
        return null;
      const [h, slope] = flatness(gen, x, z, 4);
      return slope <= 3 && h >= SEA_LEVEL ? h : null;
    },
    build: buildIgloo
  },
  {
    key: "desert_well",
    spacing: 20,
    separation: 6,
    salt: 40013,
    radius: 3,
    site: (gen, x, z, inf) => {
      if (inf.biome !== BIOME_DESERT)
        return null;
      const [h, slope] = flatness(gen, x, z, 2);
      return slope <= 2 && h >= SEA_LEVEL ? h : null;
    },
    build: buildDesertWell
  },
  {
    key: "village",
    spacing: 34,
    separation: 8,
    salt: 10387312,
    radius: VILLAGE_RADIUS,
    site: (gen, x, z, inf) => {
      if (!isVillageBiome(inf.biome))
        return null;
      const [h, slope] = flatness(gen, x, z, 14);
      return slope <= 6 && h >= SEA_LEVEL + 1 ? h : null;
    },
    build: buildVillage
  },
  {
    key: "pillager_outpost",
    spacing: 32,
    separation: 8,
    salt: 165745296,
    radius: OUTPOST_RADIUS,
    site: (gen, x, z, inf) => {
      if (!outpostCandidate(inf.biome, x, z, gen.seed))
        return null;
      const [h, slope] = flatness(gen, x, z, 7);
      if (slope > 4 || h < SEA_LEVEL + 1)
        return null;
      const v = locateStructure(gen, "village", x, z, 1);
      return v && Math.hypot(v[0] - x, v[2] - z) < OUTPOST_VILLAGE_GAP ? null : h;
    },
    build: buildOutpost
  },
  { key: "ancient_city", spacing: 24, separation: 8, salt: 20083232, radius: ANCIENT_CITY_RADIUS, site: (gen, x, z) => ancientCitySite(gen, x, z), build: buildAncientCity },
  ...OCEAN_STRUCTURES,
  {
    key: "swamp_hut",
    spacing: 32,
    separation: 8,
    salt: SWAMP_HUT_SALT,
    radius: SWAMP_HUT_RADIUS,
    site: (gen, x, z, inf) => swampHutSite(inf.biome, gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp5))),
    build: buildSwampHut
  },
  {
    key: "fossil",
    spacing: 6,
    separation: 2,
    salt: 14357921,
    radius: FOSSIL_RADIUS,
    site: (gen, x, z, inf) => fossilSite(gen, x, z, inf.biome, gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp5))),
    build: (c, s, gen) => buildFossil(c, s, gen.seed)
  },
  {
    key: "mansion",
    spacing: 80,
    separation: 20,
    salt: 10387319,
    radius: MANSION_RADIUS,
    site: (gen, x, z, inf) => mansionSite(gen, x, z, inf),
    build: buildMansion
  }
];
var STRUCTURE_NAMES = {
  desert_pyramid: "沙漠神殿",
  jungle_temple: "丛林神庙",
  shipwreck: "沉船",
  ruined_portal: "废弃传送门",
  igloo: "雪屋",
  desert_well: "沙漠水井",
  mineshaft: "废弃矿井",
  village: "村庄",
  pillager_outpost: "掠夺者前哨站",
  ancient_city: "远古城市",
  ...OCEAN_STRUCTURE_NAMES,
  swamp_hut: "沼泽小屋",
  fossil: "埋藏的化石",
  mansion: "林地府邸",
  stronghold: "要塞"
};
var startCache2 = new Map;
function gridStart(gen, t, rx, rz) {
  const key = `${gen.seed}:${t.key}:${rx},${rz}`;
  const cached = startCache2.get(key);
  if (cached !== undefined)
    return cached;
  if (startCache2.size > 4000)
    startCache2.clear();
  const h = hash2(rx, rz, gen.seed ^ t.salt);
  const range = t.spacing - t.separation;
  const cx = rx * t.spacing + h % range, cz = rz * t.spacing + (h >>> 12) % range;
  const x = cx * 16 + 8, z = cz * 16 + 8;
  const inf = gen.columnInfo(x, z, { ...tmp5 });
  const y = t.site(gen, x, z, inf);
  const s = y === null ? null : {
    key: t.key,
    x,
    y,
    z,
    rng: hash2(cx, cz, gen.seed ^ t.salt * 7),
    box: [x - t.radius, z - t.radius, x + t.radius, z + t.radius]
  };
  startCache2.set(key, s);
  return s;
}
function placeStructures(gen, blocks, cx, cz, tops, villagers = [], mobs = [], ticks = []) {
  const chests = [];
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const c = new Canvas(blocks, x0, z0, chests, villagers, mobs);
  placeDungeon(gen, c, cx, cz, tops);
  const carts = [];
  const draw = mineDrawSite(gen, c);
  for (const m of mineshaftsNear(mineSite(gen), cx, cz))
    drawMineshaft(c, m, draw, carts);
  for (const k of carts)
    mobs.push({ type: ENT_CHEST_MINECART, x: k.x, y: k.y, z: k.z });
  for (const t of GRID) {
    const r0 = Math.floor((x0 - t.radius) / 16 / t.spacing), r1 = Math.floor((x0 + 15 + t.radius) / 16 / t.spacing);
    const q0 = Math.floor((z0 - t.radius) / 16 / t.spacing), q1 = Math.floor((z0 + 15 + t.radius) / 16 / t.spacing);
    for (let rz = q0;rz <= q1; rz++) {
      for (let rx = r0;rx <= r1; rx++) {
        const s = gridStart(gen, t, rx, rz);
        if (!s || s.box[2] < x0 || s.box[0] > x0 + 15 || s.box[3] < z0 || s.box[1] > z0 + 15)
          continue;
        t.build(c, s, gen);
      }
    }
  }
  placeStrongholds(gen, c, ticks);
  return chests;
}
function locateStructure(gen, key, x, z, maxRegions = 12, accept) {
  if (key === "stronghold")
    return locateStronghold(gen, x, z);
  if (key === "mineshaft") {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    let best = null, bd = Infinity;
    const site = mineSite(gen);
    for (let r = 0;r <= 60 && !best; r++) {
      for (let dz = -r;dz <= r; dz++) {
        for (let dx = -r;dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r)
            continue;
          const m = mineshaftAt(site, cx + dx, cz + dz);
          if (!m)
            continue;
          const d = Math.hypot(m.x - x, m.z - z);
          if (d < bd) {
            bd = d;
            best = [m.x, m.y, m.z];
          }
        }
      }
    }
    return best;
  }
  const t = GRID.find((g) => g.key === key);
  if (!t)
    return null;
  const rx0 = Math.floor(x / 16 / t.spacing), rz0 = Math.floor(z / 16 / t.spacing);
  let best = null, bd = Infinity;
  for (let r = 0;r <= maxRegions; r++) {
    for (let dz = -r;dz <= r; dz++) {
      for (let dx = -r;dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r)
          continue;
        const s = gridStart(gen, t, rx0 + dx, rz0 + dz);
        if (!s || accept && !accept(s.x, s.z))
          continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) {
          bd = d;
          best = [s.x, s.y, s.z];
        }
      }
    }
    if (best && (r + 1) * t.spacing * 16 > bd + t.spacing * 16)
      break;
  }
  return best;
}
function placeDungeon(gen, c, cx, cz, tops) {
  const h = hash2(cx, cz, gen.seed ^ 853728);
  if (h % 4 !== 0)
    return;
  const rnd = mulberry32(h);
  for (let attempt = 0;attempt < 16; attempt++) {
    const lx = 4 + Math.floor(rnd() * 8), lz = 4 + Math.floor(rnd() * 8);
    const top = Math.min(tops[lz * 16 + lx] - 10, 60);
    const floors = [];
    for (let y = MIN_Y + 8;y < top; y++) {
      if (c.get(c.x0 + lx, y, c.z0 + lz) === AIR && BLOCK_OPAQUE[Math.max(0, c.get(c.x0 + lx, y - 1, c.z0 + lz))])
        floors.push(y);
    }
    if (floors.length === 0)
      continue;
    const y = floors[Math.floor(rnd() * floors.length)];
    const rx = 2 + Math.floor(rnd() * 2), rz = 2 + Math.floor(rnd() * 2);
    const d = Math.floor(rnd() * 4);
    const ax = c.x0 + lx + [0, rx + 1, 0, -rx - 1][d], az = c.z0 + lz + [-rz - 1, 0, rz + 1, 0][d];
    let ok = ax - rx - 1 >= c.x0 && ax + rx + 1 < c.x0 + 16 && az - rz - 1 >= c.z0 && az + rz + 1 < c.z0 + 16;
    let openings = 0, solid = 0, cells = 0;
    for (let dz = -rz - 1;dz <= rz + 1 && ok; dz++) {
      for (let dx = -rx - 1;dx <= rx + 1 && ok; dx++) {
        const f = c.get(ax + dx, y - 1, az + dz), t = c.get(ax + dx, y + 3, az + dz);
        if (f < 0 || t < 0)
          ok = false;
        cells += 2;
        if (BLOCK_OPAQUE[Math.max(0, f)])
          solid++;
        if (BLOCK_OPAQUE[Math.max(0, t)])
          solid++;
        for (let dy = -1;dy < 4; dy++) {
          const b = c.get(ax + dx, y + dy, az + dz);
          if (b > 0 && BLOCK_FLUID[b])
            ok = false;
        }
        const wall = Math.abs(dx) === rx + 1 || Math.abs(dz) === rz + 1;
        if (wall && c.get(ax + dx, y, az + dz) === AIR && c.get(ax + dx, y + 1, az + dz) === AIR)
          openings++;
      }
    }
    if (!ok || solid < cells * 0.8 || openings < 1 || openings > 8)
      continue;
    for (let dz = -rz - 1;dz <= rz + 1; dz++) {
      for (let dx = -rx - 1;dx <= rx + 1; dx++) {
        const wall = Math.abs(dx) === rx + 1 || Math.abs(dz) === rz + 1;
        const k = hash3(ax + dx, y, az + dz, gen.seed ^ 12373);
        c.set(ax + dx, y - 1, az + dz, k % 4 === 0 ? COBBLESTONE : MOSSY_COBBLESTONE);
        c.set(ax + dx, y + 3, az + dz, COBBLESTONE);
        for (let dy = 0;dy < 3; dy++) {
          if (!wall)
            c.set(ax + dx, y + dy, az + dz, AIR);
          else if (c.get(ax + dx, y + dy, az + dz) !== AIR)
            c.set(ax + dx, y + dy, az + dz, (k >>> dy) % 3 === 0 ? MOSSY_COBBLESTONE : COBBLESTONE);
        }
      }
    }
    c.set(ax, y, az, MOB_SPAWNER);
    const n = 1 + (h >>> 8) % 2;
    for (let i = 0;i < n; i++) {
      const side = (h >>> 10 + i * 3) % 4;
      const along = Math.floor(rnd() * 3) - 1;
      const [px, pz, f] = side === 0 ? [ax + along, az - rz, 2] : side === 1 ? [ax + rx, az + along, 3] : side === 2 ? [ax + along, az + rz, 0] : [ax - rx, az + along, 1];
      if (px === ax && pz === az)
        continue;
      c.chest(px, y, pz, f, "dungeon");
    }
    return;
  }
}
var mineSites = new WeakMap;
function mineSite(gen) {
  let s = mineSites.get(gen);
  if (!s) {
    const inf = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    s = {
      seed: gen.seed,
      isBadlands: (x, z) => baseBiome(gen.biomeAt(x, z)) === BIOME_BADLANDS,
      isDeepDark: (x, y, z) => isDeepDark(gen, x, y, z),
      surface: (x, z) => gen.surfaceAt(x, z, gen.columnInfo(x, z, inf))
    };
    mineSites.set(gen, s);
  }
  return s;
}
function mineDrawSite(gen, c) {
  const floor = new Int16Array(256).fill(-32768);
  return {
    floorTop: (x, z) => {
      const i = (z - c.z0) * 16 + (x - c.x0);
      if (i < 0 || i >= 256)
        return MIN_Y;
      if (floor[i] === -32768) {
        let y = MAX_Y - 1;
        for (;y > MIN_Y; y--) {
          const b = c.blocks[blockIndex(x - c.x0, y, z - c.z0)];
          if (b !== AIR && !BLOCK_FLUID[b])
            break;
        }
        floor[i] = y;
      }
      return floor[i];
    },
    fluidOutside: (x, y, z) => gen.generatedWaterAt(x, y, z),
    isDeepDark: (x, y, z) => isDeepDark(gen, x, y, z)
  };
}
function buildDesertPyramid(c, s) {
  const { x: ox, y: oy, z: oz } = s;
  const R = 10;
  for (let dz = -R;dz <= R; dz++) {
    for (let dx = -R;dx <= R; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, SANDSTONE);
      c.clearAbove(ox + dx, oy, oz + dz, 16);
    }
  }
  for (let k = 0;k <= 10; k++) {
    const r = R - k;
    for (let dz = -r;dz <= r; dz++) {
      for (let dx = -r;dx <= r; dx++) {
        const edge = Math.max(Math.abs(dx), Math.abs(dz)) === r;
        let id = SANDSTONE;
        if (k === 0) {
          const d = Math.abs(dx) + Math.abs(dz);
          id = d <= 2 ? d === 0 ? AIR : COLORED_TERRACOTTA.orange : d === 3 ? COLORED_TERRACOTTA.white : SANDSTONE;
        } else if (!edge && k <= 6)
          id = AIR;
        else if (edge && k === 3)
          id = CUT_SANDSTONE;
        else if (edge && k === 2 && (dx + dz) % 4 === 0)
          id = CHISELED_SANDSTONE;
        c.set(ox + dx, oy + k, oz + dz, id);
      }
    }
  }
  for (let dz = R - 4;dz <= R; dz++)
    for (let dx = -1;dx <= 1; dx++)
      for (let dy = 1;dy <= 3; dy++)
        c.set(ox + dx, oy + dy, oz + dz, AIR);
  const cy = oy - 12;
  c.fill(ox - 5, cy - 1, oz - 5, ox + 5, cy + 4, oz + 5, (x, y, z) => {
    const wall = Math.abs(x - ox) === 5 || Math.abs(z - oz) === 5 || y === cy - 1 || y === cy + 4;
    if (!wall)
      return AIR;
    return y === cy + 1 && (x + z) % 3 === 0 ? CHISELED_SANDSTONE : CUT_SANDSTONE;
  });
  for (let y = cy + 4;y < oy; y++)
    c.set(ox, y, oz, AIR);
  c.set(ox, cy - 1, oz, COLORED_TERRACOTTA.orange);
  c.chest(ox, cy, oz - 4, 2, "desert_pyramid");
  c.chest(ox + 4, cy, oz, 3, "desert_pyramid");
  c.chest(ox, cy, oz + 4, 0, "desert_pyramid");
  c.chest(ox - 4, cy, oz, 1, "desert_pyramid");
}
function buildJungleTemple(c, s, gen) {
  const { x: ox, y: oy, z: oz } = s;
  const W = 6, L = 7, H = 9;
  const rock = (x, y, z) => {
    const k = hash3(x, y, z, gen.seed ^ 2019);
    return k % 5 < 2 ? MOSSY_COBBLESTONE : k % 7 === 0 ? MOSSY_STONE_BRICKS : k % 11 === 0 ? CRACKED_STONE_BRICKS : COBBLESTONE;
  };
  for (let dz = -L;dz <= L; dz++) {
    for (let dx = -W;dx <= W; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, COBBLESTONE);
      c.clearAbove(ox + dx, oy, oz + dz, H + 6);
    }
  }
  for (let y = oy;y <= oy + H; y++) {
    const inset = y > oy + 5 ? y - oy - 5 : 0;
    for (let dz = -L + inset;dz <= L - inset; dz++) {
      for (let dx = -W + inset;dx <= W - inset; dx++) {
        const edge = Math.abs(dx) === W - inset || Math.abs(dz) === L - inset;
        const floor = y === oy || y === oy + 4;
        const x = ox + dx, z = oz + dz;
        if (edge || floor || y === oy + H)
          c.set(x, y, z, rock(x, y, z));
        else
          c.set(x, y, z, AIR);
      }
    }
  }
  for (let dy = 1;dy <= 3; dy++)
    for (let dx = -1;dx <= 1; dx++)
      c.set(ox + dx, oy + dy, oz - L, AIR);
  for (const dz of [-3, 3])
    for (const dx of [-W, W])
      c.set(ox + dx, oy + 2, oz + dz, AIR);
  const by = oy - 5;
  c.fill(ox - 4, by - 1, oz - 3, ox + 4, oy - 1, oz + 3, (x, y, z) => {
    const wall = Math.abs(x - ox) === 4 || Math.abs(z - oz) === 3 || y === by - 1 || y === oy - 1;
    return wall ? rock(x, y, z) : AIR;
  });
  for (let y = by;y <= oy; y++)
    c.set(ox, y, oz + 2, stateOf(LADDER, { facing: 0 }));
  c.chest(ox - 3, by, oz, 1, "jungle_temple");
  c.chest(ox + 3, by, oz - 2, 3, "jungle_temple");
  c.set(ox + 3, by + 2, oz + 2, TORCH);
}
function buildShipwreck(c, s) {
  const { x: ox, z: oz } = s;
  const oy = s.y;
  const along = s.rng % 2 === 0;
  const wood = s.rng % 3 === 0 ? SPRUCE_PLANKS : OAK_PLANKS;
  const P = (u, v) => along ? [ox + u, oz + v] : [ox + v, oz + u];
  const half = 9;
  for (let u = -half;u <= half; u++) {
    const w = Math.abs(u) > half - 3 ? 1 : 2;
    for (let v = -w - 1;v <= w + 1; v++) {
      const [x, z] = P(u, v);
      for (let dy = 0;dy <= 4; dy++) {
        const side = Math.abs(v) === w + 1 || Math.abs(u) === half;
        const bottom = dy === 0;
        const deck = dy === 3 && (u < -3 || u > 3);
        const broken = hash3(x, oy + dy, z, s.rng) % 7 === 0;
        if (side && dy <= 3 || bottom || deck)
          c.set(x, oy + dy, z, broken ? oy + dy < SEA_LEVEL ? WATER : AIR : wood);
        else
          c.clear(x, oy + dy, z, true);
      }
    }
  }
  const [mx, mz] = P(-1, 0);
  for (let dy = 1;dy <= 7; dy++)
    c.set(mx, oy + dy, mz, SPRUCE_LOG);
  const [sx, sz] = P(-half + 3, 0);
  const [tx, tz] = P(half - 3, 0);
  c.chest(sx, oy + 1, sz, along ? 1 : 2, "shipwreck_supply");
  c.chest(tx, oy + 1, tz, along ? 3 : 0, "shipwreck_treasure");
  const [mcx, mcz] = P(1, 1);
  c.chest(mcx, oy + 1, mcz, along ? 2 : 1, "shipwreck_map");
}
function buildRuinedPortal(c, s, gen) {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -5;dz <= 5; dz++) {
    for (let dx = -5;dx <= 5; dx++) {
      const k = hash3(ox + dx, oy, oz + dz, gen.seed ^ 2471);
      if (dx * dx + dz * dz > 25 - k % 6)
        continue;
      c.set(ox + dx, oy, oz + dz, k % 5 === 0 ? MOSSY_STONE_BRICKS : k % 3 === 0 ? STONE_BRICKS : NETHERRACK);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 6);
    }
  }
  const alongX = s.rng % 2 === 0;
  for (let u = -2;u <= 1; u++) {
    for (let dy = 1;dy <= 5; dy++) {
      const frame = u === -2 || u === 1 || dy === 1 || dy === 5;
      if (!frame)
        continue;
      const x = alongX ? ox + u : ox, z = alongX ? oz : oz + u;
      const k = hash3(x, oy + dy, z, s.rng);
      if (k % 4 === 0)
        continue;
      c.set(x, oy + dy, z, k % 5 === 0 ? CRYING_OBSIDIAN : OBSIDIAN);
    }
  }
  const gx = alongX ? ox + 3 : ox + 2, gz = alongX ? oz + 2 : oz + 3;
  c.set(gx, oy + 1, gz, GOLD_BLOCK);
  c.chest(alongX ? ox - 3 : ox - 2, oy + 1, alongX ? oz + 1 : oz - 3, 2, "ruined_portal");
}
function buildIgloo(c, s) {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -4;dz <= 4; dz++) {
    for (let dx = -4;dx <= 4; dx++) {
      if (dx * dx + dz * dz > 18)
        continue;
      c.foundation(ox + dx, oy, oz + dz, SNOW_BLOCK);
      c.set(ox + dx, oy, oz + dz, SNOW_BLOCK);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 6);
    }
  }
  for (let dy = 1;dy <= 4; dy++) {
    for (let dz = -4;dz <= 4; dz++) {
      for (let dx = -4;dx <= 4; dx++) {
        const d = Math.hypot(dx, (dy - 0.5) * 1.25, dz);
        if (d <= 3.9)
          c.set(ox + dx, oy + dy, oz + dz, d > 2.9 ? SNOW_BLOCK : AIR);
      }
    }
  }
  for (let dz = 3;dz <= 4; dz++)
    for (let dy = 1;dy <= 2; dy++)
      c.set(ox, oy + dy, oz + dz, AIR);
  c.set(ox - 1, oy + 1, oz - 2, stateOf(BEDS.white, { facing: 0, part: 0 }));
  c.set(ox - 1, oy + 1, oz - 3, stateOf(BEDS.white, { facing: 0, part: 1 }));
  c.set(ox + 2, oy + 1, oz - 1, CRAFTING_TABLE);
  c.set(ox + 2, oy + 1, oz, FURNACE + 3);
  c.set(ox + 1, oy + 1, oz - 2, TORCH);
  if (s.rng % 2 === 0) {
    const by = oy - 8;
    c.set(ox + 1, oy, oz + 1, stateOf(TRAPDOORS.spruce, { facing: 0, half: 1, open: 0 }));
    for (let y = by + 1;y < oy; y++)
      c.set(ox + 1, y, oz + 1, stateOf(LADDER, { facing: 0 }));
    c.fill(ox - 2, by, oz - 3, ox + 3, by + 4, oz + 2, (x, y, z) => {
      const wall = x === ox - 2 || x === ox + 3 || z === oz - 3 || z === oz + 2 || y === by || y === by + 4;
      if (x === ox + 1 && z === oz + 1 && y > by)
        return stateOf(LADDER, { facing: 0 });
      return wall ? iglooBrick(x, y, z, s.rng) : AIR;
    });
    c.chest(ox - 1, by + 1, oz - 2, 2, "igloo");
    c.set(ox + 2, by + 3, oz - 2, TORCH);
  }
}
function buildDesertWell(c, s) {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -2;dz <= 2; dz++) {
    for (let dx = -2;dx <= 2; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, SANDSTONE);
      c.set(ox + dx, oy, oz + dz, SANDSTONE);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 5);
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 1;
      if (ring)
        c.set(ox + dx, oy + 1, oz + dz, Math.abs(dx) + Math.abs(dz) === 2 ? SANDSTONE : stateOf(SLABS.sandstone, { type: 0 }));
    }
  }
  c.set(ox, oy, oz, WATER);
  c.set(ox, oy - 1, oz, WATER);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.set(ox + dx, oy + 2, oz + dz, SANDSTONE);
    c.set(ox + dx, oy + 3, oz + dz, SANDSTONE);
  }
  c.fill(ox - 1, oy + 4, oz - 1, ox + 1, oy + 4, oz + 1, stateOf(SLABS.sandstone, { type: 0 }));
  c.set(ox, oy + 4, oz, SANDSTONE);
}

// goodPG/src/shared/world/infested.ts
function placeInfested(blocks, cx, cz, seed, biome) {
  const base = baseBiome(biome);
  if (base !== BIOME_MOUNTAINS && base !== BIOME_SNOWY_PEAKS)
    return;
  const rng = mulberry32(hash2(cx, cz, seed ^ 5371877 | 0));
  for (let n = 0;n < 7; n++) {
    let x = Math.floor(rng() * 16), y = Math.floor(rng() * 64), z = Math.floor(rng() * 16);
    for (let s = 0;s < 9; s++) {
      if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y) {
        const i = blockIndex(x, y, z);
        if (blocks[i] === STONE)
          blocks[i] = INFESTED_STONE;
      }
      const dir = Math.floor(rng() * 6);
      if (dir === 0)
        x++;
      else if (dir === 1)
        x--;
      else if (dir === 2)
        y++;
      else if (dir === 3)
        y--;
      else if (dir === 4)
        z++;
      else
        z--;
    }
  }
}

// goodPG/src/shared/world/beeNests.ts
var NEST_CHANCE = {
  [BIOME_PLAINS]: 0.1,
  [BIOME_MEADOW]: 0.8,
  [BIOME_SUNFLOWER_PLAINS]: 0.1,
  [BIOME_FLOWER_FOREST]: 0.1
};
function placeBeeNest(seed, biome, x, y, z, tr, set) {
  const chance = NEST_CHANCE[biome];
  if (chance === undefined)
    return;
  if ((biome === BIOME_PLAINS || biome === BIOME_SUNFLOWER_PLAINS) && tr > 0.8)
    return;
  const birch = biome === BIOME_MEADOW && tr >= 0.6 || biome === BIOME_FLOWER_FOREST && tr < 0.25;
  if (hashToFloat(hash2(x, z, seed ^ 48869)) >= chance)
    return;
  const h = 4 + Math.floor(tr * 1000) % 3 + (birch ? 1 : 0);
  const top = y + h - 1;
  const d = hash2(x, z, seed ^ 48870) & 3;
  const ny = h >= 5 ? top - 3 : top - 2;
  set(x + DIR_X[d], ny, z + DIR_Z[d], stateOf(BEE_NEST, { facing: d }), true);
}

// goodPG/src/shared/world/woodTrees.ts
var noiseCache = new Map;
function regionNoise(seed) {
  let n = noiseCache.get(seed);
  if (!n) {
    n = new Simplex(seed ^ 6958949 | 0);
    noiseCache.set(seed, n);
  }
  return n;
}
function isMangroveArea(seed, x, z) {
  return regionNoise(seed).noise2(x / 110, z / 110) > 0.05;
}
var kindOf = (key) => WOOD_TYPES.findIndex((w) => w.key === key);
function inDisc(seed, cx, cz, rad, x, y, z) {
  const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
  return dx * dx + dz * dz <= rad * rad + rad * 0.6 + hash3(x, y, z, seed ^ 750) % 3 * 0.25;
}
function leafDisc(seed, cx, y, cz, rad, leaves, set, out) {
  const r0 = Math.ceil(rad + 1);
  const ix = Math.floor(cx), iz = Math.floor(cz);
  for (let z = iz - r0;z <= iz + r0; z++) {
    for (let x = ix - r0;x <= ix + r0; x++) {
      if (!inDisc(seed, cx, cz, rad, x, y, z))
        continue;
      set(x, y, z, leaves, false);
      out?.push([x, z]);
    }
  }
}
function mangroveTree(seed, x, y, z, r, set, ground) {
  const lift = 2 + Math.floor(r * 1000) % 2;
  const h = 4 + Math.floor(r * 7919) % 3;
  const base = y + lift;
  const root = (rx, rz, fromY) => {
    const g = ground(rx, rz);
    const lowest = Math.max(g + 1, y - 4);
    for (let yy = fromY;yy >= lowest; yy--)
      set(rx, yy, rz, yy === lowest && lowest === g + 1 ? MUDDY_MANGROVE_ROOTS : MANGROVE_ROOTS, true);
  };
  root(x, z, base - 1);
  for (let d = 0;d < 8; d++) {
    const hh = hash3(x, d, z, seed ^ 15007);
    if (d >= 4 && hh % 3 !== 0)
      continue;
    const dx = d < 4 ? DIR_X[d] : DIR_X[d & 3] + DIR_X[d + 1 & 3];
    const dz = d < 4 ? DIR_Z[d] : DIR_Z[d & 3] + DIR_Z[d + 1 & 3];
    const reach = 1 + (hh >>> 4) % 2;
    set(x + dx, base - 1, z + dz, MANGROVE_ROOTS, true);
    root(x + dx * reach, z + dz * reach, base - 1 - reach + 1);
  }
  for (let k = 0;k < h; k++)
    set(x, base + k, z, MANGROVE_LOG, true);
  const top = base + h - 1;
  const bd = Math.floor(r * 4000) % 4;
  const bx = x + DIR_X[bd], bz = z + DIR_Z[bd];
  set(bx, top - 1, bz, horizontalLog(MANGROVE_LOG, DIR_X[bd] !== 0 ? AXIS_X : AXIS_Z), true);
  set(bx + DIR_X[bd], top, bz + DIR_Z[bd], MANGROVE_LOG, true);
  const cells = [];
  leafDisc(seed, x + 0.5, top - 1, z + 0.5, 2.8, MANGROVE_LEAVES, set, cells);
  const low = cells.length;
  leafDisc(seed, x + 0.5, top, z + 0.5, 3, MANGROVE_LEAVES, set);
  leafDisc(seed, x + 0.5, top + 1, z + 0.5, 2.2, MANGROVE_LEAVES, set);
  leafDisc(seed, x + 0.5, top + 2, z + 0.5, 1.2, MANGROVE_LEAVES, set);
  leafDisc(seed, bx + DIR_X[bd] + 0.5, top + 1, bz + DIR_Z[bd] + 0.5, 1.6, MANGROVE_LEAVES, set);
  const inLow = new Set(cells.map(([cx, cz]) => cx * 4096 + cz));
  for (let i = 0;i < low; i++) {
    const [lx, lz] = cells[i];
    if (lx === x && lz === z)
      continue;
    const hh = hash3(lx, top, lz, seed ^ 2528);
    if (hh % 9 === 0)
      set(lx, top - 2, lz, HANGING_PROPAGULE, false);
    for (let d = 0;d < 4; d++) {
      const vx = lx + DIR_X[d], vz = lz + DIR_Z[d];
      if (inLow.has(vx * 4096 + vz) || (hh >>> 4 + d * 3) % 6 !== 0)
        continue;
      const len = 1 + ((hh >>> 20) + d) % 3;
      for (let j = 0;j < len; j++)
        set(vx, top - 1 - j, vz, VINE + d, false);
    }
  }
}
function paleOakTree(seed, x, y, z, r, set) {
  const h = 6 + Math.floor(r * 1000) % 3;
  for (let k = 0;k < h; k++)
    set(x, y + k, z, PALE_OAK_LOG, true);
  const top = y + h - 1;
  for (let i = 0;i < 2; i++) {
    const d = (Math.floor(r * 131) + i * 2) % 4;
    const bx = x + DIR_X[d], bz = z + DIR_Z[d];
    set(bx, top - 1, bz, horizontalLog(PALE_OAK_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z), true);
    leafDisc(seed, bx + DIR_X[d] + 0.5, top, bz + DIR_Z[d] + 0.5, 1.6, PALE_OAK_LEAVES, set);
  }
  const radii = [2.8, 3.4, 2.8, 1.5];
  for (let k = 0;k < 4; k++)
    leafDisc(seed, x + 0.5, top - 1 + k, z + 0.5, radii[k], PALE_OAK_LEAVES, set);
}
function placeWoodTree(seed, biome, x, y, z, tr, set, ground) {
  if (biome === BIOME_MANGROVE_SWAMP || biome === BIOME_SWAMP && isMangroveArea(seed, x, z) && tr < 0.85) {
    mangroveTree(seed, x, y, z, tr, set, ground);
    return true;
  }
  if (biome === BIOME_DARK_FOREST && tr >= 0.82 && tr < 0.86) {
    paleOakTree(seed, x, y, z, tr, set);
    return true;
  }
  return false;
}
function growWoodTree(seed, kind, x, y, z, r, set) {
  if (kind === kindOf("mangrove")) {
    mangroveTree(seed, x, y, z, r, set, () => y - 1);
    return true;
  }
  if (kind === kindOf("pale_oak")) {
    paleOakTree(seed, x, y, z, r, set);
    return true;
  }
  return false;
}
var leavesFromTop = (k) => k < 2 ? 2 : k === 2 ? 1 : 0;
function placeBamboo(seed, blocks, tops, biomes, x0, z0) {
  const n = regionNoise(seed);
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const b = biomes(lx, lz);
      if (baseBiome(b) !== BIOME_JUNGLE)
        continue;
      const wx = x0 + lx, wz = z0 + lz;
      const dense = b === BIOME_BAMBOO_JUNGLE;
      if (!dense && n.noise2(wx / 26 + 300, wz / 26) < 0.3)
        continue;
      if (hashToFloat(hash2(wx, wz, seed ^ 47675)) > (dense ? 0.55 : 0.3))
        continue;
      const top = tops[lz * 16 + lx];
      if (top >= MAX_Y - 18 || blocks[blockIndex(lx, top, lz)] !== GRASS)
        continue;
      const above = blocks[blockIndex(lx, top + 1, lz)];
      if (above !== AIR && above !== SHORT_GRASS && above !== FERN)
        continue;
      const h = 4 + hash2(wx, wz, seed ^ 47676) % 11;
      for (let k = 0;k < h; k++) {
        const i = blockIndex(lx, top + 1 + k, lz);
        if (k > 0 && blocks[i] !== AIR)
          break;
        blocks[i] = BAMBOO + leavesFromTop(h - 1 - k);
      }
    }
  }
}

// goodPG/src/shared/world/stones.ts
var SULFUR_CELL = 128;
var SULFUR_CHANCE = 0.14;
var SULFUR_MIN_Y = -44;
var SULFUR_MAX_Y = 24;
function valueNoise(x, z, cell, seed) {
  const fx = x / cell, fz = z / cell;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  let tx = fx - ix, tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const h = (a, b) => hashToFloat(hash2(a, b, seed));
  const top = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * tx;
  const bot = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * tx;
  return top + (bot - top) * tz;
}
function sulfurZoneAt(seed, x, z) {
  const gx = Math.floor(x / SULFUR_CELL), gz = Math.floor(z / SULFUR_CELL);
  const s = seed ^ 5906188 | 0;
  if (hashToFloat(hash2(gx, gz, s)) >= SULFUR_CHANCE)
    return null;
  const jx = hashToFloat(hash2(gx, gz, s + 1)), jz = hashToFloat(hash2(gx, gz, s + 2));
  const radius = 34 + Math.floor(hashToFloat(hash2(gx, gz, s + 3)) * 17);
  const margin = radius + 9;
  return {
    x: gx * SULFUR_CELL + margin + jx * (SULFUR_CELL - 2 * margin),
    z: gz * SULFUR_CELL + margin + jz * (SULFUR_CELL - 2 * margin),
    radius
  };
}
var HOST = new Set([STONE, DEEPSLATE, TUFF, GRANITE, DIORITE, ANDESITE, DIRT, GRAVEL]);
function sulfurBand(seed, x, y, z) {
  const wave = 2.5 * Math.sin(x * 0.11 + z * 0.04) + 2.5 * Math.cos(z * 0.13 - x * 0.05);
  const g = y + wave + 1.5 * valueNoise(x, z, 9, seed ^ 30641);
  const band = (Math.floor(g / 2) % 6 + 6) % 6;
  return band <= 1 ? SULFUR : band === 3 || band === 4 ? CINNABAR : 0;
}
function placeSulfur(blocks, x0, z0, seed, caveBiome) {
  if (caveBiome !== 0)
    return;
  const zone = sulfurZoneAt(seed, x0 + 8, z0 + 8);
  if (!zone)
    return;
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const d = Math.hypot(wx - zone.x, wz - zone.z) / zone.radius;
      if (d >= 1)
        continue;
      for (let y = Math.max(SULFUR_MIN_Y, MIN_Y + 1);y <= SULFUR_MAX_Y; y++) {
        const edge = Math.max(d, Math.abs(y - (SULFUR_MIN_Y + SULFUR_MAX_Y) / 2) / ((SULFUR_MAX_Y - SULFUR_MIN_Y) / 2));
        if (edge > 0.8 && hashToFloat(hash3(wx, y, wz, seed ^ 963)) < (edge - 0.8) * 5)
          continue;
        const i = blockIndex(lx, y, lz);
        if (!HOST.has(blocks[i]))
          continue;
        const b = sulfurBand(seed, wx, y, wz);
        if (b)
          blocks[i] = b;
      }
    }
  }
}
function placeMud(blocks, x0, z0, seed, biomes, tops) {
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const b = biomes[lz * 16 + lx].biome;
      if (baseBiome(b) !== BIOME_SWAMP)
        continue;
      const n = b === BIOME_MANGROVE_SWAMP ? 1 : valueNoise(x0 + lx, z0 + lz, 6, seed ^ 27917);
      let y = tops[lz * 16 + lx];
      let underwater = false;
      while (y > MIN_Y + 1 && blocks[blockIndex(lx, y, lz)] === WATER) {
        y--;
        underwater = true;
      }
      if (!underwater && y > SEA_LEVEL)
        continue;
      if (n < (underwater ? 0.35 : 0.58))
        continue;
      for (let k = 0;k < 2; k++) {
        const i = blockIndex(lx, y - k, lz);
        const b = blocks[i];
        if (b === DIRT || b === GRASS || b === CLAY || b === SAND || b === GRAVEL)
          blocks[i] = MUD;
        else
          break;
      }
    }
  }
}
function placeStones(blocks, x0, z0, seed, biomes, tops, caveBiome) {
  placeMud(blocks, x0, z0, seed, biomes, tops);
  placeSulfur(blocks, x0, z0, seed, caveBiome);
}

// goodPG/src/shared/world/oceanDecor.ts
var MONUMENT_SURFACE = new Set([PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN]);
var ROW2 = 256;
var NOISES2 = new Map;
function noisesFor2(seed) {
  let n = NOISES2.get(seed);
  if (!n) {
    n = {
      reef: new Simplex(seed ^ 12015),
      kind: new Simplex(seed ^ 49313),
      kelp: new Simplex(seed ^ 28187),
      patch: new Simplex(seed ^ 61710)
    };
    NOISES2.set(seed, n);
  }
  return n;
}
function decorate65(gen, blocks, tops, infos, cx, cz) {
  const nz = noisesFor2(gen.seed);
  decorateOcean(gen.seed, nz, blocks, infos, cx, cz);
  decorateLand(gen, nz, blocks, tops, infos, cx, cz);
  decorateCaves65(gen, blocks, tops, cx, cz);
}
function decorateOcean(seed, nz, blocks, infos, cx, cz) {
  const x0 = cx * 16, z0 = cz * 16;
  const reefBlocks = [];
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const biome = infos[lz * 16 + lx].biome;
      if (!isOceanBiome(biome))
        continue;
      let y = SEA_LEVEL - 1;
      if (blocks[blockIndex(lx, y, lz)] === ICE)
        y--;
      if (blocks[blockIndex(lx, y, lz)] !== WATER)
        continue;
      const surface = y;
      while (y > MIN_Y + 2 && blocks[blockIndex(lx, y, lz)] === WATER)
        y--;
      const floor = blocks[blockIndex(lx, y, lz)];
      if (!BLOCK_OPAQUE[floor] || MONUMENT_SURFACE.has(floor))
        continue;
      const fy = y + 1;
      const depth = surface - y;
      const wx = x0 + lx, wz = z0 + lz;
      const r = hashToFloat(hash2(wx, wz, seed ^ 3306));
      const r2 = hashToFloat(hash2(wx, wz, seed ^ 24239));
      const at = (yy) => blockIndex(lx, yy, lz);
      const water = (yy) => yy <= surface && blocks[at(yy)] === WATER;
      const seagrass = (tallChance) => {
        if (depth >= 2 && r2 < tallChance && water(fy + 1)) {
          blocks[at(fy)] = TALL_SEAGRASS_LOWER;
          blocks[at(fy + 1)] = TALL_SEAGRASS_UPPER;
        } else
          blocks[at(fy)] = SEAGRASS_SHORT;
      };
      if (biome === BIOME_WARM_OCEAN) {
        const reef = depth >= 3 && nz.reef.noise2(wx / 48, wz / 48) > -0.15;
        const type = Math.min(4, Math.floor((nz.kind.noise2(wx / 11, wz / 11) * 0.5 + 0.5) * 5));
        const set = CORALS[CORAL_TYPES[type]];
        if (reef && r < 0.16 && depth >= 4) {
          const h = Math.min(depth - 2, 1 + Math.floor(r2 * 3));
          let k = 0;
          while (k < h && water(fy + k)) {
            blocks[at(fy + k)] = set.block;
            reefBlocks.push([lx, fy + k, lz, type]);
            k++;
          }
          const topY = fy + k;
          if (k > 0 && water(topY)) {
            const pick = hashToFloat(hash3(wx, topY, wz, seed ^ 1953));
            blocks[at(topY)] = pick < 0.4 ? stateOf(set.coral, { water: 1 }) : pick < 0.8 ? stateOf(set.fan, { water: 1 }) : seaPickleBlock(1 + Math.floor(r2 * 4), true);
          }
        } else if (reef && r < 0.45) {
          blocks[at(fy)] = stateOf(r2 < 0.5 ? set.coral : set.fan, { water: 1 });
        } else if (r < (reef ? 0.62 : 0.32)) {
          seagrass(0.25);
        } else if (r < (reef ? 0.64 : 0.325)) {
          blocks[at(fy)] = seaPickleBlock(1 + Math.floor(r2 * 4), true);
        }
      } else if (biome === BIOME_FROZEN_OCEAN || biome === BIOME_DEEP_FROZEN_OCEAN) {
        if (r < 0.06)
          blocks[at(fy)] = SEAGRASS_SHORT;
      } else {
        const forest = depth >= 3 && nz.kelp.noise2(wx / 40, wz / 40) > (biome === BIOME_COLD_OCEAN || biome === BIOME_DEEP_COLD_OCEAN ? -0.1 : 0.05);
        if (forest && r < 0.5) {
          const h = Math.max(1, Math.min(depth, 2 + Math.floor(r2 * Math.min(depth, 16))));
          let k = 0;
          while (k < h && water(fy + k)) {
            blocks[at(fy + k)] = KELP_STEM;
            k++;
          }
          if (k > 0)
            blocks[at(fy + k - 1)] = KELP_TOP;
        } else if (r < (forest ? 0.7 : 0.35)) {
          seagrass(0.3);
        }
      }
    }
  }
  for (const [lx, y, lz, type] of reefBlocks) {
    for (let d = 0;d < 4; d++) {
      const nx = lx + DIR_X[d], nzz = lz + DIR_Z[d];
      if (nx < 0 || nx > 15 || nzz < 0 || nzz > 15)
        continue;
      const i = blockIndex(nx, y, nzz);
      if (blocks[i] !== WATER)
        continue;
      if (hashToFloat(hash3(x0 + nx, y, z0 + nzz, seed ^ 4004 ^ d)) > 0.22)
        continue;
      blocks[i] = stateOf(CORALS[CORAL_TYPES[type]].wallFan, { water: 1, facing: d });
    }
  }
}
function decorateLand(gen, nz, blocks, tops, infos, cx, cz) {
  const seed = gen.seed;
  const x0 = cx * 16, z0 = cz * 16;
  const setLocal = (x, y, z, id, force) => {
    const lx = x - x0, lz = z - z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y <= MIN_Y || y >= MAX_Y)
      return;
    const i = blockIndex(lx, y, lz);
    const cur = blocks[i];
    if (cur === AIR || force && (BLOCK_REPLACEABLE[cur] || BLOCK_RENDER[cur] === R_CROSS || isLeaves(cur)))
      blocks[i] = id;
  };
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const top = tops[lz * 16 + lx];
      if (top <= MIN_Y + 1 || top >= MAX_Y - 8)
        continue;
      const ground = blocks[blockIndex(lx, top, lz)];
      if (ground !== GRASS && ground !== SNOWY_GRASS)
        continue;
      const a1 = blockIndex(lx, top + 1, lz), a2 = a1 + ROW2;
      const cur = blocks[a1];
      if (cur !== AIR && cur !== SHORT_GRASS && cur !== FERN)
        continue;
      const wx = x0 + lx, wz = z0 + lz;
      const biome = infos[lz * 16 + lx].biome;
      const r = hashToFloat(hash2(wx, wz, seed ^ 26097));
      const r2 = hashToFloat(hash2(wx, wz, seed ^ 26098));
      const tall = (id) => {
        if (blocks[a2] !== AIR)
          return false;
        blocks[a1] = id;
        blocks[a2] = id + 1;
        return true;
      };
      if (ground === GRASS && cur === AIR && lx >= 2 && lx <= 13 && lz >= 2 && lz <= 13 && r2 < 0.006 && gen.caveBiomeAt(wx, wz) === 1) {
        azaleaTree(wx, top + 1, wz, r, setLocal);
        rootColumn(blocks, lx, top, lz);
        continue;
      }
      const patch = nz.patch.noise2(wx / 34, wz / 34);
      if (biome === BIOME_SUNFLOWER_PLAINS && r < 0.22 && tall(SUNFLOWER))
        continue;
      if (biome === BIOME_FLOWER_FOREST && r < 0.12 && tall([LILAC, ROSE_BUSH, PEONY][Math.floor(r2 * 3)]))
        continue;
      switch (baseBiome(biome)) {
        case BIOME_PLAINS:
          if (patch > 0.5 && r < 0.14)
            tall(SUNFLOWER);
          else if (cur === SHORT_GRASS && r < 0.2)
            tall(TALL_GRASS);
          break;
        case BIOME_FOREST:
        case BIOME_BIRCH_FOREST:
        case BIOME_DARK_FOREST:
          if (patch > 0.45 && r < 0.07)
            tall([LILAC, ROSE_BUSH, PEONY][Math.floor(r2 * 3)]);
          else if (cur === SHORT_GRASS && r < 0.14)
            tall(TALL_GRASS);
          break;
        case BIOME_TAIGA:
        case BIOME_SNOWY:
          if (patch > 0.3 && r < 0.035)
            blocks[a1] = SWEET_BERRY_BUSH + 1 + Math.floor(r2 * 3);
          else if (cur === FERN && r < 0.35)
            tall(LARGE_FERN);
          else if (cur === SHORT_GRASS && r < 0.1)
            tall(TALL_GRASS);
          break;
        case BIOME_JUNGLE:
          if (cur === FERN && r < 0.35)
            tall(LARGE_FERN);
          else if (cur === SHORT_GRASS && r < 0.2)
            tall(TALL_GRASS);
          break;
        case BIOME_SAVANNA:
          if (cur === SHORT_GRASS && r < 0.25)
            tall(TALL_GRASS);
          break;
        case BIOME_MEADOW:
          if (cur === SHORT_GRASS && r < 0.18)
            tall(TALL_GRASS);
          break;
      }
    }
  }
}
function azaleaTree(x, y, z, r, set) {
  const h = 4 + Math.floor(r * 2);
  const top = y + h - 1;
  for (let k = 0;k < h; k++)
    set(x, y + k, z, OAK_LOG, true);
  for (let dy = -1;dy <= 1; dy++) {
    const rad = dy === 1 ? 1 : 2;
    for (let dz = -rad;dz <= rad; dz++) {
      for (let dx = -rad;dx <= rad; dx++) {
        if (dx === 0 && dz === 0 && dy < 1)
          continue;
        const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
        const hh = hash3(x + dx, top + dy, z + dz, 41633);
        if (corner && (hh & 3) !== 0)
          continue;
        set(x + dx, top + dy, z + dz, (hh >>> 4) % 10 < 3 ? FLOWERING_AZALEA_LEAVES : AZALEA_LEAVES, false);
      }
    }
  }
  set(x, top + 2, z, AZALEA_LEAVES, false);
}
function decorateCaves65(gen, blocks, tops, cx, cz) {
  const seed = gen.seed;
  const x0 = cx * 16, z0 = cz * 16;
  const opaque = (b) => b !== AIR && BLOCK_OPAQUE[b] === 1;
  for (let lz = 0;lz < 16; lz++) {
    for (let lx = 0;lx < 16; lx++) {
      const wx = x0 + lx, wz = z0 + lz;
      const lush = gen.caveBiomeAt(wx, wz) === 1;
      const top = tops[lz * 16 + lx];
      for (let y = MIN_Y + 6;y < top - 12; y++) {
        const i = blockIndex(lx, y, lz);
        if (blocks[i] !== AIR)
          continue;
        const h = hash3(wx, y, wz, seed ^ 26058);
        const r = (h & 65535) / 65536;
        const below = blocks[i - ROW2], above = blocks[i + ROW2];
        if (lush) {
          if (below === MOSS_BLOCK) {
            if (r < 0.025) {
              const n = 1 + (h >>> 16) % 3;
              let k = 0;
              while (k < n && y + k < top - 12 && blocks[i + k * ROW2] === AIR)
                k++;
              if (k === 0)
                continue;
              for (let j = 0;j < k - 1; j++)
                blocks[i + j * ROW2] = BIG_DRIPLEAF_STEM;
              blocks[i + (k - 1) * ROW2] = BIG_DRIPLEAF;
              continue;
            }
            if (r < 0.05 && above === AIR) {
              blocks[i] = SMALL_DRIPLEAF;
              blocks[i + ROW2] = SMALL_DRIPLEAF + 1;
              continue;
            }
          }
          if (opaque(above)) {
            if (r > 0.992) {
              blocks[i] = SPORE_BLOSSOM;
              continue;
            }
            if (r > 0.93) {
              blocks[i] = HANGING_ROOTS;
              continue;
            }
          }
        }
        if ((h >>> 16 & 1023) < 5) {
          for (let d = 0;d < 4; d++) {
            const nx = lx + DIR_X[d], nzz = lz + DIR_Z[d];
            if (nx < 0 || nx > 15 || nzz < 0 || nzz > 15)
              continue;
            if (!opaque(blocks[blockIndex(nx, y, nzz)]))
              continue;
            blocks[i] = stateOf(GLOW_LICHEN, { face: d });
            break;
          }
          if (blocks[i] === AIR && opaque(above))
            blocks[i] = stateOf(GLOW_LICHEN, { face: 4 });
        }
      }
    }
  }
}

// goodPG/src/shared/world/javaNoise.ts
class NoiseRandom {
  s;
  constructor(seed) {
    this.s = seed | 0;
  }
  next32() {
    let t = this.s = this.s + 1831565813 | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return (t ^ t >>> 14) >>> 0;
  }
  nextDouble() {
    return (this.next32() * 2097152 + (this.next32() >>> 11)) / 9007199254740992;
  }
  nextFloat() {
    return (this.next32() >>> 8) / 16777216;
  }
  nextInt(n) {
    return Math.floor(this.nextDouble() * n);
  }
  fork(tag) {
    let h = this.next32() ^ 2654435769;
    for (let i = 0;i < tag.length; i++)
      h = Math.imul(h ^ tag.charCodeAt(i), 16777619);
    return new NoiseRandom(h);
  }
}
var GX = Int8Array.from([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
var GY = Int8Array.from([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
var GZ = Int8Array.from([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);
var HALF_ROUND_OFF = 16777215.999999998;
function wrap(x) {
  return x >= -HALF_ROUND_OFF && x < HALF_ROUND_OFF ? x : x - Math.floor(x / 33554432 + 0.5) * 33554432;
}
var smoothstep2 = (t) => t * t * t * (t * (t * 6 - 15) + 10);
var lerp2 = (a, x0, x1) => x0 + a * (x1 - x0);

class PerlinNoise {
  perms = new Uint8Array(512);
  ox;
  oy;
  oz;
  constructor(random) {
    this.ox = random.nextDouble() * 256;
    this.oy = random.nextDouble() * 256;
    this.oz = random.nextDouble() * 256;
    const p = this.perms;
    for (let i = 0;i < 256; i++)
      p[i] = i;
    for (let i = 0;i < 256; i++) {
      const o = random.nextInt(256 - i);
      const t = p[i];
      p[i] = p[o + i];
      p[o + i] = t;
    }
    for (let i = 0;i < 256; i++)
      p[i + 256] = p[i];
  }
  permute(x) {
    return this.perms[x & 255];
  }
  get(x0, y0, z0) {
    const x = wrap(x0) + this.ox, y = wrap(y0) + this.oy, z = wrap(z0) + this.oz;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const ry = y - fy;
    return this.sampleAndLerp(fx, fy, fz, x - fx, ry, z - fz, ry);
  }
  sampleAndLerp(x, y, z, rx, ry, rz, origRy) {
    const p = this.perms;
    const x0 = p[x & 255], x1 = p[x + 1 & 255];
    const xy00 = p[x0 + y & 255], xy01 = p[x0 + y + 1 & 255];
    const xy10 = p[x1 + y & 255], xy11 = p[x1 + y + 1 & 255];
    let k = p[xy00 + z & 255] & 15;
    const d000 = GX[k] * rx + GY[k] * ry + GZ[k] * rz;
    k = p[xy10 + z & 255] & 15;
    const d100 = GX[k] * (rx - 1) + GY[k] * ry + GZ[k] * rz;
    k = p[xy01 + z & 255] & 15;
    const d010 = GX[k] * rx + GY[k] * (ry - 1) + GZ[k] * rz;
    k = p[xy11 + z & 255] & 15;
    const d110 = GX[k] * (rx - 1) + GY[k] * (ry - 1) + GZ[k] * rz;
    k = p[xy00 + z + 1 & 255] & 15;
    const d001 = GX[k] * rx + GY[k] * ry + GZ[k] * (rz - 1);
    k = p[xy10 + z + 1 & 255] & 15;
    const d101 = GX[k] * (rx - 1) + GY[k] * ry + GZ[k] * (rz - 1);
    k = p[xy01 + z + 1 & 255] & 15;
    const d011 = GX[k] * rx + GY[k] * (ry - 1) + GZ[k] * (rz - 1);
    k = p[xy11 + z + 1 & 255] & 15;
    const d111 = GX[k] * (rx - 1) + GY[k] * (ry - 1) + GZ[k] * (rz - 1);
    const ax = smoothstep2(rx), ay = smoothstep2(origRy), az = smoothstep2(rz);
    return lerp2(az, lerp2(ay, lerp2(ax, d000, d100), lerp2(ax, d010, d110)), lerp2(ay, lerp2(ax, d001, d101), lerp2(ax, d011, d111)));
  }
}
class NoiseStack {
  layers;
  constructor(layers) {
    this.layers = layers;
  }
  get(x, y, z) {
    let v = 0;
    for (const l of this.layers)
      v += l.amplitude * l.noise.get(x * l.frequency, y * l.frequency, z * l.frequency);
    return v;
  }
}
var PERLIN_DEVIATION = 0.2702247831245211;
var INPUT_FACTOR = 1.0181268882175227;
function normalNoise(p, random) {
  const n = p.octaveCount;
  const mods = p.amplitudeModifiers ?? [];
  let frequency = Math.pow(2, p.baseOctave);
  let amplitude = p.baseAmplitude * (Math.pow(0.5, -(n - 1)) / (Math.pow(0.5, -n) - 1));
  const octaves = [];
  for (let i = 0;i < n; i++) {
    const m = mods.length ? mods[i] : 1;
    if (m !== 0)
      octaves.push({ frequency, amplitude: amplitude * m });
    frequency *= 2;
    amplitude *= 0.5;
  }
  const target = octaves.reduce((a, o) => a + Math.abs(o.amplitude), 0);
  const dev = Math.sqrt(octaves.reduce((a, o) => a + (PERLIN_DEVIATION * Math.abs(o.amplitude)) ** 2, 0));
  const factor = dev === 0 ? 0 : target / 3 / (dev * Math.SQRT2);
  const first = random.fork("first"), second = random.fork("second");
  const layers = [];
  for (const o of octaves) {
    const v = factor * o.amplitude;
    layers.push({ noise: new PerlinNoise(first.fork(`octave_${o.frequency}`)), frequency: o.frequency, amplitude: v });
    layers.push({ noise: new PerlinNoise(second.fork(`octave_${o.frequency}`)), frequency: o.frequency * INPUT_FACTOR, amplitude: v });
  }
  return new NoiseStack(layers);
}
var SIMPLEX_F2 = 0.5 * (Math.sqrt(3) - 1);
var SIMPLEX_G2 = (3 - Math.sqrt(3)) / 6;

// goodPG/src/shared/world/caves.ts
var P = (baseOctave, baseAmplitude = 0.955388882960065, octaveCount = 1, amplitudeModifiers) => ({ baseOctave, baseAmplitude, octaveCount, ...amplitudeModifiers ? { amplitudeModifiers } : {} });
var NOISES3 = {
  cave_cheese: P(-8, 0.8361300524356068, 9, [0.5, 1, 2, 1, 2, 1, 0, 2, 0]),
  cave_entrance: P(-7, 0.8500634887071167, 3, [0.4, 0.5, 1]),
  cave_layer: P(-8),
  noodle: P(-8),
  noodle_thickness: P(-8),
  noodle_ridge_a: P(-7),
  noodle_ridge_b: P(-7),
  pillar: P(-7, 0.9494731054427981, 2),
  pillar_rareness: P(-8),
  pillar_thickness: P(-8),
  spaghetti_2d: P(-7),
  spaghetti_2d_elevation: P(-8),
  spaghetti_2d_modulator: P(-11),
  spaghetti_2d_thickness: P(-11),
  spaghetti_3d_1: P(-7),
  spaghetti_3d_2: P(-7),
  spaghetti_3d_rarity: P(-11),
  spaghetti_3d_thickness: P(-8),
  spaghetti_roughness: P(-5),
  spaghetti_roughness_modulator: P(-8),
  aquifer_barrier: P(-3),
  aquifer_fluid_level_floodedness: P(-7),
  aquifer_fluid_level_spread: P(-5),
  aquifer_lava: P(-1)
};
var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
var lerp3 = (t, a, b) => a + t * (b - a);
var gradient = (y, y0, v0, y1, v1) => v0 + (clamp(y, y0, y1) - y0) * ((v1 - v0) / (y1 - y0));
var squeeze = (v) => {
  const x = clamp(v, -1, 1);
  return x / 2 - x * x * x / 24;
};
var CELL_XZ = 4;
var CELL_Y = 8;
var COMPONENTS = 8;
var [C_ENTR, C_CHEESE, C_SPAG, C_PILLAR, C_TOGGLE, C_THICK, C_RIDGE_A, C_RIDGE_B] = [0, 1, 2, 3, 4, 5, 6, 7];
var SLOPE_PER_BLOCK = 0.15;
var LAVA_LEVEL = -54;
var SEA_LEVEL2 = 63;
var NO_FLUID = -2032;
var GLOBAL_LAVA = { level: LAVA_LEVEL, lava: true };
var GLOBAL_SEA = { level: SEA_LEVEL2, lava: false };
var globalFluid = (y) => y < Math.min(LAVA_LEVEL, SEA_LEVEL2) ? GLOBAL_LAVA : GLOBAL_SEA;
var fluidAt = (s, y) => y < s.level ? s.lava ? LAVA : WATER : AIR;
var similarity = (d1, d2) => 1 - (d2 - d1) / 25;
var SURFACE_OFFSETS = [
  [0, 0],
  [-2, -1],
  [-1, -1],
  [0, -1],
  [1, -1],
  [-3, 0],
  [-2, 0],
  [-1, 0],
  [1, 0],
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1]
];
var CARVERS = [
  { kind: "cave", probability: 0.15, yMin: MIN_Y + 8, yMax: 180 },
  { kind: "cave", probability: 0.07, yMin: MIN_Y + 8, yMax: 47 },
  { kind: "canyon", probability: 0.01, yMin: 10, yMax: 67 }
];
var CARVER_RANGE = 4;
var CARVE_SOURCES = 8;
var MAX_TUNNEL = 16 * (CARVER_RANGE * 2 - 1);
var CARVE_MAX_Y = MAX_Y - 1 - 7;

class CarverRandom {
  r;
  constructor(r) {
    this.r = r;
  }
  float() {
    return this.r.nextFloat();
  }
  int(n) {
    return n <= 0 ? 0 : this.r.nextInt(n);
  }
  between(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }
  uniform(lo, hi) {
    return lo + this.r.nextFloat() * (hi - lo);
  }
  trapezoid(min, max, plateau) {
    const range = max - min, d = (range - plateau) / 2, e = range - d;
    return min + this.r.nextFloat() * e + this.r.nextFloat() * d;
  }
  veryBiased(min, max) {
    const a = this.between(min + 1, max + 1);
    const b = this.between(min, a - 1);
    return this.between(min, b - 1 + 1);
  }
  seed() {
    return this.r.nextDouble() * 2147483647 | 0;
  }
}

class OverworldCaves {
  seed;
  host;
  n;
  corners = new Map;
  aquiferCells = new Map;
  surfaceCache = new Map;
  skipAboveCache = new Map;
  carverLists = new Map;
  carveMasks = new Map;
  constructor(seed, host) {
    this.seed = seed;
    this.host = host;
    const root = new NoiseRandom(seed ^ 212329766);
    const n = {};
    for (const k of Object.keys(NOISES3))
      n[k] = normalNoise(NOISES3[k], root.fork(k));
    this.n = n;
  }
  sample(k, x, y, z, xz, ys) {
    return this.n[k].get(x * xz, y * ys, z * xz);
  }
  spaghetti3d(k, rarity, x, y, z) {
    if (rarity < -0.5)
      return this.sample(k, x, y, z, 4 / 3, 4 / 3) * 0.75;
    if (rarity < 0)
      return this.sample(k, x, y, z, 1, 1);
    if (rarity < 0.5)
      return this.sample(k, x, y, z, 2 / 3, 2 / 3) * 1.5;
    return this.sample(k, x, y, z, 0.5, 0.5) * 2;
  }
  cornerValues(x, y, z) {
    const key = (x >> 2 & 1023) * 1048576 + (y - MIN_Y >> 3 & 1023) * 1024 + (z >> 2 & 1023);
    const cached = this.corners.get(key);
    if (cached && cached[8] === x && cached[9] === y && cached[10] === z)
      return cached;
    if (this.corners.size > 60000)
      this.corners.clear();
    const v = new Float32Array(COMPONENTS + 3);
    v[8] = x;
    v[9] = y;
    v[10] = z;
    const rough = (this.sample("spaghetti_roughness_modulator", x, y, z, 1, 1) * -0.05 - 0.05) * (Math.abs(this.sample("spaghetti_roughness", x, y, z, 1, 1)) - 0.4);
    const rarity = this.sample("spaghetti_3d_rarity", x, y, z, 2, 1);
    const s3d = clamp(Math.max(Math.abs(this.spaghetti3d("spaghetti_3d_1", rarity, x, y, z)), Math.abs(this.spaghetti3d("spaghetti_3d_2", rarity, x, y, z))) + (this.sample("spaghetti_3d_thickness", x, y, z, 1, 1) * -0.011500001 - 0.0765), -1, 1);
    v[C_ENTR] = Math.min(this.sample("cave_entrance", x, y, z, 0.75, 0.5) + 0.37 + gradient(y, -10, 0.3, 30, 0), rough + s3d);
    const layer = this.sample("cave_layer", x, y, z, 1, 8);
    v[C_CHEESE] = 4 * layer * layer + clamp(this.sample("cave_cheese", x, y, z, 1, 2 / 3) + 0.27, -1, 1);
    const mod = this.sample("spaghetti_2d_modulator", x, y, z, 2, 1);
    const s2 = mod < -0.75 ? this.sample("spaghetti_2d", x, y, z, 2, 2) * 0.5 : mod < -0.5 ? this.sample("spaghetti_2d", x, y, z, 4 / 3, 4 / 3) * 0.75 : mod < 0.5 ? this.sample("spaghetti_2d", x, y, z, 1, 1) : mod < 0.75 ? this.sample("spaghetti_2d", x, y, z, 0.5, 0.5) * 2 : this.sample("spaghetti_2d", x, y, z, 1 / 3, 1 / 3) * 3;
    const thick2d = this.sample("spaghetti_2d_thickness", x, y, z, 2, 1) * -0.34999996 - 0.95;
    const elev = Math.abs(this.sample("spaghetti_2d_elevation", x, 0, z, 1, 0) * 8 + gradient(y, -64, 8, 320, -40)) + thick2d;
    v[C_SPAG] = clamp(Math.max(Math.abs(s2) + thick2d * 0.083, elev * elev * elev), -1, 1) + rough;
    const pt = this.sample("pillar_thickness", x, y, z, 1, 1) * 0.55 + 0.55;
    v[C_PILLAR] = (this.sample("pillar", x, y, z, 25, 0.3) * 2 + (this.sample("pillar_rareness", x, y, z, 1, 1) * -1 - 1)) * pt * pt * pt;
    const inRange = y >= -60 && y < 321;
    v[C_TOGGLE] = inRange ? this.sample("noodle", x, y, z, 1, 1) : -1;
    v[C_THICK] = inRange ? this.sample("noodle_thickness", x, y, z, 1, 1) * -0.025 - 0.075 : 0;
    v[C_RIDGE_A] = inRange ? this.sample("noodle_ridge_a", x, y, z, 8 / 3, 8 / 3) : 0;
    v[C_RIDGE_B] = inRange ? this.sample("noodle_ridge_b", x, y, z, 8 / 3, 8 / 3) : 0;
    this.corners.set(key, v);
    return v;
  }
  scratch = new Float64Array(COMPONENTS);
  interpolate(c000, c100, c010, c110, c001, c101, c011, c111, fx, fy, fz, out) {
    for (let k = 0;k < COMPONENTS; k++) {
      out[k] = lerp3(fz, lerp3(fy, lerp3(fx, c000[k], c100[k]), lerp3(fx, c010[k], c110[k])), lerp3(fy, lerp3(fx, c001[k], c101[k]), lerp3(fx, c011[k], c111[k])));
    }
  }
  density(x, y, z, top) {
    const gx = Math.floor(x / CELL_XZ) * CELL_XZ, gz = Math.floor(z / CELL_XZ) * CELL_XZ;
    const gy = MIN_Y + Math.floor((y - MIN_Y) / CELL_Y) * CELL_Y;
    const cell = this.lastCell;
    if (cell.x !== gx || cell.y !== gy || cell.z !== gz) {
      cell.x = gx;
      cell.y = gy;
      cell.z = gz;
      const c = cell.c;
      c[0] = this.cornerValues(gx, gy, gz);
      c[1] = this.cornerValues(gx + CELL_XZ, gy, gz);
      c[2] = this.cornerValues(gx, gy + CELL_Y, gz);
      c[3] = this.cornerValues(gx + CELL_XZ, gy + CELL_Y, gz);
      c[4] = this.cornerValues(gx, gy, gz + CELL_XZ);
      c[5] = this.cornerValues(gx + CELL_XZ, gy, gz + CELL_XZ);
      c[6] = this.cornerValues(gx, gy + CELL_Y, gz + CELL_XZ);
      c[7] = this.cornerValues(gx + CELL_XZ, gy + CELL_Y, gz + CELL_XZ);
    }
    const c = cell.c;
    this.interpolate(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], (x - gx) / CELL_XZ, (y - gy) / CELL_Y, (z - gz) / CELL_XZ, this.scratch);
    return this.combine(y, top, this.scratch);
  }
  lastCell = { x: NaN, y: NaN, z: NaN, c: new Array(8) };
  combine(y, top, v) {
    const sloped = SLOPE_PER_BLOCK * (top + 1 - y);
    const entr = v[C_ENTR];
    let caves;
    if (sloped < 1.5625)
      caves = Math.min(sloped, 5 * entr);
    else {
      const cheese = v[C_CHEESE] + clamp(1.5 - 0.64 * sloped, 0, 0.5);
      const pillar = v[C_PILLAR];
      caves = Math.max(Math.min(Math.min(cheese, entr), v[C_SPAG]), pillar < 0.03 ? -1e6 : pillar);
    }
    const inner = lerp3(gradient(y, -64, 0, -40, 1), 0.1171875, lerp3(gradient(y, 240, 1, 256, 0), -0.078125, caves));
    const noodle = v[C_TOGGLE] < 0 ? 64 : v[C_THICK] + 1.5 * Math.max(Math.abs(v[C_RIDGE_A]), Math.abs(v[C_RIDGE_B]));
    return Math.min(squeeze(0.64 * inner), noodle);
  }
  carveChunk(cx, cz, blocks, tops, maxTop, grass, mycelium, dirt, uncarvable) {
    const x0 = cx * 16, z0 = cz * 16;
    const yTop = Math.min(maxTop, CARVE_MAX_Y);
    const ny = Math.floor((yTop - MIN_Y) / CELL_Y) + 2;
    const grid = new Array(25 * ny);
    for (let gy = 0;gy < ny; gy++) {
      for (let gz = 0;gz < 5; gz++) {
        for (let gx = 0;gx < 5; gx++)
          grid[(gy * 5 + gz) * 5 + gx] = this.cornerValues(x0 + gx * CELL_XZ, MIN_Y + gy * CELL_Y, z0 + gz * CELL_XZ);
      }
    }
    const mask = this.carveMask(cx, cz);
    const v = this.scratch;
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        const gx = lx >> 2, gz = lz >> 2, fx = (lx & 3) / CELL_XZ, fz = (lz & 3) / CELL_XZ;
        let hasGrass = false;
        for (let y = Math.min(top, yTop);y > MIN_Y; y--) {
          const i = y - MIN_Y << 8 | lz << 4 | lx;
          const b = blocks[i];
          if (b === AIR || uncarvable(b))
            continue;
          const gy = y - MIN_Y >> 3;
          const b0 = (gy * 5 + gz) * 5 + gx, b1 = b0 + 25;
          this.interpolate(grid[b0], grid[b0 + 1], grid[b1], grid[b1 + 1], grid[b0 + 5], grid[b0 + 6], grid[b1 + 5], grid[b1 + 6], fx, (y - MIN_Y & 7) / CELL_Y, fz, v);
          const d = this.combine(y, top, v);
          const sub = d <= 0 ? this.substance(x0 + lx, y, z0 + lz, d) : mask[i] ? this.substance(x0 + lx, y, z0 + lz, 0) : -1;
          if (sub < 0)
            continue;
          if (b === grass || b === mycelium)
            hasGrass = true;
          blocks[i] = sub;
          if (hasGrass && sub === AIR && y - 1 > MIN_Y && blocks[i - 256] === dirt)
            blocks[i - 256] = grass;
        }
      }
    }
  }
  surfaceLevel(x, z) {
    const qx = x & ~3, qz = z & ~3;
    const key = (qx & 65535) * 65536 + (qz & 65535);
    let v = this.surfaceCache.get(key);
    if (v === undefined) {
      if (this.surfaceCache.size > 40000)
        this.surfaceCache.clear();
      v = Math.floor(this.host.preliminarySurface(qx, qz));
      this.surfaceCache.set(key, v);
    }
    return v;
  }
  skipAbove(cx, cz) {
    const key = (cx & 65535) * 65536 + (cz & 65535);
    let v = this.skipAboveCache.get(key);
    if (v !== undefined)
      return v;
    if (this.skipAboveCache.size > 4000)
      this.skipAboveCache.clear();
    const minGX = cx * 16 - 5 >> 4, maxGX = (cx * 16 + 15 - 5 >> 4) + 1;
    const minGZ = cz * 16 - 5 >> 4, maxGZ = (cz * 16 + 15 - 5 >> 4) + 1;
    let maxS = -1e9;
    for (let x = minGX << 4 & ~3;x <= (maxGX << 4) + 9; x += 4) {
      for (let z = minGZ << 4 & ~3;z <= (maxGZ << 4) + 9; z += 4)
        maxS = Math.max(maxS, this.surfaceLevel(x, z));
    }
    const gridY = Math.floor((maxS + 8 + 12) / 12) + 1;
    v = gridY * 12 + 11 - 1;
    this.skipAboveCache.set(key, v);
    return v;
  }
  aquiferCell(gx, gy, gz) {
    const key = ((gx & 2047) * 2048 + (gz & 2047)) * 256 + (gy & 255);
    let c = this.aquiferCells.get(key);
    if (c && c.gx === gx && c.gy === gy && c.gz === gz)
      return c;
    if (this.aquiferCells.size > 40000)
      this.aquiferCells.clear();
    const r = new NoiseRandom(hash3(gx, gy, gz, this.seed ^ 11137509));
    c = { gx, gy, gz, x: (gx << 4) + r.nextInt(10), y: gy * 12 + r.nextInt(9), z: (gz << 4) + r.nextInt(10), status: null };
    this.aquiferCells.set(key, c);
    return c;
  }
  statusOf(c) {
    return c.status ??= this.computeFluid(c.x, c.y, c.z);
  }
  computeFluid(x, y, z) {
    const global = globalFluid(y);
    let lowest = Number.MAX_SAFE_INTEGER;
    const top = y + 12, bottom = y - 12;
    let centerUnder = false;
    for (const [ox, oz] of SURFACE_OFFSETS) {
      const sx = x + ox * 16, sz = z + oz * 16;
      const surface = this.surfaceLevel(sx, sz);
      const adjusted = surface + 8;
      const start = ox === 0 && oz === 0;
      if (start && bottom > adjusted)
        return global;
      const pokes = top > adjusted;
      if (pokes || start) {
        const atSurface = globalFluid(adjusted);
        if (fluidAt(atSurface, adjusted) !== AIR) {
          if (start)
            centerUnder = true;
          if (pokes)
            return atSurface;
        }
      }
      lowest = Math.min(lowest, surface);
    }
    const level = this.fluidSurfaceLevel(x, y, z, global, lowest, centerUnder);
    return { level, lava: this.fluidIsLava(x, y, z, global, level) };
  }
  fluidSurfaceLevel(x, y, z, global, lowest, centerUnder) {
    let partial, full;
    const depth = (this.surfaceLevel(x, z) - y) / 128;
    if (this.host.mountainAt(x, z) > 0.6 && depth > 0.9) {
      partial = full = -1;
    } else {
      const below = lowest + 8 - y;
      const factor = centerUnder ? clamp(1 - below / 64, 0, 1) : 0;
      const flood = clamp(this.sample("aquifer_fluid_level_floodedness", x, y, z, 1, 0.67), -1, 1);
      const fullThreshold = lerp3(1 - factor, -0.3, 0.8);
      const partialThreshold = lerp3(1 - factor, -0.8, 0.4);
      partial = flood - partialThreshold;
      full = flood - fullThreshold;
    }
    if (full > 0)
      return global.level;
    if (partial > 0) {
      const cx = Math.floor(x / 16), cy = Math.floor(y / 40), cz = Math.floor(z / 16);
      const spread = this.sample("aquifer_fluid_level_spread", cx, cy, cz, 1, 0.7142857142857143) * 10;
      return Math.min(lowest, cy * 40 + 20 + Math.floor(spread / 3) * 3);
    }
    return NO_FLUID;
  }
  fluidIsLava(x, y, z, global, level) {
    if (level <= -10 && level !== NO_FLUID && !global.lava) {
      const v = this.sample("aquifer_lava", Math.floor(x / 64), Math.floor(y / 40), Math.floor(z / 64), 1, 1);
      if (Math.abs(v) > 0.3)
        return true;
    }
    return global.lava;
  }
  pressure(x, y, z, barrier, a, b) {
    const ta = fluidAt(a, y), tb = fluidAt(b, y);
    if (ta === LAVA && tb === WATER || ta === WATER && tb === LAVA)
      return 2;
    const diff = Math.abs(a.level - b.level);
    if (diff === 0)
      return 0;
    const avg = 0.5 * (a.level + b.level);
    const above = y + 0.5 - avg;
    const toMiddle = diff / 2 - Math.abs(above);
    let g;
    if (above > 0)
      g = toMiddle > 0 ? toMiddle / 1.5 : toMiddle / 2.5;
    else {
      const c = 3 + toMiddle;
      g = c > 0 ? c / 3 : c / 10;
    }
    let noise = 0;
    if (g >= -2 && g <= 2) {
      if (Number.isNaN(barrier.v))
        barrier.v = this.sample("aquifer_barrier", x, y, z, 1, 0.5);
      noise = barrier.v;
    }
    return 2 * (noise + g);
  }
  substance(x, y, z, density) {
    if (density > 0)
      return -1;
    const global = globalFluid(y);
    if (y > this.skipAbove(Math.floor(x / 16), Math.floor(z / 16)))
      return fluidAt(global, y);
    if (fluidAt(global, y) === LAVA)
      return LAVA;
    const ax = x - 5 >> 4, ay = Math.floor((y + 1) / 12), az = z - 5 >> 4;
    let d1 = Infinity, d2 = Infinity, d3 = Infinity, d4 = Infinity;
    let c1, c2, c3, c4;
    for (let dx = 0;dx <= 1; dx++) {
      for (let dy = -1;dy <= 1; dy++) {
        for (let dz = 0;dz <= 1; dz++) {
          const c = this.aquiferCell(ax + dx, ay + dy, az + dz);
          const ex = c.x - x, ey = c.y - y, ez = c.z - z;
          const d = ex * ex + ey * ey + ez * ez;
          if (d1 >= d) {
            c4 = c3;
            c3 = c2;
            c2 = c1;
            c1 = c;
            d4 = d3;
            d3 = d2;
            d2 = d1;
            d1 = d;
          } else if (d2 >= d) {
            c4 = c3;
            c3 = c2;
            c2 = c;
            d4 = d3;
            d3 = d2;
            d2 = d;
          } else if (d3 >= d) {
            c4 = c3;
            c3 = c;
            d4 = d3;
            d3 = d;
          } else if (d4 >= d) {
            c4 = c;
            d4 = d;
          }
        }
      }
    }
    const s1 = this.statusOf(c1);
    const sim12 = similarity(d1, d2);
    const fluid = fluidAt(s1, y);
    if (sim12 <= 0)
      return fluid;
    if (fluid === WATER && fluidAt(globalFluid(y - 1), y - 1) === LAVA)
      return fluid;
    const barrier = this.barrierCell;
    barrier.v = NaN;
    const s2 = this.statusOf(c2);
    if (density + sim12 * this.pressure(x, y, z, barrier, s1, s2) > 0)
      return -1;
    const s3 = this.statusOf(c3);
    const sim13 = similarity(d1, d3);
    if (sim13 > 0 && density + sim12 * sim13 * this.pressure(x, y, z, barrier, s1, s3) > 0)
      return -1;
    const sim23 = similarity(d2, d3);
    if (sim23 > 0 && density + sim12 * sim23 * this.pressure(x, y, z, barrier, s2, s3) > 0)
      return -1;
    return fluid;
  }
  barrierCell = { v: NaN };
  carverFrom(index, sx, sz) {
    const key = `${index},${sx},${sz}`;
    let list = this.carverLists.get(key);
    if (list)
      return list;
    if (this.carverLists.size > 20000)
      this.carverLists.clear();
    list = [];
    const cfg = CARVERS[index];
    const r = new CarverRandom(new NoiseRandom(hash3(sx, index, sz, this.seed ^ 379470)));
    if (r.float() <= cfg.probability) {
      if (cfg.kind === "cave")
        this.caveCarver(r, cfg, sx, sz, list);
      else
        this.canyonCarver(r, cfg, sx, sz, list);
    }
    this.carverLists.set(key, list);
    return list;
  }
  caveCarver(r, cfg, sx, sz, out) {
    const count = r.veryBiased(0, 14);
    for (let cave = 0;cave < count; cave++) {
      const x = sx * 16 + r.int(16);
      const y = r.between(cfg.yMin, cfg.yMax);
      const z = sz * 16 + r.int(16);
      const hMul = r.uniform(0.7, 1.4);
      const vMul = r.uniform(0.8, 1.3);
      const floor = r.uniform(-1, -0.4);
      let tunnels = 1;
      if (r.int(4) === 0) {
        const yScale = r.uniform(0.1, 0.9);
        const thickness = 1 + r.float() * 6;
        const hr = 1.5 + thickness;
        out.push({ x: x + 1, y, z, hr, vr: hr * yScale, floor, widths: null });
        tunnels += r.int(4);
      }
      for (let i = 0;i < tunnels; i++) {
        const yaw = r.float() * Math.PI * 2;
        const pitch = (r.float() - 0.5) / 4;
        let thickness = r.trapezoid(0, 3, 1);
        if (r.int(10) === 0)
          thickness *= r.float() * r.float() * 3 + 1;
        const dist = MAX_TUNNEL - r.int(MAX_TUNNEL / 4);
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, thickness, yaw, pitch, 0, dist, 1, floor);
      }
    }
  }
  caveTunnel(out, tseed, x, y, z, hMul, vMul, thickness, yaw, pitch, step, dist, yScale, floor) {
    const r = new CarverRandom(new NoiseRandom(tseed));
    const split = r.int(dist >> 1) + (dist >> 2);
    const steep = r.int(6) === 0;
    let yRota = 0, xRota = 0;
    for (let s = step;s < dist; s++) {
      const hr = 1.5 + Math.sin(Math.PI * s / dist) * thickness;
      const vr = hr * yScale;
      const cosX = Math.cos(pitch);
      x += Math.cos(yaw) * cosX;
      y += Math.sin(pitch);
      z += Math.sin(yaw) * cosX;
      pitch *= steep ? 0.92 : 0.7;
      pitch += xRota * 0.1;
      yaw += yRota * 0.1;
      xRota *= 0.9;
      yRota *= 0.75;
      xRota += (r.float() - r.float()) * r.float() * 2;
      yRota += (r.float() - r.float()) * r.float() * 4;
      if (s === split && thickness > 1) {
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, r.float() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, s, dist, 1, floor);
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, r.float() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, s, dist, 1, floor);
        return;
      }
      if (r.int(4) !== 0)
        out.push({ x, y, z, hr: hr * hMul, vr: vr * vMul, floor, widths: null });
    }
  }
  canyonCarver(r, cfg, sx, sz, out) {
    const x = sx * 16 + r.int(16);
    const y = r.between(cfg.yMin, cfg.yMax);
    const z = sz * 16 + r.int(16);
    let yaw = r.float() * Math.PI * 2;
    let pitch = r.uniform(-0.125, 0.125);
    const yScale = 3;
    const thickness = r.trapezoid(0, 6, 2);
    const dist = Math.floor(MAX_TUNNEL * r.uniform(0.75, 1));
    const t = new CarverRandom(new NoiseRandom(r.seed()));
    const widths = new Float32Array(MAX_Y - MIN_Y);
    let w = 1;
    for (let i = 0;i < widths.length; i++) {
      if (i === 0 || t.int(3) === 0)
        w = 1 + t.float() * t.float();
      widths[i] = w * w;
    }
    let yRota = 0, xRota = 0;
    let px = x, py = y, pz = z;
    for (let s = 0;s < dist; s++) {
      let hr = 1.5 + Math.sin(s * Math.PI / dist) * thickness;
      let vr = hr * yScale;
      hr *= t.uniform(0.75, 1);
      vr = vr * (0.75 + t.float() * 0.25);
      const xc = Math.cos(pitch), xs = Math.sin(pitch);
      px += Math.cos(yaw) * xc;
      py += xs;
      pz += Math.sin(yaw) * xc;
      pitch *= 0.7;
      pitch += xRota * 0.05;
      yaw += yRota * 0.05;
      xRota *= 0.8;
      yRota *= 0.5;
      xRota += (t.float() - t.float()) * t.float() * 2;
      yRota += (t.float() - t.float()) * t.float() * 4;
      if (t.int(4) !== 0)
        out.push({ x: px, y: py, z: pz, hr, vr, floor: -2, widths });
    }
  }
  carveMask(cx, cz) {
    const key = (cx & 65535) * 65536 + (cz & 65535);
    let mask = this.carveMasks.get(key);
    if (mask)
      return mask;
    if (this.carveMasks.size > 48)
      this.carveMasks.clear();
    mask = new Uint8Array(16 * 16 * (MAX_Y - MIN_Y));
    const x0 = cx * 16, z0 = cz * 16;
    for (let dz = -CARVE_SOURCES;dz <= CARVE_SOURCES; dz++) {
      for (let dx = -CARVE_SOURCES;dx <= CARVE_SOURCES; dx++) {
        for (let i = 0;i < CARVERS.length; i++) {
          for (const e of this.carverFrom(i, cx + dx, cz + dz))
            this.rasterize(e, x0, z0, mask);
        }
      }
    }
    this.carveMasks.set(key, mask);
    return mask;
  }
  rasterize(e, x0, z0, mask) {
    const maxDelta = 16 + e.hr * 2;
    if (Math.abs(e.x - (x0 + 8)) > maxDelta || Math.abs(e.z - (z0 + 8)) > maxDelta)
      return;
    const minX = Math.max(Math.floor(e.x - e.hr) - x0 - 1, 0), maxX = Math.min(Math.floor(e.x + e.hr) - x0, 15);
    const minZ = Math.max(Math.floor(e.z - e.hr) - z0 - 1, 0), maxZ = Math.min(Math.floor(e.z + e.hr) - z0, 15);
    const minY = Math.max(Math.floor(e.y - e.vr) - 1, MIN_Y + 1), maxY = Math.min(Math.floor(e.y + e.vr) + 1, CARVE_MAX_Y);
    for (let lx = minX;lx <= maxX; lx++) {
      const xd = (x0 + lx + 0.5 - e.x) / e.hr;
      for (let lz = minZ;lz <= maxZ; lz++) {
        const zd = (z0 + lz + 0.5 - e.z) / e.hr;
        const h2 = xd * xd + zd * zd;
        if (h2 >= 1)
          continue;
        for (let y = maxY;y > minY; y--) {
          const yd = (y - 0.5 - e.y) / e.vr;
          if (e.widths) {
            if (h2 * e.widths[y - MIN_Y - 1] + yd * yd / 6 >= 1)
              continue;
          } else if (yd <= e.floor || h2 + yd * yd >= 1)
            continue;
          mask[y - MIN_Y << 8 | lz << 4 | lx] = 1;
        }
      }
    }
  }
  substanceAt(x, y, z) {
    const top = this.host.topAt(x, z);
    if (y > top)
      return -1;
    const d = this.density(x, y, z, top);
    if (d <= 0)
      return this.substance(x, y, z, d);
    const mask = this.carveMask(Math.floor(x / 16), Math.floor(z / 16));
    if (y > MIN_Y && y <= CARVE_MAX_Y && mask[y - MIN_Y << 8 | (z & 15) << 4 | x & 15])
      return this.substance(x, y, z, 0);
    return -1;
  }
  noiseCaveAt(x, y, z) {
    return this.density(x, y, z, this.host.topAt(x, z)) <= 0;
  }
}
// goodPG/src/shared/world/terrain.ts
var TREE_DENSITY = [
  0,
  0,
  0,
  0.035,
  0.55,
  0.5,
  0.42,
  0.3,
  0.05,
  0.1,
  0.06,
  0,
  0.16,
  0.85,
  0.8,
  0.03,
  0.035,
  0.16,
  0.012,
  0.03,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0,
  0.02,
  0.28,
  0.55,
  0.03,
  0.34,
  0.3,
  0,
  0,
  0,
  0.012,
  0.5,
  0.55,
  0.18,
  0.2,
  0.07,
  0.14,
  0.08,
  0.07,
  0.5,
  0,
  0
];
var BIOME_GRASS = {
  [BIOME_SWAMP]: [106, 112, 57],
  [BIOME_JUNGLE]: [89, 196, 60],
  [BIOME_DARK_FOREST]: [80, 122, 50],
  [BIOME_BADLANDS]: [144, 129, 77],
  [BIOME_MUSHROOM_FIELDS]: [85, 190, 63],
  [BIOME_CHERRY_GROVE]: [182, 219, 97],
  [BIOME_MEADOW]: [131, 187, 109],
  [BIOME_MANGROVE_SWAMP]: [120, 142, 52],
  [BIOME_ERODED_BADLANDS]: [144, 129, 77],
  [BIOME_WOODED_BADLANDS]: [144, 129, 77],
  [BIOME_SPARSE_JUNGLE]: [110, 190, 70],
  [BIOME_BAMBOO_JUNGLE]: [89, 196, 60]
};
var BANDS = [
  [TERRACOTTA, 34],
  [COLORED_TERRACOTTA.orange, 20],
  [COLORED_TERRACOTTA.yellow, 10],
  [COLORED_TERRACOTTA.brown, 10],
  [COLORED_TERRACOTTA.red, 10],
  [COLORED_TERRACOTTA.white, 7],
  [COLORED_TERRACOTTA.light_gray, 9]
];
var BAND_TOTAL = BANDS.reduce((a, [, w]) => a + w, 0);

class TerrainGenerator {
  seed;
  nCont;
  nEro;
  nPeaks;
  nTemp;
  nHumid;
  nDetail;
  nDensity;
  nCaveA;
  nCaveB;
  nCheese;
  nSurface;
  nFlowers;
  nEntrance;
  nWeird;
  nMush;
  nLush;
  nDrip;
  nAquifer;
  info = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
  caves;
  caveInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
  topCache = new Map;
  constructor(seed) {
    this.seed = seed | 0;
    const r = mulberry32(seed);
    const s = () => Math.floor(r() * 2147483647);
    this.nCont = new Simplex(s());
    this.nEro = new Simplex(s());
    this.nPeaks = new Simplex(s());
    this.nTemp = new Simplex(s());
    this.nHumid = new Simplex(s());
    this.nDetail = new Simplex(s());
    this.nDensity = new Simplex(s());
    this.nCaveA = new Simplex(s());
    this.nCaveB = new Simplex(s());
    this.nCheese = new Simplex(s());
    this.nSurface = new Simplex(s());
    this.nFlowers = new Simplex(s());
    this.nEntrance = new Simplex(s());
    this.nWeird = new Simplex(s());
    this.nMush = new Simplex(s());
    this.nLush = new Simplex(s());
    this.nDrip = new Simplex(s());
    this.nAquifer = new Simplex(s());
    this.caves = new OverworldCaves(this.seed, {
      topAt: (x, z) => this.columnTop(x, z),
      preliminarySurface: (x, z) => this.columnInfo(x, z, this.caveInfo).height,
      mountainAt: (x, z) => this.columnInfo(x, z, this.caveInfo).mount
    });
  }
  columnTop(x, z) {
    const key = (x & 65535) * 65536 + (z & 65535);
    let t = this.topCache.get(key);
    if (t === undefined) {
      if (this.topCache.size > 50000)
        this.topCache.clear();
      const inf = this.columnInfo(x, z, { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 });
      t = this.surfaceAt(x, z, inf);
      this.topCache.set(key, t);
    }
    return t;
  }
  rockAt(x, y, z) {
    if (y < 0)
      return DEEPSLATE;
    if (y >= 8)
      return STONE;
    return hashToFloat(hash3(x, y, z, this.seed ^ 57065)) < (8 - y) / 8 ? DEEPSLATE : STONE;
  }
  caveBiomeAt(x, z) {
    if (deepDarkColumn(this, x, z))
      return 3;
    if (this.nLush.noise2(x / 240, z / 240) > 0.4)
      return 1;
    if (this.nDrip.noise2(x / 240 + 31.7, z / 240 - 12.1) > 0.42)
      return 2;
    return 0;
  }
  columnInfo(x, z, out = this.info) {
    const wx = x + this.nDetail.noise2(x / 400, z / 400) * 60;
    const wz = z + this.nDetail.noise2(x / 400 + 71.3, z / 400 - 33.1) * 60;
    const c = this.nCont.fbm2(wx / 1500, wz / 1500, 5) * 1.6 + 0.14;
    const e = this.nEro.fbm2(wx / 750, wz / 750, 4) * 1.5;
    const pv = this.nPeaks.ridged2(wx / 420, wz / 420, 5);
    const base = spline([-1.2, 28, -0.6, 36, -0.32, 48, -0.16, 58, -0.08, 63, 0, 66, 0.2, 70, 0.45, 76, 1, 88], c);
    const mount = smoothstep(0.02, 0.42, c) * smoothstep(0.3, -0.32, e);
    const hillAmp = 3 + 9 * smoothstep(-0.1, 0.5, -e) * smoothstep(-0.2, 0.1, c);
    const hills = this.nDetail.fbm2(x / 110, z / 110, 4) * hillAmp;
    const peaks = pv * pv * 105 + pv * 12;
    let height = base + mount * peaks + hills;
    const river = 1 - Math.abs(this.nEro.noise2(wx / 900 + 400, wz / 900 - 300));
    const riverCut = smoothstep(0.94, 0.985, river) * smoothstep(-0.1, 0.15, c) * (1 - mount);
    height = lerp(height, Math.min(height, SEA_LEVEL - 3), riverCut);
    const tempBase = this.nTemp.fbm2(x / 1700, z / 1700, 3) * 1.45;
    const humid = this.nHumid.fbm2(x / 1300 + 500, z / 1300 - 500, 3) * 1.5;
    const weird = this.nWeird.fbm2(x / 520, z / 520, 2);
    const mush = smoothstep(0.55, 0.68, this.nMush.noise2(x / 380, z / 380)) * smoothstep(-0.42, -0.62, c);
    if (mush > 0)
      height = lerp(height, SEA_LEVEL + 2 + hills * 0.4 + 3 * mush, mush);
    const swamp = smoothstep(0.28, 0.48, humid) * smoothstep(-0.32, -0.18, tempBase) * smoothstep(0.42, 0.3, tempBase) * smoothstep(0.25, 0.1, mount) * smoothstep(SEA_LEVEL + 9, SEA_LEVEL + 3, height) * smoothstep(-0.1, 0.05, c);
    if (swamp > 0)
      height = lerp(height, SEA_LEVEL - 0.6 + this.nDetail.noise2(x / 18, z / 18) * 1.6, swamp);
    const mesa = smoothstep(0.35, 0.5, tempBase) * smoothstep(0, -0.15, humid) * smoothstep(0.1, 0.25, weird) * smoothstep(0.05, 0.2, c);
    if (mesa > 0) {
      const plateau = Math.max(0, this.nDetail.fbm2(x / 140 + 50, z / 140, 3)) * 48;
      height += mesa * Math.floor(plateau / 6) * 6;
    }
    const altCool = height > 100 ? (height - 100) / 140 : 0;
    const temp = tempBase - altCool;
    out.height = height;
    out.amp = 2.5 + 26 * mount * mount + 4 * mount;
    out.temp = temp;
    out.humid = humid;
    out.mount = mount;
    out.cont = c;
    out.biome = this.pickBiome(height, temp, humid, mount, c, weird, swamp, mush, mesa, riverCut);
    return out;
  }
  pickBiome(h, t, hu, m, c, weird, swamp, mush, mesa, river = 0) {
    if (mush > 0.5 && h >= SEA_LEVEL - 1.5)
      return BIOME_MUSHROOM_FIELDS;
    if (swamp > 0.5 && h > SEA_LEVEL - 4)
      return t > 0.22 ? BIOME_MANGROVE_SWAMP : BIOME_SWAMP;
    if (river > 0.5 && h < SEA_LEVEL + 1)
      return t < -0.58 ? BIOME_FROZEN_RIVER : BIOME_RIVER;
    if (h < SEA_LEVEL - 1.5) {
      const deep = h < 44;
      if (t < -0.58)
        return deep ? BIOME_DEEP_FROZEN_OCEAN : BIOME_FROZEN_OCEAN;
      if (t < -0.3)
        return deep ? BIOME_DEEP_COLD_OCEAN : BIOME_COLD_OCEAN;
      if (t > 0.42)
        return deep ? BIOME_DEEP_LUKEWARM_OCEAN : BIOME_WARM_OCEAN;
      if (t > 0.2)
        return deep ? BIOME_DEEP_LUKEWARM_OCEAN : BIOME_LUKEWARM_OCEAN;
      return deep ? BIOME_DEEP_OCEAN : BIOME_OCEAN;
    }
    if (m > 0.45 && h > 105) {
      if (h > 132)
        return t < -0.2 ? weird > 0 ? BIOME_JAGGED_PEAKS : BIOME_FROZEN_PEAKS : BIOME_STONY_PEAKS;
      if (t < -0.35)
        return hu > 0.1 ? BIOME_GROVE : BIOME_SNOWY_PEAKS;
      return weird < -0.3 ? BIOME_WINDSWEPT_GRAVELLY_HILLS : hu > 0.2 ? BIOME_WINDSWEPT_FOREST : BIOME_MOUNTAINS;
    }
    if (m > 0.2 && h > 84 && t > -0.26 && t < 0.38)
      return weird > 0.2 ? BIOME_CHERRY_GROVE : BIOME_MEADOW;
    if (h < SEA_LEVEL + 2.5 && c < 0.12 && m < 0.25) {
      if (t < -0.58)
        return BIOME_SNOWY_BEACH;
      if (weird < -0.45)
        return BIOME_STONY_SHORE;
      return t > 0.35 && hu < 0 ? BIOME_DESERT : BIOME_BEACH;
    }
    if (t < -0.58)
      return weird > 0.35 ? BIOME_ICE_SPIKES : hu < 0 ? BIOME_SNOWY_PLAINS : BIOME_SNOWY;
    if (t < -0.26) {
      if (hu > 0.35)
        return BIOME_OLD_GROWTH_SPRUCE_TAIGA;
      if (weird > 0.4)
        return BIOME_OLD_GROWTH_PINE_TAIGA;
      return BIOME_TAIGA;
    }
    if (t > 0.38) {
      if (hu > 0.3)
        return weird > 0.3 ? BIOME_BAMBOO_JUNGLE : hu < 0.4 ? BIOME_SPARSE_JUNGLE : BIOME_JUNGLE;
      if (hu < 0.05) {
        if (mesa > 0.5)
          return h > 90 ? BIOME_WOODED_BADLANDS : weird > 0.45 ? BIOME_ERODED_BADLANDS : BIOME_BADLANDS;
        return BIOME_DESERT;
      }
      if (m > 0.3)
        return BIOME_WINDSWEPT_SAVANNA;
      return h > 82 ? BIOME_SAVANNA_PLATEAU : BIOME_SAVANNA;
    }
    if (hu > 0.1) {
      if (hu > 0.42 && t > -0.1)
        return BIOME_DARK_FOREST;
      if (t < 0.05 && hu > 0.32)
        return weird > 0.3 ? BIOME_OLD_GROWTH_BIRCH_FOREST : BIOME_BIRCH_FOREST;
      return weird > 0.45 ? BIOME_FLOWER_FOREST : BIOME_FOREST;
    }
    return weird > 0.45 ? BIOME_SUNFLOWER_PLAINS : BIOME_PLAINS;
  }
  biomeAt(x, z) {
    return this.columnInfo(x, z).biome;
  }
  solidAt(x, y, z, h, amp) {
    if (y < h - amp)
      return true;
    if (y > h + amp)
      return false;
    let n = this.nDensity.fbm3(x / 56, y / 38, z / 56, 2);
    if (n > 0 && y > h)
      n *= 1 - Math.min(1, (y - h) / (amp * 0.8));
    return h - y + amp * n > 0;
  }
  surfaceAt(x, z, info) {
    const top = Math.min(MAX_Y - 8, Math.ceil(info.height + info.amp));
    const bottom = Math.max(MIN_Y + 1, Math.floor(info.height - info.amp));
    for (let y = top;y >= bottom; y--) {
      if (this.solidAt(x, y, z, info.height, info.amp))
        return y;
    }
    return bottom - 1;
  }
  caveAt(x, y, z) {
    return this.caves.noiseCaveAt(x, y, z);
  }
  static grassColor(temp, humid, out) {
    const T = clamp01(temp * 0.6 + 0.5);
    const H = clamp01(humid * 0.6 + 0.5);
    const cold = [124, 178, 150];
    const tr = lerp(172, 92, H), tg = lerp(192, 184, H), tb = lerp(92, 70, H);
    const hr = lerp(196, 82, H), hg = lerp(182, 196, H), hb = lerp(84, 56, H);
    const kc = smoothstep(0.12, 0.32, T);
    const kh = smoothstep(0.55, 0.82, T);
    const r = lerp(cold[0], lerp(tr, hr, kh), kc);
    const g = lerp(cold[1], lerp(tg, hg, kh), kc);
    const b = lerp(cold[2], lerp(tb, hb, kh), kc);
    out[0] = r;
    out[1] = g;
    out[2] = b;
    return out;
  }
  static biomeGrass(inf, out) {
    TerrainGenerator.grassColor(inf.temp, inf.humid, out);
    const g = BIOME_GRASS[inf.biome];
    if (g)
      for (let k = 0;k < 3; k++)
        out[k] = lerp(out[k], g[k], 0.75);
    return out;
  }
  bandAt(x, y, z) {
    const wobble = Math.round(this.nSurface.noise2(x / 70, z / 70) * 2);
    let h = hash2(Math.floor((y + wobble) / 2), 0, this.seed ^ 47741) % BAND_TOTAL;
    for (const [id, w] of BANDS) {
      if (h < w)
        return id;
      h -= w;
    }
    return TERRACOTTA;
  }
  surfaceRules(x, z, biome, top, slope, out) {
    const sn = this.nSurface.noise2(x / 24, z / 24);
    const depth = 3 + Math.floor((sn + 1) * 1.5);
    const underwater = top < SEA_LEVEL - 1;
    let topBlock = GRASS;
    let filler = DIRT;
    let deep = -1;
    switch (biome) {
      case BIOME_DESERT:
        topBlock = SAND;
        filler = SAND;
        deep = SANDSTONE;
        break;
      case BIOME_BEACH:
      case BIOME_SNOWY_BEACH:
        topBlock = SAND;
        filler = SAND;
        deep = SANDSTONE;
        if (slope > 3.5) {
          topBlock = STONE;
          filler = STONE;
          deep = -1;
        }
        break;
      case BIOME_STONY_SHORE:
        topBlock = sn < -0.35 ? GRAVEL : STONE;
        filler = topBlock;
        break;
      case BIOME_RIVER:
      case BIOME_FROZEN_RIVER:
        topBlock = sn > 0.45 ? CLAY : sn < -0.35 ? GRAVEL : SAND;
        filler = topBlock === CLAY ? CLAY : topBlock;
        break;
      case BIOME_WINDSWEPT_GRAVELLY_HILLS:
        if (slope > 4.5) {
          topBlock = STONE;
          filler = STONE;
        } else {
          topBlock = GRAVEL;
          filler = GRAVEL;
        }
        break;
      case BIOME_GROVE:
        topBlock = sn > 0.35 ? SNOW_BLOCK : SNOWY_GRASS;
        break;
      case BIOME_FROZEN_PEAKS:
        topBlock = sn > 0.1 ? PACKED_ICE : sn < -0.45 ? ICE : SNOW_BLOCK;
        filler = topBlock === ICE ? PACKED_ICE : topBlock;
        break;
      case BIOME_JAGGED_PEAKS:
        if (slope > 6) {
          topBlock = STONE;
          filler = STONE;
        } else {
          topBlock = SNOW_BLOCK;
          filler = SNOW_BLOCK;
        }
        break;
      case BIOME_STONY_PEAKS:
        topBlock = sn > 0.4 ? CALCITE : STONE;
        filler = STONE;
        break;
      case BIOME_SNOWY_PLAINS:
        topBlock = SNOWY_GRASS;
        break;
      case BIOME_BAMBOO_JUNGLE:
        if (sn > 0.25)
          topBlock = PODZOL;
        break;
      case BIOME_WINDSWEPT_SAVANNA:
        topBlock = sn > 0.3 ? COARSE_DIRT : sn < -0.3 || slope > 4 ? STONE : GRASS;
        filler = topBlock === STONE ? STONE : DIRT;
        break;
      case BIOME_WOODED_BADLANDS:
        if (top > 88 && slope <= 3) {
          out[0] = sn > 0 ? GRASS : COARSE_DIRT;
          out[1] = DIRT;
          out[2] = -1;
          out[3] = 2;
          return out;
        }
        if (slope > 3) {
          topBlock = STONE;
          filler = STONE;
        } else {
          topBlock = RED_SAND;
          filler = RED_SAND;
        }
        out[0] = topBlock;
        out[1] = filler;
        out[2] = -1;
        out[3] = 2;
        return out;
      case BIOME_OCEAN:
      case BIOME_FROZEN_OCEAN:
      case BIOME_DEEP_OCEAN:
      case BIOME_WARM_OCEAN:
      case BIOME_COLD_OCEAN:
      case BIOME_LUKEWARM_OCEAN:
      case BIOME_DEEP_LUKEWARM_OCEAN:
      case BIOME_DEEP_COLD_OCEAN:
      case BIOME_DEEP_FROZEN_OCEAN: {
        const deepWater = SEA_LEVEL - top;
        topBlock = deepWater > 9 ? GRAVEL : SAND;
        if (sn > 0.55)
          topBlock = CLAY;
        else if (sn < -0.6)
          topBlock = GRAVEL;
        if (biome === BIOME_WARM_OCEAN || biome === BIOME_LUKEWARM_OCEAN || biome === BIOME_DEEP_LUKEWARM_OCEAN)
          topBlock = SAND;
        else if ((biome === BIOME_COLD_OCEAN || biome === BIOME_DEEP_COLD_OCEAN || biome === BIOME_DEEP_FROZEN_OCEAN) && sn < 0.3)
          topBlock = GRAVEL;
        filler = topBlock;
        break;
      }
      case BIOME_ERODED_BADLANDS:
      case BIOME_BADLANDS:
        if (slope > (biome === BIOME_ERODED_BADLANDS ? 1.5 : 3)) {
          topBlock = STONE;
          filler = STONE;
        } else {
          topBlock = RED_SAND;
          filler = RED_SAND;
        }
        out[3] = 2;
        out[0] = topBlock;
        out[1] = filler;
        out[2] = -1;
        return out;
      case BIOME_MUSHROOM_FIELDS:
        topBlock = MYCELIUM;
        break;
      case BIOME_ICE_SPIKES:
        topBlock = SNOW_BLOCK;
        break;
      case BIOME_SNOWY:
        topBlock = SNOWY_GRASS;
        break;
      case BIOME_SNOWY_PEAKS:
        if (slope > 5) {
          topBlock = STONE;
          filler = STONE;
        } else if (top < 150 && slope <= 3) {
          topBlock = SNOWY_GRASS;
          filler = DIRT;
        } else {
          topBlock = SNOW_BLOCK;
          filler = SNOW_BLOCK;
        }
        break;
      case BIOME_MOUNTAINS:
        if (slope > 3.2 || top > 140 + sn * 8) {
          topBlock = STONE;
          filler = STONE;
        }
        if (top > 148 + sn * 10 && slope <= 5)
          topBlock = SNOW_BLOCK;
        if (sn < -0.55 && slope <= 3.2) {
          topBlock = GRAVEL;
          filler = GRAVEL;
        }
        break;
      default:
        if (slope > 5.5) {
          topBlock = STONE;
          filler = STONE;
        }
    }
    if (underwater && (topBlock === GRASS || topBlock === SNOWY_GRASS || topBlock === MYCELIUM)) {
      if (baseBiome(biome) === BIOME_SWAMP)
        topBlock = sn > 0.3 ? CLAY : DIRT;
      else
        topBlock = sn > 0.2 ? SAND : sn < -0.3 ? GRAVEL : DIRT;
      filler = topBlock === GRAVEL ? GRAVEL : DIRT;
    }
    out[0] = topBlock;
    out[1] = filler;
    out[2] = deep;
    out[3] = depth;
    return out;
  }
  waterColumns = new Map;
  generatedWaterAt(x, y, z) {
    const k = `${x},${z}`;
    let c = this.waterColumns.get(k);
    if (!c) {
      if (this.waterColumns.size > 4096)
        this.waterColumns.clear();
      const inf = this.columnInfo(x, z, { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 });
      const top = this.surfaceAt(x, z, inf);
      c = { h: inf.height, amp: inf.amp, top, ice: inf.temp < -0.58 };
      this.waterColumns.set(k, c);
    }
    if (c.top < SEA_LEVEL - 1 && y > c.top)
      return y < SEA_LEVEL && !(c.ice && y === SEA_LEVEL - 1);
    if (y > c.top || y <= MIN_Y || !this.solidAt(x, y, z, c.h, c.amp))
      return false;
    const sub = this.caves.substanceAt(x, y, z);
    return sub === WATER || sub === LAVA;
  }
  sealGeneratedWater(blocks, x0, z0) {
    const waterOutside = (x, y, z) => this.generatedWaterAt(x, y, z);
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        for (let y = MIN_Y + 1;y < SEA_LEVEL; y++) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== AIR)
            continue;
          const fluid = (id) => id === WATER || id === LAVA;
          let wet = fluid(blocks[blockIndex(lx, y + 1, lz)]);
          for (let d = 0;d < 4 && !wet; d++) {
            const nx = lx + DIR_X[d], nz = lz + DIR_Z[d];
            wet = nx >= 0 && nx < 16 && nz >= 0 && nz < 16 ? fluid(blocks[blockIndex(nx, y, nz)]) : waterOutside(x0 + nx, y, z0 + nz);
          }
          if (!wet)
            continue;
          const below = blocks[blockIndex(lx, y - 1, lz)];
          blocks[i] = below === GRASS || below === SNOWY_GRASS || below === MYCELIUM ? DIRT : below !== WATER && below !== LAVA && below !== STONE && below !== DEEPSLATE && BLOCK_OPAQUE[below] && !isLeaves(below) ? below : this.rockAt(x0 + lx, y, z0 + lz);
        }
      }
    }
  }
  treeGround(x, z, inf) {
    const biome = inf.biome;
    const { height, amp } = inf;
    const sy = this.surfaceAt(x, z, inf);
    if (sy < SEA_LEVEL - 1 || sy > MAX_Y - 20)
      return -1;
    if (this.caves.substanceAt(x, sy, z) >= 0)
      return -1;
    const t = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    const hx1 = this.columnInfo(x + 1, z, t).height;
    const hx0 = this.columnInfo(x - 1, z, t).height;
    const hz1 = this.columnInfo(x, z + 1, t).height;
    const hz0 = this.columnInfo(x, z - 1, t).height;
    const slope = Math.max(Math.abs(hx1 - hx0), Math.abs(hz1 - hz0));
    const layers = this.surfaceRules(x, z, biome, sy, slope, [0, 0, 0, 0]);
    const g = layers[0];
    let ok;
    if (biome === BIOME_DESERT)
      ok = g === SAND && sy >= SEA_LEVEL;
    else if (biome === BIOME_WOODED_BADLANDS)
      ok = g === GRASS || g === COARSE_DIRT || g === RED_SAND && sy >= SEA_LEVEL;
    else if (baseBiome(biome) === BIOME_BADLANDS)
      ok = g === RED_SAND && sy >= SEA_LEVEL;
    else if (biome === BIOME_ICE_SPIKES)
      ok = g === SNOW_BLOCK;
    else
      ok = g === GRASS || g === SNOWY_GRASS || g === DIRT || g === MYCELIUM || g === PODZOL || g === COARSE_DIRT;
    return ok ? sy : -1;
  }
  generate(cx, cz) {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const seed = this.seed;
    const baseH = new Float64Array(18 * 18);
    const infos = new Array(256);
    for (let dz = -1;dz <= 16; dz++) {
      for (let dx = -1;dx <= 16; dx++) {
        if (dx >= 0 && dx < 16 && dz >= 0 && dz < 16) {
          const inf = this.columnInfo(x0 + dx, z0 + dz, {
            height: 0,
            amp: 0,
            temp: 0,
            humid: 0,
            mount: 0,
            cont: 0,
            biome: 0
          });
          infos[dz * 16 + dx] = inf;
          baseH[(dz + 1) * 18 + dx + 1] = inf.height;
        } else {
          baseH[(dz + 1) * 18 + dx + 1] = this.columnInfo(x0 + dx, z0 + dz).height;
        }
      }
    }
    const tops = new Int16Array(256);
    let maxTop = 0;
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const wx = x0 + lx, wz = z0 + lz;
        const lo = Math.max(MIN_Y + 1, Math.floor(inf.height - inf.amp));
        const hi = Math.min(MAX_Y - 8, Math.ceil(inf.height + inf.amp));
        for (let y = MIN_Y;y < lo; y++)
          blocks[blockIndex(lx, y, lz)] = y < 8 ? this.rockAt(wx, y, wz) : STONE;
        let top = lo - 1;
        for (let y = lo;y <= hi; y++) {
          if (this.solidAt(wx, y, wz, inf.height, inf.amp)) {
            blocks[blockIndex(lx, y, lz)] = y < 8 ? this.rockAt(wx, y, wz) : STONE;
            top = y;
          }
        }
        tops[lz * 16 + lx] = top;
        if (top > maxTop)
          maxTop = top;
      }
    }
    const layers = [0, 0, 0, 0];
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const top = tops[lz * 16 + lx];
        const c = (lz + 1) * 18 + lx + 1;
        const slope = Math.max(Math.abs(baseH[c + 1] - baseH[c - 1]), Math.abs(baseH[c + 18] - baseH[c - 18]));
        this.surfaceRules(x0 + lx, z0 + lz, inf.biome, top, slope, layers);
        const topBlock = layers[0], filler = layers[1], deep = layers[2], depth = layers[3];
        let d = 0;
        for (let y = top;y > MIN_Y && d < depth + 3; y--) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== STONE)
            break;
          if (d === 0)
            blocks[i] = topBlock;
          else if (d < depth)
            blocks[i] = filler;
          else if (deep >= 0)
            blocks[i] = deep;
          else
            break;
          d++;
        }
        if (baseBiome(inf.biome) === BIOME_BADLANDS) {
          for (let y = top;y > SEA_LEVEL - 8; y--) {
            const i = blockIndex(lx, y, lz);
            if (blocks[i] === STONE)
              blocks[i] = this.bandAt(x0 + lx, y, z0 + lz);
          }
        }
      }
    }
    this.caves.carveChunk(cx, cz, blocks, tops, maxTop, GRASS, MYCELIUM, DIRT, (id) => id === BEDROCK);
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const inf = infos[lz * 16 + lx];
        const baseTop = tops[lz * 16 + lx];
        if (baseTop < SEA_LEVEL - 1) {
          for (let y = SEA_LEVEL - 1;y > MIN_Y; y--) {
            const i = blockIndex(lx, y, lz);
            if (blocks[i] !== AIR)
              break;
            blocks[i] = WATER;
          }
          if (inf.temp < -0.58)
            blocks[blockIndex(lx, SEA_LEVEL - 1, lz)] = ICE;
        }
        let top = MIN_Y;
        for (let y = Math.max(maxTop, SEA_LEVEL);y > MIN_Y; y--) {
          if (blocks[blockIndex(lx, y, lz)] !== AIR) {
            top = y;
            break;
          }
        }
        tops[lz * 16 + lx] = top;
      }
    }
    this.sealGeneratedWater(blocks, x0, z0);
    const rng = mulberry32(hash2(cx, cz, seed ^ 1592594996));
    const vein = (id, count, minY, maxY, size, replace) => {
      for (let n = 0;n < count; n++) {
        let x = Math.floor(rng() * 16), y = minY + Math.floor(rng() * (maxY - minY)), z = Math.floor(rng() * 16);
        for (let s = 0;s < size; s++) {
          if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > MIN_Y && y < MAX_Y) {
            const i = blockIndex(x, y, z);
            if (blocks[i] === replace)
              blocks[i] = id;
            else if (replace === STONE && blocks[i] === DEEPSLATE && DEEPSLATE_ORE[id] !== undefined)
              blocks[i] = DEEPSLATE_ORE[id];
          }
          const dir = Math.floor(rng() * 6);
          if (dir === 0)
            x++;
          else if (dir === 1)
            x--;
          else if (dir === 2)
            y++;
          else if (dir === 3)
            y--;
          else if (dir === 4)
            z++;
          else
            z--;
        }
      }
    };
    vein(GRANITE, 3, 5, 90, 28, STONE);
    vein(DIORITE, 3, 5, 90, 28, STONE);
    vein(ANDESITE, 3, 5, 90, 28, STONE);
    vein(GRAVEL, 3, MIN_Y + 5, 70, 20, STONE);
    vein(DIRT, 3, MIN_Y + 5, 80, 20, STONE);
    vein(COAL_ORE, 22, 5, 130, 9, STONE);
    vein(IRON_ORE, 24, MIN_Y + 5, 72, 7, STONE);
    vein(GOLD_ORE, 7, MIN_Y + 5, 32, 6, STONE);
    vein(REDSTONE_ORE, 8, MIN_Y + 5, 16, 7, STONE);
    vein(REDSTONE_ORE, 4, MIN_Y + 5, MIN_Y + 32, 7, STONE);
    vein(LAPIS_ORE, 4, MIN_Y + 5, 32, 6, STONE);
    vein(DIAMOND_ORE, 2, MIN_Y + 5, 16, 5, STONE);
    vein(DIAMOND_ORE, 3, MIN_Y + 5, MIN_Y + 20, 5, STONE);
    vein(COPPER_ORE, this.caveBiomeAt(x0 + 8, z0 + 8) === 2 ? 20 : 9, -16, 112, 9, STONE);
    vein(TUFF, 3, MIN_Y + 5, 0, 32, DEEPSLATE);
    const cb = infos[8 * 16 + 8].biome;
    if (baseBiome(cb) === BIOME_MOUNTAINS || baseBiome(cb) === BIOME_SNOWY_PEAKS)
      vein(EMERALD_ORE, 8, -16, 200, 1, STONE);
    placeInfested(blocks, cx, cz, seed, cb);
    placeStones(blocks, x0, z0, seed, infos, tops, this.caveBiomeAt(x0 + 8, z0 + 8));
    this.decorateCaves(blocks, tops, x0, z0);
    decorateDeepDark(this, blocks, x0, z0);
    this.placeGeodes(blocks, cx, cz);
    const col = [0, 0, 0];
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        if (top >= MAX_Y - 2)
          continue;
        const ground = blocks[blockIndex(lx, top, lz)];
        const above = blockIndex(lx, top + 1, lz);
        if (blocks[above] !== AIR)
          continue;
        const wx = x0 + lx, wz = z0 + lz;
        const r = hashToFloat(hash2(wx, wz, seed ^ 2469));
        const biome = infos[lz * 16 + lx].biome;
        if (biome >= BIOME_SWAMP || ground === GRASS && (biome === BIOME_PLAINS || biome === BIOME_FOREST)) {
          const plant = this.newPlant(biome, ground, top, wx, wz, r);
          if (plant > 0)
            blocks[above] = plant;
        } else if (ground === GRASS) {
          const flowers = this.nFlowers.noise2(wx / 52, wz / 52);
          if (flowers > 0.45 && r < 0.3 && (biome === BIOME_PLAINS || biome === BIOME_FOREST || biome === BIOME_BIRCH_FOREST)) {
            const f = hashToFloat(hash2(wx, wz, seed ^ 1919));
            const kind = this.nFlowers.noise2(wx / 20 + 100, wz / 20);
            blocks[above] = kind > 0.25 ? CORNFLOWER : f < 0.5 ? POPPY : DANDELION;
            if (biome !== BIOME_PLAINS && f < 0.3)
              blocks[above] = POPPY;
          } else if (biome === BIOME_TAIGA && r < 0.14) {
            blocks[above] = FERN;
          } else if ((biome === BIOME_FOREST || biome === BIOME_TAIGA || biome === BIOME_BIRCH_FOREST) && r > 0.994) {
            blocks[above] = r > 0.997 ? RED_MUSHROOM : BROWN_MUSHROOM;
          } else {
            const p = biome === BIOME_SAVANNA ? 0.42 : biome === BIOME_PLAINS ? 0.3 : biome === BIOME_TAIGA ? 0.22 : 0.18;
            if (r < p)
              blocks[above] = SHORT_GRASS;
          }
        } else if (ground === SAND && biome === BIOME_DESERT && r < 0.008) {
          blocks[above] = DEAD_BUSH;
        }
        if ((ground === GRASS || ground === SAND || ground === DIRT) && top === SEA_LEVEL - 1 && r > 0.82) {
          let water = false;
          if (lx > 0 && blocks[blockIndex(lx - 1, top, lz)] === WATER)
            water = true;
          if (lx < 15 && blocks[blockIndex(lx + 1, top, lz)] === WATER)
            water = true;
          if (lz > 0 && blocks[blockIndex(lx, top, lz - 1)] === WATER)
            water = true;
          if (lz < 15 && blocks[blockIndex(lx, top, lz + 1)] === WATER)
            water = true;
          if (water) {
            const hgt = 1 + hash2(wx, wz, seed ^ 81) % 3;
            for (let k = 1;k <= hgt; k++)
              blocks[blockIndex(lx, top + k, lz)] = SUGAR_CANE;
          }
        }
      }
    }
    placeBamboo(seed, blocks, tops, (lx, lz) => infos[lz * 16 + lx].biome, x0, z0);
    const patch = hashToFloat(hash2(cx, cz, seed ^ 27260));
    if (patch < 0.05) {
      const melon = patch < 0.015;
      const pr = mulberry32(hash2(cx, cz, seed ^ 977));
      const clx = 3 + Math.floor(pr() * 10), clz = 3 + Math.floor(pr() * 10);
      const b0 = infos[clz * 16 + clx].biome;
      const bb = baseBiome(b0);
      const okBiome = melon ? bb === BIOME_SAVANNA || bb === BIOME_PLAINS || bb === BIOME_JUNGLE : bb === BIOME_PLAINS || bb === BIOME_FOREST || bb === BIOME_TAIGA || bb === BIOME_BIRCH_FOREST;
      for (let k = 0;okBiome && k < 10; k++) {
        const lx = clx + Math.floor(pr() * 7) - 3, lz = clz + Math.floor(pr() * 7) - 3;
        if (lx < 0 || lx > 15 || lz < 0 || lz > 15)
          continue;
        const top = tops[lz * 16 + lx];
        if (top >= MAX_Y - 2 || blocks[blockIndex(lx, top, lz)] !== GRASS)
          continue;
        const above = blockIndex(lx, top + 1, lz);
        const cur = blocks[above];
        if (cur !== AIR && cur !== SHORT_GRASS && cur !== FERN)
          continue;
        blocks[above] = melon ? MELON : PUMPKIN;
      }
    }
    const set = (x, y, z, id, force) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx >= 16 || lz < 0 || lz >= 16 || y <= MIN_Y || y >= MAX_Y)
        return;
      const i = blockIndex(lx, y, lz);
      const cur = blocks[i];
      if (cur === AIR || force && (BLOCK_REPLACEABLE[cur] || BLOCK_RENDER[cur] === R_CROSS || isLeaves(cur))) {
        blocks[i] = id;
      }
    };
    const tmpInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    const groundInfo = { ...tmpInfo };
    const village = locateStructure(this, "village", x0 + 8, z0 + 8, 1);
    const villageR = VILLAGE_RADIUS + 8;
    const nearVillage = village && Math.hypot(village[0] - (x0 + 8), village[2] - (z0 + 8)) < villageR + 40;
    const cMin = Math.floor((x0 - 8) / 4), cMax = Math.floor((x0 + 23) / 4);
    const kMin = Math.floor((z0 - 8) / 4), kMax = Math.floor((z0 + 23) / 4);
    for (let ck = kMin;ck <= kMax; ck++) {
      for (let cc = cMin;cc <= cMax; cc++) {
        const h = hash2(cc, ck, seed ^ 31294);
        const tx = cc * 4 + (h & 3);
        const tz = ck * 4 + (h >>> 2 & 3);
        const r = (h >>> 8 & 65535) / 65536;
        if (tx < x0 - 8 || tx > x0 + 23 || tz < z0 - 8 || tz > z0 + 23)
          continue;
        if (nearVillage && Math.hypot(tx - village[0], tz - village[2]) < villageR)
          continue;
        const inf = this.columnInfo(tx, tz, tmpInfo);
        const density = TREE_DENSITY[inf.biome];
        if (r >= density)
          continue;
        const biome = inf.biome;
        const sy = this.treeGround(tx, tz, inf);
        if (sy < 0)
          continue;
        const inside = tx >= x0 && tx < x0 + 16 && tz >= z0 && tz < z0 + 16;
        const tr = hashToFloat(hash2(tx, tz, seed ^ 935));
        if (biome === BIOME_ERODED_BADLANDS && tr < 0.7) {
          this.hoodoo(tx, sy + 1, tz, tr, set);
          continue;
        }
        if (biome === BIOME_WOODED_BADLANDS) {
          this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
          continue;
        }
        if (biome === BIOME_DESERT || baseBiome(biome) === BIOME_BADLANDS) {
          const hgt = 1 + Math.floor(tr * 3);
          for (let k = 1;k <= hgt; k++)
            set(tx, sy + k, tz, CACTUS, true);
          continue;
        }
        if (biome === BIOME_ICE_SPIKES) {
          this.iceSpike(tx, sy + 1, tz, tr, set);
          continue;
        }
        const tb = baseBiome(biome);
        if (placeWoodTree(seed, biome, tx, sy + 1, tz, tr, set, (gx, gz) => this.surfaceAt(gx, gz, this.columnInfo(gx, gz, groundInfo)))) {} else if (biome === BIOME_OLD_GROWTH_PINE_TAIGA || biome === BIOME_OLD_GROWTH_SPRUCE_TAIGA) {
          if (biome === BIOME_OLD_GROWTH_PINE_TAIGA && tr > 0.94)
            this.boulder(tx, sy, tz, tr, set);
          else if (tr < 0.45)
            this.megaSpruce(tx, sy + 1, tz, tr, biome === BIOME_OLD_GROWTH_PINE_TAIGA, set);
          else
            this.spruce(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_OLD_GROWTH_BIRCH_FOREST) {
          this.tallBirch(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_FLOWER_FOREST) {
          if (tr < 0.25)
            this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
          else
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (biome === BIOME_WINDSWEPT_FOREST || biome === BIOME_WINDSWEPT_GRAVELLY_HILLS) {
          if (tr < 0.6)
            this.spruce(tx, sy + 1, tz, tr, set);
          else
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (biome === BIOME_SPARSE_JUNGLE || biome === BIOME_BAMBOO_JUNGLE) {
          if (tr < 0.4)
            this.jungleTree(tx, sy + 1, tz, tr, set);
          else
            this.jungleBush(tx, sy + 1, tz, set);
        } else if (tb === BIOME_TAIGA || tb === BIOME_SNOWY || tb === BIOME_MOUNTAINS) {
          this.spruce(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_BIRCH_FOREST) {
          if (tr < 0.85)
            this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
          else
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (biome === BIOME_FOREST) {
          if (tr < 0.22)
            this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
          else if (tr > 0.9)
            this.bigOak(tx, sy + 1, tz, tr, set);
          else
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        } else if (tb === BIOME_SAVANNA) {
          this.savannaTree(tx, sy + 1, tz, tr, set);
        } else if (tb === BIOME_SWAMP) {
          this.swampOak(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_JUNGLE) {
          if (tr < 0.12)
            this.megaJungle(tx, sy + 1, tz, tr, set);
          else if (tr < 0.55)
            this.jungleTree(tx, sy + 1, tz, tr, set);
          else
            this.jungleBush(tx, sy + 1, tz, set);
        } else if (biome === BIOME_DARK_FOREST) {
          if (tr < 0.06)
            this.hugeMushroom(tx, sy + 1, tz, tr, tr < 0.03, set);
          else if (tr < 0.82)
            this.darkOak(tx, sy + 1, tz, tr, set);
          else if (tr < 0.92)
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
          else
            this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
        } else if (biome === BIOME_MUSHROOM_FIELDS) {
          this.hugeMushroom(tx, sy + 1, tz, tr, tr < 0.5, set);
        } else if (biome === BIOME_CHERRY_GROVE) {
          this.cherry(tx, sy + 1, tz, tr, set);
        } else if (biome === BIOME_MEADOW) {
          if (tr < 0.6)
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
          else
            this.oak(tx, sy + 1, tz, tr, BIRCH_LOG, BIRCH_LEAVES, set);
        } else {
          if (tr > 0.8)
            this.bigOak(tx, sy + 1, tz, tr, set);
          else
            this.oak(tx, sy + 1, tz, tr, OAK_LOG, OAK_LEAVES, set);
        }
        placeBeeNest(seed, biome, tx, sy + 1, tz, tr, set);
        if (inside) {
          const gi = blockIndex(tx - x0, sy, tz - z0);
          if (blocks[gi] === GRASS || blocks[gi] === SNOWY_GRASS)
            blocks[gi] = DIRT;
        }
      }
    }
    const villagers = [];
    const mobs = [];
    const fluidTicks = [];
    const chests = placeStructures(this, blocks, cx, cz, tops, villagers, mobs, fluidTicks);
    decorate65(this, blocks, tops, infos, cx, cz);
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const ci = infos[lz * 16 + lx];
        if (ci.temp >= -0.5 || ci.biome === BIOME_MUSHROOM_FIELDS)
          continue;
        let y = Math.min(MAX_Y - 2, Math.max(maxTop, SEA_LEVEL) + 32);
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR)
          y--;
        const b = blocks[blockIndex(lx, y, lz)];
        if (b === ICE || b === PACKED_ICE || b === WATER || !(BLOCK_OPAQUE[b] || isLeaves(b)))
          continue;
        blocks[blockIndex(lx, y + 1, lz)] = SNOW_LAYER;
      }
    }
    decorateMaterials(seed, blocks, tops, infos, cx, cz);
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        blocks[blockIndex(lx, MIN_Y, lz)] = BEDROCK;
        for (let k = 1;k < 4; k++) {
          const y = MIN_Y + k;
          if (hashToFloat(hash3(x0 + lx, y, z0 + lz, seed ^ 3053)) < (4 - k) / 5)
            blocks[blockIndex(lx, y, lz)] = BEDROCK;
        }
      }
    }
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        let y = MAX_Y - 1;
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR)
          y--;
        heights[lz * 16 + lx] = y;
      }
    }
    const tint = new Uint8Array(64);
    for (let j = 0;j < 4; j++) {
      for (let i = 0;i < 4; i++) {
        const inf = this.columnInfo(x0 + i * 4 + 2, z0 + j * 4 + 2, tmpInfo);
        TerrainGenerator.biomeGrass(inf, col);
        const o = (j * 4 + i) * 4;
        tint[o] = Math.round(col[0]);
        tint[o + 1] = Math.round(col[1]);
        tint[o + 2] = Math.round(col[2]);
        tint[o + 3] = Math.round(clamp01(inf.temp * 0.6 + 0.5) * 255);
      }
    }
    return { blocks, tint, heights, chests, villagers, mobs, ...fluidTicks.length ? { fluidTicks } : {} };
  }
  growTree(kind, x, y, z, r, set, mega = false) {
    if (growWoodTree(this.seed, kind, x, y, z, r, set))
      return;
    switch (kind) {
      case 1:
        return this.oak(x, y, z, r, BIRCH_LOG, BIRCH_LEAVES, set);
      case 2:
        return this.spruce(x, y, z, r, set);
      case 3:
        return mega ? this.megaJungle(x, y, z, r, set) : this.jungleTree(x, y, z, r, set);
      case 4:
        return this.savannaTree(x, y, z, r, set);
      case 5:
        return this.darkOak(x, y, z, r, set);
      case 6:
        return this.cherry(x, y, z, r, set);
    }
    if (r > 0.9)
      this.bigOak(x, y, z, r, set);
    else
      this.oak(x, y, z, r, OAK_LOG, OAK_LEAVES, set);
  }
  oak(x, y, z, r, log, leaves, set) {
    const h = 4 + Math.floor(r * 1000) % 3 + (log === BIRCH_LOG ? 1 : 0);
    for (let k = 0;k < h; k++)
      set(x, y + k, z, log, true);
    const top = y + h - 1;
    for (let dy = -2;dy <= 1; dy++) {
      const rad = dy <= -1 ? 2 : 1;
      for (let dz = -rad;dz <= rad; dz++) {
        for (let dx = -rad;dx <= rad; dx++) {
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
          if (corner) {
            if (dy === 1)
              continue;
            if (hash3(x + dx, top + dy, z + dz, this.seed ^ 490) % 3 === 0)
              continue;
          }
          if (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1)
            continue;
          set(x + dx, top + dy, z + dz, leaves, false);
        }
      }
    }
  }
  bigOak(x, y, z, r, set) {
    const h = 6 + Math.floor(r * 997) % 3;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, OAK_LOG, true);
    const top = y + h - 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let d = 0;d < 4; d++) {
      if (hash2(x + d, z - d, this.seed ^ 180) % 2 === 0)
        continue;
      const bx = x + dirs[d][0] * 2, bz = z + dirs[d][1] * 2;
      set(x + dirs[d][0], top - 2, z + dirs[d][1], OAK_LOG, true);
      set(bx, top - 1, bz, OAK_LOG, true);
      this.leafBlob(bx, top, bz, 2, set);
    }
    this.leafBlob(x, top, z, 3, set);
  }
  leafBlob(x, y, z, rad, set) {
    for (let dy = -rad + 1;dy <= rad - 1; dy++) {
      for (let dz = -rad;dz <= rad; dz++) {
        for (let dx = -rad;dx <= rad; dx++) {
          const d = dx * dx + dz * dz + dy * dy * 2.2;
          const lim = rad * rad + 0.6 + hash3(x + dx, y + dy, z + dz, this.seed ^ 750) % 3 * 0.5;
          if (d <= lim)
            set(x + dx, y + dy, z + dz, OAK_LEAVES, false);
        }
      }
    }
  }
  spruce(x, y, z, r, set) {
    const h = 7 + Math.floor(r * 1000) % 5;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, SPRUCE_LOG, true);
    const top = y + h;
    set(x, top, z, SPRUCE_LEAVES, false);
    set(x, top + 1, z, SPRUCE_LEAVES, false);
    let rad = 0;
    const leafStart = y + 2 + Math.floor(r * 37) % 2;
    for (let yy = top - 1;yy >= leafStart; yy--) {
      const layer = top - 1 - yy;
      rad = layer % 2 === 0 ? Math.min(1 + Math.floor(layer / 3), 3) : Math.max(0, Math.min(1 + Math.floor(layer / 3), 3) - 1);
      for (let dz = -rad;dz <= rad; dz++) {
        for (let dx = -rad;dx <= rad; dx++) {
          if (Math.abs(dx) + Math.abs(dz) > rad + (rad > 1 ? 1 : 0))
            continue;
          if (dx === 0 && dz === 0)
            continue;
          set(x + dx, yy, z + dz, SPRUCE_LEAVES, false);
        }
      }
    }
  }
  savannaTree(x, y, z, r, set) {
    const log = ACACIA_LOG, leaves = ACACIA_LEAVES;
    const h = 4 + Math.floor(r * 1000) % 2;
    const dirIdx = Math.floor(r * 4000) % 4;
    const ddx = [1, -1, 0, 0][dirIdx], ddz = [0, 0, 1, -1][dirIdx];
    let cx = x, cz = z;
    for (let k = 0;k < h; k++) {
      if (k >= 2) {
        cx += ddx;
        cz += ddz;
      }
      set(cx, y + k, cz, log, true);
    }
    const top = y + h;
    this.acaciaCanopy(cx, top, cz, leaves, set);
    if (Math.floor(r * 7919) % 2 === 0) {
      let bx = x, bz = z;
      const by = y + 1;
      for (let k = 1;k <= 3; k++) {
        bx -= ddx;
        bz -= ddz;
        set(bx, by + k, bz, log, true);
      }
      this.acaciaCanopy(bx, by + 4, bz, leaves, set);
    }
  }
  acaciaCanopy(cx, top, cz, leaves, set) {
    for (let dz = -2;dz <= 2; dz++) {
      for (let dx = -2;dx <= 2; dx++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2)
          continue;
        set(cx + dx, top, cz + dz, leaves, false);
      }
    }
    for (let dz = -1;dz <= 1; dz++) {
      for (let dx = -1;dx <= 1; dx++)
        set(cx + dx, top + 1, cz + dz, leaves, false);
    }
  }
  megaSpruce(x, y, z, r, pine, set) {
    const h = 16 + Math.floor(r * 1000) % 12;
    for (let k = 0;k < h; k++)
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        set(x + dx, y + k, z + dz, SPRUCE_LOG, true);
    const top = y + h;
    const crown = pine ? 6 + Math.floor(r * 37) % 3 : Math.floor(h * 0.7);
    for (let k = 0;k <= crown; k++) {
      const yy = top - k;
      const rad = Math.min(pine ? 2.6 : 4.2, 0.6 + k * (pine ? 0.3 : 0.4) - (k % 3 === 2 ? 0.8 : 0));
      if (rad > 0.4)
        this.leafDisc(x + 1, yy, z + 1, rad, SPRUCE_LEAVES, set);
    }
    set(x, top + 1, z, SPRUCE_LEAVES, false);
    set(x + 1, top + 1, z + 1, SPRUCE_LEAVES, false);
  }
  tallBirch(x, y, z, r, set) {
    const h = 10 + Math.floor(r * 1000) % 5;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, BIRCH_LOG, true);
    const top = y + h - 1;
    for (let dy = -3;dy <= 1; dy++)
      this.leafDisc(x + 0.5, top + dy, z + 0.5, dy === 1 ? 0.8 : dy === -3 ? 1.6 : 2.1, BIRCH_LEAVES, set);
  }
  boulder(x, y, z, r, set) {
    const rad = 1 + Math.floor(r * 100) % 2;
    for (let dy = -1;dy <= rad; dy++) {
      for (let dz = -rad;dz <= rad; dz++) {
        for (let dx = -rad;dx <= rad; dx++) {
          if (dx * dx + dz * dz + dy * dy * 1.5 > rad * rad + 0.8)
            continue;
          const moss = hash3(x + dx, y + dy, z + dz, this.seed ^ 45085) % 4 !== 0;
          set(x + dx, y + dy, z + dz, moss ? MOSSY_COBBLESTONE : STONE, true);
        }
      }
    }
  }
  hoodoo(x, y, z, r, set) {
    const h = 6 + Math.floor(r * 1000) % 16;
    for (let k = -2;k < h; k++) {
      const rad = k < h * 0.35 ? 1.6 : k < h * 0.75 ? 1.1 : 0.5;
      const ri = Math.ceil(rad);
      for (let dz = -ri;dz <= ri; dz++) {
        for (let dx = -ri;dx <= ri; dx++) {
          if (dx * dx + dz * dz > rad * rad + 0.3)
            continue;
          set(x + dx, y + k, z + dz, this.bandAt(x + dx, y + k, z + dz), true);
        }
      }
    }
  }
  inDisc(cx, cz, rad, x, y, z) {
    const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
    return dx * dx + dz * dz <= rad * rad + rad * 0.6 + hash3(x, y, z, this.seed ^ 750) % 3 * 0.25;
  }
  leafDisc(cx, y, cz, rad, leaves, set) {
    const r0 = Math.ceil(rad + 1);
    const ix = Math.floor(cx), iz = Math.floor(cz);
    for (let z = iz - r0;z <= iz + r0; z++) {
      for (let x = ix - r0;x <= ix + r0; x++)
        if (this.inDisc(cx, cz, rad, x, y, z))
          set(x, y, z, leaves, false);
    }
  }
  hangVines(cx, y, cz, rad, chance, set) {
    const ix = Math.floor(cx), iz = Math.floor(cz);
    for (let d = 0;d < 4; d++) {
      for (let k = -2;k <= 2; k++) {
        let ex = ix + (DIR_X[d] === 0 ? k : 0), ez = iz + (DIR_Z[d] === 0 ? k : 0);
        if (!this.inDisc(cx, cz, rad, ex, y, ez))
          continue;
        while (this.inDisc(cx, cz, rad, ex + DIR_X[d], y, ez + DIR_Z[d])) {
          ex += DIR_X[d];
          ez += DIR_Z[d];
        }
        const h = hash3(ex, y, ez, this.seed ^ 1822);
        if (h % 100 / 100 >= chance)
          continue;
        const len = 1 + (h >>> 8) % 4;
        for (let j = 0;j < len; j++)
          set(ex + DIR_X[d], y - j, ez + DIR_Z[d], VINE + d, false);
      }
    }
  }
  trunkVines(x0, z0, x1, z1, y0, y1, chance, set) {
    const vine = (x, y, z, f) => {
      if (hash3(x, y, z, this.seed ^ 961) % 100 / 100 < chance)
        set(x, y, z, VINE + f, false);
    };
    for (let y = y0;y <= y1; y++) {
      for (let x = x0;x <= x1; x++) {
        vine(x, y, z0 - 1, 0);
        vine(x, y, z1 + 1, 2);
      }
      for (let z = z0;z <= z1; z++) {
        vine(x1 + 1, y, z, 1);
        vine(x0 - 1, y, z, 3);
      }
    }
  }
  swampOak(x, y, z, r, set) {
    const h = 5 + Math.floor(r * 1000) % 3;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, OAK_LOG, true);
    const top = y + h - 1;
    const radii = [3, 3, 2, 1.2];
    for (let k = 0;k < 4; k++)
      this.leafDisc(x + 0.5, top - 2 + k, z + 0.5, radii[k], OAK_LEAVES, set);
    this.hangVines(x + 0.5, top - 2, z + 0.5, 3, 0.5, set);
  }
  jungleTree(x, y, z, r, set) {
    const h = 5 + Math.floor(r * 1000) % 5;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, JUNGLE_LOG, true);
    const top = y + h - 1;
    const radii = [2.2, 2.2, 1.4, 0.8];
    for (let k = 0;k < 4; k++)
      this.leafDisc(x + 0.5, top - 2 + k, z + 0.5, radii[k], JUNGLE_LEAVES, set);
    this.trunkVines(x, z, x, z, y, top - 2, 0.3, set);
    this.hangVines(x + 0.5, top - 2, z + 0.5, 2.2, 0.25, set);
  }
  jungleBush(x, y, z, set) {
    set(x, y, z, JUNGLE_LOG, true);
    this.leafDisc(x + 0.5, y, z + 0.5, 2.2, OAK_LEAVES, set);
    this.leafDisc(x + 0.5, y + 1, z + 0.5, 1.3, OAK_LEAVES, set);
    set(x, y + 2, z, OAK_LEAVES, false);
  }
  megaJungle(x, y, z, r, set) {
    const h = 16 + Math.floor(r * 1000) % 12;
    for (let k = 0;k < h; k++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        set(x + dx, y + k, z + dz, JUNGLE_LOG, true);
    }
    const top = y + h - 1;
    const radii = [4.2, 4.8, 3.8, 2.2];
    for (let k = 0;k < 4; k++)
      this.leafDisc(x + 1, top - 1 + k, z + 1, radii[k], JUNGLE_LEAVES, set);
    const n = 2 + Math.floor(r * 37) % 3;
    for (let i = 0;i < n; i++) {
      const d = (Math.floor(r * 97) + i) % 4;
      const by = y + Math.floor(h * 0.45) + i * 3;
      if (by > top - 4)
        break;
      let bx = x + (DIR_X[d] > 0 ? 1 : 0), bz = z + (DIR_Z[d] > 0 ? 1 : 0);
      let yy = by;
      for (let s2 = 1;s2 <= 3; s2++) {
        bx += DIR_X[d];
        bz += DIR_Z[d];
        if (s2 > 1)
          yy++;
        set(bx, yy, bz, s2 === 1 ? horizontalLog(JUNGLE_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z) : JUNGLE_LOG, true);
      }
      this.leafDisc(bx + 0.5, yy, bz + 0.5, 2, JUNGLE_LEAVES, set);
      this.leafDisc(bx + 0.5, yy + 1, bz + 0.5, 1.2, JUNGLE_LEAVES, set);
    }
    this.trunkVines(x, z, x + 1, z + 1, y, top - 2, 0.55, set);
    this.hangVines(x + 1, top - 1, z + 1, 4.2, 0.45, set);
  }
  darkOak(x, y, z, r, set) {
    const h = 6 + Math.floor(r * 1000) % 3;
    for (let k = 0;k < h; k++) {
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        set(x + dx, y + k, z + dz, DARK_OAK_LOG, true);
    }
    const top = y + h - 1;
    for (let i = 0;i < 2; i++) {
      const d = (Math.floor(r * 131) + i * 2) % 4;
      const bx = x + (DIR_X[d] > 0 ? 1 : 0) + DIR_X[d], bz = z + (DIR_Z[d] > 0 ? 1 : 0) + DIR_Z[d];
      set(bx, top - 1, bz, horizontalLog(DARK_OAK_LOG, DIR_X[d] !== 0 ? AXIS_X : AXIS_Z), true);
      set(bx + DIR_X[d], top, bz + DIR_Z[d], DARK_OAK_LOG, true);
      this.leafDisc(bx + DIR_X[d] + 0.5, top + 1, bz + DIR_Z[d] + 0.5, 1.8, DARK_OAK_LEAVES, set);
    }
    const radii = [3.2, 3.8, 3.2, 1.8];
    for (let k = 0;k < 4; k++)
      this.leafDisc(x + 1, top - 1 + k, z + 1, radii[k], DARK_OAK_LEAVES, set);
  }
  cherry(x, y, z, r, set) {
    const h = 3 + Math.floor(r * 1000) % 2;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, CHERRY_LOG, true);
    const n = 2 + Math.floor(r * 53) % 2;
    const d0 = Math.floor(r * 4000) % 4;
    for (let i = 0;i < n; i++) {
      const d = (d0 + i * (n === 2 ? 2 : 1)) % 4;
      const dx = DIR_X[d], dz = DIR_Z[d];
      const sx = DIR_X[d + 1 & 3], sz = DIR_Z[d + 1 & 3];
      const len = 2 + (Math.floor(r * 91) + i) % 3;
      const jog = n === 3 && i === 2 ? 1 : 0;
      const by = y + h - 1 - (Math.floor(r * 29) + i) % 2;
      let ex = x, ez = z;
      const across = dx !== 0 ? AXIS_X : AXIS_Z;
      for (let s2 = 1;s2 <= len; s2++) {
        ex += dx;
        ez += dz;
        if (jog && s2 === 2) {
          ex += sx;
          ez += sz;
        }
        set(ex, by, ez, horizontalLog(CHERRY_LOG, across), true);
      }
      const up = 1 + (Math.floor(r * 67) + i) % 2;
      let ey = by;
      for (let k = 1;k <= up; k++)
        set(ex, ++ey, ez, CHERRY_LOG, true);
      const radii = [3.1, 2.7, 1.7];
      for (let k = 0;k < 3; k++)
        this.leafDisc(ex + 0.5, ey + k, ez + 0.5, radii[k], CHERRY_LEAVES, set);
      for (let dz = -3;dz <= 3; dz++) {
        for (let dx = -3;dx <= 3; dx++) {
          if (!this.inDisc(ex + 0.5, ez + 0.5, 3.1, ex + dx, ey, ez + dz))
            continue;
          const hh = hash3(ex + dx, ey, ez + dz, this.seed ^ 3150);
          if (hh % 5 === 0)
            set(ex + dx, ey - 1, ez + dz, CHERRY_LEAVES, false);
          if (hh % 13 === 0)
            set(ex + dx, ey - 2, ez + dz, CHERRY_LEAVES, false);
        }
      }
    }
  }
  hugeMushroom(x, y, z, r, red, set) {
    const h = 5 + Math.floor(r * 1000) % 3;
    for (let k = 0;k < h; k++)
      set(x, y + k, z, MUSHROOM_STEM, true);
    const top = y + h;
    if (red) {
      for (let dz = -1;dz <= 1; dz++)
        for (let dx = -1;dx <= 1; dx++)
          set(x + dx, top, z + dz, RED_MUSHROOM_BLOCK, false);
      for (let yy = top - 3;yy < top; yy++) {
        for (let dz = -2;dz <= 2; dz++) {
          for (let dx = -2;dx <= 2; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2 || Math.abs(dx) === 2 && Math.abs(dz) === 2)
              continue;
            set(x + dx, yy, z + dz, RED_MUSHROOM_BLOCK, false);
          }
        }
      }
    } else {
      for (let dz = -3;dz <= 3; dz++) {
        for (let dx = -3;dx <= 3; dx++) {
          if (Math.abs(dx) === 3 && Math.abs(dz) === 3)
            continue;
          set(x + dx, top, z + dz, BROWN_MUSHROOM_BLOCK, false);
        }
      }
    }
  }
  iceSpike(x, y, z, r, set) {
    const huge = r < 0.004;
    const h = huge ? 24 + Math.floor(r * 1e5) % 16 : 5 + Math.floor(r * 1000) % 9;
    const base = huge ? 2.8 : 1.5;
    for (let k = 0;k <= h; k++) {
      const rad = Math.max(0.2, base * (1 - k / h));
      const r0 = Math.ceil(rad);
      for (let dz = -r0;dz <= r0; dz++) {
        for (let dx = -r0;dx <= r0; dx++)
          if (dx * dx + dz * dz <= rad * rad + 0.3)
            set(x + dx, y + k, z + dz, PACKED_ICE, true);
      }
    }
  }
  newPlant(biome, ground, top, wx, wz, r) {
    const seed = this.seed;
    const flowers = this.nFlowers.noise2(wx / 52, wz / 52);
    const kind = this.nFlowers.noise2(wx / 20 + 100, wz / 20);
    const f = hashToFloat(hash2(wx, wz, seed ^ 1919));
    const mushroom = r > 0.997 ? RED_MUSHROOM : BROWN_MUSHROOM;
    if (ground === WATER)
      return baseBiome(biome) === BIOME_SWAMP && top === SEA_LEVEL - 1 && r < 0.07 ? LILY_PAD : 0;
    if (ground === MYCELIUM)
      return r < 0.015 ? mushroom : 0;
    if (ground === RED_SAND)
      return baseBiome(biome) === BIOME_BADLANDS && r < 0.012 ? DEAD_BUSH : 0;
    if (ground !== GRASS && ground !== PODZOL && ground !== COARSE_DIRT)
      return 0;
    switch (biome) {
      case BIOME_FLOWER_FOREST:
        if (r < 0.55) {
          const all = [
            POPPY,
            DANDELION,
            FLOWERS.allium,
            FLOWERS.azure_bluet,
            FLOWERS.red_tulip,
            FLOWERS.orange_tulip,
            FLOWERS.white_tulip,
            FLOWERS.pink_tulip,
            FLOWERS.oxeye_daisy,
            CORNFLOWER,
            FLOWERS.lily_of_the_valley
          ];
          return all[Math.floor((kind * 0.5 + 0.5) * all.length * 0.999)];
        }
        return r < 0.7 ? SHORT_GRASS : 0;
      case BIOME_OLD_GROWTH_PINE_TAIGA:
      case BIOME_OLD_GROWTH_SPRUCE_TAIGA:
        if (r > 0.985)
          return mushroom;
        return r < 0.3 ? FERN : r < 0.45 ? SHORT_GRASS : 0;
      case BIOME_SNOWY_PLAINS:
      case BIOME_GROVE:
        return r < 0.04 ? SHORT_GRASS : 0;
      case BIOME_SPARSE_JUNGLE:
      case BIOME_BAMBOO_JUNGLE:
        return r < 0.3 ? SHORT_GRASS : r < 0.45 ? FERN : 0;
      case BIOME_WINDSWEPT_SAVANNA:
      case BIOME_SAVANNA_PLATEAU:
        return r < 0.35 ? SHORT_GRASS : 0;
      case BIOME_WOODED_BADLANDS:
        return r < 0.15 ? SHORT_GRASS : 0;
    }
    if (ground !== GRASS)
      return 0;
    switch (baseBiome(biome)) {
      case BIOME_PLAINS:
      case BIOME_FOREST: {
        if (flowers > 0.45 && r < 0.3) {
          if (biome === BIOME_FOREST)
            return f < 0.3 ? POPPY : f < 0.55 ? FLOWERS.lily_of_the_valley : DANDELION;
          if (kind > 0.3)
            return [FLOWERS.red_tulip, FLOWERS.orange_tulip, FLOWERS.white_tulip, FLOWERS.pink_tulip][Math.floor(f * 4)];
          if (kind < -0.3)
            return f < 0.5 ? FLOWERS.oxeye_daisy : FLOWERS.azure_bluet;
          return f < 0.4 ? POPPY : f < 0.8 ? DANDELION : CORNFLOWER;
        }
        if (biome === BIOME_FOREST && r > 0.994)
          return mushroom;
        return r < (biome === BIOME_PLAINS ? 0.3 : 0.18) ? SHORT_GRASS : 0;
      }
      case BIOME_SWAMP:
        if (r < 0.03)
          return FLOWERS.blue_orchid;
        if (r > 0.99)
          return mushroom;
        return r < 0.25 ? SHORT_GRASS : 0;
      case BIOME_JUNGLE:
        return r < 0.35 ? SHORT_GRASS : r < 0.55 ? FERN : 0;
      case BIOME_DARK_FOREST:
        if (r > 0.985)
          return mushroom;
        if (flowers > 0.55 && r < 0.1)
          return f < 0.5 ? POPPY : FLOWERS.lily_of_the_valley;
        return r < 0.25 ? SHORT_GRASS : 0;
      case BIOME_MEADOW:
        if (flowers > -0.1 && r < 0.35) {
          return [FLOWERS.allium, FLOWERS.azure_bluet, FLOWERS.oxeye_daisy, CORNFLOWER, DANDELION, POPPY][Math.floor((kind * 0.5 + 0.5) * 5.99)];
        }
        return r < 0.65 ? SHORT_GRASS : 0;
      case BIOME_CHERRY_GROVE:
        return r < 0.28 ? PINK_PETALS : r < 0.42 ? SHORT_GRASS : 0;
      case BIOME_SAVANNA:
        return r < 0.42 ? SHORT_GRASS : 0;
    }
    return r < 0.18 ? SHORT_GRASS : 0;
  }
  decorateCaves(blocks, tops, x0, z0) {
    const seed = this.seed;
    const ROW = 256;
    const solid = (b) => b !== AIR && BLOCK_OPAQUE[b] === 1;
    const drip = (dir, part) => POINTED_DRIPSTONE + dir + part * 2;
    for (let lz = 0;lz < 16; lz++) {
      for (let lx = 0;lx < 16; lx++) {
        const wx = x0 + lx, wz = z0 + lz;
        const kind = this.caveBiomeAt(wx, wz);
        if (kind === 0 || kind === 3)
          continue;
        const top = tops[lz * 16 + lx];
        for (let y = MIN_Y + 6;y < top - 12; y++) {
          const i = blockIndex(lx, y, lz);
          if (blocks[i] !== AIR)
            continue;
          const h = hash3(wx, y, wz, seed ^ 51838);
          const r = (h & 65535) / 65536;
          const r2 = (h >>> 16 & 255) / 256;
          const len = 1 + (h >>> 24) % 4;
          const floor = solid(blocks[i - ROW]), ceil = solid(blocks[i + ROW]);
          if (kind === 1) {
            if (floor) {
              if (r < 0.85)
                blocks[i - ROW] = MOSS_BLOCK;
              if (r2 < 0.2)
                blocks[i] = MOSS_CARPET;
              else if (r2 < 0.24)
                blocks[i] = AZALEA;
              else if (r2 < 0.26)
                blocks[i] = FLOWERING_AZALEA;
              else if (r2 < 0.42)
                blocks[i] = SHORT_GRASS;
            }
            if (ceil) {
              if (r < 0.6)
                blocks[i + ROW] = MOSS_BLOCK;
              if (r2 > 0.88 && blocks[i] === AIR) {
                for (let k = 0;k <= len && y - k > MIN_Y + 5; k++) {
                  const j = i - k * ROW;
                  if (blocks[j] !== AIR)
                    break;
                  blocks[j] = hash3(wx, y - k, wz, seed ^ 3041) % 3 === 0 ? CAVE_VINES + 1 : CAVE_VINES;
                }
              }
            }
          } else {
            if (floor) {
              if (r < 0.5)
                blocks[i - ROW] = DRIPSTONE_BLOCK;
              if (r2 < 0.08) {
                let n = 0;
                while (n < len && y + n < top - 12 && blocks[i + n * ROW] === AIR)
                  n++;
                for (let k = 0;k < n; k++)
                  blocks[i + k * ROW] = drip(0, k === n - 1 ? 0 : k === 0 && n >= 3 ? 2 : 1);
              }
            }
            if (ceil && blocks[i] === AIR) {
              if (r < 0.5)
                blocks[i + ROW] = DRIPSTONE_BLOCK;
              if (r2 > 0.9) {
                let n = 0;
                while (n < len && y - n > MIN_Y + 5 && blocks[i - n * ROW] === AIR)
                  n++;
                for (let k = 0;k < n; k++)
                  blocks[i - k * ROW] = drip(1, k === n - 1 ? 0 : k === 0 && n >= 3 ? 2 : 1);
              }
            }
          }
        }
      }
    }
  }
  placeGeodes(blocks, cx, cz) {
    const seed = this.seed;
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let gz = cz - 1;gz <= cz + 1; gz++) {
      for (let gx = cx - 1;gx <= cx + 1; gx++) {
        const h = hash2(gx, gz, seed ^ 450782);
        if (h % 24 !== 0)
          continue;
        const ox = gx * 16 + (h >>> 5 & 15), oz = gz * 16 + (h >>> 9 & 15);
        const oy = -50 + (h >>> 13) % 70;
        const R = 5 + (h >>> 20) % 3;
        if (oy + R > this.columnInfo(ox, oz).height - 10)
          continue;
        for (let y = oy - R;y <= oy + R; y++) {
          if (y <= MIN_Y + 4)
            continue;
          for (let z = Math.max(z0, oz - R);z <= Math.min(z0 + 15, oz + R); z++) {
            for (let x = Math.max(x0, ox - R);x <= Math.min(x0 + 15, ox + R); x++) {
              const j = hash3(x, y, z, seed ^ 2528);
              const d = Math.hypot(x - ox, (y - oy) * 1.1, z - oz) + j % 5 * 0.08;
              if (d > R)
                continue;
              const i = blockIndex(x - x0, y, z - z0);
              if (d > R - 1)
                blocks[i] = SMOOTH_BASALT;
              else if (d > R - 2)
                blocks[i] = CALCITE;
              else if (d > R - 3)
                blocks[i] = (j >>> 8) % 1000 < 83 ? BUDDING_AMETHYST : AMETHYST_BLOCK;
              else
                blocks[i] = AIR;
            }
          }
        }
        const shellD = (x, y, z) => Math.hypot(x - ox, (y - oy) * 1.1, z - oz) + hash3(x, y, z, seed ^ 2528) % 5 * 0.08;
        for (let y = oy - R;y <= oy + R; y++) {
          if (y <= MIN_Y + 5)
            continue;
          for (let z = oz - R;z <= oz + R; z++) {
            for (let x = ox - R;x <= ox + R; x++) {
              const d = shellD(x, y, z);
              if (d > R - 2 || d <= R - 3 || (hash3(x, y, z, seed ^ 2528) >>> 8) % 1000 >= 83)
                continue;
              const k = hash3(x, y, z, seed ^ 2622);
              if ((k >>> 4) % 100 >= 35)
                continue;
              for (let dir = 0;dir < 6; dir++) {
                const [dx, dy, dz] = DIR_VEC[dir];
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (shellD(nx, ny, nz) > R - 3)
                  continue;
                if (nx >= x0 && nx < x0 + 16 && nz >= z0 && nz < z0 + 16 && ny > MIN_Y + 4)
                  blocks[blockIndex(nx - x0, ny, nz - z0)] = amethystBudAt(k % 4, dir);
                break;
              }
            }
          }
        }
      }
    }
  }
  findSpawn() {
    const info = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    for (let r = 0;r < 4000; r += 16) {
      const steps = Math.max(1, Math.floor(r * 2 * Math.PI / 16));
      for (let s = 0;s < steps; s++) {
        const a = s / steps * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r);
        const z = Math.round(Math.sin(a) * r);
        this.columnInfo(x, z, info);
        if (isOceanBiome(info.biome) || baseBiome(info.biome) === BIOME_OCEAN || info.mount > 0.35)
          continue;
        const y = this.surfaceAt(x, z, info);
        if (y >= SEA_LEVEL && y < 110)
          return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 120, z: 0.5 };
  }
}
export {
  BIOME_NAMES,
  BLOCKS,
  MAX_Y,
  MIN_Y,
  SEA_LEVEL,
  TerrainGenerator
};
