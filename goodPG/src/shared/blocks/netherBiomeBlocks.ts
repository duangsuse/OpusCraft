// Fase 8.2 (biomas del Nether): los bloques de los cuatro biomas nuevos del Nether, como en Java 26.3.
// - Bosque carmesí y bosque distorsionado: tallos e hifas (con y sin corteza), tablones y todas sus formas
//   (losas, escaleras, vallas, portillos, puertas, trampillas, botones, placas y carteles, también
//   colgantes). No arden ni sirven de combustible. Necelio (rocanegra cubierta: suelta rocanegra y vuelve
//   a serlo si lo tapan), hongos, raíces, brotes del Nether (sólo con tijeras), enredaderas lloronas (cuelgan)
//   y retorcidas (suben), con su punta (con edad, crece) y su tallo, bloques de verrugas y luz de hongo.
// - Deltas de basalto y valle de almas: basalto y basalto pulido (con eje), piedra negra y sus formas:
//   pulida, ladrillos, agrietados, cincelada, dorada (a veces suelta pepitas de oro), con losas, escaleras,
//   muros, botón y placa de presión.
// - Ladrillos del Nether (de ladrillo del Nether, que sale de fundir rocanegra): normales, agrietados,
//   cincelados y rojos, con losas, escaleras, muros y la valla de ladrillos del Nether (sólo se une a las
//   suyas).
// Se registran los últimos (export * al final de index.ts): todos los ids son nuevos.
import {
  family, defs, familyStates, familyBase, stateOf, isFarmland, isSlab, isStairs, stateProps, R_CROSS, R_LAVA, type Opts, type SoundMaterial,
  type NeighborGet,
} from './registry';
import { DIRT, GRASS, SNOWY_GRASS } from './classic';
import { MYCELIUM, addPlanks } from './biomes';
import { addMaterialShapes, addWoodShapes, addFence, STAIRS, FENCE_GATES, DOORS, TRAPDOORS, type Material } from './building';
import { addSign, addWall, SIGNS, WALL_SIGNS } from './decoration';
import { addAxisLogs, AXIS_X, AXIS_Z } from './logAxis';
import { addStrip, MUDDY_MANGROVE_ROOTS } from './woods2';
import { addHangingSign, HANGING_SIGNS, WALL_HANGING_SIGNS } from './hangingSigns';
import { addButton, addPressurePlate, sturdy } from './redstoneBlocks';
import { NETHERRACK } from './structures';
import { registerOddLava } from './queries';
import { SOUL_SOIL } from './deepDarkBlocks';
import { MOSS_BLOCK } from './underground';
import { MUD } from './stoneBlocks';
import { COARSE_DIRT, PODZOL, ROOTED_DIRT } from './materialBlocks';

const INVENTORY: number[] = [];

/** Cambia el nombre de todos los estados de una familia (para concordar el género: «Puerta distorsionada»). */
function rename(id: number, name: string): void {
  for (const s of familyStates(familyBase(id))) defs[s].name = name;
}
/** Cambia el sonido de todos los estados de una familia. */
function resound(id: number, sound: SoundMaterial): void {
  for (const s of familyStates(familyBase(id))) defs[s].sound = sound;
}

// ------------------------------------------------------------------ maderas del Nether

/** Adjetivo de cada madera en sus cuatro formas: masculino, femenino, masculino plural y femenino plural. */
interface Adj {
  m: string;
  f: string;
  mp: string;
  fp: string;
}

export interface NetherWood {
  key: string;
  stem: number;
  strippedStem: number;
  hyphae: number;
  strippedHyphae: number;
  planks: number;
}

const STEM_OPTS: Opts = { sound: 'stem', hardness: 2, tool: 'axe', category: 'naturaleza' };

