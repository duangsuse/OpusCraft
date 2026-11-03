// Fase 6.5 (colores): los 16 tintes y sus recetas, lana, alfombras, hormigón (el polvo cae y se
// endurece en el agua), cristal de color y paneles, terracotas, camas, velas y estandartes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, SAND, GRAVEL, GLASS, GLASS_PANE, TERRACOTTA, WHITE_WOOL, RED_WOOL, BLUE_WOOL, POPPY, DANDELION,
  CORNFLOWER, CACTUS, OAK_PLANKS, FLOWERS, PINK_PETALS, DYE_COLORS, COLOR_NAMES, WOOL, CARPETS, CONCRETE, CONCRETE_POWDER,
  STAINED_GLASS, STAINED_GLASS_PANES, COLORED_TERRACOTTA, GLAZED_TERRACOTTA, BEDS, RED_BED, CANDLE, CANDLES, BANNERS,
  WALL_BANNERS, INVENTORY_ORDER, BLOCKS, BLOCK_EMISSION, BLOCK_RENDER, BLOCK_MODEL_TRANSLUCENT, BLOCK_KIND, KINDS,
  R_TRANSLUCENT, stateOf, stateProps, familyBase, blockModel, isBed, isConcretePowder, concreteOf, candleCount, isLitCandle,
  candleState, canAddCandle, isBanner,
} from '../src/shared/blocks';
import {
  ITEMS, DYES, CREATIVE_ITEMS, BONE_MEAL, LAPIS, BEETROOT, STRING, HONEYCOMB, STICK, itemSpriteIndex,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, toggleEdits, isUsable, type PlaceHit } from '../src/shared/placement';
import { blockDrops } from '../src/shared/sim/drops';
import { TEXTURE_DEFS, textureLayer } from '../src/shared/textureDefs';
import { Mesher } from '../src/client/world/mesh/mesher';
import { blockIndex, CHUNK_VOLUME } from '../src/shared/constants';
import { makeServer, placeOnTop, type Client, type Harness } from './harness';
import { ENT_ITEM } from '../src/shared/mobs';

/** Receta sin forma en la cuadrícula 3×3 (los objetos en las primeras casillas). */
const craft = (...ids: number[]) => {
  const grid = [...ids, ...new Array(9 - ids.length).fill(0)];
  return matchRecipe(grid, 3)?.out ?? null;
};
const ring = (outer: number, center: number) => matchRecipe([outer, outer, outer, outer, center, outer, outer, outer, outer], 3)?.out ?? null;

test('colores: los 16 tintes existen, con nombre en español y sprite', () => {
  assert.equal(DYE_COLORS.length, 16);
  for (const c of DYE_COLORS) {
    const d = DYES[c];
    assert.equal(ITEMS[d].name, `Tinte ${COLOR_NAMES[c][0]}`);
    assert.ok(itemSpriteIndex(d) >= 0, `sprite de ${ITEMS[d].key}`);
    assert.ok(CREATIVE_ITEMS.includes(d), `${ITEMS[d].key} en el inventario creativo`);
  }
  assert.equal(ITEMS[DYES.brown].name, 'Tinte marrón');
  assert.equal(BLOCKS[CONCRETE.light_blue].name, 'Hormigón azul claro');
  assert.equal(BLOCKS[WOOL.red].name, 'Lana roja');
  assert.equal(BLOCKS[STAINED_GLASS_PANES.black].name, 'Panel de cristal negro');
  assert.equal(BLOCKS[GLAZED_TERRACOTTA.purple].name, 'Terracota esmaltada morada');
});

