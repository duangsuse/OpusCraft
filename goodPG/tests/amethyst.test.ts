// Brotes de amatista como en Java: en las seis caras (en las geodas cuelgan del techo y crecen del suelo), cada
// tamaño con su objeto, y la amatista con brotes los echa y los hace crecer hacia cualquier cara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, AIR, BUDDING_AMETHYST, AMETHYST_BUD, amethystBudInfo, amethystBudAt } from '../src/shared/blocks';
import { ITEMS } from '../src/shared/items';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { makeServer } from './harness';

test('brotes de amatista: seis caras, un objeto por tamaño, crecen hacia cualquier cara', () => {
  assert.deepEqual([0, 1, 2, 3].map((s) => ITEMS[AMETHYST_BUD + s].name), ['Brote de amatista pequeño', 'Brote de amatista mediano', 'Brote de amatista grande', 'Racimo de amatista']);
  assert.equal(ITEMS[AMETHYST_BUD + 3].key, 'amethyst_cluster');
  for (let dir = 0; dir < 6; dir++) for (let s = 0; s < 4; s++) assert.deepEqual(amethystBudInfo(amethystBudAt(s, dir)), { stage: s, dir });
  // En las geodas, brotes que apuntan hacia varios lados (sobre todo abajo y arriba).
  const gen = new TerrainGenerator(12345);
  const dirs = new Set<number>();
  for (let cx = -12; cx <= 12 && dirs.size < 3; cx++) {
    for (let cz = -12; cz <= 12; cz++) {
      for (const b of gen.generate(cx, cz).blocks) { const info = amethystBudInfo(b); if (info) dirs.add(info.dir); }
    }
  }
  assert.ok(dirs.size >= 2 && dirs.has(0), `brotes hacia ${[...dirs].join(', ')}`);
  // En el servidor: en la pared; se cae sin apoyo; la amatista con brotes los echa en cualquier cara.
  const h = makeServer(5151);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(8.5, 101, 8.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 99; y < 106; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  W.setBlock(5, 101, 5, STONE);
  c.send({ t: 'place', x: 5, y: 101, z: 5, n: [1, 0, 0], p: [6, 101.5, 5.5], item: AMETHYST_BUD + 2, yaw: 0 });
  assert.deepEqual(amethystBudInfo(W.getBlock(6, 101, 5)), { stage: 2, dir: 5 }, 'grande, en la pared, hacia el este');
  c.send({ t: 'set', x: 5, y: 101, z: 5, b: 0, tool: 0 });
  h.tick(2);
  assert.equal(amethystBudInfo(W.getBlock(6, 101, 5)), null, 'sin la pared, se cae');
  W.setBlock(10, 102, 10, BUDDING_AMETHYST);
  const faces = new Set<number>();
  const nature = (h.gs as unknown as { sys: { nature: { randomTickAt(x: number, y: number, z: number): void } } }).sys.nature;
  for (let i = 0; i < 4000 && faces.size < 4; i++) {
    nature.randomTickAt(10, 102, 10);
    for (const [dx, dy, dz] of [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]) {
      const info = amethystBudInfo(W.getBlock(10 + dx, 102 + dy, 10 + dz));
      if (info) faces.add(info.dir);
    }
  }
  assert.ok(faces.size >= 4, `crecen hacia varias caras (${[...faces].join(', ')})`);
});
