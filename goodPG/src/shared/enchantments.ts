// Fase 7 (encantamientos): registro de los encantamientos del mundo normal con los valores de
// Minecraft 26.3 (nivel máximo, peso, costes mínimo y máximo por nivel, coste en el yunque, objetos a
// los que se aplican, grupos incompatibles, tesoros y maldiciones) y las operaciones sobre las pilas:
// leer y poner encantamientos (`data.ench`) y los guardados en un libro encantado (`data.stored`).
// Los ids numéricos se guardan en los mundos: SÓLO se añaden al final.
// Fuera de esta fase: velocidad de alma (fase 8), sigilo rápido (fase 7.5) y los de la maza y las
// lanzas (fase 9).
import {
  ITEMS, BOOK, BOW, CROSSBOW, CROSSBOW_CHARGED, TRIDENT, FISHING_ROD, SHEARS, SHIELD, FLINT_AND_STEEL, BRUSH,
  CARROT_ON_A_STICK, COMPASS, ENCHANTED_BOOK, ENCHANTED_GOLDEN_APPLE, EXPERIENCE_BOTTLE, WRITTEN_BOOK, type ItemStack,
} from './items';
import { CARVED_PUMPKIN, SKULLS } from './blocks';

/** Encantamientos de una pila: [id, nivel]. */
export type EnchList = [number, number][];

/** Grupos de objetos (las etiquetas `enchantable/*` de Minecraft). */
export type EnchCategory =
  | 'armor' | 'head' | 'chest' | 'legs' | 'feet' | 'melee' | 'sharp' | 'sweeping' | 'mining' | 'mining_loot' | 'bow'
  | 'crossbow' | 'trident' | 'fishing' | 'durability' | 'equippable' | 'vanishing';

export interface EnchantDef {
  id: number;
  key: string;
  /** Nombre visible (en español). */
  name: string;
  /** Nivel máximo. */
  max: number;
  /** Peso en las tiradas (mesa, botín, aldeanos). */
  weight: number;
  /** Coste mínimo y máximo (poder de encantamiento) del nivel 1 y lo que suben por nivel. */
  minCost: readonly [number, number];
  maxCost: readonly [number, number];
  /** Multiplicador del coste en el yunque (con libro, la mitad). */
  anvil: number;
  /** A qué objetos se puede aplicar (yunque y libros). */
  supported: EnchCategory;
  /** Objetos en los que sale en la mesa de encantamientos (por defecto, los mismos). */
  primary?: EnchCategory;
  /** Grupo de exclusión: no se junta con los demás del grupo. */
  exclusive?: string;
  /** Sólo en tesoros, comercio y pesca (nunca en la mesa). */
  treasure?: boolean;
  curse?: boolean;
  /** Fase 7.5 (abismo): no sale al azar en el botín ni en el comercio (sigilo rápido: sólo en las ciudades antiguas). */
  special?: boolean;
}

export const ENCHANTS: EnchantDef[] = [];

function ench(key: string, name: string, max: number, weight: number, minCost: [number, number], maxCost: [number, number],
  anvil: number, supported: EnchCategory, o: Partial<Pick<EnchantDef, 'primary' | 'exclusive' | 'treasure' | 'curse' | 'special'>> = {}): number {
  const id = Math.max(ENCHANTS.length, 1);
  ENCHANTS[id] = { id, key, name, max, weight, minCost, maxCost, anvil, supported, ...o };
  return id;
}

