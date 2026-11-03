// Fase 7 (pociones): la tabla de destilación completa, el alambique (combustible, tiempo, frascos), los
// frascos con el caldero, los efectos nuevos (invisibilidad, supersalto, caída lenta, curación y daño
// a los no muertos), las arrojadizas y la nube persistente, las flechas con efecto y la bruja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIR, STONE, CAULDRON, BREWING_STAND, isBrewingStand, brewingStandMask, cauldronFill, cauldronOf, CAULDRON_WATER, isContainer } from '../src/shared/blocks';
import {
  ITEMS, POTION, SPLASH_POTION, LINGERING_POTION, TIPPED_ARROW, GLASS_BOTTLE, NETHER_WART, REDSTONE, GLOWSTONE_DUST,
  FERMENTED_SPIDER_EYE, GUNPOWDER, DRAGON_BREATH, SUGAR, GLISTERING_MELON_SLICE, SPIDER_EYE, GHAST_TEAR, BLAZE_POWDER,
  BLAZE_ROD, MAGMA_CREAM, RABBIT_FOOT, GOLDEN_CARROT, PUFFERFISH, TURTLE_HELMET, PHANTOM_MEMBRANE, ARROW, SLIME_BALL,
  ITEM_SPRITES, itemSpriteIndex, CREATIVE_ITEMS,
} from '../src/shared/items';
import { COBBLESTONE, BROWN_MUSHROOM, GLOWSTONE } from '../src/shared/blocks';
import {
  POTIONS, PT_WATER, PT_MUNDANE, PT_THICK, PT_AWKWARD, PT_NIGHT_VISION, PT_LONG_NIGHT_VISION, PT_INVISIBILITY, PT_LONG_INVISIBILITY,
  PT_LEAPING, PT_LONG_LEAPING, PT_STRONG_LEAPING, PT_FIRE_RESISTANCE, PT_LONG_FIRE_RESISTANCE, PT_SWIFTNESS, PT_LONG_SWIFTNESS,
  PT_STRONG_SWIFTNESS, PT_SLOWNESS, PT_LONG_SLOWNESS, PT_STRONG_SLOWNESS, PT_TURTLE_MASTER, PT_LONG_TURTLE_MASTER,
  PT_STRONG_TURTLE_MASTER, PT_WATER_BREATHING, PT_LONG_WATER_BREATHING, PT_HEALING, PT_STRONG_HEALING, PT_HARMING,
  PT_STRONG_HARMING, PT_POISON, PT_LONG_POISON, PT_STRONG_POISON, PT_REGENERATION, PT_LONG_REGENERATION, PT_STRONG_REGENERATION,
  PT_STRENGTH, PT_LONG_STRENGTH, PT_STRONG_STRENGTH, PT_WEAKNESS, PT_LONG_WEAKNESS, PT_LUCK, PT_SLOW_FALLING, PT_LONG_SLOW_FALLING,
  POTION_TYPE_COUNT, ENT_EFFECT_CLOUD, EF_INVISIBLE, STATE_INVISIBLE, brewResult, isBrewIngredient, potionStack, potionType,
  potionName, potionEffects, stackName, tippedArrowCraft, CREATIVE_POTIONS, potionColor,
} from '../src/shared/potions';
import {
  BREW_FUEL, BREW_INGREDIENT, BREW_TIME, BREW_FUEL_USES, brewTick, brewClick, brewInsert, brewCanPlace, containerFill,
} from '../src/shared/brewing';
import { newContainer, containerToWire, containerFromWire } from '../src/shared/containers';
import { cauldronUse } from '../src/shared/cauldronUse';
import { matchRecipe } from '../src/shared/recipes';
import {
  EFFECTS, EFFECT_INVISIBILITY, EFFECT_JUMP_BOOST, EFFECT_SLOW_FALLING, EFFECT_SLOWNESS, EFFECT_POISON, EFFECT_SPEED,
  EFFECT_INSTANT_HEALTH, EFFECT_INSTANT_DAMAGE, EFFECT_REGENERATION, EFFECT_LUCK, EFFECT_UNLUCK, EFFECT_FIRE_RESISTANCE, jumpBoostVelocity,
} from '../src/shared/effects';
import { MOB_PIG, MOB_ZOMBIE, MOB_COW, MOB_WITCH, ENT_ARROW, ENT_THROWN, MOB_SKELETON } from '../src/shared/mobs';
import { StatusEffects } from '../src/client/game/statusEffects';
import { Survival } from '../src/client/game/Survival';
import { Player } from '../src/client/game/Player';
import { generateItemSprites } from '../src/client/textures/itemSprites';
import { POTION_VARIANTS, potionSpriteLayer, potionIconKey } from '../src/client/textures/potionSprites';
import { fishingLoot } from '../src/shared/fishing';
import { makeServer, type Harness, type Client } from './harness';

