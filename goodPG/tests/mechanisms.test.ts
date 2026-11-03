// Fase 7 (mecanismos): pistones (fila, límite de 12, adhesivo, slime y miel, cuasi-conectividad, pulso
// corto), observador, tolvas (entre cofres, horno, bloqueo, comparador), dispensador (flecha, cubo, dinamita),
// soltador, dinamita (mecha, explosión, cadena) y vagonetas con tolva y con dinamita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, COBBLESTONE, OBSIDIAN, DIRT, SAND, WATER, CHEST, FURNACE, REDSTONE_BLOCK, REDSTONE_LAMP, SLIME_BLOCK, HONEY_BLOCK,
  PISTON, STICKY_PISTON, MOVING_BLOCK, OBSERVER, HOPPER, DISPENSER, DROPPER, TNT, POPPY, COMPARATOR, stateOf, isPiston,
  pistonExtended, isPistonHead, observerPowered, hopperLocked, dispenserTriggered, facingOf, mechanismSlots, wireState, wirePower,
  railState, RAIL_EW, RAIL_ACTIVATOR, facingState,
} from '../src/shared/blocks';
import { EAST, WEST, UP, NORTH, SOUTH } from '../src/shared/redstone';
import {
  ITEMS, IRON_INGOT, REDSTONE, QUARTZ, SLIME_BALL, GUNPOWDER, BOW, MINECART, HOPPER_MINECART, TNT_MINECART, ARROW,
  WATER_BUCKET, BUCKET, COAL, DIAMOND, FLINT_AND_STEEL,
} from '../src/shared/items';
import { IRON_ORE as IRON_ORE_ITEM } from '../src/shared/blocks';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { resolvePush } from '../src/shared/pistons';
import { blastResistance, explodedBlocks } from '../src/shared/explosions';
import { ENT_TNT } from '../src/shared/mechanisms';
import { ENT_ITEM, ENT_ARROW } from '../src/shared/mobs';
import { ENT_HOPPER_MINECART, ENT_TNT_MINECART, vehicleContainerPos } from '../src/shared/vehicles';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { makeServer, type Harness, type Client } from './harness';

const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

interface Lab {
  h: Harness;
  c: Client;
  bx: number;
  by: number;
  bz: number;
  set: (x: number, y: number, z: number, id: number) => void;
  get: (x: number, y: number, z: number) => number;
}

/** Servidor con un solar de piedra despejado en y = 160 alrededor de (bx, bz). */
function lab(seed = 4242): Lab {
  const h = makeServer(seed);
  const c = h.join('Ingeniera', 'c');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -24; dx <= 24; dx++) {
    for (let dz = -24; dz <= 24; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 8; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return { h, c, bx, by, bz, set: (x, y, z, id) => void W.setBlock(x, y, z, id), get: (x, y, z) => W.getBlock(x, y, z) };
}

test('pistón: empuja una fila, se recoge y no pasa de 12 bloques', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx - 10, z = bz;
  set(x, by, z, facingState(PISTON, EAST));
  for (let i = 1; i <= 3; i++) set(x + i, by, z, COBBLESTONE);
  h.tick(2);
  set(x, by, z - 1, REDSTONE_BLOCK);
  h.tick(1);
  assert.ok(pistonExtended(get(x, by, z)), 'se extiende al momento');
  assert.equal(get(x + 1, by, z), MOVING_BLOCK, 'la cabeza se está moviendo');
  h.tick(3);
  assert.ok(isPistonHead(get(x + 1, by, z)), 'cabeza puesta');
  assert.deepEqual([get(x + 2, by, z), get(x + 3, by, z), get(x + 4, by, z)], [COBBLESTONE, COBBLESTONE, COBBLESTONE]);
  set(x, by, z - 1, AIR);
  h.tick(4);
  assert.ok(isPiston(get(x, by, z)) && !pistonExtended(get(x, by, z)), 'recogido');
  assert.equal(get(x + 1, by, z), AIR, 'sin cabeza');
  assert.equal(get(x + 2, by, z), COBBLESTONE, 'el normal no tira');
  // 12 bloques sí; 13, no.
  const z2 = bz + 3;
  set(x, by, z2, facingState(PISTON, EAST));
  for (let i = 1; i <= 12; i++) set(x + i, by, z2, DIRT);
  set(x, by, z2 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(pistonExtended(get(x, by, z2)), 'con 12 se extiende');
  assert.equal(get(x + 13, by, z2), DIRT);
  const z3 = bz + 6;
  set(x, by, z3, facingState(PISTON, EAST));
  for (let i = 1; i <= 13; i++) set(x + i, by, z3, DIRT);
  set(x, by, z3 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z3)), 'con 13 no');
  // Obsidiana y lecho de roca no se mueven; lo que se rompe, suelta su objeto.
  const z4 = bz + 9;
  set(x, by, z4, facingState(PISTON, EAST));
  set(x + 1, by, z4, OBSIDIAN);
  set(x, by, z4 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z4)), 'la obsidiana no se mueve');
  const z5 = bz + 12;
  set(x, by, z5, facingState(PISTON, EAST));
  set(x + 1, by, z5, POPPY);
  set(x, by, z5 - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(pistonExtended(get(x, by, z5)), 'la flor no lo impide');
  const drops = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === POPPY);
  assert.equal(drops.length, 1, 'la flor se rompe y cae');
});

