// Fase 7.5 (fauna): murciélago, ocelote, champiñaca, llama de comerciante, caballos esqueleto y zombi (con
// la trampa del rayo), cabaña de bruja y fósiles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, TORCH, CAULDRON, CRAFTING_TABLE, SPRUCE_PLANKS, OAK_LOG, POPPY, DANDELION, BONE_BLOCK, BONE_BLOCK_AXIS,
  COAL_ORE, DIAMOND_ORE, DEEPSLATE_ORE, RED_MUSHROOM, BROWN_MUSHROOM, WATER, isFlowerPot, pottedPlant,
} from '../src/shared/blocks';
import {
  ITEMS, SPAWN_EGGS, TNT_MINECART, spawnEggMob, COD, SHEARS, BOWL, BUCKET, MILK_BUCKET, MUSHROOM_STEW, SUSPICIOUS_STEW, SADDLE,
  ARMOR, BONE,
} from '../src/shared/items';
import {
  MOBS, MOB_TYPES, MOB_COW, MOB_CHICKEN, MOB_CREEPER, MOB_SKELETON, MOB_WITCH, MOB_CAT, MOB_LLAMA, MOB_WANDERING_TRADER, ENT_ITEM, boxFaces,
  MOB_BAT, MOB_OCELOT, MOB_MOOSHROOM, MOB_TRADER_LLAMA, MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE,
  EF_BAT_HANGING, EF_BROWN_MOOSHROOM, EF_HORSEMAN, batLightOk, isHalloween, TRAP_HORSE_SECONDS,
} from '../src/shared/mobs';
import { MOUNTS, canMate } from '../src/shared/mounts';
import { EF_TAMED, EF_ANGRY } from '../src/shared/protocol';
import { SUSPICIOUS_FLOWERS, stewEffect } from '../src/shared/decorFood';
import { mobXp } from '../src/shared/experience';
import { isUndead } from '../src/shared/sim/entities/mobEffects';
import { SEA_LEVEL, blockIndex } from '../src/shared/constants';
import { TerrainGenerator } from '../src/shared/world/terrain';
import { locateStructure, STRUCTURE_NAMES } from '../src/shared/world/structures';
import { swampHutSpawnSpot } from '../src/shared/world/swampHut';
import { fossilPieces } from '../src/shared/world/fossils';
import { generateMobTexture } from '../src/client/textures/mobTextures';
import {
  critterState, inSwampHut, hangBat, batHanging, ocelotTrusts, mooshroomBrown, setMooshroomBrown, spawnBats, critterPassiveFor, structureMonster,
} from '../src/shared/sim/entities/critters';
import { spawnTrapHorse, isTrapHorse, isHorseman, trapChance, undeadHorseRestore } from '../src/shared/sim/entities/skeletonTrap';
import type { Entity } from '../src/shared/sim/entities';
import type { Storms } from '../src/shared/sim/server/storms';
import type { Trading } from '../src/shared/sim/server/trading';
import { BIOME_JUNGLE, BIOME_MUSHROOM_FIELDS, BIOME_PLAINS } from '../src/shared/world/biomeIds';
import { makeServer, type Client, type Harness } from './harness';

const NEW: [number, number, string, string][] = [
  [MOB_BAT, 78, 'bat', 'Murciélago'],
  [MOB_OCELOT, 79, 'ocelot', 'Ocelote'],
  [MOB_MOOSHROOM, 80, 'mooshroom', 'Champiñaca'],
  [MOB_TRADER_LLAMA, 81, 'trader_llama', 'Llama de comerciante'],
  [MOB_SKELETON_HORSE, 82, 'skeleton_horse', 'Caballo esqueleto'],
  [MOB_ZOMBIE_HORSE, 83, 'zombie_horse', 'Caballo zombi'],
];

