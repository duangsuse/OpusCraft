// Fase 8.6 (el End): el End como dimensión (terreno, biomas, coro) y las fortalezas con el portal del End (piezas,
// anillos, botín, marcos y ojos de ender, perla de ender y endermita).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, STONE_BRICKS, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, END_STONE, OBSIDIAN, BEDROCK, END_GATEWAY, DRAGON_EGG, isFire, END_PORTAL_FRAME, END_PORTAL, CHORUS_PLANT, CHORUS_FLOWER, stateOf, stateProps, isEndPortalFrame,
} from '../src/shared/blocks';
import { ENDER_EYE, ENDER_PEARL, END_CRYSTAL, BLAZE_POWDER, itemSpriteIndex, SPAWN_EGGS, CREATIVE_ITEMS } from '../src/shared/items';
import { MOBS, MOB_ENDERMITE, MOB_ENDER_DRAGON, ENT_END_CRYSTAL, ENT_XP } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { mulberry32 } from '../src/shared/world/noise';
import { strongholdPieces, strongholdsNear, locateStronghold, STRONGHOLD_RINGS } from '../src/shared/world/stronghold';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { EndGenerator, END_SPAWN } from '../src/shared/world/end';
import { BIOME_THE_END, isEndBiome } from '../src/shared/world/biomeIds';
import { blockIndex } from '../src/shared/constants';
import { DIM_END } from '../src/shared/dimensions';
import { endSpikes, gatewayPos } from '../src/shared/world/endIsland';
import { makeServer } from './harness';

test('el End: la isla central, el vacío, la plataforma de llegada y las plantas de coro en las tierras altas', () => {
  const gen = new EndGenerator(8601);
  assert.equal(gen.biomeAt(0, 0), BIOME_THE_END);
  // La isla central: piedra del End en el centro; a 300 bloques, vacío (los chunks cercanos al centro).
  assert.ok(gen.surfaceAt(0, 0) > 40, 'la isla central tiene suelo');
  assert.equal(gen.surfaceAt(300, 0), -1, 'entre la isla central y las exteriores, vacío');
  // La plataforma de obsidiana donde se llega, con aire encima.
  const [px, py, pz] = END_SPAWN;
  const c = gen.generate(px >> 4, pz >> 4);
  assert.equal(c.blocks[blockIndex(px & 15, py, pz & 15)], AIR);
  assert.notEqual(c.blocks[blockIndex(px & 15, py - 1, pz & 15)], AIR);
  // Plantas de coro en las tierras altas de las islas exteriores.
  let chorus = 0, stone = 0;
  for (let cz = 60; cz < 72 && chorus === 0; cz++) {
    for (let cx = 60; cx < 72; cx++) {
      assert.ok(isEndBiome(gen.biomeAt(cx * 16, cz * 16)));
      for (const b of gen.generate(cx, cz).blocks) {
        if (b === CHORUS_PLANT || (b >= CHORUS_FLOWER && b < CHORUS_FLOWER + 6)) chorus++;
        else if (b === END_STONE) stone++;
      }
    }
  }
  assert.ok(stone > 0 && chorus > 0, `islas exteriores con coro (${stone} piedra, ${chorus} coro)`);
});

