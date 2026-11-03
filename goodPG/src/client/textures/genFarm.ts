// Generadores de la granja: tierra de cultivo (seca y húmeda), las etapas de crecimiento del trigo,
// las zanahorias, las patatas y las remolachas, y la tarta.
//
// Los cultivos son recortes anclados a la fila de abajo (se dibujan en cuatro planos en forma de #):
// tallos que crecen con la edad y, en la última etapa, lo que se cosecha (espigas doradas,
// zanahorias, patatas o remolachas asomando de la tierra).

import { Rng, Tex, N, clamp, idx, lerp, mix, scale, type Generator, type RGB } from './texCore';
import { cutoutCanvas } from './genPlants';
import { dirtBase } from './genSoil';

function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < 16 && y < 16;
}

// ---------------------------------------------------------------------------
// Tierra de cultivo
// ---------------------------------------------------------------------------

/** Tierra labrada: surcos cada 4 filas; húmeda, mucho más oscura y algo brillante. */
function farmland(t: Tex, wet: boolean): void {
  dirtBase(t);
  const r = new Rng('farmland:' + wet);
  for (let i = 0; i < N; i++) {
    const y = i >> 4;
    const furrow = y % 4 === 3;
    const ridge = y % 4 === 1;
    let c = t.getI(i);
    c = scale(c, furrow ? 0.72 : ridge ? 1.08 : 0.95);
    if (wet) c = mix(scale(c, 0.55), [52, 34, 22], 0.25);
    t.setI(i, c);
    t.height[i] = furrow ? 0.35 : ridge ? 0.95 : 0.7 + 0.1 * r.next();
    t.smooth[i] = wet ? 70 + 20 * r.next() : 14;
  }
}

// ---------------------------------------------------------------------------
// Cultivos
// ---------------------------------------------------------------------------

interface Stalk {
  x: number;
  len: number;
  lean: number;
}

/** Tallos anclados abajo; devuelve los píxeles pintados (para colocar hojas o frutos). */
function stalks(t: Tex, list: readonly Stalk[], base: RGB, tip: RGB, sss = 200): [number, number][] {
  const out: [number, number][] = [];
  for (const s of list) {
    for (let k = 0; k < s.len; k++) {
      const p = s.len > 1 ? k / (s.len - 1) : 1;
      const y = 15 - k;
      const x = Math.round(s.x + s.lean * p * p);
      if (!inBounds(x, y)) continue;
      t.paint(x, y, mix(base, tip, p), 0.6 + 0.4 * p, 50, sss);
      out.push([x, y]);
    }
  }
  return out;
}

/** Tallos repartidos por el ancho con alturas y caídas algo aleatorias. */
function stalkSet(r: Rng, xs: readonly number[], len: number, spread = 0.25): Stalk[] {
  return xs.map((x) => ({
    x,
    len: Math.max(1, Math.round(len * (1 - spread + r.next() * spread))),
    lean: (x - 7.5) * 0.18 + r.range(-0.8, 0.8),
  }));
}

/** Trigo: tallos finos que pasan de verde a dorado; espigas desde la etapa 5. */
function wheat(stage: number): Generator {
  return (t) => {
    cutoutCanvas(t, 60, 180);
    const r = t.rng();
    const p = stage / 7;
    const len = Math.round(lerp(3, 15, p));
    const green: RGB = [86, 146, 50], gold: RGB = [206, 170, 78];
    const col = mix(green, gold, clamp((stage - 3) / 4, 0, 1));
    const set = stalkSet(r, [1, 3, 5, 7, 9, 11, 13, 15], len, 0.3);
    stalks(t, set, scale(col, 0.7), col);
    if (stage >= 5) {
      // Espigas: 3–4 píxeles gruesos en la punta, con granos marcados.
      const head: RGB = stage === 7 ? [226, 192, 98] : [168, 170, 84];
      for (const s of set) {
        const top = 15 - (s.len - 1);
        const x = Math.round(s.x + s.lean);
        for (let k = 0; k < 4; k++) {
          const y = top + k;
          if (!inBounds(x, y)) continue;
          t.paint(x, y, k % 2 ? scale(head, 0.82) : head, 1, 60, 120);
          if (k % 2 === 0 && inBounds(x + 1, y) && r.chance(0.6)) t.paint(x + 1, y, scale(head, 0.9), 0.95, 60, 120);
        }
      }
    }
  };
}

/** Hojas en abanico: pequeños grupos alrededor de la punta de cada tallo. */
function leafTufts(t: Tex, r: Rng, set: readonly Stalk[], leaf: RGB, dark: RGB, size: number): void {
  for (const s of set) {
    const tx = Math.round(s.x + s.lean), ty = 15 - (s.len - 1);
    for (let k = 0; k < size * 3; k++) {
      const x = tx + Math.round(r.range(-size, size));
      const y = ty + Math.round(r.range(-1, size));
      if (!inBounds(x, y) || y > 15) continue;
      t.paint(x, y, r.chance(0.35) ? dark : leaf, 0.85, 45, 220);
    }
  }
}

