// Fase 7.6: el escudo decorado con un estandarte. Sobre el dibujo del escudo (16×16) la madera se cambia
// por la tela del estandarte entera, estrechada a la forma del escudo (como las texturas de escudo de
// Minecraft), manteniendo el sombreado de la madera; el borde de hierro se queda.
import { dyeDecorKey } from './dyeArt';
import { dyedColor } from '../../shared/dyedColor';
import { bannerPixels, BANNER_W, BANNER_H } from './bannerArt';
import type { BannerLayer } from '../../shared/bannerPatterns';
import type { ItemStack } from '../../shared/items';

/** Decoración de lo que se lleva en la mano: la del escudo o el color del cuero teñido (null si no lleva). */
export function itemDecorKey(s: ItemStack | null | undefined): string | null {
  return shieldDecorKey(s) ?? dyeDecorKey(dyedColor(s));
}

/** Clave de la decoración de un escudo (null si no está decorado). */
export function shieldDecorKey(s: ItemStack | null | undefined): string | null {
  const sb = s?.data?.sb;
  if (sb === undefined) return null;
  return `${sb}:${(s!.data!.layers ?? []).map((l) => `${l[0]}.${l[1]}`).join(',')}`;
}

/** Fondo y capas de una clave de decoración (null si no vale). */
export function parseShieldKey(key: string): { base: number; layers: BannerLayer[] } | null {
  const [b, rest] = key.split(':');
  const base = Number(b);
  if (!Number.isInteger(base) || base < 0 || base > 15) return null;
  const layers: BannerLayer[] = [];
  for (const part of (rest ?? '').split(',')) {
    if (!part) continue;
    const [p, c] = part.split('.').map(Number);
    if (!Number.isInteger(p) || !Number.isInteger(c) || c < 0 || c > 15 || layers.length >= 6) return null;
    layers.push([p, c]);
  }
  return { base, layers };
}

/** La madera: píxeles opacos con tono cálido (el hierro del borde es gris). */
const isWood = (r: number, g: number, b: number) => r - b > 28;

/** Píxeles RGBA del escudo decorado a partir de los del escudo liso (`src`, desde `offset`). */
export function decoratedShieldRGBA(src: Uint8Array, offset: number, base: number, layers: readonly BannerLayer[]): Uint8Array {
  const out = src.slice(offset, offset + 16 * 16 * 4);
  const cloth = bannerPixels(base, layers);
  // Caja de la madera y su brillo medio (para conservar el sombreado).
  let x0 = 16, x1 = -1, y0 = 16, y1 = -1, sum = 0, n = 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      if (out[i + 3] < 128 || !isWood(out[i], out[i + 1], out[i + 2])) continue;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      sum += out[i] + out[i + 1] + out[i + 2];
      n++;
    }
  }
  if (n === 0) return out;
  const mean = sum / n;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * 16 + x) * 4;
      if (out[i + 3] < 128 || !isWood(out[i], out[i + 1], out[i + 2])) continue;
      const cx = Math.min(BANNER_W - 1, Math.floor(((x - x0 + 0.5) / (x1 - x0 + 1)) * BANNER_W));
      const cy = Math.min(BANNER_H - 1, Math.floor(((y - y0 + 0.5) / (y1 - y0 + 1)) * BANNER_H));
      const c = (cy * BANNER_W + cx) * 4;
      const shade = Math.max(0.7, Math.min(1.2, (out[i] + out[i + 1] + out[i + 2]) / mean));
      out[i] = Math.min(255, cloth[c] * shade);
      out[i + 1] = Math.min(255, cloth[c + 1] * shade);
      out[i + 2] = Math.min(255, cloth[c + 2] * shade);
    }
  }
  return out;
}