test('colores: tintes de flores y plantas, y mezclas', () => {
  const one = (id: number) => craft(id);
  assert.deepEqual(one(BONE_MEAL), { id: DYES.white, count: 1 });
  assert.deepEqual(one(POPPY), { id: DYES.red, count: 1 });
  assert.deepEqual(one(BEETROOT), { id: DYES.red, count: 1 });
  assert.deepEqual(one(DANDELION), { id: DYES.yellow, count: 1 });
  assert.deepEqual(one(CORNFLOWER), { id: DYES.blue, count: 1 });
  assert.deepEqual(one(LAPIS), { id: DYES.blue, count: 1 });
  assert.deepEqual(one(FLOWERS.allium), { id: DYES.magenta, count: 1 });
  assert.deepEqual(one(FLOWERS.blue_orchid), { id: DYES.light_blue, count: 1 });
  assert.deepEqual(one(FLOWERS.orange_tulip), { id: DYES.orange, count: 1 });
  assert.deepEqual(one(FLOWERS.oxeye_daisy), { id: DYES.light_gray, count: 1 });
  assert.deepEqual(one(FLOWERS.lily_of_the_valley), { id: DYES.white, count: 1 });
  assert.deepEqual(one(PINK_PETALS), { id: DYES.pink, count: 1 });
  const D = DYES;
  assert.deepEqual(craft(D.red, D.yellow), { id: D.orange, count: 2 });
  assert.deepEqual(craft(D.yellow, D.red), { id: D.orange, count: 2 }, 'sin forma: da igual el orden');
  assert.deepEqual(craft(D.blue, D.red), { id: D.purple, count: 2 });
  assert.deepEqual(craft(D.blue, D.green), { id: D.cyan, count: 2 });
  assert.deepEqual(craft(D.green, D.white), { id: D.lime, count: 2 });
  assert.deepEqual(craft(D.red, D.white), { id: D.pink, count: 2 });
  assert.deepEqual(craft(D.black, D.white), { id: D.gray, count: 2 });
  assert.deepEqual(craft(D.black, D.white, D.white), { id: D.light_gray, count: 3 });
  assert.deepEqual(craft(D.purple, D.pink), { id: D.magenta, count: 2 });
  assert.deepEqual(craft(D.blue, D.red, D.red, D.white), { id: D.magenta, count: 4 });
  // El cactus se funde en tinte verde; la terracota de color, en esmaltada.
  assert.equal(ITEMS[CACTUS].smelt, D.green);
  for (const c of DYE_COLORS) assert.equal(ITEMS[COLORED_TERRACOTTA[c]].smelt, GLAZED_TERRACOTTA[c]);
});

test('colores: teñir lana, alfombras, cristal, paneles, terracota, camas y velas', () => {
  const D = DYES;
  assert.deepEqual(craft(D.cyan, WHITE_WOOL), { id: WOOL.cyan, count: 1 });
  assert.deepEqual(craft(RED_WOOL, D.green), { id: WOOL.green, count: 1 }, 'cualquier lana se tiñe');
  assert.deepEqual(matchRecipe([WOOL.pink, WOOL.pink, 0, 0], 2)?.out, { id: CARPETS.pink, count: 3 });
  assert.deepEqual(ring(CARPETS.white, D.black), { id: CARPETS.black, count: 8 });
  assert.deepEqual(ring(GLASS, D.magenta), { id: STAINED_GLASS.magenta, count: 8 });
  assert.deepEqual(ring(GLASS_PANE, D.lime), { id: STAINED_GLASS_PANES.lime, count: 8 });
  assert.deepEqual(ring(TERRACOTTA, D.blue), { id: COLORED_TERRACOTTA.blue, count: 8 });
  const g = STAINED_GLASS.brown;
  assert.deepEqual(matchRecipe([g, g, g, g, g, g, 0, 0, 0], 3)?.out, { id: STAINED_GLASS_PANES.brown, count: 16 });
  assert.deepEqual(craft(D.gray, SAND, SAND, SAND, SAND, GRAVEL, GRAVEL, GRAVEL, GRAVEL), { id: CONCRETE_POWDER.gray, count: 8 });
  const w = WOOL.light_blue, P = OAK_PLANKS;
  assert.deepEqual(matchRecipe([w, w, w, P, P, P, 0, 0, 0], 3)?.out, { id: BEDS.light_blue, count: 1 });
  assert.deepEqual(craft(RED_BED, D.yellow), { id: BEDS.yellow, count: 1 }, 'las camas se tiñen');
  assert.deepEqual(matchRecipe([STRING, 0, HONEYCOMB, 0], 2)?.out, { id: CANDLE, count: 1 });
  assert.deepEqual(craft(CANDLE, D.orange), { id: CANDLES.orange, count: 1 });
  const b = WOOL.red;
  assert.deepEqual(matchRecipe([b, b, b, b, b, b, 0, STICK, 0], 3)?.out, { id: BANNERS.red, count: 1 });
});