/** Destila `type` (frasco) con `ingredient`; -1 si no cambia. */
const brewOf = (ingredient: number, type: number, kind: 'drink' | 'splash' | 'lingering' = 'drink') => {
  const out = brewResult(ingredient, potionStack(kind, type));
  return out ? potionType(out) : -1;
};

test('pociones: tabla de destilación completa (como en Minecraft)', () => {
  // Del agua.
  assert.equal(brewOf(NETHER_WART, PT_WATER), PT_AWKWARD);
  assert.equal(brewOf(GLOWSTONE_DUST, PT_WATER), PT_THICK);
  assert.equal(brewOf(FERMENTED_SPIDER_EYE, PT_WATER), PT_WEAKNESS);
  for (const i of [REDSTONE, SUGAR, GLISTERING_MELON_SLICE, SPIDER_EYE, GHAST_TEAR, BLAZE_POWDER, MAGMA_CREAM, RABBIT_FOOT]) {
    assert.equal(brewOf(i, PT_WATER), PT_MUNDANE, `${ITEMS[i].key} → mundana`);
  }
  // De la rara.
  const awkward: [number, number][] = [
    [GOLDEN_CARROT, PT_NIGHT_VISION], [MAGMA_CREAM, PT_FIRE_RESISTANCE], [RABBIT_FOOT, PT_LEAPING], [SUGAR, PT_SWIFTNESS],
    [TURTLE_HELMET, PT_TURTLE_MASTER], [PUFFERFISH, PT_WATER_BREATHING], [GLISTERING_MELON_SLICE, PT_HEALING], [SPIDER_EYE, PT_POISON],
    [GHAST_TEAR, PT_REGENERATION], [BLAZE_POWDER, PT_STRENGTH], [PHANTOM_MEMBRANE, PT_SLOW_FALLING],
  ];
  for (const [i, t] of awkward) assert.equal(brewOf(i, PT_AWKWARD), t, `rara + ${ITEMS[i].key}`);
  // Alargadas (redstone).
  const longer: [number, number][] = [
    [PT_NIGHT_VISION, PT_LONG_NIGHT_VISION], [PT_INVISIBILITY, PT_LONG_INVISIBILITY], [PT_LEAPING, PT_LONG_LEAPING],
    [PT_FIRE_RESISTANCE, PT_LONG_FIRE_RESISTANCE], [PT_SWIFTNESS, PT_LONG_SWIFTNESS], [PT_SLOWNESS, PT_LONG_SLOWNESS],
    [PT_TURTLE_MASTER, PT_LONG_TURTLE_MASTER], [PT_WATER_BREATHING, PT_LONG_WATER_BREATHING], [PT_POISON, PT_LONG_POISON],
    [PT_REGENERATION, PT_LONG_REGENERATION], [PT_STRENGTH, PT_LONG_STRENGTH], [PT_WEAKNESS, PT_LONG_WEAKNESS],
    [PT_SLOW_FALLING, PT_LONG_SLOW_FALLING],
  ];
  for (const [a, b] of longer) assert.equal(brewOf(REDSTONE, a), b, `${POTIONS[a].key} + redstone`);
  // Reforzadas (piedra luminosa).
  const stronger: [number, number][] = [
    [PT_LEAPING, PT_STRONG_LEAPING], [PT_SWIFTNESS, PT_STRONG_SWIFTNESS], [PT_SLOWNESS, PT_STRONG_SLOWNESS],
    [PT_TURTLE_MASTER, PT_STRONG_TURTLE_MASTER], [PT_HEALING, PT_STRONG_HEALING], [PT_HARMING, PT_STRONG_HARMING],
    [PT_POISON, PT_STRONG_POISON], [PT_REGENERATION, PT_STRONG_REGENERATION], [PT_STRENGTH, PT_STRONG_STRENGTH],
  ];
  for (const [a, b] of stronger) assert.equal(brewOf(GLOWSTONE_DUST, a), b, `${POTIONS[a].key} + piedra luminosa`);
  // Corrompidas (ojo fermentado).
  const corrupt: [number, number][] = [
    [PT_NIGHT_VISION, PT_INVISIBILITY], [PT_LONG_NIGHT_VISION, PT_LONG_INVISIBILITY], [PT_SWIFTNESS, PT_SLOWNESS],
    [PT_LONG_SWIFTNESS, PT_LONG_SLOWNESS], [PT_LEAPING, PT_SLOWNESS], [PT_LONG_LEAPING, PT_LONG_SLOWNESS], [PT_HEALING, PT_HARMING],
    [PT_STRONG_HEALING, PT_STRONG_HARMING], [PT_POISON, PT_HARMING], [PT_LONG_POISON, PT_HARMING], [PT_STRONG_POISON, PT_STRONG_HARMING],
  ];
  for (const [a, b] of corrupt) assert.equal(brewOf(FERMENTED_SPIDER_EYE, a), b, `${POTIONS[a].key} + ojo fermentado`);
  // Lo que no se puede: alargar la curación, reforzar la visión nocturna, la suerte (sólo creativo).
  assert.equal(brewOf(REDSTONE, PT_HEALING), -1);
  assert.equal(brewOf(GLOWSTONE_DUST, PT_NIGHT_VISION), -1);
  assert.equal(brewOf(REDSTONE, PT_LONG_STRENGTH), -1, 'alargar dos veces no hace nada');
  for (let t = 0; t < POTION_TYPE_COUNT; t++) {
    for (const i of [NETHER_WART, REDSTONE, GLOWSTONE_DUST, FERMENTED_SPIDER_EYE, SUGAR]) assert.notEqual(brewOf(i, t), PT_LUCK, 'la suerte no se destila');
  }
  // Pólvora: arrojadiza (conserva el tipo); aliento de dragón: de arrojadiza a persistente.
  const splash = brewResult(GUNPOWDER, potionStack('drink', PT_STRENGTH))!;
  assert.deepEqual([splash.id, potionType(splash)], [SPLASH_POTION, PT_STRENGTH]);
  const lingering = brewResult(DRAGON_BREATH, splash)!;
  assert.deepEqual([lingering.id, potionType(lingering)], [LINGERING_POTION, PT_STRENGTH]);
  assert.equal(brewResult(DRAGON_BREATH, potionStack('drink', PT_STRENGTH)), null, 'el aliento sólo sobre arrojadizas');
  assert.equal(brewResult(GUNPOWDER, splash), null);
  assert.equal(brewOf(REDSTONE, PT_POISON, 'splash'), PT_LONG_POISON, 'las arrojadizas también se mejoran');
  assert.equal(brewResult(NETHER_WART, { id: GLASS_BOTTLE, count: 1 }), null, 'el frasco vacío no cambia');
  // Ingredientes que acepta el alambique.
  for (const i of [NETHER_WART, REDSTONE, GLOWSTONE_DUST, FERMENTED_SPIDER_EYE, GUNPOWDER, DRAGON_BREATH, PHANTOM_MEMBRANE]) assert.ok(isBrewIngredient(i));
  assert.ok(!isBrewIngredient(ARROW) && !isBrewIngredient(SLIME_BALL));
});

