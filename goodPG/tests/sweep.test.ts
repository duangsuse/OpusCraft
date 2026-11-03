// Barrido de la espada y golpe corriendo, como Player.attack de Java 26.3: con la barra llena, en el suelo y sin
// correr, la espada hiere también a las criaturas pegadas al objetivo (1 de daño sin Barrido); corriendo, en vez
// de barrer, empuja más.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from './harness';
import { STONE, AIR } from '../src/shared/blocks';
import { TOOLS } from '../src/shared/items';
const IRON_SWORD = TOOLS.iron.sword;
import { MOB_ZOMBIE } from '../src/shared/mobs';
import { SWEEPING_EDGE } from '../src/shared/enchantments';

function setup() {
  const h = makeServer(4242);
  const c = h.join('Ana');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 150, bz = Math.floor(sz);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(40);
  c.send({ t: 'chat', m: '/dificultad pacifico' });
  c.send({ t: 'chat', m: '/dificultad normal' });
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = 0; y < 4; y++) W.setBlock(bx + dx, by + y, bz + dz, AIR);
  }
  for (const e of [...h.gs.entities.list.values()]) if (e.ai) h.gs.entities.list.delete(e.id);
  const target = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 0.5, by, bz - 1.5)!;
  const side = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 1.6, by, bz - 1.5)!;
  const far = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 0.5, by, bz - 4.8)!;
  // Barra de ataque llena sin dejar que se muevan (la carga sale del último golpe).
  const sess = [...(h.gs as unknown as { sessions: Map<unknown, { lastAttack: number }> }).sessions.values()][0];
  const full = () => { sess.lastAttack = 0; };
  full();
  return { h, c, target, side, far, full };
}

test('la espada barre: la criatura de al lado recibe 1 y la lejana nada', () => {
  const { c, target, side, far, full } = setup();
  const [t0, s0, f0] = [target.health, side.health, far.health];
  c.send({ t: 'attack', e: target.id, item: IRON_SWORD, sw: 1 });
  assert.equal(t0 - target.health, 6, 'la espada de hierro hace 6');
  assert.equal(s0 - side.health, 1, 'el barrido hace 1 sin el encantamiento');
  assert.equal(far.health, f0, 'a más de 3 bloques no llega');
  // Con Barrido III: 1 + 6 × 3/4 = 5,5.
  full();
  target.invuln = 0; // sin los ticks de invulnerabilidad del golpe anterior
  side.invuln = 0;
  const s1 = side.health;
  c.send({ t: 'attack', e: target.id, item: IRON_SWORD, sw: 1, en: [[SWEEPING_EDGE, 3]] });
  assert.ok(Math.abs(s1 - side.health - 5.5) < 1e-6 || side.dead, `Barrido III: ${s1 - side.health}`);
});

test('corriendo no barre y empuja más', () => {
  const a = setup();
  a.c.send({ t: 'attack', e: a.target.id, item: IRON_SWORD });
  const s0 = a.side.health;
  const b = setup();
  b.c.send({ t: 'attack', e: b.target.id, item: IRON_SWORD, sw: 1, sp: 1 });
  assert.equal(b.side.health, s0, 'corriendo no hay barrido');
  assert.ok(Math.hypot(b.target.vx, b.target.vz) > Math.hypot(a.target.vx, a.target.vz) * 1.5, 'empuja más');
});

