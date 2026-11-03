// Granja: labrar, plantar, crecer, cosechar, humedad y pisoteo; animales (criar, crías, seguir la
// comida, esquilar, ordeñar, huevos); recetas y botín.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, DIRT, GRASS, STONE, WATER, FARMLAND, FENCES, WHEAT_CROP, CARROTS, CAKE, WHITE_WOOL, SUGAR_CANE, HAY_BALE,
  isFarmland, isCrop, isMatureCrop, stateOf, familyBase,
} from '../src/shared/blocks';
import {
  WHEAT_SEEDS, WHEAT, CARROT, BREAD, BONE, BONE_MEAL, SUGAR, EGG, MILK_BUCKET, BUCKET, SHEARS, TOOLS, isValidItem,
  itemSpriteIndex, ITEMS,
} from '../src/shared/items';
import { matchRecipe, CRAFT_REMAINDER } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement } from '../src/shared/placement';
import { MOB_COW, MOB_SHEEP, MOB_CHICKEN, MOB_PIG, ENT_ITEM } from '../src/shared/mobs';
import { GROW_SECONDS } from '../src/shared/sim/entities';
import { MemoryStore } from '../src/shared/sim/store';
import { GameServer } from '../src/shared/sim/GameServer';
import { makeServer, type Client, type Harness } from './harness';

/** Plataforma de hierba a y = 149 (lejos del terreno) con un jugador encima. */
function field(mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(777);
  const c = h.join('Granjera', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(60);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, GRASS);
    // Valla alrededor: los animales no se caen de la plataforma.
    if (Math.abs(dx) === 8 || Math.abs(dz) === 8) W.setBlock(bx + dx, by, bz + dz, FENCES.oak);
  }
  c.pos(bx, by, bz);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);
const clearItems = (h: Harness) => {
  for (const e of [...h.gs.entities.list.values()]) if (e.type === ENT_ITEM) h.gs.entities.list.delete(e.id);
};

test('objetos, recetas y botín de la granja', () => {
  for (const id of [WHEAT_SEEDS, WHEAT, CARROT, BONE_MEAL, EGG, MILK_BUCKET, SUGAR, TOOLS.iron.hoe]) {
    assert.ok(isValidItem(id) && itemSpriteIndex(id) >= 0, `objeto con dibujo: ${ITEMS[id].key}`);
  }
  assert.ok(isValidItem(CAKE) && ITEMS[CAKE].stack === 1, 'la tarta es un objeto que no se apila');
  assert.equal(ITEMS[WHEAT_CROP], undefined, 'los cultivos no son objetos');
  assert.equal(ITEMS[FARMLAND], undefined, 'la tierra de cultivo no es un objeto');

  const S = TOOLS.wooden.pickaxe; void S;
  assert.equal(matchRecipe([WHEAT, WHEAT, WHEAT, 0, 0, 0, 0, 0, 0], 3)?.out.id, BREAD);
  assert.equal(matchRecipe([BONE, 0, 0, 0], 2)?.out.count, 3, 'hueso → 3 de polvo de hueso');
  assert.equal(matchRecipe([SUGAR_CANE, 0, 0, 0], 2)?.out.id, SUGAR);
  assert.equal(matchRecipe(Array(9).fill(WHEAT), 3)?.out.id, HAY_BALE);
  assert.equal(matchRecipe([HAY_BALE, 0, 0, 0], 2)?.out.count, 9);
  const cake = [MILK_BUCKET, MILK_BUCKET, MILK_BUCKET, SUGAR, EGG, SUGAR, WHEAT, WHEAT, WHEAT];
  assert.equal(matchRecipe(cake, 3)?.out.id, CAKE);
  assert.equal(CRAFT_REMAINDER[MILK_BUCKET], BUCKET, 'la tarta devuelve los cubos');
  const P = 5; // tablones de roble
  assert.equal(matchRecipe([P, P, 0, 0, 280 - 280 + ITEMS.findIndex((i) => i?.key === 'stick'), 0, 0, ITEMS.findIndex((i) => i?.key === 'stick'), 0], 3)?.out.id, TOOLS.wooden.hoe);

  const ripe = stateOf(WHEAT_CROP, { age: 7 });
  for (let i = 0; i < 20; i++) {
    const d = blockDrops(ripe, 0);
    const seeds = d.find((s) => s.id === WHEAT_SEEDS)?.count ?? 0;
    assert.ok(d.some((s) => s.id === WHEAT && s.count === 1) && seeds >= 1 && seeds <= 4, 'trigo maduro: trigo y 1–4 semillas');
    const c = blockDrops(stateOf(CARROTS, { age: 7 }), 0)[0];
    assert.ok(c.id === CARROT && c.count >= 2 && c.count <= 5, 'zanahorias maduras: 2–5');
  }
  assert.deepEqual(blockDrops(WHEAT_CROP, 0), [{ id: WHEAT_SEEDS, count: 1 }], 'trigo verde: una semilla');
  assert.deepEqual(blockDrops(FARMLAND + 1, 0), [{ id: DIRT, count: 1 }], 'tierra de cultivo → tierra');
  assert.deepEqual(blockDrops(CAKE, 0), [], 'la tarta no suelta nada');

  // Sólo se planta sobre tierra de cultivo.
  const get = (x: number, y: number) => (y === 0 ? FARMLAND : y < 0 ? STONE : AIR);
  const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 1, pz: 0.5, id: FARMLAND };
  assert.deepEqual(planPlacement(get, hit, WHEAT_CROP, 0), [[0, 1, 0, WHEAT_CROP]]);
  assert.equal(planPlacement(() => GRASS, { ...hit, id: GRASS }, WHEAT_CROP, 0), null, 'en la hierba, no');
});