// ------------------------------------------------------------------ registro (ids fijos: sólo añadir)
export const PROTECTION = ench('protection', 'Protección', 4, 10, [1, 11], [12, 11], 1, 'armor', { exclusive: 'armor' });
export const FIRE_PROTECTION = ench('fire_protection', 'Protección contra el fuego', 4, 5, [10, 8], [18, 8], 2, 'armor', { exclusive: 'armor' });
export const FEATHER_FALLING = ench('feather_falling', 'Caída de pluma', 4, 5, [5, 6], [11, 6], 2, 'feet');
export const BLAST_PROTECTION = ench('blast_protection', 'Protección contra explosiones', 4, 2, [5, 8], [13, 8], 4, 'armor', { exclusive: 'armor' });
export const PROJECTILE_PROTECTION = ench('projectile_protection', 'Protección contra proyectiles', 4, 5, [3, 6], [9, 6], 2, 'armor', { exclusive: 'armor' });
export const RESPIRATION = ench('respiration', 'Respiración', 3, 2, [10, 10], [40, 10], 4, 'head');
export const AQUA_AFFINITY = ench('aqua_affinity', 'Afinidad acuática', 1, 2, [1, 0], [41, 0], 4, 'head');
export const THORNS = ench('thorns', 'Espinas', 3, 1, [10, 20], [60, 20], 8, 'armor', { primary: 'chest' });
export const DEPTH_STRIDER = ench('depth_strider', 'Agilidad acuática', 3, 2, [10, 10], [25, 10], 4, 'feet', { exclusive: 'boots' });
export const FROST_WALKER = ench('frost_walker', 'Paso helado', 2, 2, [10, 10], [25, 10], 4, 'feet', { exclusive: 'boots', treasure: true });
export const BINDING_CURSE = ench('binding_curse', 'Maldición de ligamiento', 1, 1, [25, 0], [50, 0], 8, 'equippable', { treasure: true, curse: true });
export const SHARPNESS = ench('sharpness', 'Filo', 5, 10, [1, 11], [21, 11], 1, 'sharp', { primary: 'melee', exclusive: 'damage' });
export const SMITE = ench('smite', 'Castigo', 5, 5, [5, 8], [25, 8], 2, 'sharp', { primary: 'melee', exclusive: 'damage' });
export const BANE_OF_ARTHROPODS = ench('bane_of_arthropods', 'Perdición de los artrópodos', 5, 5, [5, 8], [25, 8], 2, 'sharp', { primary: 'melee', exclusive: 'damage' });
export const KNOCKBACK = ench('knockback', 'Empuje', 2, 5, [5, 20], [55, 20], 2, 'melee');
export const FIRE_ASPECT = ench('fire_aspect', 'Aspecto de fuego', 2, 2, [10, 20], [60, 20], 4, 'melee');
export const LOOTING = ench('looting', 'Saqueo', 3, 2, [15, 9], [65, 9], 4, 'melee');
export const SWEEPING_EDGE = ench('sweeping_edge', 'Barrido', 3, 2, [5, 9], [20, 9], 4, 'sweeping');
export const EFFICIENCY = ench('efficiency', 'Eficiencia', 5, 10, [1, 10], [51, 10], 1, 'mining');
export const SILK_TOUCH = ench('silk_touch', 'Toque de seda', 1, 1, [15, 0], [65, 0], 8, 'mining_loot', { exclusive: 'mining' });
export const UNBREAKING = ench('unbreaking', 'Irrompibilidad', 3, 5, [5, 8], [55, 8], 2, 'durability');
export const FORTUNE = ench('fortune', 'Fortuna', 3, 2, [15, 9], [65, 9], 4, 'mining_loot', { exclusive: 'mining' });
export const POWER = ench('power', 'Poder', 5, 10, [1, 10], [16, 10], 1, 'bow');
export const PUNCH = ench('punch', 'Retroceso', 2, 2, [12, 20], [37, 20], 4, 'bow');
export const FLAME = ench('flame', 'Fuego', 1, 2, [20, 0], [50, 0], 4, 'bow');
export const INFINITY = ench('infinity', 'Infinidad', 1, 1, [20, 0], [50, 0], 8, 'bow', { exclusive: 'bow' });
export const LUCK_OF_THE_SEA = ench('luck_of_the_sea', 'Suerte marina', 3, 2, [15, 9], [65, 9], 4, 'fishing');
export const LURE = ench('lure', 'Atracción', 3, 2, [15, 9], [65, 9], 4, 'fishing');
export const LOYALTY = ench('loyalty', 'Lealtad', 3, 5, [12, 7], [50, 0], 2, 'trident');
export const IMPALING = ench('impaling', 'Empalamiento', 5, 2, [1, 8], [21, 8], 4, 'trident', { exclusive: 'damage' });
export const RIPTIDE = ench('riptide', 'Propulsión acuática', 3, 2, [17, 7], [50, 0], 4, 'trident', { exclusive: 'riptide' });
export const CHANNELING = ench('channeling', 'Conductividad', 1, 1, [25, 0], [50, 0], 8, 'trident');
export const MULTISHOT = ench('multishot', 'Multidisparo', 1, 2, [20, 0], [50, 0], 4, 'crossbow', { exclusive: 'crossbow' });
export const QUICK_CHARGE = ench('quick_charge', 'Carga rápida', 3, 5, [12, 20], [50, 0], 2, 'crossbow');
export const PIERCING = ench('piercing', 'Perforación', 4, 10, [1, 10], [50, 0], 1, 'crossbow', { exclusive: 'crossbow' });
export const MENDING = ench('mending', 'Reparación', 1, 2, [25, 25], [75, 25], 4, 'durability', { treasure: true });
export const VANISHING_CURSE = ench('vanishing_curse', 'Maldición de desaparición', 1, 1, [25, 0], [50, 0], 8, 'vanishing', { treasure: true, curse: true });
// Fase 7.5 (abismo): sigilo rápido (grebas): +15 % de velocidad agachado por nivel. Sólo en los libros de las
// ciudades antiguas: ni en la mesa, ni al azar en otros cofres, ni en el comercio.
export const SWIFT_SNEAK = ench('swift_sneak', 'Sigilo rápido', 3, 1, [25, 25], [75, 25], 8, 'legs', { treasure: true, special: true });
// Fase 8.3 (criaturas del Nether): velocidad de alma (botas): corre más sobre arena y tierra de alma (y no la frena
// la arena). Sólo del trueque con los piglins (y de los bastiones): ni en la mesa, ni al azar, ni en el comercio.
export const SOUL_SPEED = ench('soul_speed', 'Velocidad de alma', 3, 1, [10, 10], [25, 10], 8, 'feet', { treasure: true, special: true });

