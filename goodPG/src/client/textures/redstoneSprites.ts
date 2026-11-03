// Fase 7 (redstone): sprites de los objetos nuevos (mismo formato que itemSprites.ts: cada carácter es
// una tinta y '.' es transparente; el contorno lo añade itemSprites): la puerta de hierro, que se ve
// plana en la mano como las demás puertas, y el cuarzo del Nether.

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

export const REDSTONE_SPRITES: Record<string, SpriteDef> = {
  iron_door: {
    rows: [
      '................',
      '....33333333....',
      '....3ww32ww3....',
      '....3ww32ww3....',
      '....3ww32ww3....',
      '....33333333....',
      '....31112113....',
      '....31112113....',
      '....3222222k....',
      '....31112113....',
      '....31112113....',
      '....31112113....',
      '....32222223....',
      '....31112113....',
      '....33333333....',
      '................',
    ],
    inks: { '1': ink([232, 232, 232]), '2': ink([198, 198, 200]), '3': ink([150, 150, 156]), w: ink([74, 78, 88]), k: ink([80, 80, 86]) },
  },
  quartz: {
    rows: [
      '................',
      '................',
      '................',
      '.........11.....',
      '.......11221....',
      '.....1122223....',
      '....122212233...',
      '...12221222333..',
      '...12222223333..',
      '....1222233334..',
      '.....123333344..',
      '......1333444...',
      '.......3344.....',
      '........44......',
      '................',
      '................',
    ],
    inks: {
      '1': ink([255, 255, 252], [96, 84, 80]), '2': ink([238, 230, 224], [96, 84, 80]), '3': ink([214, 200, 192], [96, 84, 80]),
      '4': ink([176, 158, 150], [96, 84, 80]),
    },
  },
};
