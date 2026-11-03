// Fase 7 (redstone): potencia, polvo, antorchas, repetidores, comparadores, relojes, placas, puertas,
// lámparas, sensores, cofres trampa, pararrayos, bombillas, colocación, recetas y rendimiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, GLOWSTONE, CHEST, COBBLESTONE, REDSTONE_WIRE, wirePower, wireState, isWire, REDSTONE_BLOCK, REDSTONE_TORCH,
  REDSTONE_WALL_TORCH, torchLit, LEVER, mountedPowered, BUTTONS, PRESSURE_PLATES, LIGHT_WEIGHTED_PLATE, platePower, REPEATER,
  repeaterLocked, diodePowered, COMPARATOR, REDSTONE_LAMP, IRON_DOOR, IRON_TRAPDOOR, DOORS, NOTE_BLOCK, noteOf, TRAPPED_CHEST,
  LIGHTNING_ROD, rodPowered, COPPER_BULB, bulbLit, DAYLIGHT_DETECTOR, TARGET, TRIPWIRE_HOOK, TRIPWIRE, hookAttached, hookPowered,
  REDSTONE_ORE, LIT_REDSTONE_ORE, MOUNT_WALL, MOUNT_FLOOR, stateOf, stateProps, BLOCK_EMISSION, OAK_PLANKS, GOLD_BLOCK,
  isDoubleChest, isChest,
} from '../src/shared/blocks';
import {
  ITEMS, REDSTONE, STRING, QUARTZ, IRON_INGOT, STICK, GOLD_INGOT, COPPER_INGOT, CREATIVE_ITEMS, PLACEABLE_BLOCKS,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, isUsable, type PlaceHit } from '../src/shared/placement';
import { redstoneUseState, containerSignal } from '../src/shared/redstone';
import { blockDrops } from '../src/shared/sim/drops';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { makeServer, type Harness, type Client } from './harness';
import {
  RAIL, RAIL_POWERED, RAIL_DETECTOR, RAIL_PLAIN, RAIL_EW, RAIL_NS, RAIL_SE, RAIL_NE, RAIL_SHAPE, railState, railIsPowered, BREWING_STAND, CAKE, WATER_CAULDRON,
} from '../src/shared/blocks';
import { NETHER_WART } from '../src/shared/items';

const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: x + 0.5 + nx * 0.5, py: y + 0.5 + ny * 0.5, pz: z + 0.5 + nz * 0.5, id });
const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

/** Servidor con un solar de piedra despejado en y = 160 alrededor de (bx, bz). */
interface Lab {
  h: Harness;
  c: Client;
  bx: number;
  by: number;
  bz: number;
  set: (x: number, y: number, z: number, id: number) => void;
  get: (x: number, y: number, z: number) => number;
  /** El jugador se pone al lado (para alcanzar lo que usa) y hace clic derecho en (x, y, z). */
  use: (x: number, y: number, z: number) => void;
  /** Varias celdas a la vez (las dos mitades de una puerta). */
  edits: (e: [number, number, number, number][]) => void;
}

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
      for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return {
    h, c, bx, by, bz, set: (x, y, z, id) => void W.setBlock(x, y, z, id), get: (x, y, z) => W.getBlock(x, y, z),
    use: (x, y, z) => {
      c.pos(x + 0.5, y + 3, z + 0.5, 0);
      c.send({ t: 'use', x, y, z, yaw: 0 });
    },
    edits: (e) => h.gs.sys.rules.applyEdits(e),
  };
}

