// Fase 7 (mecanismos): qué mueve un pistón, como en Minecraft (PistonStructureResolver).
// - Cada bloque reacciona al empuje de una forma: se mueve, se rompe (y suelta su objeto: plantas,
//   antorchas, polvo, puertas, camas, calabazas…), no se mueve (obsidiana, lecho de roca, yunques, pistones
//   extendidos y todo lo que guarda algo: cofres, hornos, tolvas, carteles, atriles…) o sólo se empuja
//   (terracota esmaltada: ni se arrastra ni se pega).
// - El bloque de slime y el de miel arrastran a los que tocan (salvo el uno al otro).
// - Como mucho 12 bloques; si alguno no se puede mover, el pistón no se mueve.
// Es puro (sobre una función que da los bloques): lo usan el servidor y las pruebas.
import { isShulkerBox } from './blocks'; // Fase 8.6
import {
  defs, familyBase, BLOCK_COUNT, BLOCK_SOLID, BLOCK_RENDER, BLOCK_FLUID, BLOCK_REPLACEABLE, BLOCK_HARDNESS, R_CROSS, R_TORCH,
  OBSIDIAN, CRYING_OBSIDIAN, SLIME_BLOCK, HONEY_BLOCK, GRINDSTONE, ENCHANTING_TABLE, LECTERN, LECTERN_BOOK, CAMPFIRE, SOUL_CAMPFIRE,
  MOB_SPAWNER, CONDUIT, DAYLIGHT_DETECTOR, CHISELED_BOOKSHELF, isAnvil, isContainer, isSign, isBanner, isBeeHome, isJukebox,
  isDoor, isBed, isCake, isCrop, isGlazedTerracotta, isPiston, pistonExtended, isPistonHead, isMovingBlock,
} from './blocks';
import { FACE_X, FACE_Y, FACE_Z, JAVA_DIRECTIONS } from './redstone/api';
import { MIN_Y, MAX_Y } from './constants';
import { posKey } from './sim/posKey';

/** Cómo reacciona un bloque al empuje: 0 se mueve, 1 se rompe, 2 no se mueve, 3 sólo se empuja. */
export const PUSH_NORMAL = 0, PUSH_DESTROY = 1, PUSH_BLOCK = 2, PUSH_ONLY = 3;

/** Bloques que se rompen al empujarlos, por su clave (además de plantas, antorchas y lo que no choca). */
const DESTROY_KEYS = /(^|_)(leaves|pressure_plate|button|lever|repeater|comparator|tripwire|tripwire_hook|redstone_wire|ladder|vine|lily_pad|sugar_cane|cactus|cocoa|cobweb|scaffolding|lantern|bell|decorated_pot|pointed_dripstone|turtle_egg|frogspawn|sea_pickle|pumpkin|melon|jack_o_lantern|moss_block|amethyst_cluster|amethyst_bud|candle|skull|head|dripleaf|snow)$/;
/** Bloques que no se mueven, por su clave (guardan algo en el servidor o son muy duros). */
const BLOCK_KEYS = /(sign|banner|respawn_anchor|lodestone|reinforced_deepslate)$/;

let TABLE: Uint8Array | null = null;

