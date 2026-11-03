// Generadores varios: líquidos, fuentes de luz, bloques de construcción,
// bloques de metal/gema y lanas.

import {
  N,
  Noise,
  Tex,
  clamp,
  field,
  idx,
  mix,
  mod,
  pixelNoise,
  rankLevels,
  scale,
  scatter,
  shift,
  smoothstep,
  voronoi,
  wrap,
  type Generator,
  type RGB,
} from './texCore';
import { OAK_PLANKS } from './genWood';
import { cutoutCanvas, sprite, type Ink } from './genPlants';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Agua y lava
// ---------------------------------------------------------------------------

const WATER: RGB[] = [
  [30, 84, 128],
  [36, 97, 142],
  [42, 110, 155],
  [50, 124, 167],
  [80, 156, 192],
  [128, 196, 220],
];
const WATER_A = [188, 182, 178, 176, 186, 194];

function water(t: Tex): void {
  const r = t.rng();
  const p1 = r.range(0, TAU);
  const p2 = r.range(0, TAU);
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  // Ondas con vectores de onda enteros: periódicas en 16 px.
  const v = field(
    (x, y) =>
      0.5 +
      0.22 * Math.sin((TAU * (x + 2 * y)) / 16 + p1) +
      0.16 * Math.sin((TAU * (3 * x - y)) / 16 + p2) +
      0.12 * (n4.at(x, y) - 0.5) +
      0.1 * (n8.at(x, y) - 0.5),
  );
  const lv = rankLevels(v, [14, 30, 32, 16, 6, 2]);
  for (let i = 0; i < N; i++) {
    t.setI(i, WATER[lv[i]]);
    t.alpha[i] = WATER_A[lv[i]];
    t.height[i] = 0.4 + 0.6 * v[i];
  }
  t.fillSpec(245, 5, 0, 0);
  t.depth = 0.7;
}

const LAVA: RGB[] = [
  [58, 20, 12],
  [92, 32, 14],
  [176, 56, 14],
  [218, 98, 20],
  [240, 146, 34],
  [252, 196, 70],
  [255, 232, 150],
];
const LAVA_E = [26, 50, 140, 175, 210, 240, 255];

