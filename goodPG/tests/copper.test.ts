// Fase 6.5 (cobre): registro de los bloques de cobre (cuatro fases, con y sin cera), oxidación con los
// ticks aleatorios, encerar con panal, raspar con hacha, rayos, colocación de cadenas y faroles,
// recetas, cortapiedras, fundición, botín y texturas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, COPPER_BLOCK, COPPER_ORE, DEEPSLATE_ORE, COPPER_TORCH, COPPER_WALL_TORCH, BLOCKS, INVENTORY_ORDER, BLOCK_EMISSION, BLOCK_KIND, KINDS,
  COPPER, OXIDATION_STAGES, RAW_COPPER_BLOCK, copperInfo, copperVariant, oxidizedCopper, waxedCopper, scrapedCopper,
  isWeathering, isDoor, stateOf, stateProps, familyBase, type CopperKind,
} from '../src/shared/blocks';
import {
  ITEMS, COPPER_INGOT, COPPER_NUGGET, RAW_COPPER, HONEYCOMB, STICK, COAL, TOOLS, ARMOR, CREATIVE_ITEMS, isValidItem, itemSpriteIndex,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { stonecutterOptions } from '../src/shared/stonecutting';
import { blockDrops } from '../src/shared/sim/drops';
import { TEXTURE_NAMES } from '../src/shared/textureDefs';
import { COPPER_GENERATORS } from '../src/client/textures/genCopper';
import { Checks, makeServer, placeOnTop, type Client, type Harness } from './harness';

const KIND_LIST: CopperKind[] = ['block', 'cut', 'chiseled', 'grate', 'cut_stairs', 'cut_slab', 'door', 'trapdoor', 'bars', 'chain', 'lantern'];

interface CopperSystem {
  tryOxidize(x: number, y: number, z: number): boolean;
  lightning(x: number, y: number, z: number): void;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const copperOf = (h: Harness) => h.gs.sys.copper as CopperSystem;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const natureOf = (h: Harness) => h.gs.sys.nature as { randomTickAt(x: number, y: number, z: number): void };

/** Plataforma de piedra a y = 150 con un jugador al lado. */
function arena(mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6565);
  const c = h.join('Calderera', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

test('cobre: ocho variantes por tipo con nombre, objeto, textura e inventario', () => {
  const t = new Checks();
  const ids = new Set<number>();
  for (const kind of KIND_LIST) {
    for (const w of [0, 1]) {
      for (let s = 0; s < OXIDATION_STAGES; s++) {
        const id = COPPER[kind][w][s];
        ids.add(id);
        const info = copperInfo(id);
        t.ok(info?.kind === kind && info.stage === s && info.waxed === (w === 1), `info de ${BLOCKS[id]?.key}`);
        t.ok(isValidItem(id) && ITEMS[id].block === id, `objeto: ${BLOCKS[id]?.key}`);
        t.ok(id === COPPER_BLOCK || INVENTORY_ORDER.includes(id), `inventario: ${BLOCKS[id]?.key}`);
        t.ok(!/[a-z]_[a-z]/.test(BLOCKS[id].name), `nombre en español: ${BLOCKS[id].name}`);
        t.ok(w === 0 || BLOCKS[id].name.endsWith(' encerado'), `encerado en el nombre: ${BLOCKS[id].name}`);
        for (const tex of BLOCKS[id].tex) t.ok(TEXTURE_NAMES.includes(tex) && !!COPPER_GENERATORS[tex], `textura ${tex}`);
      }
    }
  }
  t.ok(ids.size === KIND_LIST.length * 8, 'todas distintas');
  t.ok(COPPER.block[0][0] === COPPER_BLOCK, 'el bloque de cobre de siempre es la fase normal');
  t.ok(BLOCKS[COPPER.block[1][0]].name === 'Bloque de cobre encerado', BLOCKS[COPPER.block[1][0]].name);
  t.ok(BLOCKS[COPPER.cut[0][2]].name === 'Cobre cortado degradado', BLOCKS[COPPER.cut[0][2]].name);
  t.ok(BLOCKS[COPPER.door[1][3]].name === 'Puerta de cobre oxidado encerado', BLOCKS[COPPER.door[1][3]].name);
  t.ok(BLOCKS[COPPER.block[0][1]].key === 'exposed_copper' && BLOCKS[COPPER.cut[1][1]].key === 'waxed_exposed_cut_copper', 'claves de Minecraft');
  // Tipos con estados: losas, escaleras, puertas y trampillas se comportan como las demás.
  t.ok(BLOCK_KIND[COPPER.cut_slab[0][1]] === KINDS.slab && BLOCK_KIND[COPPER.cut_stairs[1][2] + 3] === KINDS.stairs, 'losas y escaleras');
  t.ok(isDoor(COPPER.door[0][0] + 5) && BLOCK_KIND[COPPER.trapdoor[1][3]] === KINDS.trapdoor, 'puertas y trampillas');
  t.ok(BLOCK_EMISSION[COPPER.lantern[0][0]] === 15 && BLOCK_EMISSION[COPPER.lantern[1][3] + 1] === 15, 'el farol da luz');
  t.ok(INVENTORY_ORDER.includes(RAW_COPPER_BLOCK) && INVENTORY_ORDER.includes(COPPER_TORCH), 'bloque en bruto y antorcha en el inventario');
  t.ok(BLOCK_EMISSION[COPPER_TORCH] === 14 && isValidItem(COPPER_TORCH) && !isValidItem(COPPER_WALL_TORCH), 'antorcha de cobre');
  for (const tex of [...BLOCKS[RAW_COPPER_BLOCK].tex, ...BLOCKS[COPPER_TORCH].tex]) t.ok(!!COPPER_GENERATORS[tex], `textura ${tex}`);
  // Objetos: cobre en bruto, pepita, herramientas y armadura de cobre.
  for (const id of [RAW_COPPER, COPPER_NUGGET, ...Object.values(TOOLS.copper), ...Object.values(ARMOR.copper)]) {
    t.ok(isValidItem(id) && itemSpriteIndex(id) >= 0 && CREATIVE_ITEMS.includes(id), `objeto nuevo: ${ITEMS[id]?.key}`);
  }
  t.ok(Object.keys(TOOLS.copper).length === 5 && Object.keys(ARMOR.copper).length === 4, 'cinco herramientas y cuatro piezas');
  t.ok(ITEMS[TOOLS.copper.pickaxe].tool!.tier === 2 && ITEMS[ARMOR.copper.chestplate].armor!.points === 4, 'valores de Minecraft');
  t.ok(itemSpriteIndex(COPPER.door[1][2]) >= 0, 'la puerta de cobre se ve plana');
  t.done();
});

test('cobre: variantes, cera y raspado conservan el estado', () => {
  const door = stateOf(COPPER.door[0][1], { facing: 2, half: 1, open: 1, hinge: 1 });
  const waxed = waxedCopper(door);
  assert.deepEqual(stateProps(waxed), stateProps(door), 'encerar no cambia la orientación ni la mitad');
  assert.equal(familyBase(waxed), COPPER.door[1][1]);
  assert.equal(waxedCopper(waxed), 0, 'no se encera dos veces');
  assert.equal(scrapedCopper(waxed), door, 'el hacha quita la cera');
  assert.equal(familyBase(scrapedCopper(door)), COPPER.door[0][0], 'y luego una fase');
  assert.equal(scrapedCopper(COPPER_BLOCK), 0, 'el cobre nuevo sin cera no se raspa');
  assert.equal(oxidizedCopper(COPPER_BLOCK), COPPER.block[0][1]);
  assert.equal(oxidizedCopper(COPPER.block[0][3]), 0, 'el oxidado ya no cambia');
  assert.equal(oxidizedCopper(COPPER.block[1][0]), 0, 'el encerado no se oxida');
  assert.ok(isWeathering(COPPER.chain[0][2] + 1) && !isWeathering(COPPER.chain[1][2]));
  assert.equal(copperVariant(COPPER.cut_stairs[0][0] + 5, 3, true), COPPER.cut_stairs[1][3] + 5);
  assert.equal(copperInfo(STONE), null);
});

test('cobre: se oxida con los ticks aleatorios, parejo, y el encerado no cambia', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const W = h.gs.world;
  const nature = natureOf(h);
  W.setBlock(bx, by, bz, COPPER_BLOCK);
  W.setBlock(bx + 6, by, bz, COPPER.block[1][0]); // encerado, lejos (a más de 4 pasos)
  const stages: number[] = [0];
  for (let i = 0; i < 20000 && copperInfo(W.getBlock(bx, by, bz))!.stage < 3; i++) {
    nature.randomTickAt(bx, by, bz);
    const s = copperInfo(W.getBlock(bx, by, bz))!.stage;
    if (stages[stages.length - 1] !== s) stages.push(s);
  }
  t.ok(stages.join() === '0,1,2,3', `pasa por las cuatro fases en orden (${stages.join()})`);
  for (let i = 0; i < 2000; i++) nature.randomTickAt(bx + 6, by, bz);
  t.ok(W.getBlock(bx + 6, by, bz) === COPPER.block[1][0], 'el encerado sigue igual');
  for (let i = 0; i < 500; i++) nature.randomTickAt(bx, by, bz);
  t.ok(W.getBlock(bx, by, bz) === COPPER.block[0][3], 'el oxidado ya no cambia');

  // Junto a cobre menos oxidado, espera (así un tejado se oxida parejo).
  const copper = copperOf(h);
  W.setBlock(bx, by, bz + 2, COPPER.cut[0][1]);
  W.setBlock(bx + 1, by, bz + 2, COPPER.cut[0][0]);
  let changed = false;
  for (let i = 0; i < 300; i++) changed = copper.tryOxidize(bx, by, bz + 2) || changed;
  t.ok(!changed && W.getBlock(bx, by, bz + 2) === COPPER.cut[0][1], 'con cobre nuevo al lado no avanza');
  for (let i = 0; i < 300 && W.getBlock(bx + 1, by, bz + 2) === COPPER.cut[0][0]; i++) copper.tryOxidize(bx + 1, by, bz + 2);
  t.ok(W.getBlock(bx + 1, by, bz + 2) === COPPER.cut[0][1], 'el más nuevo sí se pone al día');

  // Las puertas se oxidan enteras.
  placeOnTop(c, bx - 3, by, bz, COPPER.door[0][0]);
  h.tick(1);
  const lower = W.getBlock(bx - 3, by, bz);
  t.ok(isDoor(lower) && copperInfo(lower)?.kind === 'door', 'puerta de cobre colocada');
  for (let i = 0; i < 400 && copperInfo(W.getBlock(bx - 3, by, bz))!.stage === 0; i++) copper.tryOxidize(bx - 3, by, bz);
  const a = copperInfo(W.getBlock(bx - 3, by, bz))!, b = copperInfo(W.getBlock(bx - 3, by + 1, bz));
  t.ok(a.stage === 1 && b?.stage === 1, `las dos mitades a la vez (${a.stage}, ${b?.stage})`);
  t.done();
});

test('cobre: encerar con panal, raspar con hacha y rayos', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const W = h.gs.world;
  const axe = TOOLS.iron.axe;
  const use = (x: number, y: number, z: number, item: number) => {
    c.send({ t: 'use', x, y, z, yaw: 0, item });
    h.clock.now += 300;
    h.tick(1);
  };
  W.setBlock(bx + 1, by, bz, COPPER.cut[0][2]);
  use(bx + 1, by, bz, HONEYCOMB);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[1][2], 'el panal lo encera');
  t.ok(c.conn.take('fx').some((m) => m.k === 'copper_wax'), 'con su efecto');
  use(bx + 1, by, bz, HONEYCOMB);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[1][2], 'dos veces no hace nada');
  use(bx + 1, by, bz, axe);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[0][2], 'el hacha quita la cera');
  t.ok(c.conn.take('fx').some((m) => m.k === 'copper_unwax'), 'con su efecto');
  use(bx + 1, by, bz, axe);
  use(bx + 1, by, bz, TOOLS.copper.axe);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[0][0], 'y después, fase a fase (también con el hacha de cobre)');
  t.ok(c.conn.take('fx').some((m) => m.k === 'copper_scrape'), 'raspado con su efecto');
  use(bx + 1, by, bz, axe);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[0][0], 'el cobre nuevo no se raspa más');
  use(bx + 1, by, bz, STICK);
  t.ok(W.getBlock(bx + 1, by, bz) === COPPER.cut[0][0], 'un palo no hace nada');

  // Puerta: se encera entera y se sigue abriendo con la mano.
  placeOnTop(c, bx - 2, by, bz, COPPER.door[0][3]);
  h.tick(1);
  use(bx - 2, by + 1, bz, HONEYCOMB);
  t.ok(familyBase(W.getBlock(bx - 2, by, bz)) === COPPER.door[1][3] && familyBase(W.getBlock(bx - 2, by + 1, bz)) === COPPER.door[1][3], 'las dos mitades enceradas');
  c.send({ t: 'use', x: bx - 2, y: by, z: bz, yaw: 0 });
  t.ok(stateProps(W.getBlock(bx - 2, by + 1, bz))!.open === 1, 'se abre con la mano');

  // Un rayo limpia el cobre sin cera (y no toca el encerado).
  W.setBlock(bx + 3, by, bz, COPPER.block[0][3]);
  W.setBlock(bx + 3, by + 1, bz, COPPER.block[1][2]);
  copperOf(h).lightning(bx + 3, by, bz);
  t.ok(W.getBlock(bx + 3, by, bz) === COPPER_BLOCK, 'el rayo deja el cobre como nuevo');
  t.ok(W.getBlock(bx + 3, by + 1, bz) === COPPER.block[1][2], 'el encerado no cambia');
  t.done();
});

