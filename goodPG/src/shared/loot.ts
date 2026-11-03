// Tablas de botín de los cofres de las estructuras (fase 5), inspiradas en las de Minecraft con lo
// que ya existe en el juego. Cada tabla hace unas tiradas y en cada una elige una entrada por peso.
import { TORCH, OBSIDIAN, GOLD_BLOCK, SNOW_BLOCK, CRYING_OBSIDIAN, PUMPKIN } from './blocks';
import {
  COAL, IRON_INGOT, GOLD_INGOT, DIAMOND, EMERALD, LAPIS, REDSTONE, BREAD, WHEAT, BONE, ROTTEN_FLESH, STRING, GUNPOWDER,
  GOLDEN_APPLE, BUCKET, WHEAT_SEEDS, MELON_SEEDS, PUMPKIN_SEEDS, BEETROOT_SEEDS, APPLE, PAPER, CARROT, POTATO,
  FLINT, SPIDER_EYE, LEATHER, COD, SALMON, COPPER_INGOT, BOOK, ARMOR, TOOLS, type ItemStack,
  SADDLE, // Fase 6 (monturas)
  ARROW, // Fase 6 (asaltos)
} from './items';
import { DARK_OAK_LOG, BIRCH_LOG } from './blocks'; // Fase 6 (asaltos)

/**
 * Entrada: [objeto, peso, mínimo, máximo] y, Fase 7 (encantamientos), lo que se le hace (encantarlo). Fase 8.5: el
 * objeto 0 es la entrada vacía de Minecraft (la tirada no da nada).
 */
type Entry = [number, number, number, number] | [number, number, number, number, LootFn];
/** Fase 7 (encantamientos): función de botín sobre la pila que sale (encantar al azar, con niveles…). */
export type LootFn = (s: ItemStack, rand: () => number) => ItemStack;

export interface LootTable {
  rolls: [number, number];
  entries: Entry[];
  /** Fase 7.5 (océano): más montones de botín (las «pools» de Minecraft), que se tiran después. */
  extra?: LootTable[];
}

const T = (min: number, max: number, entries: Entry[]): LootTable => ({ rolls: [min, max], entries });

