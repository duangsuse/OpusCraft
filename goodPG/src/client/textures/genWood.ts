// Generadores de madera: cortezas, cortes de tronco, tablones y hojas.

import {
  N,
  Noise,
  Tex,
  clamp,
  distanceTo,
  field,
  gray,
  idx,
  lerp,
  mix,
  pixelNoise,
  rankLevels,
  scale,
  scatter,
  smoothstep,
  wrap,
  wrapDelta,
  type Generator,
  type RGB,
} from './texCore';

// ---------------------------------------------------------------------------
// Corteza lateral (roble y abeto)
// ---------------------------------------------------------------------------

export interface BarkStyle {
  /** 5 tonos: 0 = fondo de surco … 4 = cresta iluminada. */
  pal: RGB[];
  grooves: number;
  wobble: number;
  cracks: number;
  smooth: number;
}

export function barkSide(t: Tex, st: BarkStyle): void {
  const r = t.rng();
  const gx: number[] = [];
  const off: Noise[] = [];
  for (let k = 0; k < st.grooves; k++) {
    gx.push(((k + r.range(0.25, 0.75)) * 16) / st.grooves);
    off.push(new Noise(r, 1, 4)); // desplazamiento del surco a lo largo de y (periódico)
  }
  const fib = new Noise(r, 16, 2); // fibras verticales
  const fib2 = new Noise(r, 8, 4);
  const px = pixelNoise(r);
  const ridge = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    let d = 99;
    for (let k = 0; k < gx.length; k++) {
      const c = gx[k] + (off[k].at(0, y) - 0.5) * 2 * st.wobble;
      d = Math.min(d, Math.abs(wrapDelta(x + 0.5 - c)));
    }
    ridge[i] = smoothstep(0.3, 1.7, d);
  }
  const v = field((x, y, i) => 0.6 * ridge[i] + 0.25 * fib.at(x, y) + 0.1 * fib2.at(x, y) + 0.05 * px[i]);
  const lv = rankLevels(v, [16, 22, 28, 22, 12]);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const l = ridge[i] < 0.12 ? 0 : lv[i];
    t.setI(i, st.pal[l]);
    t.height[i] = 0.25 + 0.6 * ridge[i] + 0.15 * fib.at(x, y);
    t.smooth[i] = st.smooth + 4 * l;
  }
  // Grietas horizontales que separan las placas de corteza.
  for (let k = 0; k < st.cracks; k++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = r.int(0, 15);
      const y = r.int(0, 15);
      if (ridge[idx(x, y)] < 0.7) continue;
      const len = r.int(1, 2);
      for (let s = 0; s < len; s++) {
        const i = idx(x + s, y);
        t.setI(i, st.pal[s === 0 ? 0 : 1]);
        t.height[i] = 0.35;
      }
      break;
    }
  }
  t.depth = 1.6;
}

const OAK_BARK: BarkStyle = {
  pal: [
    [62, 47, 28],
    [82, 63, 38],
    [99, 77, 47],
    [115, 90, 56],
    [130, 104, 66],
  ],
  grooves: 4,
  wobble: 1.1,
  cracks: 6,
  smooth: 28,
};

const SPRUCE_BARK: BarkStyle = {
  pal: [
    [40, 28, 17],
    [55, 39, 24],
    [69, 49, 30],
    [83, 60, 37],
    [97, 71, 45],
  ],
  grooves: 5,
  wobble: 0.8,
  cracks: 10,
  smooth: 26,
};

// ---------------------------------------------------------------------------
// Corteza de abedul
// ---------------------------------------------------------------------------

const BIRCH_BARK: RGB[] = [
  [190, 188, 180],
  [203, 201, 193],
  [214, 212, 204],
  [224, 222, 215],
];

