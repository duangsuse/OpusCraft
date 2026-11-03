// Fase 8.2 (biomas del Nether): biomas, superficie y decoración de cada bioma, bloques nuevos (recetas,
// cortapiedras, botín, combustible, vallas), plantas (polvo de hueso, necelio, enredaderas) y la lava
// rápida del Nether, comparado con lo que hace Java 26.3.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetherGenerator } from '../src/shared/world/nether';
import { NetherTerrain, baseIndex } from '../src/shared/world/netherTerrain';
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from '../src/shared/world/biomeIds';
import {
  AIR, BEDROCK, NETHERRACK, LAVA, STONE, SOUL_SAND, SOUL_SOIL, BASALT, BLACKSTONE, MAGMA_BLOCK, CRIMSON_NYLIUM, WARPED_NYLIUM,
  CRIMSON_STEM, WARPED_STEM, NETHER_WART_BLOCK, WARPED_WART_BLOCK, SHROOMLIGHT, WEEPING_VINES, WEEPING_VINES_PLANT, TWISTING_VINES,
  TWISTING_VINES_PLANT, CRIMSON_FUNGUS, WARPED_FUNGUS, CRIMSON_ROOTS, NETHER_SPROUTS, GILDED_BLACKSTONE, NETHER_BRICKS,
  NETHER_BRICK_FENCE, RED_NETHER_BRICKS, POLISHED_BLACKSTONE, POLISHED_BLACKSTONE_BRICKS, CHISELED_POLISHED_BLACKSTONE, CRIMSON,
  WARPED, FENCES, SLABS, BLOCKS, OAK_PLANKS, familyBase, blockModel, vineAge, netherVineOf, strippedOf, flammability, isNylium,
  fluidBlock, BLOCK_FLUID_LEVEL, fluidHeight,
} from '../src/shared/blocks';
import { ITEMS, NETHER_BRICK, NETHER_WART, STICK, GOLD_NUGGET, SHEARS, TOOLS } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { isFuel, smeltResult } from '../src/shared/containers';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { FluidSim, type FluidWorld } from '../src/shared/sim/fluids';
import { dimensionDef, DIM_NETHER, DIM_OVERWORLD } from '../src/shared/dimensions';
import { blockIndex } from '../src/shared/constants';
import { makeServer } from './harness';

const ALL = [BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS];

/** Un chunk de un bioma (el centro y los alrededores del mismo bioma), buscando en espiral. */
function chunkOf(gen: NetherGenerator, biome: number): [number, number] {
  for (let r = 0; r < 4000; r += 32) {
    for (let a = 0; a < 24; a++) {
      const x = Math.round(Math.cos((a / 24) * Math.PI * 2) * r), z = Math.round(Math.sin((a / 24) * Math.PI * 2) * r);
      let ok = true;
      for (let dx = -32; dx <= 32 && ok; dx += 16) for (let dz = -32; dz <= 32 && ok; dz += 16) ok = gen.biomeAt(x + dx, z + dz) === biome;
      if (ok) return [x >> 4, z >> 4];
    }
  }
  throw new Error('no hay bioma ' + biome);
}

/** Cuenta los bloques de los 3×3 chunks de alrededor de (cx, cz). */
function census(gen: NetherGenerator, cx: number, cz: number): Map<number, number> {
  const m = new Map<number, number>();
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const id of gen.generate(cx + dx, cz + dz).blocks) {
      const b = familyBase(id);
      m.set(b, (m.get(b) ?? 0) + 1);
    }
  }
  return m;
}

test('biomas del Nether: los cinco, en zonas grandes, con los puntos de Java', () => {
  const gen = new NetherGenerator(12345);
  const count = new Map<number, number>();
  for (let z = -3000; z < 3000; z += 24) for (let x = -3000; x < 3000; x += 24) {
    const b = gen.biomeAt(x, z);
    count.set(b, (count.get(b) ?? 0) + 1);
  }
  const total = [...count.values()].reduce((a, c) => a + c, 0);
  for (const b of ALL) assert.ok((count.get(b) ?? 0) / total > 0.04, `bioma ${b}: ${(((count.get(b) ?? 0) / total) * 100).toFixed(1)} %`);
  assert.equal(count.size, 5, 'sólo los cinco del Nether');
  // Los biomas son de columna (en la 26.3 no dependen de la altura) y cambian poco a poco.
  let same = 0;
  for (let x = 0; x < 400; x++) if (gen.biomeAt(x, 0) === gen.biomeAt(x + 1, 0)) same++;
  assert.ok(same > 380, 'regiones grandes');
});

