// Fase 6.5 (decoración): texturas de la maceta, el farol, la cadena y los barrotes de hierro, la campana,
// el andamio, la vasija decorada, el marco y los cuadros (arte procedural original).
// Los modelos de cajas toman la UV de la posición (como los cubos), así que cada textura pinta sólo la
// zona que ve su caja: la maceta ocupa las columnas 5–10 y las filas 10–15, el farol las 5–10 y 6–15…

import { N, Rng, Tex, clamp, idx, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { cutoutCanvas, sprite, type Ink } from './genPlants';
import { PAINTINGS, paintingCellTexture, type PaintingVariant } from '../../shared/paintings';

// ---------------------------------------------------------------------------
// Maceta
// ---------------------------------------------------------------------------

const CLAY_POT: RGB[] = [[122, 58, 38], [150, 74, 48], [172, 90, 58], [196, 110, 72]];

/** Lateral: terracota con el borde superior más claro (filas 10–15) y fondo (filas 5–9) para la base. */
function flowerPot(t: Tex): void {
  cutoutCanvas(t, 40, 0);
  const px = pixelNoise(t.rng());
  for (let y = 5; y < 16; y++) {
    for (let x = 5; x <= 10; x++) {
      const i = idx(x, y);
      const rim = y === 10 || y === 11;
      let l = rim ? (y === 10 ? 3 : 2) : 1 + (px[i] > 0.7 ? 1 : 0);
      if (x === 5 && !rim) l = Math.max(0, l - 1);
      if (y === 15) l = 0;
      t.paint(x, y, CLAY_POT[l], rim ? 1 : 0.85, 40);
    }
  }
}

/** Tapa: borde de terracota y dentro un hueco oscuro (vacía) o tierra (con planta). */
function flowerPotTop(soil: boolean): Generator {
  return (t) => {
    cutoutCanvas(t, 40, 0);
    const px = pixelNoise(t.rng());
    for (let y = 5; y <= 10; y++) {
      for (let x = 5; x <= 10; x++) {
        const i = idx(x, y);
        const rim = x === 5 || x === 10 || y === 5 || y === 10;
        if (rim) t.paint(x, y, CLAY_POT[x === 5 || y === 5 ? 3 : 2], 1, 40);
        else if (soil) t.paint(x, y, scale([96, 66, 42], 0.8 + px[i] * 0.4), 0.6, 20);
        else t.paint(x, y, px[i] > 0.5 ? [52, 28, 18] : [44, 24, 14], 0.2, 20);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Farol y cadena
// ---------------------------------------------------------------------------

const IRON_DARK: Ink = { c: [44, 46, 56], f0: 235, smooth: 120 };
const IRON_MID: Ink = { c: [72, 76, 90], f0: 235, smooth: 140 };
const IRON_LIGHT: Ink = { c: [112, 118, 134], f0: 235, smooth: 160 };
const FLAME: Ink = { c: [255, 214, 120], emit: 255, smooth: 200 };
const FLAME_CORE: Ink = { c: [255, 246, 214], emit: 255, smooth: 200 };
const FLAME_EDGE: Ink = { c: [236, 150, 60], emit: 220, smooth: 200 };

function lantern(t: Tex): void {
  cutoutCanvas(t, 120, 0);
  sprite(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '......mlmd......',
    '......mmmd......',
    '.....llllmd.....',
    '.....mmmmmd.....',
    '.....meffed.....',
    '.....mfcofd.....',
    '.....mfccfd.....',
    '.....mefoed.....',
    '.....meeeed.....',
    '.....dddddd.....',
  ], { d: IRON_DARK, m: IRON_MID, l: IRON_LIGHT, f: FLAME, c: FLAME_CORE, e: FLAME_EDGE, o: FLAME });
}

function lanternTop(t: Tex): void {
  cutoutCanvas(t, 120, 0);
  sprite(t, [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....llllll.....',
    '.....lmmmmd.....',
    '.....lmddmd.....',
    '.....lmddmd.....',
    '.....lmmmmd.....',
    '.....dddddd.....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ], { d: IRON_DARK, m: IRON_MID, l: IRON_LIGHT });
}

/** Eslabones en vertical (columnas 6–9): uno de frente (hueco) y otro de canto, cada 4 filas. */
const CHAIN_ROWS = [
  '.......lm.......',
  '......l..d......',
  '......m..d......',
  '.......md.......',
  '.......lm.......',
  '.......md.......',
  '.......md.......',
  '.......md.......',
];

function chainTex(horizontal: boolean): Generator {
  return (t) => {
    cutoutCanvas(t, 130, 0);
    const rows: string[] = [];
    for (let y = 0; y < 16; y++) rows.push(CHAIN_ROWS[y % 8]);
    const inks = { d: IRON_DARK, m: IRON_MID, l: IRON_LIGHT };
    if (!horizontal) sprite(t, rows, inks);
    else {
      // Traspuesta: eslabones en horizontal por las filas 6–9.
      const tr: string[] = [];
      for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) row += rows[x][y];
        tr.push(row);
      }
      sprite(t, tr, inks);
    }
  };
}

function ironBars(t: Tex): void {
  cutoutCanvas(t, 130, 0);
  for (let y = 0; y < 16; y++) {
    for (const x0 of [1, 7, 13]) {
      t.paint(x0, y, IRON_LIGHT.c, 1, 150);
      t.paint(x0 + 1, y, IRON_MID.c, 1, 150);
      t.f0[idx(x0, y)] = 235;
      t.f0[idx(x0 + 1, y)] = 235;
    }
  }
  for (const y of [1, 14]) {
    for (let x = 0; x < 16; x++) {
      const i = t.paint(x, y, y === 1 ? IRON_MID.c : IRON_DARK.c, 0.9, 140);
      t.f0[i] = 235;
    }
  }
}

// ---------------------------------------------------------------------------
// Campana, andamio, vasija y marco
// ---------------------------------------------------------------------------

function bell(t: Tex): void {
  const px = pixelNoise(t.rng());
  const GOLD: RGB[] = [[150, 100, 20], [196, 140, 36], [236, 186, 58], [255, 222, 110], [255, 244, 190]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    // Brillo en diagonal (arriba a la izquierda) y bandas horizontales del molde.
    let l = 2 + (x + y < 12 ? 1 : 0) + (px[i] > 0.85 ? 1 : 0) - (y % 5 === 4 ? 1 : 0);
    if (x + y > 24) l -= 1;
    t.setI(i, GOLD[clamp(l, 0, 4)]);
    t.f0[i] = 240;
    t.smooth[i] = 190;
    t.height[i] = y % 5 === 4 ? 0.7 : 1;
  }
}

const BAMBOO: RGB[] = [[128, 104, 36], [170, 142, 56], [206, 178, 78], [230, 206, 108]];

function scaffoldingSide(t: Tex): void {
  cutoutCanvas(t, 50, 0);
  const put = (x: number, y: number, l: number) => t.paint(x, y, BAMBOO[l], l >= 2 ? 1 : 0.8, 50);
  for (let y = 0; y < 16; y++) {
    put(0, y, 3);
    put(1, y, 1);
    put(14, y, 2);
    put(15, y, 0);
  }
  for (let x = 0; x < 16; x++) {
    put(x, 0, 3);
    put(x, 1, 1);
    put(x, 14, 2);
    put(x, 15, 0);
  }
  // Tirante en diagonal.
  for (let k = 2; k <= 13; k++) {
    put(k, k, 2);
    if (k < 13) put(k + 1, k, 1);
  }
}

function scaffoldingTop(t: Tex): void {
  cutoutCanvas(t, 50, 0);
  const px = pixelNoise(t.rng());
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = x < 2 || x > 13 || y < 2 || y > 13;
      // Tablillas de 2 filas con una rendija entre ellas.
      const slat = y % 4 !== 3;
      if (!edge && !slat) continue;
      const l = edge ? (x === 0 || y === 0 ? 3 : x === 15 || y === 15 ? 0 : 2) : 1 + (px[idx(x, y)] > 0.6 ? 1 : 0);
      t.paint(x, y, BAMBOO[l], edge ? 1 : 0.85, 50);
    }
  }
}

const POT_TC: RGB[] = [[112, 52, 34], [140, 68, 44], [164, 84, 54], [188, 104, 66]];
const POT_DARK: RGB = [70, 34, 24];

/** Lateral de la vasija: labio (filas 0–1), cuello (2) y cuerpo con una greca oscura. */
function decoratedPotSide(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let c: RGB;
    if (y <= 1) c = POT_TC[y === 0 ? 3 : 2];
    else if (y === 2) c = POT_TC[0];
    else {
      c = POT_TC[1 + (px[i] > 0.75 ? 1 : 0)];
      // Greca: una línea arriba y abajo y dientes en medio.
      if (y === 6 || y === 11) c = POT_DARK;
      else if (y >= 7 && y <= 10) {
        const k = (x + 16) % 4;
        const tooth = y <= 8 ? k === 0 || k === 1 : k === 2 || k === 3;
        if (tooth) c = POT_DARK;
      }
      if (y === 15) c = scale(c, 0.8);
    }
    t.setI(i, c);
    t.height[i] = c === POT_DARK ? 0.75 : 1;
    t.smooth[i] = 60;
  }
}

function decoratedPotTop(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const hole = x >= 5 && x <= 10 && y >= 5 && y <= 10;
    t.setI(i, hole ? (px[i] > 0.5 ? [40, 20, 14] : [34, 16, 12]) : POT_TC[2 + (px[i] > 0.8 ? 1 : 0)]);
    t.height[i] = hole ? 0.2 : 1;
    t.smooth[i] = 60;
  }
}