function birchSide(t: Tex): void {
  const r = t.rng();
  const nh = new Noise(r, 4, 16); // vetas horizontales
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.5 * nh.at(x, y) + 0.3 * n8.at(x, y) + 0.2 * px[i]);
  const lv = rankLevels(v, [10, 25, 40, 25]);
  for (let i = 0; i < N; i++) {
    t.setI(i, BIRCH_BARK[lv[i]]);
    t.height[i] = 0.92 + 0.08 * v[i];
    t.smooth[i] = 72;
  }
  // Marcas negras horizontales (en filas no contiguas).
  const used = new Uint8Array(16);
  let placed = 0;
  for (let tries = 0; placed < 6 && tries < 200; tries++) {
    const y = r.int(0, 15);
    if (used[y] || used[wrap(y - 1)] || used[wrap(y + 1)]) continue;
    used[y] = 1;
    placed++;
    const x0 = r.int(0, 15);
    const len = r.int(2, 5);
    for (let s = 0; s < len; s++) {
      const end = s === 0 || s === len - 1;
      const i = idx(x0 + s, y);
      t.setI(i, end && len > 2 ? [80, 76, 70] : [44, 42, 40]);
      t.height[i] = 0.62;
      t.smooth[i] = 30;
    }
    if (len >= 4 && r.chance(0.6)) {
      for (let s = 1; s < len - 1; s++) {
        const i = idx(x0 + s, y + 1);
        t.setI(i, [62, 60, 56]);
        t.height[i] = 0.66;
        t.smooth[i] = 30;
      }
    }
  }
  // Lenticelas grises.
  for (let k = 0; k < 7; k++) {
    const x = r.int(0, 15);
    const y = r.int(0, 15);
    if (used[y]) continue;
    const len = r.int(1, 2);
    for (let s = 0; s < len; s++) {
      const i = idx(x + s, y);
      t.setI(i, [150, 146, 138]);
      t.height[i] = 0.85;
    }
  }
  t.depth = 1.2;
}

// ---------------------------------------------------------------------------
// Corte transversal del tronco
// ---------------------------------------------------------------------------

export interface LogTopStyle {
  bark: RGB[];
  /** 0 = anillo oscuro, 1 = anillo, 2 = madera, 3 = madera clara. */
  wood: RGB[];
  spacing: number;
  birch?: boolean;
}

export function logTop(t: Tex, st: LogTopStyle): void {
  const r = t.rng();
  const wob = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (x === 0 || y === 0 || x === 15 || y === 15) {
      let c = st.bark[px[i] < 0.3 ? 0 : px[i] < 0.75 ? 1 : 2];
      if (st.birch && px[i] > 0.82) c = [52, 50, 46];
      t.setI(i, c);
      t.height[i] = 1;
      t.smooth[i] = 30;
      continue;
    }
    const dx = x - 7.5;
    const dy = y - 7.5;
    const de = Math.sqrt(dx * dx + dy * dy);
    const dc = Math.max(Math.abs(dx), Math.abs(dy));
    const d = lerp(de, dc, 0.2) + (wob.at(x, y) - 0.5) * 0.6;
    const ring = d / st.spacing;
    const frac = ring - Math.floor(ring);
    const line = frac < 0.4;
    let c: RGB;
    if (d < 1) c = st.wood[0];
    else if (line) c = st.wood[Math.floor(ring) >= 3 ? 0 : 1];
    else c = st.wood[Math.floor(ring) & 1 ? 2 : 3];
    // Cámbium: el anillo pegado a la corteza, algo más oscuro.
    if (x === 1 || y === 1 || x === 14 || y === 14) c = mix(c, st.wood[0], 0.35);
    t.setI(i, c);
    t.height[i] = line && d >= 1 ? 0.84 : 0.9;
    t.smooth[i] = 48;
  }
  // Grieta radial (fenda de secado) desde el centro hacia un borde.
  const dirs: readonly (readonly [number, number])[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const [dx, dy] = r.pick(dirs);
  let x = 7 + (dx > 0 ? 1 : 0);
  let y = 7 + (dy > 0 ? 1 : 0);
  const len = r.int(4, 5);
  for (let s = 0; s < len; s++) {
    x += dx;
    y += dy;
    if (s > 0 && r.chance(0.35)) {
      x += dy;
      y += dx;
    }
    if (x <= 1 || y <= 1 || x >= 14 || y >= 14) break;
    const i = idx(x, y);
    t.setI(i, scale(st.wood[0], 0.82));
    t.height[i] = 0.6;
  }
  t.depth = 1.0;
}

const OAK_TOP: LogTopStyle = {
  bark: OAK_BARK.pal.slice(0, 3),
  wood: [
    [120, 94, 56],
    [146, 114, 68],
    [168, 134, 82],
    [184, 150, 94],
  ],
  spacing: 1.9,
};

const BIRCH_TOP: LogTopStyle = {
  bark: [BIRCH_BARK[0], BIRCH_BARK[2], BIRCH_BARK[3]],
  wood: [
    [168, 146, 98],
    [186, 166, 116],
    [202, 182, 132],
    [212, 194, 144],
  ],
  spacing: 1.9,
  birch: true,
};

const SPRUCE_TOP: LogTopStyle = {
  bark: SPRUCE_BARK.pal.slice(0, 3),
  wood: [
    [86, 60, 35],
    [102, 73, 43],
    [120, 87, 52],
    [134, 99, 60],
  ],
  spacing: 1.75,
};

// ---------------------------------------------------------------------------
// Tablones
// ---------------------------------------------------------------------------

