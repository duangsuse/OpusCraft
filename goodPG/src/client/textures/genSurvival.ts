// Generadores del modo supervivencia: horno (frente apagado/encendido, lateral y
// tapa), cofre, brotes de árbol y las 10 fases de grietas al picar un bloque.

import {
  N,
  Noise,
  Rng,
  Tex,
  clamp,
  clamp01,
  field,
  idx,
  line,
  mix,
  pixelNoise,
  rankLevels,
  scale,
  shift,
  type Generator,
  type RGB,
} from './texCore';
import { cellLayout } from './genStone';
import { cutoutCanvas, sprite, type Ink } from './genPlants';

// ---------------------------------------------------------------------------
// Horno
// ---------------------------------------------------------------------------

// Piedra del horno (5 tonos, de oscuro a claro), algo más clara que la roca suelta.
const F_ROCK: RGB[] = [
  [100, 100, 104],
  [113, 113, 117],
  [126, 126, 130],
  [138, 138, 142],
  [151, 151, 155],
];
const F_MORTAR: RGB[] = [
  [52, 52, 56],
  [60, 60, 64],
  [68, 68, 72],
];
// Losa lisa de la tapa (también asoma como banda en el frente y los laterales).
const F_SLAB: RGB[] = [
  [118, 118, 122],
  [129, 129, 133],
  [139, 139, 143],
  [149, 149, 153],
  [166, 166, 170],
];

/** Banda superior de frente y laterales: canto de la losa (filas 0–1) y su sombra (fila 2). */
function furnaceBand(t: Tex, px: Float32Array): void {
  for (let x = 0; x < 16; x++) {
    let i = idx(x, 0);
    t.setI(i, shift(F_SLAB[4], (px[i] - 0.5) * 6));
    t.height[i] = 1;
    t.smooth[i] = 72;
    i = idx(x, 1);
    t.setI(i, F_SLAB[px[i] > 0.82 ? 3 : px[i] < 0.14 ? 1 : 2]);
    t.height[i] = 0.97;
    t.smooth[i] = 66;
    i = idx(x, 2);
    t.setI(i, F_MORTAR[px[i] < 0.5 ? 0 : 1]);
    t.height[i] = 0.3;
    t.smooth[i] = 30;
  }
}

/** Lateral: roca bajo la banda de la losa y zócalo algo más oscuro. */
export function furnaceSide(t: Tex): void {
  const L = cellLayout('furnace:cobble', 10, 3.9, 0.95, 0.85, 1.25);
  const r = new Rng('furnace:side');
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const shade: number[] = [];
  for (let k = 0; k < 64; k++) shade.push(r.int(1, 4));
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (L.gap[i]) {
      t.setI(i, F_MORTAR[Math.min(2, Math.floor(px[i] * 3))]);
      t.height[i] = 0.12 + 0.08 * px[i];
      t.smooth[i] = 30;
      continue;
    }
    const d = L.dist[i];
    const nv = n8.at(x, y);
    let lv = shade[L.cell[i]] + (nv > 0.64 ? 1 : nv < 0.36 ? -1 : 0);
    const up = L.gap[idx(x, y - 1)] || L.gap[idx(x - 1, y)];
    const down = L.gap[idx(x, y + 1)] || L.gap[idx(x + 1, y)];
    if (up && !down) lv += 1;
    if (down && !up) lv -= 1;
    lv = clamp(lv, 0, 4);
    let c = F_ROCK[lv];
    if (d <= 1) c = scale(c, 0.95);
    if (y === 15) c = scale(c, 0.88); // zócalo
    t.setI(i, c);
    t.height[i] = 0.3 + 0.7 * Math.sqrt(clamp01((d - 0.5) / 2.2)) + 0.05 * nv;
    t.smooth[i] = 50 + lv * 5 + px[i] * 6;
  }
  furnaceBand(t, px);
  t.depth = 1.5;
}