/** Marco: borde de madera de roble y dentro cuero. */
function itemFrame(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.min(x, y, 15 - x, 15 - y);
    let c: RGB;
    if (d <= 1) c = d === 0 ? [96, 66, 36] : x === 1 || y === 1 ? [168, 124, 72] : [126, 90, 50];
    else c = scale([146, 92, 56], 0.88 + px[i] * 0.2);
    t.setI(i, c);
    t.height[i] = d <= 1 ? 1 : 0.6;
    t.smooth[i] = d <= 1 ? 50 : 70;
  }
}

// ---------------------------------------------------------------------------
// Cuadros: se pinta el cuadro entero (w·16 × h·16) y cada textura copia su trozo
// ---------------------------------------------------------------------------

interface Picture {
  w: number;
  h: number;
  px: RGB[];
}

function newPicture(v: PaintingVariant): Picture {
  const w = v.w * 16, h = v.h * 16;
  return { w, h, px: new Array<RGB>(w * h).fill([0, 0, 0]) };
}

function set(p: Picture, x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  p.px[(y | 0) * p.w + (x | 0)] = c;
}

function vgrad(p: Picture, y0: number, y1: number, top: RGB, bottom: RGB): void {
  for (let y = y0; y < y1; y++) {
    const c = mix(top, bottom, (y - y0) / Math.max(1, y1 - y0 - 1));
    for (let x = 0; x < p.w; x++) set(p, x, y, c);
  }
}

