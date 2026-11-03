// Fase 7.5 (abismo): cómo se colocan los bloques del Deep Dark (compartido por el cliente, que lo predice,
// y el servidor): sensores y chilladores anegados si se ponen en el agua (los chilladores que pone un
// jugador no invocan al warden), el sensor calibrado con su entrada al otro lado del jugador, las venas
// pegadas a la cara en la que se hace clic (se suman a las que ya haya en la celda), la antorcha de alma en
// la pared o de pie y el farol de alma de pie o colgado.
import {
  SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER, SCULK_VEIN, SOUL_TORCH, SOUL_WALL_TORCH, SOUL_LANTERN, BLOCK_SOLID,
  VEIN_DIRS, isSculkVein, veinFaces, veinWith, veinCanStick, shriekerFor, stateOf, blockSupported, isChain, type NeighborGet,
} from './blocks';
import { isWaterCell } from './plantPlacement';

type Edit = [number, number, number, number];
type GetBlock = (x: number, y: number, z: number) => number;

/**
 * Lo que coloca `base` en (x, y, z) (la celda ya elegida, con `cur` dentro) o undefined si no es uno de estos
 * bloques. `n`: normal de la cara en la que se hizo clic; `facing`: hacia dónde mira el jugador.
 */
export function planDeepDark(
  get: GetBlock, base: number, x: number, y: number, z: number, cur: number, n: [number, number, number], facing: number,
): Edit[] | null | undefined {
  const one = (id: number): Edit[] => [[x, y, z, id]];
  const wet = isWaterCell(cur) ? 1 : 0;
  const rel: NeighborGet = (dx, dy, dz) => get(x + dx, y + dy, z + dz);
  switch (base) {
    case SCULK_SENSOR:
      return one(stateOf(SCULK_SENSOR, { phase: 0, water: wet }));
    case CALIBRATED_SCULK_SENSOR:
      return one(stateOf(CALIBRATED_SCULK_SENSOR, { facing, phase: 0, water: wet }));
    case SCULK_SHRIEKER:
      return one(shriekerFor(false, wet === 1));
    case SCULK_VEIN: {
      // Cara que da al bloque en el que se hizo clic.
      const f = VEIN_DIRS.findIndex(([dx, dy, dz]) => dx === -n[0] && dy === -n[1] && dz === -n[2]);
      if (f < 0 || wet) return null;
      const [dx, dy, dz] = VEIN_DIRS[f];
      if (!veinCanStick(get(x + dx, y + dy, z + dz))) return null;
      const mask = isSculkVein(cur) ? veinFaces(cur) : 0;
      return mask & (1 << f) ? null : one(veinWith(mask | (1 << f)));
    }
    case SOUL_TORCH: {
      if (n[1] < 0) return null;
      if (n[1] === 0) {
        const id = stateOf(SOUL_WALL_TORCH, { facing: n[2] < 0 ? 0 : n[0] > 0 ? 1 : n[2] > 0 ? 2 : 3 });
        if (blockSupported(id, rel)) return one(id);
      }
      const below = get(x, y - 1, z);
      return below < 0 || BLOCK_SOLID[below] === 1 ? one(SOUL_TORCH) : null;
    }
    case SOUL_LANTERN: {
      const holds = (b: number) => b < 0 || BLOCK_SOLID[b] === 1 || isChain(b);
      const above = holds(get(x, y + 1, z)), below = holds(get(x, y - 1, z));
      const hanging = stateOf(SOUL_LANTERN, { hanging: 1 });
      if (n[1] < 0) return above ? one(hanging) : below ? one(SOUL_LANTERN) : null;
      return below ? one(SOUL_LANTERN) : above ? one(hanging) : null;
    }
  }
  return undefined;
}
