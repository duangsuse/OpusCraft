// Generadores de piezas de construcción: puertas (mitades superior e inferior),
// trampillas y escalera de mano. Son recortes (alpha 0/255) que no se repiten,
// salvo la escalera, que se apila en vertical.
//
// Cada pieza se dibuja con un plano de carpintería en texto: 'F' marco (largueros
// y travesaños, más oscuro), 'b' tabla de veta horizontal, 'v' tabla de veta
// vertical, '-' y '|' juntas entre tablas y '.' hueco transparente. Las puertas
// se diseñan enteras (16×32) para que la veta y el tono de cada tabla sigan sin
// cortes entre la mitad superior y la inferior. Los colores salen de las mismas
// paletas que los tablones de genWood, así que casan con los bloques de madera.

import { Rng, Tex, lerp, mix, scale, type Generator, type RGB } from './texCore';
import { OAK_PLANKS, type PlankStyle } from './genWood';
import { sprite, type Ink } from './genPlants';

// Tablones de abedul y abeto: mismos valores que en genWood (allí no se exportan).
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

export interface Wood {
  p: PlankStyle;
  /** Marco: sombra, base y luz (derivados de la paleta de tablones, más oscuros). */
  frame: readonly [RGB, RGB, RGB];
}

/** `k`: cuánto se acerca el marco al color de junta (más alto = marco más oscuro). */
export function wood(p: PlankStyle, k: number): Wood {
  return { p, frame: [mix(p.joint, p.seam, 0.35 + k * 0.6), mix(p.dark, p.seam, k), mix(p.base, p.seam, k * 0.55)] };
}

const OAK = wood(OAK_PLANKS, 0.4);
const BIRCH = wood(BIRCH_PLANKS, 0.55);
const SPRUCE = wood(SPRUCE_PLANKS, 0.4);

// ---------------------------------------------------------------------------
// Plano de carpintería
// ---------------------------------------------------------------------------

/** Nivel de relieve por carácter: herraje > marco > tabla > junta > hueco. */
function level(ch: string): number {
  switch (ch) {
    case 'i':
    case 'n':
      return 4;
    case 'F':
      return 3;
    case 'b':
    case 'v':
      return 2;
    case '-':
    case '|':
      return 1;
    default:
      return 0;
  }
}

/** Ruido de valor suave sobre un rectángulo w×h (celdas cw×ch; no periódico). */
function valueNoise(r: Rng, w: number, h: number, cw: number, ch: number): Float32Array {
  const gx = Math.ceil(w / cw) + 2;
  const gy = Math.ceil(h / ch) + 2;
  const g = new Float32Array(gx * gy);
  for (let i = 0; i < g.length; i++) g[i] = r.next();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x + 0.5) / cw;
      const fy = (y + 0.5) / ch;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      let tx = fx - x0;
      let ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const top = lerp(g[y0 * gx + x0], g[y0 * gx + x0 + 1], tx);
      const bot = lerp(g[(y0 + 1) * gx + x0], g[(y0 + 1) * gx + x0 + 1], tx);
      out[y * w + x] = lerp(top, bot, ty);
    }
  }
  return out;
}

interface Plan {
  w: number;
  h: number;
  col: RGB[];
  height: Float32Array;
  smooth: Float32Array;
  f0: Float32Array;
  solid: Uint8Array;
}

/** Hierro forjado de bisagras y remaches: sombra, base, luz y cabeza de remache. */
const STRAP: readonly RGB[] = [
  [44, 44, 50],
  [66, 67, 74],
  [96, 98, 106],
  [150, 152, 160],
];

/**
 * Sombrea un plano completo: tono propio por tabla, veta en la dirección de la
 * tabla, cantos iluminados arriba (y algo a la izquierda) y en sombra abajo, y el
 * marco en relieve. `seed` es común a las dos mitades de una puerta.
 */
