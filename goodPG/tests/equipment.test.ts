// Fase 6.5 (equipo): fuego y mechero, cota de malla, ballesta, tridente, tortuga, armaduras de caballo
// y lobo, caña con zanahoria, cuerno de cabra, botín raro, conducto y fuegos artificiales (registro,
// recetas, servidor y guardado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, BLOCKS, BLOCK_SOLID, BLOCK_EMISSION, FIRE, CONDUIT, PRISMARINE, SLABS, CANDLE, isFire, isConduit, fireAge,
  fireWithAge, flammability, flameEncouragement, stateOf, stateProps, isWaterlogged, isCandle, isLitCandle, candleState, POTATOES,
  WOOL, ALL_PLANKS, OAK_LOG, OAK_LEAVES, WHITE_WOOL, ALL_LOGS,
} from '../src/shared/blocks';
import { TRIPWIRE_HOOK } from '../src/shared/blocks'; // Fase 7 (redstone): la ballesta lleva gancho
import {
  ITEMS, CREATIVE_ITEMS, itemSpriteIndex, ARMOR, FLINT_AND_STEEL, CROSSBOW, CROSSBOW_CHARGED, TRIDENT, TURTLE_SCUTE, TURTLE_HELMET,
  HORSE_ARMOR, WOLF_ARMOR, CARROT_ON_A_STICK, GOAT_HORN, RABBIT_FOOT, POISONOUS_POTATO, ENCHANTED_GOLDEN_APPLE, HEART_OF_THE_SEA,
  NAUTILUS_SHELL, FIREWORK_ROCKET, FIREWORK_STAR, IRON_INGOT, FLINT, STICK, STRING, LEATHER, ARMADILLO_SCUTE, FISHING_ROD, CARROT,
  GUNPOWDER, PAPER, DYES, SHEARS, POTATO, ITEM_COUNT, type ItemStack,
} from '../src/shared/items';
import { matchRecipe, fireworkCraft } from '../src/shared/recipes';
import { planPlacement, type PlaceHit } from '../src/shared/placement';
import { ARMOR_STATS, ALL_ARMOR_MATERIALS } from '../src/shared/armor';
import { EFFECTS, EFFECT_RESISTANCE, EFFECT_CONDUIT_POWER, EFFECT_WATER_BREATHING, resistanceFactor } from '../src/shared/effects';
import {
  ENT_TRIDENT, ENT_FIREWORK, CROSSBOW_ARROW_DAMAGE, TRIDENT_THROW_DAMAGE, CONDUIT_FRAME, conduitRange, fireworkData, fireworkFlight,
  fireworkColors, colorList, hornTune, HORSE_ARMOR_POINTS,
} from '../src/shared/equipment';
import { LOOT_TABLES } from '../src/shared/loot';
import { blockDrops } from '../src/shared/sim/drops';
import { STATE_SNEAK } from '../src/shared/protocol';
import {
  MOB_HORSE, MOB_WOLF, MOB_PIG, MOB_DROWNED, MOB_PILLAGER, MOB_RABBIT, MOB_TURTLE, MOB_GOAT, MOB_ZOMBIE, ENT_ITEM, ENT_ARROW,
} from '../src/shared/mobs';
import { EQUIPMENT_SPRITES } from '../src/client/textures/equipmentSprites';
import { EQUIPMENT_GENERATORS } from '../src/client/textures/genEquipment';
import { gearTexture } from '../src/client/textures/gearTextures';
import { MOBS } from '../src/shared/mobs';
import { Survival } from '../src/client/game/Survival';
import { MemoryStore } from '../src/shared/sim/store';
import { makeServer, type Client, type Harness } from './harness';

const craft = (grid: number[]) => matchRecipe(grid, 3)?.out;
const stacks = (...ids: number[]): (ItemStack | null)[] => ids.map((id) => (id ? { id, count: 1 } : null));

// ------------------------------------------------------------------ registro y recetas

