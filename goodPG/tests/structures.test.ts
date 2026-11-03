// Fase 5: estructuras con botín. Cada tipo se encuentra y se genera con lo suyo, los cofres se
// llenan una sola vez al generarse su chunk, los generadores de monstruos invocan criaturas y las
// mazmorras aparecen junto a las cuevas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, SANDSTONE, MOSSY_COBBLESTONE, COBBLESTONE, MOB_SPAWNER, COBWEB, OBSIDIAN, SNOW_BLOCK, FENCES, OAK_PLANKS,
  isChest, DARK_OAK_LOG,
  PRISMARINE_BRICKS, // Fase 7.5 (océano)
  REINFORCED_DEEPSLATE, // Fase 7.5 (abismo)
  SPRUCE_PLANKS, BONE_BLOCK, BONE_BLOCK_AXIS, // Fase 7.5 (fauna)
} from '../src/shared/blocks';
import { DARK_OAK_PLANKS, STONE_BRICKS, MOSSY_STONE_BRICKS } from '../src/shared/blocks'; // Fase 7.5 (mansión); 8.6
import { STRING, TOOLS, SHEARS } from '../src/shared/items';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { locateStructure, STRUCTURE_NAMES } from '../src/shared/world/structures';
import { LOOT_TABLES, rollLoot, scatterLoot, lootRollRange } from '../src/shared/loot';
import { blockDrops } from '../src/shared/sim/drops';
import { blockIndex, CHUNK_VOLUME } from '../src/shared/constants';
import { posKey } from '../src/shared/sim/posKey';
import { makeServer } from './harness';

test('botín: tiradas dentro de los márgenes y repartido por el cofre', () => {
  let r = 0.37;
  const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  for (const [name, t] of Object.entries(LOOT_TABLES)) {
    for (let i = 0; i < 20; i++) {
      const out = rollLoot(t, rand);
      const [lo, hi] = lootRollRange(t); // Fase 7.5 (océano): con sus tiradas extra
      assert.ok(out.length >= lo && out.length <= hi, `${name}: ${out.length} montones`);
      for (const s of out) assert.ok(s.count >= 1, name);
    }
  }
  const slots = scatterLoot(rollLoot(LOOT_TABLES.dungeon, rand), 27, rand);
  assert.equal(slots.length, 27);
  assert.ok(slots.some((s) => s));
});

test('cada estructura se encuentra y se genera con lo suyo', () => {
  const gen = new TerrainGenerator(12345);
  const expect: Record<string, (c: Map<number, number>, chests: string[]) => boolean> = {
    desert_pyramid: (c, ch) => (c.get(SANDSTONE) ?? 0) > 50 || ch.includes('desert_pyramid'),
    jungle_temple: (c, ch) => (c.get(MOSSY_COBBLESTONE) ?? 0) > 5 || ch.includes('jungle_temple'),
    shipwreck: (c, ch) => (c.get(OAK_PLANKS) ?? 0) + ch.length > 0,
    ruined_portal: (c) => (c.get(OBSIDIAN) ?? 0) > 3,
    igloo: (c) => (c.get(SNOW_BLOCK) ?? 0) > 20,
    desert_well: (c) => (c.get(SANDSTONE) ?? 0) > 8,
    mineshaft: (c) => (c.get(FENCES.oak) ?? 0) + (c.get(OAK_PLANKS) ?? 0) > 3,
    village: (_c, ch) => ch.includes('village'),
    pillager_outpost: (c, ch) => ch.includes('pillager_outpost') || (c.get(DARK_OAK_LOG) ?? 0) > 20,
    // Fase 7.5 (océano)
    monument: (c) => (c.get(PRISMARINE_BRICKS) ?? 0) > 200,
    ocean_ruins: (_c, ch) => ch.some((t) => t.startsWith('underwater_ruin')),
    buried_treasure: (_c, ch) => ch.includes('buried_treasure'),
    ancient_city: (c, ch) => (c.get(REINFORCED_DEEPSLATE) ?? 0) > 20 || ch.includes('ancient_city'), // Fase 7.5 (abismo)
    // Fase 7.5 (fauna)
    swamp_hut: (c) => (c.get(SPRUCE_PLANKS) ?? 0) > 40,
    fossil: (c) => (c.get(BONE_BLOCK) ?? 0) + (c.get(BONE_BLOCK_AXIS) ?? 0) + (c.get(BONE_BLOCK_AXIS + 1) ?? 0) > 5,
    mansion: (c, ch) => ch.includes('woodland_mansion') || (c.get(DARK_OAK_PLANKS) ?? 0) > 200, // Fase 7.5 (mansión)
    stronghold: (c) => (c.get(STONE_BRICKS) ?? 0) + (c.get(MOSSY_STONE_BRICKS) ?? 0) > 60, // Fase 8.6 (el End): la escalera de entrada
  };
  for (const key of Object.keys(STRUCTURE_NAMES)) {
    const p = locateStructure(gen, key, 0, 0, 20);
    assert.ok(p, `hay ${STRUCTURE_NAMES[key]} cerca del origen`);
    const counts = new Map<number, number>();
    const chests: string[] = [];
    const cx = Math.floor(p![0] / 16), cz = Math.floor(p![2] / 16);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const r = gen.generate(cx + dx, cz + dz);
        for (const b of r.blocks) counts.set(b, (counts.get(b) ?? 0) + 1);
        chests.push(...r.chests.map((c) => c.table));
      }
    }
    assert.ok(expect[key](counts, chests), `${STRUCTURE_NAMES[key]} en ${p}`);
  }
});