test('colores: bloques de los 16 colores, sin cambiar los ids que ya había', () => {
  assert.equal(WOOL.white, WHITE_WOOL);
  assert.equal(WOOL.blue, BLUE_WOOL);
  assert.equal(COLORED_TERRACOTTA.white, 1828, 'la terracota blanca conserva su id');
  assert.equal(BEDS.red, RED_BED);
  for (const c of DYE_COLORS) {
    for (const id of [WOOL[c], CARPETS[c], CONCRETE[c], CONCRETE_POWDER[c], STAINED_GLASS[c], STAINED_GLASS_PANES[c],
      COLORED_TERRACOTTA[c], GLAZED_TERRACOTTA[c], BEDS[c], CANDLES[c], BANNERS[c]]) {
      assert.ok(BLOCKS[id], `bloque ${c}`);
      assert.ok(ITEMS[id], `objeto de ${BLOCKS[id].key}`);
      assert.ok(INVENTORY_ORDER.includes(id), `${BLOCKS[id].key} en el inventario creativo`);
    }
    assert.ok(isBed(BEDS[c]) && BLOCK_KIND[BEDS[c]] === KINDS.bed, `cama ${c}`);
    assert.equal(ITEMS[BEDS[c]].stack, 1);
    assert.ok(itemSpriteIndex(BEDS[c]) >= 0, `sprite de la cama ${c}`);
    assert.equal(BLOCK_RENDER[STAINED_GLASS[c]], R_TRANSLUCENT, 'el cristal de color es translúcido');
    assert.equal(BLOCK_MODEL_TRANSLUCENT[STAINED_GLASS_PANES[c]], 1, 'y sus paneles van en la pasada translúcida');
    assert.equal(TEXTURE_DEFS[textureLayer(`${c}_stained_glass`)].special, 4);
    assert.equal(concreteOf(CONCRETE_POWDER[c]), CONCRETE[c]);
  }
  assert.ok(INVENTORY_ORDER.includes(CANDLE));
  assert.equal(new Set(INVENTORY_ORDER).size, INVENTORY_ORDER.length, 'sin repetidos en el inventario creativo');
  // Alfombra: 1/16 de alto.
  const m = blockModel(CARPETS.red, () => 0)!;
  assert.equal(m.length, 1);
  assert.equal(m[0].y1, 1);
});

test('colores: los paneles de cristal de color se unen entre sí, al cristal y a los paneles normales', () => {
  const pane = STAINED_GLASS_PANES.red;
  const arms = (id: number, n: number) => blockModel(id, (dx, dy, dz) => (dy === 0 && dz === -1 ? n : 0))!.length;
  assert.equal(arms(pane, AIR), 1, 'solo: sólo el poste');
  assert.equal(arms(pane, STAINED_GLASS_PANES.blue), 2, 'con otro panel de color');
  assert.equal(arms(pane, GLASS_PANE), 2, 'con un panel normal');
  assert.equal(arms(pane, STAINED_GLASS.green), 2, 'con cristal de color');
  assert.equal(arms(pane, GLASS), 2, 'con cristal');
  assert.equal(arms(pane, STONE), 2, 'con un bloque sólido');
  assert.equal(arms(GLASS_PANE, pane), 2, 'el panel normal también se une a los de color');
  // El cristal de color no se recoge (como sin toque de seda).
  assert.deepEqual(blockDrops(STAINED_GLASS.red, 0), []);
  assert.deepEqual(blockDrops(pane, 0), []);
});

