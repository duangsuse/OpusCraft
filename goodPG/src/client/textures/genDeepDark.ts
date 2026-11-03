// Fase 7.5 (abismo): texturas del Deep Dark, todas dibujadas aquí (nada copiado):
// - sculk: celdas carnosas de un verde azulado casi negro con surcos y motas de «almas» que brillan;
// - venas: ramas finas del mismo color que se abren desde el centro (recorte);
// - catalizador: un armazón de hueso (arriba y en la franja alta de los lados) sobre el sculk, con almas
//   que se encienden al florecer;
// - sensores: la base de sculk con un borde claro, los zarcillos enroscados (apagados o encendidos) y, en
//   el calibrado, incrustaciones y un cristal de amatista;
// - chillador: base de sculk, mandíbula de hueso con dientes y la garganta oscura (con almas si invoca);
// - pizarra reforzada: pizarra oscura con refuerzos de hueso pálido en los bordes;
// - arena y tierra de alma (con caras que asoman), fuego, antorcha y farol de alma (llama azul).
import { N, S, Noise, Tex, clamp, mix, pixelNoise, scale, scatter, voronoi, line, type Generator, type RGB } from './texCore';
import { cutoutCanvas, sprite, type Ink } from './genPlants';
import { deepslateBase } from './genUnderground';

const TAU = Math.PI * 2;
const SCULK: RGB[] = [[4, 15, 21], [7, 25, 33], [10, 35, 45], [15, 47, 58], [22, 62, 74]];
const SOUL: RGB = [70, 212, 220];
const SOUL_HOT: RGB = [170, 250, 250];
const BONE: RGB[] = [[150, 144, 118], [184, 178, 150], [212, 206, 180], [232, 228, 206]];

/** Sculk: celdas de Voronoi con surcos oscuros y algunas motas que brillan. */
function sculkBase(t: Tex, glow = 1): void {
  const r = t.rng('sculk');
  const sites = scatter(r, 11, 3.2, 0.8, 1.3);
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const h = voronoi(sites, x + 0.5, y + 0.5);
    const edge = clamp((h.d2 - h.d1) / 1.6, 0, 1);
    const v = 0.35 + 0.45 * edge + 0.2 * n.at(x, y) + 0.1 * (px[i] - 0.5);
    t.setI(i, SCULK[clamp(Math.floor(v * 5), 0, 4)]);
    t.height[i] = 0.3 + 0.7 * edge;
    t.smooth[i] = 70 + edge * 60;
    t.sss[i] = 40;
  }
  // Almas: motas claras en el centro de algunas celdas.
  for (let k = 0; k < sites.length; k++) {
    if (r.next() > 0.3) continue;
    const x = Math.floor(sites[k].x) & 15, y = Math.floor(sites[k].y) & 15;
    t.paint(x, y, SOUL, 1, 150, 60, 70 * glow);
    if (r.next() < 0.5) t.paint((x + 1) & 15, y, scale(SOUL, 0.7), 0.9, 140, 60, 40 * glow);
  }
  t.depth = 1.4;
}

/** Venas: ramas que salen del centro hacia los bordes (recorte). */
function sculkVein(t: Tex): void {
  cutoutCanvas(t, 90, 40);
  const r = t.rng('vein');
  const put = (x: number, y: number, c: RGB, emit = 0) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    t.paint(x, y, c, 1, 90, 40, emit);
  };
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * TAU + r.next() * 0.6;
    let x = 7.5, y = 7.5;
    const len = 5 + r.next() * 5;
    for (let s = 0; s < len; s++) {
      const nx = x + Math.cos(a + Math.sin(s * 0.9 + b) * 0.5), ny = y + Math.sin(a + Math.sin(s * 0.9 + b) * 0.5);
      line(Math.round(x), Math.round(y), Math.round(nx), Math.round(ny), (px, py) => put(px, py, SCULK[2 + (s & 1)]));
      x = nx;
      y = ny;
    }
    put(Math.round(x), Math.round(y), SOUL, 50);
  }
  for (let k = 0; k < 4; k++) put(6 + Math.floor(r.next() * 4), 6 + Math.floor(r.next() * 4), SCULK[4]);
}

/** Hueso: franja clara con grietas (la parte de arriba de los lados del catalizador y del chillador). */
function boneBand(t: Tex, y0: number, y1: number): void {
  const px = pixelNoise(t.rng('bone'));
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const crack = (x * 7 + y * 3) % 11 === 0;
      const lv = crack ? 0 : y === y0 ? 3 : y === y1 ? 1 : 2;
      t.paint(x, y, scale(BONE[lv], 0.94 + px[i] * 0.1), crack ? 0.6 : y === y1 ? 0.8 : 1, 90, 20, 0);
    }
  }
}

