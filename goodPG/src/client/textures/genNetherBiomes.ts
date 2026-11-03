// Fase 8.2 (biomas del Nether): texturas de los bloques de los biomas del Nether, todas dibujadas aquí
// (nada copiado del juego):
// - maderas carmesí y distorsionada: corteza fibrosa con motas que brillan (los tallos), anillos del corte,
//   madera sin corteza, tablones, puertas y trampillas;
// - necelio (el manto de hongos encima y colgando por el lado de la rocanegra), hongos, raíces, brotes,
//   enredaderas lloronas y retorcidas (la punta y el tallo, que se repite en vertical);
// - bloques de verrugas (bultos carnosos), luz de hongo (celdas que brillan);
// - basalto (columnas con aristas claras) y pulido, piedra negra y sus formas, ladrillos del Nether.
import { N, Noise, Tex, clamp, field, idx, mix, pixelNoise, rankLevels, scale, wrap, type Generator, type RGB } from './texCore';
import { logTop, planks, type PlankStyle } from './genWood';
import { door, drawPlan, wood } from './genBuilding';
import { cutoutCanvas, sprite, type Ink } from './genPlants';
import { netherrack } from './genStructures';
import { fringeDepths } from './genSoil';
import { bevel, brickOverlay, carve, cracks, soften } from './genStones';

// ---------------------------------------------------------------------------
// Paletas
// ---------------------------------------------------------------------------

interface NetherWoodPal {
  /** Corteza de oscuro a claro. */
  bark: RGB[];
  /** Motas que brillan en la corteza (base y núcleo). */
  glow: [RGB, RGB];
  /** Madera sin corteza de oscuro a claro. */
  inner: RGB[];
  planks: PlankStyle;
  /** Manto del necelio de oscuro a claro. */
  nylium: RGB[];
  /** Bloque de verrugas de oscuro a claro. */
  wart: RGB[];
}

const CRIMSON: NetherWoodPal = {
  bark: [[54, 13, 24], [76, 20, 33], [97, 27, 42], [118, 35, 51], [140, 46, 62]],
  glow: [[196, 70, 52], [230, 120, 84]],
  inner: [[120, 44, 66], [140, 55, 77], [158, 66, 88], [176, 79, 100]],
  planks: { light: [130, 64, 92], base: [114, 54, 80], dark: [102, 47, 71], grain: [89, 40, 62], seam: [56, 25, 41], joint: [76, 34, 54], smooth: 56 },
  nylium: [[80, 9, 12], [102, 15, 17], [122, 22, 23], [142, 32, 30], [162, 46, 40]],
  wart: [[66, 4, 6], [84, 6, 8], [102, 10, 11], [120, 15, 14], [136, 24, 20]],
};

const WARPED: NetherWoodPal = {
  bark: [[30, 26, 44], [41, 37, 58], [53, 47, 74], [64, 58, 88], [78, 70, 102]],
  glow: [[18, 150, 136], [70, 200, 184]],
  inner: [[40, 114, 110], [50, 132, 126], [62, 150, 142], [78, 168, 158]],
  planks: { light: [54, 132, 126], base: [45, 115, 110], dark: [39, 103, 99], grain: [33, 90, 87], seam: [20, 56, 54], joint: [28, 74, 71], smooth: 56 },
  nylium: [[14, 84, 80], [20, 106, 98], [26, 126, 114], [36, 146, 130], [52, 164, 146]],
  wart: [[10, 80, 78], [14, 100, 95], [19, 118, 110], [26, 136, 125], [38, 152, 139]],
};

// ---------------------------------------------------------------------------
// Tallos e hifas
// ---------------------------------------------------------------------------

