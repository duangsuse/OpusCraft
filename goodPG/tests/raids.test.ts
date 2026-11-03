// Fase 6: saqueadores y asaltos. Definiciones, modelos y texturas de los illagers, puestos de
// saqueadores, patrullas, Mal presagio, asaltos por oleadas, colmillos, vex, devastador y zombis que
// convierten aldeanos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBS, MOB_TYPES, MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER, MOB_EVOKER_FANGS, MOB_WITCH,
  MOB_VILLAGER, MOB_ZOMBIE, MOB_ZOMBIE_VILLAGER, MOB_IRON_GOLEM, ENT_ITEM, ENT_ARROW, boxFaces, isRaider,
} from '../src/shared/mobs';
import { STONE, AIR, DARK_OAK_LOG, BIRCH_PLANKS, LADDER, familyBase } from '../src/shared/blocks';
import { ITEMS, OMINOUS_BOTTLE, TOTEM_OF_UNDYING, EMERALD, itemSpriteIndex } from '../src/shared/items';
import { EFFECTS, EFFECT_BAD_OMEN, EFFECT_HERO } from '../src/shared/effects';
import { EF_CAPTAIN } from '../src/shared/protocol';
import { blockIndex } from '../src/shared/constants';
import { locateStructure, STRUCTURE_NAMES } from '../src/shared/world/structures';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { OUTPOST_DECK, OUTPOST_VILLAGE_GAP } from '../src/shared/world/outposts';
import { waveMobs, RAID_WAIT, RAID_WAVES } from '../src/shared/sim/server/raids';
import type { Entity } from '../src/shared/sim/entities/types';
import type { WorldSim } from '../src/shared/sim/WorldSim';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { generateItemSprites } from '../src/client/textures/itemSprites';
import { makeServer, type Harness } from './harness';

const NEW: [number, number, string, string][] = [
  [MOB_PILLAGER, 60, 'pillager', 'Saqueador'],
  [MOB_VINDICATOR, 61, 'vindicator', 'Vindicador'],
  [MOB_EVOKER, 62, 'evoker', 'Evocador'],
  [MOB_VEX, 63, 'vex', 'Vex'],
  [MOB_RAVAGER, 64, 'ravager', 'Devastador'],
  [MOB_EVOKER_FANGS, 65, 'evoker_fangs', 'Colmillos de evocador'],
];

// ------------------------------------------------------------------ definiciones, modelos y texturas

test('illagers: ids 60–65, nombres, botín y registro', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d, key);
    assert.equal(d.key, key);
    assert.equal(d.name, name);
    assert.equal(d.hostile, true);
    assert.ok(MOB_TYPES.includes(id));
  }
  assert.ok([MOB_PILLAGER, MOB_VINDICATOR, MOB_EVOKER, MOB_VEX, MOB_RAVAGER].every(isRaider));
  assert.ok(!isRaider(MOB_EVOKER_FANGS) && !isRaider(MOB_WITCH));
  assert.ok(MOBS[MOB_EVOKER_FANGS].inert, 'los colmillos no se pueden golpear');
  assert.ok(MOBS[MOB_EVOKER].drops.some(([i, min]) => i === TOTEM_OF_UNDYING && min === 1), 'el evocador suelta el tótem');
  assert.ok(MOBS[MOB_VINDICATOR].drops.some(([i]) => i === EMERALD));
  assert.ok(MOBS[MOB_RAVAGER].health === 100 && MOBS[MOB_RAVAGER].width > 1.5);
  assert.ok(ITEMS[OMINOUS_BOTTLE].food?.always && ITEMS[OMINOUS_BOTTLE].food?.effects?.some(([e]) => e === EFFECT_BAD_OMEN));
  assert.equal(ITEMS[TOTEM_OF_UNDYING].stack, 1);
  assert.ok(EFFECTS[EFFECT_BAD_OMEN] && !EFFECTS[EFFECT_BAD_OMEN].good && EFFECTS[EFFECT_HERO].good);
  assert.equal(STRUCTURE_NAMES.pillager_outpost, 'Puesto de saqueadores');
});

