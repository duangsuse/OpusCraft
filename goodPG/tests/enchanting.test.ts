// Fase 7 (encantamientos): registro, mesa de encantamientos (librerías y ofertas), efectos (filo,
// eficiencia, toque de seda, fortuna, irrompibilidad, protección, caída de pluma, botín…), yunque
// (reparar, combinar, renombrar, coste), afiladora, pilas encantadas de ida y vuelta y el servidor
// (yunque que se deteriora, afiladora, Paso helado, Espinas, botella con experiencia, aldeanos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AIR, STONE, WATER, BOOKSHELF, ENCHANTING_TABLE, ANVIL, CHIPPED_ANVIL, DAMAGED_ANVIL, GRINDSTONE, FROSTED_ICE, IRON_ORE, DIAMOND_ORE,
  GLASS, ICE, OAK_LEAVES, GRAVEL, SHORT_GRASS, BLOCKS, isAnvil, isFrostedIce, anvilDamage, damagedAnvil,
} from '../src/shared/blocks';
import {
  ITEMS, TOOLS, ARMOR, BOOK, ENCHANTED_BOOK, EXPERIENCE_BOTTLE, IRON_INGOT, DIAMOND, RAW_IRON, EMERALD, NAME_TAG, BOW, TRIDENT,
  itemSpriteIndex, sameKind, type ItemStack,
} from '../src/shared/items';
import { OBSIDIAN, IRON_BLOCK } from '../src/shared/blocks';
import { matchRecipe } from '../src/shared/recipes';
import { stackToWire, stackFromWire } from '../src/shared/protocol';
import { sanitizeStack, cloneStack } from '../src/shared/containers';
import {
  ENCHANTS, ENCHANT_IDS, SHARPNESS, SMITE, EFFICIENCY, SILK_TOUCH, FORTUNE, UNBREAKING, PROTECTION, FIRE_PROTECTION,
  FEATHER_FALLING, LOOTING, MENDING, INFINITY, BINDING_CURSE, VANISHING_CURSE, THORNS, FROST_WALKER, DEPTH_STRIDER, LOYALTY,
  RIPTIDE, CHANNELING, MULTISHOT, PIERCING, canApply, compatible, enchantability, enchantsOf, storedOf, enchLevel,
  enchantName, enchantByName, hasGlint, withEnchants, enchantedBook, isEnchantable,
} from '../src/shared/enchantments';
import {
  JavaRandom, countBookshelves, tableOffers, tableEnchants, selectEnchantments, applyEnchants, canEnchantAtTable, librarianBook,
  enchantWithLevels, rndFrom, BOOKSHELF_OFFSETS, TABLE_POOL,
} from '../src/shared/enchanting';
import {
  meleeBonus, efficiencyBonus, unbreakingSaves, protectionPoints, applyProtection, sanitizeHeldEnchants, fishingWeights,
} from '../src/shared/enchantEffects';
import { anvilResult, grindstoneResult, grindstoneXp, repairCost, nextRepairCost, TOO_EXPENSIVE } from '../src/shared/anvil';
import { stackName } from '../src/shared/itemData';
import { enchantedBlockDrops, oreMultiplier } from '../src/shared/sim/enchantDrops';
import { blockDrops } from '../src/shared/sim/drops';
import { MOB_ZOMBIE, MOB_SPIDER, MOB_COW, ENT_XP, ENT_THROWN, ENT_FALLING } from '../src/shared/mobs';
import { offersFor, PROF_LIBRARIAN } from '../src/shared/villagers';
import { TEXTURE_DEFS } from '../src/shared/textureDefs';
import { makeServer, type Client, type Harness } from './harness';

/** Generador determinista para las pruebas. */
function lcg(seed = 7): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const sword = (ench: [number, number][] = [], dmg = 0): ItemStack =>
  withEnchants({ id: TOOLS.diamond.sword, count: 1, ...(dmg ? { dmg } : {}) }, ench);

