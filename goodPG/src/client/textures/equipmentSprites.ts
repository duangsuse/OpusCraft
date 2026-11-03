// Fase 6.5 (equipo): sprites del mechero, la cota de malla, la ballesta (y cargada), el tridente, la
// escama y el caparazón de tortuga, las armaduras para caballo y para lobo, la caña con zanahoria, el
// cuerno de cabra, la pata de conejo, la patata venenosa, la manzana de oro encantada, el corazón del
// mar, la concha de nautilo y los fuegos artificiales. Mismo formato que SPRITES en itemSprites.ts
// ('.' transparente; el contorno lo pone él). Los que van en diagonal se trazan con líneas.

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
const ramp = (c1: RGB, c2: RGB, c3: RGB, c4: RGB, o: RGB): Record<string, Ink> => ({
  '1': ink(c1, o), '2': ink(c2, o), '3': ink(c3, o), '4': ink(c4, o),
});

// ------------------------------------------------------------------ lienzo con líneas

type Grid = string[][];
const grid = (): Grid => Array.from({ length: 16 }, () => Array<string>(16).fill('.'));
const rows = (g: Grid): string[] => g.map((r) => r.join(''));
function plot(g: Grid, x: number, y: number, ch: string): void {
  if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = ch;
}
/** Línea de Bresenham entre dos píxeles. */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(g, x0, y0, ch);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

// ------------------------------------------------------------------ ballesta y tridente

const WOOD = { a: ink([164, 120, 68], [58, 38, 18]), b: ink([118, 84, 44], [52, 34, 16]), l: ink([96, 66, 34], [44, 28, 12]) };
const IRON = ink([206, 206, 214], [64, 64, 72]);

function crossbow(charged: boolean): SpriteDef {
  const g = grid();
  // Cuerda (debajo de todo): de las puntas del arco al gatillo, más atrás si está cargada.
  const back: [number, number] = charged ? [5, 10] : [8, 7];
  line(g, 6, 2, back[0], back[1], 's');
  line(g, back[0], back[1], 13, 9, 's');
  // Culata en diagonal (de abajo a la izquierda hacia arriba a la derecha), con dos tonos.
  line(g, 2, 13, 10, 5, 'a');
  line(g, 3, 13, 10, 6, 'b');
  plot(g, 2, 14, 'b');
  plot(g, 11, 4, 'i');
  // Arco de dos píxeles de grueso cruzado cerca de la punta, con las puntas de hierro.
  line(g, 7, 1, 14, 8, 'L');
  line(g, 6, 2, 13, 9, 'l');
  for (const [x, y] of [[6, 2], [7, 1], [13, 9], [14, 8]] as const) plot(g, x, y, 'i');
  // Cargada: el virote encima de la culata, con su punta.
  if (charged) {
    line(g, 6, 8, 11, 3, 'r');
    plot(g, 12, 2, 'h');
    plot(g, 12, 3, 'h');
    plot(g, 11, 2, 'h');
    plot(g, 5, 9, 'f');
  }
  return {
    rows: rows(g),
    inks: {
      ...WOOD, L: ink([140, 100, 56], [52, 34, 16]), i: IRON, s: ink([226, 226, 226], [96, 96, 96]),
      r: ink([196, 160, 110], [70, 50, 26]), h: ink([200, 200, 208], [60, 60, 66]), f: ink([240, 240, 240], [90, 90, 90]),
    },
  };
}

function trident(): SpriteDef {
  const g = grid();
  // Asta de prismarina y, en la punta, la cruceta con tres púas.
  line(g, 2, 13, 10, 5, 'a');
  line(g, 3, 13, 10, 6, 'b');
  line(g, 8, 3, 12, 7, 'c');
  line(g, 8, 3, 10, 1, 'a');
  line(g, 10, 5, 14, 1, 'a');
  line(g, 12, 7, 14, 5, 'a');
  for (const [x, y] of [[10, 1], [14, 1], [14, 5]] as const) plot(g, x, y, 'k');
  plot(g, 2, 14, 'c');
  return {
    rows: rows(g),
    inks: {
      a: ink([98, 188, 168], [18, 60, 56]), b: ink([58, 138, 124], [16, 52, 48]), c: ink([44, 104, 96], [12, 40, 38]),
      k: ink([196, 246, 232], [30, 80, 74]),
    },
  };
}

// ------------------------------------------------------------------ cota de malla

