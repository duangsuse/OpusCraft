// Fase 7 (encantamientos): la mesa de encantamientos y las tiradas de encantamientos al azar, con el
// algoritmo de Minecraft Java y su generador de números (java.util.Random), para que las ofertas que se
// ven (coste y pista) sean justo las que se consiguen:
// - librerías alrededor (a 2 bloques, con aire en medio; como mucho 15 cuentan);
// - tres ofertas con su coste en niveles a partir de la semilla de encantamiento del jugador (cambia
//   cada vez que encanta algo) y una pista (un encantamiento de los que saldrán);
// - al encantar: los encantamientos de la oferta, 1/2/3 niveles y 1/2/3 lapislázulis;
// - tiradas del botín y del comercio: «encantar al azar» y «encantar con N niveles».
import { BOOK, ENCHANTED_BOOK, type ItemStack } from './items';
import { BOOKSHELF, BLOCK_REPLACEABLE } from './blocks';
import {
  ENCHANTS, ENCHANT_IDS, enchantability, isPrimaryFor, canApply, compatible, minCost, maxCost, withEnchants, enchantsOf,
  type EnchList,
} from './enchantments';

// ------------------------------------------------------------------ generador de Java

const MULT = 0x5deece66dn;
const MASK = (1n << 48n) - 1n;

/** Generador de números de Java (java.util.Random: congruencial lineal de 48 bits). */
export class JavaRandom {
  private seed = 0n;

  constructor(seed = 0) {
    this.setSeed(seed);
  }

  setSeed(seed: number): void {
    this.seed = (BigInt(Math.trunc(seed)) ^ MULT) & MASK;
  }

  private next(bits: number): number {
    this.seed = (this.seed * MULT + 0xbn) & MASK;
    return Number(BigInt.asIntN(32, this.seed >> BigInt(48 - bits)));
  }

  /** Entero en [0, bound) (o de 32 bits con signo, sin límite). */
  nextInt(bound?: number): number {
    if (bound === undefined) return this.next(32);
    if (bound <= 0) throw new Error('bound must be positive');
    if ((bound & -bound) === bound) return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
    let bits: number, val: number;
    do {
      bits = this.next(31);
      val = bits % bound;
    } while (((bits - val + (bound - 1)) | 0) < 0);
    return val;
  }

  nextFloat(): number {
    return this.next(24) / (1 << 24);
  }
}

/** Lo mínimo que necesitan las tiradas: un entero en [0, n) y un flotante en [0, 1). */
export interface Rnd {
  nextInt(bound: number): number;
  nextFloat(): number;
}

/** Adapta un generador de flotantes (Math.random, el del servidor) a Rnd. */
export function rndFrom(rand: () => number): Rnd {
  return {
    nextInt: (n) => Math.min(n - 1, Math.floor(rand() * n)),
    nextFloat: () => rand(),
  };
}

// ------------------------------------------------------------------ librerías

/** Posiciones de las librerías que cuentan (a 2 bloques, en la altura de la mesa y la de encima). */
export const BOOKSHELF_OFFSETS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = [];
  for (let dy = 0; dy <= 1; dy++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) === 2 || Math.abs(dz) === 2) out.push([dx, dy, dz]);
    }
  }
  return out;
})();

/** Librerías que cuentan como mucho. */
export const MAX_BOOKSHELVES = 15;

type GetBlock = (x: number, y: number, z: number) => number;

/**
 * ¿Cuenta la librería en `off` para la mesa de (x, y, z)? Tiene que haber una librería y, en la casilla
 * de en medio (camino de la mesa), aire o algo que se reemplace (hierba, nieve fina…), como en Minecraft.
 */
export function bookshelfCounts(get: GetBlock, x: number, y: number, z: number, off: readonly [number, number, number]): boolean {
  if (get(x + off[0], y + off[1], z + off[2]) !== BOOKSHELF) return false;
  const mid = get(x + Math.trunc(off[0] / 2), y + off[1], z + Math.trunc(off[2] / 2));
  return mid >= 0 && BLOCK_REPLACEABLE[mid] === 1;
}

