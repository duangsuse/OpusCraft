// Fase 7 (pociones): sprites de los frascos (poción, arrojadiza y persistente), la flecha con efecto,
// los ingredientes nuevos (ojo de araña fermentado, polvo de piedra luminosa, verruga del Nether, vara
// y polvo de blaze, crema de magma, lágrima de ghast y aliento de dragón) y el alambique plano. Mismo
// formato que SPRITES en itemSprites.ts ('.' transparente; el contorno lo pone él).
//
// Cada tipo de poción tiene además su propio dibujo con el líquido (o la punta de la flecha) de su
// color: son capas extra del atlas de objetos, después de las de ITEM_SPRITES (ver potionSpriteLayer).
import { POTION, SPLASH_POTION, LINGERING_POTION, TIPPED_ARROW, ITEM_SPRITES, itemSpriteIndex, type ItemStack } from '../../shared/items';
import { POTION_TYPE_COUNT, WATER_COLOR, potionColor, potionKind, potionType, type PotionKind } from '../../shared/potions';

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
const mixc = (a: RGB, b: RGB, t: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t),
];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

// ------------------------------------------------------------------ frascos

/** Frasco que se bebe: tapón de corcho, cuello estrecho y cuerpo redondo. */
const DRINK_ROWS = [
  '................',
  '......kkkk......',
  '......kkkk......',
  '.......gg.......',
  '.......gg.......',
  '......gffg......',
  '.....gf11fg.....',
  '....gw11112g....',
  '...gw1111122g...',
  '...gw1111222g...',
  '...g11111223g...',
  '...g11112233g...',
  '...g11222334g...',
  '....g223344g....',
  '.....gggggg.....',
  '................',
];

/** Arrojadiza: cuello corto con reborde y cuerpo más grande y abombado. */
const SPLASH_ROWS = [
  '................',
  '.......kk.......',
  '......gkkg......',
  '.......gg.......',
  '......gffg......',
  '.....gf11fg.....',
  '....gw11112g....',
  '...gw1111112g...',
  '...gw1111122g...',
  '..gw111111222g..',
  '..g1111112223g..',
  '..g1111122233g..',
  '...g11122334g...',
  '....g223334g....',
  '.....gggggg.....',
  '................',
];

/** Persistente: frasco ancho y bajo, con la parte de arriba llena de vapor (5). */
const LINGERING_ROWS = [
  '................',
  '................',
  '......kkkk......',
  '......gffg......',
  '.....gffffg.....',
  '....gw5555fg....',
  '...gw555555fg...',
  '..gw11111111fg..',
  '..g1111111122g..',
  '..g1111111223g..',
  '..g1111112233g..',
  '..g1111122334g..',
  '...g11223344g...',
  '....gggggggg....',
  '................',
  '................',
];

const GLASS_INKS: Record<string, Ink> = {
  g: ink([196, 214, 228], [58, 72, 88]),
  f: ink([228, 240, 248], [58, 72, 88]),
  w: ink([255, 255, 255], [58, 72, 88]),
  k: ink([164, 116, 66], [74, 50, 26]),
};

/** Tintas del líquido: de claro (1) a oscuro (4) y el vapor (5). */
function liquidInks(c: RGB): Record<string, Ink> {
  const o: RGB = mixc(c, BLACK, 0.7);
  return {
    '1': ink(mixc(c, WHITE, 0.2), o), '2': ink(c, o), '3': ink(mixc(c, BLACK, 0.2), o), '4': ink(mixc(c, BLACK, 0.4), o),
    '5': ink(mixc(c, WHITE, 0.55), o),
  };
}

const BOTTLE_ROWS: Readonly<Record<Exclude<PotionKind, 'arrow'>, string[]>> = {
  drink: DRINK_ROWS, splash: SPLASH_ROWS, lingering: LINGERING_ROWS,
};

// ------------------------------------------------------------------ flecha con efecto

const TIPPED_ROWS = [
  '................',
  '..............1.',
  '...........211..',
  '............23..',
  '...........a.4..',
  '..........b.....',
  '.........a......',
  '........b.......',
  '.......a........',
  '......b.........',
  '...f.a..........',
  '..ffb...........',
  '.ffaFF..........',
  '..bFF...........',
  '...F............',
  '................',
];

const ARROW_INKS: Record<string, Ink> = {
  a: ink([150, 108, 60], [58, 38, 18]),
  b: ink([118, 84, 44], [52, 34, 16]),
  f: ink([250, 250, 250], [96, 96, 104]),
  F: ink([206, 206, 214], [96, 96, 104]),
};

/** Dibujo de un frasco (o de la flecha) con el líquido del color `c`. */
export function potionSpriteDef(kind: PotionKind, c: RGB): SpriteDef {
  if (kind === 'arrow') {
    // La punta, del color de la poción (un poco más clara para que se vea sobre el contorno).
    const head = mixc(c, WHITE, 0.1);
    const o = mixc(c, BLACK, 0.7);
    return {
      rows: TIPPED_ROWS,
      inks: {
        ...ARROW_INKS, '1': ink(mixc(head, WHITE, 0.25), o), '2': ink(head, o), '3': ink(mixc(head, BLACK, 0.2), o),
        '4': ink(mixc(head, BLACK, 0.4), o),
      },
    };
  }
  return { rows: BOTTLE_ROWS[kind], inks: { ...GLASS_INKS, ...liquidInks(c) } };
}

