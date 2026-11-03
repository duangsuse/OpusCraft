// Fase 6 (gólems/domesticar): reglas compartidas por el cliente y el servidor sobre los gólems y los
// animales que se domestican (lobos y gatos): qué objeto sirve con cada uno, pieles de los gatos y
// lectura de los bits de estado.
import { MOB_WOLF, MOB_CAT, MOB_IRON_GOLEM, MOB_SNOW_GOLEM } from './mobs';
import {
  BONE, COD, SALMON, IRON_INGOT, RAW_PORKCHOP, COOKED_PORKCHOP, RAW_BEEF, STEAK, RAW_CHICKEN, COOKED_CHICKEN, RAW_MUTTON,
  COOKED_MUTTON, ROTTEN_FLESH,
} from './items';
import { EF_TAMED, EF_VARIANT_SHIFT, EF_VARIANT_MASK } from './protocol';

/** Probabilidad de domesticar con cada objeto dado (como en Minecraft: 1 de cada 3). */
export const TAME_CHANCE = 1 / 3;
/** Vida de un lobo domesticado (el salvaje tiene 8). */
export const TAMED_WOLF_HEALTH = 20;
/** Distancia al dueño a partir de la cual el animal se teletransporta a su lado. */
export const TELEPORT_DISTANCE = 12;

/** Objeto con el que se domestica cada especie. */
export const TAME_ITEMS: Readonly<Record<number, readonly number[]>> = {
  [MOB_WOLF]: [BONE],
  [MOB_CAT]: [COD, SALMON],
};

/** Comida de los animales domesticados: cura y, con la vida llena, los pone en modo amor. */
export const PET_FOOD: Readonly<Record<number, readonly number[]>> = {
  [MOB_WOLF]: [RAW_PORKCHOP, COOKED_PORKCHOP, RAW_BEEF, STEAK, RAW_CHICKEN, COOKED_CHICKEN, RAW_MUTTON, COOKED_MUTTON, ROTTEN_FLESH],
  [MOB_CAT]: [COD, SALMON],
};

/** Pieles de los gatos (el índice va en los bits EF_VARIANT). */
export const CAT_SKINS = ['atigrado', 'pelirrojo', 'negro', 'siamés', 'blanco'] as const;

export const isGolem = (type: number): boolean => type === MOB_IRON_GOLEM || type === MOB_SNOW_GOLEM;
export const isTameable = (type: number): boolean => type === MOB_WOLF || type === MOB_CAT;

/** Clave de la textura de una criatura con piel: id + piel · 1000 (la piel 0 es el propio id). */
export function skinKey(type: number, variant: number): number {
  return variant > 0 && type === MOB_CAT ? type + variant * 1000 : type;
}

/** Piel codificada en los bits de estado. */
export function variantOf(flags: number): number {
  return (flags & EF_VARIANT_MASK) >>> EF_VARIANT_SHIFT;
}

export function variantBits(variant: number): number {
  return ((variant & 7) << EF_VARIANT_SHIFT) & EF_VARIANT_MASK;
}

/**
 * ¿Tiene sentido hacer clic derecho con `item` (0 = mano vacía) sobre esta criatura? El cliente lo
 * usa para decidir si manda 'interact'; el servidor decide (el dueño, la suerte al domesticar...).
 */
export function companionUse(type: number, flags: number, item: number): boolean {
  if (isTameable(type)) return (flags & EF_TAMED) !== 0 || (TAME_ITEMS[type]?.includes(item) ?? false);
  if (type === MOB_IRON_GOLEM) return item === IRON_INGOT;
  return false;
}