/** Corteza del tallo: fibras verticales retorcidas y motas que brillan (la luz propia de los hongos). */
function stemSide(t: Tex, p: NetherWoodPal): void {
  const r = t.rng();
  const fib = new Noise(r, 16, 2);
  const fib2 = new Noise(r, 8, 4);
  const blot = new Noise(r, 4, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * fib.at(x, y) + 0.25 * fib2.at(x, y) + 0.15 * blot.at(x, y) + 0.1 * px[i]);
  const lv = rankLevels(v, [10, 22, 30, 24, 14]);
  for (let i = 0; i < N; i++) {
    t.setI(i, p.bark[lv[i]]);
    t.height[i] = 0.62 + 0.09 * lv[i];
    t.smooth[i] = 40 + 6 * lv[i];
  }
  // Surcos oscuros que bajan serpenteando.
  for (let k = 0; k < 4; k++) {
    let x = r.int(0, 15);
    for (let y = 0; y < 16; y++) {
      const i = idx(x, y);
      t.setI(i, scale(p.bark[0], 0.85));
      t.height[i] = 0.35;
      if (r.chance(0.28)) x = wrap(x + (r.chance(0.5) ? 1 : -1));
    }
  }
  // Motas que brillan un poco: puntos sueltos o de dos píxeles metidos en los surcos claros.
  for (let k = 0; k < 6; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const len = r.chance(0.35) ? 2 : 1;
    for (let s = 0; s < len; s++) {
      const i = idx(x, wrap(y + s));
      t.setI(i, s === 0 ? p.glow[0] : scale(p.glow[0], 0.8));
      t.emit[i] = s === 0 ? 34 : 22;
      t.height[i] = 0.85;
      t.smooth[i] = 80;
    }
  }
  t.depth = 1.3;
}

/** Corte del tallo: anillos de la madera y un borde de corteza con motas. */
function stemTop(t: Tex, p: NetherWoodPal, stripped: boolean): void {
  logTop(t, { bark: stripped ? [scale(p.inner[1], 0.9), p.inner[1], p.inner[2]] : p.bark.slice(1, 4), wood: p.inner, spacing: 1.7 });
  if (stripped) return;
  const r = t.rng('glow');
  for (let k = 0; k < 5; k++) {
    const side = r.int(0, 3), s = r.int(1, 14);
    const x = side === 0 ? 0 : side === 1 ? 15 : s, y = side === 2 ? 0 : side === 3 ? 15 : s;
    const i = idx(side < 2 ? x : s, side < 2 ? s : y);
    t.setI(i, p.glow[0]);
    t.emit[i] = 130;
  }
}

/** Lado del tallo sin corteza: carne lisa del hongo con fibras finas. */
function strippedStemSide(t: Tex, p: NetherWoodPal): void {
  const r = t.rng();
  const fib = new Noise(r, 16, 2);
  const fib2 = new Noise(r, 8, 3);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.6 * fib.at(x, y) + 0.28 * fib2.at(x, y) + 0.12 * px[i]);
  const lv = rankLevels(v, [12, 30, 36, 22]);
  for (let i = 0; i < N; i++) {
    t.setI(i, p.inner[lv[i]]);
    t.height[i] = 0.82 + 0.05 * lv[i];
    t.smooth[i] = 62 + 5 * lv[i];
    t.sss[i] = 20;
  }
  t.depth = 0.9;
}

// ---------------------------------------------------------------------------
// Necelio
// ---------------------------------------------------------------------------

/** Manto de hongos: grumos con poros oscuros y alguna hebra clara. */
function nyliumTop(t: Tex, pal: readonly RGB[]): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.4 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [8, 18, 30, 28, 16]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.55 + 0.1 * lv[i];
    t.smooth[i] = 46 + 5 * lv[i];
    t.sss[i] = 30;
  }
  // Poros: puntos hundidos y oscuros.
  for (let k = 0; k < 14; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, scale(pal[0], 0.78));
    t.height[i] = 0.3;
  }
  // Hebras claras sueltas.
  for (let k = 0; k < 8; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < 2; s++) {
      const i = idx(x, y);
      t.setI(i, scale(pal[4], 1.06));
      t.height[i] = 1;
      x = wrap(x + (r.chance(0.5) ? 1 : 0));
      y = wrap(y + 1);
    }
  }
  t.depth = 1.1;
}

