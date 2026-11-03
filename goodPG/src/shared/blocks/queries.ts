// Consultas sobre bloques en tiempo de juego: modelos, colisión, selección, apoyo, fluidos y
// orientación de hornos y cofres.
import {
  defs, stateProps, stateOf, familyBase, isDoor, isBed, isCrop, isCake, isFarmland, BLOCK_BASE, BLOCK_SOLID, BLOCK_OPAQUE,
  BLOCK_FLUID, BLOCK_FLUID_LEVEL, STATIC_COLLISION, R_MODEL, R_CROSS, R_TORCH, R_CACTUS, type NeighborGet,
} from './registry';
import { WATER, WATER_FLOW_1, WATER_FALL, LAVA, LAVA_FLOW_1, LAVA_FALL, FURNACE, FURNACE_LIT, CHEST } from './classic';
import { CARVED_PUMPKIN, JACK_O_LANTERN } from './farm';
import { CHEST_DOUBLE, SMOKER, BLAST_FURNACE, STONECUTTER } from './workstations';
import { MAX_BLOCK_ID } from '../constants';
import { flatBoxes, unionBox, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

/** Cajas con las que se dibuja un bloque R_MODEL como objeto (mano, suelo, inventario). */
export function blockItemModel(id: number): ModelBox[] {
  const d = defs[id];
  if (!d) return [];
  return d.itemModel ?? d.model ?? (d.shape ? d.shape(() => 0) : []);
}

/** Forma del modelo de un bloque R_MODEL (null si no tiene). */
export function blockModel(id: number, get: NeighborGet): ModelBox[] | null {
  const d = defs[id];
  if (!d) return null;
  if (d.shape) return d.shape(get);
  return d.model ?? null;
}

/**
 * Cajas de colisión locales (0..1) de un bloque con forma (BLOCK_COLLIDE = 2) en (x, y, z).
 * `out` se reutiliza para no crear listas nuevas.
 */
export function blockCollisionBoxes(
  id: number, x: number, y: number, z: number, w: { getBlock(x: number, y: number, z: number): number }, out: number[],
): number[] {
  const d = defs[id];
  if (!d) return out;
  if (typeof d.collision === 'function') return d.collision((dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz));
  return STATIC_COLLISION[id] ?? (typeof d.collision === 'object' ? d.collision : FULL_BOX);
}

const FULL_BOX = [0, 0, 0, 1, 1, 1];
const CROSS_BOX = [0.12, 0, 0.12, 0.88, 0.85, 0.88];
const TORCH_BOX = [0.4, 0, 0.4, 0.6, 0.65, 0.6];
const CACTUS_BOX = [1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16];

/** Cajas de selección (0..1) de un bloque: las del modelo, las de su tipo o el cubo. */
export function blockSelectionBoxes(id: number, get: NeighborGet): number[] {
  const d = defs[id];
  if (!d) return FULL_BOX;
  if (d.selection) return typeof d.selection === 'function' ? d.selection(get) : d.selection;
  if (d.render === R_MODEL) return flatBoxes(blockModel(id, get) ?? []);
  if (d.render === R_CROSS) return CROSS_BOX;
  if (d.render === R_TORCH) return TORCH_BOX;
  if (d.render === R_CACTUS) return CACTUS_BOX;
  return FULL_BOX;
}

/** Caja envolvente de la selección (para el contorno). */
export function blockSelectionBounds(id: number, get: NeighborGet): number[] {
  return unionBox(blockSelectionBoxes(id, get));
}

/**
 * ¿Sigue apoyado el bloque? Antorchas de pared y escaleras de mano necesitan la pared de detrás,
 * las puertas su otra mitad (y suelo) y las camas su otra parte.
 */
export function blockSupported(id: number, get: NeighborGet): boolean {
  const d = defs[id];
  if (!d) return true;
  if (d.support) return d.support(get);
  if (d.wall !== undefined && d.wall >= 0) {
    const b = get(-DIR_X[d.wall], 0, -DIR_Z[d.wall]);
    return b < 0 || BLOCK_OPAQUE[b] === 1;
  }
  if (isCrop(id)) {
    const below = get(0, -1, 0);
    return below < 0 || isFarmland(below);
  }
  if (isCake(id)) {
    const below = get(0, -1, 0);
    return below < 0 || BLOCK_SOLID[below] === 1;
  }
  const st = stateProps(id);
  if (!st) return true;
  if (isDoor(id)) {
    if (st.half === 0) {
      const below = get(0, -1, 0), above = get(0, 1, 0);
      return (below < 0 || BLOCK_SOLID[below] === 1) && (above < 0 || (isDoor(above) && familyBase(above) === familyBase(id)));
    }
    const below = get(0, -1, 0);
    return below < 0 || (isDoor(below) && familyBase(below) === familyBase(id));
  }
  if (isBed(id)) {
    const s = st.part === 0 ? 1 : -1;
    const o = get(DIR_X[st.facing] * s, 0, DIR_Z[st.facing] * s);
    return o < 0 || (isBed(o) && stateProps(o)!.part !== st.part);
  }
  return true;
}

export function isValidBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < defs.length && id < MAX_BLOCK_ID && defs[id] !== undefined;
}

