// Fase 7.5 (océano): animación del guardián y del guardián anciano. La cola culebrea (más deprisa al
// nadar), el ojo se desliza por la cara hacia donde mira y las púas salen cuando está quieto y se meten
// en el cuerpo al nadar (con una transición suave, como en Minecraft).
import type { MobDef } from '../../shared/mobs';
import { EF_GUARDIAN_MOVING } from '../../shared/oceanMobs';
import type { ClientEntity } from '../game/ClientEntities';

/** Escala de las púas recogidas (se quedan dentro del cuerpo, sólo asoma la punta). */
const SPIKES_IN = 0.55;
/** Salida de las púas por entidad: [valor 0..1, último tiempo]. */
const spikes = new Map<number, [number, number]>();

function clamp(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Rotaciones [x, y, z] de una parte; false si no es un guardián. */
export function animateGuardian(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): boolean {
  if (def.anim !== 'guardian') return false;
  const moving = (e.flags & EF_GUARDIAN_MOVING) !== 0;
  const speed = moving ? 5 : 1.6;
  const phase = time * speed + e.seed * 20;
  switch (name) {
    case 'tail0':
      out[1] = Math.sin(phase) * (moving ? 0.35 : 0.15);
      break;
    case 'tail1':
      out[1] = Math.sin(phase - 0.8) * (moving ? 0.45 : 0.2);
      break;
    case 'tail2':
      out[1] = Math.sin(phase - 1.6) * (moving ? 0.55 : 0.25);
      break;
    case 'eye':
      // El ojo gira alrededor del centro del cuerpo: se desliza por la cara hacia la presa.
      out[1] = clamp(e.yaw - e.bodyYaw, 0.28);
      out[0] = Math.max(-0.28, Math.min(0.28, e.pitch));
      break;
  }
  return true;
}

/** Escala de las púas según estén fuera o dentro (null para el resto de partes y criaturas). */
export function guardianPartScale(def: MobDef, e: ClientEntity, name: string, time: number): [number, number, number] | null {
  if (def.anim !== 'guardian' || !name.startsWith('spike')) return null;
  let s = spikes.get(e.id);
  const want = e.flags & EF_GUARDIAN_MOVING ? 0 : 1;
  if (!s) {
    s = [want, time];
    spikes.set(e.id, s);
    if (spikes.size > 256) for (const k of spikes.keys()) if (k !== e.id) { spikes.delete(k); break; }
  }
  const dt = Math.max(0, Math.min(0.1, time - s[1]));
  s[1] = time;
  s[0] += (want - s[0]) * Math.min(1, dt * 6);
  const k = SPIKES_IN + (1 - SPIKES_IN) * s[0];
  return [k, k, k];
}