test('pistón adhesivo: tira del bloque, lo suelta con un pulso corto y el slime arrastra', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx - 10, z = bz;
  set(x, by, z, facingState(STICKY_PISTON, EAST));
  set(x + 1, by, z, COBBLESTONE);
  h.tick(2);
  set(x, by, z - 1, REDSTONE_BLOCK);
  h.tick(4);
  assert.equal(get(x + 2, by, z), COBBLESTONE, 'lo empuja');
  set(x, by, z - 1, AIR);
  h.tick(4);
  assert.equal(get(x + 1, by, z), COBBLESTONE, 'y al recogerse tira de él');
  assert.equal(get(x + 2, by, z), AIR);
  // Pulso corto (se apaga antes de terminar de extenderse): el bloque se queda delante.
  set(x, by, z - 1, REDSTONE_BLOCK);
  h.tick(1);
  set(x, by, z - 1, AIR);
  h.tick(5);
  assert.ok(!pistonExtended(get(x, by, z)), 'recogido');
  assert.equal(get(x + 2, by, z), COBBLESTONE, 'con un pulso corto suelta el bloque');
  assert.equal(get(x + 1, by, z), AIR);
  // Slime (en el aire: si tocara el suelo, tiraría también de él): arrastra a sus vecinos (también los de
  // los lados) y la miel no se pega al slime.
  const z2 = bz + 6, y2 = by + 3;
  set(x, y2, z2, facingState(STICKY_PISTON, EAST));
  set(x + 1, y2, z2, SLIME_BLOCK);
  set(x + 1, y2 + 1, z2, STONE); // pegado encima
  set(x + 1, y2, z2 + 1, HONEY_BLOCK); // miel al lado: no se pega al slime
  set(x + 1, y2, z2 - 1, DIRT); // tierra al otro lado: sí
  h.tick(2);
  set(x - 1, y2, z2, REDSTONE_BLOCK);
  h.tick(4);
  assert.equal(get(x + 2, y2, z2), SLIME_BLOCK);
  assert.equal(get(x + 2, y2 + 1, z2), STONE, 'la piedra de encima va con el slime');
  assert.equal(get(x + 2, y2, z2 - 1), DIRT, 'y la tierra de al lado');
  assert.equal(get(x + 1, y2, z2 + 1), HONEY_BLOCK, 'la miel se queda');
  set(x - 1, y2, z2, AIR);
  h.tick(4);
  assert.deepEqual([get(x + 1, y2, z2), get(x + 1, y2 + 1, z2), get(x + 1, y2, z2 - 1)], [SLIME_BLOCK, STONE, DIRT], 'y vuelven al tirar');
  // Sobre el suelo, el slime tira del suelo entero: más de 12 bloques y el pistón no se mueve.
  const z3 = bz + 10;
  set(x, by, z3, facingState(STICKY_PISTON, EAST));
  set(x + 1, by, z3, SLIME_BLOCK);
  set(x - 1, by, z3, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(!pistonExtended(get(x, by, z3)), 'el slime pegado al suelo no se mueve');
  // Resolución pura: 12 como mucho también contando lo que arrastra el slime.
  const col = new Map<string, number>();
  const g = (a: number, b: number, c: number) => col.get(`${a},${b},${c}`) ?? AIR;
  col.set('0,0,0', facingState(PISTON, EAST));
  col.set('1,0,0', SLIME_BLOCK);
  for (let i = 2; i <= 12; i++) col.set(`${i},0,0`, DIRT);
  assert.equal(resolvePush(g, 0, 0, 0, EAST, true)?.toPush.length, 12, 'el slime y 11 delante');
  col.set('1,1,0', DIRT);
  assert.equal(resolvePush(g, 0, 0, 0, EAST, true), null, 'con uno más pegado encima, 13: no');
});