function lava(t: Tex): void {
  const r = t.rng();
  const w1 = new Noise(r, 4);
  const w2 = new Noise(r, 4);
  const base = new Noise(r, 4);
  const det = new Noise(r, 8);
  // Remolinos: ruido periódico muestreado con un desplazamiento también periódico.
  const v = field((x, y) => {
    const wx = (w1.at(x, y) - 0.5) * 7;
    const wy = (w2.at(x, y) - 0.5) * 7;
    return 0.7 * base.at(x + wx, y + wy) + 0.3 * det.at(x - wy * 0.5, y + wx * 0.5);
  });
  const lv = rankLevels(v, [10, 12, 18, 24, 20, 12, 4]);
  for (let i = 0; i < N; i++) {
    const l = lv[i];
    t.setI(i, LAVA[l]);
    t.emit[i] = LAVA_E[l];
    const crust = l <= 1;
    t.height[i] = crust ? 1 - 0.05 * l : 0.55 + 0.03 * (l - 2);
    t.smooth[i] = crust ? 40 : 150;
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Fuentes de luz
// ---------------------------------------------------------------------------

function torch(t: Tex): void {
  cutoutCanvas(t, 45, 0);
  // Palo en las columnas 7–8, filas 8–15, algo más claro hacia arriba.
  for (let y = 8; y <= 15; y++) {
    const c = mix([92, 64, 36], [146, 108, 64], (15 - y) / 7);
    t.paint(7, y, scale(c, 1.06), 1, 45);
    t.paint(8, y, scale(c, 0.88), 1, 45);
  }
  // Llama (filas 6–7): núcleo blanco-amarillo, emisión máxima.
  t.paint(7, 6, [255, 252, 224], 1, 0, 0, 255);
  t.paint(8, 6, [255, 238, 168], 1, 0, 0, 255);
  t.paint(7, 7, [255, 222, 118], 1, 0, 0, 255);
  t.paint(8, 7, [255, 196, 84], 1, 0, 0, 255);
}

const GLOW: RGB[] = [
  [176, 118, 50],
  [210, 154, 68],
  [236, 192, 96],
  [250, 222, 140],
  [255, 244, 200],
];
const GLOW_E = [70, 130, 190, 230, 255];

function glowstone(t: Tex): void {
  const r = t.rng();
  const sites = scatter(r, 10, 3.4, 0.85, 1.2);
  const bright = sites.map(() => r.range(0.55, 1));
  const px = pixelNoise(r);
  const gap = new Uint8Array(N);
  const solid = new Uint8Array(N);
  const v = new Float32Array(N);
  const d1 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const h = voronoi(sites, (i & 15) + 0.5, (i >> 4) + 0.5);
    d1[i] = h.d1;
    if (h.d2 - h.d1 < 0.75) {
      gap[i] = 1;
      continue;
    }
    solid[i] = 1;
    // Facetas: las caras orientadas arriba-izquierda, más claras.
    const len = Math.hypot(h.dx, h.dy) || 1;
    const facet = 0.75 + 0.25 * ((-h.dx - h.dy) / (len * Math.SQRT2));
    v[i] = bright[h.i1] * facet * (1 - 0.25 * Math.min(1, h.d1 / 3.5)) + 0.08 * px[i];
  }
  const lv = rankLevels(v, [16, 24, 26, 22, 12], solid);
  for (let i = 0; i < N; i++) {
    if (gap[i]) {
      t.setI(i, px[i] < 0.5 ? [96, 64, 34] : [112, 78, 42]);
      t.emit[i] = 10;
      t.height[i] = 0.2;
      t.smooth[i] = 40;
      continue;
    }
    t.setI(i, GLOW[lv[i]]);
    t.emit[i] = GLOW_E[lv[i]];
    t.height[i] = 0.5 + 0.5 * (1 - Math.min(1, d1[i] / 3.5));
    t.smooth[i] = 150 + 10 * lv[i];
  }
  t.f0.fill(12);
  t.depth = 1.5;
}

function seaLantern(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const paneStart = (v: number): number => (v < 5 ? 1 : v < 10 ? 6 : 11);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const border = x === 0 || x === 15 || y === 0 || y === 15;
    const bar = x === 5 || x === 10 || y === 5 || y === 10;
    if (border) {
      const tl = x === 0 || y === 0;
      t.setI(i, shift(tl ? [164, 200, 196] : [138, 174, 172], (px[i] - 0.5) * 6));
      t.emit[i] = 100;
      t.height[i] = 1;
      t.smooth[i] = 100;
      continue;
    }
    if (bar) {
      const cross = (x === 5 || x === 10) && (y === 5 || y === 10);
      t.setI(i, shift(cross ? [184, 218, 214] : [156, 194, 190], (px[i] - 0.5) * 6));
      t.emit[i] = cross ? 150 : 120;
      t.height[i] = 0.92;
      t.smooth[i] = 130;
      continue;
    }
    // Paneles: anillos de luz concéntricos (como luz refractada en agua) y un
    // núcleo más brillante en cada panel.
    const lx = x - paneStart(x);
    const ly = y - paneStart(y);
    const inner = lx > 0 && lx < 3 && ly > 0 && ly < 3;
    const dc = Math.hypot(x - 7.5, y - 7.5);
    const ripple = 0.5 + 0.5 * Math.cos(dc * 1.7);
    let k = 0.25 * ripple + (inner ? 0.35 : 0) + 0.3 * (1 - dc / 10.6);
    if (lx === 0 && ly === 0) k += 0.25; // destello en la esquina de cada panel
    k = clamp(k, 0, 1);
    t.setI(i, mix([188, 230, 226], [246, 255, 253], k));
    t.emit[i] = 190 + 65 * k;
    t.height[i] = inner ? 0.76 : 0.72;
    t.smooth[i] = 215;
  }
  t.f0.fill(12);
  t.depth = 1.0;
}

