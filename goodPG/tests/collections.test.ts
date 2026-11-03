// Fase 6.5 (colecciones): cabezas de criaturas, creepers cargados, tocadiscos y discos de música, saco de
// tinta brillante y marco brillante (registro, recetas, colocación, composiciones y servidor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, SKULLS, WALL_SKULLS, SKULL_KINDS, SKULL_TEXTURES, JUKEBOX, INVENTORY_ORDER, GLOW_ITEM_FRAME_MODEL, stateOf,
  stateProps, skullKind, skullPose, skullRotationFor, isJukebox, jukeboxHasDisc, jukeboxWith, blockSupported, familyBase,
  BLOCKS,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, GLOW_INK_SAC, GLOW_ITEM_FRAME, MUSIC_DISCS, ITEM_FRAME, DIAMOND, CLOCK,
} from '../src/shared/items';
import { DISCS } from '../src/shared/discs';
import { matchRecipe } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { LOOT_TABLES } from '../src/shared/loot';
import { MOBS, MOB_ZOMBIE, MOB_SKELETON, MOB_CREEPER, ENT_ITEM } from '../src/shared/mobs';
import { MOB_GLOW_SQUID } from '../src/shared/aquaticMobs';
import { EF_CHARGED, CHARGED_POWER, CREEPER_DISCS, skullDisguises, discOfItem, discTitle } from '../src/shared/collections';
import { ENT_GLOW_FRAME } from '../src/shared/paintings';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { composeDisc } from '../src/client/audio/discs';
import { COLLECTION_GENERATORS } from '../src/client/textures/genCollections';
import { COLLECTION_SPRITES } from '../src/client/textures/collectionSprites';
import { MemoryStore } from '../src/shared/sim/store';
import type { PlayerView } from '../src/shared/sim/entities/types';
import { makeServer, type Client, type Harness } from './harness';

const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: x + 0.5 + nx * 0.5, py: y + 0.5 + ny * 0.5, pz: z + 0.5 + nz * 0.5, id });

test('registro: cabezas, tocadiscos, discos, saco de tinta brillante y marco brillante', () => {
  for (const k of SKULL_KINDS) {
    const id = SKULLS[k];
    assert.ok(ITEMS[id], `${k}: tiene objeto`);
    assert.equal(ITEMS[id].armor?.slot, 0, `${k}: va en el hueco del casco`);
    assert.equal(ITEMS[id].armor?.points, 0);
    assert.ok(INVENTORY_ORDER.includes(id), `${k}: en el creativo`);
    assert.equal(skullKind(id), k);
    assert.equal(skullKind(stateOf(WALL_SKULLS[k], { facing: 3 })), k);
    assert.equal(BLOCKS[WALL_SKULLS[k]].base, id, `${k}: la de pared da la misma cabeza`);
  }
  assert.deepEqual(SKULL_KINDS.map((k) => ITEMS[SKULLS[k]].name), ['Cabeza de zombi', 'Cráneo de esqueleto', 'Cabeza de creeper', 'Cabeza de jugador']);
  assert.equal(ITEMS[JUKEBOX].name, 'Tocadiscos');
  assert.ok(INVENTORY_ORDER.includes(JUKEBOX));
  // Fase 7.5 (abismo): con el disco 5 al final; Fase 8.3: y Tears (del ghast); Fase 8.4: y Pigstep (de los bastiones).
  assert.equal(MUSIC_DISCS.length, 16);
  assert.deepEqual(DISCS.map((d) => d.key), ['13', 'cat', 'blocks', 'chirp', 'far', 'mall', 'mellohi', 'stal', 'strad', 'ward', '11', 'wait', 'otherside', '5', 'tears', 'pigstep']);
  MUSIC_DISCS.forEach((id, i) => {
    assert.equal(ITEMS[id].name, 'Disco de música');
    assert.equal(ITEMS[id].stack, 1);
    assert.equal(discOfItem(id), i);
    assert.equal(discTitle(id), DISCS[i].title);
    assert.ok(CREATIVE_ITEMS.includes(id));
    assert.ok(DISCS[i].seconds >= 60 && DISCS[i].seconds <= 180, `${DISCS[i].key}: de 1 a 3 minutos`);
  });
  assert.equal(ITEMS[GLOW_INK_SAC].name, 'Saco de tinta brillante');
  assert.equal(ITEMS[GLOW_ITEM_FRAME].name, 'Marco brillante');
  for (const id of [GLOW_INK_SAC, GLOW_ITEM_FRAME, ...MUSIC_DISCS]) {
    assert.ok(itemSpriteIndex(id) >= 0 && COLLECTION_SPRITES[ITEMS[id].sprite!], `sprite: ${ITEMS[id].key}`);
  }
  // Texturas: todas con su generador procedural.
  for (const t of [...SKULL_TEXTURES, 'jukebox_side', 'jukebox_top', 'jukebox_bottom', 'glow_item_frame']) {
    assert.ok(TEXTURE_DEFS.some((d) => d.name === t), `textura registrada: ${t}`);
    assert.ok(COLLECTION_GENERATORS[t], `generador: ${t}`);
  }
  assert.ok(BLOCKS[GLOW_ITEM_FRAME_MODEL].noItem);
  // El calamar brillante suelta sacos de tinta brillante.
  assert.ok(MOBS[MOB_GLOW_SQUID].drops.some(([id]) => id === GLOW_INK_SAC));
});