test('pistón: guardar a medio movimiento no pierde nada (y la base que se recoge también se mueve)', () => {
  const { h, c, bx, by, bz, set, get } = lab();
  const x = bx - 10, z = bz;
  // Uno que se extiende empujando una fila y un adhesivo que se recoge tirando de su bloque.
  set(x, by, z, facingState(PISTON, EAST));
  set(x + 1, by, z, COBBLESTONE);
  set(x + 2, by, z, DIRT);
  const z2 = z + 4;
  set(x, by, z2, facingState(STICKY_PISTON, EAST));
  set(x + 1, by, z2, SAND);
  set(x - 1, by, z2, REDSTONE_BLOCK);
  h.tick(4);
  assert.equal(get(x + 2, by, z2), SAND, 'el adhesivo lo ha empujado');
  set(x - 1, by, z2, AIR);
  set(x - 1, by, z, REDSTONE_BLOCK);
  h.tick(1);
  assert.equal(get(x + 1, by, z), MOVING_BLOCK, 'la cabeza sale');
  assert.equal(get(x + 3, by, z), MOVING_BLOCK, 'la tierra se mueve');
  assert.equal(get(x, by, z2), MOVING_BLOCK, 'la base que se recoge es un bloque en movimiento');
  assert.equal(get(x + 1, by, z2), MOVING_BLOCK, 'la arena vuelve');
  // Se guarda a medio movimiento (sin tocar el mundo) y se carga en otro servidor.
  h.gs.flush(true);
  assert.equal(get(x + 3, by, z), MOVING_BLOCK, 'guardar no cambia el mundo');
  const h2 = makeServer(4242, h.store);
  const c2 = h2.join('Ingeniera', 'c');
  c2.pos(bx + 0.5, by + 30, bz + 0.5);
  h2.tick(60);
  const get2 = (a: number, b: number, d: number) => h2.gs.world.getBlock(a, b, d);
  assert.ok(pistonExtended(get2(x, by, z)), 'extendido');
  assert.ok(isPistonHead(get2(x + 1, by, z)), 'con su cabeza');
  assert.deepEqual([get2(x + 2, by, z), get2(x + 3, by, z)], [COBBLESTONE, DIRT], 'la fila, donde iba');
  assert.ok(isPiston(get2(x, by, z2)) && !pistonExtended(get2(x, by, z2)), 'el adhesivo, recogido');
  assert.deepEqual([get2(x + 1, by, z2), get2(x + 2, by, z2)], [SAND, AIR], 'con la arena pegada');
  // Un chunk que se descarga a medio movimiento lo asienta antes (el mundo guarda sus ediciones).
  h.tick(4);
  set(x - 1, by, z, AIR);
  h.tick(1);
  assert.equal(get(x, by, z), MOVING_BLOCK);
  c.pos(bx + 5000.5, by + 30, bz + 0.5);
  h.gs.world.unloadUnused(h.clock.now + 60_000, () => false);
  assert.equal(h.gs.sys.mechanisms.pistons.pending, 0, 'nada a medias');
  assert.equal(h.gs.world.getBlock(x, by, z), -1, 'descargado');
  c.pos(bx + 0.5, by + 30, bz + 0.5);
  h.tick(40);
  assert.ok(isPiston(get(x, by, z)) && !pistonExtended(get(x, by, z)), 'recogido al volver');
  assert.equal(get(x + 1, by, z), AIR, 'sin cabeza');
});

test('pistón: cuasi-conectividad (el bloque de encima cuenta) y empuja a las criaturas', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx + 4, z = bz - 8;
  set(x, by, z, facingState(PISTON, SOUTH));
  h.tick(2);
  // Un bloque de redstone junto al hueco de encima del pistón: el pistón no se entera (no le llega aviso)…
  set(x - 1, by + 1, z, REDSTONE_BLOCK);
  h.tick(3);
  assert.ok(!pistonExtended(get(x, by, z)), 'sin aviso no se mueve (BUD)');
  // …hasta que algo cambia a su lado.
  set(x + 1, by, z, DIRT);
  h.tick(3);
  assert.ok(pistonExtended(get(x, by, z)), 'con un aviso se extiende: le da potencia el bloque de encima');
  // Al extenderse aparta a la criatura que tiene delante.
  const z2 = bz + 8;
  set(x, by, z2, facingState(PISTON, SOUTH));
  h.tick(1);
  const sheep = h.gs.entities.spawnMob(3, x + 0.5, by, z2 + 1.5)!;
  set(x, by, z2 - 1, REDSTONE_BLOCK);
  h.tick(1);
  assert.ok(sheep.z - sheep.width / 2 >= z2 + 2 - 0.02, `la oveja queda fuera de la cabeza (${sheep.z})`);
});

