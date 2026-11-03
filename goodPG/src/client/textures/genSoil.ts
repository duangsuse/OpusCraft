// Generadores de suelos: tierra, hierba, nieve, hielo, arena, grava, arcilla,
// arenisca y terracota.

import {
  N,
  Noise,
  Rng,
  Tex,
  clamp,
  clamp01,
  field,
  gray,
  idx,
  lerp,
  mix,
  pixelNoise,
  rankLevels,
  scale,
  scatter,
  wrap,
  type Generator,
  type RGB,
} from './texCore';
import { cellLayout } from './genStone';

/** Pinta una pepita (guijarro, grano) con luz de arriba-izquierda. */
function pebble(
  t: Tex,
  shape: readonly string[],
  ox: number,
  oy: number,
  light: RGB,
  main: RGB,
  dark: RGB,
  h: number,
  smooth: number,
): void {
  const hh = shape.length;
  const ww = shape[0].length;
  const inside = (sx: number, sy: number): boolean => sy >= 0 && sy < hh && sx >= 0 && sx < ww && shape[sy][sx] === '#';
  for (let sy = 0; sy < hh; sy++) {
    for (let sx = 0; sx < ww; sx++) {
      if (!inside(sx, sy)) continue;
      const l =
        (inside(sx, sy - 1) ? 0 : 1) + (inside(sx - 1, sy) ? 0 : 1) - (inside(sx, sy + 1) ? 0 : 1) - (inside(sx + 1, sy) ? 0 : 1);
      const i = idx(ox + sx, oy + sy);
      t.setI(i, l >= 1 ? light : l <= -1 ? dark : main);
      t.height[i] = h + (l >= 1 ? 0.03 : l <= -1 ? -0.03 : 0);
      t.smooth[i] = smooth;
    }
  }
}

// ---------------------------------------------------------------------------
// Tierra
// ---------------------------------------------------------------------------

const DIRT: RGB[] = [
  [104, 73, 49],
  [119, 85, 59],
  [133, 96, 67],
  [148, 108, 77],
];

/** Tierra base: la comparten dirt, grass_side y grass_side_snowy (mismo patrón). */
export function dirtBase(t: Tex): void {
  const r = new Rng('dirt:base');
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.46 * n4.at(x, y) + 0.32 * n8.at(x, y) + 0.22 * px[i]);
  const lv = rankLevels(v, [14, 30, 34, 22]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, DIRT[lv[i]]);
    t.height[i] = 0.7 + 0.06 * lv[i] + 0.08 * n8.at(x, y);
    t.smooth[i] = 12 + 8 * px[i];
  }
  // Guijarros claros en relieve y hoyitos oscuros.
  const pr = new Rng('dirt:pebbles');
  const sites = scatter(pr, 14, 3.0);
  sites.forEach((s, k) => {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (k % 3 === 2) {
      let i = idx(x, y);
      t.setI(i, [88, 61, 41]);
      t.height[i] = 0.5;
      if (pr.chance(0.5)) {
        i = idx(x + 1, y);
        t.setI(i, [101, 71, 49]);
        t.height[i] = 0.56;
      }
    } else {
      const shape = pr.pick([['#'], ['##'], ['#', '#'], ['##', '#.'], ['##']]);
      pebble(t, shape, x, y, [190, 152, 114], [166, 128, 93], [138, 103, 74], 1, 30);
    }
  });
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Hierba
// ---------------------------------------------------------------------------

const GRASS_G = [116, 136, 154, 172, 192, 212];

export function grassTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.42 * n4.at(x, y) + 0.33 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [6, 14, 24, 26, 18, 12]);
  for (let i = 0; i < N; i++) {
    t.setI(i, gray(GRASS_G[lv[i]]));
    t.height[i] = 0.6 + 0.3 * (lv[i] / 5);
    t.smooth[i] = 38 + 3 * lv[i];
    t.sss[i] = 30;
  }
  // Briznas: trazos cortos claros y motas oscuras entre ellas.
  const dirs: readonly (readonly [number, number])[] = [
    [0, 1],
    [1, 1],
    [-1, 1],
    [1, 0],
  ];
  for (let k = 0; k < 22; k++) {
    let x = r.int(0, 15);
    let y = r.int(0, 15);
    const [dx, dy] = r.pick(dirs);
    const g = r.range(204, 226);
    for (let s = 0; s < 2; s++) {
      const i = idx(x, y);
      t.setI(i, gray(g - s * 10));
      t.height[i] = 1;
      t.smooth[i] = 55;
      t.sss[i] = 40;
      x += dx;
      y += dy;
    }
  }
  for (let k = 0; k < 16; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, gray(r.range(112, 122)));
    t.height[i] = 0.45;
  }
  t.depth = 1.0;
}