// Sillería del frente: cada letra es un sillar, '-' junta, 'm' boca y 'r' su marco.
const FRONT_MAP = [
  '................', // banda (se pinta aparte)
  '................',
  '................',
  'aaaaa-bbbbbb-ccc',
  'aaaaa-bbbbbb-ccc',
  'aaaaa-bbbbbb-ccc',
  '----------------',
  'dd-rrrrrrrrrr-ee',
  'dd-rmmmmmmmmr-ee',
  'dd-rmmmmmmmmr-ee',
  '---rmmmmmmmmr---',
  'ff-rmmmmmmmmr-gg',
  'ff-rmmmmmmmmr-gg',
  'ff-rmmmmmmmmr-gg',
  'ff-rrrrrrrrrr-gg',
  '----------------',
];

// Interior de la boca (8×6, filas 8–13): apagada con hollín y ceniza.
const MOUTH_OFF = [
  '#ssssss#',
  'ssdddsss',
  'dddddddd',
  'dddddddd',
  'dcddadcd',
  'aAacAaaA',
];
// Encendida: lenguas de fuego con núcleo blanco-amarillo y brasas abajo.
const MOUTH_LIT = [
  '#..r...#',
  '..ro..r.',
  '.roy.roy',
  'royWrryo',
  'oyWWyoWy',
  'EeEEeEEe',
];

const MOUTH_INKS: Record<string, Ink> = {
  s: { c: [17, 15, 14], h: 0.02, smooth: 12 },
  d: { c: [27, 24, 22], h: 0.05, smooth: 14 },
  c: { c: [44, 38, 35], h: 0.1, smooth: 30 },
  a: { c: [82, 78, 74], h: 0.12, smooth: 18 },
  A: { c: [112, 108, 103], h: 0.14, smooth: 18 },
  '.': { c: [62, 28, 18], h: 0.04, smooth: 20, emit: 55 },
  r: { c: [206, 70, 28], h: 0.06, smooth: 20, emit: 165 },
  o: { c: [246, 140, 42], h: 0.07, smooth: 20, emit: 205 },
  y: { c: [255, 204, 84], h: 0.08, smooth: 20, emit: 235 },
  W: { c: [255, 246, 196], h: 0.09, smooth: 20, emit: 255 },
  E: { c: [238, 112, 38], h: 0.12, smooth: 30, emit: 190 },
  e: { c: [150, 48, 22], h: 0.11, smooth: 30, emit: 150 },
};

export function furnaceFront(t: Tex, lit: boolean): void {
  const r = new Rng('furnace:front'); // misma sillería en las dos variantes
  const px = pixelNoise(r);
  const n8 = new Noise(r, 8);
  const tone = new Map<string, number>();
  for (const ch of 'abcdefg') tone.set(ch, r.int(1, 3));
  const at = (x: number, y: number): string => (x < 0 || y < 0 || x > 15 || y > 15 ? '-' : FRONT_MAP[y][x]);
  for (let y = 3; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = idx(x, y);
      const ch = at(x, y);
      if (ch === '-') {
        t.setI(i, F_MORTAR[Math.min(2, Math.floor(px[i] * 3))]);
        t.height[i] = 0.2;
        t.smooth[i] = 32;
        continue;
      }
      if (ch === 'm') continue; // la boca se pinta después
      if (ch === 'r') {
        // Marco de la boca: sillares lisos con bisel (arriba/izquierda claros).
        const top = y === 7;
        const bottom = y === 14;
        const left = x === 3;
        const right = x === 12;
        let c = F_SLAB[2];
        if (top || left) c = F_SLAB[3];
        if (top && y === 7 && (x === 3 || x === 12)) c = F_SLAB[3];
        if (bottom || right) c = F_SLAB[1];
        if ((bottom && left) || (top && right)) c = F_SLAB[2];
        // Arista interior de la boca, más oscura (hollín).
        const inner = at(x + 1, y) === 'm' || at(x - 1, y) === 'm' || at(x, y + 1) === 'm' || at(x, y - 1) === 'm';
        if (inner && !top && !left) c = scale(c, 0.82);
        t.setI(i, shift(c, (px[i] - 0.5) * 5));
        t.height[i] = 1;
        t.smooth[i] = 64;
        continue;
      }
      // Sillares con bisel cincelado y tono propio.
      const nv = n8.at(x, y);
      let lv = (tone.get(ch) ?? 2) + (nv > 0.66 ? 1 : nv < 0.34 ? -1 : 0);
      const edgeTL = at(x, y - 1) !== ch || at(x - 1, y) !== ch;
      const edgeBR = at(x, y + 1) !== ch || at(x + 1, y) !== ch;
      if (edgeTL && !edgeBR) lv += 1;
      if (edgeBR && !edgeTL) lv -= 1;
      t.setI(i, F_ROCK[clamp(lv, 0, 4)]);
      t.height[i] = edgeTL || edgeBR ? 0.82 : 0.92 + 0.06 * nv;
      t.smooth[i] = 52 + 8 * px[i];
    }
  }
  furnaceBand(t, px);
  // Boca: 8×6 en x 4–11, filas 8–13 (las esquinas '#' del arco son marco).
  const rows = lit ? MOUTH_LIT : MOUTH_OFF;
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < 8; x++) {
      const ch = rows[y][x];
      const i = idx(4 + x, 8 + y);
      if (ch === '#') {
        t.setI(i, F_SLAB[2]);
        t.height[i] = 1;
        t.smooth[i] = 64;
        continue;
      }
      const ink = MOUTH_INKS[ch];
      if (!ink) throw new Error(`Tinta desconocida '${ch}' en ${t.name}`);
      t.setI(i, ink.c);
      t.height[i] = ink.h ?? 0.05;
      t.smooth[i] = ink.smooth ?? 20;
      t.emit[i] = ink.emit ?? 0;
    }
  }
  t.depth = 1.5;
}