/** Lado del necelio: rocanegra con el manto cayendo desde arriba en flecos irregulares. */
function nyliumSide(t: Tex, pal: readonly RGB[]): void {
  netherrack(t);
  const r = t.rng('fringe');
  const depth = fringeDepths(r, [2, 3, 3, 4], 5, 5, 7);
  const n = new Noise(r, 8);
  for (let x = 0; x < 16; x++) {
    const dep = depth[x];
    for (let y = 0; y < dep; y++) {
      const l = clamp(Math.round(3 - y * 0.5 + (n.at(x, y) - 0.5) * 2), 0, 4);
      const i = idx(x, y);
      t.setI(i, pal[l]);
      t.height[i] = 1 - 0.04 * y;
      t.smooth[i] = 48;
      t.sss[i] = 30;
    }
    const i = idx(x, dep);
    t.setI(i, scale(t.getI(i), 0.72));
    t.height[i] = 0.45;
  }
  t.depth = 1.15;
}

// ---------------------------------------------------------------------------
// Hongos, raíces, brotes y enredaderas
// ---------------------------------------------------------------------------

// Hongo carmesí: sombrero rojo con motas amarillas que cae por los lados y un pie rosado curvado.
const CRIMSON_FUNGUS = [
  '................',
  '................',
  '................',
  '......aaaa......',
  '....aabbbbaa....',
  '...abbybbbybba..',
  '..abbbbbbbbbbba.',
  '..abybbbbbybbba.',
  '..aabbbbbbbbbaa.',
  '...a.cccccc..a..',
  '.......ss.......',
  '.......sS.......',
  '......ssS.......',
  '......sS........',
  '......sS........',
  '.....ssSS.......',
];
// Hongo distorsionado: sombrero verde azulado ancho y plano con motas naranjas.
const WARPED_FUNGUS = [
  '................',
  '................',
  '................',
  '................',
  '.....aaaaaa.....',
  '...aabbybbbaa...',
  '..abbbbbbbybba..',
  '.abybbbbbbbbbba.',
  '.aabbbbbybbbbaa.',
  '...cccccccccc...',
  '.......sS.......',
  '.......sS.......',
  '........sS......',
  '........sS......',
  '.......ssS......',
  '......sssSS.....',
];

function fungus(t: Tex, rows: readonly string[], cap: [RGB, RGB], spot: RGB, gill: RGB, stem: [RGB, RGB]): void {
  cutoutCanvas(t, 70, 120);
  const inks: Record<string, Ink> = {
    a: { c: cap[0], h: 0.85, smooth: 70, sss: 140 },
    b: { c: cap[1], h: 1, smooth: 80, sss: 150 },
    y: { c: spot, h: 1, smooth: 100, sss: 100, emit: 40 },
    c: { c: gill, h: 0.7, smooth: 50, sss: 90 },
    s: { c: stem[0], h: 0.9, smooth: 60, sss: 110 },
    S: { c: stem[1], h: 0.8, smooth: 55, sss: 100 },
  };
  sprite(t, rows, inks);
}

/** Tallo fino que sube (o baja) serpenteando desde (x0, y0); cada paso llama a `plot`. */
function strand(r: ReturnType<Tex['rng']>, x0: number, y0: number, len: number, dir: number, plot: (x: number, y: number, s: number) => void): void {
  let x = x0;
  for (let s = 0; s < len; s++) {
    const y = y0 + dir * s;
    if (y < 0 || y > 15) break;
    plot(x, y, s);
    if (r.chance(0.3)) x = clamp(x + (r.chance(0.5) ? 1 : -1), 1, 14);
  }
}

