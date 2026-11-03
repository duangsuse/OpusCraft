// Vuelo de las criaturas aladas (abejas y loros, fase 6): sin gravedad, van derechas a su destino,
// frenan al llegar y sortean los obstáculos subiendo. Sin caminos A*: vuelan por encima de todo.
import { BLOCK_SOLID, BLOCK_FLUID } from '../../blocks';
import { moveBody, type BlockGetter } from '../physics';
import { GRAVITY, TAU, lerpAngle, type Entity } from './types';

const solidAt = (w: BlockGetter, x: number, y: number, z: number): boolean => {
  const b = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return b < 0 || BLOCK_SOLID[b] === 1;
};

/** Primer bloque sólido o fluido bajo (x, y, z) mirando hasta `max` hacia abajo (su y), o y - max. */
export function groundBelow(w: BlockGetter, x: number, y: number, z: number, max = 24): number {
  const fx = Math.floor(x), fz = Math.floor(z);
  for (let k = 0; k <= max; k++) {
    const b = w.getBlock(fx, Math.floor(y) - k, fz);
    if (b < 0 || BLOCK_SOLID[b] === 1 || (b > 0 && BLOCK_FLUID[b])) return Math.floor(y) - k;
  }
  return Math.floor(y) - max;
}

/**
 * Vuela hacia (tx, ty, tz) a `speed` bloques/s y mueve el cuerpo. Devuelve la distancia que queda.
 * Si choca con una pared sube por encima; dentro del agua sale hacia arriba.
 */
export function flyToward(w: BlockGetter, e: Entity, tx: number, ty: number, tz: number, speed: number, dt: number): number {
  const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z;
  const d = Math.hypot(dx, dy, dz);
  const k = d < 1e-4 ? 0 : (Math.min(1, d / 1.2) * speed) / d;
  let vx = dx * k, vy = dy * k, vz = dz * k;
  // Mirar un poco por delante: si hay algo sólido, subir.
  const hd = Math.hypot(vx, vz);
  if (hd > 0.1) {
    const ax = e.x + (vx / hd) * (e.width / 2 + 0.4), az = e.z + (vz / hd) * (e.width / 2 + 0.4);
    if (solidAt(w, ax, e.y + 0.1, az) || solidAt(w, ax, e.y + e.height, az)) vy = Math.max(vy, speed * 0.9);
  }
  if (e.hitWall) vy = Math.max(vy, speed * 0.9);
  if (e.inWater || e.inLava) vy = Math.max(vy, 3);
  steer(e, vx, vy, vz, dt, 5);
  moveBody(e, w, dt);
  face(e, dt);
  return d;
}

/** Revolotear sin rumbo en el sitio (pequeñas oscilaciones). */
export function hover(w: BlockGetter, e: Entity, dt: number): void {
  const t = e.age * 2.3 + e.id;
  steer(e, Math.sin(t) * 0.25, Math.sin(t * 1.7) * 0.2, Math.cos(t * 0.9) * 0.25, dt, 3);
  moveBody(e, w, dt);
}

/** Caer suavemente (posado, o sin fuerzas para volar): gravedad y rozamiento. */
export function fallAndRest(w: BlockGetter, e: Entity, dt: number, maxFall = 6): void {
  e.vy = Math.max(-maxFall, e.vy - GRAVITY * dt);
  const f = Math.min(1, dt * (e.onGround ? 10 : 2));
  e.vx -= e.vx * f;
  e.vz -= e.vz * f;
  if (e.inWater) e.vy = Math.max(e.vy, 1.5);
  moveBody(e, w, dt);
}

function steer(e: Entity, vx: number, vy: number, vz: number, dt: number, acc: number): void {
  const a = Math.min(1, dt * acc);
  e.vx += (vx - e.vx) * a;
  e.vy += (vy - e.vy) * a;
  e.vz += (vz - e.vz) * a;
}

function face(e: Entity, dt: number): void {
  const h = Math.hypot(e.vx, e.vz);
  if (h > 0.15) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 7);
  e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 8);
  e.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(e.vy, Math.max(0.5, h)) * 0.5));
}

/** Punto al azar a entre `rMin` y `rMax` bloques en horizontal de (x, z), a `hMin`..`hMax` sobre el suelo. */
export function randomAirPoint(
  w: BlockGetter, rand: () => number, x: number, y: number, z: number, rMin: number, rMax: number, hMin: number, hMax: number,
): [number, number, number] {
  const a = rand() * TAU, r = rMin + rand() * (rMax - rMin);
  const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
  const g = groundBelow(w, px, y + 6, pz, 30);
  return [px, g + 1 + hMin + rand() * (hMax - hMin), pz];
}
