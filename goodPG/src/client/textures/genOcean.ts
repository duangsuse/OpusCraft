// Fase 6.5 (océano y plantas): texturas procedurales del mar y de las plantas nuevas.
// - Corales de cinco tipos (tubo, cerebro, burbuja, fuego y cuerno): bloque con su dibujo (poros,
//   surcos, burbujas, llamas o ramas), coral ramificado y gorgonia en abanico; los muertos, con los
//   mismos dibujos en grises pardos.
// - Algas (punta y tallo) y bloque de algas secas, plantas marinas (corta y alta), pepino de mar,
//   prismarina (moteada, en ladrillos y oscura) y esponjas (seca y mojada).
// - Flores altas de dos bloques, hierba alta y helecho grande (en gris: se tintan con el bioma),
//   anflorcha, arbusto de bayas dulces (4 fases), hojas de azalea, plantaformas, liquen luminoso,
//   raíces colgantes y flor de esporas.

import {
  N, Noise, Tex, clamp, field, gray, idx, lerp, line, luma, mix, pixelNoise, rankLevels, scatter, voronoi, type Generator,
  type RGB,
} from './texCore';
import { cutoutCanvas, sprite, type Ink } from './genPlants';
import { leaves } from './genWood';

const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16;

// ---------------------------------------------------------------------------
// Corales
// ---------------------------------------------------------------------------

type CoralStyle = 'tube' | 'brain' | 'bubble' | 'fire' | 'horn';

/** 5 tonos (oscuro → claro) de cada coral vivo. */
const CORAL_PAL: Record<CoralStyle, RGB[]> = {
  tube: [[26, 44, 140], [38, 66, 184], [52, 92, 216], [78, 126, 236], [124, 168, 250]],
  brain: [[146, 46, 106], [184, 70, 136], [208, 96, 162], [228, 128, 186], [244, 170, 212]],
  bubble: [[106, 18, 116], [142, 28, 152], [172, 48, 182], [198, 82, 206], [222, 128, 228]],
  fire: [[126, 18, 22], [162, 28, 32], [194, 42, 42], [220, 70, 58], [240, 112, 90]],
  horn: [[156, 126, 28], [192, 160, 42], [218, 190, 58], [236, 212, 88], [248, 234, 140]],
};

/** El coral muerto: mismo dibujo en gris pardo (algo más claro cuanto más claro era). */
function deadPal(pal: RGB[]): RGB[] {
  return pal.map((c, i) => {
    const l = luma(c) * 0.55 + 52 + i * 6;
    return [l * 1.02, l * 0.98, l * 0.92] as RGB;
  });
}

function coralPal(style: CoralStyle, dead: boolean): RGB[] {
  return dead ? deadPal(CORAL_PAL[style]) : CORAL_PAL[style];
}

/** Bloque de coral: fondo moteado con el dibujo propio de cada tipo. */
function coralBlock(t: Tex, style: CoralStyle, dead: boolean): void {
  const pal = coralPal(style, dead);
  const r = t.rng();
  const n4 = new Noise(r, 4), n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.45 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.25 * px[i]);
  const lv = rankLevels(v, [8, 22, 36, 24, 10]);
  const level = new Float32Array(N);
  for (let i = 0; i < N; i++) level[i] = lv[i];
  const h = new Float32Array(N).fill(0.7);
  if (style === 'tube' || style === 'bubble') {
    // Poros (tubo) o burbujas (burbuja): círculos con el centro oscuro o el brillo arriba a la izquierda.
    const sites = scatter(r, style === 'tube' ? 13 : 9, style === 'tube' ? 3.4 : 4.2, 0.8, style === 'tube' ? 1.1 : 1.6);
    for (let i = 0; i < N; i++) {
      const hit = voronoi(sites, (i & 15) + 0.5, (i >> 4) + 0.5);
      const rad = style === 'tube' ? 1.7 : 2.2;
      if (hit.d1 < rad * 0.55) {
        level[i] = style === 'tube' ? 0 : 4;
        h[i] = style === 'tube' ? 0.2 : 1;
      } else if (hit.d1 < rad) {
        const lit = style === 'bubble' && hit.dx < 0 && hit.dy < 0;
        level[i] = lit ? 4 : 3;
        h[i] = 0.95;
      }
    }
  } else if (style === 'brain') {
    // Surcos sinuosos como un cerebro.
    const w1 = new Noise(r, 3), w2 = new Noise(r, 5);
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const s = Math.sin((x + y * 0.6) * 1.35 + w1.at(x, y) * 7 + w2.at(x, y) * 3);
      if (s > 0.55) {
        level[i] = Math.min(4, level[i] + 1.5);
        h[i] = 1;
      } else if (s < -0.6) {
        level[i] = Math.max(0, level[i] - 1.5);
        h[i] = 0.35;
      }
    }
  } else if (style === 'fire') {
    // Llamas: vetas verticales que se estrechan hacia arriba.
    const vert = new Noise(r, 6, 2);
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const f = vert.at(x, y) + (y / 16) * 0.25;
      if (f > 0.68) {
        level[i] = 4;
        h[i] = 1;
      } else if (f < 0.3) {
        level[i] = Math.max(0, level[i] - 1);
        h[i] = 0.4;
      }
    }
  } else {
    // Cuerno: ramitas claras cruzadas.
    for (let k = 0; k < 7; k++) {
      let x = r.int(0, 15), y = r.int(0, 15);
      const dx = r.chance(0.5) ? 1 : -1;
      for (let s = 0; s < 6; s++) {
        const i = idx(x, y);
        level[i] = 4;
        h[i] = 1;
        if (r.chance(0.5)) x += dx; else y -= 1;
      }
    }
  }
  for (let i = 0; i < N; i++) {
    t.setI(i, pal[clamp(Math.round(level[i]), 0, 4)]);
    t.height[i] = h[i] + 0.1 * (n8.at(i & 15, i >> 4) - 0.5);
    t.smooth[i] = dead ? 30 : 70;
  }
  t.depth = 1.2;
}

