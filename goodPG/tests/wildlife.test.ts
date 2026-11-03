// Fase 6 (fauna): abejas (nidos, polen, miel, enfado y picadura), pandas, loros y armadillos, más los
// arreglos del lote anterior (oso polar sin mancha negra, sonidos de los animales, botín del conejo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, GRASS, OAK_LOG, BIRCH_LOG, OAK_PLANKS, POPPY, GLASS, CAMPFIRE, BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK,
  HONEY_MAX, isBeeHome, honeyLevel, withHoney, beeHomeFacing, stateOf, familyBase, INVENTORY_ORDER, BLOCKS,
} from '../src/shared/blocks';
import {
  ITEMS, GLASS_BOTTLE, HONEY_BOTTLE, HONEYCOMB, RAW_RABBIT, COOKED_RABBIT, RABBIT_HIDE, ARMADILLO_SCUTE, BRUSH, SHEARS, LEATHER,
  FEATHER, STICK, COPPER_INGOT, SUGAR, CREATIVE_ITEMS, isValidItem, itemSpriteIndex,
} from '../src/shared/items';
import { matchRecipe, CRAFT_REMAINDER } from '../src/shared/recipes';
import { planPlacement } from '../src/shared/placement';
import {
  MOBS, MOB_TYPES, MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO, MOB_RABBIT, MOB_POLAR_BEAR, ENT_ITEM, boxFaces,
} from '../src/shared/mobs';
import { EF_ANGRY } from '../src/shared/protocol';
import { EF_FAUNA_A, EF_FAUNA_B, parrotVariant, PARROT_COLORS } from '../src/shared/fauna';
import { TEXTURE_NAMES } from '../src/shared/textureDefs';
import { TerrainGenerator, BIOME_MEADOW, BIOME_JUNGLE, BIOME_SAVANNA, BIOME_BADLANDS, BIOME_PLAINS } from '../src/shared/world/terrain';
import { blockIndex, MIN_Y, MAX_Y } from '../src/shared/constants';
import { DIR_X, DIR_Z } from '../src/shared/blockModels';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import { BEE_GENERATORS } from '../src/client/textures/genBees';
import { FAUNA_SPRITES } from '../src/client/textures/faunaSprites';
import { beeState, beesInside, addBeesToHome } from '../src/shared/sim/entities/bees';
import { faunaPassiveFor } from '../src/shared/sim/entities/wildlife';
import type { Entity } from '../src/shared/sim/entities';
import { makeServer, type Client, type Harness } from './harness';

const NEW: [number, number, string, string][] = [
  [MOB_BEE, 50, 'bee', 'Abeja'],
  [MOB_PANDA, 51, 'panda', 'Panda'],
  [MOB_PARROT, 52, 'parrot', 'Loro'],
  [MOB_ARMADILLO, 53, 'armadillo', 'Armadillo'],
];

test('fauna: ids reservados, nombres en español y registro', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d && d.id === id && d.key === key && d.name === name, key);
    assert.equal(d.hostile, false);
    assert.ok(MOB_TYPES.includes(id));
  }
  assert.ok(MOBS[MOB_BEE].flying && MOBS[MOB_PARROT].flying, 'abejas y loros vuelan');
  assert.ok(MOBS[MOB_BEE].neutral && MOBS[MOB_PANDA].neutral, 'abejas y pandas se defienden');
  assert.ok(MOBS[MOB_PARROT].drops.some(([id]) => id === FEATHER), 'los loros sueltan plumas');
});

