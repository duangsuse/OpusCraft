// Maderas de la fase 6.5: mangle (con raíces, raíces lodosas y propágulos, también colgando de las
// hojas), roble pálido (sólo la madera) y bambú (la planta que crece, el bloque de bambú y sus
// tablones y mosaico), cada una con sus formas (losas, escaleras, vallas, portillos, puertas,
// trampillas y carteles). Y, para todas las maderas, troncos sin corteza, leños (corteza por los seis
// lados) y leños sin corteza: el hacha descorteza troncos y leños con clic derecho.
// Se registra lo último de index.ts: todos los ids son nuevos y no mueven ninguno guardado.
import { family, defs, L, R_CROSS, R_CUTOUT, R_MODEL, type Opts } from './registry';
import { GRASS, DIRT, SAND, GRAVEL, SNOWY_GRASS, CLAY } from './classic';
import { WOOD_TYPES, addWoodType, addWoodLog, addPlanks, type WoodType } from './biomes';
import { addMaterialShapes, addWoodShapes, type Material } from './building';
import { addSign } from './decoration';
import { MOSS_BLOCK } from './underground';
import { LOG_AXIS, AXIS_X, AXIS_Z, addAxisLogs } from './logAxis';
import { mbox } from '../blockModels';

// ------------------------------------------------------------------ maderas nuevas

const MANGROVE = addWoodType('mangrove', 'de mangle');
const PALE_OAK = addWoodType('pale_oak', 'de roble pálido');

// El brote del mangle es un propágulo (como en Minecraft).
{
  const d = defs[MANGROVE.sapling];
  d.key = 'mangrove_propagule';
  d.name = 'Propágulo de mangle';
  d.tex = ['mangrove_propagule', 'mangrove_propagule', 'mangrove_propagule', 'mangrove_propagule', 'mangrove_propagule', 'mangrove_propagule'];
}

export const MANGROVE_LOG = MANGROVE.log, MANGROVE_PLANKS = MANGROVE.planks, MANGROVE_LEAVES = MANGROVE.leaves;
export const MANGROVE_PROPAGULE = MANGROVE.sapling;
export const PALE_OAK_LOG = PALE_OAK.log, PALE_OAK_PLANKS = PALE_OAK.planks, PALE_OAK_LEAVES = PALE_OAK.leaves;
export const PALE_OAK_SAPLING = PALE_OAK.sapling;

// Troncos tumbados de las maderas nuevas (las siete primeras ya los tienen, de logAxis.ts).
for (const w of [MANGROVE, PALE_OAK]) addAxisLogs(w.key, `Tronco ${w.name}`, w.log, `${w.key}_log_top`, `${w.key}_log_side`, w);

/** Propágulo colgando bajo unas hojas de mangle (al generarse el mundo); suelta el propágulo. */
export const HANGING_PROPAGULE = family('mangrove_propagule_hanging', 'Propágulo de mangle', [], () => ({
  render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, sound: 'grass', hardness: 0, all: 'mangrove_propagule',
  category: null, base: MANGROVE.sapling,
  support: (get) => {
    const above = get(0, 1, 0);
    return above < 0 || above === MANGROVE.leaves;
  },
}));

/** Raíces de mangle: se ve a través de ellas. */
export const MANGROVE_ROOTS = family('mangrove_roots', 'Raíces de mangle', [], () => ({
  all: 'mangrove_roots', render: R_CUTOUT, lightOpacity: 1, sound: 'wood', hardness: 0.7, tool: 'axe', category: 'naturaleza',
}));

/** Raíces de mangle lodosas: el pie de las raíces, metido en el fango. */
export const MUDDY_MANGROVE_ROOTS = family('muddy_mangrove_roots', 'Raíces de mangle lodosas', [], () => ({
  top: 'muddy_mangrove_roots_top', side: 'muddy_mangrove_roots_side', sound: 'dirt', hardness: 0.7, tool: 'shovel',
  category: 'naturaleza',
}));

// ------------------------------------------------------------------ bambú

/** Suelo en el que arraiga el bambú. */
const BAMBOO_SOIL = new Set([GRASS, DIRT, SAND, GRAVEL, SNOWY_GRASS, CLAY, MOSS_BLOCK]);

/** Hojas de un tallo de bambú. */
export const BAMBOO_NO_LEAVES = 0, BAMBOO_SMALL_LEAVES = 1, BAMBOO_LARGE_LEAVES = 2;

/**
 * Planta de bambú: un tallo fino que crece hacia arriba; los tres de arriba llevan hojas. Se apoya en
 * otro tallo o en el suelo: al romper uno, se caen (y se sueltan) todos los de encima.
 */
export const BAMBOO = family('bamboo', 'Bambú', [['leaves', 3]], (st) => {
  const stalk = L('bamboo_stalk'), end = L('bamboo_block_top');
  const boxes = [mbox(6, 0, 6, 9, 16, 9, [stalk, stalk, end, end, stalk, stalk])];
  if (st.leaves > 0) {
    const t = L(st.leaves === BAMBOO_LARGE_LEAVES ? 'bamboo_large_leaves' : 'bamboo_small_leaves');
    boxes.push(mbox(0, 0, 7.5, 16, 16, 7.5, [-1, -1, -1, -1, t, t]), mbox(7.5, 0, 0, 7.5, 16, 16, [t, t, -1, -1, -1, -1]));
  }
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, sound: 'wood', hardness: 1, tool: 'axe', category: 'naturaleza',
    all: 'bamboo_stalk', flatItem: 'bamboo_stalk', model: boxes,
    collision: [6 / 16, 0, 6 / 16, 9 / 16, 1, 9 / 16],
    selection: [5 / 16, 0, 5 / 16, 10 / 16, 1, 10 / 16],
    support: (get) => {
      const b = get(0, -1, 0);
      return b < 0 || bambooGrowsOn(b);
    },
  };
});
/** ¿Tallo de bambú (con cualquier hoja)? */
export const isBamboo = (id: number): boolean => id >= BAMBOO && id < BAMBOO + 3;
/** El tallo de bambú con esas hojas. */
export const bambooWithLeaves = (leaves: number): number => BAMBOO + leaves;

