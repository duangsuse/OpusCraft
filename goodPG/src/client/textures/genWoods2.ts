// Texturas de las maderas de la fase 6.5: mangle (tronco, tablones, hojas, propágulo, raíces y raíces
// lodosas), roble pálido, bambú (tallo, hojas, bloque, tablones, mosaico, puerta y trampilla) y los
// troncos sin corteza de todas las maderas (corte con la veta a lo largo y anillos sin corteza).
//
// Como genBiomes, reutiliza los generadores de genWood/genBuilding/genSurvival con paletas propias.

import { N, Noise, Tex, clamp, field, gray, idx, mix, pixelNoise, rankLevels, scale, type Generator, type RGB } from './texCore';
import { barkSide, logTop, leaves, planks, type BarkStyle, type LeafStyle, type PlankStyle } from './genWood';
import { door, drawPlan, wood, OAK_DOOR, BIRCH_DOOR, SPRUCE_DOOR, OAK_TRAPDOOR, BIRCH_TRAPDOOR, SPRUCE_TRAPDOOR } from './genBuilding';
import { sapling, OAK_SAPLING } from './genSurvival';
import { dirtBase } from './genSoil';
import { cutoutCanvas, sprite, type Ink } from './genPlants';
import { tintTo } from './genBiomes';

// ---------------------------------------------------------------------------
// Paletas
// ---------------------------------------------------------------------------

const plankStyle = (light: RGB, base: RGB, dark: RGB, grain: RGB, seam: RGB, joint: RGB): PlankStyle => ({
  light, base, dark, grain, seam, joint, smooth: 58,
});

/** Madera interior de cada tronco (0 = anillo oscuro … 3 = madera clara): la de los troncos sin corteza. */
const INNER: Record<string, RGB[]> = {
  oak: [[120, 94, 56], [146, 114, 68], [168, 134, 82], [184, 150, 94]],
  birch: [[168, 146, 98], [186, 166, 116], [202, 182, 132], [212, 194, 144]],
  spruce: [[86, 60, 35], [102, 73, 43], [120, 87, 52], [134, 99, 60]],
  jungle: [[126, 88, 60], [150, 106, 74], [168, 122, 86], [182, 134, 96]],
  acacia: [[150, 72, 36], [172, 86, 44], [190, 100, 52], [204, 112, 60]],
  dark_oak: [[58, 40, 20], [72, 50, 26], [86, 61, 33], [98, 71, 39]],
  cherry: [[170, 110, 108], [196, 134, 128], [216, 154, 146], [228, 170, 160]],
  mangrove: [[96, 38, 34], [116, 50, 44], [132, 60, 52], [146, 70, 60]],
  pale_oak: [[196, 184, 178], [212, 202, 196], [224, 216, 210], [234, 228, 224]],
};

const MANGROVE_BARK: BarkStyle = {
  pal: [[46, 36, 28], [60, 47, 36], [74, 59, 44], [88, 71, 53], [102, 84, 62]], grooves: 5, wobble: 1.3, cracks: 9, smooth: 26,
};
const PALE_OAK_BARK: BarkStyle = {
  pal: [[52, 46, 44], [66, 60, 56], [80, 74, 70], [94, 88, 84], [108, 102, 98]], grooves: 4, wobble: 1, cracks: 8, smooth: 30,
};
const MANGROVE_PLANKS = plankStyle([130, 62, 55], [117, 54, 48], [106, 48, 42], [94, 42, 37], [62, 27, 23], [80, 36, 31]);
const PALE_OAK_PLANKS = plankStyle([236, 228, 224], [226, 216, 212], [214, 204, 200], [200, 190, 186], [156, 146, 142], [180, 170, 166]);
const BAMBOO_PLANKS = plankStyle([222, 202, 100], [206, 186, 88], [192, 172, 78], [176, 156, 68], [128, 110, 42], [152, 132, 54]);

const MANGROVE_LEAVES: LeafStyle = {
  pal: [gray(100), gray(120), gray(140), gray(161), gray(184), gray(206)],
  weights: [8, 16, 26, 24, 16, 10],
  holeFrac: 0.26,
  needles: false,
};
const PALE_OAK_LEAVES: LeafStyle = {
  pal: [[92, 102, 86], [108, 118, 100], [124, 134, 114], [140, 150, 128], [156, 164, 142], [172, 180, 158]],
  weights: [8, 16, 26, 24, 16, 10],
  holeFrac: 0.3,
  needles: false,
};