test('modelos y texturas: dentro del atlas, sin UV solapadas y todas las caras pintadas', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    const rects = new Map<string, [number, number, number, number]>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${key}: padre ${p.parent} antes que ${p.name}`);
      names.add(p.name);
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${key}.${p.name} fuera`);
      rects.set(`${p.uv},${p.size}`, [p.uv[0], p.uv[1], 2 * (dd + w), dd + h]);
    }
    const list = [...rects.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        assert.ok(!(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]), `${key}: UV solapadas`);
      }
    }
    const tex = generateMobTexture(id);
    for (const p of d.parts) {
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, Math.ceil(h), Math.ceil(dd))) {
        for (let y = v; y < v + fh; y++) for (let x = u; x < u + fw; x++) assert.ok(tex.rgba[(y * tex.width + x) * 4 + 3] >= 128, `${key}.${p.name} sin pintar`);
      }
    }
  }
  // Los que pueden ser capitanes llevan el estandarte en el modelo.
  for (const t of [MOB_PILLAGER, MOB_VINDICATOR]) assert.ok(MOBS[t].parts.some((p) => p.name === 'banner'));
});

test('sprites de la botella ominosa y el tótem', () => {
  const sprites = generateItemSprites();
  const layer = sprites.size * sprites.size * 4;
  for (const it of [OMINOUS_BOTTLE, TOTEM_OF_UNDYING]) {
    const i = itemSpriteIndex(it);
    assert.ok(i >= 0);
    let opaque = 0, marker = 0;
    for (let k = 0; k < layer; k += 4) {
      const o = i * layer + k;
      if (sprites.rgba[o + 3] === 255) opaque++;
      if (sprites.rgba[o] === 200 && sprites.rgba[o + 1] === 40 && sprites.rgba[o + 2] === 200) marker++;
    }
    assert.ok(opaque > 30 && marker === 0, ITEMS[it].key);
  }
});

// ------------------------------------------------------------------ oleadas

test('oleadas: 3, 5 o 7 según la dificultad; la última es la más dura y siempre hay capitán', () => {
  assert.deepEqual(RAID_WAVES.slice(1), [3, 5, 7]);
  const r = () => 0.9;
  for (const waves of [3, 5, 7]) {
    const first = waveMobs(1, waves, 2, r), last = waveMobs(waves, waves, 2, r);
    assert.equal(first[0], MOB_PILLAGER, 'la primera criatura es la capitana (un saqueador)');
    assert.ok(last.length >= first.length);
    assert.ok(last.includes(MOB_EVOKER) && last.includes(MOB_RAVAGER), `la última oleada de ${waves} trae evocadores y devastadores`);
  }
  assert.ok(!waveMobs(1, 5, 2, r).includes(MOB_EVOKER), 'la primera no trae evocadores');
});

// ------------------------------------------------------------------ servidor

function platform(W: WorldSim, x0: number, y: number, z0: number, r: number): void {
  for (let cx = Math.floor((x0 - r) / 16) - 1; cx <= Math.floor((x0 + r) / 16) + 1; cx++) {
    for (let cz = Math.floor((z0 - r) / 16) - 1; cz <= Math.floor((z0 + r) / 16) + 1; cz++) W.ensureChunk(cx, cz);
  }
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      W.setBlock(x0 + dx, y - 1, z0 + dz, STONE);
      for (let yy = y; yy < y + 4; yy++) W.setBlock(x0 + dx, yy, z0 + dz, AIR);
    }
  }
}

const mobsOf = (h: Harness, type: number): Entity[] => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = (h: Harness, name: string): any => [...(h.gs as any).sessions.values()].find((s: { name: string }) => s.name === name);

/** Servidor con una plataforma en el cielo y un jugador de supervivencia encima. */
function arena(seed = 606): { h: Harness; x: number; y: number; z: number } {
  const h = makeServer(seed);
  const c = h.join('Defensor');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const x = Math.floor(sx), y = 210, z = Math.floor(sz);
  platform(h.gs.world, x, y, z, 20);
  c.pos(x + 0.5, y, z + 0.5);
  h.tick(2);
  session(h, 'Defensor').p = [x + 0.5, y, z + 0.5];
  return { h, x, y, z };
}

