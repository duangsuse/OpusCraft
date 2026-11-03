// Fase 6.5 (materiales): física de los bloques nuevos, compartida por el jugador (cliente) y las
// criaturas (servidor). El hielo resbala (el compacto igual que el normal y el azul aún más), el bloque
// de slime devuelve el golpe a quien cae encima (sin daño; agachado no rebota) y frena al andar por él,
// y la nieve polvo no sostiene: quien entra se hunde despacio y casi no avanza; con botas de cuero se
// camina por encima y dentro se sube saltando (como por una escalera de mano).
import { ICE, PACKED_ICE, BLUE_ICE, SLIME_BLOCK, POWDER_SNOW } from './blocks';
import { isFrostedIce } from './blocks'; // Fase 7 (encantamientos)
import { SOUL_SAND } from './blocks'; // Fase 7.5 (abismo)

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

/** Bloque sobre el que se apoya una caja con la base en (x, y, z). */
export function blockUnder(w: BlockReader, x: number, y: number, z: number): number {
  return w.getBlock(Math.floor(x), Math.floor(y - 0.05), Math.floor(z));
}

/**
 * Agarre del suelo: multiplica lo rápido que la velocidad se ajusta a la deseada al andar (1 = normal).
 * Cuanto menor, más se desliza (en Minecraft: hielo 0,98 de deslizamiento, hielo azul 0,989, slime 0,8).
 */
export function groundGrip(id: number): number {
  if (id === ICE || id === PACKED_ICE || isFrostedIce(id)) return 0.15; // Fase 7: el hielo escarchado también resbala
  if (id === BLUE_ICE) return 0.06;
  if (id === SLIME_BLOCK) return 0.5;
  return 1;
}

/** Velocidad al andar por encima (el slime y, Fase 7.5, la arena de alma frenan como en Minecraft: al 40 %). */
export function groundSpeed(id: number): number {
  return id === SLIME_BLOCK || id === SOUL_SAND ? 0.4 : 1;
}

/** Por debajo de esta velocidad de caída (bloques/s) el slime ya no hace rebotar. */
export const SLIME_MIN_BOUNCE = 3;
/** Parte de la velocidad que devuelve el rebote (el resto se pierde, así los botes se apagan). */
export const SLIME_BOUNCE = 0.8;

/**
 * Rebote al caer sobre `under` con velocidad vertical `vy` (negativa): la nueva velocidad hacia arriba,
 * o null si no rebota (no es slime, cae despacio o va agachado).
 */
export function slimeBounce(under: number, vy: number, sneaking: boolean): number | null {
  if (under !== SLIME_BLOCK || sneaking || vy > -SLIME_MIN_BOUNCE) return null;
  return -vy * SLIME_BOUNCE;
}

/** ¿Toca nieve polvo alguna celda de la caja (base en x, y, z; medio ancho hw; alto h)? */
export function inPowderSnow(w: BlockReader, x: number, y: number, z: number, hw: number, h: number): boolean {
  for (let by = Math.floor(y + 0.05); by <= Math.floor(y + h - 0.05); by++) {
    for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-4); bz++) {
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-4); bx++) if (w.getBlock(bx, by, bz) === POWDER_SNOW) return true;
    }
  }
  return false;
}

/** Hundimiento en la nieve polvo: velocidad máxima de caída (bloques/s) y lo que se avanza en horizontal. */
export const POWDER_SINK_SPEED = 1.6;
export const POWDER_WALK_FACTOR = 0.35;
/** Con botas de cuero, dentro de la nieve polvo se sube saltando a esta velocidad (bloques/s). */
export const POWDER_CLIMB_SPEED = 2.4;

/**
 * Suelo de nieve polvo para quien lleva botas de cuero (y no va agachado): si los pies bajaron de oldY
 * a newY cruzando la cara de arriba de una nieve polvo bajo la planta, la altura de esa cara; si no, null.
 */
export function powderSnowFloor(w: BlockReader, x: number, z: number, hw: number, oldY: number, newY: number): number | null {
  const top = Math.floor(oldY + 1e-6);
  if (newY >= top || oldY < top - 1e-6) return null;
  for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-4); bz++) {
    for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-4); bx++) if (w.getBlock(bx, top - 1, bz) === POWDER_SNOW) return top;
  }
  return null;
}

// ------------------------------------------------------------------ congelación

/** Ticks (a 20 por segundo) dentro de la nieve polvo hasta quedar congelado del todo (7 s). */
export const FREEZE_TICKS = 140;
/** Congelado del todo: 1 de daño cada 2 s. */
export const FREEZE_DAMAGE_EVERY = 2;

/**
 * Avanza el contador de congelación (en ticks) `dt` segundos: sube 1 por tick dentro de la nieve polvo
 * (si no se es inmune) y baja 2 por tick fuera. Devuelve el valor nuevo (0..FREEZE_TICKS).
 */
export function stepFreeze(ticks: number, dt: number, inside: boolean, immune: boolean): number {
  const d = dt * 20;
  const next = inside && !immune ? ticks + d : ticks - 2 * d;
  return Math.max(0, Math.min(FREEZE_TICKS, next));
}
