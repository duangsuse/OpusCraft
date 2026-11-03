// Generadores de piedras, menas y bloques derivados de la roca.

import {
  N,
  Noise,
  Rng,
  Tex,
  clamp,
  clamp01,
  distanceTo,
  field,
  idx,
  lerp,
  mix,
  pixelNoise,
  rankLevels,
  scale,
  scatter,
  smoothstep,
  voronoi,
  wrap,
  type Generator,
  type RGB,
} from './texCore';

// ---------------------------------------------------------------------------
// Piedra
// ---------------------------------------------------------------------------

// Gris frío en 5 tonos (de oscuro a claro).
const STONE: RGB[] = [
  [99, 100, 105],
  [111, 112, 117],
  [123, 124, 128],
  [134, 135, 139],
  [146, 147, 151],
];

/** Piedra base. Las menas reutilizan exactamente este fondo (misma semilla). */
export function stoneBase(t: Tex): void {
  const r = new Rng('stone:base');
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.47 * n4.at(x, y) + 0.33 * n8.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [8, 22, 38, 22, 10]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, STONE[lv[i]]);
    t.height[i] = 0.6 + 0.25 * (lv[i] / 4) + 0.15 * n4.at(x, y);
    t.smooth[i] = 46 + lv[i] * 4.5 + px[i] * 5;
  }
  // Grietas tenues: trazos cortos y quebrados, apenas más oscuros que el tono más bajo.
  const cr = new Rng('stone:cracks');
  for (let k = 0; k < 2; k++) {
    let x = cr.int(0, 15);
    let y = cr.int(0, 15);
    const sx = cr.chance(0.5) ? 1 : -1;
    const len = cr.int(3, 4);
    for (let s = 0; s < len; s++) {
      const i = idx(x, y);
      t.setI(i, mix(STONE[0], STONE[1], 0.2));
      t.height[i] -= 0.16;
      t.smooth[i] = 45;
      const m = cr.next();
      if (m < 0.45) {
        x += sx;
        y += 1;
      } else if (m < 0.75) x += sx;
      else y += 1;
    }
  }
  t.depth = 1.4;
}

// ---------------------------------------------------------------------------
// Menas
// ---------------------------------------------------------------------------

export interface OreStyle {
  main: RGB;
  light: RGB;
  dark: RGB;
  /** Brillo de gema: sustituye al primer píxel iluminado de cada pepita. */
  sparkle?: RGB;
  count: number;
  minDist: number;
  shapes: readonly (readonly string[])[];
  smooth: number;
  f0: number;
  emit?: number;
}

const SH_DOT = ['#'];
const SH_2 = ['##'];
const SH_2V = ['#', '#'];
const SH_SQ = ['##', '##'];
const SH_L = ['##', '#.'];
const SH_L3 = ['##.', '###'];
const SH_PLUS = ['.#.', '###', '.#.'];
const SH_BLOB = ['.##', '###', '##.'];
const SH_BIG = ['.##.', '####', '###.', '.#..'];
const SH_GEM = ['.#.', '###', '.##'];
export const ORE_SHAPES = { SH_DOT, SH_2, SH_2V, SH_SQ, SH_L, SH_L3, SH_PLUS, SH_BLOB, SH_BIG, SH_GEM };

const COAL: OreStyle = {
  main: [44, 44, 48],
  light: [70, 70, 76],
  dark: [26, 26, 29],
  count: 6,
  minDist: 4.6,
  shapes: [SH_BLOB, SH_BIG, SH_L3, SH_SQ],
  smooth: 95,
  f0: 12,
};
// f0 230/231/234 = metales predefinidos de LabPBR (hierro/oro/cobre); ≥ 230 → metal.
const IRON: OreStyle = {
  main: [214, 176, 142],
  light: [240, 214, 186],
  dark: [164, 122, 92],
  count: 7,
  minDist: 4.2,
  shapes: [SH_SQ, SH_L, SH_L3, SH_PLUS, SH_2],
  smooth: 165,
  f0: 230,
};
const GOLD: OreStyle = {
  main: [236, 194, 58],
  light: [255, 234, 130],
  dark: [186, 134, 28],
  count: 7,
  minDist: 4.2,
  shapes: [SH_SQ, SH_L, SH_L3, SH_PLUS, SH_2V],
  smooth: 190,
  f0: 231,
};
const DIAMOND: OreStyle = {
  main: [80, 212, 204],
  light: [168, 246, 240],
  dark: [36, 142, 144],
  sparkle: [236, 255, 254],
  count: 6,
  minDist: 4.4,
  shapes: [SH_PLUS, SH_GEM, SH_SQ, SH_L],
  smooth: 222,
  f0: 45,
};
const LAPIS: OreStyle = {
  main: [40, 72, 170],
  light: [78, 116, 216],
  dark: [24, 42, 110],
  count: 7,
  minDist: 4.0,
  shapes: [SH_BLOB, SH_L3, SH_SQ, SH_L, SH_PLUS],
  smooth: 110,
  f0: 12,
};
const REDSTONE: OreStyle = {
  main: [194, 28, 22],
  light: [250, 78, 58],
  dark: [122, 14, 12],
  count: 10,
  minDist: 3.4,
  shapes: [SH_DOT, SH_2, SH_2V, SH_L, SH_SQ],
  smooth: 90,
  f0: 10,
  emit: 50,
};