function classify(id: number): number {
  const d = defs[id];
  if (!d) return PUSH_BLOCK;
  const base = familyBase(id);
  const key = defs[base]?.key ?? d.key;
  // Inamovibles: durísimos, los que guardan algo y las piezas de los pistones.
  if (BLOCK_HARDNESS[id] < 0 || base === OBSIDIAN || base === CRYING_OBSIDIAN || isAnvil(id) || base === GRINDSTONE) return PUSH_BLOCK;
  if (base === ENCHANTING_TABLE || base === LECTERN || base === LECTERN_BOOK || base === CAMPFIRE || base === SOUL_CAMPFIRE || base === MOB_SPAWNER) return PUSH_BLOCK;
  // Fase 8.6: la caja de shulker se rompe (y cae con lo que lleva dentro), como en Java.
  if (isShulkerBox(id)) return PUSH_DESTROY;
  if (base === CONDUIT || base === DAYLIGHT_DETECTOR || base === CHISELED_BOOKSHELF || isContainer(id) || isBeeHome(id)) return PUSH_BLOCK;
  if (isJukebox(id) || isSign(id) || isBanner(id) || isPistonHead(id) || isMovingBlock(id) || BLOCK_KEYS.test(key)) return PUSH_BLOCK;
  // Se rompen: lo que no choca, plantas, antorchas, puertas, camas, tartas, cultivos y los de la lista.
  if (BLOCK_FLUID[id] || BLOCK_REPLACEABLE[id] || !BLOCK_SOLID[id] || BLOCK_RENDER[id] === R_CROSS || BLOCK_RENDER[id] === R_TORCH) return PUSH_DESTROY;
  if (isDoor(id) || isBed(id) || isCake(id) || isCrop(id) || DESTROY_KEYS.test(key)) return PUSH_DESTROY;
  if (isGlazedTerracotta(id)) return PUSH_ONLY;
  return PUSH_NORMAL;
}

/** Reacción al empuje de un bloque (los pistones extendidos, aparte: ver isPushable). */
export function pushReaction(id: number): number {
  if (!TABLE) {
    TABLE = new Uint8Array(BLOCK_COUNT);
    for (let i = 1; i < BLOCK_COUNT; i++) TABLE[i] = classify(i);
  }
  return id > 0 && id < BLOCK_COUNT ? TABLE[id] : PUSH_BLOCK;
}

/** ¿Pega a los que toca? (slime y miel). */
export function isSticky(id: number): boolean {
  return id === SLIME_BLOCK || id === HONEY_BLOCK;
}

/** ¿Se pegan dos bloques vecinos? (la miel no se pega al slime). */
export function canStick(a: number, b: number): boolean {
  if ((a === HONEY_BLOCK && b === SLIME_BLOCK) || (a === SLIME_BLOCK && b === HONEY_BLOCK)) return false;
  return isSticky(a) || isSticky(b);
}

/**
 * ¿Se puede mover el bloque `id` de la altura `y` en la dirección `dir`? `allowDestroy`: los que se rompen
 * cuentan como movibles; `lineDir`: dirección de la fila que se está mirando (la terracota esmaltada sólo
 * se mueve si es la del empuje).
 */
export function isPushable(id: number, y: number, dir: number, allowDestroy: boolean, lineDir: number): boolean {
  if (id < 0) return false;
  if (id === 0) return true;
  if ((dir === 3 && y <= MIN_Y) || (dir === 2 && y >= MAX_Y - 1)) return false;
  if (isPiston(id)) return !pistonExtended(id);
  switch (pushReaction(id)) {
    case PUSH_BLOCK: return false;
    case PUSH_DESTROY: return allowDestroy;
    case PUSH_ONLY: return dir === lineDir;
  }
  return true;
}

export interface Cell {
  x: number;
  y: number;
  z: number;
}

/** Lo que mueve un pistón: los bloques que empuja (en orden) y los que rompe. */
export interface PushPlan {
  /** Dirección del movimiento (cara). */
  dir: number;
  toPush: Cell[];
  toDestroy: Cell[];
}

/** Máximo de bloques que mueve un pistón. */
export const MAX_PUSH = 12;

/**
 * Qué mueve el pistón de (px, py, pz) que mira hacia `facing` al extenderse (o, adhesivo, al recogerse);
 * null si no puede. `get` da el bloque de una celda (−1 sin cargar).
 */