test('registro: bloques, objetos, texturas, recetas y encantamientos', () => {
  for (const b of [ENCHANTING_TABLE, ANVIL, CHIPPED_ANVIL, DAMAGED_ANVIL, FROSTED_ICE]) assert.ok(BLOCKS[b], `bloque ${b}`);
  assert.ok(ITEMS[ENCHANTING_TABLE] && ITEMS[ANVIL] && ITEMS[CHIPPED_ANVIL] && ITEMS[DAMAGED_ANVIL]);
  assert.equal(ITEMS[FROSTED_ICE], undefined, 'el hielo escarchado no es un objeto');
  assert.equal(ITEMS[ENCHANTED_BOOK].stack, 1);
  for (const id of [ENCHANTED_BOOK, EXPERIENCE_BOTTLE]) assert.ok(itemSpriteIndex(id) >= 0, `sprite ${ITEMS[id].key}`);
  assert.ok(TEXTURE_DEFS.length <= 1024);
  for (const t of ['enchanting_table_top', 'anvil', 'damaged_anvil_top', 'frosted_ice_3']) assert.ok(TEXTURE_DEFS.some((d) => d.name === t), t);
  // Recetas de Minecraft.
  const O = OBSIDIAN, D = DIAMOND, I = IRON_INGOT, B = IRON_BLOCK;
  assert.equal(matchRecipe([0, BOOK, 0, D, O, D, O, O, O], 3)?.out.id, ENCHANTING_TABLE);
  assert.equal(matchRecipe([B, B, B, 0, I, 0, I, I, I], 3)?.out.id, ANVIL);
  // Los encantamientos de esta fase (37) y los que se dejan fuera.
  // Los de esta fase (37) más sigilo rápido (fase 7.5) y velocidad de alma (fase 8.3).
  assert.equal(ENCHANT_IDS.length, 39);
  for (const k of ['density', 'breach', 'wind_burst', 'lunge']) assert.equal(enchantByName(k), undefined, k);
  assert.equal(enchantByName('toque_de_seda')?.id, SILK_TOUCH);
  assert.equal(enchantByName('Protección')?.id, PROTECTION);
  assert.equal(enchantName(SHARPNESS, 3), 'Filo III');
  assert.equal(enchantName(SILK_TOUCH, 1), 'Toque de seda');
  // Yunques: tres grados, se deterioran y caen.
  assert.equal(anvilDamage(ANVIL), 0);
  assert.equal(damagedAnvil(ANVIL + 1), CHIPPED_ANVIL + 1, 'conserva la orientación');
  assert.equal(damagedAnvil(DAMAGED_ANVIL), 0);
});

test('compatibilidades y objetos de cada encantamiento', () => {
  const pick = TOOLS.iron.pickaxe, helm = ARMOR.iron.helmet, boots = ARMOR.iron.boots;
  assert.ok(canApply(SHARPNESS, TOOLS.iron.axe) && !canApply(SHARPNESS, pick));
  assert.ok(canApply(EFFICIENCY, pick) && canApply(SILK_TOUCH, pick) && !canApply(SILK_TOUCH, TOOLS.iron.sword));
  assert.ok(canApply(FEATHER_FALLING, boots) && !canApply(FEATHER_FALLING, helm));
  assert.ok(canApply(MENDING, BOW) && canApply(UNBREAKING, TRIDENT) && canApply(LOYALTY, TRIDENT));
  assert.ok(canApply(VANISHING_CURSE, pick) && canApply(BINDING_CURSE, helm) && !canApply(BINDING_CURSE, pick));
  assert.ok(canApply(SHARPNESS, ENCHANTED_BOOK), 'los libros admiten cualquiera');
  assert.ok(!compatible(SHARPNESS, SMITE) && !compatible(PROTECTION, FIRE_PROTECTION) && !compatible(SILK_TOUCH, FORTUNE));
  assert.ok(!compatible(INFINITY, MENDING) && !compatible(FROST_WALKER, DEPTH_STRIDER) && !compatible(MULTISHOT, PIERCING));
  assert.ok(!compatible(RIPTIDE, LOYALTY) && !compatible(RIPTIDE, CHANNELING) && compatible(LOYALTY, CHANNELING));
  assert.ok(compatible(SHARPNESS, LOOTING) && compatible(UNBREAKING, MENDING) && !compatible(SHARPNESS, SHARPNESS));
  assert.equal(enchantability(TOOLS.golden.sword), 22);
  assert.equal(enchantability(ARMOR.golden.chestplate), 25);
  assert.equal(enchantability(BOOK), 1);
  assert.equal(enchantability(ENCHANTED_BOOK), 0);
  assert.ok(isEnchantable(pick) && !isEnchantable(STONE) && !isEnchantable(ENCHANTED_BOOK));
});