/** Formas de las piezas (las mismas siluetas que las otras armaduras). */
const PIECES: Record<string, readonly string[]> = {
  helmet: [
    '................', '................', '................', '................', '.....11k122.....', '....11222223....',
    '...1122222233...', '...1222222233...', '...1233333334...', '...124....234...', '...124....234...', '...334....344...',
    '................', '................', '................', '................',
  ],
  chestplate: [
    '................', '................', '..1122....2233..', '.112222..222233.', '.11k22222222233.', '.12222k32222233.',
    '.12.22233222.34.', '.23.12222223.44.', '....1k233223....', '....12222223....', '....12233223....', '....12222233....',
    '....12222333....', '....33333334....', '................', '................',
  ],
  leggings: [
    '................', '................', '...1112222223...', '...1233k33334...', '...1222222233...', '...1222..2223...',
    '...1223..2233...', '...1k23..1k33...', '...1223..2233...', '...1223..2233...', '...1223..2233...', '...1223..2234...',
    '...1223..2234...', '...3344..3344...', '................', '................',
  ],
  boots: [
    '................', '................', '................', '................', '...1111..1122...', '...1223..2233...',
    '...1223..2234...', '...1k23..1k34...', '...1223..2234...', '..11223..22334..', '.1k2223..22k334.', '.333334..333344.',
    '................', '................', '................', '................',
  ],
};

/** La pieza con anillas: un píxel sí y otro no, las anillas oscuras. */
function chainmail(piece: string): SpriteDef {
  const src = PIECES[piece];
  const out = src.map((row, y) => [...row].map((ch, x) => (ch === '2' && (x + y) % 2 === 0 ? 'h' : ch)).join(''));
  return {
    rows: out,
    inks: {
      ...ramp([226, 228, 234], [168, 170, 178], [128, 130, 138], [90, 92, 100], [44, 46, 52]),
      h: ink([70, 72, 80], [36, 38, 44]), k: ink([255, 255, 255], [60, 60, 66]),
    },
  };
}

// ------------------------------------------------------------------ armaduras de caballo

/** Cabeza y cuello de caballo acorazados, de perfil. */
const HORSE_ARMOR_ROWS = [
  '................',
  '........11......',
  '.......1221.....',
  '......122221....',
  '....11222222k...',
  '...1222222223...',
  '..12222..22233..',
  '..122....22233..',
  '..33.....222233.',
  '.........122233.',
  '.........1222333',
  '........12222333',
  '........1222233.',
  '.........33333..',
  '................',
  '................',
];
const HORSE_INKS: Record<string, Record<string, Ink>> = {
  leather: ramp([204, 142, 90], [168, 106, 62], [124, 72, 38], [90, 50, 24], [56, 30, 14]),
  iron: ramp([240, 240, 246], [200, 200, 208], [150, 150, 160], [110, 110, 120], [60, 60, 66]),
  golden: ramp([255, 246, 170], [246, 204, 52], [206, 150, 22], [150, 98, 10], [80, 50, 6]),
  diamond: ramp([206, 255, 248], [96, 226, 212], [48, 176, 170], [26, 124, 122], [12, 66, 66]),
  netherite: ramp([146, 130, 146], [96, 86, 96], [68, 60, 68], [44, 38, 46], [18, 14, 18]), // Fase 8.5
};
function horseArmor(mat: string): SpriteDef {
  return { rows: HORSE_ARMOR_ROWS, inks: { ...HORSE_INKS[mat], k: ink([255, 255, 255], [60, 60, 60]) } };
}

// ------------------------------------------------------------------ caña con zanahoria

function carrotOnAStick(): SpriteDef {
  const g = grid();
  line(g, 1, 14, 11, 4, 'a');
  line(g, 2, 14, 11, 5, 'b');
  line(g, 12, 3, 13, 3, 's');
  line(g, 13, 4, 13, 8, 's');
  // Zanahoria colgando de la punta.
  for (const [x, y, ch] of [
    [12, 8, 'g'], [14, 8, 'g'], [13, 9, 'o'], [12, 9, 'o'], [14, 9, 'O'], [12, 10, 'o'], [13, 10, 'o'], [14, 10, 'O'],
    [12, 11, 'o'], [13, 11, 'O'], [13, 12, 'o'], [13, 13, 'O'],
  ] as const) plot(g, x, y, ch);
  return {
    rows: rows(g),
    inks: {
      ...WOOD, s: { c: [226, 226, 230], bare: true }, o: ink([255, 150, 40], [110, 50, 10]), O: ink([214, 110, 24], [100, 44, 8]),
      g: ink([96, 180, 60], [26, 60, 14]),
    },
  };
}

// ------------------------------------------------------------------ fuegos artificiales