test('registro: objetos, bloques, sprites, texturas, efectos y armaduras', () => {
  const mine = [
    FLINT_AND_STEEL, CROSSBOW, TRIDENT, TURTLE_SCUTE, TURTLE_HELMET, ...Object.values(HORSE_ARMOR), WOLF_ARMOR, CARROT_ON_A_STICK,
    GOAT_HORN, RABBIT_FOOT, POISONOUS_POTATO, ENCHANTED_GOLDEN_APPLE, HEART_OF_THE_SEA, NAUTILUS_SHELL, FIREWORK_ROCKET, FIREWORK_STAR,
    ...Object.values(ARMOR.chainmail),
  ];
  for (const id of mine) {
    assert.ok(ITEMS[id], `objeto ${id}`);
    assert.ok(CREATIVE_ITEMS.includes(id), `en el creativo: ${ITEMS[id].key}`);
    assert.ok(itemSpriteIndex(id) >= 0 && EQUIPMENT_SPRITES[ITEMS[id].sprite!], `sprite: ${ITEMS[id].key}`);
  }
  assert.ok(!CREATIVE_ITEMS.includes(CROSSBOW_CHARGED) && EQUIPMENT_SPRITES.crossbow_charged, 'la ballesta cargada no está en el creativo');
  assert.ok(ITEM_COUNT <= 1024);
  // Nombres oficiales.
  assert.equal(ITEMS[FLINT_AND_STEEL].name, 'Mechero');
  assert.equal(ITEMS[ARMOR.chainmail.chestplate].name, 'Peto de cota de malla');
  assert.equal(ITEMS[HORSE_ARMOR.diamond].name, 'Armadura de diamante para caballo');
  assert.equal(ITEMS[TURTLE_HELMET].name, 'Caparazón de tortuga');
  assert.equal(BLOCKS[CONDUIT].name, 'Conducto');
  // Durabilidades y daño.
  assert.equal(ITEMS[FLINT_AND_STEEL].tool!.durability, 64);
  assert.equal(ITEMS[TRIDENT].tool!.damage, 9);
  assert.equal(ITEMS[CARROT_ON_A_STICK].tool!.durability, 25);
  assert.deepEqual(ARMOR_STATS.chainmail.points, [2, 5, 4, 1]);
  assert.equal(ITEMS[TURTLE_HELMET].armor!.slot, 0);
  // Fuego: luz 15, sin colisión, no es objeto; el conducto da luz y tiene estado anegado.
  assert.equal(BLOCK_EMISSION[FIRE], 15);
  assert.equal(BLOCK_SOLID[FIRE], 0);
  assert.equal(ITEMS[FIRE], undefined);
  assert.ok(isFire(fireWithAge(15)) && fireAge(fireWithAge(7)) === 7);
  assert.ok(isWaterlogged(stateOf(CONDUIT, { water: 1, active: 0 })) && !isWaterlogged(CONDUIT));
  assert.ok(ITEMS[CONDUIT], 'el conducto es objeto');
  // Inflamables (valores de Minecraft).
  assert.deepEqual([flameEncouragement(ALL_PLANKS[0]), flammability(ALL_PLANKS[0])], [5, 20]);
  assert.deepEqual([flameEncouragement(OAK_LEAVES), flammability(OAK_LEAVES)], [30, 60]);
  assert.deepEqual([flameEncouragement(WHITE_WOOL), flammability(WHITE_WOOL)], [30, 60]);
  assert.ok(flammability(OAK_LOG) === 5 && flammability(ALL_LOGS[3]) === 5);
  assert.equal(flammability(STONE), 0);
  assert.equal(flammability(SLABS.stone), 0, 'las losas de piedra no arden');
  assert.equal(flammability(SLABS.oak), 20, 'las de madera, sí');
  assert.deepEqual(blockDrops(FIRE, 0), [], 'el fuego no suelta nada');
  // Texturas y armaduras.
  for (const t of ['fire', 'conduit_closed', 'conduit_open']) assert.ok(EQUIPMENT_GENERATORS[t], `generador: ${t}`);
  assert.ok(ALL_ARMOR_MATERIALS.includes('chainmail') && ALL_ARMOR_MATERIALS.includes('turtle'));
  for (const id of Object.values(HORSE_ARMOR)) assert.ok(gearTexture(MOBS[MOB_HORSE], id), 'textura de la armadura de caballo');
  assert.ok(gearTexture(MOBS[MOB_WOLF], WOLF_ARMOR));
  assert.equal(gearTexture(MOBS[MOB_PIG], WOLF_ARMOR), null);
  // Efectos nuevos.
  assert.equal(EFFECTS[EFFECT_RESISTANCE].name, 'Resistencia');
  assert.equal(EFFECTS[EFFECT_CONDUIT_POWER].name, 'Poder del conducto');
  assert.equal(resistanceFactor(0), 0.8);
  assert.equal(resistanceFactor(-1), 1);
  assert.equal(hornTune(2), 'Canto');
});

