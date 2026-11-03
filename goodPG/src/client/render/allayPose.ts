// Fase 7.5 (mansión): animación del alay para MobRenderer. Flota subiendo y bajando con las alas
// batiendo; con un objeto lo sujeta delante con los dos brazos; bailando (EF_ALLAY_DANCING) se mece,
// agita los brazos, ladea la cabeza y de vez en cuando da una vuelta entera.
import { mat4 } from 'gl-matrix';
import { MOB_ALLAY, EF_ALLAY_DANCING } from '../../shared/allay';
import type { MobDef } from '../../shared/mobs';
import type { ClientEntity } from '../game/ClientEntities';

function clampAngle(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Rotaciones [x, y, z] de una parte del alay (false si no es un alay). */
export function animateAllay(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (def.id !== MOB_ALLAY) return false;
  const seed = e.seed * 13;
  const dancing = (e.flags & EF_ALLAY_DANCING) !== 0;
  const holding = !!e.gear;
  const beat = Math.sin(time * 7 + seed);
  switch (name) {
    case 'wingR':
    case 'wingL': {
      const flap = 0.35 + Math.sin(time * 24 + seed) * 0.6;
      out[1] = name === 'wingR' ? flap : -flap;
      break;
    }
    case 'armR':
    case 'armL': {
      const side = name === 'armR' ? 1 : -1;
      if (holding) {
        // Los dos brazos al frente, juntos, sujetando el objeto.
        out[0] = 1.25;
        out[1] = -side * 0.3;
      } else if (dancing) {
        out[0] = 0.4 + beat * side * 0.9;
        out[2] = side * (0.35 + Math.abs(beat) * 0.3);
      } else {
        out[0] = 0.15 + e.walkAmount * 0.5 + Math.sin(time * 2.2 + seed + side) * 0.12;
        out[2] = side * 0.12;
      }
      break;
    }
    case 'head':
      out[1] = clampAngle(e.yaw - e.bodyYaw, 1.2);
      out[0] = e.pitch * 0.7;
      if (dancing) out[2] = beat * 0.35;
      break;
    case 'body':
      out[0] = e.walkAmount * 0.35;
      if (dancing) out[2] = beat * 0.18;
      break;
  }
  return true;
}

/** Raíz: flota arriba y abajo; bailando, cada pocos segundos da una vuelta sobre sí mismo. */
export function allayRoot(def: MobDef, e: ClientEntity, m: mat4, time: number): void {
  if (def.id !== MOB_ALLAY) return;
  const seed = e.seed * 7;
  mat4.translate(m, m, [0, 0.06 + Math.sin(time * 2.6 + seed) * 0.05, 0]);
  if (e.flags & EF_ALLAY_DANCING) {
    const t = (time + seed) % 3;
    if (t < 0.6) mat4.rotateY(m, m, (t / 0.6) * Math.PI * 2);
    mat4.translate(m, m, [0, Math.abs(Math.sin(time * 7 + seed)) * 0.06, 0]);
  }
}

/** Dónde lleva el objeto: delante del cuerpo, entre las manos (en píxeles respecto al cuerpo). */
export const ALLAY_HOLD: [number, number, number] = [0, -3.5, -3];