test('criaturas sueltas: ids reservados, nombres, huevos al final y monturas', () => {
  for (const [id, want, key, name] of NEW) {
    assert.equal(id, want);
    const d = MOBS[id];
    assert.ok(d && d.key === key && d.name === name && !d.hostile && MOB_TYPES.includes(id), key);
    const egg = SPAWN_EGGS[key];
    assert.ok(egg > TNT_MINECART, `${key}: huevo registrado al final`);
    assert.equal(spawnEggMob(egg), key);
    assert.ok(ITEMS[egg].name.startsWith('Huevo generador de'), key);
  }
  assert.ok(MOBS[MOB_BAT].flying && MOBS[MOB_BAT].drops.length === 0, 'el murciélago vuela y no suelta nada');
  assert.equal(mobXp(MOB_BAT, false, () => 0.5), 0, 'ni experiencia');
  assert.ok(MOBS[MOB_SKELETON_HORSE].drops.some(([i]) => i === BONE));
  for (const t of [MOB_TRADER_LLAMA, MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE]) assert.ok(MOUNTS[t], `${MOBS[t].key} es montura`);
  assert.ok(MOUNTS[MOB_SKELETON_HORSE].underwater && MOUNTS[MOB_SKELETON_HORSE].saddle);
  assert.ok(canMate(MOB_LLAMA, MOB_TRADER_LLAMA) && !canMate(MOB_COW, MOB_MOOSHROOM));
  assert.ok(isUndead(MOB_SKELETON_HORSE) && isUndead(MOB_ZOMBIE_HORSE));
});

test('criaturas sueltas: modelos dentro del atlas y texturas completas (con sus variantes)', () => {
  for (const [id, , key] of NEW) {
    const d = MOBS[id];
    const [W, H] = d.atlas;
    const names = new Set<string>();
    for (const p of d.parts) {
      if (p.parent) assert.ok(names.has(p.parent), `${key}: padre ${p.parent} antes que ${p.name}`);
      names.add(p.name);
      for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], ...p.size)) {
        assert.ok(u >= 0 && v >= 0 && u + fw <= W && v + fh <= H, `${key}.${p.name} fuera del atlas`);
      }
    }
    const variants = id === MOB_MOOSHROOM ? 2 : id === MOB_TRADER_LLAMA ? 4 : 1;
    for (let vr = 0; vr < variants; vr++) {
      const tex = generateMobTexture(id, vr);
      assert.equal(tex.width, W);
      assert.equal(tex.height, H);
      // Las cajas macizas quedan enteras (sólo se recortan los planos, la crin y los flecos).
      for (const p of d.parts) {
        if (p.size.includes(0) || p.name === 'mane' || p.name === 'decor') continue;
        for (const [u, v, fw, fh] of boxFaces(p.uv[0], p.uv[1], ...p.size)) {
          for (let y = v; y < v + fh; y++) for (let x = u; x < u + fw; x++) assert.equal(tex.rgba[(y * W + x) * 4 + 3], 255, `${key}/${vr}.${p.name} en ${x},${y}`);
        }
      }
    }
  }
  // Champiñaca roja y marrón: distinto color de cuerpo.
  const a = generateMobTexture(MOB_MOOSHROOM, 0), b = generateMobTexture(MOB_MOOSHROOM, 1);
  const body = MOBS[MOB_MOOSHROOM].parts.find((p) => p.name === 'body')!;
  const [fu, fv] = boxFaces(body.uv[0], body.uv[1], ...body.size)[0];
  let diff = 0;
  for (let k = 0; k < 20; k++) {
    const o = ((fv + 2 + (k % 5)) * a.width + fu + 1 + k) * 4;
    diff += Math.abs(a.rgba[o] - b.rgba[o]) + Math.abs(a.rgba[o + 1] - b.rgba[o + 1]);
  }
  assert.ok(diff > 200, 'roja y marrón se distinguen');
  // Los champiñones son recortes: tienen téxeles transparentes y opacos.
  const mush = MOBS[MOB_MOOSHROOM].parts.find((p) => p.name.startsWith('mush'))!;
  const [mu, mv, mw, mh] = boxFaces(mush.uv[0], mush.uv[1], ...mush.size)[4];
  let clear = 0, solid = 0;
  for (let y = mv; y < mv + mh; y++) for (let x = mu; x < mu + mw; x++) (a.rgba[(y * a.width + x) * 4 + 3] ? solid++ : clear++);
  assert.ok(clear > 10 && solid > 10, `champiñón recortado (${solid} opacos, ${clear} transparentes)`);
});

