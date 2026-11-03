// Fase 6: monstruos nuevos (ahogado, bruja, slimes, phantom, lepisma, araña de cueva y aldeano zombi):
// definiciones, modelos, texturas, bloques infestados, aparición y comportamiento en el servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBS, MOB_TYPES, MOB_ZOMBIE, MOB_DROWNED, MOB_WITCH, MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL, MOB_PHANTOM, MOB_SILVERFISH,
  MOB_CAVE_SPIDER, MOB_ZOMBIE_VILLAGER, ENT_ITEM, ENT_THROWN, boxFaces,
} from '../src/shared/mobs';
import {
  BLOCKS, STONE, COBBLESTONE, STONE_BRICKS, GLASS, WATER, AIR, COBWEB, INFESTED_STONE, INFESTED_COBBLESTONE, INFESTED_STONE_BRICKS,
  isInfested,
} from '../src/shared/blocks';
import {
  ITEMS, STICK, SUGAR, GUNPOWDER, REDSTONE, SPIDER_EYE, SLIME_BALL, PHANTOM_MEMBRANE, SPLASH_HARMING, SPLASH_POISON, SPLASH_SLOWNESS,
  TOOLS, itemSpriteIndex,
} from '../src/shared/items';
import { EFFECT_POISON } from '../src/shared/effects';
import { CHUNK_VOLUME, blockIndex } from '../src/shared/constants';
import { BIOME_MOUNTAINS, BIOME_PLAINS, BIOME_SWAMP } from '../src/shared/world/biomeIds';
import { isSlimeChunk, placeInfested } from '../src/shared/world/infested';
import { blockDrops } from '../src/shared/sim/drops';
import { pickMonster } from '../src/shared/sim/entities/monsterSpawns';
import { DROWN_CONVERT_SECONDS } from '../src/shared/sim/entities/monsterAi';
import { INSOMNIA_SECONDS } from '../src/shared/sim/server/monsters';
import type { Entity } from '../src/shared/sim/entities/types';
import type { WorldSim } from '../src/shared/sim/WorldSim';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { generateItemSprites } from '../src/client/textures/itemSprites';
import { makeServer, type Harness } from './harness';

const NEW: [number, number, string, string][] = [
  [MOB_DROWNED, 40, 'drowned', 'Ahogado'],
  [MOB_WITCH, 41, 'witch', 'Bruja'],
  [MOB_SLIME, 42, 'slime', 'Slime'],
  [MOB_PHANTOM, 43, 'phantom', 'Phantom'],
  [MOB_SILVERFISH, 44, 'silverfish', 'Lepisma'],
  [MOB_CAVE_SPIDER, 45, 'cave_spider', 'Araña de cueva'],
  [MOB_ZOMBIE_VILLAGER, 46, 'zombie_villager', 'Aldeano zombi'],
  [MOB_SLIME_MEDIUM, 47, 'slime_medium', 'Slime mediano'],
  [MOB_SLIME_SMALL, 48, 'slime_small', 'Slime pequeño'],
];

// ------------------------------------------------------------------ definiciones, modelos y texturas

test('monstruos nuevos: ids 40–48, nombre en español, hostiles y registrados', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d, key);
    assert.equal(d.key, key);
    assert.equal(d.name, name);
    assert.equal(d.hostile, true, key);
    assert.ok(MOB_TYPES.includes(id));
  }
  // Slimes: tamaños 4, 2 y 1; sólo los pequeños sueltan bolas y no hacen daño.
  assert.deepEqual([MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL].map((t) => MOBS[t].scale), [4, 2, 1]);
  assert.ok(MOBS[MOB_SLIME].width > MOBS[MOB_SLIME_MEDIUM].width && MOBS[MOB_SLIME_MEDIUM].width > MOBS[MOB_SLIME_SMALL].width);
  assert.deepEqual(MOBS[MOB_SLIME_SMALL].drops, [[SLIME_BALL, 0, 2]]);
  assert.equal(MOBS[MOB_SLIME_SMALL].damage, 0);
  assert.equal(MOBS[MOB_SLIME].drops.length, 0);
  // Botín de la bruja y del phantom; el phantom arde al sol.
  for (const it of [STICK, SUGAR, GUNPOWDER, REDSTONE, SPIDER_EYE]) assert.ok(MOBS[MOB_WITCH].drops.some(([i]) => i === it));
  assert.ok(MOBS[MOB_PHANTOM].drops.some(([i]) => i === PHANTOM_MEMBRANE));
  assert.ok(MOBS[MOB_PHANTOM].burnsInSun && MOBS[MOB_DROWNED].burnsInSun);
  // La araña de cueva es más pequeña que la araña y, como ella, neutral de día.
  assert.ok(MOBS[MOB_CAVE_SPIDER].width < 1 && MOBS[MOB_CAVE_SPIDER].neutral);
  // El aldeano zombi tiene cabeza de aldeano con nariz.
  assert.ok(MOBS[MOB_ZOMBIE_VILLAGER].parts.some((p) => p.name === 'nose' && p.parent === 'head'));
  // Objetos nuevos con nombre.
  for (const it of [SLIME_BALL, PHANTOM_MEMBRANE, SPLASH_HARMING, SPLASH_POISON, SPLASH_SLOWNESS]) assert.ok(ITEMS[it]?.name);
});

