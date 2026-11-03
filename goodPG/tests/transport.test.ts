// Fase 7 (transporte): barcas, raíles y vagonetas (registro, recetas, formas de los raíles, física de
// la vagoneta en curvas, cuestas y propulsores, barca que flota y avanza, subir y bajar, cofres y
// guardado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, ICE, BLUE_ICE, CHEST, FURNACE, RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL, RAIL_SHAPE, RAIL_NS, RAIL_EW,
  RAIL_ASC_E, RAIL_ASC_N, RAIL_SE, RAIL_SW, RAIL_NW, RAIL_NE, RAIL_POWERED, railState, railIsPowered, isRail, BLOCKS,
  blockSupported, INVENTORY_ORDER,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, BOAT_ITEMS, CHEST_BOAT_ITEMS, MINECART, CHEST_MINECART, FURNACE_MINECART, IRON_INGOT, STICK, GOLD_INGOT,
  REDSTONE, COAL, itemSpriteIndex,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { planRail, railPowerEdits } from '../src/shared/rails';
import {
  ENT_BOAT, ENT_CHEST_BOAT, ENT_MINECART, ENT_CHEST_MINECART, ENT_FURNACE_MINECART, BOAT_WOODS, vehicleContainerPos, isVehicleType,
} from '../src/shared/vehicles';
import { vehicleForItem, itemForVehicle } from '../src/shared/vehicleItems';
import { boatStep, BOAT_IN_WATER, type BoatBody } from '../src/shared/sim/vehicles/boatPhysics';
import { cartStep, railHeight, type CartBody } from '../src/shared/sim/vehicles/cartPhysics';
import { MOB_PIG, ENT_ITEM } from '../src/shared/mobs';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer, type Client, type Harness } from './harness';

// ------------------------------------------------------------------ mundo de pruebas

class MapWorld {
  cells = new Map<string, number>();
  getBlock(x: number, y: number, z: number): number {
    return this.cells.get(`${x},${y},${z}`) ?? AIR;
  }
  set(x: number, y: number, z: number, id: number): void {
    this.cells.set(`${x},${y},${z}`, id);
  }
  /** Suelo de piedra en y − 1 en el rectángulo dado. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, id = STONE): void {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.set(x, y - 1, z, id);
  }
  /** Pone un raíl como el jugador (se une solo a los vecinos). */
  rail(x: number, y: number, z: number, base = RAIL, facing = 0): void {
    const edits = planRail((a, b, c) => this.getBlock(a, b, c), x, y, z, base, facing, (id) => id !== AIR);
    assert.ok(edits, `raíl en ${x},${y},${z}`);
    for (const [a, b, c, id] of edits!) this.set(a, b, c, id);
  }
  shape(x: number, y: number, z: number): number {
    return RAIL_SHAPE[this.getBlock(x, y, z)];
  }
}

function newCart(x: number, y: number, z: number, vx = 0, vz = 0): CartBody {
  return { x, y, z, vx, vy: 0, vz, yaw: 0, pitch: 0, flipped: false, onRails: false, onGround: false, inWater: false, occupied: false };
}

const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;

// ------------------------------------------------------------------ registro y recetas