export interface PlankStyle {
  light: RGB;
  base: RGB;
  dark: RGB;
  grain: RGB;
  seam: RGB;
  joint: RGB;
  smooth: number;
}

export const OAK_PLANKS: PlankStyle = {
  light: [176, 142, 88],
  base: [162, 128, 78],
  dark: [148, 116, 70],
  grain: [133, 102, 60],
  seam: [96, 72, 42],
  joint: [116, 88, 51],
  smooth: 58,
};

const BIRCH_PLANKS: PlankStyle = {
  light: [212, 194, 140],
  base: [200, 182, 128],
  dark: [188, 170, 116],
  grain: [174, 156, 104],
  seam: [136, 118, 76],
  joint: [158, 140, 92],
  smooth: 60,
};

const SPRUCE_PLANKS: PlankStyle = {
  light: [128, 92, 58],
  base: [116, 84, 52],
  dark: [106, 76, 46],
  grain: [93, 65, 40],
  seam: [60, 42, 24],
  joint: [80, 57, 33],
  smooth: 56,
};

/** Cuatro tablas horizontales de 4 px con junta inferior y una testa cada una. */
export function planks(t: Tex, st: PlankStyle, seed = 'planks'): void {
  const r = t.rng(seed);
  const px = pixelNoise(r);
  const grainN = new Noise(r, 4, 16); // vetas horizontales
  const joints: number[] = [];
  for (let b = 0; b < 4; b++) {
    let jx = 0;
    for (let tries = 0; tries < 50; tries++) {
      jx = r.int(0, 15);
      if (b === 0 || Math.abs(wrapDelta(jx - joints[b - 1])) >= 4) break;
    }
    joints.push(jx);
  }
  const tone: number[] = [];
  for (let b = 0; b < 4; b++) tone.push(r.range(-0.045, 0.045));
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    const b = y >> 2;
    const ry = y & 3;
    if (ry === 3) {
      t.setI(i, st.seam);
      t.height[i] = 0.25;
      t.smooth[i] = 30;
      continue;
    }
    if (x === joints[b]) {
      t.setI(i, st.joint);
      t.height[i] = 0.5;
      t.smooth[i] = 36;
      continue;
    }
    const g = grainN.at(x, y);
    let c = g > 0.66 ? st.dark : g < 0.3 ? st.light : st.base;
    if (ry === 0) c = mix(c, st.light, 0.5); // canto superior: recoge luz
    if (ry === 2) c = mix(c, st.dark, 0.5); // canto inferior: sombra
    t.setI(i, scale(c, 1 + tone[b]));
    t.height[i] = ry === 1 ? 1 : 0.94;
    t.smooth[i] = st.smooth + 6 * px[i];
  }
  // Vetas: trazos oscuros de 3 a 6 px que no cruzan la testa.
  for (let k = 0; k < 7; k++) {
    const b = k % 4;
    const y = b * 4 + r.int(0, 2);
    let x = r.int(0, 15);
    const len = r.int(3, 6);
    for (let s = 0; s < len; s++) {
      if (wrap(x) === joints[b]) break;
      const i = idx(x, y);
      t.setI(i, st.grain);
      t.height[i] -= 0.04;
      x++;
    }
  }
  t.depth = 1.3;
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

export interface LeafStyle {
  /** Tonos de oscuro a claro. */
  pal: RGB[];
  weights: number[];
  holeFrac: number;
  needles: boolean;
}