/** Tapa: losa lisa con bisel exterior y una línea de borde grabada. */
export function furnaceTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.55 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [16, 34, 34, 16]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const ring = Math.min(x, y, 15 - x, 15 - y);
    let c: RGB;
    let h: number;
    if (ring === 0) {
      const tl = x === 0 || y === 0;
      const br = x === 15 || y === 15;
      c = tl && br ? F_SLAB[2] : tl ? F_SLAB[4] : F_SLAB[0];
      h = 0.9;
    } else if (ring === 1) {
      c = scale(F_SLAB[lv[i]], 0.86); // línea grabada
      h = 0.72;
    } else {
      c = F_SLAB[lv[i]];
      h = 1 - 0.04 * (1 - v[i]);
    }
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = (ring === 1 ? 50 : 70) + 8 * px[i];
  }
  // Algunas motas más oscuras de la piedra.
  for (let k = 0; k < 6; k++) {
    const i = idx(r.int(3, 12), r.int(3, 12));
    t.setI(i, scale(t.getI(i), 0.9));
    t.height[i] -= 0.05;
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Cofre
// ---------------------------------------------------------------------------

// Madera cálida del cofre (más anaranjada que los tablones de roble).
const CW = {
  light: [196, 140, 74] as RGB,
  base: [178, 124, 62] as RGB,
  dark: [158, 106, 52] as RGB,
  grain: [136, 88, 42] as RGB,
  joint: [112, 72, 34] as RGB,
};
// Marco oscuro (los listones que rodean las caras).
const CF = {
  light: [126, 84, 42] as RGB,
  base: [106, 70, 34] as RGB,
  dark: [84, 54, 26] as RGB,
};
const CSEAM: RGB = [58, 36, 17];
/** Fila de la junta de la tapa (≈ 1/3 desde arriba). */
const LID_SEAM = 5;

/**
 * Base común de las caras del cofre: marco, tablas horizontales y (en los laterales) la junta de la tapa.
 * `open`: lado sin poste (la unión de un cofre doble).
 */
function chestBase(t: Tex, seam: boolean, open?: 'left' | 'right'): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const grainN = new Noise(r, 4, 16);
  // Tablas: [primera fila, última fila].
  const boards: [number, number][] = seam
    ? [
        [1, LID_SEAM - 1],
        [LID_SEAM + 1, 9],
        [11, 14],
      ]
    : [
        [1, 4],
        [6, 9],
        [11, 14],
      ];
  const boardOf = (y: number): number => boards.findIndex(([a, b]) => y >= a && y <= b);
  const tone = boards.map(() => r.range(-0.04, 0.04));
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    // Marco: 1 px arriba/abajo y 2 px en los laterales (postes de las esquinas).
    const frame = y === 0 || y === 15 || (x <= 1 && open !== 'left') || (x >= 14 && open !== 'right');
    if (frame) {
      let c = CF.base;
      if (y === 0 || x === 0) c = CF.light;
      if (y === 15 || x === 15) c = CF.dark;
      if (x === 1 && y > 0 && y < 15) c = mix(CF.base, CF.light, 0.35);
      if (x === 14 && y > 0 && y < 15) c = mix(CF.base, CF.dark, 0.5);
      t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.06));
      t.height[i] = 1;
      t.smooth[i] = 50;
      continue;
    }
    const b = boardOf(y);
    if (b < 0) {
      // Junta entre tablas (la de la tapa, más marcada).
      const lid = seam && y === LID_SEAM;
      t.setI(i, lid ? CSEAM : CW.joint);
      t.height[i] = lid ? 0.15 : 0.45;
      t.smooth[i] = 30;
      continue;
    }
    const [y0, y1] = boards[b];
    const g = grainN.at(x, y);
    let c = g > 0.66 ? CW.dark : g < 0.3 ? CW.light : CW.base;
    if (y === y0) c = mix(c, CW.light, 0.45); // canto superior de la tabla
    if (y === y1) c = mix(c, CW.dark, 0.55); // canto inferior
    if (seam && y === LID_SEAM + 1) c = scale(c, 0.86); // sombra bajo la tapa
    t.setI(i, scale(c, 1 + tone[b]));
    t.height[i] = y === y0 || y === y1 ? 0.88 : 0.94;
    t.smooth[i] = 56 + 6 * px[i];
  }
  // Vetas.
  for (let k = 0; k < 6; k++) {
    const [y0, y1] = boards[k % boards.length];
    const y = r.int(y0 + 1, Math.max(y0 + 1, y1 - 1));
    let x = r.int(2, 11);
    const len = r.int(2, 4);
    for (let s = 0; s < len && x <= 13; s++, x++) {
      const i = idx(x, y);
      t.setI(i, CW.grain);
      t.height[i] -= 0.04;
    }
  }
  t.depth = 1.3;
}