// ---------------------------------------------------------------- servidor

/** Plataforma de piedra en el cielo con un jugador (sin lluvia y de día). */
function platform(seed = 5151): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(seed);
  const c = h.join('Naturalista');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  c.send({ t: 'chat', m: '/time set mediodia' });
  (h.gs.entities.host as { raining: () => number }).raining = () => 0;
  const bx = Math.floor(sx) + 2, by = 150, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -12; dx <= 12; dx++) for (let dz = -12; dz <= 12; dz++) W.setBlock(bx + dx, by - 1, bz + dz, STONE);
  c.pos(bx + 10, by, bz + 10);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);
const mobsOf = (h: Harness, type: number): Entity[] => [...h.gs.entities.list.values()].filter((e) => e.type === type && !e.dead);

function interact(c: Client, e: Entity, item: number, q: number): { ok: boolean; take?: number; wear?: number; give?: { id: number; count: number; dmg?: number } } {
  c.send({ t: 'interact', e: e.id, item, q });
  return c.conn.take('ires').pop();
}

test('murciélago: se cuelga del techo, despierta si se acerca alguien y no se guarda', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) W.setBlock(bx + dx, by + 3, bz + dz, STONE);
  const E = h.gs.entities;
  const bat = E.spawnMob(MOB_BAT, bx + 0.5, by + 2.05, bz + 0.5)!;
  assert.ok(hangBat(E, bat), 'hay techo encima');
  h.tick(20);
  assert.ok(batHanging(bat) && bat.flags & EF_BAT_HANGING, 'colgado (y los clientes lo ven)');
  assert.ok(Math.abs(bat.y + bat.height - (by + 3)) < 0.01, 'pegado al techo');
  c.pos(bx + 1.5, by, bz + 0.5);
  h.tick(3);
  assert.ok(!batHanging(bat), 'se despierta con un jugador a menos de 4 bloques');
  h.tick(40);
  assert.ok(!bat.dead, 'revolotea');
  assert.ok(!E.serializePassive().includes(`[${MOB_BAT},`), 'no se guarda con el mundo');
});

test('murciélago: aparece a oscuras bajo el nivel del mar (más en Halloween) y no con luz', () => {
  assert.ok(batLightOk(0, 0, false) && !batLightOk(4, 0.99, false) && batLightOk(3, 0.99, false) && !batLightOk(3, 0.5, false));
  assert.ok(batLightOk(6, 0.99, true) && !batLightOk(7, 0.99, true), 'en Halloween admite hasta 6');
  assert.ok(isHalloween(new Date(2026, 9, 25)) && isHalloween(new Date(2026, 10, 3)) && !isHalloween(new Date(2026, 6, 1)));
  const { h, c } = platform();
  const E = h.gs.entities, W = h.gs.world;
  const px = Math.floor(c.welcome.spawn[0]), pz = Math.floor(c.welcome.spawn[2]);
  const py = 30;
  c.pos(px + 0.5, py, pz + 0.5);
  h.tick(10);
  // Con la tirada a 0: 16 bloques al este, 16 más abajo que el jugador; una sala oscura cerrada.
  const x = px + 16, y = py - 16;
  for (let dx = -4; dx <= 2; dx++) for (let dz = -3; dz <= 3; dz++) {
    W.setBlock(x + dx, y - 1, pz + dz, STONE);
    for (let dy = 0; dy < 3; dy++) W.setBlock(x + dx, y + dy, pz + dz, AIR);
    W.setBlock(x + dx, y + 3, pz + dz, STONE);
  }
  for (const e of mobsOf(h, MOB_BAT)) E.remove(e.id);
  const view = { id: c.welcome.id, name: 'Naturalista', x: px + 0.5, y: py, z: pz + 0.5, alive: true, creative: false, lookingAt: -1 };
  const rand = E.rand;
  E.rand = () => 0;
  const n = spawnBats(E, view, false);
  assert.ok(n >= 1 && y < SEA_LEVEL, `murciélagos en la sala oscura (${n})`);
  for (const e of mobsOf(h, MOB_BAT)) E.remove(e.id);
  W.setBlock(x, y, pz, TORCH);
  assert.equal(spawnBats(E, view, false), 0, 'con una antorcha, ninguno');
  E.rand = rand;
});

