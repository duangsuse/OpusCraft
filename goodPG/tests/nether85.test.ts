// Fase 8.5 (lo que da el Nether): la netherita (escombros ancestrales en el Nether, fundición, lingote, mejora en la
// mesa de herrería, objetos que no arden), el cuarzo, la fogata de almas, la magnetita, el nexo de reaparición, las
// columnas de burbujas, el faro y el botín nuevo de los bastiones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, WATER, SOUL_SAND, MAGMA_BLOCK, IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, NETHERITE_BLOCK, BEACON, GLASS, BEDROCK, STONE,
  STAINED_GLASS, ANCIENT_DEBRIS, RESPAWN_ANCHOR, GLOWSTONE, BUBBLE_COLUMN, SOUL_CAMPFIRE, LODESTONE, QUARTZ_BLOCK, SMOOTH_QUARTZ,
  QUARTZ_BRICKS, isCampfire, anchorCharges, stateOf, BLOCKS,
} from '../src/shared/blocks';
import {
  ITEMS, TOOLS, ARMOR, HORSE_ARMOR, NETHERITE_SCRAP, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE, GOLD_INGOT, DIAMOND,
  COMPASS, FIRE_RESISTANT_ITEMS, NETHER_STAR, EXPLOSION_RESISTANT_ITEMS, itemSpriteIndex,
} from '../src/shared/items';
import { smeltResult } from '../src/shared/containers';
import { matchRecipe } from '../src/shared/recipes';
import { smithingResult, smithingConsume } from '../src/shared/smithing';
import { sanitizeItemData, stackName } from '../src/shared/itemData';
import { beaconLevel, beamSegments, validPrimary, validSecondary, beaconRange, beaconSeconds } from '../src/shared/beacon';
import { EFFECT_SPEED, EFFECT_STRENGTH, EFFECT_REGENERATION } from '../src/shared/effects';
import { ENCHANT_IDS } from '../src/shared/enchantments';
import { NETHER_LOOT } from '../src/shared/netherLoot';
import { rollLoot, LOOT_TABLES } from '../src/shared/loot';
import { mulberry32 } from '../src/shared/world/noise';
import { NetherGenerator } from '../src/shared/world/nether';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { DIM_NETHER } from '../src/shared/dimensions';
import { blastResistance } from '../src/shared/explosions';
import { makeServer } from './harness';

test('netherita: escombros ancestrales enterrados en el Nether, chatarra, lingote, bloque y plantilla', () => {
  // Los escombros salen en el Nether, entre y = 8 y 119, siempre enterrados (sin aire al lado).
  const gen = new NetherGenerator(4242);
  let n = 0;
  for (let cz = 0; cz < 6; cz++) {
    for (let cx = 0; cx < 6; cx++) {
      const b = gen.generate(cx, cz).blocks;
      for (let i = 0; i < b.length; i++) if (b[i] === ANCIENT_DEBRIS) n++;
    }
  }
  assert.ok(n >= 6 && n < 200, `escombros en 36 chunks: ${n}`);
  assert.equal(BLOCKS[ANCIENT_DEBRIS].tier, 4, 'hace falta pico de diamante');
  assert.equal(blastResistance(ANCIENT_DEBRIS), 1200);
  assert.equal(smeltResult(ANCIENT_DEBRIS), NETHERITE_SCRAP);
  const S = NETHERITE_SCRAP, G = GOLD_INGOT;
  assert.equal(matchRecipe([S, S, S, S, G, G, G, G, 0], 3)?.out.id, NETHERITE_INGOT);
  const I = NETHERITE_INGOT;
  assert.equal(matchRecipe([I, I, I, I, I, I, I, I, I], 3)?.out.id, NETHERITE_BLOCK);
  const T = NETHERITE_UPGRADE_SMITHING_TEMPLATE, D = DIAMOND;
  const nr = BLOCKS.findIndex((b) => b?.key === 'netherrack');
  assert.deepEqual(matchRecipe([D, T, D, D, nr, D, D, D, D], 3)?.out, { id: T, count: 2 });
  // Herramientas y armadura: de diamante a mejor (velocidad 9, 2031 usos, dureza 3).
  assert.deepEqual([ITEMS[TOOLS.netherite.sword].tool?.damage, ITEMS[TOOLS.netherite.pickaxe].tool?.durability, ITEMS[TOOLS.netherite.axe].tool?.speed], [8, 2031, 9]);
  assert.deepEqual(Object.values(ARMOR.netherite).map((id) => ITEMS[id].armor?.points), [3, 8, 6, 3]);
  assert.equal(ITEMS[ARMOR.netherite.chestplate].armor?.toughness, 3);
  for (const id of [S, I, T, NETHER_STAR, ...Object.values(TOOLS.netherite), ...Object.values(ARMOR.netherite), HORSE_ARMOR.netherite]) {
    assert.ok(itemSpriteIndex(id) >= 0, `sprite: ${ITEMS[id].key}`);
  }
  assert.ok(FIRE_RESISTANT_ITEMS.has(TOOLS.netherite.sword) && FIRE_RESISTANT_ITEMS.has(I) && !FIRE_RESISTANT_ITEMS.has(D));
  assert.ok(EXPLOSION_RESISTANT_ITEMS.has(NETHER_STAR));
});

