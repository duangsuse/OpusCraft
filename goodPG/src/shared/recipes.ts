// Recetas de fabricación (cuadrícula 2x2 del inventario y 3x3 de la mesa de trabajo).
import { WITHER_ROSE } from './blocks'; // Fase 8.7
import {
  CRAFTING_TABLE, TORCH, CHEST, FURNACE, WOOD_TYPES, COBBLED_DEEPSLATE, COPPER_BLOCK, EMERALD_BLOCK, AMETHYST_BLOCK,
  TINTED_GLASS, MOSS_BLOCK, MOSS_CARPET, SNOW_BLOCK, SNOW_LAYER, ALL_LOGS, ALL_PLANKS, MATERIALS, WOODS, RED_SAND, RED_SANDSTONE,
  COBBLESTONE, STONE, STONE_BRICKS, SAND, SANDSTONE, BRICKS, CLAY, BOOKSHELF, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK,
  WHITE_WOOL, RED_WOOL, YELLOW_WOOL, BLUE_WOOL, POPPY, DANDELION, CORNFLOWER, SUGAR_CANE, GLASS, SLABS, STAIRS,
  FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, RED_BED, HAY_BALE, CAKE, PUMPKIN, MELON, CARVED_PUMPKIN,
  JACK_O_LANTERN, COMPOSTER, WALLS, WALL_SOURCE, BEDS, SIGNS, SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER,
  ORANGE_WOOL, BLACK_WOOL, LIME_WOOL, PURPLE_WOOL,
  LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE, SMITHING_TABLE, CAULDRON, // Fase 6 (aldeanos)
} from './blocks';
import {
  STICK, COAL, CHARCOAL, IRON_INGOT, GOLD_INGOT, DIAMOND, FLINT, FEATHER, STRING, PAPER, BOOK, LEATHER, BRICK,
  CLAY_BALL, BUCKET, BOW, ARROW, SHEARS, LAPIS, TOOLS, BONE, BREAD, WHEAT, SUGAR, EGG, MILK_BUCKET, BONE_MEAL,
  APPLE, GOLDEN_APPLE, SHIELD, COPPER_INGOT, EMERALD, AMETHYST_SHARD, COMPASS, EMPTY_MAP, SNOWBALL, REDSTONE, PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, PUMPKIN_PIE, FISHING_ROD,
  ARMOR, type ItemStack,
  SADDLE, // Fase 6 (monturas)
} from './items';
// Fase 6 (fauna).
import { BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK } from './blocks';
import { GLASS_BOTTLE, HONEY_BOTTLE, HONEYCOMB, BRUSH, RABBIT_HIDE } from './items';
// Fase 6.5 (colores).
import {
  DYE_COLORS, WOOL, CARPETS, CONCRETE_POWDER, STAINED_GLASS, STAINED_GLASS_PANES, COLORED_TERRACOTTA, TERRACOTTA, CANDLE,
  CANDLES, BANNERS, FLOWERS, PINK_PETALS, GRAVEL, type DyeColor,
} from './blocks';
import { DYES, BEETROOT } from './items';
// Fase 6.5 (piedras).
import {
  VINE, MOSSY_COBBLESTONE, MOSSY_STONE_BRICKS, GRANITE, DIORITE, ANDESITE, TUFF, CUT_SANDSTONE, CHISELED_SANDSTONE,
  SMOOTH_STONE, CHISELED_STONE_BRICKS, POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE, POLISHED_DEEPSLATE,
  DEEPSLATE_BRICKS, DEEPSLATE_TILES, CHISELED_DEEPSLATE, POLISHED_TUFF, TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS,
  CUT_RED_SANDSTONE, CHISELED_RED_SANDSTONE, MUD, PACKED_MUD, MUD_BRICKS, CINNABAR, POLISHED_CINNABAR, CINNABAR_BRICKS,
  CHISELED_CINNABAR, SULFUR, POLISHED_SULFUR, SULFUR_BRICKS, CHISELED_SULFUR,
} from './blocks';
// Fase 6.5 (cobre).
import { COPPER, OXIDATION_STAGES, RAW_COPPER_BLOCK, COPPER_TORCH, type CopperKind } from './blocks';
import { RAW_COPPER, COPPER_NUGGET } from './items';
// Fase 6.5 (decoración).
import { FLOWER_POT, LANTERN, IRON_CHAIN, IRON_BARS, SCAFFOLDING, DECORATED_POT, RED_MUSHROOM, BROWN_MUSHROOM } from './blocks';
import {
  BOWL, INK_SAC, IRON_NUGGET, GOLD_NUGGET, COCOA_BEANS, COOKIE, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW,
  GOLDEN_CARROT, GLISTERING_MELON_SLICE, SPYGLASS, CLOCK, PAINTING, ITEM_FRAME, COOKED_RABBIT, CARROT, BAKED_POTATO,
} from './items';
import { SUSPICIOUS_FLOWERS } from './decorFood';
// Fase 6.5 (océano y plantas).
import {
  DRIED_KELP_BLOCK, PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, SEA_LANTERN, SUNFLOWER, LILAC, ROSE_BUSH, PEONY, TORCHFLOWER,
  PITCHER_PLANT,
} from './blocks';
import { ITEMS, DRIED_KELP, PRISMARINE_SHARD, PRISMARINE_CRYSTALS } from './items';

type Cell = readonly number[] | null;

interface Shaped {
  w: number;
  h: number;
  cells: Cell[];
  out: ItemStack;
}

interface Shapeless {
  items: (readonly number[])[];
  out: ItemStack;
}

/** Cualquier tablón (palos, mesa, cofre, herramientas de madera…). */
const PLANKS = ALL_PLANKS;
const FUEL_COAL = [COAL, CHARCOAL] as const;

const shaped: Shaped[] = [];
const shapeless: Shapeless[] = [];

/** Receta con forma: filas de caracteres y leyenda (espacio = vacío). */
function shape(rows: string[], key: Record<string, number | readonly number[]>, id: number, count = 1): void {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x] ?? ' ';
      if (ch === ' ') cells.push(null);
      else {
        const k = key[ch];
        if (k === undefined) throw new Error('Clave de receta desconocida: ' + ch);
        cells.push(typeof k === 'number' ? [k] : k);
      }
    }
  }
  shaped.push({ w, h, cells, out: { id, count } });
}

function mix(items: (number | readonly number[])[], id: number, count = 1): void {
  shapeless.push({ items: items.map((i) => (typeof i === 'number' ? [i] : i)), out: { id, count } });
}

// --- Madera ---
for (const w of WOOD_TYPES) mix([w.log], w.planks, 4);
shape(['P', 'P'], { P: PLANKS }, STICK, 4);
shape(['PP', 'PP'], { P: PLANKS }, CRAFTING_TABLE);
shape(['C', 'S'], { C: FUEL_COAL, S: STICK }, TORCH, 4);
shape(['PPP', 'P P', 'PPP'], { P: PLANKS }, CHEST);
shape(['PPP', 'BBB', 'PPP'], { P: PLANKS, B: BOOK }, BOOKSHELF);

// --- Piedra y construcción ---
/** Roca para herramientas de piedra y hornos (también la de pizarra profunda). */
const ROCKS = [COBBLESTONE, COBBLED_DEEPSLATE] as const;
shape(['CCC', 'C C', 'CCC'], { C: ROCKS }, FURNACE);
shape(['SS', 'SS'], { S: STONE }, STONE_BRICKS, 4);
shape(['SS', 'SS'], { S: SAND }, SANDSTONE);
shape(['SS', 'SS'], { S: RED_SAND }, RED_SANDSTONE);
shape(['BB', 'BB'], { B: BRICK }, BRICKS);
shape(['CC', 'CC'], { C: CLAY_BALL }, CLAY);

// --- Losas, escaleras, vallas, puertas... (como en Minecraft) ---
for (const { key, block } of MATERIALS) {
  shape(['MMM'], { M: block }, SLABS[key], 6);
  shape(['M  ', 'MM ', 'MMM'], { M: block }, STAIRS[key], 4);
}
for (const { key, block: planks } of WOODS) {
  shape(['PSP', 'PSP'], { P: planks, S: STICK }, FENCES[key], 3);
  shape(['SPS', 'SPS'], { P: planks, S: STICK }, FENCE_GATES[key]);
  shape(['PP', 'PP', 'PP'], { P: planks }, DOORS[key], 3);
  shape(['PPP', 'PPP'], { P: planks }, TRAPDOORS[key], 2);
}
shape(['S S', 'SSS', 'S S'], { S: STICK }, LADDER, 3);
shape(['GGG', 'GGG'], { G: GLASS }, GLASS_PANE, 16);
shape(['WWW', 'PPP'], { W: RED_WOOL, P: PLANKS }, RED_BED);

