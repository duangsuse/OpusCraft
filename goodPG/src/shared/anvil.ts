// Fase 7 (encantamientos): el yunque y la afiladora, con las reglas de Minecraft Java.
// Yunque (izquierda + derecha → resultado):
// - reparar con el material (cada unidad devuelve un cuarto de la durabilidad), con otro objeto igual
//   (se suman las durabilidades más un 12 %) y juntar sus encantamientos (el mismo nivel sube uno);
// - poner los de un libro encantado (cuestan la mitad) o combinar dos libros;
// - renombrar (también las etiquetas: el nombre pasa a la criatura);
// - coste en niveles: lo que se hace más la penalización por trabajo previo de las dos piezas, que se
//   dobla (+1) cada vez; desde 40 niveles, «¡Demasiado caro!» (salvo en creativo o si sólo se renombra).
// Afiladora: quita los encantamientos (no las maldiciones) y devuelve experiencia; con dos objetos
// iguales los repara (se suman las durabilidades más un 5 %).
import {
  ITEMS, BOOK, ENCHANTED_BOOK, IRON_INGOT, GOLD_INGOT, DIAMOND, COPPER_INGOT, NETHERITE_INGOT, PHANTOM_MEMBRANE, LEATHER, TURTLE_SCUTE, ARMADILLO_SCUTE, WOLF_ARMOR,
  SHIELD, type ItemStack,
} from './items';
import { ALL_PLANKS, COBBLESTONE, COBBLED_DEEPSLATE } from './blocks';
import {
  ENCHANTS, enchantsForAnvil, inCategory, compatible, maxDurability, minCost, withEnchants, type EnchList,
} from './enchantments';
import { sanitizeItemName, stackName } from './itemData';

/** Niveles a partir de los que el yunque dice «¡Demasiado caro!». */
export const TOO_EXPENSIVE = 40;
/** Probabilidad de que el yunque se deteriore en cada uso (Minecraft: 12 %). */
export const ANVIL_BREAK_CHANCE = 0.12;

// ------------------------------------------------------------------ materiales de reparación

/** Material con que se repara cada objeto (Minecraft 26.3). */
function repairMaterials(id: number): readonly number[] {
  const def = ITEMS[id];
  if (!def) return [];
  if (id === SHIELD) return ALL_PLANKS;
  if (id === WOLF_ARMOR) return [ARMADILLO_SCUTE];
  const a = def.armor;
  if (a && a.durability > 0) {
    switch (a.material) {
      case 'leather': return [LEATHER];
      case 'chainmail': case 'iron': return [IRON_INGOT];
      case 'golden': return [GOLD_INGOT];
      case 'diamond': return [DIAMOND];
      case 'copper': return [COPPER_INGOT];
      case 'turtle': return [TURTLE_SCUTE];
      case 'netherite': return [NETHERITE_INGOT]; // Fase 8.5
      case 'elytra': return [PHANTOM_MEMBRANE]; // Fase 8.6
    }
    return [];
  }
  const kind = def.tool?.kind;
  if (kind !== 'sword' && kind !== 'pickaxe' && kind !== 'axe' && kind !== 'shovel' && kind !== 'hoe') return [];
  switch (def.key.slice(0, def.key.indexOf('_'))) {
    case 'wooden': return ALL_PLANKS;
    case 'stone': return [COBBLESTONE, COBBLED_DEEPSLATE];
    case 'iron': return [IRON_INGOT];
    case 'golden': return [GOLD_INGOT];
    case 'diamond': return [DIAMOND];
    case 'copper': return [COPPER_INGOT];
    case 'netherite': return [NETHERITE_INGOT]; // Fase 8.5
  }
  return [];
}

/** ¿Repara `material` al objeto `id`? */
export function isRepairMaterial(id: number, material: number): boolean {
  return repairMaterials(id).includes(material);
}

/** Penalización por trabajo previo de una pila. */
export function repairCost(s: ItemStack | null | undefined): number {
  return s?.data?.rc ?? 0;
}

/** La penalización sube así cada vez que la pieza pasa por el yunque. */
export function nextRepairCost(c: number): number {
  return Math.min(0x7fffffff, c * 2 + 1);
}

// ------------------------------------------------------------------ yunque