test('cobre: cadenas en el eje de la cara y faroles de pie o colgados', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = arena();
  const W = h.gs.world;
  const chain = COPPER.chain[0][0], lantern = COPPER.lantern[0][0];
  placeOnTop(c, bx, by, bz, chain);
  t.ok(W.getBlock(bx, by, bz) === chain, 'cadena vertical sobre el suelo');
  W.setBlock(bx + 2, by, bz, STONE);
  c.send({ t: 'place', x: bx + 2, y: by, z: bz, n: [1, 0, 0], p: [bx + 3, by + 0.5, bz + 0.5], item: chain, yaw: 0 });
  t.ok(W.getBlock(bx + 3, by, bz) === chain + 1, 'contra una pared al este: a lo largo de X');
  placeOnTop(c, bx - 2, by, bz, lantern);
  t.ok(W.getBlock(bx - 2, by, bz) === lantern, 'farol de pie');
  // Colgado bajo un techo: clic en la cara de abajo.
  W.setBlock(bx, by + 3, bz + 2, STONE);
  c.send({ t: 'place', x: bx, y: by + 3, z: bz + 2, n: [0, -1, 0], p: [bx + 0.5, by + 3, bz + 2.5], item: lantern, yaw: 0 });
  t.ok(W.getBlock(bx, by + 2, bz + 2) === lantern + 1, 'farol colgado');
  // Sin el techo se cae (y suelta el farol).
  c.send({ t: 'set', x: bx, y: by + 3, z: bz + 2, b: AIR, tool: TOOLS.iron.pickaxe });
  h.tick(5);
  t.ok(W.getBlock(bx, by + 2, bz + 2) === AIR, 'sin techo el farol colgado cae');
  // Antorcha de cobre: en la pared (suelta la antorcha de pie) o de pie.
  c.send({ t: 'place', x: bx + 2, y: by, z: bz, n: [0, 0, 1], p: [bx + 2.5, by + 0.5, bz + 1], item: COPPER_TORCH, yaw: 0 });
  t.ok(W.getBlock(bx + 2, by, bz + 1) === stateOf(COPPER_WALL_TORCH, { facing: 2 }), 'antorcha de cobre en la pared');
  t.ok(blockDrops(W.getBlock(bx + 2, by, bz + 1), 0)[0]?.id === COPPER_TORCH, 'suelta la antorcha de cobre');
  placeOnTop(c, bx + 4, by, bz + 3, COPPER_TORCH);
  t.ok(W.getBlock(bx + 4, by, bz + 3) === COPPER_TORCH, 'de pie');
  // En el aire no se puede poner.
  c.send({ t: 'place', x: bx + 5, y: by + 4, z: bz, n: [0, 1, 0], p: [bx + 5.5, by + 5, bz + 0.5], item: lantern, yaw: 0 });
  t.ok(W.getBlock(bx + 5, by + 4, bz) === AIR && W.getBlock(bx + 5, by + 5, bz) === AIR, 'sin apoyo no se coloca');
  t.done();
});

