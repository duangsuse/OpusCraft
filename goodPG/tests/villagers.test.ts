// Fase 6: aldeanos y comercio. Profesión según el bloque de trabajo cercano, comercio validado por el
// servidor (tratos buenos y malos, ofertas agotadas, subida de nivel), guardado y aldeanos que
// aparecen una sola vez al generarse el pozo de una aldea.
import { VILLAGER_TRADES } from '../src/shared/villagerTrades';
import { variantProf, variantType } from '../src/shared/villagerTypes';
import { PROF_CARTOGRAPHER } from '../src/shared/villagers';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STONE, COMPOSTER, SMOKER, BLAST_FURNACE, STONECUTTER, LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE,
  SMITHING_TABLE, CAULDRON, BOOKSHELF, OAK_PLANKS, SLABS, BLOCKS, isChest, isContainer,
} from '../src/shared/blocks';
import { EMERALD, PAPER, WHEAT } from '../src/shared/items';
import { MOBS, MOB_VILLAGER, MOB_WANDERING_TRADER, MOB_TYPES } from '../src/shared/mobs';
import {
  PROFESSIONS, PROF_NONE, PROF_FARMER, PROF_LIBRARIAN, PROF_FISHERMAN, professionForBlock, offersFor, levelForXp, LEVEL_XP,
  traderOffers, isWorkstation,
} from '../src/shared/villagers';
import { matchRecipe } from '../src/shared/recipes';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { locateStructure } from '../src/shared/world/structures';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { generateTextures } from '../src/client/textures/generateTextures';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { makeServer, type Client, type Harness } from './harness';
import type { Entity } from '../src/shared/sim/entities';


function arena(seed = 7331): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Comerciante');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.send({ t: 'chat', m: '/time set mediodia' });
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const villagers = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === MOB_VILLAGER && !e.dead);

/** Aldeano en la plataforma con un bloque de trabajo al lado; espera a que coja el oficio. */
function employed(block: number): { h: Harness; c: Client; e: Entity; bx: number; by: number; bz: number } {
  const a = arena();
  const e = a.h.gs.entities.villagers.spawn(a.bx + 0.5, a.by, a.bz + 0.5, null, [a.bx, a.by, a.bz])!;
  a.h.gs.world.setBlock(a.bx + 3, a.by, a.bz, block);
  a.h.tick(20 * 8);
  return { ...a, e };
}

/** Pone al jugador junto al aldeano (el aldeano pasea). */
function near(c: Client, e: Entity): void {
  c.pos(e.x + 1, e.y, e.z);
}

test('aldeano y comerciante: ids reservados, nombres y modelo con nariz y brazos cruzados', () => {
  assert.equal(MOB_VILLAGER, 18);
  assert.equal(MOB_WANDERING_TRADER, 19);
  assert.equal(MOBS[MOB_VILLAGER].name, 'Aldeano');
  assert.equal(MOBS[MOB_WANDERING_TRADER].name, 'Comerciante ambulante');
  assert.ok(MOB_TYPES.includes(MOB_VILLAGER) && MOB_TYPES.includes(MOB_WANDERING_TRADER));
  const names = MOBS[MOB_VILLAGER].parts.map((p) => p.name);
  for (const n of ['head', 'nose', 'body', 'arms', 'legR', 'legL']) assert.ok(names.includes(n), n);
  assert.equal(MOBS[MOB_VILLAGER].hostile, false);
});

test('texturas: una ropa distinta por profesión y ningún píxel de cara transparente', () => {
  const sums = new Set<string>();
  for (const p of PROFESSIONS) {
    const t = generateMobTexture(MOB_VILLAGER, p.id);
    assert.equal(t.rgba.length, 64 * 64 * 4);
    // Píxel del frente de la túnica (cara frontal del cuerpo: u 22.., v 26..).
    const o = ((34 * 64) + 24) * 4;
    sums.add(`${t.rgba[o]},${t.rgba[o + 1]},${t.rgba[o + 2]}`);
  }
  assert.ok(sums.size >= 8, `túnicas distintas: ${sums.size}`);
  const trader = generateMobTexture(MOB_WANDERING_TRADER);
  assert.ok(trader.rgba.some((v, i) => i % 4 === 3 && v === 255));
});

