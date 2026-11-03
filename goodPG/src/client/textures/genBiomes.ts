// Texturas de los biomas de la fase 5: las cuatro maderas nuevas (jungla, acacia, roble oscuro y
// cerezo) con sus troncos, tablones, hojas, brotes, puertas y trampillas; y los bloques y plantas
// de los biomas nuevos (micelio, champiñones gigantes, arena roja, terracotas de colores, hielo
// compacto, enredaderas, nenúfar, flores y pétalos rosas).
//
// Las maderas reutilizan los generadores de genWood/genBuilding/genSurvival con paletas propias;
// las variantes de color (arena roja, terracotas) recolorean el generador original conservando su
// luminosidad, así casan con los bloques que ya existen.

import { N, Noise, Tex, clamp, field, gray, idx, luma, mix, pixelNoise, rankLevels, scale, type Generator, type RGB } from './texCore';
import { barkSide, logTop, leaves, planks, type BarkStyle, type LogTopStyle, type LeafStyle, type PlankStyle } from './genWood';
import { door, drawPlan, wood, OAK_DOOR, BIRCH_DOOR, SPRUCE_DOOR, OAK_TRAPDOOR, BIRCH_TRAPDOOR, SPRUCE_TRAPDOOR } from './genBuilding';
import { sapling, OAK_SAPLING } from './genSurvival';
import { sand, sandstoneTop, sandstoneSide, sandstoneBottom, terracotta, ice, fringeDepths } from './genSoil';
import { dirtBase } from './genSoil';
import { cutoutCanvas, sprite, type Ink } from './genPlants';

// ---------------------------------------------------------------------------
// Recolor conservando la luminosidad
// ---------------------------------------------------------------------------

/** Lleva el color medio de la textura a `base` sin cambiar su dibujo (claros y oscuros relativos). */
export function tintTo(t: Tex, base: RGB): void {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < N; i++) {
    if (t.alpha[i] === 0) continue;
    sum += luma(t.getI(i));
    n++;
  }
  const mean = Math.max(1, sum / Math.max(1, n));
  for (let i = 0; i < N; i++) {
    const k = luma(t.getI(i)) / mean;
    t.setI(i, [clamp(base[0] * k, 0, 255), clamp(base[1] * k, 0, 255), clamp(base[2] * k, 0, 255)]);
  }
}

// ---------------------------------------------------------------------------
// Maderas
// ---------------------------------------------------------------------------

interface WoodStyle {
  bark: BarkStyle;
  top: LogTopStyle;
  planks: PlankStyle;
  leaves: LeafStyle;
  /** Hojas del brote (claro → oscuro) y tallo. */
  sapLeaves: RGB[];
  sapStem: Record<string, Ink>;
  sapRows: readonly string[];
  door: readonly string[];
  trapdoor: readonly string[];
  frame: number;
}

const barkStyle = (pal: RGB[], grooves: number, cracks: number): BarkStyle => ({ pal, grooves, wobble: 1, cracks, smooth: 28 });
const plankStyle = (light: RGB, base: RGB, dark: RGB, grain: RGB, seam: RGB, joint: RGB): PlankStyle => ({
  light, base, dark, grain, seam, joint, smooth: 58,
});
const grayLeaves = (holeFrac: number, lo: number): LeafStyle => ({
  pal: [gray(lo), gray(lo + 20), gray(lo + 40), gray(lo + 61), gray(lo + 84), gray(lo + 106)],
  weights: [8, 16, 26, 24, 16, 10],
  holeFrac,
  needles: false,
});
const stem = (a: RGB, b: RGB): Record<string, Ink> => ({
  s: { c: a, h: 0.85, smooth: 40, sss: 90 },
  S: { c: b, h: 0.8, smooth: 40, sss: 90 },
});

const JUNGLE_BARK = barkStyle([[58, 46, 22], [78, 62, 30], [96, 78, 38], [112, 92, 48], [126, 106, 58]], 5, 12);
const ACACIA_BARK = barkStyle([[70, 66, 58], [88, 83, 74], [104, 98, 88], [118, 112, 101], [132, 126, 114]], 3, 8);
const DARK_OAK_BARK = barkStyle([[34, 25, 14], [46, 34, 19], [58, 43, 25], [69, 52, 31], [80, 61, 37]], 4, 8);
const CHERRY_BARK = barkStyle([[40, 26, 30], [54, 36, 40], [68, 46, 50], [80, 56, 60], [92, 66, 70]], 6, 10);

