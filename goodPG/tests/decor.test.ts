// Fase 6.5 (decoración): comida nueva, macetas, faroles, cadenas, barrotes, campanas, andamios,
// vasijas, cuadros y marcos, huevos generadores, catalejo y reloj (registro, recetas, colocación,
// servidor y persistencia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, OAK_SAPLING, POPPY, FERN, CACTUS, RED_MUSHROOM, BROWN_MUSHROOM, SHORT_GRASS, SUGAR_CANE, FLOWERS, TORCH,
  FLOWER_POT, LANTERN, IRON_CHAIN, IRON_BARS, BELL, SCAFFOLDING, DECORATED_POT, PAINTING_CELLS, ITEM_FRAME_MODEL,
  DECOR_INVENTORY, INVENTORY_ORDER, BLOCKS, BLOCK_EMISSION, BLOCK_SOLID, stateOf, stateProps, familyBase,
  pottablePlants, isPottable, potWith, pottedPlant, blockSupported, isScaffolding, SCAFFOLD_MAX_DISTANCE, BELL_CEILING,
  CHAIN_AXIS_X, CHAIN_AXIS_Y,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, isValidItem, itemSpriteIndex, BOWL, IRON_NUGGET, GOLD_NUGGET, COCOA_BEANS, COOKIE, MUSHROOM_STEW,
  RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW, GOLDEN_CARROT, GLISTERING_MELON_SLICE, SPYGLASS, CLOCK, PAINTING, ITEM_FRAME,
  SPAWN_EGGS, spawnEggMob, IRON_INGOT, GOLD_INGOT, WHEAT, CARROT, MELON_SLICE, AMETHYST_SHARD, COPPER_INGOT, REDSTONE, STICK,
  LEATHER, BRICK, STRING, BEETROOT, COOKED_RABBIT, BAKED_POTATO, ITEM_COUNT, PLACEABLE_BLOCKS,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { MOBS, MOB_TYPES, MOB_PIG, ENT_ITEM } from '../src/shared/mobs';
import { SPAWN_EGG_DEFS, NO_SPAWN_EGG } from '../src/shared/spawnEggs';
import { SUSPICIOUS_FLOWERS, stewEffect, EATEN_REMAINDER } from '../src/shared/decorFood';
import { EFFECT_NIGHT_VISION, EFFECT_POISON } from '../src/shared/effects';
import { ENT_PAINTING, ENT_FRAME, PAINTINGS, PAINTING_TEXTURES, hangingCells, hangingBox, hangingYaw, facingOfYaw } from '../src/shared/paintings';
import { TEXTURE_DEFS, TEXTURE_COUNT, textureLayer } from '../src/shared/textureDefs';
import { DECOR_GENERATORS } from '../src/client/textures/genDecor';
import { DECOR_SPRITES } from '../src/client/textures/decorSprites';
import { generateItemSprites } from '../src/client/textures/itemSprites';
import { MemoryStore } from '../src/shared/sim/store';
import { GameServer } from '../src/shared/sim/GameServer';
import { makeServer, type Client, type Harness } from './harness';
import { WHITE_WOOL, BAMBOO } from '../src/shared/blocks';
import { scaffoldFloor, scaffoldClimb, SCAFFOLD_CLIMB_SPEED, SCAFFOLD_DESCEND_SPEED } from '../src/shared/scaffoldPhysics';

// ------------------------------------------------------------------ registro

