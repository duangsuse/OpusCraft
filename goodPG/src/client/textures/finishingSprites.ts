// Fase 6.5 (remate): sprites de la etiqueta, la correa, el saco (y sus 16 colores) y el soporte para
// armadura. Mismo formato que SPRITES en itemSprites.ts ('.' transparente; el contorno lo pone él).
import { DYE } from './colorSprites';

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
const shade = (c: RGB, k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];

// Saco de cuero atado con una cuerda: 1 claro, 2 base, 3 sombra, s cuerda.
const BUNDLE_ROWS = [
  '................',
  '................',
  '......s..s......',
  '.......ss.......',
  '......1221......',
  '.....122221.....',
  '....12222223....',
  '...1222222233...',
  '...1222222333...',
  '..122222223333..',
  '..122222233333..',
  '..122222333333..',
  '...2222333333...',
  '....33333333....',
  '................',
  '................',
];

function bundleSprite(base: RGB): SpriteDef {
  return {
    rows: BUNDLE_ROWS,
    inks: {
      '1': ink(shade(base, 1.3), shade(base, 0.35)),
      '2': ink(base, shade(base, 0.35)),
      '3': ink(shade(base, 0.72), shade(base, 0.3)),
      s: ink([214, 204, 176], [90, 80, 60]),
    },
  };
}

export const FINISHING_SPRITES: Record<string, SpriteDef> = {
  // Etiqueta de papel con su agujero y un cordel.
  name_tag: {
    rows: [
      '................',
      '................',
      '...........ss...',
      '..........s..s..',
      '.........s...s..',
      '......1111ss....',
      '.....12222.1....',
      '....1222222221..',
      '...12222222223..',
      '..122222222233..',
      '..12222222233...',
      '...122222233....',
      '....1222233.....',
      '.....12233......',
      '......133.......',
      '................',
    ],
    inks: {
      '1': ink([232, 226, 206], [96, 88, 70]),
      '2': ink([212, 202, 176], [96, 88, 70]),
      '3': ink([176, 164, 136], [80, 72, 56]),
      s: ink([200, 190, 160], [70, 64, 50]),
    },
  },
  // Correa enrollada con su lazo de cuero.
  lead: {
    rows: [
      '................',
      '................',
      '.........1111...',
      '........12..21..',
      '........1....1..',
      '........12..21..',
      '.........1221...',
      '........121.....',
      '.......121......',
      '......121.......',
      '.....121........',
      '....1221........',
      '...12..21.......',
      '...1....1.......',
      '...12..21.......',
      '....1111........',
    ],
    inks: {
      '1': ink([150, 104, 60], [58, 38, 20]),
      '2': ink([112, 76, 42], [58, 38, 20]),
    },
  },
  bundle: bundleSprite([156, 104, 62]),
  // Soporte para armadura: cruz de madera con hombros, sobre su peana de piedra.
  armor_stand: {
    rows: [
      '................',
      '.......11.......',
      '.......12.......',
      '...1111122222...',
      '...2222222223...',
      '.......12.......',
      '.......12.......',
      '.....111222.....',
      '.......12.......',
      '.......12.......',
      '.......12.......',
      '.......12.......',
      '.......12.......',
      '...ssssssssss...',
      '...tttttttttt...',
      '................',
    ],
    inks: {
      '1': ink([188, 150, 96], [70, 50, 26]),
      '2': ink([150, 114, 68], [70, 50, 26]),
      '3': ink([120, 90, 52], [60, 42, 22]),
      s: ink([168, 168, 172], [60, 60, 64]),
      t: ink([120, 120, 126], [50, 50, 54]),
    },
  },
};
for (const [c, rgb] of Object.entries(DYE)) FINISHING_SPRITES[`${c}_bundle`] = bundleSprite(shade(rgb, 0.92));
