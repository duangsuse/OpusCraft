// Fase 8.4 (estructuras del Nether): la fortaleza portada de NetherFortressPieces (piezas, topes, alturas, lo que
// dibuja cada chunk y su botín), la verruga del Nether plantada, el generador de blazes y los monstruos de la
// fortaleza (su lista manda dentro de sus piezas); los bastiones (montaje de piezas portado de JigsawPlacement, sus
// cofres y criaturas), los fósiles del Nether y los portales en ruinas del Nether.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fortressPieces } from '../src/shared/world/netherFortress';
import { locateNetherStructure, inFortressPiece, complexStart, NETHER_COMPLEXES, NETHER_STRUCTURE_NAMES } from '../src/shared/world/netherStructures';
import { NetherGenerator } from '../src/shared/world/nether';
import {
  NETHER_BRICKS, MOB_SPAWNER, SOUL_SAND, STONE, NETHER_WART_CROP, NETHER_WART_MAX_AGE, AIR, NETHERRACK, BLOCKS,
} from '../src/shared/blocks';
import { NETHER_WART, ITEMS } from '../src/shared/items';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { FORTRESS_ENEMIES, MOB_BLAZE, MOB_MAGMA_CUBE } from '../src/shared/netherMobs';
import { planPlacement } from '../src/shared/placement';
import { blockDrops } from '../src/shared/sim/drops';
import { blockIndex } from '../src/shared/constants';
import { DIM_NETHER } from '../src/shared/dimensions';
import { makeServer } from './harness';
import { mulberry32 } from '../src/shared/world/noise';
import { bastionPieces, bastionBounds } from '../src/shared/world/bastion';
import { BASTION_PIECES } from '../src/shared/world/bastionData';
import { NETHER_LOOT } from '../src/shared/netherLoot';
import { MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_HOGLIN } from '../src/shared/netherMobs';
import { netherFossilAt } from '../src/shared/world/netherFossils';
import { netherRuinedPortalAt } from '../src/shared/world/netherPortals';
import { BONE_BLOCK, BONE_BLOCK_AXIS, OBSIDIAN, CRYING_OBSIDIAN, POLISHED_BLACKSTONE_BRICKS } from '../src/shared/blocks';
import { MUSIC_DISC_PIGSTEP, PIGLIN_BANNER_PATTERN } from '../src/shared/items';
import { BIOME_SOUL_SAND_VALLEY } from '../src/shared/world/biomeIds';

test('fortaleza: piezas como en Java (inicio, topes por tipo, sin choques, entre y = 48 y 70)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const pieces = fortressPieces(seed, 3, -2);
    assert.equal(pieces[0].kind, 'bridge_crossing', 'empieza con un cruce de puentes');
    assert.deepEqual([pieces[0].box.x0 - pieces[0].box.x1, pieces[0].box.z0 - pieces[0].box.z1], [-18, -18]);
    const count = (k: string) => pieces.filter((p) => p.kind === k).length;
    assert.ok(count('bridge_crossing') <= 5 && count('room_crossing') <= 4 && count('stairs_room') <= 3, 'topes de los puentes');
    assert.ok(count('monster_throne') <= 2 && count('castle_entrance') <= 1, 'dos tronos y una entrada como mucho');
    assert.ok(count('castle_corridor_crossing') <= 5 && count('castle_t_balcony') <= 2 && count('castle_stalk_room') <= 2, 'topes del castillo');
    assert.ok(Math.min(...pieces.map((p) => p.box.y0)) >= 48 && Math.min(...pieces.map((p) => p.box.y0)) <= 70, 'movida entre y = 48 y 70');
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) assert.ok(!pieces[i].box.intersects(pieces[j].box), `sin choques: ${pieces[i].kind} y ${pieces[j].kind}`);
      const b = pieces[i].box;
      assert.ok(Math.abs(b.x0 - pieces[0].box.x0) <= 112 + 19 && Math.abs(b.z0 - pieces[0].box.z0) <= 112 + 19, 'a menos de 112 del inicio');
    }
  }
  // Determinista.
  assert.deepEqual(fortressPieces(7, 0, 0).map((p) => [p.kind, p.box.x0, p.box.y0, p.box.z0]), fortressPieces(7, 0, 0).map((p) => [p.kind, p.box.x0, p.box.y0, p.box.z0]));
});

