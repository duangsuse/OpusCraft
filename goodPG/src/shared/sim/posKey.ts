// Empaquetado de coordenadas de bloque en un único número exacto (< 2^53). La y ocupa 9 bits
// (de MIN_Y a MIN_Y + 511), así cabe todo el alto del mundo.
import { MIN_Y } from '../constants';

const OFF = 1 << 20;
const SPAN = 1 << 21;
const Y_SPAN = 512;

export function posKey(x: number, y: number, z: number): number {
  return ((x + OFF) * SPAN + (z + OFF)) * Y_SPAN + (y - MIN_Y);
}

export function keyY(k: number): number {
  return (k % Y_SPAN) + MIN_Y;
}

export function keyZ(k: number): number {
  return (Math.floor(k / Y_SPAN) % SPAN) - OFF;
}

export function keyX(k: number): number {
  return Math.floor(Math.floor(k / Y_SPAN) / SPAN) - OFF;
}

/** Clave del formato antiguo (y de 0 a 255 en 8 bits) → clave actual. */
export function legacyPosKey(k: number): number {
  const y = k % 256, rest = Math.floor(k / 256);
  return rest * Y_SPAN + (y - MIN_Y);
}
