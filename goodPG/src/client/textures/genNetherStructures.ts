// Fase 8.4 (estructuras del Nether): texturas dibujadas aquí (nada copiado del juego):
// - verruga del Nether en sus tres dibujos (Java usa tres para las cuatro edades): brotes carnosos que asoman,
//   tallos con bulbos pequeños y la mata madura de bulbos grandes y abultados.
import { clamp, type Generator, type RGB, type Tex } from './texCore';
import { cutoutCanvas } from './genPlants';

const WART: readonly RGB[] = [[70, 8, 16], [112, 16, 26], [150, 26, 36], [190, 52, 54], [226, 100, 90]];

/** Bulbo redondeado en (cx, cy) de radio r, con luz desde arriba a la izquierda. */
function bulb(t: Tex, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (x < 0 || x > 15 || y < 0 || y > 15) continue;
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy * 1.1);
      if (d > r + 0.35) continue;
      const light = clamp(0.55 - (dx + dy) / (r * 2.6) - d / (r * 4), 0, 1);
      const l = Math.min(4, 1 + Math.floor(light * 3.9));
      t.paint(x, y, WART[d > r - 0.4 ? Math.max(1, l - 1) : l], 0.9 + 0.2 * light, 70, 140);
    }
  }
}

/** Verruga del Nether: `stage` 0 (brotes), 1 (tallos con bulbos pequeños) y 2 (madura). */
function netherWart(stage: number): Generator {
  return (t) => {
    cutoutCanvas(t, 60, 130);
    const r = t.rng();
    const tall = [4, 8, 12][stage];
    const size = [0.9, 1.4, 2.3][stage];
    const cols = stage === 2 ? [2, 5, 8, 11, 13] : [3, 7, 11];
    for (const c of cols) {
      const x0 = clamp(c + r.int(-1, 1), 1, 14);
      const h = Math.max(2, tall + r.int(-2, 1));
      let x = x0;
      // Tallo corto y grueso (en la madura casi no se ve bajo los bulbos).
      for (let s = 0; s < h; s++) {
        const y = 15 - s;
        t.paint(x, y, WART[s < 2 ? 0 : 1 + (s % 2)], 0.85, 60, 120);
        if (s < 2) t.paint(clamp(x + 1, 0, 15), y, WART[0], 0.8, 55, 110);
        if (s > 1 && r.chance(0.25)) x = clamp(x + (r.chance(0.5) ? 1 : -1), 1, 14);
      }
      bulb(t, x + 0.5, 15.5 - h, size);
      // Bulbos de al lado a media altura (a partir de la segunda edad).
      if (stage > 0 && h > 5) bulb(t, clamp(x + (r.chance(0.5) ? 1.5 : -1.5), 1, 14), 15.5 - h * 0.55, size * 0.7);
    }
  };
}

export const NETHER_STRUCTURE_GENERATORS: Record<string, Generator> = {
  nether_wart_stage0: netherWart(0),
  nether_wart_stage1: netherWart(1),
  nether_wart_stage2: netherWart(2),
};