test('fortaleza: se genera en el Nether con sus ladrillos, tronos con generador, cofres y verrugas', () => {
  const gen = new NetherGenerator(12345);
  const f = locateNetherStructure(gen, 'fortress', 0, 0, 20);
  assert.ok(f, 'hay una fortaleza cerca');
  let bricks = 0, spawners = 0, warts = 0, onSoul = 0;
  const tables = new Set<string>();
  const cx0 = Math.floor(f![0] / 16), cz0 = Math.floor(f![2] / 16);
  for (let dz = -8; dz <= 8; dz++) {
    for (let dx = -8; dx <= 8; dx++) {
      const r = gen.generate(cx0 + dx, cz0 + dz);
      for (const c of r.chests) tables.add(c.table);
      const b = r.blocks;
      for (let i = 0; i < b.length; i++) {
        if (b[i] === NETHER_BRICKS) bricks++;
        else if (b[i] === MOB_SPAWNER) spawners++;
        else if (b[i] >= NETHER_WART_CROP && b[i] <= NETHER_WART_CROP + NETHER_WART_MAX_AGE) {
          warts++;
          if (b[i - 256] === SOUL_SAND) onSoul++;
        }
      }
    }
  }
  assert.ok(bricks > 10000, `ladrillos del Nether: ${bricks}`);
  assert.ok(spawners >= 1 && spawners <= 2, `generadores en los tronos: ${spawners}`);
  assert.ok(warts === 0 || onSoul === warts, 'las verrugas, sobre arena de alma');
  // Los de la fortaleza (y, si cae cerca, los de un bastión o un portal en ruinas).
  assert.ok(tables.has('nether_bridge') && [...tables].every((t) => t === 'nether_bridge' || t.startsWith('bastion_') || t === 'ruined_portal'), `cofres: ${[...tables]}`);
  assert.equal(NETHER_STRUCTURE_NAMES.fortress, 'Fortaleza del Nether');
  // Dentro de una pieza manda la lista de la fortaleza; lejos, no.
  const s = complexStart(gen, Math.floor(cx0 / NETHER_COMPLEXES.spacing), Math.floor(cz0 / NETHER_COMPLEXES.spacing))!;
  const b = s.fortress![3].box;
  assert.ok(inFortressPiece(gen, (b.x0 + b.x1) >> 1, (b.y0 + b.y1) >> 1, (b.z0 + b.z1) >> 1), 'dentro de una pieza');
  assert.ok(!inFortressPiece(gen, f![0] + 2000, 60, f![2] + 2000), 'lejos, no');
});

test('fortaleza: botín (nether_bridge) y monstruos (FORTRESS_ENEMIES) de la 26.3', () => {
  const t = LOOT_TABLES.nether_bridge;
  assert.deepEqual(t.rolls, [2, 4]);
  assert.equal(t.entries.reduce((s, e) => s + e[1], 0), 78 - 5, 'pesos de Java sin la armadura de cobre para caballo (fase 9)');
  const r = mulberry32(3);
  for (let i = 0; i < 50; i++) {
    const out = rollLoot(t, r);
    assert.ok(out.length >= 1 && out.every((s) => ITEMS[s.id] || BLOCKS[s.id]));
  }
  assert.deepEqual(FORTRESS_ENEMIES.map((e) => [e[1], e[2], e[3]]), [[10, 2, 3], [5, 4, 4], [8, 5, 5], [2, 5, 5], [3, 4, 4]]);
});

test('verruga del Nether: se planta sólo en arena de alma, crece sola hasta la edad 3 y madura suelta 2–4', () => {
  const world: Record<string, number> = { '0,4,0': SOUL_SAND, '2,4,0': STONE };
  const get = (x: number, y: number, z: number) => world[`${x},${y},${z}`] ?? AIR;
  assert.equal(ITEMS[NETHER_WART].block, NETHER_WART_CROP, 'la verruga se planta');
  assert.deepEqual(planPlacement(get, { x: 0, y: 4, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 5, pz: 0.5, id: SOUL_SAND }, NETHER_WART_CROP, 0), [[0, 5, 0, NETHER_WART_CROP]]);
  assert.equal(planPlacement(get, { x: 2, y: 4, z: 0, nx: 0, ny: 1, nz: 0, px: 2.5, py: 5, pz: 0.5, id: STONE }, NETHER_WART_CROP, 0), null, 'en piedra, no');
  const r = mulberry32(9);
  assert.deepEqual(blockDrops(NETHER_WART_CROP, 0, r), [{ id: NETHER_WART, count: 1 }]);
  for (let i = 0; i < 30; i++) {
    const d = blockDrops(NETHER_WART_CROP + NETHER_WART_MAX_AGE, 0, r);
    assert.ok(d[0].id === NETHER_WART && d[0].count >= 2 && d[0].count <= 4);
  }
  // Crece con los ticks aleatorios (una de cada diez veces), también a oscuras.
  const h = makeServer(8401, undefined, DIM_NETHER);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  W.setBlock(4, 60, 4, SOUL_SAND);
  W.setBlock(4, 61, 4, NETHER_WART_CROP);
  for (let y = 62; y < 66; y++) W.setBlock(4, y, 4, NETHERRACK);
  const nature = h.gs.sys.nature as { randomTickAt(x: number, y: number, z: number): void };
  for (let i = 0; i < 200; i++) nature.randomTickAt(4, 61, 4);
  assert.equal(W.getBlock(4, 61, 4), NETHER_WART_CROP + NETHER_WART_MAX_AGE, 'madura');
});