test('mesa: librerías a dos bloques con aire en medio (como mucho 15)', () => {
  const world = new Map<string, number>();
  const get = (x: number, y: number, z: number) => world.get(`${x},${y},${z}`) ?? AIR;
  assert.equal(countBookshelves(get, 0, 0, 0), 0);
  for (const [dx, dy, dz] of BOOKSHELF_OFFSETS) world.set(`${dx},${dy},${dz}`, BOOKSHELF);
  assert.equal(BOOKSHELF_OFFSETS.length, 32);
  assert.equal(countBookshelves(get, 0, 0, 0), 15, 'hasta 15 cuentan');
  // Un bloque en medio tapa las de detrás.
  world.clear();
  world.set('2,0,0', BOOKSHELF);
  world.set('0,0,2', BOOKSHELF);
  assert.equal(countBookshelves(get, 0, 0, 0), 2);
  world.set('1,0,0', STONE);
  assert.equal(countBookshelves(get, 0, 0, 0), 1);
  world.set('1,0,0', SHORT_GRASS);
  assert.equal(countBookshelves(get, 0, 0, 0), 2, 'la hierba no tapa');
});

test('mesa: ofertas, pistas y encantamientos con la misma semilla', () => {
  // El generador es el de Java (valores conocidos de java.util.Random(42)).
  const jr = new JavaRandom(42);
  assert.deepEqual([jr.nextInt(10), jr.nextInt(10), jr.nextInt(10)], [0, 3, 8]);
  const pick = TOOLS.diamond.pickaxe;
  for (let seed = 1; seed < 40; seed++) {
    const none = tableOffers(pick, 0, seed * 7919);
    const full = tableOffers(pick, 15, seed * 7919);
    // Sin librerías: como mucho 8 niveles; con 15, la tercera siempre 30.
    for (const o of none) assert.ok(o.cost <= 8);
    assert.equal(full[2].cost, 30);
    assert.ok(full[0].cost >= 1 && full[0].cost <= full[1].cost && full[1].cost <= full[2].cost);
    // La pista es uno de los encantamientos que salen de verdad.
    for (let slot = 0; slot < 3; slot++) {
      const o = full[slot];
      const list = tableEnchants(pick, slot, o.cost, seed * 7919);
      assert.ok(list.length > 0);
      assert.ok(list.some(([id, lvl]) => id === o.ench && lvl === o.level), 'la pista sale');
      for (const [id] of list) assert.ok(!ENCHANTS[id].treasure && canApply(id, pick), 'sin tesoros y aplicables');
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(compatible(list[i][0], list[j][0]));
    }
  }
  // Un libro pasa a libro encantado; lo encantado ya no se encanta.
  const book = applyEnchants({ id: BOOK, count: 1 }, [[SHARPNESS, 2]]);
  assert.equal(book.id, ENCHANTED_BOOK);
  assert.deepEqual(storedOf(book), [[SHARPNESS, 2]]);
  assert.ok(canEnchantAtTable({ id: pick, count: 1 }) && !canEnchantAtTable(sword([[SHARPNESS, 1]])));
  assert.ok(!canEnchantAtTable({ id: STONE, count: 1 }));
  // Con muchos niveles salen encantamientos más altos.
  const r = rndFrom(lcg(3));
  let top = 0;
  for (let i = 0; i < 200; i++) for (const [id, lvl] of selectEnchantments(r, pick, 30)) if (id === EFFICIENCY) top = Math.max(top, lvl);
  assert.ok(top >= 4, `eficiencia alta con 30 niveles (${top})`);
});