test('modelos: padres válidos y cajas dentro del atlas sin solaparse', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    const rects = new Map<string, [number, number, number, number]>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${key}: padre ${p.parent} antes que ${p.name}`);
      names.add(p.name);
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
        assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${key}.${p.name} fuera del atlas`);
      }
      rects.set(`${p.uv},${p.size}`, [p.uv[0], p.uv[1], 2 * (dd + w), dd + h]);
    }
    const list = [...rects.values()];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]];
        const overlap = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
        assert.ok(!overlap, `${key}: UV solapadas ${a} / ${b}`);
      }
    }
  }
});

test('texturas: se generan y cubren todas las caras', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const tex = generateMobTexture(id);
    assert.equal(tex.width, d.atlas[0]);
    assert.equal(tex.height, d.atlas[1]);
    for (const p of d.parts) {
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
        for (let y = v; y < v + fh; y++) {
          for (let x = u; x < u + fw; x++) {
            const o = (y * tex.width + x) * 4;
            // Opaco (255) o con brillo propio (ojos: 128–250).
            assert.ok(tex.rgba[o + 3] >= 128, `${key}.${p.name}: téxel sin pintar en ${x},${y}`);
          }
        }
      }
    }
  }
});

test('sprites de los objetos nuevos: dibujados (no el marcador)', () => {
  const sprites = generateItemSprites();
  const layer = sprites.size * sprites.size * 4;
  for (const it of [SLIME_BALL, PHANTOM_MEMBRANE, SPLASH_HARMING, SPLASH_POISON, SPLASH_SLOWNESS]) {
    const i = itemSpriteIndex(it);
    assert.ok(i >= 0, ITEMS[it].key);
    let opaque = 0, marker = 0;
    for (let k = 0; k < layer; k += 4) {
      const o = i * layer + k;
      if (sprites.rgba[o + 3] === 255) opaque++;
      if (sprites.rgba[o] === 200 && sprites.rgba[o + 1] === 40 && sprites.rgba[o + 2] === 200) marker++;
    }
    assert.ok(opaque > 20 && marker === 0, ITEMS[it].key);
  }
});

// ------------------------------------------------------------------ bloques infestados y generación

test('bloques infestados: parecen normales, se rompen antes y no sueltan nada', () => {
  const pairs: [number, number][] = [[INFESTED_STONE, STONE], [INFESTED_COBBLESTONE, COBBLESTONE], [INFESTED_STONE_BRICKS, STONE_BRICKS]];
  for (const [inf, base] of pairs) {
    assert.ok(isInfested(inf) && !isInfested(base));
    assert.deepEqual(BLOCKS[inf].tex, BLOCKS[base].tex);
    assert.ok(BLOCKS[inf].hardness < BLOCKS[base].hardness);
    assert.deepEqual(blockDrops(inf, TOOLS.iron.pickaxe), []);
    assert.deepEqual(blockDrops(inf, 0), []);
  }
});

