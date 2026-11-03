// Fase 7.5 (abismo): sprites de los objetos nuevos (mismo formato que itemSprites.ts: cada carácter es una
// tinta y '.' es transparente; el contorno lo añade itemSprites): el fragmento de eco (un cristal oscuro
// con brillos turquesa), la brújula de recuperación (esfera de pizarra con la aguja turquesa) y el
// fragmento del disco 5 (un trozo de vinilo con la etiqueta verde azulada).

type RGB = readonly [number, number, number];

interface Ink {
  c: RGB;
  o?: RGB;
}

interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
}

const ink = (c: RGB, o?: RGB): Ink => ({ c, o });
const EDGE: RGB = [6, 14, 20];

export const DEEP_DARK_SPRITES: Record<string, SpriteDef> = {
  echo_shard: {
    rows: [
      '................',
      '..........a.....',
      '.........abb....',
      '........abcb....',
      '.......abccb....',
      '......abcdcb....',
      '.....abccdb.....',
      '.....abcdcb.....',
      '....abccdcb.....',
      '....abdccb......',
      '...abcdcb.......',
      '...abccb........',
      '..abcdb.........',
      '..abcb..........',
      '...bb...........',
      '................',
    ],
    inks: {
      a: ink([22, 60, 70], EDGE), b: ink([10, 34, 44], EDGE), c: ink([16, 82, 92], EDGE), d: ink([110, 236, 240], EDGE),
    },
  },
  recovery_compass: {
    rows: [
      '................',
      '................',
      '.....111111.....',
      '....12222223....',
      '...1244t44423...',
      '..124444t44423..',
      '..124444t44423..',
      '..12444kk44423..',
      '..12444kk44423..',
      '..1244444s4423..',
      '..12444444s423..',
      '...1244444423...',
      '....12222223....',
      '.....333333.....',
      '................',
      '................',
    ],
    inks: {
      '1': ink([96, 110, 118], EDGE), '2': ink([62, 74, 82], EDGE), '3': ink([36, 44, 50], EDGE), '4': ink([20, 40, 48], EDGE),
      t: ink([110, 240, 240], EDGE), s: ink([40, 70, 80], EDGE), k: ink([150, 150, 160], EDGE),
    },
  },
  disc_fragment_5: {
    rows: [
      '................',
      '................',
      '................',
      '.....vvvv.......',
      '....vgvvvv......',
      '...vvvvgvvv.....',
      '...vgvvvvvvv....',
      '..vvvvvlllvv....',
      '..vvgvvlaalv....',
      '..vvvvvlal......',
      '...vvgvvv.......',
      '...vvvvv........',
      '....vvv.........',
      '................',
      '................',
      '................',
    ],
    inks: { v: ink([30, 30, 34], [8, 8, 10]), g: ink([48, 48, 54], [8, 8, 10]), l: ink([30, 62, 70], [8, 8, 10]), a: ink([104, 226, 232], [8, 8, 10]) },
  },
};
