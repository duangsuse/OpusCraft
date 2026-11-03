// Fase 7.6: los biomas del mundo normal que faltaban. Que todos salgan, que hereden lo general de su
// bioma base y que cada uno se genere con lo suyo (superficie, árboles y plantas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STONE, GRAVEL, SAND, WATER, PACKED_ICE, CALCITE, SNOW_LAYER, PODZOL, COARSE_DIRT, SPRUCE_LOG, OAK_LOG,
  BIRCH_LOG, BAMBOO, MUD, MANGROVE_ROOTS, MANGROVE_LOG, SUNFLOWER, TERRACOTTA, COLORED_TERRACOTTA, FLOWERS,
} from '../src/shared/blocks';
import { TerrainGenerator, BIOME_NAMES } from '../src/shared/world/terrain';
import {
  BIOME_RIVER, BIOME_FROZEN_RIVER, BIOME_SNOWY_BEACH, BIOME_STONY_SHORE, BIOME_LUKEWARM_OCEAN, BIOME_DEEP_COLD_OCEAN,
  BIOME_SUNFLOWER_PLAINS, BIOME_FLOWER_FOREST, BIOME_OLD_GROWTH_BIRCH_FOREST, BIOME_WINDSWEPT_GRAVELLY_HILLS,
  BIOME_FROZEN_PEAKS, BIOME_STONY_PEAKS, BIOME_OLD_GROWTH_SPRUCE_TAIGA, BIOME_BAMBOO_JUNGLE, BIOME_ERODED_BADLANDS,
  BIOME_WOODED_BADLANDS, BIOME_MANGROVE_SWAMP, BIOME_LUSH_CAVES, BIOME_OCEAN, BIOME_BEACH, BIOME_TAIGA, BIOME_BADLANDS,
  BIOME_SWAMP, BIOME_DEEP_OCEAN, BIOME_PLAINS, BIOME_END_BARRENS, baseBiome, isOceanBiome, isRiverBiome,
} from '../src/shared/world/biomeIds';
import { isVillageBiome } from '../src/shared/world/villages';
import { blockIndex, CHUNK_VOLUME } from '../src/shared/constants';

test('biomas: nombres, herencia y océanos', () => {
  assert.equal(BIOME_NAMES.length, BIOME_END_BARRENS + 1, 'cada id tiene nombre'); // Fase 8.6: los del End, los últimos
  assert.equal(new Set(BIOME_NAMES).size, BIOME_NAMES.length, 'sin nombres repetidos');
  assert.equal(baseBiome(BIOME_MANGROVE_SWAMP), BIOME_SWAMP);
  assert.equal(baseBiome(BIOME_ERODED_BADLANDS), BIOME_BADLANDS);
  assert.equal(baseBiome(BIOME_OLD_GROWTH_SPRUCE_TAIGA), BIOME_TAIGA);
  assert.equal(baseBiome(BIOME_DEEP_COLD_OCEAN), BIOME_DEEP_OCEAN);
  assert.equal(baseBiome(BIOME_PLAINS), BIOME_PLAINS, 'los de antes son su propia base');
  assert.ok(isOceanBiome(BIOME_LUKEWARM_OCEAN) && isOceanBiome(BIOME_DEEP_COLD_OCEAN));
  assert.ok(!isOceanBiome(BIOME_RIVER) && isRiverBiome(BIOME_FROZEN_RIVER), 'los ríos no son océanos');
  assert.equal(baseBiome(BIOME_RIVER), BIOME_OCEAN);
  assert.equal(baseBiome(BIOME_STONY_SHORE), BIOME_BEACH);
  assert.ok(isVillageBiome(BIOME_SUNFLOWER_PLAINS), 'aldeas en la llanura de girasoles');
  assert.ok(!isVillageBiome(BIOME_OLD_GROWTH_SPRUCE_TAIGA), 'pero no en las taigas viejas');
});

test('biomas: todos los del mundo normal salen en un mundo', () => {
  const gen = new TerrainGenerator(12345);
  const seen = new Set<number>();
  for (let z = -6000; z < 6000; z += 48) for (let x = -6000; x < 6000; x += 48) seen.add(gen.biomeAt(x, z));
  const missing = BIOME_NAMES.map((_, i) => i).filter((i) => i < BIOME_LUSH_CAVES - 1 && !seen.has(i));
  assert.deepEqual(missing.map((i) => BIOME_NAMES[i]), []);
});

