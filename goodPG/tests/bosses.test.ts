// Jefes reforzados (bossRules.ts, «/jefes»): el dragón gana 100 de vida por cada jugador de más en la pelea (sin
// perderla si alguien se va) y se enfurece por debajo de un cuarto; en «java» o en «auto» sin difícil, como en Java.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOB_ENDER_DRAGON } from '../src/shared/mobs';
import { DIM_END } from '../src/shared/dimensions';
import { hardBosses, dragonMaxHealth } from '../src/shared/bossRules';
import { makeServer } from './harness';

test('modos: auto refuerza sólo en difícil; la vida con el grupo', () => {
  assert.equal(hardBosses('auto', 2), false);
  assert.equal(hardBosses('auto', 3), true);
  assert.equal(hardBosses('java', 3), false);
  assert.equal(hardBosses('duros', 1), true);
  assert.equal(dragonMaxHealth(1), 200);
  assert.equal(dragonMaxHealth(4), 500);
});

test('dragón reforzado: +100 por jugador, no baja al irse, furia al 25 % y la barra con su máximo', () => {
  const h = makeServer(8606, undefined, DIM_END);
  const a = h.join('ana', 's');
  a.pos(0.5, 90, 0.5);
  h.tick(5);
  const ents = h.gs.entities;
  const d = [...ents.list.values()].find((e) => e.type === MOB_ENDER_DRAGON)!;
  assert.equal(d.health, 200);
  a.send({ t: 'chat', m: '/jefes duros' });
  // Tres jugadores más en la isla (cuatro con ana): 500 de vida y de máximo.
  const players = ['bea', 'carlos', 'dani'].map((n) => {
    const c = h.join(n, 's');
    c.pos(10.5, 70, 10.5);
    return c;
  });
  h.tick(40);
  assert.equal(ents.dragon.maxHealth(d), 500);
  assert.equal(d.health, 500);
  // Uno se va: no baja.
  h.gs.disconnect(players[2].conn);
  h.tick(40);
  assert.equal(ents.dragon.maxHealth(d), 500, 'no se rebaja saliendo');
  // La barra, con su máximo.
  a.conn.take('boss');
  d.health = 250;
  h.tick(41);
  const bar = a.conn.take('boss').at(-1);
  assert.ok(bar && Math.abs(bar.h - 0.5) < 0.01, `la barra a la mitad (${bar?.h})`);
  // Por debajo de un cuarto: furia (y la barra lo dice).
  assert.equal(ents.dragon.furious(d), false);
  d.health = 124;
  h.tick(2);
  assert.equal(ents.dragon.furious(d), true);
  h.tick(41);
  assert.match(a.conn.take('boss').at(-1)?.n ?? '', /furioso/);
});

test('sin reforzar (auto en normal): como en Java', () => {
  const h = makeServer(8607, undefined, DIM_END);
  const a = h.join('ana', 's');
  a.pos(0.5, 90, 0.5);
  const b = h.join('bea', 's');
  b.pos(5.5, 90, 5.5);
  h.tick(60);
  const d = [...h.gs.entities.list.values()].find((e) => e.type === MOB_ENDER_DRAGON)!;
  assert.equal(h.gs.entities.dragon.maxHealth(d), 200);
  d.health = 40;
  h.tick(2);
  assert.equal(h.gs.entities.dragon.furious(d), false);
});
