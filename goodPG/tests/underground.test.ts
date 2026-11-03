// Fase 5: el subsuelo. Pizarra profunda y sus menas, cobre y esmeralda, cuevas frondosas y de
// goteo, acuíferos y geodas de amatista que crecen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, DIAMOND_ORE, IRON_ORE, COAL_ORE, DEEPSLATE, COBBLED_DEEPSLATE, DEEPSLATE_ORE, COPPER_ORE, EMERALD_ORE,
  COPPER_BLOCK, EMERALD_BLOCK, AMETHYST_BLOCK, BUDDING_AMETHYST, AMETHYST_BUD, TINTED_GLASS, GLASS, CAVE_VINES,
  POINTED_DRIPSTONE, MOSS_BLOCK, DRIPSTONE_BLOCK, FURNACE, stateOf,
} from '../src/shared/blocks';
import { TOOLS, DIAMOND, COAL, COPPER_INGOT, EMERALD, AMETHYST_SHARD, GLOW_BERRIES, IRON_INGOT, ITEMS, STICK } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { amethystBudAt } from '../src/shared/blocks';
import { planPlacement } from '../src/shared/placement';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { blockIndex, MIN_Y } from '../src/shared/constants';
import { makeServer } from './harness';
import { RAW_IRON } from '../src/shared/items'; // Fase 6.5 (materiales)

test('pizarra profunda: botín, fundición y recetas', () => {
  const pick = TOOLS.iron.pickaxe;
  assert.deepEqual(blockDrops(DEEPSLATE, pick), [{ id: COBBLED_DEEPSLATE, count: 1 }]);
  assert.deepEqual(blockDrops(DEEPSLATE_ORE[DIAMOND_ORE], pick), [{ id: DIAMOND, count: 1 }]);
  assert.deepEqual(blockDrops(DEEPSLATE_ORE[COAL_ORE], pick), [{ id: COAL, count: 1 }]);
  // Fase 6.5 (materiales): la de hierro suelta hierro en bruto (antes, la mena).
  assert.deepEqual(blockDrops(DEEPSLATE_ORE[IRON_ORE], pick), [{ id: RAW_IRON, count: 1 }], 'la de hierro suelta hierro en bruto');
  assert.deepEqual(blockDrops(DEEPSLATE_ORE[DIAMOND_ORE], TOOLS.stone.pickaxe), [], 'diamante: hace falta pico de hierro');
  assert.equal(ITEMS[DEEPSLATE_ORE[IRON_ORE]].smelt, IRON_INGOT);
  assert.equal(ITEMS[COPPER_ORE].smelt, COPPER_INGOT);
  assert.equal(ITEMS[COBBLED_DEEPSLATE].smelt, DEEPSLATE);
  const D = COBBLED_DEEPSLATE;
  assert.equal(matchRecipe([D, D, D, 0, STICK, 0, 0, STICK, 0], 3)?.out.id, TOOLS.stone.pickaxe, 'pico de piedra con pizarra rocosa');
  assert.equal(matchRecipe([D, D, D, D, 0, D, D, D, D], 3)?.out.id, FURNACE);
});

test('cobre, esmeralda y amatista', () => {
  assert.deepEqual(blockDrops(EMERALD_ORE, TOOLS.iron.pickaxe), [{ id: EMERALD, count: 1 }]);
  assert.deepEqual(blockDrops(EMERALD_ORE, TOOLS.stone.pickaxe), [], 'esmeralda: pico de hierro');
  const I = COPPER_INGOT, E = EMERALD, A = AMETHYST_SHARD;
  assert.equal(matchRecipe([I, I, I, I, I, I, I, I, I], 3)?.out.id, COPPER_BLOCK);
  assert.equal(matchRecipe([E, E, E, E, E, E, E, E, E], 3)?.out.id, EMERALD_BLOCK);
  assert.equal(matchRecipe([A, A, A, A], 2)?.out.id, AMETHYST_BLOCK);
  assert.deepEqual(matchRecipe([0, A, 0, A, GLASS, A, 0, A, 0], 3)?.out, { id: TINTED_GLASS, count: 2 });
  assert.deepEqual(blockDrops(AMETHYST_BUD + 3, TOOLS.wooden.pickaxe), [{ id: AMETHYST_SHARD, count: 4 }], 'racimo: 4 fragmentos');
  assert.deepEqual(blockDrops(AMETHYST_BUD + 1, TOOLS.wooden.pickaxe), [], 'brote a medias: nada');
  assert.deepEqual(blockDrops(BUDDING_AMETHYST, TOOLS.diamond.pickaxe), []);
  assert.deepEqual(blockDrops(CAVE_VINES + 1, 0), [{ id: GLOW_BERRIES, count: 1 }]);
  assert.deepEqual(blockDrops(CAVE_VINES, 0), []);
});