test('generador del trono: blazes entre ladrillos del Nether (con luz), cubos de magma en otro sitio', () => {
  const h = makeServer(8402, undefined, DIM_NETHER);
  const W = h.gs.world;
  W.ensureChunk(0, 0);
  const sp = h.gs.sys.spawners as { mobOf(x: number, y: number, z: number): number };
  W.setBlock(5, 64, 5, MOB_SPAWNER);
  W.setBlock(5, 63, 5, NETHER_BRICKS);
  assert.equal(sp.mobOf(5, 64, 5), MOB_BLAZE);
  W.setBlock(9, 64, 9, MOB_SPAWNER);
  W.setBlock(9, 63, 9, NETHERRACK);
  assert.equal(sp.mobOf(9, 64, 9), MOB_MAGMA_CUBE);
  void blockIndex;
});

test('bastión: las cuatro variantes se montan como en Java (inicio, tamaños, sin salirse de 80 bloques)', () => {
  const sizes: Record<string, number[]> = {};
  for (let seed = 1; seed <= 40; seed++) {
    const pieces = bastionPieces(seed, 5, -3);
    const start = pieces[0].key;
    assert.ok(/^(units|hoglin_stable|treasure|bridge)\//.test(start), `inicio: ${start}`);
    assert.equal(pieces[0].pos[1], 33, 'empieza en y = 33');
    for (const p of pieces) assert.ok(BASTION_PIECES[p.key], `plantilla conocida: ${p.key}`);
    const b = bastionBounds(pieces);
    assert.ok(b.x1 - b.x0 <= 170 && b.z1 - b.z0 <= 170, 'dentro de ±80 del inicio');
    (sizes[start.split('/')[0]] ??= []).push(pieces.length);
  }
  assert.equal(Object.keys(sizes).length, 4, 'salen las cuatro');
  // Cuántas piezas (medido contra el montaje de referencia): viviendas 72–97, tesoro 164–180, puente 48–53, establos 88–99.
  const range = (k: string) => [Math.min(...sizes[k]), Math.max(...sizes[k])];
  const [u0, u1] = range('units'), [t0, t1] = range('treasure'), [b0, b1] = range('bridge'), [h0, h1] = range('hoglin_stable');
  assert.ok(u0 >= 60 && u1 <= 110, `viviendas: ${u0}–${u1}`);
  assert.ok(t0 >= 150 && t1 <= 195, `tesoro: ${t0}–${t1}`);
  assert.ok(b0 >= 40 && b1 <= 62, `puente: ${b0}–${b1}`);
  assert.ok(h0 >= 75 && h1 <= 110, `establos: ${h0}–${h1}`);
  assert.deepEqual(bastionPieces(9, 0, 0).map((p) => [p.key, ...p.pos, p.rot]), bastionPieces(9, 0, 0).map((p) => [p.key, ...p.pos, p.rot]), 'determinista');
});

test('bastión: en el mundo, con sus ladrillos, cofres con su botín, piglins, brutos y hoglins', () => {
  const gen = new NetherGenerator(777);
  const f = locateNetherStructure(gen, 'bastion_remnant', 0, 0, 30);
  assert.ok(f, 'hay un bastión cerca');
  assert.equal(NETHER_STRUCTURE_NAMES.bastion_remnant, 'Bastión en ruinas');
  let bricks = 0;
  const tables = new Set<string>(), mobs = new Set<number>();
  const cx0 = Math.floor(f![0] / 16), cz0 = Math.floor(f![2] / 16);
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      const r = gen.generate(cx0 + dx, cz0 + dz);
      for (const c of r.chests) tables.add(c.table);
      for (const m of r.mobs) mobs.add(m.type);
      for (let i = 0; i < r.blocks.length; i++) if (r.blocks[i] === POLISHED_BLACKSTONE_BRICKS) bricks++;
    }
  }
  assert.ok(bricks > 2000, `ladrillos de piedra negra pulida: ${bricks}`);
  assert.ok([...tables].some((t) => t.startsWith('bastion_')), `cofres: ${[...tables]}`);
  for (const t of tables) assert.ok(LOOT_TABLES[t], `tabla conocida: ${t}`);
  assert.ok(mobs.has(MOB_PIGLIN), 'piglins');
  assert.ok([...mobs].every((m) => m === MOB_PIGLIN || m === MOB_PIGLIN_BRUTE || m === MOB_HOGLIN), 'sólo piglins, brutos y hoglins');
});

