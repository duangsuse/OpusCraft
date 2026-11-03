// Fase 7.5 (abismo): el Deep Dark. Registro (bloques, objetos, recetas, sigilo rápido, botín), vibraciones y
// sensores (potencia por distancia, frecuencia, lana, agachado, fases, sensor calibrado, resonancia),
// chilladores y avisos que invocan al warden, catalizadores que extienden el sculk, el warden (enfado,
// persecución, golpe, estampido sónico, Oscuridad y hundirse), la brújula de recuperación, el bioma y la
// ciudad antigua, y el rendimiento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, COBBLESTONE, WHITE_WOOL, AMETHYST_BLOCK, LEVER, REDSTONE_BLOCK, SCULK, SCULK_VEIN, SCULK_CATALYST, SCULK_SENSOR,
  CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER, REINFORCED_DEEPSLATE, SOUL_SAND, SOUL_SOIL, SOUL_TORCH, SOUL_LANTERN, SOUL_FIRE,
  sensorPhase, shriekerProps, shriekerFor, stateOf, stateProps, familyBase, veinFaces, isSculkVein, PHASE_ACTIVE, PHASE_COOLDOWN,
  PHASE_INACTIVE, MOUNT_FLOOR, BLOCKS, isCatalyst, WOOL,
} from '../src/shared/blocks';
import {
  ITEMS, CREATIVE_ITEMS, ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5, COMPASS, AMETHYST_SHARD, COAL, STICK,
  IRON_NUGGET, BOOK, ENCHANTED_BOOK, TOOLS, SPAWN_EGGS, itemSpriteIndex,
} from '../src/shared/items';
import { MOBS, MOB_WARDEN, MOB_ZOMBIE, wardenPose, POSE_EMERGING, POSE_DIGGING } from '../src/shared/mobs';
import { matchRecipe } from '../src/shared/recipes';
import { SWIFT_SNEAK, ENCHANTS, SILK_TOUCH, storedOf, enchantByName } from '../src/shared/enchantments';
import { TABLE_POOL, LOOT_POOL } from '../src/shared/enchanting';
import { sneakSpeedFactor } from '../src/shared/enchantEffects';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { blockDrops } from '../src/shared/sim/drops';
import { enchantedBlockDrops } from '../src/shared/sim/enchantDrops';
import { blastResistance } from '../src/shared/explosions';
import { sensorPower, vibrationFrequency, vibrationOccluded, packDelta, unpackDelta } from '../src/shared/vibrations';
import { blockEvent } from '../src/shared/sim/server/vibrations';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { isDeepDark, deepDarkColumn } from '../src/shared/world/deepDark';
import { locateStructure } from '../src/shared/world/structures';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { EFFECT_DARKNESS } from '../src/shared/effects';
import { STATE_SNEAK } from '../src/shared/protocol';
import { mulberry32 } from '../src/shared/world/noise';
import { makeServer, type Harness, type Client } from './harness';

const craft = (grid: number[]) => matchRecipe(grid, 3)?.out.id;

/** Servidor con un solar de piedra despejado en y = 160 y una jugadora en supervivencia. */
interface Lab {
  h: Harness;
  c: Client;
  bx: number;
  by: number;
  bz: number;
  set: (x: number, y: number, z: number, id: number) => void;
  get: (x: number, y: number, z: number) => number;
  /** La jugadora pone un bloque de piedra rocosa sobre el suelo en (x, by, z). */
  place: (x: number, z: number) => void;
}

