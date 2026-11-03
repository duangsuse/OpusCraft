// Fase 7 (mecanismos): sprites de los objetos nuevos (mismo formato que itemSprites.ts: cada carácter es
// una tinta y '.' es transparente; el contorno lo añade itemSprites): la tolva (plana en la mano, como en
// Minecraft) y las vagonetas con tolva y con dinamita.

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

/** Hierro oscuro de la tolva. */
const HOPPER_INKS: Record<string, Ink> = {
  '1': ink([132, 132, 140], [34, 34, 38]), '2': ink([96, 96, 104], [30, 30, 34]), '3': ink([66, 66, 72], [24, 24, 28]),
  '4': ink([42, 42, 46], [16, 16, 18]),
};

/** Vagoneta de lado (la cuba de hierro y las ruedas), como las del transporte. */
const CART_INKS: Record<string, Ink> = {
  a: ink([226, 228, 234], [70, 72, 80]), b: ink([168, 170, 178], [62, 64, 72]), c: ink([118, 120, 128], [50, 52, 58]),
  d: ink([80, 82, 90], [36, 38, 42]), n: ink([206, 208, 214], [70, 72, 80]), w: ink([56, 56, 62], [22, 22, 26]),
  W: ink([96, 96, 104], [30, 30, 34]),
};

const CART_BODY = [
  'aaaaaaaaaaaaaaaa',
  'adccccccccccccdb',
  '.bbnbbbbbbbbnbc.',
  '.bbbbbbbbbbbbbc.',
  '.bbbbbbbbbbbbbc.',
  '..bbbbbbbbbbbc..',
  '..cccccccccccc..',
  '..wWw......wWw..',
  '...w........w...',
];

const withCart = (top: string[]): string[] => [...top, ...CART_BODY, ...Array<string>(16 - top.length - CART_BODY.length).fill('................')];

export const MECHANISM_SPRITES: Record<string, SpriteDef> = {
  hopper: {
    rows: [
      '................',
      '................',
      '..111111111111..',
      '..144444444442..',
      '..122222222223..',
      '..122222222223..',
      '...1222222223...',
      '....12222223....',
      '.....122223.....',
      '.....122223.....',
      '......1223......',
      '......1223......',
      '.......23.......',
      '.......23.......',
      '................',
      '................',
    ],
    inks: HOPPER_INKS,
  },
  hopper_minecart: {
    rows: withCart(['................', '....11111111....', '....14444442....', '.....122223.....', '......1223......']),
    inks: { ...CART_INKS, ...HOPPER_INKS },
  },
  tnt_minecart: {
    rows: withCart(['................', '....rRrRrRrR....', '....tttttttt....', '....rkrkkrkr....', '....rRrRrRrR....']),
    inks: {
      ...CART_INKS, r: ink([214, 58, 42], [90, 16, 12]), R: ink([160, 34, 26], [80, 14, 10]), t: ink([232, 226, 206], [90, 86, 76]),
      k: ink([36, 30, 28], [16, 14, 12]),
    },
  },
};