export const LOOT_TABLES: Readonly<Record<string, LootTable>> = {
  // Mazmorra: comida, huesos, cuerda, pólvora, algo de metal y, con suerte, una manzana dorada.
  dungeon: T(4, 8, [
    [BREAD, 20, 1, 3], [WHEAT, 20, 1, 4], [BONE, 20, 1, 8], [ROTTEN_FLESH, 20, 1, 8], [STRING, 20, 1, 8],
    [GUNPOWDER, 20, 1, 8], [IRON_INGOT, 10, 1, 4], [GOLD_INGOT, 5, 1, 4], [BUCKET, 10, 1, 1], [REDSTONE, 15, 1, 4],
    [COAL, 15, 1, 4], [BEETROOT_SEEDS, 10, 2, 4], [MELON_SEEDS, 10, 2, 4], [PUMPKIN_SEEDS, 10, 2, 4], [GOLDEN_APPLE, 3, 1, 1],
    [ARMOR.iron.helmet, 2, 1, 1],
    [SADDLE, 12, 1, 1], // Fase 6 (monturas)
  ]),
  // Mina abandonada: carbón, raíles no (aún), antorchas, pan y metales.
  mineshaft: T(3, 6, [
    [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 5, 1, 3], [REDSTONE, 5, 4, 9], [LAPIS, 5, 4, 9], [DIAMOND, 3, 1, 2],
    [COAL, 10, 3, 8], [BREAD, 15, 1, 3], [TORCH, 15, 1, 16], [MELON_SEEDS, 10, 2, 4], [PUMPKIN_SEEDS, 10, 2, 4],
    [BEETROOT_SEEDS, 10, 2, 4], [TOOLS.iron.pickaxe, 1, 1, 1], [GOLDEN_APPLE, 2, 1, 1], [COPPER_INGOT, 8, 2, 6],
  ]),
  // Templo del desierto: huesos, carne podrida, pólvora, arena… y oro, esmeraldas y diamantes.
  desert_pyramid: T(2, 5, [
    [BONE, 25, 4, 6], [ROTTEN_FLESH, 16, 3, 7], [SPIDER_EYE, 16, 1, 3], [GUNPOWDER, 10, 1, 8], [STRING, 10, 1, 8],
    [GOLD_INGOT, 15, 2, 7], [IRON_INGOT, 15, 1, 5], [EMERALD, 15, 1, 3], [DIAMOND, 5, 1, 3], [GOLDEN_APPLE, 20, 1, 1],
    [BOOK, 20, 1, 1],
    [SADDLE, 15, 1, 1], // Fase 6 (monturas)
  ]),
  // Templo de la jungla: huesos, carne podrida y metales preciosos.
  jungle_temple: T(2, 6, [
    [DIAMOND, 3, 1, 3], [IRON_INGOT, 10, 1, 5], [GOLD_INGOT, 15, 2, 7], [EMERALD, 2, 1, 3], [BONE, 20, 4, 6],
    [ROTTEN_FLESH, 16, 3, 7], [BOOK, 1, 1, 1],
  ]),
  // Naufragio: provisiones (comida, papel, carbón) y tesoro (hierro, oro, esmeraldas, diamantes).
  shipwreck_supply: T(3, 10, [
    [PAPER, 8, 1, 12], [POTATO, 7, 2, 6], [CARROT, 7, 4, 8], [WHEAT, 7, 8, 21], [COAL, 6, 2, 8], [ROTTEN_FLESH, 5, 5, 24],
    [PUMPKIN, 2, 1, 3], [GUNPOWDER, 3, 1, 5], [LEATHER, 3, 1, 3], [BOOK, 1, 1, 1], [COD, 6, 2, 6], [SALMON, 6, 2, 6],
    [ARMOR.leather.helmet, 3, 1, 1], [ARMOR.leather.boots, 3, 1, 1],
  ]),
  shipwreck_treasure: T(3, 6, [
    [IRON_INGOT, 90, 1, 5], [GOLD_INGOT, 10, 1, 5], [EMERALD, 40, 1, 5], [DIAMOND, 5, 1, 1], [LAPIS, 20, 1, 10],
    [COPPER_INGOT, 30, 2, 8],
  ]),
  // Portal en ruinas: obsidiana, pedernal, oro (mucho oro) y algo de comida.
  ruined_portal: T(4, 8, [
    [OBSIDIAN, 40, 1, 2], [FLINT, 40, 1, 4], [IRON_INGOT, 40, 9, 18], [GOLD_INGOT, 15, 4, 24], [GOLDEN_APPLE, 15, 1, 1],
    [ARMOR.golden.helmet, 15, 1, 1], [ARMOR.golden.boots, 15, 1, 1], [TOOLS.golden.sword, 15, 1, 1],
    [TOOLS.golden.pickaxe, 15, 1, 1], [GOLD_BLOCK, 1, 1, 2], [CRYING_OBSIDIAN, 15, 1, 3],
  ]),
  // Iglú: provisiones de invierno.
  igloo: T(2, 8, [
    [APPLE, 15, 1, 3], [COAL, 15, 1, 4], [GOLD_INGOT, 10, 1, 3], [STRING, 10, 1, 1], [WHEAT, 10, 2, 3],
    [ROTTEN_FLESH, 10, 1, 1], [GOLDEN_APPLE, 1, 1, 1], [SNOW_BLOCK, 5, 1, 4],
  ]),
  // Aldea: la despensa de una casa (pan, manzanas, cosecha, semillas, antorchas y algo de hierro).
  village: T(3, 7, [
    [BREAD, 20, 1, 4], [APPLE, 15, 1, 5], [WHEAT, 15, 2, 7], [WHEAT_SEEDS, 12, 2, 6], [CARROT, 10, 1, 4],
    [POTATO, 10, 1, 4], [TORCH, 10, 2, 8], [IRON_INGOT, 6, 1, 3], [COAL, 8, 1, 4], [EMERALD, 2, 1, 2],
    [BEETROOT_SEEDS, 5, 1, 4], [BOOK, 2, 1, 1],
  ]),
  // Fase 6 (asaltos): el mirador del puesto de saqueadores (como en Minecraft: flechas, trigo,
  // patatas, zanahorias, troncos, hierro y, rara vez, un libro).
  pillager_outpost: T(3, 6, [
    [ARROW, 16, 2, 7], [WHEAT, 14, 3, 5], [POTATO, 10, 2, 5], [CARROT, 10, 3, 5], [DARK_OAK_LOG, 10, 2, 3],
    [BIRCH_LOG, 8, 2, 3], [STRING, 8, 1, 6], [IRON_INGOT, 6, 1, 3], [EMERALD, 2, 1, 1], [BOOK, 1, 1, 1],
  ]),
};