const WOOD_OPTS: Opts = { sound: 'wood', hardness: 2, tool: 'axe' };

export const BAMBOO_BLOCK = family('bamboo_block', 'Bloque de bambú', [], () => ({
  ...WOOD_OPTS, top: 'bamboo_block_top', side: 'bamboo_block_side',
}));
export const STRIPPED_BAMBOO_BLOCK = family('stripped_bamboo_block', 'Bloque de bambú sin piel', [], () => ({
  ...WOOD_OPTS, top: 'stripped_bamboo_block_top', side: 'stripped_bamboo_block_side',
}));
const BAMBOO_BLOCK_AXIS = addAxisLogs('bamboo_block', 'Bloque de bambú', BAMBOO_BLOCK, 'bamboo_block_top', 'bamboo_block_side');
const STRIPPED_BAMBOO_AXIS = addAxisLogs(
  'stripped_bamboo_block', 'Bloque de bambú sin piel', STRIPPED_BAMBOO_BLOCK, 'stripped_bamboo_block_top', 'stripped_bamboo_block_side',
);

export const BAMBOO_PLANKS = family('bamboo_planks', 'Tablones de bambú', [], () => ({ ...WOOD_OPTS, all: 'bamboo_planks' }));
addPlanks(BAMBOO_PLANKS);
{
  const m: Material = { key: 'bamboo', name: 'de bambú', block: BAMBOO_PLANKS, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign('bamboo', 'de bambú');
}
export const BAMBOO_MOSAIC = family('bamboo_mosaic', 'Mosaico de bambú', [], () => ({ ...WOOD_OPTS, all: 'bamboo_mosaic' }));
addMaterialShapes({ key: 'bamboo_mosaic', name: 'de mosaico de bambú', block: BAMBOO_MOSAIC, hardness: 2, tool: 'axe', tier: 0, sound: 'wood' });

// ------------------------------------------------------------------ sin corteza y leños

/** Troncos sin corteza, leños y leños sin corteza de una madera. */
export interface WoodExtras {
  wood: WoodType;
  strippedLog: number;
  /** Leño: corteza por los seis lados. */
  woodBlock: number;
  strippedWood: number;
}

/** Bloque con corteza → el mismo sin corteza (troncos de pie y tumbados, leños, bloques de bambú). */
const STRIP = new Map<number, number>();
/** Extras de cada madera, en el orden de WOOD_TYPES. */
export const WOOD_EXTRAS: readonly WoodExtras[] = WOOD_TYPES.map((w) => {
  const k = w.key;
  const sTop = `stripped_${k}_log_top`, sSide = `stripped_${k}_log_side`;
  const strippedLog = family(`stripped_${k}_log`, `Tronco ${w.name} sin corteza`, [], () => ({
    ...WOOD_OPTS, top: sTop, side: sSide,
  }));
  const sAxis = addAxisLogs(`stripped_${k}`, `Tronco ${w.name} sin corteza`, strippedLog, sTop, sSide, w);
  const woodBlock = family(`${k}_wood`, `Leño ${w.name}`, [], () => ({ ...WOOD_OPTS, all: `${k}_log_side` }));
  const strippedWood = family(`stripped_${k}_wood`, `Leño ${w.name} sin corteza`, [], () => ({ ...WOOD_OPTS, all: sSide }));
  for (const id of [strippedLog, woodBlock, strippedWood]) addWoodLog(id, w);
  STRIP.set(w.log, strippedLog);
  STRIP.set(woodBlock, strippedWood);
  for (const a of [AXIS_X, AXIS_Z]) STRIP.set(LOG_AXIS[k] + a, sAxis + a);
  return { wood: w, strippedLog, woodBlock, strippedWood };
});
STRIP.set(BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK);
for (const a of [AXIS_X, AXIS_Z]) STRIP.set(BAMBOO_BLOCK_AXIS + a, STRIPPED_BAMBOO_AXIS + a);

/** Registra un bloque que el hacha descorteza (fase 8.2: los tallos y las hifas del Nether). */
export function addStrip(from: number, to: number): void {
  STRIP.set(from, to);
}

/** El bloque descortezado (con la misma orientación), o 0 si el hacha no le hace nada. */
export function strippedOf(id: number): number {
  return STRIP.get(id) ?? 0;
}

/** Extras de una madera por su clave. */
export function woodExtras(key: string): WoodExtras | undefined {
  return WOOD_EXTRAS.find((e) => e.wood.key === key);
}

// ------------------------------------------------------------------ inventario creativo

/** Bloques de la fase 6.5 que no entran solos en el inventario (formas, carteles y las maderas con árbol sí). */
export const WOODS2_INVENTORY: readonly number[] = [
  ...WOOD_EXTRAS.flatMap((e) => [e.strippedLog, e.woodBlock, e.strippedWood]),
  MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS, BAMBOO, BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_PLANKS, BAMBOO_MOSAIC,
];

/** ¿Puede crecer un tallo de bambú sobre este bloque? (otro tallo o el suelo en el que arraiga). */
export function bambooGrowsOn(below: number): boolean {
  return isBamboo(below) || BAMBOO_SOIL.has(below);
}