test('recetas y botín: tocadiscos, marco brillante y discos en mazmorras y minas', () => {
  const P = ITEMS.findIndex((it) => it?.key === 'oak_planks'), B = ITEMS.findIndex((it) => it?.key === 'birch_planks');
  assert.deepEqual(matchRecipe([P, P, P, B, DIAMOND, P, P, P, P], 3)?.out, { id: JUKEBOX, count: 1 });
  assert.equal(matchRecipe([P, P, P, P, 0, P, P, P, P], 3)?.out.id === JUKEBOX, false);
  assert.deepEqual(matchRecipe([ITEM_FRAME, GLOW_INK_SAC, 0, 0], 2)?.out, { id: GLOW_ITEM_FRAME, count: 1 });
  const has = (table: string, id: number) => LOOT_TABLES[table].entries.some(([e]) => e === id);
  for (const k of ['13', 'cat', 'otherside']) assert.ok(has('dungeon', MUSIC_DISCS[DISCS.findIndex((d) => d.key === k)]), `mazmorra: ${k}`);
  assert.ok(MUSIC_DISCS.some((id) => has('mineshaft', id)), 'minas');
  // Los creepers pueden soltar todos menos otherside.
  assert.equal(CREEPER_DISCS.length, 12);
  assert.ok(!CREEPER_DISCS.includes(MUSIC_DISCS[12]));
});

test('colocar cabezas: 16 orientaciones en el suelo, 4 en la pared, nunca en el techo', () => {
  const cells = new Map<string, number>([['0,0,0', STONE], ['3,1,0', STONE]]);
  const get = (x: number, y: number, z: number) => cells.get(`${x},${y},${z}`) ?? AIR;
  const zombie = SKULLS.zombie;
  // Mirando al norte (yaw 0), la cabeza mira al jugador (al sur): 8 dieciseisavos de vuelta.
  const floor = planPlacement(get, hitOn(0, 0, 0, 0, 1, 0, STONE), zombie, 0)!;
  assert.deepEqual(floor[0].slice(0, 3), [0, 1, 0]);
  assert.equal(familyBase(floor[0][3]), zombie);
  assert.equal(stateProps(floor[0][3])!.rot, 8);
  assert.equal(skullRotationFor(-Math.PI / 2), 12, 'mirando al este: la cabeza al oeste');
  assert.equal(skullRotationFor(Math.PI / 8), 7, 'de 22,5° en 22,5°');
  // En un lateral: de pared, apoyada en el bloque tocado.
  const wall = planPlacement(get, hitOn(3, 1, 0, -1, 0, 0, STONE), zombie, 0)!;
  assert.equal(familyBase(wall[0][3]), WALL_SKULLS.zombie);
  assert.equal(stateProps(wall[0][3])!.facing, 3);
  assert.ok(blockSupported(wall[0][3], (dx, dy, dz) => get(2 + dx, 1 + dy, dz)));
  // En el techo no.
  assert.equal(planPlacement(get, hitOn(3, 1, 0, 0, -1, 0, STONE), zombie, 0), null);
  // Cómo se dibujan: en el suelo bajan 4 píxeles y giran; en la pared, pegadas a ella.
  const p8 = skullPose(stateOf(zombie, { rot: 8 }))!;
  assert.ok(Math.abs(p8[0] + 1) < 1e-9 && Math.abs(p8[1]) < 1e-9 && p8[3] === -4);
  assert.deepEqual(skullPose(stateOf(WALL_SKULLS.zombie, { facing: 0 })), [1, 0, -0, 0, 4]);
  assert.equal(skullPose(STONE), undefined);
});