test('recetas: mechero, ballesta, tortuga, armaduras, caña, conducto y fuegos artificiales', () => {
  assert.equal(matchRecipe([IRON_INGOT, FLINT, 0, 0], 2)?.out.id, FLINT_AND_STEEL);
  assert.deepEqual(craft([STICK, IRON_INGOT, STICK, STRING, TRIPWIRE_HOOK, STRING, 0, STICK, 0]), { id: CROSSBOW, count: 1 });
  assert.deepEqual(craft([TURTLE_SCUTE, TURTLE_SCUTE, TURTLE_SCUTE, TURTLE_SCUTE, 0, TURTLE_SCUTE, 0, 0, 0]), { id: TURTLE_HELMET, count: 1 });
  assert.deepEqual(craft([LEATHER, 0, LEATHER, LEATHER, LEATHER, LEATHER, LEATHER, 0, LEATHER]), { id: HORSE_ARMOR.leather, count: 1 });
  const S = ARMADILLO_SCUTE;
  assert.deepEqual(craft([S, 0, 0, S, S, S, S, 0, S]), { id: WOLF_ARMOR, count: 1 });
  assert.equal(matchRecipe([FISHING_ROD, 0, 0, CARROT], 2)?.out.id, CARROT_ON_A_STICK);
  const N = NAUTILUS_SHELL;
  assert.deepEqual(craft([N, N, N, N, HEART_OF_THE_SEA, N, N, N, N]), { id: CONDUIT, count: 1 });
  // Las armaduras de hierro, oro y diamante para caballo y el tridente no se fabrican.
  assert.equal(craft([IRON_INGOT, 0, IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, 0, IRON_INGOT]), undefined);
  // Estrella: pólvora y tintes (sus colores van en el desgaste).
  const star = fireworkCraft(stacks(GUNPOWDER, DYES.red, DYES.blue, 0));
  assert.equal(star?.id, FIREWORK_STAR);
  assert.deepEqual(colorList(star!.dmg!), [11, 14]);
  assert.equal(fireworkCraft(stacks(GUNPOWDER, 0, 0, 0)), null, 'sin tinte no hay estrella');
  // Cohetes: papel y pólvora (vuelo) y las estrellas que se quiera.
  const plain = fireworkCraft(stacks(PAPER, GUNPOWDER, GUNPOWDER, 0))!;
  assert.deepEqual([plain.id, plain.count, fireworkFlight(plain.dmg), fireworkColors(plain.dmg)], [FIREWORK_ROCKET, 3, 2, 0]);
  const grid: (ItemStack | null)[] = [{ id: PAPER, count: 1 }, { id: GUNPOWDER, count: 1 }, star, { id: FIREWORK_STAR, count: 1, dmg: 1 }];
  const colored = fireworkCraft(grid)!;
  assert.equal(fireworkFlight(colored.dmg), 1);
  assert.deepEqual(colorList(fireworkColors(colored.dmg)), [0, 11, 14]);
  assert.equal(fireworkCraft(stacks(PAPER, GUNPOWDER, GUNPOWDER, GUNPOWDER, GUNPOWDER)), null, 'como mucho 3 de pólvora');
  assert.equal(fireworkCraft(stacks(PAPER, STICK, 0, 0)), null);
  assert.equal(fireworkData(3, 5) & 3, 3);
});

test('conducto: se coloca anegado en el agua; marco y alcance', () => {
  const get = (x: number, y: number, z: number) => (y < 10 ? WATER : AIR);
  const hit: PlaceHit = { x: 0, y: 3, z: 0, nx: 0, ny: 1, nz: 0, px: 0.5, py: 4, pz: 0.5, id: WATER };
  const wet = planPlacement(get, { ...hit, id: STONE }, CONDUIT, 0)!;
  assert.ok(isConduit(wet[0][3]) && isWaterlogged(wet[0][3]), 'anegado bajo el agua');
  const dry = planPlacement(get, { ...hit, y: 20, py: 21, id: STONE }, CONDUIT, 0)!;
  assert.ok(isConduit(dry[0][3]) && !isWaterlogged(dry[0][3]));
  assert.equal(CONDUIT_FRAME.length, 42);
  assert.equal(conduitRange(15), 0);
  assert.equal(conduitRange(16), 32);
  assert.equal(conduitRange(42), 96);
});

