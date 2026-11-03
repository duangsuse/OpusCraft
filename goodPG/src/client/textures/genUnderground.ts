// Texturas del subsuelo (fase 5): pizarra profunda y sus menas, toba, calcita, basalto liso,
// espeleotema, cobre y esmeralda, musgo, azaleas, enredaderas de cueva, amatista y cristal tintado.

import { N, Noise, Rng, Tex, clamp, field, idx, mix, pixelNoise, rankLevels, scatter, voronoi, type Generator, type RGB } from './texCore';
import { ore, cobblestone, speckled, ORE_STYLES, ORE_SHAPES, type OreStyle, type SpeckStyle } from './genStone';
import { tintTo } from './genBiomes';
import { cutoutCanvas, sprite, type Ink } from './genPlants';

const { SH_DOT, SH_2, SH_2V, SH_SQ, SH_L, SH_L3, SH_PLUS, SH_GEM } = ORE_SHAPES;

// ---------------------------------------------------------------------------
// Pizarra profunda
// ---------------------------------------------------------------------------

const DEEP: RGB[] = [[46, 46, 52], [56, 56, 62], [66, 66, 72], [77, 77, 83], [90, 90, 96]];

/** Pizarra profunda de lado: estratos verticales finos. Las menas de pizarra usan este fondo. */
export function deepslateBase(t: Tex): void {
  const r = new Rng('deepslate:base');
  const streak = new Noise(r, 16, 3);
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.55 * streak.at(x, y) + 0.3 * n4.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [10, 24, 34, 22, 10]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, DEEP[lv[i]]);
    t.height[i] = 0.55 + 0.3 * streak.at(x, y) + 0.1 * (lv[i] / 4);
    t.smooth[i] = 50 + lv[i] * 5;
  }
  t.depth = 1.3;
}

function deepslateTop(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    // Remolinos concéntricos suaves.
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = 0.5 + 0.5 * Math.sin(d * 1.3 + n4.at(x, y) * 4);
    const v = 0.5 * ring + 0.3 * n8.at(x, y) + 0.2 * px[i];
    const l = clamp(Math.floor(v * 5), 0, 4);
    t.setI(i, DEEP[l]);
    t.height[i] = 0.6 + 0.3 * ring;
    t.smooth[i] = 55;
  }
  t.depth = 1.0;
}

// ---------------------------------------------------------------------------
// Rocas de las cuevas
// ---------------------------------------------------------------------------

const TUFF: SpeckStyle = {
  base: [[92, 94, 84], [102, 104, 94], [112, 114, 104], [122, 124, 113]],
  weights: [18, 32, 32, 18],
  specks: [
    { cols: [[138, 140, 128], [150, 150, 138]], count: 14, minDist: 2.4, maxSize: 2, dh: 0.05 },
    { cols: [[72, 74, 66], [80, 82, 74]], count: 12, minDist: 2.6, maxSize: 2, dh: -0.06 },
  ],
  smooth: [40, 55],
  depth: 0.9,
};
const CALCITE: SpeckStyle = {
  base: [[212, 214, 208], [222, 224, 218], [230, 232, 226], [238, 240, 235]],
  weights: [15, 30, 35, 20],
  specks: [{ cols: [[184, 186, 180], [196, 198, 192]], count: 9, minDist: 3, maxSize: 2, dh: -0.04 }],
  smooth: [70, 90],
  depth: 0.7,
};

function smoothBasalt(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, mix([46, 46, 50], [66, 66, 70], 0.6 * n8.at(x, y) + 0.4 * px[i]));
    t.height[i] = 0.9 + 0.1 * n8.at(x, y);
    t.smooth[i] = 110;
  }
  t.depth = 0.5;
}

const DRIP: RGB[] = [[112, 84, 68], [128, 96, 78], [142, 108, 88], [156, 120, 98], [170, 134, 110]];

function dripstone(t: Tex, vertical: boolean): void {
  const r = t.rng();
  const band = vertical ? new Noise(r, 12, 2) : new Noise(r, 2, 10);
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.55 * band.at(x, y) + 0.3 * n4.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [10, 22, 34, 22, 12]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, DRIP[lv[i]]);
    t.height[i] = 0.6 + 0.35 * band.at(x, y);
    t.smooth[i] = 70 + 6 * lv[i];
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Menas nuevas
// ---------------------------------------------------------------------------

