// Fase 6.5 (piedras): piedras del mundo normal y sus formas. Bloques, texturas, recetas de mesa,
// cortapiedras y horno, botín, colisión del barro y dónde salen el barro y las cuevas de azufre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BLOCKS, INVENTORY_ORDER, SLABS, STAIRS, WALLS, WALL_SOURCE, MATERIALS, STONE, COBBLESTONE, STONE_BRICKS, SANDSTONE,
  RED_SANDSTONE, GRANITE, DIORITE, ANDESITE, DEEPSLATE, COBBLED_DEEPSLATE, TUFF, MOSS_BLOCK, VINE, MOSSY_COBBLESTONE,
  MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, CUT_SANDSTONE, CHISELED_SANDSTONE, SMOOTH_STONE, CHISELED_STONE_BRICKS,
  POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE, POLISHED_DEEPSLATE, DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS,
  DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES, CHISELED_DEEPSLATE, POLISHED_TUFF, TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS,
  SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE, CUT_RED_SANDSTONE, CHISELED_RED_SANDSTONE, MUD, PACKED_MUD, MUD_BRICKS, CINNABAR,
  POLISHED_CINNABAR, CINNABAR_BRICKS, CHISELED_CINNABAR, SULFUR, POLISHED_SULFUR, SULFUR_BRICKS, CHISELED_SULFUR,
  STONE_INVENTORY, BLOCK_TEX, blockCollisionBoxes, isSlab, isStairs, isWall, stateOf,
} from '../src/shared/blocks';
import { ITEMS, TOOLS, WHEAT } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { smeltXp } from '../src/shared/experience';
import { blockDrops } from '../src/shared/sim/drops';
import { TEXTURE_DEFS, textureLayer } from '../src/shared/textureDefs';
import { STONES_GENERATORS } from '../src/client/textures/genStones';
import { Tex } from '../src/client/textures/texCore';
import { TerrainGenerator, BIOME_SWAMP } from '../src/shared/world/terrain';
import { sulfurZoneAt, SULFUR_MIN_Y, SULFUR_MAX_Y } from '../src/shared/world/stones';
import { blockIndex } from '../src/shared/constants';

const NEW_BLOCKS = [
  SMOOTH_STONE, CHISELED_STONE_BRICKS, POLISHED_GRANITE, POLISHED_DIORITE, POLISHED_ANDESITE, POLISHED_DEEPSLATE,
  DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS, DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES, CHISELED_DEEPSLATE, POLISHED_TUFF,
  TUFF_BRICKS, CHISELED_TUFF, CHISELED_TUFF_BRICKS, SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE, CUT_RED_SANDSTONE,
  CHISELED_RED_SANDSTONE, MUD, PACKED_MUD, MUD_BRICKS, CINNABAR, POLISHED_CINNABAR, CINNABAR_BRICKS, CHISELED_CINNABAR,
  SULFUR, POLISHED_SULFUR, SULFUR_BRICKS, CHISELED_SULFUR,
];

/** Losa, escaleras y muro de un material (undefined si no los tiene). */
const shapesOf = (key: string) => [SLABS[key], STAIRS[key], WALLS[key]];

test('piedras: bloques nuevos con nombre, objeto, sitio en el inventario y texturas con generador', () => {
  for (const id of NEW_BLOCKS) {
    const b = BLOCKS[id];
    assert.ok(b && b.name && !/[_]/.test(b.name), `nombre de ${b?.key}`);
    assert.ok(ITEMS[id], `objeto de ${b.key}`);
    assert.ok(INVENTORY_ORDER.includes(id), `${b.key} en el inventario creativo`);
    for (let f = 0; f < 6; f++) assert.ok(BLOCK_TEX[id * 6 + f] > 0, `textura de ${b.key}`);
  }
  assert.equal(new Set(INVENTORY_ORDER).size, INVENTORY_ORDER.length, 'el inventario creativo no repite bloques');
  for (const id of STONE_INVENTORY) assert.ok(ITEMS[id], BLOCKS[id].key);
  // Cada textura nueva tiene su generador procedural y se puede dibujar.
  const first = textureLayer('smooth_stone');
  const mine = TEXTURE_DEFS.slice(first, textureLayer('chiseled_sulfur') + 1).map((d) => d.name);
  assert.equal(mine.length, 31, 'presupuesto: 31 texturas nuevas');
  for (const name of mine) {
    assert.ok(STONES_GENERATORS[name], `generador de ${name}`);
    const t = new Tex(name);
    STONES_GENERATORS[name](t);
    for (let i = 0; i < t.col.length; i++) assert.ok(Number.isFinite(t.col[i]), `${name}: color válido`);
  }
  // La losa de piedra lisa usa su lado propio; la arenisca lisa, la cara de arriba de la arenisca.
  assert.equal(BLOCKS[SLABS.smooth_stone].tex[0], 'smooth_stone_slab_side');
  assert.equal(BLOCKS[SMOOTH_SANDSTONE].tex[0], 'sandstone_top');
});

