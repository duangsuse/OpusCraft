// Fase 8.3 (criaturas del Nether): registro y datos de Java 26.3 (tamaños, vida, trueque, aparición, recetas) y su
// comportamiento en el servidor: trueque del piglin, piglins zombificados que se avisan, conversión fuera del
// Nether, cubos de magma que se dividen, bola de fuego del ghast que se devuelve, strider sobre la lava,
// Marchitamiento del esqueleto wither, embestida del hoglin y aparición natural en el Nether.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBS, ENT_ITEM, MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_MAGMA_CUBE,
  MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER, MOB_WITHER_SKELETON, ENT_LARGE_FIREBALL,
  ENT_SMALL_FIREBALL, BARTER, NETHER_SPAWNS, rollBarter, isPiglinLoved, isBarterCurrency, isGoldArmor, isGuardedByPiglins,
  isPiglinRepellentBlock, packGear, gearMain, gearOff, gearArmor, javaGroundSpeed, isNetherMob, magmaSize,
} from '../src/shared/mobs';
import {
  ITEMS, SPAWN_EGGS, GOLD_INGOT, GOLD_NUGGET, TOOLS, ARMOR, CROSSBOW, WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, SPECTRAL_ARROW,
  MUSIC_DISC_TEARS, FISHING_ROD, GUNPOWDER, BLAZE_POWDER, COAL, ARROW, GLOWSTONE_DUST, MUSIC_DISCS,
} from '../src/shared/items';
import {
  AIR, STONE, LAVA, NETHERRACK, SKULLS, BLOCKS, WARPED_FUNGUS, GOLD_BLOCK, CHEST, SOUL_TORCH, SOUL_FIRE, ALL_SKULL_KINDS,
} from '../src/shared/blocks';
import { matchRecipe } from '../src/shared/recipes';
import { SOUL_SPEED, ENCHANTS } from '../src/shared/enchantments';
import { EFFECT_WITHER } from '../src/shared/effects';
import { DIM_NETHER } from '../src/shared/dimensions';
import { NO_SPAWN_EGG, NETHER_SPAWN_EGG_DEFS } from '../src/shared/spawnEggs';
import { skullDisguises } from '../src/shared/collections';
import type { Entity } from '../src/shared/sim/entities/types';
import { makeServer, type Harness } from './harness';
import type { WorldSim } from '../src/shared/sim/WorldSim';

const mobsOf = (h: Harness, type: number): Entity[] => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);

/** Sala de piedra con los chunks cargados (suelo en y − 1, techo opcional y aire dentro). */
function arena(W: WorldSim, x0: number, y: number, z0: number, r: number, height = 8): void {
  for (let cx = Math.floor((x0 - r) / 16); cx <= Math.floor((x0 + r) / 16); cx++) {
    for (let cz = Math.floor((z0 - r) / 16); cz <= Math.floor((z0 + r) / 16); cz++) W.ensureChunk(cx, cz);
  }
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      W.setBlock(x0 + dx, y - 1, z0 + dz, STONE);
      for (let k = 0; k < height; k++) W.setBlock(x0 + dx, y + k, z0 + dz, AIR);
    }
  }
}

// ------------------------------------------------------------------ datos