test('fortalezas: siempre con sala del portal, enterradas, en anillos y con su botín', () => {
  for (let s = 0; s < 30; s++) {
    const pieces = strongholdPieces(9000 + s, 5, 7);
    assert.equal(pieces[0].kind, 'start');
    assert.equal(pieces.filter((p) => p.kind === 'portal_room').length, 1, 'una sala del portal');
    assert.ok(pieces.filter((p) => p.kind === 'library').length <= 2 && pieces.filter((p) => p.kind === 'prison_hall').length <= 5);
    // Enterrada por debajo del nivel del mar (moveBelowSeaLevel: 10 por debajo) y sin salirse del mundo.
    const top = Math.max(...pieces.map((p) => p.box.y1)), bottom = Math.min(...pieces.map((p) => p.box.y0));
    assert.ok(top <= 53 && bottom >= -64, `entre y = ${bottom} y ${top}`);
    // Las piezas no se solapan (salvo los tramos de relleno, que entran en la pared de la pieza con la que chocan).
    const solid = pieces.filter((p) => p.kind !== 'filler_corridor');
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) assert.ok(!solid[i].box.intersects(solid[j].box));
    // La sala del portal, a más de 5 de hondura; las bibliotecas, a más de 4.
    for (const p of pieces) {
      if (p.kind === 'portal_room') assert.ok(p.depth > 5);
      if (p.kind === 'library') assert.ok(p.depth > 4);
    }
  }
  // El primer anillo: tres fortalezas a unos 128 chunks (± 40) del origen.
  const gen = new TerrainGenerator(8602);
  const at = locateStronghold(gen, 0, 0)!;
  const d = Math.hypot(at[0], at[2]) / 16;
  assert.ok(d > 128 - 40 - 8 && d < 128 + 40 + 8, `la más cercana, a ${d.toFixed(0)} chunks`);
  assert.equal(STRONGHOLD_RINGS.count, 128);
  const near = strongholdsNear(gen, at[0], at[2], at[0], at[2]);
  assert.equal(near.length, 1);
  // Al generar su chunk de partida sale la escalera de ladrillos de piedra.
  const c = gen.generate(at[0] >> 4, at[2] >> 4);
  let bricks = 0;
  for (const b of c.blocks) if (b === STONE_BRICKS || b === MOSSY_STONE_BRICKS || b === CRACKED_STONE_BRICKS) bricks++;
  assert.ok(bricks > 20, `escalera de entrada (${bricks} ladrillos)`);
  // Botín: pasillo (perlas de ender, diamantes…), almacén y biblioteca (libros y papel).
  const r = mulberry32(3);
  const got = new Set<number>();
  for (let i = 0; i < 300; i++) for (const s of rollLoot(LOOT_TABLES.stronghold_corridor, r)) got.add(s.id);
  assert.ok(got.has(ENDER_PEARL));
  for (const t of ['stronghold_crossing', 'stronghold_library']) assert.ok(rollLoot(LOOT_TABLES[t], r).length > 0);
});

test('ojo de ender: receta, sprite; el huevo de la endermita', () => {
  assert.equal(matchRecipe([BLAZE_POWDER, ENDER_PEARL, 0, 0, 0, 0, 0, 0, 0], 3)?.out.id, ENDER_EYE);
  assert.ok(itemSpriteIndex(ENDER_EYE) >= 0 && CREATIVE_ITEMS.includes(ENDER_EYE));
  assert.ok(SPAWN_EGGS.endermite && MOBS[MOB_ENDERMITE].key === 'endermite');
  assert.ok(MOBS[MOB_ENDERMITE].health === 8 && MOBS[MOB_ENDERMITE].damage === 2);
});

test('marcos del portal del End: el ojo se engasta y con los doce mirando hacia dentro se abre el portal', () => {
  const h = makeServer(8603);
  const W = h.gs.world;
  const c = h.join('ana');
  W.ensureChunk(0, 0, h.clock.now);
  const y = 60;
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) {
    W.setBlock(x, y - 1, z, STONE);
    for (let yy = y; yy < y + 3; yy++) W.setBlock(x, yy, z, AIR);
  }
  // El anillo alrededor del hueco (2..4, 2..4): cada lado mira hacia el centro (0 norte, 1 este, 2 sur, 3 oeste).
  const frames: [number, number, number][] = [];
  for (let i = 2; i <= 4; i++) {
    frames.push([i, 1, 2], [i, 5, 0], [1, i, 1], [5, i, 3]);
  }
  for (const [x, z, f] of frames) W.setBlock(x, y, z, stateOf(END_PORTAL_FRAME, { facing: f, eye: 0 }));
  c.pos(3.5, y, 3.5);
  for (const [x, z] of frames.slice(0, 11)) c.send({ t: 'use', x, y, z, yaw: 0, item: ENDER_EYE });
  assert.equal(W.getBlock(3, y, 3), AIR, 'con once ojos, aún no');
  assert.equal(stateProps(W.getBlock(frames[0][0], y, frames[0][1]))?.eye, 1);
  // El marco con ojo no admite otro (y otros objetos no hacen nada).
  const [lx, lz] = frames[11];
  c.send({ t: 'use', x: lx, y, z: lz, yaw: 0, item: STONE });
  assert.equal(stateProps(W.getBlock(lx, y, lz))?.eye, 0);
  c.send({ t: 'use', x: lx, y, z: lz, yaw: 0, item: ENDER_EYE });
  for (let x = 2; x <= 4; x++) for (let z = 2; z <= 4; z++) assert.equal(W.getBlock(x, y, z), END_PORTAL, `portal en ${x},${z}`);
  assert.ok(isEndPortalFrame(W.getBlock(lx, y, lz)));
});

