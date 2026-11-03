// Fase 7.5 (océano): monumentos oceánicos, guardianes y guardián anciano, ruinas oceánicas, tesoro
// enterrado y mapas del tesoro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBS, MOB_TYPES, MOB_GUARDIAN, MOB_ELDER_GUARDIAN, MOB_DROWNED, MOB_SQUID, boxFaces, EF_GUARDIAN_MOVING, LASER_CHARGE, LASER_WARMUP,
} from '../src/shared/mobs';
import {
  AIR, STONE, GLASS, WATER, GOLD_BLOCK, WET_SPONGE, SEA_LANTERN, PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE, isChest,
} from '../src/shared/blocks';
import {
  ITEMS, FILLED_MAP, EMPTY_MAP, HEART_OF_THE_SEA, PRISMARINE_SHARD, PRISMARINE_CRYSTALS, COD, SPAWN_EGGS, type ItemStack,
} from '../src/shared/items';
import { EFFECT_MINING_FATIGUE } from '../src/shared/effects';
import { EF_ACTION } from '../src/shared/protocol';
import { mobXp } from '../src/shared/experience';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { locateStructure, STRUCTURE_NAMES } from '../src/shared/world/structures';
import { MONUMENT_Y, MONUMENT_RADIUS } from '../src/shared/world/monument';
import { BIOME_DEEP_OCEAN, BIOME_BEACH, isOceanBiome, baseBiome } from '../src/shared/world/biomeIds';
import { LOOT_TABLES, rollLoot } from '../src/shared/loot';
import { structureMap, structureMapOf, resolveStructureMaps, pendingStructureMap } from '../src/shared/structureMaps';
import { mapKeyAt } from '../src/shared/maps';
import { sanitizeStack } from '../src/shared/containers';
import { stackName } from '../src/shared/potions';
import { STRUCTURE_ALIASES } from '../src/shared/sim/server/commands';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { blockIndex, SEA_LEVEL } from '../src/shared/constants';
import type { Entity } from '../src/shared/sim/entities';
import { makeServer, type Client, type Harness } from './harness';

