// Fase 6.5: océano y plantas. Corales (vivos y muertos), algas, plantas marinas, pepinos de mar,
// prismarina y esponjas; flores altas, hierba alta, bayas dulces, azaleas, plantaformas, liquen,
// raíces y flor de esporas: bloques anegados, colocación, botín, recetas, vida en el servidor,
// mallado y generación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, GRASS, SAND, WATER, SEA_LANTERN, BLOCKS, BLOCK_FLUID, BLOCK_EMISSION, CORALS, DEAD_CORALS, CORAL_TYPES, KELP,
  KELP_TOP, KELP_STEM, SEAGRASS, SEAGRASS_SHORT, TALL_SEAGRASS_LOWER, TALL_SEAGRASS_UPPER, SEA_PICKLE, PRISMARINE,
  PRISMARINE_BRICKS, DARK_PRISMARINE, PRISMARINE_WALL, SPONGE, WET_SPONGE, DRIED_KELP_BLOCK, SUNFLOWER, LILAC, ROSE_BUSH, PEONY,
  TORCHFLOWER, PITCHER_PLANT, TALL_GRASS, LARGE_FERN, SWEET_BERRY_BUSH, AZALEA_LEAVES, BIG_DRIPLEAF, BIG_DRIPLEAF_STEM,
  SMALL_DRIPLEAF, GLOW_LICHEN, HANGING_ROOTS, SPORE_BLOSSOM, SLABS, STAIRS, WALLS, INVENTORY_ORDER, isWaterlogged,
  seaPickleBlock, stateOf, stateProps,
} from '../src/shared/blocks';
import {
  ITEMS, DRIED_KELP, SWEET_BERRIES, PRISMARINE_SHARD, PRISMARINE_CRYSTALS, SHEARS, TOOLS, CREATIVE_ITEMS, itemSpriteIndex,
  itemForBlock, isValidItem,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { COMPOST_CHANCE } from '../src/shared/composting';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { OCEAN_GENERATORS } from '../src/client/textures/genOcean';
import { Mesher } from '../src/client/world/mesh/mesher';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { CHUNK_VOLUME, blockIndex } from '../src/shared/constants';
import { ENT_ITEM } from '../src/shared/mobs';
import { makeServer, type Client, type Harness } from './harness';

/** Mundo de prueba en un Map (planPlacement). */
function mapWorld(fill: (x: number, y: number, z: number) => number) {
  const m = new Map<string, number>();
  const get = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? fill(x, y, z);
  const set = (x: number, y: number, z: number, id: number) => m.set(`${x},${y},${z}`, id);
  return { get, set };
}
/** Golpe en la cara superior del bloque de (x, y - 1, z). */
const onTop = (x: number, y: number, z: number, id: number): PlaceHit => ({ x, y: y - 1, z, nx: 0, ny: 1, nz: 0, px: x + 0.5, py: y, pz: z + 0.5, id });

/** Piscina de piedra de 7×7 y 4 de hondo (agua de y = 150 a 153) con un jugador al lado. */
function pool(mode: 's' | 'c' = 's'): { h: Harness; c: Client; x: number; y: number; z: number } {
  const h = makeServer(4242);
  const c = h.join('Buceadora', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const x = Math.floor(sx) + 2, y = 150, z = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = -1; dy <= 4; dy++) {
    const wall = Math.abs(dx) === 4 || Math.abs(dz) === 4 || dy === -1;
    W.setBlock(x + dx, y + dy, z + dz, wall ? STONE : dy <= 3 ? WATER : AIR);
  }
  c.pos(x + 0.5, y + 4, z + 0.5);
  h.tick(10);
  clearItems(h);
  return { h, c, x, y, z };
}
const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);
function clearItems(h: Harness): void {
  for (const e of [...h.gs.entities.list.values()]) if (e.type === ENT_ITEM) h.gs.entities.list.delete(e.id);
}
const nature = (h: Harness) => h.gs.sys.nature;

