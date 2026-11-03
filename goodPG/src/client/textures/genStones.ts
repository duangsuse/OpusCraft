// Fase 6.5 (piedras): texturas de las piedras del mundo normal. Piedra lisa (y el lado de su losa),
// piedras pulidas, ladrillos, azulejos, versiones agrietadas y cinceladas, areniscas rojas cortada y
// cincelada, barro, barro compacto, ladrillos de barro, cinabrio y azufre. Casi todas parten del
// dibujo de la piedra de origen (misma paleta) y le añaden el pulido, las juntas o la talla.

import { N, Noise, Tex, clamp, idx, lerp, mix, pixelNoise, scale, type Generator, type RGB } from './texCore';
import { STONE_GENERATORS, speckled, type SpeckStyle } from './genStone';
import { UNDERGROUND_GENERATORS } from './genUnderground';
import { STRUCTURE_GENERATORS } from './genStructures';
import { tintTo } from './genBiomes';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Color medio de la textura. */
function meanColor(t: Tex): RGB {
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < N; i++) {
    r += t.col[i * 3];
    g += t.col[i * 3 + 1];
    b += t.col[i * 3 + 2];
  }
  return [r / N, g / N, b / N];
}

/** Acerca cada píxel al color medio (`k` = cuánto contraste queda) y alisa el relieve. */
export function soften(t: Tex, k: number, smoothAdd: number): void {
  const m = meanColor(t);
  for (let i = 0; i < N; i++) {
    t.setI(i, mix(m, t.getI(i), k));
    t.height[i] = 0.92 + (t.height[i] - 0.9) * 0.25;
    t.smooth[i] = clamp(t.smooth[i] + smoothAdd, 0, 255);
  }
}

/** Bisel de un rectángulo [x0, x1] × [y0, y1]: arriba/izquierda más claro, abajo/derecha más oscuro. */
export function bevel(t: Tex, x0: number, y0: number, x1: number, y1: number, light = 1.1, dark = 0.84): void {
  for (let x = x0; x <= x1; x++) {
    const a = idx(x, y0), b = idx(x, y1);
    t.setI(a, scale(t.getI(a), light));
    t.setI(b, scale(t.getI(b), dark));
    t.height[a] = Math.min(t.height[a], 0.86);
    t.height[b] = Math.min(t.height[b], 0.8);
  }
  for (let y = y0 + 1; y < y1; y++) {
    const a = idx(x0, y), b = idx(x1, y);
    t.setI(a, scale(t.getI(a), light));
    t.setI(b, scale(t.getI(b), dark));
    t.height[a] = Math.min(t.height[a], 0.86);
    t.height[b] = Math.min(t.height[b], 0.8);
  }
}

/** Piedra pulida: el dibujo de la piedra con menos contraste, más lisa y con un bisel en el borde. */
export function polished(base: Generator, k = 0.5): Generator {
  return (t) => {
    base(t);
    soften(t, k, 40);
    bevel(t, 0, 0, 15, 15);
    t.depth = 0.9;
  };
}

export interface BrickOpts {
  /** Alto de cada hilada (la última fila es la junta). */
  courseH: number;
  /** Ancho de cada ladrillo (la última columna es la junta). */
  brickW: number;
  /** Las hiladas alternas van desplazadas medio ladrillo. */
  stagger: boolean;
  /** Oscurecimiento de la junta respecto al color de debajo. */
  seam: number;
  /** Variación de tono entre ladrillos. */
  shade: number;
}

/** Junta de ladrillos o azulejos sobre el dibujo que ya hay (cada pieza, con su tono y su bisel). */
export function brickOverlay(t: Tex, o: BrickOpts): void {
  const r = t.rng('bricks');
  const tone: number[] = [];
  for (let k = 0; k < 64; k++) tone.push(1 + r.range(-o.shade, o.shade));
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const course = Math.floor(y / o.courseH);
    const ly = y % o.courseH;
    const sx = (((x - (o.stagger && course % 2 ? o.brickW / 2 : 0)) % 16) + 16) % 16;
    const lx = sx % o.brickW;
    const brick = course * 8 + Math.floor(sx / o.brickW);
    if (ly === o.courseH - 1 || lx === o.brickW - 1) {
      t.setI(i, scale(t.getI(i), o.seam * (0.94 + 0.12 * px[i])));
      t.height[i] = 0.2;
      t.smooth[i] = 30;
      continue;
    }
    let k = tone[brick % 64];
    if (ly === 0 || lx === 0) k *= 1.08;
    if (ly === o.courseH - 2 || lx === o.brickW - 2) k *= 0.9;
    t.setI(i, scale(t.getI(i), k));
    t.height[i] = ly === 0 || lx === 0 || ly === o.courseH - 2 || lx === o.brickW - 2 ? 0.8 : 0.95;
  }
  t.depth = 1.3;
}