function fireworkRocket(): SpriteDef {
  const g = grid();
  // Tubo de papel grueso (rojo con franjas blancas) en diagonal, cono gris en la punta y mecha abajo.
  for (let k = 0; k < 7; k++) {
    const x = 3 + k, y = 11 - k;
    const band = k % 3 === 1;
    plot(g, x, y, band ? 'w' : 'r');
    plot(g, x + 1, y, band ? 'w' : 'r');
    plot(g, x, y + 1, band ? 'W' : 'R');
    plot(g, x + 1, y + 1, band ? 'W' : 'R');
  }
  plot(g, 10, 4, 'c');
  plot(g, 11, 4, 'C');
  plot(g, 10, 3, 'c');
  plot(g, 11, 3, 'c');
  plot(g, 12, 2, 'c');
  line(g, 1, 14, 2, 13, 'f');
  plot(g, 1, 13, 'f');
  return {
    rows: rows(g),
    inks: {
      r: ink([214, 52, 44], [80, 14, 10]), R: ink([160, 32, 28], [70, 10, 8]), w: ink([240, 236, 226], [90, 86, 80]),
      W: ink([200, 196, 186], [80, 76, 70]), c: ink([150, 150, 158], [56, 56, 62]), C: ink([110, 110, 118], [46, 46, 52]),
      f: ink([90, 70, 50], [40, 30, 20]),
    },
  };
}

// ------------------------------------------------------------------ tabla

