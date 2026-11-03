// Fase 7 (remate): las pociones en las manos de los demás, la flecha con efecto de la ballesta,
// chocar con barcas y vagonetas y atar barcas con la rienda.
import { test } from 'node:test';
import { POTION, SPLASH_POTION, TIPPED_ARROW, STICK, CROSSBOW, CROSSBOW_CHARGED, LEAD, BOAT_ITEMS } from '../src/shared/items';
import { AIR, STONE, FENCES } from '../src/shared/blocks';
import { moveBox } from '../src/shared/collide';
import { ENT_BOAT, BOAT_WIDTH, BOAT_HEIGHT, pushApart, isVehicleType } from '../src/shared/vehicles';
import { ENT_ITEM } from '../src/shared/mobs';
import { MemoryStore } from '../src/shared/sim/store';
import { PT_HEALING, PT_POISON, POTION_TYPE_COUNT } from '../src/shared/potions';
import { sanitizeItemData, loadCrossbow, unloadCrossbow } from '../src/shared/itemData';
import { sanitizeStack } from '../src/shared/containers';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { Checks, makeServer, type Harness } from './harness';

test('remate: el tipo de poción de cada mano llega a los demás jugadores', () => {
  const t = new Checks();
  const h = makeServer();
  const a = h.join('Ana');
  const b = h.join('Beto');
  const [sx, sy, sz] = a.welcome.spawn as [number, number, number];
  const pos = (extra: object) => a.send({ t: 'pos', p: [sx, sy, sz], r: [0, 0], s: 0, ...extra });

  b.conn.msgs = [];
  pos({ h: POTION, o: TIPPED_ARROW, hp: PT_HEALING, op: PT_POISON });
  let got = b.conn.take('pos').pop();
  t.ok(got?.hp === PT_HEALING && got?.op === PT_POISON, `pociones reenviadas (${got?.hp}, ${got?.op})`);

  // Lo que no es una poción no lleva tipo; tipos que no existen tampoco.
  h.clock.now += 1000;
  pos({ h: STICK, o: SPLASH_POTION, hp: PT_HEALING, op: POTION_TYPE_COUNT + 5 });
  got = b.conn.take('pos').pop();
  t.ok(got && got.hp === undefined && got.op === undefined, `saneado (${got?.hp}, ${got?.op})`);
  h.clock.now += 1000;
  pos({ h: POTION, hp: 'x' });
  got = b.conn.take('pos').pop();
  t.ok(got && got.hp === undefined, 'basura → agua');

  // Quien entra después lo recibe en PlayerInfo.
  h.clock.now += 1000;
  pos({ h: SPLASH_POTION, hp: PT_POISON });
  const c = h.join('Carla');
  const info = (c.welcome.players as { id: string; hp?: number }[]).find((p) => p.id === a.welcome.id);
  t.ok(info?.hp === PT_POISON, `tipo en PlayerInfo (${info?.hp})`);
  t.done();
});

test('remate: la ballesta guarda la flecha con efecto cargada', () => {
  const t = new Checks();
  const base = { id: CROSSBOW, count: 1, dmg: 7, data: { ench: [[1, 1]] as [number, number][], name: 'Arco' } };
  const loaded = loadCrossbow(base, PT_POISON);
  t.ok(loaded.id === CROSSBOW_CHARGED && loaded.data?.ap === PT_POISON, 'cargada con la flecha de veneno');
  t.ok(loaded.dmg === 7 && loaded.data?.name === 'Arco' && loaded.data?.ench?.length === 1, 'conserva desgaste, nombre y encantamientos');
  t.ok(base.data && !('ap' in base.data), 'no toca la pila original');
  const plain = loadCrossbow({ id: CROSSBOW, count: 1 }, -1);
  t.ok(plain.id === CROSSBOW_CHARGED && plain.data === undefined, 'flecha normal: sin datos');

  // Sobrevive a la red y al guardado (inventario y cofres pasan por stackToWire/sanitizeStack).
  const back = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(loaded)))));
  t.ok(back?.id === CROSSBOW_CHARGED && back.data?.ap === PT_POISON, `ida y vuelta (${JSON.stringify(back)})`);

  // Validación: sólo la ballesta cargada y con tipos de poción que existen.
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: PT_HEALING })?.ap === PT_HEALING, 'tipo válido');
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: POTION_TYPE_COUNT }) === undefined, 'tipo que no existe');
  t.ok(sanitizeItemData(CROSSBOW_CHARGED, { ap: 1.5 }) === undefined, 'tipo no entero');
  t.ok(sanitizeItemData(CROSSBOW, { ap: PT_HEALING }) === undefined, 'la descargada no lleva flecha');

  // Al disparar vuelve a estar descargada y sin la flecha, con lo demás intacto.
  const shot = unloadCrossbow(loaded);
  t.ok(shot.id === CROSSBOW && shot.data?.ap === undefined && shot.data?.name === 'Arco', 'descargada tras disparar');
  t.done();
});