test('labrar, plantar, crecer, cosechar y pisotear', () => {
  const { h, c, bx, by, bz } = field();
  const W = h.gs.world;
  const hoe = TOOLS.iron.hoe;
  c.send({ t: 'use', x: bx, y: by - 1, z: bz, yaw: 0, item: hoe });
  assert.equal(W.getBlock(bx, by - 1, bz), FARMLAND, 'la azada convierte la hierba en tierra de cultivo (seca)');
  // Con agua cerca se humedece al labrar.
  W.setBlock(bx + 3, by - 1, bz, WATER);
  c.send({ t: 'use', x: bx + 1, y: by - 1, z: bz, yaw: 0, item: hoe });
  assert.equal(W.getBlock(bx + 1, by - 1, bz), FARMLAND + 1, 'junto al agua, húmeda');
  // Con algo encima no se labra.
  W.setBlock(bx + 2, by, bz - 2, STONE);
  c.send({ t: 'use', x: bx + 2, y: by - 1, z: bz - 2, yaw: 0, item: hoe });
  assert.equal(W.getBlock(bx + 2, by - 1, bz - 2), GRASS);

  // Plantar semillas y zanahorias.
  c.send({ t: 'place', x: bx, y: by - 1, z: bz, n: [0, 1, 0], p: [bx + 0.5, by, bz + 0.5], item: WHEAT_CROP, yaw: 0 });
  c.send({ t: 'place', x: bx + 1, y: by - 1, z: bz, n: [0, 1, 0], p: [bx + 1.5, by, bz + 0.5], item: CARROTS, yaw: 0 });
  assert.equal(W.getBlock(bx, by, bz), WHEAT_CROP, 'trigo plantado');
  assert.equal(W.getBlock(bx + 1, by, bz), CARROTS, 'zanahoria plantada');
  c.send({ t: 'place', x: bx + 4, y: by - 1, z: bz + 4, n: [0, 1, 0], p: [bx + 4.5, by, bz + 4.5], item: WHEAT_CROP, yaw: 0 });
  assert.equal(W.getBlock(bx + 4, by, bz + 4), AIR, 'en la hierba no se planta');

  // Polvo de hueso: avanza 2–5 etapas.
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: BONE_MEAL });
  const age = W.getBlock(bx, by, bz) - WHEAT_CROP;
  assert.ok(age >= 2 && age <= 5, `el polvo de hueso hace crecer el trigo (edad ${age})`);

  // Crecimiento natural con ticks aleatorios, a la velocidad de Minecraft (de media ~1 h de juego para
  // un cultivo suelto; la tierra húmeda crece antes). Hasta 3 h simuladas.
  let ripe = false;
  for (let i = 0; i < 10800 && !ripe; i++) {
    h.tick(20);
    ripe = isMatureCrop(W.getBlock(bx, by, bz)) && isMatureCrop(W.getBlock(bx + 1, by, bz));
  }
  assert.ok(ripe, 'el trigo y las zanahorias maduran solos');

  // Cosechar.
  clearItems(h);
  c.send({ t: 'set', x: bx, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(5);
  assert.ok(itemsOf(h, WHEAT) === 1 && itemsOf(h, WHEAT_SEEDS) >= 1, 'cosecha: trigo y semillas');

  // Pisotear la tierra: vuelve a ser tierra y el cultivo de encima se rompe.
  clearItems(h);
  c.send({ t: 'trample', x: bx + 1, y: by - 1, z: bz });
  h.tick(5);
  assert.equal(W.getBlock(bx + 1, by - 1, bz), DIRT);
  assert.equal(W.getBlock(bx + 1, by, bz), AIR);
  assert.ok(itemsOf(h, CARROT) >= 2, 'la zanahoria madura cae al pisotear');

  // La tierra seca y vacía acaba volviendo a ser tierra; la húmeda con cultivo no.
  c.send({ t: 'use', x: bx - 3, y: by - 1, z: bz - 3, yaw: 0, item: hoe });
  W.setBlock(bx + 3, by - 1, bz, GRASS);
  let dried = false;
  for (let i = 0; i < 2000 && !dried; i++) {
    h.tick(20);
    dried = W.getBlock(bx - 3, by - 1, bz - 3) === DIRT;
  }
  assert.ok(dried, 'la tierra de cultivo seca y vacía vuelve a ser tierra');
});

