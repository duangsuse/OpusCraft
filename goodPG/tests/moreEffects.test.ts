// Fase 7 (efectos): los efectos que faltaban. Prisa y Fatiga minera (minado y ataque), Saturación,
// Marchitamiento, Salud mejorada, Ceguera (sin correr), Levitación, el pez globo y el estofado
// sospechoso, /efecto con los nuevos, la campana que hace brillar a los saqueadores, el delfín que da su
// gracia y los efectos de las criaturas (brillo, marchitamiento y levitación).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STONE, AIR, WATER, BELL, POPPY, DANDELION, CORNFLOWER, TORCHFLOWER, FLOWERS, RED_MUSHROOM, BROWN_MUSHROOM,
} from '../src/shared/blocks';
import { ITEMS, PUFFERFISH, BOWL } from '../src/shared/items';
import { MOB_PIG, MOB_COW, MOB_PILLAGER, MOB_DOLPHIN } from '../src/shared/mobs';
import { STATE_SWIM, STATE_PRONE } from '../src/shared/protocol';
import { matchRecipe } from '../src/shared/recipes';
import { stewEffect } from '../src/shared/decorFood';
import {
  EFFECTS, EFFECT_HASTE, EFFECT_MINING_FATIGUE, EFFECT_NAUSEA, EFFECT_BLINDNESS, EFFECT_SATURATION, EFFECT_GLOWING,
  EFFECT_DOLPHINS_GRACE, EFFECT_HEALTH_BOOST, EFFECT_DARKNESS, EFFECT_WITHER, EFFECT_LEVITATION, EFFECT_JUMP_BOOST,
  EFFECT_NIGHT_VISION, EFFECT_POISON, EFFECT_HUNGER, EF_GLOWING, BELL_GLOW_DELAY, BELL_GLOW_SECONDS, MAX_HEALTH_CAP,
  miningSpeedFactor, attackSpeedFactor, witherInterval, maxHealthWith, levitate, darknessPulse, nauseaStep, effectByName,
} from '../src/shared/effects';
import { StatusEffects } from '../src/client/game/statusEffects';
import { Survival } from '../src/client/game/Survival';
import { Player } from '../src/client/game/Player';
import { breakTime } from '../src/client/game/mining';
import type { Entity } from '../src/shared/sim/entities/types';
import { makeServer, type Harness } from './harness';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

function run(fx: StatusEffects, s: Survival, secs: number, dt = 0.05): void {
  for (let i = 0; i < Math.round(secs / dt); i++) fx.tick(dt, s);
}

test('efectos nuevos: más de 30, con nombre, color e ids seguidos', () => {
  const list = Object.values(EFFECTS);
  assert.ok(list.length > 30, `${list.length} efectos`);
  assert.deepEqual(list.map((e) => e.id), list.map((_, i) => i + 1));
  for (const e of list) assert.ok(e.name && e.color.every((c) => c >= 0 && c <= 255), e.key);
  assert.equal(effectByName('prisa')?.id, EFFECT_HASTE);
  assert.equal(effectByName('fatiga_minera')?.id, EFFECT_MINING_FATIGUE);
  assert.equal(effectByName('Nauseas')?.id, EFFECT_NAUSEA);
  assert.equal(effectByName('gracia_del_delfin')?.id, EFFECT_DOLPHINS_GRACE);
  assert.equal(effectByName('Salud mejorada')?.id, EFFECT_HEALTH_BOOST);
  assert.equal(effectByName('marchitamiento')?.id, EFFECT_WITHER);
  assert.equal(effectByName('levitation')?.id, EFFECT_LEVITATION);
  assert.equal(effectByName('oscuridad')?.id, EFFECT_DARKNESS);
});

