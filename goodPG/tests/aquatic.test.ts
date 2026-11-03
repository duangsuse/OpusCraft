// Fase 6: criaturas acuáticas (peces, delfín, tortuga, ajolote, rana, renacuajo y calamar brillante):
// definiciones y texturas, aparición por bioma, peces que se ahogan fuera del agua, cubos con pez,
// pez globo venenoso, huevos de tortuga que eclosionan, renacuajos que crecen y ajolotes que cazan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOBS, MOB_TYPES, MOB_COD, MOB_SALMON, MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN, MOB_TURTLE, MOB_AXOLOTL, MOB_FROG,
  MOB_TADPOLE, MOB_GLOW_SQUID, boxFaces, isWaterAmbient,
} from '../src/shared/mobs';
import {
  ITEMS, WATER_BUCKET, COD_BUCKET, SALMON_BUCKET, TROPICAL_FISH_BUCKET, PUFFERFISH_BUCKET, AXOLOTL_BUCKET, TADPOLE_BUCKET,
  COD, isValidItem, itemSpriteIndex,
} from '../src/shared/items';
import { AIR, STONE, GLASS, SAND, WATER, ICE, GRASS, DIRT, CLAY, TURTLE_EGG, isTurtleEgg, turtleEggBlock, turtleEggState, BLOCK_FLUID } from '../src/shared/blocks';
import {
  BIOME_WARM_OCEAN, BIOME_OCEAN, BIOME_FROZEN_OCEAN, BIOME_COLD_OCEAN, BIOME_BEACH, BIOME_SWAMP, BIOME_PLAINS,
} from '../src/shared/world/biomeIds';
import { EFFECT_POISON } from '../src/shared/effects';
import { EF_ACTION } from '../src/shared/protocol';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { generateItemSprites } from '../src/client/textures/itemSprites';
import type { Entity } from '../src/shared/sim/entities';
import { makeServer, type Client, type Harness } from './harness';

const NEW: [number, number, string, string][] = [
  [MOB_COD, 30, 'cod', 'Bacalao'],
  [MOB_SALMON, 31, 'salmon', 'Salmón'],
  [MOB_TROPICAL_FISH, 32, 'tropical_fish', 'Pez tropical'],
  [MOB_PUFFERFISH, 33, 'pufferfish', 'Pez globo'],
  [MOB_DOLPHIN, 34, 'dolphin', 'Delfín'],
  [MOB_TURTLE, 35, 'turtle', 'Tortuga'],
  [MOB_AXOLOTL, 36, 'axolotl', 'Ajolote'],
  [MOB_FROG, 37, 'frog', 'Rana'],
  [MOB_TADPOLE, 38, 'tadpole', 'Renacuajo'],
  [MOB_GLOW_SQUID, 39, 'glow_squid', 'Calamar brillante'],
];
const BUCKETS = [COD_BUCKET, SALMON_BUCKET, TROPICAL_FISH_BUCKET, PUFFERFISH_BUCKET, AXOLOTL_BUCKET, TADPOLE_BUCKET];