test('decoración: bloques, objetos, texturas y sprites registrados', () => {
  for (const b of DECOR_INVENTORY) {
    assert.ok(isValidItem(b) && ITEMS[b].block === b, `objeto de bloque: ${BLOCKS[b].key}`);
    assert.ok(INVENTORY_ORDER.includes(b), `en el inventario creativo: ${BLOCKS[b].key}`);
    assert.ok(PLACEABLE_BLOCKS.has(b), `se puede colocar: ${BLOCKS[b].key}`);
  }
  assert.equal(BLOCKS[FLOWER_POT].name, 'Maceta');
  assert.equal(BLOCKS[LANTERN].name, 'Farol');
  assert.equal(BLOCK_EMISSION[LANTERN], 15, 'el farol da luz');
  assert.equal(BLOCK_EMISSION[stateOf(LANTERN, { hanging: 1 })], 15, 'también colgando');
  assert.equal(BLOCK_SOLID[SCAFFOLDING], 0, 'y se atraviesa');
  // Los modelos de cuadros y marcos no son objetos ni se colocan.
  for (const id of [...PAINTING_CELLS.flat(), ITEM_FRAME_MODEL]) {
    assert.equal(ITEMS[id], undefined, `sin objeto: ${BLOCKS[id].key}`);
    assert.ok(!PLACEABLE_BLOCKS.has(id));
  }
  const newItems = [BOWL, IRON_NUGGET, GOLD_NUGGET, COCOA_BEANS, COOKIE, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW,
    GOLDEN_CARROT, GLISTERING_MELON_SLICE, SPYGLASS, CLOCK, PAINTING, ITEM_FRAME, ...Object.values(SPAWN_EGGS)];
  for (const id of newItems) {
    assert.ok(isValidItem(id) && itemSpriteIndex(id) >= 0, `objeto con sprite: ${ITEMS[id]?.key}`);
    assert.ok(DECOR_SPRITES[ITEMS[id].sprite!], `sprite dibujado: ${ITEMS[id].key}`);
    assert.ok(CREATIVE_ITEMS.includes(id), `en el inventario creativo: ${ITEMS[id].key}`);
  }
  assert.ok(ITEM_COUNT <= 1024);
  // Texturas: todas con generador y dentro del límite de 1024 capas.
  const mine = TEXTURE_DEFS.slice(textureLayer('flower_pot'), textureLayer('tube_coral_block')).map((d) => d.name);
  assert.equal(mine.length, 14 + PAINTING_TEXTURES.length);
  for (const n of mine) assert.ok(DECOR_GENERATORS[n], `textura con generador: ${n}`);
  assert.ok(TEXTURE_COUNT <= 1024);
  const sprites = generateItemSprites();
  assert.ok(sprites.count > 0);
});

test('huevos generadores: uno por criatura, con su nombre', () => {
  const keys = new Set(SPAWN_EGG_DEFS.map((e) => e.mob));
  assert.equal(keys.size, SPAWN_EGG_DEFS.length, 'sin huevos repetidos');
  for (const t of MOB_TYPES) {
    const m = MOBS[t];
    if (NO_SPAWN_EGG.has(m.key)) continue;
    const egg = SPAWN_EGGS[m.key];
    assert.ok(egg, `huevo de ${m.key}`);
    assert.equal(ITEMS[egg].name, `Huevo generador de ${m.name.toLowerCase()}`);
    assert.equal(spawnEggMob(egg), m.key);
  }
  for (const k of keys) assert.ok(MOB_TYPES.some((t) => MOBS[t].key === k), `criatura existente: ${k}`);
  assert.equal(spawnEggMob(STICK), '');
});

// ------------------------------------------------------------------ comida y recetas

const grid = (...ids: number[]) => [...ids, ...new Array(9 - ids.length).fill(0)];

