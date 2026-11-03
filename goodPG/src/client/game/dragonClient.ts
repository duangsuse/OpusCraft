// Fase 8.6 (el End): el dragón en el cliente.
// - Historia de vuelo (DragonFlightHistory): cada tick, su giro (en grados de Java) y su altura, con la que el modelo
//   dobla el cuello y la cola (y el cliente calcula dónde están sus partes para apuntar).
// - Aleteo (EnderDragon.aiStep): el ritmo depende de lo rápido que va y de si sube o baja; posado, despacio. Cada vez
//   que las alas bajan suena el batir.
import { MOB_ENDER_DRAGON, EF_DRAGON_SITTING, EF_DRAGON_LANDING, DRAGON_PARTS } from '../../shared/mobs';
import { dragonPartOffsets } from '../../shared/dragonParts';
import type { ClientEntity } from './ClientEntities';

const DEG = Math.PI / 180;

export interface DragonView {
  /** [yRot, y] de los últimos 64 ticks. */
  hist: Float64Array;
  ptr: number;
  /** Fracción del tick en curso (para interpolar la historia). */
  frac: number;
  acc: number;
  flap: number;
  flapPrev: number;
  last: [number, number, number];
  vel: [number, number, number];
  flapSound: boolean;
}

const views = new Map<number, DragonView>();

export function dragonView(e: ClientEntity): DragonView {
  let v = views.get(e.id);
  if (!v) {
    v = { hist: new Float64Array(128), ptr: -1, frac: 0, acc: 0, flap: 0, flapPrev: 0, last: [e.x, e.y, e.z], vel: [0, 0, 0], flapSound: false };
    views.set(e.id, v);
  }
  return v;
}

/** Giro del dragón en grados de Java a partir del nuestro. */
export function dragonYRot(e: ClientEntity): number {
  return -e.yaw / DEG;
}

/** Avanza la historia y el aleteo de todos los dragones (una vez por frame). */
export function updateDragons(list: Iterable<ClientEntity>, dt: number, onFlap: (e: ClientEntity) => void): void {
  const seen = new Set<number>();
  for (const e of list) {
    if (e.type !== MOB_ENDER_DRAGON || e.gone) continue;
    seen.add(e.id);
    const v = dragonView(e);
    const yRot = dragonYRot(e);
    if (v.ptr < 0) {
      for (let i = 0; i < 64; i++) {
        v.hist[i * 2] = yRot;
        v.hist[i * 2 + 1] = e.y;
      }
      v.ptr = 0;
    }
    v.acc += dt;
    while (v.acc >= 0.05) {
      v.acc -= 0.05;
      v.vel = [e.x - v.last[0], e.y - v.last[1], e.z - v.last[2]];
      v.last = [e.x, e.y, e.z];
      v.ptr = (v.ptr + 1) & 63;
      v.hist[v.ptr * 2] = yRot;
      v.hist[v.ptr * 2 + 1] = e.y;
      // El aleteo.
      v.flapPrev = v.flap;
      const sitting = (e.flags & EF_DRAGON_SITTING) !== 0;
      if (e.variant > 0) v.flap += 0.05;
      else if (sitting) v.flap += 0.1;
      else {
        let speed = 0.2 / (Math.hypot(v.vel[0], v.vel[2]) * 10 + 1);
        speed *= Math.pow(2, v.vel[1]);
        v.flap += speed;
      }
      const c0 = Math.cos(v.flapPrev * Math.PI * 2), c1 = Math.cos(v.flap * Math.PI * 2);
      if (c1 <= -0.3 && c0 >= -0.3 && e.variant === 0) onFlap(e);
    }
    v.frac = v.acc / 0.05;
  }
  for (const id of views.keys()) if (!seen.has(id)) views.delete(id);
}

/** [yRot, y] de hace `step` ticks (interpolado con la fracción del tick). */
export function dragonSample(v: DragonView, step: number): [number, number] {
  const a = ((v.ptr - step) & 63) * 2, b = ((v.ptr - step - 1) & 63) * 2;
  const t = v.frac;
  let dy = v.hist[a] - v.hist[b];
  dy = ((dy + 540) % 360) - 180;
  return [v.hist[b] + dy * t, v.hist[b + 1] + (v.hist[a + 1] - v.hist[b + 1]) * t];
}

/** Cajas de las partes del dragón (para apuntar). */
export function dragonPartBoxes(e: ClientEntity): { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }[] {
  const v = dragonView(e);
  const offs = dragonPartOffsets(dragonYRot(e), 0, (n) => dragonSample(v, n), (e.flags & EF_DRAGON_SITTING) !== 0);
  return offs.map(([dx, dy, dz], i) => {
    const [, w, h] = DRAGON_PARTS[i];
    const x = e.x + dx, y = e.y + dy, z = e.z + dz;
    return { x0: x - w / 2, y0: y, z0: z - w / 2, x1: x + w / 2, y1: y + h, z1: z + w / 2 };
  });
}

/** ¿Está aterrizando o despegando? (el cuello se dobla hacia el podio). */
export function dragonLanding(e: ClientEntity): boolean {
  return (e.flags & EF_DRAGON_LANDING) !== 0;
}