/** Grietas: caminos oscuros y hundidos que bajan en zigzag. */
export function cracks(t: Tex, count: number, dark: number): void {
  const r = t.rng('cracks');
  for (let k = 0; k < count; k++) {
    let x = r.int(0, 15), y = r.int(0, 15);
    const len = r.int(3, 6);
    const dx = r.chance(0.5) ? 1 : -1;
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, scale(t.getI(i), dark));
      t.height[i] = 0.15;
      t.smooth[i] = 25;
      if (r.chance(0.6)) x += dx;
      if (r.chance(0.7)) y += 1;
    }
  }
}

/** Talla: los '#' se hunden y oscurecen; los '+' se levantan y aclaran (centrado en la textura). */
export function carve(t: Tex, rows: readonly string[], dark = 0.72, light = 1.1): void {
  const h = rows.length, w = rows[0].length;
  const ox = Math.floor((16 - w) / 2), oy = Math.floor((16 - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch !== '#' && ch !== '+') continue;
      const i = idx(ox + x, oy + y);
      if (ch === '#') {
        t.setI(i, scale(t.getI(i), dark));
        t.height[i] = 0.35;
        t.smooth[i] = Math.max(20, t.smooth[i] - 30);
      } else {
        t.setI(i, scale(t.getI(i), light));
        t.height[i] = 1;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Piedra lisa y ladrillos de piedra cincelados
// ---------------------------------------------------------------------------

const SMOOTH: RGB[] = [[150, 150, 152], [158, 158, 160], [165, 165, 167], [172, 172, 174]];

function smoothStoneFill(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * n8.at(x, y) + 0.4 * px[i];
    t.setI(i, SMOOTH[clamp(Math.floor(v * 4), 0, 3)]);
    t.height[i] = 0.95 + 0.05 * n8.at(x, y);
    t.smooth[i] = 95 + 10 * px[i];
  }
  t.depth = 0.8;
}

function smoothStone(t: Tex): void {
  smoothStoneFill(t);
  bevel(t, 0, 0, 15, 15, 1.06, 0.82);
}

/** Lado de la losa de piedra lisa: dos mitades con su borde (cada losa enseña una). */
function smoothStoneSlabSide(t: Tex): void {
  smoothStoneFill(t);
  bevel(t, 0, 0, 15, 7, 1.06, 0.8);
  bevel(t, 0, 8, 15, 15, 1.06, 0.8);
}

function chiseledStoneBricks(t: Tex): void {
  STONE_GENERATORS.stone_bricks(t);
  soften(t, 0.6, 10);
  bevel(t, 0, 0, 15, 15, 1.08, 0.7);
  carve(t, [
    '++++++++++++',
    '+##########+',
    '+#++++++++#+',
    '+#+..##..+#+',
    '+#+.#..#.+#+',
    '+#+#....#+#+',
    '+#+#....#+#+',
    '+#+.#..#.+#+',
    '+#+..##..+#+',
    '+#++++++++#+',
    '+##########+',
    '++++++++++++',
  ]);
  t.depth = 1.3;
}

// ---------------------------------------------------------------------------
// Pizarra profunda
// ---------------------------------------------------------------------------

const deepslate = UNDERGROUND_GENERATORS.deepslate;
const polishedDeepslate = polished(deepslate, 0.45);

function deepslateBricks(t: Tex): void {
  polishedDeepslate(t);
  brickOverlay(t, { courseH: 4, brickW: 8, stagger: true, seam: 0.62, shade: 0.07 });
}

function deepslateTiles(t: Tex): void {
  polishedDeepslate(t);
  brickOverlay(t, { courseH: 4, brickW: 4, stagger: false, seam: 0.6, shade: 0.09 });
}

function chiseledDeepslate(t: Tex): void {
  polishedDeepslate(t);
  carve(t, [
    '##############',
    '#++++++++++++#',
    '#+##########+#',
    '#+#++++++++#+#',
    '#+#+######+#+#',
    '#+#+#++++#+#+#',
    '#+#+#+##+#+#+#',
    '#+#+#+##+#+#+#',
    '#+#+#++++#+#+#',
    '#+#+######+#+#',
    '#+#++++++++#+#',
    '#+##########+#',
    '#++++++++++++#',
    '##############',
  ], 0.7, 1.12);
}

// ---------------------------------------------------------------------------
// Toba
// ---------------------------------------------------------------------------

const tuff = UNDERGROUND_GENERATORS.tuff;
const polishedTuff: Generator = (t) => {
  polished(tuff, 0.45)(t);
  bevel(t, 2, 2, 13, 13, 0.9, 1.08); // un marco hundido dentro del borde
};

function tuffBricks(t: Tex): void {
  polished(tuff, 0.55)(t);
  brickOverlay(t, { courseH: 8, brickW: 8, stagger: true, seam: 0.62, shade: 0.06 });
  // Cada ladrillo de toba tiene una raya horizontal en medio.
  for (let x = 0; x < 16; x++) {
    for (const y of [3, 11]) {
      const i = idx(x, y);
      if (t.height[i] > 0.5) t.setI(i, scale(t.getI(i), 0.88));
    }
  }
}

function chiseledTuff(t: Tex): void {
  polished(tuff, 0.5)(t);
  // Tres franjas: lisa arriba y abajo y, en medio, estrías verticales.
  for (let x = 0; x < 16; x++) {
    for (const y of [3, 12]) {
      const i = idx(x, y);
      t.setI(i, scale(t.getI(i), 0.66));
      t.height[i] = 0.3;
    }
    if (x % 3 === 1) {
      for (let y = 5; y <= 10; y++) {
        const i = idx(x, y);
        t.setI(i, scale(t.getI(i), 0.75));
        t.height[i] = 0.45;
      }
    }
  }
}

function chiseledTop(base: Generator): Generator {
  return (t) => {
    base(t);
    bevel(t, 3, 3, 12, 12, 0.8, 1.1);
    bevel(t, 6, 6, 9, 9, 1.1, 0.8);
  };
}

function chiseledTuffBricks(t: Tex): void {
  polished(tuff, 0.55)(t);
  for (let x = 0; x < 16; x++) {
    const i = idx(x, 7);
    t.setI(i, scale(t.getI(i), 0.62));
    t.height[i] = 0.2;
  }
  carve(t, [
    '..####..',
    '.#++++#.',
    '#++##++#',
    '#+#..#+#',
    '#+#..#+#',
    '#++##++#',
    '.#++++#.',
    '..####..',
  ], 0.7, 1.08);
}

// ---------------------------------------------------------------------------
// Areniscas rojas
// ---------------------------------------------------------------------------

const RED_SANDSTONE: RGB = [181, 98, 31];

// ---------------------------------------------------------------------------
// Barro
// ---------------------------------------------------------------------------

const MUD: RGB[] = [[48, 44, 44], [56, 51, 50], [63, 58, 56], [71, 65, 62]];

function mud(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.5 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.2 * px[i];
    const l = clamp(Math.floor(v * 4), 0, 3);
    t.setI(i, MUD[l]);
    t.height[i] = 0.8 + 0.2 * n4.at(x, y);
    // Húmedo: brilla más en los charcos (las partes bajas).
    t.smooth[i] = lerp(150, 90, n4.at(x, y));
  }
  for (let k = 0; k < 10; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [38, 35, 36]);
    t.height[i] -= 0.1;
  }
  t.depth = 0.7;
}