/** Coral (planta): ramas que salen del pie y se bifurcan, con la punta según el tipo. */
function coralPlant(t: Tex, style: CoralStyle, dead: boolean): void {
  cutoutCanvas(t, dead ? 30 : 70, dead ? 40 : 120);
  const pal = coralPal(style, dead);
  const r = t.rng();
  const put = (x: number, y: number, l: number, hh = 0.8) => {
    if (inB(x, y)) t.paint(x, y, pal[clamp(l, 0, 4)], hh);
  };
  if (style === 'tube') {
    // Tubos verticales con la boca abierta.
    for (const [x0, top] of [[3, 5], [6, 2], [9, 4], [12, 7], [7, 9]] as [number, number][]) {
      for (let y = 15; y >= top; y--) {
        put(x0, y, 2 + (y < top + 2 ? 1 : 0));
        put(x0 + 1, y, 1);
      }
      put(x0, top - 1, 4, 1);
      put(x0 + 1, top - 1, 3, 1);
      put(x0, top, 0, 0.3);
    }
    return;
  }
  const branches: [number, number, number, number][] = [[7.5, 15, 0, 0]]; // x, y, dirección (rad desde vertical), gen
  const tips: [number, number][] = [];
  const thick = style === 'horn' || style === 'brain' ? 2 : 1;
  while (branches.length) {
    const [bx, by, dir, gen] = branches.pop()!;
    const len = r.int(3, 5) - gen;
    let x = bx, y = by;
    for (let s = 0; s < len; s++) {
      x += Math.sin(dir) * 1.1;
      y -= Math.cos(dir) * 1.1;
      const ix = Math.round(x), iy = Math.round(y);
      put(ix, iy, 1 + (s % 2) + (gen > 1 ? 1 : 0));
      if (thick > 1 && gen < 2) put(ix + 1, iy, 1);
    }
    if (gen < 3 && y > 3) {
      const spread = style === 'fire' ? 0.35 : 0.6;
      branches.push([x, y, dir - spread - r.range(0, 0.3), gen + 1], [x, y, dir + spread + r.range(0, 0.3), gen + 1]);
    } else tips.push([Math.round(x), Math.round(y)]);
  }
  for (const [x, y] of tips) {
    if (style === 'bubble') {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, -1], [1, -1]]) put(x + dx, y + dy, 3, 1);
      put(x, y - 1, 4, 1);
    } else if (style === 'horn') {
      for (let dx = -1; dx <= 1; dx++) put(x + dx, y, 4, 1);
      put(x, y - 1, 3, 1);
    } else if (style === 'fire') {
      put(x, y - 1, 4, 1);
      put(x, y - 2, 3, 1);
    } else {
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) put(x + dx, y + dy, 3 + (dy < 0 ? 1 : 0), 1);
    }
  }
}

/** Gorgonia: abanico de nervios que salen del pie, con una malla fina entre ellos. */
function coralFan(t: Tex, style: CoralStyle, dead: boolean): void {
  cutoutCanvas(t, dead ? 30 : 60, dead ? 40 : 140);
  const pal = coralPal(style, dead);
  const r = t.rng();
  const cx = 7.5, cy = 15.5;
  const ribs = style === 'brain' ? 7 : style === 'fire' ? 9 : 6;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x + 0.5 - cx, dy = cy - (y + 0.5);
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dx, dy); // 0 hacia arriba
      if (d > 11 + Math.sin(a * 5 + 1) * 1.2 || Math.abs(a) > 1.25 || d < 1) continue;
      const u = ((a + 1.25) / 2.5) * ribs;
      const rib = Math.abs(u - Math.round(u)) < 0.18;
      const ring = Math.abs(((d * 0.9) % 2) - 1) < 0.28;
      const mesh = style === 'horn' ? (x + y) % 2 === 0 : style === 'bubble' ? ring : ring || (x * 3 + y) % 4 === 0;
      if (!rib && !mesh && r.chance(0.55)) continue;
      const edge = d > 9.5;
      t.paint(x, y, pal[clamp(rib ? 1 : edge ? 4 : 2 + (r.chance(0.4) ? 1 : 0), 0, 4)], rib ? 0.95 : 0.8);
    }
  }
  // Pie.
  t.paint(7, 15, pal[0], 0.9);
  t.paint(8, 15, pal[0], 0.9);
  t.paint(7, 14, pal[1], 0.9);
}