test('registro: objetos, bloques, sprites y recetas del transporte', () => {
  assert.equal(Object.keys(BOAT_ITEMS).length, BOAT_WOODS.length);
  for (const wood of BOAT_WOODS) {
    for (const id of [BOAT_ITEMS[wood], CHEST_BOAT_ITEMS[wood]]) {
      assert.ok(ITEMS[id] && ITEMS[id].stack === 1, `${wood}: objeto de 1`);
      assert.ok(CREATIVE_ITEMS.includes(id), `${ITEMS[id].key}: en el creativo`);
      assert.ok(itemSpriteIndex(id) >= 0, `${ITEMS[id].key}: sprite`);
    }
    assert.deepEqual(vehicleForItem(BOAT_ITEMS[wood]), { type: ENT_BOAT, variant: BOAT_WOODS.indexOf(wood) });
    assert.equal(itemForVehicle(ENT_CHEST_BOAT, BOAT_WOODS.indexOf(wood)), CHEST_BOAT_ITEMS[wood]);
  }
  assert.equal(ITEMS[BOAT_ITEMS.bamboo].key, 'bamboo_raft');
  for (const [item, type] of [[MINECART, ENT_MINECART], [CHEST_MINECART, ENT_CHEST_MINECART], [FURNACE_MINECART, ENT_FURNACE_MINECART]]) {
    assert.equal(vehicleForItem(item)?.type, type);
    assert.ok(isVehicleType(type));
    assert.ok(itemSpriteIndex(item) >= 0, `${ITEMS[item].key}: sprite`);
  }
  for (const r of [RAIL, POWERED_RAIL, DETECTOR_RAIL, ACTIVATOR_RAIL]) {
    assert.ok(ITEMS[r], `${BLOCKS[r].key}: objeto`);
    assert.ok(INVENTORY_ORDER.includes(r), `${BLOCKS[r].key}: en el creativo`);
    assert.equal(BLOCKS[r].solid, false);
  }
  // Recetas (como en Minecraft).
  const planks = ITEMS.findIndex((it) => it?.key === 'oak_planks');
  assert.deepEqual(craft([planks, 0, planks, planks, planks, planks, 0, 0, 0]), { id: BOAT_ITEMS.oak, count: 1 });
  const bamboo = ITEMS.findIndex((it) => it?.key === 'bamboo_planks');
  assert.deepEqual(craft([bamboo, 0, bamboo, bamboo, bamboo, bamboo, 0, 0, 0]), { id: BOAT_ITEMS.bamboo, count: 1 });
  assert.equal(matchRecipe([BOAT_ITEMS.cherry, CHEST, 0, 0], 2)?.out.id, CHEST_BOAT_ITEMS.cherry);
  const I = IRON_INGOT;
  assert.deepEqual(craft([I, 0, I, I, I, I, 0, 0, 0]), { id: MINECART, count: 1 });
  assert.equal(matchRecipe([MINECART, CHEST, 0, 0], 2)?.out.id, CHEST_MINECART);
  assert.equal(matchRecipe([MINECART, FURNACE, 0, 0], 2)?.out.id, FURNACE_MINECART);
  assert.deepEqual(craft([I, 0, I, I, STICK, I, I, 0, I]), { id: RAIL, count: 16 });
  const G = GOLD_INGOT;
  assert.deepEqual(craft([G, 0, G, G, STICK, G, G, REDSTONE, G]), { id: POWERED_RAIL, count: 6 });
});

// ------------------------------------------------------------------ formas de los raíles