const PACKED: RGB[] = [[128, 94, 70], [138, 102, 76], [146, 109, 81], [155, 117, 87]];

function packedMud(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.55 * n8.at(x, y) + 0.45 * px[i];
    t.setI(i, PACKED[clamp(Math.floor(v * 4), 0, 3)]);
    t.height[i] = 0.9 + 0.1 * n8.at(x, y);
    t.smooth[i] = 45;
  }
  // Briznas de trigo mezcladas con el barro.
  for (let k = 0; k < 9; k++) {
    let x = r.int(0, 15);
    const y = r.int(0, 15);
    const len = r.int(2, 3);
    const c: RGB = r.chance(0.5) ? [186, 156, 98] : [170, 138, 84];
    for (let s = 0; s < len; s++) {
      const i = idx(x, y + (s === len - 1 && r.chance(0.4) ? 1 : 0));
      t.setI(i, c);
      t.height[i] = 1;
      x++;
    }
  }
  t.depth = 0.7;
}

function mudBricks(t: Tex): void {
  packedMud(t);
  soften(t, 0.7, 5);
  brickOverlay(t, { courseH: 4, brickW: 8, stagger: true, seam: 0.72, shade: 0.06 });
}

// ---------------------------------------------------------------------------
// Cinabrio y azufre (cuevas de azufre)
// ---------------------------------------------------------------------------

