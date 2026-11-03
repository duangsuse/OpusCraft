// Bloques de los biomas de la fase 5: cuatro maderas nuevas (jungla, acacia, roble oscuro y cerezo)
// con toda su familia (tronco, tablones, hojas, brote, losa, escaleras, valla, portillo, puerta,
// trampilla y carteles), y la vegetación y los suelos de los biomas nuevos: enredaderas, nenúfares,
// micelio y champiñones gigantes, arena roja y terracotas de las badlands, hielo compacto, flores
// de prado y pétalos de cerezo. Todo se registra después de los bloques de trabajo (ids guardados).
import {
  family, L, BLOCK_OPAQUE, BLOCK_SOLID, BLOCK_FLUID, BLOCK_FLUID_LEVEL, R_CROSS, R_CUTOUT, R_MODEL, type Opts,
} from './registry';
import {
  OAK_LOG, OAK_PLANKS, OAK_LEAVES, OAK_SAPLING, BIRCH_LOG, BIRCH_PLANKS, BIRCH_LEAVES, BIRCH_SAPLING, SPRUCE_LOG,
  SPRUCE_PLANKS, SPRUCE_LEAVES, SPRUCE_SAPLING,
} from './classic';
import { addMaterialShapes, addWoodShapes, type Material } from './building';
import { addSign } from './decoration';
import { mbox, rotateBoxes, rotateFlat, DIR_X, DIR_Z } from '../blockModels';

const plant = (tex: string, o: Opts = {}): Opts => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: tex,
  category: 'naturaleza', ...o,
});

// ------------------------------------------------------------------ maderas

export interface WoodType {
  key: string;
  /** "de roble", "de jungla"… */
  name: string;
  log: number;
  planks: number;
  leaves: number;
  sapling: number;
}

