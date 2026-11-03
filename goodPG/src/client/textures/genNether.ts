// Fase 8 (dimensiones): texturas de los desiertos del Nether y el portal, todas dibujadas aquí (nada copiado):
// - portal: un velo violeta translúcido con remolinos que brillan;
// - menas de cuarzo (cristales blancos) y de oro (pepitas) sobre la rocanegra;
// - magma: costra oscura partida por grietas de lava que brillan.
import { N, Noise, Tex, clamp, mix, pixelNoise, type Generator, type RGB } from './texCore';
import { ore, ORE_SHAPES, ORE_STYLES, type OreStyle } from './genStone';
import { netherrack } from './genStructures';

const { SH_DOT, SH_2, SH_2V, SH_L, SH_GEM, SH_SQ } = ORE_SHAPES;

const QUARTZ: OreStyle = {
  main: [226, 218, 208], light: [252, 250, 244], dark: [170, 156, 146], count: 8, minDist: 3.6,
  shapes: [SH_GEM, SH_2V, SH_L, SH_DOT, SH_2], smooth: 200, f0: 30,
};
const NETHER_GOLD: OreStyle = { ...ORE_STYLES.gold, count: 9, minDist: 3.4, shapes: [SH_DOT, SH_2, SH_2V, SH_SQ] };

/** Velo del portal: bandas que giran alrededor del centro, violeta translúcido y emisivo. */
function netherPortal(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const deep: RGB = [58, 8, 138], mid: RGB = [118, 32, 214], hot: RGB = [206, 128, 255];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const dx = x - 7.5, dy = y - 7.5;
    const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    // Espiral: la fase avanza con el ángulo y la distancia (se repite sin costura por el ruido periódico).
    const w = 0.5 + 0.5 * Math.sin(a * 2 + d * 0.9 + n4.at(x, y) * 4);
    const v = clamp(w * 0.8 + px[i] * 0.2, 0, 1);
    t.setI(i, v > 0.75 ? mix(mid, hot, (v - 0.75) * 4) : mix(deep, mid, v / 0.75));
    t.alpha[i] = 150 + 70 * v;
    t.emit[i] = 120 + 135 * v;
    t.height[i] = 1;
    t.smooth[i] = 200;
  }
  t.depth = 0.2;
}

/** Magma: placas oscuras separadas por grietas de lava (las grietas brillan). */
function magma(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const crack = Math.abs(n4.at(x, y) - 0.5) < 0.08 || Math.abs(n8.at(x + 5, y) - 0.5) < 0.05;
    if (crack) {
      const hot = px[i] > 0.5;
      t.setI(i, hot ? [255, 170, 40] : [228, 104, 24]);
      t.emit[i] = hot ? 150 : 100;
      t.height[i] = 0.35;
      t.smooth[i] = 150;
    } else {
      const v = 0.6 * n8.at(x, y) + 0.4 * px[i];
      t.setI(i, mix([58, 20, 12], [118, 42, 20], v));
      t.height[i] = 0.7 + 0.2 * v;
      t.smooth[i] = 60;
    }
  }
  t.depth = 1.2;
}

export const NETHER_GENERATORS: Record<string, Generator> = {
  nether_portal: netherPortal,
  nether_quartz_ore: (t) => ore(t, QUARTZ, netherrack),
  nether_gold_ore: (t) => ore(t, NETHER_GOLD, netherrack),
  magma,
};
