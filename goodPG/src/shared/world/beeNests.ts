// Nidos de abejas al generar el terreno (fase 6): cuelgan del tronco, justo por debajo de la copa,
// en algunos robles y abedules de las llanuras (pocos) y de las praderas (casi todos), con la
// entrada mirando hacia fuera. La decisión es determinista (semilla y posición del árbol), así que
// todos los chunks que tocan el árbol la toman igual.
import { BEE_NEST, stateOf } from '../blocks';
import { hash2, hashToFloat } from '../constants';
import { DIR_X, DIR_Z } from '../blockModels';
import { BIOME_PLAINS, BIOME_MEADOW, BIOME_SUNFLOWER_PLAINS, BIOME_FLOWER_FOREST } from './biomeIds';

type SetBlock = (x: number, y: number, z: number, id: number, force: boolean) => void;

/** Probabilidad de nido por árbol. */
const NEST_CHANCE: Readonly<Record<number, number>> = {
  [BIOME_PLAINS]: 0.1, [BIOME_MEADOW]: 0.8, [BIOME_SUNFLOWER_PLAINS]: 0.1, [BIOME_FLOWER_FOREST]: 0.1, // Fase 7.6
};

/**
 * Pone (o no) un nido en el árbol recién plantado en (x, y, z) (y = primer bloque del tronco); `tr`
 * es el valor que eligió el tipo de árbol en terrain.ts. Sólo robles y abedules normales.
 */
export function placeBeeNest(seed: number, biome: number, x: number, y: number, z: number, tr: number, set: SetBlock): void {
  const chance = NEST_CHANCE[biome];
  if (chance === undefined) return;
  // Llanura: los robles grandes (tr > 0.8) no llevan nido. Pradera: roble (tr < 0.6) o abedul.
  if ((biome === BIOME_PLAINS || biome === BIOME_SUNFLOWER_PLAINS) && tr > 0.8) return;
  // Fase 7.6: en el bosque de flores, los abedules son los de tr < 0.25 (ver terrain.ts).
  const birch = (biome === BIOME_MEADOW && tr >= 0.6) || (biome === BIOME_FLOWER_FOREST && tr < 0.25);
  if (hashToFloat(hash2(x, z, seed ^ 0xbee5)) >= chance) return;
  // Misma altura de tronco que TerrainGenerator.oak().
  const h = 4 + (Math.floor(tr * 1000) % 3) + (birch ? 1 : 0);
  const top = y + h - 1;
  const d = hash2(x, z, seed ^ 0xbee6) & 3;
  // Bajo la copa (que empieza en top - 2); en los troncos más bajos, dentro de la primera capa de hojas.
  const ny = h >= 5 ? top - 3 : top - 2;
  set(x + DIR_X[d], ny, z + DIR_Z[d], stateOf(BEE_NEST, { facing: d }), true);
}
