// Libro de recetas (Fase 9): el catálogo que ve el jugador y cómo se coloca una receta en la cuadrícula. Sin
// interfaz ni estado: la lista de recetas (fabricación y hornos), sus pestañas, qué las desbloquea, si se pueden
// hacer con lo que se lleva, cómo se rellena la cuadrícula y cómo se busca.
//
// - Pestañas como las de Java: la mesa de trabajo (bloques de construcción, redstone, equipo y varios) y los hornos
//   (comida, bloques y varios; el alto horno sin comida y el ahumador sin pestañas).
// - Desbloqueo: una receta aparece al tener el ingrediente principal (el que más celdas ocupa; a igualdad, el
//   primero), como pasa en Java con el objeto que la desbloquea, o al poder hacerla con lo que se lleva.
// - Rellenar: cada ingrediente usa lo que más hay en el inventario (el mismo objeto en todas sus celdas); con
//   `many`, tantas veces como dé el material sin pasar de una pila.
import { ITEMS, itemName, maxStack, type ItemStack } from './items';
import { BLOCKS } from './blocks';
import { craftRecipes } from './recipes';
import { variantSmelts, type FurnaceVariant } from './containers';

export type BookKind = 'craft' | 'furnace' | 'smoker' | 'blast';
export type BookTab = 'building' | 'redstone' | 'equipment' | 'misc' | 'food' | 'blocks';

/** Un ingrediente distinto de la receta: los objetos que valen y cuántas celdas ocupa. */
export interface Need {
  alts: readonly number[];
  n: number;
}

export interface BookRecipe {
  /** Clave estable (de 32 bits) con la que se guarda que está desbloqueada. */
  key: number;
  kind: BookKind;
  out: ItemStack;
  shapeless: boolean;
  w: number;
  h: number;
  cells: readonly (readonly number[] | null)[];
  needs: readonly Need[];
  /** Los objetos que la desbloquean al tenerlos. */
  primary: readonly number[];
  tab: BookTab;
}

/** Todas las recetas con la misma salida, para que el libro muestre una sola casilla. */
export interface RecipeGroup {
  out: number;
  recipes: BookRecipe[];
  tab: BookTab;
}

const sig = (alts: readonly number[]) => alts.join(',');

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

// ------------------------------------------------------------------ pestañas

const REDSTONE_KEY = /(^|_)(door|trapdoor|fence_gate|pressure_plate|button|lever|piston|dispenser|dropper|hopper|observer|comparator|repeater|rail|tnt|note_block|redstone|lamp|daylight_detector|target|tripwire_hook|sculk_sensor|calibrated_sculk_sensor|lectern|bell|trapped_chest|crafter|copper_bulb|lightning_rod|slime_block|honey_block|minecart|hopper_minecart|tnt_minecart)(_|$)/;
const EQUIPMENT_KEY = /^(bow|crossbow|shield|shears|fishing_rod|flint_and_steel|carrot_on_a_stick|warped_fungus_on_a_stick|spyglass|brush|arrow|spectral_arrow|elytra|turtle_helmet|lead|saddle|trident|mace|compass|recovery_compass|clock)$|(_horse_armor|_wolf_armor|_helmet|_chestplate|_leggings|_boots|_sword|_pickaxe|_axe|_shovel|_hoe)$/;

function craftTab(id: number): BookTab {
  const def = ITEMS[id];
  if (!def) return 'misc';
  if (def.tool || def.armor || EQUIPMENT_KEY.test(def.key)) return 'equipment';
  if (REDSTONE_KEY.test(def.key)) return 'redstone';
  if (def.block !== undefined) {
    const c = BLOCKS[def.block]?.category;
    if (c === 'redstone') return 'redstone';
    if (c === 'construccion' || c === 'minerales' || c === 'colores' || c === 'naturaleza') return 'building';
  }
  return 'misc';
}

function furnaceTab(kind: BookKind, out: number): BookTab {
  const def = ITEMS[out];
  if (kind !== 'blast' && def?.food) return 'food';
  return def?.block !== undefined ? 'blocks' : 'misc';
}

/** Las pestañas de cada libro (vacío: una sola lista). */
export function tabsFor(kind: BookKind): BookTab[] {
  return kind === 'craft' ? ['building', 'redstone', 'equipment', 'misc'] : kind === 'furnace' ? ['food', 'blocks', 'misc'] : kind === 'blast' ? ['blocks', 'misc'] : [];
}

export const TAB_LABEL: Record<BookTab, string> = {
  building: 'Bloques de construcción', redstone: 'Redstone', equipment: 'Equipo', misc: 'Varios', food: 'Comida', blocks: 'Bloques',
};

// ------------------------------------------------------------------ el catálogo

function needsOf(cells: readonly (readonly number[] | null)[]): Need[] {
  const out: Need[] = [];
  for (const c of cells) {
    if (!c) continue;
    const k = sig(c);
    const n = out.find((x) => sig(x.alts) === k);
    if (n) n.n++;
    else out.push({ alts: c, n: 1 });
  }
  return out;
}

