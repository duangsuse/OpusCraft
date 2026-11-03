// Efectos de estado: reglas por tick (regeneración, veneno, hambre, absorción), multiplicadores,
// alimentos que los dan, el comando /efecto, el guardado con el jugador, la Fuerza en el daño cuerpo a
// cuerpo y las recetas de la manzana dorada y el escudo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, SPRUCE_PLANKS } from '../src/shared/blocks';
import { ITEMS, APPLE, GOLD_INGOT, IRON_INGOT, GOLDEN_APPLE, SPIDER_EYE, SHIELD, ROTTEN_FLESH } from '../src/shared/items';
import { MOB_ZOMBIE } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import {
  EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_REGENERATION, EFFECT_POISON, EFFECT_HUNGER,
  EFFECT_ABSORPTION, EFFECT_NIGHT_VISION, MAX_EFFECT_SECONDS, MAX_EFFECT_AMP, effectByName, speedMultiplier, meleeBonus,
} from '../src/shared/effects';
import { StatusEffects } from '../src/client/game/statusEffects';
import { Survival } from '../src/client/game/Survival';
import { Checks, makeServer } from './harness';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

/** Avanza `secs` segundos en pasos de 50 ms. */
function run(fx: StatusEffects, s: Survival, secs: number): void {
  for (let i = 0; i < Math.round(secs * 20); i++) fx.tick(0.05, s);
}

test('efectos: multiplicadores y nombres', () => {
  near(speedMultiplier(-1, -1), 1);
  near(speedMultiplier(0, -1), 1.2);
  near(speedMultiplier(1, -1), 1.4);
  near(speedMultiplier(-1, 0), 0.85);
  near(speedMultiplier(-1, 3), 0.4);
  near(speedMultiplier(-1, 9), 0, 1e-9);
  assert.equal(meleeBonus(-1, -1), 0);
  assert.equal(meleeBonus(0, -1), 3);
  assert.equal(meleeBonus(1, -1), 6);
  assert.equal(meleeBonus(-1, 0), -4);
  assert.equal(effectByName('velocidad')?.id, EFFECT_SPEED);
  assert.equal(effectByName('Visión nocturna')?.id, EFFECT_NIGHT_VISION);
  assert.equal(effectByName('nada'), null);
});

test('efectos: añadir, sustituir y quitar', () => {
  const fx = new StatusEffects();
  const s = new Survival();
  fx.add(EFFECT_SPEED, 30, 0);
  fx.add(EFFECT_SPEED, 10, 1);
  assert.equal(fx.amp(EFFECT_SPEED), 1, 'gana el nivel más alto');
  fx.add(EFFECT_SPEED, 60, 0);
  assert.equal(fx.list.get(EFFECT_SPEED)!.time, 10, 'uno de menos nivel no lo pisa');
  fx.add(EFFECT_SPEED, 20, 1);
  assert.equal(fx.list.get(EFFECT_SPEED)!.time, 20, 'mismo nivel: gana el más largo');
  fx.add(EFFECT_SPEED, 5, 1);
  assert.equal(fx.list.get(EFFECT_SPEED)!.time, 20, '… y no se acorta');
  fx.add(EFFECT_SLOWNESS, 99999, 99);
  assert.equal(fx.list.get(EFFECT_SLOWNESS)!.time, MAX_EFFECT_SECONDS, 'duración acotada');
  assert.equal(fx.amp(EFFECT_SLOWNESS), MAX_EFFECT_AMP, 'nivel acotado');
  fx.add(999, 10, 0);
  fx.add(EFFECT_STRENGTH, 0, 0);
  assert.equal(fx.list.size, 2, 'efectos desconocidos o sin duración: nada');
  near(fx.speed, speedMultiplier(1, MAX_EFFECT_AMP));
  fx.add(EFFECT_STRENGTH, 10, 0);
  fx.add(EFFECT_WEAKNESS, 10, 0);
  assert.equal(fx.melee, -1);
  // Guardado de ida y vuelta.
  const back = new StatusEffects();
  back.fromWire(fx.toWire(), s);
  assert.deepEqual([...back.list.keys()].sort(), [...fx.list.keys()].sort());
  back.fromWire([[EFFECT_SPEED, 0, 5], 'x', [42, 0, 5], [EFFECT_POISON, 0, -3]], s);
  assert.deepEqual([...back.list.keys()], [EFFECT_SPEED], 'basura del guardado descartada');
  fx.clear(s);
  assert.equal(fx.list.size, 0);
});

test('efectos: regeneración, veneno, hambre y expiración', () => {
  const fx = new StatusEffects();
  const s = new Survival();
  s.health = 10;
  fx.add(EFFECT_REGENERATION, 10, 0);
  run(fx, s, 5.1);
  assert.equal(s.health, 12, 'Regeneración I: medio corazón cada 2,5 s');
  fx.add(EFFECT_REGENERATION, 10, 1);
  run(fx, s, 2.6);
  assert.equal(s.health, 14, 'Regeneración II: el doble de rápido');
  run(fx, s, 10);
  assert.ok(!fx.has(EFFECT_REGENERATION), 'se acaba');
  assert.equal(s.health, 20, 'nunca pasa de 20');

  s.health = 4;
  fx.add(EFFECT_POISON, 30, 0);
  run(fx, s, 1.3);
  assert.equal(s.health, 3, 'Veneno I: medio corazón cada 1,25 s');
  run(fx, s, 20);
  assert.equal(s.health, 1, 'el veneno no mata');
  assert.ok(!s.dead);
  fx.remove(EFFECT_POISON);

  const exhaustion = s.exhaustion;
  fx.add(EFFECT_HUNGER, 30, 0);
  run(fx, s, 10);
  near(s.exhaustion - exhaustion, 1, 1e-6);
});

