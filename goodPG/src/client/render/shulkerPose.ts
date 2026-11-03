// Fase 8.6 (el End): cómo se ve el shulker, portado de ShulkerModel y ShulkerRenderer.
// - Lo que se asoma va hacia lo que manda el servidor a 0,05 por tick; la tapa sube hasta un bloque, gira un octavo de
//   vuelta al abrirse del todo y, abierta del todo, tiembla un poco.
// - Todo el modelo se gira hacia fuera de la cara donde se pega (alrededor del centro del bloque).
// - La cabeza mira a donde manda el servidor (su mirada, pasada a los ejes del shulker; sin cabeceo, como en Java).
// - Al teletransportarse, se ve deslizarse desde donde estaba durante 6 ticks (getRenderPosition).
import { mat4 } from 'gl-matrix';
import type { ClientEntity } from '../game/ClientEntities';
import { MOB_SHULKER, SHULKER_PEEKS, oppositeDir, shulkerFace, shulkerPeekState, shulkerBox } from '../../shared/endMobs';

interface ShulkerView {
  peek: number;
  t: number;
  /** Celda anterior y ticks que quedan del deslizamiento. */
  bx: number;
  by: number;
  bz: number;
  slide: number;
  from: [number, number, number];
}

const views = new WeakMap<ClientEntity, ShulkerView>();

/** Avanza la vista del shulker hasta `time` (s). */
function view(e: ClientEntity, time: number): ShulkerView {
  let v = views.get(e);
  const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
  if (!v) {
    v = { peek: SHULKER_PEEKS[shulkerPeekState(e.variant)] / 100, t: time, bx, by, bz, slide: 0, from: [0, 0, 0] };
    views.set(e, v);
  }
  const ticks = Math.max(0, Math.min(10, (time - v.t) * 20));
  v.t = time;
  if (bx !== v.bx || by !== v.by || bz !== v.bz) {
    v.from = [v.bx - bx, v.by - by, v.bz - bz];
    v.slide = Math.abs(v.from[0]) + Math.abs(v.from[1]) + Math.abs(v.from[2]) <= 24 ? 6 : 0;
    v.bx = bx;
    v.by = by;
    v.bz = bz;
  }
  v.slide = Math.max(0, v.slide - ticks);
  const want = SHULKER_PEEKS[shulkerPeekState(e.variant)] / 100;
  if (v.peek < want) v.peek = Math.min(want, v.peek + 0.05 * ticks);
  else if (v.peek > want) v.peek = Math.max(want, v.peek - 0.05 * ticks);
  return v;
}

/** Lo que se asoma ahora (0..1). */
export function shulkerPeek(e: ClientEntity, time: number): number {
  return view(e, time).peek;
}

/** Caja del shulker para chocar con él (se puede estar encima, como en Java). */
export function shulkerCollisionBox(e: ClientEntity, time: number): [number, number, number, number, number, number] {
  return shulkerBox(e.x, e.y, e.z, shulkerFace(e.variant), view(e, time).peek);
}

/** Giro que lleva +Y (el techo del shulker) hacia fuera de la cara donde se pega. */
function faceRotation(m: mat4, dir: number): void {
  switch (dir) {
    case 0: mat4.rotateX(m, m, Math.PI); break;
    case 2: mat4.rotateX(m, m, -Math.PI / 2); break;
    case 3: mat4.rotateX(m, m, Math.PI / 2); break;
    case 4: mat4.rotateZ(m, m, Math.PI / 2); break;
    case 5: mat4.rotateZ(m, m, -Math.PI / 2); break;
  }
}

/** Raíz: el deslizamiento del teletransporte y el giro de su cara (alrededor del centro del bloque). */
export function shulkerRoot(def: { id: number }, e: ClientEntity, m: mat4, time: number): void {
  if (def.id !== MOB_SHULKER) return;
  const v = view(e, time);
  if (v.slide > 0) {
    const k = (v.slide / 6) ** 2;
    mat4.translate(m, m, [v.from[0] * k, v.from[1] * k, v.from[2] * k]);
  }
  mat4.rotateY(m, m, -e.bodyYaw);
  mat4.translate(m, m, [0, 0.5, 0]);
  faceRotation(m, oppositeDir(shulkerFace(e.variant)));
  mat4.translate(m, m, [0, -0.5, 0]);
}

/** Desplazamiento de la tapa (en píxeles): sube lo que se asoma y, abierta del todo, tiembla. */
export function shulkerPartOffset(def: { id: number }, e: ClientEntity, time: number, name: string, off: number[]): boolean {
  if (def.id !== MOB_SHULKER) return false;
  off[0] = off[1] = off[2] = 0;
  if (name === 'lid') {
    const bs = (0.5 + view(e, time).peek) * Math.PI;
    const extra = bs > Math.PI ? Math.sin(time * 20 * 0.1 + e.seed * 50) * 0.7 : 0;
    off[1] = 8 - Math.sin(bs) * 8 - extra;
  }
  return true;
}

/** Giros de las partes: la tapa al abrirse y la cabeza hacia donde mira. */
export function animateShulker(def: { id: number }, e: ClientEntity, time: number, name: string, out: number[]): void {
  if (def.id !== MOB_SHULKER) return;
  if (name === 'lid') {
    const peek = view(e, time).peek;
    const bs = (0.5 + peek) * Math.PI;
    const q = -1 + Math.sin(bs);
    out[1] = peek > 0.3 ? q * q * q * q * Math.PI * 0.125 : 0;
  } else if (name === 'head') {
    // La mirada del servidor, pasada a los ejes del shulker.
    const dx = -Math.sin(e.yaw) * Math.cos(e.pitch), dy = Math.sin(e.pitch), dz = -Math.cos(e.yaw) * Math.cos(e.pitch);
    // Deshace el giro de la cara (su inversa, caso a caso).
    let lx: number, lz: number;
    switch (oppositeDir(shulkerFace(e.variant))) {
      case 0: [lx, lz] = [dx, -dz]; break;
      case 2: [lx, lz] = [dx, dy]; break;
      case 3: [lx, lz] = [dx, -dy]; break;
      case 4: [lx, lz] = [dy, dz]; break;
      case 5: [lx, lz] = [-dy, dz]; break;
      default: [lx, lz] = [dx, dz];
    }
    out[1] = Math.atan2(-lx, -lz);
    out[0] = 0;
  }
}
