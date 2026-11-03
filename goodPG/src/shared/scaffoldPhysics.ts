// Fase 6.5 (decoración): moverse por los andamios como en Minecraft. Se puede estar de pie encima de
// cada andamio (salvo agachado, que es como se baja), dentro de una torre se sube saltando y se baja
// agachado, y los andamios no chocan de lado (se atraviesan).
import { isScaffolding } from './blocks';

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

/** Velocidad al trepar por dentro de un andamio y al bajar agachado (bloques/s). */
export const SCAFFOLD_CLIMB_SPEED = 2.4;
export const SCAFFOLD_DESCEND_SPEED = 2.2;

/** ¿Hay algún andamio en las celdas que ocupa la caja (centro de la base x, y, z; medio ancho hw; alto h)? */
export function inScaffolding(w: BlockReader, x: number, y: number, z: number, hw: number, h: number): boolean {
  for (let by = Math.floor(y + 0.05); by <= Math.floor(y + h - 0.05); by++) {
    for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw); bz++) {
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw); bx++) if (isScaffolding(w.getBlock(bx, by, bz))) return true;
    }
  }
  return false;
}

/**
 * Velocidad vertical dentro de un andamio: saltando se sube y agachado se baja; si no, null (la
 * gravedad y el suelo de cada andamio se encargan).
 */
export function scaffoldClimb(w: BlockReader, x: number, y: number, z: number, hw: number, h: number, jump: boolean, sneak: boolean): number | null {
  if (!jump && !sneak) return null;
  if (!inScaffolding(w, x, y, z, hw, h)) return null;
  return jump ? SCAFFOLD_CLIMB_SPEED : -SCAFFOLD_DESCEND_SPEED;
}

/**
 * Suelo de andamio: si los pies bajaron de oldY a newY cruzando la cara de arriba de un andamio (bajo
 * cualquier punto de la planta), devuelve la altura de esa cara; si no, null.
 */
export function scaffoldFloor(w: BlockReader, x: number, z: number, hw: number, oldY: number, newY: number): number | null {
  const top = Math.floor(oldY + 1e-6);
  if (newY >= top || oldY < top - 1e-6) return null;
  for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw); bz++) {
    for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw); bx++) if (isScaffolding(w.getBlock(bx, top - 1, bz))) return top;
  }
  return null;
}