test('efectos: absorción', () => {
  const fx = new StatusEffects();
  const s = new Survival();
  fx.add(EFFECT_ABSORPTION, 120, 0, s);
  assert.equal(s.absorption, 4, 'Absorción I: dos corazones dorados');
  s.damage(3, 'zombie');
  assert.equal(s.absorption, 1);
  assert.equal(s.health, 20, 'los dorados se gastan antes');
  s.health = 20;
  s.damage(5, 'zombie', true);
  assert.equal(s.absorption, 0);
  assert.equal(s.health, 16);
  fx.tick(0.05, s);
  assert.ok(!fx.has(EFFECT_ABSORPTION), 'sin corazones dorados, el efecto acaba');
  fx.add(EFFECT_ABSORPTION, 1, 1, s);
  assert.equal(s.absorption, 8);
  run(fx, s, 1.1);
  assert.equal(s.absorption, 0, 'al expirar se pierden');
});

test('efectos: alimentos y recetas', () => {
  const golden = ITEMS[GOLDEN_APPLE].food!;
  assert.ok(golden.always, 'la manzana dorada se come con la barra llena');
  assert.deepEqual(golden.effects!.map((e) => e[0]).sort(), [EFFECT_REGENERATION, EFFECT_ABSORPTION].sort());
  assert.equal(ITEMS[SPIDER_EYE].food!.effects![0][0], EFFECT_POISON);
  assert.equal(ITEMS[ROTTEN_FLESH].food!.effects![0][0], EFFECT_HUNGER);
  assert.equal(ITEMS[SHIELD].tool?.kind, 'shield');
  assert.equal(ITEMS[SHIELD].tool?.durability, 336);

  const G = GOLD_INGOT, P = SPRUCE_PLANKS;
  assert.equal(matchRecipe([G, G, G, G, APPLE, G, G, G, G], 3)?.out.id, GOLDEN_APPLE);
  assert.equal(matchRecipe([P, IRON_INGOT, P, P, P, P, 0, P, 0], 3)?.out.id, SHIELD);
});

test('efectos: /efecto, guardado y Fuerza en el servidor', () => {
  const t = new Checks();
  const h = makeServer(777);
  const c = h.join('Alquimista');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(20);

  // --- Comando ---
  c.conn.msgs = [];
  c.send({ t: 'chat', m: '/efecto fuerza 60 2' });
  let m = c.conn.take('effect')[0];
  t.ok(m && m.id === EFFECT_STRENGTH && m.s === 60 && m.a === 1, `/efecto fuerza 60 2 (${JSON.stringify(m)})`);
  c.send({ t: 'chat', m: '/efecto velocidad' });
  m = c.conn.take('effect')[0];
  t.ok(m && m.id === EFFECT_SPEED && m.s === 30 && m.a === 0, 'valores por defecto: 30 s, nivel I');
  c.send({ t: 'chat', m: '/efecto velocidad 999999 99' });
  m = c.conn.take('effect')[0];
  t.ok(m && m.s === MAX_EFFECT_SECONDS && m.a === MAX_EFFECT_AMP, 'duración y nivel acotados');
  c.send({ t: 'chat', m: '/efecto quitar' });
  m = c.conn.take('effect')[0];
  t.ok(m && m.id === 0, '/efecto quitar');
  c.send({ t: 'chat', m: '/efecto patata' });
  t.ok(c.conn.take('effect').length === 0, 'efecto desconocido: nada');

  // --- Guardado ---
  const fx = [[EFFECT_SPEED, 1, 30], [EFFECT_ABSORPTION, 0, 100], [99, 0, 10], [EFFECT_POISON, 9, 99999], 'x'];
  c.send({ t: 'state', d: { inv: [], hp: 20, food: 20, sat: 5, pos: [sx, sy, sz], fx, abs: 99 } });
  h.gs.disconnect(c.conn);
  const save = JSON.parse(h.store.players.get('alquimista')!).save;
  t.ok(JSON.stringify(save.fx) === JSON.stringify([[EFFECT_SPEED, 1, 30], [EFFECT_ABSORPTION, 0, 100], [EFFECT_POISON, MAX_EFFECT_AMP, MAX_EFFECT_SECONDS]]),
    `efectos saneados al guardar (${JSON.stringify(save.fx)})`);
  t.ok(save.abs === 20, `absorción acotada (${save.abs})`);
  const back = h.join('Alquimista');
  t.ok(JSON.stringify(back.welcome.save?.fx) === JSON.stringify(save.fx), 'al volver recupera sus efectos');

  // --- Fuerza: más daño por golpe; Debilidad, menos (nunca negativo) ---
  const by = 150, bx = Math.floor(sx), bz = Math.floor(sz);
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  back.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  const hit = (b?: number) => {
    const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 2.5, by, bz + 0.5)!;
    const hp = z.health;
    h.clock.now += 1000;
    back.send({ t: 'attack', e: z.id, item: 0, ...(b !== undefined ? { b } : {}) });
    const dealt = hp - z.health;
    h.gs.entities.list.delete(z.id);
    return dealt;
  };
  t.ok(hit() === 1, 'puño: 1');
  t.ok(hit(3) === 4, `Fuerza I: 1 + 3 (${hit(3)})`);
  t.ok(hit(500) === 16, 'bonus acotado a +15');
  t.ok(hit(-4) === 0.5, 'Debilidad: nunca menos de medio corazón');
  t.ok(hit(Number.NaN) === 1, 'bonus inválido: se ignora');
  t.done();
});
