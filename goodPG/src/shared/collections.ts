// Fase 6.5 (colecciones): lo que une cabezas, discos y criaturas, compartido por el servidor y el cliente.
// - Un rayo cerca de un creeper lo carga; si su explosión mata a un zombi, un esqueleto o un creeper,
//   suelta la cabeza de la víctima (una por explosión, como en Minecraft).
// - Un creeper al que mata la flecha de un esqueleto suelta un disco al azar.
// - Llevar puesta la cabeza de una especie hace que esa especie te vea a la mitad de distancia.
import { SKULLS, type SkullKind } from './blocks';
import { MUSIC_DISCS } from './items';
import { MOB_ZOMBIE, MOB_SKELETON, MOB_STRAY, MOB_CREEPER, MOB_WITHER_SKELETON, MOB_PIGLIN, MOB_PIGLIN_BRUTE } from './mobs';
import { DISCS } from './discs';
import { EF_FAUNA_A } from './fauna';

/** Creeper cargado (el bit A propio de cada especie, ver fauna.ts; en el creeper nadie más lo usa). */
export const EF_CHARGED = EF_FAUNA_A;
/** Potencia de la explosión de un creeper cargado (la normal es 3). */
export const CHARGED_POWER = 6;
/** Distancia (bloques) a la que un rayo carga a un creeper. */
export const CHARGE_RADIUS = 4;

/** Cabeza que suelta cada especie al morir por la explosión de un creeper cargado. */
export const MOB_SKULL: Readonly<Record<number, SkullKind>> = {
  [MOB_ZOMBIE]: 'zombie',
  [MOB_SKELETON]: 'skeleton',
  [MOB_CREEPER]: 'creeper',
  // Fase 8.3 (criaturas del Nether): el esqueleto wither y el piglin (el piglin bruto no suelta nada).
  [MOB_WITHER_SKELETON]: 'wither_skeleton',
  [MOB_PIGLIN]: 'piglin',
};

/**
 * ¿La cabeza del hueco del casco (`helmet`) disimula al jugador ante esta especie? (LivingEntity.getVisibilityPercent:
 * zombi, esqueleto, creeper y la de piglin ante piglins y piglins brutos; el cráneo wither no disimula).
 */
export function skullDisguises(helmet: number, mobType: number): boolean {
  if (helmet <= 0) return false;
  if (mobType === MOB_PIGLIN || mobType === MOB_PIGLIN_BRUTE) return helmet === SKULLS.piglin;
  const k = MOB_SKULL[mobType];
  return !!k && k !== 'wither_skeleton' && helmet === SKULLS[k];
}

/** Esqueletos cuyas flechas hacen soltar un disco al creeper que matan. */
export function isSkeletonArcher(type: number): boolean {
  return type === MOB_SKELETON || type === MOB_STRAY;
}

/** Índice del disco (en DISCS) de un objeto; -1 si no es un disco. */
export function discOfItem(id: number): number {
  return MUSIC_DISCS.indexOf(id);
}

export function isMusicDisc(id: number): boolean {
  return discOfItem(id) >= 0;
}

/** Discos que puede soltar un creeper (todos menos otherside, que sólo sale en los cofres). */
// Fase 7.5 (abismo): el 5, tampoco; Fase 8.3: ni Tears (lo suelta el ghast). La etiqueta creeper_drop_music_discs.
export const CREEPER_DISCS: readonly number[] = MUSIC_DISCS.filter((_, i) => DISCS[i].key !== 'otherside' && DISCS[i].key !== '5' && DISCS[i].key !== 'tears' && DISCS[i].key !== 'pigstep');

/** Título de un disco para la descripción (null si no es un disco). */
export function discTitle(id: number): string | null {
  const i = discOfItem(id);
  return i >= 0 ? DISCS[i].title : null;
}
