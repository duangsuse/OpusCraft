// Fase 7 (transporte): física de las vagonetas, paso a paso (un tick = 1/20 s; velocidades en bloques
// por tick), como la de Minecraft: gravedad, seguir la vía (rectas, curvas y cuestas), la inercia y el
// rozamiento, el impulso de los propulsores (y su freno si están apagados), el empuje del jugador que va
// dentro cuando está casi parada y, fuera de la vía, rodar y frenar por el suelo. La usan el servidor y
// el cliente que la lleva (predicción), así que da lo mismo en los dos.
import {
  BLOCK_FLUID, BLOCK_OPAQUE, RAIL_SHAPE, RAIL_KIND, RAIL_POWERED, RAIL_NS, RAIL_EW, RAIL_ASC_E, RAIL_ASC_W, RAIL_ASC_N,
  RAIL_ASC_S, isRail, railIsPowered, uphillOf,
} from '../../blocks';
import { RAIL_EXITS } from '../../rails';
import { moveBox } from '../../collide';
import { CART_WIDTH, CART_HEIGHT } from '../../vehicles';
import type { BlockGetter } from '../physics';

export interface CartBody {
  x: number;
  y: number;
  z: number;
  /** Velocidad en bloques por tick. */
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** Mira al revés de hacia donde va (para que no dé media vuelta al cambiar de sentido). */
  flipped: boolean;
  onRails: boolean;
  onGround: boolean;
  inWater: boolean;
  /** Lleva pasajero (frena menos y avanza a 3/4). */
  occupied: boolean;
  /** Vagoneta con horno: combustible (ticks) y dirección del empuje. */
  furnace?: { fuel: number; px: number; pz: number };
}

/** Raíl sobre el que quedó la vagoneta en este paso ([x, y, z, bloque]) o null. */
export type CartRail = [number, number, number, number] | null;

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** Velocidad máxima de desplazamiento (bloques por tick): 8 m/s; la de horno, 4 (la mitad en el agua). */
export function cartMaxSpeed(c: CartBody): number {
  if (c.furnace) return (c.inWater ? 3 : 4) / 20;
  return (c.inWater ? 4 : 8) / 20;
}

/** Altura de la vía en (x, z) sobre el raíl de esa celda (o la de debajo), o null si no hay raíl. */
export function railHeight(w: BlockGetter, x: number, y: number, z: number): number | null {
  const ix = Math.floor(x), iz = Math.floor(z);
  let iy = Math.floor(y);
  if (isRail(w.getBlock(ix, iy - 1, iz))) iy--;
  const id = w.getBlock(ix, iy, iz);
  if (!isRail(id)) return null;
  const [a, b] = RAIL_EXITS[RAIL_SHAPE[id]];
  const ax = ix + 0.5 + a[0] * 0.5, ay = iy + 0.0625 + a[1] * 0.5, az = iz + 0.5 + a[2] * 0.5;
  const bx = ix + 0.5 + b[0] * 0.5, by = iy + 0.0625 + b[1] * 0.5, bz = iz + 0.5 + b[2] * 0.5;
  const ex = bx - ax, ey = (by - ay) * 2, ez = bz - az;
  const t = ex === 0 ? z - iz : ez === 0 ? x - ix : ((x - ax) * ex + (z - az) * ez) * 2;
  let ry = ay + ey * t;
  if (ey < 0) ry += 1;
  else if (ey > 0) ry += 0.5;
  return ry;
}

function move(c: CartBody, w: BlockGetter, dx: number, dy: number, dz: number): void {
  const r = moveBox(w, c.x, c.y, c.z, CART_WIDTH, CART_HEIGHT, dx, dy, dz, 0, c.onGround);
  c.x += r.dx;
  c.y += r.dy;
  c.z += r.dz;
  if (r.hitX) c.vx = 0;
  if (r.hitZ) c.vz = 0;
  if (r.hitY) c.vy = 0;
  c.onGround = r.onGround;
}

function inWaterAt(w: BlockGetter, c: CartBody): boolean {
  const hw = CART_WIDTH / 2;
  for (let x = Math.floor(c.x - hw); x <= Math.floor(c.x + hw - 1e-4); x++) {
    for (let z = Math.floor(c.z - hw); z <= Math.floor(c.z + hw - 1e-4); z++) {
      for (let y = Math.floor(c.y + 0.1); y <= Math.floor(c.y + CART_HEIGHT * 0.6); y++) {
        const id = w.getBlock(x, y, z);
        if (id > 0 && BLOCK_FLUID[id] === 1) return true;
      }
    }
  }
  return false;
}

function naturalSlowdown(c: CartBody): void {
  const f = c.furnace;
  if (f) {
    const d = Math.hypot(f.px, f.pz);
    if (d > 3e-4) {
      f.px /= d;
      f.pz /= d;
      c.vx = c.vx * 0.8 + f.px;
      c.vz = c.vz * 0.8 + f.pz;
    } else {
      c.vx *= 0.98;
      c.vz *= 0.98;
    }
  }
  const k = (c.occupied ? 0.997 : 0.96) * (c.inWater ? 0.95 : 1);
  c.vx *= k;
  c.vz *= k;
  c.vy = 0;
}

