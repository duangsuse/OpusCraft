// Fase 6 (gólems/domesticar): construir gólems, gólem de hierro contra un zombi, gólem de nieve (bolas,
// rastro de nieve y deshielo), domesticar lobos y gatos, sentarse, seguir y teletransportarse,
// lobos que ayudan a su dueño, creepers que huyen de los gatos, cría, aldeas y persistencia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, GRASS, FENCES, SNOW_BLOCK, IRON_BLOCK, CARVED_PUMPKIN, SNOW_LAYER, isSnowLayer } from '../src/shared/blocks';
import { BONE, COD, IRON_INGOT, RAW_BEEF, SNOWBALL } from '../src/shared/items';
import {
  MOBS, MOB_TYPES, MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_WOLF, MOB_ZOMBIE, MOB_CREEPER, MOB_PIG, ENT_THROWN, boxFaces,
} from '../src/shared/mobs';
import { EF_TAMED, EF_SITTING } from '../src/shared/protocol';
import { companionUse, variantOf, variantBits, CAT_SKINS, TAMED_WOLF_HEALTH } from '../src/shared/companions';
import { GameServer } from '../src/shared/sim/GameServer';
import type { Entity } from '../src/shared/sim/entities';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { companionTexture, skinKey } from '../src/client/textures/companionTextures';
import { makeServer, placeOnTop, type Client, type Harness } from './harness';

/** Plataforma de piedra y hierba a y = 150 con valla (lejos del terreno) y un jugador encima. */
function field(mode: 's' | 'c' = 's', name = 'Domadora'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(4242);
  const c = h.join(name, mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(60);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  platform(h, bx, by, bz, 10);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

function platform(h: Harness, bx: number, by: number, bz: number, r: number): void {
  const W = h.gs.world;
  for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, GRASS);
    for (let y = by; y < by + 4; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    if (Math.abs(dx) === r || Math.abs(dz) === r) W.setBlock(bx + dx, by, bz + dz, FENCES.oak);
  }
}

const mobsOf = (h: Harness, type: number): Entity[] => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);

/** Respuesta 'ires' a un 'interact' (item 0 = mano vacía). */
function interact(c: Client, e: Entity, item: number): { ok: boolean; take?: number } {
  c.send({ t: 'interact', e: e.id, item, q: 1 });
  return c.conn.take('ires').pop();
}

/** Azar controlado para Entities (la domesticación tiene 1/3 de probabilidad). */
function luck(h: Harness, v: number): void {
  h.gs.entities.rand = () => v;
}