// --- Herramientas ---
const MATS: [string, number | readonly number[]][] = [
  ['wooden', PLANKS], ['stone', ROCKS], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND],
];
for (const [mat, m] of MATS) {
  shape(['MMM', ' S ', ' S '], { M: m, S: STICK }, TOOLS[mat].pickaxe);
  shape(['MM', 'MS', ' S'], { M: m, S: STICK }, TOOLS[mat].axe);
  shape(['M', 'S', 'S'], { M: m, S: STICK }, TOOLS[mat].shovel);
  shape(['M', 'M', 'S'], { M: m, S: STICK }, TOOLS[mat].sword);
  shape(['MM', ' S', ' S'], { M: m, S: STICK }, TOOLS[mat].hoe);
}
shape(['I I', ' I '], { I: IRON_INGOT }, BUCKET);
shape([' I', 'I '], { I: IRON_INGOT }, SHEARS);
shape([' SW', 'S W', ' SW'], { S: STICK, W: STRING }, BOW);
shape(['F', 'S', 'E'], { F: FLINT, S: STICK, E: FEATHER }, ARROW, 4);

// --- Armaduras ---
const ARMOR_MATS: [string, number][] = [['leather', LEATHER], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND]];
for (const [mat, m] of ARMOR_MATS) {
  shape(['MMM', 'M M'], { M: m }, ARMOR[mat].helmet);
  shape(['M M', 'MMM', 'MMM'], { M: m }, ARMOR[mat].chestplate);
  shape(['MMM', 'M M', 'M M'], { M: m }, ARMOR[mat].leggings);
  shape(['M M', 'M M'], { M: m }, ARMOR[mat].boots);
}

// --- Granja ---
shape(['WWW'], { W: WHEAT }, BREAD);
shape(['WWW', 'WWW', 'WWW'], { W: WHEAT }, HAY_BALE);
mix([HAY_BALE], WHEAT, 9);
mix([BONE], BONE_MEAL, 3);
mix([SUGAR_CANE], SUGAR);
shape(['MMM', 'SES', 'WWW'], { M: MILK_BUCKET, S: SUGAR, E: EGG, W: WHEAT }, CAKE);

/** Lo que queda en la cuadrícula al fabricar (los cubos de leche de la tarta vuelven vacíos). */
export const CRAFT_REMAINDER: Readonly<Record<number, number>> = { [MILK_BUCKET]: BUCKET, [HONEY_BOTTLE]: GLASS_BOTTLE };

// --- Calabazas, sandías, compostador y pesca ---
mix([PUMPKIN], PUMPKIN_SEEDS, 4);
mix([MELON_SLICE], MELON_SEEDS);
shape(['MMM', 'MMM', 'MMM'], { M: MELON_SLICE }, MELON);
mix([PUMPKIN, SUGAR, EGG], PUMPKIN_PIE);
shape(['C', 'T'], { C: CARVED_PUMPKIN, T: TORCH }, JACK_O_LANTERN);
shape(['S S', 'S S', 'SSS'], { S: WOODS.map((w) => SLABS[w.key]) }, COMPOSTER);
shape(['  S', ' SW', 'S W'], { S: STICK, W: STRING }, FISHING_ROD);

// --- Muros, camas de colores, carteles y bloques de trabajo ---
for (const wall of Object.values(WALLS)) shape(['MMM', 'MMM'], { M: WALL_SOURCE[wall] }, wall, 6);
const WOOL_OF: Record<string, number> = {
  white: WHITE_WOOL, black: BLACK_WOOL, orange: ORANGE_WOOL, yellow: YELLOW_WOOL, lime: LIME_WOOL, blue: BLUE_WOOL,
  purple: PURPLE_WOOL,
};
for (const [color, bed] of Object.entries(BEDS)) if (WOOL_OF[color]) shape(['WWW', 'PPP'], { W: WOOL_OF[color], P: PLANKS }, bed);
for (const w of WOOD_TYPES) shape(['PPP', 'PPP', ' S '], { P: w.planks, S: STICK }, SIGNS[w.key], 3);
const LOGS = ALL_LOGS;
shape([' L ', 'LFL', ' L '], { L: LOGS, F: FURNACE }, SMOKER);
shape(['III', 'IFI', 'SSS'], { I: IRON_INGOT, F: FURNACE, S: SMOOTH_STONE }, BLAST_FURNACE);
shape([' S ', 'SCS', 'LLL'], { S: STICK, C: FUEL_COAL, L: LOGS }, CAMPFIRE);
shape([' I ', 'SSS'], { I: IRON_INGOT, S: STONE }, STONECUTTER);

// --- Subsuelo (fase 5) ---
shape(['III', 'III', 'III'], { I: COPPER_INGOT }, COPPER_BLOCK);
mix([COPPER_BLOCK], COPPER_INGOT, 9);
shape(['EEE', 'EEE', 'EEE'], { E: EMERALD }, EMERALD_BLOCK);
mix([EMERALD_BLOCK], EMERALD, 9);
shape(['AA', 'AA'], { A: AMETHYST_SHARD }, AMETHYST_BLOCK);
shape([' A ', 'AGA', ' A '], { A: AMETHYST_SHARD, G: GLASS }, TINTED_GLASS, 2);
shape(['MM'], { M: MOSS_BLOCK }, MOSS_CARPET, 3);

// --- Mapas, brújula y nieve (fase 5) ---
shape([' I ', 'IRI', ' I '], { I: IRON_INGOT, R: REDSTONE }, COMPASS);
shape(['PPP', 'PCP', 'PPP'], { P: PAPER, C: COMPASS }, EMPTY_MAP);
shape(['SS', 'SS'], { S: SNOWBALL }, SNOW_BLOCK);
shape(['BBB'], { B: SNOW_BLOCK }, SNOW_LAYER, 6);

// --- Combate y estado ---
shape(['GGG', 'GAG', 'GGG'], { G: GOLD_INGOT, A: APPLE }, GOLDEN_APPLE);
shape(['PIP', 'PPP', ' P '], { P: PLANKS, I: IRON_INGOT }, SHIELD);

// --- Papel y libros ---
shape(['CCC'], { C: SUGAR_CANE }, PAPER, 3);
mix([PAPER, PAPER, PAPER, LEATHER], BOOK);

// --- Bloques de mineral ---
shape(['III', 'III', 'III'], { I: IRON_INGOT }, IRON_BLOCK);
shape(['III', 'III', 'III'], { I: GOLD_INGOT }, GOLD_BLOCK);
shape(['III', 'III', 'III'], { I: DIAMOND }, DIAMOND_BLOCK);
mix([IRON_BLOCK], IRON_INGOT, 9);
mix([GOLD_BLOCK], GOLD_INGOT, 9);
mix([DIAMOND_BLOCK], DIAMOND, 9);

// --- Lana y tintes naturales ---
shape(['SS', 'SS'], { S: STRING }, WHITE_WOOL);
mix([POPPY, WHITE_WOOL], RED_WOOL);
mix([DANDELION, WHITE_WOOL], YELLOW_WOOL);
mix([CORNFLOWER, WHITE_WOOL], BLUE_WOOL);
mix([LAPIS, WHITE_WOOL], BLUE_WOOL);