test('raíles: rectos, curvas, cuestas y uniones como en Minecraft', () => {
  const w = new MapWorld();
  w.floor(-5, -5, 10, 10, 0);
  // Uno solo: según hacia dónde mira el jugador.
  w.rail(0, 0, 0, RAIL, 0);
  assert.equal(w.shape(0, 0, 0), RAIL_NS);
  // Otro al este: los dos se tuercen a este-oeste.
  w.rail(1, 0, 0, RAIL, 0);
  assert.equal(w.shape(0, 0, 0), RAIL_EW);
  assert.equal(w.shape(1, 0, 0), RAIL_EW);
  // Uno al sur del segundo: el segundo se hace curva (oeste-sur) y el nuevo va norte-sur.
  w.rail(1, 0, 1, RAIL, 1);
  assert.equal(w.shape(1, 0, 0), RAIL_SW);
  assert.equal(w.shape(1, 0, 1), RAIL_NS);
  // Un raíl ya unido por los dos lados no se tuerce hacia uno nuevo.
  w.rail(1, 0, -1, RAIL, 0);
  assert.equal(w.shape(1, 0, 0), RAIL_SW, 'la curva sigue igual');
  // Cuesta: un raíl más arriba al este del extremo.
  w.set(3, 0, 5, STONE);
  w.rail(2, 0, 5, RAIL, 1);
  w.rail(3, 1, 5, RAIL, 1);
  assert.equal(w.shape(2, 0, 5), RAIL_ASC_E, 'sube hacia el este');
  assert.equal(w.shape(3, 1, 5), RAIL_EW);
  // Las cuatro curvas.
  const c = new MapWorld();
  c.floor(-5, -5, 5, 5, 0);
  c.rail(1, 0, 0);
  c.rail(0, 0, 1);
  c.rail(0, 0, 0);
  assert.equal(c.shape(0, 0, 0), RAIL_SE);
  for (const [ax, az, bx, bz, want] of [[-1, 0, 0, 1, RAIL_SW], [-1, 0, 0, -1, RAIL_NW], [1, 0, 0, -1, RAIL_NE]] as const) {
    const m = new MapWorld();
    m.floor(-5, -5, 5, 5, 0);
    m.rail(ax, 0, az);
    m.rail(bx, 0, bz);
    m.rail(0, 0, 0);
    assert.equal(m.shape(0, 0, 0), want);
  }
  // Cruce en T sin redstone: curva sur-este (como en Minecraft).
  const t = new MapWorld();
  t.floor(-5, -5, 5, 5, 0);
  t.rail(-1, 0, 0, RAIL, 1);
  t.rail(1, 0, 0, RAIL, 1);
  t.rail(0, 0, 1, RAIL, 0);
  t.rail(0, 0, 0, RAIL, 1);
  assert.equal(t.shape(0, 0, 0), RAIL_SE);
  // El propulsor no hace curvas.
  const p = new MapWorld();
  p.floor(-5, -5, 5, 5, 0);
  p.rail(1, 0, 0);
  p.rail(0, 0, 1);
  p.rail(0, 0, 0, POWERED_RAIL);
  assert.ok([RAIL_NS, RAIL_EW].includes(p.shape(0, 0, 0) as 0 | 1));
  // Sin suelo no se pone; la cuesta se cae si le quitan el bloque del lado alto.
  const air = new MapWorld();
  assert.equal(planRail((x, y, z) => air.getBlock(x, y, z), 0, 5, 0, RAIL, 0, (id) => id !== AIR), null);
  const slope = railState(1, RAIL_ASC_E);
  assert.equal(blockSupported(slope, (dx, dy) => (dy === -1 ? STONE : AIR)), false);
  assert.equal(blockSupported(slope, (dx, dy) => (dy === -1 || dx === 1 ? STONE : AIR)), true);
  // Por planPlacement (lo que usa el cliente y el servidor).
  const hit: PlaceHit = { x: 0, y: -1, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 0, pz: 0.5, id: STONE };
  const edits = planPlacement((x, y, z) => (y === -1 ? STONE : AIR), hit, RAIL, Math.PI / 2);
  assert.ok(edits && isRail(edits[0][3]) && edits[0][1] === 0);
});

test('raíles: el propulsor enciende hasta 8 raíles en línea', () => {
  const w = new MapWorld();
  w.floor(-2, -2, 20, 2, 0);
  for (let x = 0; x < 12; x++) w.rail(x, 0, 0, POWERED_RAIL, 1);
  const get = (x: number, y: number, z: number) => w.getBlock(x, y, z);
  const edits = railPowerEdits(get, 0, 0, 0, (x) => (x === 0 ? 1 : 0));
  for (const [x, y, z, id] of edits) w.set(x, y, z, id);
  for (let x = 0; x <= 8; x++) assert.ok(railIsPowered(w.getBlock(x, 0, 0)), `encendido en x = ${x}`);
  assert.ok(!railIsPowered(w.getBlock(9, 0, 0)), 'el noveno ya no');
});

// ------------------------------------------------------------------ física de la vagoneta