test('definiciones: ids, nombres, modelos y texturas de gólems y gato', () => {
  const NEW: [number, number, string, string][] = [
    [MOB_IRON_GOLEM, 20, 'iron_golem', 'Gólem de hierro'],
    [MOB_SNOW_GOLEM, 21, 'snow_golem', 'Gólem de nieve'],
    [MOB_CAT, 22, 'cat', 'Gato'],
  ];
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d && d.key === key && d.name === name && !d.hostile && MOB_TYPES.includes(id), key);
  }
  for (const id of [MOB_IRON_GOLEM, MOB_SNOW_GOLEM, MOB_CAT, MOB_WOLF]) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    const rects = new Map<string, [number, number, number, number]>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${d.key}: padre de ${p.name}`);
      names.add(p.name);
      const [w, hh, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, hh, dd)) assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${d.key}.${p.name} fuera del atlas`);
      rects.set(`${p.uv},${p.size}`, [p.uv[0], p.uv[1], 2 * (dd + w), dd + hh]);
    }
    const list = [...rects.values()];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i], list[j]];
      assert.ok(!(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]), `${d.key}: UV solapadas`);
    }
  }
  assert.ok(MOBS[MOB_WOLF].parts.some((p) => p.name === 'collar') && MOBS[MOB_CAT].parts.some((p) => p.name === 'collar'));
  // Texturas: todas las caras pintadas (también el collar del lobo y cada piel de gato).
  const painted = (id: number, tex: { width: number; rgba: Uint8Array }) => {
    for (const p of MOBS[id].parts) {
      const [w, hh, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, hh, dd)) {
        for (let y = v; y < v + fh; y++) for (let x = u; x < u + fw; x++) assert.equal(tex.rgba[(y * tex.width + x) * 4 + 3], 255, `${MOBS[id].key}.${p.name} sin pintar`);
      }
    }
  };
  painted(MOB_WOLF, generateMobTexture(MOB_WOLF));
  painted(MOB_IRON_GOLEM, companionTexture(MOB_IRON_GOLEM)!);
  painted(MOB_SNOW_GOLEM, companionTexture(MOB_SNOW_GOLEM)!);
  const skins = new Set<string>();
  for (let v = 0; v < CAT_SKINS.length; v++) {
    const t = companionTexture(skinKey(MOB_CAT, v))!;
    painted(MOB_CAT, t);
    skins.add(Buffer.from(t.rgba).toString('base64'));
  }
  assert.equal(skins.size, CAT_SKINS.length, 'cada piel de gato es distinta');
  assert.equal(companionTexture(MOB_PIG), null, 'el resto de criaturas no son cosa de este módulo');
  assert.equal(variantOf(variantBits(3) | EF_TAMED), 3);
  // Qué se puede usar con cada uno (el cliente decide si manda 'interact').
  assert.ok(companionUse(MOB_WOLF, 0, BONE) && !companionUse(MOB_WOLF, 0, 0) && companionUse(MOB_WOLF, EF_TAMED, 0));
  assert.ok(companionUse(MOB_CAT, 0, COD) && !companionUse(MOB_CAT, 0, BONE) && companionUse(MOB_IRON_GOLEM, 0, IRON_INGOT));
});

test('construir gólems: nieve (2 + calabaza) y hierro (T + calabaza); formas incompletas no', () => {
  const { h, c, bx, by, bz } = field();
  const W = h.gs.world;
  // Gólem de nieve.
  const sx = bx - 4, sz = bz - 4;
  W.setBlock(sx, by, sz, SNOW_BLOCK);
  W.setBlock(sx, by + 1, sz, SNOW_BLOCK);
  placeOnTop(c, sx, by + 2, sz, CARVED_PUMPKIN);
  h.tick(2);
  const snow = mobsOf(h, MOB_SNOW_GOLEM);
  assert.equal(snow.length, 1, 'aparece un gólem de nieve');
  assert.ok(snow[0].playerMade && Math.abs(snow[0].x - (sx + 0.5)) < 0.6 && Math.abs(snow[0].y - by) < 0.6);
  for (let y = by; y <= by + 2; y++) assert.equal(W.getBlock(sx, y, sz), AIR, 'los bloques se consumen');

  // Gólem de hierro: columna y brazos en X.
  const ix = bx + 4, iz = bz + 4;
  W.setBlock(ix, by, iz, IRON_BLOCK);
  W.setBlock(ix, by + 1, iz, IRON_BLOCK);
  W.setBlock(ix - 1, by + 1, iz, IRON_BLOCK);
  W.setBlock(ix + 1, by + 1, iz, IRON_BLOCK);
  placeOnTop(c, ix, by + 2, iz, CARVED_PUMPKIN);
  h.tick(2);
  const iron = mobsOf(h, MOB_IRON_GOLEM);
  assert.equal(iron.length, 1, 'aparece un gólem de hierro');
  assert.equal(iron[0].maxHealth, 100);
  for (const [dx, dy] of [[0, 0], [0, 1], [-1, 1], [1, 1], [0, 2]]) assert.equal(W.getBlock(ix + dx, by + dy, iz), AIR);

  // Sin un brazo no hay gólem y los bloques se quedan.
  const jx = bx, jz = bz - 6;
  W.setBlock(jx, by, jz, IRON_BLOCK);
  W.setBlock(jx, by + 1, jz, IRON_BLOCK);
  W.setBlock(jx, by + 1, jz - 1, IRON_BLOCK);
  placeOnTop(c, jx, by + 2, jz, CARVED_PUMPKIN);
  h.tick(2);
  assert.equal(mobsOf(h, MOB_IRON_GOLEM).length, 1, 'con tres bloques de hierro no se construye');
  assert.equal(W.getBlock(jx, by + 1, jz), IRON_BLOCK);

  // Lingote de hierro: cura al gólem herido.
  const g = iron[0];
  g.health = 50;
  const r = interact(c, g, IRON_INGOT);
  assert.ok(r.ok && r.take === 1 && g.health === 75, 'el lingote lo repara');
});