test('ojo de ender lanzado vuela hacia la fortaleza; la perla lleva a su dueño a donde cae', () => {
  const h = makeServer(8604);
  const W = h.gs.world;
  const c = h.join('ana');
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x <= 3; x++) for (let z = 0; z <= 12; z++) {
    W.setBlock(x, 99, z, STONE);
    for (let y = 100; y < 110; y++) W.setBlock(x, y, z, AIR);
  }
  W.setBlock(0, 100, 10, STONE);
  W.setBlock(0, 101, 10, STONE);
  c.pos(0.5, 100, 0.5);
  c.send({ t: 'throw', p: [0.5, 101.6, 0.5], d: [0, 0, -1], item: ENDER_EYE });
  const eye = [...h.gs.entities.list.values()].find((e) => e.stack?.id === ENDER_EYE);
  assert.ok(eye?.eyeTarget, 'sale un ojo con destino');
  const target = locateStronghold(h.gs.world.gen, 0, 0)!;
  const want = Math.atan2(target[2], target[0]), got = Math.atan2(eye!.eyeTarget![2] - 0.5, eye!.eyeTarget![0] - 0.5);
  assert.ok(Math.abs(want - got) < 0.05, 'apunta hacia la fortaleza');
  h.tick(40);
  assert.ok(eye!.y > 101, 'sube');
  h.tick(60);
  assert.ok(!h.gs.entities.list.has(eye!.id), 'a los 80 ticks cae o se rompe');
  // La perla choca con la columna a 10 bloques y su dueño aparece allí.
  c.conn.take('moveTo');
  c.send({ t: 'throw', p: [0.5, 100.8, 0.8], d: [0, 0, 1], item: ENDER_PEARL });
  h.tick(20);
  const moved = c.conn.take('moveTo');
  assert.equal(moved.length, 1, 'la perla lo mueve');
  assert.ok(moved[0].p[2] > 8 && moved[0].p[2] < 10.2, `junto a la columna: ${JSON.stringify(moved[0].p)}`);
});

// ------------------------------------------------------------------ Fase 8.6 (3/4): la isla del dragón

test('isla del dragón: diez pilares (dos con jaula) con lecho de roca y fuego arriba, y el podio apagado', () => {
  const gen = new EndGenerator(8605);
  const spikes = endSpikes(8605);
  assert.equal(spikes.length, 10);
  assert.equal(spikes.filter((s) => s.guarded).length, 2);
  const heights = spikes.map((s) => s.height).sort((a, b) => a - b);
  assert.deepEqual(heights, [76, 79, 82, 85, 88, 91, 94, 97, 100, 103]);
  const s = spikes[0];
  const c = gen.generate(s.x >> 4, s.z >> 4);
  const at = (x: number, y: number, z: number) => c.blocks[blockIndex(x & 15, y, z & 15)];
  assert.equal(at(s.x, s.height - 1, s.z), OBSIDIAN);
  assert.equal(at(s.x, s.height, s.z), BEDROCK);
  assert.ok(isFire(at(s.x, s.height + 1, s.z)));
  // El podio: la columna de lecho de roca en el centro y el hueco del portal (aún sin portal).
  const y = gen.surfaceAt(0, 0);
  const p = gen.generate(0, 0);
  const pat = (x: number, yy: number, z: number) => p.blocks[blockIndex(x & 15, yy, z & 15)];
  assert.equal(pat(0, y + 3, 0), BEDROCK);
  assert.equal(pat(2, y, 0), AIR);
  assert.equal(pat(3, y, 0), BEDROCK);
});

