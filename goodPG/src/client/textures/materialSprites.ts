// Fase 6.5 (materiales): sprites del hierro y el oro en bruto y del cubo de nieve polvo. Mismo formato
// que SPRITES en itemSprites.ts ('.' transparente; el contorno lo pone él).

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

function ramp(c1: RGB, c2: RGB, c3: RGB, c4: RGB, o: RGB): Record<string, Ink> {
  return { '1': ink(c1, o), '2': ink(c2, o), '3': ink(c3, o), '4': ink(c4, o) };
}

/** Pepita de mineral en bruto (la misma forma que el cobre en bruto, con otro color). */
const RAW_ROWS = [
  '................',
  '................',
  '................',
  '.......12.......',
  '.....1122g3.....',
  '....122223233...',
  '...1222g2223334.',
  '..12223322g234..',
  '..1223222222334.',
  '..12g222g223334.',
  '...2333222g334..',
  '....3443333344..',
  '.....44..444....',
  '................',
  '................',
  '................',
];

export const MATERIAL_SPRITES: Record<string, SpriteDef> = {
  raw_iron: {
    rows: RAW_ROWS,
    inks: { ...ramp([236, 204, 180], [212, 170, 140], [176, 134, 104], [132, 96, 72], [64, 44, 32]), g: ink([244, 226, 208], [64, 44, 32]) },
  },
  raw_gold: {
    rows: RAW_ROWS,
    inks: { ...ramp([255, 240, 140], [246, 204, 64], [210, 154, 30], [160, 108, 18], [84, 52, 8]), g: ink([255, 252, 214], [84, 52, 8]) },
  },
  powder_snow_bucket: {
    rows: [
      '................',
      '................',
      '.....hhhhhh.....',
      '....h......h....',
      '...h........h...',
      '..122222222223..',
      '..2wWWwwwwwsv3..',
      '..2wwwswwwwvv3..',
      '..133333333334..',
      '...2333333334...',
      '...2333333344...',
      '....23333344....',
      '....23333344....',
      '.....444444.....',
      '................',
      '................',
    ],
    inks: {
      ...ramp([250, 250, 252], [214, 214, 218], [176, 176, 182], [134, 134, 142], [52, 52, 58]),
      h: ink([112, 112, 120], [40, 40, 46]),
      w: ink([236, 242, 250], [52, 52, 58]),
      W: ink([255, 255, 255], [52, 52, 58]),
      s: ink([250, 252, 255], [52, 52, 58]),
      v: ink([198, 212, 232], [52, 52, 58]),
    },
    holes: true,
  },
};
