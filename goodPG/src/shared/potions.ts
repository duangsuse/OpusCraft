// Fase 7 (pociones): los tipos de poción de Minecraft (el tipo va en `dmg` de la pila; 0 = agua), sus
// efectos y duraciones, colores y nombres; las cuatro formas (frasco, arrojadiza, persistente y flecha
// con efecto), las recetas de destilación del alambique y la de las flechas con efecto.
// Los ids de tipo se guardan con las pilas: sólo se añaden al final.
import { STRUCTURE_MAPS } from './structureMapData'; // Fase 7.5 (océano)
import {
  EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_STRENGTH, EFFECT_WEAKNESS, EFFECT_REGENERATION, EFFECT_POISON, EFFECT_FIRE_RESISTANCE,
  EFFECT_NIGHT_VISION, EFFECT_WATER_BREATHING, EFFECT_RESISTANCE, EFFECT_JUMP_BOOST, EFFECT_INVISIBILITY, EFFECT_SLOW_FALLING,
  EFFECT_LUCK, EFFECT_INSTANT_HEALTH, EFFECT_INSTANT_DAMAGE, EFFECTS, mixEffectColor,
} from './effects';
import {
  POTION, SPLASH_POTION, LINGERING_POTION, TIPPED_ARROW, SPLASH_HARMING, SPLASH_SLOWNESS, SPLASH_POISON, ARROW, NETHER_WART,
  REDSTONE, GLOWSTONE_DUST, FERMENTED_SPIDER_EYE, GUNPOWDER, DRAGON_BREATH, SUGAR, GLISTERING_MELON_SLICE, SPIDER_EYE,
  GHAST_TEAR, BLAZE_POWDER, MAGMA_CREAM, RABBIT_FOOT, GOLDEN_CARROT, PUFFERFISH, TURTLE_HELMET, PHANTOM_MEMBRANE, itemName,
  GLASS_BOTTLE, BLAZE_ROD, type ItemStack,
} from './items';
import { BREWING_STAND, COBWEB, SLIME_BLOCK, STONE } from './blocks';
import { MOBS, MOB_WITCH } from './mobs';
import { ARMOR_BYPASS } from './armor';

/**
 * Fase 8.3 (criaturas del Nether): «tipo» de la flecha espectral (va donde el tipo de las flechas con efecto:
 * −1 es la normal): lo que alcanza brilla 10 s.
 */
export const SPECTRAL_ARROW_TYPE = -2;
/** Segundos de Brillo de la flecha espectral. */
export const SPECTRAL_GLOW_SECONDS = 10;

/** Entidad de la nube de efecto que deja una poción persistente al romperse. */
export const ENT_EFFECT_CLOUD = 150;
/** Bit de estado de las criaturas invisibles (no se dibuja su cuerpo). Los bits 22..25 son del brillo. */
export const EF_INVISIBLE = 1 << 26;
/** Bit de estado de los jugadores invisibles (lo pone el servidor al reenviar su posición). */
export const STATE_INVISIBLE = 1 << 14;

/** [efecto, segundos, nivel (0 = I)]; los instantáneos llevan 0 segundos. */
export type PotionEffect = readonly [effect: number, seconds: number, amp: number];

export interface PotionDef {
  id: number;
  key: string;
  /** Lo que sigue a «Poción» en el nombre («de curación», «del maestro tortuga»); '' en las bases. */
  suffix: string;
  effects: readonly PotionEffect[];
  /** Color del líquido y de las partículas. */
  color: [number, number, number];
}

/** Color del agua (y de las pociones sin efectos: mundana, espesa y rara). */
export const WATER_COLOR: [number, number, number] = [56, 93, 198];

export const POTIONS: PotionDef[] = [];
function P(key: string, suffix: string, effects: PotionEffect[] = []): number {
  const id = POTIONS.length;
  const color = mixEffectColor(effects.map(([e, , a]) => [e, a] as const)) ?? WATER_COLOR;
  POTIONS.push({ id, key, suffix, effects, color });
  return id;
}