test('discos: composiciones propias, deterministas, dentro de su duración y distintas entre sí', () => {
  const signatures = new Set<string>();
  DISCS.forEach((d, i) => {
    const song = composeDisc(i);
    assert.equal(song.seconds, d.seconds);
    assert.ok(song.events.length > 40, `${d.key}: tiene notas (${song.events.length})`);
    let prev = 0;
    for (const e of song.events) {
      assert.ok(e.t >= prev && e.t < d.seconds, `${d.key}: notas ordenadas y dentro de la pieza`);
      assert.ok(e.d > 0 && e.t + e.d <= d.seconds + 1e-6, `${d.key}: no se pasa del final`);
      assert.ok(Number.isFinite(e.f) && e.f > 0 && e.v > 0 && e.v <= 1);
      prev = e.t;
    }
    // Llega hasta casi el final (no se queda en silencio a la mitad).
    assert.ok(song.events[song.events.length - 1].t > d.seconds * 0.8, `${d.key}: suena hasta el final`);
    // Siempre la misma partitura.
    assert.deepEqual(composeDisc(i, true).events.slice(0, 200), song.events.slice(0, 200), `${d.key}: determinista`);
    const insts = [...new Set(song.events.map((e) => e.i))].sort().join(',');
    signatures.add(`${insts}|${song.events.length}`);
  });
  assert.equal(signatures.size, DISCS.length, 'cada disco suena distinto');
});

// ------------------------------------------------------------------ servidor

function platform(store = new MemoryStore(), mode: 's' | 'c' = 's', name = 'Coleccionista'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6565, store);
  const c = h.join(name, mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 6; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, ids: readonly number[]) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && ids.includes(e.stack!.id)).reduce((n, e) => n + e.stack!.count, 0);

test('servidor: tocadiscos (meter, sonar para todos, sacar, romper y guardar)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  const jx = bx + 2, jz = bz;
  W.setBlock(jx, by, jz, JUKEBOX);
  const cat = MUSIC_DISCS[1];
  // Sin disco en la mano no hace nada.
  c.send({ t: 'jukebox', x: jx, y: by, z: jz, item: DIAMOND, q: 1 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.ok, false);
  c.send({ t: 'jukebox', x: jx, y: by, z: jz, item: cat, q: 2 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 2)?.take, 1, 'el disco se gasta');
  assert.ok(jukeboxHasDisc(W.getBlock(jx, by, jz)));
  assert.ok(h.gs.sys.collections.isPlaying(jx, by, jz));
  const fx = c.conn.take('fx').find((m) => m.k === 'jukebox');
  assert.equal(fx?.a, 1, 'avisa del disco (cat)');
  assert.deepEqual(fx?.p, [jx + 0.5, by + 0.5, jz + 0.5]);
  // Quien entra a los 10 s lo oye por donde va.
  h.tick(200);
  const c2 = h.join('Oyente', 's');
  const late = c2.conn.take('fx').find((m) => m.k === 'jukebox');
  assert.equal(late?.a, 1);
  assert.ok(late!.b >= 9.5 && late!.b <= 10.5, `por donde va (${late?.b} s)`);
  // Otra vez clic: sale el disco (cae encima) y se calla.
  c.conn.msgs = [];
  c.send({ t: 'jukebox', x: jx, y: by, z: jz, item: 0, q: 3 });
  assert.ok(c.conn.take('ires').find((m) => m.q === 3)?.ok);
  assert.equal(c.conn.take('fx').find((m) => m.k === 'jukebox')?.a, -1, 'avisa de que calla');
  assert.ok(!jukeboxHasDisc(W.getBlock(jx, by, jz)) && isJukebox(W.getBlock(jx, by, jz)));
  assert.equal(itemsOf(h, [cat]), 1, 'el disco cae');
  // Al terminar la pieza deja de sonar (el disco sigue dentro).
  c.send({ t: 'jukebox', x: jx, y: by, z: jz, item: MUSIC_DISCS[10], q: 4 });
  h.tick(20 * (DISCS[10].seconds + 2));
  assert.ok(!h.gs.sys.collections.isPlaying(jx, by, jz), 'el disco 11 terminó');
  assert.equal(h.gs.sys.collections.discAt(jx, by, jz), MUSIC_DISCS[10]);
  // Se guarda con su disco.
  h.gs.flush(true);
  const h2 = makeServer(6565, store);
  assert.equal(h2.gs.sys.collections.discAt(jx, by, jz), MUSIC_DISCS[10], 'el disco sigue dentro al volver');
  // Al romperlo cae el disco.
  W.setBlock(jx, by, jz, AIR);
  assert.equal(itemsOf(h, [MUSIC_DISCS[10]]), 1);
  assert.equal(h.gs.sys.collections.discAt(jx, by, jz), 0);
  // Poner un tocadiscos lo deja vacío.
  assert.equal(jukeboxWith(false), JUKEBOX);
});