test('ocelote: huye, confía con pescado (1 de cada 3), asusta a los creepers y se guarda la confianza', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities;
  const oc = E.spawnMob(MOB_OCELOT, bx + 0.5, by, bz + 0.5)!;
  c.pos(bx + 3.5, by, bz + 0.5);
  h.tick(30);
  assert.ok(Math.hypot(oc.x - (bx + 3.5), oc.z - (bz + 0.5)) > 5, 'desconfiado, huye del jugador');
  // Quieto con bacalao en la mano: ya no huye (se acerca).
  // (Esperar a que el salto del jugador hasta aquí deje de contar como carrera: correr lo asusta.)
  c.send({ t: 'pos', p: [bx + 4.5, by, bz + 0.5], r: [0, 0], s: 0, h: COD });
  h.tick(140);
  Object.assign(oc, { x: bx + 0.5, y: by, z: bz + 0.5, vx: 0, vy: 0, vz: 0 });
  oc.ai!.panic = 0;
  h.tick(40);
  assert.ok(Math.hypot(oc.x - (bx + 4.5), oc.z - (bz + 0.5)) < 4.5, 'con pescado en la mano no huye');
  // Darle pescado: con la tirada baja confía; si no, humo y sigue desconfiando.
  c.send({ t: 'pos', p: [oc.x + 1.5, oc.y, oc.z], r: [0, 0], s: 0, h: COD });
  h.tick(1);
  const rand = E.rand;
  E.rand = () => 0.9;
  let r = interact(c, oc, COD, 1);
  assert.ok(r.ok && r.take === 1 && !ocelotTrusts(oc), 'con mala suerte no confía (pero se come el pescado)');
  E.rand = () => 0.1;
  r = interact(c, oc, COD, 2);
  assert.ok(r.ok && ocelotTrusts(oc), 'confía');
  E.rand = rand;
  r = interact(c, oc, COD, 3);
  assert.ok(r.ok && (oc.love ?? 0) > 0, 'ya confiado, el pescado lo pone en modo amor');
  // Confiado ya no huye.
  c.send({ t: 'pos', p: [oc.x + 2, by, oc.z], r: [0, 0], s: 0, h: 0 });
  h.tick(10);
  assert.ok(!(oc.ai!.panic > 0), 'confiado no huye');
  assert.ok(E.serializePassive().includes('"crit":[1]'), 'la confianza se guarda');
  // Los creepers le tienen miedo.
  const cr = E.spawnMob(MOB_CREEPER, oc.x + 2, by, oc.z)!;
  assert.ok(E.companions.scaredOfCat(cr), 'el creeper huye del ocelote');
  assert.ok(critterPassiveFor(BIOME_JUNGLE, () => 0) === MOB_OCELOT && critterPassiveFor(BIOME_PLAINS, () => 0) === 0);
});

test('ocelote: caza gallinas', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities;
  c.pos(bx + 0.5, by + 40, bz + 0.5); // lejos: que no huya del jugador
  const oc = E.spawnMob(MOB_OCELOT, bx + 0.5, by, bz + 0.5)!;
  const hen = E.spawnMob(MOB_CHICKEN, bx + 4.5, by, bz + 0.5)!;
  let hurt = false;
  for (let i = 0; i < 40 && !hurt; i++) {
    h.tick(5);
    hurt = hen.dead || hen.health < hen.maxHealth;
  }
  assert.ok(hurt, 'el ocelote muerde a la gallina');
  assert.ok(Math.hypot(oc.x - hen.x, oc.z - hen.z) < 3, 'la persigue');
});

