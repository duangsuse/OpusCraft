// Fase 8.3 (criaturas del Nether): sprites de la caña con hongo distorsionado, la carga de fuego y la flecha
// espectral, dibujados como los de Java 26.3. Mismo formato que SPRITES en itemSprites.ts ('.' transparente; el
// contorno lo pone él).

type RGB = readonly [number, number, number];
interface Ink {
  c: RGB;
  o?: RGB;
  bare?: boolean;
}
interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
  holes?: boolean;
}

const ink = (c: RGB, o?: RGB): Ink => ({ c, o });

type Grid = string[][];
const grid = (): Grid => Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
const rows = (g: Grid): string[] => g.map((r) => r.join(''));
function plot(g: Grid, x: number, y: number, ch: string): void {
  if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = ch;
}
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(g, x0, y0, ch);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Caña con hongo distorsionado: la caña de pescar con un hongo distorsionado (sombrero turquesa, pie naranja) colgando. */
function warpedFungusOnAStick(): SpriteDef {
  const g = grid();
  line(g, 1, 14, 12, 3, 'a');
  line(g, 2, 14, 12, 4, 'b');
  line(g, 13, 1, 13, 10, 's');
  plot(g, 12, 1, 's');
  plot(g, 5, 11, 'w');
  plot(g, 6, 11, 'w');
  plot(g, 5, 12, 'W');
  plot(g, 6, 12, 'w');
  for (const [x, y, ch] of [
    [9, 10, 't'], [10, 10, 'T'], [12, 10, 'c'], [9, 11, 'p'], [10, 11, 'o'], [11, 11, 'T'], [12, 11, 'h'], [9, 12, 'o'], [10, 12, 'o'],
    [11, 12, 'm'], [12, 12, 'k'], [9, 13, 'm'], [10, 13, 't'], [11, 13, 't'], [12, 13, 'o'], [13, 13, 'k'], [10, 14, 'm'], [11, 14, 'm'],
    [12, 14, 'T'], [13, 14, 'T'],
  ] as const) plot(g, x, y, ch);
  return {
    rows: rows(g),
    inks: {
      a: ink([112, 84, 40], [40, 28, 12]), b: ink([74, 54, 26], [36, 24, 10]), s: { c: [120, 120, 124], bare: true },
      w: ink([190, 190, 196], [60, 60, 64]), W: ink([150, 150, 156], [60, 60, 64]),
      t: ink([22, 180, 140], [12, 70, 60]), T: ink([26, 110, 100], [12, 50, 46]), m: ink([16, 140, 120], [10, 60, 52]),
      c: ink([26, 128, 144], [12, 56, 64]), p: ink([255, 160, 100], [120, 60, 20]), o: ink([255, 100, 0], [120, 40, 0]),
      h: ink([74, 58, 48], [30, 22, 18]), k: ink([58, 74, 80], [26, 32, 36]),
    },
  };
}

export const NETHER_MOB_SPRITES: Record<string, SpriteDef> = {
  warped_fungus_on_a_stick: warpedFungusOnAStick(),
  // Carga de fuego: una bola de roca oscura con vetas de fuego.
  fire_charge: {
    rows: [
      '................',
      '................',
      '......1111......',
      '....112d3211....',
      '...123brgl32k...',
      '...13golbor3k...',
      '..12gbybobglrk..',
      '..1drlbyggbd3k..',
      '..13bogboldg3k..',
      '..k2gbolrbr32k..',
      '...k3brgd33rk...',
      '...k2d33d332k...',
      '....kk2r32kk....',
      '......kkkk......',
      '................',
      '................',
    ],
    inks: {
      '1': ink([58, 46, 46]), '2': ink([60, 60, 48]), '3': ink([86, 80, 64]), k: ink([32, 26, 26]), g: ink([110, 102, 102]),
      l: ink([160, 152, 124]), b: ink([125, 95, 71]), r: ink([160, 58, 0]), o: ink([200, 110, 10]), y: ink([240, 176, 30]),
      d: ink([90, 46, 0]),
    },
  },
  // Flecha espectral: la flecha, dorada y con la punta de piedra luminosa.
  spectral_arrow: {
    rows: [
      '................',
      '................',
      '............ywB.',
      '..........yLLyB.',
      '..........BoLB..',
      '..........oByB..',
      '.........yB.B...',
      '........LB......',
      '.......LB.......',
      '......yB........',
      '.....oB.........',
      '...LyB..........',
      '..LyLB..........',
      '..BLB...........',
      '...B............',
      '................',
    ],
    inks: {
      y: ink([220, 184, 58], [100, 60, 0]), w: ink([255, 255, 255], [100, 60, 0]), B: ink([122, 65, 0], [60, 30, 0]),
      L: ink([254, 254, 120], [100, 60, 0]), o: ink([210, 146, 42], [100, 60, 0]),
    },
  },
};