// --- Fase 6 (monturas): silla de montar (cuero y un lingote de hierro, como en Minecraft 1.21.6) ---
shape([' L ', 'LIL'], { L: LEATHER, I: IRON_INGOT }, SADDLE); // Minecraft 26.x
// --- Fase 6 (aldeanos): bloques de trabajo ---
{
  const WOOD_SLABS = WOODS.map((w) => SLABS[w.key]);
  shape(['SSS', ' B ', ' S '], { S: WOOD_SLABS, B: BOOKSHELF }, LECTERN);
  shape(['PP', 'WW', 'WW'], { P: PAPER, W: PLANKS }, CARTOGRAPHY_TABLE);
  shape(['FF', 'WW', 'WW'], { F: FLINT, W: PLANKS }, FLETCHING_TABLE);
  shape(['WSW', 'W W', 'WSW'], { W: PLANKS, S: WOOD_SLABS }, BARREL);
  shape(['SS', 'WW'], { S: STRING, W: PLANKS }, LOOM);
  shape(['TST', 'W W'], { T: STICK, S: SLABS.stone, W: PLANKS }, GRINDSTONE);
  shape(['II', 'WW', 'WW'], { I: IRON_INGOT, W: PLANKS }, SMITHING_TABLE);
  shape(['I I', 'I I', 'III'], { I: IRON_INGOT }, CAULDRON);
}
// --- Fauna (fase 6): colmena, frascos, miel, panal, cepillo y piel de conejo ---
shape(['PPP', 'HHH', 'PPP'], { P: PLANKS, H: HONEYCOMB }, BEEHIVE);
shape(['G G', ' G '], { G: GLASS }, GLASS_BOTTLE, 3);
shape(['HH', 'HH'], { H: HONEY_BOTTLE }, HONEY_BLOCK);
mix([HONEY_BLOCK, GLASS_BOTTLE, GLASS_BOTTLE, GLASS_BOTTLE, GLASS_BOTTLE], HONEY_BOTTLE, 4);
mix([HONEY_BOTTLE], SUGAR, 3);
shape(['CC', 'CC'], { C: HONEYCOMB }, HONEYCOMB_BLOCK);
shape(['F', 'C', 'S'], { F: FEATHER, C: COPPER_INGOT, S: STICK }, BRUSH);
shape(['HH', 'HH'], { H: RABBIT_HIDE }, LEATHER);
// --- Fase 6.5 (cobre) ---
{
  shape(['NNN', 'NNN', 'NNN'], { N: COPPER_NUGGET }, COPPER_INGOT);
  mix([COPPER_INGOT], COPPER_NUGGET, 9);
  shape(['RRR', 'RRR', 'RRR'], { R: RAW_COPPER }, RAW_COPPER_BLOCK);
  mix([RAW_COPPER_BLOCK], RAW_COPPER, 9);
  mix([COPPER.block[1][0]], COPPER_INGOT, 9); // el bloque encerado también se deshace en lingotes
  for (let s = 0; s < OXIDATION_STAGES; s++) {
    for (const w of [0, 1]) {
      const [block, cut, slab] = [COPPER.block[w][s], COPPER.cut[w][s], COPPER.cut_slab[w][s]];
      shape(['BB', 'BB'], { B: block }, cut, 4);
      shape(['CCC'], { C: cut }, slab, 6);
      shape(['C  ', 'CC ', 'CCC'], { C: cut }, COPPER.cut_stairs[w][s], 4);
      shape(['S', 'S'], { S: slab }, COPPER.chiseled[w][s]);
      shape([' B ', 'B B', ' B '], { B: block }, COPPER.grate[w][s], 4);
    }
    // Encerar con panal (sin mesa de trabajo): cualquier bloque de cobre sin cera y un panal.
    for (const kind of Object.keys(COPPER) as CopperKind[]) mix([COPPER[kind][0][s], HONEYCOMB], COPPER[kind][1][s]);
  }
  const I = COPPER_INGOT;
  shape(['II', 'II', 'II'], { I }, COPPER.door[0][0], 3);
  shape(['II', 'II'], { I }, COPPER.trapdoor[0][0]);
  shape(['III', 'III'], { I }, COPPER.bars[0][0], 16);
  shape(['N', 'I', 'N'], { N: COPPER_NUGGET, I }, COPPER.chain[0][0]);
  shape(['N', 'C', 'S'], { N: COPPER_NUGGET, C: FUEL_COAL, S: STICK }, COPPER_TORCH, 4);
  shape(['NNN', 'NTN', 'NNN'], { N: COPPER_NUGGET, T: COPPER_TORCH }, COPPER.lantern[0][0]);
  shape(['MMM', ' S ', ' S '], { M: I, S: STICK }, TOOLS.copper.pickaxe);
  shape(['MM', 'MS', ' S'], { M: I, S: STICK }, TOOLS.copper.axe);
  shape(['M', 'S', 'S'], { M: I, S: STICK }, TOOLS.copper.shovel);
  shape(['M', 'M', 'S'], { M: I, S: STICK }, TOOLS.copper.sword);
  shape(['MM', ' S', ' S'], { M: I, S: STICK }, TOOLS.copper.hoe);
  shape(['MMM', 'M M'], { M: I }, ARMOR.copper.helmet);
  shape(['M M', 'MMM', 'MMM'], { M: I }, ARMOR.copper.chestplate);
  shape(['MMM', 'M M', 'M M'], { M: I }, ARMOR.copper.leggings);
  shape(['M M', 'M M'], { M: I }, ARMOR.copper.boots);
}

// --- Fase 6.5 (maderas): sin corteza, leños y bambú ---
import { WOOD_EXTRAS, BAMBOO, BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_PLANKS, BAMBOO_MOSAIC } from './blocks';
for (const { wood, strippedLog, woodBlock, strippedWood } of WOOD_EXTRAS) {
  for (const id of [strippedLog, woodBlock, strippedWood]) mix([id], wood.planks, 4);
  shape(['LL', 'LL'], { L: wood.log }, woodBlock, 3);
  shape(['LL', 'LL'], { L: strippedLog }, strippedWood, 3);
}
shape(['BBB', 'BBB', 'BBB'], { B: BAMBOO }, BAMBOO_BLOCK);
mix([BAMBOO_BLOCK], BAMBOO_PLANKS, 2);
mix([STRIPPED_BAMBOO_BLOCK], BAMBOO_PLANKS, 2);
shape(['B', 'B'], { B: BAMBOO }, STICK);
shape(['S', 'S'], { S: SLABS.bamboo }, BAMBOO_MOSAIC);
shape(['PPP', 'PPP', ' S '], { P: BAMBOO_PLANKS, S: STICK }, SIGNS.bamboo, 3);
// --- Fase 6.5 (colores): tintes y todo lo que se tiñe ---
{
  const D = DYES;
  // Tintes de flores y plantas (las flores nuevas traen sus recetas con ellas).
  const fromPlant: [number, DyeColor, number][] = [
    [BONE_MEAL, 'white', 1], [FLOWERS.lily_of_the_valley, 'white', 1], [FLOWERS.orange_tulip, 'orange', 1],
    [FLOWERS.allium, 'magenta', 1], [FLOWERS.blue_orchid, 'light_blue', 1], [DANDELION, 'yellow', 1],
    [FLOWERS.pink_tulip, 'pink', 1], [PINK_PETALS, 'pink', 1], [FLOWERS.azure_bluet, 'light_gray', 1],
    [FLOWERS.oxeye_daisy, 'light_gray', 1], [FLOWERS.white_tulip, 'light_gray', 1], [LAPIS, 'blue', 1],
    [CORNFLOWER, 'blue', 1], [POPPY, 'red', 1], [FLOWERS.red_tulip, 'red', 1], [BEETROOT, 'red', 1],
  ];
  for (const [plant, c, n] of fromPlant) mix([plant], D[c], n);
  // Mezclas de tintes (como en Minecraft).
  mix([D.red, D.yellow], D.orange, 2);
  mix([D.purple, D.pink], D.magenta, 2);
  mix([D.blue, D.red, D.pink], D.magenta, 3);
  mix([D.blue, D.red, D.red, D.white], D.magenta, 4);
  mix([D.blue, D.white], D.light_blue, 2);
  mix([D.green, D.white], D.lime, 2);
  mix([D.red, D.white], D.pink, 2);
  mix([D.black, D.white], D.gray, 2);
  mix([D.gray, D.white], D.light_gray, 2);
  mix([D.black, D.white, D.white], D.light_gray, 3);
  mix([D.blue, D.green], D.cyan, 2);
  mix([D.blue, D.red], D.purple, 2);

  const ANY_WOOL = DYE_COLORS.map((c) => WOOL[c]);
  const ANY_CARPET = DYE_COLORS.map((c) => CARPETS[c]);
  const ANY_BED = DYE_COLORS.map((c) => BEDS[c]);
  const ANY_CANDLE = [CANDLE, ...DYE_COLORS.map((c) => CANDLES[c])];
  shape(['S', 'H'], { S: STRING, H: HONEYCOMB }, CANDLE);
  for (const c of DYE_COLORS) {
    const dye = D[c];
    // Teñir: lana, cama y vela de uno en uno; alfombras, cristal, paneles y terracota de ocho en ocho.
    mix([dye, ANY_WOOL], WOOL[c]);
    mix([dye, ANY_BED], BEDS[c]);
    mix([dye, ANY_CANDLE], CANDLES[c]);
    shape(['CCC', 'CDC', 'CCC'], { C: ANY_CARPET, D: dye }, CARPETS[c], 8);
    shape(['GGG', 'GDG', 'GGG'], { G: GLASS, D: dye }, STAINED_GLASS[c], 8);
    shape(['GGG', 'GDG', 'GGG'], { G: GLASS_PANE, D: dye }, STAINED_GLASS_PANES[c], 8);
    shape(['TTT', 'TDT', 'TTT'], { T: TERRACOTTA, D: dye }, COLORED_TERRACOTTA[c], 8);
    mix([dye, SAND, SAND, SAND, SAND, GRAVEL, GRAVEL, GRAVEL, GRAVEL], CONCRETE_POWDER[c], 8);
    // Con la lana o el cristal de su color.
    shape(['WW'], { W: WOOL[c] }, CARPETS[c], 3);
    shape(['GGG', 'GGG'], { G: STAINED_GLASS[c] }, STAINED_GLASS_PANES[c], 16);
    shape(['WWW', 'WWW', ' S '], { W: WOOL[c], S: STICK }, BANNERS[c]);
    if (!WOOL_OF[c] && c !== 'red') shape(['WWW', 'PPP'], { W: WOOL[c], P: PLANKS }, BEDS[c]);
  }
}