test('efectos: filo, castigo, eficiencia, irrompibilidad, protección y caída de pluma', () => {
  assert.equal(meleeBonus([[SHARPNESS, 5]], MOB_COW), 3);
  assert.equal(meleeBonus([[SMITE, 2]], MOB_ZOMBIE), 5);
  assert.equal(meleeBonus([[SMITE, 2]], MOB_SPIDER), 0);
  assert.equal(efficiencyBonus(5), 26);
  assert.equal(efficiencyBonus(0), 0);
  // Irrompibilidad III: las herramientas se gastan 1 de cada 4 veces.
  const rand = lcg(11);
  let worn = 0;
  for (let i = 0; i < 20000; i++) if (!unbreakingSaves(3, false, rand)) worn++;
  assert.ok(Math.abs(worn / 20000 - 0.25) < 0.02, `desgaste ${worn / 20000}`);
  let wornArmor = 0;
  for (let i = 0; i < 20000; i++) if (!unbreakingSaves(3, true, rand)) wornArmor++;
  assert.ok(Math.abs(wornArmor / 20000 - 0.7) < 0.02, `armadura ${wornArmor / 20000}`);
  // Protección IV en las cuatro piezas: 16 puntos (64 %); con fuego, la específica cuenta doble.
  const four: [number, number][][] = [[[PROTECTION, 4]], [[PROTECTION, 4]], [[PROTECTION, 4]], [[PROTECTION, 4]]];
  assert.equal(protectionPoints(four, 'zombie'), 16);
  assert.ok(Math.abs(applyProtection(10, 16) - 3.6) < 1e-9);
  assert.equal(protectionPoints([[[FIRE_PROTECTION, 4]], [[FIRE_PROTECTION, 4]], [[FIRE_PROTECTION, 4]]], 'lava'), 20, 'tope de 20');
  assert.equal(protectionPoints([[], [], [], [[FEATHER_FALLING, 4]]], 'fall'), 12);
  assert.equal(protectionPoints([[], [], [], [[FEATHER_FALLING, 4]]], 'zombie'), 0);
  assert.equal(protectionPoints(four, 'void'), 0, 'el vacío no se reduce');
  // Los encantamientos que manda el cliente se validan con el objeto.
  assert.deepEqual(sanitizeHeldEnchants(TOOLS.iron.sword, [[SHARPNESS, 99], [EFFICIENCY, 5], [999, 1], 'x']), [[SHARPNESS, 10]]);
  // Suerte marina: menos basura y más tesoros.
  const w = fishingWeights(3);
  assert.deepEqual(w, { junk: 4, treasure: 11, fish: 82 });
});

test('efectos: toque de seda y fortuna', () => {
  const pick = TOOLS.diamond.pickaxe;
  const silk: [number, number][] = [[SILK_TOUCH, 1]];
  assert.deepEqual(enchantedBlockDrops(DIAMOND_ORE, pick, silk), [{ id: DIAMOND_ORE, count: 1 }]);
  assert.deepEqual(enchantedBlockDrops(GLASS, pick, silk), [{ id: GLASS, count: 1 }]);
  assert.deepEqual(enchantedBlockDrops(ICE, pick, silk), [{ id: ICE, count: 1 }]);
  assert.deepEqual(enchantedBlockDrops(STONE, pick, silk), [{ id: STONE, count: 1 }]);
  assert.deepEqual(enchantedBlockDrops(OAK_LEAVES, TOOLS.diamond.axe, silk), [{ id: OAK_LEAVES, count: 1 }]);
  assert.deepEqual(blockDrops(GLASS, pick), [], 'sin toque de seda el cristal no suelta nada');
  // Sin el pico adecuado, tampoco con seda.
  assert.deepEqual(enchantedBlockDrops(DIAMOND_ORE, TOOLS.stone.pickaxe, silk), []);
  // Fortuna III: de media, 2,2 veces más diamantes; el hierro en bruto también.
  const rand = lcg(5);
  let n = 0, raw = 0;
  for (let i = 0; i < 4000; i++) {
    n += enchantedBlockDrops(DIAMOND_ORE, pick, [[FORTUNE, 3]], rand).reduce((a, s) => a + s.count, 0);
    raw += enchantedBlockDrops(IRON_ORE, pick, [[FORTUNE, 3]], rand).filter((s) => s.id === RAW_IRON).reduce((a, s) => a + s.count, 0);
  }
  assert.ok(Math.abs(n / 4000 - 2.2) < 0.1, `diamantes ${n / 4000}`);
  assert.ok(Math.abs(raw / 4000 - 2.2) < 0.1, `hierro en bruto ${raw / 4000}`);
  for (let i = 0; i < 50; i++) assert.ok(oreMultiplier(0, rand) === 1);
  // La grava con Fortuna III siempre suelta pedernal.
  for (let i = 0; i < 20; i++) assert.equal(enchantedBlockDrops(GRAVEL, TOOLS.iron.shovel, [[FORTUNE, 3]], rand)[0].id, ITEMS.findIndex((d) => d?.key === 'flint'));
});