test('bloques nuevos: nombres, objetos, anegados e inventario', () => {
  for (const t of CORAL_TYPES) {
    for (const set of [CORALS[t], DEAD_CORALS[t]]) {
      for (const id of [set.block, set.coral, set.fan]) assert.ok(isValidItem(id) && ITEMS[id].block === id, BLOCKS[id].key);
      assert.equal(ITEMS[set.wallFan], undefined, 'la gorgonia de pared no es objeto');
      assert.equal(itemForBlock(stateOf(set.wallFan, { water: 1, facing: 2 })), set.fan, 'clic central: la gorgonia');
      assert.ok(isWaterlogged(stateOf(set.coral, { water: 1 })) && !isWaterlogged(set.coral));
    }
  }
  assert.equal(BLOCKS[CORALS.brain.fan].name, 'Gorgonia de cerebro');
  assert.equal(BLOCKS[DEAD_CORALS.tube.block].name, 'Bloque de coral de tubo muerto');
  // Las algas y las plantas marinas sólo existen anegadas (el estado 0 es el objeto).
  for (const id of [KELP_TOP, KELP_STEM, SEAGRASS_SHORT, TALL_SEAGRASS_LOWER, TALL_SEAGRASS_UPPER]) {
    assert.ok(isWaterlogged(id) && BLOCK_FLUID[id] === 1, BLOCKS[id].key);
  }
  assert.ok(!isWaterlogged(KELP) && ITEMS[KELP].block === KELP && itemForBlock(KELP_STEM) === KELP);
  // Los pepinos dan luz sólo bajo el agua.
  assert.deepEqual([1, 2, 3, 4].map((n) => BLOCK_EMISSION[seaPickleBlock(n, true)]), [6, 9, 12, 15]);
  assert.equal(BLOCK_EMISSION[seaPickleBlock(4, false)], 0);
  // Prismarina con losas, escaleras y muro.
  assert.ok(SLABS.prismarine && STAIRS.prismarine_brick && SLABS.dark_prismarine && WALLS.prismarine === PRISMARINE_WALL);
  assert.equal(BLOCKS[STAIRS.dark_prismarine].name, 'Escaleras de prismarina oscura');
  // Todo lo nuevo está en el inventario creativo, y los objetos tienen dibujo.
  for (const id of [CORALS.fire.block, KELP, SEAGRASS, SEA_PICKLE, PRISMARINE, SPONGE, SUNFLOWER, BIG_DRIPLEAF, SPORE_BLOSSOM, GLOW_LICHEN]) {
    assert.ok(INVENTORY_ORDER.includes(id), BLOCKS[id].key);
  }
  for (const id of [DRIED_KELP, SWEET_BERRIES, PRISMARINE_SHARD, PRISMARINE_CRYSTALS]) {
    assert.ok(CREATIVE_ITEMS.includes(id) && itemSpriteIndex(id) >= 0, ITEMS[id].key);
  }
  assert.equal(ITEMS[SWEET_BERRIES].block, SWEET_BERRY_BUSH, 'las bayas plantan el arbusto');
  assert.equal(ITEMS[SWEET_BERRY_BUSH], undefined);
  assert.equal(itemForBlock(SWEET_BERRY_BUSH + 3), SWEET_BERRIES);
});

test('texturas: todas las nuevas tienen generador y caben', () => {
  const first = TEXTURE_DEFS.findIndex((t) => t.name === 'tube_coral_block');
  assert.ok(first > 0);
  const mine = TEXTURE_DEFS.slice(first, TEXTURE_DEFS.findIndex((t) => t.name === 'spore_blossom') + 1).map((t) => t.name);
  assert.ok(mine.length <= 110, `${mine.length} texturas nuevas`);
  for (const name of ['kelp', 'spore_blossom', 'dead_horn_coral_fan', 'sweet_berry_bush_stage3', 'pitcher_plant_top']) assert.ok(mine.includes(name), name);
  for (const name of mine) assert.ok(Object.prototype.hasOwnProperty.call(OCEAN_GENERATORS, name), `${name} sin generador`);
});