// ---------------------------------------------------------------------------
// Algas, plantas marinas y pepinos de mar
// ---------------------------------------------------------------------------

const KELP: RGB[] = [[46, 80, 22], [62, 102, 30], [80, 126, 40], [102, 148, 52], [126, 170, 66]];
const SEAGRASS_PAL: RGB[] = [[34, 96, 36], [48, 124, 46], [66, 152, 58], [92, 178, 76], [128, 204, 104]];

/** Alga: tallo ondulado con hojas alargadas que salen a los lados; la punta se estrecha. */
function kelp(t: Tex, top: boolean): void {
  cutoutCanvas(t, 60, 180);
  const r = t.rng();
  const stemX = (y: number) => Math.round(7.5 + Math.sin(y * 0.7 + 1) * 1.2);
  const from = top ? 3 : 0;
  for (let y = from; y < 16; y++) {
    const x = stemX(y);
    t.paint(x, y, KELP[1], 0.8);
    t.paint(x + 1, y, KELP[2], 0.85);
  }
  // Hojas alternas: láminas de 3–5 px inclinadas hacia arriba.
  for (let y = from + 1, side = r.chance(0.5) ? 1 : -1; y < 16; y += 3, side = -side) {
    const len = top && y < 7 ? 3 : r.int(4, 6);
    const x0 = stemX(y) + (side > 0 ? 2 : -1);
    for (let k = 0; k < len; k++) {
      const x = x0 + side * k, yy = y - Math.floor(k / 2);
      if (!inB(x, yy)) continue;
      t.paint(x, yy, KELP[3 - (k === len - 1 ? 1 : 0)], 0.9);
      if (k < len - 1 && inB(x, yy + 1) && !t.isOpaque(x, yy + 1)) t.paint(x, yy + 1, KELP[2], 0.85);
    }
  }
  if (top) {
    const x = stemX(3);
    t.paint(x, 2, KELP[3], 1);
    t.paint(x + 1, 1, KELP[4], 1);
    t.paint(x - 1, 3, KELP[3], 0.9);
  }
}

/** Briznas finas que salen de abajo (plantas marinas, hierba alta): `tallTop` → siguen hasta arriba. */
function blades(t: Tex, pal: RGB[] | null, from: number, reachTop: boolean, count: number, seed = ''): void {
  const r = t.rng(seed);
  const xs: number[] = [];
  for (let k = 0; k < count; k++) xs.push(clamp(Math.round(2 + (k + r.range(0, 0.8)) * (12 / count)), 1, 14));
  for (const x0 of xs) {
    const top = reachTop ? 0 : r.int(from, from + 6);
    const lean = r.range(-1.6, 1.6);
    const len = 16 - top;
    for (let s = 0; s < len; s++) {
      const y = 15 - s;
      const p = s / Math.max(1, len - 1);
      const x = reachTop ? Math.round(x0 + Math.sin(y * 0.4 + x0 * 1.7) * 0.8 + lean * p * 0.3) : Math.round(x0 + lean * Math.pow(p, 1.5));
      if (!inB(x, y)) continue;
      const c = pal ? pal[clamp(Math.round(1 + p * 3), 0, 4)] : gray(lerp(130, 214, p));
      t.paint(x, y, c, 0.7 + 0.3 * p);
    }
  }
}

function seagrass(t: Tex, part: 'short' | 'bottom' | 'top'): void {
  cutoutCanvas(t, 70, 200);
  if (part === 'short') blades(t, SEAGRASS_PAL, 3, false, 6);
  else if (part === 'bottom') blades(t, SEAGRASS_PAL, 0, true, 5);
  else blades(t, SEAGRASS_PAL, 1, false, 5, 'top');
}

/** Pepino de mar: gelatina verde con puntos más claros (se ve en los lados y la tapa de cada pepino). */
function seaPickle(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  const pal: RGB[] = [[58, 82, 26], [76, 104, 34], [96, 126, 44], [124, 150, 58], [176, 200, 96]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let l = Math.round(1 + n.at(x, y) * 2 + px[i] * 0.8);
    if ((x * 7 + y * 5) % 11 === 0) l = 4;
    t.setI(i, pal[clamp(l, 0, 4)]);
    t.height[i] = 0.7 + 0.1 * l;
    t.smooth[i] = 150;
    t.sss[i] = 160;
    t.emit[i] = l === 4 ? 120 : 0;
  }
}