// ---------------------------------------------------------------------------
// Ladrillos y cristal
// ---------------------------------------------------------------------------

const BRICK: RGB[] = [
  [146, 72, 54],
  [158, 80, 60],
  [136, 64, 50],
  [168, 90, 68],
  [152, 76, 58],
];
const BRICK_MORTAR: RGB[] = [
  [160, 156, 149],
  [170, 166, 158],
  [178, 174, 166],
];

function bricks(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const n8 = new Noise(r, 8);
  const shade: RGB[] = [];
  for (let k = 0; k < 8; k++) shade.push(r.pick(BRICK));
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const row = y >> 2;
    const ry = y & 3;
    const off = row & 1 ? 4 : 0;
    const lx = wrap(x + off) & 7;
    if (ry === 3 || lx === 7) {
      t.setI(i, BRICK_MORTAR[Math.min(2, Math.floor(px[i] * 3))]);
      t.height[i] = 0.2;
      t.smooth[i] = 25;
      continue;
    }
    const id = row * 2 + (wrap(x + off) >> 3);
    const nv = n8.at(x, y);
    let k = nv > 0.66 ? 1.05 : nv < 0.34 ? 0.94 : 1;
    if (px[i] > 0.93) k *= 0.82;
    if (ry === 0) k *= 1.05;
    if (ry === 2) k *= 0.92;
    if (lx === 6) k *= 0.94;
    if (lx === 0) k *= 1.03;
    t.setI(i, scale(shade[id], k));
    t.height[i] = ry === 1 && lx >= 1 && lx <= 5 ? 1 : 0.86;
    t.smooth[i] = 48 + 6 * px[i];
  }
  t.depth = 1.3;
}

function glass(t: Tex): void {
  t.alpha.fill(0);
  t.fillSpec(240, 10, 0, 0);
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (!(x === 0 || y === 0 || x === 15 || y === 15)) continue;
    const tl = y === 0 || x === 0;
    const br = y === 15 || x === 15;
    const c: RGB = tl && !br ? [222, 234, 240] : br && !tl ? [192, 210, 220] : [208, 222, 230];
    t.paint(x, y, shift(c, (px[i] - 0.5) * 6), 1, 235);
  }
  // Dos destellos diagonales cerca de la esquina superior izquierda.
  const glint = (pts: readonly (readonly [number, number])[]): void => {
    pts.forEach(([x, y], k) => {
      const end = k === 0 || k === pts.length - 1;
      t.paint(x, y, end ? [220, 236, 246] : [238, 247, 252], 1, 245);
    });
  };
  glint([
    [2, 5],
    [3, 4],
    [4, 3],
    [5, 2],
  ]);
  glint([
    [4, 7],
    [5, 6],
    [6, 5],
  ]);
}

// ---------------------------------------------------------------------------
// Librería
// ---------------------------------------------------------------------------

const BOOKS: RGB[] = [
  [142, 48, 42],
  [112, 36, 34],
  [48, 66, 128],
  [38, 50, 98],
  [58, 104, 56],
  [44, 82, 46],
  [118, 78, 44],
  [172, 138, 86],
  [176, 142, 58],
  [98, 58, 112],
  [46, 108, 108],
  [110, 110, 116],
];

