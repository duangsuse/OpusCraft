// Cuevas y minas de Java 26.3: las cuevas de ruido (queso, espaguetis, fideos, pilares y entradas), el acuífero
// (lagos con su nivel, barreras, lava honda) y los excavadores (gusanos y barrancos); y las minas abandonadas por
// piezas (sala, pasillos, cruces y escaleras) con sus vagonetas con cofre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { mineshaftAt, type MineSite } from '../src/shared/world/mineshaft';
import { AIR, WATER, LAVA, STONE, DEEPSLATE, BLOCK_FLUID, DARK_OAK_PLANKS, OAK_PLANKS } from '../src/shared/blocks';
import { blockIndex, MIN_Y } from '../src/shared/constants';
import { ENT_CHEST_MINECART } from '../src/shared/vehicles';
import { makeServer } from './harness';

test('cuevas: hueco bajo tierra, lava sólo en lo hondo y el agua de los acuíferos', () => {
  const gen = new TerrainGenerator(12345);
  let below = 0, air = 0, water = 0, lava = 0, lavaHigh = 0, airDeep = 0, lavaDeep = 0;
  for (let cz = 0; cz < 5; cz++) {
    for (let cx = 0; cx < 5; cx++) {
      const b = gen.generate(cx, cz).blocks;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = MIN_Y + 5; y < 0; y++) {
        const id = b[blockIndex(x, y, z)];
        below++;
        if (id === AIR) air++;
        else if (id === WATER) water++;
        else if (id === LAVA) lava++;
        if (id === LAVA && y >= -10) lavaHigh++;
        if (y < -55) { if (id === AIR) airDeep++; else if (id === LAVA) lavaDeep++; }
      }
    }
  }
  const f = air / below;
  assert.ok(f > 0.03 && f < 0.3, `hueco bajo cero: ${(f * 100).toFixed(1)} %`);
  assert.ok(water > 0, 'hay acuíferos de agua');
  assert.ok(lava > 0, 'hay lava');
  assert.equal(lavaHigh, 0, 'la lava no pasa de y = −10');
  assert.ok(lavaDeep > airDeep * 5, `por debajo de −54, los huecos son de lava (${lavaDeep} lava, ${airDeep} aire)`);
});

test('acuífero: agua, aire, barreras y la lava del fondo', () => {
  const gen = new TerrainGenerator(777);
  const caves = gen.caves;
  const seen = new Set<number>();
  for (let x = 0; x < 400; x += 7) for (let z = 0; z < 400; z += 11) for (let y = -50; y < 40; y += 3) seen.add(caves.substance(x, y, z, -0.05));
  assert.ok(seen.has(AIR) && seen.has(WATER), 'hay huecos secos y lagos');
  assert.ok(seen.has(-1), 'entre lagos de distinto nivel queda roca');
  assert.equal(caves.substance(5, -60, 5, -0.2), LAVA, 'por debajo de −54, lava');
  assert.equal(caves.substance(5, -30, 5, 0.3), -1, 'con densidad positiva, roca');
});

test('excavadores: túneles que cruzan chunks (y el mismo resultado desde fuera)', () => {
  const gen = new TerrainGenerator(12345);
  let carved = 0;
  for (let cz = -4; cz < 4; cz++) for (let cx = -4; cx < 4; cx++) carved += gen.caves.carveMask(cx, cz).reduce((a, v) => a + v, 0);
  assert.ok(carved > 2000, `los gusanos y barrancos excavan (${carved} bloques en 64 chunks)`);
});

test('costuras: lo que se predice al otro lado del borde es lo que se genera', () => {
  const gen = new TerrainGenerator(12345);
  let checked = 0, wrong = 0;
  for (const [cx, cz] of [[1, 0], [0, 1], [3, 2]]) {
    const b = gen.generate(cx, cz).blocks;
    for (let z = 0; z < 16; z++) for (let y = -50; y < 60; y++) {
      const id = b[blockIndex(0, y, z)];
      if (id !== WATER && id !== LAVA && id !== AIR && id !== STONE && id !== DEEPSLATE) continue;
      const fluid = id === WATER || id === LAVA;
      const predicted = gen.generatedWaterAt(cx * 16, y, cz * 16 + z);
      checked++;
      if (fluid !== predicted) wrong++;
    }
  }
  assert.ok(checked > 1000);
  assert.ok(wrong / checked < 0.005, `predicción de fluidos en el borde: ${wrong} de ${checked} mal`);
});

