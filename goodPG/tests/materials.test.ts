// Fase 6.5 (materiales): hierro y oro en bruto, bloques de almacenamiento, hielo azul, suelos (tierra
// gruesa, podsol, tierra enraizada, camino de tierra), nieve polvo, infestados, tartas con vela y huevos
// de rana: registro, recetas, colocación, física, generación y servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, GRASS, DIRT, WATER, CAKE, ICE, PACKED_ICE, GRAVEL, FARMLAND, IRON_ORE, GOLD_ORE, DEEPSLATE_ORE, HANGING_ROOTS,
  CANDLE, CANDLES, BLOCKS, INVENTORY_ORDER, BLOCK_SOLID, BLOCK_COLLIDE, BLOCK_OPAQUE,
  RAW_IRON_BLOCK, RAW_GOLD_BLOCK, COAL_BLOCK, LAPIS_BLOCK, BONE_BLOCK, BONE_BLOCK_AXIS, SLIME_BLOCK, BLUE_ICE, COARSE_DIRT,
  PODZOL, ROOTED_DIRT, DIRT_PATH, POWDER_SNOW, FROGSPAWN, INFESTED_CRACKED_STONE_BRICKS, INFESTED_MOSSY_STONE_BRICKS,
  INFESTED_CHISELED_STONE_BRICKS, INFESTED_DEEPSLATE, INFESTED_STONE, MATERIAL_INVENTORY, CANDLE_CAKES,
  isInfested, isCandleCake, isLitCandleCake, candleOfCake, candleCakeOf, stateProps, blockSupported,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, itemForBlock, RAW_IRON, RAW_GOLD, POWDER_SNOW_BUCKET, IRON_INGOT, GOLD_INGOT, COAL,
  LAPIS, BONE_MEAL, SLIME_BALL, BUCKET, TOOLS, BREED_FOOD, PLACEABLE_BLOCKS,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { variantSmelts } from '../src/shared/containers';
import { blockDrops } from '../src/shared/sim/drops';
import { planPlacement, isUsable, type PlaceHit } from '../src/shared/placement';
import { soilUse, candleCakeUse } from '../src/shared/materialPlacement';
import {
  groundGrip, groundSpeed, slimeBounce, stepFreeze, FREEZE_TICKS, POWDER_SINK_SPEED,
} from '../src/shared/materialPhysics';
import { moveBody, type Body } from '../src/shared/sim/physics';
import { Player } from '../src/client/game/Player';
import { MATERIAL_GENERATORS } from '../src/client/textures/genMaterials';
import { MATERIAL_SPRITES } from '../src/client/textures/materialSprites';
import { TEXTURE_NAMES } from '../src/shared/textureDefs';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { BIOME_TAIGA, BIOME_SNOWY_PEAKS } from '../src/shared/world/biomeIds';
import { MOB_FROG, MOB_TADPOLE, MOB_SILVERFISH, ENT_ITEM } from '../src/shared/mobs';
import { makeServer, placeOnTop, type Client, type Harness } from './harness';

const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: x + 0.5 + nx * 0.5, py: y + 0.5 + ny * 0.5, pz: z + 0.5 + nz * 0.5, id });
const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

// ------------------------------------------------------------------ registro

