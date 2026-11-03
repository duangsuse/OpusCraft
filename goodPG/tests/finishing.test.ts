// Fase 6.5 (remate): carteles colgantes, estantería cincelada, anflorcha en maceta, etiqueta, correa,
// saco y soporte para armadura (registro, recetas, colocación, servidor y persistencia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, HANGING_SIGNS, WALL_HANGING_SIGNS, HANGING_SIGN_LOG, CHISELED_BOOKSHELF, TORCHFLOWER, SLABS, WOOD_EXTRAS, NETHER_WOODS,
  IRON_CHAIN, isSign, hangingSignKind, stateOf, stateProps, isPottable, shelfSlotAt, blockSupported, FENCES,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, NAME_TAG, LEAD, BUNDLE, DYED_BUNDLES, ARMOR_STAND, BOOK, STRING, PAPER, IRON_NUGGET,
  LEATHER, STICK, DYES, ARMOR, type ItemStack,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { bundleInsert, bundleTake, bagWeight, BUNDLE_CAPACITY } from '../src/shared/bundles';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { sanitizeStack, cloneStack } from '../src/shared/containers';
import { MOB_PIG, MOB_ZOMBIE, ENT_ITEM } from '../src/shared/mobs';
import { ENT_ARMOR_STAND } from '../src/shared/armorStands';
import { FINISHING_SPRITES } from '../src/client/textures/finishingSprites';
import { FINISHING_GENERATORS } from '../src/client/textures/genFinishing';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer, type Client, type Harness } from './harness';

const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number, px?: number, py?: number, pz?: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: px ?? x + 0.5 + nx * 0.5, py: py ?? y + 0.5 + ny * 0.5, pz: pz ?? z + 0.5 + nz * 0.5, id });

/** Receta 3×3 de ids (0 = vacío). */
const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

test('registro: bloques, objetos, texturas y sprites nuevos', () => {
  // Carteles colgantes de las diez maderas, cada uno con su versión de pared.
  assert.equal(Object.keys(HANGING_SIGNS).length, WOOD_EXTRAS.length + 1 + NETHER_WOODS.length); // bambú y maderas del Nether
  for (const [k, id] of Object.entries(HANGING_SIGNS)) {
    assert.ok(isSign(id) && isSign(WALL_HANGING_SIGNS[k]), `${k}: cuenta como cartel`);
    assert.equal(hangingSignKind(id), 1);
    assert.equal(hangingSignKind(WALL_HANGING_SIGNS[k]), 2);
    assert.ok(ITEMS[id], `${k}: tiene objeto`);
  }
  for (const id of [NAME_TAG, LEAD, BUNDLE, ARMOR_STAND, ...Object.values(DYED_BUNDLES)]) {
    assert.ok(CREATIVE_ITEMS.includes(id), `en el creativo: ${ITEMS[id].key}`);
    assert.ok(itemSpriteIndex(id) >= 0 && FINISHING_SPRITES[ITEMS[id].sprite ?? ITEMS[id].key], `sprite: ${ITEMS[id].key}`);
  }
  assert.equal(ITEMS[BUNDLE].stack, 1);
  for (const t of ['chiseled_bookshelf_empty', 'chiseled_bookshelf_occupied', 'chiseled_bookshelf_top', 'chiseled_bookshelf_side']) {
    assert.ok(FINISHING_GENERATORS[t], `generador: ${t}`);
  }
  // La anflorcha va en maceta.
  assert.ok(isPottable(TORCHFLOWER));
});

test('recetas: carteles colgantes, estantería, correa, etiqueta, saco y soporte', () => {
  const log = HANGING_SIGN_LOG.oak, C = IRON_CHAIN;
  assert.deepEqual(craft([C, 0, C, log, log, log, log, log, log]), { id: HANGING_SIGNS.oak, count: 6 });
  const P = ITEMS.findIndex((it) => it?.key === 'oak_planks'), S = SLABS.oak;
  assert.deepEqual(craft([P, P, P, S, S, S, P, P, P]), { id: CHISELED_BOOKSHELF, count: 1 });
  // Minecraft 26.x: la correa es sólo cuerda y la etiqueta, papel con una pepita.
  assert.deepEqual(craft([STRING, STRING, 0, STRING, STRING, 0, 0, 0, STRING]), { id: LEAD, count: 2 });
  assert.equal(matchRecipe([0, IRON_NUGGET, PAPER, 0], 2)?.out.id, NAME_TAG);
  assert.equal(matchRecipe([STRING, 0, LEATHER, 0], 2)?.out.id, BUNDLE);
  assert.equal(matchRecipe([BUNDLE, DYES.red, 0, 0], 2)?.out.id, DYED_BUNDLES.red);
  assert.equal(matchRecipe([DYED_BUNDLES.red, DYES.blue, 0, 0], 2)?.out.id, DYED_BUNDLES.blue);
  assert.deepEqual(craft([STICK, STICK, STICK, 0, STICK, 0, STICK, SLABS.smooth_stone, STICK]), { id: ARMOR_STAND, count: 1 });
});