test('saqueador: dispara virotes al jugador, que no hieren a los suyos', () => {
  const { h, x, y, z } = arena();
  const p = h.gs.entities.spawnMob(MOB_PILLAGER, x + 9.5, y, z + 0.5)!;
  const friend = h.gs.entities.spawnMob(MOB_VINDICATOR, x + 5.5, y, z + 3.5)!;
  let arrows = 0;
  for (let i = 0; i < 120; i++) {
    h.tick(1);
    arrows = Math.max(arrows, [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ARROW && e.shooter === p.id).length);
  }
  assert.ok(arrows > 0, 'dispara con la ballesta');
  assert.equal(friend.health, friend.maxHealth, 'no hiere al vindicador');
});

test('vindicador: persigue y golpea a un aldeano; el gólem de hierro se defiende', () => {
  const { h, x, y, z } = arena();
  const v = h.gs.entities.spawnMob(MOB_VILLAGER, x + 3.5, y, z + 8.5)!;
  const vin = h.gs.entities.spawnMob(MOB_VINDICATOR, x - 5.5, y, z + 8.5)!;
  // Sin jugadores a la vista: el jugador se aparta.
  session(h, 'Defensor').p = [x + 0.5, y + 60, z + 0.5];
  const hp = v.health;
  for (let i = 0; i < 200 && !v.dead; i++) h.tick(1);
  assert.ok(v.health < hp || v.dead, 'el aldeano recibe hachazos');
  const g = h.gs.entities.spawnMob(MOB_IRON_GOLEM, vin.x + 2, y, vin.z)!;
  const vhp = vin.health;
  for (let i = 0; i < 200 && !vin.dead; i++) h.tick(1);
  assert.ok(vin.health < vhp || vin.dead, 'el gólem ataca al vindicador');
  void g;
});

test('evocador: invoca vex y hace brotar colmillos que muerden', () => {
  const { h, x, y, z } = arena();
  const ev = h.gs.entities.spawnMob(MOB_EVOKER, x + 12.5, y, z + 0.5)!;
  let fangs = 0, vex = 0;
  for (let i = 0; i < 400; i++) {
    h.tick(1);
    fangs = Math.max(fangs, mobsOf(h, MOB_EVOKER_FANGS).length);
    vex = Math.max(vex, mobsOf(h, MOB_VEX).length);
  }
  assert.ok(vex >= 3, `invoca vex (${vex})`);
  assert.ok(fangs >= 3, `colmillos (${fangs})`);
  // Los colmillos no se pueden golpear.
  const f = h.gs.entities.spawnMob(MOB_EVOKER_FANGS, x + 0.5, y, z + 5.5)!;
  assert.equal(h.gs.entities.damage(f, 50, x, z, 'Defensor'), false);
  // Un colmillo bajo un aldeano le hace daño.
  const vil = h.gs.entities.spawnMob(MOB_VILLAGER, x - 8.5, y, z - 8.5)!;
  const f2 = h.gs.entities.spawnMob(MOB_EVOKER_FANGS, vil.x, y, vil.z)!;
  f2.shooter = ev.id;
  const hp = vil.health;
  h.tick(10);
  assert.ok(vil.health < hp, 'muerde al aldeano');
});

test('vex: atraviesa paredes y se consume con el tiempo', () => {
  const { h, x, y, z } = arena();
  const v = h.gs.entities.spawnMob(MOB_VEX, x + 0.5, y + 1, z + 6.5)!;
  // Una pared entre el vex y el jugador: la cruza.
  for (let dx = -3; dx <= 3; dx++) for (let dy = 0; dy < 5; dy++) h.gs.world.setBlock(x + dx, y + dy, z + 3, STONE);
  let crossed = false;
  for (let i = 0; i < 200; i++) {
    h.tick(1);
    if (v.z < z + 2.5) crossed = true;
  }
  assert.ok(crossed, 'el vex pasa la pared');
  const state = h.gs.entities.mobs.illagers.state(v);
  state.life = 0;
  for (let i = 0; i < 20 * 20 && !v.dead; i++) h.tick(1);
  assert.ok(v.dead || !h.gs.entities.list.has(v.id), 'pasado su plazo, muere');
});

