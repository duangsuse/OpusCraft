// Fase 7 (encantamientos): lo que suelta un bloque roto con Toque de seda o Fortuna (tablas de botín de
// Minecraft 26.3):
// - Toque de seda: el propio bloque en los que normalmente sueltan otra cosa (menas, cristal, hielo,
//   corales, librerías, hojas, telarañas, fogatas, nidos, amatista, bloques de champiñón…); la piedra
//   infestada suelta la piedra de siempre.
// - Fortuna: multiplica las menas (1 + un extra al azar entre −1 y el nivel), suma a la redstone, la
//   piedra luminosa, las rodajas de sandía, los cristales del farol marino, las bayas y las semillas de
//   la hierba, da más tiradas a los cultivos maduros y sube la probabilidad del pedernal de la grava y
//   de los brotes, palos y manzanas de las hojas.
import { amethystBudInfo } from '../blocks'; // los brotes de amatista
import { NETHER_WART_CROP, NETHER_WART_MAX_AGE } from '../blocks'; // Fase 8.4
import {
  BLOCKS, GRASS, SNOWY_GRASS, GRAVEL, COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, EMERALD_ORE,
  COPPER_ORE, SURFACE_ORE, GLOWSTONE, SEA_LANTERN, MELON, SHORT_GRASS, FERN, WHEAT_CROP, CARROTS, POTATOES, BEETROOTS,
  OAK_LEAVES, DARK_OAK_LEAVES, JUNGLE_LEAVES, INFESTED_OF, SNOW_LAYER, isSnowLayer, isLeaves, isMatureCrop,
  familyBase, baseBlock, woodOf,
} from '../blocks';
import { isSweetBerryBush } from '../blocks';
import { ITEMS, STICK, APPLE, FLINT, itemForBlock, type ItemStack } from '../items';
import { SILK_TOUCH, FORTUNE, type EnchList } from '../enchantments';
import { levelIn } from '../enchantEffects';
import { blockDrops } from './drops';
import { netherBiomeDrops } from './netherDrops'; // Fase 8.2 (biomas del Nether)
import { netherVineOf, GILDED_BLACKSTONE } from '../blocks';

/** Bloques que con Toque de seda se sueltan a sí mismos (claves del bloque base). */
const SILK_KEYS = new Set([
  'stone', 'deepslate', 'grass_block', 'snowy_grass_block', 'mycelium', 'podzol', 'gravel', 'clay', 'glass', 'glass_pane',
  'tinted_glass', 'ice', 'packed_ice', 'blue_ice', 'snow_block', 'bookshelf', 'chiseled_bookshelf', 'glowstone', 'sea_lantern',
  'melon', 'cobweb', 'campfire', 'soul_campfire', 'bee_nest', 'beehive', 'turtle_egg', 'red_mushroom_block', 'brown_mushroom_block',
  'mushroom_stem', 'amethyst_bud', 'amethyst_bud_side', 'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'lapis_ore', 'redstone_ore', 'emerald_ore',
  'copper_ore',
  'ender_chest', // Fase 8.6
  'sculk', 'sculk_vein', 'sculk_catalyst', 'sculk_sensor', 'calibrated_sculk_sensor', 'sculk_shrieker', // Fase 7.5 (abismo)
  // Fase 8.2 (biomas del Nether)
  'crimson_nylium', 'warped_nylium', 'gilded_blackstone', 'weeping_vines', 'weeping_vines_plant', 'twisting_vines',
  'twisting_vines_plant',
]);
const SILK_PATTERNS = [/_leaves$/, /_ore$/, /_stained_glass(_pane)?$/, /coral/];

/** Lo que suelta con Toque de seda (undefined: lo de siempre). */
function silkDrop(block: number, toolId: number): ItemStack[] | undefined {
  const b = BLOCKS[block];
  if (!b) return undefined;
  // Sin la herramienta adecuada (pico del nivel justo), nada, como siempre.
  if (b.tier > 0) {
    const t = toolId > 0 ? ITEMS[toolId]?.tool : undefined;
    if (!t || t.kind !== 'pickaxe' || t.tier < b.tier) return undefined;
  }
  const infested = INFESTED_OF[block];
  if (infested !== undefined) return [{ id: infested, count: 1 }];
  if (isSnowLayer(block)) return [{ id: SNOW_LAYER, count: block - SNOW_LAYER + 1 }];
  if (block === SNOWY_GRASS) return [{ id: GRASS, count: 1 }];
  const key = BLOCKS[familyBase(block)]?.key ?? b.key;
  if (!SILK_KEYS.has(key) && !SILK_PATTERNS.some((re) => re.test(key))) return undefined;
  // Las mitades y partes que no son objeto (paredes de los corales) sueltan su objeto.
  const item = ITEMS[baseBlock(block)] ? baseBlock(block) : itemForBlock(block);
  return item ? [{ id: item, count: 1 }] : undefined;
}

/** Menas (y sus versiones de pizarra profunda) a las que Fortuna multiplica. */
const ORES = new Set([COAL_ORE, IRON_ORE, GOLD_ORE, DIAMOND_ORE, LAPIS_ORE, EMERALD_ORE, COPPER_ORE]);

const rint = (rand: () => number, n: number) => Math.floor(rand() * n);

/** Fórmula ore_drops: cantidad × (1 + max(0, azar(nivel + 2) − 1)). */
export function oreMultiplier(fortune: number, rand: () => number): number {
  return Math.max(0, rint(rand, fortune + 2) - 1) + 1;
}

