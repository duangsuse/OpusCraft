// Fase 3: bloques de 16 bits, formas hechas de cajas, colisiones con subida de escalones,
// colocación (losas, escaleras, puertas, camas, antorchas en la pared...), uso y camas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, DIRT, TORCH, OAK_PLANKS, RED_WOOL, GLASS, SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, LADDER,
  GLASS_PANE, WALL_TORCH, RED_BED, BLOCK_CLIMB, BLOCK_COLLIDE, stateOf, stateProps, blockSelectionBounds,
  blockItemModel, isDoor, isBed, familyBase,
} from '../src/shared/blocks';
import { ITEMS, STICK, isValidItem, itemSpriteIndex } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { moveBox, boxBlocked } from '../src/shared/collide';
import { planPlacement, toggleEdits, facingFromYaw, type PlaceHit } from '../src/shared/placement';
import { blockDrops } from '../src/shared/sim/drops';
import { modelQuads } from '../src/shared/blockModels';
import { MemoryStore, BLOCK_FORMAT } from '../src/shared/sim/store';
import { GameServer, type Conn } from '../src/shared/sim/GameServer';
import { PROTOCOL_VERSION, decodeEdits } from '../src/shared/protocol';
import { MOB_ZOMBIE, ENT_ITEM } from '../src/shared/mobs';
import { makeServer, placeOnTop, type Client, type Harness } from './harness';

/** Mundo pequeño en memoria: suelo de piedra en y = 0 y lo que se ponga encima. */
function mapWorld(): { getBlock(x: number, y: number, z: number): number; set(x: number, y: number, z: number, id: number): void } {
  const m = new Map<string, number>();
  return {
    getBlock: (x, y, z) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? STONE : AIR),
    set: (x, y, z, id) => void m.set(`${x},${y},${z}`, id),
  };
}

const topHit = (x: number, y: number, z: number, id = STONE): PlaceHit => ({ x, y, z, nx: 0, ny: 1, nz: 0, px: x + 0.5, py: y + 1, pz: z + 0.5, id });

test('bloques de 16 bits: los mundos antiguos se migran una sola vez', () => {
  const store = new MemoryStore();
  store.setMeta('seed', '777');
  // Chunk 0,0 en el primer formato (u16 índice con la fila 0 en y = 0 + u8 bloque): cofre (91),
  // antorcha (38) y aire.
  const legacy = new Uint8Array(9);
  const oldIndex = (x: number, y: number, z: number) => (y << 8) | (z << 4) | x;
  [[oldIndex(1, 70, 2), 91], [oldIndex(3, 71, 4), 38], [oldIndex(5, 72, 6), 0]].forEach(([idx, b], i) => {
    legacy[i * 3] = idx & 255;
    legacy[i * 3 + 1] = idx >> 8;
    legacy[i * 3 + 2] = b;
  });
  store.chunks.set('0,0', legacy);
  const gs = new GameServer(store, { now: () => 1e6 });
  assert.equal(store.getMeta('blockFormat'), BLOCK_FORMAT);
  assert.equal(store.chunks.get('0,0')!.length, 15);
  let bin: ArrayBuffer | null = null;
  const c: Conn = { send: (d) => { if (typeof d !== 'string') bin = d; }, close: () => {} };
  gs.connect(c);
  gs.message(c, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'A', shirt: '#ff0000' }));
  const edits = decodeEdits(bin!);
  assert.equal(edits.length, 3);
  assert.ok(edits.some((e) => e[3] === 91 && e[0] === 1 && e[1] === 70 && e[2] === 2), 'el cofre sigue en y = 70');
  assert.ok(edits.some((e) => e[3] === 38 && e[1] === 71));
  const before = store.chunks.get('0,0')!.slice();
  new GameServer(store, { now: () => 1e6 });
  assert.deepEqual(store.chunks.get('0,0'), before, 'no se migra dos veces');
  // Los ids de las familias pasan de 255 y viajan enteros.
  assert.ok(DOORS.oak > 1024 && isValidItem(DOORS.oak) && isValidItem(SLABS.stone));
});

