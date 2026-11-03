// Fase 4, tercera tanda: muros, camas de colores, carteles (texto guardado y reenviado), cofres dobles,
// ahumador y alto horno, fogata (asa y quema) y cortapiedras, con sus recetas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, SMOOTH_STONE, COBBLESTONE, CHEST, WALLS, BEDS, SIGNS, WALL_SIGNS, CHEST_DOUBLE, SMOKER, BLAST_FURNACE, CAMPFIRE,
  STONECUTTER, SLABS, STAIRS, STONE_BRICKS, WHITE_WOOL, OAK_PLANKS, OAK_LOG, FURNACE, IRON_ORE, BLOCK_TALL, blockModel,
  familyBase, stateOf, stateProps,
} from '../src/shared/blocks';
import { STICK, COAL, IRON_INGOT, RAW_BEEF, STEAK, RAW_PORKCHOP, CHARCOAL } from '../src/shared/items';
import { ENT_ITEM, ENT_DISPLAY } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { GameServer } from '../src/shared/sim/GameServer';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import { Checks, FakeConn, makeServer, placeOnTop, type Client, type Harness } from './harness';

function arena(seed = 5151): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Artesana');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.send({ t: 'chat', m: '/time set mediodia' });
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const entities = (h: Harness, type: number) => [...h.gs.entities.list.values()].filter((e) => e.type === type);

test('muros: poste, tramos rectos y altura de valla', () => {
  const wall = WALLS.cobblestone;
  const world = new Map<string, number>();
  const get = (dx: number, dy: number, dz: number) => world.get(`${dx},${dy},${dz}`) ?? 0;
  assert.equal(blockModel(wall, get)!.length, 1, 'suelto: sólo el poste');
  world.set('0,0,-1', wall);
  world.set('0,0,1', wall);
  assert.equal(blockModel(wall, get)!.length, 2, 'tramo recto norte-sur: sin poste');
  world.set('0,1,0', STONE);
  assert.equal(blockModel(wall, get)!.length, 3, 'con algo encima vuelve el poste');
  world.delete('0,1,0');
  world.set('1,0,0', STONE);
  assert.equal(blockModel(wall, get)!.length, 4, 'esquina en T: poste y tres tramos');
  assert.equal(BLOCK_TALL[wall], 1, 'no se puede saltar');
  assert.equal(matchRecipe([COBBLESTONE, COBBLESTONE, COBBLESTONE, COBBLESTONE, COBBLESTONE, COBBLESTONE, 0, 0, 0], 3)?.out.count, 6);
});

test('camas de colores, carteles y bloques de trabajo: recetas', () => {
  const R = (g: number[]) => matchRecipe(g, 3)?.out;
  const W = WHITE_WOOL, P = OAK_PLANKS;
  assert.equal(R([W, W, W, P, P, P, 0, 0, 0])?.id, BEDS.white);
  assert.deepEqual(R([P, P, P, P, P, P, 0, STICK, 0]), { id: SIGNS.oak, count: 3 });
  assert.equal(R([0, OAK_LOG, 0, OAK_LOG, FURNACE, OAK_LOG, 0, OAK_LOG, 0])?.id, SMOKER);
  assert.equal(R([IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, FURNACE, IRON_INGOT, SMOOTH_STONE, SMOOTH_STONE, SMOOTH_STONE])?.id, BLAST_FURNACE);
  assert.equal(R([0, STICK, 0, STICK, COAL, STICK, OAK_LOG, OAK_LOG, OAK_LOG])?.id, CAMPFIRE);
  assert.equal(R([0, IRON_INGOT, 0, STONE, STONE, STONE, 0, 0, 0])?.id, STONECUTTER);
  // Cortapiedras.
  const stone = stonecutterOptions(STONE);
  assert.ok(stone.some((o) => o.id === SLABS.stone && o.count === 2), 'losas de piedra de 2 en 2');
  assert.ok(stone.some((o) => o.id === STONE_BRICKS), 'ladrillos de piedra');
  assert.ok(stone.some((o) => o.id === STAIRS.stone_brick), 'escaleras de ladrillos de piedra');
  assert.ok(stonecutterOptions(COBBLESTONE).some((o) => o.id === WALLS.cobblestone), 'muro de roca');
  assert.equal(stonecutterOptions(OAK_PLANKS).length, 0, 'la madera no se corta');
});

