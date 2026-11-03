// Fase 8.6 (el End): cómo se ven los élitros y el cuerpo al planear, portado de ElytraAnimationState (las alas: pegadas,
// abiertas al agacharse, desplegadas al planear y más o menos recogidas según lo que se cae) y de AvatarRenderer (el
// cuerpo se tumba hacia donde se mira en medio segundo y se ladea hacia donde va en los giros).
import { lookVector } from '../../shared/elytra';

export interface GlidePose {
  /** Ticks planeando (fallFlyTicks, con fracción). */
  ticks: number;
  /** Giros de las alas en el espacio de Java (x, y, z; la derecha, simétrica). */
  wings: [number, number, number];
  /** Velocidad suavizada (bloques/s), para los que se ven por la red. */
  vel: [number, number, number];
}

export function newGlidePose(): GlidePose {
  return { ticks: 0, wings: [Math.PI / 12, 0, -Math.PI / 12], vel: [0, 0, 0] };
}

/** Avanza la pose `dt` segundos. `vx, vy, vz` en bloques/s. */
export function stepGlidePose(a: GlidePose, gliding: boolean, crouching: boolean, vx: number, vy: number, vz: number, dt: number): void {
  a.ticks = gliding ? a.ticks + dt * 20 : 0;
  let tx: number, ty: number, tz: number;
  if (gliding) {
    let ratio = 1;
    const len = Math.hypot(vx, vy, vz);
    if (vy < 0 && len > 0) ratio = 1 - Math.pow(-vy / len, 1.5);
    tx = Math.PI / 12 + (Math.PI / 9 - Math.PI / 12) * ratio;
    tz = -Math.PI / 12 + (-Math.PI / 2 + Math.PI / 12) * ratio;
    ty = 0;
  } else if (crouching) {
    tx = (Math.PI * 2) / 9;
    tz = -Math.PI / 4;
    ty = 0.08726646;
  } else {
    tx = Math.PI / 12;
    tz = -Math.PI / 12;
    ty = 0;
  }
  // Java: un 30 % del camino cada tick.
  const k = 1 - Math.pow(0.7, dt * 20);
  a.wings[0] += (tx - a.wings[0]) * k;
  a.wings[1] += (ty - a.wings[1]) * k;
  a.wings[2] += (tz - a.wings[2]) * k;
}

/** Cuánto está tumbado (fallFlyingScale: ticks² / 100, hasta 1). */
export function glideScale(a: GlidePose): number {
  return Math.min(1, (a.ticks * a.ticks) / 100);
}

/** Ladeo en los giros (flyingYRot): el ángulo entre hacia dónde va y hacia dónde mira, en horizontal. */
export function glideRoll(yaw: number, pitch: number, vx: number, vz: number): number {
  const [lx, , lz] = lookVector(yaw, pitch);
  const lh = Math.hypot(lx, lz), mh = Math.hypot(vx, vz);
  if (mh * mh <= 1e-5 * 400 || lh * lh <= 1e-5) return 0;
  const dot = (vx / mh) * (lx / lh) + (vz / mh) * (lz / lh);
  const sign = vx * lz - vz * lx;
  return Math.sign(sign) * Math.acos(Math.min(1, Math.abs(dot)));
}