test('criaturas acuáticas: ids 30–39, nombres, modelos, texturas y cubos', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d && d.id === id && d.key === key && d.name === name, key);
    assert.equal(d.hostile, false);
    assert.ok(MOB_TYPES.includes(id));
    // Modelo: padres antes que hijos, cajas dentro del atlas y UV sin solaparse.
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
        assert.ok(!(a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]), `${key}: UV solapadas`);
      }
    }
    // Textura: todas las caras pintadas (opacas o emisivas) y sin marcador magenta.
    const tex = generateMobTexture(id);
    assert.equal(tex.rgba.length, W * H * 4);
    let glow = 0;
    for (const p of d.parts) {
      const [w, h, dd] = p.size;
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
        for (let y = v; y < v + fh; y++) {
          for (let x = u; x < u + fw; x++) {
            const o = (y * W + x) * 4;
            assert.ok(tex.rgba[o + 3] === 255 || tex.rgba[o + 3] === 200, `${key}.${p.name}: téxel sin pintar`);
            if (tex.rgba[o + 3] === 200) glow++;
            assert.ok(!(tex.rgba[o] === 255 && tex.rgba[o + 1] === 0 && tex.rgba[o + 2] === 255), `${key}: magenta`);
          }
        }
      }
    }
    if (id === MOB_GLOW_SQUID) assert.ok(glow > 20, 'el calamar brillante tiene manchas luminosas');
  }
  // Cubos con criatura: objetos con dibujo propio que no se apilan.
  const sprites = generateItemSprites();
  for (const id of BUCKETS) {
    assert.ok(isValidItem(id) && ITEMS[id].stack === 1, ITEMS[id]?.key);
    const k = itemSpriteIndex(id);
    assert.ok(k >= 0, `sprite de ${ITEMS[id].key}`);
    const base = k * 16 * 16 * 4;
    let opaque = 0;
    for (let i = 0; i < 256; i++) if (sprites.rgba[base + i * 4 + 3] === 255) opaque++;
    assert.ok(opaque > 60, `${ITEMS[id].key} dibujado`);
  }
  // Huevo de tortuga: 1–4 huevos y 3 grados de agrietado.
  assert.deepEqual(turtleEggState(turtleEggBlock(3, 2)), { eggs: 3, hatch: 2 });
  assert.equal(turtleEggBlock(1, 0), TURTLE_EGG);
  assert.ok(isTurtleEgg(TURTLE_EGG + 11) && !isTurtleEgg(TURTLE_EGG + 12));
  assert.ok(isValidItem(TURTLE_EGG), 'el huevo de tortuga es un objeto');
});

/** Plataforma de piedra a y = 149 lejos del terreno, con una charca de cristal llena de agua. */
function setup(seed = 4242): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Pescadora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 3, by = 150, bz = Math.floor(sz) + 3;
  const W = h.gs.world;
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) W.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx, by, bz);
  h.tick(2);
  clearMobs(h);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

/** Charca de agua de (2r+1)² × `depth` con paredes de cristal; el agua empieza en y. */
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

function clearMobs(h: Harness): void {
  for (const e of [...h.gs.entities.list.values()]) if (e.ai) h.gs.entities.list.delete(e.id);
}

const alive = (h: Harness, e: Entity) => h.gs.entities.list.has(e.id) && !e.dead;
const mobsOf = (h: Harness, type: number) => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);