test('combate: cristales y dragón al llegar, daño por partes, curación y muerte con portal, huevo y puerta', () => {
  const h = makeServer(8606, undefined, DIM_END);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(0.5, 90, 0.5);
  h.tick(5);
  const ents = h.gs.entities;
  const crystals = () => [...ents.list.values()].filter((e) => e.type === ENT_END_CRYSTAL);
  const dragon = () => [...ents.list.values()].find((e) => e.type === MOB_ENDER_DRAGON);
  assert.equal(crystals().length, 10, 'un cristal en cada pilar');
  const d = dragon()!;
  assert.ok(d && d.health === 200, 'el dragón, con toda la vida');
  assert.ok(c.conn.take('boss').length > 0, 'la barra del jefe');
  // Vuela (y no se sale de la isla).
  h.tick(200);
  assert.ok(Math.hypot(d.x, d.z) < 160 && d.y > 40, `vuela sobre la isla: ${d.x.toFixed(0)}, ${d.y.toFixed(0)}, ${d.z.toFixed(0)}`);
  // Golpe en la cabeza (entero) y en el cuerpo (un cuarto + 1).
  const hp = d.health;
  ents.dragon.hurt(d, 0, 20, 'ana');
  assert.equal(d.health, hp - 20);
  h.tick(12);
  const hp2 = d.health;
  ents.dragon.hurt(d, 2, 20, 'ana');
  assert.equal(d.health, hp2 - 6);
  // Un cristal que estalla: si era el que lo curaba, el dragón pierde 10.
  const cr = crystals()[0];
  ents.dragon.crystalHit(cr, 'ana');
  assert.ok(!ents.list.has(cr.id));
  assert.equal(crystals().length, 9);
  // Casi muerto: va a morir al podio, sube 200 ticks y el combate termina.
  d.health = 1;
  ents.dragon.hurt(d, 0, 50, 'ana');
  for (let i = 0; i < 4000 && dragon(); i++) h.tick(1);
  assert.equal(dragon(), undefined, 'el dragón terminó de morir');
  const y = (W.gen as EndGenerator).surfaceAt(0, 0);
  assert.equal(W.getBlock(2, y, 0), END_PORTAL, 'portal de salida encendido');
  assert.equal(W.getBlock(0, y + 4, 0), DRAGON_EGG, 'el huevo encima de la columna');
  let gateway = 0;
  for (let i = 0; i < 20; i++) {
    const [gx, gy, gz] = gatewayPos(i);
    if (W.getBlock(gx, gy, gz) === END_GATEWAY) gateway++;
  }
  assert.equal(gateway, 1, 'sale una puerta del End');
  assert.ok([...ents.list.values()].some((e) => e.type === ENT_XP), 'suelta experiencia');
});

test('reaparición: cuatro cristales en los lados del portal rehacen los pilares y traen otro dragón', () => {
  const h = makeServer(8607, undefined, DIM_END);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(0.5, 90, 0.5);
  h.tick(5);
  const ents = h.gs.entities;
  const d = [...ents.list.values()].find((e) => e.type === MOB_ENDER_DRAGON)!;
  d.health = 1;
  ents.dragon.hurt(d, 0, 50, 'ana');
  for (let i = 0; i < 4000 && ents.list.has(d.id); i++) h.tick(1);
  const y = (W.gen as EndGenerator).surfaceAt(0, 0);
  // Cristales sobre el borde de lecho de roca, uno en cada lado.
  c.pos(0.5, y + 1, 4.5);
  for (const [x, z] of [[0, -3], [3, 0], [0, 3], [-3, 0]]) {
    assert.equal(W.getBlock(x, y, z), BEDROCK);
    c.send({ t: 'use', x, y, z, yaw: 0, item: END_CRYSTAL });
  }
  h.tick(100 + 40 * 11 + 120);
  const again = [...ents.list.values()].find((e) => e.type === MOB_ENDER_DRAGON);
  assert.ok(again, 'un dragón nuevo');
  assert.equal(W.getBlock(2, y, 0), AIR, 'el portal se apaga');
});

test('puertas del End: la del anillo lleva lejos (y deja una de vuelta); el huevo salta al usarlo', () => {
  const h = makeServer(8608, undefined, DIM_END);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(0.5, 90, 0.5);
  h.tick(5);
  const [gx, gy, gz] = gatewayPos(3);
  W.ensureChunk(gx >> 4, gz >> 4, h.clock.now);
  W.setBlock(gx, gy, gz, END_GATEWAY);
  c.conn.take('moveTo');
  c.pos(gx + 0.5, gy, gz + 0.5);
  h.tick(2);
  const moved = c.conn.take('moveTo');
  assert.equal(moved.length, 1, 'la puerta lleva a otro sitio');
  const [tx, , tz] = moved[0].p;
  assert.ok(Math.hypot(tx, tz) > 700, `lejos del centro: ${tx.toFixed(0)}, ${tz.toFixed(0)}`);
  assert.ok(c.conn.take('chat').some((m) => /Puerta del End al otro lado: -?\d+, -?\d+, -?\d+/.test(String(m.m))), 'avisa de la puerta de vuelta');
  // El huevo: al usarlo salta a otro sitio.
  W.ensureChunk(0, 0, h.clock.now);
  const y = 100;
  for (let x = -16; x < 16; x++) for (let z = -16; z < 16; z++) for (let yy = y - 8; yy < y + 8; yy++) if (W.isLoaded(x >> 4, z >> 4)) W.setBlock(x, yy, z, yy === y - 1 ? STONE : AIR);
  W.setBlock(2, y, 2, DRAGON_EGG);
  c.pos(2.5, y, 4.5);
  c.send({ t: 'use', x: 2, y, z: 2, yaw: 0, item: 0 });
  assert.notEqual(W.getBlock(2, y, 2), DRAGON_EGG, 'el huevo ya no está ahí');
});

