// Fase 6.5 (colores): texturas de los 16 colores. Las lanas y terracotas que faltaban recolorean los
// generadores de las que ya había (así casan con ellas); el hormigón es liso con un leve moteado, el
// hormigón en polvo es granulado como la arena, el cristal de color es translúcido con un marco más
// denso, y cada terracota esmaltada tiene su propio dibujo de azulejo (con simetría de media vuelta,
// porque el bloque sólo puede girar la textura 90°). También la cera de la vela y su llama.

import { N, Noise, Tex, clamp, field, idx, lerp, mix, pixelNoise, rankLevels, scale, type Generator, type RGB } from './texCore';
import { terracotta } from './genSoil';
import { tintTo } from './genBiomes';
import { MISC_GENERATORS } from './genMisc';

type Color = 'white' | 'orange' | 'magenta' | 'light_blue' | 'yellow' | 'lime' | 'pink' | 'gray' | 'light_gray' | 'cyan' |
  'purple' | 'blue' | 'brown' | 'green' | 'red' | 'black';

const COLORS: readonly Color[] = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
  'brown', 'green', 'red', 'black',
];

/** Color de la lana de los colores nuevos (las ocho clásicas tienen el suyo en genMisc). */
const WOOL: Partial<Record<Color, RGB>> = {
  magenta: [190, 70, 180], light_blue: [58, 176, 218], pink: [238, 142, 172], gray: [64, 68, 72],
  light_gray: [142, 142, 135], cyan: [22, 138, 146], brown: [116, 72, 40], green: [84, 110, 28],
};

/** Terracota de los colores nuevos (apagados, como la arcilla cocida). */
const TERRACOTTA: Partial<Record<Color, RGB>> = {
  magenta: [150, 88, 109], light_blue: [113, 109, 138], lime: [104, 118, 53], pink: [162, 78, 79], gray: [58, 42, 36],
  cyan: [87, 92, 92], purple: [118, 70, 86], blue: [74, 60, 91], green: [76, 83, 42], black: [37, 23, 17],
};

/** Hormigón: colores planos y saturados. */
const CONCRETE: Record<Color, RGB> = {
  white: [207, 213, 214], orange: [224, 97, 1], magenta: [169, 48, 159], light_blue: [36, 137, 199],
  yellow: [241, 175, 21], lime: [94, 169, 24], pink: [214, 101, 143], gray: [55, 58, 62], light_gray: [125, 125, 115],
  cyan: [21, 119, 136], purple: [100, 32, 156], blue: [45, 47, 143], brown: [96, 60, 32], green: [73, 91, 36],
  red: [142, 33, 33], black: [8, 10, 15],
};

/** Cristal de color (algo más vivo que el hormigón: se ve a contraluz). */
const GLASS: Record<Color, RGB> = {
  white: [240, 240, 240], orange: [230, 128, 48], magenta: [190, 76, 214], light_blue: [96, 150, 214],
  yellow: [226, 226, 50], lime: [124, 200, 24], pink: [236, 124, 164], gray: [74, 74, 74], light_gray: [150, 150, 150],
  cyan: [74, 124, 150], purple: [124, 60, 176], blue: [50, 74, 176], brown: [100, 74, 50], green: [100, 124, 50],
  red: [150, 50, 50], black: [24, 24, 24],
};

// ---------------------------------------------------------------------------
// Hormigón y hormigón en polvo
// ---------------------------------------------------------------------------

function concrete(t: Tex, base: RGB): void {
  const r = t.rng();
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const k = 1 + (n8.at(x, y) - 0.5) * 0.05 + (px[i] - 0.5) * 0.035;
    t.setI(i, [clamp(base[0] * k + 1, 0, 255), clamp(base[1] * k + 1, 0, 255), clamp(base[2] * k + 1, 0, 255)]);
    t.height[i] = 0.95 + 0.05 * n8.at(x, y);
    t.smooth[i] = 78 + 10 * px[i];
  }
  t.depth = 0.3;
}

function concretePowder(t: Tex, base: RGB): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  const n8 = new Noise(r, 8);
  const px = pixelNoise(r);
  const v = field((x, y, i) => 0.3 * n4.at(x, y) + 0.3 * n8.at(x, y) + 0.4 * px[i]);
  const lv = rankLevels(v, [16, 30, 34, 20]);
  const light = mix(base, [236, 236, 230], 0.22);
  const mult = [0.84, 0.94, 1.02, 1.1];
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const c = scale(light, mult[lv[i]]);
    t.setI(i, [clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255)]);
    t.height[i] = 0.7 + 0.1 * lv[i] + 0.05 * n8.at(x, y);
    t.smooth[i] = 26 + 8 * px[i];
  }
  // Granos sueltos más oscuros y más claros.
  for (let k = 0; k < 12; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, scale(light, 0.74));
    t.height[i] -= 0.12;
  }
  for (let k = 0; k < 10; k++) {
    const i = idx(r.int(0, 15), r.int(0, 15));
    t.setI(i, mix(light, [255, 255, 255], 0.3));
    t.height[i] += 0.1;
  }
  t.depth = 0.8;
}

