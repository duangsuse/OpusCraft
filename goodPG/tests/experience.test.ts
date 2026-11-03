// Experiencia: fórmulas de nivel, reparto en orbes y recompensas en el servidor (criaturas matadas
// por un jugador, menas, horno, cría) y el 'dropxp' al morir con sus límites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, LAVA, DIAMOND_ORE, FURNACE, IRON_ORE } from '../src/shared/blocks';
import { COAL, DIAMOND, IRON_INGOT, TOOLS } from '../src/shared/items';
import { MOB_ZOMBIE, MOB_COW, ENT_XP } from '../src/shared/mobs';
import { STATE_DEAD } from '../src/shared/protocol';
import {
  levelFromTotal, totalForLevel, xpToNext, splitOrbs, orbValue, smeltXp, oreXp, mobXp, deathXp,
} from '../src/shared/experience';
import { Checks, makeServer, placeOnTop, type Client, type Harness } from './harness';

/** Plataforma de piedra a y = 150 (lejos del terreno), de noche, con un jugador encima. */
function arena(mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(4242);
  const c = h.join('Minera', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(60);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.send({ t: 'chat', m: '/time set medianoche' });
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const orbs = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_XP);
const orbTotal = (h: Harness) => orbs(h).reduce((n, e) => n + (e.xp ?? 0), 0);
const xpReceived = (c: Client) => c.conn.take('xp').reduce((n: number, m: { n: number }) => n + m.n, 0);

test('experiencia: fórmulas de nivel y orbes', () => {
  // Totales conocidos de Minecraft.
  const known: [number, number][] = [[0, 0], [1, 7], [2, 16], [5, 55], [15, 315], [16, 352], [17, 394], [30, 1395], [31, 1507], [32, 1628]];
  for (const [level, total] of known) {
    assert.equal(totalForLevel(level), total, `total para el nivel ${level}`);
    assert.deepEqual(levelFromTotal(total), { level, progress: 0 }, `nivel con ${total} puntos`);
    if (total > 0) assert.equal(levelFromTotal(total - 1).level, level - 1, `justo antes del nivel ${level}`);
  }
  // El total es la suma de lo que pide cada nivel.
  let sum = 0;
  for (let L = 0; L < 80; L++) {
    assert.equal(totalForLevel(L), sum, `suma hasta el nivel ${L}`);
    assert.equal(levelFromTotal(sum + xpToNext(L) - 1).level, L, `el nivel ${L} dura ${xpToNext(L)} puntos`);
    sum += xpToNext(L);
  }
  assert.equal(xpToNext(0), 7);
  assert.equal(xpToNext(16), 42);
  assert.equal(xpToNext(31), 121);
  assert.ok(Math.abs(levelFromTotal(10).progress - 3 / 9) < 1e-9, 'progreso dentro del nivel');

  // Reparto en orbes: siempre el más grande que cabe.
  assert.deepEqual(splitOrbs(100), [73, 17, 7, 3]);
  assert.deepEqual(splitOrbs(5), [3, 1, 1]);
  assert.deepEqual(splitOrbs(0), []);
  assert.deepEqual(splitOrbs(2477 + 1237 + 2), [2477, 1237, 1, 1]);
  assert.equal(orbValue(36), 17);
  for (const n of [1, 2, 9, 57, 1000, 5000]) assert.equal(splitOrbs(n).reduce((a, b) => a + b, 0), n, `el reparto de ${n} suma ${n}`);

  // Recompensas.
  assert.equal(smeltXp(IRON_INGOT, 3, () => 0), 3, '3 lingotes de hierro = 2,1 → 3 si sale la fracción');
  assert.equal(smeltXp(IRON_INGOT, 3, () => 0.99), 2, '… o 2 si no');
  assert.equal(smeltXp(IRON_INGOT, 10, () => 0.5), 7, 'sin fracción no hay azar');
  assert.equal(smeltXp(COAL, 5), 0, 'lo que no se funde no da nada');
  assert.equal(oreXp(DIAMOND_ORE, [], () => 0), 0, 'mena que no suelta su mineral: nada');
  assert.equal(oreXp(DIAMOND_ORE, [DIAMOND], () => 0), 3);
  assert.equal(oreXp(DIAMOND_ORE, [DIAMOND], () => 0.999), 7);
  assert.equal(mobXp(MOB_ZOMBIE, false), 5);
  assert.equal(mobXp(MOB_COW, true), 0, 'las crías no dan experiencia');
  const cow = mobXp(MOB_COW, false);
  assert.ok(cow >= 1 && cow <= 3, 'animales 1–3');
  assert.equal(deathXp(3), 21);
  assert.equal(deathXp(40), 100, 'como mucho 100 al morir');
});

test('experiencia: criaturas, menas, horno y cría', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const W = h.gs.world;

  // --- Zombi matado por el jugador: suelta 5 y los orbes vuelan hacia él ---
  const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 2.5, by, bz + 0.5)!;
  for (let i = 0; i < 60 && !z.dead; i++) {
    c.pos(z.x + 1, z.y, z.z);
    h.clock.now += 700;
    c.send({ t: 'attack', e: z.id, item: TOOLS.diamond.sword });
    h.tick(4);
  }
  t.ok(z.dead, 'el zombi muere a espadazos');
  h.tick(60);
  t.ok(xpReceived(c) === 5, 'el jugador recoge los 5 puntos del zombi');
  t.ok(orbs(h).length === 0, 'no quedan orbes en el suelo');
  const adds = c.conn.take('ents').flatMap((m) => m.a ?? []).filter((a: number[]) => a[1] === ENT_XP);
  t.ok(adds.length > 0 && adds.every((a: number[]) => a[9] >= 1), 'el alta de un orbe lleva su valor');

  // --- Zombi que muere en la lava sin que lo toque un jugador: nada ---
  c.pos(bx - 10.5, by, bz - 10.5);
  const lx = bx + 8, lz = bz + 8;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy < 3; dy++) {
    if (dx || dz) W.setBlock(lx + dx, by + dy, lz + dz, STONE);
  }
  W.setBlock(lx, by, lz, LAVA);
  const z2 = h.gs.entities.spawnMob(MOB_ZOMBIE, lx + 0.5, by, lz + 0.5)!;
  for (let i = 0; i < 40 && !z2.dead; i++) h.tick(10);
  t.ok(z2.dead, 'el zombi muere en la lava');
  h.tick(40);
  t.ok(orbs(h).length === 0 && xpReceived(c) === 0, 'sin jugador no hay experiencia');
  const z3 = h.gs.entities.spawnMob(MOB_ZOMBIE, bx - 4.5, by, bz + 4.5)!;
  h.gs.entities.damage(z3, 100, z3.x, z3.z, null);
  t.ok(z3.dead && orbs(h).length === 0, 'ni con un golpe sin atacante');

  // --- Mena de diamante con pico de hierro: 3–7 en orbes ---
  c.pos(bx + 0.5, by, bz + 0.5);
  W.setBlock(bx + 2, by, bz, DIAMOND_ORE);
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: 0, tool: TOOLS.iron.pickaxe });
  const ore = orbTotal(h);
  t.ok(ore >= 3 && ore <= 7, `la mena de diamante suelta 3–7 (${ore})`);
  h.tick(40);
  t.ok(xpReceived(c) === ore, 'y se recogen');
  W.setBlock(bx + 2, by, bz, DIAMOND_ORE);
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: 0 });
  t.ok(orbs(h).length === 0, 'a mano no suelta el diamante ni experiencia');

  // --- Horno: sacar 3 lingotes da 2 o 3 ---
  placeOnTop(c, bx - 2, by, bz, FURNACE, Math.PI / 2);
  c.send({ t: 'open', x: bx - 2, y: by, z: bz });
  c.send({ t: 'cclick', x: bx - 2, y: by, z: bz, slot: 0, btn: 0, cur: { id: IRON_ORE, count: 3 }, q: 1 });
  c.send({ t: 'cclick', x: bx - 2, y: by, z: bz, slot: 1, btn: 0, cur: { id: COAL, count: 1 }, q: 2 });
  h.tick(20 * 32);
  t.ok(orbs(h).length === 0, 'fundir no da nada hasta que se saca');
  c.conn.msgs = [];
  c.send({ t: 'cclick', x: bx - 2, y: by, z: bz, slot: 2, btn: 0, cur: null, q: 3 });
  const taken = c.conn.take('cres')[0]?.cur;
  t.ok(taken?.id === IRON_INGOT && taken.count === 3, 'se sacan los 3 lingotes');
  h.tick(40);
  const smelt = xpReceived(c);
  t.ok(smelt >= 2 && smelt <= 3, `sacar 3 lingotes de hierro da 2–3 (${smelt})`);

  // --- Cría: 1–7 ---
  const a = h.gs.entities.spawnMob(MOB_COW, bx + 4.5, by, bz - 4.5)!;
  const b = h.gs.entities.spawnMob(MOB_COW, bx + 5.5, by, bz - 4.5)!;
  h.gs.entities.animals.breed(a, b);
  const bred = orbTotal(h);
  t.ok(bred >= 1 && bred <= 7, `criar suelta 1–7 (${bred})`);
  t.done();
});