/** Librerías que alimentan la mesa de (x, y, z) (0..15). */
export function countBookshelves(get: GetBlock, x: number, y: number, z: number): number {
  let n = 0;
  for (const off of BOOKSHELF_OFFSETS) if (bookshelfCounts(get, x, y, z, off)) n++;
  return Math.min(MAX_BOOKSHELVES, n);
}

// ------------------------------------------------------------------ selección de encantamientos

/** Tirada con pesos (WeightedRandom de Minecraft). */
function weightedPick(r: Rnd, list: EnchList): [number, number] | null {
  let total = 0;
  for (const [id] of list) total += ENCHANTS[id].weight;
  if (total <= 0) return null;
  let i = r.nextInt(total);
  for (const e of list) {
    i -= ENCHANTS[e[0]].weight;
    if (i < 0) return e;
  }
  return null;
}

/**
 * Encantamientos posibles con un poder `power`: para cada uno, el nivel más alto cuyo intervalo de
 * coste contiene el poder. `pool` filtra los que se admiten (la mesa no da tesoros).
 */
export function availableEnchants(power: number, item: number, pool: readonly number[]): EnchList {
  const out: EnchList = [];
  for (const id of pool) {
    if (!isPrimaryFor(id, item)) continue;
    const e = ENCHANTS[id];
    for (let lvl = e.max; lvl >= 1; lvl--) {
      if (power >= minCost(id, lvl) && power <= maxCost(id, lvl)) {
        out.push([id, lvl]);
        break;
      }
    }
  }
  return out;
}

/** Encantamientos que la mesa puede dar (sin tesoros ni maldiciones). */
export const TABLE_POOL: readonly number[] = ENCHANT_IDS.filter((id) => !ENCHANTS[id].treasure);
/** Los que salen en el botín y los libros de los aldeanos (todos menos los especiales: Fase 7.5, sigilo rápido). */
export const LOOT_POOL: readonly number[] = ENCHANT_IDS.filter((id) => !ENCHANTS[id].special);

/**
 * selectEnchantment de Minecraft: el poder sube con la encantabilidad y un poco de azar; sale uno por
 * peso y, mientras la suerte acompañe (cada vez menos), otros compatibles.
 */
export function selectEnchantments(r: Rnd, item: number, level: number, pool: readonly number[] = TABLE_POOL): EnchList {
  const list: EnchList = [];
  const ench = enchantability(item);
  if (ench <= 0) return list;
  let power = level + 1 + r.nextInt(Math.floor(ench / 4) + 1) + r.nextInt(Math.floor(ench / 4) + 1);
  const f = (r.nextFloat() + r.nextFloat() - 1) * 0.15;
  power = Math.max(1, Math.round(power + power * f));
  let avail = availableEnchants(power, item, pool);
  if (avail.length === 0) return list;
  const first = weightedPick(r, avail);
  if (first) list.push(first);
  while (r.nextInt(50) <= power) {
    if (list.length) {
      const last = list[list.length - 1][0];
      avail = avail.filter(([id]) => compatible(last, id));
    }
    if (avail.length === 0) break;
    const e = weightedPick(r, avail);
    if (e) list.push(e);
    power = Math.floor(power / 2);
  }
  return list;
}

// ------------------------------------------------------------------ mesa de encantamientos

export interface TableOffer {
  /** Nivel necesario (0: sin oferta). */
  cost: number;
  /** Pista: un encantamiento de los que saldrán (-1 si no hay). */
  ench: number;
  level: number;
}

/** getEnchantmentCost de Minecraft para la oferta `slot` (0..2). */
function slotCost(r: Rnd, slot: number, shelves: number, item: number): number {
  if (enchantability(item) <= 0) return 0;
  const b = Math.min(MAX_BOOKSHELVES, shelves);
  const i = r.nextInt(8) + 1 + (b >> 1) + r.nextInt(b + 1);
  if (slot === 0) return Math.max(Math.floor(i / 3), 1);
  if (slot === 1) return Math.floor((i * 2) / 3) + 1;
  return Math.max(i, b * 2);
}

