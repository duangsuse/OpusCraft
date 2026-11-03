// Fase 6 (monturas): detalles de la pose de las monturas para MobRenderer. La silla y los estribos
// sólo se ven si la llevan; la cola se mece; al tirar al jinete la montura se encabrita (se levanta
// sobre las patas traseras).
import { mat4 } from 'gl-matrix';
import type { MobDef } from '../../shared/mobs';
import { MOUNTS, isSaddlePart } from '../../shared/mounts';
import { EF_ACTION, EF_SADDLE } from '../../shared/protocol';
import type { ClientEntity } from '../game/ClientEntities';

const P = 1 / 16;

/** ¿Se oculta esta parte? (silla y estribos sin silla puesta). */
export function hiddenMountPart(name: string, e: ClientEntity): boolean {
  return isSaddlePart(name) && !(e.flags & EF_SADDLE);
}

/** Rotación extra de las partes de una montura (se suma a la de la animación general). */
export function mountPartAnim(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  if (!MOUNTS[def.id]) return;
  if (name === 'tail') {
    out[2] += Math.sin(time * 1.7 + e.seed * 6) * 0.12;
    out[0] -= e.walkAmount * 0.35;
  } else if (name === 'neck' && e.walkAmount > 0.5) {
    // Al galope el cuello cabecea.
    out[0] += Math.sin(e.walkPhase) * 0.08 * e.walkAmount;
  }
}

/** Encabritada (EF_ACTION): gira el cuerpo hacia arriba sobre las patas traseras. */
export function mountRootPose(def: MobDef, e: ClientEntity, m: mat4): void {
  if (!MOUNTS[def.id] || !(e.flags & EF_ACTION)) return;
  const k = Math.min(1, Math.max(0, e.actionT) * 4);
  const back = 8 * P;
  mat4.translate(m, m, [0, 0, back]);
  mat4.rotateX(m, m, 0.75 * k);
  mat4.translate(m, m, [0, 0, -back]);
}