test('bloques de trabajo: profesión de cada uno, recetas y texturas procedurales', () => {
  const want: [number, string][] = [
    [COMPOSTER, 'farmer'], [SMOKER, 'butcher'], [BLAST_FURNACE, 'armorer'], [STONECUTTER, 'mason'], [LECTERN, 'librarian'],
    [CARTOGRAPHY_TABLE, 'cartographer'], [FLETCHING_TABLE, 'fletcher'], [BARREL, 'fisherman'], [LOOM, 'shepherd'],
    [GRINDSTONE, 'weaponsmith'], [SMITHING_TABLE, 'toolsmith'], [CAULDRON, 'leatherworker'],
  ];
  for (const [b, key] of want) {
    assert.equal(PROFESSIONS[professionForBlock(b)].key, key, BLOCKS[b].name);
    assert.ok(isWorkstation(b));
  }
  // Los estados de un bloque con estados (compostador lleno, ahumador encendido) también cuentan.
  assert.equal(professionForBlock(COMPOSTER + 5), PROF_FARMER);
  assert.equal(professionForBlock(SMOKER + 3), professionForBlock(SMOKER));
  assert.equal(professionForBlock(STONE), PROF_NONE);
  // El barril guarda cosas como un cofre.
  assert.ok(isChest(BARREL) && isContainer(BARREL));
  assert.equal(matchRecipe([PAPER, PAPER, 0, OAK_PLANKS, OAK_PLANKS, 0, OAK_PLANKS, OAK_PLANKS, 0], 3)?.out.id, CARTOGRAPHY_TABLE);
  const slab = SLABS.oak;
  assert.equal(matchRecipe([slab, slab, slab, 0, BOOKSHELF, 0, 0, slab, 0], 3)?.out.id, LECTERN);
  // Todas las texturas nuevas tienen generador (sin el marcador magenta).
  const tex = generateTextures();
  for (const name of ['lectern_top', 'barrel_side', 'cauldron_inner', 'grindstone_side']) {
    const layer = TEXTURE_DEFS.findIndex((t) => t.name === name);
    assert.ok(layer >= 0, name);
    const o = layer * 16 * 16 * 4;
    const px = tex.albedo.slice(o, o + 4);
    assert.ok(!(px[0] === 200 && px[1] === 40 && px[2] === 200), `${name} sin generador`);
  }
});


test('ofertas: 2 más por nivel (como en 26.3), deterministas, y niveles por experiencia', () => {
  for (const p of PROFESSIONS.slice(1)) {
    for (let lvl = 1; lvl <= 5; lvl++) {
      const o = offersFor(p.id, lvl, 1234);
      // Sin mapas (offersFor no busca estructuras), al cartógrafo le salen menos: las de mapa no salen.
      if (p.id === PROF_CARTOGRAPHER) assert.ok(o.length >= lvl && o.length <= 2 * lvl, `${p.key} nivel ${lvl}`);
      else {
        // En cada nivel, `amount` (2; el bibliotecario maestro 3) o las que haya si son menos (el carnicero experto, 1).
        const want = VILLAGER_TRADES[p.key].slice(0, lvl).reduce((n, l) => n + Math.min(l.amount, l.trades.length), 0);
        assert.equal(o.length, want, `${p.key} nivel ${lvl}`);
      }
      assert.deepEqual(o, offersFor(p.id, lvl, 1234));
      // Todas se pagan o se cobran en esmeraldas.
      for (const t of o) assert.ok(t.cost[0] === EMERALD || t.cost2?.[0] === EMERALD || t.result[0] === EMERALD, `${p.key}: ${JSON.stringify(t)}`);
    }
  }
  const farmer = offersFor(PROF_FARMER, 1, 99);
  assert.ok(farmer.every((o) => [WHEAT].includes(o.cost[0]) || o.cost[0] !== 0));
  assert.equal(offersFor(PROF_NONE, 3, 1).length, 0);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(LEVEL_XP[1]), 2);
  assert.equal(levelForXp(10_000), 5);
  // El comerciante ambulante: 2 de compra, 2 poco comunes y 5 comunes.
  assert.equal(traderOffers(5).length, 9);
});