test('generación: piedra infestada sólo en las montañas y chunks de slime deterministas', () => {
  const fill = () => new Uint16Array(CHUNK_VOLUME).fill(STONE);
  const count = (b: Uint16Array) => b.reduce((n, id) => n + (id === INFESTED_STONE ? 1 : 0), 0);
  const mountains = fill();
  placeInfested(mountains, 3, -2, 777, BIOME_MOUNTAINS);
  assert.ok(count(mountains) > 5, 'vetas en las montañas');
  for (let y = 80; y < 120; y++) assert.notEqual(mountains[blockIndex(4, y, 4)], INFESTED_STONE, 'no por encima de y = 72');
  const again = fill();
  placeInfested(again, 3, -2, 777, BIOME_MOUNTAINS);
  assert.deepEqual(again, mountains, 'determinista');
  const plains = fill();
  placeInfested(plains, 3, -2, 777, BIOME_PLAINS);
  assert.equal(count(plains), 0);
  // Uno de cada diez chunks (más o menos), siempre los mismos para una semilla.
  let n = 0, same = 0;
  for (let cx = 0; cx < 100; cx++) {
    for (let cz = 0; cz < 100; cz++) {
      if (isSlimeChunk(42, cx, cz)) n++;
      if (isSlimeChunk(42, cx, cz) === isSlimeChunk(43, cx, cz)) same++;
    }
  }
  assert.ok(n > 700 && n < 1300, `chunks de slime: ${n} de 10000`);
  assert.ok(same < 10000, 'otra semilla, otros chunks');
});

// ------------------------------------------------------------------ servidor

/** Plataforma de piedra (con techo opcional) en el cielo, con los chunks cargados. */
function platform(W: WorldSim, x0: number, y: number, z0: number, r: number, roof = false): void {
  for (let cx = Math.floor((x0 - r) / 16); cx <= Math.floor((x0 + r) / 16); cx++) {
    for (let cz = Math.floor((z0 - r) / 16); cz <= Math.floor((z0 + r) / 16); cz++) W.ensureChunk(cx, cz);
  }
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      W.setBlock(x0 + dx, y - 1, z0 + dz, STONE);
      if (roof) W.setBlock(x0 + dx, y + 3, z0 + dz, STONE);
    }
  }
}

function mobsOf(h: Harness, type: number): Entity[] {
  return [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (h: Harness): any => h.gs.sys;

test('servidor: al romper un bloque infestado sale una lepisma, y herida despierta a las demás', () => {
  const h = makeServer(101);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 8);
  const c = h.join('Minero');
  c.pos(8.5, 150, 8.5);
  W.setBlock(10, 150, 8, INFESTED_STONE);
  c.send({ t: 'set', x: 10, y: 150, z: 8, b: 0, tool: TOOLS.iron.pickaxe });
  assert.equal(W.getBlock(10, 150, 8), AIR);
  const first = mobsOf(h, MOB_SILVERFISH);
  assert.equal(first.length, 1, 'sale una lepisma');
  assert.ok(![...h.gs.entities.list.values()].some((e) => e.type === ENT_ITEM), 'el bloque no suelta nada');
  // Seis bloques infestados cerca; herida por un jugador, al segundo los despierta.
  for (let i = 0; i < 6; i++) W.setBlock(4 + i, 150, 12, INFESTED_COBBLESTONE);
  h.gs.entities.rand = () => 0.9;
  h.gs.entities.damage(first[0], 1, 8, 8, 'Minero');
  h.tick(30);
  assert.equal(mobsOf(h, MOB_SILVERFISH).length, 7, 'salen seis lepismas más');
  for (let i = 0; i < 6; i++) assert.equal(W.getBlock(4 + i, 150, 12), AIR);
});

test('servidor: los slimes se dividen al morir y los pequeños sueltan bolas de slime', () => {
  const h = makeServer(102);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 10);
  h.join('Mirón', 'c').pos(8.5, 150, 8.5);
  const E = h.gs.entities;
  E.rand = () => 0.99;
  const big = E.spawnMob(MOB_SLIME, 8.5, 150, 8.5)!;
  E.damage(big, 100, 0, 0, 'Mirón');
  const mids = mobsOf(h, MOB_SLIME_MEDIUM);
  assert.ok(mids.length >= 2 && mids.length <= 4, `medianos: ${mids.length}`);
  E.damage(mids[0], 100, 0, 0, 'Mirón');
  const smalls = mobsOf(h, MOB_SLIME_SMALL);
  assert.ok(smalls.length >= 2 && smalls.length <= 4, `pequeños: ${smalls.length}`);
  E.damage(smalls[0], 100, 0, 0, 'Mirón');
  assert.equal(mobsOf(h, MOB_SLIME_SMALL).length, smalls.length - 1, 'los pequeños no se dividen');
  const balls = [...E.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === SLIME_BALL);
  assert.ok(balls.length > 0, 'bola de slime');
  // Saltan: con tiempo, alguno despega del suelo.
  E.rand = Math.random;
  let airborne = false;
  for (let i = 0; i < 160 && !airborne; i++) {
    h.tick(1);
    airborne = mobsOf(h, MOB_SLIME_MEDIUM).some((e) => !e.onGround && e.vy > 0);
  }
  assert.ok(airborne, 'los slimes saltan');
});