test('el gólem de hierro defiende: persigue a un zombi, lo lanza por los aires y lo mata', () => {
  const { h, c, bx, by, bz } = field('c');
  c.send({ t: 'chat', m: '/time set medianoche' });
  const E = h.gs.entities;
  const golem = E.spawnMob(MOB_IRON_GOLEM, bx - 5 + 0.5, by, bz + 0.5)!;
  const zombie = E.spawnMob(MOB_ZOMBIE, bx + 3 + 0.5, by, bz + 0.5)!;
  let launched = false;
  for (let i = 0; i < 20 * 20 && !zombie.dead; i++) {
    h.tick(1);
    if (zombie.vy > 5 && zombie.health < 20) launched = true;
  }
  assert.ok(zombie.dead, 'el zombi muere');
  assert.ok(launched, 'el golpe lo lanza hacia arriba');
  assert.equal(golem.foe, zombie.id, 'el zombi era su enemigo');
  assert.ok(!golem.dead && golem.health > 60);
});

test('el gólem de hierro se vuelve contra quien le pega y no se deja empujar', () => {
  const { h, c, bx, by, bz } = field('s');
  const g = h.gs.entities.spawnMob(MOB_IRON_GOLEM, bx + 2.5, by, bz + 0.5)!;
  h.tick(2);
  c.send({ t: 'attack', e: g.id, item: 0 });
  assert.equal(g.foe, c.welcome.id, 'le tiene por enemigo');
  assert.ok(Math.abs(g.vx) < 0.01 && Math.abs(g.vz) < 0.01, 'sin empuje');
  assert.equal(g.ai!.panic, 0, 'no huye');
  c.conn.msgs = [];
  let hurt: { a: number; k: number[] } | undefined;
  for (let i = 0; i < 100 && !hurt; i++) {
    h.tick(1);
    hurt = c.conn.take('hurt')[0];
  }
  assert.ok(hurt && hurt.a >= 7 && hurt.k[1] >= 9, 'golpea al jugador y lo lanza hacia arriba');
});

test('el gólem de nieve tira bolas de nieve a los monstruos', () => {
  const { h, bx, by, bz, c } = field('c');
  c.send({ t: 'chat', m: '/time set medianoche' });
  c.pos(bx + 0.5, by, bz + 6.5); // fuera de la línea de tiro
  const E = h.gs.entities;
  const g = E.spawnMob(MOB_SNOW_GOLEM, bx - 4 + 0.5, by, bz + 0.5)!;
  const z = E.spawnMob(MOB_ZOMBIE, bx + 4 + 0.5, by, bz + 0.5)!;
  let thrown = 0;
  let hit = false;
  for (let i = 0; i < 60; i++) {
    h.tick(1);
    for (const e of E.list.values()) if (e.type === ENT_THROWN && e.stack?.id === SNOWBALL && e.shooter === g.id && e.age < 0.06) thrown++;
    if (z.hurt < 0.06) hit = true;
  }
  assert.ok(thrown >= 2, `lanza bolas de nieve (${thrown})`);
  assert.ok(hit, 'las bolas le dan al zombi');
});

/** Busca cerca del origen una columna que cumpla la condición (clima del generador). */
function findColumn(h: Harness, pred: (temp: number, height: number) => boolean): [number, number] | null {
  const gen = h.gs.world.gen;
  for (let r = 0; r < 60; r++) {
    for (let k = 0; k < 8 * Math.max(1, r); k++) {
      const a = (k / (8 * Math.max(1, r))) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r * 96), z = Math.round(Math.sin(a) * r * 96);
      const inf = gen.columnInfo(x, z);
      if (pred(inf.temp, inf.height)) return [x, z];
    }
  }
  return null;
}

