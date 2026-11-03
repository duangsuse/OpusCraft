// Fase 7 (redstone): consultas de potencia, como en Minecraft.
// - Un emisor da potencia débil y fuerte hacia cada cara (ver api.ts).
// - Un bloque conductor (cubo sólido opaco) recibe la potencia fuerte de sus vecinos y la pasa a todo
//   lo que tenga alrededor; la débil (la del polvo) sólo a los componentes, no a otro polvo.
// - `noWire`: se ignora el polvo como fuente (el polvo calcula así la potencia que le llega de fuera y
//   luego la reparte por su red; es el `shouldSignal = false` de Minecraft).
import { FACE_X, FACE_Y, FACE_Z, opposite, emitterOf, isConductor, type RedstoneView } from './api';
import { isWire } from '../blocks/redstoneBlocks';

/** Potencia débil que da el bloque de (x, y, z) hacia `face`. */
export function weakAt(v: RedstoneView, x: number, y: number, z: number, face: number, noWire = false): number {
  const id = v.getBlock(x, y, z);
  if (id <= 0 || (noWire && isWire(id))) return 0;
  const e = emitterOf(id);
  return e ? e.weak(v, x, y, z, id, face) : 0;
}

/** Potencia fuerte que da el bloque de (x, y, z) hacia `face`. */
export function strongAt(v: RedstoneView, x: number, y: number, z: number, face: number, noWire = false): number {
  const id = v.getBlock(x, y, z);
  if (id <= 0 || (noWire && isWire(id))) return 0;
  const e = emitterOf(id);
  return e?.strong ? e.strong(v, x, y, z, id, face) : 0;
}

/** Potencia fuerte que recibe el bloque (x, y, z) de sus seis vecinos. */
export function strongInto(v: RedstoneView, x: number, y: number, z: number, noWire = false): number {
  let best = 0;
  for (let f = 0; f < 6; f++) {
    const s = strongAt(v, x + FACE_X[f], y + FACE_Y[f], z + FACE_Z[f], opposite(f), noWire);
    if (s > best) {
      best = s;
      if (best >= 15) break;
    }
  }
  return best;
}

/** Potencia que llega a (x, y, z) desde el vecino de la cara `face` (getSignal de Minecraft). */
export function signalFrom(v: RedstoneView, x: number, y: number, z: number, face: number, noWire = false): number {
  const nx = x + FACE_X[face], ny = y + FACE_Y[face], nz = z + FACE_Z[face];
  const id = v.getBlock(nx, ny, nz);
  if (id <= 0) return 0;
  let s = 0;
  const e = emitterOf(id);
  if (e && !(noWire && isWire(id))) s = e.weak(v, nx, ny, nz, id, opposite(face));
  if (s < 15 && isConductor(id)) s = Math.max(s, strongInto(v, nx, ny, nz, noWire));
  return s;
}

/** Mayor potencia que recibe (x, y, z) de sus vecinos (getBestNeighborSignal de Minecraft). */
export function bestNeighborSignal(v: RedstoneView, x: number, y: number, z: number, noWire = false): number {
  let best = 0;
  for (let f = 0; f < 6; f++) {
    const s = signalFrom(v, x, y, z, f, noWire);
    if (s > best) {
      best = s;
      if (best >= 15) break;
    }
  }
  return best;
}

/** ¿Recibe (x, y, z) alguna potencia? */
export function hasNeighborSignal(v: RedstoneView, x: number, y: number, z: number): boolean {
  for (let f = 0; f < 6; f++) if (signalFrom(v, x, y, z, f) > 0) return true;
  return false;
}