// --- Fase 6.5 (piedras): piedras pulidas, ladrillos, azulejos, cinceladas, losas sueltas y barro ---
// (las losas, escaleras y muros de MATERIALS y WALLS ya salen de los bucles de arriba)
{
  const four = (from: number, to: number) => shape(['SS', 'SS'], { S: from }, to, 4);
  four(GRANITE, POLISHED_GRANITE);
  four(DIORITE, POLISHED_DIORITE);
  four(ANDESITE, POLISHED_ANDESITE);
  four(COBBLED_DEEPSLATE, POLISHED_DEEPSLATE);
  four(POLISHED_DEEPSLATE, DEEPSLATE_BRICKS);
  four(DEEPSLATE_BRICKS, DEEPSLATE_TILES);
  four(TUFF, POLISHED_TUFF);
  four(POLISHED_TUFF, TUFF_BRICKS);
  four(SANDSTONE, CUT_SANDSTONE);
  four(RED_SANDSTONE, CUT_RED_SANDSTONE);
  four(PACKED_MUD, MUD_BRICKS);
  four(CINNABAR, POLISHED_CINNABAR);
  four(POLISHED_CINNABAR, CINNABAR_BRICKS);
  four(SULFUR, POLISHED_SULFUR);
  four(POLISHED_SULFUR, SULFUR_BRICKS);
  // Cinceladas: dos losas una encima de otra.
  const chisel = (slab: number, to: number) => shape(['S', 'S'], { S: slab }, to);
  chisel(SLABS.stone_brick, CHISELED_STONE_BRICKS);
  chisel(SLABS.cobbled_deepslate, CHISELED_DEEPSLATE);
  chisel(SLABS.tuff, CHISELED_TUFF);
  chisel(SLABS.tuff_brick, CHISELED_TUFF_BRICKS);
  chisel(SLABS.sandstone, CHISELED_SANDSTONE);
  chisel(SLABS.red_sandstone, CHISELED_RED_SANDSTONE);
  chisel(SLABS.cinnabar, CHISELED_CINNABAR);
  chisel(SLABS.sulfur, CHISELED_SULFUR);
  // Losas sueltas (sin escaleras).
  shape(['MMM'], { M: SMOOTH_STONE }, SLABS.smooth_stone, 6);
  shape(['MMM'], { M: CUT_SANDSTONE }, SLABS.cut_sandstone, 6);
  shape(['MMM'], { M: CUT_RED_SANDSTONE }, SLABS.cut_red_sandstone, 6);
  // Musgo, andesita y barro compacto.
  mix([COBBLESTONE, [MOSS_BLOCK, VINE]], MOSSY_COBBLESTONE);
  mix([STONE_BRICKS, [MOSS_BLOCK, VINE]], MOSSY_STONE_BRICKS);
  mix([DIORITE, COBBLESTONE], ANDESITE, 2);
  mix([MUD, WHEAT], PACKED_MUD);
}

// --- Fase 6.5 (decoración): comida, pepitas, macetas, faroles, cadenas, barrotes, andamios, vasijas,
// cuadros, marcos, catalejo y reloj (como en Minecraft; el andamio lleva palos porque no hay bambú) ---
{
  shape(['P P', ' P '], { P: PLANKS }, BOWL, 4);
  mix([IRON_INGOT], IRON_NUGGET, 9);
  shape(['NNN', 'NNN', 'NNN'], { N: IRON_NUGGET }, IRON_INGOT);
  mix([GOLD_INGOT], GOLD_NUGGET, 9);
  shape(['NNN', 'NNN', 'NNN'], { N: GOLD_NUGGET }, GOLD_INGOT);
  shape(['WCW'], { W: WHEAT, C: COCOA_BEANS }, COOKIE, 8);
  mix([COCOA_BEANS], DYES.brown); // tinte marrón (los granos de cacao llegan con la decoración)
  mix([INK_SAC], DYES.black); // tinte negro
  mix([WITHER_ROSE], DYES.black); // Fase 8.7: también de la rosa marchita
  mix([[RED_MUSHROOM, BROWN_MUSHROOM], [RED_MUSHROOM, BROWN_MUSHROOM], BOWL], MUSHROOM_STEW); // dos champiñones cualesquiera
  mix([COOKED_RABBIT, CARROT, BAKED_POTATO, [RED_MUSHROOM, BROWN_MUSHROOM], BOWL], RABBIT_STEW);
  mix([BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BOWL], BEETROOT_SOUP);
  // Estofado sospechoso: la flor queda anotada en el desgaste de la pila (su efecto, en decorFood.ts).
  SUSPICIOUS_FLOWERS.forEach(([flower], i) => {
    shapeless.push({ items: [[RED_MUSHROOM, BROWN_MUSHROOM], [RED_MUSHROOM, BROWN_MUSHROOM], [BOWL], [flower]], out: { id: SUSPICIOUS_STEW, count: 1, dmg: i + 1 } });
  });
  shape(['NNN', 'NCN', 'NNN'], { N: GOLD_NUGGET, C: CARROT }, GOLDEN_CARROT);
  shape(['NNN', 'NMN', 'NNN'], { N: GOLD_NUGGET, M: MELON_SLICE }, GLISTERING_MELON_SLICE);
  shape(['A', 'C', 'C'], { A: AMETHYST_SHARD, C: COPPER_INGOT }, SPYGLASS);
  shape([' G ', 'GRG', ' G '], { G: GOLD_INGOT, R: REDSTONE }, CLOCK);
  const WOOLS = [WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL];
  shape(['SSS', 'SWS', 'SSS'], { S: STICK, W: WOOLS }, PAINTING);
  shape(['SSS', 'SLS', 'SSS'], { S: STICK, L: LEATHER }, ITEM_FRAME);
  shape(['B B', ' B '], { B: BRICK }, FLOWER_POT);
  shape(['NNN', 'NTN', 'NNN'], { N: IRON_NUGGET, T: TORCH }, LANTERN);
  shape(['N', 'I', 'N'], { N: IRON_NUGGET, I: IRON_INGOT }, IRON_CHAIN);
  shape(['III', 'III'], { I: IRON_INGOT }, IRON_BARS, 16);
  shape(['BWB', 'B B', 'B B'], { B: BAMBOO, W: STRING }, SCAFFOLDING, 6); // de bambú, como en Minecraft
  shape([' B ', 'B B', ' B '], { B: BRICK }, DECORATED_POT);
}

