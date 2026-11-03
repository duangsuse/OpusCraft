// Fase 5: biomas nuevos y sus maderas. Recetas y botín de las maderas nuevas, enredaderas y
// nenúfares, brotes que crecen en 2×2, y que cada bioma nuevo se genere con lo suyo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, DIRT, WATER, JUNGLE_LOG, JUNGLE_PLANKS, JUNGLE_LEAVES, JUNGLE_SAPLING, ACACIA_LOG, DARK_OAK_LOG,
  DARK_OAK_SAPLING, CHERRY_PLANKS, CHERRY_LEAVES, VINE, LILY_PAD, MYCELIUM, RED_SAND, RED_SANDSTONE, RED_MUSHROOM_BLOCK,
  COLORED_TERRACOTTA, TERRACOTTA, PACKED_ICE, FLOWERS, PINK_PETALS, DOORS, SIGNS, SLABS, COMPOSTER, WOOD_TYPES,
  blockSupported, isVine,
} from '../src/shared/blocks';
import { STICK, TOOLS } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement } from '../src/shared/placement';
import {
  TerrainGenerator, BIOME_BADLANDS, BIOME_MUSHROOM_FIELDS, BIOME_JUNGLE, BIOME_DARK_FOREST, BIOME_CHERRY_GROVE,
  BIOME_ICE_SPIKES, BIOME_SWAMP, BIOME_SAVANNA, BIOME_MEADOW, BIOME_WARM_OCEAN, BIOME_NAMES,
} from '../src/shared/world/terrain';
import { blockIndex, CHUNK_VOLUME } from '../src/shared/constants';
import { makeServer } from './harness';

test('maderas nuevas: recetas, combustible y familia completa', () => {
  assert.equal(WOOD_TYPES.length, 9); // Fase 6.5 (maderas): mangle y roble pálido
  assert.deepEqual(matchRecipe([JUNGLE_LOG, 0, 0, 0], 2)?.out, { id: JUNGLE_PLANKS, count: 4 });
  const C = CHERRY_PLANKS;
  assert.equal(matchRecipe([C, 0, C, 0], 2)?.out.id, STICK, 'palos con tablones de cerezo');
  assert.equal(matchRecipe([C, C, C, 0, STICK, 0, 0, STICK, 0], 3)?.out.id, TOOLS.wooden.pickaxe, 'pico de madera de cerezo');
  assert.equal(matchRecipe([C, C, 0, C, C, 0, C, C, 0], 3)?.out.id, DOORS.cherry);
  assert.equal(matchRecipe([C, C, C, C, C, C, 0, STICK, 0], 3)?.out.id, SIGNS.cherry);
  assert.equal(matchRecipe([C, C, C, 0, 0, 0, 0, 0, 0], 3)?.out.id, SLABS.cherry);
  const S = SLABS.dark_oak;
  assert.equal(matchRecipe([S, 0, S, S, 0, S, S, S, S], 3)?.out.id, COMPOSTER, 'compostador con losas de roble oscuro');
  assert.equal(matchRecipe([RED_SAND, RED_SAND, RED_SAND, RED_SAND], 2)?.out.id, RED_SANDSTONE);
  for (const w of WOOD_TYPES) assert.ok(SLABS[w.key] && DOORS[w.key] && SIGNS[w.key], `familia completa de ${w.key}`);
});

test('botín: hojas nuevas, enredaderas, champiñones gigantes y micelio', () => {
  const always = () => 0;
  assert.ok(blockDrops(JUNGLE_LEAVES, 0, always).some((s) => s.id === JUNGLE_SAPLING), 'las hojas de jungla sueltan su brote');
  assert.deepEqual(blockDrops(CHERRY_LEAVES, TOOLS.wooden.axe, () => 0.99), [], 'casi siempre, nada');
  assert.deepEqual(blockDrops(VINE + 2, 0), [], 'enredadera sin tijeras: nada');
  const shears = 291;
  assert.deepEqual(blockDrops(VINE + 2, shears), [{ id: VINE, count: 1 }]);
  for (let i = 0; i < 20; i++) assert.ok((blockDrops(RED_MUSHROOM_BLOCK, 0)[0]?.count ?? 0) <= 2);
  assert.deepEqual(blockDrops(MYCELIUM, 0), [{ id: DIRT, count: 1 }]);
  assert.deepEqual(blockDrops(PACKED_ICE, TOOLS.iron.pickaxe), []);
});

test('enredaderas en la pared y nenúfares sobre el agua', () => {
  const m = new Map<string, number>();
  const get = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? STONE : AIR);
  m.set('0,5,0', STONE);
  // Clic en la cara norte de la piedra: la enredadera queda al norte, mirando al norte.
  const e = planPlacement(get, { x: 0, y: 5, z: 0, nx: 0, ny: 0, nz: -1, px: 0.5, py: 5.5, pz: 0, id: STONE }, VINE, 0)!;
  assert.deepEqual(e, [[0, 5, -1, VINE + 0]]);
  m.set('0,5,-1', VINE);
  const below = planPlacement(get, { x: 0, y: 5, z: -1, nx: 0, ny: -1, nz: 0, px: 0.5, py: 5, pz: -0.5, id: VINE }, VINE, 0)!;
  assert.deepEqual(below, [[0, 4, -1, VINE]], 'colgando de otra enredadera');
  const rel = (x: number, y: number, z: number) => (dx: number, dy: number, dz: number) => get(x + dx, y + dy, z + dz);
  assert.ok(blockSupported(VINE, rel(0, 4, -1)), 'la de abajo se sostiene por la de arriba');
  m.delete('0,5,-1');
  assert.ok(!blockSupported(VINE, rel(0, 4, -1)), 'sin la de arriba se cae');
  // Nenúfar: sólo sobre una fuente de agua.
  m.set('3,5,3', WATER);
  assert.deepEqual(planPlacement(get, { x: 3, y: 5, z: 3, nx: 0, ny: 1, nz: 0, px: 3.5, py: 6, pz: 3.5, id: WATER }, LILY_PAD, 0), [[3, 6, 3, LILY_PAD]]);
  assert.equal(planPlacement(get, { x: 0, y: 5, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 6, pz: 0.5, id: STONE }, LILY_PAD, 0), null);
});