/** Raíces del Nether: un manojo tupido de hebras que salen del suelo, se abren y se ramifican en la punta. */
function roots(t: Tex, pal: readonly RGB[]): void {
  cutoutCanvas(t, 55, 120);
  const r = t.rng();
  const count = 9;
  for (let k = 0; k < count; k++) {
    const x0 = 2 + Math.round((k * 11) / (count - 1)) + r.int(-1, 1);
    const len = r.int(6, 13);
    // Las de fuera se inclinan hacia fuera.
    const lean = x0 < 6 ? -1 : x0 > 9 ? 1 : 0;
    let x = clamp(x0, 1, 14);
    for (let s = 0; s < len; s++) {
      const y = 15 - s;
      const tip = s >= len - 2;
      const c = tip ? pal[3] : s < 2 ? pal[0] : pal[1 + ((s + k) % 2)];
      t.paint(x, y, c, tip ? 1 : 0.85, 55, 120);
      // Base más gruesa.
      if (s < 3 && k % 2 === 0) t.paint(clamp(x + 1, 0, 15), y, pal[0], 0.75, 50, 110);
      // Ramitas cortas hacia los lados y una horquilla en la punta.
      if (!tip && s > 3 && r.chance(0.22)) t.paint(clamp(x + (r.chance(0.5) ? 1 : -1), 0, 15), y - 1, pal[2], 0.8, 55, 120);
      if (s === len - 1 && y > 0) {
        t.paint(clamp(x - 1, 0, 15), y - 1, pal[3], 0.95, 60, 130);
        t.paint(clamp(x + 1, 0, 15), y - 1, pal[3], 0.95, 60, 130);
      }
      if (s > 2 && r.chance(0.2 + Math.abs(lean) * 0.08)) x = clamp(x + (lean || (r.chance(0.5) ? 1 : -1)), 2, 13);
    }
  }
}

/** Brotes del Nether: matas bajas de briznas finas que se abren desde el suelo. */
function sprouts(t: Tex): void {
  cutoutCanvas(t, 60, 120);
  const r = t.rng();
  const pal: RGB[] = [[14, 84, 78], [22, 116, 106], [34, 148, 132], [66, 186, 164], [120, 222, 200]];
  // Tres matas; cada una, un abanico de briznas.
  for (const cx of [3, 8, 12]) {
    const blades = r.int(4, 6);
    for (let b = 0; b < blades; b++) {
      const dir = b - (blades - 1) / 2;
      const h = r.int(3, 6) - Math.round(Math.abs(dir) * 0.6);
      let x = cx + Math.round(dir * 0.5);
      for (let s = 0; s < h; s++) {
        if (s > 1 && Math.abs(dir) >= 1 && s % 2 === 0) x += Math.sign(dir);
        const l = Math.min(4, Math.floor((s / Math.max(1, h - 1)) * 3.5) + (b % 2));
        t.paint(clamp(x, 0, 15), 15 - s, pal[l], 0.75 + 0.05 * s, 60, 120);
      }
    }
  }
}

/**
 * Enredadera del Nether. `down`: la llorona cuelga (el tallo arriba, la punta hacia abajo); si no, la
 * retorcida sube. `tip`: la punta, que se acaba a media altura con hojas más claras; si no, el tallo, que se
 * repite en vertical (las hebras son periódicas en y).
 */
function netherVine(t: Tex, pal: readonly RGB[], down: boolean, tip: boolean): void {
  cutoutCanvas(t, 60, 150);
  // Distancia desde el arranque (arriba en la llorona, abajo en la retorcida).
  const from = (y: number) => (down ? y : 15 - y);
  const end = tip ? 12 : 99; // la punta se acaba aquí
  const cx = (y: number) => 7.5 + 1.3 * Math.sin((y / 16) * Math.PI * 2);
  // Tallo de 2 píxeles que serpentea (periódico en y para que el tallo se repita sin costuras).
  for (let y = 0; y < 16; y++) {
    if (from(y) > end) continue;
    const x = Math.floor(cx(y));
    t.paint(clamp(x, 0, 15), y, pal[1], 0.9, 60, 150);
    t.paint(clamp(x + 1, 0, 15), y, pal[0], 0.8, 55, 140);
  }
  // Racimos de hojas cada 4 filas, alternando el lado: una fila larga y otra corta debajo (o encima).
  for (let k = 0; k < 4; k++) {
    const y0 = 1 + k * 4;
    if (from(y0) > end - 1) continue;
    const side = k % 2 === 0 ? -1 : 1;
    const x0 = Math.floor(cx(y0)) + (side > 0 ? 2 : -1);
    const bright = tip && from(y0) > end - 5;
    for (let s = 0; s < 3; s++) t.paint(clamp(x0 + side * s, 0, 15), y0, bright ? pal[4] : pal[s === 2 ? 2 : 3], 1 - 0.05 * s, 75, 180);
    const y1 = down ? y0 + 1 : y0 - 1;
    for (let s = 0; s < 2; s++) t.paint(clamp(x0 + side * s, 0, 15), y1, bright ? pal[3] : pal[2], 0.85, 70, 170);
    // Hojas menudas del otro lado, entre racimo y racimo.
    t.paint(clamp(Math.floor(cx(y0)) - side, 0, 15), y1, pal[2], 0.8, 70, 170);
    const y2 = y0 + 2;
    if (y2 <= 15 && from(y2) <= end - 1) {
      const xo = Math.floor(cx(y2)) + (side > 0 ? -1 : 2);
      t.paint(clamp(xo, 0, 15), y2, bright ? pal[4] : pal[3], 0.9, 75, 180);
      t.paint(clamp(xo - side, 0, 15), y2, pal[2], 0.85, 70, 170);
    }
  }
  if (tip) {
    // Yema final: un botón claro donde se acaba.
    const y = down ? end : 15 - end;
    const x = Math.floor(cx(y));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, down ? 1 : -1]]) {
      const yy = y + dy;
      if (yy >= 0 && yy <= 15) t.paint(clamp(x + dx, 0, 15), yy, pal[4], 1, 90, 190);
    }
  }
}