test('botín de los bastiones: Pigstep y el diseño del hocico sólo en los demás cofres; el tesoro, con diamantes', () => {
  const r = mulberry32(84);
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) for (const s of rollLoot(NETHER_LOOT.bastion_other, r)) seen.add(s.id);
  assert.ok(seen.has(MUSIC_DISC_PIGSTEP) && seen.has(PIGLIN_BANNER_PATTERN), 'Pigstep y el hocico');
  const t = rollLoot(NETHER_LOOT.bastion_treasure, r);
  assert.ok(t.length >= 6, 'tres del tesoro y de tres a cuatro más');
  for (const k of ['bastion_bridge', 'bastion_hoglin_stable', 'bastion_treasure', 'nether_bridge']) {
    for (let i = 0; i < 100; i++) for (const s of rollLoot(NETHER_LOOT[k], r)) assert.ok(ITEMS[s.id] && s.count >= 1, `${k}: ${s.id}`);
  }
});

test('fósiles del Nether: sólo en el valle de almas, de hueso, sobre el suelo', () => {
  const gen = new NetherGenerator(4242);
  let found = 0;
  for (let rz = -30; rz <= 30; rz++) {
    for (let rx = -30; rx <= 30; rx++) {
      const f = netherFossilAt(gen.seed, gen, rx, rz);
      if (!f) continue;
      found++;
      assert.equal(gen.biomeAt(f.x, f.z), BIOME_SOUL_SAND_VALLEY);
      assert.ok(f.y > 32 && f.y < 126, `altura: ${f.y}`);
      assert.ok(gen.isSturdyBase(gen.baseBlockAt(f.x, f.y, f.z)) && gen.baseBlockAt(f.x, f.y + 1, f.z) === AIR, 'sobre suelo firme');
    }
  }
  assert.ok(found > 0, 'hay fósiles');
  const q = locateNetherStructure(gen, 'nether_fossil', 0, 0)!;
  assert.ok(q, 'se localizan');
  let bones = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const b = gen.generate((q[0] >> 4) + dx, (q[2] >> 4) + dz).blocks;
      for (let i = 0; i < b.length; i++) if (b[i] === BONE_BLOCK || (b[i] >= BONE_BLOCK_AXIS && b[i] < BONE_BLOCK_AXIS + 3)) bones++;
    }
  }
  assert.ok(bones >= 5, `huesos: ${bones}`);
});

test('portales en ruinas del Nether: marco de obsidiana, cofre del portal y buena parte bajo el mar de lava', () => {
  const gen = new NetherGenerator(4242);
  let low = 0;
  const n = 40;
  for (let rx = 0; rx < n; rx++) {
    const p = netherRuinedPortalAt(gen.seed, gen, rx, 2)!;
    assert.ok(p && p.y >= 15 && p.y <= 100, `altura: ${p.y}`);
    if (p.y < 31) low++;
  }
  assert.ok(low > n * 0.25 && low < n * 0.95, `bajo la lava: ${low} de ${n}`);
  const q = locateNetherStructure(gen, 'ruined_portal_nether', 0, 0)!;
  assert.ok(q, 'se localizan');
  let obs = 0;
  const tables: string[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const r = gen.generate((q[0] >> 4) + dx, (q[2] >> 4) + dz);
      for (const c of r.chests) tables.push(c.table);
      for (let i = 0; i < r.blocks.length; i++) if (r.blocks[i] === OBSIDIAN || r.blocks[i] === CRYING_OBSIDIAN) obs++;
    }
  }
  assert.ok(obs >= 6, `obsidiana: ${obs}`);
  assert.ok(tables.every((t) => t === 'ruined_portal' || t.startsWith('bastion_') || t === 'nether_bridge'), `cofres: ${tables}`);
  assert.equal(NETHER_STRUCTURE_NAMES.ruined_portal_nether, 'Portal en ruinas');
});