test('registro: bloques, objetos, texturas y sprites', () => {
  const names: [number, string][] = [
    [RAW_IRON_BLOCK, 'Bloque de hierro en bruto'], [RAW_GOLD_BLOCK, 'Bloque de oro en bruto'], [COAL_BLOCK, 'Bloque de carbón'],
    [LAPIS_BLOCK, 'Bloque de lapislázuli'], [BONE_BLOCK, 'Bloque de huesos'], [SLIME_BLOCK, 'Bloque de slime'],
    [BLUE_ICE, 'Hielo azul'], [COARSE_DIRT, 'Tierra gruesa'], [PODZOL, 'Podsol'], [ROOTED_DIRT, 'Tierra enraizada'],
    [DIRT_PATH, 'Camino de tierra'], [POWDER_SNOW, 'Nieve polvo'], [FROGSPAWN, 'Huevos de rana'],
    [INFESTED_DEEPSLATE, 'Pizarra profunda infestada'],
  ];
  for (const [id, name] of names) assert.equal(BLOCKS[id].name, name);
  for (const id of MATERIAL_INVENTORY) {
    assert.ok(ITEMS[id]?.block === id, `objeto de bloque: ${BLOCKS[id].key}`);
    assert.ok(INVENTORY_ORDER.includes(id), `en el inventario creativo: ${BLOCKS[id].key}`);
  }
  assert.equal(ITEMS[RAW_IRON].name, 'Hierro en bruto');
  assert.equal(ITEMS[RAW_GOLD].name, 'Oro en bruto');
  assert.equal(ITEMS[POWDER_SNOW_BUCKET].name, 'Cubo de nieve polvo');
  assert.equal(ITEMS[POWDER_SNOW_BUCKET].stack, 1);
  for (const id of [RAW_IRON, RAW_GOLD, POWDER_SNOW_BUCKET]) {
    assert.ok(CREATIVE_ITEMS.includes(id) && itemSpriteIndex(id) >= 0 && MATERIAL_SPRITES[ITEMS[id].key], `sprite: ${ITEMS[id].key}`);
  }
  // La nieve polvo no es objeto: se recoge con el cubo (y el clic central da el cubo).
  assert.equal(ITEMS[POWDER_SNOW], undefined);
  assert.equal(itemForBlock(POWDER_SNOW), POWDER_SNOW_BUCKET);
  assert.ok(PLACEABLE_BLOCKS.has(POWDER_SNOW));
  assert.ok(!BLOCK_SOLID[POWDER_SNOW] && BLOCK_COLLIDE[POWDER_SNOW] === 0 && BLOCK_OPAQUE[POWDER_SNOW], 'nieve polvo: se ve como un bloque, no sostiene');
  // Camino de tierra: 15/16 de alto.
  assert.deepEqual(BLOCKS[DIRT_PATH].collision, [0, 0, 0, 1, 15 / 16, 1]);
  // Texturas nuevas con su generador.
  for (const t of Object.keys(MATERIAL_GENERATORS)) assert.ok(TEXTURE_NAMES.includes(t), `textura registrada: ${t}`);
  for (const t of ['raw_iron_block', 'slime_block', 'powder_snow', 'frogspawn', 'dirt_path_side']) assert.ok(MATERIAL_GENERATORS[t], t);
  // Tartas con vela: 17 velas, cada una encendida o apagada; no son objeto (el clic central da la tarta).
  assert.equal(CANDLE_CAKES.size, 17);
  const cc = candleCakeOf(CANDLES.red, true);
  assert.ok(isCandleCake(cc) && isLitCandleCake(cc) && !isLitCandleCake(cc - 1) && candleOfCake(cc) === CANDLES.red);
  assert.equal(BLOCKS[cc - 1].name, 'Tarta con vela roja');
  assert.equal(itemForBlock(cc), CAKE);
  assert.ok(BLOCKS[cc].emission > 0 && BLOCKS[cc - 1].emission === 0, 'encendida da luz');
  assert.ok(isUsable(cc));
  // Infestados.
  for (const id of [INFESTED_CRACKED_STONE_BRICKS, INFESTED_MOSSY_STONE_BRICKS, INFESTED_CHISELED_STONE_BRICKS, INFESTED_DEEPSLATE, INFESTED_STONE]) {
    assert.ok(isInfested(id), BLOCKS[id].key);
  }
  // Las ranas crían con bolas de slime.
  assert.deepEqual(BREED_FOOD.frog, [SLIME_BALL]);
});

// ------------------------------------------------------------------ botín, horno y recetas