/** Ojo de alma que brilla (catalizador, chillador): un rombo claro con el centro caliente. */
function soulEye(t: Tex, cx: number, cy: number, big: boolean, emit: number): void {
  const r = big ? 2 : 1;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const core = dx === 0 && dy === 0;
      t.paint((cx + dx) & 15, (cy + dy) & 15, core ? SOUL_HOT : SOUL, 0.7, 180, 80, core ? emit : emit * 0.6);
    }
  }
}

function catalystSide(bloom: boolean): Generator {
  return (t) => {
    sculkBase(t, bloom ? 2 : 1);
    boneBand(t, 0, 4);
    // Costillas de hueso que bajan por los lados.
    for (const x of [0, 5, 10, 15]) for (let y = 5; y < 9; y++) t.paint(x, y, BONE[1], 0.9, 90);
    soulEye(t, 4, 11, bloom, bloom ? 220 : 110);
    soulEye(t, 11, 12, bloom, bloom ? 220 : 110);
  };
}

function catalystTop(bloom: boolean): Generator {
  return (t) => {
    sculkBase(t, bloom ? 2 : 1);
    // Marco de hueso con esquinas gruesas y el centro oscuro con un alma.
    for (let k = 0; k < S; k++) {
      for (const [x, y] of [[k, 0], [k, 15], [0, k], [15, k], [k, 1], [k, 14], [1, k], [14, k]] as const) {
        const outer = x === 0 || y === 0 || x === 15 || y === 15;
        t.paint(x, y, outer ? BONE[2] : BONE[1], outer ? 1 : 0.9, 90);
      }
    }
    for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) t.paint(x, y, SCULK[0], 0.2, 60);
    soulEye(t, 7, 7, true, bloom ? 255 : 140);
    if (bloom) for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]] as const) soulEye(t, x, y, false, 180);
  };
}

/** Lado de un sensor: la franja de abajo es la que se ve (medio bloque), con un borde claro arriba. */
function sensorSide(calibrated: boolean): Generator {
  return (t) => {
    sculkBase(t);
    for (let x = 0; x < S; x++) t.paint(x, 8, calibrated ? [88, 66, 118] : SCULK[4], 1.1, 120);
    if (calibrated) for (const x of [3, 12]) t.paint(x, 12, [170, 120, 220], 1, 200, 0, 60);
  };
}

function sensorTop(calibrated: boolean): Generator {
  return (t) => {
    sculkBase(t);
    // Anillo más claro alrededor del centro, del que salen los zarcillos.
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 5 && d < 6.2) t.paint(x, y, calibrated ? [96, 70, 132] : SCULK[4], 1.05, 110);
    }
    if (calibrated) for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) t.paint(x, y, [196, 150, 240], 1, 220, 0, 60);
  };
}

/** Zarcillos: tallos que suben enroscándose por la mitad de arriba de la textura (recorte). */
function tendril(active: boolean): Generator {
  return (t) => {
    cutoutCanvas(t, 110, 60);
    const stem: RGB = active ? [40, 150, 160] : [16, 70, 80];
    const tip: RGB = active ? [150, 255, 255] : [40, 140, 150];
    for (const x0 of [3, 7, 11]) {
      for (let y = 0; y < 8; y++) {
        const x = x0 + Math.round(Math.sin(y * 0.9 + x0) * 1.2);
        const top = y < 2;
        t.paint(x & 15, 7 - y, top ? tip : stem, 1, 110, 60, active ? (top ? 255 : 150) : top ? 40 : 0);
      }
      t.paint((x0 + 1) & 15, 0, tip, 1, 110, 60, active ? 255 : 30);
    }
  };
}

/** Cristal de amatista del sensor calibrado (recorte, en la mitad de arriba). */
function amethyst(active: boolean): Generator {
  return (t) => {
    cutoutCanvas(t, 200, 0);
    const lit = (c: RGB): Ink => ({ c, smooth: 220, emit: active ? 200 : 20 });
    sprite(t, [
      '.......a........',
      '......aba.......',
      '.....abbca......',
      '....abbbcca.....',
      '....abbbbca.....',
      '...abbdbbcca....',
      '...abbdbbbca....',
      '..aabbbbbbcca...',
    ], { a: lit([120, 70, 170]), b: lit(active ? [220, 170, 255] : [170, 120, 220]), c: lit([230, 200, 255]), d: lit([250, 240, 255]) });
  };
}

