// Fase 8.4 (estructuras del Nether): botín de las estructuras del Nether, portado de las tablas de la 26.3.
// Lo que aún no existe en el juego queda fuera hasta su fase (y se anota):
// - fortaleza: la armadura de cobre para caballo y la plantilla de adorno «costilla» (fase 9);
// - bastiones: la lanza de diamante y la plantilla de adorno «hocico» (fase 9). Fase 8.5: ya llevan la magnetita
//   (el puente), la netherita (lingote y chatarra), los escombros ancestrales y la plantilla de mejora (un 10 % de
//   los cofres; la sala del tesoro, siempre).
import type { LootTable, LootFn } from './loot';
import {
  DIAMOND, IRON_INGOT, GOLD_INGOT, TOOLS, ARMOR, FLINT_AND_STEEL, NETHER_WART, SADDLE, HORSE_ARMOR, CROSSBOW, SPECTRAL_ARROW,
  STRING, LEATHER, ARROW, IRON_NUGGET, GOLD_NUGGET, GOLDEN_CARROT, GOLDEN_APPLE, RAW_PORKCHOP, COOKED_PORKCHOP, BOOK,
  MAGMA_CREAM, QUARTZ, ENCHANTED_GOLDEN_APPLE, MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN,
  NETHERITE_SCRAP, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE, // Fase 8.5
} from './items';
import {
  OBSIDIAN, GILDED_BLACKSTONE, CRYING_OBSIDIAN, GOLD_BLOCK, GLOWSTONE, SOUL_SAND, CRIMSON_NYLIUM, CRIMSON_FUNGUS, CRIMSON_ROOTS,
  IRON_BLOCK, IRON_CHAIN, BONE_BLOCK, ANCIENT_DEBRIS, LODESTONE, // Fase 8.5
} from './blocks';
import { enchantRandomly, rndFrom } from './enchanting';
import { maxDurability } from './enchantments';

type Entry = LootTable['entries'][number];
const T = (min: number, max: number, entries: Entry[], extra?: LootTable[]): LootTable => ({ rolls: [min, max], entries, ...(extra ? { extra } : {}) });

/** enchant_randomly. */
const ench: LootFn = (s, rand) => enchantRandomly(s, rndFrom(rand));
/** set_damage: le queda del `lo` al `hi` de su vida. */
const worn = (lo: number, hi: number, then?: LootFn): LootFn => (s, rand) => {
  const max = maxDurability(s.id);
  const left = lo + rand() * (hi - lo);
  const out = max > 0 ? { ...s, dmg: Math.floor((1 - left) * max) } : s;
  return then ? then(out, rand) : out;
};
const G = TOOLS.golden, GA = ARMOR.golden, D = TOOLS.diamond, DA = ARMOR.diamond;
/** Fase 8.5: la plantilla de mejora de netherita, en uno de cada diez cofres del bastión. */
const TEMPLATE_POOL = T(1, 1, [[0, 9, 1, 1], [NETHERITE_UPGRADE_SMITHING_TEMPLATE, 1, 1, 1]]);