test('criaturas del Nether: ids, tamaños, vida y daño de Java', () => {
  assert.deepEqual(
    [MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER, MOB_WITHER_SKELETON],
    [84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95],
  );
  assert.deepEqual([ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL], [121, 122]);
  const m = (id: number) => MOBS[id];
  assert.deepEqual([m(MOB_PIGLIN).health, m(MOB_PIGLIN).width, m(MOB_PIGLIN).height, m(MOB_PIGLIN).damage], [16, 0.6, 1.95, 5]);
  assert.deepEqual([m(MOB_PIGLIN_BRUTE).health, m(MOB_PIGLIN_BRUTE).damage, m(MOB_PIGLIN_BRUTE).xp], [50, 7, 20]);
  assert.deepEqual([m(MOB_GHAST).health, m(MOB_GHAST).width, m(MOB_GHAST).height, m(MOB_GHAST).scale], [10, 4, 4, 4.5]);
  assert.deepEqual([m(MOB_BLAZE).health, m(MOB_BLAZE).damage, m(MOB_BLAZE).xp], [20, 6, 10]);
  assert.deepEqual([MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL].map((t) => [m(t).health, m(t).damage, magmaSize(t)]), [[16, 6, 4], [4, 4, 2], [1, 3, 1]]);
  assert.deepEqual([m(MOB_HOGLIN).health, m(MOB_HOGLIN).width, m(MOB_HOGLIN).height], [40, 1.3964844, 1.4]);
  assert.deepEqual([m(MOB_STRIDER).health, m(MOB_STRIDER).width, m(MOB_STRIDER).height, m(MOB_STRIDER).hostile], [20, 0.9, 1.7, false]);
  assert.deepEqual([m(MOB_WITHER_SKELETON).width, m(MOB_WITHER_SKELETON).height, m(MOB_WITHER_SKELETON).damage, m(MOB_WITHER_SKELETON).scale], [0.7, 2.4, 8, 1.2]);
  // Inmunes al fuego: todas menos el piglin, el bruto y el hoglin.
  for (const t of [MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_MAGMA_CUBE, MOB_ZOGLIN, MOB_STRIDER, MOB_WITHER_SKELETON]) assert.ok(m(t).fireImmune, m(t).key);
  for (const t of [MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_HOGLIN]) assert.ok(!m(t).fireImmune, m(t).key);
  // Velocidad de Java (s² / 0,454 por tick): el zombi a 0,23 anda a 2,33 bloques/s.
  assert.ok(Math.abs(javaGroundSpeed(0.23) - 2.33) < 0.01);
  // Huevos: todos menos los cubos de magma mediano y pequeño.
  for (const t of [84, 85, 86, 87, 88, 89, 92, 93, 94, 95]) assert.ok(SPAWN_EGGS[m(t).key], `huevo de ${m(t).key}`);
  assert.ok(NO_SPAWN_EGG.has('magma_cube_medium') && NO_SPAWN_EGG.has('magma_cube_small'));
  assert.equal(NETHER_SPAWN_EGG_DEFS.length, 10);
  // El equipo empaquetado (mano derecha, izquierda y armadura de oro).
  const g = packGear(TOOLS.golden.sword, GOLD_INGOT, 0b1011);
  assert.deepEqual([gearMain(g), gearOff(g), gearArmor(g)], [TOOLS.golden.sword, GOLD_INGOT, 0b1011]);
});

test('trueque: la tabla de la 26.3 (sin el ghast seco, que llega con el ghast feliz)', () => {
  assert.equal(BARTER.reduce((s, e) => s + e.weight, 0), 459);
  assert.equal(BARTER.length, 18);
  const ids = new Set(BARTER.map((e) => e.id));
  for (const id of [FIRE_CHARGE, SPECTRAL_ARROW, ARMOR.iron.boots]) assert.ok(ids.has(id), ITEMS[id].key);
  // Muchas tiradas: las cantidades dentro de su rango y las frecuencias cerca de sus pesos.
  let s = 7;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const counts = new Map<number, number>();
  for (let i = 0; i < 20000; i++) {
    const [e, n] = rollBarter(rand);
    assert.ok(n >= e.min && n <= e.max);
    counts.set(e.weight, (counts.get(e.weight) ?? 0) + 1);
  }
  const f40 = (counts.get(40) ?? 0) / 20000;
  assert.ok(Math.abs(f40 - (40 * 9) / 459) < 0.02, `los de peso 40: ${f40}`);
});