test('aparición por bioma: cada agua y cada orilla tiene sus criaturas', () => {
  const h = makeServer(12345);
  const aq = h.gs.entities.aquatic;
  const W = h.gs.world;
  // Tabla pura: qué sale en el agua de cada bioma.
  const kinds = (biome: number) => new Set(Array.from({ length: 40 }, (_, i) => aq.waterMobFor(biome, i / 40)).filter(Boolean));
  assert.deepEqual([...kinds(BIOME_WARM_OCEAN)].sort(), [MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN].sort());
  assert.deepEqual([...kinds(BIOME_OCEAN)].sort(), [MOB_COD, MOB_DOLPHIN].sort());
  assert.deepEqual([...kinds(BIOME_COLD_OCEAN)].sort(), [MOB_COD, MOB_SALMON].sort());
  assert.deepEqual([...kinds(BIOME_FROZEN_OCEAN)], [MOB_SALMON], 'en los océanos helados, salmones (y ningún delfín)');
  assert.deepEqual([...kinds(BIOME_SWAMP)], [MOB_TADPOLE]);
  assert.deepEqual([...kinds(BIOME_PLAINS)], [MOB_SALMON], 'en los ríos, salmones');

  /** Primera columna del mundo real con ese bioma cuya superficie cumple `ok`. */
  const find = (biome: number, ok: (x: number, top: number, z: number) => boolean): [number, number] | null => {
    for (let r = 0; r < 1500; r += 12) {
      const n = Math.max(1, Math.floor(r / 6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        if (W.gen.columnInfo(x, z).biome !== biome) continue;
        W.ensureChunk(Math.floor(x / 16), Math.floor(z / 16), h.clock.now);
        if (ok(x, W.skyTop(x, z), z)) return [x, z];
      }
    }
    return null;
  };
  const isWater = (id: number) => id > 0 && BLOCK_FLUID[id] === 1;
  // (Los océanos helados tienen hielo encima.)
  const deepWater = (x: number, top: number, z: number) =>
    (isWater(W.getBlock(x, top, z)) || W.getBlock(x, top, z) === ICE) && isWater(W.getBlock(x, top - 1, z)) && isWater(W.getBlock(x, top - 5, z));
  const shore = (floors: number[]) => (x: number, top: number, z: number) => {
    if (!floors.includes(W.getBlock(x, top, z))) return false;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) if (isWater(W.getBlock(x + dx, top, z + dz))) return true;
    return false;
  };
  const trySpawn = (x: number, z: number): Set<number> => {
    const seen = new Set<number>();
    for (let i = 0; i < 60; i++) {
      clearMobs(h);
      aq.spawnColumn(x, z);
      for (const e of h.gs.entities.list.values()) if (e.ai) seen.add(e.type);
    }
    clearMobs(h);
    return seen;
  };
  const cases: [string, number, (x: number, top: number, z: number) => boolean, number[]][] = [
    ['océano cálido', BIOME_WARM_OCEAN, deepWater, [MOB_TROPICAL_FISH, MOB_PUFFERFISH, MOB_DOLPHIN]],
    ['océano', BIOME_OCEAN, deepWater, [MOB_COD, MOB_DOLPHIN]],
    ['océano helado', BIOME_FROZEN_OCEAN, deepWater, [MOB_SALMON]],
    ['playa', BIOME_BEACH, shore([SAND]), [MOB_TURTLE, MOB_COD]],
    ['pantano', BIOME_SWAMP, shore([GRASS, DIRT, CLAY]), [MOB_FROG, MOB_TADPOLE]],
  ];
  for (const [label, biome, ok, allowed] of cases) {
    const at = find(biome, ok);
    assert.ok(at, `hay ${label} cerca del origen`);
    const seen = trySpawn(at![0], at![1]);
    assert.ok(seen.size > 0, `aparece algo en ${label}`);
    for (const t of seen) assert.ok(allowed.includes(t), `${label}: no debería aparecer ${MOBS[t].name}`);
  }
  // En tierra firme (sin agua cerca) no aparece nada acuático.
  const dry = find(BIOME_PLAINS, (x, top, z) => W.getBlock(x, top, z) === GRASS && !shore([GRASS])(x, top, z));
  assert.ok(dry);
  assert.equal(trySpawn(dry![0], dry![1]).size, 0, 'nada en una pradera seca');
});