// Bases.
export const PT_WATER = P('water', '');
export const PT_MUNDANE = P('mundane', '');
export const PT_THICK = P('thick', '');
export const PT_AWKWARD = P('awkward', '');
// Con efecto (duraciones de Minecraft Java: normal, alargada con redstone, reforzada con piedra luminosa).
export const PT_NIGHT_VISION = P('night_vision', 'de visión nocturna', [[EFFECT_NIGHT_VISION, 180, 0]]);
export const PT_LONG_NIGHT_VISION = P('long_night_vision', 'de visión nocturna', [[EFFECT_NIGHT_VISION, 480, 0]]);
export const PT_INVISIBILITY = P('invisibility', 'de invisibilidad', [[EFFECT_INVISIBILITY, 180, 0]]);
export const PT_LONG_INVISIBILITY = P('long_invisibility', 'de invisibilidad', [[EFFECT_INVISIBILITY, 480, 0]]);
export const PT_LEAPING = P('leaping', 'de salto', [[EFFECT_JUMP_BOOST, 180, 0]]);
export const PT_LONG_LEAPING = P('long_leaping', 'de salto', [[EFFECT_JUMP_BOOST, 480, 0]]);
export const PT_STRONG_LEAPING = P('strong_leaping', 'de salto', [[EFFECT_JUMP_BOOST, 90, 1]]);
export const PT_FIRE_RESISTANCE = P('fire_resistance', 'de resistencia al fuego', [[EFFECT_FIRE_RESISTANCE, 180, 0]]);
export const PT_LONG_FIRE_RESISTANCE = P('long_fire_resistance', 'de resistencia al fuego', [[EFFECT_FIRE_RESISTANCE, 480, 0]]);
export const PT_SWIFTNESS = P('swiftness', 'de velocidad', [[EFFECT_SPEED, 180, 0]]);
export const PT_LONG_SWIFTNESS = P('long_swiftness', 'de velocidad', [[EFFECT_SPEED, 480, 0]]);
export const PT_STRONG_SWIFTNESS = P('strong_swiftness', 'de velocidad', [[EFFECT_SPEED, 90, 1]]);
export const PT_SLOWNESS = P('slowness', 'de lentitud', [[EFFECT_SLOWNESS, 90, 0]]);
export const PT_LONG_SLOWNESS = P('long_slowness', 'de lentitud', [[EFFECT_SLOWNESS, 240, 0]]);
export const PT_STRONG_SLOWNESS = P('strong_slowness', 'de lentitud', [[EFFECT_SLOWNESS, 20, 3]]);
export const PT_TURTLE_MASTER = P('turtle_master', 'del maestro tortuga', [[EFFECT_SLOWNESS, 20, 3], [EFFECT_RESISTANCE, 20, 2]]);
export const PT_LONG_TURTLE_MASTER = P('long_turtle_master', 'del maestro tortuga', [[EFFECT_SLOWNESS, 40, 3], [EFFECT_RESISTANCE, 40, 2]]);
export const PT_STRONG_TURTLE_MASTER = P('strong_turtle_master', 'del maestro tortuga', [[EFFECT_SLOWNESS, 20, 5], [EFFECT_RESISTANCE, 20, 3]]);
export const PT_WATER_BREATHING = P('water_breathing', 'de respiración acuática', [[EFFECT_WATER_BREATHING, 180, 0]]);
export const PT_LONG_WATER_BREATHING = P('long_water_breathing', 'de respiración acuática', [[EFFECT_WATER_BREATHING, 480, 0]]);
export const PT_HEALING = P('healing', 'de curación', [[EFFECT_INSTANT_HEALTH, 0, 0]]);
export const PT_STRONG_HEALING = P('strong_healing', 'de curación', [[EFFECT_INSTANT_HEALTH, 0, 1]]);
export const PT_HARMING = P('harming', 'de daño', [[EFFECT_INSTANT_DAMAGE, 0, 0]]);
export const PT_STRONG_HARMING = P('strong_harming', 'de daño', [[EFFECT_INSTANT_DAMAGE, 0, 1]]);
export const PT_POISON = P('poison', 'de veneno', [[EFFECT_POISON, 45, 0]]);
export const PT_LONG_POISON = P('long_poison', 'de veneno', [[EFFECT_POISON, 90, 0]]);
export const PT_STRONG_POISON = P('strong_poison', 'de veneno', [[EFFECT_POISON, 21.6, 1]]);
export const PT_REGENERATION = P('regeneration', 'de regeneración', [[EFFECT_REGENERATION, 45, 0]]);
export const PT_LONG_REGENERATION = P('long_regeneration', 'de regeneración', [[EFFECT_REGENERATION, 90, 0]]);
export const PT_STRONG_REGENERATION = P('strong_regeneration', 'de regeneración', [[EFFECT_REGENERATION, 22.5, 1]]);
export const PT_STRENGTH = P('strength', 'de fuerza', [[EFFECT_STRENGTH, 180, 0]]);
export const PT_LONG_STRENGTH = P('long_strength', 'de fuerza', [[EFFECT_STRENGTH, 480, 0]]);
export const PT_STRONG_STRENGTH = P('strong_strength', 'de fuerza', [[EFFECT_STRENGTH, 90, 1]]);
export const PT_WEAKNESS = P('weakness', 'de debilidad', [[EFFECT_WEAKNESS, 90, 0]]);
export const PT_LONG_WEAKNESS = P('long_weakness', 'de debilidad', [[EFFECT_WEAKNESS, 240, 0]]);
/** Sólo en creativo (no se destila). */
export const PT_LUCK = P('luck', 'de suerte', [[EFFECT_LUCK, 300, 0]]);
export const PT_SLOW_FALLING = P('slow_falling', 'de caída lenta', [[EFFECT_SLOW_FALLING, 90, 0]]);
export const PT_LONG_SLOW_FALLING = P('long_slow_falling', 'de caída lenta', [[EFFECT_SLOW_FALLING, 240, 0]]);