test('colisiones: subir losas y escaleras sin saltar, pero no bloques enteros ni vallas', () => {
  const w = mapWorld();
  w.set(1, 1, 0, SLABS.oak); // losa de abajo
  let x = 0.5, y = 1;
  for (let i = 0; i < 20 && x < 1.5; i++) {
    const r = moveBox(w, x, y, 0.5, 0.6, 1.8, 0.1, -0.05, 0, 0.6, true);
    x += r.dx;
    y += r.dy;
  }
  assert.ok(x >= 1.5 && Math.abs(y - 1.5) < 1e-6, `sube la losa (x ${x.toFixed(2)}, y ${y.toFixed(3)})`);

  const w2 = mapWorld();
  w2.set(1, 1, 0, STONE);
  const r2 = moveBox(w2, 0.5, 1, 0.5, 0.6, 1.8, 0.4, -0.05, 0, 0.6, true);
  assert.ok(r2.hitX && Math.abs(r2.dy) < 1e-6, 'un bloque entero frena');

  const w3 = mapWorld();
  w3.set(1, 1, 0, FENCES.oak);
  assert.ok(boxBlocked(w3, 1.1, 2, 0.1, 1.9, 2.4, 0.9), 'la valla mide 1,5 bloques');
  assert.ok(!boxBlocked(w3, 1.7, 1, 0.1, 1.9, 2, 0.3), 'pero sólo el poste y los travesaños');

  assert.equal(BLOCK_CLIMB[stateOf(LADDER, { facing: 2 })], 1, 'las escaleras de mano se trepan');
  assert.equal(BLOCK_COLLIDE[stateOf(FENCE_GATES.oak, { open: 1 })], 0, 'un portillo abierto se cruza');
  assert.deepEqual(blockSelectionBounds(SLABS.stone, () => AIR), [0, 0, 0, 1, 0.5, 1]);
});

test('colocación: losas, escaleras, trampillas, escaleras de mano y antorchas', () => {
  const w = mapWorld();
  const g = w.getBlock;
  const slab = SLABS.stone;
  assert.deepEqual(planPlacement(g, topHit(0, 0, 0), slab, 0), [[0, 1, 0, slab]], 'losa sobre el suelo: abajo');
  w.set(0, 3, 0, STONE);
  const under: PlaceHit = { x: 0, y: 3, z: 0, nx: 0, ny: -1, nz: 0, px: 0.5, py: 3, pz: 0.5, id: STONE };
  assert.deepEqual(planPlacement(g, under, slab, 0), [[0, 2, 0, stateOf(slab, { type: 1 })]], 'bajo un techo: arriba');
  const side: PlaceHit = { x: 0, y: 1, z: 0, nx: 1, ny: 0, nz: 0, px: 1, py: 1.8, pz: 0.5, id: STONE };
  w.set(0, 1, 0, STONE);
  assert.deepEqual(planPlacement(g, side, slab, 0), [[1, 1, 0, stateOf(slab, { type: 1 })]], 'mitad alta de una cara: arriba');
  w.set(2, 1, 0, slab);
  const onSlab: PlaceHit = { x: 2, y: 1, z: 0, nx: 0, ny: 1, nz: 0, px: 2.5, py: 1.5, pz: 0.5, id: slab };
  assert.deepEqual(planPlacement(g, onSlab, slab, 0), [[2, 1, 0, stateOf(slab, { type: 2 })]], 'losa sobre losa: doble');
  assert.equal(planPlacement(g, onSlab, SLABS.oak, 0)?.[0][1], 2, 'otra madera no se junta: va encima');

  const stairs = planPlacement(g, topHit(5, 0, 5), STAIRS.oak, Math.PI / 2)!;
  assert.deepEqual(stateProps(stairs[0][3]), { facing: facingFromYaw(Math.PI / 2), half: 0 });
  assert.equal(facingFromYaw(Math.PI / 2), 3, 'yaw π/2 mira al oeste');

  // Trampilla en la cara lateral: pegada al bloque, en la mitad según la altura del clic.
  const td = planPlacement(g, { ...side, py: 1.2 }, TRAPDOORS.oak, 0)!;
  assert.deepEqual(stateProps(td[0][3]), { facing: 1, half: 0, open: 0 });

  // Escalera de mano: sólo contra una pared opaca.
  const ladder = planPlacement(g, side, LADDER, 0)!;
  assert.deepEqual(ladder, [[1, 1, 0, stateOf(LADDER, { facing: 1 })]]);
  assert.equal(planPlacement(g, topHit(8, 0, 8), LADDER, 0), null, 'en el suelo sin pared, no');

  // Antorcha: de pie encima, en la pared al lado.
  assert.deepEqual(planPlacement(g, topHit(8, 0, 8), TORCH, 0), [[8, 1, 8, TORCH]]);
  assert.deepEqual(planPlacement(g, side, TORCH, 0), [[1, 1, 0, stateOf(WALL_TORCH, { facing: 1 })]]);
});