test('colores: velas de 1 a 4 por bloque, encendidas dan luz 3/6/9/12', () => {
  const get = (x: number, y: number, z: number) => (y <= 0 ? STONE : AIR);
  const topHit = (id = STONE, y = 0): PlaceHit => ({ x: 0, y, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: y + 1, pz: 0.5, id });
  const placed = planPlacement(get, topHit(), CANDLES.red, 0)!;
  assert.deepEqual(placed, [[0, 1, 0, candleState(CANDLES.red, 1, true)]], 'se pone encendida');
  assert.equal(planPlacement((x, y, z) => (y <= 0 ? AIR : AIR), topHit(AIR), CANDLE, 0), null, 'necesita suelo');
  let cur = placed[0][3];
  for (let n = 2; n <= 4; n++) {
    assert.ok(canAddCandle(CANDLES.red, cur));
    const e = planPlacement((x, y, z) => (y === 1 ? cur : get(x, y, z)), topHit(cur, 1), CANDLES.red, 0)!;
    assert.equal(e.length, 1);
    assert.deepEqual(e[0].slice(0, 3), [0, 1, 0], 'en el mismo bloque');
    cur = e[0][3];
    assert.equal(candleCount(cur), n);
    assert.ok(isLitCandle(cur));
  }
  assert.ok(!canAddCandle(CANDLES.red, cur), 'caben cuatro');
  assert.ok(!canAddCandle(CANDLES.blue, placed[0][3]), 'sólo velas del mismo color');
  for (let n = 1; n <= 4; n++) {
    assert.equal(BLOCK_EMISSION[candleState(CANDLE, n, true)], 3 * n);
    assert.equal(BLOCK_EMISSION[candleState(CANDLE, n, false)], 0);
  }
  // Se encienden y apagan con el clic derecho.
  assert.ok(isUsable(cur));
  const off = toggleEdits((x, y, z) => (y === 1 ? cur : get(x, y, z)), 0, 1, 0, 0)![0][3];
  assert.ok(!isLitCandle(off) && candleCount(off) === 4);
  assert.deepEqual(blockDrops(off, 0), [{ id: CANDLES.red, count: 4 }], 'sueltan todas las velas');

  // Luz real en el mallador: 12 en la celda de cuatro velas encendidas y 9 a tres bloques.
  const chunks = Array.from({ length: 9 }, () => new Uint16Array(CHUNK_VOLUME));
  chunks[4][blockIndex(8, 100, 8)] = cur;
  const light = new Mesher().mesh(chunks, 0, 0).light;
  assert.equal(light[blockIndex(8, 100, 8)] & 15, 12);
  assert.equal(light[blockIndex(11, 100, 8)] & 15, 9);
  chunks[4][blockIndex(8, 100, 8)] = candleState(CANDLE, 2, true);
  assert.equal(new Mesher().mesh(chunks, 0, 0).light[blockIndex(8, 100, 8)] & 15, 6);
});

/** Servidor con una plataforma de piedra a y = 150 y un jugador encima. */
function platform(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6565);
  const c = h.join('Tintorera');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx, by, bz);
  h.tick(2);
  return { h, c, bx, by, bz };
}

test('colores: el hormigón en polvo cae como la arena y se endurece al tocar agua', () => {
  const { h, bx, by, bz } = platform();
  const W = h.gs.world;
  const powder = CONCRETE_POWDER.orange, concrete = CONCRETE.orange;
  assert.ok(isConcretePowder(powder));

  // Junto a un agua: se endurece al ponerlo.
  const x1 = bx + 4;
  W.setBlock(x1, by, bz, WATER);
  W.setBlock(x1 + 1, by, bz, powder);
  assert.equal(W.getBlock(x1 + 1, by, bz), concrete, 'junto al agua se vuelve hormigón');

  // En seco se queda en polvo; y cae si no tiene nada debajo.
  W.setBlock(bx - 4, by, bz, powder);
  assert.equal(W.getBlock(bx - 4, by, bz), powder);
  W.setBlock(bx - 4, by + 4, bz - 2, powder);
  h.tick(40);
  assert.equal(W.getBlock(bx - 4, by + 4, bz - 2), AIR, 'cae como la arena');
  assert.equal(W.getBlock(bx - 4, by, bz - 2), powder, 'y aterriza en el suelo');

  // Cae dentro de una fuente de agua rodeada de piedra: aterriza endurecido.
  const px = bx - 2, pz = bz + 4;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) W.setBlock(px + dx, by, pz + dz, STONE);
  W.setBlock(px, by, pz, WATER);
  h.tick(5);
  W.setBlock(px, by + 5, pz, powder);
  h.tick(60);
  assert.equal(W.getBlock(px, by, pz), concrete, 'el polvo que cae al agua se vuelve hormigón');

  // El agua que llega hasta un polvo lo endurece.
  const qx = bx + 2, qz = bz - 5;
  W.setBlock(qx, by, qz, powder);
  W.setBlock(qx + 3, by, qz, WATER);
  h.tick(100);
  assert.equal(W.getBlock(qx, by, qz), concrete, 'el agua que fluye hasta él lo endurece');
});