/** Mena: pepitas sobre la roca de fondo (`base`: piedra o, para las de pizarra profunda, pizarra). */
export function ore(t: Tex, st: OreStyle, base: (t: Tex) => void = stoneBase): void {
  base(t);
  const r = t.rng('nuggets');
  const sites = scatter(r, st.count, st.minDist);
  const occ = new Uint8Array(N);
  for (const s of sites) {
    const shape = r.pick(st.shapes);
    const flip = r.chance(0.5);
    const h = shape.length;
    const w = shape[0].length;
    const ox = Math.round(s.x - w / 2);
    const oy = Math.round(s.y - h / 2);
    const inside = (sx: number, sy: number): boolean =>
      sy >= 0 && sy < h && sx >= 0 && sx < w && shape[sy][flip ? w - 1 - sx : sx] === '#';
    let sparkled = false;
    for (let sy = 0; sy < h; sy++) {
      for (let sx = 0; sx < w; sx++) {
        if (!inside(sx, sy)) continue;
        // Iluminación de la pepita: borde superior-izquierdo claro, inferior-derecho oscuro.
        const l =
          (inside(sx, sy - 1) ? 0 : 1) +
          (inside(sx - 1, sy) ? 0 : 1) -
          (inside(sx, sy + 1) ? 0 : 1) -
          (inside(sx + 1, sy) ? 0 : 1);
        const i = idx(ox + sx, oy + sy);
        let c = l >= 1 ? st.light : l <= -1 ? st.dark : st.main;
        if (st.sparkle && !sparkled && l >= 1) {
          c = st.sparkle;
          sparkled = true;
        }
        t.setI(i, c);
        occ[i] = 1;
        t.height[i] = 1.08 + (l >= 1 ? 0.04 : l <= -1 ? -0.04 : 0);
        t.smooth[i] = st.smooth + (l >= 1 ? 14 : l <= -1 ? -10 : 0);
        t.f0[i] = st.f0;
        t.emit[i] = (st.emit ?? 0) * (l <= -1 ? 0.6 : 1);
      }
    }
  }
  // Engaste: la piedra justo debajo/derecha de cada pepita se oscurece y se hunde.
  for (let i = 0; i < N; i++) {
    if (occ[i]) continue;
    const x = i & 15;
    const y = i >> 4;
    if (occ[idx(x, y - 1)] || occ[idx(x - 1, y)]) {
      t.setI(i, scale(t.getI(i), 0.8));
      t.height[i] -= 0.12;
    }
  }
}

// ---------------------------------------------------------------------------
// Roca (cobblestone) y roca musgosa
// ---------------------------------------------------------------------------

const ROCK: RGB[] = [
  [100, 100, 104],
  [113, 113, 117],
  [126, 126, 130],
  [138, 138, 142],
  [151, 151, 155],
];
const MORTAR: RGB[] = [
  [50, 50, 54],
  [58, 58, 62],
  [66, 66, 70],
];

interface CellLayout {
  cell: Int16Array;
  gap: Uint8Array;
  dist: Float32Array;
}