function newWood(key: string, name: string): WoodType {
  const log = family(`${key}_log`, `Tronco ${name}`, [], () => ({
    top: `${key}_log_top`, side: `${key}_log_side`, sound: 'wood', hardness: 2, tool: 'axe', category: 'naturaleza',
  }));
  const planks = family(`${key}_planks`, `Tablones ${name}`, [], () => ({
    all: `${key}_planks`, sound: 'wood', hardness: 2, tool: 'axe',
  }));
  const leaves = family(`${key}_leaves`, `Hojas ${name}`, [], () => ({
    all: `${key}_leaves`, render: R_CUTOUT, lightOpacity: 1, sound: 'leaves', hardness: 0.2, category: 'naturaleza',
  }));
  const sapling = family(`${key}_sapling`, `Brote ${name}`, [], () => plant(`${key}_sapling`));
  const m: Material = { key, name, block: planks, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign(key, name);
  return { key, name, log, planks, leaves, sapling };
}

const JUNGLE = newWood('jungle', 'de jungla');
const ACACIA = newWood('acacia', 'de acacia');
const DARK_OAK = newWood('dark_oak', 'de roble oscuro');
const CHERRY = newWood('cherry', 'de cerezo');

export const JUNGLE_LOG = JUNGLE.log, JUNGLE_PLANKS = JUNGLE.planks, JUNGLE_LEAVES = JUNGLE.leaves, JUNGLE_SAPLING = JUNGLE.sapling;
export const ACACIA_LOG = ACACIA.log, ACACIA_PLANKS = ACACIA.planks, ACACIA_LEAVES = ACACIA.leaves, ACACIA_SAPLING = ACACIA.sapling;
export const DARK_OAK_LOG = DARK_OAK.log, DARK_OAK_PLANKS = DARK_OAK.planks, DARK_OAK_LEAVES = DARK_OAK.leaves;
export const DARK_OAK_SAPLING = DARK_OAK.sapling;
export const CHERRY_LOG = CHERRY.log, CHERRY_PLANKS = CHERRY.planks, CHERRY_LEAVES = CHERRY.leaves, CHERRY_SAPLING = CHERRY.sapling;

/** Todas las maderas, en el orden en que se registraron. */
export const WOOD_TYPES: readonly WoodType[] = [
  { key: 'oak', name: 'de roble', log: OAK_LOG, planks: OAK_PLANKS, leaves: OAK_LEAVES, sapling: OAK_SAPLING },
  { key: 'birch', name: 'de abedul', log: BIRCH_LOG, planks: BIRCH_PLANKS, leaves: BIRCH_LEAVES, sapling: BIRCH_SAPLING },
  { key: 'spruce', name: 'de abeto', log: SPRUCE_LOG, planks: SPRUCE_PLANKS, leaves: SPRUCE_LEAVES, sapling: SPRUCE_SAPLING },
  JUNGLE, ACACIA, DARK_OAK, CHERRY,
];
export const ALL_LOGS: readonly number[] = WOOD_TYPES.map((w) => w.log);
export const ALL_PLANKS: readonly number[] = WOOD_TYPES.map((w) => w.planks);
export const ALL_LEAVES: readonly number[] = WOOD_TYPES.map((w) => w.leaves);
export const ALL_SAPLINGS: readonly number[] = WOOD_TYPES.map((w) => w.sapling);
const LEAF_SET = new Set(ALL_LEAVES);
const LOG_SET = new Set(ALL_LOGS);
const SAPLING_SET = new Set(ALL_SAPLINGS);
export const isLeaves = (id: number): boolean => LEAF_SET.has(id);
export const isLog = (id: number): boolean => LOG_SET.has(id);
/** Madera de las variantes de tronco que se registran después (troncos tumbados). */
const VARIANT_WOOD = new Map<number, WoodType>();
/** Registra una variante de tronco (tumbado) como tronco de su madera. */
export function addLogVariant(id: number, wood: WoodType): void {
  LOG_SET.add(id);
  VARIANT_WOOD.set(id, wood);
}
export const isSapling = (id: number): boolean => SAPLING_SET.has(id);
/** Madera de un tronco, unas hojas o un brote. */
export function woodOf(id: number): WoodType | undefined {
  return VARIANT_WOOD.get(id) ?? WOOD_TYPES.find((w) => w.log === id || w.leaves === id || w.sapling === id || w.planks === id);
}

// ------------------------------------------------------------------ enredaderas y nenúfares

/**
 * Enredaderas: cuelgan de la pared de detrás (como la escalera de mano) o de otra enredadera de
 * encima, se trepan y se pueden atravesar. `facing` es hacia donde mira la hoja (la pared, detrás).
 */
export const VINE = family('vine', 'Enredaderas', [['facing', 4]], (st) => {
  const t = L('vine');
  const f = st.facing;
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, replaceable: true, hardness: 0.2, sound: 'leaves',
    category: 'naturaleza', walkThrough: true, climbable: true, wall: f, flatItem: 'vine',
    model: rotateBoxes([mbox(0, 0, 15.2, 16, 16, 15.2, [-1, -1, -1, -1, t, t])], f),
    collision: [],
    selection: rotateFlat([0, 0, 15 / 16, 1, 1, 1], f),
    support: (get) => {
      const behind = get(-DIR_X[f], 0, -DIR_Z[f]);
      if (behind < 0 || BLOCK_OPAQUE[behind] === 1 || isLeaves(behind)) return true;
      const above = get(0, 1, 0);
      return above < 0 || isVine(above);
    },
  };
});
export const isVine = (id: number): boolean => id >= VINE && id < VINE + 4;

/** Nenúfar: flota sobre una fuente de agua y se puede pisar. */
export const LILY_PAD = family('lily_pad', 'Nenúfar', [], () => {
  const t = L('lily_pad');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 0, sound: 'grass', category: 'naturaleza', flatItem: 'lily_pad',
    model: [mbox(0, 0, 0, 16, 0.25, 16, [-1, -1, t, t, -1, -1])],
    collision: [0, 0, 0, 1, 1.5 / 16, 1],
    selection: [0, 0, 0, 1, 1.5 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || (BLOCK_FLUID[b] === 1 && BLOCK_FLUID_LEVEL[b] === 0);
    },
  };
});

// ------------------------------------------------------------------ suelos y bloques de bioma

