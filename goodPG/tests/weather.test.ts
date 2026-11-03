// Fase 5: clima y navegación. Tormentas con rayos, nieve que se acumula, agua que se congela,
// hielo y nieve que se derriten junto a la luz, bolas de nieve, brújula y mapas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, ICE, GLOWSTONE, SNOW_BLOCK, SNOW_LAYER, isSnowLayer, isLeaves, BLOCK_OPAQUE,
} from '../src/shared/blocks';
import { COMPASS, EMPTY_MAP, FILLED_MAP, SNOWBALL, IRON_INGOT, REDSTONE, PAPER, TOOLS } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement } from '../src/shared/placement';
import { sanitizeStack } from '../src/shared/containers';
import { mapKeyAt, mapOrigin, MAP_SIZE } from '../src/shared/maps';
import { thunderAt, rainAt } from '../src/shared/weather';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { blockIndex } from '../src/shared/constants';
import { MOB_ZOMBIE } from '../src/shared/mobs';
import { makeServer } from './harness';

test('tormentas: sólo con lluvia fuerte y una de cada pocas lluvias', () => {
  let thunder = 0, rain = 0;
  for (let t = 0; t < 300; t += 0.01) {
    const th = thunderAt(t, 1234), r = rainAt(t, 1234);
    if (th > 0) {
      thunder++;
      assert.ok(r > 0.45, 'truena mientras llueve fuerte');
    }
    if (r > 0) rain++;
  }
  assert.ok(thunder > 0 && thunder < rain, `hay tormentas (${thunder}) pero menos que lluvias (${rain})`);
});

test('mapas: celdas de 128 bloques que caben en el montón', () => {
  for (const [x, z] of [[0, 0], [63, 63], [64, 64], [-65, 200], [99999, -99999]]) {
    const k = mapKeyAt(x, z);
    assert.ok(k > 0);
    const [x0, z0] = mapOrigin(k);
    assert.ok(x >= x0 && x < x0 + MAP_SIZE && z >= z0 && z < z0 + MAP_SIZE, `(${x}, ${z}) dentro de su mapa`);
    assert.deepEqual(sanitizeStack({ id: FILLED_MAP, count: 1, dmg: k }), { id: FILLED_MAP, count: 1, dmg: k });
  }
  assert.notEqual(mapKeyAt(0, 0), mapKeyAt(200, 0));
  const I = IRON_INGOT, P = PAPER;
  assert.equal(matchRecipe([0, I, 0, I, REDSTONE, I, 0, I, 0], 3)?.out.id, COMPASS);
  assert.equal(matchRecipe([P, P, P, P, COMPASS, P, P, P, P], 3)?.out.id, EMPTY_MAP);
  assert.equal(matchRecipe([SNOWBALL, SNOWBALL, SNOWBALL, SNOWBALL], 2)?.out.id, SNOW_BLOCK);
});

test('nieve: capas que se apilan y se recogen con pala', () => {
  assert.deepEqual(blockDrops(SNOW_LAYER + 2, TOOLS.iron.shovel), [{ id: SNOWBALL, count: 3 }]);
  assert.deepEqual(blockDrops(SNOW_LAYER, 0), []);
  assert.deepEqual(blockDrops(SNOW_BLOCK, TOOLS.wooden.shovel), [{ id: SNOWBALL, count: 4 }]);
  const m = new Map<string, number>();
  const get = (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? (y <= 0 ? STONE : AIR);
  assert.deepEqual(planPlacement(get, { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 1, pz: 0.5, id: STONE }, SNOW_LAYER, 0), [[0, 1, 0, SNOW_LAYER]]);
  m.set('0,1,0', SNOW_LAYER);
  assert.deepEqual(planPlacement(get, { x: 0, y: 1, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 1.125, pz: 0.5, id: SNOW_LAYER }, SNOW_LAYER, 0), [[0, 1, 0, SNOW_LAYER + 1]]);
});

test('generación: nieve sobre lo que queda a la intemperie en las zonas frías', () => {
  const gen = new TerrainGenerator(12345);
  let found = 0, cold = 0;
  for (let i = 0; i < 400 && found < 20; i++) {
    const cx = (i % 20) * 7 - 70, cz = Math.floor(i / 20) * 7 - 70;
    if (gen.columnInfo(cx * 16 + 8, cz * 16 + 8).temp >= -0.6) continue;
    cold++;
    const { blocks, heights } = gen.generate(cx, cz);
    for (let k = 0; k < 256; k++) {
      const x = k & 15, z = k >> 4;
      const b = blocks[blockIndex(x, heights[k], z)];
      if (isSnowLayer(b)) {
        found++;
        const below = blocks[blockIndex(x, heights[k] - 1, z)];
        assert.ok(BLOCK_OPAQUE[below] || isLeaves(below), 'la nieve se posa sobre algo firme o sobre hojas');
      }
    }
  }
  assert.ok(cold > 0 && found > 0, `capas de nieve en ${cold} chunks fríos: ${found}`);
});

test('servidor: un rayo hace daño; el agua se congela y el hielo se derrite con la luz', () => {
  const h = makeServer(4321);
  const W = h.gs.world;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gs = h.gs as any;
  W.ensureChunk(0, 0);
  const z = h.gs.entities.spawnMob(MOB_ZOMBIE, 8.5, 200, 8.5)!;
  const hp = z.health;
  gs.sys.storms.strike(8.5, 200, 8.5);
  assert.ok(z.health < hp && z.fire > 0, 'el zombi recibe daño y arde');
  // Una columna cualquiera del chunk, forzada a ser fría con el generador a mano: se busca una fría.
  let cx = 0, cz = 0;
  for (let i = 0; i < 400; i++) {
    const x = (i % 20) * 64 - 640, zz = Math.floor(i / 20) * 64 - 640;
    if (W.gen.columnInfo(x, zz).temp < -0.7) { cx = x; cz = zz; break; }
  }
  W.ensureChunk(Math.floor(cx / 16), Math.floor(cz / 16));
  W.setBlock(cx, 210, cz, STONE);
  W.setBlock(cx, 211, cz, WATER);
  gs.sys.nature.weatherTickAt(cx, cz, false);
  assert.equal(W.getBlock(cx, 211, cz), ICE, 'el agua a la intemperie se congela en el frío');
  gs.sys.nature.weatherTickAt(cx, cz, true);
  W.setBlock(cx + 1, 210, cz, STONE);
  gs.sys.nature.weatherTickAt(cx + 1, cz, true);
  assert.equal(W.getBlock(cx + 1, 211, cz), SNOW_LAYER, 'si nieva, se posa una capa de nieve');
  // Una piedra luminosa al lado: el hielo se derrite y la nieve desaparece.
  W.setBlock(cx, 212, cz + 1, GLOWSTONE);
  gs.sys.nature.randomTickAt(cx, 211, cz);
  gs.sys.nature.randomTickAt(cx + 1, 211, cz);
  assert.equal(W.getBlock(cx, 211, cz), WATER, 'el hielo se derrite junto a la luz');
  assert.equal(W.getBlock(cx + 1, 211, cz), AIR, 'la nieve también');
});

test('servidor: las bolas de nieve se lanzan como los huevos', () => {
  const h = makeServer(55);
  const c = h.join('Tester', 'c');
  c.pos(0.5, 120, 0.5);
  c.send({ t: 'throw', p: [0.5, 121.5, 0.5], d: [0, 0, -1], item: SNOWBALL });
  const thrown = [...h.gs.entities.list.values()].filter((e) => e.stack?.id === SNOWBALL);
  assert.equal(thrown.length, 1);
});