test('colocación: puertas de dos bloques con bisagra y camas de dos partes', () => {
  const w = mapWorld();
  const g = w.getBlock;
  const door = DOORS.oak;
  // Mirando al norte, clic en la mitad oeste: bisagra a la izquierda (oeste).
  const left = planPlacement(g, { ...topHit(0, 0, 0), px: 0.2 }, door, 0)!;
  assert.equal(left.length, 2);
  assert.deepEqual(stateProps(left[0][3]), { facing: 0, half: 0, open: 0, hinge: 0 });
  assert.deepEqual([left[1][1], stateProps(left[1][3])!.half], [2, 1], 'la mitad de arriba encima');
  const right = planPlacement(g, { ...topHit(0, 0, 0), px: 0.8 }, door, 0)!;
  assert.equal(stateProps(right[0][3])!.hinge, 1, 'clic en la mitad este: bisagra a la derecha');
  // Puerta doble: junto a una con bisagra a la izquierda, la nueva la lleva a la derecha.
  for (const [x, y, z, id] of left) w.set(x, y, z, id);
  const second = planPlacement(g, { ...topHit(1, 0, 0), px: 1.2 }, door, 0)!;
  assert.equal(stateProps(second[0][3])!.hinge, 1, 'puerta doble');
  w.set(5, 2, 5, STONE);
  assert.equal(planPlacement(g, topHit(5, 0, 5), door, 0), null, 'sin sitio para la mitad de arriba');

  // Abrir: las dos mitades a la vez.
  const open = toggleEdits(g, 0, 2, 0, 0)!;
  assert.equal(open.length, 2);
  assert.ok(open.every(([, , , id]) => stateProps(id)!.open === 1));

  // Portillo: se abre alejándose de quien empuja.
  w.set(4, 1, 4, stateOf(FENCE_GATES.oak, { facing: 0 }));
  const gate = toggleEdits(g, 4, 1, 4, Math.PI)!; // empujando hacia el sur
  assert.deepEqual(stateProps(gate[0][3]), { facing: 2, open: 1 });

  // Cama: pies donde se hace clic, cabecera hacia donde mira el jugador.
  const bed = planPlacement(g, topHit(10, 0, 10), RED_BED, Math.PI)!; // mirando al sur
  assert.deepEqual(bed.map(([x, y, z, id]) => [x, y, z, stateProps(id)!.part]), [[10, 1, 10, 0], [10, 1, 11, 1]]);
});

