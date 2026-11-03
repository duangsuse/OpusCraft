// Fase 4, segunda tanda: tallos de calabaza y sandía (crecen, dan fruto, se sueltan), tallar
// calabazas, el compostador, lanzar huevos (pollitos) y la pesca (flotador, picada, botín, desgaste),
// además de botines, recetas y el reparto del botín de pesca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, DIRT, WATER, FARMLAND, PUMPKIN, MELON, PUMPKIN_STEM, MELON_STEM, ATTACHED_PUMPKIN_STEM, CARVED_PUMPKIN,
  JACK_O_LANTERN, COMPOSTER, TORCH, SLABS, CROP_MAX_AGE, attachedFacing, familyBase,
} from '../src/shared/blocks';
import {
  PUMPKIN_SEEDS, MELON_SEEDS, MELON_SLICE, PUMPKIN_PIE, FISHING_ROD, SHEARS, BONE_MEAL, EGG, SUGAR, WHEAT_SEEDS, STICK,
  STRING, COD, SALMON, PUFFERFISH, TROPICAL_FISH, ITEMS,
} from '../src/shared/items';
import { NAUTILUS_SHELL } from '../src/shared/items'; // Fase 6.5 (equipo)
import { ENCHANTED_BOOK, NAME_TAG, SADDLE } from '../src/shared/items'; // Fase 7 (encantamientos)
import { MOB_CHICKEN, ENT_ITEM, ENT_BOBBER, ENT_XP } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { fishingLoot } from '../src/shared/fishing';
import { COMPOST_CHANCE, compostRises } from '../src/shared/composting';
import { DIR_X, DIR_Z } from '../src/shared/blockModels';
import { Checks, makeServer, placeOnTop, type Client, type Harness } from './harness';

/** Plataforma de piedra a y = 150 con un jugador encima, de día. */
function arena(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(9090);
  const c = h.join('Granjera');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.send({ t: 'chat', m: '/time set mediodia' });
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const farmingOf = (h: Harness) => h.gs.sys.farming as unknown as { randomTick(id: number, x: number, y: number, z: number): boolean };
const itemsNear = (h: Harness, x: number, y: number, z: number, r = 3) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && Math.hypot(e.x - x, e.y - y, e.z - z) < r);

test('calabazas y sandías: tallos, fruto y tallos que se sueltan', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  // Tierra alrededor (para el fruto) y tierra de cultivo húmeda en el centro, con agua cerca.
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) w.setBlock(bx + dx, by - 1, bz + dz, DIRT);
  w.setBlock(bx, by - 1, bz, FARMLAND + 1);
  w.setBlock(bx + 2, by - 1, bz + 2, WATER);
  c.pos(bx + 3.5, by, bz + 0.5);
  h.tick(2);
  placeOnTop(c, bx, by, bz, PUMPKIN_STEM);
  h.tick(1);
  t.ok(w.getBlock(bx, by, bz) === PUMPKIN_STEM, `las semillas plantan un tallo (${w.getBlock(bx, by, bz)})`);
  placeOnTop(c, bx + 1, by, bz, MELON_STEM);
  h.tick(1);
  t.ok(w.getBlock(bx + 1, by, bz) === AIR, 'sin tierra de cultivo no se planta');

  // Polvo de hueso hasta la última edad; después ya no hace nada.
  for (let i = 0; i < 10; i++) c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: BONE_MEAL });
  h.tick(1);
  t.ok(w.getBlock(bx, by, bz) === PUMPKIN_STEM + CROP_MAX_AGE[PUMPKIN_STEM], `el polvo de hueso madura el tallo (${w.getBlock(bx, by, bz) - PUMPKIN_STEM})`);

  // Ticks aleatorios: el tallo maduro da una calabaza al lado y se dobla hacia ella.
  const farming = farmingOf(h);
  let facing = -1;
  for (let i = 0; i < 2000 && facing < 0; i++) {
    farming.randomTick(w.getBlock(bx, by, bz), bx, by, bz);
    facing = attachedFacing(w.getBlock(bx, by, bz));
  }
  t.ok(facing >= 0 && familyBase(w.getBlock(bx, by, bz)) === ATTACHED_PUMPKIN_STEM, 'el tallo se une a su fruto');
  const fx = bx + DIR_X[Math.max(0, facing)], fz = bz + DIR_Z[Math.max(0, facing)];
  t.ok(w.getBlock(fx, by, fz) === PUMPKIN, `calabaza junto al tallo (${w.getBlock(fx, by, fz)})`);
  // Unido ya no crece ni da otro fruto.
  for (let i = 0; i < 300; i++) farming.randomTick(w.getBlock(bx, by, bz), bx, by, bz);
  let pumpkins = 0;
  for (let f = 0; f < 4; f++) if (w.getBlock(bx + DIR_X[f], by, bz + DIR_Z[f]) === PUMPKIN) pumpkins++;
  t.ok(pumpkins === 1, `un solo fruto por tallo (${pumpkins})`);

  // Tallar la calabaza con tijeras: cara hacia el jugador y 4 semillas.
  c.pos(fx + 0.5, by, fz + 3.5);
  h.tick(1);
  c.send({ t: 'use', x: fx, y: by, z: fz, yaw: 0, item: SHEARS });
  h.tick(2);
  const carved = w.getBlock(fx, by, fz);
  t.ok(familyBase(carved) === CARVED_PUMPKIN, `calabaza tallada (${carved})`);
  t.ok(carved - CARVED_PUMPKIN === 2, `la cara mira al jugador (al sur: ${carved - CARVED_PUMPKIN})`);
  const seeds = itemsNear(h, fx + 0.5, by + 0.5, fz + 0.5).filter((e) => e.stack?.id === PUMPKIN_SEEDS);
  t.ok(seeds.reduce((n, e) => n + e.stack!.count, 0) === 4, 'suelta 4 semillas de calabaza');
  // Al quitar el fruto, el tallo vuelve a estar maduro y suelto.
  t.ok(w.getBlock(bx, by, bz) === PUMPKIN_STEM + 7, `el tallo se suelta al tallar (${w.getBlock(bx, by, bz)})`);
  t.done();
});