test('fauna: modelos dentro del atlas, sin UV solapadas, y texturas completas (con variantes)', () => {
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
    const variants = id === MOB_PARROT ? PARROT_COLORS : id === MOB_BEE ? 4 : 1;
    for (let v = 0; v < variants; v++) {
      const tex = generateMobTexture(id, v);
      assert.equal(tex.width, W);
      assert.equal(tex.height, H);
      for (const p of d.parts) {
        const [w, h, dd] = p.size;
        for (const [u, vv, fw, fh] of boxFaces(p.uv[0], p.uv[1], w, h, dd)) {
          for (let y = vv; y < vv + fh; y++) {
            for (let x = u; x < u + fw; x++) assert.equal(tex.rgba[(y * W + x) * 4 + 3], 255, `${key}/${v}.${p.name}: téxel sin pintar en ${x},${y}`);
          }
        }
      }
    }
  }
  // Los cinco loros son de colores distintos (mismo téxel del cuerpo).
  const [bu, bv] = boxFaces(0, 0, 3, 6, 3)[4];
  const colors = new Set<string>();
  for (let v = 0; v < PARROT_COLORS; v++) {
    const t = generateMobTexture(MOB_PARROT, v);
    const o = ((bv + 2) * t.width + bu + 1) * 4;
    colors.add(`${t.rgba[o] >> 4},${t.rgba[o + 1] >> 4},${t.rgba[o + 2] >> 4}`);
  }
  assert.equal(colors.size, PARROT_COLORS, 'cinco colores de loro');
  const seen = new Set<number>();
  for (let id = 1; id < 400; id++) seen.add(parrotVariant(id));
  assert.equal(seen.size, PARROT_COLORS, 'aparecen todos los colores');
});

test('oso polar: sin partes negras (la planta de las patas ya no es casi negra)', () => {
  const d = MOBS[MOB_POLAR_BEAR];
  const tex = generateMobTexture(MOB_POLAR_BEAR);
  let dark = 0;
  for (const p of d.parts) {
    const [w, h, dd] = p.size;
    boxFaces(p.uv[0], p.uv[1], w, h, dd).forEach(([u, v, fw, fh], f) => {
      for (let y = v; y < v + fh; y++) {
        for (let x = u; x < u + fw; x++) {
          const o = (y * tex.width + x) * 4;
          const l = 0.2126 * tex.rgba[o] + 0.7152 * tex.rgba[o + 1] + 0.0722 * tex.rgba[o + 2];
          // Sólo los ojos (cara delantera de la cabeza) y la nariz pueden ser oscuros.
          const face = (p.name === 'head' || p.name === 'snout') && f === 4;
          if (l < 80 && !face) dark++;
        }
      }
    });
  }
  assert.equal(dark, 0, 'téxeles negros fuera de ojos y nariz');
});

test('botín del conejo, objetos nuevos, fundición y recetas', () => {
  const r = MOBS[MOB_RABBIT].drops.map(([id]) => id);
  assert.ok(r.includes(RAW_RABBIT) && r.includes(RABBIT_HIDE), 'el conejo suelta carne y piel');
  for (const id of [GLASS_BOTTLE, HONEY_BOTTLE, HONEYCOMB, RAW_RABBIT, COOKED_RABBIT, RABBIT_HIDE, ARMADILLO_SCUTE, BRUSH]) {
    assert.ok(isValidItem(id) && itemSpriteIndex(id) >= 0, `objeto con dibujo: ${ITEMS[id].key}`);
    assert.ok(FAUNA_SPRITES[ITEMS[id].sprite!], `sprite propio: ${ITEMS[id].key}`);
    assert.ok(CREATIVE_ITEMS.includes(id), `en el inventario creativo: ${ITEMS[id].key}`);
    assert.ok(/^[A-ZÁÉÍÓÚÑ]/.test(ITEMS[id].name), `nombre en español: ${ITEMS[id].name}`);
  }
  assert.equal(ITEMS[RAW_RABBIT].smelt, COOKED_RABBIT, 'el conejo crudo se cocina en el horno');
  assert.ok(ITEMS[COOKED_RABBIT].food!.hunger > ITEMS[RAW_RABBIT].food!.hunger);
  assert.ok(ITEMS[HONEY_BOTTLE].food?.always, 'la miel se bebe sin hambre');
  assert.equal(ITEMS[BRUSH].tool?.durability, 64);
  const P = OAK_PLANKS, C = HONEYCOMB;
  assert.equal(matchRecipe([P, P, P, C, C, C, P, P, P], 3)?.out.id, BEEHIVE, 'colmena');
  assert.deepEqual(matchRecipe([GLASS, 0, GLASS, 0, GLASS, 0, 0, 0, 0], 3)?.out, { id: GLASS_BOTTLE, count: 3 }, 'frascos');
  assert.equal(matchRecipe([FEATHER, 0, 0, COPPER_INGOT, 0, 0, STICK, 0, 0], 3)?.out.id, BRUSH, 'cepillo');
  assert.equal(matchRecipe([RABBIT_HIDE, RABBIT_HIDE, RABBIT_HIDE, RABBIT_HIDE], 2)?.out.id, LEATHER, 'cuero con pieles');
  const H = HONEY_BOTTLE;
  assert.equal(matchRecipe([H, H, H, H], 2)?.out.id, HONEY_BLOCK, 'bloque de miel');
  assert.equal(matchRecipe([C, C, C, C], 2)?.out.id, HONEYCOMB_BLOCK, 'bloque de panal');
  assert.deepEqual(matchRecipe([H, 0, 0, 0], 2)?.out, { id: SUGAR, count: 3 }, 'azúcar de la miel');
  assert.equal(CRAFT_REMAINDER[HONEY_BOTTLE], GLASS_BOTTLE, 'la miel devuelve el frasco al fabricar');
});