test('botín, objetos, iconos y recetas de los bloques nuevos', () => {
  const upperDoor = stateOf(DOORS.oak, { half: 1 });
  assert.deepEqual(blockDrops(DOORS.oak, 0), [{ id: DOORS.oak, count: 1 }]);
  assert.deepEqual(blockDrops(upperDoor, 0), [], 'la mitad de arriba no suelta nada');
  assert.deepEqual(blockDrops(stateOf(SLABS.oak, { type: 2 }), 0), [{ id: SLABS.oak, count: 2 }]);
  assert.deepEqual(blockDrops(stateOf(SLABS.stone, { type: 1 }), 0), [], 'la piedra necesita pico');
  assert.deepEqual(blockDrops(stateOf(WALL_TORCH, { facing: 2 }), 0), [{ id: TORCH, count: 1 }]);
  assert.deepEqual(blockDrops(GLASS_PANE, 0), []);
  assert.deepEqual(blockDrops(stateOf(RED_BED, { part: 1 }), 0), []);

  assert.equal(ITEMS[stateOf(DOORS.oak, { half: 1 })], undefined, 'los estados no son objetos');
  assert.ok(itemSpriteIndex(DOORS.oak) >= 0 && itemSpriteIndex(RED_BED) >= 0, 'puertas y cama se ven como dibujo');
  assert.equal(ITEMS[RED_BED].stack, 1);
  assert.ok(modelQuads(blockItemModel(STAIRS.oak)).length >= 10, 'modelo de las escaleras para la mano');
  assert.ok(modelQuads(blockItemModel(FENCES.oak)).length >= 16, 'modelo de la valla para la mano');

  const P = OAK_PLANKS, S = STICK;
  assert.deepEqual(matchRecipe([P, P, P, 0, 0, 0, 0, 0, 0], 3)?.out, { id: SLABS.oak, count: 6 });
  assert.deepEqual(matchRecipe([0, 0, P, 0, P, P, P, P, P], 3)?.out, { id: STAIRS.oak, count: 4 }, 'escaleras (reflejadas)');
  assert.deepEqual(matchRecipe([P, S, P, P, S, P, 0, 0, 0], 3)?.out, { id: FENCES.oak, count: 3 });
  assert.deepEqual(matchRecipe([P, P, 0, P, P, 0, P, P, 0], 3)?.out, { id: DOORS.oak, count: 3 });
  assert.deepEqual(matchRecipe([S, 0, S, S, S, S, S, 0, S], 3)?.out, { id: LADDER, count: 3 });
  assert.deepEqual(matchRecipe([GLASS, GLASS, GLASS, GLASS, GLASS, GLASS, 0, 0, 0], 3)?.out, { id: GLASS_PANE, count: 16 });
  assert.deepEqual(matchRecipe([RED_WOOL, RED_WOOL, RED_WOOL, P, P, P, 0, 0, 0], 3)?.out, { id: RED_BED, count: 1 });
});

