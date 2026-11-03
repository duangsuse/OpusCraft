// Fase 6.5 (maderas): mangle, roble pálido y bambú con todas sus formas; troncos sin corteza y leños
// de todas las maderas (recetas, combustible, descortezar con el hacha); el bambú que crece y se cae
// entero; propágulos que dan mangles; y que el mundo genere mangles en los pantanos y bambú en la jungla.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, DIRT, GRASS, OAK_LOG, OAK_PLANKS, SPRUCE_LOG, WOOD_TYPES, SLABS, STAIRS, FENCES, FENCE_GATES, DOORS,
  TRAPDOORS, SIGNS, BLOCKS, INVENTORY_ORDER, MANGROVE_LOG, MANGROVE_PLANKS, MANGROVE_LEAVES, MANGROVE_PROPAGULE,
  MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS, HANGING_PROPAGULE, PALE_OAK_LOG, PALE_OAK_PLANKS, PALE_OAK_SAPLING, BAMBOO,
  BAMBOO_BLOCK, STRIPPED_BAMBOO_BLOCK, BAMBOO_PLANKS, BAMBOO_MOSAIC, WOOD_EXTRAS, woodExtras, strippedOf, isBamboo,
  bambooWithLeaves, BAMBOO_LARGE_LEAVES, BAMBOO_SMALL_LEAVES, BAMBOO_NO_LEAVES, horizontalLog, uprightLog, AXIS_X, AXIS_Z,
  isLog, woodOf, blockSupported, ALL_PLANKS, CRAFTING_TABLE,
} from '../src/shared/blocks';
import { ITEMS, STICK, CHARCOAL, TOOLS, BREED_FOOD, PLACEABLE_BLOCKS } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement } from '../src/shared/placement';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { TerrainGenerator, BIOME_SWAMP, BIOME_JUNGLE } from '../src/shared/world/terrain';
import { isMangroveArea } from '../src/shared/world/woodTrees';
import { bambooMaxHeight } from '../src/shared/sim/server/bamboo';
import { CHUNK_VOLUME } from '../src/shared/constants';
import { ENT_ITEM } from '../src/shared/mobs';
import { makeServer, type Harness, type Client } from './harness';

test('maderas nuevas: familias completas, nombres y texturas', () => {
  assert.deepEqual(WOOD_TYPES.slice(7).map((w) => w.key), ['mangrove', 'pale_oak']);
  for (const key of ['mangrove', 'pale_oak', 'bamboo']) {
    for (const fam of [SLABS, STAIRS, FENCES, FENCE_GATES, DOORS, TRAPDOORS, SIGNS]) assert.ok(fam[key] > 0, `forma de ${key}`);
    assert.ok(INVENTORY_ORDER.includes(DOORS[key]) && INVENTORY_ORDER.includes(SIGNS[key]), `${key} en el creativo`);
  }
  assert.ok(SLABS.bamboo_mosaic > 0 && STAIRS.bamboo_mosaic > 0, 'losa y escaleras de mosaico de bambú');
  assert.equal(BLOCKS[MANGROVE_LOG].name, 'Tronco de mangle');
  assert.equal(BLOCKS[MANGROVE_PROPAGULE].name, 'Propágulo de mangle');
  assert.equal(BLOCKS[PALE_OAK_PLANKS].name, 'Tablones de roble pálido');
  assert.equal(BLOCKS[woodExtras('oak')!.strippedLog].name, 'Tronco de roble sin corteza');
  assert.equal(BLOCKS[woodExtras('oak')!.woodBlock].name, 'Leño de roble');
  assert.equal(BLOCKS[woodExtras('cherry')!.strippedWood].name, 'Leño de cerezo sin corteza');
  assert.equal(BLOCKS[STRIPPED_BAMBOO_BLOCK].name, 'Bloque de bambú sin piel');
  assert.equal(BLOCKS[SLABS.bamboo_mosaic].name, 'Losa de mosaico de bambú');
  for (const id of [MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS, BAMBOO, BAMBOO_BLOCK, BAMBOO_PLANKS, BAMBOO_MOSAIC, ...WOOD_EXTRAS.map((e) => e.strippedWood)]) {
    assert.ok(INVENTORY_ORDER.includes(id), `en el creativo: ${BLOCKS[id].name}`);
    assert.ok(ITEMS[id] && PLACEABLE_BLOCKS.has(id), `objeto que se coloca: ${BLOCKS[id].name}`);
  }
  assert.equal(ITEMS[HANGING_PROPAGULE], undefined, 'el propágulo colgando no es un objeto');
  assert.equal(new Set(INVENTORY_ORDER).size, INVENTORY_ORDER.length, 'sin repetidos en el creativo');
  assert.equal(WOOD_EXTRAS.length, 9, 'sin corteza y leños para las nueve maderas');
  assert.ok(TEXTURE_DEFS.length <= 1024);
  const mine = TEXTURE_DEFS.filter((t) => /mangrove|pale_oak|bamboo|stripped_/.test(t.name)).length;
  assert.ok(mine <= 80, `${mine} texturas nuevas (presupuesto de ~80)`);
});