test('botín: menas en bruto, suelos, hielo azul, nieve polvo y tartas con vela', () => {
  const iron = TOOLS.iron.pickaxe, stone = TOOLS.stone.pickaxe, wood = TOOLS.wooden.pickaxe;
  assert.deepEqual(blockDrops(IRON_ORE, stone), [{ id: RAW_IRON, count: 1 }]);
  assert.deepEqual(blockDrops(IRON_ORE, wood), [], 'hierro: pico de piedra');
  assert.deepEqual(blockDrops(GOLD_ORE, iron), [{ id: RAW_GOLD, count: 1 }]);
  assert.deepEqual(blockDrops(GOLD_ORE, stone), [], 'oro: pico de hierro');
  assert.deepEqual(blockDrops(DEEPSLATE_ORE[GOLD_ORE], iron), [{ id: RAW_GOLD, count: 1 }]);
  assert.deepEqual(blockDrops(RAW_GOLD_BLOCK, stone), [], 'bloque de oro en bruto: pico de hierro');
  assert.deepEqual(blockDrops(RAW_GOLD_BLOCK, iron), [{ id: RAW_GOLD_BLOCK, count: 1 }]);
  assert.deepEqual(blockDrops(PODZOL, 0), [{ id: DIRT, count: 1 }]);
  assert.deepEqual(blockDrops(DIRT_PATH, 0), [{ id: DIRT, count: 1 }]);
  assert.deepEqual(blockDrops(COARSE_DIRT, 0), [{ id: COARSE_DIRT, count: 1 }]);
  assert.deepEqual(blockDrops(ROOTED_DIRT, 0), [{ id: ROOTED_DIRT, count: 1 }]);
  assert.deepEqual(blockDrops(BLUE_ICE, iron), []);
  assert.deepEqual(blockDrops(POWDER_SNOW, 0), []);
  assert.deepEqual(blockDrops(FROGSPAWN, 0), []);
  assert.deepEqual(blockDrops(INFESTED_DEEPSLATE, iron), []);
  assert.deepEqual(blockDrops(candleCakeOf(CANDLE, false), 0), [{ id: CANDLE, count: 1 }], 'la tarta con vela suelta la vela');
  // El bloque de huesos tumbado suelta el bloque de huesos.
  assert.deepEqual(blockDrops(BONE_BLOCK_AXIS + 1, wood), [{ id: BONE_BLOCK, count: 1 }]);
});

test('horno y alto horno: el mineral en bruto se funde; el bloque de carbón arde 80 objetos', () => {
  assert.equal(ITEMS[RAW_IRON].smelt, IRON_INGOT);
  assert.equal(ITEMS[RAW_GOLD].smelt, GOLD_INGOT);
  assert.ok(variantSmelts(2, RAW_IRON) && variantSmelts(2, RAW_GOLD) && variantSmelts(0, RAW_IRON), 'alto horno y horno');
  assert.ok(!variantSmelts(1, RAW_IRON), 'el ahumador no');
  assert.equal(ITEMS[COAL_BLOCK].fuel, ITEMS[COAL].fuel! * 10, '80 objetos (el carbón, 8)');
});

test('recetas: 9 ↔ 1, hielo compacto y azul, tierra gruesa', () => {
  const nine = (unit: number, blockId: number) => {
    assert.deepEqual(craft(new Array(9).fill(unit)), { id: blockId, count: 1 }, `9 → ${BLOCKS[blockId].key}`);
    assert.deepEqual(matchRecipe([blockId, 0, 0, 0], 2)?.out, { id: unit, count: 9 }, `${BLOCKS[blockId].key} → 9`);
  };
  nine(RAW_IRON, RAW_IRON_BLOCK);
  nine(RAW_GOLD, RAW_GOLD_BLOCK);
  nine(COAL, COAL_BLOCK);
  nine(LAPIS, LAPIS_BLOCK);
  nine(BONE_MEAL, BONE_BLOCK);
  nine(SLIME_BALL, SLIME_BLOCK);
  assert.deepEqual(craft(new Array(9).fill(ICE)), { id: PACKED_ICE, count: 1 });
  assert.deepEqual(craft(new Array(9).fill(PACKED_ICE)), { id: BLUE_ICE, count: 1 });
  assert.deepEqual(matchRecipe([DIRT, GRAVEL, GRAVEL, DIRT], 2)?.out, { id: COARSE_DIRT, count: 4 });
  assert.deepEqual(matchRecipe([GRAVEL, DIRT, DIRT, GRAVEL], 2)?.out, { id: COARSE_DIRT, count: 4 }, 'también en espejo');
});