test('colocar: bayas bajo el techo y espeleotemas arriba o abajo', () => {
  const m = new Map<string, number>();
  const get = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? STONE : AIR);
  m.set('0,10,0', STONE);
  const under = { x: 0, y: 10, z: 0, nx: 0, ny: -1, nz: 0, px: 0.5, py: 10, pz: 0.5, id: STONE };
  const top = { x: 0, y: 10, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 11, pz: 0.5, id: STONE };
  assert.deepEqual(planPlacement(get, under, CAVE_VINES, 0), [[0, 9, 0, CAVE_VINES]]);
  assert.equal(planPlacement(get, top, CAVE_VINES, 0), null, 'no encima del bloque');
  assert.deepEqual(planPlacement(get, top, POINTED_DRIPSTONE, 0), [[0, 11, 0, stateOf(POINTED_DRIPSTONE, { dir: 0, part: 0 })]]);
  assert.deepEqual(planPlacement(get, under, POINTED_DRIPSTONE, 0), [[0, 9, 0, stateOf(POINTED_DRIPSTONE, { dir: 1, part: 0 })]]);
  // AmethystClusterBlock: en cualquier cara; bajo el techo, colgando (hacia abajo).
  assert.deepEqual(planPlacement(get, under, AMETHYST_BUD, 0), [[0, 9, 0, amethystBudAt(0, 0)]], 'los brotes de amatista cuelgan del techo');
});

test('generación: pizarra profunda, menas, cuevas frondosas y de goteo, acuíferos y geodas', () => {
  const gen = new TerrainGenerator(12345);
  const c = new Map<number, number>();
  let deepAbove = 0, stoneBelow = 0;
  for (let i = 0; i < 120; i++) {
    const cx = (i % 12) * 9 - 50, cz = Math.floor(i / 12) * 9 - 45;
    const { blocks } = gen.generate(cx, cz);
    for (const b of blocks) c.set(b, (c.get(b) ?? 0) + 1);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      if (blocks[blockIndex(x, 12, z)] === DEEPSLATE) deepAbove++;
      if (blocks[blockIndex(x, -20, z)] === STONE) stoneBelow++;
    }
  }
  const n = (id: number) => c.get(id) ?? 0;
  assert.ok(n(DEEPSLATE) > 1e6, 'mucha pizarra profunda');
  assert.equal(deepAbove, 0, 'sin pizarra por encima de y = 8');
  assert.equal(stoneBelow, 0, 'sin piedra por debajo de 0');
  for (const [id, what] of [
    [DEEPSLATE_ORE[DIAMOND_ORE], 'diamantes de pizarra'], [COPPER_ORE, 'cobre'], [MOSS_BLOCK, 'musgo'], [DRIPSTONE_BLOCK, 'espeleotema'],
    [AMETHYST_BLOCK, 'geodas'], [CAVE_VINES + 1, 'bayas luminosas'], [POINTED_DRIPSTONE + 2 * 0, 'estalagmitas'],
  ] as [number, string][]) assert.ok(n(id) > 0, what);
  assert.equal(n(DIAMOND_ORE) + n(DEEPSLATE_ORE[DIAMOND_ORE]) > 0, true);
  void MIN_Y;
});

test('la amatista con brotes echa racimos', () => {
  const h = makeServer(99);
  const W = h.gs.world;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nature = h.gs.sys.nature;
  W.ensureChunk(0, 0);
  W.setBlock(4, 150, 4, BUDDING_AMETHYST);
  W.setBlock(4, 151, 4, AIR);
  // Los ticks aleatorios caen donde quieran: se fuerzan sobre el bloque llamando al manejador.
  for (let i = 0; i < 400 && W.getBlock(4, 151, 4) !== AMETHYST_BUD + 3; i++) {
    nature.randomTickAt?.(4, 150, 4);
  }
  assert.equal(W.getBlock(4, 151, 4), AMETHYST_BUD + 3, 'acaba siendo un racimo');
});