function bookshelf(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const shelfShadow: RGB = [36, 26, 18];
  // Baldas de roble: filas 0–1, 7–8 y 14–15.
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const topRow = y === 0 || y === 7 || y === 14;
    const lowRow = y === 1 || y === 8 || y === 15;
    if (topRow || lowRow) {
      const c = topRow ? OAK_PLANKS.light : y === 15 ? OAK_PLANKS.dark : OAK_PLANKS.base;
      t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.06));
      t.height[i] = topRow ? 1 : 0.94;
      t.smooth[i] = 58;
      if (lowRow && (x === 5 || x === 12) && y !== 15) t.setI(i, OAK_PLANKS.grain);
    } else {
      t.setI(i, shelfShadow);
      t.height[i] = 0.25;
      t.smooth[i] = 20;
    }
  }
  // Lomos de libros en los dos estantes.
  const shelves = [
    { top: 2, bottom: 6 },
    { top: 9, bottom: 13 },
  ];
  for (const sh of shelves) {
    let x = 0;
    let last = -1;
    while (x < 16) {
      if (r.chance(0.08)) {
        x++; // hueco
        continue;
      }
      const w = Math.min(r.chance(0.3) ? 1 : 2, 16 - x);
      const hgt = r.pick([5, 5, 4, 4, 3]);
      let ci = r.int(0, BOOKS.length - 1);
      if (ci === last) ci = (ci + 5) % BOOKS.length;
      last = ci;
      const col = BOOKS[ci];
      const bookTop = sh.bottom - hgt + 1;
      const band = r.chance(0.6) ? bookTop + 1 : -1;
      for (let bx = 0; bx < w; bx++) {
        for (let y = bookTop; y <= sh.bottom; y++) {
          let c = w === 2 ? (bx === 0 ? scale(col, 1.12) : scale(col, 0.92)) : col;
          if (y === bookTop) c = scale(c, 1.08);
          if (y === band && w === 2) c = mix(c, [206, 176, 96], 0.6);
          const i = idx(x + bx, y);
          t.setI(i, c);
          t.height[i] = 0.8 - (y === bookTop ? 0.04 : 0);
          t.smooth[i] = 55;
        }
      }
      x += w;
    }
  }
  t.depth = 1.3;
}

// ---------------------------------------------------------------------------
// Mesa de trabajo
// ---------------------------------------------------------------------------

function craftingTop(t: Tex): void {
  const r = t.rng();
  const grain = new Noise(r, 4, 16);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    const grid = !frame && (x === 5 || x === 10 || y === 5 || y === 10);
    let c: RGB;
    let h = 1;
    if (frame) {
      c = x === 0 || y === 0 ? [128, 97, 57] : [100, 74, 42];
      h = 1;
    } else if (grid) {
      c = [116, 87, 50];
      h = 0.78;
    } else {
      const g = grain.at(x, y);
      c = g > 0.64 ? OAK_PLANKS.base : g < 0.32 ? [186, 152, 96] : OAK_PLANKS.light;
      h = 0.92;
    }
    t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.04));
    t.height[i] = h;
    t.smooth[i] = frame ? 50 : 62;
  }
  // Escuadras de hierro en las cuatro esquinas.
  for (const [cx, cy, dx, dy] of [
    [0, 0, 1, 1],
    [15, 0, -1, 1],
    [0, 15, 1, -1],
    [15, 15, -1, -1],
  ] as const) {
    for (const [x, y] of [
      [cx, cy],
      [cx + dx, cy],
      [cx, cy + dy],
    ] as const) {
      const i = idx(x, y);
      t.setI(i, x === cx && y === cy ? [168, 170, 176] : [138, 140, 148]);
      t.f0[i] = 230;
      t.smooth[i] = 170;
      t.height[i] = 1.05;
    }
  }
  t.depth = 1.2;
}