function shadePlan(rows: readonly string[], w: Wood, seed: string): Plan {
  const W = 16;
  const H = rows.length;
  const r = new Rng(seed);
  const p = w.p;
  const at = (x: number, y: number): string => (x < 0 || y < 0 || x >= W || y >= H ? ' ' : rows[y][x]);
  const lv = (x: number, y: number): number => level(at(x, y));

  // Regiones de tablas (4-vecindad, mismo carácter).
  const region = new Int32Array(W * H).fill(-1);
  const tones: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      if ((ch !== 'b' && ch !== 'v') || region[y * W + x] >= 0) continue;
      const id = tones.length;
      tones.push(r.range(-0.045, 0.045));
      const stack = [y * W + x];
      region[y * W + x] = id;
      while (stack.length) {
        const i = stack.pop()!;
        const cx = i % W;
        const cy = (i - cx) / W;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (at(nx, ny) !== ch || region[ny * W + nx] >= 0) continue;
          region[ny * W + nx] = id;
          stack.push(ny * W + nx);
        }
      }
    }
  }

  const gh = valueNoise(r, W, H, 4, 1); // veta horizontal
  const gv = valueNoise(r, W, H, 1, 4); // veta vertical
  const px = new Float32Array(W * H);
  for (let i = 0; i < px.length; i++) px[i] = r.next();

  const plan: Plan = {
    w: W,
    h: H,
    col: new Array<RGB>(W * H).fill([0, 0, 0]),
    height: new Float32Array(W * H),
    smooth: new Float32Array(W * H),
    f0: new Float32Array(W * H).fill(10),
    solid: new Uint8Array(W * H),
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const ch = at(x, y);
      const l = level(ch);
      if (l === 0) continue; // hueco
      plan.solid[i] = 1;
      const up = lv(x, y - 1);
      const down = lv(x, y + 1);
      const left = lv(x - 1, y);
      const right = lv(x + 1, y);
      let c: RGB;
      let h: number;
      let sm: number;
      if (ch === 'i' || ch === 'n') {
        // Herraje: pletina con canto superior claro e inferior oscuro; remaches brillantes.
        c = ch === 'n' ? STRAP[3] : up < l ? STRAP[2] : down < l ? STRAP[0] : STRAP[1];
        c = scale(c, 1 + (px[i] - 0.5) * 0.08);
        h = ch === 'n' ? 1.16 : 1.1;
        sm = ch === 'n' ? 150 : 120;
        plan.f0[i] = 230;
      } else if (ch === 'F') {
        const [fd, fb, fl] = w.frame;
        c = fb;
        if (up < l) c = fl;
        else if (down < l) c = fd;
        else if (left < l) c = mix(fb, fl, 0.5);
        else if (right < l) c = mix(fb, fd, 0.5);
        c = scale(c, 1 + (px[i] - 0.5) * 0.07);
        h = up < l || down < l || left < l || right < l ? 0.95 : 1;
        sm = p.smooth - 8;
      } else if (ch === 'b' || ch === 'v') {
        const g = ch === 'b' ? gh[i] : gv[i];
        c = g > 0.66 ? p.dark : g < 0.3 ? p.light : p.base;
        if (up < l) c = mix(c, p.light, 0.5); // canto superior: recoge luz
        else if (down < l) c = mix(c, p.dark, 0.6); // canto inferior: sombra
        if (up > l) c = scale(c, 0.93); // bajo el marco: sombra del travesaño
        if (ch === 'v') {
          if (left < l) c = mix(c, p.light, 0.3);
          else if (right < l) c = mix(c, p.dark, 0.35);
        }
        c = scale(c, 1 + tones[region[i]]);
        h = up < l || down < l || left < l || right < l ? 0.84 : 0.88;
        sm = p.smooth + 6 * px[i];
      } else {
        c = mix(p.seam, p.joint, px[i] * 0.3);
        h = 0.62;
        sm = 30;
      }
      plan.col[i] = c;
      plan.height[i] = h;
      plan.smooth[i] = sm;
    }
  }

  // Vetas: trazos oscuros de 2 a 5 px a lo largo de cada tabla, sin salirse de ella.
  for (let k = 0; k < tones.length * 3; k++) {
    const x0 = r.int(0, W - 1);
    const y0 = r.int(0, H - 1);
    const id = region[y0 * W + x0];
    if (id < 0) continue;
    const vertical = at(x0, y0) === 'v';
    const len = r.int(2, 5);
    for (let s = 0; s < len; s++) {
      const x = vertical ? x0 : x0 + s;
      const y = vertical ? y0 + s : y0;
      if (region[y * W + x] !== id || x >= W || y >= H) break;
      const i = y * W + x;
      plan.col[i] = mix(plan.col[i], p.grain, 0.75);
      plan.height[i] -= 0.03;
    }
  }
  return plan;
}

const planCache = new Map<string, Plan>();

/** Vuelca las filas [y0, y0 + 16) de un plano sobre el lienzo (recorte que no se repite). */
export function drawPlan(t: Tex, rows: readonly string[], y0: number, w: Wood, seed: string, tiling = false): void {
  let plan = planCache.get(seed);
  if (!plan) {
    plan = shadePlan(rows, w, seed);
    planCache.set(seed, plan);
  }
  t.alpha.fill(0);
  t.height.fill(0.5);
  t.fillSpec(40, 10, 0, 0);
  t.tiling = tiling;
  t.clampTransparent = true;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const j = (y0 + y) * plan.w + x;
      if (!plan.solid[j]) continue;
      const i = t.paint(x, y, plan.col[j], plan.height[j], plan.smooth[j]);
      t.f0[i] = plan.f0[j];
    }
  }
  t.depth = 1.3;
}

// ---------------------------------------------------------------------------
// Herrajes
// ---------------------------------------------------------------------------

const IRON: Record<string, Ink> = {
  h: { c: [214, 216, 222], h: 1.14, smooth: 175, f0: 230 },
  m: { c: [156, 158, 166], h: 1.12, smooth: 160, f0: 230 },
  d: { c: [96, 98, 106], h: 1.08, smooth: 140, f0: 230 },
  k: { c: [44, 42, 46], h: 1.0, smooth: 60 },
};

// ---------------------------------------------------------------------------
// Puertas (16×32: filas 0–15 mitad superior, 16–31 mitad inferior)
// ---------------------------------------------------------------------------

