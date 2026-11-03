// Armaduras: fórmula de reducción de daño, causas que la atraviesan, desgaste y rotura, equipar e
// intercambiar piezas, soltarlas al morir y las 16 recetas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARMOR_BYPASS, ARMOR_MATERIALS, ARMOR_PIECES, armorReduce, armorWear } from '../src/shared/armor';
import { ARMOR, ITEMS, LEATHER, IRON_INGOT, GOLD_INGOT, DIAMOND, STICK } from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { Inventory, armorSlotOf } from '../src/client/game/Inventory';
import { Survival } from '../src/client/game/Survival';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

/** Inventario con el juego completo de un material puesto. */
function suited(mat: string): Inventory {
  const inv = new Inventory();
  for (const piece of ARMOR_PIECES) inv.equip({ id: ARMOR[mat][piece], count: 1 });
  return inv;
}

test('armadura: reducción de daño con la fórmula de Minecraft', () => {
  // Sin armadura el daño llega entero.
  near(armorReduce(7, 0, 0), 7);
  // Diamante completo (20 puntos, dureza 8): 10 de daño → 17,5 puntos efectivos → 3.
  near(armorReduce(10, 20, 8), 3);
  // Hierro completo (15 puntos): 5 de daño → 12,5 efectivos → 2,5.
  near(armorReduce(5, 15, 0), 2.5);
  // Cuero completo (7 puntos): 4 de daño → 5 efectivos → 3,2.
  near(armorReduce(4, 7, 0), 3.2);
  // Golpes enormes: la armadura nunca protege menos de puntos / 5 (diamante: 16 %).
  near(armorReduce(100, 20, 8), 84);
  // Y nunca más del 80 %.
  near(armorReduce(1, 30, 0), 0.2);
  // Desgaste por pieza: daño / 4, mínimo 1.
  assert.equal(armorWear(1), 1);
  assert.equal(armorWear(7), 1);
  assert.equal(armorWear(8), 2);
  assert.equal(armorWear(20), 5);
});

test('armadura: puntos y dureza de lo puesto', () => {
  const values: Record<string, [number, number]> = { leather: [7, 0], golden: [11, 0], iron: [15, 0], diamond: [20, 8] };
  for (const mat of ARMOR_MATERIALS) {
    const inv = suited(mat);
    assert.equal(inv.armorPoints(), values[mat][0], mat);
    assert.equal(inv.armorToughness(), values[mat][1], mat);
  }
  assert.equal(new Inventory().armorPoints(), 0);
});

test('armadura: Survival reduce el daño y desgasta las piezas', () => {
  const inv = suited('diamond');
  const s = new Survival();
  s.armor = inv;
  near(s.damage(10, 'zombie'), 3);
  near(s.health, 17);
  for (const p of inv.armor) assert.equal(p!.dmg, armorWear(10));
  // Durante la invulnerabilidad sólo cuenta el exceso (también reducido por la armadura).
  const got = s.damage(14, 'zombie');
  near(got, armorReduce(4, 20, 8));
  for (const p of inv.armor) assert.equal(p!.dmg, 2 + armorWear(4));
  // Sin armadura puesta no cambia nada.
  const bare = new Survival();
  bare.armor = new Inventory();
  assert.equal(bare.damage(6, 'skeleton'), 6);
});

test('armadura: causas que la atraviesan; la lava sí se reduce', () => {
  for (const cause of ARMOR_BYPASS) {
    const inv = suited('iron');
    const s = new Survival();
    s.armor = inv;
    assert.equal(s.damage(5, cause), 5, cause);
    for (const p of inv.armor) assert.equal(p!.dmg, undefined, cause);
  }
  // La lava y el fuego se saltan la invulnerabilidad (daño periódico) pero la armadura sí los reduce,
  // como en Minecraft.
  const inv = suited('iron');
  const s = new Survival();
  s.armor = inv;
  assert.equal(s.damage(4, 'lava', true), armorReduce(4, inv.armorPoints(), 0));
  for (const p of inv.armor) assert.equal(p!.dmg, armorWear(4));
});

test('armadura: desgaste y rotura', () => {
  const inv = new Inventory();
  const boots = ARMOR.leather.boots;
  const dur = ITEMS[boots].armor!.durability;
  inv.equip({ id: boots, count: 1, dmg: dur - 2 });
  inv.equip({ id: ARMOR.iron.helmet, count: 1 });
  assert.equal(inv.wearArmor(1), 0);
  assert.equal(inv.armor[3]!.dmg, dur - 1);
  // La pieza gastada se rompe y desaparece; la otra sigue puesta.
  assert.equal(inv.wearArmor(1), 1);
  assert.equal(inv.armor[3], null);
  assert.equal(inv.armor[0]!.dmg, 2);
  assert.equal(inv.armorPoints(), 2);
  // wear() también desgasta una pieza de armadura guardada en el inventario.
  inv.set(5, { id: ARMOR.golden.chestplate, count: 1, dmg: ITEMS[ARMOR.golden.chestplate].armor!.durability - 1 });
  assert.equal(inv.wear(5), true);
  assert.equal(inv.get(5), null);
  // Lo que no se desgasta no se toca.
  inv.set(6, { id: STICK, count: 3 });
  assert.equal(inv.wear(6), false);
  assert.equal(inv.get(6)!.dmg, undefined);
  // Un golpe que rompe la armadura se sigue reduciendo con ella.
  const inv2 = new Inventory();
  inv2.equip({ id: ARMOR.leather.helmet, count: 1, dmg: ITEMS[ARMOR.leather.helmet].armor!.durability - 1 });
  const s = new Survival();
  s.armor = inv2;
  near(s.damage(4, 'spider'), armorReduce(4, 1, 0));
  assert.equal(inv2.armor[0], null);
});

