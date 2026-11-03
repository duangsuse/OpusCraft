// Aldeanos (fase 6): profesiones, bloque de trabajo de cada una, niveles y ofertas de comercio.
// Lo usan el servidor (autoridad del comercio), el cliente (pantalla de comercio y texturas) y las pruebas.
//
// Las ofertas son las de Java 26.3 (villagerTrades.ts). Como en Java, cada vez que un aldeano llega a un nivel se
// eligen al azar las ofertas de ese nivel (sin repetir; si una no sale se prueba otra) y se quedan fijas; el servidor
// las guarda con el aldeano. El precio de lo primero que pide cambia con la demanda (sube si se agotó la oferta antes
// de reponer y baja si no se usó) y con cada jugador: su reputación con ese aldeano y el efecto Héroe de la aldea
// (MerchantOffer.getModifiedCostCount y Villager.updateSpecialPrices).
import { ITEMS, POTION, SUSPICIOUS_STEW, TIPPED_ARROW, maxStack, type ItemStack } from './items';
import {
  COMPOSTER, SMOKER, BLAST_FURNACE, STONECUTTER, LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE,
  SMITHING_TABLE, CAULDRON, BREWING_STAND, DYE_COLORS, baseBlock,
} from './blocks';
import type { ItemData } from './itemData';
import { VILLAGER_TRADES, WANDERING_TRADES, TRADEABLE_POTIONS, type TradeDef, type TradeLevel } from './villagerTrades';
import { villagerTypeIndex } from './villagerTypes';
import { librarianBook, enchantWithLevels, rndFrom, TABLE_POOL } from './enchanting';
import { applyDyes } from './dyedColor';
import { POTIONS } from './potions';
import { EFFECTS } from './effects';
import { stewDmgFor } from './decorFood';

/** Una oferta: lo que pide (una o dos pilas) y lo que da; `max` usos antes de reponer; `xp` que gana el aldeano. */
export interface TradeOffer {
  cost: [number, number];
  cost2?: [number, number];
  result: [number, number];
  max: number;
  xp: number;
  /** Cuánto mueven el precio la demanda y la reputación (reputation_discount de Java). */
  disc: number;
  /** Datos de lo que da (un libro o equipo encantado, el cuero teñido, un mapa de explorador). */
  data?: ItemData;
  /** Desgaste de lo que da: el tipo de poción (flechas con efecto, poción) o el efecto del estofado. */
  rdmg?: number;
  /** Lo primero que pide es un frasco de agua (no cualquier poción). */
  water?: true;
}

/** Oferta concreta: `key` la identifica en la tabla (nivel · 64 + posición; el comerciante, 1000 + grupo · 128 + posición). */
export interface Offer extends TradeOffer {
  key: number;
}

export interface Profession {
  id: number;
  key: string;
  /** Nombre visible (en español). */
  name: string;
  /** Bloque de trabajo (estado base); 0 = ninguno. */
  block: number;
}

export const PROF_NONE = 0;
export const PROF_FARMER = 1;
export const PROF_BUTCHER = 2;
export const PROF_ARMORER = 3;
export const PROF_MASON = 4;
export const PROF_LIBRARIAN = 5;
export const PROF_CARTOGRAPHER = 6;
export const PROF_FLETCHER = 7;
export const PROF_FISHERMAN = 8;
export const PROF_SHEPHERD = 9;
export const PROF_WEAPONSMITH = 10;
export const PROF_TOOLSMITH = 11;
export const PROF_LEATHERWORKER = 12;
/** El clérigo (soporte para pociones), el último (los ids se guardan: sólo se añade al final). */
export const PROF_CLERIC = 13;

export const PROFESSIONS: readonly Profession[] = [
  { id: PROF_NONE, key: 'none', name: 'Aldeano', block: 0 },
  { id: PROF_FARMER, key: 'farmer', name: 'Granjero', block: COMPOSTER },
  { id: PROF_BUTCHER, key: 'butcher', name: 'Carnicero', block: SMOKER },
  { id: PROF_ARMORER, key: 'armorer', name: 'Armero', block: BLAST_FURNACE },
  { id: PROF_MASON, key: 'mason', name: 'Cantero', block: STONECUTTER },
  { id: PROF_LIBRARIAN, key: 'librarian', name: 'Bibliotecario', block: LECTERN },
  { id: PROF_CARTOGRAPHER, key: 'cartographer', name: 'Cartógrafo', block: CARTOGRAPHY_TABLE },
  { id: PROF_FLETCHER, key: 'fletcher', name: 'Flechero', block: FLETCHING_TABLE },
  { id: PROF_FISHERMAN, key: 'fisherman', name: 'Pescador', block: BARREL },
  { id: PROF_SHEPHERD, key: 'shepherd', name: 'Pastor', block: LOOM },
  { id: PROF_WEAPONSMITH, key: 'weaponsmith', name: 'Herrero de armas', block: GRINDSTONE },
  { id: PROF_TOOLSMITH, key: 'toolsmith', name: 'Herrero', block: SMITHING_TABLE },
  { id: PROF_LEATHERWORKER, key: 'leatherworker', name: 'Peletero', block: CAULDRON },
  { id: PROF_CLERIC, key: 'cleric', name: 'Clérigo', block: BREWING_STAND },
];

