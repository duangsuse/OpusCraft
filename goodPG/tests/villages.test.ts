// Fase 6: aldeas. Se encuentran cerca del origen y traen casas con puerta, huertos y algún cofre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDoor, isCrop, isFarmland, WATER } from '../src/shared/blocks';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { locateStructure } from '../src/shared/world/structures';
import { LOOT_TABLES } from '../src/shared/loot';

function scanVillage(seed: number) {
  const gen = new TerrainGenerator(seed);
  const p = locateStructure(gen, 'village', 0, 0, 30);
  assert.ok(p, `hay una aldea cerca del origen (semilla ${seed})`);
  const cx = Math.floor(p![0] / 16), cz = Math.floor(p![2] / 16);
  let doors = 0, crops = 0, farmland = 0, water = 0;
  const chests: string[] = [];
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const r = gen.generate(cx + dx, cz + dz);
      for (const b of r.blocks) {
        if (isDoor(b)) doors++;
        else if (isCrop(b)) crops++;
        else if (isFarmland(b)) farmland++;
        else if (b === WATER) water++;
      }
      chests.push(...r.chests.map((c) => c.table));
    }
  }
  return { p: p!, doors, crops, farmland, water, chests };
}

test('aldea: casas con puerta, huertos y cofre de aldea', () => {
  const v = scanVillage(12345);
  assert.ok(v.doors >= 8, `puertas (mitades) en ${v.p}: ${v.doors}`);
  assert.ok(v.farmland >= 20 && v.crops >= 20, `huertos en ${v.p}: ${v.farmland} tierra, ${v.crops} cultivos`);
  assert.ok(v.chests.includes('village'), `cofre de aldea en ${v.p}`);
});

test('aldea: la generación es determinista', () => {
  const a = scanVillage(12345), b = scanVillage(12345);
  assert.deepEqual(a, b);
});

test('aldea: existe la tabla de botín', () => {
  assert.ok(LOOT_TABLES.village && LOOT_TABLES.village.entries.length > 5);
});