test('mazmorras junto a las cuevas: generador, roca musgosa y cofre', () => {
  const gen = new TerrainGenerator(12345);
  let found = 0;
  for (let i = 0; i < 200 && found < 3; i++) {
    const { blocks, chests } = gen.generate((i % 20) - 10, Math.floor(i / 20) - 5);
    for (let k = blockIndex(0, -60, 0); k < CHUNK_VOLUME; k++) {
      if (blocks[k] !== MOB_SPAWNER) continue;
      const below = blocks[k - 256];
      if ((below === MOSSY_COBBLESTONE || below === COBBLESTONE) && chests.some((c) => c.table === 'dungeon')) found++;
    }
  }
  assert.ok(found >= 1, `mazmorras encontradas: ${found}`);
});

test('telarañas: tijeras o espada', () => {
  assert.deepEqual(blockDrops(COBWEB, 0), []);
  assert.deepEqual(blockDrops(COBWEB, TOOLS.iron.sword), [{ id: STRING, count: 1 }]);
  assert.deepEqual(blockDrops(COBWEB, SHEARS), [{ id: COBWEB, count: 1 }]);
  assert.deepEqual(blockDrops(MOB_SPAWNER, TOOLS.diamond.pickaxe), []);
});

test('servidor: los cofres de un templo se llenan al generarse, una sola vez', () => {
  const h = makeServer(12345);
  const W = h.gs.world;
  const p = locateStructure(W.gen, 'desert_pyramid', 0, 0, 20)!;
  // La cámara del tesoro está 12 bloques por debajo del suelo del templo.
  W.ensureChunk(Math.floor(p[0] / 16), Math.floor(p[2] / 16));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containers = (h.gs.sys.containers as unknown as { containers: unknown }).containers as Map<number, { slots: unknown[] }>;
  const chestAt = (x: number, y: number, z: number) => isChest(W.getBlock(x, y, z));
  const cy = p[1] - 12;
  const spots = [[p[0], cy, p[2] - 4], [p[0] + 4, cy, p[2]], [p[0], cy, p[2] + 4], [p[0] - 4, cy, p[2]]].filter(([x, y, z]) => chestAt(x, y, z));
  assert.ok(spots.length > 0, 'hay cofres en la cámara');
  for (const [x, y, z] of spots) {
    const c = containers.get(posKey(x, y, z));
    assert.ok(c && c.slots.some((s) => s), `cofre con botín en ${x},${y},${z}`);
  }
  // Se vacía uno, se descarga y se vuelve a cargar el chunk: no se rellena.
  const [x, y, z] = spots[0];
  containers.get(posKey(x, y, z))!.slots.fill(null);
  W.unloadUnused(1e12, () => false);
  W.ensureChunk(Math.floor(x / 16), Math.floor(z / 16));
  assert.ok(!containers.get(posKey(x, y, z))!.slots.some((s) => s), 'el botín no se repite');
});

test('servidor: el generador de monstruos invoca criaturas con un jugador cerca', () => {
  const h = makeServer(777);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  // Sala oscura a y = 150: suelo de piedra, techo y el generador en medio.
  for (let x = 2; x <= 14; x++) for (let z = 2; z <= 14; z++) {
    W.setBlock(x, 149, z, STONE);
    W.setBlock(x, 154, z, STONE);
    for (let y = 150; y <= 153; y++) W.setBlock(x, y, z, AIR);
  }
  W.setBlock(8, 150, 8, MOB_SPAWNER);
  const c = h.join('Tester', 'c');
  c.pos(8.5, 150, 12.5);
  let mobs = 0;
  for (let i = 0; i < 90 && mobs === 0; i++) {
    h.tick(20);
    c.pos(8.5, 150, 12.5);
    mobs = [...h.gs.entities.list.values()].filter((e) => Math.abs(e.x - 8.5) < 6 && Math.abs(e.z - 8.5) < 6 && e.type < 100).length;
  }
  assert.ok(mobs > 0, 'aparecen criaturas junto al generador');
});