test('calabazas y sandías: botines y recetas', () => {
  for (let i = 0; i < 50; i++) {
    const d = blockDrops(MELON, 0);
    assert.equal(d[0].id, MELON_SLICE);
    assert.ok(d[0].count >= 3 && d[0].count <= 7, `rodajas: ${d[0].count}`);
  }
  // Tallo joven: casi nunca semillas; maduro, hasta 3.
  const seeds = (id: number, r: () => number) => blockDrops(id, 0, r).reduce((n, s) => n + s.count, 0);
  assert.equal(seeds(PUMPKIN_STEM, () => 0.99), 0);
  assert.equal(seeds(PUMPKIN_STEM + 7, () => 0), 3);
  assert.equal(blockDrops(MELON_STEM + 7, 0, () => 0)[0].id, MELON_SEEDS);
  assert.equal(blockDrops(ATTACHED_PUMPKIN_STEM + 1, 0, () => 0)[0].count, 3);
  assert.deepEqual(blockDrops(CARVED_PUMPKIN + 3, 0), [{ id: CARVED_PUMPKIN, count: 1 }]);
  assert.deepEqual(blockDrops(COMPOSTER + 8, 0).map((s) => s.id), [COMPOSTER, BONE_MEAL]);

  const R = (grid: number[]) => matchRecipe(grid, 3)?.out;
  assert.deepEqual(R([PUMPKIN, 0, 0, 0, 0, 0, 0, 0, 0]), { id: PUMPKIN_SEEDS, count: 4 });
  assert.deepEqual(R([MELON_SLICE, 0, 0, 0, 0, 0, 0, 0, 0]), { id: MELON_SEEDS, count: 1 });
  assert.equal(R(Array(9).fill(MELON_SLICE))?.id, MELON);
  assert.equal(R([PUMPKIN, SUGAR, EGG, 0, 0, 0, 0, 0, 0])?.id, PUMPKIN_PIE);
  assert.equal(R([CARVED_PUMPKIN, 0, 0, TORCH, 0, 0, 0, 0, 0])?.id, JACK_O_LANTERN);
  const S = SLABS.spruce;
  assert.equal(R([S, 0, S, S, 0, S, S, S, S])?.id, COMPOSTER);
  assert.equal(R([0, 0, STICK, 0, STICK, STRING, STICK, 0, STRING])?.id, FISHING_ROD);
  assert.equal(R([STICK, 0, 0, STRING, STICK, 0, STRING, 0, STICK])?.id, FISHING_ROD, 'la caña también en espejo');
  assert.ok(ITEMS[PUMPKIN_PIE].food && ITEMS[MELON_SLICE].food, 'la tarta y la rodaja se comen');
});

