// Texturas de las abejas (fase 6): nido de abejas (paja trenzada en anillos, con la entrada oscura y
// miel que gotea cuando está lleno), colmena (tablones con marco de panal y una ranura de entrada),
// bloque de miel (ámbar con un corazón más claro) y bloque de panal (celdas hexagonales).

import { N, Noise, Tex, clamp, idx, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { planks, OAK_PLANKS } from './genWood';

// ---------------------------------------------------------------------------
// Nido de abejas
// ---------------------------------------------------------------------------

const STRAW: RGB[] = [[150, 104, 40], [186, 136, 56], [212, 164, 72], [230, 188, 92], [244, 208, 116]];
const HONEY: RGB = [236, 158, 24];
const HONEY_LIGHT: RGB = [255, 204, 76];
const HONEY_DARK: RGB = [188, 108, 16];

/** Lateral: anillos horizontales de paja trenzada (cada 4 filas una junta oscura). */
function nestSide(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const weave = new Noise(r, 8, 2);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const band = y % 4;
    // Trenzado: las fibras se inclinan alternando de un anillo al siguiente.
    const slant = ((x + (Math.floor(y / 4) & 1 ? y : -y)) & 3) === 0;
    let l = band === 0 ? 0 : band === 3 ? 1 : 2 + Math.round(weave.at(x, y) * 1.4 + px[i] * 0.6);
    if (slant && band !== 0) l = Math.max(1, l - 1);
    t.setI(i, STRAW[clamp(l, 0, 4)]);
    t.height[i] = band === 0 ? 0.3 : 0.7 + 0.3 * weave.at(x, y);
    t.smooth[i] = 50;
  }
  t.depth = 0.9;
}

/** Tapa: anillos concéntricos de paja con un centro más oscuro. */
function nestTop(t: Tex, bottom: boolean): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = Math.floor(d) % 3;
    let l = ring === 0 ? 1 : 2 + Math.round(px[i] * 1.5);
    if (d < 2) l = 0;
    t.setI(i, scale(STRAW[clamp(l, 0, 4)], bottom ? 0.85 : 1));
    t.height[i] = ring === 0 ? 0.4 : 0.8;
    t.smooth[i] = 45;
  }
}

/** Entrada: agujero oscuro de 4×3 algo por debajo del centro. */
function entrance(t: Tex, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const edge = x === x0 || x === x0 + w - 1 || y === y0;
      const i = idx(x, y);
      t.setI(i, edge ? [58, 36, 14] : [26, 16, 8]);
      t.height[i] = 0.05;
      t.smooth[i] = 20;
    }
  }
}

/** Miel que rebosa de la entrada y gotea hacia abajo. */
function honeyDrips(t: Tex, x0: number, y0: number, w: number, h: number, seed: string): void {
  const r = t.rng(seed);
  for (let x = x0 - 1; x <= x0 + w; x++) {
    const top = y0 + h;
    const len = r.int(1, 5);
    for (let k = 0; k < len && top + k < 16; k++) {
      const i = idx(x, top + k);
      const c = k === len - 1 ? HONEY_DARK : k === 0 ? HONEY_LIGHT : HONEY;
      t.setI(i, c);
      t.height[i] = 0.9;
      t.smooth[i] = 200;
    }
  }
  // Borde de miel alrededor del agujero.
  for (let x = x0 - 1; x <= x0 + w; x++) {
    const i = idx(x, y0 - 1);
    t.setI(i, mix(HONEY, HONEY_LIGHT, r.next() * 0.5));
    t.smooth[i] = 200;
  }
}

function nestFront(t: Tex, honey: boolean): void {
  nestSide(t);
  entrance(t, 6, 8, 4, 3);
  if (honey) honeyDrips(t, 6, 8, 4, 3, 'drips');
}

// ---------------------------------------------------------------------------
// Colmena
// ---------------------------------------------------------------------------