// Cerradura metálica (x 6–9, filas 3–8): pasador en la tapa y placa con bocallave
// que arranca en la junta.
const LATCH = ['.hm.', '.md.', 'hmmd', 'mkkd', 'mmkd', 'dddd'];
const LATCH_INKS: Record<string, Ink> = {
  h: { c: [226, 228, 232], h: 1.15, smooth: 190, f0: 230 },
  m: { c: [176, 178, 184], h: 1.12, smooth: 170, f0: 230 },
  d: { c: [120, 122, 130], h: 1.08, smooth: 150, f0: 230 },
  k: { c: [34, 32, 36], h: 0.8, smooth: 40 },
};

function chestFront(t: Tex): void {
  chestBase(t, true);
  // Sombra de la cerradura sobre la madera (abajo y a la derecha).
  for (const [x, y] of [
    [9, 3],
    [9, 4],
    [10, 6],
    [10, 7],
    [10, 8],
    [10, 9],
    [9, 9],
    [8, 9],
    [7, 9],
  ] as const) {
    const i = idx(x, y);
    t.setI(i, scale(t.getI(i), 0.8));
  }
  sprite(t, LATCH, LATCH_INKS, 6, 3);
}

function chestSide(t: Tex): void {
  chestBase(t, true);
}

function chestTop(t: Tex): void {
  chestBase(t, false);
}

/** Frente de una mitad del cofre doble: sin el poste de la unión y con media cerradura en ella. */
function chestFrontSeam(t: Tex, open: 'left' | 'right'): void {
  chestBase(t, true, open);
  const half = LATCH.map((row) => (open === 'right' ? row.slice(0, 2) : row.slice(2)));
  sprite(t, half, LATCH_INKS, open === 'right' ? 14 : 0, 3);
}