test('capitán: lleva el estandarte y suelta la botella ominosa', () => {
  const { h, x, y, z } = arena();
  const cap = h.gs.entities.spawnMob(MOB_PILLAGER, x + 6.5, y, z + 0.5)!;
  cap.captain = true;
  h.tick(2);
  assert.ok(cap.flags & EF_CAPTAIN);
  for (let i = 0; i < 10 && !cap.dead; i++) {
    cap.invuln = 0;
    h.gs.entities.damage(cap, 10, x, z, 'Defensor');
  }
  const bottles = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === OMINOUS_BOTTLE);
  assert.equal(bottles.length, 1);
});

test('zombi: sin jugadores cerca, en difícil convierte al aldeano en aldeano zombi', () => {
  const { h, x, y, z } = arena();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (h.gs as any).difficulty = 3;
  session(h, 'Defensor').p = [x + 0.5, y + 60, z + 0.5];
  const v = h.gs.entities.spawnMob(MOB_VILLAGER, x + 4.5, y, z + 0.5)!;
  v.health = 2;
  h.gs.entities.spawnMob(MOB_ZOMBIE, x - 4.5, y, z + 0.5);
  for (let i = 0; i < 300 && mobsOf(h, MOB_ZOMBIE_VILLAGER).length === 0; i++) h.tick(1);
  assert.equal(mobsOf(h, MOB_ZOMBIE_VILLAGER).length, 1, 'aparece un aldeano zombi');
  assert.ok(!h.gs.entities.list.has(v.id) || v.dead);
});

test('asalto: oleadas con calma entre ellas, victoria y Héroe de la aldea con rebaja', () => {
  const { h, x, y, z } = arena();
  const raids = h.gs.sys.raids;
  const r = raids.start(x + 0.5, y, z + 0.5);
  assert.equal(r.waves, RAID_WAVES[2]);
  // Calma y primera oleada.
  h.tick(20 * (RAID_WAIT + 2));
  assert.equal(r.wave, 1);
  assert.ok(r.raiders.size >= 4, `llegan asaltantes (${r.raiders.size})`);
  const first = [...r.raiders].map((id) => h.gs.entities.list.get(id)!);
  assert.ok(first.some((e) => e.captain), 'con capitán');
  assert.ok(first.every((e) => e.raid === r.id));
  // Los asaltantes no desaparecen aunque estén lejos… y se acaba con todos, oleada a oleada.
  for (let w = 0; w < r.waves; w++) {
    for (const id of [...r.raiders]) {
      const e = h.gs.entities.list.get(id);
      if (e) h.gs.entities.kill(e, false);
    }
    h.tick(20 * 2);
    if (w < r.waves - 1) {
      assert.equal(r.state, 'wait', 'calma entre oleadas');
      h.tick(20 * (RAID_WAIT + 1));
    }
  }
  assert.equal(r.state, 'won');
  assert.ok(raids.isHero('Defensor'), 'Héroe de la aldea');
  // Un aldeano cantero: las ofertas en esmeraldas salen más baratas para el héroe.
  const s = session(h, 'Defensor');
  const vil = h.gs.entities.spawnMob(MOB_VILLAGER, x + 2.5, y, z + 2.5)!;
  const data = h.gs.entities.villagers.data(vil);
  data.prof = 4;
  data.level = 5;
  const trading = h.gs.sys.trading;
  const normal = trading.offers(vil);
  const hero = trading.offers(vil, s);
  // Villager.updateSpecialPrices: el héroe de nivel 0 paga un 30 % menos (al menos una menos) de lo primero que pide.
  assert.equal(raids.heroAmp('Defensor'), 0);
  normal.forEach((n, i) => {
    const want = Math.max(1, n.price - Math.max(Math.floor(Math.fround(0.3) * n.offer.cost[1]), 1));
    assert.equal(hero[i].price, want, 'rebaja del héroe');
  });
  h.tick(20 * 12);
  assert.equal(raids.active.length, 0, 'el asalto se cierra');
});

