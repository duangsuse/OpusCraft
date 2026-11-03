// Fase 8.5 (lo que da el Nether): sprites de la chatarra y el lingote de netherita, la plantilla de mejora y la
// estrella del Nether, dibujados aquí. Mismo formato que SPRITES en itemSprites.ts ('.' transparente; el contorno
// lo pone él).

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
const EDGE: RGB = [20, 16, 20];

/** Tonos de la netherita: brillo violáceo, base, sombra y hondo. */
const NETHERITE = { '1': ink([140, 124, 140], EDGE), '2': ink([92, 82, 92], EDGE), '3': ink([66, 58, 66], EDGE), '4': ink([42, 36, 44], EDGE) };

export const NETHER_GOODS_SPRITES: Record<string, SpriteDef> = {
  // Chatarra: un trozo irregular de metal oscuro con restos pardos de los escombros.
  netherite_scrap: {
    rows: [
      '................',
      '................',
      '................',
      '.......12.......',
      '.....11223......',
      '....122223r3....',
      '...1223r22334...',
      '...12222r2334...',
      '..12r2223333....',
      '..122223r334....',
      '...23333334.....',
      '....334r334.....',
      '.....4444.......',
      '................',
      '................',
      '................',
    ],
    inks: { ...NETHERITE, r: ink([112, 76, 62], EDGE) },
  },
  // Lingote: la forma de los demás lingotes, en netherita con el filo violáceo.
  netherite_ingot: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....1111111....',
      '....122222223...',
      '...12222222233..',
      '..211111111113..',
      '..233333333334..',
      '..233333333334..',
      '..444444444444..',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: NETHERITE,
  },
  // Plantilla de herrería: una tablilla de piedra negra con el lingote grabado y el marco de cobre gastado.
  netherite_upgrade_smithing_template: {
    rows: [
      '................',
      '..ffffffffffff..',
      '.fbbbbbbbbbbbbf.',
      '.fbccccccccccbf.',
      '.fbcddddddddcbf.',
      '.fbcd112222dcbf.',
      '.fbcd122223dcbf.',
      '.fbcd233334dcbf.',
      '.fbcddddddddcbf.',
      '.fbccccccccccbf.',
      '.fbcccceeccccbf.',
      '.fbccceeeecccbf.',
      '.fbbbbbbbbbbbbf.',
      '..ffffffffffff..',
      '................',
      '................',
    ],
    inks: {
      ...NETHERITE,
      f: ink([150, 96, 64], EDGE), b: ink([46, 40, 46], EDGE), c: ink([62, 54, 62], EDGE), d: ink([34, 30, 36], EDGE),
      e: ink([200, 150, 80], EDGE),
    },
  },
  // Estrella del Nether: cuatro puntas blancas con el núcleo que brilla.
  nether_star: {
    rows: [
      '................',
      '.......a........',
      '.......a........',
      '......aba.......',
      '......aba.......',
      '.a...abcba...a..',
      '..aaabcccbaaa...',
      '...abccdccba....',
      '..aaabcccbaaa...',
      '.a...abcba...a..',
      '......aba.......',
      '......aba.......',
      '.......a........',
      '.......a........',
      '................',
      '................',
    ],
    inks: {
      a: ink([214, 222, 236], [70, 76, 96]), b: ink([236, 240, 250], [70, 76, 96]), c: ink([250, 252, 255], [70, 76, 96]),
      d: ink([255, 255, 220], [70, 76, 96]),
    },
  },
};