test('recetas y combustible de las maderas', () => {
  const r = (grid: number[], size = 2) => matchRecipe(grid, size)?.out;
  assert.deepEqual(r([MANGROVE_LOG, 0, 0, 0]), { id: MANGROVE_PLANKS, count: 4 });
  assert.deepEqual(r([PALE_OAK_LOG, 0, 0, 0]), { id: PALE_OAK_PLANKS, count: 4 });
  const oak = woodExtras('oak')!;
  for (const id of [oak.strippedLog, oak.woodBlock, oak.strippedWood]) assert.deepEqual(r([id, 0, 0, 0]), { id: OAK_PLANKS, count: 4 });
  assert.deepEqual(r([OAK_LOG, OAK_LOG, OAK_LOG, OAK_LOG]), { id: oak.woodBlock, count: 3 }, '4 troncos → 3 leños');
  const s = oak.strippedLog;
  assert.deepEqual(r([s, s, s, s]), { id: oak.strippedWood, count: 3 });
  // Bambú.
  assert.deepEqual(r(Array(9).fill(BAMBOO), 3), { id: BAMBOO_BLOCK, count: 1 });
  assert.deepEqual(r([BAMBOO_BLOCK, 0, 0, 0]), { id: BAMBOO_PLANKS, count: 2 });
  assert.deepEqual(r([STRIPPED_BAMBOO_BLOCK, 0, 0, 0]), { id: BAMBOO_PLANKS, count: 2 });
  assert.deepEqual(r([BAMBOO, 0, BAMBOO, 0]), { id: STICK, count: 1 }, 'dos bambúes → un palo');
  assert.deepEqual(r([SLABS.bamboo, 0, SLABS.bamboo, 0]), { id: BAMBOO_MOSAIC, count: 1 });
  const P = BAMBOO_PLANKS;
  assert.equal(r([P, 0, P, 0])?.id, STICK, 'palos con tablones de bambú');
  assert.equal(r([P, P, P, P])?.id, CRAFTING_TABLE);
  assert.equal(r([P, P, P, P, P, P, 0, STICK, 0], 3)?.id, SIGNS.bamboo);
  assert.equal(r([P, P, 0, P, P, 0, P, P, 0], 3)?.id, DOORS.bamboo);
  assert.equal(r([BAMBOO_MOSAIC, BAMBOO_MOSAIC, BAMBOO_MOSAIC, 0, 0, 0, 0, 0, 0], 3)?.id, SLABS.bamboo_mosaic);
  const M = MANGROVE_PLANKS;
  assert.equal(r([M, M, M, M, M, M, 0, STICK, 0], 3)?.id, SIGNS.mangrove);
  assert.ok(ALL_PLANKS.includes(BAMBOO_PLANKS));
  // Combustible y carbón vegetal.
  assert.equal(ITEMS[BAMBOO].fuel, 2.5);
  for (const id of [oak.strippedLog, oak.woodBlock, BAMBOO_BLOCK, BAMBOO_PLANKS, MANGROVE_LOG, FENCES.bamboo, STAIRS.bamboo_mosaic]) {
    assert.equal(ITEMS[id].fuel, 15, `arde 15 s: ${BLOCKS[id].name}`);
  }
  assert.equal(ITEMS[SLABS.pale_oak].fuel, 7.5);
  assert.equal(ITEMS[woodExtras('mangrove')!.strippedLog].smelt, CHARCOAL);
  assert.equal(ITEMS[BAMBOO_BLOCK].smelt, undefined, 'el bloque de bambú no da carbón vegetal');
});