// --- Fase 6.5 (océano y plantas): algas secas, prismarina, linterna marina y tintes de las flores nuevas ---
{
  shape(['KKK', 'KKK', 'KKK'], { K: DRIED_KELP }, DRIED_KELP_BLOCK);
  mix([DRIED_KELP_BLOCK], DRIED_KELP, 9);
  shape(['SS', 'SS'], { S: PRISMARINE_SHARD }, PRISMARINE);
  shape(['SSS', 'SSS', 'SSS'], { S: PRISMARINE_SHARD }, PRISMARINE_BRICKS);
  shape(['SCS', 'CCC', 'SCS'], { S: PRISMARINE_SHARD, C: PRISMARINE_CRYSTALS }, SEA_LANTERN);
  // Los tintes los define otro módulo: se buscan por clave y, si aún no existen, se saltan.
  const dye = (color: string): number | undefined => ITEMS.find((i) => i?.key === `${color}_dye`)?.id;
  const black = dye('black');
  if (black !== undefined) shape(['SSS', 'SDS', 'SSS'], { S: PRISMARINE_SHARD, D: black }, DARK_PRISMARINE);
  const FLOWER_DYES: [number, string, number][] = [
    [SUNFLOWER, 'yellow', 2], [LILAC, 'magenta', 2], [ROSE_BUSH, 'red', 2], [PEONY, 'pink', 2], [TORCHFLOWER, 'orange', 1],
    [PITCHER_PLANT, 'cyan', 2],
  ];
  for (const [flower, color, n] of FLOWER_DYES) {
    const id = dye(color);
    if (id !== undefined) mix([flower], id, n);
  }
}

// Fase 6.5 (remate): carteles colgantes (2 cadenas y 6 troncos descortezados → 6).
import { HANGING_SIGNS, HANGING_SIGN_LOG } from './blocks';
for (const [k, id] of Object.entries(HANGING_SIGNS)) shape(['C C', 'LLL', 'LLL'], { C: IRON_CHAIN, L: HANGING_SIGN_LOG[k] }, id, 6);
// Correa (4 cuerdas y una bola de slime → 2) y etiqueta (papel y cuerda).
import { LEAD, NAME_TAG, SLIME_BALL } from './items';
// Minecraft 26.x: la correa sólo lleva cuerda y la etiqueta es papel con una pepita de metal.
shape(['SS ', 'SS ', '  S'], { S: STRING }, LEAD, 2);
shape([' N', 'P '], { P: PAPER, N: [IRON_NUGGET, GOLD_NUGGET, COPPER_NUGGET] }, NAME_TAG);
// Saco (cuerda sobre cuero) y teñirlo de cualquiera de los 16 colores (se queda con lo que lleva).
import { BUNDLE, DYED_BUNDLES } from './items';
shape(['S', 'L'], { S: STRING, L: LEATHER }, BUNDLE);
{
  const ANY_BUNDLE = [BUNDLE, ...Object.values(DYED_BUNDLES)];
  for (const c of DYE_COLORS) mix([ANY_BUNDLE, DYES[c]], DYED_BUNDLES[c]);
}
// Soporte para armadura: 6 palos y una losa de piedra lisa.
import { ARMOR_STAND } from './items';
shape(['SSS', ' S ', 'SLS'], { S: STICK, L: SLABS.smooth_stone }, ARMOR_STAND);
// Estantería cincelada: 6 tablones y 3 losas de madera (de cualquier madera).
import { CHISELED_BOOKSHELF } from './blocks';
shape(['PPP', 'SSS', 'PPP'], { P: PLANKS, S: WOODS.map((w) => SLABS[w.key]).filter((id) => id !== undefined) }, CHISELED_BOOKSHELF);
// Fase 6.5 (colecciones): tocadiscos (8 tablones y un diamante) y marco brillante (marco y saco de tinta brillante).
import { JUKEBOX } from './blocks';
import { GLOW_INK_SAC, GLOW_ITEM_FRAME } from './items';
shape(['PPP', 'PDP', 'PPP'], { P: PLANKS, D: DIAMOND }, JUKEBOX);
mix([ITEM_FRAME, GLOW_INK_SAC], GLOW_ITEM_FRAME);

// --- Fase 6.5 (materiales): bloques de almacenamiento (9 ↔ 1), hielo compacto y azul, tierra gruesa ---
import {
  RAW_IRON_BLOCK, RAW_GOLD_BLOCK, COAL_BLOCK, LAPIS_BLOCK, BONE_BLOCK, SLIME_BLOCK, ICE, PACKED_ICE, BLUE_ICE, DIRT,
  COARSE_DIRT,
} from './blocks';
import { RAW_IRON, RAW_GOLD } from './items';
{
  const nine = (unit: number, blockId: number) => {
    shape(['UUU', 'UUU', 'UUU'], { U: unit }, blockId);
    mix([blockId], unit, 9);
  };
  nine(RAW_IRON, RAW_IRON_BLOCK);
  nine(RAW_GOLD, RAW_GOLD_BLOCK);
  nine(COAL, COAL_BLOCK);
  nine(LAPIS, LAPIS_BLOCK);
  nine(BONE_MEAL, BONE_BLOCK);
  nine(SLIME_BALL, SLIME_BLOCK);
  shape(['III', 'III', 'III'], { I: ICE }, PACKED_ICE);
  shape(['III', 'III', 'III'], { I: PACKED_ICE }, BLUE_ICE);
  shape(['DG', 'GD'], { D: DIRT, G: GRAVEL }, COARSE_DIRT, 4);
}

export interface RecipeMatch {
  out: ItemStack;
}