/** Laterales de la mesa: canto superior, patas y panel trasero con herramientas colgadas. */
function craftingPanel(t: Tex, tools: readonly string[]): void {
  const r = t.rng();
  const grain = new Noise(r, 4, 16);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    let c: RGB;
    let h: number;
    if (y === 0) {
      c = [178, 144, 90];
      h = 1;
    } else if (y === 1) {
      c = [158, 124, 75];
      h = 1;
    } else if (y === 2) {
      c = [104, 78, 44];
      h = 0.7;
    } else if (x <= 1 || x >= 14) {
      // Patas.
      c = x === 0 || x === 15 ? [112, 84, 48] : [146, 112, 67];
      h = 0.95;
    } else {
      // Panel trasero, algo hundido y más oscuro.
      const g = grain.at(x, y);
      c = g > 0.62 ? [112, 84, 49] : g < 0.34 ? [132, 100, 59] : [122, 92, 54];
      if (y === 15) c = [96, 71, 40];
      h = 0.6;
    }
    t.setI(i, scale(c, 1 + (px[i] - 0.5) * 0.05));
    t.height[i] = h;
    t.smooth[i] = 55;
  }
  const inks: Record<string, Ink> = {
    n: { c: [58, 48, 40], h: 0.9, smooth: 120, f0: 230 },
    h: { c: [160, 110, 62], h: 0.85, smooth: 60 },
    H: { c: [112, 72, 40], h: 0.8, smooth: 55 },
    m: { c: [200, 202, 208], h: 0.9, smooth: 180, f0: 230 },
    M: { c: [146, 148, 156], h: 0.86, smooth: 165, f0: 230 },
    t: { c: [88, 90, 96], h: 0.8, smooth: 140, f0: 230 },
  };
  sprite(t, tools, inks);
  t.depth = 1.3;
}

// Frente: sierra y martillo colgados en horizontal (diseño propio).
const TOOLS_FRONT = [
  '................',
  '................',
  '................',
  '................',
  '.........hHHh...',
  '....mmmmmhnHh...',
  '..mmmmmmMhhhH...',
  '..tMtMtMtM......',
  '................',
  '................',
  '..MMm...........',
  '..MmmhhhhhhhhH..',
  '..MMm.n....n....',
];

// Lateral: hacha de mano y formón.
const TOOLS_SIDE = [
  '................',
  '................',
  '................',
  '.....n....n.....',
  '..MMmhh...hh....',
  '..Mmmhh...hH....',
  '...Mmh....hH....',
  '.....h....HH....',
  '.....h....mM....',
  '.....H....m.....',
  '.....h....m.....',
  '.....H....M.....',
  '.....h....t.....',
];

// ---------------------------------------------------------------------------
// Calabaza y heno
// ---------------------------------------------------------------------------

const PUMPKIN: RGB[] = [
  [160, 78, 16],
  [188, 98, 22],
  [210, 118, 30],
  [226, 138, 42],
  [238, 158, 60],
];

function pumpkinTop(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const dx = x - 7.5;
    const dy = y - 7.5;
    const rr = Math.hypot(dx, dy);
    const lobe = Math.abs(Math.sin(4 * Math.atan2(dy, dx))); // 0 en los 8 surcos
    const rim = smoothstep(5, 8.5, rr);
    const dip = smoothstep(1.5, 3.5, rr);
    let v = (0.35 + 0.55 * lobe) * (1 - 0.4 * rim) * (0.8 + 0.2 * dip);
    v += (px[i] - 0.5) * 0.12;
    const l = clamp(Math.floor(v * 5), 0, 4);
    t.setI(i, PUMPKIN[l]);
    t.height[i] = 0.5 + 0.4 * lobe * (1 - rim) + 0.1 * dip;
    t.smooth[i] = lobe < 0.3 ? 70 : 95;
  }
  sprite(
    t,
    ['.sS.', 'sLsS', 'SsSd', '.Sd.'],
    {
      s: { c: [104, 110, 46], h: 1.25, smooth: 40 },
      S: { c: [82, 86, 34], h: 1.2, smooth: 40 },
      L: { c: [138, 142, 66], h: 1.3, smooth: 45 },
      d: { c: [62, 64, 26], h: 1.1, smooth: 35 },
    },
    6,
    6,
  );
  t.depth = 1.2;
}

