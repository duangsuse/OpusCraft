// Fase 6 (monturas): caballos, burros, mulas, llamas y camellos; la silla; montar y bajarse en el
// servidor; validación del movimiento de la montura; doma; cría de la mula; escupitajo de la llama;
// guardado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, GRASS, FENCES } from '../src/shared/blocks';
import { SADDLE, GOLDEN_APPLE, WHEAT, LEATHER, IRON_INGOT, isValidItem, itemSpriteIndex, CREATIVE_ITEMS } from '../src/shared/items';
import {
  MOBS, MOB_TYPES, MOB_PIG, MOB_HORSE, MOB_DONKEY, MOB_MULE, MOB_LLAMA, MOB_CAMEL, boxFaces,
} from '../src/shared/mobs';
import { MOUNTS, canMate, offspringType } from '../src/shared/mounts';
import { EF_SADDLE, EF_RIDDEN, EF_TAMED, STATE_DEAD } from '../src/shared/protocol';
import { matchRecipe } from '../src/shared/recipes';
import { mountSpawnFor } from '../src/shared/sim/entities/mounts';
import { BIOME_PLAINS, BIOME_SAVANNA, BIOME_MOUNTAINS, BIOME_DESERT, BIOME_TAIGA } from '../src/shared/world/biomeIds';
import { MemoryStore } from '../src/shared/sim/store';
import { GameServer } from '../src/shared/sim/GameServer';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { makeServer, type Client, type Harness } from './harness';

const NEW: [number, string, string][] = [
  [MOB_HORSE, 'horse', 'Caballo'],
  [MOB_DONKEY, 'donkey', 'Burro'],
  [MOB_MULE, 'mule', 'Mula'],
  [MOB_LLAMA, 'llama', 'Llama'],
  [MOB_CAMEL, 'camel', 'Camello'],
];

/** Plataforma de hierba vallada a y = 150 con un jugador encima. */
function field(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(4242);
  const c = h.join('Jinete');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(60);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  const W = h.gs.world;
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, GRASS);
    if (Math.abs(dx) === 10 || Math.abs(dz) === 10) W.setBlock(bx + dx, by, bz + dz, FENCES.oak);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

/** Respuesta a 'interact' con la cola q. */
function ires(c: Client, q: number): { ok: boolean; take?: number } | undefined {
  const i = c.conn.msgs.findIndex((m) => m.t === 'ires' && m.q === q);
  return i < 0 ? undefined : c.conn.msgs.splice(i, 1)[0];
}