/** Profundidad irregular (en filas) de un borde que cuelga desde arriba. */
export function fringeDepths(r: Rng, base: readonly number[], drips: number, dripMin: number, dripMax: number): number[] {
  const d: number[] = [];
  for (let x = 0; x < 16; x++) d.push(r.pick(base));
  for (let k = 0; k < drips; k++) {
    const x = r.int(0, 15);
    d[x] = r.int(dripMin, dripMax);
    if (r.chance(0.4)) d[wrap(x + 1)] = Math.max(d[wrap(x + 1)], d[x] - 1);
  }
  return d;
}

function grassSide(t: Tex): void {
  dirtBase(t);
  t.alpha.fill(0); // tierra: sin tinte (alpha 0 = máscara apagada)
  const r = t.rng('fringe');
  const depth = fringeDepths(r, [1, 2, 2, 2, 3], 4, 3, 4);
  const n = new Noise(r, 8);
  for (let x = 0; x < 16; x++) {
    const dep = depth[x];
    for (let y = 0; y < dep; y++) {
      const tip = y === dep - 1 && dep >= 2;
      let g = y === 0 ? 198 : 178;
      if (tip) g -= 26;
      g += (n.at(x, y) - 0.5) * 30;
      const i = idx(x, y);
      t.setI(i, gray(g));
      t.alpha[i] = 255;
      t.height[i] = 1 - 0.03 * y;
      t.smooth[i] = 40;
      t.sss[i] = 40;
    }
    // Sombra de la hierba sobre la tierra.
    const i = idx(x, dep);
    t.setI(i, scale(t.getI(i), 0.76));
    t.height[i] = 0.6;
  }
}

function grassSideSnowy(t: Tex): void {
  dirtBase(t);
  const r = t.rng('snowcap');
  const depth = fringeDepths(r, [3, 3, 4, 4], 3, 5, 5);
  const n = new Noise(r, 8);
  for (let x = 0; x < 16; x++) {
    const dep = depth[x];
    for (let y = 0; y < dep; y++) {
      const tip = y === dep - 1;
      let c: RGB = y === 0 ? [246, 249, 252] : y === 1 ? [239, 244, 250] : [231, 237, 247];
      if (tip) c = [213, 223, 238];
      c = scale(c, 1 + (n.at(x, y) - 0.5) * 0.03);
      const i = idx(x, y);
      t.setI(i, c);
      t.height[i] = 1 - 0.02 * y;
      t.smooth[i] = 84;
      t.sss[i] = 120;
    }
    const i = idx(x, dep);
    t.setI(i, scale(t.getI(i), 0.78));
    t.height[i] = 0.62;
  }
}

// ---------------------------------------------------------------------------
// Nieve y hielo
// ---------------------------------------------------------------------------

const SNOW: RGB[] = [
  [224, 231, 241],
  [233, 239, 246],
  [241, 245, 250],
  [248, 250, 253],
];

function snow(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.55 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [10, 28, 40, 22]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, SNOW[lv[i]]);
    t.height[i] = 0.75 + 0.25 * n4.at(x, y);
    t.smooth[i] = 70 + 6 * lv[i];
    t.sss[i] = 120;
  }
  // Destellos de cristales de hielo.
  for (let k = 0; k < 5; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [253, 254, 255]);
    t.smooth[i] = 180;
  }
  t.depth = 0.9;
}

const ICE: RGB[] = [
  [128, 168, 220],
  [142, 182, 230],
  [156, 195, 237],
  [172, 207, 242],
];
const ICE_A = [184, 174, 166, 160];

