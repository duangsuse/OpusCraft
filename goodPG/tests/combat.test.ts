// Fase 4.5: daño y velocidad de ataque de Minecraft por arma, recarga en el servidor, mano secundaria
// (flechas primero de ahí, guardado saneado) y la descripción de los objetos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE } from '../src/shared/blocks';
import { TOOLS, SHIELD, ARROW, BREAD, STICK } from '../src/shared/items';
import { MOB_ZOMBIE } from '../src/shared/mobs';
import { attackDamage, attackSpeed, attackCooldown, chargeFactor } from '../src/shared/combat';
import { Inventory, OFFHAND } from '../src/client/game/Inventory';
import { Checks, makeServer } from './harness';

test('combate: tablas de Minecraft', () => {
  assert.equal(attackDamage(TOOLS.diamond.sword), 7);
  assert.equal(attackSpeed(TOOLS.diamond.sword), 1.6);
  assert.equal(attackDamage(TOOLS.stone.axe), 9);
  assert.equal(attackSpeed(TOOLS.stone.axe), 0.8);
  assert.equal(attackDamage(TOOLS.iron.shovel), 4.5);
  assert.equal(attackSpeed(TOOLS.diamond.hoe), 4);
  assert.equal(attackDamage(STICK), 1, 'lo que no es arma pega como la mano');
  assert.equal(attackCooldown(0), 0.25);
  assert.equal(attackCooldown(TOOLS.wooden.axe), 1.25);
  assert.equal(chargeFactor(1), 1);
  assert.ok(Math.abs(chargeFactor(0) - 0.2) < 1e-9);
});

test('combate: el hacha pega fuerte pero hay que esperar su recarga', () => {
  const t = new Checks();
  const h = makeServer(31);
  const c = h.join('Leñadora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(20);
  const bx = Math.floor(sx), by = 150, bz = Math.floor(sz);
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  const hit = (item: number, waitMs: number) => {
    const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 2.5, by, bz + 0.5)!;
    const hp = z.health;
    h.clock.now += waitMs;
    c.send({ t: 'attack', e: z.id, item });
    const dealt = hp - z.health;
    h.gs.entities.list.delete(z.id);
    return dealt;
  };
  const axe = TOOLS.stone.axe;
  hit(axe, 2000);
  t.ok(hit(axe, 2000) === 9, 'con la barra llena, el hacha de piedra hace 9');
  const quick = hit(axe, 300);
  t.ok(quick < 3, `golpe a destiempo: mucho menos (${quick.toFixed(2)})`);
  const sword = TOOLS.stone.sword;
  hit(sword, 2000);
  const swordQuick = hit(sword, 625);
  t.ok(swordQuick === 5, `la espada se recarga antes (${swordQuick})`);
  t.done();
});

test('mano secundaria: inventario, flechas y guardado', () => {
  const inv = new Inventory();
  inv.slots[0] = { id: SHIELD, count: 1 };
  inv.swapOffhand(0);
  assert.equal(inv.offhand?.id, SHIELD);
  assert.equal(inv.slots[0], null);
  assert.equal(inv.get(OFFHAND)?.id, SHIELD);
  // Las flechas de la mano secundaria se gastan primero.
  inv.offhand = { id: ARROW, count: 2 };
  inv.slots[5] = { id: ARROW, count: 10 };
  assert.equal(inv.count(ARROW), 12);
  assert.equal(inv.remove(ARROW, 3), 3);
  assert.equal(inv.offhand, null);
  assert.equal(inv.slots[5]?.count, 9);
  // Gastar y desgastar en la mano secundaria.
  inv.set(OFFHAND, { id: BREAD, count: 2 });
  inv.consume(OFFHAND, 2);
  assert.equal(inv.offhand, null);
  inv.set(OFFHAND, { id: SHIELD, count: 1 });
  assert.equal(inv.wear(OFFHAND, 400), true, 'el escudo se rompe');
  assert.equal(inv.offhand, null);
  // Al morir se suelta también.
  inv.offhand = { id: BREAD, count: 1 };
  assert.ok(inv.takeAll().some((s) => s.id === BREAD));
  // Ida y vuelta por la red.
  const a = new Inventory();
  a.offhand = { id: SHIELD, count: 1, dmg: 7 };
  const b = new Inventory();
  b.offhandFromWire(a.offhandToWire());
  assert.deepEqual(b.offhand, { id: SHIELD, count: 1, dmg: 7 });
});

test('mano secundaria: el servidor la guarda saneada', () => {
  const h = makeServer(32);
  const c = h.join('Zurda');
  c.send({ t: 'state', d: { inv: [], hp: 20, food: 20, sat: 5, pos: [0, 80, 0], off: [SHIELD, 1, 12] } });
  h.gs.disconnect(c.conn);
  assert.deepEqual(JSON.parse(h.store.players.get('zurda')!).save.off, [SHIELD, 1, 12]);
  const d = h.join('Zurda');
  d.send({ t: 'state', d: { inv: [], hp: 20, food: 20, sat: 5, pos: [0, 80, 0], off: [99999, 5] } });
  h.gs.disconnect(d.conn);
  assert.equal(JSON.parse(h.store.players.get('zurda')!).save.off, null, 'un objeto que no existe no se guarda');
});
