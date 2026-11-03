// Alcance de los ataques a distancia en 3D (distanceToSqr de Java), no sólo en horizontal: un creeper no se hincha
// ni una bruja lanza pociones contra un jugador 10 bloques por encima.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, AIR } from '../src/shared/blocks';
import { MOB_CREEPER, MOB_WITCH, ENT_THROWN } from '../src/shared/mobs';
import { makeServer } from './harness';

test('alcance en 3D: creeper y bruja no atacan a quien está 10 bloques más arriba; de cerca, sí', () => {
  const h = makeServer(1010);
  const W = h.gs.world;
  const c = h.join('ana');
  c.pos(8.5, 111, 8.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 99; y < 125; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  W.setBlock(8, 109, 8, STONE); // el jugador, de pie sobre un bloque 10 más arriba
  const ents = h.gs.entities;
  const creeper = ents.spawnMob(MOB_CREEPER, 8.5, 100, 8.5)!;
  const witch = ents.spawnMob(MOB_WITCH, 10.5, 100, 8.5)!;
  c.pos(8.5, 110, 8.5);
  h.tick(100);
  assert.equal(creeper.ai!.fuse, 0, 'el creeper no se hincha con el jugador 10 bloques encima');
  assert.ok(ents.list.has(creeper.id));
  assert.ok(![...ents.list.values()].some((e) => e.type === ENT_THROWN && e.shooter === witch.id), 'la bruja no lanza a 10 de altura');
  // De cerca (a su altura), el creeper sí se hincha (vuelve a su sitio por si se paseó hasta el borde).
  Object.assign(creeper, { x: 8.5, y: 100, z: 8.5, vx: 0, vy: 0, vz: 0 });
  c.pos(10.5, 100, 8.5);
  h.tick(10);
  assert.ok(creeper.ai!.fuse > 0 || !ents.list.has(creeper.id), 'de cerca, se hincha');
});