test('registro: bloques, objetos, texturas, colocación y recetas', () => {
  // El polvo lo pone el objeto de redstone y la cuerda tendida, la cuerda.
  assert.equal(ITEMS[REDSTONE].block, REDSTONE_WIRE);
  assert.equal(ITEMS[STRING].block, TRIPWIRE);
  assert.ok(PLACEABLE_BLOCKS.has(REDSTONE_WIRE) && PLACEABLE_BLOCKS.has(TRIPWIRE));
  assert.ok(CREATIVE_ITEMS.includes(QUARTZ));
  for (const id of [REDSTONE_TORCH, LEVER, REPEATER, COMPARATOR, REDSTONE_LAMP, NOTE_BLOCK, TRAPPED_CHEST, IRON_DOOR, TARGET]) {
    assert.ok(ITEMS[id], `${id} tiene objeto`);
  }
  assert.ok(TEXTURE_DEFS.length <= 1024);
  // Botín: el polvo suelta redstone; la mena encendida, lo mismo que la apagada; la cuerda, cuerda.
  assert.deepEqual(blockDrops(wireState(9, false), 0, () => 0.5), [{ id: REDSTONE, count: 1 }]);
  assert.deepEqual(blockDrops(TRIPWIRE, 0, () => 0.5), [{ id: STRING, count: 1 }]);
  assert.equal(blockDrops(LIT_REDSTONE_ORE, ITEMS.findIndex((i) => i?.key === 'iron_pickaxe'), () => 0.5)[0]?.id, REDSTONE);
  // Colocación.
  const air = () => AIR;
  const onFloor = planPlacement((_x, y) => (y === 9 ? STONE : AIR), hitOn(0, 9, 0, 0, 1, 0, STONE), REDSTONE_WIRE, 0);
  assert.deepEqual(onFloor, [[0, 10, 0, wireState(0, false)]]);
  assert.equal(planPlacement(air, hitOn(0, 9, 0, 0, 1, 0, GLOWSTONE), REDSTONE_WIRE, 0), null, 'el polvo necesita suelo');
  const wall = planPlacement((x) => (x === 0 ? STONE : AIR), hitOn(0, 10, 0, 1, 0, 0, STONE), LEVER, 0)!;
  assert.equal(stateProps(wall[0][3])!.mount, MOUNT_WALL);
  assert.equal(stateProps(wall[0][3])!.facing, 1, 'la palanca mira al este, hacia fuera de la pared');
  const floorLever = planPlacement((_x, y) => (y === 9 ? STONE : AIR), hitOn(0, 9, 0, 0, 1, 0, STONE), LEVER, 0)!;
  assert.equal(stateProps(floorLever[0][3])!.mount, MOUNT_FLOOR);
  // Repetidor: la salida hacia donde mira el jugador (yaw 0: norte).
  const rep = planPlacement((_x, y) => (y === 9 ? STONE : AIR), hitOn(0, 9, 0, 0, 1, 0, STONE), REPEATER, 0)!;
  assert.equal(stateProps(rep[0][3])!.facing, 0);
  // La puerta de hierro no se abre a mano; la de madera sí.
  assert.ok(!isUsable(IRON_DOOR) && !isUsable(IRON_TRAPDOOR) && isUsable(DOORS.oak));
  // Cofre trampa: es un cofre y se une en doble con otro cofre trampa (no con uno normal).
  assert.ok(isChest(TRAPPED_CHEST));
  const nextTo = planPlacement((x, y) => (y === 9 ? STONE : x === 1 && y === 10 ? TRAPPED_CHEST + 2 : AIR), hitOn(0, 9, 0, 0, 1, 0, STONE), TRAPPED_CHEST, 0)!;
  assert.equal(nextTo.length, 2);
  assert.ok(isDoubleChest(nextTo[0][3]) && isDoubleChest(nextTo[1][3]));
  // Usos: palanca, repetidor (retardo), comparador (modo) y bloque musical (tono).
  const lever = stateOf(LEVER, { mount: 1, facing: 0, powered: 0 });
  assert.ok(mountedPowered(redstoneUseState(lever, air)!));
  assert.equal(redstoneUseState(stateOf(REPEATER, { facing: 2, delay: 3 }), air), stateOf(REPEATER, { facing: 2, delay: 0 }));
  assert.equal(noteOf(redstoneUseState(stateOf(NOTE_BLOCK, { note: 24 }), air)!), 0);
  // Recetas como en Minecraft.
  const R = REDSTONE, T = REDSTONE_TORCH, S = STONE;
  assert.equal(craft([0, R, 0, 0, STICK, 0, 0, 0, 0])?.id, REDSTONE_TORCH);
  assert.equal(craft([T, R, T, S, S, S, 0, 0, 0])?.id, REPEATER);
  assert.equal(craft([0, T, 0, T, QUARTZ, T, S, S, S])?.id, COMPARATOR);
  assert.deepEqual(craft([R, R, R, R, R, R, R, R, R]), { id: REDSTONE_BLOCK, count: 1 });
  assert.equal(craft([0, R, 0, R, GLOWSTONE, R, 0, R, 0])?.id, REDSTONE_LAMP);
  assert.equal(craft([STICK, 0, 0, COBBLESTONE, 0, 0, 0, 0, 0])?.id, LEVER);
  assert.equal(craft([GOLD_INGOT, GOLD_INGOT, 0, 0, 0, 0, 0, 0, 0])?.id, LIGHT_WEIGHTED_PLATE);
  assert.equal(craft([IRON_INGOT, IRON_INGOT, 0, IRON_INGOT, IRON_INGOT, 0, IRON_INGOT, IRON_INGOT, 0])?.id, IRON_DOOR);
  assert.equal(craft([COPPER_INGOT, 0, 0, COPPER_INGOT, 0, 0, COPPER_INGOT, 0, 0])?.id, LIGHTNING_ROD[0][0]);
  assert.equal(craft([STONE, 0, 0, 0, 0, 0, 0, 0, 0])?.id, BUTTONS.stone);
  assert.equal(craft([OAK_PLANKS, OAK_PLANKS, 0, 0, 0, 0, 0, 0, 0])?.id, PRESSURE_PLATES.oak);
  assert.equal(craft([OAK_PLANKS, OAK_PLANKS, OAK_PLANKS, OAK_PLANKS, R, OAK_PLANKS, OAK_PLANKS, OAK_PLANKS, OAK_PLANKS])?.id, NOTE_BLOCK);
  assert.equal(craft([CHEST, TRIPWIRE_HOOK, 0, 0, 0, 0, 0, 0, 0])?.id, TRAPPED_CHEST);
  assert.equal(containerSignal([{ id: COBBLESTONE, count: 64 }, null, null]), 5);
  void GOLD_BLOCK;
});

