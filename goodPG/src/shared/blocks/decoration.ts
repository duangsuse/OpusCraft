// Decoración de la fase 4: muros de piedra (se unen como las vallas), camas de colores y carteles de
// madera (de pie y en la pared; el texto lo guarda el servidor aparte).
// (Se registran después de la granja para no mover los ids guardados.)
import { family, defs, L, texOf, familyBase, isFenceGate, BLOCK_OPAQUE, R_MODEL, type Opts } from './registry';
import { COBBLESTONE, MOSSY_COBBLESTONE, STONE_BRICKS, BRICKS, SANDSTONE, GRANITE, DIORITE, ANDESITE } from './classic';
import { RED_BED } from './building';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

// ------------------------------------------------------------------ muros

export interface WallMaterial {
  key: string;
  name: string;
  block: number;
  hardness: number;
}
const WALL_MATERIALS: WallMaterial[] = [
  { key: 'cobblestone', name: 'de roca', block: COBBLESTONE, hardness: 2 },
  { key: 'mossy_cobblestone', name: 'de roca musgosa', block: MOSSY_COBBLESTONE, hardness: 2 },
  { key: 'stone_brick', name: 'de ladrillos de piedra', block: STONE_BRICKS, hardness: 1.5 },
  { key: 'brick', name: 'de ladrillos', block: BRICKS, hardness: 2 },
  { key: 'sandstone', name: 'de arenisca', block: SANDSTONE, hardness: 0.8 },
  { key: 'granite', name: 'de granito', block: GRANITE, hardness: 1.5 },
  { key: 'diorite', name: 'de diorita', block: DIORITE, hardness: 1.5 },
  { key: 'andesite', name: 'de andesita', block: ANDESITE, hardness: 1.5 },
];

/** Muro de cada material (por la clave del material). */
export const WALLS: Record<string, number> = {};
/** Bloque del que se hace cada muro (recetas y cortapiedras). */
export const WALL_SOURCE: Record<number, number> = {};
const WALL_IDS = new Set<number>();

/** Los muros se unen a otros muros, a los portillos y a los bloques sólidos completos. */
function wallConnects(id: number): boolean {
  return id > 0 && (WALL_IDS.has(id) || isFenceGate(id) || BLOCK_OPAQUE[id] === 1);
}

/** Muro de un material (los materiales nuevos se añaden al final: ids guardados). */
export function addWall(m: WallMaterial): number {
  const t = texOf(m.block);
  const post = mbox(4, 0, 4, 12, 16, 12, t);
  const side = (d: number) => rotateBoxes([mbox(5, 0, 0, 11, 14, 8, t)], d);
  const conns = (get: (dx: number, dy: number, dz: number) => number) =>
    [0, 1, 2, 3].map((d) => wallConnects(get(DIR_X[d], 0, DIR_Z[d])));
  /** Sin poste sólo en un tramo recto (dos lados opuestos) sin nada encima. */
  const needsPost = (c: boolean[], above: number) =>
    !((c[0] && c[2] && !c[1] && !c[3]) || (c[1] && c[3] && !c[0] && !c[2])) || above > 0;
  const wall = family(`${m.key}_wall`, `Muro ${m.name}`, [], () => ({
    hardness: m.hardness, tool: 'pickaxe', tier: 1, sound: 'stone', render: R_MODEL, tex: defs[m.block].tex,
    shape: (get) => {
      const c = conns(get);
      const boxes: ModelBox[] = needsPost(c, get(0, 1, 0)) ? [post] : [];
      for (let d = 0; d < 4; d++) if (c[d]) boxes.push(...side(d));
      return boxes;
    },
    itemModel: [post, ...side(0), ...side(2)],
    collision: (get) => {
      const c = conns(get);
      const out = [0.25, 0, 0.25, 0.75, 1.5, 0.75];
      for (let d = 0; d < 4; d++) if (c[d]) out.push(...rotateFlat([5 / 16, 0, 0, 11 / 16, 1.5, 0.5], d));
      return out;
    },
    selection: (get) => {
      const c = conns(get);
      const out = [0.25, 0, 0.25, 0.75, 1, 0.75];
      for (let d = 0; d < 4; d++) if (c[d]) out.push(...rotateFlat([5 / 16, 0, 0, 11 / 16, 14 / 16, 0.5], d));
      return out;
    },
  }));
  WALLS[m.key] = wall;
  WALL_SOURCE[wall] = m.block;
  WALL_IDS.add(wall);
  return wall;
}
for (const m of WALL_MATERIALS) addWall(m);