function alongTrack(c: CartBody, w: BlockGetter, px: number, py: number, pz: number, id: number, input: [number, number] | null): void {
  const before = railHeight(w, c.x, c.y, c.z);
  let y = py;
  const shape = RAIL_SHAPE[id];
  let powered = false, braking = false;
  if (RAIL_KIND[id] === RAIL_POWERED) {
    powered = railIsPowered(id);
    braking = !powered;
  }
  const slope = c.inWater ? 0.0078125 * 0.2 : 0.0078125;
  if (shape === RAIL_ASC_E) c.vx -= slope;
  else if (shape === RAIL_ASC_W) c.vx += slope;
  else if (shape === RAIL_ASC_N) c.vz += slope;
  else if (shape === RAIL_ASC_S) c.vz -= slope;
  if (shape >= RAIL_ASC_E && shape <= RAIL_ASC_S) y++;
  const [a, b] = RAIL_EXITS[shape];
  let ex = b[0] - a[0], ez = b[2] - a[2];
  const elen = Math.hypot(ex, ez);
  if (c.vx * ex + c.vz * ez < 0) {
    ex = -ex;
    ez = -ez;
  }
  const speed = Math.min(2, Math.hypot(c.vx, c.vz));
  c.vx = (speed * ex) / elen;
  c.vz = (speed * ez) / elen;
  // El pasajero empuja un poco una vagoneta casi parada (W/A/S/D hacia donde mira).
  if (input && c.occupied) {
    const p2 = input[0] * input[0] + input[1] * input[1];
    if (p2 > 1e-4 && c.vx * c.vx + c.vz * c.vz < 0.01) {
      c.vx += input[0] * 0.1;
      c.vz += input[1] * 0.1;
      braking = false;
    }
  }
  if (braking) {
    if (Math.hypot(c.vx, c.vz) < 0.03) c.vx = c.vy = c.vz = 0;
    else {
      c.vx *= 0.5;
      c.vz *= 0.5;
      c.vy = 0;
    }
  }
  // Se coloca sobre la línea de la vía.
  const ax = px + 0.5 + a[0] * 0.5, az = pz + 0.5 + a[2] * 0.5;
  const bx = px + 0.5 + b[0] * 0.5, bz = pz + 0.5 + b[2] * 0.5;
  const dx = bx - ax, dz = bz - az;
  const t = dx === 0 ? c.z - pz : dz === 0 ? c.x - px : ((c.x - ax) * dx + (c.z - az) * dz) * 2;
  c.x = ax + dx * t;
  c.z = az + dz * t;
  c.y = y;
  const mx = c.occupied ? 0.75 : 1;
  const max = cartMaxSpeed(c);
  move(c, w, clamp(mx * c.vx, -max, max), 0, clamp(mx * c.vz, -max, max));
  // Al salir por el extremo bajo de una cuesta, un bloque más abajo.
  const fx = Math.floor(c.x) - px, fz = Math.floor(c.z) - pz;
  if (a[1] !== 0 && fx === a[0] && fz === a[2]) c.y += a[1];
  else if (b[1] !== 0 && fx === b[0] && fz === b[2]) c.y += b[1];
  naturalSlowdown(c);
  // Lo que gana o pierde al bajar o subir (energía de la altura) y la altura exacta de la vía.
  const after = railHeight(w, c.x, c.y, c.z);
  if (after !== null && before !== null) {
    const dyE = (before - after) * 0.05;
    const h = Math.hypot(c.vx, c.vz);
    if (h > 0) {
      c.vx *= (h + dyE) / h;
      c.vz *= (h + dyE) / h;
    }
    c.y = after;
  }
  // Al pasar a otra celda (curvas), la velocidad apunta hacia ella.
  const nx = Math.floor(c.x), nz = Math.floor(c.z);
  if (nx !== px || nz !== pz) {
    const h = Math.hypot(c.vx, c.vz);
    c.vx = h * (nx - px);
    c.vz = h * (nz - pz);
  }
  if (c.furnace) {
    // La de horno empuja hacia donde va.
    const f = c.furnace;
    const h2 = c.vx * c.vx + c.vz * c.vz, p2 = f.px * f.px + f.pz * f.pz;
    if (p2 > 1e-4 && h2 > 0.001) {
      const h = Math.sqrt(h2), p = Math.sqrt(p2);
      f.px = (c.vx / h) * p;
      f.pz = (c.vz / h) * p;
    }
  }
  if (powered) {
    const h = Math.hypot(c.vx, c.vz);
    if (h > 0.01) {
      c.vx += (c.vx / h) * 0.06;
      c.vz += (c.vz / h) * 0.06;
    } else {
      // Parada en un propulsor encendido: sale hacia el lado contrario al bloque que tenga pegado.
      const solid = (x: number, z: number) => BLOCK_OPAQUE[Math.max(0, w.getBlock(x, py, z))] === 1;
      if (shape === RAIL_EW) {
        if (solid(px - 1, pz)) c.vx = 0.02;
        else if (solid(px + 1, pz)) c.vx = -0.02;
      } else if (shape === RAIL_NS) {
        if (solid(px, pz - 1)) c.vz = 0.02;
        else if (solid(px, pz + 1)) c.vz = -0.02;
      }
    }
  }
}

