// Fase 8 (dimensiones): lo guardado de cada dimensión va aparte, el anfitrión (Multiverse) pone a cada
// jugador en la suya, y los portales del Nether se encienden, se rompen y llevan de un mundo a otro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, scopeStore } from '../src/shared/sim/store';
import { Multiverse } from '../src/shared/sim/Multiverse';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import { AIR, OBSIDIAN, FIRE, NETHERRACK, BEDROCK, LAVA, WATER, BEDS, isBed, isNetherPortal } from '../src/shared/blocks';
import { DIM_OVERWORLD, DIM_NETHER, dimensionDef, dimensionByKey } from '../src/shared/dimensions';
import { NetherGenerator, NETHER_LAVA_LEVEL } from '../src/shared/world/nether';
import { createGenerator } from '../src/shared/world/generators';
import { blockIndex } from '../src/shared/constants';
import { PORTAL_TICKS } from '../src/shared/sim/server/portals';
import { FakeConn } from './harness';

test('dimensiones: registro y generadores', () => {
  assert.equal(dimensionDef(DIM_NETHER).scale, 8);
  assert.ok(!dimensionDef(DIM_NETHER).skyLight && !dimensionDef(DIM_NETHER).beds && dimensionDef(DIM_NETHER).evaporatesWater);
  assert.equal(dimensionByKey('nether'), DIM_NETHER);
  assert.equal(dimensionByKey('Mundo normal'), DIM_OVERWORLD);
  assert.equal(dimensionDef(99).id, DIM_OVERWORLD, 'una desconocida es el mundo normal');
  assert.ok(createGenerator(DIM_NETHER, 1) instanceof NetherGenerator);
  const g = new NetherGenerator(12345);
  const { blocks } = g.generate(0, 0);
  assert.equal(blocks[blockIndex(3, 0, 3)], BEDROCK, 'suelo de lecho de roca');
  assert.equal(blocks[blockIndex(3, 127, 3)], BEDROCK, 'techo de lecho de roca');
  assert.equal(blocks[blockIndex(3, 200, 3)], AIR, 'aire por encima del techo');
  let rack = 0;
  for (let y = 1; y < 127; y++) for (let i = 0; i < 256; i++) if (blocks[blockIndex(i & 15, y, i >> 4)] === NETHERRACK) rack++;
  assert.ok(rack > 5000, 'rocanegra');
  // El mar de lava llega hasta y = 31: en una zona grande, el aire nunca toca la lava por debajo de él
  // (encima puede haber lava de manantiales y de las deltas, como en Java).
  let sea = 0;
  for (let cz = 0; cz < 4; cz++) for (let cx = 0; cx < 4; cx++) {
    const b = g.generate(cx, cz).blocks;
    for (let i = 0; i < 256; i++) if (b[blockIndex(i & 15, NETHER_LAVA_LEVEL, i >> 4)] === LAVA) sea++;
    for (let y = 1; y < NETHER_LAVA_LEVEL; y++) for (let i = 0; i < 256; i++) assert.notEqual(b[blockIndex(i & 15, y, i >> 4)], AIR, 'sin aire bajo el mar de lava');
  }
  assert.ok(sea > 0, 'hay mar de lava');
  const sp = g.findSpawn();
  assert.ok(sp.y > NETHER_LAVA_LEVEL && sp.y < 127, 'aparición sobre la lava y bajo el techo');
});

test('almacenamiento: cada dimensión guarda lo suyo; jugadores, semilla y hora son comunes', () => {
  const base = new MemoryStore();
  const ow = scopeStore(base, DIM_OVERWORLD), ne = scopeStore(base, DIM_NETHER);
  ow.saveChunkEdits('1,2', new Uint8Array([1]));
  ne.saveChunkEdits('1,2', new Uint8Array([2]));
  assert.deepEqual([...ow.loadChunkEdits('1,2')!], [1]);
  assert.deepEqual([...ne.loadChunkEdits('1,2')!], [2]);
  assert.deepEqual(ow.loadAllChunkEdits().map(([k]) => k), ['1,2'], 'el mundo normal no ve los chunks del Nether');
  assert.deepEqual(ne.loadAllChunkEdits().map(([k]) => k), ['1,2']);
  ow.saveContainer(7, 'a');
  ne.saveContainer(7, 'b');
  assert.deepEqual(ow.loadContainers(), [[7, 'a']]);
  assert.deepEqual(ne.loadContainers(), [[7, 'b']]);
  ne.setMeta('mobs', 'x');
  assert.equal(ow.getMeta('mobs'), null);
  ne.setMeta('time', 't');
  assert.equal(ow.getMeta('time'), 't', 'la hora es de todas');
  ne.savePlayer('ana', 'p');
  assert.equal(ow.loadPlayer('ana'), 'p', 'los jugadores son de todas');
});