export function ice(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const v = field((x, y) => 0.6 * n4.at(x, y) + 0.4 * n8.at(x, y));
  const lv = rankLevels(v, [15, 35, 35, 15]);
  for (let i = 0; i < N; i++) {
    t.setI(i, ICE[lv[i]]);
    t.alpha[i] = ICE_A[lv[i]];
    t.height[i] = 1;
    t.smooth[i] = 230;
  }
  t.f0.fill(5);
  t.sss.fill(80);
  // Vetas claras diagonales.
  for (let k = 0; k < 3; k++) {
    let x = r.int(0, 15);
    let y = r.int(0, 15);
    const len = r.int(4, 7);
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, mix([192, 220, 246], [206, 229, 249], s / len));
      t.alpha[i] = 186;
      t.smooth[i] = 236;
      x += 1;
      y -= 1;
    }
  }
  // Grietas blanquecinas con alguna ramificación.
  const crackWalk = (x: number, y: number, len: number, sx: number): void => {
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, [214, 234, 252]);
      t.alpha[i] = 200;
      t.height[i] = 0.72;
      t.smooth[i] = 150;
      const m = r.next();
      if (m < 0.5) {
        x += sx;
        y += 1;
      } else if (m < 0.8) y += 1;
      else x += sx;
    }
  };
  crackWalk(3, 2, 7, 1);
  crackWalk(6, 6, 3, -1);
  crackWalk(12, 9, 6, -1);
  t.depth = 0.8;
}

// ---------------------------------------------------------------------------
// Arena, grava y arcilla
// ---------------------------------------------------------------------------

const SAND: RGB[] = [
  [206, 191, 146],
  [214, 200, 155],
  [221, 208, 163],
  [228, 216, 172],
];

export function sand(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.4 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [14, 32, 34, 20]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, SAND[lv[i]]);
    t.height[i] = 0.8 + 0.2 * n8.at(x, y);
    t.smooth[i] = 28 + 6 * px[i];
  }
  // Granos sueltos: algunos oscuros hundidos y otros claros que brillan un poco.
  for (let k = 0; k < 14; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [196, 178, 134]);
    t.height[i] -= 0.1;
  }
  for (let k = 0; k < 12; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [236, 227, 192]);
    t.height[i] += 0.1;
    t.smooth[i] = 60;
  }
  t.depth = 0.8;
}

const PEBBLES: RGB[] = [
  [116, 113, 111],
  [132, 129, 127],
  [148, 145, 143],
  [164, 161, 158],
  [126, 110, 98],
  [142, 125, 110],
  [170, 158, 142],
  [104, 101, 100],
];

function gravel(t: Tex): void {
  const L = cellLayout('gravel:layout', 18, 3.0, 0.85, 0.8, 1.2);
  const r = t.rng();
  const px = pixelNoise(r);
  const cols: RGB[] = [];
  const sm: number[] = [];
  for (let k = 0; k < 64; k++) {
    cols.push(r.pick(PEBBLES));
    sm.push(r.range(30, 55));
  }
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (L.gap[i]) {
      t.setI(i, px[i] < 0.5 ? [64, 60, 58] : [72, 68, 66]);
      t.height[i] = 0.15;
      t.smooth[i] = 20;
      continue;
    }
    const c = L.cell[i];
    const d = L.dist[i];
    const up = L.gap[idx(x, y - 1)] || L.gap[idx(x - 1, y)] || L.cell[idx(x, y - 1)] !== c;
    const down = L.gap[idx(x, y + 1)] || L.gap[idx(x + 1, y)] || L.cell[idx(x, y + 1)] !== c;
    let k = d <= 1 ? 0.92 : 1.02;
    if (up && !down) k = 1.1;
    if (down && !up) k = 0.86;
    t.setI(i, scale(cols[c], k));
    t.height[i] = 0.35 + 0.65 * Math.sqrt(clamp01((d - 0.4) / 2));
    t.smooth[i] = sm[c];
  }
  t.depth = 1.5;
}

const CLAY: RGB[] = [
  [150, 156, 171],
  [158, 164, 178],
  [165, 171, 185],
  [172, 178, 191],
];

