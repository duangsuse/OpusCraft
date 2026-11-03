// Armadura visible en la red: el servidor valida las ranuras y la reenvía a los demás jugadores.
import { test } from 'node:test';
import { ARMOR, TOOLS } from '../src/shared/items';
import { Checks, makeServer } from './harness';

test('armadura: sincronización entre jugadores', () => {
  const t = new Checks();
  const h = makeServer();
  const a = h.join('Ana');
  const b = h.join('Beto');
  const [sx, sy, sz] = a.welcome.spawn as [number, number, number];
  const pos = (armor: unknown) => a.send({ t: 'pos', p: [sx, sy, sz], r: [0, 0], s: 0, a: armor });

  // --- Armadura válida: llega tal cual ---
  const full = [ARMOR.iron.helmet, ARMOR.diamond.chestplate, ARMOR.leather.leggings, ARMOR.golden.boots];
  b.conn.msgs = [];
  pos(full);
  let got = b.conn.take('pos').pop();
  t.ok(got && got.id === a.welcome.id, 'el otro jugador recibe la posición');
  t.ok(JSON.stringify(got?.a) === JSON.stringify(full), `armadura reenviada (${JSON.stringify(got?.a)})`);
  t.ok(a.conn.take('pos').length === 0, 'el emisor no recibe su propia posición');

  // --- Ids inválidos o en la ranura equivocada: 0 ---
  h.clock.now += 1000;
  pos([ARMOR.iron.boots, ARMOR.golden.chestplate, TOOLS.diamond.sword, 99999]);
  got = b.conn.take('pos').pop();
  t.ok(JSON.stringify(got?.a) === JSON.stringify([0, ARMOR.golden.chestplate, 0, 0]), `ranuras saneadas (${JSON.stringify(got?.a)})`);
  h.clock.now += 1000;
  pos([1.5, 'x', null, -3, ARMOR.iron.helmet]);
  got = b.conn.take('pos').pop();
  t.ok(JSON.stringify(got?.a) === '[0,0,0,0]', `basura → nada (${JSON.stringify(got?.a)})`);
  h.clock.now += 1000;
  pos('casco');
  got = b.conn.take('pos').pop();
  t.ok(JSON.stringify(got?.a) === '[0,0,0,0]', 'armadura que no es una lista → nada');
  h.clock.now += 1000;
  a.send({ t: 'pos', p: [sx, sy, sz], r: [0, 0], s: 0 });
  got = b.conn.take('pos').pop();
  t.ok(JSON.stringify(got?.a) === '[0,0,0,0]', 'sin campo de armadura → nada');

  // --- Quien entra después la recibe en PlayerInfo ---
  h.clock.now += 1000;
  pos(full);
  const c = h.join('Carla');
  const info = (c.welcome.players as { id: string; a?: number[] }[]).find((p) => p.id === a.welcome.id);
  t.ok(info, 'el recién llegado conoce al primer jugador');
  t.ok(JSON.stringify(info?.a) === JSON.stringify(full), `armadura en PlayerInfo (${JSON.stringify(info?.a)})`);
  const infoB = (c.welcome.players as { id: string; a?: number[] }[]).find((p) => p.id === b.welcome.id);
  t.ok(JSON.stringify(infoB?.a) === '[0,0,0,0]', 'sin armadura: ranuras vacías');
  // Y los que ya estaban reciben la armadura del nuevo al unirse (vacía).
  const join = a.conn.take('join').find((m) => m.p.id === c.welcome.id);
  t.ok(join && JSON.stringify(join.p.a) === '[0,0,0,0]', 'join con armadura vacía');
  t.done();
});
