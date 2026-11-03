// El hielo roto por un jugador en supervivencia (sin Toque de seda) deja agua si tiene algo debajo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, ICE, PACKED_ICE, STONE, WATER, emptyAfterPlayerBreak } from '../src/shared/blocks';
import { TOOLS } from '../src/shared/items';
import { SILK_TOUCH } from '../src/shared/enchantments';
import { blockDrops } from '../src/shared/sim/drops';
import { makeServer } from './harness';

test('hielo: deja agua sobre algo sólido o líquido', () => {
  assert.equal(emptyAfterPlayerBreak(ICE, STONE, true, false), WATER);
  assert.equal(emptyAfterPlayerBreak(ICE, WATER, true, false), WATER);
  assert.equal(emptyAfterPlayerBreak(ICE, AIR, true, false), AIR, 'sobre el aire desaparece');
  assert.equal(emptyAfterPlayerBreak(ICE, STONE, false, false), AIR, 'en creativo no');
  assert.equal(emptyAfterPlayerBreak(ICE, STONE, true, true), AIR, 'con Toque de seda no');
  assert.equal(emptyAfterPlayerBreak(PACKED_ICE, STONE, true, false), AIR, 'el compacto no se derrite');
  assert.deepEqual(blockDrops(ICE, 0, () => 0.5), [], 'sin Toque de seda no suelta nada');
});

test('servidor: romper hielo en supervivencia deja agua', () => {
  const h = makeServer(5151);
  const c = h.join('Patinadora', 's');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(20);
  const bx = Math.floor(sx) + 1, bz = Math.floor(sz) + 1, by = Math.floor(sy);
  const W = h.gs.world;
  W.setBlock(bx, by - 1, bz, STONE);
  W.setBlock(bx, by, bz, ICE);
  W.setBlock(bx + 1, by, bz, ICE);
  W.setBlock(bx + 1, by - 1, bz, AIR);
  c.send({ t: 'set', x: bx, y: by, z: bz, b: AIR, tool: TOOLS.iron.pickaxe });
  assert.equal(W.getBlock(bx, by, bz), WATER, 'sobre piedra, agua');
  c.send({ t: 'set', x: bx + 1, y: by, z: bz, b: AIR, tool: TOOLS.iron.pickaxe, en: [[SILK_TOUCH, 1]] });
  assert.equal(W.getBlock(bx + 1, by, bz), AIR, 'con Toque de seda (o sobre el aire), nada');
});
