// Límites del motor que el contenido no debe pasar: capas de textura (10 bits en el vértice de los
// chunks) e ids de bloque (tablas de MAX_BLOCK_ID y 16 bits en el guardado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { BLOCK_COUNT, BLOCK_TEX } from '../src/shared/blocks';
import { MAX_BLOCK_ID } from '../src/shared/constants';

test('texturas: caben en los 10 bits de capa del vértice (1024)', () => {
  assert.ok(TEXTURE_DEFS.length <= 1024, `${TEXTURE_DEFS.length} texturas`);
  let max = 0;
  for (let i = 0; i < BLOCK_TEX.length; i++) max = Math.max(max, BLOCK_TEX[i]);
  assert.ok(max < 1024, `capa más alta ${max}`);
});

test('bloques: los ids caben en las tablas y en 16 bits', () => {
  assert.ok(BLOCK_COUNT <= MAX_BLOCK_ID, `${BLOCK_COUNT} ids de ${MAX_BLOCK_ID}`);
  assert.ok(MAX_BLOCK_ID <= 65536);
});