export const NETHER_LOOT: Readonly<Record<string, LootTable>> = {
  // Fortaleza del Nether (chests/nether_bridge).
  nether_bridge: T(2, 4, [
    [DIAMOND, 5, 1, 3], [IRON_INGOT, 5, 1, 5], [GOLD_INGOT, 15, 1, 3], [G.sword, 5, 1, 1], [GA.chestplate, 5, 1, 1],
    [FLINT_AND_STEEL, 5, 1, 1], [NETHER_WART, 5, 3, 7], [SADDLE, 10, 1, 1], [HORSE_ARMOR.golden, 8, 1, 1], [HORSE_ARMOR.iron, 5, 1, 1],
    [HORSE_ARMOR.diamond, 3, 1, 1], [OBSIDIAN, 2, 2, 4],
  ]),
  // Puente del bastión (chests/bastion_bridge): siempre una magnetita y, luego, lo demás.
  bastion_bridge: T(1, 1, [[LODESTONE, 1, 1, 1]], [T(1, 2, [
    [CROSSBOW, 1, 1, 1, worn(0.1, 0.5, ench)], [SPECTRAL_ARROW, 1, 10, 28], [GILDED_BLACKSTONE, 1, 8, 12], [CRYING_OBSIDIAN, 1, 3, 8],
    [GOLD_BLOCK, 1, 1, 1], [GOLD_INGOT, 1, 4, 9], [IRON_INGOT, 1, 4, 9], [G.sword, 1, 1, 1], [GA.chestplate, 1, 1, 1, ench],
    [GA.helmet, 1, 1, 1, ench], [GA.leggings, 1, 1, 1, ench], [GA.boots, 1, 1, 1, ench], [G.axe, 1, 1, 1, ench],
  ]), T(2, 4, [[STRING, 1, 1, 6], [LEATHER, 1, 1, 3], [ARROW, 1, 5, 17], [IRON_NUGGET, 1, 2, 6], [GOLD_NUGGET, 1, 2, 6]]), TEMPLATE_POOL]),
  // Establos de hoglins (chests/bastion_hoglin_stable).
  bastion_hoglin_stable: T(1, 1, [
    [D.shovel, 15, 1, 1, worn(0.15, 0.8, ench)], [D.pickaxe, 12, 1, 1, worn(0.15, 0.95, ench)], [NETHERITE_SCRAP, 8, 1, 1],
    [ANCIENT_DEBRIS, 12, 1, 1], [ANCIENT_DEBRIS, 5, 2, 2], [SADDLE, 12, 1, 1],
    [GOLD_BLOCK, 16, 2, 4], [GOLDEN_CARROT, 10, 8, 17], [GOLDEN_APPLE, 10, 1, 1],
  ], [T(3, 4, [
    [G.axe, 1, 1, 1, ench], [CRYING_OBSIDIAN, 1, 1, 5], [GLOWSTONE, 1, 3, 6], [GILDED_BLACKSTONE, 1, 2, 5], [SOUL_SAND, 1, 2, 7],
    [CRIMSON_NYLIUM, 1, 2, 7], [GOLD_NUGGET, 1, 2, 8], [LEATHER, 1, 1, 3], [ARROW, 1, 5, 17], [STRING, 1, 3, 8], [RAW_PORKCHOP, 1, 2, 5],
    [COOKED_PORKCHOP, 1, 2, 5], [CRIMSON_FUNGUS, 1, 2, 7], [CRIMSON_ROOTS, 1, 2, 7],
  ]), TEMPLATE_POOL]),
  // Los demás cofres del bastión (chests/bastion_other).
  bastion_other: T(1, 1, [
    [D.pickaxe, 6, 1, 1, ench], [D.shovel, 6, 1, 1], [CROSSBOW, 6, 1, 1, worn(0.1, 0.9, ench)], [ANCIENT_DEBRIS, 12, 1, 1],
    [NETHERITE_SCRAP, 4, 1, 1], [SPECTRAL_ARROW, 10, 10, 22],
    [PIGLIN_BANNER_PATTERN, 9, 1, 1], [MUSIC_DISC_PIGSTEP, 5, 1, 1], [GOLDEN_CARROT, 12, 6, 17], [GOLDEN_APPLE, 9, 1, 1], [BOOK, 10, 1, 1, ench],
  ], [
    T(2, 2, [
      [TOOLS.iron.sword, 2, 1, 1, worn(0.1, 0.9, ench)], [IRON_BLOCK, 2, 1, 1], [GA.boots, 1, 1, 1, ench], [G.axe, 1, 1, 1, ench],
      [GOLD_BLOCK, 2, 1, 1], [CROSSBOW, 1, 1, 1], [GOLD_INGOT, 2, 1, 6], [IRON_INGOT, 2, 1, 6], [G.sword, 1, 1, 1], [GA.chestplate, 1, 1, 1],
      [GA.helmet, 1, 1, 1], [GA.leggings, 1, 1, 1], [GA.boots, 1, 1, 1], [CRYING_OBSIDIAN, 2, 1, 5],
    ]),
    T(3, 4, [
      [GILDED_BLACKSTONE, 2, 1, 5], [IRON_CHAIN, 1, 2, 10], [MAGMA_CREAM, 2, 2, 6], [BONE_BLOCK, 1, 3, 6], [IRON_NUGGET, 1, 2, 8],
      [OBSIDIAN, 1, 4, 6], [GOLD_NUGGET, 1, 2, 8], [STRING, 1, 4, 6], [ARROW, 2, 5, 17], [COOKED_PORKCHOP, 1, 1, 1],
    ]),
    TEMPLATE_POOL,
  ]),
  // La sala del tesoro (chests/bastion_treasure).
  bastion_treasure: T(3, 3, [
    [NETHERITE_INGOT, 15, 1, 1], [ANCIENT_DEBRIS, 10, 1, 1], [NETHERITE_SCRAP, 8, 1, 1], [ANCIENT_DEBRIS, 4, 2, 2],
    [D.sword, 6, 1, 1, worn(0.8, 1, ench)], [DA.chestplate, 6, 1, 1, worn(0.8, 1, ench)], [DA.helmet, 6, 1, 1, worn(0.8, 1, ench)],
    [DA.leggings, 6, 1, 1, worn(0.8, 1, ench)], [DA.boots, 6, 1, 1, worn(0.8, 1, ench)], [D.sword, 6, 1, 1], [DA.chestplate, 5, 1, 1],
    [DA.helmet, 5, 1, 1], [DA.boots, 5, 1, 1], [DA.leggings, 5, 1, 1], [DIAMOND, 5, 2, 6], [ENCHANTED_GOLDEN_APPLE, 2, 1, 1],
  ], [T(3, 4, [
    [SPECTRAL_ARROW, 1, 12, 25], [GOLD_BLOCK, 1, 2, 5], [IRON_BLOCK, 1, 2, 5], [GOLD_INGOT, 1, 3, 9], [IRON_INGOT, 1, 3, 9],
    [CRYING_OBSIDIAN, 1, 3, 5], [QUARTZ, 1, 8, 23], [GILDED_BLACKSTONE, 1, 5, 15], [MAGMA_CREAM, 1, 3, 8],
  ]), T(1, 1, [[NETHERITE_UPGRADE_SMITHING_TEMPLATE, 1, 1, 1]])]),
};