test('servidor: un rayo carga al creeper y su explosión suelta una cabeza por víctima de la lista', () => {
  const { h, bx, by, bz } = platform(new MemoryStore(), 'c');
  const E = h.gs.entities;
  const creeper = E.spawnMob(MOB_CREEPER, bx + 3.5, by, bz + 0.5)!;
  const far = E.spawnMob(MOB_CREEPER, bx + 9.5, by, bz + 9.5)!;
  h.gs.sys.collections.lightning(bx + 4, by, bz + 1);
  assert.ok(creeper.charged, 'el cercano se carga');
  assert.ok(!far.charged, 'el lejano no');
  h.tick(2);
  assert.ok(creeper.flags & EF_CHARGED, 'los clientes lo ven cargado');
  // La explosión de un creeper cargado: el doble de fuerte y una sola cabeza. Fase 7 (mecanismos): las
  // explosiones hieren como en Minecraft (el doble que antes) y alcanzarían al creeper cargado, que sería la
  // primera víctima: se retira antes.
  E.remove(creeper.id);
  const zombie = E.spawnMob(MOB_ZOMBIE, bx - 3.5, by, bz + 0.5)!;
  const skeleton = E.spawnMob(MOB_SKELETON, bx - 3.5, by, bz + 1.5)!;
  zombie.health = skeleton.health = 1;
  E.explode(bx - 3.5, by + 0.5, bz + 1, CHARGED_POWER, true);
  assert.ok(zombie.dead && skeleton.dead);
  const heads = [SKULLS.zombie, SKULLS.skeleton];
  assert.equal(itemsOf(h, heads), 1, 'sólo una cabeza por explosión');
  // Una explosión normal no suelta cabezas.
  const z2 = E.spawnMob(MOB_ZOMBIE, bx + 6.5, by, bz - 6.5)!;
  z2.health = 1;
  E.explode(bx + 6.5, by + 0.5, bz - 6.5, 3, false);
  assert.ok(z2.dead);
  assert.equal(itemsOf(h, heads), 1);
});

test('servidor: el creeper cargado explota con potencia doble junto al jugador', () => {
  const { h, c, bx, by, bz } = platform();
  const creeper = h.gs.entities.spawnMob(MOB_CREEPER, bx + 2.5, by, bz + 0.5)!;
  creeper.charged = true;
  let power = 0;
  for (let i = 0; i < 200 && !power; i++) {
    h.tick(1);
    power = c.conn.take('fx').find((m) => m.k === 'explode')?.a ?? 0;
  }
  assert.equal(power, CHARGED_POWER);
});