function lab(mode: 's' | 'c' = 's', seed = 4242): Lab {
  const h = makeServer(seed);
  const c = h.join('Espeleóloga', mode);
  const [sx, , sz] = c.welcome.spawn as [number, number, number];
  const bx = Math.floor(sx), by = 160, bz = Math.floor(sz);
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(60);
  const W = h.gs.world;
  for (let dx = -30; dx <= 30; dx++) {
    for (let dz = -30; dz <= 30; dz++) {
      W.setBlock(bx + dx, by - 1, bz + dz, STONE);
      for (let y = by; y < by + 8; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
    }
  }
  h.tick(2);
  return {
    h, c, bx, by, bz, set: (x, y, z, id) => void W.setBlock(x, y, z, id), get: (x, y, z) => W.getBlock(x, y, z),
    place: (x, z) => c.send({ t: 'place', x, y: by - 1, z, n: [0, 1, 0], p: [x + 0.5, by, z + 0.5], item: COBBLESTONE, yaw: 0 }),
  };
}

const hitOn = (x: number, y: number, z: number, nx: number, ny: number, nz: number, id: number): PlaceHit =>
  ({ x, y, z, nx, ny, nz, px: x + 0.5 + nx * 0.5, py: y + 0.5 + ny * 0.5, pz: z + 0.5 + nz * 0.5, id });

// ------------------------------------------------------------------ registro

test('registro: bloques, objetos, recetas, texturas y sigilo rápido', () => {
  for (const id of [SCULK, SCULK_VEIN, SCULK_CATALYST, SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER, REINFORCED_DEEPSLATE, SOUL_SAND, SOUL_SOIL, SOUL_TORCH, SOUL_LANTERN]) {
    assert.ok(ITEMS[id], `objeto de ${BLOCKS[id].key}`);
  }
  assert.equal(ITEMS[SOUL_FIRE], undefined, 'el fuego de alma no es un objeto');
  for (const id of [ECHO_SHARD, RECOVERY_COMPASS, DISC_FRAGMENT_5, MUSIC_DISC_5, SPAWN_EGGS.warden]) {
    assert.ok(CREATIVE_ITEMS.includes(id), `en el creativo: ${ITEMS[id].key}`);
    assert.ok(itemSpriteIndex(id) >= 0, `sprite de ${ITEMS[id].key}`);
  }
  assert.equal(ITEMS[SPAWN_EGGS.warden].name, 'Huevo generador de warden');
  for (const t of ['sculk', 'sculk_vein', 'sculk_sensor_tendril_active', 'sculk_shrieker_can_summon_inner_top', 'reinforced_deepslate_side', 'soul_fire']) {
    assert.ok(TEXTURE_DEFS.some((d) => d.name === t), t);
  }
  // Recetas de Minecraft.
  const A = AMETHYST_SHARD, E = ECHO_SHARD, F = DISC_FRAGMENT_5, N = IRON_NUGGET;
  assert.equal(craft([0, A, 0, A, SCULK_SENSOR, A, 0, 0, 0]), CALIBRATED_SCULK_SENSOR);
  assert.equal(craft([E, E, E, E, COMPASS, E, E, E, E]), RECOVERY_COMPASS);
  assert.equal(craft([F, F, F, F, F, F, F, F, F]), MUSIC_DISC_5);
  assert.equal(craft([COAL, 0, 0, STICK, 0, 0, SOUL_SAND, 0, 0]), SOUL_TORCH);
  assert.equal(matchRecipe([COAL, 0, 0, STICK, 0, 0, SOUL_SOIL, 0, 0], 3)?.out.count, 4);
  assert.equal(craft([N, N, N, N, SOUL_TORCH, N, N, N, N]), SOUL_LANTERN);
  // Sigilo rápido: grebas, nivel III, sólo en las ciudades antiguas (ni mesa, ni botín al azar, ni comercio).
  const ss = ENCHANTS[SWIFT_SNEAK];
  assert.equal(SWIFT_SNEAK, 38);
  assert.equal(enchantByName('sigilo_rapido')?.id, SWIFT_SNEAK);
  assert.deepEqual([ss.max, ss.treasure, ss.supported], [3, true, 'legs']);
  assert.ok(!TABLE_POOL.includes(SWIFT_SNEAK) && !LOOT_POOL.includes(SWIFT_SNEAK));
  assert.deepEqual([1, 2, 3].map((l) => Math.round(sneakSpeedFactor(l) * 100) / 100), [0.45, 0.6, 0.75]);
  assert.equal(sneakSpeedFactor(0), 0.3);
  // El warden: 500 de vida, 30 de daño, 5 de experiencia y suelta un catalizador.
  const w = MOBS[MOB_WARDEN];
  assert.deepEqual([w.key, w.health, w.damage, w.xp, w.width, w.height], ['warden', 500, 30, 5, 0.9, 2.9]);
  assert.deepEqual(w.drops, [[SCULK_CATALYST, 1, 1]]);
});

test('sculk: sólo se recoge con Toque de seda (si no, experiencia); pizarra reforzada; colocación', () => {
  const hoe = TOOLS.diamond.hoe;
  for (const id of [SCULK, SCULK_CATALYST, SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, shriekerFor(true), SCULK_VEIN + 8]) {
    assert.deepEqual(blockDrops(id, hoe), [], `${BLOCKS[id].key} sin Toque de seda`);
    const silk = enchantedBlockDrops(id, hoe, [[SILK_TOUCH, 1]]);
    assert.equal(silk.length, 1, `${BLOCKS[id].key} con Toque de seda`);
    assert.equal(familyBase(silk[0].id), familyBase(id));
  }
  // El chillador recogido ya no invoca.
  assert.equal(shriekerProps(enchantedBlockDrops(shriekerFor(true), hoe, [[SILK_TOUCH, 1]])[0].id).canSummon, false);
  assert.deepEqual(blockDrops(REINFORCED_DEEPSLATE, TOOLS.diamond.pickaxe), []);
  assert.equal(blastResistance(REINFORCED_DEEPSLATE), 1200);
  assert.equal(BLOCKS[REINFORCED_DEEPSLATE].hardness, 55);
  // Colocar: sensores anegados en el agua, calibrado con la entrada lejos del jugador, venas en la cara tocada.
  const grid = new Map<string, number>();
  const get = (x: number, y: number, z: number) => grid.get(`${x},${y},${z}`) ?? (y < 0 ? STONE : AIR);
  const sensor = planPlacement(get, hitOn(0, -1, 0, 0, 1, 0, STONE), SCULK_SENSOR, 0)!;
  assert.equal(sensor[0][3], stateOf(SCULK_SENSOR, { phase: 0, water: 0 }));
  const cal = planPlacement(get, hitOn(0, -1, 0, 0, 1, 0, STONE), CALIBRATED_SCULK_SENSOR, 0)!;
  assert.equal(stateProps(cal[0][3])!.facing, 0, 'mirando al norte, la entrada queda al norte');
  const vein = planPlacement(get, hitOn(0, -1, 0, 0, 1, 0, STONE), SCULK_VEIN, 0)!;
  assert.equal(veinFaces(vein[0][3]), 8, 'vena en el suelo (cara −Y)');
  assert.equal(stateProps(planPlacement(get, hitOn(0, -1, 0, 0, 1, 0, STONE), SCULK_SHRIEKER, 0)![0][3])!.can_summon, 0);
});

test('vibraciones: tabla de frecuencias, potencia por distancia, lana y sucesos de bloques', () => {
  assert.equal(vibrationFrequency('step'), 1);
  assert.equal(vibrationFrequency('block_place'), 13);
  assert.equal(vibrationFrequency('block_destroy'), 12);
  assert.equal(vibrationFrequency('explode'), 15);
  assert.equal(vibrationFrequency('resonate', 7), 7);
  assert.deepEqual([0, 1, 4, 7.9, 8].map((d) => sensorPower(d, 8)), [15, 14, 8, 1, 1]);
  assert.equal(sensorPower(8, 16), 8);
  const wool = (x: number, y: number, z: number) => (x === 2 && y === 0 && z === 0 ? WHITE_WOOL : AIR);
  assert.ok(vibrationOccluded(wool, 0.5, 0.5, 0.5, 4.5, 0.5, 0.5));
  assert.ok(!vibrationOccluded(wool, 0.5, 0.5, 2.5, 4.5, 0.5, 2.5));
  assert.equal(blockEvent(AIR, STONE, true), 'block_place');
  assert.equal(blockEvent(STONE, AIR, true), 'block_destroy');
  assert.equal(blockEvent(STONE, AIR, false), null, 'lo que cambia solo no vibra');
  const lever = stateOf(LEVER, { mount: MOUNT_FLOOR, facing: 0, powered: 0 });
  assert.equal(blockEvent(lever, stateOf(LEVER, { mount: MOUNT_FLOOR, facing: 0, powered: 1 }), false), 'block_activate');
  const d = unpackDelta(packDelta(3.5, -2, 10));
  assert.deepEqual(d, [3.5, -2, 10]);
});

test('sensor de sculk: se activa con la distancia, da potencia y frecuencia, se enfría y la lana lo tapa', () => {
  const L = lab();
  const { h, bx, by, bz } = L;
  const sx = bx + 3, sz = bz;
  // (Los del Deep Dark que haya generado el mundo bajo tierra también escuchan: se cuenta sólo el nuevo.)
  const before = h.gs.sys.deepDark.vibrations.listenerCount;
  L.set(sx, by, sz, SCULK_SENSOR);
  h.tick(2);
  assert.equal(h.gs.sys.deepDark.vibrations.listenerCount, before + 1);
  const powers: number[] = [];
  h.gs.sys.deepDark.vibrations.onSensor = (_x, _y, _z, p) => powers.push(p);
  // Colocar un bloque a 4 bloques: potencia 8, frecuencia 13 (lo lee el comparador).
  L.place(bx - 1, bz);
  h.tick(3);
  assert.equal(sensorPhase(L.get(sx, by, sz)), PHASE_INACTIVE, 'la vibración aún viaja (1 bloque por tick)');
  h.tick(3);
  assert.equal(sensorPhase(L.get(sx, by, sz)), PHASE_ACTIVE);
  assert.deepEqual(powers, [8]);
  assert.equal(h.gs.sys.redstone.power(sx + 1, by, sz), 8, 'potencia al lado');
  assert.equal(h.gs.sys.redstone.analog(sx, by, sz), 13, 'el comparador lee la frecuencia');
  // 30 ticks activo y 10 enfriándose (sin potencia).
  h.tick(30);
  assert.equal(sensorPhase(L.get(sx, by, sz)), PHASE_COOLDOWN);
  assert.equal(h.gs.sys.redstone.power(sx + 1, by, sz), 0);
  h.tick(10);
  assert.equal(sensorPhase(L.get(sx, by, sz)), PHASE_INACTIVE);
  // Con lana en medio no llega.
  for (let y = by; y < by + 4; y++) for (let dz = -3; dz <= 3; dz++) L.set(bx + 1, y, bz + dz, WHITE_WOOL);
  h.tick(2);
  L.place(bx - 1, bz + 1);
  h.tick(15);
  assert.equal(sensorPhase(L.get(sx, by, sz)), PHASE_INACTIVE, 'la lana ocluye');
  assert.equal(powers.length, 1);
});

test('sensor de sculk: los pasos vibran, agachado no; colocar lana tampoco', () => {
  const L = lab();
  const { h, c, bx, by, bz } = L;
  L.set(bx + 4, by, bz + 4, SCULK_SENSOR);
  h.tick(2);
  let hits = 0;
  h.gs.sys.deepDark.vibrations.onSensor = () => hits++;
  // Andando agachada no suena.
  for (let i = 0; i <= 30; i++) {
    c.pos(bx + 0.5 + i * 0.2, by, bz + 0.5, STATE_SNEAK);
    h.tick(1);
  }
  h.tick(20);
  assert.equal(hits, 0, 'agachada');
  // De pie, sí.
  for (let i = 0; i <= 30; i++) {
    c.pos(bx + 6.5 - i * 0.2, by, bz + 0.5, 0);
    h.tick(1);
  }
  h.tick(20);
  assert.ok(hits >= 1, 'andando');
  // La lana ahoga su propia colocación.
  h.tick(60);
  hits = 0;
  L.c.send({ t: 'place', x: bx + 2, y: by - 1, z: bz + 2, n: [0, 1, 0], p: [bx + 2.5, by, bz + 2.5], item: WOOL.white, yaw: 0 });
  h.tick(20);
  assert.equal(hits, 0, 'lana');
});

test('sensor calibrado: filtra la frecuencia que le llega por la entrada y la amatista resuena', () => {
  const L = lab();
  const { h, bx, by, bz } = L;
  // Calibrado a 10 bloques mirando al este (entrada al este); un bloque de redstone al este le da 15.
  const cx = bx + 10, cz = bz;
  L.set(cx, by, cz, stateOf(CALIBRATED_SCULK_SENSOR, { facing: 1, phase: 0, water: 0 }));
  L.set(cx + 1, by, cz, REDSTONE_BLOCK);
  h.tick(2);
  const heard: number[] = [];
  h.gs.sys.deepDark.vibrations.onSensor = (_x, _y, _z, _p, f) => heard.push(f);
  L.place(bx, bz);
  h.tick(20);
  assert.deepEqual(heard, [], 'sólo atiende la frecuencia 15');
  // Sin la entrada, oye a 16 bloques (más que el normal).
  L.set(cx + 1, by, cz, AIR);
  h.tick(2);
  L.place(bx, bz + 1);
  h.tick(20);
  assert.deepEqual(heard, [13]);
  // Resonancia: un sensor con amatista al lado hace vibrar la amatista con su frecuencia.
  h.tick(60);
  heard.length = 0;
  L.set(bx + 3, by, bz - 4, SCULK_SENSOR);
  L.set(bx + 3, by + 1, bz - 4, AMETHYST_BLOCK);
  h.tick(2);
  L.place(bx + 3, bz - 6);
  h.tick(40);
  assert.ok(heard.length >= 2 && heard.every((f) => f === 13), `resonancia: ${heard}`);
});

// ------------------------------------------------------------------ chilladores y warden

test('chillador: el sensor que activa un jugador lo hace chillar; cuatro avisos invocan al warden', () => {
  const L = lab();
  const { h, bx, by, bz } = L;
  const [kx, kz] = [bx + 5, bz];
  L.set(bx + 3, by, bz, SCULK_SENSOR);
  L.set(kx, by, kz, shriekerFor(true));
  h.tick(2);
  const trackers = h.gs.sys.deepDark.sculk.trackers;
  for (let n = 1; n <= 4; n++) {
    L.place(bx - 1, bz - 2 + n);
    h.tick(10);
    assert.ok(shriekerProps(L.get(kx, by, kz)).shrieking, `chilla (${n})`);
    assert.equal(trackers.get('espeleóloga')!.level, n, `nivel de aviso ${n}`);
    // Oscuridad al terminar de chillar.
    h.tick(100);
    assert.ok(!shriekerProps(L.get(kx, by, kz)).shrieking);
    assert.ok(L.c.conn.take('effect').some((m) => m.id === EFFECT_DARKNESS), 'Oscuridad');
    if (n < 4) h.tick(200); // espera entre avisos
  }
  const wardens = [...h.gs.entities.list.values()].filter((e) => e.type === MOB_WARDEN);
  assert.equal(wardens.length, 1, 'sale un warden');
  assert.equal(wardenPose(wardens[0].flags), POSE_EMERGING, 'saliendo del suelo');
  assert.ok(wardens[0].persist, 'no desaparece por estar lejos');
});

test('chillador puesto por un jugador: chilla pero no avisa; pisarlo lo hace chillar (agachado no)', () => {
  const L = lab();
  const { h, c, bx, by, bz } = L;
  L.set(bx + 2, by, bz, shriekerFor(false));
  h.tick(2);
  c.pos(bx + 2.5, by + 0.5, bz + 0.5, STATE_SNEAK);
  h.tick(5);
  assert.ok(!shriekerProps(L.get(bx + 2, by, bz)).shrieking, 'agachada, no');
  c.pos(bx + 2.5, by + 0.5, bz + 0.5, 0);
  h.tick(5);
  assert.ok(shriekerProps(L.get(bx + 2, by, bz)).shrieking, 'pisado');
  assert.equal(h.gs.sys.deepDark.sculk.trackers.get('espeleóloga')?.level ?? 0, 0, 'sin aviso');
});

test('catalizador: se come la experiencia de lo que muere cerca, florece y extiende el sculk', () => {
  const L = lab();
  const { h, bx, by, bz } = L;
  L.set(bx + 4, by, bz + 4, SCULK_CATALYST);
  h.tick(2);
  const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 2.5, by, bz + 2.5)!;
  z.lastHurtBy = L.c.welcome.id;
  z.lastHurtAt = z.age;
  h.gs.entities.kill(z, true);
  h.tick(1);
  assert.equal([...h.gs.entities.list.values()].filter((e) => e.type === 103).length, 0, 'sin orbes');
  assert.ok(isCatalyst(L.get(bx + 4, by, bz + 4)) && stateProps(L.get(bx + 4, by, bz + 4))!.bloom === 1, 'florece');
  assert.ok(h.gs.sys.deepDark.sculk.activeCursors > 0);
  h.tick(200);
  let sculk = 0, veins = 0;
  for (let dx = -6; dx <= 8; dx++) {
    for (let dz = -6; dz <= 8; dz++) {
      if (L.get(bx + dx, by - 1, bz + dz) === SCULK) sculk++;
      if (isSculkVein(L.get(bx + dx, by, bz + dz))) veins++;
    }
  }
  assert.ok(sculk >= 2, `sculk: ${sculk}`);
  assert.ok(sculk + veins >= 4, `sculk y venas: ${sculk + veins}`);
  assert.equal(stateProps(L.get(bx + 4, by, bz + 4))!.bloom, 0, 'deja de florecer');
});

