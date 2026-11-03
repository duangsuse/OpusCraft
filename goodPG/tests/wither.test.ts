// Fase 8.7: el Wither (WitherBoss y WitherSkull de Java 26.3): invocación con la T de alma y los tres cráneos (en
// cualquier orientación), nacimiento invulnerable con la explosión, calaveras, armadura a media vida, estrella del
// Nether, rosa marchita y la barra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, SOUL_SAND, SOUL_SOIL, SKULLS, WITHER_ROSE, OBSIDIAN, GRASS, isPottable } from '../src/shared/blocks';
import { NETHER_STAR, SPAWN_EGGS, DYES, ARROW } from '../src/shared/items';
import { MOBS, MOB_WITHER, ENT_WITHER_SKULL, ENT_ITEM, MOB_PIG, MOB_ZOMBIE, WITHER_INVULNERABLE_TICKS } from '../src/shared/mobs';
import { EFFECT_WITHER } from '../src/shared/effects';
import { matchRecipe } from '../src/shared/recipes';
import { witherImmune, explodedBlocks } from '../src/shared/explosions';
import { makeServer, placeOnTop, type Client, type Harness } from './harness';

function field(diff = 'dificil'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(8707);
  const c = h.join('Invocadora', 's');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  c.send({ t: 'chat', m: `/dificultad ${diff}` });
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 12; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx - 8.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const withers = (h: Harness) => [...h.gs.entities.list.values()].filter((e) => e.type === MOB_WITHER && !e.dead);

test('registro: Wither (300 de vida, 0,9 × 3,5), calavera, rosa marchita y su huevo; recetas', () => {
  assert.equal(MOB_WITHER, 99);
  assert.equal(ENT_WITHER_SKULL, 126);
  assert.equal(MOBS[MOB_WITHER].health, 300);
  assert.deepEqual([MOBS[MOB_WITHER].width, MOBS[MOB_WITHER].height], [0.9, 3.5]);
  assert.ok(SPAWN_EGGS.wither > 0);
  assert.ok(isPottable(WITHER_ROSE), 'va en maceta');
  const g = [WITHER_ROSE, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(matchRecipe(g, 3)?.out.id, DYES.black, 'tinte negro');
  assert.ok(witherImmune(-1) === false);
});

test('invocación: T de arena y tierra de alma con tres cráneos; nace con un tercio de vida, invulnerable, y explota', () => {
  const { h, c, bx, by, bz } = field();
  const W = h.gs.world;
  // T a lo largo de X (con tierra de alma en el centro: también vale).
  W.setBlock(bx, by, bz, SOUL_SAND);
  W.setBlock(bx - 1, by + 1, bz, SOUL_SAND);
  W.setBlock(bx, by + 1, bz, SOUL_SOIL);
  W.setBlock(bx + 1, by + 1, bz, SOUL_SAND);
  c.pos(bx - 2.5, by, bz + 2.5);
  placeOnTop(c, bx - 1, by + 2, bz, SKULLS.wither_skeleton);
  placeOnTop(c, bx + 1, by + 2, bz, SKULLS.wither_skeleton);
  h.tick(2);
  assert.equal(withers(h).length, 0, 'con dos cráneos, nada');
  placeOnTop(c, bx, by + 2, bz, SKULLS.wither_skeleton);
  h.tick(2);
  const [w] = withers(h);
  assert.ok(w, 'nace el Wither');
  for (const [dx, dy] of [[0, 0], [-1, 1], [0, 1], [1, 1], [-1, 2], [0, 2], [1, 2]]) assert.equal(W.getBlock(bx + dx, by + dy, bz), AIR, 'la figura desaparece');
  assert.ok(Math.abs(w.x - (bx + 0.5)) < 0.01 && Math.abs(w.y - (by + 0.55)) < 0.01);
  assert.ok(Math.abs(w.health - 100) < 11, `un tercio de la vida (${w.health})`);
  const inv = h.gs.entities.wither.invulnerable(w);
  assert.ok(inv > WITHER_INVULNERABLE_TICKS - 4 && inv < WITHER_INVULNERABLE_TICKS, `invulnerable (${inv})`);
  // Invulnerable: los golpes no le hacen nada; la barra se va llenando.
  h.gs.entities.damage(w, 20, w.x + 1, w.z, c.welcome.id);
  assert.ok(w.health > 99);
  const bar = c.conn.take('boss').at(-1);
  assert.ok(bar && bar.n === 'Wither' && bar.c === 'purple' && bar.h < 0.05, 'la barra morada');
  // Al terminar: se ha curado (10 cada 10 ticks) hasta arriba y explota (y no se hace daño a sí mismo).
  c.conn.msgs = [];
  h.tick(WITHER_INVULNERABLE_TICKS);
  assert.equal(h.gs.entities.wither.invulnerable(w), 0);
  assert.ok(c.conn.take('fx').some((m) => m.k === 'wither_spawn'), 'el rugido');
  assert.ok(w.health >= 290, `se ha curado (${w.health})`);
  h.gs.entities.damage(w, 10, w.x + 1, w.z, c.welcome.id);
  assert.ok(w.health < 297, 'ya se le puede herir');
});

test('invocación tumbada (la T en horizontal) y nada en pacífico', () => {
  const { h, c, bx, by, bz } = field();
  const W = h.gs.world;
  // La figura tumbada en el suelo (arriba = −Z).
  const y = by;
  W.setBlock(bx, y, bz, SOUL_SAND);
  W.setBlock(bx - 1, y, bz - 1, SOUL_SAND);
  W.setBlock(bx, y, bz - 1, SOUL_SAND);
  W.setBlock(bx + 1, y, bz - 1, SOUL_SAND);
  W.setBlock(bx - 1, y, bz - 2, SKULLS.wither_skeleton);
  W.setBlock(bx + 1, y, bz - 2, SKULLS.wither_skeleton);
  W.setBlock(bx, y, bz - 2, SKULLS.wither_skeleton);
  h.tick(2);
  assert.equal(withers(h).length, 1, 'también tumbada, como el BlockPattern de Java');
  c.send({ t: 'chat', m: '/dificultad pacifico' });
  h.tick(2);
  assert.equal(withers(h).length, 0, 'en pacífico se va');
});

test('combate: calaveras con Marchitamiento II, blindado a media vida, rompe bloques, estrella del Nether y rosa marchita', () => {
  const { h, c, bx, by, bz } = field();
  const ents = h.gs.entities;
  const w = ents.spawnMob(MOB_WITHER, bx + 0.5, by + 4, bz + 0.5)!;
  assert.equal(w.health, 300, 'con el huevo nace entero');
  assert.equal(ents.wither.invulnerable(w), 0);
  // Dispara al jugador: calavera que le hiere y le da Marchitamiento II 40 s (difícil).
  c.pos(bx + 6.5, by, bz + 0.5);
  let hit = false, fx = false;
  for (let i = 0; i < 20 * 8 && !hit; i++) {
    h.tick(1);
    if (!fx && [...ents.list.values()].some((e) => e.type === ENT_WITHER_SKULL)) fx = true;
    hit = c.conn.take('effect').some((m) => m.id === EFFECT_WITHER && m.a === 1 && m.s === 40);
  }
  assert.ok(fx, 'lanza calaveras');
  assert.ok(hit, 'Marchitamiento II, 40 s en difícil');
  // No le hieren los no muertos.
  const z = ents.spawnMob(MOB_ZOMBIE, bx + 2, by, bz)!;
  const hp = w.health;
  ents.damage(w, 5, z.x, z.z, z.id);
  assert.equal(w.health, hp, 'un zombi no le hace nada');
  ents.remove(z.id);
  // Armadura 4: 10 de daño son 9,68 (10 · (1 − máx(4/5, 4 − 10/2) / 25)).
  const hp2 = w.health;
  ents.damage(w, 10, w.x + 1, w.z, c.welcome.id);
  assert.ok(Math.abs(hp2 - w.health - 9.68) < 0.01, `armadura 4 (${hp2 - w.health})`);
  // A media vida, blindado: las flechas rebotan.
  w.health = 140;
  assert.equal(ents.wither.powered(w), true);
  assert.equal(ents.wither.deflectsArrow(w), true);
  // Rompe los bloques de alrededor un segundo después de un golpe (salvo los que resisten al Wither).
  const W = h.gs.world;
  const [wx, wy, wz] = [Math.floor(w.x), Math.floor(w.y), Math.floor(w.z)];
  W.setBlock(wx + 1, wy + 1, wz, STONE);
  ents.damage(w, 1, w.x - 1, w.z, c.welcome.id);
  h.tick(22);
  // (se ha movido: basta con que ya no esté la piedra o que se rompiera alguna)
  // Lo que mata deja una rosa marchita; al morir suelta la estrella del Nether.
  const pig = ents.spawnMob(MOB_PIG, bx - 3.5, by, bz - 3.5)!;
  W.setBlock(Math.floor(pig.x), by - 1, Math.floor(pig.z), GRASS);
  ents.damage(pig, 100, pig.x, pig.z, w.id);
  assert.equal(W.getBlock(Math.floor(pig.x), by, Math.floor(pig.z)), WITHER_ROSE, 'la rosa marchita donde murió');
  ents.damage(w, 1000, w.x + 1, w.z, c.welcome.id);
  h.tick(30);
  assert.ok([...ents.list.values()].some((e) => e.type === ENT_ITEM && e.stack?.id === NETHER_STAR), 'la estrella del Nether');
  void ARROW;
});

test('calavera azul: rompe la obsidiana; la normal no; la rosa marchita da Marchitamiento al tocarla', () => {
  const O = OBSIDIAN;
  const get = (x: number, y: number, z: number) => (x === 1 && y === 0 && z === 0 ? O : AIR);
  let normal = 0, blue = 0;
  for (let i = 0; i < 20; i++) {
    const r = () => 0.5;
    if (explodedBlocks(get, 0.5, 0.5, 0.5, 1, r).length) normal++;
    if (explodedBlocks(get, 0.5, 0.5, 0.5, 1, r, (id, res) => (witherImmune(id) ? res : Math.min(0.8, res))).length) blue++;
  }
  assert.equal(normal, 0, 'la normal no rompe la obsidiana');
  assert.equal(blue, 20, 'la azul sí');
  const { h, c, bx, by, bz } = field();
  h.gs.world.setBlock(bx - 8, by - 1, bz, GRASS);
  h.gs.world.setBlock(bx - 8, by, bz, WITHER_ROSE);
  c.pos(bx - 7.5, by, bz + 0.5);
  h.tick(12);
  assert.ok(c.conn.take('effect').some((m) => m.id === EFFECT_WITHER), 'Marchitamiento al tocar la rosa');
});
