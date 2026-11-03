// Texturas de los bloques de las criaturas acuáticas (fase 6): huevos de tortuga (enteros, algo
// agrietados y muy agrietados). Cáscara blanca verdosa con motas verdes; las grietas son líneas
// oscuras que se ramifican.
import { N, Rng, idx, mix, scale, line, type Generator, type RGB, type Tex } from './texCore';

const SHELL: RGB = [232, 230, 206];
const SHELL_SHADE: RGB = [206, 210, 180];
const SPOT: RGB = [120, 156, 96];
const SPOT_DARK: RGB = [86, 122, 70];
const CRACK: RGB = [70, 64, 52];

function eggShell(t: Tex): void {
  // La misma cáscara en las tres etapas (sólo cambian las grietas).
  const r = new Rng('turtle_egg/shell');
  t.fillSpec(90, 10, 40, 0);
  for (let i = 0; i < N; i++) {
    const v = r.next();
    t.setI(i, v < 0.15 ? SHELL_SHADE : mix(SHELL, SHELL_SHADE, v * 0.3));
    t.height[i] = 0.9 + r.next() * 0.1;
  }
  // Motas verdes de varios tamaños.
  for (let k = 0; k < 18; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const big = r.chance(0.35);
    const c = r.chance(0.5) ? SPOT : SPOT_DARK;
    t.set(x, y, c);
    if (big) {
      t.set((x + 1) & 15, y, scale(c, 1.05));
      t.set(x, (y + 1) & 15, scale(c, 0.95));
    }
  }
  t.depth = 0.4;
}

/** Grietas: `n` líneas quebradas desde puntos al azar. */
function cracks(t: Tex, n: number): void {
  const r = t.rng('cracks' + n);
  for (let k = 0; k < n; k++) {
    let x = r.int(2, 13), y = r.int(2, 13);
    for (let s = 0; s < 4; s++) {
      const nx = Math.max(0, Math.min(15, x + r.int(-3, 3))), ny = Math.max(0, Math.min(15, y + r.int(-3, 3)));
      line(x, y, nx, ny, (px, py) => {
        const i = idx(px, py);
        t.setI(i, CRACK);
        t.height[i] = 0.5;
      });
      x = nx;
      y = ny;
    }
  }
}

export const AQUATIC_GENERATORS: Record<string, Generator> = {
  turtle_egg: eggShell,
  turtle_egg_slightly_cracked: (t) => {
    eggShell(t);
    cracks(t, 2);
  },
  turtle_egg_very_cracked: (t) => {
    eggShell(t);
    cracks(t, 5);
  },
};