test('botín: estructuras, patata venenosa y comida', () => {
  const has = (table: string, id: number) => LOOT_TABLES[table].entries.some((e) => e[0] === id);
  assert.ok(has('dungeon', ENCHANTED_GOLDEN_APPLE) && has('desert_pyramid', HORSE_ARMOR.diamond));
  assert.ok(has('shipwreck_treasure', HEART_OF_THE_SEA) && has('ruined_portal', HEART_OF_THE_SEA));
  assert.ok(has('dungeon', ARMOR.chainmail.chestplate));
  // Patata madura: con suerte, también una venenosa.
  const ripe = POTATOES + 7;
  const drops = blockDrops(ripe, 0, () => 0.001);
  assert.ok(drops.some((s) => s.id === POISONOUS_POTATO) && drops.some((s) => s.id === POTATO));
  assert.ok(!blockDrops(ripe, 0, () => 0.9).some((s) => s.id === POISONOUS_POTATO));
  const apple = ITEMS[ENCHANTED_GOLDEN_APPLE].food!;
  assert.ok(apple.always && apple.effects!.some(([id, , amp]) => id === EFFECT_RESISTANCE && amp === 0));
  assert.ok(apple.effects!.some(([, secs, amp]) => secs === 120 && amp === 3), 'absorción IV');
  assert.ok(ITEMS[POISONOUS_POTATO].food!.effects!.length === 1);
});

test('supervivencia: resistencia y fuego en el cliente', () => {
  const s = new Survival();
  s.resistance = 0;
  assert.equal(s.damage(10, 'zombie'), 8, 'Resistencia I quita un 20 %');
  s.reset();
  s.resistance = -1;
  s.update(0.05, { eyeInWater: false, inLava: false, inWater: false, inRain: false, difficulty: 2, inFire: true });
  assert.ok(s.fire >= 7.9 && s.health === 19, 'el fuego prende y quema');
});

// ------------------------------------------------------------------ servidor

function platform(store = new MemoryStore(), mode: 's' | 'c' = 's', name = 'Equipada'): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(6161, store);
  const c = h.join(name, mode);
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 170, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -9; dx <= 9; dx++) for (let dz = -9; dz <= 9; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 8; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const itemsOf = (h: Harness, id: number) =>
  [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && e.stack?.id === id).reduce((n, e) => n + e.stack!.count, 0);
const ires = (c: Client, q: number) => c.conn.take('ires').find((m) => m.q === q);
/** Azar fijo del servidor (y de las entidades). */
function luck(h: Harness, v: number | null): void {
  const r = v === null ? Math.random : () => v;
  (h.gs as unknown as { rand: () => number }).rand = r;
  h.gs.entities.rand = r;
}

test('servidor: mechero, fuego que se apaga en la piedra y velas', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  // Encender en la cara de arriba de la piedra.
  c.send({ t: 'ignite', x: bx + 3, y: by - 1, z: bz, n: [0, 1, 0], q: 1 });
  const r = ires(c, 1);
  assert.ok(r?.ok && r.wear === 1, 'el mechero se desgasta');
  assert.ok(isFire(W.getBlock(bx + 3, by, bz)), 'hay fuego');
  // Sobre piedra y sin nada que quemar, se apaga solo.
  h.tick(20 * 60);
  assert.ok(!isFire(W.getBlock(bx + 3, by, bz)), 'se apagó');
  // En el aire no se sostiene.
  c.send({ t: 'ignite', x: bx + 3, y: by + 2, z: bz, n: [1, 0, 0], q: 2 });
  assert.equal(ires(c, 2)?.ok, false);
  // Una vela apagada se enciende.
  W.setBlock(bx + 1, by, bz + 1, candleState(CANDLE, 1, false));
  c.send({ t: 'ignite', x: bx + 1, y: by, z: bz + 1, n: [0, 1, 0], q: 3 });
  assert.ok(ires(c, 3)?.ok && isCandle(W.getBlock(bx + 1, by, bz + 1)) && isLitCandle(W.getBlock(bx + 1, by, bz + 1)));
  // Romper el fuego no suelta nada.
  c.send({ t: 'ignite', x: bx - 3, y: by - 1, z: bz, n: [0, 1, 0], q: 4 });
  assert.ok(isFire(W.getBlock(bx - 3, by, bz)));
  W.setBlock(bx - 3, by, bz, AIR);
  const near = [...h.gs.entities.list.values()].filter((e) => e.type === ENT_ITEM && Math.hypot(e.x - bx + 2.5, e.z - bz - 0.5) < 2);
  assert.equal(near.length, 0);
});

