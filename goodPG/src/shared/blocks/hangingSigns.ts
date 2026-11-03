// Carteles colgantes de cada madera: del techo (colgando de dos cadenas) o de la pared (de una barra
// que sale de ella, con el tablero perpendicular a la pared). Tienen texto por las dos caras, como en
// Minecraft; el texto lo guarda el mismo sistema que los carteles normales.
// Se registran los últimos (export * al final de index.ts): no mueven ningún id guardado.
import { family, L, familyBase, BLOCK_SOLID, R_MODEL, type NeighborGet } from './registry';
import { mbox, rotateBoxes, rotateFlat, type ModelBox } from '../blockModels';
import { addSignBase } from './decoration';
import { WOOD_EXTRAS, STRIPPED_BAMBOO_BLOCK } from './woods2';
import { isChain } from './decorBlocks';

/** Cartel colgante del techo de cada madera (el objeto) y su versión de pared. */
export const HANGING_SIGNS: Record<string, number> = {};
export const WALL_HANGING_SIGNS: Record<string, number> = {};
/** Cartel colgante del techo → el de pared de la misma madera. */
export const HANGING_WALL_OF: Record<number, number> = {};
/** Tronco descortezado con el que se fabrica el cartel colgante de cada madera. */
export const HANGING_SIGN_LOG: Record<string, number> = {};

const CEILING = new Set<number>();
const WALL = new Set<number>();

/** ¿Se puede colgar un cartel de este bloque? */
function holds(id: number): boolean {
  return id < 0 || BLOCK_SOLID[id] === 1 || isChain(id);
}

/** Dos cadenas cruzadas de y0 a y1 alrededor de (x, z), en dieciseisavos. */
function chainBoxes(x: number, z: number, y0: number, y1: number): ModelBox[] {
  const c = L('chain');
  return [mbox(x, y0, z - 1, x, y1, z + 1, [c, c, -1, -1, -1, -1]), mbox(x - 1, y0, z, x + 1, y1, z, [-1, -1, -1, -1, c, c])];
}

export function addHangingSign(key: string, name: string, log: number, logTex: string): void {
  const opts = {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1, tool: 'axe' as const, sound: 'wood' as const,
    all: logTex,
  };
  // Del techo, mirando al norte: tablero de 14×10 con las caras en z = 7 y z = 9, y dos cadenas encima.
  HANGING_SIGNS[key] = family(`${key}_hanging_sign`, `Cartel colgante ${name}`, [['facing', 4]], (st) => {
    const t = L(logTex);
    return {
      ...opts,
      category: 'decoracion',
      model: rotateBoxes([mbox(1, 0, 7, 15, 10, 9, t), ...chainBoxes(3, 8, 10, 16), ...chainBoxes(13, 8, 10, 16)], st.facing),
      selection: rotateFlat([1 / 16, 0, 7 / 16, 15 / 16, 1, 9 / 16], st.facing),
      support: (get: NeighborGet) => holds(get(0, 1, 0)),
    };
  });
  // En la pared (detrás, al sur si mira al norte): barra de la pared hacia fuera y el tablero colgando
  // de ella a lo largo, con las caras hacia el este y el oeste.
  WALL_HANGING_SIGNS[key] = family(`${key}_wall_hanging_sign`, `Cartel colgante ${name}`, [['facing', 4]], (st) => {
    const t = L(logTex);
    return {
      ...opts,
      category: null,
      model: rotateBoxes([
        mbox(7, 14, 0, 9, 16, 16, t), mbox(7, 0, 1, 9, 10, 15, t), ...chainBoxes(8, 3, 10, 14), ...chainBoxes(8, 13, 10, 14),
      ], st.facing),
      selection: rotateFlat([7 / 16, 0, 0, 9 / 16, 1, 1], st.facing),
      wall: st.facing, base: HANGING_SIGNS[key],
    };
  });
  HANGING_WALL_OF[HANGING_SIGNS[key]] = WALL_HANGING_SIGNS[key];
  HANGING_SIGN_LOG[key] = log;
  CEILING.add(HANGING_SIGNS[key]);
  WALL.add(WALL_HANGING_SIGNS[key]);
  addSignBase(HANGING_SIGNS[key]);
  addSignBase(WALL_HANGING_SIGNS[key]);
}

for (const { wood, strippedLog } of WOOD_EXTRAS) addHangingSign(wood.key, wood.name, strippedLog, `stripped_${wood.key}_log_side`);
addHangingSign('bamboo', 'de bambú', STRIPPED_BAMBOO_BLOCK, 'stripped_bamboo_block_side');

/** Tipo de cartel colgante: 0 no lo es, 1 del techo, 2 de pared. */
export function hangingSignKind(id: number): number {
  const b = familyBase(id);
  return CEILING.has(b) ? 1 : WALL.has(b) ? 2 : 0;
}

export const HANGING_SIGN_INVENTORY: readonly number[] = Object.values(HANGING_SIGNS);