// ---------------------------------------------------------------------------
// Troncos sin corteza
// ---------------------------------------------------------------------------

/** Lateral de un tronco sin corteza: madera lisa con vetas verticales. */
function strippedSide(t: Tex, pal: readonly RGB[]): void {
  const r = t.rng();
  const fib = new Noise(r, 16, 2);
  const fib2 = new Noise(r, 8, 4);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.6 * fib.at(x, y) + 0.28 * fib2.at(x, y) + 0.12 * px[i]);
  const lv = rankLevels(v, [10, 28, 38, 24]);
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[lv[i]]);
    t.height[i] = 0.8 + 0.06 * lv[i];
    t.smooth[i] = 54 + 4 * lv[i];
  }
  // Algún nudo oscuro alargado.
  for (let k = 0; k < 2; k++) {
    const x = r.int(0, 15), y = r.int(0, 15);
    for (let s = 0; s < 3; s++) {
      const i = idx(x, y + s);
      t.setI(i, scale(pal[0], 0.85));
      t.height[i] = 0.7;
    }
  }
  t.depth = 0.9;
}

/** Corte de un tronco sin corteza: anillos hasta el borde (el borde, algo más oscuro). */
function strippedTop(t: Tex, pal: readonly RGB[]): void {
  logTop(t, { bark: [scale(pal[1], 0.92), pal[1], pal[2]], wood: [...pal], spacing: 1.9 });
}

// ---------------------------------------------------------------------------
// Propágulo y raíces de mangle
// ---------------------------------------------------------------------------

const PROPAGULE = [
  '................',
  '......1..1......',
  '.....122.21.....',
  '....12332231....',
  '.....2342332....',
  '......3sS43.....',
  '.......sS.......',
  '.......pP.......',
  '.......pP.......',
  '.......pP.......',
  '.......pP.......',
  '.......pP.......',
  '.......qQ.......',
  '.......qQ.......',
  '........Q.......',
  '................',
];

function propagule(t: Tex): void {
  const leavesPal: RGB[] = [[138, 196, 74], [104, 164, 54], [76, 132, 40], [54, 104, 30]];
  const inks: Record<string, Ink> = {
    s: { c: [104, 120, 50], h: 0.85 }, S: { c: [80, 94, 38], h: 0.8 },
    p: { c: [122, 158, 60], h: 0.9, sss: 120 }, P: { c: [92, 126, 44], h: 0.85, sss: 120 },
    q: { c: [140, 98, 60], h: 0.85 }, Q: { c: [108, 72, 42], h: 0.8 },
  };
  cutoutCanvas(t, 64, 200);
  leavesPal.forEach((c, k) => {
    inks[String(k + 1)] = { c, h: 1 - 0.07 * k, smooth: 70, sss: 200 };
  });
  sprite(t, PROPAGULE, inks);
}

/** Maraña de raíces: trazos que cruzan la textura (se repite sin costuras). */
function rootLines(t: Tex, pal: readonly RGB[], count: number): void {
  const r = t.rng('roots');
  for (let k = 0; k < count; k++) {
    const vertical = k % 2 === 0;
    let a = r.int(0, 15);
    const dir = r.chance(0.5) ? 1 : -1;
    for (let s = 0; s < 16; s++) {
      const x = vertical ? a : s, y = vertical ? s : a;
      const c = pal[clamp(1 + ((s + k) % 3), 0, pal.length - 1)];
      t.paint(x, y, c, 0.9 + 0.05 * (s % 2), 34);
      t.paint(vertical ? x + 1 : x, vertical ? y : y + 1, pal[0], 0.8, 30);
      if (r.chance(0.3)) a += dir;
    }
  }
}

function mangroveRoots(t: Tex): void {
  cutoutCanvas(t, 34, 30);
  t.tiling = true;
  rootLines(t, MANGROVE_BARK.pal, 6);
  t.depth = 1.2;
}

const MUD: RGB = [66, 56, 54];