const WOODS: Record<string, WoodStyle> = {
  jungle: {
    bark: JUNGLE_BARK,
    top: { bark: JUNGLE_BARK.pal.slice(0, 3), wood: [[126, 88, 60], [150, 106, 74], [168, 122, 86], [182, 134, 96]], spacing: 1.8 },
    planks: plankStyle([172, 124, 90], [160, 115, 80], [148, 105, 72], [130, 92, 62], [92, 64, 42], [112, 78, 52]),
    leaves: grayLeaves(0.24, 104),
    sapLeaves: [[132, 196, 70], [98, 164, 50], [70, 132, 36], [50, 102, 26], [36, 78, 20]],
    sapStem: stem([118, 90, 48], [84, 64, 34]),
    sapRows: OAK_SAPLING,
    door: BIRCH_DOOR,
    trapdoor: BIRCH_TRAPDOOR,
    frame: 0.45,
  },
  acacia: {
    bark: ACACIA_BARK,
    top: { bark: ACACIA_BARK.pal.slice(0, 3), wood: [[150, 72, 36], [172, 86, 44], [190, 100, 52], [204, 112, 60]], spacing: 2 },
    planks: plankStyle([194, 108, 58], [178, 96, 50], [164, 86, 44], [146, 74, 36], [104, 50, 24], [128, 62, 30]),
    leaves: grayLeaves(0.32, 110),
    sapLeaves: [[168, 190, 84], [136, 160, 60], [108, 130, 44], [82, 102, 32], [60, 78, 24]],
    sapStem: stem([120, 116, 104], [86, 82, 72]),
    sapRows: OAK_SAPLING,
    door: OAK_DOOR,
    trapdoor: OAK_TRAPDOOR,
    frame: 0.4,
  },
  dark_oak: {
    bark: DARK_OAK_BARK,
    top: { bark: DARK_OAK_BARK.pal.slice(0, 3), wood: [[58, 40, 20], [72, 50, 26], [86, 61, 33], [98, 71, 39]], spacing: 1.7 },
    planks: plankStyle([82, 58, 31], [72, 50, 27], [64, 44, 23], [56, 38, 20], [34, 23, 11], [44, 31, 15]),
    leaves: grayLeaves(0.26, 96),
    sapLeaves: [[110, 158, 64], [80, 126, 46], [58, 98, 34], [42, 74, 24], [30, 54, 18]],
    sapStem: stem([72, 52, 30], [46, 32, 18]),
    sapRows: OAK_SAPLING,
    door: SPRUCE_DOOR,
    trapdoor: SPRUCE_TRAPDOOR,
    frame: 0.3,
  },
  cherry: {
    bark: CHERRY_BARK,
    top: { bark: CHERRY_BARK.pal.slice(0, 3), wood: [[170, 110, 108], [196, 134, 128], [216, 154, 146], [228, 170, 160]], spacing: 1.9 },
    planks: plankStyle([234, 198, 188], [224, 184, 174], [214, 172, 162], [200, 156, 146], [158, 110, 102], [184, 136, 128]),
    leaves: {
      pal: [[186, 96, 140], [206, 120, 160], [222, 142, 178], [236, 164, 196], [246, 188, 212], [252, 208, 226]],
      weights: [8, 16, 26, 24, 16, 10],
      holeFrac: 0.28,
      needles: false,
    },
    sapLeaves: [[250, 200, 222], [238, 170, 200], [222, 142, 178], [196, 110, 150], [160, 82, 120]],
    sapStem: stem([96, 66, 70], [66, 44, 48]),
    sapRows: OAK_SAPLING,
    door: OAK_DOOR,
    trapdoor: OAK_TRAPDOOR,
    frame: 0.5,
  },
};

// ---------------------------------------------------------------------------
// Micelio y champiñones gigantes
// ---------------------------------------------------------------------------

const MYC: RGB[] = [[96, 82, 96], [110, 94, 108], [122, 106, 120], [136, 120, 134], [152, 138, 150]];

function myceliumTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.4 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.3 * px[i]);
  const lv = rankLevels(v, [10, 22, 30, 24, 14]);
  for (let i = 0; i < N; i++) {
    t.setI(i, MYC[lv[i]]);
    t.height[i] = 0.6 + 0.08 * lv[i];
    t.smooth[i] = 36 + 4 * lv[i];
  }
  // Motas claras (esporas) y grises.
  for (let k = 0; k < 18; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, r.chance(0.6) ? [186, 170, 184] : [132, 128, 136]);
    t.height[i] = 0.95;
  }
  t.depth = 0.9;
}