/** Experiencia total para llegar a cada nivel (VillagerData.NEXT_LEVEL_XP_THRESHOLDS). */
export const LEVEL_XP = [0, 10, 70, 150, 250] as const;
export const MAX_LEVEL = 5;
export const LEVEL_NAMES = ['Novato', 'Aprendiz', 'Oficial', 'Experto', 'Maestro'] as const;

/** Nivel (1..5) que corresponde a una experiencia. */
export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i + 1;
  return lvl;
}

/** Profesión que da un bloque de trabajo (PROF_NONE si no es un bloque de trabajo). */
export function professionForBlock(block: number): number {
  if (block <= 0) return PROF_NONE;
  const base = baseBlock(block); // Fase 6.5 (libros y estandartes): el atril con libro sigue siendo un atril
  for (const p of PROFESSIONS) if (p.block && p.block === base) return p.id;
  return PROF_NONE;
}

/** ¿Es un bloque de trabajo de aldeano? */
export const isWorkstation = (block: number): boolean => professionForBlock(block) !== PROF_NONE;

// ------------------------------------------------------------------ plantillas

const ID_OF = new Map<string, number>();
for (const it of ITEMS) if (it?.key && !ID_OF.has(it.key)) ID_OF.set(it.key, it.id);
const POTION_OF = new Map<string, number>(POTIONS.map((p) => [p.key, p.id]));
const EFFECT_OF = new Map<string, number>(Object.values(EFFECTS).map((e) => [e.key, e.id]));

/** Plantilla de una oferta de la tabla (con los modificadores aún sin aplicar). */
export interface Template extends Offer {
  def: TradeDef;
}

function template(d: TradeDef, key: number): Template {
  const id = (k: string) => {
    const v = ID_OF.get(k);
    if (v === undefined) throw new Error(`villagerTrades: objeto desconocido ${k}`);
    return v;
  };
  const t: Template = { key, def: d, cost: [id(d.w[0]), d.w[1]], result: [id(d.g[0]), d.g[1]], max: d.max, xp: d.xp, disc: d.disc };
  if (d.w2) t.cost2 = [id(d.w2[0]), d.w2[1]];
  if (d.water) t.water = true;
  return t;
}

/** Plantillas de cada oficio y nivel (índice 0 = novato). */
const TEMPLATES: readonly (readonly Template[][])[] = PROFESSIONS.map((p) =>
  (VILLAGER_TRADES[p.key] ?? []).map((lvl, li) => lvl.trades.map((d, i) => template(d, li * 64 + i))));
const AMOUNTS: readonly (readonly number[])[] = PROFESSIONS.map((p) => (VILLAGER_TRADES[p.key] ?? []).map((l) => l.amount));
const TRADER_TEMPLATES: readonly Template[][] = WANDERING_TRADES.map((g, gi) => g.trades.map((d, i) => template(d, 1000 + gi * 128 + i)));

/** Todas las ofertas posibles de un oficio y nivel (1..5), sin modificadores (para las pruebas). */
export function professionPool(prof: number, level: number): readonly Template[] {
  return TEMPLATES[prof]?.[level - 1] ?? [];
}

/** Plantilla por su clave (para rehacer una oferta guardada). */
export function templateByKey(prof: number, key: number): Template | undefined {
  if (key >= 1000) return TRADER_TEMPLATES[Math.floor((key - 1000) / 128)]?.[(key - 1000) % 128];
  return TEMPLATES[prof]?.[Math.floor(key / 64)]?.[key % 64];
}

// ------------------------------------------------------------------ elegir y resolver

/** Lo que hace falta para crear las ofertas de un aldeano. */
export interface TradeContext {
  /** Tipo de aldeano (villagerTypes.ts). */
  type: number;
  rand: () => number;
  /** Mapa de explorador hacia la estructura más cercana de esa clase (null si no hay: la oferta no sale). */
  map?: (kind: string) => ItemData | null;
}

/**
 * VillagerTrade.getOffer: la oferta concreta a partir de su plantilla (el tipo de aldeano que la admite, el
 * encantamiento, el tinte, el estofado, la poción o el mapa), o null si no sale.
 */
