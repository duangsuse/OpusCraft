// Registro de bloques compartido por el cliente, los workers de generación/mallado y el servidor.
// El orden de los export * es el orden de registro: fija los ids que se guardan en los mundos
// (ver tests/ids.test.ts). Las familias nuevas se añaden SIEMPRE al final.
import { defs, finalizeBlocks, KINDS, type BlockDef } from './registry';
import {
  GRASS, DIRT, STONE, COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, GRANITE, DIORITE, ANDESITE, SAND, SANDSTONE,
  GRAVEL, CLAY, TERRACOTTA, SNOW_BLOCK, SNOWY_GRASS, ICE, OBSIDIAN, QUARTZ_BLOCK, OAK_LOG, OAK_PLANKS, BIRCH_LOG,
  BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_PLANKS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, GLASS, BOOKSHELF, CRAFTING_TABLE,
  FURNACE, CHEST, PUMPKIN, HAY_BALE, TORCH, GLOWSTONE, SEA_LANTERN, CACTUS, SUGAR_CANE, OAK_SAPLING, BIRCH_SAPLING,
  SPRUCE_SAPLING, SHORT_GRASS, FERN, POPPY, DANDELION, CORNFLOWER, DEAD_BUSH, RED_MUSHROOM, BROWN_MUSHROOM, WATER, LAVA,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, COPPER_BLOCK,
  WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL,
} from './classic';
import {
  MATERIALS, WOODS, SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER, GLASS_PANE, RED_BED,
} from './building';
import {
  FARMLAND, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, CAKE, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM,
  ATTACHED_MELON_STEM, MELON, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER,
} from './farm';
import { WALLS, BEDS, SIGNS } from './decoration';
import { SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER } from './workstations';
import {
  WOOD_TYPES, VINE, LILY_PAD, MYCELIUM, RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, RED_SAND, RED_SANDSTONE,
  COLORED_TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS,
} from './biomes';
import {
  DEEPSLATE, COBBLED_DEEPSLATE, TUFF, CALCITE, SMOOTH_BASALT, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, COPPER_ORE, EMERALD_ORE,
  DEEPSLATE_ORE, EMERALD_BLOCK, MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, AMETHYST_BLOCK, BUDDING_AMETHYST,
  AMETHYST_BUD, TINTED_GLASS,
} from './underground';
import {
  MOB_SPAWNER, COBWEB, CHISELED_SANDSTONE, CUT_SANDSTONE, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, NETHERRACK,
  CRYING_OBSIDIAN,
} from './structures';
import { SNOW_LAYER } from './weather';
import { TURTLE_EGG } from './aquaticBlocks';

export * from './registry';
export * from './classic';
export * from './building';
export * from './farm';
export * from './decoration';
export * from './workstations';
export * from './biomes';
export * from './underground';
export * from './structures';
export * from './weather';
export * from './queries';
// Fase 6 (acuáticos): huevos de tortuga.
export * from './aquaticBlocks';

{
  const kindOf = new Map<number, number>();
  for (const v of Object.values(DOORS)) kindOf.set(v, KINDS.door);
  for (const v of Object.values(TRAPDOORS)) kindOf.set(v, KINDS.trapdoor);
  for (const v of Object.values(FENCE_GATES)) kindOf.set(v, KINDS.gate);
  for (const v of Object.values(FENCES)) kindOf.set(v, KINDS.fence);
  for (const v of Object.values(SLABS)) kindOf.set(v, KINDS.slab);
  for (const v of Object.values(STAIRS)) kindOf.set(v, KINDS.stairs);
  kindOf.set(RED_BED, KINDS.bed);
  for (const v of Object.values(BEDS)) kindOf.set(v, KINDS.bed);
  // Los muros son tan altos como las vallas (no se pueden saltar).
  for (const v of Object.values(WALLS)) kindOf.set(v, KINDS.fence);
  for (const v of [WHEAT_CROP, CARROTS, POTATOES, BEETROOTS, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, ATTACHED_MELON_STEM]) {
    kindOf.set(v, KINDS.crop);
  }
  kindOf.set(CAKE, KINDS.cake);
  kindOf.set(FARMLAND, KINDS.farmland);
  finalizeBlocks(kindOf);
}

export const BLOCKS: readonly BlockDef[] = defs;
/** Uno más que el mayor id registrado (el registro es disperso: hay huecos entre 96 y 1024). */
export const BLOCK_COUNT = defs.length;