function myceliumSide(t: Tex): void {
  dirtBase(t);
  t.alpha.fill(255);
  const r = t.rng('fringe');
  const depth = fringeDepths(r, [2, 2, 3, 3], 3, 4, 5);
  const n = new Noise(r, 8);
  for (let x = 0; x < 16; x++) {
    const dep = depth[x];
    for (let y = 0; y < dep; y++) {
      const i = idx(x, y);
      t.setI(i, MYC[clamp(Math.floor(n.at(x, y) * 4.5) - (y === dep - 1 ? 1 : 0), 0, 4)]);
      t.height[i] = 1 - 0.03 * y;
      t.smooth[i] = 40;
    }
    const i = idx(x, dep);
    t.setI(i, scale(t.getI(i), 0.78));
  }
}

function mushroomCap(t: Tex, base: RGB, spots: boolean): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const k = 0.86 + 0.2 * n4.at(x, y) + 0.06 * px[i];
    t.setI(i, scale(base, k));
    t.height[i] = 0.8 + 0.2 * n4.at(x, y);
    t.smooth[i] = spots ? 90 : 50;
  }
  if (spots) {
    // Manchas blancas de 2-3 píxeles, bien repartidas.
    for (let k = 0; k < 7; k++) {
      const x0 = r.int(0, 15), y0 = r.int(0, 15);
      const w = r.int(2, 3), h = r.int(2, 3);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if ((dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1) && r.chance(0.5)) continue;
          const i = idx(x0 + dx, y0 + dy);
          t.setI(i, mix([232, 226, 218], [204, 196, 188], r.next()));
          t.height[i] = 1;
          t.smooth[i] = 70;
        }
      }
    }
  } else {
    for (let k = 0; k < 30; k++) {
      const i = idx(r.int(0, 15), r.int(0, 15));
      t.setI(i, scale(base, r.chance(0.5) ? 1.18 : 0.78));
    }
  }
  t.depth = 0.9;
}

function mushroomStem(t: Tex): void {
  const r = t.rng();
  const fib = new Noise(r, 16, 2);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const v = fib.at(x, y);
    t.setI(i, mix([196, 188, 170], [226, 220, 206], v * 0.8 + px[i] * 0.2));
    t.height[i] = 0.7 + 0.3 * v;
    t.smooth[i] = 60;
  }
  t.depth = 0.8;
}

function mushroomInside(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, mix([200, 164, 128], [222, 188, 150], n8.at(x, y)));
    t.height[i] = 0.9;
    t.smooth[i] = 50;
  }
  // Poros.
  for (let k = 0; k < 26; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, [170, 132, 98]);
    t.height[i] = 0.5;
  }
  t.depth = 0.7;
}

// ---------------------------------------------------------------------------
// Hielo compacto
// ---------------------------------------------------------------------------

function packedIce(t: Tex): void {
  ice(t);
  t.alpha.fill(255);
  for (let i = 0; i < N; i++) t.setI(i, mix(t.getI(i), [120, 160, 226], 0.35));
  t.sss.fill(40);
}

// ---------------------------------------------------------------------------
// Plantas
// ---------------------------------------------------------------------------

const G: Record<string, Ink> = {
  g: { c: [92, 146, 56], h: 0.8 },
  G: { c: [66, 112, 40], h: 0.75 },
  l: { c: [98, 158, 62], h: 0.85 },
  L: { c: [70, 122, 44], h: 0.8 },
};