test('observador: pulso de 2 ticks cuando cambia lo que vigila', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx + 8, z = bz + 4;
  // Mira al oeste (a x − 1); por detrás (x + 1), una lámpara.
  set(x, by, z, facingState(OBSERVER, WEST));
  set(x + 1, by, z, REDSTONE_LAMP);
  h.tick(4);
  assert.ok(!observerPowered(get(x, by, z)));
  set(x - 1, by, z, STONE);
  h.tick(1);
  assert.ok(!observerPowered(get(x, by, z)), 'todavía no (2 ticks)');
  h.tick(1);
  assert.ok(observerPowered(get(x, by, z)), 'pulso');
  assert.equal(get(x + 1, by, z), REDSTONE_LAMP + 1, 'enciende lo de detrás');
  h.tick(2);
  assert.ok(!observerPowered(get(x, by, z)), 'y se apaga a los 2 ticks');
  // Lo que cambia a los lados o detrás no cuenta.
  set(x, by, z + 1, STONE);
  h.tick(3);
  assert.ok(!observerPowered(get(x, by, z)));
});

test('tolvas: entre dos cofres, al horno, bloqueadas con potencia y leídas por el comparador', () => {
  const { h, bx, by, bz, set, get } = lab();
  const inv = h.gs.sys.mechanisms.inventories;
  // Lo que se mete a mano se guarda con done() (como todo lo que cambia un contenedor: despierta a las tolvas).
  const fill = (a: number, b: number, d: number, slot: number, st: { id: number; count: number }) => {
    const o = inv.open(a, b, d)!;
    o.state.slots[slot] = st;
    o.done();
  };
  const x = bx - 4, z = bz + 10;
  // Cofre arriba → tolva que apunta al este → cofre.
  set(x, by + 1, z, CHEST);
  set(x, by, z, stateOf(HOPPER, { facing: 2 }));
  set(x + 1, by, z, CHEST);
  h.tick(2);
  fill(x, by + 1, z, 0, { id: COBBLESTONE, count: 3 });
  h.tick(60);
  const dest = inv.open(x + 1, by, z)!.state.slots;
  assert.equal(dest.reduce((n, s) => n + (s?.count ?? 0), 0), 3, 'los tres pasan al cofre de al lado');
  assert.ok(inv.open(x, by + 1, z)!.state.slots.every((s) => !s), 'el de arriba queda vacío');
  // Ritmo: un objeto cada 8 ticks.
  fill(x, by + 1, z, 0, { id: DIRT, count: 64 });
  h.tick(80);
  const moved = inv.open(x + 1, by, z)!.state.slots.filter((s) => s?.id === DIRT).reduce((n, s) => n + s!.count, 0);
  assert.ok(moved >= 8 && moved <= 11, `unos 10 en 80 ticks (${moved})`);
  // Horno: por arriba, lo que se funde; por un lado, el combustible.
  const fx = x + 8;
  set(fx, by, z, FURNACE);
  set(fx, by + 1, z, stateOf(HOPPER, { facing: 0 }));
  set(fx - 1, by, z, stateOf(HOPPER, { facing: 2 }));
  h.tick(2);
  fill(fx, by + 1, z, 0, { id: IRON_ORE_ITEM, count: 2 });
  fill(fx - 1, by, z, 0, { id: COAL, count: 1 });
  h.tick(20);
  const furnace = inv.open(fx, by, z)!.state;
  assert.equal(furnace.slots[0]?.id, IRON_ORE_ITEM, 'el mineral entra por arriba');
  assert.ok(furnace.slots[1]?.id === COAL || furnace.burn > 0, 'el carbón por el lado');
  // Con potencia se bloquea.
  const lx = x + 14;
  set(lx, by + 1, z, CHEST);
  set(lx, by, z, stateOf(HOPPER, { facing: 2 }));
  set(lx + 1, by, z, CHEST);
  set(lx, by, z - 1, REDSTONE_BLOCK);
  h.tick(2);
  assert.ok(hopperLocked(get(lx, by, z)), 'bloqueada');
  fill(lx, by + 1, z, 0, { id: DIRT, count: 5 });
  h.tick(40);
  assert.equal(inv.open(lx, by + 1, z)!.state.slots[0]?.count, 5, 'no se mueve nada');
  set(lx, by, z - 1, AIR);
  h.tick(40);
  assert.ok((inv.open(lx, by + 1, z)!.state.slots[0]?.count ?? 0) < 5, 'sin potencia vuelve a pasar');
  // El comparador lee una tolva (5 huecos: una pila de 64 da 3).
  const cz = z + 6;
  set(x, by, cz, stateOf(HOPPER, { facing: 0 }));
  set(x + 1, by, cz, stateOf(COMPARATOR, { facing: 1 }));
  set(x + 2, by, cz, wireState(0, false));
  h.tick(2);
  fill(x, by, cz, 0, { id: DIRT, count: 64 });
  h.tick(4);
  assert.equal(wirePower(get(x + 2, by, cz)), 3);
});

