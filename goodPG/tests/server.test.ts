// El servidor de juego completo con un cliente falso: fluidos, gravedad, apoyos, objetos,
// contenedores, hornos, criaturas, brotes, recetas y persistencia.
import { test } from 'node:test';
import {
  AIR, WATER, LAVA, SAND, STONE, CHEST, FURNACE, FURNACE_LIT, OAK_LOG, OAK_LEAVES, TORCH, BLOCK_FLUID, COBBLESTONE,
  IRON_ORE, OAK_PLANKS, OAK_SAPLING, DIRT, OBSIDIAN,
} from '../src/shared/blocks';
import { COAL, IRON_INGOT, STICK, TOOLS } from '../src/shared/items';
import { MOB_ZOMBIE, MOB_PIG, ENT_ITEM } from '../src/shared/mobs';
import { PROTOCOL_VERSION } from '../src/shared/protocol';
import { matchRecipe } from '../src/shared/recipes';
import { GameServer } from '../src/shared/sim/GameServer';
import { Checks, FakeConn, makeServer, placeOnTop } from './harness';

test('servidor de juego: simulación completa', () => {
  const t = new Checks();
  const h = makeServer();
  const { gs, store } = h;
  const c = h.join('Tester');
  const conn = c.conn;
  t.ok(c.welcome && c.welcome.mode === 's' && Array.isArray(c.welcome.spawn), 'bienvenida con modo y punto de aparición');
  t.ok(conn.bins.length === 1, 'ediciones binarias enviadas');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(80);
  t.ok(gs.stats().chunks >= 81, 'chunks cargados alrededor del jugador');

  const W = gs.world;
  // Plataforma de pruebas en el aire, lejos del suelo.
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) W.setBlock(bx + dx, by - 1, bz + dz, STONE);
  h.tick(2);
  conn.msgs = [];
  const countWater = () => {
    let wet = 0;
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) if (BLOCK_FLUID[W.getBlock(bx + dx, by, bz + dz)] === 1) wet++;
    return wet;
  };

  // --- Agua que fluye y se seca ---
  c.pos(bx, by, bz);
  c.send({ t: 'set', x: bx, y: by, z: bz, b: WATER });
  h.tick(60);
  t.ok(countWater() > 50, `el agua se extiende (${countWater()} celdas)`);
  t.ok(conn.take('sets').length > 0, 'cambios de fluido difundidos en lotes');
  c.send({ t: 'set', x: bx, y: by, z: bz, b: AIR });
  h.tick(200);
  t.ok(countWater() === 0, `el agua se seca al quitar la fuente (${countWater()})`);

  // --- Lava + agua = roca/obsidiana ---
  c.send({ t: 'set', x: bx, y: by, z: bz, b: LAVA });
  h.tick(5);
  c.send({ t: 'set', x: bx + 3, y: by, z: bz, b: WATER });
  h.tick(200);
  let rock = 0;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    const b = W.getBlock(bx + dx, by, bz + dz);
    if (b === COBBLESTONE || b === OBSIDIAN) rock++;
  }
  t.ok(rock > 0, `agua y lava crean roca u obsidiana (${rock})`);
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) W.setBlock(bx + dx, by, bz + dz, AIR);
  h.tick(40);

  // --- Un bloque normal no se puede colocar con 'set' (sólo fluidos con el cubo) ---
  c.send({ t: 'set', x: bx, y: by, z: bz, b: STONE });
  t.ok(W.getBlock(bx, by, bz) === AIR, "'set' ya no coloca bloques sólidos");

  // --- Arena que cae ---
  W.setBlock(bx, by + 5, bz, SAND);
  h.tick(40);
  t.ok(W.getBlock(bx, by, bz) === SAND, 'la arena cae hasta el suelo');
  W.setBlock(bx, by, bz, AIR);

  // --- Antorcha sin soporte ---
  W.setBlock(bx + 1, by, bz, STONE);
  placeOnTop(c, bx + 1, by + 1, bz, TORCH);
  t.ok(W.getBlock(bx + 1, by + 1, bz) === TORCH, 'colocar una antorcha de pie');
  conn.msgs = [];
  c.send({ t: 'set', x: bx + 1, y: by, z: bz, b: AIR, tool: TOOLS.wooden.pickaxe });
  h.tick(2);
  t.ok(W.getBlock(bx + 1, by + 1, bz) === AIR, 'la antorcha cae al quitar su soporte');
  h.tick(20);
  let items = [...gs.entities.list.values()].filter((e) => e.type === ENT_ITEM);
  t.ok(items.some((e) => e.stack?.id === COBBLESTONE) && items.some((e) => e.stack?.id === TORCH), 'sueltan roca y la antorcha');

  // --- Recoger objetos ---
  const cobbleItem = items.find((e) => e.stack?.id === COBBLESTONE);
  if (cobbleItem) {
    h.tick(20);
    c.pos(cobbleItem.x, cobbleItem.y, cobbleItem.z);
    c.send({ t: 'pickup', e: cobbleItem.id });
    const picked = conn.take('picked');
    t.ok(picked.length === 1 && picked[0].s.id === COBBLESTONE, 'recogida de objeto confirmada');
    h.tick(2);
    const ents = conn.take('ents');
    t.ok(ents.some((m) => (m.rm ?? []).some((r: unknown) => Array.isArray(r) && r[0] === cobbleItem.id)), 'la recogida se anuncia con el recolector');
  } else t.ok(false, 'hay roca para recoger');

  // --- Hojas que se caen al talar ---
  W.setBlock(bx - 4, by, bz - 4, OAK_LOG);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx || dz) W.setBlock(bx - 4 + dx, by + 1, bz - 4 + dz, OAK_LEAVES);
  W.setBlock(bx - 4, by + 1, bz - 4, OAK_LOG);
  c.pos(bx - 4, by, bz - 2);
  c.send({ t: 'set', x: bx - 4, y: by + 1, z: bz - 4, b: AIR });
  c.send({ t: 'set', x: bx - 4, y: by, z: bz - 4, b: AIR });
  h.tick(300);
  let leaves = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (W.getBlock(bx - 4 + dx, by + 1, bz - 4 + dz) === OAK_LEAVES) leaves++;
  t.ok(leaves === 0, `las hojas sin tronco se caen (${leaves} quedan)`);

  // --- Cofre (colocado mirando al norte: el frente hacia el sur) ---
  c.pos(bx, by, bz);
  placeOnTop(c, bx + 2, by, bz, CHEST, 0);
  t.ok(W.getBlock(bx + 2, by, bz) === CHEST + 2, 'el cofre se coloca orientado hacia el jugador');
  c.send({ t: 'open', x: bx + 2, y: by, z: bz });
  let cont = conn.take('cont');
  t.ok(cont.length === 1 && cont[0].c.k === 'c' && cont[0].c.s.length === 27, 'abrir cofre');
  c.send({ t: 'cclick', x: bx + 2, y: by, z: bz, slot: 4, btn: 0, cur: { id: IRON_INGOT, count: 10 }, q: 1 });
  let cres = conn.take('cres');
  t.ok(cres[0]?.q === 1 && cres[0]?.cur === null, 'dejar lingotes en el cofre');
  c.send({ t: 'cclick', x: bx + 2, y: by, z: bz, slot: 4, btn: 1, cur: null, q: 2 });
  cres = conn.take('cres');
  t.ok(cres[0]?.cur?.count === 5, 'clic derecho toma la mitad');
  c.send({ t: 'ctake', x: bx + 2, y: by, z: bz, slot: 4, max: 64, q: 3 });
  cres = conn.take('cres');
  t.ok(cres[0]?.give?.count === 5, 'mayús+clic saca el resto');
  c.send({ t: 'cput', x: bx + 2, y: by, z: bz, stack: { id: OAK_PLANKS, count: 30 }, q: 4 });
  cres = conn.take('cres');
  t.ok(cres[0]?.give === null, 'meter tablones en el cofre');
  conn.msgs = [];
  c.send({ t: 'set', x: bx + 2, y: by, z: bz, b: AIR });
  t.ok(conn.take('cclose').length === 1, 'la ventana del cofre se cierra al romperlo');
  h.tick(5);
  items = [...gs.entities.list.values()].filter((e) => e.type === ENT_ITEM);
  t.ok(items.some((e) => e.stack?.id === OAK_PLANKS && e.stack.count === 30), 'el cofre roto suelta su contenido');
  t.ok(items.some((e) => e.stack?.id === CHEST), 'y el propio cofre');

  // --- Horno (mirando al oeste: el frente hacia el este) ---
  placeOnTop(c, bx - 2, by, bz, FURNACE, Math.PI / 2);
  c.send({ t: 'open', x: bx - 2, y: by, z: bz });
  c.send({ t: 'cclick', x: bx - 2, y: by, z: bz, slot: 0, btn: 0, cur: { id: IRON_ORE, count: 3 }, q: 5 });
  c.send({ t: 'cclick', x: bx - 2, y: by, z: bz, slot: 1, btn: 0, cur: { id: COAL, count: 1 }, q: 6 });
  h.tick(20);
  t.ok(W.getBlock(bx - 2, by, bz) === FURNACE_LIT + 1, 'el horno se enciende (conserva la orientación)');
  h.tick(20 * 31);
  conn.msgs = [];
  h.tick(4);
  cont = conn.take('cont');
  const fw = cont[cont.length - 1]?.c;
  t.ok(fw && fw.s[2] && fw.s[2][0] === IRON_INGOT && fw.s[2][1] === 3, `el horno funde 3 lingotes (${JSON.stringify(fw?.s)})`);

  // --- Criaturas ---
  c.send({ t: 'chat', m: '/invocar zombie' });
  c.send({ t: 'chat', m: '/invocar cerdo' });
  const mobs = [...gs.entities.list.values()].filter((e) => e.ai);
  const zombie = mobs.find((e) => e.type === MOB_ZOMBIE);
  const pig = mobs.find((e) => e.type === MOB_PIG);
  t.ok(zombie && pig, 'invocar zombi y cerdo');
  c.send({ t: 'chat', m: '/time set medianoche' });
  conn.msgs = [];
  h.tick(100);
  const hurts = conn.take('hurt');
  t.ok(hurts.length > 0, `el zombi persigue y ataca al jugador (${hurts.length} golpes)`);
  if (pig) {
    for (let i = 0; i < 12 && pig.health > 0; i++) {
      c.pos(pig.x + 1, pig.y, pig.z);
      h.clock.now += 700;
      c.send({ t: 'attack', e: pig.id, item: TOOLS.diamond.sword });
      h.tick(1);
    }
    t.ok(pig.dead, 'el cerdo muere a espadazos');
    h.tick(30);
    items = [...gs.entities.list.values()].filter((e) => e.type === ENT_ITEM);
    t.ok(items.some((e) => e.stack && e.stack.id >= 256), 'el cerdo suelta carne');
  }

  // --- Brote ---
  W.setBlock(bx + 6, by, bz + 6, DIRT);
  W.setBlock(bx + 6, by + 1, bz + 6, OAK_SAPLING);
  // Un brote recibe de media un tick aleatorio cada ~70 s: se espera hasta 30 min simulados para que
  // la prueba no falle por azar (normalmente crece en pocos minutos).
  let grown = false;
  for (let i = 0; i < 1600 && !grown; i++) {
    h.tick(20);
    grown = W.getBlock(bx + 6, by + 1, bz + 6) === OAK_LOG;
  }
  t.ok(grown, 'el brote crece hasta ser un árbol');

  // --- Recetas ---
  const P = OAK_PLANKS;
  t.ok(matchRecipe([P, P, P, 0, STICK, 0, 0, STICK, 0], 3)?.out.id === TOOLS.wooden.pickaxe, 'receta del pico de madera');
  t.ok(matchRecipe([OAK_LOG, 0, 0, 0], 2)?.out.count === 4, 'tronco → 4 tablones');
  t.ok(matchRecipe([0, P, 0, P], 2)?.out.count === 4, 'palos en 2x2 (desplazados)');

  // --- Persistencia ---
  c.send({ t: 'state', d: { inv: [[1, 5]], hp: 12, food: 15, sat: 2, pos: [1, 2, 3] } });
  gs.disconnect(conn);
  t.ok(store.players.has('tester') && JSON.parse(store.players.get('tester')!).save.hp === 12, 'estado del jugador guardado');
  t.ok(store.chunks.size > 0 && store.containers.size >= 1, `ediciones (${store.chunks.size} chunks) y horno guardados`);
  const gs2 = new GameServer(store, { now: () => h.clock.now });
  const c2 = new FakeConn();
  gs2.connect(c2);
  gs2.message(c2, JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'tester', shirt: '#00ff00' }));
  const w2 = c2.take('welcome')[0];
  t.ok(w2.save?.hp === 12 && w2.save?.pos[2] === 3, 'al volver recupera su estado');
  t.done();
});
