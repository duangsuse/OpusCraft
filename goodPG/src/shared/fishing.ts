// Pesca: tiempos de espera y de picada, y el botín (tablas de Minecraft sin encantamientos:
// 85 % peces, 10 % basura y 5 % tesoros).
import {
  COD, SALMON, PUFFERFISH, TROPICAL_FISH, ARMOR, LEATHER, BONE, ROTTEN_FLESH, STRING, STICK, FISHING_ROD, BOW,
  ITEMS, type ItemStack,
} from './items';
import { NAUTILUS_SHELL } from './items'; // Fase 6.5 (equipo)
// Fase 7 (encantamientos): Suerte marina y tesoros encantados (arco, caña y libro con 30 niveles).
import { BOOK, NAME_TAG, SADDLE } from './items';
import { fishingWeights } from './enchantEffects';
import { enchantWithLevels, rndFrom } from './enchanting';

/** Segundos hasta que pica un pez (con lluvia, un 20 % menos). */
export const FISH_WAIT: readonly [number, number] = [5, 30];
/** Segundos que dura la picada (hay que recoger entonces). */
export const FISH_BITE: readonly [number, number] = [1, 2];
/** Experiencia por captura. */
export const FISH_XP: readonly [number, number] = [1, 6];

type Entry = [id: number, weight: number, damaged?: boolean];
const FISH: Entry[] = [[COD, 60], [SALMON, 25], [PUFFERFISH, 13], [TROPICAL_FISH, 2]];
const JUNK: Entry[] = [
  [ARMOR.leather.boots, 10, true], [LEATHER, 10], [BONE, 10], [ROTTEN_FLESH, 10], [STRING, 5], [STICK, 5],
  [FISHING_ROD, 2, true],
];
const TREASURE: Entry[] = [[BOW, 1, true], [FISHING_ROD, 1, true], [NAUTILUS_SHELL, 1]]; // Fase 6.5 (equipo): concha de nautilo
TREASURE.push([BOOK, 1], [NAME_TAG, 1], [SADDLE, 1]); // Fase 7 (encantamientos): como en Minecraft

function pick(table: Entry[], rand: () => number): ItemStack {
  const total = table.reduce((n, e) => n + e[1], 0);
  let r = rand() * total;
  for (const [id, w, damaged] of table) {
    r -= w;
    if (r < 0) {
      const max = ITEMS[id].tool?.durability ?? ITEMS[id].armor?.durability ?? 0;
      // Basura y tesoros gastados: entre el 10 y el 90 % de desgaste.
      return damaged && max ? { id, count: 1, dmg: Math.floor(max * (0.1 + 0.8 * rand())) } : { id, count: 1 };
    }
  }
  return { id: table[0][0], count: 1 };
}

/**
 * Lo que sale del agua al recoger en plena picada. Fase 7 (encantamientos): `luck` es el nivel de Suerte
 * marina (menos basura y más tesoros); el arco, la caña y el libro del tesoro salen encantados.
 */
export function fishingLoot(rand: () => number = Math.random, luck = 0): ItemStack {
  const w = fishingWeights(luck);
  const r = rand() * (w.fish + w.junk + w.treasure);
  if (r >= w.fish + w.junk) {
    const s = pick(TREASURE, rand);
    if (s.id === BOW || s.id === FISHING_ROD || s.id === BOOK) {
      // Como en Minecraft: el arco y la caña, gastados como mucho un 25 %.
      if (s.dmg) s.dmg = Math.floor((ITEMS[s.id].tool?.durability ?? 0) * 0.25 * rand());
      if (!s.dmg) delete s.dmg;
      return enchantWithLevels(s, 30, rndFrom(rand));
    }
    return s;
  }
  return pick(r < w.fish ? FISH : JUNK, rand);
}
