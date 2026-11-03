// Fase 6.5 (libros y estandartes): dibujo de la tela de un estandarte con sus capas. La tela mide 20×40
// píxeles (como la de Minecraft); cada dibujo es una máscara (0..1 por píxel, x desde la izquierda de
// quien lo mira de frente) que se pinta con el color de su capa encima del fondo. Todo es procedural:
// los dibujos con diseño (flor, creeper, calavera, «cosa», globo…) son figuras propias.
import { BANNER_PATTERNS, colorKey, type BannerLayer } from '../../shared/bannerPatterns';
import { DYE } from '../textures/colorSprites';

export const BANNER_W = 20;
export const BANNER_H = 40;

type Mask = (x: number, y: number) => number;

const W = BANNER_W, H = BANNER_H;
/** Centro del píxel en 0..1 (u a lo ancho, v a lo alto). */
const U = (x: number) => (x + 0.5) / W;
const V = (y: number) => (y + 0.5) / H;
const b = (c: boolean) => (c ? 1 : 0);

/** Figura de píxeles (filas de texto, 'x' = lleno) centrada en (cx, cy) y escalada `k` veces. */
function glyph(rows: readonly string[], cx: number, cy: number, k: number): Mask {
  const gw = rows[0].length, gh = rows.length;
  const x0 = cx - (gw * k) / 2, y0 = cy - (gh * k) / 2;
  return (x, y) => {
    const gx = Math.floor((x - x0) / k), gy = Math.floor((y - y0) / k);
    return b(gy >= 0 && gy < gh && gx >= 0 && gx < gw && rows[gy][gx] === 'x');
  };
}

/** Distancia de un píxel a la recta que va de (x0, y0) a (x1, y1) (en píxeles). */
function lineDist(x: number, y: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0, dy = y1 - y0;
  return Math.abs(dy * (x + 0.5 - x0) - dx * (y + 0.5 - y0)) / Math.hypot(dx, dy);
}

const CREEPER = [
  'xx..xx',
  'xx..xx',
  '..xx..',
  '.xxxx.',
  '.xxxx.',
  '.x..x.',
];

const SKULL = [
  '..xxxxxx..',
  '.xxxxxxxx.',
  'xxxxxxxxxx',
  'xx..xx..xx',
  'xx..xx..xx',
  'xxxxxxxxxx',
  '.xxx..xxx.',
  '..xxxxxx..',
  '..x.xx.x..',
  '..........',
  'x........x',
  '.xx....xx.',
  '...xxxx...',
  '.xx....xx.',
  'x........x',
];

