// Fase 7 (transporte): sprites de las barcas (y con cofre) de cada madera, las balsas de bambú y las
// vagonetas (normal, con cofre y con horno). Mismo formato que SPRITES en itemSprites.ts ('.'
// transparente; el contorno lo pone él). Las barcas se generan con la paleta de su madera.
import { BOAT_WOODS, type BoatWood } from '../../shared/vehicles';

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

/** Color medio de los tablones de cada madera (también lo usan las texturas de las barcas). */
export const BOAT_WOOD_COLORS: Readonly<Record<BoatWood, RGB>> = {
  oak: [166, 132, 80], spruce: [116, 84, 50], birch: [200, 180, 122], jungle: [164, 116, 82], acacia: [180, 98, 52],
  dark_oak: [76, 52, 28], mangrove: [120, 54, 48], cherry: [226, 184, 174], pale_oak: [226, 218, 208], bamboo: [198, 178, 82],
};

const k = (c: RGB, f: number): RGB => [Math.min(255, Math.round(c[0] * f)), Math.min(255, Math.round(c[1] * f)), Math.min(255, Math.round(c[2] * f))];
const ink = (c: RGB, o?: RGB): Ink => ({ c, o });

/** Tintas de madera de una barca: borde claro, costado, costado en sombra, interior y remo. */
function woodInks(c: RGB): Record<string, Ink> {
  const out = k(c, 0.36);
  return {
    r: ink(k(c, 1.18), out), R: ink(k(c, 1.02), out), s: ink(k(c, 0.9), out), S: ink(k(c, 0.72), out),
    i: ink(k(c, 0.46), out), I: ink(k(c, 0.36), out), p: ink(k(c, 1.1), out), P: ink(k(c, 0.8), out),
  };
}

/** Cofre pequeño que va detrás (filas 3–8, columnas 9–14) en las barcas y vagonetas con cofre. */
const CHEST_INKS: Record<string, Ink> = {
  c: ink([176, 122, 58], [60, 38, 16]), C: ink([132, 88, 38], [54, 34, 14]), l: ink([226, 222, 210], [70, 68, 62]),
  b: ink([92, 60, 26], [40, 26, 10]),
};

// Barca vista desde arriba y de lado: los dos remos asoman por la borda.
const BOAT_ROWS = [
  '................',
  '................',
  '................',
  '..P.........P...',
  '...P.......P....',
  '....p.....p.....',
  'rR...p...p...Rr.',
  'rRRRRRpRpRRRRRRr',
  'rIIIIiIIIiIIIIIr',
  '.rIIIIIIIIIIIIr.',
  '.rrrrrrrrrrrrrr.',
  '.ssssssssssssss.',
  '..SSSSSSSSSSSS..',
  '...SSSSSSSSSS...',
  '................',
  '................',
];

const CHEST_BOAT_ROWS = [
  '................',
  '................',
  '................',
  '..P......ccccc..',
  '...P.....ccccc..',
  '....p....bblbb..',
  'rR...p...CCCCCr.',
  'rRRRRRpRpCCCCCRr',
  'rIIIIiIIIiIIIIIr',
  '.rIIIIIIIIIIIIr.',
  '.rrrrrrrrrrrrrr.',
  '.ssssssssssssss.',
  '..SSSSSSSSSSSS..',
  '...SSSSSSSSSS...',
  '................',
  '................',
];

// Balsa de bambú: cañas atadas en plano, con el remo encima.
const RAFT_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '...........P....',
  '..........p.....',
  '.........p......',
  '.rrrSrrrprrSrrr.',
  '.RRRRRSpRRRRRSR.',
  '.sssSsspssSssss.',
  '.RRSRRpRRRRSRRR.',
  '.SSSSSSSSSSSSSS.',
  '..ii........ii..',
  '................',
  '................',
  '................',
];

const CHEST_RAFT_ROWS = [
  '................',
  '................',
  '................',
  '.........ccccc..',
  '...........P....',
  '.........bblbb..',
  '.........CCCCC..',
  '.rrrSrrrpCCCCCr.',
  '.RRRRRSpRRRRRSR.',
  '.sssSsspssSssss.',
  '.RRSRRpRRRRSRRR.',
  '.SSSSSSSSSSSSSS.',
  '..ii........ii..',
  '................',
  '................',
  '................',
];

// Vagoneta de lado: la cuba de hierro remachada y las cuatro ruedas.
const CART_INKS: Record<string, Ink> = {
  '1': ink([226, 228, 234], [70, 72, 80]), '2': ink([168, 170, 178], [62, 64, 72]), '3': ink([118, 120, 128], [50, 52, 58]),
  '4': ink([80, 82, 90], [36, 38, 42]), n: ink([206, 208, 214], [70, 72, 80]), w: ink([56, 56, 62], [22, 22, 26]),
  W: ink([96, 96, 104], [30, 30, 34]),
};

const CART_BODY = [
  '1111111111111111',
  '1433333333333342',
  '.12n22222222n23.',
  '.12222222222223.',
  '.12222222222223.',
  '..122222222223..',
  '..333333333333..',
  '..wWw......wWw..',
  '...w........w...',
];

const pad = (top: string[], body: string[]) => [...top, ...body, ...Array<string>(16 - top.length - body.length).fill('................')];

const MINECART_ROWS = pad(['................', '................', '................', '................', '................'], CART_BODY);
const CHEST_MINECART_ROWS = pad(
  ['................', '....cccccccc....', '....cccccccc....', '....bbbllbbb....', '....CCCCCCCC....'],
  CART_BODY,
);
const FURNACE_MINECART_ROWS = pad(
  ['................', '....fFFFFFFf....', '....FFFFFFFF....', '....FkkkkkkF....', '....FkooookF....'],
  CART_BODY,
);
const FURNACE_INKS: Record<string, Ink> = {
  f: ink([150, 150, 150], [50, 50, 50]), F: ink([112, 112, 114], [42, 42, 44]), k: ink([36, 34, 34], [16, 16, 16]),
  o: ink([62, 50, 44], [20, 16, 14]),
};

const boat = (wood: BoatWood, chest: boolean): SpriteDef => {
  const raft = wood === 'bamboo';
  const inks = { ...woodInks(BOAT_WOOD_COLORS[wood]), ...CHEST_INKS };
  if (raft) {
    // En la balsa el remo es de la misma caña, algo más oscuro.
    inks.p = ink(k(BOAT_WOOD_COLORS.bamboo, 0.86), k(BOAT_WOOD_COLORS.bamboo, 0.36));
  }
  return { rows: raft ? (chest ? CHEST_RAFT_ROWS : RAFT_ROWS) : chest ? CHEST_BOAT_ROWS : BOAT_ROWS, inks };
};

export const TRANSPORT_SPRITES: Record<string, SpriteDef> = {
  minecart: { rows: MINECART_ROWS, inks: CART_INKS },
  chest_minecart: { rows: CHEST_MINECART_ROWS, inks: { ...CART_INKS, ...CHEST_INKS } },
  furnace_minecart: { rows: FURNACE_MINECART_ROWS, inks: { ...CART_INKS, ...FURNACE_INKS } },
};
for (const wood of BOAT_WOODS) {
  const raft = wood === 'bamboo';
  TRANSPORT_SPRITES[raft ? 'bamboo_raft' : `${wood}_boat`] = boat(wood, false);
  TRANSPORT_SPRITES[raft ? 'bamboo_chest_raft' : `${wood}_chest_boat`] = boat(wood, true);
}
