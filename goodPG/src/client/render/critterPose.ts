// Fase 7.5 (fauna): poses de las criaturas sueltas para MobRenderer: el murciélago que bate las alas al
// volar y cuelga boca abajo del techo con las alas plegadas, y el esqueleto que va sentado en su caballo
// (piernas hacia delante). También elige la variante de textura de la champiñaca (roja o marrón).
import { mat4 } from 'gl-matrix';
import { MOB_BAT, MOB_MOOSHROOM, MOB_SKELETON, EF_BAT_HANGING, EF_BROWN_MOOSHROOM, EF_HORSEMAN, type MobDef } from '../../shared/mobs';
import type { ClientEntity } from '../game/ClientEntities';

const P = 1 / 16;

/** Variante de textura de una criatura nueva (0 = la normal). */
export function critterVariant(e: ClientEntity): number {
  if (e.type === MOB_MOOSHROOM) return e.flags & EF_BROWN_MOOSHROOM ? 1 : 0;
  return 0;
}

/**
 * Rotaciones de animación de una parte ([x, y, z] sumadas a las de reposo). Devuelve false si la criatura
 * sigue la animación común.
 */
export function critterAnimate(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (def.id !== MOB_BAT) return false;
  const hanging = (e.flags & EF_BAT_HANGING) !== 0;
  const side = name.endsWith('R') ? 1 : -1;
  if (hanging) {
    // Alas plegadas alrededor del cuerpo.
    if (name === 'wingR' || name === 'wingL') out[1] = side * 1.2;
    else if (name === 'wingTipR' || name === 'wingTipL') out[1] = side * 1.6;
    else if (name === 'head') out[1] = Math.sin(time * 0.3 + e.seed * 5) * 0.3;
    return true;
  }
  // Aleteo rápido (unas cuatro veces por segundo) hacia delante y hacia atrás.
  const flap = Math.cos(time * 26 + e.seed * 9) * Math.PI * 0.25;
  if (name === 'wingR' || name === 'wingL') out[1] = side * flap;
  else if (name === 'wingTipR' || name === 'wingTipL') out[1] = side * flap * 0.5;
  else if (name === 'body') out[0] = -0.25 + Math.cos(time * 2 + e.seed) * 0.08;
  else if (name === 'head') {
    const d = e.yaw - e.bodyYaw;
    out[1] = Math.max(-1, Math.min(1, Math.atan2(Math.sin(d), Math.cos(d))));
  }
  return true;
}

/** Después de la animación común: el jinete esqueleto lleva las piernas hacia delante y abiertas. */
export function critterPart(def: MobDef, e: ClientEntity, name: string, out: number[]): void {
  if (def.id !== MOB_SKELETON || !(e.flags & EF_HORSEMAN)) return;
  if (name === 'legR' || name === 'legL') {
    const side = name === 'legR' ? 1 : -1;
    out[0] = 1.35;
    out[1] = side * 0.3;
    out[2] = side * 0.08;
  }
}

/** Transformación del cuerpo entero: el murciélago colgado, boca abajo con las patas en el techo. */
export function critterRoot(def: MobDef, e: ClientEntity, m: mat4): void {
  if (def.id === MOB_BAT) {
    if (e.flags & EF_BAT_HANGING) {
      mat4.translate(m, m, [0, def.height + 4 * P, 0]);
      mat4.rotateZ(m, m, Math.PI);
    } else mat4.translate(m, m, [0, Math.sin(e.age * 6 + e.seed * 9) * 0.06, 0]);
  }
}