test('yunque: reparar, combinar, renombrar y coste', () => {
  const max = ITEMS[TOOLS.diamond.sword].tool!.durability;
  // Reparar con diamantes: cada uno, un cuarto.
  const worn = sword([[SHARPNESS, 3]], max - 10);
  const r1 = anvilResult(worn, { id: DIAMOND, count: 64 }, null);
  assert.ok(r1.out);
  assert.equal(r1.out!.dmg, undefined, 'reparada del todo');
  assert.equal(r1.material, 4);
  assert.equal(r1.cost, 4);
  assert.deepEqual(enchantsOf(r1.out), [[SHARPNESS, 3]]);
  assert.equal(repairCost(r1.out), 1, 'penalización por trabajo previo');
  // Combinar: el mismo nivel sube uno; lo incompatible no pasa.
  const r2 = anvilResult(sword([[SHARPNESS, 3]]), sword([[SHARPNESS, 3], [LOOTING, 2]]), null);
  assert.deepEqual(enchantsOf(r2.out).sort((a, b) => a[0] - b[0]), [[SHARPNESS, 4], [LOOTING, 2]].sort((a, b) => a[0] - b[0]));
  assert.equal(r2.cost, 4 * 1 + 2 * 4);
  const r3 = anvilResult(sword([[SHARPNESS, 5]]), enchantedBook([[SHARPNESS, 5]]), null);
  assert.equal(enchLevel(r3.out, SHARPNESS), 5, 'no pasa del máximo');
  const r4 = anvilResult(sword([[SHARPNESS, 2]]), enchantedBook([[SMITE, 3]]), null);
  assert.equal(r4.out, null, 'filo y castigo no se juntan');
  // Libros: cuestan la mitad; dos libros se combinan.
  const r5 = anvilResult(sword(), enchantedBook([[LOOTING, 3]]), null);
  assert.equal(r5.cost, 2 * 3);
  const r6 = anvilResult(enchantedBook([[UNBREAKING, 2]]), enchantedBook([[UNBREAKING, 2]]), null);
  assert.deepEqual(storedOf(r6.out), [[UNBREAKING, 3]]);
  // Un libro con algo que no se aplica al objeto no hace nada.
  assert.equal(anvilResult({ id: TOOLS.iron.pickaxe, count: 1 }, enchantedBook([[SHARPNESS, 1]]), null).out, null);
  // Renombrar: 1 nivel (también etiquetas); el nombre pasa a la pila.
  const tag = anvilResult({ id: NAME_TAG, count: 1 }, null, 'Pepe');
  assert.equal(tag.cost, 1);
  assert.equal(stackName(tag.out!), 'Pepe');
  assert.equal(anvilResult({ id: NAME_TAG, count: 1 }, null, '').out, null, 'sin nombre no hace nada');
  const renamed = anvilResult(sword(), null, 'Tizona').out!;
  assert.equal(stackName(renamed), 'Tizona');
  assert.equal(repairCost(renamed), 0, 'renombrar solo no suma penalización');
  // Penalización: 0, 1, 3, 7, 15…; con 40 o más, «¡Demasiado caro!».
  assert.deepEqual([0, 1, 3, 7].map(nextRepairCost), [1, 3, 7, 15]);
  const pricey = { ...sword([[SHARPNESS, 3]], 100), data: { ...sword([[SHARPNESS, 3]]).data, rc: 63 } };
  const r7 = anvilResult(pricey, { id: DIAMOND, count: 1 }, null);
  assert.ok(r7.tooExpensive && r7.out === null && r7.cost >= TOO_EXPENSIVE);
  assert.ok(anvilResult(pricey, { id: DIAMOND, count: 1 }, null, true).out, 'en creativo no hay tope');
  const onlyName = anvilResult(pricey, null, 'Caro');
  assert.ok(onlyName.out && onlyName.cost === TOO_EXPENSIVE - 1, 'renombrar nunca es demasiado caro');
  // Dos espadas gastadas: se suman las durabilidades más un 12 %.
  const r8 = anvilResult(sword([], max - 100), sword([], max - 100), null);
  assert.equal(r8.out!.dmg, max - 200 - Math.floor(max * 0.12));
});