test('colocar: algas y plantas marinas en el agua, gorgonias de pared, pepinos y plantas altas', () => {
  const w = mapWorld((_x, y) => (y <= 0 ? SAND : y <= 5 ? WATER : AIR));
  // Alga y planta marina: sólo con agua.
  assert.deepEqual(planPlacement(w.get, onTop(0, 1, 0, SAND), KELP, 0), [[0, 1, 0, KELP_TOP]]);
  assert.deepEqual(planPlacement(w.get, onTop(0, 1, 0, SAND), SEAGRASS, 0), [[0, 1, 0, SEAGRASS_SHORT]]);
  const dry = mapWorld((_x, y) => (y <= 0 ? SAND : AIR));
  assert.equal(planPlacement(dry.get, onTop(0, 1, 0, SAND), KELP, 0), null, 'el alga no va en seco');
  assert.equal(planPlacement(dry.get, onTop(0, 1, 0, SAND), SEAGRASS, 0), null);
  // Alga sobre otra alga.
  w.set(0, 1, 0, KELP_TOP);
  assert.deepEqual(planPlacement(w.get, onTop(0, 2, 0, KELP_TOP), KELP, 0), [[0, 2, 0, KELP_TOP]]);
  // Coral y gorgonia: anegados en el agua, secos fuera.
  const fan = CORALS.bubble.fan;
  assert.deepEqual(planPlacement(w.get, onTop(3, 1, 3, SAND), fan, 0), [[3, 1, 3, stateOf(fan, { water: 1 })]]);
  assert.deepEqual(planPlacement(dry.get, onTop(3, 1, 3, SAND), fan, 0), [[3, 1, 3, fan]]);
  // Gorgonia contra el lateral de un bloque: de pared, apuntando hacia fuera (aquí al este).
  w.set(5, 2, 5, STONE);
  const side: PlaceHit = { x: 5, y: 2, z: 5, nx: 1, ny: 0, nz: 0, px: 6, py: 2.5, pz: 5.5, id: STONE };
  assert.deepEqual(planPlacement(w.get, side, fan, 0), [[6, 2, 5, stateOf(CORALS.bubble.wallFan, { water: 1, facing: 1 })]]);
  // Pepinos: se apilan hasta 4.
  const p1 = seaPickleBlock(1, true);
  assert.deepEqual(planPlacement(w.get, onTop(7, 1, 7, SAND), SEA_PICKLE, 0), [[7, 1, 7, p1]]);
  w.set(7, 1, 7, p1);
  const onPickle: PlaceHit = { x: 7, y: 1, z: 7, nx: 0, ny: 1, nz: 0, px: 7.5, py: 1.4, pz: 7.5, id: p1 };
  assert.deepEqual(planPlacement(w.get, onPickle, SEA_PICKLE, 0), [[7, 1, 7, seaPickleBlock(2, true)]]);
  w.set(7, 1, 7, seaPickleBlock(4, true));
  assert.equal(planPlacement(w.get, { ...onPickle, id: seaPickleBlock(4, true) }, SEA_PICKLE, 0), null);
  // Flores altas: dos celdas, y hace falta sitio encima.
  const land = mapWorld((_x, y) => (y <= 0 ? GRASS : AIR));
  for (const f of [SUNFLOWER, LILAC, ROSE_BUSH, PEONY, PITCHER_PLANT, TALL_GRASS, LARGE_FERN, SMALL_DRIPLEAF]) {
    assert.deepEqual(planPlacement(land.get, onTop(0, 1, 0, GRASS), f, 0), [[0, 1, 0, f], [0, 2, 0, f + 1]], BLOCKS[f].key);
  }
  land.set(0, 2, 0, STONE);
  assert.equal(planPlacement(land.get, onTop(0, 1, 0, GRASS), SUNFLOWER, 0), null, 'sin sitio encima');
  // Bayas dulces en la hierba, no en la piedra.
  assert.deepEqual(planPlacement(land.get, onTop(2, 1, 2, GRASS), SWEET_BERRY_BUSH, 0), [[2, 1, 2, SWEET_BERRY_BUSH]]);
  const rock = mapWorld((_x, y) => (y <= 0 ? STONE : AIR));
  assert.equal(planPlacement(rock.get, onTop(2, 1, 2, STONE), SWEET_BERRY_BUSH, 0), null);
  // Raíces y flor de esporas bajo un techo; liquen pegado al bloque golpeado.
  rock.set(0, 10, 0, STONE);
  const under: PlaceHit = { x: 0, y: 10, z: 0, nx: 0, ny: -1, nz: 0, px: 0.5, py: 10, pz: 0.5, id: STONE };
  assert.deepEqual(planPlacement(rock.get, under, SPORE_BLOSSOM, 0), [[0, 9, 0, SPORE_BLOSSOM]]);
  assert.deepEqual(planPlacement(rock.get, under, HANGING_ROOTS, 0), [[0, 9, 0, HANGING_ROOTS]]);
  assert.equal(planPlacement(rock.get, onTop(0, 11, 0, STONE), SPORE_BLOSSOM, 0), null);
  assert.deepEqual(planPlacement(rock.get, under, GLOW_LICHEN, 0), [[0, 9, 0, stateOf(GLOW_LICHEN, { face: 4 })]]);
  const west: PlaceHit = { x: 0, y: 10, z: 0, nx: -1, ny: 0, nz: 0, px: 0, py: 10.5, pz: 0.5, id: STONE };
  assert.deepEqual(planPlacement(rock.get, west, GLOW_LICHEN, 0), [[-1, 10, 0, stateOf(GLOW_LICHEN, { face: 1 })]]);
  // Plantaforma grande sobre otra: la de abajo pasa a tallo.
  rock.set(4, 1, 4, BIG_DRIPLEAF);
  assert.deepEqual(planPlacement(rock.get, onTop(4, 2, 4, BIG_DRIPLEAF), BIG_DRIPLEAF, 0), [[4, 1, 4, BIG_DRIPLEAF_STEM], [4, 2, 4, BIG_DRIPLEAF]]);
});