test('terreno del Nether: cavernas, mar de lava hasta y = 31, lecho de roca y cuevas', () => {
  const t = new NetherTerrain(777);
  let air = 0, solid = 0;
  for (let c = 0; c < 12; c++) {
    const b = t.baseChunk(c * 7 - 40, c * 5 - 30);
    for (let y = 32; y < 120; y++) for (let i = 0; i < 256; i++) {
      const id = b[baseIndex(i & 15, y, i >> 4)];
      if (id === AIR) air++;
      else if (id !== LAVA) solid++;
    }
    for (let i = 0; i < 256; i++) {
      assert.equal(b[baseIndex(i & 15, 0, i >> 4)], BEDROCK);
      assert.equal(b[baseIndex(i & 15, 127, i >> 4)], BEDROCK);
      for (let y = 1; y < 32; y++) assert.notEqual(b[baseIndex(i & 15, y, i >> 4)], AIR, 'bajo el mar de lava no queda aire');
    }
  }
  const frac = air / (air + solid);
  assert.ok(frac > 0.2 && frac < 0.8, `hueco: ${(frac * 100).toFixed(0)} %`);
});

test('superficie y decoración de cada bioma', () => {
  const gen = new NetherGenerator(777);
  const has = (m: Map<number, number>, id: number, min = 1) => (m.get(id) ?? 0) >= min;
  const crimson = census(gen, ...chunkOf(gen, BIOME_CRIMSON_FOREST));
  for (const id of [CRIMSON_NYLIUM, CRIMSON_STEM, NETHER_WART_BLOCK, SHROOMLIGHT, WEEPING_VINES, WEEPING_VINES_PLANT, CRIMSON_ROOTS, CRIMSON_FUNGUS]) {
    assert.ok(has(crimson, id), `bosque carmesí: ${BLOCKS[id].key}`);
  }
  assert.ok(!has(crimson, WARPED_NYLIUM), 'sin necelio distorsionado');
  const warped = census(gen, ...chunkOf(gen, BIOME_WARPED_FOREST));
  for (const id of [WARPED_NYLIUM, WARPED_STEM, WARPED_WART_BLOCK, TWISTING_VINES, TWISTING_VINES_PLANT, NETHER_SPROUTS, WARPED_FUNGUS]) {
    assert.ok(has(warped, id), `bosque distorsionado: ${BLOCKS[id].key}`);
  }
  const valley = census(gen, ...chunkOf(gen, BIOME_SOUL_SAND_VALLEY));
  for (const id of [SOUL_SAND, SOUL_SOIL]) assert.ok(has(valley, id, 500), `valle de almas: ${BLOCKS[id].key}`);
  const deltas = census(gen, ...chunkOf(gen, BIOME_BASALT_DELTAS));
  for (const id of [BASALT, BLACKSTONE, MAGMA_BLOCK]) assert.ok(has(deltas, id, 50), `deltas de basalto: ${BLOCKS[id].key}`);
  assert.ok((deltas.get(BASALT) ?? 0) > (deltas.get(NETHERRACK) ?? 0), 'en las deltas domina el basalto');
});

test('los chunks del Nether coinciden aunque se generen por separado y en otro orden', () => {
  const a = new NetherGenerator(4242), b = new NetherGenerator(4242);
  const [cx, cz] = chunkOf(a, BIOME_CRIMSON_FOREST);
  const first = a.generate(cx, cz).blocks;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) b.generate(cx + dx, cz + dz);
  const second = b.generate(cx, cz).blocks;
  assert.deepEqual(Array.from(second), Array.from(first));
});

test('los manantiales de lava del Nether corren al cargar el chunk', () => {
  const gen = new NetherGenerator(777);
  let ticks = 0;
  for (let i = 0; i < 16; i++) ticks += (gen.generate(i, 3).fluidTicks?.length ?? 0) / 3;
  assert.ok(ticks > 0, 'hay manantiales');
  for (let i = 0; i < 4; i++) {
    const r = gen.generate(i, 3);
    const t = r.fluidTicks ?? [];
    for (let k = 0; k < t.length; k += 3) assert.equal(r.blocks[blockIndex(t[k] & 15, t[k + 1], t[k + 2] & 15)], LAVA);
  }
});