test('bloques de las abejas: estados de miel, orientación, texturas y colocación', () => {
  for (const b of [BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK]) {
    assert.ok(BLOCKS[b] && isValidItem(b), `bloque y objeto: ${BLOCKS[b]?.key}`);
    assert.ok(INVENTORY_ORDER.includes(b), 'en el inventario creativo');
    for (const t of BLOCKS[b].tex) assert.ok(BEE_GENERATORS[t] && TEXTURE_NAMES.includes(t), `textura ${t}`);
  }
  const full = stateOf(BEE_NEST, { facing: 2, honey: HONEY_MAX });
  assert.ok(isBeeHome(full) && isBeeHome(BEEHIVE + 7) && !isBeeHome(OAK_LOG));
  assert.equal(honeyLevel(full), HONEY_MAX);
  assert.equal(beeHomeFacing(full), 2);
  assert.equal(honeyLevel(withHoney(full, 0)), 0);
  assert.equal(beeHomeFacing(withHoney(full, 0)), 2, 'vaciar no gira el nido');
  assert.notEqual(BLOCKS[full].tex[4], BLOCKS[withHoney(full, 0)].tex[4], 'el frente lleno gotea miel');
  // La colmena se coloca con la entrada hacia el jugador (que mira al norte: entrada al sur).
  const hit = { x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 1, pz: 0.5, id: STONE };
  const get = (x: number, y: number) => (y <= 0 ? STONE : AIR);
  const e = planPlacement(get, hit, BEEHIVE, 0);
  assert.ok(e && familyBase(e[0][3]) === BEEHIVE && beeHomeFacing(e[0][3]) === 2 && honeyLevel(e[0][3]) === 0);
});

test('generación: nidos de abejas colgados de robles y abedules de praderas y llanuras', () => {
  const gen = new TerrainGenerator(12345);
  let nests = 0, bad = 0, checked = 0;
  // Espiral de chunks alrededor del origen; sólo los de pradera o llanura.
  for (let r = 0; r <= 80 && nests < 4 && checked < 600; r++) {
    for (let k = -r; k <= r && nests < 4; k++) {
      const ring = r === 0 ? [[0, 0]] : [[k, -r], [k, r], [-r, k], [r, k]];
      for (const [cx, cz] of ring) {
        const b = gen.biomeAt(cx * 16 + 8, cz * 16 + 8);
        if (b !== BIOME_MEADOW && b !== BIOME_PLAINS) continue;
        checked++;
        const { blocks } = gen.generate(cx, cz);
        for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) for (let y = MIN_Y + 1; y < MAX_Y; y++) {
          const id = blocks[blockIndex(lx, y, lz)];
          if (familyBase(id) !== BEE_NEST) continue;
          nests++;
          assert.equal(honeyLevel(id), 0, 'los nidos nuevos están vacíos');
          // El tronco, detrás de la entrada (si cae dentro del mismo chunk).
          const f = beeHomeFacing(id);
          const tx = lx - DIR_X[f], tz = lz - DIR_Z[f];
          if (tx < 0 || tz < 0 || tx > 15 || tz > 15) continue;
          const behind = blocks[blockIndex(tx, y, tz)];
          if (behind !== OAK_LOG && behind !== BIRCH_LOG) bad++;
        }
      }
    }
  }
  assert.ok(nests > 0, `hay nidos (${checked} chunks de pradera o llanura)`);
  assert.equal(bad, 0, 'todos cuelgan de un tronco con la entrada hacia fuera');
});

