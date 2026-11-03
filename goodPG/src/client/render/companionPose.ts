// Fase 6 (gólems/domesticar): poses propias de los gólems y de los animales domesticados para
// MobRenderer: andar y golpear de los gólems, animales sentados (el cuerpo se inclina sobre las
// patas de atrás, que quedan dobladas hacia delante), collar sólo si está domesticado y la piel
// de cada gato.
import { mat4 } from 'gl-matrix';
import type { MobDef } from '../../shared/mobs';
import { EF_SITTING, EF_TAMED } from '../../shared/protocol';
import { skinKey, variantOf } from '../../shared/companions';
import type { ClientEntity } from '../game/ClientEntities';

const P = 1 / 16;

/** Clave de la textura según la piel que llega en los bits de estado. */
export function mobSkinKey(def: MobDef, flags: number): number {
  return skinKey(def.id, variantOf(flags));
}

/** Partes que no se dibujan: el collar de los que no tienen dueño. */
export function hiddenPart(name: string, flags: number): boolean {
  return name === 'collar' && !(flags & EF_TAMED);
}

interface Sit {
  /** Cuánto baja el cuerpo e inclinación (radianes). */
  drop: number;
  tilt: number;
  hipY: number;
  hipZ: number;
}

const sitCache = new Map<number, Sit | null>();

/** Geometría de sentarse de un cuadrúpedo (a partir de sus patas: leg0 delantera, leg2 trasera). */
function sitOf(def: MobDef): Sit | null {
  let s = sitCache.get(def.id);
  if (s !== undefined) return s;
  s = null;
  const front = def.parts.find((p) => p.name === 'leg0');
  const rear = def.parts.find((p) => p.name === 'leg2');
  if (def.anim === 'quadruped' && front && rear && rear.pivot[2] > front.pivot[2]) {
    const hipY = rear.pivot[1];
    const drop = Math.max(0, hipY - 1.5);
    const tilt = Math.asin(Math.min(0.9, drop / (rear.pivot[2] - front.pivot[2])));
    s = { drop, tilt, hipY, hipZ: rear.pivot[2] };
  }
  sitCache.set(def.id, s);
  return s;
}

/** Raíz del modelo sentado: baja el cuerpo y lo inclina hacia arriba girando sobre la cadera. */
export function sitRoot(def: MobDef, flags: number, m: mat4): void {
  if (!(flags & EF_SITTING)) return;
  const s = sitOf(def);
  if (!s) return;
  mat4.translate(m, m, [0, (s.hipY - s.drop) * P, s.hipZ * P]);
  mat4.rotateX(m, m, s.tilt);
  mat4.translate(m, m, [0, -s.hipY * P, -s.hipZ * P]);
}

function clampAngle(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Rotación de animación de una parte (se llama después de la animación normal y la sustituye). */
export function companionPart(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  if (def.anim === 'golem') {
    golemPart(def, e, time, name, out);
    return;
  }
  if (!(e.flags & EF_SITTING)) return;
  const s = sitOf(def);
  if (!s) return;
  if (name === 'leg0' || name === 'leg1') out[0] = -s.tilt; // patas delanteras rectas
  else if (name === 'leg2' || name === 'leg3') out[0] = Math.PI / 2 - s.tilt; // traseras dobladas hacia delante
  else if (name === 'head') out[0] = e.pitch - s.tilt * 0.8;
  else if (name === 'tail') out[0] = -0.4;
}

function golemPart(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  out[0] = out[1] = out[2] = 0;
  const swing = Math.sin(e.walkPhase * 0.7) * 0.8 * e.walkAmount;
  // Golpe: los brazos suben de golpe y bajan durante medio segundo.
  const hit = e.actionT >= 0 && e.actionT < 0.5 ? 1 - e.actionT / 0.5 : 0;
  switch (name) {
    case 'head':
      out[1] = clampAngle(e.yaw - e.bodyYaw, 1.3);
      out[0] = e.pitch * 0.6;
      break;
    case 'legR':
      out[0] = swing;
      break;
    case 'legL':
      out[0] = -swing;
      break;
    case 'armR':
    case 'armL': {
      const side = name === 'armR' ? 1 : -1;
      if (def.key === 'snow_golem') {
        // Palos: se agitan un poco; al lanzar, el derecho se levanta.
        out[2] = side * Math.sin(time * 1.7 + e.seed * 4) * 0.08 + (name === 'armR' ? hit * 0.9 : 0);
      } else {
        out[0] = -swing * side * 0.9 + hit * 2.0;
        out[2] = side * 0.03;
      }
      break;
    }
    case 'body':
    case 'upper':
      out[1] = Math.sin(time * 0.9 + e.seed * 6) * 0.03 * (1 - e.walkAmount);
      break;
  }
}