test('bloques del Nether: recetas, cortapiedras, fundición y combustible como en Java', () => {
  const craft = (grid: number[], size = 3) => matchRecipe(grid, size)?.out;
  assert.deepEqual(craft([CRIMSON.stem, 0, 0, 0]), { id: CRIMSON.planks, count: 4 }, 'tablones de un tallo');
  assert.deepEqual(craft([WARPED.strippedHyphae, 0, 0, 0]), { id: WARPED.planks, count: 4 }, 'también de hifas sin corteza');
  assert.deepEqual(craft([CRIMSON.stem, CRIMSON.stem, CRIMSON.stem, CRIMSON.stem], 2), { id: CRIMSON.hyphae, count: 3 });
  assert.deepEqual(craft([CRIMSON.planks, 0, 0, CRIMSON.planks, 0, 0, 0, 0, 0]), { id: STICK, count: 4 }, 'palos');
  assert.deepEqual(craft([NETHER_BRICK, NETHER_WART, NETHER_WART, NETHER_BRICK], 2), { id: RED_NETHER_BRICKS, count: 1 });
  assert.deepEqual(craft([NETHER_BRICK, NETHER_BRICK, NETHER_BRICK, NETHER_BRICK], 2), { id: NETHER_BRICKS, count: 1 });
  const nb = NETHER_BRICKS, n = NETHER_BRICK;
  assert.deepEqual(craft([nb, n, nb, nb, n, nb, 0, 0, 0]), { id: NETHER_BRICK_FENCE, count: 6 });
  assert.deepEqual(craft(new Array(9).fill(NETHER_WART)), { id: NETHER_WART_BLOCK, count: 1 });
  assert.deepEqual(craft([SLABS.polished_blackstone, 0, 0, SLABS.polished_blackstone, 0, 0, 0, 0, 0]), { id: CHISELED_POLISHED_BLACKSTONE, count: 1 });
  assert.ok(stonecutterOptions(BLACKSTONE).some((s) => s.id === POLISHED_BLACKSTONE_BRICKS), 'cortapiedras: piedra negra → ladrillos');
  assert.equal(smeltResult(NETHERRACK), NETHER_BRICK, 'la rocanegra se funde en ladrillo del Nether');
  for (const id of [CRIMSON.planks, CRIMSON.stem, WARPED.hyphae, SLABS.crimson, FENCES.warped]) assert.ok(!isFuel(id), `${ITEMS[id].key}: no es combustible`);
  assert.ok(isFuel(OAK_PLANKS));
  for (const id of [CRIMSON.planks, CRIMSON.stem, SLABS.warped, FENCES.crimson]) assert.equal(flammability(id), 0, `${BLOCKS[id].key}: no arde`);
  assert.equal(strippedOf(CRIMSON.stem), CRIMSON.strippedStem, 'el hacha descorteza el tallo');
  assert.equal(strippedOf(WARPED.hyphae), WARPED.strippedHyphae);
});

test('botín: necelio, brotes, enredaderas y piedra negra dorada', () => {
  const pick = TOOLS.iron.pickaxe;
  assert.deepEqual(blockDrops(CRIMSON_NYLIUM, pick), [{ id: NETHERRACK, count: 1 }], 'el necelio suelta rocanegra');
  assert.deepEqual(blockDrops(CRIMSON_NYLIUM, 0), [], 'a mano, nada');
  assert.deepEqual(blockDrops(NETHER_SPROUTS, 0), [], 'brotes: sólo con tijeras');
  assert.deepEqual(blockDrops(NETHER_SPROUTS, SHEARS), [{ id: NETHER_SPROUTS, count: 1 }]);
  assert.deepEqual(blockDrops(WEEPING_VINES_PLANT, SHEARS), [{ id: WEEPING_VINES, count: 1 }], 'el tallo suelta la enredadera');
  let vines = 0, nuggets = 0;
  for (let i = 0; i < 2000; i++) {
    vines += blockDrops(TWISTING_VINES, 0).length;
    if (blockDrops(GILDED_BLACKSTONE, pick)[0].id === GOLD_NUGGET) nuggets++;
  }
  assert.ok(vines > 560 && vines < 760, `enredaderas a mano: ${vines} de 2000 (33 %)`);
  assert.ok(nuggets > 140 && nuggets < 260, `pepitas: ${nuggets} de 2000 (10 %)`);
});

test('la valla de ladrillos del Nether no se une a las de madera', () => {
  const fence = NETHER_BRICK_FENCE, oak = FENCES.oak;
  const arms = (id: number, n: number) => blockModel(id, (dx, dy, dz) => (dx === 1 && dy === 0 && dz === 0 ? n : 0))?.length ?? 0;
  assert.ok(arms(fence, fence) > arms(fence, oak), 'con otra de ladrillos sí, con una de madera no');
  assert.ok(arms(oak, oak) > arms(oak, fence));
  assert.ok(arms(fence, STONE) > arms(fence, 0), 'y a los bloques enteros');
});