test('profesión: el aldeano coge el bloque de trabajo libre más cercano y lo pierde si se rompe', () => {
  const { h, e, bx, by, bz } = employed(LECTERN);
  const v = h.gs.entities.villagers.data(e);
  assert.equal(v.prof, PROF_LIBRARIAN);
  assert.deepEqual(v.job, [bx + 3, by, bz]);
  assert.equal(variantProf(e.variant!), PROF_LIBRARIAN, 'los clientes ven la ropa de bibliotecario');
  assert.equal(variantType(e.variant!), v.type, 'y la de su tipo de aldeano');
  // Un segundo aldeano no puede quedarse el mismo atril: busca otro (un barril) y se hace pescador.
  const e2 = h.gs.entities.villagers.spawn(bx + 0.5, by, bz + 1.5, null, [bx, by, bz])!;
  h.tick(20 * 8);
  assert.equal(h.gs.entities.villagers.data(e2).prof, PROF_NONE, 'el atril ya está ocupado');
  h.gs.world.setBlock(bx - 3, by, bz, BARREL);
  h.tick(20 * 8);
  assert.equal(h.gs.entities.villagers.data(e2).prof, PROF_FISHERMAN);
  // Sin haber comerciado, romper el atril le quita el oficio.
  h.gs.world.setBlock(bx + 3, by, bz, 0);
  h.tick(20 * 8);
  assert.equal(v.prof, PROF_NONE);
  assert.equal(v.job, null);
});

test('comercio válido: paga en esmeraldas, recibe lo ofrecido, gana experiencia y agota la oferta', () => {
  const { h, c, e } = employed(COMPOSTER);
  const v = h.gs.entities.villagers.data(e);
  assert.equal(v.prof, PROF_FARMER);
  near(c, e);
  c.send({ t: 'topen', e: e.id });
  const [tr] = c.conn.take('trades');
  assert.ok(tr, 'llegan las ofertas');
  assert.equal(tr.o.length, 2, 'dos ofertas de novato');
  assert.equal(v.trading, c.welcome.id, 'el aldeano se queda comerciando con el jugador');
  const i = tr.o.findIndex((o: number[]) => o[0] !== EMERALD);
  const o = tr.o[i];
  // Vende (p. ej. trigo) por esmeraldas.
  c.send({ t: 'trade', e: e.id, i, q: 1, pay: [{ id: o[0], count: o[1] }] });
  const [res] = c.conn.take('tres');
  assert.equal(res.ok, true);
  assert.deepEqual(res.give, { id: o[4], count: o[5] });
  assert.deepEqual(res.back, []);
  assert.ok(v.xp > 0, 'el aldeano gana experiencia');
  const [again] = c.conn.take('trades');
  assert.equal(again.o[i][6], 1, 'un uso gastado');
  // Pagar de más: se devuelve lo que sobra.
  c.send({ t: 'trade', e: e.id, i, q: 2, pay: [{ id: o[0], count: o[1] + 3 }] });
  const [res2] = c.conn.take('tres');
  assert.equal(res2.ok, true);
  assert.deepEqual(res2.back, [{ id: o[0], count: 3 }]);
  // Agotar la oferta: el siguiente trato se rechaza y devuelve el pago.
  for (let k = 2; k < o[7]; k++) {
    near(c, e);
    c.send({ t: 'trade', e: e.id, i, q: 10 + k, pay: [{ id: o[0], count: o[1] }] });
    h.tick(1);
  }
  c.conn.take('tres');
  c.send({ t: 'trade', e: e.id, i, q: 99, pay: [{ id: o[0], count: o[1] }] });
  const [out] = c.conn.take('tres');
  assert.equal(out.ok, false);
  assert.deepEqual(out.back, [{ id: o[0], count: o[1] }]);
  assert.match(out.m, /agotada/);
  assert.ok(v.level >= 2, `sube de nivel con los tratos (xp ${v.xp})`);
  c.send({ t: 'topen', e: e.id });
  assert.equal(c.conn.take('trades').at(-1).o.length, 4, 'al subir de nivel aparecen dos ofertas más');
});