/** Azar determinista para las tiradas de botín. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return (s & 0xffffff) / 0x1000000;
  };
}

const mobsOf = (h: Harness, type: number) => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);

// ------------------------------------------------------------------ criaturas

test('guardianes: ids 73–74, nombres, modelo con púas, textura, huevos y experiencia', () => {
  assert.equal(MOB_GUARDIAN, 73);
  assert.equal(MOB_ELDER_GUARDIAN, 74);
  for (const [id, key, name, hp] of [[MOB_GUARDIAN, 'guardian', 'Guardián', 30], [MOB_ELDER_GUARDIAN, 'elder_guardian', 'Guardián anciano', 80]] as const) {
    const d = MOBS[id];
    assert.ok(d && d.key === key && d.name === name && d.hostile && d.health === hp, key);
    assert.ok(MOB_TYPES.includes(id));
    assert.equal(d.parts.filter((p) => p.name.startsWith('spike')).length, 12, 'doce púas');
    const [W, H] = d.atlas;
    const names = new Set<string>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${key}: padre antes que ${p.name}`);
      names.add(p.name);
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], p.size[0], p.size[1], p.size[2])) {
        assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${key}.${p.name} dentro del atlas`);
      }
    }
    const tex = generateMobTexture(id);
    assert.equal(tex.rgba.length, W * H * 4);
    const egg = SPAWN_EGGS[key];
    assert.ok(egg && ITEMS[egg].name === `Huevo generador de ${name.toLowerCase()}`, `huevo de ${key}`);
    assert.equal(mobXp(id, false), 10, 'dan 10 de experiencia');
  }
  assert.ok(MOBS[MOB_ELDER_GUARDIAN].width > 1.9 && MOBS[MOB_GUARDIAN].width < 0.9);
});

// ------------------------------------------------------------------ generación

test('monumento: en océano profundo, base bajo el mar, núcleo con 8 bloques de oro, esponjas y 3 guardianes ancianos', () => {
  const gen = new TerrainGenerator(12345);
  const p = locateStructure(gen, 'monument', 0, 0, 20)!;
  assert.ok(p, 'hay un monumento');
  assert.equal(p[1], MONUMENT_Y);
  assert.equal(gen.biomeAt(p[0], p[2]), BIOME_DEEP_OCEAN);
  const counts = new Map<number, number>();
  const mobs: { type: number; x: number; y: number; z: number }[] = [];
  const c0x = Math.floor((p[0] - MONUMENT_RADIUS) / 16), c1x = Math.floor((p[0] + MONUMENT_RADIUS) / 16);
  const c0z = Math.floor((p[2] - MONUMENT_RADIUS) / 16), c1z = Math.floor((p[2] + MONUMENT_RADIUS) / 16);
  let topWater = true;
  for (let cz = c0z; cz <= c1z; cz++) {
    for (let cx = c0x; cx <= c1x; cx++) {
      const r = gen.generate(cx, cz);
      for (const b of r.blocks) counts.set(b, (counts.get(b) ?? 0) + 1);
      mobs.push(...r.mobs);
      // Por encima del monumento sigue habiendo agua hasta la superficie.
      for (let lz = 0; lz < 16; lz += 5) for (let lx = 0; lx < 16; lx += 5) if (r.blocks[blockIndex(lx, SEA_LEVEL - 1, lz)] !== WATER) topWater = false;
    }
  }
  assert.equal(counts.get(GOLD_BLOCK), 8, 'ocho bloques de oro en el núcleo');
  assert.ok((counts.get(WET_SPONGE) ?? 0) >= 10, 'salas de esponjas mojadas');
  assert.ok((counts.get(SEA_LANTERN) ?? 0) > 50, 'faroles marinos');
  for (const b of [PRISMARINE, PRISMARINE_BRICKS, DARK_PRISMARINE]) assert.ok((counts.get(b) ?? 0) > 500, `prismarina ${b}`);
  assert.ok(topWater, 'el monumento no asoma');
  const elders = mobs.filter((m) => m.type === MOB_ELDER_GUARDIAN);
  assert.equal(elders.length, 3, 'tres guardianes ancianos, cada uno en un solo chunk');
  for (const e of elders) assert.ok(Math.abs(e.x - p[0]) <= MONUMENT_RADIUS && Math.abs(e.z - p[2]) <= MONUMENT_RADIUS);
  // Dentro del núcleo, agua alrededor del cubo de oro.
  const at = (x: number, y: number, z: number) => gen.generate(Math.floor(x / 16), Math.floor(z / 16)).blocks[blockIndex(x & 15, y, z & 15)];
  assert.equal(at(p[0] + 4, MONUMENT_Y + 2, p[2] + 4), WATER);
  assert.ok([GOLD_BLOCK, DARK_PRISMARINE].includes(at(p[0], MONUMENT_Y + 3, p[2])));
  assert.equal(STRUCTURE_NAMES.monument, 'Monumento oceánico');
  assert.equal(STRUCTURE_ALIASES.monumento, 'monument');
});

test('ruinas oceánicas en el fondo y tesoro enterrado en la playa', () => {
  const gen = new TerrainGenerator(12345);
  const r = locateStructure(gen, 'ocean_ruins', 0, 0, 30)!;
  assert.ok(r && isOceanBiome(gen.biomeAt(r[0], r[2])));
  assert.ok(r[1] <= SEA_LEVEL - 5, 'en el fondo del mar');
  let ruinChests = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) ruinChests += gen.generate(Math.floor(r[0] / 16) + dx, Math.floor(r[2] / 16) + dz).chests.filter((c) => c.table.startsWith('underwater_ruin')).length;
  }
  assert.ok(ruinChests >= 1, 'con su cofre');
  const t = locateStructure(gen, 'buried_treasure', 0, 0, 60)!;
  assert.ok(t && baseBiome(gen.biomeAt(t[0], t[2])) === BIOME_BEACH, 'el tesoro está en una playa');
  const chunk = gen.generate(Math.floor(t[0] / 16), Math.floor(t[2] / 16));
  const ch = chunk.chests.find((c) => c.table === 'buried_treasure')!;
  assert.ok(ch && ch.x === t[0] && ch.z === t[2] && ch.y === t[1] - 2, 'cofre bajo la arena');
  assert.notEqual(chunk.blocks[blockIndex(ch.x & 15, ch.y + 1, ch.z & 15)], AIR, 'enterrado');
});

// ------------------------------------------------------------------ botín y mapas

test('botín: el tesoro siempre trae el corazón del mar; el camarote, un mapa del tesoro; las ruinas, lo suyo', () => {
  const rand = seeded(7);
  for (let i = 0; i < 40; i++) {
    const t = rollLoot(LOOT_TABLES.buried_treasure, rand);
    assert.equal(t.filter((s) => s.id === HEART_OF_THE_SEA).length, 1, 'un corazón del mar');
    assert.ok(t.length >= 8, 'y mucho más');
    const m = rollLoot(LOOT_TABLES.shipwreck_map, rand);
    assert.ok(m.some((s) => s.id === FILLED_MAP && s.data?.smap?.k === 'buried_treasure'), 'mapa del tesoro');
    assert.equal(m.length, 4);
  }
  let maps = 0;
  for (let i = 0; i < 200; i++) maps += rollLoot(LOOT_TABLES.underwater_ruin_big, rand).filter((s) => s.data?.smap).length;
  assert.ok(maps > 40 && maps < 120, `mapas en las ruinas grandes: ${maps}`);
  for (const k of ['underwater_ruin_small', 'underwater_ruin_big']) {
    for (let i = 0; i < 20; i++) {
      const out = rollLoot(LOOT_TABLES[k], rand);
      assert.ok(out.length >= 3 && out.length <= 9, `${k}: ${out.length}`);
    }
  }
});

test('mapas del tesoro: apuntan al tesoro enterrado más cercano, con su nombre y su marca', () => {
  const gen = new TerrainGenerator(12345);
  const t = locateStructure(gen, 'buried_treasure', 30, 400, 13)!;
  assert.ok(t);
  const map = structureMap('buried_treasure', gen, 30, 400);
  assert.equal(map.id, FILLED_MAP);
  assert.equal(map.dmg, mapKeyAt(t[0], t[2]), 'muestra la zona del tesoro');
  const info = structureMapOf(map)!;
  assert.deepEqual([info.x, info.z, info.def.marker], [t[0], t[2], 'x']);
  assert.equal(stackName(map), 'Mapa del tesoro enterrado');
  // Viaja por la red y se guarda con su objetivo.
  assert.deepEqual(sanitizeStack(JSON.parse(JSON.stringify(map))), map);
  // Los pendientes se resuelven desde la posición del cofre; sin tesoro al alcance, mapa vacío.
  const slots: (ItemStack | null)[] = [null, pendingStructureMap('buried_treasure'), { id: COD, count: 2 }];
  resolveStructureMaps(slots, gen, 30, 400);
  assert.deepEqual(slots[1], map);
  assert.equal(sanitizeStack({ id: FILLED_MAP, count: 1, data: { smap: { k: 'buried_treasure' } } })?.data, undefined, 'sin objetivo no vale');
  const far = structureMap('monument', gen, 0, 0);
  assert.ok(far.id === FILLED_MAP ? structureMapOf(far)?.def.marker === 'monument' : far.id === EMPTY_MAP);
});

test('servidor: los cofres del tesoro y del camarote se llenan (con el mapa ya resuelto)', () => {
  const h = makeServer(12345);
  const W = h.gs.world;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const containers = (h.gs.sys.containers as unknown as { containers: unknown }).containers as Map<number, { slots: (ItemStack | null)[] }>;
  const t = locateStructure(W.gen, 'buried_treasure', 0, 0, 60)!;
  W.ensureChunk(Math.floor(t[0] / 16), Math.floor(t[2] / 16));
  assert.ok(isChest(W.getBlock(t[0], t[1] - 2, t[2])));
  const all = () => [...containers.values()].flatMap((c) => c.slots).filter((s): s is ItemStack => !!s);
  assert.ok(all().some((s) => s.id === HEART_OF_THE_SEA), 'corazón del mar');
  const sw = locateStructure(W.gen, 'shipwreck', 0, 0, 20)!;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) W.ensureChunk(Math.floor(sw[0] / 16) + dx, Math.floor(sw[2] / 16) + dz);
  const maps = all().filter((s) => s.data?.smap);
  assert.ok(maps.length >= 1, 'mapa del tesoro en el naufragio');
  for (const m of maps) assert.ok(structureMapOf(m), 'resuelto');
});

// ------------------------------------------------------------------ servidor: guardianes

function setup(seed = 4242): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Buceadora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  c.pos(bx, by, bz);
  h.tick(2);
  for (const e of [...h.gs.entities.list.values()]) if (e.ai) h.gs.entities.list.delete(e.id);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

/** Piscina de (2r+1)² × depth con paredes de cristal; el agua empieza en y. */
function pool(h: Harness, cx: number, y: number, cz: number, r: number, depth: number): void {
  const W = h.gs.world;
  for (let dx = -r - 1; dx <= r + 1; dx++) {
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      W.setBlock(cx + dx, y - 1, cz + dz, GLASS);
      const wall = Math.abs(dx) > r || Math.abs(dz) > r;
      for (let k = 0; k < depth; k++) W.setBlock(cx + dx, y + k, cz + dz, wall ? GLASS : WATER);
    }
  }
}

