// Ciclo día/noche y clima deterministas: cliente y servidor calculan lo mismo a partir del tiempo
// del mundo y la semilla, sin mensajes extra.
import { hash2, hashToFloat } from './constants';

/** Altura del sol (-1..1) para un tiempo del mundo en días (0 = amanecer). */
export function sunHeightAt(worldTime: number): number {
  const dayTime = worldTime - Math.floor(worldTime);
  return Math.sin(dayTime * Math.PI * 2);
}

/** Intensidad de lluvia (0..1): episodios de ~0.35 días, uno de cada cinco con lluvia. */
export function rainAt(worldTime: number, seed: number): number {
  const period = 0.35;
  const k = Math.floor(worldTime / period);
  const f = worldTime / period - k;
  if (hashToFloat(hash2(k, 7331, seed)) >= 0.2) return 0;
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  return s(0, 0.08, f) * (1 - s(0.9, 1, f)) * (0.65 + 0.35 * hashToFloat(hash2(k, 99, seed)));
}

/**
 * Tormenta eléctrica (0..1): uno de cada tres episodios de lluvia es tormenta, y sólo truena
 * mientras llueve con fuerza. Mismo cálculo en el cliente y en el servidor.
 */
export function thunderAt(worldTime: number, seed: number): number {
  const k = Math.floor(worldTime / 0.35);
  if (hashToFloat(hash2(k, 4242, seed)) >= 0.35) return 0;
  const r = rainAt(worldTime, seed);
  return r > 0.45 ? r : 0;
}