test('tolvas: cada una con su espera (8 ticks; 7 la que recibe de otra si ya le tocó en el tick), en su orden', () => {
  const { h, bx, by, bz, set } = lab();
  const inv = h.gs.sys.mechanisms.inventories;
  const hoppers = h.gs.sys.mechanisms.hoppers;
  const count = (a: number, b: number, d: number) => inv.open(a, b, d)!.state.slots.reduce((n, st) => n + (st?.count ?? 0), 0);
  const fill = (a: number, b: number, d: number, n: number) => {
    const o = inv.open(a, b, d)!;
    o.state.slots[0] = { id: DIRT, count: n };
    o.done();
  };
  // Tolva A → tolva B → cofre, hacia el este.
  const x = bx - 12, z = bz - 14;
  set(x, by, z, stateOf(HOPPER, { facing: 2 }));
  set(x + 1, by, z, stateOf(HOPPER, { facing: 2 }));
  set(x + 2, by, z, CHEST);
  h.tick(4);
  assert.equal(hoppers.coolingCount, 0, 'sin nada que hacer, ninguna espera');
  fill(x, by, z, 2);
  h.tick(1);
  assert.deepEqual([count(x, by, z), count(x + 1, by, z)], [1, 1], 'A pasa uno en el acto');
  h.tick(6);
  assert.equal(count(x + 2, by, z), 0, 'B, vacía, lo recibió y espera 7 ticks');
  h.tick(1);
  assert.deepEqual([count(x + 1, by, z), count(x + 2, by, z)], [0, 1], 'a los 7 lo pasa');
  assert.equal(count(x, by, z), 1, 'A aún espera (8)');
  h.tick(1);
  assert.deepEqual([count(x, by, z), count(x + 1, by, z)], [0, 1], 'a los 8, A pasa el segundo');
  h.tick(7);
  assert.equal(count(x + 2, by, z), 2);
  h.tick(10);
  assert.equal(hoppers.coolingCount, 0, 'y ya no esperan');
  // Cada una a su ritmo: una fila de 4 tolvas desde un cofre lleno, 2,5 objetos por segundo.
  const z2 = z + 3;
  set(x, by + 1, z2, CHEST);
  for (let i = 0; i < 4; i++) set(x + i, by, z2, stateOf(HOPPER, { facing: 2 }));
  set(x + 4, by, z2, CHEST);
  h.tick(2);
  fill(x, by + 1, z2, 64);
  h.tick(200);
  const through = count(x + 4, by, z2);
  assert.ok(through >= 22 && through <= 25, `unos 25 − 3 en 200 ticks (${through})`);
  // Un objeto tirado encima de una tolva dormida la despierta.
  const z3 = z + 6;
  set(x, by, z3, stateOf(HOPPER, { facing: 0 }));
  h.tick(4);
  h.gs.entities.spawnItem({ id: DIAMOND, count: 1 }, x + 0.5, by + 1.2, z3 + 0.5);
  h.tick(20);
  assert.equal(inv.open(x, by, z3)!.state.slots[0]?.id, DIAMOND, 'lo coge');
});