/** Raíz o tubérculo asomando: un bloque de 2–3 píxeles con brillo arriba. */
function root(t: Tex, x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!inBounds(x + i, y + j)) continue;
      const shade = j === 0 ? 1.12 : j === h - 1 ? 0.78 : 1;
      t.paint(x + i, y + j, scale(c, shade), 1, 40, 60);
    }
  }
}

function carrots(stage: number): Generator {
  return (t) => {
    cutoutCanvas(t, 55, 200);
    const r = t.rng();
    const len = [3, 5, 8, 10][stage];
    const set = stalkSet(r, [2, 5, 8, 11, 14], len, 0.35);
    stalks(t, set, [70, 128, 44], [104, 168, 60]);
    leafTufts(t, r, set, [96, 160, 56], [64, 118, 40], stage < 2 ? 1 : 2);
    if (stage === 3) for (const x of [1, 7, 12]) root(t, x, 13, 2, 3, [232, 124, 30]);
  };
}

function potatoes(stage: number): Generator {
  return (t) => {
    cutoutCanvas(t, 50, 200);
    const r = t.rng();
    const len = [3, 5, 7, 9][stage];
    const set = stalkSet(r, [2, 6, 10, 13], len, 0.3);
    stalks(t, set, [62, 112, 44], [84, 140, 54]);
    leafTufts(t, r, set, [78, 138, 52], [52, 100, 36], stage < 2 ? 1 : 3);
    if (stage === 3) {
      root(t, 1, 13, 3, 3, [196, 160, 96]);
      root(t, 8, 14, 3, 2, [184, 148, 88]);
      root(t, 12, 13, 2, 3, [204, 168, 102]);
    }
  };
}

function beetroots(stage: number): Generator {
  return (t) => {
    cutoutCanvas(t, 55, 200);
    const r = t.rng();
    const len = [3, 5, 8, 10][stage];
    const set = stalkSet(r, [3, 7, 11, 14], len, 0.3);
    // Tallos rojizos con hojas verdes de nervio rojo.
    stalks(t, set, [150, 40, 52], [120, 60, 50]);
    leafTufts(t, r, set, [72, 140, 58], [150, 50, 60], stage < 2 ? 1 : 2);
    if (stage === 3) {
      root(t, 2, 13, 3, 3, [150, 28, 48]);
      root(t, 9, 13, 3, 3, [136, 24, 44]);
    }
  };
}

// ---------------------------------------------------------------------------
// Tarta (el lateral sólo usa la mitad de abajo: la tarta mide 8/16)
// ---------------------------------------------------------------------------

const FROST: RGB = [246, 242, 236];
const SPONGE: RGB = [214, 164, 102];
const JAM: RGB = [196, 44, 52];

function cakeTop(t: Tex): void {
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    const edge = x === 1 || x === 14 || y === 1 || y === 14;
    t.setI(i, edge ? scale(FROST, 0.9) : scale(FROST, 0.97 + 0.03 * r.next()));
    t.height[i] = edge ? 0.8 : 1;
    t.smooth[i] = 110;
  }
  // Fideos de colores y guindas.
  for (let k = 0; k < 9; k++) {
    const x = 3 + Math.floor(r.next() * 10), y = 3 + Math.floor(r.next() * 10);
    const c: RGB = r.pick([JAM, [236, 196, 60], [90, 170, 220]] as RGB[]);
    t.paint(x, y, c, 1.05, 120);
  }
}

function cakeSide(t: Tex, inner: boolean): void {
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    const x = i & 15, y = i >> 4;
    let c: RGB;
    if (y < 8) c = SPONGE; // sin uso
    else if (y === 8 || (y === 9 && (inner || (x * 7 + 3) % 5 < 3))) c = FROST; // glaseado que gotea
    else if (y === 12) c = JAM;
    else c = scale(SPONGE, 0.94 + 0.1 * r.next());
    if (inner && y > 9 && y !== 12 && r.chance(0.12)) c = scale(SPONGE, 0.8); // miga
    t.setI(i, c);
    t.height[i] = y === 12 ? 0.8 : 1;
    t.smooth[i] = y <= 9 ? 100 : 20;
  }
}

function cakeBottom(t: Tex): void {
  const r = t.rng();
  for (let i = 0; i < N; i++) {
    t.setI(i, scale(SPONGE, 0.78 + 0.08 * r.next()));
    t.smooth[i] = 15;
  }
}

export const FARM_GENERATORS: Record<string, Generator> = {
  farmland_dry: (t) => farmland(t, false),
  farmland_wet: (t) => farmland(t, true),
  cake_top: cakeTop,
  cake_side: (t) => cakeSide(t, false),
  cake_inner: (t) => cakeSide(t, true),
  cake_bottom: cakeBottom,
};
for (let s = 0; s < 8; s++) FARM_GENERATORS[`wheat_stage${s}`] = wheat(s);
for (let s = 0; s < 4; s++) {
  FARM_GENERATORS[`carrots_stage${s}`] = carrots(s);
  FARM_GENERATORS[`potatoes_stage${s}`] = potatoes(s);
  FARM_GENERATORS[`beetroots_stage${s}`] = beetroots(s);
}
void idx;