test('polvo: 15 junto a la fuente y apagado a los 15 bloques; sube escalones', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x0 = bx - 10;
  set(x0, by, bz, REDSTONE_BLOCK);
  for (let i = 1; i <= 17; i++) set(x0 + i, by, bz, wireState(0, false));
  h.tick(1);
  assert.equal(wirePower(get(x0 + 1, by, bz)), 15);
  assert.equal(wirePower(get(x0 + 8, by, bz)), 8);
  assert.equal(wirePower(get(x0 + 15, by, bz)), 1, 'el 15.º bloque aún lleva 1');
  assert.equal(wirePower(get(x0 + 16, by, bz)), 0, 'el 16.º ya no');
  // Una lámpara al final no se enciende; al principio, sí.
  set(x0 + 18, by, bz, REDSTONE_LAMP);
  h.tick(2);
  assert.equal(get(x0 + 18, by, bz), REDSTONE_LAMP);
  // Quitar la fuente apaga la línea entera.
  set(x0, by, bz, AIR);
  h.tick(1);
  for (let i = 1; i <= 17; i++) assert.equal(wirePower(get(x0 + i, by, bz)), 0);
  // Escalón: el polvo sube a un bloque de piedra y baja al otro lado.
  const z = bz + 5;
  set(x0, by, z, REDSTONE_BLOCK);
  set(x0 + 1, by, z, wireState(0, false));
  set(x0 + 2, by, z, STONE);
  set(x0 + 2, by + 1, z, wireState(0, false));
  set(x0 + 3, by, z, wireState(0, false));
  h.tick(1);
  assert.deepEqual([wirePower(get(x0 + 1, by, z)), wirePower(get(x0 + 2, by + 1, z)), wirePower(get(x0 + 3, by, z))], [15, 14, 13]);
  // La piedra luminosa deja subir pero no bajar.
  set(x0 + 2, by, z, GLOWSTONE);
  h.tick(1);
  assert.equal(wirePower(get(x0 + 2, by + 1, z)), 14, 'sube por la piedra luminosa');
  assert.equal(wirePower(get(x0 + 3, by, z)), 0, 'pero no baja');
});