test('monturas: ids, nombres, modelos, texturas, silla y aparición por bioma', () => {
  for (const [id, key, name] of NEW) {
    const d = MOBS[id];
    assert.ok(d && d.key === key && d.name === name && !d.hostile && MOB_TYPES.includes(id), key);
    assert.ok(MOUNTS[id], `${key} es montura`);
  }
  assert.deepEqual([MOB_HORSE, MOB_DONKEY, MOB_MULE, MOB_LLAMA, MOB_CAMEL], [25, 26, 27, 28, 29]);
  // Modelos: padres antes que hijos, cajas dentro del atlas y sin solaparse (también el cerdo con silla).
  for (const id of [...NEW.map((n) => n[0]), MOB_PIG]) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    const rects = new Map<string, [number, number, number, number]>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${d.key}: padre ${p.parent} antes que ${p.name}`);
      names.add(p.name);
      const [w, hh, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, hh, dd)) {
        assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${d.key}.${p.name} fuera del atlas`);
      }
      rects.set(`${p.uv},${p.size}`, [p.uv[0], p.uv[1], 2 * (dd + w), dd + hh]);
    }
    const list = [...rects.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
        assert.ok(!overlap, `${d.key}: UV solapadas ${a} / ${b}`);
      }
    }
    assert.ok(d.parts.length <= 24, `${d.key}: demasiados huesos`);
  }
  // Texturas de todos los pelajes: todas las caras pintadas y opacas.
  for (const id of [...NEW.map((n) => n[0]), MOB_PIG]) {
    const d = MOBS[id];
    const variants = MOUNTS[id]?.variants ?? 1;
    for (let v = 0; v < variants; v++) {
      const tex = generateMobTexture(id, v);
      assert.equal(tex.width, d.atlas[0]);
      assert.equal(tex.height, d.atlas[1]);
      for (const p of d.parts) {
        const [w, hh, dd] = p.size;
        for (const [u, vv, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, hh, dd)) {
          for (let y = vv; y < vv + fh; y++) for (let x = u; x < u + fw; x++) {
            assert.equal(tex.rgba[(y * tex.width + x) * 4 + 3], 255, `${d.key}#${v}.${p.name}: téxel sin pintar en ${x},${y}`);
          }
        }
      }
    }
  }
  // Los pelajes del caballo son distintos entre sí.
  const a = generateMobTexture(MOB_HORSE, 0).rgba, b = generateMobTexture(MOB_HORSE, 4).rgba;
  assert.notDeepEqual(a, b, 'caballo blanco y negro no son iguales');
  // La silla: objeto con dibujo, en el creativo y con receta.
  assert.ok(isValidItem(SADDLE) && itemSpriteIndex(SADDLE) >= 0 && CREATIVE_ITEMS.includes(SADDLE));
  assert.equal(matchRecipe([0, LEATHER, 0, LEATHER, IRON_INGOT, LEATHER, 0, 0, 0], 3)?.out.id, SADDLE); // Minecraft 26.x
  // Cría entre especies.
  assert.ok(canMate(MOB_HORSE, MOB_DONKEY) && canMate(MOB_DONKEY, MOB_HORSE) && !canMate(MOB_HORSE, MOB_LLAMA));
  assert.equal(offspringType(MOB_DONKEY, MOB_HORSE), MOB_MULE);
  // Aparición por bioma.
  assert.equal(mountSpawnFor(BIOME_PLAINS, 0.05), MOB_HORSE);
  assert.equal(mountSpawnFor(BIOME_SAVANNA, 0.4), MOB_LLAMA);
  assert.equal(mountSpawnFor(BIOME_MOUNTAINS, 0.1), MOB_LLAMA);
  assert.equal(mountSpawnFor(BIOME_DESERT, 0.1), MOB_CAMEL);
  assert.equal(mountSpawnFor(BIOME_TAIGA, 0.01), 0);
});

test('montar y bajarse: silla, jinete, otros jugadores y quien llega después', () => {
  const { h, c, bx, by, bz } = field();
  const c2 = h.join('Mirona');
  c2.pos(bx + 2.5, by, bz + 2.5);
  const E = h.gs.entities;
  const me = c.welcome.id as string;
  const horse = E.spawnMob(MOB_HORSE, bx + 2.5, by, bz + 0.5)!;
  horse.tamed = false;
  // Sin domar no admite silla.
  c.send({ t: 'interact', e: horse.id, item: SADDLE, q: 1 });
  assert.equal(ires(c, 1)?.ok, false, 'sin domar no se deja ensillar');
  horse.tamed = true;
  c.send({ t: 'interact', e: horse.id, item: SADDLE, q: 2 });
  const r = ires(c, 2);
  assert.ok(r?.ok && r.take === 1 && horse.saddled, 'domado: se le pone la silla (y se gasta)');
  c.send({ t: 'interact', e: horse.id, item: SADDLE, q: 3 });
  assert.equal(ires(c, 3)?.ok, false, 'no admite dos sillas');

  c2.conn.msgs = [];
  c.send({ t: 'mount', e: horse.id });
  const seen = c2.conn.take('ride').find((m) => m.id === me);
  assert.ok(seen && seen.e === horse.id && seen.c === true && Array.isArray(seen.st), 'los demás saben quién monta qué');
  assert.equal(horse.rider, me);
  assert.equal(h.gs.sys.riding.mountOf(me), horse.id);
  h.tick(2);
  assert.ok((horse.flags & EF_SADDLE) && (horse.flags & EF_RIDDEN) && (horse.flags & EF_TAMED), 'bits de silla, jinete y domado');

  // Otro no puede montarse en una montura ocupada.
  c2.send({ t: 'mount', e: horse.id });
  assert.equal(c2.conn.take('ride').find((m) => m.id === c2.welcome.id)?.e, 0, 'ocupada: se rechaza');
  assert.equal(horse.rider, me);

  // Quien entra después ve al jinete.
  const c3 = h.join('Tardona');
  assert.ok(c3.conn.take('ride').some((m) => m.id === me && m.e === horse.id), 'al entrar se ve quién va montado');

  // Bajarse.
  c2.conn.msgs = [];
  c.send({ t: 'dismount' });
  assert.equal(horse.rider, undefined);
  assert.equal(h.gs.sys.riding.mountOf(me), undefined);
  assert.ok(c2.conn.take('ride').some((m) => m.id === me && m.e === 0), 'los demás ven que se bajó');

  // Lejos no se puede montar; al morir o alejarse del caballo se baja solo.
  c.pos(bx + 9.5, by, bz + 9.5);
  c.send({ t: 'mount', e: horse.id });
  assert.equal(horse.rider, undefined, 'demasiado lejos para montarse');
  c.pos(bx + 0.5, by, bz + 0.5);
  c.send({ t: 'mount', e: horse.id });
  assert.equal(horse.rider, me);
  c.pos(bx + 0.5, by, bz + 0.5, STATE_DEAD);
  h.tick(1);
  assert.equal(horse.rider, undefined, 'al morir se baja');
  c.pos(bx + 0.5, by, bz + 0.5);
  c.send({ t: 'mount', e: horse.id });
  c.send({ t: 'pos', p: [bx + 40.5, by, bz + 0.5], r: [0, 0], s: 0 });
  h.tick(1);
  assert.equal(horse.rider, undefined, 'si el jinete se separa de la montura, se baja');
  c.pos(bx + 0.5, by, bz + 0.5);
  c.send({ t: 'mount', e: horse.id });
  assert.equal(horse.rider, me);
  h.gs.disconnect(c.conn);
  assert.equal(horse.rider, undefined, 'al salir del mundo se baja');

  // El cerdo: sólo con silla, y no se guía.
  const c4 = h.join('Porquera');
  c4.pos(bx + 0.5, by, bz + 0.5);
  const pig = E.spawnMob(MOB_PIG, bx - 1.5, by, bz + 0.5)!;
  c4.send({ t: 'mount', e: pig.id });
  assert.equal(pig.rider, undefined, 'cerdo sin silla: no');
  c4.send({ t: 'interact', e: pig.id, item: SADDLE, q: 1 });
  assert.ok(ires(c4, 1)?.ok && pig.saddled, 'al cerdo se le pone la silla sin domarlo');
  c4.conn.msgs = [];
  c4.send({ t: 'mount', e: pig.id });
  const pr = c4.conn.take('ride').find((m) => m.id === c4.welcome.id);
  assert.ok(pr && pr.e === pig.id && pr.c === false, 'cerdo con silla: se monta, pero no se guía');
});