test('vagoneta: sigue la curva y sube y baja cuestas', () => {
  const w = new MapWorld();
  w.floor(-2, -4, 12, 12, 0);
  // Vía hacia el este (x 0..5) que gira al sur en x = 6 y sigue hacia el sur.
  for (let x = 0; x <= 5; x++) w.rail(x, 0, 0, RAIL, 1);
  w.rail(6, 0, 1);
  for (let z = 2; z <= 8; z++) w.rail(6, 0, z);
  w.rail(6, 0, 0);
  assert.equal(w.shape(6, 0, 0), RAIL_SW, 'curva oeste-sur');
  const c = newCart(0.5, railHeight(w, 0.5, 0.5, 0.5)!, 0.5, 0.4, 0);
  for (let i = 0; i < 40; i++) cartStep(c, w);
  assert.ok(Math.abs(c.x - 6.5) < 0.01, `va por la vía hacia el sur (x = ${c.x.toFixed(2)})`);
  assert.ok(c.z > 2, `ha girado (z = ${c.z.toFixed(2)})`);
  assert.ok(c.vz > 0 && Math.abs(c.vx) < 1e-6, 'y avanza hacia el sur');
  assert.ok(Math.abs(c.y - 0.0625) < 1e-6, 'a la altura del raíl');
  // Cuesta: arriba en x = 3 (y = 1); una vagoneta parada arriba baja sola y gana velocidad.
  const s = new MapWorld();
  s.floor(-2, -2, 12, 2, 0);
  s.set(3, 0, 0, STONE);
  s.set(4, 0, 0, STONE);
  for (let x = 0; x <= 2; x++) s.rail(x, 0, 0, RAIL, 1);
  s.rail(3, 1, 0, RAIL, 1);
  s.rail(4, 1, 0, RAIL, 1);
  s.rail(2, 0, 0, RAIL, 1);
  assert.equal(s.shape(2, 0, 0), RAIL_ASC_E);
  const d = newCart(2.6, railHeight(s, 2.6, 1.5, 0.5)!, 0.5, -0.01, 0);
  let top = 0;
  for (let i = 0; i < 30; i++) {
    cartStep(d, s);
    top = Math.max(top, Math.abs(d.vx));
    if (d.x < 1.5) break;
  }
  assert.ok(d.x < 1.6, `bajó la cuesta (x = ${d.x.toFixed(2)})`);
  assert.ok(top > 0.05, `ganó velocidad (${top.toFixed(3)})`);
  assert.ok(Math.abs(d.y - 0.0625) < 1e-6, `está abajo (y = ${d.y.toFixed(3)})`);
  // Subir con impulso: la misma vagoneta lanzada hacia el este sube.
  const u = newCart(0.5, 0.0625, 0.5, 0.4, 0);
  let up = 0;
  for (let i = 0; i < 20; i++) {
    cartStep(u, s);
    if (u.x > 3.2 && u.x < 4.8) up = u.y;
  }
  assert.ok(Math.abs(up - 1.0625) < 1e-6, `subió (y = ${up.toFixed(3)})`);
});

test('vagoneta: el propulsor encendido acelera y el apagado frena', () => {
  const w = new MapWorld();
  w.floor(-2, -2, 30, 2, 0);
  w.set(-1, 0, 0, STONE);
  for (let x = 0; x <= 25; x++) w.rail(x, 0, 0, x === 0 ? POWERED_RAIL : RAIL, 1);
  // Gancho de la redstone forzado a true: el propulsor está encendido.
  w.set(0, 0, 0, railState(RAIL_POWERED, RAIL_EW, true));
  // Parada contra el bloque del oeste: sale hacia el este.
  const c = newCart(0.5, 0.0625, 0.5);
  for (let i = 0; i < 60; i++) cartStep(c, w);
  assert.ok(c.x > 5, `salió disparada (x = ${c.x.toFixed(2)})`);
  // Apagado: frena en seco.
  const off = new MapWorld();
  off.floor(-2, -2, 30, 2, 0);
  for (let x = 0; x <= 25; x++) off.rail(x, 0, 0, x === 5 ? POWERED_RAIL : RAIL, 1);
  const b = newCart(0.5, 0.0625, 0.5, 0.3, 0);
  for (let i = 0; i < 80; i++) cartStep(b, off);
  assert.ok(b.x < 7 && Math.hypot(b.vx, b.vz) < 1e-6, `se paró en el propulsor apagado (x = ${b.x.toFixed(2)})`);
});

// ------------------------------------------------------------------ física de la barca

