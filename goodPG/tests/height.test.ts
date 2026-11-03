// Fase 5: el mundo va de y = −64 a 319 (384 de alto, como Minecraft 1.18). Terreno bajo cero,
// lecho de roca abajo del todo, ediciones y posiciones con y negativa, y migración de los mundos
// guardados con la altura antigua.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, BEDROCK, LAVA, DIAMOND_ORE, CHEST, DEEPSLATE, TUFF, DEEPSLATE_ORE } from '../src/shared/blocks';
import { MIN_Y, MAX_Y, WORLD_HEIGHT, CHUNK_VOLUME, blockIndex, indexY } from '../src/shared/constants';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { MemoryStore, BLOCK_FORMAT, encodeChunkEdits, decodeChunkEdits, migrateStore } from '../src/shared/sim/store';
import { WorldSim } from '../src/shared/sim/WorldSim';
import { posKey, keyX, keyY, keyZ } from '../src/shared/sim/posKey';
import { encodeEdits, decodeEdits } from '../src/shared/protocol';
import { Mesher } from '../src/client/world/mesh/mesher';

test('altura: 384 bloques, de −64 a 319', () => {
  assert.equal(WORLD_HEIGHT, 384);
  assert.equal(CHUNK_VOLUME, 16 * 16 * 384);
  assert.equal(blockIndex(0, MIN_Y, 0), 0);
  assert.equal(blockIndex(15, MAX_Y - 1, 15), CHUNK_VOLUME - 1);
  for (const y of [MIN_Y, -1, 0, 63, MAX_Y - 1]) assert.equal(indexY(blockIndex(7, y, 9)), y);
  for (const [x, y, z] of [[0, MIN_Y, 0], [-5, -1, 12], [100000, MAX_Y - 1, -99999]]) {
    const k = posKey(x, y, z);
    assert.deepEqual([keyX(k), keyY(k), keyZ(k)], [x, y, z]);
  }
});

test('terreno: piedra bajo cero, lecho de roca en −64, lava y diamantes en lo hondo', () => {
  const gen = new TerrainGenerator(12345);
  let stoneBelow = 0, total = 0, lava = 0, diamonds = 0, bedrockTop = 0;
  for (let cz = -2; cz <= 2; cz++) {
    for (let cx = -2; cx <= 2; cx++) {
      const { blocks, heights } = gen.generate(cx, cz);
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++) {
          assert.equal(blocks[blockIndex(x, MIN_Y, z)], BEDROCK, 'lecho de roca en y = −64');
          assert.ok(heights[z * 16 + x] > 0, 'la superficie sigue por encima de 0');
          if (blocks[blockIndex(x, MIN_Y + 4, z)] === BEDROCK) bedrockTop++;
          for (let y = MIN_Y + 5; y < 0; y++) {
            const b = blocks[blockIndex(x, y, z)];
            total++;
            if (b === STONE || b === DEEPSLATE || b === TUFF) stoneBelow++;
            if (b === LAVA) lava++;
            if (b === DIAMOND_ORE || b === DEEPSLATE_ORE[DIAMOND_ORE]) diamonds++;
            // Como en Java: la lava de las cuevas es la del fondo (por debajo de y = −54) o la de los acuíferos de lava,
            // que sólo tienen su nivel por debajo de y = −10.
            if (b === LAVA) assert.ok(y < -10, `lava sólo en lo hondo (y = ${y})`);
          }
        }
      }
    }
  }
  assert.equal(bedrockTop, 0, 'el lecho de roca sólo salpica de −63 a −61');
  assert.ok(stoneBelow / total > 0.7, `bajo cero casi todo es piedra (${(stoneBelow / total).toFixed(2)})`);
  assert.ok(lava > 0, 'hay lagos de lava en las cuevas hondas');
  assert.ok(diamonds > 0, 'hay diamantes bajo cero');
});

test('servidor: editar bajo cero, guardarlo y enviarlo', () => {
  const store = new MemoryStore();
  const w = new WorldSim(1, store);
  w.ensureChunk(0, 0);
  assert.equal(w.getBlock(3, MIN_Y - 1, 3), -1, 'por debajo del mundo no hay nada');
  assert.equal(w.getBlock(3, MAX_Y, 3), AIR);
  assert.notEqual(w.setBlock(3, -40, 4, CHEST), -1);
  assert.notEqual(w.setBlock(5, MAX_Y - 1, 6, STONE), -1);
  assert.equal(w.setBlock(3, MIN_Y - 1, 4, STONE), -1);
  assert.equal(w.skyTop(5, 6), MAX_Y - 1);
  w.flush();
  const again = new WorldSim(1, store);
  again.ensureChunk(0, 0);
  assert.equal(again.getBlock(3, -40, 4), CHEST, 'la edición bajo cero se guarda');
  const edits = again.allEdits();
  assert.deepEqual(decodeEdits(encodeEdits(edits)), edits, 'viaja con la y negativa');
  assert.ok(edits.some((e) => e[1] === -40) && edits.some((e) => e[1] === MAX_Y - 1));
  const m = new Map([[blockIndex(15, MAX_Y - 1, 15), 4000], [0, 7]]);
  assert.deepEqual(decodeChunkEdits(encodeChunkEdits(m)), m);
});

test('mundos guardados con 256 de alto: las ediciones y los cofres bajan 64 filas de índice', () => {
  const store = new MemoryStore();
  store.setMeta('blockFormat', '2');
  // Formato 2: [u16 índice][u16 bloque] con la fila 0 en y = 0.
  const idx = (70 << 8) | (2 << 4) | 1;
  store.chunks.set('0,0', new Uint8Array([idx & 255, idx >> 8, CHEST & 255, CHEST >> 8]));
  // Contenedor guardado con la clave antigua (y en 8 bits).
  const oldKey = ((5 + (1 << 20)) * (1 << 21) + (-7 + (1 << 20))) * 256 + 70;
  store.containers.set(oldKey, '{"k":"c"}');
  assert.equal(migrateStore(store), 1);
  assert.equal(store.getMeta('blockFormat'), BLOCK_FORMAT);
  const m = decodeChunkEdits(store.chunks.get('0,0')!);
  assert.equal(m.get(blockIndex(1, 70, 2)), CHEST, 'la edición sigue en y = 70');
  const [[k, data]] = [...store.containers];
  assert.deepEqual([keyX(k), keyY(k), keyZ(k), data], [5, 70, -7, '{"k":"c"}']);
  assert.equal(migrateStore(store), 0, 'una sola vez');
});

test('mallado: bloques en el fondo y en el techo del mundo', () => {
  const mesher = new Mesher();
  const cols = Array.from({ length: 9 }, () => new Uint16Array(CHUNK_VOLUME));
  cols[4][blockIndex(8, MIN_Y + 1, 8)] = STONE;
  cols[4][blockIndex(8, MAX_Y - 1, 8)] = STONE;
  const r = mesher.mesh(cols, 0, 0);
  assert.equal(r.minY, MIN_Y + 1);
  assert.equal(r.maxY, MAX_Y);
  assert.equal(r.opaque.length / 8, 12, 'dos cubos sueltos: 12 caras');
  assert.equal(r.light.length, CHUNK_VOLUME);
  assert.equal(r.light[blockIndex(8, MAX_Y - 2, 8)] >> 4, 14, 'bajo el bloque del techo llega luz del cielo difusa');
});