// ------------------------------------------------------------------ camas de colores

/** Colores de cama (los de la lana que hay); la roja ya existía. */
export const BED_COLORS: [key: string, name: string][] = [
  ['white', 'blanca'], ['black', 'negra'], ['orange', 'naranja'], ['yellow', 'amarilla'], ['lime', 'verde lima'],
  ['blue', 'azul'], ['purple', 'morada'],
];
/** Cama de cada color (incluida la roja). */
export const BEDS: Record<string, number> = { red: RED_BED };
for (const [color, name] of BED_COLORS) {
  BEDS[color] = family(`${color}_bed`, `Cama ${name}`, [['facing', 4], ['part', 2]], (st) => {
    const wool = L(`${color}_wool`), pillow = L('white_wool'), wood = L('oak_planks');
    const mattress = mbox(0, 3, 0, 16, 9, 16, [wool, wool, wool, wood, wool, wool]);
    const boxes = st.part === 0
      ? [mattress, mbox(0, 0, 13, 3, 3, 16, wood), mbox(13, 0, 13, 16, 3, 16, wood)]
      : [mattress, mbox(1, 9, 1, 15, 11, 7, pillow), mbox(0, 0, 0, 3, 3, 3, wood), mbox(13, 0, 0, 16, 3, 3, wood)];
    return {
      render: R_MODEL, hardness: 0.2, sound: 'wool', all: `${color}_wool`, category: 'decoracion',
      model: rotateBoxes(boxes, st.facing), collision: [0, 0, 0, 1, 9 / 16, 1],
    };
  });
}

// ------------------------------------------------------------------ carteles

const SIGN_WOODS: [key: string, name: string][] = [['oak', 'de roble'], ['birch', 'de abedul'], ['spruce', 'de abeto']];
/** Cartel de pie de cada madera (el objeto) y su versión de pared. */
export const SIGNS: Record<string, number> = {};
export const WALL_SIGNS: Record<string, number> = {};
/** Cartel de pie → cartel de pared de la misma madera. */
export const SIGN_WALL_OF: Record<number, number> = {};
const SIGN_BASES = new Set<number>();

/** Cartel de pie y de pared de una madera. */
export function addSign(wood: string, name: string): void {
  const common: Opts = {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 1, tool: 'axe', sound: 'wood',
    all: `${wood}_planks`, category: null,
  };
  // De pie: tablero de 16×8 sobre un palo; `facing` es hacia donde mira el texto (el frente es -Z mirando al norte).
  SIGNS[wood] = family(`${wood}_sign`, `Cartel ${name}`, [['facing', 4]], (st) => {
    const t = L(`${wood}_planks`);
    return {
      ...common,
      category: 'decoracion',
      model: rotateBoxes([mbox(7, 0, 7, 9, 8, 9, t), mbox(0, 8, 7, 16, 16, 9, t)], st.facing),
      selection: rotateFlat([0, 0, 7 / 16, 1, 1, 9 / 16], st.facing),
    };
  });
  // En la pared: tablero pegado a la pared de detrás (como la escalera de mano).
  WALL_SIGNS[wood] = family(`${wood}_wall_sign`, `Cartel ${name}`, [['facing', 4]], (st) => {
    const t = L(`${wood}_planks`);
    return {
      ...common,
      model: rotateBoxes([mbox(0, 4, 14, 16, 12, 16, t)], st.facing),
      selection: rotateFlat([0, 4 / 16, 14 / 16, 1, 12 / 16, 1], st.facing),
      wall: st.facing, base: SIGNS[wood],
    };
  });
  SIGN_WALL_OF[SIGNS[wood]] = WALL_SIGNS[wood];
  SIGN_BASES.add(SIGNS[wood]);
  SIGN_BASES.add(WALL_SIGNS[wood]);
}
for (const [wood, name] of SIGN_WOODS) addSign(wood, name);

/** Otros carteles (colgantes) que cuentan como carteles: se escribe su texto igual. */
export function addSignBase(id: number): void {
  SIGN_BASES.add(id);
}

/** ¿Cartel (de pie o de pared)? */
export function isSign(id: number): boolean {
  return SIGN_BASES.has(familyBase(id));
}

/** ¿Muro? */
export function isWall(id: number): boolean {
  return WALL_IDS.has(id);
}