export function pumpkinSide(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const nv = new Noise(r, 8, 4);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    // Gajos: surcos en x = 0, 5 y 10 (gajos de 4, 4 y 5 px).
    const start = x >= 10 ? 10 : x >= 5 ? 5 : 0;
    const end = x >= 10 ? 16 : start + 5;
    const vert = 1 - 0.3 * Math.pow(Math.abs(y - 7.5) / 7.5, 2.2); // se oscurece arriba y abajo
    if (x === start) {
      t.setI(i, scale(PUMPKIN[0], 0.9 + 0.1 * vert));
      t.height[i] = 0.3;
      t.smooth[i] = 70;
      continue;
    }
    const p = (x - start - 0.5) / (end - start - 1);
    const prof = Math.sin(Math.PI * clamp(p, 0, 1)); // 0 en los bordes del gajo, 1 en el centro
    const v = (0.3 + 0.66 * prof) * vert + 0.1 * (nv.at(x, y) - 0.5);
    const l = clamp(Math.floor(v * 5 + (px[i] - 0.5) * 0.5), 0, 4);
    t.setI(i, PUMPKIN[l]);
    t.height[i] = 0.45 + 0.5 * prof * vert;
    t.smooth[i] = 95;
  }
  // Motas claras de la piel.
  for (let k = 0; k < 6; k++) {
    const x = r.pick([2, 3, 7, 8, 12, 13]);
    const y = r.int(3, 12);
    t.set(x, y, [242, 172, 82]);
  }
  t.depth = 1.3;
}

const HAY: RGB[] = [
  [160, 124, 34],
  [182, 146, 46],
  [202, 166, 58],
  [218, 184, 74],
  [232, 202, 96],
];

function hayTop(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const n8 = new Noise(r, 8);
  // Espiral de briznas cortadas.
  const v = field((x, y, i) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const sw = Math.hypot(dx, dy) / 2.3 - Math.atan2(dy, dx) / TAU;
    const band = 0.5 + 0.5 * Math.cos(TAU * sw);
    return 0.6 * band + 0.25 * n8.at(x, y) + 0.15 * px[i];
  });
  const lv = rankLevels(v, [12, 22, 30, 24, 12]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    t.setI(i, border ? mix(HAY[lv[i]], [140, 106, 28], 0.55) : HAY[lv[i]]);
    t.height[i] = border ? 0.75 : 0.7 + 0.3 * v[i];
    t.smooth[i] = 40;
    t.sss[i] = 30;
  }
  t.depth = 1.1;
}

function haySide(t: Tex): void {
  const r = t.rng();
  const f1 = new Noise(r, 16, 2);
  const f2 = new Noise(r, 8, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.55 * f1.at(x, y) + 0.3 * f2.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [10, 22, 32, 24, 12]);
  const ROPE: RGB[] = [
    [142, 106, 56],
    [116, 84, 42],
    [86, 60, 30],
  ];
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (y === 3 || y === 4 || y === 11 || y === 12) {
      // Cuerda trenzada.
      const k = mod(x + y, 3);
      t.setI(i, ROPE[k]);
      t.height[i] = 1 - 0.06 * k;
      t.smooth[i] = 30;
      continue;
    }
    const pressed = y === 2 || y === 5 || y === 10 || y === 13;
    t.setI(i, pressed ? scale(HAY[lv[i]], 0.86) : HAY[lv[i]]);
    t.height[i] = (pressed ? 0.7 : 0.8) + 0.12 * v[i];
    t.smooth[i] = 45;
    t.sss[i] = 30;
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Cuarzo, metales y diamante
// ---------------------------------------------------------------------------

const QUARTZ: RGB[] = [
  [226, 220, 212],
  [233, 228, 220],
  [239, 235, 228],
];

function quartz(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.65 * n4.at(x, y) + 0.25 * n8.at(x, y) + 0.1 * px[i]);
  const lv = rankLevels(v, [25, 50, 25]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const ring0 = x === 0 || y === 0 || x === 15 || y === 15;
    t.setI(i, QUARTZ[lv[i]]);
    t.height[i] = ring0 ? 0.9 : 1;
    t.smooth[i] = 150 + 12 * px[i] - (ring0 ? 15 : 0);
    t.f0[i] = 12;
  }
  // Vetas muy tenues.
  for (let k = 0; k < 2; k++) {
    let x = r.int(0, 15);
    let y = r.int(0, 15);
    const len = r.int(8, 10);
    const sx = r.chance(0.5) ? 1 : -1;
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, mix(t.getI(i), [212, 204, 196], 0.6));
      t.smooth[i] = 140;
      if (r.chance(0.6)) x += sx;
      y += 1;
    }
  }
  t.depth = 0.9;
}

