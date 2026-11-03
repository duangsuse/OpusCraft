// Experiencia como en Minecraft Java: niveles a partir del total, reparto en orbes y lo que da cada
// cosa (criaturas, cría, menas, fundición y lo que se suelta al morir).
import { MOBS } from './mobs';
import { COAL_ORE, DIAMOND_ORE, LAPIS_ORE, REDSTONE_ORE, GLASS, STONE, LIME_WOOL, TERRACOTTA } from './blocks';
import {
  COAL, DIAMOND, LAPIS, REDSTONE, IRON_INGOT, GOLD_INGOT, CHARCOAL, BRICK, COOKED_PORKCHOP, STEAK, COOKED_CHICKEN,
  COOKED_MUTTON, BAKED_POTATO,
} from './items';
import { DYES } from './items'; // Fase 6.5 (colores)
import { DYE_COLORS, GLAZED_TERRACOTTA } from './blocks'; // Fase 6.5 (colores)
import { LIT_REDSTONE_ORE } from './blocks'; // Fase 7 (redstone)
import { NETHER_QUARTZ_ORE, NETHER_GOLD_ORE } from './blocks'; // Fase 8 (dimensiones)
import { NETHERITE_SCRAP, POPPED_CHORUS_FRUIT } from './items'; // Fase 8.5 y 8.6
import { SMOOTH_QUARTZ } from './blocks';
import { QUARTZ, GOLD_NUGGET } from './items';

type Rand = () => number;

/** Experiencia que falta para pasar del nivel `level` al siguiente. */
export function xpToNext(level: number): number {
  if (level >= 31) return 9 * level - 158;
  if (level >= 16) return 5 * level - 38;
  return 2 * level + 7;
}

/** Experiencia total necesaria para llegar al nivel `level` (suma de los anteriores). */
export function totalForLevel(level: number): number {
  const L = level;
  if (L <= 16) return L * L + 6 * L;
  if (L <= 31) return 2.5 * L * L - 40.5 * L + 360;
  return 4.5 * L * L - 162.5 * L + 2220;
}

/** Nivel y progreso (0..1 hacia el siguiente) con `total` puntos de experiencia. */
export function levelFromTotal(total: number): { level: number; progress: number } {
  const t = Math.max(0, Math.floor(total) || 0);
  // Inversa de las parábolas de totalForLevel y ajuste por el redondeo.
  let L: number;
  if (t < 352) L = Math.floor(-3 + Math.sqrt(9 + t));
  else if (t < 1507) L = Math.floor((40.5 + Math.sqrt(40.5 * 40.5 - 10 * (360 - t))) / 5);
  else L = Math.floor((162.5 + Math.sqrt(162.5 * 162.5 - 18 * (2220 - t))) / 9);
  while (L > 0 && totalForLevel(L) > t) L--;
  while (totalForLevel(L + 1) <= t) L++;
  return { level: L, progress: (t - totalForLevel(L)) / xpToNext(L) };
}

/** Valores de los orbes (de mayor a menor). */
export const ORB_VALUES: readonly number[] = [2477, 1237, 617, 307, 149, 73, 37, 17, 7, 3, 1];

/** El orbe más grande que cabe en `n`. */
export function orbValue(n: number): number {
  for (const v of ORB_VALUES) if (n >= v) return v;
  return 1;
}

/** Reparte `total` puntos en orbes (como Minecraft: siempre el más grande que quepa). */
export function splitOrbs(total: number): number[] {
  const out: number[] = [];
  let n = Math.floor(total);
  while (n > 0) {
    const v = orbValue(n);
    out.push(v);
    n -= v;
  }
  return out;
}

/** Tamaño del orbe en el dibujo (0..10, el icono de Minecraft). */
export function orbIcon(value: number): number {
  const i = ORB_VALUES.findIndex((v) => value >= v);
  return i < 0 ? 0 : ORB_VALUES.length - 1 - i;
}