export function resolveOffer(t: Template, ctx: TradeContext): Offer | null {
  const d = t.def;
  if (d.types && !d.types.some((k) => villagerTypeIndex(k) === ctx.type)) return null;
  const { def: _d, ...base } = t;
  void _d;
  const o: Offer = { ...base, cost: [t.cost[0], t.cost[1]] };
  const r = rndFrom(ctx.rand);
  let extra = 0;
  if (d.enchant) {
    // EnchantWithLevelsFunction: niveles uniformes en [mín, máx]; el precio sube tantas esmeraldas como niveles.
    const levels = d.enchant[0] + r.nextInt(d.enchant[1] - d.enchant[0] + 1);
    const stack = enchantWithLevels({ id: o.result[0], count: 1 }, levels, r, TABLE_POOL);
    if (!stack.data?.ench?.length) return null;
    o.data = stack.data;
    extra += levels;
  }
  if (d.book) {
    // EnchantRandomlyFunction (libro): el encantamiento al azar y su precio (el doble si es un tesoro).
    const b = librarianBook(r);
    o.result = [b.book.id, 1];
    if (b.book.data) o.data = b.book.data;
    extra += b.price;
  }
  if (d.dye) {
    // set_random_dyes: 1 tinte más una binomial(2; 0,75).
    const n = 1 + (ctx.rand() < 0.75 ? 1 : 0) + (ctx.rand() < 0.75 ? 1 : 0);
    const dyes = Array.from({ length: n }, () => DYE_COLORS[Math.floor(ctx.rand() * DYE_COLORS.length)]);
    o.data = applyDyes({ id: o.result[0], count: 1 }, dyes).data;
  }
  if (d.stew && o.result[0] === SUSPICIOUS_STEW) {
    const [effect, secs] = d.stew[Math.floor(ctx.rand() * d.stew.length)];
    const e = EFFECT_OF.get(effect);
    const dmg = e === undefined ? 0 : stewDmgFor(e, secs);
    if (dmg) o.rdmg = dmg;
  }
  if (d.tipped && o.result[0] === TIPPED_ARROW) {
    const list = TRADEABLE_POTIONS.map((k) => POTION_OF.get(k)).filter((p): p is number => p !== undefined);
    o.rdmg = list[Math.floor(ctx.rand() * list.length)];
  }
  if (d.potion && o.result[0] === POTION) {
    const p = POTION_OF.get(d.potion);
    if (p === undefined) return null;
    o.rdmg = p;
  }
  if (d.map) {
    const data = ctx.map?.(d.map) ?? null;
    if (!data) return null;
    o.data = data;
  }
  // TradeCost.toItemCost: el precio más lo añadido, entre 0 y lo que cabe en una pila; con menos de 1 no sale.
  o.cost[1] = Math.max(0, Math.min(maxStack(o.cost[0]), o.cost[1] + extra));
  if (o.cost[1] < 1) return null;
  return o;
}

/** AbstractVillager.addOffersFromItemListingsWithoutDuplicates: `amount` ofertas distintas del grupo. */
function pickFrom(pool: readonly Template[], amount: number, ctx: TradeContext): Offer[] {
  const left = pool.slice();
  const out: Offer[] = [];
  while (out.length < amount && left.length) {
    const t = left.splice(Math.floor(ctx.rand() * left.length), 1)[0];
    const o = resolveOffer(t, ctx);
    if (o) out.push(o);
  }
  return out;
}

/** Las ofertas nuevas de un aldeano al llegar al nivel `level` (1..5). */
export function pickLevelOffers(prof: number, level: number, ctx: TradeContext): Offer[] {
  const pool = TEMPLATES[prof]?.[level - 1];
  return pool ? pickFrom(pool, AMOUNTS[prof][level - 1], ctx) : [];
}

/** Las ofertas de un comerciante ambulante (WanderingTrader.updateTrades: compra, poco comunes y comunes). */
export function pickTraderOffers(ctx: TradeContext): Offer[] {
  return TRADER_TEMPLATES.flatMap((pool, i) => pickFrom(pool, WANDERING_TRADES[i].amount, ctx));
}

/** PRNG pequeño y determinista (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Las ofertas de los niveles 1..`level` con una semilla (aldeano de llanura, sin mapas): para las pruebas. */
export function offersFor(prof: number, level: number, seed: number, type = villagerTypeIndex('plains')): Offer[] {
  const ctx: TradeContext = { type, rand: rng(seed ^ Math.imul(prof + 1, 0x9e3779b1)) };
  const out: Offer[] = [];
  for (let l = 1; l <= level; l++) out.push(...pickLevelOffers(prof, l, ctx));
  return out;
}

/** Ofertas de un comerciante ambulante con una semilla (para las pruebas). */
export function traderOffers(seed: number): Offer[] {
  return pickTraderOffers({ type: villagerTypeIndex('plains'), rand: rng(seed ^ 0x7a3c5) });
}