test('comida nueva: valores de Minecraft y recetas', () => {
  assert.deepEqual([ITEMS[COOKIE].food!.hunger, ITEMS[COOKIE].food!.saturation], [2, 0.4]);
  assert.deepEqual([ITEMS[RABBIT_STEW].food!.hunger, ITEMS[RABBIT_STEW].food!.saturation], [10, 12]);
  assert.deepEqual([ITEMS[GOLDEN_CARROT].food!.hunger, ITEMS[GOLDEN_CARROT].food!.saturation], [6, 14.4]);
  for (const s of [MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW]) {
    assert.equal(ITEMS[s].stack, 1, `${ITEMS[s].key} no se apila`);
    assert.equal(EATEN_REMAINDER[s], BOWL, `${ITEMS[s].key} devuelve el cuenco`);
  }
  assert.equal(ITEMS[GLISTERING_MELON_SLICE].food, undefined, 'la sandía reluciente no se come');

  const P = BLOCKS.findIndex((b) => b?.key === 'oak_planks');
  assert.deepEqual(matchRecipe(grid(P, 0, P, 0, P, 0, 0, 0, 0), 3)?.out, { id: BOWL, count: 4 });
  assert.deepEqual(matchRecipe(grid(WHEAT, COCOA_BEANS, WHEAT), 3)?.out, { id: COOKIE, count: 8 });
  assert.equal(matchRecipe([RED_MUSHROOM, BOWL, BROWN_MUSHROOM, 0], 2)?.out.id, MUSHROOM_STEW);
  assert.equal(matchRecipe(grid(COOKED_RABBIT, CARROT, BAKED_POTATO, RED_MUSHROOM, BOWL), 3)?.out.id, RABBIT_STEW);
  assert.equal(matchRecipe(grid(BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BEETROOT, BOWL), 3)?.out.id, BEETROOT_SOUP);
  const N = GOLD_NUGGET;
  assert.equal(matchRecipe([N, N, N, N, CARROT, N, N, N, N], 3)?.out.id, GOLDEN_CARROT);
  assert.equal(matchRecipe([N, N, N, N, MELON_SLICE, N, N, N, N], 3)?.out.id, GLISTERING_MELON_SLICE);
  assert.deepEqual(matchRecipe([IRON_INGOT, 0, 0, 0], 2)?.out, { id: IRON_NUGGET, count: 9 });
  assert.equal(matchRecipe(new Array(9).fill(IRON_NUGGET), 3)?.out.id, IRON_INGOT);
  assert.equal(matchRecipe(new Array(9).fill(GOLD_NUGGET), 3)?.out.id, GOLD_INGOT);
  // Estofado sospechoso: la flor queda en el desgaste de la pila y decide el efecto.
  const poppy = matchRecipe([RED_MUSHROOM, BROWN_MUSHROOM, BOWL, POPPY], 2)!.out;
  assert.equal(poppy.id, SUSPICIOUS_STEW);
  assert.deepEqual(stewEffect(poppy.dmg), [EFFECT_NIGHT_VISION, 5]);
  const lily = matchRecipe([RED_MUSHROOM, BROWN_MUSHROOM, BOWL, FLOWERS.lily_of_the_valley], 2)!.out;
  assert.deepEqual(stewEffect(lily.dmg), [EFFECT_POISON, 11]);
  assert.equal(SUSPICIOUS_FLOWERS.length, 14); // Fase 7 (efectos): y la anflorcha; 8.7: la rosa marchita
  assert.equal(stewEffect(undefined), null);
});

test('recetas de la decoración y los objetos', () => {
  const I = IRON_NUGGET, S = STICK, B = BRICK;
  assert.equal(matchRecipe(grid(B, 0, B, 0, B, 0), 3)?.out.id, FLOWER_POT);
  assert.equal(matchRecipe([I, I, I, I, TORCH, I, I, I, I], 3)?.out.id, LANTERN);
  assert.equal(matchRecipe(grid(0, I, 0, 0, IRON_INGOT, 0, 0, I, 0), 3)?.out.id, IRON_CHAIN);
  assert.deepEqual(matchRecipe(grid(IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT), 3)?.out, { id: IRON_BARS, count: 16 });
  assert.deepEqual(matchRecipe([BAMBOO, STRING, BAMBOO, BAMBOO, 0, BAMBOO, BAMBOO, 0, BAMBOO], 3)?.out, { id: SCAFFOLDING, count: 6 }); // de bambú
  assert.equal(matchRecipe([0, B, 0, B, 0, B, 0, B, 0], 3)?.out.id, DECORATED_POT);
  assert.equal(matchRecipe([S, S, S, S, WHITE_WOOL, S, S, S, S], 3)?.out.id, PAINTING);
  assert.equal(matchRecipe([S, S, S, S, LEATHER, S, S, S, S], 3)?.out.id, ITEM_FRAME);
  assert.equal(matchRecipe(grid(0, AMETHYST_SHARD, 0, 0, COPPER_INGOT, 0, 0, COPPER_INGOT, 0), 3)?.out.id, SPYGLASS);
  assert.equal(matchRecipe([0, GOLD_INGOT, 0, GOLD_INGOT, REDSTONE, GOLD_INGOT, 0, GOLD_INGOT, 0], 3)?.out.id, CLOCK);
});