const COPPER: OreStyle = {
  main: [196, 110, 76],
  light: [232, 150, 108],
  dark: [138, 70, 46],
  count: 8,
  minDist: 3.8,
  shapes: [SH_SQ, SH_L, SH_L3, SH_2, SH_2V],
  smooth: 160,
  f0: 234,
};
const EMERALD: OreStyle = {
  main: [44, 196, 104],
  light: [132, 244, 168],
  dark: [18, 118, 58],
  sparkle: [226, 255, 234],
  count: 5,
  minDist: 4.6,
  shapes: [SH_GEM, SH_PLUS, SH_DOT, SH_2V],
  smooth: 220,
  f0: 45,
};
const ORES: Record<string, OreStyle> = { ...ORE_STYLES, copper: COPPER, emerald: EMERALD };

function emeraldBlock(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    // Tallado en rombos con bisel claro arriba a la izquierda.
    const edge = x === 0 || y === 0 ? 1 : x === 15 || y === 15 ? -1 : 0;
    const facet = (Math.abs(((x + y) % 8) - 4) + Math.abs(((x - y + 16) % 8) - 4)) / 8;
    let c = mix([34, 160, 82], [80, 214, 130], 0.6 * facet + 0.4 * n4.at(x, y));
    if (edge > 0) c = [150, 250, 188];
    else if (edge < 0) c = [16, 96, 48];
    t.setI(i, c);
    t.height[i] = 0.9 + 0.1 * facet;
    t.smooth[i] = 215;
    t.f0[i] = 45;
  }
  t.depth = 0.6;
}

// ---------------------------------------------------------------------------
// Cuevas frondosas
// ---------------------------------------------------------------------------

function mossBlock(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const pal: RGB[] = [[52, 86, 34], [64, 102, 40], [78, 118, 46], [92, 132, 54], [108, 148, 64]];
  const v = field((x, y, i) => 0.4 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [10, 22, 32, 24, 12]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.55 + 0.1 * lv[i];
    t.smooth[i] = 30;
    t.sss[i] = 60;
  }
  t.depth = 1.1;
}

const LEAF: Record<string, Ink> = {
  a: { c: [120, 160, 60], h: 1 },
  b: { c: [92, 132, 44], h: 0.9 },
  c: { c: [66, 100, 32], h: 0.8 },
  s: { c: [96, 76, 44], h: 0.7 },
};

function azalea(t: Tex, flowering: boolean): void {
  cutoutCanvas(t, 55, 200);
  sprite(
    t,
    [
      '................',
      '................',
      '....abba.abb....',
      '..abbbcbabbcba..',
      '.abbcbbbbbcbbba.',
      '.bbcbbPabbbcbbb.',
      'abbbbbbbcbbPbbca',
      'bcbPbbcbbbbbbbcb',
      'bbbbcbbbbPbcbbbb',
      '.bcbbbbcbbbbbcb.',
      '..bbcbbsbbcbbb..',
      '...cbbbsbbbbc...',
      '.....cbsbc......',
      '.......s........',
      '.......s........',
      '......ss........',
    ],
    { ...LEAF, P: flowering ? { c: [230, 120, 196], h: 1.05 } : LEAF.a },
  );
}

function caveVines(t: Tex, lit: boolean): void {
  cutoutCanvas(t, 55, 200);
  sprite(
    t,
    [
      '.......sa.......',
      '......as........',
      '.......sb.......',
      '.....bbs........',
      '.......s.Q......',
      '.......sbq......',
      '......as........',
      '....Q..s........',
      '....qbbs........',
      '.......sa.......',
      '.......s.bb.....',
      '.......s...Q....',
      '......asb..q....',
      '.......s........',
      '......bs........',
      '.......sa.......',
    ],
    {
      ...LEAF,
      s: { c: [74, 104, 40], h: 0.8 },
      Q: lit ? { c: [255, 196, 80], h: 1.1, emit: 230 } : LEAF.b,
      q: lit ? { c: [236, 140, 40], h: 1, emit: 200 } : LEAF.c,
    },
  );
}

// ---------------------------------------------------------------------------
// Amatista
// ---------------------------------------------------------------------------

const AME: RGB[] = [[92, 58, 146], [116, 78, 170], [140, 100, 194], [166, 128, 214], [196, 164, 234]];