export function leaves(t: Tex, st: LeafStyle): void {
  const r = t.rng();
  const hole = new Uint8Array(N);
  const target = Math.round(st.holeFrac * N);
  let count = 0;
  const dig = (x: number, y: number): boolean => {
    const i = idx(x, y);
    if (hole[i]) return false;
    hole[i] = 1;
    count++;
    return true;
  };
  // Huecos: grupos compactos de 2–5 px bien repartidos (rendijas diagonales en las agujas).
  for (const s of scatter(r, 60, st.needles ? 3.0 : 3.5)) {
    if (count >= target) break;
    const x0 = Math.floor(s.x);
    const y0 = Math.floor(s.y);
    if (st.needles) {
      const dir = r.chance(0.5) ? 1 : -1;
      const len = r.int(2, 3);
      for (let k = 0; k < len; k++) dig(x0 + dir * k, y0 + k);
      continue;
    }
    const cells: (readonly [number, number])[] = [[x0, y0]];
    dig(x0, y0);
    const size = r.int(2, 5);
    for (let tries = 0; cells.length < size && tries < 30; tries++) {
      const [cx, cy] = r.pick(cells);
      const d = r.int(0, 3);
      const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (dig(nx, ny)) cells.push([nx, ny]);
    }
  }
  // Relleno con huecos sueltos (no pegados a otros) hasta la fracción deseada.
  for (let tries = 0; count < target && tries < 4000; tries++) {
    const x = r.int(0, 15);
    const y = r.int(0, 15);
    if (hole[idx(x, y)] || hole[idx(x + 1, y)] || hole[idx(x - 1, y)] || hole[idx(x, y + 1)] || hole[idx(x, y - 1)]) continue;
    dig(x, y);
  }
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = hole[i] ? 0 : 1;
  const dist = distanceTo(hole);
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.42 * n4.at(x, y) + 0.24 * n8.at(x, y) + 0.16 * px[i] + (0.18 * Math.min(dist[i], 3)) / 3);
  const lv = rankLevels(v, st.weights, solid);
  const top = st.pal.length - 1;
  for (let i = 0; i < N; i++) {
    const x = i & 15;
    const y = i >> 4;
    if (hole[i]) {
      t.alpha[i] = 0;
      t.height[i] = 0.2;
      continue;
    }
    let l = lv[i];
    if (hole[idx(x, y - 1)] || hole[idx(x - 1, y - 1)]) l += 1; // borde superior de un racimo: más luz
    if (hole[idx(x, y + 1)] || hole[idx(x + 1, y + 1)]) l -= 1; // borde inferior: sombra
    l = clamp(l, 0, top);
    t.setI(i, st.pal[l]);
    t.height[i] = 0.4 + 0.6 * smoothstep(0, 2.5, dist[i]) + 0.08 * (n8.at(x, y) - 0.5);
    t.smooth[i] = 70 + 5 * l;
    t.sss[i] = 200 + 55 * (1 - smoothstep(1, 3, dist[i]));
  }
  if (!st.needles) {
    // Puntas de hoja que atrapan la luz: trazos de 2 px del tono más claro, sobre
    // píxeles cuyo vecino inferior es hoja (no hueco).
    for (let k = 0, placed = 0; placed < 12 && k < 200; k++) {
      const x = r.int(0, 15);
      const y = r.int(0, 15);
      const dx = r.chance(0.5) ? 1 : -1;
      const a = idx(x, y);
      const b = idx(x + dx, y + 1);
      if (hole[a] || hole[b] || hole[idx(x, y + 1)]) continue;
      t.setI(a, st.pal[top]);
      t.setI(b, st.pal[top - 1]);
      t.height[a] += 0.06;
      placed++;
    }
  } else {
    // Agujas: trazos diagonales claros y oscuros.
    for (let k = 0; k < 22; k++) {
      let x = r.int(0, 15);
      let y = r.int(0, 15);
      const dx = r.chance(0.5) ? 1 : -1;
      const c = st.pal[r.chance(0.55) ? top : 0];
      for (let s = 0; s < 2; s++) {
        const i = idx(x, y);
        if (!hole[i]) t.setI(i, c);
        x += dx;
        y += 1;
      }
    }
  }
  t.depth = 1.3;
}

const OAK_LEAVES: LeafStyle = {
  pal: [gray(112), gray(131), gray(151), gray(172), gray(195), gray(218)],
  weights: [8, 16, 26, 24, 16, 10],
  holeFrac: 0.3,
  needles: false,
};

const BIRCH_LEAVES: LeafStyle = {
  pal: [
    [94, 130, 60],
    [110, 148, 72],
    [126, 166, 84],
    [142, 182, 96],
    [160, 198, 110],
  ],
  weights: [10, 20, 34, 22, 14],
  holeFrac: 0.3,
  needles: false,
};

const SPRUCE_LEAVES: LeafStyle = {
  pal: [
    [60, 110, 68],
    [78, 132, 82],
    [96, 154, 98],
    [114, 174, 112],
    [132, 192, 126],
  ],
  weights: [12, 22, 32, 22, 12],
  holeFrac: 0.28,
  needles: true,
};

export const WOOD_GENERATORS: Record<string, Generator> = {
  oak_log_side: (t) => barkSide(t, OAK_BARK),
  oak_log_top: (t) => logTop(t, OAK_TOP),
  oak_planks: (t) => planks(t, OAK_PLANKS),
  oak_leaves: (t) => leaves(t, OAK_LEAVES),
  birch_log_side: birchSide,
  birch_log_top: (t) => logTop(t, BIRCH_TOP),
  birch_planks: (t) => planks(t, BIRCH_PLANKS),
  birch_leaves: (t) => leaves(t, BIRCH_LEAVES),
  spruce_log_side: (t) => barkSide(t, SPRUCE_BARK),
  spruce_log_top: (t) => logTop(t, SPRUCE_TOP),
  spruce_planks: (t) => planks(t, SPRUCE_PLANKS),
  spruce_leaves: (t) => leaves(t, SPRUCE_LEAVES),
};
