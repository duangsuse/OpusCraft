// Fase 8.5 (lo que da el Nether): la mesa de herrería (SmithingMenu y las recetas smithing_transform de la 26.3).
// Tres huecos: la plantilla, el objeto base y el material. La mejora de netherita toma una pieza de diamante, la
// plantilla y un lingote de netherita, y devuelve la misma pieza en netherita con todo lo que llevaba (encantamientos,
// desgaste, nombre y penalización del yunque): sólo cambia el objeto. Cada hueco gasta uno. La lanza y la armadura
// de nautilo de netherita llegarán con ellas (fase 9); los adornos de armadura (smithing_trim), también.
import { TOOLS, ARMOR, HORSE_ARMOR, NETHERITE_INGOT, NETHERITE_UPGRADE_SMITHING_TEMPLATE, type ItemStack } from './items';
import { cloneItemData } from './itemData';

export const SMITH_TEMPLATE = 0;
export const SMITH_BASE = 1;
export const SMITH_ADDITION = 2;

/** Mejoras de netherita: pieza de diamante → la de netherita. */
const UPGRADES = new Map<number, number>();
for (const kind of ['sword', 'pickaxe', 'axe', 'shovel', 'hoe']) UPGRADES.set(TOOLS.diamond[kind], TOOLS.netherite[kind]);
for (const piece of ['helmet', 'chestplate', 'leggings', 'boots']) UPGRADES.set(ARMOR.diamond[piece], ARMOR.netherite[piece]);
UPGRADES.set(HORSE_ARMOR.diamond, HORSE_ARMOR.netherite);

/** Materiales de la mejora (la etiqueta netherite_tool_materials: el lingote). */
const ADDITIONS: ReadonlySet<number> = new Set([NETHERITE_INGOT]);
const TEMPLATES: ReadonlySet<number> = new Set([NETHERITE_UPGRADE_SMITHING_TEMPLATE]);

/** ¿Admite el hueco `slot` este objeto? (como los filtros de SmithingMenu). */
export function smithingAccepts(slot: number, id: number): boolean {
  if (slot === SMITH_TEMPLATE) return TEMPLATES.has(id);
  if (slot === SMITH_BASE) return UPGRADES.has(id);
  if (slot === SMITH_ADDITION) return ADDITIONS.has(id);
  return false;
}

/** Lo que sale de la mesa con esos tres huecos (null si no hay receta). */
export function smithingResult(template: ItemStack | null, base: ItemStack | null, addition: ItemStack | null): ItemStack | null {
  if (!template || !base || !addition) return null;
  if (!TEMPLATES.has(template.id) || !ADDITIONS.has(addition.id)) return null;
  const to = UPGRADES.get(base.id);
  if (to === undefined) return null;
  const out: ItemStack = { id: to, count: 1 };
  if (base.dmg) out.dmg = base.dmg;
  if (base.data) out.data = cloneItemData(base.data);
  return out;
}

/** Lo que queda en los huecos al coger el resultado (se gasta uno de cada). */
export function smithingConsume(grid: (ItemStack | null)[]): void {
  for (const i of [SMITH_TEMPLATE, SMITH_BASE, SMITH_ADDITION]) {
    const s = grid[i];
    if (!s) continue;
    grid[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
  }
}