/** Celdas de Voronoi periódicas separadas por juntas de anchura irregular. */
function cellLayout(seed: string, count: number, minDist: number, gapW: number, wMin: number, wMax: number): CellLayout {
  const r = new Rng(seed);
  const sites = scatter(r, count, minDist, wMin, wMax);
  const gn = new Noise(r, 8);
  const cell = new Int16Array(N);
  const gap = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const v = voronoi(sites, x + 0.5, y + 0.5);
    cell[i] = v.i1;
    if (v.d2 - v.d1 < gapW * (0.7 + 0.6 * gn.at(x, y))) gap[i] = 1;
  }
  return { cell, gap, dist: distanceTo(gap) };
}

export function cobblestone(t: Tex, mossy: boolean): void {
  const L = cellLayout('cobblestone:layout', 11, 3.9, 0.95, 0.8, 1.25);
  const r = new Rng('cobblestone:shade');
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const rockShade: number[] = [];
  for (let k = 0; k < 64; k++) rockShade.push(r.int(0, 4));
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (L.gap[i]) {
      t.setI(i, MORTAR[Math.min(2, Math.floor(px[i] * 3))]);
      t.height[i] = 0.12 + 0.08 * px[i];
      t.smooth[i] = 30;
      continue;
    }
    const d = L.dist[i];
    const nv = n8.at(x, y);
    let lv = rockShade[L.cell[i]] + (nv > 0.62 ? 1 : nv < 0.38 ? -1 : 0);
    // Luz horneada muy suave: borde superior-izquierdo más claro, inferior-derecho más oscuro.
    const up = L.gap[idx(x, y - 1)] || L.gap[idx(x - 1, y)];
    const down = L.gap[idx(x, y + 1)] || L.gap[idx(x + 1, y)];
    if (up && !down) lv += 1;
    if (down && !up) lv -= 1;
    lv = clamp(lv, 0, 4);
    let c = ROCK[lv];
    if (d <= 1) c = scale(c, 0.94); // oclusión en el borde de la piedra
    t.setI(i, c);
    t.height[i] = 0.3 + 0.7 * Math.sqrt(clamp01((d - 0.5) / 2.2)) + 0.05 * nv;
    t.smooth[i] = 48 + lv * 5 + px[i] * 6;
  }
  t.depth = 1.5;
  if (mossy) moss(t, L);
}

const MOSS: RGB[] = [
  [58, 82, 36],
  [74, 100, 44],
  [90, 118, 52],
  [108, 136, 62],
];

function moss(t: Tex, L: CellLayout): void {
  const r = new Rng('mossy:moss');
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const m = field((x, y, i) => 0.55 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.15 * px[i] + (L.gap[i] ? 0.22 : 0));
  const covered = rankLevels(m, [62, 38]);
  const shade = rankLevels(
    field((x, y, i) => 0.7 * n8.at(x, y) + 0.3 * px[i]),
    [20, 30, 30, 20],
  );
  for (let i = 0; i < N; i++) {
    if (!covered[i]) continue;
    const x = i & 15;
    const y = i >> 4;
    // El borde inferior de cada mancha de musgo, un tono más oscuro.
    const edge = !covered[idx(x, y + 1)];
    t.setI(i, MOSS[Math.max(0, shade[i] - (edge ? 1 : 0))]);
    t.height[i] = Math.max(t.height[i], 0.55) + 0.06;
    t.smooth[i] = 22;
    t.sss[i] = 40;
  }
}

// ---------------------------------------------------------------------------
// Ladrillos de piedra
// ---------------------------------------------------------------------------

const SBRICK: RGB[] = [
  [106, 106, 110],
  [117, 117, 121],
  [128, 128, 132],
  [138, 138, 142],
  [149, 149, 153],
];
const SSEAM: RGB[] = [
  [68, 68, 72],
  [76, 76, 80],
];