// ---------------------------------------------------------------------------
// Cristal de color (translúcido: el alpha dice cuánto tapa el propio cristal)
// ---------------------------------------------------------------------------

function stainedGlass(t: Tex, base: RGB): void {
  const r = t.rng();
  const n4 = new Noise(r, 4);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const frame = x === 0 || y === 0 || x === 15 || y === 15;
    const lit = frame && (x === 0 || y === 0);
    const c = frame ? scale(base, lit ? 0.92 : 0.72) : scale(base, 0.96 + 0.08 * n4.at(x, y));
    t.setI(i, [clamp(c[0], 0, 255), clamp(c[1], 0, 255), clamp(c[2], 0, 255)]);
    t.alpha[i] = frame ? 235 : 105 + 25 * n4.at(x, y);
    t.height[i] = 1;
    t.smooth[i] = 235;
  }
  // Destellos diagonales cerca de la esquina de arriba a la izquierda (como el cristal normal).
  for (const [x, y] of [[2, 5], [3, 4], [4, 3], [5, 2], [3, 6], [6, 3]] as const) {
    const i = idx(x, y);
    t.setI(i, mix(base, [255, 255, 255], 0.55));
    t.alpha[i] = 170;
  }
  t.f0.fill(10);
  t.depth = 0.3;
}

// ---------------------------------------------------------------------------
// Terracota esmaltada
// ---------------------------------------------------------------------------

/** Esmalte: [fondo, trazo oscuro, brillo claro, segundo color]. */
const GLAZE: Record<Color, [RGB, RGB, RGB, RGB]> = {
  white: [[232, 234, 228], [58, 152, 170], [255, 255, 250], [230, 196, 74]],
  orange: [[210, 122, 44], [30, 128, 132], [246, 214, 150], [230, 230, 222]],
  magenta: [[208, 100, 200], [120, 40, 132], [242, 196, 238], [232, 232, 232]],
  light_blue: [[96, 164, 214], [34, 72, 150], [226, 240, 250], [236, 236, 236]],
  yellow: [[234, 196, 70], [60, 110, 170], [252, 240, 184], [232, 136, 40]],
  lime: [[154, 204, 72], [52, 110, 30], [226, 244, 190], [240, 240, 230]],
  pink: [[236, 156, 178], [176, 70, 110], [252, 222, 230], [246, 246, 240]],
  gray: [[92, 98, 102], [40, 44, 48], [168, 174, 178], [66, 140, 150]],
  light_gray: [[170, 176, 176], [80, 110, 118], [226, 230, 228], [196, 170, 110]],
  cyan: [[56, 128, 140], [24, 56, 66], [150, 206, 212], [210, 210, 204]],
  purple: [[112, 50, 160], [52, 20, 88], [200, 150, 226], [222, 176, 60]],
  blue: [[48, 64, 160], [22, 28, 80], [132, 160, 228], [236, 236, 236]],
  brown: [[132, 96, 64], [70, 46, 28], [196, 164, 120], [70, 130, 150]],
  green: [[98, 128, 46], [44, 60, 20], [184, 206, 120], [214, 200, 120]],
  red: [[176, 54, 46], [96, 20, 18], [236, 170, 150], [236, 226, 210]],
  black: [[36, 30, 32], [150, 30, 36], [88, 80, 84], [196, 160, 64]],
};

/**
 * Dibujos (0 fondo, 1 trazo, 2 brillo, 3 segundo color) como funciones de las coordenadas centradas.
 * Todos son pares (f(−p) = f(p)): simetría de media vuelta.
 */