/** Celdas de panal (hexágonos aproximados en una retícula desplazada). */
function honeycombCell(x: number, y: number, size: number): { edge: boolean; cx: number; cy: number } {
  const row = Math.floor(y / size);
  const off = row & 1 ? size / 2 : 0;
  const cx = Math.floor((x + off) / size);
  const lx = (x + off) % size, ly = y % size;
  const edge = ly === 0 || lx === 0 || (ly === 1 && (lx === 1 || lx === size - 1));
  return { edge, cx, cy: row };
}

function beehiveEnd(t: Tex): void {
  planks(t, OAK_PLANKS, 'beehive_end');
  // Marco de panal en el centro.
  for (let y = 3; y < 13; y++) {
    for (let x = 3; x < 13; x++) {
      const i = idx(x, y);
      const frame = x === 3 || x === 12 || y === 3 || y === 12;
      if (frame) {
        t.setI(i, [118, 84, 44]);
        t.height[i] = 0.9;
        continue;
      }
      const c = honeycombCell(x, y, 3);
      t.setI(i, c.edge ? [196, 124, 26] : ((c.cx + c.cy) & 1 ? HONEY : HONEY_LIGHT));
      t.height[i] = c.edge ? 0.8 : 0.45;
      t.smooth[i] = c.edge ? 90 : 170;
    }
  }
}

function beehiveSide(t: Tex): void {
  planks(t, OAK_PLANKS, 'beehive_side');
  // Una franja de madera más oscura a media altura (el travesaño de la caja).
  for (let x = 0; x < 16; x++) {
    for (const y of [6, 7]) {
      const i = idx(x, y);
      t.setI(i, scale(t.getI(i), 0.72));
      t.height[i] = y === 6 ? 1 : 0.8;
    }
  }
}

function beehiveFront(t: Tex, honey: boolean): void {
  beehiveSide(t);
  // Ranura de entrada con su repisa.
  for (let x = 4; x < 12; x++) {
    for (let y = 9; y < 11; y++) {
      const i = idx(x, y);
      t.setI(i, y === 9 ? [40, 26, 12] : [22, 14, 6]);
      t.height[i] = 0.05;
    }
    const i = idx(x, 11);
    t.setI(i, [150, 110, 62]);
    t.height[i] = 1;
  }
  if (honey) honeyDrips(t, 4, 9, 8, 3, 'drips');
}

// ---------------------------------------------------------------------------
// Bloques de miel y de panal
// ---------------------------------------------------------------------------

function honeyBlock(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    let c: RGB;
    if (d > 7) c = HONEY_DARK;
    else if (d > 6) c = mix(HONEY, HONEY_DARK, 0.4);
    else if (d < 4) c = mix(HONEY_LIGHT, [255, 226, 130], px[i] * 0.4);
    else c = mix(HONEY, HONEY_LIGHT, 0.3 + px[i] * 0.3);
    // Burbujas brillantes.
    if (d < 6 && px[i] > 0.965) c = [255, 240, 190];
    t.setI(i, c);
    t.height[i] = d > 7 ? 1 : 0.7;
    t.smooth[i] = 215;
    t.sss[i] = 120;
  }
  t.depth = 0.5;
}

function honeycombBlock(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const c = honeycombCell(x, y, 4);
    const fill = (c.cx * 7 + c.cy * 3) % 5 === 0 ? HONEY_LIGHT : HONEY;
    t.setI(i, c.edge ? mix([176, 98, 14], [200, 120, 24], px[i]) : mix(fill, [255, 226, 120], px[i] * 0.35));
    t.height[i] = c.edge ? 1 : 0.35;
    t.smooth[i] = c.edge ? 80 : 180;
  }
}

export const BEE_GENERATORS: Readonly<Record<string, Generator>> = {
  bee_nest_side: nestSide,
  bee_nest_top: (t) => nestTop(t, false),
  bee_nest_bottom: (t) => nestTop(t, true),
  bee_nest_front: (t) => nestFront(t, false),
  bee_nest_front_honey: (t) => nestFront(t, true),
  beehive_end: beehiveEnd,
  beehive_side: beehiveSide,
  beehive_front: (t) => beehiveFront(t, false),
  beehive_front_honey: (t) => beehiveFront(t, true),
  honey_block: honeyBlock,
  honeycomb_block: honeycombBlock,
};