// ------------------------------------------------------------------ colocación y usos

test('colocar: tartas con vela, huevos de rana y bloque de huesos tumbado', () => {
  const cells = new Map<string, number>([['0,0,0', CAKE], ['2,0,0', WATER], ['4,0,0', STONE], ['6,0,0', CAKE + 2]]);
  const get = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? AIR;
  // Una vela sobre una tarta entera: tarta con vela encendida en la misma celda.
  assert.deepEqual(planPlacement(get, hitOn(0, 0, 0, 0, 1, 0, CAKE), CANDLES.blue, 0), [[0, 0, 0, candleCakeOf(CANDLES.blue, true)]]);
  assert.notDeepEqual(planPlacement(get, hitOn(6, 0, 0, 0, 1, 0, CAKE + 2), CANDLE, 0)?.[0][3], candleCakeOf(CANDLE, true), 'empezada no');
  // Huevos de rana: sobre el agua; no sobre la piedra.
  assert.deepEqual(planPlacement(get, hitOn(2, 0, 0, 0, 1, 0, WATER), FROGSPAWN, 0), [[2, 1, 0, FROGSPAWN]]);
  assert.equal(planPlacement(get, hitOn(4, 0, 0, 0, 1, 0, STONE), FROGSPAWN, 0), null);
  assert.ok(blockSupported(FROGSPAWN, (dx, dy, dz) => get(2 + dx, 1 + dy, dz)));
  // Bloque de huesos contra un lateral: tumbado en ese eje (como los troncos).
  assert.equal(planPlacement(get, hitOn(4, 0, 0, 1, 0, 0, STONE), BONE_BLOCK, 0)![0][3], BONE_BLOCK_AXIS);
  assert.equal(planPlacement(get, hitOn(4, 0, 0, 0, 0, 1, STONE), BONE_BLOCK, 0)![0][3], BONE_BLOCK_AXIS + 1);
  assert.equal(planPlacement(get, hitOn(4, 0, 0, 0, 1, 0, STONE), BONE_BLOCK, 0)![0][3], BONE_BLOCK);
});