const CINNABAR: SpeckStyle = {
  base: [[124, 38, 36], [142, 46, 42], [158, 56, 50], [174, 68, 58]],
  weights: [18, 32, 32, 18],
  specks: [
    { cols: [[94, 26, 26], [84, 22, 24]], count: 12, minDist: 2.6, maxSize: 3, dh: -0.07 },
    { cols: [[204, 100, 82], [214, 118, 96]], count: 9, minDist: 2.8, maxSize: 2, dh: 0.05 },
    { cols: [[118, 102, 98]], count: 4, minDist: 4, maxSize: 1, dh: -0.03 },
  ],
  smooth: [50, 72],
  depth: 0.9,
};
const SULFUR: SpeckStyle = {
  base: [[190, 164, 58], [204, 180, 68], [216, 194, 80], [228, 208, 94]],
  weights: [18, 32, 32, 18],
  specks: [
    { cols: [[160, 132, 42], [146, 118, 38]], count: 12, minDist: 2.6, maxSize: 3, dh: -0.07 },
    { cols: [[242, 230, 136], [248, 238, 160]], count: 9, minDist: 2.8, maxSize: 2, dh: 0.05 },
  ],
  smooth: [55, 78],
  depth: 0.9,
};

const GLYPH = [
  '...##...',
  '..#++#..',
  '.#+##+#.',
  '#+#++#+#',
  '#+#++#+#',
  '.#+##+#.',
  '..#++#..',
  '...##...',
];

function mineralFamily(key: string, st: SpeckStyle): Record<string, Generator> {
  const raw: Generator = (t) => speckled(t, st);
  const pol = polished(raw, 0.5);
  return {
    [key]: raw,
    [`polished_${key}`]: pol,
    [`${key}_bricks`]: (t) => {
      pol(t);
      brickOverlay(t, { courseH: 4, brickW: 8, stagger: true, seam: 0.65, shade: 0.06 });
    },
    [`chiseled_${key}`]: (t) => {
      pol(t);
      bevel(t, 1, 1, 14, 14, 0.85, 1.08);
      carve(t, GLYPH);
    },
  };
}

// ---------------------------------------------------------------------------

export const STONES_GENERATORS: Record<string, Generator> = {
  smooth_stone: smoothStone,
  smooth_stone_slab_side: smoothStoneSlabSide,
  chiseled_stone_bricks: chiseledStoneBricks,
  polished_granite: polished(STONE_GENERATORS.granite),
  polished_diorite: polished(STONE_GENERATORS.diorite),
  polished_andesite: polished(STONE_GENERATORS.andesite),
  polished_deepslate: polishedDeepslate,
  deepslate_bricks: deepslateBricks,
  cracked_deepslate_bricks: (t) => {
    deepslateBricks(t);
    cracks(t, 6, 0.55);
  },
  deepslate_tiles: deepslateTiles,
  cracked_deepslate_tiles: (t) => {
    deepslateTiles(t);
    cracks(t, 6, 0.55);
  },
  chiseled_deepslate: chiseledDeepslate,
  polished_tuff: polishedTuff,
  tuff_bricks: tuffBricks,
  chiseled_tuff: chiseledTuff,
  chiseled_tuff_top: chiseledTop(polished(tuff, 0.5)),
  chiseled_tuff_bricks: chiseledTuffBricks,
  chiseled_tuff_bricks_top: chiseledTop(tuffBricks),
  cut_red_sandstone: (t) => {
    STRUCTURE_GENERATORS.cut_sandstone(t);
    tintTo(t, RED_SANDSTONE);
  },
  chiseled_red_sandstone: (t) => {
    STRUCTURE_GENERATORS.chiseled_sandstone(t);
    tintTo(t, RED_SANDSTONE);
  },
  mud,
  packed_mud: packedMud,
  mud_bricks: mudBricks,
  ...mineralFamily('cinnabar', CINNABAR),
  ...mineralFamily('sulfur', SULFUR),
};