test('cobre: recetas, cortapiedras, fundición y botín', () => {
  const t = new Checks();
  const R = (g: number[]) => matchRecipe(g, 3)?.out;
  const I = COPPER_INGOT, N = COPPER_NUGGET, W = RAW_COPPER;
  const nine = (id: number) => new Array(9).fill(id);
  t.ok(R(nine(I))?.id === COPPER_BLOCK, '9 lingotes → bloque');
  t.ok(R([COPPER.block[1][0], 0, 0, 0, 0, 0, 0, 0, 0])?.count === 9, 'bloque encerado → 9 lingotes');
  t.ok(R(nine(N))?.id === I && R([I, 0, 0, 0, 0, 0, 0, 0, 0])?.id === N, 'pepitas ↔ lingote');
  t.ok(R(nine(W))?.id === RAW_COPPER_BLOCK && R([RAW_COPPER_BLOCK, 0, 0, 0, 0, 0, 0, 0, 0])?.count === 9, 'cobre en bruto ↔ bloque');
  for (let s = 0; s < OXIDATION_STAGES; s++) {
    for (const w of [0, 1]) {
      const B = COPPER.block[w][s], C = COPPER.cut[w][s], S = COPPER.cut_slab[w][s];
      const cut = R([B, B, 0, B, B, 0, 0, 0, 0]);
      t.ok(cut?.id === C && cut.count === 4, `4 bloques → 4 cortados (${s}, ${w})`);
      t.ok(R([C, C, C, 0, 0, 0, 0, 0, 0])?.count === 6 && R([C, C, C, 0, 0, 0, 0, 0, 0])?.id === S, 'losas');
      t.ok(R([C, 0, 0, C, C, 0, C, C, C])?.id === COPPER.cut_stairs[w][s], 'escaleras');
      t.ok(R([S, 0, 0, S, 0, 0, 0, 0, 0])?.id === COPPER.chiseled[w][s], 'grabado con dos losas');
      t.ok(R([0, B, 0, B, 0, B, 0, B, 0])?.id === COPPER.grate[w][s], 'rejilla');
      const cutter = stonecutterOptions(B).map((o) => `${o.id}x${o.count}`);
      t.ok(cutter.includes(`${C}x4`) && cutter.includes(`${S}x8`) && cutter.includes(`${COPPER.grate[w][s]}x4`) &&
        cutter.includes(`${COPPER.chiseled[w][s]}x4`), `cortapiedras del bloque (${s}, ${w})`);
      t.ok(stonecutterOptions(C).some((o) => o.id === S && o.count === 2), 'cortapiedras del cortado');
    }
    for (const kind of KIND_LIST) {
      t.ok(R([COPPER[kind][0][s], HONEYCOMB, 0, 0, 0, 0, 0, 0, 0])?.id === COPPER[kind][1][s], `encerar ${kind} con panal`);
    }
  }
  t.ok(R([I, I, 0, I, I, 0, I, I, 0])?.id === COPPER.door[0][0] && R([I, I, 0, I, I, 0, I, I, 0])?.count === 3, 'puertas');
  t.ok(R([I, I, 0, I, I, 0, 0, 0, 0])?.id === COPPER.trapdoor[0][0], 'trampilla');
  t.ok(R([I, I, I, I, I, I, 0, 0, 0])?.count === 16, 'barras');
  t.ok(R([N, 0, 0, I, 0, 0, N, 0, 0])?.id === COPPER.chain[0][0], 'cadena');
  t.ok(R([N, 0, 0, COAL, 0, 0, STICK, 0, 0])?.id === COPPER_TORCH && R([N, 0, 0, COAL, 0, 0, STICK, 0, 0])?.count === 4, 'antorchas de cobre');
  t.ok(R([N, N, N, N, COPPER_TORCH, N, N, N, N])?.id === COPPER.lantern[0][0], 'farol (con antorcha de cobre)');
  t.ok(R([I, I, I, 0, STICK, 0, 0, STICK, 0])?.id === TOOLS.copper.pickaxe, 'pico de cobre');
  t.ok(R([I, 0, I, I, I, I, I, I, I])?.id === ARMOR.copper.chestplate, 'peto de cobre');
  // Fundición y botín.
  t.ok(ITEMS[RAW_COPPER].smelt === I && ITEMS[TOOLS.copper.sword].smelt === N, 'fundición');
  const drops = blockDrops(COPPER_ORE, TOOLS.stone.pickaxe, () => 0.99);
  t.ok(drops.length === 1 && drops[0].id === RAW_COPPER && drops[0].count === 5, 'la mena suelta cobre en bruto');
  t.ok(blockDrops(DEEPSLATE_ORE[COPPER_ORE], TOOLS.stone.pickaxe, () => 0)[0]?.id === RAW_COPPER, 'también la de pizarra');
  t.ok(blockDrops(COPPER_ORE, TOOLS.wooden.pickaxe).length === 0, 'con pico de madera, nada');
  t.ok(blockDrops(COPPER.cut[1][2], TOOLS.wooden.pickaxe)[0]?.id === COPPER.cut[1][2], 'el cobre suelta su misma variante');
  const slab = stateOf(COPPER.cut_slab[0][3], { type: 2 });
  t.ok(blockDrops(slab, TOOLS.stone.pickaxe)[0]?.count === 2, 'losa doble: dos losas');
  t.ok(blockDrops(COPPER.door[0][1] + 4, TOOLS.stone.pickaxe).length + blockDrops(COPPER.door[0][1], TOOLS.stone.pickaxe).length === 1,
    'la puerta suelta una sola');
  t.done();
});