test('Mal presagio: al entrar en una aldea empieza un asalto y se quita el efecto', () => {
  const h = makeServer(606);
  const c = h.join('Portador');
  const gen = h.gs.world.gen;
  const v = locateStructure(gen, 'village', 0, 0, 6);
  assert.ok(v, 'hay una aldea en el mundo de prueba');
  const [vx, vy, vz] = v!;
  for (let cx = Math.floor(vx / 16) - 3; cx <= Math.floor(vx / 16) + 3; cx++) {
    for (let cz = Math.floor(vz / 16) - 3; cz <= Math.floor(vz / 16) + 3; cz++) h.gs.world.ensureChunk(cx, cz);
  }
  c.send({ t: 'omen', a: 0 });
  assert.ok(h.gs.sys.raids.hasOmen('Portador'));
  session(h, 'Portador').p = [vx + 0.5, vy + 1, vz + 0.5];
  c.conn.msgs = [];
  h.tick(25);
  assert.equal(h.gs.sys.raids.active.length, 1, 'empieza el asalto');
  assert.ok(!h.gs.sys.raids.hasOmen('Portador'), 'el presagio se gasta');
  assert.ok(c.conn.take('effect').some((m) => m.id === EFFECT_BAD_OMEN && m.s < 0), 'el cliente quita el efecto');
  assert.ok(c.conn.take('raid').some((m) => m.s === 1), 'barra del asalto');
});

// ------------------------------------------------------------------ puestos y patrullas

test('puesto de saqueadores: torre con escalera y cofre, lejos de las aldeas', () => {
  const gen = new TerrainGenerator(606);
  const o = locateStructure(gen, 'pillager_outpost', 0, 0, 10);
  assert.ok(o, 'hay algún puesto');
  const [ox, oy, oz] = o!;
  const v = locateStructure(gen, 'village', ox, oz, 1);
  assert.ok(!v || Math.hypot(v[0] - ox, v[2] - oz) >= OUTPOST_VILLAGE_GAP, 'lejos de las aldeas');
  const cx = Math.floor(ox / 16), cz = Math.floor(oz / 16);
  const { blocks, chests } = gen.generate(cx, cz);
  const lx = ox - cx * 16, lz = oz - cz * 16;
  const get = (dx: number, y: number, dz: number) => {
    const x = lx + dx, z = lz + dz;
    return x >= 0 && x < 16 && z >= 0 && z < 16 ? blocks[blockIndex(x, y, z)] : -1;
  };
  let logs = 0, planks = 0, ladders = 0;
  for (let y = oy + 1; y <= oy + OUTPOST_DECK; y++) {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dx = -3; dx <= 3; dx++) {
        const b = get(dx, y, dz);
        if (b === DARK_OAK_LOG) logs++;
        if (b === BIRCH_PLANKS) planks++;
        if (b > 0 && familyBase(b) === LADDER) ladders++;
      }
    }
  }
  assert.ok(logs > 10 && planks > 20 && ladders > 5, `torre (${logs} troncos, ${planks} tablones, ${ladders} escalones)`);
  const chest = chests?.find((ch) => ch.table === 'pillager_outpost');
  // El cofre puede caer en otro chunk si la torre está en un borde.
  if (chest) assert.ok(chest.y > oy + OUTPOST_DECK - 1, 'el cofre está en el mirador');
});

test('servidor: saqueadores alrededor del puesto con un jugador cerca, y patrullas con capitán', () => {
  const h = makeServer(606);
  h.join('Explorador');
  const o = locateStructure(h.gs.world.gen, 'pillager_outpost', 0, 0, 10)!;
  for (let cx = Math.floor(o[0] / 16) - 2; cx <= Math.floor(o[0] / 16) + 2; cx++) {
    for (let cz = Math.floor(o[2] / 16) - 2; cz <= Math.floor(o[2] / 16) + 2; cz++) h.gs.world.ensureChunk(cx, cz);
  }
  session(h, 'Explorador').p = [o[0] + 30.5, o[1] + 1, o[2] + 0.5];
  h.gs.entities.rand = () => 0.1;
  for (let i = 0; i < 60; i++) h.tick(20);
  const near = mobsOf(h, MOB_PILLAGER).filter((e) => Math.hypot(e.x - o[0], e.z - o[2]) < 40);
  assert.ok(near.length >= 1 && near.length <= 4, `saqueadores en el puesto (${near.length})`);
  const patrol = h.gs.sys.raids.spawnPatrol(o[0] + 30, o[2]);
  assert.ok(patrol.length >= 2 && patrol[0].captain && patrol.every((e) => e.patrolTo), 'patrulla con capitán y destino');
});