export const POTION_TYPE_COUNT = POTIONS.length;

export function isPotionType(t: number): boolean {
  return Number.isInteger(t) && t >= 0 && t < POTION_TYPE_COUNT;
}

// ------------------------------------------------------------------ formas

/** Frasco que se bebe, arrojadiza, persistente (deja una nube) o flecha con efecto. */
export type PotionKind = 'drink' | 'splash' | 'lingering' | 'arrow';

const KIND_OF: Readonly<Record<number, PotionKind>> = {
  [POTION]: 'drink', [SPLASH_POTION]: 'splash', [LINGERING_POTION]: 'lingering', [TIPPED_ARROW]: 'arrow',
  // Las arrojadizas de bruja de la fase 6 (ids guardados): arrojadizas de su tipo.
  [SPLASH_HARMING]: 'splash', [SPLASH_SLOWNESS]: 'splash', [SPLASH_POISON]: 'splash',
};
const LEGACY_TYPE: Readonly<Record<number, number>> = {
  [SPLASH_HARMING]: PT_HARMING, [SPLASH_SLOWNESS]: PT_SLOWNESS, [SPLASH_POISON]: PT_POISON,
};
/** Objeto de cada forma. */
export const POTION_ITEM: Readonly<Record<PotionKind, number>> = {
  drink: POTION, splash: SPLASH_POTION, lingering: LINGERING_POTION, arrow: TIPPED_ARROW,
};

export function potionKind(id: number | undefined): PotionKind | null {
  return id === undefined ? null : KIND_OF[id] ?? null;
}

/** Tipo de poción de una pila (-1 si no es una poción ni una flecha con efecto). */
export function potionType(s: ItemStack | null | undefined): number {
  if (!s || !KIND_OF[s.id]) return -1;
  const legacy = LEGACY_TYPE[s.id];
  if (legacy !== undefined) return legacy;
  const t = s.dmg ?? 0;
  return isPotionType(t) ? t : PT_WATER;
}