export function resolvePush(
  get: (x: number, y: number, z: number) => number, px: number, py: number, pz: number, facing: number, extending: boolean,
): PushPlan | null {
  const dir = extending ? facing : facing ^ 1;
  const k = extending ? 1 : 2;
  const toPush: Cell[] = [], toDestroy: Cell[] = [];
  const keys: number[] = [];
  const pistonKey = posKey(px, py, pz);
  const at = (c: Cell, d: number, n: number): Cell => ({ x: c.x + FACE_X[d] * n, y: c.y + FACE_Y[d] * n, z: c.z + FACE_Z[d] * n });
  // Al recogerse, la cabeza ya no está (se quita antes de mover nada).
  const headKey = extending ? -1 : posKey(px + FACE_X[facing], py + FACE_Y[facing], pz + FACE_Z[facing]);
  const idOf = (c: Cell) => (keyOf(c) === headKey ? 0 : get(c.x, c.y, c.z));
  const keyOf = (c: Cell) => posKey(c.x, c.y, c.z);
  const start: Cell = { x: px + FACE_X[facing] * k, y: py + FACE_Y[facing] * k, z: pz + FACE_Z[facing] * k };
  const startId = idOf(start);
  if (!isPushable(startId, start.y, dir, false, facing)) {
    if (extending && startId > 0 && pushReaction(startId) === PUSH_DESTROY && !isPiston(startId)) {
      toDestroy.push(start);
      return { dir, toPush, toDestroy };
    }
    return null;
  }

  /** Coloca las `i` últimas (las que se acaban de añadir) delante de la posición `j` (reorderListAtCollision). */
  const reorder = (i: number, j: number) => {
    const n = toPush.length;
    const a = toPush.slice(0, j), b = toPush.slice(n - i), c = toPush.slice(j, n - i);
    toPush.length = 0;
    toPush.push(...a, ...b, ...c);
    keys.length = 0;
    for (const p of toPush) keys.push(keyOf(p));
  };

  const addLine = (from: Cell, lineDir: number): boolean => {
    let id = idOf(from);
    if (id === 0) return true;
    if (!isPushable(id, from.y, dir, false, lineDir)) return true;
    const fk = keyOf(from);
    if (fk === pistonKey || keys.includes(fk)) return true;
    let count = 1;
    if (count + toPush.length > MAX_PUSH) return false;
    // Hacia atrás, mientras lo que hay detrás se pegue (lo arrastra el bloque pegajoso).
    while (isSticky(id)) {
      const back = at(from, dir ^ 1, count);
      const prev = id;
      id = idOf(back);
      if (id === 0 || !canStick(prev, id) || !isPushable(id, back.y, dir, false, lineDir ^ 1) || keyOf(back) === pistonKey) break;
      count++;
      if (count + toPush.length > MAX_PUSH) return false;
    }
    let pulled = 0;
    for (let n = count - 1; n >= 0; n--) {
      const c = at(from, dir ^ 1, n);
      toPush.push(c);
      keys.push(keyOf(c));
      pulled++;
    }
    // Hacia delante: lo que va empujando.
    for (let j = 1; ; j++) {
      const c = at(from, dir, j);
      const idx = keys.indexOf(keyOf(c));
      if (idx > -1) {
        reorder(pulled, idx);
        for (let l = 0; l <= idx + pulled && l < toPush.length; l++) {
          if (isSticky(idOf(toPush[l])) && !addBranches(toPush[l])) return false;
        }
        return true;
      }
      const cid = idOf(c);
      if (cid === 0) return true;
      if (!isPushable(cid, c.y, dir, true, dir) || keyOf(c) === pistonKey) return false;
      if (pushReaction(cid) === PUSH_DESTROY && !isPiston(cid)) {
        toDestroy.push(c);
        return true;
      }
      if (toPush.length >= MAX_PUSH) return false;
      toPush.push(c);
      keys.push(keyOf(c));
      pulled++;
    }
  };

  /** Los vecinos de lado de un bloque pegajoso que se pegan a él también se mueven (en el orden de Direction.values()). */
  const addBranches = (c: Cell): boolean => {
    const id = idOf(c);
    for (const d of JAVA_DIRECTIONS) {
      if (d >> 1 === dir >> 1) continue;
      const n = at(c, d, 1);
      if (canStick(idOf(n), id) && !addLine(n, d)) return false;
    }
    return true;
  };

  if (!addLine(start, dir)) return null;
  for (let i = 0; i < toPush.length; i++) {
    if (isSticky(idOf(toPush[i])) && !addBranches(toPush[i])) return null;
  }
  return { dir, toPush, toDestroy };
}