test('piedras: losas, escaleras y muros como en Minecraft', () => {
  const full = ['mossy_stone_brick', 'polished_deepslate', 'deepslate_brick', 'deepslate_tile', 'tuff', 'polished_tuff',
    'tuff_brick', 'red_sandstone', 'mud_brick', 'cinnabar', 'polished_cinnabar', 'cinnabar_brick', 'sulfur', 'polished_sulfur',
    'sulfur_brick', 'granite', 'diorite', 'andesite', 'mossy_cobblestone', 'cobbled_deepslate'];
  for (const key of full) {
    const [slab, stairs, wall] = shapesOf(key);
    assert.ok(isSlab(slab) && isStairs(stairs) && isWall(wall), `${key}: losa, escaleras y muro`);
    assert.ok(isSlab(stateOf(slab, { type: 2 })), `${key}: losa doble`);
  }
  for (const key of ['polished_granite', 'polished_diorite', 'polished_andesite', 'smooth_sandstone', 'smooth_red_sandstone']) {
    const [slab, stairs, wall] = shapesOf(key);
    assert.ok(isSlab(slab) && isStairs(stairs) && wall === undefined, `${key}: losa y escaleras, sin muro`);
  }
  for (const key of ['smooth_stone', 'cut_sandstone', 'cut_red_sandstone']) {
    const [slab, stairs, wall] = shapesOf(key);
    assert.ok(isSlab(slab) && stairs === undefined && wall === undefined, `${key}: sólo losa`);
  }
  assert.equal(BLOCKS[SLABS.polished_deepslate].name, 'Losa de pizarra profunda pulida');
  assert.equal(BLOCKS[WALLS.mud_brick].name, 'Muro de ladrillos de barro');
  // Los materiales nuevos van al final (no mueven ids guardados).
  assert.ok(MATERIALS.findIndex((m) => m.key === 'granite') > MATERIALS.findIndex((m) => m.key === 'cobbled_deepslate'));
});

test('piedras: recetas de mesa de trabajo', () => {
  const g = (...ids: number[]) => ids;
  const four = (id: number) => g(id, id, 0, id, id, 0, 0, 0, 0);
  const cases: [number[], number, number][] = [
    [four(GRANITE), POLISHED_GRANITE, 4], [four(DIORITE), POLISHED_DIORITE, 4], [four(ANDESITE), POLISHED_ANDESITE, 4],
    [four(COBBLED_DEEPSLATE), POLISHED_DEEPSLATE, 4], [four(POLISHED_DEEPSLATE), DEEPSLATE_BRICKS, 4],
    [four(DEEPSLATE_BRICKS), DEEPSLATE_TILES, 4], [four(TUFF), POLISHED_TUFF, 4], [four(POLISHED_TUFF), TUFF_BRICKS, 4],
    [four(SANDSTONE), CUT_SANDSTONE, 4], [four(RED_SANDSTONE), CUT_RED_SANDSTONE, 4], [four(PACKED_MUD), MUD_BRICKS, 4],
    [four(CINNABAR), POLISHED_CINNABAR, 4], [four(POLISHED_SULFUR), SULFUR_BRICKS, 4],
    [g(SLABS.stone_brick, 0, 0, SLABS.stone_brick, 0, 0, 0, 0, 0), CHISELED_STONE_BRICKS, 1],
    [g(SLABS.cobbled_deepslate, 0, 0, SLABS.cobbled_deepslate, 0, 0, 0, 0, 0), CHISELED_DEEPSLATE, 1],
    [g(SLABS.tuff_brick, 0, 0, SLABS.tuff_brick, 0, 0, 0, 0, 0), CHISELED_TUFF_BRICKS, 1],
    [g(SLABS.sandstone, 0, 0, SLABS.sandstone, 0, 0, 0, 0, 0), CHISELED_SANDSTONE, 1],
    [g(SMOOTH_STONE, SMOOTH_STONE, SMOOTH_STONE, 0, 0, 0, 0, 0, 0), SLABS.smooth_stone, 6],
    [g(GRANITE, GRANITE, GRANITE, 0, 0, 0, 0, 0, 0), SLABS.granite, 6],
    [g(TUFF, 0, 0, TUFF, TUFF, 0, TUFF, TUFF, TUFF), STAIRS.tuff, 4],
    [g(MUD_BRICKS, MUD_BRICKS, MUD_BRICKS, MUD_BRICKS, MUD_BRICKS, MUD_BRICKS, 0, 0, 0), WALLS.mud_brick, 6],
    [g(COBBLED_DEEPSLATE, COBBLED_DEEPSLATE, COBBLED_DEEPSLATE, COBBLED_DEEPSLATE, COBBLED_DEEPSLATE, COBBLED_DEEPSLATE, 0, 0, 0), WALLS.cobbled_deepslate, 6],
    [g(MUD, WHEAT, 0, 0, 0, 0, 0, 0, 0), PACKED_MUD, 1],
    [g(COBBLESTONE, MOSS_BLOCK, 0, 0, 0, 0, 0, 0, 0), MOSSY_COBBLESTONE, 1],
    [g(STONE_BRICKS, VINE, 0, 0, 0, 0, 0, 0, 0), MOSSY_STONE_BRICKS, 1],
    [g(DIORITE, COBBLESTONE, 0, 0, 0, 0, 0, 0, 0), ANDESITE, 2],
  ];
  for (const [grid, id, count] of cases) {
    assert.deepEqual(matchRecipe(grid, 3)?.out, { id, count }, `receta de ${BLOCKS[id].key}`);
  }
  // Las recetas de antes siguen igual.
  assert.equal(matchRecipe(four(STONE), 3)?.out.id, STONE_BRICKS);
});