test('champiñaca: tijeras (vaca y 5 champiñones), cuenco, cubo, flor y estofado sospechoso, rayo', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities;
  c.pos(bx + 2.5, by, bz + 0.5);
  h.tick(2);
  const moo = E.spawnMob(MOB_MOOSHROOM, bx + 0.5, by, bz + 0.5)!;
  h.tick(2);
  let r = interact(c, moo, BOWL, 1);
  assert.ok(r.ok && r.take === 1 && r.give?.id === MUSHROOM_STEW, 'cuenco → estofado de champiñones');
  r = interact(c, moo, BUCKET, 2);
  assert.ok(r.ok && r.give?.id === MILK_BUCKET, 'cubo → leche');
  // La roja no quiere flores.
  r = interact(c, moo, POPPY, 3);
  assert.ok(!r.ok, 'la roja no come flores');
  // Un rayo la vuelve marrón sin hacerle daño.
  const storms = h.gs.sys.storms;
  const hp = moo.health;
  storms.strike(moo.x, moo.y + 0.5, moo.z);
  assert.ok(mooshroomBrown(moo) && moo.health === hp && moo.fire <= 0, 'marrón, sin daño ni fuego');
  h.tick(2);
  assert.ok(moo.flags & EF_BROWN_MOOSHROOM, 'los clientes ven que es marrón');
  // Flor → el próximo cuenco es un estofado sospechoso con su efecto.
  r = interact(c, moo, DANDELION, 4);
  assert.ok(r.ok && r.take === 1, 'se come el diente de león');
  r = interact(c, moo, POPPY, 5);
  assert.ok(r.ok && !r.take, 'con una flor ya comida, la segunda no la gasta');
  r = interact(c, moo, BOWL, 6);
  const idx = SUSPICIOUS_FLOWERS.findIndex(([f]) => f === DANDELION) + 1;
  assert.ok(r.give?.id === SUSPICIOUS_STEW && r.give.dmg === idx, 'estofado sospechoso del diente de león');
  assert.deepEqual(stewEffect(r.give!.dmg), [SUSPICIOUS_FLOWERS[idx - 1][1], SUSPICIOUS_FLOWERS[idx - 1][2]]);
  r = interact(c, moo, BOWL, 7);
  assert.equal(r.give?.id, MUSHROOM_STEW, 'y después, estofado normal');
  // Se guarda el color.
  assert.ok(E.serializePassive().includes('"crit":[1,0]'), 'el color se guarda');
  // Tijeras: vaca en su sitio y cinco champiñones marrones.
  moo.customName = 'Rosita';
  r = interact(c, moo, SHEARS, 8);
  assert.ok(r.ok && r.wear === 1, 'las tijeras se desgastan');
  h.tick(3);
  assert.ok(!E.list.has(moo.id), 'la champiñaca ya no está');
  const cow = mobsOf(h, MOB_COW)[0];
  assert.ok(cow && Math.hypot(cow.x - moo.x, cow.z - moo.z) < 0.5 && cow.customName === 'Rosita', 'es una vaca con su nombre');
  assert.equal(itemsOf(h, BROWN_MUSHROOM), 5, 'cinco champiñones marrones');
  // Una roja suelta champiñones rojos; y un rayo la vuelve a cambiar.
  const red = E.spawnMob(MOB_MOOSHROOM, bx + 0.5, by, bz + 3.5)!;
  setMooshroomBrown(red, false);
  interact(c, red, SHEARS, 9);
  h.tick(3);
  assert.equal(itemsOf(h, RED_MUSHROOM), 5, 'cinco rojos');
  assert.equal(critterPassiveFor(BIOME_MUSHROOM_FIELDS, () => 0.5), MOB_MOOSHROOM, 'en los campos de champiñones');
});