test('puertas del End: una perla que entra lleva a su dueño y un objeto que cae dentro sale lejos', () => {
  const h = makeServer(8609, undefined, DIM_END);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(0.5, 90, 0.5);
  h.tick(5);
  const [gx, gy, gz] = gatewayPos(5);
  W.ensureChunk(gx >> 4, gz >> 4, h.clock.now);
  W.setBlock(gx, gy, gz, END_GATEWAY);
  for (let dx = -6; dx < 0; dx++) W.setBlock(gx + dx, gy, gz, AIR);
  // El objeto: suelto dentro de la puerta.
  const item = h.gs.entities.spawnItem({ id: DIAMOND, count: 1 }, gx + 0.5, gy + 0.3, gz + 0.5);
  h.tick(3);
  assert.ok(Math.hypot(item.x, item.z) > 700, `el objeto sale lejos: ${item.x.toFixed(0)}, ${item.z.toFixed(0)}`);
  // La perla: lanzada hacia la puerta, en vez de romperse lleva a su dueño a su salida.
  c.conn.take('moveTo');
  c.pos(gx - 4.5, gy - 1, gz + 0.5);
  c.send({ t: 'throw', p: [gx - 4.5, gy + 0.5, gz + 0.5], d: [1, 0, 0], item: ENDER_PEARL });
  h.tick(9);
  const moved = c.conn.take('moveTo');
  assert.equal(moved.length, 1, 'la perla lo lleva por la puerta');
  assert.ok(Math.hypot(moved[0].p[0], moved[0].p[2]) > 700, `lejos del centro: ${JSON.stringify(moved[0].p)}`);
  assert.ok(![...h.gs.entities.list.values()].some((e) => e.stack?.id === ENDER_PEARL), 'la perla desaparece');
});

// ------------------------------------------------------------------ parte 4: ciudades del End, shulkers, élitros, cajas

import { endCityPieces, endCityTemplate, cityBounds } from '../src/shared/world/endCity';
import { PURPUR_BLOCK, SHULKER_BOXES, ENDER_CHEST, isShulkerBox, shulkerBoxFacing } from '../src/shared/blocks';
import { ELYTRA, SHULKER_SHELL, DIAMOND, DYES } from '../src/shared/items';
import { MOB_SHULKER, ENT_SHULKER_BULLET, shulkerPeekState } from '../src/shared/mobs';
import { EFFECT_LEVITATION } from '../src/shared/effects';
import { glideTick, rocketBoostTick, canGlideWith, ELYTRA_DURABILITY } from '../src/shared/elytra';
import { shulkerDyeCraft } from '../src/shared/craftSpecials';
import { stackToWire } from '../src/shared/protocol';
import { ENT_FRAME } from '../src/shared/paintings';
import { CHEST } from '../src/shared/blocks';