test('compostador: niveles, espera y polvo de hueso', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  placeOnTop(c, bx + 2, by, bz, COMPOSTER);
  h.tick(1);
  const cx = bx + 2;
  t.ok(w.getBlock(cx, by, bz) === COMPOSTER, 'compostador colocado');
  const level = () => w.getBlock(cx, by, bz) - COMPOSTER;
  const use = (item: number) => c.send({ t: 'use', x: cx, y: by, z: bz, yaw: 0, item });

  use(STICK);
  h.tick(1);
  t.ok(level() === 0, 'un palo no se composta');
  use(WHEAT_SEEDS);
  h.tick(1);
  t.ok(level() === 1, 'vacío: el primer objeto siempre sube');
  let n = 0;
  while (level() < 7 && n < 400) {
    use(WHEAT_SEEDS);
    h.clock.now += 1000; // sin límite de ritmo
    h.tick(1);
    n++;
  }
  t.ok(level() === 7, `se llena (${n} semillas)`);
  t.ok(n > 6, 'no todas las semillas suben (30 %)');
  use(WHEAT_SEEDS);
  h.tick(1);
  t.ok(level() === 7, 'lleno no acepta más');
  h.tick(21);
  t.ok(level() === 8, 'al segundo queda listo');
  const before = itemsNear(h, cx + 0.5, by + 1, bz + 0.5).filter((e) => e.stack?.id === BONE_MEAL).length;
  use(0);
  h.tick(2);
  t.ok(level() === 0, 'se vacía al usarlo');
  const bm = itemsNear(h, cx + 0.5, by + 1, bz + 0.5).filter((e) => e.stack?.id === BONE_MEAL).length;
  t.ok(bm === before + 1, 'suelta polvo de hueso');
  // Probabilidades.
  assert.equal(COMPOST_CHANCE[PUMPKIN_PIE], 1);
  assert.equal(COMPOST_CHANCE[MELON_SLICE], 0.5);
  assert.ok(compostRises(0, STICK, 0.99));
  assert.ok(!compostRises(3, WHEAT_SEEDS, 0.5));
  t.done();
});

test('huevos: se rompen al caer y a veces nace un pollito', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const chicks = () => [...h.gs.entities.list.values()].filter((e) => e.type === MOB_CHICKEN && (e.growAge ?? 0) > 0).length;
  const start = chicks();
  for (let i = 0; i < 64; i++) {
    h.clock.now += 1000;
    c.send({ t: 'throw', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [0.4, -1, 0.1], item: EGG });
    h.tick(1);
  }
  c.send({ t: 'throw', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [0, 1, 0], item: STICK });
  h.tick(60);
  const flying = [...h.gs.entities.list.values()].filter((e) => e.stack?.id === EGG && e.type !== ENT_ITEM).length;
  t.ok(flying === 0, `todos los huevos se rompieron (${flying} en el aire)`);
  t.ok(chicks() > start, `nacen pollitos (${chicks() - start} de 64 huevos)`);
  t.ok(chicks() - start < 30, 'pero no de todos');
  t.done();
});