// ---------------------------------------------------------------------------
// Bloques de verrugas y luz de hongo
// ---------------------------------------------------------------------------

/** Bloque de verrugas: bultos carnosos apretados con huecos oscuros entre ellos. */
function wartBlock(t: Tex, pal: readonly RGB[]): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  // Bultos: bajo el ruido de 8 celdas, cada máximo es una verruga (más clara arriba a la izquierda).
  const v = field((x, y, i) => 0.55 * n8.at(x, y) + 0.3 * n4.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [10, 18, 28, 26, 18]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.4 + 0.15 * lv[i];
    t.smooth[i] = 70 + 10 * lv[i];
    t.sss[i] = 60;
  }
  // Brillo húmedo en las crestas.
  for (let i = 0; i < N; i++) {
    if (lv[i] === 4 && px[i] > 0.6) {
      t.setI(i, scale(pal[4], 1.12));
      t.smooth[i] = 150;
    }
  }
  t.depth = 1.5;
}

/** Luz de hongo: celdas redondeadas que brillan, con bordes naranja oscuro. */
function shroomlight(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const pal: RGB[] = [[176, 78, 36], [214, 110, 50], [238, 146, 64], [250, 180, 88], [255, 214, 126]];
  const v = field((x, y, i) => 0.5 * n8.at(x, y) + 0.3 * n4.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [10, 18, 28, 26, 18]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.5 + 0.12 * lv[i];
    t.emit[i] = 110 + 36 * lv[i];
    t.smooth[i] = 60 + 8 * lv[i];
    t.sss[i] = 80;
  }
  t.depth = 1.1;
}

// ---------------------------------------------------------------------------
// Basalto
// ---------------------------------------------------------------------------

const BASALT: RGB[] = [[40, 40, 44], [51, 51, 56], [62, 62, 67], [73, 73, 78], [85, 85, 90], [99, 99, 104]];

/**
 * Lado del basalto: estrías verticales finas (la roca se enfrió en columnas) de grises distintos, con
 * alguna banda horizontal apenas marcada y poros oscuros. Pulido: estrías más regulares y lisas.
 */
function basaltSide(t: Tex, polishedSide: boolean): void {
  const r = t.rng();
  const streak = new Noise(r, 16, 1); // una fila de celdas: cada columna tiene su tono
  const fine = new Noise(r, 16, 4);
  const band = new Noise(r, 1, 4); // bandas horizontales suaves
  const px = pixelNoise(r);
  const v = field((x, y, i) => (polishedSide
    ? 0.75 * streak.at(x, 0) + 0.15 * fine.at(x, y) + 0.1 * px[i]
    : 0.55 * streak.at(x, 0) + 0.2 * fine.at(x, y) + 0.12 * band.at(0, y) + 0.13 * px[i]));
  const lv = rankLevels(v, polishedSide ? [6, 16, 28, 28, 16, 6] : [8, 18, 26, 24, 16, 8]);
  for (let i = 0; i < N; i++) {
    t.setI(i, BASALT[lv[i]]);
    t.height[i] = 0.6 + 0.07 * lv[i];
    t.smooth[i] = polishedSide ? 95 : 42 + 4 * lv[i];
  }
  if (!polishedSide) {
    // Poros: puntos hundidos.
    for (let k = 0; k < 10; k++) {
      const i = idx(r.int(0, 15), r.int(0, 15));
      t.setI(i, scale(BASALT[0], 0.8));
      t.height[i] = 0.3;
    }
  } else {
    bevel(t, 0, 0, 15, 15, 1.12, 0.82);
  }
  t.depth = polishedSide ? 0.9 : 1.2;
}

