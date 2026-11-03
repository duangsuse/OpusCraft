// Fase 7.5 (abismo): animación del warden (su pose y su enfado llegan en los bits de estado).
// - Andar pesado: piernas cortas, brazos largos que se balancean y el torso que cabecea.
// - Golpe: los dos brazos arriba y abajo de un zarpazo.
// - Rugido: la cabeza atrás, los brazos abiertos y el pecho hacia delante.
// - Olfateo: el torso inclinado, la cabeza baja y de lado a lado.
// - Estampido sónico: se echa hacia atrás al cargarlo y suelta el golpe hacia delante.
// - Sale del suelo y se hunde (el cuerpo entero sube o baja bajo tierra, con los brazos apoyados).
// - Zarcillos que vibran al sentir algo y el corazón que late (más deprisa cuanto más enfadado).
import { mat4 } from 'gl-matrix';
import {
  wardenPose, wardenAngerLevel, heartbeatInterval, WARDEN_TENDRILS, POSE_EMERGING, POSE_DIGGING, POSE_SNIFFING, POSE_ROARING,
  POSE_SONIC, POSE_ATTACK, EMERGE_TICKS, DIG_TICKS, SONIC_HIT_TICK, type MobDef,
} from '../../shared/mobs';
import type { ClientEntity } from '../game/ClientEntities';

/** Cuándo empezó (en segundos del reloj de dibujo) la pose actual de cada warden. */
const POSES = new WeakMap<ClientEntity, { pose: number; t: number }>();

function poseTime(e: ClientEntity, time: number): [number, number] {
  const pose = wardenPose(e.flags);
  let s = POSES.get(e);
  if (!s || s.pose !== pose) POSES.set(e, (s = { pose, t: time }));
  return [pose, time - s.t];
}

function clampAngle(a: number, lim: number): number {
  let d = a % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.max(-lim, Math.min(lim, d));
}

/** Fuerza del latido (0..1) ahora mismo: un golpe doble al principio de cada intervalo. */
export function heartbeat(e: ClientEntity, time: number): number {
  const iv = heartbeatInterval(wardenAngerLevel(e.flags));
  const ph = (time + e.seed * 7) % iv;
  const beat = (t: number) => Math.exp(-((t / 0.07) ** 2));
  return Math.max(beat(ph - 0.05), 0.7 * beat(ph - 0.25));
}

/** Rotaciones [x, y, z] de una parte (se suman a las de reposo). */
export function animateWarden(def: MobDef, e: ClientEntity, time: number, name: string, out: number[]): void {
  if (def.anim !== 'warden') return;
  const [pose, pt] = poseTime(e, time);
  const swing = Math.sin(e.walkPhase * 0.8) * 0.7 * e.walkAmount;
  const headYaw = clampAngle(e.yaw - e.bodyYaw, 1.0);
  const idle = Math.sin(time * 1.1 + e.seed * 5);
  switch (name) {
    case 'legR':
      out[0] = swing;
      break;
    case 'legL':
      out[0] = -swing;
      break;
    case 'body':
      out[2] = Math.sin(e.walkPhase * 0.8) * 0.06 * e.walkAmount;
      out[0] = 0.04 * idle;
      // (Giro positivo en X: hacia atrás, como la cabeza que mira arriba.)
      if (pose === POSE_SNIFFING) out[0] = -0.35;
      else if (pose === POSE_ROARING) out[0] = 0.25 + 0.05 * Math.sin(pt * 20);
      else if (pose === POSE_SONIC) out[0] = pt < SONIC_HIT_TICK / 20 ? 0.3 * Math.min(1, pt / 1.2) : -0.3;
      else if (pose === POSE_EMERGING || pose === POSE_DIGGING) out[0] = -0.3;
      break;
    case 'head':
      out[1] = headYaw;
      out[0] = e.pitch * 0.5;
      if (pose === POSE_SNIFFING) {
        out[0] = -0.25;
        out[1] = Math.sin(pt * 3.2) * 0.6;
      } else if (pose === POSE_ROARING) out[0] = 0.7;
      else if (pose === POSE_SONIC) out[0] = pt < SONIC_HIT_TICK / 20 ? 0.5 : -0.2;
      break;
    case 'armR':
    case 'armL': {
      const side = name === 'armR' ? 1 : -1;
      out[0] = -swing * 1.1 + 0.04 * idle;
      out[2] = side * 0.06;
      if (pose === POSE_ATTACK) {
        // Zarpazo: arriba y de golpe abajo (en medio segundo).
        const k = Math.min(1, pt / 0.5);
        out[0] = k < 0.4 ? 2.6 * (k / 0.4) : 2.6 - 2.8 * ((k - 0.4) / 0.6);
      } else if (pose === POSE_ROARING) {
        out[0] = 0.6;
        out[2] = side * 0.9;
      } else if (pose === POSE_SONIC) {
        out[0] = pt < SONIC_HIT_TICK / 20 ? -0.5 : 0.4;
        out[2] = side * 0.5;
      } else if (pose === POSE_EMERGING || pose === POSE_DIGGING) {
        // Apoyado en el suelo con los brazos, empujando.
        out[0] = 1.1 + Math.sin(pt * 3 + side) * 0.3;
      }
      break;
    }
    case 'tendrilR':
    case 'tendrilL': {
      const side = name === 'tendrilR' ? 1 : -1;
      const buzz = e.flags & WARDEN_TENDRILS ? Math.sin(time * 60) * 0.35 : Math.sin(time * 1.3 + e.seed) * 0.05;
      out[1] = side * buzz;
      if (pose === POSE_ROARING) out[2] = side * 0.3;
      break;
    }
  }
}

/** Escala del corazón (late: se ve con cada golpe y se apaga entre ellos); null para el resto. */
export function wardenPartScale(def: MobDef, e: ClientEntity, name: string, time: number): [number, number, number] | null {
  if (def.anim !== 'warden' || name !== 'heart') return null;
  const b = heartbeat(e, time);
  if (b < 0.15) return [1e-3, 1e-3, 1e-3];
  const s = 0.85 + 0.3 * b;
  return [s, s, 1];
}

/** Sale del suelo o se hunde: el modelo entero bajo tierra según el avance de la pose. */
export function wardenRoot(def: MobDef, e: ClientEntity, m: mat4, time: number): void {
  if (def.anim !== 'warden') return;
  const [pose, pt] = poseTime(e, time);
  let depth = 0;
  if (pose === POSE_EMERGING) depth = 1 - Math.min(1, pt / (EMERGE_TICKS / 20));
  else if (pose === POSE_DIGGING) depth = Math.min(1, pt / (DIG_TICKS / 20));
  if (depth > 0) mat4.translate(m, m, [Math.sin(pt * 13) * 0.02, -depth * 3.1, 0]);
}