test('pesca: lanzar, picada, botín y desgaste', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const w = h.gs.world;
  // Estanque de 5x5 a 2 bloques de profundidad, delante del jugador (al norte).
  for (let dx = -2; dx <= 2; dx++) for (let dz = -8; dz <= -4; dz++) {
    w.setBlock(bx + dx, by - 1, bz + dz, WATER);
    w.setBlock(bx + dx, by - 2, bz + dz, WATER);
  }
  const hold = (item: number) => c.send({ t: 'pos', p: [bx + 0.5, by, bz + 0.5], r: [0, 0], s: 0, h: item });
  hold(FISHING_ROD);
  h.tick(1);
  const cast = () => c.send({ t: 'fish', p: [bx + 0.5, by + 1.6, bz + 0.5], d: [0, 0.35, -1] });
  const bobber = () => [...h.gs.entities.list.values()].find((e) => e.type === ENT_BOBBER);
  cast();
  const rod = c.conn.take('rod');
  t.ok(rod.length === 1 && rod[0].e > 0 && rod[0].p === c.welcome.id, 'aviso del flotador lanzado');
  let b = bobber();
  for (let i = 0; i < 80 && b && b.fishWait === undefined; i++) {
    h.tick(1);
    b = bobber();
  }
  t.ok(!!b && b.fishWait !== undefined, `el flotador cae al agua (${b ? [b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1)] : 'no'})`);
  h.tick(20);
  const b2 = bobber();
  t.ok(!!b2 && Math.abs(b2.y - (by - 1 + 8 / 9)) < 0.4, `flota en la superficie (${b2?.y.toFixed(2)})`);

  // Recoger sin picada: nada y sin desgaste.
  hold(FISHING_ROD);
  c.send({ t: 'fish', p: [bx + 0.5, by + 1.6, bz + 0.5], d: [0, 0, -1] });
  let msg = c.conn.take('rod').pop();
  t.ok(msg && msg.e === 0 && !msg.w, 'recoger sin picada no da nada');
  t.ok(!bobber(), 'el flotador desaparece');

  // Con picada: botín hacia el jugador, experiencia y desgaste 1.
  h.clock.now += 1000;
  cast();
  for (let i = 0; i < 80 && bobber()?.fishWait === undefined; i++) h.tick(1);
  bobber()!.fishWait = 0.01;
  h.tick(2);
  t.ok((bobber()?.fishBite ?? 0) > 0, 'pica un pez');
  t.ok(c.conn.take('fx').some((m) => m.k === 'fish_bite'), 'aviso de la picada');
  const itemsBefore = new Set([...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM).map((e) => e.id));
  h.clock.now += 1000;
  c.send({ t: 'fish', p: [bx + 0.5, by + 1.6, bz + 0.5], d: [0, 0, -1] });
  msg = c.conn.take('rod').pop();
  t.ok(msg && msg.e === 0 && msg.w === 1, `desgaste 1 al pescar (${JSON.stringify(msg)})`);
  const caught = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ITEM && !itemsBefore.has(e.id));
  t.ok(!!caught, 'sale un objeto del agua');
  t.ok([...h.gs.entities.list.values()].some((e) => e.type === ENT_XP), 'y experiencia');
  // El botín vuela hacia el jugador.
  for (let i = 0; i < 25 && caught && h.gs.entities.list.has(caught.id); i++) h.tick(1);
  const dist = caught ? Math.hypot(caught.x - (bx + 0.5), caught.z - (bz + 0.5)) : 99;
  t.ok(dist < 2.5, `el botín llega al jugador (a ${dist.toFixed(1)} bloques)`);

  // Cambiar de objeto recoge el flotador.
  h.clock.now += 1000;
  cast();
  h.tick(30);
  hold(STICK);
  h.tick(3);
  t.ok(!bobber(), 'al cambiar de objeto se recoge');
  t.ok(c.conn.take('rod').some((m) => m.e === 0), 'y se avisa a todos');
  t.done();
});

test('pesca: reparto del botín', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const counts = { fish: 0, junk: 0, treasure: 0 };
  const fish = new Set([COD, SALMON, PUFFERFISH, TROPICAL_FISH]);
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const s = fishingLoot(rand);
    assert.ok(s.count === 1 && ITEMS[s.id], 'un objeto válido');
    if (fish.has(s.id)) counts.fish++;
    else if (s.id === FISHING_ROD || ITEMS[s.id].tool?.kind === 'bow' || s.id === NAUTILUS_SHELL) counts.treasure++; // Fase 6.5 (equipo): concha
    else if (s.id === ENCHANTED_BOOK || s.id === NAME_TAG || s.id === SADDLE) counts.treasure++; // Fase 7 (encantamientos)
    else counts.junk++;
    if (s.dmg !== undefined) assert.ok(s.dmg > 0 && s.dmg < (ITEMS[s.id].tool?.durability ?? ITEMS[s.id].armor!.durability));
  }
  assert.ok(Math.abs(counts.fish / N - 0.85) < 0.02, `peces ${counts.fish / N}`);
  // Las cañas también salen como basura (2/52 de la basura).
  assert.ok(counts.junk / N > 0.08 && counts.junk / N < 0.11, `basura ${counts.junk / N}`);
  assert.ok(counts.treasure / N > 0.04 && counts.treasure / N < 0.07, `tesoros ${counts.treasure / N}`);
});