function offTrack(c: CartBody, w: BlockGetter): void {
  const max = cartMaxSpeed(c);
  c.vx = clamp(c.vx, -max, max);
  c.vz = clamp(c.vz, -max, max);
  if (c.onGround) {
    c.vx *= 0.5;
    c.vy *= 0.5;
    c.vz *= 0.5;
  }
  move(c, w, c.vx, c.vy, c.vz);
  if (!c.onGround) {
    c.vx *= 0.95;
    c.vy *= 0.95;
    c.vz *= 0.95;
  }
}

/**
 * Un tick de la vagoneta. `input`: empuje del pasajero ([x, z], hacia donde quiere ir, módulo ≤ 0,1) o
 * null. Devuelve el raíl en el que está (para el detector y el activador) o null.
 */
export function cartStep(c: CartBody, w: BlockGetter, input: [number, number] | null = null): CartRail {
  const ox = c.x, oz = c.z, oldYaw = c.yaw;
  c.inWater = inWaterAt(w, c);
  if (c.furnace) {
    if (c.furnace.fuel > 0) c.furnace.fuel--;
    if (c.furnace.fuel <= 0) c.furnace.px = c.furnace.pz = 0;
  }
  c.vy -= 0.04;
  const px = Math.floor(c.x), pz = Math.floor(c.z);
  let py = Math.floor(c.y);
  if (isRail(w.getBlock(px, py - 1, pz))) py--;
  const id = w.getBlock(px, py, pz);
  let rail: CartRail = null;
  if (isRail(id)) {
    c.onRails = true;
    alongTrack(c, w, px, py, pz, id, input);
    rail = [px, py, pz, id];
  } else {
    c.onRails = false;
    offTrack(c, w);
  }
  // Mira hacia donde va (sin dar media vuelta al cambiar de sentido).
  const mx = c.x - ox, mz = c.z - oz;
  if (mx * mx + mz * mz > 0.001) c.yaw = Math.atan2(-mx, -mz) + (c.flipped ? Math.PI : 0);
  if (Math.abs(wrap(c.yaw - oldYaw)) >= (170 * Math.PI) / 180) {
    c.yaw += Math.PI;
    c.flipped = !c.flipped;
  }
  c.yaw = wrap(c.yaw);
  // En las cuestas se inclina 45° (morro arriba si mira cuesta arriba).
  const up = rail ? uphillOf(RAIL_SHAPE[rail[3]]) : null;
  c.pitch = up ? (-Math.sin(c.yaw) * up[0] - Math.cos(c.yaw) * up[1] > 0 ? 1 : -1) * (Math.PI / 4) : 0;
  return rail;
}

/**
 * Choque entre dos vagonetas que se tocan (como en Minecraft): si van en la misma línea se reparten la
 * velocidad; la de horno empuja a las demás sin apenas frenar. Cambia las velocidades de las dos.
 */
export function cartsCollide(a: CartBody, b: CartBody): void {
  let dx = b.x - a.x, dz = b.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < 1e-4) return;
  const d = Math.sqrt(d2);
  dx /= d;
  dz /= d;
  const k = Math.min(1, 1 / d);
  dx *= k * 0.05;
  dz *= k * 0.05;
  // Sólo si la otra está más o menos en la dirección de ésta.
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  if (Math.abs(((b.x - a.x) * fx + (b.z - a.z) * fz) / d) < 0.8) return;
  if (b.furnace && !a.furnace) {
    a.vx = a.vx * 0.2 + b.vx - dx;
    a.vz = a.vz * 0.2 + b.vz - dz;
    b.vx *= 0.95;
    b.vz *= 0.95;
  } else if (a.furnace && !b.furnace) {
    b.vx = b.vx * 0.2 + a.vx + dx;
    b.vz = b.vz * 0.2 + a.vz + dz;
    a.vx *= 0.95;
    a.vz *= 0.95;
  } else {
    const mx = (a.vx + b.vx) / 2, mz = (a.vz + b.vz) / 2;
    a.vx = a.vx * 0.2 + mx - dx;
    a.vz = a.vz * 0.2 + mz - dz;
    b.vx = b.vx * 0.2 + mx + dx;
    b.vz = b.vz * 0.2 + mz + dz;
  }
}

/** Empuje de una criatura o un jugador en (x, z) que toca la vagoneta: la aparta de él. */
export function pushCart(c: CartBody, x: number, z: number): void {
  let dx = x - c.x, dz = z - c.z;
  const d2 = dx * dx + dz * dz;
  if (d2 < 1e-4) return;
  const d = Math.sqrt(d2);
  dx /= d;
  dz /= d;
  const k = Math.min(1, 1 / d);
  c.vx -= dx * k * 0.05;
  c.vz -= dz * k * 0.05;
}