test('piglins: lo que adoran, lo que les calma y lo que les espanta', () => {
  for (const k of ['gold_ingot', 'gold_block', 'golden_apple', 'golden_helmet', 'raw_gold', 'clock', 'bell', 'nether_gold_ore', 'gilded_blackstone']) {
    const it = ITEMS.find((i) => i?.key === k);
    assert.ok(it && isPiglinLoved(it.id), k);
  }
  assert.ok(!isPiglinLoved(GOLD_NUGGET), 'las pepitas no las admiran (las guardan)');
  assert.ok(isBarterCurrency(GOLD_INGOT) && !isBarterCurrency(ITEMS.find((i) => i?.key === 'gold_block')!.id));
  assert.ok(isGoldArmor(ARMOR.golden.boots) && !isGoldArmor(ARMOR.iron.boots));
  assert.ok(isGuardedByPiglins(GOLD_BLOCK) && isGuardedByPiglins(CHEST) && !isGuardedByPiglins(STONE));
  assert.ok(isPiglinRepellentBlock(SOUL_TORCH) && isPiglinRepellentBlock(SOUL_FIRE) && !isPiglinRepellentBlock(WARPED_FUNGUS));
  // La cabeza de piglin engaña a piglins y brutos; el cráneo wither, a nadie.
  assert.ok(skullDisguises(SKULLS.piglin, MOB_PIGLIN) && skullDisguises(SKULLS.piglin, MOB_PIGLIN_BRUTE));
  assert.ok(!skullDisguises(SKULLS.wither_skeleton, MOB_WITHER_SKELETON));
});

test('aparición: lo que sale en cada bioma del Nether (NetherBiomes de la 26.3)', () => {
  const w = (b: string) => NETHER_SPAWNS[b].monsters.map((e) => [MOBS[e[0]].key, e[1], e[2], e[3]]);
  assert.deepEqual(w('nether_wastes'), [['ghast', 50, 4, 4], ['zombified_piglin', 100, 4, 4], ['magma_cube', 2, 4, 4], ['enderman', 1, 4, 4], ['piglin', 15, 4, 4]]);
  assert.deepEqual(w('crimson_forest'), [['zombified_piglin', 1, 2, 4], ['hoglin', 9, 3, 4], ['piglin', 5, 3, 4]]);
  assert.deepEqual(w('basalt_deltas'), [['ghast', 40, 1, 1], ['magma_cube', 100, 2, 5]]);
  assert.deepEqual(w('soul_sand_valley'), [['skeleton', 20, 5, 5], ['ghast', 50, 4, 4], ['enderman', 1, 4, 4]]);
  assert.deepEqual(w('warped_forest'), [['enderman', 1, 4, 4]]);
  for (const b of Object.keys(NETHER_SPAWNS)) assert.deepEqual(NETHER_SPAWNS[b].creatures.map((e) => [MOBS[e[0]].key, e[1], e[2], e[3]]), [['strider', 60, 1, 2]], b);
  assert.deepEqual(NETHER_SPAWNS.soul_sand_valley.costs?.[MOB_GHAST], [0.7, 0.15]);
});

test('objetos de la 8.3: recetas, cabezas, velocidad de alma y disco', () => {
  assert.equal(matchRecipe([FISHING_ROD, 0, 0, WARPED_FUNGUS], 2)?.out.id, WARPED_FUNGUS_ON_A_STICK);
  assert.deepEqual(matchRecipe([GUNPOWDER, BLAZE_POWDER, COAL, 0], 2)?.out, { id: FIRE_CHARGE, count: 3 });
  const G = GLOWSTONE_DUST;
  assert.deepEqual(matchRecipe([0, G, 0, G, ARROW, G, 0, G, 0], 3)?.out, { id: SPECTRAL_ARROW, count: 2 });
  assert.equal(ITEMS[WARPED_FUNGUS_ON_A_STICK].tool?.durability, 100);
  assert.deepEqual(ALL_SKULL_KINDS.slice(4, 6), ['wither_skeleton', 'piglin']); // (la 8.6 añade la de dragón detrás)
  assert.equal(ITEMS[SKULLS.wither_skeleton].name, 'Cráneo de esqueleto wither');
  assert.equal(BLOCKS[SKULLS.piglin].key, 'piglin_head');
  assert.equal(ENCHANTS[SOUL_SPEED].max, 3);
  assert.ok(ENCHANTS[SOUL_SPEED].treasure && ENCHANTS[SOUL_SPEED].special);
  assert.equal(MUSIC_DISCS[14], MUSIC_DISC_TEARS); // Fase 8.4: detrás va Pigstep
  assert.ok(isNetherMob(MOB_STRIDER) && !isNetherMob(ENT_LARGE_FIREBALL));
});