test('guardián: se fija, carga el láser (se ve el rayo) y hace el daño de Minecraft', () => {
  const { h, c, bx, by, bz } = setup();
  const E = h.gs.entities;
  pool(h, bx, by, bz, 7, 5);
  const g = E.spawnMob(MOB_GUARDIAN, bx - 4.5, by + 1, bz + 0.5)!;
  const px = bx + 4.5, pz = bz + 0.5;
  let sawBeam = false, laserFx = false;
  const hurts: { a: number; c: string }[] = [];
  for (let i = 0; i < 20 * 6 && hurts.length < 2; i++) {
    c.pos(px, by + 1, pz);
    h.tick(1);
    if (g.flags & EF_ACTION) sawBeam = true;
    laserFx ||= c.conn.take('fx').some((m) => m.k === 'guardian_laser');
    hurts.push(...c.conn.take('hurt'));
  }
  assert.ok(laserFx && sawBeam, 'avisa y se ve el rayo mientras carga');
  assert.deepEqual(hurts.map((m) => [m.c, m.a]), [['guardian_laser', 1], ['guardian', 6]], 'mágico 1 y ataque 6 en normal');
  assert.ok(g.age >= LASER_WARMUP + LASER_CHARGE[MOB_GUARDIAN] - 0.1, 'tras cargar 4 s');
});