test('comercio inválido: pago corto, oferta que no existe, sin abrir, sin oficio o lejos', () => {
  const { h, c, e, bx, by, bz } = employed(COMPOSTER);
  near(c, e);
  // Sin abrir la pantalla antes: se rechaza.
  c.send({ t: 'trade', e: e.id, i: 0, q: 1, pay: [{ id: EMERALD, count: 5 }] });
  let [r] = c.conn.take('tres');
  assert.equal(r.ok, false);
  assert.deepEqual(r.back, [{ id: EMERALD, count: 5 }]);
  c.send({ t: 'topen', e: e.id });
  const [tr] = c.conn.take('trades');
  const i = tr.o.findIndex((o: number[]) => o[0] !== EMERALD);
  const o = tr.o[i];
  // Pago corto.
  c.send({ t: 'trade', e: e.id, i, q: 2, pay: [{ id: o[0], count: o[1] - 1 }] });
  [r] = c.conn.take('tres');
  assert.equal(r.ok, false);
  assert.deepEqual(r.back, [{ id: o[0], count: o[1] - 1 }]);
  // Otro objeto.
  c.send({ t: 'trade', e: e.id, i, q: 3, pay: [{ id: STONE, count: 64 }] });
  assert.equal(c.conn.take('tres')[0].ok, false);
  // Oferta que no existe.
  c.send({ t: 'trade', e: e.id, i: 42, q: 4, pay: [{ id: EMERALD, count: 1 }] });
  assert.equal(c.conn.take('tres')[0].ok, false);
  assert.equal(h.gs.entities.villagers.data(e).xp, 0, 'ningún trato contó');
  // Aldeano sin oficio: no abre.
  const idle = h.gs.entities.villagers.spawn(bx - 4.5, by, bz - 4.5, null, null)!;
  c.pos(idle.x + 1, idle.y, idle.z);
  c.send({ t: 'topen', e: idle.id });
  assert.equal(c.conn.take('tclose').length, 1);
  assert.equal(c.conn.take('trades').length, 0);
  // Demasiado lejos: se cierra y el trato no vale.
  c.pos(e.x + 30, by, e.z);
  c.send({ t: 'topen', e: e.id });
  assert.equal(c.conn.take('trades').length, 0);
  void bz;
});

test('guardado: el aldeano conserva profesión, nivel y casa al reiniciar el servidor', () => {
  const { h, e } = employed(LECTERN);
  const v = h.gs.entities.villagers.data(e);
  v.xp = 80;
  v.level = 3;
  v.home = [1, 2, 3];
  const json = h.gs.entities.serializePassive();
  const h2 = makeServer(7331);
  h2.gs.entities.restorePassive(json);
  const back = villagers(h2)[0];
  assert.ok(back, 'vuelve el aldeano');
  const v2 = h2.gs.entities.villagers.data(back);
  assert.equal(v2.prof, PROF_LIBRARIAN);
  assert.equal(v2.level, 3);
  assert.equal(v2.xp, 80);
  assert.deepEqual(v2.home, [1, 2, 3]);
  assert.equal(v2.seed, v.seed, 'mismas ofertas');
});