// ------------------------------------------------------------------ servidor

test('servidor: el piglin coge el lingote, lo admira y lanza el trueque', () => {
  const h = makeServer(8301, undefined, DIM_NETHER);
  const W = h.gs.world;
  arena(W, 8, 100, 8, 8);
  const c = h.join('Comerciante', 'c');
  c.pos(12.5, 100, 8.5);
  const E = h.gs.entities;
  const p = E.spawnMob(MOB_PIGLIN, 8.5, 100, 8.5)!;
  p.gear = packGear(TOOLS.golden.sword, 0, 0);
  const r = E.interact(p, GOLD_INGOT, false, 'comerciante');
  assert.ok(r.ok && r.take === 1, 'coge el lingote');
  assert.equal(gearOff(p.gear), GOLD_INGOT, 'en la mano izquierda');
  assert.ok(!E.interact(p, GOLD_INGOT, false, 'comerciante').ok, 'mientras lo admira, no coge otro');
  const before = [...E.list.values()].filter((e) => e.type === ENT_ITEM).length;
  h.tick(100);
  assert.equal(gearOff(p.gear), GOLD_INGOT, 'aún lo admira (119 ticks)');
  h.tick(30);
  assert.equal(gearOff(p.gear), 0, 'se lo ha quedado');
  const items = [...E.list.values()].filter((e) => e.type === ENT_ITEM);
  assert.ok(items.length > before, 'lanza algo del trueque');
  assert.ok(BARTER.some((b) => b.id === items[items.length - 1].stack!.id || ITEMS[items[items.length - 1].stack!.id]?.key === 'enchanted_book'));
});

test('servidor: el piglin zombificado es neutral, pero si le hieren avisan a los suyos', () => {
  const h = makeServer(8302, undefined, DIM_NETHER);
  const W = h.gs.world;
  arena(W, 8, 100, 8, 10);
  const c = h.join('Agresor');
  c.pos(8.5, 100, 8.5);
  const E = h.gs.entities;
  const a = E.spawnMob(MOB_ZOMBIFIED_PIGLIN, 12.5, 100, 8.5)!;
  const b = E.spawnMob(MOB_ZOMBIFIED_PIGLIN, 14.5, 100, 12.5)!;
  h.tick(40);
  const nether = E.mobs.nether;
  assert.equal(nether.state(a).target, null, 'no ataca sin motivo');
  E.damage(a, 1, 8, 8, c.welcome.id);
  assert.equal(nether.state(a).target, c.welcome.id, 'se enfada con quien le hiere');
  assert.equal(nether.state(b).target, c.welcome.id, 'y avisa al otro');
});

test('servidor: fuera del Nether, piglins y hoglins se convierten a los 300 ticks', () => {
  const h = makeServer(8303);
  const W = h.gs.world;
  arena(W, 8, 150, 8, 8);
  h.join('Testigo', 'c').pos(8.5, 150, 8.5);
  const E = h.gs.entities;
  const p = E.spawnMob(MOB_PIGLIN, 6.5, 150, 6.5)!;
  p.gear = packGear(TOOLS.golden.sword, 0, 0);
  E.mobs.nether.piglins.pstate(p).hunted = 5000; // que no se ponga a cazar al hoglin
  const hog = E.spawnMob(MOB_HOGLIN, 10.5, 150, 10.5)!;
  h.tick(290);
  assert.ok(E.list.has(p.id) && E.list.has(hog.id), 'aún no');
  h.tick(20);
  assert.ok(!E.list.has(p.id) && !E.list.has(hog.id), 'ya no están');
  const z = mobsOf(h, MOB_ZOMBIFIED_PIGLIN);
  assert.equal(z.length, 1, 'ahora es un piglin zombificado');
  assert.equal(gearMain(z[0].gear), TOOLS.golden.sword, 'con su espada');
  assert.ok(E.effects.has(z[0], 25), 'y con náuseas');
  assert.equal(mobsOf(h, MOB_ZOGLIN).length, 1, 'y el hoglin, un zoglin');
});

