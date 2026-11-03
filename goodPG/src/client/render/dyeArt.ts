// El cuero teñido (y la armadura para lobo) en pantalla. En Java, el cuero es una textura gris multiplicada por el color
// (el de siempre, 0xA06540, si no está teñido); aquí los dibujos son marrones, así que cada píxel se pasa a su brillo
// relativo al marrón de siempre y se multiplica por el color: el cuero sin teñir queda igual y el teñido conserva sus
// luces, sombras y costuras. En la armadura para lobo sólo se tiñen las placas (la capa «overlay» de Java); los
// bordes de escama de armadillo quedan de su color.
import { LEATHER_COLOR } from '../../shared/dyedColor';
import { WOLF_ARMOR } from '../../shared/items';

export type RGB = readonly [number, number, number];

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const LEATHER_LUM = lum((LEATHER_COLOR >> 16) & 255, (LEATHER_COLOR >> 8) & 255, LEATHER_COLOR & 255);

/** Un color del dibujo (en marrón cuero) teñido de `color` (0xRRGGBB). */
export function tintRGB(r: number, g: number, b: number, color: number): [number, number, number] {
  const k = lum(r, g, b) / LEATHER_LUM;
  return [Math.min(255, Math.round(((color >> 16) & 255) * k)), Math.min(255, Math.round(((color >> 8) & 255) * k)), Math.min(255, Math.round((color & 255) * k))];
}

/** Rampa de tonos teñida de `color` (cada tono con su brillo relativo al cuero). */
export function tintRamp(ramp: readonly RGB[], color: number): RGB[] {
  return ramp.map((c) => tintRGB(c[0], c[1], c[2], color));
}

/** Rampa de las placas de la armadura para lobo: el color con el brillo relativo de cada tono de la rampa. */
export function tintPlates(ramp: readonly RGB[], color: number): RGB[] {
  const ref = lum(ramp[1][0], ramp[1][1], ramp[1][2]);
  return ramp.map((c) => {
    const k = lum(c[0], c[1], c[2]) / ref;
    return [Math.min(255, Math.round(((color >> 16) & 255) * k)), Math.min(255, Math.round(((color >> 8) & 255) * k)), Math.min(255, Math.round((color & 255) * k))] as const;
  });
}

/** Sprite de 16×16 (RGBA desde `off` en `src`) del objeto `id` teñido de `color`. */
export function dyedSpriteRGBA(src: Uint8Array, off: number, id: number, color: number): Uint8Array {
  const out = src.slice(off, off + 1024);
  const wolf = id === WOLF_ARMOR;
  const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && src[off + (y * 16 + x) * 4 + 3] > 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const o = (y * 16 + x) * 4;
      if (out[o + 3] === 0) continue;
      // La armadura para lobo: sólo lo de dentro (los píxeles rodeados por los cuatro lados).
      if (wolf && !(opaque(x - 1, y) && opaque(x + 1, y) && opaque(x, y - 1) && opaque(x, y + 1))) continue;
      const [r, g, b] = wolf ? tintWolf(out[o], out[o + 1], out[o + 2], color) : tintRGB(out[o], out[o + 1], out[o + 2], color);
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
    }
  }
  return out;
}

/** Placas del dibujo de la armadura para lobo (tono base 196, 128, 112) teñidas. */
const WOLF_LUM = lum(196, 128, 112);
function tintWolf(r: number, g: number, b: number, color: number): [number, number, number] {
  const k = lum(r, g, b) / WOLF_LUM;
  return [Math.min(255, Math.round(((color >> 16) & 255) * k)), Math.min(255, Math.round(((color >> 8) & 255) * k)), Math.min(255, Math.round((color & 255) * k))];
}

/** Clave de decoración del objeto de la mano teñido ('d' y el color en hexadecimal). */
export function dyeDecorKey(color: number | undefined): string | null {
  return color === undefined ? null : 'd' + color.toString(16).padStart(6, '0');
}

/** Color de una clave de decoración de teñido (null si no es una). */
export function parseDyeKey(key: string): number | null {
  return /^d[0-9a-f]{6}$/.test(key) ? parseInt(key.slice(1), 16) : null;
}