test('efectos nuevos: fórmulas de Minecraft', () => {
  near(miningSpeedFactor(-1, -1), 1);
  near(miningSpeedFactor(1, -1), 1.4);
  near(miningSpeedFactor(-1, 0), 0.3);
  near(miningSpeedFactor(-1, 2), 0.027);
  near(miningSpeedFactor(-1, 5), 0.0081);
  near(attackSpeedFactor(1, -1), 1.2);
  near(attackSpeedFactor(-1, 2), 0.7);
  near(witherInterval(0), 2);
  near(witherInterval(1), 1);
  near(witherInterval(5), 0.05);
  assert.equal(maxHealthWith(-1), 20);
  assert.equal(maxHealthWith(1), 28);
  assert.equal(MAX_HEALTH_CAP, 44);
  // Levitación: tiende a 1 bloque/s por nivel.
  let vy = -5;
  for (let i = 0; i < 100; i++) vy = levitate(vy, 1, 0.05);
  near(vy, 2, 1e-3);
  near(levitate(0, 0, 0.05), 0.2);
  near(darknessPulse(0), 1);
  near(darknessPulse(1), 0);
  near(nauseaStep(0, true, 7.5), 1);
  near(nauseaStep(1, false, 0.5), 0.5);
});

test('efectos nuevos: saturación, marchitamiento y salud mejorada en el jugador', () => {
  // Saturación del estofado de diente de león: 7 ticks → 7 de comida y 14 de saturación, sea cual sea el frame.
  for (const dt of [0.05, 1 / 60, 1 / 144]) {
    const fx = new StatusEffects();
    const s = new Survival();
    s.food = 5;
    s.saturation = 0;
    fx.add(EFFECT_SATURATION, 0.35, 0, s);
    run(fx, s, 1, dt);
    assert.equal(s.food, 12, `comida con dt ${dt}`);
    assert.equal(s.saturation, 12, `saturación (acotada por la comida) con dt ${dt}`);
    assert.ok(!fx.has(EFFECT_SATURATION));
  }
  // Marchitamiento: a diferencia del veneno, mata.
  const fx = new StatusEffects();
  const s = new Survival();
  s.health = 3;
  fx.add(EFFECT_WITHER, 20, 1, s);
  run(fx, s, 2.05);
  assert.equal(s.health, 1, 'un punto por segundo en el nivel II');
  run(fx, s, 1.5);
  assert.ok(s.dead, 'muere');
  assert.equal(s.deathCause, 'wither');
  // Salud mejorada: más vida máxima (la regeneración llega hasta ella).
  const fx2 = new StatusEffects();
  const s2 = new Survival();
  fx2.add(EFFECT_HEALTH_BOOST, 60, 1, s2);
  assert.equal(fx2.maxHealth, 28);
  s2.maxHealth = fx2.maxHealth;
  s2.heal(100);
  assert.equal(s2.health, 28);
  s2.maxHealth = 20;
  s2.heal(100);
  assert.equal(s2.health, 28, 'curar no quita la vida de más (la recorta el juego al acabarse el efecto)');
});

test('efectos nuevos: ceguera, prisa y fatiga en el cliente', () => {
  const s = new Survival();
  assert.ok(s.canSprint());
  s.blind = true;
  assert.ok(!s.canSprint(), 'ciego no se corre');
  const fx = new StatusEffects();
  fx.add(EFFECT_BLINDNESS, 11, 0);
  assert.ok(fx.blind);
  near(fx.blindness, 0, 1e-9);
  fx.tick(0.5, s);
  near(fx.blindness, 0.5);
  fx.tick(5, s);
  near(fx.blindness, 1);
  fx.tick(5.2, s);
  near(fx.blindness, 0.3, 1e-6);
  // Prisa y Fatiga minera en el tiempo de minado (el Poder del conducto cuenta como Prisa I).
  const base = breakTime(STONE, 0, false, true);
  const fx2 = new StatusEffects();
  fx2.add(EFFECT_HASTE, 30, 1);
  assert.ok(breakTime(STONE, 0, false, true, 0, fx2.miningSpeed) < base * 0.75, 'con Prisa II se mina antes');
  near(fx2.attackSpeed, 1.2);
  fx2.add(EFFECT_MINING_FATIGUE, 30, 2);
  assert.ok(breakTime(STONE, 0, false, true, 0, fx2.miningSpeed) > base * 20, 'con Fatiga minera III casi no se mina');
  // Náuseas: la vista sólo se retuerce mientras quedan más de 3 s.
  const fx3 = new StatusEffects();
  fx3.add(EFFECT_NAUSEA, 5, 0);
  assert.ok(fx3.nauseous);
  fx3.tick(2.5, s);
  assert.ok(!fx3.nauseous);
});