test('piedras: horno', () => {
  const pairs: [number, number][] = [
    [STONE, SMOOTH_STONE], [STONE_BRICKS, CRACKED_STONE_BRICKS], [DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_BRICKS],
    [DEEPSLATE_TILES, CRACKED_DEEPSLATE_TILES], [SANDSTONE, SMOOTH_SANDSTONE], [RED_SANDSTONE, SMOOTH_RED_SANDSTONE],
    [COBBLESTONE, STONE], [COBBLED_DEEPSLATE, DEEPSLATE],
  ];
  for (const [from, to] of pairs) assert.equal(ITEMS[from].smelt, to, `${BLOCKS[from].key} → ${BLOCKS[to].key}`);
  assert.equal(smeltXp(SMOOTH_STONE, 10, () => 0), 1, '0,1 de experiencia por piedra lisa');
});

test('piedras: cortapiedras', () => {
  const opts = (id: number) => stonecutterOptions(id).map((s) => `${s.id}x${s.count}`);
  const has = (input: number, id: number, count = 1) =>
    assert.ok(opts(input).includes(`${id}x${count}`), `${BLOCKS[input].key} → ${BLOCKS[id]?.key} x${count}`);
  const hasnt = (input: number, id: number) =>
    assert.ok(!stonecutterOptions(input).some((s) => s.id === id), `${BLOCKS[input].key} no da ${BLOCKS[id].key}`);
  has(STONE, CHISELED_STONE_BRICKS);
  has(STONE, COBBLESTONE);
  has(STONE, WALLS.cobblestone);
  has(STONE_BRICKS, CHISELED_STONE_BRICKS);
  has(DEEPSLATE, COBBLED_DEEPSLATE);
  has(DEEPSLATE, SLABS.deepslate_tile, 2);
  has(DEEPSLATE, CHISELED_DEEPSLATE);
  has(COBBLED_DEEPSLATE, WALLS.deepslate_brick);
  has(POLISHED_DEEPSLATE, DEEPSLATE_TILES);
  hasnt(POLISHED_DEEPSLATE, CHISELED_DEEPSLATE);
  hasnt(DEEPSLATE_TILES, DEEPSLATE_BRICKS);
  has(TUFF, CHISELED_TUFF);
  has(TUFF, CHISELED_TUFF_BRICKS);
  has(POLISHED_TUFF, STAIRS.tuff_brick);
  hasnt(POLISHED_TUFF, CHISELED_TUFF);
  has(GRANITE, SLABS.polished_granite, 2);
  has(GRANITE, WALLS.granite);
  has(SANDSTONE, CUT_SANDSTONE);
  has(SANDSTONE, SLABS.cut_sandstone, 2);
  has(RED_SANDSTONE, CHISELED_RED_SANDSTONE);
  has(SMOOTH_STONE, SLABS.smooth_stone, 2);
  has(MOSSY_COBBLESTONE, STAIRS.mossy_cobblestone);
  has(MUD_BRICKS, WALLS.mud_brick);
  has(SULFUR, SULFUR_BRICKS);
  has(CINNABAR, WALLS.polished_cinnabar);
  has(POLISHED_SULFUR, SLABS.sulfur_brick, 2);
  assert.equal(stonecutterOptions(MUD).length, 0, 'el barro no se corta');
  // Ninguna piedra repite opción, y todo lo que sale es un objeto.
  for (const b of BLOCKS) {
    if (!b) continue;
    const o = stonecutterOptions(b.id);
    assert.equal(new Set(o.map((s) => s.id)).size, o.length, `${b.key}: opciones repetidas`);
    for (const s of o) assert.ok(ITEMS[s.id], `${b.key} → ${s.id}`);
  }
  // Todos los muros se pueden cortar de su piedra.
  for (const [wall, src] of Object.entries(WALL_SOURCE)) has(src, Number(wall));
});