test('antorcha inversora, palanca y reloj de antorchas que se funde', () => {
  const { h, c, bx, by, bz, set, get, use } = lab();
  // Palanca en la cara oeste de un bloque; antorcha en su cara este.
  const x = bx, z = bz;
  set(x, by, z, STONE);
  set(x - 1, by, z, stateOf(LEVER, { mount: MOUNT_WALL, facing: 3, powered: 0 }));
  set(x + 1, by, z, stateOf(REDSTONE_WALL_TORCH, { facing: 1, off: 0 }));
  set(x + 2, by, z, wireState(0, false));
  h.tick(3);
  assert.ok(torchLit(get(x + 1, by, z)), 'sin potencia, la antorcha luce');
  assert.equal(wirePower(get(x + 2, by, z)), 15);
  use(x - 1, by, z);
  assert.ok(mountedPowered(get(x - 1, by, z)), 'la palanca cambia al momento');
  h.tick(1);
  assert.ok(torchLit(get(x + 1, by, z)), 'la antorcha tarda un tick de redstone');
  h.tick(2);
  assert.ok(!torchLit(get(x + 1, by, z)), 'y luego se apaga');
  assert.equal(wirePower(get(x + 2, by, z)), 0);
  // Reloj: antorcha en la cara norte de B, piedra encima de la antorcha y polvo encima de B.
  const cz = bz + 6;
  set(x, by, cz, STONE);
  set(x, by, cz - 1, stateOf(REDSTONE_WALL_TORCH, { facing: 0, off: 0 }));
  set(x, by + 1, cz - 1, STONE);
  set(x, by + 1, cz, wireState(0, false));
  c.conn.take('fx');
  let toggles = 0, last = get(x, by, cz - 1);
  for (let i = 0; i < 80; i++) {
    h.tick(1);
    const now = get(x, by, cz - 1);
    if (now !== last) toggles++;
    last = now;
  }
  assert.ok(toggles >= 8, `oscila (${toggles} cambios)`);
  assert.ok(!torchLit(get(x, by, cz - 1)), 'se ha fundido');
  assert.ok(c.conn.take('fx').some((m) => m.k === 'torch_burnout'), 'con humo y chisporroteo');
  // Fundida se queda apagada un rato…
  h.tick(40);
  assert.ok(!torchLit(get(x, by, cz - 1)));
  // …y, como en Java, no vuelve a encenderse sola: su tick de 160 se pierde contra el de 2 que ya tenía
  // programado. Pasado el enfriamiento, el siguiente aviso la enciende (y vuelve a oscilar).
  h.tick(200);
  assert.ok(!torchLit(get(x, by, cz - 1)), 'sigue fundida sin avisos');
  set(x - 1, by, cz - 1, STONE); // al lado de la antorcha: le llega el aviso
  let relit = false;
  for (let i = 0; i < 10 && !relit; i++) {
    h.tick(1);
    relit = torchLit(get(x, by, cz - 1));
  }
  assert.ok(relit, 'un aviso pasado el enfriamiento la vuelve a encender');
});

test('repetidor: retardo, prolonga pulsos cortos y se bloquea de lado', () => {
  const { h, bx, by, bz, set, get } = lab();
  const x = bx, z = bz;
  // Repetidor mirando al este con 4 ticks de redstone (8 de juego).
  set(x, by, z, stateOf(REPEATER, { facing: 1, delay: 3 }));
  set(x + 1, by, z, wireState(0, false));
  h.tick(1);
  set(x - 1, by, z, REDSTONE_BLOCK);
  h.gs.sys.redstone.flush();
  let on = -1;
  for (let t = 1; t <= 12 && on < 0; t++) {
    h.tick(1);
    if (wirePower(get(x + 1, by, z)) === 15) on = t;
  }
  assert.equal(on, 8, 'se enciende a los 8 ticks de juego');
  set(x - 1, by, z, AIR);
  h.gs.sys.redstone.flush();
  h.tick(7);
  assert.equal(wirePower(get(x + 1, by, z)), 15, 'aún encendido');
  h.tick(2);
  assert.equal(wirePower(get(x + 1, by, z)), 0, 'y se apaga con el mismo retardo');
  // Bloqueo: otro repetidor encendido que le da de lado (desde el sur, mirando al norte).
  set(x, by, z + 1, stateOf(REPEATER, { facing: 0, delay: 0 }));
  set(x, by, z + 2, REDSTONE_BLOCK);
  h.tick(4);
  assert.ok(repeaterLocked(get(x, by, z)), 'bloqueado');
  set(x - 1, by, z, REDSTONE_BLOCK);
  h.tick(12);
  assert.ok(!diodePowered(get(x, by, z)), 'bloqueado no cambia');
  set(x, by, z + 2, AIR);
  h.tick(12);
  assert.ok(!repeaterLocked(get(x, by, z)) && diodePowered(get(x, by, z)), 'desbloqueado recoge la entrada');
});