test('guardián: sin verlo no dispara', () => {
  const { h, c, bx, by, bz } = setup();
  const E = h.gs.entities;
  pool(h, bx, by, bz, 7, 5);
  for (let y = by; y < by + 5; y++) for (let z = bz - 7; z <= bz + 7; z++) h.gs.world.setBlock(bx, y, z, STONE);
  const g = E.spawnMob(MOB_GUARDIAN, bx - 4.5, by + 1, bz + 0.5)!;
  let hurt = false;
  for (let i = 0; i < 20 * 6; i++) {
    c.pos(bx + 4.5, by + 1, bz + 0.5);
    h.tick(1);
    hurt ||= c.conn.take('hurt').length > 0;
    assert.equal(g.flags & EF_ACTION, 0);
  }
  assert.ok(!hurt, 'la pared lo tapa');
});

test('guardián: con las púas fuera (quieto), quien le pega se pincha; nadando, no', () => {
  const { h, c, bx, by, bz } = setup();
  const E = h.gs.entities;
  pool(h, bx, by, bz, 4, 4);
  const g = E.spawnMob(MOB_GUARDIAN, bx + 0.5, by + 1, bz + 0.5)!;
  c.pos(bx + 2, by + 1, bz + 0.5);
  const ai = E.mobs.guardians;
  ai.state(g).moving = false;
  c.send({ t: 'attack', e: g.id, item: 0 });
  assert.deepEqual(c.conn.take('hurt').map((m) => [m.c, m.a]), [['guardian_thorns', 2]]);
  ai.state(g).moving = true;
  h.clock.now += 1000;
  c.send({ t: 'attack', e: g.id, item: 0 });
  assert.equal(c.conn.take('hurt').length, 0, 'con las púas dentro no pincha');
  // El bit de las púas va a los clientes.
  g.vx = 3;
  h.tick(1);
  assert.ok(g.flags & EF_GUARDIAN_MOVING || !ai.state(g).moving);
});