/** Tira una tabla de botín: lista de montones (sin juntar). */
export function rollLoot(table: LootTable, rand: () => number): ItemStack[] {
  const total = table.entries.reduce((a, e) => a + e[1], 0);
  const rolls = table.rolls[0] + Math.floor(rand() * (table.rolls[1] - table.rolls[0] + 1));
  const out: ItemStack[] = [];
  for (let r = 0; r < rolls; r++) {
    let pick = rand() * total;
    for (const [id, w, min, max, fn] of table.entries) {
      pick -= w;
      if (pick > 0) continue;
      if (id <= 0) break; // Fase 8.5: entrada vacía
      const s: ItemStack = { id, count: min + Math.floor(rand() * (max - min + 1)) };
      out.push(fn ? fn(s, rand) : s);
      break;
    }
  }
  for (const t of table.extra ?? []) out.push(...rollLoot(t, rand)); // Fase 7.5 (océano)
  return out;
}

/** Fase 7.5 (océano): montones [mínimo, máximo] que puede dar una tabla contando sus tiradas extra. */
export function lootRollRange(table: LootTable): [number, number] {
  // Fase 8.5: con la entrada vacía, una tirada puede no dar nada.
  let lo = table.entries.some((e) => e[0] <= 0) ? 0 : table.rolls[0], hi = table.rolls[1];
  for (const t of table.extra ?? []) {
    const [a, b] = lootRollRange(t);
    lo += a;
    hi += b;
  }
  return [lo, hi];
}

/** Reparte el botín en huecos al azar de un cofre de `slots` casillas. */
export function scatterLoot(stacks: ItemStack[], slots: number, rand: () => number): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = new Array(slots).fill(null);
  const free = Array.from({ length: slots }, (_, i) => i);
  for (const s of stacks) {
    if (free.length === 0) break;
    const k = Math.floor(rand() * free.length);
    out[free[k]] = s;
    free.splice(k, 1);
  }
  return out;
}

