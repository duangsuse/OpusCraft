// Fase 8.6 (el End): los élitros, portados de LivingEntity y FireworkRocketEntity de la 26.3 (en bloques por tick,
// como allí; el cliente los aplica a 20 pasos por segundo).
// - Se abren al pulsar saltar en el aire (no en el suelo, montado, en un líquido, en una escalera de mano, con
//   Levitación o volando en creativo) si el pecho lleva unos élitros a los que les quede más de un uso.
// - Planeo (updateFallFlyingMovement): la gravedad se compensa según lo horizontal que se mire; al caer, la velocidad
//   vertical se pasa a la dirección de la mirada; al mirar arriba se cambia velocidad por altura; y la dirección de
//   avance tiende a la de la mirada. Rozamiento de 0,99 en horizontal y 0,98 en vertical.
// - Chocar de lado frena y hace daño (diferencia de velocidad × 10 − 3). La caída no se acumula mientras no se baje a
//   más de 0,5 bloques por tick.
// - Cada 20 ticks de vuelo se gastan 1; con un solo uso restante dejan de planear (no se rompen).
// - Un cohete usado planeando empuja hacia donde se mira mientras dura (10 ticks por nivel de vuelo + 0..11).
import { ITEMS, type ItemStack } from './items';

/** Usos de los élitros (Items.ELYTRA: durability 432). */
export const ELYTRA_DURABILITY = 432;
/** Cada cuántos ticks de vuelo se gasta un uso (updateFallFlying: cada 10, los pares). */
export const ELYTRA_WEAR_TICKS = 20;
/** Gravedad de una criatura (0,08) y con Caída lenta (0,01), en bloques por tick². */
export const GLIDE_GRAVITY = 0.08;
export const GLIDE_SLOW_FALL_GRAVITY = 0.01;
/** Caja al planear (Avatar: FALL_FLYING 0,6 × 0,6, ojos a 0,4). */
export const GLIDE_HEIGHT = 0.6;
export const GLIDE_EYE = 0.4;

export interface Vel {
  x: number;
  y: number;
  z: number;
}

/** ¿Son unos élitros con los que se puede planear (canGlideUsing: el siguiente uso no los rompería)? */
export function canGlideWith(s: ItemStack | null | undefined): boolean {
  if (!s || ITEMS[s.id]?.armor?.material !== 'elytra') return false;
  return (s.dmg ?? 0) + 1 < ELYTRA_DURABILITY;
}

/** Dirección de la mirada (unitaria). `yaw` y `pitch` como los del jugador (pitch positivo, hacia arriba). */
export function lookVector(yaw: number, pitch: number): [number, number, number] {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

/** Un tick de planeo (LivingEntity.updateFallFlyingMovement), en bloques por tick; cambia `v`. */
export function glideTick(v: Vel, yaw: number, pitch: number, gravity = GLIDE_GRAVITY): void {
  const [lx, ly, lz] = lookVector(yaw, pitch);
  // xRot de Java es positivo mirando abajo.
  const lean = -pitch;
  const lookHor = Math.sqrt(lx * lx + lz * lz);
  const moveHor = Math.sqrt(v.x * v.x + v.z * v.z);
  const lift = Math.cos(lean) ** 2;
  v.y += gravity * (-1 + lift * 0.75);
  if (v.y < 0 && lookHor > 0) {
    const convert = v.y * -0.1 * lift;
    v.x += (lx * convert) / lookHor;
    v.y += convert;
    v.z += (lz * convert) / lookHor;
  }
  if (lean < 0 && lookHor > 0) {
    const convert = moveHor * -Math.sin(lean) * 0.04;
    v.x += (-lx * convert) / lookHor;
    v.y += convert * 3.2;
    v.z += (-lz * convert) / lookHor;
  }
  if (lookHor > 0) {
    v.x += ((lx / lookHor) * moveHor - v.x) * 0.1;
    v.z += ((lz / lookHor) * moveHor - v.z) * 0.1;
  }
  v.x *= 0.99;
  v.y *= 0.98;
  v.z *= 0.99;
  void ly;
}

/** Un tick del empujón de un cohete (FireworkRocketEntity.tick con alguien planeando), en bloques por tick. */
export function rocketBoostTick(v: Vel, yaw: number, pitch: number): void {
  const [lx, ly, lz] = lookVector(yaw, pitch);
  v.x += lx * 0.1 + (lx * 1.5 - v.x) * 0.5;
  v.y += ly * 0.1 + (ly * 1.5 - v.y) * 0.5;
  v.z += lz * 0.1 + (lz * 1.5 - v.z) * 0.5;
}

/** Ticks que dura el cohete (1 + nivel de vuelo) × 10 + 0..5 + 0..6. */
export function rocketLifetime(flight: number, r: () => number): number {
  return 10 * (1 + flight) + Math.floor(r() * 6) + Math.floor(r() * 7);
}

/** Daño al chocar de lado planeando (handleFallFlyingCollisions), con las velocidades horizontales antes y después. */
export function wallHitDamage(before: number, after: number): number {
  return (before - after) * 10 - 3;
}