export const MYCELIUM = family('mycelium', 'Micelio', [], () => ({
  top: 'mycelium_top', side: 'mycelium_side', bottom: 'dirt', sound: 'grass', hardness: 0.6, tool: 'shovel', category: 'naturaleza',
}));
export const RED_MUSHROOM_BLOCK = family('red_mushroom_block', 'Bloque de champiñón rojo', [], () => ({
  all: 'red_mushroom_block', sound: 'wood', hardness: 0.2, tool: 'axe', category: 'naturaleza',
}));
export const BROWN_MUSHROOM_BLOCK = family('brown_mushroom_block', 'Bloque de champiñón marrón', [], () => ({
  all: 'brown_mushroom_block', sound: 'wood', hardness: 0.2, tool: 'axe', category: 'naturaleza',
}));
export const MUSHROOM_STEM = family('mushroom_stem', 'Tallo de champiñón', [], () => ({
  side: 'mushroom_stem', top: 'mushroom_block_inside', sound: 'wood', hardness: 0.2, tool: 'axe', category: 'naturaleza',
}));
export const RED_SAND = family('red_sand', 'Arena roja', [], () => ({
  all: 'red_sand', sound: 'sand', hardness: 0.5, tool: 'shovel', category: 'naturaleza',
}));
export const RED_SANDSTONE = family('red_sandstone', 'Arenisca roja', [], () => ({
  top: 'red_sandstone_top', side: 'red_sandstone_side', bottom: 'red_sandstone_bottom', hardness: 0.8, tool: 'pickaxe', tier: 1,
}));
/** Terracotas de colores de las badlands (en franjas). */
export const TERRACOTTA_COLORS = ['white', 'orange', 'yellow', 'brown', 'red', 'light_gray'] as const;
const TERRACOTTA_NAMES: Record<string, string> = {
  white: 'blanca', orange: 'naranja', yellow: 'amarilla', brown: 'marrón', red: 'roja', light_gray: 'gris claro',
};
export const COLORED_TERRACOTTA: Record<string, number> = {};
for (const c of TERRACOTTA_COLORS) {
  COLORED_TERRACOTTA[c] = family(`${c}_terracotta`, `Terracota ${TERRACOTTA_NAMES[c]}`, [], () => ({
    all: `${c}_terracotta`, hardness: 1.25, tool: 'pickaxe', tier: 1, category: 'colores',
  }));
}
export const PACKED_ICE = family('packed_ice', 'Hielo compacto', [], () => ({
  all: 'packed_ice', sound: 'glass', hardness: 0.5, tool: 'pickaxe', category: 'naturaleza',
}));

// ------------------------------------------------------------------ flores

export const FLOWER_KEYS = [
  'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy',
  'lily_of_the_valley',
] as const;
const FLOWER_NAMES: Record<string, string> = {
  blue_orchid: 'Orquídea azul', allium: 'Allium', azure_bluet: 'Rubia azul', red_tulip: 'Tulipán rojo',
  orange_tulip: 'Tulipán naranja', white_tulip: 'Tulipán blanco', pink_tulip: 'Tulipán rosa', oxeye_daisy: 'Margarita',
  lily_of_the_valley: 'Lirio de los valles',
};
export const FLOWERS: Record<string, number> = {};
for (const k of FLOWER_KEYS) FLOWERS[k] = family(k, FLOWER_NAMES[k], [], () => plant(k));

/** Pétalos rosas: una alfombra de flores de cerezo sobre la hierba. */
export const PINK_PETALS = family('pink_petals', 'Pétalos rosas', [], () => {
  const t = L('pink_petals');
  return {
    render: R_MODEL, solid: false, opaque: false, lightOpacity: 0, hardness: 0, sound: 'grass', replaceable: true,
    category: 'naturaleza', walkThrough: true, flatItem: 'pink_petals',
    // A 1/16 de la hierba (más cerca, la profundidad no los distingue de lejos y parpadean).
    model: [mbox(0, 0, 0, 16, 1, 16, [-1, -1, t, -1, -1, -1])],
    collision: [],
    selection: [0, 0, 0, 1, 3 / 16, 1],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || BLOCK_SOLID[b] === 1;
    },
  };
});


// ------------------------------------------------------------------ Fase 6.5 (maderas)
// Maderas registradas al final (mangle y roble pálido: ids nuevos, no mueven nada) y bloques que
// cuentan como tronco o tablón de una madera (troncos sin corteza, leños, tablones de bambú).

/** Registra una madera nueva completa y la añade a WOOD_TYPES y a las listas de troncos, hojas… */
export function addWoodType(key: string, name: string): WoodType {
  const w = newWood(key, name);
  (WOOD_TYPES as WoodType[]).push(w);
  (ALL_LOGS as number[]).push(w.log);
  (ALL_PLANKS as number[]).push(w.planks);
  (ALL_LEAVES as number[]).push(w.leaves);
  (ALL_SAPLINGS as number[]).push(w.sapling);
  LOG_SET.add(w.log);
  LEAF_SET.add(w.leaves);
  SAPLING_SET.add(w.sapling);
  return w;
}

/** Un bloque que es objeto y cuenta como tronco de su madera (combustible, carbón vegetal, fogatas…). */
export function addWoodLog(id: number, wood: WoodType): void {
  (ALL_LOGS as number[]).push(id);
  addLogVariant(id, wood);
}

/** Tablones que no son de una madera con árbol (bambú): valen para palos, mesas, cofres… */
export function addPlanks(id: number): void {
  (ALL_PLANKS as number[]).push(id);
}