// ---------------------------------------------------------------- servidor

/** Plataforma de hierba en el cielo con un nido sobre un tronco, amapolas y un jugador. */
function meadow(): { h: Harness; c: Client; bx: number; by: number; bz: number; nest: [number, number, number] } {
  const h = makeServer(4242);
  const c = h.join('Apicultora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  c.send({ t: 'chat', m: '/time set mediodia' });
  // Sin lluvia durante la prueba.
  (h.gs.entities.host as { raining: () => number }).raining = () => 0;
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -10; dx <= 10; dx++) for (let dz = -10; dz <= 10; dz++) {
    W.setBlock(bx + dx, by - 2, bz + dz, STONE);
    W.setBlock(bx + dx, by - 1, bz + dz, GRASS);
  }
  for (let k = 0; k < 3; k++) W.setBlock(bx, by + k, bz, OAK_LOG);
  const nest: [number, number, number] = [bx, by + 2, bz + 1];
  W.setBlock(nest[0], nest[1], nest[2], stateOf(BEE_NEST, { facing: 2 }));
  for (const [dx, dz] of [[4, 4], [5, 4], [4, 5], [-4, 4], [-4, 5]]) W.setBlock(bx + dx, by, bz + dz, POPPY);
  c.pos(bx + 7, by, bz - 6);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz, nest };
}

const bees = (h: Harness): Entity[] => [...h.gs.entities.list.values()].filter((e) => e.type === MOB_BEE && !e.dead);
const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);

test('abejas: salen del nido, polinizan, vuelven y llenan el nido de miel', () => {
  const { h, nest } = meadow();
  const W = h.gs.world;
  addBeesToHome(h.gs.entities, ...nest, 2);
  h.tick(40);
  const out = bees(h);
  assert.ok(out.length >= 1, 'las abejas salen del nido de día');
  assert.deepEqual(beeState(out[0]).home, nest, 'saben cuál es su casa');
  // Polinizar: en menos de un minuto alguna se carga de néctar.
  let nectar = false;
  for (let i = 0; i < 60 && !nectar; i++) {
    h.tick(20);
    nectar = bees(h).some((e) => beeState(e).nectar);
  }
  assert.ok(nectar, 'una abeja se carga de néctar en las flores');
  assert.ok(bees(h).some((e) => beeState(e).nectar && e.flags & EF_FAUNA_A), 'los clientes ven el polen');
  // Vuelve a casa y el nido gana miel.
  let honey = 0;
  for (let i = 0; i < 60 && honey === 0; i++) {
    h.tick(20);
    honey = honeyLevel(W.getBlock(...nest));
  }
  assert.ok(honey >= 1, 'el néctar llena el nido de miel');
  assert.ok(beesInside(h.gs.entities, ...nest) >= 1, 'la abeja está dentro del nido');
});

test('abejas: los nidos naturales se pueblan solos (tres abejas) cerca de los jugadores', () => {
  const { h, nest } = meadow();
  let n = 0;
  for (let i = 0; i < 240 && n < 3; i++) {
    h.tick(20);
    n = bees(h).filter((e) => beeState(e).home?.join() === nest.join()).length + beesInside(h.gs.entities, ...nest);
  }
  assert.equal(n, 3, 'tres abejas viven en el nido');
});