test('colocar carteles colgantes y la estantería; huecos de la estantería', () => {
  const cells = new Map<string, number>([['0,5,0', STONE], ['3,1,0', STONE]]);
  const get = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? AIR;
  const sign = HANGING_SIGNS.oak;
  // Debajo de un techo: del techo, con el texto hacia el jugador.
  const ceil = planPlacement(get, hitOn(0, 5, 0, 0, -1, 0, STONE), sign, 0)!;
  assert.equal(ceil[0][1], 4);
  assert.equal(hangingSignKind(ceil[0][3]), 1);
  // En un lateral: de pared, apoyado en el bloque tocado.
  const wall = planPlacement(get, hitOn(3, 1, 0, -1, 0, 0, STONE), sign, 0)!;
  assert.equal(hangingSignKind(wall[0][3]), 2);
  assert.ok(blockSupported(wall[0][3], (dx, dy, dz) => get(2 + dx, 1 + dy, dz)));
  // Encima de un bloque no se cuelga.
  assert.equal(planPlacement(get, hitOn(3, 1, 0, 0, 1, 0, STONE), sign, 0), null);
  // Estantería con el frente hacia el jugador (mirando al norte, el frente da al sur).
  const shelf = planPlacement(get, hitOn(3, 1, 0, 0, 1, 0, STONE), CHISELED_BOOKSHELF, 0)![0][3];
  assert.equal(stateProps(shelf)!.facing, 2);
  assert.equal(stateProps(shelf)!.books, 0);
  // Huecos (arriba 0..2 y abajo 3..5, de izquierda a derecha). Con el frente al norte, la izquierda de
  // quien lo mira está en +X.
  const f0 = stateOf(CHISELED_BOOKSHELF, { facing: 0, books: 0 });
  assert.equal(shelfSlotAt(f0, 0, 0, 0, 0.9, 0.8, 0, 0, -1), 0, 'arriba a la izquierda');
  assert.equal(shelfSlotAt(f0, 0, 0, 0, 0.5, 0.8, 0, 0, -1), 1, 'arriba en medio');
  assert.equal(shelfSlotAt(f0, 0, 0, 0, 0.1, 0.2, 0, 0, -1), 5, 'abajo a la derecha');
  assert.equal(shelfSlotAt(f0, 0, 0, 0, 0.5, 0.5, 1, 0, 1), -1, 'por detrás no');
});

test('saco: peso, meter, sacar y viaje por la red', () => {
  const bag: ItemStack = { id: BUNDLE, count: 1 };
  assert.equal(bundleInsert(bag, { id: STONE_ITEM(), count: 40 }), null);
  assert.equal(bagWeight(bag.bag), 40);
  // 16 perlas pesarían 64: sólo caben 6 (24 de 64 libres, a 4 cada una).
  const pearl = ITEMS.findIndex((it) => it?.key === 'ender_pearl');
  assert.deepEqual(bundleInsert(bag, { id: pearl, count: 16 }), { id: pearl, count: 10 });
  assert.equal(bagWeight(bag.bag), BUNDLE_CAPACITY);
  // Una herramienta no cabe en un saco lleno; los sacos no entran en sacos.
  assert.deepEqual(bundleInsert(bag, { id: STICK, count: 1 }), { id: STICK, count: 1 });
  assert.deepEqual(bundleInsert({ id: BUNDLE, count: 1 }, { id: DYED_BUNDLES.red, count: 1 }), { id: DYED_BUNDLES.red, count: 1 });
  // Por la red y al guardar: el contenido viaja con el saco.
  const back = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(bag)))));
  assert.deepEqual(back, bag);
  assert.deepEqual(cloneStack(bag), bag);
  // Lo que no cabe o no vale se descarta al validarlo.
  const cheat = sanitizeStack({ id: BUNDLE, count: 1, bag: [{ id: STICK, count: 64 }, { id: STICK, count: 64 }, { id: BUNDLE, count: 1 }] });
  assert.equal(bagWeight(cheat!.bag), 64);
  // El último que entra es el primero que sale.
  assert.deepEqual(bundleTake(bag), { id: pearl, count: 6 });
  assert.deepEqual(bundleTake(bag), { id: STONE_ITEM(), count: 40 });
  assert.equal(bundleTake(bag), null);
  assert.equal(bag.bag, undefined);
});

function STONE_ITEM(): number {
  return ITEMS.findIndex((it) => it?.key === 'stone');
}

// ------------------------------------------------------------------ servidor

