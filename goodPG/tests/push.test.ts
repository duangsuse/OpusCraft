// Empuje entre el jugador y las criaturas (Entity.push de Java): el jugador aparta a las criaturas con las que se
// solapa (en el servidor) y ellas a él (en el cliente); el shulker y el murciélago no se empujan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, AIR } from '../src/shared/blocks';
import { MOB_COW, MOB_SHULKER } from '../src/shared/mobs';
import { pushStep, isPushableMob, PUSH_STEP } from '../src/shared/push';
import { MOB_BAT } from '../src/shared/critters';
import { makeServer } from './harness';

test('empujar criaturas: el jugador aparta a la vaca con la que se solapa; al shulker, no', () => {
  // La fórmula de Java: 0,05 por tick a un bloque o más; más cerca, √d · 0,05; en el mismo sitio, nada.
  assert.deepEqual(pushStep(0, 0, 1, 0)?.map((v) => +v.toFixed(4)), [PUSH_STEP, 0]);
  assert.deepEqual(pushStep(0, 0, 0.25, 0)?.map((v) => +v.toFixed(4)), [0.025, 0]);
  assert.equal(pushStep(0, 0, 0, 0.005), null);
  assert.ok(isPushableMob(MOB_COW) && !isPushableMob(MOB_SHULKER) && !isPushableMob(MOB_BAT));
  const h = makeServer(4242);
  const W = h.gs.world;
  const c = h.join('ana');
  c.pos(8.5, 101, 8.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 99; y < 104; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  const cow = h.gs.entities.spawnMob(MOB_COW, 8.5, 100, 8.5)!;
  cow.ai!.think = 1e9; // quieta (sin pasear)
  const sh = h.gs.entities.spawnMob(MOB_SHULKER, 6.5, 100, 8.5)!;
  c.pos(8.2, 100, 8.5);
  c.pos(6.3, 100, 8.5); // (el último vale: primero, junto a la vaca)
  c.pos(8.2, 100, 8.5);
  h.tick(20);
  assert.ok(cow.x > 8.7, `la vaca se aparta (x = ${cow.x.toFixed(2)})`);
  assert.equal(sh.x, 6.5, 'el shulker no se mueve');
});