test('ciudades del End: en las tierras altas, con sus piezas unidas, cofres, shulkers y el barco con los élitros', () => {
  const gen = new EndGenerator(12345);
  const at = gen.locateCity(2000, 0, 12);
  assert.ok(at, 'hay una ciudad cerca');
  const city = gen.citiesNear(at[0], at[2], at[0], at[2])[0];
  assert.ok(city.y >= 60, 'no más baja de y = 60');
  // Cada pieza cabe en su caja (las medidas de las plantillas de Java).
  for (const p of city.pieces) {
    const [w, h, d] = endCityTemplate(p.name).size;
    assert.equal(p.box.y1 - p.box.y0 + 1, h);
    assert.equal((p.box.x1 - p.box.x0 + 1) * (p.box.z1 - p.box.z0 + 1), w * d);
  }
  let chests = 0, shulkers = 0, purpur = 0;
  for (let cx = city.box.x0 >> 4; cx <= city.box.x1 >> 4; cx++) {
    for (let cz = city.box.z0 >> 4; cz <= city.box.z1 >> 4; cz++) {
      const r = gen.generate(cx, cz);
      chests += r.chests.filter((c) => c.table === 'end_city_treasure').length;
      shulkers += r.mobs.filter((m) => m.type === MOB_SHULKER).length;
      for (const b of r.blocks) if (b === PURPUR_BLOCK) purpur++;
    }
  }
  assert.ok(chests > 0 && shulkers > 0 && purpur > 1000, `${chests} cofres, ${shulkers} shulkers`);
  // Entre muchas ciudades, alrededor de la mitad llevan barco (con su marco de élitros).
  let n = 0, ships = 0, frames = 0;
  for (let rx = -8; rx <= 8; rx++) {
    for (let rz = -8; rz <= 8; rz++) {
      const c = gen.cityInRegion(rx, rz);
      if (!c) continue;
      n++;
      const ship = c.pieces.find((p) => p.name === 'ship');
      if (!ship) continue;
      ships++;
      if (ships > 2) continue;
      for (let cx = ship.box.x0 >> 4; cx <= ship.box.x1 >> 4; cx++) {
        for (let cz = ship.box.z0 >> 4; cz <= ship.box.z1 >> 4; cz++) frames += gen.generate(cx, cz).mobs.filter((m) => m.type === ENT_FRAME && m.variant === ELYTRA).length;
      }
    }
  }
  assert.ok(n > 10 && ships > n * 0.25 && ships < n * 0.85, `${ships} barcos en ${n} ciudades`);
  assert.equal(frames, 2, 'cada barco, su marco con los élitros');
  // Siempre las mismas piezas con la misma semilla.
  assert.deepEqual(cityBounds(endCityPieces(7, 0, 70, 0, 0)), cityBounds(endCityPieces(7, 0, 70, 0, 0)));
});

test('shulker: se abre al ver a un jugador, dispara balas que dan Levitación, cerrado aguanta y suelta su caparazón', () => {
  const h = makeServer(8611, undefined, DIM_END);
  const W = h.gs.world;
  const c = h.join('ana');
  c.pos(0.5, 101, 0.5);
  h.tick(5);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) W.ensureChunk(cx, cz, h.clock.now);
  for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) for (let y = 98; y < 110; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  const ents = h.gs.entities;
  const e = ents.spawnMob(MOB_SHULKER, 0.3, 100.2, 8.7)!;
  assert.deepEqual([e.x, e.y, e.z], [0.5, 100, 8.5], 'en el centro de su celda');
  c.pos(0.5, 100, 0.5);
  h.tick(40);
  assert.equal(shulkerPeekState(e.variant!), 2, 'abierto');
  let bullet = false, lev = false;
  for (let i = 0; i < 400 && !lev; i++) {
    h.tick(1);
    bullet ||= [...ents.list.values()].some((b) => b.type === ENT_SHULKER_BULLET);
    lev ||= c.conn.take('effect').some((m) => m.id === EFFECT_LEVITATION);
  }
  assert.ok(bullet && lev, 'la bala le alcanza y le da Levitación');
  c.pos(0.5, 100, -40);
  h.tick(200);
  assert.equal(shulkerPeekState(e.variant!), 0, 'sin nadie, se cierra');
  const hp = e.health;
  ents.damage(e, 10, 0, 0, null);
  assert.equal(hp - e.health, 4, 'cerrado, 20 de armadura: 10 de daño se quedan en 4');
  let shells = 0;
  for (let i = 0; i < 40; i++) ents.kill(ents.spawnMob(MOB_SHULKER, 5.5, 100, 5.5)!, true);
  for (const it of ents.list.values()) if (it.stack?.id === SHULKER_SHELL) shells++;
  assert.ok(shells > 8 && shells < 32, `la mitad sueltan caparazón (${shells} de 40)`);
});

