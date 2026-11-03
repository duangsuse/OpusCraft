// Auditoría de la redstone: lo que depende del orden de Java se comprueba contra Java de verdad. Las referencias
// (tests/fixtures/javaHashOrder.json) las genera tools/JavaHashOrder.java con el hashCode de BlockPos de Minecraft.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashSetOrder, javaHashMapOrder, javaPosHash } from '../src/shared/redstone/wire';
import { STONE, AIR, COBBLESTONE, REDSTONE_BLOCK, STICKY_PISTON, PISTON, facingState, pistonExtended } from '../src/shared/blocks';
import { EAST } from '../src/shared/redstone/api';
import { makeServer } from './harness';

const ref = JSON.parse(readFileSync(new URL('./fixtures/javaHashOrder.json', import.meta.url), 'utf8')) as {
  sets: [number, number, number, number[]][];
  maps: [number[], number[], number][];
};

test('polvo: avisa a sus vecinos en el orden del HashSet<BlockPos> de Java', () => {
  assert.equal(javaPosHash(1, 2, 3), (2 + 3 * 31) * 31 + 1);
  assert.equal(javaPosHash(-1_000_000, 300, 999_999), ((300 + Math.imul(999_999, 31)) * 31 - 1_000_000) | 0, 'con desbordamiento de 32 bits');
  for (const [x, y, z, order] of ref.sets) assert.deepEqual(hashSetOrder(x, y, z, []), order, `en ${x}, ${y}, ${z}`);
});

test('pistón: vacía las celdas en el orden del HashMap<BlockPos> de Java', () => {
  for (const [inserted, keys, len] of ref.maps) {
    const cells: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < inserted.length; i += 3) cells.push({ x: inserted[i], y: inserted[i + 1], z: inserted[i + 2] });
    // Quedan la primera de la fila y las sueltas (las demás de la fila se quitaron).
    const left = cells.filter((_, i) => i === 0 || i >= len);
    assert.deepEqual(javaHashMapOrder(left).flatMap((c) => [c.x, c.y, c.z]), keys);
  }
});

// ------------------------------------------------------------------ comportamientos técnicos de Java


/** Solar despejado en y = 160 (como el de las demás pruebas de redstone). */
function lab() {
  const h = makeServer(4242);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -12; dx <= 12; dx++) {
    for (let dz = -12; dz <= 12; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return { h, bx, by, bz, set: (x: number, y: number, z: number, id: number) => void W.setBlock(x, y, z, id), get: (x: number, y: number, z: number) => W.getBlock(x, y, z) };
}

test('pistón adhesivo: con un pulso de 1 o 2 ticks escupe el bloque; con 3, tira de él (retracción instantánea de Java)', () => {
  const { h, bx, by, bz, set, get } = lab();
  for (const [k, pulse] of [[0, 1], [1, 2], [2, 3]] as const) {
    const x = bx - 8, z = bz - 8 + k * 3;
    set(x, by, z, facingState(STICKY_PISTON, EAST));
    set(x + 1, by, z, COBBLESTONE);
    h.tick(2);
    set(x, by, z - 1, REDSTONE_BLOCK);
    h.tick(pulse);
    set(x, by, z - 1, AIR);
    h.tick(6);
    assert.ok(!pistonExtended(get(x, by, z)), `recogido (${pulse} ticks)`);
    if (pulse < 3) assert.equal(get(x + 2, by, z), COBBLESTONE, `pulso de ${pulse}: lo escupe`);
    else assert.equal(get(x + 1, by, z), COBBLESTONE, 'pulso de 3: tira de él');
  }
});

test('pistón: BUD por cuasi-conectividad (un emisor en diagonal encima no le avisa)', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx, z = bz;
  set(x, by, z, facingState(PISTON, EAST));
  h.tick(2);
  // El bloque de redstone al lado del hueco de encima del pistón le da potencia (cuasi-conectividad), pero
  // no le avisa: en Java no le llega ningún aviso y se queda recogido (antes el motor lo avisaba igual).
  set(x - 1, by + 1, z, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z)), 'cargado pero sin aviso: no se mueve');
  // Cualquier aviso (un bloque puesto al lado) lo despierta.
  set(x, by, z + 1, STONE);
  h.tick(4);
  assert.ok(pistonExtended(get(x, by, z)), 'con un aviso se extiende');
});