export interface PolishStyle {
  base: RGB;
  light: RGB;
  dark: RGB;
  edge: RGB;
  smooth: number;
  f0: number;
}

/** Anillos del bisel: devuelve color y altura del borde, o null en el interior. */
function bevel(st: PolishStyle, x: number, y: number): { c: RGB; h: number; ring: number } | null {
  const ring = Math.min(x, y, 15 - x, 15 - y);
  if (ring === 0) {
    const top = y === 0 || x === 0;
    const bot = y === 15 || x === 15;
    const c = top && bot ? st.base : top ? st.light : st.edge;
    return { c, h: 0.55, ring };
  }
  if (ring === 1) {
    const top = y === 1 || x === 1;
    const bot = y === 14 || x === 14;
    const c = top && bot ? st.base : top ? mix(st.base, st.light, 0.45) : bot ? mix(st.base, st.dark, 0.55) : st.base;
    return { c, h: 0.85, ring };
  }
  return null;
}

export function polished(t: Tex, st: PolishStyle): void {
  const r = t.rng();
  const brush = new Noise(r, 2, 16); // cepillado horizontal
  const n4 = new Noise(r, 4);
  t.f0.fill(st.f0);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const b = bevel(st, x, y);
    if (b) {
      t.setI(i, b.c);
      t.height[i] = b.h;
      t.smooth[i] = st.smooth - (b.ring === 0 ? 20 : 8);
      continue;
    }
    const br = brush.at(x, y);
    let c = scale(st.base, 1 + 0.05 * (br - 0.5) + 0.05 * (n4.at(x, y) - 0.5));
    // Reflejo diagonal suave cerca de la esquina superior izquierda.
    const diag = x + y;
    if (diag >= 7 && diag <= 9) c = mix(c, st.light, 0.3);
    else if (diag === 10) c = mix(c, st.light, 0.12);
    t.setI(i, c);
    t.height[i] = 1;
    t.smooth[i] = st.smooth + 16 * (br - 0.5);
  }
  // Arañazos finos: algo más claros y menos pulidos.
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0],
    [1, 1],
    [1, -1],
    [0, 1],
  ];
  for (let k = 0; k < 5; k++) {
    let x = r.int(3, 12);
    let y = r.int(3, 12);
    const [dx, dy] = r.pick(dirs);
    const len = r.int(2, 4);
    const light = r.chance(0.6);
    for (let s = 0; s < len; s++) {
      if (x < 2 || y < 2 || x > 13 || y > 13) break;
      const i = idx(x, y);
      t.setI(i, mix(t.getI(i), light ? st.light : st.dark, 0.35));
      t.smooth[i] = st.smooth - 25;
      x += dx;
      y += dy;
    }
  }
  t.depth = 1.3;
}

const GOLD_BLOCK: PolishStyle = {
  base: [234, 190, 64],
  light: [252, 226, 120],
  dark: [196, 146, 40],
  edge: [156, 108, 26],
  smooth: 205,
  f0: 231,
};
const IRON_BLOCK: PolishStyle = {
  base: [204, 206, 210],
  light: [232, 234, 238],
  dark: [164, 166, 172],
  edge: [128, 130, 136],
  smooth: 198,
  f0: 230,
};
const DIAMOND_BLOCK: PolishStyle = {
  base: [96, 218, 210],
  light: [176, 248, 242],
  dark: [52, 160, 158],
  edge: [36, 124, 126],
  smooth: 222,
  f0: 45,
};