/**
 * Fase 8.2: primer id de la lava de niveles impares (1, 3, 5 y 7: la que corre rápido en el Nether). Se
 * registra la última (netherBiomeBlocks.ts) y se apunta aquí para no mover los ids de los demás bloques.
 */
let LAVA_FLOW_ODD = 0;
export function registerOddLava(base: number): void {
  LAVA_FLOW_ODD = base;
}

/** Nivel máximo de un fluido que corre (el 8 es el que cae), como en Java: 7 para los dos. */
export const FLUID_MAX_LEVEL = [0, 7, 7];

/** Id del bloque de un fluido (1 agua, 2 lava) con nivel 0 (fuente), 1..max o 8 (cayendo). */
export function fluidBlock(fluid: number, level: number): number {
  if (fluid === 1) return level === 0 ? WATER : level >= 8 ? WATER_FALL : WATER_FLOW_1 + level - 1;
  if (level === 0) return LAVA;
  if (level >= 8) return LAVA_FALL;
  // Niveles pares: los de siempre; impares (la lava rápida del Nether): los de LAVA_FLOW_ODD.
  return level % 2 === 0 ? LAVA_FLOW_1 + level / 2 - 1 : LAVA_FLOW_ODD + (level >> 1);
}

/** Altura (0..1) de la superficie de un bloque de fluido según su nivel. */
export function fluidHeight(id: number): number {
  const l = BLOCK_FLUID_LEVEL[id];
  if (l === 0 || l >= 8) return 8 / 9;
  const max = FLUID_MAX_LEVEL[BLOCK_FLUID[id]];
  return (8 / 9) * (1 - l / (max + 1)) + 0.02;
}

/** Bloque base (el que se obtiene como objeto) de una variante orientada o encendida. */
export function baseBlock(id: number): number {
  return BLOCK_BASE[id] || id;
}

/** Orientación (0 N, 1 E, 2 S, 3 O) de un bloque orientado; -1 si no lo es. */
export function blockFacing(id: number): number {
  if (id >= FURNACE && id < FURNACE + 4) return id - FURNACE;
  if (id >= FURNACE_LIT && id < FURNACE_LIT + 4) return id - FURNACE_LIT;
  if (id >= CHEST && id < CHEST + 4) return id - CHEST;
  const b = familyBase(id);
  if (b === CHEST_DOUBLE || b === SMOKER || b === BLAST_FURNACE || b === STONECUTTER) return stateProps(id)!.facing;
  if (extraChest(b)) return stateProps(id)!.facing; // Fase 7 (redstone): cofre trampa
  return -1;
}