function make(kind: BookKind, cells: BookRecipe['cells'], w: number, h: number, shapeless: boolean, out: ItemStack): BookRecipe {
  const needs = needsOf(cells);
  // El principal: el ingrediente que más celdas ocupa (a igualdad, el primero).
  let primary = needs[0]?.alts ?? [];
  let best = 0;
  for (const n of needs) {
    if (n.n > best) {
      best = n.n;
      primary = n.alts;
    }
  }
  const tab = kind === 'craft' ? craftTab(out.id) : furnaceTab(kind, out.id);
  const key = hash32(`${kind}|${out.id}x${out.count}|${w}x${h}${shapeless ? 's' : ''}|${cells.map((c) => (c ? sig(c) : '-')).join(';')}`);
  return { key, kind, out, shapeless, w, h, cells, needs, primary, tab };
}

const cache = new Map<BookKind, BookRecipe[]>();

/** Las recetas de un libro (fabricación, horno, ahumador o alto horno). */
export function bookRecipes(kind: BookKind): readonly BookRecipe[] {
  let list = cache.get(kind);
  if (list) return list;
  list = [];
  if (kind === 'craft') {
    for (const r of craftRecipes()) list.push(make('craft', r.cells, r.w, r.h, r.shapeless, r.out));
  } else {
    const variant: FurnaceVariant = kind === 'smoker' ? 1 : kind === 'blast' ? 2 : 0;
    for (const def of ITEMS) {
      if (!def || def.smelt === undefined || !variantSmelts(variant, def.id)) continue;
      list.push(make(kind, [[def.id]], 1, 1, true, { id: def.smelt, count: 1 }));
    }
  }
  cache.set(kind, list);
  return list;
}

const groups = new Map<BookKind, RecipeGroup[]>();

/** Las casillas del libro: una por objeto que se puede obtener, por orden de objeto. */
export function recipeGroups(kind: BookKind): readonly RecipeGroup[] {
  let list = groups.get(kind);
  if (list) return list;
  const by = new Map<number, RecipeGroup>();
  for (const r of bookRecipes(kind)) {
    const g = by.get(r.out.id);
    if (g) g.recipes.push(r);
    else by.set(r.out.id, { out: r.out.id, recipes: [r], tab: r.tab });
  }
  list = [...by.values()].sort((a, b) => a.out - b.out);
  groups.set(kind, list);
  return list;
}

// ------------------------------------------------------------------ desbloqueo

let byPrimary: Map<number, BookRecipe[]> | null = null;

function primaryIndex(): Map<number, BookRecipe[]> {
  if (byPrimary) return byPrimary;
  byPrimary = new Map();
  for (const kind of ['craft', 'furnace', 'smoker', 'blast'] as const) {
    for (const r of bookRecipes(kind)) {
      for (const id of r.primary) {
        const l = byPrimary.get(id);
        if (l) l.push(r);
        else byPrimary.set(id, [r]);
      }
    }
  }
  return byPrimary;
}

/** Las recetas que desbloquea tener alguno de estos objetos. */
export function recipesFor(ids: Iterable<number>): BookRecipe[] {
  const idx = primaryIndex();
  const seen = new Set<BookRecipe>();
  for (const id of ids) for (const r of idx.get(id) ?? []) seen.add(r);
  return [...seen];
}

// ------------------------------------------------------------------ material y colocación

/** Cuántos hay de cada objeto en estas ranuras. */
export function stockOf(slots: readonly (ItemStack | null)[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const s of slots) if (s && s.count > 0) m.set(s.id, (m.get(s.id) ?? 0) + s.count);
  return m;
}

export interface FillPlan {
  /** Objeto de cada celda de una cuadrícula de `size` × `size` (0: vacía). */
  cells: number[];
  /** Cuántos de cada uno lleva cada celda (las veces que se fabrica). */
  n: number;
}

/**
 * Cómo colocar la receta en una cuadrícula de `size` × `size` con este material, o null si no cabe o falta algo.
 * Con `many`, las veces que dé el material sin pasar de una pila.
 */
export function planFill(r: BookRecipe, size: number, stock: ReadonlyMap<number, number>, many = false): FillPlan | null {
  if (r.shapeless ? r.cells.length > size * size : r.w > size || r.h > size) return null;
  const left = new Map(stock);
  const pick = new Map<string, number>();
  for (const need of r.needs) {
    let best = 0, bestN = -1;
    for (const id of need.alts) {
      const have = left.get(id) ?? 0;
      if (have >= need.n && have > bestN) {
        best = id;
        bestN = have;
      }
    }
    if (!best) return null;
    left.set(best, bestN - need.n);
    pick.set(sig(need.alts), best);
  }
  let n = 1;
  if (many) {
    // Cuánto pide cada objeto elegido por craft y cuántas veces da lo que hay (sin pasar de una pila).
    const per = new Map<number, number>();
    for (const need of r.needs) {
      const id = pick.get(sig(need.alts))!;
      per.set(id, (per.get(id) ?? 0) + need.n);
    }
    n = 64;
    for (const [id, p] of per) n = Math.min(n, Math.floor((stock.get(id) ?? 0) / p), maxStack(id));
    n = Math.max(1, n);
  }
  const cells = new Array<number>(size * size).fill(0);
  r.cells.forEach((c, i) => {
    if (!c) return;
    const at = r.shapeless ? i : Math.floor(i / r.w) * size + (i % r.w);
    cells[at] = pick.get(sig(c))!;
  });
  return { cells, n };
}

// ------------------------------------------------------------------ búsqueda

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** ¿El nombre del objeto de salida contiene el texto? (sin mayúsculas ni tildes). */
export function matchesQuery(out: number, query: string): boolean {
  const q = plain(query.trim());
  return q === '' || plain(itemName(out)).includes(q);
}