function muddyRoots(t: Tex, top: boolean): void {
  dirtBase(t);
  tintTo(t, MUD);
  for (let i = 0; i < N; i++) t.smooth[i] = 70; // fango húmedo, algo brillante
  rootLines(t, MANGROVE_BARK.pal, top ? 4 : 3);
  t.depth = 1;
}

// ---------------------------------------------------------------------------
// Bambú
// ---------------------------------------------------------------------------

const STALK: RGB[] = [[70, 110, 24], [96, 140, 34], [120, 166, 46], [150, 190, 70]];
const STRIPPED: RGB[] = [[170, 146, 60], [190, 166, 72], [206, 184, 86], [222, 202, 104]];

/** Tallo de bambú: 3 píxeles de ancho (columnas 6–8, donde cae la caja del modelo), con nudos. */
function bambooStalk(t: Tex): void {
  cutoutCanvas(t, 90, 60);
  for (let y = 0; y < 16; y++) {
    const node = y === 3 || y === 11;
    const under = y === 4 || y === 12;
    for (let x = 6; x <= 8; x++) {
      const c = node ? STALK[3] : under ? STALK[0] : STALK[x === 6 ? 1 : x === 7 ? 2 : 1];
      t.paint(x, y, c, node ? 1 : 0.9, node ? 70 : 96, 60);
    }
  }
  t.depth = 1.2;
}

/** Hojas de bambú: láminas largas que salen del centro hacia los lados. */
function bambooLeaves(t: Tex, large: boolean): void {
  cutoutCanvas(t, 70, 200);
  const r = t.rng();
  const pal: RGB[] = [[62, 116, 28], [82, 142, 36], [104, 166, 48], [128, 188, 64]];
  const n = large ? 6 : 3;
  for (let k = 0; k < n; k++) {
    const side = k % 2 === 0 ? 1 : -1;
    const y0 = (large ? 1 : 3) + Math.floor((k * (large ? 13 : 9)) / n) + r.int(0, 1);
    const len = large ? r.int(5, 7) : r.int(3, 5);
    for (let s = 0; s < len; s++) {
      const x = 8 + side * (s + 1) - (side < 0 ? 1 : 0);
      const y = y0 + Math.floor(s * 0.6);
      if (x < 0 || x > 15 || y > 15) break;
      const c = pal[clamp(3 - Math.floor((s * 4) / len), 0, 3)];
      t.paint(x, y, c, 1 - 0.03 * s, 70, 200);
      if (s < len - 2 && y + 1 < 16) t.paint(x, y + 1, pal[0], 0.9, 60, 200);
    }
  }
  t.depth = 0.8;
}

/** Lateral del bloque de bambú: cuatro tallos atados, con sus nudos. */
function bambooBlockSide(t: Tex, pal: readonly RGB[]): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const col = x & 3;
    const stalk = x >> 2;
    const nodeY = (stalk * 5 + 2) & 15;
    const edge = col === 0;
    let c = pal[edge ? 0 : col === 2 ? 3 : 2];
    if (y === nodeY) c = pal[3];
    else if (y === ((nodeY + 1) & 15)) c = pal[1];
    t.setI(i, mix(c, scale(c, 0.9), px[i] * 0.4));
    t.height[i] = edge ? 0.5 : col === 2 ? 1 : 0.9;
    t.smooth[i] = 90;
  }
  t.depth = 1.3;
}

/** Tapa del bloque de bambú: los cortes huecos de los tallos. */
function bambooBlockTop(t: Tex, pal: readonly RGB[]): void {
  const inside: RGB = scale(pal[3], 1.05);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const cx = (x & 7) - 3.5, cy = (y & 7) - 3.5;
    const d = Math.hypot(cx, cy);
    let c: RGB;
    let h: number;
    if (d < 1.6) {
      c = [118, 100, 50]; // hueco
      h = 0.3;
    } else if (d < 3) {
      c = inside;
      h = 0.9;
    } else if (d < 4) {
      c = pal[1];
      h = 1;
    } else {
      c = pal[0];
      h = 0.4;
    }
    t.setI(i, c);
    t.height[i] = h;
    t.smooth[i] = 70;
  }
  t.depth = 1.2;
}