// ---------------------------------------------------------------------------
// Brotes (plantas en cruz ancladas a la fila inferior)
// ---------------------------------------------------------------------------

export const OAK_SAPLING = [
  '................',
  '.......1........',
  '.....1.12.......',
  '....112233.1....',
  '...12234334.....',
  '....2334453.....',
  '...3.3445s..1...',
  '......5..s.1223.',
  '..1......s12334.',
  '.1223....s.3445.',
  '12334455sS.4.5..',
  '.345.4.sS.......',
  '..4....sS.......',
  '.......sS.......',
  '.......sS.......',
  '......ssSS......',
];

export const BIRCH_SAPLING = [
  '.......1........',
  '......122.......',
  '.....12233......',
  '....1223334.....',
  '.....2334.......',
  '..1...344..12...',
  '.122...pP.1223..',
  '1223.4.pP.23344.',
  '.2344.kpP..3445.',
  '..34...pk.k.45..',
  '...4...pP.......',
  '.......kP.......',
  '.......pP.......',
  '.......pP.......',
  '.......pk.......',
  '......ppPP......',
];

export const SPRUCE_SAPLING = [
  '................',
  '.......1........',
  '......123.......',
  '.....1234.......',
  '......234.......',
  '.....12344......',
  '....122334......',
  '.....2334.......',
  '...12233445.....',
  '....1223344.....',
  '..1.2233444.5...',
  '.122233344445...',
  '...2333444455...',
  '.....3.sS.5.....',
  '.......sS.......',
  '......ssSS......',
];

export function sapling(t: Tex, rows: readonly string[], leaves: readonly RGB[], stem: Record<string, Ink>, sss: number): void {
  cutoutCanvas(t, 64, sss);
  const inks: Record<string, Ink> = { ...stem };
  leaves.forEach((c, k) => {
    inks[String(k + 1)] = { c, h: 1 - 0.07 * k, smooth: 70 + 4 * (4 - k), sss };
  });
  sprite(t, rows, inks);
}

const OAK_LEAF: RGB[] = [
  [150, 200, 92],
  [112, 166, 64],
  [82, 134, 46],
  [60, 102, 34],
  [44, 78, 26],
];
const BIRCH_LEAF: RGB[] = [
  [196, 224, 132],
  [162, 198, 104],
  [130, 170, 80],
  [102, 140, 62],
  [80, 112, 48],
];
const SPRUCE_LEAF: RGB[] = [
  [88, 138, 92],
  [64, 112, 72],
  [46, 88, 56],
  [34, 68, 44],
  [24, 50, 34],
];
const OAK_STEM: Record<string, Ink> = {
  s: { c: [128, 94, 56], h: 0.85, smooth: 40, sss: 90 },
  S: { c: [92, 66, 38], h: 0.8, smooth: 40, sss: 90 },
};
const BIRCH_STEM: Record<string, Ink> = {
  p: { c: [214, 210, 198], h: 0.85, smooth: 60, sss: 90 },
  P: { c: [176, 172, 160], h: 0.8, smooth: 60, sss: 90 },
  k: { c: [58, 56, 52], h: 0.78, smooth: 40, sss: 60 },
};
const SPRUCE_STEM: Record<string, Ink> = {
  s: { c: [100, 72, 44], h: 0.85, smooth: 40, sss: 90 },
  S: { c: [70, 50, 30], h: 0.8, smooth: 40, sss: 90 },
};

// ---------------------------------------------------------------------------
// Grietas al picar (destroy_0 … destroy_9)
// ---------------------------------------------------------------------------

/** Nº acumulado de píxeles de grieta en cada fase (cada fase contiene la anterior). */
const CRACK_COUNTS = [5, 11, 19, 29, 40, 52, 65, 79, 94, 110];
const CRACK_COL: RGB = [22, 20, 18];
const TAU = Math.PI * 2;

let crackOrder: Int16Array | null = null;