/** Número de encantamientos registrados (el mayor id). */
export const ENCHANT_COUNT = ENCHANTS.length - 1;
/** Todos los ids, en orden de registro. */
export const ENCHANT_IDS: readonly number[] = ENCHANTS.map((e) => e?.id).filter((id): id is number => !!id);

/**
 * Grupos de exclusión (etiquetas `exclusive_set` de Minecraft). Un encantamiento no se junta con los de
 * su grupo; algunos grupos tienen miembros que no apuntan a él (Infinidad excluye Reparación y
 * Propulsión acuática, Lealtad y Conductividad).
 */
const EXCLUSIVE_SETS: Readonly<Record<string, readonly number[]>> = {
  armor: [PROTECTION, BLAST_PROTECTION, FIRE_PROTECTION, PROJECTILE_PROTECTION],
  boots: [FROST_WALKER, DEPTH_STRIDER],
  bow: [INFINITY, MENDING],
  crossbow: [MULTISHOT, PIERCING],
  damage: [SHARPNESS, SMITE, BANE_OF_ARTHROPODS, IMPALING],
  mining: [FORTUNE, SILK_TOUCH],
  riptide: [LOYALTY, CHANNELING],
};

/** Orden en que se listan en la descripción (el de Minecraft: maldiciones primero). */
export const TOOLTIP_ORDER: readonly number[] = [
  BINDING_CURSE, VANISHING_CURSE, RIPTIDE, CHANNELING, FROST_WALKER, SHARPNESS, SMITE, BANE_OF_ARTHROPODS, IMPALING, POWER,
  PIERCING, SWEEPING_EDGE, MULTISHOT, FIRE_ASPECT, FLAME, KNOCKBACK, PUNCH, PROTECTION, BLAST_PROTECTION, FIRE_PROTECTION,
  PROJECTILE_PROTECTION, FEATHER_FALLING, FORTUNE, LOOTING, SILK_TOUCH, LUCK_OF_THE_SEA, EFFICIENCY, QUICK_CHARGE, LURE,
  RESPIRATION, AQUA_AFFINITY, SOUL_SPEED, SWIFT_SNEAK, DEPTH_STRIDER, THORNS, LOYALTY, UNBREAKING, INFINITY, MENDING, // Fase 7.5: sigilo rápido; 8.3: velocidad de alma
];

/** Nivel máximo de un encantamiento que se admite en una pila (Minecraft deja hasta 255 con comandos). */
export const MAX_ENCHANT_LEVEL = 10;
/** Encantamientos distintos que puede llevar una pila como mucho. */
export const MAX_ENCHANTS = 16;

// ------------------------------------------------------------------ objetos

const TOOL_KINDS_MINING = new Set(['pickaxe', 'axe', 'shovel', 'hoe']);
const SKULL_IDS = new Set<number>(Object.values(SKULLS));
/** Encantabilidad de las herramientas y armas por material (Minecraft 26.3). */
const TOOL_ENCHANTABILITY: Readonly<Record<string, number>> = { wooden: 15, stone: 5, iron: 14, golden: 22, diamond: 10, copper: 13, netherite: 15 };
/** Encantabilidad de las armaduras por material. */
const ARMOR_ENCHANTABILITY: Readonly<Record<string, number>> = {
  leather: 15, chainmail: 12, iron: 9, golden: 25, diamond: 10, copper: 8, turtle: 9, netherite: 15,
};

function toolKind(id: number): string | undefined {
  return ITEMS[id]?.tool?.kind;
}

/** Pieza de armadura de verdad (las cabezas van en el casco pero no son armadura). */
function armorSlot(id: number): number {
  const a = ITEMS[id]?.armor;
  return a && a.durability > 0 && a.material !== 'elytra' ? a.slot : -1;
}