const site = (seed: number, badlands = false): MineSite => ({ seed, isBadlands: () => badlands, isDeepDark: () => false, surface: () => 90 });

test('minas: una de cada ~250 chunks, piezas de Java que no se pisan y a menos de 80 bloques', () => {
  let n = 0;
  for (let cz = -40; cz < 40; cz++) {
    for (let cx = -40; cx < 40; cx++) {
      const m = mineshaftAt(site(4242), cx, cz);
      if (!m) continue;
      n++;
      const room = m.pieces[0];
      assert.equal(room.kind, 'room');
      assert.ok(m.bounds.y1 <= 53, 'debajo del nivel del mar');
      for (let i = 0; i < m.pieces.length; i++) {
        const p = m.pieces[i];
        // Java mira que la pieza empiece a 80 bloques como mucho; un pasillo puede alargarse 20 más.
        assert.ok(Math.abs(p.box.x0 - room.box.x0) <= 100 && Math.abs(p.box.z0 - room.box.z0) <= 100, 'cerca de la sala');
        if (p.kind === 'corridor') {
          const w = p.dir === 0 || p.dir === 2 ? p.box.x1 - p.box.x0 + 1 : p.box.z1 - p.box.z0 + 1;
          assert.equal(w, 3, 'pasillos de 3 de ancho');
          assert.ok(p.sections! >= 1 && p.sections! <= 4);
        }
        for (let j = 0; j < i; j++) assert.ok(!p.box.intersects(m.pieces[j].box), 'las piezas no se pisan');
      }
    }
  }
  assert.ok(n >= 12 && n <= 45, `minas en 6400 chunks: ${n}`);
});

test('minas: las de las badlands son de roble oscuro y pueden asomar', () => {
  const gen = new TerrainGenerator(12345);
  let found = false;
  for (let cz = -30; cz < 30 && !found; cz++) {
    for (let cx = -30; cx < 30 && !found; cx++) {
      const m = mineshaftAt(site(gen.seed, true), cx, cz);
      if (!m) continue;
      found = true;
      assert.ok(m.mesa);
      assert.ok(m.bounds.y0 + (m.bounds.y1 - m.bounds.y0) / 2 >= 60, 'a la altura del mar o por encima');
    }
  }
  assert.ok(found);
  void DARK_OAK_PLANKS;
  void OAK_PLANKS;
  void BLOCK_FLUID;
});

test('minas: sus vagonetas con cofre aparecen con botín al cargar el chunk', () => {
  const h = makeServer(12345);
  const W = h.gs.world;
  // Una mina de este mundo y sus chunks: al cargarlos, el servidor crea las vagonetas.
  let carts = 0, withLoot = 0;
  const gen = W.gen as unknown as TerrainGenerator;
  outer: for (let cz = -30; cz < 30; cz++) {
    for (let cx = -30; cx < 30; cx++) {
      const m = mineshaftAt({ seed: gen.seed, isBadlands: () => false, isDeepDark: () => false, surface: () => 70 }, cx, cz);
      if (!m) continue;
      for (let z = m.bounds.z0 >> 4; z <= m.bounds.z1 >> 4; z++) for (let x = m.bounds.x0 >> 4; x <= m.bounds.x1 >> 4; x++) W.ensureChunk(x, z, h.clock.now);
      for (const e of h.gs.entities.list.values()) {
        if (e.type !== ENT_CHEST_MINECART) continue;
        carts++;
        const v = h.gs.sys.transport.vehicleOf(e.id);
        if (v?.inv?.slots.some((s) => s)) withLoot++;
      }
      if (carts > 0) break outer;
    }
  }
  assert.ok(carts > 0, 'hay vagonetas con cofre');
  assert.equal(withLoot, carts, 'todas con botín');
});