export const EQUIPMENT_SPRITES: Record<string, SpriteDef> = {
  // Mechero: el eslabón de acero en forma de C y el pedernal.
  flint_and_steel: {
    rows: [
      '................',
      '................',
      '.....1111.......',
      '....122223......',
      '...12....23.....',
      '...12.....3.....',
      '...12...........',
      '...12...........',
      '...122..........',
      '....1223..ffF...',
      '.....33..fggfF..',
      '........ffgffF..',
      '........fffFF...',
      '.........ffF....',
      '................',
      '................',
    ],
    inks: {
      '1': ink([232, 232, 238], [70, 70, 78]), '2': ink([176, 176, 186], [60, 60, 68]), '3': ink([120, 120, 130], [48, 48, 54]),
      f: ink([72, 72, 78], [26, 26, 30]), F: ink([46, 46, 52], [20, 20, 24]), g: ink([128, 128, 136], [30, 30, 34]),
    },
  },
  chainmail_helmet: chainmail('helmet'),
  chainmail_chestplate: chainmail('chestplate'),
  chainmail_leggings: chainmail('leggings'),
  chainmail_boots: chainmail('boots'),
  crossbow: crossbow(false),
  crossbow_charged: crossbow(true),
  trident: trident(),
  // Escama de tortuga: placa verde con sus surcos.
  turtle_scute: {
    rows: [
      '................',
      '................',
      '................',
      '......1111......',
      '....11222211....',
      '...1223333221...',
      '...1233223321...',
      '...1232222321...',
      '...1233223321...',
      '...1223333224...',
      '....12222224....',
      '.....122224.....',
      '......1444......',
      '................',
      '................',
      '................',
    ],
    inks: ramp([150, 214, 110], [92, 168, 66], [58, 124, 46], [38, 90, 34], [20, 50, 18]),
  },
  // Caparazón de tortuga: cúpula verde con placas.
  turtle_helmet: {
    rows: [
      '................',
      '................',
      '................',
      '.....111111.....',
      '...1122332211...',
      '..122233332221..',
      '..123322223321..',
      '.12332222223321.',
      '.12222333322224.',
      '.13332222223334.',
      '.14444444444444.',
      '..4..........4..',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: ramp([150, 214, 110], [92, 168, 66], [58, 124, 46], [34, 80, 30], [18, 46, 16]),
  },
  leather_horse_armor: horseArmor('leather'),
  iron_horse_armor: horseArmor('iron'),
  golden_horse_armor: horseArmor('golden'),
  diamond_horse_armor: horseArmor('diamond'),
  netherite_horse_armor: horseArmor('netherite'), // Fase 8.5
  // Armadura para lobo: placas de escama de armadillo con correas.
  wolf_armor: {
    rows: [
      '................',
      '................',
      '...11......11...',
      '..1221....1221..',
      '..12221111222k..',
      '..122222222223..',
      '...1222222223...',
      '...1233223323...',
      '...1222222223...',
      '...1233223323...',
      '....12222223....',
      '....12222223....',
      '.....123321.....',
      '......1331......',
      '................',
      '................',
    ],
    inks: {
      ...ramp([226, 170, 150], [196, 128, 112], [150, 90, 78], [110, 60, 52], [60, 30, 24]),
      k: ink([255, 230, 220], [80, 40, 30]),
    },
  },
  carrot_on_a_stick: carrotOnAStick(),
  // Cuerno de cabra: curvado, claro en la base y oscuro en la punta.
  goat_horn: {
    rows: [
      '................',
      '................',
      '..........444...',
      '.........43344..',
      '........433..4..',
      '.......433......',
      '......2233......',
      '.....22233......',
      '....122233......',
      '...11222333.....',
      '..111222233.....',
      '..11122223......',
      '...1112222......',
      '....11122.......',
      '................',
      '................',
    ],
    inks: ramp([236, 226, 196], [206, 192, 156], [150, 134, 106], [96, 84, 66], [50, 44, 34]),
  },
  // Pata de conejo: pelo pardo y la almohadilla clara.
  rabbit_foot: {
    rows: [
      '................',
      '................',
      '.........11.....',
      '........1221....',
      '.......12223....',
      '.......12233....',
      '......122233....',
      '......122233....',
      '.....1222333....',
      '.....1223333....',
      '....12223333....',
      '...122pp3333....',
      '...12pppp333....',
      '....3pppp33.....',
      '.....333333.....',
      '................',
    ],
    inks: {
      ...ramp([214, 176, 130], [176, 134, 90], [134, 98, 62], [90, 64, 40], [60, 40, 22]),
      p: ink([236, 196, 180], [100, 70, 60]),
    },
  },
  // Patata venenosa: verdosa y con manchas.
  poisonous_potato: {
    rows: [
      '................',
      '................',
      '................',
      '.......1111.....',
      '.....1122221....',
      '....122s22223...',
      '...12222222s3...',
      '...122s222223...',
      '...12222s22233..',
      '....1222222233..',
      '....12s2222333..',
      '.....122223333..',
      '......3333333...',
      '................',
      '................',
      '................',
    ],
    inks: {
      ...ramp([214, 214, 120], [176, 184, 82], [132, 146, 56], [90, 104, 36], [56, 64, 20]),
      s: ink([96, 140, 40], [40, 60, 16]),
    },
  },
  // Manzana de oro encantada: la manzana dorada con destellos violetas.
  enchanted_golden_apple: {
    rows: [
      '................',
      '.........ll.....',
      '.......s.lLL....',
      '.......s..LL....',
      '....2222s222....',
      '...2p122222p3..',
      '..2112222222233.',
      '..212pw22222233.',
      '..222222p222333.',
      '..2222222223333.',
      '..32p2222233p34.',
      '...32222333344..',
      '...333p33333444.',
      '....333.4434....',
      '................',
      '................',
    ].map((r) => r.padEnd(16, '.').slice(0, 16)),
    inks: {
      ...ramp([255, 246, 176], [246, 204, 52], [212, 158, 24], [158, 104, 12], [72, 44, 4]),
      w: ink([255, 255, 236], [72, 44, 4]), p: ink([226, 150, 255], [90, 40, 120]),
      s: ink([112, 78, 42], [48, 30, 14]), l: ink([118, 184, 64], [28, 60, 14]), L: ink([80, 140, 40], [24, 50, 10]),
    },
  },
  // Corazón del mar: esfera azul con un remolino claro.
  heart_of_the_sea: {
    rows: [
      '................',
      '................',
      '................',
      '......1111......',
      '....11222211....',
      '...1222332221...',
      '...1223w23224...',
      '..122232w32224..',
      '..12232ww23224..',
      '..122232232224..',
      '...1223333224...',
      '...1222222244...',
      '....44222444....',
      '......4444......',
      '................',
      '................',
    ],
    inks: {
      ...ramp([126, 226, 255], [46, 150, 214], [26, 96, 170], [14, 52, 110], [6, 24, 60]),
      w: ink([220, 250, 255], [20, 60, 110]),
    },
  },
  // Concha de nautilo: espiral de color crema con rayas pardas.
  nautilus_shell: {
    rows: [
      '................',
      '................',
      '.......11111....',
      '.....112222211..',
      '....12s2222s221.',
      '...122s2233s223.',
      '...12s223333s23.',
      '..122s23ss3s223.',
      '..12s223s33s223.',
      '..12s2223333223.',
      '..122s222222223.',
      '...122s22222s23.',
      '....1222s22223..',
      '.....33333333...',
      '................',
      '................',
    ],
    inks: {
      ...ramp([250, 240, 220], [230, 214, 186], [196, 172, 140], [150, 126, 96], [96, 76, 56]),
      s: ink([170, 100, 60], [80, 44, 22]),
    },
  },
  firework_rocket: fireworkRocket(),
  // Estrella de fuegos artificiales: bola de pólvora gris.
  firework_star: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.......11.......',
      '.....112221.....',
      '....12222223....',
      '....12w22223....',
      '...122222233....',
      '....12222333....',
      '....1223333.....',
      '.....33333......',
      '................',
      '................',
      '................',
      '................',
    ],
    inks: {
      ...ramp([170, 170, 170], [120, 120, 122], [84, 84, 88], [60, 60, 64], [30, 30, 32]),
      w: ink([230, 230, 230], [60, 60, 60]),
    },
  },
};