test('pociones: nombres, efectos, colores, recetas y creativo', () => {
  assert.equal(potionName('drink', PT_WATER), 'Frasco de agua');
  assert.equal(potionName('drink', PT_AWKWARD), 'Poción rara');
  assert.equal(potionName('splash', PT_HEALING), 'Poción arrojadiza de curación');
  assert.equal(potionName('lingering', PT_TURTLE_MASTER), 'Poción persistente del maestro tortuga');
  assert.equal(potionName('arrow', PT_POISON), 'Flecha de veneno');
  assert.equal(stackName({ id: POTION, count: 1, dmg: PT_SLOW_FALLING }), 'Poción de caída lenta');
  // Duraciones (persistente ¼, flecha ⅛) y niveles.
  assert.deepEqual(potionEffects(PT_STRONG_SWIFTNESS), [[EFFECT_SPEED, 90, 1]]);
  assert.deepEqual(potionEffects(PT_POISON, 'lingering'), [[EFFECT_POISON, 11.25, 0]]);
  assert.deepEqual(potionEffects(PT_SLOWNESS, 'arrow'), [[EFFECT_SLOWNESS, 11.25, 0]]);
  assert.equal(potionEffects(PT_STRONG_TURTLE_MASTER)[0][2], 5, 'Lentitud VI');
  assert.deepEqual(potionEffects(PT_LUCK), [[EFFECT_LUCK, 300, 0]]);
  // Efectos nuevos con nombre, color e instantáneos.
  for (const id of [EFFECT_JUMP_BOOST, EFFECT_INVISIBILITY, EFFECT_SLOW_FALLING, EFFECT_LUCK, EFFECT_UNLUCK]) assert.ok(EFFECTS[id] && !EFFECTS[id].instant);
  assert.ok(EFFECTS[EFFECT_INSTANT_HEALTH].instant && EFFECTS[EFFECT_INSTANT_DAMAGE].instant);
  // Colores distintos para las que tienen efecto; el agua y las bases, azules.
  assert.deepEqual(potionColor(PT_MUNDANE), potionColor(PT_WATER));
  assert.notDeepEqual(potionColor(PT_HEALING), potionColor(PT_POISON));
  // Pila: el tipo va en dmg (0 = agua, sin dmg).
  assert.deepEqual(potionStack('drink', PT_WATER), { id: POTION, count: 1 });
  assert.equal(potionType({ id: POTION, count: 1, dmg: 999 }), PT_WATER, 'tipo desconocido: agua');
  // Recetas.
  assert.equal(matchRecipe([0, BLAZE_ROD, 0, COBBLESTONE, COBBLESTONE, COBBLESTONE, 0, 0, 0], 3)?.out.id, BREWING_STAND);
  assert.deepEqual(matchRecipe([BLAZE_ROD, 0, 0, 0], 2)?.out, { id: BLAZE_POWDER, count: 2 });
  assert.equal(matchRecipe([BLAZE_POWDER, SLIME_BALL, 0, 0], 2)?.out.id, MAGMA_CREAM);
  assert.equal(matchRecipe([SPIDER_EYE, BROWN_MUSHROOM, SUGAR, 0, 0, 0, 0, 0, 0], 3)?.out.id, FERMENTED_SPIDER_EYE);
  assert.equal(matchRecipe([GLOWSTONE_DUST, GLOWSTONE_DUST, GLOWSTONE_DUST, GLOWSTONE_DUST], 2)?.out.id, GLOWSTONE);
  // Flechas con efecto: persistente en el centro y ocho flechas.
  const grid = Array.from({ length: 9 }, (_, i) => (i === 4 ? potionStack('lingering', PT_POISON) : { id: ARROW, count: 1 }));
  assert.deepEqual(tippedArrowCraft(grid), { id: TIPPED_ARROW, count: 8, dmg: PT_POISON });
  grid[4] = potionStack('splash', PT_POISON);
  assert.equal(tippedArrowCraft(grid), null, 'hace falta una persistente');
  // Creativo: frascos, arrojadizas y persistentes de todos los tipos (con la suerte) y los ingredientes.
  assert.ok(CREATIVE_POTIONS.some((s) => s.id === POTION && potionType(s) === PT_LUCK));
  assert.ok(CREATIVE_POTIONS.some((s) => s.id === TIPPED_ARROW && potionType(s) === PT_STRONG_HARMING));
  for (const i of [NETHER_WART, BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, GHAST_TEAR, DRAGON_BREATH, FERMENTED_SPIDER_EYE, GLOWSTONE_DUST]) {
    assert.ok(CREATIVE_ITEMS.includes(i), ITEMS[i].key);
  }
  assert.ok(isContainer(BREWING_STAND));
});