test('barca: flota en el agua, avanza al remar y vuela sobre el hielo', () => {
  const w = new MapWorld();
  for (let x = -10; x <= 10; x++) for (let z = -60; z <= 6; z++) {
    w.set(x, -1, z, STONE);
    w.set(x, 0, z, WATER);
  }
  const b: BoatBody = { x: 0.5, y: 1.5, z: 0.5, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, status: 4, waterLevel: 0, onGround: false, underTicks: 0 };
  for (let i = 0; i < 60; i++) boatStep(b, w);
  assert.equal(b.status, BOAT_IN_WATER, 'flota');
  assert.ok(b.y > 0.3 && b.y < 1, `a flote (y = ${b.y.toFixed(3)})`);
  const y0 = b.y;
  // Hacia delante (yaw 0 = hacia el norte, −z).
  for (let i = 0; i < 40; i++) boatStep(b, w, { forward: true, back: false, left: false, right: false });
  assert.ok(b.z < -2, `avanza (z = ${b.z.toFixed(2)})`);
  assert.ok(Math.abs(b.y - y0) < 0.1, 'sin hundirse');
  // Girar a la izquierda sube el yaw.
  const yaw = b.yaw;
  for (let i = 0; i < 10; i++) boatStep(b, w, { forward: false, back: false, left: true, right: false });
  assert.ok(b.yaw > yaw, 'gira');
  // Sobre hielo azul corre muchísimo más que sobre hielo normal, y éste más que sobre piedra.
  const speedOn = (floor: number) => {
    const g = new MapWorld();
    for (let x = -5; x <= 5; x++) for (let z = -400; z <= 5; z++) g.set(x, -1, z, floor);
    const k: BoatBody = { x: 0.5, y: 0, z: 0.5, vx: 0, vy: 0, vz: 0, yaw: 0, spin: 0, status: 3, waterLevel: 0, onGround: true, underTicks: 0 };
    for (let i = 0; i < 100; i++) boatStep(k, g, { forward: true, back: false, left: false, right: false });
    return Math.hypot(k.vx, k.vz) * 20;
  };
  const stone = speedOn(STONE), ice = speedOn(ICE), blue = speedOn(BLUE_ICE);
  assert.ok(stone < 2, `en piedra, despacio (${stone.toFixed(1)} m/s)`);
  assert.ok(ice > 15 && blue > ice * 1.3, `hielo ${ice.toFixed(1)} m/s, hielo azul ${blue.toFixed(1)} m/s`);
});

// ------------------------------------------------------------------ servidor