const FLOWER_SPRITES: Record<string, { rows: string[]; inks: Record<string, Ink> }> = {
  blue_orchid: {
    rows: [
      '................',
      '................',
      '................',
      '.....b.....b....',
      '....bBb...bBb...',
      '...bBwBb.bBwBb..',
      '....bBb...bBb...',
      '.....bg.b..gb...',
      '......g.BbgG....',
      '......gGBwBG....',
      '.......GbBgl....',
      '...l...gG.lL....',
      '...Ll..gGlL.....',
      '....Ll.gG.......',
      '.....LlgG.......',
      '.......gG.......',
    ],
    inks: { ...G, b: { c: [66, 164, 222] }, B: { c: [36, 120, 196] }, w: { c: [206, 236, 250] } },
  },
  allium: {
    rows: [
      '................',
      '......pPp.......',
      '.....pPqPp......',
      '....pPqpqPp.....',
      '....PqpPpqP.....',
      '....pPqpqPp.....',
      '.....pPqPp......',
      '......pPp.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '...ll..gG.......',
      '....Ll.gG..ll...',
      '.....LlgG.lL....',
      '......lgGlL.....',
      '.......gG.......',
    ],
    inks: { ...G, p: { c: [196, 128, 226] }, P: { c: [154, 90, 196] }, q: { c: [222, 170, 240] } },
  },
  azure_bluet: {
    rows: [
      '................',
      '................',
      '................',
      '................',
      '....w.w....w....',
      '...wywy...wyw...',
      '....w.w.w..w....',
      '.....g.wyw.g....',
      '..w..g..wg.g....',
      '.wyw.g..gG.g....',
      '..w..gg.gGgg....',
      '.....lg.gGg.....',
      '....lLggGg.l....',
      '.....LlgGlL.....',
      '......lgGL......',
      '.......gG.......',
    ],
    inks: { ...G, w: { c: [232, 236, 242] }, y: { c: [236, 200, 66] } },
  },
  oxeye_daisy: {
    rows: [
      '................',
      '................',
      '.......w........',
      '....w..w..w.....',
      '.....w.w.w......',
      '...wwwyyywww....',
      '......yYy.......',
      '...wwwyyywww....',
      '.....w.w.w......',
      '....w..g..w.....',
      '.......gG.......',
      '...l...gG.......',
      '...Ll..gG..l....',
      '....LllgG.lL....',
      '......lgGlL.....',
      '.......gG.......',
    ],
    inks: { ...G, w: { c: [238, 238, 232] }, y: { c: [236, 196, 44] }, Y: { c: [200, 150, 30] } },
  },
  lily_of_the_valley: {
    rows: [
      '................',
      '................',
      '......gggg......',
      '.....g....g.....',
      '....w......g....',
      '...wW.......g...',
      '....w.....w.g...',
      '.........wW.g...',
      '..l.......w.g...',
      '..Ll........g...',
      '..LLl......gG...',
      '...LLl.....gG.l.',
      '....LLl...gG.lL.',
      '.....LLl..gGlLL.',
      '......LLlgGlLL..',
      '.......LLgGLL...',
    ],
    inks: { ...G, w: { c: [244, 244, 240] }, W: { c: [214, 216, 206] } },
  },
};

function tulip(color: RGB, dark: RGB): { rows: string[]; inks: Record<string, Ink> } {
  return {
    rows: [
      '................',
      '................',
      '................',
      '......p..p......',
      '.....pP.pPp.....',
      '.....pPPPPp.....',
      '.....PPPPPD.....',
      '.....PPPPDD.....',
      '......DDDD......',
      '.......gG.......',
      '.......gG.......',
      '...l...gG..l....',
      '...Ll..gG.lL....',
      '....Ll.gGlL.....',
      '.....LlgGL......',
      '.......gG.......',
    ],
    inks: { ...G, p: { c: mix(color, [255, 255, 255], 0.3) }, P: { c: color }, D: { c: dark } },
  };
}
FLOWER_SPRITES.red_tulip = tulip([214, 44, 34], [150, 24, 20]);
FLOWER_SPRITES.orange_tulip = tulip([238, 128, 30], [184, 82, 16]);
FLOWER_SPRITES.white_tulip = tulip([236, 236, 230], [184, 190, 180]);
FLOWER_SPRITES.pink_tulip = tulip([240, 160, 196], [200, 110, 150]);

function flower(t: Tex, key: string): void {
  cutoutCanvas(t, 65, 210);
  const f = FLOWER_SPRITES[key];
  sprite(t, f.rows, f.inks);
}

/** Pétalos rosas vistos desde arriba: grupos de florecillas sobre fondo transparente. */
function pinkPetals(t: Tex): void {
  cutoutCanvas(t, 70, 200);
  const r = t.rng();
  const pink: RGB[] = [[246, 186, 212], [236, 160, 196], [220, 136, 178]];
  const centers: [number, number][] = [[4, 4], [11, 3], [7, 9], [13, 12], [3, 12]];
  for (const [cx, cy] of centers) {
    const ox = cx + r.int(-1, 1), oy = cy + r.int(-1, 1);
    // Tallito verde.
    t.paint(ox + 1, oy + 2, [96, 150, 60], 0.6);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, 1]]) {
      t.paint(ox + dx, oy + dy, pink[r.int(0, 2)], 0.9);
    }
    t.paint(ox, oy, [252, 226, 150], 1);
  }
  t.depth = 0.6;
}