function netherWood(key: string, a: Adj): NetherWood {
  const side = `${key}_stem_side`, top = `${key}_stem_top`, sSide = `stripped_${key}_stem_side`, sTop = `stripped_${key}_stem_top`;
  const stem = family(`${key}_stem`, `Tallo ${a.m}`, [], () => ({ ...STEM_OPTS, top, side }));
  const axis = addAxisLogs(`${key}_stem`, `Tallo ${a.m}`, stem, top, side, undefined, { sound: 'stem' });
  const strippedStem = family(`stripped_${key}_stem`, `Tallo ${a.m} sin corteza`, [], () => ({ ...STEM_OPTS, top: sTop, side: sSide }));
  const sAxis = addAxisLogs(`stripped_${key}_stem`, `Tallo ${a.m} sin corteza`, strippedStem, sTop, sSide, undefined, { sound: 'stem' });
  const hyphae = family(`${key}_hyphae`, `Hifas ${a.fp}`, [], () => ({ ...STEM_OPTS, all: side }));
  const strippedHyphae = family(`stripped_${key}_hyphae`, `Hifas ${a.fp} sin corteza`, [], () => ({ ...STEM_OPTS, all: sSide }));
  // El hacha descorteza los tallos (de pie y tumbados) y las hifas.
  addStrip(stem, strippedStem);
  addStrip(hyphae, strippedHyphae);
  for (const a2 of [AXIS_X, AXIS_Z]) addStrip(axis + a2, sAxis + a2);
  const planks = family(`${key}_planks`, `Tablones ${a.mp}`, [], () => ({
    all: `${key}_planks`, sound: 'nether_wood', hardness: 2, tool: 'axe',
  }));
  addPlanks(planks);
  const m: Material = { key, name: a.f, block: planks, hardness: 2, tool: 'axe', tier: 0, sound: 'nether_wood' };
  addMaterialShapes(m);
  addWoodShapes(m);
  addSign(key, a.m);
  addHangingSign(key, a.m, strippedStem, sSide);
  addButton(key, a.m, `${key}_planks`, 'nether_wood', true);
  addPressurePlate(key, a.f, `${key}_planks`, 'nether_wood', true);
  // Nombres con su género y el sonido de la madera del Nether en todas las formas.
  rename(STAIRS[key], `Escaleras ${a.fp}`);
  rename(FENCE_GATES[key], `Portillo ${a.m}`);
  for (const id of [DOORS[key], TRAPDOORS[key], SIGNS[key], WALL_SIGNS[key], HANGING_SIGNS[key], WALL_HANGING_SIGNS[key]]) resound(id, 'nether_wood');
  INVENTORY.push(stem, strippedStem, hyphae, strippedHyphae, planks);
  return { key, stem, strippedStem, hyphae, strippedHyphae, planks };
}

export const CRIMSON = netherWood('crimson', { m: 'carmesí', f: 'carmesí', mp: 'carmesíes', fp: 'carmesíes' });
export const WARPED = netherWood('warped', { m: 'distorsionado', f: 'distorsionada', mp: 'distorsionados', fp: 'distorsionadas' });
export const NETHER_WOODS: readonly NetherWood[] = [CRIMSON, WARPED];
export const CRIMSON_STEM = CRIMSON.stem, WARPED_STEM = WARPED.stem;
export const CRIMSON_PLANKS = CRIMSON.planks, WARPED_PLANKS = WARPED.planks;

const NETHER_WOOD_KEYS = /^(stripped_)?(crimson|warped)_/;
/** ¿Bloque de madera del Nether? (no arde ni sirve de combustible). */
export function isNetherWood(key: string): boolean {
  return NETHER_WOOD_KEYS.test(key);
}


// ------------------------------------------------------------------ suelos y plantas

/** Necelio: rocanegra cubierta; se pica con pico y suelta rocanegra (con Toque de seda, el necelio). */
function nylium(key: string, name: string): number {
  return family(`${key}_nylium`, name, [], () => ({
    top: `${key}_nylium`, side: `${key}_nylium_side`, bottom: 'netherrack', hardness: 0.4, tool: 'pickaxe', tier: 1, sound: 'nylium',
    category: 'naturaleza',
  }));
}
export const CRIMSON_NYLIUM = nylium('crimson', 'Necelio carmesí');
export const WARPED_NYLIUM = nylium('warped', 'Necelio distorsionado');
/** ¿Necelio? (la etiqueta nylium de Java). */
export function isNylium(id: number): boolean {
  return id === CRIMSON_NYLIUM || id === WARPED_NYLIUM;
}

/** Tierras de la etiqueta supports_vegetation de Java (substrate_overworld y la tierra de cultivo). */
const VEGETATION_SOIL = new Set<number>([DIRT, COARSE_DIRT, ROOTED_DIRT, MUD, MUDDY_MANGROVE_ROOTS, MOSS_BLOCK, GRASS, SNOWY_GRASS, PODZOL, MYCELIUM]);
/** ¿Es tierra de la etiqueta supports_vegetation de Java (o la de cultivo)? */
export function isVegetationSoil(b: number): boolean {
  return VEGETATION_SOIL.has(b) || isFarmland(b);
}
/** ¿Puede crecer ahí una planta del Nether? (supports_warped_fungus / roots / nether_sprouts de Java). */
function netherPlantSoil(b: number, fungus: boolean): boolean {
  if (b < 0) return true; // sin cargar
  if (VEGETATION_SOIL.has(b) || isFarmland(b) || isNylium(b) || b === SOUL_SOIL) return true;
  return fungus && b === MYCELIUM;
}

