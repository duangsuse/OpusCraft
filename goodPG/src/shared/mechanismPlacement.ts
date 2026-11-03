// Fase 7 (mecanismos): cómo se orientan al colocarlos (lo usan placement.ts en el cliente, que lo predice,
// y el servidor, que lo aplica), como en Minecraft:
// - pistones, dispensadores y soltadores miran hacia el jugador (también hacia arriba o hacia abajo);
// - el observador, al revés: su cara vigila hacia donde mira el jugador y el punto rojo queda de su lado;
// - la tolva apunta al bloque en el que se hizo clic (hacia abajo si fue en su cara de arriba o de abajo).
import {
  PISTON, STICKY_PISTON, OBSERVER, HOPPER, DISPENSER, DROPPER, HOPPER_DOWN, familyBase, stateOf, facingState,
} from './blocks';
import type { Edit, PlaceHit } from './placement';

/** Cara (0 +X, 1 −X, 2 +Y, 3 −Y, 4 +Z, 5 −Z) más cercana a la dirección en la que mira el jugador. */
export function lookFace(yaw: number, pitch: number): number {
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(yaw) * cp;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  if (ay >= ax && ay >= az) return dy > 0 ? 2 : 3;
  if (ax >= az) return dx > 0 ? 0 : 1;
  return dz > 0 ? 4 : 5;
}

/**
 * Estado que pone un mecanismo orientable en (x, y, z) (la celda ya comprobada como reemplazable); undefined
 * si no es uno de ellos. `yaw` y `pitch`: hacia donde mira el jugador.
 */
export function planMechanism(hit: PlaceHit, base: number, x: number, y: number, z: number, yaw: number, pitch: number): Edit[] | undefined {
  const b = familyBase(base);
  const look = lookFace(yaw, pitch);
  if (b === PISTON || b === STICKY_PISTON || b === DISPENSER || b === DROPPER) return [[x, y, z, facingState(b, look ^ 1)]];
  if (b === OBSERVER) return [[x, y, z, facingState(b, look)]];
  if (b === HOPPER) {
    // Apunta dentro del bloque tocado; si se tocó por arriba o por abajo, hacia abajo.
    const facing = hit.ny !== 0 ? HOPPER_DOWN : 1 + (hit.nz > 0 ? 0 : hit.nx < 0 ? 1 : hit.nz < 0 ? 2 : 3);
    return [[x, y, z, stateOf(HOPPER, { facing })]];
  }
  return undefined;
}