// Roble: dos ventanas en arco arriba y tablas horizontales abajo.
export const OAK_DOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FFbb..bbbb..bbFF',
  'FFb....bb....bFF',
  'FFb....bb....bFF',
  'FFb....bb....bFF',
  'FFb....bb....bFF',
  'FFb....bb....bFF',
  'FFb....bb....bFF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FF------------FF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFbbbbbbbbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

// Abedul: cuadrícula de ventanitas arriba y tablas verticales abajo.
export const BIRCH_DOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvvvvvvvvvvvFF',
  'FFvv..v..v..vvFF',
  'FFvv..v..v..vvFF',
  'FFvvvvvvvvvvvvFF',
  'FFvv..v..v..vvFF',
  'FFvv..v..v..vvFF',
  'FFvvvvvvvvvvvvFF',
  'FFvv..v..v..vvFF',
  'FFvv..v..v..vvFF',
  'FFvvvvvvvvvvvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

// Abeto: tablas verticales casi macizas con dos mirillas estrechas.
export const SPRUCE_DOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|v..v|vvvFF',
  'FFvvv|v..v|vvvFF',
  'FFvvv|v..v|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFvvv|vvvv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

// Tirador (filas 1–4 de la mitad inferior, junto al larguero derecho).
const HANDLE = ['mh', 'dm', 'dm', 'kd'];

export function door(t: Tex, rows: readonly string[], w: Wood, seed: string, bottom: boolean): void {
  drawPlan(t, rows, bottom ? 16 : 0, w, seed);
  if (bottom) sprite(t, HANDLE, IRON, 11, 1);
}

// ---------------------------------------------------------------------------
// Trampillas (16×16, vistas desde arriba)
// ---------------------------------------------------------------------------

export const OAK_TRAPDOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbFFbbbbbFF',
  'FFb...bFFb...bFF',
  'FFb...bFFb...bFF',
  'FFb...bFFb...bFF',
  'FFbbbbbFFbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFbbbbbFFbbbbbFF',
  'FFb...bFFb...bFF',
  'FFb...bFFb...bFF',
  'FFb...bFFb...bFF',
  'FFbbbbbFFbbbbbFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

export const BIRCH_TRAPDOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FF.vv.vv.vv.vvFF',
  'FFvv.vv.vv.vv.FF',
  'FFv.vv.vv.vv.vFF',
  'FF.vv.vv.vv.vvFF',
  'FFvv.vv.vv.vv.FF',
  'FFv.vv.vv.vv.vFF',
  'FF.vv.vv.vv.vvFF',
  'FFvv.vv.vv.vv.FF',
  'FFv.vv.vv.vv.vFF',
  'FF.vv.vv.vv.vvFF',
  'FFvv.vv.vv.vv.FF',
  'FFv.vv.vv.vv.vFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

export const SPRUCE_TRAPDOOR = [
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|..|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|..|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFvv|vv|vv|vvvFF',
  'FFFFFFFFFFFFFFFF',
  'FFFFFFFFFFFFFFFF',
];

// ---------------------------------------------------------------------------
// Escalera de mano (se apila en vertical: periódica en y)
// ---------------------------------------------------------------------------

const LADDER = [
  '..FF........FF..',
  '..FFbbbbbbbbFF..',
  '..FFbbbbbbbbFF..',
  '..FF........FF..',
  '..FF........FF..',
  '..FFbbbbbbbbFF..',
  '..FFbbbbbbbbFF..',
  '..FF........FF..',
  '..FF........FF..',
  '..FFbbbbbbbbFF..',
  '..FFbbbbbbbbFF..',
  '..FF........FF..',
  '..FF........FF..',
  '..FFbbbbbbbbFF..',
  '..FFbbbbbbbbFF..',
  '..FF........FF..',
];

export const BUILDING_GENERATORS: Record<string, Generator> = {
  oak_door_top: (t) => door(t, OAK_DOOR, OAK, 'oak_door', false),
  oak_door_bottom: (t) => door(t, OAK_DOOR, OAK, 'oak_door', true),
  birch_door_top: (t) => door(t, BIRCH_DOOR, BIRCH, 'birch_door', false),
  birch_door_bottom: (t) => door(t, BIRCH_DOOR, BIRCH, 'birch_door', true),
  spruce_door_top: (t) => door(t, SPRUCE_DOOR, SPRUCE, 'spruce_door', false),
  spruce_door_bottom: (t) => door(t, SPRUCE_DOOR, SPRUCE, 'spruce_door', true),
  oak_trapdoor: (t) => drawPlan(t, OAK_TRAPDOOR, 0, OAK, 'oak_trapdoor'),
  birch_trapdoor: (t) => drawPlan(t, BIRCH_TRAPDOOR, 0, BIRCH, 'birch_trapdoor'),
  spruce_trapdoor: (t) => drawPlan(t, SPRUCE_TRAPDOOR, 0, SPRUCE, 'spruce_trapdoor'),
  ladder: (t) => drawPlan(t, LADDER, 0, OAK, 'ladder', true),
};