test('botín, recetas, horno, cortapiedras y compostador', () => {
  const pick = TOOLS.wooden.pickaxe;
  assert.deepEqual(blockDrops(CORALS.horn.block, pick), [{ id: DEAD_CORALS.horn.block, count: 1 }], 'bloque de coral → muerto');
  assert.deepEqual(blockDrops(CORALS.horn.block, 0), [], 'hace falta pico');
  assert.deepEqual(blockDrops(stateOf(CORALS.horn.fan, { water: 1 }), 0), [], 'sin toque de seda, las gorgonias no se sueltan');
  assert.deepEqual(blockDrops(KELP_STEM, 0), [{ id: KELP, count: 1 }]);
  assert.deepEqual(blockDrops(SEAGRASS_SHORT, 0), [], 'planta marina: sólo con tijeras');
  assert.deepEqual(blockDrops(SEAGRASS_SHORT, SHEARS), [{ id: SEAGRASS, count: 1 }]);
  assert.deepEqual(blockDrops(seaPickleBlock(3, true), 0), [{ id: SEA_PICKLE, count: 3 }]);
  assert.deepEqual(blockDrops(SUNFLOWER, 0), [{ id: SUNFLOWER, count: 1 }]);
  assert.deepEqual(blockDrops(SUNFLOWER + 1, 0), [], 'la mitad de arriba no suelta nada');
  assert.deepEqual(blockDrops(TALL_GRASS, SHEARS), [{ id: ITEMS.findIndex((i) => i?.key === 'short_grass'), count: 2 }]);
  const ripe = blockDrops(SWEET_BERRY_BUSH + 3, 0)[0];
  assert.ok(ripe.id === SWEET_BERRIES && ripe.count >= 2 && ripe.count <= 3);
  assert.deepEqual(blockDrops(AZALEA_LEAVES, SHEARS), [{ id: AZALEA_LEAVES, count: 1 }]);
  assert.deepEqual(blockDrops(stateOf(GLOW_LICHEN, { face: 2 }), 0), []);
  assert.deepEqual(blockDrops(BIG_DRIPLEAF_STEM, 0), [{ id: BIG_DRIPLEAF, count: 1 }]);
  assert.deepEqual(blockDrops(SPONGE, 0), [{ id: SPONGE, count: 1 }]);

  const D = DRIED_KELP, S = PRISMARINE_SHARD, C = PRISMARINE_CRYSTALS;
  assert.equal(matchRecipe(Array(9).fill(D), 3)?.out.id, DRIED_KELP_BLOCK);
  assert.deepEqual(matchRecipe([DRIED_KELP_BLOCK, 0, 0, 0], 2)?.out, { id: DRIED_KELP, count: 9 });
  assert.equal(matchRecipe([S, S, S, S], 2)?.out.id, PRISMARINE);
  assert.equal(matchRecipe(Array(9).fill(S), 3)?.out.id, PRISMARINE_BRICKS);
  assert.equal(matchRecipe([S, C, S, C, C, C, S, C, S], 3)?.out.id, SEA_LANTERN);
  assert.deepEqual(matchRecipe([PRISMARINE, PRISMARINE, PRISMARINE, 0, 0, 0, 0, 0, 0], 3)?.out, { id: SLABS.prismarine, count: 6 });
  assert.deepEqual(matchRecipe([PRISMARINE, PRISMARINE, PRISMARINE, PRISMARINE, PRISMARINE, PRISMARINE, 0, 0, 0], 3)?.out, { id: PRISMARINE_WALL, count: 6 });
  // Tintes de las flores nuevas: sólo si el objeto de tinte existe (lo añade otra rama).
  const dye = (c: string) => ITEMS.find((i) => i?.key === `${c}_dye`)?.id;
  for (const [flower, color, n] of [[SUNFLOWER, 'yellow', 2], [ROSE_BUSH, 'red', 2], [TORCHFLOWER, 'orange', 1], [PITCHER_PLANT, 'cyan', 2]] as [number, string, number][]) {
    const out = matchRecipe([flower, 0, 0, 0], 2)?.out;
    const id = dye(color);
    if (id === undefined) assert.equal(out, undefined, `sin tinte ${color}, no hay receta`);
    else assert.deepEqual(out, { id, count: n });
  }
  const black = dye('black');
  if (black !== undefined) assert.equal(matchRecipe([S, S, S, S, black, S, S, S, S], 3)?.out.id, DARK_PRISMARINE);
  assert.equal(ITEMS[KELP].smelt, DRIED_KELP);
  assert.equal(ITEMS[WET_SPONGE].smelt, SPONGE);
  assert.ok(ITEMS[DRIED_KELP].food && ITEMS[SWEET_BERRIES].food);
  assert.ok(stonecutterOptions(PRISMARINE).some((s) => s.id === SLABS.prismarine && s.count === 2));
  assert.ok(stonecutterOptions(PRISMARINE).some((s) => s.id === PRISMARINE_WALL));
  assert.ok(stonecutterOptions(DARK_PRISMARINE).some((s) => s.id === STAIRS.dark_prismarine));
  assert.equal(COMPOST_CHANCE[KELP], 0.3);
  assert.equal(COMPOST_CHANCE[SWEET_BERRIES], 0.3);
});