test('comparador: comparar, restar y leer un cofre', () => {
  const { h, c, bx, by, bz, set, get, use } = lab();
  const x = bx, z = bz;
  // Entrada de 12 por detrás (polvo a 4 bloques de un bloque de redstone) y 5 de lado.
  set(x, by, z, stateOf(COMPARATOR, { facing: 1 }));
  for (let i = 1; i <= 3; i++) set(x - i, by, z, wireState(0, false));
  set(x - 4, by, z, REDSTONE_BLOCK);
  set(x + 1, by, z, wireState(0, false));
  for (let i = 1; i <= 11; i++) set(x, by, z + i, wireState(0, false));
  set(x, by, z + 12, REDSTONE_BLOCK);
  h.tick(6);
  assert.equal(wirePower(get(x - 1, by, z)), 13);
  assert.equal(wirePower(get(x, by, z + 1)), 5);
  assert.equal(wirePower(get(x + 1, by, z)), 13, 'comparar: sale la de detrás (13 ≥ 5)');
  use(x, by, z);
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 8, 'restar: 13 − 5');
  // Leer un cofre (a través de un bloque): 10 pilas de 64 en 27 casillas → 6.
  const cz = bz + 14;
  set(x - 2, by, cz, CHEST);
  set(x - 1, by, cz, STONE);
  set(x, by, cz, stateOf(COMPARATOR, { facing: 1 }));
  set(x + 1, by, cz, wireState(0, false));
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, cz)), 0, 'cofre vacío');
  c.pos(x + 0.5, by + 2, cz + 0.5);
  c.send({ t: 'open', x: x - 2, y: by, z: cz });
  for (let i = 0; i < 10; i++) c.send({ t: 'cput', x: x - 2, y: by, z: cz, stack: { id: COBBLESTONE, count: 64 }, q: i + 1 });
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, cz)), 6, 'lee lo lleno que está');
  // Cofre trampa: da potencia mientras alguien lo tiene abierto.
  const tz = bz - 8;
  set(x, by, tz, TRAPPED_CHEST);
  set(x + 1, by, tz, REDSTONE_LAMP);
  h.tick(2);
  c.pos(x + 0.5, by + 2, tz + 0.5);
  c.send({ t: 'open', x, y: by, z: tz });
  h.tick(2);
  assert.equal(get(x + 1, by, tz), REDSTONE_LAMP + 1, 'abierto enciende la lámpara');
  c.send({ t: 'close' });
  h.tick(8);
  assert.equal(get(x + 1, by, tz), REDSTONE_LAMP, 'cerrado la apaga');
});

test('placas de presión, botones, puertas de hierro, lámparas, bombilla y bloque musical', () => {
  const { h, c, bx, by, bz, set, get, use, edits } = lab();
  const x = bx + 4, z = bz + 4;
  // Placa de piedra con una lámpara al lado y una puerta de hierro al otro.
  set(x, by, z, PRESSURE_PLATES.stone);
  set(x + 1, by, z, REDSTONE_LAMP);
  edits([[x - 1, by, z, stateOf(IRON_DOOR, { facing: 0, half: 0 })], [x - 1, by + 1, z, stateOf(IRON_DOOR, { facing: 0, half: 1 })]]);
  h.tick(2);
  c.pos(x + 0.5, by, z + 0.5);
  h.tick(2);
  assert.equal(platePower(get(x, by, z)), 15, 'el jugador la pisa');
  assert.equal(get(x + 1, by, z), REDSTONE_LAMP + 1, 'la lámpara luce');
  assert.ok(BLOCK_EMISSION[REDSTONE_LAMP + 1] === 15);
  assert.equal(stateProps(get(x - 1, by, z))!.open, 1, 'la puerta de hierro se abre');
  assert.equal(stateProps(get(x - 1, by + 1, z))!.open, 1, 'las dos mitades');
  c.pos(x + 6.5, by, z + 0.5);
  h.tick(10);
  assert.equal(platePower(get(x, by, z)), 15, 'sigue pulsada hasta su tick');
  h.tick(16);
  assert.equal(platePower(get(x, by, z)), 0);
  assert.equal(get(x + 1, by, z), REDSTONE_LAMP, 'la lámpara se apaga (con 4 ticks de retraso)');
  assert.equal(stateProps(get(x - 1, by, z))!.open, 0, 'la puerta se cierra');
  // A mano no se abre la puerta de hierro.
  use(x - 1, by, z);
  assert.equal(stateProps(get(x - 1, by, z))!.open, 0);
  // Placa ligera: una potencia por objeto.
  const lz = z + 4;
  set(x, by, lz, LIGHT_WEIGHTED_PLATE);
  h.tick(1);
  for (let i = 0; i < 3; i++) h.gs.entities.spawnItem({ id: COBBLESTONE, count: 1 }, x + 0.5, by + 0.05, lz + 0.5, 0, 0, 0, undefined, 5);
  h.tick(3);
  assert.equal(platePower(get(x, by, lz)), 3);
  // Botón de piedra: 20 ticks encendido.
  const pz = z + 8;
  set(x, by, pz, STONE);
  set(x + 1, by, pz, stateOf(BUTTONS.stone, { mount: MOUNT_WALL, facing: 1 }));
  set(x - 1, by, pz, REDSTONE_LAMP);
  h.tick(2);
  use(x + 1, by, pz);
  h.tick(2);
  assert.equal(get(x - 1, by, pz), REDSTONE_LAMP + 1, 'el botón carga el bloque y la lámpara de detrás se enciende');
  h.tick(19);
  assert.ok(!mountedPowered(get(x + 1, by, pz)), 'el botón vuelve a los 20 ticks');
  // Bombilla de cobre: cambia con cada pulso y da luz.
  const bz2 = z + 12;
  set(x, by, bz2, COPPER_BULB[0][0]);
  set(x + 1, by, bz2, stateOf(LEVER, { mount: MOUNT_FLOOR, facing: 0, powered: 0 }));
  h.tick(2);
  const lever = () => use(x + 1, by, bz2);
  lever();
  h.tick(2);
  assert.ok(bulbLit(get(x, by, bz2)) && BLOCK_EMISSION[get(x, by, bz2)] === 15, 'primer pulso: encendida');
  lever();
  h.tick(2);
  assert.ok(bulbLit(get(x, by, bz2)), 'quitar la potencia no la apaga');
  lever();
  h.tick(2);
  assert.ok(!bulbLit(get(x, by, bz2)), 'el segundo pulso la apaga');
  // Bloque musical: suena al recibir potencia (y con el clic sube un semitono).
  const nz = z + 16;
  set(x, by, nz, NOTE_BLOCK);
  set(x + 1, by, nz, stateOf(LEVER, { mount: MOUNT_FLOOR, facing: 0, powered: 0 }));
  h.tick(2);
  c.conn.take('fx');
  use(x, by, nz);
  assert.equal(noteOf(get(x, by, nz)), 1);
  use(x + 1, by, nz);
  h.tick(2);
  const notes = c.conn.take('fx').filter((m) => m.k === 'note');
  assert.equal(notes.length, 2, 'suena al tocarlo y al recibir potencia');
  assert.equal(notes[1].b, 1, 'con su tono');
});