test('experiencia: creativo no suelta orbes al minar', () => {
  const { h, c, bx, by, bz } = arena('c');
  h.gs.world.setBlock(bx + 2, by, bz, DIAMOND_ORE);
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: 0, tool: TOOLS.iron.pickaxe });
  assert.equal(orbs(h).length, 0);
});

test('experiencia: dropxp al morir valida sus límites', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const p = [bx + 0.5, by + 0.5, bz + 0.5];
  c.send({ t: 'dropxp', n: 21, p });
  t.ok(orbs(h).length === 0, 'un jugador vivo no puede soltar experiencia');
  c.pos(bx + 0.5, by, bz + 0.5, STATE_DEAD);
  for (const bad of [0, 101, 2.5, -5, 'x', null]) c.send({ t: 'dropxp', n: bad, p });
  c.send({ t: 'dropxp', n: 21, p: [bx + 20, by, bz] });
  c.send({ t: 'dropxp', n: 21, p: [Infinity, 0, 0] });
  c.send({ t: 'dropxp', n: 21 });
  t.ok(orbs(h).length === 0, 'cantidades o posiciones no válidas se ignoran');
  c.send({ t: 'dropxp', n: 21, p });
  t.ok(orbTotal(h) === 21, `muerto y junto a su posición: suelta 21 (${orbTotal(h)})`);
  h.tick(40);
  t.ok(orbTotal(h) === 21 && xpReceived(c) === 0, 'un jugador muerto no recoge orbes');
  c.send({ t: 'dropxp', n: 21, p });
  t.ok(orbTotal(h) === 21, 'límite de ritmo: no se repite enseguida');
  h.clock.now += 3000;
  c.send({ t: 'dropxp', n: 7, p });
  t.ok(orbTotal(h) === 28, 'pasado el enfriamiento vuelve a aceptarse');
  // Al reaparecer, los recoge.
  c.pos(bx + 0.5, by, bz + 0.5, 0);
  h.tick(80);
  t.ok(xpReceived(c) === 28 && orbs(h).length === 0, 'vivo otra vez, recoge sus orbes');
  t.done();
});