test('servidor: romper plantas anegadas deja agua; las algas crecen y no se las lleva el agua', () => {
  const { h, c, x, y, z } = pool();
  const W = h.gs.world;
  W.setBlock(x, y, z, KELP_TOP);
  // Crece con los ticks aleatorios: la de arriba es la punta y las de abajo, tallo.
  for (let i = 0; i < 300 && W.getBlock(x, y + 2, z) === WATER; i++) nature(h).randomTickAt(x, y + (isWaterlogged(W.getBlock(x, y + 1, z)) ? 1 : 0), z);
  assert.equal(W.getBlock(x, y + 2, z), KELP_TOP, 'el alga ha crecido');
  assert.deepEqual([W.getBlock(x, y, z), W.getBlock(x, y + 1, z)], [KELP_STEM, KELP_STEM]);
  // Quitar un agua de al lado no arrastra el alga (es una fuente).
  W.setBlock(x + 1, y, z, AIR);
  h.tick(40);
  assert.equal(W.getBlock(x, y, z), KELP_STEM);
  // Romper la de abajo: todo el alga cae, queda agua y suelta sus trozos.
  c.send({ t: 'set', x, y, z, b: AIR, tool: 0 });
  h.tick(5);
  assert.deepEqual([W.getBlock(x, y, z), W.getBlock(x, y + 1, z), W.getBlock(x, y + 2, z)], [WATER, WATER, WATER]);
  assert.equal(itemsOf(h, KELP), 3);
  // Planta marina colocada por un jugador (va al agua, anegada) y rota con tijeras.
  c.send({ t: 'place', x: x - 1, y: y - 1, z, n: [0, 1, 0], p: [x - 0.5, y, z + 0.5], item: SEAGRASS, yaw: 0 });
  h.tick(2);
  assert.equal(W.getBlock(x - 1, y, z), SEAGRASS_SHORT);
  clearItems(h);
  c.send({ t: 'set', x: x - 1, y, z, b: AIR, tool: SHEARS });
  h.tick(3);
  assert.equal(W.getBlock(x - 1, y, z), WATER);
  assert.equal(itemsOf(h, SEAGRASS), 1);
});