test('armadura: equipar, intercambiar y quitar', () => {
  const inv = new Inventory();
  assert.equal(armorSlotOf(ARMOR.iron.leggings), 2);
  assert.equal(armorSlotOf(STICK), -1);
  // Desde una ranura del inventario (clic derecho con la pieza en la mano).
  inv.set(0, { id: ARMOR.iron.helmet, count: 1 });
  assert.equal(inv.equipFromSlot(0, true), true);
  assert.equal(inv.armor[0]!.id, ARMOR.iron.helmet);
  assert.equal(inv.get(0), null);
  // Con la ranura ocupada: mayúsculas + clic no hace nada; el clic derecho intercambia.
  inv.set(0, { id: ARMOR.diamond.helmet, count: 1 });
  assert.equal(inv.equipFromSlot(0, false), false);
  assert.equal(inv.armor[0]!.id, ARMOR.iron.helmet);
  assert.equal(inv.equipFromSlot(0, true), true);
  assert.equal(inv.armor[0]!.id, ARMOR.diamond.helmet);
  assert.equal(inv.get(0)!.id, ARMOR.iron.helmet);
  // Lo que no es armadura no se pone.
  inv.set(1, { id: STICK, count: 2 });
  assert.equal(inv.equipFromSlot(1, true), false);
  // El desgaste viaja con la pieza.
  inv.set(2, { id: ARMOR.golden.boots, count: 1, dmg: 7 });
  inv.equipFromSlot(2, false);
  assert.equal(inv.armor[3]!.dmg, 7);

  // Clics con el cursor: sólo acepta la pieza que corresponde.
  inv.cursor = { id: ARMOR.leather.boots, count: 1 };
  inv.clickArmor(0);
  assert.equal(inv.armor[0]!.id, ARMOR.diamond.helmet);
  assert.equal(inv.cursor!.id, ARMOR.leather.boots);
  inv.clickArmor(3);
  assert.equal(inv.armor[3]!.id, ARMOR.leather.boots);
  assert.equal(inv.cursor!.id, ARMOR.golden.boots);
  inv.cursor = null;
  inv.clickArmor(3);
  assert.equal(inv.armor[3], null);
  assert.equal(inv.cursor!.id, ARMOR.leather.boots);
  inv.cursor = { id: STICK, count: 1 };
  inv.clickArmor(3);
  assert.equal(inv.armor[3], null);
  inv.cursor = null;

  // Mayúsculas + clic en una ranura de armadura: vuelve al inventario (si cabe).
  assert.equal(inv.unequip(0), true);
  assert.equal(inv.armor[0], null);
  assert.equal(inv.count(ARMOR.diamond.helmet), 1);
  inv.equip({ id: ARMOR.iron.chestplate, count: 1 });
  for (let i = 0; i < 36; i++) inv.set(i, { id: STICK, count: 64 });
  assert.equal(inv.unequip(1), false);
  assert.equal(inv.armor[1]!.id, ARMOR.iron.chestplate);
});

test('armadura: al morir se suelta con todo lo demás', () => {
  const inv = suited('golden');
  inv.set(4, { id: STICK, count: 5 });
  inv.cursor = { id: DIAMOND, count: 1 };
  const all = inv.takeAll();
  assert.equal(all.length, 6);
  for (const piece of ARMOR_PIECES) assert.ok(all.some((s) => s.id === ARMOR.golden[piece]), piece);
  assert.deepEqual(inv.armor, [null, null, null, null]);
  assert.equal(inv.armorPoints(), 0);
});

test('armadura: las 16 recetas', () => {
  const mats: [string, number][] = [['leather', LEATHER], ['iron', IRON_INGOT], ['golden', GOLD_INGOT], ['diamond', DIAMOND]];
  const shapes: Record<string, string[]> = {
    helmet: ['MMM', 'M M', '   '],
    chestplate: ['M M', 'MMM', 'MMM'],
    leggings: ['MMM', 'M M', 'M M'],
    boots: ['   ', 'M M', 'M M'],
  };
  let n = 0;
  for (const [mat, m] of mats) {
    for (const piece of ARMOR_PIECES) {
      const grid = shapes[piece].join('').split('').map((c) => (c === 'M' ? m : 0));
      const r = matchRecipe(grid, 3);
      assert.ok(r, `${mat} ${piece}`);
      assert.equal(r.out.id, ARMOR[mat][piece], `${mat} ${piece}`);
      assert.equal(r.out.count, 1);
      n++;
    }
    // El casco y las botas también se fabrican en la otra fila libre.
    assert.equal(matchRecipe(['   ', 'MMM', 'M M'].join('').split('').map((c) => (c === 'M' ? m : 0)), 3)?.out.id, ARMOR[mat].helmet);
    assert.equal(matchRecipe(['M M', 'M M', '   '].join('').split('').map((c) => (c === 'M' ? m : 0)), 3)?.out.id, ARMOR[mat].boots);
  }
  assert.equal(n, 16);
  // Materiales mezclados no valen.
  assert.equal(matchRecipe([IRON_INGOT, IRON_INGOT, IRON_INGOT, IRON_INGOT, 0, DIAMOND, 0, 0, 0], 3), null);
});
