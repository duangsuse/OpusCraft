// Fase 8.2 (biomas del Nether): lo que sueltan los bloques de los biomas del Nether (tablas de botín de la
// 26.3). El necelio suelta rocanegra; los brotes del Nether, sólo con tijeras; las enredaderas lloronas y
// retorcidas, con tijeras la enredadera y si no, a veces (un 33 %, más con Fortuna); la piedra negra
// dorada, a veces de 2 a 5 pepitas de oro (un 10 %, más con Fortuna) y si no, ella misma. Con Toque de seda
// (enchantDrops.ts) el necelio, las enredaderas y la piedra negra dorada se sueltan a sí mismos.
import {
  CRIMSON_NYLIUM, WARPED_NYLIUM, NETHERRACK, NETHER_SPROUTS, GILDED_BLACKSTONE, netherVineOf,
} from '../blocks';
import { ITEMS, GOLD_NUGGET, type ItemStack } from '../items';

/** Probabilidad de la enredadera sin tijeras con Fortuna 0, 1, 2 y 3 (table_bonus de Java). */
const VINE_CHANCE = [0.33, 0.55, 0.77, 1];
/** Probabilidad de las pepitas de la piedra negra dorada con Fortuna 0, 1, 2 y 3. */
const GILDED_CHANCE = [0.1, 0.14285715, 0.25, 1];

const bonus = (chances: readonly number[], fortune: number) => chances[Math.min(fortune, chances.length - 1)];

/** Botín de un bloque de los biomas del Nether, o null si no es de éstos (o suelta lo de siempre). */
export function netherBiomeDrops(block: number, toolId: number, rand: () => number, fortune = 0): ItemStack[] | null {
  const kind = toolId > 0 ? ITEMS[toolId]?.tool?.kind : undefined;
  if (block === CRIMSON_NYLIUM || block === WARPED_NYLIUM) return [{ id: NETHERRACK, count: 1 }];
  if (block === NETHER_SPROUTS) return kind === 'shears' ? [{ id: NETHER_SPROUTS, count: 1 }] : [];
  const vine = netherVineOf(block);
  if (vine) {
    if (kind === 'shears' || rand() < bonus(VINE_CHANCE, fortune)) return [{ id: vine[0], count: 1 }];
    return [];
  }
  if (block === GILDED_BLACKSTONE) {
    if (rand() < bonus(GILDED_CHANCE, fortune)) return [{ id: GOLD_NUGGET, count: 2 + Math.floor(rand() * 4) }];
    return [{ id: GILDED_BLACKSTONE, count: 1 }];
  }
  return null;
}