test('el gólem de nieve deja nieve donde hace frío y se derrite donde hace calor', () => {
  const h = makeServer(4242);
  const c = h.join('Nevera', 'c');
  const E = h.gs.entities;
  const W = h.gs.world;
  const put = (x: number, z: number): Entity => {
    c.pos(x + 0.5, 200, z + 0.5);
    h.tick(40);
    W.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
    platform(h, x, 180, z, 3);
    return E.spawnMob(MOB_SNOW_GOLEM, x + 0.5, 180, z + 0.5)!;
  };
  const cold = findColumn(h, (t, hh) => t < -0.7 && hh < 140);
  assert.ok(cold, 'hay una zona fría');
  const g = put(cold![0], cold![1]);
  h.tick(30);
  assert.ok(isSnowLayer(W.getBlock(cold![0], 180, cold![1])), 'deja una capa de nieve bajo sus pies');
  assert.ok(!g.dead && g.health === g.maxHealth, 'el frío no le hace daño');
  E.remove(g.id);

  const hot = findColumn(h, (t) => t > 0.8);
  assert.ok(hot, 'hay una zona cálida');
  const g2 = put(hot![0], hot![1]);
  h.tick(50);
  assert.ok(g2.health < g2.maxHealth, 'se derrite con el calor');
  assert.notEqual(W.getBlock(hot![0], 180, hot![1]), SNOW_LAYER, 'donde hace calor no deja nieve');
});

test('domesticar lobos: hueso con 1/3, sentarse con clic derecho, sólo el dueño manda', () => {
  const { h, c, bx, by, bz } = field('s', 'Domadora');
  const other = h.join('Vecino', 's');
  other.pos(bx - 2.5, by, bz + 0.5);
  const wolf = h.gs.entities.spawnMob(MOB_WOLF, bx + 2.5, by, bz + 0.5)!;
  h.tick(2);
  // Sin suerte: se gasta el hueso pero sigue salvaje.
  luck(h, 0.9);
  let r = interact(c, wolf, BONE);
  assert.ok(r.ok && r.take === 1 && !wolf.tamedBy, 'intento fallido');
  // Con suerte: domesticado, con collar y más vida.
  luck(h, 0.1);
  r = interact(c, wolf, BONE);
  assert.ok(r.ok && r.take === 1, 'se gasta el hueso');
  assert.equal(wolf.tamedBy, 'domadora');
  assert.equal(wolf.maxHealth, TAMED_WOLF_HEALTH);
  h.gs.entities.rand = Math.random;
  h.tick(2);
  assert.ok(wolf.flags & EF_TAMED, 'bit de domesticado');
  // Otro jugador no puede sentarlo.
  assert.equal(interact(other, wolf, 0).ok, false);
  // El dueño lo sienta con la mano vacía...
  r = interact(c, wolf, 0);
  assert.ok(r.ok && !r.take && wolf.sitting, 'sentado');
  h.tick(2);
  assert.ok(wolf.flags & EF_SITTING, 'bit de sentado');
  // ...y sentado no le sigue.
  const [wx, wz] = [wolf.x, wolf.z];
  c.pos(bx - 8.5, by, bz - 8.5);
  h.tick(60);
  assert.ok(Math.hypot(wolf.x - wx, wolf.z - wz) < 0.5, 'sentado no se mueve');
  // De pie le sigue (hay que acercarse para tocarlo).
  c.pos(wolf.x - 3, by, wolf.z);
  r = interact(c, wolf, 0);
  assert.ok(r.ok && !wolf.sitting, 'se levanta');
  // El dueño se aleja 9 bloques (andando le alcanza; a más de 12 aparecería a su lado).
  const tx = wolf.x + (wolf.x < bx ? 9 : -9), tz = wolf.z;
  c.pos(tx, by, tz);
  let closest = Infinity;
  for (let i = 0; i < 20 * 8; i++) {
    h.tick(1);
    closest = Math.min(closest, Math.hypot(wolf.x - tx, wolf.z - tz));
  }
  assert.ok(closest < 3, `sigue a su dueño (${closest.toFixed(1)})`);
  assert.ok(Math.hypot(wolf.x - tx, wolf.z - tz) < 7, 'y no se aleja');
});