test('efectos nuevos: levitación en la física del jugador', () => {
  const air = { getBlock: () => AIR };
  const p = new Player();
  p.y = 100;
  p.levitation = 0;
  const controls = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  for (let i = 0; i < 60; i++) p.update(0.05, controls, air);
  assert.ok(p.y > 102, `sube despacio (${p.y})`);
  near(p.vy, 1, 0.05);
  assert.equal(p.fallDistance, 0);
  p.levitation = -1;
  const y0 = p.y;
  for (let i = 0; i < 20; i++) p.update(0.05, controls, air);
  assert.ok(p.y < y0, 'sin el efecto, cae');
});

test('efectos nuevos: pez globo y estofado sospechoso', () => {
  const pf = ITEMS[PUFFERFISH].food!.effects!.map(([id, secs, amp]) => [id, secs, amp]);
  assert.deepEqual(pf, [[EFFECT_HUNGER, 15, 2], [EFFECT_POISON, 60, 1], [EFFECT_NAUSEA, 15, 0]]);
  const stew = (flower: number) => stewEffect(matchRecipe([RED_MUSHROOM, BROWN_MUSHROOM, BOWL, flower], 2)!.out.dmg);
  assert.deepEqual(stew(FLOWERS.azure_bluet), [EFFECT_BLINDNESS, 11]);
  assert.deepEqual(stew(DANDELION), [EFFECT_SATURATION, 0.35]);
  assert.deepEqual(stew(FLOWERS.blue_orchid), [EFFECT_SATURATION, 0.35]);
  assert.deepEqual(stew(CORNFLOWER), [EFFECT_JUMP_BOOST, 5]);
  assert.deepEqual(stew(POPPY), [EFFECT_NIGHT_VISION, 5]);
  assert.deepEqual(stew(TORCHFLOWER), [EFFECT_NIGHT_VISION, 5]);
});

// ------------------------------------------------------------------ servidor

/** Servidor con una plataforma de piedra en el cielo y un jugador encima. */
function arena(seed: number, mode: 's' | 'c' = 'c'): { h: Harness; c: ReturnType<Harness['join']>; x: number; y: number; z: number } {
  const h = makeServer(seed);
  const c = h.join('Testigo', mode);
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const x = Math.floor(sx), y = 200, z = Math.floor(sz);
  const W = h.gs.world;
  for (let cx = Math.floor((x - 24) / 16) - 1; cx <= Math.floor((x + 24) / 16) + 1; cx++) {
    for (let cz = Math.floor((z - 24) / 16) - 1; cz <= Math.floor((z + 24) / 16) + 1; cz++) W.ensureChunk(cx, cz);
  }
  for (let dx = -12; dx <= 12; dx++) {
    for (let dz = -12; dz <= 12; dz++) {
      W.setBlock(x + dx, y - 1, z + dz, STONE);
      for (let yy = y; yy < y + 8; yy++) W.setBlock(x + dx, yy, z + dz, AIR);
    }
  }
  c.pos(x + 0.5, y, z + 0.5);
  h.tick(2);
  return { h, c, x, y, z };
}

test('servidor: /efecto con los efectos nuevos', () => {
  const { c } = arena(3101);
  c.conn.msgs = [];
  c.send({ t: 'chat', m: '/efecto prisa 30 2' });
  const m = c.conn.take('effect')[0];
  assert.ok(m && m.id === EFFECT_HASTE && m.s === 30 && m.a === 1, JSON.stringify(m));
  c.send({ t: 'chat', m: '/efecto gracia_del_delfin' });
  assert.equal(c.conn.take('effect')[0]?.id, EFFECT_DOLPHINS_GRACE);
});