test('sensor de luz solar, diana, gancho y cuerda, pararrayos y mena de redstone', () => {
  const { h, c, bx, by, bz, set, get, use } = lab();
  const x = bx - 6, z = bz - 6;
  // Sensor a cielo abierto: a mediodía da 15; invertido, de noche.
  set(x, by, z, DAYLIGHT_DETECTOR);
  c.send({ t: 'chat', m: '/time set noon' });
  h.tick(21);
  assert.equal(get(x, by, z) - DAYLIGHT_DETECTOR, 15, 'a mediodía, 15');
  use(x, by, z);
  assert.equal(get(x, by, z) - DAYLIGHT_DETECTOR, 16, 'invertido, 0 de día');
  c.send({ t: 'chat', m: '/time set midnight' });
  h.tick(21);
  assert.ok(get(x, by, z) - DAYLIGHT_DETECTOR - 16 >= 11, 'invertido, mucha de noche');
  // Diana: una flecha en el centro da 15.
  const tz = z + 4;
  set(x, by + 2, tz, TARGET);
  h.gs.sys.redstone.projectileHit('arrow', x, by + 2, tz, x - 0.02, by + 2.5, tz + 0.5);
  assert.equal(get(x, by + 2, tz) - TARGET, 15);
  h.gs.sys.redstone.projectileHit('arrow', x, by + 2, tz, x - 0.02, by + 2.9, tz + 0.5);
  h.tick(21);
  assert.equal(get(x, by + 2, tz), TARGET, 'vuelve a 0 al rato');
  h.gs.sys.redstone.projectileHit('arrow', x, by + 2, tz, x - 0.02, by + 2.95, tz + 0.5);
  assert.ok(get(x, by + 2, tz) - TARGET <= 2, 'en el borde, poca potencia');
  // Gancho, cuerda y gancho: al pisar la cuerda se activan.
  const gz = z + 8;
  set(x - 1, by, gz, STONE);
  set(x + 4, by, gz, STONE);
  set(x, by, gz, stateOf(TRIPWIRE_HOOK, { facing: 1 }));
  for (let i = 1; i <= 2; i++) set(x + i, by, gz, TRIPWIRE);
  set(x + 3, by, gz, stateOf(TRIPWIRE_HOOK, { facing: 3 }));
  h.tick(2);
  assert.ok(hookAttached(get(x, by, gz)) && hookAttached(get(x + 3, by, gz)), 'tendidos');
  c.pos(x + 1.5, by, gz + 0.5);
  h.tick(2);
  assert.ok(hookPowered(get(x, by, gz)) && hookPowered(get(x + 3, by, gz)), 'activados al pisarla');
  c.pos(x + 10.5, by, gz + 0.5);
  h.tick(14);
  assert.ok(!hookPowered(get(x, by, gz)), 'se desactivan al salir');
  // Pararrayos: atrae el rayo y da potencia un momento.
  const rz = z + 12;
  set(x, by, rz, LIGHTNING_ROD[0][0] + 2);
  h.tick(1);
  const target = h.gs.sys.redstone.lightningTarget(x + 30, by, rz + 20);
  assert.deepEqual(target, [x + 0.5, by + 1, rz + 0.5]);
  h.gs.sys.redstone.lightning(target![0], target![1], target![2]);
  assert.ok(rodPowered(get(x, by, rz)));
  h.tick(9);
  assert.ok(!rodPowered(get(x, by, rz)));
  // Mena de redstone: se enciende al pisarla.
  const oz = z + 16;
  set(x, by - 1, oz, REDSTONE_ORE);
  c.pos(x + 0.5, by, oz + 0.5);
  h.tick(2);
  assert.equal(get(x, by - 1, oz), LIT_REDSTONE_ORE);
});