test('animales: criar, crías que crecen, seguir la comida, esquilar, ordeñar y huevos', () => {
  const { h, c, bx, by, bz } = field();
  const E = h.gs.entities;
  const cow1 = E.spawnMob(MOB_COW, bx + 2.5, by, bz + 0.5)!;
  const cow2 = E.spawnMob(MOB_COW, bx + 3.5, by, bz + 0.5)!;
  const q = () => c.conn.take('ires').pop();
  /** Acercarse a una criatura (el servidor no deja interactuar a más de 6 bloques). */
  const near = (e: { x: number; y: number; z: number }) => c.pos(e.x + 1, e.y, e.z);

  // Comida equivocada: no pasa nada.
  near(cow1);
  c.send({ t: 'interact', e: cow1.id, item: CARROT, q: 1 });
  assert.equal(q()?.ok, false);
  near(cow1);
  c.send({ t: 'interact', e: cow1.id, item: WHEAT, q: 2 });
  const r = q();
  assert.ok(r?.ok && r.take === 1, 'el trigo enamora a la vaca y se gasta');
  near(cow1);
  c.send({ t: 'interact', e: cow1.id, item: WHEAT, q: 3 });
  assert.equal(q()?.ok, false, 'ya está enamorada: no come más');
  near(cow2);
  c.send({ t: 'interact', e: cow2.id, item: WHEAT, q: 4 });
  h.tick(200);
  // (Pueden aparecer otros animales sobre la hierba: sólo cuentan las crías.)
  const babies = [...E.list.values()].filter((e) => e.type === MOB_COW && (e.growAge ?? 0) > 0);
  const baby = babies[0];
  assert.equal(babies.length, 1, 'nace un ternero');
  assert.ok(baby && baby.width < 0.6, 'la cría es más pequeña');
  near(cow1);
  c.send({ t: 'interact', e: cow1.id, item: WHEAT, q: 5 });
  assert.equal(q()?.ok, false, 'los padres esperan 5 minutos para volver a criar');

  // La cría come y crece antes; al final es adulta.
  const g0 = baby!.growAge!;
  near(baby!);
  c.send({ t: 'interact', e: baby!.id, item: WHEAT, q: 6 });
  assert.ok(q()?.ok && baby!.growAge! < g0, 'dar de comer a la cría la hace crecer');
  baby!.growAge = 0.1;
  h.tick(5);
  assert.ok(baby!.growAge === 0 && Math.abs(baby!.width - 0.9) < 1e-6, 'la cría se hace adulta');
  assert.ok(g0 <= GROW_SECONDS);

  // Ordeñar: el cubo se cambia por leche; a las crías no.
  near(cow1);
  c.send({ t: 'interact', e: cow1.id, item: BUCKET, q: 7 });
  const milk = q();
  assert.ok(milk?.ok && milk.take === 1 && milk.give?.id === MILK_BUCKET, 'ordeñar da un cubo de leche');

  // Esquilar: suelta 1–3 de lana, queda esquilada y no suelta lana al morir.
  const sheep = E.spawnMob(MOB_SHEEP, bx - 2.5, by, bz + 0.5)!;
  near(sheep);
  c.send({ t: 'interact', e: sheep.id, item: SHEARS, q: 8 });
  const sh = q();
  h.tick(2);
  const wool = itemsOf(h, WHITE_WOOL);
  assert.ok(sh?.ok && sh.wear === 1 && sheep.sheared && wool >= 1 && wool <= 3, `esquilar (${wool} de lana)`);
  near(sheep);
  c.send({ t: 'interact', e: sheep.id, item: SHEARS, q: 9 });
  assert.equal(q()?.ok, false, 'una oveja esquilada no se vuelve a esquilar');
  // Come hierba y le vuelve a crecer la lana.
  // (La oveja deambula: cada segundo se la devuelve a una celda con hierba para que la prueba no
  // dependa de hacia dónde camine.)
  let regrown = false;
  for (let i = 0; i < 400 && !regrown; i++) {
    h.gs.world.setBlock(bx - 3, by - 1, bz, GRASS);
    sheep.x = bx - 2.5; sheep.z = bz + 0.5; sheep.y = by;
    h.tick(20);
    regrown = !sheep.sheared;
  }
  assert.ok(regrown, 'la lana vuelve a crecer comiendo hierba');

  // Seguir al jugador que lleva su comida.
  const pig = E.spawnMob(MOB_PIG, bx + 6.5, by, bz - 5.5)!;
  c.send({ t: 'pos', p: [bx + 0.5, by, bz - 5.5], r: [0, 0], s: 0, h: CARROT });
  const d0 = Math.hypot(pig.x - (bx + 0.5), pig.z - (bz - 5.5));
  h.tick(100);
  const d1 = Math.hypot(pig.x - (bx + 0.5), pig.z - (bz - 5.5));
  assert.ok(d1 < d0 - 2 && d1 < 3.5, `el cerdo sigue la zanahoria (${d0.toFixed(1)} → ${d1.toFixed(1)})`);

  // Gallina: pone un huevo.
  const hen = E.spawnMob(MOB_CHICKEN, bx - 4.5, by, bz - 4.5)!;
  hen.eggTimer = 0.2;
  clearItems(h);
  h.tick(10);
  assert.equal(itemsOf(h, EGG), 1, 'la gallina pone un huevo');

  // Las crías y la lana se guardan con el mundo.
  const calf = E.spawnMob(MOB_COW, bx + 5.5, by, bz + 5.5, true)!;
  sheep.sheared = true;
  const saved = E.serializePassive();
  const store = new MemoryStore();
  store.setMeta('mobs', saved);
  const gs2 = new GameServer(store, { now: () => h.clock.now });
  const back = [...gs2.entities.list.values()];
  assert.ok(back.some((e) => e.type === MOB_COW && (e.growAge ?? 0) > 0), 'la cría sigue siendo cría al volver');
  assert.ok(back.some((e) => e.type === MOB_SHEEP && e.sheared), 'la oveja sigue esquilada');
  void calf;
  void familyBase;
  void isCrop;
});