/** Orden de los bloques en el inventario creativo. */
export const INVENTORY_ORDER: readonly number[] = [
  GRASS, DIRT, STONE, COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, GRANITE, DIORITE, ANDESITE,
  SAND, SANDSTONE, GRAVEL, CLAY, TERRACOTTA, SNOW_BLOCK, SNOWY_GRASS, ICE, OBSIDIAN, QUARTZ_BLOCK,
  OAK_LOG, OAK_PLANKS, BIRCH_LOG, BIRCH_PLANKS, SPRUCE_LOG, SPRUCE_PLANKS, OAK_LEAVES, BIRCH_LEAVES, SPRUCE_LEAVES, GLASS,
  BOOKSHELF, CRAFTING_TABLE, FURNACE, CHEST, PUMPKIN, HAY_BALE, TORCH, GLOWSTONE, SEA_LANTERN, CACTUS, SUGAR_CANE,
  OAK_SAPLING, BIRCH_SAPLING, SPRUCE_SAPLING, SHORT_GRASS,
  FERN, POPPY, DANDELION, CORNFLOWER, DEAD_BUSH, RED_MUSHROOM, BROWN_MUSHROOM, WATER, LAVA,
  COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, COPPER_BLOCK,
  WHITE_WOOL, BLACK_WOOL, RED_WOOL, ORANGE_WOOL, YELLOW_WOOL, LIME_WOOL, BLUE_WOOL, PURPLE_WOOL,
  ...MATERIALS.flatMap((m) => [SLABS[m.key], STAIRS[m.key]]),
  ...WOODS.flatMap((w) => [FENCES[w.key], FENCE_GATES[w.key], DOORS[w.key], TRAPDOORS[w.key]]),
  LADDER, GLASS_PANE, RED_BED, MELON, CARVED_PUMPKIN, JACK_O_LANTERN, COMPOSTER,
  ...Object.values(WALLS), ...Object.values(BEDS).filter((b) => b !== RED_BED), ...Object.values(SIGNS),
  SMOKER, BLAST_FURNACE, CAMPFIRE, STONECUTTER,
  // Fase 5: maderas y biomas nuevos.
  ...WOOD_TYPES.slice(3).flatMap((w) => [w.log, w.planks, w.leaves, w.sapling]),
  MYCELIUM, RED_MUSHROOM_BLOCK, BROWN_MUSHROOM_BLOCK, MUSHROOM_STEM, RED_SAND, RED_SANDSTONE, PACKED_ICE,
  ...Object.values(COLORED_TERRACOTTA), VINE, LILY_PAD, ...Object.values(FLOWERS), PINK_PETALS,
  // Fase 5: subsuelo.
  DEEPSLATE, COBBLED_DEEPSLATE, TUFF, CALCITE, SMOOTH_BASALT, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, COPPER_ORE, EMERALD_ORE,
  ...Object.values(DEEPSLATE_ORE), EMERALD_BLOCK, MOSS_BLOCK, MOSS_CARPET, AZALEA, FLOWERING_AZALEA, AMETHYST_BLOCK,
  BUDDING_AMETHYST, AMETHYST_BUD, AMETHYST_BUD + 1, AMETHYST_BUD + 2, AMETHYST_BUD + 3, TINTED_GLASS,
  // Fase 5: estructuras.
  MOB_SPAWNER, COBWEB, CHISELED_SANDSTONE, CUT_SANDSTONE, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, NETHERRACK, CRYING_OBSIDIAN,
  SNOW_LAYER,
  // Fase 6 (aldeanos): bloques de trabajo.
  ...VILLAGER_BLOCKS,
  // Fase 6 (acuáticos).
  TURTLE_EGG,
];

export const DEFAULT_HOTBAR: readonly number[] = [
  GRASS, STONE, OAK_PLANKS, OAK_LOG, GLASS, TORCH, BRICKS, WATER, GLOWSTONE,
];