/** Pila de una poción de esa forma y tipo. */
export function potionStack(kind: PotionKind, type: number, count = 1): ItemStack {
  const s: ItemStack = { id: POTION_ITEM[kind], count };
  if (type > 0) s.dmg = type;
  return s;
}

/** Efectos al aplicarse: la persistente dura la cuarta parte y la flecha la octava (como en Minecraft). */
export function potionEffects(type: number, kind: PotionKind = 'drink'): PotionEffect[] {
  const def = POTIONS[type];
  if (!def) return [];
  const k = kind === 'lingering' ? 0.25 : kind === 'arrow' ? 0.125 : 1;
  return def.effects.map(([e, s, a]) => [e, s * k, a] as const);
}

export function potionColor(type: number): [number, number, number] {
  return POTIONS[type]?.color ?? WATER_COLOR;
}

/** ¿Sólo tiene efectos instantáneos (curación o daño)? Sus salpicaduras brillan distinto. */
export function isInstantPotion(type: number): boolean {
  const list = POTIONS[type]?.effects ?? [];
  return list.length > 0 && list.every(([e]) => EFFECTS[e]?.instant);
}

/** ¿Una de las bases sin efecto (agua, mundana, espesa, rara)? */
export function isBasePotion(type: number): boolean {
  return type <= PT_AWKWARD;
}

const BASE_NAMES: Readonly<Record<PotionKind, [string, string, string, string]>> = {
  drink: ['Frasco de agua', 'Poción mundana', 'Poción espesa', 'Poción rara'],
  splash: ['Frasco de agua arrojadizo', 'Poción arrojadiza mundana', 'Poción arrojadiza espesa', 'Poción arrojadiza rara'],
  lingering: ['Frasco de agua persistente', 'Poción persistente mundana', 'Poción persistente espesa', 'Poción persistente rara'],
  arrow: ['Flecha de salpicadura', 'Flecha con efecto', 'Flecha con efecto', 'Flecha con efecto'],
};
const KIND_PREFIX: Readonly<Record<PotionKind, string>> = {
  drink: 'Poción', splash: 'Poción arrojadiza', lingering: 'Poción persistente', arrow: 'Flecha',
};

/** Nombre de una poción («Poción arrojadiza de curación», «Frasco de agua», «Flecha de veneno»…). */
export function potionName(kind: PotionKind, type: number): string {
  const def = POTIONS[type] ?? POTIONS[PT_WATER];
  if (isBasePotion(def.id)) return BASE_NAMES[kind][def.id];
  return `${KIND_PREFIX[kind]} ${def.suffix}`;
}

/** Nombre visible de una pila (las pociones, según su tipo). */
export function stackName(s: ItemStack): string {
  if (s.data?.smap) return STRUCTURE_MAPS[s.data.smap.k]?.name ?? itemName(s.id); // Fase 7.5 (océano): mapas del tesoro
  const kind = potionKind(s.id);
  return kind ? potionName(kind, potionType(s)) : itemName(s.id);
}

// ------------------------------------------------------------------ destilación