test('afiladora: quita encantamientos (no maldiciones), devuelve experiencia y repara', () => {
  const s = sword([[SHARPNESS, 5], [VANISHING_CURSE, 1], [UNBREAKING, 3]]);
  const out = grindstoneResult(s, null)!;
  assert.deepEqual(enchantsOf(out), [[VANISHING_CURSE, 1]]);
  assert.equal(repairCost(out), 1);
  // Experiencia: entre la mitad y el total del coste mínimo de lo quitado (Filo V 45 + Irrompibilidad III 21).
  const rand = lcg(9);
  for (let i = 0; i < 50; i++) {
    const xp = grindstoneXp(s, null, rand);
    assert.ok(xp >= 33 && xp <= 66, `xp ${xp}`);
  }
  // Un libro encantado vuelve a ser un libro.
  assert.deepEqual(grindstoneResult(enchantedBook([[MENDING, 1]]), null), { id: BOOK, count: 1 });
  // Sin encantamientos no hace nada; dos iguales se reparan (+5 %) y pierden los encantamientos.
  assert.equal(grindstoneResult(sword(), null), null);
  const max = ITEMS[TOOLS.diamond.sword].tool!.durability;
  const both = grindstoneResult(sword([[SHARPNESS, 1]], max - 50), sword([], max - 50))!;
  assert.equal(both.dmg, max - 100 - Math.floor(max * 0.05));
  assert.deepEqual(enchantsOf(both), []);
  assert.equal(grindstoneResult(sword(), { id: TOOLS.iron.sword, count: 1 }), null, 'distintos no');
});

test('pila encantada: ida y vuelta, brillo, apilado y límites', () => {
  const s: ItemStack = { id: TOOLS.iron.pickaxe, count: 1, dmg: 20, data: { ench: [[EFFICIENCY, 5], [UNBREAKING, 3]], name: 'Mi pico', rc: 3 } };
  const back = sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(s)))));
  assert.deepEqual(back, s);
  assert.deepEqual(cloneStack(s), s);
  assert.notEqual(cloneStack(s)!.data!.ench, s.data!.ench, 'la copia no comparte la lista');
  const book = enchantedBook([[MENDING, 1]]);
  assert.deepEqual(sanitizeStack(stackFromWire(JSON.parse(JSON.stringify(stackToWire(book))))), book);
  assert.ok(hasGlint(s) && hasGlint(book) && hasGlint({ id: EXPERIENCE_BOTTLE, count: 1 }) && !hasGlint({ id: BOOK, count: 1 }));
  // Libros con distintos encantamientos no se apilan (y los libros encantados no se apilan nunca).
  assert.ok(!sameKind(enchantedBook([[MENDING, 1]]), enchantedBook([[UNBREAKING, 1]])));
  // Límites: ids desconocidos fuera, niveles acotados, sin repetir; encantamientos en objetos que no los admiten, fuera.
  const bad = sanitizeStack({ id: TOOLS.iron.sword, count: 1, data: { ench: [[SHARPNESS, 99], [SHARPNESS, 2], [9999, 1], [THORNS, 0]] } });
  assert.deepEqual(bad?.data?.ench, [[SHARPNESS, 10]]);
  assert.equal(sanitizeStack({ id: STONE, count: 1, data: { ench: [[SHARPNESS, 1]] } })?.data, undefined);
  assert.equal(sanitizeStack({ id: BOOK, count: 1, data: { stored: [[SHARPNESS, 1]] } })?.data, undefined);
  const named = sanitizeStack({ id: STONE, count: 5, data: { name: '  Piedra\u0007 bonita  ' } });
  assert.equal(named?.data?.name, 'Piedra bonita');
});