// ------------------------------------------------------------------ macetas

test('maceta: cualquier planta en cruz (brotes, flores, champiñones, helechos) y el cactus', () => {
  const plants = pottablePlants();
  for (const p of [OAK_SAPLING, POPPY, FERN, CACTUS, RED_MUSHROOM, BROWN_MUSHROOM, FLOWERS.allium]) {
    assert.ok(isPottable(p), `va en maceta: ${BLOCKS[p].key}`);
    const pot = potWith(p);
    assert.equal(familyBase(pot), FLOWER_POT);
    assert.equal(pottedPlant(pot), p);
    assert.deepEqual(blockDrops(pot, 0), [{ id: FLOWER_POT, count: 1 }, { id: p, count: 1 }], 'suelta maceta y planta');
  }
  for (const p of [SHORT_GRASS, SUGAR_CANE, STONE]) assert.ok(!isPottable(p), `no va en maceta: ${BLOCKS[p].key}`);
  // El estado de cada planta es su puesto en la lista (por id): se guarda en el mundo.
  assert.ok(plants.every((p, i) => i === 0 || p > plants[i - 1]));
  assert.equal(stateProps(potWith(plants[0]))!.plant, 1);
  assert.deepEqual(blockDrops(FLOWER_POT, 0), [{ id: FLOWER_POT, count: 1 }]);
  assert.equal(pottedPlant(FLOWER_POT), 0);
});

// ------------------------------------------------------------------ colocación

/** Mundo de mentira: un mapa de celdas (lo demás, aire). */
function fakeWorld(cells: [number, number, number, number][]) {
  const m = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  return {
    get: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? AIR,
    set: (x: number, y: number, z: number, id: number) => m.set(`${x},${y},${z}`, id),
  };
}
const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: x + 0.5 + nx * 0.5, py: y + 0.5 + ny * 0.5, pz: z + 0.5 + nz * 0.5, id });