/** Mosaico de bambú: cuadros de 8×8 con listones alternando en horizontal y en vertical. */
function bambooMosaic(t: Tex): void {
  const p = BAMBOO_PLANKS;
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const horiz = ((x >> 3) + (y >> 3)) % 2 === 0;
    const a = horiz ? y & 7 : x & 7;
    const along = horiz ? x & 7 : y & 7;
    let c: RGB = a % 4 === 3 ? p.seam : a % 4 === 0 ? p.light : mix(p.base, p.grain, px[i] * 0.5);
    if (along === 0 || along === 7) c = mix(c, p.joint, 0.5);
    t.setI(i, c);
    t.height[i] = a % 4 === 3 ? 0.5 : 0.9;
    t.smooth[i] = 64;
  }
  t.depth = 1.1;
}

// ---------------------------------------------------------------------------

export const WOODS2_GENERATORS: Record<string, Generator> = {
  mangrove_log_side: (t) => barkSide(t, MANGROVE_BARK),
  mangrove_log_top: (t) => logTop(t, { bark: MANGROVE_BARK.pal.slice(0, 3), wood: INNER.mangrove, spacing: 1.8 }),
  mangrove_planks: (t) => planks(t, MANGROVE_PLANKS),
  mangrove_leaves: (t) => leaves(t, MANGROVE_LEAVES),
  mangrove_propagule: propagule,
  mangrove_roots: mangroveRoots,
  muddy_mangrove_roots_top: (t) => muddyRoots(t, true),
  muddy_mangrove_roots_side: (t) => muddyRoots(t, false),
  pale_oak_log_side: (t) => barkSide(t, PALE_OAK_BARK),
  pale_oak_log_top: (t) => logTop(t, { bark: PALE_OAK_BARK.pal.slice(0, 3), wood: INNER.pale_oak, spacing: 1.9 }),
  pale_oak_planks: (t) => planks(t, PALE_OAK_PLANKS),
  pale_oak_leaves: (t) => leaves(t, PALE_OAK_LEAVES),
  pale_oak_sapling: (t) => sapling(t, OAK_SAPLING, [[178, 186, 164], [150, 160, 138], [124, 134, 114], [100, 110, 92], [80, 88, 74]], {
    s: { c: [96, 88, 84], h: 0.85, smooth: 40, sss: 90 }, S: { c: [70, 64, 60], h: 0.8, smooth: 40, sss: 90 },
  }, 200),
  bamboo_stalk: bambooStalk,
  bamboo_small_leaves: (t) => bambooLeaves(t, false),
  bamboo_large_leaves: (t) => bambooLeaves(t, true),
  bamboo_block_side: (t) => bambooBlockSide(t, STALK),
  bamboo_block_top: (t) => bambooBlockTop(t, STALK),
  stripped_bamboo_block_side: (t) => bambooBlockSide(t, STRIPPED),
  stripped_bamboo_block_top: (t) => bambooBlockTop(t, STRIPPED),
  bamboo_planks: (t) => planks(t, BAMBOO_PLANKS),
  bamboo_mosaic: bambooMosaic,
};

// Puertas y trampillas de las maderas nuevas.
const DOORS: [key: string, p: PlankStyle, door: readonly string[], trapdoor: readonly string[], frame: number][] = [
  ['mangrove', MANGROVE_PLANKS, OAK_DOOR, OAK_TRAPDOOR, 0.4],
  ['pale_oak', PALE_OAK_PLANKS, BIRCH_DOOR, BIRCH_TRAPDOOR, 0.5],
  ['bamboo', BAMBOO_PLANKS, SPRUCE_DOOR, SPRUCE_TRAPDOOR, 0.45],
];
for (const [key, p, rows, trap, frame] of DOORS) {
  const w = wood(p, frame);
  WOODS2_GENERATORS[`${key}_door_top`] = (t) => door(t, rows, w, `${key}_door`, false);
  WOODS2_GENERATORS[`${key}_door_bottom`] = (t) => door(t, rows, w, `${key}_door`, true);
  WOODS2_GENERATORS[`${key}_trapdoor`] = (t) => drawPlan(t, trap, 0, w, `${key}_trapdoor`);
}
// Troncos sin corteza de todas las maderas.
for (const [key, pal] of Object.entries(INNER)) {
  WOODS2_GENERATORS[`stripped_${key}_log_side`] = (t) => strippedSide(t, pal);
  WOODS2_GENERATORS[`stripped_${key}_log_top`] = (t) => strippedTop(t, pal);
}
