// Empuje entre el jugador y las criaturas (Entity.push de Java 26.3): cada tick que las cajas se solapan, las dos se
// separan en horizontal 0,05 bloques (menos si sus centros están a menos de un bloque: √d · 0,05). El servidor aparta a las
// criaturas del jugador y el cliente aparta al jugador de las criaturas (su posición la lleva él).
// No se empujan el shulker (Shulker.push vacío), el murciélago (Bat.isPushable), el dragón ni lo inerte (colmillos).
import { MOBS } from './mobs';
import { MOB_SHULKER, MOB_ENDER_DRAGON } from './endMobs';
import { MOB_BAT } from './critters';

/** Empuje máximo por tick (bloques). */
export const PUSH_STEP = 0.05;

/** ¿Empuja y se deja empujar esta criatura? */
export function isPushableMob(type: number): boolean {
  const def = MOBS[type];
  return !!def && !def.inert && type !== MOB_SHULKER && type !== MOB_BAT && type !== MOB_ENDER_DRAGON;
}

/**
 * Lo que se mueve en un tick la entidad de (bx, bz) al empujarla la de (ax, az) (Entity.push): [x, z] en bloques,
 * o null si están en el mismo sitio.
 */
export function pushStep(ax: number, az: number, bx: number, bz: number): [number, number] | null {
  let xa = bx - ax, za = bz - az;
  let dd = Math.max(Math.abs(xa), Math.abs(za));
  if (dd < 0.01) return null;
  dd = Math.sqrt(dd);
  xa /= dd;
  za /= dd;
  const pow = Math.min(1, 1 / dd);
  return [xa * pow * PUSH_STEP, za * pow * PUSH_STEP];
}

/** ¿Se solapan dos cajas centradas en (x, z) con su base en y? */
export function boxesOverlap(ax: number, ay: number, az: number, aw: number, ah: number, bx: number, by: number, bz: number, bw: number, bh: number): boolean {
  const hw = (aw + bw) / 2;
  return Math.abs(ax - bx) < hw && Math.abs(az - bz) < hw && ay < by + bh && ay + ah > by;
}