export interface AnvilResult {
  /** Lo que sale (null si no se puede coger: nada que hacer o demasiado caro). */
  out: ItemStack | null;
  /** Niveles que cuesta. */
  cost: number;
  /** Unidades de material que gasta la reparación (0: se gasta entera la pila de la derecha). */
  material: number;
  /** El coste llega a 40 o más (y no es creativo). */
  tooExpensive: boolean;
}

const NONE: AnvilResult = { out: null, cost: 0, material: 0, tooExpensive: false };

/** Copia con datos propios (para cambiar desgaste, nombre y penalización sin tocar la entrada). */
function copyStack(s: ItemStack): ItemStack {
  const c: ItemStack = { ...s };
  if (s.data) c.data = { ...s.data };
  return c;
}

/**
 * Resultado del yunque con `left` y `right` y el texto del nombre (`name`; null o igual al nombre actual:
 * no se renombra; vacío: se quita el nombre puesto). `creative`: sin límite de coste.
 */
export function anvilResult(left: ItemStack | null, right: ItemStack | null, name: string | null, creative = false): AnvilResult {
  if (!left) return NONE;
  let out = copyStack(left);
  const list: EnchList = enchantsForAnvil(left).map((e): [number, number] => [e[0], e[1]]);
  let work = 0;
  const prior = repairCost(left) + (right ? repairCost(right) : 0);
  let material = 0;
  const maxDmg = maxDurability(out.id);
  if (right) {
    const book = right.id === ENCHANTED_BOOK && enchantsForAnvil(right).length > 0;
    if (maxDmg > 0 && isRepairMaterial(out.id, right.id)) {
      // Reparar con el material: cada unidad, un cuarto de la durabilidad.
      let k = Math.min(out.dmg ?? 0, Math.floor(maxDmg / 4));
      if (k <= 0) return NONE;
      let m = 0;
      for (; k > 0 && m < right.count; m++) {
        out.dmg = (out.dmg ?? 0) - k;
        work++;
        k = Math.min(out.dmg, Math.floor(maxDmg / 4));
      }
      if (!out.dmg) delete out.dmg;
      material = m;
    } else {
      if (!book && (right.id !== out.id || maxDmg <= 0)) return NONE;
      // Dos objetos iguales: se suman las durabilidades más un 12 % de la máxima.
      if (maxDmg > 0 && !book) {
        const leftLeft = maxDmg - (left.dmg ?? 0);
        const rightLeft = maxDmg - (right.dmg ?? 0);
        const sum = leftLeft + rightLeft + Math.floor((maxDmg * 12) / 100);
        const dmg = Math.max(maxDmg - sum, 0);
        if (dmg < (out.dmg ?? 0)) {
          if (dmg) out.dmg = dmg;
          else delete out.dmg;
          work += 2;
        }
      }
      let applied = false, rejected = false;
      for (const [id, lvlIn] of enchantsForAnvil(right)) {
        const e = ENCHANTS[id];
        if (!e) continue;
        const cur = list.find((x) => x[0] === id)?.[1] ?? 0;
        let lvl = cur === lvlIn ? lvlIn + 1 : Math.max(lvlIn, cur);
        let ok = creative || out.id === ENCHANTED_BOOK || inCategory(out.id, e.supported);
        for (const [other] of list) {
          if (other !== id && !compatible(id, other)) {
            ok = false;
            work++;
          }
        }
        if (!ok) {
          rejected = true;
          continue;
        }
        applied = true;
        if (lvl > e.max) lvl = e.max;
        const at = list.findIndex((x) => x[0] === id);
        if (at >= 0) list[at] = [id, lvl];
        else list.push([id, lvl]);
        const mult = book ? Math.max(1, Math.floor(e.anvil / 2)) : e.anvil;
        work += mult * lvl;
        if (left.count > 1) work = TOO_EXPENSIVE;
      }
      if (rejected && !applied) return NONE;
    }
  }
  // Nombre: vacío quita el que tenía; distinto del actual, se pone (cuesta 1).
  let rename = 0;
  const wanted = name === null ? null : sanitizeItemName(name);
  if (wanted !== null) {
    if (!wanted) {
      if (left.data?.name) {
        rename = 1;
        delete out.data!.name;
      }
    } else if (wanted !== stackName(left)) {
      rename = 1;
      out.data = { ...(out.data ?? {}), name: wanted };
    }
  }
  work += rename;
  if (work <= 0) return NONE;
  let cost = prior + work;
  // Sólo renombrar nunca es demasiado caro.
  if (rename === work && rename > 0 && cost >= TOO_EXPENSIVE) cost = TOO_EXPENSIVE - 1;
  const tooExpensive = cost >= TOO_EXPENSIVE && !creative;
  let rc = repairCost(out);
  if (right && rc < repairCost(right)) rc = repairCost(right);
  if (rename !== work || rename === 0) rc = nextRepairCost(rc);
  out = withEnchants(out, list);
  out.data = { ...(out.data ?? {}), rc };
  if (out.data.rc === 0) delete out.data.rc;
  if (Object.keys(out.data).length === 0) delete out.data;
  return { out: tooExpensive ? null : out, cost, material, tooExpensive };
}