test('warden: se enfada con las vibraciones y los golpes, persigue, golpea, usa el estampido y da Oscuridad', () => {
  const L = lab();
  const { h, c, bx, by, bz } = L;
  const me = c.welcome.id as string;
  const w = h.gs.entities.spawnMob(MOB_WARDEN, bx + 6.5, by, bz + 0.5)!;
  h.tick(5);
  const ai = h.gs.entities.mobs.warden;
  // Una vibración suya: +35.
  L.place(bx + 1, bz + 1);
  h.tick(12);
  assert.ok(ai.angerAt(w, me) >= 34 && ai.angerAt(w, me) <= 35, 'una vibración: +35 (baja 1 por segundo)');
  // Pegarle: +100 y va a por ella (sin retroceder).
  h.gs.entities.damage(w, 4, bx + 0.5, bz + 0.5, me);
  assert.equal(Math.hypot(w.vx, w.vz), 0, 'no lo empujan');
  assert.ok(ai.angerAt(w, me) >= 130);
  assert.equal(ai.targetOf(w), me);
  let melee = false, boom = false, dark = false;
  for (let i = 0; i < 200 && !melee; i++) {
    c.pos(bx + 0.5, by, bz + 0.5);
    h.tick(1);
    for (const m of c.conn.take('hurt')) if (m.c === 'warden') melee = true;
    for (const m of c.conn.take('effect')) if (m.id === EFFECT_DARKNESS) dark = true;
  }
  assert.ok(melee, 'la alcanza y golpea');
  // Sube a una columna: sin poder alcanzarla, el estampido sónico (atraviesa la armadura).
  for (let y = by; y < by + 5; y++) L.set(bx - 8, y, bz, STONE);
  for (let i = 0; i < 400 && !boom; i++) {
    c.pos(bx - 7.5, by + 5, bz + 0.5);
    ai.onDamaged(w, me); // que no se le pase el enfado
    h.tick(1);
    for (const m of c.conn.take('hurt')) if (m.c === 'sonic_boom') boom = true;
    for (const m of c.conn.take('effect')) if (m.id === EFFECT_DARKNESS) dark = true;
  }
  assert.ok(boom, 'estampido sónico');
  assert.ok(dark, 'Oscuridad');
});