/** Bases que se colocan mirando al jugador. */
const ORIENTED = new Set([FURNACE, CHEST, FURNACE_LIT, CARVED_PUMPKIN, JACK_O_LANTERN, SMOKER, BLAST_FURNACE, STONECUTTER]);

/** Variante orientada de un bloque base para un yaw del jugador (el frente mira al jugador). */
export function orientedFor(base: number, yaw: number): number {
  if (!ORIENTED.has(base)) return base;
  // El jugador mira hacia (-sin yaw, -cos yaw); el frente del bloque apunta en sentido contrario.
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let f: number;
  if (Math.abs(fx) > Math.abs(fz)) f = fx > 0 ? 1 : 3;
  else f = fz > 0 ? 2 : 0;
  return base + f;
}

/** Tipo de horno: 0 horno, 1 ahumador (comida), 2 alto horno (minerales); -1 si no es un horno. */
export function furnaceVariant(id: number): number {
  if (id >= FURNACE && id < FURNACE_LIT + 4) return 0;
  const b = familyBase(id);
  return b === SMOKER ? 1 : b === BLAST_FURNACE ? 2 : -1;
}

export function isFurnace(id: number): boolean {
  return furnaceVariant(id) >= 0;
}

/** ¿Horno encendido? */
export function isLitFurnace(id: number): boolean {
  if (id >= FURNACE_LIT && id < FURNACE_LIT + 4) return true;
  const v = furnaceVariant(id);
  return v > 0 && stateProps(id)!.lit === 1;
}

/** El mismo horno (misma orientación) encendido o apagado. */
export function furnaceWithLit(id: number, lit: boolean): number {
  const f = Math.max(0, blockFacing(id));
  if (furnaceVariant(id) === 0) return (lit ? FURNACE_LIT : FURNACE) + f;
  return stateOf(familyBase(id), { facing: f, lit: lit ? 1 : 0 });
}

export function isChest(id: number): boolean {
  return (id >= CHEST && id < CHEST + 4) || familyBase(id) === CHEST_DOUBLE ||
    // Fase 6 (aldeanos): el barril guarda cosas como un cofre sencillo.
    defs[id]?.key === 'barrel' ||
    // Fase 8.6: las cajas de shulker, también (27 pilas).
    /shulker_box$/.test(defs[familyBase(id)]?.key ?? '') ||
    (id > 0 && !!extraChest(familyBase(id))); // Fase 7 (redstone): cofre trampa
}

/**
 * Fase 7 (redstone): cofres registrados después (el cofre trampa), con su estado base sencillo (con
 * `facing`) y doble (con `facing` y `side`, como CHEST_DOUBLE). Sólo se unen en dobles con los suyos.
 */
export const EXTRA_CHESTS: { single: number; double: number }[] = [];

function extraChest(base: number): { single: number; double: number } | undefined {
  for (const c of EXTRA_CHESTS) if (base === c.single || base === c.double) return c;
  return undefined;
}

/** Fase 7 (redstone): ¿mitad de un cofre doble (normal o trampa)? */
export function isDoubleChest(id: number): boolean {
  const b = familyBase(id);
  return id > 0 && (b === CHEST_DOUBLE || extraChest(b)?.double === b);
}

/** Fase 7 (redstone): el cofre sencillo (con la orientación dada) de la misma clase que `id`. */
export function singleChestOf(id: number, facing: number): number {
  const c = extraChest(familyBase(id));
  return c ? c.single + (facing & 3) : CHEST + (facing & 3);
}

export function isContainer(id: number): boolean {
  // Fase 7 (pociones): también el alambique alquímico (por su clave: se registra después de este módulo).
  // Fase 7 (mecanismos): y la tolva, el dispensador y el soltador.
  return isFurnace(id) || isChest(id) || CONTAINER_KEYS.has(defs[familyBase(id)]?.key ?? '');
}
const CONTAINER_KEYS = new Set(['brewing_stand', 'hopper', 'dispenser', 'dropper', 'ender_chest']); // Fase 8.6: el cofre de ender