const PLANT: Opts = { render: R_CROSS, solid: false, opaque: false, lightOpacity: 0, hardness: 0, category: 'naturaleza', walkThrough: true };

function netherPlant(key: string, name: string, sound: SoundMaterial, fungus: boolean, selection: number[], extra: Opts = {}): number {
  return family(key, name, [], () => ({
    ...PLANT, sound, all: key, selection, ...extra,
    support: (get: NeighborGet) => netherPlantSoil(get(0, -1, 0), fungus),
  }));
}
const px = (v: number) => v / 16;
// Hongo: columna de 8×9; raíces, de 12×13; brotes, de 12×3 (NetherFungusBlock, NetherRootsBlock, NetherSproutsBlock).
const FUNGUS_BOX = [px(4), 0, px(4), px(12), px(9), px(12)];
const ROOTS_BOX = [px(2), 0, px(2), px(14), px(13), px(14)];
const SPROUTS_BOX = [px(2), 0, px(2), px(14), px(3), px(14)];
export const CRIMSON_FUNGUS = netherPlant('crimson_fungus', 'Hongo carmesí', 'fungus', true, FUNGUS_BOX);
export const WARPED_FUNGUS = netherPlant('warped_fungus', 'Hongo distorsionado', 'fungus', true, FUNGUS_BOX);
export const CRIMSON_ROOTS = netherPlant('crimson_roots', 'Raíces carmesíes', 'roots', false, ROOTS_BOX, { replaceable: true });
export const WARPED_ROOTS = netherPlant('warped_roots', 'Raíces distorsionadas', 'roots', false, ROOTS_BOX, { replaceable: true });
export const NETHER_SPROUTS = netherPlant('nether_sprouts', 'Brotes del Nether', 'roots', false, SPROUTS_BOX, { replaceable: true });

/** ¿Hongo del Nether? */
export function isNetherFungus(id: number): boolean {
  return id === CRIMSON_FUNGUS || id === WARPED_FUNGUS;
}
/** Necelio en el que crece el hongo gigante de cada hongo. */
export function fungusNylium(fungus: number): number {
  return fungus === CRIMSON_FUNGUS ? CRIMSON_NYLIUM : fungus === WARPED_FUNGUS ? WARPED_NYLIUM : 0;
}

/** Edad máxima de la punta de una enredadera del Nether (la 25 ya no crece). */
export const VINE_MAX_AGE = 25;

/** ¿Tiene firme la cara de abajo? (para colgar una enredadera llorona). */
function sturdyBottom(b: number): boolean {
  if (sturdy(b)) return true;
  if (isSlab(b)) return stateProps(b)!.type !== 0;
  if (isStairs(b)) return stateProps(b)!.half === 0;
  return false;
}
/** ¿Tiene firme la cara de arriba? (para plantar una enredadera retorcida). */
function sturdyTopFace(b: number): boolean {
  if (sturdy(b)) return true;
  if (isSlab(b)) return stateProps(b)!.type !== 0;
  if (isStairs(b)) return stateProps(b)!.half === 1;
  return false;
}

/**
 * Enredadera del Nether: la punta (con edad) y el tallo. La llorona crece hacia abajo desde un techo firme;
 * la retorcida, hacia arriba desde un suelo firme. Las dos se trepan.
 */
function netherVine(key: string, name: string, down: boolean): { head: number; body: number } {
  const dy = down ? 1 : -1; // hacia el bloque del que cuelga o en el que se apoya
  let head = 0, body = 0;
  const attached = (get: NeighborGet) => {
    const b = get(0, dy, 0);
    if (b < 0) return true;
    const fb = familyBase(b);
    if (fb === head || fb === body) return true;
    return down ? sturdyBottom(b) : sturdyTopFace(b);
  };
  const common: Opts = {
    ...PLANT, sound: 'vines', climbable: true, collision: [], support: attached,
  };
  // Punta: 8×7 en la parte de arriba (llorona) o 8×15 desde abajo (retorcida); tallo: 14×16.
  head = family(key, name, [['age', VINE_MAX_AGE + 1]], () => ({
    ...common, all: key, selection: down ? [px(4), px(9), px(4), px(12), 1, px(12)] : [px(4), 0, px(4), px(12), px(15), px(12)],
  }));
  body = family(`${key}_plant`, name, [], () => ({
    ...common, all: `${key}_plant`, category: null, base: head, selection: [px(1), 0, px(1), px(15), 1, px(15)],
  }));
  return { head, body };
}
const WEEPING = netherVine('weeping_vines', 'Enredaderas lloronas', true);
const TWISTING = netherVine('twisting_vines', 'Enredaderas retorcidas', false);
export const WEEPING_VINES = WEEPING.head, WEEPING_VINES_PLANT = WEEPING.body;
export const TWISTING_VINES = TWISTING.head, TWISTING_VINES_PLANT = TWISTING.body;