test('pala y azada sobre los suelos; la tarta con vela', () => {
  const cells = new Map<string, number>();
  const get = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? AIR;
  const shovel = TOOLS.iron.shovel, hoe = TOOLS.iron.hoe;
  for (const soil of [GRASS, DIRT, COARSE_DIRT, PODZOL, ROOTED_DIRT]) {
    cells.set('0,0,0', soil);
    assert.deepEqual(soilUse(get, 0, 0, 0, shovel, HANGING_ROOTS), { block: DIRT_PATH, drop: 0 }, `pala: ${BLOCKS[soil].key}`);
  }
  cells.set('0,1,0', STONE);
  assert.equal(soilUse(get, 0, 0, 0, shovel, HANGING_ROOTS), null, 'con algo encima no');
  cells.delete('0,1,0');
  cells.set('0,0,0', COARSE_DIRT);
  assert.deepEqual(soilUse(get, 0, 0, 0, hoe, HANGING_ROOTS), { block: DIRT, drop: 0 });
  cells.set('0,0,0', ROOTED_DIRT);
  assert.deepEqual(soilUse(get, 0, 0, 0, hoe, HANGING_ROOTS), { block: DIRT, drop: HANGING_ROOTS });
  cells.set('0,0,0', DIRT_PATH);
  assert.deepEqual(soilUse(get, 0, 0, 0, hoe, HANGING_ROOTS), { block: FARMLAND, drop: 0 });
  cells.set('0,0,0', GRASS);
  assert.equal(soilUse(get, 0, 0, 0, hoe, HANGING_ROOTS), null, 'la hierba la labra la granja de siempre');
  // Tarta con vela: arriba (la vela) se enciende o se apaga; abajo se come y cae la vela.
  const lit = candleCakeOf(CANDLES.lime, true);
  assert.deepEqual(candleCakeUse(lit, 0.8), { block: lit - 1, eat: false, drop: 0 });
  assert.deepEqual(candleCakeUse(lit - 1, 0.8), { block: lit, eat: false, drop: 0 });
  assert.deepEqual(candleCakeUse(lit, 0.2), { block: CAKE + 1, eat: true, drop: CANDLES.lime });
  assert.equal(stateProps(CAKE + 1)!.bites, 1);
});

// ------------------------------------------------------------------ física

