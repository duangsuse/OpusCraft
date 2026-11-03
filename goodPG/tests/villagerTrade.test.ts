// Comercio de los aldeanos como en Java 26.3: precios con la demanda y la reputación, reposición (WorkAtPoi y
// Villager.restock), cotilleos (GossipContainer), tipo de aldeano por bioma, el frasco de agua del comerciante y ofertas
// fijas que se guardan con el aldeano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, COMPOSTER } from '../src/shared/blocks';
import { EMERALD, POTION, type ItemStack } from '../src/shared/items';
import { MOB_VILLAGER, MOB_WANDERING_TRADER } from '../src/shared/mobs';
import { offerPrice, specialPrice, nextDemand, offersFor, PROF_FARMER, PROF_CLERIC, professionForBlock, type TradeOffer } from '../src/shared/villagers';
import { BREWING_STAND } from '../src/shared/blocks';
import { addGossip, reputation, decayGossip, transferGossip, GOSSIP_TYPES, type Gossips } from '../src/shared/villagerGossip';
import { villagerTypeFor, VT_DESERT, VT_SNOW, VT_PLAINS, VT_TAIGA } from '../src/shared/villagerTypes';
import { BIOME_DESERT, BIOME_SNOWY_PLAINS, BIOME_FOREST, BIOME_MOUNTAINS } from '../src/shared/world/biomeIds';
import { stewEffect } from '../src/shared/decorFood';
import { EFFECT_POISON } from '../src/shared/effects';
import { potionStack, PT_WATER, PT_NIGHT_VISION } from '../src/shared/potions';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer } from './harness';

const offer = (cost: number, disc: number): TradeOffer => ({ cost: [EMERALD, cost], result: [EMERALD, 1], max: 12, xp: 1, disc });

test('precio: demanda (sube si se agota antes de reponer), reputación y Héroe de la aldea', () => {
  const o = offer(10, 0.05);
  // MerchantOffer.updateDemand: demanda + usos − (máximo − usos); agotarla (12 de 12) la sube 12.
  assert.equal(nextDemand(0, 12, 12), 12);
  assert.equal(nextDemand(12, 0, 12), 0);
  // getModifiedCostCount: base + ⌊base · demanda · disc⌋ (nunca menos por demanda), entre 1 y 64.
  assert.equal(offerPrice(o, 12, 0), 10 + Math.floor(10 * 12 * 0.05));
  assert.equal(offerPrice(o, -40, 0), 10);
  assert.equal(offerPrice(offer(60, 0.2), 30, 0), 64);
  // updateSpecialPrices: −⌊reputación · disc⌋; el héroe de nivel 0, −máx(⌊0,3 · base⌋, 1); con mala fama sube.
  const b = offer(10, 0.2);
  assert.equal(specialPrice(b, 25, null), -5);
  assert.equal(specialPrice(b, -100, null), 20);
  assert.equal(specialPrice(b, 0, 0), -3);
  assert.equal(specialPrice(offer(2, 0.2), 0, 0), -1, 'al menos una menos');
  assert.equal(specialPrice(b, 0, 4), -Math.floor(Math.fround(0.3 + 0.25) * 10));
  assert.equal(offerPrice(b, 0, specialPrice(b, 200, 4)), 1, 'nunca menos de 1');
});

test('cotilleos: pesos y topes de GossipType, olvido diario y paso entre aldeanos', () => {
  const g: Gossips = {};
  addGossip(g, 'ana', 'trading', 2);
  addGossip(g, 'ana', 'minor_negative', 25);
  assert.equal(reputation(g, 'ana'), 2 - 25);
  for (let i = 0; i < 20; i++) addGossip(g, 'ana', 'trading', 2);
  assert.equal(g.ana.trading, GOSSIP_TYPES.trading.max, 'hasta 25');
  addGossip(g, 'luis', 'major_negative', 25);
  assert.equal(reputation(g, 'luis'), -125);
  decayGossip(g);
  assert.equal(g.ana.trading, 23);
  assert.equal(g.ana.minor_negative, 5);
  assert.equal(g.luis.major_negative, 15);
  decayGossip(g);
  assert.equal(g.ana.minor_negative, undefined, 'lo que baja de 2 se olvida');
  const other: Gossips = {};
  transferGossip(other, g, () => 0.1, 10);
  for (const [who, e] of Object.entries(other)) for (const [k, v] of Object.entries(e)) {
    const kind = k as keyof typeof GOSSIP_TYPES;
    assert.equal(v, g[who][kind]! - GOSSIP_TYPES[kind].decayPerTransfer, `${who} ${k}: llega con decayPerTransfer menos`);
  }
});