test('servidor: el creeper que muere por la flecha de un esqueleto suelta un disco', () => {
  const { h, bx, by, bz } = platform(new MemoryStore(), 'c');
  const E = h.gs.entities;
  const skeleton = E.spawnMob(MOB_SKELETON, bx - 4.5, by, bz + 0.5)!;
  const creeper = E.spawnMob(MOB_CREEPER, bx + 1.5, by, bz + 0.5)!;
  creeper.health = 1;
  E.spawnArrow(bx - 0.5, by + 1, bz + 0.5, 20, 0, 0, skeleton.id, 4);
  h.tick(20);
  assert.ok(creeper.dead, 'la flecha lo mató');
  assert.equal(itemsOf(h, CREEPER_DISCS), 1);
  // Si lo mata otra cosa (un jugador), no.
  const other = E.spawnMob(MOB_CREEPER, bx + 5.5, by, bz + 5.5)!;
  other.health = 1;
  E.damage(other, 5, bx, bz, 'Coleccionista');
  assert.ok(other.dead);
  assert.equal(itemsOf(h, CREEPER_DISCS), 1);
});

test('cabezas puestas: el servidor las acepta en el casco y disimulan ante su especie', () => {
  const { h, c, bx, by, bz } = platform();
  c.send({ t: 'pos', p: [bx + 0.5, by, bz + 0.5], r: [0, 0], s: 0, a: [SKULLS.zombie, 0, 0, 0] });
  const view = h.gs.entities.host.players().find((p) => p.name === 'Coleccionista')!;
  assert.equal(view.head, SKULLS.zombie, 'la cabeza va en el hueco del casco');
  assert.ok(skullDisguises(SKULLS.zombie, MOB_ZOMBIE));
  assert.ok(!skullDisguises(SKULLS.zombie, MOB_SKELETON));
  assert.ok(!skullDisguises(SKULLS.player, MOB_ZOMBIE));
  const E = h.gs.entities;
  const zombie = E.spawnMob(MOB_ZOMBIE, bx + 16.5, by, bz + 0.5)!;
  const pv = (head: number): PlayerView => ({ id: 'x', name: 'x', x: bx + 0.5, y: by, z: bz + 0.5, alive: true, creative: false, lookingAt: -1, head });
  assert.ok(E.mobs.nearestPlayer(zombie, [pv(0)], 24, false), 'sin cabeza lo ve a 16 bloques');
  assert.equal(E.mobs.nearestPlayer(zombie, [pv(SKULLS.zombie)], 24, false), null, 'con la de zombi, no');
  assert.ok(E.mobs.nearestPlayer(zombie, [pv(SKULLS.skeleton)], 24, false), 'con otra cabeza, sí');
  const near = E.spawnMob(MOB_ZOMBIE, bx + 8.5, by, bz + 0.5)!;
  assert.ok(E.mobs.nearestPlayer(near, [pv(SKULLS.zombie)], 24, false), 'de cerca sí lo ve');
});

test('servidor: marco brillante (colgar, poner objeto, guardar y romper)', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store);
  const W = h.gs.world;
  W.setBlock(bx, by + 1, bz - 3, STONE);
  c.send({ t: 'hang', x: bx, y: by + 1, z: bz - 3, f: 2, item: GLOW_ITEM_FRAME, q: 1 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 1)?.take, 1);
  let frame = [...h.gs.entities.list.values()].find((e) => e.type === ENT_GLOW_FRAME)!;
  assert.ok(frame, 'es un marco brillante');
  c.send({ t: 'frame', e: frame.id, item: CLOCK, q: 2 });
  assert.equal(c.conn.take('ires').find((m) => m.q === 2)?.take, 1);
  frame = [...h.gs.entities.list.values()].find((e) => e.type === ENT_GLOW_FRAME)!;
  assert.equal(frame.variant, CLOCK);
  h.gs.flush(true);
  const h2 = makeServer(6565, store);
  const back = [...h2.gs.entities.list.values()].find((e) => e.type === ENT_GLOW_FRAME);
  assert.equal(back?.variant, CLOCK, 'se guarda como marco brillante, con su objeto');
  // Sin pared se cae: suelta el marco brillante y el reloj.
  W.setBlock(bx, by + 1, bz - 3, AIR);
  assert.equal(itemsOf(h, [GLOW_ITEM_FRAME]), 1);
  assert.equal(itemsOf(h, [CLOCK]), 1);
});