test('colocar faroles, campanas, cadenas y andamios', () => {
  const w = fakeWorld([[0, 0, 0, STONE], [0, 5, 0, STONE]]);
  // Farol sobre el suelo: de pie; bajo el techo: colgando.
  assert.deepEqual(planPlacement(w.get, hitOn(0, 0, 0, 0, 1, 0, STONE), LANTERN, 0), [[0, 1, 0, LANTERN]]);
  assert.deepEqual(planPlacement(w.get, hitOn(0, 5, 0, 0, -1, 0, STONE), LANTERN, 0), [[0, 4, 0, stateOf(LANTERN, { hanging: 1 })]]);
  const hanging = stateOf(LANTERN, { hanging: 1 });
  assert.ok(blockSupported(hanging, (dx, dy, dz) => w.get(dx, 4 + dy, dz)));
  assert.ok(!blockSupported(hanging, (dx, dy, dz) => w.get(dx, 2 + dy, dz)), 'sin techo no cuelga');
  // Campana del techo.
  const bell = planPlacement(w.get, hitOn(0, 5, 0, 0, -1, 0, STONE), BELL, 0)!;
  assert.equal(stateProps(bell[0][3])!.attach, BELL_CEILING);
  // Cadena en el eje de la cara.
  assert.equal(stateProps(planPlacement(w.get, hitOn(0, 0, 0, 1, 0, 0, STONE), IRON_CHAIN, 0)![0][3])!.axis, CHAIN_AXIS_X);
  assert.equal(stateProps(planPlacement(w.get, hitOn(0, 0, 0, 0, 1, 0, STONE), IRON_CHAIN, 0)![0][3])!.axis, CHAIN_AXIS_Y);

  // Andamio: en voladizo hasta SCAFFOLD_MAX_DISTANCE bloques desde el apoyado en el suelo.
  const g = fakeWorld([]);
  for (let x = -2; x <= 12; x++) g.set(x, 0, 0, STONE);
  g.set(0, 1, 0, SCAFFOLDING);
  g.set(0, 2, 0, SCAFFOLDING);
  for (let x = 0; x < 10; x++) g.set(x + 1, 0, 0, AIR); // quitar el suelo a la derecha
  let placed = 0;
  for (let x = 1; x <= 10; x++) {
    const e = planPlacement(g.get, hitOn(x - 1, 2, 0, 1, 0, 0, SCAFFOLDING), SCAFFOLDING, 0);
    if (!e) break;
    g.set(e[0][0], e[0][1], e[0][2], e[0][3]);
    placed++;
  }
  assert.equal(placed, SCAFFOLD_MAX_DISTANCE, 'voladizo máximo');
  // Clic en la cara de abajo de la torre: un andamio más arriba del todo.
  const up = planPlacement(g.get, hitOn(0, 2, 0, 0, -1, 0, SCAFFOLDING), SCAFFOLDING, 0)!;
  assert.deepEqual(up, [[0, 3, 0, SCAFFOLDING]]);
  assert.ok(isScaffolding(up[0][3]));
});

// ------------------------------------------------------------------ servidor

function platform(mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(4242);
  const c = h.join('Decoradora', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: macetas, campana, farol colgado y andamios que se caen', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  // Maceta: se planta y se saca la planta.
  W.setBlock(bx + 1, by, bz, FLOWER_POT);
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0, item: OAK_SAPLING });
  assert.equal(pottedPlant(W.getBlock(bx + 1, by, bz)), OAK_SAPLING, 'brote plantado');
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0, item: POPPY });
  assert.equal(pottedPlant(W.getBlock(bx + 1, by, bz)), OAK_SAPLING, 'no se cambia la planta');
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0 });
  assert.equal(W.getBlock(bx + 1, by, bz), FLOWER_POT, 'maceta vacía otra vez');
  assert.equal(itemsOf(h, OAK_SAPLING), 1, 'el brote sale hacia el jugador');
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0, item: STONE });
  assert.equal(W.getBlock(bx + 1, by, bz), FLOWER_POT, 'la piedra no se planta');

  // Campana: suena para los que están cerca.
  W.setBlock(bx - 1, by, bz, BELL);
  c.conn.msgs = [];
  c.send({ t: 'use', x: bx - 1, y: by, z: bz, yaw: 0 });
  assert.ok(c.conn.take('fx').some((m) => m.k === 'bell'), 'tañido de la campana');

  // Farol colgado de un techo: si se quita el techo, se cae (y suelta el farol).
  W.setBlock(bx + 2, by + 3, bz + 2, STONE);
  c.send({ t: 'place', x: bx + 2, y: by + 3, z: bz + 2, n: [0, -1, 0], p: [bx + 2.5, by + 3, bz + 2.5], item: LANTERN, yaw: 0 });
  assert.equal(W.getBlock(bx + 2, by + 2, bz + 2), stateOf(LANTERN, { hanging: 1 }), 'farol colgado');
  W.setBlock(bx + 2, by + 3, bz + 2, AIR);
  assert.equal(W.getBlock(bx + 2, by + 2, bz + 2), AIR, 'se cae sin techo');
  assert.equal(itemsOf(h, LANTERN), 1);

  // Andamios: una torre con un voladizo; al quitar la base se cae todo.
  const ax = bx - 3, az = bz - 3;
  for (let y = by; y < by + 3; y++) W.setBlock(ax, y, az, SCAFFOLDING);
  for (let k = 1; k <= 3; k++) W.setBlock(ax + k, by + 2, az, SCAFFOLDING);
  assert.ok(isScaffolding(W.getBlock(ax + 3, by + 2, az)));
  W.setBlock(ax, by - 1, az, AIR);
  for (let y = by; y < by + 3; y++) assert.equal(W.getBlock(ax, y, az), AIR, 'la torre cae');
  for (let k = 1; k <= 3; k++) assert.equal(W.getBlock(ax + k, by + 2, az), AIR, 'y su voladizo');
  assert.equal(itemsOf(h, SCAFFOLDING), 6);
});