/** Tapa del basalto: la sección de la columna, con anillos irregulares; pulida, en espiral lisa y con bisel. */
function basaltTop(t: Tex, polishedTop: boolean): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = (i & 15) - 7.5, y = (i >> 4) - 7.5;
    const d = polishedTop ? Math.max(Math.abs(x), Math.abs(y)) : Math.hypot(x, y) + (n.at(i & 15, i >> 4) - 0.5) * 3;
    const ring = polishedTop ? Math.floor(d) % 3 === 0 : Math.floor(d * 0.9) % 3 === 0;
    const l = ring ? 1 : clamp(3 + Math.round((px[i] - 0.5) * (polishedTop ? 1 : 2.5)), 2, 5);
    t.setI(i, BASALT[l]);
    t.height[i] = ring ? 0.55 : 0.92;
    t.smooth[i] = polishedTop ? 95 : 48;
  }
  if (polishedTop) bevel(t, 0, 0, 15, 15);
  t.depth = polishedTop ? 1 : 1.3;
}

// ---------------------------------------------------------------------------
// Piedra negra
// ---------------------------------------------------------------------------

const BLACKSTONE: RGB[] = [[24, 20, 26], [34, 28, 36], [44, 38, 46], [55, 48, 57], [68, 60, 70], [84, 76, 86]];

/** Piedra negra: casi negra, con motas violáceas y alguna veta más clara. */
function blackstone(t: Tex, top: boolean): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, top ? 8 : 16, top ? 8 : 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.35 * n4.at(x, y) + 0.4 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [10, 22, 28, 22, 12, 6]);
  for (let i = 0; i < N; i++) {
    t.setI(i, BLACKSTONE[lv[i]]);
    t.height[i] = 0.5 + 0.09 * lv[i];
    t.smooth[i] = 40 + 6 * lv[i];
  }
  t.depth = 1.2;
}

function polishedBlackstone(t: Tex): void {
  blackstone(t, true);
  soften(t, 0.45, 45);
  bevel(t, 0, 0, 15, 15, 1.25, 0.8);
  t.depth = 0.9;
}

function polishedBlackstoneBricks(t: Tex, cracked: boolean): void {
  polishedBlackstone(t);
  brickOverlay(t, { courseH: 4, brickW: 8, stagger: true, seam: 0.55, shade: 0.07 });
  if (cracked) cracks(t, 6, 0.5);
}

const CHISELED_BLACKSTONE = [
  '++++++++++',
  '+########+',
  '+#++++++#+',
  '+#+####+#+',
  '+#+#++#+#+',
  '+#+#++#+#+',
  '+#+####+#+',
  '+#++++++#+',
  '+########+',
  '++++++++++',
];
function chiseledPolishedBlackstone(t: Tex): void {
  polishedBlackstone(t);
  carve(t, CHISELED_BLACKSTONE, 0.6, 1.25);
}

/** Piedra negra dorada: vetas y pepitas de oro brillante metidas en la piedra. */
function gildedBlackstone(t: Tex): void {
  blackstone(t, false);
  const r = t.rng('gold');
  const gold: RGB[] = [[160, 98, 22], [214, 150, 38], [246, 196, 64], [255, 234, 128]];
  // Pepitas de 2×2 o de 3 píxeles en L, con el brillo arriba a la izquierda y la sombra abajo a la derecha.
  for (let k = 0; k < 6; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    const cells: [number, number, number][] = [[0, 0, 3], [1, 0, 2], [0, 1, 2], [1, 1, 0]];
    if (r.chance(0.4)) cells.pop();
    for (const [dx, dy, l] of cells) {
      const i = idx(wrap(x + dx), wrap(y + dy));
      t.setI(i, gold[l]);
      t.height[i] = l === 0 ? 0.85 : 1;
      t.smooth[i] = 200;
      t.f0[i] = 220;
    }
  }
}