/** Enredadera del Nether (punta o tallo) → [punta, tallo, dirección de crecimiento (−1 abajo, 1 arriba)], o null. */
export function netherVineOf(id: number): readonly [number, number, number] | null {
  const b = familyBase(id);
  if (b === WEEPING_VINES || b === WEEPING_VINES_PLANT) return [WEEPING_VINES, WEEPING_VINES_PLANT, -1];
  if (b === TWISTING_VINES || b === TWISTING_VINES_PLANT) return [TWISTING_VINES, TWISTING_VINES_PLANT, 1];
  return null;
}
/** Edad de la punta de una enredadera del Nether (−1 si no es una punta). */
export function vineAge(id: number): number {
  const b = familyBase(id);
  return b === WEEPING_VINES || b === TWISTING_VINES ? id - b : -1;
}
/** Punta de enredadera de ese tipo con esa edad. */
export function vineHead(head: number, age: number): number {
  return stateOf(head, { age: Math.max(0, Math.min(VINE_MAX_AGE, age)) });
}

export const NETHER_WART_BLOCK = family('nether_wart_block', 'Bloque de verrugas del Nether', [], () => ({
  all: 'nether_wart_block', hardness: 1, tool: 'hoe', sound: 'wart', category: 'naturaleza',
}));
export const WARPED_WART_BLOCK = family('warped_wart_block', 'Bloque de verrugas distorsionado', [], () => ({
  all: 'warped_wart_block', hardness: 1, tool: 'hoe', sound: 'wart', category: 'naturaleza',
}));
export const SHROOMLIGHT = family('shroomlight', 'Luz de hongo', [], () => ({
  all: 'shroomlight', hardness: 1, tool: 'hoe', sound: 'shroomlight', emission: 15, category: 'naturaleza',
}));

INVENTORY.push(
  CRIMSON_NYLIUM, WARPED_NYLIUM, CRIMSON_FUNGUS, WARPED_FUNGUS, CRIMSON_ROOTS, WARPED_ROOTS, NETHER_SPROUTS, WEEPING_VINES,
  TWISTING_VINES, NETHER_WART_BLOCK, WARPED_WART_BLOCK, SHROOMLIGHT,
);

// ------------------------------------------------------------------ basalto y piedra negra

const PICK = (hardness: number, sound: SoundMaterial): Opts => ({ hardness, tool: 'pickaxe', tier: 1, sound });

export const BASALT = family('basalt', 'Basalto', [], () => ({ ...PICK(1.25, 'basalt'), top: 'basalt_top', side: 'basalt_side', category: 'naturaleza' }));
addAxisLogs('basalt', 'Basalto', BASALT, 'basalt_top', 'basalt_side', undefined, PICK(1.25, 'basalt'));
export const POLISHED_BASALT = family('polished_basalt', 'Basalto pulido', [], () => ({
  ...PICK(1.25, 'basalt'), top: 'polished_basalt_top', side: 'polished_basalt_side',
}));
addAxisLogs('polished_basalt', 'Basalto pulido', POLISHED_BASALT, 'polished_basalt_top', 'polished_basalt_side', undefined, PICK(1.25, 'basalt'));

export const BLACKSTONE = family('blackstone', 'Piedra negra', [], () => ({
  ...PICK(1.5, 'stone'), top: 'blackstone_top', side: 'blackstone', category: 'naturaleza',
}));
export const POLISHED_BLACKSTONE = family('polished_blackstone', 'Piedra negra pulida', [], () => ({ ...PICK(2, 'stone'), all: 'polished_blackstone' }));
export const POLISHED_BLACKSTONE_BRICKS = family('polished_blackstone_bricks', 'Ladrillos de piedra negra pulida', [], () => ({
  ...PICK(1.5, 'stone'), all: 'polished_blackstone_bricks',
}));
export const CRACKED_POLISHED_BLACKSTONE_BRICKS = family('cracked_polished_blackstone_bricks', 'Ladrillos de piedra negra pulida agrietados', [], () => ({
  ...PICK(1.5, 'stone'), all: 'cracked_polished_blackstone_bricks',
}));
export const CHISELED_POLISHED_BLACKSTONE = family('chiseled_polished_blackstone', 'Piedra negra pulida cincelada', [], () => ({
  ...PICK(1.5, 'stone'), all: 'chiseled_polished_blackstone',
}));
export const GILDED_BLACKSTONE = family('gilded_blackstone', 'Piedra negra dorada', [], () => ({
  ...PICK(1.5, 'nether_ore'), all: 'gilded_blackstone', category: 'minerales',
}));

