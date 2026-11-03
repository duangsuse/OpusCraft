// Golpes y disparos como en Java 26.3: para pegar cuerpo a cuerpo hace falta alcanzarlo (la caja de ataque crece
// 0,828 en horizontal) y verlo; la vista y las flechas chocan con la forma real de los bloques. Así un zombi no
// pega a través de una puerta cerrada ni de un cristal, pero sí por una puerta abierta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from './harness';
import { BLOCKS, STONE, AIR, OAK_PLANKS, familyStates, stateProps } from '../src/shared/blocks';
import { MOB_ZOMBIE } from '../src/shared/mobs';
import { lineOfSight } from '../src/shared/sim/physics';
import { clipSegment } from '../src/shared/collide';
import { inMeleeReach, DEFAULT_ATTACK_REACH } from '../src/shared/sim/entities/meleeReach';

const byKey = (k: string) => BLOCKS.find((b) => b?.key === k)!.id;
const door = (props: Record<string, number>) => familyStates(byKey('oak_door')).find((id) => {
  const p = stateProps(id)!;
  return Object.entries(props).every(([k, v]) => p[k] === v);
})!;

test('alcance de Java: 0,828 de más en horizontal, nada en vertical', () => {
  assert.ok(Math.abs(DEFAULT_ATTACK_REACH - 0.8282856) < 1e-6);
  const z = { x: 0, y: 64, z: 0, width: 0.6, height: 1.95 };
  // Zombi y jugador de 0,6 de ancho: los centros a menos de 0,3 + 0,828 + 0,3 = 1,428 en cada eje.
  assert.ok(inMeleeReach(z, 1.4, 64, 0, 0.6, 1.8));
  assert.ok(!inMeleeReach(z, 1.45, 64, 0, 0.6, 1.8));
  assert.ok(inMeleeReach(z, 1.4, 64, 1.4, 0.6, 1.8), 'en diagonal la caja llega más (es una caja, no un círculo)');
  assert.ok(!inMeleeReach(z, 0, 66, 0, 0.6, 1.8), 'no alcanza a quien está encima de su cabeza');
});

test('vista: una puerta cerrada o un cristal tapan; una puerta abierta y una losa no', () => {
  const pane = byKey('glass_pane'), slab = byKey('oak_slab');
  const world = (m: Map<string, number>) => ({ getBlock: (x: number, y: number, z: number) => m.get(`${x},${y},${z}`) ?? AIR });
  // Puerta en (0, 64..65, 0) cerrando el paso a lo largo de z; el rayo va de z = −1,5 a z = 1,5.
  const closed = door({ facing: 0, half: 0, open: 0 }), closedTop = door({ facing: 0, half: 1, open: 0 });
  const open = door({ facing: 0, half: 0, open: 1 }), openTop = door({ facing: 0, half: 1, open: 1 });
  const ray = (m: Map<string, number>) => lineOfSight(world(m), 0.5, 65.5, -1.5, 0.5, 65.5, 1.5);
  assert.equal(ray(new Map([['0,64,0', closed], ['0,65,0', closedTop]])), false, 'puerta cerrada');
  assert.equal(ray(new Map([['0,64,0', open], ['0,65,0', openTop]])), true, 'puerta abierta');
  assert.equal(ray(new Map([['0,65,0', pane]])), false, 'panel de cristal');
  // Una flecha rasante pasa por encima de una losa de abajo.
  assert.equal(clipSegment(world(new Map([['0,64,0', slab]])), 0.5, 64.7, -1.5, 0.5, 64.7, 1.5), -1);
  assert.ok(clipSegment(world(new Map([['0,64,0', STONE]])), 0.5, 64.7, -1.5, 0.5, 64.7, 1.5) >= 0);
});

test('un zombi no pega a través de una puerta cerrada (y sí con ella abierta)', () => {
  const h = makeServer(4242);
  const c = h.join('Ana');
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 150, bz = Math.floor(sz);
  c.pos(sx, 150, sz);
  h.tick(40);
  c.send({ t: 'chat', m: '/dificultad dificil' });
  const W = h.gs.world;
  for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = 0; y < 4; y++) W.setBlock(bx + dx, by + y, bz + dz, AIR);
  }
  // Pared de tablones en z = bz con una puerta en medio.
  for (let dx = -6; dx <= 6; dx++) for (let y = 0; y < 3; y++) W.setBlock(bx + dx, by + y, bz, OAK_PLANKS);
  const setDoor = (isOpen: number) => {
    // Mirando al sur: cerrada, la hoja ocupa el borde norte de la celda (z de 0 a 3/16).
    // Las dos mitades a la vez (como al colocarla): una sola se rompería por falta de la otra.
    (h.gs as unknown as { sys: { rules: { applyEdits(e: number[][]): void } } }).sys.rules.applyEdits([
      [bx, by, bz, door({ facing: 2, half: 0, open: isOpen, hinge: 0 })],
      [bx, by + 1, bz, door({ facing: 2, half: 1, open: isOpen, hinge: 0 })],
    ]);
    assert.equal(W.getBlock(bx, by, bz), door({ facing: 2, half: 0, open: isOpen, hinge: 0 }), 'la puerta se queda puesta');
  };
  const run = (isOpen: number): number => {
    setDoor(isOpen);
    for (const e of [...h.gs.entities.list.values()]) if (e.ai) h.gs.entities.list.delete(e.id);
    // El zombi, pegado a la puerta por fuera; el jugador, justo dentro (a menos de 1 bloque).
    h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 0.5, by, bz - 0.35);
    c.conn.msgs = [];
    for (let i = 0; i < 100; i++) {
      c.pos(bx + 0.5, by, bz + 0.6);
      h.tick(1);
    }
    return c.conn.take('hurt').length;
  };
  assert.equal(run(0), 0, 'con la puerta cerrada no le pega');
  assert.ok(run(1) > 0, 'con la puerta abierta, sí');
});