// ---------------------------------------------------------------------------
// Ladrillos del Nether
// ---------------------------------------------------------------------------

/** Ladrillos del Nether: ladrillitos de 8×4 muy oscuros, con juntas casi negras. */
function netherBricks(t: Tex, pal: readonly RGB[], mortar: RGB): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const n = new Noise(r, 8);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const l = clamp(Math.round(1 + (n.at(x, y) - 0.5) * 2 + (px[i] - 0.5)), 0, 2);
    t.setI(i, pal[l]);
    t.height[i] = 0.9;
    t.smooth[i] = 55;
  }
  brickOverlay(t, { courseH: 4, brickW: 8, stagger: true, seam: 0.45, shade: 0.09 });
  // La junta: del color del mortero (no sólo más oscura).
  for (let i = 0; i < N; i++) if (t.height[i] <= 0.2) t.setI(i, mix(mortar, t.getI(i), 0.25));
  t.depth = 1.3;
}

const NETHER_BRICK: RGB[] = [[52, 24, 29], [66, 31, 36], [80, 38, 44]];
const NETHER_MORTAR: RGB = [26, 12, 16];
const RED_NETHER_BRICK: RGB[] = [[82, 9, 13], [100, 14, 18], [118, 20, 24]];
const RED_NETHER_MORTAR: RGB = [42, 4, 7];

const CHISELED_NETHER = [
  '++++++++++++',
  '+##########+',
  '+#+#+##+#+#+',
  '+##########+',
  '++++++++++++',
  '............',
  '............',
  '++++++++++++',
  '+##########+',
  '+#+#+##+#+#+',
  '+##########+',
  '++++++++++++',
];
function chiseledNetherBricks(t: Tex): void {
  netherBricks(t, NETHER_BRICK, NETHER_MORTAR);
  carve(t, CHISELED_NETHER, 0.55, 1.3);
}

// ---------------------------------------------------------------------------
// Puertas y trampillas
// ---------------------------------------------------------------------------

// Carmesí: tablas verticales con cuatro rendijas arriba y otras dos abajo.
const CRIMSON_DOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FF.|v.|v.|v.|.FF',
  'FF.|v.|v.|v.|.FF',
  'FF.|v.|v.|v.|.FF',
  'FF.|v.|v.|v.|.FF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|v.|v.|vv|vFF',
  'FFv|v.|v.|vv|vFF',
  'FFv|v.|v.|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];
// Distorsionada: un gran rombo calado arriba y tablas en diagonal abajo.
const WARPED_DOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbb..bbbbbFF',
  'FFbbbb....bbbbFF',
  'FFbbb......bbbFF',
  'FFbb........bbFF',
  'FFbbb......bbbFF',
  'FFbbbb....bbbbFF',
  'FFbbbbb..bbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];
const CRIMSON_TRAPDOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|v.|v.|v.|vFF',
  'FFv|v.|v.|v.|vFF',
  'FFv|v.|v.|v.|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|vv|vv|vv|vFF',
  'FFv|v.|v.|v.|vFF',
  'FFv|v.|v.|v.|vFF',
  'FFv|v.|v.|v.|vFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];
const WARPED_TRAPDOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbb..bbbbbFF',
  'FFbbbb....bbbbFF',
  'FFbbb......bbbFF',
  'FFbb........bbFF',
  'FFb..........bFF',
  'FFb..........bFF',
  'FFbb........bbFF',
  'FFbbb......bbbFF',
  'FFbbbb....bbbbFF',
  'FFbbbbb..bbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

// ---------------------------------------------------------------------------