// ------------------------------------------------------------------ ingredientes

/** Lienzo de 16×16 para trazar líneas (la vara de blaze). */
function lineSprite(segments: [number, number, number, number, string][], spots: [number, number, string][]): string[] {
  const g = Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
  const plot = (x: number, y: number, ch: string) => {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = ch;
  };
  for (const [x0, y0, x1, y1, ch] of segments) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) plot(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), ch);
  }
  for (const [x, y, ch] of spots) plot(x, y, ch);
  return g.map((r) => r.join(''));
}

/** Montoncito de polvo con destellos sueltos (piedra luminosa y blaze). */
const DUST_ROWS = [
  '................',
  '................',
  '.........w......',
  '...w............',
  '..........y.....',
  '......y.........',
  '...y.......w....',
  '.......yy.......',
  '.....yYYYy...y..',
  '....yYYOYYy.....',
  '...yYYOOOYYy....',
  '..yYYOOwOOYYy...',
  '..yYYYYYYYYYy...',
  '...yyyyyyyyy....',
  '................',
  '................',
];

function dust(y: RGB, Y: RGB, O: RGB, spark: RGB): SpriteDef {
  const o = mixc(y, BLACK, 0.6);
  return { rows: DUST_ROWS, inks: { y: ink(y, o), Y: ink(Y, o), O: ink(O, o), w: { c: spark, bare: true } } };
}

export const POTION_SPRITES: Readonly<Record<string, SpriteDef>> = {
  // Las pilas sin tipo (o de agua) se ven con el agua azul.
  potion: potionSpriteDef('drink', WATER_COLOR),
  splash_potion: potionSpriteDef('splash', WATER_COLOR),
  lingering_potion: potionSpriteDef('lingering', WATER_COLOR),
  tipped_arrow: potionSpriteDef('arrow', WATER_COLOR),

  // Ojo de araña con un champiñón marrón encima, amoratado por la fermentación.
  fermented_spider_eye: {
    rows: [
      '................',
      '......mmmm......',
      '.....mMMMMm.....',
      '....mMMwMMMm....',
      '.......ss.......',
      '......1111......',
      '....11222211....',
      '...1223333221...',
      '...1233pp3321...',
      '..123pppp33321..',
      '..123pppp33321..',
      '...1233pp3321...',
      '...1223333221...',
      '....11222211....',
      '......1111......',
      '................',
    ],
    inks: {
      '1': ink([112, 38, 70], [46, 14, 30]), '2': ink([148, 62, 98], [46, 14, 30]), '3': ink([184, 96, 128], [46, 14, 30]),
      p: ink([58, 14, 42], [30, 6, 20]),
      m: ink([118, 84, 58], [50, 34, 22]), M: ink([152, 112, 78], [50, 34, 22]), w: ink([200, 164, 124], [50, 34, 22]),
      s: ink([212, 198, 172], [90, 80, 64]),
    },
  },

  glowstone_dust: dust([222, 164, 46], [255, 212, 88], [255, 244, 176], [255, 252, 214]),

  // Racimo de verrugas rojas con su tallito.
  nether_wart: {
    rows: [
      '................',
      '................',
      '......11........',
      '.....1221..11...',
      '....122321122...',
      '....1233222332..',
      '...12232223332..',
      '...12222123332..',
      '..1123311222....',
      '..1223321232....',
      '..123332.1s.....',
      '...2332..s......',
      '.........s......',
      '........ss......',
      '................',
      '................',
    ],
    inks: {
      '1': ink([200, 64, 60], [60, 10, 14]), '2': ink([152, 30, 36], [60, 10, 14]), '3': ink([102, 16, 24], [50, 8, 12]),
      s: ink([124, 62, 40], [52, 26, 16]),
    },
  },

  // Vara en diagonal, amarilla y anaranjada con brillos, y las puntas más oscuras.
  blaze_rod: {
    rows: lineSprite(
      [[2, 13, 12, 3, 'a'], [3, 13, 13, 3, 'b']],
      [[4, 11, 'c'], [7, 8, 'c'], [10, 5, 'c'], [2, 13, 'd'], [3, 13, 'd'], [12, 3, 'd'], [13, 3, 'd']],
    ),
    inks: {
      a: ink([255, 214, 80], [110, 56, 8]), b: ink([232, 146, 30], [110, 56, 8]), c: ink([255, 248, 196], [110, 56, 8]),
      d: ink([178, 92, 18], [90, 44, 6]),
    },
  },

  blaze_powder: dust([214, 104, 20], [250, 164, 40], [255, 224, 108], [255, 240, 170]),

  // Bola de magma: corteza oscura con grietas encendidas y el centro amarillo.
  magma_cream: {
    rows: [
      '................',
      '................',
      '................',
      '.....dddddd.....',
      '....dOOoOOOd....',
      '...dOoyyyoOOd...',
      '...dOyYYYyoOd...',
      '..dOoyYWYyooOd..',
      '..dOoyYYYyoOOd..',
      '..ddOoyyyoOOdd..',
      '...dOOoooOOdd...',
      '...ddOOOOOddd...',
      '....dddddddd....',
      '................',
      '................',
      '................',
    ],
    inks: {
      d: ink([94, 40, 24], [44, 16, 8]), O: ink([198, 68, 20], [60, 20, 6]), o: ink([236, 120, 30], [60, 20, 6]),
      y: ink([255, 180, 50], [60, 20, 6]), Y: ink([255, 226, 112], [60, 20, 6]), W: ink([255, 250, 214], [60, 20, 6]),
    },
  },

  // Lágrima clara, casi blanca, con un brillo.
  ghast_tear: {
    rows: [
      '................',
      '................',
      '.......1........',
      '......121.......',
      '......121.......',
      '.....12221......',
      '.....1W221......',
      '....1W22231.....',
      '....1222231.....',
      '....1222331.....',
      '....1223331.....',
      '.....12331......',
      '......111.......',
      '................',
      '................',
      '................',
    ],
    inks: {
      '1': ink([168, 198, 204], [70, 92, 100]), '2': ink([222, 242, 242], [70, 92, 100]), '3': ink([190, 220, 226], [70, 92, 100]),
      W: ink([255, 255, 255], [70, 92, 100]),
    },
  },

  // Frasco lleno de un vapor rosado y morado.
  dragon_breath: {
    rows: DRINK_ROWS.map((r, y) => (y >= 6 && y <= 8 ? r.replace(/1/g, '5') : r)),
    inks: { ...GLASS_INKS, ...liquidInks([204, 104, 186]) },
  },

  // Alambique plano (inventario y mano): vara de blaze, brazos, dos frascos colgando y los pies.
  brewing_stand: {
    rows: [
      '................',
      '.......yy.......',
      '.......Yy.......',
      '..aaaaaYyaaaaa..',
      '...a...Yy...a...',
      '..gfg..Yy..gfg..',
      '.gfffg.Yy.gfffg.',
      '.gfffg.Yy.gfffg.',
      '..ggg..Yy..ggg..',
      '.......Yy.......',
      '.......Yy.......',
      '.......Yy.......',
      '..sssssYysssss..',
      '.sSSSSSSSSSSSSs.',
      '..ssss....ssss..',
      '................',
    ],
    inks: {
      y: ink([255, 214, 80], [110, 56, 8]), Y: ink([226, 146, 36], [110, 56, 8]),
      a: ink([152, 152, 156], [58, 58, 62]), g: GLASS_INKS.g, f: GLASS_INKS.f,
      s: ink([104, 100, 98], [40, 38, 38]), S: ink([140, 136, 132], [40, 38, 38]),
    },
  },
};