test('peces: nadan en el agua, se ahogan fuera y caben en un cubo', () => {
  const { h, c, bx, by, bz } = setup();
  const E = h.gs.entities;
  pool(h, bx + 4, by, bz, 2, 3);
  const swimmer = E.spawnMob(MOB_COD, bx + 4.5, by + 1, bz + 0.5)!;
  const dry = E.spawnMob(MOB_SALMON, bx - 4.5, by, bz - 4.5)!;
  let flopped = false;
  for (let i = 0; i < 25 * 20; i++) {
    h.tick(1);
    if (alive(h, dry) && dry.flags & EF_ACTION) flopped = true;
  }
  assert.ok(flopped, 'fuera del agua boquea (se tumba y da coletazos)');
  assert.ok(!alive(h, dry), 'el salmón fuera del agua se ahoga');
  assert.ok(alive(h, swimmer), 'el bacalao en el agua sigue vivo');
  assert.ok(swimmer.inWater && swimmer.y >= by - 0.01 && swimmer.y < by + 3, 'y sigue dentro de la charca');
  assert.equal(swimmer.health, swimmer.maxHealth);

  // Cubo de agua sobre el bacalao: se mete en el cubo.
  c.pos(bx + 2, by, bz);
  c.send({ t: 'interact', e: swimmer.id, item: WATER_BUCKET, q: 1 });
  const r = c.conn.take('ires').pop();
  assert.ok(r?.ok && r.take === 1 && r.give?.id === COD_BUCKET, 'cubo con bacalao');
  assert.ok(!E.list.has(swimmer.id), 'el pez ya no está en el agua');
  // Con otros objetos o sobre otras criaturas, nada.
  const turtle = E.spawnMob(MOB_TURTLE, bx - 2.5, by, bz + 2.5)!;
  c.send({ t: 'interact', e: turtle.id, item: WATER_BUCKET, q: 2 });
  assert.equal(c.conn.take('ires').pop()?.ok, false, 'las tortugas no caben en un cubo');

  // Vaciar el cubo: sale agua y el bacalao.
  const [x, y, z] = [bx - 6, by, bz - 6];
  c.pos(x + 1.5, y, z + 1.5);
  c.send({ t: 'set', x, y, z, b: WATER, tool: COD_BUCKET });
  assert.equal(h.gs.world.getBlock(x, y, z), WATER);
  const out = mobsOf(h, MOB_COD).find((e) => Math.hypot(e.x - (x + 0.5), e.z - (z + 0.5)) < 1);
  assert.ok(out, 'del cubo sale un bacalao');
  assert.ok(!E.aquatic.despawns(out!), 'y no desaparece al alejarse (viene de un cubo)');

  // Muerto, suelta su comida.
  const cod2 = E.spawnMob(MOB_COD, bx + 4.5, by + 1, bz + 1.5)!;
  E.damage(cod2, 100, cod2.x, cod2.z, null);
  h.tick(2);
  assert.ok([...E.list.values()].some((e) => e.stack?.id === COD), 'el bacalao suelta bacalao crudo');

  // Los peces no se guardan con el mundo; tortugas y ranas sí.
  E.spawnMob(MOB_FROG, bx - 1.5, by, bz - 1.5);
  const saved = JSON.parse(E.serializePassive()) as number[][];
  assert.ok(saved.some((m) => m[0] === MOB_TURTLE) && saved.some((m) => m[0] === MOB_FROG));
  assert.ok(!saved.some((m) => isWaterAmbient(m[0])), 'los peces no se guardan');
});

test('pez globo: se hincha y envenena a quien lo toca', () => {
  const { h, c, bx, by, bz } = setup();
  const E = h.gs.entities;
  pool(h, bx, by, bz + 5, 2, 3);
  const puffer = E.spawnMob(MOB_PUFFERFISH, bx + 0.5, by + 1, bz + 5.5)!;
  let poisoned = false, stung = false;
  for (let i = 0; i < 60 && !(poisoned && stung); i++) {
    c.pos(puffer.x, puffer.y, puffer.z);
    h.tick(2);
    poisoned ||= c.conn.take('effect').some((m) => m.id === EFFECT_POISON && m.s > 0);
    stung ||= c.conn.take('hurt').some((m) => m.c === 'pufferfish');
  }
  assert.ok(E.aquatic.stateOf(puffer).puff > 0, 'se hincha con el jugador al lado');
  assert.ok(stung && poisoned, 'pincha y envenena');
});