test('enredaderas del Nether: colocar, crecer, punta y tallo', () => {
  const h = makeServer(8201);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  const x = 2, z = 2, y = 90;
  for (let k = y - 12; k <= y + 1; k++) W.setBlock(x, k, z, AIR);
  W.setBlock(x, y + 1, z, NETHERRACK);
  // Colocar debajo del techo: una punta; debajo de ella otra, y la de arriba pasa a tallo.
  const hit: PlaceHit = { x, y: y + 1, z, nx: 0, ny: -1, nz: 0, px: x + 0.5, py: y + 1, pz: z + 0.5, id: NETHERRACK };
  const edits = planPlacement((a, b, c) => W.getBlock(a, b, c), hit, WEEPING_VINES, 0, 0);
  assert.ok(edits && vineAge(edits[0][3]) >= 0, 'una punta');
  W.setBlock(x, y, z, edits![0][3]);
  W.setBlock(x, y - 1, z, WEEPING_VINES);
  assert.equal(W.getBlock(x, y, z), WEEPING_VINES_PLANT, 'la de arriba es ya tallo');
  // Crece con los ticks aleatorios (10 % cada uno) hasta la edad 25.
  for (let i = 0; i < 400; i++) h.gs.sys.nature.randomTickAt(x, y - 1 - (i % 3), z);
  let len = 0;
  while (netherVineOf(W.getBlock(x, y - len, z))) len++;
  assert.ok(len > 2, `ha crecido: ${len}`);
  // Al romper el techo se cae entera.
  W.setBlock(x, y + 1, z, AIR);
  h.tick(2);
  assert.equal(W.getBlock(x, y - 1, z), AIR, 'sin apoyo, se rompe');
});

test('polvo de hueso en el Nether: necelio, rocanegra y hongos', () => {
  const h = makeServer(8202);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  const x = 8, y = 90, z = 8;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    W.setBlock(x + dx, y, z + dz, CRIMSON_NYLIUM);
    for (let k = 1; k < 20; k++) W.setBlock(x + dx, y + k, z + dz, AIR);
  }
  W.setBlock(x + 3, y, z, NETHERRACK);
  const np = h.gs.sys.netherPlants;
  assert.ok(np.fertilize(x, y, z), 'necelio: sí');
  let plants = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (W.getBlock(x + dx, y + 1, z + dz) !== AIR) plants++;
  assert.ok(plants > 0, 'echa vegetación');
  assert.ok(np.fertilize(x + 3, y, z), 'rocanegra junto al necelio');
  assert.equal(W.getBlock(x + 3, y, z), CRIMSON_NYLIUM);
  // Hongo sobre su necelio: con suerte (40 %), crece el hongo gigante.
  W.setBlock(x, y + 1, z, CRIMSON_FUNGUS);
  for (let i = 0; i < 20 && W.getBlock(x, y + 1, z) === CRIMSON_FUNGUS; i++) np.fertilize(x, y + 1, z);
  assert.equal(W.getBlock(x, y + 1, z), CRIMSON_STEM, 'ha crecido el hongo gigante');
  // El necelio tapado vuelve a ser rocanegra.
  W.setBlock(x - 3, y + 1, z - 3, STONE);
  h.gs.sys.nature.randomTickAt(x - 3, y, z - 3);
  assert.equal(W.getBlock(x - 3, y, z - 3), NETHERRACK);
  assert.ok(isNylium(W.getBlock(x - 2, y, z - 3)));
});

test('la lava del Nether corre rápido y llega a 7 bloques; la del mundo normal, a 3', () => {
  assert.ok(dimensionDef(DIM_NETHER).fastLava && !dimensionDef(DIM_OVERWORLD).fastLava);
  // Niveles de Java: la lava del mundo normal usa 2, 4 y 6; la rápida, también los impares.
  assert.deepEqual([2, 4, 6].map((l) => BLOCK_FLUID_LEVEL[fluidBlock(2, l)]), [2, 4, 6]);
  assert.deepEqual([1, 3, 5, 7].map((l) => BLOCK_FLUID_LEVEL[fluidBlock(2, l)]), [1, 3, 5, 7]);
  assert.ok(fluidHeight(fluidBlock(2, 1)) > fluidHeight(fluidBlock(2, 2)));
  const run = (fast: boolean) => {
    const cells = new Map<string, number>();
    const world: FluidWorld = {
      getBlock: (x, y, z) => (y < 0 ? STONE : cells.get(`${x},${y},${z}`) ?? AIR),
      setBlock: (x, y, z, id) => {
        cells.set(`${x},${y},${z}`, id);
        sim.onBlockChanged(world, x, y, z);
      },
      washAway: () => {},
    };
    const sim = new FluidSim(fast);
    world.setBlock(0, 0, 0, LAVA);
    for (let t = 0; t < 600; t++) sim.step(world);
    let reach = 0;
    for (let x = 1; x < 12; x++) if (cells.get(`${x},0,0`) !== undefined && cells.get(`${x},0,0`) !== AIR) reach = x;
    return reach;
  };
  assert.equal(run(false), 3, 'mundo normal');
  assert.equal(run(true), 7, 'Nether');
});
