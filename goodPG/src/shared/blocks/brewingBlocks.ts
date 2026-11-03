// Fase 7 (pociones): el alambique alquímico (soporte para pociones). Tres pies de piedra, la vara central
// de blaze y sus brazos, de los que cuelgan los frascos que tenga dentro (el estado `bottles` guarda qué
// huecos están ocupados, bit a bit). Da un poco de luz, como en Minecraft.
// Se registra el último (export * al final de index.ts): no mueve ningún id guardado.
import { family, familyBase, stateOf, stateProps, L, R_MODEL } from './registry';
import { mbox, type ModelBox } from '../blockModels';

/** Centro (x, z, en dieciseisavos) de cada hueco de frasco: este, noroeste y suroeste. */
export const BREWING_BOTTLE_AT: readonly [number, number][] = [[12, 8], [5, 4], [5, 12]];

function standBoxes(mask: number): ModelBox[] {
  const base = L('brewing_stand_base'), rod = L('brewing_stand_rod');
  const side = L('brewing_stand_bottle'), cap = L('brewing_stand_bottle_top');
  const out: ModelBox[] = [
    // Pies (como los de Minecraft) y la vara.
    mbox(9, 0, 5, 15, 2, 11, base), mbox(2, 0, 1, 8, 2, 7, base), mbox(2, 0, 9, 8, 2, 15, base),
    mbox(7, 0, 7, 9, 14, 9, rod),
    // Brazos: al este recto; al noroeste y al suroeste, en ángulo.
    mbox(9, 11, 7.5, 12.5, 12, 8.5, rod),
    mbox(4.5, 11, 7.5, 7, 12, 8.5, rod), mbox(4.5, 11, 3.5, 5.5, 12, 7.5, rod), mbox(4.5, 11, 8.5, 5.5, 12, 12.5, rod),
  ];
  BREWING_BOTTLE_AT.forEach(([x, z], i) => {
    if (!(mask & (1 << i))) return;
    const tex = [side, side, cap, cap, side, side];
    // Cuerpo, cuello y el gancho del que cuelga.
    out.push(mbox(x - 2, 2, z - 2, x + 2, 7, z + 2, tex), mbox(x - 1, 7, z - 1, x + 1, 10, z + 1, tex));
    out.push(mbox(x - 0.5, 10, z - 0.5, x + 0.5, 11, z + 0.5, rod));
  });
  return out;
}

export const BREWING_STAND = family('brewing_stand', 'Soporte para pociones', [['bottles', 8]], (st) => ({
  render: R_MODEL, opaque: false, lightOpacity: 0, emission: 1, hardness: 0.5, tool: 'pickaxe', sound: 'stone',
  category: 'decoracion', all: 'brewing_stand_base', model: standBoxes(st.bottles), itemModel: standBoxes(7),
  collision: [0, 0, 0, 1, 2 / 16, 1, 7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16],
  selection: [0, 0, 0, 1, 2 / 16, 1, 7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16],
}));

export function isBrewingStand(id: number): boolean {
  return id > 0 && familyBase(id) === BREWING_STAND;
}

/** El alambique con esos huecos de frasco ocupados (bit 0, 1 y 2). */
export function brewingStandWith(mask: number): number {
  return stateOf(BREWING_STAND, { bottles: mask & 7 });
}

/** Huecos de frasco que dibuja el bloque. */
export function brewingStandMask(id: number): number {
  return isBrewingStand(id) ? stateProps(id)!.bottles : 0;
}