test('abejas: cosechar con tijeras (panal) o con frasco; sin humo se enfadan, con fogata no', () => {
  const { h, c, bx, by, bz, nest } = meadow();
  const W = h.gs.world;
  const full = withHoney(W.getBlock(...nest), HONEY_MAX);
  // Con una fogata encendida debajo: tranquilas.
  W.setBlock(bx, by, bz + 1, stateOf(CAMPFIRE, { lit: 1 }));
  addBeesToHome(h.gs.entities, ...nest, 1);
  h.tick(60);
  W.setBlock(...nest, full);
  c.pos(bx + 1, by, bz + 3);
  h.tick(2);
  c.send({ t: 'use', x: nest[0], y: nest[1], z: nest[2], yaw: 0, item: SHEARS });
  h.tick(10);
  assert.equal(honeyLevel(W.getBlock(...nest)), 0, 'el nido queda vacío');
  assert.equal(itemsOf(h, HONEYCOMB), 3, 'tres panales');
  assert.ok(bees(h).every((e) => !(e.ai!.angry > 0)), 'con humo no se enfadan');
  // Nido no lleno: no se cosecha.
  c.send({ t: 'use', x: nest[0], y: nest[1], z: nest[2], yaw: 0, item: GLASS_BOTTLE });
  assert.equal(honeyLevel(W.getBlock(...nest)), 0);
  // Sin la fogata, con frasco: se enfadan con el jugador.
  W.setBlock(bx, by, bz + 1, AIR);
  W.setBlock(...nest, full);
  c.send({ t: 'use', x: nest[0], y: nest[1], z: nest[2], yaw: 0, item: GLASS_BOTTLE });
  h.tick(10);
  assert.equal(honeyLevel(W.getBlock(...nest)), 0);
  assert.ok(bees(h).some((e) => e.ai!.angry > 0 && e.ai!.target === c.welcome.id), 'sin humo, las abejas van a por el jugador');
});

test('abejas: romper el nido las enfurece; pican (daño de abeja) y mueren después', () => {
  const { h, c, bx, by, bz, nest } = meadow();
  addBeesToHome(h.gs.entities, ...nest, 3);
  h.tick(30);
  c.pos(bx + 2, by, bz + 3);
  h.tick(2);
  c.send({ t: 'set', x: nest[0], y: nest[1], z: nest[2], b: AIR, tool: 0 });
  h.tick(3);
  const angry = bees(h).filter((e) => (e.ai!.angry > 0 && e.ai!.target === c.welcome.id) || beeState(e).stung);
  assert.equal(angry.length, 3, 'las abejas (también las de dentro) salen furiosas');
  assert.ok(angry.some((e) => e.flags & EF_ANGRY), 'los clientes ven el enfado');
  // El jugador se queda quieto: le pican.
  let stung = false;
  for (let i = 0; i < 40 && !stung; i++) {
    c.pos(bx + 2, by, bz + 3);
    h.tick(5);
    stung = c.conn.take('hurt').some((m: { c: string }) => m.c === 'bee');
  }
  assert.ok(stung, 'la abeja pica (causa «bee»: el cliente pone el veneno)');
  const stinger = bees(h).find((e) => beeState(e).stung);
  assert.ok(stinger, 'la abeja que picó queda marcada');
  const id = stinger!.id;
  h.tick(45 * 20);
  assert.ok(!h.gs.entities.list.has(id) || h.gs.entities.list.get(id)!.dead, 'y muere al poco rato');
});

test('armadillo: se enrosca al recibir un golpe y el cepillo le saca escamas', () => {
  const { h, c, bx, by, bz } = meadow();
  const E = h.gs.entities;
  const a = E.spawnMob(MOB_ARMADILLO, bx + 5, by, bz - 5)!;
  h.tick(10);
  c.pos(bx + 6, by, bz - 5);
  h.tick(2);
  c.send({ t: 'interact', e: a.id, item: BRUSH, q: 1 });
  const res = c.conn.take('ires').pop();
  assert.ok(res?.ok && res.wear === 16, 'cepillar desgasta 16 el cepillo');
  h.tick(5);
  assert.equal(itemsOf(h, ARMADILLO_SCUTE), 1, 'una escama');
  E.damage(a, 1, bx + 7, bz - 5, c.welcome.id);
  h.tick(4);
  assert.ok(a.flags & EF_FAUNA_A, 'enroscado tras el golpe');
  const x0 = a.x, z0 = a.z;
  h.tick(20);
  assert.ok(Math.hypot(a.x - x0, a.z - z0) < 0.6, 'enroscado no huye');
  h.tick(8 * 20);
  assert.ok(!(a.flags & EF_FAUNA_A), 'al rato se desenrosca');
});

