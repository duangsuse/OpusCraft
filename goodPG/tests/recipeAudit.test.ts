// Fase 7.6 (auditoría de recetas): las recetas de Minecraft cuyos objetos ya existían y no se fabricaban.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COBBLESTONE, DIORITE, GRANITE, QUARTZ_BLOCK, DRIPSTONE_BLOCK, POINTED_DRIPSTONE, MUD, MANGROVE_ROOTS, MUDDY_MANGROVE_ROOTS,
  CARPETS, COPPER_BULB, COPPER, COAL_ORE, DEEPSLATE_ORE, DIAMOND_ORE, SEA_PICKLE, RED_MUSHROOM,
} from '../src/shared/blocks';
import {
  QUARTZ, DYES, REDSTONE, BLAZE_ROD, COAL, DIAMOND, IRON_NUGGET, GOLD_NUGGET, TOOLS, ARMOR, HORSE_ARMOR, BOWL, MUSHROOM_STEW,
} from '../src/shared/items';
import { matchRecipe } from '../src/shared/recipes';
import { smeltResult, variantSmelts } from '../src/shared/containers';

test('recetas que faltaban: cuarzo, espeleotema, barro, alfombras y bombillas enceradas', () => {
  const r = (grid: number[]) => matchRecipe(grid, 3)?.out;
  assert.deepEqual(r([COBBLESTONE, QUARTZ, 0, QUARTZ, COBBLESTONE, 0, 0, 0, 0]), { id: DIORITE, count: 2 });
  assert.deepEqual(r([DIORITE, QUARTZ, 0, 0, 0, 0, 0, 0, 0]), { id: GRANITE, count: 1 });
  assert.equal(r([QUARTZ, QUARTZ, 0, QUARTZ, QUARTZ, 0, 0, 0, 0])?.id, QUARTZ_BLOCK);
  assert.equal(r([POINTED_DRIPSTONE, POINTED_DRIPSTONE, 0, POINTED_DRIPSTONE, POINTED_DRIPSTONE, 0, 0, 0, 0])?.id, DRIPSTONE_BLOCK);
  assert.equal(r([MUD, MANGROVE_ROOTS, 0, 0, 0, 0, 0, 0, 0])?.id, MUDDY_MANGROVE_ROOTS);
  assert.equal(r([DYES.red, CARPETS.white, 0, 0, 0, 0, 0, 0, 0])?.id, CARPETS.red, 'se vuelve a teñir una alfombra');
  assert.deepEqual(r([0, COPPER.block[1][0], 0, COPPER.block[1][0], BLAZE_ROD, COPPER.block[1][0], 0, REDSTONE, 0]), { id: COPPER_BULB[1][0], count: 4 });
  assert.equal(r([RED_MUSHROOM, RED_MUSHROOM, BOWL, 0, 0, 0, 0, 0, 0])?.id, MUSHROOM_STEW, 'dos champiñones cualesquiera');
});

test('fundición: menas con Toque de seda, pepitas de las herramientas y el pepino de mar', () => {
  assert.equal(smeltResult(COAL_ORE), COAL);
  assert.equal(smeltResult(DEEPSLATE_ORE[DIAMOND_ORE]), DIAMOND);
  assert.equal(smeltResult(TOOLS.iron.pickaxe), IRON_NUGGET);
  assert.equal(smeltResult(ARMOR.chainmail.helmet), IRON_NUGGET);
  assert.equal(smeltResult(HORSE_ARMOR.golden), GOLD_NUGGET);
  assert.equal(smeltResult(SEA_PICKLE), DYES.lime);
  assert.ok(variantSmelts(2, DIAMOND_ORE) && variantSmelts(2, TOOLS.golden.sword), 'el alto horno también');
  assert.ok(!variantSmelts(2, SEA_PICKLE), 'el pepino de mar, sólo en el horno');
});