function disc(p: Picture, cx: number, cy: number, r: number, c: RGB): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) set(p, x, y, c);
  }
}

function rect(p: Picture, x0: number, y0: number, x1: number, y1: number, c: RGB): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(p, x, y, c);
}

/** Silueta de colinas o montañas: altura por columna (en píxeles desde abajo). */
function ridge(p: Picture, height: (x: number) => number, c: (x: number, y: number) => RGB): void {
  for (let x = 0; x < p.w; x++) {
    const top = Math.round(p.h - height(x));
    for (let y = Math.max(0, top); y < p.h; y++) set(p, x, y, c(x, y));
  }
}

/** Marco de madera de 1 px alrededor del cuadro entero. */
function border(p: Picture): void {
  for (let x = 0; x < p.w; x++) {
    set(p, x, 0, [120, 84, 44]);
    set(p, x, p.h - 1, [84, 56, 28]);
  }
  for (let y = 0; y < p.h; y++) {
    set(p, 0, y, [120, 84, 44]);
    set(p, p.w - 1, y, [84, 56, 28]);
  }
}

type Painter = (p: Picture, r: Rng) => void;

const PAINTERS: Record<string, Painter> = {
  dawn: (p, r) => {
    vgrad(p, 0, 9, [96, 70, 150], [250, 150, 90]);
    vgrad(p, 9, 16, [250, 190, 110], [240, 120, 80]);
    disc(p, 8, 10, 3.2, [255, 236, 150]);
    ridge(p, (x) => 5 + Math.sin(x * 0.7 + 1) * 1.5, () => [58, 84, 60]);
    ridge(p, (x) => 3 + Math.sin(x * 0.9 + 4) * 1.2, () => [36, 58, 44]);
    for (let k = 0; k < 3; k++) set(p, r.int(2, 13), r.int(2, 5), [255, 210, 170]);
  },
  meadow: (p, r) => {
    vgrad(p, 0, 9, [110, 170, 240], [180, 220, 250]);
    rect(p, 3, 3, 6, 4, [250, 250, 255]);
    rect(p, 4, 2, 5, 2, [250, 250, 255]);
    vgrad(p, 9, 16, [110, 180, 70], [70, 130, 50]);
    const petals: RGB[] = [[240, 60, 60], [250, 220, 60], [240, 240, 250], [200, 100, 220]];
    for (let k = 0; k < 14; k++) set(p, r.int(1, 14), r.int(10, 14), r.pick(petals));
  },
  lighthouse: (p, r) => {
    vgrad(p, 0, 10, [20, 30, 70], [60, 70, 120]);
    for (let k = 0; k < 6; k++) set(p, r.int(1, 14), r.int(1, 6), [240, 240, 210]);
    vgrad(p, 10, 16, [30, 60, 110], [16, 30, 60]);
    for (let y = 4; y <= 12; y++) rect(p, 9, y, 10, y, (y >> 1) & 1 ? [220, 60, 50] : [240, 240, 240]);
    rect(p, 8, 13, 11, 13, [70, 70, 80]);
    rect(p, 9, 3, 10, 3, [255, 230, 120]);
    for (let x = 1; x < 9; x++) set(p, x, 3 + Math.floor((9 - x) / 4), [230, 220, 150]);
    for (let x = 1; x < 15; x += 3) set(p, x, 11 + (x & 1), [120, 150, 200]);
  },
  still_life: (p) => {
    vgrad(p, 0, 11, [50, 36, 30], [80, 58, 44]);
    rect(p, 0, 11, 15, 15, [120, 78, 44]);
    rect(p, 0, 11, 15, 11, [150, 100, 58]);
    disc(p, 6, 9.5, 2.6, [200, 30, 30]);
    set(p, 5, 8, [250, 140, 140]);
    set(p, 6, 6, [90, 60, 30]);
    rect(p, 10, 4, 11, 10, [60, 120, 70]);
    rect(p, 10, 3, 11, 3, [140, 100, 60]);
    set(p, 10, 5, [140, 200, 150]);
  },
  mountains: (p, r) => {
    vgrad(p, 0, 16, [90, 140, 220], [200, 220, 240]);
    // Picos en triángulo con nieve en la cima.
    const peaks: [number, number][] = [[4, 10], [12, 14], [21, 11], [28, 13]];
    const height = (x: number) => Math.max(...peaks.map(([px, ph]) => ph - Math.abs(x - px) * 1.15));
    ridge(p, height, (x, y) => (y - (p.h - height(x)) < 2.5 ? [245, 248, 255] : (x + y) % 5 === 0 ? [100, 104, 122] : [124, 128, 146]));
    ridge(p, (x) => 6 + Math.sin(x * 0.33 + 2) * 1.5, () => [70, 110, 80]);
    rect(p, 0, 13, 31, 15, [60, 110, 170]);
    for (let k = 0; k < 8; k++) set(p, r.int(1, 30), r.int(13, 14), [150, 190, 230]);
  },
  river: (p, r) => {
    vgrad(p, 0, 6, [150, 200, 250], [210, 230, 250]);
    rect(p, 0, 6, 31, 15, [96, 160, 70]);
    for (let x = 0; x < p.w; x++) {
      const c = 10 + Math.round(Math.sin(x * 0.35) * 2.5);
      for (let y = c - 1; y <= c + 1; y++) set(p, x, y, y === c - 1 ? [120, 180, 230] : [70, 130, 200]);
    }
    for (let k = 0; k < 5; k++) {
      const tx = r.int(2, 29), ty = r.pick([6, 7, 14]);
      disc(p, tx, ty - 1, 1.6, [40, 100, 50]);
      set(p, tx, ty + 1, [90, 60, 30]);
    }
  },
  cypress: (p, r) => {
    vgrad(p, 0, 32, [40, 60, 140], [240, 190, 90]);
    for (let k = 0; k < 10; k++) {
      const x = r.int(1, 14), y = r.int(1, 16);
      set(p, x, y, [250, 230, 140]);
      set(p, x + 1, y, [220, 200, 120]);
    }
    disc(p, 12, 4, 2, [255, 240, 170]);
    for (let y = 3; y < 30; y++) {
      const half = Math.min(3.5, (y - 2) * 0.28);
      for (let x = Math.round(7 - half); x <= Math.round(7 + half); x++) set(p, x, y, (x + y) % 3 === 0 ? [30, 70, 40] : [20, 50, 30]);
    }
    rect(p, 0, 29, 15, 31, [70, 90, 50]);
  },
  castle: (p, r) => {
    vgrad(p, 0, 32, [12, 14, 40], [50, 50, 100]);
    for (let k = 0; k < 18; k++) set(p, r.int(1, 30), r.int(1, 16), [230, 230, 250]);
    disc(p, 25, 6, 3, [245, 240, 210]);
    disc(p, 26.5, 5, 2.5, [30, 32, 70]);
    ridge(p, (x) => 8 + Math.sin(x * 0.2) * 2, () => [26, 40, 34]);
    const stone: RGB = [96, 96, 116];
    rect(p, 8, 14, 23, 24, stone);
    rect(p, 6, 10, 10, 24, stone);
    rect(p, 21, 10, 25, 24, stone);
    for (let x = 6; x <= 25; x += 2) set(p, x, x < 11 || x > 20 ? 9 : 13, stone);
    rect(p, 14, 19, 17, 24, [30, 22, 18]);
    for (const [wx, wy] of [[8, 13], [23, 13], [11, 17], [20, 17]]) set(p, wx, wy, [255, 210, 110]);
  },
};