test('raíles: propulsores con potencia (8 más en línea), detector y cruce en T', () => {
  const { h, bx, by, bz, set, get, use } = lab();
  // Línea de 12 propulsores; un bloque de redstone junto al primero enciende ése y 8 más.
  const x0 = bx - 8, z = bz - 10;
  for (let i = 0; i < 12; i++) set(x0 + i, by, z, railState(RAIL_POWERED, RAIL_EW));
  h.tick(1);
  set(x0, by, z - 1, REDSTONE_BLOCK);
  h.tick(1);
  const on = () => Array.from({ length: 12 }, (_, i) => (railIsPowered(get(x0 + i, by, z)) ? 1 : 0)).join('');
  assert.equal(on(), '111111111000');
  set(x0, by, z - 1, AIR);
  h.tick(1);
  assert.equal(on(), '000000000000');
  // También a través de un bloque: palanca en un bloque de piedra que está debajo de un raíl.
  set(x0 + 11, by - 1, z, STONE);
  set(x0 + 11, by - 1, z + 1, AIR);
  set(x0 + 11, by - 1, z + 1, stateOf(LEVER, { mount: MOUNT_WALL, facing: 2, powered: 0 }));
  use(x0 + 11, by - 1, z + 1);
  h.tick(1);
  assert.equal(on(), '000111111111', 'la palanca carga el bloque de debajo del último');
  // Detector: con una vagoneta encima da potencia (la lámpara de al lado se enciende) y se apaga al irse.
  const dz = bz - 14;
  set(x0, by, dz, railState(RAIL_DETECTOR, RAIL_EW));
  set(x0, by, dz + 1, REDSTONE_LAMP);
  h.tick(1);
  h.gs.sys.transport.rails.press(x0, by, dz);
  h.tick(1);
  assert.equal(get(x0, by, dz + 1), REDSTONE_LAMP + 1);
  h.tick(16);
  assert.equal(get(x0, by, dz + 1), REDSTONE_LAMP);
  // Cruce en T: sin potencia tuerce hacia el sur y el este; con potencia, hacia el norte y el este.
  const tx = bx + 8, tz = bz - 14;
  set(tx, by, tz - 1, railState(RAIL_PLAIN, RAIL_NS));
  set(tx, by, tz + 1, railState(RAIL_PLAIN, RAIL_NS));
  set(tx + 1, by, tz, railState(RAIL_PLAIN, RAIL_EW));
  set(tx, by, tz, railState(RAIL_PLAIN, RAIL_SE));
  h.tick(1);
  // Como en Java, sólo cambia con el aviso de un emisor: la palanca (al poner un bloque de redstone, el aviso
  // lo da el aire que había antes y el cruce no se entera).
  set(tx - 1, by, tz, REDSTONE_BLOCK);
  h.tick(1);
  assert.equal(RAIL_SHAPE[get(tx, by, tz)], RAIL_SE, 'el bloque de redstone recién puesto no avisa como emisor');
  set(tx - 1, by, tz, AIR);
  set(tx - 1, by, tz, stateOf(LEVER, { mount: 0, facing: 0, powered: 0 }));
  use(tx - 1, by, tz);
  h.tick(1);
  assert.equal(RAIL_SHAPE[get(tx, by, tz)], RAIL_NE, 'con potencia cambia de lado');
  set(tx - 1, by, tz, AIR);
  h.tick(1);
  assert.equal(RAIL_SHAPE[get(tx, by, tz)], RAIL_SE, 'y vuelve sin ella');
  void RAIL;
});