function platform(store = new MemoryStore(), mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(5151, store);
  const c = h.join('Rematadora', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
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

test('servidor: estantería cincelada (meter, sacar y romper)', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  W.setBlock(bx + 1, by, bz, stateOf(CHISELED_BOOKSHELF, { facing: 2, books: 0 }));
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 4, item: BOOK, q: 1 });
  assert.ok(c.conn.take('ires').find((m) => m.q === 1)?.take === 1, 'el libro se gasta');
  assert.equal(stateProps(W.getBlock(bx + 1, by, bz))!.books, 1 << 4);
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 1, item: STICK, q: 2 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 2)?.ok, false, 'un palo no entra');
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 4, item: 0, q: 3 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 3)?.give?.id, BOOK, 'se saca el libro');
  assert.equal(stateProps(W.getBlock(bx + 1, by, bz))!.books, 0);
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 0, item: BOOK, q: 4 });
  c.send({ t: 'shelf', x: bx + 1, y: by, z: bz, slot: 5, item: BOOK, q: 5 });
  W.setBlock(bx + 1, by, bz, AIR);
  assert.equal(itemsOf(h, BOOK), 2, 'al romperla caen sus libros');
});

test('servidor: etiqueta y correa (y se guardan)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  const pig = h.gs.entities.spawnMob(MOB_PIG, bx + 2.5, by, bz + 0.5)!;
  c.send({ t: 'interact', e: pig.id, item: NAME_TAG, q: 1, n: '  Pancho\u0007 ' });
  assert.equal(pig.customName, 'Pancho');
  h.tick(2);
  const ex = c.conn.take('ents').flatMap((m) => m.ex ?? []);
  assert.ok(ex.some((x: [number, string]) => x[0] === pig.id && x[1] === 'Pancho'), 'el nombre llega a los clientes');
  // Correa: atado al jugador; al alejarse lo sigue.
  c.send({ t: 'interact', e: pig.id, item: LEAD, q: 2 });
  assert.equal(pig.leash, c.welcome.id);
  c.pos(bx + 7.5, by, bz + 0.5);
  h.tick(80);
  assert.ok(pig.x > bx + 4, `lo sigue (x = ${pig.x.toFixed(1)})`);
  // A una valla.
  W.setBlock(bx + 6, by, bz + 2, FENCES.oak);
  c.send({ t: 'leash', x: bx + 6, y: by, z: bz + 2 });
  assert.deepEqual(pig.leash, [bx + 6, by, bz + 2]);
  // Monstruo con nombre: no desaparece y se guarda.
  const zombie = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 5.5, by, bz - 2.5)!;
  c.send({ t: 'interact', e: zombie.id, item: NAME_TAG, q: 3, n: 'Zacarías' });
  h.gs.flush(true);
  const h2 = makeServer(5151, store);
  const back = [...h2.gs.entities.list.values()];
  const pig2 = back.find((e) => e.type === MOB_PIG && e.customName === 'Pancho');
  assert.ok(pig2, 'el cerdo con nombre vuelve');
  assert.deepEqual(pig2!.leash, [bx + 6, by, bz + 2], 'atado a la valla');
  assert.ok(back.some((e) => e.type === MOB_ZOMBIE && e.customName === 'Zacarías'), 'el zombi con nombre se guarda');
  // Si se rompe la valla, la correa cae.
  const c2 = h2.join('Rematadora', 's');
  c2.pos(bx + 0.5, by, bz + 0.5);
  h2.tick(40);
  h2.gs.world.setBlock(bx + 6, by, bz + 2, AIR);
  h2.tick(2);
  assert.equal(pig2!.leash, undefined);
  assert.equal(itemsOf(h2, LEAD), 1);
});

test('servidor: soporte para armadura (poner, vestir, desvestir, romper, guardar)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  c.send({ t: 'stand', x: bx + 2, y: by - 1, z: bz, yaw: 0, q: 1 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.take, 1, 'se gasta el soporte');
  h.tick(10); // (el soporte no es una criatura: el tick no debe tratarlo como tal)
  const stand = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  assert.ok(stand && stand.y === by);
  const helmet = ARMOR.iron.helmet, chest = ARMOR.diamond.chestplate;
  c.send({ t: 'interact', e: stand.id, item: helmet, q: 2, d: 30 });
  const s2 = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  assert.deepEqual(s2.standArmor, [helmet, 0, 0, 0]);
  c.send({ t: 'interact', e: s2.id, item: chest, q: 3 });
  const s3 = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  assert.deepEqual(s3.standArmor, [helmet, chest, 0, 0]);
  // Mano vacía: sale la de más arriba (con su desgaste).
  c.send({ t: 'interact', e: s3.id, item: 0, q: 4 });
  const r = c.conn.take('ires').find((m) => m.q === 4);
  assert.deepEqual(r?.give, { id: helmet, count: 1, dmg: 30 });
  h.gs.flush(true);
  const h2 = makeServer(5151, store);
  const back = [...h2.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND);
  assert.deepEqual(back?.standArmor, [0, chest, 0, 0], 'se guarda con su armadura');
  // Un golpe lo tira: suelta el soporte y la armadura.
  const s4 = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARMOR_STAND)!;
  c.send({ t: 'attack', e: s4.id, item: 0 });
  assert.ok(![...h.gs.entities.list.values()].some((e) => e.type === ENT_ARMOR_STAND));
  assert.equal(itemsOf(h, ARMOR_STAND), 1);
  assert.equal(itemsOf(h, chest), 1);
});