/** Ingrediente → { tipo de partida → tipo que sale }. */
const BREW: Record<number, Record<number, number>> = {};
function brew(ingredient: number, pairs: [number, number][]): void {
  const m = (BREW[ingredient] ??= {});
  for (const [from, to] of pairs) m[from] = to;
}
// Del agua: la verruga da la poción rara; el resto de ingredientes, la mundana; la piedra luminosa, la
// espesa, y el ojo fermentado, la debilidad.
brew(NETHER_WART, [[PT_WATER, PT_AWKWARD]]);
brew(GLOWSTONE_DUST, [[PT_WATER, PT_THICK]]);
brew(FERMENTED_SPIDER_EYE, [[PT_WATER, PT_WEAKNESS]]);
for (const i of [REDSTONE, SUGAR, GLISTERING_MELON_SLICE, SPIDER_EYE, GHAST_TEAR, BLAZE_POWDER, MAGMA_CREAM, RABBIT_FOOT]) {
  brew(i, [[PT_WATER, PT_MUNDANE]]);
}
// 26.3: también la telaraña, el bloque de slime y la piedra (brewing/potion_water_cobweb, …).
for (const i of [COBWEB, SLIME_BLOCK, STONE]) brew(i, [[PT_WATER, PT_MUNDANE]]);
// De la rara, las pociones con efecto.
brew(GOLDEN_CARROT, [[PT_AWKWARD, PT_NIGHT_VISION]]);
brew(MAGMA_CREAM, [[PT_AWKWARD, PT_FIRE_RESISTANCE]]);
brew(RABBIT_FOOT, [[PT_AWKWARD, PT_LEAPING]]);
brew(SUGAR, [[PT_AWKWARD, PT_SWIFTNESS]]);
brew(TURTLE_HELMET, [[PT_AWKWARD, PT_TURTLE_MASTER]]);
brew(PUFFERFISH, [[PT_AWKWARD, PT_WATER_BREATHING]]);
brew(GLISTERING_MELON_SLICE, [[PT_AWKWARD, PT_HEALING]]);
brew(SPIDER_EYE, [[PT_AWKWARD, PT_POISON]]);
brew(GHAST_TEAR, [[PT_AWKWARD, PT_REGENERATION]]);
brew(BLAZE_POWDER, [[PT_AWKWARD, PT_STRENGTH]]);
brew(PHANTOM_MEMBRANE, [[PT_AWKWARD, PT_SLOW_FALLING]]);
// Redstone: alargada.
brew(REDSTONE, [
  [PT_NIGHT_VISION, PT_LONG_NIGHT_VISION], [PT_INVISIBILITY, PT_LONG_INVISIBILITY], [PT_LEAPING, PT_LONG_LEAPING],
  [PT_FIRE_RESISTANCE, PT_LONG_FIRE_RESISTANCE], [PT_SWIFTNESS, PT_LONG_SWIFTNESS], [PT_SLOWNESS, PT_LONG_SLOWNESS],
  [PT_TURTLE_MASTER, PT_LONG_TURTLE_MASTER], [PT_WATER_BREATHING, PT_LONG_WATER_BREATHING], [PT_POISON, PT_LONG_POISON],
  [PT_REGENERATION, PT_LONG_REGENERATION], [PT_STRENGTH, PT_LONG_STRENGTH], [PT_WEAKNESS, PT_LONG_WEAKNESS],
  [PT_SLOW_FALLING, PT_LONG_SLOW_FALLING],
]);
// Polvo de piedra luminosa: reforzada.
brew(GLOWSTONE_DUST, [
  [PT_LEAPING, PT_STRONG_LEAPING], [PT_SWIFTNESS, PT_STRONG_SWIFTNESS], [PT_SLOWNESS, PT_STRONG_SLOWNESS],
  [PT_TURTLE_MASTER, PT_STRONG_TURTLE_MASTER], [PT_HEALING, PT_STRONG_HEALING], [PT_HARMING, PT_STRONG_HARMING],
  [PT_POISON, PT_STRONG_POISON], [PT_REGENERATION, PT_STRONG_REGENERATION], [PT_STRENGTH, PT_STRONG_STRENGTH],
]);
// Ojo de araña fermentado: corrompida.
brew(FERMENTED_SPIDER_EYE, [
  [PT_NIGHT_VISION, PT_INVISIBILITY], [PT_LONG_NIGHT_VISION, PT_LONG_INVISIBILITY], [PT_SWIFTNESS, PT_SLOWNESS],
  [PT_LONG_SWIFTNESS, PT_LONG_SLOWNESS], [PT_LEAPING, PT_SLOWNESS], [PT_LONG_LEAPING, PT_LONG_SLOWNESS],
  [PT_HEALING, PT_HARMING], [PT_STRONG_HEALING, PT_STRONG_HARMING], [PT_POISON, PT_HARMING], [PT_LONG_POISON, PT_HARMING],
  [PT_STRONG_POISON, PT_STRONG_HARMING],
]);