// Fase 6 (aldeanos): bloques de trabajo de los aldeanos (se registran los últimos).
import { VILLAGER_BLOCKS } from './villagerBlocks';
export * from './villagerBlocks';
// Fase 6 (monstruos): bloques infestados (se registran los últimos: ids guardados).
export * from './monsterBlocks';
// Fase 6 (fauna): nido de abejas, colmena, bloque de miel y bloque de panal (registrados los últimos
// para no mover ids) y su sitio en el inventario creativo.
import { BEE_INVENTORY } from './beeBlocks';
export * from './beeBlocks';
(INVENTORY_ORDER as number[]).push(...BEE_INVENTORY);
// Troncos tumbados (se registran los últimos: ids guardados).
export * from './logAxis';
// Fase 6.5 (maderas): mangle, roble pálido y bambú; troncos sin corteza y leños de todas las maderas
// (registrados los últimos: ids nuevos). Las maderas con árbol, sus formas y carteles ya entran solos
// en el inventario creativo; el resto, aquí.
import { WOODS2_INVENTORY } from './woods2';
export * from './woods2';
(INVENTORY_ORDER as number[]).push(...WOODS2_INVENTORY);
// Fase 6.5 (colores): lanas y terracotas que faltaban, alfombras, hormigón, cristal de color, terracota
// esmaltada, camas, velas y estandartes (se registran los últimos: ids guardados) y su sitio en el
// inventario creativo.
import { COLOR_INVENTORY } from './colors';
export * from './colors';
(INVENTORY_ORDER as number[]).push(...COLOR_INVENTORY);
// Fase 6.5 (piedras): piedras del mundo normal y sus formas (se registran las últimas: ids guardados).
import { STONE_INVENTORY } from './stoneBlocks';
export * from './stoneBlocks';
(INVENTORY_ORDER as number[]).push(...STONE_INVENTORY);
// Fase 6.5 (cobre): bloques de cobre en sus cuatro fases de oxidación, con y sin cera (se registran
// los últimos: ids guardados) y su sitio en el inventario creativo.
import { COPPER_INVENTORY } from './copperBlocks';
export * from './copperBlocks';
(INVENTORY_ORDER as number[]).push(...COPPER_INVENTORY);
// Fase 6.5 (decoración): maceta, farol, cadena y barrotes de hierro, campana, andamio, vasija decorada
// y los modelos de cuadros y marcos (se registran los últimos: ids guardados).
import { DECOR_INVENTORY } from './decorBlocks';
export * from './decorBlocks';
(INVENTORY_ORDER as number[]).push(...DECOR_INVENTORY);
// Fase 6.5 (océano y plantas): corales, algas, plantas marinas, pepinos de mar, prismarina y esponjas;
// flores altas, bayas dulces, azaleas, plantaformas, liquen, raíces y flor de esporas (registrados los
// últimos para no mover ids) y su sitio en el inventario creativo.
import { OCEAN_INVENTORY } from './ocean';
import { WILD_PLANT_INVENTORY } from './wildPlants';
export * from './ocean';
export * from './wildPlants';
(INVENTORY_ORDER as number[]).push(...OCEAN_INVENTORY, ...WILD_PLANT_INVENTORY);
// Fase 6.5 (remate): carteles colgantes de todas las maderas (registrados los últimos: ids nuevos).
import { HANGING_SIGN_INVENTORY } from './hangingSigns';
export * from './hangingSigns';
(INVENTORY_ORDER as number[]).push(...HANGING_SIGN_INVENTORY);
// Fase 6.5 (remate): estantería cincelada.
import { CHISELED_BOOKSHELF } from './chiseledBookshelf';
export * from './chiseledBookshelf';
(INVENTORY_ORDER as number[]).push(CHISELED_BOOKSHELF);
// Fase 6.5 (libros y estandartes): atril con un libro puesto.
export * from './lecternBook';
// Fase 6.5 (materiales): bloques en bruto, de carbón, lapislázuli, huesos y slime; hielo azul; tierra
// gruesa, podsol, tierra enraizada y camino de tierra; nieve polvo; más infestados; tartas con vela y
// huevos de rana (registrados los últimos: ids nuevos).
import { MATERIAL_INVENTORY } from './materialBlocks';
export * from './materialBlocks';
(INVENTORY_ORDER as number[]).push(...MATERIAL_INVENTORY);
// Fase 6.5 (colecciones): cabezas de criaturas, tocadiscos y el modelo del marco brillante (registrados
// los últimos: ids nuevos) y su sitio en el inventario creativo.
import { COLLECTION_INVENTORY } from './collections';
export * from './collections';
(INVENTORY_ORDER as number[]).push(...COLLECTION_INVENTORY);
// Fase 6.5 (equipo): fuego y conducto (registrados los últimos: ids nuevos).
import { EQUIPMENT_INVENTORY } from './equipmentBlocks';
export * from './equipmentBlocks';
(INVENTORY_ORDER as number[]).push(...EQUIPMENT_INVENTORY);
// Fase 6.5 (calderos): caldero con agua, con lava y con nieve polvo (registrados los últimos: ids nuevos).
export * from './cauldrons';
// Fase 7 (pociones): alambique alquímico (registrado el último: ids nuevos) y su sitio en el creativo.
import { BREWING_STAND } from './brewingBlocks';
export * from './brewingBlocks';
(INVENTORY_ORDER as number[]).push(BREWING_STAND);
// Fase 7 (transporte): raíles normal, propulsor, detector y activador (registrados los últimos: ids nuevos).
import { RAIL_INVENTORY } from './rails';
export * from './rails';
(INVENTORY_ORDER as number[]).push(...RAIL_INVENTORY);
// Fase 7 (encantamientos): mesa de encantamientos, yunques y hielo escarchado (registrados los últimos: ids
// nuevos) y su sitio en el inventario creativo.
import { ENCHANT_INVENTORY } from './enchantBlocks';
export * from './enchantBlocks';
(INVENTORY_ORDER as number[]).push(...ENCHANT_INVENTORY);
// Fase 7 (redstone): polvo, antorchas, palanca, botones, placas, repetidor, comparador, lámpara, sensores,
// cofre trampa, bombilla y pararrayos de cobre, puerta y trampilla de hierro (registrados los últimos: ids nuevos).
import { REDSTONE_INVENTORY } from './redstoneBlocks';
export * from './redstoneBlocks';
(INVENTORY_ORDER as number[]).push(...REDSTONE_INVENTORY);
// Fase 7 (mecanismos): pistones, observador, tolva, dispensador, soltador y dinamita (registrados los últimos:
// ids nuevos) y su sitio en el inventario creativo.
import { MECHANISM_INVENTORY } from './mechanismBlocks';
export * from './mechanismBlocks';
(INVENTORY_ORDER as number[]).push(...MECHANISM_INVENTORY);
// Fase 7.5 (abismo): sculk, sensores, chillador, pizarra reforzada y bloques de alma (registrados los últimos:
// ids nuevos) y su sitio en el inventario creativo.
import { DEEP_DARK_INVENTORY } from './deepDarkBlocks';
export * from './deepDarkBlocks';
(INVENTORY_ORDER as number[]).push(...DEEP_DARK_INVENTORY);
// Fase 8 (dimensiones): portal del Nether, menas del Nether y magma (registrados los últimos: ids nuevos).
import { NETHER_INVENTORY } from './netherBlocks';
export * from './netherBlocks';
(INVENTORY_ORDER as number[]).push(...NETHER_INVENTORY);
// Fase 8.2 (biomas del Nether): maderas carmesí y distorsionada, necelio, hongos, raíces, enredaderas, verrugas,
// luz de hongo, basalto, piedra negra y ladrillos del Nether (registrados los últimos: ids nuevos).
import { NETHER_BIOME_INVENTORY } from './netherBiomeBlocks';
export * from './netherBiomeBlocks';
(INVENTORY_ORDER as number[]).push(...NETHER_BIOME_INVENTORY);
// Fase 8.3 (criaturas del Nether): cráneo de esqueleto wither y cabeza de piglin (registrados los últimos: ids
// nuevos) y su sitio en el inventario creativo.
import { NETHER_MOB_INVENTORY } from './netherMobBlocks';
export * from './netherMobBlocks';
(INVENTORY_ORDER as number[]).push(...NETHER_MOB_INVENTORY);
// Fase 8.4 (estructuras del Nether): la verruga del Nether plantada (ids nuevos, al final).
export * from './netherStructureBlocks';
// Fase 8.5 (lo que da el Nether): escombros ancestrales, netherita… (ids nuevos, al final) y su sitio en el
// inventario creativo.
import { NETHER_GOODS_INVENTORY } from './netherGoodsBlocks';
export * from './netherGoodsBlocks';
(INVENTORY_ORDER as number[]).push(...NETHER_GOODS_INVENTORY);
// Fase 8.6 (el End): piedra del End, púrpura, vara del End y coro (ids nuevos, al final) y su sitio en el
// inventario creativo.
import { END_INVENTORY } from './endBlocks';
export * from './endBlocks';
(INVENTORY_ORDER as number[]).push(...END_INVENTORY);
// Correcciones: las luces de rana (ids nuevos, al final).
import { FROG_INVENTORY } from './frogBlocks';
export * from './frogBlocks';
(INVENTORY_ORDER as number[]).push(...FROG_INVENTORY);
// Correcciones: los brotes de amatista en las seis caras (ids nuevos, al final).
export * from './amethystBuds';
// Fase 8.7 (el Wither): la rosa marchita (ids nuevos, al final).
import { WITHER_INVENTORY } from './witherBlocks';
export * from './witherBlocks';
(INVENTORY_ORDER as number[]).push(...WITHER_INVENTORY);