test('panda y loro: se sientan, se tumban o ruedan; vuelan y se posan', () => {
  const { h, bx, by, bz } = meadow();
  const E = h.gs.entities;
  const panda = E.spawnMob(MOB_PANDA, bx - 5, by, bz - 5)!;
  const parrot = E.spawnMob(MOB_PARROT, bx + 5, by + 3, bz - 5)!;
  let pandaState = 0, perched = false, flewHigh = false;
  for (let i = 0; i < 90 * 4; i++) {
    h.tick(5);
    pandaState |= panda.flags & (EF_FAUNA_A | EF_FAUNA_B);
    if (parrot.flags & EF_FAUNA_A) perched = true;
    if (parrot.y > by + 1.5 && !(parrot.flags & EF_FAUNA_A)) flewHigh = true;
  }
  assert.ok(pandaState !== 0, 'el panda cambia de postura (sentado, tumbado o rodando)');
  assert.ok(flewHigh, 'el loro vuela');
  assert.ok(perched, 'el loro se posa');
  assert.ok(!panda.dead, 'el panda no se cae de la plataforma rodando');
  assert.ok(!parrot.dead, 'el loro sigue vivo');
});

test('aparición: pandas y loros en la jungla, armadillos en sabanas y tierras baldías', () => {
  let r = 0;
  const seq = [0.1, 0.5, 0.9];
  const rand = () => seq[r++ % seq.length];
  assert.equal(faunaPassiveFor(BIOME_JUNGLE, rand), MOB_PARROT);
  assert.equal(faunaPassiveFor(BIOME_JUNGLE, rand), MOB_PANDA);
  assert.equal(faunaPassiveFor(BIOME_JUNGLE, rand), 0, 'y a veces lo de siempre');
  r = 0;
  assert.equal(faunaPassiveFor(BIOME_SAVANNA, rand), MOB_ARMADILLO);
  r = 1;
  assert.equal(faunaPassiveFor(BIOME_BADLANDS, rand), MOB_ARMADILLO);
  assert.equal(faunaPassiveFor(BIOME_MEADOW, rand), 0);
});

test('sonidos: todos los animales de la fase 6 tienen voz', async () => {
  // Ruta en una variable: el módulo de audio usa tipos del navegador que las pruebas no cargan.
  const path = '../src/client/audio/creatures';
  type Build = (ctx: unknown, noise: unknown, kind: string, ev: string, dest: unknown, now: number) => unknown[];
  const { buildMobSound } = (await import(path)) as { buildMobSound: Build };
  const ctx = fakeAudioContext();
  const buf = { duration: 4 };
  const noise = { white: buf, pink: buf, brown: buf };
  const dest = ctx.createGain();
  for (const kind of ['fox', 'goat', 'polar_bear', 'rabbit', 'wolf', 'bee', 'panda', 'parrot', 'armadillo']) {
    for (const ev of ['idle', 'hurt', 'death']) assert.ok(buildMobSound(ctx, noise, kind, ev, dest, 0).length > 0, `${kind}: sonido de ${ev}`);
    const flyer = kind === 'bee' || kind === 'parrot';
    assert.equal(buildMobSound(ctx, noise, kind, 'step', dest, 0).length > 0, !flyer, `${kind}: pasos`);
  }
});

/** AudioContext de mentira: nodos que aceptan todo lo que les piden los sintetizadores. */
function fakeAudioContext(): { createGain: () => unknown } {
  const param = () => ({
    value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
    setTargetAtTime() {},
  });
  const node = (): Record<string, unknown> => ({
    frequency: param(), gain: param(), Q: param(), detune: param(), playbackRate: param(), type: '', buffer: null, loop: false,
    connect: (to: unknown) => to, disconnect() {}, start() {}, stop() {}, addEventListener() {},
  });
  return { currentTime: 0, sampleRate: 48000, createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node } as {
    createGain: () => unknown;
  };
}