export function stoneBricks(t: Tex): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const brickShade = [r.int(-1, 1), r.int(-1, 1), r.int(-1, 1), r.int(-1, 1)];
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const row = y < 8 ? 0 : 1;
    const ly = y - row * 8; // 7 = junta horizontal
    const off = row === 0 ? 0 : 4; // la fila inferior va desplazada medio ladrillo
    const lx = wrap(x - off) % 8; // 7 = junta vertical
    const brick = row * 2 + Math.floor(wrap(x - off) / 8);
    if (ly === 7 || lx === 7) {
      t.setI(i, SSEAM[px[i] < 0.5 ? 0 : 1]);
      t.height[i] = 0.2;
      t.smooth[i] = 35;
      continue;
    }
    const nv = n8.at(x, y);
    let lv = 2 + brickShade[brick] + (nv > 0.64 ? 1 : nv < 0.36 ? -1 : 0);
    // Bisel cincelado: arriba/izquierda más claro, abajo/derecha más oscuro.
    if (ly === 0 || lx === 0) lv += 1;
    if (ly === 6 || lx === 6) lv -= 1;
    t.setI(i, SBRICK[clamp(lv, 0, 4)]);
    const edge = ly === 0 || ly === 6 || lx === 0 || lx === 6;
    t.height[i] = edge ? 0.8 : 1 - 0.06 * nv;
    t.smooth[i] = 56 + 8 * px[i];
  }
  // Grietas finas en dos ladrillos y una esquina desconchada.
  const crack = (pts: readonly (readonly [number, number])[]): void => {
    for (const [x, y] of pts) {
      const i = idx(x, y);
      t.setI(i, [90, 90, 94]);
      t.height[i] = 0.55;
      t.smooth[i] = 40;
    }
  };
  crack([
    [10, 1],
    [10, 2],
    [11, 3],
    [11, 4],
  ]);
  crack([
    [1, 11],
    [2, 12],
    [2, 13],
  ]);
  const chip = idx(14, 14);
  t.setI(chip, SSEAM[1]);
  t.height[chip] = 0.35;
  t.depth = 1.4;
}

// ---------------------------------------------------------------------------
// Granito, diorita y andesita (piedras moteadas)
// ---------------------------------------------------------------------------

interface SpeckGroup {
  cols: RGB[];
  count: number;
  minDist: number;
  maxSize: number;
  dh: number;
}

export interface SpeckStyle {
  base: RGB[];
  weights: number[];
  specks: SpeckGroup[];
  smooth: [number, number];
  depth: number;
}

export function speckled(t: Tex, st: SpeckStyle): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, st.weights);
  const k = st.base.length - 1;
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    t.setI(i, st.base[lv[i]]);
    t.height[i] = 0.8 + 0.1 * (lv[i] / k) + 0.1 * n8.at(x, y);
    t.smooth[i] = lerp(st.smooth[0], st.smooth[1], 0.5 * px[i] + 0.5 * (lv[i] / k));
  }
  for (const sp of st.specks) {
    for (const s of scatter(r, sp.count, sp.minDist)) {
      let x = Math.floor(s.x);
      let y = Math.floor(s.y);
      const size = r.int(1, sp.maxSize);
      const c = r.pick(sp.cols);
      for (let n = 0; n < size; n++) {
        const i = idx(x, y);
        t.setI(i, c);
        t.height[i] = 0.9 + sp.dh;
        const d = r.int(0, 3);
        if (d === 0) x++;
        else if (d === 1) y++;
        else if (d === 2) x--;
        else y--;
      }
    }
  }
  t.depth = st.depth;
}

const GRANITE: SpeckStyle = {
  base: [
    [138, 90, 72],
    [150, 100, 80],
    [161, 110, 89],
    [172, 121, 99],
  ],
  weights: [18, 32, 32, 18],
  specks: [
    { cols: [[112, 70, 56], [101, 62, 50]], count: 12, minDist: 2.6, maxSize: 3, dh: -0.08 },
    { cols: [[196, 148, 126], [208, 164, 142]], count: 10, minDist: 2.8, maxSize: 2, dh: 0.06 },
    { cols: [[78, 64, 62]], count: 4, minDist: 4, maxSize: 1, dh: -0.05 },
  ],
  smooth: [55, 75],
  depth: 0.9,
};

const DIORITE: SpeckStyle = {
  base: [
    [184, 184, 183],
    [196, 196, 195],
    [207, 207, 205],
    [218, 218, 216],
  ],
  weights: [15, 30, 35, 20],
  specks: [
    { cols: [[96, 96, 100], [112, 112, 116]], count: 11, minDist: 3, maxSize: 3, dh: -0.06 },
    { cols: [[146, 146, 149]], count: 10, minDist: 2.5, maxSize: 2, dh: -0.03 },
  ],
  smooth: [60, 78],
  depth: 0.8,
};

const ANDESITE: SpeckStyle = {
  base: [
    [118, 119, 121],
    [128, 129, 131],
    [137, 138, 140],
    [146, 147, 149],
  ],
  weights: [18, 32, 32, 18],
  specks: [
    { cols: [[160, 161, 163], [170, 170, 172]], count: 14, minDist: 2.4, maxSize: 2, dh: 0.05 },
    { cols: [[100, 101, 104], [106, 107, 110]], count: 14, minDist: 2.4, maxSize: 2, dh: -0.05 },
  ],
  smooth: [45, 62],
  depth: 0.8,
};