function clay(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.6 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.1 * px[i]);
  const lv = rankLevels(v, [12, 36, 36, 16]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, CLAY[lv[i]]);
    t.height[i] = 0.85 + 0.15 * n4.at(x, y);
    t.smooth[i] = 50 + 10 * px[i];
  }
  for (let k = 0; k < 8; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [140, 145, 160]);
    t.height[i] -= 0.08;
  }
  t.depth = 0.6;
}

// ---------------------------------------------------------------------------
// Arenisca y terracota
// ---------------------------------------------------------------------------

const SST: RGB[] = [
  [196, 181, 132],
  [206, 192, 143],
  [214, 201, 152],
  [221, 209, 161],
  [228, 217, 171],
];

export function sandstoneTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.6 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.1 * px[i]);
  const lv = rankLevels(v, [10, 30, 40, 20]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, SST[lv[i] + 1]);
    t.height[i] = 0.9 + 0.1 * n4.at(x, y);
    t.smooth[i] = 45 + 6 * px[i];
  }
  t.depth = 0.5;
}

export function sandstoneSide(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const phase = r.range(0, Math.PI * 2);
  const strata = [2, 3, 2, 1, 2, 3, 3, 1];
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const nv = n8.at(x, y);
    let c: RGB;
    let h: number;
    let sm = 42;
    if (y <= 2) {
      // Banda superior lisa.
      c = SST[y === 0 ? 4 : nv > 0.55 ? 4 : 3];
      h = 1;
      sm = 48;
    } else if (y === 3 || y === 12) {
      // Surcos entre bandas.
      c = y === 3 ? [184, 168, 120] : [190, 174, 126];
      h = 0.55;
      sm = 30;
    } else if (y <= 11) {
      // Estratos ondulados del centro.
      const wave = Math.round(Math.sin(((x + 0.5) / 16) * Math.PI * 2 + phase) * 0.8);
      const s = strata[clamp(y - 4 + wave, 0, 7)];
      const lv = clamp(s + (px[i] > 0.85 ? 1 : px[i] < 0.12 ? -1 : 0), 0, 4);
      c = SST[lv];
      h = 0.84 + 0.03 * lv;
      if (px[i] > 0.95) {
        c = [184, 167, 120];
        h -= 0.06;
      }
    } else {
      // Banda inferior áspera.
      const lv = clamp(Math.floor(nv * 3.2 + px[i] * 0.8), 0, 3);
      c = SST[lv];
      h = 0.78 + 0.1 * nv;
      sm = 34;
      if (px[i] > 0.9) {
        c = [180, 163, 116];
        h -= 0.1;
      }
    }
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = sm;
  }
  t.depth = 1.1;
}

export function sandstoneBottom(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.45 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [12, 24, 30, 22, 12]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, SST[lv[i]]);
    t.height[i] = 0.75 + 0.25 * n8.at(x, y);
    t.smooth[i] = 30;
  }
  for (let k = 0; k < 12; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [182, 165, 118]);
    t.height[i] -= 0.18;
    t.smooth[i] = 22;
  }
  t.depth = 1.1;
}

const TERRACOTTA: RGB[] = [
  [137, 82, 59],
  [145, 89, 64],
  [153, 95, 69],
  [161, 102, 75],
];

export function terracotta(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [14, 36, 36, 14]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, TERRACOTTA[lv[i]]);
    t.height[i] = 0.88 + 0.12 * n4.at(x, y);
    t.smooth[i] = lerp(42, 50, px[i]);
  }
  // Motas de desgrasante algo más oscuras.
  for (let k = 0; k < 7; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [128, 76, 55]);
    t.height[i] -= 0.08;
  }
  t.depth = 0.6;
}

export const SOIL_GENERATORS: Record<string, Generator> = {
  dirt: dirtBase,
  grass_top: grassTop,
  grass_side: grassSide,
  grass_side_snowy: grassSideSnowy,
  snow,
  ice,
  sand,
  gravel,
  clay,
  sandstone_top: sandstoneTop,
  sandstone_side: sandstoneSide,
  sandstone_bottom: sandstoneBottom,
  terracotta,
};
