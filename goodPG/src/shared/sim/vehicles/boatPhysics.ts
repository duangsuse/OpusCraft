// Fase 7 (transporte): física de las barcas, paso a paso (un tick = 1/20 s; velocidades en bloques por
// tick), como la de Minecraft: flota a media altura en el agua (y sube si se hunde), se frena por el agua,
// el aire o el suelo (sobre hielo apenas: por eso vuela, y más sobre hielo azul) y se rema con W/A/S/D
// (A y D giran; hacia delante acelera; hacia atrás, poco). La usan el servidor (barcas sin remero) y el
// cliente que rema (predicción), así que da lo mismo en los dos.
import {
  BLOCK_FLUID, BLOCK_FLUID_LEVEL, BLOCK_COLLIDE, ICE, PACKED_ICE, BLUE_ICE, SLIME_BLOCK, fluidHeight, blockCollisionBoxes,
  isBubbleColumn, bubbleColumnDown, // Fase 8.5
} from '../../blocks';
import { moveBox } from '../../collide';
import { BOAT_WIDTH, BOAT_HEIGHT } from '../../vehicles';
import type { BlockGetter } from '../physics';

/** En el agua, bajo el agua (quieta o corriente), en el suelo o en el aire. */
export const BOAT_IN_WATER = 0, BOAT_UNDER_WATER = 1, BOAT_UNDER_FLOWING = 2, BOAT_ON_LAND = 3, BOAT_IN_AIR = 4;

export interface BoatBody {
  x: number;
  y: number;
  z: number;
  /** Velocidad en bloques por tick. */
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  /** Giro por tick (radianes); se frena como la velocidad. */
  spin: number;
  status: number;
  /** Altura de la superficie del agua en la que flota. */
  waterLevel: number;
  onGround: boolean;
  /** Ticks seguidos bajo el agua (a los 60 echa a los pasajeros). */
  underTicks: number;
  /**
   * Fase 8.5: encima de una columna de burbujas la barca tiembla 60 ticks (`bubbleTime`) y luego sale despedida
   * hacia arriba o se hunde (`bubbleDown`); al hundirse echa a los pasajeros (`eject` se pone ese tick).
   */
  bubbleTime?: number;
  bubbleDown?: boolean;
  eject?: boolean;
}

export interface BoatInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

/** Remos que reman este tick: [izquierdo, derecho] (el izquierdo rema al girar a la derecha). */
export function paddlesOf(i: BoatInput | null): [boolean, boolean] {
  if (!i) return [false, false];
  return [(i.right && !i.left) || i.forward, (i.left && !i.right) || i.forward];
}

const TURN = Math.PI / 180;
const tmpBoxes: number[] = [];

/** Rozamiento de un bloque bajo la barca (Minecraft: hielo 0,98; hielo azul 0,989; slime 0,8; el resto 0,6). */
export function blockFriction(id: number): number {
  if (id === ICE || id === PACKED_ICE) return 0.98;
  if (id === BLUE_ICE) return 0.989;
  if (id === SLIME_BLOCK) return 0.8;
  return 0.6;
}

/** Altura del agua de una celda (1 si hay agua encima). */
function waterTop(w: BlockGetter, x: number, y: number, z: number): number {
  const id = w.getBlock(x, y, z);
  if (id <= 0 || BLOCK_FLUID[id] !== 1) return -1;
  const up = w.getBlock(x, y + 1, z);
  return y + (up > 0 && BLOCK_FLUID[up] === 1 ? 1 : fluidHeight(id));
}