/** Mundo de prueba: celdas sueltas en un mapa (aire por defecto). */
function world(cells: [number, number, number, number][]): { getBlock(x: number, y: number, z: number): number } {
  const m = new Map(cells.map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  return { getBlock: (x, y, z) => m.get(`${x},${y},${z}`) ?? AIR };
}

test('física: hielo, slime y nieve polvo (reglas)', () => {
  assert.ok(groundGrip(BLUE_ICE) < groundGrip(PACKED_ICE) && groundGrip(PACKED_ICE) === groundGrip(ICE) && groundGrip(ICE) < groundGrip(STONE));
  assert.equal(groundGrip(STONE), 1);
  assert.equal(groundSpeed(SLIME_BLOCK), 0.4);
  assert.ok(slimeBounce(SLIME_BLOCK, -10, false)! > 7, 'rebota');
  assert.equal(slimeBounce(SLIME_BLOCK, -10, true), null, 'agachado no');
  assert.equal(slimeBounce(SLIME_BLOCK, -1, false), null, 'despacio no');
  assert.equal(slimeBounce(STONE, -10, false), null);
  // Congelación: 7 s dentro para congelarse del todo; fuera se descongela al doble de ritmo.
  let t = 0;
  for (let i = 0; i < 140; i++) t = stepFreeze(t, 0.05, true, false);
  assert.equal(t, FREEZE_TICKS);
  for (let i = 0; i < 35; i++) t = stepFreeze(t, 0.05, false, false);
  assert.equal(t, FREEZE_TICKS / 2);
  assert.equal(stepFreeze(0, 1, true, true), 0, 'con cuero no');
});

test('física de las criaturas: rebotan en el slime y se hunden en la nieve polvo', () => {
  const body = (y: number, vy: number): Body => ({ x: 0.5, y, z: 0.5, vx: 0, vy, vz: 0, width: 0.6, height: 0.9, onGround: false, inWater: false, inLava: false, hitWall: false });
  const slime = world([[0, 0, 0, SLIME_BLOCK]]);
  const b = body(1.2, -12);
  moveBody(b, slime, 0.05);
  assert.ok(b.vy > 8 && !b.onGround, `rebota (vy = ${b.vy})`);
  const stone = world([[0, 0, 0, STONE]]);
  const s = body(1.2, -12);
  moveBody(s, stone, 0.05);
  assert.ok(s.vy === 0 && s.onGround, 'en la piedra no');
  const snow = world([[0, 0, 0, POWDER_SNOW], [0, 1, 0, POWDER_SNOW], [0, -1, 0, STONE]]);
  const p = body(1.5, -20);
  moveBody(p, snow, 0.05);
  assert.ok(p.vy >= -POWDER_SINK_SPEED && p.y > 1.4, 'se hunde despacio');
});

test('física del jugador: resbala en el hielo, rebota en el slime y se hunde en la nieve polvo', () => {
  const floor = (id: number) => {
    const cells: [number, number, number, number][] = [];
    for (let x = -2; x <= 40; x++) for (let z = -3; z <= 3; z++) cells.push([x, 0, z, id]);
    return world(cells);
  };
  const idle = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  const slide = (id: number): number => {
    const w = floor(id);
    const p = new Player();
    p.x = 0.5; p.y = 1; p.z = 0.5; p.yaw = -Math.PI / 2; // mirando a +X
    for (let i = 0; i < 40; i++) p.update(0.05, { ...idle, forward: true }, w);
    const x0 = p.x;
    for (let i = 0; i < 40; i++) p.update(0.05, idle, w);
    return p.x - x0;
  };
  const stoneSlide = slide(STONE), iceSlide = slide(ICE), blueSlide = slide(BLUE_ICE);
  assert.ok(iceSlide > stoneSlide * 3, `el hielo resbala (${iceSlide.toFixed(2)} contra ${stoneSlide.toFixed(2)})`);
  assert.ok(blueSlide > iceSlide, `el hielo azul más (${blueSlide.toFixed(2)})`);
  // Slime: caer desde 10 bloques rebota y no cuenta como caída.
  const sw = floor(SLIME_BLOCK);
  const p = new Player();
  p.x = 0.5; p.y = 11; p.z = 0.5;
  let bounced = false, worstFall = 0;
  for (let i = 0; i < 60; i++) {
    const vy = p.vy;
    p.update(0.05, idle, sw);
    if (vy < -5 && p.vy > 0) bounced = true;
    worstFall = Math.max(worstFall, p.landedFall);
  }
  assert.ok(bounced, 'rebota');
  assert.ok(worstFall < 3, `sin daño por caída (${worstFall.toFixed(2)})`);
  // Nieve polvo: sin botas de cuero se hunde despacio; con ellas se queda encima.
  const cells: [number, number, number, number][] = [];
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    cells.push([x, 0, z, STONE]);
    for (let y = 1; y <= 3; y++) cells.push([x, y, z, POWDER_SNOW]);
  }
  const snow = world(cells);
  const q = new Player();
  q.x = 0.5; q.y = 4; q.z = 0.5;
  q.update(0.05, idle, snow);
  for (let i = 0; i < 10; i++) q.update(0.05, idle, snow);
  assert.ok(q.y < 4 && q.y > 2.5, `se hunde despacio (y = ${q.y.toFixed(2)})`);
  assert.ok(q.inPowder);
  const r = new Player();
  r.leatherBoots = true;
  r.x = 0.5; r.y = 4; r.z = 0.5;
  for (let i = 0; i < 20; i++) r.update(0.05, idle, snow);
  assert.ok(Math.abs(r.y - 4) < 1e-6 && r.onGround, `con botas de cuero, encima (y = ${r.y.toFixed(2)})`);
});

// ------------------------------------------------------------------ generación

/** Chunks (hasta `max`) cuyo centro cae en un bioma, buscando en espiral desde el origen. */
function chunksWhere(gen: TerrainGenerator, ok: (x: number, z: number) => boolean, max: number): [number, number][] {
  const out: [number, number][] = [];
  for (let r = 0; r < 200 && out.length < max; r++) {
    for (let dz = -r; dz <= r && out.length < max; dz++) {
      for (let dx = -r; dx <= r && out.length < max; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (ok(dx * 16 + 8, dz * 16 + 8)) out.push([dx, dz]);
      }
    }
  }
  return out;
}