test('llama de comerciante: llegan dos atadas al comerciante, lo defienden y se van con él', () => {
  const { h, c } = platform();
  const trading = h.gs.sys.trading;
  const trader = trading.spawnTrader()!;
  assert.ok(trader && trader.type === MOB_WANDERING_TRADER, 'llega un comerciante');
  const llamas = mobsOf(h, MOB_TRADER_LLAMA);
  assert.equal(llamas.length, 2, 'con dos llamas');
  assert.ok(llamas.every((l) => l.leash === `@${trader.id}`), 'atadas a él');
  h.tick(40);
  assert.ok(llamas.every((l) => Math.hypot(l.x - trader.x, l.z - trader.z) < 10), 'le siguen');
  // Un jugador le pega: las llamas se enfadan con él.
  h.gs.entities.damage(trader, 1, trader.x + 1, trader.z, c.welcome.id);
  h.tick(3);
  assert.ok(llamas.every((l) => l.ai!.target === c.welcome.id && l.flags & EF_ANGRY), 'lo defienden');
  // Se va el comerciante: se van ellas.
  h.gs.entities.remove(trader.id);
  h.tick(2);
  assert.equal(mobsOf(h, MOB_TRADER_LLAMA).length, 0, 'se van con él');
});

test('llama de comerciante: si muere el comerciante se quedan y se pueden domar', () => {
  const { h, c } = platform();
  const trading = h.gs.sys.trading;
  const trader = trading.spawnTrader()!;
  const llama = mobsOf(h, MOB_TRADER_LLAMA)[0];
  h.gs.entities.kill(trader, true);
  h.tick(40);
  assert.ok(!llama.dead && h.gs.entities.list.has(llama.id) && !llama.leash, 'suelta');
  assert.ok(critterState(llama).leaveIn > 0, 'con su tiempo para irse');
  llama.temper = 100;
  c.pos(llama.x + 1, llama.y, llama.z);
  h.tick(2);
  c.send({ t: 'mount', e: llama.id });
  h.tick(80);
  assert.ok(llama.tamed, 'domada');
});

test('trampa del rayo: caballo trampa, cuatro jinetes con casco y arco, y caballos domados', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities;
  assert.ok(trapChance(0) === 0 && trapChance(3) > trapChance(1), 'más trampas cuanto más difícil');
  const storms = h.gs.sys.storms;
  assert.ok(storms.natural && storms.struck, 'la tormenta sabe de trampas y champiñacas');
  const horse = spawnTrapHorse(E, bx + 0.5, by, bz + 0.5)!;
  h.tick(20);
  assert.ok(isTrapHorse(horse) && !horse.tamed, 'trampa sin disparar');
  assert.equal(mobsOf(h, MOB_SKELETON).length, 0);
  c.pos(bx + 6.5, by, bz + 0.5);
  h.tick(2);
  assert.ok(!isTrapHorse(horse), 'salta al acercarse');
  const riders = mobsOf(h, MOB_SKELETON);
  const horses = mobsOf(h, MOB_SKELETON_HORSE);
  assert.equal(riders.length, 4, 'cuatro jinetes');
  assert.equal(horses.length, 4, 'cuatro caballos esqueleto');
  assert.ok(horses.every((e) => e.tamed && e.flags & EF_TAMED), 'los caballos quedan domados');
  assert.ok(riders.every((e) => isHorseman(e) && e.gear === ARMOR.iron.helmet), 'jinetes con casco de hierro');
  h.tick(10);
  assert.ok(riders.every((e) => e.flags & EF_HORSEMAN), 'los clientes los ven montados');
  // Montado: sobre su caballo.
  const sk = riders[0];
  const mine = horses.find((e) => Math.hypot(e.x - sk.x, e.z - sk.z) < 0.01);
  assert.ok(mine && sk.y > mine.y + 0.4, 'sentado encima del caballo');
  // Al sol no arde (el casco le protege).
  h.tick(60);
  assert.ok(riders.every((e) => e.dead || e.fire <= 0), 'no arde al sol');
  // Muere el jinete: su caballo queda libre y se le puede poner la silla.
  E.kill(sk, true);
  h.tick(30);
  const free = mine!;
  c.pos(free.x + 1, free.y, free.z);
  h.tick(2);
  const r = interact(c, free, SADDLE, 1);
  assert.ok(r.ok, 'silla puesta al caballo esqueleto');
  // Una trampa sin visitas se guarda con lo que le queda y se va a los 15 minutos.
  const lone = spawnTrapHorse(E, bx + 0.5, by, bz - 11.5)!;
  c.pos(bx + 11, by + 30, bz + 11);
  h.tick(20);
  assert.ok(isTrapHorse(lone) && E.serializePassive().includes(`"crit":[${TRAP_HORSE_SECONDS - 1}]`), 'la trampa se guarda');
  undeadHorseRestore(lone, 2);
  h.tick(60);
  assert.ok(!E.list.has(lone.id), 'y se va sola');
});

