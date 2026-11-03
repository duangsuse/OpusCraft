// Agua del generador: como es quieta, nunca debe quedar al lado ni encima de un hueco (se vería una
// pared o un techo de agua colgando en el aire), tampoco entre dos chunks ni donde pasa una mina
// abandonada (isInInvalidLocation de Java: un tramo que toca un líquido no se pone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { AIR, BLOCK_FLUID } from '../src/shared/blocks';
import { MIN_Y, MAX_Y, blockIndex } from '../src/shared/constants';

test('agua generada: sin paredes ni techos de agua sobre el aire', () => {
  // Las dos últimas zonas tienen minas que antes cruzaban acuíferos (una en una cueva frondosa).
  for (const [seed, cx0, cz0] of [[12345, -14, -14], [777, 0, 0], [12345, 0, 3], [12345, 16, 24]] as const) {
    const gen = new TerrainGenerator(seed);
    const N = 6;
    const chunks = new Map<string, Uint16Array>();
    for (let dz = 0; dz < N; dz++) for (let dx = 0; dx < N; dx++) chunks.set(`${dx},${dz}`, gen.generate(cx0 + dx, cz0 + dz).blocks);
    const at = (x: number, y: number, z: number): number => {
      const c = chunks.get(`${x >> 4},${z >> 4}`);
      return c ? c[blockIndex(x & 15, y, z & 15)] : -1;
    };
    const water = (id: number) => id > 0 && BLOCK_FLUID[id] === 1;
    let exposed = 0, cells = 0;
    const where: string[] = [];
    for (let x = 0; x < N * 16; x++) {
      for (let z = 0; z < N * 16; z++) {
        for (let y = MIN_Y + 1; y < MAX_Y; y++) {
          if (at(x, y, z) !== AIR) continue;
          cells++;
          if (water(at(x, y + 1, z)) || water(at(x + 1, y, z)) || water(at(x - 1, y, z)) || water(at(x, y, z + 1)) || water(at(x, y, z - 1))) {
            exposed++;
            if (where.length < 5) where.push(`${x + cx0 * 16},${y},${z + cz0 * 16}`);
          }
        }
      }
    }
    assert.ok(cells > 1000);
    assert.equal(exposed, 0, `semilla ${seed}: aire junto al agua en ${where.join(' ')}`);
  }
});