// ---------------------------------------------------------------------------
// Bloque de algas secas, prismarina y esponjas
// ---------------------------------------------------------------------------

const DRIED: RGB[] = [[34, 38, 20], [46, 52, 26], [58, 64, 32], [72, 78, 40], [88, 92, 50]];

function driedKelpTop(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const d = Math.hypot(x - 7.5, y - 7.5);
    const ring = Math.floor(d * 1.3) % 2;
    t.setI(i, DRIED[clamp(1 + ring + Math.round(px[i] * 1.4), 0, 4)]);
    t.height[i] = ring ? 0.8 : 0.55;
    t.smooth[i] = 40;
  }
}

function driedKelpSide(t: Tex): void {
  const r = t.rng();
  const col = new Noise(r, 16, 1);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const band = y === 4 || y === 11;
    const l = band ? 0 : Math.round(1 + col.at(x, 0) * 2.2 + px[i] * 0.8);
    t.setI(i, band ? [40, 30, 18] : DRIED[clamp(l, 0, 4)]);
    t.height[i] = band ? 0.5 : 0.7 + col.at(x, 0) * 0.3;
    t.smooth[i] = 40;
  }
}

const PRISM: RGB[] = [[58, 106, 96], [72, 132, 118], [88, 154, 136], [106, 172, 154], [140, 196, 180]];

function prismarine(t: Tex): void {
  const r = t.rng();
  const sites = scatter(r, 10, 3.6, 0.8, 1.3);
  const tone = sites.map(() => r.int(1, 3));
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const hit = voronoi(sites, (i & 15) + 0.5, (i >> 4) + 0.5);
    const edge = hit.d2 - hit.d1 < 0.7;
    const l = edge ? 0 : clamp(tone[hit.i1] + (px[i] > 0.85 ? 1 : 0), 0, 4);
    t.setI(i, PRISM[l]);
    t.height[i] = edge ? 0.4 : 0.8;
    t.smooth[i] = 110;
  }
  t.depth = 1.1;
}

function prismarineBricks(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const n = new Noise(r, 4);
  const pal: RGB[] = [[62, 118, 104], [86, 156, 138], [100, 172, 152], [116, 186, 166], [150, 208, 190]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const row = y >> 3;
    const bx = (x + (row ? 8 : 0)) & 15;
    const mortar = (y & 7) === 7 || (bx & 15) === 15 || bx === 7;
    const l = mortar ? 0 : clamp(Math.round(1.5 + n.at(x, y) * 1.5 + px[i] * 0.8), 1, 4);
    t.setI(i, pal[l]);
    t.height[i] = mortar ? 0.3 : 0.85;
    t.smooth[i] = 110;
  }
}

function darkPrismarine(t: Tex): void {
  const r = t.rng();
  const px = pixelNoise(r);
  const pal: RGB[] = [[22, 42, 36], [32, 58, 50], [42, 72, 62], [54, 88, 76], [72, 110, 96]];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const grid = x % 8 === 0 || y % 8 === 0;
    const inner = (x % 8 === 3 || x % 8 === 4) && (y % 8 === 3 || y % 8 === 4);
    const l = grid ? 0 : inner ? 3 : clamp(Math.round(1.5 + px[i] * 1.2), 1, 3);
    t.setI(i, pal[l]);
    t.height[i] = grid ? 0.35 : inner ? 1 : 0.8;
    t.smooth[i] = 120;
  }
}

function sponge(t: Tex, wet: boolean): void {
  const r = t.rng();
  const pal: RGB[] = wet
    ? [[88, 80, 26], [122, 110, 36], [146, 134, 46], [166, 156, 60], [188, 178, 84]]
    : [[140, 128, 36], [178, 166, 52], [202, 192, 66], [220, 212, 90], [236, 230, 126]];
  const n4 = new Noise(r, 4);
  const px = pixelNoise(r);
  const holes = scatter(r, wet ? 16 : 13, 2.8, 0.6, 1.1);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const hit = voronoi(holes, x + 0.5, y + 0.5);
    let l = clamp(Math.round(1.5 + n4.at(x, y) * 1.6 + px[i] * 0.6), 1, 4);
    let h = 0.8;
    if (hit.d1 < 0.9) {
      l = 0;
      h = 0.15;
    } else if (hit.d1 < 1.5 && hit.dy > 0) l = Math.max(1, l - 1);
    t.setI(i, pal[l]);
    t.height[i] = h;
    t.smooth[i] = wet ? 150 : 25;
  }
  t.depth = 1.3;
}

// ---------------------------------------------------------------------------
// Flores altas, hierba alta y helecho grande
// ---------------------------------------------------------------------------

const G: Record<string, Ink> = {
  g: { c: [74, 128, 44], h: 0.8 },
  G: { c: [52, 98, 32], h: 0.75 },
  l: { c: [96, 156, 58], h: 0.85 },
  L: { c: [66, 118, 40], h: 0.8 },
};