test('pociones: sprites de los frascos, de cada tipo y de los ingredientes (no el marcador)', () => {
  const sprites = generateItemSprites();
  assert.equal(sprites.count, ITEM_SPRITES.length + POTION_VARIANTS.length);
  const layer = sprites.size * sprites.size * 4;
  const drawn = (i: number) => {
    let opaque = 0, marker = 0;
    for (let k = 0; k < layer; k += 4) {
      const o = i * layer + k;
      if (sprites.rgba[o + 3] === 255) opaque++;
      if (sprites.rgba[o] === 200 && sprites.rgba[o + 1] === 40 && sprites.rgba[o + 2] === 200) marker++;
    }
    return opaque > 25 && marker === 0;
  };
  for (const it of [POTION, SPLASH_POTION, LINGERING_POTION, TIPPED_ARROW, NETHER_WART, BLAZE_ROD, BLAZE_POWDER, MAGMA_CREAM, GHAST_TEAR,
    DRAGON_BREATH, FERMENTED_SPIDER_EYE, GLOWSTONE_DUST, BREWING_STAND]) {
    assert.ok(itemSpriteIndex(it) >= 0 && drawn(itemSpriteIndex(it)), ITEMS[it].key);
  }
  const healing = potionSpriteLayer(POTION, PT_HEALING);
  assert.ok(healing >= ITEM_SPRITES.length && drawn(healing), 'poción de curación con su dibujo');
  assert.equal(potionSpriteLayer(POTION, PT_WATER), itemSpriteIndex(POTION), 'el agua usa el dibujo base');
  assert.notEqual(potionIconKey({ id: SPLASH_POTION, count: 1, dmg: PT_HEALING }), potionIconKey({ id: POTION, count: 1, dmg: PT_HEALING }));
});