test('servidor: huevos generadores crean la criatura encima del bloque', () => {
  const { h, c, bx, by, bz } = platform('c');
  const before = [...h.gs.entities.list.values()].filter((e) => e.type === MOB_PIG).length;
  c.send({ t: 'use', x: bx + 1, y: by - 1, z: bz + 1, yaw: 0, item: SPAWN_EGGS.pig });
  const pigs = [...h.gs.entities.list.values()].filter((e) => e.type === MOB_PIG);
  assert.equal(pigs.length, before + 1, 'aparece un cerdo');
  const pig = pigs.find((e) => Math.floor(e.x) === bx + 1 && Math.floor(e.z) === bz + 1)!;
  assert.ok(pig && Math.floor(pig.y) === by, 'de pie encima del bloque');
});

test('cuadros y marcos: se cuelgan, se usan, se descuelgan, se caen y se guardan', () => {
  const store = new MemoryStore();
  const h = makeServer(4243, store);
  const c = h.join('Pintora', 's');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  // Pared de 3×3 al norte (da hacia el sur, f = 2) y un pilar suelto para el marco.
  for (let dx = -1; dx <= 1; dx++) for (let y = by; y < by + 3; y++) W.setBlock(bx + dx, y, bz - 3, STONE);
  W.setBlock(bx + 4, by + 1, bz - 3, STONE);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];

  c.send({ t: 'hang', x: bx, y: by + 1, z: bz - 3, f: 2, item: PAINTING, q: 7 });
  const r1 = c.conn.take('ires').find((m) => m.q === 7);
  assert.ok(r1?.ok && r1.take === 1, 'cuadro colgado (se gasta)');
  const paintings = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_PAINTING);
  assert.equal(paintings.length, 1);
  const p = paintings[0];
  assert.equal(PAINTINGS[p.variant!].w * PAINTINGS[p.variant!].h, 4, 'el más grande que cabe (2×2)');
  assert.equal(facingOfYaw(p.yaw), 2);
  assert.ok(Math.abs(p.z - (bz - 2 + 1 / 32)) < 1e-6, 'pegado a la pared');
  // Otro cuadro en el mismo sitio no cabe.
  c.send({ t: 'hang', x: bx, y: by + 1, z: bz - 3, f: 2, item: PAINTING, q: 8 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 8)?.ok, false);

  // Marco: recibe un objeto, lo gira y un golpe lo saca.
  c.send({ t: 'hang', x: bx + 4, y: by + 1, z: bz - 3, f: 2, item: ITEM_FRAME, q: 9 });
  assert.ok(c.conn.take('ires').find((m) => m.q === 9)?.ok);
  let frame = [...h.gs.entities.list.values()].find((e) => e.type === ENT_FRAME)!;
  assert.ok(frame && (frame.variant ?? 0) === 0);
  c.send({ t: 'frame', e: frame.id, item: CLOCK, q: 10 });
  assert.ok(c.conn.take('ires').find((m) => m.q === 10)?.take === 1, 'el reloj entra en el marco');
  frame = [...h.gs.entities.list.values()].find((e) => e.type === ENT_FRAME)!;
  assert.equal(frame.variant, CLOCK);
  c.send({ t: 'frame', e: frame.id, item: 0, q: 11 });
  assert.ok(Math.abs(frame.pitch - Math.PI / 4) < 1e-6, 'girado 45°');
  h.tick(1);
  c.send({ t: 'attack', e: frame.id, item: 0 });
  assert.equal(itemsOf(h, CLOCK), 1, 'el golpe saca el reloj');
  frame = [...h.gs.entities.list.values()].find((e) => e.type === ENT_FRAME)!;
  assert.ok(frame && !frame.variant, 'el marco sigue, vacío');

  // Se guarda y se recupera al volver a abrir el mundo.
  h.gs.flush(true);
  const gs2 = new GameServer(store, { seed: 4243, now: () => h.clock.now });
  const again = [...gs2.entities.list.values()].filter((e) => e.type === ENT_PAINTING || e.type === ENT_FRAME);
  assert.equal(again.length, 2, 'cuadro y marco guardados');
  assert.equal(again.find((e) => e.type === ENT_PAINTING)!.variant, p.variant);

  // Sin pared, el cuadro se cae y suelta el objeto.
  for (let dx = -1; dx <= 1; dx++) for (let y = by; y < by + 3; y++) W.setBlock(bx + dx, y, bz - 3, AIR);
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_PAINTING).length, 0);
  assert.equal(itemsOf(h, PAINTING), 1);
  // Un golpe al marco vacío lo descuelga.
  h.tick(1);
  c.send({ t: 'attack', e: frame.id, item: 0 });
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_FRAME).length, 0);
  assert.equal(itemsOf(h, ITEM_FRAME), 1);
});

