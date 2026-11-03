// Fase 6.5 (decoración): comida con algo especial. El estofado sospechoso da un efecto según la flor
// con la que se hizo (como en Minecraft Java); la flor va en el `dmg` de la pila (1..n, índice de
// SUSPICIOUS_FLOWERS + 1). Los estofados y sopas devuelven el cuenco.
import { WITHER_ROSE } from './blocks'; // Fase 8.7
import { EFFECT_WITHER } from './effects';
import { POPPY, DANDELION, CORNFLOWER, FLOWERS, TORCHFLOWER } from './blocks';
import {
  EFFECT_FIRE_RESISTANCE, EFFECT_NIGHT_VISION, EFFECT_POISON, EFFECT_REGENERATION, EFFECT_WEAKNESS, EFFECTS,
  EFFECT_JUMP_BOOST, EFFECT_BLINDNESS, EFFECT_SATURATION, // Fase 7 (efectos)
} from './effects';
import { BOWL, MUSHROOM_STEW, RABBIT_STEW, BEETROOT_SOUP, SUSPICIOUS_STEW } from './items';

/**
 * Flor → efecto del estofado: [bloque de la flor, efecto, segundos], con los valores de Minecraft Java
 * (Fase 7: ya con Supersalto, Ceguera y Saturación, que antes se cambiaban por otros).
 * El orden es el que se guarda en `dmg`: sólo se añade al final. (La rosa marchita y las flores de ojo
 * aún no existen: vendrán con el Nether y las novedades.)
 */
export const SUSPICIOUS_FLOWERS: readonly (readonly [number, number, number])[] = [
  [POPPY, EFFECT_NIGHT_VISION, 5],
  [DANDELION, EFFECT_SATURATION, 0.35],
  [CORNFLOWER, EFFECT_JUMP_BOOST, 5],
  [FLOWERS.blue_orchid, EFFECT_SATURATION, 0.35],
  [FLOWERS.allium, EFFECT_FIRE_RESISTANCE, 3],
  [FLOWERS.azure_bluet, EFFECT_BLINDNESS, 11],
  [FLOWERS.red_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.orange_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.white_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.pink_tulip, EFFECT_WEAKNESS, 7],
  [FLOWERS.oxeye_daisy, EFFECT_REGENERATION, 7],
  [FLOWERS.lily_of_the_valley, EFFECT_POISON, 11],
  [TORCHFLOWER, EFFECT_NIGHT_VISION, 5], // Fase 7 (efectos)
  [WITHER_ROSE, EFFECT_WITHER, 7], // Fase 8.7: la rosa marchita (WitherRoseBlock(MobEffects.WITHER, 7))
];

/** Efecto de un estofado sospechoso: [efecto, segundos] o null si no tiene flor. */
export function stewEffect(dmg: number | undefined): readonly [number, number] | null {
  if ((dmg ?? 0) > TRADE_STEW_BASE) return TRADE_STEWS[dmg! - TRADE_STEW_BASE - 1] ?? null;
  const f = SUSPICIOUS_FLOWERS[(dmg ?? 0) - 1];
  return f ? [f[1], f[2]] : null;
}

/**
 * El estofado que vende el granjero experto (set_stew_effect): un efecto al azar de su lista, con su duración. Los
 * que coinciden con una flor usan su `dmg`; los que no (supersalto 8 s, ceguera 6 s y veneno 14 s) van a partir de
 * TRADE_STEW_BASE + 1 (sólo se añade al final).
 */
const TRADE_STEW_BASE = 100;
const TRADE_STEWS: readonly (readonly [number, number])[] = [
  [EFFECT_JUMP_BOOST, 8],
  [EFFECT_BLINDNESS, 6],
  [EFFECT_POISON, 14],
];
/** Efectos instantáneos: su duración en Java son ticks, no segundos. */
const INSTANT_STEW = new Set([EFFECT_SATURATION]);

/** `dmg` del estofado con ese efecto y duración (en segundos; en ticks si es instantáneo), o 0 si no hay. */
export function stewDmgFor(effect: number, duration: number): number {
  const secs = INSTANT_STEW.has(effect) ? duration / 20 : duration;
  const f = SUSPICIOUS_FLOWERS.findIndex(([, e, s]) => e === effect && s === secs);
  if (f >= 0) return f + 1;
  const t = TRADE_STEWS.findIndex(([e, s]) => e === effect && s === secs);
  return t >= 0 ? TRADE_STEW_BASE + 1 + t : 0;
}

/** Texto del efecto (para la descripción del objeto). */
export function stewEffectText(dmg: number | undefined): string {
  const e = stewEffect(dmg);
  if (!e) return '';
  return e[1] < 1 ? EFFECTS[e[0]]?.name ?? '?' : `${EFFECTS[e[0]]?.name ?? '?'} (${e[1]} s)`;
}

/** Comida que deja el recipiente al comerla (cuenco). */
export const EATEN_REMAINDER: Readonly<Record<number, number>> = {
  [MUSHROOM_STEW]: BOWL, [RABBIT_STEW]: BOWL, [BEETROOT_SOUP]: BOWL, [SUSPICIOUS_STEW]: BOWL,
};