/** Fase 8.6: los élitros sólo admiten lo de durabilidad (Irrompibilidad, Reparación) y las maldiciones de lo que se pone. */
function isElytra(id: number): boolean {
  return ITEMS[id]?.armor?.material === 'elytra';
}

/** Usos antes de romperse (0 si no se desgasta). */
export function maxDurability(id: number): number {
  const def = ITEMS[id];
  return def?.tool?.durability ?? def?.armor?.durability ?? 0;
}

/** ¿Pertenece el objeto a este grupo? */
export function inCategory(id: number, cat: EnchCategory): boolean {
  const kind = toolKind(id);
  switch (cat) {
    case 'armor': return armorSlot(id) >= 0;
    case 'head': return armorSlot(id) === 0;
    case 'chest': return armorSlot(id) === 1;
    case 'legs': return armorSlot(id) === 2;
    case 'feet': return armorSlot(id) === 3;
    case 'melee': case 'sweeping': return kind === 'sword';
    case 'sharp': return kind === 'sword' || kind === 'axe';
    case 'mining': return (!!kind && TOOL_KINDS_MINING.has(kind)) || id === SHEARS;
    case 'mining_loot': return !!kind && TOOL_KINDS_MINING.has(kind);
    case 'bow': return id === BOW;
    case 'crossbow': return id === CROSSBOW || id === CROSSBOW_CHARGED;
    case 'trident': return id === TRIDENT;
    case 'fishing': return id === FISHING_ROD;
    case 'durability':
      return armorSlot(id) >= 0 || isElytra(id) || kind === 'sword' || (!!kind && TOOL_KINDS_MINING.has(kind)) ||
        [SHIELD, BOW, CROSSBOW, CROSSBOW_CHARGED, TRIDENT, FLINT_AND_STEEL, SHEARS, BRUSH, FISHING_ROD, CARROT_ON_A_STICK].includes(id);
    case 'equippable': return armorSlot(id) >= 0 || isElytra(id) || SKULL_IDS.has(id) || id === CARVED_PUMPKIN;
    case 'vanishing': return inCategory(id, 'durability') || id === COMPASS || id === CARVED_PUMPKIN || SKULL_IDS.has(id);
  }
}

/** Encantabilidad (0: no se encanta en la mesa). Los libros, 1. */
export function enchantability(id: number): number {
  if (id === BOOK) return 1;
  if (id === BOW || id === CROSSBOW || id === TRIDENT || id === FISHING_ROD) return 1;
  const def = ITEMS[id];
  if (!def) return 0;
  const a = def.armor;
  if (a && a.durability > 0) return ARMOR_ENCHANTABILITY[a.material] ?? 0;
  const kind = def.tool?.kind;
  if (kind === 'sword' || (kind && TOOL_KINDS_MINING.has(kind))) return TOOL_ENCHANTABILITY[def.key.slice(0, def.key.indexOf('_'))] ?? 0;
  return 0;
}

/** ¿Se puede aplicar el encantamiento a este objeto? (los libros encantados admiten cualquiera). */
export function canApply(ench: number, id: number): boolean {
  const e = ENCHANTS[ench];
  if (!e) return false;
  return id === ENCHANTED_BOOK || inCategory(id, e.supported);
}

/** ¿Sale en la mesa de encantamientos para este objeto? */
export function isPrimaryFor(ench: number, id: number): boolean {
  const e = ENCHANTS[ench];
  if (!e) return false;
  if (id === BOOK) return true;
  return inCategory(id, e.supported) && inCategory(id, e.primary ?? e.supported);
}

/** ¿Puede llevar encantamientos este objeto? (alguno se le aplica). */
export function isEnchantable(id: number): boolean {
  if (id === ENCHANTED_BOOK) return false;
  return ENCHANT_IDS.some((e) => inCategory(id, ENCHANTS[e].supported));
}

/** ¿Se pueden juntar los dos encantamientos? (distintos y fuera de sus grupos de exclusión). */
export function compatible(a: number, b: number): boolean {
  if (a === b) return false;
  const ea = ENCHANTS[a], eb = ENCHANTS[b];
  if (!ea || !eb) return false;
  if (ea.exclusive && EXCLUSIVE_SETS[ea.exclusive]?.includes(b)) return false;
  if (eb.exclusive && EXCLUSIVE_SETS[eb.exclusive]?.includes(a)) return false;
  return true;
}

/** Poder necesario para cada nivel (mínimo y máximo, como en Minecraft). */
export function minCost(ench: number, level: number): number {
  const c = ENCHANTS[ench].minCost;
  return c[0] + c[1] * (level - 1);
}

