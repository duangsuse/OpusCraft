// Luces de rana, dibujadas aquí (nada copiado del juego): una masa gelatinosa encendida con remolinos más claros y
// la corteza de fuera (los lados) en bandas; el techo, con el remolino que se enrosca hacia el centro. Ocre (amarilla
// anaranjada), verdosa y perlada (rosa lavanda), con los téxeles emisivos.
import { mix, scale, idx, N, Noise, pixelNoise, type Generator, type RGB, type Tex } from './texCore';

const COLORS: Record<string, [RGB, RGB]> = {
  ochre: [[252, 214, 120], [220, 150, 60]],
  verdant: [[214, 246, 176], [120, 186, 96]],
  pearlescent: [[250, 226, 240], [196, 150, 196]],
};

function base(t: Tex, [light, dark]: [RGB, RGB], top: boolean): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const cx = x - 7.5, cy = y - 7.5;
    // Remolino: en el techo, una espiral hacia el centro; de lado, ondas en vertical.
    const swirl = top ? Math.sin(Math.hypot(cx, cy) * 1.1 - Math.atan2(cy, cx) * 2) : Math.sin(x * 0.9 + n.at(x, y) * 4 + y * 0.35);
    let c = mix(dark, light, 0.55 + 0.35 * swirl + (px[i] - 0.5) * 0.2);
    const edge = Math.min(x, y, 15 - x, 15 - y);
    if (edge === 0) c = scale(dark, 0.85);
    else if (edge === 1) c = mix(c, dark, 0.35);
    t.setI(i, c);
    t.emit[i] = edge === 0 ? 120 : 200 + 40 * swirl;
    t.height[i] = 0.85 + 0.12 * swirl;
    t.smooth[i] = 170;
    t.sss[i] = 0.4;
  }
  t.depth = 0.9;
  void idx;
}

export const FROG_GENERATORS: Record<string, Generator> = Object.fromEntries(
  Object.entries(COLORS).flatMap(([k, col]) => [
    [`${k}_froglight_top`, (t: Tex) => base(t, col, true)],
    [`${k}_froglight_side`, (t: Tex) => base(t, col, false)],
  ]),
);
