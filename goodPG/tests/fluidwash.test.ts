// El agua arrastra lo mismo que en Java 26.3 (washed_away_by_fluids): pasa por la nieve, las alfombras, las
// lianas, la redstone o las flores y cae por debajo; la paran la caña de azúcar, los raíles o los carteles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FluidSim } from '../src/shared/sim/fluids';
import { AIR, STONE, WATER, SUGAR_CANE, SNOW_LAYER, RAIL, BLOCK_FLUID, BLOCKS } from '../src/shared/blocks';
import { washedByFluids } from '../src/shared/sim/fluidWash';

const byKey = (k: string) => BLOCKS.find((b) => b?.key === k)!.id;

/** Suelo de piedra en y = 0 con un escalón que baja en x = 3 (hueco hasta y = −1): el agua sale en (0, 1, 0). */
function flow(obstacle: number): { fell: boolean; washed: string[] } {
  const m = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const sim = new FluidSim();
  const washed: string[] = [];
  const w = {
    getBlock: (x: number, y: number, z: number) => (y < -1 ? STONE : m.get(k(x, y, z)) ?? AIR),
    setBlock: (x: number, y: number, z: number, id: number) => {
      if (id === AIR) m.delete(k(x, y, z)); else m.set(k(x, y, z), id);
      sim.onBlockChanged(w, x, y, z);
    },
    washAway: (_x: number, _y: number, _z: number, id: number) => { washed.push(BLOCKS[id].key); },
  };
  for (let x = -6; x <= 2; x++) for (let z = -6; z <= 6; z++) m.set(k(x, 0, z), STONE);
  // El obstáculo tapa el borde del escalón en toda su anchura.
  for (let z = -6; z <= 6; z++) m.set(k(2, 1, z), obstacle);
  w.setBlock(0, 1, 0, WATER);
  for (let i = 0; i < 300; i++) sim.step(w);
  const below = m.get(k(3, -1, 0)) ?? AIR;
  return { fell: below > 0 && BLOCK_FLUID[below] === 1, washed };
}

test('agua: atraviesa (y arrastra) nieve, alfombras, lianas, redstone y flores, y cae', () => {
  for (const key of ['snow_layer', 'white_carpet', 'vine', 'redstone_wire', 'poppy', 'short_grass', 'cobweb', 'lever', 'repeater']) {
    const r = flow(byKey(key));
    assert.ok(r.fell, `no cayó tras ${key}`);
    assert.ok(r.washed.length > 0, `no arrastró ${key}`);
  }
});

test('agua: la paran la caña de azúcar, los raíles (se anegan) y los carteles', () => {
  for (const id of [SUGAR_CANE, RAIL, byKey('oak_sign'), byKey('candle')]) {
    const r = flow(id);
    assert.equal(r.fell, false, `atravesó ${BLOCKS[id].key}`);
    assert.equal(r.washed.length, 0);
  }
  assert.equal(washedByFluids()[SNOW_LAYER + 7], 1);
});

test('agua: también cae por debajo de y = 0 (cuevas profundas)', () => {
  const m = new Map<string, number>();
  const k = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const sim = new FluidSim();
  const w = {
    getBlock: (x: number, y: number, z: number) => (y < -40 ? STONE : m.get(k(x, y, z)) ?? AIR),
    setBlock: (x: number, y: number, z: number, id: number) => { if (id === AIR) m.delete(k(x, y, z)); else m.set(k(x, y, z), id); sim.onBlockChanged(w, x, y, z); },
    washAway: () => {},
  };
  w.setBlock(0, -20, 0, WATER);
  for (let i = 0; i < 400; i++) sim.step(w);
  const at = m.get(k(0, -40, 0)) ?? AIR;
  assert.ok(at > 0 && BLOCK_FLUID[at] === 1, 'el agua no llegó al suelo en y = −40');
});