/** Nenúfar visto desde arriba: disco verde con una muesca y nervios. */
function lilyPad(t: Tex): void {
  cutoutCanvas(t, 90, 120);
  const r = t.rng();
  const n = new Noise(r, 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      if (d > 7.3) continue;
      // Muesca en cuña hacia abajo a la derecha.
      const a = Math.atan2(dy, dx);
      if (a > 0.35 && a < 0.85 && d > 1.5) continue;
      const vein = Math.abs(Math.sin(a * 4)) < 0.18 && d > 2;
      const c: RGB = vein ? [40, 98, 36] : mix([52, 124, 44], [78, 158, 62], n.at(x, y));
      t.paint(x, y, d > 6.6 ? scale(c, 0.8) : c, vein ? 0.7 : 0.9);
    }
  }
  t.depth = 0.5;
}

/** Enredadera (gris: se tinta con el follaje del bioma). */
function vine(t: Tex): void {
  cutoutCanvas(t, 60, 220);
  const r = t.rng();
  for (let k = 0; k < 4; k++) {
    let x = 1 + k * 4 + r.int(0, 1);
    for (let y = 0; y < 16; y++) {
      t.paint(x & 15, y, gray(118), 0.7);
      if (r.chance(0.45)) {
        // Hoja: racimo de 2-4 píxeles a un lado.
        const side = r.chance(0.5) ? 1 : -1;
        for (let j = 0; j < r.int(2, 4); j++) t.paint((x + side * (1 + (j & 1))) & 15, y + (j >> 1), gray(r.int(150, 206)), 1);
      }
      if (r.chance(0.3)) x += r.chance(0.5) ? 1 : -1;
    }
  }
  t.tiling = true;
  t.depth = 0.8;
}

// ---------------------------------------------------------------------------

const TERRACOTTA_COLORS: Record<string, RGB> = {
  white: [210, 178, 161],
  orange: [162, 84, 38],
  yellow: [186, 133, 35],
  brown: [77, 51, 36],
  red: [143, 61, 47],
  light_gray: [135, 107, 98],
};
const RED_SAND: RGB = [190, 102, 33];
const RED_SANDSTONE: RGB = [181, 98, 31];

export const BIOME_GENERATORS: Record<string, Generator> = {
  mycelium_top: myceliumTop,
  mycelium_side: myceliumSide,
  red_mushroom_block: (t) => mushroomCap(t, [182, 38, 34], true),
  brown_mushroom_block: (t) => mushroomCap(t, [148, 110, 82], false),
  mushroom_stem: mushroomStem,
  mushroom_block_inside: mushroomInside,
  red_sand: (t) => {
    sand(t);
    tintTo(t, RED_SAND);
  },
  red_sandstone_top: (t) => {
    sandstoneTop(t);
    tintTo(t, RED_SANDSTONE);
  },
  red_sandstone_side: (t) => {
    sandstoneSide(t);
    tintTo(t, RED_SANDSTONE);
  },
  red_sandstone_bottom: (t) => {
    sandstoneBottom(t);
    tintTo(t, RED_SANDSTONE);
  },
  packed_ice: packedIce,
  vine,
  lily_pad: lilyPad,
  pink_petals: pinkPetals,
};

for (const [key, st] of Object.entries(WOODS)) {
  const w = wood(st.planks, st.frame);
  BIOME_GENERATORS[`${key}_log_side`] = (t) => barkSide(t, st.bark);
  BIOME_GENERATORS[`${key}_log_top`] = (t) => logTop(t, st.top);
  BIOME_GENERATORS[`${key}_planks`] = (t) => planks(t, st.planks);
  BIOME_GENERATORS[`${key}_leaves`] = (t) => leaves(t, st.leaves);
  BIOME_GENERATORS[`${key}_sapling`] = (t) => sapling(t, st.sapRows, st.sapLeaves, st.sapStem, 210);
  BIOME_GENERATORS[`${key}_door_top`] = (t) => door(t, st.door, w, `${key}_door`, false);
  BIOME_GENERATORS[`${key}_door_bottom`] = (t) => door(t, st.door, w, `${key}_door`, true);
  BIOME_GENERATORS[`${key}_trapdoor`] = (t) => drawPlan(t, st.trapdoor, 0, w, `${key}_trapdoor`);
}
for (const [c, rgb] of Object.entries(TERRACOTTA_COLORS)) {
  BIOME_GENERATORS[`${c}_terracotta`] = (t) => {
    terracotta(t);
    tintTo(t, rgb);
  };
}
for (const key of Object.keys(FLOWER_SPRITES)) BIOME_GENERATORS[key] = (t) => flower(t, key);
