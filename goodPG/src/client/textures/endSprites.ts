// Fase 8.6 (el End): sprites de los objetos del End, dibujados aquí. Mismo formato que SPRITES en itemSprites.ts
// ('.' transparente; el contorno lo pone él).

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
const EDGE: RGB = [36, 18, 40];

export const END_SPRITES: Record<string, SpriteDef> = {
  // Fruta de coro: una baya lila de pétalos plegados con el rabito del tallo.
  chorus_fruit: {
    rows: [
      '................',
      '................',
      '.......ss.......',
      '.......s........',
      '.....1112.......',
      '....112223......',
      '...11222333.....',
      '...12223334.....',
      '...12233344.....',
      '...22333444.....',
      '....233444......',
      '.....3444.......',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      '1': ink([226, 196, 230], EDGE), '2': ink([186, 146, 196], EDGE), '3': ink([150, 108, 164], EDGE), '4': ink([108, 72, 122], EDGE),
      s: ink([86, 60, 90], EDGE),
    },
  },
  // Reventada: abierta, más clara y con el hueco del centro.
  popped_chorus_fruit: {
    rows: [
      '................',
      '................',
      '................',
      '.....1..1.......',
      '....1211221.....',
      '...12222.22.....',
      '...12.3..33.....',
      '....2.....3.....',
      '...22.....34....',
      '...2233.3344....',
      '....23334.4.....',
      '.....3.44.......',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      '1': ink([240, 220, 244], EDGE), '2': ink([206, 170, 214], EDGE), '3': ink([170, 128, 182], EDGE), '4': ink([128, 88, 140], EDGE),
    },
  },
  // Ojo de ender: la perla verde con el iris amarillo verdoso y la pupila rasgada de gato, con su brillo.
  ender_eye: {
    rows: [
      '................',
      '................',
      '................',
      '......2222......',
      '....22333322....',
      '...2133yy3333...',
      '...213yyyy334...',
      '..23yyppyyy334..',
      '..23yypphyy334..',
      '..23yyppyyy334..',
      '..233yyppy3344..',
      '...333yyy3334...',
      '...433333344....',
      '....44444444....',
      '................',
      '................',
    ],
    inks: {
      '1': ink([200, 255, 230], [6, 30, 26]), '2': ink([70, 170, 140], [6, 30, 26]), '3': ink([38, 124, 104], [6, 30, 26]),
      '4': ink([18, 74, 64], [6, 30, 26]), y: ink([190, 222, 110], [6, 30, 26]), p: ink([12, 36, 24], [6, 30, 26]),
      h: ink([236, 255, 214], [6, 30, 26]),
    },
  },
  // Cristal del End: el cubo rosado del centro dentro de sus dos marcos de cristal, girado de canto.
  end_crystal: {
    rows: [
      '................',
      '.......gg.......',
      '.....gg..gg.....',
      '...gg..pp..gg...',
      '..g...pPPp...g..',
      '..g..pPwwPp..g..',
      '.g..pPwwwPPp..g.',
      '.g.pPPwwPPPPp.g.',
      '.g..pPPPPPPp..g.',
      '..g..pPPPPp..g..',
      '..g...pPPp...g..',
      '...gg..pp..gg...',
      '.....gg..gg.....',
      '.......gg.......',
      '................',
      '................',
    ],
    inks: {
      g: ink([214, 236, 244], [60, 70, 90]), p: ink([168, 64, 150], [60, 16, 60]), P: ink([226, 110, 196], [60, 16, 60]),
      w: ink([255, 214, 244], [60, 16, 60]),
    },
  },
  // Caparazón de shulker: media concha de púrpura acanalada, con el labio claro y el hueco oscuro de dentro.
  shulker_shell: {
    rows: [
      '................',
      '................',
      '................',
      '.....444444.....',
      '...4433333344...',
      '..432322232234..',
      '..432322232234..',
      '.43232222232334.',
      '.43232222232234.',
      '.4323222223223 .',
      '.55555555555555.',
      '.5dddddddddddd5.',
      '..5dddddddddd5..',
      '...5555555555...',
      '................',
      '................',
    ].map((r) => r.replace(' ', '4')),
    inks: {
      '2': ink([176, 128, 172], EDGE), '3': ink([140, 96, 142], EDGE), '4': ink([104, 68, 110], EDGE), '5': ink([206, 166, 200], EDGE),
      d: ink([40, 22, 50], EDGE),
    },
  },
  // Élitros: las dos alas plegadas, juntas por el hombro, con el borde de hueso, las plumas y la punta en flecha.
  elytra: {
    rows: [
      '................',
      '..bbbbb..bbbbb..',
      '.b11122..22111b.',
      '.b12223..32221b.',
      '.b12233..33221b.',
      '.b1s233..332s1b.',
      '.b12s33..33s21b.',
      '.b123s4..4s321b.',
      '.b1233s..s3321b.',
      '..b1334..4331b..',
      '..b12s4..4s21b..',
      '..b1234..4321b..',
      '...b134..431b...',
      '...b134..431b...',
      '....b4....4b....',
      '................',
    ],
    inks: {
      b: ink([214, 206, 190], [40, 34, 52]), '1': ink([182, 180, 196], [40, 34, 52]), '2': ink([148, 144, 168], [40, 34, 52]),
      '3': ink([116, 110, 140], [40, 34, 52]), '4': ink([88, 80, 112], [40, 34, 52]), s: ink([70, 62, 90], [40, 34, 52]),
    },
  },
};