test('servidor: el fuego quema la madera, se propaga y prende a las criaturas', () => {
  const { h, bx, by, bz } = platform();
  const W = h.gs.world;
  const planks = ALL_PLANKS[0];
  // Una caseta de tablones y lana.
  let before = 0;
  for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 3; dy++) {
    W.setBlock(bx + 3 + dx, by + dy, bz + dz, dy === 2 ? WOOL.white : planks);
    before++;
  }
  const count = () => {
    let n = 0;
    for (let dx = 0; dx < 4; dx++) for (let dz = 0; dz < 3; dz++) for (let dy = 0; dy < 3; dy++) {
      const b = W.getBlock(bx + 3 + dx, by + dy, bz + dz);
      if (b === planks || b === WOOL.white) n++;
    }
    return n;
  };
  const pig = h.gs.entities.spawnMob(MOB_PIG, bx + 2.5, by, bz + 1.5)!;
  assert.ok(h.gs.sys.fire.ignite(bx + 2, by, bz + 1));
  h.tick(20 * 90);
  assert.ok(count() < before, `la madera arde (${count()} de ${before})`);
  assert.ok(pig.fire > 0 || pig.dead || pig.health < pig.maxHealth, 'el cerdo se quemó');
});

test('servidor: rayo que enciende fuego', () => {
  const { h, bx, by, bz } = platform();
  (h.gs as unknown as { difficulty: number }).difficulty = 2;
  h.gs.sys.fire.lightning(bx + 5.5, by, bz + 5.5);
  assert.ok(isFire(h.gs.world.getBlock(bx + 5, by, bz + 5)));
});

test('servidor: ballesta (virote más fuerte) y tridente (lanzar, clavar, recoger, golpear)', () => {
  const { h, c, bx, by, bz } = platform();
  c.send({ t: 'shoot', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [1, 0, 0], f: 1, c: 1 });
  const bolt = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ARROW)!;
  assert.ok(bolt && bolt.arrowDamage === CROSSBOW_ARROW_DAMAGE && Math.hypot(bolt.vx, bolt.vy, bolt.vz) > 60, 'virote de ballesta');
  // Tridente contra la pared de piedra: se clava y se recoge con un uso menos.
  const W = h.gs.world;
  for (let y = by; y < by + 4; y++) W.setBlock(bx + 6, y, bz, STONE);
  c.send({ t: 'throw', item: TRIDENT, p: [bx + 0.5, by + 1.5, bz + 0.5], d: [1, 0, 0], w: 10 });
  const tri = [...h.gs.entities.list.values()].find((e) => e.type === ENT_TRIDENT)!;
  assert.ok(tri, 'sale el tridente');
  h.tick(20);
  assert.ok(tri.stuck, 'se clava');
  c.pos(tri.x - 0.6, by, tri.z);
  c.send({ t: 'pickup', e: tri.id });
  const picked = c.conn.take('picked')[0];
  assert.deepEqual(picked?.s, { id: TRIDENT, count: 1, dmg: 11 });
  // Contra un zombi: 8 de daño.
  c.pos(bx + 0.5, by, bz + 0.5);
  const z = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 3.5, by, bz + 0.5)!;
  const hp = z.health;
  c.send({ t: 'throw', item: TRIDENT, p: [bx + 0.5, by + 1, bz + 0.5], d: [1, 0, 0] });
  h.tick(10);
  assert.equal(hp - z.health, TRIDENT_THROW_DAMAGE);
});