test('mesa de herrería: la mejora de netherita conserva encantamientos, desgaste y nombre; gasta uno de cada', () => {
  const sword = { id: TOOLS.diamond.sword, count: 1, dmg: 120, data: { ench: [[ENCHANT_IDS[0], 3]] as [number, number][], name: 'Tizona' } };
  const out = smithingResult({ id: NETHERITE_UPGRADE_SMITHING_TEMPLATE, count: 2 }, sword, { id: NETHERITE_INGOT, count: 3 });
  assert.equal(out?.id, TOOLS.netherite.sword);
  assert.equal(out?.dmg, 120);
  assert.deepEqual(out?.data, sword.data);
  assert.equal(smithingResult({ id: NETHERITE_UPGRADE_SMITHING_TEMPLATE, count: 1 }, { id: TOOLS.iron.sword, count: 1 }, { id: NETHERITE_INGOT, count: 1 }), null);
  assert.equal(smithingResult(null, sword, { id: NETHERITE_INGOT, count: 1 }), null);
  assert.equal(smithingResult({ id: NETHERITE_UPGRADE_SMITHING_TEMPLATE, count: 1 }, { id: HORSE_ARMOR.diamond, count: 1 }, { id: NETHERITE_INGOT, count: 1 })?.id, HORSE_ARMOR.netherite);
  const grid = [{ id: NETHERITE_UPGRADE_SMITHING_TEMPLATE, count: 2 }, sword, { id: NETHERITE_INGOT, count: 1 }];
  smithingConsume(grid);
  assert.deepEqual(grid, [{ id: NETHERITE_UPGRADE_SMITHING_TEMPLATE, count: 1 }, null, null]);
});

test('cuarzo, fogata de almas y magnetita', () => {
  assert.equal(smeltResult(QUARTZ_BLOCK), SMOOTH_QUARTZ);
  assert.equal(matchRecipe([QUARTZ_BLOCK, QUARTZ_BLOCK, QUARTZ_BLOCK, QUARTZ_BLOCK], 2)?.out.id, QUARTZ_BRICKS);
  const cuts = stonecutterOptions(QUARTZ_BLOCK).map((s) => BLOCKS[s.id]?.key);
  for (const k of ['chiseled_quartz_block', 'quartz_bricks', 'quartz_pillar', 'quartz_slab', 'quartz_stairs']) assert.ok(cuts.includes(k), `cortapiedras: ${k}`);
  assert.ok(isCampfire(SOUL_CAMPFIRE) && isCampfire(stateOf(SOUL_CAMPFIRE, { lit: 1 })));
  assert.equal(BLOCKS[stateOf(SOUL_CAMPFIRE, { lit: 1 })].emission, 10);
  const lode = sanitizeItemData(COMPASS, { lode: [10, 64, -5, 1] });
  assert.deepEqual(lode, { lode: [10, 64, -5, 1] });
  assert.equal(stackName({ id: COMPASS, count: 1, data: lode }), 'Brújula magnetizada');
  assert.equal(sanitizeItemData(COMPASS, { lode: [1, 2] }), undefined);
  assert.equal(BLOCKS[LODESTONE].tool, 'pickaxe');
});