function yard(store = new MemoryStore(), mode: 's' | 'c' = 's'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(7070, store);
  const c = h.join('Barquera', mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    // Mitad oeste: un estanque; mitad este: suelo de piedra.
    W.setBlock(bx + dx, by - 1, bz + dz, dx < 0 ? WATER : STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const vehicles = (h: Harness, type?: number) => [...h.gs.entities.list.values()].filter((e) => isVehicleType(e.type) && (type === undefined || e.type === type));
const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: poner una barca en el agua, que flote, subir, remar, bajar y romperla', () => {
  const { h, c, bx, by, bz } = yard();
  c.send({ t: 'vplace', item: BOAT_ITEMS.spruce, p: [bx - 3.5, by - 0.1, bz + 0.5], yaw: 0, q: 1 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.take, 1, 'se gasta la barca');
  h.tick(40);
  const [boat] = vehicles(h, ENT_BOAT);
  assert.ok(boat, 'hay barca');
  assert.equal(boat.variant, BOAT_WOODS.indexOf('spruce'));
  assert.ok(h.gs.sys.transport.floating(h.gs.sys.transport.vehicleOf(boat.id)!), 'flota');
  assert.ok(boat.y > by - 1 && boat.y < by, `a flote (y = ${boat.y.toFixed(2)})`);
  // Subirse.
  c.pos(boat.x + 1, by, boat.z);
  c.send({ t: 'vride', e: boat.id });
  const pass = c.conn.take('vpass').pop();
  assert.deepEqual(pass?.p, [c.welcome.id, 0], 'va delante');
  assert.equal(h.gs.sys.transport.rideOf(c.welcome.id), boat.id);
  // Remar: el cliente manda la posición de la barca; el servidor la acepta si es alcanzable.
  const x0 = boat.x;
  for (let i = 1; i <= 10; i++) {
    h.tick(2);
    c.send({ t: 'vpos', e: boat.id, p: [x0 - i * 0.2, boat.y, boat.z], r: Math.PI / 2, v: [-0.1, 0, 0], k: 3 });
  }
  h.tick(1);
  assert.ok(boat.x < x0 - 1.5, `avanzó (x = ${boat.x.toFixed(2)})`);
  assert.ok((boat.flags & (3 << 24)) !== 0, 'con los remos moviéndose');
  // Un salto imposible se rechaza.
  c.send({ t: 'vpos', e: boat.id, p: [boat.x + 200, boat.y, boat.z], r: 0, v: [0, 0, 0] });
  assert.equal(c.conn.take('vfix').length, 1, 'posición rechazada');
  // Mientras rema un jugador, las criaturas no se meten solas (como en Minecraft).
  const pig = h.gs.entities.spawnMob(MOB_PIG, boat.x + 0.3, boat.y, boat.z)!;
  h.tick(3);
  assert.equal(pig.vehicle, undefined, 'con remero no se sube');
  // Bajarse.
  c.send({ t: 'vleave' });
  assert.equal(h.gs.sys.transport.rideOf(c.welcome.id), undefined);
  // Sin nadie remando, la criatura pequeña que choca se sube.
  pig.x = boat.x + 0.3;
  pig.z = boat.z;
  h.tick(3);
  assert.equal(pig.vehicle, boat.id, 'el cerdo se ha subido');
  // El jugador vuelve a subir: él delante y el cerdo detrás.
  c.send({ t: 'vride', e: boat.id });
  assert.deepEqual(c.conn.take('vpass').pop()?.p, [c.welcome.id, pig.id]);
  c.send({ t: 'vleave' });
  // Romperla a golpes: suelta la barca de abeto.
  for (let i = 0; i < 6 && vehicles(h, ENT_BOAT).length; i++) c.send({ t: 'attack', e: boat.id, item: 0 });
  assert.equal(vehicles(h, ENT_BOAT).length, 0, 'rota');
  assert.equal(itemsOf(h, BOAT_ITEMS.spruce), 1);
  assert.equal(pig.vehicle, undefined, 'el cerdo se ha bajado');
});

test('servidor: vagonetas en los raíles (poner, subir, cofre, horno) y guardado', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = yard(store);
  const W = h.gs.world;
  // Vía de 8 hacia el este sobre la piedra.
  for (let x = 1; x <= 8; x++) {
    c.send({ t: 'place', x: bx + x, y: by - 1, z: bz, n: [0, 1, 0], p: [bx + x + 0.5, by, bz + 0.5], item: RAIL, yaw: -Math.PI / 2 });
  }
  assert.equal(RAIL_SHAPE[W.getBlock(bx + 1, by, bz)], RAIL_EW);
  // Fuera de un raíl no se pone.
  c.send({ t: 'vplace', item: MINECART, p: [bx + 0.5, by, bz + 3.5], b: [bx, by - 1, bz + 3], yaw: 0, q: 1 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.ok, false);
  c.send({ t: 'vplace', item: MINECART, p: [bx + 2.5, by + 0.1, bz + 0.5], b: [bx + 2, by, bz], yaw: -Math.PI / 2, q: 2 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 2)?.ok, true);
  const [cart] = vehicles(h, ENT_MINECART);
  assert.ok(cart && Math.abs(cart.y - (by + 0.0625)) < 1e-6, 'sobre el raíl');
  // Subirse y bajarse.
  c.send({ t: 'vride', e: cart.id });
  assert.equal(h.gs.sys.transport.rideOf(c.welcome.id), cart.id);
  c.send({ t: 'vleave' });
  assert.equal(h.gs.sys.transport.rideOf(c.welcome.id), undefined);
  // Vagoneta con cofre: su inventario se abre como un cofre.
  c.send({ t: 'vplace', item: CHEST_MINECART, p: [bx + 6.5, by + 0.1, bz + 0.5], b: [bx + 6, by, bz], yaw: 0, q: 3 });
  const [chest] = vehicles(h, ENT_CHEST_MINECART);
  assert.ok(chest, 'vagoneta con cofre');
  const [px, py, pz] = vehicleContainerPos(chest.id);
  c.send({ t: 'open', x: px, y: py, z: pz });
  const open = c.conn.take('cont').pop() ?? c.conn.msgs.find((m) => m.x === px && m.y === py);
  assert.ok(open, 'se abre el cofre');
  const inv = h.gs.sys.transport.vehicleOf(chest.id)!.inv!;
  inv.slots[4] = { id: COAL, count: 12 };
  h.gs.sys.transport.containerChanged();
  // Vagoneta con horno: con carbón empuja.
  c.send({ t: 'vplace', item: FURNACE_MINECART, p: [bx + 4.5, by + 0.1, bz + 0.5], b: [bx + 4, by, bz], yaw: 0, q: 4 });
  const [furnace] = vehicles(h, ENT_FURNACE_MINECART);
  c.pos(bx + 3.2, by, bz + 0.5);
  c.send({ t: 'interact', e: furnace.id, item: COAL, q: 5 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 5)?.take, 1, 'gasta el carbón');
  const fx0 = furnace.x;
  h.tick(10);
  assert.ok(furnace.x > fx0 + 0.3, `empuja alejándose del jugador (x = ${(furnace.x - fx0).toFixed(2)})`);
  // Guardado.
  h.gs.flush(true);
  const h2 = makeServer(7070, store);
  const back = [...h2.gs.entities.list.values()].filter((e) => isVehicleType(e.type));
  assert.equal(back.length, 3, 'vuelven las tres vagonetas');
  const chest2 = back.find((e) => e.type === ENT_CHEST_MINECART)!;
  assert.deepEqual(h2.gs.sys.transport.vehicleOf(chest2.id)!.inv!.slots[4], { id: COAL, count: 12 }, 'con lo que llevaba');
  // Romper la vagoneta con cofre suelta la vagoneta, el cofre y lo de dentro (supervivencia).
  const c2 = h2.join('Barquera');
  c2.pos(chest2.x + 1, by, chest2.z);
  h2.tick(2);
  for (let i = 0; i < 6 && h2.gs.sys.transport.vehicleOf(chest2.id); i++) c2.send({ t: 'attack', e: chest2.id, item: 0 });
  assert.equal(h2.gs.sys.transport.vehicleOf(chest2.id), undefined, 'rota');
  assert.equal(itemsOf(h2, COAL), 12);
});

test('servidor: la barca se guarda y la criatura sentada vuelve a su sitio', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = yard(store);
  c.pos(bx - 3.5, by - 1, bz - 2);
  h.tick(2);
  c.send({ t: 'vplace', item: CHEST_BOAT_ITEMS.mangrove, p: [bx - 5.5, by - 0.1, bz + 0.5], yaw: 1, q: 1 });
  h.tick(5);
  c.send({ t: 'vplace', item: BOAT_ITEMS.oak, p: [bx - 5.5, by - 0.1, bz - 4.5], yaw: 0, q: 2 });
  h.tick(20);
  const boat = vehicles(h, ENT_BOAT)[0];
  const pig = h.gs.entities.spawnMob(MOB_PIG, boat.x, boat.y, boat.z)!;
  h.tick(3);
  assert.equal(pig.vehicle, boat.id);
  h.gs.flush(true);
  const h2 = makeServer(7070, store);
  const back = [...h2.gs.entities.list.values()];
  const cb = back.find((e) => e.type === ENT_CHEST_BOAT);
  assert.ok(cb && cb.variant === BOAT_WOODS.indexOf('mangrove'), 'barca de mangle con cofre');
  const b2 = back.find((e) => e.type === ENT_BOAT)!;
  // (Puede haber aparecido algún otro cerdo por la zona: basta con que uno siga sentado en la barca.)
  assert.ok(back.some((e) => e.type === MOB_PIG && e.vehicle === b2.id), 'el cerdo sigue en la barca');
});