test('colores: colocar velas, terracota esmaltada, estandartes y alfombras en el servidor', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  const items = (id: number) =>
    [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

  // Velas: una encendida, luego otra en el mismo bloque; con la mano, se apagan.
  placeOnTop(c, bx + 1, by, bz, CANDLES.lime);
  assert.equal(W.getBlock(bx + 1, by, bz), candleState(CANDLES.lime, 1, true));
  c.send({ t: 'place', x: bx + 1, y: by, z: bz, n: [0, 1, 0], p: [bx + 1.5, by + 0.4, bz + 0.5], item: CANDLES.lime, yaw: 0 });
  assert.equal(W.getBlock(bx + 1, by, bz), candleState(CANDLES.lime, 2, true), 'dos velas');
  c.send({ t: 'use', x: bx + 1, y: by, z: bz, yaw: 0 });
  assert.equal(W.getBlock(bx + 1, by, bz), candleState(CANDLES.lime, 2, false), 'apagadas');
  c.send({ t: 'set', x: bx + 1, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(5);
  assert.equal(items(CANDLES.lime), 2, 'sueltan las dos velas');

  // Terracota esmaltada: mira al jugador (yaw 0 = mirando al norte → el frente al sur).
  placeOnTop(c, bx - 1, by, bz, GLAZED_TERRACOTTA.cyan, 0);
  const gt = W.getBlock(bx - 1, by, bz);
  assert.equal(familyBase(gt), GLAZED_TERRACOTTA.cyan);
  assert.equal(stateProps(gt)!.facing, 2);

  // Estandarte: de pie en el suelo y colgado en una pared.
  placeOnTop(c, bx, by, bz - 2, BANNERS.purple, 0);
  assert.equal(W.getBlock(bx, by, bz - 2), stateOf(BANNERS.purple, { facing: 2 }));
  W.setBlock(bx + 3, by, bz, STONE);
  c.send({ t: 'place', x: bx + 3, y: by, z: bz, n: [0, 0, 1], p: [bx + 3.5, by + 0.5, bz + 1], item: BANNERS.purple, yaw: Math.PI });
  const wb = W.getBlock(bx + 3, by, bz + 1);
  assert.equal(familyBase(wb), WALL_BANNERS.purple, 'en la pared, estandarte de pared');
  assert.ok(isBanner(wb));
  c.send({ t: 'set', x: bx + 3, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(5);
  assert.equal(W.getBlock(bx + 3, by, bz + 1), AIR, 'sin pared se cae');
  assert.equal(items(BANNERS.purple), 1, 'y suelta el estandarte');

  // Alfombra: se cae al quitarle el suelo.
  W.setBlock(bx - 3, by, bz, STONE);
  placeOnTop(c, bx - 3, by + 1, bz, CARPETS.white);
  assert.equal(W.getBlock(bx - 3, by + 1, bz), CARPETS.white);
  c.send({ t: 'set', x: bx - 3, y: by, z: bz, b: AIR, tool: 0 });
  h.tick(5);
  assert.equal(W.getBlock(bx - 3, by + 1, bz), AIR);
  assert.equal(items(CARPETS.white), 1);
});