test('movimiento de la montura: el jinete la mueve y el servidor lo valida', () => {
  const { h, c, bx, by, bz } = field();
  const E = h.gs.entities;
  const horse = E.spawnMob(MOB_HORSE, bx + 1.5, by, bz + 0.5)!;
  horse.tamed = true;
  horse.saddled = true;
  horse.mountSpeed = 10;
  c.send({ t: 'mount', e: horse.id });
  h.tick(10);
  // Guiada: no se mueve sola.
  const x0 = horse.x, z0 = horse.z;
  h.tick(40);
  assert.ok(Math.abs(horse.x - x0) < 1e-6 && Math.abs(horse.z - z0) < 1e-6, 'la montura guiada no pasea por su cuenta');

  // Un paso normal se acepta.
  c.conn.msgs = [];
  c.send({ t: 'mpos', e: horse.id, p: [horse.x + 0.8, horse.y, horse.z], r: 1.2 });
  assert.ok(Math.abs(horse.x - (x0 + 0.8)) < 1e-6 && Math.abs(horse.yaw - 1.2) < 1e-6, 'paso aceptado');
  assert.equal(c.conn.take('mfix').length, 0);
  h.tick(3);
  // Otro paso a velocidad de galope (10 bloques/s durante 0,15 s).
  const x1 = horse.x;
  c.send({ t: 'mpos', e: horse.id, p: [x1 + 1.4, horse.y, horse.z], r: 1.2 });
  assert.ok(Math.abs(horse.x - (x1 + 1.4)) < 1e-6, 'galope aceptado');

  // Teletransporte: rechazado y corregido.
  h.tick(3);
  const [sx, sy, sz] = [horse.x, horse.y, horse.z];
  c.send({ t: 'mpos', e: horse.id, p: [sx + 30, sy, sz], r: 0 });
  let fix = c.conn.take('mfix');
  assert.ok(fix.length === 1 && fix[0].e === horse.id && Math.abs(fix[0].p[0] - sx) < 0.01, 'salto de 30 bloques rechazado');
  assert.equal(horse.x, sx);
  // Volar hacia arriba: rechazado.
  h.tick(3);
  c.send({ t: 'mpos', e: horse.id, p: [sx, sy + 8, sz], r: 0 });
  fix = c.conn.take('mfix');
  assert.ok(fix.length === 1 && horse.y === sy, 'subir 8 bloques de golpe se rechaza');
  // Meterse en la pared: rechazado.
  h.gs.world.setBlock(Math.floor(sx) - 1, by, Math.floor(sz), STONE);
  h.gs.world.setBlock(Math.floor(sx) - 1, by + 1, Math.floor(sz), STONE);
  h.tick(3);
  c.send({ t: 'mpos', e: horse.id, p: [Math.floor(sx) - 0.5, sy, Math.floor(sz) + 0.5], r: 0 });
  assert.equal(c.conn.take('mfix').length, 1, 'dentro de un bloque se rechaza');
  // Valores no numéricos: se ignoran sin romper nada.
  c.send({ t: 'mpos', e: horse.id, p: ['a', null, 3], r: 0 });
  c.send({ t: 'mpos', e: horse.id + 999, p: [sx, sy, sz], r: 0 });
  assert.equal(horse.x, sx);

  // Sin silla (o sin domar) no se guía: 'mpos' no la mueve.
  c.send({ t: 'dismount' });
  const wild = E.spawnMob(MOB_HORSE, bx - 1.5, by, bz + 0.5)!;
  wild.tamed = false;
  wild.temper = 0;
  c.send({ t: 'mount', e: wild.id });
  const wx = wild.x;
  h.tick(2);
  c.send({ t: 'mpos', e: wild.id, p: [wild.x + 0.5, wild.y, wild.z], r: 0 });
  assert.ok(Math.abs(wild.x - (wx + 0.5)) > 1e-3 || wild.rider === undefined, 'una montura sin domar no la guía el jinete');
});