test('servidor: ahogados con tridente, saqueadores, conejos y tortugas (botín)', () => {
  const { h, c, bx, by, bz } = platform();
  const E = h.gs.entities;
  luck(h, 0.01);
  const drowned = E.spawnMob(MOB_DROWNED, bx + 3.5, by, bz + 0.5)!;
  assert.equal(drowned.gear, TRIDENT, 'con tridente');
  h.tick(2);
  assert.ok(c.conn.take('ents').flatMap((m) => m.ex ?? []).some((x: number[]) => x[0] === drowned.id && x[3] === TRIDENT), 'los clientes lo ven');
  E.kill(drowned, true);
  assert.equal(itemsOf(h, TRIDENT), 1, 'lo suelta');
  E.kill(E.spawnMob(MOB_PILLAGER, bx - 3.5, by, bz + 0.5)!, true);
  assert.equal(itemsOf(h, CROSSBOW), 1, 'ballesta del saqueador');
  E.kill(E.spawnMob(MOB_RABBIT, bx - 3.5, by, bz - 3.5)!, true);
  assert.equal(itemsOf(h, RABBIT_FOOT), 1, 'pata de conejo');
  luck(h, 0.99);
  E.kill(E.spawnMob(MOB_RABBIT, bx - 3.5, by, bz - 2.5)!, true);
  assert.equal(itemsOf(h, RABBIT_FOOT), 1, 'no siempre');
  luck(h, null);
  // El ahogado con tridente lo lanza de lejos.
  const d2 = E.spawnMob(MOB_DROWNED, bx + 8.5, by, bz + 0.5)!;
  d2.gear = TRIDENT;
  d2.throwCd = 0;
  d2.ai!.target = c.welcome.id;
  h.tick(1);
  assert.ok([...E.list.values()].some((e) => e.type === ENT_TRIDENT && e.shooter === d2.id), 'lanza su tridente');
  // Tortuga que crece: suelta una escama.
  const turtle = E.spawnMob(MOB_TURTLE, bx - 5.5, by, bz + 4.5, true)!;
  turtle.growAge = 0.1;
  h.tick(5);
  assert.equal(itemsOf(h, TURTLE_SCUTE), 1);
});

test('servidor: armaduras de caballo (reducen el daño) y de lobo (absorbe y se quita con tijeras); se guardan', () => {
  const store = new MemoryStore();
  const { h, c, bx, by, bz } = platform(store, 's', 'Jinete');
  const E = h.gs.entities;
  const horse = E.spawnMob(MOB_HORSE, bx + 3.5, by, bz + 0.5)!;
  c.send({ t: 'interact', e: horse.id, item: HORSE_ARMOR.iron, q: 1 });
  assert.equal(ires(c, 1)?.ok, false, 'sin domar, no');
  horse.tamed = true;
  c.send({ t: 'interact', e: horse.id, item: HORSE_ARMOR.iron, q: 2 });
  assert.equal(ires(c, 2)?.take, 1);
  assert.equal(horse.gear, HORSE_ARMOR.iron);
  const hp = horse.health;
  E.damage(horse, 10, horse.x - 1, horse.z, null);
  assert.ok(hp - horse.health < 10 && hp - horse.health > 5, `menos daño (${(hp - horse.health).toFixed(2)})`);
  assert.equal(HORSE_ARMOR_POINTS.iron, 5);
  // Lobo propio.
  const wolf = E.spawnMob(MOB_WOLF, bx - 3.5, by, bz + 0.5)!;
  wolf.tamedBy = 'jinete';
  c.send({ t: 'interact', e: wolf.id, item: WOLF_ARMOR, q: 3, d: 4 });
  assert.equal(ires(c, 3)?.take, 1);
  const whp = wolf.health;
  wolf.invuln = 0;
  E.damage(wolf, 6, wolf.x - 1, wolf.z, null);
  assert.equal(wolf.health, whp, 'la armadura se lo lleva todo');
  assert.equal(wolf.gearDmg, 10);
  h.gs.flush(true);
  const h2 = makeServer(6161, store);
  const back = [...h2.gs.entities.list.values()];
  assert.ok(back.some((e) => e.type === MOB_HORSE && e.gear === HORSE_ARMOR.iron), 'el caballo la conserva');
  assert.ok(back.some((e) => e.type === MOB_WOLF && e.gear === WOLF_ARMOR && e.gearDmg === 10), 'y el lobo');
  // Con tijeras se le quita (con su desgaste).
  c.send({ t: 'interact', e: wolf.id, item: SHEARS, q: 4 });
  const r = ires(c, 4);
  assert.deepEqual(r?.give, { id: WOLF_ARMOR, count: 1, dmg: 10 });
  assert.equal(r?.wear, 1);
  assert.equal(wolf.gear, undefined);
  // Agachado y con la mano vacía, se le quita la del caballo.
  c.pos(bx + 0.5, by, bz + 0.5, STATE_SNEAK);
  c.send({ t: 'interact', e: horse.id, item: 0, q: 5 });
  assert.equal(ires(c, 5)?.give?.id, HORSE_ARMOR.iron);
  // Un lobo ajeno no la admite.
  const stray = E.spawnMob(MOB_WOLF, bx - 5.5, by, bz + 0.5)!;
  stray.tamedBy = 'otro';
  c.send({ t: 'interact', e: stray.id, item: WOLF_ARMOR, q: 6 });
  assert.equal(ires(c, 6)?.ok, false);
  // Al romperse la armadura del lobo, desaparece.
  const w3 = E.spawnMob(MOB_WOLF, bx - 6.5, by, bz - 3.5)!;
  w3.gear = WOLF_ARMOR;
  w3.gearDmg = 62;
  E.damage(w3, 4, w3.x - 1, w3.z, null);
  assert.equal(w3.gear, undefined);
});