test('descortezar: tronco, tronco tumbado, leño y bambú', () => {
  const oak = woodExtras('oak')!;
  assert.equal(strippedOf(OAK_LOG), oak.strippedLog);
  assert.equal(strippedOf(oak.woodBlock), oak.strippedWood);
  assert.equal(strippedOf(oak.strippedLog), 0, 'lo descortezado se queda igual');
  assert.equal(strippedOf(OAK_PLANKS), 0);
  assert.equal(strippedOf(BAMBOO_BLOCK), STRIPPED_BAMBOO_BLOCK);
  for (const axis of [AXIS_X, AXIS_Z]) {
    const s = strippedOf(horizontalLog(SPRUCE_LOG, axis));
    assert.equal(s, horizontalLog(woodExtras('spruce')!.strippedLog, axis), 'mantiene el eje');
    assert.equal(uprightLog(s), woodExtras('spruce')!.strippedLog, 'y suelta el tronco sin corteza');
    assert.equal(strippedOf(horizontalLog(BAMBOO_BLOCK, axis)), horizontalLog(STRIPPED_BAMBOO_BLOCK, axis));
    assert.notEqual(horizontalLog(MANGROVE_LOG, axis), MANGROVE_LOG, 'el mangle también se tumba');
  }
  assert.ok(isLog(oak.strippedLog) && isLog(oak.woodBlock) && woodOf(oak.strippedWood)?.key === 'oak');
  // Colocar un tronco sin corteza contra un lado: tumbado.
  const get = (x: number, y: number, z: number) => (x === 0 && y === 5 && z === 0 ? STONE : AIR);
  const hit = { x: 0, y: 5, z: 0, nx: 1, ny: 0, nz: 0, px: 1, py: 5.5, pz: 0.5, id: STONE };
  assert.deepEqual(planPlacement(get, hit, oak.strippedLog, 0), [[1, 5, 0, horizontalLog(oak.strippedLog, AXIS_X)]]);
});

/** Plataforma de tierra a y = 149 con un jugador encima. */
function platform(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6565);
  const c = h.join('Leñadora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, GRASS);
  }
  c.pos(bx, by, bz);
  h.tick(2);
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: el hacha descorteza con clic derecho (la mano, no)', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  W.setBlock(bx + 1, by, bz, OAK_LOG);
  W.setBlock(bx + 2, by, bz, horizontalLog(MANGROVE_LOG, AXIS_Z));
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0, item: STICK });
  assert.equal(W.getBlock(bx + 1, by, bz), OAK_LOG, 'con un palo no pasa nada');
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0, item: TOOLS.stone.axe });
  assert.equal(W.getBlock(bx + 1, by, bz), woodExtras('oak')!.strippedLog);
  c.send({ t: 'use', x: bx + 2, y: by, z: bz, yaw: 0, item: TOOLS.iron.axe });
  assert.equal(W.getBlock(bx + 2, by, bz), horizontalLog(woodExtras('mangrove')!.strippedLog, AXIS_Z));
});

test('bambú: se apoya en el suelo, crece con hojas arriba y se cae entero', () => {
  const { h, bx, by, bz } = platform();
  const W = h.gs.world;
  const rel = (x: number, y: number, z: number) => (dx: number, dy: number, dz: number) => W.getBlock(x + dx, y + dy, z + dz);
  assert.ok(blockSupported(BAMBOO, rel(bx, by, bz)), 'sobre la hierba');
  W.setBlock(bx + 1, by - 1, bz, OAK_PLANKS);
  assert.ok(!blockSupported(BAMBOO, rel(bx + 1, by, bz)), 'sobre tablones, no');
  W.setBlock(bx, by, bz, BAMBOO);
  const bamboo = h.gs.sys.bamboo;
  let n = 1;
  while (bamboo.grow(bx, by, bz)) n++;
  assert.equal(n, bambooMaxHeight(bx, bz), 'crece hasta su altura máxima');
  const top = by + n - 1;
  assert.equal(W.getBlock(bx, top, bz), bambooWithLeaves(BAMBOO_LARGE_LEAVES));
  assert.equal(W.getBlock(bx, top - 1, bz), bambooWithLeaves(BAMBOO_LARGE_LEAVES));
  assert.equal(W.getBlock(bx, top - 2, bz), bambooWithLeaves(BAMBOO_SMALL_LEAVES));
  assert.equal(W.getBlock(bx, top - 3, bz), bambooWithLeaves(BAMBOO_NO_LEAVES));
  // Al romper el de abajo, se cae todo y suelta un bambú por tallo.
  c0(h);
  W.setBlock(bx, by, bz, AIR);
  h.tick(2);
  for (let y = by; y <= top; y++) assert.ok(!isBamboo(W.getBlock(bx, y, bz)), 'no queda ningún tallo');
  assert.equal(itemsOf(h, BAMBOO), n - 1, 'los de encima sueltan su bambú');
  assert.deepEqual(blockDrops(bambooWithLeaves(BAMBOO_LARGE_LEAVES), 0), [{ id: BAMBOO, count: 1 }]);
  assert.ok(BREED_FOOD.panda.includes(BAMBOO), 'los pandas comen bambú');
});