test('caballo esqueleto: domado desde el huevo, no flota; el zombi se doma montándolo', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities, W = h.gs.world;
  const sk = E.spawnMob(MOB_SKELETON_HORSE, bx + 0.5, by, bz + 0.5)!;
  const zo = E.spawnMob(MOB_ZOMBIE_HORSE, bx + 4.5, by, bz + 0.5)!;
  h.tick(4);
  assert.ok(sk.tamed && !zo.tamed, 'el esqueleto ya viene domado; el zombi no');
  zo.temper = 100;
  c.pos(zo.x + 1, zo.y, zo.z);
  h.tick(2);
  c.send({ t: 'mount', e: zo.id });
  h.tick(80);
  assert.ok(zo.tamed, 'el caballo zombi se doma montándolo');
  c.send({ t: 'dismount' });
  // Un pozo de agua de 4 de hondo: el esqueleto se va al fondo.
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    for (let dy = 0; dy < 5; dy++) W.setBlock(bx - 6 + dx, by - 1 - dy, bz + dz, WATER);
    W.setBlock(bx - 6 + dx, by - 6, bz + dz, STONE);
  }
  sk.x = bx - 5.5;
  sk.z = bz + 0.5;
  sk.y = by - 1;
  h.tick(60);
  assert.ok(sk.y < by - 4, `el caballo esqueleto se hunde (y = ${sk.y.toFixed(2)})`);
});

// ---------------------------------------------------------------- estructuras

test('cabaña de bruja: se genera con lo suyo, sobre postes, y dentro sólo salen brujas', () => {
  const gen = new TerrainGenerator(777);
  const p = locateStructure(gen, 'swamp_hut', 0, 0, 20)!;
  assert.ok(p, 'hay una cabaña cerca');
  assert.equal(STRUCTURE_NAMES.swamp_hut, 'Cabaña de bruja');
  const count = new Map<number, number>();
  let pot = 0;
  const cx = Math.floor(p[0] / 16), cz = Math.floor(p[2] / 16);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const r = gen.generate(cx + dx, cz + dz);
    for (const b of r.blocks) {
      count.set(b, (count.get(b) ?? 0) + 1);
      if (isFlowerPot(b) && pottedPlant(b) === RED_MUSHROOM) pot++;
    }
  }
  assert.ok((count.get(SPRUCE_PLANKS) ?? 0) >= 60, 'tablones de abeto');
  assert.ok((count.get(CAULDRON) ?? 0) >= 1 && (count.get(CRAFTING_TABLE) ?? 0) >= 1, 'caldero y mesa de trabajo');
  assert.equal(pot, 1, 'maceta con champiñón rojo');
  // Los postes de roble llegan hasta el fondo.
  const spot = swampHutSpawnSpot(gen.seed, p[0], p[1], p[2]);
  assert.ok(inSwampHut(gen, spot[0], spot[1], spot[2]), 'el sitio de la bruja está dentro');
  assert.ok(!inSwampHut(gen, p[0] + 20, p[1] + 2, p[2]), 'fuera no');
  assert.ok(!inSwampHut(gen, spot[0], p[1] + 12, spot[2]), 'ni muy por encima');
  let logs = 0;
  for (let y = p[1] + 3; y > p[1] - 12; y--) {
    for (let dx = -3; dx <= 3; dx++) for (let dz = -4; dz <= 4; dz++) {
      const X = p[0] + dx, Z = p[2] + dz;
      const r = gen.generate(Math.floor(X / 16), Math.floor(Z / 16));
      if (r.blocks[blockIndex(X - Math.floor(X / 16) * 16, y, Z - Math.floor(Z / 16) * 16)] === OAK_LOG) logs++;
    }
  }
  assert.ok(logs >= 16, `cuatro postes de roble hasta el suelo (${logs})`);
});