/** Sala con varias dimensiones, reloj simulado y clientes falsos. */
function makeRoom(store = new MemoryStore()) {
  const clock = { now: 1_000_000 };
  let r = 0x1234;
  const rand = () => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296);
  const mv = new Multiverse(store, { seed: 12345, now: () => clock.now, flushSeconds: 5, rand });
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      clock.now += 50;
      mv.tick();
    }
  };
  const join = (name: string, mode: 's' | 'c' = 's') => {
    const conn = new FakeConn();
    mv.connect(conn);
    const send = (m: object) => mv.message(conn, JSON.stringify(m));
    send({ t: 'hello', v: PROTOCOL_VERSION, name, shirt: '#ff0000', mode });
    return { conn, send, pos: (x: number, y: number, z: number) => send({ t: 'pos', p: [x, y, z], r: [0, 0], s: 0 }) };
  };
  return { mv, store, tick, join, clock };
}

test('portal del Nether: se enciende con fuego, lleva al Nether (÷8) y de vuelta al mismo portal', () => {
  const room = makeRoom();
  const a = room.join('ana', 'c');
  const w0 = a.conn.take('welcome')[0];
  assert.equal(w0.dim, DIM_OVERWORLD);
  const ow = room.mv.overworld;
  // Marco de 4×5 a lo largo de x, a 80 bloques del origen (en el Nether, a 10).
  const x0 = 80, z0 = 40, y0 = 120;
  const W = ow.world;
  W.ensureChunk(4, 2);
  W.ensureChunk(5, 2);
  for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) {
    const edge = i === -1 || i === 2 || j === -1 || j === 3;
    W.setBlock(x0 + i, y0 + j, z0, edge ? OBSIDIAN : AIR);
  }
  W.setBlock(x0, y0, z0, FIRE);
  for (let i = 0; i <= 1; i++) for (let j = 0; j <= 2; j++) assert.ok(isNetherPortal(W.getBlock(x0 + i, y0 + j, z0)), `portal en ${i},${j}`);
  // Entra (en creativo viaja al momento).
  a.send({ t: 'dimok', d: DIM_OVERWORLD });
  a.pos(x0 + 0.5, y0, z0 + 0.5);
  room.tick(2);
  const w1 = a.conn.take('welcome')[0];
  assert.ok(w1, 'llega la bienvenida de la otra dimensión');
  assert.equal(w1.dim, DIM_NETHER);
  assert.equal(room.mv.dimensionOf(a.conn), DIM_NETHER);
  const [nx, ny, nz] = w1.at;
  assert.ok(Math.abs(nx - x0 / 8) <= 18 && Math.abs(nz - z0 / 8) <= 18, `cerca de x/8, z/8 (${nx}, ${nz})`);
  const NW = room.mv.server(DIM_NETHER).world;
  assert.ok(isNetherPortal(NW.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))), 'aparece dentro de un portal nuevo del Nether');
  assert.equal(JSON.parse(room.store.loadPlayer('ana')!).dim, DIM_NETHER, 'el registro guarda la dimensión');
  // Hasta que su cliente monta el Nether, lo que manda no cuenta; y al llegar no vuelve a viajar.
  a.pos(0, 200, 0);
  room.tick(2);
  assert.equal(room.mv.dimensionOf(a.conn), DIM_NETHER);
  a.send({ t: 'dimok', d: DIM_NETHER });
  a.pos(nx, ny, nz);
  room.tick(5);
  assert.equal(room.mv.dimensionOf(a.conn), DIM_NETHER, 'recién llegado, el portal no lo devuelve');
  // Sale del portal y vuelve a entrar: al mundo normal, al portal de antes.
  a.pos(nx + 3, ny, nz + 3);
  room.tick(1);
  a.pos(nx, ny, nz);
  room.tick(2);
  const w2 = a.conn.take('welcome')[0];
  assert.equal(w2?.dim, DIM_OVERWORLD, 'vuelve al mundo normal');
  const [bx, , bz] = w2.at;
  assert.ok(Math.floor(bx) >= x0 && Math.floor(bx) <= x0 + 1 && Math.floor(bz) === z0, `al mismo portal (${bx}, ${bz})`);
});

