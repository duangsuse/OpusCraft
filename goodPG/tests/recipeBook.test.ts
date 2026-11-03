import test from 'node:test';
import assert from 'node:assert/strict';
import { bookRecipes, recipeGroups, recipesFor, planFill, stockOf, tabsFor, matchesQuery } from '../src/shared/recipeBook';
import { matchRecipe } from '../src/shared/recipes';
import { STICK, IRON_INGOT, TOOLS, COOKED_PORKCHOP, RAW_PORKCHOP, ITEMS } from '../src/shared/items';
import { CRAFTING_TABLE, OAK_PLANKS, BIRCH_PLANKS, OAK_LOG } from '../src/shared/blocks';

const plank = (n: number) => ({ id: OAK_PLANKS, count: n });

test('libro: el catálogo tiene fabricación y hornos, con pestañas y una casilla por objeto', () => {
  assert.ok(bookRecipes('craft').length > 900, `${bookRecipes('craft').length} recetas de fabricación`);
  assert.ok(bookRecipes('furnace').length > 30 && bookRecipes('smoker').length > 5 && bookRecipes('blast').length > 10);
  for (const kind of ['craft', 'furnace', 'blast'] as const) {
    const tabs = tabsFor(kind);
    for (const r of bookRecipes(kind)) assert.ok(tabs.includes(r.tab), `${kind}: ${ITEMS[r.out.id].key} en ${r.tab}`);
  }
  assert.equal(tabsFor('smoker').length, 0);
  const pick = recipeGroups('craft').find((g) => g.out === TOOLS.iron.pickaxe)!;
  assert.equal(pick.tab, 'equipment');
  assert.equal(recipeGroups('craft').find((g) => g.out === CRAFTING_TABLE)!.tab, 'misc');
  // El ahumador sólo comida; el alto horno nunca la lleva en la pestaña de comida.
  assert.ok(bookRecipes('smoker').every((r) => !!ITEMS[r.out.id].food));
  assert.equal(recipeGroups('furnace').find((g) => g.out === COOKED_PORKCHOP)!.tab, 'food');
});

test('libro: el ingrediente principal desbloquea (la madera de la herramienta, no el palo)', () => {
  const byIron = recipesFor([IRON_INGOT]).filter((r) => r.kind === 'craft').map((r) => r.out.id);
  assert.ok(byIron.includes(TOOLS.iron.pickaxe), 'el lingote desbloquea el pico de hierro');
  const byStick = recipesFor([STICK]).filter((r) => r.kind === 'craft').map((r) => r.out.id);
  assert.ok(!byStick.includes(TOOLS.iron.pickaxe), 'el palo solo no');
  assert.ok(recipesFor([RAW_PORKCHOP]).some((r) => r.kind === 'furnace' && r.out.id === COOKED_PORKCHOP), 'la carne cruda, la cocinada');
});

test('libro: colocar una receta rellena la cuadrícula y coincide con la receta de verdad', () => {
  const table = bookRecipes('craft').find((r) => r.out.id === CRAFTING_TABLE)!;
  // Cuatro tablones para la mesa: cabe en la 2×2 y en la 3×3, y se reconoce igual.
  for (const size of [2, 3]) {
    const p = planFill(table, size, stockOf([plank(4)]))!;
    assert.ok(p, `cabe en ${size}×${size}`);
    assert.equal(p.n, 1);
    assert.equal(matchRecipe(p.cells, size)?.out.id, CRAFTING_TABLE);
  }
  assert.equal(planFill(table, 2, stockOf([plank(3)])), null, 'faltan tablones');
  // Con muchos: 64 tablones dan 16 mesas por celda.
  assert.equal(planFill(table, 3, stockOf([plank(64)]), true)!.n, 16);
  // Un pico no cabe en la 2×2.
  const pick = bookRecipes('craft').find((r) => r.out.id === TOOLS.iron.pickaxe)!;
  const stock = stockOf([{ id: IRON_INGOT, count: 3 }, { id: STICK, count: 2 }]);
  assert.equal(planFill(pick, 2, stock), null);
  const p3 = planFill(pick, 3, stock)!;
  assert.equal(matchRecipe(p3.cells, 3)?.out.id, TOOLS.iron.pickaxe);
});

test('libro: con varios tipos de tablón usa el que más hay, el mismo en todas las celdas', () => {
  const chest = bookRecipes('craft').find((r) => ITEMS[r.out.id].key === 'chest')!;
  const p = planFill(chest, 3, stockOf([plank(3), { id: BIRCH_PLANKS, count: 9 }]))!;
  assert.ok(p, 'hay de sobra de abedul');
  assert.deepEqual([...new Set(p.cells.filter((c) => c))], [BIRCH_PLANKS]);
  assert.equal(matchRecipe(p.cells, 3)?.out.id, chest.out.id);
  // Un tronco sin nada más: sólo salen sus tablones.
  const logs = recipesFor([OAK_LOG]).filter((r) => r.kind === 'craft');
  assert.ok(logs.some((r) => r.out.id === OAK_PLANKS));
});

test('libro: el horno se rellena con una sola celda y la búsqueda ignora tildes y mayúsculas', () => {
  const r = bookRecipes('furnace').find((x) => x.out.id === COOKED_PORKCHOP)!;
  const p = planFill(r, 1, stockOf([{ id: RAW_PORKCHOP, count: 20 }]), true)!;
  assert.deepEqual(p.cells, [RAW_PORKCHOP]);
  assert.equal(p.n, 20);
  assert.ok(matchesQuery(TOOLS.iron.pickaxe, 'PICO'));
  assert.ok(matchesQuery(COOKED_PORKCHOP, 'cocinada'));
  assert.ok(!matchesQuery(COOKED_PORKCHOP, 'diamante'));
});

import { sanitizeSave } from '../src/shared/sim/server/playerState';

test('libro: lo desbloqueado se guarda acotado y llega como enteros', () => {
  const save = sanitizeSave({ inv: [], hp: 20, food: 20, sat: 5, rb: [7, -3, 'x', 2.5, 2147483648, 9] })!;
  assert.deepEqual(save.rb, [7, -3, -2147483648, 9], 'sólo enteros, de 32 bits');
  assert.equal(sanitizeSave({ inv: [], hp: 20, food: 20, sat: 5 })!.rb, undefined, 'sin libro, nada');
  const big = sanitizeSave({ inv: [], hp: 20, food: 20, sat: 5, rb: Array.from({ length: 9000 }, (_, i) => i) })!;
  assert.equal(big.rb!.length, 4096, 'acotado');
});