test('brotes: el roble oscuro necesita 2×2 y la jungla en 2×2 da un árbol gigante', () => {
  const h = makeServer(4242);
  const W = h.gs.world;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nature = h.gs.sys.nature;
  W.ensureChunk(0, 0);
  const plant = (x: number, z: number, id: number) => {
    W.setBlock(x, 200, z, DIRT);
    W.setBlock(x, 201, z, id);
  };
  plant(2, 2, DARK_OAK_SAPLING);
  nature.growTree(2, 201, 2, 5);
  assert.equal(W.getBlock(2, 201, 2), DARK_OAK_SAPLING, 'un solo brote de roble oscuro no crece');
  plant(3, 2, DARK_OAK_SAPLING);
  plant(2, 3, DARK_OAK_SAPLING);
  plant(3, 3, DARK_OAK_SAPLING);
  nature.growTree(3, 201, 3, 5);
  for (const [x, z] of [[2, 2], [3, 2], [2, 3], [3, 3]]) assert.equal(W.getBlock(x, 202, z), DARK_OAK_LOG, 'tronco de 2×2');
  for (const [x, z] of [[10, 10], [11, 10], [10, 11], [11, 11]]) plant(x, z, JUNGLE_SAPLING);
  nature.growTree(10, 201, 10, 3);
  assert.equal(W.getBlock(11, 201 + 14, 11), JUNGLE_LOG, 'jungla gigante: más de 15 de alto');
  let vines = 0;
  for (let y = 201; y < 220; y++) for (let x = 9; x <= 12; x++) for (let z = 9; z <= 12; z++) if (isVine(W.getBlock(x, y, z))) vines++;
  assert.ok(vines > 0, 'con enredaderas en el tronco');
  // Si se quita el tronco, las enredaderas pegadas a él se caen.
  const vineAt: [number, number, number] | undefined = (() => {
    for (let y = 202; y < 215; y++) for (let z = 10; z <= 11; z++) if (isVine(W.getBlock(9, y, z)) && !isVine(W.getBlock(9, y + 1, z))) return [9, y, z];
    return undefined;
  })();
  if (vineAt) {
    W.setBlock(10, vineAt[1], vineAt[2], AIR);
    assert.ok(!isVine(W.getBlock(...vineAt)), 'la enredadera sin pared se cae');
  }
});

/** Busca un chunk rodeado del mismo bioma y cuenta los bloques de él y sus 8 vecinos. */
function biomeSample(gen: TerrainGenerator, biome: number): Map<number, number> | null {
  // Anillos cuadrados alrededor del origen, de 2 en 2 chunks, hasta ~2000 bloques.
  for (let r = 0; r <= 124; r += 2) {
    const ring: [number, number][] = [];
    for (let k = -r; k <= r; k += 2) ring.push([k, -r], [k, r], [-r, k], [r, k]);
    for (const [cx, cz] of ring) {
      let ok = true;
      for (const [dx, dz] of [[0, 0], [15, 0], [0, 15], [15, 15], [8, 8]]) {
        if (gen.biomeAt(cx * 16 + dx, cz * 16 + dz) !== biome) ok = false;
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

test('cada bioma nuevo se genera con lo suyo', () => {
  const gen = new TerrainGenerator(12345);
  const has = (c: Map<number, number>, ids: number[]) => ids.some((id) => (c.get(id) ?? 0) > 0);
  const cases: [number, number[][]][] = [
    [BIOME_BADLANDS, [[RED_SAND], [TERRACOTTA, ...Object.values(COLORED_TERRACOTTA)]]],
    [BIOME_MUSHROOM_FIELDS, [[MYCELIUM]]],
    [BIOME_JUNGLE, [[JUNGLE_LOG], [VINE, VINE + 1, VINE + 2, VINE + 3]]],
    [BIOME_DARK_FOREST, [[DARK_OAK_LOG]]],
    [BIOME_CHERRY_GROVE, [[CHERRY_LEAVES], [PINK_PETALS]]],
    [BIOME_ICE_SPIKES, [[PACKED_ICE]]],
    [BIOME_SWAMP, [[LILY_PAD], [VINE, VINE + 1, VINE + 2, VINE + 3]]],
    [BIOME_SAVANNA, [[ACACIA_LOG]]],
    [BIOME_MEADOW, [Object.values(FLOWERS)]],
    [BIOME_WARM_OCEAN, [[WATER]]],
  ];
  for (const [biome, groups] of cases) {
    const c = biomeSample(gen, biome);
    assert.ok(c, `hay ${BIOME_NAMES[biome]} cerca del origen`);
    for (const ids of groups) assert.ok(has(c!, ids), `${BIOME_NAMES[biome]}: tiene ${ids[0]}`);
  }
});