test('servidor: los corales se mueren fuera del agua y la esponja absorbe', () => {
  const { h, x, y, z } = pool();
  const W = h.gs.world;
  // En el agua siguen vivos; en seco (y un bloque sin agua al lado) se mueren en 3–5 s.
  const wet = stateOf(CORALS.tube.fan, { water: 1 });
  W.setBlock(x - 1, y, z, wet);
  W.setBlock(x, y + 5, z, STONE);
  W.setBlock(x, y + 6, z, CORALS.fire.coral);
  W.setBlock(x + 1, y + 6, z, CORALS.brain.block);
  h.tick(110);
  assert.equal(W.getBlock(x - 1, y, z), wet, 'anegado sigue vivo');
  assert.equal(W.getBlock(x, y + 6, z), DEAD_CORALS.fire.coral, 'el coral en seco se muere');
  assert.equal(W.getBlock(x + 1, y + 6, z), DEAD_CORALS.brain.block, 'el bloque sin agua se muere');
  // Esponja en el centro: se lleva el agua de alrededor y se moja; el coral queda en seco (y muere).
  W.setBlock(x, y + 1, z, SPONGE);
  assert.equal(W.getBlock(x, y + 1, z), WET_SPONGE);
  let water = 0;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy <= 3; dy++) if (BLOCK_FLUID[W.getBlock(x + dx, y + dy, z + dz)] === 1) water++;
  assert.ok(water <= 196 - 65 + 1, `quedan ${water} bloques de agua`);
  assert.equal(stateProps(W.getBlock(x - 1, y, z))?.water, 0, 'la gorgonia se queda en seco');
});

test('servidor: bayas dulces (cosecha, polvo de hueso) y plantaforma que se inclina', () => {
  const { h, c, x, y, z } = pool();
  const W = h.gs.world;
  const gx = x, gy = y + 6, gz = z;
  W.setBlock(gx, gy - 1, gz, GRASS);
  W.setBlock(gx, gy, gz, SWEET_BERRY_BUSH + 3);
  c.pos(gx + 2.5, gy, gz + 0.5);
  h.tick(2);
  c.send({ t: 'use', x: gx, y: gy, z: gz, yaw: 0 });
  h.tick(2);
  assert.equal(W.getBlock(gx, gy, gz), SWEET_BERRY_BUSH + 1, 'cosechado: vuelve a arbusto');
  assert.ok(itemsOf(h, SWEET_BERRIES) >= 2);
  // Polvo de hueso: crece una fase.
  const boneMeal = ITEMS.findIndex((i) => i?.key === 'bone_meal');
  c.send({ t: 'use', x: gx, y: gy, z: gz, yaw: 0, item: boneMeal });
  h.tick(2);
  assert.equal(W.getBlock(gx, gy, gz), SWEET_BERRY_BUSH + 2);
  // Plantaforma grande: al pisarla se inclina y deja caer; al rato vuelve.
  const lx = x + 2, ly = y + 6, lz = z + 2;
  W.setBlock(lx, ly - 1, lz, STONE);
  W.setBlock(lx, ly, lz, BIG_DRIPLEAF);
  c.pos(lx + 0.5, ly + 1, lz + 0.5);
  h.tick(14);
  assert.equal(W.getBlock(lx, ly, lz), BIG_DRIPLEAF + 1, 'inclinándose');
  h.tick(12);
  assert.equal(W.getBlock(lx, ly, lz), BIG_DRIPLEAF + 2, 'inclinada del todo');
  assert.equal(BLOCKS[BIG_DRIPLEAF + 2].solid, false, 'ya no aguanta');
  c.pos(gx + 2.5, gy, gz + 0.5);
  h.tick(110);
  assert.equal(W.getBlock(lx, ly, lz), BIG_DRIPLEAF, 'vuelve a estar plana');
});