test('carteles: colocar, escribir, guardar y borrar', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  // De pie, mirando al norte: el texto mira al jugador (al sur).
  placeOnTop(c, bx, by, bz - 2, SIGNS.oak, 0);
  h.tick(1);
  const standing = w.getBlock(bx, by, bz - 2);
  t.ok(standing === stateOf(SIGNS.oak, { facing: 2 }), `cartel de pie hacia el jugador (${standing})`);
  // En la pared: clic en la cara norte de un bloque.
  w.setBlock(bx + 2, by, bz - 3, STONE);
  c.send({ t: 'place', x: bx + 2, y: by, z: bz - 3, n: [0, 0, 1], p: [bx + 2.5, by + 0.5, bz - 2], item: SIGNS.birch, yaw: 0 });
  h.tick(1);
  const wall = w.getBlock(bx + 2, by, bz - 2);
  t.ok(familyBase(wall) === WALL_SIGNS.birch && stateProps(wall)!.facing === 2, `cartel en la pared (${wall})`);
  // Texto: se limpia y se reenvía a todos.
  const other = h.join('Lectora');
  other.conn.msgs = [];
  c.send({ t: 'sign', x: bx, y: by, z: bz - 2, l: ['Hola', '', 'una línea demasiado larga', 'fin\u0007'] });
  const got = other.conn.take('sign')[0];
  t.ok(got && JSON.stringify(got.l) === JSON.stringify(['Hola', '', 'una línea demas', 'fin']), `texto reenviado y recortado (${JSON.stringify(got?.l)})`);
  c.send({ t: 'sign', x: bx + 1, y: by, z: bz - 2, l: ['no es un cartel'] });
  t.ok(other.conn.take('sign').length === 0, 'fuera de un cartel no se escribe');
  // Guardado: un servidor nuevo con el mismo almacén lo envía al entrar.
  h.gs.flush(true);
  const gs2 = new GameServer(h.store, { now: () => h.clock.now });
  const conn = new FakeConn();
  gs2.connect(conn);
  gs2.message(conn, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Nueva', shirt: '#00ff00' }));
  const welcome = conn.take('welcome')[0];
  t.ok(welcome?.signs?.some((sg: [number, number, number, string[]]) => sg[0] === bx && sg[3][0] === 'Hola'), 'el texto se guarda');
  // Romper el cartel borra el texto.
  other.conn.msgs = [];
  c.send({ t: 'set', x: bx, y: by, z: bz - 2, b: AIR });
  h.tick(1);
  const del = other.conn.take('sign').pop();
  t.ok(del && del.l.length === 0, 'al romperlo se borra');
  t.done();
});

test('cofre doble: se une, se ve entero y se separa', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  const cx = bx, cz = bz - 2;
  placeOnTop(c, cx, by, cz, CHEST, 0);
  h.tick(1);
  t.ok(w.getBlock(cx, by, cz) === CHEST + 2, 'primer cofre sencillo');
  placeOnTop(c, cx + 1, by, cz, CHEST, 0);
  h.tick(1);
  const a = w.getBlock(cx, by, cz), b = w.getBlock(cx + 1, by, cz);
  t.ok(familyBase(a) === CHEST_DOUBLE && familyBase(b) === CHEST_DOUBLE, `los dos forman un cofre doble (${a}, ${b})`);
  t.ok(stateProps(a)!.side !== stateProps(b)!.side, 'una mitad a cada lado');
  // Abrir cualquiera de las dos: 54 huecos.
  c.send({ t: 'open', x: cx + 1, y: by, z: cz });
  let cont = c.conn.take('cont').pop();
  t.ok(cont && cont.c.s.length === 54 && cont.x === cx + 1, `cofre grande (${cont?.c.s.length})`);
  c.send({ t: 'cclick', x: cx + 1, y: by, z: cz, slot: 40, btn: 0, cur: { id: IRON_INGOT, count: 7 }, q: 1 });
  t.ok(c.conn.take('cres')[0]?.cur === null, 'se deja algo en la segunda mitad');
  c.send({ t: 'close' });
  c.send({ t: 'open', x: cx, y: by, z: cz });
  cont = c.conn.take('cont').pop();
  t.ok(cont && cont.c.s[40]?.[0] === IRON_INGOT, 'desde la otra mitad se ve igual');
  c.send({ t: 'close' });
  // Romper la mitad donde está el hierro: la otra vuelve a ser sencilla y el hierro cae.
  const ironHalf = stateProps(w.getBlock(cx, by, cz))!.side === 1 ? cx : cx + 1;
  const rest = ironHalf === cx ? cx + 1 : cx;
  c.send({ t: 'set', x: ironHalf, y: by, z: cz, b: AIR });
  h.tick(3);
  t.ok(w.getBlock(rest, by, cz) === CHEST + 2, `la otra mitad vuelve a ser un cofre (${w.getBlock(rest, by, cz)})`);
  t.ok(entities(h, ENT_ITEM).some((e) => e.stack?.id === IRON_INGOT && e.stack.count === 7), 'el contenido de la mitad rota cae');
  c.send({ t: 'open', x: rest, y: by, z: cz });
  cont = c.conn.take('cont').pop();
  t.ok(cont && cont.c.s.length === 27, 'y se abre como cofre sencillo');
  t.done();
});