/** Lo que dará la oferta `slot` con coste `cost` (se reproduce con la misma semilla). */
function slotList(r: JavaRandom, item: number, slot: number, cost: number, seed: number): EnchList {
  r.setSeed((seed + slot) | 0);
  const list = selectEnchantments(r, item, cost);
  if (item === BOOK && list.length > 1) list.splice(r.nextInt(list.length), 1);
  return list;
}

/** ¿Se puede encantar en la mesa? (encantable y todavía sin encantamientos). */
export function canEnchantAtTable(s: ItemStack | null): boolean {
  return !!s && s.count >= 1 && enchantability(s.id) > 0 && enchantsOf(s).length === 0 && (s.id !== BOOK || s.count >= 1);
}

/** Las tres ofertas de la mesa para el objeto `item` con `shelves` librerías y la semilla del jugador. */
export function tableOffers(item: number, shelves: number, seed: number): TableOffer[] {
  const r = new JavaRandom(seed);
  const out: TableOffer[] = [];
  for (let j = 0; j < 3; j++) {
    let cost = slotCost(r, j, shelves, item);
    if (cost < j + 1) cost = 0;
    out.push({ cost, ench: -1, level: 0 });
  }
  for (let j = 0; j < 3; j++) {
    if (out[j].cost <= 0) continue;
    const list = slotList(r, item, j, out[j].cost, seed);
    if (list.length === 0) continue;
    const clue = list[r.nextInt(list.length)];
    out[j].ench = clue[0];
    out[j].level = clue[1];
  }
  return out;
}

/** Encantamientos que da la oferta `slot` (los mismos que anunciaba la mesa). */
export function tableEnchants(item: number, slot: number, cost: number, seed: number): EnchList {
  return slotList(new JavaRandom(), item, slot, cost, seed);
}

/** El objeto encantado (un libro pasa a libro encantado con los encantamientos guardados). */
export function applyEnchants(s: ItemStack, list: EnchList): ItemStack {
  const base: ItemStack = s.id === BOOK ? { id: ENCHANTED_BOOK, count: 1 } : { ...s, count: 1 };
  if (s.data && s.id !== BOOK) base.data = { ...s.data };
  return withEnchants(base, list);
}

/** Niveles y lapislázulis que cuesta la oferta `slot` (1, 2 o 3). */
export function tableSlotPrice(slot: number): number {
  return slot + 1;
}

/** Nueva semilla de encantamiento (un entero de 32 bits con signo, como en Java). */
export function newEnchantSeed(rand: () => number = Math.random): number {
  return (Math.floor(rand() * 0x100000000) | 0);
}

// ------------------------------------------------------------------ botín y comercio

/** «Encantar al azar» (enchant_randomly): un encantamiento aplicable, con un nivel al azar. */
export function enchantRandomly(s: ItemStack, r: Rnd, pool: readonly number[] = LOOT_POOL): ItemStack {
  const opts = pool.filter((id) => s.id === BOOK || canApply(id, s.id));
  if (opts.length === 0) return s;
  const id = opts[r.nextInt(opts.length)];
  const lvl = 1 + r.nextInt(ENCHANTS[id].max);
  return applyEnchants(s, [[id, lvl]]);
}

/** «Encantar con N niveles» (enchant_with_levels): como la mesa con ese poder. */
export function enchantWithLevels(s: ItemStack, levels: number, r: Rnd, pool: readonly number[] = LOOT_POOL): ItemStack {
  const list = selectEnchantments(r, s.id, levels, pool);
  return list.length ? applyEnchants(s, list) : s;
}

/**
 * Libro encantado de un bibliotecario (como en Minecraft): un encantamiento al azar con un nivel al azar;
 * cuesta 2 + azar(5 + nivel·10) + 3·nivel esmeraldas (el doble si es un tesoro; como mucho 64) y un libro.
 */
export function librarianBook(r: Rnd): { book: ItemStack; price: number } {
  const id = LOOT_POOL[r.nextInt(LOOT_POOL.length)];
  const lvl = 1 + r.nextInt(ENCHANTS[id].max);
  let price = 2 + r.nextInt(5 + lvl * 10) + 3 * lvl;
  if (ENCHANTS[id].treasure) price *= 2;
  return { book: applyEnchants({ id: BOOK, count: 1 }, [[id, lvl]]), price: Math.min(64, price) };
}