/** Cara de entrada del sensor calibrado: el lado con un rombo de amatista. */
function calibratedInput(t: Tex): void {
  sensorSide(true)(t);
  sprite(t, [
    '...a...',
    '..aba..',
    '.abcba.',
    '..aba..',
    '...a...',
  ], { a: { c: [110, 64, 160], smooth: 200 }, b: { c: [180, 130, 230], smooth: 220, emit: 40 }, c: { c: [240, 220, 255], smooth: 230, emit: 90 } }, 4, 9);
}

function shriekerSide(t: Tex): void {
  sculkBase(t);
  // Mitad de arriba: la mandíbula de hueso con dientes que asoman hacia abajo.
  boneBand(t, 1, 3);
  for (let x = 0; x < S; x++) {
    if (x % 3 === 1) {
      t.paint(x, 4, BONE[2], 0.9, 90);
      t.paint(x, 5, BONE[1], 0.8, 90);
    }
  }
  for (let x = 0; x < S; x++) t.paint(x, 8, BONE[0], 1.1, 90);
}

function shriekerTop(t: Tex): void {
  sculkBase(t);
  // Borde de hueso (lo que asoma alrededor de la parte de arriba).
  for (let k = 0; k < S; k++) for (const [x, y] of [[k, 0], [k, 15], [0, k], [15, k]] as const) t.paint(x, y, BONE[2], 1, 90);
}

function shriekerInner(canSummon: boolean): Generator {
  return (t) => {
    sculkBase(t, canSummon ? 1.5 : 1);
    // Garganta: un pozo oscuro rodeado de dientes de hueso.
    for (let i = 0; i < N; i++) {
      const x = i & 15, y = i >> 4;
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d < 4.2) t.paint(x, y, [2, 8, 12], 0.1, 30);
      else if (d < 5.4 && (Math.round(Math.atan2(y - 7.5, x - 7.5) * 3) & 1)) t.paint(x, y, BONE[2], 1, 90);
    }
    if (canSummon) {
      soulEye(t, 6, 7, false, 200);
      soulEye(t, 9, 8, false, 200);
      t.paint(8, 5, SOUL_HOT, 0.2, 180, 60, 160);
    }
  };
}

/** Pizarra reforzada: pizarra con un marco de hueso pálido (columnas en los lados, anillo arriba). */
function reinforced(kind: 'side' | 'top' | 'bottom'): Generator {
  return (t) => {
    deepslateBase(t);
    for (let i = 0; i < N; i++) t.setI(i, scale(t.getI(i), 0.72));
    const pale = (x: number, y: number, lv: number) => t.paint(x, y, BONE[lv], 1.1, 110);
    if (kind === 'side') {
      for (let y = 0; y < S; y++) {
        pale(0, y, 1);
        pale(1, y, 2);
        pale(14, y, 2);
        pale(15, y, 1);
      }
      for (const y of [0, 15]) for (let x = 2; x < 14; x++) pale(x, y, y === 0 ? 3 : 0);
      for (let x = 4; x < 12; x += 3) for (let y = 5; y < 11; y++) if ((x + y) % 2 === 0) t.paint(x, y, [70, 70, 78], 0.8, 70);
    } else {
      for (let i = 0; i < N; i++) {
        const x = i & 15, y = i >> 4;
        const m = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        if (m > 6.5 || (kind === 'top' && m > 3 && m < 4.2)) pale(x, y, m > 6.5 ? 2 : 1);
      }
    }
    t.depth = 1.5;
  };
}

/** Arena de alma: granos pardos con caras que asoman (dos ojos y una boca oscuros). */
function soulSand(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.5 * n.at(x, y) + 0.5 * px[i];
    t.setI(i, mix([70, 52, 40], [104, 80, 62], v));
    t.height[i] = 0.5 + 0.5 * v;
    t.smooth[i] = 40;
  }
  for (const [fx, fy] of [[3, 3], [10, 9], [11, 1]] as const) {
    const dark: RGB = [38, 26, 20];
    t.paint(fx, fy, dark, 0.1, 30);
    t.paint(fx + 2, fy, dark, 0.1, 30);
    t.paint(fx + 1, fy + 2, dark, 0.1, 30);
    t.paint(fx + 1, fy + 3, [48, 34, 26], 0.2, 30);
  }
  t.depth = 1.2;
}

function soulSoil(t: Tex): void {
  const r = t.rng();
  const n = new Noise(r, 4);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const v = 0.6 * n.at(x, y) + 0.4 * px[i];
    t.setI(i, mix([54, 40, 32], [86, 66, 52], v));
    t.height[i] = 0.4 + 0.6 * v;
    t.smooth[i] = 35;
  }
  for (let k = 0; k < 6; k++) t.paint(Math.floor(r.next() * 16), Math.floor(r.next() * 16), [34, 24, 20], 0.2, 30);
}