test('el lobo domesticado se teletransporta junto a su dueño si se aleja', () => {
  const { h, c, bx, by, bz } = field('s');
  const wolf = h.gs.entities.spawnMob(MOB_WOLF, bx + 0.5, by, bz + 2.5)!;
  h.gs.entities.companions.pets.makeTamed(wolf, 'Domadora');
  // Otra plataforma a 40 bloques.
  const fx = bx + 40;
  platform(h, fx, by, bz, 4);
  c.pos(fx + 0.5, by, bz + 0.5);
  let near = false;
  for (let i = 0; i < 20 * 3 && !near; i++) {
    h.tick(1);
    near = Math.hypot(wolf.x - (fx + 0.5), wolf.z - (bz + 0.5)) < 4.5;
  }
  assert.ok(near, 'aparece a su lado');
  assert.ok(Math.abs(wolf.y - by) < 0.01, 'de pie sobre el suelo');
});

test('los lobos atacan a lo que ataca su dueño y a lo que les ataca', () => {
  const { h, c, bx, by, bz } = field('s');
  const E = h.gs.entities;
  const wolf = E.spawnMob(MOB_WOLF, bx - 2.5, by, bz + 0.5)!;
  E.companions.pets.makeTamed(wolf, 'domadora');
  const pig = E.spawnMob(MOB_PIG, bx + 2.5, by, bz + 0.5)!;
  h.tick(2);
  c.send({ t: 'attack', e: pig.id, item: 0 });
  assert.equal(wolf.foe, pig.id, 'el cerdo pasa a ser su presa');
  for (let i = 0; i < 20 * 15 && !pig.dead; i++) h.tick(1);
  assert.ok(pig.dead, 'el lobo mata al cerdo');
  // Una criatura que le pega pasa a ser su enemigo; su dueño, no.
  const zombie = E.spawnMob(MOB_ZOMBIE, bx + 4.5, by, bz + 4.5)!;
  E.damage(wolf, 1, zombie.x, zombie.z, zombie.id);
  assert.equal(wolf.foe, zombie.id);
  wolf.foe = undefined;
  c.send({ t: 'attack', e: wolf.id, item: 0 });
  assert.equal(wolf.foe, undefined, 'no ataca a su dueño');
  assert.equal(wolf.ai!.angry, 0);
});

test('criar lobos domesticados con carne: la cría nace domesticada', () => {
  const { h, c, bx, by, bz } = field('s');
  const E = h.gs.entities;
  const a = E.spawnMob(MOB_WOLF, bx - 1.5, by, bz + 0.5)!;
  const b = E.spawnMob(MOB_WOLF, bx + 1.5, by, bz + 0.5)!;
  for (const w of [a, b]) E.companions.pets.makeTamed(w, 'domadora');
  a.health = 16;
  let r = interact(c, a, RAW_BEEF);
  assert.ok(r.ok && r.take === 1 && a.health === 20 && !((a.love ?? 0) > 0), 'herido: la carne lo cura');
  r = interact(c, a, RAW_BEEF);
  assert.ok(r.ok && (a.love ?? 0) > 0, 'sano: modo amor');
  assert.ok(interact(c, b, RAW_BEEF).ok);
  h.tick(20 * 6);
  const babies = mobsOf(h, MOB_WOLF).filter((w) => (w.growAge ?? 0) > 0);
  assert.equal(babies.length, 1, 'nace una cría');
  assert.equal(babies[0].tamedBy, 'domadora');
  // Un lobo salvaje no come carne de la mano.
  const wild = E.spawnMob(MOB_WOLF, bx + 3.5, by, bz + 3.5)!;
  h.tick(1);
  assert.ok(!interact(c, wild, RAW_BEEF).ok);
});

