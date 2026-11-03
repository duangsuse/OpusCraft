// Fase 7.6 (sistemas sueltos): mesa de cartografía y mapas ampliados, reparar juntando dos objetos y el
// escudo con estandarte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILLED_MAP, EMPTY_MAP, PAPER, SHIELD, TOOLS, type ItemStack } from '../src/shared/items';
import { GLASS_PANE, BANNERS } from '../src/shared/blocks';
import { MAP_SIZE, mapKeyAt, mapOrigin } from '../src/shared/maps';
import { cartographyResult, mapExtendCraft, mapArea, mapZoom, mapLocked, MAX_MAP_ZOOM } from '../src/shared/mapOps';
import { repairCraft, shieldDecorCraft } from '../src/shared/craftSpecials';
import { sanitizeItemData } from '../src/shared/itemData';
import { maxDurability, SHARPNESS, VANISHING_CURSE } from '../src/shared/enchantments';

test('mapas: escala, zona y mesa de cartografía', () => {
  const key = mapKeyAt(300, -200);
  const map: ItemStack = { id: FILLED_MAP, count: 1, dmg: key };
  // Escala 0: la misma celda de siempre.
  assert.deepEqual(mapArea(key, 0), { x0: mapOrigin(key)[0], z0: mapOrigin(key)[1], scale: 1, span: MAP_SIZE });
  // Cada escala dobla el lado y contiene la celda de antes.
  const [bx, bz] = mapOrigin(key);
  for (let z = 1; z <= MAX_MAP_ZOOM; z++) {
    const a = mapArea(key, z);
    assert.equal(a.span, MAP_SIZE << z);
    assert.ok(a.x0 <= bx && a.x0 + a.span >= bx + MAP_SIZE && a.z0 <= bz && a.z0 + a.span >= bz + MAP_SIZE, `escala ${z} contiene la celda`);
  }
  const zoomed = cartographyResult(map, { id: PAPER, count: 1 })!;
  assert.equal(mapZoom(zoomed), 1);
  assert.equal(zoomed.dmg, key, 'la celda base no cambia');
  assert.deepEqual(cartographyResult(map, { id: EMPTY_MAP, count: 1 }), { ...map, count: 2, data: {} }, 'copia');
  const locked = cartographyResult(map, { id: GLASS_PANE, count: 1 })!;
  assert.ok(mapLocked(locked));
  assert.equal(cartographyResult(locked, { id: PAPER, count: 1 }), null, 'el bloqueado no se amplía');
  assert.equal(cartographyResult(locked, { id: EMPTY_MAP, count: 1 })?.count, 2, 'pero se copia');
  let m = map;
  for (let i = 0; i < MAX_MAP_ZOOM; i++) m = cartographyResult(m, { id: PAPER, count: 1 })!;
  assert.equal(cartographyResult(m, { id: PAPER, count: 1 }), null, 'como mucho 1:16');
  // Mesa de trabajo: el mapa rodeado de papel.
  const P: ItemStack = { id: PAPER, count: 1 };
  assert.equal(mapZoom(mapExtendCraft([P, P, P, P, map, P, P, P, P])), 1);
  assert.equal(mapExtendCraft([P, P, P, P, map, P, P, P, null]), null);
  // Los datos viajan acotados.
  assert.deepEqual(sanitizeItemData(FILLED_MAP, { mz: 3, lock: 1 }), { mz: 3, lock: 1 });
  assert.equal(sanitizeItemData(FILLED_MAP, { mz: 9, lock: 'sí' }), undefined);
});

test('reparar juntando dos objetos: usos de los dos más un 5 % y sólo las maldiciones', () => {
  const id = TOOLS.iron.pickaxe;
  const max = maxDurability(id);
  const a: ItemStack = { id, count: 1, dmg: max - 100, data: { ench: [[SHARPNESS, 3], [VANISHING_CURSE, 1]] } };
  const b: ItemStack = { id, count: 1, dmg: max - 50 };
  const r = repairCraft([a, null, b, null])!;
  assert.equal(max - (r.dmg ?? 0), 100 + 50 + Math.floor(max / 20));
  assert.deepEqual(r.data, { ench: [[VANISHING_CURSE, 1]] }, 'pierde el filo, se queda la maldición');
  assert.equal(repairCraft([a, { id: TOOLS.diamond.pickaxe, count: 1 }]), null, 'han de ser iguales');
  assert.equal(repairCraft([{ id: PAPER, count: 1 }, { id: PAPER, count: 1 }]), null, 'y desgastarse');
  assert.equal(repairCraft([{ id, count: 1, dmg: 5 }, { id, count: 1, dmg: 5 }])?.dmg, undefined, 'como nuevo como mucho');
});

test('escudo con estandarte', () => {
  const banner: ItemStack = { id: BANNERS.red, count: 1, data: { layers: [[1, 4], [3, 11]] } };
  const shield: ItemStack = { id: SHIELD, count: 1, dmg: 20, data: { ench: [[VANISHING_CURSE, 1]] } };
  const r = shieldDecorCraft([shield, banner])!;
  assert.equal(r.dmg, 20, 'conserva el desgaste');
  assert.deepEqual(r.data, { ench: [[VANISHING_CURSE, 1]], sb: 14, layers: [[1, 4], [3, 11]] });
  assert.equal(shieldDecorCraft([r, banner]), null, 'uno decorado no se vuelve a decorar');
  assert.deepEqual(sanitizeItemData(SHIELD, { sb: 14, layers: [[1, 4]] }), { sb: 14, layers: [[1, 4]] });
});