/** Lo que queda en el hueco de la derecha al coger el resultado. */
export function anvilRightAfter(right: ItemStack | null, material: number): ItemStack | null {
  if (!right || material <= 0) return null;
  return right.count > material ? { ...right, count: right.count - material } : null;
}

// ------------------------------------------------------------------ afiladora

/** ¿Es una maldición? */
function isCurse(id: number): boolean {
  return !!ENCHANTS[id]?.curse;
}

/** Deja sólo las maldiciones; un libro que se queda sin nada vuelve a ser un libro. La penalización se recalcula. */
function removeNonCurses(s: ItemStack): ItemStack {
  const keep = enchantsForAnvil(s).filter(([id]) => isCurse(id));
  let out = withEnchants(s, keep);
  if (out.id === ENCHANTED_BOOK && keep.length === 0) {
    out = { id: BOOK, count: out.count };
    if (s.data?.name) out.data = { name: s.data.name };
  }
  let rc = 0;
  for (let i = 0; i < keep.length; i++) rc = nextRepairCost(rc);
  if (rc) out.data = { ...(out.data ?? {}), rc };
  else if (out.data) {
    delete out.data.rc;
    if (Object.keys(out.data).length === 0) delete out.data;
  }
  return out;
}

/** Resultado de la afiladora con las dos entradas (null si no hace nada). */
export function grindstoneResult(a: ItemStack | null, b: ItemStack | null): ItemStack | null {
  if (!a && !b) return null;
  if (a && b) {
    if (a.count > 1 || b.count > 1 || a.id !== b.id) return null;
    // Dos objetos: sólo los que se desgastan (se reparan juntando su durabilidad).
    const max = maxDurability(a.id);
    if (max <= 0) return null;
    const sum = max - (a.dmg ?? 0) + (max - (b.dmg ?? 0)) + Math.floor((max * 5) / 100);
    const out = copyStack(a);
    const dmg = Math.max(max - sum, 0);
    if (dmg) out.dmg = dmg;
    else delete out.dmg;
    // Las maldiciones de las dos piezas pasan al resultado.
    const curses = enchantsForAnvil(a).filter(([id]) => isCurse(id));
    for (const [id, lvl] of enchantsForAnvil(b)) if (isCurse(id) && !curses.some((c) => c[0] === id)) curses.push([id, lvl]);
    return removeNonCurses(withEnchants(out, [...enchantsForAnvil(out).filter(([id]) => !isCurse(id)), ...curses]));
  }
  const s = (a ?? b)!;
  const list = enchantsForAnvil(s);
  if (list.length === 0) return null;
  return removeNonCurses(copyStack(s));
}

/**
 * Experiencia que devuelve la afiladora: la suma del coste mínimo de cada encantamiento que se quita
 * (no las maldiciones); sale entre la mitad y el total (redondeando hacia arriba).
 */
export function grindstoneXp(a: ItemStack | null, b: ItemStack | null, rand: () => number = Math.random): number {
  let sum = 0;
  for (const s of [a, b]) {
    if (!s) continue;
    for (const [id, lvl] of enchantsForAnvil(s)) if (!isCurse(id)) sum += minCost(id, lvl);
  }
  if (sum <= 0) return 0;
  const j = Math.ceil(sum / 2);
  return j + Math.floor(rand() * j);
}