test('tortugas: ponen huevos en su playa y de ellos nacen crías', () => {
  const { h, bx, by, bz } = setup();
  const E = h.gs.entities;
  const W = h.gs.world;
  const nature = h.gs.sys.nature;
  // (La arena cae si no tiene nada debajo: piedra bajo la playa.)
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      W.setBlock(bx - 5 + dx, by - 2, bz - 5 + dz, STONE);
      W.setBlock(bx - 5 + dx, by - 1, bz - 5 + dz, SAND);
    }
  }

  // Una tortuga adulta en su playa, con ganas de poner.
  const t = E.spawnMob(MOB_TURTLE, bx - 4.5, by, bz - 4.5)!;
  E.aquatic.setHome(t, bx - 5, by, bz - 5);
  E.aquatic.stateOf(t).lay = 0;
  let nest: [number, number, number] | null = null;
  for (let i = 0; i < 100 && !nest; i++) {
    h.tick(1);
    for (let dx = -4; dx <= 4 && !nest; dx++) {
      for (let dz = -4; dz <= 4; dz++) if (isTurtleEgg(W.getBlock(bx - 5 + dx, by, bz - 5 + dz))) nest = [bx - 5 + dx, by, bz - 5 + dz];
    }
  }
  assert.ok(nest, 'la tortuga pone huevos en la arena');
  assert.ok(E.aquatic.stateOf(t).lay > 60, 'y espera un buen rato para la siguiente puesta');

  // Huevos que se agrietan y eclosionan (dos huevos → dos crías).
  const [ex, ey, ez] = [bx - 3, by, bz - 7];
  W.setBlock(ex, ey, ez, turtleEggBlock(2, 0));
  const stages = new Set<number>();
  for (let i = 0; i < 5000 && isTurtleEgg(W.getBlock(ex, ey, ez)); i++) {
    stages.add(turtleEggState(W.getBlock(ex, ey, ez)).hatch);
    nature.randomTickAt(ex, ey, ez);
  }
  assert.equal(W.getBlock(ex, ey, ez), AIR, 'los huevos eclosionan');
  assert.deepEqual([...stages].sort(), [0, 1, 2], 'pasando por los tres grados de agrietado');
  const babies = mobsOf(h, MOB_TURTLE).filter((e) => (e.growAge ?? 0) > 0 && Math.hypot(e.x - ex - 0.5, e.z - ez - 0.5) < 1.5);
  assert.equal(babies.length, 2, 'nacen dos crías');
  // Fuera de la arena no eclosionan.
  W.setBlock(ex + 8, ey - 1, ez, STONE);
  W.setBlock(ex + 8, ey, ez, TURTLE_EGG);
  for (let i = 0; i < 500; i++) nature.randomTickAt(ex + 8, ey, ez);
  assert.equal(W.getBlock(ex + 8, ey, ez), TURTLE_EGG, 'sobre piedra no se agrietan');
});

test('ranas que saltan, renacuajos que crecen y ajolotes que cazan', () => {
  const { h, bx, by, bz } = setup();
  const E = h.gs.entities;
  // La rana salta.
  const frog = E.spawnMob(MOB_FROG, bx - 5.5, by, bz + 5.5)!;
  let top = frog.y;
  for (let i = 0; i < 200; i++) {
    h.tick(1);
    top = Math.max(top, frog.y);
  }
  assert.ok(top > by + 0.6, `la rana salta (${(top - by).toFixed(2)})`);

  // El renacuajo se hace rana.
  pool(h, bx + 5, by, bz - 5, 1, 2);
  const tad = E.spawnMob(MOB_TADPOLE, bx + 5.5, by + 0.5, bz - 4.5)!;
  h.tick(20);
  assert.ok(alive(h, tad), 'el renacuajo vive en el agua');
  E.aquatic.stateOf(tad).grow = 0.1;
  h.tick(5);
  assert.ok(!E.list.has(tad.id), 'el renacuajo ya no está');
  assert.ok(mobsOf(h, MOB_FROG).some((f) => Math.hypot(f.x - tad.x, f.z - tad.z) < 1.5), 'en su lugar hay una rana');

  // El ajolote caza al pez de su charca.
  pool(h, bx, by, bz + 6, 2, 2);
  const axo = E.spawnMob(MOB_AXOLOTL, bx - 0.5, by + 0.5, bz + 5.5)!;
  const cod = E.spawnMob(MOB_COD, bx + 1.5, by + 0.5, bz + 7.5)!;
  let i = 0;
  for (; i < 90 * 20 && alive(h, cod); i++) h.tick(1);
  assert.ok(!alive(h, cod), 'el ajolote se come al bacalao');
  assert.ok(alive(h, axo), 'y sigue vivo en el agua');
  void i;
});