test('piedras: botín, herramientas y el barro que se hunde', () => {
  const pick = TOOLS.wooden.pickaxe;
  assert.deepEqual(blockDrops(POLISHED_DEEPSLATE, pick), [{ id: POLISHED_DEEPSLATE, count: 1 }]);
  assert.deepEqual(blockDrops(CINNABAR, 0), [], 'el cinabrio pide pico');
  assert.deepEqual(blockDrops(SULFUR, pick), [{ id: SULFUR, count: 1 }]);
  assert.deepEqual(blockDrops(MUD, 0), [{ id: MUD, count: 1 }], 'el barro se recoge a mano');
  assert.deepEqual(blockDrops(PACKED_MUD, 0), [{ id: PACKED_MUD, count: 1 }]);
  assert.deepEqual(blockDrops(stateOf(SLABS.tuff, { type: 2 }), pick), [{ id: SLABS.tuff, count: 2 }]);
  assert.equal(BLOCKS[MUD].tool, 'shovel');
  const box = blockCollisionBoxes(MUD, 0, 0, 0, { getBlock: () => 0 }, []);
  assert.deepEqual(box, [0, 0, 0, 1, 14 / 16, 1]);
});

test('piedras: barro en los pantanos y franjas de azufre y cinabrio bajo tierra', () => {
  const seed = 24680;
  const gen = new TerrainGenerator(seed);
  // Barro: chunks de pantano.
  let mud = 0, swamps = 0;
  for (let gx = -40; gx <= 40 && swamps < 6; gx += 4) {
    for (let gz = -40; gz <= 40 && swamps < 6; gz += 4) {
      if (gen.biomeAt(gx * 16 + 8, gz * 16 + 8) !== BIOME_SWAMP) continue;
      swamps++;
      for (const b of gen.generate(gx, gz).blocks) if (b === MUD) mud++;
    }
  }
  assert.ok(swamps > 0, 'hay pantanos cerca');
  assert.ok(mud > 20, `barro en los pantanos (${mud})`);
  // Azufre: el chunk del centro de una cueva de azufre.
  let zone = null;
  for (let x = 0; !zone && x < 40 * 128; x += 128) {
    for (let z = 0; !zone && z < 40 * 128; z += 128) {
      const zz = sulfurZoneAt(seed, x + 64, z + 64);
      if (zz && gen.caveBiomeAt(zz.x, zz.z) === 0) zone = zz;
    }
  }
  assert.ok(zone, 'hay cuevas de azufre');
  const cx = Math.floor(zone.x / 16), cz = Math.floor(zone.z / 16);
  const { blocks } = gen.generate(cx, cz);
  let sulfur = 0, cinnabar = 0, outside = 0;
  for (let y = SULFUR_MIN_Y - 8; y <= SULFUR_MAX_Y + 8; y++) {
    for (let z = 0; z < 16; z++) {
      for (let x = 0; x < 16; x++) {
        const b = blocks[blockIndex(x, y, z)];
        if (b !== SULFUR && b !== CINNABAR) continue;
        if (b === SULFUR) sulfur++;
        else cinnabar++;
        if (y < SULFUR_MIN_Y || y > SULFUR_MAX_Y) outside++;
      }
    }
  }
  assert.ok(sulfur > 1000 && cinnabar > 1000, `franjas de azufre (${sulfur}) y cinabrio (${cinnabar})`);
  assert.equal(outside, 0, 'sólo entre sus alturas');
  // Lejos de las cuevas de azufre no hay.
  const none = gen.generate(3, 3).blocks.filter((b) => b === SULFUR || b === CINNABAR).length;
  assert.ok(sulfurZoneAt(seed, 3 * 16 + 8, 3 * 16 + 8) !== null || none === 0);
});