test('servidor: la campana hace brillar a los saqueadores cercanos', () => {
  const { h, c, x, y, z } = arena(3102);
  const W = h.gs.world;
  const raider = h.gs.entities.spawnMob(MOB_PILLAGER, x + 8.5, y, z + 0.5)!;
  const far = h.gs.entities.spawnMob(MOB_PILLAGER, x + 0.5, y + 60, z + 0.5)!; // a más de 48 bloques
  const cow = h.gs.entities.spawnMob(MOB_COW, x - 3.5, y, z + 0.5)!;
  W.setBlock(x + 2, y, z + 2, BELL);
  c.send({ t: 'use', x: x + 2, y, z: z + 2, yaw: 0 });
  h.tick(Math.round(BELL_GLOW_DELAY * 20) - 5);
  assert.ok(!(raider.flags & EF_GLOWING), 'aún no resuena');
  h.tick(8);
  assert.ok(raider.flags & EF_GLOWING, 'el saqueador brilla');
  assert.ok(h.gs.entities.effects.has(raider, EFFECT_GLOWING));
  assert.ok(!(far.flags & EF_GLOWING), 'el lejano no');
  assert.ok(!(cow.flags & EF_GLOWING), 'la vaca no');
  h.tick(Math.round(BELL_GLOW_SECONDS * 20) + 5);
  assert.ok(!(raider.flags & EF_GLOWING), 'se le pasa');
});

test('servidor: marchitamiento y levitación en las criaturas', () => {
  const { h, x, y, z } = arena(3103);
  const cow = h.gs.entities.spawnMob(MOB_COW, x + 3.5, y, z + 3.5)!;
  h.gs.entities.effects.add(cow, EFFECT_WITHER, 60, 2);
  let dead = false;
  for (let i = 0; i < 20 * 12 && !dead; i++) {
    h.tick(1);
    dead = cow.dead || !h.gs.entities.list.has(cow.id);
  }
  assert.ok(dead, 'el marchitamiento mata');
  const pig: Entity = h.gs.entities.spawnMob(MOB_PIG, x - 3.5, y, z - 3.5)!;
  h.tick(20);
  const y0 = pig.y;
  h.gs.entities.effects.add(pig, EFFECT_LEVITATION, 3, 1);
  h.tick(40);
  assert.ok(pig.y > y0 + 2, `sube (${pig.y - y0})`);
  h.tick(80);
  assert.ok(pig.levitation === undefined, 'se acaba');
});

test('servidor: el delfín da Gracia del delfín a quien bucea cerca', () => {
  const { h, c, x, y, z } = arena(3104);
  const W = h.gs.world;
  // Una piscina honda en la plataforma.
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) for (let yy = y; yy < y + 6; yy++) W.setBlock(x + dx, yy, z + dz, WATER);
  const dolphin = h.gs.entities.spawnMob(MOB_DOLPHIN, x + 4.5, y + 2, z + 0.5)!;
  assert.ok(dolphin);
  c.conn.msgs = [];
  let got = false;
  for (let i = 0; i < 20 * 10 && !got; i++) {
    c.pos(x + 0.5, y + 2, z + 0.5, STATE_SWIM | STATE_PRONE);
    h.tick(1);
    got = c.conn.take('effect').some((m) => m.id === EFFECT_DOLPHINS_GRACE);
  }
  assert.ok(got, 'buceando junto al delfín');
  // Sin bucear (sólo en el agua), no.
  c.conn.msgs = [];
  let again = false;
  for (let i = 0; i < 20 * 6; i++) {
    c.pos(x + 0.5, y + 2, z + 0.5, STATE_SWIM);
    h.tick(1);
    again ||= c.conn.take('effect').some((m) => m.id === EFFECT_DOLPHINS_GRACE);
  }
  assert.ok(!again, 'nadando sin bucear no');
});