test('warden: sin nada que lo moleste, se hunde en el suelo al minuto y desaparece sin botín', () => {
  const L = lab('c');
  const { h, bx, by, bz } = L;
  const w = h.gs.entities.spawnMob(MOB_WARDEN, bx + 6.5, by, bz + 0.5)!;
  // Que no lo moleste ninguna otra criatura que aparezca de noche.
  for (let t = 0; t < 61; t++) {
    for (const e of [...h.gs.entities.list.values()]) if (e.ai && e.type !== MOB_WARDEN) h.gs.entities.remove(e.id);
    h.tick(20);
  }
  assert.equal(wardenPose(w.flags), POSE_DIGGING, 'hundiéndose');
  h.tick(110);
  assert.ok(!h.gs.entities.list.has(w.id), 'se ha ido');
  assert.ok(![...h.gs.entities.list.values()].some((e) => e.stack?.id === SCULK_CATALYST), 'sin botín');
});

// ------------------------------------------------------------------ brújula, bioma, ciudad y botín

test('brújula de recuperación: el servidor guarda la última muerte y se la manda al volver', () => {
  const L = lab();
  const { h, c, bx, by, bz } = L;
  c.pos(bx + 3.5, by, bz - 2.5);
  h.tick(2);
  c.send({ t: 'died', m: 'cayó' });
  const msg = c.conn.take('death')[0];
  assert.deepEqual(msg.p, [bx + 3, by, bz - 3]);
  assert.deepEqual(h.gs.sys.deepDark.deathOf('Espeleóloga'), [bx + 3, by, bz - 3]);
  h.gs.flush(true);
  const h2 = makeServer(4242, h.store);
  const c2 = h2.join('Espeleóloga', 's');
  assert.deepEqual(c2.conn.take('death')[0]?.p, [bx + 3, by, bz - 3]);
});