test('portal del Nether: sin marco completo no se enciende; romper la obsidiana lo apaga', () => {
  const room = makeRoom();
  room.join('ana', 'c');
  const W = room.mv.overworld.world;
  const x0 = 10, z0 = 10, y0 = 130;
  W.ensureChunk(0, 0);
  const frame = (skip = -99) => {
    let n = 0;
    for (let i = -1; i <= 2; i++) for (let j = -1; j <= 3; j++) {
      const edge = i === -1 || i === 2 || j === -1 || j === 3;
      if (edge && n++ === skip) continue;
      W.setBlock(x0, y0 + j, z0 + i, edge ? OBSIDIAN : AIR); // a lo largo de z
    }
  };
  frame(5); // le falta un bloque de la pared
  W.setBlock(x0, y0 + 3, z0 + 2, AIR);
  W.setBlock(x0, y0, z0, FIRE);
  assert.ok(!isNetherPortal(W.getBlock(x0, y0, z0)), 'marco incompleto: no hay portal');
  W.setBlock(x0, y0, z0, AIR);
  frame();
  W.setBlock(x0, y0 + 1, z0 + 1, FIRE);
  assert.ok(isNetherPortal(W.getBlock(x0, y0, z0)) && isNetherPortal(W.getBlock(x0, y0 + 2, z0 + 1)), 'marco completo: portal');
  W.setBlock(x0, y0 - 1, z0, AIR); // se rompe la obsidiana del suelo
  for (let i = 0; i <= 1; i++) for (let j = 0; j <= 2; j++) assert.equal(W.getBlock(x0, y0 + j, z0 + i), AIR, 'el portal se apaga entero');
});

test('dimensiones: al volver a entrar se sigue en el Nether; reaparecer desde allí lleva al mundo normal', () => {
  const room = makeRoom();
  const a = room.join('ana');
  a.conn.take('welcome');
  // Sale y su registro dice que está en el Nether.
  room.mv.disconnect(a.conn);
  room.store.savePlayer('ana', JSON.stringify({ ...JSON.parse(room.store.loadPlayer('ana')!), dim: DIM_NETHER }));
  const b = room.join('ana');
  const w = b.conn.take('welcome')[0];
  assert.equal(w.dim, DIM_NETHER, 'entra en la dimensión guardada');
  b.send({ t: 'dimok', d: DIM_NETHER });
  b.send({ t: 'respawn' });
  const w2 = b.conn.take('welcome')[0];
  assert.equal(w2?.dim, DIM_OVERWORLD, 'reaparece en el mundo normal');
  // El chat llega de una dimensión a otra.
  const c = room.join('bea');
  c.conn.take('welcome');
  b.send({ t: 'dimok', d: DIM_OVERWORLD });
  c.send({ t: 'chat', m: 'hola' });
  assert.ok(b.conn.take('chat').some((m) => m.m === 'hola'));
});

test('reglas del Nether: el agua se evapora, la cama explota; /fill, /setblock y /dimension', () => {
  const room = makeRoom();
  const a = room.join('ana', 'c');
  a.conn.take('welcome');
  a.send({ t: 'chat', m: '/dimension nether' });
  const w = a.conn.take('welcome')[0];
  assert.equal(w?.dim, DIM_NETHER, '/dimension lleva al Nether');
  a.send({ t: 'dimok', d: DIM_NETHER });
  const [px, py, pz] = w.at.map(Math.floor);
  a.pos(px + 0.5, py, pz + 0.5);
  const NW = room.mv.server(DIM_NETHER).world;
  // /fill y /setblock (coordenadas relativas).
  a.send({ t: 'chat', m: '/fill ~1 ~ ~ ~3 ~ ~ obsidian' });
  assert.equal(NW.getBlock(px + 2, py, pz), OBSIDIAN, '/fill con ~');
  a.send({ t: 'chat', m: `/setblock ${px + 1} ${py + 1} ${pz} netherrack` });
  assert.equal(NW.getBlock(px + 1, py + 1, pz), NETHERRACK, '/setblock');
  // Agua: se evapora (sisea) y no queda.
  a.send({ t: 'chat', m: `/setblock ${px - 1} ${py} ${pz} air` });
  a.conn.take('fx');
  a.send({ t: 'set', x: px - 1, y: py, z: pz, b: WATER });
  assert.notEqual(NW.getBlock(px - 1, py, pz), WATER, 'el agua no se queda');
  assert.ok(a.conn.take('fx').some((m) => m.k === 'fire_extinguish'), 'sisea');
  // Cama: explota al usarla.
  a.send({ t: 'chat', m: `/fill ${px - 2} ${py - 1} ${pz + 2} ${px + 2} ${py - 1} ${pz + 4} netherrack` });
  a.send({ t: 'chat', m: `/fill ${px - 2} ${py} ${pz + 1} ${px + 2} ${py + 2} ${pz + 5} air` });
  a.send({ t: 'place', x: px, y: py - 1, z: pz + 3, n: [0, 1, 0], p: [px + 0.5, py, pz + 3.5], item: BEDS.red, yaw: 0 });
  const bed = NW.getBlock(px, py, pz + 3);
  assert.ok(isBed(bed), 'hay cama');
  a.conn.take('fx');
  a.send({ t: 'use', x: px, y: py, z: pz + 3, yaw: 0 });
  assert.equal(NW.getBlock(px, py, pz + 3), AIR, `la cama (${bed}) desaparece`);
  assert.ok(a.conn.take('fx').some((m) => m.k === 'explode'), 'explota');
  void FIRE;
});
