// Fase 8.7 (el Wither): la rosa marchita (WitherRoseBlock). La deja en el suelo lo que mata el Wither (si cabe; si
// no, suelta la flor). Crece en las tierras de siempre, la rocanegra y la arena y la tierra de alma; a quien la toca le
// da Marchitamiento (2 s). Echa humo. Va en maceta, da tinte negro y un estofado sospechoso con Marchitamiento.
// Registrada al final (export * al final de index.ts): no mueve ningún id guardado.
import { family, R_CROSS, type NeighborGet } from './registry';
import { isVegetationSoil } from './netherBiomeBlocks';
import { NETHERRACK } from './structures';
import { SOUL_SAND, SOUL_SOIL } from './deepDarkBlocks';

/** supports_wither_rose: supports_vegetation, rocanegra, arena y tierra de alma. */
export function supportsWitherRose(b: number): boolean {
  return b < 0 || isVegetationSoil(b) || b === NETHERRACK || b === SOUL_SAND || b === SOUL_SOIL;
}

export const WITHER_ROSE = family('wither_rose', 'Rosa marchita', [], () => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: 'wither_rose', category: 'naturaleza',
  walkThrough: true, selection: [5 / 16, 0, 5 / 16, 11 / 16, 10 / 16, 11 / 16],
  support: (get: NeighborGet) => supportsWitherRose(get(0, -1, 0)),
}));

/** Su sitio en el inventario creativo. */
export const WITHER_INVENTORY: readonly number[] = [WITHER_ROSE];