test('botín y comercio: libros encantados del bibliotecario y equipo encantado', () => {
  const r = rndFrom(lcg(21));
  for (let i = 0; i < 200; i++) {
    const { book, price } = librarianBook(r);
    assert.equal(book.id, ENCHANTED_BOOK);
    const [[id, lvl]] = storedOf(book);
    assert.ok(lvl >= 1 && lvl <= ENCHANTS[id].max);
    assert.ok(price >= 2 && price <= 64);
  }
  const e = enchantWithLevels({ id: TOOLS.diamond.sword, count: 1 }, 30, r, TABLE_POOL);
  assert.ok(enchantsOf(e).length > 0);
  // Un bibliotecario experto ofrece libros encantados con su precio; siempre los mismos.
  let found = 0;
  for (let seed = 1; seed < 60; seed++) {
    const offers = offersFor(PROF_LIBRARIAN, 4, seed);
    assert.deepEqual(offers, offersFor(PROF_LIBRARIAN, 4, seed));
    for (const o of offers) {
      if (o.result[0] !== ENCHANTED_BOOK) continue;
      found++;
      assert.equal(o.cost[0], EMERALD);
      assert.deepEqual(o.cost2, [BOOK, 1]);
      assert.ok(o.data?.stored?.length === 1);
    }
  }
  assert.ok(found > 20, `libros ofrecidos: ${found}`);
});

// ------------------------------------------------------------------ servidor

function platform(): { h: Harness; c: Client; bx: number; by: number; bz: number } {
  const h = makeServer(7070);
  const c = h.join('Encantadora');
  const [sx, sy, sz] = c.welcome.spawn as [number, number, number];
  c.pos(sx, sy, sz);
  h.tick(40);
  const bx = Math.floor(sx) + 2, by = 160, bz = Math.floor(sz) + 2;
  const W = h.gs.world;
  for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
    W.setBlock(bx + dx, by - 1, bz + dz, STONE);
    for (let y = by; y < by + 12; y++) W.setBlock(bx + dx, y, bz + dz, AIR);
  }
  c.pos(bx + 0.5, by, bz + 0.5);
  h.tick(2);
  c.conn.msgs = [];
  return { h, c, bx, by, bz };
}

const ents = (h: Harness, type: number) => [...h.gs.entities.list.values()].filter((e) => e.type === type);

test('servidor: mesa, yunque que se deteriora y afiladora que suelta experiencia', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  W.setBlock(bx + 1, by, bz, ENCHANTING_TABLE);
  c.send({ t: 'work', k: 'enchant', x: bx + 1, y: by, z: bz });
  h.tick(1);
  assert.ok(c.conn.take('fx').some((m) => m.k === 'enchant'), 'sonido y partículas de la mesa');
  // El yunque acaba roto tras muchos usos (12 % cada vez).
  W.setBlock(bx - 1, by, bz, ANVIL + 2);
  let uses = 0;
  while (W.getBlock(bx - 1, by, bz) !== AIR && uses < 500) {
    c.send({ t: 'work', k: 'anvil', x: bx - 1, y: by, z: bz });
    uses++;
    h.tick(3);
  }
  assert.ok(uses > 3 && uses < 500, `usos hasta romperse: ${uses}`);
  // Afiladora: los orbes de lo que devuelve.
  W.setBlock(bx, by, bz + 1, GRINDSTONE);
  c.send({ t: 'work', k: 'grind', x: bx, y: by, z: bz + 1, n: 20 });
  h.tick(1);
  const total = ents(h, ENT_XP).reduce((a, e) => a + (e.xp ?? 0), 0) + c.conn.take('xp').reduce((a, m) => a + m.n, 0);
  assert.ok(total >= 20, `experiencia de la afiladora: ${total}`);
  // Lejos, no.
  W.setBlock(bx + 7, by, bz + 7, ENCHANTING_TABLE);
  c.conn.msgs = [];
  c.send({ t: 'work', k: 'enchant', x: bx + 7, y: by, z: bz + 7 });
  h.tick(1);
  assert.ok(!c.conn.take('fx').some((m) => m.k === 'enchant'));
});