test('guardián: fuera del agua da saltos pero no se ahoga; ataca también a los calamares', () => {
  const { h, bx, by, bz } = setup();
  const E = h.gs.entities;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) h.gs.world.setBlock(bx + dx, by - 1, bz + dz, STONE);
  const g = E.spawnMob(MOB_GUARDIAN, bx + 0.5, by, bz + 0.5)!;
  let jumped = false;
  for (let i = 0; i < 20 * 5; i++) {
    h.tick(1);
    if (g.y > by + 0.5) jumped = true;
  }
  assert.ok(jumped, 'da coletazos');
  assert.equal(g.health, g.maxHealth, 'no se ahoga');
  // Calamar a la vista en el agua: lo fríe.
  const { h: h2, c: c2, bx: x2, by: y2, bz: z2 } = setup(4343);
  pool(h2, x2, y2, z2, 7, 5);
  c2.pos(x2 + 40, y2 + 1, z2); // el jugador, lejos del alcance del láser
  const g2 = h2.gs.entities.spawnMob(MOB_GUARDIAN, x2 - 4.5, y2 + 1, z2 + 0.5)!;
  const sq = h2.gs.entities.spawnMob(MOB_SQUID, x2 + 4.5, y2 + 2, z2 + 0.5)!;
  sq.persist = true; // a más de 32 bloques del jugador podría desaparecer al azar a mitad de la prueba
  // Elegir presa lleva un rato al azar y el láser carga 4 s: hasta 12 s.
  for (let i = 0; i < 20 * 12 && sq.health === sq.maxHealth; i++) {
    sq.x = x2 + 4.5;
    sq.z = z2 + 0.5;
    h2.tick(1);
  }
  assert.ok(sq.health < sq.maxHealth || sq.dead, 'el calamar recibe el láser');
  void g2;
});

test('guardián anciano: fatiga minera III (5 min) a menos de 50 bloques cada minuto, con su aparición', () => {
  const { h, c, bx, by, bz } = setup();
  pool(h, bx, by, bz, 3, 4);
  const elder = h.gs.entities.spawnMob(MOB_ELDER_GUARDIAN, bx + 0.5, by + 1, bz + 0.5)!;
  elder.persist = true;
  c.pos(bx + 30, by + 1, bz);
  let effect: { id: number; s: number; a: number } | undefined, ghost = false;
  for (let i = 0; i < 62 && !effect; i++) {
    c.pos(bx + 30, by + 1, bz);
    h.tick(20);
    effect ??= c.conn.take('effect').find((m) => m.id === EFFECT_MINING_FATIGUE);
    ghost ||= c.conn.take('fx').some((m) => m.k === 'elder_curse');
  }
  assert.deepEqual(effect && [effect.s, effect.a], [300, 2], 'fatiga minera III durante 5 minutos');
  assert.ok(ghost, 'se ve su cara');
  // Ya maldito: no se repite; lejos o en creativo, nada.
  assert.equal(h.gs.sys.monuments.curse(elder.x, elder.y, elder.z), 0, 'no repite con tiempo de sobra');
  c.pos(bx + 80, by + 1, bz);
  h.tick(1);
  const s = [...(h.gs as unknown as { sessions: Map<unknown, { save: { fx?: [number, number, number][] } | null }> }).sessions.values()][0];
  if (s.save) s.save.fx = [];
  assert.equal(h.gs.sys.monuments.curse(elder.x, elder.y, elder.z), 0, 'a 80 bloques no');
});

test('guardianes ancianos: aparecen con el monumento, no desaparecen y se guardan', () => {
  const h = makeServer(12345);
  const W = h.gs.world;
  const p = locateStructure(W.gen, 'monument', 0, 0, 20)!;
  for (let cz = Math.floor((p[2] - 30) / 16); cz <= Math.floor((p[2] + 30) / 16); cz++) {
    for (let cx = Math.floor((p[0] - 30) / 16); cx <= Math.floor((p[0] + 30) / 16); cx++) W.ensureChunk(cx, cz);
  }
  const elders = mobsOf(h, MOB_ELDER_GUARDIAN);
  assert.equal(elders.length, 3);
  assert.ok(elders.every((e) => e.persist));
  // Un jugador lejos: los monstruos normales desaparecen; los ancianos, no.
  const c = h.join('Lejos');
  c.pos(p[0] + 2000, 120, p[2]);
  const zombie = h.gs.entities.spawnMob(MOBS.findIndex((m) => m?.key === 'zombie'), p[0], 80, p[2])!;
  h.tick(40);
  assert.ok(!h.gs.entities.list.has(zombie.id), 'el zombi lejano desaparece');
  assert.equal(mobsOf(h, MOB_ELDER_GUARDIAN).length, 3, 'los ancianos siguen');
  // Se guardan y vuelven con el mundo (sin generarse otra vez).
  h.gs.flush(true);
  const h2 = makeServer(12345, h.store);
  const back = mobsOf(h2, MOB_ELDER_GUARDIAN);
  assert.equal(back.length, 3);
  assert.ok(back.every((e) => e.persist));
  for (let cz = Math.floor((p[2] - 30) / 16); cz <= Math.floor((p[2] + 30) / 16); cz++) {
    for (let cx = Math.floor((p[0] - 30) / 16); cx <= Math.floor((p[0] + 30) / 16); cx++) h2.gs.world.ensureChunk(cx, cz);
  }
  assert.equal(mobsOf(h2, MOB_ELDER_GUARDIAN).length, 3, 'no se duplican');
  // Las ruinas traen ahogados, también persistentes.
  const r = locateStructure(W.gen, 'ocean_ruins', 0, 0, 30)!;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) h2.gs.world.ensureChunk(Math.floor(r[0] / 16) + dx, Math.floor(r[2] / 16) + dz);
  assert.ok(mobsOf(h2, MOB_DROWNED).every((e) => e.persist));
});

