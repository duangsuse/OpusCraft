// Poses de la fauna de la fase 6 para MobRenderer: alas que baten (abejas y loros), loros posados,
// pandas sentados comiendo, tumbados panza arriba o rodando, y armadillos enroscados en una bola.
// También elige la variante de textura (color del loro, abeja enfadada o con polen).
import { mat4 } from 'gl-matrix';
import { MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO, type MobDef } from '../../shared/mobs';
import { EF_ANGRY } from '../../shared/protocol';
import { EF_FAUNA_A, EF_FAUNA_B, parrotVariant } from '../../shared/fauna';
import type { ClientEntity } from '../game/ClientEntities';
import { critterVariant } from './critterPose'; // Fase 7.5 (fauna)

/** Variante de textura de la criatura (0 = la normal); la textura se pide con id + 1000 · variante. */
export function mobVariant(e: ClientEntity): number {
  if (e.type === MOB_PARROT) return parrotVariant(e.id);
  if (e.type === MOB_BEE) return (e.flags & EF_ANGRY ? 1 : 0) | (e.flags & EF_FAUNA_A ? 2 : 0);
  return critterVariant(e); // Fase 7.5 (fauna): champiñaca marrón
}

const pandaSitting = (e: ClientEntity) => (e.flags & (EF_FAUNA_A | EF_FAUNA_B)) === EF_FAUNA_A;
const pandaLying = (e: ClientEntity) => (e.flags & (EF_FAUNA_A | EF_FAUNA_B)) === EF_FAUNA_B;
const pandaRolling = (e: ClientEntity) => (e.flags & (EF_FAUNA_A | EF_FAUNA_B)) === (EF_FAUNA_A | EF_FAUNA_B);

/**
 * Rotaciones de animación de una parte de la fauna nueva ([x, y, z] sumadas a las de reposo).
 * Devuelve false si la criatura no es de la fauna nueva o la parte sigue la animación común.
 */
export function faunaAnimate(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  const seed = e.seed * 17;
  switch (def.id) {
    case MOB_BEE: {
      if (name === 'wingR' || name === 'wingL') {
        const flap = 0.35 + Math.sin(time * 55 + seed) * 0.45;
        out[2] = name === 'wingR' ? flap : -flap;
      } else if (name.startsWith('leg')) out[0] = 0.25 + Math.sin(time * 3 + seed + Number(name.slice(3))) * 0.12;
      else if (name.startsWith('antenna')) out[0] = Math.sin(time * 4 + seed) * 0.1;
      return true;
    }
    case MOB_PARROT: {
      const perched = (e.flags & EF_FAUNA_A) !== 0;
      if (name === 'wingR' || name === 'wingL') {
        const flap = perched ? 0.05 : 0.5 + Math.sin(time * 26 + seed) * 0.7;
        out[2] = name === 'wingR' ? flap : -flap;
      } else if (name === 'legR' || name === 'legL') out[0] = perched ? 0 : 0.8;
      else if (name === 'tail') out[0] = perched ? Math.sin(time * 1.5 + seed) * 0.08 : -0.3;
      else if (name === 'head') {
        const d = e.yaw - e.bodyYaw;
        out[1] = Math.max(-1, Math.min(1, Math.atan2(Math.sin(d), Math.cos(d))));
        out[0] = perched ? Math.sin(time * 0.9 + seed) * 0.15 : 0;
      }
      return true;
    }
    case MOB_PANDA: {
      if (pandaSitting(e)) {
        // Sentado: patas de delante hacia la boca, masticando.
        if (name === 'leg0' || name === 'leg1') out[0] = 0.9 + Math.sin(time * 5 + seed) * 0.15;
        else if (name === 'head') out[0] = -0.8 + Math.sin(time * 5 + seed) * 0.08;
        return true;
      }
      if (pandaLying(e)) {
        // Panza arriba: patas al aire, moviéndose despacio.
        if (name.startsWith('leg')) out[0] = Math.sin(time * 1.6 + seed + Number(name.slice(3)) * 1.3) * 0.25;
        return true;
      }
      return pandaRolling(e);
    }
    default:
      return false;
  }
}

// Casi cero pero no cero (una matriz singular hace que algunas GPU dibujen líneas sueltas).
const HIDE: [number, number, number] = [1e-3, 1e-3, 1e-3];
const BALL: [number, number, number] = [1.05, 1.1, 0.72];

/** Escala de una parte (null = la normal): el armadillo enroscado esconde cabeza, patas y cola. */
export function faunaPartScale(def: MobDef, e: ClientEntity, name: string): [number, number, number] | null {
  if (def.id !== MOB_ARMADILLO || !(e.flags & EF_FAUNA_A)) return null;
  return name === 'body' ? BALL : HIDE;
}

/**
 * Transformación del cuerpo entero (después del giro y antes de la escala del modelo): la abeja
 * sube y baja un poco al volar, el panda se sienta, se tumba o rueda y el armadillo enroscado
 * queda en el suelo.
 */
export function faunaRoot(def: MobDef, e: ClientEntity, m: mat4): void {
  switch (def.id) {
    case MOB_BEE:
      mat4.translate(m, m, [0, Math.sin(e.age * 5 + e.seed * 9) * 0.05, 0]);
      mat4.rotateX(m, m, Math.max(-0.5, Math.min(0.5, e.pitch)));
      break;
    case MOB_PANDA:
      if (pandaSitting(e)) {
        // Girar hacia arriba alrededor del trasero y bajar hasta el suelo.
        mat4.translate(m, m, [0, 0.12, 0.69]);
        mat4.rotateX(m, m, 1.0);
        mat4.translate(m, m, [0, -0.5, -0.69]);
      } else if (pandaLying(e)) {
        mat4.translate(m, m, [0, 1.35, 0]);
        mat4.rotateZ(m, m, Math.PI);
      } else if (pandaRolling(e)) {
        mat4.translate(m, m, [0, 0.65, 0]);
        mat4.rotateX(m, m, -e.age * 7);
        mat4.translate(m, m, [0, -0.65, 0]);
      }
      break;
    case MOB_ARMADILLO:
      if (e.flags & EF_FAUNA_A) mat4.translate(m, m, [0, -2.5 / 16, 0]);
      break;
  }
}