test('tipos de aldeano por bioma, el clérigo y el estofado del granjero', () => {
  assert.equal(villagerTypeFor(BIOME_DESERT), VT_DESERT);
  assert.equal(villagerTypeFor(BIOME_SNOWY_PLAINS), VT_SNOW);
  assert.equal(villagerTypeFor(BIOME_MOUNTAINS), VT_TAIGA);
  assert.equal(villagerTypeFor(BIOME_FOREST), VT_PLAINS, 'los que no están, de llanura');
  assert.equal(professionForBlock(BREWING_STAND), PROF_CLERIC);
  assert.ok(offersFor(PROF_CLERIC, 5, 9).length >= 9);
  // Estofado sospechoso de 26.3 con veneno 14 s (no sale de ninguna flor).
  let poison = false;
  for (let seed = 0; seed < 300 && !poison; seed++) {
    for (const o of offersFor(PROF_FARMER, 4, seed)) if (o.rdmg && stewEffect(o.rdmg)?.[0] === EFFECT_POISON && stewEffect(o.rdmg)?.[1] === 14) poison = true;
  }
  assert.ok(poison, 'el estofado de veneno 14 s');
});

function arena(store = new MemoryStore()) {
  const h = makeServer(7331, store);
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

test('servidor: ofertas fijas y guardadas, reputación por comerciar, demanda al reponer y tipo del bioma', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = arena(store);
  const e = h.gs.entities.villagers.spawn(bx + 0.5, by, bz + 0.5, null, [bx, by, bz])!;
  h.gs.world.setBlock(bx + 3, by, bz, COMPOSTER);
  h.tick(20 * 8);
  const v = h.gs.entities.villagers.data(e);
  assert.equal(v.prof, PROF_FARMER);
  assert.equal(v.type, villagerTypeFor(h.gs.world.gen.biomeAt(bx, bz)), 'el tipo, el de su bioma');
  c.pos(e.x + 1, e.y, e.z);
  c.send({ t: 'topen', e: e.id });
  const [tr] = c.conn.take('trades');
  assert.equal(tr.o.length, 2);
  const keys = v.offers.map((o) => o.k);
  // Otra vez: las mismas (no se sortean de nuevo).
  c.send({ t: 'topen', e: e.id });
  assert.deepEqual(v.offers.map((o) => o.k), keys);
  // Comerciar da reputación (+2 de «trading») y gasta usos.
  const i = tr.o.findIndex((o: number[]) => o[0] !== EMERALD);
  const o = tr.o[i];
  c.send({ t: 'trade', e: e.id, i, q: 1, pay: [{ id: o[0], count: o[1] }] });
  assert.ok(c.conn.take('tres')[0].ok);
  assert.equal(h.gs.entities.villagers.reputationOf(e, 'Comerciante'), 2);
  // Reponer: la demanda de la oferta usada baja (1 uso de 16 o 12: 1 − (máx − 1)).
  const life = h.gs.entities.villagers;
  const k = v.offers[i].k;
  const max = o[7];
  const now = h.gs.entities.host.worldTime();
  assert.equal(life.shouldRestock(v, now), true);
  life.restock(v, now);
  assert.equal(v.demand[k], 1 - (max - 1));
  assert.equal(v.uses[k], undefined, 'repuesta');
  assert.equal(v.restocksToday, 1);
  // Guardar y volver a cargar: las mismas ofertas, la demanda, los cotilleos y el tipo.
  h.gs.flush?.();
  const saved = life.save(e)!;
  const e2 = h.gs.entities.villagers.spawn(bx + 0.5, by, bz + 0.5, null, null)!;
  life.restore(e2, saved);
  const v2 = life.data(e2);
  assert.deepEqual(v2.offers, v.offers);
  assert.deepEqual(v2.demand, v.demand);
  assert.equal(reputation(v2.gossip, 'comerciante'), 2);
  assert.equal(v2.type, v.type);
  // Hacerle daño: mala fama (+25 de minor_negative).
  h.gs.entities.damage(e, 1, e.x - 1, e.z, c.welcome.id);
  assert.equal(h.gs.entities.villagers.reputationOf(e, 'Comerciante'), 2 - 25);
});

test('comerciante ambulante: 9 ofertas y el frasco de agua (sólo agua) por una esmeralda', () => {
  const { h, c } = arena();
  const t = h.gs.sys.trading.spawnTrader()!;
  c.pos(t.x + 1, t.y, t.z);
  const v = h.gs.entities.villagers.data(t);
  // Busca un comerciante que compre frascos de agua.
  let idx = -1;
  for (let tries = 0; tries < 40 && idx < 0; tries++) {
    v.offers = [];
    v.offerLevels = 0;
    c.send({ t: 'topen', e: t.id });
    const tr = c.conn.take('trades').at(-1);
    assert.equal(tr.o.length, 9);
    idx = tr.o.findIndex((o: unknown[]) => o[0] === POTION && (o[9] as { w?: number }).w === 1);
  }
  assert.ok(idx >= 0, 'compra frascos de agua');
  const pay = (s: ItemStack, q: number) => {
    c.send({ t: 'trade', e: t.id, i: idx, q, pay: [s] });
    return c.conn.take('tres').find((m) => m.q === q);
  };
  const bad = pay(potionStack('drink', PT_NIGHT_VISION), 1);
  assert.equal(bad?.ok, false, 'una poción de visión nocturna no vale');
  const good = pay(potionStack('drink', PT_WATER), 2);
  assert.equal(good?.ok, true);
  assert.deepEqual(good.give, { id: EMERALD, count: 1 });
  assert.equal(t.type, MOB_WANDERING_TRADER);
  assert.notEqual(MOB_VILLAGER, t.type);
});
