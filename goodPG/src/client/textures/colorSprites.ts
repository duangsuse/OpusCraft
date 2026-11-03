// Fase 6.5 (colores): sprites de los 16 tintes (un montoncito de polvo del color) y de las camas de
// los colores nuevos (el mismo dibujo que las demás camas). Mismo formato que SPRITES en
// itemSprites.ts, que los añade a los suyos.

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
const toward = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Color de cada tinte. */
export const DYE: Record<string, RGB> = {
  white: [236, 238, 234], orange: [240, 118, 20], magenta: [196, 70, 186], light_blue: [70, 172, 226],
  yellow: [250, 208, 44], lime: [122, 196, 36], pink: [240, 140, 172], gray: [74, 78, 84], light_gray: [154, 154, 148],
  cyan: [30, 146, 160], purple: [128, 52, 184], blue: [52, 64, 170], brown: [120, 78, 44], green: [86, 110, 34],
  red: [176, 44, 40], black: [34, 34, 40],
};

// Montoncito de polvo con un brillo arriba a la izquierda.
const DYE_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '.......11.......',
  '......1w12......',
  '.....1w1122.....',
  '....111122223...',
  '...11122222233..',
  '..1112222223333.',
  '..1222222333334.',
  '...22233333444..',
  '....33334444....',
  '................',
  '................',
  '................',
];

function dyeSprite(c: RGB): SpriteDef {
  const dark = c[0] + c[1] + c[2] < 200;
  const light = toward(c, [255, 255, 255], dark ? 0.28 : 0.3);
  const outline = dark ? toward(c, [0, 0, 0], 0.5) : shade(c, 0.35);
  return {
    rows: DYE_ROWS,
    inks: {
      '1': ink(light, outline), '2': ink(c, outline), '3': ink(shade(c, 0.82), outline), '4': ink(shade(c, 0.66), outline),
      w: ink(toward(c, [255, 255, 255], 0.65), outline),
    },
  };
}

// Camas: el mismo dibujo que las de itemSprites.ts.
const BED_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '.pppp...........',
  '.ppppRRRRRRRRRR.',
  '.ppppRrrrrrrrrR.',
  '.wwwwrrrrrrrrrr.',
  '.ssssssssssssss.',
  '.ssssssssssssss.',
  '.l............l.',
  '.l............l.',
  '................',
  '................',
  '................',
];
const BED_WOOL: Record<string, RGB> = {
  magenta: [190, 70, 180], light_blue: [58, 176, 218], pink: [238, 142, 172], gray: [72, 76, 80],
  light_gray: [150, 150, 144], cyan: [22, 138, 146], brown: [120, 76, 44], green: [84, 110, 28], red: [170, 44, 40],
};

function bedSprite(w: RGB): SpriteDef {
  return {
    rows: BED_ROWS,
    inks: {
      p: ink([240, 240, 236]), R: ink(w), r: ink(shade(w, 0.8)), w: ink([222, 222, 218]), s: ink([162, 130, 78]),
      l: ink([118, 92, 54]),
    },
  };
}

export const COLOR_SPRITES: Record<string, SpriteDef> = {};
for (const [c, rgb] of Object.entries(DYE)) COLOR_SPRITES[`${c}_dye`] = dyeSprite(rgb);
// (La cama roja tiene su propio dibujo en itemSprites.ts.)
for (const [c, rgb] of Object.entries(BED_WOOL)) if (c !== 'red') COLOR_SPRITES[`${c}_bed`] = bedSprite(rgb);