test('remate: las barcas son sólidas para el jugador (se choca y se sube encima)', () => {
  const t = new Checks();
  const air = { getBlock: (_x: number, y: number) => (y < 0 ? STONE : AIR) };
  const hw = BOAT_WIDTH / 2;
  const boat = [2 - hw, 0, 0.5 - hw, 2 + hw, BOAT_HEIGHT, 0.5 + hw];
  // Cayendo encima: se queda de pie sobre ella.
  const fall = moveBox(air, 2, 1, 0.5, 0.6, 1.8, 0, -0.8, 0, 0.6, false, boat);
  t.ok(fall.onGround && Math.abs(1 + fall.dy - BOAT_HEIGHT) < 1e-6, `de pie encima (y = ${(1 + fall.dy).toFixed(3)})`);
  // Andando hacia ella desde el suelo: la sube como un escalón (mide menos de 0,6).
  let x = 0, y = 0;
  for (let i = 0; i < 30 && x < 2; i++) {
    const r = moveBox(air, x, y, 0.5, 0.6, 1.8, 0.1, -0.05, 0, 0.6, true, boat);
    x += r.dx;
    y += r.dy;
  }
  t.ok(x >= 2 && Math.abs(y - BOAT_HEIGHT) < 1e-6, `se sube andando (x ${x.toFixed(2)}, y ${y.toFixed(3)})`);
  // Sin subir escalones (volando): choca.
  const hit = moveBox(air, 0.5, 0, 0.5, 0.6, 1.8, 0.8, 0, 0, 0, false, boat);
  t.ok(hit.hitX && Math.abs(0.5 + hit.dx + 0.3 - (2 - hw)) < 1e-6, 'choca con el costado');
  // Empujón al solaparse: lejos de la otra, más fuerte cuanto más cerca.
  const [px, pz] = pushApart(1, 0, 0, 0);
  t.ok(px > 0 && pz === 0, 'aparta en su dirección');
  t.ok(pushApart(0, 0, 0, 0).every((v) => v === 0), 'en el mismo sitio, nada');
  t.done();
});

/** Suelo de piedra con aire encima alrededor del jugador (como el patio de transport.test.ts). */
function yard(store = new MemoryStore()) {
  const h = makeServer(7071, store);
  const c = h.join('Amarre');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  c.pos(sx, by, sz);
  h.tick(40);
  const W = h.gs.world;
  for (let dx = -14; dx <= 14; dx++) for (let dz = -14; dz <= 14; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const boats = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_BOAT);
const leads = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === LEAD).reduce((n, e) => n + e.stack!.count, 0);

