// Bloques de las criaturas acuáticas (fase 6): huevos de tortuga. Las tortugas los ponen en la arena
// de la playa; se agrietan (sobre todo de noche) y al tercer paso nacen las crías.
import { family, L, BLOCK_SOLID, R_MODEL } from './registry';
import { mbox, type ModelBox } from '../blockModels';

/** Cajas de cada huevo (en dieciseisavos), en el orden en que se van añadiendo. */
const EGG_BOXES: [number, number, number, number, number, number][] = [
  [5, 0, 4, 9, 7, 8],
  [1, 0, 9, 5, 5, 13],
  [10, 0, 9, 14, 5, 13],
  [10, 0, 1, 13, 4, 4],
];
const EGG_TEXTURES = ['turtle_egg', 'turtle_egg_slightly_cracked', 'turtle_egg_very_cracked'];

/**
 * Huevo de tortuga: `eggs` 0..3 = de 1 a 4 huevos; `hatch` 0..2 = entero, algo agrietado, muy
 * agrietado (el siguiente paso eclosiona).
 */
export const TURTLE_EGG = family('turtle_egg', 'Huevo de tortuga', [['eggs', 4], ['hatch', 3]], (st) => {
  const tex = EGG_TEXTURES[st.hatch];
  const t = L(tex);
  const model: ModelBox[] = EGG_BOXES.slice(0, st.eggs + 1).map(([x0, y0, z0, x1, y1, z1]) => mbox(x0, y0, z0, x1, y1, z1, t));
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0.5, sound: 'stone', all: tex, category: 'naturaleza',
    model,
    collision: [1 / 16, 0, 1 / 16, 15 / 16, 7 / 16, 15 / 16],
    selection: [1 / 16, 0, 1 / 16, 15 / 16, 7 / 16, 15 / 16],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    },
  };
});

export const isTurtleEgg = (id: number): boolean => id >= TURTLE_EGG && id < TURTLE_EGG + 12;

/** Número de huevos (1..4) y grado de agrietado (0..2) de un estado. */
export function turtleEggState(id: number): { eggs: number; hatch: number } {
  const i = id - TURTLE_EGG;
  return { eggs: (i % 4) + 1, hatch: Math.floor(i / 4) };
}

/** Estado con `eggs` huevos (1..4) y agrietado `hatch` (0..2). */
export function turtleEggBlock(eggs: number, hatch: number): number {
  return TURTLE_EGG + (Math.max(1, Math.min(4, eggs)) - 1) + Math.max(0, Math.min(2, hatch)) * 4;
}