test('Deep Dark: bajo las montañas y hondo, cubierto de sculk; la ciudad antigua tiene su botín', () => {
  const gen = new TerrainGenerator(12345);
  const city = locateStructure(gen, 'ancient_city', 0, 0)!;
  assert.ok(city, 'hay una ciudad antigua');
  assert.equal(city[1], -51);
  assert.ok(deepDarkColumn(gen, city[0], city[2]));
  assert.ok(isDeepDark(gen, city[0], -40, city[2]) && !isDeepDark(gen, city[0], 20, city[2]), 'sólo en lo hondo');
  // Sculk en las cuevas del Deep Dark (fuera de la ciudad) y la ciudad con pizarra reforzada y cofres.
  let sculk = 0, reinforced = 0, sensors = 0;
  const tables = new Set<string>();
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      const r = gen.generate(Math.floor(city[0] / 16) + dx, Math.floor(city[2] / 16) + dz);
      for (const b of r.blocks) {
        if (b === SCULK) sculk++;
        else if (b === REINFORCED_DEEPSLATE) reinforced++;
        else if (familyBase(b) === SCULK_SENSOR) sensors++;
      }
      for (const ch of r.chests) tables.add(ch.table);
    }
  }
  assert.ok(sculk > 1000, `sculk: ${sculk}`);
  assert.ok(reinforced > 100, `pizarra reforzada: ${reinforced}`);
  assert.ok(sensors > 5, `sensores: ${sensors}`);
  assert.ok(tables.has('ancient_city'), 'cofres de la ciudad');
  // El botín: fragmentos de eco y del disco, libros de sigilo rápido, sculk, velas…
  const rand = mulberry32(7);
  const seen = new Set<number>();
  let swift = 0;
  for (let i = 0; i < 300; i++) {
    for (const s of rollLoot(LOOT_TABLES.ancient_city, rand)) {
      seen.add(s.id);
      if (s.id === ENCHANTED_BOOK && storedOf(s).some(([e]) => e === SWIFT_SNEAK)) swift++;
    }
  }
  for (const id of [ECHO_SHARD, DISC_FRAGMENT_5, SCULK, SCULK_SENSOR, SCULK_CATALYST, SOUL_TORCH]) assert.ok(seen.has(id), ITEMS[id].key);
  assert.ok(swift > 0, 'libros de sigilo rápido');
  const ice = new Set(rollLoot(LOOT_TABLES.ancient_city_ice_box, rand).map((s) => s.id));
  assert.ok(ice.size > 0);
});

test('rendimiento: sin oyentes emitir no cuesta; 300 sensores con mucho movimiento, deprisa', () => {
  const L = lab();
  const { h, bx, by, bz } = L;
  const v = h.gs.sys.deepDark.vibrations;
  let t0 = performance.now();
  for (let i = 0; i < 100000; i++) v.emit('step', bx + (i % 50), by, bz + ((i * 7) % 50));
  const idle = performance.now() - t0;
  assert.ok(idle < 150, `sin oyentes: ${idle.toFixed(1)} ms`);
  for (let i = 0; i < 300; i++) L.set(bx - 15 + (i % 30), by, bz - 15 + Math.floor(i / 30) * 3, SCULK_SENSOR);
  for (let i = 0; i < 40; i++) h.gs.entities.spawnMob(MOB_ZOMBIE, bx + (i % 10) - 5, by, bz + Math.floor(i / 10) - 2);
  h.tick(5);
  t0 = performance.now();
  h.tick(100);
  const per = (performance.now() - t0) / 100;
  assert.ok(per < 25, `${per.toFixed(2)} ms por tick`);
  assert.ok(v.delivered > 0);
});