// Fase 6.5 (colecciones): discos de música en las mazmorras (13, cat y, rara vez, otherside) y en las minas.
import { MUSIC_DISCS } from './items';
import { discIndexOfKey } from './discs';
{
  const disc = (k: string) => MUSIC_DISCS[discIndexOfKey(k)];
  LOOT_TABLES.dungeon.entries.push([disc('13'), 8, 1, 1], [disc('cat'), 8, 1, 1], [disc('otherside'), 1, 1, 1]);
  LOOT_TABLES.mineshaft.entries.push([disc('13'), 2, 1, 1], [disc('cat'), 2, 1, 1]);
}
// ------------------------------------------------------------------ Fase 6.5 (equipo)
// Manzana de oro encantada (sólo en estructuras), armaduras para caballo, cota de malla, mechero,
// corazón del mar (naufragios y portales en ruinas) y ballestas en los puestos de saqueadores.
import { ENCHANTED_GOLDEN_APPLE, HORSE_ARMOR, HEART_OF_THE_SEA, FLINT_AND_STEEL, CROSSBOW } from './items';
{
  const add = (table: string, ...entries: Entry[]) => LOOT_TABLES[table].entries.push(...entries);
  const chain = ARMOR.chainmail;
  add('dungeon', [ENCHANTED_GOLDEN_APPLE, 2, 1, 1], [HORSE_ARMOR.iron, 8, 1, 1], [HORSE_ARMOR.golden, 5, 1, 1],
    [HORSE_ARMOR.diamond, 3, 1, 1], [chain.helmet, 3, 1, 1], [chain.chestplate, 3, 1, 1]);
  add('mineshaft', [ENCHANTED_GOLDEN_APPLE, 1, 1, 1], [chain.leggings, 2, 1, 1], [chain.boots, 2, 1, 1]);
  add('desert_pyramid', [ENCHANTED_GOLDEN_APPLE, 2, 1, 1], [HORSE_ARMOR.iron, 15, 1, 1], [HORSE_ARMOR.golden, 10, 1, 1],
    [HORSE_ARMOR.diamond, 5, 1, 1]);
  add('jungle_temple', [HORSE_ARMOR.iron, 1, 1, 1], [HORSE_ARMOR.golden, 1, 1, 1], [HORSE_ARMOR.diamond, 1, 1, 1], [chain.helmet, 2, 1, 1]);
  add('ruined_portal', [ENCHANTED_GOLDEN_APPLE, 1, 1, 1], [FLINT_AND_STEEL, 40, 1, 1], [HEART_OF_THE_SEA, 2, 1, 1]);
  add('shipwreck_treasure', [HEART_OF_THE_SEA, 20, 1, 1]);
  add('shipwreck_supply', [chain.boots, 1, 1, 1]);
  add('pillager_outpost', [CROSSBOW, 4, 1, 1]);
}
// ------------------------------------------------------------------ Fase 7 (pociones)
// Hasta que haya Nether (fase 8), algunos de sus ingredientes salen en los portales en ruinas, las
// mazmorras y los templos; el aliento de dragón, sólo en creativo.
import { NETHER_WART, BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, GHAST_TEAR, GLOWSTONE_DUST, GLASS_BOTTLE } from './items';
{
  const add = (table: string, ...entries: Entry[]) => LOOT_TABLES[table].entries.push(...entries);
  add('ruined_portal', [NETHER_WART, 20, 1, 4], [BLAZE_POWDER, 6, 1, 3], [MAGMA_CREAM, 6, 1, 2], [GLOWSTONE_DUST, 10, 2, 6]);
  add('dungeon', [NETHER_WART, 6, 1, 3], [BLAZE_ROD, 3, 1, 1], [GLASS_BOTTLE, 8, 1, 3]);
  add('desert_pyramid', [GHAST_TEAR, 3, 1, 1], [BLAZE_ROD, 3, 1, 2]);
  add('jungle_temple', [NETHER_WART, 4, 1, 3], [GLOWSTONE_DUST, 5, 1, 4]);
}

