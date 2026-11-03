// Alcance cuerpo a cuerpo de Java 26.3 (Mob.isWithinMeleeAttackRange + MeleeAttackGoal.canPerformAttack): la caja
// del atacante crece DEFAULT_ATTACK_REACH (√2,04 − 0,6 en float, ≈ 0,828) en horizontal —no en vertical— y tiene
// que tocar la del objetivo; además tiene que verlo (hasLineOfSight, de ojos a ojos, contra las formas de
// colisión). Así nadie pega a través de una puerta cerrada, un panel de cristal o una pared fina.
import { lineOfSight, type BlockGetter } from '../physics';

export const DEFAULT_ATTACK_REACH = Math.sqrt(Math.fround(2.04)) - Math.fround(0.6);

interface Box {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

/** ¿La caja de ataque de `e` toca la del objetivo (centro de los pies tx, ty, tz; ancho tw, alto th)? */
export function inMeleeReach(e: Box, tx: number, ty: number, tz: number, tw: number, th: number): boolean {
  const r = e.width / 2 + DEFAULT_ATTACK_REACH + tw / 2;
  return Math.abs(tx - e.x) < r && Math.abs(tz - e.z) < r && ty < e.y + e.height && ty + th > e.y;
}

/** Alcance y línea de visión (de los ojos del atacante a los del objetivo, a `eye` sobre sus pies). */
export function canMeleeHit(w: BlockGetter, e: Box, tx: number, ty: number, tz: number, tw: number, th: number, eye: number): boolean {
  return inMeleeReach(e, tx, ty, tz, tw, th) && lineOfSight(w, e.x, e.y + e.height * 0.85, e.z, tx, ty + eye, tz);
}