/** Busca la receta que coincide con la cuadrícula (size 2 o 3; ids, 0 = vacío). */
export function matchRecipe(grid: readonly number[], size: number): RecipeMatch | null {
  // Caja envolvente de las celdas ocupadas.
  let x0 = size, y0 = size, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y * size + x] > 0) {
        n++;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  if (n === 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for (const r of shaped) {
    if (r.w !== w || r.h !== h) continue;
    for (const mirror of [false, true]) {
      let ok = true;
      for (let y = 0; y < h && ok; y++) {
        for (let x = 0; x < w; x++) {
          const cell = r.cells[y * w + (mirror ? w - 1 - x : x)];
          const id = grid[(y0 + y) * size + x0 + x];
          if (cell === null ? id !== 0 : !cell.includes(id)) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return { out: { ...r.out } };
    }
  }
  const items = grid.filter((id) => id > 0);
  for (const r of shapeless) {
    if (r.items.length !== items.length) continue;
    const used = new Array(items.length).fill(false);
    let ok = true;
    for (const alt of r.items) {
      const k = items.findIndex((id, i) => !used[i] && alt.includes(id));
      if (k < 0) {
        ok = false;
        break;
      }
      used[k] = true;
    }
    if (ok) return { out: { ...r.out } };
  }
  return null;
}

/** Una receta de fabricación tal como la ve el libro de recetas (con forma: `cells` en filas; sin forma: en fila, `h` = 1). */
export interface CraftRecipe {
  shapeless: boolean;
  w: number;
  h: number;
  cells: readonly (readonly number[] | null)[];
  out: ItemStack;
}

/** Todas las recetas registradas (con forma y sin forma); el libro las lista y las coloca. */
export function craftRecipes(): CraftRecipe[] {
  return [
    ...shaped.map((r) => ({ shapeless: false, w: r.w, h: r.h, cells: r.cells, out: r.out })),
    ...shapeless.map((r) => ({ shapeless: true, w: r.items.length, h: 1, cells: r.items, out: r.out })),
  ];
}

/** Número de recetas (para la cobertura; cuenta también las que se registran más abajo). */
export function recipeCount(): number {
  return shaped.length + shapeless.length;
}

// Fase 6.5 (libros y estandartes): libro y pluma (libro, saco de tinta y pluma) y diseños de estandarte
// (papel y un objeto). El globo, que en
// Minecraft se compra al cartógrafo, sale del mapa vacío. La copia de libros escritos va aparte
// (books.ts: lleva datos y el original se queda).
import { WRITABLE_BOOK, BANNER_PATTERN_ITEMS, ENCHANTED_GOLDEN_APPLE } from './items';
import { SKULLS } from './blocks';
mix([BOOK, INK_SAC, FEATHER], WRITABLE_BOOK);
mix([PAPER, FLOWERS.oxeye_daisy], BANNER_PATTERN_ITEMS.flower);
mix([PAPER, SKULLS.creeper], BANNER_PATTERN_ITEMS.creeper); // Fase 6.5: ya hay cabeza de creeper
mix([PAPER, SKULLS.wither_skeleton], BANNER_PATTERN_ITEMS.skull); // Fase 8.3: ya hay cráneo de esqueleto wither
mix([PAPER, ENCHANTED_GOLDEN_APPLE], BANNER_PATTERN_ITEMS.thing); // Fase 6.5: ya hay manzana de oro encantada
mix([PAPER, EMPTY_MAP], BANNER_PATTERN_ITEMS.globe);
mix([PAPER, VINE], BANNER_PATTERN_ITEMS.curly_border);
mix([PAPER, BRICKS], BANNER_PATTERN_ITEMS.bricks);
// ------------------------------------------------------------------ Fase 6.5 (equipo)
// Mechero, ballesta (Fase 7: ya con su gancho de cuerda), caparazón
// de tortuga, armadura de cuero para caballo, armadura para lobo, caña con zanahoria y conducto (como
// en Minecraft). Los fuegos artificiales van aparte (fireworkCraft): sus colores viajan en la pila.
import {
  FLINT_AND_STEEL, CROSSBOW, TURTLE_SCUTE, TURTLE_HELMET, HORSE_ARMOR, WOLF_ARMOR, ARMADILLO_SCUTE, CARROT_ON_A_STICK,
  NAUTILUS_SHELL, HEART_OF_THE_SEA, FIREWORK_ROCKET, FIREWORK_STAR, GUNPOWDER as FW_GUNPOWDER, PAPER as FW_PAPER,
} from './items';
import { CONDUIT } from './blocks';
import { TRIPWIRE_HOOK } from './blocks'; // Fase 7 (redstone)
import { fireworkData, fireworkColors } from './equipment';
mix([IRON_INGOT, FLINT], FLINT_AND_STEEL);
shape(['SIS', 'THT', ' S '], { S: STICK, I: IRON_INGOT, T: STRING, H: TRIPWIRE_HOOK }, CROSSBOW); // Fase 7 (redstone): con gancho
shape(['SSS', 'S S'], { S: TURTLE_SCUTE }, TURTLE_HELMET);
shape(['L L', 'LLL', 'L L'], { L: LEATHER }, HORSE_ARMOR.leather);
shape(['S  ', 'SSS', 'S S'], { S: ARMADILLO_SCUTE }, WOLF_ARMOR);
shape(['R ', ' C'], { R: FISHING_ROD, C: CARROT }, CARROT_ON_A_STICK);
shape(['NNN', 'NHN', 'NNN'], { N: NAUTILUS_SHELL, H: HEART_OF_THE_SEA }, CONDUIT);

/**
 * Fuegos artificiales (cuadrícula con sus pilas, para ver los colores de las estrellas):
 * - Estrella: pólvora y de 1 a 8 tintes → estrella de esos colores.
 * - Cohete: papel, de 1 a 3 pólvoras (la duración del vuelo) y las estrellas que se quiera → 3 cohetes
 *   que estallan con los colores de todas las estrellas (sin estrellas, sólo suben).
 * null si la cuadrícula no es una de estas recetas.
 */
export function fireworkCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const items = grid.filter((s): s is ItemStack => !!s && s.count > 0);
  if (items.length === 0) return null;
  const count = (id: number) => items.filter((s) => s.id === id).length;
  const dyeIndex = (id: number) => DYE_COLORS.findIndex((c) => DYES[c] === id);
  const gunpowder = count(FW_GUNPOWDER), paper = count(FW_PAPER), stars = items.filter((s) => s.id === FIREWORK_STAR);
  if (paper === 0) {
    // Estrella: una pólvora y tintes.
    const dyes = items.filter((s) => dyeIndex(s.id) >= 0);
    if (gunpowder !== 1 || dyes.length < 1 || dyes.length > 8 || dyes.length + 1 !== items.length) return null;
    let mask = 0;
    for (const d of dyes) mask |= 1 << dyeIndex(d.id);
    return { id: FIREWORK_STAR, count: 1, dmg: mask };
  }
  if (paper !== 1 || gunpowder < 1 || gunpowder > 3 || 1 + gunpowder + stars.length !== items.length) return null;
  let colors = 0;
  for (const s of stars) colors |= s.dmg ?? 0;
  return { id: FIREWORK_ROCKET, count: 3, dmg: fireworkData(gunpowder, colors) };
}

/** Colores (máscara de tintes) de una estrella o de un cohete. */
export function fireworkMask(s: ItemStack): number {
  return s.id === FIREWORK_STAR ? (s.dmg ?? 0) & 0xffff : s.id === FIREWORK_ROCKET ? fireworkColors(s.dmg) : 0;
}

// ------------------------------------------------------------------ Fase 7 (pociones)
// Alambique (vara de blaze sobre tres piedras: guijarro o pizarra profunda rocosa), polvo de blaze, crema
// de magma, ojo de araña fermentado y piedra luminosa con su polvo (como en Minecraft). Las flechas con
// efecto van aparte (tippedArrowCraft en potions.ts: el tipo de la poción viaja en la pila).
import { BREWING_STAND, GLOWSTONE } from './blocks';
import { BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, FERMENTED_SPIDER_EYE, GLOWSTONE_DUST, SPIDER_EYE } from './items';
shape([' B ', 'SSS'], { B: BLAZE_ROD, S: [COBBLESTONE, COBBLED_DEEPSLATE] }, BREWING_STAND);
mix([BLAZE_ROD], BLAZE_POWDER, 2);
mix([BLAZE_POWDER, SLIME_BALL], MAGMA_CREAM);
// El bloque de magma: cuatro cremas de magma.
import { MAGMA_BLOCK } from './blocks';
shape(['MM', 'MM'], { M: MAGMA_CREAM }, MAGMA_BLOCK);
mix([SPIDER_EYE, BROWN_MUSHROOM, SUGAR], FERMENTED_SPIDER_EYE);
shape(['GG', 'GG'], { G: GLOWSTONE_DUST }, GLOWSTONE);
// ------------------------------------------------------------------ Fase 7 (transporte)
// Barcas (con los tablones de su madera; la balsa, con los de bambú), barcas con cofre, vagonetas y raíles
// (como en Minecraft). El raíl detector y el activador necesitan la placa de presión de piedra y la antorcha
// de redstone: sus recetas se registran si esos bloques existen (los trae la redstone).
import { BOAT_ITEMS, CHEST_BOAT_ITEMS, MINECART, CHEST_MINECART, FURNACE_MINECART, GOLD_INGOT as RAIL_GOLD } from './items';
import { RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL } from './blocks';
for (const [wood, boat] of Object.entries(BOAT_ITEMS)) {
  const planks = wood === 'bamboo' ? BAMBOO_PLANKS : WOOD_TYPES.find((w) => w.key === wood)?.planks;
  if (planks === undefined) continue;
  shape(['P P', 'PPP'], { P: planks }, boat);
  mix([boat, CHEST], CHEST_BOAT_ITEMS[wood]);
}
shape(['I I', 'III'], { I: IRON_INGOT }, MINECART);
mix([MINECART, CHEST], CHEST_MINECART);
mix([MINECART, FURNACE], FURNACE_MINECART);
shape(['I I', 'ISI', 'I I'], { I: IRON_INGOT, S: STICK }, RAIL, 16);
shape(['G G', 'GSG', 'GRG'], { G: RAIL_GOLD, S: STICK, R: REDSTONE }, POWERED_RAIL, 6);
{
  const byKey = (key: string) => ITEMS.findIndex((it) => it?.key === key);
  const plate = byKey('stone_pressure_plate'), torch = byKey('redstone_torch');
  if (plate > 0) shape(['I I', 'IPI', 'IRI'], { I: IRON_INGOT, P: plate, R: REDSTONE }, DETECTOR_RAIL, 6);
  if (torch > 0) shape(['ISI', 'ITI', 'ISI'], { I: IRON_INGOT, S: STICK, T: torch }, ACTIVATOR_RAIL, 6);
}
// Fase 7 (encantamientos): mesa de encantamientos (libro, dos diamantes y cuatro de obsidiana) y yunque
// (tres bloques de hierro y cuatro lingotes), como en Minecraft.
import { ENCHANTING_TABLE, ANVIL, OBSIDIAN } from './blocks';
shape([' B ', 'DOD', 'OOO'], { B: BOOK, D: DIAMOND, O: OBSIDIAN }, ENCHANTING_TABLE);
shape(['BBB', ' I ', 'III'], { B: IRON_BLOCK, I: IRON_INGOT }, ANVIL);
// ------------------------------------------------------------------ Fase 7 (redstone)
// Componentes de redstone como en Minecraft (la bombilla de cobre, con la vara de blaze de las pociones);
// el cuarzo del Nether, de momento, sólo sale en creativo.
import {
  REDSTONE_TORCH, LEVER, BUTTONS, PRESSURE_PLATES, LIGHT_WEIGHTED_PLATE, HEAVY_WEIGHTED_PLATE, REPEATER, COMPARATOR,
  REDSTONE_BLOCK, REDSTONE_LAMP, DAYLIGHT_DETECTOR, TARGET, NOTE_BLOCK, TRAPPED_CHEST, LIGHTNING_ROD, COPPER_BULB, IRON_DOOR,
  IRON_TRAPDOOR, COBBLESTONE as RS_COBBLESTONE, STONE as RS_STONE, GLASS as RS_GLASS, HAY_BALE as RS_HAY,
  CHEST as RS_CHEST, COPPER as RS_COPPER, WOODS as RS_WOODS, SLABS as RS_SLABS, OXIDATION_STAGES as RS_STAGES,
} from './blocks';
import { QUARTZ, REDSTONE as RS_DUST, STICK as RS_STICK, IRON_INGOT as RS_IRON, GOLD_INGOT as RS_GOLD, COPPER_INGOT as RS_COPPER_INGOT } from './items';
{
  const R = RS_DUST;
  shape(['R', 'S'], { R, S: RS_STICK }, REDSTONE_TORCH);
  shape(['S', 'C'], { S: RS_STICK, C: RS_COBBLESTONE }, LEVER);
  mix([RS_STONE], BUTTONS.stone);
  shape(['SS'], { S: RS_STONE }, PRESSURE_PLATES.stone);
  for (const w of RS_WOODS) {
    mix([w.block], BUTTONS[w.key]);
    shape(['PP'], { P: w.block }, PRESSURE_PLATES[w.key]);
  }
  shape(['GG'], { G: RS_GOLD }, LIGHT_WEIGHTED_PLATE);
  shape(['II'], { I: RS_IRON }, HEAVY_WEIGHTED_PLATE);
  shape(['TRT', 'SSS'], { T: REDSTONE_TORCH, R, S: RS_STONE }, REPEATER);
  shape([' T ', 'TQT', 'SSS'], { T: REDSTONE_TORCH, Q: QUARTZ, S: RS_STONE }, COMPARATOR);
  shape(['RRR', 'RRR', 'RRR'], { R }, REDSTONE_BLOCK);
  mix([REDSTONE_BLOCK], R, 9);
  shape([' R ', 'RGR', ' R '], { R, G: GLOWSTONE }, REDSTONE_LAMP);
  shape(['GGG', 'QQQ', 'WWW'], { G: RS_GLASS, Q: QUARTZ, W: RS_WOODS.map((w) => RS_SLABS[w.key]) }, DAYLIGHT_DETECTOR);
  shape([' R ', 'RHR', ' R '], { R, H: RS_HAY }, TARGET);
  shape(['I', 'S', 'P'], { I: RS_IRON, S: RS_STICK, P: PLANKS }, TRIPWIRE_HOOK, 2);
  shape(['PPP', 'PRP', 'PPP'], { P: PLANKS, R }, NOTE_BLOCK);
  mix([RS_CHEST, TRIPWIRE_HOOK], TRAPPED_CHEST);
  shape(['C', 'C', 'C'], { C: RS_COPPER_INGOT }, LIGHTNING_ROD[0][0]);
  shape(['II', 'II', 'II'], { I: RS_IRON }, IRON_DOOR, 3);
  shape(['II', 'II'], { I: RS_IRON }, IRON_TRAPDOOR);
  for (let s = 0; s < RS_STAGES; s++) shape([' C ', 'CBC', ' R '], { C: RS_COPPER.block[0][s], B: BLAZE_ROD, R }, COPPER_BULB[0][s], 4);
}

// ------------------------------------------------------------------ Fase 7 (mecanismos)
// Pistones, observador, tolva, dispensador, soltador, dinamita y sus vagonetas, como en Minecraft.
import { PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT } from './blocks';
import { GUNPOWDER, HOPPER_MINECART, TNT_MINECART } from './items';
{
  const C = COBBLESTONE, R = REDSTONE;
  shape(['TTT', 'CIC', 'CRC'], { T: PLANKS, C, I: IRON_INGOT, R }, PISTON);
  shape(['S', 'P'], { S: SLIME_BALL, P: PISTON }, STICKY_PISTON);
  shape(['CCC', 'RRQ', 'CCC'], { C, R, Q: QUARTZ }, OBSERVER);
  shape(['I I', 'ICI', ' I '], { I: IRON_INGOT, C: CHEST }, HOPPER);
  shape(['CCC', 'CBC', 'CRC'], { C, B: BOW, R }, DISPENSER);
  shape(['CCC', 'C C', 'CRC'], { C, R }, DROPPER);
  shape(['GSG', 'SGS', 'GSG'], { G: GUNPOWDER, S: [SAND, RED_SAND] }, TNT);
  mix([HOPPER, MINECART], HOPPER_MINECART);
  mix([TNT, MINECART], TNT_MINECART);
}

// ------------------------------------------------------------------ Fase 7.5 (abismo)
// Sensor calibrado, brújula de recuperación, disco 5 (de nueve fragmentos), antorcha y farol de alma.
import { SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SOUL_SAND, SOUL_SOIL, SOUL_TORCH, SOUL_LANTERN } from './blocks';
import { ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5 } from './items';
{
  shape([' A ', 'ASA'], { A: AMETHYST_SHARD, S: SCULK_SENSOR }, CALIBRATED_SCULK_SENSOR);
  shape(['EEE', 'ECE', 'EEE'], { E: ECHO_SHARD, C: COMPASS }, RECOVERY_COMPASS);
  mix(new Array(9).fill(DISC_FRAGMENT_5), MUSIC_DISC_5);
  shape(['C', 'S', 'B'], { C: FUEL_COAL, S: STICK, B: [SOUL_SAND, SOUL_SOIL] }, SOUL_TORCH, 4);
  shape(['NNN', 'NTN', 'NNN'], { N: IRON_NUGGET, T: SOUL_TORCH }, SOUL_LANTERN);
}

// ------------------------------------------------------------------ Fase 7.6 (auditoría de recetas)
// Recetas de Minecraft cuyos objetos ya existían pero no se fabricaban: la diorita y el granito con
// cuarzo, el bloque de cuarzo, el bloque de espeleotema, las raíces de mangle con barro, volver a teñir
// alfombras y las bombillas de cobre enceradas.
import { QUARTZ_BLOCK, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS } from './blocks';
{
  shape(['CQ', 'QC'], { C: COBBLESTONE, Q: QUARTZ }, DIORITE, 2);
  mix([DIORITE, QUARTZ], GRANITE);
  shape(['QQ', 'QQ'], { Q: QUARTZ }, QUARTZ_BLOCK);
  shape(['DD', 'DD'], { D: POINTED_DRIPSTONE }, DRIPSTONE_BLOCK);
  mix([MUD, MANGROVE_ROOTS], MUDDY_MANGROVE_ROOTS);
  for (const c of DYE_COLORS) mix([DYES[c], DYE_COLORS.filter((o) => o !== c).map((o) => CARPETS[o])], CARPETS[c]);
  for (let s = 0; s < RS_STAGES; s++) shape([' C ', 'CBC', ' R '], { C: RS_COPPER.block[1][s], B: BLAZE_ROD, R: REDSTONE }, COPPER_BULB[1][s], 4);
}

// ------------------------------------------------------------------ Fase 8.2 (biomas del Nether)
// Maderas carmesí y distorsionada (los tablones de cualquier tallo o hifas; hifas de cuatro tallos; carteles),
// bloque de verrugas, basalto pulido, la familia de la piedra negra y la de los ladrillos del Nether. Las
// losas, escaleras, vallas, portillos, puertas, trampillas, botones, placas, muros y carteles colgantes salen
// de las recetas de cada material de arriba.
import {
  NETHER_WOODS, NETHER_WART_BLOCK, BASALT, POLISHED_BASALT, BLACKSTONE, POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS,
  CHISELED_POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BUTTON, POLISHED_BLACKSTONE_PRESSURE_PLATE, NETHER_BRICKS, NETHER_BRICK_FENCE,
  CHISELED_NETHER_BRICKS, RED_NETHER_BRICKS,
} from './blocks';
import { NETHER_BRICK, NETHER_WART as NW } from './items';
{
  for (const w of NETHER_WOODS) {
    mix([[w.stem, w.strippedStem, w.hyphae, w.strippedHyphae]], w.planks, 4);
    shape(['SS', 'SS'], { S: w.stem }, w.hyphae, 3);
    shape(['SS', 'SS'], { S: w.strippedStem }, w.strippedHyphae, 3);
    shape(['PPP', 'PPP', ' S '], { P: w.planks, S: STICK }, SIGNS[w.key], 3);
  }
  mix(new Array(9).fill(NW), NETHER_WART_BLOCK);
  shape(['SS', 'SS'], { S: BASALT }, POLISHED_BASALT, 4);
  shape(['SS', 'SS'], { S: BLACKSTONE }, POLISHED_BLACKSTONE, 4);
  shape(['SS', 'SS'], { S: POLISHED_BLACKSTONE }, POLISHED_BLACKSTONE_BRICKS, 4);
  shape(['S', 'S'], { S: SLABS.polished_blackstone }, CHISELED_POLISHED_BLACKSTONE);
  mix([POLISHED_BLACKSTONE], POLISHED_BLACKSTONE_BUTTON);
  shape(['SS'], { S: POLISHED_BLACKSTONE }, POLISHED_BLACKSTONE_PRESSURE_PLATE);
  shape(['BB', 'BB'], { B: NETHER_BRICK }, NETHER_BRICKS);
  shape(['WBW', 'WBW'], { W: NETHER_BRICKS, B: NETHER_BRICK }, NETHER_BRICK_FENCE, 6);
  shape(['S', 'S'], { S: SLABS.nether_brick }, CHISELED_NETHER_BRICKS);
  shape(['BW', 'WB'], { B: NETHER_BRICK, W: NW }, RED_NETHER_BRICKS);
}

// ------------------------------------------------------------------ Fase 8.3 (criaturas del Nether)
// Caña con hongo distorsionado, carga de fuego (pólvora, polvo de blaze y carbón: 3) y flecha espectral (2).
import { WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW, GUNPOWDER as GP, ARROW as AR } from './items';
import { WARPED_FUNGUS } from './blocks';
shape(['R ', ' F'], { R: FISHING_ROD, F: WARPED_FUNGUS }, WARPED_FUNGUS_ON_A_STICK);
mix([GP, BLAZE_POWDER, FUEL_COAL], FIRE_CHARGE, 3);
shape([' G ', 'GAG', ' G '], { G: GLOWSTONE_DUST, A: AR }, SPECTRAL_ARROW, 2);

// ------------------------------------------------------------------ Fase 8.5 (lo que da el Nether)
// Lingote de netherita (4 chatarras y 4 lingotes de oro), su bloque y la copia de la plantilla de mejora
// (7 diamantes y rocanegra: 2). Las herramientas y la armadura de netherita no se fabrican: se mejoran desde las de
// diamante en la mesa de herrería (shared/smithing.ts).
import { NETHERITE_SCRAP, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE as NUT } from './items';
import { NETHERITE_BLOCK, NETHERRACK as NRK } from './blocks';
mix([NETHERITE_SCRAP, NETHERITE_SCRAP, NETHERITE_SCRAP, NETHERITE_SCRAP, GOLD_INGOT, GOLD_INGOT, GOLD_INGOT, GOLD_INGOT], NETHERITE_INGOT);
shape(['###', '###', '###'], { '#': NETHERITE_INGOT }, NETHERITE_BLOCK);
mix([NETHERITE_BLOCK], NETHERITE_INGOT, 9);
shape(['#S#', '#C#', '###'], { '#': DIAMOND, S: NUT, C: NRK }, NUT, 2);
// Cuarzo (ladrillos, pilar y cincelado; sus losas y escaleras también de cincelado y pilar), la magnetita, la fogata
// de almas (con arena o tierra de alma), el nexo de reaparición y el faro.
import {
  QUARTZ_BRICKS, QUARTZ_PILLAR, CHISELED_QUARTZ_BLOCK, LODESTONE, SOUL_CAMPFIRE, RESPAWN_ANCHOR, BEACON,
  QUARTZ_BLOCK as QB, CHISELED_STONE_BRICKS as CSB, SOUL_SAND as SSA, SOUL_SOIL as SSO, CRYING_OBSIDIAN as CRY, GLOWSTONE as GLS,
  OBSIDIAN as OBS, GLASS as GLA,
} from './blocks';
import { NETHER_STAR } from './items';
{
  const anyQuartz = [QB, CHISELED_QUARTZ_BLOCK, QUARTZ_PILLAR];
  shape(['QQ', 'QQ'], { Q: QB }, QUARTZ_BRICKS, 4);
  shape(['Q', 'Q'], { Q: QB }, QUARTZ_PILLAR, 2);
  shape(['S', 'S'], { S: SLABS.quartz }, CHISELED_QUARTZ_BLOCK);
  shape(['MMM'], { M: anyQuartz }, SLABS.quartz, 6);
  shape(['M  ', 'MM ', 'MMM'], { M: anyQuartz }, STAIRS.quartz, 4);
  shape(['SSS', 'S#S', 'SSS'], { S: CSB, '#': IRON_INGOT }, LODESTONE);
  shape([' S ', 'S#S', 'LLL'], { S: STICK, '#': [SSA, SSO], L: LOGS }, SOUL_CAMPFIRE);
  shape(['OOO', 'GGG', 'OOO'], { O: CRY, G: GLS }, RESPAWN_ANCHOR);
  shape(['GGG', 'GSG', 'OOO'], { G: GLA, S: NETHER_STAR, O: OBS }, BEACON);
}

// ------------------------------------------------------------------ Fase 8.6 (el End)
// Ladrillos de piedra del End (4), púrpura (4 frutas de coro reventadas: 4), el pilar de dos losas de púrpura y
// la vara del End (una vara de blaze sobre una fruta reventada: 4). Losas, escaleras y muros, de los bucles de
// arriba.
import { POPPED_CHORUS_FRUIT as PCF, BLAZE_ROD as BRD } from './items';
import { END_STONE, END_STONE_BRICKS, PURPUR_BLOCK, PURPUR_PILLAR, END_ROD } from './blocks';
shape(['SS', 'SS'], { S: END_STONE }, END_STONE_BRICKS, 4);
shape(['FF', 'FF'], { F: PCF }, PURPUR_BLOCK, 4);
shape(['S', 'S'], { S: SLABS.purpur }, PURPUR_PILLAR);
shape(['B', 'F'], { B: BRD, F: PCF }, END_ROD, 4);
// El ojo de ender: polvo de blaze y una perla de ender.
import { ENDER_EYE, ENDER_PEARL as EPL } from './items';
mix([BLAZE_POWDER, EPL], ENDER_EYE);
// El cristal del End: siete cristales alrededor de un ojo de ender, con una lágrima de ghast debajo.
import { END_CRYSTAL, GHAST_TEAR as GTR } from './items';
import { GLASS as GLS8 } from './blocks';
shape(['GGG', 'GEG', 'GTG'], { G: GLS8, E: ENDER_EYE, T: GTR }, END_CRYSTAL);
// La caja de shulker (dos caparazones y un cofre; teñirla, en craftSpecials) y el cofre de ender (obsidiana y un ojo).
import { SHULKER_SHELL as SSH } from './items';
import { SHULKER_BOXES as SBX, ENDER_CHEST as ECH, OBSIDIAN as OBS8, CHEST as CHS8 } from './blocks';
shape(['S', 'C', 'S'], { S: SSH, C: CHS8 }, SBX['']);
shape(['OOO', 'OEO', 'OOO'], { O: OBS8, E: ENDER_EYE }, ECH);