test('servidor: en el Nether no se convierten', () => {
  const h = makeServer(8304, undefined, DIM_NETHER);
  arena(h.gs.world, 8, 100, 8, 8);
  h.join('Testigo', 'c').pos(8.5, 100, 8.5);
  const p = h.gs.entities.spawnMob(MOB_PIGLIN, 6.5, 100, 6.5)!;
  h.tick(400);
  assert.ok(h.gs.entities.list.has(p.id) && p.type === MOB_PIGLIN && !p.dead, 'sigue siendo un piglin');
});

test('servidor: el cubo de magma se divide en dos a cuatro de la mitad de tamaño', () => {
  const h = makeServer(8305, undefined, DIM_NETHER);
  arena(h.gs.world, 8, 100, 8, 8);
  h.join('Mirón', 'c').pos(8.5, 100, 8.5);
  const E = h.gs.entities;
  const big = E.spawnMob(MOB_MAGMA_CUBE, 8.5, 100, 8.5)!;
  E.damage(big, 100, 0, 0, 'Mirón');
  const mids = mobsOf(h, MOB_MAGMA_CUBE_MEDIUM);
  assert.ok(mids.length >= 2 && mids.length <= 4, `medianos: ${mids.length}`);
  E.damage(mids[0], 100, 0, 0, 'Mirón');
  const smalls = mobsOf(h, MOB_MAGMA_CUBE_SMALL);
  assert.ok(smalls.length >= 2 && smalls.length <= 4, `pequeños: ${smalls.length}`);
  // La armadura: 12 puntos al grande (7 de daño se quedan en algo menos).
  assert.ok(E.mobs.nether.absorb(big, 7) < 7);
});

test('servidor: el ghast dispara al jugador y su bola de fuego, devuelta, lo mata (y suelta Tears)', () => {
  const h = makeServer(8306, undefined, DIM_NETHER);
  const W = h.gs.world;
  arena(W, 8, 60, 8, 24, 30);
  const c = h.join('Tenista');
  c.pos(8.5, 60, 8.5);
  const E = h.gs.entities;
  const ghast = E.spawnMob(MOB_GHAST, 8.5, 62, 24.5)!;
  let fb: Entity | undefined;
  for (let i = 0; i < 400 && !fb; i++) {
    h.tick(1);
    ghast.x = 8.5;
    ghast.z = 24.5;
    ghast.y = 62;
    fb = [...E.list.values()].find((e) => e.type === ENT_LARGE_FIREBALL);
  }
  assert.ok(fb, 'dispara una bola de fuego');
  // El jugador la golpea mirando al ghast: vuelve hacia él y lo mata.
  E.mobs.nether.flyers.deflect(fb!, c.welcome.id, Math.atan2(-(ghast.x - fb!.x), -(ghast.z - fb!.z)), 0);
  fb!.y = ghast.y + 1.5;
  for (let i = 0; i < 80 && E.list.has(ghast.id) && !ghast.dead; i++) h.tick(1);
  assert.ok(ghast.dead || !E.list.has(ghast.id), 'el ghast muere');
  assert.ok([...E.list.values()].some((e) => e.type === ENT_ITEM && e.stack?.id === MUSIC_DISC_TEARS), 'suelta el disco Tears');
});