test('generación: podsol en las taigas, nieve polvo en las cumbres, tierra enraizada y pizarra infestada', () => {
  const gen = new TerrainGenerator(12345);
  const count = (chunks: [number, number][], ...ids: number[]) => {
    let n = 0;
    for (const [cx, cz] of chunks) for (const b of gen.generate(cx, cz).blocks) if (ids.includes(b)) n++;
    return n;
  };
  const taiga = chunksWhere(gen, (x, z) => gen.columnInfo(x, z).biome === BIOME_TAIGA, 12);
  assert.ok(taiga.length >= 6, 'hay taigas');
  assert.ok(count(taiga, PODZOL) > 20, 'podsol en las taigas');
  const peaks = chunksWhere(gen, (x, z) => gen.columnInfo(x, z).biome === BIOME_SNOWY_PEAKS, 16);
  assert.ok(peaks.length >= 6, 'hay picos nevados');
  assert.ok(count(peaks, POWDER_SNOW) > 10, 'nieve polvo en las cumbres');
  const lush = chunksWhere(gen, (x, z) => gen.caveBiomeAt(x, z) === 1, 40);
  const rooted = count(lush, ROOTED_DIRT);
  assert.ok(rooted > 5, `tierra enraizada bajo las azaleas (${rooted})`);
  assert.ok(count(lush.slice(0, 20), INFESTED_DEEPSLATE) > 10, 'pizarra profunda infestada');
  // La nieve polvo sólo sale donde había nieve (nunca flotando).
  for (const [cx, cz] of peaks.slice(0, 4)) {
    const { blocks } = gen.generate(cx, cz);
    for (let i = 256; i < blocks.length; i++) {
      if (blocks[i] !== POWDER_SNOW) continue;
      const below = blocks[i - 256];
      assert.ok(below !== AIR, 'con algo debajo');
    }
  }
});

// ------------------------------------------------------------------ servidor

function platform(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6161);
  const c = h.join('Materiales', 's');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: caminos, tierra gruesa y enraizada, polvo de hueso', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  const use = (x: number, y: number, z: number, item: number) => c.send({ t: 'use', x, y, z, yaw: 0, item });
  W.setBlock(bx + 1, by - 1, bz, GRASS);
  use(bx + 1, by - 1, bz, TOOLS.iron.shovel);
  assert.equal(W.getBlock(bx + 1, by - 1, bz), DIRT_PATH, 'la pala abre un camino');
  placeOnTop(c, bx + 1, by, bz, STONE);
  assert.equal(W.getBlock(bx + 1, by, bz), STONE);
  assert.equal(W.getBlock(bx + 1, by - 1, bz), DIRT, 'un bloque sólido encima lo vuelve tierra');
  W.setBlock(bx + 2, by - 1, bz, DIRT_PATH);
  use(bx + 2, by - 1, bz, TOOLS.iron.hoe);
  assert.equal(W.getBlock(bx + 2, by - 1, bz), FARMLAND, 'la azada labra el camino');
  W.setBlock(bx + 3, by - 1, bz, COARSE_DIRT);
  use(bx + 3, by - 1, bz, TOOLS.iron.hoe);
  assert.equal(W.getBlock(bx + 3, by - 1, bz), DIRT, 'tierra gruesa → tierra');
  W.setBlock(bx + 4, by - 1, bz, ROOTED_DIRT);
  use(bx + 4, by - 1, bz, TOOLS.iron.hoe);
  assert.equal(W.getBlock(bx + 4, by - 1, bz), DIRT, 'tierra enraizada → tierra');
  assert.equal(itemsOf(h, HANGING_ROOTS), 1, '… y suelta raíces colgantes');
  // Polvo de hueso bajo la tierra enraizada: raíces colgantes.
  W.setBlock(bx + 5, by + 3, bz, ROOTED_DIRT);
  use(bx + 5, by + 3, bz, BONE_MEAL);
  assert.equal(W.getBlock(bx + 5, by + 2, bz), HANGING_ROOTS);
});