// ------------------------------------------------------------------ Fase 7 (encantamientos)
// Libros encantados (al azar; en el templo de la jungla, con 30 niveles), el equipo de oro de los portales
// en ruinas y la armadura de cuero de los naufragios encantados al azar, y botellas con experiencia en
// los puestos de saqueadores (como en Minecraft).
import { enchantRandomly, enchantWithLevels, rndFrom } from './enchanting';
import { EXPERIENCE_BOTTLE } from './items';
{
  const randomly: LootFn = (s, rand) => enchantRandomly(s, rndFrom(rand));
  const levels30: LootFn = (s, rand) => enchantWithLevels(s, 30, rndFrom(rand));
  const add = (table: string, ...entries: Entry[]) => LOOT_TABLES[table].entries.push(...entries);
  add('dungeon', [BOOK, 10, 1, 1, randomly]);
  add('mineshaft', [BOOK, 10, 1, 1, randomly]);
  add('pillager_outpost', [EXPERIENCE_BOTTLE, 7, 1, 2]);
  const enchantAll = (table: string, ids: readonly number[], fn: LootFn) => {
    for (const e of LOOT_TABLES[table].entries) if (ids.includes(e[0]) && e.length === 4) (e as unknown[]).push(fn);
  };
  // Los libros que ya había en estos cofres eran los encantados de Minecraft.
  enchantAll('desert_pyramid', [BOOK], randomly);
  enchantAll('pillager_outpost', [BOOK], randomly);
  enchantAll('jungle_temple', [BOOK], levels30);
  enchantAll('ruined_portal', [ARMOR.golden.helmet, ARMOR.golden.boots, TOOLS.golden.sword, TOOLS.golden.pickaxe], randomly);
  enchantAll('shipwreck_supply', [ARMOR.leather.helmet, ARMOR.leather.boots], randomly);
}

// ------------------------------------------------------------------ Fase 7.5 (abismo)
// Los cofres de las ciudades antiguas (y el de su nevera).
import { DEEP_DARK_LOOT } from './deepDarkLoot';
Object.assign(LOOT_TABLES, DEEP_DARK_LOOT);
// ------------------------------------------------------------------ Fase 7.5 (océano)
// Ruinas oceánicas (pequeñas y grandes), tesoro enterrado y el cofre de los mapas de los naufragios,
// con las tablas de Minecraft Java por montones. Los mapas del tesoro se resuelven al llenar el cofre
// (apuntan al tesoro enterrado más cercano a él).
import { FISHING_ROD, GOLD_NUGGET, COOKED_COD, COOKED_SALMON, POTION, COMPASS, CLOCK, EMPTY_MAP, FEATHER, PRISMARINE_CRYSTALS } from './items';
import { TNT } from './blocks';
import { PT_WATER_BREATHING } from './potions';
import { structureMapLoot } from './structureMaps';
{
  const randomly: LootFn = (s, rand) => enchantRandomly(s, rndFrom(rand));
  const treasureMap = structureMapLoot('buried_treasure');
  const tables = LOOT_TABLES as Record<string, LootTable>;
  tables.underwater_ruin_small = {
    ...T(2, 8, [[COAL, 10, 1, 4], [TOOLS.stone.axe, 2, 1, 1], [ROTTEN_FLESH, 5, 1, 1], [EMERALD, 1, 1, 1], [WHEAT, 10, 2, 3]]),
    extra: [T(1, 1, [[ARMOR.leather.chestplate, 1, 1, 1], [ARMOR.golden.helmet, 1, 1, 1], [FISHING_ROD, 5, 1, 1, randomly], [EMPTY_MAP, 5, 1, 1, treasureMap]])],
  };
  tables.underwater_ruin_big = {
    ...T(2, 8, [[COAL, 10, 1, 4], [GOLD_NUGGET, 10, 1, 3], [EMERALD, 1, 1, 1], [WHEAT, 10, 2, 3]]),
    extra: [T(1, 1, [
      [GOLDEN_APPLE, 1, 1, 1], [BOOK, 5, 1, 1, randomly], [ARMOR.leather.chestplate, 1, 1, 1], [ARMOR.golden.helmet, 1, 1, 1],
      [FISHING_ROD, 5, 1, 1, randomly], [EMPTY_MAP, 10, 1, 1, treasureMap],
    ])],
  };
  const waterBreathing: LootFn = (s) => ({ ...s, dmg: PT_WATER_BREATHING });
  tables.buried_treasure = {
    ...T(1, 1, [[HEART_OF_THE_SEA, 1, 1, 1]]),
    extra: [
      T(5, 8, [[IRON_INGOT, 20, 1, 4], [GOLD_INGOT, 10, 1, 4], [TNT, 5, 1, 2]]),
      T(1, 3, [[EMERALD, 5, 4, 8], [DIAMOND, 5, 1, 2], [PRISMARINE_CRYSTALS, 5, 1, 5]]),
      T(0, 1, [[ARMOR.leather.chestplate, 1, 1, 1], [TOOLS.iron.sword, 1, 1, 1]]),
      T(2, 2, [[COOKED_COD, 1, 2, 4], [COOKED_SALMON, 1, 2, 4]]),
      T(0, 2, [[POTION, 1, 1, 1, waterBreathing]]),
    ],
  };
  // El tercer cofre de los naufragios (el del camarote): siempre un mapa del tesoro.
  tables.shipwreck_map = {
    ...T(1, 1, [[EMPTY_MAP, 1, 1, 1, treasureMap]]),
    extra: [T(3, 3, [[COMPASS, 1, 1, 1], [EMPTY_MAP, 1, 1, 1], [CLOCK, 1, 1, 1], [PAPER, 20, 1, 10], [FEATHER, 10, 1, 5], [BOOK, 5, 1, 5]])],
  };
}

