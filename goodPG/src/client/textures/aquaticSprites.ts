// Sprites de los cubos con criatura (fase 6): el cubo de agua con el pez, el ajolote o el renacuajo
// asomando por encima del agua. itemSprites.ts los añade a su tabla (mismo formato: filas de texto
// con tintas; '.' es transparente y el contorno se genera solo).

type RGB = readonly [number, number, number];

interface Ink {
  c: RGB;
  o?: RGB;
}

interface SpriteDef {
  rows: readonly string[];
  inks: Readonly<Record<string, Ink>>;
  holes?: boolean;
}

const ink = (c: RGB, o?: RGB): Ink => ({ c, o });

/** Cubo de agua (el mismo dibujo que water_bucket). */
const BUCKET_ROWS = [
  '................',
  '................',
  '.....hhhhhh.....',
  '....h......h....',
  '...h........h...',
  '..122222222223..',
  '..2wWWwwwwwwv3..',
  '..2wwwwwwwvvv3..',
  '..133333333334..',
  '...2333333334...',
  '...2333333344...',
  '....23333344....',
  '....23333344....',
  '.....444444.....',
  '................',
  '................',
];

const BUCKET_INKS: Record<string, Ink> = {
  '1': ink([250, 250, 252], [52, 52, 58]),
  '2': ink([214, 214, 218], [52, 52, 58]),
  '3': ink([176, 176, 182], [52, 52, 58]),
  '4': ink([134, 134, 142], [52, 52, 58]),
  h: ink([112, 112, 120], [40, 40, 46]),
  w: ink([52, 108, 214], [52, 52, 58]),
  W: ink([128, 184, 250], [52, 52, 58]),
  v: ink([36, 78, 172], [52, 52, 58]),
};

/**
 * Cubo con una criatura: `overlay` son filas (desde la fila `top`) que se dibujan encima del cubo con
 * las tintas propias (letras a, b, c, g, k, s, t).
 */
function bucketWith(top: number, overlay: string[], inks: Record<string, Ink>): SpriteDef {
  const rows = BUCKET_ROWS.map((row, y) => {
    const o = overlay[y - top];
    if (!o) return row;
    let out = '';
    for (let x = 0; x < 16; x++) out += o[x] && o[x] !== '.' ? o[x] : row[x];
    return out;
  });
  return { rows, inks: { ...BUCKET_INKS, ...inks }, holes: true };
}

const EYE = ink([18, 16, 14], [18, 16, 14]);

export const AQUATIC_SPRITES: Record<string, SpriteDef> = {
  cod_bucket: bucketWith(3, [
    '.......aa.......',
    '..t..aaaaaaa....',
    '..ttaaaaaaaaka..',
    '..t..bbbbbbbb...',
  ], {
    a: ink([176, 152, 112], [86, 70, 44]), b: ink([226, 216, 190], [96, 80, 52]), t: ink([146, 124, 90], [76, 60, 36]), k: EYE,
  }),
  salmon_bucket: bucketWith(3, [
    '.......gg.......',
    '..t..gaaaaaa....',
    '..ttaaaaaaaaka..',
    '..t..bbbbbbbb...',
  ], {
    a: ink([200, 88, 76], [96, 30, 26]), b: ink([236, 190, 170], [110, 50, 40]), g: ink([84, 100, 94], [40, 48, 44]),
    t: ink([140, 62, 56], [70, 26, 22]), k: EYE,
  }),
  tropical_fish_bucket: bucketWith(2, [
    '........s.......',
    '.......ss.......',
    '..tt.aacaaca....',
    '..ttaaacaacaka..',
    '..tt.aacaaca....',
    '........s.......',
  ], {
    a: ink([242, 130, 34], [120, 56, 10]), c: ink([246, 244, 236], [110, 100, 90]), t: ink([30, 26, 28], [20, 16, 18]),
    s: ink([30, 26, 28], [20, 16, 18]), k: EYE,
  }),
  pufferfish_bucket: bucketWith(1, [
    '.....s..s.......',
    '....s.aaa.s.....',
    '...s.aaaaa......',
    '....aaaaaka.s...',
    '...saaaaaaa.....',
    '....bbbbbbb.s...',
    '...s.bbbbb......',
  ], {
    a: ink([226, 194, 58], [110, 90, 16]), b: ink([242, 232, 180], [120, 104, 44]), s: ink([150, 130, 44], [80, 66, 16]), k: EYE,
  }),
  axolotl_bucket: bucketWith(2, [
    '..........g.g...',
    '.........g.g.g..',
    '...ttaaaaaaaag..',
    '..tt.aaaaaaaka..',
    '.....l.l..l.l...',
  ], {
    a: ink([238, 166, 188], [120, 60, 80]), g: ink([206, 64, 116], [100, 24, 52]), t: ink([248, 204, 216], [120, 70, 90]),
    l: ink([226, 150, 172], [110, 56, 76]), k: EYE,
  }),
  tadpole_bucket: bucketWith(4, [
    '......ttaa......',
    '.....t.aaka.....',
    '........aa......',
  ], {
    a: ink([66, 54, 46], [30, 24, 20]), t: ink([96, 82, 70], [40, 34, 28]), k: ink([10, 8, 8], [10, 8, 8]),
  }),
};
