// Fase 6 (monstruos): sprites de los objetos nuevos (bola de slime, membrana de phantom y las pociones
// arrojadizas de las brujas). Mismo formato que SPRITES en itemSprites.ts, que los añade a los suyos.

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
const ramp = (c1: RGB, c2: RGB, c3: RGB, c4: RGB, o: RGB): Record<string, Ink> => ({
  '1': ink(c1, o), '2': ink(c2, o), '3': ink(c3, o), '4': ink(c4, o),
});

const POTION_ROWS = [
  '................',
  '................',
  '......cccc......',
  '.......gg.......',
  '.......gg.......',
  '......g11g......',
  '.....g1122g.....',
  '....g1w1122g....',
  '...g1w111222g...',
  '...g11112223g...',
  '...g11122233g...',
  '...g12222334g...',
  '....g223334g....',
  '.....gggggg.....',
  '................',
  '................',
];

/** Poción arrojadiza con el líquido de un color (rampa de claro a oscuro). */
function potion(c1: RGB, c2: RGB, c3: RGB, c4: RGB): SpriteDef {
  return {
    rows: POTION_ROWS,
    inks: {
      ...ramp(c1, c2, c3, c4, [40, 44, 56]),
      g: ink([206, 216, 228], [70, 76, 92]),
      w: ink([250, 252, 255], [70, 76, 92]),
      c: ink([150, 108, 64], [70, 48, 26]),
    },
  };
}

export const MONSTER_SPRITES: Readonly<Record<string, SpriteDef>> = {
  slime_ball: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '......1112......',
      '.....1w12223....',
      '....1ww122233...',
      '....112222233...',
      '....122222333...',
      '....122223334...',
      '.....2223334....',
      '......23344.....',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      ...ramp([184, 238, 156], [128, 208, 98], [90, 170, 70], [60, 130, 50], [30, 70, 26]),
      w: ink([238, 255, 228], [30, 70, 26]),
    },
  },
  phantom_membrane: {
    rows: [
      '................',
      '................',
      '................',
      '...11...........',
      '...1221.........',
      '...122221.......',
      '....1222221.....',
      '....12222221....',
      '.....12223322...',
      '.....122233332..',
      '......1223333...',
      '......12233.....',
      '.......133......',
      '........3.......',
      '................',
      '................',
    ],
    inks: ramp([200, 210, 230], [162, 174, 202], [126, 138, 170], [96, 106, 140], [50, 56, 80]),
  },
  splash_potion_harming: potion([236, 108, 118], [196, 48, 62], [150, 28, 44], [104, 16, 30]),
  splash_potion_slowness: potion([176, 192, 214], [130, 148, 176], [96, 112, 142], [66, 80, 108]),
  splash_potion_poison: potion([170, 214, 120], [120, 172, 78], [84, 132, 52], [56, 96, 34]),
};