export const NETHER_BIOME_GENERATORS: Record<string, Generator> = {
  nether_sprouts: sprouts,
  nether_wart_block: (t) => wartBlock(t, CRIMSON.wart),
  warped_wart_block: (t) => wartBlock(t, WARPED.wart),
  shroomlight,
  basalt_side: (t) => basaltSide(t, false),
  basalt_top: (t) => basaltTop(t, false),
  polished_basalt_side: (t) => basaltSide(t, true),
  polished_basalt_top: (t) => basaltTop(t, true),
  blackstone: (t) => blackstone(t, false),
  blackstone_top: (t) => blackstone(t, true),
  polished_blackstone: polishedBlackstone,
  polished_blackstone_bricks: (t) => polishedBlackstoneBricks(t, false),
  cracked_polished_blackstone_bricks: (t) => polishedBlackstoneBricks(t, true),
  chiseled_polished_blackstone: chiseledPolishedBlackstone,
  gilded_blackstone: gildedBlackstone,
  nether_bricks: (t) => netherBricks(t, NETHER_BRICK, NETHER_MORTAR),
  cracked_nether_bricks: (t) => {
    netherBricks(t, NETHER_BRICK, NETHER_MORTAR);
    cracks(t, 6, 0.45);
  },
  chiseled_nether_bricks: chiseledNetherBricks,
  red_nether_bricks: (t) => netherBricks(t, RED_NETHER_BRICK, RED_NETHER_MORTAR),
  crimson_fungus: (t) => fungus(t, CRIMSON_FUNGUS, [[150, 26, 30], [196, 42, 40]], [250, 184, 66], [110, 30, 34], [[214, 150, 150], [176, 112, 116]]),
  warped_fungus: (t) => fungus(t, WARPED_FUNGUS, [[18, 118, 108], [30, 160, 144]], [240, 124, 44], [16, 84, 80], [[190, 214, 204], [140, 176, 166]]),
  crimson_roots: (t) => roots(t, [[96, 14, 22], [130, 22, 30], [160, 34, 40], [206, 70, 64]]),
  warped_roots: (t) => roots(t, [[16, 84, 80], [22, 114, 104], [30, 142, 128], [70, 196, 176]]),
  weeping_vines: (t) => netherVine(t, CRIMSON.nylium, true, true),
  weeping_vines_plant: (t) => netherVine(t, CRIMSON.nylium, true, false),
  twisting_vines: (t) => netherVine(t, WARPED.nylium, false, true),
  twisting_vines_plant: (t) => netherVine(t, WARPED.nylium, false, false),
};

for (const [key, p, doorRows, trapRows] of [
  ['crimson', CRIMSON, CRIMSON_DOOR, CRIMSON_TRAPDOOR],
  ['warped', WARPED, WARPED_DOOR, WARPED_TRAPDOOR],
] as const) {
  const w = wood(p.planks, 0.45);
  Object.assign(NETHER_BIOME_GENERATORS, {
    [`${key}_stem_side`]: (t: Tex) => stemSide(t, p),
    [`${key}_stem_top`]: (t: Tex) => stemTop(t, p, false),
    [`stripped_${key}_stem_side`]: (t: Tex) => strippedStemSide(t, p),
    [`stripped_${key}_stem_top`]: (t: Tex) => stemTop(t, p, true),
    [`${key}_planks`]: (t: Tex) => planks(t, p.planks),
    [`${key}_nylium`]: (t: Tex) => nyliumTop(t, p.nylium),
    [`${key}_nylium_side`]: (t: Tex) => nyliumSide(t, p.nylium),
    [`${key}_door_top`]: (t: Tex) => door(t, doorRows, w, `${key}_door`, false),
    [`${key}_door_bottom`]: (t: Tex) => door(t, doorRows, w, `${key}_door`, true),
    [`${key}_trapdoor`]: (t: Tex) => drawPlan(t, trapRows, 0, w, `${key}_trapdoor`),
  });
}

/** Paletas de las maderas del Nether (los sprites de los carteles y las puertas en la mano). */
export const NETHER_PLANK_STYLES: Readonly<Record<string, PlankStyle>> = { crimson: CRIMSON.planks, warped: WARPED.planks };