test('servidor: el strider camina sobre la lava (medio bloque hundido) y fuera tiene frío', () => {
  const h = makeServer(8307, undefined, DIM_NETHER);
  const W = h.gs.world;
  arena(W, 8, 80, 8, 8);
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) W.setBlock(8 + dx, 79, 8 + dz, LAVA);
  h.join('Mirón', 'c').pos(14.5, 80, 14.5);
  const E = h.gs.entities;
  const s = E.spawnMob(MOB_STRIDER, 8.5, 80, 8.5)!;
  h.tick(40);
  assert.ok(Math.abs(s.y - 79.5) < 0.25, `sobre la lava: y = ${s.y}`);
  assert.ok(!E.mobs.nether.beasts.bstate(s).cold, 'en la lava no tiene frío');
  const cold = E.spawnMob(MOB_STRIDER, 14.5, 80, 3.5)!;
  h.tick(5);
  assert.ok(E.mobs.nether.beasts.bstate(cold).cold, 'en la piedra, frío');
});

test('servidor: el strider que cae sobre lava honda se posa a media altura, no flota ni salta al pasear', () => {
  const h = makeServer(8399, undefined, DIM_NETHER);
  const W = h.gs.world;
  arena(W, 0, 80, 0, 20, 10);
  for (let dx = -20; dx <= 20; dx++) for (let dz = -20; dz <= 20; dz++) for (let y = 70; y < 80; y++) W.setBlock(dx, y, dz, LAVA);
  h.join('Mirón', 'c').pos(0.5, 88, -18.5);
  const E = h.gs.entities;
  // Encima de la lava que tiene debajo: antes «llegaba» a ella cada tick sin moverse y se quedaba en el aire.
  const s = E.spawnMob(MOB_STRIDER, 0.5, 81, 0.5)!;
  h.tick(60);
  assert.ok(Math.abs(s.y - 79.5) < 1e-6, `posado en la lava: y = ${s.y}`);
  let lo = 99, hi = 0;
  for (let i = 0; i < 1200; i++) {
    h.tick(1);
    if (Math.max(Math.abs(s.x), Math.abs(s.z)) < 18) {
      lo = Math.min(lo, s.y);
      hi = Math.max(hi, s.y);
    }
  }
  assert.ok(lo > 79.49 && hi < 79.51, `a media altura mientras pasea: y de ${lo} a ${hi}`);
});

test('servidor: el esqueleto wither ataca a los piglins y les da Marchitamiento', () => {
  const h = makeServer(8308, undefined, DIM_NETHER);
  arena(h.gs.world, 8, 100, 8, 10);
  h.join('Mirón', 'c').pos(2.5, 100, 2.5);
  const E = h.gs.entities;
  const w = E.spawnMob(MOB_WITHER_SKELETON, 8.5, 100, 8.5)!;
  E.mobs.nether.finalizeSpawn(w, 'natural');
  assert.equal(gearMain(w.gear), TOOLS.stone.sword, 'con espada de piedra');
  const p = E.spawnMob(MOB_PIGLIN, 11.5, 100, 8.5)!;
  let hit = false;
  for (let i = 0; i < 300 && !hit; i++) {
    h.tick(1);
    hit = E.effects.has(p, EFFECT_WITHER);
  }
  assert.ok(hit, 'el piglin se marchita');
});

test('servidor: el hoglin embiste al jugador y lo lanza por los aires', () => {
  const h = makeServer(8309, undefined, DIM_NETHER);
  arena(h.gs.world, 8, 100, 8, 8);
  const c = h.join('Torero');
  c.pos(8.5, 100, 8.5);
  const E = h.gs.entities;
  E.spawnMob(MOB_HOGLIN, 10.5, 100, 8.5);
  let hurt = false;
  for (let i = 0; i < 200 && !hurt; i++) {
    h.tick(1);
    hurt = c.conn.take('hurt').length > 0;
  }
  assert.ok(hurt, 'le hace daño');
});

test('servidor: en el Nether salen criaturas solas', () => {
  const h = makeServer(8310, undefined, DIM_NETHER);
  const W = h.gs.world;
  for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) W.ensureChunk(cx, cz);
  const c = h.join('Explorador', 'c');
  c.pos(8.5, 64, 8.5);
  h.tick(1200);
  const nether = [...h.gs.entities.list.values()].filter((e) => e.ai && isNetherMob(e.type));
  assert.ok(nether.length > 0, `criaturas del Nether: ${nether.length}`);
});

void NETHERRACK;