test('nexo de reaparición: se carga con piedra luminosa, fija el punto en el Nether y gasta una carga al reaparecer', () => {
  const h = makeServer(8501, undefined, DIM_NETHER);
  const W = h.gs.world;
  const c = h.join('ana');
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    W.setBlock(x, 60, z, STONE);
    for (let y = 61; y < 64; y++) W.setBlock(x, y, z, AIR);
  }
  W.setBlock(0, 61, 0, RESPAWN_ANCHOR);
  c.pos(1.5, 61, 1.5);
  c.send({ t: 'use', x: 0, y: 61, z: 0, yaw: 0, item: GLOWSTONE });
  c.send({ t: 'use', x: 0, y: 61, z: 0, yaw: 0, item: GLOWSTONE });
  assert.equal(anchorCharges(W.getBlock(0, 61, 0)), 2);
  c.send({ t: 'use', x: 0, y: 61, z: 0, yaw: 0, item: 0 });
  const spawn = c.conn.take('spawn');
  assert.deepEqual(spawn.at(-1), { t: 'spawn', p: [0, 61, 0], d: DIM_NETHER });
  // Muerto, reaparece junto al nexo (gasta una carga).
  c.send({ t: 'respawn' });
  const at = c.conn.take('respawnAt')[0];
  assert.ok(at && Math.abs(at.p[0]) <= 1.5 && Math.abs(at.p[2]) <= 1.5 && at.p[1] >= 60, `reaparece junto al nexo: ${JSON.stringify(at)}`);
  assert.equal(anchorCharges(W.getBlock(0, 61, 0)), 1);
});

test('columnas de burbujas: sobre arena de alma suben, sobre magma bajan, sin apoyo vuelven a ser agua', () => {
  const h = makeServer(8502);
  const W = h.gs.world;
  h.join('bea');
  W.ensureChunk(0, 0, h.clock.now);
  W.setBlock(4, 50, 4, SOUL_SAND);
  for (let y = 51; y <= 54; y++) W.setBlock(4, y, 4, WATER);
  W.setBlock(4, 55, 4, AIR);
  h.tick(30);
  for (let y = 51; y <= 54; y++) assert.equal(W.getBlock(4, y, 4), BUBBLE_COLUMN, `sube en y = ${y}`);
  W.setBlock(4, 50, 4, MAGMA_BLOCK);
  h.tick(30);
  assert.equal(W.getBlock(4, 53, 4), BUBBLE_COLUMN + 1, 'baja sobre magma');
  W.setBlock(4, 50, 4, STONE);
  h.tick(30);
  assert.equal(W.getBlock(4, 52, 4), WATER, 'sin apoyo, agua');
});

