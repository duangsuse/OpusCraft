// Jefes reforzados (una opción del mundo, no de Java): pensados para que un grupo de amigos no los despache en un
// momento. Con «/jefes duros» (o en dificultad difícil con «/jefes auto», lo de siempre):
// - Vida según el grupo: el dragón tiene 200 de vida y 100 más por cada jugador de más que llegue a la pelea (no baja
//   si alguien se va: así no se puede rebajar saliendo y entrando).
// - Furia: por debajo de un cuarto de su vida vuela más deprisa, va a por los jugadores más a menudo, carga las bolas de
//   fuego antes y las lanza de tres en tres.
import { DRAGON_HEALTH } from './endMobs';

export type BossMode = 'auto' | 'java' | 'duros';
export const BOSS_MODES: readonly BossMode[] = ['auto', 'java', 'duros'];

/** ¿Van reforzados los jefes con ese modo y esa dificultad (0..3)? */
export function hardBosses(mode: BossMode, difficulty: number): boolean {
  return mode === 'duros' || (mode === 'auto' && difficulty >= 3);
}

/** Vida de más del dragón por cada jugador de más en la pelea. */
export const DRAGON_HEALTH_PER_PLAYER = 100;

/** Vida máxima del dragón con `players` jugadores en la pelea. */
export function dragonMaxHealth(players: number): number {
  return DRAGON_HEALTH + DRAGON_HEALTH_PER_PLAYER * Math.max(0, players - 1);
}

/** Fracción de la vida por debajo de la cual se enfurece. */
export const FURY_FRACTION = 0.25;
/** En furia: cuánto más deprisa vuela, cada cuánto va a por un jugador en las vueltas y cuántas bolas por ráfaga. */
export const FURY_SPEED = 1.35;
export const FURY_STRAFE_CHANCE = 0.5;
export const FURY_FIREBALL_CHARGE = 3;
export const FURY_BURST = 3;