test('cabaña de bruja: al llegar aparecen su bruja y su gato negro, y el spawner pone brujas dentro', () => {
  const h = makeServer(777);
  const c = h.join('Brujula');
  const gen = h.gs.world.gen;
  const p = locateStructure(gen, 'swamp_hut', 0, 0, 20)!;
  const spot = swampHutSpawnSpot(gen.seed, p[0], p[1], p[2]);
  c.pos(spot[0] + 3, spot[1] + 4, spot[2] + 3);
  let witch = false, cat: Entity | undefined;
  for (let i = 0; i < 60 && !(witch && cat); i++) {
    h.tick(20);
    witch = mobsOf(h, MOB_WITCH).some((e) => Math.hypot(e.x - spot[0], e.z - spot[2]) < 3);
    cat = mobsOf(h, MOB_CAT).find((e) => Math.hypot(e.x - spot[0], e.z - spot[2]) < 4);
  }
  assert.ok(witch, 'una bruja en la cabaña');
  assert.ok(cat && cat.variant === 2, 'y un gato negro');
  assert.equal(structureMonster(h.gs.entities, MOB_CREEPER, spot[0], spot[1], spot[2]), MOB_WITCH, 'dentro sólo brujas');
  assert.equal(structureMonster(h.gs.entities, MOB_CREEPER, spot[0] + 30, spot[1], spot[2]), MOB_CREEPER);
  // Sólo una vez por cabaña.
  const n = mobsOf(h, MOB_WITCH).length;
  h.tick(60);
  assert.ok(mobsOf(h, MOB_WITCH).length <= n + 1, 'no aparece otra bruja de generación');
});

test('fósiles: huesos enterrados en desiertos y pantanos, con carbón arriba y diamante abajo', () => {
  const gen = new TerrainGenerator(12345);
  assert.equal(STRUCTURE_NAMES.fossil, 'Fósil');
  let upper = 0, deep = 0, diamonds = 0, coal = 0;
  const seen = new Set<string>();
  for (const [ox, oz] of [[0, 0], [2000, 0], [0, 2000], [-2000, 0], [0, -2000], [2000, 2000], [-2000, -2000], [4000, 0], [0, 4000]]) {
    const p = locateStructure(gen, 'fossil', ox, oz, 20);
    if (!p || seen.has(p.join())) continue;
    seen.add(p.join());
    const { pieces } = fossilPieces(gen.seed, p[0], p[2]);
    let bones = 0;
    for (const [a, py, b] of pieces) {
      const X = p[0] + a, Y = p[1] + py, Z = p[2] + b;
      const r = gen.generate(Math.floor(X / 16), Math.floor(Z / 16));
      const id = r.blocks[blockIndex(X - Math.floor(X / 16) * 16, Y, Z - Math.floor(Z / 16) * 16)];
      if (id === BONE_BLOCK || id === BONE_BLOCK_AXIS || id === BONE_BLOCK_AXIS + 1) bones++;
      if (id === COAL_ORE || id === DEEPSLATE_ORE[COAL_ORE]) coal++;
      if (id === DEEPSLATE_ORE[DIAMOND_ORE] || id === DIAMOND_ORE) diamonds++;
    }
    assert.ok(bones >= pieces.length * 0.4, `fósil en ${p}: ${bones} de ${pieces.length} huesos`);
    const surface = gen.surfaceAt(p[0], p[2], gen.columnInfo(p[0], p[2]));
    if (p[1] < 0) deep++;
    else {
      upper++;
      assert.ok(p[1] <= surface - 15, `enterrado (y ${p[1]}, superficie ${surface})`);
    }
  }
  assert.ok(upper >= 1 && deep >= 1, `fósiles de arriba (${upper}) y hondos (${deep})`);
  assert.ok(coal + diamonds >= 1, 'con su capa de mena');
});