function amethyst(t: Tex, budding: boolean): void {
  const r = new Rng('amethyst:facets');
  const sites = scatter(r, 12, 3.6);
  const shade = sites.map(() => r.int(0, 4));
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const v = voronoi(sites, x + 0.5, y + 0.5);
    const edge = v.d2 - v.d1 < 0.6;
    const l = clamp(shade[v.i1] + (px[i] > 0.85 ? 1 : 0), 0, 4);
    t.setI(i, edge ? AME[0] : AME[l]);
    t.height[i] = edge ? 0.6 : 0.85 + 0.03 * l;
    t.smooth[i] = 200;
    t.f0[i] = 40;
  }
  if (budding) {
    // Huecos oscuros de donde salen los brotes.
    const rr = t.rng('holes');
    for (let k = 0; k < 6; k++) {
      const x = rr.int(1, 14), y = rr.int(1, 14);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = idx(x + dx, y + dy);
        t.setI(i, [58, 34, 96]);
        t.height[i] = 0.3;
      }
    }
  }
  t.depth = 0.9;
}

/** Brotes y racimos de amatista (cristales que brillan un poco). */
function amethystBud(t: Tex, stage: number): void {
  cutoutCanvas(t, 210, 120);
  const rows: string[][] = [
    [
      '......ab........',
      '.....abc...a....',
      '....abcc..abc...',
      '....abcc..abc...',
    ],
    [
      '.......a........',
      '......abc.......',
      '..a...abc...a...',
      '.abc..abc..abc..',
      '.abc..abc..abc..',
      '.abcc.abcc.abcc.',
    ],
    [
      '.......a........',
      '......abc.......',
      '......abc.......',
      '..a...abc....a..',
      '.abc..abcc..abc.',
      '.abc..abcc..abc.',
      '.abcc.abcc..abc.',
      '.abcc.abcc.abcc.',
      '..abc.abcc.abc..',
    ],
    [
      '.......a........',
      '......abc.......',
      '..a...abc.......',
      '.abc..abc...a...',
      '.abc..abcc.abc..',
      '.abcc.abcc.abc..',
      '..abc.abcc.abcc.',
      'a.abcaabccaabc.a',
      'ab.abcabccabc.ab',
      'abc.abcabcabc.ab',
      '.abc.abcabcc.abc',
      '..abcabcabcabcc.',
    ],
  ];
  const r = rows[stage];
  const full = [...Array(16 - r.length).fill('................'), ...r];
  sprite(t, full, {
    a: { c: [220, 190, 248], h: 1.1, emit: 60 + stage * 30, smooth: 230 },
    b: { c: [170, 124, 222], h: 1, emit: 40 + stage * 25, smooth: 220 },
    c: { c: [118, 78, 176], h: 0.9, emit: 20 + stage * 15, smooth: 210 },
  });
}

function tintedGlass(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    t.setI(i, frame ? [44, 36, 52] : mix([46, 38, 58], [64, 54, 78], n4.at(x, y)));
    t.alpha[i] = frame ? 250 : 200;
    t.height[i] = 1;
    t.smooth[i] = 235;
  }
  t.f0.fill(5);
  t.depth = 0.3;
}

// ---------------------------------------------------------------------------

export const UNDERGROUND_GENERATORS: Record<string, Generator> = {
  deepslate: deepslateBase,
  deepslate_top: deepslateTop,
  cobbled_deepslate: (t) => {
    cobblestone(t, false);
    tintTo(t, [72, 72, 80]);
  },
  tuff: (t) => speckled(t, TUFF),
  calcite: (t) => speckled(t, CALCITE),
  smooth_basalt: smoothBasalt,
  dripstone_block: (t) => dripstone(t, false),
  pointed_dripstone: (t) => dripstone(t, true),
  copper_ore: (t) => ore(t, COPPER),
  emerald_ore: (t) => ore(t, EMERALD),
  emerald_block: emeraldBlock,
  moss_block: mossBlock,
  azalea: (t) => azalea(t, false),
  flowering_azalea: (t) => azalea(t, true),
  cave_vines: (t) => caveVines(t, false),
  cave_vines_lit: (t) => caveVines(t, true),
  amethyst_block: (t) => amethyst(t, false),
  budding_amethyst: (t) => amethyst(t, true),
  small_amethyst_bud: (t) => amethystBud(t, 0),
  medium_amethyst_bud: (t) => amethystBud(t, 1),
  large_amethyst_bud: (t) => amethystBud(t, 2),
  amethyst_cluster: (t) => amethystBud(t, 3),
  tinted_glass: tintedGlass,
};
for (const [key, st] of Object.entries(ORES)) UNDERGROUND_GENERATORS[`deepslate_${key}_ore`] = (t) => ore(t, st, deepslateBase);