test('servidor: el yunque cae como la arena y aplasta', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  const cow = h.gs.entities.spawnMob(MOB_COW, bx + 3.5, by, bz + 3.5)!;
  const hp = cow.health;
  W.setBlock(bx + 3, by + 8, bz + 3, ANVIL);
  W.setBlock(bx + 3, by + 7, bz + 3, STONE);
  W.setBlock(bx + 3, by + 7, bz + 3, AIR);
  h.tick(2);
  assert.ok(ents(h, ENT_FALLING).length === 1, 'cae');
  h.tick(60);
  assert.ok(isAnvil(W.getBlock(bx + 3, by, bz + 3)) || W.getBlock(bx + 3, by, bz + 3) === AIR, 'aterriza (o se rompe)');
  assert.ok(cow.health < hp || cow.dead, 'hiere a la vaca');
  void c;
});

test('servidor: Paso helado congela el agua y el hielo se derrite', () => {
  const { h, c, bx, by, bz } = platform();
  const W = h.gs.world;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) W.setBlock(bx + dx, by - 1, bz + dz, WATER);
  c.pos(bx + 0.5, by, bz + 0.5);
  c.send({ t: 'frost', l: 2 });
  h.tick(1);
  assert.ok(isFrostedIce(W.getBlock(bx, by - 1, bz)) && isFrostedIce(W.getBlock(bx + 3, by - 1, bz)));
  assert.equal(W.getBlock(bx + 4, by - 1, bz + 4), WATER, 'fuera del radio');
  h.tick(20 * 60);
  assert.equal(W.getBlock(bx, by - 1, bz), WATER, 'se derrite');
});

test('servidor: Espinas devuelve el golpe y la botella con experiencia suelta orbes', () => {
  const { h, c, bx, by, bz } = platform();
  // Armadura con Espinas III en las cuatro piezas (la guarda el estado del jugador).
  const piece = (id: number) => stackToWire(withEnchants({ id, count: 1 }, [[THORNS, 3]]));
  c.send({ t: 'state', d: { inv: [], hp: 20, food: 20, sat: 5, armor: [ARMOR.iron.helmet, ARMOR.iron.chestplate, ARMOR.iron.leggings, ARMOR.iron.boots].map(piece) } });
  const zombie = h.gs.entities.spawnMob(MOB_ZOMBIE, bx + 1.5, by, bz + 0.5)!;
  const hp = zombie.health;
  let th = 0;
  for (let i = 0; i < 400 && !th; i++) {
    h.tick(1);
    th |= c.conn.take('hurt').reduce((a, m) => a | (m.th ?? 0), 0);
    c.pos(bx + 0.5, by, bz + 0.5);
  }
  assert.ok(th > 0, 'saltan las espinas');
  assert.ok(zombie.health < hp || zombie.dead, 'hieren al zombi');
  // La botella con experiencia (sin el zombi, que puede estar pegado al jugador y la rompería al caer).
  h.gs.entities.list.delete(zombie.id);
  c.send({ t: 'throw', p: [bx + 0.5, by + 1.5, bz + 0.5], d: [0, -1, 0], item: EXPERIENCE_BOTTLE });
  h.tick(1);
  assert.ok(ents(h, ENT_THROWN).some((e) => e.stack?.id === EXPERIENCE_BOTTLE));
  h.tick(40);
  // Lo que quede en orbes más lo que ya recogió el jugador.
  const xp = ents(h, ENT_XP).reduce((a, e) => a + (e.xp ?? 0), 0) + c.conn.take('xp').reduce((a, m) => a + m.n, 0);
  assert.ok(xp >= 3 && xp <= 11, `orbes: ${xp}`);
});