test('dispensador y soltador: flecha, cubo de agua, dinamita, mechero y soltar', () => {
  const { h, bx, by, bz, set, get } = lab();
  const inv = h.gs.sys.mechanisms.inventories;
  const x = bx + 10, z = bz - 12;
  const pulse = (px: number, pz: number) => {
    set(px, by + 1, pz, REDSTONE_BLOCK);
    h.tick(6);
    set(px, by + 1, pz, AIR);
    h.tick(2);
  };
  // Flecha hacia el este.
  set(x, by, z, facingState(DISPENSER, EAST));
  h.tick(2);
  inv.open(x, by, z)!.state.slots[4] = { id: ARROW, count: 2 };
  set(x, by + 1, z, REDSTONE_BLOCK);
  h.tick(3);
  assert.ok(dispenserTriggered(get(x, by, z)));
  h.tick(2);
  const arrows = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ARROW);
  assert.equal(arrows.length, 1, 'dispara una flecha');
  assert.ok(arrows[0].vx > 15, 'hacia el este');
  assert.equal(inv.open(x, by, z)!.state.slots[4]?.count, 1);
  set(x, by + 1, z, AIR);
  h.tick(2);
  // Cubo de agua: pone el agua y se queda el cubo; otra vez, la recoge.
  const wz = z + 4;
  set(x, by, wz, facingState(DISPENSER, EAST));
  h.tick(2);
  inv.open(x, by, wz)!.state.slots[0] = { id: WATER_BUCKET, count: 1 };
  pulse(x, wz);
  assert.equal(get(x + 1, by, wz), WATER, 'pone el agua');
  assert.equal(inv.open(x, by, wz)!.state.slots[0]?.id, BUCKET);
  pulse(x, wz);
  assert.notEqual(get(x + 1, by, wz), WATER, 'y la recoge');
  assert.equal(inv.open(x, by, wz)!.state.slots[0]?.id, WATER_BUCKET);
  // Dinamita: sale encendida.
  const tz = z + 8;
  set(x, by, tz, facingState(DISPENSER, UP));
  h.tick(2);
  inv.open(x, by, tz)!.state.slots[0] = { id: TNT, count: 1 };
  set(x + 1, by, tz, REDSTONE_BLOCK);
  h.tick(5);
  const primed = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_TNT);
  assert.equal(primed.length, 1, 'dinamita encendida');
  h.gs.entities.remove(primed[0].id);
  // Soltador: lo suelta como objeto o lo mete en el cofre de delante.
  const dz = z + 12;
  set(x, by, dz, facingState(DROPPER, EAST));
  h.tick(2);
  inv.open(x, by, dz)!.state.slots[0] = { id: DIAMOND, count: 2 };
  pulse(x, dz);
  const items = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === DIAMOND);
  assert.equal(items.length, 1, 'suelta un diamante');
  set(x + 1, by, dz, CHEST);
  h.tick(1);
  pulse(x, dz);
  assert.equal(inv.open(x + 1, by, dz)!.state.slots.find((s) => s)?.id, DIAMOND, 'el otro, al cofre');
  // El mechero enciende lo de delante (aquí, fuego sobre la piedra) y se desgasta.
  const mz = z + 16;
  set(x, by, mz, facingState(DISPENSER, EAST));
  h.tick(2);
  inv.open(x, by, mz)!.state.slots[0] = { id: FLINT_AND_STEEL, count: 1 };
  pulse(x, mz);
  assert.equal(inv.open(x, by, mz)!.state.slots[0]?.dmg, 1, 'se desgasta');
  // Como en Minecraft Java: puesto donde ya hay potencia no dispara hasta que le llega un aviso.
  const pz = z + 20;
  const shot = () => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ARROW).length;
  const before = shot();
  set(x - 1, by, pz, REDSTONE_BLOCK);
  h.tick(2);
  set(x, by, pz, facingState(DISPENSER, EAST));
  const o = inv.open(x, by, pz)!;
  o.state.slots[0] = { id: ARROW, count: 2 };
  o.done();
  h.tick(6);
  assert.ok(!dispenserTriggered(get(x, by, pz)), 'puesto con potencia, no se dispara');
  assert.equal(shot(), before);
  set(x, by, pz + 1, STONE);
  h.tick(6);
  assert.equal(shot(), before + 1, 'con un aviso, sí');
});

test('dinamita: mecha, explosión como en Minecraft, cadena y agua', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx, z = bz;
  // Un muro de tierra al este y otro de obsidiana al oeste.
  for (let dy = 0; dy < 3; dy++) for (let dz = -3; dz <= 3; dz++) {
    set(x + 3, by + dy, z + dz, DIRT);
    set(x - 5, by + dy, z + dz, OBSIDIAN);
  }
  set(x, by, z, TNT);
  set(x - 3, by, z, TNT);
  h.tick(2);
  set(x, by, z + 1, REDSTONE_BLOCK);
  h.tick(1);
  assert.equal(get(x, by, z), AIR, 'se enciende');
  const tnt = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_TNT);
  assert.equal(tnt.length, 1);
  h.tick(70);
  assert.ok(h.gs.entities.list.has(tnt[0].id), 'aún no');
  h.tick(12);
  assert.ok(!h.gs.entities.list.has(tnt[0].id), 'explota a los 4 s');
  assert.equal(get(x + 3, by, z), AIR, 'rompe la tierra');
  assert.equal(get(x - 5, by, z), OBSIDIAN, 'no la obsidiana');
  assert.equal(get(x - 3, by, z), AIR, 'la otra dinamita se enciende (cadena)');
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_TNT).length, 1, 'con mecha corta');
  h.tick(40);
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_TNT).length, 0);
  // Resistencias y rayos (puros).
  assert.equal(blastResistance(OBSIDIAN), 1200);
  assert.equal(blastResistance(STONE), 6);
  assert.equal(blastResistance(WATER), 100);
  const grid = (a: number, b: number, c: number) => (Math.abs(a) <= 1 && Math.abs(b) <= 1 && Math.abs(c) <= 1 ? WATER : STONE);
  assert.equal(explodedBlocks(grid, 0.5, 0.5, 0.5, 4, Math.random).length, 0, 'en el agua no rompe nada');
  const open = (a: number, b: number, c: number) => (a === 3 && Math.abs(b) <= 1 && Math.abs(c) <= 1 ? DIRT : AIR);
  assert.ok(explodedBlocks(open, 0.5, 0.5, 0.5, 4, Math.random).length >= 9, 'la tierra a 3 bloques, sí');
});