interface Footprint {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function footprint(b: BoatBody): Footprint {
  const hw = BOAT_WIDTH / 2;
  return { x0: Math.floor(b.x - hw), x1: Math.ceil(b.x + hw), z0: Math.floor(b.z - hw), z1: Math.ceil(b.z + hw) };
}

/** Bajo el agua: el agua cubre la parte de arriba de la barca. */
function underwater(w: BlockGetter, b: BoatBody, f: Footprint): number {
  const top = b.y + BOAT_HEIGHT + 0.001;
  let found = false;
  for (let x = f.x0; x < f.x1; x++) {
    for (let y = Math.floor(b.y + BOAT_HEIGHT); y < Math.ceil(top); y++) {
      for (let z = f.z0; z < f.z1; z++) {
        const h = waterTop(w, x, y, z);
        if (h < 0 || top >= h) continue;
        const id = w.getBlock(x, y, z);
        if (BLOCK_FLUID_LEVEL[id] !== 0) return BOAT_UNDER_FLOWING;
        found = true;
      }
    }
  }
  return found ? BOAT_UNDER_WATER : -1;
}

/** Rozamiento medio de lo que hay justo debajo (0 si no hay nada: en el aire). */
function groundFriction(w: BlockGetter, b: BoatBody, f: Footprint): number {
  const y = Math.floor(b.y - 0.001);
  const floorY = b.y - 0.001 - y;
  let sum = 0, n = 0;
  for (let x = f.x0; x < f.x1; x++) {
    for (let z = f.z0; z < f.z1; z++) {
      const id = w.getBlock(x, y, z);
      if (id < 0) continue;
      const kind = BLOCK_COLLIDE[id];
      if (kind === 0) continue;
      if (kind === 2) {
        const boxes = blockCollisionBoxes(id, x, y, z, w, tmpBoxes);
        let touch = false;
        for (let i = 0; i < boxes.length; i += 6) if (boxes[i + 4] >= floorY) touch = true;
        if (!touch) continue;
      }
      sum += blockFriction(id);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Superficie del agua que hay por encima de la base de la barca (para posarla al caer al agua). */
function waterLevelAbove(w: BlockGetter, b: BoatBody, f: Footprint): number {
  let top = b.y;
  for (let y = Math.floor(b.y); y < Math.floor(b.y) + 16; y++) {
    let best = -1;
    for (let x = f.x0; x < f.x1; x++) for (let z = f.z0; z < f.z1; z++) best = Math.max(best, waterTop(w, x, y, z));
    if (best < 0) break;
    top = best;
    if (best < y + 1) break;
  }
  return top;
}

function statusOf(w: BlockGetter, b: BoatBody, f: Footprint): { status: number; friction: number } {
  const under = underwater(w, b, f);
  if (under >= 0) {
    b.waterLevel = b.y + BOAT_HEIGHT;
    return { status: under, friction: 0 };
  }
  // En el agua: la base está por debajo de la superficie.
  let level = -Infinity, wet = false;
  for (let x = f.x0; x < f.x1; x++) {
    for (let y = Math.floor(b.y); y < Math.ceil(b.y + 0.001); y++) {
      for (let z = f.z0; z < f.z1; z++) {
        const h = waterTop(w, x, y, z);
        if (h < 0) continue;
        level = Math.max(level, h);
        if (b.y < h) wet = true;
      }
    }
  }
  if (wet) {
    b.waterLevel = level;
    return { status: BOAT_IN_WATER, friction: 0 };
  }
  const friction = groundFriction(w, b, f);
  return friction > 0 ? { status: BOAT_ON_LAND, friction } : { status: BOAT_IN_AIR, friction: 0 };
}

/**
 * Fase 8.5: la barca encima de una columna de burbujas (Boat.onAboveBubbleColumn y tickBubbleColumn): a los 60
 * ticks, si la columna sube, sale despedida (2,7 bloques por tick con alguien que rema; 0,6 vacía); si baja, se
 * hunde (−0,7) y echa a los pasajeros.
 */
function bubbleColumnStep(b: BoatBody, w: BlockGetter, rowed: boolean): void {
  b.eject = false;
  const bx = Math.floor(b.x), by = Math.floor(b.y), bz = Math.floor(b.z);
  const col = w.getBlock(bx, by, bz);
  const above = isBubbleColumn(col) && w.getBlock(bx, by + 1, bz) === 0;
  if (!above) {
    b.bubbleTime = 0;
    return;
  }
  b.bubbleDown = bubbleColumnDown(col);
  if (!b.bubbleTime) b.bubbleTime = 60;
  b.bubbleTime--;
  if (b.bubbleTime > 0) return;
  if (b.bubbleDown) {
    b.vy -= 0.7;
    b.eject = true;
  } else b.vy = rowed ? 2.7 : 0.6;
}

/** Un tick de la barca. `input`: lo que pulsa quien rema (null: nadie rema). */
export function boatStep(b: BoatBody, w: BlockGetter, input: BoatInput | null = null): void {
  bubbleColumnStep(b, w, !!input);
  const f = footprint(b);
  const old = b.status;
  const st = statusOf(w, b, f);
  b.status = st.status;
  b.underTicks = b.status === BOAT_UNDER_WATER || b.status === BOAT_UNDER_FLOWING ? b.underTicks + 1 : 0;
  // Flotar y frenarse.
  let gravity = -0.04, lift = 0, friction = 0.05;
  if (old === BOAT_IN_AIR && b.status !== BOAT_IN_AIR && b.status !== BOAT_ON_LAND) {
    // Cae al agua: se posa en la superficie.
    b.waterLevel = waterLevelAbove(w, b, f);
    b.y = b.waterLevel - BOAT_HEIGHT + 0.101;
    b.vy = 0;
    b.status = BOAT_IN_WATER;
  } else {
    if (b.status === BOAT_IN_WATER) {
      lift = (b.waterLevel - b.y) / BOAT_HEIGHT;
      friction = 0.9;
    } else if (b.status === BOAT_UNDER_FLOWING) {
      gravity = -7e-4;
      friction = 0.9;
    } else if (b.status === BOAT_UNDER_WATER) {
      lift = 0.01;
      friction = 0.45;
    } else if (b.status === BOAT_IN_AIR) friction = 0.9;
    else friction = st.friction;
    b.vx *= friction;
    b.vz *= friction;
    b.vy += gravity;
    b.spin *= friction;
    if (lift > 0) b.vy = (b.vy + lift * 0.06153846016296973) * 0.75;
  }
  // Remar.
  if (input) {
    let push = 0;
    if (input.left) b.spin += TURN;
    if (input.right) b.spin -= TURN;
    if (input.right !== input.left && !input.forward && !input.back) push += 0.005;
    b.yaw += b.spin;
    if (input.forward) push += 0.04;
    if (input.back) push -= 0.005;
    b.vx += -Math.sin(b.yaw) * push;
    b.vz += -Math.cos(b.yaw) * push;
  } else b.yaw += b.spin;
  b.yaw = ((((b.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const r = moveBox(w, b.x, b.y, b.z, BOAT_WIDTH, BOAT_HEIGHT, b.vx, b.vy, b.vz, 0, b.onGround);
  b.x += r.dx;
  b.y += r.dy;
  b.z += r.dz;
  if (r.hitX) b.vx = 0;
  if (r.hitZ) b.vz = 0;
  if (r.hitY) b.vy = 0;
  b.onGround = r.onGround;
}

/** Empuje entre la barca y algo que la toca en (x, z) (criatura, jugador u otra barca): la aparta. */
export function pushBoat(b: BoatBody, x: number, z: number): void {
  let dx = x - b.x, dz = z - b.z;
  let d = Math.max(Math.abs(dx), Math.abs(dz));
  if (d < 0.01) return;
  d = Math.sqrt(d);
  dx /= d;
  dz /= d;
  const k = Math.min(1, 1 / d);
  b.vx -= dx * k * 0.05;
  b.vz -= dz * k * 0.05;
}