test('cuadros: geometría de celdas y caja de selección', () => {
  // Cuadro de 2×1 que da al este: quien lo mira está al este mirando al oeste; su derecha es el norte (−Z).
  const cells = hangingCells(0, 0, 0, 1, 2, 1);
  assert.deepEqual(cells.map((c) => [c.x, c.y, c.z, c.wx, c.wz, c.cx]), [[0, 0, 0, -1, 0, 0], [0, 0, -1, -1, -1, 1]]);
  const b = hangingBox(ENT_PAINTING, 4, 0, 0, 0, hangingYaw(1));
  assert.ok(Math.abs(b[5] - b[2] - 2) < 1e-9 && Math.abs(b[3] - b[0] - 1 / 16) < 1e-9, 'caja fina a lo largo de la pared');
});

test('andamios: de pie encima, se sube saltando y se baja agachado', () => {
  const w = fakeWorld([[0, 0, 0, SCAFFOLDING], [0, 1, 0, SCAFFOLDING]]);
  const r = { getBlock: w.get };
  // Cayendo desde arriba: se para en la cara de arriba del andamio más alto.
  assert.equal(scaffoldFloor(r, 0.5, 0.5, 0.3, 2.0, 1.95), 2);
  assert.equal(scaffoldFloor(r, 0.5, 0.5, 0.3, 2.4, 2.1), null, 'aún no ha llegado');
  assert.equal(scaffoldFloor(r, 3.5, 0.5, 0.3, 2.0, 1.95), null, 'sin andamio debajo');
  // Dentro de la torre: saltando sube, agachado baja y quieto no hace nada (lo sostiene el suelo del andamio).
  assert.equal(scaffoldClimb(r, 0.5, 0.2, 0.5, 0.3, 1.8, true, false), SCAFFOLD_CLIMB_SPEED);
  assert.equal(scaffoldClimb(r, 0.5, 0.2, 0.5, 0.3, 1.8, false, true), -SCAFFOLD_DESCEND_SPEED);
  assert.equal(scaffoldClimb(r, 0.5, 0.2, 0.5, 0.3, 1.8, false, false), null);
  assert.equal(scaffoldClimb(r, 5.5, 0.2, 0.5, 0.3, 1.8, true, false), null, 'fuera del andamio, salto normal');
});