test('servidor: tarta con vela (poner, encender, apagar y comer)', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  W.setBlock(bx + 2, by, bz, CAKE);
  c.send({ t: 'place', x: bx + 2, y: by, z: bz, n: [0, 1, 0], p: [bx + 2.5, by + 0.5, bz + 0.5], item: CANDLES.red, yaw: 0 });
  const lit = candleCakeOf(CANDLES.red, true);
  assert.equal(W.getBlock(bx + 2, by, bz), lit, 'vela sobre la tarta');
  const use = (hh: number) => c.send({ t: 'use', x: bx + 2, y: by, z: bz, yaw: 0, h: hh });
  use(0.8);
  assert.equal(W.getBlock(bx + 2, by, bz), lit - 1, 'se apaga');
  use(0.8);
  assert.equal(W.getBlock(bx + 2, by, bz), lit, 'se enciende');
  use(0.2);
  assert.equal(W.getBlock(bx + 2, by, bz), CAKE + 1, 'se come una porción');
  assert.equal(itemsOf(h, CANDLES.red), 1, 'y cae la vela');
});

test('servidor: nieve polvo con el cubo, infestados y lepismas', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  placeOnTop(c, bx + 2, by, bz, POWDER_SNOW);
  assert.equal(W.getBlock(bx + 2, by, bz), POWDER_SNOW, 'se vacía el cubo');
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: AIR, tool: BUCKET });
  assert.equal(W.getBlock(bx + 2, by, bz), AIR, 'se recoge con el cubo');
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM).length, 0, 'sin soltar nada');
  W.setBlock(bx + 3, by, bz, INFESTED_DEEPSLATE);
  c.send({ t: 'set', x: bx + 3, y: by, z: bz, b: AIR, tool: TOOLS.iron.pickaxe });
  assert.equal(W.getBlock(bx + 3, by, bz), AIR);
  assert.ok([...h.gs.entities.list.values()].some((e) => e.type === MOB_SILVERFISH), 'sale una lepisma');
});

test('servidor: las ranas crían con bolas de slime, ponen huevos en el agua y eclosionan', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  // Charca de 3×3 junto a las ranas.
  for (let dx = 3; dx <= 5; dx++) for (let dz = -1; dz <= 1; dz++) W.setBlock(bx + dx, by - 1, bz + dz, WATER);
  const a = h.gs.entities.spawnMob(MOB_FROG, bx + 0.5, by, bz + 0.5)!;
  const b = h.gs.entities.spawnMob(MOB_FROG, bx + 1.5, by, bz + 1.5)!;
  for (const [q, f] of [[1, a], [2, b]] as const) c.send({ t: 'interact', e: f.id, item: SLIME_BALL, q });
  const res = c.conn.take('ires');
  assert.ok(res.every((m) => m.ok && m.take === 1), 'comen bolas de slime');
  h.tick(20);
  assert.ok((a.breedCd ?? 0) > 0 && (b.breedCd ?? 0) > 0 && !(a.love! > 0), 'crían');
  let spawn: [number, number, number] | null = null;
  for (let dx = 3; dx <= 5; dx++) for (let dz = -1; dz <= 1; dz++) if (W.getBlock(bx + dx, by, bz + dz) === FROGSPAWN) spawn = [bx + dx, by, bz + dz];
  assert.ok(spawn, 'huevos de rana sobre el agua');
  assert.ok(!h.gs.sys.frogspawn.isPregnant(a.id) && !h.gs.sys.frogspawn.isPregnant(b.id), 'ya no está preñada');
  h.gs.sys.frogspawn.hatch(spawn![0], spawn![1], spawn![2]);
  assert.equal(W.getBlock(spawn![0], spawn![1], spawn![2]), AIR);
  const tadpoles = [...h.gs.entities.list.values()].filter((e) => e.type === MOB_TADPOLE).length;
  assert.ok(tadpoles >= 2 && tadpoles <= 6, `renacuajos (${tadpoles})`);
});