test('guardianes: aparecen en grupos dentro del monumento con un jugador cerca', () => {
  const h = makeServer(12345);
  const p = locateStructure(h.gs.world.gen, 'monument', 0, 0, 20)!;
  const c = h.join('Exploradora');
  let n = 0;
  for (let i = 0; i < 90 && n === 0; i++) {
    c.pos(p[0] + 0.5, MONUMENT_Y + 30, p[2] + 0.5);
    h.tick(20);
    n = mobsOf(h, MOB_GUARDIAN).length;
  }
  assert.ok(n >= 1, 'aparecen guardianes');
  for (const g of mobsOf(h, MOB_GUARDIAN)) {
    assert.ok(Math.abs(g.x - p[0]) <= MONUMENT_RADIUS + 3 && Math.abs(g.z - p[2]) <= MONUMENT_RADIUS + 3, 'dentro del monumento');
  }
});

test('botín de los guardianes: fragmentos, bacalao o cristales; el anciano, una esponja mojada', () => {
  const { h, bx, by, bz } = setup();
  const E = h.gs.entities;
  E.rand = seeded(11);
  const drops = (type: number, n: number) => {
    const got = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      for (const e of [...E.list.values()]) if (!e.ai) E.list.delete(e.id);
      const g: Entity = E.spawnMob(type, bx + 0.5, by + 3, bz + 0.5)!;
      g.lastHurtBy = 'x';
      g.lastHurtAt = g.age;
      E.damage(g, 1000, g.x, g.z, null);
      for (const e of E.list.values()) if (e.stack) got.set(e.stack.id, (got.get(e.stack.id) ?? 0) + e.stack.count);
    }
    return got;
  };
  const g = drops(MOB_GUARDIAN, 40);
  assert.ok((g.get(PRISMARINE_SHARD) ?? 0) > 20, 'fragmentos de prismarina');
  assert.ok((g.get(COD) ?? 0) > 5 && (g.get(PRISMARINE_CRYSTALS) ?? 0) > 3, 'bacalao y cristales');
  assert.equal(g.get(WET_SPONGE) ?? 0, 0);
  const el = drops(MOB_ELDER_GUARDIAN, 10);
  assert.equal(el.get(WET_SPONGE), 10, 'una esponja mojada cada anciano');
});

test('delfines: con pescado crudo llevan al naufragio o a las ruinas más cercanos', () => {
  const h = makeServer(12345);
  const W = h.gs.world;
  const sw = locateStructure(W.gen, 'shipwreck', 0, 0, 20)!;
  const ru = locateStructure(W.gen, 'ocean_ruins', 0, 0, 20)!;
  const E = h.gs.entities;
  const d = E.spawnMob(MOBS.findIndex((m) => m?.key === 'dolphin'), 0.5, 55, 0.5)!;
  assert.equal(E.interact(d, SPAWN_EGGS.pig, false).ok, false);
  const r = E.interact(d, COD, false);
  assert.ok(r.ok && r.take === 1, 'se come el bacalao');
  assert.ok(E.dolphinGuide.guiding(d));
  const head = E.dolphinGuide.heading(d, 0.05)!;
  const near = Math.hypot(sw[0], sw[2]) < Math.hypot(ru[0], ru[2]) ? sw : ru;
  const l = Math.hypot(near[0], near[2]);
  assert.ok(head[0] * (near[0] / l) + head[2] * (near[2] / l) > 0.9, 'nada hacia el más cercano');
});