test('servidor: un zombi que se ahoga se convierte en ahogado', () => {
  const h = makeServer(103);
  const W = h.gs.world;
  platform(W, 8, 140, 8, 12);
  const c = h.join('Buzo', 'c');
  c.pos(8.5, 140, 8.5);
  // Columna de agua cerrada con cristal (4 de hondo).
  const [x, z] = [12, 8];
  for (let y = 149; y <= 154; y++) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.setBlock(x + dx, y, z + dz, GLASS);
  }
  for (let y = 150; y <= 153; y++) W.setBlock(x, y, z, WATER);
  const zombie = h.gs.entities.spawnMob(MOB_ZOMBIE, x + 0.5, 151, z + 0.5)!;
  h.tick(20 * (DROWN_CONVERT_SECONDS - 2));
  assert.ok(h.gs.entities.list.has(zombie.id), 'todavía es un zombi');
  h.tick(20 * 4);
  assert.ok(!h.gs.entities.list.has(zombie.id), 'el zombi ya no está');
  const near = mobsOf(h, MOB_DROWNED).filter((e) => Math.hypot(e.x - x - 0.5, e.z - z - 0.5) < 2);
  assert.equal(near.length, 1, 'ahora es un ahogado');
});

test('servidor: el ahogado nada hacia su presa', () => {
  // Túnel de agua cerrado: el ahogado nada hacia un jugador en supervivencia.
  const h = makeServer(113);
  const W = h.gs.world;
  const t = h.join('Nadador');
  const [ty, tz] = [120, 30];
  platform(W, 8, ty, tz, 12);
  for (let dx = -1; dx <= 13; dx++) {
    for (let dy = -1; dy <= 2; dy++) for (let dz = -1; dz <= 1; dz++) W.setBlock(2 + dx, ty + dy, tz + dz, GLASS);
    if (dx >= 0 && dx <= 12) for (let dy = 0; dy <= 1; dy++) W.setBlock(2 + dx, ty + dy, tz, WATER);
  }
  t.pos(14.5, ty, tz + 0.5);
  const d = h.gs.entities.spawnMob(MOB_DROWNED, 2.5, ty, tz + 0.5)!;
  h.tick(10);
  const before = Math.abs(d.x - 14.5);
  h.tick(40);
  assert.ok(Math.abs(d.x - 14.5) < before - 2, `se acerca nadando: ${before.toFixed(1)} → ${Math.abs(d.x - 14.5).toFixed(1)}`);
});

test('servidor: la bruja lanza pociones y bebe curación cuando está herida', () => {
  const h = makeServer(104);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 14);
  const c = h.join('Víctima');
  c.pos(8.5, 150, 8.5);
  const witch = h.gs.entities.spawnMob(MOB_WITCH, 15.5, 150, 8.5)!;
  let thrown = false, hit = false;
  for (let i = 0; i < 300 && !hit; i++) {
    h.tick(1);
    thrown ||= [...h.gs.entities.list.values()].some((e) => e.type === ENT_THROWN && e.shooter === witch.id);
    const effects = c.conn.take('effect');
    const hurts = c.conn.take('hurt').filter((m) => m.c === 'witch');
    hit = effects.length > 0 || hurts.length > 0;
  }
  assert.ok(thrown, 'lanza una poción');
  assert.ok(hit, 'la poción alcanza al jugador (efecto o daño)');
  // Herida: bebe y se cura (Fase 7: una poción de curación I, 4 de vida, como en Minecraft).
  witch.health = 8;
  h.tick(20 * 6);
  assert.ok(witch.health >= 12, `se cura bebiendo: ${witch.health}`);
});