export const PATTERN_MASKS: Readonly<Record<string, Mask>> = {
  stripe_bottom: (_x, y) => b(y >= 27),
  stripe_top: (_x, y) => b(y < 13),
  stripe_left: (x) => b(x < 7),
  stripe_right: (x) => b(x >= 13),
  stripe_center: (x) => b(x >= 7 && x < 13),
  stripe_middle: (_x, y) => b(y >= 16 && y < 24),
  stripe_downright: (x, y) => b(lineDist(x, y, 0, 0, W, H) < 3.2),
  stripe_downleft: (x, y) => b(lineDist(x, y, W, 0, 0, H) < 3.2),
  small_stripes: (x) => b(x % 4 >= 2),
  cross: (x, y) => b(lineDist(x, y, 0, 0, W, H) < 2.6 || lineDist(x, y, W, 0, 0, H) < 2.6),
  straight_cross: (x, y) => b((x >= 8 && x < 12) || (y >= 18 && y < 22)),
  triangle_bottom: (x, y) => b(V(y) > 1 - 0.45 * (1 - Math.abs(2 * U(x) - 1))),
  triangle_top: (x, y) => b(V(y) < 0.45 * (1 - Math.abs(2 * U(x) - 1))),
  triangles_bottom: (x, y) => b(H - 1 - y < 5 - Math.abs(((x + 0.5) % 5) - 2.5) * 2),
  triangles_top: (x, y) => b(y < 5 - Math.abs(((x + 0.5) % 5) - 2.5) * 2),
  diagonal_left: (x, y) => b(U(x) + V(y) < 1),
  diagonal_right: (x, y) => b(1 - U(x) + V(y) < 1),
  diagonal_up_left: (x, y) => b(U(x) + (1 - V(y)) < 1),
  diagonal_up_right: (x, y) => b(1 - U(x) + (1 - V(y)) < 1),
  circle: (x, y) => b(Math.hypot(x + 0.5 - 10, y + 0.5 - 20) < 5.2),
  rhombus: (x, y) => b(Math.abs(x + 0.5 - 10) / 7 + Math.abs(y + 0.5 - 20) / 12 < 1),
  half_vertical: (x) => b(x < 10),
  half_vertical_right: (x) => b(x >= 10),
  half_horizontal: (_x, y) => b(y < 20),
  half_horizontal_bottom: (_x, y) => b(y >= 20),
  square_bottom_left: (x, y) => b(x < 8 && y >= 28),
  square_bottom_right: (x, y) => b(x >= 12 && y >= 28),
  square_top_left: (x, y) => b(x < 8 && y < 12),
  square_top_right: (x, y) => b(x >= 12 && y < 12),
  border: (x, y) => b(x < 2 || x >= W - 2 || y < 2 || y >= H - 2),
  gradient: (_x, y) => Math.max(0, 1 - V(y) * 1.15),
  gradient_up: (_x, y) => Math.max(0, 1 - (1 - V(y)) * 1.15),
  // Con diseño.
  bricks: (x, y) => {
    const row = Math.floor(y / 4);
    return b(y % 4 === 3 || (x + (row & 1) * 3) % 6 === 0);
  },
  curly_border: (x, y) => {
    // Bordura con dientes redondeados: más ancha cada 4 píxeles a lo largo del borde.
    const d = Math.min(x, W - 1 - x, y, H - 1 - y);
    const along = x === 0 || x === W - 1 ? y : Math.min(x, W - 1 - x) === d ? x : y;
    return b(d < 1 + (Math.abs((along % 4) - 1.5) < 1 ? 2 : 0));
  },
  flower: (x, y) => {
    // Flor de ocho pétalos con el centro hueco.
    const dx = x + 0.5 - 10, dy = y + 0.5 - 17, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    return b((r < 7.2 * (0.55 + 0.45 * Math.abs(Math.cos(a * 4))) && r > 1.6) || (r < 0.9));
  },
  creeper: glyph(CREEPER, 10, 17, 2),
  skull: glyph(SKULL, 10, 18, 1.6),
  thing: (x, y) => {
    // Un cubo en perspectiva (hexágono con sus tres aristas interiores): figura propia de este juego.
    const dx = x + 0.5 - 10, dy = y + 0.5 - 18;
    const hex = Math.abs(dx) / 7 + Math.max(0, Math.abs(dy) - 3.5) / 7;
    const ring = hex < 1 && hex > 0.72;
    const inner = hex < 1 && ((dy < 0 && Math.abs(dy + Math.abs(dx) * 0.55) < 0.9) || (dy >= 0 && Math.abs(dx) < 0.8));
    return b(ring || inner);
  },
  // Fase 8.4: el hocico de piglin (una placa redondeada con los dos orificios y los colmillos a los lados).
  piglin: (x, y) => {
    const dx = x + 0.5 - 10, dy = y + 0.5 - 18;
    const plate = Math.abs(dx) <= 5.5 && Math.abs(dy) <= 3.5 && !(Math.abs(dx) > 4.5 && Math.abs(dy) > 2.5);
    const nostril = Math.abs(dy) < 1.4 && Math.abs(Math.abs(dx) - 2.2) < 0.9;
    const tusk = Math.abs(Math.abs(dx) - 6.5) < 0.6 && dy > 1.5 && dy < 5.5;
    return b((plate && !nostril) || tusk);
  },
  globe: (x, y) => {
    const dx = x + 0.5 - 10, dy = y + 0.5 - 18, r = Math.hypot(dx, dy);
    const edge = r < 7.5 && r > 6.3;
    const inside = r <= 6.3 && (Math.abs(dy) < 0.6 || Math.abs(dy - 3.2) < 0.5 || Math.abs(dy + 3.2) < 0.5 || Math.abs(dx) < 0.6 ||
      Math.abs(Math.hypot(dx / 0.45, dy) - 6.3) < 0.7);
    return b(edge || inside);
  },
};

/** Color sRGB de un índice de tinte. */
export function dyeRgb(color: number): readonly [number, number, number] {
  return DYE[colorKey(color)] ?? [200, 200, 200];
}

/** Ruido fijo por píxel (textura de tela) en -1..1. */
function weave(x: number, y: number): number {
  const h = Math.imul(x * 374761393 + y * 668265263, 1274126177) >>> 0;
  return ((h & 1023) / 1023) * 2 - 1 + ((x + y) & 1 ? 0.35 : -0.35);
}

/**
 * Píxeles RGBA (20×40, sRGB) de la tela: el color de fondo y encima cada capa con su color. Un poco de
 * trama para que parezca tela.
 */
export function bannerPixels(base: number, layers: readonly BannerLayer[]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(W * H * 4);
  const masks = layers.map(([p, c]) => [PATTERN_MASKS[BANNER_PATTERNS[p]?.key ?? ''], dyeRgb(c)] as const);
  const bg = dyeRgb(base);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r: number = bg[0], g: number = bg[1], bl: number = bg[2];
      for (const [m, c] of masks) {
        const a = m ? m(x, y) : 0;
        if (a <= 0) continue;
        r += (c[0] - r) * a;
        g += (c[1] - g) * a;
        bl += (c[2] - bl) * a;
      }
      const k = 1 + weave(x, y) * 0.045;
      const i = (y * W + x) * 4;
      out[i] = r * k;
      out[i + 1] = g * k;
      out[i + 2] = bl * k;
      out[i + 3] = 255;
    }
  }
  return out;
}
