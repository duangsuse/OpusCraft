// Fase 6.5 (libros y estandartes): sprites del libro y pluma, del libro escrito y de los diseños de
// estandarte (una hoja con el dibujo del diseño). Mismo formato que SPRITES en itemSprites.ts ('.'
// transparente; el contorno lo pone él).

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

/** Tapas de cuero, cantos dorados y hojas (como el libro de siempre). */
const BOOK_INKS: Record<string, Ink> = {
  '1': ink([184, 100, 60], [42, 18, 8]), '2': ink([152, 76, 44], [42, 18, 8]), '3': ink([120, 58, 34], [42, 18, 8]),
  '4': ink([88, 40, 22], [42, 18, 8]), g: ink([232, 192, 82], [42, 18, 8]), p: ink([244, 238, 220], [42, 18, 8]),
  P: ink([208, 200, 178], [42, 18, 8]),
};

/** Pone `ch` en los píxeles (x, y) de unas filas. */
function paint(rows: readonly string[], marks: [number, number, string][]): string[] {
  const out = rows.map((r) => r.split(''));
  for (const [x, y, ch] of marks) out[y][x] = ch;
  return out.map((r) => r.join(''));
}

const BOOK_ROWS = [
  '................',
  '................',
  '...ggg1111111...',
  '...g2g22222221..',
  '...g2g22222222..',
  '...ggg22222222..',
  '...323222222223.',
  '...323222222223.',
  '...ggg22222223..',
  '...g3g22222233..',
  '...g3g23333333..',
  '...ggg4444444...',
  '...44pPpPpPpP...',
  '....444444444...',
  '................',
  '................',
];

/** Pluma blanca en diagonal (de arriba a la derecha hacia el centro) con la punta de tinta. */
const QUILL: [number, number, string][] = [
  [14, 0, 'w'], [13, 0, 'w'], [13, 1, 'w'], [12, 1, 'w'], [14, 1, 'W'], [12, 2, 'w'], [11, 2, 'w'], [13, 2, 'W'],
  [11, 3, 'w'], [10, 3, 'w'], [12, 3, 'W'], [10, 4, 'w'], [9, 4, 'W'], [9, 5, 'q'], [8, 6, 'q'], [7, 7, 'k'],
];

/** Hoja de papel (x 3..12, y 1..14) con un dibujo en el centro. */
function patternSheet(glyph: readonly string[]): SpriteDef {
  const rows: string[][] = [];
  for (let y = 0; y < 16; y++) {
    const r: string[] = [];
    for (let x = 0; x < 16; x++) {
      const inside = x >= 3 && x <= 12 && y >= 1 && y <= 14;
      const fold = x >= 11 && y <= 2 && x - 10 > y; // esquina doblada
      r.push(!inside || fold ? '.' : x === 3 || y === 1 ? '1' : x === 12 || y === 14 ? '3' : '2');
    }
    rows.push(r);
  }
  rows[1][10] = '3';
  rows[2][11] = '3';
  const gw = glyph[0].length, gh = glyph.length;
  const x0 = Math.round(8 - gw / 2), y0 = Math.round(8 - gh / 2);
  glyph.forEach((line, gy) => line.split('').forEach((ch, gx) => {
    if (ch === 'x') rows[y0 + gy][x0 + gx] = 'k';
  }));
  return {
    rows: rows.map((r) => r.join('')),
    inks: {
      '1': ink([255, 254, 246], [112, 106, 94]), '2': ink([238, 234, 220], [112, 106, 94]), '3': ink([204, 198, 180], [112, 106, 94]),
      k: ink([86, 70, 58], [112, 106, 94]),
    },
  };
}

export const BOOK_SPRITES: Record<string, SpriteDef> = {
  writable_book: {
    rows: paint(BOOK_ROWS, QUILL),
    inks: {
      ...BOOK_INKS, w: ink([246, 246, 240], [96, 96, 104]), W: ink([204, 204, 212], [96, 96, 104]), q: ink([214, 196, 150], [70, 56, 30]),
      k: ink([30, 30, 36]),
    },
  },
  // Libro escrito: tapa con una etiqueta clara (el título) y una cinta roja de marcapáginas.
  written_book: {
    rows: paint(BOOK_ROWS, [
      [8, 4, 'p'], [9, 4, 'p'], [10, 4, 'p'], [11, 4, 'p'], [8, 5, 'P'], [9, 5, 'l'], [10, 5, 'l'], [11, 5, 'P'],
      [8, 6, 'p'], [9, 6, 'p'], [10, 6, 'p'], [11, 6, 'p'], [10, 13, 'r'], [10, 14, 'r'], [11, 14, 'r'],
    ]),
    inks: { ...BOOK_INKS, l: ink([120, 110, 96], [42, 18, 8]), r: ink([200, 40, 40], [90, 16, 16]) },
  },
  flower_banner_pattern: patternSheet([
    '.x...x.',
    'xxx.xxx',
    '.xx.xx.',
    '...x...',
    '.xx.xx.',
    'xxx.xxx',
    '.x...x.',
  ]),
  creeper_banner_pattern: patternSheet([
    'xx..xx',
    'xx..xx',
    '..xx..',
    '.xxxx.',
    '.xxxx.',
    '.x..x.',
  ]),
  skull_banner_pattern: patternSheet([
    '.xxxxx.',
    'xxxxxxx',
    'x..x..x',
    'xxxxxxx',
    '.xx.xx.',
    '.x.x.x.',
  ]),
  thing_banner_pattern: patternSheet([
    '...x...',
    '.xx.xx.',
    'x..x..x',
    'x..x..x',
    'x..x..x',
    '.xx.xx.',
    '...x...',
  ]),
  piglin_banner_pattern: patternSheet([ // Fase 8.4
    '.......',
    '.xxxxx.',
    'xx.x.xx',
    'xx.x.xx',
    '.xxxxx.',
    'x.....x',
    '.......',
  ]),
  globe_banner_pattern: patternSheet([
    '..xxx..',
    '.x.x.x.',
    'x..x..x',
    'xxxxxxx',
    'x..x..x',
    '.x.x.x.',
    '..xxx..',
  ]),
  bordure_indented_banner_pattern: patternSheet([
    'x.x.x.x',
    '.......',
    'x.....x',
    '.......',
    'x.....x',
    '.......',
    'x.x.x.x',
  ]),
  field_masoned_banner_pattern: patternSheet([
    'xxxxxxx',
    '..x...x',
    'xxxxxxx',
    'x...x..',
    'xxxxxxx',
    '..x...x',
    'xxxxxxx',
  ]),
};