// ------------------------------------------------------------------ ladrillos del Nether

export const NETHER_BRICKS = family('nether_bricks', 'Ladrillos del Nether', [], () => ({ ...PICK(2, 'nether_bricks'), all: 'nether_bricks' }));
export const CRACKED_NETHER_BRICKS = family('cracked_nether_bricks', 'Ladrillos del Nether agrietados', [], () => ({
  ...PICK(2, 'nether_bricks'), all: 'cracked_nether_bricks',
}));
export const CHISELED_NETHER_BRICKS = family('chiseled_nether_bricks', 'Ladrillos del Nether cincelados', [], () => ({
  ...PICK(2, 'nether_bricks'), all: 'chiseled_nether_bricks',
}));
export const RED_NETHER_BRICKS = family('red_nether_bricks', 'Ladrillos rojos del Nether', [], () => ({
  ...PICK(2, 'nether_bricks'), all: 'red_nether_bricks',
}));

// Losas, escaleras y muros de cada piedra (la dureza de su bloque) y la valla de ladrillos del Nether.
const SHAPED: [key: string, name: string, block: number, hardness: number, sound: SoundMaterial][] = [
  ['blackstone', 'de piedra negra', BLACKSTONE, 1.5, 'stone'],
  ['polished_blackstone', 'de piedra negra pulida', POLISHED_BLACKSTONE, 2, 'stone'],
  ['polished_blackstone_brick', 'de ladrillos de piedra negra pulida', POLISHED_BLACKSTONE_BRICKS, 1.5, 'stone'],
  ['nether_brick', 'de ladrillos del Nether', NETHER_BRICKS, 2, 'nether_bricks'],
  ['red_nether_brick', 'de ladrillos rojos del Nether', RED_NETHER_BRICKS, 2, 'nether_bricks'],
];
for (const [key, name, block, hardness, sound] of SHAPED) {
  addMaterialShapes({ key, name, block, hardness, tool: 'pickaxe', tier: 1, sound });
  resound(addWall({ key, name, block, hardness }), sound);
}
export const NETHER_BRICK_FENCE = addFence(
  { key: 'nether_brick', name: 'de ladrillos del Nether', block: NETHER_BRICKS, hardness: 2, tool: 'pickaxe', tier: 1, sound: 'nether_bricks' },
  false, 'nether_brick_fence',
);
export const POLISHED_BLACKSTONE_BUTTON = addButton('polished_blackstone', 'de piedra negra pulida', 'polished_blackstone', 'stone', false);
export const POLISHED_BLACKSTONE_PRESSURE_PLATE = addPressurePlate('polished_blackstone', 'de piedra negra pulida', 'polished_blackstone', 'stone', false);

INVENTORY.push(
  BASALT, POLISHED_BASALT, BLACKSTONE, POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS, CRACKED_POLISHED_BLACKSTONE_BRICKS,
  CHISELED_POLISHED_BLACKSTONE, GILDED_BLACKSTONE, NETHER_BRICKS, CRACKED_NETHER_BRICKS, CHISELED_NETHER_BRICKS, RED_NETHER_BRICKS,
  NETHER_BRICK_FENCE,
);

// ------------------------------------------------------------------ lava rápida

/** Lava que corre de niveles 1, 3, 5 y 7 (la del Nether baja de 1 en 1; la del mundo normal, de 2 en 2). */
export const LAVA_FLOW_ODD = family('lava_flow_odd', 'Lava', [['n', 4]], (st) => ({
  all: 'lava', render: R_LAVA, solid: false, opaque: false, lightOpacity: 15, emission: 15, sound: 'lava', replaceable: true,
  category: null, fluid: 2, level: 1 + st.n * 2, hardness: -1, noItem: true,
}));
registerOddLava(LAVA_FLOW_ODD);

/** Bloques de esta fase en el orden del inventario creativo (las losas, escaleras, muros… entran solos). */
export const NETHER_BIOME_INVENTORY: readonly number[] = INVENTORY;

/** Losas, escaleras y muros de las piedras del Nether (para el cortapiedras). */
export const NETHER_STONE_SHAPES: readonly string[] = SHAPED.map(([key]) => key);