test('alambique: combustible, 20 s por destilación, tres frascos y el comparador', () => {
  const c = newContainer('brewing');
  assert.equal(c.slots.length, 5);
  // Qué va en cada hueco.
  assert.ok(brewCanPlace(0, { id: GLASS_BOTTLE, count: 1 }) && brewCanPlace(2, potionStack('splash', PT_POISON)));
  assert.ok(!brewCanPlace(0, { id: ARROW, count: 1 }) && !brewCanPlace(BREW_FUEL, { id: REDSTONE, count: 1 }));
  assert.ok(brewCanPlace(BREW_INGREDIENT, { id: NETHER_WART, count: 5 }) && !brewCanPlace(BREW_INGREDIENT, { id: POTION, count: 1 }));
  // Los huecos de frasco admiten uno (clic derecho con varios frascos vacíos).
  const cur = brewClick(c, 0, 0, { id: GLASS_BOTTLE, count: 3 });
  assert.deepEqual([c.slots[0]?.count, cur?.count], [1, 2]);
  c.slots[0] = null;
  // Mayúsculas: el polvo de blaze, al combustible; las pociones, a los frascos.
  assert.equal(brewInsert(c, { id: BLAZE_POWDER, count: 2 }), null);
  assert.equal(c.slots[BREW_FUEL]?.count, 2);
  for (let i = 0; i < 3; i++) assert.equal(brewInsert(c, potionStack('drink', PT_WATER)), null);
  assert.ok(brewInsert(c, potionStack('drink', PT_WATER)), 'no cabe un cuarto frasco');
  brewInsert(c, { id: NETHER_WART, count: 2 });
  assert.equal(c.slots[BREW_INGREDIENT]?.count, 2);
  // Destilar: gasta un polvo (20 usos) y tarda 20 s.
  const fill = containerFill(c);
  assert.ok(fill > 0 && fill <= 15, `comparador ${fill}`);
  let done = 0;
  for (let t = 0; t < BREW_TIME - 1; t += 0.05) if (brewTick(c, 0.05).done) done++;
  assert.equal(done, 0, 'aún no');
  assert.equal(c.slots[BREW_FUEL]?.count, 1, 'un polvo de blaze gastado');
  assert.equal(c.burn, BREW_FUEL_USES - 1);
  for (let t = 0; t < 1.5; t += 0.05) if (brewTick(c, 0.05).done) done++;
  assert.equal(done, 1);
  assert.deepEqual([0, 1, 2].map((i) => potionType(c.slots[i])), [PT_AWKWARD, PT_AWKWARD, PT_AWKWARD]);
  assert.equal(c.slots[BREW_INGREDIENT]?.count, 1, 'gasta un ingrediente');
  // Sin nada que cambiar no destila; si se quita el ingrediente a medias, se para.
  c.slots[BREW_INGREDIENT] = { id: SUGAR, count: 1 };
  brewTick(c, 0.05);
  assert.ok(c.cook > 0);
  c.slots[BREW_INGREDIENT] = null;
  brewTick(c, 0.05);
  assert.equal(c.cook, 0, 'se para');
  c.slots[BREW_INGREDIENT] = { id: REDSTONE, count: 1 };
  brewTick(c, 0.05);
  assert.equal(c.cook, 0, 'rara + redstone: no destila');
  // Se guarda y se envía.
  const back = containerFromWire(containerToWire(c))!;
  assert.deepEqual([back.kind, back.slots.length, potionType(back.slots[1])], ['brewing', 5, PT_AWKWARD]);
  assert.equal(containerFill(newContainer('brewing')), 0);
});

/** Plataforma de piedra despejada junto al punto de aparición. */
function platform(h: Harness, c: Client): { bx: number; by: number; bz: number } {
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 30; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 3.5);
  h.tick(2);
  return { bx, by, bz };
}

test('servidor: alambique (abrir, meter, destilar, frascos en el bloque y aviso al terminar)', () => {
  const h = makeServer(9191);
  const c = h.join('Alquimista');
  const { bx, by, bz } = platform(h, c);
  const W = h.gs.world;
  W.setBlock(bx, by, bz, BREWING_STAND);
  c.send({ t: 'open', x: bx, y: by, z: bz });
  const open = c.conn.take('cont')[0];
  assert.equal(open?.c.k, 'b', 'se abre como alambique');
  let q = 1;
  const put = (stack: object) => c.send({ t: 'cput', x: bx, y: by, z: bz, stack, q: q++ });
  put({ id: BLAZE_POWDER, count: 1 });
  put({ id: POTION, count: 1 });
  put({ id: POTION, count: 1 });
  put({ id: NETHER_WART, count: 1 });
  h.tick(2);
  assert.ok(isBrewingStand(W.getBlock(bx, by, bz)));
  assert.equal(brewingStandMask(W.getBlock(bx, by, bz)), 0b011, 'se ven dos frascos');
  c.conn.msgs = [];
  h.tick(20 * BREW_TIME + 10);
  const fx = c.conn.take('fx').filter((m) => m.k === 'brew_done');
  assert.equal(fx.length, 1, 'avisa al terminar');
  const last = c.conn.take('cont').pop();
  const slots = containerFromWire(last.c)!.slots;
  assert.deepEqual([potionType(slots[0]), potionType(slots[1]), slots[2], slots[BREW_INGREDIENT]], [PT_AWKWARD, PT_AWKWARD, null, null]);
  // Al romperlo suelta lo que tenía.
  W.setBlock(bx, by, bz, AIR);
  h.tick(1);
  const drops = [...h.gs.entities.list.values()].filter((e) => e.stack?.id === POTION);
  assert.equal(drops.length, 2);
});