test('vagonetas con tolva y con dinamita', () => {
  const { h, c, bx, by, bz, set } = lab();
  const x = bx - 6, z = bz - 16;
  c.pos(x + 2.5, by, z + 2.5);
  for (let i = 0; i < 6; i++) set(x + i, by, z, railState(1, RAIL_EW));
  set(x + 2, by + 1, z, CHEST);
  h.tick(2);
  c.send({ t: 'vplace', item: HOPPER_MINECART, p: [x + 2.5, by + 0.1, z + 0.5], b: [x + 2, by, z], yaw: -Math.PI / 2, q: 1 });
  h.tick(2);
  const cart = [...h.gs.entities.list.values()].find((e) => e.type === ENT_HOPPER_MINECART)!;
  assert.ok(cart, 'puesta');
  const inv = h.gs.sys.mechanisms.inventories;
  inv.open(x + 2, by + 1, z)!.state.slots[0] = { id: DIRT, count: 4 };
  h.tick(40);
  const [cx, cy, cz] = vehicleContainerPos(cart.id);
  const cartSlots = h.gs.sys.containers.access(cx, cy, cz)!.state.slots;
  const got = cartSlots.reduce((n, s) => n + (s?.count ?? 0), 0);
  assert.equal(got, 4, 'saca lo del cofre de encima');
  // Dinamita: en un raíl activador encendido se enciende y explota.
  const tz = bz + 16;
  c.pos(x + 1.5, by, tz + 3.5);
  for (let i = 0; i < 3; i++) set(x + i, by, tz, railState(RAIL_ACTIVATOR, RAIL_EW));
  set(x + 1, by, tz + 1, REDSTONE_BLOCK);
  h.tick(2);
  c.send({ t: 'vplace', item: TNT_MINECART, p: [x + 1.5, by + 0.1, tz + 0.5], b: [x + 1, by, tz], yaw: -Math.PI / 2, q: 2 });
  h.tick(4);
  const tcart = [...h.gs.entities.list.values()].find((e) => e.type === ENT_TNT_MINECART);
  assert.ok(tcart, 'puesta');
  h.tick(90);
  assert.ok(![...h.gs.entities.list.values()].some((e) => e.type === ENT_TNT_MINECART), 'ha explotado');
});