test('mallado: una planta anegada lleva agua en su celda', () => {
  const mesher = new Mesher();
  const cols = Array.from({ length: 9 }, () => new Uint16Array(CHUNK_VOLUME));
  cols[4][blockIndex(8, 70, 8)] = KELP_TOP;
  const r = mesher.mesh(cols, 0, 0);
  assert.ok(r.cutout.length > 0, 'la planta');
  assert.equal(r.translucent.length / 8, 6, 'el agua de su celda (6 caras al aire)');
  const plain = Array.from({ length: 9 }, () => new Uint16Array(CHUNK_VOLUME));
  plain[4][blockIndex(8, 70, 8)] = stateOf(CORALS.tube.fan, { water: 0 });
  assert.equal(mesher.mesh(plain, 0, 0).translucent.length, 0, 'la gorgonia seca no lleva agua');
});

test('generación: arrecifes, algas, praderas marinas, flores altas, bayas y cuevas frondosas', () => {
  const gen = new TerrainGenerator(12345);
  const n = new Map<number, number>();
  let wetAboveSea = 0;
  for (let i = 0; i < 400; i++) {
    const { blocks } = gen.generate((i % 20) * 7 - 70, Math.floor(i / 20) * 7 - 70);
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      n.set(b, (n.get(b) ?? 0) + 1);
      if (isWaterlogged(b) && (k >> 8) - 64 >= 63) wetAboveSea++;
    }
  }
  const count = (...ids: number[]) => ids.reduce((s, id) => s + (n.get(id) ?? 0), 0);
  assert.equal(wetAboveSea, 0, 'nada anegado por encima del mar');
  assert.ok(count(...CORAL_TYPES.map((t) => CORALS[t].block)) > 50, 'arrecifes de coral');
  assert.ok(count(...CORAL_TYPES.map((t) => stateOf(CORALS[t].fan, { water: 1 }))) > 20, 'gorgonias');
  assert.ok(count(KELP_TOP) > 50 && count(KELP_STEM) > 500, 'bosques de algas');
  assert.ok(count(SEAGRASS_SHORT) > 500 && count(TALL_SEAGRASS_LOWER) === count(TALL_SEAGRASS_UPPER), 'praderas marinas');
  assert.ok(count(seaPickleBlock(1, true), seaPickleBlock(2, true), seaPickleBlock(3, true), seaPickleBlock(4, true)) > 5, 'pepinos de mar');
  assert.ok(count(SUNFLOWER) > 20 && count(SUNFLOWER) === count(SUNFLOWER + 1), 'girasoles (enteros)');
  assert.ok(count(LILAC, ROSE_BUSH, PEONY) > 10, 'flores altas en los bosques');
  assert.ok(count(TALL_GRASS) > 100 && count(LARGE_FERN) > 20, 'hierba alta y helechos grandes');
  assert.ok(count(SWEET_BERRY_BUSH + 1, SWEET_BERRY_BUSH + 2, SWEET_BERRY_BUSH + 3) > 10, 'bayas dulces en las taigas');
  assert.ok(count(AZALEA_LEAVES) > 50, 'azaleas encima de las cuevas frondosas');
  assert.ok(count(BIG_DRIPLEAF) > 20 && count(SMALL_DRIPLEAF) > 20, 'plantaformas');
  assert.ok(count(SPORE_BLOSSOM) > 10 && count(HANGING_ROOTS) > 100, 'flores de esporas y raíces colgantes');
  assert.ok(count(...[0, 1, 2, 3, 4].map((f) => stateOf(GLOW_LICHEN, { face: f }))) > 50, 'liquen luminoso');
});