test('servidor: caña con zanahoria (el cerdo va hacia donde mira el jinete) y acelerón', () => {
  const { h, c, bx, by, bz } = platform();
  const pig = h.gs.entities.spawnMob(MOB_PIG, bx + 1.5, by, bz + 0.5)!;
  pig.saddled = true;
  c.send({ t: 'mount', e: pig.id });
  assert.equal(pig.rider, c.welcome.id);
  // Mirando al este (yaw −π/2 → dirección +X) con la caña en la mano.
  const look = () => c.send({ t: 'pos', p: [pig.x, pig.y + 0.3, pig.z], r: [-Math.PI / 2, 0], s: 0, h: CARROT_ON_A_STICK, o: 0, a: [0, 0, 0, 0] });
  const x0 = pig.x;
  for (let i = 0; i < 12; i++) {
    look();
    h.tick(5);
  }
  assert.ok(pig.x > x0 + 3, `va hacia el este (${(pig.x - x0).toFixed(1)} bloques)`);
  c.send({ t: 'boost', q: 7 });
  const r = ires(c, 7);
  assert.ok(r?.ok && r.wear === 7, 'el acelerón gasta la caña');
  c.send({ t: 'boost', q: 8 });
  assert.equal(ires(c, 8)?.ok, false, 'no dos a la vez');
});

test('servidor: cuerno de cabra (se oye lejos, con enfriamiento) y cabras que pierden cuernos', () => {
  const { h, c, bx, by, bz } = platform();
  const other = h.join('Oyente');
  other.pos(bx + 100.5, by, bz + 0.5);
  other.conn.msgs = [];
  c.send({ t: 'horn', v: 3 });
  const heard = other.conn.take('fx').find((m) => m.k === 'goat_horn');
  assert.ok(heard && heard.a === 3, 'se oye a 100 bloques');
  c.send({ t: 'horn', v: 3 });
  assert.equal(other.conn.take('fx').filter((m) => m.k === 'goat_horn').length, 0, 'enfriamiento');
  // Cabra embistiendo contra la piedra.
  const W = h.gs.world;
  for (let y = by; y < by + 3; y++) W.setBlock(bx + 5, y, bz - 4, STONE);
  const goat = h.gs.entities.spawnMob(MOB_GOAT, bx + 2.5, by, bz - 3.5)!;
  goat.horns = 2;
  goat.ramT = 1.6;
  goat.ramDir = [1, 0];
  h.tick(40);
  assert.equal(itemsOf(h, GOAT_HORN), 1, 'se le cae un cuerno');
  assert.equal(goat.horns, 1);
  const horn = [...h.gs.entities.list.values()].find((e) => e.type === ENT_ITEM && e.stack?.id === GOAT_HORN)!;
  assert.ok((horn.stack!.dmg ?? 0) >= 1, 'con su tonada');
});