test('comparador: lee el alambique, la tarta y el caldero', () => {
  const { h, c, bx, by, bz, set, get } = lab();
  const x = bx + 10, z = bz + 10;
  set(x, by, z, stateOf(COMPARATOR, { facing: 1 }));
  set(x + 1, by, z, wireState(0, false));
  set(x - 1, by, z, BREWING_STAND);
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 0, 'alambique vacío');
  c.pos(x + 0.5, by + 2, z + 0.5);
  c.send({ t: 'open', x: x - 1, y: by, z });
  // (La verruga se queda en el hueco del ingrediente: sin combustible no destila. El polvo de blaze, en
  // cambio, se consume al momento como combustible y el comparador ni lo llega a ver, como en Java.)
  c.send({ t: 'cput', x: x - 1, y: by, z, stack: { id: NETHER_WART, count: 1 }, q: 1 });
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 1, 'con algo dentro, 1');
  c.send({ t: 'close' });
  set(x - 1, by, z, CAKE);
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 14, 'tarta entera: 14');
  set(x - 1, by, z, stateOf(CAKE, { bites: 3 }));
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 8, 'con tres mordiscos: 8');
  set(x - 1, by, z, stateOf(WATER_CAULDRON, { level: 1 }));
  h.tick(4);
  assert.equal(wirePower(get(x + 1, by, z)), 2, 'caldero con dos tercios: 2');
});

test('rendimiento: una red grande y varios relojes sin pasarse de tiempo', () => {
  const { h, c, bx, by, bz, set, get } = lab(99);
  // Cuadrícula de 40×40 de polvo alimentada por una palanca.
  const x0 = bx - 20, z0 = bz - 20;
  for (let dx = 0; dx < 40; dx++) for (let dz = 0; dz < 40; dz++) set(x0 + dx, by, z0 + dz, wireState(0, false));
  set(x0 - 1, by, z0, STONE);
  set(x0 - 2, by, z0, stateOf(LEVER, { mount: MOUNT_WALL, facing: 3, powered: 0 }));
  // Diez relojes (antorcha + repetidor de 4 que la realimenta: cambia cada 10 ticks, sin fundirse).
  const clocks: number[] = [];
  for (let k = 0; k < 10; k++) {
    const x = x0 + k * 4, z = z0 + 41;
    set(x, by, z, STONE);
    set(x, by, z + 1, stateOf(REDSTONE_WALL_TORCH, { facing: 2, off: 0 }));
    set(x, by, z + 2, stateOf(REPEATER, { facing: 2, delay: 3 }));
    for (const [dx, dz] of [[0, 3], [1, 3], [2, 3], [2, 2], [2, 1], [2, 0], [1, 0]]) set(x + dx, by, z + dz, wireState(0, false));
    clocks.push(x);
  }
  h.tick(5);
  let toggles = 0;
  const torchAt = (x: number) => get(x, by, z0 + 42);
  let prev = clocks.map(torchAt);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) {
    c.pos(x0 - 1.5, by + 3, z0 + 0.5);
    c.send({ t: 'use', x: x0 - 2, y: by, z: z0, yaw: 0 });
    for (let t = 0; t < 10; t++) {
      h.tick(1);
      const now = clocks.map(torchAt);
      toggles += now.filter((v, j) => v !== prev[j]).length;
      prev = now;
    }
    assert.equal(wirePower(get(x0 + 5, by, z0)), i % 2 === 0 ? 10 : 0, 'la red sigue a la palanca');
  }
  const ms = (performance.now() - t0) / 100;
  assert.ok(isWire(get(x0 + 39, by, z0 + 39)));
  assert.ok(toggles >= 80, `los relojes siguen andando (${toggles} cambios)`);
  assert.ok(clocks.every((x) => get(x, by, z0 + 42) !== AIR), 'ninguna antorcha se ha roto');
  console.log(`rendimiento: ${ms.toFixed(3)} ms por tick, ${h.gs.sys.redstone.updates} avisos, ${h.gs.sys.redstone.scheduledCount} ticks pendientes`);
  // El tiempo depende de la máquina (con la suite entera va al doble): margen amplio, y el trabajo
  // (número de avisos) se comprueba aparte, que no depende de la carga.
  assert.ok(ms < 15, `${ms.toFixed(2)} ms por tick de media`);
  // Auditoría de la redstone: el polvo va cable a cable como en Java (cada cambio avisa a los vecinos de sus
  // siete posiciones), así que hay más avisos que cuando se resolvía la red de una vez.
  assert.ok(h.gs.sys.redstone.updates < 250000, `${h.gs.sys.redstone.updates} avisos`);
  assert.ok(h.gs.sys.redstone.scheduledCount < 100);
});
