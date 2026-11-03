// Sprites de los objetos de cobre de la fase 6.5 (mismo formato que itemSprites.ts: cada carácter es
// una tinta y '.' es transparente; el contorno lo añade itemSprites): cobre en bruto, pepita de cobre
// y la puerta de cobre en sus cuatro fases de oxidación. Las rampas de las herramientas y armaduras de
// cobre también salen de aquí.

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

/** Cabeza de herramienta y armadura de cobre ('1' brillo … '4' sombra). */
export const COPPER_TOOL_INKS = ramp([255, 196, 156], [232, 140, 96], [196, 104, 66], [146, 70, 42], [72, 32, 16]);
/** Destello de la armadura de cobre. */
export const COPPER_ARMOR_ACCENT: Ink = ink([255, 226, 200], [72, 32, 16]);

/** Colores de la puerta en cada fase: [claro, base, oscuro, ventana]. */
const DOOR_STAGES: readonly [RGB, RGB, RGB, RGB][] = [
  [[238, 162, 122], [206, 120, 84], [150, 78, 52], [96, 50, 34]],
  [[200, 150, 124], [168, 121, 99], [120, 84, 68], [80, 56, 46]],
  [[132, 182, 134], [104, 154, 112], [70, 108, 80], [48, 74, 56]],
  [[110, 200, 168], [82, 166, 136], [54, 116, 96], [36, 80, 66]],
];

const DOOR_ROWS = [
  '................',
  '....33333333....',
  '....3ww33ww3....',
  '....3ww33ww3....',
  '....33333333....',
  '....3ww33ww3....',
  '....3ww33ww3....',
  '....33333333....',
  '....31211213....',
  '....3122221k....',
  '....31222213....',
  '....31211213....',
  '....31222213....',
  '....31211213....',
  '....33333333....',
  '................',
];

function doorSprite(stage: number): SpriteDef {
  const [l, b, d, w] = DOOR_STAGES[stage];
  return { rows: DOOR_ROWS, inks: { '1': ink(l), '2': ink(b), '3': ink(d), w: ink(w), k: ink([60, 40, 30]) } };
}

export const COPPER_SPRITES: Record<string, SpriteDef> = {
  raw_copper: {
    rows: [
      '................',
      '................',
      '................',
      '......122.......',
      '....11222g3.....',
      '...1222233233...',
      '...122g2223334..',
      '..12223322g234..',
      '..1223222222334.',
      '..12222g2223334.',
      '...2333222g334..',
      '....3443333344..',
      '.....44..444....',
      '................',
      '................',
      '................',
    ],
    inks: { ...ramp([244, 176, 136], [214, 128, 90], [174, 94, 62], [128, 64, 40], [66, 30, 16]), g: ink([112, 170, 132], [40, 70, 52]) },
  },
  copper_nugget: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '......12........',
      '.....1223.......',
      '....122233......',
      '....1222334.....',
      '.....23334......',
      '......344.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: ramp([255, 206, 170], [232, 140, 96], [196, 104, 66], [146, 70, 42], [72, 32, 16]),
  },
  copper_door: doorSprite(0),
  exposed_copper_door: doorSprite(1),
  weathered_copper_door: doorSprite(2),
  oxidized_copper_door: doorSprite(3),
};