test('faro: niveles de la pirámide, el haz que tiñe el cristal y lo que lo corta, y los efectos permitidos', () => {
  const m = new Map<string, number>();
  const get = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? AIR;
  const set = (x: number, y: number, z: number, id: number) => m.set(`${x},${y},${z}`, id);
  set(0, 10, 0, BEACON);
  for (let n = 1; n <= 4; n++) for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) set(x, 10 - n, z, [IRON_BLOCK, GOLD_BLOCK, DIAMOND_BLOCK, NETHERITE_BLOCK][(x + z + 8) % 4]);
  assert.equal(beaconLevel(get, 0, 10, 0), 4);
  set(3, 7, 3, AIR);
  assert.equal(beaconLevel(get, 0, 10, 0), 2, 'una capa incompleta corta la pirámide');
  set(0, 12, 0, STAINED_GLASS.red);
  set(0, 14, 0, STAINED_GLASS.blue);
  set(0, 20, 0, BEDROCK);
  const seg = beamSegments(get, 0, 10, 0, 40)!;
  assert.equal(seg.length, 3, 'blanco, rojo y la mezcla con el azul');
  assert.deepEqual(seg[0].color, [1, 1, 1]);
  assert.ok(seg[1].color[0] > 0.6 && seg[2].color[2] > seg[1].color[2], 'el azul se mezcla con el rojo');
  set(0, 25, 0, STONE);
  assert.equal(beamSegments(get, 0, 10, 0, 40), null, 'la piedra corta el haz (el lecho de roca no)');
  set(0, 25, 0, GLASS);
  assert.ok(beamSegments(get, 0, 10, 0, 40));
  assert.ok(validPrimary(EFFECT_SPEED, 1) && !validPrimary(EFFECT_STRENGTH, 2) && validPrimary(EFFECT_STRENGTH, 3));
  assert.ok(!validPrimary(EFFECT_REGENERATION, 4), 'la regeneración sólo de secundario');
  assert.ok(validSecondary(EFFECT_REGENERATION, EFFECT_SPEED, 4) && validSecondary(EFFECT_SPEED, EFFECT_SPEED, 4) && !validSecondary(EFFECT_REGENERATION, EFFECT_SPEED, 3));
  assert.deepEqual([beaconRange(4), beaconSeconds(4)], [50, 17]);
});

test('faro en el servidor: guarda los efectos elegidos y los da cada 4 s a quien está al alcance', () => {
  const h = makeServer(8503);
  const W = h.gs.world;
  const c = h.join('cai');
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) W.setBlock(x, 99, z, IRON_BLOCK);
  W.setBlock(5, 100, 5, BEACON);
  for (let y = 101; y < 320; y++) W.setBlock(5, y, 5, AIR);
  c.pos(7.5, 100, 7.5);
  c.send({ t: 'beacon', x: 5, y: 100, z: 5, p: EFFECT_SPEED, s: 0 });
  assert.equal(c.conn.take('beacon')[0]?.p, EFFECT_SPEED);
  h.tick(90);
  const fx = c.conn.take('effect').filter((m) => m.id === EFFECT_SPEED);
  assert.ok(fx.length >= 1 && fx[0].s === 11, `Velocidad 11 s: ${JSON.stringify(fx[0])}`);
  // Fuerza con una pirámide de nivel 1: no vale.
  c.send({ t: 'beacon', x: 5, y: 100, z: 5, p: EFFECT_STRENGTH, s: 0 });
  assert.equal(c.conn.take('beacon').length, 0);
});

test('botín de los bastiones: netherita, escombros, magnetita y plantilla de mejora', () => {
  const r = mulberry32(85);
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    for (const k of ['bastion_treasure', 'bastion_other', 'bastion_bridge', 'bastion_hoglin_stable']) for (const s of rollLoot(NETHER_LOOT[k], r)) seen.add(s.id);
  }
  for (const id of [NETHERITE_INGOT, NETHERITE_SCRAP, ANCIENT_DEBRIS, LODESTONE, NETHERITE_UPGRADE_SMITHING_TEMPLATE]) assert.ok(seen.has(id), `sale ${ITEMS[id].key}`);
  // La sala del tesoro siempre trae la plantilla; el puente, siempre una magnetita.
  for (let i = 0; i < 20; i++) {
    assert.ok(rollLoot(NETHER_LOOT.bastion_treasure, r).some((s) => s.id === NETHERITE_UPGRADE_SMITHING_TEMPLATE));
    assert.ok(rollLoot(NETHER_LOOT.bastion_bridge, r).some((s) => s.id === LODESTONE));
  }
  let lode = 0;
  for (let i = 0; i < 300; i++) if (rollLoot(LOOT_TABLES.ruined_portal, r).some((s) => s.id === LODESTONE)) lode++;
  assert.ok(lode > 150 && lode < 260, `magnetita en los portales en ruinas: ${lode} de 300`);
});