test('élitros: planeo, cohetes y picado con los números de Java; se gastan hasta un uso', () => {
  const v = { x: 0, y: 0, z: -0.3 };
  let dx = 0, dy = 0;
  for (let i = 0; i < 400; i++) {
    glideTick(v, 0, -0.2);
    if (i >= 200) {
      dx += Math.hypot(v.x, v.z);
      dy += v.y;
    }
  }
  assert.ok(dx / -dy > 8 && dx / -dy < 11, 'planea unos 9 bloques por cada uno que baja');
  const w = { x: 0, y: 0, z: -0.5 };
  for (let i = 0; i < 40; i++) {
    rocketBoostTick(w, 0, 0);
    glideTick(w, 0, 0);
  }
  assert.ok(Math.abs(Math.hypot(w.x, w.y, w.z) * 20 - 33.5) < 1, 'con cohete, 33,5 bloques/s');
  const u = { x: 0, y: -0.5, z: -0.2 };
  for (let i = 0; i < 200; i++) glideTick(u, 0, -Math.PI / 2 + 0.01);
  assert.ok(Math.abs(Math.hypot(u.x, u.y, u.z) * 20 - 77) < 3, 'en picado, unos 77 bloques/s');
  assert.ok(canGlideWith({ id: ELYTRA, count: 1, dmg: ELYTRA_DURABILITY - 2 }));
  assert.ok(!canGlideWith({ id: ELYTRA, count: 1, dmg: ELYTRA_DURABILITY - 1 }), 'con un uso, ya no');
});

test('cajas de shulker (guardan lo suyo, 17 colores, no se abren tapadas) y cofre de ender (de cada jugador)', () => {
  const h = makeServer(8612);
  const W = h.gs.world;
  const c = h.join('ana');
  c.pos(2.5, 100, 2.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) for (let y = 99; y < 104; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  assert.equal(Object.keys(SHULKER_BOXES).length, 17);
  assert.equal(matchRecipe([0, SHULKER_SHELL, 0, 0, CHEST, 0, 0, SHULKER_SHELL, 0], 3)?.out.id, SHULKER_BOXES['']);
  const dyed = shulkerDyeCraft([{ id: SHULKER_BOXES[''], count: 1, bag: [{ id: DIAMOND, count: 5 }], data: { slots: [3] } }, { id: DYES.red, count: 1 }]);
  assert.equal(dyed?.id, SHULKER_BOXES.red);
  assert.equal(dyed?.bag?.[0].count, 5, 'teñida, con lo que llevaba');
  c.send({ t: 'place', x: 2, y: 99, z: 2, n: [0, 1, 0], p: [2.5, 100, 2.5], item: SHULKER_BOXES.red, yaw: 0, bx: stackToWire(dyed!)! });
  const id = W.getBlock(2, 100, 2);
  assert.ok(isShulkerBox(id) && shulkerBoxFacing(id) === 2, 'puesta con la tapa hacia arriba');
  c.send({ t: 'set', x: 2, y: 100, z: 2, b: 0, tool: 0 });
  h.tick(2);
  const drops = [...h.gs.entities.list.values()].filter((e) => e.stack);
  assert.equal(drops.length, 1, 'cae una sola pila: la caja');
  assert.equal(drops[0].stack!.bag?.[0].count, 5);
  assert.deepEqual(drops[0].stack!.data?.slots, [3], 'cada cosa en su hueco');
  c.send({ t: 'place', x: 4, y: 99, z: 4, n: [0, 1, 0], p: [4.5, 100, 4.5], item: SHULKER_BOXES[''], yaw: 0 });
  W.setBlock(4, 101, 4, STONE);
  c.conn.take('cont');
  c.send({ t: 'open', x: 4, y: 100, z: 4 });
  assert.equal(c.conn.take('cont').length, 0, 'con la tapa tapada no se abre');
  W.setBlock(6, 100, 6, ENDER_CHEST);
  c.pos(5.5, 100, 5.5);
  h.tick(1);
  c.send({ t: 'open', x: 6, y: 100, z: 6 });
  assert.equal(c.conn.take('cont').length, 1);
  c.send({ t: 'cput', x: 6, y: 100, z: 6, q: 1, stack: { id: DIAMOND, count: 7 } });
  const b = h.join('bea');
  b.pos(6.5, 101, 5.5);
  h.tick(2);
  b.send({ t: 'open', x: 6, y: 100, z: 6 });
  assert.ok(!JSON.stringify(b.conn.take('cont')[0].c).includes(`[${DIAMOND},7`), 'el de otro jugador está vacío');
  h.tick(200);
  const rec = JSON.parse((h.store as unknown as { players: Map<string, string> }).players.get('ana')!);
  assert.ok(rec.ender?.some((x: unknown) => Array.isArray(x) && x[0] === DIAMOND && x[1] === 7), 'se guarda con el jugador');
});
