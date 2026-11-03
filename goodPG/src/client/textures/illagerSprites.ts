// Fase 6 (asaltos): sprites de la botella ominosa y el tótem de inmortalidad. Mismo formato que
// SPRITES en itemSprites.ts, que los añade a los suyos.

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

export const ILLAGER_SPRITES: Readonly<Record<string, SpriteDef>> = {
  // Botella oscura con cuerda al cuello y una etiqueta con el rostro de un illager.
  ominous_bottle: {
    rows: [
      '................',
      '......cccc......',
      '......cCCc......',
      '.......gg.......',
      '......rrrr......',
      '.....g1111g.....',
      '....g1w11122....',
      '...g1w1111223g..',
      '...g12kkkk223g..',
      '...g12kbbk223g..',
      '...g12kkkk233g..',
      '...g11222233g...',
      '....g1223334g...',
      '.....g33344g....',
      '......gggg......',
      '................',
    ].map((r) => r.slice(0, 16).padEnd(16, '.')),
    inks: {
      '1': ink([70, 118, 108], [22, 30, 34]),
      '2': ink([50, 92, 86], [22, 30, 34]),
      '3': ink([34, 66, 64], [22, 30, 34]),
      '4': ink([22, 44, 44], [22, 30, 34]),
      g: ink([120, 132, 140], [30, 36, 44]),
      w: ink([200, 230, 222], [30, 36, 44]),
      c: ink([120, 84, 50], [60, 40, 22]),
      C: ink([96, 66, 38], [60, 40, 22]),
      r: ink([196, 176, 120], [90, 72, 40]),
      k: ink([214, 204, 170], [70, 62, 44]),
      b: ink([30, 30, 34], [70, 62, 44]),
    },
  },
  // Tótem dorado con los brazos abiertos y ojos de esmeralda.
  totem_of_undying: {
    rows: [
      '................',
      '.....yyyyyy.....',
      '....yYYYYYYd....',
      '....yYeYYeYd....',
      '....yYYYYYYd....',
      '.....yYddYd.....',
      '.yyyyYYYYYYdddd.',
      '.yYYYYYYYYYYYYd.',
      '..dddYYYYYYddd..',
      '.....yYYYYd.....',
      '.....yYeeYd.....',
      '....yYYYYYYd....',
      '....yYdddYYd....',
      '.....yYYYYd.....',
      '......dddd......',
      '................',
    ],
    inks: {
      y: ink([255, 232, 120], [96, 64, 12]),
      Y: ink([232, 184, 52], [96, 64, 12]),
      d: ink([168, 112, 24], [96, 64, 12]),
      e: ink([70, 214, 110], [20, 80, 40]),
    },
  },
};