export function maxCost(ench: number, level: number): number {
  const c = ENCHANTS[ench].maxCost;
  return c[0] + c[1] * (level - 1);
}

// ------------------------------------------------------------------ nombres

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

export function romanLevel(level: number): string {
  return ROMAN[level] ?? String(level);
}

/** «Filo III», «Toque de seda» (sin número si sólo tiene un nivel). */
export function enchantName(ench: number, level: number): string {
  const e = ENCHANTS[ench];
  if (!e) return '?';
  return e.max === 1 && level === 1 ? e.name : `${e.name} ${romanLevel(level)}`;
}

/** Encantamiento por su clave o su nombre (sin tildes, con guiones bajos o espacios). */
export function enchantByName(raw: string): EnchantDef | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_');
  const v = norm(raw);
  return ENCHANTS.find((e) => e && (e.key === v || norm(e.name) === v));
}

// ------------------------------------------------------------------ pilas

/** Lista válida de encantamientos (ids conocidos, niveles 1..10, sin repetir); null si no queda ninguno. */
export function sanitizeEnchList(raw: unknown): EnchList | null {
  if (!Array.isArray(raw)) return null;
  const out: EnchList = [];
  for (const r of raw.slice(0, 64)) {
    if (out.length >= MAX_ENCHANTS) break;
    if (!Array.isArray(r)) continue;
    const id = Number(r[0]), lvl = Number(r[1]);
    if (!Number.isInteger(id) || !ENCHANTS[id] || !Number.isInteger(lvl) || lvl < 1) continue;
    if (out.some((o) => o[0] === id)) continue;
    out.push([id, Math.min(MAX_ENCHANT_LEVEL, lvl)]);
  }
  return out.length ? out : null;
}

/** Encantamientos aplicados de una pila (lista vacía si no tiene). */
export function enchantsOf(s: ItemStack | null | undefined): EnchList {
  return s?.data?.ench ?? [];
}

/** Encantamientos guardados en un libro encantado. */
export function storedOf(s: ItemStack | null | undefined): EnchList {
  return s?.data?.stored ?? [];
}

/** Los que cuentan para combinar en el yunque: los guardados de un libro o los aplicados. */
export function enchantsForAnvil(s: ItemStack | null | undefined): EnchList {
  return s?.id === ENCHANTED_BOOK ? storedOf(s) : enchantsOf(s);
}

/** Nivel de un encantamiento en la pila (0 si no lo tiene). */
export function enchLevel(s: ItemStack | null | undefined, ench: number): number {
  for (const [id, lvl] of enchantsOf(s)) if (id === ench) return lvl;
  return 0;
}

export function isEnchanted(s: ItemStack | null | undefined): boolean {
  return enchantsOf(s).length > 0;
}

/** Copia de la pila con estos encantamientos (en un libro encantado, los guardados). */
export function withEnchants(s: ItemStack, list: EnchList): ItemStack {
  const out: ItemStack = { ...s, data: { ...(s.data ?? {}) } };
  const key = s.id === ENCHANTED_BOOK ? 'stored' : 'ench';
  if (list.length) out.data![key] = list.map((e): [number, number] => [e[0], e[1]]);
  else delete out.data![key];
  if (Object.keys(out.data!).length === 0) delete out.data;
  return out;
}

/** Libro encantado con estos encantamientos guardados. */
export function enchantedBook(list: EnchList): ItemStack {
  return withEnchants({ id: ENCHANTED_BOOK, count: 1 }, list);
}

/** Objetos que brillan siempre (libro encantado y escrito, manzana de oro encantada, botella con experiencia). */
const ALWAYS_GLINT = new Set([ENCHANTED_BOOK, ENCHANTED_GOLDEN_APPLE, EXPERIENCE_BOTTLE, WRITTEN_BOOK]);

/** ¿Tiene el brillo del encantamiento? */
export function hasGlint(s: ItemStack | null | undefined): boolean {
  if (!s) return false;
  return ALWAYS_GLINT.has(s.id) || enchantsOf(s).length > 0 || storedOf(s).length > 0 || !!s.data?.lode; // Fase 8.5: brújula magnetizada
}

/** Lista ordenada para mostrar (el orden de Minecraft). */
export function sortedForTooltip(list: EnchList): EnchList {
  const pos = (id: number) => {
    const i = TOOLTIP_ORDER.indexOf(id);
    return i < 0 ? 999 : i;
  };
  return list.slice().sort((a, b) => pos(a[0]) - pos(b[0]));
}