/** Quita los objetos sueltos. */
function c0(h: Harness): void {
  for (const e of [...h.gs.entities.list.values()]) if (e.type === ENT_ITEM) h.gs.entities.list.delete(e.id);
}

test('brotes: el propágulo da un mangle con raíces y el roble pálido crece', () => {
  const h = makeServer(4242);
  const W = h.gs.world;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nature = h.gs.sys.nature;
  W.ensureChunk(0, 0);
  W.setBlock(4, 200, 4, DIRT);
  W.setBlock(4, 201, 4, MANGROVE_PROPAGULE);
  nature.growTree(4, 201, 4, WOOD_TYPES.findIndex((w) => w.key === 'mangrove'));
  assert.equal(W.getBlock(4, 201, 4), MUDDY_MANGROVE_ROOTS, 'raíces lodosas al pie');
  assert.equal(W.getBlock(4, 202, 4), MANGROVE_ROOTS, 'el tronco se levanta sobre raíces');
  let logs = 0, leaves = 0;
  for (let y = 201; y < 215; y++) for (let x = 0; x <= 8; x++) for (let z = 0; z <= 8; z++) {
    const b = W.getBlock(x, y, z);
    if (b === MANGROVE_LOG) logs++;
    if (b === MANGROVE_LEAVES) leaves++;
  }
  assert.ok(logs >= 4 && leaves > 20, `mangle: ${logs} troncos, ${leaves} hojas`);
  W.setBlock(12, 200, 12, DIRT);
  W.setBlock(12, 201, 12, PALE_OAK_SAPLING);
  nature.growTree(12, 201, 12, WOOD_TYPES.findIndex((w) => w.key === 'pale_oak'));
  assert.equal(W.getBlock(12, 202, 12), PALE_OAK_LOG);
  // Las hojas de mangle sueltan a veces el propágulo; el que cuelga, siempre.
  assert.ok(blockDrops(MANGROVE_LEAVES, 0, () => 0).some((s) => s.id === MANGROVE_PROPAGULE));
  assert.deepEqual(blockDrops(HANGING_PROPAGULE, 0), [{ id: MANGROVE_PROPAGULE, count: 1 }]);
});

test('mundo: mangles en los pantanos de manglar y bambú en la jungla', () => {
  const gen = new TerrainGenerator(12345);
  const count = (cx: number, cz: number, ids: number[]) => {
    const { blocks } = gen.generate(cx, cz);
    let n = 0;
    for (let i = 0; i < CHUNK_VOLUME; i++) if (ids.includes(blocks[i])) n++;
    return n;
  };
  const find = (ok: (x: number, z: number) => boolean): [number, number] | null => {
    for (let r = 0; r <= 160; r += 2) {
      for (let k = -r; k <= r; k += 2) {
        for (const [cx, cz] of [[k, -r], [k, r], [-r, k], [r, k]]) if (ok(cx * 16 + 8, cz * 16 + 8)) return [cx, cz];
      }
    }
    return null;
  };
  // Un chunk de manglar: mira varios hasta dar con árboles (no todos los chunks tienen).
  let mangroves = 0, roots = 0, tries = 0;
  for (let r = 0; r <= 160 && tries < 40 && mangroves === 0; r += 2) {
    for (let k = -r; k <= r && tries < 40 && mangroves === 0; k += 2) {
      for (const [cx, cz] of [[k, -r], [k, r], [-r, k], [r, k]]) {
        const x = cx * 16 + 8, z = cz * 16 + 8;
        if (gen.biomeAt(x, z) !== BIOME_SWAMP || !isMangroveArea(12345, x, z)) continue;
        tries++;
        mangroves += count(cx, cz, [MANGROVE_LOG, MANGROVE_LEAVES]);
        roots += count(cx, cz, [MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS]);
        if (mangroves) break;
      }
    }
  }
  assert.ok(mangroves > 0 && roots > 0, `mangles con raíces (${mangroves} troncos/hojas, ${roots} raíces)`);
  const jungle = find((x, z) => gen.biomeAt(x, z) === BIOME_JUNGLE);
  assert.ok(jungle, 'hay jungla');
  let bamboo = 0;
  for (let dz = -3; dz <= 3 && bamboo === 0; dz++) {
    for (let dx = -3; dx <= 3 && bamboo === 0; dx++) bamboo += count(jungle![0] + dx, jungle![1] + dz, [BAMBOO, BAMBOO + 1, BAMBOO + 2]);
  }
  assert.ok(bamboo > 0, 'bambú en la jungla');
});