// ------------------------------------------------------------------ Fase 7.5 (mansión)
// Los cofres de la mansión del bosque, como en Minecraft: un grupo de 1 a 3 tesoros (correas, manzanas
// doradas, discos, cota de malla, azada y peto de diamante, libros encantados), otro de 1 a 4 de
// provisiones y tres tiradas de despojos. (Faltan la resina y la plantilla de adorno del vex, que aún
// no existen.)
import { LEAD } from './items';
{
  const disc = (k: string) => MUSIC_DISCS[discIndexOfKey(k)];
  const randomly: LootFn = (s, rand) => enchantRandomly(s, rndFrom(rand));
  (LOOT_TABLES as Record<string, LootTable>).woodland_mansion = {
    ...T(1, 3, [
      [LEAD, 20, 1, 1], [GOLDEN_APPLE, 15, 1, 1], [ENCHANTED_GOLDEN_APPLE, 2, 1, 1], [disc('13'), 15, 1, 1],
      [disc('cat'), 15, 1, 1], [ARMOR.chainmail.chestplate, 10, 1, 1], [TOOLS.diamond.hoe, 15, 1, 1],
      [ARMOR.diamond.chestplate, 5, 1, 1], [BOOK, 10, 1, 1, randomly],
    ]),
    extra: [
      T(1, 4, [
        [IRON_INGOT, 10, 1, 4], [GOLD_INGOT, 5, 1, 4], [BREAD, 20, 1, 1], [WHEAT, 20, 1, 4], [BUCKET, 10, 1, 1],
        [REDSTONE, 15, 1, 4], [COAL, 15, 1, 4], [MELON_SEEDS, 10, 2, 4], [PUMPKIN_SEEDS, 10, 2, 4], [BEETROOT_SEEDS, 10, 2, 4],
      ]),
      T(3, 3, [[BONE, 10, 1, 8], [GUNPOWDER, 10, 1, 8], [ROTTEN_FLESH, 10, 1, 8], [STRING, 10, 1, 8]]),
    ],
  };
}

// ------------------------------------------------------------------ Fase 8.4 (estructuras del Nether)
// Los cofres de las fortalezas del Nether (y, con los bastiones, los suyos).
import { NETHER_LOOT } from './netherLoot';
Object.assign(LOOT_TABLES, NETHER_LOOT);
import { END_LOOT } from './endLoot'; // Fase 8.6
Object.assign(LOOT_TABLES, END_LOOT);

// ------------------------------------------------------------------ Fase 8.5 (lo que da el Nether)
// La magnetita del portal en ruinas: en dos de cada tres cofres, una o dos.
import { LODESTONE } from './blocks';
{
  const t = LOOT_TABLES.ruined_portal as LootTable;
  t.extra = [...(t.extra ?? []), T(1, 1, [[0, 1, 1, 1], [LODESTONE, 2, 1, 2]])];
}