/** Ingredientes que acepta el alambique (hueco de arriba). */
export const BREW_INGREDIENTS: ReadonlySet<number> = new Set([...Object.keys(BREW).map(Number), GUNPOWDER, DRAGON_BREATH]);

export function isBrewIngredient(id: number): boolean {
  return BREW_INGREDIENTS.has(id);
}

/**
 * Lo que sale al destilar `s` (un frasco, arrojadiza o persistente) con `ingredient`, o null si no cambia.
 * La pólvora la vuelve arrojadiza y el aliento de dragón, a la arrojadiza, persistente.
 */
export function brewResult(ingredient: number, s: ItemStack | null): ItemStack | null {
  const kind = potionKind(s?.id);
  if (!s || !kind || kind === 'arrow') return null;
  const type = potionType(s);
  if (ingredient === GUNPOWDER) return kind === 'drink' ? potionStack('splash', type) : null;
  if (ingredient === DRAGON_BREATH) return kind === 'splash' ? potionStack('lingering', type) : null;
  const to = BREW[ingredient]?.[type];
  return to === undefined ? null : potionStack(kind, to);
}

// ------------------------------------------------------------------ flechas con efecto

/**
 * Receta de las flechas con efecto (cuadrícula 3×3): la poción persistente en el centro y ocho flechas
 * alrededor dan ocho flechas de su tipo. null si la cuadrícula no es ésa.
 */
export function tippedArrowCraft(grid: readonly (ItemStack | null)[]): ItemStack | null {
  if (grid.length !== 9) return null;
  const center = grid[4];
  if (center?.id !== LINGERING_POTION) return null;
  for (let i = 0; i < 9; i++) if (i !== 4 && grid[i]?.id !== ARROW) return null;
  return potionStack('arrow', potionType(center), 8);
}

// ------------------------------------------------------------------ inventario creativo

/** Todas las pociones (frasco, arrojadiza y persistente de cada tipo) y las flechas con efecto. */
export const CREATIVE_POTIONS: readonly ItemStack[] = (['drink', 'splash', 'lingering', 'arrow'] as const).flatMap((kind) =>
  POTIONS.filter((p) => kind !== 'arrow' || !isBasePotion(p.id) || p.id === PT_WATER).map((p) => potionStack(kind, p.id)));

/** Pestaña de las pociones del inventario creativo: el alambique, los frascos y los ingredientes. */
export const CREATIVE_BREWING: readonly number[] = [
  BREWING_STAND, GLASS_BOTTLE, NETHER_WART, REDSTONE, GLOWSTONE_DUST, FERMENTED_SPIDER_EYE, GUNPOWDER, DRAGON_BREATH, SUGAR,
  RABBIT_FOOT, GLISTERING_MELON_SLICE, SPIDER_EYE, PUFFERFISH, MAGMA_CREAM, GOLDEN_CARROT, BLAZE_ROD, BLAZE_POWDER, GHAST_TEAR,
  TURTLE_HELMET, PHANTOM_MEMBRANE, ARROW,
];

// ------------------------------------------------------------------ descripción

/** Líneas de efecto de la descripción: [texto, beneficioso]. «Sin efectos» en las bases. */
export function potionEffectLines(kind: PotionKind, type: number): [string, boolean][] {
  const list = potionEffects(type, kind);
  if (list.length === 0) return [['Sin efectos', false]];
  return list.map(([id, secs, amp]) => {
    const d = EFFECTS[id];
    const lvl = amp > 0 ? ` ${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.min(5, amp)]}` : '';
    const t = Math.round(secs);
    const time = d.instant ? '' : ` (${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')})`;
    return [`${d.name}${lvl}${time}`, d.good];
  });
}

// ------------------------------------------------------------------ bruja y magia

// Las brujas sueltan también frascos de cristal y polvo de piedra luminosa (como en Minecraft).
MOBS[MOB_WITCH].drops.push([GLASS_BOTTLE, 0, 2], [GLOWSTONE_DUST, 0, 2]);
// El daño instantáneo es magia: atraviesa la armadura.
(ARMOR_BYPASS as Set<string>).add('magic');