/**
 * Red de grietas determinista en «tela de araña» desde el punto de impacto:
 * rayos quebrados que crecen hacia fuera a velocidades distintas, anillos que
 * unen rayos vecinos (primero cerca del centro, después más lejos) y ramas
 * cortas tardías. Cada píxel guarda el instante en que se abre; la fase k usa
 * los CRACK_COUNTS[k] primeros, así cada fase contiene la anterior.
 */
function crackNetwork(): Int16Array {
  if (crackOrder) return crackOrder;
  const r = new Rng('destroy:web');
  const time = new Float32Array(N).fill(Infinity);
  const cx = 7.5;
  const cy = 8;
  const plot = (x: number, y: number, t: number): void => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = y * 16 + x;
    if (t < time[i]) time[i] = t;
  };
  /** Rasteriza una polilínea; el tiempo crece con la longitud recorrida. */
  const polyline = (pts: readonly (readonly number[])[], t0: number, speed: number): void => {
    let dist = 0;
    for (let s = 0; s + 1 < pts.length; s++) {
      const x0 = Math.floor(pts[s][0]);
      const y0 = Math.floor(pts[s][1]);
      const x1 = Math.floor(pts[s + 1][0]);
      const y1 = Math.floor(pts[s + 1][1]);
      line(x0, y0, x1, y1, (x, y) => plot(x, y, t0 + (dist + Math.hypot(x - x0, y - y0)) / speed));
      dist += Math.hypot(x1 - x0, y1 - y0);
    }
  };
  interface Ray {
    angle: number;
    /** Vértices [x, y, radio]. */
    pts: [number, number, number][];
    t0: number;
    speed: number;
  }
  /** Punto del rayo a un radio dado (interpolado entre vértices). */
  const onRay = (ray: Ray, rad: number): [number, number] => {
    const p = ray.pts;
    for (let k = 0; k + 1 < p.length; k++) {
      if (rad <= p[k + 1][2]) {
        const f = (rad - p[k][2]) / Math.max(1e-6, p[k + 1][2] - p[k][2]);
        return [p[k][0] + (p[k + 1][0] - p[k][0]) * f, p[k][1] + (p[k + 1][1] - p[k][1]) * f];
      }
    }
    return [p[p.length - 1][0], p[p.length - 1][1]];
  };
  const reach = (ray: Ray, rad: number): number => ray.t0 + rad / ray.speed;

  plot(7, 8, 0);
  // Rayos: los alternos arrancan con retraso para que la fase 0 sea una estrella pequeña.
  const rays: Ray[] = [];
  const count = 6;
  const base = r.range(0, TAU);
  for (let k = 0; k < count; k++) {
    const angle = base + (k / count) * TAU + r.range(-0.22, 0.22);
    const pts: [number, number, number][] = [[cx + Math.cos(angle) * 0.9, cy + Math.sin(angle) * 0.9, 0.9]];
    let rad = 0.9;
    while (rad < 12) {
      rad += r.range(1.8, 2.8);
      const a = angle + r.range(-0.3, 0.3);
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, rad]);
    }
    const ray: Ray = { angle, pts, t0: r.range(0, 0.8) + (k % 2 ? 1.8 : 0), speed: r.range(0.7, 1.2) };
    rays.push(ray);
    polyline(pts, ray.t0, ray.speed);
  }
  // Anillos entre rayos vecinos, cada vez más lejos y más tarde.
  const rings: readonly (readonly [number, number, number])[] = [
    [3.8, 0.5, 2.5],
    [6.4, 0.75, 2.5],
    [9.2, 0.8, 3.0],
    [11.8, 0.6, 3.5],
  ];
  for (const [rad0, p, delay] of rings) {
    for (let k = 0; k < count; k++) {
      if (!r.chance(p)) continue;
      const ra = rays[k];
      const rb = rays[(k + 1) % count];
      const radA = rad0 + r.range(-0.6, 0.6);
      const radB = rad0 + r.range(-0.6, 0.6);
      const a = onRay(ra, radA);
      const b = onRay(rb, radB);
      // Punto medio desplazado hacia dentro o hacia fuera: tramo quebrado.
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const md = Math.hypot(mx - cx, my - cy) || 1;
      const bend = r.range(-0.9, 0.9);
      const m: [number, number] = [mx + ((mx - cx) / md) * bend, my + ((my - cy) / md) * bend];
      const t0 = Math.max(reach(ra, radA), reach(rb, radB)) + delay * r.range(0.8, 1.3);
      // Nace en el rayo más temprano y avanza hacia el otro.
      if (reach(ra, radA) <= reach(rb, radB)) polyline([a, m, b], t0, 1);
      else polyline([b, m, a], t0, 1);
    }
  }
  // Ramas cortas tardías que salen de los rayos.
  for (let k = 0; k < 16; k++) {
    const ray = rays[r.int(0, count - 1)];
    const rad = r.range(3, 9);
    const [px, py] = onRay(ray, rad);
    const a = ray.angle + (r.chance(0.5) ? 1 : -1) * r.range(0.5, 0.95);
    const len = r.range(2.2, 4);
    polyline(
      [
        [px, py],
        [px + Math.cos(a) * len, py + Math.sin(a) * len],
      ],
      reach(ray, rad) + r.range(4, 9),
      1,
    );
  }
  const pts: number[] = [];
  for (let i = 0; i < N; i++) if (time[i] !== Infinity) pts.push(i);
  pts.sort((a, b) => time[a] - time[b] || a - b);
  // Grietas de 1 px: se descarta cualquier píxel que cerraría un bloque 2×2 y los
  // que correrían a lo largo del borde de la cara (parecerían un marco del bloque).
  const on = new Uint8Array(N);
  const has = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < 16 && y < 16 && on[y * 16 + x] === 1;
  const out: number[] = [];
  for (const i of pts) {
    const x = i & 15;
    const y = i >> 4;
    if ((x === 0 || x === 15) && (has(x, y - 1) || has(x, y + 1))) continue;
    if ((y === 0 || y === 15) && (has(x - 1, y) || has(x + 1, y))) continue;
    let block = false;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      if (has(x + dx, y) && has(x, y + dy) && has(x + dx, y + dy)) block = true;
    }
    if (block) continue;
    on[i] = 1;
    out.push(i);
  }
  crackOrder = Int16Array.from(out);
  return crackOrder;
}