// ---------------------------------------------------------------------------
// Lecho de roca y obsidiana
// ---------------------------------------------------------------------------

const BEDROCK: RGB[] = [
  [24, 24, 26],
  [40, 40, 43],
  [58, 58, 62],
  [80, 80, 84],
  [106, 106, 110],
  [132, 132, 136],
];

function bedrock(t: Tex): void {
  const r = t.rng();
  const sites = scatter(r, 16, 2.8, 0.8, 1.3);
  const siteLv = sites.map(() => r.next());
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => {
    const h = voronoi(sites, x + 0.5, y + 0.5);
    const edge = smoothstep(0, 1.2, h.d2 - h.d1);
    return 0.45 * siteLv[h.i1] + 0.25 * n8.at(x, y) + 0.15 * n4.at(x, y) + 0.15 * px[i] - 0.25 * (1 - edge);
  });
  const lv = rankLevels(v, [14, 20, 22, 20, 15, 9]);
  for (let i = 0; i < N; i++) {
    t.setI(i, BEDROCK[lv[i]]);
    t.height[i] = 0.35 + 0.5 * (lv[i] / 5) + 0.15 * v[i];
    t.smooth[i] = 28 + lv[i] * 4;
  }
  t.depth = 1.6;
}

const OBSIDIAN: RGB[] = [
  [15, 11, 23],
  [21, 15, 32],
  [28, 20, 42],
  [36, 26, 54],
];

export function obsidian(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * n4.at(x, y) + 0.35 * n8.at(x, y) + 0.15 * px[i]);
  const lv = rankLevels(v, [22, 34, 30, 14]);
  // Facetas vítreas: cada celda es un plano ligeramente inclinado.
  const sites = scatter(r, 8, 4.2, 0.9, 1.15);
  const tilt = sites.map(() => [r.range(-0.1, 0.1), r.range(-0.1, 0.1)]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const h = voronoi(sites, x + 0.5, y + 0.5);
    t.setI(i, OBSIDIAN[lv[i]]);
    t.height[i] = 0.8 + tilt[h.i1][0] * h.dx + tilt[h.i1][1] * h.dy - (h.d2 - h.d1 < 0.5 ? 0.06 : 0);
    t.smooth[i] = 198 + 14 * px[i];
    t.f0[i] = 12;
  }
  // Vetas violetas diagonales.
  for (let k = 0; k < 4; k++) {
    let x = r.int(0, 15);
    let y = r.int(0, 15);
    const len = r.int(3, 6);
    const dx = r.chance(0.5) ? 1 : -1;
    for (let s = 0; s < len; s++) {
      const end = s === 0 || s === len - 1;
      const i = idx(x, y);
      t.setI(i, end ? [50, 34, 78] : [70, 48, 104]);
      if (k < 2 && s === Math.floor(len / 2)) t.setI(i, [112, 84, 160]);
      t.smooth[i] = 186;
      x += dx;
      if (r.chance(0.7)) y -= 1;
    }
  }
  t.depth = 1.0;
}

/** Estilos de las menas clásicas (para sus versiones de pizarra profunda). */
export const ORE_STYLES: Record<string, OreStyle> = { coal: COAL, iron: IRON, gold: GOLD, diamond: DIAMOND, lapis: LAPIS, redstone: REDSTONE };

export const STONE_GENERATORS: Record<string, Generator> = {
  stone: stoneBase,
  cobblestone: (t) => cobblestone(t, false),
  mossy_cobblestone: (t) => cobblestone(t, true),
  stone_bricks: stoneBricks,
  granite: (t) => speckled(t, GRANITE),
  diorite: (t) => speckled(t, DIORITE),
  andesite: (t) => speckled(t, ANDESITE),
  bedrock,
  obsidian,
  coal_ore: (t) => ore(t, COAL),
  iron_ore: (t) => ore(t, IRON),
  gold_ore: (t) => ore(t, GOLD),
  diamond_ore: (t) => ore(t, DIAMOND),
  lapis_ore: (t) => ore(t, LAPIS),
  redstone_ore: (t) => ore(t, REDSTONE),
};

/** Distribución de celdas reutilizable (grava). */
export { cellLayout };