function diamondBlock(t: Tex): void {
  const st = DIAMOND_BLOCK;
  const r = t.rng();
  const px = pixelNoise(r);
  t.f0.fill(st.f0);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const b = bevel(st, x, y);
    if (b) {
      t.setI(i, b.c);
      t.height[i] = b.h;
      t.smooth[i] = st.smooth - (b.ring === 0 ? 20 : 6);
      continue;
    }
    // Talla: mesa central en rombo y cuatro facetas triangulares alrededor.
    const dx = x - 7.5;
    const dy = y - 7.5;
    const m = Math.abs(dx) + Math.abs(dy);
    let c: RGB;
    let h: number;
    if (m <= 4) {
      c = mix(st.base, st.light, 0.3);
      h = 1;
    } else {
      const k = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1.06 : 0.9) : dy < 0 ? 1.1 : 0.84;
      c = scale(st.base, k);
      h = 1 - 0.045 * (m - 4);
      if (Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.6) c = mix(c, st.light, 0.35); // aristas diagonales
    }
    if (m > 4 && m <= 5) c = mix(c, st.light, 0.45); // arista de la mesa
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = st.smooth + 8 * (px[i] - 0.5);
  }
  for (const [x, y] of [
    [5, 6],
    [6, 5],
  ] as const) {
    t.set(x, y, [226, 255, 252]);
    t.smooth[idx(x, y)] = 240;
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Lanas
// ---------------------------------------------------------------------------

function wool(t: Tex, base: RGB): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => {
    // Punto de tejido: puntadas en «V» en columnas de 2 px, alternadas.
    const k = [0, 1, 1, 0][x & 3];
    const w = ((y + k) & 1) === 0 ? 1 : 0;
    return 0.36 * n4.at(x, y) + 0.22 * n8.at(x, y) + 0.14 * px[i] + 0.28 * w;
  });
  const lv = rankLevels(v, [10, 22, 36, 22, 10]);
  const mult = [0.86, 0.93, 1, 1.05, 1.1];
  const dark = base[0] + base[1] + base[2] < 180;
  for (let i = 0; i < N; i++) {
    let c = scale(base, mult[lv[i]]);
    if (dark) c = shift(c, (lv[i] - 2) * 4);
    t.setI(i, c);
    t.height[i] = 0.72 + 0.07 * lv[i];
    t.smooth[i] = 14 + 6 * px[i];
  }
  t.f0.fill(10);
  t.sss.fill(40);
  t.depth = 0.9;
}

export const MISC_GENERATORS: Record<string, Generator> = {
  water,
  lava,
  torch,
  glowstone,
  sea_lantern: seaLantern,
  bricks,
  glass,
  bookshelf,
  crafting_table_top: craftingTop,
  crafting_table_side: (t) => craftingPanel(t, TOOLS_SIDE),
  crafting_table_front: (t) => craftingPanel(t, TOOLS_FRONT),
  pumpkin_top: pumpkinTop,
  pumpkin_side: pumpkinSide,
  hay_bale_top: hayTop,
  hay_bale_side: haySide,
  quartz_block: quartz,
  gold_block: (t) => polished(t, GOLD_BLOCK),
  iron_block: (t) => polished(t, IRON_BLOCK),
  diamond_block: diamondBlock,
  // copper_block: con sus fases de oxidación en genCopper.ts (fase 6.5).
  white_wool: (t) => wool(t, [226, 228, 226]),
  black_wool: (t) => wool(t, [40, 40, 46]),
  red_wool: (t) => wool(t, [158, 42, 40]),
  orange_wool: (t) => wool(t, [226, 116, 34]),
  yellow_wool: (t) => wool(t, [238, 194, 52]),
  lime_wool: (t) => wool(t, [112, 180, 42]),
  blue_wool: (t) => wool(t, [54, 64, 158]),
  purple_wool: (t) => wool(t, [118, 50, 166]),
};
