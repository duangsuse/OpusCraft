// Fase 8.2 (biomas del Nether): colocar enredaderas del Nether y saber dónde sirve el polvo de hueso (lo usan
// el cliente, que lo predice, y el servidor, que lo aplica).
// - Enredadera llorona o retorcida (GrowingPlantBlock.getStateForPlacement): si delante (debajo la llorona,
//   encima la retorcida) ya hay una de su tipo, se pone su tallo; si no, una punta con una edad al azar.
// - Polvo de hueso: el necelio con aire encima, la rocanegra junto al necelio que deja pasar la luz por
//   arriba, los hongos sobre su necelio y las enredaderas con aire delante de su punta.
import { hash3 } from './constants';
import {
  AIR, NETHERRACK, BLOCK_LIGHT_OPACITY, blockSupported, isNylium, isNetherFungus, fungusNylium, netherVineOf, vineAge, vineHead,
  VINE_MAX_AGE, type NeighborGet,
} from './blocks';
import type { Edit, GetBlock } from './placement';

/** Colocación de una enredadera del Nether en (x, y, z), null si no se sostiene o undefined si no es una. */
export function planNetherVine(get: GetBlock, base: number, x: number, y: number, z: number): Edit[] | null | undefined {
  const v = netherVineOf(base);
  if (!v || base !== v[0]) return undefined;
  const [head, body, dir] = v;
  const id = netherVineOf(get(x, y + dir, z))?.[0] === head ? body : vineHead(head, hash3(x, y, z, 0x7e1) % VINE_MAX_AGE);
  const rel: NeighborGet = (dx, dy, dz) => get(x + dx, y + dy, z + dz);
  return blockSupported(id, rel) ? [[x, y, z, id]] : null;
}

/** ¿Tendría efecto el polvo de hueso en esta planta o este suelo del Nether? */
export function canFertilizeNether(get: GetBlock, x: number, y: number, z: number): boolean {
  const id = get(x, y, z);
  if (isNylium(id)) return get(x, y + 1, z) === AIR;
  if (id === NETHERRACK) {
    const up = get(x, y + 1, z);
    if (!(up === AIR || (up > 0 && BLOCK_LIGHT_OPACITY[up] === 0))) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (isNylium(get(x + dx, y + dy, z + dz))) return true;
    return false;
  }
  if (isNetherFungus(id)) return get(x, y - 1, z) === fungusNylium(id);
  const v = netherVineOf(id);
  if (v) {
    const [head, , dir] = v;
    let hy = y;
    while (netherVineOf(get(x, hy + dir, z))?.[0] === head) hy += dir;
    return vineAge(get(x, hy, z)) >= 0 && get(x, hy + dir, z) === AIR;
  }
  return false;
}