/** Servidor con una plataforma de piedra a y = 150 y un jugador encima. */
function platform(mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(4242);
  const c = h.join('Constructor', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(60);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx, by, bz);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: puertas, apoyos y botín de bloques de varias celdas', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  placeOnTop(c, bx, by, bz, DOORS.oak, 0);
  assert.ok(isDoor(W.getBlock(bx, by, bz)) && isDoor(W.getBlock(bx, by + 1, bz)), 'la puerta ocupa dos bloques');
  c.send({ t: 'use', x: bx, y: by + 1, z: bz, yaw: 0 });
  assert.equal(stateProps(W.getBlock(bx, by, bz))!.open, 1, 'al usar la mitad de arriba se abre la de abajo');
  c.send({ t: 'set', x: bx, y: by + 1, z: bz, b: AIR, tool: 0 });
  h.tick(10);
  assert.equal(W.getBlock(bx, by, bz), AIR, 'romper la mitad de arriba rompe la puerta entera');
  assert.equal(itemsOf(h, DOORS.oak), 1, 'y suelta una sola puerta');

  // Antorcha en la pared y escalera de mano: caen al quitar la pared.
  W.setBlock(bx + 2, by, bz, DIRT);
  c.send({ t: 'place', x: bx + 2, y: by, z: bz, n: [0, 0, 1], p: [bx + 2.5, by + 0.5, bz + 1], item: TORCH, yaw: Math.PI });
  assert.equal(W.getBlock(bx + 2, by, bz + 1), stateOf(WALL_TORCH, { facing: 2 }), 'antorcha en la pared');
  c.send({ t: 'place', x: bx + 2, y: by, z: bz, n: [0, 0, -1], p: [bx + 2.5, by + 0.5, bz], item: LADDER, yaw: 0 });
  assert.equal(W.getBlock(bx + 2, by, bz - 1), stateOf(LADDER, { facing: 0 }), 'escalera de mano en la pared');
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(10);
  assert.equal(W.getBlock(bx + 2, by, bz + 1), AIR);
  assert.equal(W.getBlock(bx + 2, by, bz - 1), AIR);
  assert.equal(itemsOf(h, TORCH), 1, 'suelta la antorcha');
  assert.equal(itemsOf(h, LADDER), 1, 'suelta la escalera de mano');

  // Losa doble: se hace en dos clics y suelta dos losas.
  placeOnTop(c, bx - 2, by, bz, SLABS.oak);
  c.send({ t: 'place', x: bx - 2, y: by, z: bz, n: [0, 1, 0], p: [bx - 1.5, by + 0.5, bz + 0.5], item: SLABS.oak, yaw: 0 });
  assert.equal(W.getBlock(bx - 2, by, bz), stateOf(SLABS.oak, { type: 2 }));
  c.send({ t: 'set', x: bx - 2, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(10);
  assert.equal(itemsOf(h, SLABS.oak), 2);

  // Ocupado: no se puede poner una puerta si la celda de arriba está llena.
  W.setBlock(bx + 4, by + 1, bz, STONE);
  placeOnTop(c, bx + 4, by, bz, DOORS.oak, 0);
  assert.equal(W.getBlock(bx + 4, by, bz), AIR);
});

test('servidor: en creativo romper una puerta no suelta nada', () => {
  const { h, c, bx, by, bz } = platform('c');
  placeOnTop(c, bx, by, bz, DOORS.birch, 0);
  c.send({ t: 'set', x: bx, y: by + 1, z: bz, b: AIR, tool: 0 });
  h.tick(10);
  assert.equal(h.gs.world.getBlock(bx, by, bz), AIR);
  assert.equal(itemsOf(h, DOORS.birch), 0);
});

test('servidor: dormir en una cama hace de día y fija la reaparición', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  placeOnTop(c, bx, by, bz, RED_BED, Math.PI); // cabecera al sur
  assert.ok(isBed(W.getBlock(bx, by, bz)) && isBed(W.getBlock(bx, by, bz + 1)));
  c.send({ t: 'chat', m: '/time set mediodia' });
  c.conn.msgs = [];
  c.send({ t: 'use', x: bx, y: by, z: bz + 1, yaw: 0 });
  assert.deepEqual(c.conn.take('spawn')[0]?.p, [bx, by, bz], 'reaparición en los pies de la cama');
  assert.equal(c.conn.take('sleep')[0]?.ok, false, 'de día no se duerme');

  // De noche, con un zombi al lado, tampoco.
  c.send({ t: 'chat', m: '/time set medianoche' });
  const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 3.5, by, bz + 0.5)!;
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0 });
  assert.match(c.conn.take('sleep')[0]?.m ?? '', /monstruos/);
  h.gs.entities.list.delete(z.id);

  c.conn.take('time');
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0 });
  const sl = c.conn.take('sleep')[0];
  assert.ok(sl?.ok && sl.p[1] === by + 0.5625 && sl.f === 2, 'se acuesta en la cama');
  h.tick(110);
  assert.ok(c.conn.take('wake').length === 1, 'se despierta');
  const time = c.conn.take('time').pop()?.time;
  assert.ok(time && time.base - Math.floor(time.base) < 0.05, 'amanece');

  // Romper la cama borra la reaparición.
  c.send({ t: 'set', x: bx, y: by, z: bz + 1, b: AIR, tool: 0 });
  h.tick(5);
  assert.equal(W.getBlock(bx, by, bz), AIR, 'la otra parte cae');
  assert.equal(itemsOf(h, RED_BED), 1, 'y suelta una cama');
  assert.deepEqual(c.conn.take('spawn').pop(), { t: 'spawn', p: null });

  // Con dos jugadores, uno solo durmiendo no basta.
  const d = h.join('Otro');
  d.pos(bx + 5, by, bz);
  placeOnTop(c, bx + 3, by, bz, RED_BED, 0);
  c.send({ t: 'chat', m: '/time set medianoche' });
  c.conn.msgs = [];
  c.send({ t: 'use', x: bx + 3, y: by, z: bz, yaw: 0 });
  assert.equal(c.conn.take('sleep')[0]?.ok, true);
  h.tick(150);
  assert.equal(c.conn.take('wake').length, 0, 'sigue durmiendo: el otro jugador está despierto');
  assert.equal(familyBase(W.getBlock(bx + 3, by, bz - 1)), RED_BED);
});