test('remate: el jugador empuja la barca desde el costado, pero no estando encima', () => {
  const t = new Checks();
  const { h, c, bx, by, bz } = yard();
  c.send({ t: 'vplace', item: BOAT_ITEMS.oak, p: [bx + 0.5, by + 0.01, bz + 0.5], yaw: 0, q: 1 });
  h.tick(10);
  const [boat] = boats(h);
  t.ok(boat, 'hay barca');
  if (!boat) return t.done();
  const x0 = boat.x;
  c.pos(boat.x, boat.y + BOAT_HEIGHT, boat.z);
  h.tick(20);
  t.ok(Math.abs(boat.x - x0) < 1e-3, `encima no la mueve (${(boat.x - x0).toFixed(3)})`);
  c.pos(boat.x + BOAT_WIDTH / 2 + 0.3, by, boat.z);
  h.tick(20);
  t.ok(boat.x < x0 - 0.05, `de lado la aparta (${(boat.x - x0).toFixed(2)})`);
  t.done();
});

test('remate: barcas atadas con la correa (a la mano, a una valla, guardado y al romperla)', () => {
  const t = new Checks();
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = yard(store);
  c.send({ t: 'vplace', item: BOAT_ITEMS.birch, p: [bx + 0.5, by + 0.01, bz + 0.5], yaw: 0, q: 1 });
  h.tick(10);
  const [boat] = boats(h);
  t.ok(boat, 'hay barca');
  if (!boat) return t.done();
  const me = c.welcome.id as string;
  // Con la mano vacía no se ata (eso sube a la barca).
  c.send({ t: 'interact', e: boat.id, item: 0, q: 2 });
  t.ok(!c.conn.take('ires').find((m) => m.q === 2)?.ok && !boat.leash, 'sin correa no se ata');
  // Con la correa: atada al jugador (se gasta).
  c.send({ t: 'interact', e: boat.id, item: LEAD, q: 3 });
  t.ok(c.conn.take('ires').find((m) => m.q === 3)?.take === 1, 'se gasta la correa');
  t.ok(boat.leash === me, 'atada al jugador');
  // Se aleja: la correa tira de la barca.
  const x0 = boat.x;
  c.pos(bx + 8.5, by, bz + 0.5);
  h.tick(20);
  t.ok(boat.x > x0 + 0.5, `la barca le sigue (${(boat.x - x0).toFixed(2)})`);
  t.ok(boat.leash === me, 'sin romperse');
  // Atarla a una valla.
  const fx = Math.floor(boat.x) + 1, fz = bz;
  h.gs.world.setBlock(fx, by, fz, FENCES.oak);
  c.pos(fx + 1.5, by, fz + 0.5);
  c.send({ t: 'leash', x: fx, y: by, z: fz });
  t.ok(Array.isArray(boat.leash) && (boat.leash as number[]).join() === [fx, by, fz].join(), `atada a la valla (${JSON.stringify(boat.leash)})`);
  h.tick(5);
  // Se guarda con la barca.
  h.gs.flush(true);
  const h2 = makeServer(7071, store);
  const back = [...h2.gs.entities.list.values()].find((e) => isVehicleType(e.type));
  t.ok(back && Array.isArray(back.leash) && (back.leash as number[]).join() === [fx, by, fz].join(), 'la valla vuelve al cargar');
  // De la valla a la mano con la correa (sin gastar otra); atada a él, se suelta y la correa cae.
  c.send({ t: 'interact', e: boat.id, item: LEAD, q: 4 });
  const r4 = c.conn.take('ires').find((m) => m.q === 4);
  t.ok(r4?.ok && !r4.take && boat.leash === me, 'pasa a la mano');
  c.send({ t: 'interact', e: boat.id, item: 0, q: 5 });
  t.ok(c.conn.take('ires').find((m) => m.q === 5)?.ok && !boat.leash, 'se suelta');
  t.ok(leads(h) === 1, `cae la correa (${leads(h)})`);
  // Atada y rota a golpes: suelta la barca y la correa.
  c.send({ t: 'interact', e: boat.id, item: LEAD, q: 6 });
  for (let i = 0; i < 6 && boats(h).length; i++) c.send({ t: 'attack', e: boat.id, item: 0 });
  t.ok(boats(h).length === 0, 'rota');
  t.ok(leads(h) === 2, `cae la correa con ella (${leads(h)})`);
  t.done();
});
