// Fase 7.5 (abismo): lo que sueltan los bloques del Deep Dark. La familia del sculk sólo se recoge con
// Toque de seda (sin él, experiencia: ver sculkXp); la pizarra reforzada y el fuego de alma, nada; el farol de
// alma colgado, el farol.
import { REINFORCED_DEEPSLATE, SOUL_FIRE, SOUL_LANTERN, familyBase, needsSilkTouch } from '../blocks';
import type { ItemStack } from '../items';

/** Botín de un bloque del Deep Dark roto sin Toque de seda (null: no es uno de ellos). */
export function deepDarkDrops(block: number): ItemStack[] | null {
  const b = familyBase(block);
  if (needsSilkTouch(block) || b === REINFORCED_DEEPSLATE || b === SOUL_FIRE) return [];
  if (b === SOUL_LANTERN) return [{ id: SOUL_LANTERN, count: 1 }];
  return null;
}