/** Tallo con hojas (mitad de abajo de las flores altas). */
const LEAFY_BOTTOM = [
  '.......gG.......',
  '...l...gG...l...',
  '...Ll..gG..lL...',
  '....Ll.gG.lL....',
  '.......gG.......',
  '.l.....gG.....l.',
  '.Ll....gG....lL.',
  '..LLl..gG..lLL..',
  '....L..gG..L....',
  '.......gG.......',
  '..l....gG....l..',
  '..Lll..gG..llL..',
  '...LLl.gG.lLL...',
  '.....LlgGlL.....',
  '.......gG.......',
  '.......gG.......',
];

const TALL_SPRITES: Record<string, { rows: string[]; inks: Record<string, Ink> }> = {
  sunflower_bottom: { rows: LEAFY_BOTTOM, inks: G },
  sunflower_top: {
    rows: [
      '................',
      '.....yYyYy......',
      '...yYYyyyYYy....',
      '..yYybbbbbyYy...',
      '..Yybbdbbdbyy...',
      '.yYbdbbdbbbYy...',
      '.yybbbdbbdbyY...',
      '..YybdbbbbbYy...',
      '..yYybbdbbyYy...',
      '...yYYyyyYYy....',
      '.....yYyYy......',
      '.......gG.......',
      '...l...gG.......',
      '...LLl.gG.......',
      '.....LlgG.......',
      '.......gG.......',
    ],
    inks: { ...G, y: { c: [250, 210, 40], h: 1 }, Y: { c: [226, 172, 24], h: 0.95 }, b: { c: [96, 62, 24], h: 1.05 }, d: { c: [60, 38, 14], h: 1 } },
  },
  lilac_bottom: { rows: LEAFY_BOTTOM, inks: G },
  lilac_top: {
    rows: [
      '......p.........',
      '.....pPp..q.....',
      '....pPqPp.qp....',
      '...pqPpqPpPq....',
      '....PpqPqPpqp...',
      '...qpPqpPqPp....',
      '....pPpqPpqP....',
      '.....qPpPqp..p..',
      '..p...pqPp..pPp.',
      '.pPp...gG..pqP..',
      '..qPp..gG...Pp..',
      '...Ll..gG...l...',
      '....Ll.gG..lL...',
      '.....LlgG.lL....',
      '.......gGlL.....',
      '.......gG.......',
    ],
    inks: { ...G, p: { c: [214, 160, 222], h: 1 }, P: { c: [182, 118, 196], h: 0.95 }, q: { c: [236, 196, 240], h: 1.05 } },
  },
  rose_bush_bottom: {
    rows: [
      '..lLl.lLLl.lLl..',
      '.lLLGlLGGLlLGLl.',
      '.LGgLLGgGLLgGL..',
      'lLGLlLrRLGLlLGl.',
      '.LGLLGRrGLLGLGL.',
      '.lLGLLGgLLGLGLl.',
      '..LGLlLGGLlLGL..',
      '.lLLGlgGgLGlLLl.',
      '..LGLLgGLLGLGL..',
      '...LGL.gG.LGL...',
      '....L..gG..L....',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
    ],
    inks: { ...G, r: { c: [216, 30, 40], h: 1 }, R: { c: [164, 18, 30], h: 0.95 } },
  },
  rose_bush_top: {
    rows: [
      '................',
      '................',
      '.....lLl.lLl....',
      '...lLrRLlLGLl...',
      '..lLGRrLLrRLLl..',
      '..LGLLGLLRrGLL..',
      '.lLrRLLGLLGLrRl.',
      '.LLRrGLlLGLLRrL.',
      '.lLGLLrRLLGLGLl.',
      '..LGLLRrGLLGLL..',
      '..lLGLLGgLGLLl..',
      '...LLGLgGLGLL...',
      '....LLlgGlLL....',
      '......LgGL......',
      '.......gG.......',
      '.......gG.......',
    ],
    inks: { ...G, r: { c: [216, 30, 40], h: 1 }, R: { c: [164, 18, 30], h: 0.95 } },
  },
  peony_bottom: { rows: LEAFY_BOTTOM, inks: G },
  peony_top: {
    rows: [
      '................',
      '....pPp..pPp....',
      '...pPqPppPqPp...',
      '..pPqqPPPqqPp...',
      '..PqpPqPqPpqP...',
      '.pPPqPpqPpPPp...',
      '..pPqPPqPPqPp.p.',
      '...pPPqPqPPp.pPp',
      '.pPp.pPPPp...PqP',
      '.PqP...gG....pP.',
      '..p..l.gG..l....',
      '....lL.gG.lL....',
      '.....LlgGlL.....',
      '......LgGL......',
      '.......gG.......',
      '.......gG.......',
    ],
    inks: { ...G, p: { c: [236, 170, 214], h: 1 }, P: { c: [210, 130, 186], h: 0.95 }, q: { c: [250, 214, 236], h: 1.05 } },
  },
  pitcher_plant_bottom: {
    rows: [
      '................',
      '....tTTTTTt.....',
      '...tTttttTTt....',
      '...TtssssstT....',
      '...TtsSSSstT....',
      '...TtsSSSstT....',
      '...TtsSSSstT....',
      '...tTsSSSsTt....',
      '....TtsSstT.....',
      '....tTtttTt.....',
      '.l...TTTTT...l..',
      '.Ll...gGg...lL..',
      '..LLl.gGg.lLL...',
      '....LlgGglL.....',
      '......gGg.......',
      '......gGg.......',
    ],
    inks: { ...G, t: { c: [86, 150, 132], h: 1 }, T: { c: [58, 116, 104], h: 0.95 }, s: { c: [44, 70, 92], h: 0.6 }, S: { c: [30, 44, 66], h: 0.5 } },
  },
  pitcher_plant_top: {
    rows: [
      '................',
      '.....bB.Bb......',
      '....bBBbBBb.....',
      '...bBvBBBvBb....',
      '....BvvBvvB.....',
      '.....BvvvB......',
      '......tTt.......',
      '.....tTTTt......',
      '....tTsssTt.....',
      '....TtsSstT.....',
      '....TtsSstT.....',
      '....tTsSsTt.....',
      '.....TtttT......',
      '.....tTTTt......',
      '......tTt.......',
      '......tTt.......',
    ],
    inks: {
      ...G, t: { c: [86, 150, 132], h: 1 }, T: { c: [58, 116, 104], h: 0.95 }, s: { c: [44, 70, 92], h: 0.6 }, S: { c: [30, 44, 66], h: 0.5 },
      b: { c: [120, 150, 236], h: 1 }, B: { c: [80, 104, 200], h: 0.95 }, v: { c: [150, 96, 210], h: 1 },
    },
  },
  small_dripleaf_bottom: {
    rows: [
      '................',
      '................',
      '..lLl......lLl..',
      '.lLLLl....lLLLl.',
      '..LLL.g..G.LLL..',
      '....LLg..GLL....',
      '......g..G......',
      '......gg.G......',
      '.......g.G......',
      '.......gGG......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '......gGgG......',
      '.....g.gG.G.....',
    ],
    inks: G,
  },
  small_dripleaf_top: {
    rows: [
      '................',
      '................',
      '................',
      '.lllll....LLLLL.',
      'lLlllLl..LLlLLLL',
      'LLLlLLL..LLLLlLL',
      '.LLLLL....LLLLL.',
      '...g........G...',
      '....g......G....',
      '.....g....G.....',
      '......g..G......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
    ],
    inks: G,
  },
  torchflower: {
    rows: [
      '................',
      '.......o........',
      '......oOo.......',
      '.....oOyOo......',
      '....oOyYyOo.....',
      '.....OyYyO......',
      '......rrr.......',
      '.......gG.......',
      '...l...gG.......',
      '...Ll..gG..l....',
      '....Ll.gG.lL....',
      '.......gGlL.....',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
      '.......gG.......',
    ],
    inks: {
      ...G, o: { c: [236, 96, 30], h: 1, emit: 40 }, O: { c: [206, 62, 22], h: 0.95 }, y: { c: [252, 196, 56], h: 1.05, emit: 60 },
      Y: { c: [255, 236, 140], h: 1.1, emit: 90 }, r: { c: [120, 40, 30], h: 0.9 },
    },
  },
};