/** Probabilidades con Fortuna 0, 1, 2, 3… (table_bonus: la última vale para lo que pase). */
function tableBonus(chances: readonly number[], fortune: number): number {
  return chances[Math.min(fortune, chances.length - 1)];
}

const SAPLING_CHANCE = [0.05, 0.0625, 0.083333336, 0.1];
const JUNGLE_SAPLING_CHANCE = [0.025, 0.027777778, 0.03125, 0.041666668, 0.1];
const STICK_CHANCE = [0.02, 0.022222223, 0.025, 0.033333335, 0.1];
const APPLE_CHANCE = [0.005, 0.0055555557, 0.00625, 0.008333334, 0.025];
const FLINT_CHANCE = [0.1, 0.14285715, 0.25, 1];

/** Lo que suelta con Fortuna (null: no le afecta). */
function fortuneDrops(block: number, toolId: number, fortune: number, rand: () => number): ItemStack[] | null {
  const surface = SURFACE_ORE[block] ?? block;
  if (ORES.has(surface) || surface === REDSTONE_ORE) {
    const drops = blockDrops(block, toolId, rand);
    for (const d of drops) {
      if (d.id === block || d.id === surface) continue;
      if (surface === REDSTONE_ORE) d.count += rint(rand, fortune + 1);
      else d.count *= oreMultiplier(fortune, rand);
    }
    return drops;
  }
  // Racimo de amatista con pico: 4 fragmentos multiplicados.
  if (amethystBudInfo(block)?.stage === 3 && ITEMS[toolId]?.tool?.kind === 'pickaxe') {
    const drops = blockDrops(block, toolId, rand);
    for (const d of drops) d.count *= oreMultiplier(fortune, rand);
    return drops;
  }
  // Suma uniforme (con tope).
  const uniform = (limit: number, mult = 1): ItemStack[] => {
    const drops = blockDrops(block, toolId, rand);
    for (const d of drops) d.count = Math.min(limit, d.count + rint(rand, mult * fortune + 1));
    return drops;
  };
  if (block === GLOWSTONE) return uniform(4);
  if (block === MELON) return uniform(9);
  if (block === SEA_LANTERN) return uniform(5);
  if (isSweetBerryBush(block)) return uniform(64);
  if (block === SHORT_GRASS || block === FERN) return uniform(64, 2);
  // Fase 8.4: la verruga del Nether madura, de 0 a `fortuna` más (uniform_bonus_count).
  if (block === NETHER_WART_CROP + NETHER_WART_MAX_AGE) {
    const drops = blockDrops(block, toolId, rand);
    if (drops[0]) drops[0].count += Math.floor(rand() * (fortune + 1));
    return drops;
  }
  // Cultivos maduros: una tirada más (al 57 %) por nivel para las semillas o el fruto.
  if (isMatureCrop(block)) {
    const drops = blockDrops(block, toolId, rand);
    const base = familyBase(block);
    const target = base === WHEAT_CROP || base === BEETROOTS ? drops[drops.length - 1] : drops[0];
    if (target && (base === WHEAT_CROP || base === CARROTS || base === POTATOES || base === BEETROOTS)) {
      for (let i = 0; i < fortune; i++) if (rand() < 4 / 7) target.count++;
    }
    return drops;
  }
  if (block === GRAVEL) return rand() < tableBonus(FLINT_CHANCE, fortune) ? [{ id: FLINT, count: 1 }] : [{ id: GRAVEL, count: 1 }];
  // Fase 8.2 (biomas del Nether): enredaderas y piedra negra dorada.
  if (netherVineOf(block) || block === GILDED_BLACKSTONE) return netherBiomeDrops(block, toolId, rand, fortune);
  // Hojas (sin tijeras): brotes, palos y manzanas más probables.
  if (isLeaves(block) && ITEMS[toolId]?.tool?.kind !== 'shears') {
    const wood = woodOf(block);
    if (!wood) return null;
    const out: ItemStack[] = [];
    if (rand() < tableBonus(block === JUNGLE_LEAVES ? JUNGLE_SAPLING_CHANCE : SAPLING_CHANCE, fortune)) out.push({ id: wood.sapling, count: 1 });
    if ((block === OAK_LEAVES || block === DARK_OAK_LEAVES) && rand() < tableBonus(APPLE_CHANCE, fortune)) out.push({ id: APPLE, count: 1 });
    if (rand() < tableBonus(STICK_CHANCE, fortune)) out.push({ id: STICK, count: 1 + rint(rand, 2) });
    return out;
  }
  return null;
}

/** Botín de un bloque roto con la herramienta `toolId` y sus encantamientos. */
export function enchantedBlockDrops(block: number, toolId: number, ench: EnchList, rand: () => number = Math.random): ItemStack[] {
  if (levelIn(ench, SILK_TOUCH) > 0) {
    const silk = silkDrop(block, toolId);
    if (silk) return silk;
  }
  const fortune = levelIn(ench, FORTUNE);
  if (fortune > 0) {
    const f = fortuneDrops(block, toolId, fortune, rand);
    if (f) return f;
  }
  return blockDrops(block, toolId, rand);
}

/** ¿Suelta este bloque algo distinto con Toque de seda? (para las pruebas y la descripción). */
export function silkTouchChanges(block: number, toolId: number): boolean {
  return silkDrop(block, toolId) !== undefined;
}