test('servidor: cohetes (suben y estallan con sus colores)', () => {
  const { h, c, bx, by, bz } = platform();
  const data = fireworkData(1, (1 << 14) | (1 << 3));
  c.send({ t: 'throw', item: FIREWORK_ROCKET, p: [bx + 2.5, by + 0.1, bz + 0.5], d: [0, 1, 0], w: data });
  const rocket = [...h.gs.entities.list.values()].find((e) => e.type === ENT_FIREWORK)!;
  assert.ok(rocket, 'sale el cohete');
  c.conn.msgs = [];
  h.tick(60);
  assert.ok(!h.gs.entities.list.has(rocket.id), 'ya estalló');
  const boom = c.conn.take('fx').find((m) => m.k === 'firework_burst');
  assert.ok(boom && boom.a === ((1 << 14) | (1 << 3)) && boom.b === 2, 'estallido con sus dos colores');
  assert.ok(boom.p[1] > by + 6, `en lo alto (${boom.p[1] - by} bloques)`);
});

test('servidor: conducto con marco de prismarina da Poder del conducto en el agua', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  const cx = bx, cy = by + 3, cz = bz;
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) for (let dz = -3; dz <= 3; dz++) W.setBlock(cx + dx, cy + dy, cz + dz, WATER);
  W.setBlock(cx, cy, cz, stateOf(CONDUIT, { water: 1, active: 0 }));
  let n = 0;
  for (const [dx, dy, dz] of CONDUIT_FRAME) {
    if (n >= 16) break;
    W.setBlock(cx + dx, cy + dy, cz + dz, PRISMARINE);
    n++;
  }
  assert.equal(h.gs.sys.conduits.frameAt(cx, cy, cz), 16);
  c.pos(cx + 1.5, cy - 1, cz + 1.5);
  c.conn.msgs = [];
  h.tick(45);
  assert.equal(stateProps(W.getBlock(cx, cy, cz))!.active, 1, 'se enciende');
  const fx = c.conn.take('effect').find((m) => m.id === EFFECT_CONDUIT_POWER);
  assert.ok(fx && fx.s > 10, 'da el efecto');
  // Sin marco se apaga.
  for (const [dx, dy, dz] of CONDUIT_FRAME) W.setBlock(cx + dx, cy + dy, cz + dz, WATER);
  h.tick(45);
  assert.equal(stateProps(W.getBlock(cx, cy, cz))!.active, 0);
  assert.ok(EFFECT_WATER_BREATHING > 0);
});

// Fase 7: el conducto puesto en seco no se anega con el agua que corre (como en Minecraft), sino
// vaciando un cubo de agua encima; el dispensador también lo anega y lo vacía.
import { withWater, conduitActive, STONE as STONE_B, WATER as WATER_B, AIR as AIR_B } from '../src/shared/blocks';
import { WATER_BUCKET as WATER_BUCKET_I } from '../src/shared/items';
test('conducto en seco: el cubo de agua lo anega', () => {
  const dry = conduitActive(CONDUIT, true);
  const wet = withWater(dry, true);
  assert.ok(isConduit(wet) && isWaterlogged(wet) && conduitActive(wet, true) === wet, 'anegado y sigue encendido');
  assert.equal(withWater(wet, true), 0, 'ya lo está');
  assert.equal(withWater(wet, false), dry);
  assert.equal(withWater(STONE_B, true), 0, 'la piedra no se anega');
  const h = makeServer(4242);
  const c = h.join('Buzo', 'c');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(20);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz);
  const W = h.gs.world;
  W.setBlock(bx, by - 1, bz, STONE_B);
  W.setBlock(bx, by, bz, AIR_B);
  c.pos(bx + 0.5, by, bz + 2.5);
  h.tick(2);
  W.setBlock(bx, by, bz, CONDUIT);
  c.send({ t: 'set', x: bx, y: by, z: bz, b: WATER_B, tool: WATER_BUCKET_I });
  const got = W.getBlock(bx, by, bz);
  assert.ok(isConduit(got) && isWaterlogged(got), 'el cubo anega el conducto');
});