test('vagoneta con dinamita: rota corriendo se enciende y no se suelta; quieta, sí', () => {
  const { h, c, bx, by, bz, set } = lab();
  const x = bx - 20, z = bz - 20;
  for (let i = 0; i < 40; i++) {
    set(x + i, by, z, railState(1, RAIL_EW));
    set(x + i, by, z + 6, railState(1, RAIL_EW));
  }
  h.tick(2);
  const minera = h.join('Minera', 's');
  minera.send({ t: 'chat', m: '/gamemode supervivencia' });
  const place = (pz: number, q: number) => {
    c.pos(x + 2.5, by, pz + 2.5);
    c.send({ t: 'vplace', item: TNT_MINECART, p: [x + 2.5, by + 0.1, pz + 0.5], b: [x + 2, by, pz], yaw: -Math.PI / 2, q });
    h.tick(2);
    const e = [...h.gs.entities.list.values()].find((o) => o.type === ENT_TNT_MINECART && Math.floor(o.z) === pz)!;
    assert.ok(e, 'puesta');
    return e;
  };
  const cartItems = () => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === TNT_MINECART).length;
  const hit = (id: number, speed: number) => {
    for (let i = 0; i < 6 && h.gs.sys.transport.vehicleOf(id) && num(h.gs.sys.transport.vehicleOf(id)!.extra?.fuse) < 0; i++) {
      const v = h.gs.sys.transport.vehicleOf(id)!;
      v.cart!.vx = speed;
      minera.pos(v.e.x, by, v.e.z + 1.5);
      minera.send({ t: 'attack', e: id, item: 0 });
      h.tick(1);
    }
  };
  // Corriendo (8 bloques/s): se enciende con una mecha corta, no suelta nada y explota.
  const fast = place(z, 3);
  hit(fast.id, 8);
  assert.ok(h.gs.sys.transport.vehicleOf(fast.id), 'no se rompe');
  assert.ok(num(h.gs.sys.transport.vehicleOf(fast.id)!.extra?.fuse) >= 0, 'se enciende');
  assert.equal(cartItems(), 0, 'no se suelta');
  h.tick(45);
  assert.ok(!h.gs.entities.list.has(fast.id), 'explota');
  assert.equal(cartItems(), 0, 'y no suelta su objeto');
  // Quieta: se suelta sin explotar.
  const still = place(z + 6, 4);
  hit(still.id, 0);
  assert.ok(!h.gs.sys.transport.vehicleOf(still.id), 'rota');
  assert.equal(cartItems(), 1, 'suelta la vagoneta con dinamita');
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === ENT_TNT).length, 0);
});

const num = (v: unknown) => (typeof v === 'number' ? v : -1);

test('registro: recetas, colocación, huecos y texturas', () => {
  const C = COBBLESTONE, R = REDSTONE, P = ITEMS.findIndex((i) => i?.key === 'oak_planks');
  assert.equal(craft([P, P, P, C, IRON_INGOT, C, C, R, C])?.id, PISTON);
  assert.equal(craft([SLIME_BALL, 0, 0, PISTON, 0, 0, 0, 0, 0])?.id, STICKY_PISTON);
  assert.equal(craft([C, C, C, R, R, QUARTZ, C, C, C])?.id, OBSERVER);
  assert.equal(craft([IRON_INGOT, 0, IRON_INGOT, IRON_INGOT, CHEST, IRON_INGOT, 0, IRON_INGOT, 0])?.id, HOPPER);
  assert.equal(craft([C, C, C, C, BOW, C, C, R, C])?.id, DISPENSER);
  assert.equal(craft([C, C, C, C, 0, C, C, R, C])?.id, DROPPER);
  assert.equal(craft([GUNPOWDER, SAND, GUNPOWDER, SAND, GUNPOWDER, SAND, GUNPOWDER, SAND, GUNPOWDER])?.id, TNT);
  assert.equal(craft([HOPPER, MINECART, 0, 0, 0, 0, 0, 0, 0])?.id, HOPPER_MINECART);
  assert.equal(craft([MINECART, TNT, 0, 0, 0, 0, 0, 0, 0])?.id, TNT_MINECART);
  assert.deepEqual([mechanismSlots(HOPPER), mechanismSlots(DISPENSER), mechanismSlots(DROPPER)], [5, 9, 9]);
  assert.ok(TEXTURE_DEFS.length <= 1024);
  // Colocación: el pistón mira al jugador (también hacia arriba), el observador al revés y la tolva al bloque tocado.
  const hit = (nx: number, ny: number, nz: number): PlaceHit => ({ x: 0, y: 9, z: 0, nx, ny, nz, px: 0.5, py: 9.5, pz: 0.5, id: STONE });
  const floor = (_x: number, y: number) => (y === 9 ? STONE : AIR);
  assert.equal(facingOf(planPlacement(floor, hit(0, 1, 0), PISTON, 0)![0][3]), SOUTH, 'mirando al norte: el pistón mira al sur');
  assert.equal(facingOf(planPlacement(floor, hit(0, 1, 0), PISTON, 0, -1.2)![0][3]), UP, 'mirando hacia abajo: hacia arriba');
  assert.equal(facingOf(planPlacement(floor, hit(0, 1, 0), OBSERVER, 0)![0][3]), NORTH, 'el observador vigila hacia donde se mira');
  assert.equal(planPlacement(floor, hit(0, 1, 0), HOPPER, 0)![0][3], stateOf(HOPPER, { facing: 0 }), 'tolva sobre un bloque: hacia abajo');
  const side = planPlacement((x) => (x === 0 ? STONE : AIR), { ...hit(1, 0, 0), y: 10, py: 10.5 }, HOPPER, 0)!;
  assert.equal(side[0][3], stateOf(HOPPER, { facing: 4 }), 'en el lado este de un bloque: apunta al oeste, hacia él');
});