test('doma: sin domar te tira y gana paciencia; con paciencia se deja', () => {
  const { h, c, bx, by, bz } = field();
  const E = h.gs.entities;
  const me = c.welcome.id as string;
  const wild = E.spawnMob(MOB_HORSE, bx + 1.5, by, bz + 0.5)!;
  wild.tamed = false;
  wild.temper = 0;
  c.conn.msgs = [];
  c.send({ t: 'mount', e: wild.id });
  assert.equal(c.conn.take('ride').find((m) => m.id === me)?.c, false, 'sin domar no se guía');
  let thrown = false;
  for (let i = 0; i < 100 && !thrown; i++) {
    c.pos(wild.x, wild.y + 0.7, wild.z);
    h.tick(1);
    thrown = wild.rider === undefined;
  }
  assert.ok(thrown && c.conn.take('ride').some((m) => m.id === me && m.e === 0), 'con paciencia 0 siempre tira al jinete');
  assert.ok(!wild.tamed && wild.temper === 5, `gana paciencia (${wild.temper})`);
  // Comer la calma (trigo +3) y la cura; no la enamora.
  c.pos(wild.x, wild.y, wild.z);
  c.send({ t: 'interact', e: wild.id, item: WHEAT, q: 7 });
  const r = ires(c, 7);
  assert.ok(r?.ok && r.take === 1 && Number(wild.temper) === 8 && !((wild.love ?? 0) > 0), 'comer sube la paciencia sin enamorar');
  // Paciencia al máximo: se deja domar.
  wild.temper = 100;
  c.conn.msgs = [];
  c.send({ t: 'mount', e: wild.id });
  for (let i = 0; i < 100; i++) {
    c.pos(wild.x, wild.y + 0.7, wild.z);
    h.tick(1);
  }
  assert.ok(wild.tamed && wild.rider === me, 'domado y sigue montado');
  assert.equal(c.conn.take('ride').filter((m) => m.id === me && m.e === wild.id).length, 2, 'se avisa al domarlo');
  // Los camellos no hace falta domarlos.
  const camel = E.spawnMob(MOB_CAMEL, bx - 3.5, by, bz + 0.5)!;
  assert.ok(camel.tamed, 'camello: domado de serie');
});