const MOTIFS: ((cx: number, cy: number) => number)[] = [
  // Rombos concéntricos con un punto central.
  (cx, cy) => {
    const d = Math.abs(cx) + Math.abs(cy);
    if (d < 2) return 3;
    return Math.floor(d) % 4 === 1 ? 1 : Math.floor(d) % 4 === 3 ? 2 : 0;
  },
  // Onda en S que cruza el azulejo, con dos lunares.
  (cx, cy) => {
    const s = cy - 3.2 * Math.sin(cx * 0.42);
    if (Math.abs(s) < 1.1) return 1;
    if (Math.abs(s) < 2.2) return 2;
    const lx = Math.abs(cx) - 4.5, ly = Math.abs(cy) - 4.5;
    return Math.sign(cx) === Math.sign(cy) && lx * lx + ly * ly < 5 ? 3 : 0;
  },
  // Molinillo: arcos en dos cuadrantes opuestos y franjas en los otros dos.
  (cx, cy) => {
    if (cx * cy >= 0) {
      const d = Math.hypot(Math.abs(cx) - 7.5, Math.abs(cy) - 7.5);
      return d < 4 ? 3 : d < 5.3 ? 1 : d > 8.5 && d < 9.8 ? 2 : 0;
    }
    return Math.floor(Math.abs(cx - cy)) % 5 === 0 ? 1 : Math.floor(Math.abs(cx - cy)) % 5 === 2 ? 2 : 0;
  },
  // Cuadros anidados con esquinas marcadas.
  (cx, cy) => {
    const m = Math.max(Math.abs(cx), Math.abs(cy));
    if (m < 1.5) return 2;
    if (m > 3 && m < 4.2) return 1;
    if (Math.abs(Math.abs(cx) - Math.abs(cy)) < 0.8 && m > 4.2) return 3;
    return m > 6.2 ? 1 : 0;
  },
  // Flor de cuatro pétalos con hojas en las esquinas.
  (cx, cy) => {
    const a = Math.atan2(cy, cx), d = Math.hypot(cx, cy);
    const petal = 3.2 + 2.2 * Math.cos(4 * a);
    if (d < 1.6) return 3;
    if (d < petal) return d > petal - 1.1 ? 1 : 2;
    return Math.abs(Math.abs(cx) - Math.abs(cy)) < 1 && d > 7.5 ? 1 : 0;
  },
  // Franjas diagonales onduladas.
  (cx, cy) => {
    const w = Math.cos((cx + cy) * 0.55) + 0.5 * Math.cos((cx - cy) * 0.4);
    return w > 1.05 ? 1 : w > 0.55 ? 3 : w < -1.0 ? 2 : 0;
  },
];

function glazed(t: Tex, color: Color, index: number): void {
  const [base, dark, light, second] = GLAZE[color];
  const inks = [base, dark, light, second];
  const motif = MOTIFS[index % MOTIFS.length];
  const px = pixelNoise(t.rng());
  const border = index % 3 !== 0;
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    // Coordenadas con simetría exacta de media vuelta sobre la cuadrícula de 16 px.
    let lv = motif(x - 7.5, y - 7.5);
    if (border && (x === 0 || y === 0 || x === 15 || y === 15)) lv = 1;
    const c = inks[lv];
    const k = 1 + (px[i] - 0.5) * 0.04;
    t.setI(i, [clamp(c[0] * k, 0, 255), clamp(c[1] * k, 0, 255), clamp(c[2] * k, 0, 255)]);
    t.height[i] = lv === 1 ? 0.9 : 1;
    t.smooth[i] = 190 + 20 * px[i];
  }
  t.f0.fill(12);
  t.depth = 0.25;
}

// ---------------------------------------------------------------------------
// Velas
// ---------------------------------------------------------------------------

function candleWax(t: Tex): void {
  const r = t.rng();
  const n4 = new Noise(r, 4, 8);
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const k = 0.94 + 0.08 * n4.at(x, y);
    t.setI(i, scale([232, 212, 164], k));
    t.height[i] = 0.9 + 0.1 * n4.at(x, y);
    t.smooth[i] = 120;
    t.sss[i] = 90;
  }
  t.depth = 0.3;
}

function candleFlame(t: Tex): void {
  const px = pixelNoise(t.rng());
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    // De abajo (azulado y blanco) a arriba (naranja): la caja de la llama toma 2 px de alto.
    const k = clamp((15 - y) / 15, 0, 1);
    const c = mix([255, 244, 196], [255, 150, 40], lerp(k, px[i], 0.3));
    t.setI(i, c);
    t.emit[i] = 255;
    t.smooth[i] = 40;
  }
  t.depth = 0.1;
}

// ---------------------------------------------------------------------------

export const COLOR_GENERATORS: Record<string, Generator> = {
  candle: candleWax,
  candle_flame: candleFlame,
};
COLORS.forEach((c, i) => {
  const wool = WOOL[c];
  if (wool) {
    COLOR_GENERATORS[`${c}_wool`] = (t) => {
      MISC_GENERATORS.white_wool(t);
      tintTo(t, wool);
    };
  }
  const tc = TERRACOTTA[c];
  if (tc) {
    COLOR_GENERATORS[`${c}_terracotta`] = (t) => {
      terracotta(t);
      tintTo(t, tc);
    };
  }
  COLOR_GENERATORS[`${c}_concrete`] = (t) => concrete(t, CONCRETE[c]);
  COLOR_GENERATORS[`${c}_concrete_powder`] = (t) => concretePowder(t, CONCRETE[c]);
  COLOR_GENERATORS[`${c}_stained_glass`] = (t) => stainedGlass(t, GLASS[c]);
  COLOR_GENERATORS[`${c}_glazed_terracotta`] = (t) => glazed(t, c, i);
});