/** Fuego de alma: las mismas lenguas que el fuego, del azul oscuro al turquesa casi blanco. */
function soulFire(t: Tex): void {
  cutoutCanvas(t, 20, 0);
  t.tiling = true;
  const r = t.rng();
  const ph = [r.next() * TAU, r.next() * TAU, r.next() * TAU, r.next() * TAU];
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const u = (x / 16) * TAU, v = (y / 16) * TAU;
    const n = 0.52 + 0.3 * Math.sin(u * 2 + ph[0] + Math.sin(v + ph[1]) * 1.3) + 0.16 * Math.sin(u * 3 - v + ph[2]) +
      0.08 * Math.sin(u * 5 + v * 2 + ph[3]) + 0.14 * (px[i] - 0.5);
    if (n < 0.3) continue;
    const heat = clamp((n - 0.3) / 0.62, 0, 1);
    const c: RGB = heat > 0.8 ? mix([110, 236, 240], [200, 255, 255], (heat - 0.8) / 0.2)
      : heat > 0.4 ? mix([30, 150, 190], [80, 214, 230], (heat - 0.4) / 0.4) : mix([10, 60, 110], [20, 110, 160], heat / 0.4);
    t.paint(x, y, c, 1, 20, 0, 24 + heat * 40);
  }
}

/** Antorcha de alma: el palo y la llama azul. */
function soulTorch(t: Tex): void {
  t.alpha.fill(0);
  t.smooth.fill(45);
  for (let y = 8; y <= 15; y++) {
    const k = (15 - y) / 7;
    const c: RGB = [92 + 54 * k, 64 + 44 * k, 36 + 28 * k];
    t.paint(7, y, scale(c, 1.06), 1, 45);
    t.paint(8, y, scale(c, 0.88), 1, 45);
  }
  t.paint(7, 6, [220, 255, 255], 1, 0, 0, 255);
  t.paint(8, 6, [150, 240, 250], 1, 0, 0, 255);
  t.paint(7, 7, [80, 200, 230], 1, 0, 0, 255);
  t.paint(8, 7, [40, 150, 200], 1, 0, 0, 255);
}

/** Farol de alma: el farol de hierro con la llama azul dentro. */
function soulLantern(t: Tex): void {
  cutoutCanvas(t, 120, 0);
  const d: Ink = { c: [44, 46, 56], f0: 235, smooth: 120 }, m: Ink = { c: [72, 76, 90], f0: 235, smooth: 140 };
  const l: Ink = { c: [112, 118, 134], f0: 235, smooth: 160 };
  const f: Ink = { c: [90, 220, 240], emit: 255, smooth: 200 }, c: Ink = { c: [210, 255, 255], emit: 255, smooth: 200 };
  const e: Ink = { c: [40, 140, 190], emit: 220, smooth: 200 };
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
    '.....mfccfd.....',
    '.....mfccfd.....',
    '.....meffed.....',
    '.....meeeed.....',
    '.....dddddd.....',
  ], { d, m, l, f, c, e });
}

export const DEEP_DARK_GENERATORS: Record<string, Generator> = {
  sculk: (t) => sculkBase(t),
  sculk_vein: sculkVein,
  sculk_catalyst_top: catalystTop(false),
  sculk_catalyst_top_bloom: catalystTop(true),
  sculk_catalyst_side: catalystSide(false),
  sculk_catalyst_side_bloom: catalystSide(true),
  sculk_catalyst_bottom: (t) => sculkBase(t),
  sculk_sensor_top: sensorTop(false),
  sculk_sensor_side: sensorSide(false),
  sculk_sensor_bottom: (t) => sculkBase(t),
  sculk_sensor_tendril: tendril(false),
  sculk_sensor_tendril_active: tendril(true),
  calibrated_sculk_sensor_top: sensorTop(true),
  calibrated_sculk_sensor_side: sensorSide(true),
  calibrated_sculk_sensor_input_side: calibratedInput,
  calibrated_sculk_sensor_amethyst: amethyst(false),
  calibrated_sculk_sensor_amethyst_active: amethyst(true),
  sculk_shrieker_top: shriekerTop,
  sculk_shrieker_side: shriekerSide,
  sculk_shrieker_bottom: (t) => sculkBase(t),
  sculk_shrieker_inner_top: shriekerInner(false),
  sculk_shrieker_can_summon_inner_top: shriekerInner(true),
  reinforced_deepslate_top: reinforced('top'),
  reinforced_deepslate_side: reinforced('side'),
  reinforced_deepslate_bottom: reinforced('bottom'),
  soul_sand: soulSand,
  soul_soil: soulSoil,
  soul_fire: soulFire,
  soul_torch: soulTorch,
  soul_lantern: soulLantern,
};
