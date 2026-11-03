// La rana (Frog y ShootTongue de Java): tres variedades según el bioma y se come los cubos pequeños; el de magma
// suelta una luz de rana de su color y el slime, una bola de slime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STONE, AIR, OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT, BLOCK_EMISSION } from '../src/shared/blocks';
import { MOB_FROG, MOB_SLIME_SMALL, frogVariantFor, FROG_TEMPERATE, FROG_WARM, FROG_COLD } from '../src/shared/mobs';
import { MOB_MAGMA_CUBE_SMALL } from '../src/shared/netherMobs';
import { BIOME_SWAMP, BIOME_MANGROVE_SWAMP, BIOME_SNOWY_PLAINS, BIOME_THE_END } from '../src/shared/world/biomeIds';
import { SLIME_BALL } from '../src/shared/items';
import { makeServer } from './harness';

test('ranas: variedad por bioma y se comen los cubos pequeños (luz de rana o bola de slime)', () => {
  assert.equal(frogVariantFor(BIOME_SWAMP), FROG_TEMPERATE);
  assert.equal(frogVariantFor(BIOME_MANGROVE_SWAMP), FROG_WARM);
  assert.equal(frogVariantFor(BIOME_SNOWY_PLAINS), FROG_COLD);
  assert.equal(frogVariantFor(BIOME_THE_END), FROG_COLD);
  assert.ok([OCHRE_FROGLIGHT, VERDANT_FROGLIGHT, PEARLESCENT_FROGLIGHT].every((b) => BLOCK_EMISSION[b] === 15));
  const h = makeServer(3737);
  const W = h.gs.world;
  const c = h.join('ana', 'c');
  c.pos(8.5, 101, 8.5);
  h.tick(5);
  W.ensureChunk(0, 0, h.clock.now);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let y = 99; y < 106; y++) W.setBlock(x, y, z, y === 99 ? STONE : AIR);
  const E = h.gs.entities;
  const eat = (preyType: number): number | undefined => {
    for (const e of [...E.list.values()]) if (e.stack) E.remove(e.id);
    const frog = E.spawnMob(MOB_FROG, 4.5, 100, 8.5)!;
    frog.variant = FROG_TEMPERATE;
    const prey = E.spawnMob(preyType, 7.5, 100, 8.5)!;
    for (let i = 0; i < 400 && E.list.has(prey.id); i++) h.tick(1);
    assert.ok(!E.list.has(prey.id), 'se lo come');
    E.remove(frog.id);
    return [...E.list.values()].find((e) => e.stack)?.stack?.id;
  };
  assert.equal(eat(MOB_MAGMA_CUBE_SMALL), OCHRE_FROGLIGHT, 'la templada deja la ocre');
  assert.equal(eat(MOB_SLIME_SMALL), SLIME_BALL, 'el slime, una bola de slime');
});