// ------------------------------------------------------------------ capas por tipo

const KINDS: readonly PotionKind[] = ['drink', 'splash', 'lingering', 'arrow'];
const KIND_ITEM: Readonly<Record<PotionKind, number>> = {
  drink: POTION, splash: SPLASH_POTION, lingering: LINGERING_POTION, arrow: TIPPED_ARROW,
};

/** Capas extra del atlas: un dibujo por forma y tipo de poción (el agua usa el dibujo base). */
export const POTION_VARIANTS: readonly { item: number; type: number; name: string; def: SpriteDef }[] = KINDS.flatMap((kind) =>
  Array.from({ length: POTION_TYPE_COUNT - 1 }, (_, i) => {
    const type = i + 1;
    return { item: KIND_ITEM[kind], type, name: `${kind}_${type}`, def: potionSpriteDef(kind, potionColor(type)) };
  }));

const variantIndex = new Map<string, number>();
POTION_VARIANTS.forEach((v, i) => variantIndex.set(`${v.item}:${v.type}`, i));

/** Capa del atlas de objetos con que se dibuja una pila (las pociones, con el color de su tipo). */
export function potionSpriteLayer(id: number, dmg: number | undefined): number {
  const kind = potionKind(id);
  if (kind && KIND_ITEM[kind] === id) {
    const v = variantIndex.get(`${id}:${potionType({ id, count: 1, dmg })}`);
    if (v !== undefined) return ITEM_SPRITES.length + v;
  }
  return itemSpriteIndex(id);
}

/** Clave del icono de una poción con tipo en el mapa de iconos (negativa: no choca con los ids); null si no lo es. */
export function potionIconKey(s: ItemStack): number | null {
  const kind = potionKind(s.id);
  if (!kind || KIND_ITEM[kind] !== s.id) return null;
  const t = potionType(s);
  return t > 0 ? -(s.id * 64 + t) - 1 : null;
}
