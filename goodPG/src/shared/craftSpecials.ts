// Fase 7.6 (sistemas sueltos): recetas especiales de la cuadrícula que miran las pilas, como en Minecraft.
// - Reparar: dos objetos iguales que se desgastan dan uno con los usos de los dos más un 5 % del máximo;
//   pierde los encantamientos salvo las maldiciones.
// - Escudo con estandarte: un escudo sin decorar y un estandarte dan el escudo con el dibujo del
//   estandarte (conserva su desgaste y sus encantamientos).
import { SHIELD, DYES, type ItemStack } from './items';
import { isShulkerBox, SHULKER_BOXES, DYE_COLORS, type DyeColor } from './blocks'; // Fase 8.6
import { maxDurability, enchantsOf, ENCHANTS } from './enchantments';
import { bannerColor, isBannerItem } from './bannerPatterns';

/** Las pilas no vacías de la cuadrícula. */
const filled = (grid: readonly (ItemStack | null)[]) => grid.filter((s): s is ItemStack => !!s && s.count > 0);

/** Reparación juntando dos objetos iguales (null si no es esta receta). */
export function repairCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const items = filled(grid);
  if (items.length !== 2) return null;
  const [a, b] = items;
  const max = maxDurability(a.id);
  if (a.id !== b.id || max <= 0 || a.count !== 1 || b.count !== 1) return null;
  const uses = (s: ItemStack) => max - (s.dmg ?? 0);
  const left = Math.min(max, uses(a) + uses(b) + Math.floor(max / 20));
  const curses = [...enchantsOf(a), ...enchantsOf(b)].filter(([id], i, all) => ENCHANTS[id]?.curse && all.findIndex((e) => e[0] === id) === i);
  const out: ItemStack = { id: a.id, count: 1 };
  if (max - left > 0) out.dmg = max - left;
  if (curses.length) out.data = { ench: curses.map((e): [number, number] => [e[0], e[1]]) };
  return out;
}

/**
 * Fase 8.6 (ShulkerBoxColoring): una caja de shulker y un tinte dan la caja de ese color, con lo que llevaba dentro.
 */
export function shulkerDyeCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const items = filled(grid);
  if (items.length !== 2) return null;
  const box = items.find((s) => isShulkerBox(s.id));
  const dye = items.find((s) => DYE_OF.has(s.id));
  if (!box || !dye || box.count !== 1) return null;
  return { ...box, id: SHULKER_BOXES[DYE_OF.get(dye.id)!], count: 1 };
}
const DYE_OF = new Map<number, DyeColor>(DYE_COLORS.map((c) => [DYES[c], c]));

/**
 * BannerDuplicateRecipe: un estandarte con dibujos y otro liso del mismo color dan una copia; el original se queda en
 * su hueco (`keep`). null si no es esta receta.
 */
export function bannerCopyCraft(grid: readonly (ItemStack | null)[]): { out: ItemStack; keep: number } | null {
  let patterned = -1, blank = -1;
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    if (!isBannerItem(s.id)) return null;
    const layers = s.data?.layers?.length ?? 0;
    if (layers > 0 && patterned < 0) patterned = i;
    else if (layers === 0 && blank < 0) blank = i;
    else return null;
  }
  if (patterned < 0 || blank < 0 || grid[patterned]!.id !== grid[blank]!.id) return null;
  const src = grid[patterned]!;
  return { out: { ...src, count: 1, data: { ...src.data, layers: src.data!.layers!.map((l): [number, number] => [l[0], l[1]]) } }, keep: patterned };
}

/** Escudo decorado con un estandarte (null si no es esta receta). */
export function shieldDecorCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  const items = filled(grid);
  if (items.length !== 2) return null;
  const shield = items.find((s) => s.id === SHIELD);
  const banner = items.find((s) => isBannerItem(s.id));
  if (!shield || !banner || shield.data?.sb !== undefined) return null;
  const data = { ...(shield.data ?? {}), sb: bannerColor(banner.id) };
  const layers = banner.data?.layers;
  return { ...shield, count: 1, data: layers?.length ? { ...data, layers: layers.map((l): [number, number] => [l[0], l[1]]) } : data };
}