test('servidor: una poción de veneno envenena a quien está cerca', () => {
  const h = makeServer(105);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 4);
  const c = h.join('Objetivo');
  c.pos(8.5, 150, 8.5);
  const p = h.gs.entities.spawnThrown(SPLASH_POISON, 8.5, 153, 8.5, 0, -5, 0, '');
  p.shooter = 424242;
  h.tick(20);
  const eff = c.conn.take('effect');
  assert.ok(eff.some((m) => m.id === EFFECT_POISON && m.s > 0), 'recibe veneno');
});

test('servidor: la araña de cueva envenena y las minas invocan arañas de cueva', () => {
  const h = makeServer(106);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 6, true);
  const c = h.join('Espeleólogo');
  c.pos(8.5, 150, 8.5);
  h.gs.entities.spawnMob(MOB_CAVE_SPIDER, 9.7, 150, 8.5);
  let poisoned = false;
  for (let i = 0; i < 60 && !poisoned; i++) {
    h.tick(1);
    poisoned = c.conn.take('effect').some((m) => m.id === EFFECT_POISON);
  }
  assert.ok(poisoned, 'el mordisco envenena');
  W.setBlock(12, 150, 12, COBWEB);
  assert.equal(priv(h).spawners.mobOf(13, 150, 12), MOB_CAVE_SPIDER);
});

test('servidor: insomnio y phantoms (se reinicia al dormir y se guarda)', () => {
  const h = makeServer(107);
  const W = h.gs.world;
  platform(W, 8, 150, 8, 12);
  const c = h.join('Desvelado');
  c.pos(8.5, 150, 8.5);
  h.tick(2);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gs = h.gs as any;
  const monsters = h.gs.sys.monsters;
  gs.setTime(10.75); // medianoche
  gs.rand = () => 0.99;
  monsters.setInsomnia('Desvelado', INSOMNIA_SECONDS * 2);
  for (let i = 0; i < 125; i++) monsters.tick();
  gs.rand = Math.random;
  const phantoms = mobsOf(h, MOB_PHANTOM);
  assert.ok(phantoms.length >= 1, 'aparecen phantoms');
  assert.ok(phantoms.every((p) => p.y > 165), 'muy por encima del jugador');
  // Atacan en picado.
  let bitten = false;
  for (let i = 0; i < 20 * 60 && !bitten; i++) {
    h.tick(1);
    bitten = c.conn.take('hurt').some((m) => m.c === 'phantom');
  }
  assert.ok(bitten, 'un phantom se lanza en picado y muerde');
  // Guardado y reinicio al dormir.
  h.gs.flush(true);
  assert.ok(JSON.parse(h.store.getMeta('insomnia')!).desvelado > INSOMNIA_SECONDS);
  const session = [...gs.sessions.values()].find((s: { name: string }) => s.name === 'Desvelado');
  session.sleeping = 1;
  monsters.tick();
  assert.equal(monsters.insomnia('Desvelado'), 0, 'dormir reinicia la cuenta');
  // Sin insomnio, no hay phantoms nuevos.
  session.sleeping = null;
  const before = mobsOf(h, MOB_PHANTOM).length;
  for (let i = 0; i < 200; i++) monsters.tick();
  assert.ok(mobsOf(h, MOB_PHANTOM).length <= before);
});

test('aparición: brujas y slimes en los pantanos, algún aldeano zombi', () => {
  const h = makeServer(108);
  h.gs.world.ensureChunk(0, 0);
  const E = h.gs.entities;
  const seq = (...v: number[]) => {
    let i = 0;
    E.rand = () => v[Math.min(i++, v.length - 1)];
  };
  seq(0.05);
  assert.equal(pickMonster(E, MOB_ZOMBIE, BIOME_SWAMP, 8, 250, 8), MOB_WITCH);
  seq(0.2, 0);
  assert.equal(pickMonster(E, MOB_ZOMBIE, BIOME_SWAMP, 8, 250, 8), MOB_SLIME, 'slime grande donde cabe');
  seq(0.5, 0.01);
  assert.equal(pickMonster(E, MOB_ZOMBIE, BIOME_PLAINS, 8, 250, 8), MOB_ZOMBIE_VILLAGER);
  seq(0.5, 0.5);
  assert.equal(pickMonster(E, MOB_ZOMBIE, BIOME_PLAINS, 8, 250, 8), MOB_ZOMBIE);
});