// ------------------------------------------------------------------ precios

/**
 * MerchantOffer.getModifiedCostCount: el precio de lo primero que pide con la demanda (`demand`) y lo especial de
 * cada jugador (`special`, de updateSpecialPrices), entre 1 y lo que cabe en una pila.
 */
export function offerPrice(o: TradeOffer, demand: number, special: number): number {
  const base = o.cost[1];
  const demandDiff = Math.max(0, Math.floor(Math.fround(Math.fround(base * demand) * o.disc)));
  return Math.max(1, Math.min(maxStack(o.cost[0]), base + demandDiff + special));
}

/**
 * Villager.updateSpecialPrices: lo que cambia el precio para un jugador según su reputación con el aldeano y el
 * efecto Héroe de la aldea (`heroAmp`: su nivel, o null si no lo tiene).
 */
export function specialPrice(o: TradeOffer, rep: number, heroAmp: number | null): number {
  let d = 0;
  if (rep !== 0) d -= Math.floor(Math.fround(rep * o.disc));
  if (heroAmp !== null) {
    const mod = Math.fround(0.3 + Math.fround(0.0625 * heroAmp));
    d -= Math.max(Math.floor(mod * o.cost[1]), 1);
  }
  return d;
}

/** MerchantOffer.updateDemand (al reponer). */
export function nextDemand(demand: number, uses: number, max: number): number {
  return demand + uses - (max - uses);
}

// ------------------------------------------------------------------ red

/** Lo que va aparte en la oferta: precio sin cambios, desgaste de lo que da y si pide un frasco de agua. */
export interface TradeExtra {
  /** Precio base (si el de ahora es otro, se ve tachado). */
  b?: number;
  rd?: number;
  w?: 1;
}

/**
 * Oferta en la red: [pide, n (el precio de ahora), pide2, n2, da, n, usos, máximo, datos de lo que da (0 sin ellos),
 * lo que va aparte].
 */
export type TradeWire = [number, number, number, number, number, number, number, number, ItemData | 0, TradeExtra];

export function offerToWire(o: TradeOffer, uses: number, price = o.cost[1]): TradeWire {
  const extra: TradeExtra = {};
  if (price !== o.cost[1]) extra.b = o.cost[1];
  if (o.rdmg) extra.rd = o.rdmg;
  if (o.water) extra.w = 1;
  return [o.cost[0], price, o.cost2?.[0] ?? 0, o.cost2?.[1] ?? 0, o.result[0], o.result[1], uses, o.max, o.data ?? 0, extra];
}

/** Pila de lo que da una oferta. */
export function offerResult(o: TradeOffer): ItemStack {
  return { id: o.result[0], count: o.result[1], ...(o.rdmg ? { dmg: o.rdmg } : {}), ...(o.data ? { data: o.data } : {}) };
}

/** Nombre visible de un aldeano según su profesión (y del comerciante). */
export function villagerTitle(prof: number, trader: boolean): string {
  if (trader) return 'Comerciante ambulante';
  return PROFESSIONS[prof]?.name ?? 'Aldeano';
}

export type { TradeLevel };

// ------------------------------------------------------------------ guardado

/** Tope de ofertas de un aldeano (5 niveles de 2, el bibliotecario maestro 3) o del comerciante (9). */
export const MAX_OFFER_COUNT = 16;

/** Oferta ya elegida tal como se guarda con el aldeano: su clave y lo que cambió al crearla. */
export interface StoredOffer {
  k: number;
  /** Precio (con lo que añadieron el encantamiento o el libro). */
  c: number;
  /** Lo que da, si no es lo de la plantilla (el libro encantado). */
  r?: number;
  d?: ItemData;
  rd?: number;
}

export function storeOffer(prof: number, o: Offer): StoredOffer {
  const t = templateByKey(prof, o.key);
  const s: StoredOffer = { k: o.key, c: o.cost[1] };
  if (!t || t.result[0] !== o.result[0]) s.r = o.result[0];
  if (o.data) s.d = o.data;
  if (o.rdmg) s.rd = o.rdmg;
  return s;
}

/** La oferta de un aldeano de oficio `prof` a partir de lo guardado (null si la clave ya no existe). */
export function offerFromStore(prof: number, s: StoredOffer): Offer | null {
  const t = templateByKey(prof, s.k);
  if (!t) return null;
  const { def: _d, ...base } = t;
  void _d;
  const o: Offer = { ...base, cost: [t.cost[0], s.c], result: [s.r ?? t.result[0], t.result[1]] };
  if (s.d) o.data = s.d;
  if (s.rd) o.rdmg = s.rd;
  return o;
}