function tallSprite(t: Tex, key: string): void {
  cutoutCanvas(t, 65, 210);
  const s = TALL_SPRITES[key];
  sprite(t, s.rows, s.inks);
}

/** Hierba alta (gris: se tinta): abajo briznas hasta arriba; arriba se afinan y acaban. */
function tallGrass(t: Tex, top: boolean): void {
  cutoutCanvas(t, 62, 230);
  const r = t.rng();
  interface Blade { x0: number; end: number; lean: number; phase: number; base: number; tip: number }
  const list: Blade[] = [];
  for (let x0 = 1; x0 <= 14; x0++) {
    if (r.chance(top ? 0.35 : 0.45)) continue;
    const center = 1 - Math.abs(x0 - 7.5) / 7;
    list.push({
      x0,
      // Abajo casi todas siguen hasta arriba; arriba acaban a distintas alturas (más altas en el centro).
      end: top ? Math.round(lerp(11, 1, center * 0.75 + r.next() * 0.25)) : r.chance(0.8) ? 0 : r.int(1, 5),
      lean: (x0 - 7.5) * (top ? 0.45 : 0.2) + r.range(-1.2, 1.2),
      phase: r.range(0, 6.3),
      base: r.range(112, 140),
      tip: r.range(176, 222),
    });
  }
  list.sort((a, b) => a.tip - b.tip);
  for (const b of list) {
    const len = 16 - b.end;
    for (let s = 0; s < len; s++) {
      const y = 15 - s;
      const p = s / Math.max(1, len - 1);
      const x = top
        ? Math.round(b.x0 + b.lean * Math.pow(p, 1.6))
        : Math.round(b.x0 + Math.sin(y * 0.35 + b.phase) * 0.7 + b.lean * p);
      if (!inB(x, y)) continue;
      const g = top ? lerp(b.base + 30, b.tip, p) : lerp(b.base, b.base + 40, p);
      t.paint(x, y, gray(g), 0.7 + 0.3 * p);
    }
  }
}