test('ahumador y alto horno: el doble de rápido y cada uno lo suyo', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  const load = (x: number, z: number, input: number, n: number, q: number) => {
    c.send({ t: 'open', x, y: by, z });
    c.send({ t: 'cclick', x, y: by, z, slot: 0, btn: 0, cur: { id: input, count: n }, q });
    c.send({ t: 'cclick', x, y: by, z, slot: 1, btn: 0, cur: { id: COAL, count: 1 }, q: q + 1 });
    c.send({ t: 'close' });
  };
  const outOf = (x: number, z: number) => {
    c.conn.msgs = [];
    c.send({ t: 'open', x, y: by, z });
    const s = c.conn.take('cont').pop()?.c.s[2];
    c.send({ t: 'close' });
    return s ? [s[0], s[1]] : null;
  };
  placeOnTop(c, bx - 2, by, bz - 2, SMOKER, 0);
  placeOnTop(c, bx + 2, by, bz - 2, BLAST_FURNACE, 0);
  placeOnTop(c, bx, by, bz - 3, SMOKER, 0);
  h.tick(1);
  t.ok(familyBase(w.getBlock(bx - 2, by, bz - 2)) === SMOKER, 'ahumador colocado');
  load(bx - 2, bz - 2, RAW_BEEF, 2, 10);
  load(bx + 2, bz - 2, IRON_ORE, 2, 20);
  load(bx, bz - 3, IRON_ORE, 1, 30);
  h.tick(20);
  t.ok(stateProps(w.getBlock(bx - 2, by, bz - 2))!.lit === 1, 'el ahumador se enciende');
  h.tick(20 * 10 + 8);
  const smoked = outOf(bx - 2, bz - 2);
  t.ok(smoked && smoked[0] === STEAK && smoked[1] === 2, `2 filetes en 10 s (${JSON.stringify(smoked)})`);
  const blasted = outOf(bx + 2, bz - 2);
  t.ok(blasted && blasted[0] === IRON_INGOT && blasted[1] === 2, `2 lingotes en 10 s (${JSON.stringify(blasted)})`);
  t.ok(outOf(bx, bz - 3) === null, 'el ahumador no funde mineral');
  t.ok(stateProps(w.getBlock(bx, by, bz - 3))!.lit === 0, 'ni se enciende por él');
  t.done();
});

test('fogata: asa la comida, la suelta hecha y quema', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  placeOnTop(c, bx, by, bz - 2, CAMPFIRE, 0);
  h.tick(1);
  t.ok(w.getBlock(bx, by, bz - 2) === CAMPFIRE + 1, 'la fogata se coloca encendida');
  const use = (item: number) => {
    h.clock.now += 300;
    c.send({ t: 'use', x: bx, y: by, z: bz - 2, yaw: 0, item });
    h.tick(1);
  };
  use(STICK);
  t.ok(entities(h, ENT_DISPLAY).length === 0, 'un palo no se asa');
  for (let i = 0; i < 5; i++) use(RAW_BEEF);
  t.ok(entities(h, ENT_DISPLAY).length === 4, `caben cuatro (${entities(h, ENT_DISPLAY).length})`);
  h.tick(20 * 31);
  // (Caen juntos y se fusionan en una pila.)
  const steaks = entities(h, ENT_ITEM).filter((e) => e.stack?.id === STEAK).reduce((n, e) => n + e.stack!.count, 0);
  t.ok(steaks === 4, `a los 30 s saltan hechos (${steaks})`);
  t.ok(entities(h, ENT_DISPLAY).length === 0, 'ya no queda nada encima');
  // Romperla con algo asándose: suelta lo crudo y carbón vegetal.
  use(RAW_PORKCHOP);
  c.send({ t: 'set', x: bx, y: by, z: bz - 2, b: AIR });
  h.tick(5);
  const items = entities(h, ENT_ITEM);
  t.ok(items.some((e) => e.stack?.id === RAW_PORKCHOP), 'suelta lo que se asaba');
  t.ok(items.some((e) => e.stack?.id === CHARCOAL && e.stack.count === 2), 'y dos de carbón vegetal');
  t.done();
});