test('frascos y caldero: llenar (baja un nivel) y vaciar (sube)', () => {
  const r = cauldronUse(cauldronOf(CAULDRON_WATER, 3), { id: GLASS_BOTTLE, count: 5 })!;
  assert.deepEqual([cauldronFill(r.block), r.take, potionType(r.give!), r.give!.id], [{ kind: CAULDRON_WATER, level: 2 }, 1, PT_WATER, POTION]);
  const back = cauldronUse(CAULDRON, potionStack('drink', PT_WATER))!;
  assert.deepEqual([cauldronFill(back.block), back.held], [{ kind: CAULDRON_WATER, level: 1 }, { id: GLASS_BOTTLE, count: 1 }]);
  assert.equal(cauldronUse(cauldronOf(CAULDRON_WATER, 3), potionStack('drink', PT_WATER)), null, 'lleno no cabe más');
  assert.equal(cauldronUse(CAULDRON, potionStack('drink', PT_STRENGTH)), null, 'sólo el agua');
  // En el servidor.
  const h = makeServer(9292);
  const c = h.join('Aguadora');
  const { bx, by, bz } = platform(h, c);
  const W = h.gs.world;
  W.setBlock(bx, by, bz, cauldronOf(CAULDRON_WATER, 3));
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: GLASS_BOTTLE });
  assert.deepEqual(cauldronFill(W.getBlock(bx, by, bz)), { kind: CAULDRON_WATER, level: 2 });
  c.send({ t: 'use', x: bx, y: by, z: bz, yaw: 0, item: POTION });
  assert.deepEqual(cauldronFill(W.getBlock(bx, by, bz)), { kind: CAULDRON_WATER, level: 3 });
});

test('efectos en el jugador: instantáneos, supersalto y caída lenta', () => {
  const fx = new StatusEffects();
  const s = new Survival();
  s.health = 10;
  fx.add(EFFECT_INSTANT_HEALTH, 1, 1, s);
  assert.equal(s.health, 18, 'Curación instantánea II: 8');
  assert.equal(fx.list.size, 0, 'los instantáneos no se quedan');
  fx.add(EFFECT_INSTANT_DAMAGE, 0.5, 0, s);
  assert.equal(s.health, 15, 'Daño instantáneo I a media fuerza: 3');
  // Supersalto: salta más alto.
  const jump = (boost: number) => {
    const p = new Player();
    const world = { getBlock: (_x: number, y: number) => (y < 100 ? STONE : AIR) };
    p.x = 0.5; p.y = 100; p.z = 0.5;
    p.jumpBoost = boost;
    const ctl = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
    for (let i = 0; i < 10; i++) p.update(0.05, ctl, world);
    let top = p.y;
    for (let i = 0; i < 40; i++) {
      p.update(0.05, { ...ctl, jump: i === 0 }, world);
      top = Math.max(top, p.y);
    }
    return top - 100;
  };
  const normal = jump(0), boosted = jump(jumpBoostVelocity(1));
  assert.ok(normal > 1 && normal < 1.6, `salto normal ${normal}`);
  assert.ok(boosted > normal + 1, `con Supersalto II ${boosted}`);
  // Caída lenta: cae despacio y sin acumular caída.
  const p = new Player();
  const world = { getBlock: (_x: number, y: number) => (y < 100 ? STONE : AIR) };
  p.x = 0.5; p.y = 130; p.z = 0.5;
  p.slowFall = true;
  const ctl = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false };
  for (let i = 0; i < 20; i++) p.update(0.05, ctl, world);
  assert.ok(p.y > 127, `baja despacio (${p.y})`);
  assert.equal(p.fallDistance, 0);
  fx.add(EFFECT_JUMP_BOOST, 30, 0);
  fx.add(EFFECT_SLOW_FALLING, 30, 0);
  fx.add(EFFECT_INVISIBILITY, 30, 0);
  assert.deepEqual([fx.jumpAmp, fx.slowFalling, fx.invisible], [0, true, true]);
  assert.ok(fx.swirlColor);
});

