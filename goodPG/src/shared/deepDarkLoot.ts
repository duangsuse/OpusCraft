// Fase 7.5 (abismo): botín de las ciudades antiguas (la tabla de Minecraft 1.19+): el cofre normal y el de la
// nevera. Los libros de sigilo rápido sólo salen aquí; las grebas de diamante y la azada, encantadas con
// 30–50 niveles (sin sigilo rápido, que no sale al azar); el disco 5, en nueve fragmentos.
import type { LootTable, LootFn } from './loot';
import {
  ENCHANTED_GOLDEN_APPLE, MUSIC_DISCS, COMPASS, NAME_TAG, LEAD, HORSE_ARMOR, SADDLE, ARMOR, TOOLS, BOOK, AMETHYST_SHARD,
  EXPERIENCE_BOTTLE, GLOW_BERRIES, ECHO_SHARD, DISC_FRAGMENT_5, POTION, BONE, COAL, SUSPICIOUS_STEW, GOLDEN_CARROT,
  BAKED_POTATO, SNOWBALL,
} from './items';
import { SCULK, SCULK_SENSOR, SCULK_CATALYST, CANDLE, SOUL_TORCH, PACKED_ICE, BLOCKS } from './blocks';
import { discIndexOfKey } from './discs';
import { enchantWithLevels, applyEnchants, rndFrom } from './enchanting';
import { SWIFT_SNEAK, ENCHANTS } from './enchantments';
import { PT_REGENERATION } from './potions';
import { SUSPICIOUS_FLOWERS } from './decorFood';

const disc = (k: string) => MUSIC_DISCS[discIndexOfKey(k)];
/** Con 30..50 niveles (como la mesa, con más poder). */
const levels = (min: number, max: number): LootFn => (s, rand) => enchantWithLevels(s, min + Math.floor(rand() * (max - min + 1)), rndFrom(rand));
/** Libro de sigilo rápido (nivel al azar). */
const swiftSneak: LootFn = (_s, rand) => applyEnchants({ id: BOOK, count: 1 }, [[SWIFT_SNEAK, 1 + Math.floor(rand() * ENCHANTS[SWIFT_SNEAK].max)]]);
/** Desgastada (del 80 al 100 % de su vida, como la azada de Minecraft). */
const worn = (fn: LootFn): LootFn => (s, rand) => fn({ ...s, dmg: Math.floor(rand() * 0.2 * 1561) }, rand);
const potion = (type: number): LootFn => (s) => ({ ...s, dmg: type });
/** Estofado sospechoso de visión nocturna o de ceguera (la flor va en `dmg`: su índice + 1). */
const stew: LootFn = (s, rand) => {
  const want = rand() < 0.5 ? 'poppy' : 'azure_bluet';
  const i = SUSPICIOUS_FLOWERS.findIndex(([f]) => BLOCKS[f]?.key === want);
  return i >= 0 ? { ...s, dmg: i + 1 } : s;
};

type Entry = LootTable['entries'][number];
const T = (min: number, max: number, entries: Entry[]): LootTable => ({ rolls: [min, max], entries });

export const DEEP_DARK_LOOT: Readonly<Record<string, LootTable>> = {
  ancient_city: T(5, 10, [
    [ENCHANTED_GOLDEN_APPLE, 1, 1, 2], [disc('otherside'), 1, 1, 1], [COMPASS, 2, 1, 1], [SCULK_CATALYST, 2, 1, 2],
    [NAME_TAG, 2, 1, 1], [TOOLS.diamond.hoe, 2, 1, 1, worn(levels(30, 50))], [LEAD, 2, 1, 1], [HORSE_ARMOR.diamond, 2, 1, 1],
    [SADDLE, 2, 1, 1], [disc('13'), 2, 1, 1], [disc('cat'), 2, 1, 1], [ARMOR.diamond.leggings, 2, 1, 1, levels(30, 50)],
    [BOOK, 3, 1, 1, swiftSneak], [SCULK, 3, 4, 10], [SCULK_SENSOR, 3, 1, 3], [CANDLE, 3, 1, 4], [AMETHYST_SHARD, 3, 1, 15],
    [EXPERIENCE_BOTTLE, 3, 1, 3], [GLOW_BERRIES, 3, 1, 15], [ARMOR.iron.leggings, 3, 1, 1, levels(20, 39)], [ECHO_SHARD, 4, 1, 3],
    [DISC_FRAGMENT_5, 4, 1, 3], [POTION, 5, 1, 1, potion(PT_REGENERATION)], [BOOK, 5, 1, 1, levels(30, 30)], [BONE, 5, 1, 15],
    [SOUL_TORCH, 5, 1, 15], [COAL, 7, 6, 15],
  ]),
  ancient_city_ice_box: T(4, 10, [
    [SUSPICIOUS_STEW, 1, 1, 1, stew], [GOLDEN_CARROT, 1, 1, 10], [BAKED_POTATO, 1, 1, 10], [PACKED_ICE, 2, 2, 6], [SNOWBALL, 4, 2, 6],
  ]),
};