/** Helecho grande (gris): frondes con pinnas; abajo el arranque, arriba las puntas. */
function largeFern(t: Tex, top: boolean): void {
  cutoutCanvas(t, 60, 230);
  const fronds: [number, number, number, number][] = top
    ? [[7.5, 16, 1, 3], [8, 16, 7.5, 0.5], [8.5, 16, 14.5, 3]]
    : [[7.5, 16, 0.5, 4], [8, 16, 4.5, 0], [8.5, 16, 11.5, 0], [8.5, 16, 15.5, 4]];
  for (const [x0, y0, x1, y1] of fronds) {
    let n = 0;
    line(Math.round(x0), Math.round(y0 - 1), Math.round(x1), Math.round(y1), (x, y) => {
      if (!inB(x, y)) return;
      t.paint(x, y, gray(150), 0.85);
      if (n++ % 2 === 0) {
        for (const side of [-1, 1]) {
          const px = x + side, py = y - 1;
          if (inB(px, py) && !t.isOpaque(px, py)) t.paint(px, py, gray(200 - (side > 0 ? 14 : 0)), 0.95);
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Bayas dulces
// ---------------------------------------------------------------------------

const BUSH: Record<string, Ink> = {
  a: { c: [72, 118, 48], h: 1 },
  b: { c: [52, 94, 36], h: 0.9 },
  c: { c: [36, 70, 26], h: 0.8 },
  s: { c: [96, 70, 40], h: 0.7 },
};

function berryBush(t: Tex, stage: number): void {
  cutoutCanvas(t, 55, 200);
  if (stage === 0) {
    sprite(t, [
      '........', '..a..a..', '.aba.ab.', '..bab.a.', '...bab..', '....s...', '....s...', '...ss...',
    ], BUSH, 4, 8);
    return;
  }
  const rows = [
    '................',
    '................',
    '.....abba.abb...',
    '...abbbcbabbcb..',
    '..abbcbbbbbcbba.',
    '..bbcbbabbbcbbb.',
    '.abbbbbbbcbbabca',
    '.bcbabbcbbbbbbcb',
    '.bbbbcbbbabcbbbb',
    '..bcbbbbcbbbbcb.',
    '..abbcbbsbbcbba.',
    '...cbbbbsbbbbc..',
    '.....cbbsbbc....',
    '.......ss.......',
    '.......s........',
    '......ss........',
  ];
  sprite(t, rows, BUSH);
  if (stage >= 2) {
    const berry: Ink = stage === 3 ? { c: [206, 30, 44], h: 1.1 } : { c: [170, 190, 110], h: 1.05 };
    const hi: Ink = stage === 3 ? { c: [250, 120, 120], h: 1.15 } : { c: [214, 226, 160], h: 1.1 };
    for (const [x, y] of [[4, 5], [9, 4], [12, 7], [6, 9], [2, 8], [10, 10], [13, 4]]) {
      t.paint(x, y, berry.c, berry.h);
      t.paint(x + 1, y, berry.c, berry.h);
      t.paint(x, y - 1, hi.c, hi.h);
    }
  }
}

// ---------------------------------------------------------------------------
// Azaleas y cuevas frondosas
// ---------------------------------------------------------------------------

const AZALEA_LEAF_PAL: RGB[] = [[58, 92, 30], [76, 114, 38], [94, 134, 46], [112, 152, 56], [132, 170, 70]];

function azaleaLeaves(t: Tex, flowering: boolean): void {
  leaves(t, { pal: AZALEA_LEAF_PAL, weights: [12, 24, 30, 22, 12], holeFrac: 0.14, needles: false });
  if (!flowering) return;
  const r = t.rng('flores');
  for (const s of scatter(r, 7, 4)) {
    const x = Math.floor(s.x), y = Math.floor(s.y);
    for (const [dx, dy, c] of [[0, 0, [250, 190, 230]], [1, 0, [224, 120, 196]], [0, 1, [224, 120, 196]], [-1, 0, [200, 96, 176]], [0, -1, [236, 150, 212]]] as [number, number, RGB][]) {
      const i = idx(x + dx, y + dy);
      if (t.alpha[i] === 0) continue;
      t.setI(i, c);
      t.height[i] = 1;
    }
  }
}

function bigDripleafTop(t: Tex): void {
  cutoutCanvas(t, 90, 150);
  t.tiling = true;
  const r = t.rng();
  const n = new Noise(r, 4);
  const pal: RGB[] = [[60, 110, 36], [76, 134, 44], [94, 156, 54], [116, 178, 66], [140, 196, 84]];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      // Hoja redondeada con muescas en el borde.
      const a = Math.atan2(dy, dx);
      if (d > 8.2 + Math.sin(a * 6) * 0.6) continue;
      const vein = Math.abs(dx) < 0.6 || Math.abs(Math.abs(dx) - Math.abs(dy) * 0.8) < 0.5;
      const l = vein ? 4 : clamp(Math.round(1 + n.at(x, y) * 2.2 + (d > 7 ? -1 : 0)), 0, 3);
      t.paint(x, y, pal[l], vein ? 0.95 : 0.8);
    }
  }
}

function bigDripleafStem(t: Tex): void {
  cutoutCanvas(t, 60, 180);
  for (let y = 0; y < 16; y++) {
    t.paint(7, y, [70, 124, 42], 0.8);
    t.paint(8, y, [54, 100, 34], 0.8);
    if (y % 5 === 2) t.paint(6, y, [86, 142, 52], 0.85);
  }
}

function glowLichen(t: Tex): void {
  cutoutCanvas(t, 50, 60);
  t.tiling = true;
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = n.at(x, y) * 0.7 + px[i] * 0.3;
    if (v < 0.45) continue;
    const glow = v > 0.78;
    t.paint(x, y, glow ? [150, 222, 196] : mix([84, 110, 100], [112, 146, 130], px[i]), glow ? 1 : 0.8, undefined, undefined, glow ? 220 : 0);
  }
}

function hangingRoots(t: Tex): void {
  cutoutCanvas(t, 40, 80);
  const r = t.rng();
  for (let k = 0; k < 6; k++) {
    let x = 2 + k * 2 + r.int(0, 1);
    const len = r.int(7, 14);
    for (let y = 0; y < len; y++) {
      if (!inB(x, y)) break;
      t.paint(x, y, mix([150, 104, 74], [112, 76, 52], y / len), 0.8);
      if (r.chance(0.25)) x += r.chance(0.5) ? 1 : -1;
    }
  }
}

/** Flor de esporas vista desde abajo: flor rosa de pétalos radiales con hojas verdes alrededor. */
function sporeBlossom(t: Tex): void {
  cutoutCanvas(t, 70, 190);
  t.tiling = true;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      if (d < 2) t.paint(x, y, [250, 214, 120], 1.1, undefined, undefined, 40);
      else if (d < 5.5 + Math.cos(a * 5) * 1.2) t.paint(x, y, d < 3.6 ? [236, 110, 170] : [214, 80, 150], 1);
      else if (d < 8 && Math.abs(Math.sin(a * 4 + 0.4)) > 0.55) t.paint(x, y, d > 7 ? [60, 110, 40] : [86, 142, 54], 0.8);
    }
  }
}

// ---------------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------------

const GENERATORS: Record<string, Generator> = {
  kelp: (t) => kelp(t, true),
  kelp_plant: (t) => kelp(t, false),
  dried_kelp_top: driedKelpTop,
  dried_kelp_side: driedKelpSide,
  seagrass: (t) => seagrass(t, 'short'),
  tall_seagrass_bottom: (t) => seagrass(t, 'bottom'),
  tall_seagrass_top: (t) => seagrass(t, 'top'),
  sea_pickle: seaPickle,
  prismarine,
  prismarine_bricks: prismarineBricks,
  dark_prismarine: darkPrismarine,
  sponge: (t) => sponge(t, false),
  wet_sponge: (t) => sponge(t, true),
  tall_grass_bottom: (t) => tallGrass(t, false),
  tall_grass_top: (t) => tallGrass(t, true),
  large_fern_bottom: (t) => largeFern(t, false),
  large_fern_top: (t) => largeFern(t, true),
  azalea_leaves: (t) => azaleaLeaves(t, false),
  flowering_azalea_leaves: (t) => azaleaLeaves(t, true),
  big_dripleaf_top: bigDripleafTop,
  big_dripleaf_stem: bigDripleafStem,
  glow_lichen: glowLichen,
  hanging_roots: hangingRoots,
  spore_blossom: sporeBlossom,
};
for (const style of ['tube', 'brain', 'bubble', 'fire', 'horn'] as CoralStyle[]) {
  for (const dead of [false, true]) {
    const pre = dead ? 'dead_' : '';
    GENERATORS[`${pre}${style}_coral_block`] = (t) => coralBlock(t, style, dead);
    GENERATORS[`${pre}${style}_coral`] = (t) => coralPlant(t, style, dead);
    GENERATORS[`${pre}${style}_coral_fan`] = (t) => coralFan(t, style, dead);
  }
}
for (const key of Object.keys(TALL_SPRITES)) GENERATORS[key] = (t) => tallSprite(t, key);
for (let s = 0; s < 4; s++) GENERATORS[`sweet_berry_bush_stage${s}`] = (t) => berryBush(t, s);

export const OCEAN_GENERATORS: Readonly<Record<string, Generator>> = GENERATORS;