test('efectos en las criaturas: invisibilidad, lentitud, caída lenta y curación/daño en los no muertos', () => {
  const h = makeServer(9393);
  const c = h.join('Boticaria');
  const { bx, by, bz } = platform(h, c);
  const E = h.gs.entities;
  // Invisible: el bit de estado.
  const pig = E.spawnMob(MOB_PIG, bx + 0.5, by, bz + 0.5)!;
  E.effects.add(pig, EFFECT_INVISIBILITY, 5, 0);
  h.tick(2);
  assert.ok(pig.flags & EF_INVISIBLE, 'cerdo invisible');
  h.tick(20 * 6);
  assert.ok(!(pig.flags & EF_INVISIBLE), 'se le pasa');
  // Caída lenta: sin daño desde 20 bloques.
  const cow = E.spawnMob(MOB_COW, bx + 4.5, by + 20, bz + 0.5)!;
  E.effects.add(cow, EFFECT_SLOW_FALLING, 60, 0);
  const hp = cow.health;
  for (let i = 0; i < 20 * 30 && !cow.onGround; i++) h.tick(1);
  h.tick(5);
  assert.ok(cow.onGround && cow.health === hp, `aterriza sin daño (${cow.health}/${hp})`);
  // Lentitud: su paso se multiplica.
  E.effects.add(cow, EFFECT_SLOWNESS, 30, 3);
  h.tick(1);
  assert.ok((cow.speedMul ?? 1) < 0.5, `lentitud IV (${cow.speedMul})`);
  // Curación y daño, al revés en los no muertos; el veneno no les afecta.
  const zombie = E.spawnMob(MOB_ZOMBIE, bx - 4.5, by, bz + 0.5)!;
  zombie.health = 10;
  E.effects.add(zombie, EFFECT_INSTANT_HEALTH, 0, 0);
  assert.equal(zombie.health, 4, 'la curación le hace daño');
  zombie.invuln = 0;
  E.effects.add(zombie, EFFECT_INSTANT_DAMAGE, 0, 0);
  assert.equal(zombie.health, 8, 'el daño le cura (4, como la curación a los demás)');
  E.effects.add(zombie, EFFECT_POISON, 30, 0);
  E.effects.add(zombie, EFFECT_REGENERATION, 30, 0);
  assert.equal(zombie.effects?.size ?? 0, 0, 'ni veneno ni regeneración');
  pig.health = 10;
  E.effects.add(pig, EFFECT_INSTANT_DAMAGE, 0, 0);
  assert.equal(pig.health, 4, 'daño instantáneo I: 6');
});

test('servidor: pociones arrojadizas (según la distancia) y persistentes (nube)', () => {
  const h = makeServer(9494);
  const c = h.join('Lanzadora');
  const { bx, by, bz } = platform(h, c);
  const E = h.gs.entities;
  // El jugador lanza una arrojadiza de lentitud a sus pies: le llega casi entera.
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(1);
  c.conn.msgs = [];
  c.send({ t: 'throw', item: SPLASH_POTION, p: [bx + 0.5, by + 1.5, bz + 0.5], d: [0, -1, 0], w: PT_SLOWNESS });
  const thrown = [...E.list.values()].find((e) => e.type === ENT_THROWN && e.stack?.id === SPLASH_POTION);
  assert.equal(thrown?.stack?.dmg, PT_SLOWNESS, 'sale con su tipo');
  h.tick(30);
  const eff = c.conn.take('effect').find((m) => m.id === EFFECT_SLOWNESS);
  assert.ok(eff && eff.s > 45 && eff.s <= 90, `lentitud según la distancia (${eff?.s})`);
  assert.ok(c.conn.take('fx').some((m) => m.k === 'potion_break'));
  // Una de daño junto a un cerdo y un zombi: al cerdo le hace daño y al zombi le cura.
  const pig = E.spawnMob(MOB_PIG, bx + 5.5, by, bz + 5.5)!;
  const zombie = E.spawnMob(MOB_ZOMBIE, bx + 6.5, by, bz + 5.5)!;
  zombie.health = 5;
  const p = E.spawnThrown(SPLASH_POTION, bx + 6, by + 1.2, bz + 5.5, 0, -5, 0, '', PT_HARMING);
  p.shooter = 'nadie';
  h.tick(10);
  assert.ok(pig.health < 10, `cerdo herido (${pig.health})`);
  assert.ok(zombie.health > 5, `zombi curado (${zombie.health})`);
  // Persistente: deja una nube que envenena a quien entra, encoge y se acaba.
  const cow = E.spawnMob(MOB_COW, bx - 4.5, by, bz - 4.5)!;
  const l = E.spawnThrown(LINGERING_POTION, bx - 4.5, by + 1, bz - 4.5, 0, -5, 0, '', PT_POISON);
  l.shooter = 'nadie';
  h.tick(5);
  const cloud = [...E.list.values()].find((e) => e.type === ENT_EFFECT_CLOUD);
  assert.ok(cloud, 'nube de efecto');
  h.tick(20);
  assert.ok(cow.effects?.has(EFFECT_POISON), 'la vaca, envenenada');
  assert.ok((cloud!.cloudRadius ?? 3) < 3, 'encoge al afectar');
  h.tick(20 * 32);
  assert.ok(!E.list.has(cloud!.id), 'se acaba');
});