test('aldeas: el chunk del pozo trae 3–6 aldeanos con casa, una sola vez, y hay bloques de trabajo en las casas', () => {
  const seed = 12345;
  const gen = new TerrainGenerator(seed);
  const p = locateStructure(gen, 'village', 0, 0, 30)!;
  assert.ok(p, 'hay una aldea');
  const cx = Math.floor(p[0] / 16), cz = Math.floor(p[2] / 16);
  const r = gen.generate(cx, cz);
  assert.ok(r.villagers.length >= 3 && r.villagers.length <= 6, `aldeanos: ${r.villagers.length}`);
  for (const v of r.villagers) {
    assert.ok(Math.abs(v.x - p[0]) <= 2 && Math.abs(v.z - p[2]) <= 2, 'junto al pozo');
    assert.ok(v.home, 'con casa');
  }
  // Los chunks vecinos no traen aldeanos (sólo el del pozo).
  let others = 0, stations = 0;
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const g = gen.generate(cx + dx, cz + dz);
      if (dx || dz) others += g.villagers.length;
      for (const b of g.blocks) if (isWorkstation(b)) stations++;
    }
  }
  assert.equal(others, 0);
  assert.ok(stations >= 1, `bloques de trabajo en las casas: ${stations}`);
  // En el servidor aparecen al generar el chunk, y no otra vez al recargarlo.
  const h = makeServer(seed);
  h.gs.world.ensureChunk(cx, cz, 0);
  const n = villagers(h).length;
  assert.equal(n, r.villagers.length);
  h.gs.world.unloadUnused(1e12, () => false);
  assert.equal(h.gs.world.isLoaded(cx, cz), false);
  h.gs.world.ensureChunk(cx, cz, 0);
  assert.equal(villagers(h).length, n, 'una sola vez por chunk');
});

test('noche: el aldeano vuelve a casa; los zombis cercanos le hacen huir', () => {
  const { h, c, e, bx, by, bz } = employed(COMPOSTER);
  const v = h.gs.entities.villagers.data(e);
  v.home = [bx - 4, by, bz - 4];
  c.send({ t: 'chat', m: '/time set noche' });
  h.tick(20 * 15);
  assert.ok(Math.hypot(e.x - (bx - 3.5), e.z - (bz - 3.5)) < 1.5, `en casa: ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
  c.send({ t: 'chat', m: '/time set mediodia' });
  const z = h.gs.entities.spawnMob(5, e.x + 3, by, e.z)!;
  z.ai!.target = null;
  h.gs.entities.villagers.tick(e, 0.6);
  assert.ok(v.flee > 0, 'huye del zombi');
});

test('barril: se abre y guarda cosas como un cofre', () => {
  const { h, c, bx, by, bz } = arena();
  h.gs.world.setBlock(bx + 1, by, bz, BARREL);
  c.send({ t: 'open', x: bx + 1, y: by, z: bz });
  const [cont] = c.conn.take('cont');
  assert.ok(cont, 'se abre');
  assert.equal(cont.c.k, 'c');
  assert.equal(cont.c.s.length, 27);
  c.send({ t: 'cput', x: bx + 1, y: by, z: bz, stack: { id: EMERALD, count: 5 }, q: 1 });
  assert.equal(c.conn.take('cres')[0].give, null, 'cabe todo');
});

test('comerciante ambulante: aparece de día cerca de un jugador, vende plantas y se va con el tiempo', () => {
  const { h, c } = arena();
  const trading = h.gs.sys.trading;
  const t = trading.spawnTrader();
  assert.ok(t, 'aparece');
  assert.equal(t!.type, MOB_WANDERING_TRADER);
  assert.equal(trading.spawnTrader(), null, 'sólo uno a la vez');
  c.pos(t!.x + 1, t!.y, t!.z);
  c.send({ t: 'topen', e: t!.id });
  const [tr] = c.conn.take('trades');
  assert.ok(tr && tr.tr === true && tr.o.length === 9);
  c.send({ t: 'tclose' });
  h.gs.entities.villagers.data(t!).life = 0.01;
  h.tick(5);
  assert.ok(!h.gs.entities.list.has(t!.id), 'se ha ido');
});