test('cría: caballo y burro domados dan una mula; las mulas no crían', () => {
  const { h, c, bx, by, bz } = field();
  const E = h.gs.entities;
  const horse = E.spawnMob(MOB_HORSE, bx - 1.5, by, bz + 0.5)!;
  const donkey = E.spawnMob(MOB_DONKEY, bx + 2.5, by, bz + 0.5)!;
  horse.tamed = donkey.tamed = true;
  horse.mountSpeed = 11;
  c.send({ t: 'interact', e: horse.id, item: GOLDEN_APPLE, q: 1 });
  c.send({ t: 'interact', e: donkey.id, item: WHEAT, q: 2 });
  assert.ok(ires(c, 1)?.ok && ires(c, 2)?.ok && (horse.love ?? 0) > 0 && (donkey.love ?? 0) > 0, 'enamorados');
  let mule = null;
  for (let i = 0; i < 60 && !mule; i++) {
    h.tick(10);
    mule = [...E.list.values()].find((e) => e.type === MOB_MULE) ?? null;
  }
  assert.ok(mule && (mule.growAge ?? 0) > 0, 'nace una cría de mula');
  const md = MOUNTS[MOB_MULE];
  assert.ok(mule!.mountSpeed! >= md.speed[0] && mule!.mountSpeed! <= md.speed[1], 'aptitudes de mula');
  // Una mula adulta no se enamora.
  const adult = E.spawnMob(MOB_MULE, bx + 0.5, by, bz - 2.5)!;
  adult.tamed = true;
  c.send({ t: 'interact', e: adult.id, item: GOLDEN_APPLE, q: 3 });
  assert.ok(!ires(c, 3)?.ok && !((adult.love ?? 0) > 0), 'la mula no cría');
  // Dos caballos: potro con el color de uno de los padres.
  const m1 = E.spawnMob(MOB_HORSE, bx - 4.5, by, bz - 4.5)!;
  const m2 = E.spawnMob(MOB_HORSE, bx - 3.5, by, bz - 4.5)!;
  m1.tamed = m2.tamed = true;
  m1.variant = 2;
  m2.variant = 4 + 7 * 3;
  const before = new Set([...E.list.values()].map((e) => e.id));
  E.animals.breed(m1, m2);
  const foal = [...E.list.values()].find((e) => !before.has(e.id) && e.type === MOB_HORSE)!;
  assert.ok(foal && [2, 4].includes((foal.variant ?? 0) % 7), `el potro hereda un color (${foal?.variant})`);
});

test('la llama escupe al que le pega', () => {
  const { h, c, bx, by, bz } = field();
  const E = h.gs.entities;
  const llama = E.spawnMob(MOB_LLAMA, bx + 3.5, by, bz + 0.5)!;
  h.tick(5);
  c.conn.msgs = [];
  c.send({ t: 'attack', e: llama.id, item: 0 });
  let spat = false;
  for (let i = 0; i < 120 && !spat; i++) {
    h.tick(1);
    spat = c.conn.take('hurt').some((m) => m.c === 'llama');
  }
  assert.ok(spat, 'la llama escupe');
  assert.ok(llama.health > 0 && !llama.dead);
});

test('guardado: pelaje, doma, silla y aptitudes vuelven igual', () => {
  const { h, bx, by, bz } = field();
  const E = h.gs.entities;
  for (const e of [...E.list.values()]) E.list.delete(e.id);
  const horse = E.spawnMob(MOB_HORSE, bx + 0.5, by, bz + 0.5)!;
  horse.variant = 23;
  horse.tamed = true;
  horse.saddled = true;
  horse.temper = 40;
  horse.mountSpeed = 11.2;
  horse.mountJump = 13.1;
  const llama = E.spawnMob(MOB_LLAMA, bx + 2.5, by, bz + 0.5)!;
  llama.variant = 3;
  const pig = E.spawnMob(MOB_PIG, bx - 2.5, by, bz + 0.5)!;
  pig.saddled = true;
  const store = new MemoryStore();
  store.setMeta('mobs', E.serializePassive());
  const gs2 = new GameServer(store, { now: () => h.clock.now });
  const back = [...gs2.entities.list.values()];
  const h2 = back.find((e) => e.type === MOB_HORSE)!;
  assert.ok(h2 && h2.variant === 23 && h2.tamed && h2.saddled && h2.temper === 40, 'caballo');
  assert.ok(Math.abs(h2.mountSpeed! - 11.2) < 0.1 && Math.abs(h2.mountJump! - 13.1) < 0.1, 'aptitudes');
  assert.equal(back.find((e) => e.type === MOB_LLAMA)?.variant, 3, 'llama');
  assert.ok(back.find((e) => e.type === MOB_PIG)?.saddled, 'cerdo con silla');
});