function destroyStage(t: Tex, stage: number): void {
  t.alpha.fill(0);
  t.height.fill(1);
  t.fillSpec(24, 10, 0, 0);
  t.tiling = false;
  t.clampTransparent = false; // las grietas quedan hundidas respecto a la superficie
  t.depth = 1;
  const order = crackNetwork();
  const n = Math.min(order.length, CRACK_COUNTS[stage]);
  for (let k = 0; k < n; k++) {
    const i = order[k];
    t.setI(i, CRACK_COL);
    t.alpha[i] = 255;
    // Las grietas más antiguas, algo más profundas.
    t.height[i] = 0.3 + 0.2 * (k / Math.max(1, n));
    t.smooth[i] = 20;
  }
}

export const SURVIVAL_GENERATORS: Record<string, Generator> = {
  furnace_front: (t) => furnaceFront(t, false),
  furnace_front_lit: (t) => furnaceFront(t, true),
  furnace_side: furnaceSide,
  furnace_top: furnaceTop,
  chest_front: chestFront,
  chest_side: chestSide,
  chest_top: chestTop,
  chest_front_seam_right: (t) => chestFrontSeam(t, 'right'),
  chest_front_seam_left: (t) => chestFrontSeam(t, 'left'),
  chest_side_seam_right: (t) => chestBase(t, true, 'right'),
  chest_side_seam_left: (t) => chestBase(t, true, 'left'),
  oak_sapling: (t) => sapling(t, OAK_SAPLING, OAK_LEAF, OAK_STEM, 215),
  birch_sapling: (t) => sapling(t, BIRCH_SAPLING, BIRCH_LEAF, BIRCH_STEM, 215),
  spruce_sapling: (t) => sapling(t, SPRUCE_SAPLING, SPRUCE_LEAF, SPRUCE_STEM, 200),
};
for (let k = 0; k < CRACK_COUNTS.length; k++) SURVIVAL_GENERATORS['destroy_' + k] = (t) => destroyStage(t, k);