test('servidor: flechas con efecto (arco y ballesta) y recogerlas', () => {
  const h = makeServer(9595);
  const c = h.join('Arquera');
  const { bx, by, bz } = platform(h, c);
  const E = h.gs.entities;
  const zombie = E.spawnMob(MOB_SKELETON, bx + 0.5, by, bz - 4.5)!;
  zombie.ai!.target = null;
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(1);
  c.send({ t: 'shoot', p: [bx + 0.5, by + 1.5, bz + 0.2], d: [0, 0, -1], f: 1, ap: PT_SLOWNESS });
  const arrow = [...E.list.values()].find((e) => e.type === ENT_ARROW);
  assert.equal(arrow?.arrowPotion, PT_SLOWNESS);
  for (let i = 0; i < 20 && !zombie.effects?.has(EFFECT_SLOWNESS); i++) h.tick(1);
  const fx = zombie.effects?.get(EFFECT_SLOWNESS);
  assert.ok(fx && fx.time > 9 && fx.time <= 11.25, `lentitud de flecha: ⅛ (${fx?.time})`);
  // Ballesta con flecha con efecto; se clava y al recogerla vuelve a ser la flecha de su tipo.
  c.send({ t: 'shoot', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [1, -0.4, 0], f: 1, c: 1, ap: PT_WEAKNESS });
  const bolt = [...E.list.values()].find((e) => e.type === ENT_ARROW && e.arrowPotion === PT_WEAKNESS)!;
  assert.ok(bolt);
  h.tick(40);
  assert.ok(bolt.stuck, 'clavada');
  c.pos(bolt.x, by, bolt.z);
  h.tick(1);
  c.send({ t: 'pickup', e: bolt.id });
  const picked = c.conn.take('picked')[0];
  assert.deepEqual(picked?.s, { id: TIPPED_ARROW, count: 1, dmg: PT_WEAKNESS });
  // Tipo inválido: flecha normal.
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(1);
  c.send({ t: 'shoot', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [0, 0, 1], f: 1, ap: 999 });
  const plain = [...E.list.values()].filter((e) => e.type === ENT_ARROW).pop()!;
  assert.equal(plain.arrowPotion, undefined);
});

test('servidor: jugador invisible (las criaturas lo ven de muy cerca) y la bruja con las pociones nuevas', () => {
  const h = makeServer(9696);
  const c = h.join('Fantasma');
  const { bx, by, bz } = platform(h, c);
  const E = h.gs.entities;
  const zombie = E.spawnMob(MOB_ZOMBIE, bx + 0.5, by, bz + 7.5)!;
  c.pos(bx + 0.5, by, bz - 0.5, STATE_INVISIBLE);
  h.tick(20);
  assert.equal(zombie.ai!.target, null, 'invisible a 8 bloques: no lo ve');
  c.pos(bx + 0.5, by, bz - 0.5, 0);
  h.tick(20);
  assert.equal(zombie.ai!.target, c.welcome.id, 'visible: va a por él');
  E.remove(zombie.id);
  // La bruja lanza pociones del catálogo nuevo (con su tipo) y bebe cuando lo necesita.
  const witch = E.spawnMob(MOB_WITCH, bx + 7.5, by, bz + 0.5)!;
  const types = new Set<number>();
  for (let i = 0; i < 400; i++) {
    h.tick(1);
    for (const e of E.list.values()) if (e.type === ENT_THROWN && e.shooter === witch.id) types.add(potionType(e.stack!));
  }
  assert.ok(types.size > 0, 'lanza pociones');
  for (const t of types) assert.ok([PT_HARMING, PT_POISON, PT_SLOWNESS, PT_WEAKNESS].includes(t), `lanza ${POTIONS[t].key}`);
  witch.fire = 5;
  h.tick(20 * 5);
  assert.ok(witch.effects?.has(EFFECT_FIRE_RESISTANCE), 'bebe resistencia al fuego al arder');
});

test('suerte: más tesoros al pescar (y menos con mala suerte)', () => {
  const treasure = new Set([ITEMS.findIndex((i) => i?.key === 'bow'), ITEMS.findIndex((i) => i?.key === 'nautilus_shell')]);
  const count = (luck: number) => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let n = 0;
    for (let i = 0; i < 6000; i++) if (treasure.has(fishingLoot(rand, luck).id)) n++;
    return n;
  };
  const base = count(0), lucky = count(3), unlucky = count(-2);
  assert.ok(lucky > base * 1.6, `con Suerte III, más tesoros (${lucky} frente a ${base})`);
  assert.ok(unlucky < base * 0.5, `con Mala suerte, menos (${unlucky})`);
});