const rnd = (rand: Rand, a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

/** Criatura matada por un jugador: hostiles 5, animales 1–3, crías 0. */
export function mobXp(type: number, baby: boolean, rand: Rand = Math.random): number {
  const def = MOBS[type];
  if (!def) return 0;
  if (baby) return def.babyXp ?? 0; // Fase 8.3: el piglin zombificado y el hoglin crías sí dan
  if (def.xp !== undefined) return def.xp; // Fase 7.5 (océano; fauna: el murciélago, 0)
  return def.hostile ? 5 : rnd(rand, 1, 3);
}

/** Dos animales crían: 1–7. */
export function breedXp(rand: Rand = Math.random): number {
  return rnd(rand, 1, 7);
}

/** Menas que dan experiencia: [bloque, mineral que sueltan, mínimo, máximo]. */
const ORE_XP: readonly [number, number, number, number][] = [
  [COAL_ORE, COAL, 0, 2],
  [DIAMOND_ORE, DIAMOND, 3, 7],
  [LAPIS_ORE, LAPIS, 2, 5],
  [REDSTONE_ORE, REDSTONE, 1, 5],
  [LIT_REDSTONE_ORE, REDSTONE, 1, 5], // Fase 7 (redstone): la mena encendida (al pisarla o tocarla)
  [NETHER_QUARTZ_ORE, QUARTZ, 2, 5], // Fase 8 (dimensiones)
  [NETHER_GOLD_ORE, GOLD_NUGGET, 0, 1],
];

/** Experiencia al romper `block` si soltó su mineral (`dropped` son los ids que soltó). */
export function oreXp(block: number, dropped: readonly number[], rand: Rand = Math.random): number {
  for (const [ore, mineral, min, max] of ORE_XP) {
    if (ore === block) return dropped.includes(mineral) ? rnd(rand, min, max) : 0;
  }
  return 0;
}

/** Experiencia por cada objeto fundido (según el resultado). */
export const SMELT_XP: Readonly<Record<number, number>> = {
  [IRON_INGOT]: 0.7,
  [GOLD_INGOT]: 1,
  [GLASS]: 0.1,
  [STONE]: 0.1,
  [COOKED_PORKCHOP]: 0.35,
  [STEAK]: 0.35,
  [COOKED_CHICKEN]: 0.35,
  [COOKED_MUTTON]: 0.35,
  [BAKED_POTATO]: 0.35,
  [CHARCOAL]: 0.15,
  [BRICK]: 0.3,
  [TERRACOTTA]: 0.35,
  [LIME_WOOL]: 1,
  // Fase 6.5 (colores): tinte verde (cactus) y terracota esmaltada.
  [DYES.green]: 1,
  ...Object.fromEntries(DYE_COLORS.map((c) => [GLAZED_TERRACOTTA[c], 0.1])),
  [NETHERITE_SCRAP]: 2, // Fase 8.5 (lo que da el Nether)
  [SMOOTH_QUARTZ]: 0.1,
  [POPPED_CHORUS_FRUIT]: 0.1, // Fase 8.6
};

/** Sacar `count` objetos `item` del horno: la fracción se redondea al azar (como Minecraft). */
export function smeltXp(item: number, count: number, rand: Rand = Math.random): number {
  const per = SMELT_XP[item];
  if (!per || count <= 0) return 0;
  const x = per * count;
  const whole = Math.floor(x);
  const frac = x - whole;
  return whole + (frac > 1e-9 && rand() < frac ? 1 : 0);
}

/** Experiencia que se suelta al morir con `level` niveles. */
export function deathXp(level: number): number {
  return Math.min(7 * Math.max(0, Math.floor(level)), 100);
}

// Fase 6.5 (piedras): 0,1 de experiencia por cada piedra fundida (como en Minecraft).
import {
  SMOOTH_STONE, CRACKED_STONE_BRICKS, CRACKED_DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_TILES, SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE,
} from './blocks';
for (const id of [SMOOTH_STONE, CRACKED_STONE_BRICKS, CRACKED_DEEPSLATE_BRICKS, CRACKED_DEEPSLATE_TILES, SMOOTH_SANDSTONE, SMOOTH_RED_SANDSTONE]) {
  (SMELT_XP as Record<number, number>)[id] = 0.1;
}