const pictures = new Map<string, Picture>();

function picture(v: PaintingVariant): Picture {
  let p = pictures.get(v.key);
  if (!p) {
    p = newPicture(v);
    PAINTERS[v.key]?.(p, new Rng('painting/' + v.key));
    border(p);
    pictures.set(v.key, p);
  }
  return p;
}

function paintingCell(v: PaintingVariant, cx: number, cy: number): Generator {
  return (t) => {
    const p = picture(v);
    const px = pixelNoise(t.rng());
    t.tiling = false;
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const gx = cx * 16 + x, gy = cy * 16 + y;
      const edge = gx === 0 || gy === 0 || gx === p.w - 1 || gy === p.h - 1;
      // Pincelada: un poco de ruido de lienzo.
      t.setI(i, scale(p.px[gy * p.w + gx], edge ? 1 : 0.96 + px[i] * 0.08));
      t.height[i] = edge ? 1 : 0.85 + px[i] * 0.1;
      t.smooth[i] = edge ? 50 : 80;
    }
  };
}

const PAINTING_GENERATORS: Record<string, Generator> = {};
for (const v of PAINTINGS) {
  for (let cy = 0; cy < v.h; cy++) for (let cx = 0; cx < v.w; cx++) PAINTING_GENERATORS[paintingCellTexture(v, cx, cy)] = paintingCell(v, cx, cy);
}

export const DECOR_GENERATORS: Record<string, Generator> = {
  flower_pot: flowerPot,
  flower_pot_top: flowerPotTop(false),
  flower_pot_soil: flowerPotTop(true),
  lantern,
  lantern_top: lanternTop,
  chain: chainTex(false),
  chain_h: chainTex(true),
  iron_bars: ironBars,
  bell,
  scaffolding_top: scaffoldingTop,
  scaffolding_side: scaffoldingSide,
  decorated_pot_side: decoratedPotSide,
  decorated_pot_top: decoratedPotTop,
  item_frame: itemFrame,
  ...PAINTING_GENERATORS,
};