test('gatos: se domestican con pescado, se sientan y los creepers huyen de ellos', () => {
  const { h, c, bx, by, bz } = field('s');
  const E = h.gs.entities;
  const cat = E.spawnMob(MOB_CAT, bx + 2.5, by, bz + 0.5)!;
  h.tick(2);
  assert.ok(cat.variant !== undefined && cat.variant < CAT_SKINS.length, 'tiene piel');
  assert.equal(variantOf(cat.flags), cat.variant);
  luck(h, 0.1);
  const r = interact(c, cat, COD);
  h.gs.entities.rand = Math.random;
  assert.ok(r.ok && r.take === 1 && cat.tamedBy === 'domadora', 'domesticado con bacalao');
  assert.ok(interact(c, cat, 0).ok && cat.sitting, 'se sienta');
  h.tick(2);
  assert.ok(cat.flags & EF_SITTING && cat.flags & EF_TAMED);

  // Creeper junto al gato (y cerca de un jugador en supervivencia): huye en vez de explotar.
  c.send({ t: 'chat', m: '/time set medianoche' });
  const creeper = E.spawnMob(MOB_CREEPER, cat.x + 2, by, cat.z)!;
  const d0 = Math.hypot(creeper.x - cat.x, creeper.z - cat.z);
  h.tick(40);
  assert.ok(!creeper.dead && E.list.has(creeper.id), 'no explota');
  assert.ok(creeper.ai!.fuse === 0, 'sin mecha');
  assert.ok(Math.hypot(creeper.x - cat.x, creeper.z - cat.z) > d0 + 1, 'se aleja del gato');
});

test('persistencia: dueño, sentado, piel y gólems hechos a mano se guardan', () => {
  const { h, bx, by, bz } = field('s');
  const E = h.gs.entities;
  const wolf = E.spawnMob(MOB_WOLF, bx + 0.5, by, bz + 3.5)!;
  E.companions.pets.makeTamed(wolf, 'domadora');
  wolf.sitting = true;
  wolf.health = 13;
  const cat = E.spawnMob(MOB_CAT, bx + 3.5, by, bz + 0.5)!;
  cat.variant = 3;
  const golem = E.spawnMob(MOB_IRON_GOLEM, bx - 3.5, by, bz + 0.5)!;
  golem.playerMade = true;
  E.spawnMob(MOB_SNOW_GOLEM, bx - 3.5, by, bz - 3.5);
  h.gs.flush(true);
  const gs2 = new GameServer(h.store, { seed: 4242, now: () => h.clock.now });
  const all = [...gs2.entities.list.values()];
  // (Puede haber aparecido algún lobo salvaje o algún gato de aldea: se buscan los nuestros.)
  const w2 = all.find((e) => e.type === MOB_WOLF && e.tamedBy)!;
  assert.ok(w2 && w2.tamedBy === 'domadora' && w2.sitting && w2.maxHealth === TAMED_WOLF_HEALTH && w2.health === 13, 'lobo');
  assert.ok(all.some((e) => e.type === MOB_CAT && e.variant === 3), 'gato');
  assert.ok(all.some((e) => e.type === MOB_IRON_GOLEM && e.playerMade), 'gólem de hierro');
  assert.ok(all.some((e) => e.type === MOB_SNOW_GOLEM), 'gólem de nieve');
});

test('las aldeas se pueblan una vez con su gólem de hierro y gatos', () => {
  const { h, bx, by, bz } = field('s');
  const g = h.gs.sys.golems;
  assert.ok(g.populateVillage(bx, by, bz), 'se puebla');
  assert.equal(mobsOf(h, MOB_IRON_GOLEM).length, 1);
  const cats = mobsOf(h, MOB_CAT);
  assert.ok(cats.length >= 2 && cats.length <= 3, `gatos (${cats.length})`);
  assert.ok(!mobsOf(h, MOB_IRON_GOLEM)[0].playerMade, 'el gólem de la aldea no es de nadie');
  assert.equal(g.populateVillage(bx, by, bz), false, 'no se repite');
  // Los gólems y las mascotas no se reciclan aunque estén lejos.
  assert.ok(h.gs.entities.companions.keep(cats[0]));
});
