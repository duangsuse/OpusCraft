// Fase 6.5 (calderos): llenar y vaciar con cubos, lavar estandartes y lo que les pasa a las criaturas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, CAULDRON, BANNERS, WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON, cauldronFill, cauldronOf, isCauldron,
  CAULDRON_WATER, CAULDRON_LAVA, CAULDRON_SNOW, BLOCK_EMISSION, baseBlock,
} from '../src/shared/blocks';
import { BUCKET, WATER_BUCKET, LAVA_BUCKET, POWDER_SNOW_BUCKET } from '../src/shared/items';
import { cauldronUse } from '../src/shared/cauldronUse';
import { blockDrops } from '../src/shared/sim/drops';
import { MOB_PIG } from '../src/shared/mobs';
import { makeServer } from './harness';

test('calderos: estados, llenar, vaciar y lavar', () => {
  assert.ok([WATER_CAULDRON, LAVA_CAULDRON, POWDER_SNOW_CAULDRON].every(isCauldron));
  assert.deepEqual(cauldronFill(cauldronOf(CAULDRON_WATER, 2)), { kind: CAULDRON_WATER, level: 2 });
  assert.equal(baseBlock(cauldronOf(CAULDRON_WATER, 3)), CAULDRON, 'suelta el caldero vacío');
  assert.ok(BLOCK_EMISSION[LAVA_CAULDRON] > 0, 'la lava alumbra');
  // Cubos.
  const water = cauldronUse(CAULDRON, { id: WATER_BUCKET, count: 1 })!;
  assert.deepEqual([cauldronFill(water.block), water.held], [{ kind: CAULDRON_WATER, level: 3 }, { id: BUCKET, count: 1 }]);
  const back = cauldronUse(water.block, { id: BUCKET, count: 1 })!;
  assert.deepEqual([back.block, back.held], [CAULDRON, { id: WATER_BUCKET, count: 1 }]);
  assert.equal(cauldronUse(cauldronOf(CAULDRON_WATER, 2), { id: BUCKET, count: 1 }), null, 'a medias no se recoge');
  assert.equal(cauldronUse(water.block, { id: LAVA_BUCKET, count: 1 }), null, 'la lava no va sobre el agua');
  assert.equal(cauldronUse(CAULDRON, { id: LAVA_BUCKET, count: 1 })!.block, LAVA_CAULDRON);
  assert.deepEqual(cauldronUse(LAVA_CAULDRON, { id: BUCKET, count: 1 })!.held, { id: LAVA_BUCKET, count: 1 });
  assert.equal(cauldronFill(cauldronUse(CAULDRON, { id: POWDER_SNOW_BUCKET, count: 1 })!.block)!.kind, CAULDRON_SNOW);
  // Lavar la última capa de un estandarte.
  const banner = { id: BANNERS.white, count: 1, data: { layers: [[0, 14], [3, 11]] as [number, number][] } };
  const wash = cauldronUse(cauldronOf(CAULDRON_WATER, 3), banner)!;
  assert.deepEqual(wash.held?.data?.layers, [[0, 14]]);
  assert.deepEqual(cauldronFill(wash.block), { kind: CAULDRON_WATER, level: 2 });
  assert.equal(cauldronUse(cauldronOf(CAULDRON_WATER, 3), { id: BANNERS.white, count: 1 }), null, 'uno liso no se lava');
  // Todos sueltan el caldero.
  for (const id of [cauldronOf(CAULDRON_WATER, 1), LAVA_CAULDRON, cauldronOf(CAULDRON_SNOW, 3)]) {
    assert.deepEqual(blockDrops(id, 0, () => 0.5).map((s) => s.id), [CAULDRON]);
  }
});

test('servidor: cubos en el caldero y criaturas dentro', () => {
  const h = makeServer(7373);
  const c = h.join('Calderera', 'c');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 4; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 2.5);
  h.tick(2);
  W.setBlock(bx, by, bz, CAULDRON);
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: WATER_BUCKET });
  assert.deepEqual(cauldronFill(W.getBlock(bx, by, bz)), { kind: CAULDRON_WATER, level: 3 });
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: BANNERS.red });
  assert.deepEqual(cauldronFill(W.getBlock(bx, by, bz)), { kind: CAULDRON_WATER, level: 2 }, 'lavar baja un nivel');
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: BUCKET });
  assert.deepEqual(cauldronFill(W.getBlock(bx, by, bz)), { kind: CAULDRON_WATER, level: 2 }, 'a medias no se recoge');
  // Un cerdo ardiendo se apaga en el agua; en la lava, arde.
  const z = h.gs.entities.spawnMob(MOB_PIG, bx + 0.5, by + 0.3, bz + 0.5)!;
  z.fire = 5;
  h.tick(12);
  assert.equal(z.fire, 0, 'el agua apaga el fuego');
  W.setBlock(bx, by, bz, LAVA_CAULDRON);
  z.x = bx + 0.5; z.z = bz + 0.5; z.y = by + 0.3;
  h.tick(12);
  assert.ok(z.fire > 0, 'la lava lo prende');
});