/** Busca un chunk rodeado del mismo bioma (muestras en el centro y las esquinas) y cuenta los bloques de él y sus 8 vecinos. */
function biomeSample(gen: TerrainGenerator, biome: number): Map<number, number> | null {
  for (let r = 0; r <= 200; r += 2) {
    const ring: [number, number][] = [];
    for (let k = -r; k <= r; k += 2) ring.push([k, -r], [k, r], [-r, k], [r, k]);
    for (const [cx, cz] of ring) {
      let ok = true;
      for (const [dx, dz] of [[8, 8], [0, 0], [15, 0], [0, 15], [15, 15]]) {
        if (gen.biomeAt(cx * 16 + dx, cz * 16 + dz) !== biome) { ok = false; break; }
      }
      if (!ok) continue;
      const counts = new Map<number, number>();
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const { blocks } = gen.generate(cx + dx, cz + dz);
          for (let i = blockIndex(0, 0, 0); i < CHUNK_VOLUME; i++) counts.set(blocks[i], (counts.get(blocks[i]) ?? 0) + 1);
        }
      }
      return counts;
    }
  }
  return null;
}

test('biomas nuevos: cada uno se genera con lo suyo', () => {
  const gen = new TerrainGenerator(12345);
  const snow = Array.from({ length: 8 }, (_, i) => SNOW_LAYER + i);
  const terracotta = [TERRACOTTA, ...Object.values(COLORED_TERRACOTTA)];
  const cases: [number, number[][]][] = [
    [BIOME_RIVER, [[WATER]]],
    [BIOME_SNOWY_BEACH, [[SAND], snow]],
    [BIOME_STONY_SHORE, [[STONE, GRAVEL]]],
    [BIOME_SUNFLOWER_PLAINS, [[SUNFLOWER]]],
    [BIOME_FLOWER_FOREST, [Object.values(FLOWERS), [OAK_LOG], [BIRCH_LOG]]],
    [BIOME_OLD_GROWTH_BIRCH_FOREST, [[BIRCH_LOG]]],
    [BIOME_WINDSWEPT_GRAVELLY_HILLS, [[GRAVEL]]],
    [BIOME_FROZEN_PEAKS, [[PACKED_ICE]]],
    [BIOME_STONY_PEAKS, [[CALCITE]]],
    [BIOME_OLD_GROWTH_SPRUCE_TAIGA, [[PODZOL], [SPRUCE_LOG]]],
    [BIOME_BAMBOO_JUNGLE, [[BAMBOO]]],
    [BIOME_ERODED_BADLANDS, [terracotta]],
    [BIOME_WOODED_BADLANDS, [[COARSE_DIRT], [OAK_LOG]]],
    [BIOME_MANGROVE_SWAMP, [[MUD], [MANGROVE_ROOTS, MANGROVE_LOG]]],
  ];
  for (const [biome, groups] of cases) {
    const c = biomeSample(gen, biome);
    assert.ok(c, `hay ${BIOME_NAMES[biome]} en el mundo`);
    for (const ids of groups) assert.ok(ids.some((id) => (c!.get(id) ?? 0) > 0), `${BIOME_NAMES[biome]}: tiene ${ids[0]}`);
  }
  // La taiga de abetos viejos tiene piceas gigantes (troncos de 2×2).
  const [cx, cz] = findChunk(gen, BIOME_OLD_GROWTH_SPRUCE_TAIGA);
  let mega = false;
  for (let dz = -1; dz <= 1 && !mega; dz++) {
    for (let dx = -1; dx <= 1 && !mega; dx++) {
      const { blocks } = gen.generate(cx + dx, cz + dz);
      for (let y = 40; y < 200 && !mega; y++) {
        for (let z = 0; z < 15 && !mega; z++) {
          for (let x = 0; x < 15; x++) {
            if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => blocks[blockIndex(x + a, y, z + b)] === SPRUCE_LOG)) { mega = true; break; }
          }
        }
      }
    }
  }
  assert.ok(mega, 'piceas gigantes en la taiga de abetos viejos');
});

function findChunk(gen: TerrainGenerator, biome: number): [number, number] {
  for (let r = 0; r <= 200; r += 2) {
    for (let k = -r; k <= r; k += 2) {
      for (const [cx, cz] of [[k, -r], [k, r], [-r, k], [r, k]]) if (gen.biomeAt(cx * 16 + 8, cz * 16 + 8) === biome) return [cx, cz];
    }
  }
  throw new Error('no hay ' + BIOME_NAMES[biome]);
}
